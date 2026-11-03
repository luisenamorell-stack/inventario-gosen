import { Product } from '../types';

export interface SequentialSkuConfig {
  enabled: boolean;
  startFrom: string; // e.g. "1", "001", "1000", or "ART-001"
  sequenceStrategy: 'highest_plus_one' | 'first_available';
  lastIssuedNumber?: number;
}

const SEQ_SKU_STORAGE_PREFIX = 'stockmaster_seq_sku_config_v1';

function getActiveCompanyKey(): string {
  try {
    const raw = localStorage.getItem('stockmaster_active_company_id') || 'default';
    return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'default';
  } catch {
    return 'default';
  }
}

export function loadSequentialSkuConfig(companyIdOverride?: string): SequentialSkuConfig {
  const companyKey = companyIdOverride
    ? companyIdOverride.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    : getActiveCompanyKey();
  const storageKey = `${SEQ_SKU_STORAGE_PREFIX}__${companyKey}`;

  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : true,
        startFrom:
          typeof parsed.startFrom === 'string' && parsed.startFrom.trim() !== ''
            ? parsed.startFrom.trim()
            : '1',
        sequenceStrategy:
          parsed.sequenceStrategy === 'first_available' ? 'first_available' : 'highest_plus_one',
        lastIssuedNumber:
          typeof parsed.lastIssuedNumber === 'number' ? parsed.lastIssuedNumber : undefined,
      };
    }
  } catch {
    // ignore storage errors
  }

  return {
    enabled: true,
    startFrom: '1',
    sequenceStrategy: 'highest_plus_one',
  };
}

export function saveSequentialSkuConfig(
  config: SequentialSkuConfig,
  companyIdOverride?: string
): void {
  const companyKey = companyIdOverride
    ? companyIdOverride.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '')
    : getActiveCompanyKey();
  const storageKey = `${SEQ_SKU_STORAGE_PREFIX}__${companyKey}`;

  try {
    localStorage.setItem(storageKey, JSON.stringify(config));
  } catch {
    // ignore storage errors
  }
}

/**
 * Splits a user-provided starting template like "1", "001", "1000", "SKU-0050", "A100"
 * into { prefix, startNumber, padLength }
 */
export function parseStartTemplate(startFromRaw: string): {
  prefix: string;
  startNumber: number;
  padLength: number;
} {
  const trimmed = String(startFromRaw || '').trim();
  if (!trimmed) {
    return { prefix: '', startNumber: 1, padLength: 0 };
  }

  // Match optional prefix + trailing digits
  const match = trimmed.match(/^(.*?)(\d+)$/);
  if (!match) {
    return { prefix: trimmed.toUpperCase(), startNumber: 1, padLength: 3 };
  }

  const prefix = match[1] || '';
  const digitsStr = match[2] || '1';
  const parsedNum = parseInt(digitsStr, 10);
  const startNumber = Number.isFinite(parsedNum) && parsedNum >= 0 ? parsedNum : 1;
  // Preserve zero padding if user typed leading zeros (e.g., "001" -> padLength 3)
  const padLength = digitsStr.length > 1 && digitsStr.startsWith('0') ? digitsStr.length : 0;

  return {
    prefix,
    startNumber,
    padLength,
  };
}

export function formatSequentialCode(
  num: number,
  prefix: string,
  padLength: number
): string {
  const numStr = padLength > 0 ? String(num).padStart(padLength, '0') : String(num);
  return `${prefix}${numStr}`;
}

/**
 * Computes the next ascending SKU/Barcode based on the current inventory and user's config.
 * Automatically ignores long EAN/UPC barcodes or massive outliers so the sequence stays clean.
 */
export function computeNextSequentialSku(
  inventory: Product[],
  config: SequentialSkuConfig,
  additionalUsedCodes: string[] = []
): {
  nextCode: string;
  nextNumber: number;
  prefix: string;
  padLength: number;
  startNumber: number;
} {
  const { prefix, startNumber, padLength } = parseStartTemplate(config.startFrom);
  const normalizedPrefix = prefix.toLowerCase();

  const existingCodesSet = new Set<string>();
  const matchingNumbers: number[] = [];

  const registerCode = (rawCode: string) => {
    const clean = String(rawCode || '').trim();
    if (!clean) return;
    const lower = clean.toLowerCase();
    existingCodesSet.add(lower);

    if (normalizedPrefix) {
      if (!lower.startsWith(normalizedPrefix)) return;
      const remainder = clean.slice(prefix.length).trim();
      if (/^\d+$/.test(remainder)) {
        const val = parseInt(remainder, 10);
        if (Number.isFinite(val)) {
          matchingNumbers.push(val);
        }
      }
    } else {
      if (/^\d+$/.test(clean)) {
        const val = parseInt(clean, 10);
        if (Number.isFinite(val)) {
          matchingNumbers.push(val);
        }
      }
    }
  };

  for (const item of inventory) {
    if (item && item.code) {
      registerCode(item.code);
    }
  }
  for (const extra of additionalUsedCodes) {
    registerCode(extra);
  }

  if (config.sequenceStrategy === 'first_available') {
    let candidate = startNumber;
    let safety = 0;
    while (safety < 200000) {
      const formatted = formatSequentialCode(candidate, prefix, padLength);
      if (!existingCodesSet.has(formatted.toLowerCase())) {
        return {
          nextCode: formatted,
          nextNumber: candidate,
          prefix,
          padLength,
          startNumber,
        };
      }
      candidate++;
      safety++;
    }
  }

  // Default strategy: 'highest_plus_one' (Ascendente continuo desde el número elegido)
  const relevantNumbers = Array.from(new Set(matchingNumbers.filter((n) => n >= startNumber))).sort(
    (a, b) => a - b
  );

  let highestInSequence: number | null = null;

  if (relevantNumbers.length > 0) {
    const firstExisting = relevantNumbers[0];
    // For startNumber === 1, allow a slightly wider initial offset (e.g. if item 1 was deleted and inventory starts at 2..15)
    // For a custom startNumber (e.g. 100, 250, 1000), only continue an existing run if startNumber itself (or +1/+2) is already in inventory.
    const maxInitialOffset = startNumber === 1 ? 15 : 2;

    if (firstExisting - startNumber <= maxInitialOffset) {
      highestInSequence = firstExisting;
      const maxStepGap = startNumber === 1 ? 50 : 15;

      for (let i = 1; i < relevantNumbers.length; i++) {
        const num = relevantNumbers[i];
        if (num - highestInSequence <= maxStepGap) {
          highestInSequence = num;
        } else {
          // Stop before jumping across a large gap or outlier barcode
          break;
        }
      }
    }
  }

  let candidate = highestInSequence !== null ? highestInSequence + 1 : startNumber;

  // Ensure candidate code is not already taken in existingCodesSet
  let safety = 0;
  while (safety < 200000) {
    const formatted = formatSequentialCode(candidate, prefix, padLength);
    if (!existingCodesSet.has(formatted.toLowerCase())) {
      return {
        nextCode: formatted,
        nextNumber: candidate,
        prefix,
        padLength,
        startNumber,
      };
    }
    candidate++;
    safety++;
  }

  const fallbackCode = formatSequentialCode(candidate, prefix, padLength);
  return {
    nextCode: fallbackCode,
    nextNumber: candidate,
    prefix,
    padLength,
    startNumber,
  };
}

/**
 * Generates deterministic Code-128 style bar widths for visual barcode rendering in the UI
 */
export function generateBarcodeBars(code: string): number[] {
  const clean = String(code || '').trim() || '0000';
  const bars: number[] = [2, 1, 1, 2, 1, 1]; // Start guard pattern
  for (let i = 0; i < clean.length; i++) {
    const charCode = clean.charCodeAt(i);
    const b1 = (charCode % 3) + 1;
    const s1 = ((charCode >> 2) % 2) + 1;
    const b2 = ((charCode >> 3) % 3) + 1;
    const s2 = ((charCode >> 5) % 2) + 1;
    bars.push(b1, s1, b2, s2);
  }
  bars.push(2, 1, 2, 1, 1, 2); // Stop guard pattern
  return bars;
}
