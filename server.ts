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

// Endpoint: In-progress audit analysis with AI
app.post('/api/gemini/analyze-audit', async (req, res) => {
  try {
    const { auditData } = req.body;
    if (!Array.isArray(auditData) || auditData.length === 0) {
      return res.status(400).json({ error: 'No audit data provided' });
    }

    const systemPrompt = `Eres StockMaster AI, un asistente experto en prevención de pérdidas y análisis de inventario retail. Analiza los datos de conteo en progreso provistos por el usuario. Identifica patrones inusuales (por ejemplo, si faltan artículos de alto valor o de una categoría específica). Proporciona un informe estructurado con 3 puntos clave: 'Patrones Detectados', 'Posibles Causas' y 'Acciones Inmediatas Sugeridas'. Mantén un tono profesional y analítico en español. Formato legible con subtítulos o viñetas.`;

    const userPrompt = `Analiza el estado actual de la auditoría:\n${auditData.join('\n')}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    res.json({ analysis: response.text || 'No se pudo generar el análisis.' });
  } catch (error: any) {
    console.error('Error generating AI audit analysis:', error);
    res.status(500).json({
      error: 'Error al comunicarse con Gemini AI',
      message: error.message || 'Error desconocido',
    });
  }
});

// Endpoint: Final financial executive summary with AI
app.post('/api/gemini/financial-summary', async (req, res) => {
  try {
    const { match, missing, extra, netImpact, discrepancies } = req.body;

    const systemPrompt = `Eres un analista financiero y de auditoría de retail experto (StockMaster AI). Analiza los resultados finales de esta auditoría y proporciona un resumen ejecutivo en un solo párrafo conciso (máximo 4 líneas). Destaca los problemas principales, las pérdidas o ganancias financieras en Lempiras (L) y da una recomendación rápida en español. No uses saludos, ve directo al análisis.`;

    const userPrompt = `Analiza esta auditoría de inventario:
Productos exactos: ${match}
Productos con faltantes: ${missing}
Productos con sobrantes: ${extra}
Impacto financiero neto total: L ${Number(netImpact).toFixed(2)}

Detalle por producto (Discrepancias registradas):
${Array.isArray(discrepancies) ? discrepancies.join('\n') : 'Sin discrepancias individuales.'}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
      },
    });

    res.json({ summary: response.text || 'Sin análisis disponible.' });
  } catch (error: any) {
    console.error('Error generating financial summary:', error);
    res.status(500).json({
      error: 'Error al generar el resumen financiero de IA',
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
