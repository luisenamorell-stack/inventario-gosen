import React, { useEffect, useState } from 'react';
import { ToastMessage } from '../types';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const AUTO_DISMISS_MS = 3200;

const ToastItem: React.FC<{
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}> = ({ toast, onDismiss }) => {
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    const fadeOutTimer = setTimeout(() => {
      setIsLeaving(true);
    }, AUTO_DISMISS_MS - 300);

    const removeTimer = setTimeout(() => {
      onDismiss(toast.id);
    }, AUTO_DISMISS_MS);

    return () => {
      clearTimeout(fadeOutTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, onDismiss]);

  let bg = 'bg-slate-900 text-white';
  let icon = <Info className="w-5 h-5 text-blue-400 shrink-0" />;

  if (toast.type === 'success') {
    bg = 'bg-emerald-600 text-white';
    icon = <CheckCircle2 className="w-5 h-5 text-white shrink-0" />;
  } else if (toast.type === 'error') {
    bg = 'bg-rose-600 text-white';
    icon = <AlertCircle className="w-5 h-5 text-white shrink-0" />;
  } else if (toast.type === 'warning') {
    bg = 'bg-amber-500 text-white';
    icon = <AlertTriangle className="w-5 h-5 text-white shrink-0" />;
  }

  return (
    <div
      onClick={() => onDismiss(toast.id)}
      className={`${bg} px-4 py-3 rounded-xl shadow-lg flex items-center justify-between gap-3 text-sm font-medium pointer-events-auto cursor-pointer transform transition-all duration-300 ${
        isLeaving
          ? 'opacity-0 -translate-y-2 scale-95'
          : 'opacity-100 translate-y-0 scale-100 animate-in fade-in slide-in-from-top-2'
      }`}
    >
      <div className="flex items-center gap-2">
        {icon}
        <p className="leading-snug">{toast.message}</p>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss(toast.id);
        }}
        className="opacity-70 hover:opacity-100 transition-opacity p-1 rounded-lg cursor-pointer"
        title="Cerrar"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
};
