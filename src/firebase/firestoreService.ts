import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  writeBatch,
  getDocs,
  getDocsFromCache,
  getDocsFromServer,
  getDoc,
  getDocFromCache,
  getDocFromServer,
  query,
  where,
  limit,
  WriteBatch
} from 'firebase/firestore';
import {
  Product,
  Supplier,
  AuditHistoryRecord,
  StoreSettings,
  StoreBranchLocation,
  StoreBankAccount,
  InvoiceTemplateConfig,
  SaleRecord,
  CreditPaymentAbone,
  CashOutMovement,
  CashRegisterShift,
  StoreExpenseRecord,
  POSFinanceStoreData,
  PosQuotationRecord,
  ExpenseCategory,
  PurchaseInvoice,
  UserAccount,
  ActivityLogRecord,
  CompanyTenant,
  ActiveTab,
  ALL_COMPANY_MODULES,
  resolveCompanyAllowedModules,
  SubscriptionPaymentRecord,
  SaaSAnnouncement,
  SaaSBankAccount,
  TenantUsageMetrics,
  SaaSGlobalConfig,
  SaaSDemoRequest,
  WarehouseLocation,
  WarehouseTransferItem,
  WarehouseTransferRecord,
  StoreWarehousesData,
  RestaurantStoreData,
  RestaurantTable,
  RestaurantTableOrder,
  KitchenCommandTicket,
  RestaurantOrderItem,
  KitchenCommandItem,
  RestaurantTableStatus,
  RestaurantTableShape,
  RestaurantOrderType,
  KitchenCommandStatus
} from '../types';
import { applyColorStockDelta, normalizeColorStocks } from '../utils/productColorUtils';
import { INITIAL_INVENTORY, INITIAL_SUPPLIERS } from '../data/mockData';
import { db, auth } from './config';
import { scrypt } from 'scrypt-js';

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

let firestoreReadQuotaExhaustedUntil = 0;

export function isFirestoreQuotaExhausted(): boolean {
  return Date.now() < firestoreReadQuotaExhaustedUntil;
}

export function markFirestoreQuotaExhausted(): void {
  firestoreReadQuotaExhaustedUntil = Date.now() + 3 * 60 * 1000;
}

export function resetFirestoreQuotaState(): void {
  firestoreReadQuotaExhaustedUntil = 0;
}

export function isQuotaOrNetworkError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error || '')).toLowerCase();
  const code = String((error as any)?.code || '').toLowerCase();
  const isQuota =
    code === 'resource-exhausted' ||
    msg.includes('quota') ||
    msg.includes('resource-exhausted');
  if (isQuota) {
    markFirestoreQuotaExhausted();
  }
  return (
    isQuota ||
    code === 'unavailable' ||
    msg.includes('offline') ||
    msg.includes('timed out') ||
    msg.includes('failed to get document')
  );
}

// Track recently written local sales so an overlapping cloud snapshot pull can never
// momentarily hide a sale recorded seconds earlier before Firestore REST reflects it.
const RECENT_LOCAL_SALE_TTL_MS = 120_000;
const recentLocalSalesMap = new Map<string, { slug: string; sale: SaleRecord; writtenAt: number }>();

function trackRecentLocalSale(sale: SaleRecord, slug: string): void {
  if (!sale?.id) return;
  const now = Date.now();
  recentLocalSalesMap.set(`${slug}::${sale.id}`, { slug, sale, writtenAt: now });
  for (const [k, entry] of recentLocalSalesMap.entries()) {
    if (now - entry.writtenAt > RECENT_LOCAL_SALE_TTL_MS) {
      recentLocalSalesMap.delete(k);
    }
  }
}

function clearRecentLocalSale(saleId: string, slug: string): void {
  if (!saleId) return;
  recentLocalSalesMap.delete(`${slug}::${saleId}`);
}

function racePromiseWithTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
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
  if (isQuotaOrNetworkError(error)) {
    console.warn('Firestore Quota/Offline Notice:', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  }
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
  INVENTORY_MUTATIONS: 'stockmaster_inventory_mutations_v1',
  INVENTORY_TOMBSTONES: 'stockmaster_inventory_tombstones_v1',
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
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
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

function safeWriteCache<T>(key: string, data: T): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(data));
    return true;
  } catch (err) {
    console.warn(`Could not write cache for ${key}:`, err);
    return false;
  }
}

// In-memory cache & image map so large catalogs (e.g. 15MB in Comercial GYG)
// never lose images, sales history, or lag when localStorage hits its 5MB browser quota.
const memoryInventoryCache = new Map<string, Product[]>();
const memorySalesCache = new Map<string, SaleRecord[]>();
const memoryImageMap = new Map<string, string>();
const memoryImage2Map = new Map<string, string>();

const IDB_NAME = 'stockmaster_idb_cache_v1';
const IDB_STORE = 'inventory_store';

function openInventoryIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const dbInstance = req.result;
        if (!dbInstance.objectStoreNames.contains(IDB_STORE)) {
          dbInstance.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function saveInventoryToIndexedDB(
  items: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const idb = await openInventoryIdb();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(items, `inv_${slug}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function saveSalesToIndexedDB(
  items: SaleRecord[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const idb = await openInventoryIdb();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(items, `sales_${slug}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadSalesFromIndexedDB(
  companyId = getActiveCompanyId()
): Promise<SaleRecord[] | null> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const idb = await openInventoryIdb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(`sales_${slug}`);
      tx.oncomplete = () => {
        resolve(Array.isArray(req.result) ? (req.result as SaleRecord[]) : null);
      };
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveMutationsToIndexedDB(
  mutations: PendingInventoryMutations,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const idb = await openInventoryIdb();
  if (!idb) return;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put(mutations, `mut_${slug}`);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadInventoryFromIndexedDB(
  companyId = getActiveCompanyId()
): Promise<Product[] | null> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const idb = await openInventoryIdb();
  if (!idb) return null;
  return new Promise((resolve) => {
    try {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const reqInv = store.get(`inv_${slug}`);
      const reqMut = store.get(`mut_${slug}`);

      tx.oncomplete = () => {
        const idbMut = reqMut.result as PendingInventoryMutations | undefined;
        if (idbMut && typeof idbMut === 'object') {
          const currentMut = getPendingMutations(slug);
          const isGyG = isGyGAlias(slug);
          const mergedExplicitDeleted = Array.from(
            new Set(
              [
                ...(currentMut.explicitDeletedCodes || []),
                ...(idbMut.explicitDeletedCodes || []),
              ]
                .map((c) => String(c || '').trim().toLowerCase())
                .filter(Boolean)
            )
          );
          const explicitSet = new Set(mergedExplicitDeleted);

          const rawDeletedCodes = Array.from(
            new Set(
              [...(currentMut.deletedCodes || []), ...(idbMut.deletedCodes || [])]
                .map((c) => String(c || '').trim().toLowerCase())
                .filter(Boolean)
            )
          );
          // For Comercial GYG, only keep auto-generated SKUs (e.g. SIL-71-735) or explicitly user-deleted codes
          // so custom/sequential SKUs that were previously suppressed are restored
          const mergedDeletedCodes = isGyG
            ? rawDeletedCodes.filter(
                (c) => explicitSet.has(c) || AUTO_GENERATED_SKU_REGEX.test(c)
              )
            : rawDeletedCodes;

          const rawDeletedIds = Array.from(
            new Set(
              [...(currentMut.deletedIds || []), ...(idbMut.deletedIds || [])]
                .map((id) => String(id || '').trim())
                .filter(Boolean)
            )
          );
          const mergedDeletedIds = isGyG
            ? rawDeletedIds.filter((id) => {
                const embedded = id.includes('__')
                  ? id.split('__').slice(1).join('__').trim().toLowerCase()
                  : id.toLowerCase();
                return explicitSet.has(embedded) || AUTO_GENERATED_SKU_REGEX.test(embedded);
              })
            : rawDeletedIds;

          const mergedUnsynced = Array.from(
            new Set(
              [...(currentMut.unsyncedCodes || []), ...(idbMut.unsyncedCodes || [])]
                .map((c) => String(c || '').trim().toLowerCase())
                .filter(Boolean)
            )
          );
          const unsyncedLookup = new Set(mergedUnsynced);
          const deletedSet = new Set(mergedDeletedCodes);
          const mergedUpserts: Record<string, Product> = {};

          for (const [k, v] of Object.entries(idbMut.upserts || {})) {
            const cleanK = k.trim().toLowerCase();
            if (deletedSet.has(cleanK)) continue;
            if (v?.img) {
              memoryImageMap.set(`${slug}__${cleanK}`, v.img);
            }
            if (v?.img2) {
              memoryImage2Map.set(`${slug}__${cleanK}`, v.img2);
            }
            // Only keep in pending upserts if it is genuinely unsynced
            if (unsyncedLookup.has(cleanK)) {
              mergedUpserts[cleanK] = v;
            }
          }
          for (const [k, v] of Object.entries(currentMut.upserts || {})) {
            const cleanK = k.trim().toLowerCase();
            if (deletedSet.has(cleanK)) continue;
            const existingUpsert = mergedUpserts[cleanK];
            const bestImg =
              v?.img ||
              existingUpsert?.img ||
              memoryImageMap.get(`${slug}__${cleanK}`) ||
              '';
            const bestImg2 =
              v?.img2 ||
              existingUpsert?.img2 ||
              memoryImage2Map.get(`${slug}__${cleanK}`) ||
              '';
            if (bestImg) {
              memoryImageMap.set(`${slug}__${cleanK}`, bestImg);
            }
            if (bestImg2) {
              memoryImage2Map.set(`${slug}__${cleanK}`, bestImg2);
            }
            if (unsyncedLookup.has(cleanK)) {
              mergedUpserts[cleanK] = {
                ...(existingUpsert || {}),
                ...v,
                img: bestImg,
                img2: bestImg2 || undefined,
              };
            }
          }

          memoryPendingMutations.set(slug, {
            upserts: mergedUpserts,
            unsyncedCodes: mergedUnsynced,
            explicitDeletedCodes: mergedExplicitDeleted,
            deletedCodes: mergedDeletedCodes,
            deletedIds: mergedDeletedIds,
            updatedAt: Math.max(currentMut.updatedAt || 0, idbMut.updatedAt || 0),
          });
        }

        const result = Array.isArray(reqInv.result) ? (reqInv.result as Product[]) : null;
        if (result && result.length > 0) {
          result.forEach((p) => {
            const ck = (p.code || '').trim().toLowerCase();
            if (p.img) {
              memoryImageMap.set(`${slug}__${ck}`, p.img);
            }
            if (p.img2) {
              memoryImage2Map.set(`${slug}__${ck}`, p.img2);
            }
          });
          const merged = applyPendingMutationsToInventory(result, slug, false);
          memoryInventoryCache.set(slug, merged);
          resolve(merged);
        } else {
          const fromMutOnly = applyPendingMutationsToInventory([], slug, false);
          if (fromMutOnly.length > 0) {
            memoryInventoryCache.set(slug, fromMutOnly);
            resolve(fromMutOnly);
          } else {
            resolve(null);
          }
        }
      };
      tx.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

interface PendingInventoryMutations {
  upserts: Record<string, Product>;
  unsyncedCodes?: string[];
  explicitDeletedCodes?: string[];
  deletedCodes: string[];
  deletedIds: string[];
  updatedAt: number;
}

interface InventoryTombstones {
  explicitDeletedCodes?: string[];
  deletedCodes: string[];
  deletedIds: string[];
  updatedAt: number;
}

const memoryPendingMutations = new Map<string, PendingInventoryMutations>();

// Matches auto-generated SKUs from BulkStockImportModal / InventoryView (e.g., SIL-71-735, MES-12-409)
const AUTO_GENERATED_SKU_REGEX = /^[A-ZÑÁÉÍÓÚ0-9\s]{1,4}-\d{1,4}-\d{3}$/i;

function normalizeProductNameForDedup(name: string): string {
  return (name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getPendingMutations(companyId = getActiveCompanyId()): PendingInventoryMutations {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mem = memoryPendingMutations.get(slug);
  if (mem) return mem;

  const isGyG = isGyGAlias(slug);
  const stored = safeReadCache<PendingInventoryMutations>(
    getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_MUTATIONS, slug)
  );
  const tombstones = safeReadCache<InventoryTombstones>(
    getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_TOMBSTONES, slug)
  );

  const explicitDeletedSet = new Set<string>();
  const deletedCodesSet = new Set<string>();
  const deletedIdsSet = new Set<string>();
  const unsyncedSet = new Set<string>();

  const addExplicit = (arr?: string[]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((c) => {
      const clean = String(c || '').trim().toLowerCase();
      if (clean) explicitDeletedSet.add(clean);
    });
  };
  const addCodes = (arr?: string[]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((c) => {
      const clean = String(c || '').trim().toLowerCase();
      if (!clean) return;
      if (isGyG && !explicitDeletedSet.has(clean) && !AUTO_GENERATED_SKU_REGEX.test(clean)) {
        return;
      }
      deletedCodesSet.add(clean);
    });
  };
  const addIds = (arr?: string[]) => {
    if (!Array.isArray(arr)) return;
    arr.forEach((id) => {
      const clean = String(id || '').trim();
      if (!clean) return;
      if (isGyG) {
        const embedded = clean.includes('__')
          ? clean.split('__').slice(1).join('__').trim().toLowerCase()
          : clean.toLowerCase();
        if (!explicitDeletedSet.has(embedded) && !AUTO_GENERATED_SKU_REGEX.test(embedded)) {
          return;
        }
      }
      deletedIdsSet.add(clean);
    });
  };

  addExplicit(stored?.explicitDeletedCodes);
  addExplicit(tombstones?.explicitDeletedCodes);
  addCodes(stored?.deletedCodes);
  addCodes(tombstones?.deletedCodes);
  addIds(stored?.deletedIds);
  addIds(tombstones?.deletedIds);

  if (Array.isArray(stored?.unsyncedCodes)) {
    stored.unsyncedCodes.forEach((c) => {
      const clean = String(c || '').trim().toLowerCase();
      if (clean) unsyncedSet.add(clean);
    });
  }

  // Also merge any legacy GYG alias tombstones/mutations
  if (isGyG) {
    for (const alias of ['comercial-gyg', 'comercialgyg', 'gyg']) {
      const aliasMut = safeReadCache<PendingInventoryMutations>(
        `${BASE_CACHE_KEYS.INVENTORY_MUTATIONS}__${alias}`
      );
      const aliasTomb = safeReadCache<InventoryTombstones>(
        `${BASE_CACHE_KEYS.INVENTORY_TOMBSTONES}__${alias}`
      );
      addExplicit(aliasMut?.explicitDeletedCodes);
      addExplicit(aliasTomb?.explicitDeletedCodes);
      addCodes(aliasMut?.deletedCodes);
      addCodes(aliasTomb?.deletedCodes);
      addIds(aliasMut?.deletedIds);
      addIds(aliasTomb?.deletedIds);
    }
  }

  const cleanUpserts: Record<string, Product> = {};
  if (stored?.upserts && typeof stored.upserts === 'object') {
    for (const [k, v] of Object.entries(stored.upserts)) {
      const cleanK = k.trim().toLowerCase();
      if (!deletedCodesSet.has(cleanK) && v) {
        if (v.img) {
          memoryImageMap.set(`${slug}__${cleanK}`, v.img);
        }
        // Only retain in pending upserts if it is still unsynced
        if (unsyncedSet.has(cleanK)) {
          cleanUpserts[cleanK] = v;
        }
      }
    }
  }

  // One-time cleanup for Comercial GYG items that had stale doubled stock in local pending cache / IndexedDB
  if (isGyGAlias(slug)) {
    const fixFlagKey = 'gosen_gyg_bocinas_dedup_fix_v4';
    try {
      if (typeof localStorage !== 'undefined' && !localStorage.getItem(fixFlagKey)) {
        const affectedCodes = ['243', '244', '245', '246', '247', '081'];
        for (const c of affectedCodes) {
          delete cleanUpserts[c];
          unsyncedSet.delete(c);
        }
        localStorage.setItem(fixFlagKey, '1');
        const cleanedMut: PendingInventoryMutations = {
          upserts: cleanUpserts,
          unsyncedCodes: Array.from(unsyncedSet),
          explicitDeletedCodes: Array.from(explicitDeletedSet),
          deletedCodes: Array.from(deletedCodesSet),
          deletedIds: Array.from(deletedIdsSet),
          updatedAt: Date.now(),
        };
        const mutKey = getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_MUTATIONS, slug);
        safeWriteCache(mutKey, cleanedMut);
        saveMutationsToIndexedDB(cleanedMut, slug).catch(() => {});
      }
    } catch {}
  }

  const initial: PendingInventoryMutations = {
    upserts: cleanUpserts,
    unsyncedCodes: Array.from(unsyncedSet),
    explicitDeletedCodes: Array.from(explicitDeletedSet),
    deletedCodes: Array.from(deletedCodesSet),
    deletedIds: Array.from(deletedIdsSet),
    updatedAt: Math.max(stored?.updatedAt || 0, tombstones?.updatedAt || 0),
  };
  memoryPendingMutations.set(slug, initial);
  return initial;
}

function savePendingMutations(mutations: PendingInventoryMutations, companyId = getActiveCompanyId()): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  memoryPendingMutations.set(slug, mutations);

  // 1. Always persist lightweight tombstones FIRST so deleted SKUs/IDs never fail on 5MB localStorage quota
  const tombstoneKey = getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_TOMBSTONES, slug);
  const tombstonePayload: InventoryTombstones = {
    explicitDeletedCodes: mutations.explicitDeletedCodes || [],
    deletedCodes: mutations.deletedCodes,
    deletedIds: mutations.deletedIds,
    updatedAt: mutations.updatedAt,
  };
  if (!safeWriteCache(tombstoneKey, tombstonePayload)) {
    try {
      // Inventory is already backed by memoryInventoryCache + IndexedDB; do NOT delete SALES cache
      localStorage.removeItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY, slug));
      safeWriteCache(tombstoneKey, tombstonePayload);
    } catch {}
  }

  // 2. Persist full mutations (including full images and tombstones) to IndexedDB asynchronously
  saveMutationsToIndexedDB(mutations, slug).catch(() => {});

  // 3. Persist lightweight mutations to localStorage
  const lightUpserts: Record<string, Product> = {};
  for (const [k, v] of Object.entries(mutations.upserts)) {
    const ck = (v.code || '').trim().toLowerCase();
    if (v.img) {
      memoryImageMap.set(`${slug}__${ck}`, v.img);
    }
    if (v.img2) {
      memoryImage2Map.set(`${slug}__${ck}`, v.img2);
    }
    const stripImg1 = v.img && v.img.startsWith('data:') && v.img.length > 4000;
    const stripImg2 = v.img2 && v.img2.startsWith('data:') && v.img2.length > 4000;
    lightUpserts[k] =
      stripImg1 || stripImg2
        ? {
            ...v,
            img: stripImg1 ? '' : v.img,
            img2: stripImg2 ? '' : v.img2,
          }
        : v;
  }
  const key = getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_MUTATIONS, slug);
  if (!safeWriteCache(key, { ...mutations, upserts: lightUpserts })) {
    try {
      localStorage.removeItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY, slug));
      safeWriteCache(key, { ...mutations, upserts: lightUpserts });
    } catch {}
  }
}

export function markProductsSyncedToCloud(
  codes: string[],
  companyId = getActiveCompanyId()
): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mut = getPendingMutations(slug);
  const syncedSet = new Set(codes.map((c) => (c || '').trim().toLowerCase()).filter(Boolean));
  if (syncedSet.size === 0) return;

  // Once synced to Firestore, remove from unsyncedCodes AND remove from mut.upserts
  // (while preserving images in memoryImageMap) so old upserts never overwrite future stock edits.
  mut.unsyncedCodes = (mut.unsyncedCodes || []).filter((c) => !syncedSet.has(c));
  for (const codeKey of syncedSet) {
    const existingUp = mut.upserts[codeKey];
    if (existingUp?.img) {
      memoryImageMap.set(`${slug}__${codeKey}`, existingUp.img);
    }
    if (existingUp?.img2) {
      memoryImage2Map.set(`${slug}__${codeKey}`, existingUp.img2);
    }
    delete mut.upserts[codeKey];
  }
  mut.updatedAt = Date.now();
  savePendingMutations(mut, slug);
}

export function recordLocalProductSave(
  product: Product,
  oldCode?: string,
  companyId = getActiveCompanyId()
): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mut = getPendingMutations(slug);
  if (!mut.explicitDeletedCodes) mut.explicitDeletedCodes = [];
  if (!mut.unsyncedCodes) mut.unsyncedCodes = [];

  const cleanNew = (product.code || '').trim().toLowerCase();
  const cleanOld = (oldCode || '').trim().toLowerCase();

  if (cleanOld && cleanOld !== cleanNew) {
    delete mut.upserts[cleanOld];
    mut.unsyncedCodes = mut.unsyncedCodes.filter((c) => c !== cleanOld);
    if (!mut.explicitDeletedCodes.includes(cleanOld)) {
      mut.explicitDeletedCodes.push(cleanOld);
    }
    if (!mut.deletedCodes.includes(cleanOld)) {
      mut.deletedCodes.push(cleanOld);
    }
  }

  // If product.id had an embedded old code (e.g. tiendagyg__SIL-71-735), also tombstone that old code
  if (product.id && product.id.includes('__')) {
    const idEmbeddedCode = product.id.split('__').slice(1).join('__').trim().toLowerCase();
    if (idEmbeddedCode && idEmbeddedCode !== cleanNew) {
      delete mut.upserts[idEmbeddedCode];
      mut.unsyncedCodes = mut.unsyncedCodes.filter((c) => c !== idEmbeddedCode);
      if (!mut.explicitDeletedCodes.includes(idEmbeddedCode)) {
        mut.explicitDeletedCodes.push(idEmbeddedCode);
      }
      if (!mut.deletedCodes.includes(idEmbeddedCode)) {
        mut.deletedCodes.push(idEmbeddedCode);
      }
      if (!mut.deletedIds.includes(product.id)) {
        mut.deletedIds.push(product.id);
      }
    }
  }

  // In Comercial GYG, if an older auto-generated SKU exists for this exact product name, tombstone it
  if (isGyGAlias(slug) && product.name) {
    const targetNormName = normalizeProductNameForDedup(product.name);
    if (targetNormName) {
      for (const [upCode, upProd] of Object.entries(mut.upserts)) {
        if (
          upCode !== cleanNew &&
          normalizeProductNameForDedup(upProd.name) === targetNormName &&
          AUTO_GENERATED_SKU_REGEX.test(upProd.code || upCode)
        ) {
          delete mut.upserts[upCode];
          mut.unsyncedCodes = mut.unsyncedCodes.filter((c) => c !== upCode);
          if (!mut.deletedCodes.includes(upCode)) {
            mut.deletedCodes.push(upCode);
          }
        }
      }
    }
  }

  mut.explicitDeletedCodes = mut.explicitDeletedCodes.filter((c) => c !== cleanNew);
  mut.deletedCodes = mut.deletedCodes.filter((c) => c !== cleanNew);
  const newScopedId = getScopedDocId(product.code, slug);
  mut.deletedIds = mut.deletedIds.filter(
    (id) =>
      id !== newScopedId &&
      (!id.includes('__') || id.split('__').slice(1).join('__').trim().toLowerCase() !== cleanNew)
  );
  if (product.img) {
    memoryImageMap.set(`${slug}__${cleanNew}`, product.img);
  } else {
    memoryImageMap.delete(`${slug}__${cleanNew}`);
  }
  if (product.img2) {
    memoryImage2Map.set(`${slug}__${cleanNew}`, product.img2);
  } else {
    memoryImage2Map.delete(`${slug}__${cleanNew}`);
  }
  if (!mut.unsyncedCodes.includes(cleanNew)) {
    mut.unsyncedCodes.push(cleanNew);
  }
  const nowTs = Date.now();
  mut.upserts[cleanNew] = {
    ...product,
    id: newScopedId,
    companyId: slug,
    code: product.code.trim(),
    name: product.name.trim(),
    category: (product.category || 'Otros').trim(),
    supplier: (product.supplier || '').trim(),
    updatedAt: nowTs,
  } as Product;
  mut.updatedAt = nowTs;
  savePendingMutations(mut, slug);
}

export function recordLocalProductDelete(
  id: string,
  code?: string,
  companyId = getActiveCompanyId()
): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mut = getPendingMutations(slug);
  if (!mut.explicitDeletedCodes) mut.explicitDeletedCodes = [];
  if (!mut.unsyncedCodes) mut.unsyncedCodes = [];

  const trimmedId = (id || '').trim();
  const extractedFromId = trimmedId.includes('__')
    ? trimmedId.split('__').slice(1).join('__').trim()
    : trimmedId;
  const cleanCode = (code || extractedFromId).trim().toLowerCase();

  if (cleanCode) {
    delete mut.upserts[cleanCode];
    mut.unsyncedCodes = mut.unsyncedCodes.filter((c) => c !== cleanCode);
    if (!mut.explicitDeletedCodes.includes(cleanCode)) {
      mut.explicitDeletedCodes.push(cleanCode);
    }
    if (!mut.deletedCodes.includes(cleanCode)) {
      mut.deletedCodes.push(cleanCode);
    }
  }
  if (extractedFromId && extractedFromId.toLowerCase() !== cleanCode) {
    const lowerExtracted = extractedFromId.toLowerCase();
    delete mut.upserts[lowerExtracted];
    mut.unsyncedCodes = mut.unsyncedCodes.filter((c) => c !== lowerExtracted);
    if (!mut.explicitDeletedCodes.includes(lowerExtracted)) {
      mut.explicitDeletedCodes.push(lowerExtracted);
    }
    if (!mut.deletedCodes.includes(lowerExtracted)) {
      mut.deletedCodes.push(lowerExtracted);
    }
  }

  const rawCodeForIds = (code || extractedFromId).trim();
  const candidateIds = new Set<string>();
  if (trimmedId) candidateIds.add(trimmedId);
  if (rawCodeForIds) {
    candidateIds.add(getScopedDocId(rawCodeForIds, slug));
    candidateIds.add(`${slug}__${rawCodeForIds}`);
    candidateIds.add(rawCodeForIds);
    if (isGyGAlias(slug)) {
      candidateIds.add(`tiendagyg__${rawCodeForIds}`);
      candidateIds.add(`comercial-gyg__${rawCodeForIds}`);
      candidateIds.add(`comercialgyg__${rawCodeForIds}`);
      candidateIds.add(`comercial_gyg__${rawCodeForIds}`);
      candidateIds.add(`gyg__${rawCodeForIds}`);
    }
  }
  for (const cid of candidateIds) {
    if (cid && !mut.deletedIds.includes(cid)) {
      mut.deletedIds.push(cid);
    }
  }

  mut.updatedAt = Date.now();
  savePendingMutations(mut, slug);
}

function scoreCanonicalGyGProduct(item: Product, unsyncedSet: Set<string>): number {
  const codeKey = (item.code || '').trim().toLowerCase();
  const rawCode = (item.code || '').trim();
  let score = 0;
  // 1. Not an auto-generated bulk SKU (e.g. not SIL-71-735)
  if (!AUTO_GENERATED_SKU_REGEX.test(rawCode)) score += 600;
  // 2. Has product image (valid Comercial GYG articles have their custom SKU + image)
  if (item.img && item.img.trim().length > 5) score += 500;
  // 3. Pending unsynced local save on this device
  if (unsyncedSet.has(codeKey)) score += 250;
  // 4. Short numeric or clean sequential SKU (e.g. 001..9999)
  if (/^\d{1,6}$/.test(rawCode)) score += 150;
  // 5. Has commercial data
  if ((Number(item.price) || 0) > 0) score += 40;
  if ((Number(item.cost) || 0) > 0) score += 20;
  if ((Number(item.stock) || 0) > 0) score += 10;
  return score;
}

const pendingOrphanCleanupInFlight = new Set<string>();

function scheduleOrphanCleanupInFirestore(slug: string, orphanItems: Product[]): void {
  if (orphanItems.length === 0) return;
  const toClean = orphanItems.filter((item) => {
    const cleanCode = (item.code || '').trim();
    // Safety guard: ONLY auto-delete from Firestore if the SKU is an auto-generated bulk SKU (e.g. SIL-71-735)
    if (!AUTO_GENERATED_SKU_REGEX.test(cleanCode)) return false;
    const key = `${slug}__${cleanCode.toLowerCase()}`;
    if (pendingOrphanCleanupInFlight.has(key)) return false;
    pendingOrphanCleanupInFlight.add(key);
    return true;
  });
  if (toClean.length === 0) return;

  Promise.resolve().then(async () => {
    try {
      const batch = writeBatch(db);
      let count = 0;
      for (const item of toClean) {
        const cleanCode = (item.code || '').trim();
        if (!cleanCode) continue;
        const ids = new Set<string>([
          item.id,
          getScopedDocId(cleanCode, slug),
          `${slug}__${cleanCode}`,
          cleanCode,
          `tiendagyg__${cleanCode}`,
          `comercial-gyg__${cleanCode}`,
          `comercialgyg__${cleanCode}`,
          `comercial_gyg__${cleanCode}`,
          `gyg__${cleanCode}`,
        ]);
        for (const docId of ids) {
          if (docId && count < 450) {
            batch.delete(doc(db, 'inventory', docId));
            count++;
          }
        }
      }
      if (count > 0) {
        await batch.commit();
      }
    } catch {
      // Ignore if offline or quota temporarily exceeded; tombstones keep them suppressed locally
    }
  });
}

export function applyPendingMutationsToInventory(
  items: Product[],
  companyId = getActiveCompanyId(),
  fromServer = false
): Product[] {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mut = getPendingMutations(slug);
  const explicitDeletedSet = new Set(
    (mut.explicitDeletedCodes || []).map((c) => c.toLowerCase())
  );
  const deletedCodeSet = new Set(mut.deletedCodes.map((c) => c.toLowerCase()));
  const deletedIdSet = new Set(mut.deletedIds);
  const unsyncedSet = new Set((mut.unsyncedCodes || []).map((c) => c.toLowerCase()));

  const byCode = new Map<string, Product>();

  for (const item of items) {
    const codeKey = (item.code || '').trim().toLowerCase();
    if (!codeKey) continue;
    const idEmbeddedCode =
      item.id && item.id.includes('__')
        ? item.id.split('__').slice(1).join('__').trim().toLowerCase()
        : '';

    const isAutoSku = AUTO_GENERATED_SKU_REGEX.test(item.code || '');
    const isExplicitlyDeleted =
      explicitDeletedSet.has(codeKey) ||
      (idEmbeddedCode ? explicitDeletedSet.has(idEmbeddedCode) : false);

    // If coming fresh from Firestore server, only suppress if explicitly deleted by user or if it's a tombstoned auto-generated SKU
    if (fromServer && isGyGAlias(slug)) {
      if (isExplicitlyDeleted || (isAutoSku && deletedCodeSet.has(codeKey))) {
        continue;
      }
    } else if (
      deletedCodeSet.has(codeKey) ||
      (idEmbeddedCode && deletedCodeSet.has(idEmbeddedCode)) ||
      (item.id && deletedIdSet.has(item.id))
    ) {
      continue;
    }

    const memImg = memoryImageMap.get(`${slug}__${codeKey}`);
    const memImg2 = memoryImage2Map.get(`${slug}__${codeKey}`);
    const existing = byCode.get(codeKey);
    if (existing) {
      const pickNew =
        scoreCanonicalGyGProduct(item, unsyncedSet) >=
        scoreCanonicalGyGProduct(existing, unsyncedSet);
      const chosen = pickNew ? item : existing;
      const fallbackImg = item.img || existing.img || memImg || '';
      const fallbackImg2 = item.img2 || existing.img2 || memImg2 || '';
      byCode.set(codeKey, {
        ...chosen,
        category: (chosen.category || 'Otros').trim(),
        supplier: (chosen.supplier || '').trim(),
        img: chosen.img || fallbackImg,
        img2: chosen.img2 || fallbackImg2 || undefined,
      });
    } else {
      byCode.set(codeKey, {
        ...item,
        category: (item.category || 'Otros').trim(),
        supplier: (item.supplier || '').trim(),
        img: item.img || memImg || '',
        img2: item.img2 || memImg2 || undefined,
      });
    }
  }

  let serverRefreshedUpserts = false;
  for (const [codeKey, upserted] of Object.entries(mut.upserts)) {
    if (deletedCodeSet.has(codeKey) || explicitDeletedSet.has(codeKey)) continue;
    const existing = byCode.get(codeKey);
    const memImg = memoryImageMap.get(`${slug}__${codeKey}`);
    const memImg2 = memoryImage2Map.get(`${slug}__${codeKey}`);

    // When merging local cache (fromServer === false), mut.upserts wins over stale cache.
    // When merging fresh server items (fromServer === true), mut.upserts ONLY wins if the item
    // does not exist on the server yet or has pending unsynced local changes (unsyncedSet.has(codeKey)).
    // Otherwise, the fresh Firestore server document is authoritative and refreshes mut.upserts!
    const preferUpsert = !fromServer || !existing || unsyncedSet.has(codeKey);

    if (!preferUpsert && existing) {
      const mergedServerItem: Product = {
        ...existing,
        img: existing.img || upserted.img || memImg || '',
        img2: existing.img2 || upserted.img2 || memImg2 || undefined,
      };
      byCode.set(codeKey, mergedServerItem);
      if (
        upserted.stock !== mergedServerItem.stock ||
        upserted.price !== mergedServerItem.price ||
        upserted.cost !== mergedServerItem.cost
      ) {
        mut.upserts[codeKey] = {
          ...mergedServerItem,
          updatedAt: Date.now(),
        } as Product;
        serverRefreshedUpserts = true;
      }
    } else {
      byCode.set(codeKey, {
        ...(existing || {}),
        ...upserted,
        category: (upserted.category || existing?.category || 'Otros').trim(),
        supplier: (upserted.supplier ?? existing?.supplier ?? '').trim(),
        img: upserted.img || memImg || existing?.img || '',
        img2: upserted.img2 || memImg2 || existing?.img2 || undefined,
      });
    }
  }
  if (serverRefreshedUpserts) {
    savePendingMutations(mut, slug);
  }

  // Smart Deduplication for Comercial GYG:
  // ONLY suppress orphaned auto-generated SKUs (e.g. SIL-71-735 for "SILLA SIN BRAZO PRIMA")
  // when the product already exists under a real custom/sequential SKU.
  // Never suppress or tombstone legitimate custom/sequential SKUs!
  if (isGyGAlias(slug)) {
    const byNormName = new Map<string, Product[]>();
    for (const item of byCode.values()) {
      const normName = normalizeProductNameForDedup(item.name);
      if (!normName) continue;
      const list = byNormName.get(normName) || [];
      list.push(item);
      byNormName.set(normName, list);
    }

    let mutationsUpdated = false;
    const newlyDetectedOrphans: Product[] = [];

    for (const [, group] of byNormName.entries()) {
      if (group.length <= 1) continue;

      // Sort highest-scoring canonical item first
      group.sort(
        (a, b) =>
          scoreCanonicalGyGProduct(b, unsyncedSet) -
          scoreCanonicalGyGProduct(a, unsyncedSet)
      );

      const winner = group[0];
      const winnerCode = (winner.code || '').trim();
      const winnerCodeKey = winnerCode.toLowerCase();
      const winnerHasCustomSku = !AUTO_GENERATED_SKU_REGEX.test(winnerCode);

      for (let i = 1; i < group.length; i++) {
        const candidate = group[i];
        const candCode = (candidate.code || '').trim();
        const candCodeKey = candCode.toLowerCase();
        const isAutoGeneratedSku = AUTO_GENERATED_SKU_REGEX.test(candCode);

        // Strictly only suppress when the duplicate has an auto-generated bulk SKU (like SIL-71-735)
        // and the canonical item has a real custom/sequential SKU
        if (isAutoGeneratedSku && winnerHasCustomSku) {
          if (!winner.img && candidate.img) {
            winner.img = candidate.img;
            byCode.set(winnerCodeKey, winner);
          }
          byCode.delete(candCodeKey);
          delete mut.upserts[candCodeKey];
          if (!deletedCodeSet.has(candCodeKey)) {
            deletedCodeSet.add(candCodeKey);
            mut.deletedCodes.push(candCodeKey);
            mutationsUpdated = true;
          }
          if (candidate.id && !deletedIdSet.has(candidate.id)) {
            deletedIdSet.add(candidate.id);
            mut.deletedIds.push(candidate.id);
            mutationsUpdated = true;
          }
          newlyDetectedOrphans.push(candidate);
        }
      }
    }

    if (mutationsUpdated) {
      mut.updatedAt = Date.now();
      savePendingMutations(mut, slug);
    }
    if (newlyDetectedOrphans.length > 0) {
      scheduleOrphanCleanupInFirestore(slug, newlyDetectedOrphans);
    }
  }

  const merged = Array.from(byCode.values());
  merged.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  return merged;
}

export function getCachedInventory(companyId = getActiveCompanyId()): Product[] | null {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const inMem = memoryInventoryCache.get(slug);
  if (inMem && inMem.length > 0) {
    return applyPendingMutationsToInventory(inMem, slug);
  }
  const fromLs = safeReadCache<Product[]>(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY, slug));
  if (fromLs && fromLs.length > 0) {
    const hydrated = applyPendingMutationsToInventory(fromLs, slug);
    memoryInventoryCache.set(slug, hydrated);
    return hydrated;
  }
  return null;
}

export function setCachedInventory(items: Product[], syncTs?: number, companyId = getActiveCompanyId()): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  items.forEach((p) => {
    const ck = (p.code || '').trim().toLowerCase();
    if (p.img) {
      memoryImageMap.set(`${slug}__${ck}`, p.img);
    }
    if (p.img2) {
      memoryImage2Map.set(`${slug}__${ck}`, p.img2);
    }
  });

  const merged = applyPendingMutationsToInventory(items, slug);
  memoryInventoryCache.set(slug, merged);

  // Persist full inventory (including large base64 images) to IndexedDB asynchronously
  saveInventoryToIndexedDB(merged, slug).catch(() => {});

  // For localStorage (5MB limit), strip oversized data:image URLs if total payload is large
  const cacheKey = getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY, slug);
  let totalImgChars = 0;
  for (let i = 0; i < merged.length; i++) {
    totalImgChars += (merged[i].img || '').length + (merged[i].img2 || '').length;
  }

  const shouldStripLargeDataUrls = totalImgChars > 1_200_000;
  const lsPayload = shouldStripLargeDataUrls
    ? merged.map((p) => {
        const s1 = p.img && p.img.startsWith('data:') && p.img.length > 4000;
        const s2 = p.img2 && p.img2.startsWith('data:') && p.img2.length > 4000;
        return s1 || s2
          ? { ...p, img: s1 ? '' : p.img, img2: s2 ? '' : p.img2 }
          : p;
      })
    : merged;

  if (!safeWriteCache(cacheKey, lsPayload)) {
    const ultraLight = merged.map((p) => ({
      ...p,
      img: p.img && p.img.startsWith('data:') ? '' : p.img,
      img2: p.img2 && p.img2.startsWith('data:') ? '' : p.img2,
    }));
    try {
      localStorage.removeItem(cacheKey);
    } catch {}
    safeWriteCache(cacheKey, ultraLight);
  }

  if (syncTs !== undefined) {
    try {
      localStorage.setItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_TS, slug), String(syncTs));
    } catch {}
  }
  if (merged.length > 0 && slug === 'gosen') {
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

const GYG_CACHE_ALIASES = ['tiendagyg', 'comercialgyg', 'comercial-gyg', 'comercial_gyg', 'gyg'];
const DELETED_SALES_TOMBSTONE_PREFIX = 'stockmaster_deleted_sales_v1__';
const memoryDeletedSaleIds = new Map<string, Set<string>>();

export function getLocallyDeletedSaleIds(companyId = getActiveCompanyId()): Set<string> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const combined = new Set<string>(memoryDeletedSaleIds.get(slug) || []);
  try {
    const raw = localStorage.getItem(`${DELETED_SALES_TOMBSTONE_PREFIX}${slug}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const id of parsed) {
          const clean = String(id || '').trim();
          if (clean) combined.add(clean);
        }
      }
    }
  } catch {}
  return combined;
}

export function markSaleDeletedLocally(saleId: string, companyId = getActiveCompanyId()): void {
  const cleanId = String(saleId || '').trim();
  if (!cleanId) return;
  markSalesDeletedLocally([cleanId], companyId);
}

export function markSalesDeletedLocally(
  saleIds: string[],
  companyId = getActiveCompanyId()
): void {
  if (!Array.isArray(saleIds) || saleIds.length === 0) return;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const nextSet = getLocallyDeletedSaleIds(slug);
  let added = false;
  for (const raw of saleIds) {
    const cleanId = String(raw || '').trim();
    if (cleanId && !nextSet.has(cleanId)) {
      nextSet.add(cleanId);
      added = true;
    }
  }
  if (!added) return;
  memoryDeletedSaleIds.set(slug, nextSet);
  try {
    const bounded = Array.from(nextSet).slice(-500);
    localStorage.setItem(`${DELETED_SALES_TOMBSTONE_PREFIX}${slug}`, JSON.stringify(bounded));
  } catch {}
}

export function getCachedSales(companyId = getActiveCompanyId()): SaleRecord[] | null {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const deletedIds = getLocallyDeletedSaleIds(slug);
  const keysToRead = isGyGAlias(slug)
    ? Array.from(new Set([slug, ...GYG_CACHE_ALIASES]))
    : [slug];

  const byId = new Map<string, SaleRecord>();
  const mergeList = (list: SaleRecord[] | null | undefined) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || !item.id || deletedIds.has(item.id)) continue;
      if (!belongsToCompany(item.companyId, slug, item.id)) continue;
      const existing = byId.get(item.id);
      if (!existing) {
        byId.set(item.id, item);
      } else {
        const existingPayments = existing.creditPayments?.length || 0;
        const itemPayments = item.creditPayments?.length || 0;
        const existingHasSig = Boolean(
          existing.creditContract?.customerSignatureDataUrl ||
            existing.creditContract?.lessorSignatureDataUrl
        );
        const itemHasSig = Boolean(
          item.creditContract?.customerSignatureDataUrl ||
            item.creditContract?.lessorSignatureDataUrl
        );
        if (
          (itemHasSig && !existingHasSig) ||
          itemPayments > existingPayments ||
          (item.lastEditedAt && !existing.lastEditedAt) ||
          (!existing.creditContract && Boolean(item.creditContract))
        ) {
          byId.set(item.id, {
            ...existing,
            ...item,
            creditContract: item.creditContract || existing.creditContract,
          });
        }
      }
    }
  };

  for (const k of keysToRead) {
    mergeList(safeReadCache<SaleRecord[]>(`${BASE_CACHE_KEYS.SALES}__${k}`));
    mergeList(memorySalesCache.get(k));
  }
  if (slug === 'gosen') {
    mergeList(safeReadCache<SaleRecord[]>(BASE_CACHE_KEYS.SALES));
    mergeList(memorySalesCache.get('gosen'));
  }

  if (byId.size === 0) return null;
  const merged = Array.from(byId.values());
  merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return merged;
}

export function setCachedSales(items: SaleRecord[], companyId = getActiveCompanyId()): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const deletedIds = getLocallyDeletedSaleIds(slug);
  const sorted = [...items]
    .filter((s) => s && s.id && !deletedIds.has(s.id))
    .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  memorySalesCache.set(slug, sorted);
  if (isGyGAlias(slug)) {
    for (const alias of GYG_CACHE_ALIASES) {
      if (alias !== slug) {
        const aliasMem = memorySalesCache.get(alias);
        if (aliasMem) {
          memorySalesCache.set(
            alias,
            aliasMem.filter((s) => s && s.id && !deletedIds.has(s.id))
          );
        }
        const aliasKey = `${BASE_CACHE_KEYS.SALES}__${alias}`;
        const aliasLs = safeReadCache<SaleRecord[]>(aliasKey);
        if (Array.isArray(aliasLs) && aliasLs.some((s) => s && deletedIds.has(s.id))) {
          safeWriteCache(
            aliasKey,
            aliasLs.filter((s) => s && s.id && !deletedIds.has(s.id))
          );
        }
      }
    }
  }
  if (slug === 'gosen') {
    const legacyGosen = safeReadCache<SaleRecord[]>(BASE_CACHE_KEYS.SALES);
    if (Array.isArray(legacyGosen) && legacyGosen.some((s) => s && deletedIds.has(s.id))) {
      safeWriteCache(
        BASE_CACHE_KEYS.SALES,
        legacyGosen.filter((s) => s && s.id && !deletedIds.has(s.id))
      );
    }
  }
  saveSalesToIndexedDB(sorted, slug).catch(() => {});

  const cacheKey = getScopedCacheKey(BASE_CACHE_KEYS.SALES, slug);
  if (!safeWriteCache(cacheKey, sorted)) {
    // Strip large base64 signature URLs only in the compact localStorage mirror (full objects stay in memory + IndexedDB)
    const compact = sorted.map((s) => {
      if (!s.creditContract) return s;
      const { customerSignatureDataUrl, lessorSignatureDataUrl, ...restContract } = s.creditContract;
      return {
        ...s,
        creditContract: restContract,
      };
    });
    if (!safeWriteCache(cacheKey, compact)) {
      safeWriteCache(cacheKey, compact.slice(0, 120));
    }
  }
}

export function getCachedPurchases(companyId = getActiveCompanyId()): PurchaseInvoice[] | null {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const keysToRead = isGyGAlias(slug)
    ? Array.from(new Set([slug, ...GYG_CACHE_ALIASES]))
    : [slug];

  const byId = new Map<string, PurchaseInvoice>();
  for (const k of keysToRead) {
    const list = safeReadCache<PurchaseInvoice[]>(`${BASE_CACHE_KEYS.PURCHASES}__${k}`);
    if (Array.isArray(list)) {
      for (const item of list) {
        if (!item || !item.id) continue;
        if (!belongsToCompany(item.companyId, slug, item.id)) continue;
        if (!byId.has(item.id)) {
          byId.set(item.id, item);
        }
      }
    }
  }
  if (byId.size === 0) return null;
  const merged = Array.from(byId.values());
  merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return merged;
}

export function setCachedPurchases(items: PurchaseInvoice[], companyId = getActiveCompanyId()): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.PURCHASES, slug), items);
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
  const cached = safeReadCache<StoreSettings>(getScopedCacheKey(BASE_CACHE_KEYS.SETTINGS, companyId));
  if (!cached) return null;
  return {
    ...cached,
    allowedModules: resolveCompanyAllowedModules(cached.allowedModules, {
      enableOnlineSales: cached.enableOnlineSales,
      enableRestaurantModule: cached.enableRestaurantModule,
    }),
  };
}

export function setCachedStoreSettings(settings: StoreSettings, companyId = getActiveCompanyId()): void {
  safeWriteCache(getScopedCacheKey(BASE_CACHE_KEYS.SETTINGS, companyId), settings);
}

export function getCachedCompanies(): CompanyTenant[] | null {
  const cached = safeReadCache<CompanyTenant[]>(BASE_CACHE_KEYS.COMPANIES);
  if (!cached) return null;
  return cached.map((c) => ({
    ...c,
    allowedModules: resolveCompanyAllowedModules(c.allowedModules, {
      enableOnlineSales: c.enableOnlineSales,
      enableRestaurantModule: c.enableRestaurantModule,
    }),
  }));
}

export function setCachedCompanies(companies: CompanyTenant[]): void {
  safeWriteCache(BASE_CACHE_KEYS.COMPANIES, companies);
}

function getSyncStateDocId(companyId = getActiveCompanyId()): string {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'sync_state' : `sync_state_${slug}`;
}

function getStoreProfileDocId(companyId = getActiveCompanyId()): string {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'store_profile' : `store_profile_${slug}`;
}

function getScopedCollectionQuery(collectionName: string, slug: string) {
  const collRef = collection(db, collectionName);
  if (isGyGAlias(slug)) {
    return query(
      collRef,
      where('companyId', 'in', [
        'tiendagyg',
        'comercial-gyg',
        'comercialgyg',
        'comercial_gyg',
        'gyg',
        'GYG',
        'tienda-gyg',
        'tienda_gyg',
        'comercial gyg',
        'Comercial GYG',
        'Comercial GyG',
        'COMERCIAL GYG',
        'Comercial-GYG',
        'comercial-GYG',
        'COMERCIAL-GYG',
        'Tienda GYG',
        'Tienda GyG',
        'TIENDA GYG',
        'TIENDAGYG',
        'comercialgyghn',
      ])
    );
  }
  const canonical = canonicalizeCompanySlug(slug);
  if (canonical !== 'gosen') {
    const variants = Array.from(new Set([slug, canonical, normalizeCompanySlug(slug)])).filter(Boolean);
    return query(collRef, where('companyId', 'in', variants));
  }
  return collRef;
}

function getScopedInventoryQuery(slug: string) {
  return getScopedCollectionQuery('inventory', slug);
}

function parseInventorySnapshotDocs(snapshot: any, slug: string, fromServer = true): Product[] {
  const items: Product[] = [];
  snapshot.forEach((docSnap: any) => {
    const data = docSnap.data();
    if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;

    let code = (data.code || '').trim();
    if (!code) {
      code = docSnap.id.includes('__') ? docSnap.id.split('__').slice(1).join('__') : docSnap.id;
    }

    const parsedColors = Array.isArray(data.colors)
      ? data.colors.map((c: any) => String(c || '').trim()).filter(Boolean)
      : typeof data.color === 'string' && data.color.trim()
      ? data.color
          .split(',')
          .map((c: string) => c.trim())
          .filter(Boolean)
      : undefined;

    items.push({
      id: docSnap.id,
      companyId: data.companyId || slug,
      code,
      name: (data.name || '').trim(),
      category: (data.category || 'Otros').trim(),
      size: (data.size || '').trim(),
      color: (data.color || (parsedColors ? parsedColors.join(', ') : '')).trim() || undefined,
      colors: parsedColors && parsedColors.length > 0 ? parsedColors : undefined,
      supplier: (data.supplier || '').trim(),
      cost: Number(data.cost) || 0,
      price: Number(data.price) || 0,
      creditPrice: data.creditPrice !== undefined && Number(data.creditPrice) > 0 ? Number(data.creditPrice) : undefined,
      discount: Math.max(0, Number(data.discount) || 0),
      discountType: data.discountType === 'percent' ? 'percent' : 'fixed',
      discountValue: Math.max(0, Number(data.discountValue) || Number(data.discount) || 0),
      stock: Number(data.stock) || 0,
      warehouseStocks:
        data.warehouseStocks && typeof data.warehouseStocks === 'object'
          ? data.warehouseStocks
          : undefined,
      colorStocks: normalizeColorStocks(parsedColors || [], data.colorStocks),
      img: data.img || '',
      img2: data.img2 || undefined,
      updatedAt: Number(data.updatedAt) || 0,
    });
  });
  return applyPendingMutationsToInventory(items, slug, fromServer);
}

export async function flushPendingInventoryToFirestore(
  companyId = getActiveCompanyId()
): Promise<number> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mut = getPendingMutations(slug);
  const unsyncedList = Array.from(new Set(mut.unsyncedCodes || []));
  if (unsyncedList.length === 0) return 0;

  const toPush: Product[] = [];
  for (const codeKey of unsyncedList) {
    const prod = mut.upserts[codeKey];
    if (prod && prod.code && prod.name) {
      toPush.push(prod);
    }
  }
  if (toPush.length === 0) return 0;

  let pushedCount = 0;
  const CHUNK_SIZE = 350;
  try {
    for (let i = 0; i < toPush.length; i += CHUNK_SIZE) {
      const chunk = toPush.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      const pushedCodes: string[] = [];

      for (const product of chunk) {
        const cleanCode = product.code.trim();
        if (!cleanCode) continue;
        const docId = getScopedDocId(cleanCode, slug);
        const docRef = doc(db, 'inventory', docId);
        const safeImg =
          product.img && product.img.length <= 900_000 ? product.img.trim() : '';
        const safeImg2 =
          product.img2 && product.img2.length <= 900_000 && (safeImg.length + product.img2.length <= 940_000)
            ? product.img2.trim()
            : '';

        const payload: Record<string, any> = {
          companyId: slug,
          code: cleanCode,
          name: product.name.trim(),
          category: (product.category || 'Otros').trim(),
          cost: Math.max(0, Number(product.cost) || 0),
          price: Math.max(0, Number(product.price) || 0),
          ...(product.creditPrice !== undefined ? { creditPrice: Math.max(0, Number(product.creditPrice) || 0) } : {}),
          discount: Math.max(0, Number(product.discount) || 0),
          discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
          discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
          stock: Math.max(0, Math.round(Number(product.stock) || 0)),
        };
        if (product.size?.trim()) payload.size = product.size.trim();
        if (Array.isArray(product.colors) && product.colors.length > 0) {
          payload.colors = product.colors;
          payload.color = product.colors.join(', ');
        } else if (product.color?.trim()) {
          payload.color = product.color.trim();
        }
        if (product.supplier?.trim()) payload.supplier = product.supplier.trim();
        if (safeImg) payload.img = safeImg;
        if (safeImg2) payload.img2 = safeImg2;
        if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
          payload.warehouseStocks = product.warehouseStocks;
        }
        const normalizedCS = normalizeColorStocks(
          Array.isArray(product.colors) ? product.colors : [],
          product.colorStocks
        );
        payload.colorStocks = normalizedCS ?? null;

        batch.set(docRef, stripUndefinedDeep(payload), { merge: true });
        pushedCodes.push(cleanCode);
      }

      if (pushedCodes.length > 0) {
        await batch.commit();
        markProductsSyncedToCloud(pushedCodes, slug);
        pushedCount += pushedCodes.length;
      }
    }
    if (pushedCount > 0) {
      await touchInventorySyncStamp(undefined, slug);
    }
  } catch (err) {
    console.warn('Could not flush pending local products to Firestore:', err);
  }
  return pushedCount;
}

export async function touchInventorySyncStamp(batch?: WriteBatch, companyId = getActiveCompanyId()): Promise<number> {
  const now = Date.now();
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
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

// ----------------- BACKEND MULTI-DEVICE CLOUD SYNC HUB HELPERS -----------------

export const HASHED_PASSWORD_MASK = '__HASHED__';

export function isMaskedOrHashedPassword(val: unknown): boolean {
  const clean = String(val ?? '').trim();
  if (!clean) return false;
  return clean === HASHED_PASSWORD_MASK || clean === '••••••••' || clean.startsWith('scrypt$');
}

export async function verifyPasswordClient(
  candidateInput: string,
  storedSecret: unknown
): Promise<boolean> {
  const cleanCandidate = String(candidateInput || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u202F]/g, '')
    .normalize('NFC')
    .trim();
  const stored = String(storedSecret || '').normalize('NFC').trim();
  if (!cleanCandidate || !stored || stored === HASHED_PASSWORD_MASK || stored === '••••••••') {
    return false;
  }

  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3 || parts[1].length < 16 || parts[2].length < 32) return false;
    const [, saltHex, expectedHex] = parts;
    try {
      const enc = new TextEncoder();
      const saltBytes = enc.encode(saltHex);
      const expectedLower = expectedHex.toLowerCase();
      const variants = Array.from(
        new Set([cleanCandidate, cleanCandidate.toUpperCase(), cleanCandidate.toLowerCase()])
      );
      for (const variant of variants) {
        const derived = await scrypt(enc.encode(variant), saltBytes, 16384, 8, 1, 64);
        let derivedHex = '';
        for (let i = 0; i < derived.length; i++) {
          derivedHex += derived[i].toString(16).padStart(2, '0');
        }
        if (derivedHex === expectedLower) {
          return true;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  return (
    cleanCandidate === stored ||
    cleanCandidate.toUpperCase() === stored.toUpperCase() ||
    cleanCandidate.toLowerCase() === stored.toLowerCase()
  );
}

let inMemoryAuthToken: string | null = null;

export function setAuthToken(token: string | null): void {
  const clean = token ? String(token).trim() : '';
  inMemoryAuthToken = clean || null;
  try {
    if (clean) {
      localStorage.setItem('stockmaster_auth_token', clean);
    } else {
      localStorage.removeItem('stockmaster_auth_token');
    }
  } catch {}
  try {
    if (clean) {
      sessionStorage.setItem('stockmaster_auth_token', clean);
    } else {
      sessionStorage.removeItem('stockmaster_auth_token');
    }
  } catch {}
}

export function getAuthToken(): string | null {
  if (inMemoryAuthToken) return inMemoryAuthToken;
  try {
    const lsToken = localStorage.getItem('stockmaster_auth_token');
    if (lsToken) {
      inMemoryAuthToken = lsToken;
      return lsToken;
    }
  } catch {}
  try {
    const ssToken = sessionStorage.getItem('stockmaster_auth_token');
    if (ssToken) {
      inMemoryAuthToken = ssToken;
      return ssToken;
    }
  } catch {}
  return null;
}

const SYNC_CLIENT_ID = `cl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function getSyncClientId(): string {
  return SYNC_CLIENT_ID;
}

export function getAuthHeaders(extraHeaders?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Sync-Client-Id': SYNC_CLIENT_ID,
    ...(extraHeaders || {}),
  };
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export async function hashPasswordViaServer(plain: string): Promise<string | null> {
  if (typeof window === 'undefined') return null;
  const clean = String(plain || '').trim();
  if (!clean || isMaskedOrHashedPassword(clean)) return null;
  try {
    const res = await fetch('/api/auth/hash-password', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({ password: clean }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.ok && typeof data.hash === 'string' ? data.hash : null;
  } catch {
    return null;
  }
}

let hasBackendAuthSession = false;

export function setBackendSessionAuthenticated(authenticated: boolean): void {
  hasBackendAuthSession = Boolean(authenticated);
}

export function isBackendSessionAuthenticated(): boolean {
  return hasBackendAuthSession;
}

export async function fetchPublicCatalogFromHub(
  companyId = getActiveCompanyId()
): Promise<{
  storeSettings?: Partial<StoreSettings>;
  items: Product[];
} | null> {
  if (typeof window === 'undefined') return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  try {
    const res = await fetch(`/api/public/catalog?empresa=${encodeURIComponent(slug)}`, {
      headers: getAuthHeaders(),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return {
      storeSettings: data.storeSettings,
      items: Array.isArray(data.items) ? data.items : [],
    };
  } catch {
    return null;
  }
}

export async function fetchBackendSyncStatus(
  companyId = getActiveCompanyId()
): Promise<{
  ok: boolean;
  updatedAt: number;
  inventoryCount: number;
  purchasesCount: number;
  salesCount: number;
  suppliersCount: number;
} | null> {
  if (typeof window === 'undefined' || !hasBackendAuthSession) return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  try {
    const res = await fetch(`/api/cloud-sync/status?companyId=${encodeURIComponent(slug)}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
    });
    if (res.status === 401) {
      hasBackendAuthSession = false;
      return null;
    }
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function syncInventoryWithBackendHub(
  localItems: Product[],
  companyId = getActiveCompanyId()
): Promise<Product[] | null> {
  if (typeof window === 'undefined' || !hasBackendAuthSession) return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mut = getPendingMutations(slug);

  // Hydrate any cached memory images before sending to the backend hub
  const enrichedItems = (localItems || []).map((p) => {
    const codeKey = (p.code || '').trim().toLowerCase();
    const memImg = memoryImageMap.get(`${slug}__${codeKey}`);
    const memImg2 = memoryImage2Map.get(`${slug}__${codeKey}`);
    return {
      ...p,
      img: p.img || memImg || '',
      img2: p.img2 || memImg2 || undefined,
    };
  });

  const unsyncedLookup = new Set(
    (mut.unsyncedCodes || []).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );
  const enrichedUpserts: Record<string, Product> = {};
  for (const [k, v] of Object.entries(mut.upserts || {})) {
    const cleanK = k.trim().toLowerCase();
    const memImg = memoryImageMap.get(`${slug}__${cleanK}`);
    const memImg2 = memoryImage2Map.get(`${slug}__${cleanK}`);
    if (v?.img) {
      memoryImageMap.set(`${slug}__${cleanK}`, v.img);
    }
    if (v?.img2) {
      memoryImage2Map.set(`${slug}__${cleanK}`, v.img2);
    }
    if (unsyncedLookup.has(cleanK)) {
      enrichedUpserts[cleanK] = {
        ...v,
        img: v.img || memImg || '',
        img2: v.img2 || memImg2 || undefined,
      };
    }
  }

  try {
    const res = await fetch('/api/cloud-sync/inventory', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        companyId: slug,
        items: enrichedItems,
        upserts: enrichedUpserts,
        unsyncedCodes: mut.unsyncedCodes || [],
        explicitDeletedCodes: mut.explicitDeletedCodes || [],
        deletedCodes: mut.deletedCodes || [],
        deletedIds: mut.deletedIds || [],
      }),
    });
    if (res.status === 401) {
      hasBackendAuthSession = false;
      return null;
    }
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok || !Array.isArray(data.items)) return null;

    // Update local tombstones from server's authoritative list
    if (Array.isArray(data.explicitDeletedCodes)) {
      mut.explicitDeletedCodes = data.explicitDeletedCodes;
    }
    if (Array.isArray(data.deletedCodes)) {
      mut.deletedCodes = data.deletedCodes;
    }
    if (Array.isArray(data.deletedIds)) {
      mut.deletedIds = data.deletedIds;
    }
    // Preserve product images in memoryImageMap and clear already-synced upserts so they never overwrite future stock edits
    for (const srvItem of data.items as Product[]) {
      const ck = (srvItem.code || '').trim().toLowerCase();
      if (!ck) continue;
      if (srvItem.img) {
        memoryImageMap.set(`${slug}__${ck}`, srvItem.img);
      }
      if (srvItem.img2) {
        memoryImage2Map.set(`${slug}__${ck}`, srvItem.img2);
      }
    }
    mut.upserts = {};
    mut.unsyncedCodes = [];
    savePendingMutations(mut, slug);

    return data.items as Product[];
  } catch (err) {
    console.warn('Backend hub inventory sync warning:', err);
    return null;
  }
}

export interface HubSyncEvent {
  type: 'connected' | 'sync';
  companyId: string;
  scopes?: string[];
  updatedAt: number;
  sourceClientId?: string;
}

export interface AuthoritativeHubSnapshot {
  ok: boolean;
  companyId: string;
  updatedAt: number;
  hydratedFromCloud?: boolean;
  inventory?: Product[];
  suppliers?: Supplier[];
  purchases?: PurchaseInvoice[];
  sales?: SaleRecord[];
  auditHistory?: AuditHistoryRecord[];
  users?: UserAccount[];
  allUsers?: UserAccount[];
  warehouses?: StoreWarehousesData | null;
  settings?: StoreSettings | null;
  posFinance?: POSFinanceStoreData | null;
  restaurant?: RestaurantStoreData | null;
  companies?: CompanyTenant[];
  deletedSaleIds?: string[];
  deletedSupplierIds?: string[];
  deletedPurchaseIds?: string[];
  deletedUserIds?: string[];
  explicitDeletedCodes?: string[];
  deletedCodes?: string[];
  deletedIds?: string[];
}

export function mergeInventoryUnion(
  base: Product[],
  incoming: Product[],
  deletedCodesSet?: Set<string>,
  deletedIdsSet?: Set<string>
): Product[] {
  const map = new Map<string, Product>();
  const isDeleted = (item?: Product | null) => {
    if (!item) return true;
    const ck = (item.code || '').trim().toLowerCase();
    const idStr = (item.id || '').trim();
    if (!ck) return true;
    if (deletedCodesSet && deletedCodesSet.has(ck)) return true;
    if (deletedIdsSet && idStr && deletedIdsSet.has(idStr)) return true;
    return false;
  };

  for (const item of base || []) {
    if (isDeleted(item)) continue;
    const ck = (item.code || '').trim().toLowerCase();
    map.set(ck, item);
  }

  for (const item of incoming || []) {
    if (isDeleted(item)) continue;
    const ck = (item.code || '').trim().toLowerCase();
    const existing = map.get(ck);
    if (!existing) {
      map.set(ck, item);
      continue;
    }
    const exTs = Number(existing.updatedAt || 0);
    const inTs = Number(item.updatedAt || 0);
    if (inTs >= exTs) {
      map.set(ck, {
        ...existing,
        ...item,
        img: item.img || existing.img || '',
        img2: item.img2 || existing.img2 || '',
      });
    } else {
      map.set(ck, {
        ...item,
        ...existing,
        img: existing.img || item.img || '',
        img2: existing.img2 || item.img2 || '',
      });
    }
  }

  return Array.from(map.values()).sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
  );
}

export function mergeSalesUnion(
  base: SaleRecord[],
  incoming: SaleRecord[],
  deletedSaleIds?: Set<string>
): SaleRecord[] {
  const map = new Map<string, SaleRecord>();
  const pickBetter = (a: SaleRecord, b: SaleRecord): SaleRecord => {
    const aUpdated = Number(a.updatedAt || 0);
    const bUpdated = Number(b.updatedAt || 0);
    const aPayLen = Array.isArray(a.creditPayments) ? a.creditPayments.length : 0;
    const bPayLen = Array.isArray(b.creditPayments) ? b.creditPayments.length : 0;
    const aPaid = Number(a.amountPaid || 0);
    const bPaid = Number(b.amountPaid || 0);

    // Preserve explicit newer updatedAt first, then more payments/higher paidAmount, then incoming (b)
    if (bUpdated !== aUpdated) {
      return bUpdated > aUpdated ? b : a;
    }
    if (bPayLen !== aPayLen) {
      return bPayLen > aPayLen ? b : a;
    }
    if (bPaid !== aPaid) {
      return bPaid > aPaid ? b : a;
    }
    if (b.status === 'cancelled' && a.status !== 'cancelled') return b;
    if (a.status === 'cancelled' && b.status !== 'cancelled') return a;
    return b;
  };

  for (const s of base || []) {
    if (!s || !s.id) continue;
    if (deletedSaleIds && deletedSaleIds.has(s.id)) continue;
    map.set(s.id, s);
  }
  for (const s of incoming || []) {
    if (!s || !s.id) continue;
    if (deletedSaleIds && deletedSaleIds.has(s.id)) continue;
    const existing = map.get(s.id);
    map.set(s.id, existing ? pickBetter(existing, s) : s);
  }

  return Array.from(map.values()).sort(
    (a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)
  );
}

export function mergePurchasesUnion(
  base: PurchaseInvoice[],
  incoming: PurchaseInvoice[],
  deletedPurchaseIds?: Set<string>
): PurchaseInvoice[] {
  const map = new Map<string, PurchaseInvoice>();
  for (const p of base || []) {
    if (!p || !p.id) continue;
    if (deletedPurchaseIds && deletedPurchaseIds.has(p.id)) continue;
    map.set(p.id, p);
  }
  for (const p of incoming || []) {
    if (!p || !p.id) continue;
    if (deletedPurchaseIds && deletedPurchaseIds.has(p.id)) continue;
    const existing = map.get(p.id);
    if (!existing) {
      map.set(p.id, p);
      continue;
    }
    const exTs = Number(existing.updatedAt || existing.timestamp || 0);
    const inTs = Number(p.updatedAt || p.timestamp || 0);
    if (inTs >= exTs || (p.status === 'cancelled' && existing.status !== 'cancelled')) {
      map.set(p.id, p);
    }
  }
  return Array.from(map.values()).sort(
    (a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)
  );
}

export function mergeSuppliersUnion(
  base: Supplier[],
  incoming: Supplier[],
  deletedSupplierIds?: Set<string>
): Supplier[] {
  const map = new Map<string, Supplier>();
  for (const s of base || []) {
    if (!s || !s.id) continue;
    if (deletedSupplierIds && deletedSupplierIds.has(s.id)) continue;
    map.set(s.id, s);
  }
  for (const s of incoming || []) {
    if (!s || !s.id) continue;
    if (deletedSupplierIds && deletedSupplierIds.has(s.id)) continue;
    const existing = map.get(s.id);
    if (!existing) {
      map.set(s.id, s);
      continue;
    }
    const exTs = Number(existing.updatedAt || 0);
    const inTs = Number(s.updatedAt || 0);
    if (inTs >= exTs) {
      map.set(s.id, s);
    }
  }
  return Array.from(map.values()).sort((a, b) =>
    (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
  );
}

export function mergeAuditHistoryUnion(
  base: AuditHistoryRecord[],
  incoming: AuditHistoryRecord[]
): AuditHistoryRecord[] {
  const map = new Map<string, AuditHistoryRecord>();
  for (const rec of [...(base || []), ...(incoming || [])]) {
    if (!rec) continue;
    const key = String(rec.id || `${rec.timestamp}_${rec.date || ''}`).trim();
    if (!key) continue;
    map.set(key, rec);
  }
  return Array.from(map.values()).sort(
    (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0)
  );
}

export function subscribeToBackendSyncStream(
  companyId: string,
  onEvent: (event: HubSyncEvent) => void
): () => void {
  if (typeof window === 'undefined' || !hasBackendAuthSession || typeof EventSource === 'undefined') {
    return () => {};
  }
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  let es: EventSource | null = null;
  let closed = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let retryDelayMs = 1500;

  const connect = () => {
    if (closed || !hasBackendAuthSession) return;
    try {
      const token = getAuthToken();
      const params = new URLSearchParams({
        companyId: slug,
        clientId: SYNC_CLIENT_ID,
      });
      if (token) {
        params.set('token', token);
      }
      es = new EventSource(`/api/cloud-sync/stream?${params.toString()}`, {
        withCredentials: true,
      });

      es.addEventListener('connected', (ev: MessageEvent) => {
        retryDelayMs = 1500;
        try {
          const parsed = JSON.parse(ev.data);
          onEvent({
            type: 'connected',
            companyId: parsed.companyId || slug,
            updatedAt: Number(parsed.updatedAt || 0),
          });
        } catch {}
      });

      es.addEventListener('sync', (ev: MessageEvent) => {
        retryDelayMs = 1500;
        try {
          const parsed = JSON.parse(ev.data);
          onEvent({
            type: 'sync',
            companyId: parsed.companyId || slug,
            scopes: Array.isArray(parsed.scopes) ? parsed.scopes : undefined,
            updatedAt: Number(parsed.updatedAt || 0),
            sourceClientId: parsed.sourceClientId || '',
          });
        } catch {}
      });

      es.onerror = () => {
        if (es) {
          try {
            es.close();
          } catch {}
          es = null;
        }
        if (closed || !hasBackendAuthSession) return;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          retryDelayMs = Math.min(retryDelayMs * 1.6, 12000);
          connect();
        }, retryDelayMs);
      };
    } catch {}
  };

  connect();

  return () => {
    closed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (es) {
      try {
        es.close();
      } catch {}
      es = null;
    }
  };
}

export async function fetchAuthoritativeHubSnapshot(
  companyId = getActiveCompanyId(),
  scopes?: string[],
  reconcile = false
): Promise<AuthoritativeHubSnapshot | null> {
  if (typeof window === 'undefined' || !hasBackendAuthSession) return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  try {
    const params = new URLSearchParams({ companyId: slug });
    if (Array.isArray(scopes) && scopes.length > 0) {
      params.set('scopes', scopes.join(','));
    }
    if (reconcile) {
      params.set('reconcile', '1');
    }
    const res = await fetch(`/api/cloud-sync/snapshot?${params.toString()}`, {
      credentials: 'include',
      headers: getAuthHeaders(),
      cache: 'no-store',
    });
    if (res.status === 401) {
      hasBackendAuthSession = false;
      return null;
    }
    if (!res.ok) return null;
    const data = (await res.json()) as AuthoritativeHubSnapshot;
    if (!data?.ok) return null;

    // Immediately sync server tombstones to local storage so deleted items never reappear on mobile/PC
    if (Array.isArray(data.deletedSaleIds) && data.deletedSaleIds.length > 0) {
      markSalesDeletedLocally(data.deletedSaleIds, slug);
    }

    const mut = getPendingMutations(slug);
    let mutChanged = false;
    if (Array.isArray(data.explicitDeletedCodes)) {
      mut.explicitDeletedCodes = Array.from(
        new Set([...(mut.explicitDeletedCodes || []), ...data.explicitDeletedCodes])
      );
      mutChanged = true;
    }
    if (Array.isArray(data.deletedCodes)) {
      mut.deletedCodes = Array.from(new Set([...(mut.deletedCodes || []), ...data.deletedCodes]));
      mutChanged = true;
    }
    if (Array.isArray(data.deletedIds)) {
      mut.deletedIds = Array.from(new Set([...(mut.deletedIds || []), ...data.deletedIds]));
      mutChanged = true;
    }
    if (mutChanged) {
      savePendingMutations(mut, slug);
    }

    const hasServerState = Number(data.updatedAt || 0) > 0;
    const isCloudAuthoritative = Boolean(data.hydratedFromCloud);
    const explicitScopes = new Set(Array.isArray(scopes) ? scopes : []);

    // When server has hydrated from live Firestore Cloud, treat server snapshot as the exact single source of truth
    // (preserving only genuinely unsynced local mutations via applyPendingMutationsToInventory, never resurrecting stale localStorage zombies)
    if (Array.isArray(data.inventory)) {
      for (const srvItem of data.inventory) {
        const ck = (srvItem.code || '').trim().toLowerCase();
        if (!ck) continue;
        if (srvItem.img) memoryImageMap.set(`${slug}__${ck}`, srvItem.img);
        if (srvItem.img2) memoryImage2Map.set(`${slug}__${ck}`, srvItem.img2);
      }

      const deletedCodesSet = new Set<string>(
        [...(mut.explicitDeletedCodes || []), ...(mut.deletedCodes || [])]
          .map((c) => String(c || '').trim().toLowerCase())
          .filter(Boolean)
      );
      const deletedIdsSet = new Set<string>(
        (mut.deletedIds || []).map((id) => String(id || '').trim()).filter(Boolean)
      );

      let mergedInv: Product[];
      if (isCloudAuthoritative) {
        mergedInv = applyPendingMutationsToInventory(data.inventory, slug, true);
      } else {
        const idbInv = await loadInventoryFromIndexedDB(slug).catch(() => null);
        const lsInv = getCachedInventory(slug) || [];
        const localBaseInv = mergeInventoryUnion(lsInv, idbInv || [], deletedCodesSet, deletedIdsSet);
        mergedInv = applyPendingMutationsToInventory(
          mergeInventoryUnion(localBaseInv, data.inventory, deletedCodesSet, deletedIdsSet),
          slug,
          true
        );
      }
      data.inventory = mergedInv;

      if (
        hasServerState &&
        (mergedInv.length > 0 ||
          explicitScopes.has('inventory') ||
          (data.explicitDeletedCodes?.length || 0) > 0)
      ) {
        setCachedInventory(mergedInv, Math.max(data.updatedAt || 0, Date.now()), slug);
      }
    }

    if (Array.isArray(data.sales)) {
      const deletedSet = getLocallyDeletedSaleIds(slug);
      let cleanSales: SaleRecord[];
      if (isCloudAuthoritative) {
        const srvById = new Map<string, SaleRecord>();
        for (const s of data.sales) {
          if (s && s.id && !deletedSet.has(s.id)) {
            srvById.set(s.id, s);
          }
        }
        const nowMs = Date.now();
        for (const [k, entry] of recentLocalSalesMap.entries()) {
          if (nowMs - entry.writtenAt > RECENT_LOCAL_SALE_TTL_MS) {
            recentLocalSalesMap.delete(k);
            continue;
          }
          if (entry.slug !== slug) continue;
          if (deletedSet.has(entry.sale.id)) {
            recentLocalSalesMap.delete(k);
            continue;
          }
          const srvMatch = srvById.get(entry.sale.id);
          const localUpd = Number(entry.sale.updatedAt || entry.sale.timestamp || 0);
          const srvUpd = Number(srvMatch?.updatedAt || srvMatch?.timestamp || 0);
          if (!srvMatch || localUpd > srvUpd) {
            srvById.set(entry.sale.id, entry.sale);
          } else {
            recentLocalSalesMap.delete(k);
          }
        }
        cleanSales = Array.from(srvById.values()).sort(
          (a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)
        );
      } else {
        const cachedSales = getCachedSales(slug) || [];
        cleanSales = mergeSalesUnion(cachedSales, data.sales, deletedSet);
      }
      data.sales = cleanSales;

      if (
        hasServerState &&
        (cleanSales.length > 0 ||
          explicitScopes.has('sales') ||
          (data.deletedSaleIds?.length || 0) > 0)
      ) {
        setCachedSales(cleanSales, slug);
      }
    }

    if (data.posFinance) {
      const sanitizedPos = sanitizePOSFinanceDoc(slug, data.posFinance as Record<string, any>);
      const cachedPos = getCachedPOSFinanceData(slug);
      const mergedPos = mergePOSFinanceObjects(slug, cachedPos, sanitizedPos);
      data.posFinance = mergedPos;
      setCachedPOSFinanceData(mergedPos, slug);
    }

    if (Array.isArray(data.purchases)) {
      const delPurchases = new Set((data.deletedPurchaseIds || []).map((id) => String(id).trim()));
      const cleanPurchases = isCloudAuthoritative
        ? data.purchases
            .filter((p) => p && p.id && !delPurchases.has(p.id))
            .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
        : mergePurchasesUnion(getCachedPurchases(slug) || [], data.purchases, delPurchases);
      data.purchases = cleanPurchases;

      if (
        hasServerState &&
        (cleanPurchases.length > 0 ||
          explicitScopes.has('purchases') ||
          (data.deletedPurchaseIds?.length || 0) > 0)
      ) {
        setCachedPurchases(cleanPurchases, slug);
      }
    }

    if (Array.isArray(data.suppliers)) {
      const delSuppliers = new Set((data.deletedSupplierIds || []).map((id) => String(id).trim()));
      const cleanSuppliers = isCloudAuthoritative
        ? data.suppliers
            .filter((s) => s && s.id && !delSuppliers.has(s.id))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }))
        : mergeSuppliersUnion(getCachedSuppliers(slug) || [], data.suppliers, delSuppliers);
      data.suppliers = cleanSuppliers;

      if (
        hasServerState &&
        (cleanSuppliers.length > 0 ||
          explicitScopes.has('suppliers') ||
          (data.deletedSupplierIds?.length || 0) > 0)
      ) {
        setCachedSuppliers(cleanSuppliers, slug);
      }
    }

    if (Array.isArray(data.auditHistory)) {
      const cleanAudit = isCloudAuthoritative
        ? [...data.auditHistory].sort(
            (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0)
          )
        : mergeAuditHistoryUnion(getCachedAuditHistory(slug) || [], data.auditHistory);
      data.auditHistory = cleanAudit;

      if (hasServerState && (cleanAudit.length > 0 || explicitScopes.has('auditHistory'))) {
        setCachedAuditHistory(cleanAudit, slug);
      }
    }

    if (data.warehouses) {
      setCachedStoreWarehouses(data.warehouses, slug);
    }

    if (data.settings) {
      setCachedStoreSettings(data.settings, slug);
    }

    if (data.restaurant) {
      setCachedRestaurantData(data.restaurant, slug);
    }

    if (Array.isArray(data.users) && data.users.length > 0) {
      setCachedUsers(data.users, slug);
    }

    if (Array.isArray(data.companies) && data.companies.length > 0) {
      setCachedCompanies(data.companies);
    }

    return data;
  } catch {
    return null;
  }
}

// Lightweight retry queue for mobile network blips so mutations NEVER get lost
interface PendingHubTask {
  url: string;
  body: Record<string, any>;
}
const pendingHubQueue: PendingHubTask[] = [];

export async function flushPendingHubQueue(): Promise<void> {
  if (typeof window === 'undefined' || !hasBackendAuthSession || pendingHubQueue.length === 0) {
    return;
  }
  const tasks = pendingHubQueue.splice(0, pendingHubQueue.length);
  for (const task of tasks) {
    try {
      const res = await fetch(task.url, {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(),
        body: JSON.stringify(task.body),
      });
      if (res.status === 401) {
        hasBackendAuthSession = false;
        return;
      }
      if (!res.ok) {
        pendingHubQueue.push(task);
      }
    } catch {
      pendingHubQueue.push(task);
      break;
    }
  }
}

export async function pushProductSaveToBackendHub(
  product?: Product,
  oldCode?: string,
  companyId = getActiveCompanyId(),
  products?: Product[]
): Promise<void> {
  if (typeof window === 'undefined' || !hasBackendAuthSession) return;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const body = {
    companyId: slug,
    product,
    products,
    oldCode,
  };
  try {
    const res = await fetch('/api/cloud-sync/product-save', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      hasBackendAuthSession = false;
    } else if (!res.ok) {
      pendingHubQueue.push({ url: '/api/cloud-sync/product-save', body });
    }
  } catch {
    pendingHubQueue.push({ url: '/api/cloud-sync/product-save', body });
  }
}

export async function pushProductDeleteToBackendHub(
  id: string,
  code?: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  if (typeof window === 'undefined' || !hasBackendAuthSession) return;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const body = {
    companyId: slug,
    id,
    code,
  };
  try {
    const res = await fetch('/api/cloud-sync/product-delete', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      hasBackendAuthSession = false;
    } else if (!res.ok) {
      pendingHubQueue.push({ url: '/api/cloud-sync/product-delete', body });
    }
  } catch {
    pendingHubQueue.push({ url: '/api/cloud-sync/product-delete', body });
  }
}

export async function syncCollectionsWithBackendHub(
  payload: {
    suppliers?: Supplier[];
    purchases?: PurchaseInvoice[];
    sales?: SaleRecord[];
    auditHistory?: AuditHistoryRecord[];
    users?: UserAccount[];
    warehouses?: StoreWarehousesData;
    settings?: StoreSettings;
    posFinance?: POSFinanceStoreData;
    restaurant?: RestaurantStoreData;
    companies?: CompanyTenant[];
    deleteSupplierId?: string;
    deletePurchaseId?: string;
    deleteSaleId?: string;
    deleteUserId?: string;
  },
  companyId = getActiveCompanyId()
): Promise<{
  suppliers: Supplier[];
  purchases: PurchaseInvoice[];
  sales: SaleRecord[];
  auditHistory?: AuditHistoryRecord[];
  deletedSaleIds?: string[];
  deletedSupplierIds?: string[];
  deletedPurchaseIds?: string[];
  deletedUserIds?: string[];
  users: UserAccount[];
  allUsers?: UserAccount[];
  warehouses: StoreWarehousesData | null;
  settings: StoreSettings | null;
  posFinance: POSFinanceStoreData | null;
  restaurant?: RestaurantStoreData | null;
  companies: CompanyTenant[];
  updatedAt: number;
} | null> {
  if (typeof window === 'undefined' || !hasBackendAuthSession) return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const body = {
    companyId: slug,
    ...payload,
  };
  try {
    const res = await fetch('/api/cloud-sync/collections', {
      method: 'POST',
      credentials: 'include',
      headers: getAuthHeaders(),
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      hasBackendAuthSession = false;
      return null;
    }
    if (!res.ok) {
      if (Object.keys(payload).length > 0) {
        pendingHubQueue.push({ url: '/api/cloud-sync/collections', body });
      }
      return null;
    }
    const data = await res.json();
    if (!data?.ok) return null;
    if (Array.isArray(data.deletedSaleIds) && data.deletedSaleIds.length > 0) {
      markSalesDeletedLocally(data.deletedSaleIds, slug);
    }
    return data;
  } catch {
    if (Object.keys(payload).length > 0) {
      pendingHubQueue.push({ url: '/api/cloud-sync/collections', body });
    }
    return null;
  }
}

export async function fetchInventorySmart(
  forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<{ items: Product[]; fromCache: boolean; readsUsed: number; quotaExceeded?: boolean }> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : resolveCompanySlugFromInput(companyId);
  const idbCached = await loadInventoryFromIndexedDB(slug);
  const lsCached = getCachedInventory(slug);

  // Combine IndexedDB + localStorage + pending local mutations first so zero local items are ever left behind
  const localMap = new Map<string, Product>();
  if (lsCached && lsCached.length > 0) {
    for (const p of lsCached) {
      const k = (p.code || '').trim().toLowerCase();
      if (k) localMap.set(k, p);
    }
  }
  if (idbCached && idbCached.length > 0) {
    for (const p of idbCached) {
      const k = (p.code || '').trim().toLowerCase();
      if (!k) continue;
      const prev = localMap.get(k);
      localMap.set(k, prev ? { ...prev, ...p, img: p.img || prev.img || '' } : p);
    }
  }
  const combinedLocal = applyPendingMutationsToInventory(
    Array.from(localMap.values()),
    slug,
    false
  );

  if (forceRefresh) {
    firestoreReadQuotaExhaustedUntil = 0;
  }

  // If Firestore read quota is currently known to be exhausted, synchronize directly with our Express Multi-Device Sync Hub
  if (isFirestoreQuotaExhausted()) {
    const hubItems = await syncInventoryWithBackendHub(combinedLocal, slug);
    const baseItems = hubItems && hubItems.length > 0 ? hubItems : combinedLocal;
    const mergedHub = applyPendingMutationsToInventory(baseItems, slug, true);
    setCachedInventory(mergedHub, Date.now(), slug);
    return {
      items: mergedHub,
      fromCache: !hubItems,
      readsUsed: 0,
      quotaExceeded: !hubItems,
    };
  }

  const localTs = Number(localStorage.getItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY_TS, slug)) || 0);
  const scopedQuery = getScopedInventoryQuery(slug);

  try {
    if (forceRefresh) {
      await flushPendingInventoryToFirestore(slug);
    }

    const syncRef = doc(db, 'settings', getSyncStateDocId(slug));
    let remoteTs = 0;
    if (!forceRefresh) {
      try {
        const syncSnap = await getDoc(syncRef);
        remoteTs = syncSnap.exists() ? Number(syncSnap.data()?.updatedAt || 0) : 0;
      } catch (err) {
        if (isQuotaOrNetworkError(err)) {
          const hubItems = await syncInventoryWithBackendHub(combinedLocal, slug);
          const baseItems = hubItems && hubItems.length > 0 ? hubItems : combinedLocal;
          const mergedHub = applyPendingMutationsToInventory(baseItems, slug, true);
          setCachedInventory(mergedHub, Date.now(), slug);
          return { items: mergedHub, fromCache: false, readsUsed: 0, quotaExceeded: false };
        }
        const cachedSync = await getDocFromCache(syncRef).catch(() => null);
        remoteTs = cachedSync && cachedSync.exists() ? Number(cachedSync.data()?.updatedAt || 0) : 0;
      }

      if (combinedLocal.length > 0 && remoteTs > 0 && localTs >= remoteTs) {
        const syncedWithHub = (await syncInventoryWithBackendHub(combinedLocal, slug)) || combinedLocal;
        const merged = applyPendingMutationsToInventory(syncedWithHub, slug, true);
        setCachedInventory(merged, undefined, slug);
        return { items: merged, fromCache: true, readsUsed: 1 };
      }
    }

    const snapshot = forceRefresh
      ? await getDocsFromServer(scopedQuery).catch(() => getDocs(scopedQuery))
      : await getDocs(scopedQuery);

    const serverCodeSet = new Set<string>();
    snapshot.forEach((docSnap: any) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
      const c = (
        data.code ||
        (docSnap.id.includes('__') ? docSnap.id.split('__').slice(1).join('__') : docSnap.id)
      )
        .trim()
        .toLowerCase();
      if (c) serverCodeSet.add(c);
    });

    const fsItems = parseInventorySnapshotDocs(snapshot, slug, true);
    // Merge Firestore items with Backend Hub items so both sources stay 100% unified
    const syncedWithHub = (await syncInventoryWithBackendHub(fsItems, slug)) || fsItems;
    const finalItems = applyPendingMutationsToInventory(syncedWithHub, slug, true);

    if (forceRefresh) {
      const mut = getPendingMutations(slug);
      const explicitDel = new Set((mut.explicitDeletedCodes || []).map((c) => c.toLowerCase()));
      const delSet = new Set(mut.deletedCodes.map((c) => c.toLowerCase()));
      const missingInCloud: string[] = [];

      for (const item of finalItems) {
        const codeKey = (item.code || '').trim().toLowerCase();
        if (
          codeKey &&
          !serverCodeSet.has(codeKey) &&
          !explicitDel.has(codeKey) &&
          !delSet.has(codeKey) &&
          !AUTO_GENERATED_SKU_REGEX.test(item.code || codeKey)
        ) {
          mut.upserts[codeKey] = item;
          missingInCloud.push(codeKey);
        }
      }

      if (missingInCloud.length > 0) {
        mut.unsyncedCodes = Array.from(new Set([...(mut.unsyncedCodes || []), ...missingInCloud]));
        savePendingMutations(mut, slug);
        await flushPendingInventoryToFirestore(slug);
      }

      const syncedCodes = Array.from(serverCodeSet);
      if (syncedCodes.length > 0) {
        markProductsSyncedToCloud(syncedCodes, slug);
      }
    }

    const effectiveTs = Date.now();
    setCachedInventory(finalItems, effectiveTs, slug);

    if (!forceRefresh && remoteTs === 0) {
      await setDoc(syncRef, { storeName: `Sync ${slug}`, updatedAt: effectiveTs }, { merge: true }).catch(() => {});
    }

    return { items: finalItems, fromCache: false, readsUsed: finalItems.length + (forceRefresh ? 0 : 1) };
  } catch (error) {
    const quotaHit = isQuotaOrNetworkError(error);
    const hubItems = await syncInventoryWithBackendHub(combinedLocal, slug);
    const baseItems = hubItems && hubItems.length > 0 ? hubItems : combinedLocal;
    if (baseItems && baseItems.length > 0) {
      const cleanedBase = applyPendingMutationsToInventory(baseItems, slug, Boolean(hubItems));
      setCachedInventory(cleanedBase, Date.now(), slug);
      return {
        items: cleanedBase,
        fromCache: !hubItems,
        readsUsed: 0,
        quotaExceeded: quotaHit && !hubItems,
      };
    }

    try {
      const cacheSnap = await getDocsFromCache(scopedQuery);
      if (!cacheSnap.empty) {
        const itemsFromFsCache = parseInventorySnapshotDocs(cacheSnap, slug, false);
        if (itemsFromFsCache.length > 0) {
          const syncedCache = (await syncInventoryWithBackendHub(itemsFromFsCache, slug)) || itemsFromFsCache;
          setCachedInventory(syncedCache, Date.now(), slug);
          return {
            items: syncedCache,
            fromCache: !hubItems,
            readsUsed: 0,
            quotaExceeded: quotaHit && !hubItems,
          };
        }
      }
    } catch {}

    const pendingOnly = applyPendingMutationsToInventory([], slug, false);
    if (pendingOnly.length > 0) {
      const syncedPending = (await syncInventoryWithBackendHub(pendingOnly, slug)) || pendingOnly;
      setCachedInventory(syncedPending, Date.now(), slug);
      return {
        items: syncedPending,
        fromCache: !hubItems,
        readsUsed: 0,
        quotaExceeded: quotaHit && !hubItems,
      };
    }

    return { items: [], fromCache: true, readsUsed: 0, quotaExceeded: quotaHit && !hubItems };
  }
}

// ----------------- REAL-TIME INVENTORY -----------------

export function subscribeToInventory(
  onData: (items: Product[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : resolveCompanySlugFromInput(companyId);
  if (isFirestoreQuotaExhausted()) {
    return () => {};
  }
  const scopedQuery = getScopedInventoryQuery(slug);
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const isFromServer = !snapshot.metadata?.fromCache;
      const items = parseInventorySnapshotDocs(snapshot, slug, isFromServer);
      setCachedInventory(items, undefined, slug);
      onData(items);
      if (isFromServer) {
        syncInventoryWithBackendHub(items, slug)
          .then((hubItems) => {
            if (hubItems && hubItems.length > 0) {
              const cleanHub = applyPendingMutationsToInventory(hubItems, slug, true);
              setCachedInventory(cleanHub, undefined, slug);
              onData(cleanHub);
            }
          })
          .catch(() => {});
      }
    },
    async (error) => {
      isQuotaOrNetworkError(error);
      if (onError) onError(error);
      const idbItems = await loadInventoryFromIndexedDB(slug);
      const lsItems = getCachedInventory(slug);
      const base = idbItems && idbItems.length > 0 ? idbItems : lsItems || [];
      const hubSynced = await syncInventoryWithBackendHub(base, slug);
      if (hubSynced && hubSynced.length > 0) {
        setCachedInventory(hubSynced, undefined, slug);
        onData(hubSynced);
        return;
      }
      if (base.length > 0) {
        onData(base);
      }
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

  recordLocalProductSave(product, oldCode, slug);
  pushProductSaveToBackendHub(product, oldCode, slug).catch(() => {});

  const buildPayload = (includeImage: boolean): Record<string, any> => {
    const payload: Record<string, any> = {
      companyId: slug,
      code: product.code.trim(),
      name: product.name.trim(),
      category: (product.category || 'Otros').trim(),
      cost: Number(product.cost) || 0,
      price: Number(product.price) || 0,
      ...(product.creditPrice !== undefined ? { creditPrice: Math.max(0, Number(product.creditPrice) || 0) } : {}),
      discount: Math.max(0, Number(product.discount) || 0),
      discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
      discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
      stock: Math.max(0, Math.round(Number(product.stock) || 0)),
      updatedAt: Date.now(),
    };

    if (product.size !== undefined) payload.size = (product.size || '').trim();
    if (Array.isArray(product.colors)) {
      payload.colors = product.colors.map((c) => String(c || '').trim()).filter(Boolean);
      payload.color = payload.colors.join(', ');
    } else if (product.color !== undefined) {
      payload.color = (product.color || '').trim();
    }
    if (product.supplier !== undefined) payload.supplier = (product.supplier || '').trim();
    const img1Str = (product.img || '').trim();
    const img2Str = (product.img2 || '').trim();
    if (includeImage) {
      if (img1Str.length <= 900_000) {
        payload.img = img1Str;
      }
      if (img2Str.length <= 900_000 && img1Str.length + img2Str.length <= 940_000) {
        payload.img2 = img2Str;
      } else if (!img2Str) {
        payload.img2 = '';
      }
    }
    if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
      payload.warehouseStocks = product.warehouseStocks;
    }
    const cleanColorsForStock = Array.isArray(product.colors)
      ? product.colors.map((c) => String(c || '').trim()).filter(Boolean)
      : [];
    const normalizedCS = normalizeColorStocks(cleanColorsForStock, product.colorStocks);
    payload.colorStocks = normalizedCS ?? null;
    return stripUndefinedDeep(payload);
  };

  try {
    const batch = writeBatch(db);

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
    } else if (isGyG) {
      // Also delete any legacy alias doc IDs for the same SKU so only tiendagyg__{code} exists
      const cleanSameCode = product.code.trim().replace(/\//g, '_');
      for (const legacyId of [
        `comercial-gyg__${cleanSameCode}`,
        `comercialgyg__${cleanSameCode}`,
        `comercial_gyg__${cleanSameCode}`,
        `gyg__${cleanSameCode}`,
      ]) {
        if (legacyId !== docId) {
          batch.delete(doc(db, 'inventory', legacyId));
        }
      }
    }

    const docRef = doc(db, 'inventory', docId);
    batch.set(docRef, buildPayload(true), { merge: true });
    await batch.commit();
    markProductsSyncedToCloud([product.code], slug);

    await touchInventorySyncStamp(undefined, slug);
    if (isGyG) {
      await touchInventorySyncStamp(undefined, 'comercial-gyg').catch(() => {});
      await touchInventorySyncStamp(undefined, 'comercialgyg').catch(() => {});
    }
  } catch (error) {
    // If commit failed due to oversized base64 image exceeding 1MB limit, retry without the oversized image
    if (product.img && product.img.length > 200_000 && !isQuotaOrNetworkError(error)) {
      try {
        const docRef = doc(db, 'inventory', docId);
        await setDoc(docRef, buildPayload(false), { merge: true });
        markProductsSyncedToCloud([product.code], slug);
        await touchInventorySyncStamp(undefined, slug);
        return;
      } catch {}
    }
    console.warn('Product saved in local cache; cloud sync deferred:', error);
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

  recordLocalProductDelete(id, code, slug);
  pushProductDeleteToBackendHub(id, code, slug).catch(() => {});

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

  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  products.forEach((p) => {
    if (p.code?.trim()) {
      recordLocalProductSave(p, undefined, slug);
    }
  });
  pushProductSaveToBackendHub(undefined, undefined, slug, products).catch(() => {});
  if (newSuppliers.length > 0) {
    syncCollectionsWithBackendHub({ suppliers: newSuppliers }, slug).catch(() => {});
  }

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
      const chunkCodes: string[] = [];

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
          ...(product.creditPrice !== undefined ? { creditPrice: Math.max(0, Number(product.creditPrice) || 0) } : {}),
          discount: Math.max(0, Number(product.discount) || 0),
          discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
          discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
          stock: Math.max(0, Math.round(Number(product.stock) || 0)),
        };

        if (product.size !== undefined) payload.size = product.size.trim();
        if (Array.isArray(product.colors)) {
          payload.colors = product.colors.map((c) => String(c || '').trim()).filter(Boolean);
          payload.color = payload.colors.join(', ');
        } else if (product.color !== undefined) {
          payload.color = product.color.trim();
        }
        if (product.supplier !== undefined) payload.supplier = product.supplier.trim();
        const img1Str = (product.img || '').trim();
        const img2Str = (product.img2 || '').trim();
        if (img1Str && img1Str.length <= 900_000) {
          payload.img = img1Str;
        }
        if (img2Str && img2Str.length <= 900_000 && img1Str.length + img2Str.length <= 940_000) {
          payload.img2 = img2Str;
        }
        if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
          payload.warehouseStocks = product.warehouseStocks;
        }
        const bulkColors = Array.isArray(product.colors)
          ? product.colors.map((c) => String(c || '').trim()).filter(Boolean)
          : [];
        const normalizedBulkCS = normalizeColorStocks(bulkColors, product.colorStocks);
        if (normalizedBulkCS) {
          payload.colorStocks = normalizedBulkCS;
        }

        batch.set(docRef, stripUndefinedDeep(payload), { merge: true });
        chunkCodes.push(product.code.trim());
      });

      await batch.commit();
      markProductsSyncedToCloud(chunkCodes, slug);
    }
    await touchInventorySyncStamp(undefined, slug);
  } catch (error) {
    console.warn('Bulk products saved locally; cloud sync deferred:', error);
  }
}

// ----------------- SUPPLIERS (ON-DEMAND & REAL-TIME) -----------------

export async function fetchSuppliersOnce(
  forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<Supplier[]> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedSuppliers(slug) || [];
  const hubSync = await syncCollectionsWithBackendHub({ suppliers: cached }, slug);
  const baseSups = hubSync?.suppliers && hubSync.suppliers.length > 0 ? hubSync.suppliers : cached;

  if (isFirestoreQuotaExhausted()) {
    setCachedSuppliers(baseSups, slug);
    return baseSups;
  }

  const scopedQuery = getScopedCollectionQuery('suppliers', slug);
  try {
    const snapshot = forceRefresh
      ? await getDocsFromServer(scopedQuery).catch(() => getDocs(scopedQuery))
      : await getDocs(scopedQuery);
    const suppliers: Supplier[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
      suppliers.push({
        id: docSnap.id,
        companyId: data.companyId || slug,
        name: (data.name || '').trim(),
        contact: data.contact || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
      });
    });
    const mergedHub = await syncCollectionsWithBackendHub({ suppliers }, slug);
    const finalSups = mergedHub?.suppliers && mergedHub.suppliers.length > 0 ? mergedHub.suppliers : suppliers;
    finalSups.sort((a, b) => a.name.localeCompare(b.name));
    setCachedSuppliers(finalSups, slug);
    return finalSups;
  } catch (error) {
    isQuotaOrNetworkError(error);
    if (baseSups.length > 0) {
      setCachedSuppliers(baseSups, slug);
      return baseSups;
    }
    return [];
  }
}

export function subscribeToSuppliers(
  onData: (suppliers: Supplier[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const scopedQuery = getScopedCollectionQuery('suppliers', slug);
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const suppliers: Supplier[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
        suppliers.push({
          id: docSnap.id,
          companyId: data.companyId || slug,
          name: (data.name || '').trim(),
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
      const cached = getCachedSuppliers(slug);
      if (cached) onData(cached);
    }
  );
}

export async function saveSupplierToFirestore(
  supplier: Supplier,
  oldName?: string,
  inventoryItems?: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const rawId = supplier.id ? supplier.id : Date.now().toString();
  const docId = getScopedDocId(rawId, slug);
  const path = `suppliers/${docId}`;
  const currentSups = getCachedSuppliers(slug) || [];
  const nextSups = [
    ...currentSups.filter((s) => s.id !== docId && s.id !== supplier.id),
    { ...supplier, id: docId, companyId: slug, name: supplier.name.trim() },
  ].sort((a, b) => a.name.localeCompare(b.name));
  setCachedSuppliers(nextSups, slug);
  syncCollectionsWithBackendHub({ suppliers: nextSups }, slug).catch(() => {});

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
    if (isQuotaOrNetworkError(error)) {
      console.warn('Supplier saved in local cache; cloud sync deferred:', error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function deleteSupplierFromFirestore(
  id: string,
  name?: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  syncCollectionsWithBackendHub({ deleteSupplierId: id }, slug).catch(() => {});
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
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedAuditHistory(slug) || [];
  const scopedQuery = getScopedCollectionQuery('audit_history', slug);
  const parseDocs = (snap: any): AuditHistoryRecord[] => {
    const records: AuditHistoryRecord[] = [];
    snap.forEach((docSnap: any) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
      records.push({
        id: docSnap.id,
        companyId: data.companyId || slug,
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
    return records;
  };

  let fsRecords: AuditHistoryRecord[] = [];
  if (!isFirestoreQuotaExhausted()) {
    try {
      const snapshot = await withFirestoreTimeout(getDocs(scopedQuery), 6500);
      fsRecords = parseDocs(snapshot);
    } catch (error) {
      isQuotaOrNetworkError(error);
      try {
        const cacheSnap = await getDocsFromCache(scopedQuery);
        if (!cacheSnap.empty) {
          fsRecords = parseDocs(cacheSnap);
        }
      } catch {}
    }
  }

  const localUnion = mergeAuditHistoryUnion(cached, fsRecords);
  const hubRes = await syncCollectionsWithBackendHub(
    localUnion.length > 0 ? { auditHistory: localUnion } : {},
    slug
  ).catch(() => null);
  const merged = mergeAuditHistoryUnion(localUnion, hubRes?.auditHistory || []);
  setCachedAuditHistory(merged, slug);
  return merged;
}

export function subscribeToAuditHistory(
  onData: (records: AuditHistoryRecord[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  if (isFirestoreQuotaExhausted()) {
    fetchAuditHistoryOnce(false, slug).then(onData).catch(() => {});
    return () => {};
  }
  const scopedQuery = getScopedCollectionQuery('audit_history', slug);
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const records: AuditHistoryRecord[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
        records.push({
          id: docSnap.id,
          companyId: data.companyId || slug,
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
      const cached = getCachedAuditHistory(slug) || [];
      const merged = mergeAuditHistoryUnion(cached, records);
      setCachedAuditHistory(merged, slug);
      if (!snapshot.metadata?.fromCache && records.length > 0) {
        syncCollectionsWithBackendHub({ auditHistory: records }, slug).catch(() => {});
      }
      onData(merged);
    },
    (error) => {
      isQuotaOrNetworkError(error);
      if (onError) onError(error);
      fetchAuditHistoryOnce(false, slug).then(onData).catch(() => {});
    }
  );
}

export async function applyAuditChangesToFirestore(
  updatedInventory: Product[],
  historyRecord: AuditHistoryRecord,
  auditedCodes?: string[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const nowTs = Date.now();
  const auditId = getScopedDocId(nowTs.toString(), slug);

  const productsToUpdate = (
    auditedCodes && auditedCodes.length > 0
      ? updatedInventory.filter((p) => auditedCodes.includes(p.code))
      : updatedInventory
  ).map((p) => ({
    ...p,
    companyId: slug,
    stock: Math.max(0, Math.round(Number(p.stock) || 0)),
    updatedAt: nowTs,
  }));

  const createdAudit: AuditHistoryRecord = {
    id: auditId,
    companyId: slug,
    date: historyRecord.date,
    timestamp: Number(historyRecord.timestamp) || nowTs,
    match: Number(historyRecord.match) || 0,
    missing: Number(historyRecord.missing) || 0,
    extra: Number(historyRecord.extra) || 0,
    netImpact: Number(historyRecord.netImpact) || 0,
    totalItems: Number(historyRecord.totalItems) || 0,
    ...(historyRecord.scope ? { scope: historyRecord.scope } : {}),
  };

  // Immediately update local cache and broadcast to Backend Hub for instant PC <-> Mobile sync
  const cachedAudit = getCachedAuditHistory(slug) || [];
  setCachedAuditHistory(mergeAuditHistoryUnion(cachedAudit, [createdAudit]), slug);
  if (productsToUpdate.length > 0) {
    pushProductSaveToBackendHub(undefined, undefined, slug, productsToUpdate).catch(() => {});
  }
  syncCollectionsWithBackendHub({ auditHistory: [createdAudit] }, slug).catch(() => {});

  const batch = writeBatch(db);
  try {
    productsToUpdate.forEach((product) => {
      const docId = getScopedDocId(product.code, slug);
      const itemRef = doc(db, 'inventory', docId);
      batch.set(
        itemRef,
        {
          companyId: slug,
          code: product.code,
          stock: product.stock,
          updatedAt: nowTs,
        },
        { merge: true }
      );
    });

    const auditRef = doc(db, 'audit_history', auditId);
    const auditData: any = {
      companyId: slug,
      date: createdAudit.date,
      timestamp: createdAudit.timestamp,
      match: createdAudit.match,
      missing: createdAudit.missing,
      extra: createdAudit.extra,
      netImpact: createdAudit.netImpact,
      totalItems: createdAudit.totalItems,
    };
    if (createdAudit.scope) {
      auditData.scope = createdAudit.scope;
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
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      ok: false,
      latencyMs: 0,
      error: 'El dispositivo no tiene conexión a internet.',
    };
  }

  const start = Date.now();
  const testDocRef = doc(db, 'test', 'connection');
  const timeoutMs = 12000;

  const withTimeout = <T>(promise: Promise<T>): Promise<T> =>
    Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Tiempo de espera agotado al conectar con Firestore.')), timeoutMs)
      ),
    ]);

  try {
    // Overwrite without { merge: true } so only ['ping'] exists and matches firestore.rules strictly
    await withTimeout(setDoc(testDocRef, { ping: Date.now() }));
    await withTimeout(getDocFromServer(testDocRef));
    return { ok: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    // Fallback check: verify whether server read works even if write was rejected or throttled
    try {
      await withTimeout(getDocFromServer(testDocRef));
      return { ok: true, latencyMs: Date.now() - start };
    } catch (readErr: any) {
      const rawMsg = readErr?.message || err?.message || String(err);
      const friendlyMsg = rawMsg.includes('offline')
        ? 'Cliente sin conexión con el servidor de Firestore.'
        : rawMsg.includes('permission') || rawMsg.includes('PERMISSION_DENIED')
        ? 'Permisos insuficientes en las reglas de Firestore (/test/connection).'
        : rawMsg;
      return { ok: false, latencyMs: Date.now() - start, error: friendlyMsg };
    }
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
  enableRestaurantModule: true,
  enableCreditContract: true,
  enableDigitalSignature: true,
  enableWarrantyModule: true,
  enableCreditCalculator: false,
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
  const defaultCreditContract =
    comp?.enableCreditContract !== undefined
      ? Boolean(comp.enableCreditContract)
      : isGyGAlias(slug);
  const defaultDigitalSignature =
    comp?.enableDigitalSignature !== undefined
      ? Boolean(comp.enableDigitalSignature)
      : defaultCreditContract;
  const defaultWarrantyModule =
    comp?.enableWarrantyModule !== undefined
      ? Boolean(comp.enableWarrantyModule)
      : isGyGAlias(slug);
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
    allowedModules: resolveCompanyAllowedModules(comp?.allowedModules, {
      enableOnlineSales: comp?.enableOnlineSales,
      enableRestaurantModule: comp?.enableRestaurantModule,
    }),
    enableDeliveryDvolada: Boolean(comp?.enableDeliveryDvolada === true),
    enableRestaurantModule:
      comp?.enableRestaurantModule !== undefined ? Boolean(comp.enableRestaurantModule) : true,
    enableCreditContract: defaultCreditContract,
    enableDigitalSignature: defaultDigitalSignature,
    enableWarrantyModule: defaultWarrantyModule,
    enableCreditCalculator: Boolean(comp?.enableCreditCalculator === true),
    maxProducts: Math.max(0, Number(comp?.maxProducts) || 0),
    maxUsers: Math.max(0, Number(comp?.maxUsers) || 0),
  };
}

function sanitizeStoreLocationsList(raw: any): StoreBranchLocation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any, idx: number): StoreBranchLocation | null => {
      if (!item || typeof item !== 'object') return null;
      const name = String(item.name || '').trim();
      const address = String(item.address || '').trim();
      const googleMapsUrl = String(item.googleMapsUrl || '').trim();
      if (!name && !address && !googleMapsUrl) return null;
      const branch: StoreBranchLocation = {
        id: String(item.id || `branch_${idx + 1}`),
        name: name || `Sucursal #${idx + 1}`,
        address,
        city: item.city ? String(item.city).trim() : '',
        phone: item.phone ? String(item.phone).trim() : '',
        schedule: item.schedule ? String(item.schedule).trim() : '',
        googleMapsUrl,
        isMain: Boolean(item.isMain),
      };
      if (typeof item.latitude === 'number' && !isNaN(item.latitude)) {
        branch.latitude = item.latitude;
      }
      if (typeof item.longitude === 'number' && !isNaN(item.longitude)) {
        branch.longitude = item.longitude;
      }
      return branch;
    })
    .filter((b): b is StoreBranchLocation => b !== null);
}

function sanitizeStoreBankAccountsList(raw: any): StoreBankAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item: any, idx: number): StoreBankAccount | null => {
      if (!item || typeof item !== 'object') return null;
      const bankName = String(item.bankName || '').trim();
      const accountNumber = String(item.accountNumber || '').trim();
      const holderName = String(item.holderName || '').trim();
      if (!bankName && !accountNumber && !holderName) return null;
      return {
        id: String(item.id || `store_bank_${idx + 1}`),
        bankId: item.bankId ? String(item.bankId).trim() : '',
        bankName: bankName || 'Banco',
        accountNumber,
        accountType: item.accountType ? String(item.accountType).trim() : 'Ahorro',
        currency: item.currency ? String(item.currency).trim() : 'HNL',
        holderName,
        holderIdOrRtn: item.holderIdOrRtn ? String(item.holderIdOrRtn).trim() : '',
        customLogoUrl: item.customLogoUrl ? String(item.customLogoUrl).trim() : '',
        isActive: item.isActive !== false,
      };
    })
    .filter((b): b is StoreBankAccount => b !== null);
}

function sanitizeInvoiceTemplate(raw: any): InvoiceTemplateConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;

  // Detect legacy empty-string initialization from older sanitizeInvoiceTemplate({})
  const isLegacyBlankInit =
    raw.salesDocumentTitle === '' &&
    raw.creditDocumentTitle === '' &&
    raw.purchaseDocumentTitle === '' &&
    raw.thermalDocumentTitle === '' &&
    raw.signatureLeftLabel === '' &&
    raw.signatureRightLabel === '' &&
    raw.warrantyTitle === '' &&
    raw.footerThankYouTitle === '';

  const cleanStr = (val: any, isDefaultedTitle = false): string | undefined => {
    if (typeof val !== 'string') return undefined;
    if (isLegacyBlankInit && isDefaultedTitle && val === '') return undefined;
    return val;
  };

  return {
    templateStyle:
      raw.templateStyle === 'modern' ||
      raw.templateStyle === 'minimal' ||
      raw.templateStyle === 'corporate' ||
      raw.templateStyle === 'classic'
        ? raw.templateStyle
        : 'classic',
    accentColor: typeof raw.accentColor === 'string' && raw.accentColor.trim() ? raw.accentColor.trim() : '#047857',
    salesDocumentTitle: cleanStr(raw.salesDocumentTitle, true),
    creditDocumentTitle: cleanStr(raw.creditDocumentTitle, true),
    purchaseDocumentTitle: cleanStr(raw.purchaseDocumentTitle, true),
    thermalDocumentTitle: cleanStr(raw.thermalDocumentTitle, true),
    headerCustomNote: cleanStr(raw.headerCustomNote, false),
    issuerLabel: cleanStr(raw.issuerLabel, false),
    defaultIssuerName: cleanStr(raw.defaultIssuerName, false),
    caiNumber: cleanStr(raw.caiNumber, false),
    caiRange: cleanStr(raw.caiRange, false),
    caiExpiryDate: cleanStr(raw.caiExpiryDate, false),
    showLogo: raw.showLogo !== false,
    showTagline: raw.showTagline !== false,
    showStoreRtn: raw.showStoreRtn !== false,
    showCustomerRtn: raw.showCustomerRtn !== false,
    showCustomerPhone: raw.showCustomerPhone !== false,
    showSellerName: raw.showSellerName !== false,
    showItemCode: raw.showItemCode !== false,
    showItemDiscount: raw.showItemDiscount !== false,
    showAmountInWords: raw.showAmountInWords !== false,
    showQrCode: raw.showQrCode !== false,
    showBankAccounts: Boolean(raw.showBankAccounts),
    showSignatureLines: raw.showSignatureLines !== false,
    signatureLeftLabel: cleanStr(raw.signatureLeftLabel, true),
    signatureRightLabel: cleanStr(raw.signatureRightLabel, true),
    warrantyTitle: cleanStr(raw.warrantyTitle, true),
    warrantyPolicyText: cleanStr(raw.warrantyPolicyText, false),
    footerThankYouTitle: cleanStr(raw.footerThankYouTitle, true),
  };
}

export async function fetchStoreSettingsOnce(companyId = getActiveCompanyId()): Promise<StoreSettings> {
  const slug = normalizeCompanySlug(companyId);
  const cached = getCachedStoreSettings(slug);
  const hubSync = await syncCollectionsWithBackendHub(cached ? { settings: cached } : {}, slug);
  const newestLocalOrHub: StoreSettings | null =
    hubSync?.settings && cached
      ? (Number(hubSync.settings.updatedAt) || 0) >= (Number(cached.updatedAt) || 0)
        ? hubSync.settings
        : cached
      : hubSync?.settings || cached || null;

  if (isFirestoreQuotaExhausted()) {
    if (newestLocalOrHub) {
      setCachedStoreSettings(newestLocalOrHub, slug);
      return newestLocalOrHub;
    }
    return getDefaultStoreSettingsForCompany(slug);
  }
  try {
    const docRef = doc(db, 'settings', getStoreProfileDocId(slug));
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      const snapTs = Number(data.updatedAt) || 0;
      const localTs = Number(newestLocalOrHub?.updatedAt) || 0;

      // If our local cache or backend hub has a strictly newer save than this snapshot, honor the newer save
      if (newestLocalOrHub && localTs > snapTs) {
        setCachedStoreSettings(newestLocalOrHub, slug);
        syncCollectionsWithBackendHub({ settings: newestLocalOrHub }, slug).catch(() => {});
        return newestLocalOrHub;
      }

      const rawLogo = data.logoUrl !== undefined ? data.logoUrl : slug === 'gosen' ? '/store-logo.jpg' : '';
      const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
      const isOnlineSalesEnabled =
        data.enableOnlineSales !== undefined
          ? Boolean(data.enableOnlineSales)
          : Array.isArray(data.allowedModules) && data.allowedModules.length > 0
          ? data.allowedModules.includes('online-sales')
          : true;
      const isRestaurantEnabled =
        data.enableRestaurantModule !== undefined
          ? Boolean(data.enableRestaurantModule)
          : true;
      const effectiveAllowedModules: ActiveTab[] = resolveCompanyAllowedModules(
        data.allowedModules,
        {
          enableOnlineSales: isOnlineSalesEnabled,
          enableRestaurantModule: isRestaurantEnabled,
        }
      );

      const parsedBanks =
        data.bankAccounts !== undefined
          ? sanitizeStoreBankAccountsList(data.bankAccounts)
          : sanitizeStoreBankAccountsList(newestLocalOrHub?.bankAccounts);

      const parsedLocations =
        data.storeLocations !== undefined
          ? sanitizeStoreLocationsList(data.storeLocations)
          : sanitizeStoreLocationsList(newestLocalOrHub?.storeLocations);

      const parsedInvoiceTemplate =
        data.invoiceTemplate !== undefined
          ? sanitizeInvoiceTemplate(data.invoiceTemplate)
          : sanitizeInvoiceTemplate(newestLocalOrHub?.invoiceTemplate);

      const settings: StoreSettings = {
        companyId: slug,
        storeName: data.storeName || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
        tagline: data.tagline !== undefined ? String(data.tagline) : 'Control de Inventario y Ventas',
        logoUrl: safeLogo,
        phone: data.phone || '',
        address: data.address || '',
        storeRtn: data.storeRtn || '',
        defaultPrinterFormat: data.defaultPrinterFormat || '80mm',
        receiptFooterText:
          data.receiptFooterText !== undefined
            ? String(data.receiptFooterText)
            : '¡Gracias por su compra! Vuelva pronto.',
        invoiceTemplate: parsedInvoiceTemplate,
        accessPassword: data.accessPassword || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
        whatsappOrderPhone: data.whatsappOrderPhone || '',
        catalogWelcomeMsg: data.catalogWelcomeMsg || '',
        showLocationsInCatalog: data.showLocationsInCatalog !== undefined ? Boolean(data.showLocationsInCatalog) : true,
        storeLocations: parsedLocations,
        bankAccounts: parsedBanks,
        catalogAccentColor: data.catalogAccentColor || newestLocalOrHub?.catalogAccentColor || '',
        catalogHeaderBg: data.catalogHeaderBg || newestLocalOrHub?.catalogHeaderBg || '',
        allowedModules: effectiveAllowedModules,
        enableDeliveryDvolada:
          data.enableDeliveryDvolada !== undefined
            ? Boolean(data.enableDeliveryDvolada)
            : slug === 'gosen',
        enableOnlineSales: isOnlineSalesEnabled,
        enableRestaurantModule: isRestaurantEnabled,
        enableCreditContract:
          data.enableCreditContract !== undefined
            ? Boolean(data.enableCreditContract)
            : slug === 'gosen' || isGyGAlias(slug),
        enableDigitalSignature:
          data.enableDigitalSignature !== undefined
            ? Boolean(data.enableDigitalSignature)
            : data.enableCreditContract !== undefined
            ? Boolean(data.enableCreditContract)
            : slug === 'gosen' || isGyGAlias(slug),
        enableWarrantyModule:
          data.enableWarrantyModule !== undefined
            ? Boolean(data.enableWarrantyModule)
            : slug === 'gosen' || isGyGAlias(slug),
        enableCreditCalculator:
          data.enableCreditCalculator !== undefined
            ? Boolean(data.enableCreditCalculator)
            : false,
        maxProducts: Math.max(0, Number(data.maxProducts) || 0),
        maxUsers: Math.max(0, Number(data.maxUsers) || 0),
        updatedAt: snapTs || Date.now(),
      };
      setCachedStoreSettings(settings, slug);
      syncCollectionsWithBackendHub({ settings }, slug).catch(() => {});
      return settings;
    }

    if (newestLocalOrHub) {
      setCachedStoreSettings(newestLocalOrHub, slug);
      return newestLocalOrHub;
    }

    if (slug !== 'gosen') {
      const compSnap = await getDoc(doc(db, 'companies', slug));
      if (compSnap.exists()) {
        const cData = compSnap.data();
        const rawLogo = cData.logoUrl || '';
        const safeLogo = rawLogo === '/store-logo.jpg' ? '' : rawLogo;
        const isOnlineSalesEnabled =
          cData.enableOnlineSales !== undefined
            ? Boolean(cData.enableOnlineSales)
            : Array.isArray(cData.allowedModules) && cData.allowedModules.length > 0
            ? cData.allowedModules.includes('online-sales')
            : true;
        const isRestaurantEnabled =
          cData.enableRestaurantModule !== undefined
            ? Boolean(cData.enableRestaurantModule)
            : true;
        const effectiveAllowedModules: ActiveTab[] = resolveCompanyAllowedModules(
          cData.allowedModules,
          {
            enableOnlineSales: isOnlineSalesEnabled,
            enableRestaurantModule: isRestaurantEnabled,
          }
        );

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
          showLocationsInCatalog: true,
          storeLocations: sanitizeStoreLocationsList(cData.storeLocations),
          bankAccounts: sanitizeStoreBankAccountsList(cData.bankAccounts),
          catalogAccentColor: cData.catalogAccentColor || '',
          catalogHeaderBg: cData.catalogHeaderBg || '',
          allowedModules: effectiveAllowedModules,
          enableDeliveryDvolada: Boolean(cData.enableDeliveryDvolada === true),
          enableOnlineSales: isOnlineSalesEnabled,
          enableRestaurantModule: isRestaurantEnabled,
          enableCreditContract:
            cData.enableCreditContract !== undefined
              ? Boolean(cData.enableCreditContract)
              : isGyGAlias(slug),
          enableDigitalSignature:
            cData.enableDigitalSignature !== undefined
              ? Boolean(cData.enableDigitalSignature)
              : cData.enableCreditContract !== undefined
              ? Boolean(cData.enableCreditContract)
              : isGyGAlias(slug),
          enableWarrantyModule:
            cData.enableWarrantyModule !== undefined
              ? Boolean(cData.enableWarrantyModule)
              : isGyGAlias(slug),
          enableCreditCalculator: Boolean(cData.enableCreditCalculator === true),
          maxProducts: Math.max(0, Number(cData.maxProducts) || 0),
          maxUsers: Math.max(0, Number(cData.maxUsers) || 0),
          updatedAt: Date.now(),
        };
        setCachedStoreSettings(fallbackSettings, slug);
        syncCollectionsWithBackendHub({ settings: fallbackSettings }, slug).catch(() => {});
        return fallbackSettings;
      }
    }

    return getDefaultStoreSettingsForCompany(slug);
  } catch (error) {
    isQuotaOrNetworkError(error);
    if (newestLocalOrHub) {
      setCachedStoreSettings(newestLocalOrHub, slug);
      return newestLocalOrHub;
    }
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
      const currentCached = getCachedStoreSettings(slug);
      if (snapshot.exists()) {
        const data = snapshot.data();
        const snapTs = Number(data.updatedAt) || 0;
        const cachedTs = Number(currentCached?.updatedAt) || 0;

        // Do not let an older cached Firestore snapshot overwrite a newer local/hub save
        if (currentCached && cachedTs > snapTs) {
          onData(currentCached);
          return;
        }

        const rawLogo = data.logoUrl !== undefined ? data.logoUrl : slug === 'gosen' ? '/store-logo.jpg' : '';
        const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
        const isOnlineSalesEnabled =
          data.enableOnlineSales !== undefined
            ? Boolean(data.enableOnlineSales)
            : Array.isArray(data.allowedModules) && data.allowedModules.length > 0
            ? data.allowedModules.includes('online-sales')
            : true;
        const isRestaurantEnabled =
          data.enableRestaurantModule !== undefined
            ? Boolean(data.enableRestaurantModule)
            : true;
        const effectiveAllowedModules: ActiveTab[] = resolveCompanyAllowedModules(
          data.allowedModules,
          {
            enableOnlineSales: isOnlineSalesEnabled,
            enableRestaurantModule: isRestaurantEnabled,
          }
        );

        const parsedBanks =
          data.bankAccounts !== undefined
            ? sanitizeStoreBankAccountsList(data.bankAccounts)
            : sanitizeStoreBankAccountsList(currentCached?.bankAccounts);

        const parsedLocations =
          data.storeLocations !== undefined
            ? sanitizeStoreLocationsList(data.storeLocations)
            : sanitizeStoreLocationsList(currentCached?.storeLocations);

        const parsedInvoiceTemplate =
          data.invoiceTemplate !== undefined
            ? sanitizeInvoiceTemplate(data.invoiceTemplate)
            : sanitizeInvoiceTemplate(currentCached?.invoiceTemplate);

        const liveSettings: StoreSettings = {
          companyId: slug,
          storeName: data.storeName || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
          tagline: data.tagline !== undefined ? String(data.tagline) : 'Control de Inventario y Ventas',
          logoUrl: safeLogo,
          phone: data.phone || '',
          address: data.address || '',
          storeRtn: data.storeRtn || '',
          defaultPrinterFormat: data.defaultPrinterFormat || '80mm',
          receiptFooterText:
            data.receiptFooterText !== undefined
              ? String(data.receiptFooterText)
              : '¡Gracias por su compra! Vuelva pronto.',
          invoiceTemplate: parsedInvoiceTemplate,
          accessPassword: data.accessPassword || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
          whatsappOrderPhone: data.whatsappOrderPhone || '',
          catalogWelcomeMsg: data.catalogWelcomeMsg || '',
          showLocationsInCatalog: data.showLocationsInCatalog !== undefined ? Boolean(data.showLocationsInCatalog) : true,
          storeLocations: parsedLocations,
          bankAccounts: parsedBanks,
          catalogAccentColor: data.catalogAccentColor || currentCached?.catalogAccentColor || '',
          catalogHeaderBg: data.catalogHeaderBg || currentCached?.catalogHeaderBg || '',
          allowedModules: effectiveAllowedModules,
          enableDeliveryDvolada:
            data.enableDeliveryDvolada !== undefined
              ? Boolean(data.enableDeliveryDvolada)
              : slug === 'gosen',
          enableOnlineSales: isOnlineSalesEnabled,
          enableRestaurantModule: isRestaurantEnabled,
          enableCreditContract:
            data.enableCreditContract !== undefined
              ? Boolean(data.enableCreditContract)
              : slug === 'gosen' || isGyGAlias(slug),
          enableDigitalSignature:
            data.enableDigitalSignature !== undefined
              ? Boolean(data.enableDigitalSignature)
              : data.enableCreditContract !== undefined
              ? Boolean(data.enableCreditContract)
              : slug === 'gosen' || isGyGAlias(slug),
          enableWarrantyModule:
            data.enableWarrantyModule !== undefined
              ? Boolean(data.enableWarrantyModule)
              : slug === 'gosen' || isGyGAlias(slug),
          enableCreditCalculator:
            data.enableCreditCalculator !== undefined
              ? Boolean(data.enableCreditCalculator)
              : false,
          maxProducts: Math.max(0, Number(data.maxProducts) || 0),
          maxUsers: Math.max(0, Number(data.maxUsers) || 0),
          updatedAt: snapTs || Date.now(),
        };
        setCachedStoreSettings(liveSettings, slug);
        onData(liveSettings);
      } else {
        onData(currentCached || getDefaultStoreSettingsForCompany(slug));
      }
    },
    (error) => {
      if (onError) onError(error);
      const cached = getCachedStoreSettings(slug);
      onData(cached || getDefaultStoreSettingsForCompany(slug));
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
  const sanitizedLocations = sanitizeStoreLocationsList(settings.storeLocations);
  const sanitizedBankAccounts = sanitizeStoreBankAccountsList(settings.bankAccounts);
  const sanitizedTemplate = sanitizeInvoiceTemplate(settings.invoiceTemplate);
  const rawIncomingPass = (settings.accessPassword || '').trim();
  const isChangingPassword = Boolean(rawIncomingPass && !isMaskedOrHashedPassword(rawIncomingPass));
  const hashedPassForFirestore = isChangingPassword
    ? (await hashPasswordViaServer(rawIncomingPass)) || rawIncomingPass
    : undefined;

  const payload: any = {
    companyId: slug,
    storeName: settings.storeName.trim() || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
    tagline: settings.tagline !== undefined ? settings.tagline.trim() : '',
    logoUrl: safeLogo,
    phone: settings.phone?.trim() || '',
    address: settings.address?.trim() || '',
    storeRtn: settings.storeRtn?.trim() || '',
    defaultPrinterFormat: settings.defaultPrinterFormat || '80mm',
    receiptFooterText:
      settings.receiptFooterText !== undefined
        ? settings.receiptFooterText.trim()
        : '¡Gracias por su compra! Vuelva pronto.',
    invoiceTemplate: sanitizedTemplate || null,
    whatsappOrderPhone: settings.whatsappOrderPhone?.trim() || '',
    catalogWelcomeMsg: settings.catalogWelcomeMsg?.trim() || '',
    showLocationsInCatalog: settings.showLocationsInCatalog !== false,
    storeLocations: sanitizedLocations,
    bankAccounts: sanitizedBankAccounts,
    catalogAccentColor: settings.catalogAccentColor?.trim() || '',
    catalogHeaderBg: settings.catalogHeaderBg?.trim() || '',
    updatedAt: Date.now(),
  };

  if (hashedPassForFirestore) {
    payload.accessPassword = hashedPassForFirestore;
  }

  if (Array.isArray(settings.allowedModules) && settings.allowedModules.length > 0) {
    payload.allowedModules = settings.allowedModules;
  }
  if (settings.enableDeliveryDvolada !== undefined) {
    payload.enableDeliveryDvolada = Boolean(settings.enableDeliveryDvolada);
  }
  if (settings.enableOnlineSales !== undefined) {
    payload.enableOnlineSales = Boolean(settings.enableOnlineSales);
  }
  if (settings.enableRestaurantModule !== undefined) {
    payload.enableRestaurantModule = Boolean(settings.enableRestaurantModule);
  }
  if (settings.enableCreditContract !== undefined) {
    payload.enableCreditContract = Boolean(settings.enableCreditContract);
  }
  if (settings.enableDigitalSignature !== undefined) {
    payload.enableDigitalSignature = Boolean(settings.enableDigitalSignature);
  }
  if (settings.enableWarrantyModule !== undefined) {
    payload.enableWarrantyModule = Boolean(settings.enableWarrantyModule);
  }
  if (settings.enableCreditCalculator !== undefined) {
    payload.enableCreditCalculator = Boolean(settings.enableCreditCalculator);
  }
  if (settings.maxProducts !== undefined) {
    payload.maxProducts = Math.max(0, Number(settings.maxProducts) || 0);
  }
  if (settings.maxUsers !== undefined) {
    payload.maxUsers = Math.max(0, Number(settings.maxUsers) || 0);
  }

  const cacheSettings: StoreSettings = {
    ...settings,
    ...payload,
    accessPassword: isChangingPassword ? HASHED_PASSWORD_MASK : settings.accessPassword || HASHED_PASSWORD_MASK,
  };
  setCachedStoreSettings(cacheSettings, slug);
  syncCollectionsWithBackendHub(
    {
      settings: {
        ...settings,
        ...payload,
        accessPassword: isChangingPassword ? rawIncomingPass : HASHED_PASSWORD_MASK,
      },
    },
    slug
  ).catch(() => {});

  try {
    await setDoc(docRef, stripUndefinedDeep(payload), { merge: true });
    // Also keep the company tenant record in sync if it exists
    const compRef = doc(db, 'companies', slug);
    const compUpdate: Record<string, any> = {
      name: payload.storeName,
      slug,
      phone: payload.phone,
      logoUrl: payload.logoUrl,
      tagline: payload.tagline,
      address: payload.address,
    };
    if (hashedPassForFirestore) {
      compUpdate.adminPassword = hashedPassForFirestore;
    }
    await setDoc(compRef, compUpdate, { merge: true }).catch(() => {});
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Store settings saved in local cache; cloud sync deferred:', error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `settings/${getStoreProfileDocId(slug)}`);
  }
}

// ----------------- SALES & POS OPERATIONS -----------------

function parseSaleDocsFromSnapshot(snapshot: any, slug: string): SaleRecord[] {
  const records: SaleRecord[] = [];
  snapshot.forEach((docSnap: any) => {
    const data = docSnap.data();
    if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
    records.push({
      id: docSnap.id,
      companyId: data.companyId || slug,
      saleNumber: data.saleNumber || `VTA-${docSnap.id.slice(-6)}`,
      timestamp: Number(data.timestamp) || Date.now(),
      updatedAt: Number(data.updatedAt || data.timestamp || 0),
      date: data.date || '',
      items: Array.isArray(data.items)
        ? data.items.map((it: any) => {
            const rawCodes = Array.isArray(it.warrantyCodes)
              ? it.warrantyCodes.map((c: any) => String(c || '').trim()).filter(Boolean)
              : [];
            const singleCode = it.warrantyCode ? String(it.warrantyCode).trim() : rawCodes.join(', ');
            const hasExplicitNoWarranty =
              it.hasWarranty === false &&
              !singleCode &&
              rawCodes.length === 0 &&
              !it.warrantyDuration;
            const hasWarrantyFlag =
              !hasExplicitNoWarranty &&
              Boolean(it.hasWarranty || singleCode || rawCodes.length > 0 || it.warrantyDuration);
            return {
              productId: it.productId || '',
              code: it.code || '',
              name: it.name || '',
              category: it.category || '',
              size: it.size || '',
              originalPrice:
                it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
              cashPrice: it.cashPrice !== undefined ? Number(it.cashPrice) : undefined,
              creditPrice: it.creditPrice !== undefined ? Number(it.creditPrice) : undefined,
              unitDiscount: Math.max(0, Number(it.unitDiscount) || 0),
              price: Number(it.price) || 0,
              cost: Number(it.cost) || 0,
              quantity: Number(it.quantity) || 1,
              subtotal: Number(it.subtotal) || 0,
              ...(hasExplicitNoWarranty
                ? { hasWarranty: false }
                : hasWarrantyFlag
                ? { hasWarranty: true }
                : {}),
              ...(it.warrantyDisabled ? { warrantyDisabled: true } : {}),
              ...(it.warrantyDisabledAt
                ? { warrantyDisabledAt: Number(it.warrantyDisabledAt) }
                : {}),
              ...(it.warrantyDisabledBy
                ? { warrantyDisabledBy: String(it.warrantyDisabledBy).trim() }
                : {}),
              ...(it.warrantyDisabledReason
                ? { warrantyDisabledReason: String(it.warrantyDisabledReason).trim() }
                : {}),
              ...(singleCode ? { warrantyCode: singleCode } : {}),
              ...(rawCodes.length > 0 ? { warrantyCodes: rawCodes } : {}),
              ...(it.warrantyDuration ? { warrantyDuration: String(it.warrantyDuration).trim() } : {}),
              ...(it.warrantyNotes ? { warrantyNotes: String(it.warrantyNotes).trim() } : {}),
            };
          })
        : [],
      totalItems: Number(data.totalItems) || 0,
      subtotal: Number(data.subtotal) || 0,
      discount: Number(data.discount) || 0,
      tax: Number(data.tax) || 0,
      total: Number(data.total) || 0,
      cashPriceTotal: data.cashPriceTotal !== undefined ? Number(data.cashPriceTotal) : undefined,
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
          ? (Number(data.balanceDue ?? (Number(data.total) - Number(data.amountPaid))) || 0) <=
            0.01
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
            ...(cp.isHistoricalPreApp ? { isHistoricalPreApp: true } : {}),
          }))
        : [],
      creditContract:
        data.creditContract && typeof data.creditContract === 'object'
          ? data.creditContract
          : undefined,
      ...(data.isHistoricalPreApp ? { isHistoricalPreApp: true } : {}),
      ...(data.skipInventoryDeduction ? { skipInventoryDeduction: true } : {}),
      ...(data.isCreditPricingPending ? { isCreditPricingPending: true } : {}),
      warrantyInfo:
        data.warrantyInfo && typeof data.warrantyInfo === 'object'
          ? {
              enabled: Boolean(data.warrantyInfo.enabled),
              durationLabel: String(data.warrantyInfo.durationLabel || '30 Días'),
              coverageTerms: String(data.warrantyInfo.coverageTerms || ''),
              serialOrModelNotes: data.warrantyInfo.serialOrModelNotes
                ? String(data.warrantyInfo.serialOrModelNotes)
                : undefined,
            }
          : undefined,
      customerName: data.customerName || 'Consumidor Final',
      customerPhone: data.customerPhone || '',
      customerRtn: data.customerRtn || '',
      customerAddress: data.customerAddress || '',
      notes: data.notes || '',
      status: data.status === 'cancelled' ? 'cancelled' : 'completed',
      warehouseId: data.warehouseId ? String(data.warehouseId) : undefined,
      warehouseName: data.warehouseName ? String(data.warehouseName) : undefined,
      onlineOrder:
        data.onlineOrder && typeof data.onlineOrder === 'object'
          ? {
              isOnlineSale: Boolean(data.onlineOrder.isOnlineSale),
              channel: data.onlineOrder.channel || 'tiktok_live',
              liveSessionName: data.onlineOrder.liveSessionName || '',
              socialHandle: data.onlineOrder.socialHandle || '',
              recipientName: data.onlineOrder.recipientName || data.customerName || 'Cliente Online',
              recipientPhone: data.onlineOrder.recipientPhone || data.customerPhone || '',
              departmentCity: data.onlineOrder.departmentCity || '',
              shippingAddress: data.onlineOrder.shippingAddress || '',
              carrierName: data.onlineOrder.carrierName || '',
              trackingNumber: data.onlineOrder.trackingNumber || '',
              shippingChargedToCustomer: Number(data.onlineOrder.shippingChargedToCustomer) || 0,
              shippingGuideCost: Number(data.onlineOrder.shippingGuideCost) || 0,
              packagingCost: Number(data.onlineOrder.packagingCost) || 0,
              shippingStatus: data.onlineOrder.shippingStatus || 'pending_pack',
              codAmountToCollect:
                data.onlineOrder.codAmountToCollect !== undefined
                  ? Number(data.onlineOrder.codAmountToCollect)
                  : undefined,
              dispatchedAt: data.onlineOrder.dispatchedAt || undefined,
              deliveredAt: data.onlineOrder.deliveredAt || undefined,
            }
          : undefined,
      cashier: data.cashier || 'Administrador',
      cashierRole:
        data.cashierRole === 'admin' || data.cashierRole === 'collaborator'
          ? data.cashierRole
          : undefined,
      cashierUserId: data.cashierUserId ? String(data.cashierUserId).trim() : undefined,
      cashierUsername: data.cashierUsername
        ? String(data.cashierUsername).trim().toLowerCase().replace(/^@+/, '')
        : undefined,
      lastEditedBy: data.lastEditedBy ? String(data.lastEditedBy) : undefined,
      lastEditedAt: data.lastEditedAt ? String(data.lastEditedAt) : undefined,
      loyaltyCustomerId: data.loyaltyCustomerId ? String(data.loyaltyCustomerId) : undefined,
      loyaltyPointsEarned:
        data.loyaltyPointsEarned !== undefined ? Number(data.loyaltyPointsEarned) : undefined,
      loyaltyPointsRedeemed:
        data.loyaltyPointsRedeemed !== undefined ? Number(data.loyaltyPointsRedeemed) : undefined,
      loyaltyDiscountAmount:
        data.loyaltyDiscountAmount !== undefined ? Number(data.loyaltyDiscountAmount) : undefined,
      loyaltyPointsBalanceAfter:
        data.loyaltyPointsBalanceAfter !== undefined
          ? Number(data.loyaltyPointsBalanceAfter)
          : undefined,
    });
  });
  records.sort((a, b) => b.timestamp - a.timestamp);
  return records;
}

const recoveredSalesInFlight = new Set<string>();
const recoveredPurchasesInFlight = new Set<string>();

function mergeSaleRecordsWithCache(
  serverRecords: SaleRecord[],
  cachedRecords: SaleRecord[] | null | undefined,
  slug: string
): { merged: SaleRecord[]; missingOnServer: SaleRecord[] } {
  const deletedIds = getLocallyDeletedSaleIds(slug);
  const byId = new Map<string, SaleRecord>();
  const serverIds = new Set<string>();

  for (const srv of serverRecords) {
    if (!srv || !srv.id || deletedIds.has(srv.id)) continue;
    if (!belongsToCompany(srv.companyId, slug, srv.id)) continue;
    serverIds.add(srv.id);
    byId.set(srv.id, srv);
  }

  const missingOnServer: SaleRecord[] = [];
  if (Array.isArray(cachedRecords)) {
    for (const loc of cachedRecords) {
      if (!loc || !loc.id || deletedIds.has(loc.id)) continue;
      if (!belongsToCompany(loc.companyId, slug, loc.id)) continue;
      const srv = byId.get(loc.id);
      if (!srv) {
        byId.set(loc.id, loc);
        missingOnServer.push(loc);
      } else {
        // Preserve signed creditContract, warrantyInfo, and item-level warranty codes if present in local cache
        // Respect explicit warranty deletion (hasWarranty: false) or disabled state (warrantyInfo.enabled === false)
        const mergedContract = srv.creditContract || loc.creditContract;
        const mergedWarranty = srv.warrantyInfo !== undefined ? srv.warrantyInfo : loc.warrantyInfo;
        const mergedItems = Array.isArray(srv.items)
          ? srv.items.map((srvItem, idx) => {
              const locItem =
                loc.items?.[idx] &&
                (loc.items[idx].code === srvItem.code || loc.items[idx].productId === srvItem.productId)
                  ? loc.items[idx]
                  : loc.items?.find(
                      (li) => li.code === srvItem.code && li.name === srvItem.name
                    );
              if (!locItem) return srvItem;
              const srvExplicitRemoved =
                srvItem.hasWarranty === false || srv.warrantyInfo?.enabled === false;
              if (srvExplicitRemoved) {
                return {
                  ...locItem,
                  ...srvItem,
                  hasWarranty: srvItem.hasWarranty,
                  warrantyCode: srvItem.warrantyCode,
                  warrantyCodes: srvItem.warrantyCodes,
                  warrantyDuration: srvItem.warrantyDuration,
                  warrantyNotes: srvItem.warrantyNotes,
                  warrantyDisabled: srvItem.warrantyDisabled,
                  warrantyDisabledAt: srvItem.warrantyDisabledAt,
                  warrantyDisabledBy: srvItem.warrantyDisabledBy,
                  warrantyDisabledReason: srvItem.warrantyDisabledReason,
                };
              }
              return {
                ...locItem,
                ...srvItem,
                hasWarranty: srvItem.hasWarranty ?? locItem.hasWarranty,
                warrantyCode: srvItem.warrantyCode || locItem.warrantyCode,
                warrantyCodes:
                  srvItem.warrantyCodes && srvItem.warrantyCodes.length > 0
                    ? srvItem.warrantyCodes
                    : locItem.warrantyCodes,
                warrantyDuration: srvItem.warrantyDuration || locItem.warrantyDuration,
                warrantyNotes: srvItem.warrantyNotes || locItem.warrantyNotes,
                warrantyDisabled: srvItem.warrantyDisabled ?? locItem.warrantyDisabled,
                warrantyDisabledAt: srvItem.warrantyDisabledAt ?? locItem.warrantyDisabledAt,
                warrantyDisabledBy: srvItem.warrantyDisabledBy ?? locItem.warrantyDisabledBy,
                warrantyDisabledReason:
                  srvItem.warrantyDisabledReason ?? locItem.warrantyDisabledReason,
              };
            })
          : loc.items || [];
        const srvUpd = Number(srv.updatedAt || 0);
        const locUpd = Number(loc.updatedAt || 0);
        const srvPaymentsLen = srv.creditPayments?.length || 0;
        const locPaymentsLen = loc.creditPayments?.length || 0;
        const locStrictlyNewer = locUpd > srvUpd;
        const useLocPayments =
          locStrictlyNewer || (locUpd === srvUpd && locPaymentsLen > srvPaymentsLen);

        // Union unique creditPayments when timestamps tie so abonos from two devices never disappear
        let finalPayments = useLocPayments ? loc.creditPayments : srv.creditPayments;
        if (locUpd === srvUpd && srvPaymentsLen > 0 && locPaymentsLen > 0 && srvPaymentsLen !== locPaymentsLen) {
          const payMap = new Map<string, CreditPaymentAbone>();
          for (const p of [...(srv.creditPayments || []), ...(loc.creditPayments || [])]) {
            if (p && p.id) payMap.set(p.id, p);
          }
          finalPayments = Array.from(payMap.values()).sort(
            (a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0)
          );
        }

        const primary = locStrictlyNewer ? loc : srv;
        const secondary = locStrictlyNewer ? srv : loc;

        byId.set(loc.id, {
          ...secondary,
          ...primary,
          items: locStrictlyNewer ? loc.items || mergedItems : mergedItems,
          creditContract: mergedContract,
          warrantyInfo: mergedWarranty,
          updatedAt: Math.max(srvUpd, locUpd, Number(srv.timestamp || loc.timestamp || 0)),
          ...(useLocPayments
            ? {
                creditPayments: finalPayments,
                amountPaid: loc.amountPaid,
                balanceDue: loc.balanceDue,
                creditStatus: loc.creditStatus,
              }
            : {
                creditPayments: finalPayments,
              }),
        });
      }
    }
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return { merged, missingOnServer };
}

async function recoverUnsyncedSalesToFirestore(missingSales: SaleRecord[], slug: string): Promise<void> {
  if (!missingSales.length || isFirestoreQuotaExhausted()) return;
  for (const sale of missingSales) {
    if (!sale?.id || recoveredSalesInFlight.has(sale.id)) continue;
    recoveredSalesInFlight.add(sale.id);
    try {
      const { id, ...rest } = sale;
      const saleRef = doc(db, 'sales', id);
      await setDoc(
        saleRef,
        stripUndefinedDeep({
          ...rest,
          companyId: sale.companyId || slug,
          saleNumber: String(sale.saleNumber || `VTA-${id.slice(-6)}`).slice(0, 50),
          timestamp: Number(sale.timestamp) || Date.now(),
          date: String(sale.date || new Date().toLocaleString()).slice(0, 100),
          items: Array.isArray(sale.items) ? sale.items : [],
          total: Number(sale.total) || 0,
          status: sale.status === 'cancelled' ? 'cancelled' : 'completed',
        }),
        { merge: true }
      );
    } catch (err) {
      recoveredSalesInFlight.delete(sale.id);
      if (isQuotaOrNetworkError(err)) break;
    }
  }
}

function mergePurchaseRecordsWithCache(
  serverRecords: PurchaseInvoice[],
  cachedRecords: PurchaseInvoice[] | null | undefined,
  slug: string
): { merged: PurchaseInvoice[]; missingOnServer: PurchaseInvoice[] } {
  const byId = new Map<string, PurchaseInvoice>();
  for (const srv of serverRecords) {
    if (!srv || !srv.id) continue;
    if (!belongsToCompany(srv.companyId, slug, srv.id)) continue;
    byId.set(srv.id, srv);
  }

  const missingOnServer: PurchaseInvoice[] = [];
  if (Array.isArray(cachedRecords)) {
    for (const loc of cachedRecords) {
      if (!loc || !loc.id) continue;
      if (!belongsToCompany(loc.companyId, slug, loc.id)) continue;
      if (!byId.has(loc.id)) {
        byId.set(loc.id, loc);
        missingOnServer.push(loc);
      }
    }
  }

  const merged = Array.from(byId.values());
  merged.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return { merged, missingOnServer };
}

async function recoverUnsyncedPurchasesToFirestore(
  missingPurchases: PurchaseInvoice[],
  slug: string
): Promise<void> {
  if (!missingPurchases.length || isFirestoreQuotaExhausted()) return;
  for (const purchase of missingPurchases) {
    if (!purchase?.id || recoveredPurchasesInFlight.has(purchase.id)) continue;
    recoveredPurchasesInFlight.add(purchase.id);
    try {
      const { id, ...rest } = purchase;
      const purchaseRef = doc(db, 'purchases', id);
      await setDoc(
        purchaseRef,
        stripUndefinedDeep({
          ...rest,
          companyId: purchase.companyId || slug,
          invoiceNumber: String(purchase.invoiceNumber || `FAC-${id.slice(-6)}`).slice(0, 100),
          supplierId: String(purchase.supplierId || 'sup_default').slice(0, 128),
          supplierName: String(purchase.supplierName || 'Proveedor').slice(0, 200),
          date: String(purchase.date || new Date().toLocaleDateString()).slice(0, 100),
          timestamp: Number(purchase.timestamp) || Date.now(),
          items: Array.isArray(purchase.items) ? purchase.items : [],
          total: Number(purchase.total) || 0,
          status: purchase.status === 'cancelled' ? 'cancelled' : 'completed',
        }),
        { merge: true }
      );
    } catch (err) {
      recoveredPurchasesInFlight.delete(purchase.id);
      if (isQuotaOrNetworkError(err)) break;
    }
  }
}

export async function fetchSalesOnce(
  forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<SaleRecord[]> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const lsCached = getCachedSales(slug) || [];
  const idbCached = (await loadSalesFromIndexedDB(slug)) || [];
  const cached =
    idbCached.length > 0
      ? mergeSaleRecordsWithCache(lsCached, idbCached, slug).merged
      : lsCached;
  const hubSync = await syncCollectionsWithBackendHub({ sales: cached }, slug);
  const baseSales =
    hubSync?.sales && hubSync.sales.length > 0
      ? mergeSaleRecordsWithCache(hubSync.sales, cached, slug).merged
      : cached;

  if (isFirestoreQuotaExhausted()) {
    setCachedSales(baseSales, slug);
    return baseSales;
  }

  const scopedQuery = getScopedCollectionQuery('sales', slug);
  try {
    const snapshot = forceRefresh
      ? await getDocsFromServer(scopedQuery).catch(() => getDocs(scopedQuery))
      : await getDocs(scopedQuery);
    const records = parseSaleDocsFromSnapshot(snapshot, slug);
    const { merged: combinedWithLocal, missingOnServer } = mergeSaleRecordsWithCache(
      records,
      baseSales,
      slug
    );
    if (missingOnServer.length > 0) {
      recoverUnsyncedSalesToFirestore(missingOnServer, slug).catch(() => {});
    }
    const mergedHub = await syncCollectionsWithBackendHub({ sales: combinedWithLocal }, slug);
    const finalSales =
      mergedHub?.sales && mergedHub.sales.length > 0
        ? mergeSaleRecordsWithCache(combinedWithLocal, mergedHub.sales, slug).merged
        : combinedWithLocal;
    setCachedSales(finalSales, slug);
    return finalSales;
  } catch (error) {
    isQuotaOrNetworkError(error);
    if (baseSales.length > 0) {
      setCachedSales(baseSales, slug);
      return baseSales;
    }
    return [];
  }
}

export function subscribeToSales(
  onData: (sales: SaleRecord[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  if (isFirestoreQuotaExhausted()) {
    return () => {};
  }
  const scopedQuery = getScopedCollectionQuery('sales', slug);
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const serverRecords = parseSaleDocsFromSnapshot(snapshot, slug);
      const isFromServer = !snapshot.metadata?.fromCache;
      const cached = getCachedSales(slug) || [];
      const { merged, missingOnServer } = mergeSaleRecordsWithCache(serverRecords, cached, slug);
      setCachedSales(merged, slug);
      if (isFromServer && missingOnServer.length > 0) {
        recoverUnsyncedSalesToFirestore(missingOnServer, slug).catch(() => {});
      }
      if (isFromServer) {
        syncCollectionsWithBackendHub({ sales: serverRecords }, slug).catch(() => {});
      }
      onData(merged);
    },
    async (error) => {
      isQuotaOrNetworkError(error);
      if (onError) onError(error);
      const cached = getCachedSales(slug);
      if (cached) {
        onData(cached);
      }
    }
  );
}

export async function recordSaleInFirestore(
  saleData: Omit<SaleRecord, 'id'>,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<SaleRecord> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
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
    items: (saleData.items || []).map((it) => {
      const cleanCodes = Array.isArray(it.warrantyCodes)
        ? it.warrantyCodes.map((c) => String(c || '').trim()).filter(Boolean)
        : [];
      const singleCode = it.warrantyCode ? String(it.warrantyCode).trim() : cleanCodes.join(', ');
      const hasExplicitNoWarranty =
        it.hasWarranty === false && !singleCode && cleanCodes.length === 0 && !it.warrantyDuration;
      const hasWarrantyFlag =
        !hasExplicitNoWarranty &&
        Boolean(it.hasWarranty || singleCode || cleanCodes.length > 0 || it.warrantyDuration);
      return {
        productId: String(it.productId || ''),
        code: String(it.code || '').trim(),
        name: String(it.name || '').trim(),
        category: String(it.category || 'General').trim(),
        size: String(it.size || '').trim(),
        originalPrice: it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
        cashPrice: it.cashPrice !== undefined ? Number(it.cashPrice) : undefined,
        creditPrice: it.creditPrice !== undefined ? Number(it.creditPrice) : undefined,
        unitDiscount: Math.max(0, Number(it.unitDiscount) || 0),
        price: Number(it.price) || 0,
        cost: Number(it.cost) || 0,
        quantity: Number(it.quantity) || 1,
        subtotal: Number(it.subtotal) || 0,
        ...(hasExplicitNoWarranty
          ? { hasWarranty: false }
          : hasWarrantyFlag
          ? { hasWarranty: true }
          : {}),
        ...(it.warrantyDisabled ? { warrantyDisabled: true } : {}),
        ...(it.warrantyDisabledAt ? { warrantyDisabledAt: Number(it.warrantyDisabledAt) } : {}),
        ...(it.warrantyDisabledBy
          ? { warrantyDisabledBy: String(it.warrantyDisabledBy).trim().slice(0, 150) }
          : {}),
        ...(it.warrantyDisabledReason
          ? { warrantyDisabledReason: String(it.warrantyDisabledReason).trim().slice(0, 300) }
          : {}),
        ...(singleCode ? { warrantyCode: singleCode.slice(0, 200) } : {}),
        ...(cleanCodes.length > 0 ? { warrantyCodes: cleanCodes } : {}),
        ...(it.warrantyDuration ? { warrantyDuration: String(it.warrantyDuration).trim().slice(0, 60) } : {}),
        ...(it.warrantyNotes ? { warrantyNotes: String(it.warrantyNotes).trim().slice(0, 300) } : {}),
        ...(it.warehouseId ? { warehouseId: String(it.warehouseId).trim().slice(0, 100) } : {}),
        ...(it.warehouseName ? { warehouseName: String(it.warehouseName).trim().slice(0, 150) } : {}),
      };
    }),
    totalItems: Math.round(Number(saleData.totalItems) || 0),
    subtotal: Number(saleData.subtotal) || 0,
    discount: Number(saleData.discount) || 0,
    tax: Number(saleData.tax) || 0,
    total: totalVal,
    cashPriceTotal: saleData.cashPriceTotal !== undefined ? Number(saleData.cashPriceTotal) : undefined,
    paymentMethod: String(saleData.paymentMethod || 'cash').slice(0, 50),
    amountPaid: paidVal,
    change: Number(saleData.change) || 0,
    balanceDue: computedBalanceDue,
    creditStatus: isCredit
      ? saleData.isCreditPricingPending || computedBalanceDue > 0.01
        ? 'pending'
        : 'paid'
      : 'paid',
    creditDueDate: String(saleData.creditDueDate || '').trim().slice(0, 50),
    creditPayments: Array.isArray(saleData.creditPayments) ? saleData.creditPayments : [],
    creditContract: saleData.creditContract ? saleData.creditContract : undefined,
    isHistoricalPreApp: saleData.isHistoricalPreApp ? true : undefined,
    skipInventoryDeduction:
      saleData.skipInventoryDeduction || saleData.isHistoricalPreApp ? true : undefined,
    isCreditPricingPending: saleData.isCreditPricingPending ? true : undefined,
    warrantyInfo: saleData.warrantyInfo ? saleData.warrantyInfo : undefined,
    customerName: String(saleData.customerName || 'Consumidor Final').trim().slice(0, 200),
    customerPhone: String(saleData.customerPhone || '').trim().slice(0, 50),
    customerRtn: String(saleData.customerRtn || '').trim().slice(0, 50),
    customerAddress: saleData.customerAddress
      ? String(saleData.customerAddress).trim().slice(0, 300)
      : undefined,
    notes: String(saleData.notes || '').trim().slice(0, 500),
    status: 'completed',
    warehouseId: saleData.warehouseId ? String(saleData.warehouseId).trim().slice(0, 100) : undefined,
    warehouseName: saleData.warehouseName ? String(saleData.warehouseName).trim().slice(0, 150) : undefined,
    onlineOrder: saleData.onlineOrder ? saleData.onlineOrder : undefined,
    cashier: String(saleData.cashier || 'Administrador').trim().slice(0, 100),
    cashierRole:
      saleData.cashierRole === 'admin' || saleData.cashierRole === 'collaborator'
        ? saleData.cashierRole
        : (saleData.cashier || '').toLowerCase().includes('admin')
        ? 'admin'
        : 'collaborator',
    cashierUserId: saleData.cashierUserId
      ? String(saleData.cashierUserId).trim().slice(0, 120)
      : undefined,
    cashierUsername: saleData.cashierUsername
      ? String(saleData.cashierUsername).trim().toLowerCase().replace(/^@+/, '').slice(0, 100)
      : undefined,
    loyaltyCustomerId: saleData.loyaltyCustomerId ? String(saleData.loyaltyCustomerId) : undefined,
    loyaltyPointsEarned:
      saleData.loyaltyPointsEarned !== undefined ? Number(saleData.loyaltyPointsEarned) : undefined,
    loyaltyPointsRedeemed:
      saleData.loyaltyPointsRedeemed !== undefined
        ? Number(saleData.loyaltyPointsRedeemed)
        : undefined,
    loyaltyDiscountAmount:
      saleData.loyaltyDiscountAmount !== undefined
        ? Number(saleData.loyaltyDiscountAmount)
        : undefined,
    loyaltyPointsBalanceAfter:
      saleData.loyaltyPointsBalanceAfter !== undefined
        ? Number(saleData.loyaltyPointsBalanceAfter)
        : undefined,
    updatedAt: Date.now(),
  };

  const createdRecord: SaleRecord = {
    id: saleId,
    ...payload,
  };
  trackRecentLocalSale(createdRecord, slug);
  const prevSales = getCachedSales(slug) || [];
  const nextSalesList = [createdRecord, ...prevSales.filter((s) => s.id !== saleId)];
  setCachedSales(nextSalesList, slug);
  saveSalesToIndexedDB(nextSalesList, slug).catch(() => {});

  // Prepare inventory stock deductions before awaiting network/Firestore so Hub & Firestore run in parallel
  const invBatch = writeBatch(db);
  const finalPayloadsByDocId = new Map<string, { ref: any; altRef?: any; payload: Record<string, any> }>();
  const hubUpdatedProducts: Product[] = [];

  if (!saleData.skipInventoryDeduction && !saleData.isHistoricalPreApp) {
    try {
      const storeWhData = getCachedStoreWarehouses(slug);
      const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
      const workingByCode = new Map<string, Product>();
      for (const p of currentInventory) {
        workingByCode.set(p.code.trim().toLowerCase(), p);
      }

      const qtyByCodeAndWh = new Map<
        string,
        { codeKey: string; warehouseId?: string; qty: number; item: SaleRecord['items'][number] }
      >();

      for (const item of saleData.items || []) {
        const codeKey = item.code.trim().toLowerCase();
        if (!codeKey) continue;
        const itemWhId = item.warehouseId || saleData.warehouseId;
        const groupKey = `${codeKey}__${itemWhId || '__default__'}`;
        const prev = qtyByCodeAndWh.get(groupKey);
        if (prev) {
          prev.qty += Number(item.quantity) || 1;
        } else {
          qtyByCodeAndWh.set(groupKey, {
            codeKey,
            warehouseId: itemWhId,
            qty: Number(item.quantity) || 1,
            item,
          });
        }
      }

      for (const { codeKey, warehouseId: itemWhId, qty, item } of qtyByCodeAndWh.values()) {
        const currentProd =
          workingByCode.get(codeKey) ||
          currentInventory.find((p) => item.productId && p.id === item.productId);
        if (!currentProd && item.code.trim().toUpperCase() === 'CREDITO') {
          continue;
        }
        const rawCode = currentProd?.code || item.code;
        const canonicalDocId = getScopedDocId(rawCode, slug);
        const productRef = doc(db, 'inventory', canonicalDocId);

        const { newStock, newWarehouseStocks } = applyWarehouseStockDelta(
          currentProd,
          -qty,
          itemWhId,
          activeWhList
        );
        const newColorStocks = applyColorStockDelta(currentProd, item.selectedColor, -qty);

        const updatedProd: Product | undefined = currentProd
          ? {
              ...currentProd,
              stock: newStock,
              ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
              ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
            }
          : undefined;
        if (updatedProd) {
          workingByCode.set(codeKey, updatedProd);
        }

        const productPayload: Record<string, any> = {
          companyId: slug,
          code: rawCode.trim().slice(0, 100),
          name: (currentProd?.name || item.name || 'Producto').trim().slice(0, 200),
          category: (currentProd?.category || item.category || 'General').trim().slice(0, 100),
          price: Number(currentProd?.price ?? item.originalPrice ?? item.price) || 0,
          cost: Number(currentProd?.cost ?? item.cost) || 0,
          stock: newStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
          ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
          updatedAt: Date.now(),
        };

        const altRef =
          currentProd?.id &&
          currentProd.id !== canonicalDocId &&
          !/^\d+$/.test(currentProd.id)
            ? doc(db, 'inventory', currentProd.id)
            : undefined;
        finalPayloadsByDocId.set(canonicalDocId, { ref: productRef, altRef, payload: productPayload });
      }

      for (const [docIdKey, entry] of finalPayloadsByDocId.entries()) {
        invBatch.set(entry.ref, entry.payload, { merge: true });
        if (entry.altRef) {
          invBatch.set(entry.altRef, entry.payload, { merge: true });
        }
        const ck = String(entry.payload.code || '').trim().toLowerCase();
        const fullProd = workingByCode.get(ck);
        hubUpdatedProducts.push(
          fullProd
            ? { ...fullProd, ...entry.payload, id: fullProd.id || docIdKey }
            : ({ id: docIdKey, ...entry.payload } as Product)
        );
      }
    } catch (invPrepError) {
      console.warn('Warning preparing inventory stock deduction after sale:', invPrepError);
    }
  }

  // Push to Backend Multi-Device Sync Hub immediately (fast local Express call, capped at 2s)
  const hubSalePromise = racePromiseWithTimeout(
    syncCollectionsWithBackendHub({ sales: [createdRecord] }, slug),
    2000,
    null
  );
  const hubInvPromise =
    hubUpdatedProducts.length > 0
      ? racePromiseWithTimeout(
          pushProductSaveToBackendHub(undefined, undefined, slug, hubUpdatedProducts),
          2000,
          undefined
        )
      : Promise.resolve();

  // Save sale document & inventory batch to Firestore in parallel, capped at 2.5s so a stalled
  // WebChannel/multi-tab lock NEVER freezes the POS checkout (Firestore IndexedDB keeps retrying in background)
  const firestoreSalePromise = (async () => {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await withFirestoreTimeout(setDoc(saleRef, stripUndefinedDeep(payload)), 2500);
    } catch (error) {
      if (isQuotaOrNetworkError(error)) {
        console.warn('Sale saved in local cache & hub; cloud sync continuing in background:', error);
      } else {
        handleFirestoreError(error, OperationType.WRITE, `sales/${saleId}`);
      }
    }
  })();

  const firestoreInvPromise = (async () => {
    if (finalPayloadsByDocId.size === 0 || isFirestoreQuotaExhausted()) return;
    try {
      await touchInventorySyncStamp(invBatch, slug);
      await withFirestoreTimeout(invBatch.commit(), 2500);
    } catch (invError) {
      console.warn('Warning updating inventory stock in Firestore after sale:', invError);
    }
  })();

  await Promise.all([hubSalePromise, hubInvPromise, firestoreSalePromise, firestoreInvPromise]);

  return createdRecord;
}

export async function recordCreditPaymentInFirestore(
  sale: SaleRecord,
  newAbone: CreditPaymentAbone,
  companyId = getActiveCompanyId()
): Promise<SaleRecord> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
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
    ...(newAbone.isHistoricalPreApp ? { isHistoricalPreApp: true } : {}),
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
        ...(cp.isHistoricalPreApp ? { isHistoricalPreApp: true } : {}),
      }))
    : [];
  const updatedPayments = [...existingPayments, cleanAbone];
  const newAmountPaid = Math.min(sale.total, (Number(sale.amountPaid) || 0) + Number(cleanAbone.amount));
  const newBalanceDue = Math.max(0, Number((sale.total - newAmountPaid).toFixed(2)));
  const newCreditStatus: 'pending' | 'paid' =
    sale.isCreditPricingPending || newBalanceDue > 0.01 ? 'pending' : 'paid';

  const nowTs = Date.now();
  const updatedSale: SaleRecord = {
    ...sale,
    companyId: sale.companyId || slug,
    amountPaid: newAmountPaid,
    balanceDue: newBalanceDue,
    creditStatus: newCreditStatus,
    creditPayments: updatedPayments,
    updatedAt: nowTs,
  };

  trackRecentLocalSale(updatedSale, slug);
  const prevSales = getCachedSales(slug) || [];
  const nextSalesList = prevSales.map((s) => (s.id === sale.id ? updatedSale : s));
  setCachedSales(nextSalesList, slug);
  saveSalesToIndexedDB(nextSalesList, slug).catch(() => {});

  const hubPromise = racePromiseWithTimeout(
    syncCollectionsWithBackendHub({ sales: [updatedSale] }, slug),
    2000,
    null
  );

  const fsPromise = (async () => {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await withFirestoreTimeout(
        setDoc(
          saleRef,
          stripUndefinedDeep({
            saleNumber: String(sale.saleNumber || 'VTA').slice(0, 50),
            timestamp: Number(sale.timestamp) || nowTs,
            date: String(sale.date || '').slice(0, 100),
            items: Array.isArray(sale.items) ? sale.items : [],
            total: Number(sale.total) || 0,
            status: sale.status === 'cancelled' ? 'cancelled' : 'completed',
            amountPaid: updatedSale.amountPaid,
            balanceDue: updatedSale.balanceDue,
            creditStatus: updatedSale.creditStatus,
            creditPayments: updatedSale.creditPayments,
            updatedAt: nowTs,
          }),
          { merge: true }
        ),
        2500
      );
    } catch (error) {
      if (isQuotaOrNetworkError(error)) {
        console.warn('Credit payment saved in local cache & hub; cloud sync deferred:', error);
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
      }
    }
  })();

  await Promise.all([hubPromise, fsPromise]);
  return updatedSale;
}

export async function updateSaleInFirestore(
  originalSale: SaleRecord,
  updatedSale: SaleRecord,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<SaleRecord> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const saleRef = doc(db, 'sales', originalSale.id);

  const isCredit = updatedSale.paymentMethod === 'credit';
  const totalVal = Number(updatedSale.total) || 0;
  const paidVal = Number(updatedSale.amountPaid) || 0;
  const computedBalanceDue = isCredit
    ? Math.max(0, updatedSale.balanceDue !== undefined ? Number(updatedSale.balanceDue) : totalVal - paidVal)
    : 0;

  const cleanItems = (updatedSale.items || []).map((it) => {
    const cleanCodes = Array.isArray(it.warrantyCodes)
      ? it.warrantyCodes.map((c) => String(c || '').trim()).filter(Boolean)
      : [];
    const singleCode = it.warrantyCode ? String(it.warrantyCode).trim() : cleanCodes.join(', ');
    const hasExplicitNoWarranty =
      it.hasWarranty === false && !singleCode && cleanCodes.length === 0 && !it.warrantyDuration;
    const hasWarrantyFlag =
      !hasExplicitNoWarranty &&
      Boolean(it.hasWarranty || singleCode || cleanCodes.length > 0 || it.warrantyDuration);
    return {
      productId: String(it.productId || ''),
      code: String(it.code || '').trim(),
      name: String(it.name || '').trim(),
      category: String(it.category || 'General').trim(),
      size: String(it.size || '').trim(),
      originalPrice: it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
      cashPrice: it.cashPrice !== undefined ? Number(it.cashPrice) : undefined,
      creditPrice: it.creditPrice !== undefined ? Number(it.creditPrice) : undefined,
      unitDiscount: Math.max(0, Number(it.unitDiscount) || 0),
      price: Number(it.price) || 0,
      cost: Number(it.cost) || 0,
      quantity: Math.max(1, Math.round(Number(it.quantity) || 1)),
      subtotal: Number(it.subtotal) || 0,
      ...(hasExplicitNoWarranty
        ? { hasWarranty: false }
        : hasWarrantyFlag
        ? { hasWarranty: true }
        : {}),
      ...(it.warrantyDisabled ? { warrantyDisabled: true } : {}),
      ...(it.warrantyDisabledAt ? { warrantyDisabledAt: Number(it.warrantyDisabledAt) } : {}),
      ...(it.warrantyDisabledBy
        ? { warrantyDisabledBy: String(it.warrantyDisabledBy).trim().slice(0, 150) }
        : {}),
      ...(it.warrantyDisabledReason
        ? { warrantyDisabledReason: String(it.warrantyDisabledReason).trim().slice(0, 300) }
        : {}),
      ...(singleCode ? { warrantyCode: singleCode.slice(0, 200) } : {}),
      ...(cleanCodes.length > 0 ? { warrantyCodes: cleanCodes } : {}),
      ...(it.warrantyDuration ? { warrantyDuration: String(it.warrantyDuration).trim().slice(0, 60) } : {}),
      ...(it.warrantyNotes ? { warrantyNotes: String(it.warrantyNotes).trim().slice(0, 300) } : {}),
      ...(it.warehouseId ? { warehouseId: String(it.warehouseId).trim().slice(0, 100) } : {}),
      ...(it.warehouseName ? { warehouseName: String(it.warehouseName).trim().slice(0, 150) } : {}),
    };
  });

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
    cashPriceTotal:
      updatedSale.cashPriceTotal !== undefined
        ? Number(updatedSale.cashPriceTotal)
        : originalSale.cashPriceTotal,
    paymentMethod: String(updatedSale.paymentMethod || 'cash').slice(0, 50),
    amountPaid: paidVal,
    change: Math.max(0, Number(updatedSale.change) || 0),
    balanceDue: computedBalanceDue,
    creditStatus: isCredit
      ? updatedSale.isCreditPricingPending || computedBalanceDue > 0.01
        ? 'pending'
        : 'paid'
      : 'paid',
    creditDueDate: String(updatedSale.creditDueDate || '').trim().slice(0, 50),
    creditPayments: Array.isArray(updatedSale.creditPayments) ? updatedSale.creditPayments : [],
    creditContract:
      updatedSale.creditContract !== undefined
        ? updatedSale.creditContract
        : originalSale.creditContract,
    isHistoricalPreApp:
      updatedSale.isHistoricalPreApp ?? originalSale.isHistoricalPreApp ? true : undefined,
    skipInventoryDeduction:
      updatedSale.skipInventoryDeduction ||
      originalSale.skipInventoryDeduction ||
      updatedSale.isHistoricalPreApp ||
      originalSale.isHistoricalPreApp
        ? true
        : undefined,
    isCreditPricingPending: updatedSale.isCreditPricingPending ? true : false,
    warrantyInfo:
      updatedSale.warrantyInfo !== undefined
        ? updatedSale.warrantyInfo
        : originalSale.warrantyInfo,
    customerName: String(updatedSale.customerName || 'Consumidor Final').trim().slice(0, 200),
    customerPhone: String(updatedSale.customerPhone || '').trim().slice(0, 50),
    customerRtn: String(updatedSale.customerRtn || '').trim().slice(0, 50),
    customerAddress:
      updatedSale.customerAddress !== undefined
        ? String(updatedSale.customerAddress).trim().slice(0, 300)
        : originalSale.customerAddress,
    notes: String(updatedSale.notes || '').trim().slice(0, 500),
    status: updatedSale.status === 'cancelled' ? 'cancelled' : 'completed',
    warehouseId: updatedSale.warehouseId || originalSale.warehouseId || undefined,
    warehouseName: updatedSale.warehouseName || originalSale.warehouseName || undefined,
    onlineOrder:
      updatedSale.onlineOrder !== undefined ? updatedSale.onlineOrder : originalSale.onlineOrder,
    cashier: String(updatedSale.cashier || originalSale.cashier || 'Administrador').trim().slice(0, 100),
    cashierRole: updatedSale.cashierRole || originalSale.cashierRole || 'admin',
    cashierUserId: updatedSale.cashierUserId || originalSale.cashierUserId || undefined,
    cashierUsername: updatedSale.cashierUsername || originalSale.cashierUsername || undefined,
    lastEditedBy: String(updatedSale.lastEditedBy || 'Administrador').slice(0, 150),
    lastEditedAt: String(updatedSale.lastEditedAt || new Date().toLocaleString()).slice(0, 100),
    updatedAt: Date.now(),
  };

  const finalEditedRecord: SaleRecord = {
    id: originalSale.id,
    ...payload,
  };
  trackRecentLocalSale(finalEditedRecord, slug);
  const prevSales = getCachedSales(slug) || [];
  const nextSalesList = prevSales.map((s) => (s.id === originalSale.id ? finalEditedRecord : s));
  setCachedSales(nextSalesList, slug);
  saveSalesToIndexedDB(nextSalesList, slug).catch(() => {});
  const hubEditPromise = racePromiseWithTimeout(
    syncCollectionsWithBackendHub({ sales: [finalEditedRecord] }, slug),
    2000,
    null
  );

  const fsEditPromise = (async () => {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await withFirestoreTimeout(setDoc(saleRef, stripUndefinedDeep(payload), { merge: true }), 2500);
    } catch (error) {
      if (isQuotaOrNetworkError(error)) {
        console.warn('Sale update saved in local cache & hub; cloud sync deferred:', error);
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `sales/${originalSale.id}`);
      }
    }
  })();

  await Promise.all([hubEditPromise, fsEditPromise]);

  // Compute stock difference per (code, warehouseId) between originalSale.items and cleanItems
  try {
    const storeWhData = getCachedStoreWarehouses(slug);
    const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
    const fallbackWhId = updatedSale.warehouseId || originalSale.warehouseId;

    const deltaMap = new Map<
      string,
      { codeKey: string; warehouseId?: string; selectedColor?: string; delta: number; item?: any }
    >();
    const addDelta = (codeKey: string, whId: string | undefined, qtyDelta: number, item?: any) => {
      const selCol = item?.selectedColor ? String(item.selectedColor).trim() : '';
      const mk = `${codeKey}__${whId || '__default__'}__${selCol.toLowerCase()}`;
      const existing = deltaMap.get(mk);
      if (existing) {
        existing.delta += qtyDelta;
        if (!existing.item && item) existing.item = item;
      } else {
        deltaMap.set(mk, { codeKey, warehouseId: whId, selectedColor: selCol || undefined, delta: qtyDelta, item });
      }
    };

    if (
      originalSale.status !== 'cancelled' &&
      !originalSale.skipInventoryDeduction &&
      !originalSale.isHistoricalPreApp
    ) {
      for (const it of originalSale.items || []) {
        const k = it.code.trim().toLowerCase();
        if (k) addDelta(k, it.warehouseId || originalSale.warehouseId, Number(it.quantity) || 0, it);
      }
    }

    if (
      payload.status !== 'cancelled' &&
      !updatedSale.skipInventoryDeduction &&
      !originalSale.skipInventoryDeduction &&
      !updatedSale.isHistoricalPreApp &&
      !originalSale.isHistoricalPreApp
    ) {
      for (const it of cleanItems) {
        const k = it.code.trim().toLowerCase();
        if (k) addDelta(k, it.warehouseId || fallbackWhId, -(Number(it.quantity) || 0), it);
      }
    }

    const workingByCode = new Map<string, Product>();
    for (const p of currentInventory) {
      workingByCode.set(p.code.trim().toLowerCase(), p);
    }

    const batch = writeBatch(db);
    const finalPayloadsByDocId = new Map<string, { ref: any; payload: Record<string, any> }>();

    for (const entry of deltaMap.values()) {
      if (entry.delta === 0) continue;
      const currentProd = workingByCode.get(entry.codeKey);
      const fallbackItem = entry.item;
      if (!currentProd && (fallbackItem?.code || '').trim().toUpperCase() === 'CREDITO') continue;

      const rawCode = currentProd?.code || fallbackItem?.code || entry.codeKey;
      const productDocId = getScopedDocId(rawCode, slug);
      const productRef = doc(db, 'inventory', productDocId);

      const { newStock: adjustedStock, newWarehouseStocks } = applyWarehouseStockDelta(
        currentProd,
        entry.delta,
        entry.warehouseId,
        activeWhList
      );
      const newColorStocks = applyColorStockDelta(
        currentProd,
        entry.selectedColor,
        entry.delta
      );

      if (currentProd) {
        workingByCode.set(entry.codeKey, {
          ...currentProd,
          stock: adjustedStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
          ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
        });
      }

      finalPayloadsByDocId.set(productDocId, {
        ref: productRef,
        payload: {
          companyId: slug,
          code: rawCode.trim().slice(0, 100),
          name: (currentProd?.name || fallbackItem?.name || 'Producto').trim().slice(0, 200),
          category: (currentProd?.category || fallbackItem?.category || 'General').trim().slice(0, 100),
          price: Number(currentProd?.price ?? fallbackItem?.price) || 0,
          cost: Number(currentProd?.cost ?? fallbackItem?.cost) || 0,
          stock: adjustedStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
          ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
          updatedAt: Date.now(),
        },
      });
    }

    const hubAdjustedProducts: Product[] = [];
    for (const [docIdKey, e] of finalPayloadsByDocId.entries()) {
      batch.set(e.ref, e.payload, { merge: true });
      const ck = String(e.payload.code || '').trim().toLowerCase();
      const fullProd = workingByCode.get(ck);
      hubAdjustedProducts.push(
        fullProd
          ? { ...fullProd, ...e.payload, id: fullProd.id || docIdKey }
          : ({ id: docIdKey, ...e.payload } as Product)
      );
    }

    if (hubAdjustedProducts.length > 0) {
      await racePromiseWithTimeout(
        pushProductSaveToBackendHub(undefined, undefined, slug, hubAdjustedProducts),
        2000,
        undefined
      );
    }

    if (finalPayloadsByDocId.size > 0 && !isFirestoreQuotaExhausted()) {
      await touchInventorySyncStamp(batch, slug);
      await withFirestoreTimeout(batch.commit(), 2500);
    }
  } catch (invErr) {
    console.warn('Warning adjusting inventory stock on sale edit:', invErr);
  }

  return finalEditedRecord;
}

export async function cancelSaleInFirestore(
  sale: SaleRecord,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const saleRef = doc(db, 'sales', sale.id);

  const nowTs = Date.now();
  const cancelledRecord: SaleRecord = { ...sale, status: 'cancelled', updatedAt: nowTs };
  trackRecentLocalSale(cancelledRecord, slug);
  const prevSales = getCachedSales(slug) || [];
  const nextSalesList = prevSales.map((s) => (s.id === sale.id ? cancelledRecord : s));
  setCachedSales(nextSalesList, slug);
  saveSalesToIndexedDB(nextSalesList, slug).catch(() => {});
  const hubCancelPromise = racePromiseWithTimeout(
    syncCollectionsWithBackendHub({ sales: [cancelledRecord] }, slug),
    2000,
    null
  );

  const fsCancelPromise = (async () => {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await withFirestoreTimeout(
        setDoc(
          saleRef,
          stripUndefinedDeep({
            saleNumber: String(sale.saleNumber || 'VTA').slice(0, 50),
            timestamp: Number(sale.timestamp) || nowTs,
            date: String(sale.date || '').slice(0, 100),
            items: Array.isArray(sale.items) ? sale.items : [],
            total: Number(sale.total) || 0,
            status: 'cancelled',
            updatedAt: nowTs,
          }),
          { merge: true }
        ),
        2500
      );
    } catch (error) {
      if (isQuotaOrNetworkError(error)) {
        console.warn('Sale cancellation saved in local cache & hub; cloud sync deferred:', error);
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
      }
    }
  })();

  await Promise.all([hubCancelPromise, fsCancelPromise]);

  if (!sale.skipInventoryDeduction && !sale.isHistoricalPreApp) {
    try {
      const storeWhData = getCachedStoreWarehouses(slug);
      const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
      const batch = writeBatch(db);
      const workingByCode = new Map<string, Product>();
      for (const p of currentInventory) {
        workingByCode.set(p.code.trim().toLowerCase(), p);
      }
      const finalPayloadsByDocId = new Map<string, { ref: any; payload: Record<string, any> }>();

      for (const item of sale.items || []) {
        const codeKey = item.code.trim().toLowerCase();
        const currentProd =
          workingByCode.get(codeKey) ||
          currentInventory.find((p) => p.id === item.productId);
        if (!currentProd && item.code.trim().toUpperCase() === 'CREDITO') {
          continue;
        }
        const rawCode = currentProd?.code || item.code;
        const productDocId = getScopedDocId(rawCode, slug);
        const productRef = doc(db, 'inventory', productDocId);

        const { newStock: restoredStock, newWarehouseStocks } = applyWarehouseStockDelta(
          currentProd,
          Number(item.quantity) || 1,
          item.warehouseId || sale.warehouseId,
          activeWhList
        );
        const newColorStocks = applyColorStockDelta(
          currentProd,
          item.selectedColor,
          Number(item.quantity) || 1
        );

        if (currentProd) {
          workingByCode.set(codeKey, {
            ...currentProd,
            stock: restoredStock,
            ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
            ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
          });
        }

        finalPayloadsByDocId.set(productDocId, {
          ref: productRef,
          payload: {
            companyId: slug,
            code: rawCode.trim().slice(0, 100),
            name: (currentProd?.name || item.name || 'Producto').trim().slice(0, 200),
            category: (currentProd?.category || item.category || 'General').trim().slice(0, 100),
            price: Number(currentProd?.price ?? item.price) || 0,
            cost: Number(currentProd?.cost ?? item.cost) || 0,
            stock: restoredStock,
            ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
            ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
            updatedAt: Date.now(),
          },
        });
      }

      const hubRestoredProducts: Product[] = [];
      for (const [docIdKey, e] of finalPayloadsByDocId.entries()) {
        batch.set(e.ref, e.payload, { merge: true });
        const ck = String(e.payload.code || '').trim().toLowerCase();
        const fullProd = workingByCode.get(ck);
        hubRestoredProducts.push(
          fullProd
            ? { ...fullProd, ...e.payload, id: fullProd.id || docIdKey }
            : ({ id: docIdKey, ...e.payload } as Product)
        );
      }

      if (hubRestoredProducts.length > 0) {
        await racePromiseWithTimeout(
          pushProductSaveToBackendHub(undefined, undefined, slug, hubRestoredProducts),
          2000,
          undefined
        );
      }

      if (finalPayloadsByDocId.size > 0 && !isFirestoreQuotaExhausted()) {
        await touchInventorySyncStamp(batch, slug);
        await withFirestoreTimeout(batch.commit(), 2500);
      }
    } catch (invError) {
      console.warn('Warning restoring stock on sale cancel:', invError);
    }
  }
}

export async function restoreCancelledSaleInFirestore(
  sale: SaleRecord,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<SaleRecord> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const saleRef = doc(db, 'sales', sale.id);

  const nowTs = Date.now();
  const restoredRecord: SaleRecord = { ...sale, status: 'completed', updatedAt: nowTs };
  trackRecentLocalSale(restoredRecord, slug);
  const prevSales = getCachedSales(slug) || [];
  const nextSalesList = prevSales.map((s) => (s.id === sale.id ? restoredRecord : s));
  setCachedSales(nextSalesList, slug);
  saveSalesToIndexedDB(nextSalesList, slug).catch(() => {});
  const hubRestorePromise = racePromiseWithTimeout(
    syncCollectionsWithBackendHub({ sales: [restoredRecord] }, slug),
    2000,
    null
  );

  const fsRestorePromise = (async () => {
    if (isFirestoreQuotaExhausted()) return;
    try {
      await withFirestoreTimeout(
        setDoc(
          saleRef,
          stripUndefinedDeep({
            saleNumber: String(sale.saleNumber || 'VTA').slice(0, 50),
            timestamp: Number(sale.timestamp) || nowTs,
            date: String(sale.date || '').slice(0, 100),
            items: Array.isArray(sale.items) ? sale.items : [],
            total: Number(sale.total) || 0,
            status: 'completed',
            updatedAt: nowTs,
          }),
          { merge: true }
        ),
        2500
      );
    } catch (error) {
      if (isQuotaOrNetworkError(error)) {
        console.warn('Sale restoration saved in local cache & hub; cloud sync deferred:', error);
      } else {
        handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
      }
    }
  })();

  await Promise.all([hubRestorePromise, fsRestorePromise]);

  if (!sale.skipInventoryDeduction && !sale.isHistoricalPreApp) {
    try {
      const storeWhData = getCachedStoreWarehouses(slug);
      const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
      const batch = writeBatch(db);
      const workingByCode = new Map<string, Product>();
      for (const p of currentInventory) {
        workingByCode.set(p.code.trim().toLowerCase(), p);
      }
      const finalPayloadsByDocId = new Map<string, { ref: any; payload: Record<string, any> }>();

      for (const item of sale.items || []) {
        const codeKey = item.code.trim().toLowerCase();
        const currentProd =
          workingByCode.get(codeKey) ||
          currentInventory.find((p) => p.id === item.productId);
        if (!currentProd && item.code.trim().toUpperCase() === 'CREDITO') {
          continue;
        }
        const rawCode = currentProd?.code || item.code;
        const productDocId = getScopedDocId(rawCode, slug);
        const productRef = doc(db, 'inventory', productDocId);

        const { newStock: deductedStock, newWarehouseStocks } = applyWarehouseStockDelta(
          currentProd,
          -(Number(item.quantity) || 1),
          item.warehouseId || sale.warehouseId,
          activeWhList
        );
        const newColorStocks = applyColorStockDelta(
          currentProd,
          item.selectedColor,
          -(Number(item.quantity) || 1)
        );

        if (currentProd) {
          workingByCode.set(codeKey, {
            ...currentProd,
            stock: deductedStock,
            ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
            ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
          });
        }

        finalPayloadsByDocId.set(productDocId, {
          ref: productRef,
          payload: {
            companyId: slug,
            code: rawCode.trim().slice(0, 100),
            name: (currentProd?.name || item.name || 'Producto').trim().slice(0, 200),
            category: (currentProd?.category || item.category || 'General').trim().slice(0, 100),
            price: Number(currentProd?.price ?? item.price) || 0,
            cost: Number(currentProd?.cost ?? item.cost) || 0,
            stock: deductedStock,
            ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
            ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
            updatedAt: Date.now(),
          },
        });
      }

      const hubDeductedProducts: Product[] = [];
      for (const [docIdKey, e] of finalPayloadsByDocId.entries()) {
        batch.set(e.ref, e.payload, { merge: true });
        const ck = String(e.payload.code || '').trim().toLowerCase();
        const fullProd = workingByCode.get(ck);
        hubDeductedProducts.push(
          fullProd
            ? { ...fullProd, ...e.payload, id: fullProd.id || docIdKey }
            : ({ id: docIdKey, ...e.payload } as Product)
        );
      }

      if (hubDeductedProducts.length > 0) {
        await racePromiseWithTimeout(
          pushProductSaveToBackendHub(undefined, undefined, slug, hubDeductedProducts),
          2000,
          undefined
        );
      }

      if (finalPayloadsByDocId.size > 0 && !isFirestoreQuotaExhausted()) {
        await touchInventorySyncStamp(batch, slug);
        await withFirestoreTimeout(batch.commit(), 2500);
      }
    } catch (invError) {
      console.warn('Warning deducting stock on sale restore:', invError);
    }
  }

  return restoredRecord;
}

export async function deleteSaleFromFirestore(
  saleId: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  clearRecentLocalSale(saleId, slug);
  markSaleDeletedLocally(saleId, slug);
  const prevSales = getCachedSales(slug) || [];
  const filteredSales = prevSales.filter((s) => s.id !== saleId);
  setCachedSales(filteredSales, slug);
  await saveSalesToIndexedDB(filteredSales, slug).catch(() => {});
  await racePromiseWithTimeout(
    syncCollectionsWithBackendHub({ deleteSaleId: saleId }, slug),
    2000,
    null
  );

  if (isFirestoreQuotaExhausted()) {
    return;
  }

  try {
    await withFirestoreTimeout(deleteDoc(doc(db, 'sales', saleId)), 2500);
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Sale deletion deferred due to quota/network:', error);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, `sales/${saleId}`);
  }
}

export async function deleteSaleAccountInFirestore(
  sale: SaleRecord,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  await deleteSaleFromFirestore(sale.id, slug);

  // Restore stock ONLY if active non-historical sale that deducted stock when created
  if (sale.status !== 'cancelled' && !sale.skipInventoryDeduction && !sale.isHistoricalPreApp) {
    try {
      const storeWhData = getCachedStoreWarehouses(slug);
      const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
      const batch = writeBatch(db);
      const workingByCode = new Map<string, Product>();
      for (const p of currentInventory) {
        workingByCode.set(p.code.trim().toLowerCase(), p);
      }
      const finalPayloadsByDocId = new Map<string, { ref: any; payload: Record<string, any> }>();

      for (const item of sale.items || []) {
        const codeKey = (item.code || '').trim().toLowerCase();
        if (!codeKey) continue;
        const currentProd =
          workingByCode.get(codeKey) ||
          currentInventory.find((p) => p.id === item.productId);
        if (!currentProd && (item.code || '').trim().toUpperCase() === 'CREDITO') {
          continue;
        }
        if (!currentProd) continue;

        const rawCode = currentProd.code;
        const productDocId = getScopedDocId(rawCode, slug);
        const productRef = doc(db, 'inventory', productDocId);

        const { newStock: restoredStock, newWarehouseStocks } = applyWarehouseStockDelta(
          currentProd,
          Number(item.quantity) || 1,
          item.warehouseId || sale.warehouseId,
          activeWhList
        );
        const newColorStocks = applyColorStockDelta(
          currentProd,
          item.selectedColor,
          Number(item.quantity) || 1
        );

        workingByCode.set(codeKey, {
          ...currentProd,
          stock: restoredStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
          ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
        });

        finalPayloadsByDocId.set(productDocId, {
          ref: productRef,
          payload: {
            companyId: slug,
            code: rawCode.trim().slice(0, 100),
            name: (currentProd.name || item.name || 'Producto').trim().slice(0, 200),
            category: (currentProd.category || item.category || 'General').trim().slice(0, 100),
            price: Number(currentProd.price ?? item.price) || 0,
            cost: Number(currentProd.cost ?? item.cost) || 0,
            stock: restoredStock,
            ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
            ...(newColorStocks ? { colorStocks: newColorStocks } : {}),
            updatedAt: Date.now(),
          },
        });
      }

      const hubDeletedSaleProducts: Product[] = [];
      for (const [docIdKey, e] of finalPayloadsByDocId.entries()) {
        batch.set(e.ref, e.payload, { merge: true });
        const ck = String(e.payload.code || '').trim().toLowerCase();
        const fullProd = workingByCode.get(ck);
        hubDeletedSaleProducts.push(
          fullProd
            ? { ...fullProd, ...e.payload, id: fullProd.id || docIdKey }
            : ({ id: docIdKey, ...e.payload } as Product)
        );
      }

      if (hubDeletedSaleProducts.length > 0) {
        await racePromiseWithTimeout(
          pushProductSaveToBackendHub(undefined, undefined, slug, hubDeletedSaleProducts),
          2000,
          undefined
        );
      }

      if (finalPayloadsByDocId.size > 0 && !isFirestoreQuotaExhausted()) {
        await touchInventorySyncStamp(batch, slug);
        await withFirestoreTimeout(batch.commit(), 2500);
      }
    } catch (invError) {
      console.warn('Warning restoring stock on sale delete:', invError);
    }
  }
}

// ----------------- PURCHASES / FACTURAS DE COMPRA -----------------

function parsePurchaseDocsFromSnapshot(snapshot: any, slug: string): PurchaseInvoice[] {
  const records: PurchaseInvoice[] = [];
  snapshot.forEach((docSnap: any) => {
    const data = docSnap.data();
    if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
    records.push({
      id: docSnap.id,
      companyId: data.companyId || slug,
      invoiceNumber: data.invoiceNumber || `FAC-${docSnap.id.slice(-6)}`,
      supplierId: data.supplierId || '',
      supplierName: data.supplierName || 'Proveedor',
      date: data.date || '',
      timestamp: Number(data.timestamp) || Date.now(),
      paymentCondition: data.paymentCondition === 'credit' ? 'credit' : 'cash',
      dueDate: data.dueDate || '',
      warehouseId: data.warehouseId ? String(data.warehouseId) : undefined,
      warehouseName: data.warehouseName ? String(data.warehouseName) : undefined,
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
  return records;
}

export async function fetchPurchasesOnce(
  forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<PurchaseInvoice[]> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedPurchases(slug) || [];
  const hubSync = await syncCollectionsWithBackendHub({ purchases: cached }, slug);
  const basePurchases =
    hubSync?.purchases && hubSync.purchases.length > 0
      ? mergePurchaseRecordsWithCache(hubSync.purchases, cached, slug).merged
      : cached;

  if (isFirestoreQuotaExhausted()) {
    setCachedPurchases(basePurchases, slug);
    return basePurchases;
  }

  const scopedQuery = getScopedCollectionQuery('purchases', slug);
  try {
    const snapshot = forceRefresh
      ? await getDocsFromServer(scopedQuery).catch(() => getDocs(scopedQuery))
      : await getDocs(scopedQuery);
    const records = parsePurchaseDocsFromSnapshot(snapshot, slug);
    const { merged: combinedWithLocal, missingOnServer } = mergePurchaseRecordsWithCache(
      records,
      basePurchases,
      slug
    );
    if (missingOnServer.length > 0) {
      recoverUnsyncedPurchasesToFirestore(missingOnServer, slug).catch(() => {});
    }
    const mergedHub = await syncCollectionsWithBackendHub({ purchases: combinedWithLocal }, slug);
    const finalPurchases =
      mergedHub?.purchases && mergedHub.purchases.length > 0
        ? mergePurchaseRecordsWithCache(combinedWithLocal, mergedHub.purchases, slug).merged
        : combinedWithLocal;
    setCachedPurchases(finalPurchases, slug);
    return finalPurchases;
  } catch (error) {
    isQuotaOrNetworkError(error);
    if (basePurchases.length > 0) {
      setCachedPurchases(basePurchases, slug);
      return basePurchases;
    }
    return [];
  }
}

export function subscribeToPurchases(
  onData: (purchases: PurchaseInvoice[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  if (isFirestoreQuotaExhausted()) {
    return () => {};
  }
  const scopedQuery = getScopedCollectionQuery('purchases', slug);
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const serverRecords = parsePurchaseDocsFromSnapshot(snapshot, slug);
      const cached = getCachedPurchases(slug) || [];
      const { merged, missingOnServer } = mergePurchaseRecordsWithCache(serverRecords, cached, slug);
      setCachedPurchases(merged, slug);
      if (missingOnServer.length > 0) {
        recoverUnsyncedPurchasesToFirestore(missingOnServer, slug).catch(() => {});
      }
      syncCollectionsWithBackendHub({ purchases: merged }, slug).catch(() => {});
      onData(merged);
    },
    async (error) => {
      isQuotaOrNetworkError(error);
      if (onError) onError(error);
      const cached = getCachedPurchases(slug);
      if (cached) {
        onData(cached);
      }
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
    warehouseId: purchaseData.warehouseId ? String(purchaseData.warehouseId).trim().slice(0, 100) : undefined,
    warehouseName: purchaseData.warehouseName ? String(purchaseData.warehouseName).trim().slice(0, 150) : undefined,
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

  const createdInvoice: PurchaseInvoice = {
    id: purchaseId,
    ...invoicePayload,
  };
  const prevPurchases = getCachedPurchases(slug) || [];
  setCachedPurchases([createdInvoice, ...prevPurchases.filter((p) => p.id !== purchaseId)], slug);
  syncCollectionsWithBackendHub({ purchases: [createdInvoice] }, slug).catch(() => {});

  try {
    await setDoc(purchaseRef, stripUndefinedDeep(invoicePayload));
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Purchase saved in local cache; cloud sync deferred:', error);
    } else {
      handleFirestoreError(error, OperationType.WRITE, `purchases/${purchaseId}`);
    }
  }

  try {
    const storeWhData = getCachedStoreWarehouses(slug);
    const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
    const targetWhId =
      purchaseData.warehouseId ||
      (activeWhList.find((w) => w.isMainSalesFloor) || activeWhList[0])?.id ||
      'principal';

    const batch = writeBatch(db);
    // Keep a working map by normalized code so multiple lines with the same SKU accumulate cleanly
    const workingByCode = new Map<string, Product>();
    for (const p of currentInventory) {
      workingByCode.set((p.code || '').trim().toLowerCase(), p);
    }

    for (const item of purchaseData.items || []) {
      const codeKey = (item.code || '').trim().toLowerCase();
      if (!codeKey) continue;
      const productDocId = getScopedDocId(item.code, slug);
      const productRef = doc(db, 'inventory', productDocId);

      const existing =
        workingByCode.get(codeKey) ||
        currentInventory.find((p) => p.id && item.productId && p.id === item.productId);

      const addedQty = Math.max(0, Math.round(Number(item.quantity) || 0));

      if (existing) {
        const { newStock, newWarehouseStocks } = applyWarehouseStockDelta(
          existing,
          addedQty,
          targetWhId,
          activeWhList
        );

        const nextCost = Number(item.cost) || existing.cost || 0;
        const nextPrice =
          item.salePrice && item.salePrice > 0
            ? Number(item.salePrice)
            : Number(existing.price) || 0;
        const nextSupplier =
          existing.supplier || (purchaseData.supplierName ? purchaseData.supplierName.trim().slice(0, 200) : '');

        const updatePayload: Record<string, any> = {
          companyId: slug,
          code: existing.code.trim().slice(0, 100),
          name: existing.name.trim().slice(0, 200),
          category: (existing.category || 'General').trim().slice(0, 100),
          stock: newStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
          cost: nextCost,
          price: nextPrice,
        };

        if (purchaseData.supplierName && !existing.supplier) {
          updatePayload.supplier = purchaseData.supplierName.trim().slice(0, 200);
        }

        batch.set(productRef, updatePayload, { merge: true });
        workingByCode.set(codeKey, {
          ...existing,
          stock: newStock,
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
          cost: nextCost,
          price: nextPrice,
          supplier: nextSupplier,
        });
      } else {
        const initialWhStocks: Record<string, number> = {};
        activeWhList.forEach((w) => {
          initialWhStocks[w.id] = w.id === targetWhId ? addedQty : 0;
        });

        const nextCost = Number(item.cost) || 0;
        const nextPrice =
          item.salePrice && item.salePrice > 0 ? Number(item.salePrice) : nextCost * 1.35;

        const newProductPayload: Record<string, any> = {
          companyId: slug,
          code: item.code.trim().slice(0, 100),
          name: item.name.trim().slice(0, 200),
          category: (item.category?.trim() || 'General').slice(0, 100),
          size: (item.size?.trim() || '').slice(0, 50),
          supplier: purchaseData.supplierName.trim().slice(0, 200),
          cost: nextCost,
          price: nextPrice,
          stock: addedQty,
          warehouseStocks: initialWhStocks,
          img: '',
        };

        batch.set(productRef, newProductPayload, { merge: true });
        workingByCode.set(codeKey, {
          id: productDocId,
          companyId: slug,
          code: item.code.trim(),
          name: item.name.trim(),
          category: item.category?.trim() || 'General',
          size: item.size?.trim() || '',
          supplier: purchaseData.supplierName.trim(),
          cost: nextCost,
          price: nextPrice,
          stock: addedQty,
          warehouseStocks: initialWhStocks,
          img: '',
        });
      }
    }

    const hubPurchasedProducts: Product[] = [];
    for (const item of purchaseData.items || []) {
      const ck = (item.code || '').trim().toLowerCase();
      const updatedP = workingByCode.get(ck);
      if (updatedP) {
        hubPurchasedProducts.push({ ...updatedP, updatedAt: Date.now() });
      }
    }
    if (hubPurchasedProducts.length > 0) {
      pushProductSaveToBackendHub(undefined, undefined, slug, hubPurchasedProducts).catch(() => {});
    }

    await touchInventorySyncStamp(batch, slug);
    await batch.commit();
    const purchasedCodes = (purchaseData.items || [])
      .map((it) => (it.code || '').trim())
      .filter(Boolean);
    if (purchasedCodes.length > 0) {
      markProductsSyncedToCloud(purchasedCodes, slug);
    }
  } catch (invError) {
    console.warn('Warning updating inventory stock after purchase:', invError);
  }

  return createdInvoice;
}

export async function cancelPurchaseInFirestore(
  purchase: PurchaseInvoice,
  currentInventory: Product[],
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = normalizeCompanySlug(companyId);
  const purchaseRef = doc(db, 'purchases', purchase.id);

  const nowCancelTs = Date.now();
  const cancelledPurchase: PurchaseInvoice = {
    ...purchase,
    status: 'cancelled',
    updatedAt: nowCancelTs,
  };
  const prevPurchases = getCachedPurchases(slug) || [];
  setCachedPurchases(
    prevPurchases.map((p) => (p.id === purchase.id ? cancelledPurchase : p)),
    slug
  );
  syncCollectionsWithBackendHub({ purchases: [cancelledPurchase] }, slug).catch(() => {});

  try {
    await setDoc(
      purchaseRef,
      stripUndefinedDeep({
        invoiceNumber: String(purchase.invoiceNumber || 'FAC').slice(0, 100),
        supplierId: String(purchase.supplierId || 'sup').slice(0, 128),
        supplierName: String(purchase.supplierName || 'Proveedor').slice(0, 200),
        date: String(purchase.date || '').slice(0, 100),
        timestamp: Number(purchase.timestamp) || nowCancelTs,
        warehouseId: purchase.warehouseId || undefined,
        warehouseName: purchase.warehouseName || undefined,
        items: Array.isArray(purchase.items) ? purchase.items : [],
        total: Number(purchase.total) || 0,
        status: 'cancelled',
        updatedAt: nowCancelTs,
      }),
      { merge: true }
    );
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Purchase cancellation saved in local cache; cloud sync deferred:', error);
    } else {
      handleFirestoreError(error, OperationType.UPDATE, `purchases/${purchase.id}`);
    }
  }

  try {
    const storeWhData = getCachedStoreWarehouses(slug);
    const activeWhList = storeWhData.warehouses || getDefaultWarehousesForStore();
    const targetWhId =
      purchase.warehouseId ||
      (activeWhList.find((w) => w.isMainSalesFloor) || activeWhList[0])?.id ||
      'principal';

    const batch = writeBatch(db);
    const hubRevertedProducts: Product[] = [];
    for (const item of purchase.items || []) {
      const productDocId = getScopedDocId(item.code, slug);
      const productRef = doc(db, 'inventory', productDocId);

      const existing = currentInventory.find(
        (p) => p.code.trim().toLowerCase() === item.code.trim().toLowerCase() || p.id === item.productId
      );

      const deductQty = Math.max(0, Math.round(Number(item.quantity) || 0));
      const { newStock, newWarehouseStocks } = applyWarehouseStockDelta(
        existing,
        -deductQty,
        targetWhId,
        activeWhList
      );

      const revertPayload = {
        companyId: slug,
        code: (existing?.code || item.code).trim().slice(0, 100),
        name: (existing?.name || item.name || 'Producto').trim().slice(0, 200),
        category: (existing?.category || item.category || 'General').trim().slice(0, 100),
        price: Number(existing?.price ?? item.salePrice ?? item.cost) || 0,
        cost: Number(existing?.cost ?? item.cost) || 0,
        stock: newStock,
        ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
        updatedAt: Date.now(),
      };
      batch.set(productRef, revertPayload, { merge: true });
      hubRevertedProducts.push(
        existing
          ? { ...existing, ...revertPayload, id: existing.id || productDocId }
          : ({ id: productDocId, ...revertPayload } as Product)
      );
    }

    if (hubRevertedProducts.length > 0) {
      pushProductSaveToBackendHub(undefined, undefined, slug, hubRevertedProducts).catch(() => {});
    }

    await touchInventorySyncStamp(batch, slug);
    await batch.commit();
  } catch (invError) {
    console.warn('Warning reverting inventory stock on purchase cancel:', invError);
  }
}

export async function deletePurchaseFromFirestore(
  purchaseId: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const prevPurchases = getCachedPurchases(slug) || [];
  setCachedPurchases(
    prevPurchases.filter((p) => p.id !== purchaseId),
    slug
  );
  syncCollectionsWithBackendHub({ deletePurchaseId: purchaseId }, slug).catch(() => {});
  try {
    await deleteDoc(doc(db, 'purchases', purchaseId));
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Purchase deletion deferred due to quota/network:', error);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, `purchases/${purchaseId}`);
  }
}

// ----------------- COLLABORATORS & USERS MANAGEMENT -----------------

function withFirestoreTimeout<T>(promise: Promise<T>, ms = 6500): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Firestore operation timed out (offline/unavailable)'));
    }, ms);
    promise.then(
      (val) => {
        clearTimeout(timer);
        resolve(val);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function sanitizeUserAccountDoc(raw: any, fallbackSlug = 'gosen', fallbackId?: string): UserAccount {
  const cSlug = isGyGAlias(raw?.companyId || fallbackSlug)
    ? 'tiendagyg'
    : normalizeCompanySlug(raw?.companyId || fallbackSlug);
  const rawId = String(raw?.id || fallbackId || `usr_${Date.now()}`);
  const rawWhIds = Array.isArray(raw?.salesPermissions?.allowedWarehouseIds)
    ? raw.salesPermissions.allowedWarehouseIds
    : Array.isArray(raw?.allowedWarehouseIds)
    ? raw.allowedWarehouseIds
    : undefined;
  const cleanWhIds: string[] | undefined = rawWhIds
    ? Array.from(
        new Set<string>(
          rawWhIds
            .map((id: any) => String(id || '').trim())
            .filter((s: string) => s.length > 0)
        )
      )
    : undefined;

  return {
    id: rawId,
    companyId: cSlug,
    name: String(raw?.name || '').trim(),
    username: String(raw?.username || '')
      .trim()
      .toLowerCase()
      .replace(/^@+/, ''),
    password: String(raw?.password || '').trim(),
    role: raw?.role === 'admin' ? 'admin' : 'collaborator',
    isActive: raw?.isActive !== false,
    allowedTabs: Array.isArray(raw?.allowedTabs)
      ? raw.allowedTabs
      : ['sales', 'inventory', 'price-checker', 'catalog'],
    ...(cleanWhIds ? { allowedWarehouseIds: cleanWhIds } : {}),
    salesPermissions: raw?.salesPermissions
      ? {
          canEditSales:
            raw.salesPermissions.canEditSales !== undefined
              ? Boolean(raw.salesPermissions.canEditSales)
              : true,
          canCancelSales: Boolean(raw.salesPermissions.canCancelSales),
          canViewCostsAndProfits: Boolean(raw.salesPermissions.canViewCostsAndProfits),
          canUseCreditCalculator: Boolean(raw.salesPermissions.canUseCreditCalculator),
          canViewPriceCheckerCost: Boolean(raw.salesPermissions.canViewPriceCheckerCost),
          isRouteCollector: Boolean(raw.salesPermissions.isRouteCollector),
          routeCollectorScope:
            raw.salesPermissions.routeCollectorScope === 'assigned' ? 'assigned' : 'all',
          ...(cleanWhIds ? { allowedWarehouseIds: cleanWhIds } : {}),
        }
      : {
          canEditSales: true,
          canCancelSales: false,
          canViewCostsAndProfits: false,
          canUseCreditCalculator: false,
          canViewPriceCheckerCost: false,
          isRouteCollector: false,
          routeCollectorScope: 'all',
          ...(cleanWhIds ? { allowedWarehouseIds: cleanWhIds } : {}),
        },
    createdAt: Number(raw?.createdAt) || Date.now(),
    ...(raw?.lastLoginAt ? { lastLoginAt: Number(raw.lastLoginAt) } : {}),
  };
}

export function getAllLocallyCachedUsersAcrossAllTenants(): UserAccount[] {
  const byKey = new Map<string, UserAccount>();
  const addList = (list: UserAccount[] | null | undefined, defaultSlug: string) => {
    if (!Array.isArray(list)) return;
    for (const u of list) {
      if (!u || !u.username) continue;
      const sanitized = sanitizeUserAccountDoc(u, u.companyId || defaultSlug, u.id);
      const key = `${sanitized.companyId}__${sanitized.username.toLowerCase()}`;
      byKey.set(key, sanitized);
    }
  };

  addList(getCachedUsers('tiendagyg'), 'tiendagyg');
  addList(getCachedUsers('gosen'), 'gosen');

  const cachedCompanies = getCachedCompanies() || [];
  for (const c of cachedCompanies) {
    if (c?.slug) {
      const s = normalizeCompanySlug(c.slug);
      addList(getCachedUsers(s), s);
    }
  }

  if (typeof window !== 'undefined') {
    try {
      const prefix = `${BASE_CACHE_KEYS.USERS}__`;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k === BASE_CACHE_KEYS.USERS) {
          const parsed = safeReadCache<UserAccount[]>(k);
          addList(parsed, 'gosen');
        } else if (k.startsWith(prefix)) {
          const slugPart = k.slice(prefix.length) || 'gosen';
          const parsed = safeReadCache<UserAccount[]>(k);
          addList(parsed, slugPart);
        }
      }
    } catch {}
  }

  return Array.from(byKey.values());
}

export async function fetchUsersOnce(
  _forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<UserAccount[]> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedUsers(slug) || [];
  const hubSync = await syncCollectionsWithBackendHub(
    cached.length > 0 ? { users: cached } : {},
    slug
  ).catch(() => null);

  const mergeUserLists = (...lists: Array<UserAccount[] | null | undefined>): UserAccount[] => {
    const map = new Map<string, UserAccount>();
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!item || !item.username) continue;
        const clean = sanitizeUserAccountDoc(item, slug, item.id);
        if (!belongsToCompany(clean.companyId, slug, clean.id)) continue;
        const key = clean.username.toLowerCase();
        map.set(key, clean);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  };

  if (isFirestoreQuotaExhausted()) {
    const combined = mergeUserLists(cached, hubSync?.users);
    if (combined.length > 0) {
      setCachedUsers(combined, slug);
    }
    return combined;
  }

  const scopedQuery = getScopedCollectionQuery('users', slug);
  try {
    const snapshot = await withFirestoreTimeout(getDocs(scopedQuery), 2000);
    const records: UserAccount[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
      records.push(sanitizeUserAccountDoc(data, slug, docSnap.id));
    });
    const combined = mergeUserLists(cached, hubSync?.users, records);
    setCachedUsers(combined, slug);
    if (combined.length > 0) {
      syncCollectionsWithBackendHub({ users: combined }, slug).catch(() => {});
    }
    return combined;
  } catch (error) {
    isQuotaOrNetworkError(error);
    const combined = mergeUserLists(cached, hubSync?.users);
    if (combined.length > 0) {
      setCachedUsers(combined, slug);
      return combined;
    }
    return cached;
  }
}

export function subscribeToUsers(
  onData: (users: UserAccount[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  if (isFirestoreQuotaExhausted()) {
    const cached = getCachedUsers(slug);
    if (cached) onData(cached);
    return () => {};
  }
  const scopedQuery = getScopedCollectionQuery('users', slug);
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const records: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
        records.push(sanitizeUserAccountDoc(data, slug, docSnap.id));
      });
      const cached = getCachedUsers(slug) || [];
      const map = new Map<string, UserAccount>();
      for (const u of [...cached, ...records]) {
        if (u && u.username) {
          map.set(u.username.toLowerCase(), sanitizeUserAccountDoc(u, slug, u.id));
        }
      }
      const merged = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
      setCachedUsers(merged, slug);
      if (merged.length > 0) {
        syncCollectionsWithBackendHub({ users: merged }, slug).catch(() => {});
      }
      onData(merged);
    },
    (error) => {
      isQuotaOrNetworkError(error);
      console.warn('Users real-time subscription warning:', error);
      if (onError) onError(error);
      const cached = getCachedUsers(slug);
      if (cached) onData(cached);
    }
  );
}

export async function saveUserToFirestore(
  user: UserAccount,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(user.companyId || companyId)
    ? 'tiendagyg'
    : normalizeCompanySlug(user.companyId || companyId);
  const rawUserId = user.id || `usr_${Date.now()}`;
  const userId = getScopedDocId(rawUserId, slug);
  const docRef = doc(db, 'users', userId);

  const rawWhIds = Array.isArray(user.salesPermissions?.allowedWarehouseIds)
    ? user.salesPermissions?.allowedWarehouseIds
    : Array.isArray(user.allowedWarehouseIds)
    ? user.allowedWarehouseIds
    : undefined;
  const cleanWhIds = rawWhIds
    ? Array.from(
        new Set(
          rawWhIds
            .map((id) => String(id || '').trim())
            .filter(Boolean)
        )
      )
    : [];

  const rawIncomingUserPass = (user.password || '').trim();
  const isPasswordChanged = Boolean(rawIncomingUserPass && !isMaskedOrHashedPassword(rawIncomingUserPass));
  const hashedUserPass = isPasswordChanged
    ? (await hashPasswordViaServer(rawIncomingUserPass)) || rawIncomingUserPass
    : undefined;

  const basePayload: Omit<UserAccount, 'password'> & { password?: string } = {
    id: userId,
    companyId: slug,
    name: user.name.trim(),
    username: user.username.trim().toLowerCase().replace(/^@+/, ''),
    role: user.role,
    isActive: user.isActive !== false,
    allowedTabs: user.allowedTabs,
    allowedWarehouseIds: cleanWhIds,
    salesPermissions: {
      canEditSales:
        user.salesPermissions?.canEditSales !== undefined
          ? Boolean(user.salesPermissions.canEditSales)
          : true,
      canCancelSales: Boolean(user.salesPermissions?.canCancelSales),
      canViewCostsAndProfits: Boolean(user.salesPermissions?.canViewCostsAndProfits),
      canUseCreditCalculator: Boolean(user.salesPermissions?.canUseCreditCalculator),
      canViewPriceCheckerCost: Boolean(user.salesPermissions?.canViewPriceCheckerCost),
      isRouteCollector: Boolean(user.salesPermissions?.isRouteCollector),
      routeCollectorScope:
        user.salesPermissions?.routeCollectorScope === 'assigned' ? 'assigned' : 'all',
      allowedWarehouseIds: cleanWhIds,
    },
    createdAt: user.createdAt || Date.now(),
    ...(user.lastLoginAt ? { lastLoginAt: user.lastLoginAt } : {}),
  };

  const cachedPayload: UserAccount = {
    ...basePayload,
    password: HASHED_PASSWORD_MASK,
  };

  const currentUsers = getCachedUsers(slug) || [];
  const nextUsers = [
    ...currentUsers.filter(
      (u) =>
        u.id !== userId &&
        u.id !== user.id &&
        u.username.trim().toLowerCase() !== basePayload.username
    ),
    cachedPayload,
  ].sort((a, b) => a.name.localeCompare(b.name));

  setCachedUsers(nextUsers, slug);
  syncCollectionsWithBackendHub(
    {
      users: [
        {
          ...basePayload,
          password: isPasswordChanged ? rawIncomingUserPass : HASHED_PASSWORD_MASK,
        },
      ],
    },
    slug
  ).catch(() => {});

  if (isFirestoreQuotaExhausted()) {
    return;
  }

  try {
    const firestorePayload: any = { ...basePayload };
    if (hashedUserPass) {
      firestorePayload.password = hashedUserPass;
    }
    await withFirestoreTimeout(setDoc(docRef, firestorePayload, { merge: true }), 2000);
  } catch (error) {
    if (isQuotaOrNetworkError(error) || String(error).includes('timed out')) {
      console.warn('User saved in local cache & backend hub; Firestore sync deferred:', error);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${userId}`);
  }
}

export async function deleteUserFromFirestore(
  userId: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const currentUsers = getCachedUsers(slug) || [];
  const scopedId = getScopedDocId(userId, slug);
  setCachedUsers(
    currentUsers.filter((u) => u.id !== userId && u.id !== scopedId),
    slug
  );
  syncCollectionsWithBackendHub({ deleteUserId: userId }, slug).catch(() => {});
  if (scopedId !== userId) {
    syncCollectionsWithBackendHub({ deleteUserId: scopedId }, slug).catch(() => {});
  }

  if (isFirestoreQuotaExhausted()) {
    return;
  }

  try {
    await withFirestoreTimeout(deleteDoc(doc(db, 'users', userId)), 2000);
    if (slug !== 'gosen' && !userId.startsWith(`${slug}__`)) {
      await withFirestoreTimeout(deleteDoc(doc(db, 'users', scopedId)), 1500).catch(() => {});
    }
  } catch (error) {
    if (isQuotaOrNetworkError(error) || String(error).includes('timed out')) {
      console.warn('User deletion saved in local cache & hub; Firestore sync deferred:', error);
      return;
    }
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
      const rawSess =
        localStorage.getItem('stockmaster_user_session') ||
        sessionStorage.getItem('stockmaster_user_session');
      if (rawSess) {
        const parsed = JSON.parse(rawSess);
        if (parsed?.isSuperAdmin === true && hasBackendAuthSession) {
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
  enableRestaurantModule: true,
  enableCreditContract: true,
  enableDigitalSignature: true,
  enableWarrantyModule: true,
  enableCreditCalculator: false,
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

  const isOnlineSalesEnabled =
    data.enableOnlineSales !== undefined
      ? Boolean(data.enableOnlineSales)
      : Array.isArray(data.allowedModules) && data.allowedModules.length > 0
      ? data.allowedModules.includes('online-sales')
      : true;
  const isRestaurantEnabled =
    data.enableRestaurantModule !== undefined
      ? Boolean(data.enableRestaurantModule)
      : true;
  const effectiveAllowedModules: ActiveTab[] = resolveCompanyAllowedModules(
    data.allowedModules,
    {
      enableOnlineSales: isOnlineSalesEnabled,
      enableRestaurantModule: isRestaurantEnabled,
    }
  );

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
    allowedModules: effectiveAllowedModules,
    enableDeliveryDvolada:
      data.enableDeliveryDvolada !== undefined
        ? Boolean(data.enableDeliveryDvolada)
        : slug === 'gosen',
    enableOnlineSales: isOnlineSalesEnabled,
    enableRestaurantModule: isRestaurantEnabled,
    enableCreditContract:
      data.enableCreditContract !== undefined
        ? Boolean(data.enableCreditContract)
        : slug === 'gosen' || isGyGAlias(slug),
    enableDigitalSignature:
      data.enableDigitalSignature !== undefined
        ? Boolean(data.enableDigitalSignature)
        : data.enableCreditContract !== undefined
        ? Boolean(data.enableCreditContract)
        : slug === 'gosen' || isGyGAlias(slug),
    enableWarrantyModule:
      data.enableWarrantyModule !== undefined
        ? Boolean(data.enableWarrantyModule)
        : slug === 'gosen' || isGyGAlias(slug),
    enableCreditCalculator: Boolean(data.enableCreditCalculator === true),
    maxProducts: Math.max(0, Number(data.maxProducts) || 0),
    maxUsers: Math.max(0, Number(data.maxUsers) || 0),
    paymentHistory: parsedHistory,
    createdAt: Number(data.createdAt) || Date.now(),
    isPrimary: slug === 'gosen',
  };
}

export async function fetchCompaniesOnce(_forceRefresh = false): Promise<CompanyTenant[]> {
  const cached = getCachedCompanies();
  const hubSync = await syncCollectionsWithBackendHub({}, 'gosen').catch(() => null);

  const buildFallbackCompanies = (): CompanyTenant[] => {
    const map = new Map<string, CompanyTenant>();
    map.set('gosen', { ...DEFAULT_GOSEN_COMPANY });
    if (cached && cached.length > 0) {
      cached.forEach((c) => {
        const s = normalizeCompanySlug(c.slug || c.id);
        map.set(s, sanitizeCompanyDoc(s, c));
      });
    }
    if (Array.isArray(hubSync?.companies) && hubSync.companies.length > 0) {
      hubSync.companies.forEach((c) => {
        if (c && (c.slug || c.id)) {
          const s = normalizeCompanySlug(c.slug || c.id);
          map.set(s, sanitizeCompanyDoc(s, c));
        }
      });
    }
    const list = Array.from(map.values());
    setCachedCompanies(list);
    return list;
  };

  if (isFirestoreQuotaExhausted()) {
    return buildFallbackCompanies();
  }

  try {
    const snapshot = await withFirestoreTimeout(getDocs(collection(db, 'companies')), 2000);
    const map = new Map<string, CompanyTenant>();
    map.set('gosen', { ...DEFAULT_GOSEN_COMPANY });

    if (cached && cached.length > 0) {
      cached.forEach((c) => {
        const s = normalizeCompanySlug(c.slug || c.id);
        map.set(s, sanitizeCompanyDoc(s, c));
      });
    }

    if (Array.isArray(hubSync?.companies) && hubSync.companies.length > 0) {
      hubSync.companies.forEach((c) => {
        if (c && (c.slug || c.id)) {
          const s = normalizeCompanySlug(c.slug || c.id);
          map.set(s, sanitizeCompanyDoc(s, c));
        }
      });
    }

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
    isQuotaOrNetworkError(error);
    return buildFallbackCompanies();
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
  const rawAllowedModules: ActiveTab[] =
    Array.isArray(company.allowedModules) && company.allowedModules.length > 0
      ? company.allowedModules
      : ALL_COMPANY_MODULES;
  const safeEnableOnlineSales =
    company.enableOnlineSales !== undefined
      ? Boolean(company.enableOnlineSales)
      : rawAllowedModules.includes('online-sales');
  const safeEnableRestaurantModule =
    company.enableRestaurantModule !== undefined
      ? Boolean(company.enableRestaurantModule)
      : rawAllowedModules.includes('restaurant');
  const safeAllowedModules: ActiveTab[] = resolveCompanyAllowedModules(rawAllowedModules, {
    enableOnlineSales: safeEnableOnlineSales,
    enableRestaurantModule: safeEnableRestaurantModule,
  });

  const safeDeliveryDvolada =
    company.enableDeliveryDvolada !== undefined
      ? Boolean(company.enableDeliveryDvolada)
      : slug === 'gosen';
  const safeEnableCreditContract =
    company.enableCreditContract !== undefined
      ? Boolean(company.enableCreditContract)
      : slug === 'gosen' || isGyGAlias(slug);
  const safeEnableDigitalSignature =
    company.enableDigitalSignature !== undefined
      ? Boolean(company.enableDigitalSignature)
      : safeEnableCreditContract;
  const safeEnableWarrantyModule =
    company.enableWarrantyModule !== undefined
      ? Boolean(company.enableWarrantyModule)
      : slug === 'gosen' || isGyGAlias(slug);
  const safeEnableCreditCalculator = Boolean(company.enableCreditCalculator === true);
  const safeMaxProducts = Math.max(0, Number(company.maxProducts) || 0);
  const safeMaxUsers = Math.max(0, Number(company.maxUsers) || 0);
  const safePaymentHistory: SubscriptionPaymentRecord[] = Array.isArray(company.paymentHistory)
    ? company.paymentHistory
    : [];

  const rawCompanyPass = (company.adminPassword || '').trim();
  const isPassExplicitlySet = Boolean(rawCompanyPass && !isMaskedOrHashedPassword(rawCompanyPass));
  const hashedPassForFirestore = isPassExplicitlySet
    ? (await hashPasswordViaServer(rawCompanyPass)) || rawCompanyPass
    : undefined;

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
    adminPassword: isPassExplicitlySet ? HASHED_PASSWORD_MASK : rawCompanyPass || HASHED_PASSWORD_MASK,
    logoUrl: safeLogo,
    tagline: (company.tagline || 'Control de Inventario y Ventas').trim(),
    address: (company.address || '').trim(),
    notes: (company.notes || '').trim(),
    allowedModules: safeAllowedModules,
    enableDeliveryDvolada: safeDeliveryDvolada,
    enableOnlineSales: safeEnableOnlineSales,
    enableRestaurantModule: safeEnableRestaurantModule,
    enableCreditContract: safeEnableCreditContract,
    enableDigitalSignature: safeEnableDigitalSignature,
    enableWarrantyModule: safeEnableWarrantyModule,
    enableCreditCalculator: safeEnableCreditCalculator,
    maxProducts: safeMaxProducts,
    maxUsers: safeMaxUsers,
    paymentHistory: safePaymentHistory,
    createdAt: company.createdAt || Date.now(),
    isPrimary: slug === 'gosen',
  };

  // Update local companies cache immediately
  const existingComps = getCachedCompanies() || [DEFAULT_GOSEN_COMPANY];
  const compIdx = existingComps.findIndex((c) => normalizeCompanySlug(c.slug) === slug);
  const updatedComps =
    compIdx >= 0
      ? existingComps.map((c, i) => (i === compIdx ? normalized : c))
      : [normalized, ...existingComps];
  setCachedCompanies(updatedComps);

  // Also initialize/sync the company's store_profile settings document
  const existingSettings = getCachedStoreSettings(slug);
  const profileRef = doc(db, 'settings', getStoreProfileDocId(slug));
  const profilePayload: StoreSettings = {
    ...(existingSettings || {}),
    companyId: slug,
    storeName: normalized.name,
    tagline: normalized.tagline,
    logoUrl: normalized.logoUrl,
    phone: normalized.phone,
    address: normalized.address,
    accessPassword: normalized.adminPassword,
    whatsappOrderPhone: existingSettings?.whatsappOrderPhone || normalized.phone,
    allowedModules: normalized.allowedModules,
    enableDeliveryDvolada: normalized.enableDeliveryDvolada,
    enableOnlineSales: normalized.enableOnlineSales,
    enableRestaurantModule: normalized.enableRestaurantModule,
    enableCreditContract: normalized.enableCreditContract,
    enableDigitalSignature: normalized.enableDigitalSignature,
    enableWarrantyModule: normalized.enableWarrantyModule,
    enableCreditCalculator: normalized.enableCreditCalculator,
    maxProducts: normalized.maxProducts,
    maxUsers: normalized.maxUsers,
    updatedAt: Date.now(),
  };
  setCachedStoreSettings(profilePayload, slug);
  syncCollectionsWithBackendHub(
    {
      companies: [
        {
          ...normalized,
          adminPassword: isPassExplicitlySet ? rawCompanyPass : HASHED_PASSWORD_MASK,
        },
      ],
      settings: {
        ...profilePayload,
        accessPassword: isPassExplicitlySet ? rawCompanyPass : HASHED_PASSWORD_MASK,
      },
    },
    slug
  ).catch(() => {});

  try {
    const batch = writeBatch(db);
    const firestoreCompData: Record<string, any> = {
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
      logoUrl: normalized.logoUrl,
      tagline: normalized.tagline,
      address: normalized.address,
      notes: normalized.notes,
      allowedModules: normalized.allowedModules,
      enableDeliveryDvolada: normalized.enableDeliveryDvolada,
      enableOnlineSales: normalized.enableOnlineSales,
      enableRestaurantModule: normalized.enableRestaurantModule,
      enableCreditContract: normalized.enableCreditContract,
      enableDigitalSignature: normalized.enableDigitalSignature,
      enableWarrantyModule: normalized.enableWarrantyModule,
      enableCreditCalculator: normalized.enableCreditCalculator,
      maxProducts: normalized.maxProducts,
      maxUsers: normalized.maxUsers,
      paymentHistory: normalized.paymentHistory,
      createdAt: normalized.createdAt,
      isPrimary: normalized.isPrimary,
    };
    if (hashedPassForFirestore) {
      firestoreCompData.adminPassword = hashedPassForFirestore;
    }
    batch.set(docRef, firestoreCompData, { merge: true });

    const firestoreSettingsData = stripUndefinedDeep({ ...profilePayload }) as Record<string, any>;
    if (hashedPassForFirestore) {
      firestoreSettingsData.accessPassword = hashedPassForFirestore;
    } else {
      delete firestoreSettingsData.accessPassword;
    }
    batch.set(profileRef, firestoreSettingsData, { merge: true });

    await batch.commit();
    return normalized;
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Company saved in local cache; cloud sync deferred:', error);
      return normalized;
    }
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
    if (isQuotaOrNetworkError(error)) {
      console.warn('Company deletion deferred due to quota/network:', error);
      return;
    }
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

  setCachedSaaSGlobalConfig(normalized);

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
    return normalized;
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('SaaS global config saved in local cache; cloud sync deferred:', error);
      return normalized;
    }
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

  setCachedSaaSDemoRequests(trimmed);

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
    return trimmed;
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Demo request saved in local cache; cloud sync deferred:', error);
      return trimmed;
    }
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
  | 'ropa_calzado'
  | 'pulperia_abarrotes'
  | 'ferreteria_repuestos'
  | 'farmacia_cosmeticos'
  | 'restaurante_cafeteria',
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
  restaurante_cafeteria: {
    label: 'Restaurante, Comedor y Cafetería',
    description: 'Platos Fuertes, Comida Rápida, Bebidas y Postres listos para Mesas y Comandera.',
    items: [
      { code: 'RES-001', name: 'Plato Típico Carne Asada', category: 'Platos Fuertes', cost: 95, price: 220, stock: 999 },
      { code: 'RES-002', name: 'Hamburguesa Clásica con Papas', category: 'Comida Rápida', cost: 65, price: 165, stock: 999 },
      { code: 'RES-003', name: 'Pechuga de Pollo a la Plancha', category: 'Platos Fuertes', cost: 80, price: 185, stock: 999 },
      { code: 'BEB-101', name: 'Jugo Natural de Temporada', category: 'Bebidas', cost: 15, price: 45, stock: 999 },
      { code: 'BEB-102', name: 'Refresco en Lata 355ml', category: 'Bebidas', cost: 18, price: 35, stock: 120 },
      { code: 'POS-001', name: 'Porción de Tres Leches', category: 'Postres', cost: 30, price: 75, stock: 999 },
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
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'pos_finance_gosen' : `pos_finance_${slug}`;
}

export function getCachedPOSFinanceData(companyId = getActiveCompanyId()): POSFinanceStoreData {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const emptyDefault: POSFinanceStoreData = {
    companyId: slug,
    shifts: [],
    expenses: [],
    creditAccountControls: {},
    quotations: [],
    updatedAt: 0,
  };

  if (isGyGAlias(slug)) {
    const aliasSlugs = ['tiendagyg', 'comercial-gyg', 'comercialgyg', 'comercial_gyg', 'gyg'];
    let combined: POSFinanceStoreData | null = null;
    for (const alias of aliasSlugs) {
      const raw = safeReadCache<POSFinanceStoreData>(
        getScopedCacheKey(POS_FINANCE_CACHE_BASE, alias)
      );
      if (raw) {
        combined = combined
          ? mergePOSFinanceObjects(slug, combined, raw)
          : sanitizePOSFinanceDoc(slug, raw as Record<string, any>);
      }
    }
    return combined || emptyDefault;
  }

  const cached = safeReadCache<POSFinanceStoreData>(
    getScopedCacheKey(POS_FINANCE_CACHE_BASE, slug)
  );
  return cached || emptyDefault;
}

export function setCachedPOSFinanceData(
  data: POSFinanceStoreData,
  companyId = getActiveCompanyId()
): void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
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
        isOnlineChannelExpense: Boolean(e.isOnlineChannelExpense),
        onlineChannel: e.onlineChannel || undefined,
        liveSessionName: e.liveSessionName ? String(e.liveSessionName) : undefined,
      }))
    : [];

  const creditAccountControls =
    raw.creditAccountControls && typeof raw.creditAccountControls === 'object'
      ? raw.creditAccountControls
      : {};

  const onlineCustomers = Array.isArray(raw.onlineCustomers) ? raw.onlineCustomers : [];

  const loyaltyConfig =
    raw.loyaltyConfig && typeof raw.loyaltyConfig === 'object'
      ? {
          enabled: raw.loyaltyConfig.enabled !== false,
          amountPerPoint: Math.max(1, Number(raw.loyaltyConfig.amountPerPoint) || 100),
          pointsEarnedPerStep: Math.max(1, Number(raw.loyaltyConfig.pointsEarnedPerStep) || 1),
          lempirasPerPointRedeem: Math.max(
            0.1,
            Number(raw.loyaltyConfig.lempirasPerPointRedeem) || 5
          ),
          minPointsToRedeem: Math.max(1, Number(raw.loyaltyConfig.minPointsToRedeem) || 5),
          welcomeBonusPoints: Math.max(0, Number(raw.loyaltyConfig.welcomeBonusPoints) || 0),
        }
      : {
          enabled: true,
          amountPerPoint: 100,
          pointsEarnedPerStep: 1,
          lempirasPerPointRedeem: 5,
          minPointsToRedeem: 5,
          welcomeBonusPoints: 0,
        };

  const loyaltyCustomers = Array.isArray(raw.loyaltyCustomers) ? raw.loyaltyCustomers : [];

  const routeCollectorConfig =
    raw.routeCollectorConfig && typeof raw.routeCollectorConfig === 'object'
      ? {
          autoCalculateNextDateOnAbone:
            raw.routeCollectorConfig.autoCalculateNextDateOnAbone !== false,
          defaultPaymentFrequency: (['daily', 'weekly', 'biweekly', 'monthly'].includes(
            raw.routeCollectorConfig.defaultPaymentFrequency
          )
            ? raw.routeCollectorConfig.defaultPaymentFrequency
            : 'weekly') as 'daily' | 'weekly' | 'biweekly' | 'monthly',
          upcomingAlertDays: Math.max(
            1,
            Math.min(15, Number(raw.routeCollectorConfig.upcomingAlertDays) || 3)
          ),
          notifyAdminOnEveryAbone: raw.routeCollectorConfig.notifyAdminOnEveryAbone !== false,
          notifyAdminOnReschedule: raw.routeCollectorConfig.notifyAdminOnReschedule !== false,
          enabledCollectorUsernames: Array.isArray(
            raw.routeCollectorConfig.enabledCollectorUsernames
          )
            ? raw.routeCollectorConfig.enabledCollectorUsernames.map((u: any) =>
                String(u || '')
                  .trim()
                  .toLowerCase()
              )
            : [],
        }
      : {
          autoCalculateNextDateOnAbone: true,
          defaultPaymentFrequency: 'weekly' as const,
          upcomingAlertDays: 3,
          notifyAdminOnEveryAbone: true,
          notifyAdminOnReschedule: true,
          enabledCollectorUsernames: [],
        };

  const routeCollectorAlerts = Array.isArray(raw.routeCollectorAlerts)
    ? raw.routeCollectorAlerts
    : [];

  const quotations: PosQuotationRecord[] = Array.isArray(raw.quotations)
    ? raw.quotations
        .filter((q: any) => q && typeof q === 'object' && q.id)
        .map((q: any): PosQuotationRecord => ({
          id: String(q.id),
          companyId: slug,
          quotationNumber: String(q.quotationNumber || 'COT-0001'),
          status: (['pending', 'converted', 'cancelled'].includes(q.status)
            ? q.status
            : 'pending') as PosQuotationRecord['status'],
          createdAt: Number(q.createdAt) || Date.now(),
          updatedAt: Number(q.updatedAt) || Number(q.createdAt) || Date.now(),
          dateFormatted: String(q.dateFormatted || ''),
          expiresAt: q.expiresAt ? Number(q.expiresAt) : undefined,
          validUntilDate: q.validUntilDate ? String(q.validUntilDate) : undefined,
          validDays: q.validDays !== undefined ? Number(q.validDays) : undefined,
          createdBy: String(q.createdBy || 'Administrador'),
          createdByUsername: q.createdByUsername ? String(q.createdByUsername) : undefined,
          warehouseId: q.warehouseId ? String(q.warehouseId) : undefined,
          warehouseName: q.warehouseName ? String(q.warehouseName) : undefined,
          customerName: String(q.customerName || 'Cliente por confirmar'),
          customerPhone: q.customerPhone ? String(q.customerPhone) : undefined,
          customerRtn: q.customerRtn ? String(q.customerRtn) : undefined,
          customerAddress: q.customerAddress ? String(q.customerAddress) : undefined,
          items: Array.isArray(q.items)
            ? q.items.map((it: any) => ({
                productId: String(it.productId || ''),
                code: String(it.code || ''),
                name: String(it.name || ''),
                category: it.category ? String(it.category) : undefined,
                size: it.size ? String(it.size) : undefined,
                originalPrice:
                  it.originalPrice !== undefined ? Number(it.originalPrice) : undefined,
                cashPrice: it.cashPrice !== undefined ? Number(it.cashPrice) : undefined,
                creditPrice: it.creditPrice !== undefined ? Number(it.creditPrice) : undefined,
                unitDiscount: it.unitDiscount !== undefined ? Number(it.unitDiscount) : undefined,
                price: Number(it.price) || 0,
                cost: Number(it.cost) || 0,
                quantity: Math.max(1, Number(it.quantity) || 1),
                subtotal: Number(it.subtotal) || 0,
                warehouseId: it.warehouseId ? String(it.warehouseId) : undefined,
                warehouseName: it.warehouseName ? String(it.warehouseName) : undefined,
                hasWarranty: Boolean(it.hasWarranty),
                warrantyCode: it.warrantyCode ? String(it.warrantyCode) : undefined,
                warrantyCodes: Array.isArray(it.warrantyCodes) ? it.warrantyCodes : undefined,
                warrantyDuration: it.warrantyDuration ? String(it.warrantyDuration) : undefined,
                warrantyNotes: it.warrantyNotes ? String(it.warrantyNotes) : undefined,
              }))
            : [],
          totalItems: Number(q.totalItems) || 0,
          subtotal: Number(q.subtotal) || 0,
          discountType: (q.discountType === 'percent' ? 'percent' : 'amount') as
            | 'percent'
            | 'amount',
          discountValue: Number(q.discountValue) || 0,
          discountAmount: Number(q.discountAmount) || 0,
          applyTax: Boolean(q.applyTax),
          taxAmount: Number(q.taxAmount) || 0,
          cashTotal: Number(q.cashTotal) || 0,
          paymentMode: (['cash', 'card', 'transfer', 'credit'].includes(q.paymentMode)
            ? q.paymentMode
            : 'cash') as PosQuotationRecord['paymentMode'],
          creditTotal: q.creditTotal !== undefined ? Number(q.creditTotal) : undefined,
          creditDownPayment:
            q.creditDownPayment !== undefined ? Number(q.creditDownPayment) : undefined,
          creditBalanceToFinance:
            q.creditBalanceToFinance !== undefined
              ? Number(q.creditBalanceToFinance)
              : undefined,
          creditInstallments:
            q.creditInstallments !== undefined ? Number(q.creditInstallments) : undefined,
          creditInstallmentAmount:
            q.creditInstallmentAmount !== undefined
              ? Number(q.creditInstallmentAmount)
              : undefined,
          creditFrequency: ['daily', 'weekly', 'biweekly', 'monthly'].includes(q.creditFrequency)
            ? (q.creditFrequency as PosQuotationRecord['creditFrequency'])
            : undefined,
          creditFirstPaymentDate: q.creditFirstPaymentDate
            ? String(q.creditFirstPaymentDate)
            : undefined,
          creditAssignedCollector: q.creditAssignedCollector
            ? String(q.creditAssignedCollector)
            : undefined,
          creditArticleBrand: q.creditArticleBrand ? String(q.creditArticleBrand) : undefined,
          creditArticleModel: q.creditArticleModel ? String(q.creditArticleModel) : undefined,
          includeWarranty: Boolean(q.includeWarranty),
          warrantyDuration: q.warrantyDuration ? String(q.warrantyDuration) : undefined,
          warrantySerialNotes: q.warrantySerialNotes ? String(q.warrantySerialNotes) : undefined,
          warrantyTerms: q.warrantyTerms ? String(q.warrantyTerms) : undefined,
          notes: q.notes ? String(q.notes) : undefined,
          convertedSaleId: q.convertedSaleId ? String(q.convertedSaleId) : undefined,
          convertedSaleNumber: q.convertedSaleNumber ? String(q.convertedSaleNumber) : undefined,
          convertedAt: q.convertedAt ? Number(q.convertedAt) : undefined,
        }))
        .sort((a: PosQuotationRecord, b: PosQuotationRecord) => b.createdAt - a.createdAt)
    : [];

  return {
    companyId: slug,
    shifts: shifts.sort((a, b) => b.openedAt - a.openedAt),
    expenses: expenses.sort((a, b) => b.timestamp - a.timestamp),
    creditAccountControls,
    routeCollectorConfig,
    routeCollectorAlerts,
    onlineCustomers,
    loyaltyConfig,
    loyaltyCustomers,
    quotations,
    updatedAt: Number(raw.updatedAt) > 0 ? Number(raw.updatedAt) : 0,
  };
}

export function mergePOSFinanceObjects(
  slug: string,
  a?: POSFinanceStoreData | null,
  b?: POSFinanceStoreData | null
): POSFinanceStoreData {
  if (!a && !b) return getCachedPOSFinanceData(slug);
  if (!a) return sanitizePOSFinanceDoc(slug, b as Record<string, any>);
  if (!b) return sanitizePOSFinanceDoc(slug, a as Record<string, any>);

  const aTs = Number(a.updatedAt || 0);
  const bTs = Number(b.updatedAt || 0);
  const primary = bTs >= aTs ? b : a;
  const secondary = bTs >= aTs ? a : b;

  const mergedControls: Record<string, any> = {};
  const secControls = secondary.creditAccountControls || {};
  const priControls = primary.creditAccountControls || {};
  const allCtrlKeys = new Set([...Object.keys(secControls), ...Object.keys(priControls)]);
  for (const key of allCtrlKeys) {
    const sCtrl = secControls[key];
    const pCtrl = priControls[key];
    if (sCtrl && !pCtrl) {
      mergedControls[key] = sCtrl;
    } else if (pCtrl && !sCtrl) {
      mergedControls[key] = pCtrl;
    } else if (sCtrl && pCtrl) {
      const sTs = Number(sCtrl.updatedAt || 0);
      const pTs = Number(pCtrl.updatedAt || 0);
      mergedControls[key] = pTs >= sTs ? { ...sCtrl, ...pCtrl } : { ...pCtrl, ...sCtrl };
    }
  }

  const collectorSet = new Set<string>(
    (
      primary.routeCollectorConfig?.enabledCollectorUsernames ||
      secondary.routeCollectorConfig?.enabledCollectorUsernames ||
      []
    )
      .map((u) => String(u || '').trim().toLowerCase().replace(/^@+/, ''))
      .filter(Boolean)
  );
  for (const ctrl of Object.values(mergedControls)) {
    if (ctrl?.assignedCollectorUsername) {
      collectorSet.add(
        String(ctrl.assignedCollectorUsername).trim().toLowerCase().replace(/^@+/, '')
      );
    }
  }

  const alertMap = new Map<string, any>();
  for (const al of [
    ...(secondary.routeCollectorAlerts || []),
    ...(primary.routeCollectorAlerts || []),
  ]) {
    if (al && al.id) {
      const existing = alertMap.get(al.id);
      if (!existing || al.status === 'reviewed') {
        alertMap.set(al.id, al);
      }
    }
  }

  const shiftMap = new Map<string, any>();
  for (const sh of [...(secondary.shifts || []), ...(primary.shifts || [])]) {
    if (sh && sh.id) {
      const existing = shiftMap.get(sh.id);
      if (
        !existing ||
        sh.status === 'closed' ||
        (sh.cashMovements?.length || 0) >= (existing.cashMovements?.length || 0)
      ) {
        shiftMap.set(sh.id, sh);
      }
    }
  }

  const expMap = new Map<string, any>();
  for (const ex of [...(secondary.expenses || []), ...(primary.expenses || [])]) {
    if (ex && ex.id) expMap.set(ex.id, ex);
  }

  const quotationMap = new Map<string, PosQuotationRecord>();
  const primaryUpdatedAt = Math.max(aTs, bTs);
  for (const q of primary.quotations || []) {
    if (q && q.id) quotationMap.set(q.id, q);
  }
  for (const q of secondary.quotations || []) {
    if (!q || !q.id) continue;
    const existing = quotationMap.get(q.id);
    if (existing) {
      const exTs = Number(existing.updatedAt || existing.createdAt || 0);
      const qTs = Number(q.updatedAt || q.createdAt || 0);
      if (qTs > exTs || (q.status === 'converted' && existing.status !== 'converted')) {
        quotationMap.set(q.id, q);
      }
    } else if (Number(q.updatedAt || q.createdAt || 0) > primaryUpdatedAt - 10000) {
      quotationMap.set(q.id, q);
    }
  }

  return sanitizePOSFinanceDoc(slug, {
    ...secondary,
    ...primary,
    companyId: slug,
    shifts: Array.from(shiftMap.values()),
    expenses: Array.from(expMap.values()),
    creditAccountControls: mergedControls,
    quotations: Array.from(quotationMap.values()).sort((x, y) => y.createdAt - x.createdAt),
    routeCollectorAlerts: Array.from(alertMap.values()).sort(
      (x, y) => (Number(y.timestamp) || 0) - (Number(x.timestamp) || 0)
    ),
    routeCollectorConfig: {
      ...(secondary.routeCollectorConfig || {}),
      ...(primary.routeCollectorConfig || {}),
      enabledCollectorUsernames: Array.from(collectorSet),
    },
    updatedAt: Math.max(aTs, bTs),
  });
}

export async function fetchPOSFinanceDataOnce(
  companyId = getActiveCompanyId()
): Promise<POSFinanceStoreData> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedPOSFinanceData(slug);
  const hasCachedPayload =
    cached &&
    (cached.updatedAt > 0 ||
      (cached.expenses?.length || 0) > 0 ||
      (cached.shifts?.length || 0) > 0 ||
      Object.keys(cached.creditAccountControls || {}).length > 0 ||
      (cached.quotations?.length || 0) > 0);
  const hubSync = await syncCollectionsWithBackendHub(
    hasCachedPayload ? { posFinance: cached } : {},
    slug
  );
  const hubFinance = hubSync?.posFinance
    ? sanitizePOSFinanceDoc(slug, hubSync.posFinance)
    : null;

  if (isFirestoreQuotaExhausted()) {
    const merged = mergePOSFinanceObjects(slug, cached, hubFinance);
    setCachedPOSFinanceData(merged, slug);
    return merged;
  }

  try {
    const docIds = isGyGAlias(slug)
      ? [
          'pos_finance_tiendagyg',
          'pos_finance_comercial-gyg',
          'pos_finance_comercialgyg',
          'pos_finance_comercial_gyg',
          'pos_finance_gyg',
        ]
      : [getPOSFinanceDocId(slug)];

    const snaps = await Promise.all(
      docIds.map((docId) =>
        withFirestoreTimeout(getDoc(doc(db, 'settings', docId)), 6500).catch(() => null)
      )
    );

    let merged = mergePOSFinanceObjects(slug, cached, hubFinance);
    let foundAnyCloudDoc = false;
    for (const snap of snaps) {
      if (snap && snap.exists()) {
        foundAnyCloudDoc = true;
        const parsed = sanitizePOSFinanceDoc(slug, snap.data());
        merged = mergePOSFinanceObjects(slug, merged, parsed);
      }
    }

    setCachedPOSFinanceData(merged, slug);
    if (foundAnyCloudDoc || (merged.expenses?.length || 0) > 0 || (merged.shifts?.length || 0) > 0) {
      syncCollectionsWithBackendHub({ posFinance: merged }, slug).catch(() => {});
    }
    return merged;
  } catch (err) {
    isQuotaOrNetworkError(err);
    const merged = mergePOSFinanceObjects(slug, cached, hubFinance);
    setCachedPOSFinanceData(merged, slug);
    return merged;
  }
}

export function subscribeToPOSFinanceData(
  onData: (data: POSFinanceStoreData) => void,
  companyId = getActiveCompanyId()
): () => void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  if (isFirestoreQuotaExhausted()) {
    fetchPOSFinanceDataOnce(slug).then(onData).catch(() => {});
    return () => {};
  }
  try {
    const docRef = doc(db, 'settings', getPOSFinanceDocId(slug));
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const parsed = sanitizePOSFinanceDoc(slug, snap.data());
          const isFromServer = !snap.metadata?.fromCache;
          const cached = getCachedPOSFinanceData(slug);
          const merged = mergePOSFinanceObjects(slug, cached, parsed);
          setCachedPOSFinanceData(merged, slug);
          if (isFromServer) {
            syncCollectionsWithBackendHub({ posFinance: parsed }, slug).catch(() => {});
          }
          onData(merged);
        } else {
          fetchPOSFinanceDataOnce(slug).then(onData).catch(() => {});
        }
      },
      (err) => {
        isQuotaOrNetworkError(err);
        console.warn('POS finance listener warning:', err);
        fetchPOSFinanceDataOnce(slug).then(onData).catch(() => {});
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
  const slug = isGyGAlias(data.companyId || companyId)
    ? 'tiendagyg'
    : normalizeCompanySlug(data.companyId || companyId);
  const docRef = doc(db, 'settings', getPOSFinanceDocId(slug));

  const nowTs = Date.now();
  const prevCached = getCachedPOSFinanceData(slug);
  const prevControls = prevCached?.creditAccountControls || {};
  const rawControls =
    data.creditAccountControls && typeof data.creditAccountControls === 'object'
      ? data.creditAccountControls
      : {};
  const controls: Record<string, any> = {};
  for (const [k, ctrl] of Object.entries(rawControls)) {
    if (!ctrl || typeof ctrl !== 'object') continue;
    const prevCtrl = prevControls[k];
    const hasChanged = !prevCtrl || JSON.stringify(prevCtrl) !== JSON.stringify(ctrl);
    controls[k] = hasChanged
      ? { ...ctrl, updatedAt: nowTs }
      : { ...ctrl, updatedAt: Number(ctrl.updatedAt || prevCtrl?.updatedAt || 0) || undefined };
  }

  // Auto-include any assigned collector usernames from creditAccountControls into enabledCollectorUsernames
  const collectorSet = new Set<string>(
    (data.routeCollectorConfig?.enabledCollectorUsernames || [])
      .map((u) => String(u || '').trim().toLowerCase().replace(/^@+/, ''))
      .filter(Boolean)
  );
  for (const ctrl of Object.values(controls)) {
    if (ctrl?.assignedCollectorUsername) {
      collectorSet.add(
        String(ctrl.assignedCollectorUsername).trim().toLowerCase().replace(/^@+/, '')
      );
    }
  }

  const normalized: POSFinanceStoreData = {
    companyId: slug,
    shifts: Array.isArray(data.shifts) ? data.shifts.slice(0, 120) : [],
    expenses: Array.isArray(data.expenses) ? data.expenses.slice(0, 500) : [],
    creditAccountControls: controls,
    onlineCustomers: Array.isArray(data.onlineCustomers) ? data.onlineCustomers.slice(0, 1000) : [],
    loyaltyConfig: data.loyaltyConfig || {
      enabled: true,
      amountPerPoint: 100,
      pointsEarnedPerStep: 1,
      lempirasPerPointRedeem: 5,
      minPointsToRedeem: 5,
      welcomeBonusPoints: 0,
    },
    loyaltyCustomers: Array.isArray(data.loyaltyCustomers)
      ? data.loyaltyCustomers.slice(0, 2000)
      : [],
    routeCollectorConfig: {
      autoCalculateNextDateOnAbone: data.routeCollectorConfig?.autoCalculateNextDateOnAbone !== false,
      defaultPaymentFrequency: data.routeCollectorConfig?.defaultPaymentFrequency || 'weekly',
      upcomingAlertDays: Number(data.routeCollectorConfig?.upcomingAlertDays) || 3,
      notifyAdminOnEveryAbone: data.routeCollectorConfig?.notifyAdminOnEveryAbone !== false,
      notifyAdminOnReschedule: data.routeCollectorConfig?.notifyAdminOnReschedule !== false,
      enabledCollectorUsernames: Array.from(collectorSet),
    },
    routeCollectorAlerts: Array.isArray(data.routeCollectorAlerts)
      ? data.routeCollectorAlerts.slice(0, 300)
      : [],
    quotations: Array.isArray(data.quotations) ? data.quotations.slice(0, 250) : [],
    updatedAt: Date.now(),
  };

  setCachedPOSFinanceData(normalized, slug);
  const hubPromise = racePromiseWithTimeout(
    syncCollectionsWithBackendHub({ posFinance: normalized }, slug),
    2000,
    null
  );

  if (isFirestoreQuotaExhausted()) {
    await hubPromise;
    return normalized;
  }

  try {
    await Promise.all([
      hubPromise,
      withFirestoreTimeout(
        setDoc(
          docRef,
          stripUndefinedDeep({
            storeName: `Finanzas POS ${slug}`.slice(0, 190), // satisfies isValidStoreSettings
            companyId: slug,
            shifts: normalized.shifts,
            expenses: normalized.expenses,
            creditAccountControls: normalized.creditAccountControls,
            routeCollectorConfig: normalized.routeCollectorConfig,
            routeCollectorAlerts: normalized.routeCollectorAlerts,
            onlineCustomers: normalized.onlineCustomers,
            loyaltyConfig: normalized.loyaltyConfig,
            loyaltyCustomers: normalized.loyaltyCustomers,
            quotations: normalized.quotations,
            updatedAt: normalized.updatedAt,
          }),
          { merge: true }
        ),
        2000
      ),
    ]);
    return normalized;
  } catch (error) {
    if (isQuotaOrNetworkError(error) || String(error).includes('timed out')) {
      console.warn('POS finance saved in local cache & hub; cloud sync deferred:', error);
      return normalized;
    }
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
  if (delta >= 0) {
    nextMap[targetWhId] = Math.max(0, Math.round(currentInTarget + delta));
  } else {
    let remainingToDeduct = Math.abs(Math.round(delta));
    const deductFromTarget = Math.min(Math.max(0, currentInTarget), remainingToDeduct);
    nextMap[targetWhId] = Math.max(0, currentInTarget - deductFromTarget);
    remainingToDeduct -= deductFromTarget;

    // If the target warehouse did not have enough units to cover the full deduction,
    // deduct the remaining shortfall from other warehouses that have stock > 0
    if (remainingToDeduct > 0) {
      for (const k of Object.keys(nextMap)) {
        if (k === targetWhId || remainingToDeduct <= 0) continue;
        const avail = Math.max(0, Math.round(Number(nextMap[k]) || 0));
        if (avail > 0) {
          const deduct = Math.min(avail, remainingToDeduct);
          nextMap[k] = avail - deduct;
          remainingToDeduct -= deduct;
        }
      }
    }
  }

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
        movementType:
          t.movementType === 'entry' || t.movementType === 'adjustment'
            ? t.movementType
            : 'transfer',
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
              quantity: Math.max(0, Number(it.quantity) || 0),
              previousStock: it.previousStock !== undefined ? Number(it.previousStock) : undefined,
              newStock: it.newStock !== undefined ? Number(it.newStock) : undefined,
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
  const cached = getCachedStoreWarehouses(slug);
  const hubSync = await syncCollectionsWithBackendHub({ warehouses: cached }, slug);
  if (isFirestoreQuotaExhausted()) {
    if (hubSync?.warehouses) {
      setCachedStoreWarehouses(hubSync.warehouses, slug);
      return hubSync.warehouses;
    }
    return cached;
  }
  try {
    const docRef = doc(db, 'settings', getWarehousesDocId(slug));
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const parsed = sanitizeWarehousesDoc(slug, snap.data());
      setCachedStoreWarehouses(parsed, slug);
      syncCollectionsWithBackendHub({ warehouses: parsed }, slug).catch(() => {});
      return parsed;
    }
    if (hubSync?.warehouses) {
      setCachedStoreWarehouses(hubSync.warehouses, slug);
      return hubSync.warehouses;
    }
    return cached;
  } catch (error) {
    isQuotaOrNetworkError(error);
    if (hubSync?.warehouses) {
      setCachedStoreWarehouses(hubSync.warehouses, slug);
      return hubSync.warehouses;
    }
    return cached;
  }
}

export function subscribeToStoreWarehouses(
  onData: (data: StoreWarehousesData) => void,
  companyId = getActiveCompanyId()
): () => void {
  const slug = normalizeCompanySlug(companyId);
  if (isFirestoreQuotaExhausted()) {
    return () => {};
  }
  try {
    const docRef = doc(db, 'settings', getWarehousesDocId(slug));
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const parsed = sanitizeWarehousesDoc(slug, snap.data());
          setCachedStoreWarehouses(parsed, slug);
          syncCollectionsWithBackendHub({ warehouses: parsed }, slug).catch(() => {});
          onData(parsed);
        } else {
          onData(getCachedStoreWarehouses(slug));
        }
      },
      (err) => {
        isQuotaOrNetworkError(err);
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

  setCachedStoreWarehouses(normalized, slug);
  syncCollectionsWithBackendHub({ warehouses: normalized }, slug).catch(() => {});

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
    return normalized;
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Store warehouses saved in local cache; cloud sync deferred:', error);
      return normalized;
    }
    handleFirestoreError(error, OperationType.WRITE, `settings/${getWarehousesDocId(slug)}`);
  }
}

export interface UniversalLoginResolution {
  matched: boolean;
  type?: 'admin' | 'collaborator';
  companySlug?: string;
  companyName?: string;
  logoUrl?: string;
  companyObj?: CompanyTenant;
  collaborator?: UserAccount;
}

/**
 * Universal multi-tenant login resolver:
 * Given a password (and optional collaborator username + optional URL company hint),
 * identifies which client store or collaborator is logging in across all registered tenants
 * in memory and Firestore, without exposing any store list on the login screen.
 */
export async function verifyAdminPinViaFirestore(
  companyId: string,
  candidatePin: string
): Promise<boolean> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId || 'gosen');
  const cleanPin = String(candidatePin || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u202F]/g, '')
    .normalize('NFC')
    .trim();
  if (!cleanPin) return false;

  const isRealSecretValue = (val: unknown): boolean => {
    const s = String(val || '').trim();
    return Boolean(s && s !== HASHED_PASSWORD_MASK && s !== '••••••••');
  };

  const cachedComp = (getCachedCompanies() || []).find(
    (c) => normalizeCompanySlug(c.slug) === slug
  );
  const cachedSettings = getCachedStoreSettings(slug);
  if (
    isRealSecretValue(cachedComp?.adminPassword) &&
    (await verifyPasswordClient(cleanPin, cachedComp!.adminPassword))
  ) {
    return true;
  }
  if (
    isRealSecretValue(cachedSettings?.accessPassword) &&
    (await verifyPasswordClient(cleanPin, cachedSettings!.accessPassword))
  ) {
    return true;
  }

  if (!isFirestoreQuotaExhausted()) {
    try {
      const [compSnap, settingsSnap, usersSnap] = await Promise.all([
        withFirestoreTimeout(getDoc(doc(db, 'companies', slug)), 5000).catch(() => null),
        withFirestoreTimeout(getDoc(doc(db, 'settings', getStoreProfileDocId(slug))), 5000).catch(
          () => null
        ),
        withFirestoreTimeout(getDocs(collection(db, 'users')), 5000).catch(() => null),
      ]);

      const rawCompPass = compSnap?.exists() ? compSnap.data()?.adminPassword : undefined;
      const rawSettingsPass = settingsSnap?.exists() ? settingsSnap.data()?.accessPassword : undefined;
      const compPass = isRealSecretValue(rawCompPass) ? rawCompPass : undefined;
      const settingsPass = isRealSecretValue(rawSettingsPass) ? rawSettingsPass : undefined;

      if (compPass && (await verifyPasswordClient(cleanPin, compPass))) return true;
      if (settingsPass && (await verifyPasswordClient(cleanPin, settingsPass))) return true;

      if (!compPass && !settingsPass) {
        const up = cleanPin.toUpperCase();
        if (slug === 'tiendagyg' && up === 'GYG2026') return true;
        if (slug === 'gosen' && (up === 'GOSEN2026' || up === 'ADMIN2026')) return true;
      }

      if (usersSnap) {
        for (const uDoc of usersSnap.docs) {
          const d = uDoc.data();
          const uSlug = isGyGAlias(d.companyId || uDoc.id)
            ? 'tiendagyg'
            : normalizeCompanySlug(d.companyId || 'gosen');
          if (
            uSlug === slug &&
            d.role === 'admin' &&
            d.isActive !== false &&
            (await verifyPasswordClient(cleanPin, d.password))
          ) {
            return true;
          }
        }
      }
    } catch (err) {
      isQuotaOrNetworkError(err);
    }
  }

  const cachedUsers = getCachedUsers(slug) || [];
  for (const u of cachedUsers) {
    if (u.role === 'admin' && u.isActive !== false && (await verifyPasswordClient(cleanPin, u.password))) {
      return true;
    }
  }
  return false;
}

export async function resolveClientLoginAcrossAllTenants(params: {
  passwordInput: string;
  usernameInput?: string;
  mode: 'store_pass' | 'collaborator';
  preferredSlug?: string;
  companiesInMemory: CompanyTenant[];
  usersInMemory: UserAccount[];
  activeStoreSettings?: StoreSettings;
}): Promise<UniversalLoginResolution> {
  const cleanPass = String(params.passwordInput || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u202F]/g, '')
    .normalize('NFC')
    .trim();
  const upperPass = cleanPass.toUpperCase();
  const cleanUser = String(params.usernameInput || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u202F]/g, '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/\s+/g, ' ');
  const hasUrlEmpresa =
    typeof window !== 'undefined' &&
    Boolean(
      new URLSearchParams(window.location.search).get('empresa') ||
        new URLSearchParams(window.location.search).get('tienda') ||
        new URLSearchParams(window.location.search).get('cliente')
    );
  const preferred =
    hasUrlEmpresa && params.preferredSlug
      ? isGyGAlias(params.preferredSlug)
        ? 'tiendagyg'
        : normalizeCompanySlug(params.preferredSlug)
      : '';

  // Map of Firestore store_profile passwords (slug -> accessPassword) collected from Firestore
  const firestoreSettingsMap = new Map<string, Partial<StoreSettings>>();

  const verifyCompanyMatch = async (comp: CompanyTenant): Promise<boolean> => {
    const slug = normalizeCompanySlug(comp.slug);
    const fsSettings = firestoreSettingsMap.get(slug);
    const cachedSettings = getCachedStoreSettings(slug);
    const compPass = String(comp.adminPassword || '').trim();
    const settingsPass = String(
      fsSettings?.accessPassword || cachedSettings?.accessPassword || ''
    ).trim();

    if (compPass && (await verifyPasswordClient(cleanPass, compPass))) {
      return true;
    }
    if (settingsPass && (await verifyPasswordClient(cleanPass, settingsPass))) {
      return true;
    }

    const hasRealStoredPass =
      (compPass && !isMaskedOrHashedPassword(compPass)) ||
      isHashedPasswordPrefix(compPass) ||
      (settingsPass && !isMaskedOrHashedPassword(settingsPass)) ||
      isHashedPasswordPrefix(settingsPass);

    if (!hasRealStoredPass) {
      if (slug === 'tiendagyg' && upperPass === 'GYG2026') return true;
      if (slug === 'gosen' && (upperPass === 'GOSEN2026' || upperPass === 'ADMIN2026')) {
        return true;
      }
    }
    return false;
  };

  const isHashedPasswordPrefix = (val: string) => val.startsWith('scrypt$');

  const matchCompanyFromList = async (
    list: CompanyTenant[]
  ): Promise<CompanyTenant | undefined> => {
    if (preferred) {
      const prefComp = list.find((c) => normalizeCompanySlug(c.slug) === preferred);
      if (prefComp && (await verifyCompanyMatch(prefComp))) {
        return prefComp;
      }
    }

    for (const comp of list) {
      const slug = normalizeCompanySlug(comp.slug);
      if (slug === 'gosen') continue;
      if (await verifyCompanyMatch(comp)) return comp;
    }

    const gosenComp = list.find((c) => normalizeCompanySlug(c.slug) === 'gosen');
    if (gosenComp && (await verifyCompanyMatch(gosenComp))) {
      return gosenComp;
    }

    return undefined;
  };

  const findCollabInList = async (
    userList: UserAccount[]
  ): Promise<UserAccount | undefined> => {
    const userNameMatches = (u: UserAccount): boolean => {
      if (u.isActive === false) return false;
      if (!cleanUser) return true;
      const uName = (u.username || '').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, ' ');
      const fullName = (u.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
      return uName === cleanUser || fullName === cleanUser;
    };

    const matchingCandidates = userList.filter(userNameMatches);
    const ordered: UserAccount[] = [];
    if (preferred) {
      ordered.push(
        ...matchingCandidates.filter(
          (u) =>
            (isGyGAlias(u.companyId) ? 'tiendagyg' : normalizeCompanySlug(u.companyId || 'gosen')) ===
            preferred
        )
      );
    }
    ordered.push(
      ...matchingCandidates.filter(
        (u) =>
          (isGyGAlias(u.companyId) ? 'tiendagyg' : normalizeCompanySlug(u.companyId || 'gosen')) !==
          'gosen'
      )
    );
    ordered.push(...matchingCandidates);

    const seenIds = new Set<string>();
    for (const u of ordered) {
      if (seenIds.has(u.id)) continue;
      seenIds.add(u.id);
      if (await verifyPasswordClient(cleanPass, u.password)) {
        return u;
      }
    }
    return undefined;
  };

  const loadLiveFirestoreAuthState = async (): Promise<{
    companies: CompanyTenant[];
    users: UserAccount[];
  }> => {
    const compMap = new Map<string, CompanyTenant>();
    compMap.set('gosen', { ...DEFAULT_GOSEN_COMPANY });

    for (const c of [...(getCachedCompanies() || []), ...(params.companiesInMemory || [])]) {
      if (c && (c.slug || c.id)) {
        const s = normalizeCompanySlug(c.slug || c.id);
        compMap.set(s, sanitizeCompanyDoc(s, c));
      }
    }

    const userMap = new Map<string, UserAccount>();
    for (const u of [...params.usersInMemory, ...getAllLocallyCachedUsersAcrossAllTenants()]) {
      if (u && u.id) userMap.set(u.id, u);
    }

    if (!isFirestoreQuotaExhausted()) {
      try {
        const [compSnap, settingsSnap, usersSnap] = await Promise.all([
          withFirestoreTimeout(getDocs(collection(db, 'companies')), 6000).catch(() => null),
          withFirestoreTimeout(getDocs(collection(db, 'settings')), 6000).catch(() => null),
          withFirestoreTimeout(getDocs(collection(db, 'users')), 6000).catch(() => null),
        ]);

        if (compSnap) {
          compSnap.forEach((docSnap) => {
            const d = docSnap.data();
            const slug = normalizeCompanySlug(d.slug || docSnap.id);
            compMap.set(slug, sanitizeCompanyDoc(slug, d));
          });
        }

        if (settingsSnap) {
          settingsSnap.forEach((docSnap) => {
            if (!docSnap.id.startsWith('store_profile')) return;
            const d = docSnap.data();
            const slug = normalizeCompanySlug(
              d.companyId || docSnap.id.replace(/^store_profile_?/, '') || 'gosen'
            );
            firestoreSettingsMap.set(slug, {
              companyId: slug,
              storeName: d.storeName,
              logoUrl: d.logoUrl,
              accessPassword: d.accessPassword,
              tagline: d.tagline,
              address: d.address,
              phone: d.phone,
            });
            if (!compMap.has(slug)) {
              compMap.set(slug, {
                id: slug,
                name: d.storeName || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
                slug,
                ownerName: 'Administrador',
                phone: d.phone || '',
                plan: 'mensual',
                price: 0,
                nextBillingDate: '',
                status: 'active',
                adminPassword: d.accessPassword || '',
                logoUrl: d.logoUrl || '',
                tagline: d.tagline || '',
                address: d.address || '',
                allowedModules: d.allowedModules || [...ALL_COMPANY_MODULES],
                createdAt: Date.now(),
              });
            }
          });
        }

        if (usersSnap) {
          usersSnap.forEach((docSnap) => {
            const d = docSnap.data();
            const cSlug = isGyGAlias(d.companyId || docSnap.id)
              ? 'tiendagyg'
              : normalizeCompanySlug(d.companyId || 'gosen');
            const sanitized = sanitizeUserAccountDoc(d, cSlug, docSnap.id);
            userMap.set(sanitized.id, sanitized);
          });
        }
      } catch (err) {
        isQuotaOrNetworkError(err);
      }
    }

    return {
      companies: Array.from(compMap.values()),
      users: Array.from(userMap.values()),
    };
  };

  const { companies: allCompanies, users: allUsers } = await loadLiveFirestoreAuthState();

  // --- A. COLLABORATOR MODE ---
  if (params.mode === 'collaborator') {
    const foundUser = await findCollabInList(allUsers);
    if (foundUser) {
      const targetSlug = isGyGAlias(foundUser.companyId || foundUser.id)
        ? 'tiendagyg'
        : normalizeCompanySlug(foundUser.companyId || 'gosen');
      const compObj = allCompanies.find((c) => normalizeCompanySlug(c.slug) === targetSlug);
      const fsSettings = firestoreSettingsMap.get(targetSlug);
      const cachedTargetSettings = getCachedStoreSettings(targetSlug);
      const companyName =
        compObj?.name ||
        fsSettings?.storeName ||
        cachedTargetSettings?.storeName ||
        (targetSlug === 'tiendagyg'
          ? 'COMERCIAL GYG'
          : targetSlug === 'gosen'
          ? 'Tienda Gosén'
          : targetSlug.toUpperCase());
      return {
        matched: true,
        type: 'collaborator',
        companySlug: targetSlug,
        companyName,
        logoUrl: compObj?.logoUrl || fsSettings?.logoUrl || cachedTargetSettings?.logoUrl,
        companyObj: compObj,
        collaborator: foundUser,
      };
    }

    const matchedStoreForCollab = await matchCompanyFromList(allCompanies);
    if (matchedStoreForCollab) {
      const targetSlug = normalizeCompanySlug(matchedStoreForCollab.slug);
      const fsSettings = firestoreSettingsMap.get(targetSlug);
      const cachedTargetSettings = getCachedStoreSettings(targetSlug);
      const companyName =
        matchedStoreForCollab.name ||
        fsSettings?.storeName ||
        cachedTargetSettings?.storeName ||
        (targetSlug === 'tiendagyg' ? 'COMERCIAL GYG' : targetSlug.toUpperCase());
      const displayCollabName = cleanUser
        ? cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1)
        : 'Colaborador';
      const fallbackCollab: UserAccount = {
        id: `${targetSlug}__collab_${cleanUser || 'cajero'}`,
        companyId: targetSlug,
        name: displayCollabName,
        username: cleanUser || 'colaborador',
        password: HASHED_PASSWORD_MASK,
        role: 'collaborator',
        isActive: true,
        allowedTabs: ['sales', 'inventory', 'price-checker', 'catalog'],
        salesPermissions: {
          canEditSales: true,
          canCancelSales: false,
          canViewCostsAndProfits: false,
          canUseCreditCalculator: false,
          canViewPriceCheckerCost: false,
        },
        createdAt: Date.now(),
      };
      return {
        matched: true,
        type: 'collaborator',
        companySlug: targetSlug,
        companyName,
        logoUrl: matchedStoreForCollab.logoUrl || fsSettings?.logoUrl || cachedTargetSettings?.logoUrl,
        companyObj: matchedStoreForCollab,
        collaborator: fallbackCollab,
      };
    }

    return { matched: false };
  }

  // --- B. DIRECT STORE PASSWORD MODE ---
  const matchedComp = await matchCompanyFromList(allCompanies);
  if (matchedComp) {
    const targetSlug = normalizeCompanySlug(matchedComp.slug);
    const fsSettings = firestoreSettingsMap.get(targetSlug);
    const cachedTargetSettings = getCachedStoreSettings(targetSlug);
    const targetName =
      matchedComp.name ||
      fsSettings?.storeName ||
      cachedTargetSettings?.storeName ||
      (targetSlug === 'gosen'
        ? params.activeStoreSettings?.storeName || 'Tienda Gosén'
        : targetSlug.toUpperCase());
    const targetLogo =
      matchedComp.logoUrl ||
      fsSettings?.logoUrl ||
      cachedTargetSettings?.logoUrl ||
      (targetSlug === 'gosen' ? params.activeStoreSettings?.logoUrl || '/store-logo.jpg' : '');
    return {
      matched: true,
      type: 'admin',
      companySlug: targetSlug,
      companyName: targetName,
      logoUrl: targetLogo,
      companyObj: matchedComp,
    };
  }

  // Fallback: check if entered password directly matches an active collaborator
  const matchedCollab = await findCollabInList(allUsers);
  if (matchedCollab) {
    const targetSlug = isGyGAlias(matchedCollab.companyId || matchedCollab.id)
      ? 'tiendagyg'
      : normalizeCompanySlug(matchedCollab.companyId || 'gosen');
    const compObj = allCompanies.find((c) => normalizeCompanySlug(c.slug) === targetSlug);
    const fsSettings = firestoreSettingsMap.get(targetSlug);
    const cachedTargetSettings = getCachedStoreSettings(targetSlug);
    const companyName =
      compObj?.name ||
      fsSettings?.storeName ||
      cachedTargetSettings?.storeName ||
      (targetSlug === 'tiendagyg'
        ? 'COMERCIAL GYG'
        : targetSlug === 'gosen'
        ? 'Tienda Gosén'
        : targetSlug.toUpperCase());
    return {
      matched: true,
      type: 'collaborator',
      companySlug: targetSlug,
      companyName,
      logoUrl: compObj?.logoUrl || fsSettings?.logoUrl || cachedTargetSettings?.logoUrl,
      companyObj: compObj,
      collaborator: matchedCollab,
    };
  }

  return { matched: false };
}

// ----------------- RESTAURANT TABLES, ORDERS & KITCHEN COMANDERA -----------------

const RESTAURANT_CACHE_BASE = 'stockmaster_restaurant_v1';

export function getDefaultRestaurantZones(): string[] {
  return ['Salón Principal', 'Terraza', 'Barra', 'VIP'];
}

export function getDefaultRestaurantTables(): RestaurantTable[] {
  return [
    { id: 'mesa_1', number: '1', name: 'Mesa 1', zone: 'Salón Principal', capacity: 4, shape: 'square', status: 'available', isActive: true },
    { id: 'mesa_2', number: '2', name: 'Mesa 2', zone: 'Salón Principal', capacity: 4, shape: 'square', status: 'available', isActive: true },
    { id: 'mesa_3', number: '3', name: 'Mesa 3', zone: 'Salón Principal', capacity: 6, shape: 'rect', status: 'available', isActive: true },
    { id: 'mesa_4', number: '4', name: 'Mesa 4', zone: 'Salón Principal', capacity: 2, shape: 'round', status: 'available', isActive: true },
    { id: 'mesa_5', number: '5', name: 'Terraza 1', zone: 'Terraza', capacity: 4, shape: 'round', status: 'available', isActive: true },
    { id: 'mesa_6', number: '6', name: 'Terraza 2', zone: 'Terraza', capacity: 6, shape: 'rect', status: 'available', isActive: true },
    { id: 'barra_1', number: 'B1', name: 'Barra 1', zone: 'Barra', capacity: 2, shape: 'round', status: 'available', isActive: true },
    { id: 'vip_1', number: 'V1', name: 'Mesa VIP 1', zone: 'VIP', capacity: 8, shape: 'rect', status: 'available', isActive: true },
  ];
}

function getRestaurantDocId(companyId = getActiveCompanyId()): string {
  const slug = normalizeCompanySlug(companyId);
  return slug === 'gosen' ? 'restaurant_gosen' : `restaurant_${slug}`;
}

export function getCachedRestaurantData(companyId = getActiveCompanyId()): RestaurantStoreData {
  const slug = normalizeCompanySlug(companyId);
  const cached = safeReadCache<RestaurantStoreData>(getScopedCacheKey(RESTAURANT_CACHE_BASE, slug));
  if (cached && Array.isArray(cached.tables)) {
    return sanitizeRestaurantDoc(slug, cached);
  }
  return {
    companyId: slug,
    zones: getDefaultRestaurantZones(),
    tables: getDefaultRestaurantTables(),
    orders: [],
    kitchenTickets: [],
    orderSequence: 1,
    ticketSequence: 1,
    updatedAt: 0,
  };
}

export function setCachedRestaurantData(
  data: RestaurantStoreData,
  companyId = getActiveCompanyId()
): void {
  const slug = normalizeCompanySlug(companyId);
  safeWriteCache(getScopedCacheKey(RESTAURANT_CACHE_BASE, slug), data);
}

function sanitizeRestaurantDoc(slug: string, raw: Record<string, any>): RestaurantStoreData {
  const zones: string[] =
    Array.isArray(raw.zones) && raw.zones.length > 0
      ? Array.from(new Set(raw.zones.map((z: any) => String(z || '').trim()).filter(Boolean)))
      : getDefaultRestaurantZones();

  const validTableStatuses: RestaurantTableStatus[] = [
    'available',
    'occupied',
    'kitchen',
    'ready',
    'bill_requested',
  ];
  const validShapes: RestaurantTableShape[] = ['square', 'round', 'rect'];

  const tables: RestaurantTable[] = Array.isArray(raw.tables)
    ? raw.tables.map((t: any, idx: number) => ({
        id: String(t.id || `mesa_${idx + 1}`),
        number: String(t.number || idx + 1),
        name: String(t.name || `Mesa ${t.number || idx + 1}`),
        zone: String(t.zone || zones[0] || 'Salón Principal'),
        capacity: Math.max(1, Number(t.capacity) || 4),
        shape: validShapes.includes(t.shape) ? t.shape : 'square',
        status: validTableStatuses.includes(t.status) ? t.status : 'available',
        currentOrderId: t.currentOrderId ? String(t.currentOrderId) : undefined,
        isActive: t.isActive !== false,
      }))
    : getDefaultRestaurantTables();

  const validOrderTypes: RestaurantOrderType[] = ['dine_in', 'takeout', 'delivery'];

  const orders: RestaurantTableOrder[] = Array.isArray(raw.orders)
    ? raw.orders.map((o: any) => ({
        id: String(o.id || `rord_${Date.now()}`),
        companyId: slug,
        orderNumber: String(o.orderNumber || 'ORD-0001'),
        tableId: o.tableId ? String(o.tableId) : undefined,
        tableName: String(o.tableName || 'Para Llevar'),
        zone: o.zone ? String(o.zone) : undefined,
        orderType: validOrderTypes.includes(o.orderType) ? o.orderType : 'dine_in',
        guests: Math.max(1, Number(o.guests) || 1),
        waiterName: String(o.waiterName || 'Mesero'),
        customerName: o.customerName ? String(o.customerName) : undefined,
        customerPhone: o.customerPhone ? String(o.customerPhone) : undefined,
        deliveryAddress: o.deliveryAddress ? String(o.deliveryAddress) : undefined,
        notes: o.notes ? String(o.notes) : undefined,
        items: Array.isArray(o.items)
          ? o.items.map((it: any, idx: number): RestaurantOrderItem => ({
              id: String(it.id || `ritem_${idx}_${Date.now()}`),
              productId: String(it.productId || it.code || ''),
              code: String(it.code || ''),
              name: String(it.name || 'Platillo'),
              category: it.category ? String(it.category) : undefined,
              price: Math.max(0, Number(it.price) || 0),
              cost: Math.max(0, Number(it.cost) || 0),
              quantity: Math.max(1, Number(it.quantity) || 1),
              sentToKitchenQty: Math.max(0, Number(it.sentToKitchenQty) || 0),
              notes: it.notes ? String(it.notes) : undefined,
              prepStation:
                it.prepStation === 'barra' || it.prepStation === 'postres'
                  ? it.prepStation
                  : 'cocina',
              addedAt: Number(it.addedAt) || Date.now(),
            }))
          : [],
        discount: Math.max(0, Number(o.discount) || 0),
        tipAmount: Math.max(0, Number(o.tipAmount) || 0),
        status: ['open', 'bill_requested', 'paid', 'cancelled'].includes(o.status)
          ? o.status
          : 'open',
        saleId: o.saleId ? String(o.saleId) : undefined,
        saleNumber: o.saleNumber ? String(o.saleNumber) : undefined,
        createdAt: Number(o.createdAt) || Date.now(),
        updatedAt: Number(o.updatedAt) || Date.now(),
        paidAt: o.paidAt ? Number(o.paidAt) : undefined,
      }))
    : [];

  const validCmdStatus: KitchenCommandStatus[] = [
    'pending',
    'preparing',
    'ready',
    'delivered',
    'cancelled',
  ];

  const kitchenTickets: KitchenCommandTicket[] = Array.isArray(raw.kitchenTickets)
    ? raw.kitchenTickets.map((kt: any) => ({
        id: String(kt.id || `kcmd_${Date.now()}`),
        companyId: slug,
        ticketNumber: String(kt.ticketNumber || 'COM-0001'),
        orderId: String(kt.orderId || ''),
        orderNumber: String(kt.orderNumber || 'ORD-0001'),
        tableId: kt.tableId ? String(kt.tableId) : undefined,
        tableName: String(kt.tableName || 'Para Llevar'),
        zone: kt.zone ? String(kt.zone) : undefined,
        orderType: validOrderTypes.includes(kt.orderType) ? kt.orderType : 'dine_in',
        waiterName: String(kt.waiterName || 'Mesero'),
        guests: Math.max(1, Number(kt.guests) || 1),
        items: Array.isArray(kt.items)
          ? kt.items.map((it: any, idx: number): KitchenCommandItem => ({
              id: String(it.id || `kitem_${idx}_${Date.now()}`),
              productId: String(it.productId || it.code || ''),
              code: String(it.code || ''),
              name: String(it.name || 'Platillo'),
              category: it.category ? String(it.category) : undefined,
              quantity: Math.max(1, Number(it.quantity) || 1),
              notes: it.notes ? String(it.notes) : undefined,
              prepStation:
                it.prepStation === 'barra' || it.prepStation === 'postres'
                  ? it.prepStation
                  : 'cocina',
            }))
          : [],
        orderNotes: kt.orderNotes ? String(kt.orderNotes) : undefined,
        status: validCmdStatus.includes(kt.status) ? kt.status : 'pending',
        createdAt: Number(kt.createdAt) || Date.now(),
        startedAt: kt.startedAt ? Number(kt.startedAt) : undefined,
        readyAt: kt.readyAt ? Number(kt.readyAt) : undefined,
        deliveredAt: kt.deliveredAt ? Number(kt.deliveredAt) : undefined,
      }))
    : [];

  return {
    companyId: slug,
    zones,
    tables,
    orders: orders.sort((a, b) => b.createdAt - a.createdAt),
    kitchenTickets: kitchenTickets.sort((a, b) => b.createdAt - a.createdAt),
    orderSequence: Math.max(1, Number(raw.orderSequence) || orders.length + 1),
    ticketSequence: Math.max(1, Number(raw.ticketSequence) || kitchenTickets.length + 1),
    updatedAt: Number(raw.updatedAt) || 0,
  };
}

function mergeRestaurantObjects(
  slug: string,
  a?: RestaurantStoreData | null,
  b?: RestaurantStoreData | null
): RestaurantStoreData {
  if (!a && !b) return getCachedRestaurantData(slug);
  if (!a) return sanitizeRestaurantDoc(slug, b as Record<string, any>);
  if (!b) return sanitizeRestaurantDoc(slug, a as Record<string, any>);
  const aTs = Number(a.updatedAt || 0);
  const bTs = Number(b.updatedAt || 0);
  const primary = bTs >= aTs ? b : a;
  return sanitizeRestaurantDoc(slug, {
    ...primary,
    companyId: slug,
    updatedAt: Math.max(aTs, bTs),
  });
}

export async function fetchRestaurantDataOnce(
  companyId = getActiveCompanyId()
): Promise<RestaurantStoreData> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedRestaurantData(slug);
  const hubSync = await syncCollectionsWithBackendHub(
    cached && cached.updatedAt > 0 ? { restaurant: cached } : {},
    slug
  );
  const hubRest = hubSync?.restaurant
    ? sanitizeRestaurantDoc(slug, hubSync.restaurant)
    : null;

  if (isFirestoreQuotaExhausted()) {
    const merged = mergeRestaurantObjects(slug, cached, hubRest);
    setCachedRestaurantData(merged, slug);
    return merged;
  }

  try {
    const docRef = doc(db, 'settings', getRestaurantDocId(slug));
    const snap = await withFirestoreTimeout(getDoc(docRef), 2000);
    if (snap.exists()) {
      const parsed = sanitizeRestaurantDoc(slug, snap.data());
      const merged = mergeRestaurantObjects(
        slug,
        mergeRestaurantObjects(slug, cached, hubRest),
        parsed
      );
      setCachedRestaurantData(merged, slug);
      syncCollectionsWithBackendHub({ restaurant: merged }, slug).catch(() => {});
      return merged;
    }
    const merged = mergeRestaurantObjects(slug, cached, hubRest);
    setCachedRestaurantData(merged, slug);
    return merged;
  } catch (err) {
    isQuotaOrNetworkError(err);
    const merged = mergeRestaurantObjects(slug, cached, hubRest);
    setCachedRestaurantData(merged, slug);
    return merged;
  }
}

export function subscribeToRestaurantData(
  onData: (data: RestaurantStoreData) => void,
  companyId = getActiveCompanyId()
): () => void {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  if (isFirestoreQuotaExhausted()) {
    fetchRestaurantDataOnce(slug).then(onData).catch(() => {});
    return () => {};
  }
  try {
    const docRef = doc(db, 'settings', getRestaurantDocId(slug));
    return onSnapshot(
      docRef,
      (snap) => {
        if (snap.exists()) {
          const parsed = sanitizeRestaurantDoc(slug, snap.data());
          const cached = getCachedRestaurantData(slug);
          const merged = mergeRestaurantObjects(slug, cached, parsed);
          setCachedRestaurantData(merged, slug);
          syncCollectionsWithBackendHub({ restaurant: merged }, slug).catch(() => {});
          onData(merged);
        } else {
          fetchRestaurantDataOnce(slug).then(onData).catch(() => {});
        }
      },
      (err) => {
        isQuotaOrNetworkError(err);
        console.warn('Restaurant listener warning:', err);
        fetchRestaurantDataOnce(slug).then(onData).catch(() => {});
      }
    );
  } catch {
    return () => {};
  }
}

export async function saveRestaurantDataToFirestore(
  data: RestaurantStoreData,
  companyId = getActiveCompanyId()
): Promise<RestaurantStoreData> {
  const slug = isGyGAlias(data.companyId || companyId)
    ? 'tiendagyg'
    : normalizeCompanySlug(data.companyId || companyId);
  const docRef = doc(db, 'settings', getRestaurantDocId(slug));

  const normalized: RestaurantStoreData = {
    companyId: slug,
    zones:
      Array.isArray(data.zones) && data.zones.length > 0
        ? data.zones
        : getDefaultRestaurantZones(),
    tables: Array.isArray(data.tables) ? data.tables.slice(0, 150) : [],
    orders: Array.isArray(data.orders) ? data.orders.slice(0, 250) : [],
    kitchenTickets: Array.isArray(data.kitchenTickets)
      ? data.kitchenTickets.slice(0, 250)
      : [],
    orderSequence: Math.max(1, Number(data.orderSequence) || 1),
    ticketSequence: Math.max(1, Number(data.ticketSequence) || 1),
    updatedAt: Date.now(),
  };

  setCachedRestaurantData(normalized, slug);
  syncCollectionsWithBackendHub({ restaurant: normalized }, slug).catch(() => {});

  if (isFirestoreQuotaExhausted()) {
    return normalized;
  }

  try {
    await withFirestoreTimeout(
      setDoc(
        docRef,
        stripUndefinedDeep({
          storeName: `Restaurante ${slug}`.slice(0, 190),
          companyId: slug,
          zones: normalized.zones,
          tables: normalized.tables,
          orders: normalized.orders,
          kitchenTickets: normalized.kitchenTickets,
          orderSequence: normalized.orderSequence,
          ticketSequence: normalized.ticketSequence,
          updatedAt: normalized.updatedAt,
        }),
        { merge: true }
      ),
      2000
    );
    return normalized;
  } catch (error) {
    if (isQuotaOrNetworkError(error) || String(error).includes('timed out')) {
      console.warn('Restaurant data saved in local cache & hub; cloud sync deferred:', error);
      return normalized;
    }
    handleFirestoreError(error, OperationType.WRITE, `settings/${getRestaurantDocId(slug)}`);
  }
}




