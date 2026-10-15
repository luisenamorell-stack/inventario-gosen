import React, { useState, useEffect, useRef } from 'react';
import { Product, AuditSessionItem, GroupedAuditItem, AuditHistoryRecord, StoreSettings } from '../types';
import { playSound } from '../utils/audio';
import { PrintableReport } from './PrintableReport';
import { ConfirmDialog } from './ConfirmDialog';
import {
  ClipboardList,
  Printer,
  Sparkles,
  Camera,
  CameraOff,
  Barcode,
  CheckCircle2,
  ArrowDown,
  ArrowUp,
  X,
  Bot,
  RotateCcw,
  Check,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  Calculator,
  Search,
  SlidersHorizontal,
  CheckCheck
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface AuditViewProps {
  inventory: Product[];
  onApplyAuditChanges: (updatedInventory: Product[], historyRecord: AuditHistoryRecord) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  storeSettings?: StoreSettings;
}

export const AuditView: React.FC<AuditViewProps> = ({
  inventory,
  onApplyAuditChanges,
  showToast,
  storeSettings,
}) => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showMatchAllConfirm, setShowMatchAllConfirm] = useState(false);
  const [auditSession, setAuditSession] = useState<Record<string, AuditSessionItem>>({});
  
  // Scanning & Manual input states
  const [manualCode, setManualCode] = useState('');
  const [scanQuantity, setScanQuantity] = useState<number>(1);
  const [lastScannedCode, setLastScannedCode] = useState<string | null>(null);
  const [lastScannedGroup, setLastScannedGroup] = useState<string | null>(null);
  const [lastScannedItemInfo, setLastScannedItemInfo] = useState<{
    name: string;
    code: string;
    qtyAdded?: number;
    isError?: boolean;
  }>({ name: '-', code: '-' });

  // Table expansion state for variants
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Batch Count Modal state
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchSearch, setBatchSearch] = useState('');
  const [batchSelectedCode, setBatchSelectedCode] = useState('');
  const [batchQuantity, setBatchQuantity] = useState<number>(0);
  const [batchMode, setBatchMode] = useState<'set' | 'add'>('set');

  // Camera state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Modals state
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInsightModalOpen, setAiInsightModalOpen] = useState(false);
  const [aiInsightContent, setAiInsightContent] = useState('');

  // Result / Summary Modal
  const [isResultModalOpen, setIsResultModalOpen] = useState(false);
  const [summaryData, setSummaryData] = useState<{
    match: number;
    missing: number;
    extra: number;
    netImpact: number;
    discrepancies: {
      name: string;
      expected: number;
      counted: number;
      diff: number;
      impact: number;
    }[];
    aiSummary: string;
  }>({
    match: 0,
    missing: 0,
    extra: 0,
    netImpact: 0,
    discrepancies: [],
    aiSummary: '',
  });

  const lastScannedRowRef = useRef<HTMLTableRowElement | null>(null);

  // Start new audit session
  const startAudit = () => {
    const session: Record<string, AuditSessionItem> = {};
    inventory.forEach((item) => {
      session[item.code] = {
        item,
        expected: Number(item.stock) || 0,
        counted: 0,
      };
    });
    setAuditSession(session);
    setIsAuditing(true);
    setLastScannedCode(null);
    setLastScannedGroup(null);
    setLastScannedItemInfo({ name: '-', code: '-' });
    setExpandedGroups({});
  };

  // Direct count setters
  const handleSetCount = (code: string, newCount: number) => {
    const validCount = Math.max(0, Math.round(Number(newCount) || 0));
    setAuditSession((prev) => {
      if (!prev[code]) return prev;
      return {
        ...prev,
        [code]: {
          ...prev[code],
          counted: validCount,
        },
      };
    });
    playSound('beep');
    setLastScannedCode(code);
    if (auditSession[code]) {
      setLastScannedGroup(auditSession[code].item.name);
      setLastScannedItemInfo({
        name: `${auditSession[code].item.name}${auditSession[code].item.size ? ` (Talla: ${auditSession[code].item.size})` : ''}`,
        code,
        qtyAdded: validCount,
        isError: false,
      });
    }
  };

  const handleAddCount = (code: string, delta: number) => {
    setAuditSession((prev) => {
      if (!prev[code]) return prev;
      const nextCount = Math.max(0, prev[code].counted + delta);
      return {
        ...prev,
        [code]: {
          ...prev[code],
          counted: nextCount,
        },
      };
    });
    playSound('beep');
  };

  const handleMatchItem = (code: string) => {
    setAuditSession((prev) => {
      if (!prev[code]) return prev;
      return {
        ...prev,
        [code]: {
          ...prev[code],
          counted: prev[code].expected,
        },
      };
    });
    playSound('beep');
    showToast(`Stock de "${auditSession[code]?.item.name || code}" fijado a ${auditSession[code]?.expected || 0}`, 'info');
  };

  const handleMatchAll = () => {
    setAuditSession((prev) => {
      const updated: Record<string, AuditSessionItem> = {};
      Object.entries(prev).forEach(([code, data]) => {
        updated[code] = {
          ...data,
          counted: data.expected,
        };
      });
      return updated;
    });
    setShowMatchAllConfirm(false);
    playSound('beep');
    showToast('Todos los artículos se igualaron al stock del sistema. Puedes ajustar las discrepancias.', 'success');
  };

  const toggleGroupExpand = (groupName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupName]: !prev[groupName],
    }));
  };

  // Process a scanned or typed barcode with custom quantity
  const processScanCode = (code: string, qty: number = scanQuantity) => {
    const trimmedCode = code.trim();
    if (!trimmedCode) return;
    const quantityToAdd = Math.max(1, Math.round(Number(qty) || 1));

    if (auditSession[trimmedCode]) {
      // Recognized product
      playSound('beep');
      const item = auditSession[trimmedCode].item;
      setAuditSession((prev) => ({
        ...prev,
        [trimmedCode]: {
          ...prev[trimmedCode],
          counted: prev[trimmedCode].counted + quantityToAdd,
        },
      }));

      setLastScannedCode(trimmedCode);
      setLastScannedGroup(item.name);
      setLastScannedItemInfo({
        name: `${item.name}${item.size ? ` (Talla: ${item.size})` : ''}`,
        code: trimmedCode,
        qtyAdded: quantityToAdd,
        isError: false,
      });

      showToast(`+${quantityToAdd} "${item.name}" registrado`, 'success');
    } else {
      // Unrecognized product
      playSound('error');
      showToast(`Código desconocido: ${trimmedCode}`, 'warning');
      setLastScannedItemInfo({
        name: 'CÓDIGO NO REGISTRADO',
        code: trimmedCode,
        isError: true,
      });
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      processScanCode(manualCode, scanQuantity);
      setManualCode('');
    }
  };

  // Handle batch count modal submission
  const handleBatchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchSelectedCode) {
      showToast('Por favor selecciona un artículo', 'warning');
      return;
    }

    const qty = Math.max(0, Math.round(Number(batchQuantity) || 0));

    if (batchMode === 'set') {
      handleSetCount(batchSelectedCode, qty);
      showToast(`Total de "${auditSession[batchSelectedCode]?.item.name}" fijado en ${qty}`, 'success');
    } else {
      handleAddCount(batchSelectedCode, qty);
      showToast(`+${qty} unidades añadidas al conteo`, 'success');
    }

    setIsBatchModalOpen(false);
    setBatchSelectedCode('');
    setBatchQuantity(0);
  };

  // Camera scanner control
  const startScanner = async () => {
    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode('audit-reader');
      scannerRef.current = html5QrCode;
      setIsCameraActive(true);

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 160 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          // Pause briefly to prevent duplicate multi-scans of same code
          if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
            scannerRef.current.pause();
            processScanCode(decodedText, scanQuantity);
            setTimeout(() => {
              if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.PAUSED) {
                scannerRef.current.resume();
              }
            }, 900);
          }
        },
        () => {
          // ignore scan errors
        }
      );
    } catch (err: any) {
      console.error('Error starting scanner:', err);
      showToast('No se pudo acceder a la cámara. Revisa los permisos.', 'error');
      setIsCameraActive(false);
      scannerRef.current = null;
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error('Error stopping scanner:', err);
      } finally {
        scannerRef.current = null;
        setIsCameraActive(false);
      }
    }
  };

  // Cleanup scanner on unmount
  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Auto-scroll to last scanned row
  useEffect(() => {
    if (lastScannedRowRef.current) {
      lastScannedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [lastScannedGroup]);

  // Compute grouped items for display
  const groupedItems: GroupedAuditItem[] = React.useMemo(() => {
    const map: Record<string, GroupedAuditItem> = {};

    Object.values(auditSession).forEach(({ item, expected, counted }) => {
      const name = item.name;
      if (!map[name]) {
        map[name] = {
          name,
          category: item.category,
          supplier: item.supplier,
          expected: 0,
          counted: 0,
          codes: [],
          hasBeenScanned: false,
          details: [],
        };
      }
      map[name].expected += expected;
      map[name].counted += counted;
      map[name].codes.push(item.code);
      if (counted > 0) map[name].hasBeenScanned = true;

      map[name].details.push({
        code: item.code,
        size: item.size,
        expected,
        counted,
        price: Number(item.price) || 0,
        cost: Number(item.cost) || 0,
      });
    });

    return Object.values(map).sort((a, b) => a.name.localeCompare(b.name));
  }, [auditSession]);

  const uniqueScannedCount = Object.values(auditSession).filter((s) => s.counted > 0).length;
  const totalPhysicalUnits = Object.values(auditSession).reduce((sum, s) => sum + s.counted, 0);

  // In-progress AI Analysis
  const handleAnalyzeWithAI = async () => {
    const aiData = groupedItems.map((group) => {
      const diff = group.counted - group.expected;
      return `- ${group.name} (${group.category || 'General'}): Sistema=${group.expected}, Físico=${group.counted}, Dif=${diff}`;
    });

    if (aiData.length === 0) {
      showToast('No hay datos suficientes para analizar.', 'warning');
      return;
    }

    setIsAiLoading(true);
    try {
      const res = await fetch('/api/gemini/analyze-audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auditData: aiData }),
      });

      const data = await res.json();
      if (res.ok && data.analysis) {
        setAiInsightContent(data.analysis);
        setAiInsightModalOpen(true);
      } else {
        throw new Error(data.message || 'Error en respuesta de IA');
      }
    } catch (err: any) {
      console.error('Error with AI analysis:', err);
      showToast('Error al conectar con la Inteligencia Artificial.', 'error');
    } finally {
      setIsAiLoading(false);
    }
  };

  // Finish Audit & Generate Report
  const handleFinishAudit = async () => {
    await stopScanner();
    setIsAiLoading(true);

    let match = 0;
    let missing = 0;
    let extra = 0;
    let totalNetImpact = 0;
    const discrepancies: {
      name: string;
      expected: number;
      counted: number;
      diff: number;
      impact: number;
    }[] = [];

    const discrepancyDescriptions: string[] = [];

    groupedItems.forEach((group) => {
      const diff = group.counted - group.expected;
      let groupImpact = 0;
      group.details.forEach((d) => {
        groupImpact += (d.counted - d.expected) * d.price;
      });

      totalNetImpact += groupImpact;

      if (diff === 0) {
        match++;
      } else {
        if (diff < 0) missing++;
        if (diff > 0) extra++;

        discrepancies.push({
          name: group.name,
          expected: group.expected,
          counted: group.counted,
          diff,
          impact: groupImpact,
        });

        discrepancyDescriptions.push(
          `Producto: ${group.name} | Sistema: ${group.expected} | Contado: ${group.counted} | Dif: ${diff} | Impacto L: ${groupImpact.toFixed(2)}`
        );
      }
    });

    // Call server Gemini endpoint for executive summary
    let aiSummary = '';
    try {
      const res = await fetch('/api/gemini/financial-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          match,
          missing,
          extra,
          netImpact: totalNetImpact,
          discrepancies: discrepancyDescriptions,
        }),
      });

      const data = await res.json();
      if (res.ok && data.summary) {
        aiSummary = data.summary;
      }
    } catch (err) {
      console.error('Error fetching financial summary:', err);
    }

    setSummaryData({
      match,
      missing,
      extra,
      netImpact: totalNetImpact,
      discrepancies,
      aiSummary,
    });

    setIsAiLoading(false);
    setIsResultModalOpen(true);
  };

  // Apply Changes to inventory
  const handleApplyChanges = () => {
    const updatedInventory = inventory.map((product) => {
      if (auditSession[product.code]) {
        return {
          ...product,
          stock: auditSession[product.code].counted,
        };
      }
      return product;
    });

    const dateStr = new Date().toLocaleString('es-HN', {
      dateStyle: 'long',
      timeStyle: 'short',
    });

    const newRecord: AuditHistoryRecord = {
      id: Date.now().toString(),
      date: dateStr,
      timestamp: Date.now(),
      match: summaryData.match,
      missing: summaryData.missing,
      extra: summaryData.extra,
      netImpact: summaryData.netImpact,
      totalItems: inventory.length,
    };

    onApplyAuditChanges(updatedInventory, newRecord);

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    setIsResultModalOpen(false);
    setIsAuditing(false);
    showToast('¡Inventario y stock actualizados exitosamente!', 'success');
  };

  const handlePrint = () => {
    window.print();
  };

  // Filtered products for Batch Modal
  const batchFilteredProducts = inventory.filter((item) => {
    const q = batchSearch.toLowerCase().trim();
    return (
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      (item.size && item.size.toLowerCase().includes(q))
    );
  });

  // ================= RENDER START SCREEN =================
  if (!isAuditing) {
    return (
      <div className="flex-1 flex flex-col p-4 lg:p-6 h-full w-full bg-slate-100">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">Auditoría de Inventario</h1>
          <p className="text-sm text-slate-500">
            Escanea códigos o ingresa totales por lote para cuadrar el stock físico vs sistema.
          </p>
        </header>

        <div className="flex-1 flex items-center justify-center">
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
            <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-3xl mx-auto mb-6">
              <ClipboardList className="w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">Iniciar Nuevo Conteo</h2>
            <p className="text-slate-500 text-sm mb-6 leading-relaxed">
              El sistema te permite contar escaneando uno a uno o ingresando cantidades totales de forma manual y directa por artículo.
            </p>
            <button
              onClick={startAudit}
              className="w-full bg-emerald-600 text-white py-3.5 rounded-xl font-bold hover:bg-emerald-700 transition-colors shadow-md shadow-emerald-500/20 cursor-pointer text-base"
            >
              Comenzar Auditoría
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ================= RENDER ACTIVE AUDIT INTERFACE =================
  return (
    <div className="flex-1 flex flex-col p-4 lg:p-6 h-full w-full bg-slate-100 overflow-hidden">
      {/* Header with action controls */}
      <header className="mb-4 flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-slate-800">Auditoría en Progreso</h1>
            <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2.5 py-0.5 rounded-full">
              {totalPhysicalUnits} unidades contadas
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Ingresa cantidades totales directamente en la tabla, por lote o con el escáner.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          {/* Quick Batch Entry Button */}
          <button
            onClick={() => {
              setBatchQuantity(0);
              setBatchMode('set');
              setIsBatchModalOpen(true);
            }}
            className="bg-emerald-600 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold hover:bg-emerald-700 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Ingresar o ajustar cantidad total por artículo"
          >
            <Calculator className="w-4 h-4" />
            <span>Ingreso por Lote</span>
          </button>

          {/* Match All Button */}
          <button
            onClick={() => setShowMatchAllConfirm(true)}
            className="bg-white border border-slate-200 text-slate-700 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium hover:bg-slate-50 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Cuadrar todo con el stock del sistema"
          >
            <CheckCheck className="w-4 h-4 text-emerald-600" />
            <span>Cuadrar Todo</span>
          </button>

          {/* AI Analysis Button */}
          <button
            onClick={handleAnalyzeWithAI}
            className="bg-purple-600 text-white px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
            title="Analizar patrones y discrepancias con IA"
          >
            <Sparkles className="w-4 h-4" />
            <span>Analizar con IA</span>
          </button>

          {/* Finalize Button */}
          <button
            onClick={handleFinishAudit}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs sm:text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Finalizar Conteo</span>
          </button>
        </div>
      </header>

      {/* Main Dual Columns */}
      <div className="flex-1 flex flex-col lg:flex-row gap-6 h-full overflow-hidden">
        {/* Left Column: Scanner, Multiplier, and Manual Entry (1/3) */}
        <div className="w-full lg:w-1/3 flex flex-col gap-4 overflow-y-auto no-scrollbar shrink-0">
          {/* Scanner Card with Multiplier */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-700 flex items-center gap-2 text-sm">
                <Barcode className="w-4 h-4 text-slate-400" />
                <span>Escáner y Multiplicador</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setBatchQuantity(0);
                  setBatchMode('set');
                  setIsBatchModalOpen(true);
                }}
                className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Ingreso Total</span>
              </button>
            </div>

            {/* Quantity Multiplier Toolbar */}
            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 mb-3">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1">
                  <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                  <span>Cantidad por Escaneo / Ingreso:</span>
                </label>
                <span className="text-xs font-bold text-blue-600 font-mono">
                  +{scanQuantity} unids
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min="1"
                  value={scanQuantity}
                  onChange={(e) =>
                    setScanQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))
                  }
                  className="w-16 p-1.5 border border-slate-300 rounded-lg text-center font-bold text-sm bg-white outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <div className="flex flex-1 gap-1 overflow-x-auto no-scrollbar">
                  {[1, 5, 10, 25, 50].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setScanQuantity(val)}
                      className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                        scanQuantity === val
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      +{val}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Camera Viewport */}
            <div
              className={`w-full rounded-xl overflow-hidden bg-slate-50 relative ${
                isCameraActive ? 'block' : 'hidden'
              }`}
            >
              <div id="audit-reader" className="w-full min-h-[180px]"></div>
              {isCameraActive && (
                <div className="absolute bottom-3 left-0 right-0 flex justify-center z-10">
                  <button
                    onClick={stopScanner}
                    className="px-4 py-1.5 bg-rose-600 text-white rounded-full text-xs font-semibold hover:bg-rose-700 shadow-md flex items-center gap-1.5 cursor-pointer"
                  >
                    <CameraOff className="w-3.5 h-3.5" />
                    <span>Detener Cámara</span>
                  </button>
                </div>
              )}
            </div>

            {/* Camera Placeholder */}
            {!isCameraActive && (
              <div className="text-center py-5 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
                >
                  <Camera className="w-4 h-4 text-emerald-400" />
                  <span>Activar Cámara</span>
                </button>
              </div>
            )}

            {/* Manual Barcode Input Divider */}
            <div className="mt-3 flex items-center gap-3">
              <div className="flex-1 h-px bg-slate-200"></div>
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                O INGRESO POR CÓDIGO
              </span>
              <div className="flex-1 h-px bg-slate-200"></div>
            </div>

            {/* Manual Form */}
            <form onSubmit={handleManualSubmit} className="mt-2.5">
              <div className="relative">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder={`Escribe SKU y suma +${scanQuantity}...`}
                  className="w-full p-2.5 pr-20 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-slate-50 font-mono"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  Sumar
                </button>
              </div>
            </form>
          </div>

          {/* Quick Session Progress Card */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-col gap-3">
            <div className="flex justify-between items-center text-sm">
              <span className="text-slate-500 font-medium">Modelos con Conteo</span>
              <span className="font-bold text-slate-800 text-base">{uniqueScannedCount}</span>
            </div>

            <div
              className={`p-3 rounded-xl border transition-colors ${
                lastScannedItemInfo.isError
                  ? 'bg-rose-50 border-rose-200'
                  : 'bg-blue-50 border-blue-100'
              }`}
            >
              <div className="flex justify-between items-center mb-0.5">
                <p
                  className={`text-[10px] font-bold uppercase tracking-wider ${
                    lastScannedItemInfo.isError ? 'text-rose-600' : 'text-blue-600'
                  }`}
                >
                  Último Registro
                </p>
                {lastScannedItemInfo.qtyAdded && (
                  <span className="text-[10px] font-bold bg-blue-200 text-blue-800 px-1.5 py-0.2 rounded">
                    +{lastScannedItemInfo.qtyAdded}
                  </span>
                )}
              </div>
              <p
                className={`font-semibold text-sm truncate ${
                  lastScannedItemInfo.isError ? 'text-rose-700' : 'text-slate-800'
                }`}
                title={lastScannedItemInfo.name}
              >
                {lastScannedItemInfo.name}
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {lastScannedItemInfo.code}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="mt-1 text-xs text-slate-400 hover:text-slate-600 flex items-center justify-center gap-1 cursor-pointer py-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reiniciar conteos de sesión a 0</span>
            </button>
          </div>
        </div>

        {/* Right Column: Grouped Audit Table with Inline Quantity Inputs (2/3) */}
        <div className="w-full lg:w-2/3 bg-white border border-slate-200 rounded-2xl flex flex-col shadow-sm overflow-hidden h-full">
          <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap justify-between items-center gap-2 shrink-0">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                Detalle de Auditoría & Conteo Directo
              </h3>
              <p className="text-xs text-slate-500">
                Escribe la cantidad directamente en cada casilla para ajustar el total.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" /> Exacto
              </span>
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-red-50 text-red-700">
                <ArrowDown className="w-3 h-3" /> Faltante
              </span>
              <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-orange-50 text-orange-700">
                <ArrowUp className="w-3 h-3" /> Sobrante
              </span>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-white z-10 shadow-sm">
                <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                  <th className="p-3 pl-4 font-semibold">Producto / Modelo</th>
                  <th className="p-3 font-semibold text-center w-24">Stock Sist.</th>
                  <th className="p-3 font-semibold text-center w-48">Conteo Físico Total</th>
                  <th className="p-3 pr-4 font-semibold text-right w-28">Diferencia</th>
                </tr>
              </thead>
              <tbody className="text-sm divide-y divide-slate-100">
                {groupedItems.map((group) => {
                  const diff = group.counted - group.expected;
                  const isLastScanned = group.name === lastScannedGroup;
                  const hasMultipleVariants = group.details.length > 1;
                  const isExpanded = !!expandedGroups[group.name];

                  let statusBadge = (
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-emerald-600 bg-emerald-50">
                      <Check className="w-3.5 h-3.5" /> Exacto
                    </span>
                  );

                  if (diff < 0) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-red-600 bg-red-50">
                        <ArrowDown className="w-3.5 h-3.5" /> {diff}
                      </span>
                    );
                  } else if (diff > 0) {
                    statusBadge = (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold text-orange-600 bg-orange-50">
                        <ArrowUp className="w-3.5 h-3.5" /> +{diff}
                      </span>
                    );
                  }

                  return (
                    <React.Fragment key={group.name}>
                      <tr
                        ref={isLastScanned ? lastScannedRowRef : null}
                        className={
                          isLastScanned
                            ? 'bg-blue-50/80 transition-colors duration-300'
                            : 'hover:bg-slate-50 transition-colors'
                        }
                      >
                        {/* Product Info & Expand button */}
                        <td className="p-3 pl-4 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            {hasMultipleVariants ? (
                              <button
                                type="button"
                                onClick={() => toggleGroupExpand(group.name)}
                                className="p-1 hover:bg-slate-200 rounded-md text-slate-500 transition-colors cursor-pointer"
                                title={isExpanded ? 'Ocultar tallas' : 'Ver y editar tallas'}
                              >
                                {isExpanded ? (
                                  <ChevronDown className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <ChevronRight className="w-4 h-4" />
                                )}
                              </button>
                            ) : (
                              <div className="w-6"></div>
                            )}
                            <div>
                              <p
                                className="font-semibold text-slate-800 text-sm truncate max-w-[200px]"
                                title={group.name}
                              >
                                {group.name}
                              </p>
                              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                <span>{group.category || 'General'}</span>
                                {hasMultipleVariants && (
                                  <span className="font-medium text-blue-600">
                                    · {group.details.length} tallas
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Expected System Stock */}
                        <td className="p-3 border-b border-slate-100 text-center font-semibold text-slate-500">
                          {group.expected}
                        </td>

                        {/* Physical Count Field (Inline editor for single variant or group total) */}
                        <td className="p-3 border-b border-slate-100 text-center">
                          {!hasMultipleVariants ? (
                            // Single variant: direct numeric input with stepper!
                            <div className="inline-flex items-center gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200">
                              <button
                                type="button"
                                onClick={() => handleAddCount(group.details[0].code, -1)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer shadow-2xs text-xs"
                                title="Restar 1"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="0"
                                value={group.counted}
                                onChange={(e) =>
                                  handleSetCount(
                                    group.details[0].code,
                                    parseInt(e.target.value, 10) || 0
                                  )
                                }
                                className="w-16 p-1 text-center font-black text-slate-800 text-sm bg-white border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500"
                              />
                              <button
                                type="button"
                                onClick={() => handleAddCount(group.details[0].code, 1)}
                                className="w-6 h-6 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 cursor-pointer shadow-2xs text-xs"
                                title="Sumar 1"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            // Multi-variant group: show total + expand/edit button
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => toggleGroupExpand(group.name)}
                                className={`px-2.5 py-1 rounded-lg font-black text-sm transition-all cursor-pointer flex items-center gap-1.5 ${
                                  group.counted > 0
                                    ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                                title="Haz clic para ver y editar el conteo de cada talla"
                              >
                                <span>{group.counted}</span>
                                <span className="text-[10px] font-normal uppercase opacity-75">
                                  {isExpanded ? 'cerrar' : 'editar'}
                                </span>
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Difference Badge */}
                        <td className="p-3 pr-4 border-b border-slate-100 text-right">
                          {statusBadge}
                        </td>
                      </tr>

                      {/* Sub-rows for Multi-variant items when expanded */}
                      {hasMultipleVariants && isExpanded && (
                        <tr className="bg-slate-50/70">
                          <td colSpan={4} className="p-3 pl-10 pr-4 border-b border-slate-200">
                            <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                              <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">
                                  Desglose por Talla / SKU ({group.name})
                                </p>
                                <p className="text-xs text-slate-400">
                                  Ingresa el número físico de cada talla:
                                </p>
                              </div>
                              <div className="divide-y divide-slate-100">
                                {group.details.map((detail) => {
                                  const itemDiff = detail.counted - detail.expected;
                                  return (
                                    <div
                                      key={detail.code}
                                      className="py-2 flex items-center justify-between gap-4 text-xs"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs">
                                          Talla: {detail.size || 'Única'}
                                        </span>
                                        <span className="font-mono text-slate-400 text-[11px]">
                                          {detail.code}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-6">
                                        <div className="text-slate-500">
                                          <span>Sist: </span>
                                          <strong className="text-slate-700">
                                            {detail.expected}
                                          </strong>
                                        </div>

                                        {/* Direct numeric input for this specific variant */}
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleAddCount(detail.code, -1)}
                                            className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                                          >
                                            <Minus className="w-2.5 h-2.5" />
                                          </button>
                                          <input
                                            type="number"
                                            min="0"
                                            value={detail.counted}
                                            onChange={(e) =>
                                              handleSetCount(
                                                detail.code,
                                                parseInt(e.target.value, 10) || 0
                                              )
                                            }
                                            className="w-14 p-1 text-center font-bold text-slate-800 bg-slate-50 border border-slate-200 rounded focus:ring-1 focus:ring-blue-500 outline-none text-xs"
                                          />
                                          <button
                                            type="button"
                                            onClick={() => handleAddCount(detail.code, 1)}
                                            className="w-5 h-5 flex items-center justify-center rounded bg-slate-100 hover:bg-slate-200 text-slate-600 cursor-pointer"
                                          >
                                            <Plus className="w-2.5 h-2.5" />
                                          </button>
                                        </div>

                                        {/* Quick match this variant */}
                                        <button
                                          type="button"
                                          onClick={() => handleMatchItem(detail.code)}
                                          className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline cursor-pointer"
                                          title="Igualar al stock del sistema"
                                        >
                                          = Cuadrar
                                        </button>

                                        {/* Diff badge */}
                                        <span
                                          className={`font-bold w-12 text-right ${
                                            itemDiff === 0
                                              ? 'text-emerald-600'
                                              : itemDiff < 0
                                              ? 'text-red-600'
                                              : 'text-orange-600'
                                          }`}
                                        >
                                          {itemDiff === 0
                                            ? 'Exacto'
                                            : itemDiff > 0
                                            ? `+${itemDiff}`
                                            : itemDiff}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Batch / Total Quantity Entry Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 z-[80] flex items-center justify-center p-4 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <Calculator className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-base">
                    Ingresar Conteo por Lote o Total
                  </h3>
                  <p className="text-xs text-slate-500">
                    Establece el número total de unidades contadas para un artículo.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsBatchModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBatchSubmit} className="p-6 overflow-y-auto space-y-4">
              {/* Product Search & Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  1. Buscar y Seleccionar Artículo
                </label>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={batchSearch}
                    onChange={(e) => setBatchSearch(e.target.value)}
                    placeholder="Filtrar por nombre o SKU..."
                    className="w-full p-2.5 pl-9 border border-slate-300 rounded-xl text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {batchFilteredProducts.map((p) => {
                    const isSelected = batchSelectedCode === p.code;
                    const currentCounted = auditSession[p.code]?.counted || 0;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          setBatchSelectedCode(p.code);
                          setBatchQuantity(currentCounted || p.stock || 0);
                        }}
                        className={`p-2.5 text-xs flex items-center justify-between cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-50 text-emerald-900 font-bold border-l-4 border-emerald-600'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-sm">
                            {p.name} {p.size ? `(Talla: ${p.size})` : ''}
                          </p>
                          <p className="font-mono text-slate-400 text-[11px]">{p.code}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-slate-400">Sist: {p.stock} unids</span>
                          <p className="text-blue-600 font-bold">Contado: {currentCounted}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Mode Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  2. Acción a Realizar
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setBatchMode('set')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      batchMode === 'set'
                        ? 'border-emerald-600 bg-emerald-50 text-emerald-800 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Fijar como Conteo Total
                  </button>
                  <button
                    type="button"
                    onClick={() => setBatchMode('add')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer text-center ${
                      batchMode === 'add'
                        ? 'border-blue-600 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    Sumar a lo ya Contado
                  </button>
                </div>
              </div>

              {/* Quantity Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  3. Cantidad de Unidades {batchMode === 'set' ? '(Total Físico)' : '(A Sumar)'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    required
                    value={batchQuantity}
                    onChange={(e) =>
                      setBatchQuantity(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                    className="w-full p-3 border-2 border-slate-300 rounded-xl text-center font-black text-2xl text-slate-800 outline-none focus:border-emerald-500 bg-slate-50"
                  />
                </div>
                <div className="flex gap-1.5 mt-2">
                  {[5, 10, 20, 50, 100].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setBatchQuantity(num)}
                      className="flex-1 py-1 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="px-4 py-2 text-slate-600 text-sm font-semibold hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!batchSelectedCode}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                >
                  {batchMode === 'set' ? 'Establecer Total' : 'Sumar al Conteo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Loading Overlay */}
      {isAiLoading && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-[100] backdrop-blur-sm">
          <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center max-w-sm text-center">
            <Bot className="w-12 h-12 text-blue-600 animate-bounce mb-3" />
            <h3 className="text-lg font-bold text-slate-800 mb-1">
              Gemini analizando auditoría...
            </h3>
            <p className="text-xs text-slate-500">
              Evaluando patrones, pérdidas financieras y sugerencias de inventario.
            </p>
          </div>
        </div>
      )}

      {/* AI Insight Modal */}
      {aiInsightModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[70] backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-purple-50 rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Análisis Inteligente (Gemini)</h2>
                  <p className="text-purple-700 text-xs">
                    StockMaster AI detectando patrones en tu auditoría
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAiInsightModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-purple-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {aiInsightContent}
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end">
              <button
                onClick={() => setAiInsightModalOpen(false)}
                className="px-5 py-2.5 bg-slate-800 text-white font-medium hover:bg-slate-700 rounded-xl text-sm cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audit Completion & Results Modal */}
      {isResultModalOpen && (
        <div className="fixed inset-0 bg-slate-900/80 flex items-center justify-center z-[60] backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex flex-col items-center bg-slate-50 rounded-t-2xl text-center relative">
              <button
                onClick={() => setIsResultModalOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="w-14 h-14 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-2">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">Auditoría Finalizada</h2>
              <p className="text-slate-500 text-sm">
                El reporte ha sido generado. ¿Deseas aplicar los ajustes al sistema?
              </p>
            </div>

            <div className="p-6 overflow-y-auto bg-slate-100 space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                  <p className="text-xs font-semibold text-slate-400 uppercase">Exactos</p>
                  <p className="text-2xl font-bold text-emerald-600">{summaryData.match}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                  <p className="text-xs font-semibold text-slate-400 uppercase">Faltantes</p>
                  <p className="text-2xl font-bold text-red-600">{summaryData.missing}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                  <p className="text-xs font-semibold text-slate-400 uppercase">Sobrantes</p>
                  <p className="text-2xl font-bold text-orange-600">{summaryData.extra}</p>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 text-center">
                  <p className="text-xs font-semibold text-slate-400 uppercase">
                    {summaryData.netImpact < 0
                      ? 'Pérdida Estimada'
                      : summaryData.netImpact > 0
                      ? 'Ganancia Estimada'
                      : 'Impacto Neto'}
                  </p>
                  <p
                    className={`text-2xl font-bold truncate ${
                      summaryData.netImpact < 0
                        ? 'text-red-600'
                        : summaryData.netImpact > 0
                        ? 'text-emerald-600'
                        : 'text-slate-800'
                    }`}
                  >
                    L {summaryData.netImpact.toLocaleString('es-HN', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>

              {/* AI Executive Summary Card */}
              {summaryData.aiSummary && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-950 shadow-sm">
                  <h4 className="font-bold flex items-center gap-2 mb-1.5 text-blue-900">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    <span>Análisis Financiero de IA (Gemini)</span>
                  </h4>
                  <p className="leading-relaxed text-xs sm:text-sm">{summaryData.aiSummary}</p>
                </div>
              )}

              {/* Discrepancies Table */}
              <div>
                <h3 className="font-bold text-slate-700 mb-3 text-xs uppercase tracking-wider">
                  Detalle de Discrepancias Financieras
                </h3>
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-xs uppercase">
                      <tr>
                        <th className="p-3 pl-4">Producto</th>
                        <th className="p-3 text-center">Sistema</th>
                        <th className="p-3 text-center">Conteo</th>
                        <th className="p-3 text-right">Dif. Unid.</th>
                        <th className="p-3 text-right pr-4">Impacto Financiero</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {summaryData.discrepancies.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-emerald-600 font-medium">
                            <CheckCircle2 className="w-5 h-5 inline mr-2" />
                            Todo el inventario cuadra perfectamente. No hay discrepancias financieras.
                          </td>
                        </tr>
                      ) : (
                        summaryData.discrepancies.map((d) => (
                          <tr key={d.name}>
                            <td className="p-3 pl-4">
                              <p className="font-medium text-slate-800 text-sm">{d.name}</p>
                              <p className="text-xs text-slate-400 font-mono">Agrupado</p>
                            </td>
                            <td className="p-3 text-center text-slate-500">{d.expected}</td>
                            <td className="p-3 text-center font-bold text-slate-800">{d.counted}</td>
                            <td
                              className={`p-3 text-right font-bold ${
                                d.diff < 0 ? 'text-red-600' : 'text-orange-600'
                              }`}
                            >
                              {d.diff > 0 ? `+${d.diff}` : d.diff}
                            </td>
                            <td
                              className={`p-3 pr-4 text-right font-bold ${
                                d.impact < 0 ? 'text-red-600' : 'text-emerald-600'
                              }`}
                            >
                              L {d.impact > 0 ? '+' : ''}
                              {d.impact.toLocaleString('es-HN', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-5 border-t border-slate-100 bg-white rounded-b-2xl flex flex-col sm:flex-row justify-between items-center gap-3">
              <p className="text-xs text-slate-500">
                ¿Deseas aplicar estos cambios al inventario del sistema?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 text-slate-700 font-medium hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors text-sm flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Imprimir Reporte</span>
                </button>
                <button
                  onClick={() => setIsResultModalOpen(false)}
                  className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors text-sm cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  onClick={handleApplyChanges}
                  className="px-5 py-2 bg-emerald-600 text-white font-medium hover:bg-emerald-700 rounded-xl transition-colors shadow-sm text-sm cursor-pointer"
                >
                  Aplicar Cambios
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden element for printing */}
      <PrintableReport
        dateStr={new Date().toLocaleString('es-HN', { dateStyle: 'full', timeStyle: 'short' })}
        match={summaryData.match}
        missing={summaryData.missing}
        extra={summaryData.extra}
        netImpact={summaryData.netImpact}
        groupedItems={groupedItems}
        aiAnalysisText={summaryData.aiSummary}
        storeSettings={storeSettings}
      />

      {/* Confirmation Dialog for Audit Count Reset */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="¿Reiniciar conteos de la auditoría?"
        message="Todos los conteos físicos escaneados en esta sesión volverán a 0. El inventario en la base de datos no se verá afectado."
        confirmLabel="Sí, Reiniciar a 0"
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={() => {
          setShowResetConfirm(false);
          startAudit();
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Confirmation Dialog for Match All */}
      <ConfirmDialog
        isOpen={showMatchAllConfirm}
        title="¿Cuadrar todos los artículos con el sistema?"
        message="Se asignará el stock esperado del sistema como conteo físico actual para todos los artículos. Podrás modificar individualmente cualquier discrepancia."
        confirmLabel="Sí, Cuadrar Todo"
        cancelLabel="Cancelar"
        isDestructive={false}
        onConfirm={handleMatchAll}
        onCancel={() => setShowMatchAllConfirm(false)}
      />
    </div>
  );
};
