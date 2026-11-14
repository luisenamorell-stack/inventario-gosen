import React, { useState, useEffect } from 'react';
import { StoreSettings, UserAccount, UserSession, CompanyTenant } from '../types';
import {
  normalizeCompanySlug,
  resolveClientLoginAcrossAllTenants,
} from '../firebase/firestoreService';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  User,
  Users,
  CheckCircle2,
  Sparkles,
  Database,
  PackageCheck,
} from 'lucide-react';
import { MiAppHNBannerLogo, MiAppHNCashRegisterIcon } from './MiAppHNLogo';

interface LoginViewProps {
  storeSettings?: StoreSettings;
  users?: UserAccount[];
  companies?: CompanyTenant[];
  activeCompanyId?: string;
  isSaaSPortalMode?: boolean;
  isDirectStoreUrl?: boolean;
  onSelectCompany?: (companySlug: string) => void;
  onLoginSuccess: (session: UserSession, remember: boolean) => void;
  onBackToLanding?: () => void;
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

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 30;

export const LoginView: React.FC<LoginViewProps> = ({
  storeSettings,
  users = [],
  companies = [],
  activeCompanyId = 'gosen',
  isSaaSPortalMode = false,
  onSelectCompany,
  onLoginSuccess,
  onBackToLanding,
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
  const [isVerifying, setIsVerifying] = useState(false);

  // Brute-force protection state
  const [failedAttempts, setFailedAttempts] = useState<number>(0);
  const [lockoutUntil, setLockoutUntil] = useState<number>(0);
  const [remainingLockSeconds, setRemainingLockSeconds] = useState<number>(0);

  // Animated Loader State
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

  // Countdown timer for security lockout
  useEffect(() => {
    if (!lockoutUntil) {
      setRemainingLockSeconds(0);
      return;
    }
    const updateTimer = () => {
      const diff = Math.ceil((lockoutUntil - Date.now()) / 1000);
      if (diff <= 0) {
        setLockoutUntil(0);
        setRemainingLockSeconds(0);
        setFailedAttempts(0);
        setError(null);
      } else {
        setRemainingLockSeconds(diff);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [lockoutUntil]);

  const normalizedSlug = normalizeCompanySlug(selectedSlug || 'gosen');

  const registerFailedAttempt = (customMessage?: string) => {
    const nextAttempts = failedAttempts + 1;
    setFailedAttempts(nextAttempts);
    if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
      const unlockTime = Date.now() + LOCKOUT_SECONDS * 1000;
      setLockoutUntil(unlockTime);
      setRemainingLockSeconds(LOCKOUT_SECONDS);
      setError(
        `Demasiados intentos fallidos. Por seguridad, espera ${LOCKOUT_SECONDS} segundos para volver a intentar.`
      );
    } else {
      setError(
        customMessage ||
          'Contraseña incorrecta. Verifica tus credenciales e intenta nuevamente.'
      );
    }
  };

  /**
   * Run the Animated Loader sequence before opening the app
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
      title: 'Verificando credenciales de seguridad...',
      subtitle: 'Validando acceso autorizado...',
      companyName: targetCompanyName,
      logoUrl: targetLogo,
    });

    setTimeout(() => {
      setLoader((prev) => ({
        ...prev,
        step: 2,
        progress: 58,
        title: `Conectando con ${targetCompanyName}...`,
        subtitle: 'Estableciendo conexión segura con la nube...',
      }));
    }, 360);

    setTimeout(() => {
      setLoader((prev) => ({
        ...prev,
        step: 3,
        progress: 88,
        title: 'Sincronizando inventario y facturación...',
        subtitle: 'Cargando módulos y configuración de tu negocio...',
      }));
    }, 760);

    setTimeout(() => {
      setLoader((prev) => ({
        ...prev,
        step: 4,
        progress: 100,
        title: '¡Acceso verificado!',
        subtitle: 'Abriendo tu panel de trabajo...',
      }));
    }, 1120);

    setTimeout(() => {
      onLoginSuccess(session, rememberMe);
    }, 1380);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (remainingLockSeconds > 0 || isVerifying || loader.isActive) {
      if (remainingLockSeconds > 0) {
        setError(
          `Acceso temporalmente bloqueado por seguridad. Espera ${remainingLockSeconds} segundos.`
        );
      }
      return;
    }

    const cleanInput = password.trim();

    if (!cleanInput) {
      setError('Ingresa tu contraseña de acceso para continuar.');
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
        registerFailedAttempt('Clave de acceso incorrecta.');
        return;
      }

      setFailedAttempts(0);
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

    if (loginMode === 'collaborator' && !usernameInput.trim()) {
      setError('Ingresa tu nombre de usuario de colaborador.');
      return;
    }

    setIsVerifying(true);
    try {
      const resolution = await Promise.race([
        resolveClientLoginAcrossAllTenants({
          passwordInput: cleanInput,
          usernameInput: loginMode === 'collaborator' ? usernameInput.trim() : undefined,
          mode: loginMode === 'collaborator' ? 'collaborator' : 'store_pass',
          preferredSlug: normalizedSlug,
          companiesInMemory: companies,
          usersInMemory: users,
          activeStoreSettings: storeSettings,
        }),
        new Promise<{ matched: false }>((resolve) =>
          setTimeout(() => resolve({ matched: false }), 4500)
        ),
      ]);

      if (!resolution.matched || !resolution.companySlug) {
        registerFailedAttempt(
          loginMode === 'collaborator'
            ? 'Usuario o contraseña incorrectos. Verifica tus datos e intenta nuevamente.'
            : 'Contraseña de acceso incorrecta. Verifica tu clave e intenta nuevamente.'
        );
        return;
      }

      const matchedSlug = normalizeCompanySlug(resolution.companySlug);
      const matchedCompanyObj =
        resolution.companyObj ||
        companies.find((c) => normalizeCompanySlug(c.slug) === matchedSlug);
      const resolvedStoreName =
        resolution.companyName ||
        matchedCompanyObj?.name ||
        (matchedSlug === 'tiendagyg'
          ? 'COMERCIAL GYG'
          : matchedSlug === 'gosen'
          ? 'Tienda Gosén'
          : matchedSlug.toUpperCase());

      // Check if the matched company is suspended
      if (matchedCompanyObj && matchedCompanyObj.status === 'suspended') {
        const moraDetail = matchedCompanyObj.moraReason
          ? ` Motivo: ${matchedCompanyObj.moraReason}.`
          : '';
        setError(
          `El acceso para "${resolvedStoreName}" se encuentra suspendido por pago o renovación pendiente.${moraDetail} Comunícate con soporte.`
        );
        return;
      }

      setFailedAttempts(0);
      setSelectedSlug(matchedSlug);
      onSelectCompany?.(matchedSlug);

      try {
        localStorage.removeItem('stockmaster_saas_owner_unlocked');
        const url = new URL(window.location.href);
        url.searchParams.delete('ventas');
        url.searchParams.delete('landing');
        url.searchParams.delete('demo');
        url.searchParams.delete('saas');
        url.searchParams.set('empresa', matchedSlug);
        window.history.replaceState({}, '', url.toString());
      } catch {}

      if (resolution.type === 'collaborator' && resolution.collaborator) {
        const collabUser = resolution.collaborator;
        const effectiveRole = collabUser.role === 'admin' ? 'admin' : 'collaborator';
        const assignedWarehouseIds = Array.isArray(collabUser.allowedWarehouseIds)
          ? collabUser.allowedWarehouseIds
          : Array.isArray(collabUser.salesPermissions?.allowedWarehouseIds)
          ? collabUser.salesPermissions.allowedWarehouseIds
          : [];
        const collabSession: UserSession = {
          userId: collabUser.id,
          companyId: matchedSlug,
          companyName: resolvedStoreName,
          isSuperAdmin: false,
          isStandaloneSaaS: false,
          userName: collabUser.name || collabUser.username,
          username: collabUser.username,
          role: effectiveRole,
          allowedTabs:
            collabUser.allowedTabs && collabUser.allowedTabs.length > 0
              ? collabUser.allowedTabs
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
              collabUser.salesPermissions?.canEditSales !== undefined
                ? collabUser.salesPermissions.canEditSales
                : true,
            canCancelSales:
              collabUser.salesPermissions?.canCancelSales !== undefined
                ? collabUser.salesPermissions.canCancelSales
                : effectiveRole === 'admin',
            canViewCostsAndProfits:
              collabUser.salesPermissions?.canViewCostsAndProfits !== undefined
                ? collabUser.salesPermissions.canViewCostsAndProfits
                : effectiveRole === 'admin',
            ...(effectiveRole !== 'admin' && assignedWarehouseIds.length > 0
              ? { allowedWarehouseIds: assignedWarehouseIds }
              : {}),
          },
        };

        executeAnimatedLoaderAndEnter(
          collabSession,
          resolvedStoreName,
          resolution.logoUrl
        );
        return;
      }

      const adminSession: UserSession = {
        userId: `admin_${matchedSlug}`,
        companyId: matchedSlug,
        companyName: resolvedStoreName,
        isSuperAdmin: false,
        isStandaloneSaaS: false,
        userName:
          matchedSlug === 'gosen'
            ? 'Administrador Gosén'
            : `Admin ${resolvedStoreName}`,
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

      executeAnimatedLoaderAndEnter(
        adminSession,
        resolvedStoreName,
        resolution.logoUrl
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Subtle ambient background */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

      {/* =========================================================================
          ANIMATED LOADER OVERLAY (ONLY AFTER SUCCESSFUL AUTHENTICATION)
          ========================================================================= */}
      {loader.isActive && (
        <div className="fixed inset-0 z-[99999] bg-slate-950/95 backdrop-blur-2xl flex flex-col items-center justify-center p-6 text-white select-none animate-in fade-in duration-300">
          <div className="w-full max-w-md flex flex-col items-center text-center space-y-6">
            <div className="relative w-32 h-32 sm:w-36 sm:h-36 flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-400 border-r-teal-400 animate-spin" />
              <div
                className="absolute inset-2 rounded-full border-2 border-transparent border-b-cyan-400 border-l-emerald-300 animate-spin"
                style={{ animationDirection: 'reverse', animationDuration: '3s' }}
              />

              <div className="relative z-10 w-20 h-20 rounded-2xl bg-slate-900/90 border border-emerald-500/30 p-2 flex items-center justify-center shadow-xl overflow-hidden">
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

            <div className="space-y-1">
              <div className="text-emerald-400 text-xs font-black tracking-wider uppercase">
                {loader.companyName}
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-wide">
                {loader.title}
              </h2>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {loader.subtitle}
              </p>
            </div>

            <div className="w-full max-w-xs space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold text-slate-400 tabular-nums">
                <span>Cargando sistema</span>
                <span className="text-emerald-400">{loader.progress}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-900 border border-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 rounded-full transition-all duration-300"
                  style={{ width: `${loader.progress}%` }}
                />
              </div>
            </div>

            <div className="w-full max-w-sm grid grid-cols-2 gap-2 text-left pt-2">
              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${
                  loader.step >= 1
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">1. Acceso Verificado</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${
                  loader.step >= 2
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <Database className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">2. Nube Sincronizada</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${
                  loader.step >= 3
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <PackageCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="truncate">3. Inventario Listo</span>
              </div>

              <div
                className={`p-2.5 rounded-xl border text-[11px] font-semibold flex items-center gap-2 ${
                  loader.step >= 4
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                    : 'bg-slate-900/60 border-slate-800 text-slate-500'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0 text-cyan-400" />
                <span className="truncate">4. Panel Activo</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Clean & Secure Login Card — ONLY OFFICIAL APP LOGO (MIAPPHN) */}
      <div className="w-full max-w-md bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 z-10">
        {onBackToLanding && (
          <div className="mb-4">
            <button
              type="button"
              onClick={onBackToLanding}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al inicio</span>
            </button>
          </div>
        )}

        {/* Official App Logo & Header ONLY — Never exposes any client store name or logo before login */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex items-center justify-center mb-3">
            <MiAppHNBannerLogo
              className="h-14 sm:h-16 w-auto drop-shadow-[0_8px_24px_rgba(16,185,129,0.22)]"
              alt="MIAPPHN"
            />
          </div>

          <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight mt-1">
            {loginMode === 'saas_owner' ? 'Panel Central SaaS' : 'Iniciar Sesión'}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {loginMode === 'saas_owner'
              ? 'Ingresa tu clave maestra de administración para continuar'
              : loginMode === 'collaborator'
              ? 'Ingresa tu usuario y contraseña para entrar a tu negocio'
              : 'Ingresa tu contraseña de acceso para entrar directamente a tu negocio'}
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Collaborator Username Field (Clean text input, never exposes user list) */}
          {loginMode === 'collaborator' && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label
                  htmlFor="login-username"
                  className="text-xs font-bold text-slate-300"
                >
                  Usuario
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setLoginMode('store_pass');
                    setError(null);
                  }}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold cursor-pointer"
                >
                  ← Acceso directo con contraseña
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="login-username"
                  type="text"
                  placeholder="Tu nombre de usuario"
                  value={usernameInput}
                  disabled={loader.isActive || isVerifying || remainingLockSeconds > 0}
                  onChange={(e) => {
                    setUsernameInput(e.target.value.toLowerCase().trim());
                    if (error) setError(null);
                  }}
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 text-sm font-semibold"
                />
              </div>
            </div>
          )}

          {/* Password Field (No examples, no hints, clean & secure) */}
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-bold text-slate-300 mb-1.5"
            >
              {loginMode === 'saas_owner'
                ? 'Contraseña de Administrador'
                : 'Contraseña de Acceso'}
            </label>

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
                placeholder="Ingresa tu contraseña"
                autoFocus
                disabled={loader.isActive || isVerifying || remainingLockSeconds > 0}
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3.5 bg-slate-950 border border-slate-800 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm font-semibold tracking-wider"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Error or Security Lockout Banner */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>
                {remainingLockSeconds > 0
                  ? `Acceso bloqueado temporalmente por seguridad. Intenta de nuevo en ${remainingLockSeconds}s.`
                  : error}
              </span>
            </div>
          )}

          {/* Remember Session Checkbox */}
          <div className="flex items-center justify-between text-xs text-slate-400 pt-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 cursor-pointer"
              />
              <span className="hover:text-slate-200 transition-colors">
                Mantener mi sesión iniciada
              </span>
            </label>
          </div>

          {/* Primary Login Button */}
          <button
            type="submit"
            disabled={loader.isActive || isVerifying || remainingLockSeconds > 0}
            className="w-full py-3.5 px-4 text-slate-950 font-black text-sm rounded-2xl bg-emerald-400 hover:bg-emerald-300 transition-all duration-150 flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50"
          >
            <span>
              {remainingLockSeconds > 0
                ? `Bloqueado (${remainingLockSeconds}s)`
                : isVerifying
                ? 'Verificando acceso...'
                : 'Iniciar Sesión'}
            </span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        {/* Footer Mode Toggle & Security Note */}
        <div className="mt-5 pt-4 border-t border-slate-800/80 flex flex-col gap-2.5 text-center">
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
              <span>Ingresar con usuario de colaborador</span>
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
              <span>Ingresar solo con contraseña de acceso</span>
            </button>
          ) : null}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/80" />
            <span>Conexión privada y protegida</span>
          </div>
        </div>
      </div>
    </div>
  );
};
