import React, { useState, useMemo, useRef } from 'react';
import {
  Product,
  SaleRecord,
  SaleItem,
  StoreSettings,
} from '../types';
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
  ChevronLeft
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';

interface SalesViewProps {
  inventory: Product[];
  sales: SaleRecord[];
  storeSettings: StoreSettings;
  onRecordSale: (saleData: Omit<SaleRecord, 'id'>) => Promise<SaleRecord | void>;
  onCancelSale: (sale: SaleRecord) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const SalesView: React.FC<SalesViewProps> = ({
  inventory,
  sales,
  storeSettings,
  onRecordSale,
  onCancelSale,
  showToast,
}) => {
  // Navigation between POS Terminal and Sales History
  const [activeSubTab, setActiveSubTab] = useState<'pos' | 'history'>('pos');
  // Mobile / Tablet POS active view: 'catalog' | 'cart' (< lg)
  const [mobilePosTab, setMobilePosTab] = useState<'catalog' | 'cart'>('catalog');

  // ------------------ POS STATE ------------------
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [applyTax, setApplyTax] = useState<boolean>(false); // 15% ISV Honduras optional
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('cash');
  const [cashGiven, setCashGiven] = useState<string>('');
  const [customerName, setCustomerName] = useState<string>('Consumidor Final');
  const [customerRtn, setCustomerRtn] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [saleNotes, setSaleNotes] = useState<string>('');
  const [isSubmittingSale, setIsSubmittingSale] = useState<boolean>(false);

  // Completed sale receipt modal
  const [completedSale, setCompletedSale] = useState<SaleRecord | null>(null);
  const [showReceiptModal, setShowReceiptModal] = useState<boolean>(false);

  // ------------------ HISTORY STATE ------------------
  const [historySearch, setHistorySearch] = useState('');
  const [historyDateFilter, setHistoryDateFilter] = useState<'today' | 'yesterday' | 'week' | 'month' | 'all'>('today');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [historyPaymentFilter, setHistoryPaymentFilter] = useState<'all' | 'cash' | 'card' | 'transfer'>('all');

  // Cancel sale dialog state
  const [saleToCancel, setSaleToCancel] = useState<SaleRecord | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Printable receipt ref
  const receiptPrintRef = useRef<HTMLDivElement>(null);

  // Available categories in inventory
  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((p) => {
      if (p.category) set.add(p.category.trim());
    });
    return Array.from(set).sort();
  }, [inventory]);

  // Filtered inventory catalog for POS (supports name, SKU code, barcode)
  const filteredCatalog = useMemo(() => {
    const raw = searchQuery.trim().toLowerCase();
    if (!raw) {
      return selectedCategory === 'all'
        ? inventory
        : inventory.filter((item) => item.category === selectedCategory);
    }

    const searchTokens = raw.split(/\s+/).filter(Boolean);

    return inventory.filter((item) => {
      // Category filter
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      const itemName = (item.name || '').toLowerCase();
      const itemCode = (item.code || '').toLowerCase();
      const itemSize = (item.size || '').toLowerCase();
      const itemCategory = (item.category || '').toLowerCase();
      const itemSupplier = (item.supplier || '').toLowerCase();

      // Check if code or barcode matches directly
      if (itemCode.includes(raw) || itemCode.replace(/[-_\s]/g, '').includes(raw.replace(/[-_\s]/g, ''))) {
        return true;
      }

      // Check if all token words match the product name, size or category
      const matchesAllTokens = searchTokens.every(
        (token) =>
          itemName.includes(token) ||
          itemCode.includes(token) ||
          itemSize.includes(token) ||
          itemCategory.includes(token) ||
          itemSupplier.includes(token)
      );

      return matchesAllTokens;
    });
  }, [inventory, searchQuery, selectedCategory]);

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
        setSearchQuery('');
        return;
      }

      // 2. Exact match by article name
      const exactNameMatch = inventory.find(
        (p) => p.name.trim().toLowerCase() === cleanQuery
      );

      if (exactNameMatch) {
        addToCart(exactNameMatch);
        setSearchQuery('');
        return;
      }

      // 3. If filtered results has exactly 1 matching product
      if (filteredCatalog.length === 1) {
        addToCart(filteredCatalog[0]);
        setSearchQuery('');
        return;
      }

      // 4. If filtered results has multiple matches, add the top match and inform cashier
      if (filteredCatalog.length > 1) {
        addToCart(filteredCatalog[0]);
        showToast(
          `Agregado: "${filteredCatalog[0].name}" (${filteredCatalog.length} artículos encontrados para "${query}")`,
          'info'
        );
        setSearchQuery('');
        return;
      }

      // 5. No matches found
      showToast(
        `No se encontró ningún artículo por nombre, código o código de barra: "${query}"`,
        'warning'
      );
    }
  };

  // Add product to cart with stock validation
  const addToCart = (product: Product) => {
    const availableStock = Number(product.stock) || 0;
    if (availableStock <= 0) {
      showToast(`El producto "${product.name}" está agotado (Stock 0)`, 'error');
      return;
    }

    setCart((prevCart) => {
      const existingIndex = prevCart.findIndex((it) => it.code === product.code);
      if (existingIndex >= 0) {
        const currentQty = prevCart[existingIndex].quantity;
        if (currentQty + 1 > availableStock) {
          showToast(
            `Stock máximo alcanzado para "${product.name}". Disponible: ${availableStock}`,
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
            price: Number(product.price) || 0,
            cost: Number(product.cost) || 0,
            quantity: 1,
            subtotal: Number(product.price) || 0,
          },
        ];
      }
    });
  };

  // Update item quantity in cart
  const updateCartQuantity = (code: string, newQty: number) => {
    const product = inventory.find((p) => p.code === code);
    const availableStock = product ? Number(product.stock) || 0 : 9999;

    if (newQty <= 0) {
      removeFromCart(code);
      return;
    }

    if (newQty > availableStock) {
      showToast(
        `No puedes agregar más de ${availableStock} unidades disponibles en stock.`,
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

  // Remove single item from cart
  const removeFromCart = (code: string) => {
    setCart((prev) => prev.filter((item) => item.code !== code));
  };

  // Clear entire cart
  const clearCart = () => {
    setCart([]);
    setDiscountPercent(0);
    setCashGiven('');
    setCustomerName('Consumidor Final');
    setCustomerRtn('');
    setCustomerPhone('');
    setSaleNotes('');
    setMobilePosTab('catalog');
  };

  // Calculations for current cart
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, it) => sum + it.subtotal, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    return (cartSubtotal * Math.min(100, Math.max(0, discountPercent))) / 100;
  }, [cartSubtotal, discountPercent]);

  const subtotalAfterDiscount = useMemo(() => {
    return Math.max(0, cartSubtotal - discountAmount);
  }, [cartSubtotal, discountAmount]);

  const taxAmount = useMemo(() => {
    return applyTax ? subtotalAfterDiscount * 0.15 : 0;
  }, [applyTax, subtotalAfterDiscount]);

  const cartTotal = useMemo(() => {
    return subtotalAfterDiscount + taxAmount;
  }, [subtotalAfterDiscount, taxAmount]);

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
      showToast('El carrito está vacío. Agrega productos para vender.', 'warning');
      return;
    }

    // Verify stock availability once more right before saving
    for (const item of cart) {
      const liveProduct = inventory.find((p) => p.code === item.code);
      const currentStock = liveProduct ? Number(liveProduct.stock) || 0 : 0;
      if (item.quantity > currentStock) {
        showToast(
          `Stock insuficiente para "${item.name}". Solo hay ${currentStock} unidades disponibles.`,
          'error'
        );
        return;
      }
    }

    if (paymentMethod === 'cash' && numericCashGiven < cartTotal) {
      showToast(
        `El efectivo recibido (L. ${numericCashGiven.toFixed(2)}) es menor que el total a pagar (L. ${cartTotal.toFixed(2)})`,
        'error'
      );
      return;
    }

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
        amountPaid: paymentMethod === 'cash' ? numericCashGiven : cartTotal,
        change: paymentMethod === 'cash' ? cashChange : 0,
        customerName: customerName.trim() || 'Consumidor Final',
        customerRtn: customerRtn.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        notes: saleNotes.trim() || undefined,
        status: 'completed',
        cashier: 'Caja Principal',
      };

      const result = await onRecordSale(saleData);
      
      const recorded: SaleRecord = (result as SaleRecord) || {
        id: Date.now().toString(),
        ...saleData,
      };

      setCompletedSale(recorded);
      setShowReceiptModal(true);
      clearCart();
      showToast(`¡Venta ${saleNumber} registrada con éxito! El inventario ha sido actualizado.`, 'success');
    } catch (err: any) {
      console.error('Checkout error:', err);
      showToast(`Error al registrar la venta: ${err?.message || err}`, 'error');
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Print Receipt handler
  const handlePrintReceipt = () => {
    if (!receiptPrintRef.current) return;
    const printContents = receiptPrintRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=450,height=650');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Ticket de Venta - ${completedSale?.saleNumber || 'Recibo'}</title>
            <style>
              body {
                font-family: 'Courier New', Courier, monospace;
                margin: 0;
                padding: 16px;
                color: #000;
                background: #fff;
                font-size: 13px;
                line-height: 1.35;
              }
              .text-center { text-align: center; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .border-b { border-bottom: 1px dashed #444; }
              .border-t { border-top: 1px dashed #444; }
              .py-1 { padding-top: 4px; padding-bottom: 4px; }
              .my-2 { margin-top: 8px; margin-bottom: 8px; }
              .flex { display: flex; justify-content: space-between; }
              .table { width: 100%; border-collapse: collapse; }
              .table th { text-align: left; border-bottom: 1px solid #000; padding: 4px 0; }
              .table td { padding: 4px 0; }
              @media print {
                @page { margin: 0; size: 80mm auto; }
                body { padding: 8px; }
              }
            </style>
          </head>
          <body>
            ${printContents}
            <script>
              window.onload = function() {
                window.print();
                setTimeout(() => window.close(), 500);
              };
            </script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  // ------------------ HISTORIAL FILTERING & METRICS ------------------
  const filteredSalesHistory = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return sales.filter((s) => {
      // Date filter
      if (historyDateFilter === 'today' && s.timestamp < startOfToday) return false;
      if (
        historyDateFilter === 'yesterday' &&
        (s.timestamp < startOfYesterday || s.timestamp >= startOfToday)
      )
        return false;
      if (historyDateFilter === 'week' && s.timestamp < startOfWeek) return false;
      if (historyDateFilter === 'month' && s.timestamp < startOfMonth) return false;

      // Status filter
      if (historyStatusFilter !== 'all' && s.status !== historyStatusFilter) return false;

      // Payment filter
      if (historyPaymentFilter !== 'all' && s.paymentMethod !== historyPaymentFilter) return false;

      // Search query (sale number, customer name, rtn, or item name/code)
      if (q) {
        const matchesSaleNum = s.saleNumber.toLowerCase().includes(q);
        const matchesCustomer = (s.customerName || '').toLowerCase().includes(q);
        const matchesRtn = (s.customerRtn || '').toLowerCase().includes(q);
        const matchesItem = s.items.some(
          (it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)
        );
        if (!matchesSaleNum && !matchesCustomer && !matchesRtn && !matchesItem) return false;
      }

      return true;
    });
  }, [sales, historySearch, historyDateFilter, historyStatusFilter, historyPaymentFilter]);

  // Overall statistics for sales
  const salesMetrics = useMemo(() => {
    const validSales = filteredSalesHistory.filter((s) => s.status === 'completed');
    const totalRevenue = validSales.reduce((sum, s) => sum + s.total, 0);
    const totalItemsSold = validSales.reduce((sum, s) => sum + s.totalItems, 0);
    const averageTicket = validSales.length > 0 ? totalRevenue / validSales.length : 0;

    // Gross profit calculation (Price - Cost)
    let totalCost = 0;
    validSales.forEach((s) => {
      s.items.forEach((it) => {
        totalCost += (Number(it.cost) || 0) * it.quantity;
      });
    });
    const estimatedProfit = Math.max(0, totalRevenue - totalCost);

    return {
      count: validSales.length,
      revenue: totalRevenue,
      itemsSold: totalItemsSold,
      avgTicket: averageTicket,
      profit: estimatedProfit,
      cancelledCount: filteredSalesHistory.filter((s) => s.status === 'cancelled').length,
    };
  }, [filteredSalesHistory]);

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

  // Export Sales to CSV
  const handleExportCSV = () => {
    if (filteredSalesHistory.length === 0) {
      showToast('No hay ventas para exportar con los filtros seleccionados.', 'warning');
      return;
    }

    const headers = [
      'N° Venta',
      'Fecha',
      'Cliente',
      'RTN/DNI',
      'Método de Pago',
      'Artículos (Cant)',
      'Subtotal (L)',
      'Descuento (L)',
      'ISV (L)',
      'Total (L)',
      'Efectivo Recibido',
      'Cambio',
      'Estado',
      'Detalle Productos',
    ];

    const rows = filteredSalesHistory.map((s) => [
      `"${s.saleNumber}"`,
      `"${s.date}"`,
      `"${s.customerName || 'Consumidor Final'}"`,
      `"${s.customerRtn || ''}"`,
      `"${s.paymentMethod}"`,
      s.totalItems,
      s.subtotal.toFixed(2),
      s.discount.toFixed(2),
      s.tax.toFixed(2),
      s.total.toFixed(2),
      s.amountPaid.toFixed(2),
      s.change.toFixed(2),
      `"${s.status === 'completed' ? 'Completada' : 'Anulada'}"`,
      `"${s.items.map((it) => `${it.quantity}x ${it.name} (${it.code})`).join('; ')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `historial_ventas_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Reporte de ventas exportado exitosamente a CSV.', 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Bar / Navigation Tabs */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0 shadow-sm">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingCart className="w-6 h-6 text-emerald-600" />
            <span>Panel de Ventas & Facturación</span>
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Punto de Venta (POS) en tiempo real con descuento automático de inventario e historial auditado.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab('pos')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'pos'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Nueva Venta (POS)</span>
            {cart.length > 0 && (
              <span className="bg-white text-emerald-700 text-[11px] font-bold px-1.5 py-0.2 rounded-full">
                {totalCartItemsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Historial de Ventas</span>
            <span className="bg-slate-200 text-slate-700 text-[11px] font-bold px-1.5 py-0.2 rounded-full">
              {sales.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      {activeSubTab === 'pos' ? (
        /* ==================== POS TERMINAL VIEW ==================== */
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
          {/* Mobile / Tablet Segmented POS Switcher (< lg) */}
          <div className="lg:hidden p-2.5 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 shadow-2xs">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full">
              <button
                type="button"
                onClick={() => setMobilePosTab('catalog')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mobilePosTab === 'catalog'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Tag className="w-3.5 h-3.5 text-emerald-600" />
                <span>Catálogo ({filteredCatalog.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setMobilePosTab('cart')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  mobilePosTab === 'cart'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                <span>Ticket / Cobrar</span>
                {cart.length > 0 && (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${
                      mobilePosTab === 'cart'
                        ? 'bg-white text-emerald-700'
                        : 'bg-emerald-600 text-white'
                    }`}
                  >
                    {totalCartItemsCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Left Column: Product Catalog & Search (60% on desktop) */}
          <div
            className={`flex-1 flex flex-col border-r border-slate-200 bg-slate-50/70 overflow-hidden relative ${
              mobilePosTab === 'cart' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Search and Category Filter Toolbar */}
            <div className="p-3 sm:p-4 bg-white border-b border-slate-200 space-y-3 shrink-0">
              <div className="space-y-1.5">
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar por nombre del artículo, código SKU o escanear código de barra..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="w-full pl-10 pr-24 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all font-medium"
                    autoFocus
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-14 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                      title="Limpiar búsqueda"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-200">
                    Enter
                  </span>
                </div>

                {/* Helper chips for search capabilities */}
                <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium px-1">
                  <span>Búsqueda activa por:</span>
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                    <Tag className="w-2.5 h-2.5 text-emerald-600" />
                    Nombre
                  </span>
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                    <Barcode className="w-2.5 h-2.5 text-indigo-600" />
                    Código / SKU
                  </span>
                  <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-semibold flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5 text-amber-500" />
                    Código de Barra
                  </span>
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-thin text-xs">
                <button
                  onClick={() => setSelectedCategory('all')}
                  className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Todos ({inventory.length})
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Product Catalog Grid */}
            <div className="flex-1 p-3 sm:p-4 overflow-y-auto">
              {filteredCatalog.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-8 text-slate-400">
                  <Package className="w-12 h-12 mb-3 text-slate-300 stroke-1" />
                  <p className="font-semibold text-slate-600 text-base">No se encontraron productos</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs">
                    Verifica el código de barra o la búsqueda ingresada.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3">
                  {filteredCatalog.map((product) => {
                    const stock = Number(product.stock) || 0;
                    const isOutOfStock = stock <= 0;
                    const inCartItem = cart.find((it) => it.code === product.code);
                    const qtyInCart = inCartItem?.quantity || 0;

                    return (
                      <div
                        key={product.code}
                        onClick={() => !isOutOfStock && addToCart(product)}
                        className={`group relative flex flex-col justify-between p-3 rounded-xl border bg-white transition-all text-left select-none ${
                          isOutOfStock
                            ? 'opacity-60 bg-slate-100/70 border-slate-200 cursor-not-allowed'
                            : 'border-slate-200/90 hover:border-emerald-500 hover:shadow-md cursor-pointer hover:-translate-y-0.5'
                        }`}
                      >
                        {/* Top indicators */}
                        <div className="flex items-start justify-between gap-1.5 mb-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isOutOfStock
                                ? 'bg-rose-100 text-rose-700'
                                : stock <= 3
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isOutOfStock ? 'Agotado' : `Stock: ${stock}`}
                          </span>

                          {qtyInCart > 0 && (
                            <span className="text-[10px] font-bold bg-emerald-600 text-white px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                              {qtyInCart} en carrito
                            </span>
                          )}
                        </div>

                        {/* Product Image / Icon */}
                        <div className="w-full h-24 mb-2 bg-slate-50 rounded-lg flex items-center justify-center overflow-hidden border border-slate-100">
                          {product.img ? (
                            <img
                              src={product.img}
                              alt={product.name}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                            />
                          ) : (
                            <Package className="w-8 h-8 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                          )}
                        </div>

                        {/* Details */}
                        <div className="space-y-1 mb-2">
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
                        </div>

                        {/* Price & Add Action */}
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
                          <div>
                            <span className="text-[10px] text-slate-400 block -mb-0.5">Precio</span>
                            <span className="font-bold text-slate-900 text-sm sm:text-base text-emerald-700">
                              L. {(Number(product.price) || 0).toFixed(2)}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={isOutOfStock}
                            className={`p-1.5 rounded-lg transition-colors ${
                              isOutOfStock
                                ? 'bg-slate-200 text-slate-400'
                                : 'bg-emerald-50 text-emerald-700 group-hover:bg-emerald-600 group-hover:text-white'
                            }`}
                            title={isOutOfStock ? 'Agotado' : 'Agregar al carrito'}
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Floating Mobile Cart Pill Bar (< lg) */}
            {cart.length > 0 && (
              <div className="lg:hidden sticky bottom-2 mx-3 my-2 z-20">
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
                    <span>Cobrar</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* Right Column: Checkout Ticket & Cart Summary (40% on desktop) */}
          <div
            className={`w-full lg:w-[420px] xl:w-[460px] flex flex-col bg-white border-l border-slate-200 shadow-xl overflow-hidden shrink-0 ${
              mobilePosTab === 'catalog' ? 'hidden lg:flex' : 'flex'
            }`}
          >
            {/* Mobile Back Button to Catalog (< lg) */}
            <div className="lg:hidden px-3.5 py-2.5 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobilePosTab('catalog')}
                className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1.5 cursor-pointer py-1"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Volver al Catálogo</span>
              </button>
              <span className="text-xs font-bold text-slate-700 font-mono">
                Total: L. {cartTotal.toFixed(2)}
              </span>
            </div>
            {/* Cart Header */}
            <div className="p-3.5 sm:p-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-5 h-5 text-emerald-600" />
                <h2 className="font-bold text-slate-900 text-sm sm:text-base">Ticket de Venta</h2>
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full">
                  {totalCartItemsCount} {totalCartItemsCount === 1 ? 'artículo' : 'artículos'}
                </span>
              </div>

              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={clearCart}
                  className="text-xs text-rose-600 hover:text-rose-800 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  title="Vaciar carrito"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Vaciar</span>
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <Receipt className="w-12 h-12 text-slate-300 mb-2 stroke-1" />
                  <p className="font-semibold text-slate-700 text-sm">El carrito está vacío</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-[220px]">
                    Selecciona productos del catálogo o escanea un código de barra para comenzar a vender.
                  </p>
                </div>
              ) : (
                cart.map((item) => {
                  const productInStore = inventory.find((p) => p.code === item.code);
                  const maxStock = productInStore ? Number(productInStore.stock) || 0 : 0;

                  return (
                    <div
                      key={item.code}
                      className="p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl flex items-center justify-between gap-2 transition-all hover:bg-slate-100/60"
                    >
                      {/* Name & price */}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-slate-900 text-xs sm:text-sm truncate">
                          {item.name}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                          <span className="font-mono">{item.code}</span>
                          <span>•</span>
                          <span className="font-medium text-emerald-700">
                            L. {item.price.toFixed(2)} c/u
                          </span>
                          {item.size && (
                            <>
                              <span>•</span>
                              <span className="bg-slate-200/80 px-1 py-0.2 rounded text-[10px]">
                                Talla: {item.size}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Quantity stepper */}
                      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-0.5 shrink-0 shadow-2xs">
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.code, item.quantity - 1)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
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
                          className="w-8 text-center text-xs font-bold text-slate-900 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => updateCartQuantity(item.code, item.quantity + 1)}
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded cursor-pointer"
                          disabled={item.quantity >= maxStock}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Item Subtotal */}
                      <div className="text-right shrink-0 min-w-[70px]">
                        <span className="font-bold text-xs sm:text-sm text-slate-900 block">
                          L. {item.subtotal.toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.code)}
                          className="text-[10px] text-slate-400 hover:text-rose-600 transition-colors mt-0.5 cursor-pointer"
                        >
                          Quitar
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Cart Footer: Customer Info & Checkout Panel */}
            <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 space-y-3 shrink-0">
              {/* Customer details mini accordion */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                  <span className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>Datos del Cliente (Opcional)</span>
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <input
                    type="text"
                    placeholder="Nombre (ej. Consumidor Final)"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <input
                    type="text"
                    placeholder="RTN / DNI (Opcional)"
                    value={customerRtn}
                    onChange={(e) => setCustomerRtn(e.target.value)}
                    className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono text-[11px]"
                  />
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Método de Pago
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      paymentMethod === 'cash'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Efectivo</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('card')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      paymentMethod === 'card'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Tarjeta</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentMethod('transfer')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                      paymentMethod === 'transfer'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Building className="w-3.5 h-3.5" />
                    <span>Transferencia</span>
                  </button>
                </div>
              </div>

              {/* Cash calculation input if cash is selected */}
              {paymentMethod === 'cash' && cart.length > 0 && (
                <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-emerald-950">Efectivo Recibido:</span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setCashGiven(cartTotal.toFixed(2))}
                        className="text-[10px] bg-emerald-200 hover:bg-emerald-300 text-emerald-900 font-bold px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Exacto
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCashGiven(
                            (Math.ceil(cartTotal / 100) * 100 || 100).toFixed(2)
                          )
                        }
                        className="text-[10px] bg-emerald-200 hover:bg-emerald-300 text-emerald-900 font-bold px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        Redondear 100
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setCashGiven(
                            (Math.ceil(cartTotal / 500) * 500 || 500).toFixed(2)
                          )
                        }
                        className="text-[10px] bg-emerald-200 hover:bg-emerald-300 text-emerald-900 font-bold px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        500
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">
                      L.
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={cashGiven}
                      onChange={(e) => setCashGiven(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Change display */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-emerald-200/60">
                    <span className="font-medium text-slate-700">Cambio / Vuelto:</span>
                    <span
                      className={`font-bold text-sm ${
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

              {/* Discounts & Taxes (collapsible or mini rows) */}
              <div className="space-y-1 text-xs text-slate-600 pt-1 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <span>Subtotal:</span>
                  <span className="font-semibold text-slate-800">
                    L. {cartSubtotal.toFixed(2)}
                  </span>
                </div>

                {/* Optional Discount selector */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span>Descuento:</span>
                    <div className="flex items-center gap-1">
                      {[0, 5, 10, 15].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setDiscountPercent(pct)}
                          className={`text-[10px] px-1.5 py-0.2 rounded font-bold cursor-pointer ${
                            discountPercent === pct
                              ? 'bg-slate-800 text-white'
                              : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
                          }`}
                        >
                          {pct}%
                        </button>
                      ))}
                    </div>
                  </div>
                  {discountAmount > 0 && (
                    <span className="font-semibold text-rose-600">
                      - L. {discountAmount.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Optional ISV 15% checkbox */}
                <div className="flex items-center justify-between pt-0.5">
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyTax}
                      onChange={(e) => setApplyTax(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <span>Incluir 15% ISV</span>
                  </label>
                  {applyTax && (
                    <span className="font-semibold text-slate-800">
                      L. {taxAmount.toFixed(2)}
                    </span>
                  )}
                </div>

                {/* Big Total Banner */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-300 text-slate-900">
                  <span className="text-sm font-bold">TOTAL A PAGAR:</span>
                  <span className="text-xl font-extrabold text-emerald-700">
                    L. {cartTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Checkout Action Button */}
              <button
                type="button"
                onClick={handleCheckout}
                disabled={
                  cart.length === 0 ||
                  isSubmittingSale ||
                  (paymentMethod === 'cash' && isCashInsufficient)
                }
                className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                  cart.length === 0 ||
                  isSubmittingSale ||
                  (paymentMethod === 'cash' && isCashInsufficient)
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed shadow-none'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/30 active:scale-[0.99]'
                }`}
              >
                {isSubmittingSale ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Registrando venta y actualizando stock...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Cobrar y Registrar Venta (L. {cartTotal.toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== SALES HISTORY VIEW ==================== */
        <div className="flex-1 flex flex-col overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Top KPI Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Total Facturado</span>
                <span className="text-lg sm:text-2xl font-bold text-emerald-700">
                  L. {salesMetrics.revenue.toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-emerald-50 rounded-xl text-emerald-600">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Ventas Completadas</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-900">
                  {salesMetrics.count}
                </span>
                {salesMetrics.cancelledCount > 0 && (
                  <span className="text-[10px] text-rose-500 block">
                    ({salesMetrics.cancelledCount} anuladas)
                  </span>
                )}
              </div>
              <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                <Receipt className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Unidades Vendidas</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-900">
                  {salesMetrics.itemsSold}
                </span>
              </div>
              <div className="p-2.5 bg-purple-50 rounded-xl text-purple-600">
                <Package className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Ticket Promedio</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-900">
                  L. {salesMetrics.avgTicket.toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* History Filters & Action Toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Box */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por N° de venta, cliente o producto..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {historySearch && (
                <button
                  onClick={() => setHistorySearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {/* Date Filters */}
              <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setHistoryDateFilter('today')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    historyDateFilter === 'today'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Hoy
                </button>
                <button
                  onClick={() => setHistoryDateFilter('yesterday')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    historyDateFilter === 'yesterday'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Ayer
                </button>
                <button
                  onClick={() => setHistoryDateFilter('week')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    historyDateFilter === 'week'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Últimos 7d
                </button>
                <button
                  onClick={() => setHistoryDateFilter('month')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    historyDateFilter === 'month'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Este mes
                </button>
                <button
                  onClick={() => setHistoryDateFilter('all')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    historyDateFilter === 'all'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Todos
                </button>
              </div>

              {/* Status Filter */}
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="all">Estado: Todos</option>
                <option value="completed">Completadas</option>
                <option value="cancelled">Anuladas</option>
              </select>

              {/* Export Button */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                title="Exportar a CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
            </div>
          </div>

          {/* Sales History Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
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
                <div className="sm:hidden divide-y divide-slate-100 p-2 space-y-2.5">
                  {filteredSalesHistory.map((sale) => {
                    const isCancelled = sale.status === 'cancelled';
                    return (
                      <div
                        key={sale.id}
                        className={`p-3.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2 bg-white ${
                          isCancelled ? 'bg-rose-50/30 border-rose-200' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {sale.saleNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isCancelled ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isCancelled ? 'Anulada' : 'Completada'}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="font-bold text-sm text-slate-800">
                              {sale.customerName || 'Consumidor Final'}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {sale.date}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Total</span>
                            <span
                              className={`text-base font-black ${
                                isCancelled ? 'line-through text-slate-400' : 'text-emerald-700'
                              }`}
                            >
                              L. {sale.total.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-medium">
                            <Package className="w-3.5 h-3.5 text-slate-400" />
                            {sale.totalItems} {sale.totalItems === 1 ? 'artículo' : 'artículos'}
                            <span className="text-slate-300">·</span>
                            <span className="capitalize">
                              {sale.paymentMethod === 'cash'
                                ? 'Efectivo'
                                : sale.paymentMethod === 'card'
                                ? 'Tarjeta'
                                : 'Transferencia'}
                            </span>
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setCompletedSale(sale);
                                setShowReceiptModal(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Ticket</span>
                            </button>
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => setSaleToCancel(sale)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Anular venta"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
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
                      <th className="py-3 px-4">Artículos</th>
                      <th className="py-3 px-4">Método</th>
                      <th className="py-3 px-4 text-right">Total</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredSalesHistory.map((sale) => {
                      const isCancelled = sale.status === 'cancelled';

                      return (
                        <tr
                          key={sale.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isCancelled ? 'bg-rose-50/40 text-slate-400' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {sale.saleNumber}
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
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                              <Package className="w-3 h-3 text-slate-500" />
                              {sale.totalItems} {sale.totalItems === 1 ? 'ítem' : 'ítems'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="capitalize text-slate-600">
                              {sale.paymentMethod === 'cash'
                                ? 'Efectivo'
                                : sale.paymentMethod === 'card'
                                ? 'Tarjeta'
                                : sale.paymentMethod === 'transfer'
                                ? 'Transferencia'
                                : 'Otro'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            <span className={isCancelled ? 'line-through text-slate-400' : 'text-emerald-700'}>
                              L. {sale.total.toFixed(2)}
                            </span>
                          </td>
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
                              {/* View receipt modal */}
                              <button
                                type="button"
                                onClick={() => {
                                  setCompletedSale(sale);
                                  setShowReceiptModal(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                title="Ver comprobante / ticket"
                              >
                                <Receipt className="w-4 h-4" />
                              </button>

                              {/* Cancel sale button (if not already cancelled) */}
                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => setSaleToCancel(sale)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Anular venta y devolver stock"
                                >
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
            </div>
          )}
          </div>
        </div>
      )}

      {/* ==================== TICKET / RECEIPT MODAL ==================== */}
      {showReceiptModal && completedSale && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Comprobante de Venta</h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {completedSale.saleNumber}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowReceiptModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Receipt Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div
                ref={receiptPrintRef}
                className="p-4 bg-white border border-dashed border-slate-300 rounded-xl font-mono text-xs text-slate-800 space-y-3 shadow-inner"
              >
                {/* Store Branding Header */}
                <div className="text-center space-y-1 pb-2 border-b border-dashed border-slate-300">
                  <h2 className="font-bold text-base uppercase text-slate-900">
                    {storeSettings.storeName || 'StockMaster'}
                  </h2>
                  {storeSettings.tagline && (
                    <p className="text-[11px] text-slate-500">{storeSettings.tagline}</p>
                  )}
                  {storeSettings.address && (
                    <p className="text-[10px] text-slate-500">{storeSettings.address}</p>
                  )}
                  {storeSettings.phone && (
                    <p className="text-[10px] text-slate-500">Tel: {storeSettings.phone}</p>
                  )}
                </div>

                {/* Ticket Meta */}
                <div className="text-[11px] space-y-0.5 pb-2 border-b border-dashed border-slate-300">
                  <div className="flex justify-between">
                    <span>N° Venta:</span>
                    <span className="font-bold">{completedSale.saleNumber}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fecha:</span>
                    <span>{completedSale.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Cliente:</span>
                    <span>{completedSale.customerName || 'Consumidor Final'}</span>
                  </div>
                  {completedSale.customerRtn && (
                    <div className="flex justify-between">
                      <span>RTN/DNI:</span>
                      <span>{completedSale.customerRtn}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Cajero:</span>
                    <span>{completedSale.cashier || 'Caja Principal'}</span>
                  </div>
                  {completedSale.status === 'cancelled' && (
                    <div className="text-center py-1 text-rose-600 font-bold border border-rose-300 rounded bg-rose-50 my-1">
                      *** VENTA ANULADA ***
                    </div>
                  )}
                </div>

                {/* Items Breakdown Table */}
                <div className="space-y-1.5 pb-2 border-b border-dashed border-slate-300">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 border-b pb-1 border-slate-200">
                    <span>Cant / Producto</span>
                    <span>Total</span>
                  </div>
                  {completedSale.items.map((it, idx) => (
                    <div key={idx} className="flex justify-between text-[11px]">
                      <div className="max-w-[70%]">
                        <span className="font-bold">{it.quantity}x</span> {it.name}
                        {it.size ? ` (${it.size})` : ''}
                        <div className="text-[9px] text-slate-400">@ L. {it.price.toFixed(2)}</div>
                      </div>
                      <span className="font-bold">L. {it.subtotal.toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {/* Financial Summary */}
                <div className="space-y-1 text-[11px]">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>L. {completedSale.subtotal.toFixed(2)}</span>
                  </div>
                  {completedSale.discount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Descuento:</span>
                      <span>- L. {completedSale.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {completedSale.tax > 0 && (
                    <div className="flex justify-between">
                      <span>15% ISV:</span>
                      <span>L. {completedSale.tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm border-t border-dashed border-slate-300 pt-1 text-slate-900">
                    <span>TOTAL:</span>
                    <span>L. {completedSale.total.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-600 pt-1">
                    <span>Método de Pago:</span>
                    <span className="capitalize">{completedSale.paymentMethod}</span>
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
            </div>

            {/* Modal Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrintReceipt}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir Ticket</span>
              </button>
              <button
                type="button"
                onClick={() => setShowReceiptModal(false)}
                className="py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

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
