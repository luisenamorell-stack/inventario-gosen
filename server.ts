import express from 'express';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { execFile, exec } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.set('trust proxy', 1);
app.disable('x-powered-by');

const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function isSafeRecordKey(key: string): boolean {
  return Boolean(key) && !UNSAFE_OBJECT_KEYS.has(key);
}

function stripUnsafeKeys<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripUnsafeKeys(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (UNSAFE_OBJECT_KEYS.has(k)) continue;
      out[k] = stripUnsafeKeys(v);
    }
    return out as T;
  }
  return value;
}

const STATIC_ALLOWED_ORIGINS = new Set<string>([
  'https://miapphn.online',
  'https://www.miapphn.online',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  ...(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean),
]);

function isAllowedCorsOrigin(origin: string | undefined, hostHeader: string | undefined): boolean {
  if (!origin) return true;
  const cleanOrigin = origin.trim().replace(/\/+$/, '');
  if (STATIC_ALLOWED_ORIGINS.has(cleanOrigin)) return true;

  try {
    const parsed = new URL(cleanOrigin);
    if (hostHeader && parsed.host.toLowerCase() === hostHeader.toLowerCase()) {
      return true;
    }
    if (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'miapphn.online' ||
        parsed.hostname.endsWith('.miapphn.online') ||
        parsed.hostname.endsWith('.us-west2.run.app') ||
        parsed.hostname.endsWith('.run.app'))
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

// Security Headers + Optional Production HTTPS Redirect
app.use((req, res, next) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  const isHttps = req.secure || forwardedProto === 'https';
  const host = String(req.headers.host || '').toLowerCase();
  const isLocalHost = host.startsWith('localhost') || host.startsWith('127.0.0.1');

  if (process.env.NODE_ENV === 'production' && forwardedProto === 'http' && !isLocalHost && host) {
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

// Strict Origin-Validated CORS Middleware
app.use((req, res, next) => {
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : undefined;
  const hostHeader = typeof req.headers.host === 'string' ? req.headers.host : undefined;
  const originAllowed = isAllowedCorsOrigin(originHeader, hostHeader);

  if (originHeader && !originAllowed) {
    recordSecurityEvent({
      type: 'cors_blocked',
      severity: 'high',
      ip: getClientIp(req),
      path: req.path,
      detail: `Origen CORS bloqueado "${originHeader}" en ${req.method} ${req.path}`,
    });
    if (
      req.method === 'OPTIONS' ||
      req.path.startsWith('/api/') ||
      req.path === '/impresoras' ||
      req.path === '/imprimir'
    ) {
      return res.status(403).json({ ok: false, error: 'Origen no autorizado por CORS' });
    }
  }

  if (originHeader && originAllowed) {
    res.setHeader('Access-Control-Allow-Origin', originHeader);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    if (req.headers['access-control-request-private-network'] === 'true') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// ============================================================================
// PHASE 2 SECURITY CORE: scrypt Hashing, HMAC HttpOnly Sessions & Event Monitor
// ============================================================================
const DATA_DIR = path.resolve(__dirname, '.data');
const SYNC_DB_FILE = path.join(DATA_DIR, 'cloud_sync_db.json');
const SESSION_SECRET_FILE = path.join(DATA_DIR, '.session_secret');
const SAAS_AUTH_FILE = path.join(DATA_DIR, 'saas_auth.json');
const SECURITY_EVENTS_FILE = path.join(DATA_DIR, 'security_events.json');
const SESSION_COOKIE_NAME = 'miapphn_session';
const HASHED_PASSWORD_MASK = '__HASHED__';

function ensureDataDirSync(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getClientIp(req: express.Request): string {
  const xff = typeof req.headers['x-forwarded-for'] === 'string' ? req.headers['x-forwarded-for'].split(',')[0].trim() : '';
  return xff || String(req.ip || req.socket?.remoteAddress || 'unknown');
}

const SESSION_SECRET: string = (() => {
  const envSecret = (process.env.SESSION_SECRET || '').trim();
  if (envSecret.length >= 16) return envSecret;
  try {
    ensureDataDirSync();
    if (fs.existsSync(SESSION_SECRET_FILE)) {
      const saved = fs.readFileSync(SESSION_SECRET_FILE, 'utf-8').trim();
      if (saved.length >= 32) return saved;
    }
    const generated = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SESSION_SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
    return generated;
  } catch {
    return crypto.randomBytes(32).toString('hex');
  }
})();

function isHashedPassword(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!value.startsWith('scrypt$')) return false;
  const parts = value.split('$');
  return parts.length === 3 && parts[1].length >= 16 && parts[2].length >= 32;
}

function hashPassword(plain: string): string {
  const clean = String(plain || '').trim();
  if (!clean) return '';
  if (isHashedPassword(clean)) return clean;
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(clean, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

function timingSafeHexScryptMatch(candidate: string, saltHex: string, expectedHashHex: string): boolean {
  try {
    const derivedBuf = crypto.scryptSync(candidate, saltHex, 64);
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');
    if (derivedBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, expectedBuf);
  } catch {
    return false;
  }
}

function verifyPassword(
  candidateInput: string,
  storedSecret: unknown,
  options?: { allowUpperFallback?: boolean; allowLowerFallback?: boolean }
): boolean {
  const raw = String(candidateInput || '');
  // Clean zero-width spaces, non-breaking spaces, BOM and whitespace typical in mobile inputs
  const cleanCandidate = raw.replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '').trim();
  const stored = String(storedSecret || '').trim();
  if (!cleanCandidate || !stored || stored === HASHED_PASSWORD_MASK) return false;

  if (isHashedPassword(stored)) {
    const [, saltHex, hashHex] = stored.split('$');
    if (timingSafeHexScryptMatch(cleanCandidate, saltHex, hashHex)) return true;
    const upper = cleanCandidate.toUpperCase();
    if (upper !== cleanCandidate && timingSafeHexScryptMatch(upper, saltHex, hashHex)) return true;
    const lower = cleanCandidate.toLowerCase();
    if (lower !== cleanCandidate && timingSafeHexScryptMatch(lower, saltHex, hashHex)) return true;
    return false;
  }

  // Legacy plaintext compatibility with robust case-insensitive comparison
  const safeStrEqual = (a: string, b: string) => {
    try {
      const ba = Buffer.from(a, 'utf-8');
      const bb = Buffer.from(b, 'utf-8');
      if (ba.length !== bb.length) return false;
      return crypto.timingSafeEqual(ba, bb);
    } catch {
      return a === b;
    }
  };
  if (safeStrEqual(cleanCandidate, stored)) return true;
  if (safeStrEqual(cleanCandidate.toUpperCase(), stored.toUpperCase())) return true;
  if (safeStrEqual(cleanCandidate.toLowerCase(), stored.toLowerCase())) return true;
  return false;
}

interface SecurityEventRecord {
  id: string;
  timestamp: number;
  type:
    | 'failed_login'
    | 'login_lockout'
    | 'unauthorized_api'
    | 'cross_tenant_attempt'
    | 'privilege_escalation_attempt'
    | 'cors_blocked'
    | 'rate_limit_exceeded'
    | 'saas_master_changed'
    | 'login_success';
  severity: 'low' | 'medium' | 'high' | 'critical';
  ip: string;
  companyId?: string;
  username?: string;
  path?: string;
  detail: string;
}

const securityEventsMemory: SecurityEventRecord[] = (() => {
  try {
    ensureDataDirSync();
    if (fs.existsSync(SECURITY_EVENTS_FILE)) {
      const raw = fs.readFileSync(SECURITY_EVENTS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.slice(0, 500);
    }
  } catch {}
  return [];
})();

let saveSecurityEventsTimer: NodeJS.Timeout | null = null;
function schedulePersistSecurityEvents(): void {
  if (saveSecurityEventsTimer) return;
  saveSecurityEventsTimer = setTimeout(() => {
    saveSecurityEventsTimer = null;
    try {
      ensureDataDirSync();
      fs.writeFileSync(SECURITY_EVENTS_FILE, JSON.stringify(securityEventsMemory), 'utf-8');
    } catch {}
  }, 400);
}

function recordSecurityEvent(ev: Omit<SecurityEventRecord, 'id' | 'timestamp'>): void {
  const entry: SecurityEventRecord = {
    id: `sec_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`,
    timestamp: Date.now(),
    ...ev,
  };
  securityEventsMemory.unshift(entry);
  if (securityEventsMemory.length > 500) {
    securityEventsMemory.length = 500;
  }
  if (entry.severity === 'high' || entry.severity === 'critical') {
    console.warn(`[SECURITY-MONITOR][${entry.type}] ip=${entry.ip} cid=${entry.companyId || '-'} ${entry.detail}`);
  }
  schedulePersistSecurityEvents();
}

interface SessionPayload {
  uid: string;
  cid: string;
  sa: boolean;
  role: 'admin' | 'collaborator';
  uname: string;
  displayName: string;
  exp: number;
}

function signSessionToken(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySessionToken(token: string | undefined): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  if (!body || !sig) return null;
  try {
    const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(body).digest('base64url');
    const a = Buffer.from(sig, 'utf-8');
    const b = Buffer.from(expectedSig, 'utf-8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8')) as SessionPayload;
    if (!parsed || typeof parsed.exp !== 'number' || Date.now() > parsed.exp) return null;
    if (!parsed.uid || !parsed.cid || (parsed.role !== 'admin' && parsed.role !== 'collaborator')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseCookies(req: express.Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    const v = part.slice(eq + 1).trim();
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

function isRequestHttps(req: express.Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim().toLowerCase();
  return req.secure || forwardedProto === 'https';
}

function setSessionCookie(
  res: express.Response,
  req: express.Request,
  payload: SessionPayload,
  remember = true
): string {
  const token = signSessionToken(payload);
  const https = isRequestHttps(req);
  const isCrossSite = String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
  const maxAgeSec = remember ? 7 * 24 * 60 * 60 : 12 * 60 * 60;
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    https && isCrossSite ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (https) {
    parts.push('Secure');
    if (isCrossSite) parts.push('Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
  return token;
}

function clearSessionCookie(res: express.Response, req: express.Request): void {
  const https = isRequestHttps(req);
  const isCrossSite = String(req.headers['sec-fetch-site'] || '').toLowerCase() === 'cross-site';
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    https && isCrossSite ? 'SameSite=None' : 'SameSite=Lax',
  ];
  if (https) {
    parts.push('Secure');
    if (isCrossSite) parts.push('Partitioned');
  }
  res.setHeader('Set-Cookie', parts.join('; '));
}

function getAuthenticatedSession(req: express.Request): SessionPayload | null {
  const cookies = parseCookies(req);
  const cookieSess = verifySessionToken(cookies[SESSION_COOKIE_NAME]);
  if (cookieSess) return cookieSess;

  const authHeader = String(req.headers.authorization || '').trim();
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    return verifySessionToken(bearerToken);
  }
  return null;
}

function requireAuthSession(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const session = getAuthenticatedSession(req);
  if (!session) {
    recordSecurityEvent({
      type: 'unauthorized_api',
      severity: 'medium',
      ip: getClientIp(req),
      path: req.path,
      detail: `Acceso sin sesión válida a ${req.method} ${req.path}`,
    });
    return res.status(401).json({
      ok: false,
      error: 'Sesión requerida o expirada. Inicia sesión nuevamente.',
    });
  }
  (req as any).authSession = session;
  next();
}

// SaaS Master Key Store (.data/saas_auth.json)
let saasAuthState: { masterKeyHash: string; updatedAt: number } = (() => {
  try {
    ensureDataDirSync();
    if (fs.existsSync(SAAS_AUTH_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SAAS_AUTH_FILE, 'utf-8'));
      if (parsed && isHashedPassword(parsed.masterKeyHash)) {
        return parsed;
      }
    }
  } catch {}
  const initialKey = (process.env.SAAS_MASTER_KEY || 'SAASMASTER2026').trim();
  const initialState = { masterKeyHash: hashPassword(initialKey), updatedAt: Date.now() };
  try {
    ensureDataDirSync();
    fs.writeFileSync(SAAS_AUTH_FILE, JSON.stringify(initialState), { encoding: 'utf-8', mode: 0o600 });
  } catch {}
  return initialState;
})();

function verifySaasMasterKey(candidate: string): boolean {
  const envKey = (process.env.SAAS_MASTER_KEY || '').trim();
  if (envKey && verifyPassword(candidate, envKey, { allowUpperFallback: true })) {
    return true;
  }
  return verifyPassword(candidate, saasAuthState.masterKeyHash, { allowUpperFallback: true });
}

// Lightweight In-Memory Rate Limiter (protects APIs without blocking normal POS sync)
const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();

function createRateLimiter(bucketPrefix: string, maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);
    const key = `${bucketPrefix}:${ip}`;
    const now = Date.now();
    let entry = rateLimitBuckets.get(key);
    if (!entry || now >= entry.resetAt) {
      entry = { count: 1, resetAt: now + windowMs };
      rateLimitBuckets.set(key, entry);
      if (rateLimitBuckets.size > 5000) {
        for (const [k, v] of rateLimitBuckets.entries()) {
          if (now >= v.resetAt) rateLimitBuckets.delete(k);
        }
      }
      return next();
    }
    entry.count += 1;
    if (entry.count > maxRequests) {
      recordSecurityEvent({
        type: 'rate_limit_exceeded',
        severity: 'high',
        ip,
        path: req.path,
        detail: `Límite de peticiones excedido (${bucketPrefix}) en ${req.path}`,
      });
      return res.status(429).json({
        ok: false,
        error: 'Demasiadas solicitudes seguidas. Espera unos segundos e intenta de nuevo.',
      });
    }
    next();
  };
}

const standardApiLimiter = createRateLimiter('api', 90, 60_000);
const cloudSyncLimiter = createRateLimiter('sync', 360, 60_000);
const authLimiter = createRateLimiter('auth', 25, 60_000);

app.use('/api/gemini', standardApiLimiter, express.json({ limit: '2mb' }));
app.use('/api/maps', standardApiLimiter, express.json({ limit: '1mb' }));
app.use('/api/auth', authLimiter, express.json({ limit: '256kb' }));
app.use('/api/security', standardApiLimiter, express.json({ limit: '256kb' }));
app.use('/api/public', standardApiLimiter);
app.use('/imprimir', standardApiLimiter, express.json({ limit: '15mb' }));
app.use('/impresoras', standardApiLimiter);
app.use('/api/cloud-sync', cloudSyncLimiter, express.json({ limit: '60mb' }));

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

// Google Maps Platform Config (ONLY exposes dedicated public browser VITE_GOOGLE_MAPS_API_KEY, never backend server key)
app.get('/api/maps/config', (_req, res) => {
  const publicBrowserMapsKey = process.env.VITE_GOOGLE_MAPS_API_KEY || '';
  res.json({
    ok: true,
    hasMapsKey: Boolean(publicBrowserMapsKey),
    apiKey: publicBrowserMapsKey,
  });
});

app.get('/api/maps/reverse-geocode', async (req, res) => {
  const lat = parseFloat(String(req.query.lat || ''));
  const lng = parseFloat(String(req.query.lng || ''));
  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return res.status(400).json({ ok: false, error: 'Coordenadas lat/lng inválidas' });
  }

  const mapsApiKey =
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    '';

  if (mapsApiKey) {
    try {
      // 1. Try Geocoding v4 REST endpoint with required attribution header
      const v4Url = new URL('https://geocode.googleapis.com/v4/geocode/location');
      v4Url.searchParams.append('location.latitude', String(lat));
      v4Url.searchParams.append('location.longitude', String(lng));
      v4Url.searchParams.append('languageCode', 'es');

      const v4Resp = await fetch(v4Url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': mapsApiKey,
          'X-Goog-FieldMask':
            'results.placeId,results.formattedAddress,results.addressComponents,plusCode',
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
      });

      if (v4Resp.ok) {
        const v4Data: any = await v4Resp.json();
        const firstResult = Array.isArray(v4Data?.results) ? v4Data.results[0] : null;
        if (firstResult?.formattedAddress) {
          const plusCode =
            firstResult?.plusCode?.compoundCode ||
            v4Data?.plusCode?.compoundCode ||
            firstResult?.plusCode?.globalCode ||
            '';
          return res.json({
            ok: true,
            formattedAddress: String(firstResult.formattedAddress),
            placeId: firstResult.placeId || '',
            plusCode: String(plusCode || ''),
            source: 'google-geocoding-v4',
          });
        }
      }

      // 2. Standard Google Maps Geocoding REST API
      const stdUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${encodeURIComponent(
        `${lat},${lng}`
      )}&language=es&key=${encodeURIComponent(mapsApiKey)}`;
      const stdResp = await fetch(stdUrl, {
        headers: {
          'X-Goog-Maps-Solution-ID': 'gmp_mcp_codeassist_v1_aistudio',
        },
      });
      if (stdResp.ok) {
        const stdData: any = await stdResp.json();
        const firstStd = Array.isArray(stdData?.results) ? stdData.results[0] : null;
        if (firstStd?.formatted_address) {
          const plusCode =
            stdData?.plus_code?.compound_code || stdData?.plus_code?.global_code || '';
          return res.json({
            ok: true,
            formattedAddress: String(firstStd.formatted_address),
            placeId: firstStd.place_id || '',
            plusCode: String(plusCode || ''),
            source: 'google-geocoding-v3',
          });
        }
      }
    } catch (err: any) {
      console.warn('Google reverse geocoding warning:', err?.message || err);
    }
  }

  return res.json({
    ok: true,
    formattedAddress: `Ubicación GPS (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
    placeId: '',
    plusCode: '',
    source: 'coordinates',
  });
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
    const { auditData } = req.body || {};
    if (!Array.isArray(auditData) || auditData.length === 0) {
      return res.status(400).json({ error: 'No audit data provided' });
    }
    const safeAuditLines = auditData.slice(0, 1000).map((item) => String(item ?? '').slice(0, 400));

    const systemPrompt = `Eres GOSEN IA, un asistente inteligente experto en prevención de pérdidas y análisis de inventario retail. Analiza los datos de conteo en progreso provistos por el usuario. Identifica patrones inusuales (por ejemplo, si faltan artículos de alto valor o de una categoría específica). Proporciona un informe estructurado con 3 puntos clave: '1. Patrones Detectados', '2. Posibles Causas' y '3. Acciones Inmediatas Sugeridas'. Mantén un tono profesional y analítico en español. Formato legible con subtítulos o viñetas.`;

    const userPrompt = `Analiza el estado actual de la auditoría de inventario:\n${safeAuditLines.join('\n')}`;

    try {
      const analysis = await callGeminiWithFallback(userPrompt, systemPrompt);
      return res.json({ analysis });
    } catch (aiErr: any) {
      console.warn('AI models unavailable, using intelligent local analysis fallback:', aiErr?.message);
      // Heuristic analysis fallback
      const missingCount = safeAuditLines.filter((l: string) => l.includes('Dif=-') || l.includes('Faltante')).length;
      const extraCount = safeAuditLines.filter((l: string) => (l.includes('Dif=+') || l.includes('Dif=1') || l.includes('Dif=2') || l.includes('Dif=3')) && !l.includes('Dif=-')).length;

      const fallbackAnalysis = `### Análisis de Auditoría en Progreso (GOSEN IA)

**1. Patrones Detectados:**
- Se han auditado ${safeAuditLines.length} registros de inventario en esta sesión.
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
    const { match, missing, extra, netImpact, discrepancies } = req.body || {};
    const safeMatch = Math.max(0, Number(match) || 0);
    const safeMissing = Math.max(0, Number(missing) || 0);
    const safeExtra = Math.max(0, Number(extra) || 0);
    const safeNetImpact = Number.isFinite(Number(netImpact)) ? Number(netImpact) : 0;
    const safeDiscrepancies = Array.isArray(discrepancies)
      ? discrepancies.slice(0, 500).map((d) => String(d ?? '').slice(0, 400))
      : [];

    const systemPrompt = `Eres un analista financiero y de auditoría de retail experto (GOSEN IA). Analiza los resultados finales de esta auditoría y proporciona un resumen ejecutivo en un solo párrafo conciso (máximo 4 líneas). Destaca los problemas principales, las pérdidas o ganancias financieras en Lempiras (L) y da una recomendación rápida en español. No uses saludos, ve directo al análisis.`;

    const userPrompt = `Analiza esta auditoría de inventario:
Productos exactos: ${safeMatch}
Productos con faltantes: ${safeMissing}
Productos con sobrantes: ${safeExtra}
Impacto financiero neto total: L ${safeNetImpact.toFixed(2)}

Detalle por producto (Discrepancias registradas):
${safeDiscrepancies.length > 0 ? safeDiscrepancies.join('\n') : 'Sin discrepancias individuales.'}`;

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

function sanitizePrinterNameInput(rawName: unknown): string {
  if (rawName === undefined || rawName === null || rawName === '') return '';
  const cleaned = String(rawName).trim();
  if (cleaned.length > 150) {
    throw new Error('Nombre de impresora demasiado largo');
  }
  if (!/^[\p{L}\p{N}\s._()\-:/\\+#@]+$/u.test(cleaned)) {
    throw new Error('Nombre de impresora contiene caracteres no permitidos');
  }
  return cleaned;
}

app.post('/imprimir', async (req, res) => {
  const { imageBase64, pdfBase64, printerName, format = '80mm', widthMm } = req.body || {};
  if (!imageBase64 && !pdfBase64) {
    return res.status(400).json({ ok: false, error: 'Se requiere imageBase64 o pdfBase64' });
  }

  let safePrinterName = '';
  try {
    safePrinterName = sanitizePrinterNameInput(printerName);
  } catch (err: any) {
    return res.status(400).json({ ok: false, error: err?.message || 'Impresora inválida' });
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
      const escapedPrinter = safePrinterName.replace(/'/g, "''");

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
        printerName: safePrinterName || 'Predeterminada de Windows',
      });
    }

    if (pdfBase64) {
      const cleanPdf = String(pdfBase64).replace(/^data:application\/pdf;base64,/, '');
      fs.writeFileSync(tmpPdfPath, Buffer.from(cleanPdf, 'base64'));
      if (process.platform === 'win32') {
        const escapedPdf = tmpPdfPath.replace(/'/g, "''");
        const escapedPrinter = safePrinterName.replace(/'/g, "''");
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
        const lpArgs = safePrinterName ? ['-d', safePrinterName, tmpPdfPath] : [tmpPdfPath];
        await new Promise<void>((resolve, reject) => {
          execFile('lp', lpArgs, { timeout: 10000 }, (err, _stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve();
          });
        });
      }
      setTimeout(() => fs.unlink(tmpPdfPath, () => {}), 15000);
      return res.json({
        ok: true,
        method: 'os-pdf-spooler',
        printerName: safePrinterName || 'Predeterminada del Sistema',
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
  restaurant: any | null;
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
      restaurant: null,
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

function resolvePasswordWrite(
  incomingRaw: unknown,
  existingStored: unknown,
  fallbackDefault?: string
): string {
  const clean = String(incomingRaw ?? '').trim();
  if (!clean || clean === HASHED_PASSWORD_MASK || clean === '••••••••') {
    const existingClean = String(existingStored ?? '').trim();
    if (existingClean && existingClean !== HASHED_PASSWORD_MASK) {
      return isHashedPassword(existingClean) ? existingClean : hashPassword(existingClean);
    }
    return fallbackDefault ? hashPassword(fallbackDefault) : '';
  }
  return isHashedPassword(clean) ? clean : hashPassword(clean);
}

function redactUserForResponse(u: any): any {
  if (!u || typeof u !== 'object') return u;
  const copy = { ...u };
  if ('password' in copy) {
    copy.password = copy.password ? HASHED_PASSWORD_MASK : '';
  }
  return copy;
}

function redactSettingsForResponse(s: any): any {
  if (!s || typeof s !== 'object') return s;
  const copy = { ...s };
  if ('accessPassword' in copy) {
    copy.accessPassword = copy.accessPassword ? HASHED_PASSWORD_MASK : '';
  }
  return copy;
}

function redactCompanyForResponse(c: any): any {
  if (!c || typeof c !== 'object') return c;
  const copy = { ...c };
  if ('adminPassword' in copy) {
    copy.adminPassword = copy.adminPassword ? HASHED_PASSWORD_MASK : '';
  }
  return copy;
}

// Migrate any legacy plaintext passwords on disk to scrypt$ hashes on server boot
(function migrateSyncDbPasswordsAndEnsureDefaults() {
  let dirty = false;
  if (!syncDbMemory.companies || typeof syncDbMemory.companies !== 'object') {
    syncDbMemory.companies = {};
  }
  if (!syncDbMemory.tenants || typeof syncDbMemory.tenants !== 'object') {
    syncDbMemory.tenants = {};
  }

  for (const [slug, comp] of Object.entries(syncDbMemory.companies)) {
    if (!comp || typeof comp !== 'object') continue;
    if (comp.adminPassword && !isHashedPassword(comp.adminPassword) && comp.adminPassword !== HASHED_PASSWORD_MASK) {
      comp.adminPassword = hashPassword(comp.adminPassword);
      dirty = true;
    } else if (!comp.adminPassword) {
      comp.adminPassword = hashPassword(slug === 'gosen' ? 'GOSEN2026' : slug === 'tiendagyg' ? 'GYG2026' : 'ADMIN2026');
      dirty = true;
    }
  }

  for (const [, tenant] of Object.entries(syncDbMemory.tenants)) {
    if (!tenant || typeof tenant !== 'object') continue;
    if (
      tenant.settings?.accessPassword &&
      !isHashedPassword(tenant.settings.accessPassword) &&
      tenant.settings.accessPassword !== HASHED_PASSWORD_MASK
    ) {
      tenant.settings.accessPassword = hashPassword(tenant.settings.accessPassword);
      dirty = true;
    }
    if (tenant.users && typeof tenant.users === 'object') {
      for (const u of Object.values(tenant.users)) {
        if (u && u.password && !isHashedPassword(u.password) && u.password !== HASHED_PASSWORD_MASK) {
          u.password = hashPassword(u.password);
          dirty = true;
        }
      }
    }
  }

  if (!syncDbMemory.companies['gosen']) {
    syncDbMemory.companies['gosen'] = {
      id: 'gosen',
      name: 'Tienda Gosén',
      slug: 'gosen',
      status: 'active',
      adminPassword: hashPassword('GOSEN2026'),
      plan: 'vitalicia',
      isPrimary: true,
    };
    dirty = true;
  }

  if (dirty) {
    schedulePersistSyncDb();
  }
})();

// Firestore REST config & server-side hydration helper (for cold boots before client sync)
const FIREBASE_SERVER_CONFIG: { projectId?: string; firestoreDatabaseId?: string; apiKey?: string } = (() => {
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    }
  } catch {}
  return {};
})();

function fromFirestoreRestValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return String(val.stringValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return Array.isArray(val.arrayValue?.values)
      ? val.arrayValue.values.map(fromFirestoreRestValue)
      : [];
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    const fields = val.mapValue?.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      if (!UNSAFE_OBJECT_KEYS.has(k)) {
        out[k] = fromFirestoreRestValue(v);
      }
    }
    return out;
  }
  return undefined;
}

function parseFirestoreRestDoc(docObj: any): { id: string; data: Record<string, any> } | null {
  if (!docObj || typeof docObj !== 'object' || !docObj.name) return null;
  const id = String(docObj.name).split('/').pop() || '';
  const data: Record<string, any> = {};
  const fields = docObj.fields || {};
  for (const [k, v] of Object.entries(fields)) {
    if (!UNSAFE_OBJECT_KEYS.has(k)) {
      data[k] = fromFirestoreRestValue(v);
    }
  }
  return { id, data };
}

let lastFirestoreAuthHydrationAt = 0;
async function hydrateAuthFromFirestoreRest(force = false): Promise<void> {
  const { projectId, firestoreDatabaseId, apiKey: fbKey } = FIREBASE_SERVER_CONFIG;
  if (!projectId || !firestoreDatabaseId) return;
  const now = Date.now();
  if (!force && now - lastFirestoreAuthHydrationAt < 30_000) return;
  lastFirestoreAuthHydrationAt = now;

  const base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(firestoreDatabaseId)}/documents`;
  const keyQs = fbKey ? `?key=${encodeURIComponent(fbKey)}` : '';

  const fetchCollection = async (colName: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      // Use Firestore REST :runQuery (returns 200 on Enterprise/Standard; collection GET list returns 403)
      const resp = await fetch(`${base}:runQuery${keyQs}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          structuredQuery: {
            from: [{ collectionId: colName }],
            limit: 500,
          },
        }),
        signal: controller.signal,
      });
      if (!resp.ok) return [];
      const json: any = await resp.json();
      if (!Array.isArray(json)) return [];
      return json.filter((row: any) => row && row.document).map((row: any) => row.document);
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    const [compDocs, settingsDocs, userDocs] = await Promise.all([
      fetchCollection('companies'),
      fetchCollection('settings'),
      fetchCollection('users'),
    ]);

    let changed = false;
    for (const rawDoc of compDocs) {
      const parsed = parseFirestoreRestDoc(rawDoc);
      if (!parsed) continue;
      const slug = normalizeServerCompanySlug(parsed.data.slug || parsed.id);
      if (!isSafeRecordKey(slug)) continue;
      const existing = syncDbMemory.companies[slug];
      const fsPass = String(parsed.data.adminPassword || '').trim();
      const hasRealFsPass = Boolean(fsPass && fsPass !== HASHED_PASSWORD_MASK);
      if (!existing || !existing.adminPassword || (hasRealFsPass && !isHashedPassword(existing.adminPassword))) {
        syncDbMemory.companies[slug] = {
          ...(existing || {}),
          ...parsed.data,
          id: slug,
          slug,
          adminPassword: resolvePasswordWrite(
            parsed.data.adminPassword,
            existing?.adminPassword,
            slug === 'gosen' ? 'GOSEN2026' : slug === 'tiendagyg' ? 'GYG2026' : 'ADMIN2026'
          ),
        };
        changed = true;
      } else if (parsed.data.status && existing.status !== parsed.data.status) {
        existing.status = parsed.data.status;
        if (parsed.data.moraReason !== undefined) existing.moraReason = parsed.data.moraReason;
        changed = true;
      }
    }

    for (const rawDoc of settingsDocs) {
      const parsed = parseFirestoreRestDoc(rawDoc);
      if (!parsed || !parsed.id.startsWith('store_profile')) continue;
      const slug = normalizeServerCompanySlug(
        parsed.data.companyId || parsed.id.replace(/^store_profile_?/, '') || 'gosen'
      );
      if (!isSafeRecordKey(slug)) continue;
      const tenant = getTenantStore(slug);
      const fsPass = String(parsed.data.accessPassword || '').trim();
      const hasRealFsPass = Boolean(fsPass && fsPass !== HASHED_PASSWORD_MASK);
      if (!tenant.settings || !tenant.settings.accessPassword || (hasRealFsPass && !isHashedPassword(tenant.settings.accessPassword))) {
        tenant.settings = {
          ...(tenant.settings || {}),
          ...parsed.data,
          companyId: slug,
          accessPassword: resolvePasswordWrite(
            parsed.data.accessPassword,
            tenant.settings?.accessPassword
          ),
        };
        changed = true;
      }
    }

    for (const rawDoc of userDocs) {
      const parsed = parseFirestoreRestDoc(rawDoc);
      if (!parsed) continue;
      const slug = normalizeServerCompanySlug(
        parsed.data.companyId || (parsed.id.includes('__') ? parsed.id.split('__')[0] : 'gosen')
      );
      if (!isSafeRecordKey(slug) || !isSafeRecordKey(parsed.id)) continue;
      const tenant = getTenantStore(slug);
      const existing = tenant.users[parsed.id];
      const fsPass = String(parsed.data.password || '').trim();
      const hasRealFsPass = Boolean(fsPass && fsPass !== HASHED_PASSWORD_MASK);
      const fsTs = Number(parsed.data.updatedAt || parsed.data.createdAt || 0);
      const exTs = Number(existing?.updatedAt || existing?.createdAt || 0);

      if (!existing) {
        tenant.users[parsed.id] = {
          ...parsed.data,
          id: parsed.id,
          companyId: slug,
          password: resolvePasswordWrite(parsed.data.password, undefined),
        };
        changed = true;
      } else if (
        (hasRealFsPass && (!existing.password || fsTs >= exTs)) ||
        fsTs > exTs
      ) {
        tenant.users[parsed.id] = {
          ...existing,
          ...parsed.data,
          id: parsed.id,
          companyId: slug,
          password: resolvePasswordWrite(
            hasRealFsPass ? fsPass : undefined,
            existing.password
          ),
        };
        changed = true;
      }
    }

    if (changed) {
      schedulePersistSyncDb();
    }
  } catch {}
}

// Track failed logins per IP for brute-force protection
const loginFailTracker = new Map<string, { count: number; firstFailAt: number; lockedUntil: number }>();

function registerServerLoginFailure(ip: string, context: { companyId?: string; username?: string; detail: string }) {
  const now = Date.now();
  let rec = loginFailTracker.get(ip);
  if (!rec || now - rec.firstFailAt > 5 * 60_000) {
    rec = { count: 1, firstFailAt: now, lockedUntil: 0 };
  } else {
    rec.count += 1;
  }
  if (rec.count >= 5) {
    rec.lockedUntil = now + 30_000;
    recordSecurityEvent({
      type: 'login_lockout',
      severity: 'critical',
      ip,
      companyId: context.companyId,
      username: context.username,
      path: '/api/auth/login',
      detail: `${context.detail} (Bloqueo 30s tras ${rec.count} intentos fallidos)`,
    });
  } else {
    recordSecurityEvent({
      type: 'failed_login',
      severity: rec.count >= 3 ? 'high' : 'medium',
      ip,
      companyId: context.companyId,
      username: context.username,
      path: '/api/auth/login',
      detail: `${context.detail} (intento ${rec.count}/5)`,
    });
  }
  loginFailTracker.set(ip, rec);
  return rec;
}

// ============================================================================
// AUTHENTICATION ENDPOINTS (/api/auth/*)
// ============================================================================

app.get('/api/auth/session', (req, res) => {
  const session = getAuthenticatedSession(req);
  if (!session) {
    return res.json({ ok: true, authenticated: false, session: null });
  }
  return res.json({
    ok: true,
    authenticated: true,
    authToken: signSessionToken(session),
    session: {
      userId: session.uid,
      companyId: session.cid,
      isSuperAdmin: session.sa,
      role: session.role,
      username: session.uname,
      userName: session.displayName,
    },
  });
});

app.post('/api/auth/logout', (req, res) => {
  clearSessionCookie(res, req);
  return res.json({ ok: true });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const ip = getClientIp(req);
    const lockRec = loginFailTracker.get(ip);
    if (lockRec && Date.now() < lockRec.lockedUntil) {
      const waitSec = Math.ceil((lockRec.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        ok: false,
        lockedSeconds: waitSec,
        error: `Demasiados intentos fallidos. Espera ${waitSec} segundos para volver a intentar.`,
      });
    }

    const { mode = 'store_pass', password, username, companyId, remember = true } = req.body || {};
    const cleanPass = String(password || '').trim();
    const cleanUser = String(username || '').trim().toLowerCase().replace(/^@+/, '');
    const hasPreferred = Boolean(companyId && String(companyId).trim());
    const preferredSlug = hasPreferred ? normalizeServerCompanySlug(String(companyId)) : '';

    if (!cleanPass || cleanPass.length > 150) {
      return res.status(400).json({ ok: false, error: 'Ingresa tu contraseña de acceso.' });
    }

    // 1. Check SaaS Master Key (on saas_owner mode or direct master key entry)
    if (mode === 'saas_owner' || verifySaasMasterKey(cleanPass)) {
      if (!verifySaasMasterKey(cleanPass)) {
        const fail = registerServerLoginFailure(ip, {
          companyId: 'saas',
          username: 'saas_admin',
          detail: 'Intento fallido en login Panel Central SaaS',
        });
        return res.status(fail.lockedUntil > Date.now() ? 429 : 401).json({
          ok: false,
          lockedSeconds: fail.lockedUntil > Date.now() ? 30 : 0,
          error: 'Clave de acceso incorrecta.',
        });
      }

      loginFailTracker.delete(ip);
      const saasPayload: SessionPayload = {
        uid: 'saas_super_admin',
        cid: 'gosen',
        sa: true,
        role: 'admin',
        uname: 'saas_admin',
        displayName: 'Administrador SaaS',
        exp: Date.now() + (remember ? 7 : 1) * 24 * 60 * 60 * 1000,
      };
      const authToken = setSessionCookie(res, req, saasPayload, Boolean(remember));
      recordSecurityEvent({
        type: 'login_success',
        severity: 'low',
        ip,
        companyId: 'gosen',
        username: 'saas_admin',
        path: '/api/auth/login',
        detail: 'Inicio de sesión en Consola Central SaaS',
      });
      return res.json({
        ok: true,
        authToken,
        session: {
          userId: 'saas_super_admin',
          companyId: 'gosen',
          companyName: 'Panel Central SaaS',
          isSuperAdmin: true,
          isStandaloneSaaS: true,
          userName: 'Administrador SaaS',
          username: 'saas_admin',
          role: 'admin',
          allowedTabs: [
            'companies',
            'dashboard',
            'inventory',
            'warehouses',
            'sales',
            'purchases',
            'audit',
            'price-checker',
            'suppliers',
            'settings',
            'catalog',
            'users',
            'activity',
          ],
        },
      });
    }

    // Helper functions for tenant & collaborator resolution
    const verifyAgainstCompany = (slug: string, allowAutoFallback = true): { ok: boolean; comp: any; tenant: ServerTenantStore } => {
      const comp = syncDbMemory.companies[slug];
      const tenant = getTenantStore(slug);
      const compPass = comp?.adminPassword;
      const settingsPass = tenant.settings?.accessPassword;
      if (compPass && verifyPassword(cleanPass, compPass, { allowUpperFallback: true })) {
        if (!isHashedPassword(compPass)) {
          comp.adminPassword = hashPassword(compPass);
          schedulePersistSyncDb();
        }
        return { ok: true, comp, tenant };
      }
      if (settingsPass && verifyPassword(cleanPass, settingsPass, { allowUpperFallback: true })) {
        if (!isHashedPassword(settingsPass)) {
          tenant.settings.accessPassword = hashPassword(settingsPass);
          schedulePersistSyncDb();
        }
        return { ok: true, comp, tenant };
      }
      if (allowAutoFallback) {
        if (slug === 'tiendagyg' && !comp?.adminPassword && !settingsPass && cleanPass.toUpperCase() === 'GYG2026') {
          return { ok: true, comp, tenant };
        }
        if (slug === 'gosen' && !comp?.adminPassword && !settingsPass && (cleanPass.toUpperCase() === 'GOSEN2026' || cleanPass.toUpperCase() === 'ADMIN2026')) {
          return { ok: true, comp, tenant };
        }
      }
      return { ok: false, comp, tenant };
    };

    const findMatchedCompanySlug = (): { slug: string; comp: any; tenant: ServerTenantStore } | null => {
      const slugs = Array.from(
        new Set([...Object.keys(syncDbMemory.companies), ...Object.keys(syncDbMemory.tenants), 'gosen', 'tiendagyg'])
      );
      if (preferredSlug) {
        const resPref = verifyAgainstCompany(preferredSlug);
        if (resPref.ok) return { slug: preferredSlug, ...resPref };
      }
      for (const s of slugs) {
        if (s === 'gosen') continue;
        const r = verifyAgainstCompany(s);
        if (r.ok) return { slug: s, ...r };
      }
      const rGosen = verifyAgainstCompany('gosen');
      if (rGosen.ok) return { slug: 'gosen', ...rGosen };
      return null;
    };

    const findMatchedCollaborator = (requireUsernameMatch: boolean): { slug: string; user: any } | null => {
      const normalizedCleanUser = normalizeNameForServerDedup(cleanUser);
      const checkTenant = (slug: string): any | null => {
        const tenant = syncDbMemory.tenants[slug];
        if (!tenant || !tenant.users) return null;
        for (const u of Object.values(tenant.users)) {
          if (!u || u.isActive === false) continue;
          const uName = String(u.username || '').trim().toLowerCase().replace(/^@+/, '').replace(/\s+/g, ' ');
          const fullName = String(u.name || '').trim().toLowerCase().replace(/\s+/g, ' ');
          const normFullName = normalizeNameForServerDedup(u.name);
          if (
            requireUsernameMatch &&
            cleanUser &&
            uName !== cleanUser &&
            fullName !== cleanUser &&
            (!normalizedCleanUser || normFullName !== normalizedCleanUser)
          ) {
            continue;
          }
          if (verifyPassword(cleanPass, u.password, { allowUpperFallback: true, allowLowerFallback: true })) {
            if (!isHashedPassword(u.password)) {
              u.password = hashPassword(String(u.password));
              schedulePersistSyncDb();
            }
            return u;
          }
        }
        return null;
      };

      const tenantSlugs = Object.keys(syncDbMemory.tenants);
      if (preferredSlug) {
        const u = checkTenant(preferredSlug);
        if (u) return { slug: preferredSlug, user: u };
      }
      for (const s of tenantSlugs) {
        if (s === 'gosen') continue;
        const u = checkTenant(s);
        if (u) return { slug: s, user: u };
      }
      const uGosen = checkTenant('gosen');
      if (uGosen) return { slug: 'gosen', user: uGosen };
      return null;
    };

    // Hydrate from Firestore REST if nothing matched yet locally (force bypass 30s cache)
    let matchedComp = mode === 'store_pass' ? findMatchedCompanySlug() : null;
    let matchedCollab =
      mode === 'collaborator'
        ? findMatchedCollaborator(true)
        : !matchedComp
        ? findMatchedCollaborator(false)
        : null;

    if (!matchedComp && !matchedCollab) {
      await hydrateAuthFromFirestoreRest(true);
      matchedComp = mode === 'store_pass' ? findMatchedCompanySlug() : null;
      matchedCollab =
        mode === 'collaborator'
          ? findMatchedCollaborator(true)
          : !matchedComp
          ? findMatchedCollaborator(false)
          : null;
    }

    // Collaborator fallback using store access password + collaborator username
    if (mode === 'collaborator' && !matchedCollab && cleanUser) {
      const storeMatch = findMatchedCompanySlug();
      if (storeMatch) {
        const targetSlug = storeMatch.slug;
        const compObj = storeMatch.comp;
        if (compObj && compObj.status === 'suspended') {
          return res.status(403).json({
            ok: false,
            suspended: true,
            error: `El acceso para "${compObj.name || targetSlug}" se encuentra suspendido.${compObj.moraReason ? ` Motivo: ${compObj.moraReason}.` : ''}`,
          });
        }
        const resolvedName =
          compObj?.name ||
          storeMatch.tenant.settings?.storeName ||
          (targetSlug === 'tiendagyg' ? 'COMERCIAL GYG' : targetSlug === 'gosen' ? 'Tienda Gosén' : targetSlug.toUpperCase());
        const displayCollab = cleanUser.charAt(0).toUpperCase() + cleanUser.slice(1);
        loginFailTracker.delete(ip);
        const sessPayload: SessionPayload = {
          uid: `${targetSlug}__collab_${cleanUser}`,
          cid: targetSlug,
          sa: false,
          role: 'collaborator',
          uname: cleanUser,
          displayName: displayCollab,
          exp: Date.now() + (remember ? 7 : 1) * 24 * 60 * 60 * 1000,
        };
        const authToken = setSessionCookie(res, req, sessPayload, Boolean(remember));
        return res.json({
          ok: true,
          authToken,
          session: {
            userId: sessPayload.uid,
            companyId: targetSlug,
            companyName: resolvedName,
            isSuperAdmin: false,
            isStandaloneSaaS: false,
            userName: displayCollab,
            username: cleanUser,
            role: 'collaborator',
            allowedTabs: ['sales', 'inventory', 'price-checker', 'catalog'],
            salesPermissions: {
              canEditSales: true,
              canCancelSales: false,
              canViewCostsAndProfits: false,
              canUseCreditCalculator: false,
            },
          },
          logoUrl: compObj?.logoUrl || storeMatch.tenant.settings?.logoUrl,
        });
      }
    }

    if (matchedCollab) {
      const targetSlug = matchedCollab.slug;
      const u = matchedCollab.user;
      const compObj = syncDbMemory.companies[targetSlug];
      const tenant = getTenantStore(targetSlug);
      if (compObj && compObj.status === 'suspended') {
        return res.status(403).json({
          ok: false,
          suspended: true,
          error: `El acceso para "${compObj.name || targetSlug}" se encuentra suspendido.${compObj.moraReason ? ` Motivo: ${compObj.moraReason}.` : ''}`,
        });
      }
      const resolvedStoreName =
        compObj?.name ||
        tenant.settings?.storeName ||
        (targetSlug === 'tiendagyg' ? 'COMERCIAL GYG' : targetSlug === 'gosen' ? 'Tienda Gosén' : targetSlug.toUpperCase());
      const effectiveRole: 'admin' | 'collaborator' = u.role === 'admin' ? 'admin' : 'collaborator';
      const assignedWarehouseIds = Array.isArray(u.allowedWarehouseIds)
        ? u.allowedWarehouseIds
        : Array.isArray(u.salesPermissions?.allowedWarehouseIds)
        ? u.salesPermissions.allowedWarehouseIds
        : [];

      loginFailTracker.delete(ip);
      const sessPayload: SessionPayload = {
        uid: u.id,
        cid: targetSlug,
        sa: false,
        role: effectiveRole,
        uname: u.username,
        displayName: u.name || u.username,
        exp: Date.now() + (remember ? 7 : 1) * 24 * 60 * 60 * 1000,
      };
      const authToken = setSessionCookie(res, req, sessPayload, Boolean(remember));
      recordSecurityEvent({
        type: 'login_success',
        severity: 'low',
        ip,
        companyId: targetSlug,
        username: u.username,
        path: '/api/auth/login',
        detail: `Inicio de sesión (${effectiveRole}) en ${targetSlug}`,
      });

      return res.json({
        ok: true,
        authToken,
        session: {
          userId: u.id,
          companyId: targetSlug,
          companyName: resolvedStoreName,
          isSuperAdmin: false,
          isStandaloneSaaS: false,
          userName: u.name || u.username,
          username: u.username,
          role: effectiveRole,
          allowedTabs:
            Array.isArray(u.allowedTabs) && u.allowedTabs.length > 0
              ? u.allowedTabs
              : effectiveRole === 'admin'
              ? [
                  'dashboard',
                  'inventory',
                  'warehouses',
                  'sales',
                  'purchases',
                  'audit',
                  'price-checker',
                  'suppliers',
                  'settings',
                  'catalog',
                  'users',
                  'activity',
                ]
              : ['sales', 'inventory', 'price-checker', 'catalog'],
          allowedWarehouseIds:
            effectiveRole === 'admin' || assignedWarehouseIds.length === 0
              ? undefined
              : assignedWarehouseIds,
          salesPermissions: {
            canEditSales:
              u.salesPermissions?.canEditSales !== undefined ? u.salesPermissions.canEditSales : true,
            canCancelSales:
              u.salesPermissions?.canCancelSales !== undefined
                ? u.salesPermissions.canCancelSales
                : effectiveRole === 'admin',
            canViewCostsAndProfits:
              u.salesPermissions?.canViewCostsAndProfits !== undefined
                ? u.salesPermissions.canViewCostsAndProfits
                : effectiveRole === 'admin',
            canUseCreditCalculator: Boolean(u.salesPermissions?.canUseCreditCalculator),
            isRouteCollector: Boolean(u.salesPermissions?.isRouteCollector),
            routeCollectorScope:
              u.salesPermissions?.routeCollectorScope === 'assigned' ? 'assigned' : 'all',
            ...(effectiveRole !== 'admin' && assignedWarehouseIds.length > 0
              ? { allowedWarehouseIds: assignedWarehouseIds }
              : {}),
          },
        },
        logoUrl: compObj?.logoUrl || tenant.settings?.logoUrl,
      });
    }

    if (matchedComp) {
      const targetSlug = matchedComp.slug;
      const compObj = matchedComp.comp;
      const tenant = matchedComp.tenant;
      if (compObj && compObj.status === 'suspended') {
        return res.status(403).json({
          ok: false,
          suspended: true,
          error: `El acceso para "${compObj.name || targetSlug}" se encuentra suspendido.${compObj.moraReason ? ` Motivo: ${compObj.moraReason}.` : ''}`,
        });
      }
      const resolvedStoreName =
        compObj?.name ||
        tenant.settings?.storeName ||
        (targetSlug === 'tiendagyg' ? 'COMERCIAL GYG' : targetSlug === 'gosen' ? 'Tienda Gosén' : targetSlug.toUpperCase());
      const adminDisplayName =
        targetSlug === 'gosen' ? 'Administrador Gosén' : `Admin ${resolvedStoreName}`;

      loginFailTracker.delete(ip);
      const sessPayload: SessionPayload = {
        uid: `admin_${targetSlug}`,
        cid: targetSlug,
        sa: false,
        role: 'admin',
        uname: 'admin',
        displayName: adminDisplayName,
        exp: Date.now() + (remember ? 7 : 1) * 24 * 60 * 60 * 1000,
      };
      const authToken = setSessionCookie(res, req, sessPayload, Boolean(remember));
      recordSecurityEvent({
        type: 'login_success',
        severity: 'low',
        ip,
        companyId: targetSlug,
        username: 'admin',
        path: '/api/auth/login',
        detail: `Inicio de sesión Admin en ${targetSlug}`,
      });

      return res.json({
        ok: true,
        authToken,
        session: {
          userId: sessPayload.uid,
          companyId: targetSlug,
          companyName: resolvedStoreName,
          isSuperAdmin: false,
          isStandaloneSaaS: false,
          userName: adminDisplayName,
          username: 'admin',
          role: 'admin',
          allowedTabs: [
            'dashboard',
            'inventory',
            'warehouses',
            'sales',
            'purchases',
            'audit',
            'price-checker',
            'suppliers',
            'settings',
            'catalog',
            'users',
            'activity',
          ],
        },
        logoUrl: compObj?.logoUrl || tenant.settings?.logoUrl,
      });
    }

    // No match -> record failure
    const fail = registerServerLoginFailure(ip, {
      companyId: preferredSlug || 'desconocida',
      username: cleanUser || 'admin',
      detail: `Credenciales inválidas en modo ${mode}${cleanUser ? ` (@${cleanUser})` : ''}`,
    });
    return res.status(fail.lockedUntil > Date.now() ? 429 : 401).json({
      ok: false,
      lockedSeconds: fail.lockedUntil > Date.now() ? 30 : 0,
      error:
        mode === 'collaborator'
          ? 'Usuario o contraseña incorrectos. Verifica tus datos e intenta nuevamente.'
          : 'Contraseña de acceso incorrecta. Verifica tu clave e intenta nuevamente.',
    });
  } catch (err: any) {
    console.error('Error in /api/auth/login:', err);
    return res.status(500).json({ ok: false, error: 'Error verificando credenciales en el servidor.' });
  }
});

app.post('/api/auth/unlock-saas', requireAuthSession, (req, res) => {
  const session = (req as any).authSession as SessionPayload;
  if (session.role !== 'admin') {
    recordSecurityEvent({
      type: 'privilege_escalation_attempt',
      severity: 'critical',
      ip: getClientIp(req),
      companyId: session.cid,
      username: session.uname,
      path: '/api/auth/unlock-saas',
      detail: 'Colaborador intentó desbloquear Consola SaaS',
    });
    return res.status(403).json({ ok: false, error: 'Solo administradores pueden acceder al panel SaaS.' });
  }
  const { masterKey } = req.body || {};
  if (!verifySaasMasterKey(String(masterKey || ''))) {
    recordSecurityEvent({
      type: 'failed_login',
      severity: 'high',
      ip: getClientIp(req),
      companyId: session.cid,
      username: session.uname,
      path: '/api/auth/unlock-saas',
      detail: 'Clave Maestra SaaS incorrecta en desbloqueo',
    });
    return res.status(401).json({ ok: false, error: 'Clave Maestra SaaS incorrecta.' });
  }
  const upgraded: SessionPayload = {
    ...session,
    sa: true,
    displayName: 'Administrador SaaS',
  };
  const authToken = setSessionCookie(res, req, upgraded, true);
  return res.json({ ok: true, authToken });
});

app.post('/api/auth/lock-saas', requireAuthSession, (req, res) => {
  const session = (req as any).authSession as SessionPayload;
  const downgraded: SessionPayload = {
    ...session,
    cid: 'gosen',
    sa: false,
    displayName: 'Administrador Gosén',
  };
  const authToken = setSessionCookie(res, req, downgraded, true);
  return res.json({ ok: true, authToken });
});

app.post('/api/auth/switch-company', requireAuthSession, (req, res) => {
  const session = (req as any).authSession as SessionPayload;
  if (!session.sa) {
    recordSecurityEvent({
      type: 'cross_tenant_attempt',
      severity: 'high',
      ip: getClientIp(req),
      companyId: session.cid,
      username: session.uname,
      path: '/api/auth/switch-company',
      detail: 'Intento no autorizado de cambiar de empresa sin privilegio SuperAdmin',
    });
    return res.status(403).json({ ok: false, error: 'Solo SuperAdmin puede cambiar entre empresas.' });
  }
  const targetSlug = normalizeServerCompanySlug(String(req.body?.companyId || 'gosen'));
  const authToken = setSessionCookie(res, req, { ...session, cid: targetSlug }, true);
  return res.json({ ok: true, companyId: targetSlug, authToken });
});

app.post('/api/auth/change-master-key', requireAuthSession, (req, res) => {
  const session = (req as any).authSession as SessionPayload;
  if (!session.sa) {
    recordSecurityEvent({
      type: 'privilege_escalation_attempt',
      severity: 'critical',
      ip: getClientIp(req),
      companyId: session.cid,
      username: session.uname,
      path: '/api/auth/change-master-key',
      detail: 'Intento no autorizado de cambiar Clave Maestra SaaS',
    });
    return res.status(403).json({ ok: false, error: 'Solo SuperAdmin puede cambiar la Clave Maestra.' });
  }
  const nextKey = String(req.body?.newKey || '').trim();
  if (nextKey.length < 6 || nextKey.length > 100) {
    return res.status(400).json({ ok: false, error: 'La Clave Maestra debe tener entre 6 y 100 caracteres.' });
  }
  saasAuthState = {
    masterKeyHash: hashPassword(nextKey),
    updatedAt: Date.now(),
  };
  try {
    ensureDataDirSync();
    fs.writeFileSync(SAAS_AUTH_FILE, JSON.stringify(saasAuthState), { encoding: 'utf-8', mode: 0o600 });
  } catch {}
  recordSecurityEvent({
    type: 'saas_master_changed',
    severity: 'medium',
    ip: getClientIp(req),
    companyId: session.cid,
    username: session.uname,
    path: '/api/auth/change-master-key',
    detail: 'Clave Maestra SaaS actualizada y protegida con hash scrypt',
  });
  return res.json({ ok: true });
});

app.post('/api/auth/verify-admin-pin', requireAuthSession, async (req, res) => {
  try {
    const session = (req as any).authSession as SessionPayload;
    const requestedSlug = req.body?.companyId
      ? normalizeServerCompanySlug(String(req.body.companyId))
      : session.cid;
    if (!session.sa && requestedSlug !== session.cid) {
      return res.status(403).json({ ok: false, error: 'Acceso denegado para esta tienda.' });
    }
    const candidate = String(req.body?.pin || '').trim();
    if (!candidate) {
      return res.status(400).json({ ok: false, error: 'Ingresa la contraseña de Administrador.' });
    }

    let comp = syncDbMemory.companies[requestedSlug];
    let tenant = getTenantStore(requestedSlug);

    const checkMatch = (): boolean => {
      if (comp?.adminPassword && verifyPassword(candidate, comp.adminPassword, { allowUpperFallback: true })) {
        return true;
      }
      if (tenant.settings?.accessPassword && verifyPassword(candidate, tenant.settings.accessPassword, { allowUpperFallback: true })) {
        return true;
      }
      if (requestedSlug === 'tiendagyg' && !comp?.adminPassword && !tenant.settings?.accessPassword && candidate.toUpperCase() === 'GYG2026') {
        return true;
      }
      if (requestedSlug === 'gosen' && !comp?.adminPassword && !tenant.settings?.accessPassword && (candidate.toUpperCase() === 'GOSEN2026' || candidate.toUpperCase() === 'ADMIN2026')) {
        return true;
      }
      for (const u of Object.values(tenant.users || {})) {
        if (u && u.role === 'admin' && u.isActive !== false && verifyPassword(candidate, u.password, { allowLowerFallback: true })) {
          return true;
        }
      }
      return false;
    };

    let matched = checkMatch();
    if (!matched) {
      await hydrateAuthFromFirestoreRest();
      comp = syncDbMemory.companies[requestedSlug];
      tenant = getTenantStore(requestedSlug);
      matched = checkMatch();
    }

    if (!matched) {
      recordSecurityEvent({
        type: 'failed_login',
        severity: 'medium',
        ip: getClientIp(req),
        companyId: requestedSlug,
        username: session.uname,
        path: '/api/auth/verify-admin-pin',
        detail: 'Clave Admin incorrecta al intentar autorizar operación POS',
      });
      return res.status(401).json({ ok: false, authorized: false, error: 'Contraseña de Administrador incorrecta.' });
    }

    return res.json({ ok: true, authorized: true });
  } catch {
    return res.status(500).json({ ok: false, error: 'Error verificando autorización.' });
  }
});

app.post('/api/auth/hash-password', requireAuthSession, (req, res) => {
  const session = (req as any).authSession as SessionPayload;
  if (session.role !== 'admin' && !session.sa) {
    return res.status(403).json({ ok: false, error: 'Solo administradores pueden cifrar credenciales.' });
  }
  const plain = String(req.body?.password || '').trim();
  if (!plain || plain.length > 200) {
    return res.status(400).json({ ok: false, error: 'Contraseña inválida.' });
  }
  return res.json({ ok: true, hash: hashPassword(plain) });
});

// ============================================================================
// SECURITY EVENTS MONITORING ENDPOINT (Authenticated Admins / SuperAdmin)
// ============================================================================
app.get('/api/security/events', requireAuthSession, (req, res) => {
  const session = (req as any).authSession as SessionPayload;
  if (session.role !== 'admin') {
    return res.status(403).json({ ok: false, error: 'Solo administradores pueden consultar el monitor de seguridad.' });
  }
  const events = session.sa
    ? securityEventsMemory.slice(0, 120)
    : securityEventsMemory
        .filter((e) => !e.companyId || e.companyId === session.cid)
        .slice(0, 120);
  return res.json({
    ok: true,
    scope: session.sa ? 'global' : session.cid,
    events,
  });
});

// ============================================================================
// PUBLIC CATALOG ENDPOINT (Safe read-only subset for ?catalogo=1 without login)
// ============================================================================
app.get('/api/public/catalog', (req, res) => {
  const slug = normalizeServerCompanySlug(String(req.query.empresa || req.query.companyId || 'gosen'));
  const tenant = getTenantStore(slug);
  const comp = syncDbMemory.companies[slug];
  const rawSettings = tenant.settings || {};

  const safeSettings = {
    companyId: slug,
    storeName: rawSettings.storeName || comp?.name || (slug === 'gosen' ? 'Tienda Gosén' : slug.toUpperCase()),
    tagline: rawSettings.tagline || comp?.tagline || 'Catálogo de productos',
    logoUrl: rawSettings.logoUrl || comp?.logoUrl || (slug === 'gosen' ? '/store-logo.jpg' : ''),
    phone: rawSettings.phone || comp?.phone || '',
    address: rawSettings.address || comp?.address || '',
    whatsappOrderPhone: rawSettings.whatsappOrderPhone || rawSettings.phone || comp?.phone || '',
    catalogWelcomeMsg: rawSettings.catalogWelcomeMsg || '',
    enableDeliveryDvolada: rawSettings.enableDeliveryDvolada ?? comp?.enableDeliveryDvolada ?? slug === 'gosen',
    bankAccounts: Array.isArray(rawSettings.bankAccounts) ? rawSettings.bankAccounts : [],
    locations: Array.isArray(rawSettings.locations) ? rawSettings.locations : [],
    showLocationsInCatalog: rawSettings.showLocationsInCatalog !== false,
    catalogAccentColor: rawSettings.catalogAccentColor || undefined,
    catalogThemeMode: rawSettings.catalogThemeMode || undefined,
  };

  const items = cleanAndDeduplicateTenantInventory(tenant).map((p: any) => ({
    id: p.id,
    companyId: slug,
    code: p.code,
    name: p.name,
    category: p.category || 'Otros',
    size: p.size || '',
    color: p.color || '',
    colors: Array.isArray(p.colors) ? p.colors : undefined,
    price: Number(p.price) || 0,
    discount: p.discount !== undefined ? Number(p.discount) : undefined,
    discountType: p.discountType,
    discountValue: p.discountValue !== undefined ? Number(p.discountValue) : undefined,
    stock: Number(p.stock) || 0,
    img: p.img || '',
    img2: p.img2 || undefined,
  }));

  return res.json({
    ok: true,
    companyId: slug,
    storeSettings: safeSettings,
    items,
  });
});

function assertTenantAccess(
  req: express.Request,
  res: express.Response,
  requestedSlug: string
): SessionPayload | null {
  const session = (req as any).authSession as SessionPayload;
  if (!session.sa && session.cid !== requestedSlug) {
    recordSecurityEvent({
      type: 'cross_tenant_attempt',
      severity: 'high',
      ip: getClientIp(req),
      companyId: session.cid,
      username: session.uname,
      path: req.path,
      detail: `Intento de acceso cruzado desde "${session.cid}" hacia "${requestedSlug}"`,
    });
    res.status(403).json({
      ok: false,
      error: 'Acceso denegado: no tienes permisos sobre esta empresa.',
    });
    return null;
  }
  return session;
}

// 1. Lightweight status check for real-time cross-device polling
app.get('/api/cloud-sync/status', requireAuthSession, (req, res) => {
  const slug = normalizeServerCompanySlug(String(req.query.companyId || 'gosen'));
  if (!assertTenantAccess(req, res, slug)) return;
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
app.post('/api/cloud-sync/inventory', requireAuthSession, (req, res) => {
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
    if (!assertTenantAccess(req, res, slug)) return;
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

    const mergeRecordItemSafe = (rawItem: any, isUpsert: boolean) => {
      if (!rawItem || typeof rawItem !== 'object') return;
      const safeItem = stripUnsafeKeys(rawItem);
      const code = String(safeItem.code || '').trim();
      const name = String(safeItem.name || '').trim();
      if (!code || !name) return;
      const codeKey = code.toLowerCase();
      if (!isSafeRecordKey(codeKey)) return;

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
      const incomingTs = Number(safeItem.updatedAt) || 0;
      const existingTs = Number(existing?.updatedAt) || 0;

      if (!existing) {
        tenant.inventory[codeKey] = {
          ...safeItem,
          id: safeItem.id || `${slug === 'gosen' ? '' : `${slug}__`}${code.replace(/\//g, '_')}`,
          companyId: slug,
          code,
          name,
          category: String(safeItem.category || 'Otros').trim(),
          supplier: String(safeItem.supplier || '').trim(),
          size: String(safeItem.size || '').trim(),
          cost: Number(safeItem.cost) || 0,
          price: Number(safeItem.price) || 0,
          stock: Number(safeItem.stock) || 0,
          img: safeItem.img || '',
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
            (Number(safeItem.stock) !== Number(existing.stock) ||
              Number(safeItem.price) !== Number(existing.price) ||
              String(safeItem.name).trim() !== String(existing.name).trim() ||
              (!existing.img && Boolean(safeItem.img))));

        const winner = shouldPreferIncoming ? safeItem : existing;
        const bestImg = safeItem.img || existing.img || '';
        const bestWarehouseStocks =
          (shouldPreferIncoming ? safeItem.warehouseStocks : existing.warehouseStocks) ||
          safeItem.warehouseStocks ||
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

    const mergeIncomingItem = mergeRecordItemSafe;

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
app.post('/api/cloud-sync/product-save', requireAuthSession, (req, res) => {
  try {
    const { companyId, product, products, oldCode } = req.body || {};
    const slug = normalizeServerCompanySlug(companyId);
    if (!assertTenantAccess(req, res, slug)) return;
    const tenant = getTenantStore(slug);
    const now = Date.now();

    if (oldCode) {
      const cleanOld = String(oldCode).trim().toLowerCase();
      const cleanNew = String(product?.code || '').trim().toLowerCase();
      if (cleanOld && isSafeRecordKey(cleanOld) && cleanOld !== cleanNew) {
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
    for (const rawP of listToSave) {
      if (!rawP || typeof rawP !== 'object' || !rawP.code) continue;
      const p = stripUnsafeKeys(rawP);
      const cleanCode = String(p.code).trim();
      const codeKey = cleanCode.toLowerCase();
      if (!isSafeRecordKey(codeKey)) continue;
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
app.post('/api/cloud-sync/product-delete', requireAuthSession, (req, res) => {
  try {
    const { companyId, id, code } = req.body || {};
    const slug = normalizeServerCompanySlug(companyId);
    if (!assertTenantAccess(req, res, slug)) return;
    const tenant = getTenantStore(slug);
    const rawCode =
      code ||
      (typeof id === 'string' && id.includes('__') ? id.split('__').slice(1).join('__') : id) ||
      '';
    const cleanCode = String(rawCode).trim().toLowerCase();

    if (cleanCode && isSafeRecordKey(cleanCode)) {
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
app.post('/api/cloud-sync/collections', requireAuthSession, (req, res) => {
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
      restaurant,
      companies,
      deleteSupplierId,
      deletePurchaseId,
      deleteSaleId,
      deleteUserId,
    } = req.body || {};

    const slug = normalizeServerCompanySlug(companyId);
    const session = assertTenantAccess(req, res, slug);
    if (!session) return;
    const isAdminOrSa = session.role === 'admin' || session.sa;
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
      if (!isAdminOrSa) {
        recordSecurityEvent({
          type: 'privilege_escalation_attempt',
          severity: 'high',
          ip: getClientIp(req),
          companyId: session.cid,
          username: session.uname,
          path: '/api/cloud-sync/collections',
          detail: `Colaborador intentó eliminar usuario "${String(deleteUserId)}"`,
        });
        return res.status(403).json({ ok: false, error: 'Solo administradores pueden eliminar usuarios.' });
      }
      delete tenant.users[String(deleteUserId)];
      changed = true;
    }

    const mergeRecordList = (
      targetMap: Record<string, any>,
      incomingList: any[] | undefined,
      idField = 'id',
      isUsersCollection = false
    ) => {
      if (!Array.isArray(incomingList)) return;
      for (const rawItem of incomingList) {
        if (!rawItem || typeof rawItem !== 'object') continue;
        const item = stripUnsafeKeys(rawItem);
        const id = String(item[idField] || item.code || item.invoiceNumber || item.saleNumber || '').trim();
        if (!id || !isSafeRecordKey(id)) continue;
        const prev = targetMap[id];
        const incTs = Number(item.updatedAt || item.timestamp || 0);
        const prevTs = Number(prev?.updatedAt || prev?.timestamp || 0);
        if (!prev || incTs >= prevTs || item.status !== prev.status) {
          const nextRec = { ...(prev || {}), ...item, companyId: slug };
          if (isUsersCollection) {
            nextRec.password = resolvePasswordWrite(item.password, prev?.password);
          }
          targetMap[id] = nextRec;
          changed = true;
        }
      }
    };

    mergeRecordList(tenant.suppliers, suppliers);
    mergeRecordList(tenant.purchases, purchases);
    mergeRecordList(tenant.sales, sales);

    if (Array.isArray(users) && users.length > 0) {
      if (isAdminOrSa) {
        mergeRecordList(tenant.users, users, 'id', true);
      } else {
        recordSecurityEvent({
          type: 'privilege_escalation_attempt',
          severity: 'high',
          ip: getClientIp(req),
          companyId: session.cid,
          username: session.uname,
          path: '/api/cloud-sync/collections',
          detail: 'Colaborador intentó modificar lista de usuarios',
        });
      }
    }

    if (warehouses && typeof warehouses === 'object') {
      const safeWarehouses = stripUnsafeKeys(warehouses);
      const incTs = Number(safeWarehouses.updatedAt || 0);
      const prevTs = Number(tenant.warehouses?.updatedAt || 0);
      if (
        !tenant.warehouses ||
        incTs >= prevTs ||
        (Array.isArray(safeWarehouses.transfers) &&
          safeWarehouses.transfers.length > (tenant.warehouses.transfers?.length || 0)) ||
        (Array.isArray(safeWarehouses.warehouses) &&
          safeWarehouses.warehouses.length !== (tenant.warehouses.warehouses?.length || 0))
      ) {
        tenant.warehouses = { ...safeWarehouses, companyId: slug };
        changed = true;
      }
    }

    if (settings && typeof settings === 'object') {
      if (isAdminOrSa) {
        const safeSettings = stripUnsafeKeys(settings);
        const incTs = Number(safeSettings.updatedAt || 0);
        const prevTs = Number(tenant.settings?.updatedAt || 0);
        if (!tenant.settings || incTs >= prevTs) {
          const hashedPass = resolvePasswordWrite(
            safeSettings.accessPassword,
            tenant.settings?.accessPassword || syncDbMemory.companies[slug]?.adminPassword
          );
          tenant.settings = {
            ...safeSettings,
            companyId: slug,
            ...(hashedPass ? { accessPassword: hashedPass } : {}),
          };
          changed = true;
        }
      }
    }

    if (posFinance && typeof posFinance === 'object') {
      const safePosFinance = stripUnsafeKeys(posFinance);
      const incTs = Number(safePosFinance.updatedAt || 0);
      const prev = tenant.posFinance;
      const prevTs = Number(prev?.updatedAt || 0);
      if (!prev) {
        tenant.posFinance = { ...safePosFinance, companyId: slug };
        changed = true;
      } else {
        const isIncomingNewer = incTs >= prevTs;
        const primary = isIncomingNewer ? safePosFinance : prev;
        const secondary = isIncomingNewer ? prev : safePosFinance;

        const mergedControls: Record<string, any> = {
          ...(secondary.creditAccountControls || {}),
          ...(primary.creditAccountControls || {}),
        };

        const alertMap = new Map<string, any>();
        for (const a of [
          ...(secondary.routeCollectorAlerts || []),
          ...(primary.routeCollectorAlerts || []),
        ]) {
          if (a && a.id) {
            const existing = alertMap.get(a.id);
            if (!existing || a.status === 'reviewed') {
              alertMap.set(a.id, a);
            }
          }
        }
        const mergedAlerts = Array.from(alertMap.values())
          .sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0))
          .slice(0, 300);

        const shiftMap = new Map<string, any>();
        for (const s of [...(secondary.shifts || []), ...(primary.shifts || [])]) {
          if (s && s.id) {
            const existing = shiftMap.get(s.id);
            if (!existing || s.status === 'closed' || (s.cashMovements?.length || 0) >= (existing.cashMovements?.length || 0)) {
              shiftMap.set(s.id, s);
            }
          }
        }
        const mergedShifts = Array.from(shiftMap.values()).sort(
          (a, b) => (Number(b.openedAt) || 0) - (Number(a.openedAt) || 0)
        );

        const expMap = new Map<string, any>();
        for (const e of [...(secondary.expenses || []), ...(primary.expenses || [])]) {
          if (e && e.id) expMap.set(e.id, e);
        }
        const mergedExpenses = Array.from(expMap.values()).sort(
          (a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0)
        );

        // Merge enabledCollectorUsernames from primary + any assigned collectors in creditAccountControls
        const collectorSet = new Set<string>(
          (primary.routeCollectorConfig?.enabledCollectorUsernames ||
            secondary.routeCollectorConfig?.enabledCollectorUsernames ||
            [])
            .map((u: any) => String(u || '').trim().toLowerCase().replace(/^@+/, ''))
            .filter(Boolean)
        );
        for (const ctrl of Object.values(mergedControls)) {
          if (ctrl?.assignedCollectorUsername) {
            collectorSet.add(
              String(ctrl.assignedCollectorUsername).trim().toLowerCase().replace(/^@+/, '')
            );
          }
        }

        const mergedPosFinance = {
          ...secondary,
          ...primary,
          companyId: slug,
          shifts: mergedShifts,
          expenses: mergedExpenses,
          creditAccountControls: mergedControls,
          routeCollectorAlerts: mergedAlerts,
          routeCollectorConfig: {
            ...(secondary.routeCollectorConfig || {}),
            ...(primary.routeCollectorConfig || {}),
            enabledCollectorUsernames: Array.from(collectorSet),
          },
          updatedAt: Math.max(incTs, prevTs, 1),
        };

        if (JSON.stringify(mergedPosFinance) !== JSON.stringify(prev)) {
          tenant.posFinance = mergedPosFinance;
          changed = true;
        }
      }
    }

    if (restaurant && typeof restaurant === 'object') {
      const safeRestaurant = stripUnsafeKeys(restaurant);
      const incTs = Number(safeRestaurant.updatedAt || 0);
      const prev = tenant.restaurant;
      const prevTs = Number(prev?.updatedAt || 0);
      if (!prev || incTs >= prevTs) {
        tenant.restaurant = { ...safeRestaurant, companyId: slug };
        changed = true;
      }
    }

    if (Array.isArray(companies) && companies.length > 0) {
      if (session.sa || isAdminOrSa) {
        for (const rawComp of companies) {
          if (rawComp && rawComp.slug) {
            const comp = stripUnsafeKeys(rawComp);
            const cSlug = normalizeServerCompanySlug(comp.slug);
            if (!isSafeRecordKey(cSlug)) continue;
            if (!session.sa && cSlug !== slug) continue;
            const prevComp = syncDbMemory.companies[cSlug];
            syncDbMemory.companies[cSlug] = {
              ...(prevComp || {}),
              ...comp,
              adminPassword: resolvePasswordWrite(
                comp.adminPassword,
                prevComp?.adminPassword,
                cSlug === 'gosen' ? 'GOSEN2026' : cSlug === 'tiendagyg' ? 'GYG2026' : 'ADMIN2026'
              ),
            };
            changed = true;
          }
        }
      }
    }

    if (changed) {
      tenant.updatedAt = Date.now();
      syncDbMemory.updatedAt = tenant.updatedAt;
      schedulePersistSyncDb();
    }

    const scopedCompanies = session.sa
      ? Object.values(syncDbMemory.companies).map(redactCompanyForResponse)
      : syncDbMemory.companies[slug]
      ? [redactCompanyForResponse(syncDbMemory.companies[slug])]
      : [];

    const scopedAllUsers = session.sa
      ? Object.entries(syncDbMemory.tenants).flatMap(([tSlug, tData]) =>
          Object.values(tData.users || {}).map((u: any) =>
            redactUserForResponse({
              ...u,
              companyId: u.companyId || tSlug,
            })
          )
        )
      : [];

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
      users: isAdminOrSa
        ? Object.values(tenant.users)
            .map(redactUserForResponse)
            .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        : [],
      allUsers: scopedAllUsers,
      warehouses: tenant.warehouses,
      settings: redactSettingsForResponse(tenant.settings),
      posFinance: tenant.posFinance,
      restaurant: tenant.restaurant,
      companies: scopedCompanies,
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
