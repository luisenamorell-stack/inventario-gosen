import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import { StoreSettings, Product } from '../types';
import {
  Share2,
  Copy,
  ExternalLink,
  QrCode,
  Download,
  Smartphone,
  Check,
  Save,
  Sparkles,
  Eye,
  Store,
  MessageSquare,
  Phone,
  Layers,
  ShoppingBag,
  Truck
} from 'lucide-react';
import { WhatsAppIcon } from './SalesView';

interface DigitalCatalogViewProps {
  storeSettings: StoreSettings;
  inventory: Product[];
  onSaveSettings: (settings: StoreSettings) => Promise<void>;
  onOpenPreview: () => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const DigitalCatalogView: React.FC<DigitalCatalogViewProps> = ({
  storeSettings,
  inventory,
  onSaveSettings,
  onOpenPreview,
  showToast,
}) => {
  const [copied, setCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Editable Catalog Settings
  const [whatsappPhone, setWhatsappPhone] = useState(
    storeSettings.whatsappOrderPhone || storeSettings.phone || ''
  );
  const [welcomeMsg, setWelcomeMsg] = useState(
    storeSettings.catalogWelcomeMsg ||
      '¡Bienvenido a nuestro catálogo digital! Selecciona tus productos disponibles y haz tu pedido directamente por WhatsApp.'
  );

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Generate public catalog link based on current domain origin
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';
  const shareableUrl = `${baseUrl}?catalogo=1`;

  // Available in-stock products count
  const availableCount = inventory.filter((p) => (Number(p.stock) || 0) > 0).length;

  // Render QR Code to Canvas on load or URL change
  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, shareableUrl, {
        width: 220,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      }).catch((err) => {
        console.error('Error generating QR code:', err);
      });
    }
  }, [shareableUrl]);

  // Copy share link handler
  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareableUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      if (showToast) showToast('¡Enlace del catálogo copiado al portapapeles!', 'success');
    } catch {
      if (showToast) showToast('No se pudo copiar el enlace.', 'error');
    }
  };

  // Share via WhatsApp broadcast/contact
  const handleShareWhatsAppLink = () => {
    const sName = storeSettings.storeName || 'Tienda Gosén';
    const text = `🛍️ *CATÁLOGO DIGITAL DE ${sName.toUpperCase()}*\n\n` +
      `¡Hola! Te invitamos a conocer nuestro catálogo de productos disponibles en línea. ` +
      `Puedes elegir lo que te guste y hacernos tu pedido directamente por WhatsApp aquí:\n\n` +
      `👉 ${shareableUrl}\n\n` +
      `¡Esperamos tu mensaje! ✨`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    if (showToast) showToast('Abriendo WhatsApp para compartir el enlace del catálogo...', 'info');
  };

  // Download QR Code PNG image
  const handleDownloadQR = () => {
    if (!canvasRef.current) return;
    try {
      const imageUri = canvasRef.current.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `codigo-qr-catalogo-${(storeSettings.storeName || 'tienda').toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = imageUri;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      if (showToast) showToast('¡Código QR descargado como imagen PNG!', 'success');
    } catch {
      if (showToast) showToast('Error al descargar el código QR.', 'error');
    }
  };

  // Save Settings handler
  const handleSaveCatalogSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await onSaveSettings({
        ...storeSettings,
        whatsappOrderPhone: whatsappPhone.trim(),
        catalogWelcomeMsg: welcomeMsg.trim(),
      });
      if (showToast) showToast('¡Ajustes del Catálogo Digital guardados exitosamente!', 'success');
    } catch (err: any) {
      if (showToast) showToast(`Error al guardar: ${err?.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 min-h-0 h-full w-full bg-slate-50 overflow-y-auto scroll-container p-3 sm:p-6 lg:p-8 space-y-4 sm:space-y-6 pb-36 md:pb-24">
      {/* Top Banner Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-slate-900 to-slate-900 text-white p-6 rounded-3xl shadow-xl border border-emerald-500/30 space-y-3 relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-48 h-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1 max-w-2xl">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Módulo de Ventas Online & Pedidos</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Catálogo Digital & Enlace de Pedidos WhatsApp
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium">
              Comparte un solo enlace con tus clientes para que puedan explorar todos tus artículos con stock disponible y pedirte directamente a tu WhatsApp.
            </p>
          </div>

          <button
            onClick={onOpenPreview}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-3 rounded-2xl font-extrabold text-xs sm:text-sm shadow-lg transition-all flex items-center justify-center gap-2 border border-emerald-400/40 cursor-pointer hover:scale-105 active:scale-95 shrink-0"
          >
            <Eye className="w-4 h-4" />
            <span>Ver Vista Previa del Cliente</span>
          </button>
        </div>

        {/* Live inventory pill metrics */}
        <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center gap-4 text-xs text-slate-300">
          <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-700">
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
            <span>Artículos disponibles en catálogo: <strong className="text-white font-bold">{availableCount}</strong></span>
          </span>
          <span className="flex items-center gap-1.5 bg-slate-800/80 px-3 py-1 rounded-xl border border-slate-700">
            <WhatsAppIcon className="w-3.5 h-3.5 fill-emerald-400" />
            <span>Recepción de pedidos: <strong className="text-emerald-400 font-bold">{whatsappPhone || storeSettings.phone || 'Configurar número'}</strong></span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): Shareable Link & Config */}
        <div className="lg:col-span-2 space-y-6">
          {/* Card 1: Enlace Público Generado */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Share2 className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Enlace Directo del Catálogo</h2>
                  <p className="text-xs text-slate-500">
                    Copia este enlace para publicarlo en tus redes sociales o enviarlo a tus clientes.
                  </p>
                </div>
              </div>
            </div>

            {/* URL Display & Quick Actions */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                <input
                  type="text"
                  readOnly
                  value={shareableUrl}
                  className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-mono font-bold text-emerald-800 select-all outline-none"
                />

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleCopyLink}
                    className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      copied
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                    }`}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? '¡Copiado!' : 'Copiar Enlace'}</span>
                  </button>

                  <a
                    href={shareableUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs transition-colors"
                    title="Abrir enlace en pestaña nueva"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* Action Buttons: WhatsApp Broadcast & Preview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  onClick={handleShareWhatsAppLink}
                  className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-sm"
                >
                  <WhatsAppIcon className="w-4 h-4 fill-white" />
                  <span>Compartir Catálogo por WhatsApp</span>
                </button>

                <button
                  onClick={onOpenPreview}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all"
                >
                  <Eye className="w-4 h-4 text-emerald-600" />
                  <span>Probar Vista del Cliente</span>
                </button>
              </div>
            </div>
          </div>

          {/* Card 2: Custom Settings Form */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="font-bold text-slate-900 text-base">Configurar Recepción de Pedidos</h2>
                  <p className="text-xs text-slate-500">
                    Personaliza el número de teléfono y el mensaje de bienvenida que verán tus clientes.
                  </p>
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveCatalogSettings} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Número de WhatsApp donde recibirás los pedidos <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    placeholder="ej. 9876-5432 o +504 9876-5432"
                    value={whatsappPhone}
                    onChange={(e) => setWhatsappPhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold text-slate-800 text-xs"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  💡 Los clientes enviarán su lista de productos directamente a este número con un formato ordenado.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Mensaje o Banner de Bienvenida del Catálogo
                </label>
                <textarea
                  rows={3}
                  placeholder="ej. ¡Bienvenidos a nuestra tienda! Elige tus productos y solicita envío a domicilio..."
                  value={welcomeMsg}
                  onChange={(e) => setWelcomeMsg(e.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium text-slate-800 text-xs"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer transition-all shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSaving ? 'Guardando...' : 'Guardar Ajustes del Catálogo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Right Column: QR Code Card & Printable Badge */}
        <div className="space-y-6">
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4 text-center">
            <div className="flex items-center justify-center gap-2 pb-3 border-b border-slate-100">
              <QrCode className="w-5 h-5 text-emerald-600" />
              <h3 className="font-bold text-slate-900 text-base">Código QR para Imprimir</h3>
            </div>

            <p className="text-xs text-slate-500">
              Imprime este código QR para colocarlo en tu mostrador, mesa o publicaciones impresas. Tus clientes solo escanean y acceden al catálogo.
            </p>

            {/* QR Canvas Container */}
            <div className="flex justify-center my-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner w-fit mx-auto">
              <canvas ref={canvasRef} className="rounded-xl" />
            </div>

            <button
              type="button"
              onClick={handleDownloadQR}
              className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all shadow-sm"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Descargar Código QR (PNG)</span>
            </button>
          </div>

          {/* Integrated Delivery Partner Card - D'VOLADA */}
          <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950 text-white p-5 rounded-2xl border border-orange-500/40 shadow-md space-y-3">
            <div className="flex items-center gap-2.5 pb-2 border-b border-slate-800">
              <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center font-bold border border-orange-500/30">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-white text-sm">Delivery Integrado</h3>
                <p className="text-[11px] text-orange-300 font-semibold">Aliado oficial de envíos</p>
              </div>
            </div>

            <div className="bg-white/95 p-2 rounded-xl border border-orange-200/80 flex items-center justify-center shadow-inner">
              <img
                src="/dvolada-delivery.jpg"
                alt="D'VOLADA Servicios de Delivery"
                className="h-14 sm:h-16 object-contain rounded-lg"
              />
            </div>

            <p className="text-xs text-slate-300 leading-relaxed font-medium">
              Los pedidos realizados desde tu catálogo online están vinculados automáticamente con el servicio de entrega a domicilio de <strong>D'VOLADA</strong>.
            </p>

            <div className="pt-1 text-[11px] font-bold text-orange-300 flex items-center gap-1">
              <span>✓ Incluye dirección de envío en mensaje de WhatsApp</span>
            </div>
          </div>

          {/* Quick Info Tip Box */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-xs text-emerald-950 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-emerald-900">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>¿Cómo funciona el Catálogo Digital?</span>
            </div>
            <ul className="space-y-1.5 text-emerald-900/90 list-disc pl-4 leading-relaxed">
              <li>Muestra todos tus productos sincronizados en tiempo real.</li>
              <li>Sincronizado en tiempo real con tu inventario de Tienda Gosén.</li>
              <li>Tus clientes no necesitan registrarse ni descargar ninguna aplicación.</li>
              <li>Recibes el detalle exacto de los productos, método de entrega <strong>D'VOLADA</strong> y dirección listos en tu WhatsApp.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
