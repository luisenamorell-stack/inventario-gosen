import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PrinterPaperFormat,
  StoreSettings,
  SaleRecord,
  PurchaseInvoice,
  CashRegisterShift,
  StoreExpenseRecord,
  GroupedAuditItem,
  Product,
  SubscriptionPaymentRecord,
  CompanyTenant,
} from '../types';
import {
  getConnectedPrinter,
  sendEscPosToConnectedPrinter,
  buildEscPosFromHtml,
  buildEscPosFromSale,
  buildTestPrintEscPos,
} from './printerHardwareService';

export interface PrinterFormatOption {
  id: PrinterPaperFormat;
  label: string;
  shortLabel: string;
  dimensions: string;
  description: string;
  printerTypes: string;
}

export const PRINTER_FORMAT_OPTIONS: PrinterFormatOption[] = [
  {
    id: '80mm',
    label: 'Impresora Térmica POS 80mm',
    shortLabel: 'Térmica 80mm',
    dimensions: 'Ancho 80mm × Rollo continuo',
    description: 'Estándar para impresoras térmicas de caja mostrador (Epson, Star, Bixolon, Xprinter).',
    printerTypes: 'USB / Bluetooth / Red / Wi-Fi',
  },
  {
    id: '58mm',
    label: 'Impresora Térmica Portátil 58mm',
    shortLabel: 'Térmica 58mm',
    dimensions: 'Ancho 58mm × Rollo compacto',
    description: 'Ideal para mini impresoras térmicas portátiles de bolsillo o entregas.',
    printerTypes: 'Bluetooth / USB Móvil / RawBT',
  },
  {
    id: 'half-letter',
    label: 'Media Carta / Factura Comercial',
    shortLabel: 'Media Carta',
    dimensions: '8.5" × 5.5" (216 × 140 mm)',
    description: 'Formato factura ejecutiva de mostrador a media página con tabla completa y firmas.',
    printerTypes: 'Láser / Inyección / Matricial',
  },
  {
    id: 'letter',
    label: 'Hoja Carta / A4 Ejecutiva (Oficina)',
    shortLabel: 'Hoja Carta / A4',
    dimensions: '8.5" × 11" (Carta / A4)',
    description: 'Documento corporativo completo para impresoras de oficina, contabilidad y PDF.',
    printerTypes: 'Impresoras HP, Epson, Canon, Brother',
  },
];

const STORAGE_KEY_PRINTER = 'gosen_preferred_printer_format';

export function getPreferredPrinterFormat(storeSettings?: StoreSettings): PrinterPaperFormat {
  if (storeSettings?.defaultPrinterFormat) {
    return storeSettings.defaultPrinterFormat;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEY_PRINTER) as PrinterPaperFormat | null;
    if (saved && ['80mm', '58mm', 'letter', 'half-letter'].includes(saved)) {
      return saved;
    }
  } catch {}
  return '80mm';
}

export function setPreferredPrinterFormat(format: PrinterPaperFormat): void {
  try {
    localStorage.setItem(STORAGE_KEY_PRINTER, format);
  } catch {}
}

export function formatCurrencyL(amount: number): string {
  const num = Number(amount) || 0;
  return `L. ${num.toLocaleString('es-HN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function getPaymentMethodLabel(method?: string): string {
  switch (method) {
    case 'cash':
    case 'efectivo':
      return 'Efectivo Contado';
    case 'card':
    case 'tarjeta':
      return 'Tarjeta POS / Débito / Crédito';
    case 'transfer':
    case 'transferencia':
      return 'Transferencia Bancaria';
    case 'credit':
      return 'Crédito / Cuenta por Cobrar';
    default:
      return method ? String(method).toUpperCase() : 'Efectivo Contado';
  }
}

// ============================================================================
// CONVERSOR DE NÚMEROS A LETRAS EN ESPAÑOL (SON: ... LEMPIRAS CON XX/100)
// ============================================================================
function convertTripletToWords(n: number): string {
  const unidades = [
    '',
    'UN',
    'DOS',
    'TRES',
    'CUATRO',
    'CINCO',
    'SEIS',
    'SIETE',
    'OCHO',
    'NUEVE',
    'DIEZ',
    'ONCE',
    'DOCE',
    'TRECE',
    'CATORCE',
    'QUINCE',
    'DIECISÉIS',
    'DIECISIETE',
    'DIECIOCHO',
    'DIECINUEVE',
    'VEINTE',
    'VEINTIÚN',
    'VEINTIDÓS',
    'VEINTITRÉS',
    'VEINTICUATRO',
    'VEINTICINCO',
    'VEINTISÉIS',
    'VEINTISIETE',
    'VEINTIOCHO',
    'VEINTINUEVE',
  ];
  const decenas = [
    '',
    'DIEZ',
    'VEINTE',
    'TREINTA',
    'CUARENTA',
    'CINCUENTA',
    'SESENTA',
    'SETENTA',
    'OCHENTA',
    'NOVENTA',
  ];
  const centenas = [
    '',
    'CIENTO',
    'DOSCIENTOS',
    'TRESCIENTOS',
    'CUATROCIENTOS',
    'QUINIENTOS',
    'SEISCIENTOS',
    'SETECIENTOS',
    'OCHOCIENTOS',
    'NOVECIENTOS',
  ];

  if (n === 0) return '';
  if (n === 100) return 'CIEN';

  const c = Math.floor(n / 100);
  const r = n % 100;
  let out = centenas[c];

  if (r > 0) {
    if (out) out += ' ';
    if (r < 30) {
      out += unidades[r];
    } else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      out += decenas[d];
      if (u > 0) {
        out += ` Y ${unidades[u]}`;
      }
    }
  }
  return out;
}

export function numberToSpanishWords(amount: number): string {
  const safe = Math.abs(Number(amount) || 0);
  const intPart = Math.floor(safe);
  const cents = Math.round((safe - intPart) * 100);
  const centsStr = String(cents).padStart(2, '0');

  if (intPart === 0) {
    return `SON: CERO LEMPIRAS CON ${centsStr}/100 M.N.`;
  }

  const millions = Math.floor(intPart / 1000000);
  const thousands = Math.floor((intPart % 1000000) / 1000);
  const ones = intPart % 1000;

  const parts: string[] = [];
  if (millions === 1) {
    parts.push('UN MILLÓN');
  } else if (millions > 1) {
    parts.push(`${convertTripletToWords(millions)} MILLONES`);
  }

  if (thousands === 1) {
    parts.push('UN MIL');
  } else if (thousands > 1) {
    parts.push(`${convertTripletToWords(thousands)} MIL`);
  }

  if (ones > 0) {
    parts.push(convertTripletToWords(ones));
  }

  const currencyWord = intPart === 1 ? 'LEMPIRA' : 'LEMPIRAS';
  return `SON: ${parts.join(' ')} ${currencyWord} CON ${centsStr}/100 M.N.`;
}

// ============================================================================
// CACHÉ DE LOGOTIPO EN BASE64 PARA PDF (SOPORTA URL, DATA URI Y FALLBACK)
// ============================================================================
const logoBase64Cache = new Map<string, string>();

export function preloadStoreLogoForPdf(logoUrl?: string): Promise<string | null> {
  const targetUrl = logoUrl || '/store-logo.jpg';
  if (logoBase64Cache.has(targetUrl)) {
    return Promise.resolve(logoBase64Cache.get(targetUrl) || null);
  }
  if (targetUrl.startsWith('data:image/')) {
    logoBase64Cache.set(targetUrl, targetUrl);
    return Promise.resolve(targetUrl);
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxDim = 240;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          canvas.width = Math.max(1, Math.round((img.width || 120) * scale));
          canvas.height = Math.max(1, Math.round((img.height || 120) * scale));
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const dataUrl = canvas.toDataURL('image/png');
            logoBase64Cache.set(targetUrl, dataUrl);
            resolve(dataUrl);
            return;
          }
        } catch {}
        resolve(null);
      };
      img.onerror = () => resolve(null);
      img.src = targetUrl;
    } catch {
      resolve(null);
    }
  });
}

// Preload default store logo immediately
if (typeof window !== 'undefined') {
  preloadStoreLogoForPdf('/store-logo.jpg');
}

function getCachedLogoDataUrl(storeSettings?: StoreSettings): string | null {
  const url = storeSettings?.logoUrl || '/store-logo.jpg';
  if (url.startsWith('data:image/')) return url;
  if (logoBase64Cache.has(url)) return logoBase64Cache.get(url) || null;
  // Trigger background preload for next call
  preloadStoreLogoForPdf(url);
  return logoBase64Cache.get('/store-logo.jpg') || null;
}

// ============================================================================
// MOTOR UNIVERSAL DE IMPRESIÓN SINCRÓNICA + HARDWARE DIRECTO (BLUETOOTH/USB)
// ============================================================================
/**
 * Prints any document reliably:
 * 1. If a Bluetooth, USB, Serial, or RawBT thermal printer is connected and format is thermal,
 *    sends ESC/POS commands directly to the printer.
 * 2. Mounts a top-level `#gosen-print-portal` with `@media print` CSS AND a synchronous iframe
 *    so `print()` executes immediately inside the user click gesture without being blocked by iframes.
 */
export function printHtmlDocument(
  htmlBody: string,
  title: string,
  format: PrinterPaperFormat,
  storeSettings?: StoreSettings,
  saleRecordForEscPos?: SaleRecord,
  sellerLabel?: string
): void {
  const isThermal58 = format === '58mm';
  const isThermal80 = format === '80mm';

  // 1. Check if a direct hardware printer (Bluetooth BLE / WebUSB / WebSerial / RawBT) is actively connected
  const connectedPrinter = getConnectedPrinter();
  if (
    connectedPrinter &&
    connectedPrinter.status === 'connected' &&
    (connectedPrinter.bridgeMode === 'direct-hardware' || connectedPrinter.type === 'rawbt') &&
    (isThermal58 || isThermal80)
  ) {
    const paperW = isThermal58 ? '58mm' : '80mm';
    const escPosBytes = saleRecordForEscPos
      ? buildEscPosFromSale(
          saleRecordForEscPos,
          storeSettings || { storeName: 'Tienda Gosén' },
          paperW,
          sellerLabel
        )
      : buildEscPosFromHtml(htmlBody, title, storeSettings, paperW);

    sendEscPosToConnectedPrinter(escPosBytes)
      .then((handled) => {
        if (!handled) {
          triggerSystemPrintNow(htmlBody, title, format);
        }
      })
      .catch((err) => {
        console.error('Error enviando a impresora directa, usando impresión del sistema:', err);
        triggerSystemPrintNow(htmlBody, title, format);
      });
    return;
  }

  // 2. If Network IP printer is configured, fire non-blocking ESC/POS packet to IP AND open system print spooler
  if (
    connectedPrinter &&
    connectedPrinter.status === 'connected' &&
    connectedPrinter.type === 'network' &&
    connectedPrinter.ipAddress &&
    (isThermal58 || isThermal80)
  ) {
    const paperW = isThermal58 ? '58mm' : '80mm';
    const escPosBytes = saleRecordForEscPos
      ? buildEscPosFromSale(
          saleRecordForEscPos,
          storeSettings || { storeName: 'Tienda Gosén' },
          paperW,
          sellerLabel
        )
      : buildEscPosFromHtml(htmlBody, title, storeSettings, paperW);
    sendEscPosToConnectedPrinter(escPosBytes).catch(() => {});
  }

  // 3. Synchronous System / OS Driver Print (works on USB/Bluetooth/Wi-Fi/LAN/AirPrint/Windows/Mac/Android/iOS)
  triggerSystemPrintNow(htmlBody, title, format);
}

export async function printTestPage(
  storeSettings?: StoreSettings,
  format: PrinterPaperFormat = '80mm'
): Promise<string> {
  const connected = getConnectedPrinter();
  const effectiveFormat = connected?.preferredFormat || format;

  if (
    connected &&
    connected.status === 'connected' &&
    (connected.bridgeMode === 'direct-hardware' || connected.type === 'rawbt')
  ) {
    const bytes = buildTestPrintEscPos(storeSettings, connected.paperWidth);
    const ok = await sendEscPosToConnectedPrinter(bytes);
    if (ok) {
      return `¡Ticket de prueba enviado directamente a "${connected.name}"!`;
    }
  }

  if (connected && connected.type === 'network' && connected.ipAddress) {
    const bytes = buildTestPrintEscPos(storeSettings, connected.paperWidth);
    sendEscPosToConnectedPrinter(bytes).catch(() => {});
  }

  const storeName = storeSettings?.storeName || 'Tienda Gosén';
  const printerNameLabel = connected?.name || 'Impresora Principal del Sistema';
  const connectionChannelLabel =
    connected?.type === 'bluetooth'
      ? 'Bluetooth POS Vinculado'
      : connected?.type === 'usb'
      ? 'Cable USB / Cola POS'
      : connected?.type === 'network'
      ? `Red Wi-Fi / IP ${connected.ipAddress || 'Local'}`
      : connected?.type === 'mobile-share'
      ? 'App de Impresora Móvil'
      : 'Cola de Impresión del Sistema';

  const testHtml = `
    <div style="text-align:center;border:2px solid #0f172a;border-radius:10px;padding:16px;">
      <div style="font-size:16px;font-weight:900;text-transform:uppercase;">${storeName}</div>
      <div style="font-size:12px;font-weight:800;color:#047857;margin-top:4px;">PRUEBA DE CONEXIÓN E IMPRESIÓN POS</div>
      <div class="dashed-line"></div>
      <div style="text-align:left;font-size:11px;margin:8px 0;line-height:1.6;">
        <div style="display:flex;justify-content:space-between;"><span>Impresora Activa:</span><strong>${printerNameLabel}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Canal de Enlace:</span><strong>${connectionChannelLabel}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Estado:</span><strong style="color:#047857;">CONECTADA Y LISTA ✓</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Formato de Papel:</span><strong>${effectiveFormat.toUpperCase()}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fecha y Hora:</span><span>${new Date().toLocaleString('es-HN')}</span></div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:11px;font-weight:700;margin-top:6px;">¡Su impresora está vinculada y lista para imprimir facturas, tickets y reportes!</div>
    </div>
  `;
  triggerSystemPrintNow(testHtml, `Prueba de Impresora - ${storeName}`, effectiveFormat);
  return `Enviando página de prueba a "${printerNameLabel}" (${effectiveFormat.toUpperCase()})...`;
}

/**
 * Generates a native PDF File and opens the mobile/OS Share Sheet (`navigator.share`)
 * so users on Android/iOS can send any receipt or invoice directly to NokoPrint, RawBT,
 * Epson iPrint, HP Smart, Canon PRINT, Brother, Mopria, or WhatsApp in 1 tap.
 */
export async function shareHtmlDocumentAsPdfToPrinterApp(
  htmlBody: string,
  title: string,
  format: PrinterPaperFormat,
  storeSettings?: StoreSettings
): Promise<boolean> {
  const isThermal58 = format === '58mm';
  const isThermal80 = format === '80mm';
  const isHalfLetter = format === 'half-letter';

  const doc = new jsPDF({
    orientation: isHalfLetter ? 'landscape' : 'portrait',
    unit: 'mm',
    format: isThermal58
      ? [58, 210]
      : isThermal80
      ? [80, 230]
      : isHalfLetter
      ? [140, 216]
      : 'letter',
  });

  const storeName = (storeSettings?.storeName || 'TIENDA GOSÉN').toUpperCase();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = isThermal58 ? 3 : isThermal80 ? 4 : 12;

  // Header
  let y = margin + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isThermal58 ? 10 : isThermal80 ? 11.5 : 14);
  doc.setTextColor(15, 23, 42);
  doc.text(storeName, pageWidth / 2, y, { align: 'center' });
  y += 4.5;

  if (storeSettings?.storeRtn) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal58 || isThermal80 ? 7.5 : 9);
    doc.text(`RTN: ${storeSettings.storeRtn}`, pageWidth / 2, y, { align: 'center' });
    y += 3.8;
  }
  if (storeSettings?.phone || storeSettings?.address) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(isThermal58 || isThermal80 ? 7 : 8.5);
    const contactLine = [storeSettings?.phone, storeSettings?.address].filter(Boolean).join(' • ');
    const wrappedContact = doc.splitTextToSize(contactLine, pageWidth - margin * 2);
    doc.text(wrappedContact, pageWidth / 2, y, { align: 'center' });
    y += wrappedContact.length * 3.5 + 1;
  }

  doc.setDrawColor(100, 116, 139);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageWidth - margin, y);
  y += 4.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(isThermal58 || isThermal80 ? 8.5 : 11);
  doc.text(title.toUpperCase(), pageWidth / 2, y, { align: 'center' });
  y += 5;

  // Extract structured lines from HTML
  const temp = document.createElement('div');
  temp.innerHTML = htmlBody
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/td>/gi, '   ')
    .replace(/<\/th>/gi, '   ');

  const lines = (temp.textContent || temp.innerText || '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  doc.setFont('courier', 'normal');
  doc.setFontSize(isThermal58 ? 7.2 : isThermal80 ? 8 : 9.5);
  const maxLineWidth = pageWidth - margin * 2;
  const pageHeight = doc.internal.pageSize.getHeight();

  for (const rawLine of lines) {
    const splitLines = doc.splitTextToSize(rawLine, maxLineWidth);
    for (const sl of splitLines) {
      if (y > pageHeight - 10) {
        doc.addPage();
        y = margin + 5;
      }
      const isTotal =
        /TOTAL NETO|SALDO PENDIENTE|FACTURA/i.test(sl);
      doc.setFont('courier', isTotal ? 'bold' : 'normal');
      doc.text(sl, margin, y);
      y += isThermal58 || isThermal80 ? 3.6 : 4.5;
    }
  }

  const pdfBlob = doc.output('blob');
  const safeFileName = `${title.replace(/[^a-zA-Z0-9_-]/g, '_')}_${format}.pdf`;
  const pdfFile = new File([pdfBlob], safeFileName, { type: 'application/pdf' });

  const nav = typeof navigator !== 'undefined' ? (navigator as any) : {};
  if (typeof nav.share === 'function') {
    try {
      if (!nav.canShare || nav.canShare({ files: [pdfFile] })) {
        await nav.share({
          title,
          text: `${title} (${storeSettings?.storeName || 'Tienda Gosén'})`,
          files: [pdfFile],
        });
        return true;
      }
    } catch (err: any) {
      if (String(err?.name || '').toLowerCase() === 'aborterror') {
        return true;
      }
    }
  }

  // Fallback: trigger direct download of the formatted PDF so user can open it in any printer app
  doc.save(safeFileName);
  return false;
}

function triggerSystemPrintNow(
  htmlBody: string,
  title: string,
  format: PrinterPaperFormat
): void {
  const isThermal58 = format === '58mm';
  const isThermal80 = format === '80mm';
  const isHalfLetter = format === 'half-letter';

  let pageSizeCss = 'size: letter portrait; margin: 10mm;';
  let containerMaxWidth = '780px';
  let baseFontSize = '12px';
  let fontFamily = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  if (isThermal58) {
    pageSizeCss = 'size: 58mm auto; margin: 0mm;';
    containerMaxWidth = '54mm';
    baseFontSize = '11px';
    fontFamily = "'Courier New', Courier, monospace";
  } else if (isThermal80) {
    pageSizeCss = 'size: 80mm auto; margin: 0mm;';
    containerMaxWidth = '74mm';
    baseFontSize = '12px';
    fontFamily = "'Courier New', Courier, monospace";
  } else if (isHalfLetter) {
    pageSizeCss = 'size: 8.5in 5.5in; margin: 8mm;';
    containerMaxWidth = '740px';
    baseFontSize = '11.5px';
  }

  const sharedCss = `
    @page {
      ${pageSizeCss}
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #0f172a !important;
      width: 100% !important;
      height: auto !important;
      overflow: visible !important;
    }
    .print-wrapper {
      width: 100%;
      max-width: ${containerMaxWidth};
      margin: 0 auto;
      font-family: ${fontFamily};
      font-size: ${baseFontSize};
      color: #0f172a;
      background: #ffffff;
      line-height: 1.38;
      padding: ${isThermal58 ? '2mm' : isThermal80 ? '3mm' : '0'};
    }
    .print-wrapper table {
      width: 100%;
      border-collapse: collapse;
    }
    .print-wrapper th, .print-wrapper td {
      padding: ${isThermal58 || isThermal80 ? '3px 2px' : '6px 8px'};
      text-align: left;
      vertical-align: top;
    }
    .print-wrapper .text-right { text-align: right; }
    .print-wrapper .text-center { text-align: center; }
    .print-wrapper .font-bold { font-weight: 700; }
    .print-wrapper .font-black { font-weight: 900; }
    .print-wrapper .dashed-line {
      border-top: 1px dashed #334155;
      margin: 6px 0;
    }
    .print-wrapper .solid-line {
      border-top: 2px solid #0f172a;
      margin: 8px 0;
    }
    .print-wrapper .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      border: 1px solid #cbd5e1;
    }
    .print-wrapper .kpi-grid {
      display: grid;
      grid-template-columns: repeat(${isThermal58 || isThermal80 ? '2' : '4'}, 1fr);
      gap: 8px;
      margin: 12px 0;
    }
    .print-wrapper .kpi-box {
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px;
      background: #f8fafc;
    }
    .print-wrapper .kpi-label {
      font-size: 9px;
      text-transform: uppercase;
      color: #475569;
      font-weight: 700;
    }
    .print-wrapper .kpi-value {
      font-size: ${isThermal58 || isThermal80 ? '13px' : '16px'};
      font-weight: 800;
      color: #0f172a;
      margin-top: 2px;
    }
    .print-wrapper .signatures {
      display: flex;
      justify-content: space-around;
      margin-top: 28px;
      padding-top: 14px;
      gap: 24px;
    }
    .print-wrapper .sig-block {
      flex: 1;
      max-width: 220px;
      text-align: center;
    }
    .print-wrapper .sig-line {
      border-bottom: 1px solid #334155;
      height: 26px;
      margin-bottom: 4px;
    }
  `;

  // 1. Mount top-level @media print portal on document.body
  let portalStyle = document.getElementById('gosen-print-portal-style') as HTMLStyleElement | null;
  if (!portalStyle) {
    portalStyle = document.createElement('style');
    portalStyle.id = 'gosen-print-portal-style';
    document.head.appendChild(portalStyle);
  }
  portalStyle.textContent = `
    #gosen-print-portal {
      display: none;
    }
    @media print {
      body > *:not(#gosen-print-portal) {
        display: none !important;
      }
      html, body {
        background: #ffffff !important;
        margin: 0 !important;
        padding: 0 !important;
        height: auto !important;
        overflow: visible !important;
      }
      #gosen-print-portal {
        display: block !important;
        width: 100% !important;
        background: #ffffff !important;
      }
      ${sharedCss}
    }
  `;

  let portalContainer = document.getElementById('gosen-print-portal');
  if (!portalContainer) {
    portalContainer = document.createElement('div');
    portalContainer.id = 'gosen-print-portal';
    document.body.appendChild(portalContainer);
  }
  portalContainer.innerHTML = `<div class="print-wrapper">${htmlBody}</div>`;

  // 2. Also mount an isolated synchronous print iframe so Chrome/Edge/Safari print ONLY the clean document
  let printIframe = document.getElementById('gosen-isolated-print-frame') as HTMLIFrameElement | null;
  if (printIframe && printIframe.parentNode) {
    printIframe.parentNode.removeChild(printIframe);
  }
  printIframe = document.createElement('iframe');
  printIframe.id = 'gosen-isolated-print-frame';
  printIframe.style.position = 'fixed';
  printIframe.style.right = '0';
  printIframe.style.bottom = '0';
  printIframe.style.width = '1px';
  printIframe.style.height = '1px';
  printIframe.style.border = '0';
  printIframe.style.opacity = '0.01';
  printIframe.style.pointerEvents = 'none';
  document.body.appendChild(printIframe);

  const prevTitle = document.title;
  document.title = title;

  let printedViaIframe = false;
  try {
    const frameDoc = printIframe.contentDocument || printIframe.contentWindow?.document;
    const frameWin = printIframe.contentWindow;
    if (frameDoc && frameWin) {
      frameDoc.open();
      frameDoc.write(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <style>${sharedCss}</style>
</head>
<body>
  <div class="print-wrapper">${htmlBody}</div>
</body>
</html>`);
      frameDoc.close();
      frameWin.focus();
      frameWin.print();
      printedViaIframe = true;
    }
  } catch (iframeErr) {
    console.warn('Fallback to top-level window.print():', iframeErr);
  }

  if (!printedViaIframe) {
    try {
      window.focus();
      window.print();
    } catch (err) {
      console.error('Error al invocar window.print():', err);
    }
  }

  setTimeout(() => {
    document.title = prevTitle;
  }, 800);
}

// ============================================================================
// UTILIDADES DE DISEÑO EJECUTIVO PARA PDF (CABECERA, LOGO, SELLO, QR Y PIE)
// ============================================================================
function drawDeterministicQrCode(
  doc: jsPDF,
  x: number,
  y: number,
  size: number,
  seedString: string
): void {
  const cells = 15;
  const cellSize = size / cells;
  doc.setDrawColor(203, 213, 225);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(x - 1, y - 1, size + 2, size + 2, 1.2, 1.2, 'FD');

  // Hash seed
  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const isFinderCorner = (r: number, c: number) => {
    const topL = r < 4 && c < 4;
    const topR = r < 4 && c >= cells - 4;
    const botL = r >= cells - 4 && c < 4;
    return topL || topR || botL;
  };

  doc.setFillColor(15, 23, 42);
  // Draw finder squares
  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const border = r === 0 || r === 3 || c === 0 || c === 3;
        const center = r >= 1 && r <= 2 && c >= 1 && c <= 2;
        if (border || center) {
          doc.rect(x + (c0 + c) * cellSize, y + (r0 + r) * cellSize, cellSize, cellSize, 'F');
        }
      }
    }
  };
  drawFinder(0, 0);
  drawFinder(0, cells - 4);
  drawFinder(cells - 4, 0);

  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (isFinderCorner(r, c)) continue;
      const bit = ((hash >>> ((r * cells + c) % 28)) ^ (r * 7 + c * 13)) & 1;
      if (bit === 1) {
        doc.rect(x + c * cellSize, y + r * cellSize, cellSize, cellSize, 'F');
      }
    }
  }
}

interface ExecutiveHeaderOptions {
  storeSettings: StoreSettings;
  documentTitle: string;
  documentNumber?: string;
  dateLabel: string;
  statusBadge?: {
    text: string;
    bgRgb: [number, number, number];
    textRgb: [number, number, number];
  };
  accentRgb?: [number, number, number];
}

function drawExecutivePdfHeader(doc: jsPDF, opts: ExecutiveHeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const accent = opts.accentRgb || [4, 120, 87]; // Emerald default
  const storeName = (opts.storeSettings.storeName || 'TIENDA GOSÉN').toUpperCase();

  // Top Luxury Accent Bar
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 4.5, 'F');
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 4.5, pageWidth, 1.5, 'F');

  let y = 11;
  const logoData = getCachedLogoDataUrl(opts.storeSettings);
  const logoBoxSize = 18;
  const textStartX = 14 + logoBoxSize + 4;

  // Draw Logo or Executive Monogram Emblem
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(14, y - 2, logoBoxSize, logoBoxSize, 2.5, 2.5, 'FD');

  let logoDrawn = false;
  if (logoData) {
    try {
      doc.addImage(logoData, 'PNG', 15, y - 1, logoBoxSize - 2, logoBoxSize - 2, undefined, 'FAST');
      logoDrawn = true;
    } catch {}
  }
  if (!logoDrawn) {
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(15.2, y - 0.8, logoBoxSize - 2.4, logoBoxSize - 2.4, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(255, 255, 255);
    const initials = storeName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('');
    doc.text(initials || 'TG', 14 + logoBoxSize / 2, y + 8.5, { align: 'center' });
  }

  // Store Identity Block (Left)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14.5);
  doc.setTextColor(15, 23, 42);
  doc.text(storeName, textStartX, y + 3.5);

  let infoY = y + 7.8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (opts.storeSettings.tagline) {
    doc.text(opts.storeSettings.tagline, textStartX, infoY);
    infoY += 3.8;
  }

  const fiscalParts = [
    opts.storeSettings.storeRtn ? `RTN: ${opts.storeSettings.storeRtn}` : '',
    opts.storeSettings.phone ? `Tel/WhatsApp: ${opts.storeSettings.phone}` : '',
  ].filter(Boolean);
  if (fiscalParts.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(51, 65, 85);
    doc.text(fiscalParts.join('   •   '), textStartX, infoY);
    infoY += 3.8;
  }

  if (opts.storeSettings.address) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Dirección: ${opts.storeSettings.address}`, textStartX, infoY);
    infoY += 3.8;
  }

  // Right Document Badge Box
  const boxWidth = 74;
  const boxX = pageWidth - 14 - boxWidth;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, y - 2, boxWidth, 19, 2, 2, 'FD');

  // Top Header Strip inside Document Box
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.roundedRect(boxX, y - 2, boxWidth, 5.8, 2, 2, 'F');
  doc.rect(boxX, y + 1.8, boxWidth, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(255, 255, 255);
  doc.text(opts.documentTitle.toUpperCase(), boxX + boxWidth / 2, y + 2, { align: 'center' });

  if (opts.documentNumber) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(opts.documentNumber, boxX + boxWidth / 2, y + 9, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(opts.dateLabel, boxX + boxWidth / 2, y + 13.5, { align: 'center' });

  // Status Stamp if provided
  if (opts.statusBadge) {
    const badgeW = 36;
    const badgeX = boxX - badgeW - 3;
    doc.setFillColor(
      opts.statusBadge.bgRgb[0],
      opts.statusBadge.bgRgb[1],
      opts.statusBadge.bgRgb[2]
    );
    doc.setDrawColor(
      opts.statusBadge.textRgb[0],
      opts.statusBadge.textRgb[1],
      opts.statusBadge.textRgb[2]
    );
    doc.roundedRect(badgeX, y - 1, badgeW, 6.5, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(
      opts.statusBadge.textRgb[0],
      opts.statusBadge.textRgb[1],
      opts.statusBadge.textRgb[2]
    );
    doc.text(opts.statusBadge.text.toUpperCase(), badgeX + badgeW / 2, y + 3.3, {
      align: 'center',
    });
  }

  const bottomHeaderY = Math.max(infoY + 2, y + 20);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.4);
  doc.line(14, bottomHeaderY, pageWidth - 14, bottomHeaderY);

  return bottomHeaderY + 4;
}

function drawExecutiveKpiCards(
  doc: jsPDF,
  startY: number,
  cards: Array<{
    label: string;
    value: string;
    subtext?: string;
    valueRgb?: [number, number, number];
  }>
): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const totalWidth = pageWidth - 28;
  const gap = 3.5;
  const count = cards.length;
  const cardWidth = (totalWidth - gap * (count - 1)) / count;
  const cardHeight = 15.5;

  cards.forEach((c, idx) => {
    const x = 14 + idx * (cardWidth + gap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, startY, cardWidth, cardHeight, 2, 2, 'FD');

    // Left accent stripe
    const rgb = c.valueRgb || [15, 23, 42];
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.roundedRect(x, startY, 1.6, cardHeight, 1, 1, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text(c.label.toUpperCase(), x + 4, startY + 4.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.text(c.value, x + 4, startY + 10.2);

    if (c.subtext) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(100, 116, 139);
      doc.text(c.subtext, x + 4, startY + 13.8);
    }
  });

  return startY + cardHeight + 5;
}

function drawPdfPageFooters(doc: jsPDF, storeSettings: StoreSettings, docLabel: string): void {
  const pageCount = (doc as any).internal.getNumberOfPages();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const footerMsg =
    storeSettings.receiptFooterText ||
    'Documento oficial emitido por el Sistema de Punto de Venta, Inventario y Finanzas.';

  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.line(14, pageHeight - 12, pageWidth - 14, pageHeight - 12);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(100, 116, 139);
    doc.text(`${storeName}  •  ${footerMsg.slice(0, 85)}`, 14, pageHeight - 7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(
      `${docLabel}  |  Página ${i} de ${pageCount}`,
      pageWidth - 14,
      pageHeight - 7.5,
      { align: 'right' }
    );
  }
}

// ============================================================================
// 1. FACTURA / TICKET DE VENTA (HTML + PDF EJECUTIVO DE ALTA GAMA)
// ============================================================================
export function buildSaleDocumentHtml(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat,
  sellerLabel?: string
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const footerText =
    storeSettings.receiptFooterText ||
    '¡Gracias por su compra! Conserve este comprobante para cualquier cambio o garantía.';
  const itemsSaved = (sale.items || []).reduce(
    (sum, it) => sum + (Number(it.unitDiscount) || 0) * it.quantity,
    0
  );
  const balanceDue =
    sale.balanceDue !== undefined
      ? Number(sale.balanceDue)
      : sale.paymentMethod === 'credit'
      ? Math.max(0, sale.total - (sale.amountPaid || 0))
      : 0;
  const amountWords = numberToSpanishWords(sale.total);

  if (isThermal) {
    return `
      <div class="text-center">
        ${
          storeSettings.logoUrl
            ? `<img src="${storeSettings.logoUrl}" alt="${storeName}" style="width:48px;height:48px;object-fit:contain;margin:0 auto 4px;display:block;border-radius:6px;" />`
            : ''
        }
        <div style="font-size:${format === '58mm' ? '13px' : '15px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        ${storeSettings.tagline ? `<div style="font-size:10px;color:#334155;">${storeSettings.tagline}</div>` : ''}
        ${storeSettings.storeRtn ? `<div style="font-size:10px;font-weight:700;">RTN: ${storeSettings.storeRtn}</div>` : ''}
        ${storeSettings.address ? `<div style="font-size:10px;">${storeSettings.address}</div>` : ''}
        ${storeSettings.phone ? `<div style="font-size:10px;">Tel: ${storeSettings.phone}</div>` : ''}
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${format === '58mm' ? '10px' : '11px'};">
        <div style="display:flex;justify-content:space-between;"><span>Documento:</span><strong>${sale.paymentMethod === 'credit' ? 'FACTURA CRÉDITO' : 'FACTURA / TICKET'}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>N° Comprobante:</span><strong>${sale.saleNumber}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fecha y Hora:</span><span>${sale.date}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Cliente:</span><strong>${sale.customerName || 'Consumidor Final'}</strong></div>
        ${sale.customerRtn ? `<div style="display:flex;justify-content:space-between;"><span>RTN / DNI:</span><span>${sale.customerRtn}</span></div>` : ''}
        ${sale.customerPhone ? `<div style="display:flex;justify-content:space-between;"><span>Teléfono:</span><span>${sale.customerPhone}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>Atendido por:</span><span>${sellerLabel || sale.cashier || 'Administrador'}</span></div>
        ${sale.status === 'cancelled' ? `<div style="text-align:center;font-weight:900;border:1px solid #000;padding:3px;margin-top:4px;">*** VENTA ANULADA ***</div>` : ''}
      </div>
      <div class="dashed-line"></div>
      <table style="font-size:${format === '58mm' ? '10px' : '11px'};">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th>CANT / DESCRIPCIÓN</th>
            <th class="text-right">SUBTOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${(sale.items || [])
            .map((it) => {
              const disc = Number(it.unitDiscount) || 0;
              return `
                <tr>
                  <td style="padding-top:4px;">
                    <strong>${it.quantity}x</strong> ${it.name}${it.size ? ` (${it.size})` : ''}
                    <div style="font-size:9.5px;color:#334155;">
                      Cód: ${it.code} • @ ${formatCurrencyL(it.price)}
                      ${disc > 0 ? ` (Desc -${formatCurrencyL(disc)} c/u)` : ''}
                    </div>
                  </td>
                  <td class="text-right font-bold" style="padding-top:4px;white-space:nowrap;">${formatCurrencyL(it.subtotal)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
      <div class="dashed-line"></div>
      <div style="font-size:${format === '58mm' ? '10.5px' : '11.5px'};">
        <div style="display:flex;justify-content:space-between;"><span>Artículos Totales:</span><span>${sale.totalItems} uds</span></div>
        ${itemsSaved > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Ahorro artículos:</span><span>-${formatCurrencyL(itemsSaved)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>${formatCurrencyL(sale.subtotal)}</span></div>
        ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Descuento:</span><span>-${formatCurrencyL(sale.discount)}</span></div>` : ''}
        ${sale.tax > 0 ? `<div style="display:flex;justify-content:space-between;"><span>15% ISV:</span><span>${formatCurrencyL(sale.tax)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:${format === '58mm' ? '13px' : '14px'};font-weight:900;border-top:1px dashed #000;padding-top:4px;margin-top:4px;">
          <span>TOTAL NETO:</span>
          <span>${formatCurrencyL(sale.total)}</span>
        </div>
        <div style="font-size:9px;margin-top:3px;font-weight:700;">${amountWords}</div>
        <div style="display:flex;justify-content:space-between;margin-top:4px;">
          <span>Método Pago:</span>
          <strong>${getPaymentMethodLabel(sale.paymentMethod)}</strong>
        </div>
        ${
          sale.paymentMethod === 'cash'
            ? `
              <div style="display:flex;justify-content:space-between;"><span>Efectivo Recibido:</span><span>${formatCurrencyL(sale.amountPaid)}</span></div>
              <div style="display:flex;justify-content:space-between;font-weight:700;"><span>Cambio Entregado:</span><span>${formatCurrencyL(sale.change)}</span></div>
            `
            : ''
        }
        ${
          sale.paymentMethod === 'credit'
            ? `
              <div style="display:flex;justify-content:space-between;"><span>Abonado a la fecha:</span><span>${formatCurrencyL(sale.amountPaid || 0)}</span></div>
              <div style="display:flex;justify-content:space-between;font-weight:900;"><span>SALDO PENDIENTE:</span><span>${formatCurrencyL(balanceDue)}</span></div>
              ${sale.creditDueDate ? `<div style="display:flex;justify-content:space-between;"><span>Fecha Vencimiento:</span><span>${sale.creditDueDate}</span></div>` : ''}
            `
            : ''
        }
      </div>
      ${sale.notes ? `<div class="dashed-line"></div><div style="font-size:10px;"><strong>Nota:</strong> ${sale.notes}</div>` : ''}
      <div class="dashed-line"></div>
      <div class="text-center" style="font-size:10px;margin-top:6px;">
        <div>${footerText}</div>
      </div>
    `;
  }

  // Formal Letter / Half-Letter Executive Commercial Invoice HTML
  return `
    <div style="border:1px solid #cbd5e1;border-radius:12px;padding:${format === 'half-letter' ? '16px' : '24px'};background:#ffffff;">
      <div style="height:5px;background:linear-gradient(90deg,#0f172a 0%,#047857 100%);border-radius:6px;margin-bottom:14px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;gap:16px;">
        <div style="display:flex;gap:14px;align-items:center;">
          ${
            storeSettings.logoUrl
              ? `<img src="${storeSettings.logoUrl}" alt="${storeName}" style="width:62px;height:62px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;padding:3px;background:#fff;" />`
              : `<div style="width:56px;height:56px;border-radius:10px;background:#0f172a;color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;">${storeName.slice(0, 2).toUpperCase()}</div>`
          }
          <div>
            <h1 style="margin:0;font-size:21px;font-weight:900;text-transform:uppercase;color:#0f172a;letter-spacing:-0.02em;">${storeName}</h1>
            ${storeSettings.tagline ? `<div style="font-size:11.5px;color:#475569;font-weight:600;">${storeSettings.tagline}</div>` : ''}
            ${storeSettings.storeRtn ? `<div style="font-size:11px;color:#0f172a;margin-top:2px;">RTN: <strong>${storeSettings.storeRtn}</strong></div>` : ''}
            <div style="font-size:11px;color:#475569;">
              ${[storeSettings.address, storeSettings.phone ? `Tel: ${storeSettings.phone}` : ''].filter(Boolean).join('  •  ')}
            </div>
          </div>
        </div>
        <div style="text-align:right;min-width:210px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;">
          <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:${sale.paymentMethod === 'credit' ? '#b45309' : '#047857'};">
            ${sale.paymentMethod === 'credit' ? 'FACTURA AL CRÉDITO' : 'FACTURA COMERCIAL DE VENTA'}
          </div>
          <div style="font-size:17px;font-weight:900;font-family:monospace;margin-top:3px;color:#0f172a;">N° ${sale.saleNumber}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">Fecha: <strong>${sale.date}</strong></div>
          <div style="margin-top:4px;">
            <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:9.5px;font-weight:800;background:${
              sale.status === 'cancelled'
                ? '#fee2e2;color:#b91c1c'
                : sale.paymentMethod === 'credit' && balanceDue > 0
                ? '#fef3c7;color:#b45309'
                : '#d1fae5;color:#047857'
            };">
              ${
                sale.status === 'cancelled'
                  ? 'ANULADA'
                  : sale.paymentMethod === 'credit' && balanceDue > 0
                  ? 'CRÉDITO PENDIENTE'
                  : 'PAGADO CONTADO'
              }
            </span>
          </div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:11.5px;">
        <div style="space-y:3px;">
          <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:3px;">DATOS DEL CLIENTE</div>
          <div><span style="color:#64748b;">Nombre / Razón Social:</span> <strong>${sale.customerName || 'Consumidor Final'}</strong></div>
          <div><span style="color:#64748b;">RTN / Identidad:</span> <strong>${sale.customerRtn || 'Consumidor Final'}</strong></div>
          <div><span style="color:#64748b;">Teléfono / WhatsApp:</span> <strong>${sale.customerPhone || 'No registrado'}</strong></div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:3px;">CONDICIONES DE LA TRANSACCIÓN</div>
          <div><span style="color:#64748b;">Modalidad de Pago:</span> <strong>${getPaymentMethodLabel(sale.paymentMethod)}</strong></div>
          <div><span style="color:#64748b;">Vendedor / Cajero:</span> <strong>${sellerLabel || sale.cashier || 'Administrador'}</strong></div>
          <div><span style="color:#64748b;">Fecha Vencimiento:</span> <strong>${sale.creditDueDate || 'Inmediato (Contado)'}</strong></div>
        </div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:11px;margin-bottom:14px;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th style="width:6%;" class="text-center">#</th>
            <th style="width:15%;">CÓDIGO / SKU</th>
            <th style="width:39%;">DESCRIPCIÓN DEL ARTÍCULO</th>
            <th class="text-center" style="width:8%;">CANT.</th>
            <th class="text-right" style="width:11%;">PRECIO BASE</th>
            <th class="text-right" style="width:9%;">DESC.</th>
            <th class="text-right" style="width:12%;">SUBTOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${(sale.items || [])
            .map((it, i) => {
              const disc = Number(it.unitDiscount) || 0;
              const orig = it.originalPrice !== undefined ? Number(it.originalPrice) : it.price + disc;
              return `
                <tr style="border-bottom:1px solid #e2e8f0;background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td class="text-center" style="color:#64748b;">${i + 1}</td>
                  <td style="font-family:monospace;font-weight:700;">${it.code}</td>
                  <td>
                    <strong>${it.name}</strong>${it.size ? ` <span style="color:#475569;">(Talla: ${it.size})</span>` : ''}
                  </td>
                  <td class="text-center font-bold">${it.quantity}</td>
                  <td class="text-right">${formatCurrencyL(orig)}</td>
                  <td class="text-right" style="color:${disc > 0 ? '#e11d48' : '#64748b'};">${disc > 0 ? `-${formatCurrencyL(disc)}` : 'L. 0.00'}</td>
                  <td class="text-right font-bold">${formatCurrencyL(it.subtotal)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">
        <div style="flex:1;font-size:11px;color:#334155;">
          <div style="padding:8px 12px;background:#f1f5f9;border-left:3px solid #0f172a;border-radius:4px;font-weight:800;color:#0f172a;margin-bottom:8px;">
            ${amountWords}
          </div>
          <div><strong>Total Unidades Facturadas:</strong> ${sale.totalItems} ${sale.totalItems === 1 ? 'unidad' : 'unidades'} (${(sale.items || []).length} líneas)</div>
          ${sale.notes ? `<div style="margin-top:6px;padding:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;"><strong>Observaciones:</strong> ${sale.notes}</div>` : ''}
          <div style="margin-top:8px;font-size:10px;color:#64748b;">${footerText}</div>
        </div>
        <div style="width:280px;border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;background:#f8fafc;font-size:11.5px;">
          ${itemsSaved > 0 ? `<div style="display:flex;justify-content:space-between;color:#e11d48;margin-bottom:4px;"><span>Ahorro en Artículos:</span><span>-${formatCurrencyL(itemsSaved)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal Gravado / Exento:</span><strong>${formatCurrencyL(sale.subtotal)}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Descuento General:</span><span style="color:${sale.discount > 0 ? '#e11d48' : '#475569'};">-${formatCurrencyL(sale.discount || 0)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Impuesto (15% ISV):</span><strong>${formatCurrencyL(sale.tax || 0)}</strong></div>
          <div style="display:flex;justify-content:space-between;border-top:2px solid #0f172a;padding-top:6px;margin-top:4px;font-size:15px;font-weight:900;color:#047857;">
            <span>TOTAL NETO:</span>
            <span>${formatCurrencyL(sale.total)}</span>
          </div>
          ${
            sale.paymentMethod === 'cash'
              ? `
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px;padding-top:4px;border-top:1px dashed #cbd5e1;"><span>Efectivo Recibido:</span><strong>${formatCurrencyL(sale.amountPaid)}</strong></div>
                <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;color:#047857;"><span>Cambio Entregado:</span><span>${formatCurrencyL(sale.change)}</span></div>
              `
              : ''
          }
          ${
            sale.paymentMethod === 'credit'
              ? `
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px;padding-top:4px;border-top:1px dashed #cbd5e1;"><span>Abonado a la Fecha:</span><strong>${formatCurrencyL(sale.amountPaid || 0)}</strong></div>
                <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:900;color:#b45309;margin-top:2px;"><span>SALDO PENDIENTE:</span><span>${formatCurrencyL(balanceDue)}</span></div>
              `
              : ''
          }
        </div>
      </div>

      <div class="signatures" style="margin-top:${format === 'half-letter' ? '18px' : '30px'};">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;">Firma / Sello Autorizado ${storeName}</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;">Firma de Recibido Conforme Cliente</div>
        </div>
      </div>
    </div>
  `;
}

export async function downloadSalePdf(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat = 'letter',
  sellerLabel?: string
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const isThermal = format === '80mm' || format === '58mm';
  const itemsSaved = (sale.items || []).reduce(
    (sum, it) => sum + (Number(it.unitDiscount) || 0) * it.quantity,
    0
  );
  const balanceDue =
    sale.balanceDue !== undefined
      ? Number(sale.balanceDue)
      : sale.paymentMethod === 'credit'
      ? Math.max(0, sale.total - (sale.amountPaid || 0))
      : 0;
  const amountWords = numberToSpanishWords(sale.total);

  if (isThermal) {
    const pageWidth = format === '58mm' ? 58 : 80;
    const estimatedHeight = Math.max(175, 135 + (sale.items?.length || 1) * 15);
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pageWidth, estimatedHeight],
    });

    const marginX = format === '58mm' ? 3 : 4.5;
    const contentWidth = pageWidth - marginX * 2;
    let y = 6;

    // Logo in Thermal PDF
    const logoData = getCachedLogoDataUrl(storeSettings);
    if (logoData) {
      try {
        const logoW = format === '58mm' ? 14 : 18;
        doc.addImage(logoData, 'PNG', (pageWidth - logoW) / 2, y, logoW, logoW, undefined, 'FAST');
        y += logoW + 4;
      } catch {}
    }

    doc.setFont('courier', 'bold');
    doc.setFontSize(format === '58mm' ? 9.5 : 11.5);
    doc.text(storeName.toUpperCase(), pageWidth / 2, y, { align: 'center' });
    y += 4;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.2);
    if (storeSettings.tagline) {
      doc.text(storeSettings.tagline.slice(0, 38), pageWidth / 2, y, { align: 'center' });
      y += 3.2;
    }
    if (storeSettings.storeRtn) {
      doc.text(`RTN: ${storeSettings.storeRtn}`, pageWidth / 2, y, { align: 'center' });
      y += 3.2;
    }
    if (storeSettings.address) {
      const addrLines = doc.splitTextToSize(storeSettings.address, contentWidth);
      doc.text(addrLines, pageWidth / 2, y, { align: 'center' });
      y += addrLines.length * 3.1;
    }
    if (storeSettings.phone) {
      doc.text(`Tel: ${storeSettings.phone}`, pageWidth / 2, y, { align: 'center' });
      y += 3.5;
    }

    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 3.8;

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.8);
    doc.text(
      sale.paymentMethod === 'credit' ? 'FACTURA AL CREDITO' : 'FACTURA / COMPROBANTE',
      pageWidth / 2,
      y,
      { align: 'center' }
    );
    y += 3.8;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.text(`No: ${sale.saleNumber}`, marginX, y);
    y += 3.4;
    doc.text(`Fecha: ${sale.date}`, marginX, y);
    y += 3.4;
    doc.text(`Cliente: ${(sale.customerName || 'Consumidor Final').slice(0, 30)}`, marginX, y);
    y += 3.4;
    if (sale.customerRtn) {
      doc.text(`RTN/ID: ${sale.customerRtn}`, marginX, y);
      y += 3.4;
    }
    if (sale.customerPhone) {
      doc.text(`Tel: ${sale.customerPhone}`, marginX, y);
      y += 3.4;
    }
    doc.text(`Atendio: ${(sellerLabel || sale.cashier || 'Admin').slice(0, 26)}`, marginX, y);
    y += 3.4;

    doc.line(marginX, y, pageWidth - marginX, y);
    y += 3.8;

    doc.setFont('courier', 'bold');
    doc.text('CANT  DESCRIPCION', marginX, y);
    doc.text('TOTAL', pageWidth - marginX, y, { align: 'right' });
    y += 3.4;
    doc.setFont('courier', 'normal');

    (sale.items || []).forEach((it) => {
      const label = `${it.quantity}x ${it.name}${it.size ? ` (${it.size})` : ''}`;
      const lines = doc.splitTextToSize(label, contentWidth - 18);
      doc.setFont('courier', 'bold');
      doc.text(lines, marginX, y);
      doc.text(formatCurrencyL(it.subtotal), pageWidth - marginX, y, { align: 'right' });
      y += lines.length * 3.3;
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.8);
      doc.text(
        `Cod: ${it.code} @ ${formatCurrencyL(it.price)}${
          Number(it.unitDiscount) > 0 ? ` (-${formatCurrencyL(Number(it.unitDiscount))})` : ''
        }`,
        marginX + 2,
        y
      );
      doc.setFontSize(7.5);
      y += 3.6;
    });

    doc.line(marginX, y, pageWidth - marginX, y);
    y += 3.8;

    if (itemsSaved > 0) {
      doc.text('Ahorro articulos:', marginX, y);
      doc.text(`-${formatCurrencyL(itemsSaved)}`, pageWidth - marginX, y, { align: 'right' });
      y += 3.4;
    }
    doc.text('Subtotal:', marginX, y);
    doc.text(formatCurrencyL(sale.subtotal), pageWidth - marginX, y, { align: 'right' });
    y += 3.4;

    if (sale.discount > 0) {
      doc.text('Descuento:', marginX, y);
      doc.text(`-${formatCurrencyL(sale.discount)}`, pageWidth - marginX, y, { align: 'right' });
      y += 3.4;
    }
    if (sale.tax > 0) {
      doc.text('15% ISV:', marginX, y);
      doc.text(formatCurrencyL(sale.tax), pageWidth - marginX, y, { align: 'right' });
      y += 3.4;
    }

    doc.setFont('courier', 'bold');
    doc.setFontSize(9.5);
    doc.text('TOTAL NETO:', marginX, y + 0.5);
    doc.text(formatCurrencyL(sale.total), pageWidth - marginX, y + 0.5, { align: 'right' });
    y += 4.5;

    doc.setFontSize(6.6);
    const wordLines = doc.splitTextToSize(amountWords, contentWidth);
    doc.text(wordLines, marginX, y);
    y += wordLines.length * 3 + 1.5;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.text(`Pago: ${getPaymentMethodLabel(sale.paymentMethod)}`, marginX, y);
    y += 3.5;

    if (sale.paymentMethod === 'cash') {
      doc.text(`Efectivo Recibido: ${formatCurrencyL(sale.amountPaid)}`, marginX, y);
      y += 3.4;
      doc.setFont('courier', 'bold');
      doc.text(`Cambio Entregado: ${formatCurrencyL(sale.change)}`, marginX, y);
      y += 3.8;
    } else if (sale.paymentMethod === 'credit') {
      doc.text(`Abonado: ${formatCurrencyL(sale.amountPaid || 0)}`, marginX, y);
      y += 3.4;
      doc.setFont('courier', 'bold');
      doc.text(`SALDO PENDIENTE: ${formatCurrencyL(balanceDue)}`, marginX, y);
      y += 3.8;
    }

    drawDeterministicQrCode(doc, (pageWidth - 18) / 2, y + 1, 18, `${sale.saleNumber}-${sale.total}`);
    y += 22;

    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    const footLines = doc.splitTextToSize(
      storeSettings.receiptFooterText || '¡Gracias por su preferencia!',
      contentWidth
    );
    doc.text(footLines, pageWidth / 2, y, { align: 'center' });

    doc.save(`Ticket_${sale.saleNumber}.pdf`);
    return;
  }

  // Executive Letter / Half-Letter Commercial Invoice PDF
  const doc = new jsPDF({
    orientation: format === 'half-letter' ? 'landscape' : 'portrait',
    unit: 'mm',
    format: format === 'half-letter' ? [140, 216] : 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const isCredit = sale.paymentMethod === 'credit';

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: isCredit ? 'FACTURA AL CRÉDITO' : 'FACTURA COMERCIAL DE VENTA',
    documentNumber: `N° ${sale.saleNumber}`,
    dateLabel: `Emisión: ${sale.date}`,
    accentRgb: isCredit ? [180, 83, 9] : [4, 120, 87],
    statusBadge:
      sale.status === 'cancelled'
        ? { text: 'ANULADA', bgRgb: [254, 226, 226], textRgb: [185, 28, 28] }
        : isCredit && balanceDue > 0
        ? { text: 'CRÉDITO ACTIVO', bgRgb: [254, 243, 199], textRgb: [180, 83, 9] }
        : { text: 'PAGADO', bgRgb: [209, 250, 229], textRgb: [4, 120, 87] },
  });

  // Customer & Transaction Metadata Box (2 columns)
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, pageWidth - 28, 22, 2, 2, 'FD');

  // Vertical divider inside customer box
  const midX = pageWidth / 2 + 4;
  doc.setDrawColor(226, 232, 240);
  doc.line(midX, y + 2, midX, y + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(100, 116, 139);
  doc.text('INFORMACIÓN DEL CLIENTE', 18, y + 4.5);
  doc.text('DETALLES DE LA OPERACIÓN', midX + 4, y + 4.5);

  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.text(`Cliente: ${sale.customerName || 'Consumidor Final'}`, 18, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(51, 65, 85);
  doc.text(`RTN / Identidad: ${sale.customerRtn || 'Consumidor Final'}`, 18, y + 14.2);
  doc.text(`Teléfono / WhatsApp: ${sale.customerPhone || 'No registrado'}`, 18, y + 18.8);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Método de Pago: ${getPaymentMethodLabel(sale.paymentMethod)}`, midX + 4, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  doc.text(`Atendido por: ${sellerLabel || sale.cashier || 'Administrador'}`, midX + 4, y + 14.2);
  doc.text(
    `Condición / Vencimiento: ${
      isCredit ? `Crédito (Vence: ${sale.creditDueDate || 'Por definir'})` : 'Contado Inmediato'
    }`,
    midX + 4,
    y + 18.8
  );

  y += 26;

  // Complete Itemized Table
  autoTable(doc, {
    startY: y,
    head: [
      [
        '#',
        'Código / SKU',
        'Descripción del Producto / Talla',
        'Cant.',
        'Precio Base',
        'Desc. Unit.',
        'Precio Neto',
        'Subtotal Línea',
      ],
    ],
    body: (sale.items || []).map((it, idx) => {
      const unitDisc = Number(it.unitDiscount) || 0;
      const origPrice =
        it.originalPrice !== undefined ? Number(it.originalPrice) : Number(it.price) + unitDisc;
      return [
        String(idx + 1),
        it.code || '-',
        `${it.name}${it.size ? ` (Talla: ${it.size})` : ''}`,
        String(it.quantity),
        formatCurrencyL(origPrice),
        unitDisc > 0 ? `-${formatCurrencyL(unitDisc)}` : 'L. 0.00',
        formatCurrencyL(it.price),
        formatCurrencyL(it.subtotal),
      ];
    }),
    theme: 'grid',
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: 255,
      fontSize: 8,
      fontStyle: 'bold',
      halign: 'left',
    },
    bodyStyles: { fontSize: 8, textColor: [30, 41, 59] },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 24, fontStyle: 'bold' },
      3: { halign: 'center', cellWidth: 13, fontStyle: 'bold' },
      4: { halign: 'right', cellWidth: 23 },
      5: { halign: 'right', cellWidth: 21 },
      6: { halign: 'right', cellWidth: 23 },
      7: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  let summaryY = (doc as any).lastAutoTable.finalY + 5;
  const pageHeight = doc.internal.pageSize.getHeight();
  if (summaryY + 55 > pageHeight - 16) {
    doc.addPage();
    summaryY = 18;
  }

  // Left Column: Amount in Words + QR + Payment Details + Notes
  const leftColWidth = pageWidth - 28 - 78;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, summaryY, leftColWidth, 10, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(amountWords, 17, summaryY + 6.3);

  // QR + Verification Block
  const qrY = summaryY + 13;
  drawDeterministicQrCode(doc, 15, qrY, 22, `${storeName}|${sale.saleNumber}|${sale.total}`);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('RESUMEN DE PAGO Y VERIFICACIÓN', 41, qrY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Artículos facturados: ${sale.totalItems} uds (${(sale.items || []).length} productos)`,
    41,
    qrY + 8.5
  );

  if (sale.paymentMethod === 'cash') {
    doc.text(
      `Efectivo Recibido: ${formatCurrencyL(sale.amountPaid)}   |   Cambio Entregado: ${formatCurrencyL(sale.change)}`,
      41,
      qrY + 13
    );
  } else if (isCredit) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text(
      `Abonado: ${formatCurrencyL(sale.amountPaid || 0)}   |   SALDO PENDIENTE: ${formatCurrencyL(balanceDue)}`,
      41,
      qrY + 13
    );
  } else {
    doc.text(`Pago confirmado vía ${getPaymentMethodLabel(sale.paymentMethod)}`, 41, qrY + 13);
  }

  if (sale.notes) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    doc.text(`Observaciones: ${sale.notes.slice(0, 75)}`, 41, qrY + 17.5);
  }

  // Right Column: Financial Breakdown Box
  const finBoxW = 74;
  const finBoxX = pageWidth - 14 - finBoxW;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(finBoxX, summaryY, finBoxW, 36, 2, 2, 'FD');

  let fy = summaryY + 5.5;
  const labelX = finBoxX + 4;
  const valX = finBoxX + finBoxW - 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal Bruto:', labelX, fy);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrencyL(sale.subtotal + itemsSaved), valX, fy, { align: 'right' });
  fy += 4.8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(225, 29, 72);
  doc.text('Descuentos Aplicados:', labelX, fy);
  doc.setFont('helvetica', 'bold');
  doc.text(`-${formatCurrencyL(itemsSaved + (sale.discount || 0))}`, valX, fy, { align: 'right' });
  fy += 4.8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal Neto:', labelX, fy);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrencyL(sale.subtotal - (sale.discount || 0)), valX, fy, { align: 'right' });
  fy += 4.8;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(71, 85, 105);
  doc.text('Impuesto (15% ISV):', labelX, fy);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrencyL(sale.tax || 0), valX, fy, { align: 'right' });
  fy += 3.5;

  // Total Bar inside Financial Box
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(finBoxX + 2, fy, finBoxW - 4, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL L.:', labelX + 1, fy + 6.5);
  doc.setFontSize(11);
  doc.setTextColor(110, 231, 183);
  doc.text(formatCurrencyL(sale.total), valX - 1, fy + 6.5, { align: 'right' });

  let afterSummaryY = summaryY + 42;

  // If Credit Sale has installment payments, show table of abonos
  if (isCredit && (sale.creditPayments || []).length > 0) {
    autoTable(doc, {
      startY: afterSummaryY,
      head: [['Historial de Abonos — Fecha', 'Método de Pago', 'Recibido por', 'Nota', 'Monto Abonado']],
      body: (sale.creditPayments || []).map((cp) => [
        cp.date,
        getPaymentMethodLabel(cp.paymentMethod),
        cp.receivedBy || 'Caja',
        cp.notes || '-',
        formatCurrencyL(cp.amount),
      ]),
      theme: 'grid',
      headStyles: { fillColor: [180, 83, 9], textColor: 255, fontSize: 7.8 },
      bodyStyles: { fontSize: 7.8 },
      columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    afterSummaryY = (doc as any).lastAutoTable.finalY + 8;
  }

  // Signatures Block
  if (afterSummaryY + 22 < pageHeight - 16) {
    const sigY = afterSummaryY + 14;
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.35);
    doc.line(32, sigY, 92, sigY);
    doc.line(pageWidth - 92, sigY, pageWidth - 32, sigY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`FIRMA Y SELLO ${storeName.toUpperCase()}`, 62, sigY + 4.2, { align: 'center' });
    doc.text('FIRMA RECIBIDO CONFORME CLIENTE', pageWidth - 62, sigY + 4.2, { align: 'center' });
  }

  drawPdfPageFooters(doc, storeSettings, `Factura ${sale.saleNumber}`);
  doc.save(`Factura_${sale.saleNumber}.pdf`);
}

// ============================================================================
// 2. COMPROBANTE / FACTURA DE COMPRA A PROVEEDOR (HTML + PDF EJECUTIVO)
// ============================================================================
export function buildPurchaseInvoiceHtml(
  invoice: PurchaseInvoice,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const amountWords = numberToSpanishWords(invoice.total);

  if (isThermal) {
    return `
      <div class="text-center">
        <div style="font-size:14px;font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:10px;font-weight:700;">COMPROBANTE DE COMPRA / RECEPCIÓN</div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:10.5px;">
        <div style="display:flex;justify-content:space-between;"><span>Factura Prov:</span><strong>${invoice.invoiceNumber}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Proveedor:</span><strong>${invoice.supplierName}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fecha:</span><span>${invoice.date}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Condición:</span><span>${invoice.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}</span></div>
      </div>
      <div class="dashed-line"></div>
      <table style="font-size:10px;">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th>CANT / PRODUCTO</th>
            <th class="text-right">COSTO TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${(invoice.items || [])
            .map(
              (it) => `
              <tr>
                <td>
                  <strong>${it.quantity}x</strong> ${it.name}
                  <div style="font-size:9px;color:#334155;">${it.code} • @ ${formatCurrencyL(it.cost)}</div>
                </td>
                <td class="text-right font-bold">${formatCurrencyL(it.subtotal)}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
      <div class="dashed-line"></div>
      <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:900;">
        <span>TOTAL COMPRA:</span>
        <span>${formatCurrencyL(invoice.total)}</span>
      </div>
    `;
  }

  return `
    <div style="border:1px solid #cbd5e1;border-radius:12px;padding:22px;background:#ffffff;">
      <div style="height:5px;background:linear-gradient(90deg,#1e1b4b 0%,#4338ca 100%);border-radius:6px;margin-bottom:14px;"></div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
        <div>
          <h1 style="margin:0;font-size:20px;font-weight:900;text-transform:uppercase;">${storeName}</h1>
          <div style="font-size:12px;font-weight:800;color:#4338ca;">ORDEN DE RECEPCIÓN DE MERCADERÍA Y FACTURA DE COMPRA</div>
          <div style="font-size:11px;color:#475569;">${[storeSettings.storeRtn ? `RTN: ${storeSettings.storeRtn}` : '', storeSettings.address, storeSettings.phone].filter(Boolean).join(' • ')}</div>
        </div>
        <div style="text-align:right;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:15px;font-weight:900;font-family:monospace;">Factura N° ${invoice.invoiceNumber}</div>
          <div style="font-size:11px;color:#475569;">Fecha de Recepción: <strong>${invoice.date}</strong></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:11.5px;">
        <div>
          <div><span style="color:#64748b;">Proveedor Comercial:</span> <strong>${invoice.supplierName}</strong></div>
          <div><span style="color:#64748b;">Recibido en Bodega por:</span> <strong>${invoice.receivedBy || 'Administrador'}</strong></div>
        </div>
        <div style="text-align:right;">
          <div><span style="color:#64748b;">Condición de Pago:</span> <strong>${invoice.paymentCondition === 'credit' ? 'CRÉDITO PROVEEDOR' : 'CONTADO PAGADO'}</strong></div>
          <div><span style="color:#64748b;">Fecha Vencimiento:</span> <strong>${invoice.dueDate || 'Inmediato'}</strong></div>
        </div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:11px;margin-bottom:14px;">
        <thead>
          <tr style="background:#1e1b4b;color:#ffffff;">
            <th>#</th>
            <th>CÓDIGO</th>
            <th>ARTÍCULO INGRESADO AL INVENTARIO</th>
            <th class="text-center">CANT.</th>
            <th class="text-right">COSTO UNIT.</th>
            <th class="text-right">PRECIO VENTA</th>
            <th class="text-right">SUBTOTAL COSTO</th>
          </tr>
        </thead>
        <tbody>
          ${(invoice.items || [])
            .map(
              (it, idx) => `
              <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td>${idx + 1}</td>
                <td style="font-family:monospace;font-weight:700;">${it.code}</td>
                <td><strong>${it.name}</strong>${it.size ? ` (${it.size})` : ''}${it.category ? ` <span style="color:#64748b;">• ${it.category}</span>` : ''}</td>
                <td class="text-center font-bold">${it.quantity}</td>
                <td class="text-right">${formatCurrencyL(it.cost)}</td>
                <td class="text-right" style="color:#047857;">${formatCurrencyL(it.salePrice || (it as any).price || 0)}</td>
                <td class="text-right font-bold">${formatCurrencyL(it.subtotal)}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;">
        <div style="flex:1;font-size:11px;color:#475569;">
          <div style="padding:7px 10px;background:#f1f5f9;border-left:3px solid #1e1b4b;font-weight:800;color:#0f172a;margin-bottom:6px;">${amountWords}</div>
          <strong>Unidades Ingresadas al Stock:</strong> ${invoice.totalItems} unidades (${(invoice.items || []).length} referencias)
          ${invoice.notes ? `<div style="margin-top:6px;"><strong>Observaciones:</strong> ${invoice.notes}</div>` : ''}
        </div>
        <div style="width:260px;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc;font-size:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal Costo:</span><strong>${formatCurrencyL(invoice.subtotal)}</strong></div>
          <div style="display:flex;justify-content:space-between;color:#e11d48;margin-bottom:4px;"><span>Descuento Proveedor:</span><span>-${formatCurrencyL(invoice.discount || 0)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>15% ISV Compra:</span><strong>${formatCurrencyL(invoice.tax || 0)}</strong></div>
          <div style="display:flex;justify-content:space-between;border-top:2px solid #0f172a;padding-top:6px;font-size:14px;font-weight:900;color:#1e1b4b;">
            <span>TOTAL COMPRA:</span>
            <span>${formatCurrencyL(invoice.total)}</span>
          </div>
        </div>
      </div>

      <div class="signatures">
        <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Recibido Conforme Bodega</div></div>
        <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Autorizado Administración</div></div>
      </div>
    </div>
  `;
}

export async function downloadPurchaseInvoicePdf(
  invoice: PurchaseInvoice,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'FACTURA DE COMPRA / INGRESO',
    documentNumber: `N° ${invoice.invoiceNumber}`,
    dateLabel: `Fecha Compra: ${invoice.date}`,
    accentRgb: [67, 56, 202],
    statusBadge:
      invoice.status === 'cancelled'
        ? { text: 'ANULADA', bgRgb: [254, 226, 226], textRgb: [185, 28, 28] }
        : invoice.paymentCondition === 'credit'
        ? { text: 'CRÉDITO PROV.', bgRgb: [254, 243, 199], textRgb: [180, 83, 9] }
        : { text: 'PAGADO', bgRgb: [224, 231, 255], textRgb: [67, 56, 202] },
  });

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, pageWidth - 28, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Proveedor: ${invoice.supplierName}`, 18, y + 6.5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  doc.text(`Recibido en Inventario por: ${invoice.receivedBy || 'Administrador'}`, 18, y + 12.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Condición: ${invoice.paymentCondition === 'credit' ? 'CRÉDITO A PROVEEDOR' : 'CONTADO'}`,
    pageWidth - 18,
    y + 6.5,
    { align: 'right' }
  );
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Vencimiento: ${invoice.dueDate || 'Inmediato'}  |  Unidades: ${invoice.totalItems} uds`,
    pageWidth - 18,
    y + 12.5,
    { align: 'right' }
  );
  y += 23;

  autoTable(doc, {
    startY: y,
    head: [
      [
        '#',
        'Código / SKU',
        'Artículo Ingresado',
        'Categoría / Talla',
        'Cant.',
        'Costo Unit.',
        'Precio Venta',
        'Subtotal Costo',
      ],
    ],
    body: (invoice.items || []).map((it, idx) => [
      String(idx + 1),
      it.code,
      it.name,
      [it.category, it.size ? `Talla ${it.size}` : ''].filter(Boolean).join(' • ') || 'General',
      String(it.quantity),
      formatCurrencyL(it.cost),
      formatCurrencyL(it.salePrice || (it as any).price || 0),
      formatCurrencyL(it.subtotal),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 27, 75], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 9 },
      1: { cellWidth: 24, fontStyle: 'bold' },
      4: { halign: 'center', cellWidth: 14, fontStyle: 'bold' },
      5: { halign: 'right', cellWidth: 24 },
      6: { halign: 'right', cellWidth: 24 },
      7: { halign: 'right', cellWidth: 27, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable.finalY + 6;
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, finalY, pageWidth - 28 - 72, 10, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(numberToSpanishWords(invoice.total), 17, finalY + 6.3);

  const boxW = 68;
  const boxX = pageWidth - 14 - boxW;
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(boxX, finalY, boxW, 24, 2, 2, 'FD');
  doc.setFontSize(8.2);
  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', boxX + 4, finalY + 6);
  doc.text(formatCurrencyL(invoice.subtotal), boxX + boxW - 4, finalY + 6, { align: 'right' });
  doc.text('Descuento / ISV:', boxX + 4, finalY + 11.5);
  doc.text(
    `-${formatCurrencyL(invoice.discount || 0)} / +${formatCurrencyL(invoice.tax || 0)}`,
    boxX + boxW - 4,
    finalY + 11.5,
    { align: 'right' }
  );
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(67, 56, 202);
  doc.text('TOTAL COMPRA:', boxX + 4, finalY + 19.5);
  doc.text(formatCurrencyL(invoice.total), boxX + boxW - 4, finalY + 19.5, { align: 'right' });

  drawPdfPageFooters(doc, storeSettings, `Compra ${invoice.invoiceNumber}`);
  doc.save(`Factura_Compra_${invoice.invoiceNumber}.pdf`);
}

// ============================================================================
// 3. REPORTE DE HISTORIAL DE VENTAS Y GANANCIAS (HTML + PDF EJECUTIVO)
// ============================================================================
export interface SalesReportSummary {
  periodLabel: string;
  count: number;
  itemsSold: number;
  revenue: number;
  totalCost: number;
  profit: number;
  marginPct: number;
}

export function buildSalesReportHtml(
  salesList: SaleRecord[],
  summary: SalesReportSummary,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const nowStr = new Date().toLocaleString('es-HN');

  if (isThermal) {
    return `
      <div class="text-center">
        <div style="font-size:14px;font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:11px;font-weight:700;">REPORTE DE VENTAS Y GANANCIAS</div>
        <div style="font-size:9.5px;">Período: ${summary.periodLabel}</div>
        <div style="font-size:9px;color:#475569;">Emitido: ${nowStr}</div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:10.5px;">
        <div style="display:flex;justify-content:space-between;"><span>Ventas Completadas:</span><strong>${summary.count}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Artículos Vendidos:</span><strong>${summary.itemsSold}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Total Facturado:</span><strong>${formatCurrencyL(summary.revenue)}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Costo Mercadería:</span><span>${formatCurrencyL(summary.totalCost)}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:900;border-top:1px dashed #000;padding-top:3px;margin-top:3px;">
          <span>GANANCIA BRUTA:</span>
          <span>${formatCurrencyL(summary.profit)} (${(Number(summary.marginPct) || 0).toFixed(1)}%)</span>
        </div>
      </div>
      <div class="dashed-line"></div>
      <table style="font-size:9.5px;">
        <thead>
          <tr style="border-bottom:1px solid #000;">
            <th>FACTURA / CLIENTE</th>
            <th class="text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${salesList
            .slice(0, 120)
            .map(
              (s) => `
              <tr>
                <td>
                  <strong>${s.saleNumber}</strong> (${s.date.split(',')[0]})
                  <div style="font-size:8.5px;">${s.customerName || 'Consumidor Final'}</div>
                </td>
                <td class="text-right font-bold">${formatCurrencyL(s.total)}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }

  return `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
        <div>
          <h1 style="margin:0;font-size:20px;font-weight:900;text-transform:uppercase;">${storeName}</h1>
          <div style="font-size:13px;font-weight:800;color:#047857;">REPORTE EJECUTIVO DE VENTAS Y RENTABILIDAD</div>
          <div style="font-size:11px;color:#475569;">Filtro / Período: <strong>${summary.periodLabel}</strong></div>
        </div>
        <div style="text-align:right;font-size:11px;color:#475569;">
          <div>Fecha de Emisión: <strong>${nowStr}</strong></div>
          <div>Total Registros: <strong>${salesList.length}</strong></div>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-box">
          <div class="kpi-label">Ventas Válidas</div>
          <div class="kpi-value">${summary.count} (${summary.itemsSold} arts.)</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Ingresos Facturados</div>
          <div class="kpi-value" style="color:#047857;">${formatCurrencyL(summary.revenue)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Costo de Mercadería</div>
          <div class="kpi-value">${formatCurrencyL(summary.totalCost)}</div>
        </div>
        <div class="kpi-box">
          <div class="kpi-label">Ganancia Bruta (${(Number(summary.marginPct) || 0).toFixed(1)}%)</div>
          <div class="kpi-value" style="color:#0f766e;">${formatCurrencyL(summary.profit)}</div>
        </div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:10.5px;">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th>N° VENTA</th>
            <th>FECHA Y HORA</th>
            <th>CLIENTE / RTN</th>
            <th>VENDEDOR</th>
            <th>MÉTODO</th>
            <th class="text-center">ARTS.</th>
            <th class="text-right">TOTAL FACTURADO</th>
          </tr>
        </thead>
        <tbody>
          ${salesList
            .map(
              (s, idx) => `
              <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="font-family:monospace;font-weight:700;">${s.saleNumber}</td>
                <td>${s.date}</td>
                <td><strong>${s.customerName || 'Consumidor Final'}</strong>${s.customerRtn ? `<div style="font-size:9px;color:#64748b;">RTN: ${s.customerRtn}</div>` : ''}</td>
                <td>${s.cashier || 'Admin'}</td>
                <td>${getPaymentMethodLabel(s.paymentMethod)}</td>
                <td class="text-center font-bold">${s.totalItems}</td>
                <td class="text-right font-bold">${s.status === 'cancelled' ? `<span style="text-decoration:line-through;color:#94a3b8;">${formatCurrencyL(s.total)}</span>` : formatCurrencyL(s.total)}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadSalesReportPdf(
  salesList: SaleRecord[],
  summary: SalesReportSummary,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'REPORTE DE VENTAS Y RENTABILIDAD',
    documentNumber: `PERÍODO: ${summary.periodLabel.toUpperCase()}`,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [4, 120, 87],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Ventas Válidas',
      value: `${summary.count} ventas`,
      subtext: `${summary.itemsSold} unidades vendidas`,
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Ingresos Facturados',
      value: formatCurrencyL(summary.revenue),
      subtext: 'Ventas brutas del período',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Costo de Mercadería',
      value: formatCurrencyL(summary.totalCost),
      subtext: 'Costo de inventario vendido',
      valueRgb: [71, 85, 105],
    },
    {
      label: 'Utilidad Bruta',
      value: formatCurrencyL(summary.profit),
      subtext: `Margen rentable: ${(Number(summary.marginPct) || 0).toFixed(1)}%`,
      valueRgb: [13, 148, 136],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ['N° Factura', 'Fecha y Hora', 'Cliente', 'RTN / Tel', 'Vendedor', 'Método Pago', 'Uds', 'Total Factura'],
    ],
    body: salesList.map((s) => [
      s.saleNumber,
      s.date,
      s.customerName || 'Consumidor Final',
      [s.customerRtn, s.customerPhone].filter(Boolean).join(' • ') || '-',
      s.cashier || 'Admin',
      getPaymentMethodLabel(s.paymentMethod),
      String(s.totalItems),
      s.status === 'cancelled' ? `ANULADA (${formatCurrencyL(s.total)})` : formatCurrencyL(s.total),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.8 },
    bodyStyles: { fontSize: 7.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 23 },
      6: { halign: 'center', cellWidth: 11, fontStyle: 'bold' },
      7: { halign: 'right', cellWidth: 26, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Reporte Ejecutivo de Ventas');
  doc.save(`Reporte_Ventas_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 4. REPORTE DE ARQUEO Y CIERRE DE CAJA (HTML + PDF EJECUTIVO)
// ============================================================================
export function buildShiftArqueoHtml(
  shift: CashRegisterShift,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const diff = Number(shift.difference || 0);
  const diffLabel =
    Math.abs(diff) < 0.01
      ? 'CUADRE EXACTO (L. 0.00)'
      : diff > 0
      ? `SOBRANTE (+${formatCurrencyL(diff)})`
      : `FALTANTE (-${formatCurrencyL(Math.abs(diff))})`;

  return `
    <div style="${isThermal ? '' : 'border:1px solid #cbd5e1;border-radius:12px;padding:22px;max-width:680px;margin:0 auto;'}">
      <div class="text-center">
        <div style="font-size:${isThermal ? '14px' : '19px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:${isThermal ? '11px' : '13px'};font-weight:800;color:#047857;">REPORTE DE ARQUEO Y CIERRE DE CAJA (${shift.status === 'closed' ? 'CORTE Z' : 'CORTE PARCIAL X'})</div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${isThermal ? '10.5px' : '12px'};">
        <div style="display:flex;justify-content:space-between;margin:3px 0;"><span>Apertura de Turno:</span><strong>${shift.openedDate} (${shift.openedBy})</strong></div>
        <div style="display:flex;justify-content:space-between;margin:3px 0;"><span>Cierre de Turno:</span><strong>${shift.closedDate || 'Turno Abierto (Corte Parcial X)'} (${shift.closedBy || shift.openedBy})</strong></div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${isThermal ? '11px' : '12.5px'};">
        <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>(+) Efectivo Inicial en Gaveta:</span><strong>${formatCurrencyL(shift.openingCash || 0)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>(+) Ventas Cobradas en Efectivo:</span><strong>${formatCurrencyL(shift.cashSalesTotal || 0)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>(+) Abonos de Créditos en Efectivo:</span><strong>${formatCurrencyL(shift.creditAbonosCashTotal || 0)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;color:#e11d48;"><span>(-) Salidas de Efectivo / Gastos Caja:</span><strong>-${formatCurrencyL(shift.cashOutTotal || 0)}</strong></div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${isThermal ? '11.5px' : '13.5px'};">
        <div style="display:flex;justify-content:space-between;margin:4px 0;font-weight:800;"><span>(=) EFECTIVO ESPERADO EN CAJA:</span><span>${formatCurrencyL(shift.expectedCashInDrawer || 0)}</span></div>
        ${
          shift.status === 'closed'
            ? `
              <div style="display:flex;justify-content:space-between;margin:4px 0;font-weight:800;"><span>EFECTIVO FÍSICO CONTADO:</span><span>${formatCurrencyL(shift.countedPhysicalCash || 0)}</span></div>
              <div style="display:flex;justify-content:space-between;margin:6px 0;font-weight:900;padding:4px 6px;border:1px solid #0f172a;border-radius:4px;"><span>RESULTADO DEL ARQUEO:</span><span>${diffLabel}</span></div>
            `
            : ''
        }
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${isThermal ? '10.5px' : '12px'};">
        <div style="font-weight:800;margin-bottom:4px;">OTROS MÉTODOS DE PAGO DEL TURNO:</div>
        <div style="display:flex;justify-content:space-between;margin:3px 0;"><span>Ventas por Transferencia:</span><strong>${formatCurrencyL(shift.transferSalesTotal || 0)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:3px 0;"><span>Ventas con Tarjeta POS:</span><strong>${formatCurrencyL(shift.cardSalesTotal || 0)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:3px 0;"><span>Ventas al Crédito (Fiado):</span><strong>${formatCurrencyL(shift.creditSalesTotal || 0)}</strong></div>
      </div>
      ${
        (shift.cashMovements || []).length > 0
          ? `
            <div class="dashed-line"></div>
            <div style="font-size:${isThermal ? '10px' : '11.5px'};">
              <div style="font-weight:800;margin-bottom:4px;">DETALLE DE SALIDAS DE CAJA:</div>
              ${shift.cashMovements
                .map(
                  (m) =>
                    `<div style="display:flex;justify-content:space-between;margin:2px 0;"><span>• ${m.reason} (${m.dateFormatted})</span><strong>-${formatCurrencyL(m.amount)}</strong></div>`
                )
                .join('')}
            </div>
          `
          : ''
      }
      ${shift.notes ? `<div class="dashed-line"></div><div style="font-size:11px;"><strong>Observaciones:</strong> ${shift.notes}</div>` : ''}
      <div class="signatures" style="margin-top:24px;">
        <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Firma Cajero(a)</div></div>
        <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Supervisor / Administración</div></div>
      </div>
    </div>
  `;
}

export async function downloadShiftArqueoPdf(
  shift: CashRegisterShift,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const diff = Number(shift.difference || 0);
  const diffLabel =
    Math.abs(diff) < 0.01
      ? 'CUADRE EXACTO (L. 0.00)'
      : diff > 0
      ? `SOBRANTE (+${formatCurrencyL(diff)})`
      : `FALTANTE (-${formatCurrencyL(Math.abs(diff))})`;

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: shift.status === 'closed' ? 'ARQUEO Y CIERRE DE CAJA (Z)' : 'ARQUEO PARCIAL DE CAJA (X)',
    documentNumber: `TURNO #${shift.id.slice(-6).toUpperCase()}`,
    dateLabel: `Apertura: ${shift.openedDate}`,
    accentRgb: [4, 120, 87],
    statusBadge:
      shift.status === 'closed'
        ? { text: 'TURNO CERRADO', bgRgb: [209, 250, 229], textRgb: [4, 120, 87] }
        : { text: 'TURNO EN CURSO', bgRgb: [254, 243, 199], textRgb: [180, 83, 9] },
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Fondo Inicial',
      value: formatCurrencyL(shift.openingCash || 0),
      subtext: `Cajero: ${shift.openedBy}`,
      valueRgb: [51, 65, 85],
    },
    {
      label: 'Efectivo Esperado',
      value: formatCurrencyL(shift.expectedCashInDrawer || 0),
      subtext: 'En gaveta de efectivo',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Efectivo Contado',
      value:
        shift.status === 'closed'
          ? formatCurrencyL(shift.countedPhysicalCash || 0)
          : 'Turno Abierto',
      subtext: shift.closedDate ? `Cierre: ${shift.closedDate}` : 'Corte parcial X',
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Diferencia Arqueo',
      value: shift.status === 'closed' ? formatCurrencyL(diff) : 'Pendiente',
      subtext: shift.status === 'closed' ? diffLabel : 'En curso',
      valueRgb: diff < -0.01 ? [220, 38, 38] : [4, 120, 87],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Concepto Financiero del Turno de Caja', 'Detalle Operativo', 'Monto Registrado']],
    body: [
      ['(+) Efectivo Inicial de Apertura', `Recibido por ${shift.openedBy}`, formatCurrencyL(shift.openingCash || 0)],
      ['(+) Ventas Cobradas en Efectivo', `${(shift as any).salesCount || 0} transacciones en el turno`, formatCurrencyL(shift.cashSalesTotal || 0)],
      ['(+) Abonos de Cartera de Crédito en Efectivo', 'Recuperación de cartera en efectivo', formatCurrencyL(shift.creditAbonosCashTotal || 0)],
      ['(-) Salidas de Efectivo / Gastos Menores de Caja', `${(shift.cashMovements || []).length} salidas registradas`, `-${formatCurrencyL(shift.cashOutTotal || 0)}`],
      ['(=) EFECTIVO ESPERADO EN GAVETA', 'Total teórico en físico', formatCurrencyL(shift.expectedCashInDrawer || 0)],
      [
        'EFECTIVO FÍSICO CONTADO AL CIERRE',
        shift.status === 'closed' ? `Contado por ${shift.closedBy || shift.openedBy}` : 'Pendiente de cierre',
        shift.status === 'closed' ? formatCurrencyL(shift.countedPhysicalCash || 0) : 'Turno en curso',
      ],
      ['RESULTADO DEL CUADRE DE CAJA', 'Comparación físico vs sistema', shift.status === 'closed' ? diffLabel : 'Turno en curso'],
      ['Ventas Cobradas por Transferencia Bancaria', 'Depósitos directos en banco', formatCurrencyL(shift.transferSalesTotal || 0)],
      ['Ventas Cobradas con Tarjeta POS', 'Terminal bancaria débito/crédito', formatCurrencyL(shift.cardSalesTotal || 0)],
      ['Ventas Otorgadas al Crédito (Fiado)', 'Cuentas por cobrar generadas', formatCurrencyL(shift.creditSalesTotal || 0)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      2: { halign: 'right', cellWidth: 45, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  let nextY = (doc as any).lastAutoTable.finalY + 7;
  if ((shift.cashMovements || []).length > 0) {
    autoTable(doc, {
      startY: nextY,
      head: [['Hora de Salida', 'Concepto / Motivo de Salida de Efectivo', 'Autorizado por', 'Monto Retirado']],
      body: shift.cashMovements.map((m) => [
        m.dateFormatted,
        m.reason,
        m.user || shift.openedBy,
        `-${formatCurrencyL(m.amount)}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [190, 18, 60], textColor: 255, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
  }

  drawPdfPageFooters(doc, storeSettings, `Arqueo de Caja #${shift.id.slice(-6)}`);
  doc.save(`Arqueo_Caja_${shift.id}.pdf`);
}

// ============================================================================
// 5. ESTADO DE CUENTA DE CRÉDITO CLIENTE (HTML + PDF EJECUTIVO)
// ============================================================================
export function buildCreditStatementHtml(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const bal =
    sale.balanceDue !== undefined
      ? Number(sale.balanceDue)
      : Math.max(0, Number(sale.total) - Number(sale.amountPaid || 0));
  const paid = Number(sale.amountPaid) || 0;

  return `
    <div style="${isThermal ? '' : 'border:1px solid #cbd5e1;border-radius:12px;padding:22px;'}">
      <div class="text-center">
        <div style="font-size:${isThermal ? '14px' : '19px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:${isThermal ? '11px' : '13px'};font-weight:800;color:#b45309;">ESTADO DE CUENTA DE CRÉDITO CLIENTE</div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${isThermal ? '10.5px' : '12px'};">
        <div style="display:flex;justify-content:space-between;"><span>Cliente:</span><strong>${sale.customerName || 'Cliente'}</strong></div>
        ${sale.customerRtn ? `<div style="display:flex;justify-content:space-between;"><span>RTN / DNI:</span><span>${sale.customerRtn}</span></div>` : ''}
        ${sale.customerPhone ? `<div style="display:flex;justify-content:space-between;"><span>Teléfono:</span><span>${sale.customerPhone}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>Factura N°:</span><strong>${sale.saleNumber}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fecha Compra:</span><span>${sale.date}</span></div>
        ${sale.creditDueDate ? `<div style="display:flex;justify-content:space-between;"><span>Vencimiento:</span><strong>${sale.creditDueDate}</strong></div>` : ''}
      </div>
      <div class="dashed-line"></div>
      <div style="font-weight:800;font-size:11px;margin-bottom:4px;">ARTÍCULOS DE LA COMPRA:</div>
      <table style="font-size:${isThermal ? '10px' : '11.5px'};">
        <tbody>
          ${(sale.items || [])
            .map(
              (it) =>
                `<tr><td><strong>${it.quantity}x</strong> ${it.name} (${it.code})</td><td class="text-right font-bold">${formatCurrencyL(it.subtotal)}</td></tr>`
            )
            .join('')}
        </tbody>
      </table>
      <div class="dashed-line"></div>
      <div style="font-weight:800;font-size:11px;margin-bottom:4px;">HISTORIAL DE ABONOS REALIZADOS:</div>
      ${
        (sale.creditPayments || []).length === 0
          ? `<div style="font-size:10.5px;color:#64748b;">Sin abonos registrados aún.</div>`
          : (sale.creditPayments || [])
              .map(
                (cp) =>
                  `<div style="display:flex;justify-content:space-between;font-size:${isThermal ? '10px' : '11.5px'};margin:2px 0;"><span>• ${cp.date} (${getPaymentMethodLabel(cp.paymentMethod)})</span><strong>${formatCurrencyL(cp.amount)}</strong></div>`
              )
              .join('')
      }
      <div class="dashed-line"></div>
      <div style="font-size:${isThermal ? '11.5px' : '13px'};">
        <div style="display:flex;justify-content:space-between;margin:3px 0;"><span>Total Factura Original:</span><strong>${formatCurrencyL(sale.total)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:3px 0;color:#047857;"><span>Total Abonado:</span><strong>${formatCurrencyL(paid)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:5px 0;font-size:${isThermal ? '13px' : '15px'};font-weight:900;color:#b45309;"><span>SALDO PENDIENTE:</span><span>${formatCurrencyL(bal)}</span></div>
      </div>
    </div>
  `;
}

export async function downloadCreditStatementPdf(
  sale: SaleRecord,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const bal =
    sale.balanceDue !== undefined
      ? Number(sale.balanceDue)
      : Math.max(0, Number(sale.total) - Number(sale.amountPaid || 0));
  const paid = Number(sale.amountPaid) || 0;

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'ESTADO DE CUENTA DE CRÉDITO',
    documentNumber: `FACTURA ${sale.saleNumber}`,
    dateLabel: `Fecha Compra: ${sale.date}`,
    accentRgb: [180, 83, 9],
    statusBadge:
      bal <= 0.01
        ? { text: 'CRÉDITO PAGADO', bgRgb: [209, 250, 229], textRgb: [4, 120, 87] }
        : { text: 'SALDO PENDIENTE', bgRgb: [254, 243, 199], textRgb: [180, 83, 9] },
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Cliente Titular',
      value: (sale.customerName || 'Cliente').slice(0, 20),
      subtext: sale.customerPhone ? `Tel: ${sale.customerPhone}` : `RTN: ${sale.customerRtn || 'N/A'}`,
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Monto Original',
      value: formatCurrencyL(sale.total),
      subtext: `${sale.totalItems} unidades adquiridas`,
      valueRgb: [51, 65, 85],
    },
    {
      label: 'Total Abonado',
      value: formatCurrencyL(paid),
      subtext: `${(sale.creditPayments || []).length} abonos aplicados`,
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Saldo por Pagar',
      value: formatCurrencyL(bal),
      subtext: sale.creditDueDate ? `Vence: ${sale.creditDueDate}` : 'Por cobrar',
      valueRgb: bal > 0 ? [180, 83, 9] : [4, 120, 87],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Descripción del Producto', 'Cant.', 'Precio Unit.', 'Subtotal']],
    body: (sale.items || []).map((it) => [
      it.code,
      `${it.name}${it.size ? ` (${it.size})` : ''}`,
      String(it.quantity),
      formatCurrencyL(it.price),
      formatCurrencyL(it.subtotal),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  autoTable(doc, {
    startY: y,
    head: [['Fecha y Hora de Abono', 'Método de Pago', 'Recibido por', 'Observación', 'Monto Abonado']],
    body:
      (sale.creditPayments || []).length === 0
        ? [['-', 'Sin abonos registrados a la fecha', '-', '-', 'L. 0.00']]
        : (sale.creditPayments || []).map((cp) => [
            cp.date,
            getPaymentMethodLabel(cp.paymentMethod),
            cp.receivedBy || 'Caja',
            cp.notes || '-',
            formatCurrencyL(cp.amount),
          ]),
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5 },
    columnStyles: { 4: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, `Estado de Cuenta ${sale.saleNumber}`);
  doc.save(`Estado_Cuenta_${sale.saleNumber}.pdf`);
}

// ============================================================================
// 6. ESTADO DE RESULTADOS Y GASTOS OPERATIVOS (HTML + PDF EJECUTIVO)
// ============================================================================
export interface IncomeStatementReportData {
  periodLabel: string;
  grossSalesRevenue: number;
  totalCostOfGoods: number;
  grossProfit: number;
  totalOperatingExpenses: number;
  netFreeProfit: number;
  netMarginPct: number;
  salesCount: number;
  expenses: StoreExpenseRecord[];
}

export function buildIncomeStatementHtml(
  data: IncomeStatementReportData,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';

  return `
    <div>
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;">
        <div style="font-size:${isThermal ? '14px' : '19px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:${isThermal ? '11px' : '13px'};font-weight:800;color:#be123c;">ESTADO DE RESULTADOS Y GASTOS OPERATIVOS</div>
        <div style="font-size:10.5px;color:#475569;">Período: <strong>${data.periodLabel}</strong></div>
      </div>

      <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 14px;background:#f8fafc;margin-bottom:14px;font-size:${isThermal ? '10.5px' : '12px'};">
        <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>(+) Ingresos por Ventas (${data.salesCount} ventas):</span><strong>${formatCurrencyL(data.grossSalesRevenue)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;"><span>(-) Costo de Mercadería Vendida:</span><span>-${formatCurrencyL(data.totalCostOfGoods)}</span></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;border-top:1px dashed #64748b;padding-top:4px;font-weight:800;color:#047857;"><span>(=) UTILIDAD BRUTA DE VENTAS:</span><span>${formatCurrencyL(data.grossProfit)}</span></div>
        <div style="display:flex;justify-content:space-between;margin:4px 0;color:#e11d48;"><span>(-) Gastos Operativos del Local (${data.expenses.length}):</span><strong>-${formatCurrencyL(data.totalOperatingExpenses)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin:6px 0;border-top:2px solid #0f172a;padding-top:6px;font-size:${isThermal ? '12.5px' : '15px'};font-weight:900;">
          <span>(=) GANANCIA NETA LIBRE (${(Number(data.netMarginPct) || 0).toFixed(1)}%):</span>
          <span>${formatCurrencyL(data.netFreeProfit)}</span>
        </div>
      </div>

      <div style="font-weight:800;font-size:11.5px;margin-bottom:6px;">DESGLOSE DE GASTOS OPERATIVOS:</div>
      <table style="border:1px solid #cbd5e1;font-size:${isThermal ? '9.5px' : '11px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th>FECHA</th>
            <th>CATEGORÍA</th>
            <th>DESCRIPCIÓN</th>
            <th class="text-right">MONTO</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.expenses.length === 0
              ? `<tr><td colspan="4" class="text-center">No hay gastos registrados en este período.</td></tr>`
              : data.expenses
                  .map(
                    (e) => `
                    <tr style="border-bottom:1px solid #e2e8f0;">
                      <td>${e.date}</td>
                      <td><strong>${e.category}</strong></td>
                      <td>${e.description}</td>
                      <td class="text-right font-bold">-${formatCurrencyL(e.amount)}</td>
                    </tr>
                  `
                  )
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadIncomeStatementPdf(
  data: IncomeStatementReportData,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'ESTADO DE RESULTADOS (P&L)',
    documentNumber: `PERÍODO: ${data.periodLabel.toUpperCase()}`,
    dateLabel: `Emisión: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [190, 18, 60],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Ingresos por Ventas',
      value: formatCurrencyL(data.grossSalesRevenue),
      subtext: `${data.salesCount} ventas registradas`,
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Utilidad Bruta',
      value: formatCurrencyL(data.grossProfit),
      subtext: `Costo: ${formatCurrencyL(data.totalCostOfGoods)}`,
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Gastos Operativos',
      value: `-${formatCurrencyL(data.totalOperatingExpenses)}`,
      subtext: `${data.expenses.length} gastos del local`,
      valueRgb: [190, 18, 60],
    },
    {
      label: 'Ganancia Neta Libre',
      value: formatCurrencyL(data.netFreeProfit),
      subtext: `Margen Neto: ${(Number(data.netMarginPct) || 0).toFixed(1)}%`,
      valueRgb: data.netFreeProfit >= 0 ? [4, 120, 87] : [220, 38, 38],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Concepto Contable del Estado de Resultados', 'Monto (L.)']],
    body: [
      [`(+) Ingresos Brutos por Ventas (${data.salesCount} transacciones)`, formatCurrencyL(data.grossSalesRevenue)],
      ['(-) Costo de Mercadería Vendida (CMV)', `-${formatCurrencyL(data.totalCostOfGoods)}`],
      ['(=) UTILIDAD BRUTA EN VENTAS', formatCurrencyL(data.grossProfit)],
      [`(-) Gastos Operativos Administrativos y de Local (${data.expenses.length})`, `-${formatCurrencyL(data.totalOperatingExpenses)}`],
      [`(=) UTILIDAD / GANANCIA NETA LIBRE (${(Number(data.netMarginPct) || 0).toFixed(1)}%)`, formatCurrencyL(data.netFreeProfit)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 1: { halign: 'right', cellWidth: 55, fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 7;

  if (data.expenses.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Fecha', 'Categoría', 'Descripción del Gasto Operativo', 'Método Pago', 'Registrado por', 'Monto']],
      body: data.expenses.map((e) => [
        e.date,
        e.category,
        e.description,
        getPaymentMethodLabel(e.paymentMethod),
        e.registeredBy,
        `-${formatCurrencyL(e.amount)}`,
      ]),
      theme: 'grid',
      headStyles: { fillColor: [190, 18, 60], textColor: 255, fontSize: 8.2 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
  }

  drawPdfPageFooters(doc, storeSettings, 'Estado de Resultados y Gastos');
  doc.save(`Estado_Resultados_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 7. REPORTE DE AUDITORÍA FÍSICA DE INVENTARIO (HTML + PDF EJECUTIVO)
// ============================================================================
export interface AuditReportPayload {
  dateStr: string;
  scope: string;
  match: number;
  missing: number;
  extra: number;
  netImpact: number;
  groupedItems: GroupedAuditItem[];
  aiSummary?: string;
}

export function buildAuditReportHtml(
  audit: AuditReportPayload,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';

  return `
    <div>
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;">
        <div style="font-size:${isThermal ? '14px' : '20px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:${isThermal ? '11px' : '14px'};font-weight:800;">REPORTE OFICIAL DE AUDITORÍA DE INVENTARIO</div>
        <div style="font-size:10.5px;color:#475569;">Fecha: <strong>${audit.dateStr}</strong> • Alcance: <strong>${audit.scope}</strong></div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">Exactos</div><div class="kpi-value" style="color:#047857;">${audit.match}</div></div>
        <div class="kpi-box"><div class="kpi-label">Faltantes</div><div class="kpi-value" style="color:#dc2626;">${audit.missing}</div></div>
        <div class="kpi-box"><div class="kpi-label">Sobrantes</div><div class="kpi-value" style="color:#d97706;">${audit.extra}</div></div>
        <div class="kpi-box"><div class="kpi-label">Impacto Neto</div><div class="kpi-value">${formatCurrencyL(audit.netImpact)}</div></div>
      </div>

      ${
        audit.aiSummary && !isThermal
          ? `<div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:10px;margin-bottom:12px;font-size:11px;"><strong>Análisis Ejecutivo:</strong> ${audit.aiSummary}</div>`
          : ''
      }

      <table style="border:1px solid #cbd5e1;font-size:${isThermal ? '9.5px' : '11px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th>PRODUCTO / MODELO</th>
            ${isThermal ? '' : '<th>PROVEEDOR</th>'}
            <th class="text-center">SIST.</th>
            <th class="text-center">FÍSICO</th>
            <th class="text-right">DIF.</th>
            <th class="text-right">IMPACTO</th>
          </tr>
        </thead>
        <tbody>
          ${audit.groupedItems
            .map((g) => {
              const diff = g.counted - g.expected;
              let impact = 0;
              g.details.forEach((d) => {
                impact += (d.counted - d.expected) * d.price;
              });
              return `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td><strong>${g.name}</strong></td>
                  ${isThermal ? '' : `<td>${g.supplier || 'N/A'}</td>`}
                  <td class="text-center">${g.expected}</td>
                  <td class="text-center font-bold">${g.counted}</td>
                  <td class="text-right font-bold">${diff === 0 ? '0' : diff > 0 ? `+${diff}` : diff}</td>
                  <td class="text-right font-bold">${impact === 0 ? '-' : formatCurrencyL(impact)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>

      <div class="signatures">
        <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Firma de Auditor(a)</div></div>
        <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Visto Bueno Gerencia</div></div>
      </div>
    </div>
  `;
}

export async function downloadAuditReportPdf(
  audit: AuditReportPayload,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'ACTA DE AUDITORÍA FÍSICA',
    documentNumber: `ALCANCE: ${audit.scope.slice(0, 22).toUpperCase()}`,
    dateLabel: `Fecha: ${audit.dateStr}`,
    accentRgb: [30, 64, 175],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Modelos Exactos',
      value: `${audit.match}`,
      subtext: 'Sin discrepancia física',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Unidades Faltantes',
      value: `${audit.missing}`,
      subtext: 'Merma o faltante detectado',
      valueRgb: [220, 38, 38],
    },
    {
      label: 'Unidades Sobrantes',
      value: `${audit.extra}`,
      subtext: 'Sobrante físico en conteo',
      valueRgb: [217, 119, 6],
    },
    {
      label: 'Impacto Financiero',
      value: formatCurrencyL(audit.netImpact),
      subtext: 'Balance neto valorizado',
      valueRgb: audit.netImpact < 0 ? [220, 38, 38] : [15, 23, 42],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Producto / Modelo Auditado', 'Proveedor', 'Stock Sistema', 'Conteo Físico', 'Diferencia', 'Impacto Valorizado']],
    body: audit.groupedItems.map((g) => {
      const diff = g.counted - g.expected;
      let impact = 0;
      g.details.forEach((d) => {
        impact += (d.counted - d.expected) * d.price;
      });
      return [
        g.name,
        g.supplier || 'No asignado',
        String(g.expected),
        String(g.counted),
        diff === 0 ? 'Exacto (0)' : diff > 0 ? `+${diff}` : String(diff),
        impact === 0 ? 'L. 0.00' : formatCurrencyL(impact),
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.2 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      2: { halign: 'center', cellWidth: 22 },
      3: { halign: 'center', cellWidth: 22, fontStyle: 'bold' },
      4: { halign: 'right', cellWidth: 22, fontStyle: 'bold' },
      5: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Auditoría Física de Inventario');
  doc.save(`Auditoria_Inventario_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 8. REPORTE DE INVENTARIO VALORIZADO / EXISTENCIAS (HTML + PDF EJECUTIVO)
// ============================================================================
export interface InventoryValuationSummary {
  filterLabel: string;
  totalModels: number;
  totalUnits: number;
  totalCost: number;
  totalRetail: number;
  totalProfit: number;
  marginPct: number;
}

function computeInventoryValuationSummary(
  items: Product[],
  filterLabel: string = 'Todo el Catálogo'
): InventoryValuationSummary {
  const safeItems = Array.isArray(items) ? items : [];
  let totalUnits = 0;
  let totalCost = 0;
  let totalRetail = 0;

  safeItems.forEach((p) => {
    const stock = Math.max(0, Number(p.stock) || 0);
    const cost = Math.max(0, Number(p.cost) || 0);
    const price = Math.max(0, Number(p.price) || 0);
    totalUnits += stock;
    totalCost += stock * cost;
    totalRetail += stock * price;
  });

  const totalProfit = totalRetail - totalCost;
  const marginPct = totalRetail > 0 ? (totalProfit / totalRetail) * 100 : 0;

  return {
    filterLabel: filterLabel || 'Todo el Catálogo',
    totalModels: safeItems.length,
    totalUnits,
    totalCost,
    totalRetail,
    totalProfit,
    marginPct,
  };
}

function isInventorySummaryObject(arg: any): arg is InventoryValuationSummary {
  return Boolean(
    arg &&
      typeof arg === 'object' &&
      ('totalModels' in arg || 'totalRetail' in arg || 'marginPct' in arg)
  );
}

export function buildInventoryReportHtml(
  items: Product[],
  summaryOrSettings: InventoryValuationSummary | StoreSettings,
  settingsOrFormat?: StoreSettings | PrinterPaperFormat,
  formatOrFilterLabel?: PrinterPaperFormat | string
): string {
  let summary: InventoryValuationSummary;
  let storeSettings: StoreSettings;
  let format: PrinterPaperFormat = 'letter';

  if (isInventorySummaryObject(summaryOrSettings)) {
    summary = {
      ...computeInventoryValuationSummary(items, summaryOrSettings.filterLabel),
      ...summaryOrSettings,
    };
    storeSettings = (settingsOrFormat as StoreSettings) || { storeName: 'Tienda Gosén' };
    format = (formatOrFilterLabel as PrinterPaperFormat) || 'letter';
  } else {
    storeSettings = (summaryOrSettings as StoreSettings) || { storeName: 'Tienda Gosén' };
    format = (settingsOrFormat as PrinterPaperFormat) || 'letter';
    const filterLabel =
      typeof formatOrFilterLabel === 'string' ? formatOrFilterLabel : 'Todo el Catálogo';
    summary = computeInventoryValuationSummary(items, filterLabel);
  }

  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings?.storeName || 'Tienda Gosén';
  const safeMargin = Number(summary.marginPct) || 0;

  return `
    <div>
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;">
        <div style="font-size:${isThermal ? '14px' : '20px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:${isThermal ? '11px' : '13px'};font-weight:800;color:#047857;">REPORTE DE INVENTARIO VALORIZADO Y EXISTENCIAS</div>
        <div style="font-size:10.5px;color:#475569;">Filtro: <strong>${summary.filterLabel}</strong> • Emitido: ${new Date().toLocaleString('es-HN')}</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">Artículos / Stock</div><div class="kpi-value">${summary.totalModels} (${summary.totalUnits} uds)</div></div>
        <div class="kpi-box"><div class="kpi-label">Costo Inventario</div><div class="kpi-value">${formatCurrencyL(summary.totalCost)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Valor Venta</div><div class="kpi-value" style="color:#047857;">${formatCurrencyL(summary.totalRetail)}</div></div>
        <div class="kpi-box"><div class="kpi-label">Utilidad (${safeMargin.toFixed(1)}%)</div><div class="kpi-value" style="color:#0f766e;">${formatCurrencyL(summary.totalProfit)}</div></div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:${isThermal ? '9.5px' : '10.5px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th>CÓDIGO</th>
            <th>ARTÍCULO</th>
            ${isThermal ? '' : '<th>CATEGORÍA / PROV.</th>'}
            <th class="text-center">STOCK</th>
            ${isThermal ? '' : '<th class="text-right">COSTO</th>'}
            <th class="text-right">PRECIO</th>
          </tr>
        </thead>
        <tbody>
          ${(items || [])
            .map(
              (p, i) => `
              <tr style="border-bottom:1px solid #e2e8f0;background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="font-family:monospace;font-weight:700;">${p.code}</td>
                <td><strong>${p.name}</strong>${p.size ? ` (${p.size})` : ''}</td>
                ${isThermal ? '' : `<td>${p.category || 'General'}${p.supplier ? ` • ${p.supplier}` : ''}</td>`}
                <td class="text-center font-bold">${p.stock}</td>
                ${isThermal ? '' : `<td class="text-right">${formatCurrencyL(p.cost)}</td>`}
                <td class="text-right font-bold">${formatCurrencyL(p.price)}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadInventoryReportPdf(
  items: Product[],
  summaryOrSettings: InventoryValuationSummary | StoreSettings,
  settingsOrFilterLabel?: StoreSettings | string
): Promise<void> {
  let summary: InventoryValuationSummary;
  let storeSettings: StoreSettings;

  if (isInventorySummaryObject(summaryOrSettings)) {
    summary = {
      ...computeInventoryValuationSummary(items, summaryOrSettings.filterLabel),
      ...summaryOrSettings,
    };
    storeSettings =
      typeof settingsOrFilterLabel === 'object' && settingsOrFilterLabel
        ? settingsOrFilterLabel
        : { storeName: 'Tienda Gosén' };
  } else {
    storeSettings = (summaryOrSettings as StoreSettings) || { storeName: 'Tienda Gosén' };
    const filterLabel =
      typeof settingsOrFilterLabel === 'string'
        ? settingsOrFilterLabel
        : 'Todo el Catálogo';
    summary = computeInventoryValuationSummary(items, filterLabel);
  }

  await preloadStoreLogoForPdf(storeSettings?.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const safeMargin = Number(summary.marginPct) || 0;

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'INVENTARIO VALORIZADO',
    documentNumber: `${summary.totalModels} REFERENCIAS`,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [4, 120, 87],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Catálogo y Stock',
      value: `${summary.totalUnits} uds`,
      subtext: `${summary.totalModels} modelos (${summary.filterLabel})`,
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Costo en Bodega',
      value: formatCurrencyL(summary.totalCost),
      subtext: 'Capital invertido en stock',
      valueRgb: [71, 85, 105],
    },
    {
      label: 'Valor Comercial Venta',
      value: formatCurrencyL(summary.totalRetail),
      subtext: 'Proyección total precio venta',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Ganancia Potencial',
      value: formatCurrencyL(summary.totalProfit),
      subtext: `Margen proyectado: ${safeMargin.toFixed(1)}%`,
      valueRgb: [13, 148, 136],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ['Código / SKU', 'Descripción del Artículo', 'Categoría', 'Proveedor', 'Stock', 'Costo Unit.', 'Precio Venta', 'Valor Total'],
    ],
    body: (items || []).map((p) => [
      p.code,
      `${p.name}${p.size ? ` (Talla: ${p.size})` : ''}`,
      p.category || 'General',
      p.supplier || '-',
      String(p.stock),
      formatCurrencyL(p.cost),
      formatCurrencyL(p.price),
      formatCurrencyL((Number(p.price) || 0) * (Number(p.stock) || 0)),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.8 },
    bodyStyles: { fontSize: 7.3 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 21 },
      4: { halign: 'center', cellWidth: 13, fontStyle: 'bold' },
      5: { halign: 'right', cellWidth: 21 },
      6: { halign: 'right', cellWidth: 21, fontStyle: 'bold' },
      7: { halign: 'right', cellWidth: 24, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Inventario Valorizado');
  doc.save(`Inventario_Valorizado_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 9. RECIBO DE SUSCRIPCIÓN SAAS (PDF EJECUTIVO)
// ============================================================================
export async function downloadSaaSReceiptPdf(
  payment: SubscriptionPaymentRecord,
  company: CompanyTenant,
  brandName: string = 'Plataforma Central SaaS'
): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const fakeSettings: StoreSettings = {
    storeName: brandName,
    tagline: 'Administración Central de Licencias y Suscripciones Empresariales',
    logoUrl: company.logoUrl,
  };

  let y = drawExecutivePdfHeader(doc, {
    storeSettings: fakeSettings,
    documentTitle: 'RECIBO OFICIAL DE SUSCRIPCIÓN',
    documentNumber: `N° ${payment.receiptNumber}`,
    dateLabel: `Fecha Pago: ${payment.dateFormatted}`,
    accentRgb: [4, 120, 87],
    statusBadge: { text: 'SUSCRIPCIÓN ACTIVA', bgRgb: [209, 250, 229], textRgb: [4, 120, 87] },
  });

  autoTable(doc, {
    startY: y + 2,
    head: [['Concepto de Facturación SaaS', 'Detalle Oficial Registrado']],
    body: [
      ['Empresa / Tienda Suscrita', `${company.name} (ID: ${company.slug})`],
      ['Propietario / Representante', `${company.ownerName || 'Propietario'} ${company.phone ? `• Tel: ${company.phone}` : ''}`],
      ['Período / Concepto Pagado', payment.periodLabel],
      ['Nivel de Plan Contratado', payment.plan.toUpperCase()],
      ['Método de Pago y Referencia', `${payment.paymentMethod.toUpperCase()} ${payment.reference ? `(Ref: ${payment.reference})` : ''}`],
      ['Nueva Fecha de Próximo Vencimiento', payment.newBillingDate || 'Licencia Vitalicia'],
      ['IMPORTE TOTAL PAGADO', formatCurrencyL(payment.amount)],
      ['Importe en Letras', numberToSpanishWords(payment.amount)],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9.5 },
    bodyStyles: { fontSize: 9.5 },
    columnStyles: { 0: { cellWidth: 68 }, 1: { fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, fakeSettings, `Recibo SaaS ${payment.receiptNumber}`);
  doc.save(`Recibo_SaaS_${payment.receiptNumber}.pdf`);
}

// ============================================================================
// 10. REPORTE GENERAL DE FACTURAS DE COMPRA (HTML + PDF EJECUTIVO)
// ============================================================================
export interface PurchasesReportSummary {
  periodLabel: string;
  count: number;
  totalUnits: number;
  totalSpent: number;
  activeSuppliersCount: number;
}

export function buildPurchasesReportHtml(
  purchasesList: PurchaseInvoice[],
  summary: PurchasesReportSummary,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';

  return `
    <div>
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;">
        <div style="font-size:${isThermal ? '14px' : '20px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:${isThermal ? '11px' : '13px'};font-weight:800;color:#4338ca;">REPORTE DE FACTURAS DE COMPRA A PROVEEDORES</div>
        <div style="font-size:10.5px;color:#475569;">Período: <strong>${summary.periodLabel}</strong> • Emitido: ${new Date().toLocaleString('es-HN')}</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-box"><div class="kpi-label">Facturas Válidas</div><div class="kpi-value">${summary.count}</div></div>
        <div class="kpi-box"><div class="kpi-label">Unidades Ingresadas</div><div class="kpi-value">${summary.totalUnits}</div></div>
        <div class="kpi-box"><div class="kpi-label">Proveedores Activos</div><div class="kpi-value">${summary.activeSuppliersCount}</div></div>
        <div class="kpi-box"><div class="kpi-label">Inversión Total</div><div class="kpi-value" style="color:#4338ca;">${formatCurrencyL(summary.totalSpent)}</div></div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:${isThermal ? '9.5px' : '10.5px'};">
        <thead>
          <tr style="background:#1e1b4b;color:#ffffff;">
            <th>N° FACTURA</th>
            <th>PROVEEDOR</th>
            <th>FECHA</th>
            ${isThermal ? '' : '<th>CONDICIÓN</th>'}
            <th class="text-center">UDS.</th>
            <th class="text-right">TOTAL</th>
          </tr>
        </thead>
        <tbody>
          ${purchasesList
            .map(
              (p, i) => `
              <tr style="border-bottom:1px solid #e2e8f0;background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="font-family:monospace;font-weight:700;">${p.invoiceNumber}</td>
                <td><strong>${p.supplierName}</strong></td>
                <td>${p.date}</td>
                ${isThermal ? '' : `<td>${p.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}</td>`}
                <td class="text-center font-bold">${p.totalItems}</td>
                <td class="text-right font-bold">${p.status === 'cancelled' ? `ANULADA (${formatCurrencyL(p.total)})` : formatCurrencyL(p.total)}</td>
              </tr>
            `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadPurchasesReportPdf(
  purchasesList: PurchaseInvoice[],
  summary: PurchasesReportSummary,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'REPORTE DE COMPRAS A PROVEEDORES',
    documentNumber: `PERÍODO: ${summary.periodLabel.toUpperCase()}`,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [67, 56, 202],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Facturas Registradas',
      value: `${summary.count}`,
      subtext: 'Órdenes de compra válidas',
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Unidades Abastecidas',
      value: `${summary.totalUnits} uds`,
      subtext: 'Ingresadas al inventario',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Proveedores Activos',
      value: `${summary.activeSuppliersCount}`,
      subtext: 'Socios comerciales',
      valueRgb: [71, 85, 105],
    },
    {
      label: 'Inversión en Compras',
      value: formatCurrencyL(summary.totalSpent),
      subtext: 'Costo total facturado',
      valueRgb: [67, 56, 202],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [['N° Factura', 'Proveedor', 'Fecha Compra', 'Condición de Pago', 'Recibido por', 'Uds.', 'Total Factura']],
    body: purchasesList.map((p) => [
      p.invoiceNumber,
      p.supplierName,
      p.date,
      p.paymentCondition === 'credit' ? `Crédito (${p.dueDate || 'Pend.'})` : 'Contado',
      p.receivedBy || 'Admin',
      String(p.totalItems),
      p.status === 'cancelled' ? `ANULADA (${formatCurrencyL(p.total)})` : formatCurrencyL(p.total),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 27, 75], textColor: 255, fontSize: 8.2 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      5: { halign: 'center', cellWidth: 16, fontStyle: 'bold' },
      6: { halign: 'right', cellWidth: 30, fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Reporte de Compras');
  doc.save(`Reporte_Compras_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 11. REPORTE DE CARTERA DE CUENTAS POR COBRAR / CRÉDITOS (HTML + PDF EJECUTIVO)
// ============================================================================
export function buildCreditPortfolioReportHtml(
  creditSalesList: SaleRecord[],
  storeSettings: StoreSettings,
  format: PrinterPaperFormat
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const totalPending = creditSalesList.reduce((sum, s) => {
    const bal =
      s.balanceDue !== undefined
        ? Number(s.balanceDue)
        : Math.max(0, Number(s.total) - Number(s.amountPaid || 0));
    return sum + bal;
  }, 0);

  return `
    <div>
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:12px;">
        <div style="font-size:${isThermal ? '14px' : '20px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:${isThermal ? '11px' : '13px'};font-weight:800;color:#b45309;">REPORTE DE CARTERA DE CUENTAS POR COBRAR (CRÉDITOS)</div>
        <div style="font-size:11px;font-weight:700;margin-top:4px;">Total por Cobrar: ${formatCurrencyL(totalPending)} (${creditSalesList.length} cuentas)</div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:${isThermal ? '9.5px' : '10.5px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th>CLIENTE</th>
            <th>FACTURA / FECHA</th>
            ${isThermal ? '' : '<th class="text-right">TOTAL</th><th class="text-right">ABONADO</th>'}
            <th class="text-right">SALDO PENDIENTE</th>
          </tr>
        </thead>
        <tbody>
          ${creditSalesList
            .map((s) => {
              const bal =
                s.balanceDue !== undefined
                  ? Number(s.balanceDue)
                  : Math.max(0, Number(s.total) - Number(s.amountPaid || 0));
              const paid = Number(s.amountPaid) || 0;
              return `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td><strong>${s.customerName || 'Cliente'}</strong>${s.customerPhone ? `<div style="font-size:9px;color:#475569;">Tel: ${s.customerPhone}</div>` : ''}</td>
                  <td>${s.saleNumber}<div style="font-size:9px;color:#475569;">${s.date}</div></td>
                  ${isThermal ? '' : `<td class="text-right">${formatCurrencyL(s.total)}</td><td class="text-right" style="color:#047857;">${formatCurrencyL(paid)}</td>`}
                  <td class="text-right font-bold" style="color:#b45309;">${formatCurrencyL(bal)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadCreditPortfolioReportPdf(
  creditSalesList: SaleRecord[],
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const totalOriginal = creditSalesList.reduce((sum, s) => sum + (Number(s.total) || 0), 0);
  const totalPaid = creditSalesList.reduce((sum, s) => sum + (Number(s.amountPaid) || 0), 0);
  const totalPending = creditSalesList.reduce((sum, s) => {
    const bal =
      s.balanceDue !== undefined
        ? Number(s.balanceDue)
        : Math.max(0, Number(s.total) - Number(s.amountPaid || 0));
    return sum + bal;
  }, 0);

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'CARTERA DE CUENTAS POR COBRAR',
    documentNumber: `${creditSalesList.length} CUENTAS`,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [180, 83, 9],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Cuentas Registradas',
      value: `${creditSalesList.length}`,
      subtext: 'Clientes en cartera',
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Total Crédito Otorgado',
      value: formatCurrencyL(totalOriginal),
      subtext: 'Facturación al crédito',
      valueRgb: [51, 65, 85],
    },
    {
      label: 'Total Recuperado',
      value: formatCurrencyL(totalPaid),
      subtext: 'Abonos recibidos',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Saldo Pendiente Cobro',
      value: formatCurrencyL(totalPending),
      subtext: 'Efectivo por recuperar',
      valueRgb: [180, 83, 9],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ['Cliente', 'Teléfono', 'Factura N°', 'Fecha', 'Vencimiento', 'Total Factura', 'Abonado', 'Saldo Pendiente'],
    ],
    body: creditSalesList.map((s) => {
      const bal =
        s.balanceDue !== undefined
          ? Number(s.balanceDue)
          : Math.max(0, Number(s.total) - Number(s.amountPaid || 0));
      const paid = Number(s.amountPaid) || 0;
      return [
        s.customerName || 'Cliente',
        s.customerPhone || '-',
        s.saleNumber,
        s.date,
        s.creditDueDate || '-',
        formatCurrencyL(s.total),
        formatCurrencyL(paid),
        formatCurrencyL(bal),
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      2: { fontStyle: 'bold' },
      5: { halign: 'right' },
      6: { halign: 'right' },
      7: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Cartera de Créditos');
  doc.save(`Cartera_Creditos_${new Date().toISOString().slice(0, 10)}.pdf`);
}
