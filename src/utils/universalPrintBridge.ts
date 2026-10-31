import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { PrinterPaperFormat } from '../types';

export interface BridgePrinterInfo {
  name: string;
  driverName: string;
  portName: string;
  isDefault: boolean;
  status: string;
}

export interface BridgeConfig {
  pcIp: string;
  printerName: string;
  enabled: boolean;
}

const STORAGE_KEYS = {
  PC_IP: 'gosen_bridge_pc_ip',
  PRINTER_NAME: 'gosen_bridge_printer_name',
  ENABLED: 'gosen_bridge_enabled',
};

export function getBridgeConfig(): BridgeConfig {
  try {
    const pcIp = localStorage.getItem(STORAGE_KEYS.PC_IP) || '';
    const printerName = localStorage.getItem(STORAGE_KEYS.PRINTER_NAME) || '';
    const rawEnabled = localStorage.getItem(STORAGE_KEYS.ENABLED);
    const enabled = rawEnabled !== null ? rawEnabled === 'true' : Boolean(pcIp);
    return { pcIp: pcIp.trim(), printerName: printerName.trim(), enabled };
  } catch {
    return { pcIp: '', printerName: '', enabled: false };
  }
}

export function saveBridgeConfig(config: Partial<BridgeConfig>): BridgeConfig {
  const current = getBridgeConfig();
  const updated: BridgeConfig = {
    pcIp: config.pcIp !== undefined ? config.pcIp.trim() : current.pcIp,
    printerName: config.printerName !== undefined ? config.printerName.trim() : current.printerName,
    enabled: config.enabled !== undefined ? Boolean(config.enabled) : current.enabled,
  };
  try {
    localStorage.setItem(STORAGE_KEYS.PC_IP, updated.pcIp);
    localStorage.setItem(STORAGE_KEYS.PRINTER_NAME, updated.printerName);
    localStorage.setItem(STORAGE_KEYS.ENABLED, String(updated.enabled));
  } catch {}
  return updated;
}

/**
 * Normaliza la dirección IP o URL del servidor puente en la PC de caja.
 * Ejemplo: "192.168.1.50" -> "http://192.168.1.50:4000"
 */
export function buildBridgeBaseUrl(rawIpOrHost?: string): string {
  const clean = (rawIpOrHost || '').trim().replace(/\/+$/, '');
  if (!clean) {
    return '';
  }
  const withProtocol = /^https?:\/\//i.test(clean) ? clean : `http://${clean}`;
  try {
    const url = new URL(withProtocol);
    if (!url.port && !clean.includes(':4000') && !clean.includes(':3000')) {
      url.port = '4000';
    }
    return url.origin;
  } catch {
    return withProtocol.includes(':') ? withProtocol : `${withProtocol}:4000`;
  }
}

/**
 * Consulta GET /impresoras en la PC de caja para listar todas las impresoras instaladas en Windows
 */
export async function fetchBridgePrinters(customIp?: string): Promise<{
  ok: boolean;
  hostname?: string;
  printers: BridgePrinterInfo[];
  error?: string;
}> {
  const cfg = getBridgeConfig();
  const targetIp = customIp !== undefined ? customIp.trim() : cfg.pcIp;
  const baseUrl = buildBridgeBaseUrl(targetIp);
  const endpoints = baseUrl ? [`${baseUrl}/impresoras`, '/impresoras'] : ['/impresoras'];

  let lastError = 'No se pudo conectar con la PC de caja en la red local.';

  for (const url of endpoints) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    try {
      const res = await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) {
        const data = await res.json();
        const printers: BridgePrinterInfo[] = Array.isArray(data.printers) ? data.printers : [];
        return {
          ok: true,
          hostname: data.hostname,
          printers,
        };
      }
    } catch (err: any) {
      clearTimeout(timer);
      lastError = err?.message || lastError;
    }
  }

  return { ok: false, printers: [], error: lastError };
}

/**
 * Captura el contenedor DOM actual del ticket (sin alterar su diseño visual)
 * y lo convierte en Canvas (PNG Base64) y PDF Base64 ajustado al ancho configurado (58mm u 80mm).
 */
export async function captureTicketElementToCanvasAndPdf(
  ticketElement: HTMLElement,
  format: PrinterPaperFormat = '80mm'
): Promise<{
  imageBase64: string;
  pdfBase64: string;
  widthMm: number;
  heightMm: number;
}> {
  const widthMm = format === '58mm' ? 58 : format === '80mm' ? 80 : format === 'half-letter' ? 140 : 210;
  const targetPxWidth = format === '58mm' ? 230 : format === '80mm' ? 310 : 680;

  // Clonamos el nodo en un contenedor fuera de pantalla con el ancho exacto del formato térmico
  // para no alterar el diseño visual ni el scroll que el usuario está viendo en pantalla.
  const offscreenWrapper = document.createElement('div');
  offscreenWrapper.style.position = 'fixed';
  offscreenWrapper.style.left = '-9999px';
  offscreenWrapper.style.top = '0';
  offscreenWrapper.style.width = `${targetPxWidth}px`;
  offscreenWrapper.style.background = '#ffffff';
  offscreenWrapper.style.zIndex = '-1';

  const clonedTicket = ticketElement.cloneNode(true) as HTMLElement;
  clonedTicket.style.width = '100%';
  clonedTicket.style.maxWidth = `${targetPxWidth}px`;
  clonedTicket.style.margin = '0';
  clonedTicket.style.border = 'none';
  clonedTicket.style.borderRadius = '0';
  clonedTicket.style.boxShadow = 'none';
  clonedTicket.style.background = '#ffffff';

  offscreenWrapper.appendChild(clonedTicket);
  document.body.appendChild(offscreenWrapper);

  try {
    const canvas = await html2canvas(clonedTicket, {
      scale: 2.5,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
    });

    const imageBase64 = canvas.toDataURL('image/png');
    const aspectRatio = canvas.height / Math.max(1, canvas.width);
    const heightMm = Math.max(45, Math.ceil(widthMm * aspectRatio) + 4);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [widthMm, heightMm],
    });

    pdf.addImage(imageBase64, 'PNG', 0, 0, widthMm, widthMm * aspectRatio, undefined, 'FAST');
    const pdfBase64 = pdf.output('datauristring');

    return {
      imageBase64,
      pdfBase64,
      widthMm,
      heightMm,
    };
  } finally {
    if (offscreenWrapper.parentNode) {
      offscreenWrapper.parentNode.removeChild(offscreenWrapper);
    }
  }
}

/**
 * Envía el ticket capturado al servidor puente Node.js en la PC de caja (POST /imprimir).
 * Retorna true si el servidor puente recibió y encoló la impresión en Windows exitosamente.
 */
export async function sendTicketToBridgeServer(params: {
  ticketElement?: HTMLElement | null;
  format: PrinterPaperFormat;
  printerName?: string;
  pcIp?: string;
}): Promise<{ ok: boolean; printerName?: string; error?: string }> {
  const cfg = getBridgeConfig();
  const targetIp = params.pcIp !== undefined ? params.pcIp.trim() : cfg.pcIp;
  const targetPrinter = params.printerName !== undefined ? params.printerName.trim() : cfg.printerName;

  if (!targetIp && !cfg.enabled) {
    return { ok: false, error: 'Puente PC no configurado' };
  }

  if (!params.ticketElement) {
    return { ok: false, error: 'No se encontró el contenedor DOM del ticket' };
  }

  const captured = await captureTicketElementToCanvasAndPdf(params.ticketElement, params.format);
  const baseUrl = buildBridgeBaseUrl(targetIp);
  const postUrl = baseUrl ? `${baseUrl}/imprimir` : '/imprimir';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(postUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        imageBase64: captured.imageBase64,
        pdfBase64: captured.pdfBase64,
        printerName: targetPrinter || undefined,
        format: params.format,
        widthMm: captured.widthMm,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const data = await response.json().catch(() => ({}));
    if (response.ok && data?.ok) {
      return {
        ok: true,
        printerName: data.printerName || targetPrinter || 'Impresora de Caja',
      };
    }
    return {
      ok: false,
      error: data?.error || `Error HTTP ${response.status}`,
    };
  } catch (err: any) {
    clearTimeout(timeoutId);
    return {
      ok: false,
      error: err?.message || 'PC de caja no detectada en la red local',
    };
  }
}

/**
 * Modo Respaldo (Fallback):
 * Si el celular o equipo no detecta la PC en la red local, clona el contenedor exacto
 * del ticket actual en el portal de impresión aplicando reglas CSS @page y @media print
 * para que window.print() conserve intactos los márgenes y proporciones térmicas (58mm/80mm).
 */
export function printTicketDomElementWithFallbackCss(
  ticketElement: HTMLElement,
  format: PrinterPaperFormat = '80mm',
  documentTitle = 'Ticket de Venta'
): void {
  const is58 = format === '58mm';
  const is80 = format === '80mm';
  const pageSizeRule = is58
    ? 'size: 58mm auto; margin: 0mm;'
    : is80
    ? 'size: 80mm auto; margin: 0mm;'
    : format === 'half-letter'
    ? 'size: 8.5in 5.5in; margin: 6mm;'
    : 'size: letter portrait; margin: 8mm;';

  const targetWidthCss = is58 ? '54mm' : is80 ? '74mm' : '100%';

  let styleEl = document.getElementById('gosen-universal-ticket-print-css') as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'gosen-universal-ticket-print-css';
    document.head.appendChild(styleEl);
  }

  styleEl.textContent = `
    @page {
      ${pageSizeRule}
    }
    #gosen-universal-ticket-portal {
      display: none;
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        width: 100% !important;
        height: auto !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body > *:not(#gosen-universal-ticket-portal) {
        display: none !important;
      }
      #gosen-universal-ticket-portal {
        display: block !important;
        width: ${targetWidthCss} !important;
        max-width: ${targetWidthCss} !important;
        margin: 0 auto !important;
        padding: ${is58 ? '1.5mm' : is80 ? '2.5mm' : '0'} !important;
        background: #ffffff !important;
        color: #0f172a !important;
      }
      #gosen-universal-ticket-portal * {
        box-shadow: none !important;
      }
    }
  `;

  let portal = document.getElementById('gosen-universal-ticket-portal') as HTMLDivElement | null;
  if (!portal) {
    portal = document.createElement('div');
    portal.id = 'gosen-universal-ticket-portal';
    document.body.appendChild(portal);
  }

  portal.innerHTML = '';
  const cloned = ticketElement.cloneNode(true) as HTMLElement;
  cloned.style.border = 'none';
  cloned.style.boxShadow = 'none';
  cloned.style.margin = '0';
  cloned.style.width = '100%';
  portal.appendChild(cloned);

  const prevTitle = document.title;
  document.title = documentTitle;

  try {
    window.print();
  } finally {
    setTimeout(() => {
      document.title = prevTitle;
    }, 800);
  }
}

/**
 * Permite descargar el archivo "servidor-puente-impresora.cjs" con 1 clic desde la interfaz
 * para ejecutarlo en la PC Windows de caja.
 */
export function downloadStandaloneBridgeScript(): void {
  const scriptContent = `/**
 * SERVIDOR PUENTE UNIVERSAL DE IMPRESIÓN POS Y OFICINA (NODE.JS + EXPRESS)
 * Instrucciones en la PC de Caja (Windows):
 *   1. Abrir terminal en esta carpeta y ejecutar: npm init -y && npm install express
 *   2. Iniciar el servidor puente:                node servidor-puente-impresora.cjs
 */
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, exec } = require('child_process');

const app = express();
const PORT = process.env.BRIDGE_PORT || 4000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

app.use(express.json({ limit: '35mb' }));

app.get('/impresoras', (_req, res) => {
  const psCommand = 'Get-Printer | Select-Object Name, DriverName, PortName, Default, PrinterStatus | ConvertTo-Json -Compress';
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCommand], { timeout: 8000, windowsHide: true }, (err, stdout) => {
    if (!err && stdout && stdout.trim()) {
      try {
        const raw = JSON.parse(stdout.trim());
        const list = Array.isArray(raw) ? raw : [raw];
        const printers = list.filter(p => p && p.Name).map(p => ({
          name: String(p.Name).trim(),
          driverName: String(p.DriverName || 'Driver de Windows').trim(),
          portName: String(p.PortName || '').trim(),
          isDefault: Boolean(p.Default),
          status: String(p.PrinterStatus ?? 'Normal'),
        }));
        return res.json({ ok: true, hostname: os.hostname(), printers });
      } catch (_e) {}
    }
    return res.json({ ok: true, hostname: os.hostname(), printers: [] });
  });
});

app.post('/imprimir', (req, res) => {
  const { imageBase64, printerName, format = '80mm', widthMm } = req.body || {};
  if (!imageBase64) return res.status(400).json({ ok: false, error: 'Falta imageBase64' });
  const effectiveWidthMm = Number(widthMm) || (format === '58mm' ? 58 : 80);
  const widthHundredthsInch = Math.round((effectiveWidthMm / 25.4) * 100);
  const tmpPngPath = path.join(os.tmpdir(), 'ticket_' + Date.now() + '.png');
  fs.writeFileSync(tmpPngPath, Buffer.from(imageBase64.replace(/^data:image\\/\\w+;base64,/, ''), 'base64'));

  const escapedImgPath = tmpPngPath.replace(/'/g, "''");
  const escapedPrinter = (printerName || '').replace(/'/g, "''");
  const psScript = \`
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('\${escapedImgPath}')
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  if ('\${escapedPrinter}' -ne '') { $doc.PrinterSettings.PrinterName = '\${escapedPrinter}' }
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $targetW = \${widthHundredthsInch}
  $scale = $targetW / [double]$img.Width
  $targetH = [int][Math]::Ceiling($img.Height * $scale)
  $doc.DefaultPageSettings.PaperSize = New-Object System.Drawing.Printing.PaperSize('TicketPOS', $targetW, ($targetH + 20))
  $doc.add_PrintPage({
    param($s, $e)
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $e.Graphics.DrawImage($img, (New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)))
    $e.HasMorePages = $false
  })
  $doc.Print()
} finally { $img.Dispose() }
\`;
  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript], { timeout: 20000, windowsHide: true }, (err, _stdout, stderr) => {
    setTimeout(() => fs.unlink(tmpPngPath, () => {}), 8000);
    if (err) return res.status(500).json({ ok: false, error: stderr || err.message });
    return res.json({ ok: true, printerName: printerName || 'Predeterminada de Windows' });
  });
});

app.listen(PORT, '0.0.0.0', () => console.log('Servidor Puente activo en http://0.0.0.0:' + PORT));
`;

  const blob = new Blob([scriptContent], { type: 'application/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'servidor-puente-impresora.cjs';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
