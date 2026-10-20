import React, { useState, useEffect, useRef } from 'react';
import { Product } from '../types';
import { playSound } from '../utils/audio';
import {
  Tag,
  Barcode,
  Camera,
  CameraOff,
  Box,
  AlertCircle,
  Layers
} from 'lucide-react';
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode';

interface PriceCheckerTabProps {
  inventory: Product[];
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const PriceCheckerTab: React.FC<PriceCheckerTabProps> = ({
  inventory,
  showToast,
}) => {
  const [inputCode, setInputCode] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [searchedCode, setSearchedCode] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);



  const handleSearch = (codeToSearch: string, isVariantSwitch = false) => {
    const code = codeToSearch.trim().toLowerCase();
    if (!code) return;

    const found = inventory.find(
      (i) => i.code.toLowerCase() === code || (i.size && `${i.name}-${i.size}`.toLowerCase() === code)
    );

    setSearchedCode(codeToSearch);

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
          Escanea o ingresa el código del producto para verificar su precio y disponibilidad de stock al instante.
        </p>
      </header>

      <div className="max-w-xl mx-auto w-full flex flex-col gap-6">
        {/* Input & Scanner Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-400"></div>

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

          {/* Manual Input Form */}
          <form onSubmit={handleSubmit} className="w-full relative">
            <span className="absolute left-4 top-3.5 text-slate-400 text-lg">
              <Barcode className="w-5 h-5" />
            </span>
            <input
              ref={inputRef}
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Escribe el código y presiona Enter..."
              className="w-full p-4 pl-12 border-2 border-slate-200 rounded-xl focus:border-blue-500 outline-none text-base text-center font-mono transition-colors bg-slate-50"
            />
          </form>
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
            <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100 flex flex-col items-center justify-center mb-6 shadow-inner">
              <p className="text-xs text-blue-600 font-semibold mb-1 uppercase tracking-wide">
                Precio de Venta{' '}
                {selectedProduct.size && (
                  <span className="bg-blue-200 text-blue-800 px-2 py-0.5 rounded ml-1 font-bold">
                    Talla {selectedProduct.size}
                  </span>
                )}
              </p>
              <p className="text-5xl sm:text-6xl font-black text-blue-900 tracking-tight">
                L {Number(selectedProduct.price).toFixed(2)}
              </p>
            </div>

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
              El código{' '}
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
