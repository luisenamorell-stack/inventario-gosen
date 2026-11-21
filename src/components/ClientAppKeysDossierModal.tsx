import React, { useState, useEffect, useCallback } from 'react';
import {
  CompanyTenant,
  SaaSGlobalConfig,
  StoreSettings,
  UserAccount,
  WarehouseLocation,
  ActiveTab,
  ALL_COMPANY_MODULES,
  getOfficialAppBaseUrl,
} from '../types';
import {
  exportCompanyFullBackup,
  fetchStoreWarehousesOnce,
  saveUserToFirestore,
  deleteUserFromFirestore,
  saveStoreSettingsToFirestore,
} from '../firebase/firestoreService';
import {
  ClientAppKeysDossierPayload,
  buildClientAppKeysDossierHtml,
  downloadClientAppKeysDossierPdf,
  printHtmlDocument,
  downloadSaaSReceiptPdf,
} from '../utils/printPdfService';
import {
  Key,
  X,
  Copy,
  Check,
  Printer,
  Download,
  RefreshCw,
  ShieldCheck,
  Building2,
  Users,
  Package,
  FileText,
  Database,
  Globe,
  Lock,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Receipt,
  Sliders,
} from 'lucide-react';
import { WhatsAppIcon } from './SalesView';
import { SAAS_MODULE_OPTIONS, formatShortDateEs } from './CompaniesSaaSView';

interface ClientAppKeysDossierModalProps {
  isOpen: boolean;
  initialCompany: CompanyTenant | null;
  companies: CompanyTenant[];
  saasGlobalConfig?: SaaSGlobalConfig;
  onClose: () => void;
  onSaveCompany: (company: CompanyTenant) => Promise<void>;
  onOpenContractModal: (company: CompanyTenant) => void;
  onOpenPaymentModal: (company: CompanyTenant) => void;
  onOpenPermissionsModal: (company: CompanyTenant) => void;
  onDownloadBackupCSV: (company: CompanyTenant) => void;
  onDownloadBackupJSON: (company: CompanyTenant) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const ClientAppKeysDossierModal: React.FC<ClientAppKeysDossierModalProps> = ({
  isOpen,
  initialCompany,
  companies,
  saasGlobalConfig,
  onClose,
  onSaveCompany,
  onOpenContractModal,
  onOpenPaymentModal,
  onOpenPermissionsModal,
  onDownloadBackupCSV,
  onDownloadBackupJSON,
  showToast,
}) => {
  const [selectedSlug, setSelectedSlug] = useState<string>(initialCompany?.slug || 'gosen');
  const [isLoadingDossier, setIsLoadingDossier] = useState<boolean>(false);
  const [storeSettings, setStoreSettings] = useState<StoreSettings | undefined>(undefined);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseLocation[]>([]);
  const [stats, setStats] = useState({
    productsCount: 0,
    suppliersCount: 0,
    salesCount: 0,
    purchasesCount: 0,
  });

  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showMasterPass, setShowMasterPass] = useState<boolean>(true);
  const [editingMasterPass, setEditingMasterPass] = useState<string>('');
  const [isSavingMasterPass, setIsSavingMasterPass] = useState<boolean>(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState<boolean>(false);

  // Quick Create User for this Tenant
  const [showAddUserForm, setShowAddUserForm] = useState<boolean>(false);
  const [newUserName, setNewUserName] = useState<string>('');
  const [newUsername, setNewUsername] = useState<string>('');
  const [newUserPassword, setNewUserPassword] = useState<string>('');
  const [newUserRole, setNewUserRole] = useState<'admin' | 'collaborator'>('collaborator');
  const [isCreatingUser, setIsCreatingUser] = useState<boolean>(false);

  useEffect(() => {
    if (initialCompany?.slug) {
      setSelectedSlug(initialCompany.slug);
    }
  }, [initialCompany]);

  const currentCompany =
    companies.find((c) => c.slug === selectedSlug) || initialCompany || companies[0];

  const loadClientDossier = useCallback(
    async (slugToLoad: string) => {
      if (!slugToLoad) return;
      setIsLoadingDossier(true);
      try {
        const [backup, whData] = await Promise.all([
          exportCompanyFullBackup(slugToLoad),
          fetchStoreWarehousesOnce(slugToLoad),
        ]);
        setStoreSettings(backup.storeSettings);
        setUsers(backup.users || []);
        setWarehouses(whData.warehouses || []);
        setStats({
          productsCount: (backup.inventory || []).length,
          suppliersCount: (backup.suppliers || []).length,
          salesCount: (backup.sales || []).filter((s) => s.status !== 'cancelled').length,
          purchasesCount: (backup.purchases || []).filter((p) => p.status !== 'cancelled').length,
        });
      } catch (err) {
        console.warn('Error loading client dossier:', err);
      } finally {
        setIsLoadingDossier(false);
      }
    },
    []
  );

  useEffect(() => {
    if (isOpen && currentCompany?.slug) {
      setEditingMasterPass(currentCompany.adminPassword || 'ADMIN2026');
      loadClientDossier(currentCompany.slug);
    }
  }, [isOpen, currentCompany?.slug, currentCompany?.adminPassword, loadClientDossier]);

  if (!isOpen || !currentCompany) return null;

  const baseUrl = getOfficialAppBaseUrl(saasGlobalConfig?.customDomain);
  const loginUrl =
    currentCompany.slug === 'gosen'
      ? `${baseUrl}/`
      : `${baseUrl}/?empresa=${encodeURIComponent(currentCompany.slug)}`;
  const catalogUrl = `${baseUrl}/?empresa=${encodeURIComponent(currentCompany.slug)}&catalogo=1`;

  const qrSystemUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    loginUrl
  )}`;
  const qrCatalogUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
    catalogUrl
  )}`;

  const enabledModules: ActiveTab[] =
    Array.isArray(currentCompany.allowedModules) && currentCompany.allowedModules.length > 0
      ? currentCompany.allowedModules
      : ALL_COMPANY_MODULES;

  const dossierPayload: ClientAppKeysDossierPayload = {
    company: currentCompany,
    saasGlobalConfig,
    loginUrl,
    catalogUrl,
    storeSettings,
    users,
    warehouses,
    stats,
  };

  const handleCopyText = (key: string, text: string, label: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedField(key);
    showToast(`${label} copiado al portapapeles`, 'success');
    setTimeout(() => setCopiedField(null), 2200);
  };

  const handleUpdateMasterPassword = async () => {
    const cleanPass = editingMasterPass.trim();
    if (!cleanPass) {
      showToast('Escribe una contraseña válida', 'error');
      return;
    }
    setIsSavingMasterPass(true);
    try {
      const updatedCompany: CompanyTenant = {
        ...currentCompany,
        adminPassword: cleanPass,
      };
      await onSaveCompany(updatedCompany);
      if (storeSettings) {
        const nextSettings: StoreSettings = {
          ...storeSettings,
          companyId: currentCompany.slug,
          accessPassword: cleanPass,
        };
        await saveStoreSettingsToFirestore(nextSettings, currentCompany.slug);
        setStoreSettings(nextSettings);
      }
      showToast(
        `Llave maestra de ${currentCompany.name} actualizada y sincronizada: ${cleanPass}`,
        'success'
      );
    } catch {
      showToast('No se pudo actualizar la contraseña maestra', 'error');
    } finally {
      setIsSavingMasterPass(false);
    }
  };

  const handleCreateTenantUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUsername.trim() || !newUserPassword.trim()) {
      showToast('Completa nombre, usuario y contraseña del colaborador/admin', 'error');
      return;
    }
    setIsCreatingUser(true);
    try {
      const defaultTabs: ActiveTab[] =
        newUserRole === 'admin'
          ? enabledModules
          : (['sales', 'inventory', 'warehouses', 'price-checker', 'catalog'].filter((t) =>
              enabledModules.includes(t as ActiveTab)
            ) as ActiveTab[]);

      const newUser: UserAccount = {
        id: `usr_${Date.now()}`,
        companyId: currentCompany.slug,
        name: newUserName.trim(),
        username: newUsername.trim().toLowerCase().replace(/\s+/g, ''),
        password: newUserPassword.trim(),
        role: newUserRole,
        isActive: true,
        allowedTabs: defaultTabs,
        salesPermissions: {
          canEditSales: true,
          canCancelSales: newUserRole === 'admin',
          canViewCostsAndProfits: newUserRole === 'admin',
        },
        createdAt: Date.now(),
      };

      await saveUserToFirestore(newUser, currentCompany.slug);
      setUsers((prev) => [...prev, newUser]);
      setNewUserName('');
      setNewUsername('');
      setNewUserPassword('');
      setShowAddUserForm(false);
      showToast(`Usuario @${newUser.username} creado para ${currentCompany.name}`, 'success');
    } catch {
      showToast('Error al crear usuario para el cliente', 'error');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const handleDeleteTenantUser = async (user: UserAccount) => {
    try {
      await deleteUserFromFirestore(user.id, currentCompany.slug);
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      showToast(`Usuario @${user.username} eliminado`, 'info');
    } catch {
      showToast('No se pudo eliminar el usuario', 'error');
    }
  };

  const buildFullTextDossier = (): string => {
    const brand = saasGlobalConfig?.saasBrandName || 'MIAPPHN.ONLINE';
    const userLines =
      users.length === 0
        ? '• (Sin colaboradores adicionales creados; puede crearlos en el módulo Colaboradores)'
        : users
            .map(
              (u) =>
                `• *${u.name}* (${u.role === 'admin' ? 'Administrador' : 'Colaborador'}) -> Usuario: *@${
                  u.username
                }* | Clave: *${u.password}*`
            )
            .join('\n');

    const whLines =
      warehouses.length === 0
        ? '• BOD-01: Tienda Principal / Piso de Venta'
        : warehouses
            .map((w) => `• *${w.code} - ${w.name}*${w.isMainSalesFloor ? ' (Caja Principal)' : ''}`)
            .join('\n');

    const modNames = SAAS_MODULE_OPTIONS.filter((m) => enabledModules.includes(m.id))
      .map((m) => m.label)
      .join(', ');

    const activeBanks = saasGlobalConfig?.bankAccounts || [];
    const bankLines =
      activeBanks.length > 0
        ? `\n🏦 *CUENTAS OFICIALES PARA RENOVACIÓN DE SUSCRIPCIÓN:*\n` +
          activeBanks
            .map((b) => `• *${b.bankName}*: ${b.accountNumber} (${b.accountType} - ${b.holderName})`)
            .join('\n')
        : '';

    return (
      `🔑 *ENTREGA OFICIAL DE LLAVES, CREDENCIALES Y EXPEDIENTE DE SU APP*\n` +
      `*${brand}*\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `🏢 *DATOS DE LA EMPRESA CLIENTE:*\n` +
      `• Negocio: *${currentCompany.name}*\n` +
      `• Titular / Representante: *${currentCompany.ownerName || 'Administración'}*\n` +
      `• Código Único de Empresa (ID): *${currentCompany.slug}*\n` +
      `• Plan Activo: *Plan ${currentCompany.plan.toUpperCase()} (L. ${Number(
        currentCompany.price || 0
      ).toLocaleString('es-HN')})*\n` +
      `• Próximo Corte: *${
        currentCompany.nextBillingDate
          ? formatShortDateEs(currentCompany.nextBillingDate)
          : 'Licencia Vitalicia'
      }*\n\n` +
      `🌐 *ENLACES OFICIALES DE ACCESO:*\n` +
      `1️⃣ *Sistema POS y Administración:*\n${loginUrl}\n\n` +
      `2️⃣ *Catálogo Digital Público y Pedidos WhatsApp:*\n${catalogUrl}\n\n` +
      `🔐 *LLAVES MAESTRAS DE ADMINISTRADOR:*\n` +
      `• Código de Empresa: *${currentCompany.slug}*\n` +
      `• Contraseña Maestra Admin: *${currentCompany.adminPassword}*\n` +
      `• Contraseña en Ajustes de Tienda: *${
        storeSettings?.accessPassword || currentCompany.adminPassword
      }*\n\n` +
      `👥 *USUARIOS Y COLABORADORES REGISTRADOS (${users.length + 1}):*\n` +
      `• *Administrador Maestro* -> Código: *${currentCompany.slug}* | Clave: *${currentCompany.adminPassword}*\n` +
      `${userLines}\n\n` +
      `🏬 *BODEGAS Y SUCURSALES CONFIGURADAS:*\n` +
      `${whLines}\n\n` +
      `📊 *ESTADO DE SU BASE DE DATOS EN LA NUBE:*\n` +
      `• Artículos en Inventario: *${stats.productsCount} SKUs*\n` +
      `• Proveedores: *${stats.suppliersCount}* | Ventas: *${stats.salesCount}* | Compras: *${stats.purchasesCount}*\n` +
      `• Módulos Habilitados (${enabledModules.length}): ${modNames}` +
      `${bankLines}\n\n` +
      `✅ *Sus llaves y base de datos en tiempo real están 100% activas y listas para operar.*`
    );
  };

  const handleSendFullDossierWhatsApp = () => {
    const text = buildFullTextDossier();
    const cleanPhone = (currentCompany.phone || storeSettings?.phone || '').replace(/\D/g, '');
    const formattedPhone = cleanPhone.length === 8 ? `504${cleanPhone}` : cleanPhone;
    const waUrl = formattedPhone
      ? `https://api.whatsapp.com/send?phone=${formattedPhone}&text=${encodeURIComponent(text)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      await downloadClientAppKeysDossierPdf(dossierPayload);
      showToast(`PDF de Entrega de Llaves generado para ${currentCompany.name}`, 'success');
    } catch (err) {
      console.error('Error generating keys dossier PDF:', err);
      showToast('No se pudo generar el PDF de llaves', 'error');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrintDossier = () => {
    const html = buildClientAppKeysDossierHtml(dossierPayload, 'letter');
    printHtmlDocument(
      html,
      `Entrega de Llaves y Expediente - ${currentCompany.name}`,
      'letter'
    );
  };

  const lastPayment =
    currentCompany.paymentHistory && currentCompany.paymentHistory.length > 0
      ? currentCompany.paymentHistory[0]
      : null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden my-auto">
        {/* Top Executive Header */}
        <div className="bg-slate-950 text-white px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 shadow-inner">
              <Key className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black uppercase tracking-wider">
                  Entrega Oficial SaaS
                </span>
                <h2 className="font-black text-white text-sm sm:text-lg truncate">
                  Kit de Llaves, Credenciales, Accesos y Expediente — {currentCompany.name}
                </h2>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                Entrega al cliente sus enlaces oficiales, contraseñas maestras, usuarios, bodegas, contrato y respaldos en un solo expediente profesional.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <select
              value={currentCompany.slug}
              onChange={(e) => setSelectedSlug(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs font-extrabold text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              title="Cambiar de empresa cliente"
            >
              {companies.map((c) => (
                <option key={c.slug} value={c.slug}>
                  🏢 {c.name} ({c.slug})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => loadClientDossier(currentCompany.slug)}
              disabled={isLoadingDossier}
              className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 cursor-pointer"
              title="Recargar datos en vivo del cliente"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingDossier ? 'animate-spin text-emerald-400' : ''}`} />
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-900 hover:bg-rose-600 text-slate-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Primary Action Bar (PDF, Print, WhatsApp, Copy All) */}
        <div className="bg-slate-900 px-4 sm:px-6 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isGeneratingPdf}
              onClick={handleDownloadPdf}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              <span>
                {isGeneratingPdf
                  ? 'Generando PDF...'
                  : 'Descargar PDF (Acta de Entrega de Llaves)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handlePrintDossier}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-extrabold text-xs shadow-sm transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-700" />
              <span>Imprimir Expediente (Carta)</span>
            </button>

            <button
              type="button"
              onClick={handleSendFullDossierWhatsApp}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer"
            >
              <WhatsAppIcon className="w-4 h-4" />
              <span>Enviar Llaves y Accesos por WhatsApp</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() =>
              handleCopyText('full_dossier', buildFullTextDossier(), 'Expediente completo de llaves')
            }
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-extrabold text-xs transition-all cursor-pointer"
          >
            {copiedField === 'full_dossier' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>¡Expediente Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copiar Todo el Texto</span>
              </>
            )}
          </button>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 bg-slate-50">
          {/* SECTION 1: MASTER KEYS, OFFICIAL LINKS & QR CODES */}
          <div className="bg-white rounded-2xl border-2 border-emerald-500/80 shadow-xs p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-black">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                    1. Llaves Maestras de la App, Contraseñas y Enlaces Oficiales
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Credenciales principales de propietario/administrador y ligas directas de ingreso para PC, Tablet y Celular.
                  </p>
                </div>
              </div>
              <span
                className={`px-2.5 py-1 rounded-lg text-[11px] font-black uppercase border ${
                  currentCompany.status === 'suspended'
                    ? 'bg-rose-100 text-rose-800 border-rose-300'
                    : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                }`}
              >
                {currentCompany.status === 'suspended' ? '⛔ Servicio Suspendido' : '✅ Licencia Activa'}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
              {/* Left 2 Columns: Links & Master Credentials */}
              <div className="lg:col-span-2 space-y-3">
                {/* POS System URL */}
                <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase text-emerald-800 block">
                      Enlace Oficial del Sistema POS, Inventario y Administración
                    </span>
                    <div className="font-mono font-black text-xs sm:text-sm text-slate-900 break-all mt-0.5">
                      {loginUrl}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyText('pos_url', loginUrl, 'Link del Sistema POS')}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-extrabold text-xs inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'pos_url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copiar</span>
                    </button>
                    <a
                      href={loginUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white"
                      title="Abrir enlace en pestaña nueva"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Public Digital Catalog URL */}
                <div className="p-3 rounded-xl bg-indigo-50/60 border border-indigo-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase text-indigo-800 block">
                      Enlace Público del Catálogo Digital y Pedidos a WhatsApp
                    </span>
                    <div className="font-mono font-bold text-xs text-indigo-950 break-all mt-0.5">
                      {catalogUrl}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyText('cat_url', catalogUrl, 'Link del Catálogo Digital')}
                      className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 font-extrabold text-xs inline-flex items-center gap-1 cursor-pointer"
                    >
                      {copiedField === 'cat_url' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>Copiar</span>
                    </button>
                    <a
                      href={catalogUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white"
                      title="Abrir catálogo digital"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Master Company Code & Admin Password Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Company Slug */}
                  <div className="p-3.5 rounded-xl bg-slate-900 text-white border border-slate-800 flex flex-col justify-between gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-extrabold uppercase text-slate-400">
                        Código Único de Empresa (ID)
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText('slug', currentCompany.slug, 'Código de empresa')
                        }
                        className="text-[11px] font-bold text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        {copiedField === 'slug' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        <span>Copiar ID</span>
                      </button>
                    </div>
                    <div className="font-mono font-black text-lg text-emerald-400 tracking-wide">
                      {currentCompany.slug}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Identificador exclusivo de su base de datos en la nube.
                    </div>
                  </div>

                  {/* Master Admin Password + Quick Update */}
                  <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-300 flex flex-col justify-between gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase text-amber-900">
                        Contraseña Maestra Admin
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setShowMasterPass((v) => !v)}
                          className="text-amber-800 hover:text-slate-900 cursor-pointer"
                          title="Mostrar / ocultar clave"
                        >
                          {showMasterPass ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleCopyText(
                              'admin_pass',
                              currentCompany.adminPassword,
                              'Contraseña maestra'
                            )
                          }
                          className="text-[11px] font-extrabold text-amber-900 hover:underline inline-flex items-center gap-1 cursor-pointer"
                        >
                          {copiedField === 'admin_pass' ? (
                            <Check className="w-3 h-3 text-emerald-700" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                          <span>Copiar</span>
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <input
                        type={showMasterPass ? 'text' : 'password'}
                        value={editingMasterPass}
                        onChange={(e) => setEditingMasterPass(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-amber-300 font-mono font-black text-sm text-slate-900"
                      />
                      {editingMasterPass.trim() !== currentCompany.adminPassword && (
                        <button
                          type="button"
                          disabled={isSavingMasterPass}
                          onClick={handleUpdateMasterPassword}
                          className="px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-[11px] shrink-0 cursor-pointer"
                        >
                          {isSavingMasterPass ? '...' : 'Guardar'}
                        </button>
                      )}
                    </div>

                    <div className="text-[10px] text-amber-900/80 flex items-center justify-between">
                      <span>
                        Clave en Ajustes:{' '}
                        <strong className="font-mono">
                          {storeSettings?.accessPassword || currentCompany.adminPassword}
                        </strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Official QR Codes */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3.5 flex flex-col justify-between gap-3">
                <div className="text-[11px] font-black uppercase text-slate-700 text-center">
                  Códigos QR Oficiales del Cliente
                </div>
                <div className="grid grid-cols-2 gap-2.5 items-center text-center">
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                    <img
                      src={qrSystemUrl}
                      alt="QR Sistema POS"
                      className="w-24 h-24 mx-auto object-contain"
                    />
                    <div className="text-[10px] font-black text-slate-800 mt-1.5">
                      QR Sistema POS
                    </div>
                    <div className="text-[9px] text-slate-500">Acceso Cajeros/Admin</div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                    <img
                      src={qrCatalogUrl}
                      alt="QR Catálogo Digital"
                      className="w-24 h-24 mx-auto object-contain"
                    />
                    <div className="text-[10px] font-black text-indigo-800 mt-1.5">
                      QR Catálogo Web
                    </div>
                    <div className="text-[9px] text-slate-500">Para sus Clientes</div>
                  </div>
                </div>
                <div className="text-[10px] text-slate-500 text-center">
                  Incluidos automáticamente al imprimir o descargar el Acta PDF.
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: CLIENT USERS, ADMINS & COLLABORATORS CREDENTIALS */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-black text-slate-900 text-sm uppercase tracking-wide">
                    2. Cuentas de Usuarios, Administradores y Colaboradores ({users.length + 1})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Listado de todos los usuarios y contraseñas de la tienda. Puedes dejarle creados sus usuarios desde aquí.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddUserForm((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{showAddUserForm ? 'Cerrar Formulario' : 'Crear Usuario para este Cliente'}</span>
              </button>
            </div>

            {/* Quick Add User Form */}
            {showAddUserForm && (
              <form
                onSubmit={handleCreateTenantUser}
                className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 grid grid-cols-1 sm:grid-cols-5 gap-2.5 items-end"
              >
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-indigo-950 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserName}
                    onChange={(e) => setNewUserName(e.target.value)}
                    placeholder="Ej. Ana López"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-indigo-950 mb-1">
                    Usuario (Login) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                    placeholder="ej. analopez"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 font-mono text-xs font-bold text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-indigo-950 mb-1">
                    Contraseña / PIN *
                  </label>
                  <input
                    type="text"
                    required
                    value={newUserPassword}
                    onChange={(e) => setNewUserPassword(e.target.value)}
                    placeholder="Ej. CAJA2026"
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 font-mono text-xs font-black text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-extrabold uppercase text-indigo-950 mb-1">
                    Rol en la Tienda
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as 'admin' | 'collaborator')}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-indigo-200 text-xs font-bold text-slate-900"
                  >
                    <option value="collaborator">Colaborador / Cajero</option>
                    <option value="admin">Administrador</option>
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={isCreatingUser}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer h-[32px]"
                >
                  {isCreatingUser ? 'Guardando...' : '+ Guardar Usuario'}
                </button>
              </form>
            )}

            {/* Users Table */}
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] uppercase">
                    <th className="py-2.5 px-3">Nombre / Titular</th>
                    <th className="py-2.5 px-3">Usuario / ID</th>
                    <th className="py-2.5 px-3">Contraseña / Clave</th>
                    <th className="py-2.5 px-3">Rol</th>
                    <th className="py-2.5 px-3">Permisos / Módulos</th>
                    <th className="py-2.5 px-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {/* Primary Admin Row */}
                  <tr className="bg-emerald-50/70">
                    <td className="py-2.5 px-3 font-black text-slate-900">
                      {currentCompany.ownerName || 'Administrador Principal'} (Llave Maestra)
                    </td>
                    <td className="py-2.5 px-3 font-mono font-black text-emerald-800">
                      Código: {currentCompany.slug}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-black text-amber-800">
                      {currentCompany.adminPassword}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-black text-[10px] uppercase">
                        Admin Maestro
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-[11px] text-slate-700 font-semibold">
                      Acceso total a los {enabledModules.length} módulos contratados
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          handleCopyText(
                            'master_row',
                            `Empresa: ${currentCompany.slug} | Clave Admin: ${currentCompany.adminPassword} | Link: ${loginUrl}`,
                            'Credencial maestra'
                          )
                        }
                        className="px-2 py-1 rounded bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-[11px] cursor-pointer"
                      >
                        Copiar
                      </button>
                    </td>
                  </tr>

                  {/* Collaborators / Additional Users */}
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {u.name}
                        {u.isActive === false && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px]">
                            Inactivo
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-700">
                        @{u.username}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-black text-slate-900">
                        {u.password}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                            u.role === 'admin'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                          }`}
                        >
                          {u.role === 'admin' ? 'Administrador' : 'Colaborador'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-[11px] text-slate-600">
                        {u.role === 'admin'
                          ? 'Todos los módulos'
                          : `${(u.allowedTabs || []).length} módulos habilitados`}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              handleCopyText(
                                `usr_${u.id}`,
                                `Sistema: ${loginUrl} | Usuario: @${u.username} | Contraseña: ${u.password}`,
                                `Acceso de @${u.username}`
                              )
                            }
                            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] cursor-pointer"
                          >
                            Copiar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTenantUser(u)}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="Eliminar usuario"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 3: CORPORATE PROFILE, WAREHOUSES, MODULES & LEGAL DOCUMENTS */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Box: Corporate Info + Warehouses */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-teal-600" />
                  <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase">
                    3. Ficha de Datos, Bodegas y Base de Datos
                  </h3>
                </div>
                <span className="text-[11px] font-bold text-slate-500">
                  {isLoadingDossier ? 'Sincronizando...' : 'En Vivo'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Propietario / Titular
                  </span>
                  <strong className="text-slate-900">
                    {currentCompany.ownerName ||
                      currentCompany.contractData?.clientRepresentative ||
                      'Sin especificar'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    RTN / Identidad
                  </span>
                  <strong className="text-slate-900 font-mono">
                    {currentCompany.clientRtnOrId ||
                      currentCompany.contractData?.clientIdentityOrRtn ||
                      'En expediente'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    WhatsApp / Teléfono
                  </span>
                  <strong className="text-slate-900 font-mono">
                    {currentCompany.phone || storeSettings?.phone || 'No registrado'}
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">
                    Plan y Próximo Corte
                  </span>
                  <strong className="text-emerald-700 capitalize">
                    {currentCompany.plan} (L. {Number(currentCompany.price || 0).toLocaleString('es-HN')}) •{' '}
                    {currentCompany.nextBillingDate
                      ? formatShortDateEs(currentCompany.nextBillingDate)
                      : 'Vitalicio'}
                  </strong>
                </div>
              </div>

              {/* Database Live Counters */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div className="p-2.5 rounded-xl bg-slate-900 text-white">
                  <div className="text-[10px] text-slate-400 font-bold">Artículos</div>
                  <div className="font-black text-sm text-emerald-400 mt-0.5">
                    {stats.productsCount}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 text-white">
                  <div className="text-[10px] text-slate-400 font-bold">Bodegas</div>
                  <div className="font-black text-sm text-amber-300 mt-0.5">
                    {warehouses.length || 1}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 text-white">
                  <div className="text-[10px] text-slate-400 font-bold">Ventas</div>
                  <div className="font-black text-sm text-white mt-0.5">{stats.salesCount}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-900 text-white">
                  <div className="text-[10px] text-slate-400 font-bold">Proveedores</div>
                  <div className="font-black text-sm text-teal-300 mt-0.5">
                    {stats.suppliersCount}
                  </div>
                </div>
              </div>

              {/* Warehouses List */}
              <div className="space-y-1.5">
                <div className="text-[11px] font-extrabold uppercase text-slate-600 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Bodegas / Sucursales Configuradas ({warehouses.length || 1})</span>
                </div>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {warehouses.map((wh) => (
                    <div
                      key={wh.id}
                      className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-mono font-black text-indigo-800 mr-1.5">
                          {wh.code}
                        </span>
                        <strong className="text-slate-900">{wh.name}</strong>
                        {wh.isMainSalesFloor && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                            Caja Principal
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-500">
                        {wh.manager || wh.address || 'Activa'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Box: Documents, Contract, Payments, Modules & Backups */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col justify-between gap-4">
              <div className="space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-emerald-600" />
                    <h3 className="font-black text-slate-900 text-xs sm:text-sm uppercase">
                      4. Documentos Legales, Pagos, Módulos y Respaldos
                    </h3>
                  </div>
                </div>

                {/* Official Documents Quick Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* Contract Card */}
                  <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex flex-col justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-emerald-800 block">
                        Contrato Legal de Licencia
                      </span>
                      <div className="font-black text-xs text-slate-900 mt-0.5">
                        {currentCompany.contractData?.contractNumber ||
                          `CTR-${currentCompany.slug.toUpperCase()}`}
                      </div>
                      <div className="text-[10px] text-emerald-700 font-bold">
                        Estado:{' '}
                        {currentCompany.contractData?.status === 'signed'
                          ? 'Firmado Digitalmente ✓'
                          : 'Listo para Imprimir / Firmar'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenContractModal(currentCompany)}
                      className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Abrir / Descargar Contrato</span>
                    </button>
                  </div>

                  {/* Last Payment Receipt Card */}
                  <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 flex flex-col justify-between gap-2">
                    <div>
                      <span className="text-[10px] font-black uppercase text-indigo-800 block">
                        Recibos de Suscripción ({(currentCompany.paymentHistory || []).length})
                      </span>
                      <div className="font-black text-xs text-slate-900 mt-0.5">
                        {lastPayment
                          ? `${lastPayment.receiptNumber} — L. ${lastPayment.amount.toLocaleString('es-HN')}`
                          : 'Sin recibos emitidos aún'}
                      </div>
                      <div className="text-[10px] text-indigo-700 font-bold">
                        {lastPayment ? lastPayment.dateFormatted : 'Registrar pago o emitir recibo'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenPaymentModal(currentCompany)}
                        className="flex-1 py-1.5 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] inline-flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>Pagos / Recibos</span>
                      </button>
                      {lastPayment && (
                        <button
                          type="button"
                          onClick={() =>
                            downloadSaaSReceiptPdf(
                              lastPayment,
                              currentCompany,
                              saasGlobalConfig?.saasBrandName
                            )
                          }
                          className="p-1.5 rounded-lg bg-white hover:bg-indigo-100 text-indigo-800 border border-indigo-300 cursor-pointer"
                          title="Descargar último recibo PDF"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Enabled Modules Chips */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-extrabold uppercase text-slate-600">
                      Módulos Habilitados en su App ({enabledModules.length}/{ALL_COMPANY_MODULES.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => onOpenPermissionsModal(currentCompany)}
                      className="text-[11px] font-extrabold text-teal-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Sliders className="w-3 h-3" />
                      <span>Editar Módulos / Límites</span>
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SAAS_MODULE_OPTIONS.map((mod) => {
                      const active = enabledModules.includes(mod.id);
                      return (
                        <span
                          key={mod.id}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                            active
                              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                              : 'bg-slate-100 text-slate-400 border-slate-200 line-through'
                          }`}
                        >
                          {mod.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Full Data Handover / Backups Buttons */}
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-[10px] font-black uppercase text-slate-500">
                  Entrega de Archivos de Base de Datos (Excel CSV y Respaldo Total JSON)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onDownloadBackupCSV(currentCompany)}
                    className="py-2 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-extrabold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-700" />
                    <span>Exportar Inventario y Ventas (Excel)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownloadBackupJSON(currentCompany)}
                    className="py-2 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Database className="w-3.5 h-3.5 text-teal-400" />
                    <span>Descargar Base Completa (JSON)</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
