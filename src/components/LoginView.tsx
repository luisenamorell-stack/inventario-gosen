import React, { useState } from 'react';
import { StoreSettings, UserAccount, UserSession, CompanyTenant } from '../types';
import { normalizeCompanySlug } from '../firebase/firestoreService';
import {
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Boxes,
  AlertCircle,
  ArrowRight,
  User,
  Users,
  Building2,
  Key,
  AlertTriangle
} from 'lucide-react';

interface LoginViewProps {
  storeSettings?: StoreSettings;
  users?: UserAccount[];
  companies?: CompanyTenant[];
  activeCompanyId?: string;
  onSelectCompany?: (companySlug: string) => void;
  onLoginSuccess: (session: UserSession, remember: boolean) => void;
}

type LoginPortalMode = 'admin' | 'collaborator' | 'saas_owner';

export const LoginView: React.FC<LoginViewProps> = ({
  storeSettings,
  users = [],
  companies = [],
  activeCompanyId = 'gosen',
  onSelectCompany,
  onLoginSuccess,
}) => {
  const [loginMode, setLoginMode] = useState<LoginPortalMode>('admin');
  const [companySlugInput, setCompanySlugInput] = useState<string>(activeCompanyId || 'gosen');
  const [showCompanySwitcher, setShowCompanySwitcher] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const normalizedSlug = normalizeCompanySlug(companySlugInput);
  const isGosenSelected = normalizedSlug === 'gosen';

  const selectedCompany = companies.find(
    (c) => normalizeCompanySlug(c.slug) === normalizedSlug
  );

  // Strict Branding Isolation: Non-Gosén clients never inherit Tienda Gosén's logo or name
  const storeName =
    loginMode === 'saas_owner'
      ? 'Panel Central SaaS'
      : selectedCompany?.name ||
        (isGosenSelected ? storeSettings?.storeName || 'Tienda Gosén' : normalizedSlug.toUpperCase());

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
          : 'Sistema de Control de Inventario & Facturación POS');

  const isCompanySuspended =
    loginMode !== 'saas_owner' && selectedCompany?.status === 'suspended';

  const activeCollaborators = users.filter(
    (u) =>
      u.isActive !== false &&
      normalizeCompanySlug(u.companyId || 'gosen') === normalizedSlug
  );

  const handleCompanyChange = (newSlugRaw: string) => {
    const clean = normalizeCompanySlug(newSlugRaw);
    setCompanySlugInput(clean);
    setError(null);
    if (onSelectCompany) {
      onSelectCompany(clean);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = password.trim();
    const targetSlug = normalizeCompanySlug(companySlugInput);

    if (!cleanInput) {
      setError('Por favor ingresa la contraseña para continuar.');
      return;
    }

    setIsLoading(true);

    const saasOwnerMasterKey = (
      localStorage.getItem('stockmaster_saas_master_key') || 'SAASMASTER2026'
    ).trim();

    // 1. STANDALONE SAAS SUPER-ADMIN LOGIN (Either via 'saas_owner' tab or Master Key)
    const isSaaSOwnerMasterLogin =
      cleanInput.toUpperCase() === saasOwnerMasterKey.toUpperCase();

    if (loginMode === 'saas_owner') {
      if (!isSaaSOwnerMasterLogin) {
        setError('Clave Maestra de Administrador SaaS incorrecta.');
        setIsLoading(false);
        return;
      }

      try {
        localStorage.setItem('stockmaster_saas_owner_unlocked', 'true');
      } catch {}

      const saasAdminSession: UserSession = {
        userId: 'saas_super_admin',
        companyId: targetSlug,
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

      onLoginSuccess(saasAdminSession, rememberMe);
      return;
    }

    // If user typed the SaaS Master Key inside Admin mode, also open the Standalone SaaS Panel directly
    if (loginMode === 'admin' && isSaaSOwnerMasterLogin) {
      try {
        localStorage.setItem('stockmaster_saas_owner_unlocked', 'true');
      } catch {}

      const saasAdminSession: UserSession = {
        userId: 'saas_super_admin',
        companyId: targetSlug,
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

      onLoginSuccess(saasAdminSession, rememberMe);
      return;
    }

    // 2. CHECK IF THE SELECTED STORE CLIENT IS IN ARREARS ("EN MORA" / SUSPENDED)
    const targetCompanyObj = companies.find((c) => normalizeCompanySlug(c.slug) === targetSlug);
    if (targetCompanyObj && targetCompanyObj.status === 'suspended') {
      const moraDetail = targetCompanyObj.moraReason
        ? ` Motivo: ${targetCompanyObj.moraReason}.`
        : '';
      setError(
        `⛔ SERVICIO EN MORA: El acceso para "${targetCompanyObj.name}" ha sido deshabilitado por pago/renovación pendiente.${moraDetail} Comunícate con el Administrador del sistema.`
      );
      setIsLoading(false);
      return;
    }

    // 3. STORE ADMIN LOGIN (Isolated for Tienda Gosén or Other Client)
    if (loginMode === 'admin') {
      const expectedCompanyPassword = (
        targetCompanyObj?.adminPassword ||
        (targetSlug === 'gosen'
          ? storeSettings?.accessPassword || 'GOSEN2026'
          : 'ADMIN2026')
      ).trim();

      const matchesSelectedCompany =
        cleanInput === expectedCompanyPassword ||
        cleanInput.toUpperCase() === expectedCompanyPassword.toUpperCase() ||
        (targetSlug === 'gosen' &&
          (cleanInput.toUpperCase() ===
            (storeSettings?.accessPassword || 'ADMIN2026').trim().toUpperCase() ||
            cleanInput.toUpperCase() === 'GOSEN2026' ||
            cleanInput.toUpperCase() === 'ADMIN2026'));

      // Or if user left 'gosen' selected by default on a fresh link, check if password matches another client's unique password
      const matchedOtherClient =
        !matchesSelectedCompany &&
        companies.find(
          (c) =>
            c.slug !== targetSlug &&
            c.adminPassword.trim().toUpperCase() === cleanInput.toUpperCase()
        );

      if (matchedOtherClient) {
        if (matchedOtherClient.status === 'suspended') {
          const moraDetail = matchedOtherClient.moraReason
            ? ` Motivo: ${matchedOtherClient.moraReason}.`
            : '';
          setError(
            `⛔ SERVICIO EN MORA: El acceso para "${matchedOtherClient.name}" se encuentra deshabilitado por falta de pago.${moraDetail}`
          );
          setIsLoading(false);
          return;
        }
        try {
          localStorage.removeItem('stockmaster_saas_owner_unlocked');
        } catch {}
        const clientSession: UserSession = {
          userId: `admin_${matchedOtherClient.slug}`,
          companyId: matchedOtherClient.slug,
          companyName: matchedOtherClient.name,
          isSuperAdmin: false,
          isStandaloneSaaS: false,
          userName: `Admin ${matchedOtherClient.name}`,
          username: 'admin',
          role: 'admin',
          allowedTabs: [
            'dashboard',
            'inventory',
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
        if (onSelectCompany) onSelectCompany(matchedOtherClient.slug);
        onLoginSuccess(clientSession, rememberMe);
        return;
      }

      if (matchesSelectedCompany) {
        try {
          localStorage.removeItem('stockmaster_saas_owner_unlocked');
        } catch {}

        const resolvedCompanyName =
          targetCompanyObj?.name ||
          (targetSlug === 'gosen' ? storeSettings?.storeName || 'Tienda Gosén' : targetSlug.toUpperCase());

        const adminSession: UserSession = {
          userId: `admin_${targetSlug}`,
          companyId: targetSlug,
          companyName: resolvedCompanyName,
          isSuperAdmin: false,
          isStandaloneSaaS: false,
          userName:
            targetSlug === 'gosen' ? 'Administrador Gosén' : `Admin ${resolvedCompanyName}`,
          username: 'admin',
          role: 'admin',
          allowedTabs: [
            'dashboard',
            'inventory',
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
        onLoginSuccess(adminSession, rememberMe);
      } else {
        setError('Contraseña de Administrador de tienda incorrecta.');
        setIsLoading(false);
      }
    } else {
      // 4. COLLABORATOR LOGIN MODE
      if (!usernameInput.trim()) {
        setError('Por favor ingresa tu nombre de usuario de colaborador.');
        setIsLoading(false);
        return;
      }

      const cleanUser = usernameInput.trim().toLowerCase();
      const foundUser = users.find(
        (u) =>
          u.username.toLowerCase() === cleanUser &&
          u.isActive !== false &&
          normalizeCompanySlug(u.companyId || 'gosen') === targetSlug
      );

      if (!foundUser) {
        setError(
          `No se encontró un colaborador activo con el usuario "${cleanUser}" en esta empresa.`
        );
        setIsLoading(false);
        return;
      }

      if (foundUser.password !== cleanInput) {
        setError('Contraseña de colaborador incorrecta.');
        setIsLoading(false);
        return;
      }

      try {
        localStorage.removeItem('stockmaster_saas_owner_unlocked');
      } catch {}

      const collabSession: UserSession = {
        userId: foundUser.id,
        companyId: targetSlug,
        companyName:
          targetCompanyObj?.name ||
          (targetSlug === 'gosen' ? storeSettings?.storeName || 'Tienda Gosén' : targetSlug.toUpperCase()),
        isSuperAdmin: false,
        isStandaloneSaaS: false,
        userName: foundUser.name,
        username: foundUser.username,
        role: 'collaborator',
        allowedTabs:
          foundUser.allowedTabs && foundUser.allowedTabs.length > 0
            ? foundUser.allowedTabs
            : ['sales', 'inventory', 'price-checker', 'catalog'],
      };

      onLoginSuccess(collabSession, rememberMe);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient glow effects */}
      <div
        className={`absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-3xl pointer-events-none ${
          loginMode === 'saas_owner' ? 'bg-teal-500/15' : 'bg-emerald-500/10'
        }`}
      />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-md p-6 sm:p-8 z-10">
        {/* Store / Portal Branding Header */}
        <div className="flex flex-col items-center text-center mb-4">
          {loginMode === 'saas_owner' ? (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-teal-600 to-amber-400 p-0.5 shadow-lg shadow-teal-500/20 flex items-center justify-center mb-3">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <Key className="w-8 h-8 text-amber-400" />
              </div>
            </div>
          ) : logoUrl ? (
            <div className="w-full max-w-[260px] h-20 sm:h-24 flex items-center justify-center overflow-hidden mb-3">
              <img
                src={logoUrl}
                alt={storeName}
                className="w-full h-full object-contain rounded-xl drop-shadow-md"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-3">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <Boxes className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
          )}

          <h1 className="text-2xl font-black text-white tracking-wide">{storeName}</h1>
          <p className="text-xs text-slate-400 mt-1">{tagline}</p>

          {/* Private Store Code Switcher (Hidden when in SaaS Owner mode) */}
          {loginMode !== 'saas_owner' && (
            <div className="mt-2 flex items-center justify-center w-full">
              {!showCompanySwitcher ? (
                <button
                  type="button"
                  onClick={() => setShowCompanySwitcher(true)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950/70 border border-slate-800/80 text-[10px] font-bold text-slate-400 hover:text-emerald-300 transition-colors cursor-pointer"
                  title="Cambiar código de empresa o negocio"
                >
                  <Building2 className="w-3 h-3 text-emerald-400" />
                  <span>Empresa: {normalizedSlug.toUpperCase()} (Cambiar)</span>
                </button>
              ) : (
                <div className="w-full mt-1 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 flex flex-col gap-1.5 text-left">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <Building2 className="w-3 h-3" /> Código de Empresa / Cliente
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowCompanySwitcher(false)}
                      className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      Cerrar
                    </button>
                  </div>
                  <input
                    type="text"
                    value={companySlugInput}
                    onChange={(e) => handleCompanyChange(e.target.value)}
                    placeholder="Ingresa el código de tu negocio"
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* Suspended / Mora Banner if the selected client is currently disabled */}
        {isCompanySuspended && (
          <div className="mb-4 p-3.5 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-left space-y-1">
            <div className="flex items-center gap-2 text-rose-300 font-black text-xs uppercase tracking-wider">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>Cuenta en Mora • Servicio Suspendido</span>
            </div>
            <p className="text-[11px] text-rose-200/90 leading-relaxed">
              El acceso a la aplicación para <strong>{storeName}</strong> ha sido deshabilitado temporalmente por mora o pago pendiente.
              {selectedCompany?.moraReason ? ` (${selectedCompany.moraReason})` : ''}
            </p>
          </div>
        )}

        {/* 3-Way Role / Portal Switcher: Administrador | Colaborador | Panel SaaS */}
        <div className="bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 grid grid-cols-3 gap-1 mb-5">
          <button
            type="button"
            onClick={() => {
              setLoginMode('admin');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
              loginMode === 'admin'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Admin Tienda</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginMode('collaborator');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
              loginMode === 'collaborator'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span className="truncate">Colaborador</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginMode('saas_owner');
              setError(null);
            }}
            className={`py-2 px-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1 ${
              loginMode === 'saas_owner'
                ? 'bg-teal-500/25 text-teal-200 border border-teal-400/50 shadow-sm'
                : 'text-slate-400 hover:text-teal-300'
            }`}
            title="Panel exclusivo para el Administrador General de SaaS"
          >
            <Key className="w-3.5 h-3.5 text-teal-400 shrink-0" />
            <span className="truncate">Panel SaaS</span>
          </button>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {loginMode === 'collaborator' && (
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                Usuario de Colaborador
              </label>

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
                    <option value="">-- Selecciona tu perfil de colaborador --</option>
                    {activeCollaborators.map((u) => (
                      <option key={u.id} value={u.username}>
                        👤 {u.name} (@{u.username})
                      </option>
                    ))}
                  </select>

                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <span>O escribe tu usuario manual:</span>
                    <input
                      type="text"
                      placeholder="ej. juan"
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
                      placeholder="Ingresa tu usuario (ej. juan)"
                      value={usernameInput}
                      onChange={(e) => {
                        setUsernameInput(e.target.value.toLowerCase().trim());
                        if (error) setError(null);
                      }}
                      className="w-full pl-10 pr-3 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 text-xs font-mono font-bold"
                    />
                  </div>
                  <p className="text-[11px] text-amber-400/90 font-medium">
                    ⚠️ Aún no se han registrado colaboradores en esta empresa. Inicia como Administrador para crearlos.
                  </p>
                </div>
              )}
            </div>
          )}

          {loginMode === 'saas_owner' && (
            <div className="p-3 rounded-xl bg-teal-950/40 border border-teal-500/30 text-[11px] text-teal-200 leading-relaxed">
              <strong className="text-teal-300 block mb-0.5">
                🔐 Acceso Exclusivo Propietario / Administrador SaaS
              </strong>
              Ingresa tu Clave Maestra para abrir el panel independiente de clientes, crear empresas o deshabilitar clientes en mora.
            </div>
          )}

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              {loginMode === 'saas_owner'
                ? 'Clave Maestra Administrador SaaS'
                : loginMode === 'admin'
                ? `Contraseña Administrador (${storeName})`
                : 'Contraseña o PIN de Acceso'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
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
                    : loginMode === 'admin'
                    ? 'Ingresa la contraseña de la tienda'
                    : 'Ingresa tu PIN/clave'
                }
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full pl-10 pr-10 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-sm font-medium font-mono"
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
          </div>

          {/* Error Message */}
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs animate-shake">
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
                Mantener sesión iniciada
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full mt-2 py-3 px-4 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg cursor-pointer disabled:opacity-50 ${
              loginMode === 'saas_owner'
                ? 'bg-teal-600 hover:bg-teal-500 active:bg-teal-700 shadow-teal-900/30'
                : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 shadow-emerald-900/30'
            }`}
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>
                  {loginMode === 'saas_owner'
                    ? 'Entrar al Panel Central SaaS'
                    : `Ingresar a ${storeName}`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Note */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500">
          <p>
            {loginMode === 'saas_owner'
              ? 'Consola Central de Licencias y Control de Mora'
              : `Almacén protegido • ${storeName}`}
          </p>
        </div>
      </div>
    </div>
  );
};
