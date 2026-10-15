import React from 'react';
import { ActiveTab } from '../types';
import {
  Boxes,
  PieChart,
  List,
  ClipboardCheck,
  Tag,
  Truck,
  RotateCcw
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  onResetData: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onResetData,
}) => {
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
  ];

  return (
    <nav className="bg-slate-900 text-white w-full md:w-20 lg:w-64 flex md:flex-col justify-between items-center md:items-start p-2 md:p-0 flex-shrink-0 transition-all duration-300 z-20 shadow-lg">
      <div className="md:w-full">
        {/* Logo and App Title */}
        <div className="hidden md:flex items-center justify-center lg:justify-start h-16 lg:px-6 border-b border-slate-800">
          <Boxes className="w-7 h-7 text-emerald-500 shrink-0" />
          <span className="ml-3 font-bold text-xl hidden lg:block tracking-wide">
            StockMaster
          </span>
        </div>

        {/* Mobile Header Logo */}
        <div className="flex md:hidden items-center gap-2 px-2 py-1">
          <Boxes className="w-6 h-6 text-emerald-500 shrink-0" />
          <span className="font-bold text-base tracking-wide">StockMaster</span>
        </div>

        {/* Navigation items */}
        <ul className="flex md:flex-col w-full md:mt-4 gap-1 md:gap-2 justify-around md:justify-start px-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <li key={item.id} className="w-full">
                <button
                  type="button"
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center justify-center lg:justify-start p-3 lg:px-4 rounded-xl transition-all cursor-pointer font-medium text-sm ${
                    isActive
                      ? `${item.activeColor} shadow-md`
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={item.label}
                >
                  <Icon className="w-5 h-5 shrink-0 text-center" />
                  <span className="ml-3 hidden lg:block">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Bottom utility: reset mock data */}
      <div className="md:w-full md:mb-4 px-2 hidden md:block">
        <button
          type="button"
          onClick={onResetData}
          className="w-full text-slate-400 flex items-center justify-center lg:justify-start p-3 lg:px-4 hover:bg-slate-800 hover:text-amber-400 rounded-xl transition-colors cursor-pointer text-sm"
          title="Reiniciar datos iniciales"
        >
          <RotateCcw className="w-5 h-5 shrink-0 text-center" />
          <span className="ml-3 hidden lg:block font-medium">Reiniciar Datos</span>
        </button>
      </div>
    </nav>
  );
};
