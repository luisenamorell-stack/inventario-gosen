import React, { useState, useRef, useEffect } from 'react';
import { StoreSettings } from '../types';
import { uploadStoreLogo } from '../firebase/storageService';
import {
  Store,
  Upload,
  Camera,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Eye,
  Sparkles,
  Layers,
  Phone,
  MapPin,
  FileText,
  Boxes,
  HelpCircle,
  Link as LinkIcon,
  Lock,
  EyeOff,
  KeyRound,
  Database,
  Wifi,
  Clock,
  Activity,
  HardDrive,
  Smartphone,
  Download
} from 'lucide-react';

interface StoreSettingsViewProps {
  currentSettings: StoreSettings;
  onSaveSettings: (settings: StoreSettings) => Promise<void>;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  isFirebaseConnected?: boolean;
  lastSyncTime?: Date | null;
  pingLatency?: number | null;
  onTestConnection?: () => Promise<void>;
  isPinging?: boolean;
  inventoryCount?: number;
  suppliersCount?: number;
  auditHistoryCount?: number;
  salesCount?: number;
  purchasesCount?: number;
  onResetData?: () => void;
  onOpenInstallPrompt?: () => void;
}

export const StoreSettingsView: React.FC<StoreSettingsViewProps> = ({
  currentSettings,
  onSaveSettings,
  showToast,
  isFirebaseConnected = true,
  lastSyncTime,
  pingLatency,
  onTestConnection,
  isPinging = false,
  inventoryCount = 0,
  suppliersCount = 0,
  auditHistoryCount = 0,
  salesCount = 0,
  purchasesCount = 0,
  onResetData,
  onOpenInstallPrompt,
}) => {
  const isGosen = (currentSettings.companyId || 'gosen') === 'gosen';
  const defaultPassword = isGosen ? 'GOSEN2026' : 'ADMIN2026';

  // Local form state
  const [storeName, setStoreName] = useState(currentSettings.storeName || (isGosen ? 'Tienda Gosén' : 'Mi Tienda'));
  const [tagline, setTagline] = useState(currentSettings.tagline || '');
  const [logoUrl, setLogoUrl] = useState(currentSettings.logoUrl || '');
  const [phone, setPhone] = useState(currentSettings.phone || '');
  const [address, setAddress] = useState(currentSettings.address || '');
  const [accessPassword, setAccessPassword] = useState(currentSettings.accessPassword || defaultPassword);
  const [showAccessPassword, setShowAccessPassword] = useState(false);

  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Sync state if external changes happen
  useEffect(() => {
    setStoreName(currentSettings.storeName || (isGosen ? 'Tienda Gosén' : 'Mi Tienda'));
    setTagline(currentSettings.tagline || '');
    setLogoUrl(currentSettings.logoUrl || '');
    setPhone(currentSettings.phone || '');
    setAddress(currentSettings.address || '');
    setAccessPassword(currentSettings.accessPassword || defaultPassword);
  }, [currentSettings, isGosen, defaultPassword]);

  const hasUnsavedChanges =
    storeName !== (currentSettings.storeName || (isGosen ? 'Tienda Gosén' : 'Mi Tienda')) ||
    tagline !== (currentSettings.tagline || '') ||
    logoUrl !== (currentSettings.logoUrl || '') ||
    phone !== (currentSettings.phone || '') ||
    address !== (currentSettings.address || '') ||
    accessPassword !== (currentSettings.accessPassword || defaultPassword);

  // File upload handler
  const handleProcessLogoFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      if (showToast) showToast('El archivo debe ser una imagen (PNG, JPG, WEBP)', 'warning');
      return;
    }

    if (file.size > 20 * 1024 * 1024) {
      if (showToast) showToast('La imagen es demasiado grande (máximo 20MB)', 'warning');
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      const downloadUrl = await uploadStoreLogo(file, (percent) => {
        setUploadProgress(percent);
      });

      setLogoUrl(downloadUrl);
      if (showToast) {
        showToast('Logo subido a Firebase Storage con éxito', 'success');
      }
    } catch (err: any) {
      console.error('Error uploading store logo:', err);
      if (showToast) {
        showToast('Error al subir el logo a Storage. Puedes ingresar una URL directa.', 'error');
      }
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessLogoFile(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessLogoFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (!urlDraft.trim()) return;
    setLogoUrl(urlDraft.trim());
    setUrlDraft('');
    setShowUrlInput(false);
    if (showToast) showToast('Enlace de logo aplicado al formulario', 'info');
  };

  const handleRemoveLogo = () => {
    setLogoUrl('');
    if (showToast) showToast('Logo removido. Se usará el ícono por defecto.', 'info');
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!storeName.trim()) {
      if (showToast) showToast('Por favor ingresa un nombre para la tienda', 'warning');
      return;
    }

    if (!accessPassword.trim()) {
      if (showToast) showToast('Por favor ingresa una contraseña para el acceso a la app', 'warning');
      return;
    }

    if (accessPassword.trim().length < 4) {
      if (showToast) showToast('La contraseña debe tener un mínimo de 4 caracteres', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      const updatedSettings: StoreSettings = {
        ...currentSettings,
        storeName: storeName.trim(),
        tagline: tagline.trim(),
        logoUrl: logoUrl.trim(),
        phone: phone.trim(),
        address: address.trim(),
        accessPassword: accessPassword.trim(),
        updatedAt: Date.now(),
      };

      await onSaveSettings(updatedSettings);
      if (showToast) {
        showToast('¡Configuración de la tienda guardada y sincronizada!', 'success');
      }
    } catch (err: any) {
      console.error('Error saving store settings:', err);
      if (showToast) {
        showToast(`Error al guardar configuración: ${err?.message || err}`, 'error');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefault = () => {
    setStoreName(isGosen ? 'Tienda Gosén' : 'Mi Tienda');
    setTagline('Control de Inventario y Auditoría');
    setLogoUrl('');
    setPhone('');
    setAddress('');
    setAccessPassword(defaultPassword);
    if (showToast) {
      showToast('Campos restablecidos a valores por defecto (haz clic en Guardar para confirmar)', 'info');
    }
  };

  return (
    <div className="flex-1 min-h-0 p-3 sm:p-6 lg:p-8 h-full w-full overflow-y-auto scroll-container bg-slate-50/60 pb-36 md:pb-24">
      {/* Hidden file inputs for Mobile and PC */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* Header */}
      <div className="mb-8 flex flex-col md:flex-row md:justify-between md:items-start gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100/80 text-emerald-800 text-xs font-semibold mb-2">
            <Store className="w-3.5 h-3.5 text-emerald-600" />
            <span>Identidad & Marca</span>
          </div>
          <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <span>Configuración de la Tienda</span>
          </h1>
          <p className="text-slate-500 font-medium mt-1">
            Personaliza el nombre de la tienda, logotipo y datos que aparecen en la barra lateral, encabezados y reportes impresos.
          </p>
        </div>

        {/* Live sync indicator */}
        <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm text-xs font-medium text-slate-600">
          <span className={`w-2.5 h-2.5 rounded-full ${isFirebaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`}></span>
          <span>{isFirebaseConnected ? 'Sincronización en Tiempo Real con Firebase' : 'Sin conexión con Firestore'}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Settings (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Card 1: Nombre & Eslogan */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                  <Store className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Nombre de la Tienda</h2>
                  <p className="text-xs text-slate-400">Reemplaza el texto "StockMaster" por el nombre comercial de tu negocio.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Nombre Comercial <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder={isGosen ? 'Ej. Tienda Gosen, Supermercado El Ahorro, etc.' : 'Ej. Comercial Mi Tienda, Boutique Central, etc.'}
                    maxLength={100}
                    className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-slate-800 placeholder-slate-400 shadow-sm transition-all"
                    required
                  />
                </div>
                
                {/* Suggestions */}
                <div className="flex flex-wrap items-center gap-2 mt-2.5">
                  <span className="text-xs text-slate-400 font-medium">Sugerencias rápidas:</span>
                  {isGosen && (
                    <button
                      type="button"
                      onClick={() => setStoreName('Tienda Gosen')}
                      className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-medium transition-colors cursor-pointer"
                    >
                      Tienda Gosen
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setStoreName('Mi Tienda')}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 text-slate-600 font-medium transition-colors cursor-pointer"
                  >
                    Mi Tienda
                  </button>
                  <button
                    type="button"
                    onClick={() => setStoreName('Sucursal Principal')}
                    className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-medium transition-colors cursor-pointer"
                  >
                    Sucursal Principal
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Eslogan o Subtítulo <span className="text-slate-400 font-normal">(Opcional)</span>
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Ej. Ropa y Calzado Exclusivo, Sucursal Principal, etc."
                  maxLength={150}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm text-slate-800 placeholder-slate-400 shadow-sm transition-all"
                />
              </div>
            </div>

            {/* Card 2: Logotipo de la Tienda */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Logo de la Tienda</h2>
                    <p className="text-xs text-slate-400">Sube una imagen desde tu móvil o PC que se guardará en Firebase Storage.</p>
                  </div>
                </div>

                {logoUrl && (
                  <button
                    type="button"
                    onClick={handleRemoveLogo}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar Logo</span>
                  </button>
                )}
              </div>

              {/* Upload Dropzone / Action buttons */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                className={`relative rounded-2xl border-2 border-dashed p-6 transition-all text-center flex flex-col items-center justify-center ${
                  isDragOver
                    ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
                    : 'border-slate-300 hover:border-slate-400 bg-slate-50/50'
                }`}
              >
                {/* Uploading progress bar overlay */}
                {isUploading ? (
                  <div className="w-full max-w-xs space-y-3 py-4">
                    <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto" />
                    <p className="text-sm font-bold text-slate-700">Subiendo logo a Firebase Storage...</p>
                    <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                      <div
                        className="bg-emerald-600 h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${uploadProgress}%` }}
                      ></div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-600">{uploadProgress}%</span>
                  </div>
                ) : logoUrl ? (
                  <div className="flex flex-col sm:flex-row items-center gap-6 py-2">
                    <div className="relative group">
                      <div className="w-52 h-20 rounded-2xl border-2 border-emerald-500/30 p-1.5 shadow-md flex items-center justify-center overflow-hidden bg-slate-50/80">
                        <img
                          src={logoUrl}
                          alt="Logo de la Tienda"
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).src = '';
                          }}
                        />
                      </div>
                      <span className="absolute -top-2 -right-2 bg-emerald-500 text-white p-1 rounded-full shadow">
                        <CheckCircle2 className="w-4 h-4" />
                      </span>
                    </div>

                    <div className="text-left space-y-2">
                      <p className="text-sm font-bold text-slate-800">Logo actual configurado</p>
                      <p className="text-xs text-slate-500">
                        Este logotipo se muestra en la barra de navegación y en la cabecera de reportes.
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5 text-indigo-500" />
                          <span>Cambiar Imagen</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => cameraInputRef.current?.click()}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm inline-flex items-center gap-1.5 cursor-pointer sm:hidden"
                        >
                          <Camera className="w-3.5 h-3.5" />
                          <span>Tomar con Cámara</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4 py-2">
                    <div className="w-16 h-16 rounded-2xl bg-emerald-100/60 text-emerald-600 flex items-center justify-center mx-auto shadow-sm">
                      <Store className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-700">
                        Arrastra y suelta el archivo de tu logo aquí
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Compatible con PNG, JPG, SVG o WebP (optimizado automáticamente para alta velocidad)
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                      {/* Mobile camera */}
                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm inline-flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Tomar Foto / Cámara</span>
                      </button>

                      {/* PC / File gallery */}
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-sm inline-flex items-center gap-2 cursor-pointer transition-colors"
                      >
                        <Upload className="w-4 h-4 text-emerald-600" />
                        <span>Subir desde Móvil o PC</span>
                      </button>

                      {/* URL button */}
                      <button
                        type="button"
                        onClick={() => setShowUrlInput(!showUrlInput)}
                        className="px-3 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <LinkIcon className="w-3.5 h-3.5" />
                        <span>Pegar URL</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* URL Input collapse */}
              {showUrlInput && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <label className="block text-xs font-bold text-slate-700">
                    URL directa del logo (HTTPS):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={urlDraft}
                      onChange={(e) => setUrlDraft(e.target.value)}
                      placeholder="https://ejemplo.com/logo.png"
                      className="flex-1 px-3 py-2 rounded-lg border border-slate-300 text-xs focus:ring-2 focus:ring-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={handleApplyUrl}
                      className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold hover:bg-slate-700 cursor-pointer"
                    >
                      Aplicar
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Card: Aplicación Móvil PWA y Acceso con Icono de la Tienda */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-emerald-950 text-white rounded-2xl p-6 shadow-md border border-slate-700/80 space-y-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-4 border-b border-slate-700/60 gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold shrink-0">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Aplicación Móvil en Teléfonos y Tablets</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        PWA Instalable
                      </span>
                    </h2>
                    <p className="text-xs text-slate-300">
                      Cuando descargas la app en tu móvil, se instala en la pantalla de inicio con la imagen oficial de {storeName || 'la tienda'}.
                    </p>
                  </div>
                </div>

                {onOpenInstallPrompt && (
                  <button
                    type="button"
                    onClick={onOpenInstallPrompt}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all cursor-pointer shrink-0"
                  >
                    <Download className="w-4 h-4" />
                    <span>Instalar en este Dispositivo</span>
                  </button>
                )}
              </div>

              {/* Home Screen Icon Mockup & Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                {/* Mockup Preview of Home Screen Icon */}
                <div className="bg-slate-950/60 border border-slate-700/80 rounded-2xl p-4 flex flex-col items-center justify-center text-center">
                  <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">
                    Icono en Pantalla de Inicio
                  </span>
                  <div className="relative group">
                    <div className="w-20 h-20 rounded-2xl bg-slate-900 border-2 border-emerald-500/50 shadow-xl overflow-hidden p-1.5 flex items-center justify-center">
                      {logoUrl || isGosen ? (
                        <img
                          src={logoUrl || '/pwa-512x512.png'}
                          alt={storeName}
                          className="w-full h-full object-contain rounded-xl"
                          onError={(e) => {
                            if (isGosen) {
                              (e.target as HTMLImageElement).src = '/pwa-192x192.png';
                            }
                          }}
                        />
                      ) : (
                        <Store className="w-10 h-10 text-emerald-400" />
                      )}
                    </div>
                  </div>
                  <span className="mt-2.5 font-bold text-xs text-slate-200 truncate max-w-[140px]">
                    {storeName || (isGosen ? 'Tienda Gosén' : 'Mi Tienda')}
                  </span>
                  <span className="text-[10px] text-emerald-400 font-medium">
                    App Móvil Oficial
                  </span>
                </div>

                {/* Features & compatibility instructions */}
                <div className="md:col-span-2 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-start gap-2.5 bg-white/5 p-3 rounded-xl border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p>
                      <strong className="text-white">Icono de Alta Resolución:</strong> Incluye manifiesto web (`manifest.json`) y etiquetas Apple Touch Icon para que Android y iPhone muestren el logo sin bordes borrosos.
                    </p>
                  </div>

                  <div className="flex items-start gap-2.5 bg-white/5 p-3 rounded-xl border border-white/5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <p>
                      <strong className="text-white">Experiencia de Pantalla Completa:</strong> Al abrirse desde el teléfono funciona sin la barra de direcciones del navegador, brindando una experiencia nativa fluida.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Card 3: Datos de Contacto para Reportes (Opcional) */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">Datos para Documentos y Reportes</h2>
                  <p className="text-xs text-slate-400">Información adicional que se reflejará en las auditorías impresas.</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
                    <Phone className="w-3 h-3 text-slate-400" />
                    <span>Teléfono / WhatsApp</span>
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+504 9999-9999"
                    maxLength={50}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-sm text-slate-800 placeholder-slate-400 shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-slate-400" />
                    <span>Ubicación o Dirección</span>
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Tegucigalpa, Honduras"
                    maxLength={150}
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 text-sm text-slate-800 placeholder-slate-400 shadow-sm"
                  />
                </div>
              </div>
            </div>

            {/* Card 4: Seguridad & Contraseña de Acceso */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold shrink-0">
                    <Lock className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Contraseña de Acceso a la App</h2>
                    <p className="text-xs text-slate-400">Protege el sistema de inventario requiriendo esta clave en el inicio de sesión.</p>
                  </div>
                </div>

                {accessPassword === defaultPassword ? (
                  <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold border border-slate-200">
                    Clave Predeterminada
                  </span>
                ) : (
                  <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    Clave Personalizada Activa
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                  Contraseña de Acceso <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showAccessPassword ? 'text' : 'password'}
                    value={accessPassword}
                    onChange={(e) => setAccessPassword(e.target.value)}
                    placeholder="Ingresa la contraseña para ingresar a la app"
                    maxLength={60}
                    required
                    className="w-full pl-10 pr-12 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 font-semibold text-slate-800 placeholder-slate-400 shadow-sm transition-all text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAccessPassword(!showAccessPassword)}
                    tabIndex={-1}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                    title={showAccessPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showAccessPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5">
                  <p className="text-xs text-slate-400 font-medium">
                    Mínimo 4 caracteres. Ya no se mostrará en la pantalla de inicio por seguridad.
                  </p>
                  {accessPassword !== defaultPassword && (
                    <button
                      type="button"
                      onClick={() => {
                        setAccessPassword(defaultPassword);
                        if (showToast) showToast(`Contraseña reestablecida a ${defaultPassword} (haz clic en Guardar)`, 'info');
                      }}
                      className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 hover:underline cursor-pointer"
                    >
                      Restablecer a {defaultPassword}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Card 5: Estado de la Base de Datos & Conexión en la Nube */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200/80 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold shrink-0">
                    <Database className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-800">Conexión a la Nube & Diagnóstico del Sistema</h2>
                    <p className="text-xs text-slate-400">Detalles técnicos de Firestore en tiempo real y métricas de sincronización.</p>
                  </div>
                </div>

                {isFirebaseConnected ? (
                  <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold border border-emerald-200">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Firestore Conectado en Tiempo Real
                  </span>
                ) : (
                  <span className="self-start sm:self-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold border border-rose-200">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    Sin Conexión
                  </span>
                )}
              </div>

              {/* Technical Details Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Servidor en la Nube
                  </span>
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-indigo-500" />
                    <span className="font-mono text-xs font-bold text-slate-800">
                      {isGosen ? 'tiendagosenhn' : 'Nube Multi-Empresa SaaS'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Instancia de Tienda Activa
                  </span>
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-indigo-500" />
                    <span className="font-mono text-xs font-bold text-slate-800 truncate">
                      {isGosen ? 'ai-studio-inventariogosen' : `instancia-${currentSettings.companyId || 'tienda'}`}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Latencia de Red (Ping)
                  </span>
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-500" />
                    <span className="font-mono text-xs font-bold text-emerald-700">
                      {pingLatency !== null ? `${pingLatency} ms` : 'Excelente (<120 ms)'}
                    </span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/70">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                    Última Sincronización
                  </span>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-semibold text-slate-700">
                      {lastSyncTime
                        ? lastSyncTime.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : 'En línea'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Synced Records Summary */}
              <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100">
                <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900 block mb-2">
                  Registros Almacenados en la Nube
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 text-center">
                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100/80">
                    <span className="text-lg font-black text-indigo-950 block">{inventoryCount}</span>
                    <span className="text-[11px] text-slate-500 font-medium">Artículos</span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100/80">
                    <span className="text-lg font-black text-indigo-950 block">{suppliersCount}</span>
                    <span className="text-[11px] text-slate-500 font-medium">Proveedores</span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100/80">
                    <span className="text-lg font-black text-indigo-600 block">{purchasesCount}</span>
                    <span className="text-[11px] text-slate-500 font-medium">Compras</span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100/80">
                    <span className="text-lg font-black text-emerald-700 block">{salesCount}</span>
                    <span className="text-[11px] text-slate-500 font-medium">Ventas</span>
                  </div>
                  <div className="bg-white/80 p-2.5 rounded-lg border border-indigo-100/80">
                    <span className="text-lg font-black text-indigo-950 block">{auditHistoryCount}</span>
                    <span className="text-[11px] text-slate-500 font-medium">Auditorías</span>
                  </div>
                </div>
              </div>

              {/* Actions: Test Connection & Reset Demo Data */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                {onTestConnection && (
                  <button
                    type="button"
                    onClick={onTestConnection}
                    disabled={isPinging}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPinging ? 'animate-spin' : ''}`} />
                    <span>{isPinging ? 'Comprobando conexión...' : 'Probar Conexión con Firestore'}</span>
                  </button>
                )}

                {onResetData && (
                  <button
                    type="button"
                    onClick={onResetData}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-600 hover:text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <span>Restablecer Datos de Demostración</span>
                  </button>
                )}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-slate-500 hover:text-slate-800 text-xs font-bold hover:underline cursor-pointer"
              >
                Restablecer a "StockMaster" por defecto
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="submit"
                  disabled={isSaving || isUploading}
                  className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white px-7 py-3 rounded-xl font-black text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Guardando en Firebase...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Guardar y Aplicar Cambios</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>

        {/* Right Column: Live Interactive Previews (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Live Preview Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border border-slate-800 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none"></div>

            <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-6">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  Vista Previa en Vivo
                </span>
              </div>
              <span className="text-[11px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full border border-slate-700">
                Barra Lateral
              </span>
            </div>

            {/* Mock Sidebar Header */}
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800/80 mb-6">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-2">Así se verá en la App:</p>
              <div className="flex items-center gap-3">
                {logoUrl ? (
                  <div className="w-10 h-10 rounded-xl bg-white/10 p-1 border border-slate-700 flex items-center justify-center shadow-md overflow-hidden shrink-0">
                    <img
                      src={logoUrl}
                      alt={storeName}
                      className="w-full h-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 border border-emerald-500/30">
                    <Boxes className="w-6 h-6" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h3 className="font-black text-lg text-white tracking-wide truncate">
                    {storeName || 'StockMaster'}
                  </h3>
                  {tagline ? (
                    <p className="text-xs text-slate-400 truncate">{tagline}</p>
                  ) : (
                    <p className="text-[11px] text-slate-500">Sistema de Inventario</p>
                  )}
                </div>
              </div>
            </div>

            {/* Mock Mobile Topbar */}
            <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 mb-6">
              <p className="text-[10px] uppercase font-bold text-slate-500 mb-1.5">En pantallas móviles:</p>
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-2 rounded-lg border border-slate-800">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={storeName}
                    className="w-6 h-6 rounded object-contain bg-white/10 p-0.5"
                  />
                ) : (
                  <Boxes className="w-5 h-5 text-emerald-400" />
                )}
                <span className="font-bold text-sm text-slate-100 truncate">
                  {storeName || 'StockMaster'}
                </span>
              </div>
            </div>

            {/* Mock Printable Audit Report Header */}
            <div className="bg-white text-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200">
              <p className="text-[10px] uppercase font-bold text-slate-400 mb-2">En Reportes e Impresiones:</p>
              <div className="text-center border-b border-slate-200 pb-3">
                {logoUrl ? (
                  <div className="w-12 h-12 mx-auto mb-2 flex items-center justify-center overflow-hidden">
                    <img
                      src={logoUrl}
                      alt={storeName}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <Boxes className="w-8 h-8 text-slate-700 mx-auto mb-1" />
                )}
                <h4 className="font-black text-sm uppercase tracking-wide text-slate-900">
                  {storeName || 'StockMaster'}
                </h4>
                {tagline && <p className="text-[11px] text-slate-500 font-medium">{tagline}</p>}
                {(phone || address) && (
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {[phone, address].filter(Boolean).join(' • ')}
                  </p>
                )}
                <p className="text-[9px] uppercase font-bold text-emerald-700 mt-1">
                  Reporte Oficial de Inventario
                </p>
              </div>
            </div>
          </div>

          {/* Quick tips card */}
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-2xl p-5 text-slate-700 space-y-2">
            <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              <span>Sincronización Multidispositivo</span>
            </h4>
            <p className="text-xs text-emerald-800 leading-relaxed">
              Al guardar los cambios, el nombre y logotipo se almacenan de manera centralizada en <strong>Firebase Firestore</strong> y <strong>Firebase Storage</strong>. Cualquier teléfono o computadora que abra la aplicación verá la marca de tu tienda de inmediato en tiempo real.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
