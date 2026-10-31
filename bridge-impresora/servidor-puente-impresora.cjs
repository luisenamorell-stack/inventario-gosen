/**
 * ============================================================================
 * SERVIDOR PUENTE UNIVERSAL DE IMPRESIÓN POS Y OFICINA (NODE.JS + EXPRESS)
 * Para ejecutar en la PC de Caja (Windows):
 *   1. Instalar dependencias: npm install express cors
 *      (Opcional para PDF directo: npm install pdf-to-printer)
 *   2. Iniciar servidor:      node servidor-puente-impresora.cjs
 *   3. Escucha en:            http://0.0.0.0:4000
 *      - GET  /impresoras -> Lista todas las impresoras instaladas en Windows
 *      - POST /imprimir   -> Envía el ticket/PDF a la cola de impresión de Windows
 * ============================================================================
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile, exec } = require('child_process');

const app = express();
const PORT = process.env.BRIDGE_PORT || 4000;

// Middleware CORS + Private Network Access (permite peticiones desde iPhone, Android y navegadores HTTPS)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '35mb' }));

/**
 * Obtiene la lista real de impresoras instaladas en la cola de Windows (o Linux/macOS)
 */
function listarImpresorasDelSistema() {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      const psCommand =
        'Get-Printer | Select-Object Name, DriverName, PortName, Default, PrinterStatus | ConvertTo-Json -Compress';
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCommand],
        { timeout: 8000, windowsHide: true },
        (err, stdout) => {
          if (!err && stdout && stdout.trim()) {
            try {
              const raw = JSON.parse(stdout.trim());
              const list = Array.isArray(raw) ? raw : [raw];
              const printers = list
                .filter((p) => p && p.Name)
                .map((p) => ({
                  name: String(p.Name).trim(),
                  driverName: String(p.DriverName || 'Driver de Windows').trim(),
                  portName: String(p.PortName || '').trim(),
                  isDefault: Boolean(p.Default),
                  status: String(p.PrinterStatus ?? 'Normal'),
                }));
              if (printers.length > 0) {
                return resolve(printers);
              }
            } catch (_parseErr) {
              // Continúa al fallback wmic
            }
          }

          // Fallback Windows: WMIC
          exec(
            'wmic printer get Name,Default,DriverName /format:csv',
            { timeout: 6000, windowsHide: true },
            (wmicErr, wmicOut) => {
              if (wmicErr || !wmicOut) {
                return resolve([]);
              }
              const lines = wmicOut
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
              const printers = [];
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (cols.length >= 4) {
                  const isDef = String(cols[1]).toLowerCase() === 'true';
                  const driverName = cols[2] || 'Windows Spooler';
                  const name = cols.slice(3).join(',').trim();
                  if (name) {
                    printers.push({
                      name,
                      driverName,
                      portName: 'USB/LAN',
                      isDefault: isDef,
                      status: 'Lista',
                    });
                  }
                }
              }
              resolve(printers);
            }
          );
        }
      );
    } else {
      // Fallback Linux / macOS (CUPS lpstat)
      exec('lpstat -p -d', { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const lines = stdout.split(/\r?\n/);
        let defaultPrinter = '';
        const defaultLine = lines.find((l) => l.includes('system default destination:'));
        if (defaultLine) {
          defaultPrinter = defaultLine.split(':').pop().trim();
        }
        const printers = lines
          .filter((l) => l.startsWith('printer '))
          .map((l) => {
            const name = l.split(/\s+/)[1];
            return {
              name,
              driverName: 'CUPS Driver',
              portName: 'Local/Network',
              isDefault: name === defaultPrinter,
              status: 'Lista',
            };
          });
        resolve(printers);
      });
    }
  });
}

/**
 * Imprime una imagen PNG (captura exacta del ticket) en la cola de impresión de Windows
 * usando System.Drawing.Printing.PrintDocument (.NET integrado en todo Windows).
 * Esto respeta exactamente los drivers instalados (58mm, 80mm, USB, Red o Láser) sin cortar márgenes.
 */
function imprimirImagenEnColaWindows(imagePath, printerName, widthMm = 80) {
  return new Promise((resolve, reject) => {
    // 1 pulgada = 25.4 mm; PrintDocument usa centésimas de pulgada (100 dpi lógicos)
    const widthHundredthsInch = Math.round((Number(widthMm) / 25.4) * 100);
    const escapedImgPath = imagePath.replace(/'/g, "''");
    const escapedPrinter = (printerName || '').replace(/'/g, "''");

    const psScript = `
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile('${escapedImgPath}')
try {
  $doc = New-Object System.Drawing.Printing.PrintDocument
  if ('${escapedPrinter}' -ne '') {
    $doc.PrinterSettings.PrinterName = '${escapedPrinter}'
  }
  $doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0, 0, 0, 0)
  $targetW = ${widthHundredthsInch}
  if ($doc.DefaultPageSettings.PrintableArea.Width -gt 10 -and $targetW -gt 350) {
    $targetW = [int]$doc.DefaultPageSettings.PrintableArea.Width
  }
  $scale = $targetW / [double]$img.Width
  $targetH = [int][Math]::Ceiling($img.Height * $scale)
  $paperSize = New-Object System.Drawing.Printing.PaperSize('TicketPOS', $targetW, ($targetH + 20))
  $doc.DefaultPageSettings.PaperSize = $paperSize
  $doc.add_PrintPage({
    param($sender, $e)
    $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $rect = New-Object System.Drawing.Rectangle(0, 0, $targetW, $targetH)
    $e.Graphics.DrawImage($img, $rect)
    $e.HasMorePages = $false
  })
  $doc.Print()
} finally {
  $img.Dispose()
}
`;

    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
      { timeout: 20000, windowsHide: true },
      (err, _stdout, stderr) => {
        if (err) {
          return reject(new Error(stderr || err.message));
        }
        resolve(true);
      }
    );
  });
}

/**
 * Imprime un archivo PDF en la cola de Windows usando pdf-to-printer (si está instalado)
 * o PowerShell Start-Process -Verb PrintTo.
 */
function imprimirPdfEnColaWindows(pdfPath, printerName) {
  return new Promise((resolve, reject) => {
    try {
      // Intenta primero con pdf-to-printer si el usuario lo instaló en su PC
      const pdfToPrinter = require('pdf-to-printer');
      const options = printerName ? { printer: printerName, scale: 'fit' } : { scale: 'fit' };
      pdfToPrinter
        .print(pdfPath, options)
        .then(() => resolve(true))
        .catch((err) => reject(err));
      return;
    } catch (_notInstalled) {
      // Fallback nativo de Windows vía PowerShell PrintTo
      const escapedPdf = pdfPath.replace(/'/g, "''");
      const escapedPrinter = (printerName || '').replace(/'/g, "''");
      const cmd = escapedPrinter
        ? `Start-Process -FilePath '${escapedPdf}' -Verb PrintTo -ArgumentList '"${escapedPrinter}"' -WindowStyle Hidden`
        : `Start-Process -FilePath '${escapedPdf}' -Verb Print -WindowStyle Hidden`;

      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
        { timeout: 15000, windowsHide: true },
        (err, _stdout, stderr) => {
          if (err) return reject(new Error(stderr || err.message));
          resolve(true);
        }
      );
    }
  });
}

// ============================================================================
// ENDPOINT 1: GET /impresoras
// Lista todas las impresoras instaladas en la PC de caja
// ============================================================================
app.get('/impresoras', async (_req, res) => {
  try {
    const printers = await listarImpresorasDelSistema();
    return res.json({
      ok: true,
      hostname: os.hostname(),
      platform: process.platform,
      printers,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || 'Error al obtener impresoras del sistema',
      printers: [],
    });
  }
});

// ============================================================================
// ENDPOINT 2: POST /imprimir
// Recibe el ticket capturado (imageBase64 y/o pdfBase64) y lo envía a la cola
// de impresión del sistema operativo respetando el ancho configurado (58mm/80mm)
// ============================================================================
app.post('/imprimir', async (req, res) => {
  const { imageBase64, pdfBase64, printerName, format = '80mm', widthMm } = req.body || {};

  if (!imageBase64 && !pdfBase64) {
    return res.status(400).json({
      ok: false,
      error: 'Debe enviar imageBase64 o pdfBase64 con la captura del ticket.',
    });
  }

  const effectiveWidthMm =
    Number(widthMm) || (format === '58mm' ? 58 : format === '80mm' ? 80 : 210);
  const tmpDir = os.tmpdir();
  const jobId = `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpPngPath = path.join(tmpDir, `${jobId}.png`);
  const tmpPdfPath = path.join(tmpDir, `${jobId}.pdf`);

  try {
    // En Windows, si se recibe la captura en alta resolución (imageBase64),
    // System.Drawing.Printing.PrintDocument envía el trabajo gráfico directo al Spooler
    // sin depender de Adobe Reader ni drivers ESC/POS crudos.
    if (process.platform === 'win32' && imageBase64) {
      const cleanPng = imageBase64.replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(tmpPngPath, Buffer.from(cleanPng, 'base64'));
      await imprimirImagenEnColaWindows(tmpPngPath, printerName, effectiveWidthMm);
      setTimeout(() => {
        fs.unlink(tmpPngPath, () => {});
      }, 10000);
      return res.json({
        ok: true,
        method: 'windows-gdi-spooler',
        printerName: printerName || 'Predeterminada de Windows',
        format,
        widthMm: effectiveWidthMm,
      });
    }

    // Si se envió PDF o si el sistema requiere impresión por PDF:
    if (pdfBase64) {
      const cleanPdf = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
      fs.writeFileSync(tmpPdfPath, Buffer.from(cleanPdf, 'base64'));
      await imprimirPdfEnColaWindows(tmpPdfPath, printerName);
      setTimeout(() => {
        fs.unlink(tmpPdfPath, () => {});
      }, 15000);
      return res.json({
        ok: true,
        method: 'windows-pdf-spooler',
        printerName: printerName || 'Predeterminada de Windows',
        format,
        widthMm: effectiveWidthMm,
      });
    }

    return res.status(400).json({
      ok: false,
      error: 'No se pudo procesar el formato de impresión en este sistema operativo.',
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || 'Fallo al enviar trabajo a la cola de impresión.',
    });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`================================================================`);
  console.log(`🖨️  SERVIDOR PUENTE DE IMPRESIÓN ACTIVO EN PUERTO ${PORT}`);
  console.log(`   - GET  http://localhost:${PORT}/impresoras`);
  console.log(`   - POST http://localhost:${PORT}/imprimir`);
  console.log(`================================================================`);
});
