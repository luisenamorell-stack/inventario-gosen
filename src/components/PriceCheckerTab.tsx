import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Product,
  StoreWarehousesData,
  WarehouseLocation,
  PriceCheckerCreditHandoff,
  StoreSettings,
} from '../types';
import {
  getProductStockInWarehouse,
  getDefaultWarehousesForStore,
} from '../firebase/firestoreService';
import { playSound } from '../utils/audio';
import { AdaptiveImage } from './AdaptiveImage';
import { getProductColors, resolveColorSwatch } from '../utils/productColorUtils';
import {
  CreditQuoteSharePayload,
  downloadCreditQuoteImage,
  downloadCreditQuotePdf,
  generateCreditQuoteImageBlob,
  buildCreditQuoteWhatsAppText,
} from '../utils/printPdfService';
import {
  Barcode,
  Camera,
  CameraOff,
  Box,
  AlertCircle,
  Layers,
  Search,
  X,
  Package,
  Store,
  CheckCircle2,
  MapPin,
  CreditCard,
  Calculator,
  TrendingUp,
  Receipt,
  ArrowRight,
  Image as ImageIcon,
  FileText,
  MessageCircle,
  Loader2,
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface PriceCheckerTabProps {
  inventory: Product[];
  warehousesData?: StoreWarehousesData;
  storeSettings?: StoreSettings;
  hasWarehousesModule?: boolean;
  canUseCreditCalculator?: boolean;
  canSendToPos?: boolean;
  onSendToPosCredit?: (handoff: PriceCheckerCreditHandoff) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const CREDIT_MARKUP_STORAGE_KEY = 'price_checker_credit_markup_pct';

const loadDefaultCreditMarkupPct = (): number => {
  try {
    const raw = localStorage.getItem(CREDIT_MARKUP_STORAGE_KEY);
    const parsed = raw !== null ? parseFloat(raw) : NaN;
    if (!Number.isNaN(parsed) && parsed > 0 && parsed <= 200) {
      return parsed;
    }
  } catch {
    // ignore storage read error
  }
  return 20;
};

export const PriceCheckerTab: React.FC<PriceCheckerTabProps> = ({
  inventory,
  warehousesData,
  storeSettings,
  hasWarehousesModule = true,
  canUseCreditCalculator = false,
  canSendToPos = false,
  onSendToPosCredit,
  showToast,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchedCode, setSearchedCode] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [defaultCreditMarkupPct, setDefaultCreditMarkupPct] = useState<number>(() =>
    loadDefaultCreditMarkupPct()
  );
  const [creditTotalInput, setCreditTotalInput] = useState<string>('0');
  const [creditFrequency, setCreditFrequency] = useState<'weekly' | 'biweekly' | 'monthly'>(
    'biweekly'
  );
  const [creditInstallments, setCreditInstallments] = useState<number>(12);
  const [creditDownPct, setCreditDownPct] = useState<number | null>(20);
  const [creditDownPaymentInput, setCreditDownPaymentInput] = useState<string>('0');
  const [isExportingQuote, setIsExportingQuote] = useState<'image' | 'pdf' | 'whatsapp' | null>(
    null
  );
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);
  const resultCardRef = useRef<HTMLDivElement | null>(null);
  const scannerBoxRef = useRef<HTMLDivElement | null>(null);
  const inventoryRef = useRef<Product[]>(inventory);

  useEffect(() => {
    inventoryRef.current = inventory;
  }, [inventory]);

  // Keep selectedProduct synced if inventory updates in real time
  useEffect(() => {
    if (!selectedProduct) return;
    const updated = inventory.find(
      (i) =>
        (selectedProduct.id && i.id === selectedProduct.id) ||
        normalizeText(i.code) === normalizeText(selectedProduct.code)
    );
    if (updated && updated !== selectedProduct) {
      setSelectedProduct(updated);
    }
  }, [inventory, selectedProduct]);

  // Reset quick credit calculator defaults whenever a different article is selected
  const selectedCreditSeedKey = selectedProduct
    ? `${selectedProduct.id || ''}-${selectedProduct.code || ''}`
    : '';
  useEffect(() => {
    if (!selectedProduct) return;
    const baseP = Number(selectedProduct.price) || 0;
    const disc = Math.min(baseP, Math.max(0, Number(selectedProduct.discount) || 0));
    const finalCash = Math.max(0, baseP - disc);
    const configuredCredit = Number(selectedProduct.creditPrice) || 0;

    // Credit price MUST be higher than cash price: use configured creditPrice if > finalCash,
    // otherwise automatically increase by defaultCreditMarkupPct (default +20%).
    const initialCreditTotal =
      configuredCredit > finalCash
        ? configuredCredit
        : Math.round(finalCash * (1 + defaultCreditMarkupPct / 100));

    const defaultDown = Math.round(initialCreditTotal * 0.2);
    setCreditTotalInput(String(initialCreditTotal));
    setCreditDownPct(20);
    setCreditDownPaymentInput(String(defaultDown));
    setCreditFrequency('biweekly');
    setCreditInstallments(12);
  }, [selectedCreditSeedKey]);

  // Active warehouses for this store (only shown when the company uses the Bodegas module)
  const activeWarehouses = useMemo<WarehouseLocation[]>(() => {
    const raw =
      Array.isArray(warehousesData?.warehouses) && warehousesData!.warehouses.length > 0
        ? warehousesData!.warehouses
        : getDefaultWarehousesForStore();
    const active = raw.filter((w) => w.isActive !== false);
    return active.length > 0 ? active : getDefaultWarehousesForStore();
  }, [warehousesData]);

  // Check if this store uses the multi-warehouse feature
  const usesWarehouses = useMemo(() => {
    if (hasWarehousesModule === false) return false;
    return activeWarehouses.length > 0;
  }, [hasWarehousesModule, activeWarehouses]);

  // Compute per-warehouse stock breakdown for the currently selected product
  const selectedProductWarehouseBreakdown = useMemo(() => {
    if (!selectedProduct || !usesWarehouses) return [];
    const list = activeWarehouses.map((wh) => {
      const stock = getProductStockInWarehouse(selectedProduct, wh.id, activeWarehouses);
      return {
        warehouse: wh,
        stock,
      };
    });
    // Sort so main sales floor or warehouses with available stock appear clearly
    return list.sort((a, b) => {
      if (a.stock > 0 && b.stock <= 0) return -1;
      if (b.stock > 0 && a.stock <= 0) return 1;
      if (a.warehouse.isMainSalesFloor && !b.warehouse.isMainSalesFloor) return -1;
      if (!a.warehouse.isMainSalesFloor && b.warehouse.isMainSalesFloor) return 1;
      return b.stock - a.stock;
    });
  }, [selectedProduct, usesWarehouses, activeWarehouses]);

  const availableWarehousesCount = useMemo(
    () => selectedProductWarehouseBreakdown.filter((entry) => entry.stock > 0).length,
    [selectedProductWarehouseBreakdown]
  );

  const scrollToResultCard = () => {
    setTimeout(() => {
      resultCardRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    }, 80);
  };

  // Live suggestions matching by SKU/code or Product Name
  const matchingSuggestions = useMemo(() => {
    const query = normalizeText(inputCode);
    if (!query) return [];

    return inventory
      .filter((item) => {
        const codeNorm = normalizeText(item.code || '');
        const nameNorm = normalizeText(item.name || '');
        const catNorm = normalizeText(item.category || '');
        const sizeNorm = normalizeText(item.size || '');
        const combinedNorm = `${nameNorm} ${sizeNorm} ${codeNorm}`;

        return (
          codeNorm.includes(query) ||
          nameNorm.includes(query) ||
          catNorm.includes(query) ||
          combinedNorm.includes(query)
        );
      })
      .sort((a, b) => {
        const q = query;
        const aCode = normalizeText(a.code || '');
        const bCode = normalizeText(b.code || '');
        const aName = normalizeText(a.name || '');
        const bName = normalizeText(b.name || '');

        // Prioritize exact code match, then startsWith code/name
        if (aCode === q && bCode !== q) return -1;
        if (bCode === q && aCode !== q) return 1;
        if (aCode.startsWith(q) && !bCode.startsWith(q)) return -1;
        if (bCode.startsWith(q) && !aCode.startsWith(q)) return 1;
        if (aName.startsWith(q) && !bName.startsWith(q)) return -1;
        if (bName.startsWith(q) && !aName.startsWith(q)) return 1;
        return a.name.localeCompare(b.name);
      })
      .slice(0, 8);
  }, [inventory, inputCode]);

  // Close suggestions dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectSuggestion = (product: Product) => {
    playSound('beep');
    setSelectedProduct(product);
    setSearchedCode(product.code);
    setInputCode('');
    setShowSuggestions(false);
    if (isCameraActive) {
      stopScanner();
    }
    scrollToResultCard();
  };

  const handleSearch = (queryToSearch: string, isVariantSwitch = false) => {
    const raw = queryToSearch.trim();
    const normQuery = normalizeText(raw);
    if (!normQuery) return;

    const currentInventory = inventoryRef.current;

    // 1. Exact SKU/Code or Name-Size match first (ideal for barcode scanners & variant buttons)
    let found = currentInventory.find(
      (i) =>
        normalizeText(i.code) === normQuery ||
        (i.size && normalizeText(`${i.name}-${i.size}`) === normQuery) ||
        normalizeText(i.name) === normQuery
    );

    // 2. Fallback to partial SKU or Product Name match
    if (!found) {
      found = currentInventory.find(
        (i) =>
          normalizeText(i.code).includes(normQuery) ||
          normalizeText(i.name).includes(normQuery) ||
          normalizeText(`${i.name} ${i.size || ''}`).includes(normQuery)
      );
    }

    setSearchedCode(raw);
    setShowSuggestions(false);

    if (found) {
      if (!isVariantSwitch) {
        playSound('beep');
      } else {
        playSound('click');
      }
      setSelectedProduct(found);
    } else {
      playSound('error');
      setSelectedProduct(null);
    }

    if (!isVariantSwitch) {
      scrollToResultCard();
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim()) {
      if (isCameraActive) {
        stopScanner();
      }
      handleSearch(inputCode);
      setInputCode('');
    }
  };

  // Camera Scanner
  const startScanner = async () => {
    try {
      if (scannerRef.current) {
        await stopScanner();
      }

      const html5QrCode = new Html5Qrcode('price-reader');
      scannerRef.current = html5QrCode;
      setIsCameraActive(true);

      setTimeout(() => {
        scannerBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 60);

      const config = {
        fps: 12,
        qrbox: { width: 250, height: 160 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        async (decodedText) => {
          if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
            // Immediately stop and close the camera so the user sees the scanned product right away
            await stopScanner();
            handleSearch(decodedText);
          }
        },
        () => {}
      );
    } catch (err) {
      console.error('Error starting price scanner:', err);
      showToast('No se pudo acceder a la cámara.', 'error');
      setIsCameraActive(false);
      scannerRef.current = null;
    }
  };

  const stopScanner = async () => {
    const activeScanner = scannerRef.current;
    scannerRef.current = null;
    setIsCameraActive(false);
    if (activeScanner) {
      try {
        const state = activeScanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
          await activeScanner.stop();
        }
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
  };

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, []);

  // Compute related items for the model
  const relatedItems = selectedProduct
    ? inventory.filter(
        (i) => i.name.toLowerCase() === selectedProduct.name.toLowerCase()
      )
    : [];

  const selectedProductStock = selectedProduct
    ? Math.max(0, Math.round(Number(selectedProduct.stock) || 0))
    : 0;

  const totalGlobalStock = relatedItems.reduce(
    (sum, curr) => sum + (Number(curr.stock) || 0),
    0
  );

  const stockBadgeColor =
    selectedProductStock <= 0
      ? 'text-red-600 bg-red-100 border border-red-200'
      : selectedProductStock <= 3
      ? 'text-orange-700 bg-orange-100 border border-orange-200'
      : 'text-emerald-700 bg-emerald-100 border border-emerald-200';

  return (
    <div className="flex-1 min-h-0 h-full w-full p-3 sm:p-6 lg:p-8 bg-slate-100 overflow-y-auto scroll-container pb-36 md:pb-24">
      <header className="mb-4 text-center max-w-2xl mx-auto">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Verificador de Precios</h1>
        <p className="text-slate-500 text-xs sm:text-sm mt-1">
          Escanea el código de barras o busca por <strong>SKU / código</strong> o <strong>nombre del artículo</strong> para ver su precio{usesWarehouses ? ' y disponibilidad por bodega' : ''} al instante.
        </p>
      </header>

      <div className="max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* Input & Scanner Card */}
        <div
          ref={scannerBoxRef}
          className="bg-white p-4 sm:p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center relative"
        >
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-400 rounded-t-2xl"></div>

          {/* Camera Viewport */}
          <div
            className={`w-full max-w-sm rounded-xl overflow-hidden bg-slate-50 relative mb-4 border-2 border-dashed border-slate-200 ${
              isCameraActive ? 'block' : 'hidden'
            }`}
          >
            <div id="price-reader" className="w-full min-h-[180px]"></div>
            {isCameraActive && (
              <div className="absolute bottom-3 left-0 right-0 flex justify-center z-10">
                <button
                  onClick={stopScanner}
                  className="px-4 py-1.5 bg-rose-600 text-white rounded-full text-xs font-semibold hover:bg-rose-700 shadow-lg flex items-center gap-1.5 cursor-pointer"
                >
                  <CameraOff className="w-3.5 h-3.5" />
                  <span>Detener Cámara</span>
                </button>
              </div>
            )}
          </div>

          {/* Activate Camera Button */}
          {!isCameraActive && (
            <div className="text-center w-full mb-5 mt-2">
              <button
                onClick={startScanner}
                className="px-6 py-3 bg-slate-800 text-white rounded-xl font-medium hover:bg-slate-700 transition-colors shadow-sm flex items-center gap-2.5 mx-auto cursor-pointer text-sm"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Usar Cámara del Dispositivo</span>
              </button>
            </div>
          )}

          {/* Manual Input Form (Supports SKU and Product Name with Live Suggestions) */}
          <div ref={searchContainerRef} className="w-full relative">
            <form onSubmit={handleSubmit} className="w-full relative flex items-center">
              <span className="absolute left-4 text-slate-400 pointer-events-none">
                <Search className="w-5 h-5" />
              </span>
              <input
                ref={inputRef}
                type="text"
                value={inputCode}
                onFocus={() => setShowSuggestions(true)}
                onChange={(e) => {
                  setInputCode(e.target.value);
                  setShowSuggestions(true);
                }}
                placeholder="Escribe el SKU, código o nombre del artículo..."
                className="w-full py-3.5 pl-12 pr-24 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none text-sm sm:text-base text-slate-800 transition-colors bg-slate-50"
              />
              {inputCode && (
                <button
                  type="button"
                  onClick={() => {
                    setInputCode('');
                    inputRef.current?.focus();
                  }}
                  className="absolute right-20 p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                  aria-label="Limpiar búsqueda"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                type="submit"
                className="absolute right-2 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Buscar
              </button>
            </form>

            {/* Live Autocomplete Suggestions Dropdown */}
            {showSuggestions && inputCode.trim().length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-80 overflow-y-auto divide-y divide-slate-100">
                {matchingSuggestions.length > 0 ? (
                  matchingSuggestions.map((item) => {
                    const stockNum = Number(item.stock) || 0;
                    const availableWhSummary = usesWarehouses
                      ? activeWarehouses
                          .map((wh) => ({
                            name: wh.name,
                            qty: getProductStockInWarehouse(item, wh.id, activeWarehouses),
                          }))
                          .filter((w) => w.qty > 0)
                      : [];

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectSuggestion(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            handleSelectSuggestion(item);
                          }
                        }}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-11 h-11 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 shrink-0 overflow-hidden">
                            <AdaptiveImage
                              src={item.img}
                              secondarySrc={item.img2}
                              alt={item.name}
                              variant="product"
                              compactGalleryControls
                              fallback={<Box className="w-5 h-5" />}
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-slate-500 font-mono truncate">
                              SKU: {item.code}
                              {item.size ? ` · Talla ${item.size}` : ''}
                              {item.category ? ` · ${item.category}` : ''}
                            </p>
                            {usesWarehouses && availableWhSummary.length > 0 && (
                              <p className="text-[11px] text-emerald-700 font-semibold truncate mt-0.5">
                                {availableWhSummary
                                  .map((w) => `${w.name}: ${w.qty}`)
                                  .join(' · ')}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {Number(item.discount) > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] text-slate-400 line-through font-mono">
                                L&nbsp;{Number(item.price).toFixed(2)}
                              </span>
                              <span className="text-sm font-black text-emerald-700 tabular-nums whitespace-nowrap">
                                L&nbsp;{Math.max(0, Number(item.price) - Number(item.discount)).toFixed(2)}
                              </span>
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded">
                                -L&nbsp;{Number(item.discount).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <p className="text-sm font-black text-blue-700 tabular-nums whitespace-nowrap">
                              L&nbsp;{Number(item.price).toFixed(2)}
                            </p>
                          )}
                          {canUseCreditCalculator &&
                            (() => {
                              const itemFinalCash = Math.max(
                                0,
                                Number(item.price) - Number(item.discount || 0)
                              );
                              const itemConfiguredCredit = Number(item.creditPrice) || 0;
                              if (itemFinalCash < 4000 && itemConfiguredCredit < 4000) return null;
                              const previewCredit =
                                itemConfiguredCredit > itemFinalCash
                                  ? itemConfiguredCredit
                                  : Math.round(
                                      itemFinalCash * (1 + defaultCreditMarkupPct / 100)
                                    );
                              return (
                                <p className="text-[10px] font-bold text-amber-700 tabular-nums whitespace-nowrap mt-0.5">
                                  Créd: L&nbsp;{previewCredit.toFixed(2)}
                                </p>
                              );
                            })()}
                          <p
                            className={`text-[11px] font-semibold tabular-nums mt-0.5 ${
                              stockNum > 0 ? 'text-emerald-600' : 'text-rose-500'
                            }`}
                          >
                            {stockNum > 0 ? `${stockNum} disp.` : 'Agotado'}
                          </p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-3 text-xs text-slate-500 text-center">
                    No hay coincidencias para "{inputCode}"
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Search Result Display */}
        <div ref={resultCardRef} className="scroll-mt-3">
          {selectedProduct ? (
            <div className="bg-white p-5 sm:p-8 rounded-2xl shadow-xl border-2 border-emerald-500/30 text-center animate-in fade-in zoom-in-95 duration-200">
              {/* Quick Re-Scan Bar */}
              <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
                  <Barcode className="w-3.5 h-3.5" />
                  Artículo Escaneado
                </span>
                <button
                  type="button"
                  onClick={startScanner}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Escanear Otro</span>
                </button>
              </div>

              {/* Image Preview (Smart Adaptive Container) */}
              <div className="flex justify-center mb-4">
                <div className="w-40 h-40 sm:w-48 sm:h-48 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 border border-slate-200 shadow-sm overflow-hidden">
                  <AdaptiveImage
                    src={selectedProduct.img}
                    secondarySrc={selectedProduct.img2}
                    alt={selectedProduct.name}
                    variant="product"
                    enableZoom
                    fallback={<Box className="w-16 h-16" />}
                  />
                </div>
              </div>

              <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
                {selectedProduct.category}
              </p>
              <h2 className="text-2xl sm:text-3xl font-black text-slate-800 mb-1 leading-tight">
                {selectedProduct.name}
              </h2>
              <p className="text-slate-400 font-mono text-xs mb-3">
                Cód: {selectedProduct.code}
                {selectedProduct.size ? ` · Talla: ${selectedProduct.size}` : ''}
              </p>
              {getProductColors(selectedProduct).length > 0 && (
                <div className="flex flex-wrap items-center justify-center gap-1.5 mb-5">
                  {getProductColors(selectedProduct).map((colName) => {
                    const sw = resolveColorSwatch(colName);
                    return (
                      <span
                        key={colName}
                        className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 border"
                          style={{
                            background: sw.hex,
                            borderColor: sw.borderHex,
                          }}
                        />
                        <span>{colName}</span>
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Price Box + Credit & Quick Installment Calculator (>= L. 4,000.00) */}
              {(() => {
                const basePrice = Number(selectedProduct.price) || 0;
                const disc = Math.min(basePrice, Math.max(0, Number(selectedProduct.discount) || 0));
                const finalPrice = Math.max(0, basePrice - disc);
                const configuredCreditPrice = Math.max(0, Number(selectedProduct.creditPrice) || 0);
                const isCreditEligible = finalPrice >= 4000 || configuredCreditPrice >= 4000;

                const fallbackHigherCredit =
                  configuredCreditPrice > finalPrice
                    ? configuredCreditPrice
                    : Math.round(finalPrice * (1 + defaultCreditMarkupPct / 100));
                const parsedCreditInput = parseFloat(creditTotalInput);
                const effectiveCreditTotal =
                  !Number.isNaN(parsedCreditInput) && parsedCreditInput > 0
                    ? parsedCreditInput
                    : fallbackHigherCredit;

                const creditMarkupAmount = effectiveCreditTotal - finalPrice;
                const creditMarkupPercent =
                  finalPrice > 0 ? (creditMarkupAmount / finalPrice) * 100 : 0;

                const unitCost = Math.max(0, Number(selectedProduct.cost) || 0);
                const creditProfit = effectiveCreditTotal - unitCost;
                const creditMarginPct =
                  effectiveCreditTotal > 0 ? (creditProfit / effectiveCreditTotal) * 100 : 0;
                const creditRoiOnCostPct =
                  unitCost > 0 ? (creditProfit / unitCost) * 100 : 0;

                const rawDown = Math.max(0, parseFloat(creditDownPaymentInput) || 0);
                const safeDownPayment = Math.min(effectiveCreditTotal, rawDown);
                const financedBalance = Math.max(0, effectiveCreditTotal - safeDownPayment);
                const safeInstallments = Math.max(1, Math.round(Number(creditInstallments) || 1));
                const quotaAmount = financedBalance / safeInstallments;

                const applyCreditMarkupPct = (pct: number) => {
                  const cleanPct = Math.max(1, Math.min(200, pct));
                  const nextCreditTotal = Math.round(finalPrice * (1 + cleanPct / 100));
                  setCreditTotalInput(String(nextCreditTotal));
                  setDefaultCreditMarkupPct(cleanPct);
                  try {
                    localStorage.setItem(CREDIT_MARKUP_STORAGE_KEY, String(cleanPct));
                  } catch {
                    // ignore storage write error
                  }
                  if (creditDownPct !== null) {
                    setCreditDownPaymentInput(
                      String(Math.round((nextCreditTotal * creditDownPct) / 100))
                    );
                  }
                };

                const handleCreditTotalDirectChange = (rawVal: string) => {
                  setCreditTotalInput(rawVal);
                  const numeric = parseFloat(rawVal);
                  if (!Number.isNaN(numeric) && numeric >= 0 && creditDownPct !== null) {
                    setCreditDownPaymentInput(
                      String(Math.round((numeric * creditDownPct) / 100))
                    );
                  }
                };

                const frequencyConfig = {
                  weekly: {
                    label: 'Semanal',
                    unitPlural: 'semanas',
                    unitSingular: 'semana',
                    presets: [8, 12, 16, 24, 36, 52],
                  },
                  biweekly: {
                    label: 'Quincenal',
                    unitPlural: 'quincenas',
                    unitSingular: 'quincena',
                    presets: [4, 6, 8, 12, 18, 24],
                  },
                  monthly: {
                    label: 'Mensual',
                    unitPlural: 'meses',
                    unitSingular: 'mes',
                    presets: [3, 6, 9, 12, 18, 24],
                  },
                }[creditFrequency];

                return (
                  <div className="space-y-4 mb-5">
                    <div
                      className={`rounded-2xl p-5 sm:p-6 border flex flex-col items-center justify-center shadow-inner ${
                        disc > 0
                          ? 'bg-emerald-50/90 border-emerald-200'
                          : 'bg-blue-50 border-blue-100'
                      }`}
                    >
                      <p
                        className={`text-xs font-semibold mb-1 uppercase tracking-wide ${
                          disc > 0 ? 'text-emerald-700' : 'text-blue-600'
                        }`}
                      >
                        {disc > 0 ? 'Precio Contado con Descuento' : 'Precio de Contado'}{' '}
                        {selectedProduct.size && (
                          <span
                            className={`px-2 py-0.5 rounded ml-1 font-bold ${
                              disc > 0
                                ? 'bg-emerald-200 text-emerald-900'
                                : 'bg-blue-200 text-blue-800'
                            }`}
                          >
                            Talla {selectedProduct.size}
                          </span>
                        )}
                      </p>

                      {disc > 0 && (
                        <div className="flex items-center justify-center gap-2 my-1 flex-wrap">
                          <span className="text-lg font-bold text-slate-400 line-through font-mono whitespace-nowrap">
                            Antes: L&nbsp;{basePrice.toFixed(2)}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-600 text-white shadow-xs whitespace-nowrap">
                            Descuento: -L&nbsp;{disc.toFixed(2)}
                            {selectedProduct.discountType === 'percent' && selectedProduct.discountValue
                              ? ` (${selectedProduct.discountValue}%)`
                              : ''}
                          </span>
                        </div>
                      )}

                      <p
                        className={`text-5xl sm:text-6xl font-black tracking-tight tabular-nums whitespace-nowrap ${
                          disc > 0 ? 'text-emerald-800' : 'text-blue-900'
                        }`}
                      >
                        L&nbsp;{finalPrice.toFixed(2)}
                      </p>
                    </div>

                    {canUseCreditCalculator && isCreditEligible ? (
                      <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5 text-left space-y-4">
                        {/* Credit Price Header */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-amber-200/80">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center shrink-0">
                              <CreditCard className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <h3 className="text-sm font-bold text-slate-900">
                                  Precio al Crédito
                                </h3>
                                <span className="text-[11px] font-semibold text-amber-800">
                                  · Aplica desde L.&nbsp;4,000
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 tabular-nums">
                                {creditMarkupAmount > 0
                                  ? `Sube +L. ${creditMarkupAmount.toFixed(2)} (+${creditMarkupPercent.toFixed(1)}%) sobre contado`
                                  : configuredCreditPrice > finalPrice
                                  ? 'Precio financiado asignado al artículo'
                                  : 'Ajusta el % de aumento o total al crédito'}
                              </p>
                            </div>
                          </div>

                          <div className="text-right ml-auto">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-amber-800">
                              Total Crédito
                            </span>
                            <span className="text-2xl sm:text-3xl font-black text-amber-950 tabular-nums whitespace-nowrap">
                              L&nbsp;{effectiveCreditTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        {/* Surcharge % Presets + Direct Total Override */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end pb-3 border-b border-amber-200/70">
                          <div className="sm:col-span-7 space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-600">
                              Aumento al Crédito (% sobre contado)
                            </label>
                            <div className="flex flex-wrap items-center gap-1">
                              {[10, 15, 20, 25, 30, 40, 50].map((pct) => {
                                const isCurrentPct =
                                  Math.abs(creditMarkupPercent - pct) < 0.35;
                                return (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => applyCreditMarkupPct(pct)}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                                      isCurrentPct
                                        ? 'bg-slate-900 text-white border-slate-900'
                                        : 'bg-white text-slate-700 border-amber-200 hover:bg-amber-100/60'
                                    }`}
                                  >
                                    +{pct}%
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div className="sm:col-span-5 space-y-1.5">
                            <label className="block text-xs font-semibold text-slate-600">
                              Precio Crédito Manual (L.)
                            </label>
                            <div className="relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                L.
                              </span>
                              <input
                                type="number"
                                inputMode="decimal"
                                enterKeyHint="done"
                                min={finalPrice}
                                step="any"
                                value={creditTotalInput}
                                onFocus={(e) => e.target.select()}
                                onChange={(e) => handleCreditTotalDirectChange(e.target.value)}
                                className="w-full pl-8 pr-3 py-1.5 bg-white border border-amber-300 rounded-xl text-sm font-bold tabular-nums text-slate-900 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        {/* Live Credit Profit Breakdown (Cost vs Selected Credit Total) */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 bg-white border border-emerald-200/90 rounded-xl p-3 tabular-nums">
                          <div>
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                              Precio Costo
                            </span>
                            <span className="text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap">
                              {unitCost > 0 ? `L\u00A0${unitCost.toFixed(2)}` : 'Sin costo reg.'}
                            </span>
                          </div>

                          <div>
                            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                              <TrendingUp className="w-3 h-3 shrink-0" />
                              <span>Ganancia al Crédito</span>
                            </span>
                            <div className="flex items-baseline gap-1.5 flex-wrap">
                              <span
                                className={`text-sm sm:text-base font-black whitespace-nowrap ${
                                  creditProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                {creditProfit >= 0 ? '+' : '-'}L&nbsp;{Math.abs(creditProfit).toFixed(2)}
                              </span>
                              {unitCost > 0 && (
                                <span className="text-[11px] font-semibold text-emerald-700 whitespace-nowrap">
                                  ({creditRoiOnCostPct.toFixed(1)}% s/costo · {creditMarginPct.toFixed(1)}% margen)
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="sm:text-right">
                            <span className="block text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                              Extra sobre Contado
                            </span>
                            <span className="text-xs sm:text-sm font-extrabold text-amber-900 whitespace-nowrap">
                              {creditMarkupAmount >= 0 ? '+' : '-'}L&nbsp;
                              {Math.abs(creditMarkupAmount).toFixed(2)} ({creditMarkupPercent >= 0 ? '+' : ''}
                              {creditMarkupPercent.toFixed(1)}%)
                            </span>
                          </div>
                        </div>

                        {/* Quick Installment Calculator */}
                        <div className="space-y-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                              <Calculator className="w-3.5 h-3.5 text-amber-700" />
                              <span>Calculador Rápido de Prima y Cuotas</span>
                            </span>

                            {/* Frequency Selector */}
                            <div className="flex items-center bg-white p-0.5 rounded-lg border border-amber-200">
                              {(
                                [
                                  { id: 'weekly', label: 'Semanal' },
                                  { id: 'biweekly', label: 'Quincenal' },
                                  { id: 'monthly', label: 'Mensual' },
                                ] as const
                              ).map((freq) => (
                                <button
                                  key={freq.id}
                                  type="button"
                                  onClick={() => {
                                    setCreditFrequency(freq.id);
                                    setCreditInstallments(
                                      freq.id === 'weekly' ? 16 : freq.id === 'biweekly' ? 12 : 6
                                    );
                                  }}
                                  className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                                    creditFrequency === freq.id
                                      ? 'bg-slate-900 text-white'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {freq.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                            {/* Prima Input + Quick Percentages */}
                            <div className="space-y-1.5">
                              <label className="block text-xs font-semibold text-slate-600">
                                Prima / Enganche (L.)
                              </label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                  L.
                                </span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  enterKeyHint="done"
                                  min="0"
                                  max={effectiveCreditTotal}
                                  step="any"
                                  value={creditDownPaymentInput}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    setCreditDownPct(null);
                                    setCreditDownPaymentInput(e.target.value);
                                  }}
                                  className="w-full pl-8 pr-3 py-2 bg-white border border-amber-300 rounded-xl text-sm font-bold tabular-nums text-slate-900 focus:ring-2 focus:ring-amber-500/30 focus:border-amber-600 outline-none"
                                />
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {[0, 10, 20, 30, 50].map((pct) => {
                                  const presetVal = Math.round((effectiveCreditTotal * pct) / 100);
                                  const isSelected =
                                    creditDownPct === pct ||
                                    Math.round(safeDownPayment) === presetVal;
                                  return (
                                    <button
                                      key={pct}
                                      type="button"
                                      onClick={() => {
                                        setCreditDownPct(pct);
                                        setCreditDownPaymentInput(String(presetVal));
                                      }}
                                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                                        isSelected
                                          ? 'bg-amber-700 text-white border-amber-700'
                                          : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-100/60'
                                      }`}
                                    >
                                      {pct === 0 ? '0% Sin prima' : `${pct}%`}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Installments Count Stepper + Presets */}
                            <div className="space-y-1.5">
                              <label className="block text-xs font-semibold text-slate-600">
                                Cantidad de Cuotas ({frequencyConfig.unitPlural})
                              </label>
                              <div className="flex items-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCreditInstallments((prev) => Math.max(1, prev - 1))
                                  }
                                  className="px-3 py-2 bg-white hover:bg-amber-100/60 border border-amber-300 border-r-0 rounded-l-xl font-bold text-slate-700 text-sm cursor-pointer"
                                >
                                  -
                                </button>
                                <input
                                  type="number"
                                  inputMode="numeric"
                                  pattern="[0-9]*"
                                  enterKeyHint="done"
                                  min="1"
                                  max="120"
                                  value={creditInstallments}
                                  onFocus={(e) => e.target.select()}
                                  onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    setCreditInstallments(
                                      Number.isNaN(val) ? 1 : Math.min(120, Math.max(1, val))
                                    );
                                  }}
                                  className="w-full py-2 border border-amber-300 bg-white text-center text-sm font-bold tabular-nums text-slate-900 outline-none focus:ring-2 focus:ring-amber-500/30 min-w-0"
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    setCreditInstallments((prev) => Math.min(120, prev + 1))
                                  }
                                  className="px-3 py-2 bg-white hover:bg-amber-100/60 border border-amber-300 border-l-0 rounded-r-xl font-bold text-slate-700 text-sm cursor-pointer"
                                >
                                  +
                                </button>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {frequencyConfig.presets.map((count) => (
                                  <button
                                    key={count}
                                    type="button"
                                    onClick={() => setCreditInstallments(count)}
                                    className={`px-2 py-1 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer tabular-nums ${
                                      safeInstallments === count
                                        ? 'bg-amber-700 text-white border-amber-700'
                                        : 'bg-white text-slate-600 border-amber-200 hover:bg-amber-100/60'
                                    }`}
                                  >
                                    {count}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>

                          {/* Live Quote Result Strip */}
                          <div className="grid grid-cols-3 gap-2 sm:gap-3 bg-white border border-amber-200 rounded-xl p-3 sm:p-3.5 tabular-nums">
                            <div>
                              <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                Prima
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap">
                                L&nbsp;{safeDownPayment.toFixed(2)}
                              </span>
                            </div>

                            <div>
                              <span className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                                Saldo a financiar
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-slate-800 whitespace-nowrap">
                                L&nbsp;{financedBalance.toFixed(2)}
                              </span>
                            </div>

                            <div className="text-right">
                              <span className="block text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                                Cuota {frequencyConfig.label} ({safeInstallments})
                              </span>
                              <span className="text-base sm:text-lg font-black text-amber-900 whitespace-nowrap">
                                L&nbsp;{quotaAmount.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Plan Listo: Quote Export (PNG Image, PDF, WhatsApp) & One-Click POS Handoff */}
                          <div className="pt-2.5 border-t border-amber-200/80 space-y-2.5">
                            <p className="text-[11px] text-slate-600 tabular-nums">
                              Plan listo:{' '}
                              <strong className="text-slate-900">
                                L&nbsp;{effectiveCreditTotal.toFixed(2)}
                              </strong>{' '}
                              · Prima{' '}
                              <strong className="text-slate-900">
                                L&nbsp;{safeDownPayment.toFixed(2)}
                              </strong>{' '}
                              · {safeInstallments} cuotas {frequencyConfig.label.toLowerCase()} de{' '}
                              <strong className="text-amber-900">
                                L&nbsp;{quotaAmount.toFixed(2)}
                              </strong>
                            </p>

                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                disabled={isExportingQuote !== null}
                                onClick={async () => {
                                  if (effectiveCreditTotal <= 0) {
                                    showToast(
                                      'Ingresa un precio total al crédito válido antes de generar la imagen.',
                                      'warning'
                                    );
                                    return;
                                  }
                                  const payload: CreditQuoteSharePayload = {
                                    product: selectedProduct,
                                    storeSettings,
                                    creditTotal: Number(effectiveCreditTotal.toFixed(2)),
                                    downPayment: Number(safeDownPayment.toFixed(2)),
                                    financedBalance: Number(financedBalance.toFixed(2)),
                                    frequency: creditFrequency,
                                    installments: safeInstallments,
                                    installmentAmount: Number(quotaAmount.toFixed(2)),
                                  };
                                  setIsExportingQuote('image');
                                  try {
                                    playSound('click');
                                    await downloadCreditQuoteImage(payload);
                                    showToast(
                                      'Imagen de cotización con foto del artículo descargada.',
                                      'success'
                                    );
                                  } catch {
                                    showToast(
                                      'No se pudo generar la imagen de cotización.',
                                      'error'
                                    );
                                  } finally {
                                    setIsExportingQuote(null);
                                  }
                                }}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 active:scale-[0.99] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-sm"
                              >
                                {isExportingQuote === 'image' ? (
                                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                ) : (
                                  <ImageIcon className="w-4 h-4 shrink-0" />
                                )}
                                <span>Imagen</span>
                              </button>

                              <button
                                type="button"
                                disabled={isExportingQuote !== null}
                                onClick={async () => {
                                  if (effectiveCreditTotal <= 0) {
                                    showToast(
                                      'Ingresa un precio total al crédito válido antes de generar el PDF.',
                                      'warning'
                                    );
                                    return;
                                  }
                                  const payload: CreditQuoteSharePayload = {
                                    product: selectedProduct,
                                    storeSettings,
                                    creditTotal: Number(effectiveCreditTotal.toFixed(2)),
                                    downPayment: Number(safeDownPayment.toFixed(2)),
                                    financedBalance: Number(financedBalance.toFixed(2)),
                                    frequency: creditFrequency,
                                    installments: safeInstallments,
                                    installmentAmount: Number(quotaAmount.toFixed(2)),
                                  };
                                  setIsExportingQuote('pdf');
                                  try {
                                    playSound('click');
                                    await downloadCreditQuotePdf(payload);
                                    showToast(
                                      'Cotización en PDF generada y descargada con éxito.',
                                      'success'
                                    );
                                  } catch {
                                    showToast(
                                      'No se pudo generar la cotización en PDF.',
                                      'error'
                                    );
                                  } finally {
                                    setIsExportingQuote(null);
                                  }
                                }}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 active:scale-[0.99] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-sm"
                              >
                                {isExportingQuote === 'pdf' ? (
                                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                ) : (
                                  <FileText className="w-4 h-4 shrink-0" />
                                )}
                                <span>PDF</span>
                              </button>

                              <button
                                type="button"
                                disabled={isExportingQuote !== null}
                                onClick={async () => {
                                  if (effectiveCreditTotal <= 0) {
                                    showToast(
                                      'Ingresa un precio total al crédito válido antes de enviar por WhatsApp.',
                                      'warning'
                                    );
                                    return;
                                  }
                                  const payload: CreditQuoteSharePayload = {
                                    product: selectedProduct,
                                    storeSettings,
                                    creditTotal: Number(effectiveCreditTotal.toFixed(2)),
                                    downPayment: Number(safeDownPayment.toFixed(2)),
                                    financedBalance: Number(financedBalance.toFixed(2)),
                                    frequency: creditFrequency,
                                    installments: safeInstallments,
                                    installmentAmount: Number(quotaAmount.toFixed(2)),
                                  };
                                  const whatsappText = buildCreditQuoteWhatsAppText(payload);
                                  setIsExportingQuote('whatsapp');
                                  try {
                                    playSound('click');
                                    const { blob, filename } =
                                      await generateCreditQuoteImageBlob(payload);

                                    let sharedNatively = false;
                                    if (
                                      typeof navigator !== 'undefined' &&
                                      typeof navigator.share === 'function' &&
                                      typeof File !== 'undefined'
                                    ) {
                                      const quoteFile = new File([blob], filename, {
                                        type: 'image/png',
                                      });
                                      if (
                                        !navigator.canShare ||
                                        navigator.canShare({ files: [quoteFile] })
                                      ) {
                                        try {
                                          await navigator.share({
                                            files: [quoteFile],
                                            title: `Cotización al Crédito - ${selectedProduct.name}`,
                                            text: whatsappText,
                                          });
                                          sharedNatively = true;
                                        } catch (shareErr: unknown) {
                                          if (
                                            shareErr instanceof Error &&
                                            shareErr.name === 'AbortError'
                                          ) {
                                            return;
                                          }
                                        }
                                      }
                                    }

                                    if (!sharedNatively) {
                                      const imgUrl = URL.createObjectURL(blob);
                                      const link = document.createElement('a');
                                      link.href = imgUrl;
                                      link.download = filename;
                                      document.body.appendChild(link);
                                      link.click();
                                      document.body.removeChild(link);
                                      window.setTimeout(() => URL.revokeObjectURL(imgUrl), 2000);

                                      const waLink = document.createElement('a');
                                      waLink.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(
                                        whatsappText
                                      )}`;
                                      waLink.target = '_blank';
                                      waLink.rel = 'noopener noreferrer';
                                      document.body.appendChild(waLink);
                                      waLink.click();
                                      document.body.removeChild(waLink);

                                      showToast(
                                        'Se descargó la imagen de la cotización y se abrió WhatsApp. Adjunta la imagen en el chat.',
                                        'success'
                                      );
                                    }
                                  } catch {
                                    const waFallback = document.createElement('a');
                                    waFallback.href = `https://api.whatsapp.com/send?text=${encodeURIComponent(
                                      whatsappText
                                    )}`;
                                    waFallback.target = '_blank';
                                    waFallback.rel = 'noopener noreferrer';
                                    document.body.appendChild(waFallback);
                                    waFallback.click();
                                    document.body.removeChild(waFallback);
                                    showToast(
                                      'Se abrió WhatsApp con el plan de crédito listo para enviar.',
                                      'info'
                                    );
                                  } finally {
                                    setIsExportingQuote(null);
                                  }
                                }}
                                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 active:scale-[0.99] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-sm"
                              >
                                {isExportingQuote === 'whatsapp' ? (
                                  <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                                ) : (
                                  <MessageCircle className="w-4 h-4 shrink-0" />
                                )}
                                <span>Enviar WhatsApp</span>
                              </button>

                              {canSendToPos && onSendToPosCredit && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (effectiveCreditTotal <= 0) {
                                      showToast(
                                        'Ingresa un precio total al crédito válido antes de pasar a POS.',
                                        'warning'
                                      );
                                      return;
                                    }
                                    playSound('click');
                                    onSendToPosCredit({
                                      id: `pc_credit_${Date.now()}`,
                                      product: selectedProduct,
                                      creditTotal: Number(effectiveCreditTotal.toFixed(2)),
                                      downPayment: Number(safeDownPayment.toFixed(2)),
                                      frequency: creditFrequency,
                                      installments: safeInstallments,
                                      installmentAmount: Number(quotaAmount.toFixed(2)),
                                    });
                                  }}
                                  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-[0.99] text-white text-xs sm:text-sm font-bold transition-all cursor-pointer shadow-sm sm:ml-auto"
                                >
                                  <Receipt className="w-4 h-4 text-emerald-400 shrink-0" />
                                  <span>Ir a POS y Facturar al Crédito</span>
                                  <ArrowRight className="w-4 h-4 shrink-0" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : canUseCreditCalculator ? (
                      <div className="px-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 flex items-center justify-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>
                          Plan de crédito disponible únicamente en artículos desde{' '}
                          <strong className="text-slate-700 whitespace-nowrap">
                            L.&nbsp;4,000.00
                          </strong>{' '}
                          en adelante.
                        </span>
                      </div>
                    ) : null}
                  </div>
                );
              })()}

              {/* Stock Summary Badge */}
              <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                <div
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl ${stockBadgeColor} font-bold text-sm sm:text-base`}
                >
                  <Layers className="w-5 h-5 shrink-0" />
                  <span>
                    Stock Disponible: <strong className="tabular-nums">{selectedProductStock}</strong>{' '}
                    {selectedProductStock === 1 ? 'unidad' : 'unidades'}
                  </span>
                </div>
                {relatedItems.length > 1 && totalGlobalStock !== selectedProductStock && (
                  <div className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs sm:text-sm">
                    <span>Total todas las tallas: {totalGlobalStock}</span>
                  </div>
                )}
              </div>

              {/* Warehouse Availability Breakdown (Shown when store uses the Bodegas module) */}
              {usesWarehouses && selectedProductWarehouseBreakdown.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200/80 text-left">
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4" />
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wide">
                          Disponibilidad por Bodega
                        </h3>
                        <p className="text-[11px] text-slate-500">
                          {availableWarehousesCount > 0
                            ? `Disponible en ${availableWarehousesCount} de ${selectedProductWarehouseBreakdown.length} ${
                                selectedProductWarehouseBreakdown.length === 1 ? 'bodega' : 'bodegas'
                              }`
                            : 'Sin existencias disponibles en ninguna bodega'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {selectedProductWarehouseBreakdown.map(({ warehouse, stock }) => {
                      const hasStock = stock > 0;
                      return (
                        <div
                          key={warehouse.id}
                          className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                            hasStock
                              ? 'bg-emerald-50/70 border-emerald-200/90 shadow-2xs'
                              : 'bg-slate-50 border-slate-200/80 opacity-75'
                          }`}
                        >
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                                hasStock
                                  ? 'bg-emerald-600 text-white shadow-2xs'
                                  : 'bg-slate-200 text-slate-500'
                              }`}
                            >
                              {warehouse.isMainSalesFloor ? (
                                <Store className="w-4 h-4" />
                              ) : (
                                <Package className="w-4 h-4" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <p
                                  className={`text-xs sm:text-sm font-extrabold truncate ${
                                    hasStock ? 'text-slate-900' : 'text-slate-600'
                                  }`}
                                >
                                  {warehouse.name}
                                </p>
                              </div>
                              <p className="text-[11px] text-slate-500 truncate flex items-center gap-1 mt-0.5">
                                <span className="font-mono font-semibold">
                                  {warehouse.code || (warehouse.isMainSalesFloor ? 'PRINCIPAL' : 'BODEGA')}
                                </span>
                                <span>·</span>
                                <span>
                                  {warehouse.isMainSalesFloor ? 'Sala de Ventas' : 'Almacén / Bodega'}
                                </span>
                              </p>
                              {warehouse.address && (
                                <p className="text-[10px] text-slate-400 truncate flex items-center gap-1 mt-0.5">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  <span className="truncate">{warehouse.address}</span>
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`inline-flex flex-col items-end px-2.5 py-1 rounded-lg border ${
                                hasStock
                                  ? 'bg-white border-emerald-200 text-emerald-800'
                                  : 'bg-slate-100 border-slate-200 text-slate-500'
                              }`}
                            >
                              <span className="text-base sm:text-lg font-black tabular-nums leading-none">
                                {stock}
                              </span>
                              <span
                                className={`text-[9px] font-extrabold uppercase tracking-wider mt-0.5 flex items-center gap-0.5 ${
                                  hasStock ? 'text-emerald-600' : 'text-rose-500'
                                }`}
                              >
                                {hasStock ? (
                                  <>
                                    <CheckCircle2 className="w-2.5 h-2.5" />
                                    <span>Disp.</span>
                                  </>
                                ) : (
                                  <span>Agotado</span>
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Size Variants Switcher */}
              {relatedItems.length > 1 && (
                <div className="mt-5 pt-5 border-t border-slate-100 w-full flex flex-col items-center">
                  <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3">
                    Toca otra talla para ver su precio y stock por bodega
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {relatedItems.map((variant) => {
                      const isSelected = variant.code === selectedProduct.code;
                      const stockNum = Number(variant.stock) || 0;

                      let btnStyle = 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700';
                      if (isSelected) {
                        btnStyle = 'ring-2 ring-blue-500 bg-blue-50 border-blue-200 text-blue-700 scale-105';
                      } else if (stockNum <= 0) {
                        btnStyle = 'bg-red-50 text-red-500 border-red-100 opacity-70';
                      }

                      return (
                        <button
                          key={variant.id}
                          type="button"
                          onClick={() => handleSearch(variant.code, true)}
                          className={`px-4 py-2 font-bold text-sm rounded-xl border shadow-sm flex flex-col items-center transition-all cursor-pointer ${btnStyle}`}
                        >
                          <span>{variant.size || variant.code}</span>
                          <span
                            className={`text-[10px] font-normal uppercase ${
                              isSelected
                                ? 'text-blue-500'
                                : stockNum > 0
                                ? 'text-slate-500'
                                : 'text-red-500'
                            }`}
                          >
                            {stockNum} unids
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : searchedCode ? (
            <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-200">
              <div className="w-20 h-20 rounded-full bg-rose-100 text-rose-500 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 mb-2">Producto no encontrado</h2>
              <p className="text-slate-500 text-sm mb-5">
                El SKU o nombre{' '}
                <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                  {searchedCode}
                </span>{' '}
                no está registrado en el inventario.
              </p>
              <button
                type="button"
                onClick={startScanner}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-sm font-bold inline-flex items-center gap-2 shadow-sm transition-colors cursor-pointer"
              >
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Intentar Escanear de Nuevo</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
