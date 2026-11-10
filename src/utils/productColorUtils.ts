import { Product } from '../types';

export interface ProductColorOption {
  name: string;
  hex: string;
  borderHex?: string;
  isMulticolor?: boolean;
}

export const PRESET_PRODUCT_COLORS: ProductColorOption[] = [
  { name: 'Negro', hex: '#18181b', borderHex: '#3f3f46' },
  { name: 'Blanco', hex: '#ffffff', borderHex: '#cbd5e1' },
  { name: 'Rojo', hex: '#dc2626', borderHex: '#b91c1c' },
  { name: 'Azul', hex: '#2563eb', borderHex: '#1d4ed8' },
  { name: 'Azul Marino', hex: '#1e3a8a', borderHex: '#172554' },
  { name: 'Celeste', hex: '#38bdf8', borderHex: '#0284c7' },
  { name: 'Rosado', hex: '#f472b6', borderHex: '#db2777' },
  { name: 'Fucsia', hex: '#d946ef', borderHex: '#a21caf' },
  { name: 'Verde', hex: '#16a34a', borderHex: '#15803d' },
  { name: 'Amarillo', hex: '#facc15', borderHex: '#ca8a04' },
  { name: 'Naranja', hex: '#f97316', borderHex: '#ea580c' },
  { name: 'Morado', hex: '#9333ea', borderHex: '#7e22ce' },
  { name: 'Gris', hex: '#64748b', borderHex: '#475569' },
  { name: 'Café', hex: '#78350f', borderHex: '#451a03' },
  { name: 'Beige', hex: '#e7dac7', borderHex: '#bfa888' },
  { name: 'Dorado', hex: '#d4a537', borderHex: '#a16207' },
  { name: 'Plateado', hex: '#cbd5e1', borderHex: '#94a3b8' },
  { name: 'Turquesa', hex: '#14b8a6', borderHex: '#0f766e' },
  { name: 'Vino', hex: '#881337', borderHex: '#4c0519' },
  { name: 'Multicolor', hex: 'linear-gradient(135deg, #ef4444, #f59e0b, #10b981, #3b82f6, #a855f7)', borderHex: '#94a3b8', isMulticolor: true },
];

const COLOR_KEYWORD_MAP: Record<string, { hex: string; borderHex: string; isMulticolor?: boolean }> = {
  negro: { hex: '#18181b', borderHex: '#3f3f46' },
  negra: { hex: '#18181b', borderHex: '#3f3f46' },
  blanco: { hex: '#ffffff', borderHex: '#cbd5e1' },
  blanca: { hex: '#ffffff', borderHex: '#cbd5e1' },
  rojo: { hex: '#dc2626', borderHex: '#b91c1c' },
  roja: { hex: '#dc2626', borderHex: '#b91c1c' },
  azul: { hex: '#2563eb', borderHex: '#1d4ed8' },
  marino: { hex: '#1e3a8a', borderHex: '#172554' },
  celeste: { hex: '#38bdf8', borderHex: '#0284c7' },
  rosado: { hex: '#f472b6', borderHex: '#db2777' },
  rosada: { hex: '#f472b6', borderHex: '#db2777' },
  rosa: { hex: '#f472b6', borderHex: '#db2777' },
  fucsia: { hex: '#d946ef', borderHex: '#a21caf' },
  verde: { hex: '#16a34a', borderHex: '#15803d' },
  olivo: { hex: '#4d7c0f', borderHex: '#3f6212' },
  amarillo: { hex: '#facc15', borderHex: '#ca8a04' },
  amarilla: { hex: '#facc15', borderHex: '#ca8a04' },
  naranja: { hex: '#f97316', borderHex: '#ea580c' },
  anaranjado: { hex: '#f97316', borderHex: '#ea580c' },
  morado: { hex: '#9333ea', borderHex: '#7e22ce' },
  morada: { hex: '#9333ea', borderHex: '#7e22ce' },
  lila: { hex: '#c084fc', borderHex: '#9333ea' },
  violeta: { hex: '#8b5cf6', borderHex: '#6d28d9' },
  gris: { hex: '#64748b', borderHex: '#475569' },
  plomo: { hex: '#64748b', borderHex: '#475569' },
  cafe: { hex: '#78350f', borderHex: '#451a03' },
  marron: { hex: '#78350f', borderHex: '#451a03' },
  chocolate: { hex: '#5c2d0c', borderHex: '#3e1f08' },
  beige: { hex: '#e7dac7', borderHex: '#bfa888' },
  crema: { hex: '#fef3c7', borderHex: '#d97706' },
  dorado: { hex: '#d4a537', borderHex: '#a16207' },
  dorada: { hex: '#d4a537', borderHex: '#a16207' },
  oro: { hex: '#d4a537', borderHex: '#a16207' },
  plateado: { hex: '#cbd5e1', borderHex: '#94a3b8' },
  plateada: { hex: '#cbd5e1', borderHex: '#94a3b8' },
  plata: { hex: '#cbd5e1', borderHex: '#94a3b8' },
  turquesa: { hex: '#14b8a6', borderHex: '#0f766e' },
  vino: { hex: '#881337', borderHex: '#4c0519' },
  burdeos: { hex: '#881337', borderHex: '#4c0519' },
  coral: { hex: '#fb7185', borderHex: '#e11d48' },
  multicolor: {
    hex: 'linear-gradient(135deg, #ef4444, #f59e0b, #10b981, #3b82f6, #a855f7)',
    borderHex: '#94a3b8',
    isMulticolor: true,
  },
};

export function resolveColorSwatch(colorName: string): {
  hex: string;
  borderHex: string;
  isMulticolor?: boolean;
} {
  const clean = (colorName || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (!clean) {
    return { hex: '#94a3b8', borderHex: '#64748b' };
  }

  if (COLOR_KEYWORD_MAP[clean]) {
    return COLOR_KEYWORD_MAP[clean];
  }

  for (const [key, val] of Object.entries(COLOR_KEYWORD_MAP)) {
    if (clean.includes(key)) {
      return val;
    }
  }

  return { hex: '#94a3b8', borderHex: '#64748b' };
}

/**
 * Extracts normalized, deduplicated list of colors for a product.
 */
export function getProductColors(product?: Product | null): string[] {
  if (!product) return [];
  const result: string[] = [];
  const seen = new Set<string>();

  const pushColor = (raw: string) => {
    const trimmed = String(raw || '').trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(trimmed);
    }
  };

  if (Array.isArray(product.colors)) {
    for (const c of product.colors) {
      if (typeof c === 'string') {
        c.split(',').forEach(pushColor);
      }
    }
  }

  if (typeof product.color === 'string' && product.color.trim()) {
    product.color.split(',').forEach(pushColor);
  }

  return result;
}

/**
 * Returns up to 2 valid image URLs for a product ([img, img2]).
 */
export function getProductImages(product?: Product | null): string[] {
  if (!product) return [];
  const list: string[] = [];
  if (product.img && product.img.trim()) {
    list.push(product.img.trim());
  }
  if (product.img2 && product.img2.trim() && product.img2.trim() !== product.img?.trim()) {
    list.push(product.img2.trim());
  }
  return list;
}
