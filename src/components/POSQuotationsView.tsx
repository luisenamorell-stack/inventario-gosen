import React, { useMemo, useState } from 'react';
import {
  PosQuotationRecord,
  StoreSettings,
  PrinterPaperFormat,
} from '../types';
import {
  buildPosQuotationWhatsAppText,
  downloadPosQuotationPdf,
  buildPosQuotationPrintHtml,
  getPreferredPrinterFormat,
} from '../utils/printPdfService';
import { PrintFormatModal } from './PrintFormatModal';
import { ConfirmDialog } from './ConfirmDialog';
import {
  Clock,
  FileText,
  MessageCircle,
  Printer,
  Search,
  Trash2,
  X,
  ArrowRight,
  ShoppingCart,
  CheckCircle2,
  Ban,
  User,
  Phone,
  Loader2,
  RotateCcw,
} from 'lucide-react';

interface SaveQuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultCustomerName: string;
  defaultCustomerPhone: string;
  defaultCustomerRtn: string;
  defaultCustomerAddress: string;
  defaultNotes: string;
  itemsCount: number;
  paymentMode: 'cash' | 'card' | 'transfer' | 'credit';
  cashTotal: number;
  creditTotal: number;
  creditDownPayment: number;
  creditInstallments: number;
  creditInstallmentAmount: number;
  creditFrequency: 'daily' | 'weekly' | 'biweekly' | 'monthly';
  resumedQuotationNumber?: string | null;
  isSaving?: boolean;
  onSaveQuotation: (opts: {
    customerName: string;
    customerPhone: string;
    customerRtn: string;
    customerAddress: string;
    validDays: number;
    notes: string;
    afterAction: 'none' | 'pdf' | 'whatsapp';
    saveAsNew?: boolean;
  }) => Promise<void>;
}

export const SaveQuotationModal: React.FC<SaveQuotationModalProps> = ({
  isOpen,
  onClose,
  defaultCustomerName,
  defaultCustomerPhone,
  defaultCustomerRtn,
  defaultCustomerAddress,
  defaultNotes,
  itemsCount,
  paymentMode,
  cashTotal,
  creditTotal,
  creditDownPayment,
  creditInstallments,
  creditInstallmentAmount,
  creditFrequency,
  resumedQuotationNumber,
  isSaving = false,
  onSaveQuotation,
}) => {
  const [customerName, setCustomerName] = useState(() =>
    defaultCustomerName && defaultCustomerName.trim().toLowerCase() !== 'consumidor final'
      ? defaultCustomerName
      : ''
  );
  const [customerPhone, setCustomerPhone] = useState(defaultCustomerPhone || '');
  const [customerRtn, setCustomerRtn] = useState(defaultCustomerRtn || '');
  const [customerAddress, setCustomerAddress] = useState(defaultCustomerAddress || '');
  const [validDays, setValidDays] = useState<number>(7);
  const [notes, setNotes] = useState(defaultNotes || '');
  const [saveAsNew, setSaveAsNew] = useState<boolean>(false);

  if (!isOpen) return null;

  const isCredit = paymentMode === 'credit';
  const freqWord =
    creditFrequency === 'daily'
      ? 'diarias'
      : creditFrequency === 'weekly'
      ? 'semanales'
      : creditFrequency === 'biweekly'
      ? 'quincenales'
      : 'mensuales';

  const handleSubmitAction = async (afterAction: 'none' | 'pdf' | 'whatsapp') => {
    await onSaveQuotation({
      customerName: customerName.trim() || 'Cliente por confirmar',
      customerPhone: customerPhone.trim(),
      customerRtn: customerRtn.trim(),
      customerAddress: customerAddress.trim(),
      validDays,
      notes: notes.trim(),
      afterAction,
      saveAsNew,
    });
  };

  return (
    <div className="fixed inset-0 z-[150] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[92dvh]">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-extrabold tracking-tight flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {resumedQuotationNumber && !saveAsNew
                  ? `Actualizar Cotización ${resumedQuotationNumber}`
                  : 'Guardar Cotización / Factura en Espera'}
              </span>
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              No descuenta inventario ni registra cobro hasta que el cliente confirme.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 overflow-y-auto scroll-container">
          {/* Summary Strip */}
          <div
            className={`p-3.5 rounded-xl border ${
              isCredit
                ? 'bg-amber-50/80 border-amber-200'
                : 'bg-emerald-50/70 border-emerald-200'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-700 font-semibold">
                <span>{itemsCount} {itemsCount === 1 ? 'artículo' : 'artículos'}</span>
                <span className="mx-1.5 text-slate-400" aria-hidden="true">·</span>
                <span className={isCredit ? 'text-amber-900 font-bold' : 'text-emerald-800 font-bold'}>
                  {isCredit ? 'Plan al Crédito / Fiado' : 'Contado'}
                </span>
              </div>
              <div className="text-base font-black text-slate-900 tabular-nums">
                L.&nbsp;{(isCredit ? creditTotal : cashTotal).toFixed(2)}
              </div>
            </div>

            {isCredit && (
              <div className="mt-2 pt-2 border-t border-amber-200/80 text-[11px] text-amber-950 flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
                <span>
                  Prima: <strong>L.&nbsp;{creditDownPayment.toFixed(2)}</strong>
                </span>
                <span>
                  Saldo a financiar:{' '}
                  <strong>L.&nbsp;{Math.max(0, creditTotal - creditDownPayment).toFixed(2)}</strong>
                </span>
                <span>
                  Cuotas:{' '}
                  <strong>
                    {creditInstallments} {freqWord} de L.&nbsp;{creditInstallmentAmount.toFixed(2)}
                  </strong>
                </span>
              </div>
            )}
          </div>

          {resumedQuotationNumber && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={saveAsNew}
                onChange={(e) => setSaveAsNew(e.target.checked)}
                className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <span>Guardar como una cotización nueva (sin sobrescribir {resumedQuotationNumber})</span>
            </label>
          )}

          {/* Customer Fields */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nombre del Cliente
              </label>
              <input
                type="text"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                placeholder="Ej. María López (o dejar vacío como Cliente por confirmar)"
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Teléfono / WhatsApp
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="Ej. 9988-7766"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Vigencia de la Cotización
                </label>
                <select
                  value={validDays}
                  onChange={(e) => setValidDays(Number(e.target.value) || 7)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 cursor-pointer"
                >
                  <option value={3}>3 días</option>
                  <option value={7}>7 días (Recomendado)</option>
                  <option value={15}>15 días</option>
                  <option value={30}>30 días</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Identidad / RTN (Opcional)
                </label>
                <input
                  type="text"
                  value={customerRtn}
                  onChange={(e) => setCustomerRtn(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                />
              </div>

              {isCredit && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dirección (Opcional)
                  </label>
                  <input
                    type="text"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder="Colonia / Barrio..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500"
                  />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Nota / Detalle de Espera (Opcional)
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej. Cliente confirma mañana a las 3 PM o espera aprobación del crédito..."
                className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500 resize-none"
              />
            </div>
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={isSaving}
            onClick={onClose}
            className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSubmitAction('pdf')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs sm:text-sm font-bold cursor-pointer"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
            ) : (
              <FileText className="w-4 h-4 text-amber-300 shrink-0" />
            )}
            <span>Guardar + PDF</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSubmitAction('whatsapp')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs sm:text-sm font-bold cursor-pointer"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>Guardar + WhatsApp</span>
          </button>

          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSubmitAction('none')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs sm:text-sm font-extrabold cursor-pointer shadow-xs"
          >
            <Clock className="w-4 h-4 shrink-0" />
            <span>Solo Dejar en Espera</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface POSQuotationsTabProps {
  quotations: PosQuotationRecord[];
  storeSettings: StoreSettings;
  onResumeInPos: (quote: PosQuotationRecord) => void;
  onCancelQuotation: (quote: PosQuotationRecord) => Promise<void>;
  onDeleteQuotation: (quote: PosQuotationRecord) => Promise<void>;
  onGoToPos: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const POSQuotationsTab: React.FC<POSQuotationsTabProps> = ({
  quotations,
  storeSettings,
  onResumeInPos,
  onCancelQuotation,
  onDeleteQuotation,
  onGoToPos,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'pending' | 'converted' | 'cancelled' | 'all'>(
    'pending'
  );
  const [modeFilter, setModeFilter] = useState<'all' | 'cash' | 'credit'>('all');
  const [quoteToPrint, setQuoteToPrint] = useState<PosQuotationRecord | null>(null);
  const [quoteToDelete, setQuoteToDelete] = useState<PosQuotationRecord | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const metrics = useMemo(() => {
    const pending = quotations.filter((q) => q.status === 'pending');
    const converted = quotations.filter((q) => q.status === 'converted');
    const cancelled = quotations.filter((q) => q.status === 'cancelled');
    const pendingTotalAmount = pending.reduce(
      (sum, q) =>
        sum + (q.paymentMode === 'credit' ? Number(q.creditTotal || q.cashTotal) : Number(q.cashTotal) || 0),
      0
    );
    return {
      pendingCount: pending.length,
      convertedCount: converted.length,
      cancelledCount: cancelled.length,
      totalCount: quotations.length,
      pendingTotalAmount,
    };
  }, [quotations]);

  const filteredQuotations = useMemo(() => {
    const norm = searchQuery.trim().toLowerCase();
    return quotations.filter((q) => {
      if (statusFilter !== 'all' && q.status !== statusFilter) return false;
      if (modeFilter === 'credit' && q.paymentMode !== 'credit') return false;
      if (modeFilter === 'cash' && q.paymentMode === 'credit') return false;
      if (!norm) return true;
      const haystack = [
        q.quotationNumber,
        q.customerName,
        q.customerPhone || '',
        q.customerRtn || '',
        q.createdBy || '',
        q.notes || '',
        ...(q.items || []).map((i) => `${i.name} ${i.code}`),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(norm);
    });
  }, [quotations, statusFilter, modeFilter, searchQuery]);

  const freqLabelFor = (freq?: 'daily' | 'weekly' | 'biweekly' | 'monthly') => {
    if (freq === 'daily') return 'diarias';
    if (freq === 'biweekly') return 'quincenales';
    if (freq === 'monthly') return 'mensuales';
    return 'semanales';
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-32 md:pb-20">
      <div className="w-full max-w-[1440px] mx-auto space-y-5">
        {/* Header Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 tracking-tight">
              Cotizaciones y Facturas en Espera
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Facturas pendientes de confirmación del cliente (contado o plan al crédito). No descuentan inventario hasta ser facturadas en POS.
            </p>
          </div>
          <button
            type="button"
            onClick={onGoToPos}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
          >
            <ShoppingCart className="w-4 h-4 shrink-0" />
            <span>Ir a Nueva Venta (POS)</span>
          </button>
        </div>

        {/* Clean 3-Card KPI Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-slate-500 block">
                Facturas en Espera
              </span>
              <span className="text-2xl font-extrabold text-amber-700 tabular-nums mt-0.5 block">
                {metrics.pendingCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700 shrink-0">
              <Clock className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-slate-500 block">
                Valor Total en Espera
              </span>
              <span className="text-2xl font-extrabold text-slate-900 tabular-nums mt-0.5 block">
                L.&nbsp;{metrics.pendingTotalAmount.toFixed(2)}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
          </div>

          <div className="p-4 bg-white rounded-xl border border-slate-200 flex items-center justify-between gap-3">
            <div>
              <span className="text-xs font-medium text-slate-500 block">
                Confirmadas y Facturadas
              </span>
              <span className="text-2xl font-extrabold text-emerald-700 tabular-nums mt-0.5 block">
                {metrics.convertedCount}
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </div>
        </div>

        {/* Search & Filter Toolbar */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por N° COT, cliente, teléfono, vendedor o artículo..."
                className="w-full pl-10 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Status Filter Segmented Bar */}
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 gap-0.5">
                {(
                  [
                    { id: 'pending', label: `En Espera (${metrics.pendingCount})` },
                    { id: 'converted', label: `Facturadas (${metrics.convertedCount})` },
                    { id: 'cancelled', label: `Canceladas (${metrics.cancelledCount})` },
                    { id: 'all', label: `Todas (${metrics.totalCount})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setStatusFilter(tab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      statusFilter === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Modality Filter Segmented Bar */}
              <div className="inline-flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 gap-0.5">
                {(
                  [
                    { id: 'all', label: 'Todos los Planes' },
                    { id: 'cash', label: 'Contado' },
                    { id: 'credit', label: 'Al Crédito' },
                  ] as const
                ).map((mTab) => (
                  <button
                    key={mTab.id}
                    type="button"
                    onClick={() => setModeFilter(mTab.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      modeFilter === mTab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mTab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Quotations List */}
        {filteredQuotations.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-2xl p-8 sm:p-12 text-center">
            <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3 stroke-1.5" />
            <h3 className="text-base font-bold text-slate-800">
              {quotations.length === 0
                ? 'Aún no hay cotizaciones ni facturas en espera'
                : 'No hay cotizaciones con el filtro seleccionado'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-md mx-auto">
              Cuando estés armando una factura en el POS (de contado o con plan al crédito) y el cliente aún no confirme, presiona «En Espera / Cotizar» para guardarla aquí y retomarla cuando confirme.
            </p>
            <button
              type="button"
              onClick={onGoToPos}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs sm:text-sm font-bold cursor-pointer"
            >
              <ShoppingCart className="w-4 h-4 text-emerald-400" />
              <span>Crear Cotización en POS</span>
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredQuotations.map((q) => {
              const isCredit = q.paymentMode === 'credit';
              const isExpired =
                q.status === 'pending' &&
                Boolean(q.validUntilDate) &&
                String(q.validUntilDate) < todayIso;
              const displayTotal = isCredit
                ? Number(q.creditTotal || q.cashTotal) || 0
                : Number(q.cashTotal) || 0;
              const downPay = Number(q.creditDownPayment) || 0;
              const balanceFin =
                q.creditBalanceToFinance !== undefined
                  ? Number(q.creditBalanceToFinance)
                  : Math.max(0, displayTotal - downPay);
              const instCount = Math.max(1, Number(q.creditInstallments) || 6);
              const instQuota = Number(q.creditInstallmentAmount) || balanceFin / instCount;

              return (
                <div
                  key={q.id}
                  className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3.5"
                >
                  {/* Top Metadata + Primary Total Row */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {q.quotationNumber}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-bold ${
                            q.status === 'pending'
                              ? isExpired
                                ? 'text-rose-700'
                                : 'text-amber-700'
                              : q.status === 'converted'
                              ? 'text-emerald-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {q.status === 'pending'
                            ? isExpired
                              ? 'En Espera (Vencida)'
                              : 'En Espera'
                            : q.status === 'converted'
                            ? `Facturada${q.convertedSaleNumber ? ` (${q.convertedSaleNumber})` : ''}`
                            : 'Cancelada'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className={isCredit ? 'font-bold text-amber-800' : 'font-semibold text-slate-700'}>
                          {isCredit ? 'Plan al Crédito' : 'Contado'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{q.dateFormatted}</span>
                        {q.validUntilDate && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className={`tabular-nums ${isExpired ? 'text-rose-600 font-semibold' : ''}`}>
                              Válida hasta {q.validUntilDate}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-bold text-slate-900 pt-0.5">
                        <span className="inline-flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{q.customerName}</span>
                        </span>
                        {q.customerPhone && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 tabular-nums">
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>{q.customerPhone}</span>
                          </span>
                        )}
                        <span className="text-xs font-medium text-slate-500">
                          Por: {q.createdBy}
                        </span>
                      </div>
                    </div>

                    <div className="md:text-right shrink-0">
                      <span className="text-[11px] font-medium text-slate-500 block">
                        {isCredit ? 'Total al Crédito' : 'Total Contado'}
                      </span>
                      <span className="text-xl font-black text-slate-900 tabular-nums">
                        L.&nbsp;{displayTotal.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Item List */}
                  <div className="border-t border-b border-slate-100 py-2.5 space-y-1.5">
                    {(q.items || []).map((it, idx) => {
                      const unitVal =
                        isCredit && it.creditPrice && it.creditPrice > 0 ? it.creditPrice : it.price;
                      return (
                        <div
                          key={`${q.id}-${it.code}-${idx}`}
                          className="flex items-center justify-between gap-2 text-xs sm:text-sm"
                        >
                          <div className="min-w-0 text-slate-700 truncate">
                            <strong className="text-slate-900 tabular-nums mr-1.5">
                              {it.quantity}×
                            </strong>
                            <span>{it.name}</span>
                            {it.size && (
                              <span className="text-slate-400 ml-1.5 text-xs">
                                ({it.size})
                              </span>
                            )}
                            <span className="text-slate-400 font-mono text-[11px] ml-2">
                              {it.code}
                            </span>
                          </div>
                          <div className="font-bold text-slate-900 tabular-nums shrink-0">
                            L.&nbsp;{(unitVal * it.quantity).toFixed(2)}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Credit Plan Summary Strip when applicable */}
                  {isCredit && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-xs tabular-nums">
                      <div>
                        <span className="text-slate-500 block text-[11px]">Contado Ref.</span>
                        <strong className="text-slate-900">L.&nbsp;{q.cashTotal.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Prima / Enganche</span>
                        <strong className="text-slate-900">L.&nbsp;{downPay.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span className="text-slate-500 block text-[11px]">Saldo a Financiar</span>
                        <strong className="text-slate-900">L.&nbsp;{balanceFin.toFixed(2)}</strong>
                      </div>
                      <div>
                        <span className="text-amber-800 font-semibold block text-[11px]">
                          Plan Estipulado
                        </span>
                        <strong className="text-amber-950">
                          {instCount} cuotas {freqLabelFor(q.creditFrequency)} de L.&nbsp;
                          {instQuota.toFixed(2)}
                        </strong>
                      </div>
                    </div>
                  )}

                  {q.notes && (
                    <p className="text-xs text-slate-600">
                      <strong className="text-slate-800">Nota:</strong> {q.notes}
                    </p>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onResumeInPos(q)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {q.status === 'pending' ? (
                          <>
                            <ArrowRight className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>Retomar en POS y Facturar</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                            <span>Cargar de Nuevo en POS</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={exportingId === q.id}
                        onClick={async () => {
                          setExportingId(q.id);
                          try {
                            await downloadPosQuotationPdf(q, storeSettings);
                            showToast(`PDF de ${q.quotationNumber} descargado.`, 'success');
                          } catch {
                            showToast('No se pudo generar el PDF de la cotización.', 'error');
                          } finally {
                            setExportingId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {exportingId === q.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                        ) : (
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setQuoteToPrint(q)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>Imprimir</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const text = buildPosQuotationWhatsAppText(q, storeSettings);
                          const cleanDigits = (q.customerPhone || '').replace(/\D/g, '');
                          const url =
                            cleanDigits.length >= 8
                              ? `https://api.whatsapp.com/send?phone=${
                                  cleanDigits.length === 8 ? `504${cleanDigits}` : cleanDigits
                                }&text=${encodeURIComponent(text)}`
                              : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
                          const link = document.createElement('a');
                          link.href = url;
                          link.target = '_blank';
                          link.rel = 'noopener noreferrer';
                          document.body.appendChild(link);
                          link.click();
                          document.body.removeChild(link);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>WhatsApp</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 ml-auto">
                      {q.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => onCancelQuotation(q)}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs font-semibold cursor-pointer whitespace-nowrap"
                          title="Marcar cotización como cancelada"
                        >
                          <Ban className="w-3.5 h-3.5 shrink-0" />
                          <span>Cancelar</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setQuoteToDelete(q)}
                        className="p-2 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                        title="Eliminar cotización"
                        aria-label="Eliminar cotización"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Print Format Modal for Quotation */}
      <PrintFormatModal
        isOpen={Boolean(quoteToPrint)}
        onClose={() => setQuoteToPrint(null)}
        title={
          quoteToPrint
            ? `Imprimir Cotización ${quoteToPrint.quotationNumber}`
            : 'Imprimir Cotización'
        }
        subtitle={
          quoteToPrint
            ? `${quoteToPrint.customerName} • ${
                quoteToPrint.paymentMode === 'credit' ? 'Plan al Crédito' : 'Contado'
              }`
            : undefined
        }
        storeSettings={storeSettings}
        defaultFormat={getPreferredPrinterFormat(storeSettings)}
        buildHtml={(fmt: PrinterPaperFormat) =>
          quoteToPrint ? buildPosQuotationPrintHtml(quoteToPrint, storeSettings, fmt) : ''
        }
        onDownloadPdf={() => {
          if (!quoteToPrint) return;
          downloadPosQuotationPdf(quoteToPrint, storeSettings).catch(() => {});
          setQuoteToPrint(null);
        }}
        showToast={showToast}
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={Boolean(quoteToDelete)}
        title="¿Eliminar Cotización?"
        message={`¿Seguro que deseas eliminar la cotización ${quoteToDelete?.quotationNumber} de ${quoteToDelete?.customerName}? Esta acción no afecta el inventario.`}
        confirmLabel="Sí, Eliminar"
        cancelLabel="Conservar"
        isDestructive={true}
        onConfirm={async () => {
          if (quoteToDelete) {
            await onDeleteQuotation(quoteToDelete);
            setQuoteToDelete(null);
          }
        }}
        onCancel={() => setQuoteToDelete(null)}
      />
    </div>
  );
};
