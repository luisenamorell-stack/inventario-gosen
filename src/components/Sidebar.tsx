import React from 'react';
import { ActiveTab, StoreSettings } from '../types';
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
  Globe
} from 'lucide-react';

export interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onResetData: () => void;
  storeSettings?: StoreSettings;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isMobileOpen?: boolean;
  onCloseMobile?: () => void;
  onLogout?: () => void;
  onOpenInstallPrompt?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onResetData,
  storeSettings,
  isCollapsed = false,
  onToggleCollapse,
  isMobileOpen = false,
  onCloseMobile = () => {},
  onLogout,
  onOpenInstallPrompt,
}) => {
  const storeName = storeSettings?.storeName || 'StockMaster';
  const logoUrl = storeSettings?.logoUrl;
  const tagline = storeSettings?.tagline;

  const navItems = [
    {
      id: 'dashboard' as ActiveTab,
      label: 'Dashboard',
      icon: PieChart,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'inventory' as ActiveTab,
      label: 'Inventario',
      icon: List,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'sales' as ActiveTab,
      label: 'Ventas (POS)',
      icon: ShoppingCart,
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
      id: 'price-checker' as ActiveTab,
      label: 'Consultar Precio',
      icon: Tag,
      activeColor: 'bg-emerald-600 text-white',
    },
    {
      id: 'suppliers' as ActiveTab,
      label: 'Proveedores',
      icon: Truck,
      activeColor: 'bg-indigo-600 text-white',
    },
    {
      id: 'settings' as ActiveTab,
      label: 'Ajustes Tienda',
      icon: Store,
      activeColor: 'bg-emerald-600 text-white',
    },
  ];

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
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 text-white flex flex-col justify-between shadow-2xl transition-transform duration-350 ease-in-out md:hidden ${
          isMobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full overflow-hidden">
          {/* Mobile Drawer Header */}
          <div className="p-4 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => handleTabClick('settings')}
              className="flex-1 flex items-center gap-3 text-left group overflow-hidden cursor-pointer min-w-0"
              title="Ajustes de tienda"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0">
                <Boxes className="w-6 h-6 text-emerald-400" />
              </div>
              <span className="font-extrabold text-base sm:text-lg text-white tracking-wider uppercase truncate">
                {(storeName || 'TIENDA GOSEN').toUpperCase()}
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

          {/* Mobile Navigation List */}
          <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
              Navegación
            </div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabClick(item.id)}
                  className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl transition-all cursor-pointer font-medium text-sm text-left ${
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
        <div className="w-full flex flex-col min-w-0">
          {/* Desktop Header with Store Logo */}
          <div className="h-20 border-b border-slate-800 flex items-center justify-center p-3 relative">
            <button
              type="button"
              onClick={() => onTabChange('settings')}
              title={isCollapsed ? `Tienda: ${storeName}` : "Ajustes de tienda"}
              className="w-full h-full flex items-center justify-center text-left cursor-pointer rounded-xl hover:bg-slate-800/60 transition-colors group p-1"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                  <Boxes className="w-6 h-6 text-emerald-400" />
                </div>
                {!isCollapsed && (
                  <span className="font-extrabold text-sm lg:text-base text-white tracking-wider uppercase truncate">
                    {(storeName || 'TIENDA GOSEN').toUpperCase()}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Desktop Navigation Items */}
          <nav className="p-3 space-y-1.5">
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
                      : 'justify-start px-3.5 py-3'
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
      </aside>
    </>
  );
};
