import React, { useState, useEffect, useRef } from 'react';
import { Product, Supplier, AuditSessionItem, GroupedAuditItem, AuditHistoryRecord, StoreSettings } from '../types';
import { playSound } from '../utils/audio';
import { PrintableReport } from './PrintableReport';
import { ConfirmDialog } from './ConfirmDialog';
import { PrintFormatModal } from './PrintFormatModal';
import { buildAuditReportHtml, downloadAuditReportPdf } from '../utils/printPdfService';
import {
  ClipboardList,
  Printer,
  Download,
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
  CheckCheck,
  Filter,
  Layers,
  Building2,
  Tag,
  ShieldCheck,
  CheckSquare,
  Square,
  PackageCheck,
  AlertTriangle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

export type AuditScopeMode = 'all' | 'supplier' | 'category' | 'custom';

interface AuditViewProps {
  inventory: Product[];
  suppliers?: Supplier[];
  onApplyAuditChanges: (
    updatedInventory: Product[],
    historyRecord: AuditHistoryRecord,
    auditedCodes?: string[]
  ) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
  storeSettings?: StoreSettings;
}

export const AuditView: React.FC<AuditViewProps> = ({
  inventory,
  suppliers = [],
  onApplyAuditChanges,
  showToast,
  storeSettings,
}) => {
  const [isAuditing, setIsAuditing] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showMatchAllConfirm, setShowMatchAllConfirm] = useState(false);
  const [showCancelAuditConfirm, setShowCancelAuditConfirm] = useState(false);
  const [auditSession, setAuditSession] = useState<Record<string, AuditSessionItem>>({});

  // Scope Selection States (Pre-Audit Configuration)
  const [scopeMode, setScopeMode] = useState<AuditScopeMode>('all');
  const [selectedSupplier, setSelectedSupplier] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedCustomCodes, setSelectedCustomCodes] = useState<string[]>([]);
  const [customSearchQuery, setCustomSearchQuery] = useState('');

  // Active Scope Metadata (During Audit)
  const [activeScope, setActiveScope] = useState<{
    mode: AuditScopeMode;
    description: string;
    auditedCodes: string[];
    totalCatalogCount: number;
  }>({
    mode: 'all',
    description: 'Inventario Completo',
    auditedCodes: [],
    totalCatalogCount: 0,
  });

  // Extract unique sorted suppliers
  const supplierList = React.useMemo(() => {
    const fromSuppliers = (suppliers || []).map((s) => s.name.trim()).filter(Boolean);
    const fromInventory = inventory.map((p) => (p.supplier || '').trim()).filter(Boolean);
    const combined = Array.from(new Set([...fromSuppliers, ...fromInventory]));
    return combined.sort((a, b) => a.localeCompare(b));
  }, [suppliers, inventory]);

  // Extract unique sorted categories
  const categoryList = React.useMemo(() => {
    const categories = inventory.map((p) => (p.category || '').trim()).filter(Boolean);
    return Array.from(new Set(categories)).sort((a, b) => a.localeCompare(b));
  }, [inventory]);

  // Determine targeted products for the selected scope
  const targetProducts = React.useMemo(() => {
    if (scopeMode === 'all') {
      return inventory;
    }
    if (scopeMode === 'supplier') {
      if (!selectedSupplier) return [];
      return inventory.filter((p) => (p.supplier || '').trim() === selectedSupplier.trim());
    }
    if (scopeMode === 'category') {
      if (!selectedCategory) return [];
      return inventory.filter((p) => (p.category || '').trim() === selectedCategory.trim());
    }
    if (scopeMode === 'custom') {
      return inventory.filter((p) => selectedCustomCodes.includes(p.code));
    }
    return inventory;
  }, [inventory, scopeMode, selectedSupplier, selectedCategory, selectedCustomCodes]);

  // Set default selection if none chosen
  useEffect(() => {
    if (scopeMode === 'supplier' && !selectedSupplier && supplierList.length > 0) {
      setSelectedSupplier(supplierList[0]);
    }
    if (scopeMode === 'category' && !selectedCategory && categoryList.length > 0) {
      setSelectedCategory(categoryList[0]);
    }
  }, [scopeMode, supplierList, categoryList, selectedSupplier, selectedCategory]);
  
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
  const [showAuditPrintModal, setShowAuditPrintModal] = useState(false);
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
    if (targetProducts.length === 0) {
      showToast('Por favor selecciona al menos un producto o segmento para iniciar.', 'warning');
      return;
    }

    let description = 'Inventario Completo';
    if (scopeMode === 'supplier') {
      description = `Proveedor: ${selectedSupplier}`;
    } else if (scopeMode === 'category') {
      description = `Categoría: ${selectedCategory}`;
    } else if (scopeMode === 'custom') {
      description = `Selección Personalizada (${targetProducts.length} productos)`;
    }

    const auditedCodes = targetProducts.map((p) => p.code);
    const session: Record<string, AuditSessionItem> = {};
    targetProducts.forEach((item) => {
      session[item.code] = {
        item,
        expected: Number(item.stock) || 0,
        counted: 0,
      };
    });

    setActiveScope({
      mode: scopeMode,
      description,
      auditedCodes,
      totalCatalogCount: inventory.length,
    });

    setAuditSession(session);
    setIsAuditing(true);
    setLastScannedCode(null);
    setLastScannedGroup(null);
    setLastScannedItemInfo({ name: '-', code: '-' });
    setExpandedGroups({});
    showToast(`Iniciando auditoría de ${targetProducts.length} productos (${description})`, 'info');
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
      // Check if product is in catalog but excluded from this audit segment
      const inCatalog = inventory.find((p) => p.code === trimmedCode);
      playSound('error');
      if (inCatalog) {
        showToast(
          `"${inCatalog.name}" pertenece a "${inCatalog.supplier || 'otro segmento'}" y no está incluido en esta auditoría (${activeScope.description}). Su stock permanece protegido.`,
          'warning'
        );
        setLastScannedItemInfo({
          name: `${inCatalog.name} (FUERA DEL SEGMENTO)`,
          code: trimmedCode,
          isError: true,
        });
      } else {
        // Unrecognized product
        showToast(`Código desconocido: ${trimmedCode}`, 'warning');
        setLastScannedItemInfo({
          name: 'CÓDIGO NO REGISTRADO',
          code: trimmedCode,
          isError: true,
        });
      }
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
        return;
      }
      throw new Error(data?.message || 'Error en respuesta de GOSEN IA');
    } catch (err: any) {
      console.warn('AI analysis endpoint fallback engaged:', err);
      // Instant intelligent fallback so the user is NEVER blocked by network errors
      const missingItems = groupedItems.filter((g) => g.counted < g.expected);
      const extraItems = groupedItems.filter((g) => g.counted > g.expected);
      const exactItems = groupedItems.filter((g) => g.counted === g.expected);

      const clientAnalysis = `### Análisis Inteligente de Auditoría (GOSEN IA)

**1. Patrones y Estado Actual:**
- **Exactos:** ${exactItems.length} artículos coinciden al 100% con el sistema.
- **Faltantes:** ${missingItems.length} productos registran unidades no encontradas (${missingItems.map(m => `${m.name} (${m.counted - m.expected})`).slice(0, 3).join(', ')}${missingItems.length > 3 ? '...' : ''}).
- **Sobrantes:** ${extraItems.length} productos con unidades excedentes en exhibición.

**2. Posibles Causas Operativas:**
- Ventas registradas con códigos genéricos o sin escaneo directo en caja.
- Traspasos entre sucursales o bodega pendientes de registro en el sistema.
- Mermas no reportadas o mercancía en revisión técnica.

**3. Acciones Recomendadas:**
- Realizar una doble verificación en estantería para los artículos con faltantes.
- Continuar escaneando los productos restantes para completar la auditoría física.
- Aplicar los ajustes finales para sincronizar el stock real en tiempo real con Firebase.`;

      setAiInsightContent(clientAnalysis);
      setAiInsightModalOpen(true);
      showToast('Análisis de auditoría completado', 'info');
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
      console.warn('Error fetching financial summary, applying fallback:', err);
    }

    if (!aiSummary) {
      const impactText = totalNetImpact < 0 ? `un impacto negativo de L ${Math.abs(totalNetImpact).toFixed(2)} por faltantes` : totalNetImpact > 0 ? `un superávit de L ${totalNetImpact.toFixed(2)} por sobrantes` : 'un balance financiero neutral';
      aiSummary = `La auditoría concluyó con ${match} productos conformes, ${missing} ítems con faltantes y ${extra} con sobrantes, representando ${impactText}. Se recomienda aplicar los ajustes para reflejar la existencia real en estantería y verificar los registros de caja.`;
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
    const auditedCodeSet = new Set(Object.keys(auditSession));

    // ONLY update the products that were part of this audit session!
    const updatedInventory = inventory.map((product) => {
      if (auditSession[product.code] !== undefined) {
        return {
          ...product,
          stock: auditSession[product.code].counted,
        };
      }
      // Crucial: Products outside this audit segment keep their exact current stock untouched!
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
      totalItems: Object.keys(auditSession).length,
      scope: activeScope.description,
    };

    onApplyAuditChanges(updatedInventory, newRecord, Array.from(auditedCodeSet));

    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
    });

    setIsResultModalOpen(false);
    setIsAuditing(false);
    showToast(`¡Ajustes de ${Object.keys(auditSession).length} productos aplicados exitosamente!`, 'success');
  };

  const handlePrint = () => {
    setShowAuditPrintModal(true);
  };

  // Filtered products for Batch Modal (ONLY items that belong to the current audit session)
  const batchFilteredProducts = inventory.filter((item) => {
    if (!auditSession[item.code]) return false;
    const q = batchSearch.toLowerCase().trim();
    return (
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      (item.size && item.size.toLowerCase().includes(q))
    );
  });

  // Filter products for Custom Scope Selection
  const customFilteredProducts = inventory.filter((item) => {
    const q = customSearchQuery.toLowerCase().trim();
    return (
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.code.toLowerCase().includes(q) ||
      (item.size && item.size.toLowerCase().includes(q)) ||
      (item.supplier && item.supplier.toLowerCase().includes(q)) ||
      (item.category && item.category.toLowerCase().includes(q))
    );
  });

  const handleToggleCustomCode = (code: string) => {
    setSelectedCustomCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleSelectAllVisibleCustom = () => {
    const visibleCodes = customFilteredProducts.map((p) => p.code);
    setSelectedCustomCodes((prev) => Array.from(new Set([...prev, ...visibleCodes])));
  };

  const handleDeselectAllCustom = () => {
    setSelectedCustomCodes([]);
  };

  // ================= RENDER START SCREEN =================
  if (!isAuditing) {
    return (
      <div className="flex-1 min-h-0 h-full w-full p-3 sm:p-6 bg-slate-100 overflow-y-auto scroll-container pb-36 md:pb-24">
        <header className="mb-6 max-w-4xl w-full mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardList className="w-7 h-7 text-emerald-600" />
            <h1 className="text-2xl font-bold text-slate-800">Auditoría Física de Inventario</h1>
          </div>
          <p className="text-sm text-slate-600">
            Elige si deseas auditar todo el catálogo o solo un segmento (por proveedor, por categoría o por selección manual).
            Los productos fuera del segmento seleccionado conservarán su stock actual intacto.
          </p>
        </header>

        <div className="max-w-4xl w-full mx-auto space-y-6 pb-12">
          {/* Step 1: Scope Mode Selection Cards */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Filter className="w-4 h-4 text-emerald-600" />
              <span>1. Selecciona el Tipo de Auditoría</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Option 1: Full Inventory */}
              <button
                type="button"
                onClick={() => setScopeMode('all')}
                className={`p-4 rounded-xl text-left border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  scopeMode === 'all'
                    ? 'border-emerald-500 bg-emerald-50/60 shadow-sm ring-1 ring-emerald-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3">
                    <PackageCheck className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Inventario Completo</h3>
                  <p className="text-xs text-slate-500 leading-snug">
                    Auditar todos los artículos registrados en el catálogo.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-emerald-700">
                  <span>{inventory.length} productos</span>
                  <span className={`w-2 h-2 rounded-full ${scopeMode === 'all' ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300'}`} />
                </div>
              </button>

              {/* Option 2: By Supplier */}
              <button
                type="button"
                onClick={() => setScopeMode('supplier')}
                className={`p-4 rounded-xl text-left border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  scopeMode === 'supplier'
                    ? 'border-indigo-500 bg-indigo-50/60 shadow-sm ring-1 ring-indigo-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="w-9 h-9 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center mb-3">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Por Proveedor</h3>
                  <p className="text-xs text-slate-500 leading-snug">
                    Segmentar y auditar los productos de un proveedor específico.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-indigo-700">
                  <span>{supplierList.length} proveedores</span>
                  <span className={`w-2 h-2 rounded-full ${scopeMode === 'supplier' ? 'bg-indigo-500 ring-4 ring-indigo-100' : 'bg-slate-300'}`} />
                </div>
              </button>

              {/* Option 3: By Category */}
              <button
                type="button"
                onClick={() => setScopeMode('category')}
                className={`p-4 rounded-xl text-left border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  scopeMode === 'category'
                    ? 'border-purple-500 bg-purple-50/60 shadow-sm ring-1 ring-purple-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="w-9 h-9 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center mb-3">
                    <Tag className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Por Categoría</h3>
                  <p className="text-xs text-slate-500 leading-snug">
                    Auditar un departamento o tipo específico de mercancía.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-purple-700">
                  <span>{categoryList.length} categorías</span>
                  <span className={`w-2 h-2 rounded-full ${scopeMode === 'category' ? 'bg-purple-500 ring-4 ring-purple-100' : 'bg-slate-300'}`} />
                </div>
              </button>

              {/* Option 4: Manual Custom Selection */}
              <button
                type="button"
                onClick={() => setScopeMode('custom')}
                className={`p-4 rounded-xl text-left border-2 transition-all cursor-pointer flex flex-col justify-between ${
                  scopeMode === 'custom'
                    ? 'border-amber-500 bg-amber-50/60 shadow-sm ring-1 ring-amber-500/30'
                    : 'border-slate-200 hover:border-slate-300 bg-slate-50/50'
                }`}
              >
                <div>
                  <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center mb-3">
                    <CheckSquare className="w-5 h-5" />
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm mb-1">Selección Manual</h3>
                  <p className="text-xs text-slate-500 leading-snug">
                    Marcar artículos específicos mediante lista y buscador.
                  </p>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs font-semibold text-amber-700">
                  <span>{selectedCustomCodes.length} elegidos</span>
                  <span className={`w-2 h-2 rounded-full ${scopeMode === 'custom' ? 'bg-amber-500 ring-4 ring-amber-100' : 'bg-slate-300'}`} />
                </div>
              </button>
            </div>
          </div>

          {/* Step 2: Dynamic Segment Configuration Panel */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-emerald-600" />
                <span>2. Configuración del Segmento</span>
              </span>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {targetProducts.length} productos listos para auditar
              </span>
            </h2>

            {/* If Full Inventory */}
            {scopeMode === 'all' && (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                  <PackageCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Auditoría Global del Catálogo</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Se auditarán los <strong>{inventory.length}</strong> artículos registrados en la tienda.
                    Recomendado para cierres de período, auditorías fiscales o revisiones completas periódicas.
                  </p>
                </div>
              </div>
            )}

            {/* If By Supplier */}
            {scopeMode === 'supplier' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Elige el proveedor cuyos productos deseas auditar. Los artículos de otros proveedores no serán tocados ni alterados.
                </p>

                {supplierList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    No se encontraron proveedores registrados en el inventario. Puedes asignar proveedores a tus productos en la sección de Inventario.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {supplierList.map((supName) => {
                      const count = inventory.filter((p) => (p.supplier || '').trim() === supName).length;
                      const isSelected = selectedSupplier === supName;
                      return (
                        <button
                          key={supName}
                          type="button"
                          onClick={() => setSelectedSupplier(supName)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'border-indigo-600 bg-indigo-50/80 shadow-xs ring-1 ring-indigo-500 font-bold'
                              : 'border-slate-200 hover:border-indigo-300 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <span className="text-xs text-slate-800 block truncate">{supName}</span>
                            <span className="text-[11px] text-slate-400 font-normal">{count} artículos</span>
                          </div>
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* If By Category */}
            {scopeMode === 'category' && (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">
                  Elige la categoría a auditar. Ideal para revisar estanterías o departamentos específicos por fases.
                </p>

                {categoryList.length === 0 ? (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                    No hay categorías registradas en el catálogo.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {categoryList.map((catName) => {
                      const count = inventory.filter((p) => (p.category || '').trim() === catName).length;
                      const isSelected = selectedCategory === catName;
                      return (
                        <button
                          key={catName}
                          type="button"
                          onClick={() => setSelectedCategory(catName)}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                            isSelected
                              ? 'border-purple-600 bg-purple-50/80 shadow-xs ring-1 ring-purple-500 font-bold'
                              : 'border-slate-200 hover:border-purple-300 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="truncate mr-2">
                            <span className="text-xs text-slate-800 block truncate">{catName}</span>
                            <span className="text-[11px] text-slate-400 font-normal">{count} productos</span>
                          </div>
                          <span
                            className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                              isSelected ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300'
                            }`}
                          >
                            {isSelected && <span className="w-1.5 h-1.5 bg-white rounded-full" />}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* If Manual Custom Selection */}
            {scopeMode === 'custom' && (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <div className="relative w-full sm:w-80">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                    <input
                      type="text"
                      value={customSearchQuery}
                      onChange={(e) => setCustomSearchQuery(e.target.value)}
                      placeholder="Buscar por nombre, código o proveedor..."
                      className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 outline-none"
                    />
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                    <button
                      type="button"
                      onClick={handleSelectAllVisibleCustom}
                      className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 font-semibold border border-amber-200 transition-colors cursor-pointer"
                    >
                      Seleccionar Visibles ({customFilteredProducts.length})
                    </button>
                    <button
                      type="button"
                      onClick={handleDeselectAllCustom}
                      className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold border border-slate-200 transition-colors cursor-pointer"
                    >
                      Desmarcar Todos
                    </button>
                  </div>
                </div>

                {/* Scrollable Products List with Checkboxes */}
                <div className="max-h-72 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white">
                  {customFilteredProducts.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No se encontraron artículos con la búsqueda "{customSearchQuery}"
                    </div>
                  ) : (
                    customFilteredProducts.map((p) => {
                      const isChecked = selectedCustomCodes.includes(p.code);
                      return (
                        <div
                          key={p.id}
                          onClick={() => handleToggleCustomCode(p.code)}
                          className={`p-3 text-xs flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                            isChecked ? 'bg-amber-50/60 font-semibold' : 'hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {}} // handled by row click
                              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-slate-300 pointer-events-none"
                            />
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-slate-800 font-bold truncate">{p.name}</span>
                                {p.size && (
                                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-mono">
                                    Talla: {p.size}
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[11px] text-slate-400 block truncate">
                                SKU: {p.code} • Proveedor: {p.supplier || 'N/A'} • Cat: {p.category || 'General'}
                              </span>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-slate-600 block text-xs">
                              Stock: <strong>{p.stock}</strong>
                            </span>
                            <span className="text-[11px] text-slate-400">
                              L {Number(p.price || 0).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Step 3: Stock Protection Assurance Banner */}
          <div className="p-4 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex items-start sm:items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="text-xs text-emerald-950 flex-1 leading-relaxed">
              <h4 className="font-bold text-sm text-emerald-900 mb-0.5 flex items-center gap-1.5">
                <span>Protección de Stock Garantizada</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-200/70 text-emerald-900 text-[10px] font-black uppercase">
                  Seguro
                </span>
              </h4>
              <p>
                Al aplicar los resultados de la auditoría, <strong>únicamente se modificará el stock de los {targetProducts.length} productos seleccionados</strong> en este segmento.
                {inventory.length > targetProducts.length && (
                  <span>
                    {' '}Los <strong>{inventory.length - targetProducts.length} productos restantes</strong> del catálogo no sufrirán ninguna modificación y mantendrán su existencia actual intacta.
                  </span>
                )}
              </p>
            </div>
          </div>

          {/* Step 4: Big Start Button */}
          <div className="text-center pt-2">
            <button
              type="button"
              onClick={startAudit}
              disabled={targetProducts.length === 0}
              className="w-full sm:w-auto px-10 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black text-base shadow-lg shadow-emerald-600/20 hover:shadow-xl transition-all flex items-center justify-center gap-2.5 mx-auto cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ClipboardList className="w-5 h-5" />
              <span>Comenzar Auditoría ({targetProducts.length} artículos)</span>
            </button>
            {targetProducts.length === 0 && (
              <p className="text-xs text-amber-600 font-semibold mt-2">
                Selecciona al menos un artículo o segmento para habilitar la auditoría.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ================= RENDER ACTIVE AUDIT INTERFACE =================
  return (
    <div className="flex-1 min-h-0 flex flex-col p-3 sm:p-6 h-full w-full bg-slate-100 overflow-y-auto lg:overflow-hidden scroll-container pb-36 lg:pb-6">
      {/* Active Segment Info Banner */}
      <div className="mb-3 px-4 py-2.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
        <div className="flex items-center gap-2.5">
          <span className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700">
            <Filter className="w-4 h-4" />
          </span>
          <div>
            <span className="font-bold text-slate-800">
              {activeScope.mode === 'all' ? '📦 Inventario Completo' : `🏢 Segmento: ${activeScope.description}`}
            </span>
            <span className="text-slate-500 ml-2">
              ({activeScope.auditedCodes.length} de {inventory.length} artículos en catálogo)
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {activeScope.mode !== 'all' && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full font-semibold border border-emerald-200">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{inventory.length - activeScope.auditedCodes.length} productos fuera de este segmento protegidos</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => setShowCancelAuditConfirm(true)}
            className="text-slate-500 hover:text-rose-600 font-semibold hover:underline cursor-pointer"
          >
            Cambiar Segmento
          </button>
        </div>
      </div>
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
            title="Analizar patrones y discrepancias con GOSEN IA"
          >
            <Sparkles className="w-4 h-4" />
            <span>Analizar con GOSEN IA</span>
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
      <div className="flex-1 flex flex-col lg:flex-row gap-4 sm:gap-6 lg:h-full lg:overflow-hidden">
        {/* Left Column: Scanner, Multiplier, and Manual Entry (1/3) */}
        <div className="w-full lg:w-1/3 flex flex-col gap-4 lg:overflow-y-auto shrink-0">
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
        <div className="w-full lg:w-2/3 bg-white border border-slate-200 rounded-2xl flex flex-col shadow-sm lg:overflow-hidden lg:h-full min-h-[420px]">
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
              GOSEN IA analizando auditoría...
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
                  <h2 className="text-xl font-bold text-slate-800">Análisis Inteligente (GOSEN IA)</h2>
                  <p className="text-purple-700 text-xs">
                    GOSEN IA detectando patrones en tu auditoría
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
              <div className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">
                <Filter className="w-3.5 h-3.5" />
                <span>Alcance: {activeScope.description} ({activeScope.auditedCodes.length} artículos)</span>
              </div>
              {inventory.length > activeScope.auditedCodes.length && (
                <p className="text-[11px] text-emerald-800 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 mt-2 max-w-lg font-medium">
                  🛡️ Solo se actualizarán estos {activeScope.auditedCodes.length} artículos auditados. Los {inventory.length - activeScope.auditedCodes.length} productos restantes mantendrán su stock actual intacto.
                </p>
              )}
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
                    <span>Análisis Financiero con GOSEN IA</span>
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
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    downloadAuditReportPdf(
                      {
                        dateStr: new Date().toLocaleString('es-HN', { dateStyle: 'full', timeStyle: 'short' }),
                        scope: activeScope.description,
                        match: summaryData.match,
                        missing: summaryData.missing,
                        extra: summaryData.extra,
                        netImpact: summaryData.netImpact,
                        groupedItems,
                        aiSummary: summaryData.aiSummary,
                      },
                      storeSettings
                    );
                    showToast('Reporte de auditoría descargado en PDF (.pdf)', 'success');
                  }}
                  className="px-4 py-2 text-indigo-700 font-bold bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-colors text-sm flex items-center gap-2 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Descargar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-4 py-2 text-slate-800 font-bold hover:bg-slate-100 border border-slate-300 rounded-xl transition-colors text-sm flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-emerald-600" />
                  <span>Imprimir (Elegir Impresora)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsResultModalOpen(false)}
                  className="px-5 py-2 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors text-sm cursor-pointer"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handleApplyChanges}
                  className="px-5 py-2 bg-emerald-600 text-white font-medium hover:bg-emerald-700 rounded-xl transition-colors shadow-sm text-sm cursor-pointer"
                >
                  Aplicar Cambios ({activeScope.auditedCodes.length} artículos)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Multi-Printer & PDF Center Modal for Audit Report */}
      <PrintFormatModal
        isOpen={showAuditPrintModal}
        onClose={() => setShowAuditPrintModal(false)}
        title="Imprimir / Exportar Reporte de Auditoría Física"
        subtitle={`Alcance: ${activeScope.description} (${groupedItems.length} grupos)`}
        storeSettings={storeSettings}
        defaultFormat="letter"
        buildHtml={(fmt) =>
          buildAuditReportHtml(
            {
              dateStr: new Date().toLocaleString('es-HN', { dateStyle: 'full', timeStyle: 'short' }),
              scope: activeScope.description,
              match: summaryData.match,
              missing: summaryData.missing,
              extra: summaryData.extra,
              netImpact: summaryData.netImpact,
              groupedItems,
              aiSummary: summaryData.aiSummary,
            },
            storeSettings,
            fmt
          )
        }
        onDownloadPdf={() =>
          downloadAuditReportPdf(
            {
              dateStr: new Date().toLocaleString('es-HN', { dateStyle: 'full', timeStyle: 'short' }),
              scope: activeScope.description,
              match: summaryData.match,
              missing: summaryData.missing,
              extra: summaryData.extra,
              netImpact: summaryData.netImpact,
              groupedItems,
              aiSummary: summaryData.aiSummary,
            },
            storeSettings
          )
        }
        showToast={showToast}
      />

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
        scope={activeScope.description}
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
          setAuditSession((prev) => {
            const reset: Record<string, AuditSessionItem> = {};
            Object.keys(prev).forEach((code) => {
              reset[code] = {
                ...prev[code],
                counted: 0,
              };
            });
            return reset;
          });
          setLastScannedCode(null);
          setLastScannedGroup(null);
          setLastScannedItemInfo({ name: '-', code: '-' });
          showToast('Conteos de la sesión reiniciados a 0', 'info');
        }}
        onCancel={() => setShowResetConfirm(false)}
      />

      {/* Confirmation Dialog for Match All */}
      <ConfirmDialog
        isOpen={showMatchAllConfirm}
        title="¿Cuadrar todos los artículos del segmento con el sistema?"
        message={`Se asignará el stock esperado del sistema como conteo físico para los ${activeScope.auditedCodes.length} artículos de este segmento. Podrás modificar individualmente cualquier discrepancia.`}
        confirmLabel="Sí, Cuadrar Todo"
        cancelLabel="Cancelar"
        isDestructive={false}
        onConfirm={handleMatchAll}
        onCancel={() => setShowMatchAllConfirm(false)}
      />

      {/* Confirmation Dialog for Exit / Change Segment */}
      <ConfirmDialog
        isOpen={showCancelAuditConfirm}
        title="¿Salir de la auditoría actual?"
        message="Se perderán los conteos físicos no guardados de esta sesión. El stock actual de todos los artículos en la base de datos se mantendrá intacto."
        confirmLabel="Sí, Salir del Conteo"
        cancelLabel="Continuar Contando"
        isDestructive={true}
        onConfirm={async () => {
          await stopScanner();
          setShowCancelAuditConfirm(false);
          setIsAuditing(false);
          showToast('Auditoría cancelada. El inventario se mantuvo sin cambios.', 'info');
        }}
        onCancel={() => setShowCancelAuditConfirm(false)}
      />
    </div>
  );
};
