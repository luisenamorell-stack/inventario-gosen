const BLOCKED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'applet',
  'svg',
  'math',
  'link',
  'meta',
  'base',
  'form',
  'input',
  'textarea',
  'select',
  'button',
]);

const SAFE_URL_PROTOCOLS = ['https:', 'http:', 'blob:'];

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSafeMediaOrLinkUrl(rawUrl: string): boolean {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('/')) return true;
  if (/^data:image\/(png|jpeg|jpg|webp|gif|bmp|x-icon);base64,/i.test(trimmed)) {
    return true;
  }
  try {
    const parsed = new URL(trimmed, 'https://localhost');
    return SAFE_URL_PROTOCOLS.includes(parsed.protocol);
  } catch {
    return false;
  }
}

function sanitizeInlineStyle(rawStyle: string): string {
  const cleaned = String(rawStyle || '')
    .replace(/expression\s*\([^)]*\)/gi, '')
    .replace(/javascript\s*:/gi, '')
    .replace(/vbscript\s*:/gi, '')
    .replace(/@import/gi, '')
    .replace(/url\s*\(\s*(['"]?)\s*(?:javascript:|vbscript:|data:text)/gi, 'url($1about:invalid');
  return cleaned;
}

export function extractPlainTextFromHtml(htmlString: string): string {
  const preformatted = String(htmlString || '')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, '   ')
    .replace(/<\/th>/gi, '   ');

  if (typeof DOMParser === 'undefined') {
    return preformatted.replace(/<[^>]*>/g, '');
  }

  const doc = new DOMParser().parseFromString(preformatted, 'text/html');
  return doc.body?.textContent || '';
}

export function sanitizePrintHtml(rawHtml: string): string {
  const html = String(rawHtml || '');
  if (!html) return '';
  if (typeof DOMParser === 'undefined') {
    return escapeHtml(html);
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const walkAndClean = (root: Element | DocumentFragment) => {
    const elements = Array.from(root.querySelectorAll('*'));
    for (const el of elements) {
      const tagName = el.tagName.toLowerCase();
      if (BLOCKED_TAGS.has(tagName)) {
        el.remove();
        continue;
      }

      for (const attr of Array.from(el.attributes)) {
        const attrName = attr.name.toLowerCase();
        const attrVal = attr.value || '';

        if (attrName.startsWith('on') || attrName === 'srcdoc' || attrName === 'formaction') {
          el.removeAttribute(attr.name);
          continue;
        }

        if (attrName === 'style') {
          el.setAttribute('style', sanitizeInlineStyle(attrVal));
          continue;
        }

        if (attrName === 'src' || attrName === 'href' || attrName === 'xlink:href') {
          if (!isSafeMediaOrLinkUrl(attrVal)) {
            el.removeAttribute(attr.name);
          }
        }
      }
    }
  };

  if (doc.body) {
    walkAndClean(doc.body);
    return doc.body.innerHTML;
  }
  return '';
}
