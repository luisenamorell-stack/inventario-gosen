import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Product } from '../types';
import { playSound } from '../utils/audio';
import {
  Tag,
  Barcode,
  Camera,
  CameraOff,
  Box,
  AlertCircle,
  Layers,
  Search,
  X
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface PriceCheckerTabProps {
  inventory: Product[];
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const normalizeText = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const PriceCheckerTab: React.FC<PriceCheckerTabProps> = ({
  inventory,
  showToast,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchedCode, setSearchedCode] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const searchContainerRef = useRef<HTMLDivElement | null>(null);

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
  };

  const handleSearch = (queryToSearch: string, isVariantSwitch = false) => {
    const raw = queryToSearch.trim();
    const normQuery = normalizeText(raw);
    if (!normQuery) return;

    // 1. Exact SKU/Code or Name-Size match first (ideal for barcode scanners & variant buttons)
    let found = inventory.find(
      (i) =>
        normalizeText(i.code) === normQuery ||
        (i.size && normalizeText(`${i.name}-${i.size}`) === normQuery) ||
        normalizeText(i.name) === normQuery
    );

    // 2. Fallback to partial SKU or Product Name match
    if (!found) {
      found = inventory.find(
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
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim()) {
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

      const config = {
        fps: 10,
        qrbox: { width: 250, height: 160 },
        aspectRatio: 1.0,
      };

      await html5QrCode.start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING) {
            scannerRef.current.pause();
            handleSearch(decodedText);
            setTimeout(() => {
              if (scannerRef.current && scannerRef.current.getState() === Html5QrcodeScannerState.PAUSED) {
                scannerRef.current.resume();
              }
            }, 1200);
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

  const totalGlobalStock = relatedItems.reduce(
    (sum, curr) => sum + (Number(curr.stock) || 0),
    0
  );

  const stockBadgeColor =
    totalGlobalStock <= 0
      ? 'text-red-600 bg-red-100'
      : totalGlobalStock <= 3
      ? 'text-orange-600 bg-orange-100'
      : 'text-emerald-700 bg-emerald-100';

  return (
    <div className="flex-1 min-h-0 h-full w-full p-3 sm:p-6 lg:p-8 bg-slate-100 overflow-y-auto scroll-container pb-36 md:pb-24">
      <header className="mb-6 text-center max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800">Verificador de Precios</h1>
        <p className="text-slate-500 mt-1">
          Escanea el código de barras o busca por <strong>SKU / código</strong> o <strong>nombre del artículo</strong> para verificar su precio y stock al instante.
        </p>
      </header>

      <div className="max-w-xl mx-auto w-full flex flex-col gap-6">
        {/* Input & Scanner Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center relative">
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
              <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-30 max-h-72 overflow-y-auto divide-y divide-slate-100">
                {matchingSuggestions.length > 0 ? (
                  matchingSuggestions.map((item) => {
                    const stockNum = Number(item.stock) || 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectSuggestion(item)}
                        className="w-full px-4 py-3 text-left hover:bg-blue-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {item.img ? (
                            <img
                              src={item.img}
                              alt={item.name}
                              referrerPolicy="no-referrer"
                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 border border-slate-200 shrink-0">
                              <Box className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">
                              {item.name}
                            </p>
                            <p className="text-xs text-slate-500 font-mono truncate">
                              SKU: {item.code}
                              {item.size ? ` · Talla ${item.size}` : ''}
                              {item.category ? ` · ${item.category}` : ''}
                            </p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          {Number(item.discount) > 0 ? (
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] text-slate-400 line-through font-mono">
                                L {Number(item.price).toFixed(2)}
                              </span>
                              <span className="text-sm font-black text-emerald-700 tabular-nums">
                                L {Math.max(0, Number(item.price) - Number(item.discount)).toFixed(2)}
                              </span>
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded">
                                -L {Number(item.discount).toFixed(2)}
                              </span>
                            </div>
                          ) : (
                            <p className="text-sm font-black text-blue-700 tabular-nums">
                              L {Number(item.price).toFixed(2)}
                            </p>
                          )}
                          <p
                            className={`text-[11px] font-semibold tabular-nums mt-0.5 ${
                              stockNum > 0 ? 'text-emerald-600' : 'text-rose-500'
                            }`}
                          >
                            {stockNum > 0 ? `${stockNum} disp.` : 'Agotado'}
                          </p>
                        </div>
                      </button>
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
        {selectedProduct ? (
          <div className="bg-white p-8 rounded-2xl shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-200">
            {/* Image Preview */}
            <div className="flex justify-center mb-4">
              {selectedProduct.img ? (
                <img
                  src={selectedProduct.img}
                  alt={selectedProduct.name}
                  className="w-32 h-32 object-cover rounded-2xl shadow-sm border border-slate-200"
                />
              ) : (
                <div className="w-32 h-32 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-300 border border-slate-200">
                  <Box className="w-16 h-16" />
                </div>
              )}
            </div>

            <p className="text-xs font-bold text-blue-500 uppercase tracking-widest mb-1">
              {selectedProduct.category}
            </p>
            <h2 className="text-3xl font-black text-slate-800 mb-1 leading-tight">
              {selectedProduct.name}
            </h2>
            <p className="text-slate-400 font-mono text-xs mb-6">
              Cód: {selectedProduct.code}
            </p>

            {/* Price Box */}
            {(() => {
              const basePrice = Number(selectedProduct.price) || 0;
              const disc = Math.min(basePrice, Math.max(0, Number(selectedProduct.discount) || 0));
              const finalPrice = Math.max(0, basePrice - disc);

              return (
                <div
                  className={`rounded-2xl p-6 border flex flex-col items-center justify-center mb-6 shadow-inner ${
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
                    {disc > 0 ? 'Precio Final con Descuento' : 'Precio de Venta'}{' '}
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
                      <span className="text-lg font-bold text-slate-400 line-through font-mono">
                        Antes: L {basePrice.toFixed(2)}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-rose-600 text-white shadow-xs">
                        Descuento: -L {disc.toFixed(2)}
                        {selectedProduct.discountType === 'percent' && selectedProduct.discountValue
                          ? ` (${selectedProduct.discountValue}%)`
                          : ''}
                      </span>
                    </div>
                  )}

                  <p
                    className={`text-5xl sm:text-6xl font-black tracking-tight ${
                      disc > 0 ? 'text-emerald-800' : 'text-blue-900'
                    }`}
                  >
                    L {finalPrice.toFixed(2)}
                  </p>
                </div>
              );
            })()}

            {/* Global Stock Badge */}
            <div
              className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-xl ${stockBadgeColor} font-bold text-base mb-2`}
            >
              <Layers className="w-5 h-5" />
              <span>Stock GLOBAL Total: {totalGlobalStock}</span>
            </div>

            {/* Size Variants Switcher */}
            {relatedItems.length > 1 && (
              <div className="mt-6 pt-5 border-t border-slate-100 w-full flex flex-col items-center">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-3">
                  Toca otra talla para ver su precio y stock
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
            <p className="text-slate-500 text-sm mb-4">
              El SKU o nombre{' '}
              <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded">
                {searchedCode}
              </span>{' '}
              no está registrado en el inventario.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
};
