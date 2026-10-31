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
  BridgePrinterInfo,
  getBridgeConfig,
  saveBridgeConfig,
  fetchBridgePrinters,
  downloadStandaloneBridgeScript,
} from '../utils/universalPrintBridge';
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
  const [isExpanded, setIsExpanded] = useState<boolean>(!compact);

  // Custom Setup Form State
  const [selectedPresetId, setSelectedPresetId] = useState<string>('generic-bt-80');
  const [customPrinterName, setCustomPrinterName] = useState<string>('');
  const [customConnectionType, setCustomConnectionType] =
    useState<PrinterConnectionType>('bluetooth');
  const [customIpAddress, setCustomIpAddress] = useState<string>('');
  const [customPort, setCustomPort] = useState<string>('9100');

  // PC Bridge State (saved in localStorage: IP de PC de Caja + Impresora de Windows)
  const initialBridge = getBridgeConfig();
  const [bridgePcIp, setBridgePcIp] = useState<string>(initialBridge.pcIp);
  const [bridgePrinterName, setBridgePrinterName] = useState<string>(initialBridge.printerName);
  const [bridgeEnabled, setBridgeEnabled] = useState<boolean>(initialBridge.enabled);
  const [bridgePrintersList, setBridgePrintersList] = useState<BridgePrinterInfo[]>([]);
  const [isLoadingBridgePrinters, setIsLoadingBridgePrinters] = useState<boolean>(false);

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

  const handleFetchBridgePrinters = async () => {
    setIsLoadingBridgePrinters(true);
    try {
      const res = await fetchBridgePrinters(bridgePcIp);
      if (res.ok && res.printers.length > 0) {
        setBridgePrintersList(res.printers);
        const defaultP = res.printers.find((p) => p.isDefault) || res.printers[0];
        const chosen = bridgePrinterName || defaultP.name;
        setBridgePrinterName(chosen);
        saveBridgeConfig({
          pcIp: bridgePcIp,
          printerName: chosen,
          enabled: true,
        });
        setBridgeEnabled(true);
        if (showToast) {
          showToast(
            `¡Conectado a PC de Caja! ${res.printers.length} impresora(s) detectada(s).`,
            'success'
          );
        }
      } else {
        setBridgePrintersList([]);
        if (showToast) {
          showToast(
            res.error ||
              'No se detectó el servidor puente en esa IP. Se usará impresión nativa de respaldo.',
            'warning'
          );
        }
      }
    } finally {
      setIsLoadingBridgePrinters(false);
    }
  };

  const handleSaveBridgeConfig = async () => {
    const saved = saveBridgeConfig({
      pcIp: bridgePcIp,
      printerName: bridgePrinterName,
      enabled: Boolean(bridgePcIp.trim() || bridgePrinterName.trim()),
    });
    setBridgeEnabled(saved.enabled);
    await connectNetworkOrSystemPrinter({
      customName: saved.printerName
        ? `${saved.printerName} (PC Caja ${saved.pcIp || 'Local'})`
        : `Puente PC Caja (${saved.pcIp || 'Local'})`,
      ipAddress: saved.pcIp || undefined,
      port: '4000',
      paperWidth,
      preferredFormat: selectedFormat,
    });
    if (showToast) {
      showToast(
        `Configuración guardada: PC (${saved.pcIp || 'Local'}) → ${saved.printerName || 'Impresora predeterminada'}`,
        'success'
      );
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5 space-y-2 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <PlugZap className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800 truncate">
            {connectedPrinter ? connectedPrinter.name : 'Impresora POS / Oficina'}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {connectedPrinter?.status === 'connected' ? (
            <span className="text-[10px] font-bold text-emerald-700">Conectada</span>
          ) : (
            <span className="text-[10px] font-medium text-slate-500">Sistema</span>
          )}
          {compact && (
            <button
              type="button"
              onClick={() => setIsExpanded((v) => !v)}
              className="px-2 py-1 rounded-md border border-slate-200 hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
            >
              {isExpanded ? 'Ocultar' : 'Cambiar'}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setIsExpanded(true);
              setShowCustomSetup((v) => !v);
            }}
            className="p-1 rounded-md border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
            title="Configurar modelo, marca o dirección IP de la impresora"
          >
            <Settings2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isExpanded && (
        <>

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

      {/* Puente Universal PC de Caja (IP LocalStorage + Selector de Impresora Windows) */}
      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-extrabold text-slate-800 uppercase flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Puente PC de Caja (iPhone / Android / PC → Windows)</span>
          </span>
          <button
            type="button"
            onClick={downloadStandaloneBridgeScript}
            className="text-[10px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer shrink-0"
            title="Descargar script Node.js (servidor-puente-impresora.cjs) para ejecutar en la PC Windows de caja"
          >
            Descargar Script PC
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-1.5 items-end">
          <div className="sm:col-span-5">
            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
              IP de la PC de Caja (Puerto 4000)
            </label>
            <input
              type="text"
              value={bridgePcIp}
              onChange={(e) => setBridgePcIp(e.target.value)}
              placeholder="Ej. 192.168.1.50:4000"
              className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-mono text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="sm:col-span-5">
            <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
              Impresora Seleccionada en PC
            </label>
            {bridgePrintersList.length > 0 ? (
              <select
                value={bridgePrinterName}
                onChange={(e) => setBridgePrinterName(e.target.value)}
                className="w-full px-2 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 font-semibold focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {bridgePrintersList.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} {p.isDefault ? '(Predeterminada)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={bridgePrinterName}
                onChange={(e) => setBridgePrinterName(e.target.value)}
                placeholder="Nombre en Windows o Predeterminada"
                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            )}
          </div>

          <div className="sm:col-span-2 flex gap-1">
            <button
              type="button"
              onClick={handleFetchBridgePrinters}
              disabled={isLoadingBridgePrinters}
              className="flex-1 py-1.5 px-2 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-[10.5px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
              title="Consultar GET /impresoras en la PC de caja"
            >
              <RefreshCw className={`w-3 h-3 ${isLoadingBridgePrinters ? 'animate-spin' : ''}`} />
              <span>Buscar</span>
            </button>
            <button
              type="button"
              onClick={handleSaveBridgeConfig}
              className="flex-1 py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10.5px] flex items-center justify-center gap-1 cursor-pointer transition-colors"
              title="Guardar IP de PC de caja e impresora en localStorage"
            >
              <Check className="w-3 h-3" />
              <span>Guardar</span>
            </button>
          </div>
        </div>

        {bridgeEnabled && (bridgePcIp || bridgePrinterName) && (
          <div className="text-[10px] text-emerald-800 font-semibold flex items-center justify-between bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
            <span>
              ✓ Activo: PC <strong>{bridgePcIp || 'localhost:4000'}</strong> →{' '}
              <strong>{bridgePrinterName || 'Impresora Predeterminada'}</strong> (con respaldo automático window.print)
            </span>
          </div>
        )}
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
        </>
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
  const [showPrinterConfig, setShowPrinterConfig] = useState<boolean>(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState<boolean>(false);
  const [isSharingToPrinter, setIsSharingToPrinter] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedFormat(defaultFormat || getPreferredPrinterFormat(storeSettings));
      setShowPrinterConfig(false);
    }
  }, [isOpen, defaultFormat, storeSettings]);

  if (!isOpen) return null;

  const previewHtml = buildHtml(selectedFormat);
  const isThermal = selectedFormat === '80mm' || selectedFormat === '58mm';

  const handleSelectFormat = (fmt: PrinterPaperFormat) => {
    setSelectedFormat(fmt);
    setPreferredPrinterFormat(fmt);
  };

  const handlePrintNow = () => {
    setPreferredPrinterFormat(selectedFormat);
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
    setPreferredPrinterFormat(selectedFormat);
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
    setPreferredPrinterFormat(selectedFormat);
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
      <style>{`
        .gosen-preview-sheet table {
          width: 100%;
          border-collapse: collapse;
        }
        .gosen-preview-sheet th,
        .gosen-preview-sheet td {
          padding: ${isThermal ? '4px 3px' : '7px 10px'};
          text-align: left;
          vertical-align: top;
        }
        .gosen-preview-sheet .text-right { text-align: right; }
        .gosen-preview-sheet .text-center { text-align: center; }
        .gosen-preview-sheet .font-bold { font-weight: 700; }
        .gosen-preview-sheet .font-black { font-weight: 900; }
        .gosen-preview-sheet .dashed-line {
          border-top: 1px dashed #334155;
          margin: 6px 0;
        }
        .gosen-preview-sheet .solid-line {
          border-top: 2px solid #0f172a;
          margin: 8px 0;
        }
        .gosen-preview-sheet .kpi-grid {
          display: grid;
          grid-template-columns: repeat(${isThermal ? '2' : '4'}, 1fr);
          gap: 8px;
          margin: 12px 0;
        }
        .gosen-preview-sheet .kpi-box {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 8px 10px;
          background: #f8fafc;
        }
        .gosen-preview-sheet .kpi-label {
          font-size: 9.5px;
          text-transform: uppercase;
          color: #475569;
          font-weight: 700;
        }
        .gosen-preview-sheet .kpi-value {
          font-size: ${isThermal ? '13px' : '15px'};
          font-weight: 800;
          color: #0f172a;
          margin-top: 2px;
        }
        .gosen-preview-sheet .signatures {
          display: flex;
          justify-content: space-around;
          gap: 20px;
          margin-top: 28px;
          padding-top: 14px;
        }
        .gosen-preview-sheet .sig-block {
          flex: 1;
          max-width: 220px;
          text-align: center;
        }
        .gosen-preview-sheet .sig-line {
          border-top: 1px solid #334155;
          margin-bottom: 6px;
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col h-[92dvh] max-h-[92dvh] border border-slate-200">
        {/* Clean Header */}
        <div className="px-4 sm:px-6 py-3 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Printer className="w-5 h-5 text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <h3 className="font-bold text-sm sm:text-base truncate">{title}</h3>
              {subtitle && (
                <p className="text-[11px] text-slate-300 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Compact Format & Optional Printer Setup Bar */}
        <div className="px-3 sm:px-6 py-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-200/80 p-1 rounded-xl overflow-x-auto max-w-full">
            {PRINTER_FORMAT_OPTIONS.map((opt) => {
              const isSelected = selectedFormat === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectFormat(opt.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {opt.shortLabel}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowPrinterConfig((v) => !v)}
            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
              showPrinterConfig
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span>{showPrinterConfig ? 'Ocultar Impresora' : 'Conexión de Impresora'}</span>
          </button>
        </div>

        {/* Collapsible Printer Connection Drawer (Hidden by Default for Cleanliness) */}
        {showPrinterConfig && (
          <div className="p-3 sm:p-4 bg-slate-100 border-b border-slate-200 max-h-60 overflow-y-auto shrink-0">
            <PrinterConnectionManager
              storeSettings={storeSettings}
              selectedFormat={selectedFormat}
              onSelectFormat={handleSelectFormat}
              showToast={showToast}
            />
          </div>
        )}

        {/* Full-Height Scrollable Document Preview */}
        <div className="flex-1 min-h-0 bg-slate-100 p-3 sm:p-6 overflow-y-auto overscroll-contain">
          <div
            className={`gosen-preview-sheet mx-auto bg-white shadow-sm border border-slate-200/90 rounded-xl transition-all duration-150 ${
              selectedFormat === '58mm'
                ? 'w-[260px] p-3.5 font-mono text-xs'
                : selectedFormat === '80mm'
                ? 'w-[340px] p-4 font-mono text-xs'
                : selectedFormat === 'half-letter'
                ? 'w-full max-w-2xl p-5 sm:p-6 text-xs'
                : 'w-full max-w-3xl p-5 sm:p-8 text-xs'
            }`}
          >
            <div
              dangerouslySetInnerHTML={{ __html: previewHtml }}
              className="text-slate-900 leading-relaxed"
            />
          </div>
        </div>

        {/* Clean Footer Actions */}
        <div className="px-4 sm:px-6 py-3 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer transition-colors whitespace-nowrap shrink-0"
          >
            Cerrar
          </button>

          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handleShareToPrinterApp}
              disabled={isSharingToPrinter}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all disabled:opacity-60 whitespace-nowrap shrink-0"
              title="Compartir o enviar a App de Impresora móvil"
            >
              <Share2 className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {isSharingToPrinter ? 'Abriendo...' : 'App Móvil'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdfNow}
              disabled={isDownloadingPdf}
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-xs transition-all disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>{isDownloadingPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrintNow}
              className="px-4 sm:px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 cursor-pointer shadow-xs transition-all whitespace-nowrap shrink-0"
            >
              <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Imprimir</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

