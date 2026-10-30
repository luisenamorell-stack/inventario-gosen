import React, { useState, useMemo } from 'react';
import {
  CompanyTenant,
  ActiveTab,
  ALL_COMPANY_MODULES,
  SubscriptionPaymentRecord,
  SaaSAnnouncement,
  SaaSGlobalConfig,
} from '../types';
import { normalizeCompanySlug } from '../firebase/firestoreService';
import {
  Building2,
  Plus,
  Search,
  Copy,
  Check,
  ShieldCheck,
  Lock,
  Unlock,
  Edit2,
  Trash2,
  Key,
  DollarSign,
  Eye,
  EyeOff,
  X,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  RefreshCw,
  Ban,
  Sliders,
  Truck,
  PieChart,
  ShoppingCart,
  List,
  Tag,
  Globe,
  FileText,
  ClipboardCheck,
  Users,
  Activity,
  Store,
  Receipt,
  Megaphone,
  Calendar,
  Printer,
  Download,
  Send,
  Package,
  Clock,
  Sparkles,
  Bell
} from 'lucide-react';
import { WhatsAppIcon } from './SalesView';
import { printHtmlDocument, downloadSaaSReceiptPdf } from '../utils/printPdfService';
import { SecurityAuditPanel } from './SecurityAuditPanel';

export const SAAS_MODULE_OPTIONS: {
  id: ActiveTab;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { id: 'dashboard', label: 'Dashboard y Ganancias', desc: 'Métricas financieras, utilidad neta y resumen', icon: PieChart },
  { id: 'sales', label: 'Ventas y Facturación (POS)', desc: 'Caja registradora, tickets y cobros', icon: ShoppingCart },
  { id: 'inventory', label: 'Control de Inventario', desc: 'Artículos, fotos, tallas y carga Excel', icon: List },
  { id: 'price-checker', label: 'Consultor de Precios', desc: 'Escáner rápido de precios en mostrador', icon: Tag },
  { id: 'catalog', label: 'Catálogo Digital y QR', desc: 'Tienda en línea con pedidos a WhatsApp', icon: Globe },
  { id: 'purchases', label: 'Compras / Facturas', desc: 'Ingreso de mercadería y facturas de compra', icon: FileText },
  { id: 'audit', label: 'Conteo / Auditoría Física', desc: 'Cuadre de inventario físico con escáner', icon: ClipboardCheck },
  { id: 'suppliers', label: 'Directorio Proveedores', desc: 'Agenda y control de proveedores', icon: Truck },
  { id: 'users', label: 'Gestión Colaboradores', desc: 'Creación de cuentas y permisos de empleados', icon: Users },
  { id: 'activity', label: 'Bitácora de Movimientos', desc: 'Historial de auditoría de acciones del personal', icon: Activity },
  { id: 'settings', label: 'Ajustes de Tienda', desc: 'Logo propio, nombre comercial y contraseña', icon: Store },
];

export function getDaysUntilBilling(nextBillingDate?: string): number | null {
  if (!nextBillingDate || !nextBillingDate.trim()) return null;
  const parts = nextBillingDate.trim().split('-');
  if (parts.length !== 3) return null;
  const year = Number(parts[0]);
  const month = Number(parts[1]) - 1;
  const day = Number(parts[2]);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  const target = new Date(year, month, day, 23, 59, 59);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  const diffMs = target.getTime() - todayStart.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function formatShortDateEs(dateStr?: string): string {
  if (!dateStr) return 'Sin fecha';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const m = Number(parts[1]) - 1;
  return `${parts[2]}/${months[m] || parts[1]}/${parts[0]}`;
}

export function computeNextBillingDateFromCurrent(
  currentBillingDate?: string,
  plan: 'mensual' | 'anual' | 'vitalicio' | 'prueba' = 'mensual'
): string {
  if (plan === 'vitalicio') return '';
  let baseDate = new Date();
  if (currentBillingDate && /^\d{4}-\d{2}-\d{2}$/.test(currentBillingDate.trim())) {
    const [y, m, d] = currentBillingDate.trim().split('-').map(Number);
    const parsed = new Date(y, m - 1, d);
    if (!isNaN(parsed.getTime()) && parsed.getTime() > Date.now() - 15 * 86400000) {
      baseDate = parsed;
    }
  }
  const next = new Date(baseDate);
  if (plan === 'anual') {
    next.setFullYear(next.getFullYear() + 1);
  } else if (plan === 'prueba') {
    next.setDate(next.getDate() + 15);
  } else {
    next.setMonth(next.getMonth() + 1);
  }
  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, '0');
  const dd = String(next.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

interface CompaniesSaaSViewProps {
  companies: CompanyTenant[];
  activeCompanyId: string;
  saasGlobalConfig?: SaaSGlobalConfig;
  onSaveCompany: (company: CompanyTenant) => Promise<void>;
  onDeleteCompany: (slug: string) => Promise<void>;
  onSwitchCompany: (slug: string) => void;
  onSaveSaaSGlobalConfig?: (config: SaaSGlobalConfig) => Promise<void>;
  onLockSuperAdmin?: () => void;
  onLogout?: () => void;
  onRefreshCompanies?: () => void;
  isStandalonePortal?: boolean;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const CompaniesSaaSView: React.FC<CompaniesSaaSViewProps> = ({
  companies,
  activeCompanyId,
  saasGlobalConfig,
  onSaveCompany,
  onDeleteCompany,
  onSwitchCompany,
  onSaveSaaSGlobalConfig,
  onLockSuperAdmin,
  onLogout,
  onRefreshCompanies,
  isStandalonePortal = false,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring' | 'suspended'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingCompany, setEditingCompany] = useState<CompanyTenant | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDeleteSlug, setConfirmDeleteSlug] = useState<string | null>(null);
  const [togglingSlug, setTogglingSlug] = useState<string | null>(null);

  // SaaS Master Key state (only for the SaaS Creator/Owner)
  const [saasMasterKey, setSaasMasterKey] = useState<string>(() => {
    try {
      return localStorage.getItem('stockmaster_saas_master_key') || 'SAASMASTER2026';
    } catch {
      return 'SAASMASTER2026';
    }
  });
  const [isEditingMasterKey, setIsEditingMasterKey] = useState(false);
  const [tempMasterKey, setTempMasterKey] = useState(saasMasterKey);

  // SaaS Admin WhatsApp & Warning Days Config
  const [isEditingSaaSContact, setIsEditingSaaSContact] = useState(false);
  const [tempSaaSPhone, setTempSaaSPhone] = useState(saasGlobalConfig?.saasAdminPhone || '');
  const [tempWarningDays, setTempWarningDays] = useState(String(saasGlobalConfig?.expiryWarningDays || 5));

  const handleSaveMasterKey = () => {
    const clean = tempMasterKey.trim().toUpperCase();
    if (clean.length < 6) {
      showToast('La Clave Maestra debe tener al menos 6 caracteres.', 'warning');
      return;
    }
    try {
      localStorage.setItem('stockmaster_saas_master_key', clean);
    } catch {}
    setSaasMasterKey(clean);
    setTempMasterKey(clean);
    setIsEditingMasterKey(false);
    showToast(`Tu Clave Maestra de Administrador SaaS ahora es: ${clean}`, 'success');
  };

  const handleSaveSaaSContactConfig = async () => {
    if (!onSaveSaaSGlobalConfig) return;
    const cleanPhone = tempSaaSPhone.replace(/[^\d+]/g, '').trim();
    const days = Math.max(1, Math.min(30, Number(tempWarningDays) || 5));
    try {
      await onSaveSaaSGlobalConfig({
        saasAdminPhone: cleanPhone,
        saasBrandName: saasGlobalConfig?.saasBrandName || 'Administración SaaS',
        expiryWarningDays: days,
        announcements: saasGlobalConfig?.announcements || [],
        updatedAt: Date.now(),
      });
      setIsEditingSaaSContact(false);
      showToast('Configuración de WhatsApp SaaS y alertas de corte guardada.', 'success');
    } catch {
      showToast('Error al guardar la configuración SaaS.', 'error');
    }
  };

  // Form state for Create/Edit Client
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [plan, setPlan] = useState<'mensual' | 'anual' | 'vitalicio' | 'prueba'>('mensual');
  const [price, setPrice] = useState<string>('600');
  const [nextBillingDate, setNextBillingDate] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [tagline, setTagline] = useState('Control de Inventario y Ventas');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'suspended'>('active');
  const [moraReason, setMoraReason] = useState('');
  const [allowedModules, setAllowedModules] = useState<ActiveTab[]>(ALL_COMPANY_MODULES);
  const [enableDeliveryDvolada, setEnableDeliveryDvolada] = useState<boolean>(false);
  const [maxProducts, setMaxProducts] = useState<string>('0'); // 0 = Ilimitado
  const [maxUsers, setMaxUsers] = useState<string>('0'); // 0 = Ilimitado

  // Quick Permissions & Plan Limits Modal State
  const [permissionsCompany, setPermissionsCompany] = useState<CompanyTenant | null>(null);
  const [permModules, setPermModules] = useState<ActiveTab[]>(ALL_COMPANY_MODULES);
  const [permDeliveryDvolada, setPermDeliveryDvolada] = useState<boolean>(false);
  const [permMaxProducts, setPermMaxProducts] = useState<string>('0');
  const [permMaxUsers, setPermMaxUsers] = useState<string>('0');
  const [isSavingPerms, setIsSavingPerms] = useState<boolean>(false);
  const [showSecurityLabModal, setShowSecurityLabModal] = useState<boolean>(false);

  // Subscription Payment & Receipt Modal State
  const [paymentCompany, setPaymentCompany] = useState<CompanyTenant | null>(null);
  const [payAmount, setPayAmount] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'transferencia' | 'efectivo' | 'tarjeta' | 'otro'>('transferencia');
  const [payReference, setPayReference] = useState<string>('');
  const [payPeriodLabel, setPayPeriodLabel] = useState<string>('');
  const [payNewBillingDate, setPayNewBillingDate] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [isRecordingPayment, setIsRecordingPayment] = useState<boolean>(false);
  const [selectedReceiptToView, setSelectedReceiptToView] = useState<{
    payment: SubscriptionPaymentRecord;
    company: CompanyTenant;
  } | null>(null);
  const [showAllPaymentsModal, setShowAllPaymentsModal] = useState<boolean>(false);

  // Global / Targeted Announcements Modal State
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState<boolean>(false);
  const [annTitle, setAnnTitle] = useState<string>('');
  const [annMessage, setAnnMessage] = useState<string>('');
  const [annType, setAnnType] = useState<'info' | 'warning' | 'update' | 'promo'>('info');
  const [annTarget, setAnnTarget] = useState<string>('all');
  const [isSavingAnnouncement, setIsSavingAnnouncement] = useState<boolean>(false);

  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin + window.location.pathname : '';

  const getCompanyLoginUrl = (companySlug: string) => {
    if (companySlug === 'gosen') return baseUrl;
    return `${baseUrl}?empresa=${companySlug}`;
  };

  const warningDaysThreshold = saasGlobalConfig?.expiryWarningDays || 5;

  const openNewModal = () => {
    setEditingCompany(null);
    setName('');
    setSlug('');
    setOwnerName('');
    setPhone('');
    setEmail('');
    setPlan('mensual');
    setPrice('600');
    const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    setNextBillingDate(nextMonth);
    setAdminPassword(`ADMIN${Math.floor(1000 + Math.random() * 9000)}`);
    setTagline('Control de Inventario y Ventas');
    setAddress('');
    setNotes('');
    setStatus('active');
    setMoraReason('');
    setAllowedModules([...ALL_COMPANY_MODULES]);
    setEnableDeliveryDvolada(false);
    setMaxProducts('0');
    setMaxUsers('0');
    setShowModal(true);
  };

  const openEditModal = (comp: CompanyTenant) => {
    setEditingCompany(comp);
    setName(comp.name);
    setSlug(comp.slug);
    setOwnerName(comp.ownerName || '');
    setPhone(comp.phone || '');
    setEmail(comp.email || '');
    setPlan(comp.plan || 'mensual');
    setPrice(String(comp.price || 0));
    setNextBillingDate(comp.nextBillingDate || '');
    setAdminPassword(comp.adminPassword || '');
    setTagline(comp.tagline || 'Control de Inventario y Ventas');
    setAddress(comp.address || '');
    setNotes(comp.notes || '');
    setStatus(comp.status || 'active');
    setMoraReason(comp.moraReason || '');
    setAllowedModules(
      Array.isArray(comp.allowedModules) && comp.allowedModules.length > 0
        ? [...comp.allowedModules]
        : [...ALL_COMPANY_MODULES]
    );
    setEnableDeliveryDvolada(
      comp.enableDeliveryDvolada !== undefined ? Boolean(comp.enableDeliveryDvolada) : comp.slug === 'gosen'
    );
    setMaxProducts(String(comp.maxProducts || 0));
    setMaxUsers(String(comp.maxUsers || 0));
    setShowModal(true);
  };

  const openPermissionsModal = (comp: CompanyTenant) => {
    setPermissionsCompany(comp);
    setPermModules(
      Array.isArray(comp.allowedModules) && comp.allowedModules.length > 0
        ? [...comp.allowedModules]
        : [...ALL_COMPANY_MODULES]
    );
    setPermDeliveryDvolada(
      comp.enableDeliveryDvolada !== undefined ? Boolean(comp.enableDeliveryDvolada) : comp.slug === 'gosen'
    );
    setPermMaxProducts(String(comp.maxProducts || 0));
    setPermMaxUsers(String(comp.maxUsers || 0));
  };

  const openPaymentModal = (comp: CompanyTenant) => {
    setPaymentCompany(comp);
    setPayAmount(String(comp.price || 600));
    setPayMethod('transferencia');
    setPayReference('');
    const now = new Date();
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    setPayPeriodLabel(`Suscripción ${comp.plan.toUpperCase()} — ${monthNames[now.getMonth()]} ${now.getFullYear()}`);
    setPayNewBillingDate(computeNextBillingDateFromCurrent(comp.nextBillingDate, comp.plan));
    setPayNotes('');
  };

  const handleToggleFormModule = (modId: ActiveTab) => {
    setAllowedModules((prev) =>
      prev.includes(modId) ? prev.filter((m) => m !== modId) : [...prev, modId]
    );
  };

  const handleToggleQuickPermModule = (modId: ActiveTab) => {
    setPermModules((prev) =>
      prev.includes(modId) ? prev.filter((m) => m !== modId) : [...prev, modId]
    );
  };

  const handleSaveQuickPermissions = async () => {
    if (!permissionsCompany) return;
    if (permModules.length === 0) {
      showToast('Selecciona al menos 1 módulo para el cliente.', 'warning');
      return;
    }
    setIsSavingPerms(true);
    try {
      await onSaveCompany({
        ...permissionsCompany,
        allowedModules: permModules,
        enableDeliveryDvolada: permDeliveryDvolada,
        maxProducts: Math.max(0, Number(permMaxProducts) || 0),
        maxUsers: Math.max(0, Number(permMaxUsers) || 0),
      });
      showToast(
        `✅ Permisos y límites actualizados para "${permissionsCompany.name}"`,
        'success'
      );
      setPermissionsCompany(null);
    } catch (err: any) {
      showToast('Error al guardar permisos: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSavingPerms(false);
    }
  };

  const handleRecordSubscriptionPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCompany) return;
    const numericAmount = Math.max(0, Number(payAmount) || 0);
    if (numericAmount <= 0 && paymentCompany.plan !== 'vitalicio') {
      showToast('Ingresa un monto válido para el pago.', 'warning');
      return;
    }

    setIsRecordingPayment(true);
    try {
      const existingHistory = Array.isArray(paymentCompany.paymentHistory)
        ? paymentCompany.paymentHistory
        : [];
      const seqNum = String(existingHistory.length + 1).padStart(3, '0');
      const receiptNumber = `SAAS-${paymentCompany.slug.toUpperCase().slice(0, 4)}-${seqNum}`;
      const now = new Date();
      const newRecord: SubscriptionPaymentRecord = {
        id: `pay_${Date.now()}`,
        receiptNumber,
        companySlug: paymentCompany.slug,
        companyName: paymentCompany.name,
        amount: numericAmount,
        plan: paymentCompany.plan,
        paymentMethod: payMethod,
        reference: payReference.trim(),
        periodLabel: payPeriodLabel.trim() || `Renovación ${paymentCompany.plan}`,
        previousBillingDate: paymentCompany.nextBillingDate || '',
        newBillingDate: payNewBillingDate.trim(),
        paidAt: now.getTime(),
        dateFormatted: now.toLocaleDateString('es-HN', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
        }),
        notes: payNotes.trim(),
      };

      const updatedCompany: CompanyTenant = {
        ...paymentCompany,
        status: 'active',
        moraReason: '',
        suspendedAt: undefined,
        nextBillingDate: payNewBillingDate.trim() || paymentCompany.nextBillingDate,
        paymentHistory: [newRecord, ...existingHistory],
      };

      await onSaveCompany(updatedCompany);
      setPaymentCompany(updatedCompany);
      setSelectedReceiptToView({ payment: newRecord, company: updatedCompany });
      showToast(
        `✅ Pago registrado (${receiptNumber}). Próximo corte actualizado al ${formatShortDateEs(payNewBillingDate)}`,
        'success'
      );
    } catch (err: any) {
      showToast('Error al registrar el pago: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleSendPaymentReceiptWhatsApp = (
    payment: SubscriptionPaymentRecord,
    comp: CompanyTenant
  ) => {
    const msg =
      `🧾 *COMPROBANTE DE PAGO DE SUSCRIPCIÓN SAAS*\n\n` +
      `Hola *${comp.ownerName || comp.name}*, hemos recibido y registrado tu pago exitosamente.\n\n` +
      `• *N° Recibo:* \`${payment.receiptNumber}\`\n` +
      `• *Empresa:* ${comp.name} (\`${comp.slug}\`)\n` +
      `• *Concepto:* ${payment.periodLabel}\n` +
      `• *Monto Pagado:* L. ${payment.amount.toLocaleString('es-HN', { minimumFractionDigits: 2 })}\n` +
      `• *Método:* ${payment.paymentMethod.toUpperCase()}${payment.reference ? ` (Ref: ${payment.reference})` : ''}\n` +
      `• *Estado del Servicio:* ✅ ACTIVO AL DÍA\n` +
      (payment.newBillingDate ? `• *Nueva Fecha de Corte:* *${formatShortDateEs(payment.newBillingDate)}*\n` : '') +
      `\n¡Muchas gracias por tu preferencia! Tu plataforma sigue 100% activa.`;

    const cleanPhone = (comp.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadReceiptPDF = (
    payment: SubscriptionPaymentRecord,
    comp: CompanyTenant
  ) => {
    downloadSaaSReceiptPdf(
      payment,
      comp,
      saasGlobalConfig?.saasBrandName || 'Plataforma de Inventario y Facturación POS'
    );
    showToast(`Comprobante ${payment.receiptNumber}.pdf descargado`, 'success');
  };

  const handlePrintReceiptPDF = (
    payment: SubscriptionPaymentRecord,
    comp: CompanyTenant
  ) => {
    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Recibo SaaS ${payment.receiptNumber} - ${comp.name}</title>
        <style>
          * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
          body { margin: 0; padding: 24px; background: #ffffff; color: #0f172a; }
          .card { max-width: 600px; margin: 0 auto; background: #ffffff; border: 2px solid #cbd5e1; border-radius: 16px; padding: 28px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #f1f5f9; padding-bottom: 18px; margin-bottom: 18px; }
          .badge { display: inline-block; background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
          .title { font-size: 18px; font-weight: 900; margin: 0; color: #0f172a; }
          .subtitle { font-size: 12px; color: #64748b; margin-top: 4px; }
          .row { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px dashed #e2e8f0; font-size: 13px; }
          .label { color: #64748b; font-weight: 600; }
          .val { color: #0f172a; font-weight: 800; text-align: right; }
          .total-box { margin-top: 18px; background: #0f172a; color: #ffffff; padding: 16px 20px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; }
          .next-box { margin-top: 14px; background: #f0fdfa; border: 1px solid #99f6e4; color: #0f766e; padding: 12px 16px; border-radius: 10px; font-size: 13px; font-weight: 700; text-align: center; }
          .footer { margin-top: 20px; text-align: center; font-size: 11px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="header">
            <div>
              <h1 class="title">COMPROBANTE DE SUSCRIPCIÓN SAAS</h1>
              <div class="subtitle">${saasGlobalConfig?.saasBrandName || 'Plataforma de Inventario y Facturación POS'}</div>
            </div>
            <div style="text-align: right;">
              <span class="badge">PAGADO • ACTIVO</span>
              <div style="font-family: monospace; font-weight: 900; font-size: 14px; margin-top: 6px;">${payment.receiptNumber}</div>
              <div style="font-size: 11px; color: #64748b;">Fecha: ${payment.dateFormatted}</div>
            </div>
          </div>

          <div class="row"><span class="label">Empresa / Negocio Cliente:</span><span class="val">${comp.name} (ID: ${comp.slug})</span></div>
          <div class="row"><span class="label">Propietario / Contacto:</span><span class="val">${comp.ownerName || 'Propietario'} ${comp.phone ? `• ${comp.phone}` : ''}</span></div>
          <div class="row"><span class="label">Concepto / Período:</span><span class="val">${payment.periodLabel}</span></div>
          <div class="row"><span class="label">Modalidad de Plan:</span><span class="val" style="text-transform: uppercase;">${payment.plan}</span></div>
          <div class="row"><span class="label">Método de Pago:</span><span class="val" style="text-transform: uppercase;">${payment.paymentMethod} ${payment.reference ? `(${payment.reference})` : ''}</span></div>
          ${payment.previousBillingDate ? `<div class="row"><span class="label">Fecha de Corte Anterior:</span><span class="val">${formatShortDateEs(payment.previousBillingDate)}</span></div>` : ''}
          ${payment.notes ? `<div class="row"><span class="label">Observaciones:</span><span class="val">${payment.notes}</span></div>` : ''}

          <div class="total-box">
            <span style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8;">Total Recibido</span>
            <span style="font-size: 22px; font-weight: 900; color: #34d399;">L. ${payment.amount.toLocaleString('es-HN', { minimumFractionDigits: 2 })}</span>
          </div>

          ${
            payment.newBillingDate
              ? `<div class="next-box">📅 Nueva Fecha de Próximo Corte / Renovación: <strong>${formatShortDateEs(payment.newBillingDate)}</strong></div>`
              : `<div class="next-box">✅ Licencia Vitalicia Activa</div>`
          }

          <div class="footer">
            Recibo generado digitalmente por la Consola Central SaaS • Gracias por su pago.
          </div>
        </div>
      </body>
      </html>
    `;
    printHtmlDocument(html, `Recibo SaaS ${payment.receiptNumber}`, 'letter');
  };

  // Global / Targeted Announcements Handlers
  const handleCreateAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onSaveSaaSGlobalConfig) return;
    if (!annTitle.trim() || !annMessage.trim()) {
      showToast('Escribe el título y el mensaje del comunicado.', 'warning');
      return;
    }
    setIsSavingAnnouncement(true);
    try {
      const newAnn: SaaSAnnouncement = {
        id: `ann_${Date.now()}`,
        title: annTitle.trim(),
        message: annMessage.trim(),
        type: annType,
        targetCompanySlug: annTarget,
        isActive: true,
        createdAt: Date.now(),
        author: 'Administrador SaaS',
      };
      const currentList = saasGlobalConfig?.announcements || [];
      await onSaveSaaSGlobalConfig({
        saasAdminPhone: saasGlobalConfig?.saasAdminPhone || '',
        saasBrandName: saasGlobalConfig?.saasBrandName || 'Administración SaaS',
        expiryWarningDays: saasGlobalConfig?.expiryWarningDays || 5,
        announcements: [newAnn, ...currentList],
        updatedAt: Date.now(),
      });
      setAnnTitle('');
      setAnnMessage('');
      showToast(
        annTarget === 'all'
          ? '📢 Comunicado enviado a TODAS las tiendas activas en tiempo real'
          : `📢 Comunicado enviado a la tienda "${annTarget}"`,
        'success'
      );
    } catch {
      showToast('Error al publicar comunicado.', 'error');
    } finally {
      setIsSavingAnnouncement(false);
    }
  };

  const handleToggleAnnouncementActive = async (annId: string) => {
    if (!onSaveSaaSGlobalConfig || !saasGlobalConfig) return;
    const updated = (saasGlobalConfig.announcements || []).map((a) =>
      a.id === annId ? { ...a, isActive: !a.isActive } : a
    );
    await onSaveSaaSGlobalConfig({
      ...saasGlobalConfig,
      announcements: updated,
      updatedAt: Date.now(),
    });
  };

  const handleDeleteAnnouncement = async (annId: string) => {
    if (!onSaveSaaSGlobalConfig || !saasGlobalConfig) return;
    const updated = (saasGlobalConfig.announcements || []).filter((a) => a.id !== annId);
    await onSaveSaaSGlobalConfig({
      ...saasGlobalConfig,
      announcements: updated,
      updatedAt: Date.now(),
    });
    showToast('Comunicado eliminado.', 'info');
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingCompany) {
      setSlug(normalizeCompanySlug(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanSlug = normalizeCompanySlug(slug || name);
    const cleanPass = adminPassword.trim();

    if (!cleanName) {
      showToast('Ingresa el nombre comercial del negocio.', 'warning');
      return;
    }
    if (!cleanSlug) {
      showToast('Ingresa un código único para la empresa.', 'warning');
      return;
    }
    if (!cleanPass) {
      showToast('Asigna una contraseña de Administrador para este cliente.', 'warning');
      return;
    }
    if (allowedModules.length === 0) {
      showToast('Selecciona al menos un módulo permitido para este cliente.', 'warning');
      return;
    }

    if (!editingCompany && companies.some((c) => c.slug === cleanSlug)) {
      showToast(`El código de empresa "${cleanSlug}" ya está en uso. Elige otro.`, 'error');
      return;
    }

    setIsSaving(true);
    try {
      const safeLogo =
        cleanSlug === 'gosen'
          ? editingCompany?.logoUrl || '/store-logo.jpg'
          : editingCompany?.logoUrl && editingCompany.logoUrl !== '/store-logo.jpg'
          ? editingCompany.logoUrl
          : '';

      const payload: CompanyTenant = {
        id: cleanSlug,
        name: cleanName,
        slug: cleanSlug,
        ownerName: ownerName.trim() || 'Propietario',
        phone: phone.trim(),
        email: email.trim(),
        plan,
        price: Math.max(0, Number(price) || 0),
        nextBillingDate: nextBillingDate.trim(),
        status,
        moraReason:
          status === 'suspended'
            ? moraReason.trim() || 'Mensualidad / Renovación vencida (En Mora)'
            : '',
        suspendedAt: status === 'suspended' ? Date.now() : undefined,
        adminPassword: cleanPass,
        logoUrl: safeLogo,
        tagline: tagline.trim() || 'Control de Inventario y Ventas',
        address: address.trim(),
        notes: notes.trim(),
        allowedModules,
        enableDeliveryDvolada,
        maxProducts: Math.max(0, Number(maxProducts) || 0),
        maxUsers: Math.max(0, Number(maxUsers) || 0),
        paymentHistory: editingCompany?.paymentHistory || [],
        createdAt: editingCompany?.createdAt || Date.now(),
        isPrimary: cleanSlug === 'gosen',
      };

      await onSaveCompany(payload);
      setShowModal(false);
      showToast(
        editingCompany
          ? `Cliente "${cleanName}" actualizado correctamente`
          : `¡Cliente "${cleanName}" creado con su base de datos, límites y funciones personalizadas!`,
        status === 'suspended' ? 'warning' : 'success'
      );
    } catch (err: any) {
      showToast('Error al guardar empresa: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // 1-Click Disable for Mora / Reactivate Client
  const handleToggleMoraStatus = async (comp: CompanyTenant) => {
    const nextStatus = comp.status === 'active' ? 'suspended' : 'active';
    setTogglingSlug(comp.slug);
    try {
      await onSaveCompany({
        ...comp,
        status: nextStatus,
        moraReason:
          nextStatus === 'suspended'
            ? comp.moraReason || 'Servicio en mora por pago/renovación pendiente'
            : '',
        suspendedAt: nextStatus === 'suspended' ? Date.now() : undefined,
      });
      showToast(
        nextStatus === 'active'
          ? `✅ Servicio reactivado para "${comp.name}". Ya pueden entrar a la app.`
          : `⛔ "${comp.name}" puesto EN MORA. Su acceso a la app ha sido deshabilitado inmediatamente.`,
        nextStatus === 'active' ? 'success' : 'warning'
      );
    } catch {
      showToast('No se pudo cambiar el estado del cliente.', 'error');
    } finally {
      setTogglingSlug(null);
    }
  };

  const handleCopyAccessLink = async (comp: CompanyTenant) => {
    const url = getCompanyLoginUrl(comp.slug);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedSlug(comp.slug);
      setTimeout(() => setCopiedSlug(null), 2200);
      showToast(`Enlace de acceso de ${comp.name} copiado`, 'success');
    } catch {
      showToast('No se pudo copiar el enlace', 'error');
    }
  };

  const handleSendCredentialsWhatsApp = (comp: CompanyTenant) => {
    const loginUrl = getCompanyLoginUrl(comp.slug);
    const catalogUrl =
      comp.slug === 'gosen' ? `${baseUrl}?catalogo=1` : `${baseUrl}?empresa=${comp.slug}&catalogo=1`;

    const msg =
      `🚀 *BIENVENIDO A TU SISTEMA DE INVENTARIO Y FACTURACIÓN POS*\n\n` +
      `Hola *${comp.ownerName || comp.name}*, tu plataforma para *${comp.name}* ya está activa y lista para usar con su base de datos privada.\n\n` +
      `🔗 *Enlace directo a tu sistema:*\n${loginUrl}\n\n` +
      `🔑 *Tus datos de ingreso (Administrador):*\n` +
      `• *Código de Empresa:* \`${comp.slug}\`\n` +
      `• *Contraseña Admin:* \`${comp.adminPassword}\`\n\n` +
      `🛍️ *Tu Catálogo Digital para Clientes:*\n${catalogUrl}\n\n` +
      `Desde el módulo *Ajustes Tienda* puedes subir tu logo, cambiar tu contraseña y crear cuentas para tus colaboradores.`;

    const cleanPhone = (comp.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendMoraNoticeWhatsApp = (comp: CompanyTenant) => {
    const msg =
      `⚠️ *AVISO DE SUSPENSIÓN POR MORA — ${comp.name.toUpperCase()}*\n\n` +
      `Hola *${comp.ownerName || comp.name}*, te informamos que el acceso al sistema de inventario y facturación para *${comp.name}* (Código: \`${comp.slug}\`) se encuentra temporalmente *DESHABILITADO POR MORA / PAGO PENDIENTE*.\n\n` +
      `• *Plan:* ${comp.plan.toUpperCase()}\n` +
      `• *Monto pendiente:* L. ${Number(comp.price || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}\n` +
      (comp.nextBillingDate ? `• *Fecha de corte:* ${formatShortDateEs(comp.nextBillingDate)}\n` : '') +
      `\nEn cuanto realices tu pago de renovación, reactivaremos tu acceso de forma inmediata. ¡Tus datos e inventario están 100% resguardados!`;

    const cleanPhone = (comp.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleSendExpiryReminderWhatsApp = (comp: CompanyTenant, daysLeft: number) => {
    const msg =
      `🔔 *RECORDATORIO DE PRÓXIMO VENCIMIENTO — ${comp.name.toUpperCase()}*\n\n` +
      `Hola *${comp.ownerName || comp.name}*, te recordamos cordialmente que la suscripción de tu sistema para *${comp.name}* (\`${comp.slug}\`) ${
        daysLeft < 0
          ? `venció el *${formatShortDateEs(comp.nextBillingDate)}*`
          : daysLeft === 0
          ? `vence *HOY (${formatShortDateEs(comp.nextBillingDate)})*`
          : `vence en *${daysLeft} ${daysLeft === 1 ? 'día' : 'días'}* (${formatShortDateEs(comp.nextBillingDate)})`
      }.\n\n` +
      `• *Cuota de Renovación:* L. ${Number(comp.price || 0).toLocaleString('es-HN', { minimumFractionDigits: 2 })}\n\n` +
      `Por favor envíanos tu comprobante de pago por esta vía para actualizar tu fecha de corte y evitar interrupciones en tu servicio.`;

    const cleanPhone = (comp.phone || '').replace(/\D/g, '');
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;

    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const filteredCompanies = useMemo(() => {
    return companies.filter((c) => {
      if (statusFilter === 'active' && c.status !== 'active') return false;
      if (statusFilter === 'suspended' && c.status !== 'suspended') return false;
      if (statusFilter === 'expiring') {
        const d = getDaysUntilBilling(c.nextBillingDate);
        if (c.status !== 'active' || d === null || d > warningDaysThreshold) return false;
      }
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.slug.toLowerCase().includes(q) ||
        (c.ownerName || '').toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q)
      );
    });
  }, [companies, searchQuery, statusFilter, warningDaysThreshold]);

  const allPaymentsList = useMemo(() => {
    const list: { payment: SubscriptionPaymentRecord; company: CompanyTenant }[] = [];
    companies.forEach((comp) => {
      if (Array.isArray(comp.paymentHistory)) {
        comp.paymentHistory.forEach((pay) => {
          list.push({ payment: pay, company: comp });
        });
      }
    });
    return list.sort((a, b) => b.payment.paidAt - a.payment.paidAt);
  }, [companies]);

  const stats = useMemo(() => {
    const total = companies.length;
    const active = companies.filter((c) => c.status === 'active').length;
    const suspended = companies.filter((c) => c.status === 'suspended').length;
    const expiringSoon = companies.filter((c) => {
      if (c.status !== 'active') return false;
      const d = getDaysUntilBilling(c.nextBillingDate);
      return d !== null && d <= warningDaysThreshold;
    }).length;
    const monthlyRevenue = companies
      .filter((c) => c.status === 'active')
      .reduce((acc, c) => acc + (Number(c.price) || 0), 0);
    const totalHistoricalCollected = allPaymentsList.reduce(
      (acc, item) => acc + (Number(item.payment.amount) || 0),
      0
    );
    return { total, active, suspended, expiringSoon, monthlyRevenue, totalHistoricalCollected };
  }, [companies, warningDaysThreshold, allPaymentsList]);

  const togglePasswordVisibility = (companySlug: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [companySlug]: !prev[companySlug] }));
  };

  const activeAnnouncementsCount = (saasGlobalConfig?.announcements || []).filter(
    (a) => a.isActive
  ).length;

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-100">
      {/* Standalone SaaS Super-Admin Top Header Bar */}
      {isStandalonePortal && (
        <header className="bg-slate-950 text-white px-4 sm:px-6 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0 shadow-md">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/40 flex items-center justify-center text-teal-300 shrink-0">
              <Key className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-black text-sm sm:text-base tracking-wide text-white truncate">
                  CONSOLA CENTRAL SAAS
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  Control y Monetización
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">
                Gestión de clientes, límites por plan, recibos de suscripción, avisos de vencimiento y anuncios globales
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {onRefreshCompanies && (
              <button
                type="button"
                onClick={onRefreshCompanies}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 text-xs font-bold transition-colors cursor-pointer"
                title="Sincronizar lista de clientes desde la nube"
              >
                <RefreshCw className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">Sincronizar</span>
              </button>
            )}
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 text-xs font-extrabold transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4 text-rose-400" />
                <span>Cerrar Sesión SaaS</span>
              </button>
            )}
          </div>
        </header>
      )}

      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 max-w-7xl w-full mx-auto">
        {/* Main Action Header */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-4 sm:p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="w-11 h-11 rounded-2xl bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-600 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Administración SaaS: Planes, Pagos, Avisos de Corte y Comunicados
                </h1>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Controla qué módulos y límites tiene cada tienda, registra sus pagos mensuales con recibo en PDF/WhatsApp y envía anuncios globales.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            <button
              type="button"
              onClick={() => setShowSecurityLabModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-extrabold text-xs border border-emerald-500/40 shadow-xs transition-all cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Probar Blindaje y Seguridad</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAnnouncementsModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-900 font-extrabold text-xs border border-amber-300 transition-all cursor-pointer"
            >
              <Megaphone className="w-4 h-4 text-amber-600" />
              <span>Anuncios a Tiendas</span>
              {activeAnnouncementsCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-amber-600 text-white text-[10px] font-black">
                  {activeAnnouncementsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setShowAllPaymentsModal(true)}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-900 font-extrabold text-xs border border-teal-200 transition-all cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-teal-600" />
              <span>Historial de Pagos ({allPaymentsList.length})</span>
            </button>

            {!isStandalonePortal && onLockSuperAdmin && (
              <button
                type="button"
                onClick={onLockSuperAdmin}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs border border-slate-200 transition-all cursor-pointer"
              >
                <EyeOff className="w-4 h-4 text-slate-600" />
                <span>Salir del Modo SaaS</span>
              </button>
            )}

            <button
              type="button"
              onClick={openNewModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Nuevo Cliente / Empresa</span>
            </button>
          </div>
        </div>

        {/* SaaS Owner Master Key & Automatic Expiry Banner WhatsApp Config Card */}
        <div className="bg-slate-900 text-white rounded-2xl border border-slate-800 p-3.5 sm:p-4 shadow-sm flex flex-col xl:flex-row xl:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 shrink-0 mt-0.5">
              <Bell className="w-4 h-4" />
            </div>
            <div className="text-xs space-y-1">
              <div className="font-extrabold text-teal-300 flex items-center gap-1.5 flex-wrap">
                <span>🔔 Aviso Automático de Próximo Vencimiento en las Tiendas</span>
              </div>
              <p className="text-slate-300 leading-relaxed">
                Cuando a un cliente le falten <strong className="text-amber-300">{warningDaysThreshold} días o menos</strong> para su fecha de corte, le aparecerá un banner en la parte superior de su tienda con un botón directo a tu WhatsApp (<strong className="text-emerald-300">{saasGlobalConfig?.saasAdminPhone || 'Configura tu número →'}</strong>) para enviarte el comprobante de pago.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {/* SaaS Admin WhatsApp & Warning Days Config */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-[11px]">
              <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Tu WhatsApp Cobros SaaS y Aviso Previo:
              </div>
              {!isEditingSaaSContact ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono font-black text-xs text-emerald-400">
                    {saasGlobalConfig?.saasAdminPhone
                      ? `+${saasGlobalConfig.saasAdminPhone}`
                      : 'Sin número'}
                  </span>
                  <span className="text-slate-500">•</span>
                  <span className="font-bold text-amber-300">
                    Avisar {warningDaysThreshold} días antes
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTempSaaSPhone(saasGlobalConfig?.saasAdminPhone || '');
                      setTempWarningDays(String(saasGlobalConfig?.expiryWarningDays || 5));
                      setIsEditingSaaSContact(true);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 cursor-pointer"
                  >
                    Configurar
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    value={tempSaaSPhone}
                    onChange={(e) => setTempSaaSPhone(e.target.value)}
                    placeholder="Ej. 50499887766"
                    className="w-32 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-white"
                    title="Tu número de WhatsApp con código de país (ej. 504...)"
                  />
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={tempWarningDays}
                      onChange={(e) => setTempWarningDays(e.target.value)}
                      className="w-14 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-bold text-amber-300 text-center"
                      title="Días de anticipación para mostrar el banner en la tienda"
                    />
                    <span className="text-[10px] text-slate-400">días</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveSaaSContactConfig}
                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white cursor-pointer"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingSaaSContact(false)}
                    className="px-2 py-1 rounded bg-slate-800 text-[10px] text-slate-400 cursor-pointer"
                  >
                    X
                  </button>
                </div>
              )}
            </div>

            {/* Master Key Config */}
            <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 text-[11px]">
              <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                Tu Clave Maestra (Login SaaS):
              </div>
              {!isEditingMasterKey ? (
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="font-mono font-black text-xs text-amber-400 tracking-wider">
                    {saasMasterKey}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTempMasterKey(saasMasterKey);
                      setIsEditingMasterKey(true);
                    }}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-bold text-slate-300 cursor-pointer"
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    type="text"
                    value={tempMasterKey}
                    onChange={(e) => setTempMasterKey(e.target.value.toUpperCase())}
                    className="w-28 px-2 py-1 rounded bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-white"
                  />
                  <button
                    type="button"
                    onClick={handleSaveMasterKey}
                    className="px-2 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-[10px] font-bold text-white cursor-pointer"
                  >
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingMasterKey(false)}
                    className="px-2 py-1 rounded bg-slate-800 text-[10px] text-slate-400 cursor-pointer"
                  >
                    X
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Compact Metrics Strip */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-2xs px-4 py-3 grid grid-cols-2 lg:grid-cols-5 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 gap-3 sm:gap-0 tabular-nums">
          <div className="flex items-center gap-3 sm:pr-3">
            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Total Empresas
              </div>
              <div className="text-sm sm:text-base font-black text-slate-900">
                {stats.total} Clientes
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 sm:pt-0 sm:px-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Clientes Activos
              </div>
              <div className="text-sm sm:text-base font-black text-emerald-700">
                {stats.active} Activos
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 lg:pt-0 sm:px-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Próximos a Vencer (≤{warningDaysThreshold}d)
              </div>
              <div className="text-sm sm:text-base font-black text-amber-600">
                {stats.expiringSoon} Por Vencer
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 lg:pt-0 sm:px-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <Ban className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                En Mora / Bloqueados
              </div>
              <div className="text-sm sm:text-base font-black text-rose-600">
                {stats.suspended} en Mora
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 lg:pt-0 sm:pl-3 col-span-2 lg:col-span-1">
            <div className="w-9 h-9 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0">
              <DollarSign className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Mensualidad Activa
              </div>
              <div className="text-sm sm:text-base font-black text-teal-700">
                L. {stats.monthlyRevenue.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
              </div>
            </div>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white rounded-xl border border-slate-200/80 p-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 shadow-2xs">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar cliente por nombre de negocio, código, propietario o teléfono..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/70 overflow-x-auto">
            {(['all', 'active', 'expiring', 'suspended'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {st === 'all'
                  ? `Todos (${stats.total})`
                  : st === 'active'
                  ? `Al Día (${stats.active})`
                  : st === 'expiring'
                  ? `Por Vencer (${stats.expiringSoon})`
                  : `En Mora (${stats.suspended})`}
              </button>
            ))}
          </div>
        </div>

        {/* Client Companies List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 pb-8">
          {filteredCompanies.map((comp) => {
            const isPassVisible = !!visiblePasswords[comp.slug];
            const loginUrl = getCompanyLoginUrl(comp.slug);
            const isSuspended = comp.status === 'suspended';
            const isToggling = togglingSlug === comp.slug;
            const daysUntilBilling = getDaysUntilBilling(comp.nextBillingDate);
            const isExpiringSoon =
              !isSuspended &&
              daysUntilBilling !== null &&
              daysUntilBilling <= warningDaysThreshold;
            const paymentCount = Array.isArray(comp.paymentHistory)
              ? comp.paymentHistory.length
              : 0;

            return (
              <div
                key={comp.slug}
                className={`bg-white rounded-2xl border transition-all p-4 flex flex-col justify-between gap-3.5 shadow-xs ${
                  isSuspended
                    ? 'border-rose-300 bg-rose-50/30 ring-1 ring-rose-500/20'
                    : isExpiringSoon
                    ? 'border-amber-300 bg-amber-50/20 ring-1 ring-amber-500/20'
                    : 'border-slate-200/90 hover:border-slate-300'
                }`}
              >
                {/* Top Row: Business Info + Status Badges */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      {comp.logoUrl ? (
                        <img
                          src={comp.logoUrl}
                          alt={comp.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <Building2 className="w-5 h-5 text-slate-500" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <h3 className="font-black text-slate-900 text-sm sm:text-base truncate">
                          {comp.name}
                        </h3>
                        {comp.slug === 'gosen' && (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-indigo-50 text-indigo-700 border border-indigo-200">
                            Tienda Gosén
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5 flex-wrap">
                        <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                          Código: {comp.slug}
                        </span>
                        <span>&bull;</span>
                        <span className="truncate">{comp.ownerName || 'Sin propietario'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-extrabold uppercase tracking-wider shrink-0 flex items-center gap-1 border ${
                      !isSuspended
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}
                  >
                    {!isSuspended ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" /> Activo (Al Día)
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-3 h-3 text-rose-600" /> EN MORA (Bloqueado)
                      </>
                    )}
                  </span>
                </div>

                {/* Mora Alert Banner if Suspended */}
                {isSuspended && (
                  <div className="p-2.5 rounded-xl bg-rose-100/80 border border-rose-200 flex items-center justify-between gap-2 text-xs text-rose-900">
                    <div className="flex items-center gap-2 min-w-0">
                      <Lock className="w-4 h-4 text-rose-600 shrink-0" />
                      <span className="font-bold truncate">
                        {comp.moraReason || 'Acceso bloqueado por mora / falta de pago'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendMoraNoticeWhatsApp(comp)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold text-[11px] shrink-0 cursor-pointer"
                      title="Enviar aviso de suspensión por mora al WhatsApp del cliente"
                    >
                      <WhatsAppIcon className="w-3 h-3" />
                      <span>Aviso Mora</span>
                    </button>
                  </div>
                )}

                {/* Upcoming Expiry Alert Strip */}
                {isExpiringSoon && daysUntilBilling !== null && (
                  <div className="p-2.5 rounded-xl bg-amber-100/80 border border-amber-300 flex items-center justify-between gap-2 text-xs text-amber-950">
                    <div className="flex items-center gap-2 min-w-0">
                      <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                      <span className="font-bold truncate">
                        {daysUntilBilling < 0
                          ? `Fecha de corte venció hace ${Math.abs(daysUntilBilling)} días (${formatShortDateEs(comp.nextBillingDate)})`
                          : daysUntilBilling === 0
                          ? `¡Vence HOY! (${formatShortDateEs(comp.nextBillingDate)})`
                          : `Suscripción vence en ${daysUntilBilling} ${daysUntilBilling === 1 ? 'día' : 'días'} (${formatShortDateEs(comp.nextBillingDate)})`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleSendExpiryReminderWhatsApp(comp, daysUntilBilling)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-bold text-[11px] shrink-0 cursor-pointer"
                      title="Enviar recordatorio de pago por WhatsApp"
                    >
                      <WhatsAppIcon className="w-3 h-3" />
                      <span>Recordar Pago</span>
                    </button>
                  </div>
                )}

                {/* Middle Row: Credentials & Subscription Details */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200/70 text-xs tabular-nums">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Clave Admin Tienda
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="font-mono font-extrabold text-slate-800">
                        {isPassVisible ? comp.adminPassword : '••••••••'}
                      </span>
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(comp.slug)}
                        className="text-slate-400 hover:text-slate-700 cursor-pointer"
                        title={isPassVisible ? 'Ocultar clave' : 'Ver clave'}
                      >
                        {isPassVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Plan / Cuota
                    </span>
                    <div className="font-extrabold text-slate-800 mt-0.5 capitalize">
                      {comp.plan} • L. {Number(comp.price || 0).toLocaleString('es-HN')}
                    </div>
                  </div>

                  <div className="col-span-2 sm:col-span-1">
                    <span className="text-[10px] font-bold uppercase text-slate-400 block">
                      Próximo Corte
                    </span>
                    <div className="font-bold text-slate-800 mt-0.5 truncate">
                      {comp.nextBillingDate ? formatShortDateEs(comp.nextBillingDate) : comp.plan === 'vitalicio' ? 'Vitalicio' : 'Sin fecha'}
                    </div>
                  </div>
                </div>

                {/* Enabled Modules, Plan Limits & Special Features Strip */}
                <div className="p-2.5 rounded-xl bg-teal-50/50 border border-teal-200/70 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-teal-900 bg-white px-2 py-0.5 rounded-md border border-teal-200">
                      <Sliders className="w-3 h-3 text-teal-600" />
                      <span>
                        {Array.isArray(comp.allowedModules) && comp.allowedModules.length > 0
                          ? `${comp.allowedModules.length}/${ALL_COMPANY_MODULES.length} mód.`
                          : `${ALL_COMPANY_MODULES.length}/${ALL_COMPANY_MODULES.length} mód.`}
                      </span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      <Package className="w-3 h-3 text-emerald-600" />
                      <span>
                        Prod: {comp.maxProducts && comp.maxProducts > 0 ? `${comp.maxProducts} máx` : 'Ilimitado'}
                      </span>
                    </span>

                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                      <Users className="w-3 h-3 text-indigo-600" />
                      <span>
                        Colab: {comp.maxUsers && comp.maxUsers > 0 ? `${comp.maxUsers} máx` : 'Ilimitado'}
                      </span>
                    </span>

                    {(comp.enableDeliveryDvolada ?? comp.slug === 'gosen') && (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-orange-100 text-orange-800 border border-orange-200 inline-flex items-center gap-1">
                        <Truck className="w-3 h-3" /> D&apos;VOLADA
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => openPaymentModal(comp)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] transition-colors cursor-pointer shadow-2xs"
                      title="Registrar pago de suscripción y generar recibo en PDF o WhatsApp"
                    >
                      <Receipt className="w-3 h-3" />
                      <span>Pagos / Recibo ({paymentCount})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openPermissionsModal(comp)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-[11px] transition-colors cursor-pointer shadow-2xs"
                      title="Configurar funciones habilitadas y límites de productos/usuarios"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Permisos / Límites</span>
                    </button>
                  </div>
                </div>

                {/* Client Access Link Strip */}
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-100/80 border border-slate-200/80 text-xs">
                  <div className="truncate font-mono text-[11px] text-slate-600">
                    {loginUrl}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyAccessLink(comp)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 font-bold text-[11px] transition-colors cursor-pointer"
                      title="Copiar link de acceso del cliente"
                    >
                      {copiedSlug === comp.slug ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Copiado</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copiar Link</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleSendCredentialsWhatsApp(comp)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] transition-colors cursor-pointer"
                      title="Enviar link y accesos por WhatsApp al cliente"
                    >
                      <WhatsAppIcon className="w-3 h-3" />
                      <span className="hidden sm:inline">Enviar Accesos</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Action Bar — 1-Click Disable for Mora on EVERY Client */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => openEditModal(comp)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    {/* 1-Click Mora Toggle Button */}
                    <button
                      type="button"
                      disabled={isToggling}
                      onClick={() => handleToggleMoraStatus(comp)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-extrabold text-xs transition-all cursor-pointer ${
                        !isSuspended
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                          : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs'
                      }`}
                      title={
                        !isSuspended
                          ? 'Bloquear el acceso a la aplicación para este cliente por mora / falta de pago'
                          : 'Reactivar el acceso a la aplicación para este cliente'
                      }
                    >
                      {!isSuspended ? (
                        <>
                          <Ban className="w-3.5 h-3.5" />
                          <span>{isToggling ? 'Aplicando...' : 'Deshabilitar por Mora'}</span>
                        </>
                      ) : (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>{isToggling ? 'Reactivando...' : 'Reactivar Servicio'}</span>
                        </>
                      )}
                    </button>

                    {comp.slug !== 'gosen' && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteSlug(comp.slug)}
                        className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 transition-colors cursor-pointer"
                        title="Eliminar registro de cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Inspect / Open Client Store Button */}
                  <button
                    type="button"
                    onClick={() => onSwitchCompany(comp.slug)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs shadow-2xs active:scale-95 transition-all cursor-pointer"
                    title="Abrir vista previa del sistema de este cliente"
                  >
                    <span>Ver Tienda</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-400" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Permissions & Plan Limits Modal */}
      {permissionsCompany && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm sm:text-base">
                    Permisos y Límites de Plan — {permissionsCompany.name}
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Define cuántos productos/colaboradores puede registrar y qué funciones verá en su tienda.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPermissionsCompany(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Plan Limits Section (Max Products & Max Users) */}
              <div className="p-4 rounded-2xl bg-indigo-50/60 border border-indigo-200/80 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-black text-indigo-950 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Límites por Plan (Productos y Colaboradores Máximos)</span>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      Usa <strong>0</strong> para ilimitado. Cuando el cliente llegue al tope, el sistema le pedirá subir de plan.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setPermMaxProducts('200');
                        setPermMaxUsers('2');
                        setPermModules(['dashboard', 'sales', 'inventory', 'price-checker', 'settings']);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-200 text-[11px] font-extrabold cursor-pointer"
                    >
                      Plan Básico (200 Prod / 2 Colab)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPermMaxProducts('1000');
                        setPermMaxUsers('5');
                        setPermModules([
                          'dashboard',
                          'sales',
                          'inventory',
                          'price-checker',
                          'catalog',
                          'purchases',
                          'suppliers',
                          'users',
                          'settings',
                        ]);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-950 border border-indigo-300 text-[11px] font-extrabold cursor-pointer"
                    >
                      Plan Comercial (1,000 Prod / 5 Colab)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPermMaxProducts('0');
                        setPermMaxUsers('0');
                        setPermModules([...ALL_COMPANY_MODULES]);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-extrabold cursor-pointer"
                    >
                      Plan Pro (Ilimitado + Todo)
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-indigo-200">
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Máximo de Productos en Inventario (0 = Ilimitado)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={permMaxProducts}
                        onChange={(e) => setPermMaxProducts(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-black text-slate-900"
                      />
                      <span className="text-xs font-bold text-indigo-700 whitespace-nowrap">
                        {Number(permMaxProducts) > 0 ? `Tope: ${permMaxProducts}` : '♾️ Ilimitado'}
                      </span>
                    </div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-indigo-200">
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Máximo de Colaboradores / Cajeros (0 = Ilimitado)
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={permMaxUsers}
                        onChange={(e) => setPermMaxUsers(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 text-sm font-black text-slate-900"
                      />
                      <span className="text-xs font-bold text-indigo-700 whitespace-nowrap">
                        {Number(permMaxUsers) > 0 ? `Tope: ${permMaxUsers}` : '♾️ Ilimitado'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Module Checkboxes Grid */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                    Módulos Habilitados ({permModules.length} de {ALL_COMPANY_MODULES.length})
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setPermModules([...ALL_COMPANY_MODULES])}
                      className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() =>
                        setPermModules(['dashboard', 'sales', 'inventory', 'price-checker', 'settings'])
                      }
                      className="text-[11px] font-bold text-slate-600 hover:underline cursor-pointer"
                    >
                      Solo Básico POS
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SAAS_MODULE_OPTIONS.map((mod) => {
                    const Icon = mod.icon;
                    const isChecked = permModules.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        className={`p-3 rounded-xl border transition-all cursor-pointer flex items-start gap-2.5 select-none ${
                          isChecked
                            ? 'bg-emerald-50/70 border-emerald-400 text-slate-900 shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleQuickPermModule(mod.id)}
                          className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 font-extrabold text-xs text-slate-900">
                            <Icon className={`w-4 h-4 shrink-0 ${isChecked ? 'text-emerald-600' : 'text-slate-400'}`} />
                            <span className="truncate">{mod.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                            {mod.desc}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Special Add-On: Delivery D'VOLADA */}
              <div className="pt-2 border-t border-slate-200">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-2">
                  Funciones Especiales / Integraciones Exclusivas
                </div>
                <label
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 select-none ${
                    permDeliveryDvolada
                      ? 'bg-orange-50/80 border-orange-400 text-slate-900'
                      : 'bg-slate-50 border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={permDeliveryDvolada}
                      onChange={(e) => setPermDeliveryDvolada(e.target.checked)}
                      className="mt-1 rounded text-orange-600 focus:ring-orange-500 w-4 h-4 cursor-pointer shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
                          <Truck className="w-4 h-4 text-orange-600" />
                          Mostrar Convenio de Delivery D&apos;VOLADA en Catálogo Digital
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-200">
                          Por defecto solo Tienda Gosén
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Si está desactivado, la tienda del cliente tendrá envío estándar a domicilio sin mostrar el banner ni el logo de D&apos;VOLADA.
                      </p>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPermissionsCompany(null)}
                className="px-4 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSavingPerms}
                onClick={handleSaveQuickPermissions}
                className="px-5 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
              >
                {isSavingPerms ? 'Guardando...' : 'Guardar Permisos y Límites'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscription Payment & Receipt Modal (Per Client) */}
      {paymentCompany && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm sm:text-base">
                    Pagos y Recibos de Suscripción — {paymentCompany.name}
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Registra el pago mensual/anual, actualiza automáticamente su fecha de corte y genera su comprobante PDF o WhatsApp.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPaymentCompany(null);
                  setSelectedReceiptToView(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
              {/* Record New Payment Form */}
              <form
                onSubmit={handleRecordSubscriptionPayment}
                className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wide text-emerald-950 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    Registrar Nuevo Pago de Suscripción
                  </span>
                  {paymentCompany.status === 'suspended' && (
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-extrabold border border-rose-200">
                      Al guardar se reactivará la tienda automáticamente
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Monto Pagado (L.) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-black text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Método de Pago
                    </label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900"
                    >
                      <option value="transferencia">Transferencia / Depósito</option>
                      <option value="efectivo">Efectivo</option>
                      <option value="tarjeta">Tarjeta</option>
                      <option value="otro">Otro</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Nueva Fecha de Corte *
                    </label>
                    <input
                      type="date"
                      value={payNewBillingDate}
                      onChange={(e) => setPayNewBillingDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-white text-xs font-black text-emerald-900"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Concepto / Mes Pagado
                    </label>
                    <input
                      type="text"
                      value={payPeriodLabel}
                      onChange={(e) => setPayPeriodLabel(e.target.value)}
                      placeholder="Ej. Mensualidad Noviembre 2026"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      N° Referencia / Comprobante Banco
                    </label>
                    <input
                      type="text"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="Ej. BAC-983412"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-mono text-slate-800"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="submit"
                    disabled={isRecordingPayment}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {isRecordingPayment
                        ? 'Registrando...'
                        : 'Registrar Pago y Generar Comprobante'}
                    </span>
                  </button>
                </div>
              </form>

              {/* Newly Generated or Selected Receipt Preview Box */}
              {selectedReceiptToView && selectedReceiptToView.company.slug === paymentCompany.slug && (
                <div className="p-4 rounded-2xl bg-slate-900 text-white border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div>
                      <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-black uppercase">
                        Comprobante Listo • {selectedReceiptToView.payment.receiptNumber}
                      </span>
                      <h4 className="font-black text-sm text-white mt-1">
                        {selectedReceiptToView.payment.periodLabel} — L.{' '}
                        {selectedReceiptToView.payment.amount.toLocaleString('es-HN', {
                          minimumFractionDigits: 2,
                        })}
                      </h4>
                      <p className="text-xs text-slate-300">
                        Nueva fecha de corte actualizada:{' '}
                        <strong className="text-amber-300">
                          {formatShortDateEs(selectedReceiptToView.payment.newBillingDate)}
                        </strong>
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadReceiptPDF(
                            selectedReceiptToView.payment,
                            selectedReceiptToView.company
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Descargar PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handlePrintReceiptPDF(
                            selectedReceiptToView.payment,
                            selectedReceiptToView.company
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-700" />
                        <span>Imprimir</span>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleSendPaymentReceiptWhatsApp(
                            selectedReceiptToView.payment,
                            selectedReceiptToView.company
                          )
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs cursor-pointer"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>Enviar Recibo WhatsApp</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Client Payment History List */}
              <div className="space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Historial de Pagos de {paymentCompany.name} (
                  {(paymentCompany.paymentHistory || []).length})
                </div>

                {!paymentCompany.paymentHistory || paymentCompany.paymentHistory.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                    Aún no hay pagos registrados para este cliente.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {paymentCompany.paymentHistory.map((pay) => (
                      <div
                        key={pay.id}
                        className="p-3 rounded-xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                              {pay.receiptNumber}
                            </span>
                            <span className="font-extrabold text-slate-900">{pay.periodLabel}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5">
                            Pagado el {pay.dateFormatted} • {pay.paymentMethod.toUpperCase()}
                            {pay.reference ? ` (${pay.reference})` : ''} • Nuevo corte:{' '}
                            <strong className="text-slate-700">
                              {formatShortDateEs(pay.newBillingDate)}
                            </strong>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="font-black text-sm text-emerald-700 mr-1">
                            L. {pay.amount.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadReceiptPDF(pay, paymentCompany)}
                            className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 cursor-pointer"
                            title="Descargar PDF directo"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handlePrintReceiptPDF(pay, paymentCompany)}
                            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                            title="Imprimir en cualquier impresora"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendPaymentReceiptWhatsApp(pay, paymentCompany)}
                            className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            title="Reenviar comprobante por WhatsApp"
                          >
                            <WhatsAppIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global All-Clients Payment History Modal */}
      {showAllPaymentsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 border border-teal-400/40 text-teal-300 flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm sm:text-base">
                    Historial General de Pagos y Recibos SaaS
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Total histórico recaudado:{' '}
                    <strong className="text-emerald-300">
                      L.{' '}
                      {stats.totalHistoricalCollected.toLocaleString('es-HN', {
                        minimumFractionDigits: 2,
                      })}
                    </strong>{' '}
                    ({allPaymentsList.length} recibos emitidos)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAllPaymentsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[75vh] overflow-y-auto space-y-2.5">
              {allPaymentsList.length === 0 ? (
                <div className="p-10 text-center text-slate-500 text-xs">
                  Aún no se han registrado pagos de suscripción. Usa el botón &ldquo;Pagos / Recibo&rdquo; en cualquier cliente para registrar su pago.
                </div>
              ) : (
                allPaymentsList.map(({ payment, company }) => (
                  <div
                    key={payment.id}
                    className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-black text-teal-800 bg-white px-2 py-0.5 rounded border border-teal-200">
                          {payment.receiptNumber}
                        </span>
                        <span className="font-black text-slate-900 text-sm">
                          {company.name}
                        </span>
                        <span className="text-slate-500">({payment.periodLabel})</span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Fecha pago: {payment.dateFormatted} • Método: {payment.paymentMethod.toUpperCase()}
                        {payment.reference ? ` • Ref: ${payment.reference}` : ''} • Próximo corte:{' '}
                        <strong className="text-slate-700">
                          {formatShortDateEs(payment.newBillingDate)}
                        </strong>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-black text-sm text-emerald-700 mr-1">
                        L. {payment.amount.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDownloadReceiptPDF(payment, company)}
                        className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintReceiptPDF(payment, company)}
                        className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Imprimir</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendPaymentReceiptWhatsApp(payment, company)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5" />
                        <span>WhatsApp</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Global / Targeted Announcements Modal */}
      {showAnnouncementsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-white text-sm sm:text-base">
                    Mensaje Global / Anuncios del Administrador SaaS
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Envía comunicados o avisos de actualización que aparecerán arriba en el sistema de todas las tiendas o de un cliente específico.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAnnouncementsModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
              <form
                onSubmit={handleCreateAnnouncement}
                className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 space-y-3"
              >
                <div className="text-xs font-black uppercase tracking-wide text-amber-950 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-amber-600" />
                  <span>Publicar Nuevo Comunicado</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Destinatario *
                    </label>
                    <select
                      value={annTarget}
                      onChange={(e) => setAnnTarget(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900"
                    >
                      <option value="all">🌎 Todas las Tiendas Activas</option>
                      {companies.map((c) => (
                        <option key={c.slug} value={c.slug}>
                          🏪 Solo {c.name} ({c.slug})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                      Tipo de Aviso
                    </label>
                    <select
                      value={annType}
                      onChange={(e) => setAnnType(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900"
                    >
                      <option value="info">ℹ️ Comunicado Informativo</option>
                      <option value="update">🚀 Nueva Actualización / Función</option>
                      <option value="warning">⚠️ Aviso Importante / Mantenimiento</option>
                      <option value="promo">🎁 Promoción de Plan SaaS</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                    Título del Comunicado *
                  </label>
                  <input
                    type="text"
                    required
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="Ej. ¡Nueva actualización disponible en tu Punto de Venta!"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-700 mb-1">
                    Mensaje para la(s) Tienda(s) *
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={annMessage}
                    onChange={(e) => setAnnMessage(e.target.value)}
                    placeholder="Escribe el detalle del aviso que verán al abrir su sistema..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-medium text-slate-800"
                  />
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingAnnouncement}
                    className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer inline-flex items-center gap-1.5"
                  >
                    <Megaphone className="w-3.5 h-3.5" />
                    <span>{isSavingAnnouncement ? 'Publicando...' : 'Enviar Comunicado Ahora'}</span>
                  </button>
                </div>
              </form>

              {/* Active & Historical Announcements List */}
              <div className="space-y-2">
                <div className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Comunicados Enviados ({(saasGlobalConfig?.announcements || []).length})
                </div>

                {!saasGlobalConfig?.announcements || saasGlobalConfig.announcements.length === 0 ? (
                  <div className="p-6 text-center bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                    No hay comunicados activos en este momento.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {saasGlobalConfig.announcements.map((ann) => (
                      <div
                        key={ann.id}
                        className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                          ann.isActive
                            ? 'bg-white border-amber-300 shadow-2xs'
                            : 'bg-slate-50 border-slate-200 opacity-60'
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                ann.isActive
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-200 text-slate-600'
                              }`}
                            >
                              {ann.isActive ? 'Visible en Tiendas' : 'Oculto'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {ann.targetCompanySlug === 'all'
                                ? '🌎 Todas las tiendas'
                                : `🏪 Solo: ${ann.targetCompanySlug}`}
                            </span>
                            <span className="font-black text-slate-900">{ann.title}</span>
                          </div>
                          <p className="text-slate-600 leading-relaxed">{ann.message}</p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleToggleAnnouncementActive(ann.id)}
                            className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                          >
                            {ann.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteAnnouncement(ann.id)}
                            className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Eliminar comunicado"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteSlug && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 border border-slate-200 shadow-xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">¿Eliminar este cliente?</h3>
                <p className="text-xs text-slate-500">
                  Se quitará el acceso de la empresa <strong className="text-slate-800">{confirmDeleteSlug}</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteSlug(null)}
                className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDeleteSlug;
                  setConfirmDeleteSlug(null);
                  await onDeleteCompany(target);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold cursor-pointer"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create / Edit Client Company Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-black text-slate-900 text-sm sm:text-base">
                    {editingCompany ? `Editar Cliente: ${editingCompany.name}` : 'Registrar Nuevo Cliente / Empresa'}
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Cada cliente tiene su propio inventario, marca, límites de plan y funciones personalizadas.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Nombre del Negocio *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="Ej. Comercial Rivera"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Código Único (ID de Acceso) *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingCompany}
                    value={slug}
                    onChange={(e) => setSlug(normalizeCompanySlug(e.target.value))}
                    placeholder="ej. rivera"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 font-mono text-xs font-extrabold text-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-60"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Nombre del Dueño / Contacto
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Ej. Carlos Martínez"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    WhatsApp del Cliente
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej. 50499887766"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-amber-50/60 border border-amber-200/80">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-amber-900 mb-1">
                    Contraseña Administrador Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Ej. RIVERA2026"
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white font-mono text-xs font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-amber-900 mb-1">
                    Estado del Servicio (Control de Mora)
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as 'active' | 'suspended')}
                    className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-white text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="active">✅ Activo (Al día - Permitir acceso)</option>
                    <option value="suspended">⛔ En Mora / Suspendido (Bloquear app)</option>
                  </select>
                </div>
              </div>

              {status === 'suspended' && (
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-rose-700 mb-1">
                    Motivo de Mora / Mensaje de Bloqueo para el Cliente
                  </label>
                  <input
                    type="text"
                    value={moraReason}
                    onChange={(e) => setMoraReason(e.target.value)}
                    placeholder="Ej. Mensualidad vencida — Pendiente de pago"
                    className="w-full px-3 py-2 rounded-xl border border-rose-300 bg-rose-50/40 text-xs font-bold text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Modalidad / Plan
                  </label>
                  <select
                    value={plan}
                    onChange={(e) => setPlan(e.target.value as any)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  >
                    <option value="mensual">Mensual</option>
                    <option value="anual">Anual</option>
                    <option value="vitalicio">Pago Único</option>
                    <option value="prueba">Prueba Gratis</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Precio Acordado (L.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Próximo Corte / Pago
                  </label>
                  <input
                    type="date"
                    value={nextBillingDate}
                    onChange={(e) => setNextBillingDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800"
                  />
                </div>
              </div>

              {/* Plan Quotas (Max Products & Max Users) */}
              <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-200 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-black text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    Límites de Capacidad por Plan (0 = Ilimitado)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMaxProducts('200');
                        setMaxUsers('2');
                      }}
                      className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-900 text-[10px] font-extrabold cursor-pointer"
                    >
                      Básico (200 prod / 2 colab)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxProducts('1000');
                        setMaxUsers('5');
                      }}
                      className="px-2 py-0.5 rounded bg-white border border-indigo-200 text-indigo-900 text-[10px] font-extrabold cursor-pointer"
                    >
                      Comercial (1000 / 5)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMaxProducts('0');
                        setMaxUsers('0');
                      }}
                      className="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-extrabold cursor-pointer"
                    >
                      Pro Ilimitado
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                      Máximo de Productos (0 = Sin límite)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxProducts}
                      onChange={(e) => setMaxProducts(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-xs font-black text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-extrabold uppercase text-slate-600 mb-1">
                      Máximo de Colaboradores (0 = Sin límite)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maxUsers}
                      onChange={(e) => setMaxUsers(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-xl border border-indigo-200 bg-white text-xs font-black text-slate-900"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                  Eslogan o Giro del Negocio
                </label>
                <input
                  type="text"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Ej. Calzado, Ropa y Accesorios"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                />
              </div>

              {/* Per-Client Module & Feature Permissions Section */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div>
                    <div className="text-xs font-black text-slate-900 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sliders className="w-3.5 h-3.5 text-teal-600" />
                      <span>Permisos de Funciones ({allowedModules.length}/{ALL_COMPANY_MODULES.length})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setAllowedModules([...ALL_COMPANY_MODULES])}
                      className="px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-900 text-[10px] font-extrabold cursor-pointer"
                    >
                      Marcar Todos
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAllowedModules(['dashboard', 'sales', 'inventory', 'price-checker', 'settings'])
                      }
                      className="px-2 py-1 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-[10px] font-extrabold cursor-pointer"
                    >
                      Solo Básico POS
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {SAAS_MODULE_OPTIONS.map((mod) => {
                    const Icon = mod.icon;
                    const checked = allowedModules.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center gap-2.5 select-none text-xs ${
                          checked
                            ? 'bg-white border-emerald-400 text-slate-900 shadow-2xs'
                            : 'bg-slate-100/70 border-slate-200 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => handleToggleFormModule(mod.id)}
                          className="rounded text-emerald-600 focus:ring-emerald-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                        />
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${checked ? 'text-emerald-600' : 'text-slate-400'}`} />
                        <span className="font-bold truncate">{mod.label}</span>
                      </label>
                    );
                  })}
                </div>

                {/* Delivery D'VOLADA toggle */}
                <label
                  className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 select-none text-xs ${
                    enableDeliveryDvolada
                      ? 'bg-orange-50 border-orange-300 text-orange-950'
                      : 'bg-white border-slate-200 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={enableDeliveryDvolada}
                      onChange={(e) => setEnableDeliveryDvolada(e.target.checked)}
                      className="rounded text-orange-600 focus:ring-orange-500 w-3.5 h-3.5 cursor-pointer shrink-0"
                    />
                    <Truck className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                    <span className="font-bold">
                      Habilitar integración Delivery D&apos;VOLADA en su Catálogo Digital
                    </span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
                    {enableDeliveryDvolada ? 'Activado' : 'Oculto'}
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
                >
                  {isSaving
                    ? 'Guardando...'
                    : editingCompany
                    ? 'Guardar Cambios'
                    : 'Crear Empresa Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Live Security & Penetration Lab Modal for SaaS Admin */}
      {showSecurityLabModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
          <div className="w-full max-w-6xl max-h-[92vh] overflow-y-auto rounded-3xl relative shadow-2xl">
            <div className="sticky top-3 right-3 z-30 flex justify-end px-4 pt-3 pointer-events-none">
              <button
                type="button"
                onClick={() => setShowSecurityLabModal(false)}
                className="pointer-events-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900/95 hover:bg-rose-600 text-white text-xs font-extrabold border border-slate-700 shadow-lg transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Cerrar Laboratorio</span>
              </button>
            </div>
            <div className="-mt-12">
              <SecurityAuditPanel
                storeName={saasGlobalConfig?.saasBrandName || 'Plataforma Central SaaS'}
                companyId={activeCompanyId}
                accessPassword={saasMasterKey}
                inventoryCount={companies.length * 100}
                salesCount={allPaymentsList.length}
                auditHistoryCount={companies.length}
                showToast={showToast}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
