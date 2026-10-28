import React from 'react';
import { StoreSettings } from '../types';
import { normalizeCompanySlug } from '../firebase/firestoreService';

interface SplashScreenProps {
  storeSettings?: StoreSettings;
  companyId?: string;
  isSaaSAdmin?: boolean;
  isExiting: boolean;
  welcomeUser?: string | null;
  welcomeRole?: 'admin' | 'collaborator' | null;
}

/**
 * Exclusive Tienda Gosén 3D Metallic "G-Shoe" SVG (ONLY rendered when companyId === 'gosen' and !isSaaSAdmin)
 */
const GosenShoeSvg: React.FC<{ className?: string }> = ({ className = '' }) => (
  <svg
    viewBox="0 0 260 155"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <defs>
      <linearGradient id="silverMain" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="28%" stopColor="#cbd5e1" />
        <stop offset="52%" stopColor="#64748b" />
        <stop offset="78%" stopColor="#f1f5f9" />
        <stop offset="100%" stopColor="#334155" />
      </linearGradient>

      <linearGradient id="silverDark" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="50%" stopColor="#334155" />
        <stop offset="100%" stopColor="#0f172a" />
      </linearGradient>

      <linearGradient id="emeraldGlow" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="50%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>

      <filter id="shoeDropShadow" x="-15%" y="-15%" width="130%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#000000" floodOpacity="0.6" />
      </filter>
    </defs>

    <g filter="url(#shoeDropShadow)">
      <path
        d="M 18 118 C 18 110, 28 106, 45 108 L 195 108 C 222 108, 244 114, 246 125 C 248 134, 236 138, 212 138 L 32 138 C 20 138, 18 128, 18 118 Z"
        fill="url(#silverMain)"
        stroke="#e2e8f0"
        strokeWidth="1.5"
      />
      <path
        d="M 24 126 L 238 126"
        stroke="url(#emeraldGlow)"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      <path
        d="M 35 138 L 42 142 L 54 138 M 70 138 L 77 142 L 89 138 M 105 138 L 112 142 L 124 138 M 140 138 L 147 142 L 159 138 M 175 138 L 182 142 L 194 138 M 208 138 L 215 142 L 226 138"
        stroke="#94a3b8"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 24 108 C 16 74, 30 34, 68 24 C 98 16, 128 24, 146 46 L 194 84 C 218 90, 238 98, 242 112 L 22 112 Z"
        fill="url(#silverDark)"
        stroke="#cbd5e1"
        strokeWidth="1.5"
      />
      <path
        d="M 92 22 C 48 22, 24 52, 24 88 C 24 106, 44 112, 86 112 L 172 112 C 195 112, 212 104, 212 90 C 212 76, 196 68, 174 68 L 116 68 L 116 84 L 168 84 C 176 84, 182 87, 182 92 C 182 97, 175 99, 164 99 L 84 99 C 56 99, 44 88, 44 68 C 44 46, 62 36, 94 36 L 138 36 L 148 22 Z"
        fill="url(#silverMain)"
        stroke="#ffffff"
        strokeWidth="1.8"
      />
      <path d="M 118 32 L 138 50" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" />
      <path d="M 132 44 L 152 62" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" />
      <path d="M 146 56 L 166 74" stroke="#f8fafc" strokeWidth="4" strokeLinecap="round" />
      <path d="M 160 68 L 178 84" stroke="#10b981" strokeWidth="4" strokeLinecap="round" />
      <circle cx="52" cy="86" r="5" fill="#10b981" />
    </g>
  </svg>
);

/**
 * Neutral Commercial POS & Inventory Animated Emblem for ALL OTHER SaaS Clients (companyId !== 'gosen')
 */
const ClientBusinessAnimationSvg: React.FC = () => (
  <svg
    viewBox="0 0 180 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-32 h-32 sm:w-36 sm:h-36 drop-shadow-[0_14px_28px_rgba(16,185,129,0.28)]"
  >
    <defs>
      <linearGradient id="cubeTop" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#10b981" />
      </linearGradient>
      <linearGradient id="cubeLeft" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#059669" />
        <stop offset="100%" stopColor="#047857" />
      </linearGradient>
      <linearGradient id="cubeRight" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#0f172a" />
        <stop offset="100%" stopColor="#1e293b" />
      </linearGradient>
    </defs>

    {/* Outer rotating radar ring */}
    <circle
      cx="90"
      cy="90"
      r="72"
      stroke="#10b981"
      strokeWidth="1.5"
      strokeDasharray="8 6"
      strokeOpacity="0.45"
    />
    <circle
      cx="90"
      cy="90"
      r="58"
      stroke="#38bdf8"
      strokeWidth="1.2"
      strokeOpacity="0.25"
    />

    {/* 3D Isometric Commercial Box / POS Emblem */}
    <g>
      {/* Top Face */}
      <polygon
        points="90,34 140,62 90,90 40,62"
        fill="url(#cubeTop)"
        stroke="#a7f3d0"
        strokeWidth="1.5"
      />
      {/* Left Face */}
      <polygon
        points="40,62 90,90 90,144 40,116"
        fill="url(#cubeLeft)"
        stroke="#34d399"
        strokeWidth="1.5"
      />
      {/* Right Face */}
      <polygon
        points="90,90 140,62 140,116 90,144"
        fill="url(#cubeRight)"
        stroke="#34d399"
        strokeWidth="1.5"
      />
      {/* Barcode / POS Lines on Right Face */}
      <line x1="104" y1="95" x2="104" y2="122" stroke="#34d399" strokeWidth="3" strokeLinecap="round" />
      <line x1="114" y1="90" x2="114" y2="117" stroke="#e2e8f0" strokeWidth="2" strokeLinecap="round" />
      <line x1="122" y1="85" x2="122" y2="112" stroke="#34d399" strokeWidth="3.5" strokeLinecap="round" />
      <line x1="130" y1="80" x2="130" y2="107" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
      {/* Checkmark badge */}
      <circle cx="90" cy="62" r="10" fill="#0f172a" stroke="#6ee7b7" strokeWidth="2" />
      <path d="M85 62 L88.5 65.5 L95.5 58.5" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </g>
  </svg>
);

/**
 * Executive SaaS Super-Admin Control Center Emblem (ONLY when logging into the SaaS Admin Portal)
 */
const SaaSControlCenterSvg: React.FC = () => (
  <svg
    viewBox="0 0 180 180"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-32 h-32 sm:w-36 sm:h-36 drop-shadow-[0_14px_28px_rgba(20,184,166,0.35)]"
  >
    <circle cx="90" cy="90" r="70" stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="10 6" strokeOpacity="0.5" />
    <rect x="42" y="46" width="96" height="88" rx="16" fill="#0f172a" stroke="#2dd4bf" strokeWidth="2.2" />
    <line x1="42" y1="68" x2="138" y2="68" stroke="#1e293b" strokeWidth="2" />
    <circle cx="56" cy="57" r="3.5" fill="#f43f5e" />
    <circle cx="68" cy="57" r="3.5" fill="#f59e0b" />
    <circle cx="80" cy="57" r="3.5" fill="#10b981" />
    <rect x="56" y="80" width="28" height="20" rx="5" fill="#134e4a" stroke="#2dd4bf" strokeWidth="1.5" />
    <rect x="92" y="80" width="32" height="20" rx="5" fill="#1e293b" stroke="#38bdf8" strokeWidth="1.5" />
    <rect x="56" y="106" width="68" height="14" rx="4" fill="#042f2e" stroke="#10b981" strokeWidth="1.5" />
    <circle cx="126" cy="48" r="14" fill="#f59e0b" stroke="#0f172a" strokeWidth="3" />
    <path d="M121 48 L124.5 51.5 L131.5 44.5" stroke="#0f172a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SplashScreen: React.FC<SplashScreenProps> = ({
  storeSettings,
  companyId,
  isSaaSAdmin = false,
  isExiting,
  welcomeUser,
  welcomeRole,
}) => {
  const resolvedSlug = normalizeCompanySlug(companyId || storeSettings?.companyId || 'gosen');
  const isGosenStore = !isSaaSAdmin && resolvedSlug === 'gosen';

  const storeName = isSaaSAdmin
    ? 'PANEL CENTRAL SAAS'
    : isGosenStore
    ? storeSettings?.storeName || 'TIENDA GOSÉN'
    : storeSettings?.storeName || resolvedSlug.toUpperCase();

  const clientLogoUrl = !isSaaSAdmin && !isGosenStore ? storeSettings?.logoUrl : undefined;

  return (
    <div
      className={`fixed inset-0 z-[9999] flex flex-col items-center justify-between bg-slate-950 text-white select-none overflow-hidden px-6 py-10 transition-all duration-300 ease-out ${
        isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Background Ambient Glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className={`absolute -top-24 left-1/2 -translate-x-1/2 w-[420px] h-[420px] rounded-full blur-3xl ${
            isSaaSAdmin ? 'bg-teal-500/15' : 'bg-emerald-500/15'
          }`}
        />
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-[320px] h-[220px] bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      {/* Top Tagline */}
      <div className="relative z-10 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-900/90 border border-slate-800 shadow-lg">
        <span
          className={`w-2 h-2 rounded-full animate-ping ${
            isSaaSAdmin ? 'bg-amber-400' : 'bg-emerald-400'
          }`}
        />
        <span className="text-[11px] font-bold uppercase tracking-widest text-emerald-400">
          {welcomeUser
            ? isSaaSAdmin
              ? 'Acceso Maestro Propietario SaaS'
              : `Acceso Autorizado • ${welcomeRole === 'admin' ? 'Administrador' : 'Colaborador'}`
            : isSaaSAdmin
            ? 'Consola de Control Multi-Empresa'
            : 'Sistema Inteligente de Inventario'}
        </span>
      </div>

      {/* Center Stage — Strictly Separated by Context */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-md my-auto">
        {isSaaSAdmin ? (
          /* 1. STANDALONE SAAS SUPER-ADMIN ANIMATION */
          <div className="relative flex flex-col items-center justify-center mb-6 animate-pulse">
            <SaaSControlCenterSvg />
          </div>
        ) : isGosenStore ? (
          /* 2. EXCLUSIVE TIENDA GOSÉN WALKING METALLIC SHOE ANIMATION */
          <div className="relative w-72 sm:w-80 h-44 flex items-center justify-center mb-6">
            <div className="absolute bottom-3 w-48 h-5 bg-emerald-500/25 rounded-full blur-md animate-FloorShadow" />

            <div className="relative w-full h-full flex items-center justify-center">
              <div className="absolute w-44 sm:w-48 opacity-35 scale-90 -translate-x-5 -translate-y-2 animate-ShoeStepBack">
                <GosenShoeSvg className="w-full h-auto" />
              </div>

              <div className="relative w-48 sm:w-52 z-10 animate-ShoeStepFront">
                <GosenShoeSvg className="w-full h-auto" />
              </div>
            </div>

            <div className="absolute bottom-1 inset-x-4 h-[2px] bg-gradient-to-r from-transparent via-emerald-400/70 to-transparent overflow-hidden rounded-full">
              <div className="w-24 h-full bg-white animate-RoadTrack" />
            </div>
          </div>
        ) : (
          /* 3. OTHER SAAS CLIENTS — INDEPENDENT COMMERCIAL EMBLEM OR CLIENT LOGO (NO GOSÉN SHOE) */
          <div className="relative flex flex-col items-center justify-center mb-6">
            {clientLogoUrl ? (
              <div className="w-36 h-28 sm:w-44 sm:h-32 rounded-2xl bg-slate-900/90 border border-emerald-500/30 p-3 flex items-center justify-center shadow-2xl shadow-emerald-950/50">
                <img
                  src={clientLogoUrl}
                  alt={storeName}
                  className="max-w-full max-h-full object-contain rounded-xl"
                />
              </div>
            ) : (
              <ClientBusinessAnimationSvg />
            )}
          </div>
        )}

        {/* Store / Portal Title & Subtitle */}
        <h1 className="text-2xl sm:text-3xl font-black tracking-wider text-center uppercase bg-gradient-to-r from-white via-slate-100 to-emerald-300 bg-clip-text text-transparent drop-shadow-xs">
          {welcomeUser ? `¡HOLA, ${welcomeUser.toUpperCase()}!` : storeName}
        </h1>
        <p className="mt-1.5 text-xs sm:text-sm font-medium text-slate-400 text-center max-w-xs">
          {welcomeUser
            ? isSaaSAdmin
              ? 'Abriendo tu Panel Central de Clientes y Control de Mora...'
              : `Preparando tu espacio de trabajo en ${storeName}...`
            : isSaaSAdmin
            ? 'Administración de licencias, accesos y control de mora'
            : isGosenStore
            ? 'Paso a paso con tu inventario en tiempo real'
            : storeSettings?.tagline || 'Control de Inventario y Facturación POS en tiempo real'}
        </p>

        {/* Smooth Progress Indicator */}
        <div className="mt-7 w-48 sm:w-56 h-1.5 bg-slate-800/90 rounded-full overflow-hidden p-[1px] border border-slate-700/60 shadow-inner">
          <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 rounded-full animate-SplashProgress" />
        </div>
      </div>

      {/* Bottom Footer */}
      <div className="relative z-10 flex flex-col items-center gap-1 text-center">
        <span className="text-[11px] font-semibold text-slate-400 tracking-wide">
          {welcomeUser ? 'Sesión verificada correctamente' : 'Sincronizando base de datos...'}
        </span>
      </div>

      {/* Custom Keyframes for the Walking Shoe & Progress Bar */}
      <style>{`
        @keyframes ShoeStepFront {
          0%, 100% {
            transform: translateY(0px) translateX(6px) rotate(-6deg);
          }
          25% {
            transform: translateY(-16px) translateX(14px) rotate(8deg);
          }
          50% {
            transform: translateY(-2px) translateX(-10px) rotate(2deg);
          }
          75% {
            transform: translateY(-10px) translateX(-2px) rotate(-10deg);
          }
        }
        @keyframes ShoeStepBack {
          0%, 100% {
            transform: translateY(-10px) translateX(-12px) rotate(8deg) scale(0.88);
          }
          25% {
            transform: translateY(0px) translateX(-18px) rotate(0deg) scale(0.88);
          }
          50% {
            transform: translateY(-14px) translateX(10px) rotate(-8deg) scale(0.88);
          }
          75% {
            transform: translateY(0px) translateX(4px) rotate(4deg) scale(0.88);
          }
        }
        @keyframes FloorShadow {
          0%, 100% {
            transform: scaleX(1);
            opacity: 0.35;
          }
          25%, 75% {
            transform: scaleX(0.78);
            opacity: 0.18;
          }
          50% {
            transform: scaleX(1.08);
            opacity: 0.4;
          }
        }
        @keyframes RoadTrack {
          0% {
            transform: translateX(180%);
          }
          100% {
            transform: translateX(-180%);
          }
        }
        @keyframes SplashProgress {
          0% {
            width: 8%;
          }
          45% {
            width: 68%;
          }
          100% {
            width: 100%;
          }
        }
        .animate-ShoeStepFront {
          animation: ShoeStepFront 0.85s infinite ease-in-out;
        }
        .animate-ShoeStepBack {
          animation: ShoeStepBack 0.85s infinite ease-in-out;
        }
        .animate-FloorShadow {
          animation: FloorShadow 0.85s infinite ease-in-out;
        }
        .animate-RoadTrack {
          animation: RoadTrack 0.65s infinite linear;
        }
        .animate-SplashProgress {
          animation: SplashProgress 0.75s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
      `}</style>
    </div>
  );
};
