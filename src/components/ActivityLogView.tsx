import React, { useState, useMemo } from 'react';
import { ActivityLogRecord } from '../types';
import {
  Activity,
  Search,
  User,
  ShieldCheck,
  Calendar,
  Clock,
  Download,
  Filter,
  ShoppingCart,
  List,
  FileText,
  ClipboardCheck,
  Tag,
  Truck,
  Users,
  Store,
  RefreshCw,
  X
} from 'lucide-react';

interface ActivityLogViewProps {
  logs: ActivityLogRecord[];
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const ActivityLogView: React.FC<ActivityLogViewProps> = ({
  logs,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');

  // Unique users list for filtering dropdown
  const uniqueUsers = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.userName) set.add(l.userName.trim());
    });
    return Array.from(set).sort();
  }, [logs]);

  // Filtered Activity Logs
  const filteredLogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return logs.filter((log) => {
      // User filter
      if (userFilter !== 'all' && log.userName !== userFilter) return false;
      // Module filter
      if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;

      // Search query
      if (!q) return true;
      return (
        log.userName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q)) ||
        log.date.toLowerCase().includes(q)
      );
    });
  }, [logs, searchQuery, userFilter, moduleFilter]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      showToast('No hay registros de movimientos para exportar.', 'warning');
      return;
    }

    const headers = ['Fecha y Hora', 'Usuario / Empleado', 'Rol', 'Módulo', 'Acción Realizada', 'Detalles'];
    const rows = filteredLogs.map((l) => [
      `"${l.date}"`,
      `"${l.userName}"`,
      `"${l.userRole === 'admin' ? 'Administrador' : 'Colaborador'}"`,
      `"${l.module}"`,
      `"${l.action.replace(/"/g, '""')}"`,
      `"${(l.details || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `registro_movimientos_empleados_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Historial de movimientos exportado correctamente a CSV.', 'success');
  };

  const getModuleBadge = (moduleKey: string) => {
    switch (moduleKey) {
      case 'sales':
        return { label: 'Ventas (POS)', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: ShoppingCart };
      case 'inventory':
        return { label: 'Inventario', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: List };
      case 'purchases':
        return { label: 'Compras', color: 'bg-indigo-100 text-indigo-800 border-indigo-200', icon: FileText };
      case 'audit':
        return { label: 'Auditoría', color: 'bg-purple-100 text-purple-800 border-purple-200', icon: ClipboardCheck };
      case 'users':
        return { label: 'Usuarios', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: Users };
      case 'suppliers':
        return { label: 'Proveedores', color: 'bg-cyan-100 text-cyan-800 border-cyan-200', icon: Truck };
      default:
        return { label: moduleKey, color: 'bg-slate-100 text-slate-800 border-slate-200', icon: Activity };
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-50 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-32">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0 border border-indigo-200">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Registro de Movimientos del Personal
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Auditoría en tiempo real de todas las ventas, modificaciones de stock e ingresos realizados por colaboradores y administradores.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleExportCSV}
          className="bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-md flex items-center justify-center gap-2 cursor-pointer transition-all shrink-0 active:scale-95"
        >
          <Download className="w-4 h-4 text-emerald-400" />
          <span>Exportar Auditoría (CSV)</span>
        </button>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por empleado, acción o detalle..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {/* User Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <User className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="all">Todos los Empleados</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Module Filter */}
          <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="all">Todos los Módulos</option>
              <option value="sales">Ventas (POS)</option>
              <option value="inventory">Inventario</option>
              <option value="purchases">Compras</option>
              <option value="audit">Auditoría</option>
              <option value="users">Usuarios</option>
            </select>
          </div>
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Activity className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="font-bold text-slate-800 text-base">No hay movimientos registrados</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              A medida que los colaboradores cobren ventas, agreguen productos o realicen movimientos, se listarán automáticamente aquí.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredLogs.map((log) => {
              const modInfo = getModuleBadge(log.module);
              const ModIcon = modInfo.icon;
              const isAdminUser = log.userRole === 'admin';

              return (
                <div
                  key={log.id}
                  className="p-4 sm:p-5 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border shadow-2xs font-bold ${
                        isAdminUser
                          ? 'bg-amber-100 text-amber-800 border-amber-200'
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {isAdminUser ? <ShieldCheck className="w-5 h-5" /> : <User className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-black text-slate-900 text-sm">{log.userName}</span>
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.2 rounded-full border ${
                            isAdminUser
                              ? 'bg-amber-50 text-amber-800 border-amber-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}
                        >
                          {isAdminUser ? 'Administrador' : 'Colaborador'}
                        </span>

                        <span
                          className={`inline-flex items-center gap-1 text-[10px] font-extrabold uppercase px-2 py-0.2 rounded-full border ${modInfo.color}`}
                        >
                          <ModIcon className="w-3 h-3" />
                          <span>{modInfo.label}</span>
                        </span>
                      </div>

                      <div className="text-xs font-bold text-slate-800 break-words">
                        {log.action}
                      </div>

                      {log.details && (
                        <div className="text-xs text-slate-500 font-mono bg-slate-50 p-2 rounded-lg border border-slate-200/60 inline-block max-w-xl">
                          {log.details}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 text-xs font-medium text-slate-400 flex items-center gap-1.5 self-end sm:self-center bg-slate-100 sm:bg-transparent px-2.5 py-1 rounded-lg">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{log.date}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
