import React, { useState } from 'react';
import { StoreSettings } from '../types';
import { Lock, Eye, EyeOff, ShieldCheck, Boxes, AlertCircle, ArrowRight } from 'lucide-react';

interface LoginViewProps {
  storeSettings?: StoreSettings;
  onLoginSuccess: (remember: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  storeSettings,
  onLoginSuccess,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const storeName = storeSettings?.storeName || 'StockMaster';
  const logoUrl = storeSettings?.logoUrl;
  const tagline = storeSettings?.tagline;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanInput = password.trim();

    if (!cleanInput) {
      setError('Por favor ingresa la contraseña para continuar.');
      return;
    }

    setIsLoading(true);

    // Verify password against configured store password (defaults to GOSEN2026 if not changed)
    const expectedPassword = (storeSettings?.accessPassword || 'GOSEN2026').trim();

    setTimeout(() => {
      if (
        cleanInput === expectedPassword ||
        cleanInput.toUpperCase() === expectedPassword.toUpperCase()
      ) {
        onLoginSuccess(rememberMe);
      } else {
        setError('Contraseña incorrecta. Por favor verifica e intenta de nuevo.');
        setIsLoading(false);
      }
    }, 250);
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Background ambient glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Login Card */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl backdrop-blur-md p-6 sm:p-8 z-10">
        {/* Store Logo & Branding Header */}
        <div className="flex flex-col items-center text-center mb-6">
          {logoUrl ? (
            <div className="w-20 h-20 rounded-2xl bg-white/10 p-2.5 border border-slate-700/80 shadow-lg flex items-center justify-center overflow-hidden mb-3">
              <img
                src={logoUrl}
                alt={storeName}
                className="w-full h-full object-contain"
              />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center mb-3">
              <div className="w-full h-full bg-slate-900 rounded-[14px] flex items-center justify-center">
                <Boxes className="w-8 h-8 text-emerald-400" />
              </div>
            </div>
          )}

          <h1 className="text-2xl font-bold text-white tracking-wide">
            {storeName}
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            {tagline || 'Sistema de Control de Inventario & Auditoría'}
          </p>

          <div className="mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-medium text-emerald-400">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Acceso Protegido</span>
          </div>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2"
            >
              Contraseña de Acceso
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="w-5 h-5" />
              </div>
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder="Ingresa la contraseña"
                autoFocus
                disabled={isLoading}
                autoComplete="current-password"
                className="w-full pl-11 pr-11 py-3 bg-slate-950/80 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all text-sm font-medium"
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
            className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <span className="inline-block w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <span>Ingresar al Sistema</span>
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
