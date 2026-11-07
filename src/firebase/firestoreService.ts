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

let firestoreReadQuotaExhaustedUntil = 0;

export function isFirestoreQuotaExhausted(): boolean {
  return Date.now() < firestoreReadQuotaExhaustedUntil;
}

export function markFirestoreQuotaExhausted(): void {
  firestoreReadQuotaExhaustedUntil = Date.now() + 10 * 60 * 1000;
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
    msg.includes('failed to get document')
  );
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

// In-memory cache & image map so large catalogs (e.g. 6.2MB of base64 photos in Comercial GYG)
// never lose images or lag when localStorage hits its 5MB browser quota.
const memoryInventoryCache = new Map<string, Product[]>();
const memoryImageMap = new Map<string, string>();

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
            if (bestImg) {
              memoryImageMap.set(`${slug}__${cleanK}`, bestImg);
            }
            if (unsyncedLookup.has(cleanK)) {
              mergedUpserts[cleanK] = {
                ...(existingUpsert || {}),
                ...v,
                img: bestImg,
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
            if (p.img) {
              memoryImageMap.set(`${slug}__${(p.code || '').trim().toLowerCase()}`, p.img);
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
      localStorage.removeItem(getScopedCacheKey(BASE_CACHE_KEYS.INVENTORY, slug));
      localStorage.removeItem(getScopedCacheKey(BASE_CACHE_KEYS.SALES, slug));
      safeWriteCache(tombstoneKey, tombstonePayload);
    } catch {}
  }

  // 2. Persist full mutations (including full images and tombstones) to IndexedDB asynchronously
  saveMutationsToIndexedDB(mutations, slug).catch(() => {});

  // 3. Persist lightweight mutations to localStorage
  const lightUpserts: Record<string, Product> = {};
  for (const [k, v] of Object.entries(mutations.upserts)) {
    if (v.img) {
      memoryImageMap.set(`${slug}__${(v.code || '').trim().toLowerCase()}`, v.img);
    }
    lightUpserts[k] =
      v.img && v.img.startsWith('data:') && v.img.length > 4000
        ? { ...v, img: '' }
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
    const existing = byCode.get(codeKey);
    if (existing) {
      const pickNew =
        scoreCanonicalGyGProduct(item, unsyncedSet) >=
        scoreCanonicalGyGProduct(existing, unsyncedSet);
      const chosen = pickNew ? item : existing;
      const fallbackImg = item.img || existing.img || memImg || '';
      byCode.set(codeKey, {
        ...chosen,
        category: (chosen.category || 'Otros').trim(),
        supplier: (chosen.supplier || '').trim(),
        img: chosen.img || fallbackImg,
      });
    } else {
      byCode.set(codeKey, {
        ...item,
        category: (item.category || 'Otros').trim(),
        supplier: (item.supplier || '').trim(),
        img: item.img || memImg || '',
      });
    }
  }

  let serverRefreshedUpserts = false;
  for (const [codeKey, upserted] of Object.entries(mut.upserts)) {
    if (deletedCodeSet.has(codeKey) || explicitDeletedSet.has(codeKey)) continue;
    const existing = byCode.get(codeKey);
    const memImg = memoryImageMap.get(`${slug}__${codeKey}`);

    // When merging local cache (fromServer === false), mut.upserts wins over stale cache.
    // When merging fresh server items (fromServer === true), mut.upserts ONLY wins if the item
    // does not exist on the server yet or has pending unsynced local changes (unsyncedSet.has(codeKey)).
    // Otherwise, the fresh Firestore server document is authoritative and refreshes mut.upserts!
    const preferUpsert = !fromServer || !existing || unsyncedSet.has(codeKey);

    if (!preferUpsert && existing) {
      const mergedServerItem: Product = {
        ...existing,
        img: existing.img || upserted.img || memImg || '',
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
    if (p.img) {
      memoryImageMap.set(`${slug}__${(p.code || '').trim().toLowerCase()}`, p.img);
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
    totalImgChars += (merged[i].img || '').length;
  }

  const shouldStripLargeDataUrls = totalImgChars > 1_200_000;
  const lsPayload = shouldStripLargeDataUrls
    ? merged.map((p) =>
        p.img && p.img.startsWith('data:') && p.img.length > 4000
          ? { ...p, img: '' }
          : p
      )
    : merged;

  if (!safeWriteCache(cacheKey, lsPayload)) {
    const ultraLight = merged.map((p) =>
      p.img && p.img.startsWith('data:') ? { ...p, img: '' } : p
    );
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
        'tienda-gyg',
        'tienda_gyg',
        'comercial gyg',
        'Comercial GYG',
        'Comercial GyG',
        'COMERCIAL GYG',
        'Tienda GYG',
        'Tienda GyG',
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

    items.push({
      id: docSnap.id,
      companyId: data.companyId || slug,
      code,
      name: (data.name || '').trim(),
      category: (data.category || 'Otros').trim(),
      size: (data.size || '').trim(),
      supplier: (data.supplier || '').trim(),
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

        const payload: Record<string, any> = {
          companyId: slug,
          code: cleanCode,
          name: product.name.trim(),
          category: (product.category || 'Otros').trim(),
          cost: Math.max(0, Number(product.cost) || 0),
          price: Math.max(0, Number(product.price) || 0),
          discount: Math.max(0, Number(product.discount) || 0),
          discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
          discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
          stock: Math.max(0, Math.round(Number(product.stock) || 0)),
        };
        if (product.size?.trim()) payload.size = product.size.trim();
        if (product.supplier?.trim()) payload.supplier = product.supplier.trim();
        if (safeImg) payload.img = safeImg;
        if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
          payload.warehouseStocks = product.warehouseStocks;
        }

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
  if (typeof window === 'undefined') return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  try {
    const res = await fetch(`/api/cloud-sync/status?companyId=${encodeURIComponent(slug)}`);
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
  if (typeof window === 'undefined') return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const mut = getPendingMutations(slug);

  // Hydrate any cached memory images before sending to the backend hub
  const enrichedItems = (localItems || []).map((p) => {
    const codeKey = (p.code || '').trim().toLowerCase();
    const memImg = memoryImageMap.get(`${slug}__${codeKey}`);
    return memImg && !p.img ? { ...p, img: memImg } : p;
  });

  const unsyncedLookup = new Set(
    (mut.unsyncedCodes || []).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );
  const enrichedUpserts: Record<string, Product> = {};
  for (const [k, v] of Object.entries(mut.upserts || {})) {
    const cleanK = k.trim().toLowerCase();
    const memImg = memoryImageMap.get(`${slug}__${cleanK}`);
    if (v?.img) {
      memoryImageMap.set(`${slug}__${cleanK}`, v.img);
    }
    if (unsyncedLookup.has(cleanK)) {
      enrichedUpserts[cleanK] = memImg && !v.img ? { ...v, img: memImg } : v;
    }
  }

  try {
    const res = await fetch('/api/cloud-sync/inventory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

export async function pushProductSaveToBackendHub(
  product?: Product,
  oldCode?: string,
  companyId = getActiveCompanyId(),
  products?: Product[]
): Promise<void> {
  if (typeof window === 'undefined') return;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  try {
    await fetch('/api/cloud-sync/product-save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: slug,
        product,
        products,
        oldCode,
      }),
    });
  } catch {}
}

export async function pushProductDeleteToBackendHub(
  id: string,
  code?: string,
  companyId = getActiveCompanyId()
): Promise<void> {
  if (typeof window === 'undefined') return;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  try {
    await fetch('/api/cloud-sync/product-delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: slug,
        id,
        code,
      }),
    });
  } catch {}
}

export async function syncCollectionsWithBackendHub(
  payload: {
    suppliers?: Supplier[];
    purchases?: PurchaseInvoice[];
    sales?: SaleRecord[];
    users?: UserAccount[];
    warehouses?: StoreWarehousesData;
    settings?: StoreSettings;
    posFinance?: POSFinanceStoreData;
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
  users: UserAccount[];
  warehouses: StoreWarehousesData | null;
  settings: StoreSettings | null;
  posFinance: POSFinanceStoreData | null;
  companies: CompanyTenant[];
  updatedAt: number;
} | null> {
  if (typeof window === 'undefined') return null;
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  try {
    const res = await fetch('/api/cloud-sync/collections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: slug,
        ...payload,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ok) return null;
    return data;
  } catch {
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
      const items = parseInventorySnapshotDocs(snapshot, slug, true);
      setCachedInventory(items, undefined, slug);
      syncInventoryWithBackendHub(items, slug).catch(() => {});
      onData(items);
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
      discount: Math.max(0, Number(product.discount) || 0),
      discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
      discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
      stock: Math.max(0, Math.round(Number(product.stock) || 0)),
      updatedAt: Date.now(),
    };

    if (product.size?.trim()) payload.size = product.size.trim();
    if (product.supplier?.trim()) payload.supplier = product.supplier.trim();
    if (includeImage && product.img?.trim() && product.img.trim().length <= 920_000) {
      payload.img = product.img.trim();
    }
    if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
      payload.warehouseStocks = product.warehouseStocks;
    }
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
          discount: Math.max(0, Number(product.discount) || 0),
          discountType: product.discountType === 'percent' ? 'percent' : 'fixed',
          discountValue: Math.max(0, Number(product.discountValue) || Number(product.discount) || 0),
          stock: Math.max(0, Math.round(Number(product.stock) || 0)),
        };

        if (product.size !== undefined) payload.size = product.size.trim();
        if (product.supplier !== undefined) payload.supplier = product.supplier.trim();
        if (product.img?.trim() && product.img.trim().length <= 920_000) {
          payload.img = product.img.trim();
        }
        if (product.warehouseStocks && typeof product.warehouseStocks === 'object') {
          payload.warehouseStocks = product.warehouseStocks;
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
  const cached = getCachedAuditHistory(slug);
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

  try {
    const snapshot = await getDocs(scopedQuery);
    const records = parseDocs(snapshot);
    setCachedAuditHistory(records, slug);
    return records;
  } catch (error) {
    try {
      const cacheSnap = await getDocsFromCache(scopedQuery);
      if (!cacheSnap.empty) {
        const records = parseDocs(cacheSnap);
        setCachedAuditHistory(records, slug);
        return records;
      }
    } catch {}
    if (cached) return cached;
    return [];
  }
}

export function subscribeToAuditHistory(
  onData: (records: AuditHistoryRecord[]) => void,
  onError?: (err: any) => void,
  companyId = getActiveCompanyId()
) {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
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
      records.sort((a, b) => a.timestamp - b.timestamp);
      setCachedAuditHistory(records, slug);
      onData(records);
    },
    (error) => {
      if (onError) onError(error);
      const cached = getCachedAuditHistory(slug);
      if (cached) onData(cached);
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

export async function fetchStoreSettingsOnce(companyId = getActiveCompanyId()): Promise<StoreSettings> {
  const slug = normalizeCompanySlug(companyId);
  const cached = getCachedStoreSettings(slug);
  const hubSync = await syncCollectionsWithBackendHub(cached ? { settings: cached } : {}, slug);
  if (isFirestoreQuotaExhausted()) {
    if (hubSync?.settings) {
      setCachedStoreSettings(hubSync.settings, slug);
      return hubSync.settings;
    }
    if (cached) return cached;
    return getDefaultStoreSettingsForCompany(slug);
  }
  try {
    const docRef = doc(db, 'settings', getStoreProfileDocId(slug));
    const snapshot = await getDoc(docRef);
    if (snapshot.exists()) {
      const data = snapshot.data();
      const rawLogo = data.logoUrl !== undefined ? data.logoUrl : slug === 'gosen' ? '/store-logo.jpg' : '';
      const safeLogo = slug !== 'gosen' && rawLogo === '/store-logo.jpg' ? '' : rawLogo;
      const settings: StoreSettings = {
        companyId: slug,
        storeName: data.storeName || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
        tagline: data.tagline || 'Control de Inventario y Ventas',
        logoUrl: safeLogo,
        phone: data.phone || '',
        address: data.address || '',
        storeRtn: data.storeRtn || '',
        defaultPrinterFormat: data.defaultPrinterFormat || '80mm',
        receiptFooterText: data.receiptFooterText || '¡Gracias por su compra! Vuelva pronto.',
        accessPassword: data.accessPassword || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
        whatsappOrderPhone: data.whatsappOrderPhone || '',
        catalogWelcomeMsg: data.catalogWelcomeMsg || '',
        showLocationsInCatalog: data.showLocationsInCatalog !== undefined ? Boolean(data.showLocationsInCatalog) : true,
        storeLocations: sanitizeStoreLocationsList(data.storeLocations),
        allowedModules:
          Array.isArray(data.allowedModules) && data.allowedModules.length > 0
            ? data.allowedModules
            : ALL_COMPANY_MODULES,
        enableDeliveryDvolada:
          data.enableDeliveryDvolada !== undefined
            ? Boolean(data.enableDeliveryDvolada)
            : slug === 'gosen',
        enableOnlineSales:
          data.enableOnlineSales !== undefined ? Boolean(data.enableOnlineSales) : true,
        maxProducts: Math.max(0, Number(data.maxProducts) || 0),
        maxUsers: Math.max(0, Number(data.maxUsers) || 0),
        updatedAt: Number(data.updatedAt) || Date.now(),
      };
      setCachedStoreSettings(settings, slug);
      syncCollectionsWithBackendHub({ settings }, slug).catch(() => {});
      return settings;
    }

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
          showLocationsInCatalog: true,
          storeLocations: [],
          allowedModules:
            Array.isArray(cData.allowedModules) && cData.allowedModules.length > 0
              ? cData.allowedModules
              : ALL_COMPANY_MODULES,
          enableDeliveryDvolada: Boolean(cData.enableDeliveryDvolada === true),
          enableOnlineSales: cData.enableOnlineSales !== undefined ? Boolean(cData.enableOnlineSales) : true,
          maxProducts: Math.max(0, Number(cData.maxProducts) || 0),
          maxUsers: Math.max(0, Number(cData.maxUsers) || 0),
          updatedAt: Date.now(),
        };
        setCachedStoreSettings(fallbackSettings, slug);
        syncCollectionsWithBackendHub({ settings: fallbackSettings }, slug).catch(() => {});
        return fallbackSettings;
      }
    }

    if (hubSync?.settings) {
      setCachedStoreSettings(hubSync.settings, slug);
      return hubSync.settings;
    }
    return getDefaultStoreSettingsForCompany(slug);
  } catch (error) {
    isQuotaOrNetworkError(error);
    if (hubSync?.settings) {
      setCachedStoreSettings(hubSync.settings, slug);
      return hubSync.settings;
    }
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
          storeRtn: data.storeRtn || '',
          defaultPrinterFormat: data.defaultPrinterFormat || '80mm',
          receiptFooterText: data.receiptFooterText || '¡Gracias por su compra! Vuelva pronto.',
          accessPassword: data.accessPassword || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
          whatsappOrderPhone: data.whatsappOrderPhone || '',
          catalogWelcomeMsg: data.catalogWelcomeMsg || '',
          showLocationsInCatalog: data.showLocationsInCatalog !== undefined ? Boolean(data.showLocationsInCatalog) : true,
          storeLocations: sanitizeStoreLocationsList(data.storeLocations),
          allowedModules:
            Array.isArray(data.allowedModules) && data.allowedModules.length > 0
              ? data.allowedModules
              : ALL_COMPANY_MODULES,
          enableDeliveryDvolada:
            data.enableDeliveryDvolada !== undefined
              ? Boolean(data.enableDeliveryDvolada)
              : slug === 'gosen',
          enableOnlineSales:
            data.enableOnlineSales !== undefined ? Boolean(data.enableOnlineSales) : true,
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
  const payload: any = {
    companyId: slug,
    storeName: settings.storeName.trim() || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
    tagline: settings.tagline?.trim() || '',
    logoUrl: safeLogo,
    phone: settings.phone?.trim() || '',
    address: settings.address?.trim() || '',
    storeRtn: settings.storeRtn?.trim() || '',
    defaultPrinterFormat: settings.defaultPrinterFormat || '80mm',
    receiptFooterText: settings.receiptFooterText?.trim() || '¡Gracias por su compra! Vuelva pronto.',
    accessPassword: settings.accessPassword?.trim() || (slug === 'gosen' ? 'GOSEN2026' : 'ADMIN2026'),
    whatsappOrderPhone: settings.whatsappOrderPhone?.trim() || '',
    catalogWelcomeMsg: settings.catalogWelcomeMsg?.trim() || '',
    showLocationsInCatalog: settings.showLocationsInCatalog !== false,
    storeLocations: sanitizedLocations,
    updatedAt: Date.now(),
  };

  if (Array.isArray(settings.allowedModules) && settings.allowedModules.length > 0) {
    payload.allowedModules = settings.allowedModules;
  }
  if (settings.enableDeliveryDvolada !== undefined) {
    payload.enableDeliveryDvolada = Boolean(settings.enableDeliveryDvolada);
  }
  if (settings.enableOnlineSales !== undefined) {
    payload.enableOnlineSales = Boolean(settings.enableOnlineSales);
  }
  if (settings.maxProducts !== undefined) {
    payload.maxProducts = Math.max(0, Number(settings.maxProducts) || 0);
  }
  if (settings.maxUsers !== undefined) {
    payload.maxUsers = Math.max(0, Number(settings.maxUsers) || 0);
  }

  setCachedStoreSettings({ ...settings, ...payload }, slug);
  syncCollectionsWithBackendHub({ settings: { ...settings, ...payload } }, slug).catch(() => {});

  try {
    await setDoc(docRef, stripUndefinedDeep(payload), { merge: true });
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
      date: data.date || '',
      items: Array.isArray(data.items)
        ? data.items.map((it: any) => ({
            productId: it.productId || '',
            code: it.code || '',
            name: it.name || '',
            category: it.category || '',
            size: it.size || '',
            originalPrice:
              it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) || 0,
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
          }))
        : [],
      customerName: data.customerName || 'Consumidor Final',
      customerPhone: data.customerPhone || '',
      customerRtn: data.customerRtn || '',
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
      lastEditedBy: data.lastEditedBy ? String(data.lastEditedBy) : undefined,
      lastEditedAt: data.lastEditedAt ? String(data.lastEditedAt) : undefined,
    });
  });
  records.sort((a, b) => b.timestamp - a.timestamp);
  return records;
}

export async function fetchSalesOnce(
  forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<SaleRecord[]> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedSales(slug) || [];
  const hubSync = await syncCollectionsWithBackendHub({ sales: cached }, slug);
  const baseSales = hubSync?.sales && hubSync.sales.length > 0 ? hubSync.sales : cached;

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
    const mergedHub = await syncCollectionsWithBackendHub({ sales: records }, slug);
    const finalSales = mergedHub?.sales && mergedHub.sales.length > 0 ? mergedHub.sales : records;
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
      const records = parseSaleDocsFromSnapshot(snapshot, slug);
      setCachedSales(records, slug);
      syncCollectionsWithBackendHub({ sales: records }, slug).catch(() => {});
      onData(records);
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
    onlineOrder: saleData.onlineOrder ? saleData.onlineOrder : undefined,
    cashier: String(saleData.cashier || 'Administrador').trim().slice(0, 100),
    cashierRole:
      saleData.cashierRole === 'admin' || saleData.cashierRole === 'collaborator'
        ? saleData.cashierRole
        : (saleData.cashier || '').toLowerCase().includes('admin')
        ? 'admin'
        : 'collaborator',
  };

  const createdRecord: SaleRecord = {
    id: saleId,
    ...payload,
  };
  const prevSales = getCachedSales(slug) || [];
  const nextSalesList = [createdRecord, ...prevSales.filter((s) => s.id !== saleId)];
  setCachedSales(nextSalesList, slug);
  syncCollectionsWithBackendHub({ sales: [createdRecord] }, slug).catch(() => {});

  try {
    // 1. Save the sale document first so billing never fails due to an inventory doc ID mismatch
    await setDoc(saleRef, stripUndefinedDeep(payload));
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Sale saved in local cache; cloud sync deferred:', error);
    } else {
      handleFirestoreError(error, OperationType.WRITE, `sales/${saleId}`);
    }
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

  const prevSales = getCachedSales(slug) || [];
  setCachedSales(
    prevSales.map((s) => (s.id === sale.id ? updatedSale : s)),
    slug
  );

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
    if (isQuotaOrNetworkError(error)) {
      console.warn('Credit payment saved in local cache; cloud sync deferred:', error);
      return updatedSale;
    }
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
    onlineOrder:
      updatedSale.onlineOrder !== undefined ? updatedSale.onlineOrder : originalSale.onlineOrder,
    cashier: String(updatedSale.cashier || originalSale.cashier || 'Administrador').trim().slice(0, 100),
    cashierRole: updatedSale.cashierRole || originalSale.cashierRole || 'admin',
    lastEditedBy: String(updatedSale.lastEditedBy || 'Administrador').slice(0, 150),
    lastEditedAt: String(updatedSale.lastEditedAt || new Date().toLocaleString()).slice(0, 100),
  };

  const prevSales = getCachedSales(slug) || [];
  setCachedSales(
    prevSales.map((s) => (s.id === originalSale.id ? { id: originalSale.id, ...payload } : s)),
    slug
  );

  try {
    await setDoc(saleRef, stripUndefinedDeep(payload), { merge: true });
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('Sale update saved in local cache; cloud sync deferred:', error);
    } else {
      handleFirestoreError(error, OperationType.UPDATE, `sales/${originalSale.id}`);
    }
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

  const prevSales = getCachedSales(slug) || [];
  setCachedSales(
    prevSales.map((s) => (s.id === sale.id ? { ...s, status: 'cancelled' } : s)),
    slug
  );

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
    if (isQuotaOrNetworkError(error)) {
      console.warn('Sale cancellation saved in local cache; cloud sync deferred:', error);
    } else {
      handleFirestoreError(error, OperationType.UPDATE, `sales/${sale.id}`);
    }
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
    if (isQuotaOrNetworkError(error)) {
      console.warn('Sale deletion deferred due to quota/network:', error);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, `sales/${saleId}`);
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
    hubSync?.purchases && hubSync.purchases.length > 0 ? hubSync.purchases : cached;

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
    const mergedHub = await syncCollectionsWithBackendHub({ purchases: records }, slug);
    const finalPurchases =
      mergedHub?.purchases && mergedHub.purchases.length > 0 ? mergedHub.purchases : records;
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
      const records = parsePurchaseDocsFromSnapshot(snapshot, slug);
      setCachedPurchases(records, slug);
      syncCollectionsWithBackendHub({ purchases: records }, slug).catch(() => {});
      onData(records);
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

  const prevPurchases = getCachedPurchases(slug) || [];
  setCachedPurchases(
    prevPurchases.map((p) => (p.id === purchase.id ? { ...p, status: 'cancelled' } : p)),
    slug
  );

  try {
    await setDoc(
      purchaseRef,
      stripUndefinedDeep({
        invoiceNumber: String(purchase.invoiceNumber || 'FAC').slice(0, 100),
        supplierId: String(purchase.supplierId || 'sup').slice(0, 128),
        supplierName: String(purchase.supplierName || 'Proveedor').slice(0, 200),
        date: String(purchase.date || '').slice(0, 100),
        timestamp: Number(purchase.timestamp) || Date.now(),
        warehouseId: purchase.warehouseId || undefined,
        warehouseName: purchase.warehouseName || undefined,
        items: Array.isArray(purchase.items) ? purchase.items : [],
        total: Number(purchase.total) || 0,
        status: 'cancelled',
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
          ...(newWarehouseStocks ? { warehouseStocks: newWarehouseStocks } : {}),
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
    if (isQuotaOrNetworkError(error)) {
      console.warn('Purchase deletion deferred due to quota/network:', error);
      return;
    }
    handleFirestoreError(error, OperationType.DELETE, `purchases/${purchaseId}`);
  }
}

// ----------------- COLLABORATORS & USERS MANAGEMENT -----------------

export async function fetchUsersOnce(
  _forceRefresh = false,
  companyId = getActiveCompanyId()
): Promise<UserAccount[]> {
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const cached = getCachedUsers(slug);
  const scopedQuery = getScopedCollectionQuery('users', slug);
  try {
    const snapshot = await getDocs(scopedQuery);
    const records: UserAccount[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
      records.push({
        id: docSnap.id,
        companyId: data.companyId || slug,
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
  const slug = isGyGAlias(companyId) ? 'tiendagyg' : normalizeCompanySlug(companyId);
  const scopedQuery = getScopedCollectionQuery('users', slug);
  return onSnapshot(
    scopedQuery,
    (snapshot) => {
      const records: UserAccount[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!belongsToCompany(data.companyId, slug, docSnap.id)) return;
        records.push({
          id: docSnap.id,
          companyId: data.companyId || slug,
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
  const currentUsers = getCachedUsers(slug) || [];
  setCachedUsers(
    [
      ...currentUsers.filter((u) => u.id !== userId && u.id !== user.id),
      { ...payload, id: userId },
    ].sort((a, b) => a.name.localeCompare(b.name)),
    slug
  );
  try {
    await setDoc(docRef, payload, { merge: true });
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('User saved in local cache; cloud sync deferred:', error);
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
  setCachedUsers(
    currentUsers.filter((u) => u.id !== userId && u.id !== getScopedDocId(userId, slug)),
    slug
  );
  try {
    await deleteDoc(doc(db, 'users', userId));
    if (slug !== 'gosen' && !userId.startsWith(`${slug}__`)) {
      await deleteDoc(doc(db, 'users', getScopedDocId(userId, slug))).catch(() => {});
    }
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('User deletion deferred due to quota/network:', error);
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
    enableOnlineSales:
      data.enableOnlineSales !== undefined
        ? Boolean(data.enableOnlineSales)
        : Array.isArray(data.allowedModules)
        ? data.allowedModules.includes('online-sales')
        : true,
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
    enableOnlineSales:
      company.enableOnlineSales !== undefined
        ? Boolean(company.enableOnlineSales)
        : safeAllowedModules.includes('online-sales'),
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
      creditAccountControls: {},
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

  return {
    companyId: slug,
    shifts: shifts.sort((a, b) => b.openedAt - a.openedAt),
    expenses: expenses.sort((a, b) => b.timestamp - a.timestamp),
    creditAccountControls,
    onlineCustomers,
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
    creditAccountControls:
      data.creditAccountControls && typeof data.creditAccountControls === 'object'
        ? data.creditAccountControls
        : {},
    onlineCustomers: Array.isArray(data.onlineCustomers) ? data.onlineCustomers.slice(0, 1000) : [],
    updatedAt: Date.now(),
  };

  setCachedPOSFinanceData(normalized, slug);

  try {
    await setDoc(
      docRef,
      stripUndefinedDeep({
        storeName: `Finanzas POS ${slug}`.slice(0, 190), // satisfies isValidStoreSettings
        companyId: slug,
        shifts: normalized.shifts,
        expenses: normalized.expenses,
        creditAccountControls: normalized.creditAccountControls,
        onlineCustomers: normalized.onlineCustomers,
        updatedAt: normalized.updatedAt,
      }),
      { merge: true }
    );
    return normalized;
  } catch (error) {
    if (isQuotaOrNetworkError(error)) {
      console.warn('POS finance saved in local cache; cloud sync deferred:', error);
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
export async function resolveClientLoginAcrossAllTenants(params: {
  passwordInput: string;
  usernameInput?: string;
  mode: 'store_pass' | 'collaborator';
  preferredSlug?: string;
  companiesInMemory: CompanyTenant[];
  usersInMemory: UserAccount[];
  activeStoreSettings?: StoreSettings;
}): Promise<UniversalLoginResolution> {
  const cleanPass = params.passwordInput.trim();
  const upperPass = cleanPass.toUpperCase();
  const cleanUser = (params.usernameInput || '').trim().toLowerCase();
  const preferred = params.preferredSlug ? normalizeCompanySlug(params.preferredSlug) : '';

  const matchCompanyFromList = (list: CompanyTenant[]): CompanyTenant | undefined => {
    // 1. If URL has an explicit company parameter (?empresa=...), check that company first
    if (preferred) {
      const prefComp = list.find((c) => normalizeCompanySlug(c.slug) === preferred);
      if (prefComp) {
        const expected = (prefComp.adminPassword || '').trim().toUpperCase();
        if (
          (expected && expected === upperPass) ||
          (preferred === 'tiendagyg' && upperPass === 'GYG2026') ||
          (preferred === 'gosen' && (upperPass === 'GOSEN2026' || upperPass === 'ADMIN2026'))
        ) {
          return prefComp;
        }
      }
    }

    // 2. Check all companies by their unique adminPassword
    const exactOrUpper = list.find((comp) => {
      const slug = normalizeCompanySlug(comp.slug);
      const pass = (comp.adminPassword || '').trim().toUpperCase();
      // Check cached store settings for this company too
      const cachedSettings = getCachedStoreSettings(slug);
      const settingsPass = (cachedSettings?.accessPassword || '').trim().toUpperCase();
      return (
        (pass.length > 0 && pass === upperPass) ||
        (settingsPass.length > 0 && settingsPass === upperPass) ||
        (slug === 'tiendagyg' && upperPass === 'GYG2026') ||
        (slug === 'gosen' && (upperPass === 'GOSEN2026' || upperPass === 'ADMIN2026'))
      );
    });

    return exactOrUpper;
  };

  // --- A. COLLABORATOR MODE ---
  if (params.mode === 'collaborator') {
    const findCollab = (userList: UserAccount[]): UserAccount | undefined => {
      if (preferred) {
        const inPreferred = userList.find(
          (u) =>
            u.isActive !== false &&
            u.username.toLowerCase() === cleanUser &&
            u.password === cleanPass &&
            normalizeCompanySlug(u.companyId || 'gosen') === preferred
        );
        if (inPreferred) return inPreferred;
      }
      return userList.find(
        (u) =>
          u.isActive !== false &&
          u.username.toLowerCase() === cleanUser &&
          u.password === cleanPass
      );
    };

    let foundUser = findCollab(params.usersInMemory);
    let allCompanies = params.companiesInMemory;

    if (!foundUser) {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const allCloudUsers: UserAccount[] = [];
        snap.forEach((docSnap) => {
          const d = docSnap.data();
          const cSlug = normalizeCompanySlug(d.companyId || 'gosen');
          allCloudUsers.push({
            id: docSnap.id,
            companyId: cSlug,
            name: d.name || '',
            username: d.username || '',
            password: d.password || '',
            role: d.role === 'admin' ? 'admin' : 'collaborator',
            isActive: d.isActive !== false,
            allowedTabs: Array.isArray(d.allowedTabs)
              ? d.allowedTabs
              : ['sales', 'inventory', 'price-checker', 'catalog'],
            salesPermissions: d.salesPermissions || {
              canEditSales: true,
              canCancelSales: false,
              canViewCostsAndProfits: false,
            },
            createdAt: Number(d.createdAt) || Date.now(),
          });
        });
        foundUser = findCollab(allCloudUsers);
        if (foundUser) {
          allCompanies = await fetchCompaniesOnce(true);
        }
      } catch {
        // Ignore offline error
      }
    }

    if (foundUser) {
      const targetSlug = normalizeCompanySlug(foundUser.companyId || 'gosen');
      const compObj = allCompanies.find((c) => normalizeCompanySlug(c.slug) === targetSlug);
      const companyName =
        compObj?.name ||
        (targetSlug === 'gosen' ? 'Tienda Gosén' : targetSlug.toUpperCase());
      return {
        matched: true,
        type: 'collaborator',
        companySlug: targetSlug,
        companyName,
        logoUrl: compObj?.logoUrl,
        companyObj: compObj,
        collaborator: foundUser,
      };
    }

    return { matched: false };
  }

  // --- B. DIRECT STORE PASSWORD MODE ---
  let allCompanies = params.companiesInMemory;
  let matchedComp = matchCompanyFromList(allCompanies);

  // If not matched in memory, query fresh companies & store_profile settings from Firestore
  if (!matchedComp) {
    try {
      allCompanies = await fetchCompaniesOnce(true);
      matchedComp = matchCompanyFromList(allCompanies);
    } catch {
      // Ignore offline error
    }
  }

  if (!matchedComp) {
    try {
      const settingsSnap = await getDocs(collection(db, 'settings'));
      settingsSnap.forEach((docSnap) => {
        if (matchedComp) return;
        if (!docSnap.id.startsWith('store_profile')) return;
        const d = docSnap.data();
        const pass = (d.accessPassword || '').trim().toUpperCase();
        if (pass && pass === upperPass) {
          const slug = normalizeCompanySlug(
            d.companyId || docSnap.id.replace(/^store_profile_?/, '') || 'gosen'
          );
          const existingComp = allCompanies.find((c) => normalizeCompanySlug(c.slug) === slug);
          matchedComp = existingComp || {
            id: slug,
            name: d.storeName || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
            slug,
            ownerName: 'Administrador',
            phone: d.phone || '',
            plan: 'mensual',
            price: 0,
            nextBillingDate: '',
            status: 'active',
            adminPassword: d.accessPassword,
            logoUrl: d.logoUrl || '',
            tagline: d.tagline || '',
            address: d.address || '',
            allowedModules: d.allowedModules || [...ALL_COMPANY_MODULES],
            createdAt: Date.now(),
          };
        }
      });
    } catch {
      // Ignore offline error
    }
  }

  if (matchedComp) {
    const targetSlug = normalizeCompanySlug(matchedComp.slug);
    const targetName =
      matchedComp.name ||
      (targetSlug === 'gosen'
        ? params.activeStoreSettings?.storeName || 'Tienda Gosén'
        : targetSlug.toUpperCase());
    const targetLogo =
      matchedComp.logoUrl ||
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

  // Fallback: check if the password directly matches an active collaborator across all stores
  try {
    const snap = await getDocs(collection(db, 'users'));
    let matchedCollab: UserAccount | undefined;
    snap.forEach((docSnap) => {
      if (matchedCollab) return;
      const d = docSnap.data();
      if (d.isActive !== false && d.password === cleanPass) {
        matchedCollab = {
          id: docSnap.id,
          companyId: normalizeCompanySlug(d.companyId || 'gosen'),
          name: d.name || '',
          username: d.username || '',
          password: d.password || '',
          role: d.role === 'admin' ? 'admin' : 'collaborator',
          isActive: true,
          allowedTabs: Array.isArray(d.allowedTabs)
            ? d.allowedTabs
            : ['sales', 'inventory', 'price-checker', 'catalog'],
          salesPermissions: d.salesPermissions || {
            canEditSales: true,
            canCancelSales: false,
            canViewCostsAndProfits: false,
          },
          createdAt: Number(d.createdAt) || Date.now(),
        };
      }
    });

    if (matchedCollab) {
      const targetSlug = normalizeCompanySlug(matchedCollab.companyId || 'gosen');
      const compObj = allCompanies.find((c) => normalizeCompanySlug(c.slug) === targetSlug);
      const companyName =
        compObj?.name ||
        (targetSlug === 'gosen' ? 'Tienda Gosén' : targetSlug.toUpperCase());
      return {
        matched: true,
        type: 'collaborator',
        companySlug: targetSlug,
        companyName,
        logoUrl: compObj?.logoUrl,
        companyObj: compObj,
        collaborator: matchedCollab,
      };
    }
  } catch {
    // Ignore offline error
  }

  return { matched: false };
}



