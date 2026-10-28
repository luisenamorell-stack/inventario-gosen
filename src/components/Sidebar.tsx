import React, { useState, useRef } from 'react';
import { ActiveTab, StoreSettings, UserSession } from '../types';
import {
  Boxes,
  PieChart,
  List,
  ClipboardCheck,
  Tag,
  Truck,
  RotateCcw,
  Store,
  ChevronLeft,
  ChevronRight,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  ShoppingCart,
  FileText,
  Download,
  Globe,
  Users,
  Activity,
  User,
  ShieldCheck,
  Building2,
  Key,
  EyeOff
} from 'lucide-react';

export interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onResetData: () => void;
  storeSettings?: StoreSettings;
  userSession?: UserSession | null;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onLogout?: () => void;
  onOpenInstallPrompt?: () => void;
  onUnlockSuperAdmin?: (masterKey: string) => boolean;
  onLockSuperAdmin?: () => void;
  companyAllowedModules?: ActiveTab[];
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onResetData,
  storeSettings,
  userSession,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile = () => {},
  onLogout,
  onOpenInstallPrompt,
  onUnlockSuperAdmin,
  onLockSuperAdmin,
  companyAllowedModules,
}) => {
  const isGosen = (storeSettings?.companyId || 'gosen') === 'gosen';
  const storeName = storeSettings?.storeName || (isGosen ? 'Tienda Gosén' : 'Mi Tienda');
  const isAdmin = userSession?.role === 'admin';
  const isSuperAdmin = Boolean(isAdmin && userSession?.isSuperAdmin === true);

  // Secret 5-tap trigger on the Admin profile badge to unlock SaaS Owner Mode
  const tapCountRef = useRef<number>(0);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showSaaSUnlockModal, setShowSaaSUnlockModal] = useState(false);
  const [masterKeyInput, setMasterKeyInput] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const handleSecretAdminBadgeTap = () => {
    if (!isAdmin) return;
    if (isSuperAdmin) {
      onTabChange('companies');
      onCloseMobile();
      return;
    }
    tapCountRef.current += 1;
    if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    if (tapCountRef.current >= 5) {
      tapCountRef.current = 0;
      setMasterKeyInput('');
      setUnlockError(null);
      setShowSaaSUnlockModal(true);
    } else {
      tapTimerRef.current = setTimeout(() => {
        tapCountRef.current = 0;
      }, 2500);
    }
  };

  const handleConfirmUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUnlockSuperAdmin) return;
    const ok = onUnlockSuperAdmin(masterKeyInput.trim());
    if (ok) {
      setShowSaaSUnlockModal(false);
      setMasterKeyInput('');
      setUnlockError(null);
      onCloseMobile();
    } else {
      setUnlockError('Clave Maestra de Propietario SaaS incorrecta.');
    }
  };

  const allNavItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: PieChart,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'sales' as ActiveTab,
      label: 'Ventas (POS)',
      icon: ShoppingCart,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'inventory' as ActiveTab,
      label: 'Inventario',
      icon: List,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'price-checker' as ActiveTab,
      label: 'Consultar Precio',
      icon: Tag,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'catalog' as ActiveTab,
      label: 'Catálogo Digital (Link)',
      icon: Globe,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'purchases' as ActiveTab,
      label: 'Compras / Facturas',
      icon: FileText,
      activeColor: 'bg-indigo-600 text-white',
    },
    {
      id: 'audit' as ActiveTab,
      label: 'Conteo / Auditoría',
      icon: ClipboardCheck,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'suppliers' as ActiveTab,
      label: 'Proveedores',
      icon: Truck,
      activeColor: 'bg-indigo-600 text-white',
    },
    {
      id: 'users' as ActiveTab,
      label: 'Gestión Colaboradores',
      icon: Users,
      activeColor: 'bg-amber-600 text-white',
      adminOnly: true,
    },
    {
      id: 'activity' as ActiveTab,
      label: 'Registro Movimientos',
      icon: Activity,
      activeColor: 'bg-indigo-600 text-white',
      adminOnly: true,
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Ajustes Tienda',
      icon: Store,
      activeColor: 'bg-emerald-600 text-white',
      adminOnly: true,
    },
  ];

  // Filter items based on SaaS company module permissions + user role permissions
  const effectiveCompanyModules = companyAllowedModules || storeSettings?.allowedModules;
  const navItems = allNavItems.filter((item) => {
    // 1. Check SaaS company-level allowed modules (unless SuperAdmin is inspecting)
    if (!isSuperAdmin && effectiveCompanyModules && effectiveCompanyModules.length > 0) {
      if (!effectiveCompanyModules.includes(item.id)) return false;
    }
    if (!userSession) return true;
    if (userSession.role === 'admin') return true;
    // Collaborator: check allowed tabs
    return userSession.allowedTabs.includes(item.id);
  });

  const handleTabClick = (tabId: ActiveTab) => {
    onTabChange(tabId);
    onCloseMobile();
  };

  return (
    <>
      {/* ============================================================== */}
      {/* 1. MOBILE & TABLET BACKDROP OVERLAY (< md)                     */}
      {/* ============================================================== */}
      <div
        className={`fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-40 transition-opacity duration-350 ease-in-out md:hidden ${
          isMobileOpen
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none'
        }`}
        onClick={onCloseMobile}
        aria-hidden="true"
      />

      {/* ============================================================== */}
      {/* 2. MOBILE & TABLET DRAWER (< md)                               */}
      {/* ============================================================== */}
      <aside
        id="mobile-sidebar-drawer"
        aria-label="Menú principal de navegación"
        aria-hidden={!isMobileOpen}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col justify-between shadow-2xl transition-transform duration-350 ease-in-out md:hidden pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)] ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Mobile Drawer Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3 shrink-0">
            <button
              type="button"
              onClick={() => handleTabClick(isAdmin ? 'settings' : 'sales')}
              className="flex-1 flex items-center gap-3 text-left group overflow-hidden cursor-pointer min-w-0"
              title="Ajustes de tienda"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 overflow-hidden">
                {storeSettings?.logoUrl ? (
                  <img
                    src={storeSettings.logoUrl}
                    alt={storeName}
                    className="w-full h-full object-contain p-1"
                  />
                ) : (
                  <Boxes className="w-6 h-6 text-emerald-400" />
                )}
              </div>
              <span className="font-extrabold text-base sm:text-lg text-white tracking-wider uppercase truncate">
                {storeName.toUpperCase()}
              </span>
            </button>

            {/* Close Button */}
            <button
              type="button"
              onClick={onCloseMobile}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              aria-label="Cerrar menú"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Profile Badge */}
          {userSession && (
            <div className="px-3 pt-3 pb-1 border-b border-slate-800/80 bg-slate-950/40 shrink-0">
              <div
                onClick={handleSecretAdminBadgeTap}
                className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 select-none cursor-pointer"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    isAdmin
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-white truncate">{userSession.userName}</div>
                  <div className="text-[10px] text-slate-400 font-medium truncate uppercase">
                    {isSuperAdmin
                      ? '👑 Propietario SaaS'
                      : isAdmin
                      ? '👑 Administrador'
                      : '👤 Colaborador'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mobile Navigation List */}
          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-1">
              Navegación {isAdmin ? '(Admin)' : '(Colaborador)'}
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl transition-all cursor-pointer font-medium text-sm text-left ${
                    isActive
                      ? `${item.activeColor} shadow-md shadow-emerald-950/20 font-semibold`
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Logout Button Footer */}
          {onLogout && (
            <div className="p-3 border-t border-slate-800 shrink-0 space-y-2">
              {isSuperAdmin && onLockSuperAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    onLockSuperAdmin();
                    onCloseMobile();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-bold text-xs border border-teal-500/30 transition-colors cursor-pointer"
                >
                  <EyeOff className="w-3.5 h-3.5" />
                  <span>Ocultar Panel SaaS</span>
                </button>
              )}
              <button
                type="button"
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/30 transition-colors cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ============================================================== */}
      {/* 3. DESKTOP / PC SIDEBAR (>= md)                                */}
      {/* ============================================================== */}
      <aside
        id="desktop-sidebar"
        aria-label="Barra lateral de navegación"
        className={`hidden md:flex flex-col justify-between bg-slate-900 text-white shrink-0 border-r border-slate-800 shadow-xl z-30 transition-all duration-350 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="w-full flex flex-col min-w-0 flex-1 overflow-hidden">
          {/* Desktop Header with Store Logo */}
          <div className="h-20 border-b border-slate-800 flex items-center justify-center p-3 relative shrink-0">
            <button
              type="button"
              onClick={() => onTabChange(isAdmin ? 'settings' : 'sales')}
              title={isCollapsed ? `Tienda: ${storeName}` : "Ajustes de tienda"}
              className="w-full h-full flex items-center justify-center text-left cursor-pointer rounded-xl hover:bg-slate-800/60 transition-colors group p-1"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform overflow-hidden">
                  {storeSettings?.logoUrl ? (
                    <img
                      src={storeSettings.logoUrl}
                      alt={storeName}
                      className="w-full h-full object-contain p-1"
                    />
                  ) : (
                    <Boxes className="w-6 h-6 text-emerald-400" />
                  )}
                </div>
                {!isCollapsed && (
                  <span className="font-extrabold text-sm lg:text-base text-white tracking-wider uppercase truncate">
                    {storeName.toUpperCase()}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* User Profile Badge (Desktop) */}
          {userSession && !isCollapsed && (
            <div className="px-3 pt-3 pb-1 border-b border-slate-800/80 bg-slate-950/40 shrink-0">
              <div
                onClick={handleSecretAdminBadgeTap}
                className="flex items-center gap-2.5 p-2 rounded-xl bg-slate-800/60 border border-slate-700/60 select-none cursor-pointer"
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    isAdmin
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  }`}
                >
                  {isAdmin ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-xs text-white truncate">{userSession.userName}</div>
                  <div className="text-[10px] text-slate-400 font-medium truncate uppercase">
                    {isSuperAdmin
                      ? '👑 Propietario SaaS'
                      : isAdmin
                      ? '👑 Administrador'
                      : '👤 Colaborador'}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Desktop Navigation Items */}
          <nav className="p-3 space-y-1.5 flex-1 overflow-y-auto">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center rounded-xl transition-all cursor-pointer font-medium text-sm ${
                    isCollapsed
                      ? 'justify-center p-3'
                      : 'justify-start px-3.5 py-2.5'
                  } ${
                    isActive
                      ? `${item.activeColor} shadow-md shadow-emerald-950/20 font-semibold`
                      : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {!isCollapsed && (
                    <span className="ml-3 truncate">{item.label}</span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Desktop Logout Footer */}
        {onLogout && (
          <div className="p-3 border-t border-slate-800 shrink-0 space-y-2">
            {isSuperAdmin && onLockSuperAdmin && (
              <button
                type="button"
                onClick={onLockSuperAdmin}
                className={`w-full flex items-center rounded-xl bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 font-bold text-xs border border-teal-500/30 transition-colors cursor-pointer ${
                  isCollapsed ? 'justify-center p-3' : 'justify-center py-2 px-3 gap-2'
                }`}
                title="Ocultar Panel SaaS (Modo Tienda Normal)"
              >
                <EyeOff className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span>Ocultar Panel SaaS</span>}
              </button>
            )}
            <button
              type="button"
              onClick={onLogout}
              className={`w-full flex items-center rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/30 transition-colors cursor-pointer ${
                isCollapsed ? 'justify-center p-3' : 'justify-center py-2.5 px-3 gap-2'
              }`}
              title="Cerrar Sesión"
            >
              <LogOut className="w-4 h-4" />
              {!isCollapsed && <span>Cerrar Sesión</span>}
            </button>
          </div>
        )}
      </aside>

      {/* Secret SaaS Owner Unlock Modal (Triggered by 5 taps on Admin Badge) */}
      {showSaaSUnlockModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-5 text-white">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-white">Modo Propietario SaaS</h3>
                  <p className="text-[11px] text-slate-400">Desbloquear panel Mis Clientes</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSaaSUnlockModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmUnlock} className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                  Clave Maestra de Propietario
                </label>
                <input
                  type="password"
                  value={masterKeyInput}
                  onChange={(e) => {
                    setMasterKeyInput(e.target.value);
                    if (unlockError) setUnlockError(null);
                  }}
                  placeholder="Ingresa tu clave maestra SaaS"
                  autoFocus
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-xs font-mono font-bold text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {unlockError && (
                <p className="text-xs text-rose-400 font-semibold">{unlockError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowSaaSUnlockModal(false)}
                  className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-500 text-white text-xs font-extrabold cursor-pointer"
                >
                  Activar Panel SaaS
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
