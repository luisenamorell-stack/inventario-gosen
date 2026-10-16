import React, { useState, useEffect } from 'react';
import { Download, Share, PlusSquare, X, Check, Smartphone, Sparkles } from 'lucide-react';
import { StoreSettings } from '../types';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

interface PWAInstallPromptProps {
  isOpen: boolean;
  onClose: () => void;
  storeSettings?: StoreSettings;
}

export const PWAInstallPrompt: React.FC<PWAInstallPromptProps> = ({
  isOpen,
  onClose,
  storeSettings,
}) => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if running as installed standalone PWA
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone === true;
    setIsStandalone(isStandaloneMode);

    // Detect iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIosDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIosDevice);

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setInstalled(true);
      }
      setDeferredPrompt(null);
    } catch (err) {
      console.warn('Install prompt error:', err);
    }
  };

  if (!isOpen) return null;

  const logoSrc = storeSettings?.logoUrl || '/pwa-512x512.png';
  const storeName = storeSettings?.storeName || 'Tienda Gosén';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header with store background */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 text-white text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-all cursor-pointer"
            aria-label="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>

          {/* App Logo Display */}
          <div className="mx-auto w-24 h-24 rounded-2xl bg-slate-900 p-2 shadow-xl border-2 border-emerald-500/40 flex items-center justify-center overflow-hidden mb-3">
            <img
              src={logoSrc}
              alt={storeName}
              className="w-full h-full object-contain rounded-xl"
              onError={(e) => {
                // Fallback to pwa-192x192.png
                (e.target as HTMLImageElement).src = '/pwa-192x192.png';
              }}
            />
          </div>

          <h3 className="text-xl font-bold tracking-tight">{storeName}</h3>
          <p className="text-xs text-emerald-400 font-medium mt-0.5">
            Instalar Aplicación Móvil
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {installed || isStandalone ? (
            <div className="text-center py-4 space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
                <Check className="w-6 h-6 stroke-[3]" />
              </div>
              <h4 className="font-bold text-slate-800 text-lg">
                ¡Ya está instalada!
              </h4>
              <p className="text-sm text-slate-600">
                La aplicación ya se encuentra lista en tu dispositivo con el logotipo oficial de {storeName}.
              </p>
            </div>
          ) : isIOS ? (
            /* iOS Safari Instructions */
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-xs text-blue-900 space-y-2">
                <p className="font-semibold flex items-center gap-1.5 text-blue-950">
                  <Smartphone className="w-4 h-4 text-blue-600 shrink-0" />
                  Instrucciones para iPhone / iPad (Safari):
                </p>
                <ol className="list-decimal list-inside space-y-2 text-slate-700 pl-1 font-medium">
                  <li className="leading-relaxed">
                    Toca el botón <span className="inline-flex items-center gap-1 font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200 text-blue-700"><Share className="w-3.5 h-3.5" /> Compartir</span> en la barra inferior de Safari.
                  </li>
                  <li className="leading-relaxed">
                    Desliza hacia abajo y selecciona <span className="inline-flex items-center gap-1 font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200 text-slate-800"><PlusSquare className="w-3.5 h-3.5" /> Agregar al inicio</span>.
                  </li>
                  <li className="leading-relaxed">
                    Confirma presionando <span className="font-bold text-blue-700">Agregar</span>. ¡Aparecerá en tu pantalla con el logo de {storeName}!
                  </li>
                </ol>
              </div>

              <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600">
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Funciona en pantalla completa sin barra de navegación, como una app nativa.</span>
              </div>
            </div>
          ) : deferredPrompt ? (
            /* Android / Chrome One-Click Install */
            <div className="space-y-4 text-center">
              <p className="text-sm text-slate-600">
                Instala la aplicación en tu teléfono o tablet para acceder rápidamente con el logotipo de {storeName} en tu pantalla de inicio y trabajar sin conexión.
              </p>

              <button
                type="button"
                onClick={handleInstallClick}
                className="w-full py-3.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl transition-all shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Download className="w-5 h-5" />
                <span>Instalar {storeName} en mi Teléfono</span>
              </button>
            </div>
          ) : (
            /* Generic / Chrome Instructions */
            <div className="space-y-3">
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-xs text-slate-700 space-y-2">
                <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-emerald-600" />
                  Para agregar a tu pantalla de inicio:
                </p>
                <p>
                  1. Abre el menú de tu navegador (los <span className="font-bold">tres puntos ⋮</span> en la esquina superior derecha en Chrome).
                </p>
                <p>
                  2. Selecciona <span className="font-bold text-emerald-700">"Instalar aplicación"</span> o <span className="font-bold text-emerald-700">"Agregar a la pantalla principal"</span>.
                </p>
                <p>
                  3. La aplicación se guardará automáticamente con el icono oficial de la tienda.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
};
