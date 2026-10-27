import React, { useState } from 'react';
import { StoreSettings, UserAccount, UserSession, UserRole } from '../types';
import { Lock, Eye, EyeOff, ShieldCheck, Boxes, AlertCircle, ArrowRight, User, Users } from 'lucide-react';

interface LoginViewProps {
  storeSettings?: StoreSettings;
  users?: UserAccount[];
  onLoginSuccess: (session: UserSession, remember: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  storeSettings,
  users = [],
  onLoginSuccess,
}) => {
  const [loginMode, setLoginMode] = useState<UserRole>('admin');
  const [usernameInput, setUsernameInput] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const storeName = storeSettings?.storeName || 'StockMaster';
  const logoUrl = storeSettings?.logoUrl;
  const tagline = storeSettings?.tagline;

  const activeCollaborators = users.filter((u) => u.isActive !== false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = password.trim();

    if (!cleanInput) {
      setError('Por favor ingresa la contraseña para continuar.');
      return;
    }

    setIsLoading(true);

    if (loginMode === 'admin') {
      const expectedPassword = (storeSettings?.accessPassword || 'GOSEN2026').trim();
      if (
        cleanInput === expectedPassword ||
        cleanInput.toUpperCase() === expectedPassword.toUpperCase()
      ) {
        const adminSession: UserSession = {
          userId: 'admin_master',
          userName: 'Administrador',
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
        setError('Contraseña de Administrador incorrecta.');
        setIsLoading(false);
      }
    } else {
      // Collaborator Login Mode
      if (!usernameInput.trim()) {
        setError('Por favor ingresa tu nombre de usuario de colaborador.');
        setIsLoading(false);
        return;
      }

      const cleanUser = usernameInput.trim().toLowerCase();
      const foundUser = users.find(
        (u) => u.username.toLowerCase() === cleanUser && u.isActive !== false
      );

      if (!foundUser) {
        setError(`No se encontró un colaborador activo con el usuario "${cleanUser}".`);
        setIsLoading(false);
        return;
      }

      if (foundUser.password !== cleanInput) {
        setError('Contraseña de colaborador incorrecta.');
        setIsLoading(false);
        return;
      }

      // Collaborator login success
      const collabSession: UserSession = {
        userId: foundUser.id,
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
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl shadow-2xl backdrop-blur-md p-6 sm:p-8 z-10">
        {/* Store Logo & Branding Header */}
        <div className="flex flex-col items-center text-center mb-5">
          {logoUrl ? (
            <div className="w-full max-w-[280px] h-20 sm:h-24 flex items-center justify-center overflow-hidden mb-3">
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

          <h1 className="text-2xl font-black text-white tracking-wide">
            {storeName}
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            {tagline || 'Sistema de Control de Inventario & Facturación'}
          </p>
        </div>

        {/* Role Mode Switcher (Administrador / Colaborador) */}
        <div className="bg-slate-950/80 p-1.5 rounded-2xl border border-slate-800 flex items-center gap-1 mb-5">
          <button
            type="button"
            onClick={() => {
              setLoginMode('admin');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              loginMode === 'admin'
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-amber-400" />
            <span>Administrador</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setLoginMode('collaborator');
              setError(null);
            }}
            className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              loginMode === 'collaborator'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Colaborador</span>
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
                    ⚠️ Aún no se han registrado colaboradores. Inicia como Administrador para crearlos en "Gestión de Usuarios".
                  </p>
                </div>
              )}
            </div>
          )}

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5"
            >
              {loginMode === 'admin' ? 'Contraseña Master de Administrador' : 'Contraseña o PIN de Acceso'}
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
                placeholder={loginMode === 'admin' ? 'Ingresa la contraseña admin' : 'Ingresa tu PIN/clave'}
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
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
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
            className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Ingresar como {loginMode === 'admin' ? 'Administrador' : 'Colaborador'}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer Note */}
        <div className="mt-6 pt-4 border-t border-slate-800/80 text-center text-xs text-slate-500">
          <p>
            Almacén protegido &bull; {storeName}
          </p>
        </div>
      </div>
    </div>
  );
};
