import { Product } from '../types';

/**
 * Strips accents/diacritics, converts to lowercase, and collapses extra spaces.
 */
export function normalizeSearchText(text?: string | null): string {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes common Spanish phonetic variations (e.g. s/z/c, b/v) so searches like
 * "division" match "DIVICION", "gas" matches "GAZ", and "portavaso" matches "PORTAVAZO".
 */
export function normalizePhoneticText(text?: string | null): string {
  const base = normalizeSearchText(text);
  if (!base) return '';
  return base
    .replace(/z/g, 's')
    .replace(/c([ei])/g, 's$1')
    .replace(/v/g, 'b')
    .replace(/[-_./\\]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Cleans a SKU/code for comparison (lowercase, no spaces/dashes/underscores).
 */
export function normalizeSkuCode(code?: string | null): string {
  if (!code) return '';
  return normalizeSearchText(code).replace(/[-_\s./]+/g, '');
}

/**
 * Strips leading zeros from numeric codes (e.g. "001" -> "1", "016" -> "16")
 * so searching "1" or "01" or "001" matches code "001".
 */
export function stripLeadingZeros(codeClean: string): string {
  if (!codeClean) return '';
  if (/^\d+$/.test(codeClean)) {
    return codeClean.replace(/^0+/, '') || '0';
  }
  return codeClean;
}

/**
 * Cleans category or supplier names (trims trailing/leading spaces and collapses internal spaces).
 */
export function cleanCategoryName(raw?: string | null): string {
  if (!raw) return '';
  return String(raw).replace(/\s+/g, ' ').trim();
}

/**
 * Compares an item's category against the selected filter category, ignoring trailing spaces and case.
 */
export function matchesCategoryFilter(
  itemCategory?: string | null,
  selectedCategory?: string | null
): boolean {
  if (!selectedCategory || selectedCategory === 'all' || selectedCategory === 'Todas') {
    return true;
  }
  return normalizeSearchText(itemCategory) === normalizeSearchText(selectedCategory);
}

/**
 * Compares an item's supplier against the selected filter supplier, ignoring trailing spaces and case.
 */
export function matchesSupplierFilter(
  itemSupplier?: string | null,
  selectedSupplier?: string | null
): boolean {
  if (!selectedSupplier || selectedSupplier === 'all' || selectedSupplier === 'Todos') {
    return true;
  }
  return normalizeSearchText(itemSupplier) === normalizeSearchText(selectedSupplier);
}

/**
 * Smart multi-token, accent-insensitive, phonetic-tolerant search across
 * code (SKU), name, category, supplier, and size.
 */
export function matchesProductSearch(item: Product, rawQuery?: string | null): boolean {
  const query = normalizeSearchText(rawQuery);
  if (!query) return true;

  const itemCode = normalizeSearchText(item.code);
  const itemCodeClean = normalizeSkuCode(item.code);
  const queryCodeClean = normalizeSkuCode(query);

  // 1. Direct or clean SKU code match
  if (
    itemCode.includes(query) ||
    (queryCodeClean.length > 0 && itemCodeClean.includes(queryCodeClean))
  ) {
    return true;
  }

  // 2. Numeric SKU match ignoring leading zeros (e.g. "1" matches "001", "001" matches "1")
  if (/^\d+$/.test(queryCodeClean) && /^\d+$/.test(itemCodeClean)) {
    const qNum = stripLeadingZeros(queryCodeClean);
    const cNum = stripLeadingZeros(itemCodeClean);
    if (cNum === qNum || itemCodeClean.endsWith(queryCodeClean)) {
      return true;
    }
  }

  const itemName = normalizeSearchText(item.name);
  const itemCategory = normalizeSearchText(item.category);
  const itemSupplier = normalizeSearchText(item.supplier);
  const itemSize = normalizeSearchText(item.size);
  const itemColor = normalizeSearchText(
    [item.color || '', ...(Array.isArray(item.colors) ? item.colors : [])].join(' ')
  );

  const combinedStandard = `${itemCode} ${itemCodeClean} ${itemName} ${itemCategory} ${itemSupplier} ${itemSize} ${itemColor}`;
  if (combinedStandard.includes(query)) {
    return true;
  }

  const combinedPhonetic = normalizePhoneticText(combinedStandard);
  const queryPhonetic = normalizePhoneticText(query);
  if (queryPhonetic && combinedPhonetic.includes(queryPhonetic)) {
    return true;
  }

  // 3. Multi-word token matching in any order (standard + phonetic + numeric SKU)
  const tokens = query.split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    return tokens.every((token) => {
      if (combinedStandard.includes(token)) return true;

      const tokenClean = normalizeSkuCode(token);
      if (tokenClean && itemCodeClean.includes(tokenClean)) return true;

      if (/^\d+$/.test(tokenClean) && /^\d+$/.test(itemCodeClean)) {
        if (stripLeadingZeros(itemCodeClean) === stripLeadingZeros(tokenClean)) {
          return true;
        }
      }

      const tokenPhonetic = normalizePhoneticText(token);
      if (tokenPhonetic && combinedPhonetic.includes(tokenPhonetic)) return true;

      return false;
    });
  }

  return false;
}

/**
 * Computes relevance score when a user is actively searching so exact SKU/code
 * matches (e.g. "001" or "1" -> "001") and prefix matches appear first.
 */
export function scoreProductSearchRelevance(item: Product, rawQuery?: string | null): number {
  const query = normalizeSearchText(rawQuery);
  if (!query) return 0;

  const itemCode = normalizeSearchText(item.code);
  const itemCodeClean = normalizeSkuCode(item.code);
  const queryCodeClean = normalizeSkuCode(query);
  const itemName = normalizeSearchText(item.name);

  // Exact code match
  if (itemCode === query || (queryCodeClean && itemCodeClean === queryCodeClean)) {
    return 100;
  }

  // Numeric SKU exact match ignoring leading zeros (e.g. query "1" -> code "001")
  if (
    /^\d+$/.test(queryCodeClean) &&
    /^\d+$/.test(itemCodeClean) &&
    stripLeadingZeros(itemCodeClean) === stripLeadingZeros(queryCodeClean)
  ) {
    return 95;
  }

  // Code starts with query
  if (itemCode.startsWith(query) || (queryCodeClean && itemCodeClean.startsWith(queryCodeClean))) {
    return 85;
  }

  // Code contains query
  if (itemCode.includes(query) || (queryCodeClean && itemCodeClean.includes(queryCodeClean))) {
    return 75;
  }

  // Exact name match
  if (itemName === query) {
    return 70;
  }

  // Name starts with query
  if (itemName.startsWith(query)) {
    return 60;
  }

  // Name contains full query phrase
  if (itemName.includes(query) || normalizePhoneticText(itemName).includes(normalizePhoneticText(query))) {
    return 50;
  }

  return 30;
}
