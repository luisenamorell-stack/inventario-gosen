import React, { useState, useEffect } from 'react';
import { StoreBankAccount } from '../types';
import { uploadStoreLogo } from '../firebase/storageService';
import {
  Landmark,
  Plus,
  Trash2,
  Copy,
  Check,
  Edit3,
  Save,
  X,
  Upload,
  Sparkles,
  CheckCircle2,
  CreditCard,
  User,
  Hash,
  FileText,
} from 'lucide-react';

export interface BankPresetInfo {
  id: string;
  name: string;
  shortLabel: string;
  primaryColor: string;
  secondaryColor: string;
  badgeBg: string;
  badgeText: string;
  borderAccent: string;
  defaultAccountType?: string;
}

export const BANK_PRESETS: BankPresetInfo[] = [
  {
    id: 'bac',
    name: 'BAC Credomatic',
    shortLabel: 'BAC',
    primaryColor: '#E31837',
    secondaryColor: '#9E0B22',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-800',
    borderAccent: 'border-rose-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'atlantida',
    name: 'Banco Atlántida',
    shortLabel: 'Atlántida',
    primaryColor: '#C8102E',
    secondaryColor: '#8A0B20',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-800',
    borderAccent: 'border-red-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'ficohsa',
    name: 'Banco Ficohsa',
    shortLabel: 'Ficohsa',
    primaryColor: '#0033A0',
    secondaryColor: '#00A3E0',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-800',
    borderAccent: 'border-blue-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'occidente',
    name: 'Banco de Occidente',
    shortLabel: 'Occidente',
    primaryColor: '#006837',
    secondaryColor: '#F58220',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    borderAccent: 'border-emerald-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'banpais',
    name: 'Banpaís',
    shortLabel: 'Banpaís',
    primaryColor: '#002D72',
    secondaryColor: '#E4002B',
    badgeBg: 'bg-indigo-50',
    badgeText: 'text-indigo-900',
    borderAccent: 'border-indigo-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'davivienda',
    name: 'Davivienda',
    shortLabel: 'Davivienda',
    primaryColor: '#ED1C24',
    secondaryColor: '#B31217',
    badgeBg: 'bg-red-50',
    badgeText: 'text-red-800',
    borderAccent: 'border-red-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'lafise',
    name: 'Banco LAFISE',
    shortLabel: 'LAFISE',
    primaryColor: '#007A33',
    secondaryColor: '#C59B27',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    borderAccent: 'border-emerald-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'promerica',
    name: 'Banco Promerica',
    shortLabel: 'Promerica',
    primaryColor: '#006937',
    secondaryColor: '#78BE20',
    badgeBg: 'bg-green-50',
    badgeText: 'text-green-800',
    borderAccent: 'border-green-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'azteca',
    name: 'Banco Azteca',
    shortLabel: 'Azteca',
    primaryColor: '#006341',
    secondaryColor: '#CE1126',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-800',
    borderAccent: 'border-emerald-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'banrural',
    name: 'Banrural',
    shortLabel: 'Banrural',
    primaryColor: '#006838',
    secondaryColor: '#F7941D',
    badgeBg: 'bg-green-50',
    badgeText: 'text-green-800',
    borderAccent: 'border-green-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'tigo_money',
    name: 'Tigo Money',
    shortLabel: 'Tigo Money',
    primaryColor: '#00377B',
    secondaryColor: '#00A9E0',
    badgeBg: 'bg-sky-50',
    badgeText: 'text-sky-900',
    borderAccent: 'border-sky-200',
    defaultAccountType: 'Billetera Móvil',
  },
  {
    id: 'tengo',
    name: 'TENGO / Kash',
    shortLabel: 'TENGO',
    primaryColor: '#4C1D95',
    secondaryColor: '#7C3AED',
    badgeBg: 'bg-violet-50',
    badgeText: 'text-violet-900',
    borderAccent: 'border-violet-200',
    defaultAccountType: 'Billetera Móvil',
  },
  {
    id: 'cooperativa',
    name: 'Cooperativa (Sagrada Familia / ELGA)',
    shortLabel: 'Cooperativa',
    primaryColor: '#005596',
    secondaryColor: '#10B981',
    badgeBg: 'bg-cyan-50',
    badgeText: 'text-cyan-900',
    borderAccent: 'border-cyan-200',
    defaultAccountType: 'Ahorro',
  },
  {
    id: 'custom',
    name: 'Otro Banco',
    shortLabel: 'Otro Banco',
    primaryColor: '#0F172A',
    secondaryColor: '#334155',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-800',
    borderAccent: 'border-slate-200',
    defaultAccountType: 'Ahorro',
  },
];

export function detectBankPreset(bankId?: string, bankName?: string): BankPresetInfo {
  if (bankId) {
    const byId = BANK_PRESETS.find((b) => b.id === bankId);
    if (byId) return byId;
  }
  const lower = (bankName || '').toLowerCase();
  if (lower.includes('bac') || lower.includes('credomatic')) return BANK_PRESETS[0];
  if (lower.includes('atlantida') || lower.includes('atlántida')) return BANK_PRESETS[1];
  if (lower.includes('ficohsa')) return BANK_PRESETS[2];
  if (lower.includes('occidente')) return BANK_PRESETS[3];
  if (lower.includes('banpais') || lower.includes('banpaís') || lower.includes('pais')) return BANK_PRESETS[4];
  if (lower.includes('davivienda')) return BANK_PRESETS[5];
  if (lower.includes('lafise')) return BANK_PRESETS[6];
  if (lower.includes('promerica')) return BANK_PRESETS[7];
  if (lower.includes('azteca')) return BANK_PRESETS[8];
  if (lower.includes('banrural')) return BANK_PRESETS[9];
  if (lower.includes('tigo')) return BANK_PRESETS[10];
  if (lower.includes('tengo') || lower.includes('kash')) return BANK_PRESETS[11];
  if (lower.includes('cooperativa') || lower.includes('sagrada') || lower.includes('elga')) return BANK_PRESETS[12];
  return BANK_PRESETS[BANK_PRESETS.length - 1];
}

export function mergeBankAccountsWithPendingDraft(
  accounts: StoreBankAccount[],
  draft: StoreBankAccount | null
): StoreBankAccount[] {
  const base = Array.isArray(accounts) ? [...accounts] : [];
  if (!draft || !draft.accountNumber || !draft.accountNumber.trim()) {
    return base;
  }
  const cleanDraft: StoreBankAccount = {
    ...draft,
    bankName: (draft.bankName || 'Banco').trim(),
    accountNumber: draft.accountNumber.trim(),
    holderName: (draft.holderName || 'Titular').trim(),
    accountType: draft.accountType || 'Ahorro',
    currency: draft.currency || 'HNL',
    isActive: true,
  };
  const existingIdx = base.findIndex(
    (b) =>
      b.id === cleanDraft.id ||
      (b.accountNumber.trim() === cleanDraft.accountNumber &&
        b.bankName.toLowerCase() === cleanDraft.bankName.toLowerCase())
  );
  if (existingIdx >= 0) {
    base[existingIdx] = cleanDraft;
    return base;
  }
  return [...base, cleanDraft];
}

interface BankBrandLogoProps {
  bankId?: string;
  bankName: string;
  customLogoUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const BankBrandLogo: React.FC<BankBrandLogoProps> = ({
  bankId,
  bankName,
  customLogoUrl,
  size = 'md',
}) => {
  const [imgFailed, setImgFailed] = useState(false);
  const preset = detectBankPreset(bankId, bankName);

  const dims =
    size === 'sm'
      ? 'w-9 h-9 rounded-xl text-[10px]'
      : size === 'lg'
      ? 'w-14 h-14 rounded-2xl text-xs'
      : 'w-12 h-12 rounded-xl text-[11px]';

  if (customLogoUrl && !imgFailed) {
    return (
      <div
        className={`${dims} bg-white border border-slate-200 p-1 flex items-center justify-center shrink-0 overflow-hidden shadow-2xs`}
      >
        <img
          src={customLogoUrl}
          alt={bankName}
          referrerPolicy="no-referrer"
          className="w-full h-full object-contain"
          onError={() => setImgFailed(true)}
        />
      </div>
    );
  }

  switch (preset.id) {
    case 'bac':
      return (
        <div
          className={`${dims} flex flex-col items-center justify-center shrink-0 shadow-xs text-white font-black tracking-tighter select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #E31837 0%, #B30E26 100%)',
          }}
          title="BAC Credomatic"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <rect width="48" height="48" rx="10" fill="none" />
            <path
              d="M14 13h10l6 6-6 6H14l4-6-4-6zm12 6l6-6h4l-4 6 4 6h-4l-6-6z"
              fill="#ffffff"
              opacity="0.95"
            />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12"
              fontWeight="900"
              fontFamily="sans-serif"
              letterSpacing="0.5"
            >
              BAC
            </text>
          </svg>
        </div>
      );

    case 'atlantida':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #C8102E 0%, #8E081D 100%)',
          }}
          title="Banco Atlántida"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <path
              d="M12 14h24v3H12v-3zm3 5h4v12h-4V19zm7 0h4v12h-4V19zm7 0h4v12h-4V19zm-17 14h24v3H12v-3z"
              fill="#ffffff"
            />
            <text
              x="24"
              y="11"
              textAnchor="middle"
              fill="#FFD1D9"
              fontSize="6.5"
              fontWeight="800"
              fontFamily="sans-serif"
            >
              ATLÁNTIDA
            </text>
          </svg>
        </div>
      );

    case 'ficohsa':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #0033A0 0%, #001E62 100%)',
          }}
          title="Banco Ficohsa"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <circle cx="24" cy="18" r="8" fill="#00A3E0" />
            <path d="M18 18a6 6 0 0112 0" stroke="#F59E0B" strokeWidth="2.5" fill="none" />
            <text
              x="24"
              y="38"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="8.5"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              FICOHSA
            </text>
          </svg>
        </div>
      );

    case 'occidente':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #006837 0%, #004B27 100%)',
          }}
          title="Banco de Occidente"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <circle cx="24" cy="18" r="8" fill="#F58220" />
            <circle cx="24" cy="18" r="4" fill="#006837" />
            <text
              x="24"
              y="38"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="7.5"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              OCCIDENTE
            </text>
          </svg>
        </div>
      );

    case 'banpais':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #002D72 0%, #001A44 100%)',
          }}
          title="Banpaís"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <path d="M14 23l10-11 10 11H14z" fill="#E4002B" />
            <rect x="18" y="23" width="12" height="4" fill="#F59E0B" />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="8.5"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              BANPAÍS
            </text>
          </svg>
        </div>
      );

    case 'davivienda':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #ED1C24 0%, #B31217 100%)',
          }}
          title="Davivienda"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <path
              d="M12 22L24 11l12 11h-4v8H16v-8h-4z"
              fill="#ffffff"
            />
            <rect x="21" y="22" width="6" height="8" fill="#ED1C24" />
            <text
              x="24"
              y="40"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="6.8"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              DAVIVIENDA
            </text>
          </svg>
        </div>
      );

    case 'lafise':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #007A33 0%, #005222 100%)',
          }}
          title="Banco LAFISE"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <polygon points="24,10 34,24 24,28 14,24" fill="#FBBF24" />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9.5"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              LAFISE
            </text>
          </svg>
        </div>
      );

    case 'promerica':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #006937 0%, #004624 100%)',
          }}
          title="Banco Promerica"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <circle cx="24" cy="18" r="8" fill="#84CC16" />
            <path d="M20 18l3 3 6-6" stroke="#ffffff" strokeWidth="2.5" fill="none" />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="7"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              PROMERICA
            </text>
          </svg>
        </div>
      );

    case 'azteca':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #006341 0%, #00422B 100%)',
          }}
          title="Banco Azteca"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <path d="M14 24l10-12 10 12-10 4-10-4z" fill="#EF4444" />
            <circle cx="24" cy="19" r="3.5" fill="#ffffff" />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="8.5"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              AZTECA
            </text>
          </svg>
        </div>
      );

    case 'banrural':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #006838 0%, #004726 100%)',
          }}
          title="Banrural"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <rect x="15" y="12" width="18" height="14" rx="4" fill="#F7941D" />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="7.5"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              BANRURAL
            </text>
          </svg>
        </div>
      );

    case 'tigo_money':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #00377B 0%, #00224D 100%)',
          }}
          title="Tigo Money"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <text
              x="24"
              y="23"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="12"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              tigo
            </text>
            <text
              x="24"
              y="36"
              textAnchor="middle"
              fill="#38BDF8"
              fontSize="8"
              fontWeight="800"
              fontFamily="sans-serif"
            >
              MONEY
            </text>
          </svg>
        </div>
      );

    case 'tengo':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #5B21B6 0%, #3B0764 100%)',
          }}
          title="TENGO"
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <circle cx="24" cy="18" r="7" fill="#A78BFA" />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="9"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              TENGO
            </text>
          </svg>
        </div>
      );

    case 'cooperativa':
      return (
        <div
          className={`${dims} flex items-center justify-center shrink-0 shadow-xs text-white font-black select-none relative overflow-hidden`}
          style={{
            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
          }}
          title={bankName}
        >
          <svg viewBox="0 0 48 48" className="w-full h-full p-1">
            <path d="M16 24l8-12 8 12H16z" fill="#34D399" />
            <text
              x="24"
              y="39"
              textAnchor="middle"
              fill="#ffffff"
              fontSize="8"
              fontWeight="900"
              fontFamily="sans-serif"
            >
              COOP
            </text>
          </svg>
        </div>
      );

    default: {
      const initials =
        (bankName || 'BC')
          .split(/\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('') || 'BC';
      return (
        <div
          className={`${dims} flex flex-col items-center justify-center shrink-0 shadow-xs text-white font-black select-none bg-slate-800`}
          title={bankName}
        >
          <Landmark className="w-4 h-4 text-emerald-400 mb-0.5" />
          <span className="text-[9px] leading-none">{initials}</span>
        </div>
      );
    }
  }
};

interface CatalogBankAccountCardProps {
  account: StoreBankAccount;
  isSelected?: boolean;
  onSelect?: () => void;
  onCopyFeedback?: (msg: string) => void;
  compact?: boolean;
}

export const CatalogBankAccountCard: React.FC<CatalogBankAccountCardProps> = ({
  account,
  isSelected = false,
  onSelect,
  onCopyFeedback,
  compact = false,
}) => {
  const [copiedField, setCopiedField] = useState<'number' | 'digits' | 'holder' | 'rtn' | 'all' | null>(null);

  const triggerCopy = async (
    text: string,
    field: 'number' | 'digits' | 'holder' | 'rtn' | 'all',
    label: string
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      if (onSelect) onSelect();
      if (onCopyFeedback) {
        onCopyFeedback(`¡${label} de ${account.bankName} copiado sin errores!`);
      }
      setTimeout(() => setCopiedField(null), 2400);
    } catch {
      if (onCopyFeedback) {
        onCopyFeedback('No se pudo copiar automáticamente.');
      }
    }
  };

  const cleanDigitsOnly = account.accountNumber.replace(/[\s-]/g, '');
  const hasDashesOrSpaces = cleanDigitsOnly !== account.accountNumber.trim();
  const currencyLabel =
    account.currency === 'USD' ? 'Dólares ($)' : 'Lempiras (L.)';

  return (
    <div
      onClick={() => onSelect?.()}
      className={`rounded-2xl border transition-all p-3.5 sm:p-4 bg-white ${
        onSelect ? 'cursor-pointer' : ''
      } ${
        isSelected
          ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm bg-emerald-50/20'
          : 'border-slate-200 hover:border-slate-300 shadow-2xs'
      }`}
    >
      {/* Top Row: Bank Logo + Bank Name + Account Type */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <BankBrandLogo
            bankId={account.bankId}
            bankName={account.bankName}
            customLogoUrl={account.customLogoUrl}
            size={compact ? 'sm' : 'md'}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-black text-slate-900 text-sm sm:text-base leading-tight">
                {account.bankName}
              </h4>
              {isSelected && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  <span>Seleccionado</span>
                </span>
              )}
            </div>
            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">
              Cuenta de {account.accountType || 'Ahorro'} · {currencyLabel}
            </p>
          </div>
        </div>

        {/* Copy All Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            const summary = `${account.bankName} - Cuenta ${account.accountType || 'Ahorro'}: ${account.accountNumber} | Titular: ${account.holderName}${
              account.holderIdOrRtn ? ` | ID/RTN: ${account.holderIdOrRtn}` : ''
            }`;
            triggerCopy(summary, 'all', 'Datos completos de la cuenta');
          }}
          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          title="Copiar todos los datos de esta cuenta"
        >
          {copiedField === 'all' ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700">¡Todo Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3 text-slate-500" />
              <span>Copiar todo</span>
            </>
          )}
        </button>
      </div>

      {/* Account Number Highlight Box with One-Click Copy */}
      <div className="mt-3 p-2.5 sm:p-3 rounded-xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
            Número de Cuenta
          </span>
          <span className="font-mono tabular-nums font-black text-slate-900 text-base sm:text-lg tracking-wide select-all break-all">
            {account.accountNumber}
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerCopy(cleanDigitsOnly, 'number', 'Número de cuenta');
            }}
            className={`px-3.5 py-2 rounded-xl font-extrabold text-xs inline-flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-2xs ${
              copiedField === 'number'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            {copiedField === 'number' ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>¡Cuenta Copiada!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Cuenta</span>
              </>
            )}
          </button>

          {hasDashesOrSpaces && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerCopy(account.accountNumber.trim(), 'digits', 'Número con guiones');
              }}
              className="px-2.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
              title="Copiar con formato original"
            >
              {copiedField === 'digits' ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <span>Con guiones</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Account Holder Name + Optional ID/RTN */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
          <div className="min-w-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
              Nombre de la Cuenta / Titular
            </span>
            <span className="font-extrabold text-slate-800 text-xs sm:text-sm block truncate">
              {account.holderName}
            </span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              triggerCopy(account.holderName, 'holder', 'Nombre del titular');
            }}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
              copiedField === 'holder'
                ? 'bg-emerald-100 text-emerald-800'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
            }`}
            title="Copiar nombre del titular"
          >
            {copiedField === 'holder' ? (
              <>
                <Check className="w-3 h-3 text-emerald-600" />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-500" />
                <span>Copiar Nombre</span>
              </>
            )}
          </button>
        </div>

        {account.holderIdOrRtn && (
          <div className="flex items-center justify-between sm:justify-end gap-2 pt-1.5 sm:pt-0 border-t sm:border-t-0 border-slate-100">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                Identidad / RTN
              </span>
              <span className="font-mono tabular-nums font-bold text-slate-700 text-xs">
                {account.holderIdOrRtn}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                triggerCopy(account.holderIdOrRtn || '', 'rtn', 'Identidad / RTN');
              }}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                copiedField === 'rtn'
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
              title="Copiar Identidad o RTN"
            >
              {copiedField === 'rtn' ? (
                <>
                  <Check className="w-3 h-3 text-emerald-600" />
                  <span>Copiado</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3 text-slate-500" />
                  <span>Copiar ID</span>
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

interface StoreBankAccountsEditorProps {
  storeName: string;
  defaultRtn?: string;
  bankAccounts: StoreBankAccount[];
  onChangeBankAccounts: (next: StoreBankAccount[]) => void;
  onDraftAccountChange?: (draft: StoreBankAccount | null) => void;
  onQuickSave?: (next: StoreBankAccount[]) => Promise<void>;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const StoreBankAccountsEditor: React.FC<StoreBankAccountsEditorProps> = ({
  storeName,
  defaultRtn = '',
  bankAccounts,
  onChangeBankAccounts,
  onDraftAccountChange,
  onQuickSave,
  showToast,
}) => {
  const [selectedPresetId, setSelectedPresetId] = useState<string>('bac');
  const [bankName, setBankName] = useState<string>('BAC Credomatic');
  const [accountNumber, setAccountNumber] = useState<string>('');
  const [accountType, setAccountType] = useState<string>('Ahorro');
  const [currency, setCurrency] = useState<string>('HNL');
  const [holderName, setHolderName] = useState<string>('');
  const [holderIdOrRtn, setHolderIdOrRtn] = useState<string>('');
  const [customLogoUrl, setCustomLogoUrl] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string>(() => `bank_${Date.now()}`);
  const [isUploadingLogo, setIsUploadingLogo] = useState<boolean>(false);
  const [isSavingQuick, setIsSavingQuick] = useState<boolean>(false);

  // Sync any typed draft to parent so clicking the main "Guardar" button on the page automatically includes it
  useEffect(() => {
    if (!onDraftAccountChange) return;
    const cleanNum = accountNumber.trim();
    if (!cleanNum) {
      onDraftAccountChange(null);
      return;
    }
    const cleanBank = bankName.trim() || 'BAC Credomatic';
    const cleanHolder = holderName.trim() || storeName.trim() || 'Titular de la Cuenta';
    onDraftAccountChange({
      id: editingId || draftId,
      bankId: selectedPresetId,
      bankName: cleanBank,
      accountNumber: cleanNum,
      accountType: accountType || 'Ahorro',
      currency: currency || 'HNL',
      holderName: cleanHolder,
      holderIdOrRtn: holderIdOrRtn.trim(),
      customLogoUrl: customLogoUrl.trim(),
      isActive: true,
    });
  }, [
    selectedPresetId,
    bankName,
    accountNumber,
    accountType,
    currency,
    holderName,
    holderIdOrRtn,
    customLogoUrl,
    editingId,
    draftId,
    storeName,
    onDraftAccountChange,
  ]);

  const handleSelectPreset = (preset: BankPresetInfo) => {
    setSelectedPresetId(preset.id);
    if (preset.id !== 'custom') {
      setBankName(preset.name);
    } else if (BANK_PRESETS.some((p) => p.name === bankName)) {
      setBankName('');
    }
    if (preset.defaultAccountType) {
      setAccountType(preset.defaultAccountType);
    }
  };

  const resetForm = () => {
    setSelectedPresetId('bac');
    setBankName('BAC Credomatic');
    setAccountNumber('');
    setAccountType('Ahorro');
    setCurrency('HNL');
    setHolderName('');
    setHolderIdOrRtn('');
    setCustomLogoUrl('');
    setEditingId(null);
    setDraftId(`bank_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`);
    onDraftAccountChange?.(null);
  };

  const handleStartEdit = (acc: StoreBankAccount) => {
    const preset = detectBankPreset(acc.bankId, acc.bankName);
    setEditingId(acc.id);
    setSelectedPresetId(preset.id);
    setBankName(acc.bankName);
    setAccountNumber(acc.accountNumber);
    setAccountType(acc.accountType || 'Ahorro');
    setCurrency(acc.currency || 'HNL');
    setHolderName(acc.holderName);
    setHolderIdOrRtn(acc.holderIdOrRtn || '');
    setCustomLogoUrl(acc.customLogoUrl || '');
  };

  const handleUploadCustomBankLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast?.('Selecciona una imagen válida para el logo del banco', 'warning');
      return;
    }
    setIsUploadingLogo(true);
    try {
      const url = await uploadStoreLogo(file);
      setCustomLogoUrl(url);
      showToast?.('Logo del banco subido con éxito', 'success');
    } catch {
      showToast?.('Error al subir imagen. Puedes pegar el enlace directo del logo.', 'error');
    } finally {
      setIsUploadingLogo(false);
      e.target.value = '';
    }
  };

  const handleAddOrUpdateAccount = async () => {
    const cleanBank = bankName.trim() || 'BAC Credomatic';
    const cleanNumber = accountNumber.trim();
    const cleanHolder = holderName.trim() || storeName.trim() || 'Titular de la Cuenta';

    if (!cleanNumber) {
      showToast?.('Por favor ingresa el número de cuenta bancaria', 'warning');
      return;
    }

    const newEntry: StoreBankAccount = {
      id: editingId || draftId || `bank_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      bankId: selectedPresetId,
      bankName: cleanBank,
      accountNumber: cleanNumber,
      accountType: accountType || 'Ahorro',
      currency: currency || 'HNL',
      holderName: cleanHolder,
      holderIdOrRtn: holderIdOrRtn.trim(),
      customLogoUrl: customLogoUrl.trim(),
      isActive: true,
    };

    const nextList = editingId
      ? bankAccounts.map((b) => (b.id === editingId ? newEntry : b))
      : [...bankAccounts.filter((b) => b.id !== newEntry.id), newEntry];

    onChangeBankAccounts(nextList);
    resetForm();

    if (onQuickSave) {
      setIsSavingQuick(true);
      try {
        await onQuickSave(nextList);
        showToast?.(
          editingId
            ? `¡Cuenta de ${cleanBank} actualizada y guardada en el Catálogo Digital!`
            : `¡Cuenta de ${cleanBank} agregada y guardada en el Catálogo Digital!`,
          'success'
        );
      } catch {
        showToast?.('Cuenta agregada. Haz clic en Guardar cambios.', 'info');
      } finally {
        setIsSavingQuick(false);
      }
    } else {
      showToast?.(
        editingId
          ? `Cuenta de ${cleanBank} actualizada`
          : `Cuenta de ${cleanBank} agregada a la lista`,
        'success'
      );
    }
  };

  const handleRemoveAccount = async (id: string) => {
    const target = bankAccounts.find((b) => b.id === id);
    const nextList = bankAccounts.filter((b) => b.id !== id);
    onChangeBankAccounts(nextList);
    if (editingId === id) {
      resetForm();
    }
    if (onQuickSave) {
      setIsSavingQuick(true);
      try {
        await onQuickSave(nextList);
        showToast?.(`Cuenta de ${target?.bankName || 'banco'} eliminada del Catálogo Digital`, 'info');
      } finally {
        setIsSavingQuick(false);
      }
    } else {
      showToast?.(`Cuenta eliminada de la lista`, 'info');
    }
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200 flex items-center justify-center font-bold shrink-0">
            <Landmark className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-slate-900">
                Cuentas Bancarias para Transferencias (Catálogo Digital)
              </h2>
              <span className="text-xs font-extrabold text-emerald-700">
                · {bankAccounts.length} {bankAccounts.length === 1 ? 'cuenta guardada' : 'cuentas guardadas'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Selecciona tu banco, escribe el número de cuenta y el titular. Al guardar, aparecerán con el logo del banco y botón de copiar cuando tus clientes elijan <strong>Transferencia Bancaria</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* Step 1: Select Bank Preset with Official Logo */}
      <div className="space-y-3 bg-slate-50/80 p-4 rounded-2xl border border-slate-200/90">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
            {editingId ? '1. Editando Banco Seleccionado:' : '1. Elige el Banco (con su Logo Oficial):'}
          </label>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="text-xs font-bold text-rose-600 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Cancelar edición</span>
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
          {BANK_PRESETS.map((preset) => {
            const active = selectedPresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset)}
                className={`p-2 rounded-xl border text-center transition-all flex flex-col items-center gap-1.5 cursor-pointer ${
                  active
                    ? 'bg-emerald-50/90 border-emerald-600 ring-2 ring-emerald-500/20 shadow-xs'
                    : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <BankBrandLogo bankId={preset.id} bankName={preset.name} size="sm" />
                <span className="text-[11px] font-extrabold text-slate-800 leading-tight line-clamp-1">
                  {preset.shortLabel}
                </span>
              </button>
            );
          })}
        </div>

        {/* Step 2: Account Form Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3 border-t border-slate-200/80 text-xs">
          {/* Bank Name */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nombre del Banco <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Landmark className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={bankName}
                onChange={(e) => setBankName(e.target.value)}
                placeholder="Ej. BAC Credomatic, Banco Atlántida..."
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Account Number */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Número de Cuenta Bancaria <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-emerald-600 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="Ej. 745896321 o 21-401-098765-1"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono tabular-nums font-black text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Holder Name */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">
                Nombre de la Cuenta / Titular <span className="text-rose-500">*</span>
              </label>
              {storeName && (
                <button
                  type="button"
                  onClick={() => setHolderName(storeName)}
                  className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Usar "{storeName}"
                </button>
              )}
            </div>
            <div className="relative">
              <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                placeholder={`Ej. ${storeName || 'Juan Carlos Pérez'}`}
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Account Type & Currency */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Tipo de Cuenta
              </label>
              <select
                value={accountType}
                onChange={(e) => setAccountType(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Ahorro">Cuenta de Ahorro</option>
                <option value="Cheques">Cuenta de Cheques</option>
                <option value="Billetera Móvil">Billetera Móvil</option>
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                Moneda
              </label>
              <select
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="HNL">Lempiras (L.)</option>
                <option value="USD">Dólares ($)</option>
              </select>
            </div>
          </div>

          {/* Holder Identity or RTN (for ACH transfers) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="font-bold text-slate-700">
                Identidad o RTN del Titular <span className="text-slate-400 font-normal">(Opcional ACH)</span>
              </label>
              {defaultRtn && (
                <button
                  type="button"
                  onClick={() => setHolderIdOrRtn(defaultRtn)}
                  className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Usar RTN de tienda
                </button>
              )}
            </div>
            <div className="relative">
              <FileText className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={holderIdOrRtn}
                onChange={(e) => setHolderIdOrRtn(e.target.value)}
                placeholder="Ej. 0801-1990-12345"
                className="w-full pl-9 pr-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Optional Custom Logo Upload / URL */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Logo Personalizado del Banco <span className="text-slate-400 font-normal">(Opcional, ya incluye logo automático)</span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={customLogoUrl}
                onChange={(e) => setCustomLogoUrl(e.target.value)}
                placeholder="Automático o pega URL / sube imagen..."
                className="flex-1 px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <label className="px-3 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs">
                <Upload className="w-3.5 h-3.5 text-emerald-600" />
                <span>{isUploadingLogo ? 'Subiendo...' : 'Subir Logo'}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleUploadCustomBankLogo}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Add / Update Account Action Button */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span>Vista previa del logo:</span>
            <BankBrandLogo
              bankId={selectedPresetId}
              bankName={bankName || 'Banco'}
              customLogoUrl={customLogoUrl}
              size="sm"
            />
            <span className="font-bold text-slate-800">{bankName || 'Banco'}</span>
            {accountNumber.trim() && (
              <span className="text-emerald-700 font-semibold">
                · Se guardará automáticamente al hacer clic en Guardar
              </span>
            )}
          </div>

          <button
            type="button"
            disabled={isSavingQuick}
            onClick={handleAddOrUpdateAccount}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-2 shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
          >
            {editingId ? (
              <>
                <Save className="w-4 h-4" />
                <span>{isSavingQuick ? 'Guardando...' : 'Actualizar y Guardar Cuenta'}</span>
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                <span>{isSavingQuick ? 'Guardando...' : 'Agregar y Guardar Cuenta Bancaria'}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Configured Bank Accounts List & Live Customer Preview */}
      {bankAccounts.length === 0 ? (
        <div className="p-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 text-center space-y-2">
          <CreditCard className="w-8 h-8 text-slate-400 mx-auto stroke-1" />
          <p className="text-xs sm:text-sm font-bold text-slate-700">
            Aún no hay cuentas bancarias guardadas en la lista
          </p>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Escribe el número de cuenta arriba y presiona <strong>"Agregar y Guardar Cuenta Bancaria"</strong> (o el botón <strong>"Guardar y Aplicar Cambios"</strong> al final de la página).
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                Cuentas Activas en el Catálogo Digital ({bankAccounts.length}):
              </span>
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {bankAccounts.map((acc) => (
              <div key={acc.id} className="relative group">
                <CatalogBankAccountCard
                  account={acc}
                  onCopyFeedback={(msg) => showToast?.(msg, 'success')}
                />
                <div className="mt-1.5 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleStartEdit(acc)}
                    className="px-3 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 font-bold text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>Editar cuenta</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveAccount(acc.id)}
                    className="px-3 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs inline-flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Eliminar</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
