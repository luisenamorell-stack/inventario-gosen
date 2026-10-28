import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Product, AuditHistoryRecord, SaleRecord, StoreExpenseRecord } from '../types';
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
  Truck,
  DollarSign,
  Percent,
  Wallet,
  Receipt,
  Users
} from 'lucide-react';
import Chart from 'chart.js/auto';
import {
  DashboardStatCardsSkeleton,
  DashboardLowStockSkeleton,
} from './SkeletonLoaders';

interface DashboardViewProps {
  inventory: Product[];
  auditHistory: AuditHistoryRecord[];
  sales?: SaleRecord[];
  expenses?: StoreExpenseRecord[];
  isLoading?: boolean;
  onOpenNewProduct: () => void;
  onStartAudit: () => void;
  onNavigateToSales?: () => void;
  onNavigateToPurchases?: () => void;
  onNavigateToExpenses?: () => void;
  onNavigateToCredits?: () => void;
  onFilterInventoryByCode: (code: string) => void;
  onNavigateToAudit: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  inventory,
  auditHistory,
  sales = [],
  expenses = [],
  isLoading = false,
  onOpenNewProduct,
  onStartAudit,
  onNavigateToSales,
  onNavigateToPurchases,
  onNavigateToExpenses,
  onNavigateToCredits,
  onFilterInventoryByCode,
  onNavigateToAudit,
}) => {
  const chartCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);
  const [financePeriod, setFinancePeriod] = useState<'month' | 'today' | 'all'>('month');

  // Compute inventory & profit metrics with useMemo for instantaneous rendering
  const {
    totalModels,
    totalStock,
    totalValue,
    totalRetailValue,
    projectedInventoryProfit,
    avgInventoryMarginPct,
    lowStockItems,
    periodGrossProfit,
    periodSalesNetRevenue,
    periodExpensesTotal,
    periodNetFreeProfit,
    periodSalesCount,
    periodExpensesCount,
    pendingCreditBalanceTotal,
    pendingCreditCount,
  } = useMemo(() => {
    let stockSum = 0;
    let costSum = 0;
    let retailSum = 0;
    const lowItems: Product[] = [];
    const costByCode = new Map<string, number>();

    inventory.forEach((item) => {
      const st = Number(item.stock) || 0;
      const co = Number(item.cost) || 0;
      const pr = Number(item.price) || 0;
      const disc = Math.min(pr, Math.max(0, Number(item.discount) || 0));
      const finalPrice = Math.max(0, pr - disc);

      costByCode.set((item.code || '').trim().toLowerCase(), co);

      stockSum += st;
      costSum += st * co;
      retailSum += st * finalPrice;
      if (st <= 3) {
        lowItems.push(item);
      }
    });

    lowItems.sort((a, b) => Number(a.stock) - Number(b.stock));

    const invProfit = retailSum - costSum;
    const invMargin = retailSum > 0 ? (invProfit / retailSum) * 100 : 0;

    // Period boundaries
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const isWithinPeriod = (ts: number) => {
      if (financePeriod === 'today') return ts >= startOfToday;
      if (financePeriod === 'month') return ts >= startOfMonth;
      return true;
    };

    let salesNetRevSum = 0;
    let salesCostSum = 0;
    let salesCount = 0;
    let creditPendingSum = 0;
    let creditPendingTickets = 0;

    sales.forEach((s) => {
      if (s.status !== 'completed') return;

      // Track total pending accounts receivable ("Fiado")
      const due =
        s.balanceDue !== undefined
          ? Number(s.balanceDue)
          : s.paymentMethod === 'credit'
          ? Math.max(0, Number(s.total) - Number(s.amountPaid || 0))
          : 0;
      if (due > 0.01) {
        creditPendingSum += due;
        creditPendingTickets += 1;
      }

      if (!isWithinPeriod(s.timestamp || 0)) return;

      const netSaleRev = Math.max(
        0,
        (Number(s.subtotal) || Number(s.total) || 0) - (Number(s.discount) || 0)
      );
      let saleCost = 0;
      (s.items || []).forEach((it) => {
        const unitCost =
          Number(it.cost) ||
          costByCode.get((it.code || '').trim().toLowerCase()) ||
          0;
        saleCost += unitCost * (Number(it.quantity) || 0);
      });
      salesNetRevSum += netSaleRev;
      salesCostSum += saleCost;
      salesCount += 1;
    });

    let expensesSum = 0;
    let expensesCount = 0;
    expenses.forEach((exp) => {
      if (!isWithinPeriod(exp.timestamp || 0)) return;
      expensesSum += Number(exp.amount) || 0;
      expensesCount += 1;
    });

    const grossProfit = salesNetRevSum - salesCostSum;
    const netFreeProfit = grossProfit - expensesSum;

    return {
      totalModels: inventory.length,
      totalStock: stockSum,
      totalValue: costSum,
      totalRetailValue: retailSum,
      projectedInventoryProfit: invProfit,
      avgInventoryMarginPct: invMargin,
      lowStockItems: lowItems.slice(0, 25),
      periodGrossProfit: grossProfit,
      periodSalesNetRevenue: salesNetRevSum,
      periodExpensesTotal: expensesSum,
      periodNetFreeProfit: netFreeProfit,
      periodSalesCount: salesCount,
      periodExpensesCount: expensesCount,
      pendingCreditBalanceTotal: creditPendingSum,
      pendingCreditCount: creditPendingTickets,
    };
  }, [inventory, sales, expenses, financePeriod]);

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
    <div className="flex-1 min-h-0 p-3 sm:p-6 lg:p-8 h-full w-full overflow-y-auto scroll-container bg-slate-50/50 dark:bg-slate-950 transition-colors duration-200 pb-20 md:pb-24">
      {/* Header */}
      <header className="mb-4 sm:mb-8 flex flex-col md:flex-row md:justify-between md:items-end gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-slate-800 dark:text-white tracking-tight">
            Panel de Control
          </h1>
          <p className="text-xs sm:text-base text-slate-500 dark:text-slate-400 font-medium mt-0.5 sm:mt-1">
            Resumen general, finanzas operativas y métricas de tu inventario.
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
          {onNavigateToExpenses && (
            <button
              onClick={onNavigateToExpenses}
              className="bg-rose-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-rose-700 transition-all shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer shadow-rose-600/20"
            >
              <Wallet className="w-4 h-4 shrink-0" />
              <span>Gastos / Caja</span>
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
      {isLoading ? (
        <DashboardStatCardsSkeleton />
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6">
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
      )}

      {/* Real Net Profit Formula Card: Utilidad Bruta de Ventas − Gastos Operativos = Ganancia Neta Libre */}
      {!isLoading && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/80 p-4 sm:p-5 mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100 shrink-0">
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs sm:text-sm font-black text-slate-800 dark:text-white uppercase tracking-wide">
                  Estado de Resultados Real (Utilidad Bruta − Gastos = Ganancia Neta Libre)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Cálculo automático descontando el costo de mercadería y los gastos operativos del local
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                <button
                  type="button"
                  onClick={() => setFinancePeriod('today')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    financePeriod === 'today'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Hoy
                </button>
                <button
                  type="button"
                  onClick={() => setFinancePeriod('month')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    financePeriod === 'month'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Este Mes
                </button>
                <button
                  type="button"
                  onClick={() => setFinancePeriod('all')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    financePeriod === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Histórico
                </button>
              </div>

              {onNavigateToExpenses && (
                <button
                  type="button"
                  onClick={onNavigateToExpenses}
                  className="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-extrabold transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Registrar Gasto</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 sm:gap-4">
            {/* 1. Utilidad Bruta de Ventas */}
            <div className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-500">
                <span>1. Utilidad Bruta Ventas</span>
                <span className="text-emerald-600">{periodSalesCount} ventas</span>
              </div>
              <div className="text-lg sm:text-xl font-black text-slate-900 dark:text-white mt-1">
                L {periodGrossProfit.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Facturado neto: L {periodSalesNetRevenue.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
            </div>

            {/* 2. Menos Gastos Operativos */}
            <div
              onClick={onNavigateToExpenses}
              className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50 cursor-pointer hover:border-rose-300 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                <span>2. (−) Gastos del Local</span>
                <span>{periodExpensesCount} registros</span>
              </div>
              <div className="text-lg sm:text-xl font-black text-rose-600 dark:text-rose-400 mt-1">
                − L {periodExpensesTotal.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-rose-500/80 mt-0.5">
                Alquiler, energía, personal, bolsas, etc.
              </div>
            </div>

            {/* 3. Igual a Ganancia Neta Libre */}
            <div
              className={`p-3.5 rounded-xl border ${
                periodNetFreeProfit >= 0
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800/60'
                  : 'bg-rose-100/70 dark:bg-rose-950/60 border-rose-300 dark:border-rose-800'
              }`}
            >
              <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                <span>3. (=) Ganancia Neta Libre</span>
                <span className="px-1.5 py-0.5 rounded bg-white/80 text-[10px] font-black">
                  Real
                </span>
              </div>
              <div
                className={`text-lg sm:text-xl font-black mt-1 ${
                  periodNetFreeProfit >= 0
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : 'text-rose-700 dark:text-rose-400'
                }`}
              >
                {periodNetFreeProfit >= 0 ? '+ ' : '− '}L{' '}
                {Math.abs(periodNetFreeProfit).toLocaleString('es-HN', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">
                Ganancia en Stock: +L {projectedInventoryProfit.toLocaleString('es-HN', { maximumFractionDigits: 0 })} ({avgInventoryMarginPct.toFixed(0)}%)
              </div>
            </div>

            {/* 4. Cartera por Cobrar (Fiado) */}
            <div
              onClick={onNavigateToCredits}
              className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/50 cursor-pointer hover:border-amber-300 transition-colors"
            >
              <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                <span className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5" />
                  <span>Cuentas por Cobrar</span>
                </span>
                <span>{pendingCreditCount} pendientes</span>
              </div>
              <div className="text-lg sm:text-xl font-black text-amber-700 dark:text-amber-400 mt-1">
                L {pendingCreditBalanceTotal.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-[11px] text-amber-700/80 mt-0.5 flex items-center justify-between">
                <span>Ventas al Crédito / Fiado</span>
                <span className="underline font-bold">Cobrar →</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
            {isLoading && (
              <div className="absolute inset-0 z-10 bg-white dark:bg-slate-900 flex items-end justify-around gap-4 p-4">
                <div className="w-full h-3/5 animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md" />
                <div className="w-full h-4/5 animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md" />
                <div className="w-full h-2/5 animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md" />
                <div className="w-full h-3/4 animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md" />
              </div>
            )}
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
            {isLoading ? (
              <DashboardLowStockSkeleton count={4} />
            ) : lowStockItems.length === 0 ? (
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
