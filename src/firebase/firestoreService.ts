import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  getDoc,
  getDocFromServer,
  query,
  limit,
  WriteBatch
} from 'firebase/firestore';
import { Product, Supplier, AuditHistoryRecord, StoreSettings, SaleRecord, SaleItem, PurchaseInvoice, PurchaseItem, UserAccount, ActivityLogRecord } from '../types';
import { INITIAL_INVENTORY, INITIAL_SUPPLIERS } from '../data/mockData';
import { db, auth } from './config';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider: any) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ----------------- LOCAL CACHE & 1-READ SYNC STAMP HELPERS -----------------

const CACHE_KEYS = {
  INVENTORY: 'stockmaster_cached_inventory_v1',
  INVENTORY_TS: 'stockmaster_inventory_sync_ts_v1',
  SUPPLIERS: 'stockmaster_cached_suppliers_v1',
  SALES: 'stockmaster_cached_sales_v1',
  PURCHASES: 'stockmaster_cached_purchases_v1',
  AUDIT: 'stockmaster_cached_audit_v1',
  USERS: 'stockmaster_cached_users_v1',
  SEEDED: 'stockmaster_seeded_v1',
};

function safeReadCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeWriteCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn(`Could not write cache for ${key}:`, err);
  }
}

export function getCachedInventory(): Product[] | null {
  return safeReadCache<Product[]>(CACHE_KEYS.INVENTORY);
}

export function setCachedInventory(items: Product[], syncTs?: number): void {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  safeWriteCache(CACHE_KEYS.INVENTORY, sorted);
  if (syncTs !== undefined) {
    try {
      localStorage.setItem(CACHE_KEYS.INVENTORY_TS, String(syncTs));
    } catch {}
  }
  if (sorted.length > 0) {
    try {
      localStorage.setItem(CACHE_KEYS.SEEDED, '1');
    } catch {}
  }
}

export function getCachedSuppliers(): Supplier[] | null {
  return safeReadCache<Supplier[]>(CACHE_KEYS.SUPPLIERS);
}

export function setCachedSuppliers(items: Supplier[]): void {
  safeWriteCache(CACHE_KEYS.SUPPLIERS, items);
}

export function getCachedSales(): SaleRecord[] | null {
  return safeReadCache<SaleRecord[]>(CACHE_KEYS.SALES);
}

export function setCachedSales(items: SaleRecord[]): void {
  safeWriteCache(CACHE_KEYS.SALES, items);
}

export function getCachedPurchases(): PurchaseInvoice[] | null {
  return safeReadCache<PurchaseInvoice[]>(CACHE_KEYS.PURCHASES);
}

export function setCachedPurchases(items: PurchaseInvoice[]): void {
  safeWriteCache(CACHE_KEYS.PURCHASES, items);
}

export function getCachedAuditHistory(): AuditHistoryRecord[] | null {
  return safeReadCache<AuditHistoryRecord[]>(CACHE_KEYS.AUDIT);
}

export function setCachedAuditHistory(items: AuditHistoryRecord[]): void {
  safeWriteCache(CACHE_KEYS.AUDIT, items);
}

export function getCachedUsers(): UserAccount[] | null {
  return safeReadCache<UserAccount[]>(CACHE_KEYS.USERS);
}

export function setCachedUsers(items: UserAccount[]): void {
  safeWriteCache(CACHE_KEYS.USERS, items);
}

/**
 * Updates the lightweight 1-document sync stamp (`settings/sync_state`) whenever
 * inventory changes, and advances the local timestamp so this device does not
 * need to re-download the inventory collection.
 */
export async function touchInventorySyncStamp(batch?: WriteBatch): Promise<number> {
  const now = Date.now();
  const syncRef = doc(db, 'settings', 'sync_state');
  try {
    localStorage.setItem(CACHE_KEYS.INVENTORY_TS, String(now));
  } catch {}

  if (batch) {
    batch.set(syncRef, { updatedAt: now }, { merge: true });
    return now;
  }

  try {
    await setDoc(syncRef, { updatedAt: now }, { merge: true });
  } catch (err) {
    console.warn('Could not update sync_state stamp:', err);
  }
  return now;
}

/**
 * Smart Inventory Reader:
 * 1. Checks `settings/sync_state` (1 Firestore document read).
 * 2. If local cache exists and its timestamp >= remote `updatedAt` (and !forceRefresh),
 *    returns the cached inventory immediately with 0 collection reads.
 * 3. Otherwise downloads `inventory` collection once, updates localStorage cache & timestamp.
 */
export async function fetchInventorySmart(
  forceRefresh = false
): Promise<{ items: Product[]; fromCache: boolean; readsUsed: number }> {
  const cached = getCachedInventory();
  const localTs = Number(localStorage.getItem(CACHE_KEYS.INVENTORY_TS) || 0);

  try {
    const syncRef = doc(db, 'settings', 'sync_state');
    const syncSnap = await getDoc(syncRef);
    const remoteTs = syncSnap.exists() ? Number(syncSnap.data()?.updatedAt || 0) : 0;

    if (!forceRefresh && cached && cached.length > 0 && remoteTs > 0 && localTs >= remoteTs) {
      return { items: cached, fromCache: true, readsUsed: 1 };
    }

    const collRef = collection(db, 'inventory');
    const snapshot = await getDocs(collRef);
    const items: Product[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      items.push({
        id: docSnap.id,
        code: data.code || docSnap.id,
        name: data.name || '',
        category: data.category || 'Otros',
        size: data.size || '',
        supplier: data.supplier || '',
        cost: Number(data.cost) || 0,
        price: Number(data.price) || 0,
        stock: Number(data.stock) || 0,
        img: data.img || '',
      });
    });

    items.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    const effectiveTs = remoteTs > 0 ? remoteTs : Date.now();
    setCachedInventory(items, effectiveTs);

    // Initialize sync_state stamp if it did not exist yet
    if (remoteTs === 0 && items.length > 0) {
      await setDoc(syncRef, { updatedAt: effectiveTs }, { merge: true }).catch(() => {});
    }

    return { items, fromCache: false, readsUsed: items.length + 1 };
  } catch (error) {
    if (cached && cached.length > 0) {
      console.warn('Using cached inventory due to connection issue:', error);
      return { items: cached, fromCache: true, readsUsed: 0 };
    }
    handleFirestoreError(error, OperationType.GET, 'inventory');
  }
}

// ----------------- REAL-TIME INVENTORY -----------------

export function subscribeToInventory(
  onData: (items: Product[]) => void,
  onError?: (err: any) => void
) {
  const collRef = collection(db, 'inventory');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          code: data.code || docSnap.id,
          name: data.name || '',
          category: data.category || 'Otros',
          size: data.size || '',
          supplier: data.supplier || '',
          cost: Number(data.cost) || 0,
          price: Number(data.price) || 0,
          stock: Number(data.stock) || 0,
          img: data.img || '',
        });
      });
      // Sort alphabetically for stable UI rendering
      items.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
      setCachedInventory(items);
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'inventory');
    }
  );
}

export async function saveProductToFirestore(product: Product, oldCode?: string): Promise<void> {
  const docId = product.code.trim().replace(/\//g, '_');
  const path = `inventory/${docId}`;
  try {
    const batch = writeBatch(db);

    // If the product code changed, remove previous document to prevent duplicates
    if (oldCode && oldCode.trim() !== product.code.trim()) {
      const oldDocId = oldCode.trim().replace(/\//g, '_');
      batch.delete(doc(db, 'inventory', oldDocId));
    }

    const docRef = doc(db, 'inventory', docId);
    const payload: Record<string, any> = {
      code: product.code.trim(),
      name: product.name.trim(),
      category: product.category || 'Otros',
      cost: Number(product.cost) || 0,
      price: Number(product.price) || 0,
      stock: Math.max(0, Math.round(Number(product.stock) || 0)),
    };

    if (product.size?.trim()) payload.size = product.size.trim();
    if (product.supplier?.trim()) payload.supplier = product.supplier.trim();
    if (product.img?.trim()) payload.img = product.img.trim();

    batch.set(docRef, payload, { merge: true });
    await touchInventorySyncStamp(batch);
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProductFromFirestore(id: string, code?: string): Promise<void> {
  const idsToDelete = new Set<string>();
  if (id) idsToDelete.add(id.trim());
  if (id) idsToDelete.add(id.trim().replace(/\//g, '_'));
  if (code) idsToDelete.add(code.trim());
  if (code) idsToDelete.add(code.trim().replace(/\//g, '_'));

  const batch = writeBatch(db);
  for (const docId of idsToDelete) {
    batch.delete(doc(db, 'inventory', docId));
  }
  await touchInventorySyncStamp(batch);
  try {
    await batch.commit();
  } catch (error) {
    console.warn('Could not delete product doc in batch:', error);
  }
}

export async function bulkSaveProductsToFirestore(
  products: Product[],
  newSuppliers: Supplier[] = []
): Promise<void> {
  if (products.length === 0 && newSuppliers.length === 0) return;

  const CHUNK_SIZE = 400;
  try {
    // 1. Save any new suppliers discovered in the Excel upload
    if (newSuppliers.length > 0) {
      for (let i = 0; i < newSuppliers.length; i += CHUNK_SIZE) {
        const chunk = newSuppliers.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((sup) => {
          const docId = (sup.id || sup.name || Date.now().toString()).trim().replace(/\//g, '_');
          const supRef = doc(db, 'suppliers', docId);
          batch.set(
            supRef,
            {
              name: sup.name.trim(),
              contact: sup.contact?.trim() || '',
              phone: sup.phone?.trim() || '',
              email: sup.email?.trim() || '',
              address: sup.address?.trim() || '',
            },
            { merge: true }
          );
        });
        await batch.commit();
      }
    }

    // 2. Save products in chunks of 400 to respect Firestore 500-op batch limit
    for (let i = 0; i < products.length; i += CHUNK_SIZE) {
      const chunk = products.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((product) => {
        const docId = product.code.trim().replace(/\//g, '_');
        if (!docId) return;
        const docRef = doc(db, 'inventory', docId);
        const payload: Record<string, any> = {
          code: product.code.trim(),
          name: product.name.trim(),
          category: (product.category || 'General').trim(),
          cost: Math.max(0, Number(product.cost) || 0),
          price: Math.max(0, Number(product.price) || 0),
          stock: Math.max(0, Math.round(Number(product.stock) || 0)),
        };

        if (product.size !== undefined) payload.size = product.size.trim();
        if (product.supplier !== undefined) payload.supplier = product.supplier.trim();
        if (product.img?.trim()) payload.img = product.img.trim();

        batch.set(docRef, payload, { merge: true });
      });

      // Touch sync stamp on the final chunk
      if (i + CHUNK_SIZE >= products.length) {
        await touchInventorySyncStamp(batch);
      }

      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'batch:inventory/bulk_import');
  }
}

// ----------------- SUPPLIERS (ON-DEMAND & REAL-TIME) -----------------

export async function fetchSuppliersOnce(forceRefresh = false): Promise<Supplier[]> {
  const cached = getCachedSuppliers();
  if (!forceRefresh && cached && cached.length > 0) {
    return cached;
  }
  try {
    const snapshot = await getDocs(collection(db, 'suppliers'));
    const suppliers: Supplier[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      suppliers.push({
        id: docSnap.id,
        name: data.name || '',
        contact: data.contact || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
      });
    });
    suppliers.sort((a, b) => a.name.localeCompare(b.name));
    setCachedSuppliers(suppliers);
    return suppliers;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'suppliers');
  }
}

export function subscribeToSuppliers(
  onData: (suppliers: Supplier[]) => void,
  onError?: (err: any) => void
) {
  const collRef = collection(db, 'suppliers');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const suppliers: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        suppliers.push({
          id: docSnap.id,
          name: data.name || '',
          contact: data.contact || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
        });
      });
      suppliers.sort((a, b) => a.name.localeCompare(b.name));
      setCachedSuppliers(suppliers);
      onData(suppliers);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'suppliers');
    }
  );
}

export async function saveSupplierToFirestore(
  supplier: Supplier,
  oldName?: string,
  inventoryItems?: Product[]
): Promise<void> {
  const docId = supplier.id ? supplier.id.replace(/\//g, '_') : Date.now().toString();
  const path = `suppliers/${docId}`;
  try {
    const docRef = doc(db, 'suppliers', docId);
    const payload: Record<string, any> = {
      name: supplier.name.trim(),
    };
    if (supplier.contact?.trim()) payload.contact = supplier.contact.trim();
    if (supplier.phone?.trim()) payload.phone = supplier.phone.trim();
    if (supplier.email?.trim()) payload.email = supplier.email.trim();
    if (supplier.address?.trim()) payload.address = supplier.address.trim();

    await setDoc(docRef, payload, { merge: true });

    // Cascade name update if name changed
    if (oldName && oldName !== supplier.name && inventoryItems && inventoryItems.length > 0) {
      const batch = writeBatch(db);
      let count = 0;
      inventoryItems.forEach((item) => {
        if (item.supplier === oldName) {
          const itemDocId = item.code.trim().replace(/\//g, '_');
          const itemRef = doc(db, 'inventory', itemDocId);
          batch.update(itemRef, { supplier: supplier.name.trim() });
          count++;
        }
      });
      if (count > 0) {
        await touchInventorySyncStamp(batch);
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSupplierFromFirestore(id: string, name?: string): Promise<void> {
  const idsToDelete = new Set<string>();
  if (id) idsToDelete.add(id.trim());
  if (id) idsToDelete.add(id.trim().replace(/\//g, '_'));
  if (name) idsToDelete.add(name.trim());
  if (name) idsToDelete.add(name.trim().replace(/\//g, '_'));

  for (const docId of idsToDelete) {
    try {
      await deleteDoc(doc(db, 'suppliers', docId));
    } catch (error) {
      console.warn(`Could not delete supplier doc ${docId}:`, error);
    }
  }
}

// ----------------- AUDIT HISTORY & ATOMIC COMMIT -----------------

export async function fetchAuditHistoryOnce(forceRefresh = false): Promise<AuditHistoryRecord[]> {
  const cached = getCachedAuditHistory();
  if (!forceRefresh && cached && cached.length > 0) {
    return cached;
  }
  try {
    const snapshot = await getDocs(collection(db, 'audit_history'));
    const records: AuditHistoryRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({
        id: docSnap.id,
        date: data.date || '',
        timestamp: Number(data.timestamp) || Date.now(),
        match: Number(data.match) || 0,
        missing: Number(data.missing) || 0,
        extra: Number(data.extra) || 0,
        netImpact: Number(data.netImpact) || 0,
        totalItems: Number(data.totalItems) || 0,
        scope: data.scope || undefined,
      });
    });
    records.sort((a, b) => a.timestamp - b.timestamp);
    setCachedAuditHistory(records);
    return records;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'audit_history');
  }
}

export function subscribeToAuditHistory(
  onData: (records: AuditHistoryRecord[]) => void,
  onError?: (err: any) => void
) {
  const collRef = collection(db, 'audit_history');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: AuditHistoryRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        records.push({
          id: docSnap.id,
          date: data.date || '',
          timestamp: Number(data.timestamp) || Date.now(),
          match: Number(data.match) || 0,
          missing: Number(data.missing) || 0,
          extra: Number(data.extra) || 0,
          netImpact: Number(data.netImpact) || 0,
          totalItems: Number(data.totalItems) || 0,
        });
      });
      // Sort chronologically ascending
      records.sort((a, b) => a.timestamp - b.timestamp);
      setCachedAuditHistory(records);
      onData(records);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'audit_history');
    }
  );
}

export async function applyAuditChangesToFirestore(
  updatedInventory: Product[],
  historyRecord: AuditHistoryRecord,
  auditedCodes?: string[]
): Promise<void> {
  const batch = writeBatch(db);
  const auditId = Date.now().toString();

  try {
    // 1. Update stock of inventory items - ONLY update products that were part of the audit!
    const productsToUpdate =
      auditedCodes && auditedCodes.length > 0
        ? updatedInventory.filter((p) => auditedCodes.includes(p.code))
        : updatedInventory;

    productsToUpdate.forEach((product) => {
      const docId = product.code.trim().replace(/\//g, '_');
      const itemRef = doc(db, 'inventory', docId);
      batch.update(itemRef, { stock: Math.max(0, Math.round(Number(product.stock) || 0)) });
    });

    // 2. Record audit log
    const auditRef = doc(db, 'audit_history', auditId);
    const auditData: any = {
      date: historyRecord.date,
      timestamp: historyRecord.timestamp,
      match: historyRecord.match,
      missing: historyRecord.missing,
      extra: historyRecord.extra,
      netImpact: Number(historyRecord.netImpact) || 0,
      totalItems: historyRecord.totalItems,
    };
    if (historyRecord.scope) {
      auditData.scope = historyRecord.scope;
    }

    batch.set(auditRef, auditData);
    await touchInventorySyncStamp(batch);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `batch:audit/${auditId}`);
  }
}

// ----------------- SEED INITIAL DATA IF EMPTY (OPTIMIZED: MAX 1 READ) -----------------

export async function seedInitialDataIfEmpty(): Promise<boolean> {
  try {
    // Skip completely (0 reads) if we already know the database has been seeded or cached
    if (localStorage.getItem(CACHE_KEYS.SEEDED) === '1') {
      return false;
    }
    const cachedInv = getCachedInventory();
    if (cachedInv && cachedInv.length > 0) {
      localStorage.setItem(CACHE_KEYS.SEEDED, '1');
      return false;
    }

    // Check only 1 document instead of downloading the entire collection
    const invSnap = await getDocs(query(collection(db, 'inventory'), limit(1)));
    if (invSnap.empty) {
      console.log('Seeding initial products to Firestore...');
      const batch = writeBatch(db);

      INITIAL_INVENTORY.forEach((item) => {
        const docId = item.code.trim().replace(/\//g, '_');
        const docRef = doc(db, 'inventory', docId);
        const payload: Record<string, any> = {
          code: item.code,
          name: item.name,
          category: item.category,
          cost: item.cost,
          price: item.price,
          stock: item.stock,
        };
        if (item.size) payload.size = item.size;
        if (item.supplier) payload.supplier = item.supplier;
        if (item.img) payload.img = item.img;
        batch.set(docRef, payload);
      });

      INITIAL_SUPPLIERS.forEach((sup) => {
        const docRef = doc(db, 'suppliers', sup.id);
        batch.set(docRef, {
          name: sup.name,
          contact: sup.contact || '',
          phone: sup.phone || '',
          email: sup.email || '',
          address: sup.address || '',
        });
      });

      await touchInventorySyncStamp(batch);
      await batch.commit();
      localStorage.setItem(CACHE_KEYS.SEEDED, '1');
      console.log('Successfully seeded initial inventory and suppliers to Firestore.');
      return true;
    }

    localStorage.setItem(CACHE_KEYS.SEEDED, '1');
    return false;
  } catch (err) {
    console.warn('Initial seeding check skipped or failed:', err);
    return false;
  }
}

// ----------------- PING / HEALTH CHECK -----------------

export async function pingFirestore(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const testDocRef = doc(db, 'test', 'connection');
    await setDoc(testDocRef, { ping: Date.now() }, { merge: true });
    await getDocFromServer(testDocRef);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return { ok: false, latencyMs: Date.now() - start, error: err?.message || String(err) };
  }
}

// ----------------- STORE BRANDING & PROFILE SETTINGS -----------------

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  storeName: 'Tienda Gosén',
  tagline: 'Control de Inventario y Ventas',
  logoUrl: '/store-logo.jpg',
  phone: '',
  address: '',
  accessPassword: 'GOSEN2026',
};

export async function fetchStoreSettingsOnce(): Promise<StoreSettings> {
  try {
    const docRef = doc(db, 'settings', 'store_profile');
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      const settings: StoreSettings = {
        storeName: data.storeName || 'Tienda Gosén',
        tagline: data.tagline || 'Control de Inventario y Ventas',
        logoUrl: data.logoUrl || '/store-logo.jpg',
        phone: data.phone || '',
        address: data.address || '',
        accessPassword: data.accessPassword || 'GOSEN2026',
        whatsappOrderPhone: data.whatsappOrderPhone || '',
        catalogWelcomeMsg: data.catalogWelcomeMsg || '',
        updatedAt: Number(data.updatedAt) || Date.now(),
      };
      try {
        localStorage.setItem('stockmaster_store_settings', JSON.stringify(settings));
      } catch {}
      return settings;
    }
    return DEFAULT_STORE_SETTINGS;
  } catch (error) {
    try {
      const cached = localStorage.getItem('stockmaster_store_settings');
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_STORE_SETTINGS;
  }
}

export function subscribeToStoreSettings(
  onData: (settings: StoreSettings) => void,
  onError?: (err: any) => void
) {
  const docRef = doc(db, 'settings', 'store_profile');
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        onData({
          storeName: data.storeName || 'Tienda Gosén',
          tagline: data.tagline || 'Control de Inventario y Ventas',
          logoUrl: data.logoUrl || '/store-logo.jpg',
          phone: data.phone || '',
          address: data.address || '',
          accessPassword: data.accessPassword || 'GOSEN2026',
          whatsappOrderPhone: data.whatsappOrderPhone || '',
          catalogWelcomeMsg: data.catalogWelcomeMsg || '',
          updatedAt: Number(data.updatedAt) || Date.now(),
        });
      } else {
        // Return defaults if not configured yet
        onData(DEFAULT_STORE_SETTINGS);
      }
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'settings/store_profile');
    }
  );
}

export async function saveStoreSettingsToFirestore(settings: StoreSettings): Promise<void> {
  const docRef = doc(db, 'settings', 'store_profile');
  const payload: any = {
    storeName: settings.storeName.trim() || 'StockMaster',
    tagline: settings.tagline?.trim() || '',
    logoUrl: settings.logoUrl?.trim() || '',
    phone: settings.phone?.trim() || '',
    address: settings.address?.trim() || '',
    accessPassword: settings.accessPassword?.trim() || 'GOSEN2026',
    whatsappOrderPhone: settings.whatsappOrderPhone?.trim() || '',
    catalogWelcomeMsg: settings.catalogWelcomeMsg?.trim() || '',
    updatedAt: Date.now(),
  };

  try {
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/store_profile');
  }
}

// ----------------- SALES & POS OPERATIONS -----------------

export async function fetchSalesOnce(forceRefresh = false): Promise<SaleRecord[]> {
  const cached = getCachedSales();
  if (!forceRefresh && cached && cached.length > 0) {
    return cached;
  }
  try {
    const snapshot = await getDocs(collection(db, 'sales'));
    const records: SaleRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({
        id: docSnap.id,
        saleNumber: data.saleNumber || `VTA-${docSnap.id.slice(-6)}`,
        timestamp: Number(data.timestamp) || Date.now(),
        date: data.date || '',
        items: Array.isArray(data.items)
          ? data.items.map((it: any) => ({
              productId: it.productId || '',
              code: it.code || '',
              name: it.name || '',
              category: it.category || '',
              size: it.size || '',
              price: Number(it.price) || 0,
              cost: Number(it.cost) || 0,
              quantity: Number(it.quantity) || 1,
              subtotal: Number(it.subtotal) || 0,
            }))
          : [],
        totalItems: Number(data.totalItems) || 0,
        subtotal: Number(data.subtotal) || 0,
        discount: Number(data.discount) || 0,
        tax: Number(data.tax) || 0,
        total: Number(data.total) || 0,
        paymentMethod: data.paymentMethod || 'cash',
        amountPaid: Number(data.amountPaid) || 0,
        change: Number(data.change) || 0,
        customerName: data.customerName || 'Consumidor Final',
        customerPhone: data.customerPhone || '',
        customerRtn: data.customerRtn || '',
        notes: data.notes || '',
        status: data.status === 'cancelled' ? 'cancelled' : 'completed',
        cashier: data.cashier || 'Administrador',
        cashierRole:
          data.cashierRole === 'admin' || data.cashierRole === 'collaborator'
            ? data.cashierRole
            : undefined,
      });
    });
    records.sort((a, b) => b.timestamp - a.timestamp);
    setCachedSales(records);
    return records;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'sales');
  }
}

export function subscribeToSales(
  onData: (sales: SaleRecord[]) => void,
  onError?: (err: any) => void
) {
  const collRef = collection(db, 'sales');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: SaleRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        records.push({
          id: docSnap.id,
          saleNumber: data.saleNumber || `VTA-${docSnap.id.slice(-6)}`,
          timestamp: Number(data.timestamp) || Date.now(),
          date: data.date || '',
          items: Array.isArray(data.items)
            ? data.items.map((it: any) => ({
                productId: it.productId || '',
                code: it.code || '',
                name: it.name || '',
                category: it.category || '',
                size: it.size || '',
                price: Number(it.price) || 0,
                cost: Number(it.cost) || 0,
                quantity: Number(it.quantity) || 1,
                subtotal: Number(it.subtotal) || 0,
              }))
            : [],
          totalItems: Number(data.totalItems) || 0,
          subtotal: Number(data.subtotal) || 0,
          discount: Number(data.discount) || 0,
          tax: Number(data.tax) || 0,
          total: Number(data.total) || 0,
          paymentMethod: data.paymentMethod || 'cash',
          amountPaid: Number(data.amountPaid) || 0,
          change: Number(data.change) || 0,
          customerName: data.customerName || 'Consumidor Final',
          customerPhone: data.customerPhone || '',
          customerRtn: data.customerRtn || '',
          notes: data.notes || '',
          status: data.status === 'cancelled' ? 'cancelled' : 'completed',
          cashier: data.cashier || 'Administrador',
          cashierRole:
            data.cashierRole === 'admin' || data.cashierRole === 'collaborator'
              ? data.cashierRole
              : undefined,
        });
      });
      // Sort newest first
      records.sort((a, b) => b.timestamp - a.timestamp);
      setCachedSales(records);
      onData(records);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'sales');
    }
  );
}

export async function recordSaleInFirestore(
  saleData: Omit<SaleRecord, 'id'>,
  currentInventory: Product[]
): Promise<SaleRecord> {
  const batch = writeBatch(db);
  const saleId = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const saleRef = doc(db, 'sales', saleId);

  try {
    // 1. Deduct quantity sold from current stock of each inventory item
    for (const item of saleData.items) {
      const sanitizedCode = item.code.trim().replace(/\//g, '_');
      const productRef = doc(db, 'inventory', sanitizedCode);
      
      const currentProd = currentInventory.find(
        (p) => p.code.trim() === item.code.trim() || p.id === item.productId
      );
      const currentStock = currentProd ? Number(currentProd.stock) || 0 : 0;
      const newStock = Math.max(0, currentStock - (Number(item.quantity) || 1));

      batch.update(productRef, { stock: newStock });
    }

    // 2. Record sale document
    const payload: any = {
      saleNumber: saleData.saleNumber || `VTA-${Date.now().toString().slice(-6)}`,
      timestamp: saleData.timestamp || Date.now(),
      date: saleData.date || new Date().toLocaleString(),
      items: saleData.items.map((it) => ({
        productId: it.productId || '',
        code: it.code.trim(),
        name: it.name.trim(),
        category: (it.category || '').trim(),
        size: (it.size || '').trim(),
        price: Number(it.price) || 0,
        cost: Number(it.cost) || 0,
        quantity: Number(it.quantity) || 1,
        subtotal: Number(it.subtotal) || 0,
      })),
      totalItems: Number(saleData.totalItems) || 0,
      subtotal: Number(saleData.subtotal) || 0,
      discount: Number(saleData.discount) || 0,
      tax: Number(saleData.tax) || 0,
      total: Number(saleData.total) || 0,
      paymentMethod: saleData.paymentMethod || 'cash',
      amountPaid: Number(saleData.amountPaid) || 0,
      change: Number(saleData.change) || 0,
      customerName: (saleData.customerName || 'Consumidor Final').trim(),
      customerPhone: (saleData.customerPhone || '').trim(),
      customerRtn: (saleData.customerRtn || '').trim(),
      notes: (saleData.notes || '').trim(),
      status: 'completed',
      cashier: (saleData.cashier || 'Administrador').trim(),
      cashierRole:
        saleData.cashierRole === 'admin' || saleData.cashierRole === 'collaborator'
          ? saleData.cashierRole
          : (saleData.cashier || '').toLowerCase().includes('admin')
          ? 'admin'
          : 'collaborator',
    };

    batch.set(saleRef, payload);
    await touchInventorySyncStamp(batch);

    await batch.commit();

    return {
      id: saleId,
      ...payload,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sales/${saleId}`);
  }
}

export async function cancelSaleInFirestore(
  sale: SaleRecord,
  currentInventory: Product[]
): Promise<void> {
  const batch = writeBatch(db);
  const saleRef = doc(db, 'sales', sale.id);

  try {
    // 1. Restore stock for each product in the cancelled sale
    for (const item of sale.items) {
      const sanitizedCode = item.code.trim().replace(/\//g, '_');
      const productRef = doc(db, 'inventory', sanitizedCode);
      
      const currentProd = currentInventory.find(
        (p) => p.code.trim() === item.code.trim() || p.id === item.productId
      );
      const currentStock = currentProd ? Number(currentProd.stock) || 0 : 0;
      const restoredStock = currentStock + (Number(item.quantity) || 1);

      batch.update(productRef, { stock: restoredStock });
    }

    // 2. Mark sale as cancelled
    batch.update(saleRef, { status: 'cancelled' });
    await touchInventorySyncStamp(batch);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
  }
}

export async function deleteSaleFromFirestore(saleId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'sales', saleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `sales/${saleId}`);
  }
}

// ----------------- PURCHASES / FACTURAS DE COMPRA -----------------

export async function fetchPurchasesOnce(forceRefresh = false): Promise<PurchaseInvoice[]> {
  const cached = getCachedPurchases();
  if (!forceRefresh && cached && cached.length > 0) {
    return cached;
  }
  try {
    const snapshot = await getDocs(collection(db, 'purchases'));
    const records: PurchaseInvoice[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({
        id: docSnap.id,
        invoiceNumber: data.invoiceNumber || `FAC-${docSnap.id.slice(-6)}`,
        supplierId: data.supplierId || '',
        supplierName: data.supplierName || 'Proveedor',
        date: data.date || '',
        timestamp: Number(data.timestamp) || Date.now(),
        paymentCondition: data.paymentCondition === 'credit' ? 'credit' : 'cash',
        dueDate: data.dueDate || '',
        items: Array.isArray(data.items)
          ? data.items.map((it: any) => ({
              productId: it.productId || '',
              code: it.code || '',
              name: it.name || '',
              category: it.category || '',
              size: it.size || '',
              cost: Number(it.cost) || 0,
              salePrice: it.salePrice ? Number(it.salePrice) : undefined,
              quantity: Number(it.quantity) || 1,
              subtotal: Number(it.subtotal) || 0,
            }))
          : [],
        totalItems: Number(data.totalItems) || 0,
        subtotal: Number(data.subtotal) || 0,
        tax: Number(data.tax) || 0,
        discount: Number(data.discount) || 0,
        total: Number(data.total) || 0,
        notes: data.notes || '',
        status: data.status === 'cancelled' ? 'cancelled' : 'completed',
        receivedBy: data.receivedBy || 'Administrador',
      });
    });
    records.sort((a, b) => b.timestamp - a.timestamp);
    setCachedPurchases(records);
    return records;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'purchases');
  }
}

export function subscribeToPurchases(
  onData: (purchases: PurchaseInvoice[]) => void,
  onError?: (err: any) => void
) {
  const collRef = collection(db, 'purchases');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: PurchaseInvoice[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        records.push({
          id: docSnap.id,
          invoiceNumber: data.invoiceNumber || `FAC-${docSnap.id.slice(-6)}`,
          supplierId: data.supplierId || '',
          supplierName: data.supplierName || 'Proveedor',
          date: data.date || '',
          timestamp: Number(data.timestamp) || Date.now(),
          paymentCondition: data.paymentCondition === 'credit' ? 'credit' : 'cash',
          dueDate: data.dueDate || '',
          items: Array.isArray(data.items)
            ? data.items.map((it: any) => ({
                productId: it.productId || '',
                code: it.code || '',
                name: it.name || '',
                category: it.category || '',
                size: it.size || '',
                cost: Number(it.cost) || 0,
                salePrice: it.salePrice ? Number(it.salePrice) : undefined,
                quantity: Number(it.quantity) || 1,
                subtotal: Number(it.subtotal) || 0,
              }))
            : [],
          totalItems: Number(data.totalItems) || 0,
          subtotal: Number(data.subtotal) || 0,
          tax: Number(data.tax) || 0,
          discount: Number(data.discount) || 0,
          total: Number(data.total) || 0,
          notes: data.notes || '',
          status: data.status === 'cancelled' ? 'cancelled' : 'completed',
          receivedBy: data.receivedBy || 'Administrador',
        });
      });
      // Sort newest first
      records.sort((a, b) => b.timestamp - a.timestamp);
      setCachedPurchases(records);
      onData(records);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'purchases');
    }
  );
}

export async function recordPurchaseInFirestore(
  purchaseData: Omit<PurchaseInvoice, 'id'>,
  currentInventory: Product[]
): Promise<PurchaseInvoice> {
  const batch = writeBatch(db);
  const purchaseId = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const purchaseRef = doc(db, 'purchases', purchaseId);

  try {
    // 1. Increase current stock and update cost/price for each purchased item
    for (const item of purchaseData.items) {
      const sanitizedCode = item.code.trim().replace(/\//g, '_');
      const productRef = doc(db, 'inventory', sanitizedCode);

      const existing = currentInventory.find(
        (p) => p.code.trim().toLowerCase() === item.code.trim().toLowerCase() || p.id === item.productId
      );

      if (existing) {
        const currentStock = Number(existing.stock) || 0;
        const newStock = currentStock + (Number(item.quantity) || 0);

        const updatePayload: Record<string, any> = {
          stock: newStock,
          cost: Number(item.cost) || existing.cost,
        };

        if (item.salePrice && item.salePrice > 0) {
          updatePayload.price = Number(item.salePrice);
        }

        // Keep supplier name synced if present
        if (purchaseData.supplierName && !existing.supplier) {
          updatePayload.supplier = purchaseData.supplierName;
        }

        batch.update(productRef, updatePayload);
      } else {
        // If product does not exist yet in inventory, auto-create it
        const newProductPayload: Record<string, any> = {
          code: item.code.trim(),
          name: item.name.trim(),
          category: item.category?.trim() || 'General',
          size: item.size?.trim() || '',
          supplier: purchaseData.supplierName.trim(),
          cost: Number(item.cost) || 0,
          price: item.salePrice && item.salePrice > 0 ? Number(item.salePrice) : (Number(item.cost) || 0) * 1.35,
          stock: Number(item.quantity) || 0,
          img: '',
        };

        batch.set(productRef, newProductPayload);
      }
    }

    // 2. Save purchase invoice document
    const invoicePayload: any = {
      invoiceNumber: purchaseData.invoiceNumber.trim(),
      supplierId: purchaseData.supplierId.trim(),
      supplierName: purchaseData.supplierName.trim(),
      date: purchaseData.date.trim(),
      timestamp: purchaseData.timestamp || Date.now(),
      paymentCondition: purchaseData.paymentCondition || 'cash',
      dueDate: (purchaseData.dueDate || '').trim(),
      items: purchaseData.items.map((it) => ({
        productId: it.productId || '',
        code: it.code.trim(),
        name: it.name.trim(),
        category: (it.category || '').trim(),
        size: (it.size || '').trim(),
        cost: Number(it.cost) || 0,
        salePrice: it.salePrice ? Number(it.salePrice) : null,
        quantity: Number(it.quantity) || 1,
        subtotal: Number(it.subtotal) || 0,
      })),
      totalItems: Number(purchaseData.totalItems) || 0,
      subtotal: Number(purchaseData.subtotal) || 0,
      tax: Number(purchaseData.tax) || 0,
      discount: Number(purchaseData.discount) || 0,
      total: Number(purchaseData.total) || 0,
      notes: (purchaseData.notes || '').trim(),
      status: 'completed',
      receivedBy: (purchaseData.receivedBy || 'Administrador').trim(),
    };

    batch.set(purchaseRef, invoicePayload);
    await touchInventorySyncStamp(batch);

    await batch.commit();

    return {
      id: purchaseId,
      ...invoicePayload,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `purchases/${purchaseId}`);
  }
}

export async function cancelPurchaseInFirestore(
  purchase: PurchaseInvoice,
  currentInventory: Product[]
): Promise<void> {
  const batch = writeBatch(db);
  const purchaseRef = doc(db, 'purchases', purchase.id);

  try {
    // 1. Subtract the entered stock back from inventory
    for (const item of purchase.items) {
      const sanitizedCode = item.code.trim().replace(/\//g, '_');
      const productRef = doc(db, 'inventory', sanitizedCode);

      const existing = currentInventory.find(
        (p) => p.code.trim().toLowerCase() === item.code.trim().toLowerCase() || p.id === item.productId
      );

      const currentStock = existing ? Number(existing.stock) || 0 : 0;
      const newStock = Math.max(0, currentStock - (Number(item.quantity) || 0));

      batch.update(productRef, { stock: newStock });
    }

    // 2. Mark invoice as cancelled
    batch.update(purchaseRef, { status: 'cancelled' });
    await touchInventorySyncStamp(batch);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `purchases/${purchase.id}`);
  }
}

export async function deletePurchaseFromFirestore(purchaseId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'purchases', purchaseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `purchases/${purchaseId}`);
  }
}

// ----------------- COLLABORATORS & USERS MANAGEMENT -----------------

export async function fetchUsersOnce(forceRefresh = false): Promise<UserAccount[]> {
  const cached = getCachedUsers();
  if (!forceRefresh && cached && cached.length > 0) {
    return cached;
  }
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const records: UserAccount[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({
        id: docSnap.id,
        name: data.name || '',
        username: data.username || '',
        password: data.password || '',
        role: data.role === 'admin' ? 'admin' : 'collaborator',
        isActive: data.isActive !== false,
        allowedTabs: Array.isArray(data.allowedTabs) ? data.allowedTabs : ['sales', 'inventory', 'price-checker'],
        createdAt: Number(data.createdAt) || Date.now(),
        lastLoginAt: data.lastLoginAt ? Number(data.lastLoginAt) : undefined,
      });
    });
    records.sort((a, b) => a.name.localeCompare(b.name));
    setCachedUsers(records);
    return records;
  } catch (error) {
    if (cached) return cached;
    console.warn('Could not fetch users:', error);
    return [];
  }
}

export function subscribeToUsers(
  onData: (users: UserAccount[]) => void,
  onError?: (err: any) => void
) {
  const collRef = collection(db, 'users');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        records.push({
          id: docSnap.id,
          name: data.name || '',
          username: data.username || '',
          password: data.password || '',
          role: data.role === 'admin' ? 'admin' : 'collaborator',
          isActive: data.isActive !== false,
          allowedTabs: Array.isArray(data.allowedTabs) ? data.allowedTabs : ['sales', 'inventory', 'price-checker'],
          createdAt: Number(data.createdAt) || Date.now(),
          lastLoginAt: data.lastLoginAt ? Number(data.lastLoginAt) : undefined,
        });
      });
      records.sort((a, b) => a.name.localeCompare(b.name));
      setCachedUsers(records);
      onData(records);
    },
    (error) => {
      console.warn('Users real-time subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function saveUserToFirestore(user: UserAccount): Promise<void> {
  const userId = user.id || `usr_${Date.now()}`;
  const docRef = doc(db, 'users', userId);
  const payload = {
    name: user.name.trim(),
    username: user.username.trim().toLowerCase(),
    password: user.password.trim(),
    role: user.role,
    isActive: user.isActive,
    allowedTabs: user.allowedTabs,
    createdAt: user.createdAt || Date.now(),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
  };
  try {
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

export async function deleteUserFromFirestore(userId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'users', userId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

// ----------------- ACTIVITY LOGS & MOVEMENT AUDIT TRAIL -----------------

export async function fetchActivityLogsOnce(): Promise<ActivityLogRecord[]> {
  try {
    const snapshot = await getDocs(query(collection(db, 'activity_logs'), limit(150)));
    const records: ActivityLogRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      records.push({
        id: docSnap.id,
        timestamp: Number(data.timestamp) || Date.now(),
        date: data.date || new Date().toLocaleString('es-HN'),
        userName: data.userName || 'Usuario',
        userRole: data.userRole === 'admin' ? 'admin' : 'collaborator',
        action: data.action || '',
        module: data.module || 'sales',
        details: data.details || '',
      });
    });
    records.sort((a, b) => b.timestamp - a.timestamp);
    return records;
  } catch (error) {
    console.warn('Could not fetch activity logs:', error);
    return [];
  }
}

export function subscribeToActivityLogs(
  onData: (logs: ActivityLogRecord[]) => void,
  onError?: (err: any) => void
) {
  const collRef = collection(db, 'activity_logs');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: ActivityLogRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        records.push({
          id: docSnap.id,
          timestamp: Number(data.timestamp) || Date.now(),
          date: data.date || new Date().toLocaleString('es-HN'),
          userName: data.userName || 'Usuario',
          userRole: data.userRole === 'admin' ? 'admin' : 'collaborator',
          action: data.action || '',
          module: data.module || 'sales',
          details: data.details || '',
        });
      });
      // Sort newest first
      records.sort((a, b) => b.timestamp - a.timestamp);
      onData(records);
    },
    (error) => {
      console.warn('Activity logs real-time subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function logActivityInFirestore(
  log: Omit<ActivityLogRecord, 'id' | 'timestamp' | 'date'>
): Promise<void> {
  const logId = `act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const docRef = doc(db, 'activity_logs', logId);
  const now = new Date();
  const payload = {
    timestamp: now.getTime(),
    date: now.toLocaleString('es-HN', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
    userName: log.userName || 'Sistema',
    userRole: log.userRole || 'admin',
    action: log.action || '',
    module: log.module || 'sales',
    details: log.details || '',
  };
  try {
    await setDoc(docRef, payload);
  } catch (error) {
    console.warn('Could not record activity log in Firestore:', error);
  }
}


