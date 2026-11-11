import React, { useState } from 'react';
import {
  StoreSettings,
  InvoiceTemplateConfig,
  InvoiceTemplateStyle,
  getDefaultInvoiceTemplate,
  getEffectiveInvoiceTemplate,
} from '../types';
import {
  FileText,
  Sparkles,
  CheckCircle2,
  Eye,
  Printer,
  ShieldCheck,
  Sliders,
  Type,
  Award,
  RefreshCw,
  Landmark,
  QrCode,
  PenTool,
  UserCheck,
  X,
} from 'lucide-react';

interface InvoiceTemplateEditorProps {
  storeName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
  storeRtn?: string;
  receiptFooterText: string;
  onChangeReceiptFooterText: (text: string) => void;
  invoiceTemplate: InvoiceTemplateConfig;
  onChangeInvoiceTemplate: (next: InvoiceTemplateConfig) => void;
  bankAccountsCount?: number;
  onQuickSave?: (nextTemplate: InvoiceTemplateConfig, nextFooterText: string) => Promise<void>;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  isModal?: boolean;
  onCloseModal?: () => void;
}

const STYLE_PRESETS: Array<{
  id: InvoiceTemplateStyle;
  title: string;
  badge: string;
  desc: string;
}> = [
  {
    id: 'classic',
    title: 'Clásico Comercial',
    badge: 'Recomendado',
    desc: 'Encabezado formal con franja superior, tabla cuadriculada y recuadro ejecutivo.',
  },
  {
    id: 'modern',
    title: 'Moderno Ejecutivo',
    badge: 'Premium',
    desc: 'Tarjetas estilizadas, bloques suaves de alto contraste y jerarquía limpia.',
  },
  {
    id: 'corporate',
    title: 'Fiscal / SAR Corporativo',
    badge: 'Contable',
    desc: 'Destaca datos fiscales (RTN, CAI, Rango Autorizado) y firmas de conformidad.',
  },
  {
    id: 'minimal',
    title: 'Minimalista Ligero',
    badge: 'Ahorro Tinta',
    desc: 'Sin fondos sólidos oscuros; ideal para impresoras de inyección de tinta o matriz.',
  },
];

const ACCENT_COLOR_SWATCHES = [
  { hex: '#047857', label: 'Esmeralda', bgClass: 'bg-emerald-700', ringClass: 'ring-emerald-600' },
  { hex: '#0f172a', label: 'Pizarra Ejecutivo', bgClass: 'bg-slate-900', ringClass: 'ring-slate-900' },
  { hex: '#1e3a8a', label: 'Azul Corporativo', bgClass: 'bg-blue-900', ringClass: 'ring-blue-800' },
  { hex: '#b45309', label: 'Dorado Comercial', bgClass: 'bg-amber-700', ringClass: 'ring-amber-600' },
  { hex: '#4338ca', label: 'Índigo Real', bgClass: 'bg-indigo-700', ringClass: 'ring-indigo-600' },
  { hex: '#be123c', label: 'Carmesí', bgClass: 'bg-rose-700', ringClass: 'ring-rose-600' },
];

const ISSUER_LABEL_PRESETS = [
  'Atendido por',
  'Generado por',
  'Facturado por',
  'Emitido por',
  'Cajero(a)',
];

export const InvoiceTemplateEditor: React.FC<InvoiceTemplateEditorProps> = ({
  storeName,
  tagline,
  logoUrl,
  phone,
  address,
  storeRtn,
  receiptFooterText,
  onChangeReceiptFooterText,
  invoiceTemplate,
  onChangeInvoiceTemplate,
  bankAccountsCount = 0,
  onQuickSave,
  showToast,
  isModal = false,
  onCloseModal,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'style' | 'fields' | 'fiscal' | 'warranty'>('style');
  const [previewMode, setPreviewMode] = useState<'letter' | 'thermal'>('letter');
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  const effective = getEffectiveInvoiceTemplate({
    storeName: storeName || 'Mi Tienda',
    invoiceTemplate,
  } as StoreSettings);

  const updateField = <K extends keyof InvoiceTemplateConfig>(
    key: K,
    value: InvoiceTemplateConfig[K]
  ) => {
    const nextConfig: InvoiceTemplateConfig = {
      ...effective,
      [key]: value,
    };
    onChangeInvoiceTemplate(nextConfig);
  };

  const updateMultipleFields = (patch: Partial<InvoiceTemplateConfig>) => {
    const nextConfig: InvoiceTemplateConfig = {
      ...effective,
      ...patch,
    };
    onChangeInvoiceTemplate(nextConfig);
  };

  const handleSaveTemplateNow = async () => {
    if (!onQuickSave) return;
    setIsSavingQuick(true);
    try {
      await onQuickSave({ ...effective }, receiptFooterText);
      showToast?.('¡Plantilla de facturas y tickets guardada y aplicada!', 'success');
      if (isModal && onCloseModal) {
        onCloseModal();
      }
    } catch (err: any) {
      showToast?.(`Error al guardar la plantilla: ${err?.message || err}`, 'error');
    } finally {
      setIsSavingQuick(false);
    }
  };

  const handleResetDefaults = () => {
    const defaults = getDefaultInvoiceTemplate({
      storeName: storeName || 'Mi Tienda',
    } as StoreSettings);
    onChangeInvoiceTemplate(defaults);
    onChangeReceiptFooterText('¡Gracias por su compra! Vuelva pronto.');
    showToast?.('Plantilla restaurada al diseño predeterminado', 'info');
  };

  const accentBadgeClass =
    effective.accentColor === '#0f172a'
      ? 'bg-slate-900 text-white border-slate-800'
      : effective.accentColor === '#1e3a8a'
      ? 'bg-blue-900 text-white border-blue-800'
      : effective.accentColor === '#b45309'
      ? 'bg-amber-700 text-white border-amber-600'
      : effective.accentColor === '#4338ca'
      ? 'bg-indigo-700 text-white border-indigo-600'
      : effective.accentColor === '#be123c'
      ? 'bg-rose-700 text-white border-rose-600'
      : 'bg-emerald-700 text-white border-emerald-600';

  const accentBorderClass =
    effective.accentColor === '#0f172a'
      ? 'border-slate-900'
      : effective.accentColor === '#1e3a8a'
      ? 'border-blue-900'
      : effective.accentColor === '#b45309'
      ? 'border-amber-700'
      : effective.accentColor === '#4338ca'
      ? 'border-indigo-700'
      : effective.accentColor === '#be123c'
      ? 'border-rose-700'
      : 'border-emerald-700';

  const accentTextClass =
    effective.accentColor === '#0f172a'
      ? 'text-slate-900'
      : effective.accentColor === '#1e3a8a'
      ? 'text-blue-900'
      : effective.accentColor === '#b45309'
      ? 'text-amber-700'
      : effective.accentColor === '#4338ca'
      ? 'text-indigo-700'
      : effective.accentColor === '#be123c'
      ? 'text-rose-700'
      : 'text-emerald-700';

  return (
    <div
      className={`bg-white rounded-2xl ${
        isModal ? 'p-4 sm:p-6' : 'p-6 shadow-sm border border-slate-200/80'
      } space-y-5`}
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/60 flex items-center justify-center font-bold shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                Plantilla Personalizable de Facturas y Tickets
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                Editable por Tienda
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Personaliza el diseño, quién genera la factura, datos SAR/CAI, garantías y elementos visibles.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold transition-colors cursor-pointer"
          >
            Restaurar Base
          </button>
          {onQuickSave && (
            <button
              type="button"
              onClick={handleSaveTemplateNow}
              disabled={isSavingQuick}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              {isSavingQuick ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Guardando...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Guardar Plantilla</span>
                </>
              )}
            </button>
          )}
          {isModal && onCloseModal && (
            <button
              type="button"
              onClick={onCloseModal}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Cerrar editor"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-navigation Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-slate-100 p-1.5 rounded-xl border border-slate-200/80">
        {[
          { id: 'style' as const, label: '1. Diseño y Emisor', icon: Sliders },
          { id: 'fields' as const, label: '2. Campos Visibles', icon: Eye },
          { id: 'fiscal' as const, label: '3. Datos CAI / SAR', icon: ShieldCheck },
          { id: 'warranty' as const, label: '4. Garantía y Firmas', icon: Award },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                active
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-3.5 h-3.5 shrink-0 ${active ? 'text-emerald-600' : 'text-slate-400'}`} />
              <span className="truncate">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Style, Color, Issuer Name & Titles */}
      {activeSubTab === 'style' && (
        <div className="space-y-4">
          {/* Style Presets */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Estilo Visual de la Factura
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {STYLE_PRESETS.map((preset) => {
                const isSelected = effective.templateStyle === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => updateField('templateStyle', preset.id)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50/70 border-emerald-500 ring-1 ring-emerald-500'
                        : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100/80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-slate-900">{preset.title}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                          isSelected
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-200/80 text-slate-600'
                        }`}
                      >
                        {preset.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{preset.desc}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Color Palette */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Color Principal de Encabezados y Totales (PDF e Impresión)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {ACCENT_COLOR_SWATCHES.map((swatch) => {
                const active = effective.accentColor.toLowerCase() === swatch.hex.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => updateField('accentColor', swatch.hex)}
                    className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                      active
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-full ${swatch.bgClass} shrink-0`} />
                    <span>{swatch.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Highlighted Card: Quien Genera la Factura */}
          <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-950">
                  Nombre de Quien Genera la Factura (Emisor / Cajero)
                </span>
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={Boolean(effective.showSellerName)}
                  onChange={(e) => updateField('showSellerName', e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <span>Mostrar en factura</span>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Nombre de Quien Genera la Factura
                </label>
                <input
                  type="text"
                  value={effective.defaultIssuerName}
                  onChange={(e) => updateField('defaultIssuerName', e.target.value)}
                  placeholder="Ej. Lic. Carlos Mendoza / Caja Principal (o déjalo vacío para usar el usuario activo)"
                  maxLength={70}
                  className="w-full px-3.5 py-2 rounded-xl border border-emerald-300 bg-white focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-900"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Este nombre aparecerá al crear facturas y también podrás editarlo en cada venta o compra.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Etiqueta del Emisor en la Factura
                </label>
                <input
                  type="text"
                  value={effective.issuerLabel}
                  onChange={(e) => updateField('issuerLabel', e.target.value)}
                  placeholder="Atendido por / Generado por / Facturado por"
                  maxLength={35}
                  className="w-full px-3.5 py-2 rounded-xl border border-emerald-300 bg-white focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-900"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {ISSUER_LABEL_PRESETS.map((presetLabel) => (
                    <button
                      key={presetLabel}
                      type="button"
                      onClick={() => updateField('issuerLabel', presetLabel)}
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold border transition-colors cursor-pointer ${
                        effective.issuerLabel === presetLabel
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {presetLabel}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Custom Document Titles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-100">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <Type className="w-3.5 h-3.5 text-slate-400" />
                  <span>Título en Factura de Venta (Contado)</span>
                </span>
                {effective.salesDocumentTitle && (
                  <button
                    type="button"
                    onClick={() => updateField('salesDocumentTitle', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.salesDocumentTitle}
                onChange={(e) => updateField('salesDocumentTitle', e.target.value)}
                placeholder="Sin título (o escribe p.ej. FACTURA COMERCIAL DE VENTA)"
                maxLength={60}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <Type className="w-3.5 h-3.5 text-slate-400" />
                  <span>Título en Factura al Crédito</span>
                </span>
                {effective.creditDocumentTitle && (
                  <button
                    type="button"
                    onClick={() => updateField('creditDocumentTitle', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.creditDocumentTitle}
                onChange={(e) => updateField('creditDocumentTitle', e.target.value)}
                placeholder="Sin título (o escribe p.ej. FACTURA AL CRÉDITO)"
                maxLength={60}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <Printer className="w-3.5 h-3.5 text-slate-400" />
                  <span>Título en Ticket Térmico (80mm / 58mm)</span>
                </span>
                {effective.thermalDocumentTitle && (
                  <button
                    type="button"
                    onClick={() => updateField('thermalDocumentTitle', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.thermalDocumentTitle}
                onChange={(e) => updateField('thermalDocumentTitle', e.target.value)}
                placeholder="Sin título (o escribe p.ej. FACTURA / TICKET)"
                maxLength={40}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Título en Facturas de Compra / Recepción</span>
                </span>
                {effective.purchaseDocumentTitle && (
                  <button
                    type="button"
                    onClick={() => updateField('purchaseDocumentTitle', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.purchaseDocumentTitle}
                onChange={(e) => updateField('purchaseDocumentTitle', e.target.value)}
                placeholder="Sin título (o escribe p.ej. ORDEN DE RECEPCIÓN Y FACTURA DE COMPRA)"
                maxLength={65}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-1">
                <span>Subtítulo o Leyenda Superior en el Encabezado (Opcional)</span>
                {effective.headerCustomNote && (
                  <button
                    type="button"
                    onClick={() => updateField('headerCustomNote', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.headerCustomNote}
                onChange={(e) => updateField('headerCustomNote', e.target.value)}
                placeholder="Ej. Original: Cliente • Copia: Obligado Tributario | Ventas al por mayor y menor"
                maxLength={120}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Visible Fields Toggles */}
      {activeSubTab === 'fields' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Marca o desmarca libremente qué elementos deseas incluir o quitar de tus facturas y tickets:
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  updateMultipleFields({
                    showLogo: true,
                    showTagline: true,
                    showStoreRtn: true,
                    showCustomerRtn: true,
                    showCustomerPhone: true,
                    showSellerName: true,
                    showItemCode: true,
                    showItemDiscount: true,
                    showAmountInWords: true,
                    showQrCode: true,
                    showBankAccounts: true,
                    showSignatureLines: true,
                  })
                }
                className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition-colors cursor-pointer"
              >
                Marcar Todos
              </button>
              <button
                type="button"
                onClick={() =>
                  updateMultipleFields({
                    showTagline: false,
                    showStoreRtn: false,
                    showCustomerRtn: false,
                    showCustomerPhone: false,
                    showSellerName: false,
                    showItemCode: false,
                    showItemDiscount: false,
                    showAmountInWords: false,
                    showQrCode: false,
                    showBankAccounts: false,
                    showSignatureLines: false,
                  })
                }
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[11px] font-bold transition-colors cursor-pointer"
              >
                Dejar Solo Básico
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {(
              [
                {
                  key: 'showLogo' as const,
                  title: 'Mostrar Logotipo de la Tienda',
                  desc: 'Imprime el logo oficial en el encabezado del ticket y PDF.',
                },
                {
                  key: 'showTagline' as const,
                  title: 'Mostrar Eslogan / Giro Comercial',
                  desc: 'Muestra el subtítulo comercial debajo del nombre de la tienda.',
                },
                {
                  key: 'showStoreRtn' as const,
                  title: 'Mostrar RTN de la Tienda',
                  desc: 'Incluye la identificación tributaria del negocio en el encabezado.',
                },
                {
                  key: 'showCustomerRtn' as const,
                  title: 'Mostrar RTN / DNI del Cliente',
                  desc: 'Muestra el renglón de RTN o Identidad del comprador.',
                },
                {
                  key: 'showCustomerPhone' as const,
                  title: 'Mostrar Teléfono del Cliente',
                  desc: 'Imprime el número de contacto del cliente en los datos de venta.',
                },
                {
                  key: 'showSellerName' as const,
                  title: 'Mostrar Quién Genera la Factura (Vendedor / Cajero)',
                  desc: 'Muestra el nombre de la persona que genera o atiende la factura.',
                },
                {
                  key: 'showItemCode' as const,
                  title: 'Mostrar Código SKU del Artículo',
                  desc: 'Muestra el código de referencia junto al nombre de cada producto.',
                },
                {
                  key: 'showItemDiscount' as const,
                  title: 'Mostrar Descuentos por Artículo',
                  desc: 'Detalla el ahorro otorgado por unidad cuando hay rebajas.',
                },
                {
                  key: 'showAmountInWords' as const,
                  title: 'Mostrar Monto Total en Letras',
                  desc: 'Imprime "SON: ... LEMPIRAS EXACTOS" para validez comercial.',
                },
                {
                  key: 'showQrCode' as const,
                  title: 'Mostrar Código QR de Verificación',
                  desc: 'Incluye sello QR con folio y monto en los documentos PDF.',
                },
                {
                  key: 'showBankAccounts' as const,
                  title: `Mostrar Cuentas Bancarias (${bankAccountsCount} configuradas)`,
                  desc: 'Imprime las cuentas bancarias de la tienda para pagos o créditos.',
                },
                {
                  key: 'showSignatureLines' as const,
                  title: 'Mostrar Líneas de Firma',
                  desc: 'Agrega bloques de firma de Entregado y Recibido Conforme.',
                },
              ]
            ).map((item) => {
              const checked = Boolean(effective[item.key]);
              return (
                <label
                  key={item.key}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                    checked
                      ? 'bg-emerald-50/50 border-emerald-300'
                      : 'bg-slate-50/70 border-slate-200 opacity-75 hover:opacity-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => updateField(item.key, e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-bold text-slate-900">{item.title}</span>
                    <span className="block text-[11px] text-slate-500 leading-snug mt-0.5">
                      {item.desc}
                    </span>
                  </div>
                </label>
              );
            })}
          </div>

          {/* Inline Editor for Issuer Name inside Tab 2 as well */}
          {effective.showSellerName && (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-950 mb-1">
                  Nombre de Quien Genera la Factura
                </label>
                <input
                  type="text"
                  value={effective.defaultIssuerName}
                  onChange={(e) => updateField('defaultIssuerName', e.target.value)}
                  placeholder="Ej. Lic. Carlos Mendoza / Caja Principal"
                  maxLength={70}
                  className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-emerald-950 mb-1">
                  Etiqueta en el Documento
                </label>
                <input
                  type="text"
                  value={effective.issuerLabel}
                  onChange={(e) => updateField('issuerLabel', e.target.value)}
                  placeholder="Atendido por / Generado por"
                  maxLength={35}
                  className="w-full px-3 py-2 rounded-xl border border-emerald-300 bg-white text-xs font-bold text-slate-900"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Fiscal / SAR / CAI Data */}
      {activeSubTab === 'fiscal' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <strong>Datos Fiscales / Facturación SAR (Opcional):</strong> Si la tienda emite facturación con CAI autorizado, completa estos campos para que se impriman automáticamente en cada factura y ticket. Si los dejas en blanco, no ocuparán espacio.
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                <span>Número de CAI (Código de Autorización de Impresión)</span>
                {effective.caiNumber && (
                  <button
                    type="button"
                    onClick={() => updateField('caiNumber', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.caiNumber}
                onChange={(e) => updateField('caiNumber', e.target.value)}
                placeholder="Ej. 345ABC-678DEF-901GHI-234JKL-567MNO-89"
                maxLength={80}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                <span>Rango Autorizado de Facturación</span>
                {effective.caiRange && (
                  <button
                    type="button"
                    onClick={() => updateField('caiRange', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.caiRange}
                onChange={(e) => updateField('caiRange', e.target.value)}
                placeholder="Ej. 000-001-01-00000001 al 000-001-01-00005000"
                maxLength={90}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-mono text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                <span>Fecha Límite de Emisión</span>
                {effective.caiExpiryDate && (
                  <button
                    type="button"
                    onClick={() => updateField('caiExpiryDate', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.caiExpiryDate}
                onChange={(e) => updateField('caiExpiryDate', e.target.value)}
                placeholder="Ej. 31/12/2026"
                maxLength={40}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: Warranty, Footer & Signatures */}
      {activeSubTab === 'warranty' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                <span>Saludo Principal al Pie de Factura</span>
                {effective.footerThankYouTitle && (
                  <button
                    type="button"
                    onClick={() => updateField('footerThankYouTitle', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.footerThankYouTitle}
                onChange={(e) => updateField('footerThankYouTitle', e.target.value)}
                placeholder="Sin saludo (o escribe p.ej. ¡GRACIAS POR SU COMPRA!)"
                maxLength={60}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                <span>Mensaje de Despedida al Pie</span>
                {receiptFooterText && (
                  <button
                    type="button"
                    onClick={() => onChangeReceiptFooterText('')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={receiptFooterText}
                onChange={(e) => onChangeReceiptFooterText(e.target.value)}
                placeholder="Sin mensaje (o escribe p.ej. ¡Gracias por su compra! Vuelva pronto.)"
                maxLength={140}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                <span>Título del Bloque de Garantía / Políticas</span>
                {effective.warrantyTitle && (
                  <button
                    type="button"
                    onClick={() => updateField('warrantyTitle', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.warrantyTitle}
                onChange={(e) => updateField('warrantyTitle', e.target.value)}
                placeholder="CONDICIONES Y GARANTÍA"
                maxLength={60}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs font-bold text-slate-800"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between">
                <span>Políticas de Garantía, Cambios o Devoluciones (Opcional)</span>
                {effective.warrantyPolicyText && (
                  <button
                    type="button"
                    onClick={() => updateField('warrantyPolicyText', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <textarea
                rows={2}
                value={effective.warrantyPolicyText}
                onChange={(e) => updateField('warrantyPolicyText', e.target.value)}
                placeholder="Ej. Garantía de 30 días por defectos de fábrica presentando esta factura original. No aplica en artículos eléctricos sin revisión técnica."
                maxLength={350}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs text-slate-800 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <PenTool className="w-3.5 h-3.5 text-slate-400" />
                  <span>Etiqueta de Firma Izquierda (Tienda)</span>
                </span>
                {effective.signatureLeftLabel && (
                  <button
                    type="button"
                    onClick={() => updateField('signatureLeftLabel', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.signatureLeftLabel}
                onChange={(e) => updateField('signatureLeftLabel', e.target.value)}
                placeholder="Firma y Sello Autorizado"
                maxLength={50}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs text-slate-800"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1 flex items-center justify-between gap-1">
                <span className="flex items-center gap-1">
                  <PenTool className="w-3.5 h-3.5 text-slate-400" />
                  <span>Etiqueta de Firma Derecha (Cliente)</span>
                </span>
                {effective.signatureRightLabel && (
                  <button
                    type="button"
                    onClick={() => updateField('signatureRightLabel', '')}
                    className="text-[10px] text-rose-600 hover:underline font-bold cursor-pointer"
                  >
                    Quitar
                  </button>
                )}
              </label>
              <input
                type="text"
                value={effective.signatureRightLabel}
                onChange={(e) => updateField('signatureRightLabel', e.target.value)}
                placeholder="Firma Recibido Conforme Cliente"
                maxLength={50}
                className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-xs text-slate-800"
              />
            </div>
          </div>
        </div>
      )}

      {/* Interactive Live Preview of the Invoice / Ticket */}
      <div className="pt-4 border-t border-slate-200/80 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-black uppercase tracking-wider text-slate-800">
              Vista Previa en Vivo de tu Plantilla
            </span>
          </div>

          <div className="inline-flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setPreviewMode('letter')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                previewMode === 'letter'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Factura Carta / Media Carta
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('thermal')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                previewMode === 'thermal'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Ticket Térmico 80mm
            </button>
          </div>
        </div>

        {previewMode === 'letter' ? (
          /* Formal Commercial Invoice Live Preview */
          <div className="bg-slate-100/90 p-3 sm:p-5 rounded-2xl border border-slate-200/90">
            <div
              className={`bg-white rounded-xl p-4 sm:p-5 shadow-sm border ${
                effective.templateStyle === 'corporate'
                  ? `border-2 ${accentBorderClass}`
                  : 'border-slate-200'
              } space-y-3 text-slate-800`}
            >
              {effective.templateStyle !== 'minimal' && (
                <div className={`h-1.5 rounded-full ${accentBadgeClass}`} />
              )}

              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-slate-200">
                <div className="flex items-center gap-3">
                  {effective.showLogo && (
                    <div className="w-12 h-12 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0 font-black text-slate-700 text-sm">
                      {logoUrl ? (
                        <img src={logoUrl} alt={storeName} className="w-full h-full object-contain p-1" />
                      ) : (
                        (storeName || 'MT').slice(0, 2).toUpperCase()
                      )}
                    </div>
                  )}
                  <div>
                    <h4 className="font-black text-sm sm:text-base uppercase text-slate-900 leading-tight">
                      {storeName || 'Mi Tienda'}
                    </h4>
                    {effective.showTagline && tagline && (
                      <p className="text-[11px] text-slate-500 font-semibold">{tagline}</p>
                    )}
                    {effective.showStoreRtn && (
                      <p className="text-[10px] font-mono text-slate-700">
                        RTN: <strong>{storeRtn || '0801-9999-000000'}</strong>
                      </p>
                    )}
                    <p className="text-[10px] text-slate-500">
                      {[address || 'Dirección Principal', phone ? `Tel: ${phone}` : 'Tel: +504 9999-9999']
                        .filter(Boolean)
                        .join(' • ')}
                    </p>
                    {effective.headerCustomNote && (
                      <p className={`text-[10px] font-bold mt-0.5 ${accentTextClass}`}>
                        {effective.headerCustomNote}
                      </p>
                    )}
                  </div>
                </div>

                <div className="sm:text-right bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shrink-0">
                  {effective.salesDocumentTitle && (
                    <div className={`text-[10px] font-black uppercase ${accentTextClass}`}>
                      {effective.salesDocumentTitle}
                    </div>
                  )}
                  <div className="text-sm font-black font-mono text-slate-900">N° FAC-000128</div>
                  <div className="text-[10px] text-slate-500">Emisión: Hoy, 10:30 AM</div>
                  {effective.caiNumber && (
                    <div className="text-[9px] font-mono text-slate-600 mt-0.5">
                      CAI: {effective.caiNumber}
                    </div>
                  )}
                </div>
              </div>

              {/* CAI range bar if configured */}
              {(effective.caiRange || effective.caiExpiryDate) && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[10px] text-slate-700 font-mono">
                  {effective.caiRange && <span>Rango Autorizado: {effective.caiRange}</span>}
                  {effective.caiExpiryDate && <span>Fecha Límite Emisión: {effective.caiExpiryDate}</span>}
                </div>
              )}

              {/* Customer & Seller Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 text-[11px]">
                <div>
                  <div>
                    <span className="text-slate-500">Cliente:</span>{' '}
                    <strong className="text-slate-900">Comercial Los Pinos S. de R.L.</strong>
                  </div>
                  {effective.showCustomerRtn && (
                    <div>
                      <span className="text-slate-500">RTN / DNI:</span>{' '}
                      <strong className="font-mono">08011990123456</strong>
                    </div>
                  )}
                  {effective.showCustomerPhone && (
                    <div>
                      <span className="text-slate-500">Teléfono:</span> <strong>+504 9876-5432</strong>
                    </div>
                  )}
                </div>
                <div className="sm:text-right">
                  <div>
                    <span className="text-slate-500">Modalidad de Pago:</span>{' '}
                    <strong>Contado / Transferencia</strong>
                  </div>
                  {effective.showSellerName && (
                    <div>
                      <span className="text-slate-500">
                        {effective.issuerLabel || 'Atendido por'}:
                      </span>{' '}
                      <strong>{effective.defaultIssuerName || 'Cajero Principal'}</strong>
                    </div>
                  )}
                </div>
              </div>

              {/* Sample Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead>
                    <tr
                      className={
                        effective.templateStyle === 'minimal'
                          ? 'border-b-2 border-slate-900 text-slate-900'
                          : accentBadgeClass
                      }
                    >
                      {effective.showItemCode && <th className="py-1.5 px-2 text-left">CÓDIGO</th>}
                      <th className="py-1.5 px-2 text-left">DESCRIPCIÓN DEL ARTÍCULO</th>
                      <th className="py-1.5 px-2 text-center">CANT.</th>
                      <th className="py-1.5 px-2 text-right">PRECIO</th>
                      {effective.showItemDiscount && <th className="py-1.5 px-2 text-right">DESC.</th>}
                      <th className="py-1.5 px-2 text-right">SUBTOTAL</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      {effective.showItemCode && (
                        <td className="py-1.5 px-2 font-mono font-bold text-slate-700">ART-101</td>
                      )}
                      <td className="py-1.5 px-2 font-semibold text-slate-900">
                        Artículo de Demostración Premium
                      </td>
                      <td className="py-1.5 px-2 text-center font-bold">2</td>
                      <td className="py-1.5 px-2 text-right">L. 650.00</td>
                      {effective.showItemDiscount && (
                        <td className="py-1.5 px-2 text-right text-rose-600">-L. 50.00</td>
                      )}
                      <td className="py-1.5 px-2 text-right font-bold">L. 1,200.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Bottom Summary */}
              <div className="flex flex-col sm:flex-row justify-between items-start gap-3 pt-2 border-t border-slate-200 text-[11px]">
                <div className="space-y-1.5 flex-1">
                  {effective.showAmountInWords && (
                    <div className="px-2.5 py-1 bg-slate-100 rounded font-bold text-slate-800 text-[10px]">
                      SON: MIL DOSCIENTOS LEMPIRAS CON 00/100
                    </div>
                  )}
                  {effective.warrantyPolicyText && (
                    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[10px] text-slate-600">
                      {effective.warrantyTitle && (
                        <strong className="text-slate-800 block uppercase">
                          {effective.warrantyTitle}:
                        </strong>
                      )}
                      {effective.warrantyPolicyText}
                    </div>
                  )}
                  {effective.showBankAccounts && (
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-800 font-semibold">
                      <Landmark className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span>Se imprimirán las cuentas bancarias activas de la tienda.</span>
                    </div>
                  )}
                  {effective.showQrCode && (
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
                      <QrCode className="w-3.5 h-3.5 text-slate-700 shrink-0" />
                      <span>Código QR de verificación incluido en el PDF.</span>
                    </div>
                  )}
                </div>

                <div className="w-full sm:w-52 bg-slate-50 border border-slate-200 rounded-lg p-2.5 space-y-1">
                  <div className="flex justify-between text-slate-600">
                    <span>Subtotal:</span>
                    <strong>L. 1,200.00</strong>
                  </div>
                  <div className="flex justify-between font-black text-xs pt-1 border-t border-slate-300 text-slate-900">
                    <span>TOTAL NETO:</span>
                    <span className={accentTextClass}>L. 1,200.00</span>
                  </div>
                </div>
              </div>

              {/* Signatures */}
              {effective.showSignatureLines && (
                <div className="grid grid-cols-2 gap-6 pt-5 text-center text-[10px] text-slate-500 font-bold uppercase">
                  <div className="border-t border-slate-400 pt-1">
                    {effective.signatureLeftLabel}
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    {effective.signatureRightLabel}
                  </div>
                </div>
              )}

              {/* Footer */}
              {(effective.footerThankYouTitle || receiptFooterText) && (
                <div className="text-center pt-2 border-t border-dashed border-slate-200 text-[10px] text-slate-500">
                  {effective.footerThankYouTitle && (
                    <div className="font-black text-slate-800">{effective.footerThankYouTitle}</div>
                  )}
                  {receiptFooterText && <div>{receiptFooterText}</div>}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Thermal 80mm Live Preview */
          <div className="bg-slate-100/90 p-3 sm:p-5 rounded-2xl border border-slate-200/90 flex justify-center">
            <div className="w-full max-w-xs bg-white rounded-xl p-4 shadow-sm border border-dashed border-slate-300 font-mono text-[11px] text-slate-800 space-y-2">
              <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-slate-300">
                {effective.showLogo && logoUrl && (
                  <img
                    src={logoUrl}
                    alt={storeName}
                    className="w-10 h-10 object-contain mx-auto mb-1 rounded"
                  />
                )}
                <div className="font-black text-xs uppercase text-slate-900">
                  {storeName || 'Mi Tienda'}
                </div>
                {effective.showTagline && tagline && (
                  <div className="text-[10px] text-slate-500">{tagline}</div>
                )}
                {effective.showStoreRtn && (
                  <div className="text-[10px] font-bold">RTN: {storeRtn || '0801-9999-000000'}</div>
                )}
                {effective.headerCustomNote && (
                  <div className="text-[9.5px] text-slate-600">{effective.headerCustomNote}</div>
                )}
                {effective.caiNumber && (
                  <div className="text-[9px] text-slate-600">CAI: {effective.caiNumber}</div>
                )}
              </div>

              <div className="space-y-0.5 text-[10px] pb-2 border-b border-dashed border-slate-300">
                {effective.thermalDocumentTitle && (
                  <div className="flex justify-between">
                    <span>Documento:</span>
                    <strong>{effective.thermalDocumentTitle}</strong>
                  </div>
                )}
                <div className="flex justify-between">
                  <span>N° Comprobante:</span>
                  <strong>FAC-000128</strong>
                </div>
                <div className="flex justify-between">
                  <span>Cliente:</span>
                  <strong>Consumidor Final</strong>
                </div>
                {effective.showCustomerRtn && (
                  <div className="flex justify-between">
                    <span>RTN/DNI:</span>
                    <span>0801-1990-12345</span>
                  </div>
                )}
                {effective.showSellerName && (
                  <div className="flex justify-between">
                    <span>{effective.issuerLabel || 'Atendido por'}:</span>
                    <span>{effective.defaultIssuerName || 'Cajero Principal'}</span>
                  </div>
                )}
              </div>

              <div className="pb-2 border-b border-dashed border-slate-300 space-y-1 text-[10px]">
                <div className="flex justify-between font-bold">
                  <span>2x Artículo Demo</span>
                  <span>L. 1,200.00</span>
                </div>
                <div className="text-[9px] text-slate-500">
                  {effective.showItemCode ? 'Cód: ART-101 • ' : ''}@ L. 600.00
                  {effective.showItemDiscount ? ' (Desc -L. 50.00)' : ''}
                </div>
              </div>

              <div className="space-y-1 text-[10.5px]">
                <div className="flex justify-between font-black text-xs">
                  <span>TOTAL NETO:</span>
                  <span>L. 1,200.00</span>
                </div>
                {effective.showAmountInWords && (
                  <div className="text-[9px] font-bold">
                    SON: MIL DOSCIENTOS LEMPIRAS CON 00/100
                  </div>
                )}
              </div>

              {effective.warrantyPolicyText && (
                <div className="pt-1.5 border-t border-dashed border-slate-300 text-[9px] text-slate-600 text-center">
                  {effective.warrantyTitle ? <strong>{effective.warrantyTitle}: </strong> : null}
                  {effective.warrantyPolicyText}
                </div>
              )}

              {(effective.footerThankYouTitle || receiptFooterText) && (
                <div className="pt-1.5 border-t border-dashed border-slate-300 text-center text-[10px]">
                  {effective.footerThankYouTitle && (
                    <div className="font-bold">{effective.footerThankYouTitle}</div>
                  )}
                  {receiptFooterText && (
                    <div className="text-[9.5px] text-slate-500">{receiptFooterText}</div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
