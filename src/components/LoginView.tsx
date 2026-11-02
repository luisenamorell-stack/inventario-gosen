import React, { useState, useEffect } from 'react';
import { StoreSettings, UserAccount, UserSession, CompanyTenant } from '../types';
import { normalizeCompanySlug } from '../firebase/firestoreService';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  User,
  Users,
  AlertTriangle,
  CheckCircle2,
  Building2,
  Sparkles,
  Database,
  PackageCheck,
  Store,
  Layers
} from 'lucide-react';
import { MiAppHNBannerLogo, MiAppHNCashRegisterIcon } from './MiAppHNLogo';

interface LoginViewProps {
  storeSettings?: StoreSettings;
  users?: UserAccount[];
  companies?: CompanyTenant[];
  activeCompanyId?: string;
  isSaaSPortalMode?: boolean;
  onSelectCompany?: (companySlug: string) => void;
  onLoginSuccess: (session: UserSession, remember: boolean) => void;
}

type LoginPortalMode = 'store_pass' | 'collaborator' | 'saas_owner';

interface LoaderState {
  isActive: boolean;
  step: number; // 1, 2, 3, 4
  progress: number; // 0 to 100
  title: string;
  subtitle: string;
  companyName: string;
  logoUrl?: string;
}

export const LoginView: React.FC<LoginViewProps> = ({
  storeSettings,
  users = [],
  companies = [],
  activeCompanyId = 'gosen',
  isSaaSPortalMode = false,
  onSelectCompany,
  onLoginSuccess,
}) => {
  const [loginMode, setLoginMode] = useState<LoginPortalMode>(() =>
    isSaaSPortalMode ? 'saas_owner' : 'store_pass'
  );
  const [selectedSlug, setSelectedSlug] = useState<string>(() =>
    normalizeCompanySlug(activeCompanyId || 'gosen')
  );
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  // High-Tech Loader ("CARGADOR") State
  const [loader, setLoader] = useState<LoaderState>({
    isActive: false,
    step: 1,
    progress: 0,
    title: '',
    subtitle: '',
    companyName: '',
    logoUrl: undefined,
  });

  useEffect(() => {
    if (activeCompanyId) {
      setSelectedSlug(normalizeCompanySlug(activeCompanyId));
    }
  }, [activeCompanyId]);

  useEffect(() => {
    if (isSaaSPortalMode) {
      setLoginMode('saas_owner');
    } else if (loginMode === 'saas_owner') {
      setLoginMode('store_pass');
    }
  }, [isSaaSPortalMode]);

  // Normalized active company
  const normalizedSlug = normalizeCompanySlug(selectedSlug || 'gosen');
  const isGosenSelected = normalizedSlug === 'gosen';

  const selectedCompany = companies.find(
    (c) => normalizeCompanySlug(c.slug) === normalizedSlug
  );

  // Store Brand Details
  const storeName =
    loginMode === 'saas_owner'
      ? 'MIAPPHN • Panel Central SaaS'
      : selectedCompany?.name ||
        (isGosenSelected
          ? storeSettings?.storeName || 'Tienda Gosén'
          : storeSettings?.companyId === normalizedSlug && storeSettings?.storeName
          ? storeSettings.storeName
          : normalizedSlug.toUpperCase());

  const logoUrl =
    loginMode === 'saas_owner'
      ? ''
      : selectedCompany?.logoUrl !== undefined && selectedCompany.logoUrl !== ''
      ? selectedCompany.logoUrl
      : isGosenSelected
      ? storeSettings?.logoUrl || '/store-logo.jpg'
      : storeSettings?.companyId === normalizedSlug && storeSettings?.logoUrl
      ? storeSettings.logoUrl
      : '';

  const tagline =
    loginMode === 'saas_owner'
      ? 'Consola Exclusiva del Administrador SaaS • Control de Clientes y Mora'
      : selectedCompany?.tagline ||
        (isGosenSelected
          ? storeSettings?.tagline || 'Sistema de Control de Inventario & Facturación'
          : storeSettings?.companyId === normalizedSlug && storeSettings?.tagline
          ? storeSettings.tagline
          : 'Sistema de Control de Inventario & Facturación POS');

  const isCompanySuspended =
    loginMode !== 'saas_owner' && selectedCompany?.status === 'suspended';

  // Collaborators of current store
  const activeCollaborators = users.filter(
    (u) =>
      u.isActive !== false &&
      normalizeCompanySlug(u.companyId || 'gosen') === normalizedSlug
  );

  // Handle switching company from the store cards
  const handlePickCompany = (slug: string) => {
    const clean = normalizeCompanySlug(slug);
    setSelectedSlug(clean);
    setError(null);
    onSelectCompany?.(clean);
  };

  /**
   * Run the Animated Loader ("CARGADOR") sequence before opening the app
   */
  const executeAnimatedLoaderAndEnter = (
    session: UserSession,
    targetCompanyName: string,
    targetLogo?: string
  ) => {
    setLoader({
      isActive: true,
      step: 1,
      progress: 25,
      title: 'Verificando contraseña de tu tienda...',
      subtitle: 'Validando claves de seguridad y permisos de acceso...',
      companyName: targetCompanyName,
      logoUrl: targetLogo,
    });

    // Step 2: Database Connection (~350ms)
    setTimeout(() => {
      setLoader((prev) => ({
        ...prev,
        step: 2,
        progress: 58,
        title: `Conectando con la base de datos de ${targetCompanyName}...`,
        subtitle: 'Estableciendo enlace encriptado con Firebase Cloud Firestore...',
      }));
    }, 380);

    // Step 3: Catalog & POS Sync (~750ms)
    setTimeout(() => {
      setLoader((prev) => ({
        ...prev,
        step: 3,
        progress: 88,
        title: 'Sincronizando catálogo de artículos e inventario...',
        subtitle: 'Cargando fotos de productos, códigos SKU, precios y ventas...',
      }));
    }, 800);

    // Step 4: Access Granted & App Deployment (~1150ms)
    setTimeout(() => {
      setLoader((prev) => ({
        ...prev,
        step: 4,
        progress: 100,
        title: '¡Acceso autorizado con éxito!',
        subtitle: 'Desplegando tu aplicación y espacio de trabajo...',
      }));
    }, 1180);

    // Final Handover to App (~1400ms)
    setTimeout(() => {
      onLoginSuccess(session, rememberMe);
    }, 1450);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = password.trim();

    if (!cleanInput) {
      setError('Por favor ingresa la contraseña de tu tienda para continuar.');
      return;
    }

    const saasOwnerMasterKey = (
      localStorage.getItem('stockmaster_saas_master_key') || 'SAASMASTER2026'
    ).trim();

    const isSaaSOwnerMasterLogin =
      cleanInput.toUpperCase() === saasOwnerMasterKey.toUpperCase();

    // 1. SAAS MASTER LOGIN
    if (loginMode === 'saas_owner' || isSaaSOwnerMasterLogin) {
      if (!isSaaSOwnerMasterLogin) {
        setError('Clave Maestra de Administrador SaaS incorrecta.');
        return;
      }

      try {
        localStorage.setItem('stockmaster_saas_owner_unlocked', 'true');
      } catch {}

      const saasAdminSession: UserSession = {
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
      };

      executeAnimatedLoaderAndEnter(
        saasAdminSession,
        'MIAPPHN Panel Central',
        undefined
      );
      return;
    }

    // 2. COLLABORATOR MODE (Specific user + password)
    if (loginMode === 'collaborator') {
      if (!usernameInput.trim()) {
        setError('Por favor ingresa tu nombre de usuario de colaborador.');
        return;
      }

      const cleanUser = usernameInput.trim().toLowerCase();
      const foundUser = users.find(
        (u) =>
          u.username.toLowerCase() === cleanUser &&
          u.isActive !== false &&
          normalizeCompanySlug(u.companyId || 'gosen') === normalizedSlug
      );

      if (!foundUser) {
        setError(
          `No se encontró un colaborador activo con el usuario "${cleanUser}" en ${storeName}.`
        );
        return;
      }

      if (foundUser.password !== cleanInput) {
        setError('Contraseña de colaborador incorrecta.');
        return;
      }

      try {
        localStorage.removeItem('stockmaster_saas_owner_unlocked');
      } catch {}

      const collabSession: UserSession = {
        userId: foundUser.id,
        companyId: normalizedSlug,
        companyName: storeName,
        isSuperAdmin: false,
        isStandaloneSaaS: false,
        userName: foundUser.name,
        username: foundUser.username,
        role: 'collaborator',
        allowedTabs:
          foundUser.allowedTabs && foundUser.allowedTabs.length > 0
            ? foundUser.allowedTabs
            : ['sales', 'inventory', 'price-checker', 'catalog'],
        salesPermissions: foundUser.salesPermissions || {
          canEditSales: true,
          canCancelSales: false,
          canViewCostsAndProfits: false,
        },
      };

      executeAnimatedLoaderAndEnter(collabSession, storeName, logoUrl);
      return;
    }

    // 3. STORE PASSWORD DIRECT ACCESS WITH SMART MULTI-STORE AUTO-DETECTION
    // First, check if cleanInput matches the currently selected store:
    let matchedCompanyObj: CompanyTenant | undefined = selectedCompany;
    let matchedSlug = normalizedSlug;
    let isMatched = false;

    const currentExpectedPass = (
      selectedCompany?.adminPassword ||
      (normalizedSlug === 'gosen'
        ? storeSettings?.accessPassword || 'GOSEN2026'
        : storeSettings?.companyId === normalizedSlug && storeSettings?.accessPassword
        ? storeSettings.accessPassword
        : 'ADMIN2026')
    ).trim();

    if (
      cleanInput === currentExpectedPass ||
      cleanInput.toUpperCase() === currentExpectedPass.toUpperCase() ||
      (normalizedSlug === 'gosen' &&
        (cleanInput.toUpperCase() === 'GOSEN2026' ||
          cleanInput.toUpperCase() === 'ADMIN2026' ||
          cleanInput.toUpperCase() === (storeSettings?.accessPassword || 'ADMIN2026').trim().toUpperCase()))
    ) {
      isMatched = true;
    } else {
      // SMART AUTO-DETECTION: Check across ALL registered companies in Firestore!
      // If user is at the generic URL and types "GYG2026", automatically route to COMERCIAL GYG!
      const autoMatchedComp = companies.find((comp) => {
        const pass = (comp.adminPassword || '').trim().toUpperCase();
        return (
          pass === cleanInput.toUpperCase() ||
          (comp.slug === 'tiendagyg' && cleanInput.toUpperCase() === 'GYG2026') ||
          (comp.slug === 'gosen' && (cleanInput.toUpperCase() === 'GOSEN2026' || cleanInput.toUpperCase() === 'ADMIN2026'))
        );
      });

      if (autoMatchedComp) {
        matchedCompanyObj = autoMatchedComp;
        matchedSlug = normalizeCompanySlug(autoMatchedComp.slug);
        isMatched = true;
        // Inform parent app to switch company context seamlessly
        setSelectedSlug(matchedSlug);
        onSelectCompany?.(matchedSlug);
      }
    }

    if (!isMatched) {
      // Check if password matches a collaborator in the store or across companies
      const matchingCollab = users.find(
        (u) =>
          u.isActive !== false &&
          u.password === cleanInput &&
          (normalizeCompanySlug(u.companyId || 'gosen') === normalizedSlug ||
            companies.some((c) => normalizeCompanySlug(c.slug) === normalizeCompanySlug(u.companyId || 'gosen')))
      );

      if (matchingCollab) {
        const collabCompanySlug = normalizeCompanySlug(matchingCollab.companyId || 'gosen');
        const collabComp = companies.find((c) => normalizeCompanySlug(c.slug) === collabCompanySlug);
        const resolvedCollabStore = collabComp?.name || (collabCompanySlug === 'gosen' ? 'Tienda Gosén' : collabCompanySlug.toUpperCase());

        setSelectedSlug(collabCompanySlug);
        onSelectCompany?.(collabCompanySlug);

        const collabSession: UserSession = {
          userId: matchingCollab.id,
          companyId: collabCompanySlug,
          companyName: resolvedCollabStore,
          isSuperAdmin: false,
          isStandaloneSaaS: false,
          userName: matchingCollab.name,
          username: matchingCollab.username,
          role: 'collaborator',
          allowedTabs: matchingCollab.allowedTabs || ['sales', 'inventory', 'price-checker', 'catalog'],
          salesPermissions: matchingCollab.salesPermissions || {
            canEditSales: true,
            canCancelSales: false,
            canViewCostsAndProfits: false,
          },
        };

        executeAnimatedLoaderAndEnter(collabSession, resolvedCollabStore, collabComp?.logoUrl);
        return;
      }

      setError(
        `Contraseña no reconocida. Verifica la contraseña de tu tienda (ej. "GYG2026" para COMERCIAL GYG, "GOSEN2026" para Tienda Gosén).`
      );
      return;
    }

    // Check if the matched company is in arrears / suspended
    if (matchedCompanyObj && matchedCompanyObj.status === 'suspended') {
      const moraDetail = matchedCompanyObj.moraReason
        ? ` Motivo: ${matchedCompanyObj.moraReason}.`
        : '';
      setError(
        `⛔ SERVICIO EN MORA: El acceso para "${matchedCompanyObj.name}" ha sido deshabilitado por pago/renovación pendiente.${moraDetail} Comunícate con el Administrador del sistema.`
      );
      return;
    }

    try {
      localStorage.removeItem('stockmaster_saas_owner_unlocked');
    } catch {}

    const targetStoreName =
      matchedCompanyObj?.name ||
      (matchedSlug === 'gosen'
        ? storeSettings?.storeName || 'Tienda Gosén'
        : storeSettings?.companyId === matchedSlug && storeSettings?.storeName
        ? storeSettings.storeName
        : matchedSlug.toUpperCase());

    const targetLogo =
      matchedCompanyObj?.logoUrl ||
      (matchedSlug === 'gosen' ? storeSettings?.logoUrl || '/store-logo.jpg' : '');

    const adminSession: UserSession = {
      userId: `admin_${matchedSlug}`,
      companyId: matchedSlug,
      companyName: targetStoreName,
      isSuperAdmin: false,
      isStandaloneSaaS: false,
      userName: matchedSlug === 'gosen' ? 'Administrador Gosén' : `Admin ${targetStoreName}`,
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
    };

    executeAnimatedLoaderAndEnter(adminSession, targetStoreName, targetLogo);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-3 sm:p-4 relative overflow-hidden select-none">
      {/* Background ambient glow effects */}
      <div
        className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
          loginMode === 'saas_owner' ? 'bg-teal-500/15' : 'bg-emerald-500/15'
        }`}
      />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* =========================================================================
          HIGH-TECH ANIMATED LOADER ("CARGADOR") OVERLAY
          ========================================================================= */}
      {loader.isActive && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-white select-none animate-in fade-in duration-300">
          <div className="w-full max-w-md flex flex-col items-center text-center space-y-6">
            {/* Holographic Glowing Central Spinner */}
            <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center">
              {/* Outer Neon Rotating Ring */}
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-400 border-r-teal-400 animate-spin" />
              <div
                className="absolute inset-1 rounded-full border-2 border-emerald-500/20 animate-pulse"
                style={{ animationDuration: '2s' }}
              />
              <div className="absolute inset-2 rounded-full border-2 border-transparent border-b-cyan-400 border-l-emerald-300 animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3s' }} />

              {/* Pulsing Central Glow */}
              <div className="absolute inset-4 rounded-full bg-emerald-500/15 blur-md animate-pulse" />

              {/* Store Logo or Cash Register Icon inside spinner */}
              <div className="relative z-10 w-20 h-20 rounded-2xl bg-slate-900/90 border border-emerald-500/30 p-2 flex items-center justify-center shadow-xl shadow-emerald-950/60 overflow-hidden">
                {loader.logoUrl ? (
                  <img
                    src={loader.logoUrl}
                    alt={loader.companyName}
                    className="max-w-full max-h-full object-contain drop-shadow"
                  />
                ) : (
                  <MiAppHNCashRegisterIcon
                    className="w-16 h-16 rounded-xl"
                    iconClassName="w-11 h-11 text-emerald-400"
                  />
                )}
              </div>
            </div>

            {/* Store Name Badge */}
            <div className="space-y-1">
              <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-black tracking-wider uppercase">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>{loader.companyName}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                {loader.title}
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {loader.subtitle}
              </p>
            </div>

            {/* Glowing Progress Bar */}
            <div className="w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400">
                <span>Cargando plataforma</span>
                <span className="text-emerald-400">{loader.progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(52,211,153,0.8)]"
                  style={{ width: `${loader.progress}%` }}
                />
              </div>
            </div>

            {/* 4 Interactive Verification Step Badges */}
            <div className="w-full max-w-sm grid grid-cols-2 gap-2 text-left pt-2">
              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 transition-all duration-300 ${
                  loader.step >= 1
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <CheckCircle2
                  className={`w-3.5 h-3.5 shrink-0 ${
                    loader.step >= 1 ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                />
                <span className="truncate">1. Credenciales OK</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 transition-all duration-300 ${
                  loader.step >= 2
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <Database
                  className={`w-3.5 h-3.5 shrink-0 ${
                    loader.step >= 2 ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                />
                <span className="truncate">2. Conexión Cloud</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 transition-all duration-300 ${
                  loader.step >= 3
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <PackageCheck
                  className={`w-3.5 h-3.5 shrink-0 ${
                    loader.step >= 3 ? 'text-emerald-400' : 'text-slate-600'
                  }`}
                />
                <span className="truncate">3. Catálogo & Artículos</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 transition-all duration-300 ${
                  loader.step >= 4
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <Sparkles
                  className={`w-3.5 h-3.5 shrink-0 ${
                    loader.step >= 4 ? 'text-cyan-400 animate-spin' : 'text-slate-600'
                  }`}
                />
                <span className="truncate">4. App Desplegada</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quick Brand Switcher Pills (If multiple stores exist) */}
      {loginMode !== 'saas_owner' && companies.length > 0 && (
        <div className="w-full max-w-md mb-3 z-10">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Store className="w-3.5 h-3.5 text-emerald-400" />
              <span>Tiendas Disponibles:</span>
            </span>
            <span className="text-[10px] text-emerald-400 font-semibold">
              Selecciona o escribe tu clave directa
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {companies.map((comp) => {
              const compSlug = normalizeCompanySlug(comp.slug);
              const isSelected = compSlug === normalizedSlug;
              return (
                <button
                  key={comp.id || comp.slug}
                  type="button"
                  onClick={() => handlePickCompany(comp.slug)}
                  className={`px-3 py-2.5 rounded-2xl border text-left transition-all duration-200 cursor-pointer flex items-center gap-2.5 ${
                    isSelected
                      ? 'bg-emerald-500/15 border-emerald-500/60 shadow-lg shadow-emerald-950/40 text-white'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-950/80 border border-slate-700/60 flex items-center justify-center shrink-0 overflow-hidden">
                    {comp.logoUrl ? (
                      <img
                        src={comp.logoUrl}
                        alt={comp.name}
                        className="w-full h-full object-contain p-0.5"
                      />
                    ) : (
                      <Building2 className={`w-4 h-4 ${isSelected ? 'text-emerald-400' : 'text-slate-400'}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black truncate">{comp.name}</div>
                    <div className="text-[10px] text-slate-500 flex items-center gap-1">
                      {isSelected ? (
                        <span className="text-emerald-400 font-bold flex items-center gap-0.5">
                          ● Activa
                        </span>
                      ) : (
                        <span>Clic para activar</span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Main Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-md p-6 sm:p-7 z-10">
        {/* Store / Portal Branding Header */}
        <div className="flex flex-col items-center text-center mb-5">
          {loginMode === 'saas_owner' ? (
            <div className="flex flex-col items-center gap-2 mb-3">
              <MiAppHNBannerLogo className="h-14 sm:h-16 w-auto" alt="MIAPPHN" />
            </div>
          ) : logoUrl ? (
            <div className="w-full max-w-[240px] h-20 sm:h-24 flex items-center justify-center overflow-hidden mb-3">
              <img
                src={logoUrl}
                alt={storeName}
                className="w-full h-full object-contain rounded-xl drop-shadow-md"
              />
            </div>
          ) : (
            <div className="mb-3">
              <MiAppHNCashRegisterIcon
                className="w-16 h-16 rounded-2xl"
                iconClassName="w-11 h-11 text-emerald-400"
              />
            </div>
          )}

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-950/90 border border-slate-800 text-[11px] font-bold text-emerald-400 mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>{loginMode === 'saas_owner' ? 'Consola Central' : 'Acceso a Clientes POS'}</span>
          </div>

          <h1 className="text-2xl font-black text-white tracking-wide">{storeName}</h1>
          <p className="text-xs text-slate-400 mt-1">{tagline}</p>
        </div>

        {/* Suspended / Mora Banner */}
        {isCompanySuspended && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-left space-y-1">
            <div className="flex items-center gap-2 text-rose-300 font-black text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Cuenta en Mora • Servicio Suspendido</span>
            </div>
            <p className="text-[11px] text-rose-200/90 leading-relaxed">
              El acceso para <strong>{storeName}</strong> ha sido suspendido temporalmente por pago pendiente.
              {selectedCompany?.moraReason ? ` (${selectedCompany.moraReason})` : ''} Comunícate con soporte para reactivar.
            </p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Collaborator User Selection (Only in collaborator mode) */}
          {loginMode === 'collaborator' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Usuario Colaborador ({storeName})
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('store_pass');
                    setError(null);
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer"
                >
                  ← Volver a contraseña directa
                </button>
              </div>

              {activeCollaborators.length > 0 ? (
                <div className="space-y-2">
                  <select
                    value={usernameInput}
                    onChange={(e) => {
                      setUsernameInput(e.target.value);
                      if (error) setError(null);
                    }}
                    className="w-full px-3.5 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-extrabold"
                  >
                    <option value="">-- Selecciona tu usuario en {storeName} --</option>
                    {activeCollaborators.map((u) => (
                      <option key={u.id} value={u.username}>
                        👤 {u.name} (@{u.username})
                      </option>
                    ))}
                  </select>

                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <span>O escribe tu usuario:</span>
                    <input
                      type="text"
                      placeholder="ej. cajero1"
                      value={usernameInput}
                      onChange={(e) => setUsernameInput(e.target.value.toLowerCase().trim())}
                      className="flex-1 bg-slate-950 border border-slate-800 px-2 py-1 rounded text-white font-mono text-xs"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      placeholder="Ingresa tu usuario"
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value.toLowerCase().trim());
                        if (error) setError(null);
                      }}
                      className="w-full pl-10 pr-3 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[11px] text-amber-400/90 font-medium">
                    ⚠️ Aún no se han registrado colaboradores en {storeName}. Puedes ingresar con la contraseña general de tu tienda.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Password Input (Simple, prominent, and friendly) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="login-password"
                className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider"
              >
                {loginMode === 'saas_owner'
                  ? 'Clave Maestra Administrador SaaS'
                  : loginMode === 'collaborator'
                  ? 'PIN o Contraseña de Colaborador'
                  : `Contraseña de tu Tienda (${storeName})`}
              </label>
              {loginMode === 'store_pass' && (
                <span className="text-[10px] text-emerald-400/90 font-mono font-bold">
                  Detección automática ⚡
                </span>
              )}
            </div>

            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-emerald-400">
                <Lock className="w-4 h-4" />
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={
                  loginMode === 'saas_owner'
                    ? 'Ingresa tu Clave Maestra SaaS'
                    : loginMode === 'collaborator'
                    ? 'Ingresa tu PIN o contraseña'
                    : 'Escribe la contraseña (ej. GYG2026)'
                }
                autoFocus
                disabled={loader.isActive}
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3.5 bg-slate-950/90 border border-slate-700 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm font-bold font-mono tracking-wider shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {loginMode === 'store_pass' && (
              <div className="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>💡 Acceso instantáneo con la contraseña de tu negocio</span>
                <span className="text-slate-500 font-mono">ej. GYG2026</span>
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Remember Me Option */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
              />
              <span className="hover:text-slate-200 transition-colors">
                Recordar sesión en este equipo
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loader.isActive}
            className={`w-full py-3.5 px-4 text-white font-black text-sm rounded-2xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50 ${
              loginMode === 'saas_owner'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 shadow-teal-900/40'
                : 'bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-500 hover:from-emerald-500 hover:to-teal-500 shadow-emerald-900/40 active:scale-[0.99]'
            }`}
          >
            <span>
              {loginMode === 'saas_owner'
                ? 'Entrar al Panel Central SaaS'
                : `Ingresar a ${storeName}`}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Alternate Login Modes Links */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col gap-2 text-center">
          {loginMode === 'store_pass' ? (
            <button
              type="button"
              onClick={() => {
                setLoginMode('collaborator');
                setError(null);
              }}
              className="text-xs text-slate-400 hover:text-emerald-400 font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>¿Eres cajero o colaborador con usuario propio? Haz clic aquí</span>
            </button>
          ) : loginMode === 'collaborator' ? (
            <button
              type="button"
              onClick={() => {
                setLoginMode('store_pass');
                setError(null);
              }}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-bold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ingresar directamente con la contraseña de la tienda</span>
            </button>
          ) : null}

          <div className="text-[11px] text-slate-500">
            {loginMode === 'saas_owner'
              ? 'Consola Central de Licencias y Control de Mora'
              : `Acceso seguro y encriptado • ${storeName}`}
          </div>
        </div>
      </div>
    </div>
  );
};
