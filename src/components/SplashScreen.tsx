import React from 'react';
import { StoreSettings } from '../types';

interface SplashScreenProps {
  storeSettings?: StoreSettings;
  isExiting?: boolean;
}

/**
 * High-precision metallic vector recreation of the Tienda Gosén "G-Shoe" emblem
 * designed for 2D/3D-style walking stride animation.
 */
const GosenShoeSvg: React.FC<{
  idPrefix: string;
  isBackFoot?: boolean;
}> = ({ idPrefix, isBackFoot = false }) => {
  const metalGradId = `${idPrefix}-metal`;
  const highlightGradId = `${idPrefix}-highlight`;
  const edgeGradId = `${idPrefix}-edge`;
  const glowFilterId = `${idPrefix}-glow`;

  return (
    <svg
      viewBox="0 0 240 130"
      className="w-full h-full overflow-visible"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* Brushed Silver / Chrome Metallic Gradient matching /store-logo.jpg */}
        <linearGradient id={metalGradId} x1="20" y1="15" x2="210" y2="115" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={isBackFoot ? '#94a3b8' : '#ffffff'} />
          <stop offset="22%" stopColor={isBackFoot ? '#cbd5e1' : '#e2e8f0'} />
          <stop offset="45%" stopColor={isBackFoot ? '#64748b' : '#94a3b8'} />
          <stop offset="68%" stopColor={isBackFoot ? '#e2e8f0' : '#f8fafc'} />
          <stop offset="88%" stopColor={isBackFoot ? '#475569' : '#64748b'} />
          <stop offset="100%" stopColor={isBackFoot ? '#94a3b8' : '#cbd5e1'} />
        </linearGradient>

        {/* Specular Top Edge Highlight */}
        <linearGradient id={highlightGradId} x1="30" y1="18" x2="205" y2="95" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" stopOpacity={isBackFoot ? '0.45' : '0.95'} />
          <stop offset="50%" stopColor="#34d399" stopOpacity={isBackFoot ? '0.2' : '0.45'} />
          <stop offset="100%" stopColor="#ffffff" stopOpacity={isBackFoot ? '0.4' : '0.85'} />
        </linearGradient>

        {/* Deep 3D Bevel Under-Shadow */}
        <linearGradient id={edgeGradId} x1="120" y1="20" x2="120" y2="115" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#334155" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>

        <filter id={glowFilterId} x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow
            dx="0"
            dy={isBackFoot ? '4' : '7'}
            stdDeviation={isBackFoot ? '4' : '6'}
            floodColor="#020617"
            floodOpacity={isBackFoot ? '0.55' : '0.75'}
          />
        </filter>
      </defs>

      <g filter={`url(#${glowFilterId})`}>
        {/* Outer Shoe Silhouette + Integrated "G" Body (matches Tienda Gosén Logo) */}
        {/* 1. Upper Shoe Collar, Tongue, Instep & Toe Cap */}
        <path
          d="M 42 30
             C 51 44, 62 53, 74 52
             C 88 51, 96 36, 102 20
             C 105 14, 111 14, 117 19
             C 138 37, 160 56, 182 69
             C 194 75, 208 77, 214 85
             C 220 93, 216 105, 202 109
             C 188 112, 164 112, 142 112
             L 152 101
             C 170 101, 188 101, 196 98
             C 202 96, 203 90, 197 86
             C 188 81, 174 78, 161 70
             C 141 57, 124 43, 108 33
             C 101 29, 96 33, 91 41
             C 84 53, 73 62, 60 62
             C 51 62, 44 57, 39 50
             L 31 79
             C 29 88, 34 97, 45 99
             L 56 99
             C 69 75, 86 54, 109 50
             C 122 48, 134 51, 144 58
             L 131 64
             C 123 60, 114 59, 105 62
             C 89 67, 77 83, 69 99
             L 119 99
             C 125 99, 131 93, 134 84
             L 109 84
             L 116 72
             L 155 72
             C 151 90, 143 105, 132 112
             L 46 112
             C 25 112, 16 99, 20 80
             L 34 32
             C 36 27, 39 27, 42 30 Z"
          fill={`url(#${metalGradId})`}
          stroke={`url(#${highlightGradId})`}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />

        {/* Metallic Crease & Light Reflection Accents */}
        <path
          d="M 105 18 C 130 38, 156 58, 184 72"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinecap="round"
          strokeOpacity={isBackFoot ? '0.35' : '0.75'}
        />
        <path
          d="M 62 104 C 76 76, 94 55, 118 53"
          stroke="#ffffff"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeOpacity={isBackFoot ? '0.3' : '0.65'}
        />

        {/* Subtle Emerald Sole Tread Grips underneath the shoe for walking realism */}
        <g opacity={isBackFoot ? '0.45' : '0.85'}>
          <rect x="34" y="113" width="14" height="3.5" rx="1.5" fill="#10b981" />
          <rect x="54" y="113" width="14" height="3.5" rx="1.5" fill="#10b981" />
          <rect x="74" y="113" width="14" height="3.5" rx="1.5" fill="#10b981" />
          <rect x="94" y="113" width="14" height="3.5" rx="1.5" fill="#10b981" />
          <rect x="114" y="113" width="14" height="3.5" rx="1.5" fill="#10b981" />
          <rect x="152" y="113" width="16" height="3.5" rx="1.5" fill="#34d399" />
          <rect x="174" y="113" width="18" height="3.5" rx="1.5" fill="#34d399" />
        </g>
      </g>
    </svg>
  );
};

export const SplashScreen: React.FC<SplashScreenProps> = ({
  storeSettings,
  isExiting = false,
}) => {
  const storeName = storeSettings?.storeName || 'TIENDA GOSÉN';

  return (
    <div
      className={`fixed inset-0 z-100 flex flex-col items-center justify-center bg-[#040d21] text-white select-none overflow-hidden transition-opacity duration-500 ${
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
      style={{
        background:
          'radial-gradient(circle at 50% 42%, #0c2d6b 0%, #061539 52%, #020817 100%)',
      }}
    >
      {/* Ambient Navy & Emerald Spotlight Glow */}
      <div className="absolute w-80 h-80 sm:w-96 sm:h-96 rounded-full bg-blue-500/15 blur-3xl pointer-events-none" />
      <div className="absolute w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl translate-y-12 pointer-events-none" />

      {/* Main Walking Shoe Stage */}
      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-md">
        {/* Walking Shoes Animation Box */}
        <div className="relative w-64 h-44 sm:w-72 sm:h-48 flex items-center justify-center">
          {/* Back Foot (Left Shoe - phase offset by 50% of cycle for natural alternating walk) */}
          <div className="absolute inset-x-6 top-5 h-28 sm:h-32 opacity-55 scale-90 -translate-y-2 pointer-events-none">
            <div className="w-full h-full animate-gosen-shoe-back">
              <GosenShoeSvg idPrefix="gosen-back" isBackFoot={true} />
            </div>
          </div>

          {/* Front Foot (Right Shoe - foreground metallic Gosén G-Shoe) */}
          <div className="relative w-56 h-32 sm:w-64 sm:h-36 z-10">
            <div className="w-full h-full animate-gosen-shoe-front">
              <GosenShoeSvg idPrefix="gosen-front" isBackFoot={false} />
            </div>
          </div>

          {/* Ground Shadows & Walking Track */}
          <div className="absolute bottom-3 inset-x-4 flex flex-col items-center">
            {/* Step Impact Ripple */}
            <div className="relative w-full h-4 flex items-center justify-center">
              {/* Back foot shadow */}
              <div className="absolute w-28 h-2.5 rounded-full bg-slate-950/70 blur-[3px] animate-gosen-shadow-back -translate-y-1" />
              {/* Front foot shadow */}
              <div className="absolute w-36 h-3 rounded-full bg-black/80 blur-xs animate-gosen-shadow-front" />
              {/* Emerald step pulse ring */}
              <div className="absolute translate-x-6 w-16 h-3 rounded-full border border-emerald-400/60 animate-gosen-ripple" />
            </div>

            {/* Scrolling Ground Track Lines */}
            <div className="w-56 sm:w-64 h-[3px] rounded-full overflow-hidden bg-slate-800/80 mt-1 shadow-[0_0_12px_rgba(16,185,129,0.35)]">
              <div className="w-full h-full animate-gosen-ground" />
            </div>
          </div>
        </div>

        {/* Metallic Brand Title matching the logo */}
        <div className="mt-2 text-center">
          <h1
            className="text-2xl sm:text-3xl font-black tracking-[0.28em] uppercase bg-gradient-to-b from-white via-slate-200 to-slate-400 bg-clip-text text-transparent drop-shadow-[0_4px_12px_rgba(0,0,0,0.7)]"
          >
            {storeName}
          </h1>
          <p className="mt-1.5 text-xs sm:text-sm font-semibold text-emerald-400/90 tracking-widest uppercase">
            Paso a paso con tu inventario
          </p>
        </div>

        {/* Loading Progress Indicator */}
        <div className="mt-7 w-52 sm:w-60 flex flex-col items-center gap-2.5">
          <div className="w-full h-1.5 bg-slate-900/90 rounded-full overflow-hidden border border-slate-700/60 p-[1px]">
            <div className="h-full bg-gradient-to-r from-emerald-500 via-teal-300 to-emerald-500 rounded-full animate-pulse w-full origin-left" />
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-300/90 tracking-wider uppercase">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Cargando sistema...</span>
          </div>
        </div>
      </div>
    </div>
  );
};
