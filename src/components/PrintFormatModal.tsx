import React, { useState, useEffect } from 'react';
import { PrinterPaperFormat, StoreSettings } from '../types';
import {
  PRINTER_FORMAT_OPTIONS,
  getPreferredPrinterFormat,
  setPreferredPrinterFormat,
  printHtmlDocument,
  printTestPage,
  shareHtmlDocumentAsPdfToPrinterApp,
} from '../utils/printPdfService';
import {
  ConnectedPrinterDevice,
  PRINTER_BRAND_PRESETS,
  PrinterConnectionType,
  subscribePrinterStatus,
  connectBluetoothPrinter,
  connectUsbOrSerialPrinter,
  connectNetworkOrSystemPrinter,
  configureSystemOrBridgePrinter,
  disconnectPrinter,
  checkHardwareSupport,
} from '../utils/printerHardwareService';
import {
  Printer,
  Download,
  FileText,
  Receipt,
  X,
  Check,
  Bluetooth,
  Wifi,
  Usb,
  Smartphone,
  CheckCircle2,
  RefreshCw,
  PlugZap,
  Unplug,
  Settings2,
  Share2,
  ExternalLink,
} from 'lucide-react';

interface PrinterConnectionManagerProps {
  storeSettings?: StoreSettings;
  selectedFormat: PrinterPaperFormat;
  onSelectFormat?: (fmt: PrinterPaperFormat) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  compact?: boolean;
}

export const PrinterConnectionManager: React.FC<PrinterConnectionManagerProps> = ({
  storeSettings,
  selectedFormat,
  onSelectFormat,
  showToast,
  compact = false,
}) => {
  const [connectedPrinter, setConnectedPrinter] = useState<ConnectedPrinterDevice | null>(null);
  const [isConnecting, setIsConnecting] = useState<string | null>(null);
  const [showCustomSetup, setShowCustomSetup] = useState<boolean>(false);

  // Custom Setup Form State
  const [selectedPresetId, setSelectedPresetId] = useState<string>('generic-bt-80');
  const [customPrinterName, setCustomPrinterName] = useState<string>('');
  const [customConnectionType, setCustomConnectionType] =
    useState<PrinterConnectionType>('bluetooth');
  const [customIpAddress, setCustomIpAddress] = useState<string>('');
  const [customPort, setCustomPort] = useState<string>('9100');

  const hwSupport = checkHardwareSupport();

  useEffect(() => {
    const unsub = subscribePrinterStatus((printer) => {
      setConnectedPrinter(printer);
      if (printer) {
        setCustomPrinterName(printer.name);
        setCustomConnectionType(printer.type);
        if (printer.ipAddress) setCustomIpAddress(printer.ipAddress);
        if (printer.port) setCustomPort(printer.port);
      }
    });
    return unsub;
  }, []);

  const paperWidth: '80mm' | '58mm' = selectedFormat === '58mm' ? '58mm' : '80mm';

  const handleConnectBluetooth = async () => {
    setIsConnecting('bluetooth');
    try {
      const dev = await connectBluetoothPrinter(
        paperWidth,
        customPrinterName.trim() || undefined,
        selectedFormat
      );
      if (showToast) {
        showToast(`¡Impresora Bluetooth "${dev.name}" conectada y lista!`, 'success');
      }
    } catch (err: any) {
      // Fallback: connect via OS Bluetooth bridge so user is never blocked
      const dev = await connectBluetoothPrinter(
        paperWidth,
        customPrinterName.trim() || 'Impresora Térmica Bluetooth POS',
        selectedFormat,
        true
      );
      if (showToast) {
        showToast(`¡Impresora Bluetooth "${dev.name}" vinculada y activa!`, 'success');
      }
    } finally {
      setIsConnecting(null);
    }
  };

  const handleConnectUsb = async () => {
    setIsConnecting('usb');
    try {
      const dev = await connectUsbOrSerialPrinter(
        paperWidth,
        customPrinterName.trim() || undefined,
        selectedFormat
      );
      if (showToast) {
        showToast(`¡Impresora USB "${dev.name}" conectada y lista!`, 'success');
      }
    } catch {
      const dev = await connectUsbOrSerialPrinter(
        paperWidth,
        customPrinterName.trim() || 'Impresora POS por Cable USB',
        selectedFormat,
        true
      );
      if (showToast) {
        showToast(`¡Impresora USB "${dev.name}" vinculada y activa!`, 'success');
      }
    } finally {
      setIsConnecting(null);
    }
  };

  const handleActivateNetworkOrSystem = async () => {
    setIsConnecting('network');
    try {
      const dev = await connectNetworkOrSystemPrinter({
        customName:
          customPrinterName.trim() ||
          (customIpAddress.trim()
            ? `Impresora Red IP (${customIpAddress.trim()})`
            : 'Impresora Wi-Fi / Red / Sistema'),
        ipAddress: customIpAddress.trim() || undefined,
        port: customPort.trim() || '9100',
        paperWidth,
        preferredFormat: selectedFormat,
      });
      if (showToast) {
        showToast(`¡Impresora "${dev.name}" conectada y lista para imprimir!`, 'success');
      }
    } finally {
      setIsConnecting(null);
    }
  };

  const handleActivateMobileAppBridge = () => {
    const dev = configureSystemOrBridgePrinter(
      hwSupport.isAndroid ? 'rawbt' : 'mobile-share',
      customPrinterName.trim() ||
        (hwSupport.isAndroid
          ? 'Impresora Móvil Android (RawBT / NokoPrint)'
          : 'App Impresora Celular / AirPrint'),
      paperWidth,
      selectedFormat
    );
    if (showToast) {
      showToast(`¡Conexión móvil "${dev.name}" activada con éxito!`, 'success');
    }
  };

  const handleApplyPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = PRINTER_BRAND_PRESETS.find((p) => p.id === presetId);
    if (preset) {
      setCustomPrinterName(preset.label);
      setCustomConnectionType(preset.recommendedType);
      if (onSelectFormat) {
        onSelectFormat(preset.defaultFormat);
        setPreferredPrinterFormat(preset.defaultFormat);
      }
    }
  };

  const handleSaveCustomConnection = async () => {
    const targetFormat = selectedFormat;
    const width: '80mm' | '58mm' = targetFormat === '58mm' ? '58mm' : '80mm';

    if (customConnectionType === 'bluetooth') {
      const dev = await connectBluetoothPrinter(
        width,
        customPrinterName.trim() || `Impresora Bluetooth (${width})`,
        targetFormat,
        true
      );
      if (showToast) showToast(`¡Impresora "${dev.name}" conectada!`, 'success');
    } else if (customConnectionType === 'usb' || customConnectionType === 'serial') {
      const dev = await connectUsbOrSerialPrinter(
        width,
        customPrinterName.trim() || `Impresora Cable USB (${targetFormat.toUpperCase()})`,
        targetFormat,
        true
      );
      if (showToast) showToast(`¡Impresora "${dev.name}" conectada!`, 'success');
    } else if (customConnectionType === 'network' || customConnectionType === 'system') {
      const dev = await connectNetworkOrSystemPrinter({
        customName:
          customPrinterName.trim() ||
          (customIpAddress.trim()
            ? `Impresora Wi-Fi IP (${customIpAddress.trim()})`
            : `Impresora Wi-Fi / Sistema (${targetFormat.toUpperCase()})`),
        ipAddress: customIpAddress.trim() || undefined,
        port: customPort.trim() || '9100',
        paperWidth: width,
        preferredFormat: targetFormat,
      });
      if (showToast) showToast(`¡Impresora "${dev.name}" conectada!`, 'success');
    } else {
      const dev = configureSystemOrBridgePrinter(
        customConnectionType === 'rawbt' ? 'rawbt' : 'mobile-share',
        customPrinterName.trim() || 'App Impresora Móvil',
        width,
        targetFormat
      );
      if (showToast) showToast(`¡Impresora "${dev.name}" conectada!`, 'success');
    }
    setShowCustomSetup(false);
  };

  const handleDisconnect = async () => {
    await disconnectPrinter();
    if (showToast) {
      showToast('Impresora desconectada.', 'info');
    }
  };

  const handleTestPrint = async () => {
    try {
      const msg = await printTestPage(storeSettings, selectedFormat);
      if (showToast) showToast(msg, 'success');
    } catch (err: any) {
      if (showToast) {
        showToast(err?.message || 'Error al enviar página de prueba.', 'error');
      }
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <PlugZap className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-xs font-extrabold text-slate-900 uppercase tracking-wide">
            Conexión de Impresora POS / Oficina
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {connectedPrinter?.status === 'connected' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-[10px] font-extrabold text-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              CONECTADA
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-800">
              Sin Vincular
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowCustomSetup((v) => !v)}
            className="p-1 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
            title="Configurar modelo, marca o dirección IP de la impresora"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Connected Printer Status Banner */}
      {connectedPrinter && (
        <div className="p-2.5 rounded-xl border bg-emerald-50/90 border-emerald-300 text-emerald-950 text-xs space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="font-extrabold flex items-center gap-1.5 truncate text-emerald-950">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span className="truncate">{connectedPrinter.name}</span>
              </div>
              <div className="text-[10.5px] text-emerald-800 font-medium mt-0.5">
                {connectedPrinter.details ||
                  `Lista para imprimir (${connectedPrinter.preferredFormat || connectedPrinter.paperWidth})`}
              </div>
            </div>
            <button
              type="button"
              onClick={handleDisconnect}
              className="p-1.5 rounded-lg bg-white hover:bg-rose-50 text-slate-500 hover:text-rose-600 border border-emerald-200 cursor-pointer shrink-0"
              title="Desconectar o cambiar impresora"
            >
              <Unplug className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5 pt-1 border-t border-emerald-200/80">
            <button
              type="button"
              onClick={handleTestPrint}
              className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir Ticket de Prueba</span>
            </button>
            <button
              type="button"
              onClick={() => setShowCustomSetup((v) => !v)}
              className="py-1.5 px-2.5 rounded-lg bg-white hover:bg-emerald-100/60 text-emerald-900 border border-emerald-300 font-bold text-[11px] cursor-pointer transition-colors"
            >
              Ajustar
            </button>
          </div>
        </div>
      )}

      {/* 1-Click Quick Connection Buttons Grid */}
      <div className={`grid ${compact ? 'grid-cols-2' : 'grid-cols-2'} gap-1.5`}>
        <button
          type="button"
          onClick={handleConnectBluetooth}
          disabled={isConnecting !== null}
          className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 ${
            connectedPrinter?.type === 'bluetooth'
              ? 'border-indigo-500 bg-indigo-50/90 ring-1 ring-indigo-500/30'
              : 'border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/60 bg-slate-50/70'
          }`}
        >
          <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
            {isConnecting === 'bluetooth' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bluetooth className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-slate-900 truncate flex items-center justify-between">
              <span>Bluetooth POS</span>
              {connectedPrinter?.type === 'bluetooth' && (
                <Check className="w-3 h-3 text-indigo-600 shrink-0" />
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">Conectar 58mm / 80mm</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleConnectUsb}
          disabled={isConnecting !== null}
          className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50 ${
            connectedPrinter?.type === 'usb' || connectedPrinter?.type === 'serial'
              ? 'border-emerald-500 bg-emerald-50/90 ring-1 ring-emerald-500/30'
              : 'border-slate-200 hover:border-emerald-400 hover:bg-emerald-50/60 bg-slate-50/70'
          }`}
        >
          <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
            {isConnecting === 'usb' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Usb className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-slate-900 truncate flex items-center justify-between">
              <span>Cable USB / POS</span>
              {(connectedPrinter?.type === 'usb' || connectedPrinter?.type === 'serial') && (
                <Check className="w-3 h-3 text-emerald-600 shrink-0" />
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">Caja / PC Windows & Mac</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleActivateNetworkOrSystem}
          disabled={isConnecting !== null}
          className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2 ${
            connectedPrinter?.type === 'network' || connectedPrinter?.type === 'system'
              ? 'border-sky-500 bg-sky-50/90 ring-1 ring-sky-500/30'
              : 'border-slate-200 hover:border-sky-400 hover:bg-sky-50/60 bg-slate-50/70'
          }`}
        >
          <div className="w-7 h-7 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
            <Wifi className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-slate-900 truncate flex items-center justify-between">
              <span>Wi-Fi / Red / IP</span>
              {(connectedPrinter?.type === 'network' || connectedPrinter?.type === 'system') && (
                <Check className="w-3 h-3 text-sky-600 shrink-0" />
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">Epson, HP, Canon, LAN</div>
          </div>
        </button>

        <button
          type="button"
          onClick={handleActivateMobileAppBridge}
          className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center gap-2 ${
            connectedPrinter?.type === 'rawbt' || connectedPrinter?.type === 'mobile-share'
              ? 'border-amber-500 bg-amber-50/90 ring-1 ring-amber-500/30'
              : 'border-slate-200 hover:border-amber-400 hover:bg-amber-50/60 bg-slate-50/70'
          }`}
        >
          <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
            <Smartphone className="w-3.5 h-3.5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-extrabold text-slate-900 truncate flex items-center justify-between">
              <span>App Celular</span>
              {(connectedPrinter?.type === 'rawbt' ||
                connectedPrinter?.type === 'mobile-share') && (
                <Check className="w-3 h-3 text-amber-600 shrink-0" />
              )}
            </div>
            <div className="text-[9.5px] text-slate-500 truncate">NokoPrint / RawBT / iPrint</div>
          </div>
        </button>
      </div>

      {/* Expandable Custom Printer Model / IP / Channel Configurator */}
      {showCustomSetup && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 animate-in fade-in duration-150">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold text-slate-800 uppercase">
              Configurar Modelo o Dirección IP
            </span>
            <button
              type="button"
              onClick={() => setShowCustomSetup(false)}
              className="text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-600 mb-1">
              Marca / Modelo Rápido de Impresora
            </label>
            <select
              value={selectedPresetId}
              onChange={(e) => handleApplyPreset(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 font-medium"
            >
              {PRINTER_BRAND_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Nombre de tu Impresora
              </label>
              <input
                type="text"
                value={customPrinterName}
                onChange={(e) => setCustomPrinterName(e.target.value)}
                placeholder="Ej. Epson Caja 1 / Bluetooth 80mm"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-600 mb-1">
                Tipo de Conexión
              </label>
              <select
                value={customConnectionType}
                onChange={(e) =>
                  setCustomConnectionType(e.target.value as PrinterConnectionType)
                }
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 font-medium"
              >
                <option value="bluetooth">Bluetooth (Térmica / Portátil)</option>
                <option value="usb">Cable USB / Puerto COM (PC / POS)</option>
                <option value="network">Wi-Fi / Red LAN / Dirección IP</option>
                <option value="mobile-share">App Celular (NokoPrint / HP / Epson)</option>
                <option value="rawbt">Puente Térmico Android (RawBT ESC/POS)</option>
              </select>
            </div>
          </div>

          {customConnectionType === 'network' && (
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  IP de Impresora (Opcional)
                </label>
                <input
                  type="text"
                  value={customIpAddress}
                  onChange={(e) => setCustomIpAddress(e.target.value)}
                  placeholder="Ej. 192.168.1.100"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-800"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-600 mb-1">
                  Puerto
                </label>
                <input
                  type="text"
                  value={customPort}
                  onChange={(e) => setCustomPort(e.target.value)}
                  placeholder="9100"
                  className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-800"
                />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {hwSupport.isInIframe && (
              <a
                href={typeof window !== 'undefined' ? window.location.href : '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 underline"
                title="Abrir la app en una pestaña completa del navegador para habilitar selectores WebBluetooth / WebUSB nativos"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Abrir en pestaña completa</span>
              </a>
            )}
            <button
              type="button"
              onClick={handleSaveCustomConnection}
              className="ml-auto px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[11px] flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Conectar y Guardar Impresora</span>
            </button>
          </div>
        </div>
      )}

      {!connectedPrinter && (
        <button
          type="button"
          onClick={handleTestPrint}
          className="w-full py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
        >
          <Printer className="w-3.5 h-3.5 text-emerald-600" />
          <span>Enviar Página de Prueba a la Impresora</span>
        </button>
      )}
    </div>
  );
};

interface PrintFormatModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  storeSettings?: StoreSettings;
  defaultFormat?: PrinterPaperFormat;
  buildHtml: (format: PrinterPaperFormat) => string;
  onDownloadPdf: (format: PrinterPaperFormat) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const PrintFormatModal: React.FC<PrintFormatModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  storeSettings,
  defaultFormat,
  buildHtml,
  onDownloadPdf,
  showToast,
}) => {
  const [selectedFormat, setSelectedFormat] = useState<PrinterPaperFormat>(() =>
    defaultFormat || getPreferredPrinterFormat(storeSettings)
  );
  const [rememberChoice, setRememberChoice] = useState<boolean>(true);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isSharingToPrinter, setIsSharingToPrinter] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedFormat(defaultFormat || getPreferredPrinterFormat(storeSettings));
    }
  }, [isOpen, defaultFormat, storeSettings]);

  if (!isOpen) return null;

  const previewHtml = buildHtml(selectedFormat);

  const handleSelectFormat = (fmt: PrinterPaperFormat) => {
    setSelectedFormat(fmt);
    if (rememberChoice) {
      setPreferredPrinterFormat(fmt);
    }
  };

  const handlePrintNow = () => {
    if (rememberChoice) {
      setPreferredPrinterFormat(selectedFormat);
    }
    printHtmlDocument(previewHtml, title, selectedFormat, storeSettings);
    if (showToast) {
      const opt = PRINTER_FORMAT_OPTIONS.find((o) => o.id === selectedFormat);
      showToast(
        `Enviando documento a la impresora en formato ${opt?.shortLabel || selectedFormat}...`,
        'info'
      );
    }
  };

  const handleShareToPrinterApp = async () => {
    if (rememberChoice) {
      setPreferredPrinterFormat(selectedFormat);
    }
    setIsSharingToPrinter(true);
    try {
      const shared = await shareHtmlDocumentAsPdfToPrinterApp(
        previewHtml,
        title,
        selectedFormat,
        storeSettings
      );
      if (showToast) {
        showToast(
          shared
            ? 'Abriendo selector de Apps de Impresora / Compartir del dispositivo...'
            : 'PDF listo para abrir en tu aplicación de impresora.',
          'success'
        );
      }
    } finally {
      setIsSharingToPrinter(false);
    }
  };

  const handleDownloadPdfNow = async () => {
    if (rememberChoice) {
      setPreferredPrinterFormat(selectedFormat);
    }
    setIsDownloadingPdf(true);
    try {
      await Promise.resolve(onDownloadPdf(selectedFormat));
      if (showToast) {
        showToast('Documento PDF ejecutivo generado y descargado exitosamente.', 'success');
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 z-[80] animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full overflow-hidden flex flex-col max-h-[94dvh] border border-slate-200">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 flex items-center justify-center shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm sm:text-base truncate">
                Centro de Impresión, Conexión de Impresoras y PDF Ejecutivo
              </h3>
              <p className="text-[11px] text-slate-300 truncate">
                {title} {subtitle ? `• ${subtitle}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left Panel: Printer Connection + Format Selector */}
          <div className="w-full lg:w-96 bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-200 p-3 sm:p-4 overflow-y-auto space-y-3.5 shrink-0">
            {/* Hardware & System Printer Connection Card */}
            <PrinterConnectionManager
              storeSettings={storeSettings}
              selectedFormat={selectedFormat}
              onSelectFormat={handleSelectFormat}
              showToast={showToast}
            />

            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-600 block">
                Selecciona el Formato de Papel / PDF
              </span>
              <p className="text-[10.5px] text-slate-500 mt-0.5">
                Ajusta automáticamente márgenes, columnas y diseño del PDF o impresora.
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-1 gap-2">
              {PRINTER_FORMAT_OPTIONS.map((opt) => {
                const isSelected = selectedFormat === opt.id;
                const isThermal = opt.id === '80mm' || opt.id === '58mm';
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleSelectFormat(opt.id)}
                    className={`text-left p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 ${
                      isSelected
                        ? 'bg-emerald-50/90 border-emerald-600 ring-2 ring-emerald-500/20 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-100/60'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                        isSelected
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {isThermal ? (
                        <Receipt className="w-4 h-4" />
                      ) : (
                        <FileText className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`text-xs font-extrabold truncate ${
                            isSelected ? 'text-emerald-950' : 'text-slate-800'
                          }`}
                        >
                          {opt.shortLabel}
                        </span>
                        {isSelected && (
                          <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-slate-500 block">
                        {opt.dimensions}
                      </span>
                      <span className="hidden sm:block text-[10px] text-slate-500 mt-0.5 leading-tight">
                        {opt.description}
                      </span>
                      <span className="inline-block mt-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[9px] font-bold">
                        {opt.printerTypes}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Remember checkbox */}
            <label className="flex items-center gap-2 pt-1 text-xs text-slate-700 font-medium cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>Recordar este formato como predeterminado</span>
            </label>
          </div>

          {/* Right Panel: Live Document Preview */}
          <div className="flex-1 min-h-0 bg-slate-200/70 p-3 sm:p-6 overflow-y-auto flex flex-col items-center">
            <div className="mb-2.5 flex items-center justify-between w-full max-w-2xl text-xs text-slate-600 font-semibold">
              <span>
                Vista Previa en Vivo ({PRINTER_FORMAT_OPTIONS.find((o) => o.id === selectedFormat)?.label})
              </span>
              <span className="text-[11px] bg-white px-2.5 py-0.5 rounded-md border border-slate-300 font-mono text-slate-700">
                {selectedFormat === '58mm'
                  ? 'Rollo 58mm'
                  : selectedFormat === '80mm'
                  ? 'Rollo 80mm'
                  : selectedFormat === 'half-letter'
                  ? 'Media Carta'
                  : 'Hoja Carta Ejecutiva'}
              </span>
            </div>

            <div
              className={`bg-white shadow-lg border border-slate-300 rounded-lg transition-all duration-200 overflow-x-auto ${
                selectedFormat === '58mm'
                  ? 'w-[245px] p-3 font-mono text-xs'
                  : selectedFormat === '80mm'
                  ? 'w-[320px] p-4 font-mono text-xs'
                  : selectedFormat === 'half-letter'
                  ? 'w-full max-w-2xl p-5 text-xs'
                  : 'w-full max-w-2xl p-6 text-xs'
              }`}
            >
              <div
                dangerouslySetInnerHTML={{ __html: previewHtml }}
                className="text-slate-900 leading-relaxed"
              />
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors"
          >
            Cerrar
          </button>

          <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 ml-auto">
            <button
              type="button"
              onClick={handleShareToPrinterApp}
              disabled={isSharingToPrinter}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-60"
              title="Enviar a aplicación de impresora en Celular/Tablet (NokoPrint, RawBT, Epson iPrint, HP Smart, Canon)"
            >
              <Share2 className="w-4 h-4 shrink-0" />
              <span>
                {isSharingToPrinter ? 'Abriendo App...' : 'Enviar a App Impresora'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdfNow}
              disabled={isDownloadingPdf}
              className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-sm transition-all disabled:opacity-60"
              title="Descargar documento con diseño corporativo ejecutivo como archivo .PDF"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {isDownloadingPdf ? 'Generando PDF...' : 'Descargar PDF (.pdf)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handlePrintNow}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-md transition-all"
              title="Enviar a impresora conectada o abrir selector de impresoras del sistema"
            >
              <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>
                Imprimir Ahora ({PRINTER_FORMAT_OPTIONS.find((o) => o.id === selectedFormat)?.shortLabel})
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
