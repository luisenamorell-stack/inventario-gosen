import { StoreSettings } from '../types';

/**
 * Extracts a smart monogram / badge text from a store name.
 * Examples:
 * - "Comercial GYG" -> { topLabel: "COMERCIAL", mainText: "GYG" }
 * - "Tienda Gosén"  -> { topLabel: "TIENDA", mainText: "GSN" }
 * - "Inversiones López" -> { topLabel: "INVERSIONES", mainText: "IL" }
 */
export function extractStoreMonogram(storeName: string): { topLabel: string; mainText: string } {
  const cleaned = (storeName || 'Mi Tienda').trim().replace(/\s+/g, ' ');
  const words = cleaned.split(' ').filter(Boolean);

  if (words.length === 1) {
    const w = words[0].toUpperCase();
    return {
      topLabel: 'APP OFICIAL',
      mainText: w.slice(0, 4),
    };
  }

  // Check if the last word looks like a brand acronym/short name (2 to 4 chars, e.g. "GYG")
  const lastWord = words[words.length - 1];
  const prefixWords = words.slice(0, -1).join(' ').toUpperCase();
  if (lastWord.length >= 2 && lastWord.length <= 4) {
    return {
      topLabel: prefixWords.slice(0, 14) || 'TIENDA',
      mainText: lastWord.toUpperCase(),
    };
  }

  // Otherwise build 2-3 initials from significant words
  const stopWords = new Set(['DE', 'DEL', 'LA', 'LAS', 'EL', 'LOS', 'Y', 'E']);
  const significant = words.filter((w) => !stopWords.has(w.toUpperCase()));
  const source = significant.length >= 2 ? significant : words;
  const initials = source
    .slice(0, 3)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');

  return {
    topLabel: words[0].toUpperCase().slice(0, 14),
    mainText: initials || cleaned.slice(0, 3).toUpperCase(),
  };
}

/**
 * Synchronously generates a crisp square PNG Data URL with the store's monogram/brand name.
 * Used whenever a client store has not uploaded a custom logo image yet, ensuring
 * another tenant's logo (like Tienda Gosén) NEVER appears on their mobile home screen.
 */
export function generateMonogramIconDataUrl(storeName: string, size = 512): string {
  if (typeof document === 'undefined') return '/pwa-512x512.png';

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '/pwa-512x512.png';

  const { topLabel, mainText } = extractStoreMonogram(storeName);

  // 1. Rich dark slate + emerald gradient background
  const bgGrad = ctx.createLinearGradient(0, 0, size, size);
  bgGrad.addColorStop(0, '#0f172a'); // slate-900
  bgGrad.addColorStop(0.55, '#064e3b'); // emerald-950
  bgGrad.addColorStop(1, '#047857'); // emerald-700
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, size, size);

  // 2. Subtle inner glowing border frame
  const inset = Math.round(size * 0.065);
  const radius = Math.round(size * 0.18);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inset, inset, size - inset * 2, size - inset * 2, radius);
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.35)';
  ctx.lineWidth = Math.max(2, Math.round(size * 0.012));
  ctx.stroke();
  ctx.restore();

  // 3. Top decorative pill / label (e.g., "COMERCIAL")
  ctx.save();
  ctx.fillStyle = '#6ee7b7'; // emerald-300
  const topFontSize = Math.round(size * 0.075);
  ctx.font = `800 ${topFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(topLabel, size / 2, size * 0.27);
  ctx.restore();

  // 4. Main Monogram / Brand Acronym (e.g., "GYG")
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
  ctx.shadowBlur = Math.round(size * 0.04);
  ctx.shadowOffsetY = Math.round(size * 0.015);
  const charCount = mainText.length;
  const mainFontSize =
    charCount <= 2
      ? Math.round(size * 0.38)
      : charCount === 3
      ? Math.round(size * 0.31)
      : Math.round(size * 0.24);
  ctx.font = `900 ${mainFontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mainText, size / 2, size * 0.56);
  ctx.restore();

  // 5. Bottom subtle emerald accent bar
  const barWidth = Math.round(size * 0.36);
  const barHeight = Math.max(4, Math.round(size * 0.022));
  ctx.save();
  ctx.fillStyle = '#10b981'; // emerald-500
  ctx.beginPath();
  ctx.roundRect((size - barWidth) / 2, size * 0.8, barWidth, barHeight, barHeight / 2);
  ctx.fill();
  ctx.restore();

  return canvas.toDataURL('image/png');
}

/**
 * Generates a square PNG Data URL adapting any store logo (vertical, horizontal, or square)
 * cleanly onto a padded square canvas for Android & iOS home screen installation.
 * Falls back to the store's custom monogram if the store has no logo or if CORS blocks loading.
 */
export async function generateTenantAppIconDataUrl(
  storeName: string,
  logoUrl: string | undefined,
  isGosen: boolean,
  size = 512
): Promise<string> {
  const trimmedLogo = (logoUrl || '').trim();

  // If this is Tienda Gosén and no custom override logo is set, use the official Gosén icons
  if (!trimmedLogo && isGosen) {
    if (size <= 180) return '/apple-touch-icon.png';
    if (size <= 192) return '/pwa-192x192.png';
    return '/pwa-512x512.png';
  }

  // If this is a client store (e.g., Comercial GYG) and they haven't uploaded a logo yet,
  // generate a custom monogram icon with their store name/initials
  if (!trimmedLogo) {
    return generateMonogramIconDataUrl(storeName, size);
  }

  if (typeof document === 'undefined') {
    return trimmedLogo;
  }

  return new Promise<string>((resolve) => {
    const img = new Image();
    if (!trimmedLogo.startsWith('data:')) {
      img.crossOrigin = 'anonymous';
    }

    const timeoutId = window.setTimeout(() => {
      resolve(isGosen ? '/pwa-512x512.png' : generateMonogramIconDataUrl(storeName, size));
    }, 3500);

    img.onload = () => {
      window.clearTimeout(timeoutId);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(generateMonogramIconDataUrl(storeName, size));
          return;
        }

        // Fill clean white background so transparent or rectangular logos look crisp on iOS & Android
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);

        // Compute proportional object-contain fit inside an 84% safe zone
        const safePadding = Math.round(size * 0.08);
        const maxDrawW = size - safePadding * 2;
        const maxDrawH = size - safePadding * 2;

        const naturalW = img.naturalWidth || img.width || size;
        const naturalH = img.naturalHeight || img.height || size;
        const scale = Math.min(maxDrawW / naturalW, maxDrawH / naturalH);

        const drawW = Math.max(1, Math.round(naturalW * scale));
        const drawH = Math.max(1, Math.round(naturalH * scale));
        const offsetX = Math.round((size - drawW) / 2);
        const offsetY = Math.round((size - drawH) / 2);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, offsetX, offsetY, drawW, drawH);

        resolve(canvas.toDataURL('image/png'));
      } catch {
        // If canvas is tainted by external non-CORS URL, fall back to monogram
        resolve(isGosen ? '/pwa-512x512.png' : generateMonogramIconDataUrl(storeName, size));
      }
    };

    img.onerror = () => {
      window.clearTimeout(timeoutId);
      resolve(isGosen ? '/pwa-512x512.png' : generateMonogramIconDataUrl(storeName, size));
    };

    img.src = trimmedLogo;
  });
}

export function generateMiAppHNCashRegisterIconDataUrl(size = 512): string {
  if (typeof document === 'undefined') return '/pwa-512x512.png';

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '/pwa-512x512.png';

  // 1. Emerald rounded square gradient matching MIAPPHN official logo
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#20e395');
  grad.addColorStop(0.55, '#10b981');
  grad.addColorStop(1, '#059669');

  const r = Math.round(size * 0.22);
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  ctx.fillStyle = grad;
  ctx.fill();

  // 2. Draw Black Cash Register Silhouette (scaled from 100x100 coordinate space)
  const s = (v: number) => (v / 100) * size;
  ctx.strokeStyle = '#091310';
  ctx.fillStyle = '#091310';
  ctx.lineWidth = s(6.5);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Wireless signal arcs at top-right of screen
  ctx.beginPath();
  ctx.arc(s(59), s(33), s(11), -Math.PI / 2, 0);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(s(59), s(33), s(21), -Math.PI / 2, 0);
  ctx.stroke();

  // Top display monitor screen
  ctx.beginPath();
  ctx.roundRect(s(34), s(27), s(24), s(16), s(5.5));
  ctx.stroke();

  // Monitor stem
  ctx.beginPath();
  ctx.moveTo(s(46), s(43));
  ctx.lineTo(s(46), s(50));
  ctx.stroke();

  // Trapezoid keypad body
  ctx.beginPath();
  ctx.moveTo(s(32), s(50));
  ctx.lineTo(s(60), s(50));
  ctx.lineTo(s(68), s(69));
  ctx.lineTo(s(24), s(69));
  ctx.closePath();
  ctx.stroke();

  // 3 keypad dots
  [37, 46, 55].forEach((cx) => {
    ctx.beginPath();
    ctx.arc(s(cx), s(60), s(3.2), 0, Math.PI * 2);
    ctx.fill();
  });

  // Cash drawer base
  ctx.beginPath();
  ctx.roundRect(s(18), s(69), s(56), s(19), s(6.5));
  ctx.stroke();

  // Cash drawer slot
  ctx.beginPath();
  ctx.moveTo(s(38), s(78.5));
  ctx.lineTo(s(54), s(78.5));
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

let activeManifestBlobUrl: string | null = null;

/**
 * Dynamically updates the browser's PWA Web App Manifest, Apple Touch Icon, Favicon,
 * Document Title, and start_url so that installing the app on Android or iPhone
 * installs the active client's own brand, icon, and direct store URL (`/?empresa=...`).
 */
export async function syncDynamicPwaBranding(
  companyId: string,
  storeSettings: StoreSettings,
  options?: { isPublicCatalogMode?: boolean; isSalesLandingMode?: boolean }
): Promise<{
  icon192: string;
  icon512: string;
  appleIcon180: string;
  startUrl: string;
  storeName: string;
}> {
  const normalizedSlug = (companyId || 'gosen').trim().toLowerCase();
  const isGosen = normalizedSlug === 'gosen';
  const storeName = options?.isSalesLandingMode
    ? 'MIAPPHN'
    : (storeSettings?.storeName || '').trim() ||
      (isGosen ? 'Tienda Gosén' : normalizedSlug.toUpperCase());
  const tagline = options?.isSalesLandingMode
    ? 'Sistema POS, Inventario y Multi-Bodegas en la Nube'
    : (storeSettings?.tagline || '').trim() || 'Sistema de Inventario y Punto de Venta';

  // Build tenant-specific start path so launching from the mobile home screen
  // always boots directly into this client's isolated company workspace.
  const startPath = options?.isSalesLandingMode
    ? '/'
    : `/?empresa=${encodeURIComponent(normalizedSlug)}`;
  const fullStartUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${startPath}`
      : startPath;

  // Keep ?empresa=<slug> in the browser address bar for every store tenant
  // (unless on the dedicated ?saas=1 portal or official root sales landing page)
  // so each app link remains strictly separated.
  if (typeof window !== 'undefined' && !options?.isPublicCatalogMode && !options?.isSalesLandingMode) {
    try {
      const currentUrl = new URL(window.location.href);
      const isSaaSPortal =
        currentUrl.searchParams.get('saas') === '1' ||
        currentUrl.searchParams.get('saas') === 'true' ||
        currentUrl.searchParams.get('panel') === 'saas';
      const currentEmpresa = (currentUrl.searchParams.get('empresa') || '').trim().toLowerCase();
      if (!isSaaSPortal && currentEmpresa !== normalizedSlug) {
        currentUrl.searchParams.set('empresa', normalizedSlug);
        window.history.replaceState({}, '', currentUrl.toString());
      }
    } catch {
      // Ignore URL errors in restricted environments
    }
  }

  // Generate tenant-specific icons (or official MIAPPHN cash register icons when on the root portal)
  const [appleIcon180, icon192, icon512] = options?.isSalesLandingMode
    ? [
        generateMiAppHNCashRegisterIconDataUrl(180),
        generateMiAppHNCashRegisterIconDataUrl(192),
        generateMiAppHNCashRegisterIconDataUrl(512),
      ]
    : await Promise.all([
        generateTenantAppIconDataUrl(storeName, storeSettings?.logoUrl, isGosen, 180),
        generateTenantAppIconDataUrl(storeName, storeSettings?.logoUrl, isGosen, 192),
        generateTenantAppIconDataUrl(storeName, storeSettings?.logoUrl, isGosen, 512),
      ]);

  if (typeof document !== 'undefined') {
    // 1. Update Document Title & Mobile App Title Meta Tags
    const pageTitle = options?.isSalesLandingMode
      ? 'MIAPPHN | Sistema POS, Inventario y Multi-Bodegas en la Nube'
      : `${storeName} | ${tagline}`;
    document.title = pageTitle;

    const setMetaContent = (selector: string, content: string) => {
      const el = document.querySelector<HTMLMetaElement>(selector);
      if (el) el.setAttribute('content', content);
    };

    setMetaContent('meta[name="application-name"]', storeName);
    setMetaContent('meta[name="apple-mobile-web-app-title"]', storeName);
    setMetaContent('meta[property="og:title"]', pageTitle);

    // 2. Update Favicons
    const iconLinks = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="icon"], link[rel="shortcut icon"]'
    );
    iconLinks.forEach((link) => {
      link.href = icon192;
    });

    // 3. Replace <link rel="apple-touch-icon"> elements so iOS Safari immediately refreshes the icon preview
    const existingAppleIcons = document.querySelectorAll<HTMLLinkElement>(
      'link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]'
    );
    existingAppleIcons.forEach((el) => el.parentNode?.removeChild(el));

    const newAppleIcon = document.createElement('link');
    newAppleIcon.rel = 'apple-touch-icon';
    newAppleIcon.sizes = '180x180';
    newAppleIcon.href = appleIcon180;
    document.head.appendChild(newAppleIcon);

    // 4. Build dynamic Web App Manifest for Android / Chrome / Edge
    const shortName = storeName.length > 15 ? storeName.slice(0, 15).trim() : storeName;
    const dynamicManifest = {
      id: startPath,
      name: `${storeName} - ${tagline}`,
      short_name: shortName,
      description: `${tagline} — ${storeName}`,
      start_url: fullStartUrl,
      scope: typeof window !== 'undefined' ? `${window.location.origin}/` : '/',
      display: 'standalone',
      background_color: '#0f172a',
      theme_color: '#059669',
      orientation: 'any',
      categories: ['business', 'finance', 'productivity'],
      icons: [
        {
          src: icon192,
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: icon512,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: icon512,
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    };

    const manifestJsonString = JSON.stringify(dynamicManifest);

    // Also store in CacheStorage so the Service Worker can serve /manifest.json with the active tenant's manifest
    if ('caches' in window) {
      try {
        const cache = await caches.open('tienda-gosen-v8');
        await cache.put(
          new Request('/manifest.json'),
          new Response(manifestJsonString, {
            headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' },
          })
        );
      } catch {
        // Ignore CacheStorage errors
      }
    }

    // Update <link rel="manifest"> with a fresh Blob URL
    if (activeManifestBlobUrl) {
      URL.revokeObjectURL(activeManifestBlobUrl);
      activeManifestBlobUrl = null;
    }
    const blob = new Blob([manifestJsonString], { type: 'application/manifest+json' });
    activeManifestBlobUrl = URL.createObjectURL(blob);

    let manifestLink = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifestLink) {
      manifestLink = document.createElement('link');
      manifestLink.rel = 'manifest';
      document.head.appendChild(manifestLink);
    }
    manifestLink.href = activeManifestBlobUrl;
  }

  return {
    icon192,
    icon512,
    appleIcon180,
    startUrl: fullStartUrl,
    storeName,
  };
}
