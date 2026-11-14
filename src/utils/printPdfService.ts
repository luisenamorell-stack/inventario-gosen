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
  ActivityLogRecord,
  WarehouseLocation,
  WarehouseTransferRecord,
  UserAccount,
  SaaSGlobalConfig,
  CreditContractData,
  CreditAccountControlMeta,
  getEffectiveInvoiceTemplate,
  resolveInvoiceIssuerName,
} from '../types';
import { getProductStockInWarehouse } from '../firebase/firestoreService';
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

function hexToRgbTuple(
  hex?: string,
  fallback: [number, number, number] = [4, 120, 87]
): [number, number, number] {
  const clean = (hex || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return fallback;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

function drawExecutivePdfHeader(doc: jsPDF, opts: ExecutiveHeaderOptions): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  const tpl = getEffectiveInvoiceTemplate(opts.storeSettings);
  const accent = opts.accentRgb || hexToRgbTuple(tpl.accentColor, [4, 120, 87]);
  const storeName = (opts.storeSettings.storeName || 'TIENDA GOSÉN').toUpperCase();

  // Top Luxury Accent Bar
  if (tpl.templateStyle !== 'minimal') {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageWidth, 4.5, 'F');
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 4.5, pageWidth, 1.5, 'F');
  }

  let y = 11;
  const logoData = tpl.showLogo ? getCachedLogoDataUrl(opts.storeSettings) : null;
  const logoBoxSize = 18;
  const textStartX = tpl.showLogo ? 14 + logoBoxSize + 4 : 14;

  // Draw Logo or Executive Monogram Emblem
  if (tpl.showLogo) {
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
      doc.setFillColor(accent[0], accent[1], accent[2]);
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
  if (tpl.showTagline && opts.storeSettings.tagline) {
    doc.text(opts.storeSettings.tagline, textStartX, infoY);
    infoY += 3.8;
  }

  const fiscalParts = [
    tpl.showStoreRtn && opts.storeSettings.storeRtn ? `RTN: ${opts.storeSettings.storeRtn}` : '',
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

  if (tpl.headerCustomNote) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(tpl.headerCustomNote.slice(0, 95), textStartX, infoY);
    infoY += 3.6;
  }

  // Right Document Badge Box
  const boxWidth = 74;
  const boxX = pageWidth - 14 - boxWidth;
  const boxHeight = tpl.caiNumber ? 22.5 : 19;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(boxX, y - 2, boxWidth, boxHeight, 2, 2, 'FD');

  // Top Header Strip inside Document Box
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.roundedRect(boxX, y - 2, boxWidth, 5.8, 2, 2, 'F');
  doc.rect(boxX, y + 1.8, boxWidth, 2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(opts.documentTitle.toUpperCase().slice(0, 34), boxX + boxWidth / 2, y + 2, {
    align: 'center',
  });

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

  if (tpl.caiNumber) {
    doc.setFont('courier', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`CAI: ${tpl.caiNumber.slice(0, 38)}`, boxX + boxWidth / 2, y + 18, { align: 'center' });
  }

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

  let bottomHeaderY = Math.max(infoY + 2, y + boxHeight + 1);
  if (tpl.caiRange || tpl.caiExpiryDate) {
    const caiDetails = [
      tpl.caiRange ? `Rango Autorizado: ${tpl.caiRange}` : '',
      tpl.caiExpiryDate ? `Fecha Límite de Emisión: ${tpl.caiExpiryDate}` : '',
    ]
      .filter(Boolean)
      .join('   |   ');
    doc.setFont('courier', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(caiDetails, 14, bottomHeaderY);
    bottomHeaderY += 3.5;
  }

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
  const tpl = getEffectiveInvoiceTemplate(storeSettings);
  const accentHex = tpl.accentColor || '#047857';
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
  const activeBanks = (storeSettings.bankAccounts || []).filter(
    (b) => b.isActive !== false && b.accountNumber
  );
  const resolvedSeller = resolveInvoiceIssuerName(
    sellerLabel || sale.cashier,
    tpl.defaultIssuerName,
    'Administrador'
  );

  if (isThermal) {
    return `
      <div class="text-center">
        ${
          tpl.showLogo && storeSettings.logoUrl
            ? `<img src="${storeSettings.logoUrl}" alt="${storeName}" style="width:48px;height:48px;object-fit:contain;margin:0 auto 4px;display:block;border-radius:6px;" />`
            : ''
        }
        <div style="font-size:${format === '58mm' ? '13px' : '15px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        ${tpl.showTagline && storeSettings.tagline ? `<div style="font-size:10px;color:#334155;">${storeSettings.tagline}</div>` : ''}
        ${tpl.showStoreRtn && storeSettings.storeRtn ? `<div style="font-size:10px;font-weight:700;">RTN: ${storeSettings.storeRtn}</div>` : ''}
        ${storeSettings.address ? `<div style="font-size:10px;">${storeSettings.address}</div>` : ''}
        ${storeSettings.phone ? `<div style="font-size:10px;">Tel: ${storeSettings.phone}</div>` : ''}
        ${tpl.headerCustomNote ? `<div style="font-size:9.5px;font-weight:700;margin-top:2px;">${tpl.headerCustomNote}</div>` : ''}
        ${tpl.caiNumber ? `<div style="font-size:9px;margin-top:2px;">CAI: <strong>${tpl.caiNumber}</strong></div>` : ''}
        ${tpl.caiRange ? `<div style="font-size:8.5px;">Rango: ${tpl.caiRange}</div>` : ''}
        ${tpl.caiExpiryDate ? `<div style="font-size:8.5px;">Fecha Límite Emisión: ${tpl.caiExpiryDate}</div>` : ''}
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${format === '58mm' ? '10px' : '11px'};">
        <div style="display:flex;justify-content:space-between;"><span>Documento:</span><strong>${sale.paymentMethod === 'credit' ? tpl.creditDocumentTitle : tpl.thermalDocumentTitle}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>N° Comprobante:</span><strong>${sale.saleNumber}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fecha y Hora:</span><span>${sale.date}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Cliente:</span><strong>${sale.customerName || 'Consumidor Final'}</strong></div>
        ${tpl.showCustomerRtn && sale.customerRtn ? `<div style="display:flex;justify-content:space-between;"><span>RTN / DNI:</span><span>${sale.customerRtn}</span></div>` : ''}
        ${tpl.showCustomerPhone && sale.customerPhone ? `<div style="display:flex;justify-content:space-between;"><span>Teléfono:</span><span>${sale.customerPhone}</span></div>` : ''}
        ${tpl.showSellerName ? `<div style="display:flex;justify-content:space-between;"><span>${tpl.issuerLabel || 'Atendido por'}:</span><span>${resolvedSeller}</span></div>` : ''}
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
                      ${tpl.showItemCode ? `Cód: ${it.code} • ` : ''}@ ${formatCurrencyL(it.price)}
                      ${tpl.showItemDiscount && disc > 0 ? ` (Desc -${formatCurrencyL(disc)} c/u)` : ''}
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
        ${tpl.showItemDiscount && itemsSaved > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Ahorro artículos:</span><span>-${formatCurrencyL(itemsSaved)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>Subtotal:</span><span>${formatCurrencyL(sale.subtotal)}</span></div>
        ${sale.discount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Descuento:</span><span>-${formatCurrencyL(sale.discount)}</span></div>` : ''}
        ${sale.tax > 0 ? `<div style="display:flex;justify-content:space-between;"><span>15% ISV:</span><span>${formatCurrencyL(sale.tax)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-size:${format === '58mm' ? '13px' : '14px'};font-weight:900;border-top:1px dashed #000;padding-top:4px;margin-top:4px;">
          <span>TOTAL NETO:</span>
          <span>${formatCurrencyL(sale.total)}</span>
        </div>
        ${tpl.showAmountInWords ? `<div style="font-size:9px;margin-top:3px;font-weight:700;">${amountWords}</div>` : ''}
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
      ${
        tpl.showBankAccounts && activeBanks.length > 0
          ? `<div class="dashed-line"></div><div style="font-size:9.5px;"><strong>CUENTAS BANCARIAS:</strong>${activeBanks
              .map((b) => `<div>• ${b.bankName}: ${b.accountNumber} (${b.holderName})</div>`)
              .join('')}</div>`
          : ''
      }
      ${
        sale.warrantyInfo?.enabled
          ? `<div class="dashed-line"></div>
             <div style="font-size:9.5px;border:1px solid #000;padding:4px;border-radius:4px;margin-top:2px;">
               <div style="font-weight:900;text-align:center;text-transform:uppercase;">🛡️ CERTIFICADO DE GARANTÍA: ${sale.warrantyInfo.durationLabel || '30 Días'}</div>
               ${sale.warrantyInfo.serialOrModelNotes ? `<div style="margin-top:2px;"><strong>Serie / Modelo:</strong> ${sale.warrantyInfo.serialOrModelNotes}</div>` : ''}
               <div style="margin-top:2px;text-align:justify;">${sale.warrantyInfo.coverageTerms || tpl.warrantyPolicyText || 'Garantía válida por defectos de fábrica presentando este comprobante original.'}</div>
             </div>`
          : tpl.warrantyPolicyText
          ? `<div class="dashed-line"></div><div style="font-size:9.5px;text-align:center;"><strong>${tpl.warrantyTitle}:</strong> ${tpl.warrantyPolicyText}</div>`
          : ''
      }
      <div class="dashed-line"></div>
      <div class="text-center" style="font-size:10px;margin-top:6px;">
        ${tpl.footerThankYouTitle ? `<div style="font-weight:900;">${tpl.footerThankYouTitle}</div>` : ''}
        <div>${footerText}</div>
      </div>
    `;
  }

  // Formal Letter / Half-Letter Executive Commercial Invoice HTML
  return `
    <div style="border:${tpl.templateStyle === 'corporate' ? `2px solid ${accentHex}` : '1px solid #cbd5e1'};border-radius:12px;padding:${format === 'half-letter' ? '16px' : '24px'};background:#ffffff;">
      ${
        tpl.templateStyle !== 'minimal'
          ? `<div style="height:5px;background:linear-gradient(90deg,#0f172a 0%,${accentHex} 100%);border-radius:6px;margin-bottom:14px;"></div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;gap:16px;">
        <div style="display:flex;gap:14px;align-items:center;">
          ${
            tpl.showLogo
              ? storeSettings.logoUrl
                ? `<img src="${storeSettings.logoUrl}" alt="${storeName}" style="width:62px;height:62px;object-fit:contain;border-radius:10px;border:1px solid #e2e8f0;padding:3px;background:#fff;" />`
                : `<div style="width:56px;height:56px;border-radius:10px;background:${accentHex};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;">${storeName.slice(0, 2).toUpperCase()}</div>`
              : ''
          }
          <div>
            <h1 style="margin:0;font-size:21px;font-weight:900;text-transform:uppercase;color:#0f172a;letter-spacing:-0.02em;">${storeName}</h1>
            ${tpl.showTagline && storeSettings.tagline ? `<div style="font-size:11.5px;color:#475569;font-weight:600;">${storeSettings.tagline}</div>` : ''}
            ${tpl.showStoreRtn && storeSettings.storeRtn ? `<div style="font-size:11px;color:#0f172a;margin-top:2px;">RTN: <strong>${storeSettings.storeRtn}</strong></div>` : ''}
            <div style="font-size:11px;color:#475569;">
              ${[storeSettings.address, storeSettings.phone ? `Tel: ${storeSettings.phone}` : ''].filter(Boolean).join('  •  ')}
            </div>
            ${tpl.headerCustomNote ? `<div style="font-size:10.5px;font-weight:800;color:${accentHex};margin-top:2px;">${tpl.headerCustomNote}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;min-width:210px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;">
          <div style="font-size:10.5px;font-weight:900;text-transform:uppercase;color:${sale.paymentMethod === 'credit' ? '#b45309' : accentHex};">
            ${sale.paymentMethod === 'credit' ? tpl.creditDocumentTitle : tpl.salesDocumentTitle}
          </div>
          <div style="font-size:17px;font-weight:900;font-family:monospace;margin-top:3px;color:#0f172a;">N° ${sale.saleNumber}</div>
          <div style="font-size:11px;color:#475569;margin-top:2px;">Fecha: <strong>${sale.date}</strong></div>
          ${tpl.caiNumber ? `<div style="font-size:10px;font-family:monospace;color:#334155;margin-top:2px;">CAI: <strong>${tpl.caiNumber}</strong></div>` : ''}
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

      ${
        tpl.caiRange || tpl.caiExpiryDate
          ? `<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:6px 12px;margin-bottom:12px;font-size:10.5px;font-family:monospace;color:#78350f;">
              ${tpl.caiRange ? `<span><strong>Rango Autorizado:</strong> ${tpl.caiRange}</span>` : ''}
              ${tpl.caiExpiryDate ? `<span><strong>Fecha Límite de Emisión:</strong> ${tpl.caiExpiryDate}</span>` : ''}
            </div>`
          : ''
      }

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:11.5px;">
        <div style="space-y:3px;">
          <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:3px;">DATOS DEL CLIENTE</div>
          <div><span style="color:#64748b;">Nombre / Razón Social:</span> <strong>${sale.customerName || 'Consumidor Final'}</strong></div>
          ${tpl.showCustomerRtn ? `<div><span style="color:#64748b;">RTN / Identidad:</span> <strong>${sale.customerRtn || 'Consumidor Final'}</strong></div>` : ''}
          ${tpl.showCustomerPhone ? `<div><span style="color:#64748b;">Teléfono / WhatsApp:</span> <strong>${sale.customerPhone || 'No registrado'}</strong></div>` : ''}
        </div>
        <div style="text-align:right;">
          <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:3px;">CONDICIONES DE LA TRANSACCIÓN</div>
          <div><span style="color:#64748b;">Modalidad de Pago:</span> <strong>${getPaymentMethodLabel(sale.paymentMethod)}</strong></div>
          ${tpl.showSellerName ? `<div><span style="color:#64748b;">${tpl.issuerLabel || 'Atendido por'}:</span> <strong>${resolvedSeller}</strong></div>` : ''}
          <div><span style="color:#64748b;">Fecha Vencimiento:</span> <strong>${sale.creditDueDate || 'Inmediato (Contado)'}</strong></div>
        </div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:11px;margin-bottom:14px;">
        <thead>
          <tr style="${
            tpl.templateStyle === 'minimal'
              ? 'background:#f8fafc;color:#0f172a;border-bottom:2px solid #0f172a;'
              : `background:${accentHex};color:#ffffff;`
          }">
            <th style="width:6%;" class="text-center">#</th>
            ${tpl.showItemCode ? `<th style="width:15%;">CÓDIGO / SKU</th>` : ''}
            <th>DESCRIPCIÓN DEL ARTÍCULO</th>
            <th class="text-center" style="width:8%;">CANT.</th>
            <th class="text-right" style="width:11%;">PRECIO BASE</th>
            ${tpl.showItemDiscount ? `<th class="text-right" style="width:9%;">DESC.</th>` : ''}
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
                  ${tpl.showItemCode ? `<td style="font-family:monospace;font-weight:700;">${it.code}</td>` : ''}
                  <td>
                    <strong>${it.name}</strong>${it.size ? ` <span style="color:#475569;">(Talla: ${it.size})</span>` : ''}
                  </td>
                  <td class="text-center font-bold">${it.quantity}</td>
                  <td class="text-right">${formatCurrencyL(orig)}</td>
                  ${
                    tpl.showItemDiscount
                      ? `<td class="text-right" style="color:${disc > 0 ? '#e11d48' : '#64748b'};">${disc > 0 ? `-${formatCurrencyL(disc)}` : 'L. 0.00'}</td>`
                      : ''
                  }
                  <td class="text-right font-bold">${formatCurrencyL(it.subtotal)}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>

      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:20px;">
        <div style="flex:1;font-size:11px;color:#334155;">
          ${
            tpl.showAmountInWords
              ? `<div style="padding:8px 12px;background:#f1f5f9;border-left:3px solid ${accentHex};border-radius:4px;font-weight:800;color:#0f172a;margin-bottom:8px;">
                  ${amountWords}
                </div>`
              : ''
          }
          <div><strong>Total Unidades Facturadas:</strong> ${sale.totalItems} ${sale.totalItems === 1 ? 'unidad' : 'unidades'} (${(sale.items || []).length} líneas)</div>
          ${sale.notes ? `<div style="margin-top:6px;padding:8px;background:#fffbeb;border:1px solid #fde68a;border-radius:6px;"><strong>Observaciones:</strong> ${sale.notes}</div>` : ''}
          ${
            sale.warrantyInfo?.enabled
              ? `<div style="margin-top:6px;padding:9px 12px;background:#ecfdf5;border:1.5px solid #059669;border-radius:8px;font-size:10.5px;color:#064e3b;">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:3px;">
                    <strong style="color:#065f46;text-transform:uppercase;font-size:11px;">🛡️ CERTIFICADO DE GARANTÍA DE PRODUCTO</strong>
                    <span style="background:#059669;color:#ffffff;padding:1.5px 8px;border-radius:999px;font-weight:900;font-size:10px;">PLAZO: ${(sale.warrantyInfo.durationLabel || '30 Días').toUpperCase()}</span>
                  </div>
                  ${sale.warrantyInfo.serialOrModelNotes ? `<div style="margin-bottom:2px;"><strong>Serie / Modelo / Referencia:</strong> ${sale.warrantyInfo.serialOrModelNotes}</div>` : ''}
                  <div>${sale.warrantyInfo.coverageTerms || tpl.warrantyPolicyText || 'Garantía válida por defectos de fábrica presentando esta factura original.'}</div>
                </div>`
              : tpl.warrantyPolicyText
              ? `<div style="margin-top:6px;padding:8px 10px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px;font-size:10.5px;">
                  <strong style="display:block;color:#0f172a;text-transform:uppercase;">${tpl.warrantyTitle}:</strong>
                  ${tpl.warrantyPolicyText}
                </div>`
              : ''
          }
          ${
            tpl.showBankAccounts && activeBanks.length > 0
              ? `<div style="margin-top:6px;padding:8px 10px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;font-size:10.5px;color:#065f46;">
                  <strong style="display:block;text-transform:uppercase;">Cuentas Bancarias Oficiales (${storeName}):</strong>
                  ${activeBanks
                    .map(
                      (b) =>
                        `<div>• <strong>${b.bankName}</strong> (${b.accountType || 'Cuenta'}): <span style="font-family:monospace;font-weight:800;">${b.accountNumber}</span> — Titular: ${b.holderName}</div>`
                    )
                    .join('')}
                </div>`
              : ''
          }
          <div style="margin-top:8px;font-size:10.5px;color:#334155;">
            ${tpl.footerThankYouTitle ? `<strong style="color:#0f172a;">${tpl.footerThankYouTitle}</strong> — ` : ''}${footerText}
          </div>
        </div>
        <div style="width:280px;border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;background:#f8fafc;font-size:11.5px;">
          ${tpl.showItemDiscount && itemsSaved > 0 ? `<div style="display:flex;justify-content:space-between;color:#e11d48;margin-bottom:4px;"><span>Ahorro en Artículos:</span><span>-${formatCurrencyL(itemsSaved)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal Gravado / Exento:</span><strong>${formatCurrencyL(sale.subtotal)}</strong></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Descuento General:</span><span style="color:${sale.discount > 0 ? '#e11d48' : '#475569'};">-${formatCurrencyL(sale.discount || 0)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Impuesto (15% ISV):</span><strong>${formatCurrencyL(sale.tax || 0)}</strong></div>
          <div style="display:flex;justify-content:space-between;border-top:2px solid #0f172a;padding-top:6px;margin-top:4px;font-size:15px;font-weight:900;color:${accentHex};">
            <span>TOTAL NETO:</span>
            <span>${formatCurrencyL(sale.total)}</span>
          </div>
          ${
            sale.paymentMethod === 'cash'
              ? `
                <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px;padding-top:4px;border-top:1px dashed #cbd5e1;"><span>Efectivo Recibido:</span><strong>${formatCurrencyL(sale.amountPaid)}</strong></div>
                <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:800;color:${accentHex};"><span>Cambio Entregado:</span><span>${formatCurrencyL(sale.change)}</span></div>
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

      ${
        tpl.showSignatureLines
          ? `<div class="signatures" style="margin-top:${format === 'half-letter' ? '18px' : '30px'};">
              <div class="sig-block">
                <div class="sig-line"></div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;">${tpl.signatureLeftLabel} (${storeName})</div>
              </div>
              <div class="sig-block">
                <div class="sig-line"></div>
                <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;">${tpl.signatureRightLabel}</div>
              </div>
            </div>`
          : ''
      }
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
  const tpl = getEffectiveInvoiceTemplate(storeSettings);
  const accentRgb = hexToRgbTuple(tpl.accentColor, [4, 120, 87]);
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
    const estimatedHeight = Math.max(185, 145 + (sale.items?.length || 1) * 15);
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [pageWidth, estimatedHeight],
    });

    const marginX = format === '58mm' ? 3 : 4.5;
    const contentWidth = pageWidth - marginX * 2;
    let y = 6;

    // Logo in Thermal PDF
    const logoData = tpl.showLogo ? getCachedLogoDataUrl(storeSettings) : null;
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
    if (tpl.showTagline && storeSettings.tagline) {
      doc.text(storeSettings.tagline.slice(0, 38), pageWidth / 2, y, { align: 'center' });
      y += 3.2;
    }
    if (tpl.showStoreRtn && storeSettings.storeRtn) {
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
      y += 3.4;
    }
    if (tpl.headerCustomNote) {
      const noteLines = doc.splitTextToSize(tpl.headerCustomNote, contentWidth);
      doc.text(noteLines, pageWidth / 2, y, { align: 'center' });
      y += noteLines.length * 3.1;
    }
    if (tpl.caiNumber) {
      doc.text(`CAI: ${tpl.caiNumber.slice(0, 34)}`, pageWidth / 2, y, { align: 'center' });
      y += 3.2;
    }
    if (tpl.caiRange) {
      const rLines = doc.splitTextToSize(`Rango: ${tpl.caiRange}`, contentWidth);
      doc.text(rLines, pageWidth / 2, y, { align: 'center' });
      y += rLines.length * 3.1;
    }
    if (tpl.caiExpiryDate) {
      doc.text(`Limite Emision: ${tpl.caiExpiryDate}`, pageWidth / 2, y, { align: 'center' });
      y += 3.4;
    }

    doc.setLineWidth(0.3);
    doc.line(marginX, y, pageWidth - marginX, y);
    y += 3.8;

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.8);
    doc.text(
      (sale.paymentMethod === 'credit' ? tpl.creditDocumentTitle : tpl.thermalDocumentTitle).toUpperCase(),
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
    if (tpl.showCustomerRtn && sale.customerRtn) {
      doc.text(`RTN/ID: ${sale.customerRtn}`, marginX, y);
      y += 3.4;
    }
    if (tpl.showCustomerPhone && sale.customerPhone) {
      doc.text(`Tel: ${sale.customerPhone}`, marginX, y);
      y += 3.4;
    }
    if (tpl.showSellerName) {
      const issuerTag = (tpl.issuerLabel || 'Atendido por').slice(0, 16);
      const issuerVal = resolveInvoiceIssuerName(
        sellerLabel || sale.cashier,
        tpl.defaultIssuerName,
        'Admin'
      ).slice(0, 26);
      doc.text(`${issuerTag}: ${issuerVal}`, marginX, y);
      y += 3.4;
    }

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
        `${tpl.showItemCode ? `Cod: ${it.code} ` : ''}@ ${formatCurrencyL(it.price)}${
          tpl.showItemDiscount && Number(it.unitDiscount) > 0
            ? ` (-${formatCurrencyL(Number(it.unitDiscount))})`
            : ''
        }`,
        marginX + 2,
        y
      );
      doc.setFontSize(7.5);
      y += 3.6;
    });

    doc.line(marginX, y, pageWidth - marginX, y);
    y += 3.8;

    if (tpl.showItemDiscount && itemsSaved > 0) {
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

    if (tpl.showAmountInWords) {
      doc.setFontSize(6.6);
      const wordLines = doc.splitTextToSize(amountWords, contentWidth);
      doc.text(wordLines, marginX, y);
      y += wordLines.length * 3 + 1.5;
    }

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

    if (tpl.showQrCode) {
      drawDeterministicQrCode(doc, (pageWidth - 18) / 2, y + 1, 18, `${sale.saleNumber}-${sale.total}`);
      y += 22;
    }

    if (sale.warrantyInfo?.enabled) {
      doc.setFont('courier', 'bold');
      doc.setFontSize(7);
      const wHeader = `GARANTIA: ${(sale.warrantyInfo.durationLabel || '30 Dias').toUpperCase()}`;
      doc.text(wHeader, pageWidth / 2, y, { align: 'center' });
      y += 3.2;
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      if (sale.warrantyInfo.serialOrModelNotes) {
        const sLines = doc.splitTextToSize(`Serie/Mod: ${sale.warrantyInfo.serialOrModelNotes}`, contentWidth);
        doc.text(sLines, pageWidth / 2, y, { align: 'center' });
        y += sLines.length * 2.8;
      }
      const wBody =
        sale.warrantyInfo.coverageTerms ||
        tpl.warrantyPolicyText ||
        'Garantia valida por defectos de fabrica presentando este ticket original.';
      const wLines = doc.splitTextToSize(wBody, contentWidth);
      doc.text(wLines, pageWidth / 2, y, { align: 'center' });
      y += wLines.length * 2.8 + 1.8;
    } else if (tpl.warrantyPolicyText) {
      doc.setFont('courier', 'normal');
      doc.setFontSize(6.5);
      const wLines = doc.splitTextToSize(`${tpl.warrantyTitle}: ${tpl.warrantyPolicyText}`, contentWidth);
      doc.text(wLines, pageWidth / 2, y, { align: 'center' });
      y += wLines.length * 2.8 + 1.5;
    }

    doc.setFont('courier', 'bold');
    doc.setFontSize(7.2);
    if (tpl.footerThankYouTitle) {
      doc.text(tpl.footerThankYouTitle, pageWidth / 2, y, { align: 'center' });
      y += 3.2;
    }
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
    documentTitle: isCredit ? tpl.creditDocumentTitle : tpl.salesDocumentTitle,
    documentNumber: `N° ${sale.saleNumber}`,
    dateLabel: `Emisión: ${sale.date}`,
    accentRgb: isCredit ? [180, 83, 9] : accentRgb,
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
  if (tpl.showCustomerRtn) {
    doc.text(`RTN / Identidad: ${sale.customerRtn || 'Consumidor Final'}`, 18, y + 14.2);
  }
  if (tpl.showCustomerPhone) {
    doc.text(`Teléfono / WhatsApp: ${sale.customerPhone || 'No registrado'}`, 18, y + 18.8);
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(`Método de Pago: ${getPaymentMethodLabel(sale.paymentMethod)}`, midX + 4, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(51, 65, 85);
  if (tpl.showSellerName) {
    const resolvedPdfSeller = resolveInvoiceIssuerName(
      sellerLabel || sale.cashier,
      tpl.defaultIssuerName,
      'Administrador'
    );
    doc.text(
      `${tpl.issuerLabel || 'Atendido por'}: ${resolvedPdfSeller}`,
      midX + 4,
      y + 14.2
    );
  }
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
        tpl.showItemCode ? it.code || '-' : '-',
        `${it.name}${it.size ? ` (Talla: ${it.size})` : ''}`,
        String(it.quantity),
        formatCurrencyL(origPrice),
        tpl.showItemDiscount && unitDisc > 0 ? `-${formatCurrencyL(unitDisc)}` : 'L. 0.00',
        formatCurrencyL(it.price),
        formatCurrencyL(it.subtotal),
      ];
    }),
    theme: tpl.templateStyle === 'minimal' ? 'plain' : 'grid',
    headStyles: {
      fillColor: tpl.templateStyle === 'minimal' ? [241, 245, 249] : accentRgb,
      textColor: tpl.templateStyle === 'minimal' ? [15, 23, 42] : 255,
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
  if (tpl.showAmountInWords) {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, summaryY, leftColWidth, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);
    doc.text(amountWords, 17, summaryY + 6.3);
  }

  // QR + Verification Block
  const qrY = summaryY + 13;
  const textInfoX = tpl.showQrCode ? 41 : 15;
  if (tpl.showQrCode) {
    drawDeterministicQrCode(doc, 15, qrY, 22, `${storeName}|${sale.saleNumber}|${sale.total}`);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);
  doc.text('RESUMEN DE PAGO Y VERIFICACIÓN', textInfoX, qrY + 4);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `Artículos facturados: ${sale.totalItems} uds (${(sale.items || []).length} productos)`,
    textInfoX,
    qrY + 8.5
  );

  if (sale.paymentMethod === 'cash') {
    doc.text(
      `Efectivo Recibido: ${formatCurrencyL(sale.amountPaid)}   |   Cambio Entregado: ${formatCurrencyL(sale.change)}`,
      textInfoX,
      qrY + 13
    );
  } else if (isCredit) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 83, 9);
    doc.text(
      `Abonado: ${formatCurrencyL(sale.amountPaid || 0)}   |   SALDO PENDIENTE: ${formatCurrencyL(balanceDue)}`,
      textInfoX,
      qrY + 13
    );
  } else {
    doc.text(`Pago confirmado vía ${getPaymentMethodLabel(sale.paymentMethod)}`, textInfoX, qrY + 13);
  }

  if (sale.notes) {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    doc.text(`Observaciones: ${sale.notes.slice(0, 75)}`, textInfoX, qrY + 17.5);
  } else if (tpl.warrantyPolicyText) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    doc.text(
      `${tpl.warrantyTitle}: ${tpl.warrantyPolicyText.slice(0, 85)}`,
      textInfoX,
      qrY + 17.5
    );
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
  doc.setFillColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.roundedRect(finBoxX + 2, fy, finBoxW - 4, 10, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(255, 255, 255);
  doc.text('TOTAL L.:', labelX + 1, fy + 6.5);
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(formatCurrencyL(sale.total), valX - 1, fy + 6.5, { align: 'right' });

  let afterSummaryY = summaryY + 42;

  // Dedicated Warranty Certificate Box in Letter / Half-Letter PDF when enabled
  if (sale.warrantyInfo?.enabled && afterSummaryY + 24 < pageHeight - 20) {
    const wBoxTerms =
      sale.warrantyInfo.coverageTerms ||
      tpl.warrantyPolicyText ||
      'Garantía válida por defectos de fábrica presentando esta factura original.';
    const wrappedTerms = doc.splitTextToSize(wBoxTerms, pageWidth - 36);
    const boxH = Math.max(18, 10 + wrappedTerms.length * 3.6 + (sale.warrantyInfo.serialOrModelNotes ? 4 : 0));

    doc.setFillColor(236, 253, 245);
    doc.setDrawColor(5, 150, 105);
    doc.setLineWidth(0.4);
    doc.roundedRect(14, afterSummaryY, pageWidth - 28, boxH, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(6, 95, 70);
    doc.text(
      `CERTIFICADO DE GARANTÍA — PLAZO: ${(sale.warrantyInfo.durationLabel || '30 DÍAS').toUpperCase()}`,
      18,
      afterSummaryY + 5.5
    );

    let wy = afterSummaryY + 10;
    if (sale.warrantyInfo.serialOrModelNotes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.8);
      doc.setTextColor(15, 23, 42);
      doc.text(`Serie / Modelo / Detalle: ${sale.warrantyInfo.serialOrModelNotes}`, 18, wy);
      wy += 4.2;
    }

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(6, 78, 59);
    doc.text(wrappedTerms, 18, wy);

    afterSummaryY += boxH + 6;
  }

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
  if (tpl.showSignatureLines && afterSummaryY + 22 < pageHeight - 16) {
    const sigY = afterSummaryY + 14;
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.35);
    doc.line(32, sigY, 92, sigY);
    doc.line(pageWidth - 92, sigY, pageWidth - 32, sigY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`${tpl.signatureLeftLabel.toUpperCase()} (${storeName.toUpperCase()})`, 62, sigY + 4.2, {
      align: 'center',
    });
    doc.text(tpl.signatureRightLabel.toUpperCase(), pageWidth - 62, sigY + 4.2, { align: 'center' });
  }

  drawPdfPageFooters(doc, storeSettings, `Factura ${sale.saleNumber}`);
  doc.save(`Factura_${sale.saleNumber}.pdf`);
}

// ============================================================================
// 1.B CERTIFICADO DE GARANTÍA DE PRODUCTO (HTML + PDF EJECUTIVO / TÉRMICO)
// ============================================================================
export function buildWarrantyCertificateHtml(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat,
  sellerDisplay?: string
): string {
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const isThermal = format === '80mm' || format === '58mm';
  const tpl = getEffectiveInvoiceTemplate(storeSettings);
  const accentHex = tpl.accentColor || '#047857';
  const effectiveIssuer = resolveInvoiceIssuerName(
    sellerDisplay || sale.cashier,
    tpl.defaultIssuerName,
    'Administrador'
  );
  const durationLabel = sale.warrantyInfo?.durationLabel || '30 Días';
  const serialNotes = sale.warrantyInfo?.serialOrModelNotes || '';
  const coverageTerms =
    sale.warrantyInfo?.coverageTerms ||
    tpl.warrantyPolicyText ||
    'Garantía válida por defectos de fábrica presentando esta factura o certificado original. No cubre daños por mal uso, golpes, humedad o variaciones de voltaje.';

  if (isThermal) {
    const itemsHtml = (sale.items || [])
      .map(
        (it) => `
        <div style="margin-bottom:4px; padding-bottom:3px; border-bottom:1px dotted #cbd5e1;">
          <div style="font-weight:800;">${it.quantity}x ${it.name}</div>
          <div style="font-size:0.88em; color:#334155;">Código: ${it.code} • Valor: ${formatCurrencyL(it.subtotal)}</div>
        </div>`
      )
      .join('');

    return `
      <div class="text-center">
        ${
          tpl.showLogo && storeSettings.logoUrl
            ? `<img src="${storeSettings.logoUrl}" alt="${storeName}" style="width:48px;height:48px;object-fit:contain;margin:0 auto 4px;display:block;border-radius:6px;" />`
            : ''
        }
        <div style="font-size:${format === '58mm' ? '13px' : '15px'};font-weight:900;text-transform:uppercase;">${storeName}</div>
        ${tpl.showStoreRtn && storeSettings.storeRtn ? `<div style="font-size:10px;font-weight:700;">RTN: ${storeSettings.storeRtn}</div>` : ''}
        ${storeSettings.address ? `<div style="font-size:10px;">${storeSettings.address}</div>` : ''}
        ${storeSettings.phone ? `<div style="font-size:10px;">Tel: ${storeSettings.phone}</div>` : ''}
        <div style="font-size:11px;font-weight:900;margin-top:4px;text-transform:uppercase;">🛡️ CERTIFICADO DE GARANTÍA</div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:${format === '58mm' ? '10px' : '11px'};">
        <div style="display:flex;justify-content:space-between;"><span>Factura / Ticket:</span><strong>${sale.saleNumber}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fecha Compra:</span><span>${sale.date}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Cliente:</span><strong>${sale.customerName || 'Consumidor Final'}</strong></div>
        ${sale.customerRtn ? `<div style="display:flex;justify-content:space-between;"><span>RTN / DNI:</span><span>${sale.customerRtn}</span></div>` : ''}
        ${sale.customerPhone ? `<div style="display:flex;justify-content:space-between;"><span>Teléfono:</span><span>${sale.customerPhone}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;"><span>Emitido por:</span><span>${effectiveIssuer}</span></div>
      </div>

      <div style="margin:6px 0; padding:6px; border:1.5px solid #000; border-radius:4px; text-align:center;">
        <div style="font-weight:900; font-size:1.05em; text-transform:uppercase;">🛡️ PLAZO DE GARANTÍA</div>
        <div style="font-weight:900; font-size:1.2em; margin-top:2px;">${durationLabel.toUpperCase()}</div>
        ${serialNotes ? `<div style="font-size:0.88em; margin-top:3px;"><strong>Serie / Modelo:</strong> ${serialNotes}</div>` : ''}
      </div>

      <div style="font-weight:800; font-size:0.9em; text-transform:uppercase; margin:4px 0 3px;">Artículos Cubiertos:</div>
      <div>${itemsHtml}</div>

      <div style="margin-top:6px; padding:6px; border:1px dashed #000; border-radius:4px; font-size:0.86em; line-height:1.35; text-align:justify;">
        <div style="font-weight:900; text-align:center; text-transform:uppercase; margin-bottom:3px;">Condiciones de Garantía</div>
        <div>${coverageTerms}</div>
      </div>

      <div class="dashed-line"></div>
      <div class="text-center" style="font-size:10px;margin-top:6px;">
        <strong>Conserve este Certificado de Garantía junto a su factura ${sale.saleNumber}.</strong>
      </div>
    `;
  }

  const rowsHtml = (sale.items || [])
    .map(
      (it, idx) => `
      <tr style="border-bottom:1px solid #e2e8f0;">
        <td class="text-center" style="font-family:monospace;">${idx + 1}</td>
        <td style="font-family:monospace;font-weight:700;">${it.code}</td>
        <td><strong>${it.name}</strong>${it.size ? ` (${it.size})` : ''}</td>
        <td class="text-center font-bold">${it.quantity}</td>
        <td class="text-right">${formatCurrencyL(it.price)}</td>
        <td class="text-right font-bold">${formatCurrencyL(it.subtotal)}</td>
      </tr>`
    )
    .join('');

  return `
    <div style="border:2px solid ${accentHex};border-radius:12px;padding:${format === 'half-letter' ? '16px' : '24px'};background:#ffffff;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;gap:16px;">
        <div>
          <h1 style="margin:0;font-size:21px;font-weight:900;text-transform:uppercase;color:#0f172a;">${storeName}</h1>
          ${storeSettings.storeRtn ? `<div style="font-size:11px;color:#0f172a;margin-top:2px;">RTN: <strong>${storeSettings.storeRtn}</strong></div>` : ''}
          <div style="font-size:11px;color:#475569;">
            ${[storeSettings.address, storeSettings.phone ? `Tel: ${storeSettings.phone}` : ''].filter(Boolean).join('  •  ')}
          </div>
        </div>
        <div style="text-align:right;min-width:210px;background:#ecfdf5;border:1.5px solid #059669;border-radius:10px;padding:10px 14px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#047857;">🛡️ CERTIFICADO DE GARANTÍA</div>
          <div style="font-size:16px;font-weight:900;font-family:monospace;margin-top:3px;color:#0f172a;">Factura ${sale.saleNumber}</div>
          <div style="font-size:11px;font-weight:800;color:#065f46;margin-top:2px;">Plazo: ${durationLabel.toUpperCase()}</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1.2fr 1fr;gap:12px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px 16px;margin-bottom:14px;font-size:11.5px;">
        <div>
          <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:3px;">DATOS DEL CLIENTE</div>
          <div>Nombre: <strong>${sale.customerName || 'Consumidor Final'}</strong></div>
          <div>RTN / Identidad: <strong>${sale.customerRtn || 'N/A'}</strong> &nbsp;|&nbsp; Teléfono: <strong>${sale.customerPhone || 'N/A'}</strong></div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:#64748b;margin-bottom:3px;">REGISTRO DE EMISIÓN</div>
          <div>Fecha de Compra: <strong>${sale.date}</strong></div>
          <div>Emitido por: <strong>${effectiveIssuer}</strong></div>
        </div>
      </div>

      ${
        serialNotes
          ? `<div style="margin-bottom:12px; padding:10px 14px; background:#ecfdf5; border:1px solid #10b981; border-radius:8px; font-size:12px; color:#064e3b;">
              <strong>Serie / Modelo / Identificación del Producto:</strong> ${serialNotes}
            </div>`
          : ''
      }

      <table style="border:1px solid #cbd5e1;font-size:11px;margin-bottom:14px;">
        <thead>
          <tr style="background:${accentHex};color:#ffffff;">
            <th class="text-center" style="width:45px;">#</th>
            <th style="width:110px;">Código</th>
            <th>Descripción del Artículo Garantizado</th>
            <th class="text-center" style="width:75px;">Cant.</th>
            <th class="text-right" style="width:110px;">Precio Unit.</th>
            <th class="text-right" style="width:115px;">Valor Total</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div style="margin-top:14px; padding:14px; background:#f8fafc; border:1.5px solid #047857; border-radius:10px;">
        <div style="font-size:12px; font-weight:900; color:#065f46; text-transform:uppercase; margin-bottom:6px;">
          🛡️ Términos, Cobertura y Condiciones de Garantía (${durationLabel})
        </div>
        <div style="font-size:11.5px; color:#1e293b; line-height:1.55; white-space:pre-line;">
          ${coverageTerms}
        </div>
        <div style="font-size:10.5px; color:#475569; margin-top:8px; border-top:1px dashed #cbd5e1; padding-top:6px;">
          Para hacer efectiva esta garantía es indispensable presentar este Certificado o la Factura original N° <strong>${sale.saleNumber}</strong> en <strong>${storeName}</strong>.
        </div>
      </div>

      <div class="signatures" style="margin-top:28px;">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;">SELLO Y FIRMA AUTORIZADA (${storeName.toUpperCase()})</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#475569;">FIRMA DE CONFORMIDAD DEL CLIENTE</div>
        </div>
      </div>
    </div>
  `;
}

export async function downloadWarrantyCertificatePdf(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat = 'letter',
  sellerDisplay?: string
): Promise<void> {
  const saleWithWarranty: SaleRecord = {
    ...sale,
    warrantyInfo: {
      enabled: true,
      durationLabel: sale.warrantyInfo?.durationLabel || '30 Días',
      serialOrModelNotes: sale.warrantyInfo?.serialOrModelNotes || '',
      coverageTerms:
        sale.warrantyInfo?.coverageTerms ||
        getEffectiveInvoiceTemplate(storeSettings).warrantyPolicyText ||
        'Garantía válida por defectos de fábrica presentando su factura original. No cubre daños por mal uso, golpes, humedad o variaciones de voltaje.',
    },
  };
  await downloadSalePdf(saleWithWarranty, storeSettings, format, sellerDisplay);
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
  const tpl = getEffectiveInvoiceTemplate(storeSettings);
  const accentHex = tpl.accentColor || '#4338ca';
  const amountWords = numberToSpanishWords(invoice.total);

  if (isThermal) {
    return `
      <div class="text-center">
        <div style="font-size:14px;font-weight:900;text-transform:uppercase;">${storeName}</div>
        <div style="font-size:10px;font-weight:700;">${tpl.purchaseDocumentTitle}</div>
      </div>
      <div class="dashed-line"></div>
      <div style="font-size:10.5px;">
        <div style="display:flex;justify-content:space-between;"><span>Factura Prov:</span><strong>${invoice.invoiceNumber}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Proveedor:</span><strong>${invoice.supplierName}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Bodega Destino:</span><strong>${invoice.warehouseName || 'Tienda Principal'}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span>Fecha:</span><span>${invoice.date}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>Condición:</span><span>${invoice.paymentCondition === 'credit' ? 'Crédito' : 'Contado'}</span></div>
        ${tpl.showSellerName ? `<div style="display:flex;justify-content:space-between;"><span>${tpl.issuerLabel || 'Recibido por'}:</span><strong>${resolveInvoiceIssuerName(invoice.receivedBy, tpl.defaultIssuerName, 'Administrador')}</strong></div>` : ''}
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
                  <div style="font-size:9px;color:#334155;">${tpl.showItemCode ? `${it.code} • ` : ''}@ ${formatCurrencyL(it.cost)}</div>
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
    <div style="border:${tpl.templateStyle === 'corporate' ? `2px solid ${accentHex}` : '1px solid #cbd5e1'};border-radius:12px;padding:22px;background:#ffffff;">
      ${
        tpl.templateStyle !== 'minimal'
          ? `<div style="height:5px;background:linear-gradient(90deg,#1e1b4b 0%,${accentHex} 100%);border-radius:6px;margin-bottom:14px;"></div>`
          : ''
      }
      <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
        <div>
          <h1 style="margin:0;font-size:20px;font-weight:900;text-transform:uppercase;">${storeName}</h1>
          <div style="font-size:12px;font-weight:800;color:${accentHex};">${tpl.purchaseDocumentTitle}</div>
          <div style="font-size:11px;color:#475569;">${[tpl.showStoreRtn && storeSettings.storeRtn ? `RTN: ${storeSettings.storeRtn}` : '', storeSettings.address, storeSettings.phone].filter(Boolean).join(' • ')}</div>
        </div>
        <div style="text-align:right;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;">
          <div style="font-size:15px;font-weight:900;font-family:monospace;">Factura N° ${invoice.invoiceNumber}</div>
          <div style="font-size:11px;color:#475569;">Fecha de Recepción: <strong>${invoice.date}</strong></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:11.5px;">
        <div>
          <div><span style="color:#64748b;">Proveedor Comercial:</span> <strong>${invoice.supplierName}</strong></div>
          <div><span style="color:#64748b;">Bodega Destino de Artículos:</span> <strong style="color:${accentHex};">${invoice.warehouseName || 'Tienda Principal'}</strong></div>
          ${tpl.showSellerName ? `<div><span style="color:#64748b;">${tpl.issuerLabel || 'Recibido en Bodega por'}:</span> <strong>${resolveInvoiceIssuerName(invoice.receivedBy, tpl.defaultIssuerName, 'Administrador')}</strong></div>` : ''}
        </div>
        <div style="text-align:right;">
          <div><span style="color:#64748b;">Condición de Pago:</span> <strong>${invoice.paymentCondition === 'credit' ? 'CRÉDITO PROVEEDOR' : 'CONTADO PAGADO'}</strong></div>
          <div><span style="color:#64748b;">Fecha Vencimiento:</span> <strong>${invoice.dueDate || 'Inmediato'}</strong></div>
        </div>
      </div>

      <table style="border:1px solid #cbd5e1;font-size:11px;margin-bottom:14px;">
        <thead>
          <tr style="${
            tpl.templateStyle === 'minimal'
              ? 'background:#f8fafc;color:#0f172a;border-bottom:2px solid #0f172a;'
              : `background:${accentHex};color:#ffffff;`
          }">
            <th>#</th>
            ${tpl.showItemCode ? `<th>CÓDIGO</th>` : ''}
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
                ${tpl.showItemCode ? `<td style="font-family:monospace;font-weight:700;">${it.code}</td>` : ''}
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
          ${
            tpl.showAmountInWords
              ? `<div style="padding:7px 10px;background:#f1f5f9;border-left:3px solid ${accentHex};font-weight:800;color:#0f172a;margin-bottom:6px;">${amountWords}</div>`
              : ''
          }
          <strong>Unidades Ingresadas al Stock:</strong> ${invoice.totalItems} unidades (${(invoice.items || []).length} referencias)
          ${invoice.notes ? `<div style="margin-top:6px;"><strong>Observaciones:</strong> ${invoice.notes}</div>` : ''}
        </div>
        <div style="width:260px;border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc;font-size:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>Subtotal Costo:</span><strong>${formatCurrencyL(invoice.subtotal)}</strong></div>
          <div style="display:flex;justify-content:space-between;color:#e11d48;margin-bottom:4px;"><span>Descuento Proveedor:</span><span>-${formatCurrencyL(invoice.discount || 0)}</span></div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;"><span>15% ISV Compra:</span><strong>${formatCurrencyL(invoice.tax || 0)}</strong></div>
          <div style="display:flex;justify-content:space-between;border-top:2px solid #0f172a;padding-top:6px;font-size:14px;font-weight:900;color:${accentHex};">
            <span>TOTAL COMPRA:</span>
            <span>${formatCurrencyL(invoice.total)}</span>
          </div>
        </div>
      </div>

      ${
        tpl.showSignatureLines
          ? `<div class="signatures">
              <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Recibido Conforme Bodega</div></div>
              <div class="sig-block"><div class="sig-line"></div><div style="font-size:10px;font-weight:700;">Autorizado Administración (${storeName})</div></div>
            </div>`
          : ''
      }
    </div>
  `;
}

export async function downloadPurchaseInvoicePdf(
  invoice: PurchaseInvoice,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const tpl = getEffectiveInvoiceTemplate(storeSettings);
  const accentRgb = hexToRgbTuple(tpl.accentColor, [67, 56, 202]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: tpl.purchaseDocumentTitle,
    documentNumber: `N° ${invoice.invoiceNumber}`,
    dateLabel: `Fecha Compra: ${invoice.date}`,
    accentRgb,
    statusBadge:
      invoice.status === 'cancelled'
        ? { text: 'ANULADA', bgRgb: [254, 226, 226], textRgb: [185, 28, 28] }
        : invoice.paymentCondition === 'credit'
        ? { text: 'CRÉDITO PROV.', bgRgb: [254, 243, 199], textRgb: [180, 83, 9] }
        : { text: 'PAGADO', bgRgb: [224, 231, 255], textRgb: [67, 56, 202] },
  });

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, y, pageWidth - 28, 22, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text(`Proveedor: ${invoice.supplierName}`, 18, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
  doc.text(`Bodega Destino: ${invoice.warehouseName || 'Tienda Principal'}`, 18, y + 12);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(71, 85, 105);
  if (tpl.showSellerName) {
    doc.text(
      `${tpl.issuerLabel || 'Recibido en Inventario por'}: ${resolveInvoiceIssuerName(invoice.receivedBy, tpl.defaultIssuerName, 'Administrador')}`,
      18,
      y + 17.5
    );
  }

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Condición: ${invoice.paymentCondition === 'credit' ? 'CRÉDITO A PROVEEDOR' : 'CONTADO'}`,
    pageWidth - 18,
    y + 6,
    { align: 'right' }
  );
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Vencimiento: ${invoice.dueDate || 'Inmediato'}  |  Unidades: ${invoice.totalItems} uds`,
    pageWidth - 18,
    y + 12,
    { align: 'right' }
  );
  y += 27;

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
      tpl.showItemCode ? it.code : '-',
      it.name,
      [it.category, it.size ? `Talla ${it.size}` : ''].filter(Boolean).join(' • ') || 'General',
      String(it.quantity),
      formatCurrencyL(it.cost),
      formatCurrencyL(it.salePrice || (it as any).price || 0),
      formatCurrencyL(it.subtotal),
    ]),
    theme: tpl.templateStyle === 'minimal' ? 'plain' : 'grid',
    headStyles: {
      fillColor: tpl.templateStyle === 'minimal' ? [241, 245, 249] : accentRgb,
      textColor: tpl.templateStyle === 'minimal' ? [15, 23, 42] : 255,
      fontSize: 8,
    },
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
  if (tpl.showAmountInWords) {
    doc.setFillColor(241, 245, 249);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, finalY, pageWidth - 28 - 72, 10, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.8);
    doc.setTextColor(15, 23, 42);
    doc.text(numberToSpanishWords(invoice.total), 17, finalY + 6.3);
  }

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
  doc.setTextColor(accentRgb[0], accentRgb[1], accentRgb[2]);
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
  const cellPad = isThermal ? '5px 4px' : '8px 12px';

  return `
    <div style="font-variant-numeric:tabular-nums;">
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px;">
        <div style="font-size:${isThermal ? '15px' : '20px'};font-weight:900;text-transform:uppercase;letter-spacing:-0.01em;color:#0f172a;">${storeName}</div>
        ${storeSettings.address || storeSettings.phone ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px;">${[storeSettings.address, storeSettings.phone ? `Tel: ${storeSettings.phone}` : ''].filter(Boolean).join(' • ')}</div>` : ''}
        <div style="font-size:${isThermal ? '11.5px' : '13.5px'};font-weight:800;color:#0f172a;margin-top:6px;">ESTADO DE RESULTADOS Y GASTOS OPERATIVOS</div>
        <div style="font-size:11px;color:#475569;margin-top:2px;">Período evaluado: <strong>${data.periodLabel}</strong> • Emisión: ${new Date().toLocaleDateString('es-HN')}</div>
      </div>

      ${
        !isThermal
          ? `
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px;">
          <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;background:#f8fafc;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#64748b;">1. Utilidad Bruta (${data.salesCount} ventas)</div>
            <div style="font-size:16px;font-weight:900;color:#0f172a;margin-top:3px;">${formatCurrencyL(data.grossProfit)}</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">Ventas: ${formatCurrencyL(data.grossSalesRevenue)}</div>
          </div>
          <div style="border:1px solid #fecdd3;border-radius:8px;padding:10px 12px;background:#fff1f2;">
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#be123c;">2. (−) Gastos Operativos (${data.expenses.length})</div>
            <div style="font-size:16px;font-weight:900;color:#e11d48;margin-top:3px;">− ${formatCurrencyL(data.totalOperatingExpenses)}</div>
            <div style="font-size:10px;color:#9f1239;margin-top:2px;">Gastos registrados del local</div>
          </div>
          <div style="border:1px solid ${data.netFreeProfit >= 0 ? '#a7f3d0' : '#fecdd3'};border-radius:8px;padding:10px 12px;background:${data.netFreeProfit >= 0 ? '#ecfdf5' : '#fff1f2'};">
            <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:${data.netFreeProfit >= 0 ? '#065f46' : '#9f1239'};">3. (=) Ganancia Neta Libre</div>
            <div style="font-size:16px;font-weight:900;color:${data.netFreeProfit >= 0 ? '#047857' : '#be123c'};margin-top:3px;">${formatCurrencyL(data.netFreeProfit)}</div>
            <div style="font-size:10px;color:#475569;margin-top:2px;">Margen neto: ${(Number(data.netMarginPct) || 0).toFixed(1)}%</div>
          </div>
        </div>
      `
          : ''
      }

      <div style="border:1px solid #cbd5e1;border-radius:8px;padding:${isThermal ? '10px' : '14px 16px'};background:#ffffff;margin-bottom:18px;font-size:${isThermal ? '11px' : '12.5px'};">
        <div style="font-weight:800;font-size:11px;text-transform:uppercase;color:#475569;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:6px;">
          Resumen Contable de Utilidad
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;gap:12px;">
          <span style="color:#334155;">(+) Ingresos por Ventas (${data.salesCount} transacciones)</span>
          <strong style="color:#0f172a;white-space:nowrap;">${formatCurrencyL(data.grossSalesRevenue)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;gap:12px;">
          <span style="color:#475569;">(−) Costo de Mercadería Vendida (CMV)</span>
          <span style="color:#475569;white-space:nowrap;">− ${formatCurrencyL(data.totalCostOfGoods)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:7px 0;margin:4px 0;border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8;font-weight:800;color:#047857;gap:12px;">
          <span>(=) UTILIDAD BRUTA DE VENTAS</span>
          <span style="white-space:nowrap;">${formatCurrencyL(data.grossProfit)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;color:#e11d48;gap:12px;">
          <span>(−) Gastos Operativos del Local (${data.expenses.length} registros)</span>
          <strong style="white-space:nowrap;">− ${formatCurrencyL(data.totalOperatingExpenses)}</strong>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;border-top:2px solid #0f172a;padding-top:10px;font-size:${isThermal ? '13px' : '15px'};font-weight:900;color:${data.netFreeProfit >= 0 ? '#047857' : '#be123c'};gap:12px;">
          <span>(=) GANANCIA NETA LIBRE (${(Number(data.netMarginPct) || 0).toFixed(1)}%)</span>
          <span style="white-space:nowrap;">${formatCurrencyL(data.netFreeProfit)}</span>
        </div>
      </div>

      <div style="font-weight:800;font-size:11.5px;text-transform:uppercase;color:#334155;margin-bottom:8px;">
        Desglose de Gastos Operativos (${data.expenses.length})
      </div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-size:${isThermal ? '10px' : '11.5px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th style="padding:${cellPad};text-align:left;">FECHA</th>
            <th style="padding:${cellPad};text-align:left;">CATEGORÍA</th>
            <th style="padding:${cellPad};text-align:left;">DESCRIPCIÓN</th>
            <th style="padding:${cellPad};text-align:right;">MONTO</th>
          </tr>
        </thead>
        <tbody>
          ${
            data.expenses.length === 0
              ? `<tr><td colspan="4" style="padding:16px;text-align:center;color:#64748b;">No hay gastos operativos registrados en este período.</td></tr>`
              : data.expenses
                  .map(
                    (e, idx) => `
                    <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      <td style="padding:${cellPad};white-space:nowrap;color:#475569;">${e.date}</td>
                      <td style="padding:${cellPad};font-weight:700;color:#0f172a;">${e.category}</td>
                      <td style="padding:${cellPad};color:#334155;">${e.description}</td>
                      <td style="padding:${cellPad};text-align:right;font-weight:800;color:#e11d48;white-space:nowrap;">− ${formatCurrencyL(e.amount)}</td>
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
            <th>BODEGA DESTINO</th>
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
                <td><strong style="color:#4338ca;">${p.warehouseName || 'Tienda Principal'}</strong></td>
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
    head: [['N° Factura', 'Proveedor', 'Bodega Destino', 'Fecha Compra', 'Condición de Pago', 'Uds.', 'Total Factura']],
    body: purchasesList.map((p) => [
      p.invoiceNumber,
      p.supplierName,
      p.warehouseName || 'Tienda Principal',
      p.date,
      p.paymentCondition === 'credit' ? `Crédito (${p.dueDate || 'Pend.'})` : 'Contado',
      String(p.totalItems),
      p.status === 'cancelled' ? `ANULADA (${formatCurrencyL(p.total)})` : formatCurrencyL(p.total),
    ]),
    theme: 'grid',
    headStyles: { fillColor: [30, 27, 75], textColor: 255, fontSize: 8.2 },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      2: { fontStyle: 'bold' },
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

// ============================================================================
// 12. REPORTE DE REGISTRO DE MOVIMIENTOS DEL PERSONAL (HTML + PDF EJECUTIVO)
// ============================================================================
function getActivityModuleLabelEs(moduleKey: string): string {
  switch (moduleKey) {
    case 'sales':
      return 'Ventas (POS)';
    case 'inventory':
      return 'Inventario';
    case 'purchases':
      return 'Compras';
    case 'audit':
      return 'Auditoría';
    case 'users':
      return 'Usuarios';
    case 'suppliers':
      return 'Proveedores';
    case 'settings':
      return 'Configuración';
    case 'catalog':
      return 'Catálogo';
    case 'warehouses':
      return 'Bodegas y Traslados';
    default:
      return moduleKey || 'General';
  }
}

function splitActivityDateTime(rawDate: string): { fecha: string; hora: string } {
  if (!rawDate) return { fecha: '-', hora: '-' };
  if (rawDate.includes(',')) {
    const [d, t] = rawDate.split(',');
    return { fecha: d.trim(), hora: (t || '').trim() || '-' };
  }
  const parts = rawDate.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { fecha: parts[0], hora: parts.slice(1).join(' ') };
  }
  return { fecha: rawDate.trim(), hora: '-' };
}

export function buildActivityLogReportHtml(
  logs: ActivityLogRecord[],
  storeSettings: StoreSettings,
  format: PrinterPaperFormat,
  filterSummary?: string
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'Tienda Gosén';
  const cellPad = isThermal ? '5px 4px' : '9px 12px';
  const adminCount = logs.filter((l) => l.userRole === 'admin').length;
  const collabCount = logs.length - adminCount;
  const salesActions = logs.filter((l) => l.module === 'sales').length;

  return `
    <div style="font-variant-numeric:tabular-nums;">
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:16px;">
        <div style="font-size:${isThermal ? '15px' : '20px'};font-weight:900;text-transform:uppercase;color:#0f172a;">${storeName}</div>
        ${storeSettings.address || storeSettings.phone ? `<div style="font-size:10.5px;color:#64748b;margin-top:2px;">${[storeSettings.address, storeSettings.phone ? `Tel: ${storeSettings.phone}` : ''].filter(Boolean).join(' • ')}</div>` : ''}
        <div style="font-size:${isThermal ? '11.5px' : '14px'};font-weight:800;color:#1e1b4b;margin-top:5px;">REPORTE DE AUDITORÍA Y MOVIMIENTOS DEL PERSONAL</div>
        <div style="font-size:11px;color:#475569;margin-top:3px;">${filterSummary || 'Todos los movimientos'} • Emisión: ${new Date().toLocaleString('es-HN')}</div>
      </div>

      ${
        !isThermal
          ? `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px;">
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Total Movimientos</div>
            <div style="font-size:16px;font-weight:900;color:#0f172a;margin-top:2px;">${logs.length}</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Administradores</div>
            <div style="font-size:16px;font-weight:900;color:#b45309;margin-top:2px;">${adminCount}</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Colaboradores</div>
            <div style="font-size:16px;font-weight:900;color:#047857;margin-top:2px;">${collabCount}</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:10px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Operaciones Ventas</div>
            <div style="font-size:16px;font-weight:900;color:#1d4ed8;margin-top:2px;">${salesActions}</div>
          </div>
        </div>
      `
          : ''
      }

      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-size:${isThermal ? '9.5px' : '11px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            ${isThermal ? '' : `<th style="padding:${cellPad};text-align:center;width:36px;">N°</th>`}
            <th style="padding:${cellPad};text-align:left;">FECHA</th>
            ${isThermal ? '' : `<th style="padding:${cellPad};text-align:left;">HORA</th>`}
            <th style="padding:${cellPad};text-align:left;">EMPLEADO</th>
            ${isThermal ? '' : `<th style="padding:${cellPad};text-align:left;">CARGO</th>`}
            ${isThermal ? '' : `<th style="padding:${cellPad};text-align:left;">MÓDULO</th>`}
            <th style="padding:${cellPad};text-align:left;">ACCIÓN REALIZADA</th>
            ${isThermal ? '' : `<th style="padding:${cellPad};text-align:left;">DETALLE OPERATIVO</th>`}
          </tr>
        </thead>
        <tbody>
          ${
            logs.length === 0
              ? `<tr><td colspan="${isThermal ? 3 : 8}" style="padding:16px;text-align:center;color:#64748b;">No hay movimientos registrados con los filtros actuales.</td></tr>`
              : logs
                  .map((l, idx) => {
                    const { fecha, hora } = splitActivityDateTime(l.date);
                    return `
                    <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                      ${isThermal ? '' : `<td style="padding:${cellPad};text-align:center;font-weight:700;color:#64748b;">${idx + 1}</td>`}
                      <td style="padding:${cellPad};white-space:nowrap;font-weight:700;color:#0f172a;">
                        ${fecha}
                        ${isThermal && hora !== '-' ? `<div style="font-size:8.5px;color:#64748b;font-weight:500;">${hora}</div>` : ''}
                      </td>
                      ${isThermal ? '' : `<td style="padding:${cellPad};white-space:nowrap;color:#475569;">${hora}</td>`}
                      <td style="padding:${cellPad};">
                        <strong style="color:#0f172a;">${l.userName}</strong>
                        ${isThermal ? `<div style="font-size:8.5px;color:#64748b;">${l.userRole === 'admin' ? 'Admin' : 'Colaborador'} • ${getActivityModuleLabelEs(l.module)}</div>` : ''}
                      </td>
                      ${
                        isThermal
                          ? ''
                          : `<td style="padding:${cellPad};white-space:nowrap;color:#475569;">${l.userRole === 'admin' ? 'Administrador' : 'Colaborador'}</td>`
                      }
                      ${
                        isThermal
                          ? ''
                          : `<td style="padding:${cellPad};font-weight:700;color:#334155;white-space:nowrap;">${getActivityModuleLabelEs(l.module)}</td>`
                      }
                      <td style="padding:${cellPad};">
                        <div style="font-weight:700;color:#0f172a;">${l.action}</div>
                        ${isThermal && l.details ? `<div style="font-size:9px;color:#475569;margin-top:2px;">${l.details}</div>` : ''}
                      </td>
                      ${
                        isThermal
                          ? ''
                          : `<td style="padding:${cellPad};color:#334155;line-height:1.4;">${l.details || '-'}</td>`
                      }
                    </tr>
                  `;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadActivityLogReportPdf(
  logs: ActivityLogRecord[],
  storeSettings: StoreSettings,
  filterSummary?: string
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const adminCount = logs.filter((l) => l.userRole === 'admin').length;
  const collabCount = logs.length - adminCount;
  const salesActions = logs.filter((l) => l.module === 'sales').length;

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'BITÁCORA DE MOVIMIENTOS DEL PERSONAL',
    documentNumber: `${logs.length} REGISTROS`,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [49, 46, 129],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Total Movimientos',
      value: `${logs.length}`,
      subtext: filterSummary || 'Historial auditado',
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Acciones Admin',
      value: `${adminCount}`,
      subtext: 'Rol Administrador',
      valueRgb: [180, 83, 9],
    },
    {
      label: 'Acciones Colaborador',
      value: `${collabCount}`,
      subtext: 'Operación de tienda',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Módulo de Ventas',
      value: `${salesActions}`,
      subtext: 'Facturación y caja',
      valueRgb: [29, 78, 216],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ['N°', 'Fecha', 'Hora', 'Empleado / Usuario', 'Cargo / Rol', 'Módulo', 'Acción Realizada', 'Detalle Operativo'],
    ],
    body: logs.map((l, idx) => {
      const { fecha, hora } = splitActivityDateTime(l.date);
      return [
        String(idx + 1),
        fecha,
        hora,
        l.userName,
        l.userRole === 'admin' ? 'Administrador' : 'Colaborador',
        getActivityModuleLabelEs(l.module),
        l.action,
        l.details || '-',
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.5, cellPadding: 3 },
    bodyStyles: { fontSize: 8, cellPadding: 2.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 11 },
      1: { cellWidth: 23, fontStyle: 'bold' },
      2: { cellWidth: 23 },
      3: { cellWidth: 34, fontStyle: 'bold' },
      4: { cellWidth: 25 },
      5: { cellWidth: 26, fontStyle: 'bold' },
      6: { cellWidth: 52 },
      7: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Registro de Movimientos del Personal');
  doc.save(`Bitacora_Movimientos_Personal_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 13. BODEGAS, TRASLADOS Y MOVIMIENTOS DE BODEGA (COMPROBANTE + HISTORIAL + STOCK PDF/HTML)
// ============================================================================
function getMovementTypeLabel(movementType?: string): string {
  if (movementType === 'entry') return 'INGRESO A BODEGA';
  if (movementType === 'adjustment') return 'ASIGNACIÓN DE STOCK';
  return 'TRASLADO ENTRE BODEGAS';
}

export function buildWarehouseTransferReceiptHtml(
  tr: WarehouseTransferRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat = 'letter'
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'MI TIENDA';
  const movTypeLabel = getMovementTypeLabel(tr.movementType);
  const isEntryOrAdj = tr.movementType === 'entry' || tr.movementType === 'adjustment';

  const rowsHtml = (tr.items || [])
    .map((it) => {
      const stockDetail =
        it.previousStock !== undefined && it.newStock !== undefined
          ? `<div style="font-size:10px;color:#475569;">Stock en bodega: ${it.previousStock} → <strong>${it.newStock} uds</strong></div>`
          : '';
      return `
        <tr>
          <td style="padding: 6px 6px; border-bottom: 1px dashed #cbd5e1; font-family: monospace; font-weight: 700;">${it.code}</td>
          <td style="padding: 6px 6px; border-bottom: 1px dashed #cbd5e1;">
            <div style="font-weight:700;color:#0f172a;">${it.name}${it.size ? ` (${it.size})` : ''}</div>
            ${it.category ? `<div style="font-size:10px;color:#64748b;">${it.category}</div>` : ''}
            ${stockDetail}
          </td>
          <td style="padding: 6px 6px; border-bottom: 1px dashed #cbd5e1; text-align: right; font-weight: 900; font-size: 13px;">
            ${tr.movementType === 'adjustment' && it.newStock !== undefined ? `${it.newStock} uds` : `${it.quantity} uds`}
          </td>
        </tr>
      `;
    })
    .join('');

  return `
    <div style="max-width: ${isThermal ? '100%' : '680px'}; margin: 0 auto; border: 2px solid #0f172a; border-radius: 12px; padding: ${isThermal ? '10px' : '22px'}; background: #ffffff;">
      <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px;">
        <h1 style="font-size: ${isThermal ? '15px' : '19px'}; font-weight: 900; margin: 0; text-transform: uppercase; color: #0f172a;">${storeName}</h1>
        ${storeSettings.address || storeSettings.phone ? `<div style="font-size: 10.5px; color: #475569; margin-top: 2px;">${[storeSettings.address, storeSettings.phone ? `Tel: ${storeSettings.phone}` : ''].filter(Boolean).join(' • ')}</div>` : ''}
        <div style="font-size: ${isThermal ? '11px' : '13px'}; font-weight: 900; color: #047857; margin-top: 5px; text-transform: uppercase;">
          COMPROBANTE DE ${movTypeLabel}
        </div>
        <div style="font-family: monospace; font-weight: 900; font-size: ${isThermal ? '13px' : '15px'}; margin-top: 4px; color: #0f172a;">
          N° ${tr.transferNumber}
        </div>
      </div>

      <div style="margin-top: 12px; padding: 10px 12px; background: #f8fafc; border-radius: 8px; border: 1px solid #cbd5e1; font-size: ${isThermal ? '10.5px' : '12px'}; line-height: 1.55;">
        <div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Fecha y Hora:</strong></span><span>${tr.dateFormatted}</span></div>
        <div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Tipo de Movimiento:</strong></span><strong>${movTypeLabel}</strong></div>
        ${
          isEntryOrAdj
            ? `<div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Origen / Operación:</strong></span><span>${tr.fromWarehouseName}</span></div>
               <div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Bodega Asignada (Destino):</strong></span><strong style="color:#047857;">${tr.toWarehouseName}</strong></div>`
            : `<div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Bodega de Salida (Origen):</strong></span><span>${tr.fromWarehouseName}</span></div>
               <div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Bodega de Entrada (Destino):</strong></span><strong style="color:#047857;">${tr.toWarehouseName}</strong></div>`
        }
        <div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Registrado / Autorizado por:</strong></span><span>${tr.createdBy}</span></div>
        <div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Recibido / Responsable en Bodega:</strong></span><span>${tr.receivedBy || 'Encargado de Bodega'}</span></div>
        ${tr.notes ? `<div style="display:flex;justify-content:space-between;gap:8px;"><span><strong>Motivo / Observaciones:</strong></span><span>${tr.notes}</span></div>` : ''}
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-top: 12px; font-size: ${isThermal ? '10.5px' : '12px'};">
        <thead>
          <tr style="background: #0f172a; color: #ffffff;">
            <th style="padding: 7px 6px; text-align: left; font-size: 10.5px; text-transform: uppercase;">Código SKU</th>
            <th style="padding: 7px 6px; text-align: left; font-size: 10.5px; text-transform: uppercase;">Artículo / Descripción</th>
            <th style="padding: 7px 6px; text-align: right; font-size: 10.5px; text-transform: uppercase;">${tr.movementType === 'adjustment' ? 'Stock Fijado' : 'Cantidad'}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div style="margin-top: 12px; padding: 10px 12px; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 900; color: #064e3b;">
        <span>REFERENCIAS: ${(tr.items || []).length} ARTÍCULOS</span>
        <span>TOTAL UNIDADES: ${tr.totalUnits} UDS</span>
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 38px; text-align: center;">
        <div style="border-top: 1px solid #0f172a; padding-top: 6px; font-size: 11px; font-weight: 700;">
          Autorizado / Entregado por (${tr.createdBy})
        </div>
        <div style="border-top: 1px solid #0f172a; padding-top: 6px; font-size: 11px; font-weight: 700;">
          Recibido Conforme (${tr.receivedBy || 'Encargado Bodega'})
        </div>
      </div>
    </div>
  `;
}

export async function downloadWarehouseTransferReceiptPdf(
  tr: WarehouseTransferRecord,
  storeSettings: StoreSettings
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const movTypeLabel = getMovementTypeLabel(tr.movementType);
  const isEntryOrAdj = tr.movementType === 'entry' || tr.movementType === 'adjustment';

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: movTypeLabel,
    documentNumber: tr.transferNumber,
    dateLabel: `Fecha: ${tr.dateFormatted}`,
    statusBadge: {
      text: tr.movementType === 'entry' ? 'INGRESO' : tr.movementType === 'adjustment' ? 'AJUSTE STOCK' : 'TRASLADO',
      bgRgb: isEntryOrAdj ? [224, 231, 255] : [209, 250, 229],
      textRgb: isEntryOrAdj ? [55, 48, 163] : [4, 120, 87],
    },
    accentRgb: isEntryOrAdj ? [67, 56, 202] : [4, 120, 87],
  });

  const totalValueSale = (tr.items || []).reduce(
    (sum, it) => sum + (Number(it.price) || 0) * (Number(it.quantity) || 0),
    0
  );

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: isEntryOrAdj ? 'Origen / Operación' : 'Bodega de Salida (Origen)',
      value: (tr.fromWarehouseName || '-').slice(0, 24),
      subtext: `Autorizado: ${tr.createdBy}`,
      valueRgb: [51, 65, 85],
    },
    {
      label: 'Bodega de Destino',
      value: (tr.toWarehouseName || '-').slice(0, 24),
      subtext: `Recibe: ${tr.receivedBy || 'Encargado'}`,
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Artículos / Referencias',
      value: `${(tr.items || []).length} SKUs`,
      subtext: 'Referencias procesadas',
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Total Unidades',
      value: `${tr.totalUnits} uds`,
      subtext: totalValueSale > 0 ? `Valor Comercial: ${formatCurrencyL(totalValueSale)}` : 'Unidades físicas',
      valueRgb: [67, 56, 202],
    },
  ]);

  if (tr.notes) {
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(14, y, doc.internal.pageSize.getWidth() - 28, 10, 2, 2, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(51, 65, 85);
    doc.text(`MOTIVO / OBSERVACIONES: ${tr.notes}`, 18, y + 6.2);
    y += 14;
  }

  autoTable(doc, {
    startY: y,
    head: [
      [
        'N°',
        'Código SKU',
        'Descripción del Artículo',
        'Categoría / Talla',
        isEntryOrAdj ? 'Detalle en Bodega' : 'Ruta Bodega',
        tr.movementType === 'adjustment' ? 'Stock en Bodega' : 'Cantidad',
        'Precio Unit.',
      ],
    ],
    body: (tr.items || []).map((it, idx) => {
      const detailCol =
        it.previousStock !== undefined && it.newStock !== undefined
          ? `Ant: ${it.previousStock} -> Nuevo: ${it.newStock} uds`
          : `${tr.fromWarehouseName} -> ${tr.toWarehouseName}`;
      return [
        String(idx + 1),
        it.code,
        it.name,
        [it.category || 'General', it.size ? `Talla ${it.size}` : ''].filter(Boolean).join(' • '),
        detailCol,
        `${tr.movementType === 'adjustment' && it.newStock !== undefined ? it.newStock : it.quantity} uds`,
        it.price ? formatCurrencyL(it.price) : '-',
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.2, cellPadding: 3 },
    bodyStyles: { fontSize: 8, cellPadding: 2.8 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { halign: 'center', cellWidth: 10 },
      1: { fontStyle: 'bold', cellWidth: 26 },
      2: { fontStyle: 'bold', cellWidth: 54 },
      3: { cellWidth: 32 },
      4: { cellWidth: 36 },
      5: { halign: 'right', fontStyle: 'bold', cellWidth: 22 },
      6: { halign: 'right', cellWidth: 24 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as any).lastAutoTable?.finalY || y + 40;
  const pageHeight = doc.internal.pageSize.getHeight();
  const sigY = finalY + 28 < pageHeight - 22 ? finalY + 22 : pageHeight - 28;

  doc.setDrawColor(15, 23, 42);
  doc.setLineWidth(0.4);
  doc.line(28, sigY, 92, sigY);
  doc.line(120, sigY, 184, sigY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Entregado / Autorizado por: ${tr.createdBy}`, 60, sigY + 5, { align: 'center' });
  doc.text(`Recibido en Bodega (${tr.toWarehouseName}): ${tr.receivedBy || 'Firma'}`, 152, sigY + 5, {
    align: 'center',
  });

  drawPdfPageFooters(doc, storeSettings, `Comprobante ${tr.transferNumber}`);
  doc.save(`Comprobante_${tr.transferNumber}.pdf`);
}

export function buildWarehouseMovementsHistoryHtml(
  transfers: WarehouseTransferRecord[],
  storeSettings: StoreSettings,
  format: PrinterPaperFormat = 'letter',
  filterLabel = 'Todos los Movimientos y Traslados'
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'MI TIENDA';
  const totalUnitsAll = transfers.reduce((s, t) => s + (Number(t.totalUnits) || 0), 0);
  const transferCount = transfers.filter((t) => !t.movementType || t.movementType === 'transfer').length;
  const entryCount = transfers.filter((t) => t.movementType === 'entry' || t.movementType === 'adjustment').length;

  return `
    <div style="font-variant-numeric:tabular-nums;">
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
        <div style="font-size:${isThermal ? '15px' : '20px'};font-weight:900;text-transform:uppercase;color:#0f172a;">${storeName}</div>
        <div style="font-size:${isThermal ? '11.5px' : '14px'};font-weight:900;color:#047857;margin-top:4px;">REPORTE DE MOVIMIENTOS Y TRASLADOS DE BODEGAS</div>
        <div style="font-size:11px;color:#475569;margin-top:3px;">${filterLabel} • Emisión: ${new Date().toLocaleString('es-HN')}</div>
      </div>

      ${
        !isThermal
          ? `
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px;">
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Total Movimientos</div>
            <div style="font-size:16px;font-weight:900;color:#0f172a;margin-top:2px;">${transfers.length}</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Traslados entre Bodegas</div>
            <div style="font-size:16px;font-weight:900;color:#047857;margin-top:2px;">${transferCount}</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Ingresos / Asignaciones</div>
            <div style="font-size:16px;font-weight:900;color:#4338ca;margin-top:2px;">${entryCount}</div>
          </div>
          <div style="border:1px solid #cbd5e1;border-radius:8px;padding:8px 12px;background:#f8fafc;">
            <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;color:#475569;">Unidades Movidas</div>
            <div style="font-size:16px;font-weight:900;color:#0f172a;margin-top:2px;">${totalUnitsAll.toLocaleString('es-HN')} uds</div>
          </div>
        </div>
      `
          : ''
      }

      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-size:${isThermal ? '9.5px' : '11px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th style="padding:7px 8px;text-align:left;">N° DOC</th>
            <th style="padding:7px 8px;text-align:left;">TIPO</th>
            <th style="padding:7px 8px;text-align:left;">FECHA</th>
            <th style="padding:7px 8px;text-align:left;">ORIGEN → BODEGA DESTINO</th>
            <th style="padding:7px 8px;text-align:left;">ARTÍCULOS PROCESADOS</th>
            <th style="padding:7px 8px;text-align:right;">UDS</th>
            ${isThermal ? '' : `<th style="padding:7px 8px;text-align:left;">RESPONSABLE</th>`}
          </tr>
        </thead>
        <tbody>
          ${
            transfers.length === 0
              ? `<tr><td colspan="${isThermal ? 6 : 7}" style="padding:16px;text-align:center;color:#64748b;">No hay movimientos registrados.</td></tr>`
              : transfers
                  .map((tr, idx) => {
                    const typeBadge =
                      tr.movementType === 'entry'
                        ? 'INGRESO BODEGA'
                        : tr.movementType === 'adjustment'
                        ? 'ASIGNACIÓN STOCK'
                        : 'TRASLADO';
                    const itemsSummary = (tr.items || [])
                      .map((it) => `${it.quantity}x ${it.name} (${it.code})`)
                      .join(', ');
                    return `
                      <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                        <td style="padding:7px 8px;font-family:monospace;font-weight:800;color:#0f172a;">${tr.transferNumber}</td>
                        <td style="padding:7px 8px;font-weight:800;font-size:10px;color:${tr.movementType === 'entry' || tr.movementType === 'adjustment' ? '#4338ca' : '#047857'};">${typeBadge}</td>
                        <td style="padding:7px 8px;white-space:nowrap;">${tr.dateFormatted}</td>
                        <td style="padding:7px 8px;font-weight:700;">${tr.fromWarehouseName} → <span style="color:#047857;">${tr.toWarehouseName}</span></td>
                        <td style="padding:7px 8px;">${itemsSummary}${tr.notes ? `<div style="font-size:9.5px;color:#64748b;">Nota: ${tr.notes}</div>` : ''}</td>
                        <td style="padding:7px 8px;text-align:right;font-weight:900;">${tr.totalUnits}</td>
                        ${isThermal ? '' : `<td style="padding:7px 8px;font-size:10px;"><div>Aut: ${tr.createdBy}</div><div style="color:#64748b;">Rec: ${tr.receivedBy || 'Encargado'}</div></td>`}
                      </tr>
                    `;
                  })
                  .join('')
          }
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadWarehouseMovementsHistoryPdf(
  transfers: WarehouseTransferRecord[],
  storeSettings: StoreSettings,
  filterLabel = 'Todos los Movimientos y Traslados'
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const totalUnitsAll = transfers.reduce((s, t) => s + (Number(t.totalUnits) || 0), 0);
  const transferCount = transfers.filter((t) => !t.movementType || t.movementType === 'transfer').length;
  const entryCount = transfers.filter((t) => t.movementType === 'entry' || t.movementType === 'adjustment').length;

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: 'HISTORIAL DE MOVIMIENTOS Y TRASLADOS DE BODEGA',
    documentNumber: `${transfers.length} MOVIMIENTOS`,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [4, 120, 87],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Total Movimientos',
      value: `${transfers.length}`,
      subtext: filterLabel.slice(0, 32),
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Traslados entre Bodegas',
      value: `${transferCount}`,
      subtext: 'Órdenes de traslado',
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Ingresos / Asignaciones',
      value: `${entryCount}`,
      subtext: 'Carga de artículos a bodega',
      valueRgb: [67, 56, 202],
    },
    {
      label: 'Total Unidades Movidas',
      value: `${totalUnitsAll.toLocaleString('es-HN')} uds`,
      subtext: 'Volumen total de unidades',
      valueRgb: [180, 83, 9],
    },
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      [
        'N° Doc',
        'Tipo de Movimiento',
        'Fecha y Hora',
        'Origen / Operación',
        'Bodega Destino',
        'Detalle de Artículos (SKU y Cantidad)',
        'Total Uds',
        'Responsables',
      ],
    ],
    body: transfers.map((tr) => {
      const typeLabel =
        tr.movementType === 'entry'
          ? 'Ingreso a Bodega'
          : tr.movementType === 'adjustment'
          ? 'Asignación Stock'
          : 'Traslado Bodega';
      const itemsText = (tr.items || [])
        .map((it) => `${it.quantity}x ${it.name} (${it.code})`)
        .join(' | ');
      const fullItems = tr.notes ? `${itemsText} [Nota: ${tr.notes}]` : itemsText;
      return [
        tr.transferNumber,
        typeLabel,
        tr.dateFormatted,
        tr.fromWarehouseName,
        tr.toWarehouseName,
        fullItems,
        `${tr.totalUnits} uds`,
        `Aut: ${tr.createdBy} / Rec: ${tr.receivedBy || 'Encargado'}`,
      ];
    }),
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.2, cellPadding: 3 },
    bodyStyles: { fontSize: 7.8, cellPadding: 2.6 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { fontStyle: 'bold', cellWidth: 28 },
      2: { cellWidth: 28 },
      3: { cellWidth: 34 },
      4: { fontStyle: 'bold', cellWidth: 34 },
      5: { cellWidth: 'auto' },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 18 },
      7: { cellWidth: 36 },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Movimientos y Traslados de Bodega');
  doc.save(`Movimientos_Y_Traslados_Bodega_${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function buildWarehouseStockReportHtml(
  products: Product[],
  warehouses: WarehouseLocation[],
  selectedWarehouseId: string,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat = 'letter',
  canViewCosts = true
): string {
  const isThermal = format === '80mm' || format === '58mm';
  const storeName = storeSettings.storeName || 'MI TIENDA';
  const activeWhs = warehouses.filter((w) => w.isActive !== false);
  const targetWh =
    selectedWarehouseId !== 'all'
      ? activeWhs.find((w) => w.id === selectedWarehouseId)
      : undefined;
  const scopeTitle = targetWh
    ? `INVENTARIO EXCLUSIVO DE BODEGA: ${targetWh.name.toUpperCase()} (${targetWh.code})`
    : 'EXISTENCIAS CONSOLIDADAS POR BODEGA';

  const totalUnits = products.reduce((sum, p) => {
    const qty = targetWh
      ? getProductStockInWarehouse(p, targetWh.id, warehouses)
      : Number(p.stock) || 0;
    return sum + Math.max(0, qty);
  }, 0);

  const totalCostVal = products.reduce((sum, p) => {
    const qty = targetWh
      ? getProductStockInWarehouse(p, targetWh.id, warehouses)
      : Number(p.stock) || 0;
    return sum + Math.max(0, qty) * (Number(p.cost) || 0);
  }, 0);

  const totalSaleVal = products.reduce((sum, p) => {
    const qty = targetWh
      ? getProductStockInWarehouse(p, targetWh.id, warehouses)
      : Number(p.stock) || 0;
    return sum + Math.max(0, qty) * (Number(p.price) || 0);
  }, 0);

  const totalProfitVal = totalSaleVal - totalCostVal;

  return `
    <div style="font-variant-numeric:tabular-nums;">
      <div class="text-center" style="border-bottom:2px solid #0f172a;padding-bottom:12px;margin-bottom:14px;">
        <div style="font-size:${isThermal ? '15px' : '20px'};font-weight:900;text-transform:uppercase;color:#0f172a;">${storeName}</div>
        <div style="font-size:${isThermal ? '11.5px' : '14px'};font-weight:900;color:#1e1b4b;margin-top:4px;">${scopeTitle}</div>
        <div style="font-size:11px;color:#475569;margin-top:3px;">
          Artículos: <strong>${products.length}</strong> • Unidades: <strong>${totalUnits.toLocaleString('es-HN')} uds</strong>
          ${canViewCosts ? ` • Costo Total: <strong>${formatCurrencyL(totalCostVal)}</strong>` : ''}
          • Venta Total: <strong>${formatCurrencyL(totalSaleVal)}</strong>
          ${canViewCosts ? ` • Ganancia Estimada: <strong style="color:#047857;">+${formatCurrencyL(totalProfitVal)}</strong>` : ''}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-size:${isThermal ? '9px' : '10.5px'};">
        <thead>
          <tr style="background:#0f172a;color:#ffffff;">
            <th style="padding:7px 8px;text-align:left;">CÓDIGO</th>
            <th style="padding:7px 8px;text-align:left;">ARTÍCULO</th>
            ${isThermal ? '' : `<th style="padding:7px 8px;text-align:left;">CATEGORÍA</th>`}
            ${
              targetWh
                ? `<th style="padding:7px 8px;text-align:center;background:#1e1b4b;">STOCK EN ${targetWh.name.toUpperCase()}</th>`
                : activeWhs
                    .map(
                      (w) =>
                        `<th style="padding:7px 8px;text-align:center;">${w.name} (${w.code})</th>`
                    )
                    .join('') + `<th style="padding:7px 8px;text-align:center;">STOCK TOTAL</th>`
            }
            ${canViewCosts ? `<th style="padding:7px 8px;text-align:right;">PRECIO COSTO</th>` : ''}
            <th style="padding:7px 8px;text-align:right;">PRECIO VENTA</th>
            ${canViewCosts ? `<th style="padding:7px 8px;text-align:right;">GANANCIA UNIT.</th>` : ''}
            ${canViewCosts && !isThermal ? `<th style="padding:7px 8px;text-align:right;">GANANCIA TOTAL</th>` : ''}
          </tr>
        </thead>
        <tbody>
          ${products
            .map((p, idx) => {
              const qty = targetWh
                ? getProductStockInWarehouse(p, targetWh.id, warehouses)
                : Number(p.stock) || 0;
              const unitCost = Number(p.cost) || 0;
              const unitPrice = Number(p.price) || 0;
              const unitProfit = unitPrice - unitCost;
              const rowProfit = Math.max(0, qty) * unitProfit;
              return `
                <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                  <td style="padding:6px 8px;font-family:monospace;font-weight:800;">${p.code}</td>
                  <td style="padding:6px 8px;font-weight:700;">${p.name}${p.size ? ` (${p.size})` : ''}</td>
                  ${isThermal ? '' : `<td style="padding:6px 8px;color:#475569;">${p.category || 'General'}</td>`}
                  ${
                    targetWh
                      ? `<td style="padding:6px 8px;text-align:center;font-weight:900;color:#1e1b4b;background:#eef2ff;">${qty} uds</td>`
                      : activeWhs
                          .map(
                            (w) =>
                              `<td style="padding:6px 8px;text-align:center;font-weight:800;">${getProductStockInWarehouse(p, w.id, warehouses)}</td>`
                          )
                          .join('') + `<td style="padding:6px 8px;text-align:center;font-weight:900;">${p.stock} uds</td>`
                  }
                  ${canViewCosts ? `<td style="padding:6px 8px;text-align:right;color:#475569;">${formatCurrencyL(unitCost)}</td>` : ''}
                  <td style="padding:6px 8px;text-align:right;font-weight:700;">${formatCurrencyL(unitPrice)}</td>
                  ${canViewCosts ? `<td style="padding:6px 8px;text-align:right;font-weight:800;color:${unitProfit >= 0 ? '#047857' : '#be123c'};">${unitProfit >= 0 ? '+' : ''}${formatCurrencyL(unitProfit)}</td>` : ''}
                  ${canViewCosts && !isThermal ? `<td style="padding:6px 8px;text-align:right;font-weight:900;color:${rowProfit >= 0 ? '#047857' : '#be123c'};">${rowProfit >= 0 ? '+' : ''}${formatCurrencyL(rowProfit)}</td>` : ''}
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    </div>
  `;
}

export async function downloadWarehouseStockReportPdf(
  products: Product[],
  warehouses: WarehouseLocation[],
  selectedWarehouseId: string,
  storeSettings: StoreSettings,
  canViewCosts = true
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'letter' });
  const activeWhs = warehouses.filter((w) => w.isActive !== false);
  const targetWh =
    selectedWarehouseId !== 'all'
      ? activeWhs.find((w) => w.id === selectedWarehouseId)
      : undefined;

  const totalUnits = products.reduce((sum, p) => {
    const qty = targetWh
      ? getProductStockInWarehouse(p, targetWh.id, warehouses)
      : Number(p.stock) || 0;
    return sum + Math.max(0, qty);
  }, 0);

  const totalSaleVal = products.reduce((sum, p) => {
    const qty = targetWh
      ? getProductStockInWarehouse(p, targetWh.id, warehouses)
      : Number(p.stock) || 0;
    return sum + Math.max(0, qty) * (Number(p.price) || 0);
  }, 0);

  const totalCostVal = products.reduce((sum, p) => {
    const qty = targetWh
      ? getProductStockInWarehouse(p, targetWh.id, warehouses)
      : Number(p.stock) || 0;
    return sum + Math.max(0, qty) * (Number(p.cost) || 0);
  }, 0);

  const totalProfitVal = totalSaleVal - totalCostVal;

  let y = drawExecutivePdfHeader(doc, {
    storeSettings,
    documentTitle: targetWh
      ? `INVENTARIO DE BODEGA: ${targetWh.name.toUpperCase()}`
      : 'REPORTE CONSOLIDADO DE EXISTENCIAS POR BODEGA',
    documentNumber: `${products.length} ARTÍCULOS`,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [49, 46, 129],
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: targetWh ? `Bodega: ${targetWh.code}` : 'Alcance del Reporte',
      value: targetWh ? targetWh.name.slice(0, 22) : 'Todas las Bodegas',
      subtext: `${products.length} artículos • ${totalUnits.toLocaleString('es-HN')} uds`,
      valueRgb: [15, 23, 42],
    },
    {
      label: 'Valor Precio Costo',
      value: canViewCosts ? formatCurrencyL(totalCostVal) : 'Reservado',
      subtext: 'Inversión en mercadería',
      valueRgb: [71, 85, 105],
    },
    {
      label: 'Valor Precio Venta',
      value: formatCurrencyL(totalSaleVal),
      subtext: 'Valor comercial total',
      valueRgb: [67, 56, 202],
    },
    {
      label: 'Ganancia Estimada',
      value: canViewCosts ? `+${formatCurrencyL(totalProfitVal)}` : 'Reservado',
      subtext: 'Utilidad proyectada (Venta - Costo)',
      valueRgb: [4, 120, 87],
    },
  ]);

  const headRow = [
    'Código SKU',
    'Artículo / Descripción',
    'Categoría',
    ...(targetWh
      ? [`Stock en ${targetWh.name}`]
      : [...activeWhs.map((w) => `${w.name} (${w.code})`), 'Stock Total']),
    ...(canViewCosts ? ['Precio Costo', 'Costo Total'] : []),
    'Precio Venta',
    'Venta Total',
    ...(canViewCosts ? ['Ganancia Unit.', 'Ganancia Total'] : []),
  ];

  const bodyRows = products.map((p) => {
    const qty = targetWh
      ? getProductStockInWarehouse(p, targetWh.id, warehouses)
      : Number(p.stock) || 0;
    const unitCost = Number(p.cost) || 0;
    const unitPrice = Number(p.price) || 0;
    const unitProfit = unitPrice - unitCost;
    const rowCost = Math.max(0, qty) * unitCost;
    const rowSale = Math.max(0, qty) * unitPrice;
    const rowProfit = Math.max(0, qty) * unitProfit;

    return [
      p.code,
      `${p.name}${p.size ? ` (${p.size})` : ''}`,
      p.category || 'General',
      ...(targetWh
        ? [`${qty} uds`]
        : [
            ...activeWhs.map((w) => `${getProductStockInWarehouse(p, w.id, warehouses)}`),
            `${p.stock} uds`,
          ]),
      ...(canViewCosts ? [formatCurrencyL(unitCost), formatCurrencyL(rowCost)] : []),
      formatCurrencyL(unitPrice),
      formatCurrencyL(rowSale),
      ...(canViewCosts
        ? [
            `${unitProfit >= 0 ? '+' : ''}${formatCurrencyL(unitProfit)}`,
            `${rowProfit >= 0 ? '+' : ''}${formatCurrencyL(rowProfit)}`,
          ]
        : []),
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [headRow],
    body: bodyRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 7.5, cellPadding: 2.5 },
    bodyStyles: { fontSize: 7.4, cellPadding: 2.2 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      1: { fontStyle: 'bold' },
      3: { halign: 'center', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  drawPdfPageFooters(doc, storeSettings, 'Existencias, Costos y Ganancias por Bodega');
  const safeSuffix = targetWh ? targetWh.code : 'Consolidado';
  doc.save(`Inventario_Bodega_${safeSuffix}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 11. ACTA DE ENTREGA DE LLAVES, CREDENCIALES Y EXPEDIENTE OFICIAL DEL CLIENTE SAAS
// ============================================================================
export interface ClientAppKeysDossierPayload {
  company: CompanyTenant;
  saasGlobalConfig?: SaaSGlobalConfig;
  loginUrl: string;
  catalogUrl: string;
  storeSettings?: StoreSettings;
  users: UserAccount[];
  warehouses: WarehouseLocation[];
  stats: {
    productsCount: number;
    suppliersCount: number;
    salesCount: number;
    purchasesCount: number;
  };
}

const MODULE_LABELS_ES: Record<string, string> = {
  dashboard: 'Dashboard y Ganancias',
  sales: 'Ventas y Facturación (POS)',
  inventory: 'Control de Inventario',
  warehouses: 'Bodegas y Traslados',
  'price-checker': 'Consultor de Precios',
  catalog: 'Catálogo Digital y QR',
  purchases: 'Compras / Facturas Proveedor',
  audit: 'Conteo / Auditoría Física',
  suppliers: 'Directorio de Proveedores',
  users: 'Gestión de Colaboradores',
  activity: 'Bitácora de Movimientos',
  settings: 'Ajustes de Tienda',
};

export function buildClientAppKeysDossierHtml(
  payload: ClientAppKeysDossierPayload,
  format: PrinterPaperFormat = 'letter'
): string {
  const { company, saasGlobalConfig, loginUrl, catalogUrl, storeSettings, users, warehouses, stats } = payload;
  const isThermal = format === '80mm' || format === '58mm';
  const providerName = saasGlobalConfig?.saasBrandName || 'MIAPPHN.ONLINE — Plataforma Empresarial SaaS';
  const providerPhone =
    saasGlobalConfig?.saasAdminPhone || saasGlobalConfig?.contractDefaults?.providerPhone || '+504';
  const docNumber = `LLAVES-${company.slug.toUpperCase()}-${new Date().getFullYear()}`;
  const issuedDate = new Date().toLocaleString('es-HN');
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(loginUrl)}`;
  const catalogQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(catalogUrl)}`;

  const enabledMods =
    Array.isArray(company.allowedModules) && company.allowedModules.length > 0
      ? company.allowedModules
      : Object.keys(MODULE_LABELS_ES);

  const bankAccounts = saasGlobalConfig?.bankAccounts || [];
  const lastPayment = company.paymentHistory && company.paymentHistory.length > 0 ? company.paymentHistory[0] : null;
  const contractNumber = company.contractData?.contractNumber || `CTR-${company.slug.toUpperCase()}-${new Date().getFullYear()}`;
  const contractStatusLabel =
    company.contractData?.status === 'signed'
      ? 'FIRMADO Y ACTIVO'
      : company.contractData?.status === 'sent'
      ? 'ENVIADO AL CLIENTE'
      : 'EMITIDO / VIGENTE';

  return `
    <div style="${isThermal ? '' : 'border:2px solid #0f172a;border-radius:14px;padding:24px;max-width:820px;margin:0 auto;font-variant-numeric:tabular-nums;background:#ffffff;color:#0f172a;'}">
      <!-- Encabezado Corporativo -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px;border-bottom:3px solid #047857;padding-bottom:14px;margin-bottom:16px;flex-wrap:wrap;">
        <div>
          <div style="font-size:${isThermal ? '14px' : '20px'};font-weight:900;color:#0f172a;letter-spacing:-0.02em;text-transform:uppercase;">
            ${providerName}
          </div>
          <div style="font-size:${isThermal ? '11px' : '13.5px'};font-weight:900;color:#047857;margin-top:3px;text-transform:uppercase;">
            ACTA DE ENTREGA DE LLAVES, CREDENCIALES Y EXPEDIENTE OFICIAL DE LA APP
          </div>
          <div style="font-size:11px;color:#475569;margin-top:3px;">
            Soporte y Administración Central: <strong>${providerPhone}</strong> • Fecha de Emisión: <strong>${issuedDate}</strong>
          </div>
        </div>
        <div style="text-align:right;background:#0f172a;color:#ffffff;padding:8px 14px;border-radius:10px;">
          <div style="font-size:9.5px;text-transform:uppercase;color:#34d399;font-weight:800;">Expediente Oficial</div>
          <div style="font-size:14px;font-weight:900;font-family:monospace;">${docNumber}</div>
          <div style="font-size:10px;color:#cbd5e1;">Estado: ${company.status === 'suspended' ? 'SUSPENDIDO' : 'ACTIVO (AL DÍA)'}</div>
        </div>
      </div>

      <!-- Sección 1: Ficha Corporativa y Datos del Cliente -->
      <div style="margin-bottom:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;">
        <div style="font-size:11.5px;font-weight:900;text-transform:uppercase;color:#0f172a;border-bottom:1px solid #e2e8f0;padding-bottom:5px;margin-bottom:8px;">
          1. Información Corporativa, Licencia y Documentos del Cliente
        </div>
        <div style="display:grid;grid-template-columns:${isThermal ? '1fr' : '1fr 1fr 1fr'};gap:8px;font-size:11.5px;">
          <div><span style="color:#64748b;">Empresa / Comercio:</span><br/><strong style="font-size:12.5px;">${company.name}</strong></div>
          <div><span style="color:#64748b;">Propietario / Titular:</span><br/><strong>${company.ownerName || company.contractData?.clientRepresentative || 'Titular Registrado'}</strong></div>
          <div><span style="color:#64748b;">RTN / Identidad (DNI):</span><br/><strong>${company.clientRtnOrId || company.contractData?.clientIdentityOrRtn || 'Registrado en expediente'}</strong></div>
          <div><span style="color:#64748b;">WhatsApp / Teléfono:</span><br/><strong>${company.phone || storeSettings?.phone || 'N/A'}</strong></div>
          <div><span style="color:#64748b;">Correo Electrónico:</span><br/><strong>${company.email || 'N/A'}</strong></div>
          <div><span style="color:#64748b;">Dirección / Ciudad:</span><br/><strong>${company.address || storeSettings?.address || company.contractData?.cityAndCountry || 'Honduras'}</strong></div>
          <div><span style="color:#64748b;">Plan Contratado:</span><br/><strong style="text-transform:uppercase;color:#047857;">PLAN ${company.plan} (${formatCurrencyL(company.price || 0)})</strong></div>
          <div><span style="color:#64748b;">Próximo Corte / Renovación:</span><br/><strong>${company.nextBillingDate || (company.plan === 'vitalicio' ? 'Licencia Vitalicia' : 'Segun ciclo activo')}</strong></div>
          <div><span style="color:#64748b;">Contrato Legal de Uso:</span><br/><strong>${contractNumber} (${contractStatusLabel})</strong></div>
        </div>
      </div>

      <!-- Sección 2: Llaves Maestras y Enlaces de Acceso -->
      <div style="margin-bottom:14px;background:#ecfdf5;border:2px solid #10b981;border-radius:12px;padding:14px;">
        <div style="font-size:12px;font-weight:900;text-transform:uppercase;color:#065f46;border-bottom:1px solid #a7f3d0;padding-bottom:6px;margin-bottom:10px;">
          2. Llaves Maestras de la Aplicación, Contraseñas y Enlaces Oficiales
        </div>
        <div style="display:grid;grid-template-columns:${isThermal ? '1fr' : '1.6fr 1fr'};gap:12px;align-items:center;">
          <div style="font-size:11.5px;">
            <div style="margin-bottom:7px;background:#ffffff;padding:8px 10px;border-radius:8px;border:1px solid #6ee7b7;">
              <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#047857;">Enlace Oficial del Sistema POS y Administración</div>
              <div style="font-family:monospace;font-weight:900;font-size:12.5px;color:#0f172a;word-break:break-all;">${loginUrl}</div>
            </div>
            <div style="margin-bottom:7px;background:#ffffff;padding:8px 10px;border-radius:8px;border:1px solid #cbd5e1;">
              <div style="font-size:10px;font-weight:800;text-transform:uppercase;color:#4338ca;">Enlace Público del Catálogo Digital y Pedidos WhatsApp</div>
              <div style="font-family:monospace;font-weight:800;font-size:11.5px;color:#1e1b4b;word-break:break-all;">${catalogUrl}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
              <div style="background:#0f172a;color:#ffffff;padding:8px 10px;border-radius:8px;">
                <div style="font-size:9.5px;color:#94a3b8;text-transform:uppercase;font-weight:800;">Código Único de Empresa (ID)</div>
                <div style="font-family:monospace;font-size:14px;font-weight:900;color:#34d399;">${company.slug}</div>
              </div>
              <div style="background:#0f172a;color:#ffffff;padding:8px 10px;border-radius:8px;">
                <div style="font-size:9.5px;color:#94a3b8;text-transform:uppercase;font-weight:800;">Contraseña Maestra Admin</div>
                <div style="font-family:monospace;font-size:14px;font-weight:900;color:#fbbf24;">${company.adminPassword}</div>
              </div>
            </div>
            <div style="margin-top:7px;font-size:11px;color:#065f46;">
              • <strong>Clave en Ajustes Internos de Tienda:</strong> <code style="font-family:monospace;font-weight:900;background:#ffffff;padding:2px 6px;border-radius:4px;border:1px solid #a7f3d0;">${storeSettings?.accessPassword || company.adminPassword}</code>
              &nbsp;|&nbsp;
              <strong>Capacidad Contratada:</strong> ${company.maxProducts && company.maxProducts > 0 ? `${company.maxProducts} productos` : 'Productos Ilimitados'} / ${company.maxUsers && company.maxUsers > 0 ? `${company.maxUsers} usuarios` : 'Usuarios Ilimitados'}
            </div>
          </div>

          ${
            isThermal
              ? ''
              : `
                <div style="display:flex;justify-content:space-around;gap:8px;text-align:center;background:#ffffff;padding:10px;border-radius:10px;border:1px solid #a7f3d0;">
                  <div>
                    <img src="${qrUrl}" alt="QR Sistema POS" style="width:92px;height:92px;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px;padding:3px;" />
                    <div style="font-size:9.5px;font-weight:800;color:#0f172a;margin-top:3px;">QR Acceso Sistema</div>
                  </div>
                  <div>
                    <img src="${catalogQrUrl}" alt="QR Catálogo" style="width:92px;height:92px;object-fit:contain;border:1px solid #e2e8f0;border-radius:6px;padding:3px;" />
                    <div style="font-size:9.5px;font-weight:800;color:#4338ca;margin-top:3px;">QR Catálogo Cliente</div>
                  </div>
                </div>
              `
          }
        </div>
      </div>

      <!-- Sección 3: Usuarios y Colaboradores -->
      <div style="margin-bottom:14px;">
        <div style="font-size:11.5px;font-weight:900;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">
          3. Credenciales de Usuarios, Administradores y Colaboradores Creados (${users.length + 1} Cuentas)
        </div>
        <table style="width:100%;border-collapse:collapse;border:1px solid #cbd5e1;font-size:11px;">
          <thead>
            <tr style="background:#0f172a;color:#ffffff;">
              <th style="padding:6px 8px;text-align:left;">NOMBRE COMPLETO / PERFIL</th>
              <th style="padding:6px 8px;text-align:left;">USUARIO / ID</th>
              <th style="padding:6px 8px;text-align:left;">CONTRASEÑA / PIN</th>
              <th style="padding:6px 8px;text-align:left;">ROL</th>
              <th style="padding:6px 8px;text-align:left;">PERMISOS Y MÓDULOS HABILITADOS</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border-bottom:1px solid #e2e8f0;background:#ecfdf5;">
              <td style="padding:6px 8px;font-weight:900;">${company.ownerName || 'Administrador Principal'} (Llave Maestra)</td>
              <td style="padding:6px 8px;font-family:monospace;font-weight:900;color:#047857;">Código: ${company.slug}</td>
              <td style="padding:6px 8px;font-family:monospace;font-weight:900;color:#b45309;">${company.adminPassword}</td>
              <td style="padding:6px 8px;font-weight:800;color:#047857;">ADMIN MAESTRO</td>
              <td style="padding:6px 8px;">Control Total de la Tienda (${enabledMods.length} módulos)</td>
            </tr>
            ${users
              .map(
                (u, idx) => `
                  <tr style="border-bottom:1px solid #e2e8f0;background:${idx % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                    <td style="padding:6px 8px;font-weight:800;">${u.name} ${u.isActive === false ? '(Inactivo)' : ''}</td>
                    <td style="padding:6px 8px;font-family:monospace;font-weight:800;">@${u.username}</td>
                    <td style="padding:6px 8px;font-family:monospace;font-weight:900;color:#0f172a;">${u.password}</td>
                    <td style="padding:6px 8px;font-weight:800;color:${u.role === 'admin' ? '#047857' : '#4338ca'};">${u.role === 'admin' ? 'Administrador' : 'Colaborador'}</td>
                    <td style="padding:6px 8px;font-size:10px;">${
                      u.role === 'admin'
                        ? 'Acceso Administrativo Completo'
                        : (u.allowedTabs || []).map((t) => MODULE_LABELS_ES[t] || t).join(', ')
                    }</td>
                  </tr>
                `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <!-- Sección 4: Bodegas Configuradas y Resumen de Base de Datos -->
      <div style="margin-bottom:14px;display:grid;grid-template-columns:${isThermal ? '1fr' : '1.3fr 1fr'};gap:12px;">
        <div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">
            4. Bodegas y Sucursales Configuradas (${warehouses.length})
          </div>
          ${
            warehouses.length === 0
              ? `<div style="font-size:11px;color:#64748b;">Bodega Principal / Piso de Venta (BOD-01)</div>`
              : `<table style="width:100%;border-collapse:collapse;font-size:10.5px;">
                  <thead>
                    <tr style="background:#f1f5f9;color:#334155;">
                      <th style="padding:4px 6px;text-align:left;">Código</th>
                      <th style="padding:4px 6px;text-align:left;">Bodega / Sucursal</th>
                      <th style="padding:4px 6px;text-align:left;">Encargado / Ubicación</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${warehouses
                      .map(
                        (w) => `
                          <tr style="border-top:1px solid #e2e8f0;">
                            <td style="padding:4px 6px;font-family:monospace;font-weight:800;">${w.code}</td>
                            <td style="padding:4px 6px;font-weight:800;">${w.name} ${w.isMainSalesFloor ? '★ (Caja)' : ''}</td>
                            <td style="padding:4px 6px;color:#475569;">${[w.manager, w.address].filter(Boolean).join(' • ') || 'Principal'}</td>
                          </tr>
                        `
                      )
                      .join('')}
                  </tbody>
                </table>`
          }
        </div>

        <div style="border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;background:#f8fafc;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">
            5. Estado de Datos y Módulos Activos
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:11px;margin-bottom:8px;">
            <div style="background:#ffffff;padding:6px 8px;border-radius:6px;border:1px solid #e2e8f0;">
              <span style="color:#64748b;font-size:10px;">Artículos en Catálogo:</span><br/>
              <strong style="font-size:13px;color:#0f172a;">${stats.productsCount.toLocaleString('es-HN')} SKUs</strong>
            </div>
            <div style="background:#ffffff;padding:6px 8px;border-radius:6px;border:1px solid #e2e8f0;">
              <span style="color:#64748b;font-size:10px;">Proveedores Activos:</span><br/>
              <strong style="font-size:13px;color:#0f172a;">${stats.suppliersCount.toLocaleString('es-HN')}</strong>
            </div>
            <div style="background:#ffffff;padding:6px 8px;border-radius:6px;border:1px solid #e2e8f0;">
              <span style="color:#64748b;font-size:10px;">Ventas Registradas:</span><br/>
              <strong style="font-size:13px;color:#047857;">${stats.salesCount.toLocaleString('es-HN')}</strong>
            </div>
            <div style="background:#ffffff;padding:6px 8px;border-radius:6px;border:1px solid #e2e8f0;">
              <span style="color:#64748b;font-size:10px;">Facturas de Compra:</span><br/>
              <strong style="font-size:13px;color:#4338ca;">${stats.purchasesCount.toLocaleString('es-HN')}</strong>
            </div>
          </div>
          <div style="font-size:10px;color:#334155;">
            <strong>Módulos Habilitados (${enabledMods.length}):</strong> ${enabledMods
              .map((m) => MODULE_LABELS_ES[m] || m)
              .join(' • ')}
          </div>
        </div>
      </div>

      ${
        lastPayment || bankAccounts.length > 0
          ? `
            <div style="margin-bottom:14px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px 12px;font-size:10.5px;">
              ${
                lastPayment
                  ? `<div style="margin-bottom:4px;"><strong>Último Comprobante de Pago SaaS:</strong> Recibo <code style="font-family:monospace;font-weight:900;">${lastPayment.receiptNumber}</code> por <strong>${formatCurrencyL(lastPayment.amount)}</strong> (${lastPayment.periodLabel} — ${lastPayment.dateFormatted})</div>`
                  : ''
              }
              ${
                bankAccounts.length > 0
                  ? `<div><strong>Cuentas Oficiales para Renovación de Suscripción:</strong> ${bankAccounts
                      .map((b) => `${b.bankName}: ${b.accountNumber} (${b.accountType} a nombre de ${b.holderName})`)
                      .join(' | ')}</div>`
                  : ''
              }
            </div>
          `
          : ''
      }

      <!-- Firmas de Entrega y Recepción de Conformidad -->
      <div class="signatures" style="margin-top:26px;">
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:10.5px;font-weight:800;">ENTREGA OFICIAL — PROVEEDOR SAAS</div>
          <div style="font-size:9.5px;color:#64748b;">${saasGlobalConfig?.contractDefaults?.providerName || providerName}</div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div style="font-size:10.5px;font-weight:800;">RECIBÍ LLAVES Y ACCESOS CONFORME — CLIENTE</div>
          <div style="font-size:9.5px;color:#64748b;">${company.ownerName || company.name} (${company.slug})</div>
        </div>
      </div>
    </div>
  `;
}

export async function downloadClientAppKeysDossierPdf(
  payload: ClientAppKeysDossierPayload
): Promise<void> {
  const { company, saasGlobalConfig, loginUrl, catalogUrl, storeSettings, users, warehouses, stats } = payload;
  const effectiveLogo = company.logoUrl || storeSettings?.logoUrl;
  await preloadStoreLogoForPdf(effectiveLogo);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const providerName = saasGlobalConfig?.saasBrandName || 'MIAPPHN.ONLINE — Plataforma SaaS';
  const docNumber = `LLAVES-${company.slug.toUpperCase()}`;

  const headerSettings: StoreSettings = {
    companyId: company.slug,
    storeName: `${company.name} (${providerName})`,
    tagline: 'Acta Oficial de Entrega de Llaves, Credenciales, Enlaces y Expediente de la App',
    logoUrl: effectiveLogo || '',
    phone: company.phone || saasGlobalConfig?.saasAdminPhone || '',
    address: company.address || storeSettings?.address || 'Honduras',
    accessPassword: company.adminPassword,
  };

  let y = drawExecutivePdfHeader(doc, {
    storeSettings: headerSettings,
    documentTitle: 'ENTREGA DE LLAVES Y CREDENCIALES DE APP',
    documentNumber: docNumber,
    dateLabel: `Emitido: ${new Date().toLocaleString('es-HN')}`,
    accentRgb: [4, 120, 87],
    statusBadge:
      company.status === 'suspended'
        ? { text: 'SERVICIO EN MORA', bgRgb: [254, 226, 226], textRgb: [185, 28, 28] }
        : { text: 'LICENCIA ACTIVA', bgRgb: [209, 250, 229], textRgb: [4, 120, 87] },
  });

  y = drawExecutiveKpiCards(doc, y, [
    {
      label: 'Código de Empresa',
      value: company.slug,
      subtext: `Plan ${company.plan.toUpperCase()} (${formatCurrencyL(company.price || 0)})`,
      valueRgb: [4, 120, 87],
    },
    {
      label: 'Clave Maestra Admin',
      value: company.adminPassword,
      subtext: `Ajustes: ${storeSettings?.accessPassword || company.adminPassword}`,
      valueRgb: [180, 83, 9],
    },
    {
      label: 'Cuentas y Bodegas',
      value: `${users.length + 1} Usuarios`,
      subtext: `${warehouses.length || 1} bodegas configuradas`,
      valueRgb: [67, 56, 202],
    },
    {
      label: 'Base de Datos Entregada',
      value: `${stats.productsCount} Artículos`,
      subtext: `${stats.salesCount} ventas • ${stats.suppliersCount} prov.`,
      valueRgb: [15, 23, 42],
    },
  ]);

  // Tabla 1: Ficha Corporativa y Llaves Maestras
  const contractNumber =
    company.contractData?.contractNumber || `CTR-${company.slug.toUpperCase()}-${new Date().getFullYear()}`;
  const enabledMods =
    Array.isArray(company.allowedModules) && company.allowedModules.length > 0
      ? company.allowedModules
      : Object.keys(MODULE_LABELS_ES);

  const clientRtn = company.clientRtnOrId || company.contractData?.clientIdentityOrRtn || '';

  autoTable(doc, {
    startY: y,
    head: [['1. EXPEDIENTE CORPORATIVO, LLAVES DE ACCESO Y ENLACES OFICIALES', 'DETALLE OFICIAL ENTREGADO AL CLIENTE']],
    body: [
      ['Nombre Comercial del Negocio', `${company.name} (Código único de empresa: ${company.slug})`],
      ['Propietario / Representante Legal', `${company.ownerName || company.contractData?.clientRepresentative || 'Titular Registrado'} ${clientRtn ? `• RTN/DNI: ${clientRtn}` : ''}`],
      ['Contacto Registrado', `WhatsApp/Tel: ${company.phone || storeSettings?.phone || 'N/A'} • Email: ${company.email || 'N/A'}`],
      ['Enlace Oficial Sistema POS y Administración', loginUrl],
      ['Enlace Público Catálogo Digital y Pedidos QR', catalogUrl],
      ['Código Único de Empresa (ID de Ingreso)', company.slug],
      ['Contraseña Maestra de Administrador Principal', company.adminPassword],
      ['Contraseña de Seguridad en Ajustes de Tienda', storeSettings?.accessPassword || company.adminPassword],
      ['Plan, Cuota y Próxima Fecha de Corte', `Plan ${company.plan.toUpperCase()} • Cuota: ${formatCurrencyL(company.price || 0)} • Próximo Corte: ${company.nextBillingDate || 'Vitalicio / Sin vencimiento'}`],
      ['Contrato Oficial de Licencia de Uso', `${contractNumber} (${company.contractData?.status === 'signed' ? 'Firmado Digitalmente' : 'Vigente'})`],
      ['Módulos Habilitados en la Licencia', enabledMods.map((m) => MODULE_LABELS_ES[m] || m).join(', ')],
    ],
    theme: 'grid',
    headStyles: { fillColor: [4, 120, 87], textColor: 255, fontSize: 8.5, cellPadding: 2.8 },
    bodyStyles: { fontSize: 8.2, cellPadding: 2.4 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 68, textColor: [15, 23, 42] },
      1: { cellWidth: 'auto', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });

  let nextY = (doc as any).lastAutoTable.finalY + 5;

  // Tabla 2: Directorio de Usuarios y Contraseñas
  const userRows = [
    [
      `${company.ownerName || 'Administrador Principal'} (Maestro)`,
      `Código: ${company.slug}`,
      company.adminPassword,
      'ADMIN MAESTRO',
      'Control Total del Sistema y Ajustes',
    ],
    ...users.map((u) => [
      `${u.name}${u.isActive === false ? ' (Inactivo)' : ''}`,
      `@${u.username}`,
      u.password,
      u.role === 'admin' ? 'Administrador' : 'Colaborador / Cajero',
      u.role === 'admin'
        ? 'Acceso Administrativo Completo'
        : (u.allowedTabs || []).map((t) => MODULE_LABELS_ES[t] || t).join(', '),
    ]),
  ];

  autoTable(doc, {
    startY: nextY,
    head: [['2. NOMBRE DE USUARIO / PERSONAL', 'USUARIO / ID', 'CONTRASEÑA / PIN', 'ROL ASIGNADO', 'MÓDULOS Y PERMISOS']],
    body: userRows,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8.2, cellPadding: 2.6 },
    bodyStyles: { fontSize: 8, cellPadding: 2.3 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 44 },
      1: { fontStyle: 'bold', cellWidth: 32 },
      2: { fontStyle: 'bold', cellWidth: 30, textColor: [180, 83, 9] },
      3: { fontStyle: 'bold', cellWidth: 30 },
      4: { cellWidth: 'auto' },
    },
    margin: { left: 14, right: 14 },
  });

  nextY = (doc as any).lastAutoTable.finalY + 5;

  // Tabla 3: Bodegas y Resumen de Datos
  const warehouseRows =
    warehouses.length > 0
      ? warehouses.map((w) => [
          w.code,
          `${w.name}${w.isMainSalesFloor ? ' (Caja / Piso Venta Principal)' : ''}`,
          w.manager || 'Administración',
          w.address || 'Principal',
          w.isActive === false ? 'Inactiva' : 'Activa',
        ])
      : [['BOD-01', 'Tienda Principal / Piso de Venta', 'Administración', 'Principal', 'Activa']];

  autoTable(doc, {
    startY: nextY,
    head: [['3. CÓDIGO BODEGA', 'NOMBRE DE BODEGA / SUCURSAL', 'ENCARGADO', 'UBICACIÓN / DIRECCIÓN', 'ESTADO']],
    body: warehouseRows,
    theme: 'grid',
    headStyles: { fillColor: [49, 46, 129], textColor: 255, fontSize: 8, cellPadding: 2.5 },
    bodyStyles: { fontSize: 7.8, cellPadding: 2.2 },
    margin: { left: 14, right: 14 },
  });

  nextY = (doc as any).lastAutoTable.finalY + 14;
  if (nextY < 248) {
    doc.setDrawColor(100, 116, 139);
    doc.setLineWidth(0.35);
    doc.line(26, nextY, 96, nextY);
    doc.line(120, nextY, 190, nextY);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text('ENTREGA OFICIAL — PROVEEDOR SAAS', 61, nextY + 4.5, { align: 'center' });
    doc.text('RECIBÍ LLAVES Y ACCESOS CONFORME — CLIENTE', 155, nextY + 4.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(saasGlobalConfig?.contractDefaults?.providerName || providerName, 61, nextY + 8.5, { align: 'center' });
    doc.text(`${company.ownerName || company.name} (${company.slug})`, 155, nextY + 8.5, { align: 'center' });
  }

  drawPdfPageFooters(doc, headerSettings, `Expediente de Llaves ${company.slug.toUpperCase()}`);
  doc.save(`Entrega_Llaves_Y_Accesos_${company.slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ============================================================================
// 11. CONTRATO DE CRÉDITO / ARRENDAMIENTO CON RESERVA DE DOMINIO
// ============================================================================
const SPANISH_MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

export const CREDIT_CONTRACT_GENERAL_CONDITIONS: string[] = [
  'El Arrendatario deposita en poder del Arrendador la cantidad citada en la cláusula #2, en concepto de prima o pago inicial, que servirá para garantizar el buen cuidado y administración del objeto en arrendamiento.',
  'Las cuotas serán pagadas sin necesidad de requerimiento previo. El Arrendador se reserva el derecho de conceder un lugar diferente de pago en caso de cambio de domicilio del Arrendatario.',
  'La mora en el pago de una cuota o el incumplimiento de cualquiera de las cláusulas de este contrato dará derecho al Arrendador a darlo por terminado, pudiendo a su elección recoger —aun en poder de terceros— el objeto arrendado sin necesidad de intervención judicial o indemnización por su parte, o a exigir el pago del saldo de la obligación consignada en el contrato más los intereses pactados. Este contrato tiene fuerza legal para pedir la entrega del objeto del lugar donde se encuentre y del poder de la persona que lo tenga. Toda divergencia o reclamación no aplazará los términos de los pagos pactados.',
  'En caso de incumplimiento, los valores recibidos en concepto de prima y cuotas quedarán a favor de la empresa en concepto de daños y perjuicios, sin ninguna obligación de devolver cantidad alguna.',
  'La mora o falta de pago de una cuota (que se producirá sin ningún requerimiento del Arrendador) devengará un interés moratorio de 0.66% diario por cuota en mora, más LPS. 100.00 de gastos administrativos por cuota, sin perjuicio de lo pactado en el inciso #3.',
  'El Arrendatario declara haber recibido el artículo en perfecto estado de funcionamiento y a su entera satisfacción, obligándose a conservarlo en el mismo estado. Los riesgos del mueble quedan a su cargo desde la fecha del contrato, siendo responsable de pérdida, destrucción, deterioro o daños que cause, aun por caso fortuito o fuerza mayor.',
  'Al Arrendatario le queda terminantemente prohibido subarrendar, enajenar, vender, permutar, donar, prestar, dar en prenda el mueble arrendado, así como trasladarlo a un lugar distinto del declarado en la cláusula #4 sin el consentimiento previo y escrito del Arrendador.',
  'El Arrendatario renuncia a su domicilio y se somete expresamente al juzgado que el Arrendador señale para los efectos de la ejecución del presente contrato.',
  'El Arrendatario queda igualmente obligado al pago de los gastos que origine cualquier procedimiento judicial o extrajudicial necesario para la ejecución de este contrato.',
  'Al cumplirse totalmente este contrato, el Arrendador conviene en traspasar al Arrendatario el dominio pleno de los bienes muebles objeto del mismo.',
  'Ambos contratantes manifiestan que aceptan todas y cada una de las cláusulas anteriores y se obligan a su estricto cumplimiento.',
  'El Arrendatario tiene derecho a pagar anticipadamente el crédito con la consiguiente reducción de intereses.',
  'En todo lo no previsto en este contrato se estará sujeto a lo dispuesto en el Código de Comercio y a la Ley de Protección al Consumidor.',
];

export function resolveCreditContractData(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  controlMeta?: CreditAccountControlMeta,
  inventory?: Product[]
): CreditContractData {
  const saved = controlMeta?.creditContract || sale.creditContract;
  const saleDateObj = new Date(sale.timestamp || Date.now());
  const defaultDay = String(saleDateObj.getDate()).padStart(2, '0');
  const defaultMonth = SPANISH_MONTHS[saleDateObj.getMonth()] || 'enero';
  const defaultYear = String(saleDateObj.getFullYear());

  // Determine Lessor Name (ARRENDADOR)
  const rawStoreName = (storeSettings.storeName || '').trim();
  const defaultLessor =
    rawStoreName && rawStoreName.toLowerCase() !== 'tienda gosén'
      ? rawStoreName.toUpperCase()
      : (storeSettings.companyId || '').toLowerCase().includes('gyg')
      ? 'COMERCIALGYG'
      : (rawStoreName || 'COMERCIALGYG').toUpperCase();

  // Article description, brand, model
  const items = sale.items || [];
  const defaultArticleDesc =
    items.map((it) => `${it.quantity}x ${it.name}`).join(', ') || 'Artículo al crédito';

  let defaultBrand = 'ESTÁNDAR';
  let defaultModel = 'S/M';
  if (items.length > 0) {
    const firstItem = items[0];
    const matchedProd = inventory?.find(
      (p) => p.code.trim().toLowerCase() === (firstItem.code || '').trim().toLowerCase()
    );
    if (matchedProd?.supplier && matchedProd.supplier.trim()) {
      defaultBrand = matchedProd.supplier.trim().toUpperCase();
    } else if (firstItem.category && firstItem.category.trim()) {
      defaultBrand = firstItem.category.trim().toUpperCase();
    }
    const modelParts = items
      .map((it) => it.size || it.code)
      .filter(Boolean)
      .join(', ');
    if (modelParts) {
      defaultModel = modelParts;
    }
  }

  const inventoryCreditSum = items.reduce((sum, it) => {
    const matchedProd = inventory?.find(
      (p) => p.code.trim().toLowerCase() === (it.code || '').trim().toLowerCase()
    );
    const unitCred =
      it.creditPrice !== undefined && Number(it.creditPrice) > 0
        ? Number(it.creditPrice)
        : matchedProd?.creditPrice !== undefined && Number(matchedProd.creditPrice) > 0
        ? Number(matchedProd.creditPrice)
        : Number(it.price) || 0;
    return sum + unitCred * (Number(it.quantity) || 1);
  }, 0);

  const totalCreditVal =
    saved?.creditTotalValue !== undefined && saved.creditTotalValue > 0
      ? Number(saved.creditTotalValue)
      : inventoryCreditSum > (Number(sale.total) || 0)
      ? Number(inventoryCreditSum.toFixed(2))
      : Number(sale.total) || 0;

  // Initial prima / down payment
  const firstAbone =
    Array.isArray(sale.creditPayments) && sale.creditPayments.length > 0
      ? sale.creditPayments[0]
      : null;
  const inferredPrima =
    firstAbone && /prima|inicial/i.test(firstAbone.notes || '')
      ? Number(firstAbone.amount) || 0
      : Array.isArray(sale.creditPayments) && sale.creditPayments.length <= 1
      ? Number(sale.amountPaid) || 0
      : firstAbone
      ? Number(firstAbone.amount) || 0
      : 0;

  const downPaymentVal =
    saved?.downPaymentValue !== undefined
      ? Math.max(0, Number(saved.downPaymentValue))
      : Math.max(0, inferredPrima);

  const financedBalanceVal =
    saved?.financedBalance !== undefined
      ? Math.max(0, Number(saved.financedBalance))
      : Math.max(0, Number((totalCreditVal - downPaymentVal).toFixed(2)));

  const numInstallments =
    saved?.numberOfInstallments && saved.numberOfInstallments > 0
      ? Math.round(Number(saved.numberOfInstallments))
      : controlMeta?.numberOfInstallments && controlMeta.numberOfInstallments > 0
      ? Math.round(Number(controlMeta.numberOfInstallments))
      : 6;

  const termMonths =
    saved?.termMonths && saved.termMonths > 0
      ? Math.round(Number(saved.termMonths))
      : numInstallments;

  const computedQuota =
    numInstallments > 0 ? Number((financedBalanceVal / numInstallments).toFixed(2)) : financedBalanceVal;

  const installmentVal =
    saved?.installmentValue !== undefined && saved.installmentValue > 0
      ? Number(saved.installmentValue)
      : controlMeta?.installmentAmount && controlMeta.installmentAmount > 0
      ? Number(controlMeta.installmentAmount)
      : computedQuota;

  // First payment date & day of month
  const nextMonthDate = new Date(sale.timestamp || Date.now());
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const defaultFirstPayIso = nextMonthDate.toISOString().slice(0, 10);

  const rawFirstPayDate =
    saved?.firstPaymentDate?.trim() ||
    controlMeta?.nextPaymentDate?.trim() ||
    sale.creditDueDate?.trim() ||
    defaultFirstPayIso;

  let extractedDay = defaultDay;
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawFirstPayDate)) {
    extractedDay = String(parseInt(rawFirstPayDate.split('-')[2], 10));
  }

  const custAddr =
    saved?.customerAddress?.trim() ||
    sale.customerAddress?.trim() ||
    sale.onlineOrder?.shippingAddress?.trim() ||
    'Domicilio registrado del cliente';

  const installAddr =
    saved?.installationAddress?.trim() ||
    custAddr;

  const signLoc =
    saved?.signLocation?.trim() ||
    storeSettings.address?.trim() ||
    'Honduras';

  return {
    lessorName: saved?.lessorName?.trim() || defaultLessor,
    customerName: (saved?.customerName?.trim() || sale.customerName || 'CLIENTE').toUpperCase(),
    customerIdentity: saved?.customerIdentity?.trim() || sale.customerRtn?.trim() || 'S/N',
    customerPhone: saved?.customerPhone?.trim() || sale.customerPhone?.trim() || 'S/N',
    customerAddress: custAddr,
    installationAddress: installAddr,
    articleDescription: saved?.articleDescription?.trim() || defaultArticleDesc,
    articleBrand: saved?.articleBrand?.trim() || defaultBrand,
    articleModel: saved?.articleModel?.trim() || defaultModel,
    creditTotalValue: totalCreditVal,
    downPaymentValue: downPaymentVal,
    financedBalance: financedBalanceVal,
    numberOfInstallments: numInstallments,
    termMonths,
    installmentValue: installmentVal,
    paymentDayOfMonth: saved?.paymentDayOfMonth?.trim() || extractedDay,
    firstPaymentDate: rawFirstPayDate,
    signLocation: signLoc,
    signDay: saved?.signDay?.trim() || defaultDay,
    signMonth: saved?.signMonth?.trim() || defaultMonth,
    signYear: saved?.signYear?.trim() || defaultYear,
    customWarrantyNote: saved?.customWarrantyNote,
    customerSignatureDataUrl: saved?.customerSignatureDataUrl,
    customerSignedAt: saved?.customerSignedAt,
    lessorSignatureDataUrl: saved?.lessorSignatureDataUrl,
    lessorSignedAt: saved?.lessorSignedAt,
    updatedAt: saved?.updatedAt,
  };
}

export function buildCreditContractHtml(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat = 'letter',
  contractOverride?: CreditContractData,
  controlMeta?: CreditAccountControlMeta,
  inventory?: Product[]
): string {
  const c = contractOverride || resolveCreditContractData(sale, storeSettings, controlMeta, inventory);
  const isThermal = format === '80mm' || format === '58mm';
  const tpl = getEffectiveInvoiceTemplate(storeSettings);
  const accentHex = tpl.accentColor || '#047857';

  const fmtNum = (n: number) =>
    (Number(n) || 0).toLocaleString('es-HN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  if (isThermal) {
    return `
      <div style="font-size:${format === '58mm' ? '10px' : '11px'};line-height:1.38;">
        <div class="text-center" style="margin-bottom:6px;">
          ${
            tpl.showLogo && storeSettings.logoUrl
              ? `<img src="${storeSettings.logoUrl}" alt="${c.lessorName}" style="width:44px;height:44px;object-fit:contain;margin:0 auto 4px;display:block;border-radius:6px;" />`
              : ''
          }
          <div style="font-size:13px;font-weight:900;text-transform:uppercase;">CONTRATO DE ARRENDAMIENTO CON RESERVA DE DOMINIO</div>
          <div style="font-size:10px;font-weight:700;">Ref. Factura: ${sale.saleNumber}</div>
        </div>
        <div class="dashed-line"></div>
        <p style="margin:4px 0;"><strong>ARRENDADOR:</strong> ${c.lessorName}</p>
        <p style="margin:4px 0;text-align:justify;">
          <strong>ARRENDATARIO:</strong> <strong>${c.customerName}</strong>, mayor de edad, hondureño(a), con domicilio en <strong>${c.customerAddress}</strong>, con número de teléfono <strong>${c.customerPhone}</strong> y Tarjeta de Identidad / RTN número: <strong>${c.customerIdentity}</strong>.
        </p>
        <p style="margin:4px 0;">Por medio del presente documento se celebra un <strong>CONTRATO DE ARRENDAMIENTO</strong> del siguiente bien:</p>
        <div style="border:1px solid #000;padding:5px;border-radius:4px;margin:4px 0;">
          <div>• <strong>Artículo:</strong> ${c.articleDescription} (Marca: ${c.articleBrand}, Modelo: ${c.articleModel})</div>
          <div>• <strong>Valor al Crédito:</strong> LPS. ${fmtNum(c.creditTotalValue)}</div>
        </div>
        <div class="dashed-line"></div>
        <div style="font-weight:900;text-transform:uppercase;margin:4px 0;">CLÁUSULAS PRINCIPALES</div>
        <p style="margin:4px 0;text-align:justify;">
          <strong>SEGUNDA:</strong> El ARRENDADOR da en arrendamiento con reserva de dominio al ARRENDATARIO el o los objetos detallados anteriormente, bajo las siguientes condiciones:
        </p>
        <div style="padding-left:4px;margin:4px 0;">
          <div>- <strong>(A) Valor al crédito:</strong> LPS. ${fmtNum(c.creditTotalValue)}</div>
          <div>- <strong>(B) Valor de la prima:</strong> LPS. ${fmtNum(c.downPaymentValue)}</div>
          <div>- <strong>(C) Valor de la cuota:</strong> LPS. ${fmtNum(c.installmentValue)}</div>
          <div>- <strong>(D) Número de cuotas:</strong> ${c.numberOfInstallments}, las cuales se pagarán mensualmente.</div>
          <div>- <strong>(E) Saldo a financiar:</strong> LPS. ${fmtNum(c.financedBalance)}</div>
        </div>
        <p style="margin:4px 0;text-align:justify;">
          <strong>TERCERA:</strong> El plazo del contrato es de <strong>${c.termMonths}</strong> meses a partir de la fecha. Las cuotas que incluyen capital e interés calculados sobre el saldo adecuado serán pagadas en la tienda arriba mencionada el día <strong>${c.paymentDayOfMonth}</strong> de cada mes, comenzando el <strong>${c.firstPaymentDate}</strong>. El monto financiado en caso de pagar puntualmente será de LPS. <strong>${fmtNum(c.financedBalance)}</strong>.
        </p>
        <p style="margin:4px 0;text-align:justify;">
          <strong>CUARTA:</strong> El ARRENDATARIO declara que el o los artículos objeto de contrato permanecerán en la siguiente dirección: <strong>${c.installationAddress}</strong>.
        </p>
        <p style="margin:4px 0;text-align:justify;">
          <strong>QUINTA:</strong> Forman parte de este contrato las condiciones generales impresas al dorso del presente documento y el certificado de garantía contenido en este mismo, el cual le sirve al ARRENDATARIO para asegurar el buen funcionamiento del producto. El ARRENDADOR se compromete a su reparación durante el tiempo que dure la garantía, exceptuando daños ocasionados por uso indebido. La garantía empieza a contar a partir de la fecha de entrega del artículo.
        </p>
        <p style="margin:4px 0;text-align:justify;">
          <strong>SEXTA:</strong> Expresamente se conviene que este contrato de arrendamiento con reserva de dominio no puede calificarse ni interpretarse de otra manera; por lo que los contratantes renuncian a toda acción o excepción que no se derive de este documento.
        </p>
        <p style="margin:6px 0;font-weight:700;">
          Firmado en <strong>${c.signLocation}</strong> el día <strong>${c.signDay}</strong>, <strong>${c.signMonth}</strong> de <strong>${c.signYear}</strong>.
        </p>
        <div style="margin-top:16px;text-align:center;">
          ${
            c.customerSignatureDataUrl
              ? `<img src="${c.customerSignatureDataUrl}" alt="Firma Arrendatario" style="max-width:170px;max-height:58px;object-fit:contain;margin:0 auto 2px;display:block;" />`
              : `<div style="height:28px;"></div>`
          }
          <div style="border-top:1px solid #000;width:85%;margin:0 auto;padding-top:3px;font-weight:800;">FIRMA ARRENDATARIO (CLIENTE)</div>
          <div style="font-size:9.5px;">${c.customerName} • ID: ${c.customerIdentity}</div>
          ${c.customerSignedAt ? `<div style="font-size:8.5px;color:#334155;">Firmado digitalmente: ${c.customerSignedAt}</div>` : ''}
        </div>
        <div style="margin-top:16px;text-align:center;">
          ${
            c.lessorSignatureDataUrl
              ? `<img src="${c.lessorSignatureDataUrl}" alt="Firma Arrendador" style="max-width:170px;max-height:58px;object-fit:contain;margin:0 auto 2px;display:block;" />`
              : `<div style="height:24px;"></div>`
          }
          <div style="border-top:1px solid #000;width:85%;margin:0 auto;padding-top:3px;font-weight:800;">FIRMA ARRENDADOR</div>
          <div style="font-size:9.5px;">${c.lessorName}</div>
          ${c.lessorSignedAt ? `<div style="font-size:8.5px;color:#334155;">Firmado digitalmente: ${c.lessorSignedAt}</div>` : ''}
        </div>
        <div class="dashed-line"></div>
        <div style="font-weight:900;text-transform:uppercase;margin:4px 0;">CONDICIONES GENERALES</div>
        <ol style="padding-left:14px;margin:4px 0;font-size:9.5px;text-align:justify;">
          ${CREDIT_CONTRACT_GENERAL_CONDITIONS.map((cond) => `<li style="margin-bottom:3px;">${cond}</li>`).join('')}
        </ol>
        <div class="dashed-line"></div>
        <div style="font-weight:900;text-transform:uppercase;margin:4px 0;">CONDICIONES ESPECIALES DE GARANTÍA</div>
        <div style="font-size:9.5px;">
          <div><strong>Plazos de Garantía por Producto:</strong></div>
          <div>• Lavadora: 2 meses de garantía</div>
          <div>• Estufa: 3 meses de garantía</div>
          <div>• Oasis: 2 meses de garantía</div>
          <div>• Refrigeradora: 2 meses de garantía</div>
          <div style="margin-top:4px;"><strong>Exclusiones de Garantía:</strong> Quedan excluidas de garantía todas las fallas ocasionadas por mal uso y/o tratamiento no apropiado, fallas de energía, alto o bajo voltaje, instalaciones eléctricas defectuosas, enchufar en voltaje diferente, daños ocasionados por el medio ambiente o plagas/animales.</div>
          <div>• <strong>Estufas:</strong> Resistencias, empaques, platos de estufa, parrillas, cables de energía, perillas.</div>
          <div>• <strong>Refrigeradoras y Freezers:</strong> Bisagras, empaques, gavetas, llamadores/tiradores, rodos, parrillas, cables de energía.</div>
          <div>• <strong>Lavadoras y Secadoras:</strong> Perillas, cables de energía, switch de tapadera de seguridad.</div>
          <div style="margin-top:4px;text-align:justify;">La garantía no cubre defectos ocasionados por revisión o manipulación de personas no autorizadas por <strong>${c.lessorName}</strong>. Para hacer efectiva la garantía, deberá presentar únicamente este documento en la tienda donde realizó la compra o en las oficinas principales en <strong>${c.signLocation}</strong>.</div>
        </div>
      </div>
    `;
  }

  return `
    <div style="font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;line-height:1.45;font-size:11.5px;">
      <!-- Encabezado Corporativo del Contrato -->
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid ${accentHex};padding-bottom:10px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:12px;">
          ${
            tpl.showLogo && storeSettings.logoUrl
              ? `<img src="${storeSettings.logoUrl}" alt="${c.lessorName}" style="width:54px;height:54px;object-fit:contain;border-radius:10px;border:1px solid #cbd5e1;padding:3px;background:#fff;" />`
              : ''
          }
          <div>
            <div style="font-size:18px;font-weight:900;text-transform:uppercase;color:#0f172a;letter-spacing:-0.3px;">
              ${c.lessorName}
            </div>
            ${storeSettings.address ? `<div style="font-size:10.5px;color:#475569;">${storeSettings.address}</div>` : ''}
            ${storeSettings.phone ? `<div style="font-size:10.5px;color:#475569;">Tel / WhatsApp: ${storeSettings.phone}${storeSettings.storeRtn ? ` • RTN: ${storeSettings.storeRtn}` : ''}</div>` : ''}
          </div>
        </div>
        <div style="text-align:right;background:#f8fafc;border:1.5px solid #cbd5e1;border-radius:10px;padding:8px 12px;">
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;color:${accentHex};">
            CONTRATO DE CRÉDITO OFICIAL
          </div>
          <div style="font-family:monospace;font-size:13px;font-weight:900;color:#0f172a;">
            Ref: ${sale.saleNumber}
          </div>
          <div style="font-size:10px;color:#64748b;">Fecha: ${sale.date}</div>
        </div>
      </div>

      <div style="text-align:center;background:#0f172a;color:#ffffff;padding:7px 12px;border-radius:8px;font-size:13.5px;font-weight:900;letter-spacing:0.4px;text-transform:uppercase;margin-bottom:12px;">
        CONTRATO DE ARRENDAMIENTO CON RESERVA DE DOMINIO
      </div>

      <!-- Identificación de las Partes -->
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;margin-bottom:12px;text-align:justify;">
        <div style="margin-bottom:5px;">
          <strong>ARRENDADOR:</strong> <span style="font-weight:900;color:#0f172a;">${c.lessorName}</span>
        </div>
        <div>
          <strong>ARRENDATARIO:</strong> <strong style="text-decoration:underline;">${c.customerName}</strong>, mayor de edad, hondureño(a), con domicilio en <strong style="text-decoration:underline;">${c.customerAddress}</strong>, con número de teléfono <strong style="text-decoration:underline;">${c.customerPhone}</strong> y Tarjeta de Identidad / RTN número: <strong style="text-decoration:underline;">${c.customerIdentity}</strong>.
        </div>
      </div>

      <!-- Objeto del Contrato -->
      <div style="margin-bottom:12px;">
        <p style="margin:0 0 6px 0;">
          Por medio del presente documento se celebra un <strong>CONTRATO DE ARRENDAMIENTO</strong> del siguiente bien:
        </p>
        <div style="border:1.5px solid #0f172a;border-radius:8px;padding:9px 14px;background:#ffffff;">
          <div style="margin-bottom:4px;">
            • <strong>Artículo:</strong> <strong>${c.articleDescription}</strong> (Marca: <strong>${c.articleBrand}</strong>, Modelo: <strong>${c.articleModel}</strong>)
          </div>
          <div>
            • <strong>Valor al Crédito:</strong> <strong style="color:${accentHex};font-size:13px;">LPS. ${fmtNum(c.creditTotalValue)}</strong>
          </div>
        </div>
      </div>

      <!-- Cláusulas Principales -->
      <div style="margin-bottom:14px;">
        <div style="font-size:12px;font-weight:900;text-transform:uppercase;color:#0f172a;border-bottom:1.5px solid #cbd5e1;padding-bottom:4px;margin-bottom:8px;">
          CLÁUSULAS PRINCIPALES
        </div>

        <p style="margin:0 0 6px 0;text-align:justify;">
          <strong>SEGUNDA:</strong> El ARRENDADOR da en arrendamiento con reserva de dominio al ARRENDATARIO el o los objetos detallados anteriormente, bajo las siguientes condiciones:
        </p>

        <div style="display:grid;grid-template-columns:repeat(2, 1fr);gap:6px 16px;background:#f8fafc;border:1px solid #cbd5e1;border-radius:8px;padding:8px 14px;margin-bottom:8px;font-size:11px;">
          <div>• <strong>(A) Valor al crédito:</strong> LPS. ${fmtNum(c.creditTotalValue)}</div>
          <div>• <strong>(B) Valor de la prima:</strong> LPS. ${fmtNum(c.downPaymentValue)}</div>
          <div>• <strong>(C) Valor de la cuota:</strong> LPS. ${fmtNum(c.installmentValue)}</div>
          <div>• <strong>(D) Número de cuotas:</strong> ${c.numberOfInstallments}, las cuales se pagarán mensualmente.</div>
          <div style="grid-column:span 2;border-top:1px dashed #cbd5e1;padding-top:4px;font-size:12px;">
            • <strong>(E) Saldo a financiar:</strong> <strong style="color:#b45309;">LPS. ${fmtNum(c.financedBalance)}</strong>
          </div>
        </div>

        <p style="margin:0 0 7px 0;text-align:justify;">
          <strong>TERCERA:</strong> El plazo del contrato es de <strong>${c.termMonths}</strong> meses a partir de la fecha. Las cuotas que incluyen capital e interés calculados sobre el saldo adecuado serán pagadas en la tienda arriba mencionada el día <strong>${c.paymentDayOfMonth}</strong> de cada mes, comenzando el <strong>${c.firstPaymentDate}</strong>. El monto financiado en caso de pagar puntualmente será de <strong>LPS. ${fmtNum(c.financedBalance)}</strong>.
        </p>

        <p style="margin:0 0 7px 0;text-align:justify;">
          <strong>CUARTA:</strong> El ARRENDATARIO declara que el o los artículos objeto de contrato permanecerán en la siguiente dirección: <strong style="text-decoration:underline;">${c.installationAddress}</strong>.
        </p>

        <p style="margin:0 0 7px 0;text-align:justify;">
          <strong>QUINTA:</strong> Forman parte de este contrato las condiciones generales impresas al dorso del presente documento y el certificado de garantía contenido en este mismo, el cual le sirve al ARRENDATARIO para asegurar el buen funcionamiento del producto. El ARRENDADOR se compromete a su reparación durante el tiempo que dure la garantía, exceptuando daños ocasionados por uso indebido. La garantía empieza a contar a partir de la fecha de entrega del artículo.
        </p>

        <p style="margin:0 0 10px 0;text-align:justify;">
          <strong>SEXTA:</strong> Expresamente se conviene que este contrato de arrendamiento con reserva de dominio no puede calificarse ni interpretarse de otra manera; por lo que los contratantes renuncian a toda acción o excepción que no se derive de este documento.
        </p>

        <p style="margin:8px 0 16px 0;font-weight:700;">
          Firmado en <strong>${c.signLocation}</strong> el día <strong>${c.signDay}</strong>, <strong>${c.signMonth}</strong> de <strong>${c.signYear}</strong>.
        </p>

        <!-- Bloques de Firmas -->
        <div class="signatures" style="margin-top:16px;margin-bottom:16px;">
          <div class="sig-block" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">
            ${
              c.customerSignatureDataUrl
                ? `<img src="${c.customerSignatureDataUrl}" alt="Firma Cliente" style="max-width:190px;max-height:62px;object-fit:contain;margin-bottom:2px;" />`
                : `<div style="height:44px;"></div>`
            }
            <div class="sig-line" style="width:100%;"></div>
            <div style="font-size:11px;font-weight:900;">FIRMA ARRENDATARIO (CLIENTE)</div>
            <div style="font-size:10px;color:#475569;">${c.customerName}</div>
            <div style="font-size:9.5px;color:#64748b;">Identidad / RTN: ${c.customerIdentity}</div>
            ${c.customerSignedAt ? `<div style="font-size:8.5px;color:#047857;font-weight:700;">Firmado digitalmente: ${c.customerSignedAt}</div>` : ''}
          </div>
          <div class="sig-block" style="display:flex;flex-direction:column;align-items:center;justify-content:flex-end;">
            ${
              c.lessorSignatureDataUrl
                ? `<img src="${c.lessorSignatureDataUrl}" alt="Firma Arrendador" style="max-width:190px;max-height:62px;object-fit:contain;margin-bottom:2px;" />`
                : `<div style="height:44px;"></div>`
            }
            <div class="sig-line" style="width:100%;"></div>
            <div style="font-size:11px;font-weight:900;">FIRMA ARRENDADOR</div>
            <div style="font-size:10px;color:#475569;">${c.lessorName}</div>
            ${c.lessorSignedAt ? `<div style="font-size:8.5px;color:#047857;font-weight:700;">Firmado digitalmente: ${c.lessorSignedAt}</div>` : ''}
          </div>
        </div>
      </div>

      <hr style="border:none;border-top:1.5px dashed #94a3b8;margin:14px 0;" />

      <!-- Condiciones Generales -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11.5px;font-weight:900;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">
          CONDICIONES GENERALES
        </div>
        <ol style="margin:0;padding-left:16px;font-size:9.8px;line-height:1.42;color:#1e293b;text-align:justify;">
          ${CREDIT_CONTRACT_GENERAL_CONDITIONS.map(
            (cond) => `<li style="margin-bottom:3.5px;">${cond}</li>`
          ).join('')}
        </ol>
      </div>

      <!-- Condiciones Especiales de Garantía -->
      <div style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;padding:10px 14px;font-size:10px;line-height:1.42;">
        <div style="font-size:11.5px;font-weight:900;text-transform:uppercase;color:#0f172a;margin-bottom:6px;">
          CONDICIONES ESPECIALES DE GARANTÍA
        </div>
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:12px;">
          <div>
            <div style="font-weight:800;margin-bottom:4px;color:#0f172a;">Plazos de Garantía por Producto:</div>
            <ul style="margin:0;padding-left:15px;">
              <li><strong>Lavadora:</strong> 2 meses de garantía</li>
              <li><strong>Estufa:</strong> 3 meses de garantía</li>
              <li><strong>Oasis:</strong> 2 meses de garantía</li>
              <li><strong>Refrigeradora:</strong> 2 meses de garantía</li>
            </ul>
          </div>
          <div style="text-align:justify;">
            <div style="font-weight:800;margin-bottom:3px;color:#0f172a;">Exclusiones de Garantía:</div>
            <p style="margin:0 0 4px 0;">
              Quedan excluidas de garantía todas las fallas ocasionadas por mal uso y/o tratamiento no apropiado, fallas de energía, alto o bajo voltaje, instalaciones eléctricas defectuosas, enchufar en voltaje diferente, daños ocasionados por el medio ambiente o plagas/animales.
            </p>
            <ul style="margin:0;padding-left:15px;">
              <li><strong>Estufas:</strong> Resistencias, empaques, platos de estufa, parrillas, cables de energía, perillas.</li>
              <li><strong>Refrigeradoras y Freezers:</strong> Bisagras, empaques, gavetas, llamadores/tiradores, rodos, parrillas, cables de energía.</li>
              <li><strong>Lavadoras y Secadoras:</strong> Perillas, cables de energía, switch de tapadera de seguridad.</li>
            </ul>
          </div>
        </div>
        <p style="margin:7px 0 0 0;border-top:1px solid #e2e8f0;padding-top:6px;text-align:justify;">
          La garantía no cubre defectos ocasionados por revisión o manipulación de personas no autorizadas por <strong>${c.lessorName}</strong>. Para hacer efectiva la garantía, deberá presentar únicamente este documento en la tienda donde realizó la compra o en las oficinas principales en <strong>${c.signLocation}</strong>.
        </p>
      </div>
    </div>
  `;
}

export function buildSaleAndCreditContractCombinedHtml(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  format: PrinterPaperFormat = 'letter',
  sellerLabel?: string,
  contractOverride?: CreditContractData,
  controlMeta?: CreditAccountControlMeta,
  inventory?: Product[]
): string {
  const saleHtml = buildSaleDocumentHtml(sale, storeSettings, format, sellerLabel);
  const contractHtml = buildCreditContractHtml(
    sale,
    storeSettings,
    format,
    contractOverride,
    controlMeta,
    inventory
  );
  const isThermal = format === '80mm' || format === '58mm';

  if (isThermal) {
    return `
      ${saleHtml}
      <div style="border-top:2px dashed #000;margin:14px 0;padding-top:10px;"></div>
      ${contractHtml}
    `;
  }

  return `
    <div>
      ${saleHtml}
      <div style="page-break-before:always;break-before:page;margin-top:24px;"></div>
      ${contractHtml}
    </div>
  `;
}

export async function downloadCreditContractPdf(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  contractOverride?: CreditContractData,
  controlMeta?: CreditAccountControlMeta,
  inventory?: Product[]
): Promise<void> {
  await preloadStoreLogoForPdf(storeSettings.logoUrl);
  const c = contractOverride || resolveCreditContractData(sale, storeSettings, controlMeta, inventory);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tpl = getEffectiveInvoiceTemplate(storeSettings);
  const accent = hexToRgbTuple(tpl.accentColor, [4, 120, 87]);

  const fmtNum = (n: number) =>
    (Number(n) || 0).toLocaleString('es-HN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  let y = drawExecutivePdfHeader(doc, {
    storeSettings: {
      ...storeSettings,
      storeName: c.lessorName,
    },
    documentTitle: 'CONTRATO DE CRÉDITO',
    documentNumber: sale.saleNumber,
    dateLabel: `Fecha: ${sale.date}`,
    accentRgb: accent,
    statusBadge: {
      text: 'RESERVA DE DOMINIO',
      bgRgb: [254, 243, 199],
      textRgb: [180, 83, 9],
    },
  });

  // Main Contract Title Banner
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(14, y, pageWidth - 28, 8, 1.8, 1.8, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(255, 255, 255);
  doc.text('CONTRATO DE ARRENDAMIENTO CON RESERVA DE DOMINIO', pageWidth / 2, y + 5.3, {
    align: 'center',
  });
  y += 11;

  // Parties Block
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  const partiesText = `ARRENDADOR: ${c.lessorName}\nARRENDATARIO: ${c.customerName}, mayor de edad, hondureño(a), con domicilio en ${c.customerAddress}, con número de teléfono ${c.customerPhone} y Tarjeta de Identidad / RTN número: ${c.customerIdentity}.`;
  const splitParties = doc.splitTextToSize(partiesText, pageWidth - 34);
  const partiesBoxH = splitParties.length * 4.2 + 5;
  doc.roundedRect(14, y, pageWidth - 28, partiesBoxH, 2, 2, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.text(splitParties, 17, y + 4.8);
  y += partiesBoxH + 4;

  // Object of Contract Table
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.8);
  doc.setTextColor(30, 41, 59);
  doc.text(
    'Por medio del presente documento se celebra un CONTRATO DE ARRENDAMIENTO del siguiente bien:',
    14,
    y + 3
  );
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['DESCRIPCIÓN DEL ARTÍCULO ARRENDADO', 'MARCA', 'MODELO / CÓDIGO', 'VALOR AL CRÉDITO']],
    body: [
      [
        c.articleDescription,
        c.articleBrand,
        c.articleModel,
        `LPS. ${fmtNum(c.creditTotalValue)}`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, cellPadding: 2.3 },
    bodyStyles: { fontSize: 8.5, cellPadding: 2.5, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 85 },
      1: { cellWidth: 32 },
      2: { cellWidth: 35 },
      3: { cellWidth: 'auto', halign: 'right', textColor: accent },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 5;

  // CLÁUSULAS PRINCIPALES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(15, 23, 42);
  doc.text('CLÁUSULAS PRINCIPALES', 14, y);
  y += 2;

  autoTable(doc, {
    startY: y,
    head: [
      [
        '(A) VALOR AL CRÉDITO',
        '(B) VALOR DE LA PRIMA',
        '(C) VALOR DE LA CUOTA',
        '(D) NÚMERO DE CUOTAS',
        '(E) SALDO A FINANCIAR',
      ],
    ],
    body: [
      [
        `LPS. ${fmtNum(c.creditTotalValue)}`,
        `LPS. ${fmtNum(c.downPaymentValue)}`,
        `LPS. ${fmtNum(c.installmentValue)}`,
        `${c.numberOfInstallments} mensuales`,
        `LPS. ${fmtNum(c.financedBalance)}`,
      ],
    ],
    theme: 'grid',
    headStyles: { fillColor: accent, textColor: 255, fontSize: 7.5, cellPadding: 2.2, halign: 'center' },
    bodyStyles: { fontSize: 8.5, cellPadding: 2.4, fontStyle: 'bold', halign: 'center' },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 4.5;

  const principalClauses = [
    `SEGUNDA: El ARRENDADOR da en arrendamiento con reserva de dominio al ARRENDATARIO el o los objetos detallados anteriormente, bajo las condiciones financieras estipuladas en los incisos (A) al (E) de la tabla superior, pagaderas mensualmente.`,
    `TERCERA: El plazo del contrato es de ${c.termMonths} meses a partir de la fecha. Las cuotas que incluyen capital e interés calculados sobre el saldo adecuado serán pagadas en la tienda arriba mencionada el día ${c.paymentDayOfMonth} de cada mes, comenzando el ${c.firstPaymentDate}. El monto financiado en caso de pagar puntualmente será de LPS. ${fmtNum(c.financedBalance)}.`,
    `CUARTA: El ARRENDATARIO declara que el o los artículos objeto de contrato permanecerán en la siguiente dirección: ${c.installationAddress}.`,
    `QUINTA: Forman parte de este contrato las condiciones generales impresas al dorso del presente documento y el certificado de garantía contenido en este mismo, el cual le sirve al ARRENDATARIO para asegurar el buen funcionamiento del producto. El ARRENDADOR se compromete a su reparación durante el tiempo que dure la garantía, exceptuando daños ocasionados por uso indebido. La garantía empieza a contar a partir de la fecha de entrega del artículo.`,
    `SEXTA: Expresamente se conviene que este contrato de arrendamiento con reserva de dominio no puede calificarse ni interpretarse de otra manera; por lo que los contratantes renuncian a toda acción o excepción que no se derive de este documento.`,
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(30, 41, 59);

  for (const clause of principalClauses) {
    const lines = doc.splitTextToSize(clause, pageWidth - 28);
    doc.text(lines, 14, y);
    y += lines.length * 3.7 + 1.8;
  }

  y += 1.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Firmado en ${c.signLocation} el día ${c.signDay}, ${c.signMonth} de ${c.signYear}.`,
    14,
    y
  );

  // Signatures on Page 1
  y += 18;
  if (c.customerSignatureDataUrl) {
    try {
      doc.addImage(c.customerSignatureDataUrl, 'PNG', 32, y - 14.5, 56, 14);
    } catch {
      // ignore invalid image
    }
  }
  if (c.lessorSignatureDataUrl) {
    try {
      doc.addImage(c.lessorSignatureDataUrl, 'PNG', 128, y - 14.5, 56, 14);
    } catch {
      // ignore invalid image
    }
  }
  doc.setDrawColor(51, 65, 85);
  doc.setLineWidth(0.35);
  doc.line(24, y, 96, y);
  doc.line(120, y, 192, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text('FIRMA ARRENDATARIO (CLIENTE)', 60, y + 4.5, { align: 'center' });
  doc.text('FIRMA ARRENDADOR', 156, y + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`${c.customerName} — ID/RTN: ${c.customerIdentity}`, 60, y + 8.3, { align: 'center' });
  doc.text(c.lessorName, 156, y + 8.3, { align: 'center' });

  y += 13;

  // Check if General Conditions + Warranty fit or if we add a clean section/page
  if (y > pageHeight - 95) {
    doc.addPage();
    y = 16;
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(14, y, pageWidth - 14, y);
    y += 5;
  }

  // CONDICIONES GENERALES
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('CONDICIONES GENERALES DEL CONTRATO', 14, y);
  y += 4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.setTextColor(30, 41, 59);

  CREDIT_CONTRACT_GENERAL_CONDITIONS.forEach((cond, idx) => {
    const numbered = `${idx + 1}. ${cond}`;
    const wrapped = doc.splitTextToSize(numbered, pageWidth - 28);
    if (y + wrapped.length * 3.1 > pageHeight - 16) {
      doc.addPage();
      y = 16;
    }
    doc.text(wrapped, 14, y);
    y += wrapped.length * 3.1 + 1.1;
  });

  y += 3;
  if (y > pageHeight - 52) {
    doc.addPage();
    y = 16;
  }

  // CONDICIONES ESPECIALES DE GARANTÍA
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  const warrantyBoxTop = y;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.text('CONDICIONES ESPECIALES DE GARANTÍA', 14, y + 4);
  y += 8;

  const warrantyLines = [
    'Plazos de Garantía por Producto:  • Lavadora: 2 meses de garantía   • Estufa: 3 meses de garantía   • Oasis: 2 meses de garantía   • Refrigeradora: 2 meses de garantía',
    'Exclusiones de Garantía: Quedan excluidas de garantía todas las fallas ocasionadas por mal uso y/o tratamiento no apropiado, fallas de energía, alto o bajo voltaje, instalaciones eléctricas defectuosas, enchufar en voltaje diferente, daños ocasionados por el medio ambiente o plagas/animales.',
    '• Estufas: Resistencias, empaques, platos de estufa, parrillas, cables de energía, perillas.',
    '• Refrigeradoras y Freezers: Bisagras, empaques, gavetas, llamadores/tiradores, rodos, parrillas, cables de energía.',
    '• Lavadoras y Secadoras: Perillas, cables de energía, switch de tapadera de seguridad.',
    `La garantía no cubre defectos ocasionados por revisión o manipulación de personas no autorizadas por ${c.lessorName}. Para hacer efectiva la garantía, deberá presentar únicamente este documento en la tienda donde realizó la compra o en las oficinas principales en ${c.signLocation}.`,
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.3);
  doc.setTextColor(30, 41, 59);
  for (const wl of warrantyLines) {
    const wrapped = doc.splitTextToSize(wl, pageWidth - 32);
    doc.text(wrapped, 16, y);
    y += wrapped.length * 3.2 + 1.2;
  }

  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, warrantyBoxTop - 1, pageWidth - 28, y - warrantyBoxTop + 2, 2, 2, 'D');

  drawPdfPageFooters(doc, storeSettings, `Contrato de Crédito ${sale.saleNumber}`);
  const cleanCust = (c.customerName || 'Cliente').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
  doc.save(`Contrato_Credito_${sale.saleNumber}_${cleanCust}.pdf`);
}

export function formatCreditContractWhatsAppMessage(
  sale: SaleRecord,
  storeSettings: StoreSettings,
  contractOverride?: CreditContractData,
  controlMeta?: CreditAccountControlMeta,
  inventory?: Product[]
): string {
  const c = contractOverride || resolveCreditContractData(sale, storeSettings, controlMeta, inventory);
  const fmtNum = (n: number) =>
    (Number(n) || 0).toLocaleString('es-HN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  let msg = `📜 *CONTRATO DE ARRENDAMIENTO CON RESERVA DE DOMINIO*\n`;
  msg += `*Ref. Factura:* ${sale.saleNumber}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `*ARRENDADOR:* ${c.lessorName}\n`;
  msg += `*ARRENDATARIO:* ${c.customerName}, mayor de edad, hondureño(a), con domicilio en ${c.customerAddress}, con número de teléfono ${c.customerPhone} y Tarjeta de Identidad / RTN número: ${c.customerIdentity}.\n\n`;
  msg += `Por medio del presente documento se celebra un *CONTRATO DE ARRENDAMIENTO* del siguiente bien:\n`;
  msg += `• *Artículo:* ${c.articleDescription} (Marca: ${c.articleBrand}, Modelo: ${c.articleModel})\n`;
  msg += `• *Valor al Crédito:* LPS. ${fmtNum(c.creditTotalValue)}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `📌 *CLÁUSULAS PRINCIPALES*\n\n`;
  msg += `*SEGUNDA:* El ARRENDADOR da en arrendamiento con reserva de dominio al ARRENDATARIO el o los objetos detallados anteriormente, bajo las siguientes condiciones:\n`;
  msg += `• *(A) Valor al crédito:* LPS. ${fmtNum(c.creditTotalValue)}\n`;
  msg += `• *(B) Valor de la prima:* LPS. ${fmtNum(c.downPaymentValue)}\n`;
  msg += `• *(C) Valor de la cuota:* LPS. ${fmtNum(c.installmentValue)}\n`;
  msg += `• *(D) Número de cuotas:* ${c.numberOfInstallments}, las cuales se pagarán mensualmente.\n`;
  msg += `• *(E) Saldo a financiar:* LPS. ${fmtNum(c.financedBalance)}\n\n`;
  msg += `*TERCERA:* El plazo del contrato es de *${c.termMonths}* meses a partir de la fecha. Las cuotas que incluyen capital e interés calculados sobre el saldo adecuado serán pagadas en la tienda arriba mencionada el día *${c.paymentDayOfMonth}* de cada mes, comenzando el *${c.firstPaymentDate}*. El monto financiado en caso de pagar puntualmente será de *LPS. ${fmtNum(c.financedBalance)}*.\n\n`;
  msg += `*CUARTA:* El ARRENDATARIO declara que el o los artículos objeto de contrato permanecerán en la siguiente dirección: *${c.installationAddress}*.\n\n`;
  msg += `*QUINTA:* Forman parte de este contrato las condiciones generales y el certificado de garantía contenido en este mismo, el cual le sirve al ARRENDATARIO para asegurar el buen funcionamiento del producto (Lavadora: 2 meses, Estufa: 3 meses, Oasis: 2 meses, Refrigeradora: 2 meses). La garantía empieza a contar a partir de la fecha de entrega del artículo.\n\n`;
  msg += `*SEXTA:* Expresamente se conviene que este contrato de arrendamiento con reserva de dominio no puede calificarse ni interpretarse de otra manera.\n\n`;
  msg += `Firmado en *${c.signLocation}* el día *${c.signDay}*, *${c.signMonth}* de *${c.signYear}*.\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `✍️ *FIRMA ARRENDATARIO:* ${c.customerName}${c.customerSignatureDataUrl ? ' (✅ Firmado digitalmente en pantalla)' : ''}\n`;
  msg += `✍️ *FIRMA ARRENDADOR:* ${c.lessorName}${c.lessorSignatureDataUrl ? ' (✅ Firmado digitalmente)' : ''}`;

  return msg;
}





