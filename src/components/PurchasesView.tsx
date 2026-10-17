import React, { useState, useMemo, useRef } from 'react';
import {
  Product,
  Supplier,
  PurchaseInvoice,
  PurchaseItem,
  StoreSettings,
} from '../types';
import {
  FileText,
  Truck,
  Plus,
  Trash2,
  Calendar,
  DollarSign,
  Package,
  Layers,
  Search,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Printer,
  Download,
  X,
  CreditCard,
  Building,
  Check,
  Eye,
  Info,
  Clock,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { WhatsAppIcon } from './SalesView';

interface PurchasesViewProps {
  inventory: Product[];
  suppliers: Supplier[];
  purchases: PurchaseInvoice[];
  storeSettings: StoreSettings;
  onRecordPurchase: (purchaseData: Omit<PurchaseInvoice, 'id'>) => Promise<PurchaseInvoice | void>;
  onCancelPurchase: (purchase: PurchaseInvoice) => Promise<void>;
  onSaveSupplier: (supplier: Supplier) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({
  inventory,
  suppliers,
  purchases,
  storeSettings,
  onRecordPurchase,
  onCancelPurchase,
  onSaveSupplier,
  showToast,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'history'>('create');

  // ------------------ INVOICE ENTRY FORM STATE ------------------
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [invoiceNumber, setInvoiceNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    const d = new Date();
    return d.toISOString().split('T')[0];
  });
  const [paymentCondition, setPaymentCondition] = useState<'cash' | 'credit'>('cash');
  const [dueDate, setDueDate] = useState<string>('');
  const [invoiceNotes, setInvoiceNotes] = useState<string>('');
  const [applyTax, setApplyTax] = useState<boolean>(false); // 15% ISV
  const [discountAmount, setDiscountAmount] = useState<string>('0');
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fast Product Search to Add to Invoice
  const [productSearch, setProductSearch] = useState<string>('');
  const [showProductDropdown, setShowProductDropdown] = useState<boolean>(false);

  // Modal to add a brand new product directly from the purchase invoice
  const [showNewProductModal, setShowNewProductModal] = useState<boolean>(false);
  const [newProdCode, setNewProdCode] = useState<string>('');
  const [newProdName, setNewProdName] = useState<string>('');
  const [newProdCategory, setNewProdCategory] = useState<string>('General');
  const [newProdSize, setNewProdSize] = useState<string>('');
  const [newProdCost, setNewProdCost] = useState<string>('');
  const [newProdPrice, setNewProdPrice] = useState<string>('');
  const [newProdQty, setNewProdQty] = useState<string>('1');

  // Quick New Supplier modal
  const [showNewSupplierModal, setShowNewSupplierModal] = useState<boolean>(false);
  const [newSupplierName, setNewSupplierName] = useState<string>('');
  const [newSupplierContact, setNewSupplierContact] = useState<string>('');
  const [newSupplierPhone, setNewSupplierPhone] = useState<string>('');

  // ------------------ HISTORY & RECEIPT STATE ------------------
  const [selectedInvoiceForModal, setSelectedInvoiceForModal] = useState<PurchaseInvoice | null>(null);
  const [showInvoiceDetailsModal, setShowInvoiceDetailsModal] = useState<boolean>(false);
  const [invoiceToCancel, setInvoiceToCancel] = useState<PurchaseInvoice | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  const [historySearch, setHistorySearch] = useState<string>('');
  const [historySupplierFilter, setHistorySupplierFilter] = useState<string>('all');
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'all' | 'completed' | 'cancelled'>('all');
  const [historyDateFilter, setHistoryDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('month');

  const receiptPrintRef = useRef<HTMLDivElement>(null);

  // Filtered products for quick addition to purchase invoice
  const matchingProducts = useMemo(() => {
    if (!productSearch.trim()) return [];
    const q = productSearch.trim().toLowerCase();
    return inventory
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q) ||
          (p.size && p.size.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [inventory, productSearch]);

  // Selected supplier object
  const currentSupplier = useMemo(() => {
    return suppliers.find((s) => s.id === selectedSupplierId);
  }, [suppliers, selectedSupplierId]);

  // Add existing product from search to the invoice items
  const handleAddProductToInvoice = (product: Product) => {
    const existingIndex = items.findIndex((it) => it.code === product.code);
    if (existingIndex >= 0) {
      // Increment quantity
      const updated = [...items];
      const newQty = updated[existingIndex].quantity + 1;
      updated[existingIndex] = {
        ...updated[existingIndex],
        quantity: newQty,
        subtotal: newQty * updated[existingIndex].cost,
      };
      setItems(updated);
    } else {
      setItems([
        ...items,
        {
          productId: product.id,
          code: product.code,
          name: product.name,
          category: product.category,
          size: product.size,
          cost: Number(product.cost) || 0,
          salePrice: Number(product.price) || 0,
          quantity: 1,
          subtotal: Number(product.cost) || 0,
        },
      ]);
    }
    setProductSearch('');
    setShowProductDropdown(false);
  };

  // Update quantity of an item
  const handleUpdateItemQuantity = (code: string, qty: number) => {
    if (qty <= 0) {
      handleRemoveItem(code);
      return;
    }
    setItems((prev) =>
      prev.map((it) => {
        if (it.code === code) {
          return {
            ...it,
            quantity: qty,
            subtotal: qty * it.cost,
          };
        }
        return it;
      })
    );
  };

  // Update unit purchase cost of an item
  const handleUpdateItemCost = (code: string, newCost: number) => {
    const validCost = Math.max(0, newCost);
    setItems((prev) =>
      prev.map((it) => {
        if (it.code === code) {
          return {
            ...it,
            cost: validCost,
            subtotal: it.quantity * validCost,
          };
        }
        return it;
      })
    );
  };

  // Update sale price of an item
  const handleUpdateItemSalePrice = (code: string, newPrice: number) => {
    const validPrice = Math.max(0, newPrice);
    setItems((prev) =>
      prev.map((it) => {
        if (it.code === code) {
          return {
            ...it,
            salePrice: validPrice,
          };
        }
        return it;
      })
    );
  };

  // Remove item
  const handleRemoveItem = (code: string) => {
    setItems((prev) => prev.filter((it) => it.code !== code));
  };

  // Handle adding a brand new product from modal
  const handleAddNewProductModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProdCode.trim() || !newProdName.trim()) {
      showToast('Ingresa el código y nombre del producto nuevo.', 'warning');
      return;
    }

    const costNum = parseFloat(newProdCost) || 0;
    const priceNum = parseFloat(newProdPrice) || (costNum > 0 ? costNum * 1.35 : 0);
    const qtyNum = parseInt(newProdQty) || 1;

    setItems([
      ...items,
      {
        productId: newProdCode.trim(),
        code: newProdCode.trim(),
        name: newProdName.trim(),
        category: newProdCategory.trim() || 'General',
        size: newProdSize.trim(),
        cost: costNum,
        salePrice: priceNum,
        quantity: Math.max(1, qtyNum),
        subtotal: Math.max(1, qtyNum) * costNum,
      },
    ]);

    // Reset modal
    setNewProdCode('');
    setNewProdName('');
    setNewProdSize('');
    setNewProdCost('');
    setNewProdPrice('');
    setNewProdQty('1');
    setShowNewProductModal(false);
    showToast(`Producto nuevo "${newProdName.trim()}" agregado a la factura.`, 'success');
  };

  // Handle quick creation of a new supplier
  const handleQuickAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupplierName.trim()) {
      showToast('Ingresa el nombre del proveedor.', 'warning');
      return;
    }

    const newId = Date.now().toString();
    const newSup: Supplier = {
      id: newId,
      name: newSupplierName.trim(),
      contact: newSupplierContact.trim() || undefined,
      phone: newSupplierPhone.trim() || undefined,
    };

    try {
      await onSaveSupplier(newSup);
      setSelectedSupplierId(newId);
      setShowNewSupplierModal(false);
      setNewSupplierName('');
      setNewSupplierContact('');
      setNewSupplierPhone('');
      showToast(`Proveedor "${newSup.name}" registrado correctamente.`, 'success');
    } catch (err: any) {
      showToast(`Error al guardar proveedor: ${err?.message || err}`, 'error');
    }
  };

  // Totals calculations
  const itemsSubtotal = useMemo(() => {
    return items.reduce((sum, it) => sum + it.subtotal, 0);
  }, [items]);

  const numericDiscount = parseFloat(discountAmount) || 0;
  const subtotalAfterDiscount = Math.max(0, itemsSubtotal - numericDiscount);
  const taxAmount = applyTax ? subtotalAfterDiscount * 0.15 : 0;
  const invoiceGrandTotal = subtotalAfterDiscount + taxAmount;
  const totalItemsCount = useMemo(() => {
    return items.reduce((sum, it) => sum + it.quantity, 0);
  }, [items]);

  // Clear invoice form
  const handleClearInvoice = () => {
    setSelectedSupplierId('');
    setInvoiceNumber('');
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setPaymentCondition('cash');
    setDueDate('');
    setInvoiceNotes('');
    setApplyTax(false);
    setDiscountAmount('0');
    setItems([]);
  };

  // Submit invoice to Firestore & Update Stock
  const handleSubmitInvoice = async () => {
    if (!selectedSupplierId) {
      showToast('Selecciona el proveedor de la factura.', 'error');
      return;
    }

    if (!invoiceNumber.trim()) {
      showToast('Ingresa el número de factura de compra.', 'error');
      return;
    }

    if (items.length === 0) {
      showToast('Agrega al menos un artículo recibido en la factura.', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const supplierName = currentSupplier?.name || 'Proveedor';
      const purchasePayload: Omit<PurchaseInvoice, 'id'> = {
        invoiceNumber: invoiceNumber.trim(),
        supplierId: selectedSupplierId,
        supplierName,
        date: invoiceDate,
        timestamp: Date.now(),
        paymentCondition,
        dueDate: paymentCondition === 'credit' ? dueDate : undefined,
        items,
        totalItems: totalItemsCount,
        subtotal: itemsSubtotal,
        discount: numericDiscount,
        tax: taxAmount,
        total: invoiceGrandTotal,
        notes: invoiceNotes.trim() || undefined,
        status: 'completed',
        receivedBy: 'Administrador',
      };

      const result = await onRecordPurchase(purchasePayload);
      const recorded: PurchaseInvoice = (result as PurchaseInvoice) || {
        id: Date.now().toString(),
        ...purchasePayload,
      };

      setSelectedInvoiceForModal(recorded);
      setShowInvoiceDetailsModal(true);
      handleClearInvoice();
      showToast(
        `¡Factura ${invoiceNumber} ingresada con éxito! Se sumaron ${totalItemsCount} unidades al inventario.`,
        'success'
      );
    } catch (err: any) {
      console.error('Record purchase error:', err);
      showToast(`Error al ingresar la factura de compra: ${err?.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ------------------ HISTORIAL FILTERING & METRICS ------------------
  const filteredPurchases = useMemo(() => {
    const q = historySearch.trim().toLowerCase();
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return purchases.filter((p) => {
      // Date filter
      if (historyDateFilter === 'today' && p.timestamp < startOfToday) return false;
      if (historyDateFilter === 'week' && p.timestamp < startOfWeek) return false;
      if (historyDateFilter === 'month' && p.timestamp < startOfMonth) return false;

      // Status filter
      if (historyStatusFilter !== 'all' && p.status !== historyStatusFilter) return false;

      // Supplier filter
      if (historySupplierFilter !== 'all' && p.supplierId !== historySupplierFilter) return false;

      // Search query
      if (q) {
        const matchInvoice = p.invoiceNumber.toLowerCase().includes(q);
        const matchSupplier = p.supplierName.toLowerCase().includes(q);
        const matchItem = p.items.some(
          (it) => it.name.toLowerCase().includes(q) || it.code.toLowerCase().includes(q)
        );
        if (!matchInvoice && !matchSupplier && !matchItem) return false;
      }

      return true;
    });
  }, [purchases, historySearch, historySupplierFilter, historyStatusFilter, historyDateFilter]);

  // Overall metrics for purchases
  const purchaseMetrics = useMemo(() => {
    const validPurchases = filteredPurchases.filter((p) => p.status === 'completed');
    const totalSpent = validPurchases.reduce((sum, p) => sum + p.total, 0);
    const totalUnits = validPurchases.reduce((sum, p) => sum + p.totalItems, 0);
    const activeSuppliersSet = new Set(validPurchases.map((p) => p.supplierId));

    return {
      count: validPurchases.length,
      totalSpent,
      totalUnits,
      activeSuppliersCount: activeSuppliersSet.size,
      cancelledCount: filteredPurchases.filter((p) => p.status === 'cancelled').length,
    };
  }, [filteredPurchases]);

  // Handle Cancel Purchase Invoice
  const handleConfirmCancelPurchase = async () => {
    if (!invoiceToCancel) return;
    setIsCancelling(true);
    try {
      await onCancelPurchase(invoiceToCancel);
      showToast(
        `Factura ${invoiceToCancel.invoiceNumber} anulada. Se descontaron las ${invoiceToCancel.totalItems} unidades del inventario.`,
        'success'
      );
      setInvoiceToCancel(null);
    } catch (err: any) {
      console.error('Cancel purchase error:', err);
      showToast(`Error al anular la factura: ${err?.message || err}`, 'error');
    } finally {
      setIsCancelling(false);
    }
  };

  // Export Purchases to CSV
  const handleExportCSV = () => {
    if (filteredPurchases.length === 0) {
      showToast('No hay facturas de compra para exportar.', 'warning');
      return;
    }

    const headers = [
      'N° Factura',
      'Proveedor',
      'Fecha',
      'Condición',
      'Vencimiento',
      'Artículos (Cant)',
      'Subtotal (L)',
      'Descuento (L)',
      'ISV (L)',
      'Total Factura (L)',
      'Estado',
      'Detalle Mercadería',
    ];

    const rows = filteredPurchases.map((p) => [
      `"${p.invoiceNumber}"`,
      `"${p.supplierName}"`,
      `"${p.date}"`,
      `"${p.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}"`,
      `"${p.dueDate || ''}"`,
      p.totalItems,
      p.subtotal.toFixed(2),
      p.discount.toFixed(2),
      p.tax.toFixed(2),
      p.total.toFixed(2),
      `"${p.status === 'completed' ? 'Ingresada' : 'Anulada'}"`,
      `"${p.items.map((it) => `${it.quantity}x ${it.name} (${it.code}) @ L.${it.cost.toFixed(2)}`).join('; ')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `facturas_compra_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Reporte de compras exportado a CSV.', 'success');
  };

  // Print voucher
  const handlePrintReceipt = () => {
    if (!receiptPrintRef.current) return;
    const printContents = receiptPrintRef.current.innerHTML;
    const printWindow = window.open('', '_blank', 'width=550,height=750');
    if (printWindow) {
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Comprobante de Ingreso de Factura - ${selectedInvoiceForModal?.invoiceNumber}</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; font-size: 13px; line-height: 1.4; }
              .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 16px; }
              .title { font-size: 18px; font-weight: bold; color: #0f172a; margin-bottom: 4px; }
              .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 16px; }
              .table { width: 100%; border-collapse: collapse; margin-top: 12px; }
              .table th { background: #f8fafc; border-bottom: 2px solid #cbd5e1; padding: 6px; text-align: left; font-size: 11px; text-transform: uppercase; }
              .table td { border-bottom: 1px solid #f1f5f9; padding: 6px; font-size: 12px; }
              .text-right { text-align: right; }
              .font-bold { font-weight: bold; }
              .totals { margin-top: 16px; border-top: 2px solid #e2e8f0; padding-top: 10px; }
              @media print { body { padding: 0; } }
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

  // Send purchase invoice summary to supplier or manager via WhatsApp
  const handleSendInvoiceWhatsApp = () => {
    if (!selectedInvoiceForModal) return;
    const inv = selectedInvoiceForModal;
    const sName = (storeSettings.storeName || 'TIENDA GOSÉN').toUpperCase();

    let text = `📦 *${sName}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📋 *COMPROBANTE DE FACTURA DE COMPRA*\n`;
    text += `*N° Factura:* ${inv.invoiceNumber}\n`;
    text += `*Proveedor:* ${inv.supplierName}\n`;
    text += `*Fecha:* ${inv.date}\n`;
    text += `*Condición de Pago:* ${inv.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}\n`;
    if (inv.dueDate) {
      text += `*Vencimiento:* ${inv.dueDate}\n`;
    }
    if (inv.status === 'cancelled') {
      text += `\n⚠️ *FACTURA ANULADA - STOCK RESTAURADO*\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📦 *PRODUCTOS RECIBIDOS (${inv.totalItems} unidades):*\n`;

    inv.items.forEach((it) => {
      text += `• *${it.quantity}x* ${it.name}\n`;
      text += `  ↳ Subtotal: L. ${it.subtotal.toFixed(2)} _(Costo: L. ${it.cost.toFixed(2)} c/u)_\n`;
    });

    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `*Subtotal:* L. ${inv.subtotal.toFixed(2)}\n`;
    if (inv.discount > 0) {
      text += `*Descuento:* - L. ${inv.discount.toFixed(2)}\n`;
    }
    if (inv.tax > 0) {
      text += `*15% ISV:* L. ${inv.tax.toFixed(2)}\n`;
    }
    text += `*TOTAL FACTURA:* L. ${inv.total.toFixed(2)}\n`;
    if (inv.notes) {
      text += `*Observaciones:* ${inv.notes}\n`;
    }

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('Abriendo WhatsApp con el resumen de la factura...', 'success');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-hidden">
      {/* Top Header & Sub-Tab Switcher */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-6 py-2 sm:py-3.5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 sm:gap-3 shrink-0 shadow-xs">
        <div>
          <h1 className="text-base sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-indigo-600 shrink-0" />
            <span>Facturas de Compra a Proveedores</span>
          </h1>
          <p className="hidden sm:block text-xs text-slate-500 mt-0.5">
            Ingreso y recepción de mercadería con incremento automático al stock actual de inventario.
          </p>
        </div>

        {/* View Switcher Tabs */}
        <div className="grid grid-cols-2 sm:flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveSubTab('create')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'create'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Ingresar Factura</span>
            {items.length > 0 && (
              <span className="bg-white text-indigo-700 text-[10px] sm:text-[11px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
                {totalItemsCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveSubTab('history')}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              activeSubTab === 'history'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span className="truncate">Historial Facturas</span>
            <span className="bg-slate-200 text-slate-700 text-[10px] sm:text-[11px] font-bold px-1.5 py-0.2 rounded-full shrink-0">
              {purchases.length}
            </span>
          </button>
        </div>
      </div>

      {/* Main Content */}
      {activeSubTab === 'create' ? (
        /* ==================== CREATE PURCHASE INVOICE VIEW ==================== */
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-6 space-y-4 sm:space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Invoice Header & Product Details Table */}
            <div className="lg:col-span-2 space-y-5">
              {/* Card 1: Datos de la Factura y Proveedor */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Building className="w-4 h-4 text-indigo-600" />
                    <span>1. Datos del Proveedor y Factura</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewSupplierModal(true)}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Registrar Proveedor Nuevo</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Supplier Dropdown */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Proveedor <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-800"
                    >
                      <option value="">-- Seleccionar Proveedor --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} {s.contact ? `(${s.contact})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Invoice Number */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      N° Factura de Compra <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ej. 001-002-01-000456"
                      value={invoiceNumber}
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold text-slate-800"
                    />
                  </div>

                  {/* Invoice Date */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Fecha de Factura <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      value={invoiceDate}
                      onChange={(e) => setInvoiceDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 font-medium"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                  {/* Payment Condition */}
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Condición de Pago
                    </label>
                    <select
                      value={paymentCondition}
                      onChange={(e) => setPaymentCondition(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                    >
                      <option value="cash">Contado (Efectivo / Transferencia)</option>
                      <option value="credit">Crédito</option>
                    </select>
                  </div>

                  {/* Due Date if Credit */}
                  {paymentCondition === 'credit' && (
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        Fecha de Vencimiento
                      </label>
                      <input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-amber-900 font-medium"
                      />
                    </div>
                  )}

                  {/* Notes */}
                  <div className={paymentCondition === 'credit' ? '' : 'sm:col-span-2'}>
                    <label className="block font-bold text-slate-700 mb-1">
                      Observaciones / Notas (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Orden de compra #12, entrega en almacén principal"
                      value={invoiceNotes}
                      onChange={(e) => setInvoiceNotes(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Detalle de Artículos Recibidos */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <Package className="w-4 h-4 text-indigo-600" />
                    <span>2. Artículos a Ingresar al Inventario</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowNewProductModal(true)}
                    className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>+ Crear Producto Nuevo No Existente</span>
                  </button>
                </div>

                {/* Quick Product Search Bar with Dropdown */}
                <div className="relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Buscar producto por código o nombre para agregarlo a la factura..."
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setShowProductDropdown(true);
                    }}
                    onFocus={() => setShowProductDropdown(true)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />

                  {/* Autocomplete Dropdown */}
                  {showProductDropdown && matchingProducts.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-60 overflow-y-auto divide-y divide-slate-100">
                      {matchingProducts.map((p) => (
                        <div
                          key={p.code}
                          onClick={() => handleAddProductToInvoice(p)}
                          className="p-3 hover:bg-indigo-50/70 transition-colors cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-slate-900 block">{p.name}</span>
                            <div className="flex items-center gap-2 text-slate-500 mt-0.5">
                              <span className="font-mono">{p.code}</span>
                              <span>•</span>
                              <span>Stock Actual: <strong>{p.stock}</strong></span>
                              {p.size && <span>• Talla: {p.size}</span>}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[11px] text-slate-400 block">Costo Actual</span>
                            <span className="font-bold text-indigo-700">L. {(Number(p.cost) || 0).toFixed(2)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Items Table */}
                {items.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl">
                    <Package className="w-10 h-10 mx-auto mb-2 text-slate-300 stroke-1" />
                    <p className="font-semibold text-slate-700 text-sm">No hay artículos en la factura</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                      Busca un producto existente en el catálogo arriba o utiliza "+ Crear Producto Nuevo" para agregar mercadería recibida.
                    </p>
                  </div>
                ) : (
                  <div>
                    {/* Mobile Items List (< sm) */}
                    <div className="sm:hidden space-y-2.5">
                      {items.map((it) => {
                        const existingProd = inventory.find((p) => p.code === it.code);
                        const currentStock = existingProd ? Number(existingProd.stock) || 0 : 0;
                        const finalStock = currentStock + it.quantity;

                        return (
                          <div
                            key={it.code}
                            className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="font-bold text-slate-900 text-sm block">{it.name}</span>
                                <div className="text-[11px] text-slate-400 font-mono">
                                  {it.code} {it.size ? `• Talla: ${it.size}` : ''}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(it.code)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>

                            {/* Stock progression */}
                            <div className="flex items-center justify-between bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                              <span className="text-slate-500 font-medium">Stock:</span>
                              <span className="font-semibold text-slate-700">{currentStock}</span>
                              <span className="text-slate-400">➔</span>
                              <span className="font-bold text-emerald-700 flex items-center gap-0.5">
                                <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                                {finalStock} final
                              </span>
                            </div>

                            {/* Quantity and cost inputs */}
                            <div className="grid grid-cols-2 gap-2 pt-1">
                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                  Cantidad
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  value={it.quantity}
                                  onChange={(e) =>
                                    handleUpdateItemQuantity(it.code, parseInt(e.target.value) || 1)
                                  }
                                  className="w-full px-2.5 py-1.5 text-center font-bold bg-white border border-slate-300 rounded-lg"
                                />
                              </div>

                              <div>
                                <label className="block text-[10px] font-bold uppercase text-slate-500 mb-0.5">
                                  Costo Compra (L)
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.cost}
                                  onChange={(e) =>
                                    handleUpdateItemCost(it.code, parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full px-2.5 py-1.5 text-right font-bold text-slate-900 bg-white border border-slate-300 rounded-lg"
                                />
                              </div>
                            </div>

                            {/* Subtotal */}
                            <div className="flex items-center justify-between pt-1 border-t border-slate-200/80 font-bold">
                              <span className="text-slate-600">Subtotal Artículo:</span>
                              <span className="text-indigo-800 text-sm">L. {it.subtotal.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Desktop / Tablet Table (>= sm) */}
                    <div className="hidden sm:block overflow-x-auto border border-slate-200 rounded-xl">
                      <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                        <tr>
                          <th className="py-2.5 px-3">Producto / Código</th>
                          <th className="py-2.5 px-3 text-center">Stock Actual</th>
                          <th className="py-2.5 px-3 text-center w-24">Cantidad</th>
                          <th className="py-2.5 px-3 text-center">Stock Final</th>
                          <th className="py-2.5 px-3 text-right w-28">Costo Compra (L)</th>
                          <th className="py-2.5 px-3 text-right w-28">Precio Venta (L)</th>
                          <th className="py-2.5 px-3 text-right">Subtotal</th>
                          <th className="py-2.5 px-2 text-center w-10"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-slate-700">
                        {items.map((it) => {
                          const existingProd = inventory.find((p) => p.code === it.code);
                          const currentStock = existingProd ? Number(existingProd.stock) || 0 : 0;
                          const finalStock = currentStock + it.quantity;

                          return (
                            <tr key={it.code} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-2.5 px-3 font-medium">
                                <div className="font-bold text-slate-900">{it.name}</div>
                                <div className="text-[10px] text-slate-400 font-mono">
                                  {it.code} {it.size ? `• Talla: ${it.size}` : ''}
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-mono font-semibold">
                                  {currentStock}
                                </span>
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="number"
                                  min="1"
                                  value={it.quantity}
                                  onChange={(e) =>
                                    handleUpdateItemQuantity(it.code, parseInt(e.target.value) || 1)
                                  }
                                  className="w-16 px-2 py-1 text-center font-bold bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                <span className="bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-mono font-bold flex items-center justify-center gap-1">
                                  <ArrowUpRight className="w-3 h-3 text-emerald-600" />
                                  <span>{finalStock}</span>
                                </span>
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={it.cost}
                                  onChange={(e) =>
                                    handleUpdateItemCost(it.code, parseFloat(e.target.value) || 0)
                                  }
                                  className="w-24 px-2 py-1 text-right font-bold text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>

                              <td className="py-2.5 px-3 text-right">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  placeholder={it.salePrice ? String(it.salePrice) : 'Opcional'}
                                  value={it.salePrice || ''}
                                  onChange={(e) =>
                                    handleUpdateItemSalePrice(it.code, parseFloat(e.target.value) || 0)
                                  }
                                  className="w-24 px-2 py-1 text-right font-medium text-emerald-700 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                              </td>

                              <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                                L. {it.subtotal.toFixed(2)}
                              </td>

                              <td className="py-2.5 px-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItem(it.code)}
                                  className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                                  title="Quitar artículo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
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

            {/* Right 1 Col: Summary & Confirmation Card */}
            <div className="space-y-5">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-md space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-900 pb-3 border-b border-slate-100">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>Resumen de la Factura de Compra</span>
                </div>

                {/* Information Callout */}
                <div className="p-3 bg-indigo-50/70 border border-indigo-200 rounded-xl text-xs text-indigo-950 space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-indigo-900">
                    <Info className="w-4 h-4 text-indigo-600" />
                    <span>Afectación del Inventario</span>
                  </div>
                  <p className="text-[11px] text-indigo-800 leading-relaxed">
                    Al confirmar esta factura, se <strong>sumará automáticamente</strong> la cantidad de cada artículo al stock de tu inventario en Firestore y se actualizará el costo unitario.
                  </p>
                </div>

                {/* Totals Breakdown */}
                <div className="space-y-2 text-xs text-slate-600 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between">
                    <span>Artículos en Factura:</span>
                    <span className="font-bold text-slate-900">
                      {totalItemsCount} {totalItemsCount === 1 ? 'unidad' : 'unidades'} ({items.length} modelos)
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Subtotal de Compra:</span>
                    <span className="font-semibold text-slate-900">
                      L. {itemsSubtotal.toFixed(2)}
                    </span>
                  </div>

                  {/* Supplier Discount */}
                  <div className="flex items-center justify-between">
                    <span>Descuento Proveedor:</span>
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400">L.</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(e.target.value)}
                        className="w-20 px-2 py-0.5 text-right font-medium bg-slate-50 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  {/* Tax Checkbox */}
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={applyTax}
                        onChange={(e) => setApplyTax(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>Incluir 15% ISV</span>
                    </label>
                    {applyTax && (
                      <span className="font-semibold text-slate-800">
                        L. {taxAmount.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Grand Total */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                    <span className="text-sm font-bold text-slate-900">TOTAL FACTURA:</span>
                    <span className="text-xl font-extrabold text-indigo-700">
                      L. {invoiceGrandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="space-y-2 pt-2">
                  <button
                    type="button"
                    onClick={handleSubmitInvoice}
                    disabled={isSubmitting || items.length === 0 || !invoiceNumber.trim() || !selectedSupplierId}
                    className={`w-full py-3 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-md cursor-pointer ${
                      isSubmitting || items.length === 0 || !invoiceNumber.trim() || !selectedSupplierId
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30 active:scale-[0.99]'
                    }`}
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Cargando al inventario...</span>
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5" />
                        <span>Ingresar Factura y Cargar Stock</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleClearInvoice}
                    className="w-full py-2 px-3 rounded-xl font-semibold text-xs text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer text-center"
                  >
                    Limpiar Formulario
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* ==================== INVOICE HISTORY VIEW ==================== */
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Total Comprado</span>
                <span className="text-lg sm:text-2xl font-bold text-indigo-700">
                  L. {purchaseMetrics.totalSpent.toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600">
                <DollarSign className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Facturas Ingresadas</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-900">
                  {purchaseMetrics.count}
                </span>
                {purchaseMetrics.cancelledCount > 0 && (
                  <span className="text-[10px] text-rose-500 block">
                    ({purchaseMetrics.cancelledCount} anuladas)
                  </span>
                )}
              </div>
              <div className="p-2.5 bg-blue-50 rounded-xl text-blue-600">
                <FileText className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Unidades Recibidas</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-900">
                  {purchaseMetrics.totalUnits}
                </span>
              </div>
              <div className="p-2.5 bg-purple-50 rounded-xl text-purple-600">
                <Package className="w-5 h-5" />
              </div>
            </div>

            <div className="p-4 bg-white rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Proveedores</span>
                <span className="text-lg sm:text-2xl font-bold text-slate-900">
                  {purchaseMetrics.activeSuppliersCount}
                </span>
              </div>
              <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
                <Truck className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por N° Factura, proveedor o producto..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
              {/* Supplier Filter */}
              <select
                value={historySupplierFilter}
                onChange={(e) => setHistorySupplierFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Todos los Proveedores</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Status Filter */}
              <select
                value={historyStatusFilter}
                onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-slate-700 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="all">Estado: Todos</option>
                <option value="completed">Ingresadas</option>
                <option value="cancelled">Anuladas</option>
              </select>

              {/* Date Filter */}
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
                  onClick={() => setHistoryDateFilter('week')}
                  className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                    historyDateFilter === 'week'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Semana
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
                  Todas
                </button>
              </div>

              {/* Export to CSV */}
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg border border-slate-200 transition-colors cursor-pointer"
                title="Exportar compras a CSV"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar</span>
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
            {filteredPurchases.length === 0 ? (
              <div className="p-12 text-center text-slate-400">
                <FileText className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
                <p className="font-semibold text-slate-700 text-base">No hay facturas de compra registradas</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Utiliza la pestaña "Ingresar Factura" para registrar compras recibidas de tus proveedores.
                </p>
              </div>
            ) : (
              <div>
                {/* Mobile Purchase Card List (< sm) */}
                <div className="sm:hidden divide-y divide-slate-100 p-2 space-y-2.5">
                  {filteredPurchases.map((purchase) => {
                    const isCancelled = purchase.status === 'cancelled';
                    return (
                      <div
                        key={purchase.id}
                        className={`p-3.5 rounded-xl border border-slate-200/90 shadow-2xs space-y-2 bg-white ${
                          isCancelled ? 'bg-rose-50/30 border-rose-200' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono font-bold text-xs text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                            {purchase.invoiceNumber}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              isCancelled ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isCancelled ? 'Anulada' : 'Ingresada'}
                          </span>
                        </div>

                        <div className="flex items-baseline justify-between">
                          <div>
                            <div className="font-bold text-sm text-slate-900">
                              {purchase.supplierName}
                            </div>
                            <div className="text-[11px] text-slate-400 mt-0.5">
                              {purchase.date} · {purchase.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-slate-400 block">Total Factura</span>
                            <span
                              className={`text-base font-black ${
                                isCancelled ? 'line-through text-slate-400' : 'text-indigo-700'
                              }`}
                            >
                              L. {purchase.total.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-500">
                          <span className="flex items-center gap-1 font-medium">
                            <Package className="w-3.5 h-3.5 text-slate-400" />
                            {purchase.totalItems} unidades ({purchase.items.length} modelos)
                          </span>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedInvoiceForModal(purchase);
                                setShowInvoiceDetailsModal(true);
                              }}
                              className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg flex items-center gap-1 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver</span>
                            </button>
                            {!isCancelled && (
                              <button
                                type="button"
                                onClick={() => setInvoiceToCancel(purchase)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                                title="Anular factura"
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
                      <th className="py-3 px-4">N° Factura</th>
                      <th className="py-3 px-4">Proveedor</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Condición</th>
                      <th className="py-3 px-4">Artículos Recibidos</th>
                      <th className="py-3 px-4 text-right">Total Factura</th>
                      <th className="py-3 px-4 text-center">Estado</th>
                      <th className="py-3 px-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredPurchases.map((purchase) => {
                      const isCancelled = purchase.status === 'cancelled';

                      return (
                        <tr
                          key={purchase.id}
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isCancelled ? 'bg-rose-50/40 text-slate-400' : ''
                          }`}
                        >
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {purchase.invoiceNumber}
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-900">
                            {purchase.supplierName}
                          </td>
                          <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                            {purchase.date}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                purchase.paymentCondition === 'credit'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {purchase.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}
                            </span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full text-xs">
                              <Package className="w-3 h-3 text-slate-500" />
                              {purchase.totalItems} {purchase.totalItems === 1 ? 'unidad' : 'unidades'} ({purchase.items.length} modelos)
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            <span className={isCancelled ? 'line-through text-slate-400' : 'text-indigo-700'}>
                              L. {purchase.total.toFixed(2)}
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
                              {isCancelled ? 'Anulada' : 'Ingresada'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* View detail modal */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedInvoiceForModal(purchase);
                                  setShowInvoiceDetailsModal(true);
                                }}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                title="Ver comprobante de recepción"
                              >
                                <Eye className="w-4 h-4" />
                              </button>

                              {/* Cancel invoice button */}
                              {!isCancelled && (
                                <button
                                  type="button"
                                  onClick={() => setInvoiceToCancel(purchase)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="Anular factura y descontar stock"
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

      {/* ==================== INVOICE DETAILS & RECEIPT MODAL ==================== */}
      {showInvoiceDetailsModal && selectedInvoiceForModal && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[88dvh] sm:max-h-[90vh]">
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-900 text-xs sm:text-sm truncate">Comprobante de Recepción de Compra</h3>
                  <span className="text-[11px] text-slate-500 font-mono block truncate">
                    Factura #{selectedInvoiceForModal.invoiceNumber}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setShowInvoiceDetailsModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Printable Body */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5 space-y-3">
              <div
                ref={receiptPrintRef}
                className="p-3 sm:p-4 bg-white border border-slate-200 rounded-xl text-xs text-slate-800 space-y-3 shadow-2xs"
              >
                {/* Header */}
                <div className="text-center pb-3 border-b border-slate-200 space-y-1">
                  {(storeSettings.logoUrl || '/store-logo.jpg') && (
                    <div className="flex justify-center mb-1.5">
                      <img
                        src={storeSettings.logoUrl || '/store-logo.jpg'}
                        alt={storeSettings.storeName || 'Tienda Gosén'}
                        className="w-12 h-12 rounded-xl object-contain border border-slate-200 bg-white p-0.5 shadow-2xs"
                      />
                    </div>
                  )}
                  <h2 className="font-extrabold text-sm sm:text-base text-slate-900 uppercase break-words">
                    {storeSettings.storeName || 'Tienda Gosén'}
                  </h2>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-semibold uppercase tracking-wider">
                    COMPROBANTE DE INGRESO DE MERCADERÍA / COMPRA
                  </p>
                  {storeSettings.address && (
                    <p className="text-[10px] text-slate-400 break-words">{storeSettings.address}</p>
                  )}
                </div>

                {/* Metadata Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pb-3 border-b border-slate-200">
                  <div className="flex sm:block justify-between gap-2">
                    <span className="text-slate-400">Proveedor:</span>
                    <span className="font-bold text-slate-900 text-right sm:text-left break-words">{selectedInvoiceForModal.supplierName}</span>
                  </div>
                  <div className="flex sm:block justify-between gap-2">
                    <span className="text-slate-400">N° Factura:</span>
                    <span className="font-mono font-bold text-slate-900 text-right sm:text-left break-all">{selectedInvoiceForModal.invoiceNumber}</span>
                  </div>
                  <div className="flex sm:block justify-between gap-2">
                    <span className="text-slate-400">Fecha de Compra:</span>
                    <span className="text-right sm:text-left">{selectedInvoiceForModal.date}</span>
                  </div>
                  <div className="flex sm:block justify-between gap-2">
                    <span className="text-slate-400">Condición de Pago:</span>
                    <span className="capitalize text-right sm:text-left">
                      {selectedInvoiceForModal.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}
                      {selectedInvoiceForModal.dueDate ? ` (Vence: ${selectedInvoiceForModal.dueDate})` : ''}
                    </span>
                  </div>
                  {selectedInvoiceForModal.status === 'cancelled' && (
                    <div className="sm:col-span-2 text-center py-1 text-rose-600 font-bold border border-rose-300 rounded bg-rose-50 my-1">
                      *** FACTURA ANULADA - STOCK RESTAURADO ***
                    </div>
                  )}
                </div>

                {/* Items List (Responsive for both mobile and print) */}
                <div className="space-y-2 pb-2 border-b border-slate-200">
                  <div className="flex justify-between text-[10px] font-bold uppercase text-slate-500 border-b pb-1 border-slate-200">
                    <span>Cant / Producto Recibido</span>
                    <span>Total Costo</span>
                  </div>
                  {selectedInvoiceForModal.items.map((it, idx) => (
                    <div key={idx} className="flex items-start justify-between gap-2 text-[11px] py-1 border-b border-slate-100 last:border-b-0">
                      <div className="flex-1 min-w-0 break-words leading-snug">
                        <span className="font-bold text-indigo-700">{it.quantity}x</span>{' '}
                        <span className="font-semibold text-slate-900">{it.name}</span>
                        {it.size ? ` (Talla: ${it.size})` : ''}
                        <div className="text-[10px] text-slate-500 font-mono">
                          Código: {it.code} • Costo Unit: L. {it.cost.toFixed(2)}
                        </div>
                      </div>
                      <span className="font-bold text-slate-900 shrink-0">
                        L. {it.subtotal.toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Financial Summary */}
                <div className="space-y-1 text-[11px] pt-1">
                  <div className="flex justify-between">
                    <span>Subtotal de Mercadería:</span>
                    <span>L. {selectedInvoiceForModal.subtotal.toFixed(2)}</span>
                  </div>
                  {selectedInvoiceForModal.discount > 0 && (
                    <div className="flex justify-between text-rose-600">
                      <span>Descuento Proveedor:</span>
                      <span>- L. {selectedInvoiceForModal.discount.toFixed(2)}</span>
                    </div>
                  )}
                  {selectedInvoiceForModal.tax > 0 && (
                    <div className="flex justify-between">
                      <span>15% ISV:</span>
                      <span>L. {selectedInvoiceForModal.tax.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-bold text-sm text-slate-900 border-t border-slate-300 pt-1.5">
                    <span>TOTAL FACTURA:</span>
                    <span className="text-indigo-700">L. {selectedInvoiceForModal.total.toFixed(2)}</span>
                  </div>
                </div>

                {/* Footer notes */}
                {selectedInvoiceForModal.notes && (
                  <div className="p-2 bg-slate-50 rounded text-[10px] text-slate-500 border border-slate-200 break-words">
                    <span className="font-bold">Observaciones:</span> {selectedInvoiceForModal.notes}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSendInvoiceWhatsApp}
                className="flex-1 py-2.5 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-all"
                title="Compartir comprobante de compra por WhatsApp"
              >
                <WhatsAppIcon className="w-4 h-4 fill-white shrink-0" />
                <span className="truncate">Enviar WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handlePrintReceipt}
                className="py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shrink-0"
                title="Imprimir comprobante físico"
              >
                <Printer className="w-4 h-4" />
                <span>Imprimir</span>
              </button>
              <button
                type="button"
                onClick={() => setShowInvoiceDetailsModal(false)}
                className="py-2.5 px-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs cursor-pointer shrink-0"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== NEW PRODUCT MODAL ==================== */}
      {showNewProductModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Crear Producto Nuevo</h3>
              </div>
              <button
                onClick={() => setShowNewProductModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddNewProductModal} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Código de Barra / SKU <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej. CAM-001"
                    value={newProdCode}
                    onChange={(e) => setNewProdCode(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Categoría
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Ropa, Calzado"
                    value={newProdCategory}
                    onChange={(e) => setNewProdCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre del Producto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Camisa Polo Casual Azul"
                  value={newProdName}
                  onChange={(e) => setNewProdName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Talla (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. M, L, 38"
                    value={newProdSize}
                    onChange={(e) => setNewProdSize(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Costo Compra (L)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newProdCost}
                    onChange={(e) => setNewProdCost(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Precio Venta (L)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newProdPrice}
                    onChange={(e) => setNewProdPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Cantidad Recibida en esta Factura <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={newProdQty}
                  onChange={(e) => setNewProdQty(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewProductModal(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer shadow-sm"
                >
                  Agregar a Factura
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== QUICK ADD SUPPLIER MODAL ==================== */}
      {showNewSupplierModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Truck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900 text-sm">Registrar Proveedor</h3>
              </div>
              <button
                onClick={() => setShowNewSupplierModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleQuickAddSupplier} className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Nombre de la Empresa / Proveedor <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="ej. Distribuidora Textil S.A."
                  value={newSupplierName}
                  onChange={(e) => setNewSupplierName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Contacto / Vendedor
                </label>
                <input
                  type="text"
                  placeholder="ej. Juan Pérez"
                  value={newSupplierContact}
                  onChange={(e) => setNewSupplierContact(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Teléfono
                </label>
                <input
                  type="text"
                  placeholder="ej. 9876-5432"
                  value={newSupplierPhone}
                  onChange={(e) => setNewSupplierPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowNewSupplierModal(false)}
                  className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-xl font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold cursor-pointer shadow-sm"
                >
                  Guardar Proveedor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================== CONFIRM CANCEL PURCHASE DIALOG ==================== */}
      <ConfirmDialog
        isOpen={Boolean(invoiceToCancel)}
        title="¿Anular Factura de Compra y Restar Stock?"
        message={`¿Estás seguro de anular la factura ${invoiceToCancel?.invoiceNumber} del proveedor ${invoiceToCancel?.supplierName}? Se descontarán automáticamente ${invoiceToCancel?.totalItems} unidades ingresadas de tu inventario actual.`}
        confirmLabel={isCancelling ? 'Anulando...' : 'Sí, Anular Factura'}
        cancelLabel="No, Conservar"
        isDestructive={true}
        onConfirm={handleConfirmCancelPurchase}
        onCancel={() => setInvoiceToCancel(null)}
      />
    </div>
  );
};
