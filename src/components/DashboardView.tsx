import React, { useEffect, useRef } from 'react';
import { Product, AuditHistoryRecord, SaleRecord } from '../types';
import {
  Box,
  Layers,
  TrendingUp,
  AlertTriangle,
  Plus,
  QrCode,
  Bell,
  ArrowRight,
  ShieldCheck,
  FileSignature,
  Check,
  ArrowDown,
  ArrowUp,
  ShoppingCart,
  Truck
} from 'lucide-react';
import Chart from 'chart.js/auto';

interface DashboardViewProps {
  inventory: Product[];
  auditHistory: AuditHistoryRecord[];
  sales?: SaleRecord[];
  onOpenNewProduct: () => void;
  onStartAudit: () => void;
  onNavigateToSales?: () => void;
  onNavigateToPurchases?: () => void;
  onFilterInventoryByCode: (code: string) => void;
  onNavigateToAudit: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  inventory,
  auditHistory,
  sales = [],
  onOpenNewProduct,
  onStartAudit,
  onNavigateToSales,
  onNavigateToPurchases,
  onFilterInventoryByCode,
  onNavigateToAudit,
}) => {
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  // Compute metrics
  const totalModels = inventory.length;
  const totalStock = inventory.reduce((sum, item) => sum + (Number(item.stock) || 0), 0);
  const totalValue = inventory.reduce(
    (sum, item) => sum + (Number(item.stock) || 0) * (Number(item.cost) || 0),
    0
  );
  const lowStockItems = [...inventory]
    .filter((item) => Number(item.stock) <= 3)
    .sort((a, b) => Number(a.stock) - Number(b.stock));

  // Render Chart.js
  useEffect(() => {
    if (!chartCanvasRef.current) return;

    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
    }

    const categoryCounts: Record<string, number> = {};
    inventory.forEach((item) => {
      const cat = item.category || 'Otros';
      categoryCounts[cat] = (categoryCounts[cat] || 0) + (Number(item.stock) || 0);
    });

    const labels = Object.keys(categoryCounts);
    const data = Object.values(categoryCounts);

    const bgColors = [
      'rgba(16, 185, 129, 0.85)',
      'rgba(59, 130, 246, 0.85)',
      'rgba(139, 92, 246, 0.85)',
      'rgba(245, 158, 11, 0.85)',
      'rgba(236, 72, 153, 0.85)',
      'rgba(20, 184, 166, 0.85)',
    ];

    chartInstanceRef.current = new Chart(chartCanvasRef.current, {
      type: 'bar',
      data: {
        labels: labels.length > 0 ? labels : ['Sin Datos'],
        datasets: [
          {
            label: 'Unidades en Stock',
            data: data.length > 0 ? data : [0],
            backgroundColor: bgColors.slice(0, Math.max(labels.length, 1)),
            borderRadius: 8,
            maxBarThickness: 52,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(15, 23, 42, 0.9)',
            padding: 12,
            cornerRadius: 8,
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: '#f1f5f9' },
            ticks: { color: '#94a3b8' },
          },
          x: {
            grid: { display: false },
            ticks: { color: '#64748b', font: { weight: 'bold' } },
          },
        },
      },
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
      }
    };
  }, [inventory]);

  return (
    <div className="flex-1 min-h-0 p-3 sm:p-6 lg:p-8 h-full w-full overflow-y-auto scroll-container bg-slate-50/50 dark:bg-slate-950 transition-colors duration-200 pb-36 md:pb-24">
      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
            Panel de Control
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium mt-1">
            Resumen general y métricas de tu inventario.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-2.5 w-full md:w-auto">
          {onNavigateToSales && (
            <button
              onClick={onNavigateToSales}
              className="bg-emerald-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-emerald-700 transition-all shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-emerald-600/20"
            >
              <ShoppingCart className="w-4 h-4 shrink-0" />
              <span>Nueva Venta</span>
            </button>
          )}
          {onNavigateToPurchases && (
            <button
              onClick={onNavigateToPurchases}
              className="bg-indigo-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-indigo-600/20"
            >
              <Truck className="w-4 h-4 shrink-0" />
              <span>Ingresar Compra</span>
            </button>
          )}
          <button
            onClick={onOpenNewProduct}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Nuevo Producto</span>
          </button>
          <button
            onClick={onStartAudit}
            className="bg-slate-800 dark:bg-slate-800 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-700 dark:hover:bg-slate-700 transition-all shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer border border-slate-700"
          >
            <QrCode className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Auditar Stock</span>
          </button>
        </div>
      </header>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
        {/* Total Modelos */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex items-center group hover:border-blue-200 dark:hover:border-blue-800 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0 border border-blue-100 dark:border-blue-900/40">
            <Box className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">
              Total Modelos
            </p>
            <h3 className="text-3xl font-black text-slate-800 dark:text-white">{totalModels}</h3>
          </div>
        </div>

        {/* Unidades Físicas */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex items-center group hover:border-emerald-200 dark:hover:border-emerald-800 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0 border border-emerald-100 dark:border-emerald-900/40">
            <Layers className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">
              Unidades Físicas
            </p>
            <h3 className="text-3xl font-black text-slate-800 dark:text-white">{totalStock}</h3>
          </div>
        </div>

        {/* Inversión Stock */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex items-center group hover:border-purple-200 dark:hover:border-purple-800 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0 border border-purple-100 dark:border-purple-900/40">
            <TrendingUp className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">
              Inversión Stock
            </p>
            <h3 className="text-2xl font-black text-slate-800 dark:text-white truncate" title={`L ${totalValue.toFixed(2)}`}>
              L {totalValue.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
          </div>
        </div>

        {/* Alertas Stock */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex items-center group hover:border-orange-200 dark:hover:border-orange-800 transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/60 text-orange-600 dark:text-orange-400 flex items-center justify-center text-2xl mr-4 group-hover:scale-110 transition-transform shrink-0 border border-orange-100 dark:border-orange-900/40">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-xs text-slate-400 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">
              Alertas Stock
            </p>
            <h3 className="text-3xl font-black text-slate-800 dark:text-white">{lowStockItems.length}</h3>
          </div>
        </div>
      </div>

      {/* Main Content: Chart + Critical Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Category Chart (2 Cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col min-h-[350px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white">
              Distribución de Stock por Categoría
            </h3>
            <span className="text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700">
              Unidades Totales
            </span>
          </div>
          <div className="flex-1 relative w-full h-full min-h-[250px]">
            <canvas ref={chartCanvasRef}></canvas>
          </div>
        </div>

        {/* Low Stock Alerts (1 Col) */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col max-h-[400px]">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-orange-500 animate-pulse" />
            <span>Productos por Agotarse</span>
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-2 no-scrollbar">
            {lowStockItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 py-10">
                <ShieldCheck className="w-12 h-12 text-emerald-400/60 mb-3" />
                <p className="text-sm font-medium text-center">
                  Todo el stock está en<br />niveles óptimos.
                </p>
              </div>
            ) : (
              lowStockItems.map((item) => {
                const isZero = item.stock <= 0;
                return (
                  <div
                    key={item.id}
                    onClick={() => onFilterInventoryByCode(item.code)}
                    className="flex items-center p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-slate-700/80 shadow-[0_2px_10px_-3px_rgba(6,81,237,0.05)] hover:border-slate-300 dark:hover:border-slate-600 transition-colors cursor-pointer"
                    title="Ver en inventario"
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-sm mr-3 shrink-0">
                      {isZero ? (
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-orange-500" />
                      )}
                    </div>
                    <div className="overflow-hidden flex-1 mr-2">
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200 truncate" title={item.name}>
                        {item.name}
                      </p>
                      <p className="text-xs text-slate-400 font-mono">
                        Cód: {item.code} {item.size ? `· Talla: ${item.size}` : ''}
                      </p>
                    </div>
                    <div>
                      <span
                        className={`px-2.5 py-1 rounded-md text-xs font-bold ${
                          isZero ? 'bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900' : 'bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-900'
                        }`}
                      >
                        {item.stock} unids
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Historial de Auditorías Recientes */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 p-6 flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white">
            Historial de Auditorías
          </h3>
          <button
            onClick={onNavigateToAudit}
            className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1 cursor-pointer"
          >
            <span>Ver Módulo</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {auditHistory.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-10 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-xl">
            <FileSignature className="w-10 h-10 mb-3 opacity-30 mx-auto" />
            <p className="text-sm font-medium">Aún no se han realizado auditorías.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...auditHistory]
              .reverse()
              .slice(0, 6)
              .map((audit) => (
                <div
                  key={audit.id}
                  className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-800/60 shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="font-bold text-slate-800 dark:text-slate-200 text-sm flex items-center gap-1.5">
                        <FileSignature className="w-4 h-4 text-blue-500" />
                        <span>Cierre Audit.</span>
                      </p>
                      <p className="text-[11px] font-semibold text-slate-400 uppercase mt-0.5">
                        {audit.date}
                      </p>
                    </div>
                    <span className="bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 text-[10px] font-bold px-2 py-1 rounded border border-emerald-200 dark:border-emerald-800">
                      Aplicada
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 border-t border-slate-50 dark:border-slate-700/60 pt-3">
                    <div className="text-center bg-emerald-50/50 dark:bg-emerald-950/40 rounded py-1.5 border border-emerald-100 dark:border-emerald-900/30">
                      <p className="text-xs text-slate-500 mb-0.5 flex justify-center">
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                      </p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{audit.match}</p>
                    </div>
                    <div className="text-center bg-red-50/50 dark:bg-red-950/40 rounded py-1.5 border border-red-100 dark:border-red-900/30">
                      <p className="text-xs text-slate-500 mb-0.5 flex justify-center">
                        <ArrowDown className="w-3.5 h-3.5 text-red-500" />
                      </p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{audit.missing}</p>
                    </div>
                    <div className="text-center bg-orange-50/50 dark:bg-orange-950/40 rounded py-1.5 border border-orange-100 dark:border-orange-900/30">
                      <p className="text-xs text-slate-500 mb-0.5 flex justify-center">
                        <ArrowUp className="w-3.5 h-3.5 text-orange-500" />
                      </p>
                      <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{audit.extra}</p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};
