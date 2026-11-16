import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Product,
  SaleRecord,
  SaleItem,
  StoreSettings,
  UserSession,
  StoreWarehousesData,
  RestaurantStoreData,
  RestaurantTable,
  RestaurantTableOrder,
  RestaurantOrderItem,
  RestaurantTableStatus,
  RestaurantTableShape,
  RestaurantOrderType,
  KitchenCommandTicket,
  KitchenCommandItem,
  PrinterPaperFormat,
} from '../types';
import {
  getDefaultWarehousesForStore,
} from '../firebase/firestoreService';
import {
  printHtmlDocument,
  buildSaleDocumentHtml,
  buildKitchenCommandHtml,
  buildTablePreBillHtml,
  downloadSalePdf,
  shareHtmlDocumentAsPdfToPrinterApp,
  getPreferredPrinterFormat,
  formatCurrencyL,
} from '../utils/printPdfService';
import {
  UtensilsCrossed,
  ChefHat,
  Plus,
  Minus,
  Trash2,
  Edit2,
  Users,
  Clock,
  CheckCircle2,
  Flame,
  Receipt,
  Printer,
  ArrowLeftRight,
  Search,
  X,
  Check,
  MessageSquare,
  CreditCard,
  Banknote,
  Landmark,
  Volume2,
  VolumeX,
  ShoppingBag,
  Bike,
  Store,
  Download,
  Boxes,
  FileText,
  SlidersHorizontal,
  ArrowLeft,
  Bell,
} from 'lucide-react';

export interface RestaurantViewProps {
  inventory: Product[];
  sales: SaleRecord[];
  storeSettings: StoreSettings;
  warehousesData?: StoreWarehousesData;
  userSession: UserSession | null;
  restaurantData: RestaurantStoreData;
  onSaveRestaurantData: (updated: RestaurantStoreData) => Promise<RestaurantStoreData | void>;
  onRecordSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<SaleRecord | void>;
  onRecordActivity?: (action: string, details?: string) => void;
  onNavigateToPOS?: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

type RestaurantSubTab = 'floor' | 'order' | 'kitchen';

const QUICK_DISH_NOTES = [
  'Sin cebolla',
  'Sin picante',
  'Sin salsa',
  'Salsa aparte',
  'Extra queso',
  'Término medio',
  'Bien cocido',
  'Para llevar',
];

function playKitchenChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [880, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.14);
      gain.gain.setValueAtTime(0.12, now + idx * 0.14);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.35);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.14);
      osc.stop(now + idx * 0.14 + 0.36);
    });
  } catch {
    // Ignore audio context restriction errors
  }
}

function formatElapsedTime(fromMs: number, nowMs: number): string {
  const diffSec = Math.max(0, Math.floor((nowMs - fromMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return `${hrs}h ${String(remMins).padStart(2, '0')}m`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function getNextSaleNumber(sales: SaleRecord[]): string {
  const numericNumbers = sales
    .map((s) => {
      const match = String(s.saleNumber || '').match(/(\d+)$/);
      return match ? parseInt(match[1], 10) : 0;
    })
    .filter((n) => !isNaN(n) && n > 0);
  const maxNum = numericNumbers.length > 0 ? Math.max(...numericNumbers) : 0;
  return `V-${String(maxNum + 1).padStart(4, '0')}`;
}

function getOrderTotal(order?: RestaurantTableOrder | null): number {
  if (!order) return 0;
  const sub = (order.items || []).reduce(
    (acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 0),
    0
  );
  return Math.max(0, sub - (Number(order.discount) || 0));
}

export const RestaurantView: React.FC<RestaurantViewProps> = ({
  inventory,
  sales,
  storeSettings,
  warehousesData,
  userSession,
  restaurantData,
  onSaveRestaurantData,
  onRecordSale,
  onRecordActivity,
  onNavigateToPOS,
  showToast,
}) => {
  const [subTab, setSubTab] = useState<RestaurantSubTab>('floor');
  const [selectedZone, setSelectedZone] = useState<string>('Todas');
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [mobileOrderPane, setMobileOrderPane] = useState<'menu' | 'ticket'>('menu');

  // Tick every 15s for live kitchen and table elapsed timers
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Kitchen Display State
  const [kitchenFilter, setKitchenFilter] = useState<'active' | 'ready' | 'delivered'>('active');
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [autoPrintCommand, setAutoPrintCommand] = useState<boolean>(false);
  const prevPendingTicketCountRef = useRef<number>(
    (restaurantData.kitchenTickets || []).filter((k) => k.status === 'pending').length
  );

  useEffect(() => {
    const pendingCount = (restaurantData.kitchenTickets || []).filter(
      (k) => k.status === 'pending'
    ).length;
    if (soundEnabled && pendingCount > prevPendingTicketCountRef.current) {
      playKitchenChime();
    }
    prevPendingTicketCountRef.current = pendingCount;
  }, [restaurantData.kitchenTickets, soundEnabled]);

  // Menu Search & Category Filter
  const [menuSearch, setMenuSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Todos');

  // Active Warehouse for POS checkout
  const activeWarehouses = useMemo(() => {
    const list =
      warehousesData?.warehouses && warehousesData.warehouses.length > 0
        ? warehousesData.warehouses
        : getDefaultWarehousesForStore();
    return list.filter((w) => w.isActive !== false);
  }, [warehousesData]);

  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string>(() => {
    const main = activeWarehouses.find((w) => w.isMainSalesFloor) || activeWarehouses[0];
    return main?.id || 'principal';
  });

  // Table Add/Edit Modal
  const [showTableModal, setShowTableModal] = useState(false);
  const [editingTable, setEditingTable] = useState<RestaurantTable | null>(null);
  const [tableNumberInput, setTableNumberInput] = useState('');
  const [tableNameInput, setTableNameInput] = useState('');
  const [tableZoneInput, setTableZoneInput] = useState('Salón Principal');
  const [tableCapacityInput, setTableCapacityInput] = useState('4');
  const [tableShapeInput, setTableShapeInput] = useState<RestaurantTableShape>('square');

  // Zones Management Modal
  const [showZonesModal, setShowZonesModal] = useState(false);
  const [newZoneName, setNewZoneName] = useState('');

  // Quick Takeout / Delivery Modal
  const [showNewTakeoutModal, setShowNewTakeoutModal] = useState(false);
  const [takeoutType, setTakeoutType] = useState<'takeout' | 'delivery'>('takeout');
  const [takeoutCustomerName, setTakeoutCustomerName] = useState('');
  const [takeoutPhone, setTakeoutPhone] = useState('');
  const [takeoutAddress, setTakeoutAddress] = useState('');

  // Item Kitchen Note Editor Modal
  const [editingNoteItemId, setEditingNoteItemId] = useState<string | null>(null);
  const [itemNoteDraft, setItemNoteDraft] = useState('');

  // Custom / Manual Dish Modal
  const [showManualDishModal, setShowManualDishModal] = useState(false);
  const [manualDishName, setManualDishName] = useState('');
  const [manualDishPrice, setManualDishPrice] = useState('');
  const [manualDishNotes, setManualDishNotes] = useState('');

  // Transfer Table Modal
  const [showMoveTableModal, setShowMoveTableModal] = useState(false);

  // Checkout Modal State
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [payMethod, setPayMethod] = useState<'cash' | 'card' | 'transfer' | 'credit'>('cash');
  const [checkoutDiscount, setCheckoutDiscount] = useState('0');
  const [checkoutTip, setCheckoutTip] = useState('0');
  const [checkoutIncludeTax, setCheckoutIncludeTax] = useState(false);
  const [checkoutAmountPaid, setCheckoutAmountPaid] = useState('');
  const [checkoutCustomerName, setCheckoutCustomerName] = useState('');
  const [checkoutCustomerRtn, setCheckoutCustomerRtn] = useState('');
  const [checkoutCustomerPhone, setCheckoutCustomerPhone] = useState('');
  const [checkoutNotes, setCheckoutNotes] = useState('');
  const [isProcessingCheckout, setIsProcessingCheckout] = useState(false);

  // Completed Sale Receipt Modal
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);
  const [selectedPrintFormat, setSelectedPrintFormat] = useState<PrinterPaperFormat>(() =>
    getPreferredPrinterFormat(storeSettings)
  );

  const zones = useMemo(
    () =>
      restaurantData.zones && restaurantData.zones.length > 0
        ? restaurantData.zones
        : ['Salón Principal', 'Terraza', 'Barra', 'VIP'],
    [restaurantData.zones]
  );

  const tables = useMemo(() => restaurantData.tables || [], [restaurantData.tables]);
  const orders = useMemo(() => restaurantData.orders || [], [restaurantData.orders]);
  const kitchenTickets = useMemo(
    () => restaurantData.kitchenTickets || [],
    [restaurantData.kitchenTickets]
  );

  const openOrders = useMemo(
    () => orders.filter((o) => o.status === 'open' || o.status === 'bill_requested'),
    [orders]
  );

  const takeoutAndDeliveryOrders = useMemo(
    () => openOrders.filter((o) => o.orderType !== 'dine_in'),
    [openOrders]
  );

  const activeOrder = useMemo(
    () => orders.find((o) => o.id === activeOrderId && (o.status === 'open' || o.status === 'bill_requested')) || null,
    [orders, activeOrderId]
  );

  const activeOrderTable = useMemo(
    () => (activeOrder?.tableId ? tables.find((t) => t.id === activeOrder.tableId) || null : null),
    [activeOrder, tables]
  );

  // Dynamic Table Status & Totals helper
  const getTableLiveState = (table: RestaurantTable) => {
    const order = openOrders.find((o) => o.id === table.currentOrderId || o.tableId === table.id);
    if (!order) {
      return {
        status: 'available' as RestaurantTableStatus,
        order: null,
        total: 0,
        itemCount: 0,
        unsentCount: 0,
        readyTicketCount: 0,
      };
    }

    const orderTickets = kitchenTickets.filter((kt) => kt.orderId === order.id);
    const hasPendingOrPrep = orderTickets.some(
      (kt) => kt.status === 'pending' || kt.status === 'preparing'
    );
    const readyTicketCount = orderTickets.filter((kt) => kt.status === 'ready').length;
    const unsentCount = (order.items || []).reduce(
      (sum, it) => sum + Math.max(0, it.quantity - (it.sentToKitchenQty || 0)),
      0
    );
    const itemCount = (order.items || []).reduce((sum, it) => sum + it.quantity, 0);
    const total = getOrderTotal(order);

    let derivedStatus: RestaurantTableStatus = 'occupied';
    if (order.status === 'bill_requested') {
      derivedStatus = 'bill_requested';
    } else if (readyTicketCount > 0 && !hasPendingOrPrep) {
      derivedStatus = 'ready';
    } else if (hasPendingOrPrep) {
      derivedStatus = 'kitchen';
    } else if (readyTicketCount > 0) {
      derivedStatus = 'ready';
    }

    return {
      status: derivedStatus,
      order,
      total,
      itemCount,
      unsentCount,
      readyTicketCount,
    };
  };

  // Floor Summary Metrics
  const floorStats = useMemo(() => {
    let available = 0;
    let occupied = 0;
    let inKitchen = 0;
    let ready = 0;
    let openRevenue = 0;

    tables.forEach((t) => {
      const st = getTableLiveState(t);
      if (st.status === 'available') {
        available += 1;
      } else {
        occupied += 1;
        openRevenue += st.total;
        if (st.status === 'kitchen') inKitchen += 1;
        if (st.status === 'ready') ready += 1;
      }
    });

    takeoutAndDeliveryOrders.forEach((o) => {
      openRevenue += getOrderTotal(o);
    });

    return { available, occupied, inKitchen, ready, openRevenue };
  }, [tables, openOrders, kitchenTickets, takeoutAndDeliveryOrders]);

  const activeKitchenCount = useMemo(
    () =>
      kitchenTickets.filter((kt) => kt.status === 'pending' || kt.status === 'preparing').length,
    [kitchenTickets]
  );

  const readyKitchenCount = useMemo(
    () => kitchenTickets.filter((kt) => kt.status === 'ready').length,
    [kitchenTickets]
  );

  // Filtered Menu Categories & Products
  const categories = useMemo(() => {
    const cats = new Set<string>();
    inventory.forEach((p) => {
      if (p.category && p.category.trim()) cats.add(p.category.trim());
    });
    return ['Todos', ...Array.from(cats).sort((a, b) => a.localeCompare(b))];
  }, [inventory]);

  const filteredMenuProducts = useMemo(() => {
    const q = menuSearch.trim().toLowerCase();
    return inventory.filter((p) => {
      if (selectedCategory !== 'Todos' && (p.category || '').trim() !== selectedCategory) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    });
  }, [inventory, selectedCategory, menuSearch]);

  // Helper to persist updated restaurant data cleanly
  const commitRestaurantUpdate = async (next: RestaurantStoreData) => {
    await onSaveRestaurantData({
      ...next,
      companyId: restaurantData.companyId || storeSettings.companyId || 'gosen',
      updatedAt: Date.now(),
    });
  };

  // =========================================================================
  // FLOOR & TABLE ACTIONS
  // =========================================================================
  const handleTapTable = async (table: RestaurantTable) => {
    const live = getTableLiveState(table);
    if (live.order) {
      setActiveOrderId(live.order.id);
      setSubTab('order');
      setMobileOrderPane('menu');
      return;
    }

    const now = Date.now();
    const seq = Math.max(1, restaurantData.orderSequence || orders.length + 1);
    const newOrder: RestaurantTableOrder = {
      id: `rord_${now}_${Math.random().toString(36).slice(2, 6)}`,
      companyId: restaurantData.companyId,
      orderNumber: `ORD-${String(seq).padStart(4, '0')}`,
      tableId: table.id,
      tableName: table.name,
      zone: table.zone,
      orderType: 'dine_in',
      guests: Math.min(2, table.capacity || 2),
      waiterName: userSession?.userName || 'Mesero / Caja',
      items: [],
      discount: 0,
      tipAmount: 0,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    const nextTables = tables.map((t) =>
      t.id === table.id ? { ...t, status: 'occupied' as const, currentOrderId: newOrder.id } : t
    );

    setActiveOrderId(newOrder.id);
    setSubTab('order');
    setMobileOrderPane('menu');

    await commitRestaurantUpdate({
      ...restaurantData,
      tables: nextTables,
      orders: [newOrder, ...orders],
      orderSequence: seq + 1,
    });
  };

  const handleOpenAddTableModal = () => {
    setEditingTable(null);
    const nextNum = tables.length + 1;
    setTableNumberInput(String(nextNum));
    setTableNameInput(`Mesa ${nextNum}`);
    setTableZoneInput(selectedZone !== 'Todas' ? selectedZone : zones[0] || 'Salón Principal');
    setTableCapacityInput('4');
    setTableShapeInput('square');
    setShowTableModal(true);
  };

  const handleOpenEditTableModal = (table: RestaurantTable, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTable(table);
    setTableNumberInput(table.number);
    setTableNameInput(table.name);
    setTableZoneInput(table.zone);
    setTableCapacityInput(String(table.capacity));
    setTableShapeInput(table.shape);
    setShowTableModal(true);
  };

  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNum = tableNumberInput.trim() || String(tables.length + 1);
    const cleanName = tableNameInput.trim() || `Mesa ${cleanNum}`;
    const cleanZone = tableZoneInput.trim() || zones[0] || 'Salón Principal';
    const cap = Math.max(1, parseInt(tableCapacityInput, 10) || 4);

    const nextZones = zones.includes(cleanZone) ? zones : [...zones, cleanZone];
    let nextTables: RestaurantTable[];

    if (editingTable) {
      nextTables = tables.map((t) =>
        t.id === editingTable.id
          ? {
              ...t,
              number: cleanNum,
              name: cleanName,
              zone: cleanZone,
              capacity: cap,
              shape: tableShapeInput,
            }
          : t
      );
      showToast(`"${cleanName}" actualizada correctamente.`, 'success');
    } else {
      const newTable: RestaurantTable = {
        id: `mesa_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        number: cleanNum,
        name: cleanName,
        zone: cleanZone,
        capacity: cap,
        shape: tableShapeInput,
        status: 'available',
        isActive: true,
      };
      nextTables = [...tables, newTable];
      showToast(`"${cleanName}" agregada a ${cleanZone}.`, 'success');
    }

    setShowTableModal(false);
    await commitRestaurantUpdate({
      ...restaurantData,
      zones: nextZones,
      tables: nextTables,
    });
  };

  const handleDeleteTable = async (table: RestaurantTable) => {
    const live = getTableLiveState(table);
    if (live.order && live.order.items.length > 0) {
      showToast('No puedes eliminar una mesa con pedido activo. Cóbrala o cámbiala de mesa primero.', 'warning');
      return;
    }
    const nextTables = tables.filter((t) => t.id !== table.id);
    const nextOrders = live.order
      ? orders.filter((o) => o.id !== live.order!.id)
      : orders;
    if (activeOrderId && live.order && activeOrderId === live.order.id) {
      setActiveOrderId(null);
      setSubTab('floor');
    }
    setShowTableModal(false);
    await commitRestaurantUpdate({
      ...restaurantData,
      tables: nextTables,
      orders: nextOrders,
    });
    showToast(`Mesa "${table.name}" eliminada.`, 'info');
  };

  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = newZoneName.trim();
    if (!clean) return;
    if (zones.some((z) => z.toLowerCase() === clean.toLowerCase())) {
      showToast('Esa zona ya existe.', 'warning');
      return;
    }
    setNewZoneName('');
    await commitRestaurantUpdate({
      ...restaurantData,
      zones: [...zones, clean],
    });
    showToast(`Zona "${clean}" agregada.`, 'success');
  };

  const handleDeleteZone = async (zoneName: string) => {
    if (zones.length <= 1) {
      showToast('Debe existir al menos 1 zona de restaurante.', 'warning');
      return;
    }
    if (tables.some((t) => t.zone === zoneName)) {
      showToast('Mueve o edita las mesas de esta zona antes de eliminarla.', 'warning');
      return;
    }
    const nextZones = zones.filter((z) => z !== zoneName);
    if (selectedZone === zoneName) setSelectedZone('Todas');
    await commitRestaurantUpdate({
      ...restaurantData,
      zones: nextZones,
    });
    showToast(`Zona "${zoneName}" eliminada.`, 'info');
  };

  const handleCreateTakeoutOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const now = Date.now();
    const seq = Math.max(1, restaurantData.orderSequence || orders.length + 1);
    const custName = takeoutCustomerName.trim();
    const label =
      takeoutType === 'delivery'
        ? custName
          ? `Domicilio: ${custName}`
          : `Domicilio #${seq}`
        : custName
        ? `Para Llevar: ${custName}`
        : `Para Llevar #${seq}`;

    const newOrder: RestaurantTableOrder = {
      id: `rord_${now}_${Math.random().toString(36).slice(2, 6)}`,
      companyId: restaurantData.companyId,
      orderNumber: `ORD-${String(seq).padStart(4, '0')}`,
      tableName: label,
      zone: takeoutType === 'delivery' ? 'Domicilio' : 'Para Llevar',
      orderType: takeoutType,
      guests: 1,
      waiterName: userSession?.userName || 'Caja / Mesero',
      customerName: custName || undefined,
      customerPhone: takeoutPhone.trim() || undefined,
      deliveryAddress: takeoutAddress.trim() || undefined,
      items: [],
      discount: 0,
      tipAmount: 0,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    };

    setShowNewTakeoutModal(false);
    setTakeoutCustomerName('');
    setTakeoutPhone('');
    setTakeoutAddress('');
    setActiveOrderId(newOrder.id);
    setSubTab('order');
    setMobileOrderPane('menu');

    await commitRestaurantUpdate({
      ...restaurantData,
      orders: [newOrder, ...orders],
      orderSequence: seq + 1,
    });
  };

  // =========================================================================
  // ORDER ITEM & KITCHEN COMANDERA ACTIONS
  // =========================================================================
  const updateActiveOrder = async (
    updater: (order: RestaurantTableOrder) => RestaurantTableOrder,
    overrideTables?: RestaurantTable[],
    extraKitchenTickets?: KitchenCommandTicket[],
    nextTicketSeq?: number
  ) => {
    if (!activeOrder) return;
    const updatedOrder = updater({ ...activeOrder, updatedAt: Date.now() });
    const nextOrders = orders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
    await commitRestaurantUpdate({
      ...restaurantData,
      tables: overrideTables || tables,
      orders: nextOrders,
      kitchenTickets: extraKitchenTickets || kitchenTickets,
      ticketSequence: nextTicketSeq ?? restaurantData.ticketSequence,
    });
  };

  const handleAddProductToOrder = async (product: Product) => {
    if (!activeOrder) return;
    const now = Date.now();
    const existing = activeOrder.items.find(
      (it) => it.productId === (product.id || product.code) && !it.notes
    );
    let nextItems: RestaurantOrderItem[];
    if (existing) {
      nextItems = activeOrder.items.map((it) =>
        it.id === existing.id ? { ...it, quantity: it.quantity + 1 } : it
      );
    } else {
      const catLower = (product.category || '').toLowerCase();
      const station: 'cocina' | 'barra' | 'postres' =
        catLower.includes('bebid') || catLower.includes('caf') || catLower.includes('jug') || catLower.includes('bar')
          ? 'barra'
          : catLower.includes('postre') || catLower.includes('dulce')
          ? 'postres'
          : 'cocina';
      const newItem: RestaurantOrderItem = {
        id: `ritem_${now}_${Math.random().toString(36).slice(2, 6)}`,
        productId: product.id || product.code,
        code: product.code,
        name: product.name,
        category: product.category,
        price: Number(product.price) || 0,
        cost: Number(product.cost) || 0,
        quantity: 1,
        sentToKitchenQty: 0,
        prepStation: station,
        addedAt: now,
      };
      nextItems = [...activeOrder.items, newItem];
    }

    await updateActiveOrder((o) => ({
      ...o,
      items: nextItems,
      status: o.status === 'bill_requested' ? 'open' : o.status,
    }));
  };

  const handleAddManualDish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder) return;
    const cleanName = manualDishName.trim();
    const priceNum = Math.max(0, parseFloat(manualDishPrice) || 0);
    if (!cleanName) {
      showToast('Ingresa el nombre del platillo o extra.', 'warning');
      return;
    }
    const now = Date.now();
    const newItem: RestaurantOrderItem = {
      id: `ritem_${now}_${Math.random().toString(36).slice(2, 6)}`,
      productId: `MANUAL-${now}`,
      code: `EXT-${String(now).slice(-4)}`,
      name: cleanName,
      category: 'Extras / Cocina',
      price: priceNum,
      cost: 0,
      quantity: 1,
      sentToKitchenQty: 0,
      notes: manualDishNotes.trim() || undefined,
      prepStation: 'cocina',
      addedAt: now,
    };

    setManualDishName('');
    setManualDishPrice('');
    setManualDishNotes('');
    setShowManualDishModal(false);

    await updateActiveOrder((o) => ({
      ...o,
      items: [...o.items, newItem],
    }));
    showToast(`"${cleanName}" agregado a la orden.`, 'success');
  };

  const handleAdjustItemQty = async (itemId: string, delta: number) => {
    if (!activeOrder) return;
    const target = activeOrder.items.find((it) => it.id === itemId);
    if (!target) return;
    const nextQty = target.quantity + delta;

    let nextItems: RestaurantOrderItem[];
    if (nextQty <= 0) {
      nextItems = activeOrder.items.filter((it) => it.id !== itemId);
    } else {
      nextItems = activeOrder.items.map((it) =>
        it.id === itemId
          ? {
              ...it,
              quantity: nextQty,
              sentToKitchenQty: Math.min(it.sentToKitchenQty || 0, nextQty),
            }
          : it
      );
    }

    await updateActiveOrder((o) => ({
      ...o,
      items: nextItems,
    }));
  };

  const handleOpenItemNoteModal = (item: RestaurantOrderItem) => {
    setEditingNoteItemId(item.id);
    setItemNoteDraft(item.notes || '');
  };

  const handleSaveItemNote = async () => {
    if (!activeOrder || !editingNoteItemId) return;
    const cleanNote = itemNoteDraft.trim();
    const nextItems = activeOrder.items.map((it) =>
      it.id === editingNoteItemId ? { ...it, notes: cleanNote || undefined } : it
    );
    setEditingNoteItemId(null);
    setItemNoteDraft('');
    await updateActiveOrder((o) => ({
      ...o,
      items: nextItems,
    }));
  };

  const handleSendToKitchen = async () => {
    if (!activeOrder) return;
    const unsentItems: KitchenCommandItem[] = [];
    for (const it of activeOrder.items) {
      const pendingQty = Math.max(0, it.quantity - (it.sentToKitchenQty || 0));
      if (pendingQty > 0) {
        unsentItems.push({
          id: it.id,
          productId: it.productId,
          code: it.code,
          name: it.name,
          category: it.category,
          quantity: pendingQty,
          notes: it.notes,
          prepStation: it.prepStation || 'cocina',
        });
      }
    }

    if (unsentItems.length === 0) {
      showToast('Todos los platillos de esta mesa ya fueron enviados a cocina.', 'info');
      return;
    }

    const now = Date.now();
    const seq = Math.max(1, restaurantData.ticketSequence || kitchenTickets.length + 1);
    const newTicket: KitchenCommandTicket = {
      id: `kcmd_${now}_${Math.random().toString(36).slice(2, 6)}`,
      companyId: restaurantData.companyId,
      ticketNumber: `COM-${String(seq).padStart(4, '0')}`,
      orderId: activeOrder.id,
      orderNumber: activeOrder.orderNumber,
      tableId: activeOrder.tableId,
      tableName: activeOrder.tableName,
      zone: activeOrder.zone,
      orderType: activeOrder.orderType,
      waiterName: activeOrder.waiterName,
      guests: activeOrder.guests,
      items: unsentItems,
      orderNotes: activeOrder.notes,
      status: 'pending',
      createdAt: now,
    };

    const updatedTables = activeOrder.tableId
      ? tables.map((t) =>
          t.id === activeOrder.tableId ? { ...t, status: 'kitchen' as const } : t
        )
      : tables;

    await updateActiveOrder(
      (o) => ({
        ...o,
        items: o.items.map((it) => ({ ...it, sentToKitchenQty: it.quantity })),
      }),
      updatedTables,
      [newTicket, ...kitchenTickets],
      seq + 1
    );

    if (soundEnabled) playKitchenChime();
    onRecordActivity?.(
      `Envió Comanda ${newTicket.ticketNumber} (${activeOrder.tableName})`,
      `${unsentItems.reduce((s, i) => s + i.quantity, 0)} unidades enviadas a Comandera`
    );

    if (autoPrintCommand) {
      const html = buildKitchenCommandHtml(newTicket, storeSettings, selectedPrintFormat);
      printHtmlDocument(html, `Comanda_${newTicket.ticketNumber}`, selectedPrintFormat, storeSettings);
    }

    showToast(
      `🔥 Comanda ${newTicket.ticketNumber} enviada a cocina (${activeOrder.tableName})!`,
      'success'
    );
  };

  const handlePrintKitchenTicket = (ticket: KitchenCommandTicket) => {
    const html = buildKitchenCommandHtml(ticket, storeSettings, selectedPrintFormat);
    printHtmlDocument(html, `Comanda_${ticket.ticketNumber}`, selectedPrintFormat, storeSettings);
  };

  const handlePrintPreBill = async () => {
    if (!activeOrder || activeOrder.items.length === 0) {
      showToast('Agrega platillos antes de imprimir la pre-cuenta.', 'warning');
      return;
    }

    const updatedTables = activeOrder.tableId
      ? tables.map((t) =>
          t.id === activeOrder.tableId ? { ...t, status: 'bill_requested' as const } : t
        )
      : tables;

    await updateActiveOrder(
      (o) => ({ ...o, status: 'bill_requested' }),
      updatedTables
    );

    const html = buildTablePreBillHtml(activeOrder, storeSettings, selectedPrintFormat, 10);
    printHtmlDocument(
      html,
      `PreCuenta_${activeOrder.orderNumber}`,
      selectedPrintFormat,
      storeSettings
    );
    showToast(`Pre-cuenta generada para ${activeOrder.tableName}.`, 'info');
  };

  const handleMoveOrderToTable = async (targetTable: RestaurantTable) => {
    if (!activeOrder) return;
    const prevTableId = activeOrder.tableId;
    const nextTables = tables.map((t) => {
      if (prevTableId && t.id === prevTableId) {
        return { ...t, status: 'available' as const, currentOrderId: undefined };
      }
      if (t.id === targetTable.id) {
        return {
          ...t,
          status: activeOrderTable?.status || ('occupied' as const),
          currentOrderId: activeOrder.id,
        };
      }
      return t;
    });

    const nextTickets = kitchenTickets.map((kt) =>
      kt.orderId === activeOrder.id
        ? {
            ...kt,
            tableId: targetTable.id,
            tableName: targetTable.name,
            zone: targetTable.zone,
          }
        : kt
    );

    setShowMoveTableModal(false);
    await updateActiveOrder(
      (o) => ({
        ...o,
        tableId: targetTable.id,
        tableName: targetTable.name,
        zone: targetTable.zone,
        orderType: 'dine_in',
      }),
      nextTables,
      nextTickets
    );
    showToast(`Orden movida a ${targetTable.name} (${targetTable.zone}).`, 'success');
  };

  const handleCancelOrder = async () => {
    if (!activeOrder) return;
    const prevTableId = activeOrder.tableId;
    const nextTables = prevTableId
      ? tables.map((t) =>
          t.id === prevTableId
            ? { ...t, status: 'available' as const, currentOrderId: undefined }
            : t
        )
      : tables;

    const nextOrders = orders.map((o) =>
      o.id === activeOrder.id ? { ...o, status: 'cancelled' as const, updatedAt: Date.now() } : o
    );
    const nextTickets = kitchenTickets.map((kt) =>
      kt.orderId === activeOrder.id && kt.status !== 'delivered'
        ? { ...kt, status: 'cancelled' as const }
        : kt
    );

    setActiveOrderId(null);
    setSubTab('floor');

    await commitRestaurantUpdate({
      ...restaurantData,
      tables: nextTables,
      orders: nextOrders,
      kitchenTickets: nextTickets,
    });
    showToast(`Orden ${activeOrder.orderNumber} cancelada y mesa liberada.`, 'info');
  };

  // =========================================================================
  // KITCHEN KDS TICKET PROGRESSION
  // =========================================================================
  const handleUpdateKitchenTicketStatus = async (
    ticketId: string,
    nextStatus: 'preparing' | 'ready' | 'delivered'
  ) => {
    const now = Date.now();
    const targetTicket = kitchenTickets.find((kt) => kt.id === ticketId);
    if (!targetTicket) return;

    const nextTickets = kitchenTickets.map((kt) => {
      if (kt.id !== ticketId) return kt;
      return {
        ...kt,
        status: nextStatus,
        startedAt: nextStatus === 'preparing' ? kt.startedAt || now : kt.startedAt,
        readyAt: nextStatus === 'ready' ? now : kt.readyAt,
        deliveredAt: nextStatus === 'delivered' ? now : kt.deliveredAt,
      };
    });

    // Sync table visual status smoothly
    const nextTables = tables.map((t) => {
      if (targetTicket.tableId !== t.id) return t;
      const relatedTickets = nextTickets.filter((kt) => kt.orderId === targetTicket.orderId);
      const anyReady = relatedTickets.some((kt) => kt.status === 'ready');
      const anyPrepOrPending = relatedTickets.some(
        (kt) => kt.status === 'pending' || kt.status === 'preparing'
      );
      if (t.status === 'bill_requested') return t;
      if (anyReady && !anyPrepOrPending) return { ...t, status: 'ready' as const };
      if (anyPrepOrPending) return { ...t, status: 'kitchen' as const };
      return { ...t, status: 'occupied' as const };
    });

    await commitRestaurantUpdate({
      ...restaurantData,
      tables: nextTables,
      kitchenTickets: nextTickets,
    });

    if (nextStatus === 'ready') {
      if (soundEnabled) playKitchenChime();
      showToast(`✅ ¡Comanda ${targetTicket.ticketNumber} (${targetTicket.tableName}) LISTA para servir!`, 'success');
    } else if (nextStatus === 'delivered') {
      showToast(`🍽️ Comanda ${targetTicket.ticketNumber} marcada como entregada.`, 'info');
    }
  };

  // =========================================================================
  // CHECKOUT & POS BILLING INTEGRATION
  // =========================================================================
  const handleOpenCheckout = () => {
    if (!activeOrder || activeOrder.items.length === 0) {
      showToast('Agrega al menos 1 platillo a la orden antes de cobrar.', 'warning');
      return;
    }
    const baseSub = activeOrder.items.reduce((s, it) => s + it.price * it.quantity, 0);
    setPayMethod('cash');
    setCheckoutDiscount(String(activeOrder.discount || 0));
    setCheckoutTip(String(activeOrder.tipAmount || 0));
    setCheckoutIncludeTax(false);
    setCheckoutAmountPaid(String(Math.max(0, baseSub - (activeOrder.discount || 0))));
    setCheckoutCustomerName(activeOrder.customerName || '');
    setCheckoutCustomerPhone(activeOrder.customerPhone || '');
    setCheckoutCustomerRtn('');
    setCheckoutNotes(activeOrder.notes || '');
    setShowCheckoutModal(true);
  };

  const checkoutTotals = useMemo(() => {
    if (!activeOrder) {
      return { subtotal: 0, discount: 0, tip: 0, tax: 0, total: 0, change: 0, paidNum: 0 };
    }
    const subtotal = activeOrder.items.reduce(
      (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0),
      0
    );
    const discount = Math.max(0, parseFloat(checkoutDiscount) || 0);
    const tip = Math.max(0, parseFloat(checkoutTip) || 0);
    const afterDiscount = Math.max(0, subtotal - discount);
    const tax = checkoutIncludeTax ? Math.round(afterDiscount * 0.15 * 100) / 100 : 0;
    const total = Math.round((afterDiscount + tax + tip) * 100) / 100;
    const paidNum = Math.max(0, parseFloat(checkoutAmountPaid) || 0);
    const change = payMethod === 'cash' ? Math.max(0, Math.round((paidNum - total) * 100) / 100) : 0;
    return { subtotal, discount, tip, tax, total, change, paidNum };
  }, [activeOrder, checkoutDiscount, checkoutTip, checkoutIncludeTax, checkoutAmountPaid, payMethod]);

  const handleConfirmCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrder || isProcessingCheckout) return;
    if (payMethod === 'cash' && checkoutTotals.paidNum < checkoutTotals.total - 0.01) {
      showToast('El efectivo recibido es menor al total a cobrar.', 'warning');
      return;
    }

    setIsProcessingCheckout(true);
    try {
      const now = Date.now();
      const saleNum = getNextSaleNumber(sales);
      const selectedWh =
        activeWarehouses.find((w) => w.id === selectedWarehouseId) || activeWarehouses[0];

      const saleItems: SaleItem[] = activeOrder.items.map((it) => ({
        productId: it.productId,
        code: it.code,
        name: it.name,
        category: it.category,
        price: it.price,
        cost: it.cost,
        quantity: it.quantity,
        subtotal: Math.round(it.price * it.quantity * 100) / 100,
      }));

      // If tip > 0, include as a transparent line or note so totals reconcile 100%
      if (checkoutTotals.tip > 0) {
        saleItems.push({
          productId: `TIP-${now}`,
          code: 'PROPINA',
          name: 'Propina / Servicio',
          category: 'Servicio',
          price: checkoutTotals.tip,
          cost: 0,
          quantity: 1,
          subtotal: checkoutTotals.tip,
        });
      }

      const subtotalWithTip = checkoutTotals.subtotal + checkoutTotals.tip;
      const isCredit = payMethod === 'credit';
      const effectivePaid = isCredit
        ? Math.min(checkoutTotals.paidNum || 0, checkoutTotals.total)
        : payMethod === 'cash'
        ? checkoutTotals.paidNum
        : checkoutTotals.total;

      const restNoteParts = [
        `Restaurante: ${activeOrder.tableName}${activeOrder.zone ? ` (${activeOrder.zone})` : ''}`,
        `Orden: ${activeOrder.orderNumber}`,
        `Mesero: ${activeOrder.waiterName}`,
        checkoutNotes.trim() ? checkoutNotes.trim() : '',
      ].filter(Boolean);

      const salePayload: Omit<SaleRecord, 'id'> = {
        saleNumber: saleNum,
        timestamp: now,
        date: new Date(now).toLocaleString('es-HN'),
        items: saleItems,
        totalItems: activeOrder.items.reduce((s, it) => s + it.quantity, 0),
        subtotal: subtotalWithTip,
        discount: checkoutTotals.discount,
        tax: checkoutTotals.tax,
        total: checkoutTotals.total,
        paymentMethod: payMethod,
        amountPaid: effectivePaid,
        change: checkoutTotals.change,
        balanceDue: isCredit ? Math.max(0, checkoutTotals.total - effectivePaid) : 0,
        creditStatus: isCredit
          ? checkoutTotals.total - effectivePaid <= 0.01
            ? 'paid'
            : 'pending'
          : 'paid',
        customerName: checkoutCustomerName.trim() || `${activeOrder.tableName}`,
        customerPhone: checkoutCustomerPhone.trim() || undefined,
        customerRtn: checkoutCustomerRtn.trim() || undefined,
        notes: restNoteParts.join(' • '),
        status: 'completed',
        warehouseId: selectedWh?.id,
        warehouseName: selectedWh?.name,
        cashier: userSession?.userName || 'Caja Restaurante',
        cashierRole: userSession?.role || 'admin',
      };

      const savedSale = (await onRecordSale(salePayload)) || {
        id: `sale_${now}`,
        ...salePayload,
      };

      // Free the table & mark order paid & close pending kitchen tickets
      const nextTables = activeOrder.tableId
        ? tables.map((t) =>
            t.id === activeOrder.tableId
              ? { ...t, status: 'available' as const, currentOrderId: undefined }
              : t
          )
        : tables;

      const nextOrders = orders.map((o) =>
        o.id === activeOrder.id
          ? {
              ...o,
              status: 'paid' as const,
              discount: checkoutTotals.discount,
              tipAmount: checkoutTotals.tip,
              saleId: savedSale.id,
              saleNumber: savedSale.saleNumber,
              paidAt: now,
              updatedAt: now,
            }
          : o
      );

      const nextTickets = kitchenTickets.map((kt) =>
        kt.orderId === activeOrder.id && kt.status !== 'delivered' && kt.status !== 'cancelled'
          ? { ...kt, status: 'delivered' as const, deliveredAt: kt.deliveredAt || now }
          : kt
      );

      await commitRestaurantUpdate({
        ...restaurantData,
        tables: nextTables,
        orders: nextOrders,
        kitchenTickets: nextTickets,
      });

      setShowCheckoutModal(false);
      setCompletedSale(savedSale);
      setActiveOrderId(null);
      setSubTab('floor');

      showToast(
        `✅ Factura ${savedSale.saleNumber} cobrada y ${activeOrder.tableName} liberada.`,
        'success'
      );
    } catch (err: any) {
      console.error('Error en cobro de mesa:', err);
      showToast('Error al registrar cobro: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsProcessingCheckout(false);
    }
  };

  // Filtered Tables by Zone
  const visibleTables = useMemo(() => {
    if (selectedZone === 'Todas') return tables;
    return tables.filter((t) => t.zone === selectedZone);
  }, [tables, selectedZone]);

  // Filtered Kitchen Tickets
  const visibleKitchenTickets = useMemo(() => {
    if (kitchenFilter === 'active') {
      return kitchenTickets
        .filter((kt) => kt.status === 'pending' || kt.status === 'preparing')
        .sort((a, b) => a.createdAt - b.createdAt); // Oldest urgent first
    }
    if (kitchenFilter === 'ready') {
      return kitchenTickets
        .filter((kt) => kt.status === 'ready')
        .sort((a, b) => (b.readyAt || b.createdAt) - (a.readyAt || a.createdAt));
    }
    return kitchenTickets
      .filter((kt) => kt.status === 'delivered')
      .sort((a, b) => (b.deliveredAt || b.createdAt) - (a.deliveredAt || a.createdAt))
      .slice(0, 40);
  }, [kitchenTickets, kitchenFilter]);

  // Latest kitchen ticket for current active order (for 1-click reprint)
  const lastActiveOrderTicket = useMemo(() => {
    if (!activeOrder) return null;
    return (
      kitchenTickets.find((kt) => kt.orderId === activeOrder.id && kt.status !== 'cancelled') || null
    );
  }, [kitchenTickets, activeOrder]);

  const unsentUnitsInActiveOrder = useMemo(() => {
    if (!activeOrder) return 0;
    return activeOrder.items.reduce(
      (sum, it) => sum + Math.max(0, it.quantity - (it.sentToKitchenQty || 0)),
      0
    );
  }, [activeOrder]);

  return (
    <div className="flex-1 min-h-0 h-full w-full bg-slate-50 flex flex-col overflow-hidden">
      {/* Top Restaurant Command Header */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2.5 sm:py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <UtensilsCrossed className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight truncate">
                Restaurante, Mesas y Comandera
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 font-medium truncate">
                Control visual de salón, envío de comandas a cocina y facturación POS integrada
              </p>
            </div>
          </div>

          {onNavigateToPOS && (
            <button
              type="button"
              onClick={onNavigateToPOS}
              className="lg:hidden inline-flex items-center gap-1.5 min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer shrink-0"
            >
              <Receipt className="w-3.5 h-3.5 text-emerald-400" />
              <span>Caja POS</span>
            </button>
          )}
        </div>

        {/* Sub-Tabs Navigation */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
          <button
            type="button"
            onClick={() => setSubTab('floor')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              subTab === 'floor'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>Salón y Mesas</span>
            <span
              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                subTab === 'floor'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-slate-700 border border-slate-200'
              }`}
            >
              {floorStats.occupied}/{tables.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('order')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              subTab === 'order'
                ? 'bg-orange-600 text-white shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span className="truncate max-w-[140px]">
              {activeOrder ? activeOrder.tableName : 'Pedido / Toma Orden'}
            </span>
            {activeOrder && activeOrder.items.length > 0 && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                  subTab === 'order'
                    ? 'bg-white text-orange-700'
                    : 'bg-orange-100 text-orange-800'
                }`}
              >
                {activeOrder.items.reduce((s, it) => s + it.quantity, 0)}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubTab('kitchen')}
            className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all cursor-pointer shrink-0 ${
              subTab === 'kitchen'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
          >
            <ChefHat className="w-4 h-4" />
            <span>Comandera Cocina</span>
            {(activeKitchenCount > 0 || readyKitchenCount > 0) && (
              <span
                className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                  activeKitchenCount > 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {activeKitchenCount > 0 ? activeKitchenCount : `${readyKitchenCount} ✓`}
              </span>
            )}
          </button>

          {onNavigateToPOS && (
            <button
              type="button"
              onClick={onNavigateToPOS}
              className="hidden lg:inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-extrabold cursor-pointer shrink-0"
              title="Ir al módulo completo de Ventas, Arqueo de Caja y Reportes POS"
            >
              <CreditCard className="w-4 h-4 text-emerald-700" />
              <span>Ir a Caja / POS</span>
            </button>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* SUB-TAB 1: SALÓN Y MESAS (VISUAL FLOORPLAN)                           */}
      {/* ===================================================================== */}
      {subTab === 'floor' && (
        <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-3 sm:p-6 space-y-5 pb-24">
          {/* KPI Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Mesas Libres
              </div>
              <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5 tabular-nums">
                {floorStats.available}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Mesas Ocupadas
              </div>
              <div className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 tabular-nums">
                {floorStats.occupied}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                En Cocina
              </div>
              <div className="text-xl sm:text-2xl font-black text-orange-600 mt-0.5 tabular-nums">
                {floorStats.inKitchen}
              </div>
            </div>
            <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Listas p/ Servir
              </div>
              <div className="text-xl sm:text-2xl font-black text-teal-700 mt-0.5 tabular-nums">
                {floorStats.ready}
              </div>
            </div>
            <div className="col-span-2 sm:col-span-1 bg-slate-900 text-white p-3.5 rounded-2xl border border-slate-800 shadow-xs">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Consumo Abierto
              </div>
              <div className="text-xl sm:text-2xl font-black text-amber-400 mt-0.5 tabular-nums">
                {formatCurrencyL(floorStats.openRevenue)}
              </div>
            </div>
          </div>

          {/* Floor Toolbar: Zone Tabs + Add Table / Zones / Takeout */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {['Todas', ...zones].map((z) => {
                const count =
                  z === 'Todas'
                    ? tables.length
                    : tables.filter((t) => t.zone === z).length;
                const active = selectedZone === z;
                return (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setSelectedZone(z)}
                    className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-extrabold whitespace-nowrap cursor-pointer transition-all flex items-center gap-1.5 ${
                      active
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <span>{z}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] tabular-nums ${
                        active ? 'bg-orange-700 text-white' : 'bg-white text-slate-600'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowZonesModal(true)}
                className="min-h-[40px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-slate-200"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Zonas</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setTakeoutType('takeout');
                  setShowNewTakeoutModal(true);
                }}
                className="min-h-[40px] px-3.5 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Para Llevar / Domicilio</span>
              </button>

              <button
                type="button"
                onClick={handleOpenAddTableModal}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-95 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>Agregar Mesa</span>
              </button>
            </div>
          </div>

          {/* Visual Tables Grid */}
          {visibleTables.length === 0 ? (
            <div className="bg-white p-10 rounded-3xl border border-slate-200 text-center space-y-3">
              <UtensilsCrossed className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="text-base font-black text-slate-800">
                No hay mesas en "{selectedZone}"
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Presiona "Agregar Mesa" para diseñar tu salón y empezar a tomar órdenes.
              </p>
              <button
                type="button"
                onClick={handleOpenAddTableModal}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Primera Mesa</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
              {visibleTables.map((table) => {
                const live = getTableLiveState(table);
                const statusStyles: Record<
                  RestaurantTableStatus,
                  {
                    card: string;
                    badge: string;
                    label: string;
                    emblem: string;
                  }
                > = {
                  available: {
                    card: 'bg-white border-slate-200 hover:border-emerald-400 hover:shadow-md',
                    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                    label: 'Disponible',
                    emblem: 'bg-slate-100 text-slate-700 border-slate-300',
                  },
                  occupied: {
                    card: 'bg-amber-50/40 border-amber-400 shadow-sm hover:shadow-md',
                    badge: 'bg-amber-100 text-amber-900 border-amber-300',
                    label: 'Ocupada',
                    emblem: 'bg-amber-500 text-slate-950 border-amber-600',
                  },
                  kitchen: {
                    card: 'bg-orange-50/60 border-orange-500 shadow-sm hover:shadow-md',
                    badge: 'bg-orange-100 text-orange-900 border-orange-300',
                    label: 'En Cocina',
                    emblem: 'bg-orange-600 text-white border-orange-700',
                  },
                  ready: {
                    card: 'bg-emerald-50/80 border-emerald-500 shadow-sm hover:shadow-md ring-2 ring-emerald-200',
                    badge: 'bg-emerald-600 text-white border-emerald-700',
                    label: 'Listo p/ Servir',
                    emblem: 'bg-emerald-600 text-white border-emerald-700',
                  },
                  bill_requested: {
                    card: 'bg-indigo-50/70 border-indigo-500 shadow-sm hover:shadow-md',
                    badge: 'bg-indigo-600 text-white border-indigo-700',
                    label: 'Cuenta Pedida',
                    emblem: 'bg-indigo-600 text-white border-indigo-700',
                  },
                };

                const st = statusStyles[live.status];
                const shapeClass =
                  table.shape === 'round'
                    ? 'rounded-full w-12 h-12'
                    : table.shape === 'rect'
                    ? 'rounded-xl w-16 h-11'
                    : 'rounded-xl w-12 h-12';

                return (
                  <div
                    key={table.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleTapTable(table)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleTapTable(table);
                      }
                    }}
                    className={`relative p-3.5 sm:p-4 rounded-2xl border-2 transition-all cursor-pointer select-none flex flex-col justify-between min-h-[168px] text-left active:scale-[0.98] ${st.card}`}
                  >
                    {/* Top Row: Shape Table Emblem + Edit Button */}
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className={`${shapeClass} border-2 flex items-center justify-center font-black text-sm tracking-tight shrink-0 ${st.emblem}`}
                      >
                        {table.number}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => handleOpenEditTableModal(table, e)}
                        className="p-2 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-white/90 transition-colors cursor-pointer"
                        title="Editar o eliminar mesa"
                        aria-label={`Editar ${table.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Middle: Table Name, Zone, Capacity */}
                    <div className="mt-2.5 space-y-1">
                      <div className="font-black text-slate-900 text-sm sm:text-base truncate">
                        {table.name}
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[11px] text-slate-500 font-semibold">
                        <span className="truncate">{table.zone}</span>
                        <span className="inline-flex items-center gap-0.5 shrink-0 tabular-nums">
                          <Users className="w-3 h-3" />
                          {live.order ? live.order.guests : table.capacity}
                        </span>
                      </div>
                    </div>

                    {/* Bottom: Status Badge & Active Total / Elapsed */}
                    <div className="mt-3 pt-2.5 border-t border-slate-200/70 space-y-1.5">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide border ${st.badge}`}
                        >
                          {st.label}
                        </span>
                        {live.order && (
                          <span className="text-[11px] font-bold text-slate-600 inline-flex items-center gap-1 tabular-nums">
                            <Clock className="w-3 h-3" />
                            {formatElapsedTime(live.order.createdAt, nowTick)}
                          </span>
                        )}
                      </div>

                      {live.order ? (
                        <div className="flex items-center justify-between gap-1 pt-0.5">
                          <span className="text-xs sm:text-sm font-black text-slate-900 tabular-nums">
                            {formatCurrencyL(live.total)}
                          </span>
                          {live.unsentCount > 0 ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-extrabold tabular-nums">
                              +{live.unsentCount} s/enviar
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-500 tabular-nums">
                              {live.itemCount} uds
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="text-[11px] font-semibold text-slate-400">
                          Tocar para pedir orden
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Takeout & Delivery Orders Section */}
          {takeoutAndDeliveryOrders.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-700 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-indigo-600" />
                  <span>Pedidos Para Llevar / Domicilio Activos ({takeoutAndDeliveryOrders.length})</span>
                </h2>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {takeoutAndDeliveryOrders.map((ord) => {
                  const ordTotal = getOrderTotal(ord);
                  const ordItems = ord.items.reduce((s, it) => s + it.quantity, 0);
                  return (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => {
                        setActiveOrderId(ord.id);
                        setSubTab('order');
                        setMobileOrderPane('menu');
                      }}
                      className="p-4 rounded-2xl bg-white border-2 border-indigo-200 hover:border-indigo-500 shadow-2xs hover:shadow-md transition-all text-left cursor-pointer flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 text-[10px] font-extrabold uppercase">
                            {ord.orderType === 'delivery' ? 'Domicilio' : 'Para Llevar'}
                          </span>
                          <span className="text-xs font-mono font-bold text-slate-500">
                            {ord.orderNumber}
                          </span>
                        </div>
                        <div className="font-black text-slate-900 text-sm truncate">
                          {ord.tableName}
                        </div>
                        {ord.customerPhone && (
                          <div className="text-xs text-slate-500 truncate">Tel: {ord.customerPhone}</div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black text-slate-900 text-base tabular-nums">
                          {formatCurrencyL(ordTotal)}
                        </div>
                        <div className="text-[11px] font-bold text-slate-500 tabular-nums">
                          {ordItems} uds • {formatElapsedTime(ord.createdAt, nowTick)}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 2: PEDIDO DE MESA (MENU + ORDEN + COMANDA + COBRO POS)        */}
      {/* ===================================================================== */}
      {subTab === 'order' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {!activeOrder ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-orange-100 text-orange-600 flex items-center justify-center">
                <UtensilsCrossed className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-black text-slate-900">Selecciona o Toca una Mesa</h2>
                <p className="text-xs sm:text-sm text-slate-500 max-w-md">
                  Para tomar una orden, regresa al mapa del Salón y toca cualquier mesa libre u ocupada, o crea un pedido Para Llevar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSubTab('floor')}
                className="min-h-[42px] px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Ver Mapa de Mesas</span>
              </button>
            </div>
          ) : (
            <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
              {/* Mobile Pane Switcher (< lg) */}
              <div className="lg:hidden bg-white border-b border-slate-200 px-3 py-2 flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSubTab('floor')}
                  className="min-h-[38px] px-2.5 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 cursor-pointer shrink-0"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Mesas</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileOrderPane('menu')}
                  className={`flex-1 min-h-[38px] rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                    mobileOrderPane === 'menu'
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Menú ({filteredMenuProducts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setMobileOrderPane('ticket')}
                  className={`flex-1 min-h-[38px] rounded-xl text-xs font-extrabold cursor-pointer transition-all tabular-nums ${
                    mobileOrderPane === 'ticket'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Orden ({activeOrder.items.reduce((s, it) => s + it.quantity, 0)}) •{' '}
                  {formatCurrencyL(getOrderTotal(activeOrder))}
                </button>
              </div>

              {/* LEFT PANE: MENU / PRODUCTOS */}
              <div
                className={`flex-1 min-h-0 flex flex-col overflow-hidden bg-slate-50 ${
                  mobileOrderPane === 'menu' ? 'flex' : 'hidden lg:flex'
                }`}
              >
                {/* Search + Categories + Manual Dish */}
                <div className="p-3 sm:p-4 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={menuSearch}
                        onChange={(e) => setMenuSearch(e.target.value)}
                        placeholder="Buscar platillo, bebida o código..."
                        className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      {menuSearch && (
                        <button
                          type="button"
                          onClick={() => setMenuSearch('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowManualDishModal(true)}
                      className="min-h-[42px] px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-xs font-extrabold flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">Platillo / Extra Manual</span>
                      <span className="sm:hidden">Extra</span>
                    </button>
                  </div>

                  {/* Category Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={`min-h-[34px] px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                          selectedCategory === cat
                            ? 'bg-slate-900 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Menu Cards Grid */}
                <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-3 sm:p-4 pb-24 lg:pb-6">
                  {filteredMenuProducts.length === 0 ? (
                    <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2">
                      <p className="text-sm font-bold text-slate-700">
                        No se encontraron platillos o productos con "{menuSearch}"
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setManualDishName(menuSearch);
                          setShowManualDishModal(true);
                        }}
                        className="min-h-[38px] px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>Agregar "{menuSearch || 'Extra'}" a la orden</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                      {filteredMenuProducts.map((prod) => {
                        const qtyInOrder = activeOrder.items
                          .filter((it) => it.productId === (prod.id || prod.code))
                          .reduce((s, it) => s + it.quantity, 0);
                        return (
                          <button
                            key={prod.id || prod.code}
                            type="button"
                            onClick={() => handleAddProductToOrder(prod)}
                            className={`p-3 rounded-2xl bg-white border text-left transition-all cursor-pointer flex flex-col justify-between gap-2 active:scale-[0.97] hover:shadow-md ${
                              qtyInOrder > 0
                                ? 'border-orange-500 ring-1 ring-orange-200'
                                : 'border-slate-200 hover:border-orange-300'
                            }`}
                          >
                            <div className="space-y-1.5">
                              <div className="flex items-start justify-between gap-2">
                                {prod.img ? (
                                  <img
                                    src={prod.img}
                                    alt={prod.name}
                                    className="w-11 h-11 rounded-xl object-cover border border-slate-100 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center font-black text-xs shrink-0">
                                    {prod.name.slice(0, 2).toUpperCase()}
                                  </div>
                                )}
                                {qtyInOrder > 0 && (
                                  <span className="px-2 py-0.5 rounded-lg bg-orange-600 text-white text-[11px] font-black tabular-nums">
                                    {qtyInOrder}
                                  </span>
                                )}
                              </div>
                              <div className="font-extrabold text-slate-900 text-xs sm:text-sm leading-snug line-clamp-2">
                                {prod.name}
                              </div>
                              <div className="text-[10px] font-semibold text-slate-400 truncate">
                                {prod.category || 'Menú'}
                              </div>
                            </div>

                            <div className="flex items-center justify-between pt-1.5 border-t border-slate-100">
                              <span className="font-black text-emerald-700 text-xs sm:text-sm tabular-nums">
                                {formatCurrencyL(prod.price)}
                              </span>
                              <span className="w-7 h-7 rounded-lg bg-orange-50 text-orange-700 flex items-center justify-center font-black">
                                <Plus className="w-4 h-4" />
                              </span>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* RIGHT PANE: ACTIVE TABLE ORDER TICKET & CHECKOUT */}
              <div
                className={`w-full lg:w-[430px] xl:w-[460px] bg-white border-l border-slate-200 flex flex-col min-h-0 overflow-hidden shrink-0 ${
                  mobileOrderPane === 'ticket' ? 'flex flex-1' : 'hidden lg:flex'
                }`}
              >
                {/* Ticket Header */}
                <div className="p-3.5 sm:p-4 bg-slate-900 text-white space-y-2.5 shrink-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-black text-base truncate">
                          {activeOrder.tableName}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-mono font-bold">
                          {activeOrder.orderNumber}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                        <span>{activeOrder.zone || 'Salón'}</span>
                        <span>•</span>
                        <span>Atiende: {activeOrder.waiterName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setShowMoveTableModal(true)}
                        className="min-h-[34px] px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        title="Cambiar esta orden a otra mesa libre"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                        <span>Cambiar</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleCancelOrder}
                        className="min-h-[34px] p-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 cursor-pointer"
                        title="Cancelar orden y liberar mesa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Guests & Quick Customer/Note Strip */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Users className="w-3.5 h-3.5 text-slate-400" />
                      <span className="text-slate-300 font-semibold">Personas:</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveOrder((o) => ({
                            ...o,
                            guests: Math.max(1, (o.guests || 1) - 1),
                          }))
                        }
                        className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="font-black w-5 text-center tabular-nums">
                        {activeOrder.guests || 1}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateActiveOrder((o) => ({
                            ...o,
                            guests: (o.guests || 1) + 1,
                          }))
                        }
                        className="w-6 h-6 rounded bg-slate-800 hover:bg-slate-700 flex items-center justify-center cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <input
                      type="text"
                      value={activeOrder.customerName || ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        updateActiveOrder((o) => ({ ...o, customerName: val }));
                      }}
                      placeholder="Nombre cliente (opc.)"
                      className="w-40 px-2.5 py-1 rounded-lg bg-slate-800 border border-slate-700 text-[11px] font-semibold text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-400"
                    />
                  </div>
                </div>

                {/* Order Line Items */}
                <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-3 space-y-2.5 bg-slate-50/70">
                  {activeOrder.items.length === 0 ? (
                    <div className="p-8 text-center space-y-2">
                      <UtensilsCrossed className="w-10 h-10 text-slate-300 mx-auto" />
                      <div className="text-xs font-bold text-slate-600">
                        Orden vacía. Toca los platillos del menú para agregarlos.
                      </div>
                    </div>
                  ) : (
                    activeOrder.items.map((item) => {
                      const unsent = Math.max(0, item.quantity - (item.sentToKitchenQty || 0));
                      return (
                        <div
                          key={item.id}
                          className="p-3 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="font-extrabold text-slate-900 text-xs sm:text-sm leading-tight">
                                {item.name}
                              </div>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-500 tabular-nums">
                                  {formatCurrencyL(item.price)} c/u
                                </span>
                                {unsent > 0 ? (
                                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-extrabold tabular-nums">
                                    {unsent} sin enviar
                                  </span>
                                ) : (
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold">
                                    ✓ En cocina ({item.sentToKitchenQty})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-right shrink-0">
                              <div className="font-black text-slate-900 text-xs sm:text-sm tabular-nums">
                                {formatCurrencyL(item.price * item.quantity)}
                              </div>
                            </div>
                          </div>

                          {item.notes && (
                            <div className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] font-bold text-amber-900 flex items-center justify-between gap-2">
                              <span>Nota: {item.notes}</span>
                              <button
                                type="button"
                                onClick={() => handleOpenItemNoteModal(item)}
                                className="text-amber-700 hover:underline text-[10px] font-extrabold cursor-pointer shrink-0"
                              >
                                Editar
                              </button>
                            </div>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100">
                            <button
                              type="button"
                              onClick={() => handleOpenItemNoteModal(item)}
                              className="min-h-[34px] px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-orange-600" />
                              <span>{item.notes ? 'Cambiar Nota' : 'Nota Cocina'}</span>
                            </button>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAdjustItemQty(item.id, -1)}
                                className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-rose-100 hover:text-rose-700 text-slate-700 flex items-center justify-center cursor-pointer font-black"
                              >
                                {item.quantity === 1 ? (
                                  <Trash2 className="w-3.5 h-3.5" />
                                ) : (
                                  <Minus className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <span className="w-7 text-center font-black text-sm text-slate-900 tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAdjustItemQty(item.id, 1)}
                                className="w-8 h-8 rounded-xl bg-orange-100 hover:bg-orange-200 text-orange-900 flex items-center justify-center cursor-pointer font-black"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Order Footer Totals & Comandera / Checkout Buttons */}
                <div className="p-3.5 sm:p-4 bg-white border-t border-slate-200 space-y-3 shrink-0 pb-20 md:pb-4">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                      <input
                        type="checkbox"
                        checked={autoPrintCommand}
                        onChange={(e) => setAutoPrintCommand(e.target.checked)}
                        className="rounded text-orange-600 focus:ring-orange-500 cursor-pointer"
                      />
                      <span>Auto-imprimir comanda al enviar</span>
                    </label>
                    <div className="text-right">
                      <span className="text-slate-500 mr-1.5">Total Mesa:</span>
                      <span className="text-lg font-black text-slate-900 tabular-nums">
                        {formatCurrencyL(getOrderTotal(activeOrder))}
                      </span>
                    </div>
                  </div>

                  {/* Primary Action Grid */}
                  <div className="grid grid-cols-2 gap-2">
                    {unsentUnitsInActiveOrder > 0 ? (
                      <button
                        type="button"
                        onClick={handleSendToKitchen}
                        className="col-span-2 min-h-[44px] py-2.5 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition-all"
                      >
                        <Flame className="w-4 h-4" />
                        <span>
                          Enviar Comanda a Cocina ({unsentUnitsInActiveOrder} nuevo
                          {unsentUnitsInActiveOrder === 1 ? '' : 's'})
                        </span>
                      </button>
                    ) : lastActiveOrderTicket ? (
                      <button
                        type="button"
                        onClick={() => handlePrintKitchenTicket(lastActiveOrderTicket)}
                        className="col-span-2 min-h-[42px] py-2 px-4 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-xs flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Reimprimir Última Comanda ({lastActiveOrderTicket.ticketNumber})</span>
                      </button>
                    ) : null}

                    <button
                      type="button"
                      onClick={handlePrintPreBill}
                      disabled={activeOrder.items.length === 0}
                      className="min-h-[44px] py-2.5 px-3 rounded-xl bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 text-indigo-900 border border-indigo-200 font-extrabold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <FileText className="w-4 h-4" />
                      <span>Pre-Cuenta</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenCheckout}
                      disabled={activeOrder.items.length === 0}
                      className="min-h-[44px] py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-extrabold text-xs sm:text-sm shadow-sm flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition-all"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Cobrar / POS</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* SUB-TAB 3: COMANDERA COCINA (KITCHEN DISPLAY SYSTEM)                  */}
      {/* ===================================================================== */}
      {subTab === 'kitchen' && (
        <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-3 sm:p-6 space-y-4 pb-24">
          {/* Kitchen Toolbar */}
          <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                type="button"
                onClick={() => setKitchenFilter('active')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  kitchenFilter === 'active'
                    ? 'bg-orange-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Flame className="w-4 h-4" />
                <span>Pendientes y Preparando ({activeKitchenCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setKitchenFilter('ready')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  kitchenFilter === 'ready'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <Bell className="w-4 h-4" />
                <span>Listas p/ Servir ({readyKitchenCount})</span>
              </button>

              <button
                type="button"
                onClick={() => setKitchenFilter('delivered')}
                className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                  kitchenFilter === 'delivered'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Historial Entregadas</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setSoundEnabled(!soundEnabled)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-extrabold border flex items-center gap-1.5 cursor-pointer shrink-0 ${
                soundEnabled
                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              <span>{soundEnabled ? 'Timbre Cocina: ON' : 'Timbre Cocina: OFF'}</span>
            </button>
          </div>

          {/* Kitchen Tickets Grid */}
          {visibleKitchenTickets.length === 0 ? (
            <div className="bg-white p-12 rounded-3xl border border-slate-200 text-center space-y-3">
              <ChefHat className="w-12 h-12 text-slate-300 mx-auto" />
              <div className="text-base font-black text-slate-800">
                {kitchenFilter === 'active'
                  ? 'Sin comandas pendientes en cocina'
                  : kitchenFilter === 'ready'
                  ? 'No hay platos esperando ser servidos'
                  : 'Aún no hay comandas entregadas'}
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Cuando un mesero o cajero presione "Enviar Comanda a Cocina" en una mesa, aparecerá aquí al instante lista para preparar o imprimir.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleKitchenTickets.map((ticket) => {
                const elapsedMins = Math.floor((nowTick - ticket.createdAt) / 60000);
                const isUrgent = ticket.status !== 'delivered' && elapsedMins >= 15;
                const isWarn = ticket.status !== 'delivered' && elapsedMins >= 8 && elapsedMins < 15;

                return (
                  <div
                    key={ticket.id}
                    className={`rounded-2xl bg-white border-2 shadow-sm flex flex-col justify-between overflow-hidden ${
                      ticket.status === 'ready'
                        ? 'border-emerald-500'
                        : isUrgent
                        ? 'border-rose-500'
                        : isWarn
                        ? 'border-amber-500'
                        : ticket.status === 'preparing'
                        ? 'border-orange-500'
                        : 'border-slate-300'
                    }`}
                  >
                    {/* Ticket Header */}
                    <div>
                      <div
                        className={`px-4 py-3 flex items-center justify-between gap-2 text-white ${
                          ticket.status === 'ready'
                            ? 'bg-emerald-600'
                            : isUrgent
                            ? 'bg-rose-600'
                            : ticket.status === 'preparing'
                            ? 'bg-orange-600'
                            : ticket.status === 'delivered'
                            ? 'bg-slate-700'
                            : 'bg-slate-900'
                        }`}
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm sm:text-base truncate">
                              {ticket.tableName}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-black/25 font-mono text-[11px] font-bold">
                              {ticket.ticketNumber}
                            </span>
                          </div>
                          <div className="text-[11px] opacity-90 truncate">
                            {ticket.zone || 'Salón'} • Mesero: {ticket.waiterName}
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="font-mono font-black text-sm tabular-nums flex items-center gap-1 justify-end">
                            <Clock className="w-3.5 h-3.5" />
                            {formatElapsedTime(ticket.createdAt, ticket.deliveredAt || nowTick)}
                          </div>
                          <div className="text-[10px] uppercase font-bold opacity-90">
                            {ticket.status === 'pending'
                              ? 'Pendiente'
                              : ticket.status === 'preparing'
                              ? 'Preparando'
                              : ticket.status === 'ready'
                              ? 'Listo'
                              : 'Entregado'}
                          </div>
                        </div>
                      </div>

                      {/* Ticket Items */}
                      <div className="p-4 space-y-2.5">
                        {(ticket.items || []).map((it, idx) => (
                          <div
                            key={`${it.id}_${idx}`}
                            className="pb-2 border-b border-slate-100 last:border-0 last:pb-0"
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="px-2 py-0.5 rounded-lg bg-slate-900 text-white font-black text-sm tabular-nums shrink-0">
                                {it.quantity}x
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="font-extrabold text-slate-900 text-sm">
                                  {it.name}
                                </div>
                                {it.notes && (
                                  <div className="mt-1 px-2.5 py-1 rounded-lg bg-amber-100 border border-amber-300 text-amber-950 text-xs font-extrabold">
                                    NOTA: {it.notes}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}

                        {ticket.orderNotes && (
                          <div className="mt-2 p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700">
                            Obs. Mesa: {ticket.orderNotes}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Ticket Actions Footer */}
                    <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handlePrintKitchenTicket(ticket)}
                        className="min-h-[40px] px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                        title="Imprimir ticket de comanda térmica"
                      >
                        <Printer className="w-4 h-4" />
                        <span>Imprimir</span>
                      </button>

                      {ticket.status === 'pending' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleUpdateKitchenTicketStatus(ticket.id, 'preparing')}
                            className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold cursor-pointer"
                          >
                            🔥 Preparar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateKitchenTicketStatus(ticket.id, 'ready')}
                            className="min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                          >
                            ✅ Listo
                          </button>
                        </>
                      )}

                      {ticket.status === 'preparing' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateKitchenTicketStatus(ticket.id, 'ready')}
                          className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                        >
                          ✅ Marcar Listo para Servir
                        </button>
                      )}

                      {ticket.status === 'ready' && (
                        <button
                          type="button"
                          onClick={() => handleUpdateKitchenTicketStatus(ticket.id, 'delivered')}
                          className="flex-1 min-h-[40px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
                        >
                          🍽️ Entregado a Mesa
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: AGREGAR / EDITAR MESA                                          */}
      {/* ===================================================================== */}
      {showTableModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UtensilsCrossed className="w-5 h-5 text-orange-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  {editingTable ? `Editar ${editingTable.name}` : 'Agregar Nueva Mesa'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowTableModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTable} className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    N° / Código Corto
                  </label>
                  <input
                    type="text"
                    required
                    value={tableNumberInput}
                    onChange={(e) => setTableNumberInput(e.target.value)}
                    placeholder="Ej. 7, B2, V1"
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Capacidad (Pers.)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={tableCapacityInput}
                    onChange={(e) => setTableCapacityInput(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Nombre Visible de la Mesa
                </label>
                <input
                  type="text"
                  required
                  value={tableNameInput}
                  onChange={(e) => setTableNameInput(e.target.value)}
                  placeholder="Ej. Mesa 7 o Terraza Norte"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Zona / Área del Restaurante
                </label>
                <select
                  value={tableZoneInput}
                  onChange={(e) => setTableZoneInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {zones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1.5">
                  Forma Visual
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'square' as const, label: 'Cuadrada' },
                    { id: 'round' as const, label: 'Redonda' },
                    { id: 'rect' as const, label: 'Rectangular' },
                  ].map((sh) => (
                    <button
                      key={sh.id}
                      type="button"
                      onClick={() => setTableShapeInput(sh.id)}
                      className={`py-2 px-3 rounded-xl border text-xs font-extrabold cursor-pointer ${
                        tableShapeInput === sh.id
                          ? 'bg-orange-50 border-orange-500 text-orange-800'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      {sh.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                {editingTable ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteTable(editingTable)}
                    className="min-h-[40px] px-3 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-extrabold flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowTableModal(false)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Guardar Mesa
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: GESTIONAR ZONAS DEL SALÓN                                      */}
      {/* ===================================================================== */}
      {showZonesModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">Zonas del Restaurante</h3>
              <button
                type="button"
                onClick={() => setShowZonesModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <form onSubmit={handleAddZone} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder="Nueva zona (ej. Jardín, Segundo Piso)"
                  className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
                <button
                  type="submit"
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  Agregar
                </button>
              </form>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {zones.map((z) => {
                  const count = tables.filter((t) => t.zone === z).length;
                  return (
                    <div
                      key={z}
                      className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-extrabold text-slate-900">{z}</span>
                        <span className="text-slate-500 ml-2">({count} mesas)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteZone(z)}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Eliminar zona"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: NUEVO PEDIDO PARA LLEVAR / DOMICILIO                           */}
      {/* ===================================================================== */}
      {showNewTakeoutModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Nuevo Pedido Para Llevar / Domicilio
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowNewTakeoutModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateTakeoutOrder} className="p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setTakeoutType('takeout')}
                  className={`min-h-[42px] p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                    takeoutType === 'takeout'
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-900'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <ShoppingBag className="w-4 h-4" />
                  <span>Para Llevar</span>
                </button>
                <button
                  type="button"
                  onClick={() => setTakeoutType('delivery')}
                  className={`min-h-[42px] p-2.5 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                    takeoutType === 'delivery'
                      ? 'bg-orange-50 border-orange-500 text-orange-900'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <Bike className="w-4 h-4" />
                  <span>Domicilio</span>
                </button>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Nombre del Cliente (Opcional)
                </label>
                <input
                  type="text"
                  value={takeoutCustomerName}
                  onChange={(e) => setTakeoutCustomerName(e.target.value)}
                  placeholder="Ej. María Gómez"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Teléfono / WhatsApp
                </label>
                <input
                  type="tel"
                  value={takeoutPhone}
                  onChange={(e) => setTakeoutPhone(e.target.value)}
                  placeholder="Ej. 9999-0000"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {takeoutType === 'delivery' && (
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Dirección de Entrega
                  </label>
                  <textarea
                    rows={2}
                    value={takeoutAddress}
                    onChange={(e) => setTakeoutAddress(e.target.value)}
                    placeholder="Colonia, calle, referencia..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTakeoutModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  Abrir Orden
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: NOTA DE COCINA POR PLATILLO                                    */}
      {/* ===================================================================== */}
      {editingNoteItemId && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Instrucciones / Nota para Cocina
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingNoteItemId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_DISH_NOTES.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() =>
                      setItemNoteDraft((prev) =>
                        prev.includes(tag) ? prev : prev ? `${prev}, ${tag}` : tag
                      )
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold cursor-pointer"
                  >
                    + {tag}
                  </button>
                ))}
              </div>
              <textarea
                rows={3}
                value={itemNoteDraft}
                onChange={(e) => setItemNoteDraft(e.target.value)}
                placeholder="Ej. Sin cebolla, bien cocido, salsa aparte..."
                autoFocus
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setItemNoteDraft('')}
                  className="text-xs font-bold text-rose-600 hover:underline cursor-pointer"
                >
                  Limpiar nota
                </button>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingNoteItemId(null)}
                    className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveItemNote}
                    className="min-h-[40px] px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold cursor-pointer"
                  >
                    Guardar Nota
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: PLATILLO O EXTRA MANUAL                                        */}
      {/* ===================================================================== */}
      {showManualDishModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base">
                Agregar Platillo / Extra Manual
              </h3>
              <button
                type="button"
                onClick={() => setShowManualDishModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddManualDish} className="p-4 sm:p-5 space-y-4">
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Nombre del Platillo o Extra
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={manualDishName}
                  onChange={(e) => setManualDishName(e.target.value)}
                  placeholder="Ej. Orden extra de tortillas / Sopa del día"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Precio Unitario (L.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={manualDishPrice}
                  onChange={(e) => setManualDishPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                  Nota para Cocina (Opcional)
                </label>
                <input
                  type="text"
                  value={manualDishNotes}
                  onChange={(e) => setManualDishNotes(e.target.value)}
                  placeholder="Ej. Caliente, aparte..."
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowManualDishModal(false)}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[40px] px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-extrabold cursor-pointer"
                >
                  Agregar a la Mesa
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: CAMBIAR / MOVER DE MESA                                        */}
      {/* ===================================================================== */}
      {showMoveTableModal && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-amber-400" />
                <h3 className="font-extrabold text-sm sm:text-base">
                  Mover "{activeOrder.tableName}" a Otra Mesa
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowMoveTableModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 sm:p-5 space-y-3 max-h-[70vh] overflow-y-auto">
              {tables.filter((t) => getTableLiveState(t).status === 'available').length === 0 ? (
                <p className="text-xs font-bold text-slate-500 text-center py-4">
                  No hay mesas disponibles en este momento para trasladar la orden.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {tables
                    .filter((t) => getTableLiveState(t).status === 'available')
                    .map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleMoveOrderToTable(t)}
                        className="p-3 rounded-xl border border-slate-200 hover:border-orange-500 hover:bg-orange-50 text-left cursor-pointer transition-all"
                      >
                        <div className="font-black text-slate-900 text-sm">{t.name}</div>
                        <div className="text-[11px] text-slate-500">
                          {t.zone} • {t.capacity} pers.
                        </div>
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: COBRAR MESA Y FACTURAR EN POS                                  */}
      {/* ===================================================================== */}
      {showCheckoutModal && activeOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4">
          <div className="bg-white w-full max-w-lg rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-extrabold text-sm sm:text-base">
                  Cobrar y Facturar — {activeOrder.tableName}
                </h3>
                <p className="text-[11px] text-slate-400">
                  {activeOrder.orderNumber} • Se registrará en Caja POS y liberará la mesa
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCheckoutModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={handleConfirmCheckout}
              className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4"
            >
              {/* Payment Method */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1.5">
                  Método de Pago
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'cash' as const, label: 'Efectivo', icon: Banknote },
                    { id: 'card' as const, label: 'Tarjeta', icon: CreditCard },
                    { id: 'transfer' as const, label: 'Transferencia', icon: Landmark },
                    { id: 'credit' as const, label: 'Crédito', icon: FileText },
                  ].map((m) => {
                    const Icon = m.icon;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => {
                          setPayMethod(m.id);
                          if (m.id !== 'cash') {
                            setCheckoutAmountPaid(String(checkoutTotals.total));
                          }
                        }}
                        className={`min-h-[42px] p-2 rounded-xl border text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer ${
                          payMethod === m.id
                            ? 'bg-emerald-50 border-emerald-500 text-emerald-900'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Discount, Tip, ISV */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Descuento (L.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={checkoutDiscount}
                    onChange={(e) => setCheckoutDiscount(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1">
                    Propina (L.)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={checkoutTip}
                      onChange={(e) => setCheckoutTip(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const sub = Math.max(
                          0,
                          checkoutTotals.subtotal - (parseFloat(checkoutDiscount) || 0)
                        );
                        setCheckoutTip(String(Math.round(sub * 0.1 * 100) / 100));
                      }}
                      className="px-2.5 py-2 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-extrabold cursor-pointer shrink-0"
                    >
                      10%
                    </button>
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checkoutIncludeTax}
                  onChange={(e) => setCheckoutIncludeTax(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Agregar 15% ISV sobre consumo</span>
              </label>

              {/* Cash Received */}
              {payMethod === 'cash' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-extrabold uppercase text-slate-700">
                      Efectivo Recibido (L.)
                    </label>
                    <div className="flex items-center gap-1">
                      {[100, 200, 500].map((bill) => (
                        <button
                          key={bill}
                          type="button"
                          onClick={() => setCheckoutAmountPaid(String(bill))}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-300 text-[11px] font-extrabold text-slate-700 hover:bg-slate-100 cursor-pointer tabular-nums"
                        >
                          L.{bill}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setCheckoutAmountPaid(String(checkoutTotals.total))}
                        className="px-2 py-1 rounded-lg bg-emerald-100 border border-emerald-300 text-[11px] font-extrabold text-emerald-900 cursor-pointer"
                      >
                        Exacto
                      </button>
                    </div>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={checkoutAmountPaid}
                    onChange={(e) => setCheckoutAmountPaid(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 tabular-nums"
                  />
                  <div className="flex items-center justify-between text-xs font-extrabold">
                    <span className="text-slate-600">Cambio a entregar:</span>
                    <span className="text-base text-emerald-700 tabular-nums">
                      {formatCurrencyL(checkoutTotals.change)}
                    </span>
                  </div>
                </div>
              )}

              {/* Warehouse & Customer Info */}
              {activeWarehouses.length > 1 && (
                <div>
                  <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1 flex items-center gap-1">
                    <Boxes className="w-3.5 h-3.5 text-teal-600" />
                    <span>Bodega / Cocina de Descuento de Stock</span>
                  </label>
                  <select
                    value={selectedWarehouseId}
                    onChange={(e) => setSelectedWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold bg-white"
                  >
                    {activeWarehouses.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <input
                  type="text"
                  value={checkoutCustomerName}
                  onChange={(e) => setCheckoutCustomerName(e.target.value)}
                  placeholder="Cliente (Consumidor Final)"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                />
                <input
                  type="text"
                  value={checkoutCustomerRtn}
                  onChange={(e) => setCheckoutCustomerRtn(e.target.value)}
                  placeholder="RTN (Opcional)"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                />
                <input
                  type="tel"
                  value={checkoutCustomerPhone}
                  onChange={(e) => setCheckoutCustomerPhone(e.target.value)}
                  placeholder="Teléfono / WhatsApp"
                  className="px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold"
                />
              </div>

              {/* Totals Breakdown */}
              <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Subtotal Consumo:</span>
                  <span className="tabular-nums">{formatCurrencyL(checkoutTotals.subtotal)}</span>
                </div>
                {checkoutTotals.discount > 0 && (
                  <div className="flex justify-between text-amber-300">
                    <span>Descuento:</span>
                    <span className="tabular-nums">-{formatCurrencyL(checkoutTotals.discount)}</span>
                  </div>
                )}
                {checkoutTotals.tip > 0 && (
                  <div className="flex justify-between text-emerald-300">
                    <span>Propina:</span>
                    <span className="tabular-nums">{formatCurrencyL(checkoutTotals.tip)}</span>
                  </div>
                )}
                {checkoutTotals.tax > 0 && (
                  <div className="flex justify-between text-slate-300">
                    <span>15% ISV:</span>
                    <span className="tabular-nums">{formatCurrencyL(checkoutTotals.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-black pt-1.5 border-t border-slate-700">
                  <span>TOTAL A COBRAR:</span>
                  <span className="text-emerald-400 tabular-nums">
                    {formatCurrencyL(checkoutTotals.total)}
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCheckoutModal(false)}
                  className="min-h-[42px] px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Volver
                </button>
                <button
                  type="submit"
                  disabled={isProcessingCheckout}
                  className="min-h-[42px] px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs sm:text-sm font-extrabold flex items-center gap-2 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isProcessingCheckout ? 'Procesando...' : 'Confirmar Pago y Facturar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL: FACTURA COMPLETADA (IMPRIMIR / PDF)                            */}
      {/* ===================================================================== */}
      {completedSale && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-emerald-600 text-white text-center space-y-1.5">
              <CheckCircle2 className="w-10 h-10 mx-auto" />
              <h3 className="font-black text-lg">¡Mesa Cobrada con Éxito!</h3>
              <p className="text-xs text-emerald-100 font-semibold">
                Comprobante {completedSale.saleNumber} • Total {formatCurrencyL(completedSale.total)}
              </p>
            </div>

            <div className="p-5 space-y-4">
              {completedSale.paymentMethod === 'cash' && completedSale.change > 0 && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-center">
                  <div className="text-[11px] font-bold uppercase text-amber-800">
                    Cambio a Entregar
                  </div>
                  <div className="text-xl font-black text-amber-950 tabular-nums">
                    {formatCurrencyL(completedSale.change)}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-500 mb-1.5">
                  Formato de Impresión
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['80mm', '58mm', 'half-letter', 'letter'] as PrinterPaperFormat[]).map((fmt) => (
                    <button
                      key={fmt}
                      type="button"
                      onClick={() => setSelectedPrintFormat(fmt)}
                      className={`py-2 rounded-xl border text-[11px] font-extrabold cursor-pointer ${
                        selectedPrintFormat === fmt
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}
                    >
                      {fmt === 'half-letter' ? '1/2 Carta' : fmt === 'letter' ? 'Carta' : fmt}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    const html = buildSaleDocumentHtml(
                      completedSale,
                      storeSettings,
                      selectedPrintFormat
                    );
                    printHtmlDocument(
                      html,
                      `Factura_${completedSale.saleNumber}`,
                      selectedPrintFormat,
                      storeSettings,
                      completedSale
                    );
                  }}
                  className="min-h-[44px] px-3 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Ticket</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedPrintFormat === '80mm' || selectedPrintFormat === '58mm') {
                      const html = buildSaleDocumentHtml(
                        completedSale,
                        storeSettings,
                        selectedPrintFormat
                      );
                      shareHtmlDocumentAsPdfToPrinterApp(
                        html,
                        `Factura_${completedSale.saleNumber}`,
                        selectedPrintFormat,
                        storeSettings
                      );
                    } else {
                      downloadSalePdf(
                        completedSale,
                        storeSettings,
                        selectedPrintFormat,
                        completedSale.cashier || userSession?.userName
                      );
                    }
                  }}
                  className="min-h-[44px] px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>PDF / Compartir</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="w-full min-h-[42px] py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-extrabold cursor-pointer"
              >
                Listo, Volver al Salón
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
