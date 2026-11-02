import React from 'react';

export const MIAPPHN_BANNER_LOGO_URL =
  '/assets/aistudio/miapphn-logo-fondo-oscuro_c705844a.png';

/**
 * Exact vector silhouette of the MIAPPHN Cash Register with Wireless Signal Arcs
 * matching the official MIAPPHN brand mark.
 */
export const CashRegisterSilhouetteSvg: React.FC<{
  className?: string;
  strokeColor?: string;
}> = ({ className = 'w-6 h-6', strokeColor = 'currentColor' }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    aria-hidden="true"
  >
    {/* Top Wireless Signal Arcs (top-right of the display screen) */}
    <path
      d="M 59 22 A 11 11 0 0 1 70 33"
      stroke={strokeColor}
      strokeWidth="6.5"
      strokeLinecap="round"
    />
    <path
      d="M 59 12 A 21 21 0 0 1 80 33"
      stroke={strokeColor}
      strokeWidth="6.5"
      strokeLinecap="round"
    />

    {/* Top Display Monitor Screen */}
    <rect
      x="34"
      y="27"
      width="24"
      height="16"
      rx="5.5"
      stroke={strokeColor}
      strokeWidth="6.5"
    />

    {/* Monitor Neck / Stem */}
    <line
      x1="46"
      y1="43"
      x2="46"
      y2="50"
      stroke={strokeColor}
      strokeWidth="6.5"
      strokeLinecap="round"
    />

    {/* Middle Trapezoid Keypad Body */}
    <path
      d="M 32 50 H 60 L 68 69 H 24 L 32 50 Z"
      stroke={strokeColor}
      strokeWidth="6.5"
      strokeLinejoin="round"
    />

    {/* 3 Keypad Dots inside the Trapezoid Body */}
    <circle cx="37" cy="60" r="3.2" fill={strokeColor} />
    <circle cx="46" cy="60" r="3.2" fill={strokeColor} />
    <circle cx="55" cy="60" r="3.2" fill={strokeColor} />

    {/* Bottom Cash Drawer Base */}
    <rect
      x="18"
      y="69"
      width="56"
      height="19"
      rx="6.5"
      stroke={strokeColor}
      strokeWidth="6.5"
    />

    {/* Cash Drawer Handle Slot */}
    <line
      x1="38"
      y1="78.5"
      x2="54"
      y2="78.5"
      stroke={strokeColor}
      strokeWidth="6.5"
      strokeLinecap="round"
    />
  </svg>
);

/**
 * Official MIAPPHN Square App Icon:
 * Emerald rounded square gradient with the black Cash Register silhouette inside.
 */
export const MiAppHNCashRegisterIcon: React.FC<{
  className?: string;
  iconClassName?: string;
}> = ({ className = 'w-11 h-11 rounded-2xl', iconClassName = 'w-8 h-8' }) => (
  <div
    className={`bg-gradient-to-br from-[#20e395] via-[#10b981] to-[#059669] flex items-center justify-center shadow-md shadow-emerald-950/50 shrink-0 ${className}`}
  >
    <CashRegisterSilhouetteSvg
      className={iconClassName}
      strokeColor="#091310"
    />
  </div>
);

/**
 * Official MIAPPHN Horizontal Banner Logo (uses the uploaded banner PNG for dark backgrounds)
 */
export const MiAppHNBannerLogo: React.FC<{
  className?: string;
  alt?: string;
}> = ({ className = 'h-10 sm:h-12 w-auto', alt = 'MIAPPHN' }) => (
  <img
    src={MIAPPHN_BANNER_LOGO_URL}
    alt={alt}
    className={`object-contain select-none ${className}`}
  />
);
