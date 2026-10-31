import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { ActivityLogRecord, StoreSettings } from '../types';
import { PrintFormatModal } from './PrintFormatModal';
import {
  buildActivityLogReportHtml,
  downloadActivityLogReportPdf,
} from '../utils/printPdfService';
import {
  Activity,
  Search,
  User,
  ShieldCheck,
  Clock,
  Calendar,
  Download,
  Filter,
  ShoppingCart,
  List,
  FileText,
  ClipboardCheck,
  Truck,
  Users,
  Printer,
  FileSpreadsheet,
  X,
  RotateCcw,
} from 'lucide-react';

interface ActivityLogViewProps {
  logs: ActivityLogRecord[];
  storeSettings?: StoreSettings;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

function splitDateAndTime(rawDate: string): { fecha: string; hora: string } {
  if (!rawDate) return { fecha: '-', hora: '-' };
  if (rawDate.includes(',')) {
    const [d, t] = rawDate.split(',');
    return { fecha: d.trim(), hora: (t || '').trim() || '-' };
  }
  const parts = rawDate.trim().split(/\s+/);
  if (parts.length >= 2) {
    return { fecha: parts[0], hora: parts.slice(1).join(' ') };
  }
  return { fecha: rawDate.trim(), hora: '-' };
}

function parseDetailSegments(details?: string): string[] {
  if (!details || !details.trim()) return [];
  return details
    .split(/\s*(?:\||•|\s-\s)\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractAmountFromDetails(details?: string): string {
  if (!details) return '-';
  const match = details.match(/L\.?\s*[\d,]+(?:\.\d{2})?/i);
  return match ? match[0].trim() : '-';
}

export const ActivityLogView: React.FC<ActivityLogViewProps> = ({
  logs,
  storeSettings,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [showPrintModal, setShowPrintModal] = useState(false);

  const resolvedStoreSettings: StoreSettings = storeSettings || {
    storeName: 'Tienda Gosén',
  };

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
      if (userFilter !== 'all' && log.userName !== userFilter) return false;
      if (moduleFilter !== 'all' && log.module !== moduleFilter) return false;

      if (!q) return true;
      return (
        log.userName.toLowerCase().includes(q) ||
        log.action.toLowerCase().includes(q) ||
        (log.details && log.details.toLowerCase().includes(q)) ||
        log.date.toLowerCase().includes(q)
      );
    });
  }, [logs, searchQuery, userFilter, moduleFilter]);

  // Summary metrics for clean KPI strip
  const summaryStats = useMemo(() => {
    const total = filteredLogs.length;
    const salesCount = filteredLogs.filter((l) => l.module === 'sales').length;
    const stockAndPurchasesCount = filteredLogs.filter(
      (l) => l.module === 'inventory' || l.module === 'purchases' || l.module === 'audit'
    ).length;
    const activeEmployees = new Set(filteredLogs.map((l) => l.userName).filter(Boolean)).size;
    return { total, salesCount, stockAndPurchasesCount, activeEmployees };
  }, [filteredLogs]);

  const getModuleBadge = (moduleKey: string) => {
    switch (moduleKey) {
      case 'sales':
        return {
          label: 'Ventas (POS)',
          color: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          icon: ShoppingCart,
        };
      case 'inventory':
        return {
          label: 'Inventario',
          color: 'bg-blue-50 text-blue-800 border-blue-200',
          icon: List,
        };
      case 'purchases':
        return {
          label: 'Compras',
          color: 'bg-indigo-50 text-indigo-800 border-indigo-200',
          icon: FileText,
        };
      case 'audit':
        return {
          label: 'Auditoría',
          color: 'bg-purple-50 text-purple-800 border-purple-200',
          icon: ClipboardCheck,
        };
      case 'users':
        return {
          label: 'Usuarios',
          color: 'bg-amber-50 text-amber-800 border-amber-200',
          icon: Users,
        };
      case 'suppliers':
        return {
          label: 'Proveedores',
          color: 'bg-cyan-50 text-cyan-800 border-cyan-200',
          icon: Truck,
        };
      default:
        return {
          label: moduleKey || 'General',
          color: 'bg-slate-100 text-slate-800 border-slate-200',
          icon: Activity,
        };
    }
  };

  const filterDescription = useMemo(() => {
    const parts: string[] = [];
    parts.push(`Empleado: ${userFilter === 'all' ? 'Todos' : userFilter}`);
    parts.push(
      `Módulo: ${moduleFilter === 'all' ? 'Todos' : getModuleBadge(moduleFilter).label}`
    );
    if (searchQuery.trim()) {
      parts.push(`Búsqueda: "${searchQuery.trim()}"`);
    }
    return parts.join(' | ');
  }, [userFilter, moduleFilter, searchQuery]);

  const hasActiveFilters =
    userFilter !== 'all' || moduleFilter !== 'all' || searchQuery.trim().length > 0;

  // Export to native Excel (.xlsx) with organized header, separate columns, auto-filter & spacious row/column sizing
  const handleExportExcel = () => {
    if (filteredLogs.length === 0) {
      showToast('No hay registros de movimientos para exportar.', 'warning');
      return;
    }

    const storeName = (resolvedStoreSettings.storeName || 'Tienda Gosén').toUpperCase();
    const emittedAt = new Date().toLocaleString('es-HN');

    const sheetAoA: (string | number)[][] = [
      [`${storeName} — BITÁCORA Y REGISTRO DE MOVIMIENTOS DEL PERSONAL`],
      [`Fecha de Emisión: ${emittedAt}   |   Total de Movimientos Exportados: ${filteredLogs.length}`],
      [`Filtros Aplicados: ${filterDescription}`],
      [],
      [
        'N°',
        'FECHA',
        'HORA',
        'EMPLEADO / USUARIO',
        'CARGO / ROL',
        'MÓDULO DEL SISTEMA',
        'ACCIÓN REALIZADA',
        'MONTO / VALOR',
        'DETALLE OPERATIVO COMPLETO',
      ],
    ];

    filteredLogs.forEach((l, idx) => {
      const { fecha, hora } = splitDateAndTime(l.date);
      const segments = parseDetailSegments(l.details);
      const formattedDetail = segments.length > 0 ? segments.join('   •   ') : l.details || '-';
      sheetAoA.push([
        idx + 1,
        fecha,
        hora,
        l.userName || '-',
        l.userRole === 'admin' ? 'Administrador' : 'Colaborador',
        getModuleBadge(l.module).label,
        l.action || '-',
        extractAmountFromDetails(l.details),
        formattedDetail,
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(sheetAoA);

    // Merge title and metadata rows across all 9 columns
    worksheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 8 } },
    ];

    // Add native Excel AutoFilter on the table header row (Row 5 -> index 4)
    worksheet['!autofilter'] = {
      ref: `A5:I${sheetAoA.length}`,
    };

    // Generous column widths so text never looks cramped in Excel
    worksheet['!cols'] = [
      { wch: 7 },  // N°
      { wch: 15 }, // FECHA
      { wch: 16 }, // HORA
      { wch: 26 }, // EMPLEADO / USUARIO
      { wch: 18 }, // CARGO / ROL
      { wch: 20 }, // MÓDULO DEL SISTEMA
      { wch: 44 }, // ACCIÓN REALIZADA
      { wch: 18 }, // MONTO / VALOR
      { wch: 64 }, // DETALLE OPERATIVO COMPLETO
    ];

    // Comfortable row heights so rows have vertical breathing room
    worksheet['!rows'] = [
      { hpt: 26 }, // Title row
      { hpt: 20 }, // Subtitle row
      { hpt: 20 }, // Filters row
      { hpt: 12 }, // Spacer row
      { hpt: 26 }, // Table Header row
      ...filteredLogs.map(() => ({ hpt: 22 })),
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Movimientos Personal');
    XLSX.writeFile(
      workbook,
      `Registro_Movimientos_${new Date().toISOString().slice(0, 10)}.xlsx`
    );
    showToast('Excel (.xlsx) exportado con columnas separadas y organizadas.', 'success');
  };

  // Direct PDF export
  const handleExportPdfDirect = async () => {
    if (filteredLogs.length === 0) {
      showToast('No hay registros de movimientos para exportar a PDF.', 'warning');
      return;
    }
    await downloadActivityLogReportPdf(
      filteredLogs,
      resolvedStoreSettings,
      filterDescription
    );
    showToast('Reporte de movimientos descargado en PDF (.pdf).', 'success');
  };

  return (
    <div className="flex-1 min-h-0 h-full w-full bg-slate-50 overflow-y-auto scroll-container p-4 sm:p-6 lg:p-8 space-y-5 pb-36 md:pb-24">
      {/* Header Banner & Action Toolbar */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200 shadow-2xs flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3.5">
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center font-bold shrink-0 border border-indigo-200/80">
            <Activity className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div>
            <h1 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight">
              Registro de Movimientos del Personal
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-0.5">
              Bitácora organizada de ventas, inventario, compras y operaciones por empleado.
            </p>
          </div>
        </div>

        {/* Organized Export & Print Toolbar */}
        <div className="w-full xl:w-auto flex flex-wrap items-center justify-start xl:justify-end gap-2.5 pt-2 xl:pt-0 border-t xl:border-t-0 border-slate-100">
          <button
            type="button"
            onClick={handleExportExcel}
            className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap"
            title="Descargar archivo de Excel (.xlsx) con columnas separadas y ordenadas"
          >
            <FileSpreadsheet className="w-4 h-4 shrink-0" />
            <span>Exportar Excel (.xlsx)</span>
          </button>

          <button
            type="button"
            onClick={handleExportPdfDirect}
            className="flex-1 sm:flex-initial bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap"
            title="Descargar reporte en PDF horizontal bien distribuido"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Descargar PDF</span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (filteredLogs.length === 0) {
                showToast('No hay registros de movimientos para imprimir.', 'warning');
                return;
              }
              setShowPrintModal(true);
            }}
            className="flex-1 sm:flex-initial bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs sm:text-sm px-4 py-2.5 rounded-xl shadow-2xs flex items-center justify-center gap-2 cursor-pointer transition-all whitespace-nowrap"
            title="Vista previa e impresión del registro de movimientos"
          >
            <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Imprimir</span>
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Total Movimientos
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-0.5 block tabular-nums">
              {summaryStats.total}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Operaciones Ventas
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-0.5 block tabular-nums">
              {summaryStats.salesCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <ShoppingCart className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Stock y Compras
            </span>
            <span className="text-xl sm:text-2xl font-black text-blue-700 mt-0.5 block tabular-nums">
              {summaryStats.stockAndPurchasesCount}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <List className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
              Personal Activo
            </span>
            <span className="text-xl sm:text-2xl font-black text-indigo-700 mt-0.5 block tabular-nums">
              {summaryStats.activeEmployees}
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre de empleado, acción realizada, monto o fecha..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Dropdown Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:flex items-center gap-2.5 text-xs">
          {/* User Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 min-w-[200px]">
            <User className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="w-full bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
            >
              <option value="all">Empleado: Todos</option>
              {uniqueUsers.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Module Filter */}
          <div className="flex items-center gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200 min-w-[190px]">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer text-xs"
            >
              <option value="all">Módulo: Todos</option>
              <option value="sales">Ventas (POS)</option>
              <option value="inventory">Inventario</option>
              <option value="purchases">Compras</option>
              <option value="audit">Auditoría</option>
              <option value="users">Usuarios</option>
              <option value="suppliers">Proveedores</option>
            </select>
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setUserFilter('all');
                setModuleFilter('all');
              }}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Limpiar filtros</span>
            </button>
          )}
        </div>
      </div>

      {/* Organized Activity Table / Cards Container */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-extrabold text-slate-800">
              Tabla de Movimientos Registrados
            </span>
            <span className="text-xs text-slate-400 hidden sm:inline">
              • Ordenado del más reciente al más antiguo
            </span>
          </div>
          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-extrabold px-3 py-1 rounded-lg tabular-nums">
            {filteredLogs.length} {filteredLogs.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Activity className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="font-bold text-slate-800 text-base">No hay movimientos registrados</p>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              A medida que los colaboradores cobren ventas, agreguen productos o realicen movimientos, se listarán ordenadamente aquí.
            </p>
          </div>
        ) : (
          <>
            {/* Desktop & Tablet Structured Table (>= md) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px] font-extrabold uppercase tracking-wider">
                    <th className="py-3.5 px-4 text-center w-14">N°</th>
                    <th className="py-3.5 px-4 w-32">Fecha</th>
                    <th className="py-3.5 px-4 w-32">Hora</th>
                    <th className="py-3.5 px-4 w-52">Empleado</th>
                    <th className="py-3.5 px-4 w-36">Cargo / Rol</th>
                    <th className="py-3.5 px-4 w-40">Módulo</th>
                    <th className="py-3.5 px-4 min-w-[230px]">Acción Realizada</th>
                    <th className="py-3.5 px-4 min-w-[280px]">Detalle Operativo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/80 text-xs sm:text-sm">
                  {filteredLogs.map((log, index) => {
                    const modInfo = getModuleBadge(log.module);
                    const ModIcon = modInfo.icon;
                    const isAdminUser = log.userRole === 'admin';
                    const { fecha, hora } = splitDateAndTime(log.date);
                    const detailSegments = parseDetailSegments(log.details);

                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/90 transition-colors align-top"
                      >
                        {/* N° */}
                        <td className="py-4 px-4 text-center font-mono text-xs font-bold text-slate-400 tabular-nums">
                          {index + 1}
                        </td>

                        {/* Fecha */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-bold text-slate-800 text-xs tabular-nums">
                            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{fecha}</span>
                          </div>
                        </td>

                        {/* Hora */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5 font-medium text-slate-600 text-xs tabular-nums">
                            <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{hora}</span>
                          </div>
                        </td>

                        {/* Empleado */}
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border font-bold ${
                                isAdminUser
                                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              {isAdminUser ? (
                                <ShieldCheck className="w-4 h-4" />
                              ) : (
                                <User className="w-4 h-4" />
                              )}
                            </div>
                            <span className="font-bold text-slate-900 text-xs sm:text-sm leading-snug">
                              {log.userName}
                            </span>
                          </div>
                        </td>

                        {/* Cargo / Rol */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center text-[11px] font-bold px-2.5 py-1 rounded-md border ${
                              isAdminUser
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {isAdminUser ? 'Administrador' : 'Colaborador'}
                          </span>
                        </td>

                        {/* Módulo */}
                        <td className="py-4 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md border ${modInfo.color}`}
                          >
                            <ModIcon className="w-3.5 h-3.5 shrink-0" />
                            <span>{modInfo.label}</span>
                          </span>
                        </td>

                        {/* Acción Realizada */}
                        <td className="py-4 px-4">
                          <p className="font-bold text-slate-900 text-xs sm:text-sm leading-relaxed">
                            {log.action}
                          </p>
                        </td>

                        {/* Detalle Operativo */}
                        <td className="py-4 px-4">
                          {detailSegments.length > 1 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {detailSegments.map((seg, i) => (
                                <span
                                  key={i}
                                  className="inline-block text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md"
                                >
                                  {seg}
                                </span>
                              ))}
                            </div>
                          ) : log.details ? (
                            <span className="inline-block text-xs font-medium text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md">
                              {log.details}
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Organized Cards (< md) */}
            <div className="md:hidden divide-y divide-slate-200/80">
              {filteredLogs.map((log, index) => {
                const modInfo = getModuleBadge(log.module);
                const ModIcon = modInfo.icon;
                const isAdminUser = log.userRole === 'admin';
                const { fecha, hora } = splitDateAndTime(log.date);
                const detailSegments = parseDetailSegments(log.details);

                return (
                  <div key={log.id} className="p-4 space-y-3 bg-white">
                    {/* Top Row: # + Module + Date/Time */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                          #{index + 1}
                        </span>
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${modInfo.color}`}
                        >
                          <ModIcon className="w-3 h-3 shrink-0" />
                          <span>{modInfo.label}</span>
                        </span>
                      </div>
                      <div className="text-right text-[11px] font-semibold text-slate-600 tabular-nums">
                        <span>{fecha}</span>
                        {hora !== '-' && <span className="text-slate-400"> • {hora}</span>}
                      </div>
                    </div>

                    {/* Middle Row: Employee & Role */}
                    <div className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                      <div className="flex items-center gap-2 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
                            isAdminUser
                              ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
                        >
                          {isAdminUser ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {log.userName}
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border shrink-0 ${
                          isAdminUser
                            ? 'bg-amber-50 text-amber-800 border-amber-200'
                            : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        {isAdminUser ? 'Administrador' : 'Colaborador'}
                      </span>
                    </div>

                    {/* Action & Separated Details */}
                    <div className="space-y-1.5">
                      <div className="text-xs font-bold text-slate-900 leading-snug">
                        {log.action}
                      </div>
                      {detailSegments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {detailSegments.map((seg, i) => (
                            <span
                              key={i}
                              className="text-[11px] font-medium text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-md"
                            >
                              {seg}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Print & PDF Preview Modal for Activity Logs */}
      <PrintFormatModal
        isOpen={showPrintModal}
        onClose={() => setShowPrintModal(false)}
        title="Reporte de Movimientos del Personal"
        subtitle={`${filteredLogs.length} registros • ${filterDescription}`}
        storeSettings={resolvedStoreSettings}
        defaultFormat="letter"
        buildHtml={(fmt) =>
          buildActivityLogReportHtml(
            filteredLogs,
            resolvedStoreSettings,
            fmt,
            filterDescription
          )
        }
        onDownloadPdf={() =>
          downloadActivityLogReportPdf(
            filteredLogs,
            resolvedStoreSettings,
            filterDescription
          )
        }
        showToast={showToast}
      />
    </div>
  );
};

