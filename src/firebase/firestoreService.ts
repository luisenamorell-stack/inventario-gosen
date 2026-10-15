import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  getDocFromServer
} from 'firebase/firestore';
import { db, auth } from './config';
import { Product, Supplier, AuditHistoryRecord, StoreSettings } from '../types';
import { INITIAL_INVENTORY, INITIAL_SUPPLIERS } from '../data/mockData';

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
        auth.currentUser?.providerData?.map((provider) => ({
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
    // If the product code changed, remove previous document to prevent duplicates
    if (oldCode && oldCode.trim() !== product.code.trim()) {
      const oldDocId = oldCode.trim().replace(/\//g, '_');
      try {
        await deleteDoc(doc(db, 'inventory', oldDocId));
      } catch (err) {
        console.warn('Could not delete old product doc during rename:', err);
      }
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

    await setDoc(docRef, payload, { merge: true });
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

  for (const docId of idsToDelete) {
    try {
      await deleteDoc(doc(db, 'inventory', docId));
    } catch (error) {
      console.warn(`Could not delete doc ${docId}:`, error);
    }
  }
}

// ----------------- REAL-TIME SUPPLIERS -----------------

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

// ----------------- REAL-TIME AUDIT HISTORY & ATOMIC COMMIT -----------------

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
  historyRecord: AuditHistoryRecord
): Promise<void> {
  const batch = writeBatch(db);
  const auditId = Date.now().toString();

  try {
    // 1. Update stock of inventory items
    updatedInventory.forEach((product) => {
      const docId = product.code.trim().replace(/\//g, '_');
      const itemRef = doc(db, 'inventory', docId);
      batch.update(itemRef, { stock: Math.max(0, Math.round(Number(product.stock) || 0)) });
    });

    // 2. Record audit log
    const auditRef = doc(db, 'audit_history', auditId);
    batch.set(auditRef, {
      date: historyRecord.date,
      timestamp: historyRecord.timestamp,
      match: historyRecord.match,
      missing: historyRecord.missing,
      extra: historyRecord.extra,
      netImpact: Number(historyRecord.netImpact) || 0,
      totalItems: historyRecord.totalItems,
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `batch:audit/${auditId}`);
  }
}

// ----------------- SEED INITIAL DATA IF EMPTY -----------------

export async function seedInitialDataIfEmpty(): Promise<boolean> {
  try {
    const invSnap = await getDocs(collection(db, 'inventory'));
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

      await batch.commit();
      console.log('Successfully seeded initial inventory and suppliers to Firestore.');
      return true;
    }
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
  storeName: 'StockMaster',
  tagline: 'Control de Inventario y Auditoría',
  logoUrl: '',
  phone: '',
  address: '',
};

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
          storeName: data.storeName || 'StockMaster',
          tagline: data.tagline || '',
          logoUrl: data.logoUrl || '',
          phone: data.phone || '',
          address: data.address || '',
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
    updatedAt: Date.now(),
  };

  try {
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/store_profile');
  }
}

