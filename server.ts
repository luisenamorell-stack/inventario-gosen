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

app.use(express.json({ limit: '80mb' }));

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

// ============================================================================
// MOTOR DE SINCRONIZACIÓN MULTIDISPOSITIVO EN TIEMPO REAL (/api/cloud-sync/*)
// Garantiza sincronización instantánea entre PC, Tablet y Móvil incluso cuando
// la cuota diaria gratuita de lecturas de Firestore (50k/día) se agota.
// ============================================================================

const DATA_DIR = path.resolve(__dirname, '.data');
const SYNC_DB_FILE = path.join(DATA_DIR, 'cloud_sync_db.json');

interface ServerTenantStore {
  companyId: string;
  inventory: Record<string, any>;
  explicitDeletedCodes: string[];
  deletedCodes: string[];
  deletedIds: string[];
  suppliers: Record<string, any>;
  purchases: Record<string, any>;
  sales: Record<string, any>;
  users: Record<string, any>;
  warehouses: any | null;
  settings: any | null;
  posFinance: any | null;
  updatedAt: number;
}

interface ServerSyncDatabase {
  tenants: Record<string, ServerTenantStore>;
  companies: Record<string, any>;
  updatedAt: number;
}

const AUTO_GENERATED_SKU_SERVER_REGEX = /^[A-ZÑÁÉÍÓÚ0-9\s]{1,4}-\d{1,4}-\d{3}$/i;

function isServerGyGAlias(raw?: string | null): boolean {
  if (!raw) return false;
  const c = String(raw)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  if (!c || c === 'gosen' || c === 'tiendagosen' || c === 'gosentienda') return false;
  return (
    c === 'tiendagyg' ||
    c === 'comercialgyg' ||
    c === 'gyg' ||
    c === 'comercial' ||
    c === 'comercialgyghn' ||
    c === 'tiendacomercialgyg' ||
    c === 'gygcomercial' ||
    c.includes('tiendagyg') ||
    c.includes('comercialgyg') ||
    (c.includes('gyg') && (c.includes('comercial') || c.includes('tienda')))
  );
}

function normalizeServerCompanySlug(raw?: string | null): string {
  if (!raw) return 'gosen';
  if (isServerGyGAlias(raw)) return 'tiendagyg';
  const trimmed = String(raw)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const slugified = trimmed.replace(/\s+/g, '-').replace(/[^a-z0-9_-]/g, '');
  if (!slugified || slugified === 'tiendagosen' || slugified === 'tienda-gosen' || slugified === 'tienda_gosen') {
    return 'gosen';
  }
  return slugified;
}

function normalizeNameForServerDedup(name?: string): string {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function scoreServerProduct(item: any): number {
  const rawCode = String(item?.code || '').trim();
  let score = 0;
  if (!AUTO_GENERATED_SKU_SERVER_REGEX.test(rawCode)) score += 600;
  if (item?.img && String(item.img).trim().length > 5) score += 500;
  if (/^\d{1,6}$/.test(rawCode)) score += 150;
  if ((Number(item?.price) || 0) > 0) score += 40;
  if ((Number(item?.cost) || 0) > 0) score += 20;
  if ((Number(item?.stock) || 0) > 0) score += 10;
  return score;
}

const syncDbMemory: ServerSyncDatabase = (() => {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SYNC_DB_FILE)) {
      const raw = fs.readFileSync(SYNC_DB_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.tenants) {
        return parsed as ServerSyncDatabase;
      }
    }
  } catch (err) {
    console.warn('Could not load initial sync_db.json, starting fresh:', err);
  }
  return { tenants: {}, companies: {}, updatedAt: Date.now() };
})();

let saveSyncDbTimer: NodeJS.Timeout | null = null;
function schedulePersistSyncDb(): void {
  if (saveSyncDbTimer) return;
  saveSyncDbTimer = setTimeout(() => {
    saveSyncDbTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(SYNC_DB_FILE, JSON.stringify(syncDbMemory), 'utf-8');
    } catch (err) {
      console.warn('Could not persist cloud_sync_db.json:', err);
    }
  }, 250);
}

function getTenantStore(companyId?: string): ServerTenantStore {
  const slug = normalizeServerCompanySlug(companyId);
  if (!syncDbMemory.tenants[slug]) {
    syncDbMemory.tenants[slug] = {
      companyId: slug,
      inventory: {},
      explicitDeletedCodes: [],
      deletedCodes: [],
      deletedIds: [],
      suppliers: {},
      purchases: {},
      sales: {},
      users: {},
      warehouses: null,
      settings: null,
      posFinance: null,
      updatedAt: 0,
    };
  }
  return syncDbMemory.tenants[slug];
}

function cleanAndDeduplicateTenantInventory(tenant: ServerTenantStore): any[] {
  const isGyG = isServerGyGAlias(tenant.companyId);
  const explicitSet = new Set(
    (tenant.explicitDeletedCodes || []).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );

  // Heal false-positive tombstones in Comercial GYG
  if (isGyG) {
    tenant.deletedCodes = (tenant.deletedCodes || []).filter((c) => {
      const clean = String(c || '').trim().toLowerCase();
      return clean && (explicitSet.has(clean) || AUTO_GENERATED_SKU_SERVER_REGEX.test(clean));
    });
  }

  const deletedSet = new Set(
    (tenant.deletedCodes || []).map((c) => String(c || '').trim().toLowerCase()).filter(Boolean)
  );

  for (const key of Object.keys(tenant.inventory)) {
    if (explicitSet.has(key) || deletedSet.has(key)) {
      delete tenant.inventory[key];
    }
  }

  if (isGyG) {
    const byNormName = new Map<string, any[]>();
    for (const item of Object.values(tenant.inventory)) {
      const normName = normalizeNameForServerDedup(item?.name);
      if (!normName) continue;
      const list = byNormName.get(normName) || [];
      list.push(item);
      byNormName.set(normName, list);
    }

    for (const [, group] of byNormName.entries()) {
      if (group.length <= 1) continue;
      group.sort((a, b) => scoreServerProduct(b) - scoreServerProduct(a));
      const winner = group[0];
      const winnerCode = String(winner?.code || '').trim();
      const winnerKey = winnerCode.toLowerCase();
      const winnerHasCustomSku = !AUTO_GENERATED_SKU_SERVER_REGEX.test(winnerCode);

      for (let i = 1; i < group.length; i++) {
        const cand = group[i];
        const candCode = String(cand?.code || '').trim();
        const candKey = candCode.toLowerCase();
        if (AUTO_GENERATED_SKU_SERVER_REGEX.test(candCode) && winnerHasCustomSku) {
          if (!winner.img && cand.img) {
            winner.img = cand.img;
            tenant.inventory[winnerKey] = winner;
          }
          delete tenant.inventory[candKey];
          if (!deletedSet.has(candKey)) {
            deletedSet.add(candKey);
            tenant.deletedCodes.push(candKey);
          }
        }
      }
    }
  }

  const list = Object.values(tenant.inventory);
  list.sort(
    (a, b) =>
      String(a?.name || '').localeCompare(String(b?.name || '')) ||
      String(a?.code || '').localeCompare(String(b?.code || ''))
  );
  return list;
}

// 1. Lightweight status check for real-time cross-device polling
app.get('/api/cloud-sync/status', (req, res) => {
  const slug = normalizeServerCompanySlug(String(req.query.companyId || 'gosen'));
  const tenant = getTenantStore(slug);
  res.json({
    ok: true,
    companyId: slug,
    updatedAt: tenant.updatedAt || 0,
    inventoryCount: Object.keys(tenant.inventory).length,
    purchasesCount: Object.keys(tenant.purchases).length,
    salesCount: Object.keys(tenant.sales).length,
    suppliersCount: Object.keys(tenant.suppliers).length,
  });
});

// 2. Bidirectional Inventory Sync (merges client items + upserts + tombstones with server)
app.post('/api/cloud-sync/inventory', (req, res) => {
  try {
    const {
      companyId,
      items = [],
      upserts = {},
      unsyncedCodes = [],
      explicitDeletedCodes = [],
      deletedCodes = [],
      deletedIds = [],
    } = req.body || {};

    const slug = normalizeServerCompanySlug(companyId);
    const tenant = getTenantStore(slug);
    const isGyG = isServerGyGAlias(slug);
    let changed = false;

    const explicitSet = new Set(tenant.explicitDeletedCodes.map((c) => c.toLowerCase()));
    if (Array.isArray(explicitDeletedCodes)) {
      for (const raw of explicitDeletedCodes) {
        const clean = String(raw || '').trim().toLowerCase();
        if (clean && !explicitSet.has(clean)) {
          explicitSet.add(clean);
          tenant.explicitDeletedCodes.push(clean);
          changed = true;
        }
      }
    }

    const delCodeSet = new Set(tenant.deletedCodes.map((c) => c.toLowerCase()));
    if (Array.isArray(deletedCodes)) {
      for (const raw of deletedCodes) {
        const clean = String(raw || '').trim().toLowerCase();
        if (!clean) continue;
        if (isGyG && !explicitSet.has(clean) && !AUTO_GENERATED_SKU_SERVER_REGEX.test(clean)) {
          continue;
        }
        if (!delCodeSet.has(clean)) {
          delCodeSet.add(clean);
          tenant.deletedCodes.push(clean);
          changed = true;
        }
      }
    }

    const delIdSet = new Set(tenant.deletedIds);
    if (Array.isArray(deletedIds)) {
      for (const raw of deletedIds) {
        const clean = String(raw || '').trim();
        if (clean && !delIdSet.has(clean)) {
          delIdSet.add(clean);
          tenant.deletedIds.push(clean);
        }
      }
    }

    const unsyncedSet = new Set(
      (Array.isArray(unsyncedCodes) ? unsyncedCodes : [])
        .map((c) => String(c || '').trim().toLowerCase())
        .filter(Boolean)
    );

    const mergeIncomingItem = (rawItem: any, isUpsert: boolean) => {
      if (!rawItem || typeof rawItem !== 'object') return;
      const code = String(rawItem.code || '').trim();
      const name = String(rawItem.name || '').trim();
      if (!code || !name) return;
      const codeKey = code.toLowerCase();

      // If this item is actively in the client's upserts/unsyncedCodes, un-tombstone it if it was not an auto-SKU
      if (isUpsert && unsyncedSet.has(codeKey)) {
        if (explicitSet.has(codeKey)) {
          explicitSet.delete(codeKey);
          tenant.explicitDeletedCodes = tenant.explicitDeletedCodes.filter((c) => c !== codeKey);
        }
        if (delCodeSet.has(codeKey)) {
          delCodeSet.delete(codeKey);
          tenant.deletedCodes = tenant.deletedCodes.filter((c) => c !== codeKey);
        }
      }

      if (explicitSet.has(codeKey) || delCodeSet.has(codeKey)) {
        return;
      }

      const existing = tenant.inventory[codeKey];
      const incomingTs = Number(rawItem.updatedAt) || 0;
      const existingTs = Number(existing?.updatedAt) || 0;

      if (!existing) {
        tenant.inventory[codeKey] = {
          ...rawItem,
          id: rawItem.id || `${slug === 'gosen' ? '' : `${slug}__`}${code.replace(/\//g, '_')}`,
          companyId: slug,
          code,
          name,
          category: String(rawItem.category || 'Otros').trim(),
          supplier: String(rawItem.supplier || '').trim(),
          size: String(rawItem.size || '').trim(),
          cost: Number(rawItem.cost) || 0,
          price: Number(rawItem.price) || 0,
          stock: Number(rawItem.stock) || 0,
          img: rawItem.img || '',
          updatedAt: incomingTs || Date.now(),
        };
        changed = true;
      } else {
        const shouldPreferIncoming =
          unsyncedSet.has(codeKey) ||
          (isUpsert && incomingTs >= existingTs) ||
          incomingTs > existingTs ||
          (incomingTs === existingTs &&
            existingTs === 0 &&
            (Number(rawItem.stock) !== Number(existing.stock) ||
              Number(rawItem.price) !== Number(existing.price) ||
              String(rawItem.name).trim() !== String(existing.name).trim() ||
              (!existing.img && Boolean(rawItem.img))));

        const winner = shouldPreferIncoming ? rawItem : existing;
        const bestImg = rawItem.img || existing.img || '';
        const bestWarehouseStocks =
          (shouldPreferIncoming ? rawItem.warehouseStocks : existing.warehouseStocks) ||
          rawItem.warehouseStocks ||
          existing.warehouseStocks ||
          undefined;

        const mergedItem = {
          ...existing,
          ...winner,
          id: winner.id || existing.id,
          companyId: slug,
          code: String(winner.code || code).trim(),
          name: String(winner.name || name).trim(),
          category: String(winner.category || existing.category || 'Otros').trim(),
          supplier: String(winner.supplier ?? existing.supplier ?? '').trim(),
          size: String(winner.size ?? existing.size ?? '').trim(),
          cost: Number(winner.cost ?? existing.cost) || 0,
          price: Number(winner.price ?? existing.price) || 0,
          stock: Number(winner.stock ?? existing.stock) || 0,
          ...(bestWarehouseStocks ? { warehouseStocks: bestWarehouseStocks } : {}),
          img: bestImg,
          updatedAt: Math.max(incomingTs, existingTs, 1),
        };

        if (
          mergedItem.name !== existing.name ||
          mergedItem.price !== existing.price ||
          mergedItem.cost !== existing.cost ||
          mergedItem.stock !== existing.stock ||
          mergedItem.img !== existing.img ||
          JSON.stringify(mergedItem.warehouseStocks || {}) !==
            JSON.stringify(existing.warehouseStocks || {})
        ) {
          changed = true;
        }
        tenant.inventory[codeKey] = mergedItem;
      }
    };

    if (Array.isArray(items)) {
      for (const it of items) {
        mergeIncomingItem(it, false);
      }
    }
    if (upserts && typeof upserts === 'object') {
      for (const upItem of Object.values(upserts)) {
        mergeIncomingItem(upItem, true);
      }
    }

    const mergedList = cleanAndDeduplicateTenantInventory(tenant);
    if (changed || tenant.updatedAt === 0) {
      tenant.updatedAt = Date.now();
      syncDbMemory.updatedAt = tenant.updatedAt;
      schedulePersistSyncDb();
    }

    return res.json({
      ok: true,
      companyId: slug,
      items: mergedList,
      explicitDeletedCodes: tenant.explicitDeletedCodes,
      deletedCodes: tenant.deletedCodes,
      deletedIds: tenant.deletedIds,
      updatedAt: tenant.updatedAt,
    });
  } catch (err: any) {
    console.error('Error in /api/cloud-sync/inventory:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Sync error' });
  }
});

// 3. Direct Single/Bulk Product Save on Server
app.post('/api/cloud-sync/product-save', (req, res) => {
  try {
    const { companyId, product, products, oldCode } = req.body || {};
    const slug = normalizeServerCompanySlug(companyId);
    const tenant = getTenantStore(slug);
    const now = Date.now();

    if (oldCode) {
      const cleanOld = String(oldCode).trim().toLowerCase();
      const cleanNew = String(product?.code || '').trim().toLowerCase();
      if (cleanOld && cleanOld !== cleanNew) {
        delete tenant.inventory[cleanOld];
        if (!tenant.explicitDeletedCodes.includes(cleanOld)) {
          tenant.explicitDeletedCodes.push(cleanOld);
        }
        if (!tenant.deletedCodes.includes(cleanOld)) {
          tenant.deletedCodes.push(cleanOld);
        }
      }
    }

    const listToSave = Array.isArray(products) ? products : product ? [product] : [];
    for (const p of listToSave) {
      if (!p || !p.code) continue;
      const cleanCode = String(p.code).trim();
      const codeKey = cleanCode.toLowerCase();
      tenant.explicitDeletedCodes = tenant.explicitDeletedCodes.filter((c) => c !== codeKey);
      tenant.deletedCodes = tenant.deletedCodes.filter((c) => c !== codeKey);
      const prev = tenant.inventory[codeKey];
      tenant.inventory[codeKey] = {
        ...(prev || {}),
        ...p,
        companyId: slug,
        code: cleanCode,
        name: String(p.name || prev?.name || '').trim(),
        img: p.img || prev?.img || '',
        updatedAt: now,
      };
    }

    const mergedList = cleanAndDeduplicateTenantInventory(tenant);
    tenant.updatedAt = now;
    syncDbMemory.updatedAt = now;
    schedulePersistSyncDb();

    return res.json({ ok: true, count: mergedList.length, updatedAt: now });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Product save error' });
  }
});

// 4. Direct Product Delete on Server
app.post('/api/cloud-sync/product-delete', (req, res) => {
  try {
    const { companyId, id, code } = req.body || {};
    const slug = normalizeServerCompanySlug(companyId);
    const tenant = getTenantStore(slug);
    const rawCode =
      code ||
      (typeof id === 'string' && id.includes('__') ? id.split('__').slice(1).join('__') : id) ||
      '';
    const cleanCode = String(rawCode).trim().toLowerCase();

    if (cleanCode) {
      delete tenant.inventory[cleanCode];
      if (!tenant.explicitDeletedCodes.includes(cleanCode)) {
        tenant.explicitDeletedCodes.push(cleanCode);
      }
      if (!tenant.deletedCodes.includes(cleanCode)) {
        tenant.deletedCodes.push(cleanCode);
      }
    }
    if (id && !tenant.deletedIds.includes(String(id).trim())) {
      tenant.deletedIds.push(String(id).trim());
    }

    tenant.updatedAt = Date.now();
    syncDbMemory.updatedAt = tenant.updatedAt;
    schedulePersistSyncDb();

    return res.json({ ok: true, updatedAt: tenant.updatedAt });
  } catch (err: any) {
    return res.status(500).json({ ok: false, error: err?.message || 'Product delete error' });
  }
});

// 5. Bidirectional Sync for Secondary Collections (purchases, suppliers, sales, warehouses, settings, users)
app.post('/api/cloud-sync/collections', (req, res) => {
  try {
    const {
      companyId,
      suppliers,
      purchases,
      sales,
      users,
      warehouses,
      settings,
      posFinance,
      companies,
      deleteSupplierId,
      deletePurchaseId,
      deleteSaleId,
      deleteUserId,
    } = req.body || {};

    const slug = normalizeServerCompanySlug(companyId);
    const tenant = getTenantStore(slug);
    let changed = false;

    if (deleteSupplierId) {
      delete tenant.suppliers[String(deleteSupplierId)];
      changed = true;
    }
    if (deletePurchaseId) {
      delete tenant.purchases[String(deletePurchaseId)];
      changed = true;
    }
    if (deleteSaleId) {
      delete tenant.sales[String(deleteSaleId)];
      changed = true;
    }
    if (deleteUserId) {
      delete tenant.users[String(deleteUserId)];
      changed = true;
    }

    const mergeRecordList = (
      targetMap: Record<string, any>,
      incomingList: any[] | undefined,
      idField = 'id'
    ) => {
      if (!Array.isArray(incomingList)) return;
      for (const item of incomingList) {
        if (!item || typeof item !== 'object') continue;
        const id = String(item[idField] || item.code || item.invoiceNumber || item.saleNumber || '').trim();
        if (!id) continue;
        const prev = targetMap[id];
        const incTs = Number(item.updatedAt || item.timestamp || 0);
        const prevTs = Number(prev?.updatedAt || prev?.timestamp || 0);
        if (!prev || incTs >= prevTs || item.status !== prev.status) {
          targetMap[id] = { ...(prev || {}), ...item, companyId: slug };
          changed = true;
        }
      }
    };

    mergeRecordList(tenant.suppliers, suppliers);
    mergeRecordList(tenant.purchases, purchases);
    mergeRecordList(tenant.sales, sales);
    mergeRecordList(tenant.users, users);

    if (warehouses && typeof warehouses === 'object') {
      const incTs = Number(warehouses.updatedAt || 0);
      const prevTs = Number(tenant.warehouses?.updatedAt || 0);
      if (
        !tenant.warehouses ||
        incTs >= prevTs ||
        (Array.isArray(warehouses.transfers) &&
          warehouses.transfers.length > (tenant.warehouses.transfers?.length || 0)) ||
        (Array.isArray(warehouses.warehouses) &&
          warehouses.warehouses.length !== (tenant.warehouses.warehouses?.length || 0))
      ) {
        tenant.warehouses = { ...warehouses, companyId: slug };
        changed = true;
      }
    }

    if (settings && typeof settings === 'object') {
      const incTs = Number(settings.updatedAt || 0);
      const prevTs = Number(tenant.settings?.updatedAt || 0);
      if (!tenant.settings || incTs >= prevTs) {
        tenant.settings = { ...settings, companyId: slug };
        changed = true;
      }
    }

    if (posFinance && typeof posFinance === 'object') {
      const incTs = Number(posFinance.updatedAt || 0);
      const prevTs = Number(tenant.posFinance?.updatedAt || 0);
      if (!tenant.posFinance || incTs >= prevTs) {
        tenant.posFinance = { ...posFinance, companyId: slug };
        changed = true;
      }
    }

    if (Array.isArray(companies)) {
      for (const comp of companies) {
        if (comp && comp.slug) {
          const cSlug = normalizeServerCompanySlug(comp.slug);
          syncDbMemory.companies[cSlug] = { ...(syncDbMemory.companies[cSlug] || {}), ...comp };
          changed = true;
        }
      }
    }

    if (changed) {
      tenant.updatedAt = Date.now();
      syncDbMemory.updatedAt = tenant.updatedAt;
      schedulePersistSyncDb();
    }

    return res.json({
      ok: true,
      companyId: slug,
      suppliers: Object.values(tenant.suppliers).sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''))
      ),
      purchases: Object.values(tenant.purchases).sort(
        (a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)
      ),
      sales: Object.values(tenant.sales).sort(
        (a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)
      ),
      users: Object.values(tenant.users).sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''))
      ),
      allUsers: Object.entries(syncDbMemory.tenants).flatMap(([tSlug, tData]) =>
        Object.values(tData.users || {}).map((u: any) => ({
          ...u,
          companyId: u.companyId || tSlug,
        }))
      ),
      warehouses: tenant.warehouses,
      settings: tenant.settings,
      posFinance: tenant.posFinance,
      companies: Object.values(syncDbMemory.companies),
      updatedAt: tenant.updatedAt,
    });
  } catch (err: any) {
    console.error('Error in /api/cloud-sync/collections:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Collections sync error' });
  }
});

// Dev / Prod Vite configuration
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  // Serve public/assets with aggressive caching in both dev and prod
  const publicAssetsPath = path.resolve(__dirname, 'public', 'assets');
  if (fs.existsSync(publicAssetsPath)) {
    app.use(
      '/assets',
      express.static(publicAssetsPath, {
        maxAge: '365d',
        immutable: true,
        setHeaders: (res) => {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      })
    );
  }

  // Bind port 3000 immediately so the platform health check never times out during cold start
  app.listen(port, '0.0.0.0', () => {
    console.log(`StockMaster Server listening on http://0.0.0.0:${port}`);
  });

  if (!isProd) {
    // In dev, mount Vite middleware asynchronously via readiness promise
    let viteMiddleware: any = null;
    const viteReady = (async () => {
      const { createServer } = await import('vite');
      const vite = await createServer({
        server: { middlewareMode: true, hmr: false, ws: false },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
    })();

    app.use(async (req, res, next) => {
      try {
        if (!viteMiddleware) {
          await viteReady;
        }
        return viteMiddleware(req, res, next);
      } catch (err) {
        return next(err);
      }
    });
  } else {
    // In prod, serve static dist with optimal cache policy
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(
        express.static(distPath, {
          maxAge: '365d',
          setHeaders: (res, filePath) => {
            if (filePath.endsWith('.html') || filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
              res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            } else if (
              /\.(js|css|webp|png|jpg|jpeg|svg|ico|woff2?|ttf)$/i.test(filePath)
            ) {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );
      app.get('*', (_req, res) => {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
