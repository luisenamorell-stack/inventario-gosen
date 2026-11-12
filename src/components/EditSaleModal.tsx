import React, { useState, useEffect, useMemo } from 'react';
import {
  SaleRecord,
  SaleItem,
  Product,
  StoreSettings,
  resolveInvoiceIssuerName,
} from '../types';
import {
  X,
  Save,
  User,
  Phone,
  FileText,
  Plus,
  Minus,
  Trash2,
  Search,
  Lock,
  ShieldCheck,
  AlertTriangle,
  Package,
  DollarSign,
  CreditCard,
  Building,
  RotateCcw,
} from 'lucide-react';

interface EditSaleModalProps {
  isOpen: boolean;
  sale: SaleRecord | null;
  inventory: Product[];
  storeSettings: StoreSettings;
  isAdmin: boolean;
  canCancelSales: boolean;
  userName: string;
  onClose: () => void;
  onSaveEditedSale: (originalSale: SaleRecord, updatedSale: SaleRecord) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const EditSaleModal: React.FC<EditSaleModalProps> = ({
  isOpen,
  sale,
  inventory,
  storeSettings,
  isAdmin,
  canCancelSales,
  userName,
  onClose,
  onSaveEditedSale,
  showToast,
}) => {
  const [customerName, setCustomerName] = useState('');
  const [customerRtn, setCustomerRtn] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [cashierName, setCashierName] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'credit' | 'other'>('cash');
  const [amountPaid, setAmountPaid] = useState('');
  const [creditDueDate, setCreditDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [discount, setDiscount] = useState('0');
  const [applyTax, setApplyTax] = useState(false);
  const [items, setItems] = useState<SaleItem[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (sale && isOpen) {
      setCustomerName(sale.customerName || 'Consumidor Final');
      setCustomerRtn(sale.customerRtn || '');
      setCustomerPhone(sale.customerPhone || '');
      setCashierName(
        resolveInvoiceIssuerName(
          sale.cashier,
          storeSettings.invoiceTemplate?.defaultIssuerName,
          userName || 'Administrador'
        )
      );
      setPaymentMethod(sale.paymentMethod || 'cash');
      setAmountPaid(String(sale.amountPaid ?? sale.total ?? 0));
      setCreditDueDate(sale.creditDueDate || '');
      setNotes(sale.notes || '');
      setDiscount(String(sale.discount || 0));
      setApplyTax((sale.tax || 0) > 0);
      setItems(
        (sale.items || []).map((it) => ({
          ...it,
          quantity: Math.max(1, Number(it.quantity) || 1),
          price: Number(it.price) || 0,
          subtotal: (Number(it.price) || 0) * Math.max(1, Number(it.quantity) || 1),
        }))
      );
      setProductSearch('');
      setAdminPasswordInput('');
    }
  }, [sale, isOpen, storeSettings.invoiceTemplate?.defaultIssuerName, userName]);

  const subtotal = useMemo(
    () => items.reduce((acc, it) => acc + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0),
    [items]
  );

  const numericDiscount = Math.min(subtotal, Math.max(0, Number(discount) || 0));
  const taxableAmount = Math.max(0, subtotal - numericDiscount);
  const tax = applyTax ? Number((taxableAmount * 0.15).toFixed(2)) : 0;
  const newTotal = Number((taxableAmount + tax).toFixed(2));

  // Detect whether items were reduced or total was lowered compared to original sale
  const isReducingSaleOrItems = useMemo(() => {
    if (!sale) return false;
    if (newTotal < sale.total - 0.01) return true;
    for (const origItem of sale.items || []) {
      const currentItem = items.find(
        (i) => i.code.trim().toLowerCase() === origItem.code.trim().toLowerCase()
      );
      if (!currentItem || currentItem.quantity < origItem.quantity) {
        return true;
      }
    }
    return false;
  }, [sale, items, newTotal]);

  const requiresAdminPin = !isAdmin && !canCancelSales && isReducingSaleOrItems;

  const matchingInventoryProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return inventory
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.code.toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [inventory, productSearch]);

  if (!isOpen || !sale) return null;

  const handleUpdateQty = (code: string, delta: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.code !== code) return it;
        const origQty =
          (sale.items || []).find((o) => o.code.trim().toLowerCase() === code.trim().toLowerCase())
            ?.quantity || 0;
        const prodInInv = inventory.find(
          (p) => p.code.trim().toLowerCase() === code.trim().toLowerCase()
        );
        const maxAvailable = (Number(prodInInv?.stock) || 0) + origQty;
        const nextQty = Math.max(1, it.quantity + delta);
        if (delta > 0 && nextQty > maxAvailable) {
          showToast(`Stock máximo disponible para ${it.name}: ${maxAvailable}`, 'warning');
          return it;
        }
        return {
          ...it,
          quantity: nextQty,
          subtotal: Number((it.price * nextQty).toFixed(2)),
        };
      })
    );
  };

  const handleRemoveItem = (code: string) => {
    if (items.length <= 1) {
      showToast('La factura debe tener al menos 1 artículo. Si deseas cancelarla usa Anular Venta.', 'warning');
      return;
    }
    setItems((prev) => prev.filter((it) => it.code !== code));
  };

  const handleAddProductToInvoice = (prod: Product) => {
    const existing = items.find((i) => i.code.trim().toLowerCase() === prod.code.trim().toLowerCase());
    const origQty =
      (sale.items || []).find((o) => o.code.trim().toLowerCase() === prod.code.trim().toLowerCase())
        ?.quantity || 0;
    const maxAvailable = (Number(prod.stock) || 0) + origQty;
    const currentQty = existing ? existing.quantity : 0;

    if (currentQty + 1 > maxAvailable) {
      showToast(`No hay stock suficiente de "${prod.name}" (Disponible: ${maxAvailable}).`, 'warning');
      return;
    }

    const unitDiscount = Math.min(Number(prod.price) || 0, Math.max(0, Number(prod.discount) || 0));
    const finalUnitPrice = Math.max(0, (Number(prod.price) || 0) - unitDiscount);

    if (existing) {
      handleUpdateQty(existing.code, 1);
    } else {
      setItems((prev) => [
        ...prev,
        {
          productId: prod.id,
          code: prod.code,
          name: prod.name,
          category: prod.category,
          size: prod.size || '',
          originalPrice: Number(prod.price) || 0,
          unitDiscount,
          price: finalUnitPrice,
          cost: Number(prod.cost) || 0,
          quantity: 1,
          subtotal: finalUnitPrice,
        },
      ]);
    }
    setProductSearch('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      showToast('La venta debe contener al menos un artículo.', 'error');
      return;
    }

    if (requiresAdminPin) {
      const expectedPass = (
        storeSettings.accessPassword ||
        ((storeSettings.companyId || 'gosen') === 'gosen' ? 'GOSEN2026' : 'ADMIN2026')
      ).trim();
      if (adminPasswordInput.trim().toUpperCase() !== expectedPass.toUpperCase()) {
        showToast('Contraseña de Administrador incorrecta para autorizar reducción de venta.', 'error');
        return;
      }
    }

    const parsedPaid =
      paymentMethod === 'credit'
        ? Math.min(newTotal, Math.max(0, Number(amountPaid) || 0))
        : Math.max(newTotal, Number(amountPaid) || newTotal);
    const change = paymentMethod === 'cash' ? Math.max(0, parsedPaid - newTotal) : 0;
    const balanceDue = paymentMethod === 'credit' ? Math.max(0, newTotal - parsedPaid) : 0;

    const updatedSale: SaleRecord = {
      ...sale,
      customerName: customerName.trim() || 'Consumidor Final',
      customerRtn: customerRtn.trim(),
      customerPhone: customerPhone.trim(),
      cashier: cashierName.trim() || sale.cashier || 'Administrador',
      paymentMethod,
      items,
      totalItems: items.reduce((acc, it) => acc + it.quantity, 0),
      subtotal,
      discount: numericDiscount,
      tax,
      total: newTotal,
      amountPaid: parsedPaid,
      change,
      balanceDue,
      creditStatus: paymentMethod === 'credit' ? (balanceDue <= 0.01 ? 'paid' : 'pending') : 'paid',
      creditDueDate: paymentMethod === 'credit' ? creditDueDate : '',
      notes: notes.trim(),
      lastEditedBy: requiresAdminPin ? `${userName} (Autorizado por Admin)` : userName,
      lastEditedAt: new Date().toLocaleString(),
    };

    setIsSaving(true);
    try {
      await onSaveEditedSale(sale, updatedSale);
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center font-bold shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-sm sm:text-lg text-white truncate">
                  Editar Factura / Venta
                </h3>
                <span className="font-mono text-xs font-black bg-indigo-500/30 text-indigo-200 px-2 py-0.5 rounded-lg border border-indigo-400/30">
                  {sale.saleNumber}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 truncate">
                Corrige datos del cliente, quién genera la factura, método de pago o artículos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex-1 min-h-0 overflow-y-auto scroll-container p-4 sm:p-6 space-y-5">
            {/* Customer & Issuer Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                  Nombre del Cliente
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Consumidor Final"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-emerald-700 mb-1">
                  Factura Generada / Atendida por
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cashierName}
                    onChange={(e) => setCashierName(e.target.value)}
                    placeholder="Nombre de quien genera la factura"
                    className="w-full pl-8 pr-3 py-2 bg-emerald-50/50 border border-emerald-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                  RTN Cliente
                </label>
                <input
                  type="text"
                  value={customerRtn}
                  onChange={(e) => setCustomerRtn(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                  Teléfono / WhatsApp
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Ej. 9999-9999"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Payment Method & Amount Paid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1.5">
                  Método de Pago
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'cash', label: 'Efectivo', icon: DollarSign },
                    { id: 'card', label: 'Tarjeta', icon: CreditCard },
                    { id: 'transfer', label: 'Transf.', icon: Building },
                    { id: 'credit', label: 'Crédito', icon: User },
                  ].map((pm) => {
                    const Icon = pm.icon;
                    const active = paymentMethod === pm.id;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setPaymentMethod(pm.id as any)}
                        className={`py-2 px-2 rounded-xl border text-[11px] font-bold flex flex-col items-center justify-center gap-1 cursor-pointer transition-all ${
                          active
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{pm.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    {paymentMethod === 'credit' ? 'Abono Inicial Recibido (L.)' : 'Monto Recibido (L.)'}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Nota / Observación de la Venta
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Opcional (ej. cambio de talla, nota de entrega...)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Items List & Stock Auto-Adjustment */}
            <div className="space-y-3 pt-3 border-t border-slate-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-600" />
                    <span>Artículos de la Factura ({items.reduce((a, b) => a + b.quantity, 0)} uds.)</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Si cambias cantidades o agregas productos, el stock se ajustará automáticamente.
                  </p>
                </div>

                {/* Add product search input */}
                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => setProductSearch(e.target.value)}
                    placeholder="Agregar producto por nombre/código..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  {matchingInventoryProducts.length > 0 && (
                    <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {matchingInventoryProducts.map((p) => (
                        <button
                          key={p.code}
                          type="button"
                          onClick={() => handleAddProductToInvoice(p)}
                          className="w-full px-3 py-2 text-left text-xs hover:bg-indigo-50 flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate">{p.name}</div>
                            <div className="text-[10px] text-slate-400 font-mono">
                              {p.code} • Stock: {p.stock}
                            </div>
                          </div>
                          <span className="font-bold text-emerald-700 shrink-0">
                            + L. {Number(p.price).toFixed(2)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-slate-50/50">
                {items.map((item) => (
                  <div
                    key={item.code}
                    className="p-2.5 sm:p-3 flex items-center justify-between gap-2 bg-white hover:bg-slate-50/80"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-slate-900 truncate">
                        {item.name}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {item.code} {item.size ? `• Talla: ${item.size}` : ''} • L. {item.price.toFixed(2)} c/u
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.code, -1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="w-7 text-center font-extrabold text-xs text-slate-900">
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleUpdateQty(item.code, 1)}
                        className="w-7 h-7 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 flex items-center justify-center text-slate-700 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right w-20 shrink-0">
                      <span className="font-extrabold text-xs text-slate-900">
                        L. {(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleRemoveItem(item.code)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Quitar artículo de la factura"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Totals & Discount Row */}
              <div className="p-3.5 rounded-2xl bg-slate-900 text-white flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400">Descuento (L.):</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-20 px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-white font-bold text-xs focus:outline-none focus:border-emerald-400"
                    />
                  </div>
                  <label className="flex items-center gap-1.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={applyTax}
                      onChange={(e) => setApplyTax(e.target.checked)}
                      className="rounded text-emerald-500 w-3.5 h-3.5"
                    />
                    <span className="text-slate-300 font-semibold">+15% ISV</span>
                  </label>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 border-slate-800 pt-2 sm:pt-0">
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase">Total Anterior</span>
                    <span className="font-mono text-xs font-bold text-slate-300">
                      L. {sale.total.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-emerald-400 block uppercase font-bold">
                      Nuevo Total Factura
                    </span>
                    <span className="font-mono text-base font-black text-emerald-400">
                      L. {newTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Admin PIN Security Gate if Collaborator tries to reduce items/total */}
            {requiresAdminPin && (
              <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-300 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <Lock className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-950">
                    <div className="font-extrabold">
                      Autorización de Administrador Requerida
                    </div>
                    <p className="text-[11px] text-amber-800 mt-0.5">
                      Como estás reduciendo artículos o disminuyendo el monto de una venta ya cobrada, ingresa la contraseña del Administrador para autorizar el cambio:
                    </p>
                  </div>
                </div>
                <input
                  type="password"
                  required
                  value={adminPasswordInput}
                  onChange={(e) => setAdminPasswordInput(e.target.value)}
                  placeholder="Ingresa la contraseña de Administrador..."
                  className="w-full px-3.5 py-2 bg-white border border-amber-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
            >
              <Save className="w-4 h-4 shrink-0" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Cambios en Factura'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface AdminCancelAuthModalProps {
  isOpen: boolean;
  sale: SaleRecord | null;
  storeSettings: StoreSettings;
  onClose: () => void;
  onAuthorizedCancel: (sale: SaleRecord) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const AdminCancelAuthModal: React.FC<AdminCancelAuthModalProps> = ({
  isOpen,
  sale,
  storeSettings,
  onClose,
  onAuthorizedCancel,
  showToast,
}) => {
  const [adminPin, setAdminPin] = useState('');

  useEffect(() => {
    if (isOpen) setAdminPin('');
  }, [isOpen]);

  if (!isOpen || !sale) return null;

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    const expectedPass = (
      storeSettings.accessPassword ||
      ((storeSettings.companyId || 'gosen') === 'gosen' ? 'GOSEN2026' : 'ADMIN2026')
    ).trim();

    if (adminPin.trim().toUpperCase() !== expectedPass.toUpperCase()) {
      showToast('Contraseña de Administrador incorrecta. No se anuló la venta.', 'error');
      return;
    }

    onClose();
    onAuthorizedCancel(sale);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base text-white">
                Autorización de Administrador
              </h3>
              <p className="text-[11px] text-slate-300">
                Se requiere clave de Administrador para anular ventas
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleVerify} className="p-5 space-y-4">
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1">
            <div className="font-extrabold flex items-center gap-1.5 text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Solicitud para Anular Venta {sale.saleNumber}</span>
            </div>
            <p className="text-[11px] text-rose-700">
              Cliente: <strong>{sale.customerName || 'Consumidor Final'}</strong> • Total:{' '}
              <strong>L. {sale.total.toFixed(2)}</strong>
            </p>
          </div>

          <div>
            <label className="block text-xs font-extrabold uppercase text-slate-700 mb-1.5">
              Contraseña Master del Administrador
            </label>
            <input
              type="password"
              required
              autoFocus
              value={adminPin}
              onChange={(e) => setAdminPin(e.target.value)}
              placeholder="Ingresa la clave del Administrador..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 bg-white text-slate-700 font-bold text-xs hover:bg-slate-100 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Autorizar y Continuar</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
