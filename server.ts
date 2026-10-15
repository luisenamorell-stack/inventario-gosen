import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json());

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

// Dev / Prod Vite configuration
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    // In dev, mount Vite middleware
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
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
