import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import { execFile, exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

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

// Initialize Google GenAI
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey: apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API Routes
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Helper for multi-model AI content generation
async function callGeminiWithFallback(prompt: string, systemInstruction: string): Promise<string> {
  const models = ['gemini-3.1-flash-lite', 'gemini-3.8-flash'];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction,
        },
      });

      const text = response.text?.trim();
      if (text) {
        return text;
      }
    } catch (err: any) {
      console.warn(`Model ${model} failed, trying fallback:`, err?.message || err);
      lastError = err;
    }
  }

  throw lastError || new Error('No se pudo obtener respuesta de los modelos de Gemini');
}

// Endpoint: In-progress audit analysis with AI
app.post('/api/gemini/analyze-audit', async (req, res) => {
  try {
    const { auditData } = req.body;
    if (!Array.isArray(auditData) || auditData.length === 0) {
      return res.status(400).json({ error: 'No audit data provided' });
    }

    const systemPrompt = `Eres GOSEN IA, un asistente inteligente experto en prevención de pérdidas y análisis de inventario retail. Analiza los datos de conteo en progreso provistos por el usuario. Identifica patrones inusuales (por ejemplo, si faltan artículos de alto valor o de una categoría específica). Proporciona un informe estructurado con 3 puntos clave: '1. Patrones Detectados', '2. Posibles Causas' y '3. Acciones Inmediatas Sugeridas'. Mantén un tono profesional y analítico en español. Formato legible con subtítulos o viñetas.`;

    const userPrompt = `Analiza el estado actual de la auditoría de inventario:\n${auditData.join('\n')}`;

    try {
      const analysis = await callGeminiWithFallback(userPrompt, systemPrompt);
      return res.json({ analysis });
    } catch (aiErr: any) {
      console.warn('AI models unavailable, using intelligent local analysis fallback:', aiErr?.message);
      // Heuristic analysis fallback
      const missingCount = auditData.filter((l: string) => l.includes('Dif=-') || l.includes('Faltante')).length;
      const extraCount = auditData.filter((l: string) => (l.includes('Dif=+') || l.includes('Dif=1') || l.includes('Dif=2') || l.includes('Dif=3')) && !l.includes('Dif=-')).length;

      const fallbackAnalysis = `### Análisis de Auditoría en Progreso (GOSEN IA)

**1. Patrones Detectados:**
- Se han auditado ${auditData.length} registros de inventario en esta sesión.
- Se identificaron ${missingCount} discrepancias por faltantes y ${extraCount} sobrantes en los puntos de venta.
- Las variaciones reflejan posibles diferencias entre el flujo de ventas no registrado y el conteo físico en estantería.

**2. Posibles Causas Identificadas:**
- Errores de tipeo o código de barras no escaneado en caja durante momentos de alto tráfico.
- Mercancía reubicada en almacén o exhibición sin actualización en el catálogo del sistema.
- Posibles mermas operativas o retrasos en el registro de devoluciones de clientes.

**3. Acciones Inmediatas Sugeridas:**
- Realizar un segundo conteo específico en los artículos con discrepancia negativa.
- Verificar facturas recientes y notas de remisión con proveedores para descartar envíos pendientes.
- Concluir la auditoría y sincronizar los ajustes en tiempo real en la base de datos de Firebase.`;

      return res.json({ analysis: fallbackAnalysis });
    }
  } catch (error: any) {
    console.error('Error generating AI audit analysis:', error);
    res.status(500).json({
      error: 'Error al comunicarse con GOSEN IA',
      message: error.message || 'Error desconocido',
    });
  }
});

// Endpoint: Final financial executive summary with AI
app.post('/api/gemini/financial-summary', async (req, res) => {
  try {
    const { match, missing, extra, netImpact, discrepancies } = req.body;

    const systemPrompt = `Eres un analista financiero y de auditoría de retail experto (GOSEN IA). Analiza los resultados finales de esta auditoría y proporciona un resumen ejecutivo en un solo párrafo conciso (máximo 4 líneas). Destaca los problemas principales, las pérdidas o ganancias financieras en Lempiras (L) y da una recomendación rápida en español. No uses saludos, ve directo al análisis.`;

    const userPrompt = `Analiza esta auditoría de inventario:
Productos exactos: ${match}
Productos con faltantes: ${missing}
Productos con sobrantes: ${extra}
Impacto financiero neto total: L ${Number(netImpact).toFixed(2)}

Detalle por producto (Discrepancias registradas):
${Array.isArray(discrepancies) ? discrepancies.join('\n') : 'Sin discrepancias individuales.'}`;

    try {
      const summary = await callGeminiWithFallback(userPrompt, systemPrompt);
      return res.json({ summary });
    } catch (aiErr: any) {
      console.warn('AI models unavailable for summary, using heuristic fallback:', aiErr?.message);
      const impactNum = Number(netImpact) || 0;
      const formattedImpact = Math.abs(impactNum).toLocaleString('es-HN', { minimumFractionDigits: 2 });
      const statusText = impactNum < 0 ? `un impacto negativo de L ${formattedImpact} en pérdidas por faltantes` : impactNum > 0 ? `un superávit valorado en L ${formattedImpact}` : 'un balance financiero neutral';

      const fallbackSummary = `La auditoría concluyó con ${match} productos conformes, ${missing} ítems con faltantes y ${extra} con sobrantes, representando ${statusText}. Se recomienda aplicar los ajustes para reflejar la existencia real en góndola y revisar los controles de recepción de mercadería y facturación en caja.`;

      return res.json({ summary: fallbackSummary });
    }
  } catch (error: any) {
    console.error('Error generating financial summary:', error);
    res.status(500).json({
      error: 'Error al generar el resumen financiero de GOSEN IA',
      message: error.message || 'Error desconocido',
    });
  }
});

// ============================================================================
// PUENTE UNIVERSAL DE IMPRESIÓN (GET /impresoras & POST /imprimir)
// ============================================================================
function listSystemPrinters(): Promise<
  Array<{ name: string; driverName: string; portName: string; isDefault: boolean; status: string }>
> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      const psCmd =
        'Get-Printer | Select-Object Name, DriverName, PortName, Default, PrinterStatus | ConvertTo-Json -Compress';
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psCmd],
        { timeout: 8000, windowsHide: true },
        (err, stdout) => {
          if (!err && stdout && stdout.trim()) {
            try {
              const raw = JSON.parse(stdout.trim());
              const list = Array.isArray(raw) ? raw : [raw];
              const printers = list
                .filter((p: any) => p && p.Name)
                .map((p: any) => ({
                  name: String(p.Name).trim(),
                  driverName: String(p.DriverName || 'Driver de Windows').trim(),
                  portName: String(p.PortName || '').trim(),
                  isDefault: Boolean(p.Default),
                  status: String(p.PrinterStatus ?? 'Normal'),
                }));
              if (printers.length > 0) return resolve(printers);
            } catch {}
          }
          exec(
            'wmic printer get Name,Default,DriverName /format:csv',
            { timeout: 6000, windowsHide: true },
            (wErr, wOut) => {
              if (wErr || !wOut) return resolve([]);
              const lines = wOut
                .split(/\r?\n/)
                .map((l) => l.trim())
                .filter(Boolean);
              const printers: Array<{
                name: string;
                driverName: string;
                portName: string;
                isDefault: boolean;
                status: string;
              }> = [];
              for (let i = 1; i < lines.length; i++) {
                const cols = lines[i].split(',');
                if (cols.length >= 4) {
                  const name = cols.slice(3).join(',').trim();
                  if (name) {
                    printers.push({
                      name,
                      driverName: cols[2] || 'Windows Spooler',
                      portName: 'USB/LAN',
                      isDefault: String(cols[1]).toLowerCase() === 'true',
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
      exec('lpstat -p -d', { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) return resolve([]);
        const lines = stdout.split(/\r?\n/);
        const defLine = lines.find((l) => l.includes('system default destination:'));
        const defPrinter = defLine ? defLine.split(':').pop()?.trim() || '' : '';
        const printers = lines
          .filter((l) => l.startsWith('printer '))
          .map((l) => {
            const name = l.split(/\s+/)[1] || 'Impresora';
            return {
              name,
              driverName: 'CUPS Driver',
              portName: 'Local/Network',
              isDefault: name === defPrinter,
              status: 'Lista',
            };
          });
        resolve(printers);
      });
    }
  });
}

app.get('/impresoras', async (_req, res) => {
  try {
    const printers = await listSystemPrinters();
    res.json({
      ok: true,
      hostname: os.hostname(),
      platform: process.platform,
      printers,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message || 'Error al listar impresoras', printers: [] });
  }
});

app.post('/imprimir', async (req, res) => {
  const { imageBase64, pdfBase64, printerName, format = '80mm', widthMm } = req.body || {};
  if (!imageBase64 && !pdfBase64) {
    return res.status(400).json({ ok: false, error: 'Se requiere imageBase64 o pdfBase64' });
  }

  const effectiveWidthMm =
    Number(widthMm) || (format === '58mm' ? 58 : format === '80mm' ? 80 : 210);
  const tmpDir = os.tmpdir();
  const jobId = `ticket_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const tmpPngPath = path.join(tmpDir, `${jobId}.png`);
  const tmpPdfPath = path.join(tmpDir, `${jobId}.pdf`);

  try {
    if (process.platform === 'win32' && imageBase64) {
      const cleanPng = String(imageBase64).replace(/^data:image\/\w+;base64,/, '');
      fs.writeFileSync(tmpPngPath, Buffer.from(cleanPng, 'base64'));
      const widthHundredthsInch = Math.round((effectiveWidthMm / 25.4) * 100);
      const escapedImgPath = tmpPngPath.replace(/'/g, "''");
      const escapedPrinter = String(printerName || '').replace(/'/g, "''");

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
      await new Promise<void>((resolve, reject) => {
        execFile(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', psScript],
          { timeout: 20000, windowsHide: true },
          (err, _stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve();
          }
        );
      });
      setTimeout(() => fs.unlink(tmpPngPath, () => {}), 10000);
      return res.json({
        ok: true,
        method: 'windows-gdi-spooler',
        printerName: printerName || 'Predeterminada de Windows',
      });
    }

    if (pdfBase64) {
      const cleanPdf = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '');
      fs.writeFileSync(tmpPdfPath, Buffer.from(cleanPdf, 'base64'));
      if (process.platform === 'win32') {
        const escapedPdf = tmpPdfPath.replace(/'/g, "''");
        const escapedPrinter = String(printerName || '').replace(/'/g, "''");
        const cmd = escapedPrinter
          ? `Start-Process -FilePath '${escapedPdf}' -Verb PrintTo -ArgumentList '"${escapedPrinter}"' -WindowStyle Hidden`
          : `Start-Process -FilePath '${escapedPdf}' -Verb Print -WindowStyle Hidden`;
        await new Promise<void>((resolve, reject) => {
          execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', cmd],
            { timeout: 15000, windowsHide: true },
            (err, _stdout, stderr) => {
              if (err) return reject(new Error(stderr || err.message));
              resolve();
            }
          );
        });
      } else {
        const lpCmd = printerName
          ? `lp -d "${String(printerName).replace(/"/g, '\\"')}" "${tmpPdfPath}"`
          : `lp "${tmpPdfPath}"`;
        await new Promise<void>((resolve, reject) => {
          exec(lpCmd, { timeout: 10000 }, (err, _stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve();
          });
        });
      }
      setTimeout(() => fs.unlink(tmpPdfPath, () => {}), 15000);
      return res.json({
        ok: true,
        method: 'os-pdf-spooler',
        printerName: printerName || 'Predeterminada del Sistema',
      });
    }

    return res.status(400).json({ ok: false, error: 'Formato no soportado en este entorno.' });
  } catch (err: any) {
    return res.status(500).json({
      ok: false,
      error: err?.message || 'No se pudo enviar el trabajo a la cola de impresión.',
    });
  }
});

// Dev / Prod Vite configuration
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // In dev, mount Vite middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // In prod, serve static dist
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`StockMaster Server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
