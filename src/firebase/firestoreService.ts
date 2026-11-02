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
import {
  Product,
  Supplier,
  AuditHistoryRecord,
  StoreSettings,
  SaleRecord,
  CreditPaymentAbone,
  CashOutMovement,
  CashRegisterShift,
  StoreExpenseRecord,
  POSFinanceStoreData,
  ExpenseCategory,
  PurchaseInvoice,
  UserAccount,
  ActivityLogRecord,
  CompanyTenant,
  ActiveTab,
  ALL_COMPANY_MODULES,
  SubscriptionPaymentRecord,
  SaaSAnnouncement,
  SaaSBankAccount,
  TenantUsageMetrics,
  SaaSGlobalConfig,
  SaaSDemoRequest,
  WarehouseLocation,
  WarehouseTransferItem,
  WarehouseTransferRecord,
  StoreWarehousesData
} from '../types';
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

function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const cleaned: Record<string, any> = {};
    for (const [key, val] of Object.entries(value as Record<string, any>)) {
      if (val !== undefined) {
        cleaned[key] = stripUndefinedDeep(val);
      }
    }
    return cleaned as T;
  }
  return value;
}

// ----------------- MULTI-TENANT COMPANY CONTEXT -----------------

/**
 * Detects whether a string refers to the client Comercial GYG / Tienda GYG.
 * Handles all aliases: tiendagyg, comercialgyg, comercial-gyg, comercial_gyg, gyg, etc.
 */
export function isGyGAlias(raw?: string | null): boolean {
  if (!raw) return false;
  const c = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (!c || c === 'gosen' || c === 'tiendagosen' || c === 'gosentienda') return false;
  return (
    c === 'tiendagyg' ||
    c === 'comercialgyg' ||
    c === 'gyg' ||
    c === 'comercial' ||
    c === 'comercialgyghn' ||
    c === 'tiendacomercialgyg' ||
    c === 'gygcomercial' ||
    c.includes('tiendagyg') ||
    c.includes('comercialgyg') ||
    (c.includes('gyg') && (c.includes('comercial') || c.includes('tienda')))
  );
}

export function canonicalizeCompanySlug(raw?: string | null): string {
  if (!raw) return 'gosen';
  if (isGyGAlias(raw)) return 'tiendagyg';
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ''); // Strips all spaces, dashes, hyphens, and underscores
  if (!cleaned || cleaned === 'tiendagosen' || cleaned === 'gosen') {
    return 'gosen';
  }
  return cleaned;
}

export function normalizeCompanySlug(raw?: string | null): string {
  if (!raw) return 'gosen';
  if (isGyGAlias(raw)) return 'tiendagyg';
  const trimmed = raw.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // Replace one or more spaces with a hyphen for consistent readable slugs
  const slugified = trimmed.replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  if (!slugified || slugified === 'tiendagosen' || slugified === 'tienda-gosen' || slugified === 'tienda_gosen') {
    return 'gosen';
  }
  return slugified;
}

export function resolveCompanySlugFromInput(rawInput?: string | null, knownCompanies?: CompanyTenant[]): string {
  if (!rawInput) return 'gosen';
  const clean = rawInput.trim();
  if (isGyGAlias(clean)) {
    return 'tiendagyg';
  }
  const canonical = canonicalizeCompanySlug(clean);
  if (canonical === 'gosen') return 'gosen';

  const list = knownCompanies || getCachedCompanies() || [];
  // 1. Direct slug match (e.g. 'comercial-gyg' === 'comercial-gyg')
  const exactSlug = list.find((c) => c.slug.toLowerCase() === clean.toLowerCase());
  if (exactSlug) return exactSlug.slug;

  // 2. Canonical slug match (e.g. 'comercialgyg' matches 'comercial-gyg')
  const canonicalSlug = list.find((c) => canonicalizeCompanySlug(c.slug) === canonical);
  if (canonicalSlug) return canonicalSlug.slug;

  // 3. Name match (e.g. 'Comercial GYG' matches company with name 'Comercial GYG')
  const nameMatch = list.find((c) => canonicalizeCompanySlug(c.name) === canonical);
  if (nameMatch) return nameMatch.slug;

  return normalizeCompanySlug(clean);
}

function detectInitialCompanyId(): string {
  if (typeof window === 'undefined') return 'gosen';
  try {
    const params = new URLSearchParams(window.location.search);
    const urlCompany = params.get('empresa') || params.get('tienda') || params.get('cliente');
    if (urlCompany) {
      const slug = resolveCompanySlugFromInput(urlCompany);
      localStorage.setItem('stockmaster_active_company_id', slug);
      return slug;
    }
    const localSess = localStorage.getItem('stockmaster_user_session');
    const sessionSess = sessionStorage.getItem('stockmaster_user_session');
    const rawSess = localSess || sessionSess;
    if (rawSess) {
      const parsed = JSON.parse(rawSess);
      if (parsed?.companyId) {
        return resolveCompanySlugFromInput(parsed.companyId);
      }
    }
    const storedCompany = localStorage.getItem('stockmaster_active_company_id');
    if (storedCompany) {
      return resolveCompanySlugFromInput(storedCompany);
    }
  } catch {}
  return 'gosen';
}

let currentCompanyId: string = detectInitialCompanyId();

export function getActiveCompanyId(): string {
  return currentCompanyId || 'gosen';
}

export function setActiveCompanyId(companyId: string): string {
  const resolved = resolveCompanySlugFromInput(companyId);
  currentCompanyId = resolved;
  try {
    localStorage.setItem('stockmaster_active_company_id', resolved);
  } catch {}
  return resolved;
}

/**
 * Checks whether a Firestore document belongs to the requested companyId.
 * Handles slug variations (hyphens, underscores, spaces) so tenants like
 * "Comercial GYG" (tiendagyg, comercial-gyg, comercialgyg, comercial_gyg, gyg) seamlessly match.
 */
export function belongsToCompany(
  docCompanyId: string | undefined,
  targetCompanyId = getActiveCompanyId(),
  docId?: string
): boolean {
  const targetNorm = normalizeCompanySlug(targetCompanyId);
  const targetCanon = canonicalizeCompanySlug(targetCompanyId);
  const isTargetGyG = isGyGAlias(targetCompanyId);

  // If docId is provided and explicitly prefixed with target company slug
  if (docId) {
    if (
      docId.startsWith(`${targetNorm}__`) ||
      docId.startsWith(`${targetCanon}__`)
    ) {
      return true;
    }
    // Specifically handle all Comercial GyG / Tienda GyG prefixes
    if (
      isTargetGyG &&
      (docId.startsWith('tiendagyg__') ||
        docId.startsWith('comercial-gyg__') ||
        docId.startsWith('comercialgyg__') ||
        docId.startsWith('comercial_gyg__') ||
        docId.startsWith('gyg__'))
    ) {
      return true;
    }
  }

  // If no companyId field is present in document
  if (!docCompanyId) {
    if (docId && docId.includes('__')) {
      const prefix = docId.split('__')[0];
      if (isTargetGyG && isGyGAlias(prefix)) return true;
      return canonicalizeCompanySlug(prefix) === targetCanon;
    }
    return targetCanon === 'gosen';
  }

  const docNorm = normalizeCompanySlug(docCompanyId);
  const docCanon = canonicalizeCompanySlug(docCompanyId);

  // 1. Direct or slugified match
  if (docNorm === targetNorm || docCanon === targetCanon) {
    return true;
  }

  // 2. GyG alias match (handles tiendagyg <-> comercial-gyg <-> comercialgyg <-> gyg)
  if (isTargetGyG && (isGyGAlias(docCompanyId) || isGyGAlias(docCanon))) {
    return true;
  }

  return false;
}

/**
 * Generates a collision-free Firestore Document ID scoped to the active company.
 * Strips existing company prefixes to prevent nested prefixes like tiendagyg__tiendagyg__...
 * For 'gosen', preserves legacy document IDs so existing records update in-place.
 */
export function getScopedDocId(rawId: string, companyId = getActiveCompanyId()): string {
  let cleanId = rawId.trim().replace(/\//g, '_');
  const slug = normalizeCompanySlug(companyId);
  const canonical = canonicalizeCompanySlug(companyId);

  if (canonical === 'gosen') {
    return cleanId;
  }

  // Strip existing company prefixes if already present to prevent duplicate prefixes
  const knownPrefixes = [
    'tiendagyg__',
    'comercial-gyg__',
    'comercialgyg__',
    'comercial_gyg__',
    'gyg__',
    `${slug}__`,
    `${canonical}__`,
    'gosen__',
  ];
  for (const pfx of knownPrefixes) {
    if (cleanId.startsWith(pfx)) {
      cleanId = cleanId.slice(pfx.length);
      break;
    }
  }

  const finalPrefix = isGyGAlias(companyId) ? 'tiendagyg' : slug;
  return `${finalPrefix}__${cleanId}`;
}

// ----------------- LOCAL CACHE & 1-READ SYNC STAMP HELPERS -----------------

const BASE_CACHE_KEYS = {
  INVENTORY: 'stockmaster_cached_inventory_v1',
  INVENTORY_TS: 'stockmaster_inventory_sync_ts_v1',
  SUPPLIERS: 'stockmaster_cached_suppliers_v1',
  SALES: 'stockmaster_cached_sales_v1',
  PURCHASES: 'stockmaster_cached_purchases_v1',
  AUDIT: 'stockmaster_cached_audit_v1',
  USERS: 'stockmaster_cached_users_v1',
  SETTINGS: 'stockmaster_store_settings',
  SEEDED: 'stockmaster_seeded_v1',
  COMPANIES: 'stockmaster_cached_companies_v1',
};

function getScopedCacheKey(baseKey: string, companyId = getActiveCompanyId()): string {
  const slug = normalizeCompanySlug(companyId);
  if (slug === 'gosen') return baseKey;
  return `${baseKey}__${slug}`;
}

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

export function getCachedInventory(companyId = getActiveCompanyId()): Product[] | null {
  return safeReadCache<Product[]>(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY, companyId));
}

export function setCachedInventory(items: Product[], syncTs?: number, companyId = getActiveCompanyId()): void {
  const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY, companyId), sorted);
  if (syncTs !== undefined) {
    try {
      localStorage.setItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_TS, companyId), String(syncTs));
    } catch {}
  }
  if (sorted.length > 0 && normalizeCompanySlug(companyId) === 'gosen') {
    try {
      localStorage.setItem(BASE_CACHE_KEYS.SEEDED, '1');
    } catch {}
  }
}

export function getCachedSuppliers(companyId = getActiveCompanyId()): Supplier[] | null {
  return safeReadCache<Supplier[]>(getScopedCacheKey(BASE_CACHE_KEYS.SUPPLIERS, companyId));
}

export function setCachedSuppliers(items: Supplier[], companyId = getActiveCompanyId()): void {
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.SUPPLIERS, companyId), items);
}

export function getCachedSales(companyId = getActiveCompanyId()): SaleRecord[] | null {
  return safeReadCache<SaleRecord[]>(getScopedCacheKey(BASE_CACHE_KEYS.SALES, companyId));
}

export function setCachedSales(items: SaleRecord[], companyId = getActiveCompanyId()): void {
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.SALES, companyId), items);
}

export function getCachedPurchases(companyId = getActiveCompanyId()): PurchaseInvoice[] | null {
  return safeReadCache<PurchaseInvoice[]>(getScopedCacheKey(BASE_CACHE_KEYS.PURCHASES, companyId));
}

export function setCachedPurchases(items: PurchaseInvoice[], companyId = getActiveCompanyId()): void {
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.PURCHASES, companyId), items);
}

export function getCachedAuditHistory(companyId = getActiveCompanyId()): AuditHistoryRecord[] | null {
  return safeReadCache<AuditHistoryRecord[]>(getScopedCacheKey(BASE_CACHE_KEYS.AUDIT, companyId));
}

export function setCachedAuditHistory(items: AuditHistoryRecord[], companyId = getActiveCompanyId()): void {
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.AUDIT, companyId), items);
}

export function getCachedUsers(companyId = getActiveCompanyId()): UserAccount[] | null {
  return safeReadCache<UserAccount[]>(getScopedCacheKey(BASE_CACHE_KEYS.USERS, companyId));
}

export function setCachedUsers(items: UserAccount[], companyId = getActiveCompanyId()): void {
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.USERS, companyId), items);
}

export function getCachedStoreSettings(companyId = getActiveCompanyId()): StoreSettings | null {
  return safeReadCache<StoreSettings>(getScopedCacheKey(BASE_CACHE_KEYS.SETTINGS, companyId));
}

export function setCachedStoreSettings(settings: StoreSettings, companyId = getActiveCompanyId()): void {
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.SETTINGS, companyId), settings);
}

export function getCachedCompanies(): CompanyTenant[] | null {
  return safeReadCache<CompanyTenant[]>(BASE_CACHE_KEYS.COMPANIES);
}

export function setCachedCompanies(companies: CompanyTenant[]): void {
  safeWriteCache(BASE_CACHE_KEYS.COMPANIES, companies);
}

function getSyncStateDocId(companyId = getActiveCompanyId()): string {
  const slug = normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'sync_state' : `sync_state_${slug}`;
}

function getStoreProfileDocId(companyId = getActiveCompanyId()): string {
  const slug = normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'store_profile' : `store_profile_${slug}`;
}

/**
 * Updates the lightweight 1-document sync stamp (`settings/sync_state[_companyId]`) whenever
 * inventory changes, and advances the local timestamp so this device does not
 * need to re-download the inventory collection.
 */
export async function touchInventorySyncStamp(batch?: WriteBatch, companyId = getActiveCompanyId()): Promise<number> {
  const now = Date.now();
  const slug = normalizeCompanySlug(companyId);
  const syncRef = doc(db, 'settings', getSyncStateDocId(slug));
  try {
    localStorage.setItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_TS, slug), String(now));
  } catch {}

  const stampPayload = { storeName: `Sync ${slug}`, updatedAt: now };

  if (batch) {
    batch.set(syncRef, stampPayload, { merge: true });
    return now;
  }

  try {
    await setDoc(syncRef, stampPayload, { merge: true });
  } catch (err) {
    console.warn('Could not update sync_state stamp:', err);
  }
  return now;
}

/**
 * Smart Inventory Reader (Multi-Company Isolated):
 * 1. Checks `settings/sync_state[_companyId]` (1 Firestore document read).
 * 2. If local cache exists and its timestamp >= remote `updatedAt` (and !forceRefresh),
 *    returns the cached inventory immediately with 0 collection reads.
 * 3. Otherwise downloads `inventory` collection once, filters by `companyId`, merges any
 *    unsynced local cached items so client articles are never lost, and updates cache & timestamp.
 */
export async function fetchInventorySmart(
  forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<{ items: Product[]; fromCache: boolean; readsUsed: number }> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : resolveCompanySlugFromInput(companyId);
  const cached = getCachedInventory(slug);
  const localTs = Number(localStorage.getItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_TS, slug)) || 0);

  try {
    const syncRef = doc(db, 'settings', getSyncStateDocId(slug));
    const syncSnap = await getDoc(syncRef);
    const remoteTs = syncSnap.exists() ? Number(syncSnap.data()?.updatedAt || 0) : 0;

    if (!forceRefresh && cached && cached.length > 0 && remoteTs > 0 && localTs >= remoteTs) {
      return { items: cached, fromCache: true, readsUsed: 1 };
    }

    const collRef = collection(db, 'inventory');
    const snapshot = await getDocs(collRef);
    const items: Product[] = [];
    const remoteCodes = new Set<string>();

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;

      let code = (data.code || '').trim();
      if (!code) {
        code = docSnap.id.includes('__') ? docSnap.id.split('__').slice(1).join('__') : docSnap.id;
      }
      remoteCodes.add(code.toLowerCase());

      items.push({
        id: docSnap.id,
        companyId: data.companyId || slug,
        code,
        name: data.name || '',
        category: data.category || 'Otros',
        size: data.size || '',
        supplier: data.supplier || '',
        cost: Number(data.cost) || 0,
        price: Number(data.price) || 0,
        discount: Math.max(0, Number(data.discount) || 0),
        discountType: data.discountType === 'percent' ? 'percent' : 'fixed',
        discountValue: Math.max(0, Number(data.discountValue) || Number(data.discount) || 0),
        stock: Number(data.stock) || 0,
        warehouseStocks:
          data.warehouseStocks && typeof data.warehouseStocks === 'object'
            ? data.warehouseStocks
            : undefined,
        img: data.img || '',
      });
    });

    items.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    const effectiveTs = Date.now();
    setCachedInventory(items, effectiveTs, slug);

    if (remoteTs === 0) {
      await setDoc(syncRef, { storeName: `Sync ${slug}`, updatedAt: effectiveTs }, { merge: true }).catch(() => {});
    }

    return { items, fromCache: false, readsUsed: items.length + 1 };
  } catch (error) {
    if (cached) {
      console.warn('Using cached inventory due to connection issue:', error);
      return { items: cached, fromCache: true, readsUsed: 0 };
    }
    handleFirestoreError(error, OperationType.GET, 'inventory');
  }
}

// ----------------- REAL-TIME INVENTORY -----------------

export function subscribeToInventory(
  onData: (items: Product[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : resolveCompanySlugFromInput(companyId);
  const collRef = collection(db, 'inventory');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const items: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;

        let code = (data.code || '').trim();
        if (!code) {
          code = docSnap.id.includes('__') ? docSnap.id.split('__').slice(1).join('__') : docSnap.id;
        }

        items.push({
          id: docSnap.id,
          companyId: data.companyId || slug,
          code,
          name: data.name || '',
          category: data.category || 'Otros',
          size: data.size || '',
          supplier: data.supplier || '',
          cost: Number(data.cost) || 0,
          price: Number(data.price) || 0,
          discount: Math.max(0, Number(data.discount) || 0),
          discountType: data.discountType === 'percent' ? 'percent' : 'fixed',
          discountValue: Math.max(0, Number(data.discountValue) || Number(data.discount) || 0),
          stock: Number(data.stock) || 0,
          warehouseStocks:
            data.warehouseStocks && typeof data.warehouseStocks === 'object'
              ? data.warehouseStocks
              : undefined,
          img: data.img || '',
        });
      });
      items.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
      setCachedInventory(items, undefined, slug);
      onData(items);
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, 'inventory');
    }
  );
}

export async function saveProductToFirestore(
  product: Product,
  oldCode?: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const isGyG = isGyGAlias(companyId);
  const slug = isGyG ? 'tiendagyg' : resolveCompanySlugFromInput(companyId);
  const canonical = canonicalizeCompanySlug(slug);
  const docId = getScopedDocId(product.code, slug);
  const path = `inventory/${docId}`;
  try {
    const batch = writeBatch(db);

    // If changing SKU/code, remove the old document across all prefix variants
    if (oldCode && oldCode.trim().toLowerCase() !== product.code.trim().toLowerCase()) {
      const cleanOldCode = oldCode.trim();
      const idsToDelete = new Set<string>([
        getScopedDocId(cleanOldCode, slug),
        getScopedDocId(cleanOldCode, canonical),
        `${slug}__${cleanOldCode}`,
        `${canonical}__${cleanOldCode}`,
        cleanOldCode,
        cleanOldCode.replace(/\//g, '_'),
      ]);

      if (isGyG) {
        idsToDelete.add(`tiendagyg__${cleanOldCode}`);
        idsToDelete.add(`comercial-gyg__${cleanOldCode}`);
        idsToDelete.add(`comercialgyg__${cleanOldCode}`);
        idsToDelete.add(`comercial_gyg__${cleanOldCode}`);
        idsToDelete.add(`gyg__${cleanOldCode}`);
      }

      if (product.id && product.id !== docId) {
        idsToDelete.add(product.id);
      }

      for (const idDel of idsToDelete) {
        batch.delete(doc(db, 'inventory', idDel));
      }
    }

    const docRef = doc(db, 'inventory', docId);
    const payload: Record<string, any> = {
      companyId: slug,
      code: product.code.trim(),
      name: product.name.trim(),
      category: product.category || 'Otros',
      cost: Number(product.cost) || 0,
      price: Number(product.price) || 0,
      discount: Math.max(0, Number(product.discount) || 0),
      discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
      discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
      stock: Math.max(0, Math.round(Number(product.stock) || 0)),
    };

    if (product.size?.trim()) payload.size = product.size.trim();
    if (product.supplier?.trim()) payload.supplier = product.supplier.trim();
    if (product.img?.trim()) payload.img = product.img.trim();
    if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
      payload.warehouseStocks = product.warehouseStocks;
    }

    batch.set(docRef, stripUndefinedDeep(payload), { merge: true });
    await batch.commit();

    await touchInventorySyncStamp(undefined, slug);
    if (isGyG) {
      await touchInventorySyncStamp(undefined, 'comercial-gyg').catch(() => {});
      await touchInventorySyncStamp(undefined, 'comercialgyg').catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteProductFromFirestore(
  id: string,
  code?: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const isGyG = isGyGAlias(companyId);
  const slug = isGyG ? 'tiendagyg' : resolveCompanySlugFromInput(companyId);
  const canonical = canonicalizeCompanySlug(slug);
  const idsToDelete = new Set<string>();
  if (id) {
    idsToDelete.add(id.trim());
    idsToDelete.add(getScopedDocId(id, slug));
    idsToDelete.add(getScopedDocId(id, canonical));
  }
  if (code) {
    const cleanCode = code.trim();
    idsToDelete.add(getScopedDocId(cleanCode, slug));
    idsToDelete.add(getScopedDocId(cleanCode, canonical));
    idsToDelete.add(`${slug}__${cleanCode}`);
    idsToDelete.add(`${canonical}__${cleanCode}`);
    idsToDelete.add(cleanCode);
    idsToDelete.add(cleanCode.replace(/\//g, '_'));
    if (isGyG) {
      idsToDelete.add(`tiendagyg__${cleanCode}`);
      idsToDelete.add(`comercial-gyg__${cleanCode}`);
      idsToDelete.add(`comercialgyg__${cleanCode}`);
      idsToDelete.add(`comercial_gyg__${cleanCode}`);
      idsToDelete.add(`gyg__${cleanCode}`);
    }
  }

  const batch = writeBatch(db);
  for (const docId of idsToDelete) {
    batch.delete(doc(db, 'inventory', docId));
  }
  try {
    await batch.commit();
    await touchInventorySyncStamp(undefined, slug);
    if (isGyG) {
      await touchInventorySyncStamp(undefined, 'comercial-gyg').catch(() => {});
      await touchInventorySyncStamp(undefined, 'comercialgyg').catch(() => {});
    }
  } catch (error) {
    console.warn('Could not delete product doc in batch:', error);
  }
}

export async function bulkSaveProductsToFirestore(
  products: Product[],
  newSuppliers: Supplier[] = [],
  companyId = getActiveCompanyId()
): Promise<void> {
  if (products.length === 0 && newSuppliers.length === 0) return;

  const slug = normalizeCompanySlug(companyId);
  const CHUNK_SIZE = 400;
  try {
    if (newSuppliers.length > 0) {
      for (let i = 0; i < newSuppliers.length; i += CHUNK_SIZE) {
        const chunk = newSuppliers.slice(i, i + CHUNK_SIZE);
        const batch = writeBatch(db);
        chunk.forEach((sup) => {
          const rawSupId = (sup.id || sup.name || Date.now().toString()).trim();
          const docId = getScopedDocId(rawSupId, slug);
          const supRef = doc(db, 'suppliers', docId);
          batch.set(
            supRef,
            {
              companyId: slug,
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

    for (let i = 0; i < products.length; i += CHUNK_SIZE) {
      const chunk = products.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((product) => {
        if (!product.code.trim()) return;
        const docId = getScopedDocId(product.code, slug);
        const docRef = doc(db, 'inventory', docId);
        const payload: Record<string, any> = {
          companyId: slug,
          code: product.code.trim(),
          name: product.name.trim(),
          category: (product.category || 'General').trim(),
          cost: Math.max(0, Number(product.cost) || 0),
          price: Math.max(0, Number(product.price) || 0),
          discount: Math.max(0, Number(product.discount) || 0),
          discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
          discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
          stock: Math.max(0, Math.round(Number(product.stock) || 0)),
        };

        if (product.size !== undefined) payload.size = product.size.trim();
        if (product.supplier !== undefined) payload.supplier = product.supplier.trim();
        if (product.img?.trim()) payload.img = product.img.trim();
        if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
          payload.warehouseStocks = product.warehouseStocks;
        }

        batch.set(docRef, stripUndefinedDeep(payload), { merge: true });
      });

      await batch.commit();
    }
    await touchInventorySyncStamp(undefined, slug);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'batch:inventory/bulk_import');
  }
}

// ----------------- SUPPLIERS (ON-DEMAND & REAL-TIME) -----------------

export async function fetchSuppliersOnce(
  _forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<Supplier[]> {
  const slug = normalizeCompanySlug(companyId);
  const cached = getCachedSuppliers(slug);
  try {
    const snapshot = await getDocs(collection(db, 'suppliers'));
    const suppliers: Supplier[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug)) return;
      suppliers.push({
        id: docSnap.id,
        companyId: data.companyId || 'gosen',
        name: data.name || '',
        contact: data.contact || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
      });
    });
    suppliers.sort((a, b) => a.name.localeCompare(b.name));
    setCachedSuppliers(suppliers, slug);
    return suppliers;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'suppliers');
  }
}

export function subscribeToSuppliers(
  onData: (suppliers: Supplier[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = normalizeCompanySlug(companyId);
  const collRef = collection(db, 'suppliers');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const suppliers: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug)) return;
        suppliers.push({
          id: docSnap.id,
          companyId: data.companyId || 'gosen',
          name: data.name || '',
          contact: data.contact || '',
          phone: data.phone || '',
          email: data.email || '',
          address: data.address || '',
        });
      });
      suppliers.sort((a, b) => a.name.localeCompare(b.name));
      setCachedSuppliers(suppliers, slug);
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
  inventoryItems?: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  const rawId = supplier.id ? supplier.id : Date.now().toString();
  const docId = getScopedDocId(rawId, slug);
  const path = `suppliers/${docId}`;
  try {
    const docRef = doc(db, 'suppliers', docId);
    const payload: Record<string, any> = {
      companyId: slug,
      name: supplier.name.trim(),
    };
    if (supplier.contact?.trim()) payload.contact = supplier.contact.trim();
    if (supplier.phone?.trim()) payload.phone = supplier.phone.trim();
    if (supplier.email?.trim()) payload.email = supplier.email.trim();
    if (supplier.address?.trim()) payload.address = supplier.address.trim();

    await setDoc(docRef, payload, { merge: true });

    if (oldName && oldName !== supplier.name && inventoryItems && inventoryItems.length > 0) {
      const batch = writeBatch(db);
      let count = 0;
      inventoryItems.forEach((item) => {
        if (item.supplier === oldName) {
          const itemDocId = getScopedDocId(item.code, slug);
          const itemRef = doc(db, 'inventory', itemDocId);
          batch.update(itemRef, { supplier: supplier.name.trim() });
          count++;
        }
      });
      if (count > 0) {
        await touchInventorySyncStamp(batch, slug);
        await batch.commit();
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSupplierFromFirestore(
  id: string,
  name?: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  const idsToDelete = new Set<string>();
  if (id) {
    idsToDelete.add(id.trim());
    idsToDelete.add(getScopedDocId(id, slug));
  }
  if (name && slug === 'gosen') {
    idsToDelete.add(name.trim());
    idsToDelete.add(name.trim().replace(/\//g, '_'));
  }

  for (const docId of idsToDelete) {
    try {
      await deleteDoc(doc(db, 'suppliers', docId));
    } catch (error) {
      console.warn(`Could not delete supplier doc ${docId}:`, error);
    }
  }
}

// ----------------- AUDIT HISTORY & ATOMIC COMMIT -----------------

export async function fetchAuditHistoryOnce(
  _forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<AuditHistoryRecord[]> {
  const slug = normalizeCompanySlug(companyId);
  const cached = getCachedAuditHistory(slug);
  try {
    const snapshot = await getDocs(collection(db, 'audit_history'));
    const records: AuditHistoryRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug)) return;
      records.push({
        id: docSnap.id,
        companyId: data.companyId || 'gosen',
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
    setCachedAuditHistory(records, slug);
    return records;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'audit_history');
  }
}

export function subscribeToAuditHistory(
  onData: (records: AuditHistoryRecord[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = normalizeCompanySlug(companyId);
  const collRef = collection(db, 'audit_history');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: AuditHistoryRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug)) return;
        records.push({
          id: docSnap.id,
          companyId: data.companyId || 'gosen',
          date: data.date || '',
          timestamp: Number(data.timestamp) || Date.now(),
          match: Number(data.match) || 0,
          missing: Number(data.missing) || 0,
          extra: Number(data.extra) || 0,
          netImpact: Number(data.netImpact) || 0,
          totalItems: Number(data.totalItems) || 0,
        });
      });
      records.sort((a, b) => a.timestamp - b.timestamp);
      setCachedAuditHistory(records, slug);
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
  auditedCodes?: string[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  const batch = writeBatch(db);
  const auditId = getScopedDocId(Date.now().toString(), slug);

  try {
    const productsToUpdate =
      auditedCodes && auditedCodes.length > 0
        ? updatedInventory.filter((p) => auditedCodes.includes(p.code))
        : updatedInventory;

    productsToUpdate.forEach((product) => {
      const docId = getScopedDocId(product.code, slug);
      const itemRef = doc(db, 'inventory', docId);
      batch.update(itemRef, { stock: Math.max(0, Math.round(Number(product.stock) || 0)) });
    });

    const auditRef = doc(db, 'audit_history', auditId);
    const auditData: any = {
      companyId: slug,
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
    await touchInventorySyncStamp(batch, slug);

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `batch:audit/${auditId}`);
  }
}

// ----------------- SEED INITIAL DATA IF EMPTY (ONLY FOR PRIMARY GOSEN STORE) -----------------

export async function seedInitialDataIfEmpty(companyId = getActiveCompanyId()): Promise<boolean> {
  const slug = normalizeCompanySlug(companyId);
  // New client companies start with a clean empty inventory (never seed Gosén demo items into new clients)
  if (slug !== 'gosen') {
    return false;
  }

  try {
    if (localStorage.getItem(BASE_CACHE_KEYS.SEEDED) === '1') {
      return false;
    }
    const cachedInv = getCachedInventory('gosen');
    if (cachedInv && cachedInv.length > 0) {
      localStorage.setItem(BASE_CACHE_KEYS.SEEDED, '1');
      return false;
    }

    const invSnap = await getDocs(query(collection(db, 'inventory'), limit(1)));
    if (invSnap.empty) {
      console.log('Seeding initial products to Firestore...');
      const batch = writeBatch(db);

      INITIAL_INVENTORY.forEach((item) => {
        const docId = item.code.trim().replace(/\//g, '_');
        const docRef = doc(db, 'inventory', docId);
        const payload: Record<string, any> = {
          companyId: 'gosen',
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
          companyId: 'gosen',
          name: sup.name,
          contact: sup.contact || '',
          phone: sup.phone || '',
          email: sup.email || '',
          address: sup.address || '',
        });
      });

      await touchInventorySyncStamp(batch, 'gosen');
      await batch.commit();
      localStorage.setItem(BASE_CACHE_KEYS.SEEDED, '1');
      return true;
    }

    localStorage.setItem(BASE_CACHE_KEYS.SEEDED, '1');
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

// ----------------- STORE BRANDING & PROFILE SETTINGS (PER COMPANY) -----------------

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  companyId: 'gosen',
  storeName: 'Tienda Gosén',
  tagline: 'Control de Inventario y Ventas',
  logoUrl: '/store-logo.jpg',
  phone: '',
  address: '',
  accessPassword: 'GOSEN2026',
  allowedModules: ALL_COMPANY_MODULES,
  enableDeliveryDvolada: true,
  maxProducts: 0,
  maxUsers: 0,
};

export function getDefaultStoreSettingsForCompany(companyId = getActiveCompanyId()): StoreSettings {
  const slug = normalizeCompanySlug(companyId);
  if (slug === 'gosen') {
    return { ...DEFAULT_STORE_SETTINGS };
  }
  const cachedComps = getCachedCompanies() || [];
  const comp = cachedComps.find((c) => normalizeCompanySlug(c.slug) === slug);
  return {
    companyId: slug,
    storeName: comp?.name || slug.toUpperCase(),
    tagline: comp?.tagline || 'Control de Inventario y Ventas',
    logoUrl: comp?.logoUrl || '',
    phone: comp?.phone || '',
    address: comp?.address || '',
    accessPassword: comp?.adminPassword || 'ADMIN2026',
    whatsappOrderPhone: comp?.phone || '',
    catalogWelcomeMsg: '',
    allowedModules:
      Array.isArray(comp?.allowedModules) && comp!.allowedModules!.length > 0
        ? comp!.allowedModules
        : ALL_COMPANY_MODULES,
    enableDeliveryDvolada: Boolean(comp?.enableDeliveryDvolada === true),
    maxProducts: Math.max(0, Number(comp?.maxProducts) || 0),
    maxUsers: Math.max(0, Number(comp?.maxUsers) || 0),
  };
}

export async function fetchStoreSettingsOnce(companyId = getActiveCompanyId()): Promise<StoreSettings> {
  const slug = normalizeCompanySlug(companyId);
  try {
    const docRef = doc(db, 'settings', getStoreProfileDocId(slug));
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      const rawLogo = data.logoUrl !== undefined ? data.logoUrl : slug === 'gosen' ? '/store-logo.jpg' : '';
      // Never leak Tienda Gosén's /store-logo.jpg into another client company
      const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
      const settings: StoreSettings = {
        companyId: slug,
        storeName: data.storeName || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
        tagline: data.tagline || 'Control de Inventario y Ventas',
        logoUrl: safeLogo,
        phone: data.phone || '',
        address: data.address || '',
        accessPassword: data.accessPassword || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
        whatsappOrderPhone: data.whatsappOrderPhone || '',
        catalogWelcomeMsg: data.catalogWelcomeMsg || '',
        allowedModules:
          Array.isArray(data.allowedModules) && data.allowedModules.length > 0
            ? data.allowedModules
            : ALL_COMPANY_MODULES,
        enableDeliveryDvolada:
          data.enableDeliveryDvolada !== undefined
            ? Boolean(data.enableDeliveryDvolada)
            : slug === 'gosen',
        maxProducts: Math.max(0, Number(data.maxProducts) || 0),
        maxUsers: Math.max(0, Number(data.maxUsers) || 0),
        updatedAt: Number(data.updatedAt) || Date.now(),
      };
      setCachedStoreSettings(settings, slug);
      return settings;
    }

    // If non-gosen company doesn't have settings doc yet, check companies collection
    if (slug !== 'gosen') {
      const compSnap = await getDoc(doc(db, 'companies', slug));
      if (compSnap.exists()) {
        const cData = compSnap.data();
        const rawLogo = cData.logoUrl || '';
        const safeLogo = rawLogo === '/store-logo.jpg' ? '' : rawLogo;
        const fallbackSettings: StoreSettings = {
          companyId: slug,
          storeName: cData.name || slug.toUpperCase(),
          tagline: cData.tagline || 'Control de Inventario y Ventas',
          logoUrl: safeLogo,
          phone: cData.phone || '',
          address: cData.address || '',
          accessPassword: cData.adminPassword || 'ADMIN2026',
          whatsappOrderPhone: cData.phone || '',
          catalogWelcomeMsg: '',
          allowedModules:
            Array.isArray(cData.allowedModules) && cData.allowedModules.length > 0
              ? cData.allowedModules
              : ALL_COMPANY_MODULES,
          enableDeliveryDvolada: Boolean(cData.enableDeliveryDvolada === true),
          maxProducts: Math.max(0, Number(cData.maxProducts) || 0),
          maxUsers: Math.max(0, Number(cData.maxUsers) || 0),
          updatedAt: Date.now(),
        };
        setCachedStoreSettings(fallbackSettings, slug);
        return fallbackSettings;
      }
    }

    return getDefaultStoreSettingsForCompany(slug);
  } catch (error) {
    const cached = getCachedStoreSettings(slug);
    if (cached) return cached;
    return getDefaultStoreSettingsForCompany(slug);
  }
}

export function subscribeToStoreSettings(
  onData: (settings: StoreSettings) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = normalizeCompanySlug(companyId);
  const docRef = doc(db, 'settings', getStoreProfileDocId(slug));
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        const rawLogo = data.logoUrl !== undefined ? data.logoUrl : slug === 'gosen' ? '/store-logo.jpg' : '';
        const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
        onData({
          companyId: slug,
          storeName: data.storeName || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
          tagline: data.tagline || 'Control de Inventario y Ventas',
          logoUrl: safeLogo,
          phone: data.phone || '',
          address: data.address || '',
          accessPassword: data.accessPassword || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
          whatsappOrderPhone: data.whatsappOrderPhone || '',
          catalogWelcomeMsg: data.catalogWelcomeMsg || '',
          allowedModules:
            Array.isArray(data.allowedModules) && data.allowedModules.length > 0
              ? data.allowedModules
              : ALL_COMPANY_MODULES,
          enableDeliveryDvolada:
            data.enableDeliveryDvolada !== undefined
              ? Boolean(data.enableDeliveryDvolada)
              : slug === 'gosen',
          maxProducts: Math.max(0, Number(data.maxProducts) || 0),
          maxUsers: Math.max(0, Number(data.maxUsers) || 0),
          updatedAt: Number(data.updatedAt) || Date.now(),
        });
      } else {
        onData(getDefaultStoreSettingsForCompany(slug));
      }
    },
    (error) => {
      if (onError) onError(error);
      handleFirestoreError(error, OperationType.GET, `settings/${getStoreProfileDocId(slug)}`);
    }
  );
}

export async function saveStoreSettingsToFirestore(
  settings: StoreSettings,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(settings.companyId || companyId);
  const docRef = doc(db, 'settings', getStoreProfileDocId(slug));
  const rawLogo = settings.logoUrl?.trim() || '';
  const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
  const payload: any = {
    companyId: slug,
    storeName: settings.storeName.trim() || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
    tagline: settings.tagline?.trim() || '',
    logoUrl: safeLogo,
    phone: settings.phone?.trim() || '',
    address: settings.address?.trim() || '',
    accessPassword: settings.accessPassword?.trim() || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
    whatsappOrderPhone: settings.whatsappOrderPhone?.trim() || '',
    catalogWelcomeMsg: settings.catalogWelcomeMsg?.trim() || '',
    updatedAt: Date.now(),
  };

  if (Array.isArray(settings.allowedModules) && settings.allowedModules.length > 0) {
    payload.allowedModules = settings.allowedModules;
  }
  if (settings.enableDeliveryDvolada !== undefined) {
    payload.enableDeliveryDvolada = Boolean(settings.enableDeliveryDvolada);
  }
  if (settings.maxProducts !== undefined) {
    payload.maxProducts = Math.max(0, Number(settings.maxProducts) || 0);
  }
  if (settings.maxUsers !== undefined) {
    payload.maxUsers = Math.max(0, Number(settings.maxUsers) || 0);
  }

  try {
    await setDoc(docRef, payload, { merge: true });
    // Also keep the company tenant record in sync if it exists
    const compRef = doc(db, 'companies', slug);
    await setDoc(
      compRef,
      {
        name: payload.storeName,
        slug,
        adminPassword: payload.accessPassword,
        phone: payload.phone,
        logoUrl: payload.logoUrl,
        tagline: payload.tagline,
        address: payload.address,
      },
      { merge: true }
    ).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `settings/${getStoreProfileDocId(slug)}`);
  }
}

// ----------------- SALES & POS OPERATIONS -----------------

export async function fetchSalesOnce(
  _forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<SaleRecord[]> {
  const slug = normalizeCompanySlug(companyId);
  const cached = getCachedSales(slug);
  try {
    const snapshot = await getDocs(collection(db, 'sales'));
    const records: SaleRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug)) return;
      records.push({
        id: docSnap.id,
        companyId: data.companyId || 'gosen',
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
              originalPrice: it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
              unitDiscount: Math.max(0, Number(it.unitDiscount) || 0),
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
        balanceDue:
          data.balanceDue !== undefined
            ? Math.max(0, Number(data.balanceDue) || 0)
            : data.paymentMethod === 'credit'
            ? Math.max(0, (Number(data.total) || 0) - (Number(data.amountPaid) || 0))
            : 0,
        creditStatus:
          data.creditStatus === 'paid' || data.creditStatus === 'pending'
            ? data.creditStatus
            : data.paymentMethod === 'credit'
            ? (Number(data.balanceDue ?? (Number(data.total) - Number(data.amountPaid))) || 0) <= 0.01
              ? 'paid'
              : 'pending'
            : undefined,
        creditDueDate: data.creditDueDate || '',
        creditPayments: Array.isArray(data.creditPayments)
          ? data.creditPayments.map((cp: any) => ({
              id: String(cp.id || `abn_${Date.now()}`),
              amount: Number(cp.amount) || 0,
              paymentMethod: ['cash', 'transfer', 'card'].includes(cp.paymentMethod)
                ? cp.paymentMethod
                : 'cash',
              timestamp: Number(cp.timestamp) || Date.now(),
              date: String(cp.date || ''),
              receivedBy: String(cp.receivedBy || 'Administrador'),
              notes: cp.notes ? String(cp.notes) : '',
            }))
          : [],
        customerName: data.customerName || 'Consumidor Final',
        customerPhone: data.customerPhone || '',
        customerRtn: data.customerRtn || '',
        notes: data.notes || '',
        status: data.status === 'cancelled' ? 'cancelled' : 'completed',
        warehouseId: data.warehouseId ? String(data.warehouseId) : undefined,
        warehouseName: data.warehouseName ? String(data.warehouseName) : undefined,
        cashier: data.cashier || 'Administrador',
        cashierRole:
          data.cashierRole === 'admin' || data.cashierRole === 'collaborator'
            ? data.cashierRole
            : undefined,
        lastEditedBy: data.lastEditedBy ? String(data.lastEditedBy) : undefined,
        lastEditedAt: data.lastEditedAt ? String(data.lastEditedAt) : undefined,
      });
    });
    records.sort((a, b) => b.timestamp - a.timestamp);
    setCachedSales(records, slug);
    return records;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'sales');
  }
}

export function subscribeToSales(
  onData: (sales: SaleRecord[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = normalizeCompanySlug(companyId);
  const collRef = collection(db, 'sales');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: SaleRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug)) return;
        records.push({
          id: docSnap.id,
          companyId: data.companyId || 'gosen',
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
                originalPrice: it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
                unitDiscount: Math.max(0, Number(it.unitDiscount) || 0),
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
          balanceDue:
            data.balanceDue !== undefined
              ? Math.max(0, Number(data.balanceDue) || 0)
              : data.paymentMethod === 'credit'
              ? Math.max(0, (Number(data.total) || 0) - (Number(data.amountPaid) || 0))
              : 0,
          creditStatus:
            data.creditStatus === 'paid' || data.creditStatus === 'pending'
              ? data.creditStatus
              : data.paymentMethod === 'credit'
              ? (Number(data.balanceDue ?? (Number(data.total) - Number(data.amountPaid))) || 0) <= 0.01
                ? 'paid'
                : 'pending'
              : undefined,
          creditDueDate: data.creditDueDate || '',
          creditPayments: Array.isArray(data.creditPayments)
            ? data.creditPayments.map((cp: any) => ({
                id: String(cp.id || `abn_${Date.now()}`),
                amount: Number(cp.amount) || 0,
                paymentMethod: ['cash', 'transfer', 'card'].includes(cp.paymentMethod)
                  ? cp.paymentMethod
                  : 'cash',
                timestamp: Number(cp.timestamp) || Date.now(),
                date: String(cp.date || ''),
                receivedBy: String(cp.receivedBy || 'Administrador'),
                notes: cp.notes ? String(cp.notes) : '',
              }))
            : [],
          customerName: data.customerName || 'Consumidor Final',
          customerPhone: data.customerPhone || '',
          customerRtn: data.customerRtn || '',
          notes: data.notes || '',
          status: data.status === 'cancelled' ? 'cancelled' : 'completed',
          warehouseId: data.warehouseId ? String(data.warehouseId) : undefined,
          warehouseName: data.warehouseName ? String(data.warehouseName) : undefined,
          cashier: data.cashier || 'Administrador',
          cashierRole:
            data.cashierRole === 'admin' || data.cashierRole === 'collaborator'
              ? data.cashierRole
              : undefined,
          lastEditedBy: data.lastEditedBy ? String(data.lastEditedBy) : undefined,
          lastEditedAt: data.lastEditedAt ? String(data.lastEditedAt) : undefined,
        });
      });
      records.sort((a, b) => b.timestamp - a.timestamp);
      setCachedSales(records, slug);
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
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<SaleRecord> {
  const slug = normalizeCompanySlug(companyId);
  const saleId = getScopedDocId(`${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, slug);
  const saleRef = doc(db, 'sales', saleId);

  const isCredit = saleData.paymentMethod === 'credit';
  const totalVal = Number(saleData.total) || 0;
  const paidVal = Number(saleData.amountPaid) || 0;
  const computedBalanceDue = isCredit
    ? Math.max(0, saleData.balanceDue !== undefined ? Number(saleData.balanceDue) : totalVal - paidVal)
    : 0;

  const payload: any = {
    companyId: slug,
    saleNumber: String(saleData.saleNumber || `VTA-${Date.now().toString().slice(-6)}`).slice(0, 50),
    timestamp: Number(saleData.timestamp) || Date.now(),
    date: String(saleData.date || new Date().toLocaleString()).slice(0, 100),
    items: (saleData.items || []).map((it) => ({
      productId: String(it.productId || ''),
      code: String(it.code || '').trim(),
      name: String(it.name || '').trim(),
      category: String(it.category || 'General').trim(),
      size: String(it.size || '').trim(),
      originalPrice: it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
      unitDiscount: Math.max(0, Number(it.unitDiscount) || 0),
      price: Number(it.price) || 0,
      cost: Number(it.cost) || 0,
      quantity: Number(it.quantity) || 1,
      subtotal: Number(it.subtotal) || 0,
    })),
    totalItems: Math.round(Number(saleData.totalItems) || 0),
    subtotal: Number(saleData.subtotal) || 0,
    discount: Number(saleData.discount) || 0,
    tax: Number(saleData.tax) || 0,
    total: totalVal,
    paymentMethod: String(saleData.paymentMethod || 'cash').slice(0, 50),
    amountPaid: paidVal,
    change: Number(saleData.change) || 0,
    balanceDue: computedBalanceDue,
    creditStatus: isCredit ? (computedBalanceDue <= 0.01 ? 'paid' : 'pending') : 'paid',
    creditDueDate: String(saleData.creditDueDate || '').trim().slice(0, 50),
    creditPayments: Array.isArray(saleData.creditPayments) ? saleData.creditPayments : [],
    customerName: String(saleData.customerName || 'Consumidor Final').trim().slice(0, 200),
    customerPhone: String(saleData.customerPhone || '').trim().slice(0, 50),
    customerRtn: String(saleData.customerRtn || '').trim().slice(0, 50),
    notes: String(saleData.notes || '').trim().slice(0, 500),
    status: 'completed',
    warehouseId: saleData.warehouseId ? String(saleData.warehouseId).trim().slice(0, 100) : undefined,
    warehouseName: saleData.warehouseName ? String(saleData.warehouseName).trim().slice(0, 150) : undefined,
    cashier: String(saleData.cashier || 'Administrador').trim().slice(0, 100),
    cashierRole:
      saleData.cashierRole === 'admin' || saleData.cashierRole === 'collaborator'
        ? saleData.cashierRole
        : (saleData.cashier || '').toLowerCase().includes('admin')
        ? 'admin'
        : 'collaborator',
  };

  try {
    // 1. Save the sale document first so billing never fails due to an inventory doc ID mismatch
    await setDoc(saleRef, stripUndefinedDeep(payload));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sales/${saleId}`);
  }

  // 2. Deduct stock in inventory (and in the chosen warehouse) using setDoc(..., { merge: true })
  try {
    const storeWhData = getCachedStoreWarehouses(slug);
    const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
    const invBatch = writeBatch(db);
    const qtyByCode = new Map<string, { qty: number; item: SaleRecord['items'][number] }>();

    for (const item of saleData.items || []) {
      const codeKey = item.code.trim().toLowerCase();
      if (!codeKey) continue;
      const prev = qtyByCode.get(codeKey);
      if (prev) {
        prev.qty += Number(item.quantity) || 1;
      } else {
        qtyByCode.set(codeKey, { qty: Number(item.quantity) || 1, item });
      }
    }

    for (const [, { qty, item }] of qtyByCode.entries()) {
      const currentProd = currentInventory.find(
        (p) =>
          p.code.trim().toLowerCase() === item.code.trim().toLowerCase() ||
          (item.productId && p.id === item.productId)
      );
      const canonicalDocId = getScopedDocId(currentProd?.code || item.code, slug);
      const productRef = doc(db, 'inventory', canonicalDocId);

      const { newStock, newWarehouseStocks } = applyWarehouseStockDelta(
        currentProd,
        -qty,
        saleData.warehouseId,
        activeWhList
      );

      const productPayload: Record<string, any> = {
        companyId: slug,
        code: (currentProd?.code || item.code).trim().slice(0, 100),
        name: (currentProd?.name || item.name || 'Producto').trim().slice(0, 200),
        category: (currentProd?.category || item.category || 'General').trim().slice(0, 100),
        price: Number(currentProd?.price ?? item.originalPrice ?? item.price) || 0,
        cost: Number(currentProd?.cost ?? item.cost) || 0,
        stock: newStock,
        ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
      };

      invBatch.set(productRef, productPayload, { merge: true });

      // If the product was loaded from Firestore under a different non-numeric doc ID, keep it updated too
      if (
        currentProd?.id &&
        currentProd.id !== canonicalDocId &&
        !/^\d+$/.test(currentProd.id)
      ) {
        const altRef = doc(db, 'inventory', currentProd.id);
        invBatch.set(altRef, productPayload, { merge: true });
      }
    }

    await touchInventorySyncStamp(invBatch, slug);
    await invBatch.commit();
  } catch (invError) {
    console.warn('Warning updating inventory stock after sale:', invError);
  }

  return {
    id: saleId,
    ...payload,
  };
}

export async function recordCreditPaymentInFirestore(
  sale: SaleRecord,
  newAbone: CreditPaymentAbone,
  companyId = getActiveCompanyId()
): Promise<SaleRecord> {
  const slug = normalizeCompanySlug(companyId);
  const saleRef = doc(db, 'sales', sale.id);
  const cleanAbone: CreditPaymentAbone = {
    id: String(newAbone.id || `abn_${Date.now()}`),
    amount: Number(newAbone.amount) || 0,
    paymentMethod: ['cash', 'transfer', 'card'].includes(newAbone.paymentMethod)
      ? newAbone.paymentMethod
      : 'cash',
    timestamp: Number(newAbone.timestamp) || Date.now(),
    date: String(newAbone.date || new Date().toLocaleString()),
    receivedBy: String(newAbone.receivedBy || 'Administrador'),
    notes: newAbone.notes ? String(newAbone.notes).trim() : '',
  };
  const existingPayments = Array.isArray(sale.creditPayments)
    ? sale.creditPayments.map((cp) => ({
        id: String(cp.id || `abn_${Date.now()}`),
        amount: Number(cp.amount) || 0,
        paymentMethod: (['cash', 'transfer', 'card'].includes(cp.paymentMethod)
          ? cp.paymentMethod
          : 'cash') as 'cash' | 'transfer' | 'card',
        timestamp: Number(cp.timestamp) || Date.now(),
        date: String(cp.date || ''),
        receivedBy: String(cp.receivedBy || 'Administrador'),
        notes: cp.notes ? String(cp.notes).trim() : '',
      }))
    : [];
  const updatedPayments = [...existingPayments, cleanAbone];
  const newAmountPaid = Math.min(sale.total, (Number(sale.amountPaid) || 0) + Number(cleanAbone.amount));
  const newBalanceDue = Math.max(0, Number((sale.total - newAmountPaid).toFixed(2)));
  const newCreditStatus: 'pending' | 'paid' = newBalanceDue <= 0.01 ? 'paid' : 'pending';

  const updatedSale: SaleRecord = {
    ...sale,
    companyId: sale.companyId || slug,
    amountPaid: newAmountPaid,
    balanceDue: newBalanceDue,
    creditStatus: newCreditStatus,
    creditPayments: updatedPayments,
  };

  try {
    await setDoc(
      saleRef,
      stripUndefinedDeep({
        saleNumber: String(sale.saleNumber || 'VTA').slice(0, 50),
        timestamp: Number(sale.timestamp) || Date.now(),
        date: String(sale.date || '').slice(0, 100),
        items: Array.isArray(sale.items) ? sale.items : [],
        total: Number(sale.total) || 0,
        status: sale.status === 'cancelled' ? 'cancelled' : 'completed',
        amountPaid: updatedSale.amountPaid,
        balanceDue: updatedSale.balanceDue,
        creditStatus: updatedSale.creditStatus,
        creditPayments: updatedSale.creditPayments,
      }),
      { merge: true }
    );
    return updatedSale;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
  }
}

export async function updateSaleInFirestore(
  originalSale: SaleRecord,
  updatedSale: SaleRecord,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<SaleRecord> {
  const slug = normalizeCompanySlug(companyId);
  const saleRef = doc(db, 'sales', originalSale.id);

  const isCredit = updatedSale.paymentMethod === 'credit';
  const totalVal = Number(updatedSale.total) || 0;
  const paidVal = Number(updatedSale.amountPaid) || 0;
  const computedBalanceDue = isCredit
    ? Math.max(0, updatedSale.balanceDue !== undefined ? Number(updatedSale.balanceDue) : totalVal - paidVal)
    : 0;

  const cleanItems = (updatedSale.items || []).map((it) => ({
    productId: String(it.productId || ''),
    code: String(it.code || '').trim(),
    name: String(it.name || '').trim(),
    category: String(it.category || 'General').trim(),
    size: String(it.size || '').trim(),
    originalPrice: it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
    unitDiscount: Math.max(0, Number(it.unitDiscount) || 0),
    price: Number(it.price) || 0,
    cost: Number(it.cost) || 0,
    quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
    subtotal: Number(it.subtotal) || 0,
  }));

  const payload: any = {
    companyId: originalSale.companyId || slug,
    saleNumber: String(updatedSale.saleNumber || originalSale.saleNumber || 'VTA').slice(0, 50),
    timestamp: Number(originalSale.timestamp) || Date.now(),
    date: String(originalSale.date || new Date().toLocaleString()).slice(0, 100),
    items: cleanItems,
    totalItems: cleanItems.reduce((acc, it) => acc + it.quantity, 0),
    subtotal: Number(updatedSale.subtotal) || 0,
    discount: Number(updatedSale.discount) || 0,
    tax: Number(updatedSale.tax) || 0,
    total: totalVal,
    paymentMethod: String(updatedSale.paymentMethod || 'cash').slice(0, 50),
    amountPaid: paidVal,
    change: Math.max(0, Number(updatedSale.change) || 0),
    balanceDue: computedBalanceDue,
    creditStatus: isCredit ? (computedBalanceDue <= 0.01 ? 'paid' : 'pending') : 'paid',
    creditDueDate: String(updatedSale.creditDueDate || '').trim().slice(0, 50),
    creditPayments: Array.isArray(updatedSale.creditPayments) ? updatedSale.creditPayments : [],
    customerName: String(updatedSale.customerName || 'Consumidor Final').trim().slice(0, 200),
    customerPhone: String(updatedSale.customerPhone || '').trim().slice(0, 50),
    customerRtn: String(updatedSale.customerRtn || '').trim().slice(0, 50),
    notes: String(updatedSale.notes || '').trim().slice(0, 500),
    status: updatedSale.status === 'cancelled' ? 'cancelled' : 'completed',
    warehouseId: updatedSale.warehouseId || originalSale.warehouseId || undefined,
    warehouseName: updatedSale.warehouseName || originalSale.warehouseName || undefined,
    cashier: String(updatedSale.cashier || originalSale.cashier || 'Administrador').trim().slice(0, 100),
    cashierRole: updatedSale.cashierRole || originalSale.cashierRole || 'admin',
    lastEditedBy: String(updatedSale.lastEditedBy || 'Administrador').slice(0, 150),
    lastEditedAt: String(updatedSale.lastEditedAt || new Date().toLocaleString()).slice(0, 100),
  };

  try {
    await setDoc(saleRef, stripUndefinedDeep(payload), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sales/${originalSale.id}`);
  }

  // Compute stock difference per product code between originalSale.items and cleanItems
  try {
    const storeWhData = getCachedStoreWarehouses(slug);
    const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
    const targetWhId = updatedSale.warehouseId || originalSale.warehouseId;

    const oldQtyByCode = new Map<string, number>();
    for (const it of originalSale.items || []) {
      const k = it.code.trim().toLowerCase();
      if (!k) continue;
      oldQtyByCode.set(k, (oldQtyByCode.get(k) || 0) + (Number(it.quantity) || 0));
    }

    const newQtyByCode = new Map<string, { qty: number; item: typeof cleanItems[number] }>();
    for (const it of cleanItems) {
      const k = it.code.trim().toLowerCase();
      if (!k) continue;
      const existing = newQtyByCode.get(k);
      if (existing) {
        existing.qty += it.quantity;
      } else {
        newQtyByCode.set(k, { qty: it.quantity, item: it });
      }
    }

    const allCodes = new Set<string>([
      ...Array.from(oldQtyByCode.keys()),
      ...Array.from(newQtyByCode.keys()),
    ]);

    const batch = writeBatch(db);
    let hasStockDelta = false;

    for (const codeKey of allCodes) {
      const oldQty = oldQtyByCode.get(codeKey) || 0;
      const newEntry = newQtyByCode.get(codeKey);
      const newQty = newEntry?.qty || 0;
      const stockDelta = oldQty - newQty; // positive = return to stock, negative = deduct more stock
      if (stockDelta === 0) continue;

      hasStockDelta = true;
      const currentProd = currentInventory.find(
        (p) => p.code.trim().toLowerCase() === codeKey
      );
      const fallbackItem =
        newEntry?.item ||
        (originalSale.items || []).find((i) => i.code.trim().toLowerCase() === codeKey);

      const rawCode = currentProd?.code || fallbackItem?.code || codeKey;
      const productDocId = getScopedDocId(rawCode, slug);
      const productRef = doc(db, 'inventory', productDocId);

      const { newStock: adjustedStock, newWarehouseStocks } = applyWarehouseStockDelta(
        currentProd,
        stockDelta,
        targetWhId,
        activeWhList
      );

      batch.set(
        productRef,
        {
          companyId: slug,
          code: rawCode.trim().slice(0, 100),
          name: (currentProd?.name || fallbackItem?.name || 'Producto').trim().slice(0, 200),
          category: (currentProd?.category || fallbackItem?.category || 'General').trim().slice(0, 100),
          price: Number(currentProd?.price ?? fallbackItem?.price) || 0,
          cost: Number(currentProd?.cost ?? fallbackItem?.cost) || 0,
          stock: adjustedStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
        },
        { merge: true }
      );
    }

    if (hasStockDelta) {
      await touchInventorySyncStamp(batch, slug);
      await batch.commit();
    }
  } catch (invErr) {
    console.warn('Warning adjusting inventory stock on sale edit:', invErr);
  }

  return {
    id: originalSale.id,
    ...payload,
  };
}

export async function cancelSaleInFirestore(
  sale: SaleRecord,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  const saleRef = doc(db, 'sales', sale.id);

  try {
    await setDoc(
      saleRef,
      stripUndefinedDeep({
        saleNumber: String(sale.saleNumber || 'VTA').slice(0, 50),
        timestamp: Number(sale.timestamp) || Date.now(),
        date: String(sale.date || '').slice(0, 100),
        items: Array.isArray(sale.items) ? sale.items : [],
        total: Number(sale.total) || 0,
        status: 'cancelled',
      }),
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
  }

  try {
    const storeWhData = getCachedStoreWarehouses(slug);
    const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
    const batch = writeBatch(db);
    for (const item of sale.items || []) {
      const currentProd = currentInventory.find(
        (p) =>
          p.code.trim().toLowerCase() === item.code.trim().toLowerCase() ||
          p.id === item.productId
      );
      const productDocId = getScopedDocId(currentProd?.code || item.code, slug);
      const productRef = doc(db, 'inventory', productDocId);

      const { newStock: restoredStock, newWarehouseStocks } = applyWarehouseStockDelta(
        currentProd,
        Number(item.quantity) || 1,
        sale.warehouseId,
        activeWhList
      );

      batch.set(
        productRef,
        {
          companyId: slug,
          code: (currentProd?.code || item.code).trim().slice(0, 100),
          name: (currentProd?.name || item.name || 'Producto').trim().slice(0, 200),
          category: (currentProd?.category || item.category || 'General').trim().slice(0, 100),
          price: Number(currentProd?.price ?? item.price) || 0,
          cost: Number(currentProd?.cost ?? item.cost) || 0,
          stock: restoredStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
        },
        { merge: true }
      );
    }

    await touchInventorySyncStamp(batch, slug);
    await batch.commit();
  } catch (invError) {
    console.warn('Warning restoring stock on sale cancel:', invError);
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

export async function fetchPurchasesOnce(
  _forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<PurchaseInvoice[]> {
  const slug = normalizeCompanySlug(companyId);
  const cached = getCachedPurchases(slug);
  try {
    const snapshot = await getDocs(collection(db, 'purchases'));
    const records: PurchaseInvoice[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug)) return;
      records.push({
        id: docSnap.id,
        companyId: data.companyId || 'gosen',
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
    setCachedPurchases(records, slug);
    return records;
  } catch (error) {
    if (cached) return cached;
    handleFirestoreError(error, OperationType.GET, 'purchases');
  }
}

export function subscribeToPurchases(
  onData: (purchases: PurchaseInvoice[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = normalizeCompanySlug(companyId);
  const collRef = collection(db, 'purchases');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: PurchaseInvoice[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug)) return;
        records.push({
          id: docSnap.id,
          companyId: data.companyId || 'gosen',
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
      setCachedPurchases(records, slug);
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
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<PurchaseInvoice> {
  const slug = normalizeCompanySlug(companyId);
  const purchaseId = getScopedDocId(`${Date.now()}_${Math.random().toString(36).substring(2, 6)}`, slug);
  const purchaseRef = doc(db, 'purchases', purchaseId);

  const invoicePayload: any = {
    companyId: slug,
    invoiceNumber: String(purchaseData.invoiceNumber || `FAC-${Date.now().toString().slice(-6)}`).trim().slice(0, 100),
    supplierId: String(purchaseData.supplierId || 'sup_default').trim().slice(0, 128),
    supplierName: String(purchaseData.supplierName || 'Proveedor').trim().slice(0, 200),
    date: String(purchaseData.date || new Date().toLocaleDateString()).trim().slice(0, 100),
    timestamp: Number(purchaseData.timestamp) || Date.now(),
    paymentCondition: purchaseData.paymentCondition || 'cash',
    dueDate: String(purchaseData.dueDate || '').trim().slice(0, 50),
    items: (purchaseData.items || []).map((it) => ({
      productId: String(it.productId || ''),
      code: String(it.code || '').trim(),
      name: String(it.name || '').trim(),
      category: String(it.category || '').trim(),
      size: String(it.size || '').trim(),
      cost: Number(it.cost) || 0,
      salePrice: it.salePrice ? Number(it.salePrice) : null,
      quantity: Number(it.quantity) || 1,
      subtotal: Number(it.subtotal) || 0,
    })),
    totalItems: Math.round(Number(purchaseData.totalItems) || 0),
    subtotal: Number(purchaseData.subtotal) || 0,
    tax: Number(purchaseData.tax) || 0,
    discount: Number(purchaseData.discount) || 0,
    total: Number(purchaseData.total) || 0,
    notes: String(purchaseData.notes || '').trim().slice(0, 500),
    status: 'completed',
    receivedBy: String(purchaseData.receivedBy || 'Administrador').trim().slice(0, 100),
  };

  try {
    await setDoc(purchaseRef, invoicePayload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `purchases/${purchaseId}`);
  }

  try {
    const batch = writeBatch(db);
    for (const item of purchaseData.items || []) {
      const productDocId = getScopedDocId(item.code, slug);
      const productRef = doc(db, 'inventory', productDocId);

      const existing = currentInventory.find(
        (p) => p.code.trim().toLowerCase() === item.code.trim().toLowerCase() || p.id === item.productId
      );

      if (existing) {
        const currentStock = Number(existing.stock) || 0;
        const newStock = Math.max(0, Math.round(currentStock + (Number(item.quantity) || 0)));

        const updatePayload: Record<string, any> = {
          companyId: slug,
          code: existing.code.trim().slice(0, 100),
          name: existing.name.trim().slice(0, 200),
          category: (existing.category || 'General').trim().slice(0, 100),
          stock: newStock,
          cost: Number(item.cost) || existing.cost || 0,
          price:
            item.salePrice && item.salePrice > 0
              ? Number(item.salePrice)
              : Number(existing.price) || 0,
        };

        if (purchaseData.supplierName && !existing.supplier) {
          updatePayload.supplier = purchaseData.supplierName.trim().slice(0, 200);
        }

        batch.set(productRef, updatePayload, { merge: true });
      } else {
        const newProductPayload: Record<string, any> = {
          companyId: slug,
          code: item.code.trim().slice(0, 100),
          name: item.name.trim().slice(0, 200),
          category: (item.category?.trim() || 'General').slice(0, 100),
          size: (item.size?.trim() || '').slice(0, 50),
          supplier: purchaseData.supplierName.trim().slice(0, 200),
          cost: Number(item.cost) || 0,
          price: item.salePrice && item.salePrice > 0 ? Number(item.salePrice) : (Number(item.cost) || 0) * 1.35,
          stock: Math.max(0, Math.round(Number(item.quantity) || 0)),
          img: '',
        };

        batch.set(productRef, newProductPayload, { merge: true });
      }
    }

    await touchInventorySyncStamp(batch, slug);
    await batch.commit();
  } catch (invError) {
    console.warn('Warning updating inventory stock after purchase:', invError);
  }

  return {
    id: purchaseId,
    ...invoicePayload,
  };
}

export async function cancelPurchaseInFirestore(
  purchase: PurchaseInvoice,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  const purchaseRef = doc(db, 'purchases', purchase.id);

  try {
    await setDoc(
      purchaseRef,
      {
        invoiceNumber: String(purchase.invoiceNumber || 'FAC').slice(0, 100),
        supplierId: String(purchase.supplierId || 'sup').slice(0, 128),
        supplierName: String(purchase.supplierName || 'Proveedor').slice(0, 200),
        date: String(purchase.date || '').slice(0, 100),
        timestamp: Number(purchase.timestamp) || Date.now(),
        items: Array.isArray(purchase.items) ? purchase.items : [],
        total: Number(purchase.total) || 0,
        status: 'cancelled',
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `purchases/${purchase.id}`);
  }

  try {
    const batch = writeBatch(db);
    for (const item of purchase.items || []) {
      const productDocId = getScopedDocId(item.code, slug);
      const productRef = doc(db, 'inventory', productDocId);

      const existing = currentInventory.find(
        (p) => p.code.trim().toLowerCase() === item.code.trim().toLowerCase() || p.id === item.productId
      );

      const currentStock = existing ? Number(existing.stock) || 0 : 0;
      const newStock = Math.max(0, Math.round(currentStock - (Number(item.quantity) || 0)));

      batch.set(
        productRef,
        {
          companyId: slug,
          code: (existing?.code || item.code).trim().slice(0, 100),
          name: (existing?.name || item.name || 'Producto').trim().slice(0, 200),
          category: (existing?.category || item.category || 'General').trim().slice(0, 100),
          price: Number(existing?.price ?? item.salePrice ?? item.cost) || 0,
          cost: Number(existing?.cost ?? item.cost) || 0,
          stock: newStock,
        },
        { merge: true }
      );
    }

    await touchInventorySyncStamp(batch, slug);
    await batch.commit();
  } catch (invError) {
    console.warn('Warning reverting inventory stock on purchase cancel:', invError);
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

export async function fetchUsersOnce(
  _forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<UserAccount[]> {
  const slug = normalizeCompanySlug(companyId);
  const cached = getCachedUsers(slug);
  try {
    const snapshot = await getDocs(collection(db, 'users'));
    const records: UserAccount[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug)) return;
      records.push({
        id: docSnap.id,
        companyId: data.companyId || 'gosen',
        name: data.name || '',
        username: data.username || '',
        password: data.password || '',
        role: data.role === 'admin' ? 'admin' : 'collaborator',
        isActive: data.isActive !== false,
        allowedTabs: Array.isArray(data.allowedTabs) ? data.allowedTabs : ['sales', 'inventory', 'price-checker'],
        salesPermissions: data.salesPermissions
          ? {
              canEditSales:
                data.salesPermissions.canEditSales !== undefined
                  ? Boolean(data.salesPermissions.canEditSales)
                  : true,
              canCancelSales: Boolean(data.salesPermissions.canCancelSales),
              canViewCostsAndProfits: Boolean(data.salesPermissions.canViewCostsAndProfits),
            }
          : {
              canEditSales: true,
              canCancelSales: false,
              canViewCostsAndProfits: false,
            },
        createdAt: Number(data.createdAt) || Date.now(),
        lastLoginAt: data.lastLoginAt ? Number(data.lastLoginAt) : undefined,
      });
    });
    records.sort((a, b) => a.name.localeCompare(b.name));
    setCachedUsers(records, slug);
    return records;
  } catch (error) {
    if (cached) return cached;
    console.warn('Could not fetch users:', error);
    return [];
  }
}

export function subscribeToUsers(
  onData: (users: UserAccount[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = normalizeCompanySlug(companyId);
  const collRef = collection(db, 'users');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug)) return;
        records.push({
          id: docSnap.id,
          companyId: data.companyId || 'gosen',
          name: data.name || '',
          username: data.username || '',
          password: data.password || '',
          role: data.role === 'admin' ? 'admin' : 'collaborator',
          isActive: data.isActive !== false,
          allowedTabs: Array.isArray(data.allowedTabs) ? data.allowedTabs : ['sales', 'inventory', 'price-checker'],
          salesPermissions: data.salesPermissions
            ? {
                canEditSales:
                  data.salesPermissions.canEditSales !== undefined
                    ? Boolean(data.salesPermissions.canEditSales)
                    : true,
                canCancelSales: Boolean(data.salesPermissions.canCancelSales),
                canViewCostsAndProfits: Boolean(data.salesPermissions.canViewCostsAndProfits),
              }
            : {
                canEditSales: true,
                canCancelSales: false,
                canViewCostsAndProfits: false,
              },
          createdAt: Number(data.createdAt) || Date.now(),
          lastLoginAt: data.lastLoginAt ? Number(data.lastLoginAt) : undefined,
        });
      });
      records.sort((a, b) => a.name.localeCompare(b.name));
      setCachedUsers(records, slug);
      onData(records);
    },
    (error) => {
      console.warn('Users real-time subscription warning:', error);
      if (onError) onError(error);
    }
  );
}

export async function saveUserToFirestore(
  user: UserAccount,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(user.companyId || companyId);
  const rawUserId = user.id || `usr_${Date.now()}`;
  const userId = getScopedDocId(rawUserId, slug);
  const docRef = doc(db, 'users', userId);
  const payload = {
    companyId: slug,
    name: user.name.trim(),
    username: user.username.trim().toLowerCase(),
    password: user.password.trim(),
    role: user.role,
    isActive: user.isActive,
    allowedTabs: user.allowedTabs,
    salesPermissions: {
      canEditSales: user.salesPermissions?.canEditSales !== undefined ? Boolean(user.salesPermissions.canEditSales) : true,
      canCancelSales: Boolean(user.salesPermissions?.canCancelSales),
      canViewCostsAndProfits: Boolean(user.salesPermissions?.canViewCostsAndProfits),
    },
    createdAt: user.createdAt || Date.now(),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
  };
  try {
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

export async function deleteUserFromFirestore(
  userId: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  try {
    await deleteDoc(doc(db, 'users', userId));
    if (slug !== 'gosen' && !userId.startsWith(`${slug}__`)) {
      await deleteDoc(doc(db, 'users', getScopedDocId(userId, slug))).catch(() => {});
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${userId}`);
  }
}

// ----------------- ACTIVITY LOGS & MOVEMENT AUDIT TRAIL -----------------

function isSaaSSuperAdminUserOrSession(userName?: string): boolean {
  const cleanName = (userName || '').trim().toLowerCase();
  if (
    cleanName.includes('administrador saas') ||
    cleanName.includes('admin saas') ||
    cleanName.includes('superadmin') ||
    cleanName.includes('consola saas')
  ) {
    return true;
  }
  if (typeof window !== 'undefined') {
    try {
      if (localStorage.getItem('stockmaster_saas_owner_unlocked') === 'true') {
        return true;
      }
      const rawSess =
        localStorage.getItem('stockmaster_user_session') ||
        sessionStorage.getItem('stockmaster_user_session');
      if (rawSess) {
        const parsed = JSON.parse(rawSess);
        if (parsed?.isSuperAdmin === true) {
          return true;
        }
      }
    } catch {}
  }
  return false;
}

export async function fetchActivityLogsOnce(
  companyId = getActiveCompanyId()
): Promise<ActivityLogRecord[]> {
  const slug = normalizeCompanySlug(companyId);
  try {
    const snapshot = await getDocs(query(collection(db, 'activity_logs'), limit(200)));
    const records: ActivityLogRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug)) return;
      const uName = String(data.userName || 'Usuario');
      const lowerName = uName.trim().toLowerCase();
      if (
        lowerName.includes('administrador saas') ||
        lowerName.includes('admin saas') ||
        lowerName.includes('superadmin')
      ) {
        // Silently purge any previous SaaS supervision log so the client never sees it
        deleteDoc(doc(db, 'activity_logs', docSnap.id)).catch(() => {});
        return;
      }
      records.push({
        id: docSnap.id,
        companyId: data.companyId || 'gosen',
        timestamp: Number(data.timestamp) || Date.now(),
        date: data.date || new Date().toLocaleString('es-HN'),
        userName: uName,
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
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = normalizeCompanySlug(companyId);
  const collRef = collection(db, 'activity_logs');
  return onSnapshot(
    collRef,
    (snapshot) => {
      const records: ActivityLogRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug)) return;
        const uName = String(data.userName || 'Usuario');
        const lowerName = uName.trim().toLowerCase();
        if (
          lowerName.includes('administrador saas') ||
          lowerName.includes('admin saas') ||
          lowerName.includes('superadmin')
        ) {
          return;
        }
        records.push({
          id: docSnap.id,
          companyId: data.companyId || 'gosen',
          timestamp: Number(data.timestamp) || Date.now(),
          date: data.date || new Date().toLocaleString('es-HN'),
          userName: uName,
          userRole: data.userRole === 'admin' ? 'admin' : 'collaborator',
          action: data.action || '',
          module: data.module || 'sales',
          details: data.details || '',
        });
      });
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
  log: Omit<ActivityLogRecord, 'id' | 'timestamp' | 'date'>,
  companyId = getActiveCompanyId()
): Promise<void> {
  // Stealth Mode: Never record activity logs when logged in as SaaS Super-Admin
  if (isSaaSSuperAdminUserOrSession(log.userName)) {
    return;
  }

  const slug = normalizeCompanySlug(log.companyId || companyId);
  const logId = getScopedDocId(`act_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, slug);
  const docRef = doc(db, 'activity_logs', logId);
  const now = new Date();
  const payload = {
    companyId: slug,
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

// ----------------- MULTI-COMPANY / SAAS CLIENT TENANTS MANAGEMENT -----------------

export const DEFAULT_GOSEN_COMPANY: CompanyTenant = {
  id: 'gosen',
  name: 'Tienda Gosén',
  slug: 'gosen',
  ownerName: 'Administración Gosén',
  phone: '',
  email: 'Luisenamorell@gmail.com',
  plan: 'vitalicio',
  price: 0,
  status: 'active',
  adminPassword: 'GOSEN2026',
  logoUrl: '/store-logo.jpg',
  tagline: 'Control de Inventario y Ventas',
  allowedModules: ALL_COMPANY_MODULES,
  enableDeliveryDvolada: true,
  maxProducts: 0,
  maxUsers: 0,
  paymentHistory: [],
  createdAt: 1704067200000,
  isPrimary: true,
};

function sanitizeCompanyDoc(slug: string, data: Record<string, any>): CompanyTenant {
  const rawLogo = data.logoUrl !== undefined ? data.logoUrl : slug === 'gosen' ? '/store-logo.jpg' : '';
  const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
  const parsedHistory: SubscriptionPaymentRecord[] = Array.isArray(data.paymentHistory)
    ? data.paymentHistory.map((p: any) => ({
        id: String(p.id || `pay_${Date.now()}`),
        receiptNumber: String(p.receiptNumber || 'REC-001'),
        companySlug: String(p.companySlug || slug),
        companyName: String(p.companyName || data.name || slug),
        amount: Number(p.amount) || 0,
        plan: ['mensual', 'anual', 'vitalicio', 'prueba'].includes(p.plan) ? p.plan : 'mensual',
        paymentMethod: ['transferencia', 'efectivo', 'tarjeta', 'otro'].includes(p.paymentMethod)
          ? p.paymentMethod
          : 'transferencia',
        reference: p.reference ? String(p.reference) : '',
        periodLabel: String(p.periodLabel || 'Renovación de Suscripción'),
        previousBillingDate: p.previousBillingDate ? String(p.previousBillingDate) : '',
        newBillingDate: String(p.newBillingDate || ''),
        paidAt: Number(p.paidAt) || Date.now(),
        dateFormatted: String(p.dateFormatted || new Date().toLocaleDateString('es-HN')),
        notes: p.notes ? String(p.notes) : '',
      }))
    : [];

  return {
    id: slug,
    name: data.name || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
    slug,
    ownerName: data.ownerName || 'Propietario',
    phone: data.phone || '',
    email: data.email || '',
    plan: ['mensual', 'anual', 'vitalicio', 'prueba'].includes(data.plan) ? data.plan : 'mensual',
    price: Number(data.price) || 0,
    nextBillingDate: data.nextBillingDate || '',
    status: data.status === 'suspended' ? 'suspended' : 'active',
    moraReason: data.moraReason || '',
    suspendedAt: data.suspendedAt ? Number(data.suspendedAt) : undefined,
    autoSuspend: data.autoSuspend !== undefined ? Boolean(data.autoSuspend) : true,
    adminPassword: data.adminPassword || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
    logoUrl: safeLogo,
    tagline: data.tagline || 'Control de Inventario y Ventas',
    address: data.address || '',
    notes: data.notes || '',
    allowedModules:
      Array.isArray(data.allowedModules) && data.allowedModules.length > 0
        ? (data.allowedModules as ActiveTab[])
        : ALL_COMPANY_MODULES,
    enableDeliveryDvolada:
      data.enableDeliveryDvolada !== undefined
        ? Boolean(data.enableDeliveryDvolada)
        : slug === 'gosen',
    maxProducts: Math.max(0, Number(data.maxProducts) || 0),
    maxUsers: Math.max(0, Number(data.maxUsers) || 0),
    paymentHistory: parsedHistory,
    createdAt: Number(data.createdAt) || Date.now(),
    isPrimary: slug === 'gosen',
  };
}

export async function fetchCompaniesOnce(_forceRefresh = false): Promise<CompanyTenant[]> {
  const cached = getCachedCompanies();
  try {
    const snapshot = await getDocs(collection(db, 'companies'));
    const map = new Map<string, CompanyTenant>();
    map.set('gosen', { ...DEFAULT_GOSEN_COMPANY });

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const slug = normalizeCompanySlug(data.slug || docSnap.id);
      map.set(slug, sanitizeCompanyDoc(slug, data));
    });

    const list = Array.from(map.values()).sort((a, b) => {
      if (a.slug === 'gosen') return -1;
      if (b.slug === 'gosen') return 1;
      return b.createdAt - a.createdAt;
    });

    setCachedCompanies(list);
    return list;
  } catch (error) {
    if (cached && cached.length > 0) return cached;
    return [DEFAULT_GOSEN_COMPANY];
  }
}

export function subscribeToCompaniesRealtime(
  onData: (companies: CompanyTenant[]) => void
): () => void {
  try {
    return onSnapshot(
      collection(db, 'companies'),
      (snapshot) => {
        const map = new Map<string, CompanyTenant>();
        map.set('gosen', { ...DEFAULT_GOSEN_COMPANY });

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const slug = normalizeCompanySlug(data.slug || docSnap.id);
          map.set(slug, sanitizeCompanyDoc(slug, data));
        });

        const list = Array.from(map.values()).sort((a, b) => {
          if (a.slug === 'gosen') return -1;
          if (b.slug === 'gosen') return 1;
          return b.createdAt - a.createdAt;
        });

        setCachedCompanies(list);
        onData(list);
      },
      (err) => {
        console.warn('Companies realtime listener warning:', err);
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveCompanyToFirestore(company: CompanyTenant): Promise<CompanyTenant> {
  const slug = normalizeCompanySlug(company.slug || company.id);
  const docRef = doc(db, 'companies', slug);

  const rawLogo = (company.logoUrl || '').trim();
  const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
  const safeAllowedModules: ActiveTab[] =
    Array.isArray(company.allowedModules) && company.allowedModules.length > 0
      ? company.allowedModules
      : ALL_COMPANY_MODULES;
  const safeDeliveryDvolada =
    company.enableDeliveryDvolada !== undefined
      ? Boolean(company.enableDeliveryDvolada)
      : slug === 'gosen';
  const safeMaxProducts = Math.max(0, Number(company.maxProducts) || 0);
  const safeMaxUsers = Math.max(0, Number(company.maxUsers) || 0);
  const safePaymentHistory: SubscriptionPaymentRecord[] = Array.isArray(company.paymentHistory)
    ? company.paymentHistory
    : [];

  const normalized: CompanyTenant = {
    id: slug,
    name: company.name.trim(),
    slug,
    ownerName: (company.ownerName || 'Propietario').trim(),
    phone: (company.phone || '').trim(),
    email: (company.email || '').trim(),
    plan: company.plan || 'mensual',
    price: Math.max(0, Number(company.price) || 0),
    nextBillingDate: (company.nextBillingDate || '').trim(),
    status: company.status === 'suspended' ? 'suspended' : 'active',
    moraReason: (company.moraReason || '').trim(),
    suspendedAt: company.status === 'suspended' ? (company.suspendedAt || Date.now()) : undefined,
    autoSuspend: company.autoSuspend !== undefined ? Boolean(company.autoSuspend) : true,
    adminPassword: (company.adminPassword || 'ADMIN2026').trim(),
    logoUrl: safeLogo,
    tagline: (company.tagline || 'Control de Inventario y Ventas').trim(),
    address: (company.address || '').trim(),
    notes: (company.notes || '').trim(),
    allowedModules: safeAllowedModules,
    enableDeliveryDvolada: safeDeliveryDvolada,
    maxProducts: safeMaxProducts,
    maxUsers: safeMaxUsers,
    paymentHistory: safePaymentHistory,
    createdAt: company.createdAt || Date.now(),
    isPrimary: slug === 'gosen',
  };

  try {
    const batch = writeBatch(db);
    batch.set(
      docRef,
      {
        name: normalized.name,
        slug: normalized.slug,
        ownerName: normalized.ownerName,
        phone: normalized.phone,
        email: normalized.email,
        plan: normalized.plan,
        price: normalized.price,
        nextBillingDate: normalized.nextBillingDate,
        status: normalized.status,
        moraReason: normalized.moraReason || '',
        suspendedAt: normalized.suspendedAt || null,
        autoSuspend: normalized.autoSuspend,
        adminPassword: normalized.adminPassword,
        logoUrl: normalized.logoUrl,
        tagline: normalized.tagline,
        address: normalized.address,
        notes: normalized.notes,
        allowedModules: normalized.allowedModules,
        enableDeliveryDvolada: normalized.enableDeliveryDvolada,
        maxProducts: normalized.maxProducts,
        maxUsers: normalized.maxUsers,
        paymentHistory: normalized.paymentHistory,
        createdAt: normalized.createdAt,
        isPrimary: normalized.isPrimary,
      },
      { merge: true }
    );

    // Also initialize/sync the company's store_profile settings document
    const profileRef = doc(db, 'settings', getStoreProfileDocId(slug));
    const profilePayload: StoreSettings = {
      companyId: slug,
      storeName: normalized.name,
      tagline: normalized.tagline,
      logoUrl: normalized.logoUrl,
      phone: normalized.phone,
      address: normalized.address,
      accessPassword: normalized.adminPassword,
      whatsappOrderPhone: normalized.phone,
      allowedModules: normalized.allowedModules,
      enableDeliveryDvolada: normalized.enableDeliveryDvolada,
      maxProducts: normalized.maxProducts,
      maxUsers: normalized.maxUsers,
      updatedAt: Date.now(),
    };
    batch.set(profileRef, profilePayload, { merge: true });
    setCachedStoreSettings(profilePayload, slug);

    await batch.commit();
    return normalized;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `companies/${slug}`);
  }
}

export async function deleteCompanyFromFirestore(companySlug: string): Promise<void> {
  const slug = normalizeCompanySlug(companySlug);
  if (slug === 'gosen') {
    throw new Error('No se puede eliminar la tienda principal Gosén.');
  }
  try {
    await deleteDoc(doc(db, 'companies', slug));
    await deleteDoc(doc(db, 'settings', getStoreProfileDocId(slug))).catch(() => {});
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `companies/${slug}`);
  }
}

// ----------------- SAAS GLOBAL CONFIG & ANNOUNCEMENTS -----------------

const SAAS_GLOBAL_CACHE_KEY = 'stockmaster_saas_global_config_v1';

export const DEFAULT_SAAS_GLOBAL_CONFIG: SaaSGlobalConfig = {
  saasAdminPhone: '',
  saasBrandName: 'MIAPPHN',
  saasLogo: '/assets/aistudio/miapphn-logo-fondo-oscuro_c705844a.png',
  expiryWarningDays: 5,
  autoSuspendOverdue: true,
  gracePeriodDays: 3,
  bankAccounts: [],
  announcements: [],
  updatedAt: Date.now(),
};

export function getCachedSaaSGlobalConfig(): SaaSGlobalConfig {
  const cached = safeReadCache<SaaSGlobalConfig>(SAAS_GLOBAL_CACHE_KEY);
  return cached || { ...DEFAULT_SAAS_GLOBAL_CONFIG };
}

export function setCachedSaaSGlobalConfig(config: SaaSGlobalConfig): void {
  safeWriteCache(SAAS_GLOBAL_CACHE_KEY, config);
}

function sanitizeSaaSGlobalDoc(data: Record<string, any>): SaaSGlobalConfig {
  const announcements: SaaSAnnouncement[] = Array.isArray(data.announcements)
    ? data.announcements.map((a: any) => ({
        id: String(a.id || `ann_${Date.now()}`),
        title: String(a.title || 'Comunicado del Administrador'),
        message: String(a.message || ''),
        type: ['info', 'warning', 'update', 'promo'].includes(a.type) ? a.type : 'info',
        targetCompanySlug: String(a.targetCompanySlug || 'all'),
        isActive: a.isActive !== false,
        createdAt: Number(a.createdAt) || Date.now(),
        author: a.author ? String(a.author) : 'Administrador MIAPPHN',
      }))
    : [];

  const bankAccounts: SaaSBankAccount[] = Array.isArray(data.bankAccounts)
    ? data.bankAccounts.map((b: any) => ({
        id: String(b.id || `bank_${Date.now()}`),
        bankName: String(b.bankName || 'Banco'),
        accountNumber: String(b.accountNumber || ''),
        accountType: String(b.accountType || 'Ahorro'),
        holderName: String(b.holderName || ''),
        identidadOrRtn: b.identidadOrRtn ? String(b.identidadOrRtn) : '',
      }))
    : [];

  const rawBrand = String(data.saasBrandName || data.storeName || '').trim();
  const resolvedBrand =
    !rawBrand || rawBrand === 'Administración SaaS' ? 'MIAPPHN' : rawBrand;

  return {
    saasAdminPhone: String(data.saasAdminPhone || ''),
    saasBrandName: resolvedBrand,
    saasLogo: data.saasLogo
      ? String(data.saasLogo)
      : '/assets/aistudio/miapphn-logo-fondo-oscuro_c705844a.png',
    customDomain: data.customDomain ? String(data.customDomain) : undefined,
    expiryWarningDays: Math.max(1, Math.min(30, Number(data.expiryWarningDays) || 5)),
    autoSuspendOverdue: data.autoSuspendOverdue !== undefined ? Boolean(data.autoSuspendOverdue) : true,
    gracePeriodDays: Math.max(0, Math.min(30, Number(data.gracePeriodDays ?? 3))),
    bankAccounts,
    announcements,
    contractDefaults: data.contractDefaults || undefined,
    updatedAt: Number(data.updatedAt) || Date.now(),
  };
}

export async function fetchSaaSGlobalConfigOnce(): Promise<SaaSGlobalConfig> {
  try {
    const docRef = doc(db, 'settings', 'saas_global_config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const cfg = sanitizeSaaSGlobalDoc(snap.data());
      setCachedSaaSGlobalConfig(cfg);
      return cfg;
    }
    return getCachedSaaSGlobalConfig();
  } catch {
    return getCachedSaaSGlobalConfig();
  }
}

export function subscribeToSaaSGlobalConfig(
  onData: (config: SaaSGlobalConfig) => void
): () => void {
  try {
    const docRef = doc(db, 'settings', 'saas_global_config');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const cfg = sanitizeSaaSGlobalDoc(snap.data());
          setCachedSaaSGlobalConfig(cfg);
          onData(cfg);
        }
      },
      (err) => {
        console.warn('SaaS global config realtime listener warning:', err);
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveSaaSGlobalConfigToFirestore(
  config: SaaSGlobalConfig
): Promise<SaaSGlobalConfig> {
  const docRef = doc(db, 'settings', 'saas_global_config');
  const normalized: SaaSGlobalConfig = {
    saasAdminPhone: (config.saasAdminPhone || '').trim(),
    saasBrandName: (config.saasBrandName || 'Administración SaaS').trim(),
    customDomain: config.customDomain ? config.customDomain.trim() : undefined,
    expiryWarningDays: Math.max(1, Math.min(30, Number(config.expiryWarningDays) || 5)),
    autoSuspendOverdue: config.autoSuspendOverdue !== undefined ? Boolean(config.autoSuspendOverdue) : true,
    gracePeriodDays: Math.max(0, Math.min(30, Number(config.gracePeriodDays ?? 3))),
    bankAccounts: Array.isArray(config.bankAccounts) ? config.bankAccounts : [],
    announcements: Array.isArray(config.announcements) ? config.announcements : [],
    contractDefaults: config.contractDefaults,
    updatedAt: Date.now(),
  };

  try {
    await setDoc(
      docRef,
      stripUndefinedDeep({
        storeName: normalized.saasBrandName.slice(0, 190), // satisfies isValidStoreSettings
        saasAdminPhone: normalized.saasAdminPhone,
        saasBrandName: normalized.saasBrandName,
        customDomain: normalized.customDomain,
        expiryWarningDays: normalized.expiryWarningDays,
        autoSuspendOverdue: normalized.autoSuspendOverdue,
        gracePeriodDays: normalized.gracePeriodDays,
        bankAccounts: normalized.bankAccounts,
        announcements: normalized.announcements,
        contractDefaults: normalized.contractDefaults,
        updatedAt: normalized.updatedAt,
      }),
      { merge: true }
    );
    setCachedSaaSGlobalConfig(normalized);
    return normalized;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/saas_global_config');
  }
}

// ----------------- SAAS DEMO REQUESTS & COMMERCIAL LEADS (MIAPPHN.ONLINE) -----------------

const SAAS_DEMO_REQUESTS_CACHE_KEY = 'stockmaster_saas_demo_requests_v1';

export function getCachedSaaSDemoRequests(): SaaSDemoRequest[] {
  const cached = safeReadCache<SaaSDemoRequest[]>(SAAS_DEMO_REQUESTS_CACHE_KEY);
  return Array.isArray(cached) ? cached : [];
}

export function setCachedSaaSDemoRequests(requests: SaaSDemoRequest[]): void {
  safeWriteCache(SAAS_DEMO_REQUESTS_CACHE_KEY, requests);
}

function sanitizeSaaSDemoRequestsDoc(data: Record<string, any>): SaaSDemoRequest[] {
  const list = Array.isArray(data.requests) ? data.requests : [];
  return list
    .map((item: any): SaaSDemoRequest => ({
      id: String(item.id || `demo_${Date.now()}`),
      requestCode: String(item.requestCode || 'DEMO-001'),
      contactName: String(item.contactName || ''),
      businessName: String(item.businessName || ''),
      phone: String(item.phone || ''),
      email: item.email ? String(item.email) : '',
      city: String(item.city || ''),
      businessType: String(item.businessType || 'Comercio General'),
      planInterest: ['prueba15', 'emprendedor', 'comercial', 'empresarial', 'anual', 'vitalicio'].includes(
        item.planInterest
      )
        ? item.planInterest
        : 'prueba15',
      planLabel: String(item.planLabel || 'Demo Prueba 15 Días'),
      notes: item.notes ? String(item.notes) : '',
      status: ['pending', 'contacted', 'demo_created', 'converted', 'archived'].includes(item.status)
        ? item.status
        : 'pending',
      createdTenantSlug: item.createdTenantSlug ? String(item.createdTenantSlug) : undefined,
      createdTenantPassword: item.createdTenantPassword ? String(item.createdTenantPassword) : undefined,
      createdAt: Number(item.createdAt) || Date.now(),
      dateFormatted: String(item.dateFormatted || new Date().toLocaleDateString('es-HN')),
      updatedAt: Number(item.updatedAt) || Date.now(),
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function fetchSaaSDemoRequestsOnce(): Promise<SaaSDemoRequest[]> {
  try {
    const docRef = doc(db, 'settings', 'saas_demo_requests');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const list = sanitizeSaaSDemoRequestsDoc(snap.data());
      setCachedSaaSDemoRequests(list);
      return list;
    }
    return getCachedSaaSDemoRequests();
  } catch {
    return getCachedSaaSDemoRequests();
  }
}

export function subscribeToSaaSDemoRequests(
  onData: (requests: SaaSDemoRequest[]) => void
): () => void {
  try {
    const docRef = doc(db, 'settings', 'saas_demo_requests');
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const list = sanitizeSaaSDemoRequestsDoc(snap.data());
          setCachedSaaSDemoRequests(list);
          onData(list);
        } else {
          onData(getCachedSaaSDemoRequests());
        }
      },
      (err) => {
        console.warn('SaaS demo requests listener warning:', err);
      }
    );
  } catch {
    return () => {};
  }
}

async function persistSaaSDemoRequestsList(list: SaaSDemoRequest[]): Promise<SaaSDemoRequest[]> {
  const docRef = doc(db, 'settings', 'saas_demo_requests');
  const trimmed = list
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 300);

  try {
    await setDoc(
      docRef,
      stripUndefinedDeep({
        storeName: 'Solicitudes Demo SaaS', // satisfies isValidStoreSettings
        requests: trimmed,
        updatedAt: Date.now(),
      }),
      { merge: true }
    );
    setCachedSaaSDemoRequests(trimmed);
    return trimmed;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/saas_demo_requests');
  }
}

export async function submitSaaSDemoRequest(
  newReq: SaaSDemoRequest
): Promise<SaaSDemoRequest[]> {
  const current = await fetchSaaSDemoRequestsOnce();
  const nextList = [newReq, ...current.filter((r) => r.id !== newReq.id)];
  return persistSaaSDemoRequestsList(nextList);
}

export async function updateSaaSDemoRequestInFirestore(
  updatedReq: SaaSDemoRequest
): Promise<SaaSDemoRequest[]> {
  const current = await fetchSaaSDemoRequestsOnce();
  const nextList = current.map((r) =>
    r.id === updatedReq.id ? { ...updatedReq, updatedAt: Date.now() } : r
  );
  return persistSaaSDemoRequestsList(nextList);
}

export async function deleteSaaSDemoRequestFromFirestore(
  requestId: string
): Promise<SaaSDemoRequest[]> {
  const current = await fetchSaaSDemoRequestsOnce();
  const nextList = current.filter((r) => r.id !== requestId);
  return persistSaaSDemoRequestsList(nextList);
}

// ----------------- SAAS TENANT LIVE METRICS, CLONING & FULL BACKUP -----------------

export async function fetchAllTenantsUsageMetrics(
  companySlugs: string[]
): Promise<Record<string, TenantUsageMetrics>> {
  const result: Record<string, TenantUsageMetrics> = {};
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0).getTime();

  const ensureEntry = (rawSlug: string): TenantUsageMetrics => {
    const s = normalizeCompanySlug(rawSlug || 'gosen');
    if (!result[s]) {
      result[s] = {
        companySlug: s,
        productCount: 0,
        userCount: 0,
        monthlySalesCount: 0,
        monthlySalesTotal: 0,
        totalSalesCount: 0,
        lastSaleTimestamp: null,
      };
    }
    return result[s];
  };

  companySlugs.forEach((slug) => ensureEntry(slug));

  const inferSlugFromDoc = (docId: string, dataCompanyId?: any): string => {
    if (typeof dataCompanyId === 'string' && dataCompanyId.trim()) {
      return normalizeCompanySlug(dataCompanyId);
    }
    if (docId.includes('__')) {
      const prefix = docId.split('__')[0];
      if (prefix) return normalizeCompanySlug(prefix);
    }
    return 'gosen';
  };

  try {
    const [invSnap, usrSnap, salesSnap] = await Promise.all([
      getDocs(collection(db, 'inventory')),
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'sales')),
    ]);

    invSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const slug = inferSlugFromDoc(docSnap.id, data.companyId);
      const entry = ensureEntry(slug);
      entry.productCount += 1;
    });

    usrSnap.forEach((docSnap) => {
      const data = docSnap.data();
      const slug = inferSlugFromDoc(docSnap.id, data.companyId);
      const entry = ensureEntry(slug);
      entry.userCount += 1;
    });

    salesSnap.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.status === 'cancelled') return;
      const slug = inferSlugFromDoc(docSnap.id, data.companyId);
      const entry = ensureEntry(slug);
      const ts = Number(data.timestamp) || 0;
      const total = Number(data.total) || 0;
      entry.totalSalesCount += 1;
      if (ts >= monthStart) {
        entry.monthlySalesCount += 1;
        entry.monthlySalesTotal += total;
      }
      if (ts > 0 && (!entry.lastSaleTimestamp || ts > entry.lastSaleTimestamp)) {
        entry.lastSaleTimestamp = ts;
      }
    });
  } catch (err) {
    console.warn('Could not load SaaS tenant usage metrics:', err);
  }

  return result;
}

export async function exportCompanyFullBackup(companySlug: string): Promise<{
  companySlug: string;
  exportedAt: string;
  inventory: Product[];
  sales: SaleRecord[];
  purchases: PurchaseInvoice[];
  suppliers: Supplier[];
  users: UserAccount[];
  storeSettings: StoreSettings;
}> {
  const slug = normalizeCompanySlug(companySlug);
  const [invRes, sales, purchases, suppliers, users, storeSettings] = await Promise.all([
    fetchInventorySmart(true, slug),
    fetchSalesOnce(true, slug),
    fetchPurchasesOnce(true, slug),
    fetchSuppliersOnce(true, slug),
    fetchUsersOnce(true, slug),
    fetchStoreSettingsOnce(slug),
  ]);

  return {
    companySlug: slug,
    exportedAt: new Date().toISOString(),
    inventory: invRes.items,
    sales,
    purchases,
    suppliers,
    users,
    storeSettings,
  };
}

export const STARTER_INDUSTRY_TEMPLATES: Record<
  'ropa_calzado' | 'pulperia_abarrotes' | 'ferreteria_repuestos' | 'farmacia_cosmeticos',
  { label: string; description: string; items: Omit<Product, 'id' | 'companyId'>[] }
> = {
  ropa_calzado: {
    label: 'Ropa, Boutique y Calzado',
    description: 'Categorías de Damas, Caballeros, Niños, Calzado y Accesorios con artículos ejemplo.',
    items: [
      { code: 'ROP-001', name: 'Camisa Casual Caballero', category: 'Caballeros', size: 'M', cost: 220, price: 380, stock: 10 },
      { code: 'ROP-002', name: 'Pantalón Jeans Clásico', category: 'Caballeros', size: '32', cost: 350, price: 590, stock: 8 },
      { code: 'ROP-003', name: 'Blusa Elegante Dama', category: 'Damas', size: 'S', cost: 190, price: 350, stock: 12 },
      { code: 'CAL-001', name: 'Tenis Deportivos Unisex', category: 'Calzado', size: '40', cost: 480, price: 850, stock: 6 },
      { code: 'ACC-001', name: 'Faja de Cuero Ajustable', category: 'Accesorios', size: 'Única', cost: 95, price: 180, stock: 15 },
    ],
  },
  pulperia_abarrotes: {
    label: 'Pulpería, Mini Súper y Abarrotería',
    description: 'Granos básicos, Bebidas, Lácteos, Snacks y Limpieza listos para facturar.',
    items: [
      { code: 'ABA-001', name: 'Arroz Blanco 1 Libra', category: 'Granos Básicos', cost: 11, price: 15, stock: 50 },
      { code: 'ABA-002', name: 'Frijoles Rojos 1 Libra', category: 'Granos Básicos', cost: 18, price: 24, stock: 40 },
      { code: 'BEB-001', name: 'Refresco Desechable 2 Litros', category: 'Bebidas', cost: 34, price: 45, stock: 30 },
      { code: 'LAC-001', name: 'Leche Entera 1 Litro', category: 'Lácteos', cost: 26, price: 34, stock: 20 },
      { code: 'LIM-001', name: 'Detergente en Polvo 500g', category: 'Limpieza', cost: 22, price: 30, stock: 25 },
    ],
  },
  ferreteria_repuestos: {
    label: 'Ferretería, Repuestos y Herramientas',
    description: 'Herramientas, Electricidad, Plomería, Pinturas y Tornillería.',
    items: [
      { code: 'FER-001', name: 'Martillo de Uña Profesional 16oz', category: 'Herramientas', cost: 110, price: 175, stock: 12 },
      { code: 'FER-002', name: 'Cinta Métrica 5 Metros', category: 'Herramientas', cost: 45, price: 80, stock: 20 },
      { code: 'ELE-001', name: 'Foco LED Ahorrador 12W', category: 'Electricidad', cost: 28, price: 50, stock: 40 },
      { code: 'PLO-001', name: 'Tubo PVC 1/2 Pulgada', category: 'Plomería', cost: 55, price: 90, stock: 25 },
      { code: 'LUB-001', name: 'Aceite Multigrado 20W-50 1 Cuarto', category: 'Lubricantes', cost: 135, price: 195, stock: 18 },
    ],
  },
  farmacia_cosmeticos: {
    label: 'Cosméticos, Perfumería y Variedades',
    description: 'Cuidado personal, Perfumería, Maquillaje y Regalos.',
    items: [
      { code: 'COS-001', name: 'Crema Hidratante Corporal 400ml', category: 'Cuidado Personal', cost: 85, price: 150, stock: 15 },
      { code: 'PER-001', name: 'Loción Corporal Fragancia Floral', category: 'Perfumería', cost: 140, price: 260, stock: 10 },
      { code: 'MAQ-001', name: 'Labial Mate Larga Duración', category: 'Maquillaje', cost: 45, price: 95, stock: 24 },
      { code: 'CAB-001', name: 'Shampoo Reparación Intensa 500ml', category: 'Cuidado Capilar', cost: 90, price: 165, stock: 14 },
    ],
  },
};

export async function cloneStoreCatalogToTenant(
  sourceCompanySlug: string,
  targetCompanySlug: string,
  options: { includeStock: boolean; includePrices: boolean }
): Promise<number> {
  const srcSlug = normalizeCompanySlug(sourceCompanySlug);
  const dstSlug = normalizeCompanySlug(targetCompanySlug);
  if (srcSlug === dstSlug) {
    throw new Error('La tienda de origen y destino no pueden ser la misma.');
  }
  if (dstSlug === 'gosen') {
    throw new Error('Por seguridad no se puede sobrescribir la tienda principal Gosén.');
  }

  const { items: sourceProducts } = await fetchInventorySmart(true, srcSlug);
  if (sourceProducts.length === 0) {
    return 0;
  }

  const clonedProducts: Product[] = sourceProducts.map((p) => ({
    ...p,
    id: p.code,
    companyId: dstSlug,
    stock: options.includeStock ? p.stock : 0,
    cost: options.includePrices ? p.cost : 0,
    price: options.includePrices ? p.price : 0,
  }));

  await bulkSaveProductsToFirestore(clonedProducts, [], dstSlug);
  return clonedProducts.length;
}

export async function seedStarterTemplateToTenant(
  templateKey: keyof typeof STARTER_INDUSTRY_TEMPLATES,
  targetCompanySlug: string
): Promise<number> {
  const dstSlug = normalizeCompanySlug(targetCompanySlug);
  if (dstSlug === 'gosen') {
    throw new Error('Por seguridad no se puede aplicar plantilla sobre Tienda Gosén.');
  }
  const tpl = STARTER_INDUSTRY_TEMPLATES[templateKey];
  if (!tpl) return 0;

  const products: Product[] = tpl.items.map((item) => ({
    ...item,
    id: item.code,
    companyId: dstSlug,
  }));

  await bulkSaveProductsToFirestore(products, [], dstSlug);
  return products.length;
}

// ----------------- POS CASH REGISTER SHIFTS & STORE OPERATING EXPENSES -----------------

const POS_FINANCE_CACHE_BASE = 'stockmaster_pos_finance_v1';

function getPOSFinanceDocId(companyId = getActiveCompanyId()): string {
  const slug = normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'pos_finance_gosen' : `pos_finance_${slug}`;
}

export function getCachedPOSFinanceData(companyId = getActiveCompanyId()): POSFinanceStoreData {
  const slug = normalizeCompanySlug(companyId);
  const cached = safeReadCache<POSFinanceStoreData>(getScopedCacheKey(POS_FINANCE_CACHE_BASE, slug));
  return (
    cached || {
      companyId: slug,
      shifts: [],
      expenses: [],
      updatedAt: Date.now(),
    }
  );
}

export function setCachedPOSFinanceData(
  data: POSFinanceStoreData,
  companyId = getActiveCompanyId()
): void {
  const slug = normalizeCompanySlug(companyId);
  safeWriteCache(getScopedCacheKey(POS_FINANCE_CACHE_BASE, slug), data);
}

function sanitizePOSFinanceDoc(slug: string, raw: Record<string, any>): POSFinanceStoreData {
  const shifts: CashRegisterShift[] = Array.isArray(raw.shifts)
    ? raw.shifts.map((s: any) => ({
        id: String(s.id || `shift_${Date.now()}`),
        companyId: slug,
        status: s.status === 'closed' ? 'closed' : 'open',
        openedAt: Number(s.openedAt) || Date.now(),
        openedDate: String(s.openedDate || ''),
        openedBy: String(s.openedBy || 'Administrador'),
        openingCash: Number(s.openingCash) || 0,
        cashMovements: Array.isArray(s.cashMovements)
          ? s.cashMovements.map((m: any) => ({
              id: String(m.id || `mov_${Date.now()}`),
              amount: Number(m.amount) || 0,
              reason: String(m.reason || ''),
              category: m.category ? String(m.category) : 'Otros',
              timestamp: Number(m.timestamp) || Date.now(),
              dateFormatted: String(m.dateFormatted || ''),
              user: String(m.user || 'Cajero'),
            }))
          : [],
        closedAt: s.closedAt ? Number(s.closedAt) : undefined,
        closedDate: s.closedDate ? String(s.closedDate) : undefined,
        closedBy: s.closedBy ? String(s.closedBy) : undefined,
        cashSalesTotal: s.cashSalesTotal !== undefined ? Number(s.cashSalesTotal) : undefined,
        transferSalesTotal:
          s.transferSalesTotal !== undefined ? Number(s.transferSalesTotal) : undefined,
        cardSalesTotal: s.cardSalesTotal !== undefined ? Number(s.cardSalesTotal) : undefined,
        creditSalesTotal: s.creditSalesTotal !== undefined ? Number(s.creditSalesTotal) : undefined,
        creditAbonosCashTotal:
          s.creditAbonosCashTotal !== undefined ? Number(s.creditAbonosCashTotal) : undefined,
        cashOutTotal: s.cashOutTotal !== undefined ? Number(s.cashOutTotal) : undefined,
        expectedCashInDrawer:
          s.expectedCashInDrawer !== undefined ? Number(s.expectedCashInDrawer) : undefined,
        countedPhysicalCash:
          s.countedPhysicalCash !== undefined ? Number(s.countedPhysicalCash) : undefined,
        difference: s.difference !== undefined ? Number(s.difference) : undefined,
        notes: s.notes ? String(s.notes) : '',
      }))
    : [];

  const validCategories: ExpenseCategory[] = [
    'Alquiler',
    'Energía / Servicios',
    'Pago de Personal',
    'Bolsas / Empaque',
    'Transporte / Envíos',
    'Publicidad',
    'Mantenimiento',
    'Otros',
  ];

  const expenses: StoreExpenseRecord[] = Array.isArray(raw.expenses)
    ? raw.expenses.map((e: any) => ({
        id: String(e.id || `exp_${Date.now()}`),
        companyId: slug,
        date: String(e.date || new Date().toISOString().slice(0, 10)),
        timestamp: Number(e.timestamp) || Date.now(),
        category: validCategories.includes(e.category) ? e.category : 'Otros',
        description: String(e.description || ''),
        amount: Number(e.amount) || 0,
        paymentMethod: ['cash', 'transfer', 'card'].includes(e.paymentMethod)
          ? e.paymentMethod
          : 'cash',
        registeredBy: String(e.registeredBy || 'Administrador'),
        fromCashDrawer: Boolean(e.fromCashDrawer),
      }))
    : [];

  return {
    companyId: slug,
    shifts: shifts.sort((a, b) => b.openedAt - a.openedAt),
    expenses: expenses.sort((a, b) => b.timestamp - a.timestamp),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export async function fetchPOSFinanceDataOnce(
  companyId = getActiveCompanyId()
): Promise<POSFinanceStoreData> {
  const slug = normalizeCompanySlug(companyId);
  try {
    const docRef = doc(db, 'settings', getPOSFinanceDocId(slug));
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const parsed = sanitizePOSFinanceDoc(slug, snap.data());
      setCachedPOSFinanceData(parsed, slug);
      return parsed;
    }
    return getCachedPOSFinanceData(slug);
  } catch {
    return getCachedPOSFinanceData(slug);
  }
}

export function subscribeToPOSFinanceData(
  onData: (data: POSFinanceStoreData) => void,
  companyId = getActiveCompanyId()
): () => void {
  const slug = normalizeCompanySlug(companyId);
  try {
    const docRef = doc(db, 'settings', getPOSFinanceDocId(slug));
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const parsed = sanitizePOSFinanceDoc(slug, snap.data());
          setCachedPOSFinanceData(parsed, slug);
          onData(parsed);
        } else {
          onData(getCachedPOSFinanceData(slug));
        }
      },
      (err) => {
        console.warn('POS finance listener warning:', err);
      }
    );
  } catch {
    return () => {};
  }
}

export async function savePOSFinanceDataToFirestore(
  data: POSFinanceStoreData,
  companyId = getActiveCompanyId()
): Promise<POSFinanceStoreData> {
  const slug = normalizeCompanySlug(data.companyId || companyId);
  const docRef = doc(db, 'settings', getPOSFinanceDocId(slug));
  const normalized: POSFinanceStoreData = {
    companyId: slug,
    shifts: Array.isArray(data.shifts) ? data.shifts.slice(0, 120) : [],
    expenses: Array.isArray(data.expenses) ? data.expenses.slice(0, 500) : [],
    updatedAt: Date.now(),
  };

  try {
    await setDoc(
      docRef,
      stripUndefinedDeep({
        storeName: `Finanzas POS ${slug}`.slice(0, 190), // satisfies isValidStoreSettings
        companyId: slug,
        shifts: normalized.shifts,
        expenses: normalized.expenses,
        updatedAt: normalized.updatedAt,
      }),
      { merge: true }
    );
    setCachedPOSFinanceData(normalized, slug);
    return normalized;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `settings/${getPOSFinanceDocId(slug)}`);
  }
}

// ----------------- MULTI-WAREHOUSE (BODEGAS) & STOCK TRANSFERS -----------------

const WAREHOUSES_CACHE_BASE = 'stockmaster_warehouses_v1';

export function getDefaultWarehousesForStore(): WarehouseLocation[] {
  return [
    {
      id: 'principal',
      code: 'BOD-01',
      name: 'Tienda Principal (Sala de Ventas)',
      address: 'Mostrador / Sala Principal',
      manager: 'Administración',
      phone: '',
      isMainSalesFloor: true,
      isActive: true,
      createdAt: 1704067200000,
    },
    {
      id: 'bodega_central',
      code: 'BOD-02',
      name: 'Bodega Central / Almacén',
      address: 'Almacén de Reserva',
      manager: 'Encargado de Bodega',
      phone: '',
      isMainSalesFloor: false,
      isActive: true,
      createdAt: 1704067201000,
    },
  ];
}

export function getProductStockInWarehouse(
  product: Product,
  warehouseId: string,
  warehouses: WarehouseLocation[] = getDefaultWarehousesForStore()
): number {
  const totalStock = Math.max(0, Math.round(Number(product.stock) || 0));
  const map = product.warehouseStocks || {};

  // Find the main sales floor warehouse ID (default 'principal')
  const mainWh = warehouses.find((w) => w.isMainSalesFloor) || warehouses[0];
  const mainWhId = mainWh ? mainWh.id : 'principal';

  // Sum explicitly assigned stock in non-main warehouses
  let otherWarehousesSum = 0;
  for (const [k, v] of Object.entries(map)) {
    if (k !== mainWhId) {
      otherWarehousesSum += Math.max(0, Math.round(Number(v) || 0));
    }
  }

  if (warehouseId === mainWhId) {
    if (map[mainWhId] !== undefined) {
      return Math.max(0, Math.round(Number(map[mainWhId]) || 0));
    }
    return Math.max(0, totalStock - otherWarehousesSum);
  }

  return Math.max(0, Math.round(Number(map[warehouseId]) || 0));
}

export function applyWarehouseStockDelta(
  product: Product | undefined,
  delta: number,
  warehouseId?: string,
  warehouses: WarehouseLocation[] = getDefaultWarehousesForStore()
): { newStock: number; newWarehouseStocks?: Record<string, number> } {
  const currentTotal = product ? Math.max(0, Math.round(Number(product.stock) || 0)) : 0;
  const newStock = Math.max(0, Math.round(currentTotal + delta));

  if (!product) {
    return { newStock };
  }

  const mainWh = warehouses.find((w) => w.isMainSalesFloor) || warehouses[0];
  const mainWhId = mainWh ? mainWh.id : 'principal';
  const targetWhId = warehouseId || mainWhId;

  // If the product has no warehouseStocks yet and the sale is from the main sales floor,
  // we only need to updatewarehouseStocks if it already exists; if it's from another warehouse
  // or warehouseStocks is already populated, compute the full breakdown map cleanly.
  const hasExplicitMap =
    product.warehouseStocks && Object.keys(product.warehouseStocks).length > 0;

  if (!hasExplicitMap && targetWhId === mainWhId) {
    return { newStock };
  }

  const nextMap: Record<string, number> = { ...(product.warehouseStocks || {}) };
  for (const wh of warehouses) {
    nextMap[wh.id] = getProductStockInWarehouse(product, wh.id, warehouses);
  }

  const currentInTarget = nextMap[targetWhId] ?? getProductStockInWarehouse(product, targetWhId, warehouses);
  nextMap[targetWhId] = Math.max(0, Math.round(currentInTarget + delta));

  // Recompute total stock as sum of all warehouses so they always match
  const sumAll = Object.values(nextMap).reduce(
    (acc, v) => acc + Math.max(0, Math.round(Number(v) || 0)),
    0
  );

  return {
    newStock: sumAll,
    newWarehouseStocks: nextMap,
  };
}

function getWarehousesDocId(companyId = getActiveCompanyId()): string {
  const slug = normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'warehouses_gosen' : `warehouses_${slug}`;
}

export function getCachedStoreWarehouses(companyId = getActiveCompanyId()): StoreWarehousesData {
  const slug = normalizeCompanySlug(companyId);
  const cached = safeReadCache<StoreWarehousesData>(
    getScopedCacheKey(WAREHOUSES_CACHE_BASE, slug)
  );
  if (cached && Array.isArray(cached.warehouses) && cached.warehouses.length > 0) {
    return cached;
  }
  return {
    companyId: slug,
    warehouses: getDefaultWarehousesForStore(),
    transfers: [],
    updatedAt: Date.now(),
  };
}

export function setCachedStoreWarehouses(
  data: StoreWarehousesData,
  companyId = getActiveCompanyId()
): void {
  const slug = normalizeCompanySlug(companyId);
  safeWriteCache(getScopedCacheKey(WAREHOUSES_CACHE_BASE, slug), data);
}

function sanitizeWarehousesDoc(slug: string, raw: Record<string, any>): StoreWarehousesData {
  const rawList = Array.isArray(raw.warehouses) ? raw.warehouses : [];
  const warehouses: WarehouseLocation[] =
    rawList.length > 0
      ? rawList.map((w: any, idx: number) => ({
          id: String(w.id || `wh_${idx + 1}`),
          code: String(w.code || `BOD-0${idx + 1}`),
          name: String(w.name || `Bodega ${idx + 1}`),
          address: w.address ? String(w.address) : '',
          manager: w.manager ? String(w.manager) : '',
          phone: w.phone ? String(w.phone) : '',
          isMainSalesFloor: Boolean(w.isMainSalesFloor),
          isActive: w.isActive !== false,
          createdAt: Number(w.createdAt) || Date.now(),
        }))
      : getDefaultWarehousesForStore();

  // Ensure at least one warehouse is marked as main sales floor
  if (!warehouses.some((w) => w.isMainSalesFloor) && warehouses.length > 0) {
    warehouses[0].isMainSalesFloor = true;
  }

  const transfers: WarehouseTransferRecord[] = Array.isArray(raw.transfers)
    ? raw.transfers.map((t: any) => ({
        id: String(t.id || `tr_${Date.now()}`),
        transferNumber: String(t.transferNumber || 'TRAS-001'),
        companyId: slug,
        fromWarehouseId: String(t.fromWarehouseId || 'bodega_central'),
        fromWarehouseName: String(t.fromWarehouseName || 'Bodega Origen'),
        toWarehouseId: String(t.toWarehouseId || 'principal'),
        toWarehouseName: String(t.toWarehouseName || 'Bodega Destino'),
        items: Array.isArray(t.items)
          ? t.items.map((it: any) => ({
              productId: String(it.productId || it.code || ''),
              code: String(it.code || ''),
              name: String(it.name || ''),
              category: it.category ? String(it.category) : '',
              size: it.size ? String(it.size) : '',
              quantity: Math.max(1, Number(it.quantity) || 1),
              cost: Number(it.cost) || 0,
              price: Number(it.price) || 0,
            }))
          : [],
        totalUnits: Number(t.totalUnits) || 0,
        notes: t.notes ? String(t.notes) : '',
        createdBy: String(t.createdBy || 'Administrador'),
        receivedBy: t.receivedBy ? String(t.receivedBy) : '',
        timestamp: Number(t.timestamp) || Date.now(),
        dateFormatted: String(t.dateFormatted || ''),
      }))
    : [];

  return {
    companyId: slug,
    warehouses,
    transfers: transfers.sort((a, b) => b.timestamp - a.timestamp),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  };
}

export async function fetchStoreWarehousesOnce(
  companyId = getActiveCompanyId()
): Promise<StoreWarehousesData> {
  const slug = normalizeCompanySlug(companyId);
  try {
    const docRef = doc(db, 'settings', getWarehousesDocId(slug));
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const parsed = sanitizeWarehousesDoc(slug, snap.data());
      setCachedStoreWarehouses(parsed, slug);
      return parsed;
    }
    return getCachedStoreWarehouses(slug);
  } catch {
    return getCachedStoreWarehouses(slug);
  }
}

export function subscribeToStoreWarehouses(
  onData: (data: StoreWarehousesData) => void,
  companyId = getActiveCompanyId()
): () => void {
  const slug = normalizeCompanySlug(companyId);
  try {
    const docRef = doc(db, 'settings', getWarehousesDocId(slug));
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const parsed = sanitizeWarehousesDoc(slug, snap.data());
          setCachedStoreWarehouses(parsed, slug);
          onData(parsed);
        } else {
          onData(getCachedStoreWarehouses(slug));
        }
      },
      (err) => {
        console.warn('Store warehouses listener warning:', err);
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveStoreWarehousesToFirestore(
  data: StoreWarehousesData,
  companyId = getActiveCompanyId()
): Promise<StoreWarehousesData> {
  const slug = normalizeCompanySlug(data.companyId || companyId);
  const docRef = doc(db, 'settings', getWarehousesDocId(slug));
  const normalized: StoreWarehousesData = {
    companyId: slug,
    warehouses:
      Array.isArray(data.warehouses) && data.warehouses.length > 0
        ? data.warehouses
        : getDefaultWarehousesForStore(),
    transfers: Array.isArray(data.transfers) ? data.transfers.slice(0, 300) : [],
    updatedAt: Date.now(),
  };

  try {
    await setDoc(
      docRef,
      stripUndefinedDeep({
        storeName: `Bodegas ${slug}`.slice(0, 190), // satisfies isValidStoreSettings
        companyId: slug,
        warehouses: normalized.warehouses,
        transfers: normalized.transfers,
        updatedAt: normalized.updatedAt,
      }),
      { merge: true }
    );
    setCachedStoreWarehouses(normalized, slug);
    return normalized;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `settings/${getWarehousesDocId(slug)}`);
  }
}

