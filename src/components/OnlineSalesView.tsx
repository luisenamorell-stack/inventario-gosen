import React, { useState, useMemo } from 'react';
import {
  Product,
  SaleRecord,
  SaleItem,
  StoreSettings,
  UserSession,
  POSFinanceStoreData,
  StoreWarehousesData,
  WarehouseLocation,
  OnlineSaleChannel,
  OnlineShippingStatus,
  OnlineOrderMeta,
  OnlineCustomerProfile,
  StoreExpenseRecord,
  ExpenseCategory,
} from '../types';
import {
  getProductStockInWarehouse,
  getDefaultWarehousesForStore,
} from '../firebase/firestoreService';
import { AdaptiveImage } from './AdaptiveImage';
import { printHtmlDocument } from '../utils/printPdfService';
import { playSound } from '../utils/audio';
import {
  ShoppingBag,
  Video,
  Truck,
  Users,
  TrendingUp,
  Search,
  Plus,
  Minus,
  Trash2,
  Package,
  MapPin,
  Phone,
  User,
  CheckCircle2,
  Clock,
  AlertCircle,
  Printer,
  Edit2,
  X,
  Save,
  DollarSign,
  Boxes,
  Share2,
  Sparkles,
  FileText,
  ArrowRight,
  RotateCcw,
  Tag,
  Filter,
} from 'lucide-react';

interface OnlineSalesViewProps {
  inventory: Product[];
  sales: SaleRecord[];
  storeSettings: StoreSettings;
  warehousesData?: StoreWarehousesData;
  userSession?: UserSession | null;
  posFinanceData: POSFinanceStoreData;
  onRecordSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<SaleRecord>;
  onUpdateSale: (originalSale: SaleRecord, updatedSale: SaleRecord) => Promise<void | SaleRecord>;
  onCancelSale: (sale: SaleRecord) => Promise<void>;
  onSavePOSFinanceData: (nextData: POSFinanceStoreData) => Promise<void>;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export type OnlineSubTab = 'pos-live' | 'orders-guides' | 'customers' | 'finance-pnl';

export const ONLINE_CHANNELS: {
  id: OnlineSaleChannel;
  label: string;
  shortLabel: string;
  badgeClass: string;
  dotClass: string;
}[] = [
  {
    id: 'tiktok_live',
    label: 'TikTok Live 🔴',
    shortLabel: 'TikTok Live',
    badgeClass: 'bg-rose-500/15 text-rose-700 border-rose-300',
    dotClass: 'bg-rose-500',
  },
  {
    id: 'tiktok_shop',
    label: 'TikTok DM / Perfil',
    shortLabel: 'TikTok',
    badgeClass: 'bg-slate-900 text-white border-slate-700',
    dotClass: 'bg-slate-900',
  },
  {
    id: 'facebook_live',
    label: 'Facebook / FB Live',
    shortLabel: 'Facebook',
    badgeClass: 'bg-blue-500/15 text-blue-700 border-blue-300',
    dotClass: 'bg-blue-600',
  },
  {
    id: 'instagram',
    label: 'Instagram DM / Live',
    shortLabel: 'Instagram',
    badgeClass: 'bg-fuchsia-500/15 text-fuchsia-700 border-fuchsia-300',
    dotClass: 'bg-fuchsia-600',
  },
  {
    id: 'whatsapp',
    label: 'WhatsApp / Catálogo',
    shortLabel: 'WhatsApp',
    badgeClass: 'bg-emerald-500/15 text-emerald-700 border-emerald-300',
    dotClass: 'bg-emerald-600',
  },
  {
    id: 'website',
    label: 'Página Web / Otro',
    shortLabel: 'Web / Otro',
    badgeClass: 'bg-indigo-500/15 text-indigo-700 border-indigo-300',
    dotClass: 'bg-indigo-600',
  },
];

export const SHIPPING_STATUS_OPTIONS: {
  id: OnlineShippingStatus;
  label: string;
  badgeClass: string;
}[] = [
  {
    id: 'pending_pack',
    label: 'Pendiente de Empaque',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300',
  },
  {
    id: 'guide_ready',
    label: 'Guía Generada / Listo',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
  },
  {
    id: 'shipped',
    label: 'En Ruta / Enviado',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  },
  {
    id: 'delivered',
    label: 'Entregado al Cliente',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  },
  {
    id: 'returned',
    label: 'Devuelto / No Recibido',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300',
  },
];

const COMMON_CARRIERS = [
  'Cargo Expreso',
  'C807 Express',
  'Forza Delivery',
  "Delivery D'Volada",
  'Rápido Cargo',
  'Encomienda / Transporte',
  'Motorista Propio',
  'Entrega en Tienda',
  'Otro',
];

const HONDURAS_LOCATIONS = [
  'Cortés - San Pedro Sula',
  'Francisco Morazán - Tegucigalpa',
  'Atlántida - La Ceiba',
  'Cortés - Choloma',
  'Cortés - Puerto Cortés',
  'Cortés - Villanueva',
  'Yoro - El Progreso',
  'Comayagua - Comayagua',
  'Comayagua - Siguatepeque',
  'Copán - Santa Rosa de Copán',
  'Choluteca - Choluteca',
  'Olancho - Juticalpa',
  'Olancho - Catacamas',
  'Colón - Tocoa',
  'Islas de la Bahía - Roatán',
  'Santa Bárbara - Santa Bárbara',
  'Intibucá - La Esperanza',
  'El Paraíso - Danlí',
  'Valle - San Lorenzo',
  'La Paz - La Paz',
];

const normalizeSearch = (str: string) =>
  (str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const OnlineSalesView: React.FC<OnlineSalesViewProps> = ({
  inventory,
  sales,
  storeSettings,
  warehousesData,
  userSession,
  posFinanceData,
  onRecordSale,
  onUpdateSale,
  onCancelSale,
  onSavePOSFinanceData,
  showToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<OnlineSubTab>('pos-live');

  // Global Date & Channel Filter for KPIs and Orders
  const [dateRangeFilter, setDateRangeFilter] = useState<'today' | '7d' | 'month' | 'all'>('month');
  const [channelFilter, setChannelFilter] = useState<OnlineSaleChannel | 'all'>('all');
  const [shippingStatusFilter, setShippingStatusFilter] = useState<OnlineShippingStatus | 'all'>('all');
  const [orderSearchQuery, setOrderSearchQuery] = useState('');

  // Active Warehouses
  const activeWarehouses = useMemo<WarehouseLocation[]>(() => {
    const raw =
      Array.isArray(warehousesData?.warehouses) && warehousesData!.warehouses.length > 0
        ? warehousesData!.warehouses
        : getDefaultWarehousesForStore();
    const active = raw.filter((w) => w.isActive !== false);
    return active.length > 0 ? active : getDefaultWarehousesForStore();
  }, [warehousesData]);

  const mainWarehouse = useMemo(
    () => activeWarehouses.find((w) => w.isMainSalesFloor) || activeWarehouses[0],
    [activeWarehouses]
  );

  // Selected Warehouse for Online Order Stock Deduction
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(
    () => mainWarehouse?.id || 'principal'
  );

  const selectedWarehouse = useMemo(
    () =>
      activeWarehouses.find((w) => w.id === selectedWarehouseId) ||
      mainWarehouse ||
      activeWarehouses[0],
    [activeWarehouses, selectedWarehouseId, mainWarehouse]
  );

  // ============================================================================
  // 1. NEW ONLINE / LIVE SALE FORM STATE
  // ============================================================================
  const [saleChannel, setSaleChannel] = useState<OnlineSaleChannel>('tiktok_live');
  const [liveSessionName, setLiveSessionName] = useState<string>(() => {
    try {
      return sessionStorage.getItem('stockmaster_active_live_session') || '';
    } catch {
      return '';
    }
  });
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<string>('0');

  // Customer & Shipping Guide Fields
  const [recipientName, setRecipientName] = useState('');
  const [socialHandle, setSocialHandle] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [departmentCity, setDepartmentCity] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [carrierName, setCarrierName] = useState(COMMON_CARRIERS[0]);
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingStatus, setShippingStatus] = useState<OnlineShippingStatus>('pending_pack');
  const [shippingChargedInput, setShippingChargedInput] = useState<string>('0');
  const [shippingGuideCostInput, setShippingGuideCostInput] = useState<string>('0');
  const [packagingCostInput, setPackagingCostInput] = useState<string>('0');
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'cash' | 'card' | 'credit'>('transfer');
  const [creditInitialAbone, setCreditInitialAbone] = useState<string>('0');
  const [orderNotes, setOrderNotes] = useState('');
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [customerPickerSearch, setCustomerPickerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  // ============================================================================
  // 2. EDIT GUIDE / SHIPPING MODAL STATE
  // ============================================================================
  const [editingOrderSale, setEditingOrderSale] = useState<SaleRecord | null>(null);
  const [editChannel, setEditChannel] = useState<OnlineSaleChannel>('tiktok_live');
  const [editLiveSession, setEditLiveSession] = useState('');
  const [editRecipientName, setEditRecipientName] = useState('');
  const [editSocialHandle, setEditSocialHandle] = useState('');
  const [editRecipientPhone, setEditRecipientPhone] = useState('');
  const [editDepartmentCity, setEditDepartmentCity] = useState('');
  const [editShippingAddress, setEditShippingAddress] = useState('');
  const [editCarrierName, setEditCarrierName] = useState('');
  const [editTrackingNumber, setEditTrackingNumber] = useState('');
  const [editShippingStatus, setEditShippingStatus] = useState<OnlineShippingStatus>('pending_pack');
  const [editShippingCharged, setEditShippingCharged] = useState('0');
  const [editShippingGuideCost, setEditShippingGuideCost] = useState('0');
  const [editPackagingCost, setEditPackagingCost] = useState('0');
  const [editNotes, setEditNotes] = useState('');
  const [isSavingGuide, setIsSavingGuide] = useState(false);

  // ============================================================================
  // 3. ONLINE EXPENSES & CUSTOMERS STATE
  // ============================================================================
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Publicidad');
  const [expChannel, setExpChannel] = useState<OnlineSaleChannel>('tiktok_live');
  const [expDescription, setExpDescription] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expPaymentMethod, setExpPaymentMethod] = useState<'transfer' | 'cash' | 'card'>('transfer');
  const [isSavingExpense, setIsSavingExpense] = useState(false);

  // New Customer Modal in Directory
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [custName, setCustName] = useState('');
  const [custHandle, setCustHandle] = useState('');
  const [custChannel, setCustChannel] = useState<OnlineSaleChannel>('tiktok_live');
  const [custPhone, setCustPhone] = useState('');
  const [custCity, setCustCity] = useState('');
  const [custAddress, setCustAddress] = useState('');
  const [custCarrier, setCustCarrier] = useState(COMMON_CARRIERS[0]);

  // Categories for product picker
  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((p) => {
      if (p.category) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [inventory]);

  // Filtered products with stock in the selected warehouse
  const filteredProducts = useMemo(() => {
    const q = normalizeSearch(productSearch);
    return inventory
      .filter((p) => {
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (!q) return true;
        return (
          normalizeSearch(p.code).includes(q) ||
          normalizeSearch(p.name).includes(q) ||
          normalizeSearch(p.category || '').includes(q) ||
          normalizeSearch(p.size || '').includes(q)
        );
      })
      .slice(0, 60);
  }, [inventory, productSearch, categoryFilter]);

  // Extract all Online Sales from `sales`
  const allOnlineSales = useMemo(() => {
    return sales.filter((s) => s.onlineOrder?.isOnlineSale === true);
  }, [sales]);

  // Consolidated Online Customers (from saved profiles + past online sales)
  const consolidatedCustomers = useMemo(() => {
    const map = new Map<
      string,
      OnlineCustomerProfile & { ordersCount: number; totalSpent: number }
    >();

    // 1. Saved profiles
    (posFinanceData.onlineCustomers || []).forEach((c) => {
      const key = normalizeSearch(c.phone || c.socialHandle || c.name);
      if (!key) return;
      map.set(key, {
        ...c,
        ordersCount: 0,
        totalSpent: 0,
      });
    });

    // 2. Enrich with sales history
    allOnlineSales.forEach((sale) => {
      if (sale.status === 'cancelled' || !sale.onlineOrder) return;
      const meta = sale.onlineOrder;
      const key = normalizeSearch(
        meta.recipientPhone || meta.socialHandle || meta.recipientName || sale.customerName || ''
      );
      if (!key) return;

      const existing = map.get(key);
      if (existing) {
        existing.ordersCount += 1;
        existing.totalSpent += Number(sale.total) || 0;
        if (!existing.socialHandle && meta.socialHandle) existing.socialHandle = meta.socialHandle;
        if (!existing.departmentCity && meta.departmentCity)
          existing.departmentCity = meta.departmentCity;
        if (!existing.shippingAddress && meta.shippingAddress)
          existing.shippingAddress = meta.shippingAddress;
        if (!existing.preferredCarrier && meta.carrierName)
          existing.preferredCarrier = meta.carrierName;
      } else {
        map.set(key, {
          id: `cust_${sale.id}`,
          name: meta.recipientName || sale.customerName || 'Cliente Online',
          socialHandle: meta.socialHandle || '',
          channel: meta.channel || 'tiktok_live',
          phone: meta.recipientPhone || sale.customerPhone || '',
          departmentCity: meta.departmentCity || '',
          shippingAddress: meta.shippingAddress || '',
          preferredCarrier: meta.carrierName || COMMON_CARRIERS[0],
          createdAt: sale.timestamp,
          updatedAt: sale.timestamp,
          ordersCount: 1,
          totalSpent: Number(sale.total) || 0,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalSpent - a.totalSpent);
  }, [posFinanceData.onlineCustomers, allOnlineSales]);

  // Filter online sales by date range, channel, status, and search query
  const filteredOnlineSales = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const q = normalizeSearch(orderSearchQuery);

    return allOnlineSales.filter((sale) => {
      if (dateRangeFilter === 'today' && sale.timestamp < startOfToday.getTime()) return false;
      if (dateRangeFilter === '7d' && sale.timestamp < now - 7 * 86400000) return false;
      if (dateRangeFilter === 'month' && sale.timestamp < startOfMonth.getTime()) return false;

      const meta = sale.onlineOrder;
      if (!meta) return false;

      if (channelFilter !== 'all' && meta.channel !== channelFilter) return false;
      if (shippingStatusFilter !== 'all' && meta.shippingStatus !== shippingStatusFilter)
        return false;

      if (q) {
        const haystack = normalizeSearch(
          `${sale.saleNumber} ${meta.recipientName} ${meta.socialHandle || ''} ${
            meta.recipientPhone
          } ${meta.departmentCity} ${meta.carrierName} ${meta.trackingNumber || ''} ${
            meta.liveSessionName || ''
          }`
        );
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [allOnlineSales, dateRangeFilter, channelFilter, shippingStatusFilter, orderSearchQuery]);

  // Filter online channel expenses by the same date range & channel
  const filteredOnlineExpenses = useMemo(() => {
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    return (posFinanceData.expenses || []).filter((exp) => {
      if (!exp.isOnlineChannelExpense) return false;
      if (dateRangeFilter === 'today' && exp.timestamp < startOfToday.getTime()) return false;
      if (dateRangeFilter === '7d' && exp.timestamp < now - 7 * 86400000) return false;
      if (dateRangeFilter === 'month' && exp.timestamp < startOfMonth.getTime()) return false;
      if (channelFilter !== 'all' && exp.onlineChannel && exp.onlineChannel !== channelFilter)
        return false;
      return true;
    });
  }, [posFinanceData.expenses, dateRangeFilter, channelFilter]);

  // Compute Executive P&L Metrics for Online / Social Sales
  const onlineMetrics = useMemo(() => {
    const completedOrders = filteredOnlineSales.filter((s) => s.status !== 'cancelled');
    let grossRevenue = 0; // Total billed to customers (items - discount + shippingCharged)
    let itemsRevenue = 0;
    let shippingChargedTotal = 0;
    let itemsCostTotal = 0;
    let guidesCostTotal = 0;
    let packagingCostTotal = 0;
    let pendingGuidesCount = 0;

    completedOrders.forEach((sale) => {
      const meta = sale.onlineOrder;
      const shipCharged = Number(meta?.shippingChargedToCustomer) || 0;
      const guideCost = Number(meta?.shippingGuideCost) || 0;
      const packCost = Number(meta?.packagingCost) || 0;

      grossRevenue += Number(sale.total) || 0;
      shippingChargedTotal += shipCharged;
      itemsRevenue += Math.max(0, (Number(sale.total) || 0) - shipCharged);
      guidesCostTotal += guideCost;
      packagingCostTotal += packCost;

      if (meta?.shippingStatus === 'pending_pack' || !meta?.trackingNumber) {
        pendingGuidesCount += 1;
      }

      (sale.items || []).forEach((it) => {
        const unitCost =
          it.cost !== undefined && it.cost > 0
            ? Number(it.cost)
            : Number(
                inventory.find(
                  (p) => p.code.toLowerCase() === it.code.toLowerCase() || p.id === it.productId
                )?.cost || 0
              );
        itemsCostTotal += unitCost * (Number(it.quantity) || 1);
      });
    });

    const extraChannelExpensesTotal = filteredOnlineExpenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0
    );

    const netOrderProfit =
      grossRevenue - itemsCostTotal - guidesCostTotal - packagingCostTotal;
    const netFinalProfit = netOrderProfit - extraChannelExpensesTotal;

    return {
      ordersCount: completedOrders.length,
      grossRevenue,
      itemsRevenue,
      shippingChargedTotal,
      itemsCostTotal,
      guidesCostTotal,
      packagingCostTotal,
      totalLogisticsCost: guidesCostTotal + packagingCostTotal,
      extraChannelExpensesTotal,
      netOrderProfit,
      netFinalProfit,
      pendingGuidesCount,
    };
  }, [filteredOnlineSales, filteredOnlineExpenses, inventory]);

  // ============================================================================
  // CART CALCULATIONS FOR NEW ONLINE SALE
  // ============================================================================
  const cartItemsSubtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.price * item.quantity, 0),
    [cart]
  );

  const cartItemsTotalCost = useMemo(
    () => cart.reduce((acc, item) => acc + (Number(item.cost) || 0) * item.quantity, 0),
    [cart]
  );

  const parsedDiscount = Math.max(0, Number(orderDiscount) || 0);
  const parsedShippingCharged = Math.max(0, Number(shippingChargedInput) || 0);
  const parsedShippingGuideCost = Math.max(0, Number(shippingGuideCostInput) || 0);
  const parsedPackagingCost = Math.max(0, Number(packagingCostInput) || 0);

  // Total charged to the customer (Items - Discount + Shipping Charged)
  const orderTotalToCharge = Math.max(
    0,
    cartItemsSubtotal - parsedDiscount + parsedShippingCharged
  );

  // Real Net Profit of this specific order:
  // (Order Total Charged) - (Cost of Items) - (Real Guide Cost) - (Packaging Cost)
  const orderEstimatedNetProfit =
    orderTotalToCharge - cartItemsTotalCost - parsedShippingGuideCost - parsedPackagingCost;

  const handleAddToCart = (product: Product) => {
    const availInWarehouse = getProductStockInWarehouse(
      product,
      selectedWarehouse.id,
      activeWarehouses
    );

    const existing = cart.find((c) => c.code.toLowerCase() === product.code.toLowerCase());
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty + 1 > availInWarehouse) {
      playSound('error');
      showToast(
        `Stock insuficiente en "${selectedWarehouse.name}". Disponible: ${availInWarehouse} unids.`,
        'warning'
      );
      return;
    }

    const basePrice = Number(product.price) || 0;
    const disc = Math.min(basePrice, Math.max(0, Number(product.discount) || 0));
    const effectivePrice = Math.max(0, basePrice - disc);

    playSound('beep');
    setCart((prev) => {
      if (existing) {
        return prev.map((it) =>
          it.code.toLowerCase() === product.code.toLowerCase()
            ? {
                ...it,
                quantity: it.quantity + 1,
                subtotal: (it.quantity + 1) * it.price,
              }
            : it
        );
      }
      return [
        ...prev,
        {
          productId: product.id,
          code: product.code,
          name: product.name,
          category: product.category || 'General',
          size: product.size || '',
          originalPrice: basePrice,
          unitDiscount: disc,
          price: effectivePrice,
          cost: Number(product.cost) || 0,
          quantity: 1,
          subtotal: effectivePrice,
        },
      ];
    });
  };

  const handleUpdateCartQty = (code: string, delta: number) => {
    const prod = inventory.find((p) => p.code.toLowerCase() === code.toLowerCase());
    const availInWarehouse = prod
      ? getProductStockInWarehouse(prod, selectedWarehouse.id, activeWarehouses)
      : 9999;

    setCart((prev) =>
      prev
        .map((it) => {
          if (it.code.toLowerCase() !== code.toLowerCase()) return it;
          const nextQty = it.quantity + delta;
          if (nextQty <= 0) return null;
          if (nextQty > availInWarehouse) {
            showToast(
              `Solo hay ${availInWarehouse} unidades disponibles en ${selectedWarehouse.name}.`,
              'warning'
            );
            return it;
          }
          return {
            ...it,
            quantity: nextQty,
            subtotal: nextQty * it.price,
          };
        })
        .filter(Boolean) as SaleItem[]
    );
  };

  const handleUpdateCartPrice = (code: string, newPriceRaw: string) => {
    const cleanPrice = Math.max(0, Number(newPriceRaw) || 0);
    setCart((prev) =>
      prev.map((it) =>
        it.code.toLowerCase() === code.toLowerCase()
          ? {
              ...it,
              price: cleanPrice,
              subtotal: it.quantity * cleanPrice,
            }
          : it
      )
    );
  };

  const handleSelectSavedCustomer = (cust: OnlineCustomerProfile) => {
    setRecipientName(cust.name);
    setSocialHandle(cust.socialHandle || '');
    setRecipientPhone(cust.phone || '');
    setDepartmentCity(cust.departmentCity || '');
    setShippingAddress(cust.shippingAddress || '');
    if (cust.preferredCarrier) setCarrierName(cust.preferredCarrier);
    if (cust.channel) setSaleChannel(cust.channel);
    setShowCustomerDropdown(false);
    setCustomerPickerSearch('');
    showToast(`Datos de ${cust.name} cargados`, 'info');
  };

  const handleSubmitOnlineSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) {
      showToast('Agrega al menos un artículo al pedido online.', 'warning');
      return;
    }
    if (!recipientName.trim()) {
      showToast('Ingresa el nombre del cliente o destinatario.', 'warning');
      return;
    }

    setIsSubmittingSale(true);
    try {
      const now = Date.now();
      const saleNum = `LIVE-${now.toString().slice(-6)}`;
      const cleanLiveSession = liveSessionName.trim();
      if (cleanLiveSession) {
        try {
          sessionStorage.setItem('stockmaster_active_live_session', cleanLiveSession);
        } catch {}
      }

      const onlineMeta: OnlineOrderMeta = {
        isOnlineSale: true,
        channel: saleChannel,
        liveSessionName: cleanLiveSession || undefined,
        socialHandle: socialHandle.trim() || undefined,
        recipientName: recipientName.trim(),
        recipientPhone: recipientPhone.trim(),
        departmentCity: departmentCity.trim() || 'Por confirmar',
        shippingAddress: shippingAddress.trim() || 'Dirección por confirmar',
        carrierName: carrierName.trim() || 'Cargo Expreso',
        trackingNumber: trackingNumber.trim() || undefined,
        shippingChargedToCustomer: parsedShippingCharged,
        shippingGuideCost: parsedShippingGuideCost,
        packagingCost: parsedPackagingCost,
        shippingStatus: trackingNumber.trim() && shippingStatus === 'pending_pack'
          ? 'guide_ready'
          : shippingStatus,
        codAmountToCollect: paymentMethod === 'cash' ? orderTotalToCharge : 0,
      };

      const isCredit = paymentMethod === 'credit';
      const initialPaid = isCredit
        ? Math.min(orderTotalToCharge, Math.max(0, Number(creditInitialAbone) || 0))
        : orderTotalToCharge;

      const channelObj =
        ONLINE_CHANNELS.find((c) => c.id === saleChannel) || ONLINE_CHANNELS[0];

      const summaryNote = [
        `[${channelObj.shortLabel}]`,
        cleanLiveSession ? `Live: ${cleanLiveSession}` : '',
        onlineMeta.carrierName ? `Envío: ${onlineMeta.carrierName}` : '',
        onlineMeta.trackingNumber ? `Guía: ${onlineMeta.trackingNumber}` : '',
        orderNotes.trim(),
      ]
        .filter(Boolean)
        .join(' | ');

      const salePayload: Omit<SaleRecord, 'id'> = {
        saleNumber: saleNum,
        timestamp: now,
        date: new Date(now).toLocaleString('es-HN'),
        items: cart,
        totalItems: cart.reduce((acc, it) => acc + it.quantity, 0),
        subtotal: cartItemsSubtotal + parsedShippingCharged,
        discount: parsedDiscount,
        tax: 0,
        total: orderTotalToCharge,
        paymentMethod,
        amountPaid: initialPaid,
        change: 0,
        balanceDue: isCredit ? Math.max(0, orderTotalToCharge - initialPaid) : 0,
        creditStatus: isCredit
          ? orderTotalToCharge - initialPaid <= 0.01
            ? 'paid'
            : 'pending'
          : 'paid',
        creditPayments:
          isCredit && initialPaid > 0
            ? [
                {
                  id: `abn_${now}`,
                  amount: initialPaid,
                  paymentMethod: 'transfer',
                  timestamp: now,
                  date: new Date(now).toLocaleString('es-HN'),
                  receivedBy: userSession?.userName || 'Administrador',
                  notes: 'Anticipo en venta online / Live',
                },
              ]
            : [],
        customerName:
          socialHandle.trim()
            ? `${recipientName.trim()} (${socialHandle.trim()})`
            : recipientName.trim(),
        customerPhone: recipientPhone.trim(),
        notes: summaryNote,
        status: 'completed',
        warehouseId: selectedWarehouse.id,
        warehouseName: selectedWarehouse.name,
        onlineOrder: onlineMeta,
      };

      await onRecordSale(salePayload);

      // Also auto-save/update customer profile in posFinanceData.onlineCustomers
      const existingCustomers = posFinanceData.onlineCustomers || [];
      const custKey = normalizeSearch(recipientPhone || socialHandle || recipientName);
      if (custKey) {
        const existingIdx = existingCustomers.findIndex(
          (c) => normalizeSearch(c.phone || c.socialHandle || c.name) === custKey
        );
        const updatedProfile: OnlineCustomerProfile = {
          id: existingIdx >= 0 ? existingCustomers[existingIdx].id : `ocust_${now}`,
          name: recipientName.trim(),
          socialHandle: socialHandle.trim() || undefined,
          channel: saleChannel,
          phone: recipientPhone.trim(),
          departmentCity: departmentCity.trim(),
          shippingAddress: shippingAddress.trim(),
          preferredCarrier: carrierName,
          createdAt: existingIdx >= 0 ? existingCustomers[existingIdx].createdAt : now,
          updatedAt: now,
        };
        const nextCustomers =
          existingIdx >= 0
            ? existingCustomers.map((c, idx) => (idx === existingIdx ? updatedProfile : c))
            : [updatedProfile, ...existingCustomers];

        onSavePOSFinanceData({
          ...posFinanceData,
          onlineCustomers: nextCustomers,
        }).catch(() => {});
      }

      playSound('cash-register');
      showToast(
        `¡Pedido ${saleNum} registrado! Stock descontado de ${selectedWarehouse.name}.`,
        'success'
      );

      // Reset cart & customer fields (keep liveSessionName, saleChannel, and selectedWarehouseId for next live viewer!)
      setCart([]);
      setOrderDiscount('0');
      setRecipientName('');
      setSocialHandle('');
      setRecipientPhone('');
      setDepartmentCity('');
      setShippingAddress('');
      setTrackingNumber('');
      setShippingChargedInput('0');
      setShippingGuideCostInput('0');
      setPackagingCostInput('0');
      setCreditInitialAbone('0');
      setOrderNotes('');
    } catch (err: any) {
      console.error('Error recording online sale:', err);
      showToast('Error al registrar venta online: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // ============================================================================
  // OPEN & SAVE EDIT GUIDE / SHIPPING MODAL
  // ============================================================================
  const handleOpenEditOrderModal = (sale: SaleRecord) => {
    const meta = sale.onlineOrder;
    if (!meta) return;
    setEditingOrderSale(sale);
    setEditChannel(meta.channel || 'tiktok_live');
    setEditLiveSession(meta.liveSessionName || '');
    setEditRecipientName(meta.recipientName || sale.customerName || '');
    setEditSocialHandle(meta.socialHandle || '');
    setEditRecipientPhone(meta.recipientPhone || sale.customerPhone || '');
    setEditDepartmentCity(meta.departmentCity || '');
    setEditShippingAddress(meta.shippingAddress || '');
    setEditCarrierName(meta.carrierName || COMMON_CARRIERS[0]);
    setEditTrackingNumber(meta.trackingNumber || '');
    setEditShippingStatus(meta.shippingStatus || 'pending_pack');
    setEditShippingCharged(String(meta.shippingChargedToCustomer ?? 0));
    setEditShippingGuideCost(String(meta.shippingGuideCost ?? 0));
    setEditPackagingCost(String(meta.packagingCost ?? 0));
    setEditNotes(sale.notes || '');
  };

  const handleSaveEditedOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrderSale || !editingOrderSale.onlineOrder) return;
    setIsSavingGuide(true);
    try {
      const oldMeta = editingOrderSale.onlineOrder;
      const newShipCharged = Math.max(0, Number(editShippingCharged) || 0);
      const newGuideCost = Math.max(0, Number(editShippingGuideCost) || 0);
      const newPackCost = Math.max(0, Number(editPackagingCost) || 0);

      const itemsSub = (editingOrderSale.items || []).reduce(
        (sum, it) => sum + (Number(it.subtotal) || Number(it.price) * Number(it.quantity)),
        0
      );
      const disc = Number(editingOrderSale.discount) || 0;
      const newTotal = Math.max(0, itemsSub - disc + newShipCharged);

      const updatedMeta: OnlineOrderMeta = {
        ...oldMeta,
        isOnlineSale: true,
        channel: editChannel,
        liveSessionName: editLiveSession.trim() || undefined,
        recipientName: editRecipientName.trim() || 'Cliente Online',
        socialHandle: editSocialHandle.trim() || undefined,
        recipientPhone: editRecipientPhone.trim(),
        departmentCity: editDepartmentCity.trim(),
        shippingAddress: editShippingAddress.trim(),
        carrierName: editCarrierName.trim(),
        trackingNumber: editTrackingNumber.trim() || undefined,
        shippingStatus: editShippingStatus,
        shippingChargedToCustomer: newShipCharged,
        shippingGuideCost: newGuideCost,
        packagingCost: newPackCost,
        dispatchedAt:
          editShippingStatus === 'shipped' && !oldMeta.dispatchedAt
            ? new Date().toLocaleString('es-HN')
            : oldMeta.dispatchedAt,
        deliveredAt:
          editShippingStatus === 'delivered' && !oldMeta.deliveredAt
            ? new Date().toLocaleString('es-HN')
            : oldMeta.deliveredAt,
      };

      const updatedSale: SaleRecord = {
        ...editingOrderSale,
        subtotal: itemsSub + newShipCharged,
        total: newTotal,
        amountPaid:
          editingOrderSale.paymentMethod === 'credit'
            ? editingOrderSale.amountPaid
            : newTotal,
        customerName: editSocialHandle.trim()
          ? `${editRecipientName.trim()} (${editSocialHandle.trim()})`
          : editRecipientName.trim(),
        customerPhone: editRecipientPhone.trim(),
        notes: editNotes.trim(),
        onlineOrder: updatedMeta,
        lastEditedBy: userSession?.userName || 'Administrador',
        lastEditedAt: new Date().toLocaleString('es-HN'),
      };

      await onUpdateSale(editingOrderSale, updatedSale);
      setEditingOrderSale(null);
      showToast('Guía, costos de envío y estado actualizados correctamente', 'success');
    } catch (err: any) {
      showToast('Error al actualizar guía: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSavingGuide(false);
    }
  };

  // Quick 1-Click Shipping Status Cycling on Order Card
  const handleQuickStatusChange = async (sale: SaleRecord, nextStatus: OnlineShippingStatus) => {
    if (!sale.onlineOrder) return;
    try {
      const updatedSale: SaleRecord = {
        ...sale,
        onlineOrder: {
          ...sale.onlineOrder,
          shippingStatus: nextStatus,
          dispatchedAt:
            nextStatus === 'shipped' && !sale.onlineOrder.dispatchedAt
              ? new Date().toLocaleString('es-HN')
              : sale.onlineOrder.dispatchedAt,
          deliveredAt:
            nextStatus === 'delivered' && !sale.onlineOrder.deliveredAt
              ? new Date().toLocaleString('es-HN')
              : sale.onlineOrder.deliveredAt,
        },
      };
      await onUpdateSale(sale, updatedSale);
      showToast('Estado de envío actualizado', 'success');
    } catch {
      showToast('No se pudo cambiar el estado del envío', 'error');
    }
  };

  // Print Shipping Guide / Package Label (Rótulo de Envío)
  const handlePrintShippingLabel = (sale: SaleRecord) => {
    const meta = sale.onlineOrder;
    if (!meta) return;
    const storeName = storeSettings.storeName || 'MI TIENDA';
    const storePhone = storeSettings.phone || '';
    const storeAddress = storeSettings.address || '';
    const channelObj =
      ONLINE_CHANNELS.find((c) => c.id === meta.channel) || ONLINE_CHANNELS[0];

    const itemsRows = (sale.items || [])
      .map(
        (it) =>
          `<tr>
            <td style="padding:4px 0;font-weight:700;">${it.quantity}x ${it.name}${
            it.size ? ` (Talla ${it.size})` : ''
          }</td>
            <td style="padding:4px 0;text-align:right;font-family:monospace;">${it.code}</td>
          </tr>`
      )
      .join('');

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Guía de Envío ${sale.saleNumber}</title>
  <style>
    @page { margin: 8mm; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #0f172a;
      margin: 0;
      padding: 0;
    }
    .label-box {
      max-width: 380px;
      margin: 0 auto;
      border: 3px solid #0f172a;
      border-radius: 12px;
      padding: 14px;
    }
    .header {
      border-bottom: 2px dashed #0f172a;
      padding-bottom: 10px;
      margin-bottom: 10px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .carrier-banner {
      background: #0f172a;
      color: #ffffff;
      padding: 8px 12px;
      border-radius: 8px;
      text-align: center;
      margin-bottom: 12px;
    }
    .dest-box {
      background: #f8fafc;
      border: 2px solid #cbd5e1;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 12px;
    }
    .tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      background: #e2e8f0;
      padding: 2px 6px;
      border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="label-box">
    <div class="header">
      <div>
        <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#475569;">REMITENTE</div>
        <div style="font-size:16px;font-weight:900;">${storeName}</div>
        ${storePhone ? `<div style="font-size:12px;font-weight:600;">Tel: ${storePhone}</div>` : ''}
        ${storeAddress ? `<div style="font-size:11px;color:#475569;">${storeAddress}</div>` : ''}
      </div>
      <div style="text-align:right;">
        <span class="tag">${channelObj.shortLabel}</span>
        <div style="font-size:13px;font-weight:900;margin-top:4px;">#${sale.saleNumber}</div>
        <div style="font-size:10px;color:#64748b;">${sale.date}</div>
      </div>
    </div>

    <div class="carrier-banner">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;opacity:0.85;">EMPRESA DE ENVÍO / PAQUETERÍA</div>
      <div style="font-size:20px;font-weight:900;margin-top:2px;">${meta.carrierName || 'ENVÍO DIRECTO'}</div>
      <div style="font-size:15px;font-family:monospace;font-weight:800;margin-top:4px;color:#34d399;">
        GUÍA N°: ${meta.trackingNumber || 'PENDIENTE DE ASIGNAR'}
      </div>
    </div>

    <div class="dest-box">
      <div style="font-size:10px;font-weight:900;text-transform:uppercase;color:#475569;margin-bottom:4px;">
        ENTREGAR A (DESTINATARIO):
      </div>
      <div style="font-size:18px;font-weight:900;line-height:1.2;">
        ${meta.recipientName}
        ${meta.socialHandle ? `<span style="font-size:13px;font-weight:700;color:#475569;">(${meta.socialHandle})</span>` : ''}
      </div>
      <div style="font-size:15px;font-weight:900;margin-top:6px;">
        📞 Tel: ${meta.recipientPhone || 'No registrado'}
      </div>
      <div style="font-size:14px;font-weight:800;margin-top:6px;padding:4px 8px;background:#e2e8f0;border-radius:6px;">
        📍 Destino: ${meta.departmentCity || 'Por confirmar'}
      </div>
      <div style="font-size:13px;font-weight:600;margin-top:6px;line-height:1.35;">
        🏠 Dirección: ${meta.shippingAddress || 'Por confirmar'}
      </div>
    </div>

    <div style="border-top:1px solid #cbd5e1;padding-top:8px;margin-bottom:10px;">
      <div style="font-size:11px;font-weight:800;text-transform:uppercase;color:#475569;margin-bottom:4px;">
        CONTENIDO DEL PAQUETE (${sale.totalItems} unids · Salida: ${sale.warehouseName || 'Principal'})
      </div>
      <table style="width:100%;font-size:12px;border-collapse:collapse;">
        ${itemsRows}
      </table>
    </div>

    <div style="border-top:2px solid #0f172a;padding-top:8px;display:flex;justify-content:space-between;align-items:center;">
      <div style="font-size:12px;font-weight:800;">
        ${
          sale.paymentMethod === 'cash'
            ? '⚠️ COBRAR CONTRA ENTREGA:'
            : sale.paymentMethod === 'credit' && (sale.balanceDue || 0) > 0
            ? '⚠️ SALDO PENDIENTE:'
            : '✅ PEDIDO PAGADO:'
        }
      </div>
      <div style="font-size:18px;font-weight:900;">
        L. ${(sale.paymentMethod === 'credit' ? sale.balanceDue || 0 : sale.total).toFixed(2)}
      </div>
    </div>
  </div>
</body>
</html>`;

    printHtmlDocument(html, `Guia_${sale.saleNumber}`, 'half-letter');
  };

  // Send WhatsApp Tracking Notification to Customer
  const handleSendWhatsAppTracking = (sale: SaleRecord) => {
    const meta = sale.onlineOrder;
    if (!meta) return;
    const rawPhone = (meta.recipientPhone || sale.customerPhone || '').replace(/\D/g, '');
    if (!rawPhone) {
      showToast('Este pedido no tiene número de teléfono registrado.', 'warning');
      return;
    }
    const cleanPhone = rawPhone.length === 8 ? `504${rawPhone}` : rawPhone;
    const statusObj =
      SHIPPING_STATUS_OPTIONS.find((s) => s.id === meta.shippingStatus) ||
      SHIPPING_STATUS_OPTIONS[0];

    const itemsList = (sale.items || [])
      .map((it) => `• ${it.quantity}x ${it.name}${it.size ? ` (${it.size})` : ''}`)
      .join('\n');

    const message =
      `📦 *ACTUALIZACIÓN DE TU PEDIDO ${storeSettings.storeName.toUpperCase()}*\n\n` +
      `Hola *${meta.recipientName}*, aquí tienes los detalles de envío de tu compra (${sale.saleNumber}):\n\n` +
      `🚚 *Paquetería:* ${meta.carrierName || 'Por confirmar'}\n` +
      `🔢 *N° de Guía:* ${meta.trackingNumber || 'En proceso de asignación'}\n` +
      `📍 *Destino:* ${meta.departmentCity} — ${meta.shippingAddress}\n` +
      `📌 *Estado:* ${statusObj.label}\n\n` +
      `🛍️ *Artículos:*\n${itemsList}\n\n` +
      `💰 *Total Pedido:* L. ${Number(sale.total).toFixed(2)}\n\n` +
      `¡Gracias por tu compra! 🙌`;

    window.open(
      `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  // Save Online Channel Expense (Ads, Guides batch, Packaging, etc.)
  const handleSaveOnlineExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(expAmount);
    if (!expDescription.trim() || isNaN(amountNum) || amountNum <= 0) {
      showToast('Ingresa una descripción y un monto válido para el gasto.', 'warning');
      return;
    }

    setIsSavingExpense(true);
    try {
      const now = Date.now();
      const newExp: StoreExpenseRecord = {
        id: `exp_online_${now}`,
        companyId: posFinanceData.companyId,
        date: new Date(now).toISOString().slice(0, 10),
        timestamp: now,
        category: expCategory,
        description: expDescription.trim(),
        amount: amountNum,
        paymentMethod: expPaymentMethod,
        registeredBy: userSession?.userName || 'Administrador',
        fromCashDrawer: false,
        isOnlineChannelExpense: true,
        onlineChannel: expChannel,
        liveSessionName: liveSessionName.trim() || undefined,
      };

      await onSavePOSFinanceData({
        ...posFinanceData,
        expenses: [newExp, ...(posFinanceData.expenses || [])],
      });

      setExpDescription('');
      setExpAmount('');
      showToast('Gasto de ventas online registrado correctamente', 'success');
    } catch {
      showToast('Error al guardar el gasto online', 'error');
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteOnlineExpense = async (expId: string) => {
    try {
      await onSavePOSFinanceData({
        ...posFinanceData,
        expenses: (posFinanceData.expenses || []).filter((e) => e.id !== expId),
      });
      showToast('Gasto eliminado', 'info');
    } catch {
      showToast('No se pudo eliminar el gasto', 'error');
    }
  };

  // Save New Online Customer Profile in Directory
  const handleSaveCustomerDirectory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!custName.trim()) {
      showToast('Ingresa el nombre del cliente.', 'warning');
      return;
    }
    const now = Date.now();
    const newCust: OnlineCustomerProfile = {
      id: `ocust_${now}`,
      name: custName.trim(),
      socialHandle: custHandle.trim() || undefined,
      channel: custChannel,
      phone: custPhone.trim(),
      departmentCity: custCity.trim(),
      shippingAddress: custAddress.trim(),
      preferredCarrier: custCarrier,
      createdAt: now,
      updatedAt: now,
    };

    await onSavePOSFinanceData({
      ...posFinanceData,
      onlineCustomers: [newCust, ...(posFinanceData.onlineCustomers || [])],
    });

    setShowNewCustomerModal(false);
    setCustName('');
    setCustHandle('');
    setCustPhone('');
    setCustCity('');
    setCustAddress('');
    showToast('Cliente online guardado en el directorio', 'success');
  };

  return (
    <div className="flex-1 min-h-0 w-full h-full flex flex-col overflow-y-auto bg-slate-100 p-3 sm:p-5 lg:p-6 pb-28 md:pb-10 space-y-4">
      {/* Top Header + Global Filter Bar */}
      <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-slate-800 flex flex-col gap-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 via-fuchsia-600 to-indigo-600 flex items-center justify-center text-white shadow-md shrink-0">
              <Video className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-white">
                  Ventas Online, Redes Sociales y Live
                </h1>
                <span className="text-[11px] font-bold text-rose-300">
                  TikTok Live · Instagram · Facebook · Guías de Envío
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Descuenta automáticamente de la bodega seleccionada y controla clientes, destinos, costo de guías y ganancia neta real.
              </p>
            </div>
          </div>

          {/* Period & Channel Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-800 p-1 rounded-xl border border-slate-700">
              {(
                [
                  { id: 'today', label: 'Hoy' },
                  { id: '7d', label: '7 Días' },
                  { id: 'month', label: 'Mes' },
                  { id: 'all', label: 'Todo' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setDateRangeFilter(p.id)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                    dateRangeFilter === p.id
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <select
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value as OnlineSaleChannel | 'all')}
              className="px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white outline-none focus:border-emerald-500 cursor-pointer"
            >
              <option value="all">Todas las Redes / Canales</option>
              {ONLINE_CHANNELS.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 5 Real-Time Financial KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Ventas Online ({onlineMetrics.ordersCount} ped.)
            </span>
            <p className="text-base sm:text-lg font-black text-white tabular-nums mt-0.5">
              L. {onlineMetrics.grossRevenue.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Envíos cobrados: L. {onlineMetrics.shippingChargedTotal.toFixed(2)}
            </span>
          </div>

          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Costo de Artículos
            </span>
            <p className="text-base sm:text-lg font-black text-amber-300 tabular-nums mt-0.5">
              L. {onlineMetrics.itemsCostTotal.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Costo mercadería vendida
            </span>
          </div>

          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Costo Guías y Empaque
            </span>
            <p className="text-base sm:text-lg font-black text-rose-300 tabular-nums mt-0.5">
              L. {onlineMetrics.totalLogisticsCost.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Guías: L. {onlineMetrics.guidesCostTotal.toFixed(0)} · Empaque: L.{' '}
              {onlineMetrics.packagingCostTotal.toFixed(0)}
            </span>
          </div>

          <div className="bg-slate-800/90 border border-slate-700/80 rounded-xl p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Gastos Live / Publicidad
            </span>
            <p className="text-base sm:text-lg font-black text-orange-300 tabular-nums mt-0.5">
              L.{' '}
              {onlineMetrics.extraChannelExpensesTotal.toLocaleString('es-HN', {
                minimumFractionDigits: 2,
              })}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">
              Ads, insumos y comisiones
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 bg-gradient-to-br from-emerald-900/90 to-teal-900/90 border border-emerald-500/40 rounded-xl p-3">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 block">
              Ganancia Neta Real Online
            </span>
            <p
              className={`text-base sm:text-lg font-black tabular-nums mt-0.5 ${
                onlineMetrics.netFinalProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
              }`}
            >
              L. {onlineMetrics.netFinalProfit.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
            </p>
            <span className="text-[10px] text-emerald-200/80 block mt-0.5">
              Libre tras costos, guías y gastos
            </span>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSubTab('pos-live')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeSubTab === 'pos-live'
                ? 'bg-rose-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Video className="w-4 h-4 shrink-0" />
            <span>Nueva Venta Online / Live</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('orders-guides')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeSubTab === 'orders-guides'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Truck className="w-4 h-4 shrink-0" />
            <span>Pedidos, Envíos y Guías ({filteredOnlineSales.length})</span>
            {onlineMetrics.pendingGuidesCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-400 text-slate-950 text-[10px] font-black">
                {onlineMetrics.pendingGuidesCount} pend.
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('customers')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeSubTab === 'customers'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Clientes de Lives ({consolidatedCustomers.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('finance-pnl')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
              activeSubTab === 'finance-pnl'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white'
            }`}
          >
            <TrendingUp className="w-4 h-4 shrink-0" />
            <span>Gastos y Ganancias Online</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* SUB-TAB 1: NUEVA VENTA ONLINE / LIVE (POS + BODEGA + GUÍA)            */}
      {/* ==================================================================== */}
      {activeSubTab === 'pos-live' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column (7 cols): Warehouse Selector + Product Catalog */}
          <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 space-y-4">
            {/* Warehouse & Live Channel Selector Bar */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/90 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Warehouse Selector */}
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    📦 Bodega de donde se rebaja el Stock:
                  </label>
                  <div className="relative">
                    <select
                      value={selectedWarehouse.id}
                      onChange={(e) => setSelectedWarehouseId(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white border-2 border-emerald-500/70 text-xs sm:text-sm font-extrabold text-slate-900 focus:outline-none focus:border-emerald-600 cursor-pointer"
                    >
                      {activeWarehouses.map((wh) => (
                        <option key={wh.id} value={wh.id}>
                          {wh.name} ({wh.code || (wh.isMainSalesFloor ? 'Principal' : 'Bodega')})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Live Session / Broadcast Name */}
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                    🔴 Nombre del Live / Campaña (Opcional):
                  </label>
                  <input
                    type="text"
                    value={liveSessionName}
                    onChange={(e) => setLiveSessionName(e.target.value)}
                    placeholder="Ej. Live TikTok Viernes Noche"
                    className="w-full px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs sm:text-sm font-semibold text-slate-800 focus:outline-none focus:border-rose-500"
                  />
                </div>
              </div>

              {/* Quick Social Network Selector Buttons */}
              <div>
                <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5">
                  Red Social / Canal de Venta:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {ONLINE_CHANNELS.map((ch) => {
                    const isSelected = saleChannel === ch.id;
                    return (
                      <button
                        key={ch.id}
                        type="button"
                        onClick={() => setSaleChannel(ch.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-slate-900 text-white border-slate-900 shadow-xs scale-[1.02]'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${ch.dotClass}`} />
                        <span>{ch.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Product Search & Category Filter */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar artículo por código, nombre o talla para el pedido..."
                  className="w-full pl-10 pr-8 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-medium text-slate-800 focus:bg-white focus:border-emerald-500 outline-none"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>

              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs sm:text-sm font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Todas las Categorías</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            {/* Product Grid with Warehouse Stock */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[540px] overflow-y-auto pr-1">
              {filteredProducts.map((product) => {
                const stockInWh = getProductStockInWarehouse(
                  product,
                  selectedWarehouse.id,
                  activeWarehouses
                );
                const basePrice = Number(product.price) || 0;
                const disc = Math.min(basePrice, Math.max(0, Number(product.discount) || 0));
                const finalPrice = Math.max(0, basePrice - disc);
                const inCartItem = cart.find(
                  (c) => c.code.toLowerCase() === product.code.toLowerCase()
                );

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => handleAddToCart(product)}
                    disabled={stockInWh <= 0}
                    className={`group text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between relative ${
                      stockInWh <= 0
                        ? 'bg-slate-50 border-slate-200 opacity-55 cursor-not-allowed'
                        : inCartItem
                        ? 'bg-emerald-50/60 border-emerald-500 ring-1 ring-emerald-500/40 cursor-pointer'
                        : 'bg-white hover:bg-slate-50 border-slate-200 hover:border-emerald-400 cursor-pointer shadow-2xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-11 h-11 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center text-slate-400">
                          <AdaptiveImage
                            src={product.img}
                            alt={product.name}
                            variant="product"
                            fallback={<Package className="w-5 h-5" />}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-mono text-slate-400 truncate">
                            {product.code}
                          </p>
                          <p className="text-xs font-extrabold text-slate-800 line-clamp-2 leading-tight">
                            {product.name}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-end justify-between gap-1">
                      <div>
                        <p className="text-sm font-black text-emerald-700 tabular-nums leading-none">
                          L. {finalPrice.toFixed(2)}
                        </p>
                        <p
                          className={`text-[10px] font-bold mt-1 ${
                            stockInWh > 0 ? 'text-slate-600' : 'text-rose-600'
                          }`}
                        >
                          {stockInWh > 0 ? `${stockInWh} en bodega` : 'Agotado en bodega'}
                        </p>
                      </div>
                      {inCartItem && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[11px] font-black tabular-nums">
                          {inCartItem.quantity}x
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}

              {filteredProducts.length === 0 && (
                <div className="col-span-full py-10 text-center text-slate-400 text-xs">
                  No se encontraron artículos con ese criterio.
                </div>
              )}
            </div>
          </div>

          {/* Right Column (5 cols): Cart + Customer Shipping Address + Guide Cost + Live Profit */}
          <form
            onSubmit={handleSubmitOnlineSale}
            className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-black text-slate-900 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-rose-600" />
                  <span>Ficha de Pedido Online y Guía</span>
                </h2>
                <p className="text-[11px] text-slate-500">
                  Salida de stock: <strong className="text-emerald-700">{selectedWarehouse.name}</strong>
                </p>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Vaciar ({cart.length})
                </button>
              )}
            </div>

            {/* 1. Cart Items List */}
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {cart.length === 0 ? (
                <div className="p-5 rounded-xl bg-slate-50 border border-dashed border-slate-200 text-center text-xs text-slate-400">
                  Toca los artículos a la izquierda para agregarlos al paquete del cliente.
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.code}
                    className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-extrabold text-slate-800 truncate">
                        {item.name} {item.size ? `(${item.size})` : ''}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] font-bold text-slate-500">Precio Live L.</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={item.price}
                          onChange={(e) => handleUpdateCartPrice(item.code, e.target.value)}
                          className="w-20 px-2 py-0.5 rounded bg-white border border-slate-300 text-xs font-bold text-slate-900 tabular-nums"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateCartQty(item.code, -1)}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-6 text-center text-xs font-black tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateCartQty(item.code, 1)}
                        className="w-7 h-7 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right shrink-0 min-w-[68px]">
                      <p className="text-xs font-black text-slate-900 tabular-nums">
                        L. {item.subtotal.toFixed(2)}
                      </p>
                      <p className="text-[10px] text-slate-400 tabular-nums">
                        Costo: L. {((Number(item.cost) || 0) * item.quantity).toFixed(0)}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 2. Customer & Destination Data */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Datos del Cliente y Destino de Envío</span>
                </span>

                {/* Frequent Customer Quick Picker */}
                {consolidatedCustomers.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCustomerDropdown((prev) => !prev)}
                      className="text-[11px] font-extrabold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Buscar cliente frecuente ({consolidatedCustomers.length})
                    </button>
                    {showCustomerDropdown && (
                      <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-slate-200 rounded-xl shadow-xl z-30 p-2 space-y-1.5">
                        <input
                          type="text"
                          value={customerPickerSearch}
                          onChange={(e) => setCustomerPickerSearch(e.target.value)}
                          placeholder="Filtrar por nombre, @usuario o tel..."
                          className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs outline-none"
                        />
                        <div className="max-h-44 overflow-y-auto divide-y divide-slate-100">
                          {consolidatedCustomers
                            .filter((c) => {
                              const q = normalizeSearch(customerPickerSearch);
                              if (!q) return true;
                              return normalizeSearch(
                                `${c.name} ${c.socialHandle || ''} ${c.phone} ${c.departmentCity}`
                              ).includes(q);
                            })
                            .slice(0, 12)
                            .map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => handleSelectSavedCustomer(c)}
                                className="w-full text-left px-2 py-1.5 hover:bg-emerald-50 rounded-lg text-xs cursor-pointer"
                              >
                                <div className="font-bold text-slate-800 truncate">
                                  {c.name}{' '}
                                  {c.socialHandle && (
                                    <span className="text-rose-600 font-mono">
                                      ({c.socialHandle})
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-500 truncate">
                                  {c.phone} · {c.departmentCity}
                                </div>
                              </button>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    Nombre del Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    placeholder="Ej. María Fernanda López"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    Usuario TikTok / Red (@handle)
                  </label>
                  <input
                    type="text"
                    value={socialHandle}
                    onChange={(e) => setSocialHandle(e.target.value)}
                    placeholder="Ej. @mariaf_hn"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={recipientPhone}
                    onChange={(e) => setRecipientPhone(e.target.value)}
                    placeholder="Ej. 9988-7766"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    Departamento / Ciudad Destino
                  </label>
                  <input
                    type="text"
                    list="honduras-locations-list"
                    value={departmentCity}
                    onChange={(e) => setDepartmentCity(e.target.value)}
                    placeholder="Ej. Cortés - San Pedro Sula"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-900"
                  />
                  <datalist id="honduras-locations-list">
                    {HONDURAS_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                  Dirección Exacta de Envío / Punto de Referencia
                </label>
                <input
                  type="text"
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  placeholder="Colonia, bloque, casa o agencia donde reclama..."
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-semibold text-slate-900"
                />
              </div>
            </div>

            {/* 3. Carrier, Guide Number & Guide Costs */}
            <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-200/80 space-y-2.5">
              <span className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                <Truck className="w-3.5 h-3.5 text-indigo-600" />
                <span>Control de Guía de Envío y Costos Logísticos</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    Empresa de Envío / Paquetería
                  </label>
                  <select
                    value={carrierName}
                    onChange={(e) => setCarrierName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 cursor-pointer"
                  >
                    {COMMON_CARRIERS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    N° de Guía (Opcional si se genera luego)
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="Ej. CE-9081234"
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-mono font-bold text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] font-extrabold text-emerald-800 mb-0.5">
                    Envío Cobrado al Cliente (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingChargedInput}
                    onChange={(e) => setShippingChargedInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-emerald-300 text-xs font-black text-emerald-900 tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-rose-800 mb-0.5">
                    Costo Real de Guía (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={shippingGuideCostInput}
                    onChange={(e) => setShippingGuideCostInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-rose-300 text-xs font-black text-rose-900 tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-extrabold text-slate-700 mb-0.5">
                    Costo Bolsa / Empaque (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={packagingCostInput}
                    onChange={(e) => setPackagingCostInput(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-black text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    Método de Pago
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as 'transfer' | 'cash' | 'card' | 'credit')
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 cursor-pointer"
                  >
                    <option value="transfer">Transferencia / Depósito</option>
                    <option value="cash">Contra Entrega (Efectivo COD)</option>
                    <option value="card">Tarjeta / Link de Pago</option>
                    <option value="credit">Apartado / Crédito con Abono</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-0.5">
                    Descuento al Pedido (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={orderDiscount}
                    onChange={(e) => setOrderDiscount(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-slate-300 text-xs font-bold text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              {paymentMethod === 'credit' && (
                <div>
                  <label className="block text-[11px] font-bold text-amber-800 mb-0.5">
                    Abono Inicial Recibido (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={creditInitialAbone}
                    onChange={(e) => setCreditInitialAbone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs font-black text-amber-900 tabular-nums"
                  />
                </div>
              )}
            </div>

            {/* 4. Live Order Profit Breakdown Box */}
            <div className="p-3.5 rounded-xl bg-slate-900 text-white space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>Subtotal Artículos ({cart.reduce((a, b) => a + b.quantity, 0)} unids):</span>
                <span className="font-bold tabular-nums">L. {cartItemsSubtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-300">
                <span>+ Envío Cobrado al Cliente:</span>
                <span className="font-bold text-emerald-300 tabular-nums">
                  + L. {parsedShippingCharged.toFixed(2)}
                </span>
              </div>
              {parsedDiscount > 0 && (
                <div className="flex items-center justify-between text-xs text-rose-300">
                  <span>- Descuento otorgado:</span>
                  <span className="font-bold tabular-nums">- L. {parsedDiscount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex items-center justify-between text-sm sm:text-base font-black text-white pt-1 border-t border-slate-700">
                <span>TOTAL A COBRAR AL CLIENTE:</span>
                <span className="text-emerald-400 tabular-nums">
                  L. {orderTotalToCharge.toFixed(2)}
                </span>
              </div>

              <div className="pt-2 mt-1 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-400">
                  Costo Prod. (L. {cartItemsTotalCost.toFixed(0)}) + Guía/Emp. (L.{' '}
                  {(parsedShippingGuideCost + parsedPackagingCost).toFixed(0)}):
                </span>
                <span
                  className={`font-black tabular-nums px-2 py-0.5 rounded ${
                    orderEstimatedNetProfit >= 0
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  Ganancia Neta: L. {orderEstimatedNetProfit.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmittingSale || cart.length === 0}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-fuchsia-600 hover:from-rose-500 hover:to-fuchsia-500 disabled:opacity-50 text-white font-black text-sm shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>
                {isSubmittingSale
                  ? 'Registrando Pedido Online...'
                  : `Confirmar Venta Online y Rebajar de ${selectedWarehouse.name}`}
              </span>
            </button>
          </form>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 2: PEDIDOS, ENVÍOS Y GUÍAS                                   */}
      {/* ==================================================================== */}
      {activeSubTab === 'orders-guides' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Control de Pedidos Online, Destinos y Guías de Envío
              </h2>
              <p className="text-xs text-slate-500">
                Actualiza números de guía, costos de paquetería, estados de entrega e imprime rótulos para tus paquetes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1 sm:flex-initial">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={orderSearchQuery}
                  onChange={(e) => setOrderSearchQuery(e.target.value)}
                  placeholder="Buscar cliente, @usuario, guía, ciudad..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800 outline-none focus:border-emerald-500"
                />
              </div>

              <select
                value={shippingStatusFilter}
                onChange={(e) =>
                  setShippingStatusFilter(e.target.value as OnlineShippingStatus | 'all')
                }
                className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-700 cursor-pointer"
              >
                <option value="all">Todos los Estados de Envío</option>
                {SHIPPING_STATUS_OPTIONS.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {filteredOnlineSales.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No hay pedidos online registrados en este filtro.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOnlineSales.map((sale) => {
                const meta = sale.onlineOrder!;
                const isCancelled = sale.status === 'cancelled';
                const chObj =
                  ONLINE_CHANNELS.find((c) => c.id === meta.channel) || ONLINE_CHANNELS[0];
                const stObj =
                  SHIPPING_STATUS_OPTIONS.find((s) => s.id === meta.shippingStatus) ||
                  SHIPPING_STATUS_OPTIONS[0];

                const itemsCost = (sale.items || []).reduce((acc, it) => {
                  const unitCost =
                    it.cost !== undefined && it.cost > 0
                      ? Number(it.cost)
                      : Number(
                          inventory.find(
                            (p) =>
                              p.code.toLowerCase() === it.code.toLowerCase() ||
                              p.id === it.productId
                          )?.cost || 0
                        );
                  return acc + unitCost * (Number(it.quantity) || 1);
                }, 0);

                const guideCost = Number(meta.shippingGuideCost) || 0;
                const packCost = Number(meta.packagingCost) || 0;
                const netProfit = (Number(sale.total) || 0) - itemsCost - guideCost - packCost;

                return (
                  <div
                    key={sale.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isCancelled
                        ? 'bg-rose-50/40 border-rose-200 opacity-65'
                        : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-xs sm:text-sm text-slate-900">
                          #{sale.saleNumber}
                        </span>
                        <span className="text-xs font-bold text-slate-500">· {sale.date}</span>
                        <span className="text-xs font-extrabold text-rose-600">
                          · {chObj.label}
                        </span>
                        {meta.liveSessionName && (
                          <span className="text-xs font-semibold text-slate-600">
                            · Live: {meta.liveSessionName}
                          </span>
                        )}
                        <span className="text-xs font-semibold text-teal-700">
                          · Bodega: {sale.warehouseName || 'Principal'}
                        </span>
                        {isCancelled && (
                          <span className="text-xs font-black text-rose-600 uppercase">
                            (ANULADO)
                          </span>
                        )}
                      </div>

                      {/* Quick Shipping Status Selector + Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2">
                        {!isCancelled && (
                          <select
                            value={meta.shippingStatus}
                            onChange={(e) =>
                              handleQuickStatusChange(sale, e.target.value as OnlineShippingStatus)
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-extrabold border cursor-pointer ${stObj.badgeClass}`}
                          >
                            {SHIPPING_STATUS_OPTIONS.map((st) => (
                              <option key={st.id} value={st.id}>
                                {st.label}
                              </option>
                            ))}
                          </select>
                        )}

                        <button
                          type="button"
                          onClick={() => handleOpenEditOrderModal(sale)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-indigo-600" />
                          <span>Editar Guía / Costo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handlePrintShippingLabel(sale)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Rótulo</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendWhatsAppTracking(sale)}
                          className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          <span>Enviar Guía WhatsApp</span>
                        </button>

                        {!isCancelled && (
                          <button
                            type="button"
                            onClick={() => {
                              if (
                                window.confirm(
                                  `¿Anular el pedido ${sale.saleNumber} y devolver los artículos a la bodega ${
                                    sale.warehouseName || 'Principal'
                                  }?`
                                )
                              ) {
                                onCancelSale(sale);
                              }
                            }}
                            className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-bold cursor-pointer"
                            title="Anular pedido y restaurar stock"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Customer, Destination, Carrier & Financial Summary Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 text-xs">
                      {/* 1. Customer & Address */}
                      <div className="space-y-1">
                        <p className="font-black text-slate-900 text-sm">
                          {meta.recipientName}{' '}
                          {meta.socialHandle && (
                            <span className="text-rose-600 font-mono text-xs">
                              ({meta.socialHandle})
                            </span>
                          )}
                        </p>
                        <p className="text-slate-600 flex items-center gap-1">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{meta.recipientPhone || 'Sin teléfono'}</span>
                        </p>
                        <p className="text-slate-700 font-semibold flex items-start gap-1">
                          <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>
                            <strong>{meta.departmentCity || 'Sin ciudad'}:</strong>{' '}
                            {meta.shippingAddress || 'Sin dirección'}
                          </span>
                        </p>
                      </div>

                      {/* 2. Carrier, Guide & Items */}
                      <div className="space-y-1">
                        <p className="font-bold text-slate-800">
                          🚚 Paquetería:{' '}
                          <span className="text-indigo-700">{meta.carrierName || 'Por definir'}</span>
                        </p>
                        <p className="font-mono font-bold text-slate-800">
                          🔢 Guía N°:{' '}
                          <span
                            className={
                              meta.trackingNumber ? 'text-emerald-700' : 'text-amber-600'
                            }
                          >
                            {meta.trackingNumber || 'Pendiente de asignar'}
                          </span>
                        </p>
                        <div className="text-slate-600 pt-0.5">
                          {(sale.items || []).map((it, idx) => (
                            <span key={idx} className="inline-block mr-2">
                              • {it.quantity}x {it.name}
                              {it.size ? ` (${it.size})` : ''}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* 3. Profit Breakdown of this Order */}
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-500">Cobrado al cliente:</span>
                          <span className="font-black text-slate-900 tabular-nums">
                            L. {Number(sale.total).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Costo Art. (L. {itemsCost.toFixed(0)}) + Guía (L.{' '}
                            {(guideCost + packCost).toFixed(0)}):
                          </span>
                          <span className="font-semibold text-rose-600 tabular-nums">
                            - L. {(itemsCost + guideCost + packCost).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between pt-1 mt-1 border-t border-slate-200 font-black">
                          <span className="text-slate-700">Ganancia Neta Pedido:</span>
                          <span
                            className={`tabular-nums ${
                              netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            L. {netProfit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 3: DIRECTORIO DE CLIENTES DE LIVES / REDES                   */}
      {/* ==================================================================== */}
      {activeSubTab === 'customers' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-slate-900">
                Directorio de Clientes de Lives y Redes Sociales
              </h2>
              <p className="text-xs text-slate-500">
                Guarda los datos de envío de tus clientes frecuentes de TikTok Live para facturarles en 1 clic.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNewCustomerModal(true)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
            >
              <Plus className="w-4 h-4" />
              <span>Registrar Cliente Online</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {consolidatedCustomers.map((cust) => {
              const chObj =
                ONLINE_CHANNELS.find((c) => c.id === cust.channel) || ONLINE_CHANNELS[0];
              return (
                <div
                  key={cust.id}
                  className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-black text-slate-900 truncate">{cust.name}</h3>
                      <span className="text-[11px] font-bold text-rose-600 shrink-0">
                        {chObj.shortLabel}
                      </span>
                    </div>
                    {cust.socialHandle && (
                      <p className="text-xs font-mono font-bold text-indigo-600">
                        {cust.socialHandle}
                      </p>
                    )}
                    <p className="text-xs text-slate-600">📞 {cust.phone || 'Sin teléfono'}</p>
                    <p className="text-xs text-slate-700 font-semibold">
                      📍 {cust.departmentCity || 'Ciudad no registrada'}
                    </p>
                    {cust.shippingAddress && (
                      <p className="text-[11px] text-slate-500 line-clamp-2">
                        🏠 {cust.shippingAddress}
                      </p>
                    )}
                  </div>

                  <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between gap-2">
                    <div className="text-[11px] text-slate-500">
                      <strong>{cust.ordersCount}</strong> pedidos ·{' '}
                      <strong className="text-emerald-700 tabular-nums">
                        L. {cust.totalSpent.toFixed(0)}
                      </strong>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectSavedCustomer(cust);
                        setActiveSubTab('pos-live');
                      }}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-extrabold flex items-center gap-1 cursor-pointer"
                    >
                      <span>Cargar en Venta</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}

            {consolidatedCustomers.length === 0 && (
              <div className="col-span-full py-10 text-center text-slate-400 text-xs">
                Aún no hay clientes online registrados. Al realizar tu primera venta online se guardarán aquí automáticamente.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* SUB-TAB 4: GASTOS Y GANANCIAS ONLINE (CONTROL FINANCIERO)            */}
      {/* ==================================================================== */}
      {activeSubTab === 'finance-pnl' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left: Register Online Expense Form */}
          <form
            onSubmit={handleSaveOnlineExpense}
            className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5"
          >
            <div>
              <h2 className="text-sm sm:text-base font-black text-slate-900">
                Registrar Gasto de Ventas Online / Live
              </h2>
              <p className="text-xs text-slate-500">
                Registra pagos de publicidad (TikTok Ads, Facebook Ads), compra de bolsas/cajas de envío, internet o comisiones para conocer tu ganancia neta exacta.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Categoría del Gasto
                </label>
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <option value="Publicidad">Publicidad (TikTok / Meta Ads)</option>
                  <option value="Transporte / Envíos">Transporte / Guías Prepagadas</option>
                  <option value="Bolsas / Empaque">Bolsas / Cajas / Cinta de Empaque</option>
                  <option value="Pago de Personal">Pago de Moderador / Empacador Live</option>
                  <option value="Energía / Servicios">Internet / Datos para Live</option>
                  <option value="Otros">Otros Gastos Online</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Red Social Asociada
                </label>
                <select
                  value={expChannel}
                  onChange={(e) => setExpChannel(e.target.value as OnlineSaleChannel)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  {ONLINE_CHANNELS.map((ch) => (
                    <option key={ch.id} value={ch.id}>
                      {ch.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Descripción del Gasto *
              </label>
              <input
                type="text"
                required
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                placeholder="Ej. Pauta TikTok Live Viernes / Paquete 100 bolsas de envío"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-900"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Monto (L.) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-black text-slate-900 tabular-nums"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  Método de Pago
                </label>
                <select
                  value={expPaymentMethod}
                  onChange={(e) =>
                    setExpPaymentMethod(e.target.value as 'transfer' | 'cash' | 'card')
                  }
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 cursor-pointer"
                >
                  <option value="transfer">Transferencia</option>
                  <option value="card">Tarjeta</option>
                  <option value="cash">Efectivo</option>
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingExpense}
              className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs cursor-pointer transition-colors"
            >
              {isSavingExpense ? 'Guardando Gasto...' : 'Registrar Gasto Online'}
            </button>
          </form>

          {/* Right: Channel P&L Breakdown + Expense History */}
          <div className="lg:col-span-7 space-y-4">
            {/* Breakdown by Social Channel */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-900">
                Rendimiento y Ganancia por Red Social / Canal
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] text-slate-500 uppercase">
                      <th className="py-2 pr-2">Canal / Red</th>
                      <th className="py-2 px-2 text-right">Pedidos</th>
                      <th className="py-2 px-2 text-right">Ventas</th>
                      <th className="py-2 px-2 text-right">Costo Art.</th>
                      <th className="py-2 px-2 text-right">Guías/Emp.</th>
                      <th className="py-2 pl-2 text-right">Ganancia Neta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ONLINE_CHANNELS.map((ch) => {
                      const chSales = filteredOnlineSales.filter(
                        (s) => s.status !== 'cancelled' && s.onlineOrder?.channel === ch.id
                      );
                      if (chSales.length === 0) return null;
                      let rev = 0;
                      let cogs = 0;
                      let guides = 0;
                      chSales.forEach((s) => {
                        rev += Number(s.total) || 0;
                        guides +=
                          (Number(s.onlineOrder?.shippingGuideCost) || 0) +
                          (Number(s.onlineOrder?.packagingCost) || 0);
                        (s.items || []).forEach((it) => {
                          cogs += (Number(it.cost) || 0) * (Number(it.quantity) || 1);
                        });
                      });
                      const chExps = filteredOnlineExpenses
                        .filter((e) => e.onlineChannel === ch.id)
                        .reduce((a, b) => a + (Number(b.amount) || 0), 0);
                      const profit = rev - cogs - guides - chExps;

                      return (
                        <tr key={ch.id} className="hover:bg-slate-50">
                          <td className="py-2.5 pr-2 font-bold text-slate-800">{ch.label}</td>
                          <td className="py-2.5 px-2 text-right font-bold tabular-nums">
                            {chSales.length}
                          </td>
                          <td className="py-2.5 px-2 text-right font-bold tabular-nums">
                            L. {rev.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-slate-600 tabular-nums">
                            L. {cogs.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right text-rose-600 tabular-nums">
                            L. {(guides + chExps).toFixed(2)}
                          </td>
                          <td
                            className={`py-2.5 pl-2 text-right font-black tabular-nums ${
                              profit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                            }`}
                          >
                            L. {profit.toFixed(2)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Online Expenses List */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3">
              <h3 className="text-sm font-black text-slate-900">
                Historial de Gastos Online / Live ({filteredOnlineExpenses.length})
              </h3>
              {filteredOnlineExpenses.length === 0 ? (
                <p className="text-xs text-slate-400 py-4 text-center">
                  No hay gastos operativos de redes/Live registrados en este período.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {filteredOnlineExpenses.map((exp) => (
                    <div
                      key={exp.id}
                      className="py-2.5 flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-800 truncate">{exp.description}</p>
                        <p className="text-[11px] text-slate-500">
                          {exp.date} · {exp.category}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-black text-rose-600 tabular-nums">
                          - L. {Number(exp.amount).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteOnlineExpense(exp.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT SHIPPING GUIDE, ADDRESS & COST                           */}
      {/* ==================================================================== */}
      {editingOrderSale && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4 my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Actualizar Guía y Envío #{editingOrderSale.saleNumber}
                </h3>
                <p className="text-xs text-slate-500">
                  Asigna el número de guía, paquetería, costo de la guía y estado del paquete.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrderSale(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedOrder} className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Destinatario</label>
                  <input
                    type="text"
                    required
                    value={editRecipientName}
                    onChange={(e) => setEditRecipientName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Usuario Red Social (@handle)
                  </label>
                  <input
                    type="text"
                    value={editSocialHandle}
                    onChange={(e) => setEditSocialHandle(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Teléfono</label>
                  <input
                    type="text"
                    value={editRecipientPhone}
                    onChange={(e) => setEditRecipientPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">
                    Departamento / Ciudad
                  </label>
                  <input
                    type="text"
                    value={editDepartmentCity}
                    onChange={(e) => setEditDepartmentCity(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-600 mb-1">Dirección de Entrega</label>
                <input
                  type="text"
                  value={editShippingAddress}
                  onChange={(e) => setEditShippingAddress(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Paquetería</label>
                  <input
                    type="text"
                    list="carriers-edit-list"
                    value={editCarrierName}
                    onChange={(e) => setEditCarrierName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                  <datalist id="carriers-edit-list">
                    {COMMON_CARRIERS.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block font-bold text-emerald-700 mb-1">Número de Guía</label>
                  <input
                    type="text"
                    value={editTrackingNumber}
                    onChange={(e) => setEditTrackingNumber(e.target.value)}
                    placeholder="Ej. CE-882190"
                    className="w-full px-3 py-2 rounded-lg border-2 border-emerald-400 font-mono font-black text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-600 mb-1">Estado del Envío</label>
                  <select
                    value={editShippingStatus}
                    onChange={(e) => setEditShippingStatus(e.target.value as OnlineShippingStatus)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900 cursor-pointer"
                  >
                    {SHIPPING_STATUS_OPTIONS.map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div>
                  <label className="block font-bold text-emerald-800 mb-1">
                    Envío Cobrado (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editShippingCharged}
                    onChange={(e) => setEditShippingCharged(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-emerald-300 font-black text-emerald-900 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold text-rose-800 mb-1">
                    Costo Real Guía (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editShippingGuideCost}
                    onChange={(e) => setEditShippingGuideCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-rose-300 font-black text-rose-900 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Costo Empaque (L.)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editPackagingCost}
                    onChange={(e) => setEditPackagingCost(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-black text-slate-900 tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingOrderSale(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingGuide}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingGuide ? 'Guardando...' : 'Guardar Cambios'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: NEW ONLINE CUSTOMER IN DIRECTORY                              */}
      {/* ==================================================================== */}
      {showNewCustomerModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-black text-slate-900">
                Nuevo Cliente de Live / Redes
              </h3>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomerDirectory} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-600 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="Ej. Andrea Castellanos"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Usuario (@handle)</label>
                  <input
                    type="text"
                    value={custHandle}
                    onChange={(e) => setCustHandle(e.target.value)}
                    placeholder="Ej. @andrea_hn"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-600 mb-1">Teléfono / WhatsApp</label>
                  <input
                    type="text"
                    value={custPhone}
                    onChange={(e) => setCustPhone(e.target.value)}
                    placeholder="9900-1122"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Departamento / Ciudad</label>
                <input
                  type="text"
                  list="honduras-locations-list"
                  value={custCity}
                  onChange={(e) => setCustCity(e.target.value)}
                  placeholder="Ej. Cortés - San Pedro Sula"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-600 mb-1">Dirección de Envío</label>
                <input
                  type="text"
                  value={custAddress}
                  onChange={(e) => setCustAddress(e.target.value)}
                  placeholder="Colonia, bloque, casa..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-extrabold cursor-pointer"
                >
                  Guardar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
