import React, { useState, useEffect, useRef } from 'react';
import {
  SaaSGlobalConfig,
  SaaSDemoRequest,
  OFFICIAL_SAAS_DOMAIN,
  getOfficialAppBaseUrl,
} from '../types';
import { submitSaaSDemoRequest, normalizeCompanySlug } from '../firebase/firestoreService';
import { Lock, ArrowRight, X, Building2, CheckCircle2 } from 'lucide-react';

interface SaaSLandingPageProps {
  saasGlobalConfig: SaaSGlobalConfig;
  hasActiveSession?: boolean;
  activeSessionLabel?: string;
  onResumeSession?: () => void;
  onEnterClientStore: (companySlug: string) => void;
  onOpenSaaSConsole: () => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

interface PlanItem {
  id: SaaSDemoRequest['planInterest'];
  t: string;
  n: string;
  d: string;
  p: string;
  per: string;
  l: string;
  f: string[];
  b: string;
  feat?: boolean;
}

const PLANS: PlanItem[] = [
  {
    id: 'prueba15',
    t: 'Acceso inmediato',
    n: 'Demo prueba 15 días',
    d: 'Conoce todas las funciones en tu propio negocio sin compromiso',
    p: '0',
    per: '15 días de prueba real',
    l: 'Hasta 100 productos y 2 usuarios',
    f: [
      'Enlace propio y aislado para tu negocio',
      'Los 12 módulos habilitados durante la prueba',
      'Punto de venta POS, inventario y multi-bodegas',
      'App instalable en celular Android, iPhone y PC',
      'Plantilla inicial de artículos según tu rubro',
    ],
    b: 'Solicitar demo de 15 días',
  },
  {
    id: 'emprendedor',
    t: 'Esencial POS',
    n: 'Plan Emprendedor',
    d: 'Ideal para tiendas en crecimiento que inician su control digital',
    p: '450',
    per: 'por mes',
    l: 'Hasta 250 productos y 2 usuarios',
    f: [
      'Dashboard de ventas y ganancias',
      'Punto de venta (POS), tickets y caja',
      'Control de inventario con escáner y Excel',
      'Consultor de precios y ajustes con tu logo',
      'Respaldo automático en la nube 24/7',
    ],
    b: 'Elegir Plan Emprendedor',
  },
  {
    id: 'comercial',
    t: 'Más contratado',
    n: 'Plan Comercial Pro',
    d: 'Para comercios con bodega, catálogo en línea y personal de caja',
    p: '650',
    per: 'por mes',
    l: 'Hasta 1,500 productos y 5 usuarios',
    f: [
      'Todo lo incluido en el Plan Emprendedor',
      'Módulo multi-bodegas y traslados de stock',
      'Catálogo digital público con QR y WhatsApp',
      'Compras a proveedores y cuentas por cobrar',
      'Gestión de colaboradores con permisos por rol',
    ],
    b: 'Elegir Plan Comercial Pro',
    feat: true,
  },
  {
    id: 'empresarial',
    t: 'Todo ilimitado',
    n: 'Plan Empresarial Full',
    d: 'Capacidad ilimitada, auditoría física ciega y bitácora completa',
    p: '950',
    per: 'por mes',
    l: 'Productos y usuarios ilimitados',
    f: [
      'Los 12 módulos completos sin restricciones',
      'Auditoría física ciega con escáner en vivo',
      'Bitácora de movimientos y seguridad avanzada',
      'Artículos, ventas, bodegas y cajeros ilimitados',
      'Soporte prioritario y opción de Plan Anual o Vitalicio',
    ],
    b: 'Elegir Plan Empresarial',
  },
];

const RUBROS = [
  'Pulpería o tienda',
  'Ferretería',
  'Farmacia',
  'Ropa y calzado',
  'Restaurante',
  'Otro',
];

export const SaaSLandingPage: React.FC<SaaSLandingPageProps> = ({
  saasGlobalConfig,
  hasActiveSession,
  activeSessionLabel,
  onResumeSession,
  onEnterClientStore,
  onOpenSaaSConsole,
  showToast,
}) => {
  const [selectedPlanId, setSelectedPlanId] = useState<SaaSDemoRequest['planInterest']>('prueba15');
  const [showClientAccessModal, setShowClientAccessModal] = useState(false);
  const [clientCodeInput, setClientCodeInput] = useState('');

  // Demo form fields
  const [nombre, setNombre] = useState('');
  const [negocio, setNegocio] = useState('');
  const [tel, setTel] = useState('');
  const [rubro, setRubro] = useState(RUBROS[0]);
  const [msg, setMsg] = useState('');
  const [isSent, setIsSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [waLink, setWaLink] = useState('');
  const [planSelectFlash, setPlanSelectFlash] = useState(false);

  // Thermal receipt animation
  const [receiptTotal, setReceiptTotal] = useState('334.65');
  const [isPrinting, setIsPrinting] = useState(false);
  const printerRunRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const noiseBufRef = useRef<AudioBuffer | null>(null);

  const officialBaseUrl =
    getOfficialAppBaseUrl(saasGlobalConfig.customDomain) || OFFICIAL_SAAS_DOMAIN;

  // Web Audio Context & Sound Synthesis
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        audioCtxRef.current = new AudioCtx();
      }
    }
    if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  };

  const getNoiseBuffer = (ctx: AudioContext) => {
    if (!noiseBufRef.current) {
      noiseBufRef.current = ctx.createBuffer(1, ctx.sampleRate / 2, ctx.sampleRate);
      const data = noiseBufRef.current.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    return noiseBufRef.current;
  };

  const playBurst = (
    ctx: AudioContext,
    t: number,
    len: number,
    fr: number,
    vol: number,
    type: BiquadFilterType = 'bandpass'
  ) => {
    const s = ctx.createBufferSource();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();
    s.buffer = getNoiseBuffer(ctx);
    f.type = type;
    f.frequency.value = fr;
    f.Q.value = 1.4;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f);
    f.connect(g);
    g.connect(ctx.destination);
    s.start(t, Math.random() * 0.3, len + 0.02);
  };

  const playBell = (ctx: AudioContext, t: number, fr: number, vol: number, len: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = fr;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(t);
    o.stop(t + len + 0.05);
  };

  const playCashSound = (startTime?: number) => {
    try {
      const c = getAudioContext();
      if (!c) return;
      const t = startTime || c.currentTime;
      playBurst(c, t, 0.1, 700, 0.6, 'lowpass');
      playBell(c, t + 0.07, 1760, 0.22, 1.1);
      playBell(c, t + 0.07, 2637, 0.12, 0.9);
      playBell(c, t + 0.2, 3520, 0.05, 0.5);
    } catch {
      // Ignore audio policy restrictions
    }
  };

  const playPrintSound = (startTime: number, dur: number, steps: number) => {
    try {
      const c = getAudioContext();
      if (!c) return;
      const m = c.createOscillator();
      const g = c.createGain();
      m.type = 'sawtooth';
      m.frequency.value = 64;
      g.gain.setValueAtTime(0, startTime);
      g.gain.linearRampToValueAtTime(0.05, startTime + 0.12);
      g.gain.setValueAtTime(0.05, startTime + dur - 0.12);
      g.gain.linearRampToValueAtTime(0, startTime + dur);
      m.connect(g);
      g.connect(c.destination);
      m.start(startTime);
      m.stop(startTime + dur);

      for (let i = 0; i < steps; i++) {
        for (let k = 0; k < 3; k++) {
          playBurst(c, startTime + (i * dur) / steps + k * 0.028, 0.022, 2200 + Math.random() * 1800, 0.32);
        }
      }
    } catch {
      // Ignore audio policy restrictions
    }
  };

  const runPrint = (withSound: boolean) => {
    const TOT = 334.65;
    const D = 3.6;
    const DL = 0.4;
    const currentRun = ++printerRunRef.current;

    setIsPrinting(false);

    // Check prefers-reduced-motion
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReceiptTotal(TOT.toFixed(2));
      if (withSound) playCashSound();
      return;
    }

    setTimeout(() => {
      setIsPrinting(true);
      setReceiptTotal('0.00');

      const t0 = performance.now() + (DL + D * 0.72) * 1000;
      const tick = (now: number) => {
        if (currentRun !== printerRunRef.current) return;
        const k = Math.min(Math.max((now - t0) / 700, 0), 1);
        setReceiptTotal((TOT * (1 - Math.pow(1 - k, 3))).toFixed(2));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      if (withSound) {
        const c = getAudioContext();
        if (c) {
          const t = c.currentTime + DL;
          playPrintSound(t, D, 36);
          playCashSound(t + D + 0.1);
        }
      }
    }, 20);
  };

  useEffect(() => {
    // Initial print on load without audio
    runPrint(false);
  }, []);

  const handleSelectPlan = (planId: SaaSDemoRequest['planInterest']) => {
    setSelectedPlanId(planId);
    setIsSent(false);
    const demoEl = document.getElementById('demo');
    if (demoEl) {
      demoEl.scrollIntoView({ behavior: 'smooth' });
    }
    setPlanSelectFlash(true);
    setTimeout(() => setPlanSelectFlash(false), 1000);
  };

  const handleClientCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = normalizeCompanySlug(clientCodeInput);
    if (!cleaned) {
      showToast('Ingresa el código asignado a tu tienda o empresa.', 'warning');
      return;
    }
    setShowClientAccessModal(false);
    onEnterClientStore(cleaned);
  };

  const handleSubmitDemo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNombre = nombre.trim();
    const cleanNegocio = negocio.trim();
    const cleanTel = tel.trim();

    if (!cleanNombre) {
      showToast('Ingresa tu nombre completo.', 'warning');
      return;
    }
    if (!cleanNegocio) {
      showToast('Ingresa el nombre de tu negocio.', 'warning');
      return;
    }
    if (cleanTel.replace(/\D/g, '').length < 8) {
      showToast('Ingresa un número de WhatsApp válido (mínimo 8 dígitos).', 'warning');
      return;
    }

    const planObj = PLANS.find((p) => p.id === selectedPlanId) || PLANS[0];
    const planLabel = `${planObj.n} (L. ${planObj.p})`;

    const randomDigits = Math.floor(1000 + Math.random() * 9000);
    const requestCode = `DEMO-${randomDigits}`;
    const now = Date.now();

    const newReq: SaaSDemoRequest = {
      id: `demo_${now}_${randomDigits}`,
      requestCode,
      contactName: cleanNombre,
      businessName: cleanNegocio,
      phone: cleanTel,
      city: 'Honduras',
      businessType: rubro,
      planInterest: selectedPlanId,
      planLabel,
      notes: msg.trim(),
      status: 'pending',
      createdAt: now,
      dateFormatted: new Date(now).toLocaleString('es-HN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
      updatedAt: now,
    };

    setIsSubmitting(true);
    try {
      await submitSaaSDemoRequest(newReq);
    } catch {
      // Continue even if offline
    } finally {
      setIsSubmitting(false);
    }

    // Build WhatsApp URL
    const rawAdminPhone = (saasGlobalConfig.saasAdminPhone || '').replace(/\D/g, '');
    const adminPhone =
      rawAdminPhone.length === 8
        ? `504${rawAdminPhone}`
        : rawAdminPhone || '50400000000';

    const waText =
      `Hola, quiero solicitar una demo de MIAPPHN.ONLINE.\n` +
      `Plan: ${planObj.n}\n` +
      `Nombre: ${cleanNombre}\n` +
      `Negocio: ${cleanNegocio}\n` +
      `Rubro: ${rubro}\n` +
      `WhatsApp: ${cleanTel}` +
      (msg.trim() ? `\nMensaje: ${msg.trim()}` : '');

    const targetWaUrl = `https://wa.me/${adminPhone}?text=${encodeURIComponent(waText)}`;
    setWaLink(targetWaUrl);
    setIsSent(true);

    playCashSound();
    window.open(targetWaUrl, '_blank', 'noopener,noreferrer');
    showToast('¡Solicitud registrada! Abriendo WhatsApp...', 'success');
  };

  const handleResetForm = () => {
    setNombre('');
    setNegocio('');
    setTel('');
    setMsg('');
    setIsSent(false);
  };

  return (
    <div className="miapphn-landing">
      {/* Embedded Vector Symbol Definition for MIAPPHN Logo */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <symbol id="mlogo" viewBox="0 0 959 200">
          <g transform="scale(0.390625)">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#22e5a6" />
                <stop offset="1" stopColor="#0fb27a" />
              </linearGradient>
            </defs>
            <rect width="512" height="512" rx="116" fill="url(#g)" />
            <g fill="#05231a" fillRule="evenodd">
              <path d="M268,98H354Q372,98 372,116V168Q372,186 354,186H268Q250,186 250,168V116Q250,98 268,98ZM280,138H292Q295,138 295,141V157Q295,160 292,160H280Q277,160 277,157V141Q277,138 280,138ZM308,124H320Q323,124 323,127V157Q323,160 320,160H308Q305,160 305,157V127Q305,124 308,124ZM336,110H348Q351,110 351,113V157Q351,160 348,160H336Q333,160 333,157V113Q333,110 336,110Z" />
              <rect x="292" y="180" width="38" height="52" />
              <path d="M152,240V138L162,124L172,138L182,124L192,138L202,124L212,138L222,124V240ZM170,166H204Q208,166 208,170V170Q208,174 204,174H170Q166,174 166,170V170Q166,166 170,166ZM170,190H204Q208,190 208,194V194Q208,198 204,198H170Q166,198 166,194V194Q166,190 170,190Z" />
              <path d="M160,226H352Q362,226 366,235L396,309Q400,318 390,318H122Q112,318 116,309L146,235Q150,226 160,226ZM197,256a9,9 0 1,0 18,0a9,9 0 1,0 -18,0ZM247,256a9,9 0 1,0 18,0a9,9 0 1,0 -18,0ZM297,256a9,9 0 1,0 18,0a9,9 0 1,0 -18,0ZM197,288a9,9 0 1,0 18,0a9,9 0 1,0 -18,0ZM247,288a9,9 0 1,0 18,0a9,9 0 1,0 -18,0ZM297,288a9,9 0 1,0 18,0a9,9 0 1,0 -18,0Z" />
              <path d="M126,330H386Q408,330 408,352V390Q408,412 386,412H126Q104,412 104,390V352Q104,330 126,330ZM234,360H278Q286,360 286,368V368Q286,376 278,376H234Q226,376 226,368V368Q226,360 234,360Z" />
            </g>
          </g>
          <g transform="translate(238 146.0)">
            <path
              fill="#ffffff"
              d="M9.618181818181819 0.0V-92.0H43.21212121212122L67.18787878787879 -25.78787878787879H67.88484848484849L91.30303030303031 -92.0H123.36363636363637V0.0H102.17575757575759L103.43030303030304 -69.13939393939394H101.8969696969697L75.27272727272728 0.0H56.872727272727275L30.80606060606061 -69.13939393939394H29.272727272727273L30.52727272727273 0.0Z M150.73939393939395 0.0V-92.0H173.60000000000002V0.0Z M193.3090909090909 0.0 224.53333333333336 -92.0H257.43030303030304L288.6545454545455 0.0H264.1212121212121L258.9636363636364 -17.284848484848485H223.00000000000003L217.84242424242427 0.0ZM254.50303030303033 -32.33939393939394 242.09696969696972 -74.43636363636364H239.86666666666667L227.4606060606061 -32.33939393939394Z M308.22424242424245 0.0V-92.0H346.69696969696975Q355.6181818181818 -92.0 362.7969696969697 -89.9090909090909Q369.9757575757576 -87.81818181818183 375.1333333333333 -83.70606060606062Q380.2909090909091 -79.5939393939394 383.0090909090909 -73.25151515151515Q385.72727272727275 -66.9090909090909 385.72727272727275 -58.40606060606061Q385.72727272727275 -47.53333333333334 380.7787878787879 -40.14545454545455Q375.83030303030307 -32.75757575757576 366.1424242424243 -28.993939393939392Q356.4545454545455 -25.23030303030303 341.9575757575758 -25.23030303030303H330.6666666666667V0.0ZM330.6666666666667 -74.85454545454546V-42.515151515151516H345.1636363636364Q354.22424242424245 -42.515151515151516 358.68484848484854 -46.27878787878788Q363.1454545454546 -50.04242424242425 363.1454545454546 -58.96363636363637Q363.1454545454546 -66.76969696969698 359.03333333333336 -70.81212121212121Q354.92121212121214 -74.85454545454546 346.0 -74.85454545454546Z M407.38787878787883 0.0V-92.0H445.8606060606061Q454.7818181818182 -92.0 461.9606060606061 -89.9090909090909Q469.139393939394 -87.81818181818183 474.29696969696977 -83.70606060606062Q479.4545454545455 -79.5939393939394 482.17272727272734 -73.25151515151515Q484.89090909090913 -66.9090909090909 484.89090909090913 -58.40606060606061Q484.89090909090913 -47.53333333333334 479.9424242424243 -40.14545454545455Q474.99393939393946 -32.75757575757576 465.30606060606067 -28.993939393939392Q455.6181818181819 -25.23030303030303 441.1212121212122 -25.23030303030303H429.83030303030307V0.0ZM429.83030303030307 -74.85454545454546V-42.515151515151516H444.32727272727277Q453.38787878787883 -42.515151515151516 457.8484848484849 -46.27878787878788Q462.30909090909097 -50.04242424242425 462.30909090909097 -58.96363636363637Q462.30909090909097 -66.76969696969698 458.19696969696975 -70.81212121212121Q454.0848484848485 -74.85454545454546 445.1636363636364 -74.85454545454546Z"
            />
            <path
              fill="#22e5a6"
              d="M566.4909090909091 0.0V-37.35757575757576H528.9939393939394V0.0H506.5515151515152V-92.0H528.9939393939394V-55.478787878787884H566.4909090909091V-92.0H588.9333333333334V0.0Z M616.309090909091 0.0V-92.0H645.4424242424243L684.8909090909092 -30.24848484848485H686.5636363636364L685.169696969697 -92.0H707.0545454545455V0.0H680.709090909091L638.4727272727273 -65.23636363636363H636.939393939394L638.1939393939394 0.0Z"
            />
          </g>
        </symbol>
      </svg>

      {/* HEADER */}
      <header className="header">
        <div className="wrap flex items-center justify-between gap-4 sm:gap-6">
          <a className="brand flex items-center gap-2.5" href="#top" aria-label="MIAPPHN.ONLINE, ir al inicio">
            <svg className="logo" viewBox="0 0 959 200" role="img" aria-label="MIAPPHN">
              <use href="#mlogo" />
            </svg>
          </a>

          <nav className="nav hidden md:flex items-center gap-6">
            <a href="#planes">Planes y precios</a>
            <a href="#demo">Solicitar demo</a>
            <button
              type="button"
              onClick={() => setShowClientAccessModal(true)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer text-sm font-medium"
            >
              Acceso Clientes
            </button>
          </nav>

          <div className="flex items-center gap-2.5">
            {hasActiveSession && onResumeSession && (
              <button
                type="button"
                onClick={onResumeSession}
                className="btn text-xs py-2 px-3 border-teal-500/40 text-teal-300"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-teal-400 mr-1.5" />
                <span>Mi Sesión ({activeSessionLabel || 'Activa'})</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setShowClientAccessModal(true)}
              className="btn md:hidden text-xs py-2 px-3"
            >
              Acceso Clientes
            </button>

            <a className="btn pri whitespace-nowrap" href="#demo">
              Pedir demo gratis
            </a>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main id="top">
        {/* HERO */}
        <div className="wrap hero">
          <div>
            <h1>Elige el plan ideal para el tamaño de tu negocio o empieza con tu demo gratis</h1>
            <p>
              Todos los planes incluyen tu enlace exclusivo aislado, respaldo en la nube, actualizaciones
              continuas y soporte directo en Honduras.
            </p>
            <div className="cta">
              <a className="btn pri" href="#demo">
                Solicitar demo de 15 días
              </a>
              <a className="btn" href="#planes">
                Ver planes y precios
              </a>
            </div>
            <div className="note">15 días de prueba real, sin compromiso.</div>
          </div>

          <div className="posw">
            <div className={`pos ${isPrinting ? 'print' : ''}`} aria-label="Simulador de factura POS de la app">
              <div className="slot">
                <span className="slot-badge">TÉRMICA 80MM</span>
                <i className="led" title="Impresora conectada"></i>
              </div>
              <div className="paper">
                <div className="ticket-body">
                  {/* Encabezado Tienda */}
                  <div className="tk-center">
                    <div className="tk-store">MIAPPHN • SISTEMA POS</div>
                    <div className="tk-tagline">Tecnología POS y Control Comercial</div>
                    <div className="tk-sub">RTN: 08011990123456</div>
                    <div className="tk-sub">Tegucigalpa, M.D.C., Honduras</div>
                    <div className="tk-sub">Tel: +504 9999-8888</div>
                  </div>

                  <div className="tk-divider"></div>

                  {/* Datos del Comprobante Fiscal */}
                  <div className="tk-center">
                    <div className="tk-doc-type">FACTURA / COMPROBANTE</div>
                  </div>
                  <div className="tk-row">
                    <span className="tk-bold">No:</span>
                    <span>VTA-261020-4647</span>
                  </div>
                  <div className="tk-row">
                    <span>Fecha:</span>
                    <span>02/11/2026 10:45 AM</span>
                  </div>
                  <div className="tk-row">
                    <span>Cliente:</span>
                    <span className="tk-bold">Consumidor Final</span>
                  </div>
                  <div className="tk-row">
                    <span>RTN / ID:</span>
                    <span>08011990123456</span>
                  </div>
                  <div className="tk-row">
                    <span>Atendió:</span>
                    <span>Caja 1 (Admin)</span>
                  </div>

                  <div className="tk-divider"></div>

                  {/* Encabezado de Columnas */}
                  <div className="tk-table-hdr">
                    <span>CANT  DESCRIPCIÓN</span>
                    <span>TOTAL</span>
                  </div>

                  <div className="tk-divider"></div>

                  {/* Artículos con código y precio unitario como en la app */}
                  <div className="tk-items">
                    <div className="tk-item">
                      <div className="tk-item-top">
                        <span className="tk-item-name">2x Aceite Vegetal 1 Litro</span>
                        <span className="tk-item-tot">L. 96.00</span>
                      </div>
                      <div className="tk-item-sub">Cod: ABA-004 @ L. 48.00</div>
                    </div>

                    <div className="tk-item">
                      <div className="tk-item-top">
                        <span className="tk-item-name">1x Arroz Blanco Especial 5 Lbs</span>
                        <span className="tk-item-tot">L. 78.00</span>
                      </div>
                      <div className="tk-item-sub">Cod: GRA-012 @ L. 78.00</div>
                    </div>

                    <div className="tk-item">
                      <div className="tk-item-top">
                        <span className="tk-item-name">3x Refresco Gaseosa 600ml</span>
                        <span className="tk-item-tot">L. 75.00</span>
                      </div>
                      <div className="tk-item-sub">Cod: BEB-008 @ L. 25.00</div>
                    </div>

                    <div className="tk-item">
                      <div className="tk-item-top">
                        <span className="tk-item-name">1x Pan Molde Blanco Familiar</span>
                        <span className="tk-item-tot">L. 42.00</span>
                      </div>
                      <div className="tk-item-sub">Cod: PAN-003 @ L. 42.00</div>
                    </div>
                  </div>

                  <div className="tk-divider"></div>

                  {/* Desglose de Totales */}
                  <div className="tk-row">
                    <span>Subtotal:</span>
                    <span>L. 291.00</span>
                  </div>
                  <div className="tk-row">
                    <span>15% ISV:</span>
                    <span>L. 43.65</span>
                  </div>
                  <div className="tk-row tk-neto">
                    <span className="tk-bold">TOTAL NETO:</span>
                    <span className="tk-neto-val">
                      L. <span id="tot">{receiptTotal}</span>
                    </span>
                  </div>
                  <div className="tk-words">
                    SON: TRESCIENTOS TREINTA Y CUATRO LEMPIRAS CON 65/100 CTS.
                  </div>

                  <div className="tk-divider"></div>

                  {/* Desglose de Pago */}
                  <div className="tk-row">
                    <span>Pago:</span>
                    <span className="tk-bold">Efectivo Contado</span>
                  </div>
                  <div className="tk-row">
                    <span>Efectivo Recibido:</span>
                    <span>L. 500.00</span>
                  </div>
                  <div className="tk-row">
                    <span className="tk-bold">Cambio Entregado:</span>
                    <span className="tk-bold">L. 165.35</span>
                  </div>

                  {/* Sello de Cobrado */}
                  <div className="tk-badge-row">
                    <span className="tk-paid-badge">✓ PAGADO EN CAJA</span>
                  </div>

                  {/* Código QR idéntico al generado por el motor de impresión del sistema */}
                  <div className="tk-qr-wrap">
                    <svg
                      className="tk-qr-svg"
                      viewBox="0 0 100 100"
                      width="72"
                      height="72"
                      shapeRendering="crispEdges"
                    >
                      <rect width="100" height="100" fill="#ffffff" />
                      {/* Patrones de esquina */}
                      <rect x="8" y="8" width="26" height="26" fill="#0f172a" />
                      <rect x="12" y="12" width="18" height="18" fill="#ffffff" />
                      <rect x="16" y="16" width="10" height="10" fill="#0f172a" />
                      <rect x="66" y="8" width="26" height="26" fill="#0f172a" />
                      <rect x="70" y="12" width="18" height="18" fill="#ffffff" />
                      <rect x="74" y="16" width="10" height="10" fill="#0f172a" />
                      <rect x="8" y="66" width="26" height="26" fill="#0f172a" />
                      <rect x="12" y="70" width="18" height="18" fill="#ffffff" />
                      <rect x="16" y="74" width="10" height="10" fill="#0f172a" />
                      {/* Puntos y patrones interiores */}
                      <rect x="40" y="10" width="5" height="5" fill="#0f172a" />
                      <rect x="52" y="10" width="5" height="5" fill="#0f172a" />
                      <rect x="44" y="20" width="5" height="5" fill="#0f172a" />
                      <rect x="56" y="20" width="5" height="5" fill="#0f172a" />
                      <rect x="40" y="30" width="5" height="5" fill="#0f172a" />
                      <rect x="48" y="30" width="5" height="5" fill="#0f172a" />
                      <rect x="10" y="44" width="5" height="5" fill="#0f172a" />
                      <rect x="22" y="44" width="5" height="5" fill="#0f172a" />
                      <rect x="72" y="44" width="5" height="5" fill="#0f172a" />
                      <rect x="84" y="44" width="5" height="5" fill="#0f172a" />
                      <rect x="44" y="44" width="14" height="14" fill="#0f172a" />
                      <rect x="47" y="47" width="8" height="8" fill="#ffffff" />
                      <rect x="50" y="50" width="2" height="2" fill="#0f172a" />
                      <rect x="40" y="68" width="5" height="5" fill="#0f172a" />
                      <rect x="52" y="68" width="5" height="5" fill="#0f172a" />
                      <rect x="70" y="68" width="5" height="5" fill="#0f172a" />
                      <rect x="82" y="68" width="5" height="5" fill="#0f172a" />
                      <rect x="44" y="80" width="5" height="5" fill="#0f172a" />
                      <rect x="56" y="80" width="5" height="5" fill="#0f172a" />
                      <rect x="74" y="80" width="5" height="5" fill="#0f172a" />
                      <rect x="86" y="80" width="5" height="5" fill="#0f172a" />
                    </svg>
                  </div>

                  {/* Pie de ticket */}
                  <div className="tk-center tk-footer">
                    <div className="tk-thanks">¡Gracias por su preferencia!</div>
                    <div className="tk-foot-small">Documento Fiscal Emitido por MIAPPHN POS</div>
                    <div className="tk-foot-url">miapphn.online</div>
                  </div>
                </div>
                {/* Borde dentado de corte térmico */}
                <div className="tear"></div>
              </div>
            </div>

            <button
              className="btn snd"
              id="snd"
              type="button"
              onClick={() => runPrint(true)}
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 9v6h4l5 4V5L8 9H4z" />
                <path d="M16.5 8.5a5 5 0 010 7M19 6a9 9 0 010 12" />
              </svg>
              <span>Imprimir factura con sonido</span>
            </button>
          </div>
        </div>

        {/* PLANES */}
        <section id="planes">
          <div className="wrap">
            <div className="head">
              <h2>Planes transparentes para cada etapa de tu negocio</h2>
              <p>
                Empieza gratis y cambia de plan cuando tu inventario, tus bodegas o tu equipo lo pidan.
              </p>
            </div>

            <div className="plans" id="plans">
              {PLANS.map((p) => (
                <article key={p.id} className={`card ${p.feat ? 'feat' : ''}`}>
                  <div className="t">{p.t}</div>
                  <h3>{p.n}</h3>
                  <div className="d">{p.d}</div>
                  <div className="pr">
                    L. {p.p}
                    <span>{p.per}</span>
                  </div>
                  <div className="lim">{p.l}</div>
                  <ul>
                    {p.f.map((feature, fIdx) => (
                      <li key={fIdx}>
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 10.5l4 4 8-9" />
                        </svg>
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className={`btn ${p.feat ? 'pri' : ''}`}
                    onClick={() => handleSelectPlan(p.id)}
                  >
                    {p.b}
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* DEMO */}
        <section id="demo">
          <div className="wrap demo">
            <div>
              <div className="head" style={{ margin: 0 }}>
                <h2>Pide tu demo y pruébalo con tu propio negocio</h2>
                <p>
                  Déjanos tus datos y te escribimos por WhatsApp para activar tu prueba de 15 días.
                </p>
              </div>
              <ol className="steps">
                <li>
                  <div>
                    <b>Completa el formulario</b>
                    <span>Tu nombre, tu negocio y el plan que te interesa.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Te escribimos por WhatsApp</b>
                    <span>Respondemos desde Honduras y resolvemos tus dudas.</span>
                  </div>
                </li>
                <li>
                  <div>
                    <b>Prueba los 12 módulos</b>
                    <span>Con tu enlace propio y una plantilla inicial según tu rubro.</span>
                  </div>
                </li>
              </ol>
            </div>

            <div className={`form ${isSent ? 'sent' : ''}`} id="box">
              <div className="fm">
                <h3>Solicitud de demo</h3>
                <p>Todos los campos marcados con * son obligatorios.</p>
                <form id="f" onSubmit={handleSubmitDemo}>
                  <div className="g">
                    <label>
                      Nombre completo *
                      <input
                        name="nombre"
                        required
                        autoComplete="name"
                        value={nombre}
                        onChange={(e) => setNombre(e.target.value)}
                        placeholder="Ej. Carlos Hernández"
                      />
                    </label>

                    <label>
                      Nombre del negocio *
                      <input
                        name="negocio"
                        required
                        value={negocio}
                        onChange={(e) => setNegocio(e.target.value)}
                        placeholder="Ej. Tienda El Triunfo"
                      />
                    </label>

                    <label>
                      WhatsApp *
                      <input
                        name="tel"
                        type="tel"
                        required
                        pattern="[0-9+ \-]{8,}"
                        placeholder="9999-9999"
                        autoComplete="tel"
                        value={tel}
                        onChange={(e) => setTel(e.target.value)}
                      />
                    </label>

                    <label>
                      Rubro
                      <select
                        name="rubro"
                        value={rubro}
                        onChange={(e) => setRubro(e.target.value)}
                      >
                        {RUBROS.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="w">
                      Plan de interés
                      <select
                        name="plan"
                        id="plan"
                        value={selectedPlanId}
                        onChange={(e) =>
                          setSelectedPlanId(e.target.value as SaaSDemoRequest['planInterest'])
                        }
                        className={planSelectFlash ? 'flash' : ''}
                      >
                        {PLANS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.n} (L. {p.p})
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="w">
                      Mensaje (opcional)
                      <textarea
                        name="msg"
                        placeholder="Cuéntanos cuántos productos tienes o cuántas personas venden."
                        value={msg}
                        onChange={(e) => setMsg(e.target.value)}
                      ></textarea>
                    </label>
                  </div>

                  <button className="btn pri" type="submit" disabled={isSubmitting}>
                    {isSubmitting ? 'Registrando...' : 'Solicitar demo gratis'}
                  </button>
                </form>
              </div>

              <div className="ok">
                <svg
                  viewBox="0 0 72 72"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="36" cy="36" r="31" />
                  <path d="M23 37l9 9 17-19" />
                </svg>
                <h3>¡Solicitud lista!</h3>
                <p>Abrimos WhatsApp con tu mensaje. Si no se abrió, toca el botón para enviarlo.</p>
                {waLink && (
                  <a
                    className="btn pri"
                    id="wa"
                    href={waLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir WhatsApp
                  </a>
                )}
                <br />
                <button
                  className="btn"
                  id="again"
                  type="button"
                  onClick={handleResetForm}
                >
                  Enviar otra solicitud
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer>
        <div className="wrap fl">
          <div className="flex items-center gap-3">
            <svg className="logo sm" viewBox="0 0 959 200" role="img" aria-label="MIAPPHN">
              <use href="#mlogo" />
            </svg>
            <span>© 2026 MIAPPHN.ONLINE. Soporte directo en Honduras.</span>
          </div>

          <div className="flex items-center gap-4 text-xs font-semibold text-slate-400">
            <button
              type="button"
              onClick={() => setShowClientAccessModal(true)}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Acceso Clientes
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={onOpenSaaSConsole}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Consola SaaS
            </button>
          </div>
        </div>
      </footer>

      {/* CLIENT ACCESS MODAL (Private Company Code Input) */}
      {showClientAccessModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Ingresar a mi Tienda</h3>
                  <p className="text-xs text-slate-400">Acceso privado en MIAPPHN</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowClientAccessModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleClientCodeSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Código único de tu empresa o tienda
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={clientCodeInput}
                  onChange={(e) => setClientCodeInput(e.target.value)}
                  placeholder="Ingresa el código asignado a tu negocio"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 focus:border-emerald-500 focus:outline-hidden text-sm text-white font-mono placeholder:font-sans placeholder:text-slate-500"
                />
                <p className="text-[11px] text-slate-400 mt-1.5">
                  Cada empresa tiene su propio enlace aislado. Escribe tu código para abrir tu pantalla de login exclusiva.
                </p>
              </div>

              <button
                type="submit"
                className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Ir al Login de mi Tienda</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
              <span>¿Aún no tienes cuenta?</span>
              <button
                type="button"
                onClick={() => {
                  setShowClientAccessModal(false);
                  handleSelectPlan('prueba15');
                }}
                className="font-bold text-emerald-400 hover:underline cursor-pointer"
              >
                Solicitar Demo Gratis
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EMBEDDED SCOPED CSS EXACTLY AS PROVIDED BY USER */}
      <style>{`
        @property --a {
          syntax: "<angle>";
          inherits: false;
          initial-value: 0deg;
        }
        .miapphn-landing {
          --ink: #020617;
          --panel: #0f172a;
          --panel2: #1e293b;
          --line: #334155;
          --line-subtle: #1e293b;
          --text: #f8fafc;
          --mut: #94a3b8;
          --brand: #10b981;
          --brand-dark: #059669;
          --brand-mint: #34d399;
          --amber: #f59e0b;
          --teal: #14b8a6;
          --paper: #ffffff;
          --paperink: #0f172a;
          --paperdashed: #cbd5e1;
          color: var(--text);
          font-family: "Hanken Grotesk", system-ui, -apple-system, "Segoe UI", sans-serif;
          min-height: 100vh;
          width: 100%;
          overflow-x: hidden;
          background:
            radial-gradient(900px 520px at 85% -5%, rgba(16, 185, 129, 0.18), transparent 70%),
            radial-gradient(700px 480px at -5% 30%, rgba(20, 184, 166, 0.12), transparent 70%),
            radial-gradient(600px 400px at 50% 90%, rgba(15, 23, 42, 0.8), transparent 80%),
            var(--ink);
        }
        .miapphn-landing h1,
        .miapphn-landing h2,
        .miapphn-landing h3,
        .miapphn-landing .disp {
          font-family: "Bricolage Grotesque", "Hanken Grotesk", system-ui, sans-serif;
          letter-spacing: -0.02em;
          margin: 0;
        }
        .miapphn-landing .wrap {
          max-width: 1180px;
          margin: 0 auto;
          padding: 0 20px;
        }
        .miapphn-landing a {
          color: inherit;
        }
        .miapphn-landing header {
          position: sticky;
          top: 0;
          z-index: 20;
          background: rgba(2, 6, 23, 0.88);
          backdrop-filter: blur(14px);
          border-bottom: 1px solid var(--line-subtle);
        }
        .miapphn-landing header .wrap {
          display: flex;
          align-items: center;
          gap: 24px;
          height: 64px;
        }
        .miapphn-landing .brand {
          display: flex;
          align-items: center;
          gap: 10px;
          font: 800 1.05rem "Bricolage Grotesque", sans-serif;
          text-decoration: none;
        }
        .miapphn-landing nav {
          color: var(--mut);
          font-weight: 500;
        }
        .miapphn-landing nav a {
          text-decoration: none;
          transition: color 0.2s;
        }
        .miapphn-landing nav a:hover {
          color: var(--text);
        }
        .miapphn-landing .btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 12px 22px;
          border-radius: 999px;
          font: 600 0.95rem "Hanken Grotesk", sans-serif;
          border: 1px solid var(--line);
          background: var(--panel2);
          color: var(--text);
          cursor: pointer;
          text-decoration: none;
          transition: transform 0.2s, box-shadow 0.2s, background 0.2s, border-color 0.2s;
        }
        .miapphn-landing .btn:hover {
          transform: translateY(-1px);
          border-color: #475569;
        }
        .miapphn-landing .btn.pri {
          background: var(--brand);
          color: #022c22;
          font-weight: 700;
          border-color: transparent;
        }
        .miapphn-landing .btn.pri:hover {
          background: #34d399;
          box-shadow: 0 10px 30px -8px rgba(16, 185, 129, 0.6);
        }
        /* hero */
        .miapphn-landing .hero {
          display: grid;
          gap: 48px;
          padding: 64px 0 72px;
          align-items: center;
        }
        @media (min-width: 900px) {
          .miapphn-landing .hero {
            grid-template-columns: 1.25fr 1fr;
            padding: 88px 0 96px;
          }
        }
        .miapphn-landing .hero h1 {
          font-size: clamp(2.2rem, 5.2vw, 3.7rem);
          line-height: 1.04;
          font-weight: 800;
          max-width: 15ch;
        }
        .miapphn-landing .hero p {
          color: var(--mut);
          font-size: 1.1rem;
          max-width: 52ch;
          margin: 20px 0 32px;
        }
        .miapphn-landing .cta {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
        }
        .miapphn-landing .note {
          margin-top: 18px;
          color: var(--mut);
          font-size: 0.92rem;
        }
        /* ticket térmico realista POS 80mm */
        .miapphn-landing .posw {
          justify-self: center;
          display: grid;
          gap: 16px;
          justify-items: center;
          width: min(340px, 100%);
        }
        .miapphn-landing .pos {
          width: 100%;
          position: relative;
        }
        .miapphn-landing .snd {
          gap: 10px;
        }
        .miapphn-landing .slot {
          height: 18px;
          border-radius: 8px;
          background: linear-gradient(#1e293b, #0f172a);
          border: 1px solid var(--line);
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.4);
        }
        .miapphn-landing .slot-badge {
          font-size: 0.58rem;
          font-weight: 800;
          color: #94a3b8;
          letter-spacing: 0.08em;
        }
        .miapphn-landing .led {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--brand);
          box-shadow: 0 0 10px var(--brand);
        }
        .miapphn-landing .print .slot {
          animation: shake 0.08s steps(2) 46 0.4s;
        }
        .miapphn-landing .print .led {
          animation: bl 0.18s steps(2) 20 0.4s;
        }
        @keyframes shake {
          50% {
            transform: translateX(1.2px);
          }
        }
        @keyframes bl {
          50% {
            opacity: 0.15;
          }
        }
        .miapphn-landing .paper {
          margin: -4px 12px 0;
          position: relative;
          z-index: 1;
          color: var(--paperink);
          font: 500 0.72rem / 1.38 "Courier New", Courier, ui-monospace, Menlo, Consolas, monospace;
          box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.7);
        }
        .miapphn-landing .print .paper {
          animation: feed 3.6s steps(36) 0.4s both;
        }
        .miapphn-landing .paper > div.ticket-body {
          background: var(--paper);
          padding: 18px 14px 6px;
          border-radius: 2px 2px 0 0;
        }
        .miapphn-landing .tk-center {
          text-align: center;
        }
        .miapphn-landing .tk-store {
          font-size: 0.88rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          color: var(--paperink);
        }
        .miapphn-landing .tk-tagline {
          font-size: 0.65rem;
          opacity: 0.75;
          margin-top: 2px;
        }
        .miapphn-landing .tk-sub {
          font-size: 0.66rem;
          opacity: 0.85;
          line-height: 1.25;
        }
        .miapphn-landing .tk-doc-type {
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          margin: 3px 0 5px;
          color: var(--paperink);
        }
        .miapphn-landing .tk-divider {
          border-top: 1px dashed var(--paperdashed);
          margin: 6px 0;
        }
        .miapphn-landing .tk-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.69rem;
          line-height: 1.35;
        }
        .miapphn-landing .tk-bold {
          font-weight: 700;
        }
        .miapphn-landing .tk-table-hdr {
          display: flex;
          justify-content: space-between;
          font-weight: 800;
          font-size: 0.71rem;
          letter-spacing: 0.03em;
        }
        .miapphn-landing .tk-items {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }
        .miapphn-landing .tk-item-top {
          display: flex;
          justify-content: space-between;
          font-weight: 700;
          font-size: 0.70rem;
        }
        .miapphn-landing .tk-item-sub {
          font-size: 0.63rem;
          opacity: 0.75;
          padding-left: 6px;
        }
        .miapphn-landing .tk-neto {
          border-top: 1.5px solid var(--paperink);
          border-bottom: 1.5px solid var(--paperink);
          margin: 5px 0 4px;
          padding: 4px 0;
          font-size: 0.85rem;
          font-weight: 800;
        }
        .miapphn-landing .tk-neto-val {
          font-weight: 900;
          font-size: 0.95rem;
        }
        .miapphn-landing .tk-words {
          font-size: 0.58rem;
          line-height: 1.25;
          opacity: 0.85;
          margin: 3px 0 2px;
        }
        .miapphn-landing .tk-badge-row {
          display: flex;
          justify-content: center;
          margin: 7px 0 4px;
        }
        .miapphn-landing .tk-paid-badge {
          display: inline-block;
          padding: 2px 8px;
          border: 1.5px solid #059669;
          color: #047857;
          font-weight: 800;
          font-size: 0.66rem;
          letter-spacing: 0.05em;
          border-radius: 4px;
          background: #ecfdf5;
        }
        .miapphn-landing .tk-qr-wrap {
          display: flex;
          justify-content: center;
          margin: 6px 0 4px;
        }
        .miapphn-landing .tk-qr-svg {
          display: block;
        }
        .miapphn-landing .tk-footer {
          margin-top: 4px;
        }
        .miapphn-landing .tk-thanks {
          font-weight: 700;
          font-size: 0.72rem;
          margin-bottom: 2px;
        }
        .miapphn-landing .tk-foot-small {
          font-size: 0.58rem;
          opacity: 0.7;
        }
        .miapphn-landing .tk-foot-url {
          font-size: 0.62rem;
          font-weight: 700;
          color: #047857;
          margin-top: 1px;
        }
        .miapphn-landing .tear {
          height: 14px;
          background:
            linear-gradient(135deg, var(--paper) 50%, transparent 0) 0 0 / 14px 14px,
            linear-gradient(225deg, var(--paper) 50%, transparent 0) 0 0 / 14px 14px;
        }
        @keyframes feed {
          from {
            clip-path: inset(0 0 100% 0);
          }
          to {
            clip-path: inset(0 0 -20px 0);
          }
        }
        /* planes */
        .miapphn-landing section {
          padding: 24px 0 80px;
        }
        .miapphn-landing .head {
          max-width: 60ch;
          margin-bottom: 40px;
        }
        .miapphn-landing .head h2 {
          font-size: clamp(1.8rem, 3.6vw, 2.6rem);
          line-height: 1.1;
          font-weight: 800;
        }
        .miapphn-landing .head p {
          color: var(--mut);
          margin: 14px 0 0;
        }
        .miapphn-landing .plans {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(245px, 1fr));
          gap: 18px;
        }
        .miapphn-landing .card {
          display: flex;
          flex-direction: column;
          padding: 26px 22px 22px;
          border-radius: 18px;
          background: var(--panel);
          border: 1px solid var(--line);
          position: relative;
        }
        .miapphn-landing .card .t {
          color: var(--brand);
          font-size: 0.82rem;
          font-weight: 600;
          margin-bottom: 8px;
        }
        .miapphn-landing .card h3 {
          font-size: 1.3rem;
          font-weight: 800;
        }
        .miapphn-landing .card .d {
          color: var(--mut);
          font-size: 0.9rem;
          margin: 6px 0 18px;
          min-height: 3em;
        }
        .miapphn-landing .pr {
          font: 800 2.5rem "Bricolage Grotesque", sans-serif;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .miapphn-landing .pr span {
          font: 500 0.9rem "Hanken Grotesk", sans-serif;
          color: var(--mut);
          letter-spacing: 0;
          margin-left: 6px;
        }
        .miapphn-landing .lim {
          color: var(--brand);
          font-weight: 600;
          font-size: 0.88rem;
          margin: 8px 0 18px;
          padding-bottom: 18px;
          border-bottom: 1px solid var(--line);
        }
        .miapphn-landing .card ul {
          list-style: none;
          margin: 0 0 24px;
          padding: 0;
          display: grid;
          gap: 11px;
          font-size: 0.92rem;
        }
        .miapphn-landing .card li {
          display: flex;
          gap: 10px;
          color: #cdd9e8;
        }
        .miapphn-landing .card li svg {
          flex: none;
          margin-top: 3px;
          color: var(--brand);
        }
        .miapphn-landing .card .btn {
          margin-top: auto;
          width: 100%;
        }
        .miapphn-landing .feat {
          background: linear-gradient(180deg, rgba(16, 185, 129, 0.12), var(--panel) 60%);
          border-color: transparent;
          box-shadow: 0 30px 80px -30px rgba(16, 185, 129, 0.45);
        }
        .miapphn-landing .feat::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          padding: 1.5px;
          background: conic-gradient(
            from var(--a),
            rgba(16, 185, 129, 0.15) 0 55%,
            var(--brand) 85%,
            rgba(16, 185, 129, 0.15)
          );
          -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          -webkit-mask-composite: xor;
          mask-composite: exclude;
          animation: spin 5s linear infinite;
          pointer-events: none;
        }
        @media (min-width: 1000px) {
          .miapphn-landing .feat {
            transform: translateY(-10px);
          }
        }
        @keyframes spin {
          to {
            --a: 360deg;
          }
        }
        /* demo */
        .miapphn-landing .demo {
          display: grid;
          gap: 40px;
          align-items: start;
        }
        @media (min-width: 900px) {
          .miapphn-landing .demo {
            grid-template-columns: 1fr 1.1fr;
            gap: 64px;
          }
        }
        .miapphn-landing .steps {
          list-style: none;
          padding: 0;
          margin: 28px 0 0;
          display: grid;
          gap: 22px;
          counter-reset: s;
        }
        .miapphn-landing .steps li {
          display: grid;
          grid-template-columns: 36px 1fr;
          gap: 14px;
          counter-increment: s;
        }
        .miapphn-landing .steps li::before {
          content: counter(s);
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid var(--brand);
          color: var(--brand-mint);
          background: rgba(16, 185, 129, 0.12);
          font: 800 1rem "Bricolage Grotesque", sans-serif;
        }
        .miapphn-landing .steps b {
          display: block;
        }
        .miapphn-landing .steps span {
          color: var(--mut);
          font-size: 0.92rem;
        }
        .miapphn-landing .form {
          background: var(--panel);
          border: 1px solid var(--line-subtle);
          border-radius: 22px;
          padding: 28px 24px;
          box-shadow: 0 20px 40px -15px rgba(0,0,0,0.5);
        }
        .miapphn-landing .form h3 {
          font-size: 1.4rem;
          font-weight: 800;
          margin-bottom: 4px;
        }
        .miapphn-landing .form > p {
          color: var(--mut);
          margin: 0 0 22px;
          font-size: 0.92rem;
        }
        .miapphn-landing .g {
          display: grid;
          gap: 14px;
        }
        @media (min-width: 560px) {
          .miapphn-landing .g {
            grid-template-columns: 1fr 1fr;
          }
          .miapphn-landing .g .w {
            grid-column: 1 / -1;
          }
        }
        .miapphn-landing label {
          display: grid;
          gap: 6px;
          font-size: 0.85rem;
          font-weight: 600;
          color: #cdd9e8;
        }
        .miapphn-landing input,
        .miapphn-landing select,
        .miapphn-landing textarea {
          font: 400 1rem "Hanken Grotesk", sans-serif;
          color: var(--text);
          background: var(--ink);
          border: 1px solid var(--line);
          border-radius: 12px;
          padding: 12px 14px;
          width: 100%;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .miapphn-landing input:focus,
        .miapphn-landing select:focus,
        .miapphn-landing textarea:focus {
          outline: none;
          border-color: var(--brand);
          box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.25);
        }
        .miapphn-landing textarea {
          resize: vertical;
          min-height: 84px;
        }
        .miapphn-landing .form .btn {
          width: 100%;
          margin-top: 18px;
          padding: 14px;
        }
        .miapphn-landing .flash {
          animation: fl 1s ease;
        }
        @keyframes fl {
          0%,
          100% {
            box-shadow: 0 0 0 0 transparent;
          }
          30% {
            box-shadow: 0 0 0 5px rgba(16, 185, 129, 0.45);
          }
        }
        .miapphn-landing .ok {
          display: none;
          text-align: center;
          padding: 24px 4px;
        }
        .miapphn-landing .sent .ok {
          display: block;
        }
        .miapphn-landing .sent .fm {
          display: none;
        }
        .miapphn-landing .ok svg {
          width: 72px;
          height: 72px;
          color: var(--brand);
          margin: 0 auto;
        }
        .miapphn-landing .ok circle,
        .miapphn-landing .ok path {
          stroke-dasharray: 200;
          stroke-dashoffset: 200;
          animation: draw 0.9s ease forwards;
        }
        .miapphn-landing .ok path {
          animation-delay: 0.5s;
          stroke-dasharray: 40;
          stroke-dashoffset: 40;
        }
        @keyframes draw {
          to {
            stroke-dashoffset: 0;
          }
        }
        .miapphn-landing .ok h3 {
          margin: 14px 0 6px;
        }
        .miapphn-landing .ok p {
          color: var(--mut);
          margin: 0 0 20px;
        }
        .miapphn-landing .ok .btn + .btn {
          margin-top: 10px;
        }
        .miapphn-landing footer {
          border-top: 1px solid var(--line);
          padding: 28px 0;
          color: var(--mut);
          font-size: 0.9rem;
        }
        .miapphn-landing .logo {
          height: 38px;
          width: auto;
          display: block;
        }
        .miapphn-landing .logo.sm {
          height: 30px;
        }
        .miapphn-landing .fl {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 14px;
        }
        @media (max-width: 480px) {
          .miapphn-landing .logo {
            height: 30px;
          }
          .miapphn-landing .logo.sm {
            height: 26px;
          }
          .miapphn-landing header .wrap {
            gap: 12px;
          }
          .miapphn-landing header .btn {
            padding: 10px 14px;
            font-size: 0.85rem;
          }
        }
      `}</style>
    </div>
  );
};
