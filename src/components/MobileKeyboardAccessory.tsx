import React, { useEffect, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import {
  forceDismissMobileKeyboard,
  installMobileKeyboardEnhancements,
  MobileKeyboardState,
  subscribeMobileKeyboardState,
} from '../utils/mobileKeyboard';

/**
 * Mounts the global mobile keyboard manager once and renders a compact
 * "Listo · Cerrar Teclado" button ONLY on touch/mobile devices while a
 * virtual keyboard is open, positioned directly above the keyboard.
 */
export const MobileKeyboardAccessory: React.FC = () => {
  const [kbState, setKbState] = useState<MobileKeyboardState>({
    isOpen: false,
    isTouchEnvironment: false,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
    viewportOffsetTop: 0,
    activeInputType: null,
  });

  useEffect(() => {
    const cleanupEnhancements = installMobileKeyboardEnhancements();
    const unsub = subscribeMobileKeyboardState(setKbState);
    return () => {
      unsub();
      cleanupEnhancements();
    };
  }, []);

  if (!kbState.isOpen || !kbState.isTouchEnvironment) {
    return null;
  }

  return (
    <div className="mobile-kb-accessory fixed right-3 z-[9999] pointer-events-none">
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={() => forceDismissMobileKeyboard()}
        className="pointer-events-auto inline-flex items-center gap-1.5 min-h-[40px] px-3.5 py-2 rounded-xl bg-slate-900/95 hover:bg-slate-800 text-white text-xs font-bold shadow-lg border border-slate-700/80 backdrop-blur-sm active:scale-95 transition-transform cursor-pointer"
        aria-label="Cerrar teclado móvil"
      >
        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>Listo</span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-300 shrink-0" />
      </button>
    </div>
  );
};
