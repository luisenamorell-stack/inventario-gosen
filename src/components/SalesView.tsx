import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Product,
  SaleRecord,
  SaleItem,
  StoreSettings,
  UserSession,
  UserAccount,
  UserRole,
  POSFinanceStoreData,
  CreditPaymentAbone,
  PrinterPaperFormat,
  StoreWarehousesData,
  WarehouseLocation,
  LoyaltyCustomerProfile,
  LoyaltyProgramConfig,
  LoyaltyTransactionLog,
} from '../types';
import {
  getProductStockInWarehouse,
  getDefaultWarehousesForStore,
} from '../firebase/firestoreService';
import {
  PRINTER_FORMAT_OPTIONS,
  getPreferredPrinterFormat,
  setPreferredPrinterFormat,
  printHtmlDocument,
  buildSaleDocumentHtml,
  downloadSalePdf,
  buildSalesReportHtml,
  downloadSalesReportPdf,
} from '../utils/printPdfService';
import {
  getBridgeConfig,
  sendTicketToBridgeServer,
  printTicketDomElementWithFallbackCss,
} from '../utils/universalPrintBridge';
import { PrintFormatModal, PrinterConnectionManager } from './PrintFormatModal';
import { AdaptiveImage } from './AdaptiveImage';
import {
  cleanCategoryName,
  matchesCategoryFilter,
  matchesProductSearch,
  normalizeSearchText,
  scoreProductSearchRelevance,
} from '../utils/productSearch';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  DollarSign,
  CreditCard,
  Building,
  CheckCircle2,
  Printer,
  History,
  AlertTriangle,
  RotateCcw,
  Receipt,
  User,
  Phone,
  FileText,
  Calendar,
  X,
  ArrowRight,
  TrendingUp,
  Package,
  Layers,
  Sparkles,
  Download,
  Percent,
  Check,
  Ban,
  Barcode,
  Tag,
  ChevronLeft,
  ChevronRight,
  Copy,
  MessageCircle,
  Share2,
  ShieldCheck,
  Users,
  Wallet,
  FileSpreadsheet,
  Edit2,
  Lock,
  Boxes,
  Award,
  Gift,
  Star,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { ConfirmDialog } from './ConfirmDialog';
import { EditSaleModal, AdminCancelAuthModal } from './EditSaleModal';
import { playSound } from '../utils/audio';
import { PosProductGridSkeleton } from './SkeletonLoaders';
import { POSFinanceTabs } from './POSFinanceTabs';

export const WhatsAppIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    width="24"
    height="24"
    stroke="currentColor"
    strokeWidth="0"
    fill="currentColor"
    className={className}
    aria-hidden="true"
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

export type SalesSubTab =
  | 'pos'
  | 'cash-register'
  | 'credits'
  | 'expenses'
  | 'loyalty'
  | 'history';

interface SalesViewProps {
  inventory: Product[];
  sales: SaleRecord[];
  storeSettings: StoreSettings;
  warehousesData?: StoreWarehousesData;
  userSession?: UserSession | null;
  users?: UserAccount[];
  isLoading?: boolean;
  initialSubTab?: SalesSubTab;
  posFinanceData?: POSFinanceStoreData;
  onSavePOSFinanceData?: (updated: POSFinanceStoreData) => Promise<void>;
  onRecordCreditPayment?: (sale: SaleRecord, abone: CreditPaymentAbone) => Promise<SaleRecord>;
  onRecordSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<SaleRecord | void>;
  onUpdateSale?: (originalSale: SaleRecord, updatedSale: SaleRecord) => Promise<void>;
  onCancelSale: (sale: SaleRecord) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  inventory,
  sales,
  storeSettings,
  warehousesData,
  userSession,
  users = [],
  isLoading = false,
  initialSubTab = 'pos',
  posFinanceData,
  onSavePOSFinanceData,
  onRecordCreditPayment,
  onRecordSale,
  onUpdateSale,
  onCancelSale,
  showToast,
}) => {
  // Resolve granular Collaborator POS permissions (real-time from users list or session)
  const isAdminUser = !userSession || userSession.role === 'admin';
  const matchedCollabAccount = useMemo(() => {
    if (isAdminUser || !userSession) return undefined;
    return users.find(
      (u) =>
        u.id === userSession.userId ||
        u.username.trim().toLowerCase() === (userSession.username || '').trim().toLowerCase()
    );
  }, [isAdminUser, userSession, users]);

  const effectiveSalesPerms = matchedCollabAccount?.salesPermissions || userSession?.salesPermissions;
  const canCancelSales = isAdminUser || Boolean(effectiveSalesPerms?.canCancelSales);
  const canEditSales =
    isAdminUser ||
    (effectiveSalesPerms?.canEditSales !== undefined ? effectiveSalesPerms.canEditSales : true);
  const canViewCostsAndProfits =
    isAdminUser || Boolean(effectiveSalesPerms?.canViewCostsAndProfits);
  // Navigation between POS Terminal, Cash Register, Credits, Expenses and Sales History
  const [activeSubTab, setActiveSubTab] = useState<SalesSubTab>(initialSubTab);

  useEffect(() => {
    if (initialSubTab) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  // Mobile / Tablet POS active view: 'catalog' | 'cart' | 'split' (split available on md+ tablets)
  const [mobilePosTab, setMobilePosTab] = useState<'catalog' | 'cart' | 'split'>(() =>
    typeof window !== 'undefined' && window.innerWidth >= 768 ? 'split' : 'catalog'
  );

  // ------------------ POS STATE ------------------
  const activeWarehouses = useMemo<WarehouseLocation[]>(() => {
    const list =
      warehousesData?.warehouses && warehousesData.warehouses.length > 0
        ? warehousesData.warehouses
        : getDefaultWarehousesForStore();
    const active = list.filter((w) => w.isActive !== false);
    return active.length > 0 ? active : list;
  }, [warehousesData]);

  const defaultMainWarehouse = useMemo<WarehouseLocation>(() => {
    return activeWarehouses.find((w) => w.isMainSalesFloor) || activeWarehouses[0];
  }, [activeWarehouses]);

  const companyKey = (storeSettings.companyId || 'gosen').toLowerCase();

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(`stockmaster_pos_warehouse_${companyKey}`);
      if (saved) return saved;
    } catch {}
    return 'principal';
  });

  // Ensure selectedWarehouseId always points to an active warehouse of the current store
  useEffect(() => {
    if (!activeWarehouses.some((w) => w.id === selectedWarehouseId)) {
      setSelectedWarehouseId(defaultMainWarehouse?.id || 'principal');
    }
  }, [activeWarehouses, selectedWarehouseId, defaultMainWarehouse]);

  const selectedWarehouse = useMemo<WarehouseLocation>(() => {
    return (
      activeWarehouses.find((w) => w.id === selectedWarehouseId) ||
      defaultMainWarehouse || {
        id: 'principal',
        code: 'PRINCIPAL',
        name: 'Tienda Principal (Sala de Ventas)',
        isMainSalesFloor: true,
        isActive: true,
        createdAt: Date.now(),
      }
    );
  }, [activeWarehouses, selectedWarehouseId, defaultMainWarehouse]);

  const isWarehousesModuleEnabled = useMemo(() => {
    return !storeSettings.allowedModules || storeSettings.allowedModules.includes('warehouses');
  }, [storeSettings.allowedModules]);

  // Helper to get available stock of a product in the currently selected POS warehouse
  const getPosWarehouseStock = (product: Product | undefined, whIdOverride?: string): number => {
    if (!product) return 0;
    if (!isWarehousesModuleEnabled) return Math.max(0, Math.round(Number(product.stock) || 0));
    const targetWhId = whIdOverride || selectedWarehouse.id;
    return getProductStockInWarehouse(product, targetWhId, activeWarehouses);
  };

  // Helper to find all other active warehouses where a product currently has stock > 0
  const getOtherWarehousesWithStock = (
    product: Product | undefined
  ): Array<{ warehouse: WarehouseLocation; stock: number }> => {
    if (!product || !isWarehousesModuleEnabled) return [];
    return activeWarehouses
      .filter((w) => w.id !== selectedWarehouse.id)
      .map((w) => ({
        warehouse: w,
        stock: getProductStockInWarehouse(product, w.id, activeWarehouses),
      }))
      .filter((entry) => entry.stock > 0);
  };

  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [discountValue, setDiscountValue] = useState<string>('');
  const [applyTax, setApplyTax] = useState<boolean>(false); // 15% ISV Honduras optional
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'credit' | 'other'>('cash');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [creditInitialDeposit, setCreditInitialDeposit] = useState<string>('');
  const [creditDueDate, setCreditDueDate] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('Consumidor Final');
  const [customerRtn, setCustomerRtn] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [saleNotes, setSaleNotes] = useState<string>('');
  const [isSubmittingSale, setIsSubmittingSale] = useState<boolean>(false);

  const handleSelectPosWarehouse = (newWhId: string) => {
    const targetWh = activeWarehouses.find((w) => w.id === newWhId);
    if (!targetWh) return;
    setSelectedWarehouseId(newWhId);
    try {
      localStorage.setItem(`stockmaster_pos_warehouse_${companyKey}`, newWhId);
    } catch {}

    // If cart has items, validate their quantities against the newly selected warehouse stock
    if (cart.length > 0) {
      let adjustedCount = 0;
      setCart((prevCart) => {
        const nextCart: SaleItem[] = [];
        for (const item of prevCart) {
          const prod = inventory.find((p) => p.code === item.code);
          const availInNewWh = getPosWarehouseStock(prod, newWhId);
          if (availInNewWh <= 0) {
            adjustedCount++;
            continue;
          }
          if (item.quantity > availInNewWh) {
            adjustedCount++;
            nextCart.push({
              ...item,
              quantity: availInNewWh,
              subtotal: availInNewWh * item.price,
            });
          } else {
            nextCart.push(item);
          }
        }
        return nextCart;
      });

      if (adjustedCount > 0) {
        showToast(
          `Bodega cambiada a "${targetWh.name}". Se ajustaron ${adjustedCount} artículo(s) del ticket según la existencia en esta bodega.`,
          'warning'
        );
      } else {
        showToast(`Vendiendo desde: ${targetWh.name}`, 'info');
      }
    } else {
      showToast(`Bodega seleccionada para venta: ${targetWh.name}`, 'info');
    }
  };

  // Completed sale receipt modal
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);
  const [receiptWhatsAppPhone, setReceiptWhatsAppPhone] = useState<string>('');
  const [receiptPrinterFormat, setReceiptPrinterFormat] = useState<PrinterPaperFormat>(() =>
    getPreferredPrinterFormat(storeSettings)
  );
  const [showSalesReportPrintModal, setShowSalesReportPrintModal] = useState<boolean>(false);

  // Sync WhatsApp phone whenever completedSale changes
  useEffect(() => {
    if (completedSale) {
      setReceiptWhatsAppPhone(completedSale.customerPhone || '');
      setReceiptPrinterFormat(getPreferredPrinterFormat(storeSettings));
    }
  }, [completedSale, storeSettings]);

  // ------------------ HISTORY STATE ------------------
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<
    'today' | 'yesterday' | 'today_yesterday' | 'week' | 'month' | 'all' | 'custom'
  >('today_yesterday');
  const [historyYearFilter, setHistoryYearFilter] = useState<string>('all');
  const [historyMonthFilter, setHistoryMonthFilter] = useState<string>('all');
  const [historyDayFilter, setHistoryDayFilter] = useState<string>('all');
  const [historyExactDate, setHistoryExactDate] = useState<string>('');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<'all' | 'cash' | 'card' | 'transfer' | 'credit'>('all');
  const [historySellerFilter, setHistorySellerFilter] = useState<'all' | 'admin' | 'collaborator'>('all');

  // Helper to resolve who made a sale (Name + Role: Administrador vs Colaborador)
  const getSaleSellerInfo = (
    sale: SaleRecord
  ): { name: string; role: UserRole; roleLabel: 'Administrador' | 'Colaborador' } => {
    const rawCashier = (sale.cashier || '').trim();
    const lowerCashier = rawCashier.toLowerCase();

    // Check if explicitly saved role exists
    let resolvedRole: UserRole | undefined =
      sale.cashierRole === 'admin' || sale.cashierRole === 'collaborator'
        ? sale.cashierRole
        : undefined;

    // If not explicitly saved on older records, check against registered users or standard admin labels
    if (!resolvedRole) {
      const matchedCollaborator = users.find(
        (u) =>
          u.name.trim().toLowerCase() === lowerCashier ||
          u.username.trim().toLowerCase() === lowerCashier
      );
      if (matchedCollaborator) {
        resolvedRole = matchedCollaborator.role || 'collaborator';
      } else if (
        !rawCashier ||
        lowerCashier === 'administrador' ||
        lowerCashier === 'admin' ||
        lowerCashier === 'caja principal' ||
        lowerCashier === 'cajero'
      ) {
        resolvedRole = 'admin';
      } else {
        resolvedRole = 'collaborator';
      }
    }

    const displayName =
      !rawCashier || lowerCashier === 'caja principal' || lowerCashier === 'cajero'
        ? resolvedRole === 'admin'
          ? 'Administrador'
          : rawCashier || 'Colaborador'
        : rawCashier;

    return {
      name: displayName,
      role: resolvedRole,
      roleLabel: resolvedRole === 'admin' ? 'Administrador' : 'Colaborador',
    };
  };

  // Cancel & Edit sale dialog state
  const [saleToCancel, setSaleToCancel] = useState<SaleRecord | null>(null);
  const [salePendingAdminAuth, setSalePendingAdminAuth] = useState<SaleRecord | null>(null);
  const [saleToEdit, setSaleToEdit] = useState<SaleRecord | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const handleRequestCancelSale = (sale: SaleRecord) => {
    if (canCancelSales) {
      setSaleToCancel(sale);
    } else {
      setSalePendingAdminAuth(sale);
    }
  };

  // Printable receipt ref
  const receiptPrintRef = useRef<HTMLDivElement>(null);

  // Products belonging to the currently selected warehouse (when Warehouses module is active)
  const warehouseScopedInventory = useMemo(() => {
    if (!isWarehousesModuleEnabled) return inventory;
    return inventory.filter((p) => {
      const stockInWh = getProductStockInWarehouse(p, selectedWarehouse.id, activeWarehouses);
      if (stockInWh > 0) return true;
      // Also include if explicitly assigned a key in warehouseStocks for this non-main warehouse with stock > 0
      return false;
    });
  }, [inventory, isWarehousesModuleEnabled, selectedWarehouse.id, activeWarehouses]);

  // Available categories in the active warehouse (or full inventory if searching)
  const categories = useMemo(() => {
    const map = new Map<string, string>();
    const sourceList = isWarehousesModuleEnabled ? warehouseScopedInventory : inventory;
    sourceList.forEach((p) => {
      const cleaned = cleanCategoryName(p.category);
      if (cleaned) {
        const key = normalizeSearchText(cleaned);
        if (!map.has(key)) {
          map.set(key, cleaned);
        }
      }
    });
    return Array.from(map.values()).sort((a, b) =>
      a.localeCompare(b, 'es', { sensitivity: 'base' })
    );
  }, [inventory, warehouseScopedInventory, isWarehousesModuleEnabled]);

  // Filtered inventory catalog for POS:
  // - When NOT searching and Warehouses module is active: ONLY shows articles of the selected warehouse.
  // - When searching: searches across all articles so if an article is not in the selected warehouse, it tells the user exactly in which warehouse(s) it is available!
  const filteredCatalog = useMemo(() => {
    const raw = searchQuery.trim();
    if (!raw) {
      const baseList = isWarehousesModuleEnabled ? warehouseScopedInventory : inventory;
      return baseList.filter((item) => matchesCategoryFilter(item.category, selectedCategory));
    }

    // When searching, search across full inventory (respecting category if selected)
    const filtered = inventory.filter((item) => {
      if (selectedCategory !== 'all' && !matchesCategoryFilter(item.category, selectedCategory)) {
        return false;
      }
      return matchesProductSearch(item, raw);
    });

    return [...filtered].sort((a, b) => {
      // Prioritize items that DO have stock in the selected warehouse first
      const stockA = getPosWarehouseStock(a);
      const stockB = getPosWarehouseStock(b);
      if (stockA > 0 && stockB <= 0) return -1;
      if (stockB > 0 && stockA <= 0) return 1;

      const scoreA = scoreProductSearchRelevance(a, raw);
      const scoreB = scoreProductSearchRelevance(b, raw);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }, [
    inventory,
    warehouseScopedInventory,
    isWarehousesModuleEnabled,
    searchQuery,
    selectedCategory,
    selectedWarehouse.id,
    activeWarehouses,
  ]);

  // Fast O(1) Map for cart item counts to avoid O(N^2) scans during catalog render
  const cartQtyMap = useMemo(() => new Map(cart.map((it) => [it.code, it.quantity])), [cart]);

  // POS catalog display limit for silky smooth 60fps rendering with large inventories
  const [posDisplayLimit, setPosDisplayLimit] = useState<number>(36);

  useEffect(() => {
    setPosDisplayLimit(36);
  }, [selectedCategory, selectedWarehouse.id]);

  const displayedCatalog = useMemo(() => {
    if (searchQuery.trim()) {
      return filteredCatalog;
    }
    return filteredCatalog.slice(0, posDisplayLimit);
  }, [filteredCatalog, searchQuery, posDisplayLimit]);

  // Handle direct Enter in search bar (Barcode scanner instant scan or fast name/code entry)
  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchQuery.trim();
      if (!query) return;

      const cleanQuery = query.toLowerCase();
      const cleanRaw = cleanQuery.replace(/[-_\s]/g, '');

      // 1. Exact match by code or barcode
      const exactCodeMatch = inventory.find(
        (p) =>
          p.code.trim().toLowerCase() === cleanQuery ||
          p.code.trim().toLowerCase().replace(/[-_\s]/g, '') === cleanRaw
      );

      if (exactCodeMatch) {
        addToCart(exactCodeMatch);
        if (getPosWarehouseStock(exactCodeMatch) > 0) {
          setSearchQuery('');
        }
        return;
      }

      // 2. Exact match by article name
      const exactNameMatch = inventory.find(
        (p) => p.name.trim().toLowerCase() === cleanQuery
      );

      if (exactNameMatch) {
        addToCart(exactNameMatch);
        if (getPosWarehouseStock(exactNameMatch) > 0) {
          setSearchQuery('');
        }
        return;
      }

      // 3. If filtered results has exactly 1 matching product
      if (filteredCatalog.length === 1) {
        addToCart(filteredCatalog[0]);
        if (getPosWarehouseStock(filteredCatalog[0]) > 0) {
          setSearchQuery('');
        }
        return;
      }

      // 4. If filtered results has multiple matches, add the top match and inform cashier
      if (filteredCatalog.length > 1) {
        addToCart(filteredCatalog[0]);
        if (getPosWarehouseStock(filteredCatalog[0]) > 0) {
          showToast(
            `Agregado: "${filteredCatalog[0].name}" (${filteredCatalog.length} artículos encontrados para "${query}")`,
            'info'
          );
          setSearchQuery('');
        }
        return;
      }

      // 5. No matches found
      showToast(
        `No se encontró ningún artículo por nombre, código o código de barra: "${query}"`,
        'warning'
      );
    }
  };

  // Add product to cart with stock validation in the selected warehouse & automatic per-article discount
  const addToCart = (product: Product) => {
    const availableStock = getPosWarehouseStock(product);
    const otherLocations = getOtherWarehousesWithStock(product);
    if (availableStock <= 0) {
      if (otherLocations.length > 0) {
        const locationsText = otherLocations
          .map((loc) => `${loc.warehouse.name} (${loc.stock} uds)`)
          .join(', ');
        showToast(
          `"${product.name}" no tiene existencia en ${selectedWarehouse.name}. Disponible en: ${locationsText}.`,
          'warning'
        );
      } else {
        showToast(`El producto "${product.name}" está agotado en todas las bodegas (Stock 0)`, 'error');
      }
      return;
    }

    const basePrice = Number(product.price) || 0;
    const assignedUnitDiscount = Math.min(
      basePrice,
      Math.max(0, Number(product.discount) || 0)
    );
    const effectiveUnitPrice = Math.max(0, basePrice - assignedUnitDiscount);

    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((it) => it.code === product.code);
      if (existingIndex >= 0) {
        const currentQty = prevCart[existingIndex].quantity;
        if (currentQty + 1 > availableStock) {
          showToast(
            `Stock máximo alcanzado en ${selectedWarehouse.name} para "${product.name}". Disponible: ${availableStock}`,
            'warning'
          );
          return prevCart;
        }
        const updated = [...prevCart];
        const newQty = currentQty + 1;
        updated[existingIndex] = {
          ...updated[existingIndex],
          quantity: newQty,
          subtotal: newQty * updated[existingIndex].price,
        };
        return updated;
      } else {
        return [
          ...prevCart,
          {
            productId: product.id,
            code: product.code,
            name: product.name,
            category: product.category,
            size: product.size,
            originalPrice: basePrice,
            unitDiscount: assignedUnitDiscount,
            price: effectiveUnitPrice,
            cost: Number(product.cost) || 0,
            quantity: 1,
            subtotal: effectiveUnitPrice,
          },
        ];
      }
    });
  };

  // Update item quantity in cart
  const updateCartQuantity = (code: string, newQty: number) => {
    const product = inventory.find((p) => p.code === code);
    const availableStock = product ? getPosWarehouseStock(product) : 9999;

    if (newQty <= 0) {
      removeFromCart(code);
      return;
    }

    if (newQty > availableStock) {
      showToast(
        `No puedes agregar más de ${availableStock} unidades disponibles en ${selectedWarehouse.name}.`,
        'warning'
      );
      newQty = availableStock;
    }

    setCart((prev) =>
      prev.map((item) => {
        if (item.code === code) {
          return {
            ...item,
            quantity: newQty,
            subtotal: newQty * item.price,
          };
        }
        return item;
      })
    );
  };

  // Update per-unit discount for a specific item in the cart
  const updateCartItemDiscount = (code: string, rawDiscount: number) => {
    setCart((prev) =>
      prev.map((item) => {
        if (item.code === code) {
          const basePrice =
            item.originalPrice !== undefined ? Number(item.originalPrice) : Number(item.price) || 0;
          const clampedDiscount = Math.min(
            basePrice,
            Math.max(0, Number(rawDiscount) || 0)
          );
          const effectivePrice = Math.max(0, basePrice - clampedDiscount);
          return {
            ...item,
            originalPrice: basePrice,
            unitDiscount: clampedDiscount,
            price: effectivePrice,
            subtotal: effectivePrice * item.quantity,
          };
        }
        return item;
      })
    );
  };

  // Remove single item from cart
  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((item) => item.code !== code));
  };

  // Loyalty Program State in POS
  const [selectedLoyaltyCustomerId, setSelectedLoyaltyCustomerId] = useState<string>('');
  const [redeemLoyaltyPoints, setRedeemLoyaltyPoints] = useState<boolean>(false);
  const [showCustomerFieldsPos, setShowCustomerFieldsPos] = useState<boolean>(false);

  const loyaltyConfig: LoyaltyProgramConfig = useMemo(
    () => ({
      enabled: posFinanceData?.loyaltyConfig?.enabled !== false,
      amountPerPoint: Math.max(1, Number(posFinanceData?.loyaltyConfig?.amountPerPoint) || 100),
      pointsEarnedPerStep: Math.max(
        1,
        Number(posFinanceData?.loyaltyConfig?.pointsEarnedPerStep) || 1
      ),
      lempirasPerPointRedeem: Math.max(
        0.1,
        Number(posFinanceData?.loyaltyConfig?.lempirasPerPointRedeem) || 5
      ),
      minPointsToRedeem: Math.max(
        1,
        Number(posFinanceData?.loyaltyConfig?.minPointsToRedeem) || 5
      ),
      welcomeBonusPoints: Math.max(
        0,
        Number(posFinanceData?.loyaltyConfig?.welcomeBonusPoints) || 0
      ),
    }),
    [posFinanceData?.loyaltyConfig]
  );

  const loyaltyCustomers: LoyaltyCustomerProfile[] = useMemo(
    () => posFinanceData?.loyaltyCustomers || [],
    [posFinanceData?.loyaltyCustomers]
  );

  // Auto-match customer by selected ID, phone number, or exact name
  const matchedLoyaltyCustomer = useMemo(() => {
    if (!loyaltyConfig.enabled) return null;
    if (selectedLoyaltyCustomerId) {
      const byId = loyaltyCustomers.find((c) => c.id === selectedLoyaltyCustomerId);
      if (byId) return byId;
    }
    const cleanDigits = customerPhone.replace(/\D/g, '');
    if (cleanDigits.length >= 7) {
      const byPhone = loyaltyCustomers.find(
        (c) => c.phone.replace(/\D/g, '') === cleanDigits
      );
      if (byPhone) return byPhone;
    }
    const cleanName = customerName.trim().toLowerCase();
    if (cleanName && cleanName !== 'consumidor final') {
      const byName = loyaltyCustomers.find((c) => c.name.trim().toLowerCase() === cleanName);
      if (byName) return byName;
    }
    return null;
  }, [
    loyaltyConfig.enabled,
    selectedLoyaltyCustomerId,
    customerPhone,
    customerName,
    loyaltyCustomers,
  ]);

  // Clear entire cart
  const clearCart = () => {
    setCart([]);
    setDiscountValue('');
    setCashGiven('');
    setCreditInitialDeposit('');
    setCreditDueDate('');
    setCustomerName('Consumidor Final');
    setCustomerRtn('');
    setCustomerPhone('');
    setSaleNotes('');
    setSelectedLoyaltyCustomerId('');
    setRedeemLoyaltyPoints(false);
    setMobilePosTab('catalog');
  };

  // Calculations for current cart
  const cartGrossSubtotal = useMemo(() => {
    return cart.reduce(
      (sum, it) =>
        sum + (it.originalPrice !== undefined ? Number(it.originalPrice) : it.price) * it.quantity,
      0
    );
  }, [cart]);

  const cartItemsDiscountTotal = useMemo(() => {
    return cart.reduce((sum, it) => sum + (Number(it.unitDiscount) || 0) * it.quantity, 0);
  }, [cart]);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, it) => sum + it.subtotal, 0);
  }, [cart]);

  const manualDiscountAmount = useMemo(() => {
    const rawVal = Math.max(0, parseFloat(discountValue) || 0);
    if (rawVal <= 0 || cartSubtotal <= 0) return 0;
    if (discountType === 'percent') {
      const clampedPct = Math.min(100, rawVal);
      return (cartSubtotal * clampedPct) / 100;
    }
    return Math.min(cartSubtotal, rawVal);
  }, [cartSubtotal, discountValue, discountType]);

  // Loyalty points redemption calculation
  const loyaltyRedemptionCalc = useMemo(() => {
    if (
      !loyaltyConfig.enabled ||
      !matchedLoyaltyCustomer ||
      !redeemLoyaltyPoints ||
      matchedLoyaltyCustomer.currentPoints < loyaltyConfig.minPointsToRedeem
    ) {
      return { pointsRedeemed: 0, discountLps: 0 };
    }
    const remainingAfterManual = Math.max(0, cartSubtotal - manualDiscountAmount);
    if (remainingAfterManual <= 0) return { pointsRedeemed: 0, discountLps: 0 };

    const maxPointsNeeded = Math.ceil(
      remainingAfterManual / loyaltyConfig.lempirasPerPointRedeem
    );
    const pointsToUse = Math.min(matchedLoyaltyCustomer.currentPoints, maxPointsNeeded);
    const discountLps = Math.min(
      remainingAfterManual,
      pointsToUse * loyaltyConfig.lempirasPerPointRedeem
    );
    return { pointsRedeemed: pointsToUse, discountLps };
  }, [
    loyaltyConfig,
    matchedLoyaltyCustomer,
    redeemLoyaltyPoints,
    cartSubtotal,
    manualDiscountAmount,
  ]);

  const discountAmount = useMemo(() => {
    return Math.min(cartSubtotal, manualDiscountAmount + loyaltyRedemptionCalc.discountLps);
  }, [cartSubtotal, manualDiscountAmount, loyaltyRedemptionCalc.discountLps]);

  const subtotalAfterDiscount = useMemo(() => {
    return Math.max(0, cartSubtotal - discountAmount);
  }, [cartSubtotal, discountAmount]);

  const taxAmount = useMemo(() => {
    return applyTax ? subtotalAfterDiscount * 0.15 : 0;
  }, [applyTax, subtotalAfterDiscount]);

  const cartTotal = useMemo(() => {
    return subtotalAfterDiscount + taxAmount;
  }, [subtotalAfterDiscount, taxAmount]);

  // Points that will be earned on this sale
  const pointsEarnedOnCurrentCart = useMemo(() => {
    if (!loyaltyConfig.enabled || cartTotal <= 0) return 0;
    const hasRealCustomer =
      Boolean(matchedLoyaltyCustomer) ||
      (customerName.trim() !== '' &&
        customerName.trim().toLowerCase() !== 'consumidor final') ||
      customerPhone.replace(/\D/g, '').length >= 7;
    if (!hasRealCustomer) return 0;
    return (
      Math.floor(cartTotal / loyaltyConfig.amountPerPoint) * loyaltyConfig.pointsEarnedPerStep
    );
  }, [loyaltyConfig, cartTotal, matchedLoyaltyCustomer, customerName, customerPhone]);

  const totalCartItemsCount = useMemo(() => {
    return cart.reduce((sum, it) => sum + it.quantity, 0);
  }, [cart]);

  // Cash change calculation
  const numericCashGiven = parseFloat(cashGiven) || 0;
  const cashChange = Math.max(0, numericCashGiven - cartTotal);
  const isCashInsufficient =
    paymentMethod === 'cash' && cart.length > 0 && numericCashGiven < cartTotal;

  // Process checkout & execute sale
  const handleCheckout = async () => {
    if (cart.length === 0) {
      playSound('error');
      showToast('El carrito está vacío. Agrega productos para vender.', 'warning');
      return;
    }

    // Verify stock availability in the selected warehouse right before saving
    for (const item of cart) {
      const liveProduct = inventory.find((p) => p.code === item.code);
      const currentStock = getPosWarehouseStock(liveProduct);
      if (item.quantity > currentStock) {
        playSound('error');
        showToast(
          `Stock insuficiente en "${selectedWarehouse.name}" para "${item.name}". Solo hay ${currentStock} unidades disponibles en esa bodega.`,
          'error'
        );
        return;
      }
    }

    if (paymentMethod === 'cash' && numericCashGiven < cartTotal) {
      playSound('error');
      showToast(
        `El efectivo recibido (L. ${numericCashGiven.toFixed(2)}) es menor que el total a pagar (L. ${cartTotal.toFixed(2)})`,
        'error'
      );
      return;
    }

    if (paymentMethod === 'credit') {
      const cleanCust = customerName.trim();
      if (!cleanCust || cleanCust.toLowerCase() === 'consumidor final') {
        playSound('error');
        showToast(
          'Para una venta al Crédito / Fiado debes ingresar el nombre real del cliente.',
          'warning'
        );
        return;
      }
    }

    // Play classic cash register sound ("Ka-Ching!") immediately on button press
    playSound('cash-register');

    setIsSubmittingSale(true);
    try {
      const now = new Date();
      const dateFormatted = now.toLocaleDateString('es-HN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const saleNumber = `VTA-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}${now.getDate().toString().padStart(2, '0')}-${Math.floor(1000 + Math.random() * 9000)}`;

      const isCredit = paymentMethod === 'credit';
      const initialDeposit = isCredit
        ? Math.min(cartTotal, Math.max(0, parseFloat(creditInitialDeposit) || 0))
        : 0;
      const computedBalanceDue = isCredit
        ? Math.max(0, Number((cartTotal - initialDeposit).toFixed(2)))
        : 0;
      const initialPaymentsList: CreditPaymentAbone[] =
        isCredit && initialDeposit > 0
          ? [
              {
                id: `abn_init_${Date.now()}`,
                amount: initialDeposit,
                paymentMethod: 'cash',
                timestamp: Date.now(),
                date: dateFormatted,
                receivedBy: userSession?.userName || 'Administrador',
                notes: 'Prima / Abono inicial en compra',
              },
            ]
          : [];

      // Compute loyalty points update if applicable
      const cleanCustName = customerName.trim() || matchedLoyaltyCustomer?.name || 'Consumidor Final';
      const cleanCustPhone = customerPhone.trim() || matchedLoyaltyCustomer?.phone || '';
      const cleanCustRtn = customerRtn.trim() || matchedLoyaltyCustomer?.rtn || '';

      const isLoyaltyEligible =
        loyaltyConfig.enabled &&
        (Boolean(matchedLoyaltyCustomer) ||
          (cleanCustName.toLowerCase() !== 'consumidor final' && cleanCustPhone.replace(/\D/g, '').length >= 7));

      const ptsRedeemed = isLoyaltyEligible ? loyaltyRedemptionCalc.pointsRedeemed : 0;
      const ptsDiscountLps = isLoyaltyEligible ? loyaltyRedemptionCalc.discountLps : 0;
      const ptsEarned = isLoyaltyEligible
        ? Math.floor(cartTotal / loyaltyConfig.amountPerPoint) * loyaltyConfig.pointsEarnedPerStep
        : 0;

      const prevPtsBalance = matchedLoyaltyCustomer
        ? Number(matchedLoyaltyCustomer.currentPoints) || 0
        : loyaltyConfig.welcomeBonusPoints || 0;
      const nextPtsBalance = isLoyaltyEligible
        ? Math.max(0, prevPtsBalance - ptsRedeemed + ptsEarned)
        : undefined;

      const targetLoyaltyId =
        matchedLoyaltyCustomer?.id ||
        (isLoyaltyEligible ? `vip_${Date.now()}` : undefined);

      const saleData: Omit<SaleRecord, 'id'> = {
        saleNumber,
        timestamp: Date.now(),
        date: dateFormatted,
        items: cart,
        totalItems: totalCartItemsCount,
        subtotal: cartSubtotal,
        discount: discountAmount,
        tax: taxAmount,
        total: cartTotal,
        paymentMethod,
        amountPaid:
          paymentMethod === 'cash'
            ? numericCashGiven
            : paymentMethod === 'credit'
            ? initialDeposit
            : cartTotal,
        change: paymentMethod === 'cash' ? cashChange : 0,
        balanceDue: computedBalanceDue,
        creditStatus: isCredit ? (computedBalanceDue <= 0.01 ? 'paid' : 'pending') : 'paid',
        creditDueDate: isCredit && creditDueDate ? creditDueDate : undefined,
        creditPayments: initialPaymentsList,
        customerName: cleanCustName,
        customerRtn: cleanCustRtn || undefined,
        customerPhone: cleanCustPhone || undefined,
        notes: saleNotes.trim() || undefined,
        status: 'completed',
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
        cashier: userSession?.userName || 'Administrador',
        cashierRole: userSession?.role || 'admin',
        loyaltyCustomerId: targetLoyaltyId,
        loyaltyPointsEarned: ptsEarned > 0 ? ptsEarned : undefined,
        loyaltyPointsRedeemed: ptsRedeemed > 0 ? ptsRedeemed : undefined,
        loyaltyDiscountAmount: ptsDiscountLps > 0 ? ptsDiscountLps : undefined,
        loyaltyPointsBalanceAfter: nextPtsBalance,
      };

      const result = await onRecordSale(saleData);

      const recorded: SaleRecord = (result as SaleRecord) || {
        id: Date.now().toString(),
        ...saleData,
      };

      // Update or auto-enroll Frequent Customer profile in POSFinanceStoreData
      if (isLoyaltyEligible && onSavePOSFinanceData && posFinanceData) {
        const nowMs = Date.now();
        const newLogs: LoyaltyTransactionLog[] = [];
        let runningBal = matchedLoyaltyCustomer
          ? Number(matchedLoyaltyCustomer.currentPoints) || 0
          : 0;

        if (!matchedLoyaltyCustomer && loyaltyConfig.welcomeBonusPoints > 0) {
          runningBal += loyaltyConfig.welcomeBonusPoints;
          newLogs.push({
            id: `log_wel_${nowMs}`,
            timestamp: nowMs,
            dateFormatted,
            type: 'bonus',
            points: loyaltyConfig.welcomeBonusPoints,
            balanceAfter: runningBal,
            notes: 'Bono de bienvenida al inscribirse en caja',
            registeredBy: userSession?.userName || 'Administrador',
          });
        }

        if (ptsRedeemed > 0) {
          runningBal = Math.max(0, runningBal - ptsRedeemed);
          newLogs.push({
            id: `log_red_${nowMs}`,
            timestamp: nowMs,
            dateFormatted,
            type: 'redeem',
            points: -ptsRedeemed,
            balanceAfter: runningBal,
            saleNumber,
            saleTotal: cartTotal,
            discountApplied: ptsDiscountLps,
            notes: `Canje de ${ptsRedeemed} pts (-L. ${ptsDiscountLps.toFixed(2)}) en ${saleNumber}`,
            registeredBy: userSession?.userName || 'Administrador',
          });
        }

        if (ptsEarned > 0) {
          runningBal += ptsEarned;
          newLogs.push({
            id: `log_earn_${nowMs}`,
            timestamp: nowMs + 1,
            dateFormatted,
            type: 'earn',
            points: ptsEarned,
            balanceAfter: runningBal,
            saleNumber,
            saleTotal: cartTotal,
            notes: `Puntos ganados en compra ${saleNumber} (L. ${cartTotal.toFixed(2)})`,
            registeredBy: userSession?.userName || 'Administrador',
          });
        }

        let updatedCustomersList: LoyaltyCustomerProfile[];
        if (matchedLoyaltyCustomer) {
          updatedCustomersList = loyaltyCustomers.map((c) =>
            c.id === matchedLoyaltyCustomer.id
              ? {
                  ...c,
                  name: cleanCustName || c.name,
                  phone: cleanCustPhone || c.phone,
                  rtn: cleanCustRtn || c.rtn,
                  currentPoints: runningBal,
                  totalPointsEarned: (c.totalPointsEarned || 0) + ptsEarned,
                  totalPointsRedeemed: (c.totalPointsRedeemed || 0) + ptsRedeemed,
                  totalPurchasesAmount: (c.totalPurchasesAmount || 0) + cartTotal,
                  purchasesCount: (c.purchasesCount || 0) + 1,
                  history: [...newLogs.reverse(), ...(c.history || [])].slice(0, 80),
                  updatedAt: nowMs,
                }
              : c
          );
        } else {
          const nextCode = `VIP-${1001 + loyaltyCustomers.length}`;
          const newProfile: LoyaltyCustomerProfile = {
            id: targetLoyaltyId || `vip_${nowMs}`,
            code: nextCode,
            name: cleanCustName,
            phone: cleanCustPhone,
            rtn: cleanCustRtn || undefined,
            currentPoints: runningBal,
            totalPointsEarned:
              (loyaltyConfig.welcomeBonusPoints || 0) + ptsEarned,
            totalPointsRedeemed: ptsRedeemed,
            totalPurchasesAmount: cartTotal,
            purchasesCount: 1,
            history: newLogs.reverse(),
            createdAt: nowMs,
            updatedAt: nowMs,
          };
          updatedCustomersList = [newProfile, ...loyaltyCustomers];
        }

        await onSavePOSFinanceData({
          ...posFinanceData,
          loyaltyCustomers: updatedCustomersList,
          updatedAt: nowMs,
        });
      }

      setCompletedSale(recorded);
      setShowReceiptModal(true);
      clearCart();
      showToast(
        isCredit
          ? `¡Venta al Crédito ${saleNumber} registrada desde ${selectedWarehouse.name}! Saldo pendiente: L. ${computedBalanceDue.toFixed(2)}`
          : ptsEarned > 0 || ptsRedeemed > 0
          ? `¡Venta ${saleNumber} completada! ${
              ptsRedeemed > 0 ? `Canjeó ${ptsRedeemed} pts (-L. ${ptsDiscountLps.toFixed(2)}) • ` : ''
            }Cliente sumó +${ptsEarned} pts (Saldo: ${nextPtsBalance ?? 0} pts)`
          : `¡Venta ${saleNumber} registrada con éxito desde ${selectedWarehouse.name}!`,
        'success'
      );
    } catch (err: any) {
      console.error('Checkout error:', err);
      showToast(`Error al registrar la venta: ${err?.message || err}`, 'error');
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Print Receipt / Invoice handler (supports PC Bridge POST /imprimir from DOM capture + automatic fallback to window.print() with thermal CSS)
  const handlePrintReceipt = async (
    formatOverride?: PrinterPaperFormat,
    targetSaleOverride?: SaleRecord
  ) => {
    const saleToPrint = targetSaleOverride || completedSale;
    if (!saleToPrint) return;
    const fmt = formatOverride || receiptPrinterFormat;
    setPreferredPrinterFormat(fmt);
    const opt = PRINTER_FORMAT_OPTIONS.find((o) => o.id === fmt);
    const sellerInfo = getSaleSellerInfo(saleToPrint);
    const sellerStr = `${sellerInfo.name} (${sellerInfo.roleLabel})`;

    // 1. Si hay un servidor puente en la PC de caja configurado y el contenedor del ticket está montado:
    const bridgeCfg = getBridgeConfig();
    if (bridgeCfg.enabled && bridgeCfg.pcIp && receiptPrintRef.current && !targetSaleOverride) {
      showToast(
        `Capturando ticket (${opt?.shortLabel || fmt}) y enviando a PC de Caja (${bridgeCfg.pcIp})...`,
        'info'
      );
      const bridgeResult = await sendTicketToBridgeServer({
        ticketElement: receiptPrintRef.current,
        format: fmt,
      });
      if (bridgeResult.ok) {
        showToast(
          `¡Ticket impreso en "${bridgeResult.printerName || 'PC de Caja'}" (${opt?.shortLabel || fmt})!`,
          'success'
        );
        return;
      }
      // Modo respaldo (Fallback): Si el celular o equipo no detecta la PC en la red local,
      // imprime directamente con window.print() aplicando las reglas CSS térmicas sobre el contenedor del ticket.
      showToast(
        'PC de caja no detectada en red local. Abriendo impresión directa de respaldo...',
        'warning'
      );
      if (fmt === '58mm' || fmt === '80mm') {
        printTicketDomElementWithFallbackCss(
          receiptPrintRef.current,
          fmt,
          `Factura ${saleToPrint.saleNumber}`
        );
        return;
      }
    }

    // 2. Impresión directa / Respaldo universal (Bluetooth/USB/Sistema window.print con reglas @page térmicas)
    const html = buildSaleDocumentHtml(saleToPrint, storeSettings, fmt, sellerStr);
    printHtmlDocument(
      html,
      `Factura ${saleToPrint.saleNumber}`,
      fmt,
      storeSettings,
      saleToPrint,
      sellerStr
    );
    showToast(
      `Enviando comprobante a impresora en formato ${opt?.shortLabel || fmt}...`,
      'info'
    );
  };

  // Direct PDF Download for a single sale invoice / ticket
  const handleDownloadSalePdf = async (formatOverride?: PrinterPaperFormat, targetSaleOverride?: SaleRecord) => {
    const saleToDownload = targetSaleOverride || completedSale;
    if (!saleToDownload) return;
    const fmt = formatOverride || receiptPrinterFormat;
    const sellerInfo = getSaleSellerInfo(saleToDownload);
    await downloadSalePdf(
      saleToDownload,
      storeSettings,
      fmt,
      `${sellerInfo.name} (${sellerInfo.roleLabel})`
    );
    showToast(`PDF Ejecutivo de ${saleToDownload.saleNumber} descargado correctamente.`, 'success');
  };

  // Generate a formatted, professional digital ticket for WhatsApp
  const formatTicketMessage = (sale: SaleRecord): string => {
    const sName = (storeSettings.storeName || 'TIENDA GOSÉN').toUpperCase();
    const sTagline = storeSettings.tagline ? `_${storeSettings.tagline}_\n` : '';
    const sAddress = storeSettings.address ? `📍 ${storeSettings.address}\n` : '';
    const sPhone = storeSettings.phone ? `📞 Tel: ${storeSettings.phone}\n` : '';

    let text = `🧾 *${sName}*\n`;
    if (sTagline) text += `${sTagline}`;
    if (sAddress) text += `${sAddress}`;
    if (sPhone) text += `${sPhone}`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📄 *TICKET DE COMPRA DIGITAL*\n`;
    text += `*N° Ticket:* ${sale.saleNumber}\n`;
    text += `*Fecha:* ${sale.date}\n`;
    text += `*Cliente:* ${sale.customerName || 'Consumidor Final'}\n`;
    if (sale.customerRtn) {
      text += `*RTN / DNI:* ${sale.customerRtn}\n`;
    }
    if (sale.customerPhone) {
      text += `*Teléfono:* ${sale.customerPhone}\n`;
    }
    const sellerInfo = getSaleSellerInfo(sale);
    text += `*Atendido por:* ${sellerInfo.name} (${sellerInfo.roleLabel})\n`;
    if (sale.status === 'cancelled') {
      text += `\n⚠️ *VENTA ANULADA*\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `🛍️ *PRODUCTOS:*\n`;

    const itemsDiscountSum = sale.items.reduce(
      (sum, it) => sum + (Number(it.unitDiscount) || 0) * it.quantity,
      0
    );

    sale.items.forEach((item) => {
      const sizeStr = item.size ? ` (Talla: ${item.size})` : '';
      const codeStr = item.code ? `Cód: ${item.code} • ` : '';
      const unitDisc = Number(item.unitDiscount) || 0;
      const origPrice =
        item.originalPrice !== undefined ? Number(item.originalPrice) : item.price + unitDisc;
      text += `• *${item.quantity}x* ${item.name}${sizeStr}\n`;
      if (unitDisc > 0) {
        text += `  ↳ ${codeStr}L. ${item.subtotal.toFixed(2)}  _(Antes L. ${origPrice.toFixed(2)} | Desc: -L. ${unitDisc.toFixed(2)} c/u → L. ${item.price.toFixed(2)} c/u)_\n`;
      } else {
        text += `  ↳ ${codeStr}L. ${item.subtotal.toFixed(2)}  _(L. ${item.price.toFixed(2)} c/u)_\n`;
      }
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (itemsDiscountSum > 0) {
      text += `*Ahorro en artículos:* - L. ${itemsDiscountSum.toFixed(2)}\n`;
    }
    text += `*Subtotal:* L. ${sale.subtotal.toFixed(2)}\n`;
    if (sale.discount > 0) {
      text += `*Descuento adicional:* - L. ${sale.discount.toFixed(2)}\n`;
    }
    if (sale.tax > 0) {
      text += `*15% ISV:* L. ${sale.tax.toFixed(2)}\n`;
    }
    text += `*TOTAL FACTURA:* L. ${sale.total.toFixed(2)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💳 *Método de pago:* ${
      sale.paymentMethod === 'cash'
        ? 'Efectivo'
        : sale.paymentMethod === 'card'
        ? 'Tarjeta'
        : sale.paymentMethod === 'transfer'
        ? 'Transferencia Bancaria'
        : sale.paymentMethod === 'credit'
        ? 'CRÉDITO / FIADO'
        : 'Otro'
    }\n`;

    if (sale.paymentMethod === 'cash' && sale.amountPaid) {
      text += `*Efectivo recibido:* L. ${sale.amountPaid.toFixed(2)}\n`;
      text += `*Cambio / Vuelto:* L. ${sale.change.toFixed(2)}\n`;
    } else if (sale.paymentMethod === 'credit') {
      const bal =
        sale.balanceDue !== undefined
          ? Number(sale.balanceDue)
          : Math.max(0, sale.total - (sale.amountPaid || 0));
      text += `*Abono / Prima Pagada:* L. ${(sale.amountPaid || 0).toFixed(2)}\n`;
      text += `📌 *SALDO PENDIENTE:* L. ${bal.toFixed(2)}\n`;
      if (sale.creditDueDate) {
        text += `⏰ *Fecha de Pago:* ${sale.creditDueDate}\n`;
      }
    }

    if (sale.notes) {
      text += `*Nota:* ${sale.notes}\n`;
    }

    if (
      (sale.loyaltyPointsEarned && sale.loyaltyPointsEarned > 0) ||
      (sale.loyaltyPointsRedeemed && sale.loyaltyPointsRedeemed > 0) ||
      sale.loyaltyPointsBalanceAfter !== undefined
    ) {
      text += `━━━━━━━━━━━━━━━━━━━━━\n`;
      text += `🏆 *PROGRAMA CLIENTE FRECUENTE:*\n`;
      if (sale.loyaltyPointsRedeemed && sale.loyaltyPointsRedeemed > 0) {
        text += `🎁 *Puntos Canjeados hoy:* -${sale.loyaltyPointsRedeemed} pts (-L. ${(
          sale.loyaltyDiscountAmount || 0
        ).toFixed(2)})\n`;
      }
      if (sale.loyaltyPointsEarned && sale.loyaltyPointsEarned > 0) {
        text += `⭐ *Puntos Ganados en esta compra:* +${sale.loyaltyPointsEarned} pts\n`;
      }
      if (sale.loyaltyPointsBalanceAfter !== undefined) {
        text += `💎 *Nuevo Saldo Acumulado:* *${sale.loyaltyPointsBalanceAfter} Puntos* _(Equivalente a L. ${(
          sale.loyaltyPointsBalanceAfter * loyaltyConfig.lempirasPerPointRedeem
        ).toFixed(2)})_\n`;
      }
    }

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `✨ *¡Muchas gracias por su preferencia!*\n`;
    text += `Guarde este ticket para cualquier cambio o garantía.`;

    return text;
  };

  // WhatsApp sender handler
  const handleSendTicketWhatsApp = (saleRecord?: SaleRecord, customPhone?: string) => {
    const targetSale = saleRecord || completedSale;
    if (!targetSale) {
      if (showToast) showToast('No hay una venta seleccionada para enviar.', 'warning');
      return;
    }

    const message = formatTicketMessage(targetSale);
    const rawPhone = (
      customPhone !== undefined ? customPhone : (receiptWhatsAppPhone || targetSale.customerPhone || '')
    ).trim();

    const cleanDigits = rawPhone.replace(/\D/g, '');

    let url = '';
    if (cleanDigits.length > 0) {
      // Default to Honduras (504) if 8 digits standard
      const finalPhone = cleanDigits.length === 8 ? `504${cleanDigits}` : cleanDigits;
      url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    if (showToast) {
      showToast('Abriendo WhatsApp con el ticket de factura...', 'success');
    }
  };

  // Copy ticket text to clipboard handler
  const handleCopyTicketText = async (saleRecord?: SaleRecord) => {
    const targetSale = saleRecord || completedSale;
    if (!targetSale) return;
    try {
      const message = formatTicketMessage(targetSale);
      await navigator.clipboard.writeText(message);
      if (showToast) {
        showToast('¡Texto del ticket copiado al portapapeles!', 'success');
      }
    } catch {
      if (showToast) {
        showToast('No se pudo copiar al portapapeles.', 'error');
      }
    }
  };

  // ------------------ HISTORIAL FILTERING & METRICS ------------------
  const getHondurasDateStr = (ms: number): string => {
    try {
      return new Intl.DateTimeFormat('es-HN', {
        timeZone: 'America/Tegucigalpa',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(new Date(ms));
    } catch {
      const d = new Date(ms);
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}/${mm}/${d.getFullYear()}`;
    }
  };

  const getLocalDateStr = (ms: number): string => {
    const d = new Date(ms);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  };

  const isSaleMatchingDay = (s: SaleRecord, targetHnDate: string, targetLocalDate: string, startMs: number, endMs: number): boolean => {
    const rawDatePrefix = (s.date || '').split(',')[0].trim();
    if (rawDatePrefix && (rawDatePrefix === targetHnDate || rawDatePrefix === targetLocalDate)) {
      return true;
    }
    if (s.timestamp) {
      const saleHnDate = getHondurasDateStr(s.timestamp);
      if (saleHnDate === targetHnDate) return true;
      if (s.timestamp >= startMs && s.timestamp < endMs) return true;
    }
    return false;
  };

  const MONTH_NAMES = [
    { value: '1', label: 'Enero', short: 'Ene' },
    { value: '2', label: 'Febrero', short: 'Feb' },
    { value: '3', label: 'Marzo', short: 'Mar' },
    { value: '4', label: 'Abril', short: 'Abr' },
    { value: '5', label: 'Mayo', short: 'May' },
    { value: '6', label: 'Junio', short: 'Jun' },
    { value: '7', label: 'Julio', short: 'Jul' },
    { value: '8', label: 'Agosto', short: 'Ago' },
    { value: '9', label: 'Septiembre', short: 'Sep' },
    { value: '10', label: 'Octubre', short: 'Oct' },
    { value: '11', label: 'Noviembre', short: 'Nov' },
    { value: '12', label: 'Diciembre', short: 'Dic' },
  ];

  // Extract Year, Month (1-12), Day (1-31), and YYYY-MM-DD in Honduras timezone or from sale.date
  const getSaleCalendarParts = (s: SaleRecord): { year: number; month: number; day: number; isoDate: string } => {
    const rawDatePrefix = (s.date || '').split(',')[0].trim();
    const dmyMatch = rawDatePrefix.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmyMatch) {
      const day = parseInt(dmyMatch[1], 10);
      const month = parseInt(dmyMatch[2], 10);
      const year = parseInt(dmyMatch[3], 10);
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { year, month, day, isoDate };
    }
    const hnStr = getHondurasDateStr(s.timestamp || Date.now());
    const hnMatch = hnStr.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (hnMatch) {
      const day = parseInt(hnMatch[1], 10);
      const month = parseInt(hnMatch[2], 10);
      const year = parseInt(hnMatch[3], 10);
      const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return { year, month, day, isoDate };
    }
    const d = new Date(s.timestamp || Date.now());
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    return {
      year,
      month,
      day,
      isoDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    };
  };

  // Available years dynamically computed from sales + current year
  const availableSalesYears = useMemo(() => {
    const currentYr = new Date().getFullYear();
    const yearsSet = new Set<number>([currentYr, currentYr - 1]);
    sales.forEach((s) => {
      const { year } = getSaleCalendarParts(s);
      if (year >= 2020 && year <= 2100) yearsSet.add(year);
    });
    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [sales]);

  // Count of sales per month (1..12) for the selected year (or all years)
  const monthSalesCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (let m = 1; m <= 12; m++) counts[String(m)] = 0;
    sales.forEach((s) => {
      const parts = getSaleCalendarParts(s);
      if (historyYearFilter !== 'all' && String(parts.year) !== historyYearFilter) return;
      counts[String(parts.month)] = (counts[String(parts.month)] || 0) + 1;
    });
    return counts;
  }, [sales, historyYearFilter]);

  const dateFilterCounts = useMemo(() => {
    const now = new Date();
    const nowMs = now.getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;

    const todayHn = getHondurasDateStr(nowMs);
    const yesterdayHn = getHondurasDateStr(nowMs - 24 * 60 * 60 * 1000);
    const todayLocal = getLocalDateStr(nowMs);
    const yesterdayLocal = getLocalDateStr(startOfYesterday);

    let todayCount = 0;
    let yesterdayCount = 0;

    sales.forEach((s) => {
      if (isSaleMatchingDay(s, todayHn, todayLocal, startOfToday, endOfToday)) {
        todayCount++;
      } else if (isSaleMatchingDay(s, yesterdayHn, yesterdayLocal, startOfYesterday, startOfToday)) {
        yesterdayCount++;
      }
    });

    return {
      today: todayCount,
      yesterday: yesterdayCount,
      today_yesterday: todayCount + yesterdayCount,
      all: sales.length,
    };
  }, [sales]);

  const activePeriodLabel = useMemo(() => {
    if (historyDateFilter === 'today') return 'Hoy';
    if (historyDateFilter === 'yesterday') return 'Ayer';
    if (historyDateFilter === 'today_yesterday') return 'Hoy y Ayer';
    if (historyDateFilter === 'week') return 'Últimos 7 días';
    if (historyDateFilter === 'month') return 'Este mes';
    if (historyDateFilter === 'custom') {
      if (historyExactDate) {
        const [y, m, d] = historyExactDate.split('-');
        const mObj = MONTH_NAMES.find((item) => Number(item.value) === Number(m));
        return `Fecha: ${d} de ${mObj?.label || m} de ${y}`;
      }
      const parts: string[] = [];
      if (historyDayFilter !== 'all') parts.push(`Día ${historyDayFilter.padStart(2, '0')}`);
      if (historyMonthFilter !== 'all') {
        const mObj = MONTH_NAMES.find((item) => item.value === historyMonthFilter);
        parts.push(mObj?.label || `Mes ${historyMonthFilter}`);
      }
      if (historyYearFilter !== 'all') parts.push(historyYearFilter);
      return parts.length > 0 ? parts.join(' de ') : 'Filtro personalizado';
    }
    return 'Todo el historial';
  }, [historyDateFilter, historyExactDate, historyYearFilter, historyMonthFilter, historyDayFilter]);

  const filteredSalesHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const now = new Date();
    const nowMs = now.getTime();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 24 * 60 * 60 * 1000;
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const todayHn = getHondurasDateStr(nowMs);
    const yesterdayHn = getHondurasDateStr(nowMs - 24 * 60 * 60 * 1000);
    const todayLocal = getLocalDateStr(nowMs);
    const yesterdayLocal = getLocalDateStr(startOfYesterday);

    return sales.filter((s) => {
      const isToday = isSaleMatchingDay(s, todayHn, todayLocal, startOfToday, endOfToday);
      const isYesterday = !isToday && isSaleMatchingDay(s, yesterdayHn, yesterdayLocal, startOfYesterday, startOfToday);

      // Date filter
      if (historyDateFilter === 'today' && !isToday) return false;
      if (historyDateFilter === 'yesterday' && !isYesterday) return false;
      if (historyDateFilter === 'today_yesterday' && !isToday && !isYesterday) return false;
      if (historyDateFilter === 'week' && !isToday && !isYesterday && s.timestamp < startOfWeek) return false;
      if (historyDateFilter === 'month' && !isToday && !isYesterday && s.timestamp < startOfMonth) return false;
      if (historyDateFilter === 'custom') {
        const cal = getSaleCalendarParts(s);
        if (historyExactDate && cal.isoDate !== historyExactDate) return false;
        if (historyYearFilter !== 'all' && String(cal.year) !== historyYearFilter) return false;
        if (historyMonthFilter !== 'all' && String(cal.month) !== historyMonthFilter) return false;
        if (historyDayFilter !== 'all' && String(cal.day) !== historyDayFilter) return false;
      }

      // Status filter
      if (historyStatusFilter !== 'all' && s.status !== historyStatusFilter) return false;

      // Payment filter
      if (historyPaymentFilter !== 'all' && s.paymentMethod !== historyPaymentFilter) return false;

      const sellerInfo = getSaleSellerInfo(s);

      // Seller Role filter (Administrador vs Colaborador)
      if (historySellerFilter !== 'all' && sellerInfo.role !== historySellerFilter) return false;

      // Search query (sale number, customer name, rtn, seller name/role, or item name/code)
      if (q) {
        const matchesSaleNum = s.saleNumber.toLowerCase().includes(q);
        const matchesCustomer = (s.customerName || '').toLowerCase().includes(q);
        const matchesRtn = (s.customerRtn || '').toLowerCase().includes(q);
        const matchesSeller =
          sellerInfo.name.toLowerCase().includes(q) ||
          sellerInfo.roleLabel.toLowerCase().includes(q);
        const matchesItem = s.items.some(
          (it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)
        );
        if (!matchesSaleNum && !matchesCustomer && !matchesRtn && !matchesSeller && !matchesItem)
          return false;
      }

      return true;
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [
    sales,
    users,
    historySearch,
    historyDateFilter,
    historyYearFilter,
    historyMonthFilter,
    historyDayFilter,
    historyExactDate,
    historyStatusFilter,
    historyPaymentFilter,
    historySellerFilter,
  ]);

  // Sales History Pagination State
  const [historyPage, setHistoryPage] = useState<number>(1);
  const HISTORY_PAGE_SIZE = 25;

  useEffect(() => {
    setHistoryPage(1);
  }, [
    historySearch,
    historyDateFilter,
    historyYearFilter,
    historyMonthFilter,
    historyDayFilter,
    historyExactDate,
    historyStatusFilter,
    historyPaymentFilter,
    historySellerFilter,
  ]);

  const totalHistoryPages = Math.max(1, Math.ceil(filteredSalesHistory.length / HISTORY_PAGE_SIZE));
  const paginatedSalesHistory = useMemo(() => {
    const start = (historyPage - 1) * HISTORY_PAGE_SIZE;
    return filteredSalesHistory.slice(start, start + HISTORY_PAGE_SIZE);
  }, [filteredSalesHistory, historyPage]);

  // Map of product code -> cost for fast O(1) fallback if an older sale item has cost=0
  const inventoryCostMap = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((p) => {
      map.set((p.code || '').trim().toLowerCase(), Number(p.cost) || 0);
    });
    return map;
  }, [inventory]);

  // Helper to compute exact cost, net revenue (excluding ISV), profit and margin for a single sale
  const getSaleFinancials = (sale: SaleRecord) => {
    const netRevenue = Math.max(
      0,
      (Number(sale.subtotal) || Number(sale.total) || 0) - (Number(sale.discount) || 0)
    );
    let totalCost = 0;
    (sale.items || []).forEach((it) => {
      const unitCost =
        Number(it.cost) ||
        inventoryCostMap.get((it.code || '').trim().toLowerCase()) ||
        0;
      totalCost += unitCost * (Number(it.quantity) || 0);
    });
    const profit = netRevenue - totalCost;
    const marginPct = netRevenue > 0 ? (profit / netRevenue) * 100 : 0;
    return { netRevenue, totalCost, profit, marginPct };
  };

  // Overall statistics for sales
  const salesMetrics = useMemo(() => {
    const validSales = filteredSalesHistory.filter((s) => s.status === 'completed');
    const totalRevenue = validSales.reduce((sum, s) => sum + s.total, 0);
    const totalItemsSold = validSales.reduce((sum, s) => sum + s.totalItems, 0);
    const averageTicket = validSales.length > 0 ? totalRevenue / validSales.length : 0;

    let totalCost = 0;
    let totalNetRevenue = 0;
    validSales.forEach((s) => {
      const fin = getSaleFinancials(s);
      totalCost += fin.totalCost;
      totalNetRevenue += fin.netRevenue;
    });
    const estimatedProfit = totalNetRevenue - totalCost;
    const marginPct = totalNetRevenue > 0 ? (estimatedProfit / totalNetRevenue) * 100 : 0;

    return {
      count: validSales.length,
      revenue: totalRevenue,
      netRevenue: totalNetRevenue,
      totalCost,
      itemsSold: totalItemsSold,
      avgTicket: averageTicket,
      profit: estimatedProfit,
      marginPct,
      cancelledCount: filteredSalesHistory.filter((s) => s.status === 'cancelled').length,
    };
  }, [filteredSalesHistory, inventoryCostMap]);

  // Confirm Sale Cancellation
  const handleConfirmCancelSale = async () => {
    if (!saleToCancel) return;
    setIsCancelling(true);
    try {
      await onCancelSale(saleToCancel);
      showToast(
        `Venta ${saleToCancel.saleNumber} anulada. El stock de los artículos ha sido restaurado en el inventario.`,
        'success'
      );
      setSaleToCancel(null);
    } catch (err: any) {
      console.error('Cancel sale error:', err);
      showToast(`Error al anular la venta: ${err?.message || err}`, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Export Sales to organized Excel (.xlsx) (includes Cost, Profit & Margin)
  const handleExportCSV = () => {
    if (filteredSalesHistory.length === 0) {
      showToast('No hay ventas para exportar con los filtros seleccionados.', 'warning');
      return;
    }

    const storeTitle = (storeSettings.storeName || 'Tienda Gosén').toUpperCase();
    const emittedAt = new Date().toLocaleString('es-HN');

    const sheetAoA: (string | number)[][] = [
      [`${storeTitle} — REPORTE DETALLADO DE HISTORIAL DE VENTAS Y UTILIDADES`],
      [`Fecha de Emisión: ${emittedAt}   |   Total de Transacciones: ${filteredSalesHistory.length}`],
      [],
      [
        'N° VENTA',
        'FECHA',
        'HORA',
        'CLIENTE',
        'RTN / DNI',
        'VENDEDOR / USUARIO',
        'ROL VENDEDOR',
        'MÉTODO DE PAGO',
        'ARTÍCULOS (CANT)',
        'SUBTOTAL (L)',
        'DESCUENTO (L)',
        'ISV (L)',
        'TOTAL FACTURADO (L)',
        'COSTO TOTAL (L)',
        'GANANCIA NETA (L)',
        'MARGEN (%)',
        'EFECTIVO RECIBIDO (L)',
        'CAMBIO (L)',
        'ESTADO',
        'DETALLE DE PRODUCTOS VENDIDOS',
      ],
    ];

    filteredSalesHistory.forEach((s) => {
      const seller = getSaleSellerInfo(s);
      const fin = getSaleFinancials(s);
      let fechaPart = s.date || '-';
      let horaPart = '-';
      if (s.date && s.date.includes(',')) {
        const [d, t] = s.date.split(',');
        fechaPart = d.trim();
        horaPart = (t || '').trim() || '-';
      }

      const paymentLabel =
        s.paymentMethod === 'cash'
          ? 'Efectivo'
          : s.paymentMethod === 'card'
          ? 'Tarjeta POS'
          : s.paymentMethod === 'transfer'
          ? 'Transferencia'
          : s.paymentMethod === 'credit'
          ? 'Crédito Cliente'
          : s.paymentMethod;

      sheetAoA.push([
        s.saleNumber,
        fechaPart,
        horaPart,
        s.customerName || 'Consumidor Final',
        s.customerRtn || '-',
        seller.name,
        seller.roleLabel,
        paymentLabel,
        Number(s.totalItems) || 0,
        Number(s.subtotal.toFixed(2)),
        Number(s.discount.toFixed(2)),
        Number(s.tax.toFixed(2)),
        Number(s.total.toFixed(2)),
        s.status === 'completed' ? Number(fin.totalCost.toFixed(2)) : 0,
        s.status === 'completed' ? Number(fin.profit.toFixed(2)) : 0,
        s.status === 'completed' ? `${fin.marginPct.toFixed(1)}%` : '0%',
        Number((s.amountPaid || 0).toFixed(2)),
        Number((s.change || 0).toFixed(2)),
        s.status === 'completed' ? 'Completada' : 'Anulada',
        (s.items || []).map((it) => `${it.quantity}x ${it.name} (${it.code})`).join('   •   '),
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetAoA);

    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 19 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 19 } },
    ];

    worksheet['!autofilter'] = {
      ref: `A4:T${sheetAoA.length}`,
    };

    worksheet['!cols'] = [
      { wch: 15 }, // N° VENTA
      { wch: 14 }, // FECHA
      { wch: 15 }, // HORA
      { wch: 24 }, // CLIENTE
      { wch: 16 }, // RTN / DNI
      { wch: 22 }, // VENDEDOR / USUARIO
      { wch: 16 }, // ROL VENDEDOR
      { wch: 18 }, // MÉTODO DE PAGO
      { wch: 16 }, // ARTÍCULOS (CANT)
      { wch: 15 }, // SUBTOTAL (L)
      { wch: 15 }, // DESCUENTO (L)
      { wch: 13 }, // ISV (L)
      { wch: 20 }, // TOTAL FACTURADO (L)
      { wch: 16 }, // COSTO TOTAL (L)
      { wch: 18 }, // GANANCIA NETA (L)
      { wch: 13 }, // MARGEN (%)
      { wch: 20 }, // EFECTIVO RECIBIDO (L)
      { wch: 14 }, // CAMBIO (L)
      { wch: 14 }, // ESTADO
      { wch: 58 }, // DETALLE DE PRODUCTOS VENDIDOS
    ];

    worksheet['!rows'] = [
      { hpt: 26 },
      { hpt: 20 },
      { hpt: 12 },
      { hpt: 26 },
      ...filteredSalesHistory.map(() => ({ hpt: 22 })),
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial Ventas');
    XLSX.writeFile(
      workbook,
      `Historial_Ventas_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    showToast('Excel (.xlsx) de ventas exportado con todas las columnas organizadas.', 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-50 overflow-hidden">
      {/* Top Bar / Navigation Tabs — Compact height with generous spacing between buttons */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-5 py-2 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 shrink-0 shadow-2xs">
        <div className="flex items-center justify-between min-w-0 shrink-0">
          <h1 className="text-sm sm:text-base font-extrabold text-slate-900 tracking-tight flex items-center gap-2 truncate">
            <ShoppingCart className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 shrink-0" />
            <span className="truncate">Ventas &amp; Facturación</span>
          </h1>
        </div>

        {/* View Switcher Tabs — Well-spaced buttons */}
        <div className="flex items-center gap-2 bg-slate-100/90 p-1.5 rounded-2xl border border-slate-200/80 overflow-x-auto max-w-full scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveSubTab('pos')}
            className={`min-h-[38px] flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
              activeSubTab === 'pos'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white/70 text-slate-700 hover:text-slate-900 hover:bg-white border border-slate-200/60'
            }`}
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            <span>Nueva Venta (POS)</span>
            {cart.length > 0 && (
              <span className="bg-white text-emerald-800 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0 shadow-2xs">
                {totalCartItemsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('cash-register')}
            className={`min-h-[38px] flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
              activeSubTab === 'cash-register'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white/70 text-slate-700 hover:text-slate-900 hover:bg-white border border-slate-200/60'
            }`}
          >
            <Wallet className="w-4 h-4 shrink-0" />
            <span>Caja / Arqueo</span>
            {(posFinanceData?.shifts || []).some((s) => s.status === 'open') && (
              <span
                className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shrink-0 ring-2 ring-emerald-300"
                title="Caja Abierta"
              />
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('credits')}
            className={`min-h-[38px] flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
              activeSubTab === 'credits'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'bg-white/70 text-slate-700 hover:text-slate-900 hover:bg-white border border-slate-200/60'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Cuentas por Cobrar</span>
            {sales.filter(
              (s) =>
                s.status === 'completed' &&
                (s.balanceDue ??
                  (s.paymentMethod === 'credit' ? s.total - (s.amountPaid || 0) : 0)) > 0.01
            ).length > 0 && (
              <span className="bg-amber-100 text-amber-900 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
                {
                  sales.filter(
                    (s) =>
                      s.status === 'completed' &&
                      (s.balanceDue ??
                        (s.paymentMethod === 'credit' ? s.total - (s.amountPaid || 0) : 0)) > 0.01
                  ).length
                }
              </span>
            )}
          </button>

          {canViewCostsAndProfits && (
            <button
              type="button"
              onClick={() => setActiveSubTab('expenses')}
              className={`min-h-[38px] flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
                activeSubTab === 'expenses'
                  ? 'bg-rose-600 text-white shadow-xs'
                  : 'bg-white/70 text-slate-700 hover:text-slate-900 hover:bg-white border border-slate-200/60'
              }`}
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              <span>Gastos y Utilidad</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveSubTab('loyalty')}
            className={`min-h-[38px] flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
              activeSubTab === 'loyalty'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-white/70 text-slate-700 hover:text-slate-900 hover:bg-white border border-slate-200/60'
            }`}
          >
            <Award className="w-4 h-4 shrink-0" />
            <span>Clientes VIP / Puntos</span>
            {loyaltyCustomers.length > 0 && (
              <span className="bg-amber-100 text-amber-950 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
                {loyaltyCustomers.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            className={`min-h-[38px] flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
              activeSubTab === 'history'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'bg-white/70 text-slate-700 hover:text-slate-900 hover:bg-white border border-slate-200/60'
            }`}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Historial</span>
            <span className="bg-slate-200 text-slate-800 text-[10px] font-black px-2 py-0.5 rounded-full shrink-0">
              {sales.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeSubTab === 'cash-register' ||
      activeSubTab === 'credits' ||
      activeSubTab === 'expenses' ||
      activeSubTab === 'loyalty' ? (
        <POSFinanceTabs
          mode={activeSubTab}
          inventory={inventory}
          sales={sales}
          storeSettings={storeSettings}
          userSession={userSession}
          posFinanceData={
            posFinanceData || {
              companyId: storeSettings.companyId || 'gosen',
              shifts: [],
              expenses: [],
              updatedAt: Date.now(),
            }
          }
          onSavePOSFinanceData={async (updated) => {
            if (onSavePOSFinanceData) await onSavePOSFinanceData(updated);
          }}
          onRecordCreditPayment={async (sale, abone) => {
            if (onRecordCreditPayment) return await onRecordCreditPayment(sale, abone);
            return sale;
          }}
          onViewSaleTicket={(sale) => {
            setCompletedSale(sale);
            setShowReceiptModal(true);
          }}
          showToast={showToast}
        />
      ) : activeSubTab === 'pos' ? (
        /* ==================== POS TERMINAL VIEW ==================== */
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden relative">
          {/* Mobile Segmented POS Switcher (< md) */}
          <div className="md:hidden w-full p-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 shadow-2xs">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl w-full">
              <button
                type="button"
                onClick={() => setMobilePosTab('catalog')}
                className={`flex-1 min-h-[40px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer active:scale-95 ${
                  mobilePosTab === 'catalog' || mobilePosTab === 'split'
                    ? 'bg-white text-slate-900 shadow-xs border border-slate-200/80'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Tag className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Inventario ({filteredCatalog.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setMobilePosTab('cart')}
                className={`flex-1 min-h-[40px] flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-extrabold transition-all cursor-pointer active:scale-95 ${
                  mobilePosTab === 'cart'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingCart className="w-4 h-4 shrink-0" />
                <span>Zona de Ticket</span>
                {cart.length > 0 && (
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-full font-black ${
                      mobilePosTab === 'cart'
                        ? 'bg-white text-emerald-700'
                        : 'bg-emerald-600 text-white ring-1 ring-white/60'
                    }`}
                  >
                    {totalCartItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Left Column: Product Catalog & Search — Maximum Viewport Space for Inventory */}
          <div
            className={`flex-1 min-h-0 flex flex-col border-r border-slate-200 bg-slate-50/70 overflow-hidden relative ${
              mobilePosTab === 'cart' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Ultra-Compact Search + Warehouse + Categories Header */}
            <div className="px-3 py-2 sm:px-4 sm:py-2.5 bg-white border-b border-slate-200 space-y-2 shrink-0">
              {/* Row 1: Search Input + Compact Warehouse Selector on the same row */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar artículo por nombre, código o escanear barra..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full pl-10 pr-16 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-12 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                      title="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                    Enter
                  </span>
                </div>

                {/* Compact Warehouse Selector Pill (Shown when Warehouses module is active) */}
                {isWarehousesModuleEnabled && (
                  <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-teal-50/90 border border-teal-200 shrink-0">
                    <Boxes className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                    <span className="text-[11px] font-bold text-teal-900 whitespace-nowrap">
                      Bodega:
                    </span>
                    <select
                      value={selectedWarehouse.id}
                      onChange={(e) => handleSelectPosWarehouse(e.target.value)}
                      className="bg-white border border-teal-300 rounded-lg px-2 py-0.5 text-xs font-extrabold text-teal-950 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer max-w-[190px] truncate"
                      title="Seleccionar bodega para mostrar solo sus artículos"
                    >
                      {activeWarehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Row 2: Well-spaced Category Filter Buttons */}
              <div className="flex items-center gap-2 overflow-x-auto pb-0.5 text-xs scrollbar-none">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                    selectedCategory === 'all'
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {isWarehousesModuleEnabled
                    ? `En ${selectedWarehouse.name} (${warehouseScopedInventory.length})`
                    : `Todos (${inventory.length})`}
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Catalog Grid — Spacious & High Visibility */}
            <div className="flex-1 min-h-0 p-3 sm:p-4 overflow-y-auto scroll-container pb-28 md:pb-6">
              {isLoading ? (
                <PosProductGridSkeleton count={8} />
              ) : filteredCatalog.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                  <Package className="w-12 h-12 mb-3 text-slate-300 stroke-1" />
                  <p className="font-semibold text-slate-600 text-base">
                    {searchQuery.trim()
                      ? 'No se encontraron productos para esa búsqueda'
                      : isWarehousesModuleEnabled
                      ? `No hay artículos con existencia en "${selectedWarehouse.name}"`
                      : 'No se encontraron productos'}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {searchQuery.trim()
                      ? 'Verifica el nombre, código o código de barra ingresado.'
                      : isWarehousesModuleEnabled
                      ? 'Cambia de bodega en el selector superior o escribe el nombre de cualquier artículo en el buscador para ver en qué otra bodega hay existencia.'
                      : 'Agrega productos al inventario para comenzar a vender.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
                    {displayedCatalog.map((product) => {
                      const stock = getPosWarehouseStock(product);
                      const otherLocations = getOtherWarehousesWithStock(product);
                      const otherWhStock = otherLocations.reduce((acc, loc) => acc + loc.stock, 0);
                      const isOutOfStock = stock <= 0;
                      const qtyInCart = cartQtyMap.get(product.code) || 0;
                      const basePrice = Number(product.price) || 0;
                      const itemDiscount = Math.min(
                        basePrice,
                        Math.max(0, Number(product.discount) || 0)
                      );
                      const hasDiscount = itemDiscount > 0;
                      const finalPrice = Math.max(0, basePrice - itemDiscount);

                      return (
                        <div
                          key={product.code}
                          onClick={() => addToCart(product)}
                          className={`group relative flex flex-col justify-between p-3 rounded-xl border bg-white transition-all text-left select-none ${
                            isOutOfStock
                              ? otherWhStock > 0
                                ? 'bg-amber-50/70 border-amber-300 shadow-xs cursor-pointer'
                                : 'opacity-60 bg-slate-100/70 border-slate-200 cursor-not-allowed'
                              : 'border-slate-200/90 hover:border-emerald-500 hover:shadow-md cursor-pointer hover:-translate-y-0.5'
                          }`}
                        >
                          {/* Top indicators */}
                          <div className="flex items-start justify-between gap-1 mb-2 flex-wrap">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                isOutOfStock
                                  ? otherWhStock > 0
                                    ? 'bg-amber-200 text-amber-950 border border-amber-400'
                                    : 'bg-rose-100 text-rose-700'
                                  : stock <= 3
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isOutOfStock
                                ? otherWhStock > 0
                                  ? `0 en ${selectedWarehouse.name}`
                                  : 'Agotado (0 uds)'
                                : `Stock: ${stock}`}
                            </span>

                            <div className="flex items-center gap-1 ml-auto">
                              {hasDiscount && (
                                <span className="text-[10px] font-extrabold bg-rose-500 text-white px-1.5 py-0.5 rounded-full shadow-2xs">
                                  {product.discountType === 'percent' && product.discountValue
                                    ? `-${product.discountValue}%`
                                    : `-L.${itemDiscount.toFixed(0)}`}
                                </span>
                              )}
                              {qtyInCart > 0 && (
                                <span className="text-[10px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-full shadow-sm">
                                  {qtyInCart} en ticket
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Product Image / Icon */}
                          <div className="w-full h-28 sm:h-32 mb-2 bg-slate-50 rounded-xl flex items-center justify-center overflow-hidden border border-slate-100">
                            <AdaptiveImage
                              src={product.img}
                              alt={product.name}
                              variant="product"
                              hoverScale
                              fallback={
                                <Package className="w-8 h-8 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                              }
                            />
                          </div>

                          {/* Details */}
                          <div className="space-y-1.5 mb-2">
                            <h3
                              className="font-semibold text-slate-900 text-xs sm:text-sm line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors"
                              title={product.name}
                            >
                              {product.name}
                            </h3>
                            <div className="flex items-center justify-between text-[11px] text-slate-400">
                              <span className="font-mono">{product.code}</span>
                              {product.size && (
                                <span className="bg-slate-100 px-1.5 py-0.2 rounded text-slate-600 font-medium">
                                  {product.size}
                                </span>
                              )}
                            </div>

                            {/* Exact Warehouse Location Banner when item is not in selectedWarehouse */}
                            {isOutOfStock && otherLocations.length > 0 && (
                              <div
                                onClick={(e) => e.stopPropagation()}
                                className="p-2 rounded-xl bg-amber-100/90 border border-amber-300 text-[11px] text-amber-950 space-y-1.5"
                              >
                                <div className="font-extrabold flex items-center gap-1 text-amber-900">
                                  <Boxes className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                  <span>Disponible en otra bodega:</span>
                                </div>
                                <div className="space-y-1">
                                  {otherLocations.map((loc) => (
                                    <div
                                      key={loc.warehouse.id}
                                      className="flex items-center justify-between gap-1 bg-white/90 px-2 py-1 rounded-lg border border-amber-200"
                                    >
                                      <span className="font-bold text-slate-800 truncate">
                                        {loc.warehouse.name}:{' '}
                                        <strong className="text-emerald-700">
                                          {loc.stock} uds
                                        </strong>
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleSelectPosWarehouse(loc.warehouse.id);
                                        }}
                                        className="px-2 py-0.5 rounded-md bg-teal-700 hover:bg-teal-800 text-white font-black text-[10px] shrink-0 cursor-pointer"
                                        title={`Cambiar a ${loc.warehouse.name} para vender este artículo`}
                                      >
                                        Ir a bodega
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Price & Add Action */}
                          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
                            <div>
                              <span className="text-[10px] text-slate-400 block -mb-0.5">
                                {hasDiscount ? 'Precio c/Desc.' : 'Precio'}
                              </span>
                              {hasDiscount ? (
                                <div className="flex flex-col leading-tight">
                                  <span className="text-[10px] text-slate-400 line-through font-mono">
                                    L. {basePrice.toFixed(2)}
                                  </span>
                                  <span className="font-extrabold text-sm sm:text-base text-emerald-700">
                                    L. {finalPrice.toFixed(2)}
                                  </span>
                                </div>
                              ) : (
                                <span className="font-bold text-sm sm:text-base text-emerald-700">
                                  L. {basePrice.toFixed(2)}
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              disabled={isOutOfStock}
                              className={`p-2 rounded-xl transition-colors ${
                                isOutOfStock
                                  ? 'bg-slate-200 text-slate-400'
                                  : 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
                              }`}
                              title={isOutOfStock ? 'Sin stock en esta bodega' : 'Agregar al ticket'}
                            >
                              <Plus className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Load more products button */}
                  {!searchQuery.trim() && filteredCatalog.length > posDisplayLimit && (
                    <div className="text-center pt-2 pb-1">
                      <button
                        type="button"
                        onClick={() => setPosDisplayLimit((prev) => prev + 36)}
                        className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all cursor-pointer shadow-2xs"
                      >
                        Mostrar más productos ({filteredCatalog.length - posDisplayLimit} restantes)
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Floating Mobile Cart Pill Bar (< md phones) */}
            {cart.length > 0 && (
              <div className="md:hidden sticky bottom-2 mx-3 my-2 z-20">
                <button
                  type="button"
                  onClick={() => setMobilePosTab('cart')}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white p-3 rounded-2xl shadow-xl flex items-center justify-between transition-all cursor-pointer font-bold text-sm border border-emerald-500/40"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="w-7 h-7 rounded-lg bg-emerald-800 text-white flex items-center justify-center text-xs font-black shrink-0">
                      {totalCartItemsCount}
                    </span>
                    <div className="text-left">
                      <div className="text-[10px] text-emerald-100 font-medium">Total a cobrar</div>
                      <div className="text-sm font-black">L. {cartTotal.toFixed(2)}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs bg-white text-emerald-800 px-3.5 py-1.5 rounded-xl font-black shadow-xs shrink-0">
                    <span>Ver Ticket</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Dedicated Ticket Zone — Prioritizes Cart Items visibility while keeping payment & customer controls compact */}
          <div
            className={`flex-1 min-h-0 w-full md:flex-initial md:w-[360px] lg:w-[420px] xl:w-[460px] flex flex-col bg-white md:border-l border-slate-200 shadow-xl overflow-hidden ${
              mobilePosTab === 'catalog' ? 'hidden md:flex' : 'flex'
            }`}
          >
            {/* Mobile Back Button to Catalog (< md phones) */}
            <div className="md:hidden px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => setMobilePosTab('catalog')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer py-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Seguir agregando productos</span>
              </button>
              <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-lg font-mono">
                Total: L. {cartTotal.toFixed(2)}
              </span>
            </div>

            {/* Single-Row Slim Ticket Header */}
            <div className="px-3.5 py-2.5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />
                <h2 className="font-extrabold text-sm truncate">Zona de Ticket</h2>
                <span className="text-[11px] bg-emerald-500 text-slate-950 font-black px-2 py-0.5 rounded-full shrink-0">
                  {totalCartItemsCount} {totalCartItemsCount === 1 ? 'art.' : 'arts.'}
                </span>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-bold bg-white/10 text-teal-200 px-2 py-1 rounded-lg border border-white/10 truncate max-w-[130px]">
                  {selectedWarehouse.name}
                </span>
                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={clearCart}
                    className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                    title="Vaciar ticket"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Vaciar</span>
                  </button>
                )}
              </div>
            </div>

            {/* 1. DEDICATED TICKET ITEMS ZONE (Takes maximum available vertical space!) */}
            <div className="flex-1 min-h-[180px] overflow-y-auto scroll-container p-2.5 sm:p-3 space-y-2 bg-slate-50/50">
              {cart.length === 0 ? (
                <div className="h-full min-h-[180px] flex flex-col items-center justify-center text-center px-4 text-slate-400">
                  <Receipt className="w-10 h-10 text-slate-300 mb-2 stroke-1" />
                  <p className="font-bold text-slate-700 text-sm">El ticket está vacío</p>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-[240px]">
                    Toca cualquier producto del inventario a la izquierda o escanea su código para
                    agregarlo aquí.
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const productInStore = inventory.find((p) => p.code === item.code);
                  const maxStock = getPosWarehouseStock(productInStore);
                  const basePrice =
                    item.originalPrice !== undefined
                      ? Number(item.originalPrice)
                      : Number(item.price) || 0;
                  const unitDisc = Number(item.unitDiscount) || 0;

                  return (
                    <div
                      key={item.code}
                      className="p-2.5 bg-white border border-slate-200/90 rounded-xl shadow-2xs space-y-1.5 hover:border-emerald-400/70 transition-all"
                    >
                      {/* Row 1: Product Name, SKU & Subtotal */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900 text-xs sm:text-sm leading-snug break-words">
                            {item.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 mt-0.5">
                            <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px] text-slate-700">
                              {item.code}
                            </span>
                            <span>L. {item.price.toFixed(2)} c/u</span>
                            {item.size && (
                              <span className="bg-slate-100 px-1.5 py-0.2 rounded text-[10px] font-semibold text-slate-700">
                                {item.size}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          {unitDisc > 0 && (
                            <span className="text-[10px] text-slate-400 line-through font-mono block">
                              L. {(basePrice * item.quantity).toFixed(2)}
                            </span>
                          )}
                          <span className="font-extrabold text-sm text-emerald-700 tabular-nums block">
                            L. {item.subtotal.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: Compact Unit Discount + Well-Spaced Quantity Buttons & Remove */}
                      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100">
                        <div className="flex items-center gap-1 text-[11px]">
                          <Tag className="w-3 h-3 text-rose-500 shrink-0" />
                          <span className="text-slate-500 font-medium">Desc. L:</span>
                          <input
                            type="number"
                            min="0"
                            max={basePrice}
                            step="any"
                            value={unitDisc > 0 ? unitDisc : ''}
                            placeholder="0"
                            onChange={(e) =>
                              updateCartItemDiscount(item.code, parseFloat(e.target.value) || 0)
                            }
                            className="w-16 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded-md text-[11px] font-bold text-rose-600 focus:outline-none focus:ring-1 focus:ring-rose-400 text-right"
                            title="Descuento por unidad en Lempiras"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-100 border border-slate-200 rounded-xl p-0.5">
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.code, item.quantity - 1)}
                              className="w-7 h-7 flex items-center justify-center bg-white text-slate-700 hover:bg-slate-200 rounded-lg cursor-pointer shadow-2xs"
                              title="Restar 1"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={maxStock}
                              value={item.quantity}
                              onChange={(e) =>
                                updateCartQuantity(item.code, parseInt(e.target.value) || 1)
                              }
                              className="w-9 text-center text-xs font-extrabold text-slate-900 bg-transparent focus:outline-none tabular-nums"
                            />
                            <button
                              type="button"
                              onClick={() => updateCartQuantity(item.code, item.quantity + 1)}
                              disabled={item.quantity >= maxStock}
                              className="w-7 h-7 flex items-center justify-center bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 rounded-lg cursor-pointer shadow-2xs"
                              title="Sumar 1"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => removeFromCart(item.code)}
                            className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="Quitar artículo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 2. COMPACT CHECKOUT CONTROLS FOOTER (Does not eat up the Ticket Items space) */}
            <div className="border-t border-slate-200 bg-white p-3 space-y-2.5 shrink-0 max-h-[52vh] overflow-y-auto scroll-container">
              {/* Compact Customer & VIP Selector Bar (1 line by default, expandable on click) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCustomerFieldsPos((prev) => !prev)}
                    className={`flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border text-xs font-bold flex items-center justify-between gap-1.5 cursor-pointer transition-all ${
                      showCustomerFieldsPos ||
                      paymentMethod === 'credit' ||
                      (customerName.trim().toLowerCase() !== 'consumidor final' &&
                        customerName.trim() !== '')
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">
                        {customerName.trim() || 'Consumidor Final'}
                        {customerPhone ? ` • ${customerPhone}` : ''}
                      </span>
                    </span>
                    <span className="text-[10px] font-extrabold text-emerald-700 bg-white px-2 py-0.5 rounded-md border border-emerald-200 shrink-0">
                      {showCustomerFieldsPos || paymentMethod === 'credit' ? 'Ocultar' : 'Editar'}
                    </span>
                  </button>

                  {loyaltyConfig.enabled && loyaltyCustomers.length > 0 && (
                    <select
                      value={matchedLoyaltyCustomer?.id || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSelectedLoyaltyCustomerId(val);
                        setRedeemLoyaltyPoints(false);
                        const found = loyaltyCustomers.find((c) => c.id === val);
                        if (found) {
                          setCustomerName(found.name);
                          setCustomerPhone(found.phone || '');
                          setCustomerRtn(found.rtn || '');
                        }
                      }}
                      className="max-w-[155px] px-2 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-[11px] font-extrabold text-amber-950 focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer truncate shrink-0"
                      title="Seleccionar Cliente Frecuente VIP"
                    >
                      <option value="">🏆 Cliente VIP ({loyaltyCustomers.length})</option>
                      {loyaltyCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.currentPoints} pts)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Expandable Customer Inputs */}
                {(showCustomerFieldsPos || paymentMethod === 'credit') && (
                  <div className="p-2 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        type="text"
                        placeholder="Nombre del Cliente"
                        value={customerName}
                        onChange={(e) => {
                          setCustomerName(e.target.value);
                          if (selectedLoyaltyCustomerId) setSelectedLoyaltyCustomerId('');
                        }}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs"
                      />
                      <input
                        type="text"
                        placeholder="RTN / DNI (Opcional)"
                        value={customerRtn}
                        onChange={(e) => setCustomerRtn(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-xs"
                      />
                    </div>
                    <div className="relative">
                      <input
                        type="tel"
                        placeholder="WhatsApp / Teléfono para ticket y puntos VIP"
                        value={customerPhone}
                        onChange={(e) => {
                          setCustomerPhone(e.target.value);
                          if (selectedLoyaltyCustomerId) setSelectedLoyaltyCustomerId('');
                        }}
                        className="w-full pl-7 pr-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 text-xs text-slate-800"
                      />
                      <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-600 absolute left-2 top-2" />
                    </div>
                  </div>
                )}

                {/* Compact 1-Line VIP Loyalty Bar when matched */}
                {loyaltyConfig.enabled && matchedLoyaltyCustomer && (
                  <div className="px-2.5 py-1.5 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Award className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                      <span className="font-bold text-amber-300 truncate">
                        {matchedLoyaltyCustomer.currentPoints} pts disp.
                      </span>
                      <span className="text-emerald-300 font-semibold">
                        (+{pointsEarnedOnCurrentCart} hoy)
                      </span>
                    </div>

                    {matchedLoyaltyCustomer.currentPoints >= loyaltyConfig.minPointsToRedeem &&
                      cartSubtotal > 0 && (
                        <button
                          type="button"
                          onClick={() => setRedeemLoyaltyPoints(!redeemLoyaltyPoints)}
                          className={`px-2.5 py-1 rounded-lg font-black text-[10px] flex items-center gap-1 cursor-pointer transition-all ${
                            redeemLoyaltyPoints
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
                          }`}
                        >
                          <Gift className="w-3 h-3 shrink-0" />
                          <span>
                            {redeemLoyaltyPoints
                              ? `✓ -L. ${loyaltyRedemptionCalc.discountLps.toFixed(2)}`
                              : `Canjear (-L. ${Math.min(
                                  cartSubtotal,
                                  matchedLoyaltyCustomer.currentPoints *
                                    loyaltyConfig.lempirasPerPointRedeem
                                ).toFixed(2)})`}
                          </span>
                        </button>
                      )}
                  </div>
                )}
              </div>

              {/* Well-spaced Payment Method Buttons */}
              <div className="grid grid-cols-4 gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMethod('cash')}
                  className={`py-2 px-2 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                    paymentMethod === 'cash'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <DollarSign className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Efectivo</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('card')}
                  className={`py-2 px-2 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                    paymentMethod === 'card'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Tarjeta</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentMethod('transfer')}
                  className={`py-2 px-2 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                    paymentMethod === 'transfer'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Building className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Transf.</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('credit');
                    setShowCustomerFieldsPos(true);
                    if (customerName.trim().toLowerCase() === 'consumidor final') {
                      setCustomerName('');
                    }
                  }}
                  className={`py-2 px-2 rounded-xl text-xs font-extrabold border flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                    paymentMethod === 'credit'
                      ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
                      : 'bg-amber-50/70 text-amber-900 border-amber-200 hover:bg-amber-100'
                  }`}
                >
                  <Users className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Fiado</span>
                </button>
              </div>

              {/* Compact Credit / Fiado Box */}
              {paymentMethod === 'credit' && cart.length > 0 && (
                <div className="p-2 bg-amber-50 border border-amber-300 rounded-xl space-y-1.5 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-amber-900 mb-0.5">
                        Prima / Abono Hoy (L.)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max={cartTotal}
                        placeholder="0.00"
                        value={creditInitialDeposit}
                        onChange={(e) => setCreditInitialDeposit(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-amber-900 mb-0.5">
                        Fecha Promesa Pago
                      </label>
                      <input
                        type="date"
                        value={creditDueDate}
                        onChange={(e) => setCreditDueDate(e.target.value)}
                        className="w-full px-2 py-1 bg-white border border-amber-300 rounded-lg text-xs text-slate-900"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                    <span>Saldo Pendiente:</span>
                    <span className="font-black text-amber-800">
                      L. {Math.max(0, cartTotal - (parseFloat(creditInitialDeposit) || 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Compact Cash Received & Change Row */}
              {paymentMethod === 'cash' && cart.length > 0 && (
                <div className="p-2 bg-emerald-50/80 border border-emerald-200 rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                        Efectivo L.
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={cashGiven}
                        onChange={(e) => setCashGiven(e.target.value)}
                        className="w-full pl-20 pr-2.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs sm:text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setCashGiven(cartTotal.toFixed(2))}
                        className="text-[10px] bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-extrabold px-2 py-1 rounded-lg cursor-pointer"
                      >
                        Exacto
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCashGiven((Math.ceil(cartTotal / 100) * 100 || 100).toFixed(2))
                        }
                        className="text-[10px] bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-extrabold px-2 py-1 rounded-lg cursor-pointer"
                      >
                        +100
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCashGiven((Math.ceil(cartTotal / 500) * 500 || 500).toFixed(2))
                        }
                        className="text-[10px] bg-emerald-200 hover:bg-emerald-300 text-emerald-950 font-extrabold px-2 py-1 rounded-lg cursor-pointer"
                      >
                        +500
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs px-0.5">
                    <span className="font-semibold text-slate-700">Cambio / Vuelto:</span>
                    <span
                      className={`font-black text-xs sm:text-sm ${
                        isCashInsufficient ? 'text-rose-600' : 'text-emerald-800'
                      }`}
                    >
                      {isCashInsufficient
                        ? `Faltan L. ${(cartTotal - numericCashGiven).toFixed(2)}`
                        : `L. ${cashChange.toFixed(2)}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Compact Discount + ISV + Subtotal Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 pt-1 border-t border-slate-100">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-700">Desc:</span>
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setDiscountType('amount')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        discountType === 'amount'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      L.
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('percent')}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        discountType === 'percent'
                          ? 'bg-slate-800 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      %
                    </button>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={discountType === 'percent' ? 100 : cartSubtotal || undefined}
                    step="any"
                    placeholder="0"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    className="w-16 px-2 py-0.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <label className="flex items-center gap-1.5 cursor-pointer select-none font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={applyTax}
                    onChange={(e) => setApplyTax(e.target.checked)}
                    className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span>+15% ISV</span>
                </label>

                <div className="text-right ml-auto">
                  {discountAmount > 0 && (
                    <span className="text-[11px] font-bold text-rose-600 mr-2">
                      -L. {discountAmount.toFixed(2)}
                    </span>
                  )}
                  <span className="text-xs font-bold text-slate-700">
                    Sub: L. {cartSubtotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Prominent Checkout Button with Total */}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={
                  cart.length === 0 ||
                  isSubmittingSale ||
                  (paymentMethod === 'cash' && isCashInsufficient)
                }
                className={`w-full min-h-[48px] py-3 px-4 rounded-2xl font-black text-sm sm:text-base flex items-center justify-between gap-2 transition-all shadow-md cursor-pointer ${
                  cart.length === 0 ||
                  isSubmittingSale ||
                  (paymentMethod === 'cash' && isCashInsufficient)
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25 active:scale-[0.99]'
                }`}
              >
                {isSubmittingSale ? (
                  <div className="w-full flex items-center justify-center gap-2">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0" />
                    <span>Registrando venta...</span>
                  </div>
                ) : (
                  <>
                    <span className="flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 shrink-0" />
                      <span>Cobrar y Facturar</span>
                    </span>
                    <span className="text-base sm:text-lg font-black bg-black/20 px-3 py-0.5 rounded-xl tabular-nums">
                      L. {cartTotal.toFixed(2)}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== SALES HISTORY VIEW ==================== */
        <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container p-3 sm:p-6 space-y-4 sm:space-y-5 pb-40 md:pb-24">
          {/* Top KPI Metrics Banner */}
          <div className={`grid grid-cols-2 ${canViewCostsAndProfits ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-2.5 sm:gap-3`}>
            <div className="p-3 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">Total Facturado</span>
                <span className="text-sm sm:text-xl font-extrabold text-emerald-700 block truncate">
                  L. {salesMetrics.revenue.toFixed(2)}
                </span>
                {canViewCostsAndProfits && (
                  <span className="text-[10px] text-slate-400 block truncate">
                    Costo: L. {salesMetrics.totalCost.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="p-2 sm:p-2.5 bg-emerald-50 rounded-xl text-emerald-600 shrink-0 hidden sm:flex">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            {/* Ganancia Neta Card (Hidden for collaborators unless authorized) */}
            {canViewCostsAndProfits && (
              <div className="p-3 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">
                    Ganancia Neta
                  </span>
                  <span
                    className={`text-sm sm:text-xl font-extrabold block truncate ${
                      salesMetrics.profit >= 0 ? 'text-teal-700' : 'text-rose-600'
                    }`}
                  >
                    {salesMetrics.profit >= 0 ? '+' : ''}L. {salesMetrics.profit.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-slate-400 block truncate">
                    Margen: {salesMetrics.marginPct.toFixed(1)}%
                  </span>
                </div>
                <div className="p-2 sm:p-2.5 bg-teal-50 rounded-xl text-teal-600 shrink-0 hidden sm:flex">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
            )}

            <div className="p-3 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">Ventas Completadas</span>
                <span className="text-sm sm:text-xl font-extrabold text-slate-900 block">
                  {salesMetrics.count}
                </span>
                {salesMetrics.cancelledCount > 0 && (
                  <span className="text-[10px] text-rose-500 block truncate">
                    ({salesMetrics.cancelledCount} anuladas)
                  </span>
                )}
              </div>
              <div className="p-2 sm:p-2.5 bg-blue-50 rounded-xl text-blue-600 shrink-0 hidden sm:flex">
                <Receipt className="w-5 h-5" />
              </div>
            </div>

            <div className="p-3 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">Unidades Vendidas</span>
                <span className="text-sm sm:text-xl font-extrabold text-slate-900 block">
                  {salesMetrics.itemsSold}
                </span>
              </div>
              <div className="p-2 sm:p-2.5 bg-purple-50 rounded-xl text-purple-600 shrink-0 hidden sm:flex">
                <Package className="w-5 h-5" />
              </div>
            </div>

            <div className="col-span-2 lg:col-span-1 p-3 sm:p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between gap-2 min-w-0">
              <div className="min-w-0">
                <span className="text-[11px] sm:text-xs text-slate-500 font-medium block truncate">Ticket Promedio</span>
                <span className="text-sm sm:text-xl font-extrabold text-slate-900 block truncate">
                  L. {salesMetrics.avgTicket.toFixed(2)}
                </span>
              </div>
              <div className="p-2 sm:p-2.5 bg-amber-50 rounded-xl text-amber-600 shrink-0 hidden sm:flex">
                <Percent className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* History Filters & Action Toolbar (Organized in 2 Clean Rows) */}
          <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3.5">
            {/* Top Row: Search Box + Export Excel & Print/PDF Action Buttons */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Buscar por N° de venta, cliente, vendedor o producto..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {historySearch && (
                  <button
                    type="button"
                    onClick={() => setHistorySearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Action Buttons: Export Excel (.xlsx) & Imprimir / PDF */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleExportCSV}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  title="Exportar historial de ventas a Excel (.xlsx) ordenado por columnas"
                >
                  <FileSpreadsheet className="w-4 h-4 shrink-0" />
                  <span>Exportar Excel (.xlsx)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (filteredSalesHistory.length === 0) {
                      showToast('No hay ventas en el filtro actual para imprimir o exportar.', 'warning');
                      return;
                    }
                    setShowSalesReportPrintModal(true);
                  }}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold rounded-xl transition-colors cursor-pointer shadow-2xs whitespace-nowrap"
                  title="Imprimir reporte de ventas en cualquier impresora o guardar como PDF"
                >
                  <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Imprimir / PDF</span>
                </button>
              </div>
            </div>

            {/* Bottom Row: Clean, Compact Date / Calendar / Year-Month-Day & Status Filters */}
            <div className="flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-2.5 pt-3 border-t border-slate-100 text-xs">
              {/* Left Group: Quick Shortcuts + Calendar & Year/Month/Day Selectors */}
              <div className="flex flex-wrap items-center gap-2">
                {/* Compact Quick Buttons */}
                <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 gap-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDateFilter('today_yesterday');
                      setHistoryExactDate('');
                      setHistoryYearFilter('all');
                      setHistoryMonthFilter('all');
                      setHistoryDayFilter('all');
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      historyDateFilter === 'today_yesterday'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hoy y Ayer ({dateFilterCounts.today_yesterday})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDateFilter('today');
                      setHistoryExactDate('');
                      setHistoryYearFilter('all');
                      setHistoryMonthFilter('all');
                      setHistoryDayFilter('all');
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      historyDateFilter === 'today'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Hoy ({dateFilterCounts.today})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDateFilter('yesterday');
                      setHistoryExactDate('');
                      setHistoryYearFilter('all');
                      setHistoryMonthFilter('all');
                      setHistoryDayFilter('all');
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      historyDateFilter === 'yesterday'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Ayer ({dateFilterCounts.yesterday})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setHistoryDateFilter('all');
                      setHistoryExactDate('');
                      setHistoryYearFilter('all');
                      setHistoryMonthFilter('all');
                      setHistoryDayFilter('all');
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                      historyDateFilter === 'all'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Todas ({dateFilterCounts.all})
                  </button>
                </div>

                {/* Unified Calendar + Year + Month (Ene-Dic) + Day Bar */}
                <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-xl border border-slate-200">
                  {/* Direct Calendar Date Picker */}
                  <div className="relative flex items-center" title="Seleccionar fecha exacta en el calendario">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600 mr-1.5 shrink-0 pointer-events-none" />
                    <input
                      type="date"
                      value={historyExactDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setHistoryExactDate(val);
                        if (val) {
                          const [y, m, d] = val.split('-');
                          setHistoryYearFilter(String(Number(y)));
                          setHistoryMonthFilter(String(Number(m)));
                          setHistoryDayFilter(String(Number(d)));
                          setHistoryDateFilter('custom');
                        } else {
                          setHistoryDayFilter('all');
                          if (historyYearFilter === 'all' && historyMonthFilter === 'all') {
                            setHistoryDateFilter('today_yesterday');
                          }
                        }
                      }}
                      className={`bg-white border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${
                        historyExactDate
                          ? 'border-emerald-500 text-emerald-800 bg-emerald-50/40'
                          : 'border-slate-200 text-slate-700'
                      }`}
                    />
                  </div>

                  {/* Year Selector */}
                  <select
                    value={historyYearFilter}
                    onChange={(e) => {
                      const yr = e.target.value;
                      setHistoryYearFilter(yr);
                      setHistoryExactDate('');
                      if (yr === 'all' && historyMonthFilter === 'all' && historyDayFilter === 'all') {
                        setHistoryDateFilter('all');
                      } else {
                        setHistoryDateFilter('custom');
                      }
                    }}
                    className={`bg-white border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${
                      historyDateFilter === 'custom' && historyYearFilter !== 'all'
                        ? 'border-emerald-500 text-emerald-800 bg-emerald-50/40'
                        : 'border-slate-200 text-slate-700'
                    }`}
                    title="Filtrar por Año"
                  >
                    <option value="all">Año: Todos</option>
                    {availableSalesYears.map((yr) => (
                      <option key={yr} value={String(yr)}>
                        Año {yr}
                      </option>
                    ))}
                  </select>

                  {/* Month Selector (Enero - Diciembre) */}
                  <select
                    value={historyMonthFilter}
                    onChange={(e) => {
                      const mo = e.target.value;
                      setHistoryMonthFilter(mo);
                      setHistoryExactDate('');
                      if (mo !== 'all' && historyYearFilter === 'all') {
                        setHistoryYearFilter(String(new Date().getFullYear()));
                      }
                      if (mo === 'all' && historyYearFilter === 'all' && historyDayFilter === 'all') {
                        setHistoryDateFilter('all');
                      } else {
                        setHistoryDateFilter('custom');
                      }
                    }}
                    className={`bg-white border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${
                      historyDateFilter === 'custom' && historyMonthFilter !== 'all'
                        ? 'border-emerald-500 text-emerald-800 bg-emerald-50/40'
                        : 'border-slate-200 text-slate-700'
                    }`}
                    title="Filtrar por Mes (Enero a Diciembre)"
                  >
                    <option value="all">Mes: Todos (Ene - Dic)</option>
                    {MONTH_NAMES.map((m) => {
                      const count = monthSalesCounts[m.value] || 0;
                      return (
                        <option key={m.value} value={m.value}>
                          {m.value.padStart(2, '0')} - {m.label} ({count})
                        </option>
                      );
                    })}
                  </select>

                  {/* Day Selector (1 - 31) */}
                  <select
                    value={historyDayFilter}
                    onChange={(e) => {
                      const dy = e.target.value;
                      setHistoryDayFilter(dy);
                      setHistoryExactDate('');
                      if (dy !== 'all') {
                        if (historyYearFilter === 'all') {
                          setHistoryYearFilter(String(new Date().getFullYear()));
                        }
                        if (historyMonthFilter === 'all') {
                          setHistoryMonthFilter(String(new Date().getMonth() + 1));
                        }
                        setHistoryDateFilter('custom');
                      } else if (historyYearFilter === 'all' && historyMonthFilter === 'all') {
                        setHistoryDateFilter('all');
                      } else {
                        setHistoryDateFilter('custom');
                      }
                    }}
                    className={`bg-white border rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer ${
                      historyDateFilter === 'custom' && historyDayFilter !== 'all'
                        ? 'border-emerald-500 text-emerald-800 bg-emerald-50/40'
                        : 'border-slate-200 text-slate-700'
                    }`}
                    title="Filtrar por Día del mes"
                  >
                    <option value="all">Día: Todos</option>
                    {Array.from({ length: 31 }, (_, idx) => String(idx + 1)).map((d) => (
                      <option key={d} value={d}>
                        Día {d.padStart(2, '0')}
                      </option>
                    ))}
                  </select>

                  {/* Reset custom date filter button */}
                  {historyDateFilter === 'custom' && (
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryDateFilter('today_yesterday');
                        setHistoryExactDate('');
                        setHistoryYearFilter('all');
                        setHistoryMonthFilter('all');
                        setHistoryDayFilter('all');
                      }}
                      className="px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Quitar filtro de fecha personalizada"
                    >
                      <X className="w-3 h-3" />
                      <span>Limpiar</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Right Group: Seller & Status Dropdowns */}
              <div className="grid grid-cols-2 sm:flex items-center gap-2 shrink-0">
                <select
                  value={historySellerFilter}
                  onChange={(e) => setHistorySellerFilter(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                  title="Filtrar por quién realizó la venta"
                >
                  <option value="all">Vendedor: Todos</option>
                  <option value="admin">Administrador</option>
                  <option value="collaborator">Colaboradores</option>
                </select>

                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-700 font-bold focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="all">Estado: Todos</option>
                  <option value="completed">Completadas</option>
                  <option value="cancelled">Anuladas</option>
                </select>
              </div>
            </div>

            {/* Subtle Active Period Summary Pill when filtering by Calendar / Month / Year */}
            {historyDateFilter === 'custom' && (
              <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs text-emerald-900">
                <div className="flex items-center gap-2 font-bold">
                  <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Mostrando ventas de: {activePeriodLabel}</span>
                </div>
                <span className="font-extrabold text-emerald-700">
                  {filteredSalesHistory.length} {filteredSalesHistory.length === 1 ? 'venta encontrada' : 'ventas encontradas'}
                </span>
              </div>
            )}
          </div>

          {/* Sales History Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs">
            {filteredSalesHistory.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <Receipt className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
                <p className="font-semibold text-slate-700 text-base">No se encontraron ventas</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  No hay transacciones registradas que coincidan con los filtros seleccionados.
                </p>
              </div>
            ) : (
              <div>
                {/* Mobile Card List (< sm) */}
                <div className="sm:hidden p-2.5 space-y-2.5">
                  {paginatedSalesHistory.map((sale) => {
                    const isCancelled = sale.status === 'cancelled';
                    const sellerInfo = getSaleSellerInfo(sale);
                    const fin = getSaleFinancials(sale);
                    return (
                      <div
                        key={sale.id}
                        className={`p-3.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2.5 bg-white ${
                          isCancelled ? 'bg-rose-50/30 border-rose-200' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {sale.saleNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              isCancelled ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isCancelled ? 'Anulada' : 'Completada'}
                          </span>
                        </div>

                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="font-bold text-sm text-slate-800 break-words">
                              {sale.customerName || 'Consumidor Final'}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {sale.date}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[10px] text-slate-400 block">Total</span>
                            <span
                              className={`text-base font-black block ${
                                isCancelled ? 'line-through text-slate-400' : 'text-emerald-700'
                              }`}
                            >
                              L. {sale.total.toFixed(2)}
                            </span>
                            {!isCancelled && canViewCostsAndProfits && (
                              <span
                                className={`text-[10px] font-bold block ${
                                  fin.profit >= 0 ? 'text-teal-700' : 'text-rose-600'
                                }`}
                              >
                                Ganancia: {fin.profit >= 0 ? '+' : ''}L. {fin.profit.toFixed(2)} ({fin.marginPct.toFixed(0)}%)
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Seller / Cashier Info Row on Mobile */}
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-100 text-xs">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {sellerInfo.role === 'admin' ? (
                              <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            ) : (
                              <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                            )}
                            <span className="text-slate-500 text-[11px] shrink-0">Vendedor:</span>
                            <span className="font-bold text-slate-800 truncate">
                              {sellerInfo.name}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                              sellerInfo.role === 'admin'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                            }`}
                          >
                            {sellerInfo.roleLabel}
                          </span>
                        </div>
                        {sale.warehouseName && (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-teal-800 bg-teal-50/80 border border-teal-200/80 px-2.5 py-1 rounded-lg">
                            <Boxes className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                            <span>Bodega: {sale.warehouseName}</span>
                          </div>
                        )}

                        {/* Preview of sold items inside the mobile card */}
                        {sale.items && sale.items.length > 0 && (
                          <div className="bg-slate-50 rounded-lg p-2 border border-slate-100 space-y-1 text-[11px] text-slate-600">
                            {sale.items.map((it, idx) => (
                              <div key={idx} className="flex items-start justify-between gap-2">
                                <span className="break-words flex-1">
                                  <strong className="text-slate-800">{it.quantity}x</strong> {it.name}
                                  {it.size ? ` (${it.size})` : ''}
                                </span>
                                <span className="font-semibold text-slate-800 shrink-0">
                                  L. {it.subtotal.toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-medium">
                            <Package className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>
                              {sale.totalItems} {sale.totalItems === 1 ? 'art.' : 'arts.'}
                            </span>
                            <span className="text-slate-300">·</span>
                            <span className="capitalize">
                              {sale.paymentMethod === 'cash'
                                ? 'Efectivo'
                                : sale.paymentMethod === 'card'
                                ? 'Tarjeta'
                                : sale.paymentMethod === 'credit'
                                ? 'Crédito'
                                : 'Transf.'}
                            </span>
                          </span>

                          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 w-full pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setCompletedSale(sale);
                                setShowReceiptModal(true);
                              }}
                              className="min-h-[40px] px-3 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                            >
                              <Printer className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>Ver Ticket</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadSalePdf('letter', sale)}
                              className="min-h-[40px] px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                              title="Descargar factura en PDF"
                            >
                              <Download className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>PDF Carta</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendTicketWhatsApp(sale, sale.customerPhone)}
                              className="min-h-[40px] px-3 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors active:scale-95 shadow-2xs col-span-2 sm:col-span-1"
                              title="Enviar ticket por WhatsApp"
                            >
                              <WhatsAppIcon className="w-4 h-4 fill-white shrink-0" />
                              <span>WhatsApp</span>
                            </button>
                            {!isCancelled && canEditSales && onUpdateSale && (
                              <button
                                type="button"
                                onClick={() => setSaleToEdit(sale)}
                                className="min-h-[40px] px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 shadow-2xs"
                                title="Editar datos o artículos de la factura"
                              >
                                <Edit2 className="w-4 h-4 text-indigo-600 shrink-0" />
                                <span>Editar</span>
                              </button>
                            )}
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => handleRequestCancelSale(sale)}
                                className="min-h-[40px] px-3 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl cursor-pointer flex items-center justify-center gap-1.5 active:scale-95 shadow-2xs"
                                title={
                                  canCancelSales
                                    ? 'Anular venta y devolver stock'
                                    : 'Anular venta (Requiere clave de Administrador)'
                                }
                              >
                                {!canCancelSales ? (
                                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                ) : (
                                  <RotateCcw className="w-4 h-4 text-rose-600 shrink-0" />
                                )}
                                <span>Anular</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop / Tablet Table (>= sm) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left text-xs sm:text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] uppercase tracking-wider font-semibold">
                    <tr>
                      <th className="py-3 px-4">N° Venta</th>
                      <th className="py-3 px-4">Fecha y Hora</th>
                      <th className="py-3 px-4">Cliente</th>
                      <th className="py-3 px-4">Vendedor / Usuario</th>
                      <th className="py-3 px-4">Artículos</th>
                      <th className="py-3 px-4">Método</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      {canViewCostsAndProfits && (
                        <th className="py-3 px-4 text-right">Ganancia Neta</th>
                      )}
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {paginatedSalesHistory.map((sale) => {
                      const isCancelled = sale.status === 'cancelled';
                      const sellerInfo = getSaleSellerInfo(sale);
                      const fin = getSaleFinancials(sale);

                      return (
                        <tr
                          key={sale.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isCancelled ? 'bg-rose-50/40 text-slate-400' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            <div>{sale.saleNumber}</div>
                            {sale.lastEditedBy && (
                              <div className="text-[10px] text-indigo-600 font-sans font-semibold">
                                ✏️ Editada
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {sale.date}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            <div>{sale.customerName || 'Consumidor Final'}</div>
                            {sale.customerRtn && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                RTN: {sale.customerRtn}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col items-start gap-1">
                              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                                {sellerInfo.role === 'admin' ? (
                                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                ) : (
                                  <User className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                )}
                                <span>{sellerInfo.name}</span>
                              </span>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                  sellerInfo.role === 'admin'
                                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                }`}
                              >
                                {sellerInfo.roleLabel}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex flex-col items-start gap-1">
                              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                                <Package className="w-3 h-3 text-slate-500" />
                                {sale.totalItems} {sale.totalItems === 1 ? 'ítem' : 'ítems'}
                              </span>
                              {sale.warehouseName && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-800 bg-teal-50 border border-teal-200 px-1.5 py-0.5 rounded-md">
                                  <Boxes className="w-2.5 h-2.5 text-teal-600" />
                                  {sale.warehouseName}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize text-slate-600">
                              {sale.paymentMethod === 'cash'
                                ? 'Efectivo'
                                : sale.paymentMethod === 'card'
                                ? 'Tarjeta'
                                : sale.paymentMethod === 'transfer'
                                ? 'Transferencia'
                                : sale.paymentMethod === 'credit'
                                ? 'Crédito'
                                : 'Otro'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            <span className={isCancelled ? 'line-through text-slate-400' : 'text-emerald-700'}>
                              L. {sale.total.toFixed(2)}
                            </span>
                          </td>
                          {canViewCostsAndProfits && (
                            <td className="py-3 px-4 text-right">
                              {isCancelled ? (
                                <span className="text-xs text-slate-400">—</span>
                              ) : (
                                <div className="flex flex-col items-end">
                                  <span
                                    className={`font-bold text-xs sm:text-sm ${
                                      fin.profit >= 0 ? 'text-teal-700' : 'text-rose-600'
                                    }`}
                                  >
                                    {fin.profit >= 0 ? '+' : ''}L. {fin.profit.toFixed(2)}
                                  </span>
                                  <span className="text-[10px] text-slate-400 font-mono">
                                    Costo: L. {fin.totalCost.toFixed(2)} ({fin.marginPct.toFixed(0)}%)
                                  </span>
                                </div>
                              )}
                            </td>
                          )}
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isCancelled
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-emerald-100 text-emerald-800'
                              }`}
                            >
                              {isCancelled ? 'Anulada' : 'Completada'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* View receipt / print modal */}
                              <button
                                type="button"
                                onClick={() => {
                                  setCompletedSale(sale);
                                  setShowReceiptModal(true);
                                }}
                                className="p-1.5 text-slate-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                title="Ver comprobante / Elegir Impresora"
                              >
                                <Printer className="w-4 h-4" />
                              </button>

                              {/* Direct PDF download */}
                              <button
                                type="button"
                                onClick={() => handleDownloadSalePdf('letter', sale)}
                                className="p-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                title="Descargar Factura en PDF (.pdf)"
                              >
                                <Download className="w-4 h-4" />
                              </button>

                              {/* WhatsApp direct send */}
                              <button
                                type="button"
                                onClick={() => handleSendTicketWhatsApp(sale, sale.customerPhone)}
                                className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                title="Enviar ticket por WhatsApp"
                              >
                                <WhatsAppIcon className="w-4 h-4 fill-emerald-600" />
                              </button>

                              {/* Edit sale button */}
                              {!isCancelled && canEditSales && onUpdateSale && (
                                <button
                                  type="button"
                                  onClick={() => setSaleToEdit(sale)}
                                  className="p-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                  title="Editar datos o artículos de la factura"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}

                              {/* Cancel sale button (if not already cancelled) */}
                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestCancelSale(sale)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer flex items-center gap-0.5"
                                  title={
                                    canCancelSales
                                      ? 'Anular venta y devolver stock'
                                      : 'Anular venta (Requiere clave de Administrador)'
                                  }
                                >
                                  {!canCancelSales && <Lock className="w-3 h-3 text-amber-500" />}
                                  <RotateCcw className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Sales History Pagination Controls Bar */}
              {totalHistoryPages > 1 && (
                <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 rounded-b-xl">
                  <span>
                    Mostrando{' '}
                    <strong className="text-slate-900">
                      {(historyPage - 1) * HISTORY_PAGE_SIZE + 1}
                    </strong>{' '}
                    -{' '}
                    <strong className="text-slate-900">
                      {Math.min(historyPage * HISTORY_PAGE_SIZE, filteredSalesHistory.length)}
                    </strong>{' '}
                    de <strong className="text-slate-900">{filteredSalesHistory.length}</strong> ventas
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      <span>Anterior</span>
                    </button>

                    <span className="px-2 font-bold text-slate-800">
                      Página {historyPage} de {totalHistoryPages}
                    </span>

                    <button
                      type="button"
                      disabled={historyPage >= totalHistoryPages}
                      onClick={() => setHistoryPage((p) => Math.min(totalHistoryPages, p + 1))}
                      className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer shadow-2xs"
                    >
                      <span>Siguiente</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      )}

      {/* ==================== TICKET / RECEIPT MODAL ==================== */}
      {showReceiptModal && completedSale && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0">
                  ✓
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">Comprobante de Venta</h3>
                  <span className="text-[11px] text-slate-500 font-mono block truncate">
                    {completedSale.saleNumber}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-3">
              <div
                ref={receiptPrintRef}
                className="p-3 sm:p-4 bg-white border border-dashed border-slate-300 rounded-xl font-mono text-xs text-slate-800 space-y-3 shadow-inner"
              >
                {/* Store Branding Header */}
                <div className="text-center space-y-1 pb-2 border-b border-dashed border-slate-300">
                  {(storeSettings.logoUrl || '/store-logo.jpg') && (
                    <div className="flex justify-center mb-1.5">
                      <img
                        src={storeSettings.logoUrl || '/store-logo.jpg'}
                        alt={storeSettings.storeName || 'Tienda Gosén'}
                        className="w-12 h-12 rounded-xl object-contain border border-slate-200 bg-white p-0.5 shadow-2xs"
                      />
                    </div>
                  )}
                  <h2 className="font-bold text-sm sm:text-base uppercase text-slate-900 break-words">
                    {storeSettings.storeName || 'Tienda Gosén'}
                  </h2>
                  {storeSettings.tagline && (
                    <p className="text-[11px] text-slate-500 break-words">{storeSettings.tagline}</p>
                  )}
                  {storeSettings.address && (
                    <p className="text-[10px] text-slate-500 break-words">{storeSettings.address}</p>
                  )}
                  {storeSettings.phone && (
                    <p className="text-[10px] text-slate-500">Tel: {storeSettings.phone}</p>
                  )}
                </div>

                {/* Ticket Meta */}
                <div className="text-[11px] space-y-1 pb-2 border-b border-dashed border-slate-300">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 shrink-0">N° Venta:</span>
                    <span className="font-bold text-right break-all">{completedSale.saleNumber}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Fecha:</span>
                    <span className="text-right">{completedSale.date}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Cliente:</span>
                    <span className="font-semibold text-right break-words">{completedSale.customerName || 'Consumidor Final'}</span>
                  </div>
                  {completedSale.customerRtn && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 shrink-0">RTN/DNI:</span>
                      <span className="text-right break-all">{completedSale.customerRtn}</span>
                    </div>
                  )}
                  {completedSale.customerPhone && (
                    <div className="flex justify-between gap-2">
                      <span className="text-slate-500 shrink-0">Tel / WhatsApp:</span>
                      <span className="font-semibold text-emerald-800 text-right">{completedSale.customerPhone}</span>
                    </div>
                  )}
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500 shrink-0">Atendido por:</span>
                    <span className="font-semibold text-right">
                      {getSaleSellerInfo(completedSale).name} ({getSaleSellerInfo(completedSale).roleLabel})
                    </span>
                  </div>
                  {completedSale.status === 'cancelled' && (
                    <div className="text-center py-1 text-rose-600 font-bold border border-rose-300 rounded bg-rose-50 my-1">
                      *** VENTA ANULADA ***
                    </div>
                  )}
                </div>

                {/* Items Breakdown Table */}
                <div className="space-y-2 pb-2 border-b border-dashed border-slate-300">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 border-b pb-1 border-slate-200">
                    <span>Cant / Producto</span>
                    <span>Subtotal</span>
                  </div>
                  {completedSale.items.map((it, idx) => {
                    const unitDisc = Number(it.unitDiscount) || 0;
                    const origPrice =
                      it.originalPrice !== undefined
                        ? Number(it.originalPrice)
                        : it.price + unitDisc;
                    return (
                      <div key={idx} className="flex items-start justify-between gap-2 text-[11px]">
                        <div className="flex-1 min-w-0 break-words leading-snug">
                          <span className="font-bold text-slate-900">{it.quantity}x</span>{' '}
                          <span className="font-medium text-slate-800">{it.name}</span>
                          {it.size ? ` (Talla: ${it.size})` : ''}
                          <div className="text-[10px] text-slate-500">
                            Código: {it.code} • @ L. {it.price.toFixed(2)} c/u
                            {unitDisc > 0 && (
                              <span className="text-rose-600 font-semibold block">
                                (Antes L. {origPrice.toFixed(2)} | Desc: -L. {unitDisc.toFixed(2)} c/u)
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="font-bold text-slate-900 shrink-0">
                          L. {it.subtotal.toFixed(2)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Financial Summary */}
                <div className="space-y-1 text-[11px]">
                  {(() => {
                    const itemsSaved = completedSale.items.reduce(
                      (sum, it) => sum + (Number(it.unitDiscount) || 0) * it.quantity,
                      0
                    );
                    return itemsSaved > 0 ? (
                      <div className="flex justify-between text-rose-600 font-semibold">
                        <span>Ahorro en artículos:</span>
                        <span>- L. {itemsSaved.toFixed(2)}</span>
                      </div>
                    ) : null;
                  })()}
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>L. {completedSale.subtotal.toFixed(2)}</span>
                  </div>
                  {completedSale.discount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Descuento adicional:</span>
                      <span>- L. {completedSale.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {completedSale.tax > 0 && (
                    <div className="flex justify-between">
                      <span>15% ISV:</span>
                      <span>L. {completedSale.tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm border-t border-dashed border-slate-300 pt-1.5 text-slate-900">
                    <span>TOTAL PAGADO:</span>
                    <span className="text-emerald-800">L. {completedSale.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 pt-1">
                    <span>Método de Pago:</span>
                    <span className="capitalize">
                      {completedSale.paymentMethod === 'cash'
                        ? 'Efectivo'
                        : completedSale.paymentMethod === 'card'
                        ? 'Tarjeta'
                        : 'Transferencia'}
                    </span>
                  </div>
                  {completedSale.paymentMethod === 'cash' && (
                    <>
                      <div className="flex justify-between text-[10px]">
                        <span>Efectivo Recibido:</span>
                        <span>L. {completedSale.amountPaid.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-[10px] font-bold text-emerald-800">
                        <span>Cambio / Vuelto:</span>
                        <span>L. {completedSale.change.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Thank you message footer */}
                <div className="text-center text-[10px] text-slate-500 pt-2 border-t border-dashed border-slate-300">
                  <p className="font-bold">¡GRACIAS POR SU COMPRA!</p>
                  <p>Conserve este ticket para cualquier cambio o reclamo.</p>
                </div>
              </div>

              {/* WhatsApp Digital Ticket Card */}
              <div className="bg-emerald-50 border border-emerald-200/90 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <WhatsAppIcon className="w-4 h-4 fill-emerald-600 shrink-0" />
                    <span>Enviar Ticket por WhatsApp</span>
                  </span>
                  <span className="text-[10px] text-emerald-700 bg-emerald-100/90 px-2 py-0.5 rounded-full font-bold">
                    Directo
                  </span>
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] font-semibold text-emerald-900">
                    Número de teléfono / WhatsApp del cliente (opcional):
                  </label>
                  <div className="relative">
                    <input
                      type="tel"
                      placeholder="Ej. 9876-5432 o +504 9876-5432"
                      value={receiptWhatsAppPhone}
                      onChange={(e) => setReceiptWhatsAppPhone(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendTicketWhatsApp();
                        }
                      }}
                      className="w-full pl-8 pr-3 py-2 bg-white border border-emerald-300 rounded-lg text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <Phone className="w-3.5 h-3.5 text-emerald-600 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSendTicketWhatsApp()}
                      className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-all shadow-2xs flex items-center justify-center gap-1.5 cursor-pointer"
                      title="Abrir WhatsApp para enviar este ticket"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5 fill-white shrink-0" />
                      <span>Enviar a este número</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleCopyTicketText()}
                      className="py-2 px-3 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1 shrink-0"
                      title="Copiar texto del ticket al portapapeles"
                    >
                      <Copy className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Copiar</span>
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-emerald-800/80 leading-tight">
                  💡 Si dejas el número en blanco, se abrirá tu WhatsApp para elegir cualquier contacto.
                </p>
              </div>
              {/* Direct Printer Connection + Format Selector inside Receipt Modal */}
              <PrinterConnectionManager
                storeSettings={storeSettings}
                selectedFormat={receiptPrinterFormat}
                onSelectFormat={(fmt) => {
                  setReceiptPrinterFormat(fmt);
                  setPreferredPrinterFormat(fmt);
                }}
                showToast={showToast}
                compact
              />

              {/* Compact Paper Format Selector inside Receipt Modal */}
              <div className="bg-slate-100 border border-slate-200 rounded-xl p-2 space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 px-1 block">
                  Formato de papel / PDF:
                </span>
                <div className="grid grid-cols-4 gap-1">
                  {PRINTER_FORMAT_OPTIONS.map((opt) => {
                    const active = receiptPrinterFormat === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setReceiptPrinterFormat(opt.id);
                          setPreferredPrinterFormat(opt.id);
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold text-center transition-all cursor-pointer truncate ${
                          active
                            ? 'bg-slate-900 text-white shadow-2xs'
                            : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {opt.shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleSendTicketWhatsApp()}
                className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Enviar comprobante de venta por WhatsApp"
              >
                <WhatsAppIcon className="w-4 h-4 fill-white shrink-0" />
                <span className="truncate">WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={() => handleDownloadSalePdf(receiptPrinterFormat)}
                className="py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                title="Descargar factura o ticket como archivo .PDF directo"
              >
                <Download className="w-4 h-4" />
                <span>PDF</span>
              </button>

              <button
                type="button"
                onClick={() => handlePrintReceipt(receiptPrinterFormat)}
                className="py-2.5 px-3.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                title="Imprimir en la impresora seleccionada"
              >
                <Printer className="w-4 h-4 text-emerald-400" />
                <span>
                  Imprimir ({PRINTER_FORMAT_OPTIONS.find((o) => o.id === receiptPrinterFormat)?.shortLabel})
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs cursor-pointer shrink-0"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== MULTI-PRINTER & PDF MODAL FOR SALES REPORT ==================== */}
      <PrintFormatModal
        isOpen={showSalesReportPrintModal}
        onClose={() => setShowSalesReportPrintModal(false)}
        title="Reporte Ejecutivo de Ventas y Ganancias"
        subtitle={`${filteredSalesHistory.length} transacciones filtradas`}
        storeSettings={storeSettings}
        defaultFormat="letter"
        buildHtml={(fmt) =>
          buildSalesReportHtml(
            filteredSalesHistory,
            {
              periodLabel: activePeriodLabel,
              count: salesMetrics.count,
              itemsSold: salesMetrics.itemsSold,
              revenue: salesMetrics.revenue,
              totalCost: salesMetrics.totalCost,
              profit: salesMetrics.profit,
              marginPct: salesMetrics.marginPct,
            },
            storeSettings,
            fmt
          )
        }
        onDownloadPdf={() =>
          downloadSalesReportPdf(
            filteredSalesHistory,
            {
              periodLabel: activePeriodLabel,
              count: salesMetrics.count,
              itemsSold: salesMetrics.itemsSold,
              revenue: salesMetrics.revenue,
              totalCost: salesMetrics.totalCost,
              profit: salesMetrics.profit,
              marginPct: salesMetrics.marginPct,
            },
            storeSettings
          )
        }
        showToast={showToast}
      />

      {/* ==================== EDIT SALE MODAL ==================== */}
      <EditSaleModal
        isOpen={Boolean(saleToEdit)}
        sale={saleToEdit}
        inventory={inventory}
        storeSettings={storeSettings}
        isAdmin={isAdminUser}
        canCancelSales={canCancelSales}
        userName={userSession?.userName || 'Administrador'}
        onClose={() => setSaleToEdit(null)}
        onSaveEditedSale={async (orig, updated) => {
          if (onUpdateSale) {
            await onUpdateSale(orig, updated);
            showToast(`Factura ${updated.saleNumber} actualizada correctamente.`, 'success');
          }
        }}
        showToast={showToast}
      />

      {/* ==================== ADMIN AUTH MODAL FOR CANCELLING SALE ==================== */}
      <AdminCancelAuthModal
        isOpen={Boolean(salePendingAdminAuth)}
        sale={salePendingAdminAuth}
        storeSettings={storeSettings}
        onClose={() => setSalePendingAdminAuth(null)}
        onAuthorizedCancel={(authorizedSale) => {
          setSaleToCancel(authorizedSale);
        }}
        showToast={showToast}
      />

      {/* ==================== CONFIRM CANCEL SALE DIALOG ==================== */}
      <ConfirmDialog
        isOpen={Boolean(saleToCancel)}
        title="¿Anular Venta y Restaurar Stock?"
        message={`¿Estás seguro de anular la venta ${saleToCancel?.saleNumber}? Se repondrán las unidades vendidas (${saleToCancel?.totalItems} productos) automáticamente al inventario.`}
        confirmLabel={isCancelling ? 'Anulando...' : 'Sí, Anular Venta'}
        cancelLabel="No, Conservar"
        isDestructive={true}
        onConfirm={handleConfirmCancelSale}
        onCancel={() => setSaleToCancel(null)}
      />
    </div>
  );
};
