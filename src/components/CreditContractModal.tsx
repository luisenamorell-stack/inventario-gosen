import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Printer,
  Download,
  MessageCircle,
  Edit3,
  Check,
  X,
  RotateCcw,
  ScrollText,
  ShieldCheck,
  User,
  MapPin,
  Phone,
  CreditCard,
  Calendar,
  Package,
  Building2,
  PenTool,
  Trash2,
  Eraser,
} from 'lucide-react';
import {
  SaleRecord,
  StoreSettings,
  CreditContractData,
  CreditAccountControlMeta,
  Product,
  PrinterPaperFormat,
  isStoreDigitalSignatureEnabled,
} from '../types';
import {
  resolveCreditContractData,
  CREDIT_CONTRACT_GENERAL_CONDITIONS,
  buildCreditContractHtml,
  buildSaleAndCreditContractCombinedHtml,
  downloadCreditContractPdf,
  formatCreditContractWhatsAppMessage,
  printHtmlDocument,
} from '../utils/printPdfService';

interface SignaturePadModalProps {
  title: string;
  signerName: string;
  signerSubtitle?: string;
  initialSignatureDataUrl?: string;
  onCancel: () => void;
  onConfirm: (dataUrl: string) => void;
}

const SignaturePadModal: React.FC<SignaturePadModalProps> = ({
  title,
  signerName,
  signerSubtitle,
  initialSignatureDataUrl,
  onCancel,
  onConfirm,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDrawingRef = useRef<boolean>(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState<boolean>(Boolean(initialSignatureDataUrl));
  const [penColor, setPenColor] = useState<'#0f172a' | '#1d4ed8'>('#0f172a');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = penColor;

    if (initialSignatureDataUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      };
      img.src = initialSignatureDataUrl;
    }
  }, [initialSignatureDataUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.strokeStyle = penColor;
  }, [penColor]);

  const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getCanvasPoint(e);
    isDrawingRef.current = true;
    lastPointRef.current = pt;

    ctx.strokeStyle = penColor;
    ctx.fillStyle = penColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
    ctx.fill();
    setHasStrokes(true);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const pt = getCanvasPoint(e);
    const prev = lastPointRef.current || pt;

    ctx.strokeStyle = penColor;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    const midX = (prev.x + pt.x) / 2;
    const midY = (prev.y + pt.y) / 2;
    ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();

    lastPointRef.current = pt;
    setHasStrokes(true);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    isDrawingRef.current = false;
    lastPointRef.current = null;
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handleClearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStrokes(false);
  };

  const handleSaveSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasStrokes) return;
    // Export compact high-clarity PNG for Firestore & PDF
    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = 440;
    exportCanvas.height = 160;
    const exportCtx = exportCanvas.getContext('2d');
    if (exportCtx) {
      exportCtx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
      const dataUrl = exportCanvas.toDataURL('image/png');
      onConfirm(dataUrl);
      return;
    }
    onConfirm(canvas.toDataURL('image/png'));
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-gradient-to-r from-amber-500/15 via-orange-500/5 to-transparent">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
              <PenTool className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
                {title}
              </h4>
              <p className="text-xs text-slate-600 font-semibold">
                {signerName}
                {signerSubtitle ? ` • ${signerSubtitle}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pad Body */}
        <div className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600 font-medium">
              Firme con su <span className="font-bold text-slate-900">dedo en la pantalla</span>,
              lápiz óptico o mouse dentro del recuadro:
            </p>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500">Tinta:</span>
              <button
                type="button"
                onClick={() => setPenColor('#0f172a')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border cursor-pointer ${
                  penColor === '#0f172a'
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Negra
              </button>
              <button
                type="button"
                onClick={() => setPenColor('#1d4ed8')}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold border cursor-pointer ${
                  penColor === '#1d4ed8'
                    ? 'bg-blue-700 text-white border-blue-700'
                    : 'bg-white text-blue-700 border-blue-300'
                }`}
              >
                Azul Legal
              </button>
            </div>
          </div>

          {/* Canvas Container */}
          <div className="relative rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50/20 overflow-hidden shadow-inner">
            <canvas
              ref={canvasRef}
              width={660}
              height={240}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              className="w-full h-48 sm:h-56 bg-white cursor-crosshair select-none"
              style={{ touchAction: 'none' }}
            />
            {/* Signature baseline guide */}
            <div className="pointer-events-none absolute inset-x-8 bottom-9 border-b border-slate-300 flex justify-between items-end pb-1">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                X — FIRME AQUÍ ARRIBA
              </span>
              <span className="text-[10px] font-semibold text-slate-400 truncate max-w-[220px]">
                {signerName}
              </span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 text-center">
            Al confirmar, la firma digital quedará estampada en el Contrato de Arrendamiento con
            Reserva de Dominio (vista previa, impresión y PDF).
          </p>
        </div>

        {/* Footer Buttons */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleClearCanvas}
            className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
          >
            <Eraser className="w-4 h-4 text-rose-500" />
            Borrar / Repetir
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveSignature}
              disabled={!hasStrokes}
              className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-sm disabled:opacity-40 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              Estampar Firma en Contrato
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface CreditContractViewAndEditorProps {
  sale: SaleRecord;
  storeSettings: StoreSettings;
  controlMeta?: CreditAccountControlMeta;
  inventory?: Product[];
  onSaveContract?: (updatedContract: CreditContractData) => void | Promise<void>;
  showActionButtons?: boolean;
  defaultEditing?: boolean;
  compact?: boolean;
}

export const CreditContractViewAndEditor: React.FC<CreditContractViewAndEditorProps> = ({
  sale,
  storeSettings,
  controlMeta,
  inventory = [],
  onSaveContract,
  showActionButtons = true,
  defaultEditing = false,
  compact = false,
}) => {
  const [contract, setContract] = useState<CreditContractData>(() =>
    resolveCreditContractData(sale, storeSettings, controlMeta, inventory)
  );
  const [isEditing, setIsEditing] = useState<boolean>(defaultEditing);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [printFormat, setPrintFormat] = useState<PrinterPaperFormat>('letter');
  const [activeSignatureTarget, setActiveSignatureTarget] = useState<'customer' | 'lessor' | null>(
    null
  );

  useEffect(() => {
    setContract(resolveCreditContractData(sale, storeSettings, controlMeta, inventory));
  }, [sale, storeSettings, controlMeta, inventory]);

  const handleFieldChange = <K extends keyof CreditContractData>(
    key: K,
    value: CreditContractData[K]
  ) => {
    setContract((prev) => {
      const next = { ...prev, [key]: value, updatedAt: Date.now() };
      // Auto-recalculate financedBalance and installmentValue when creditTotalValue, downPaymentValue, numberOfInstallments, or installmentValue changes
      if (key === 'creditTotalValue' || key === 'downPaymentValue') {
        const creditVal = Number(key === 'creditTotalValue' ? value : next.creditTotalValue) || 0;
        const downVal = Number(key === 'downPaymentValue' ? value : next.downPaymentValue) || 0;
        const newFinanced = Math.max(0, Number((creditVal - downVal).toFixed(2)));
        next.financedBalance = newFinanced;
        const count = Math.max(1, Number(next.numberOfInstallments) || 1);
        next.installmentValue = Number((newFinanced / count).toFixed(2));
      } else if (key === 'numberOfInstallments') {
        const count = Math.max(1, Number(value) || 1);
        next.termMonths = count;
        const fin = Number(next.financedBalance) || 0;
        next.installmentValue = Number((fin / count).toFixed(2));
      } else if (key === 'financedBalance') {
        const newFinanced = Math.max(0, Number(value) || 0);
        const downVal = Number(next.downPaymentValue) || 0;
        next.creditTotalValue = Number((newFinanced + downVal).toFixed(2));
        const count = Math.max(1, Number(next.numberOfInstallments) || 1);
        next.installmentValue = Number((newFinanced / count).toFixed(2));
      } else if (key === 'installmentValue') {
        const quota = Math.max(0, Number(value) || 0);
        const count = Math.max(1, Number(next.numberOfInstallments) || 1);
        const downVal = Number(next.downPaymentValue) || 0;
        const newFinanced = Number((quota * count).toFixed(2));
        next.financedBalance = newFinanced;
        next.creditTotalValue = Number((downVal + newFinanced).toFixed(2));
      }
      return next;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const updated = { ...contract, updatedAt: Date.now() };
      setContract(updated);
      if (onSaveContract) {
        await onSaveContract(updated);
      }
      setIsEditing(false);
      setSaveMessage('Contrato actualizado y guardado correctamente');
      setTimeout(() => setSaveMessage(null), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmDigitalSignature = async (
    target: 'customer' | 'lessor',
    dataUrl: string
  ) => {
    const nowFormatted = new Date().toLocaleString('es-HN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const updated: CreditContractData =
      target === 'customer'
        ? {
            ...contract,
            customerSignatureDataUrl: dataUrl,
            customerSignedAt: nowFormatted,
            updatedAt: Date.now(),
          }
        : {
            ...contract,
            lessorSignatureDataUrl: dataUrl,
            lessorSignedAt: nowFormatted,
            updatedAt: Date.now(),
          };

    setContract(updated);
    setActiveSignatureTarget(null);

    if (onSaveContract) {
      await onSaveContract(updated);
    }
    setSaveMessage(
      target === 'customer'
        ? 'Firma digital del cliente guardada en el contrato'
        : 'Firma digital del arrendador guardada en el contrato'
    );
    setTimeout(() => setSaveMessage(null), 3500);
  };

  const handleRemoveDigitalSignature = async (target: 'customer' | 'lessor') => {
    const updated: CreditContractData =
      target === 'customer'
        ? {
            ...contract,
            customerSignatureDataUrl: undefined,
            customerSignedAt: undefined,
            updatedAt: Date.now(),
          }
        : {
            ...contract,
            lessorSignatureDataUrl: undefined,
            lessorSignedAt: undefined,
            updatedAt: Date.now(),
          };

    setContract(updated);
    if (onSaveContract) {
      await onSaveContract(updated);
    }
    setSaveMessage('Firma digital eliminada del contrato');
    setTimeout(() => setSaveMessage(null), 3000);
  };

  const handleReset = () => {
    const fresh = resolveCreditContractData(
      { ...sale, creditContract: undefined },
      storeSettings,
      controlMeta,
      inventory
    );
    setContract(fresh);
  };

  const handlePrintContractOnly = (formatOverride?: PrinterPaperFormat) => {
    const fmt = formatOverride || printFormat;
    const html = buildCreditContractHtml(
      sale,
      storeSettings,
      fmt,
      contract,
      controlMeta,
      inventory
    );
    printHtmlDocument(html, `Contrato de Crédito - ${sale.saleNumber}`, fmt, storeSettings);
  };

  const handlePrintTicketAndContract = () => {
    const html = buildSaleAndCreditContractCombinedHtml(
      sale,
      storeSettings,
      printFormat,
      undefined,
      contract,
      controlMeta,
      inventory
    );
    printHtmlDocument(html, `Ticket y Contrato - ${sale.saleNumber}`, printFormat, storeSettings);
  };

  const handleDownloadPdf = () => {
    downloadCreditContractPdf(sale, storeSettings, contract, controlMeta, inventory);
  };

  const handleSendWhatsApp = () => {
    const msg = formatCreditContractWhatsAppMessage(
      sale,
      storeSettings,
      contract,
      controlMeta,
      inventory
    );
    const rawPhone = (contract.customerPhone || sale.customerPhone || '').replace(/\D/g, '');
    let cleanPhone = '';
    if (rawPhone.length === 8) cleanPhone = `504${rawPhone}`;
    else if (rawPhone.length >= 10) cleanPhone = rawPhone;

    const encoded = encodeURIComponent(msg);
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const fmtLps = (n: number) =>
    Number(n || 0).toLocaleString('es-HN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const canUseDigitalSignature = isStoreDigitalSignatureEnabled(storeSettings);

  return (
    <div className="space-y-4">
      {/* Digital Signature Modal */}
      {canUseDigitalSignature && activeSignatureTarget && (
        <SignaturePadModal
          title={
            activeSignatureTarget === 'customer'
              ? 'Firma Digital del Cliente (Arrendatario)'
              : 'Firma Digital del Arrendador'
          }
          signerName={
            activeSignatureTarget === 'customer'
              ? contract.customerName || 'CLIENTE'
              : contract.lessorName || 'COMERCIALGYG'
          }
          signerSubtitle={
            activeSignatureTarget === 'customer'
              ? `ID / RTN: ${contract.customerIdentity || 'S/N'}`
              : 'Representante Autorizado'
          }
          initialSignatureDataUrl={
            activeSignatureTarget === 'customer'
              ? contract.customerSignatureDataUrl
              : contract.lessorSignatureDataUrl
          }
          onCancel={() => setActiveSignatureTarget(null)}
          onConfirm={(dataUrl) => handleConfirmDigitalSignature(activeSignatureTarget, dataUrl)}
        />
      )}

      {/* Top Toolbar: Edit Toggle & Quick Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50/90 border border-amber-200 rounded-xl p-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-700 flex items-center justify-center shrink-0">
            <ScrollText className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-slate-900 uppercase tracking-tight">
              Contrato de Arrendamiento con Reserva de Dominio
            </h4>
            <p className="text-[11px] text-slate-600">
              {contract.lessorName || 'COMERCIALGYG'} • Cliente:{' '}
              <span className="font-bold">{contract.customerName}</span>
              {contract.customerSignatureDataUrl && (
                <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-black">
                  ✓ Firmado Digitalmente
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canUseDigitalSignature && (
            <button
              type="button"
              onClick={() => setActiveSignatureTarget('customer')}
              className="px-3 py-1.5 rounded-lg text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <PenTool className="w-3.5 h-3.5" />
              {contract.customerSignatureDataUrl
                ? 'Cambiar Firma Cliente'
                : 'Firmar en Pantalla (Cliente)'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsEditing((v) => !v)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isEditing
                ? 'bg-slate-800 text-white'
                : 'bg-white text-amber-800 border border-amber-300 hover:bg-amber-100/60'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            {isEditing ? 'Ver Vista Previa' : 'Editar Datos del Contrato'}
          </button>

          {isEditing && (
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs disabled:opacity-50 cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {isSaving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          )}
        </div>
      </div>

      {saveMessage && (
        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-700 text-xs font-bold flex items-center gap-2">
          <Check className="w-4 h-4 shrink-0" />
          {saveMessage}
        </div>
      )}

      {/* Editable Form Panel */}
      {isEditing && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
            <span className="text-xs font-black uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
              <Edit3 className="w-3.5 h-3.5 text-amber-600" />
              Personalizar Campos del Contrato de Crédito
            </span>
            <button
              type="button"
              onClick={handleReset}
              className="text-[11px] font-semibold text-slate-500 hover:text-amber-600 flex items-center gap-1 cursor-pointer"
              title="Restaurar valores calculados de la venta"
            >
              <RotateCcw className="w-3 h-3" />
              Restaurar por defecto
            </button>
          </div>

          {/* 1. Datos de Arrendador y Arrendatario */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Arrendador (Empresa)
              </label>
              <div className="relative">
                <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.lessorName}
                  onChange={(e) => handleFieldChange('lessorName', e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="COMERCIALGYG"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Nombre del Cliente (Arrendatario)
              </label>
              <div className="relative">
                <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.customerName}
                  onChange={(e) => handleFieldChange('customerName', e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="Nombre completo"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Tarjeta de Identidad / RTN
              </label>
              <div className="relative">
                <CreditCard className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.customerIdentity}
                  onChange={(e) => handleFieldChange('customerIdentity', e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="0801-XXXX-XXXXX"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Teléfono del Cliente
              </label>
              <div className="relative">
                <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.customerPhone}
                  onChange={(e) => handleFieldChange('customerPhone', e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="9999-9999"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Domicilio del Cliente
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.customerAddress}
                  onChange={(e) => {
                    const val = e.target.value;
                    handleFieldChange('customerAddress', val);
                    if (
                      !contract.installationAddress ||
                      contract.installationAddress === contract.customerAddress
                    ) {
                      handleFieldChange('installationAddress', val);
                    }
                  }}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="Barrio / Colonia, Ciudad"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Dirección de Instalación (Cláusula 4ta)
              </label>
              <div className="relative">
                <MapPin className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.installationAddress}
                  onChange={(e) => handleFieldChange('installationAddress', e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="Dirección donde permanecerá el artículo"
                />
              </div>
            </div>
          </div>

          {/* 2. Datos del Artículo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200">
            <div className="sm:col-span-1">
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Descripción del Artículo
              </label>
              <div className="relative">
                <Package className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.articleDescription}
                  onChange={(e) => handleFieldChange('articleDescription', e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="Ej. Refrigeradora 12 pies"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Marca del Artículo
              </label>
              <input
                type="text"
                value={contract.articleBrand}
                onChange={(e) => handleFieldChange('articleBrand', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                placeholder="Ej. Mabe / Samsung / LG"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Modelo / Serie del Artículo
              </label>
              <input
                type="text"
                value={contract.articleModel}
                onChange={(e) => handleFieldChange('articleModel', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                placeholder="Ej. RMA250FYPG / SKU"
              />
            </div>
          </div>

          {/* 3. Condiciones Financieras (Cláusula 2da y 3ra) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                (A) Valor al Crédito (L.)
              </label>
              <input
                type="number"
                step="0.01"
                value={contract.creditTotalValue}
                onChange={(e) =>
                  handleFieldChange('creditTotalValue', parseFloat(e.target.value) || 0)
                }
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                (B) Valor Prima (L.)
              </label>
              <input
                type="number"
                step="0.01"
                value={contract.downPaymentValue}
                onChange={(e) =>
                  handleFieldChange('downPaymentValue', parseFloat(e.target.value) || 0)
                }
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                (D) N° Cuotas / Meses
              </label>
              <input
                type="number"
                min="1"
                max="120"
                value={contract.numberOfInstallments}
                onChange={(e) =>
                  handleFieldChange('numberOfInstallments', parseInt(e.target.value, 10) || 1)
                }
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-bold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                (C) Valor Cuota (L.)
              </label>
              <input
                type="number"
                step="0.01"
                value={contract.installmentValue}
                onChange={(e) =>
                  handleFieldChange('installmentValue', parseFloat(e.target.value) || 0)
                }
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-amber-400 bg-amber-50/50 text-slate-900 font-black"
              />
            </div>

            <div className="col-span-2 sm:col-span-1">
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                (E) Saldo a Financiar (L.)
              </label>
              <input
                type="number"
                step="0.01"
                value={contract.financedBalance}
                onChange={(e) =>
                  handleFieldChange('financedBalance', parseFloat(e.target.value) || 0)
                }
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-rose-600 font-black"
              />
            </div>
          </div>

          {/* 4. Fechas y Lugar de Firma */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-200">
            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Plazo (Meses)
              </label>
              <input
                type="number"
                min="1"
                value={contract.termMonths}
                onChange={(e) => handleFieldChange('termMonths', parseInt(e.target.value, 10) || 1)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Día de Pago Mensual
              </label>
              <input
                type="text"
                value={contract.paymentDayOfMonth}
                onChange={(e) => handleFieldChange('paymentDayOfMonth', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                placeholder="Ej. 15 o 30"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Fecha Inicio de Pago
              </label>
              <div className="relative">
                <Calendar className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={contract.firstPaymentDate}
                  onChange={(e) => handleFieldChange('firstPaymentDate', e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="AAAA-MM-DD"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Ubicación de Firma
              </label>
              <input
                type="text"
                value={contract.signLocation}
                onChange={(e) => handleFieldChange('signLocation', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                placeholder="Ciudad / Tienda"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Día y Mes Firma
              </label>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={contract.signDay}
                  onChange={(e) => handleFieldChange('signDay', e.target.value)}
                  className="w-12 px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold text-center"
                  placeholder="Día"
                />
                <input
                  type="text"
                  value={contract.signMonth}
                  onChange={(e) => handleFieldChange('signMonth', e.target.value)}
                  className="flex-1 min-w-0 px-2 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                  placeholder="Mes"
                />
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Año Firma
              </label>
              <input
                type="text"
                value={contract.signYear}
                onChange={(e) => handleFieldChange('signYear', e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                placeholder="2025"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-200 cursor-pointer"
            >
              Cerrar Editor
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Check className="w-3.5 h-3.5" />
              {isSaving ? 'Guardando...' : 'Aplicar y Guardar en el Contrato'}
            </button>
          </div>
        </div>
      )}

      {/* Document Preview Box (Matches the exact legal template) */}
      <div
        className={`bg-white text-slate-900 border-2 border-slate-300 rounded-2xl shadow-xs overflow-hidden ${
          compact ? 'p-4 text-[11px]' : 'p-5 sm:p-7 text-xs'
        } leading-relaxed space-y-4`}
      >
        {/* Header */}
        <div className="text-center border-b-2 border-slate-900 pb-3">
          <p className="text-[10px] font-bold tracking-widest uppercase text-slate-500">
            Documento Legal de Crédito • Ref. #{sale.saleNumber}
          </p>
          <h3 className="text-sm sm:text-base font-black uppercase tracking-tight text-slate-900 mt-0.5">
            CONTRATO DE ARRENDAMIENTO CON RESERVA DE DOMINIO
          </h3>
        </div>

        {/* Arrendador & Arrendatario */}
        <div className="space-y-1.5 text-justify">
          <p>
            <span className="font-black">ARRENDADOR:</span>{' '}
            <span className="font-bold uppercase">{contract.lessorName || 'COMERCIALGYG'}</span>
          </p>
          <p>
            <span className="font-black">ARRENDATARIO:</span>{' '}
            <span className="font-bold underline decoration-slate-400">{contract.customerName}</span>
            , mayor de edad, hondureño(a), con domicilio en{' '}
            <span className="font-bold underline decoration-slate-400">
              {contract.customerAddress}
            </span>
            , con número de teléfono{' '}
            <span className="font-bold underline decoration-slate-400">
              {contract.customerPhone}
            </span>{' '}
            y Tarjeta de Identidad / RTN número:{' '}
            <span className="font-bold underline decoration-slate-400">
              {contract.customerIdentity}
            </span>
            .
          </p>
        </div>

        {/* Bien objeto del contrato */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
          <p className="font-semibold text-slate-800">
            Por medio del presente documento se celebra un{' '}
            <span className="font-black">CONTRATO DE ARRENDAMIENTO</span> del siguiente bien:
          </p>
          <ul className="list-disc list-inside space-y-0.5 text-slate-900 font-medium pl-1">
            <li>
              <span className="font-black">Artículo:</span> {contract.articleDescription}{' '}
              <span className="text-slate-600">
                (Marca: <span className="font-bold text-slate-900">{contract.articleBrand}</span>,
                Modelo: <span className="font-bold text-slate-900">{contract.articleModel}</span>)
              </span>
            </li>
            <li>
              <span className="font-black">Valor al Crédito:</span>{' '}
              <span className="font-black text-emerald-800">
                LPS. {fmtLps(contract.creditTotalValue)}
              </span>
            </li>
          </ul>
        </div>

        {/* Cláusulas Principales */}
        <div className="space-y-2.5 text-justify">
          <h4 className="font-black text-xs uppercase tracking-wider border-b border-slate-300 pb-1 text-slate-900">
            CLÁUSULAS PRINCIPALES
          </h4>

          <div>
            <p>
              <span className="font-black">SEGUNDA:</span> El ARRENDADOR da en arrendamiento con
              reserva de dominio al ARRENDATARIO el o los objetos detallados anteriormente, bajo las
              siguientes condiciones:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-2 bg-amber-50/70 border border-amber-200 rounded-xl p-3 font-medium">
              <div>
                • <span className="font-black">(A) Valor al crédito:</span> LPS.{' '}
                {fmtLps(contract.creditTotalValue)}
              </div>
              <div>
                • <span className="font-black">(B) Valor de la prima:</span> LPS.{' '}
                {fmtLps(contract.downPaymentValue)}
              </div>
              <div>
                • <span className="font-black">(C) Valor de la cuota:</span> LPS.{' '}
                {fmtLps(contract.installmentValue)}
              </div>
              <div>
                • <span className="font-black">(D) Número de cuotas:</span>{' '}
                {contract.numberOfInstallments}, las cuales se pagarán mensualmente.
              </div>
              <div className="sm:col-span-2 pt-1 border-t border-amber-200/80 text-rose-800 font-black">
                • (E) Saldo a financiar: LPS. {fmtLps(contract.financedBalance)}
              </div>
            </div>
          </div>

          <p>
            <span className="font-black">TERCERA:</span> El plazo del contrato es de{' '}
            <span className="font-bold underline">{contract.termMonths}</span> meses a partir de la
            fecha. Las cuotas que incluyen capital e interés calculados sobre el saldo adecuado serán
            pagadas en la tienda arriba mencionada el día{' '}
            <span className="font-bold underline">{contract.paymentDayOfMonth}</span> de cada mes,
            comenzando el <span className="font-bold underline">{contract.firstPaymentDate}</span>.
            El monto financiado en caso de pagar puntualmente será de{' '}
            <span className="font-black">LPS. {fmtLps(contract.financedBalance)}</span>.
          </p>

          <p>
            <span className="font-black">CUARTA:</span> El ARRENDATARIO declara que el o los
            artículos objeto de contrato permanecerán en la siguiente dirección:{' '}
            <span className="font-bold underline">{contract.installationAddress}</span>.
          </p>

          <p>
            <span className="font-black">QUINTA:</span> Forman parte de este contrato las condiciones
            generales impresas al dorso del presente documento y el certificado de garantía contenido
            en este mismo, el cual le sirve al ARRENDATARIO para asegurar el buen funcionamiento del
            producto. El ARRENDADOR se compromete a su reparación durante el tiempo que dure la
            garantía, exceptuando daños ocasionados por uso indebido. La garantía empieza a contar a
            partir de la fecha de entrega del artículo.
          </p>

          <p>
            <span className="font-black">SEXTA:</span> Expresamente se conviene que este contrato de
            arrendamiento con reserva de dominio no puede calificarse ni interpretarse de otra
            manera; por lo que los contratantes renuncian a toda acción o excepción que no se derive
            de este documento.
          </p>

          <p className="pt-1 font-semibold">
            Firmado en{' '}
            <span className="font-black underline uppercase">{contract.signLocation}</span> el día{' '}
            <span className="font-black underline">{contract.signDay}</span>,{' '}
            <span className="font-black underline">{contract.signMonth}</span> de{' '}
            <span className="font-black underline">{contract.signYear}</span>.
          </p>
        </div>

        {/* Firmas (Con Soporte de Firma Digital en Pantalla según permisos SaaS) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 pt-4 pb-3 text-center">
          {/* Firma Arrendatario (Cliente) */}
          <div className="flex flex-col items-center justify-end bg-slate-50/70 border border-slate-200 rounded-2xl p-3">
            <div className="h-20 w-full flex items-center justify-center mb-1">
              {contract.customerSignatureDataUrl ? (
                <img
                  src={contract.customerSignatureDataUrl}
                  alt="Firma del Cliente"
                  onClick={() => canUseDigitalSignature && setActiveSignatureTarget('customer')}
                  className={`max-h-16 max-w-[210px] object-contain ${
                    canUseDigitalSignature ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
                  }`}
                  title={canUseDigitalSignature ? 'Toque para volver a firmar' : 'Firma del Cliente'}
                />
              ) : canUseDigitalSignature ? (
                <button
                  type="button"
                  onClick={() => setActiveSignatureTarget('customer')}
                  className="w-full max-w-[220px] h-16 rounded-xl border-2 border-dashed border-amber-400 bg-amber-50/50 hover:bg-amber-100/60 text-amber-800 flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer"
                >
                  <span className="text-[11px] font-black flex items-center gap-1">
                    <PenTool className="w-3.5 h-3.5" />
                    TOQUE AQUÍ PARA FIRMAR
                  </span>
                  <span className="text-[9.5px] font-semibold text-amber-700">
                    Firma Digital del Cliente en Pantalla
                  </span>
                </button>
              ) : (
                <div className="h-12" />
              )}
            </div>

            <div className="border-t border-slate-900 pt-1.5 w-full max-w-[230px]">
              <p className="font-black text-[10px] sm:text-xs uppercase">
                FIRMA ARRENDATARIO (CLIENTE)
              </p>
              <p className="text-[10px] text-slate-700 font-semibold truncate">
                {contract.customerName}
              </p>
              <p className="text-[9.5px] text-slate-500">ID / RTN: {contract.customerIdentity}</p>
              {contract.customerSignedAt && (
                <p className="text-[9px] text-emerald-700 font-bold mt-0.5">
                  ✓ Firmado: {contract.customerSignedAt}
                </p>
              )}
            </div>

            {canUseDigitalSignature && (
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setActiveSignatureTarget('customer')}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1 cursor-pointer"
                >
                  <PenTool className="w-3 h-3" />
                  {contract.customerSignatureDataUrl ? 'Repetir Firma' : 'Firmar en Pantalla'}
                </button>
                {contract.customerSignatureDataUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDigitalSignature('customer')}
                    className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                    title="Quitar firma digital"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Firma Arrendador */}
          <div className="flex flex-col items-center justify-end bg-slate-50/70 border border-slate-200 rounded-2xl p-3">
            <div className="h-20 w-full flex items-center justify-center mb-1">
              {contract.lessorSignatureDataUrl ? (
                <img
                  src={contract.lessorSignatureDataUrl}
                  alt="Firma del Arrendador"
                  onClick={() => canUseDigitalSignature && setActiveSignatureTarget('lessor')}
                  className={`max-h-16 max-w-[210px] object-contain ${
                    canUseDigitalSignature ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
                  }`}
                  title={
                    canUseDigitalSignature ? 'Toque para volver a firmar' : 'Firma del Arrendador'
                  }
                />
              ) : canUseDigitalSignature ? (
                <button
                  type="button"
                  onClick={() => setActiveSignatureTarget('lessor')}
                  className="w-full max-w-[220px] h-16 rounded-xl border-2 border-dashed border-slate-300 bg-white hover:bg-slate-100 text-slate-600 flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer"
                >
                  <span className="text-[11px] font-bold flex items-center gap-1">
                    <PenTool className="w-3.5 h-3.5" />
                    Firmar Arrendador (Opcional)
                  </span>
                  <span className="text-[9.5px] text-slate-400">Firma en pantalla</span>
                </button>
              ) : (
                <div className="h-12" />
              )}
            </div>

            <div className="border-t border-slate-900 pt-1.5 w-full max-w-[230px]">
              <p className="font-black text-[10px] sm:text-xs uppercase">FIRMA ARRENDADOR</p>
              <p className="text-[10px] text-slate-700 font-semibold truncate">
                {contract.lessorName || 'COMERCIALGYG'}
              </p>
              {contract.lessorSignedAt && (
                <p className="text-[9px] text-emerald-700 font-bold mt-0.5">
                  ✓ Firmado: {contract.lessorSignedAt}
                </p>
              )}
            </div>

            {canUseDigitalSignature && (
              <div className="flex items-center gap-1.5 mt-2">
                <button
                  type="button"
                  onClick={() => setActiveSignatureTarget('lessor')}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1 cursor-pointer"
                >
                  <PenTool className="w-3 h-3" />
                  {contract.lessorSignatureDataUrl ? 'Repetir Firma' : 'Firmar Arrendador'}
                </button>
                {contract.lessorSignatureDataUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDigitalSignature('lessor')}
                    className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 border border-rose-200 cursor-pointer"
                    title="Quitar firma digital"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Condiciones Generales */}
        <div className="border-t-2 border-dashed border-slate-300 pt-4 space-y-2">
          <h4 className="font-black text-xs uppercase tracking-wider text-slate-900">
            CONDICIONES GENERALES
          </h4>
          <ol className="list-decimal list-inside space-y-1 text-[10.5px] text-slate-700 text-justify leading-snug">
            {CREDIT_CONTRACT_GENERAL_CONDITIONS.map((clause, idx) => (
              <li key={idx} className="pl-0.5">
                {clause}
              </li>
            ))}
          </ol>
        </div>

        {/* Condiciones Especiales de Garantía */}
        <div className="border-t-2 border-dashed border-slate-300 pt-4 space-y-2">
          <h4 className="font-black text-xs uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-amber-600" />
            CONDICIONES ESPECIALES DE GARANTÍA
          </h4>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-[10.5px]">
            <div>
              <span className="font-black">• Lavadora:</span> 2 meses de garantía
            </div>
            <div>
              <span className="font-black">• Estufa:</span> 3 meses de garantía
            </div>
            <div>
              <span className="font-black">• Oasis:</span> 2 meses de garantía
            </div>
            <div>
              <span className="font-black">• Refrigeradora:</span> 2 meses de garantía
            </div>
          </div>

          <div className="text-[10.5px] text-slate-700 space-y-1 text-justify leading-snug">
            <p>
              <span className="font-black text-slate-900">Exclusiones de Garantía:</span> Quedan
              excluidas de garantía todas las fallas ocasionadas por mal uso y/o tratamiento no
              apropiado, fallas de energía, alto o bajo voltaje, instalaciones eléctricas
              defectuosas, enchufar en voltaje diferente, daños ocasionados por el medio ambiente o
              plagas/animales.
            </p>
            <ul className="list-disc list-inside space-y-0.5 pl-1">
              <li>
                <span className="font-bold text-slate-900">Estufas:</span> Resistencias, empaques,
                platos de estufa, parrillas, cables de energía, perillas.
              </li>
              <li>
                <span className="font-bold text-slate-900">Refrigeradoras y Freezers:</span>{' '}
                Bisagras, empaques, gavetas, llamadores/tiradores, rodos, parrillas, cables de
                energía.
              </li>
              <li>
                <span className="font-bold text-slate-900">Lavadoras y Secadoras:</span> Perillas,
                cables de energía, switch de tapadera de seguridad.
              </li>
            </ul>
            <p className="pt-1">
              La garantía no cubre defectos ocasionados por revisión o manipulación de personas no
              autorizadas por{' '}
              <span className="font-black text-slate-900">
                {contract.lessorName || 'COMERCIALGYG'}
              </span>
              . Para hacer efectiva la garantía, deberá presentar únicamente este documento en la
              tienda donde realizó la compra o en las oficinas principales en{' '}
              <span className="font-black text-slate-900 uppercase">{contract.signLocation}</span>.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons Footer */}
      {showActionButtons && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600">
              Formato de Impresión del Contrato:
            </span>
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'letter', label: 'Hoja Carta (Ejecutivo)' },
                  { id: '80mm', label: 'Térmica 80mm' },
                  { id: '58mm', label: 'Térmica 58mm' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPrintFormat(opt.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                    printFormat === opt.id
                      ? 'bg-amber-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={handlePrintTicketAndContract}
              className="py-2.5 px-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-black rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>Imprimir Ticket + Contrato</span>
            </button>

            <button
              type="button"
              onClick={() => handlePrintContractOnly()}
              className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>Imprimir Solo Contrato</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadPdf}
              className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Descargar Contrato PDF</span>
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-xs cursor-pointer"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>Enviar por WhatsApp</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

interface CreditContractModalProps {
  sale: SaleRecord;
  storeSettings: StoreSettings;
  controlMeta?: CreditAccountControlMeta;
  inventory?: Product[];
  onClose: () => void;
  onSaveContract?: (updatedContract: CreditContractData) => void | Promise<void>;
}

export const CreditContractModal: React.FC<CreditContractModalProps> = ({
  sale,
  storeSettings,
  controlMeta,
  inventory = [],
  onClose,
  onSaveContract,
}) => {
  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-2 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-600">
              <ScrollText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-slate-900">
                Contrato de Crédito con Reserva de Dominio
              </h3>
              <p className="text-xs text-slate-500">
                Factura #{sale.saleNumber} • Cliente:{' '}
                <span className="font-bold text-slate-800">
                  {sale.customerName || 'Consumidor Final'}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <CreditContractViewAndEditor
            sale={sale}
            storeSettings={storeSettings}
            controlMeta={controlMeta}
            inventory={inventory}
            onSaveContract={onSaveContract}
            showActionButtons={true}
          />
        </div>
      </div>
    </div>
  );
};
