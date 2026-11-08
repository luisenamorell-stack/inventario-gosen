import { useState, useEffect, useMemo } from 'react';
import { StoreSettings } from '../types';

export interface CatalogBrandPalette {
  name: string;
  headerBg: string;
  headerBorder: string;
  headerTitleColor: string;
  headerSubtitleColor: string;
  logoRingColor: string;
  logoBgColor: string;
  pageBg: string;
  accentColor: string;
  accentTextColor: string;
  priceColor: string;
  stockBadgeBg: string;
  stockBadgeText: string;
  stockBadgeBorder: string;
  cardBorder: string;
  pillBorder: string;
  searchIconColor: string;
}

export interface CatalogThemePresetOption {
  id: string;
  label: string;
  accentColor: string;
  headerBg: string;
}

export const CATALOG_THEME_PRESETS: CatalogThemePresetOption[] = [
  {
    id: 'gyg-gold',
    label: 'Oro & Espresso (Estilo GYG)',
    accentColor: '#d5ab46',
    headerBg: '#211a0e',
  },
  {
    id: 'emerald',
    label: 'Esmeralda Gosén',
    accentColor: '#10b981',
    headerBg: '#0c241b',
  },
  {
    id: 'royal-blue',
    label: 'Azul Comercial',
    accentColor: '#3b82f6',
    headerBg: '#0f1d36',
  },
  {
    id: 'crimson',
    label: 'Rojo Intenso',
    accentColor: '#e11d48',
    headerBg: '#280d15',
  },
  {
    id: 'amber-orange',
    label: 'Naranja Vibrante',
    accentColor: '#ea580c',
    headerBg: '#271309',
  },
  {
    id: 'violet-boutique',
    label: 'Morado Boutique',
    accentColor: '#8b5cf6',
    headerBg: '#1b1130',
  },
  {
    id: 'rose-glam',
    label: 'Rosa Elegante',
    accentColor: '#db2777',
    headerBg: '#290f1d',
  },
  {
    id: 'teal-modern',
    label: 'Turquesa Moderno',
    accentColor: '#0d9488',
    headerBg: '#0c2220',
  },
];

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = (hex || '').trim().replace(/^#/, '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
    return { r, g, b };
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      case bn:
        h = (rn - gn) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;

  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;
  let rPrime = 0;
  let gPrime = 0;
  let bPrime = 0;

  if (hn >= 0 && hn < 60) {
    rPrime = c;
    gPrime = x;
    bPrime = 0;
  } else if (hn >= 60 && hn < 120) {
    rPrime = x;
    gPrime = c;
    bPrime = 0;
  } else if (hn >= 120 && hn < 180) {
    rPrime = 0;
    gPrime = c;
    bPrime = x;
  } else if (hn >= 180 && hn < 240) {
    rPrime = 0;
    gPrime = x;
    bPrime = c;
  } else if (hn >= 240 && hn < 300) {
    rPrime = x;
    gPrime = 0;
    bPrime = c;
  } else {
    rPrime = c;
    gPrime = 0;
    bPrime = x;
  }

  return rgbToHex((rPrime + m) * 255, (gPrime + m) * 255, (bPrime + m) * 255);
}

/**
 * Builds a complete, harmonious CatalogBrandPalette from any accent hex color
 * and optional dark header background color, matching the exact GYG reference aesthetic.
 */
export function buildPaletteFromBrandColors(
  accentHex: string,
  customHeaderBgHex?: string
): CatalogBrandPalette {
  const rgb = hexToRgb(accentHex) || { r: 213, g: 171, b: 70 }; // Default GYG Gold #d5ab46
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // If the accent is very close to the signature GYG Gold (hue 35..50), use exact tuned GYG tones
  const isWarmGold = h >= 32 && h <= 54 && s >= 35;

  const normalizedAccent = isWarmGold
    ? accentHex.toLowerCase() === '#d5ab46'
      ? '#d5ab46'
      : hslToHex(h, Math.max(55, Math.min(82, s)), Math.max(48, Math.min(60, l)))
    : hslToHex(h, Math.max(55, Math.min(88, s)), Math.max(42, Math.min(56, l)));

  const finalRgb = hexToRgb(normalizedAccent) || rgb;
  // Relative luminance to decide whether text on top of accent pills/buttons is dark or white
  const luminance = (0.299 * finalRgb.r + 0.587 * finalRgb.g + 0.114 * finalRgb.b) / 255;
  const accentTextColor = luminance > 0.54 ? '#1f1709' : '#ffffff';

  const headerBg =
    customHeaderBgHex && hexToRgb(customHeaderBgHex)
      ? customHeaderBgHex
      : isWarmGold
      ? '#211a0e'
      : hslToHex(h, Math.min(48, Math.max(24, s)), 11);

  return {
    name: isWarmGold ? 'Oro & Espresso' : 'Marca Personalizada',
    headerBg,
    headerBorder: normalizedAccent,
    headerTitleColor: isWarmGold ? '#e4bc5a' : hslToHex(h, Math.max(65, s), 72),
    headerSubtitleColor: isWarmGold ? '#b9a67c' : hslToHex(h, 28, 72),
    logoRingColor: normalizedAccent,
    logoBgColor: isWarmGold ? '#141008' : hslToHex(h, 35, 8),
    pageBg: isWarmGold ? '#f6f3ea' : hslToHex(h, 28, 96),
    accentColor: normalizedAccent,
    accentTextColor,
    priceColor: isWarmGold ? '#855d14' : hslToHex(h, Math.max(65, s), 29),
    stockBadgeBg: isWarmGold ? '#f9f0cf' : hslToHex(h, Math.max(60, s), 92),
    stockBadgeText: isWarmGold ? '#5c410b' : hslToHex(h, Math.max(70, s), 22),
    stockBadgeBorder: isWarmGold ? '#e7d393' : hslToHex(h, Math.max(48, s), 78),
    cardBorder: isWarmGold ? '#e7dfc9' : hslToHex(h, 24, 86),
    pillBorder: isWarmGold ? '#dfd5bc' : hslToHex(h, 24, 82),
    searchIconColor: isWarmGold ? '#a67c27' : hslToHex(h, Math.max(55, s), 38),
  };
}

/**
 * Analyzes an HTMLImageElement, File, Blob, or URL on an offscreen 64x64 canvas
 * and extracts the store logo's dominant accent color and dark header tone.
 */
export function extractColorsFromLoadedImage(
  img: HTMLImageElement
): { accentColor: string; headerBg: string } | null {
  try {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(img, 0, 0, size, size);
    const imageData = ctx.getImageData(0, 0, size, size).data;

    // 12 hue buckets (30 degrees each) to find the most prominent chromatic brand color
    const buckets: {
      count: number;
      weightSum: number;
      rSum: number;
      gSum: number;
      bSum: number;
    }[] = Array.from({ length: 12 }, () => ({
      count: 0,
      weightSum: 0,
      rSum: 0,
      gSum: 0,
      bSum: 0,
    }));

    let darkR = 0;
    let darkG = 0;
    let darkB = 0;
    let darkCount = 0;

    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      const a = imageData[i + 3];

      if (a < 110) continue; // Ignore transparent pixels

      const { h, s, l } = rgbToHsl(r, g, b);

      // Track dark background pixels (like dark charcoal/espresso circles in logos)
      if (l >= 4 && l <= 22) {
        darkR += r;
        darkG += g;
        darkB += b;
        darkCount++;
      }

      // Skip near-white, near-black, or pure gray pixels when looking for the brand accent
      if (l < 18 || l > 88 || s < 22) continue;

      const bucketIdx = Math.min(11, Math.floor(h / 30));
      // Weight colorful, medium-bright pixels highest (gold, emerald, blue, red, etc.)
      const saturationWeight = s / 100;
      const lightnessWeight = 1 - Math.abs(l - 54) / 50;
      const weight = Math.max(0.2, saturationWeight * Math.max(0.3, lightnessWeight));

      buckets[bucketIdx].count += 1;
      buckets[bucketIdx].weightSum += weight;
      buckets[bucketIdx].rSum += r * weight;
      buckets[bucketIdx].gSum += g * weight;
      buckets[bucketIdx].bSum += b * weight;
    }

    let bestBucket = buckets[0];
    for (const b of buckets) {
      if (b.weightSum > bestBucket.weightSum) {
        bestBucket = b;
      }
    }

    if (bestBucket.weightSum <= 0) {
      return null;
    }

    const avgR = bestBucket.rSum / bestBucket.weightSum;
    const avgG = bestBucket.gSum / bestBucket.weightSum;
    const avgB = bestBucket.bSum / bestBucket.weightSum;
    const { h, s, l } = rgbToHsl(avgR, avgG, avgB);

    const accentColor = hslToHex(
      h,
      Math.max(55, Math.min(86, s)),
      Math.max(44, Math.min(58, l))
    );

    let headerBg = hslToHex(h, Math.min(46, Math.max(24, s)), 11);
    if (darkCount > size * size * 0.12) {
      const dr = darkR / darkCount;
      const dg = darkG / darkCount;
      const db = darkB / darkCount;
      const darkHsl = rgbToHsl(dr, dg, db);
      headerBg = hslToHex(
        darkHsl.s > 10 ? darkHsl.h : h,
        Math.max(22, Math.min(48, darkHsl.s || 30)),
        Math.max(8, Math.min(14, darkHsl.l))
      );
    }

    return { accentColor, headerBg };
  } catch {
    return null;
  }
}

export async function extractPaletteFromLogoSource(
  source: File | Blob | string
): Promise<{ accentColor: string; headerBg: string } | null> {
  if (typeof window === 'undefined') return null;

  return new Promise((resolve) => {
    const img = new Image();
    let objectUrl: string | null = null;

    const cleanup = () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onload = () => {
      const result = extractColorsFromLoadedImage(img);
      cleanup();
      resolve(result);
    };

    img.onerror = () => {
      cleanup();
      resolve(null);
    };

    if (typeof source === 'string') {
      if (!source.startsWith('data:') && !source.startsWith('/')) {
        img.crossOrigin = 'anonymous';
      }
      img.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      img.src = objectUrl;
    }
  });
}

const PALETTE_CACHE_KEY = 'stockmaster_logo_palette_cache_v1';

function getCachedLogoColors(logoUrl: string): { accentColor: string; headerBg: string } | null {
  if (!logoUrl || typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(PALETTE_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw);
    return map[logoUrl] || null;
  } catch {
    return null;
  }
}

function setCachedLogoColors(
  logoUrl: string,
  colors: { accentColor: string; headerBg: string }
): void {
  if (!logoUrl || typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(PALETTE_CACHE_KEY);
    const map = raw ? JSON.parse(raw) : {};
    map[logoUrl] = colors;
    localStorage.setItem(PALETTE_CACHE_KEY, JSON.stringify(map));
  } catch {
    // ignore storage quota errors
  }
}

/**
 * React Hook that returns the active CatalogBrandPalette for a store:
 * 1. Uses storeSettings.catalogAccentColor if configured
 * 2. Otherwise automatically extracts the dominant brand colors from effectiveLogo
 * 3. Falls back to the signature Oro & Espresso (Estilo GYG) design from the reference image
 */
export function useCatalogBrandPalette(
  storeSettings: StoreSettings,
  effectiveLogo: string
): {
  palette: CatalogBrandPalette;
  onLogoImageLoaded: (img: HTMLImageElement) => void;
} {
  const [extractedColors, setExtractedColors] = useState<{
    accentColor: string;
    headerBg: string;
  } | null>(() => getCachedLogoColors(effectiveLogo));

  useEffect(() => {
    if (!effectiveLogo) {
      setExtractedColors(null);
      return;
    }
    const cached = getCachedLogoColors(effectiveLogo);
    if (cached) {
      setExtractedColors(cached);
      return;
    }
    let cancelled = false;
    extractPaletteFromLogoSource(effectiveLogo).then((res) => {
      if (!cancelled && res) {
        setCachedLogoColors(effectiveLogo, res);
        setExtractedColors(res);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveLogo]);

  const onLogoImageLoaded = (img: HTMLImageElement) => {
    if (storeSettings.catalogAccentColor?.trim()) return;
    const res = extractColorsFromLoadedImage(img);
    if (res) {
      setCachedLogoColors(effectiveLogo, res);
      setExtractedColors(res);
    }
  };

  const palette = useMemo(() => {
    // 1. Explicit color saved in StoreSettings (either auto-saved on logo upload or picked by admin)
    if (storeSettings.catalogAccentColor?.trim()) {
      return buildPaletteFromBrandColors(
        storeSettings.catalogAccentColor.trim(),
        storeSettings.catalogHeaderBg?.trim()
      );
    }

    // 2. Dynamically extracted colors from the store's logo image
    if (extractedColors?.accentColor) {
      return buildPaletteFromBrandColors(
        extractedColors.accentColor,
        extractedColors.headerBg
      );
    }

    // 3. Default to the signature Oro & Espresso (GYG Reference Style)
    return buildPaletteFromBrandColors('#d5ab46', '#211a0e');
  }, [
    storeSettings.catalogAccentColor,
    storeSettings.catalogHeaderBg,
    extractedColors,
  ]);

  return { palette, onLogoImageLoaded };
}
