import React, { useState, useMemo } from 'react';
import {
  Product,
  SaleRecord,
  StoreSettings,
  UserSession,
  CashRegisterShift,
  CashOutMovement,
  StoreExpenseRecord,
  ExpenseCategory,
  CreditPaymentAbone,
  POSFinanceStoreData,
} from '../types';
import {
  Wallet,
  DollarSign,
  Plus,
  Trash2,
  Printer,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Lock,
  Unlock,
  ArrowDownRight,
  ArrowUpRight,
  Users,
  Search,
  Calendar,
  Receipt,
  TrendingUp,
  CreditCard,
  Building,
  FileText,
  X,
  Download,
  Phone,
  User,
} from 'lucide-react';
import { WhatsAppIcon } from './SalesView';
import { PrintFormatModal } from './PrintFormatModal';
import {
  buildShiftArqueoHtml,
  downloadShiftArqueoPdf,
  buildCreditStatementHtml,
  downloadCreditStatementPdf,
  buildCreditPortfolioReportHtml,
  downloadCreditPortfolioReportPdf,
  buildIncomeStatementHtml,
  downloadIncomeStatementPdf,
} from '../utils/printPdfService';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Alquiler',
  'Energía / Servicios',
  'Pago de Personal',
  'Bolsas / Empaque',
  'Transporte / Envíos',
  'Publicidad',
  'Mantenimiento',
  'Otros',
];

interface POSFinanceTabsProps {
  mode: 'cash-register' | 'credits' | 'expenses';
  inventory: Product[];
  sales: SaleRecord[];
  storeSettings: StoreSettings;
  userSession?: UserSession | null;
  posFinanceData: POSFinanceStoreData;
  onSavePOSFinanceData: (updated: POSFinanceStoreData) => Promise<void>;
  onRecordCreditPayment: (sale: SaleRecord, abone: CreditPaymentAbone) => Promise<SaleRecord>;
  onViewSaleTicket: (sale: SaleRecord) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const POSFinanceTabs: React.FC<POSFinanceTabsProps> = ({
  mode,
  inventory,
  sales,
  storeSettings,
  userSession,
  posFinanceData,
  onSavePOSFinanceData,
  onRecordCreditPayment,
  onViewSaleTicket,
  showToast,
}) => {
  const currentUserName = userSession?.userName || 'Administrador';
  const shifts = posFinanceData.shifts || [];
  const expenses = posFinanceData.expenses || [];
  const activeShift = useMemo(() => shifts.find((s) => s.status === 'open') || null, [shifts]);

  // ==================== 1. CASH REGISTER / ARQUEO STATE ====================
  const [openingCashInput, setOpeningCashInput] = useState<string>('');
  const [cashOutAmount, setCashOutAmount] = useState<string>('');
  const [cashOutReason, setCashOutReason] = useState<string>('');
  const [cashOutCategory, setCashOutCategory] = useState<ExpenseCategory>('Otros');
  const [alsoRecordInExpenses, setAlsoRecordInExpenses] = useState<boolean>(true);
  const [countedCashInput, setCountedCashInput] = useState<string>('');
  const [closingNotes, setClosingNotes] = useState<string>('');
  const [isSavingShift, setIsSavingShift] = useState<boolean>(false);

  // Print & PDF Modal States
  const [shiftForPrintModal, setShiftForPrintModal] = useState<CashRegisterShift | null>(null);
  const [creditSaleForPrintModal, setCreditSaleForPrintModal] = useState<SaleRecord | null>(null);
  const [showCreditPortfolioPrintModal, setShowCreditPortfolioPrintModal] = useState<boolean>(false);
  const [showIncomeStatementPrintModal, setShowIncomeStatementPrintModal] = useState<boolean>(false);

  // Live metrics for the currently open shift
  const activeShiftMetrics = useMemo(() => {
    if (!activeShift) {
      return {
        cashSales: 0,
        transferSales: 0,
        cardSales: 0,
        creditSales: 0,
        creditAbonosCash: 0,
        cashOutTotal: 0,
        expectedCash: 0,
        salesCount: 0,
      };
    }

    let cashSales = 0;
    let transferSales = 0;
    let cardSales = 0;
    let creditSales = 0;
    let creditAbonosCash = 0;
    let salesCount = 0;

    sales.forEach((s) => {
      if (s.status !== 'completed') return;

      // Sales created during this shift
      if (s.timestamp >= activeShift.openedAt) {
        salesCount += 1;
        if (s.paymentMethod === 'cash') {
          cashSales += Number(s.total) || 0;
        } else if (s.paymentMethod === 'transfer') {
          transferSales += Number(s.total) || 0;
        } else if (s.paymentMethod === 'card') {
          cardSales += Number(s.total) || 0;
        } else if (s.paymentMethod === 'credit') {
          creditSales += Number(s.total) || 0;
          // Initial deposit paid at checkout on credit sale
          const initAbonos = Array.isArray(s.creditPayments) ? s.creditPayments : [];
          if (initAbonos.length === 0 && (Number(s.amountPaid) || 0) > 0) {
            cashSales += Number(s.amountPaid) || 0;
          }
        }
      }

      // Credit abonos received in cash during this shift (even from older credit sales)
      if (Array.isArray(s.creditPayments)) {
        s.creditPayments.forEach((cp) => {
          if (cp.timestamp >= activeShift.openedAt && cp.paymentMethod === 'cash') {
            creditAbonosCash += Number(cp.amount) || 0;
          }
        });
      }
    });

    const cashOutTotal = (activeShift.cashMovements || []).reduce(
      (sum, m) => sum + (Number(m.amount) || 0),
      0
    );

    const expectedCash =
      (Number(activeShift.openingCash) || 0) + cashSales + creditAbonosCash - cashOutTotal;

    return {
      cashSales,
      transferSales,
      cardSales,
      creditSales,
      creditAbonosCash,
      cashOutTotal,
      expectedCash,
      salesCount,
    };
  }, [activeShift, sales]);

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const openAmt = Math.max(0, parseFloat(openingCashInput) || 0);
    setIsSavingShift(true);
    try {
      const now = new Date();
      const newShift: CashRegisterShift = {
        id: `shift_${Date.now()}`,
        companyId: posFinanceData.companyId,
        status: 'open',
        openedAt: now.getTime(),
        openedDate: now.toLocaleString('es-HN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        openedBy: currentUserName,
        openingCash: openAmt,
        cashMovements: [],
      };
      await onSavePOSFinanceData({
        ...posFinanceData,
        shifts: [newShift, ...shifts],
        updatedAt: Date.now(),
      });
      setOpeningCashInput('');
      showToast(`Caja abierta con efectivo inicial de L. ${openAmt.toFixed(2)}`, 'success');
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleAddCashOutMovement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    const amt = parseFloat(cashOutAmount) || 0;
    if (amt <= 0) {
      showToast('Ingresa un monto válido para la salida de efectivo', 'warning');
      return;
    }
    if (!cashOutReason.trim()) {
      showToast('Describe el motivo de la salida de efectivo', 'warning');
      return;
    }

    setIsSavingShift(true);
    try {
      const now = new Date();
      const newMov: CashOutMovement = {
        id: `mov_${Date.now()}`,
        amount: amt,
        reason: cashOutReason.trim(),
        category: cashOutCategory,
        timestamp: now.getTime(),
        dateFormatted: now.toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' }),
        user: currentUserName,
      };

      const updatedShifts = shifts.map((s) =>
        s.id === activeShift.id
          ? { ...s, cashMovements: [newMov, ...(s.cashMovements || [])] }
          : s
      );

      let updatedExpenses = expenses;
      if (alsoRecordInExpenses) {
        const expRecord: StoreExpenseRecord = {
          id: `exp_${Date.now()}`,
          companyId: posFinanceData.companyId,
          date: now.toISOString().slice(0, 10),
          timestamp: now.getTime(),
          category: cashOutCategory,
          description: `${cashOutReason.trim()} (Salida de Caja)`,
          amount: amt,
          paymentMethod: 'cash',
          registeredBy: currentUserName,
          fromCashDrawer: true,
        };
        updatedExpenses = [expRecord, ...expenses];
      }

      await onSavePOSFinanceData({
        ...posFinanceData,
        shifts: updatedShifts,
        expenses: updatedExpenses,
        updatedAt: Date.now(),
      });

      setCashOutAmount('');
      setCashOutReason('');
      showToast(
        alsoRecordInExpenses
          ? `Salida de L. ${amt.toFixed(2)} registrada en Caja y en Gastos Operativos`
          : `Salida de caja de L. ${amt.toFixed(2)} registrada`,
        'success'
      );
    } finally {
      setIsSavingShift(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShift) return;
    if (countedCashInput.trim() === '') {
      showToast('Ingresa el efectivo físico contado en la gaveta al cerrar', 'warning');
      return;
    }
    const counted = Math.max(0, parseFloat(countedCashInput) || 0);
    const diff = Number((counted - activeShiftMetrics.expectedCash).toFixed(2));

    setIsSavingShift(true);
    try {
      const now = new Date();
      const closedShift: CashRegisterShift = {
        ...activeShift,
        status: 'closed',
        closedAt: now.getTime(),
        closedDate: now.toLocaleString('es-HN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        closedBy: currentUserName,
        cashSalesTotal: activeShiftMetrics.cashSales,
        transferSalesTotal: activeShiftMetrics.transferSales,
        cardSalesTotal: activeShiftMetrics.cardSales,
        creditSalesTotal: activeShiftMetrics.creditSales,
        creditAbonosCashTotal: activeShiftMetrics.creditAbonosCash,
        cashOutTotal: activeShiftMetrics.cashOutTotal,
        expectedCashInDrawer: activeShiftMetrics.expectedCash,
        countedPhysicalCash: counted,
        difference: diff,
        notes: closingNotes.trim(),
      };

      const updatedShifts = shifts.map((s) => (s.id === activeShift.id ? closedShift : s));
      await onSavePOSFinanceData({
        ...posFinanceData,
        shifts: updatedShifts,
        updatedAt: Date.now(),
      });

      setCountedCashInput('');
      setClosingNotes('');
      showToast('Turno cerrado y arqueo de caja guardado exitosamente', 'success');
    } finally {
      setIsSavingShift(false);
    }
  };

  const handlePrintShiftReport = (shift: CashRegisterShift) => {
    setShiftForPrintModal(shift);
  };

  // ==================== 2. CREDIT ACCOUNTS / CARTERA STATE ====================
  const [creditSearch, setCreditSearch] = useState<string>('');
  const [creditFilter, setCreditFilter] = useState<'pending' | 'paid' | 'all'>('pending');
  const [selectedSaleForAbone, setSelectedSaleForAbone] = useState<SaleRecord | null>(null);
  const [aboneAmount, setAboneAmount] = useState<string>('');
  const [aboneMethod, setAboneMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [aboneNotes, setAboneNotes] = useState<string>('');
  const [isSubmittingAbone, setIsSubmittingAbone] = useState<boolean>(false);

  const creditSales = useMemo(() => {
    return sales.filter(
      (s) =>
        s.status === 'completed' &&
        (s.paymentMethod === 'credit' || (s.balanceDue !== undefined && s.balanceDue > 0) || (s.creditPayments && s.creditPayments.length > 0))
    );
  }, [sales]);

  const filteredCreditSales = useMemo(() => {
    const q = creditSearch.trim().toLowerCase();
    return creditSales.filter((s) => {
      const bal =
        s.balanceDue !== undefined
          ? Number(s.balanceDue)
          : Math.max(0, Number(s.total) - Number(s.amountPaid || 0));
      const isPaid = bal <= 0.01 || s.creditStatus === 'paid';

      if (creditFilter === 'pending' && isPaid) return false;
      if (creditFilter === 'paid' && !isPaid) return false;

      if (q) {
        const matchCust = (s.customerName || '').toLowerCase().includes(q);
        const matchPhone = (s.customerPhone || '').toLowerCase().includes(q);
        const matchNum = (s.saleNumber || '').toLowerCase().includes(q);
        if (!matchCust && !matchPhone && !matchNum) return false;
      }
      return true;
    });
  }, [creditSales, creditSearch, creditFilter]);

  const creditPortfolioStats = useMemo(() => {
    let totalReceivable = 0;
    let totalCollectedFromCredits = 0;
    let pendingAccountsCount = 0;
    let overdueCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    creditSales.forEach((s) => {
      const bal =
        s.balanceDue !== undefined
          ? Number(s.balanceDue)
          : Math.max(0, Number(s.total) - Number(s.amountPaid || 0));
      const paid = Math.max(0, Number(s.amountPaid) || 0);
      totalCollectedFromCredits += paid;
      if (bal > 0.01) {
        totalReceivable += bal;
        pendingAccountsCount += 1;
        if (s.creditDueDate && s.creditDueDate < todayStr) {
          overdueCount += 1;
        }
      }
    });

    return { totalReceivable, totalCollectedFromCredits, pendingAccountsCount, overdueCount };
  }, [creditSales]);

  const handleSubmitCreditAbone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForAbone) return;

    const currentBal =
      selectedSaleForAbone.balanceDue !== undefined
        ? Number(selectedSaleForAbone.balanceDue)
        : Math.max(0, Number(selectedSaleForAbone.total) - Number(selectedSaleForAbone.amountPaid || 0));

    const amt = parseFloat(aboneAmount) || 0;
    if (amt <= 0 || amt > currentBal + 0.05) {
      showToast(`Ingresa un abono válido (máximo L. ${currentBal.toFixed(2)})`, 'warning');
      return;
    }

    setIsSubmittingAbone(true);
    try {
      const now = new Date();
      const newAbone: CreditPaymentAbone = {
        id: `abn_${Date.now()}`,
        amount: Math.min(currentBal, amt),
        paymentMethod: aboneMethod,
        timestamp: now.getTime(),
        date: now.toLocaleString('es-HN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
        receivedBy: currentUserName,
        notes: aboneNotes.trim() || '',
      };

      const updatedSale = await onRecordCreditPayment(selectedSaleForAbone, newAbone);
      setSelectedSaleForAbone(null);
      setAboneAmount('');
      setAboneNotes('');
      showToast(
        (updatedSale.balanceDue || 0) <= 0.01
          ? `¡Cuenta de ${updatedSale.customerName} liquidada en su totalidad!`
          : `Abono de L. ${newAbone.amount.toFixed(2)} registrado. Nuevo saldo: L. ${(updatedSale.balanceDue || 0).toFixed(2)}`,
        'success'
      );
    } finally {
      setIsSubmittingAbone(false);
    }
  };

  const handleSendCreditReminderWhatsApp = (sale: SaleRecord) => {
    const bal =
      sale.balanceDue !== undefined
        ? Number(sale.balanceDue)
        : Math.max(0, Number(sale.total) - Number(sale.amountPaid || 0));
    const paid = Number(sale.amountPaid) || 0;
    const storeTitle = (storeSettings.storeName || 'NUESTRA TIENDA').toUpperCase();

    let msg = `👋 Hola *${sale.customerName || 'Estimado Cliente'}*, le saludamos de *${storeTitle}*.\n\n`;
    msg += `Le compartimos el estado de cuenta actualizado de su compra al crédito:\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📄 *Factura / Ticket:* ${sale.saleNumber}\n`;
    msg += `📅 *Fecha de Compra:* ${sale.date}\n`;
    if (sale.creditDueDate) {
      msg += `⏰ *Fecha de Vencimiento:* ${sale.creditDueDate}\n`;
    }
    msg += `\n🛍️ *Detalle de Artículos:*\n`;
    (sale.items || []).forEach((it) => {
      msg += `• ${it.quantity}x ${it.name} — L. ${it.subtotal.toFixed(2)}\n`;
    });
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *Total Factura:* L. ${sale.total.toFixed(2)}\n`;
    msg += `✅ *Total Abonado:* L. ${paid.toFixed(2)}\n`;
    msg += `📌 *SALDO PENDIENTE:* *L. ${bal.toFixed(2)}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if ((sale.creditPayments || []).length > 0) {
      msg += `📋 *Historial de Abonos:*\n`;
      sale.creditPayments!.forEach((cp) => {
        msg += `  • ${cp.date}: L. ${cp.amount.toFixed(2)}\n`;
      });
      msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    }
    msg += `Agradecemos su puntualidad y preferencia. ✨`;

    const rawPhone = (sale.customerPhone || '').replace(/\D/g, '');
    const finalPhone = rawPhone.length === 8 ? `504${rawPhone}` : rawPhone;
    const url = finalPhone
      ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // ==================== 3. OPERATING EXPENSES & NET PROFIT STATE ====================
  const [expCategory, setExpCategory] = useState<ExpenseCategory>('Alquiler');
  const [expDescription, setExpDescription] = useState<string>('');
  const [expAmount, setExpAmount] = useState<string>('');
  const [expPaymentMethod, setExpPaymentMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [expDate, setExpDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [expPeriodFilter, setExpPeriodFilter] = useState<'month' | 'today' | 'week' | 'all'>('month');
  const [isSavingExpense, setIsSavingExpense] = useState<boolean>(false);

  const inventoryCostMap = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((p) => map.set((p.code || '').trim().toLowerCase(), Number(p.cost) || 0));
    return map;
  }, [inventory]);

  const financialStatement = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    const matchesPeriod = (ts: number) => {
      if (expPeriodFilter === 'today') return ts >= startOfToday;
      if (expPeriodFilter === 'week') return ts >= startOfWeek;
      if (expPeriodFilter === 'month') return ts >= startOfMonth;
      return true;
    };

    let grossSalesRevenue = 0;
    let totalCostOfGoods = 0;
    let salesCount = 0;

    sales.forEach((s) => {
      if (s.status !== 'completed' || !matchesPeriod(s.timestamp || 0)) return;
      salesCount += 1;
      const netRev = Math.max(
        0,
        (Number(s.subtotal) || Number(s.total) || 0) - (Number(s.discount) || 0)
      );
      grossSalesRevenue += netRev;
      (s.items || []).forEach((it) => {
        const unitCost =
          Number(it.cost) || inventoryCostMap.get((it.code || '').trim().toLowerCase()) || 0;
        totalCostOfGoods += unitCost * (Number(it.quantity) || 0);
      });
    });

    const filteredExpenses = expenses.filter((e) => matchesPeriod(e.timestamp || 0));
    const totalOperatingExpenses = filteredExpenses.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0
    );

    const grossProfit = grossSalesRevenue - totalCostOfGoods;
    const netFreeProfit = grossProfit - totalOperatingExpenses;
    const netMarginPct = grossSalesRevenue > 0 ? (netFreeProfit / grossSalesRevenue) * 100 : 0;

    const byCategory: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + (Number(e.amount) || 0);
    });

    return {
      grossSalesRevenue,
      totalCostOfGoods,
      grossProfit,
      totalOperatingExpenses,
      netFreeProfit,
      netMarginPct,
      salesCount,
      filteredExpenses,
      byCategory,
    };
  }, [sales, expenses, expPeriodFilter, inventoryCostMap]);

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(expAmount) || 0;
    if (amt <= 0) {
      showToast('Ingresa un monto válido para el gasto', 'warning');
      return;
    }
    if (!expDescription.trim()) {
      showToast('Ingresa una descripción para el gasto operativo', 'warning');
      return;
    }

    setIsSavingExpense(true);
    try {
      const parsedTs = expDate ? new Date(`${expDate}T12:00:00`).getTime() : Date.now();
      const newExp: StoreExpenseRecord = {
        id: `exp_${Date.now()}`,
        companyId: posFinanceData.companyId,
        date: expDate || new Date().toISOString().slice(0, 10),
        timestamp: Number.isNaN(parsedTs) ? Date.now() : parsedTs,
        category: expCategory,
        description: expDescription.trim(),
        amount: amt,
        paymentMethod: expPaymentMethod,
        registeredBy: currentUserName,
      };

      await onSavePOSFinanceData({
        ...posFinanceData,
        expenses: [newExp, ...expenses],
        updatedAt: Date.now(),
      });

      setExpDescription('');
      setExpAmount('');
      showToast(`Gasto operativo de L. ${amt.toFixed(2)} (${expCategory}) registrado`, 'success');
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expenseId: string) => {
    const updated = expenses.filter((e) => e.id !== expenseId);
    await onSavePOSFinanceData({
      ...posFinanceData,
      expenses: updated,
      updatedAt: Date.now(),
    });
    showToast('Registro de gasto eliminado', 'info');
  };

  // ==================== RENDER MODE 1: CASH REGISTER / ARQUEO ====================
  if (mode === 'cash-register') {
    const countedNum = parseFloat(countedCashInput) || 0;
    const liveDiff = countedCashInput.trim() !== '' ? countedNum - activeShiftMetrics.expectedCash : 0;

    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container p-3 sm:p-6 space-y-5 pb-32">
        {/* Top Status Banner */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
            activeShift
              ? 'bg-emerald-950 text-white border-emerald-700'
              : 'bg-slate-900 text-white border-slate-800'
          }`}
        >
          <div className="flex items-start gap-3.5">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                activeShift
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {activeShift ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                    activeShift
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-amber-500 text-slate-950'
                  }`}
                >
                  {activeShift ? 'TURNO EN CURSO • CAJA ABIERTA' : 'CAJA CERRADA'}
                </span>
                {activeShift && (
                  <span className="text-xs text-emerald-200 font-mono">
                    Desde: {activeShift.openedDate} • Cajero: {activeShift.openedBy}
                  </span>
                )}
              </div>
              <h2 className="text-lg sm:text-xl font-black mt-1">
                {activeShift
                  ? `Efectivo Esperado en Gaveta: L. ${activeShiftMetrics.expectedCash.toFixed(2)}`
                  : 'Apertura de Turno / Caja Diaria'}
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                {activeShift
                  ? 'El sistema suma automáticamente tus ventas en efectivo, abonos de clientes y descuenta las salidas de caja.'
                  : 'Registra con cuánto dinero en efectivo inicia la caja hoy para llevar el control exacto del turno.'}
              </p>
            </div>
          </div>

          {activeShift ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() =>
                  handlePrintShiftReport({
                    ...activeShift,
                    cashSalesTotal: activeShiftMetrics.cashSales,
                    transferSalesTotal: activeShiftMetrics.transferSales,
                    cardSalesTotal: activeShiftMetrics.cardSales,
                    creditSalesTotal: activeShiftMetrics.creditSales,
                    creditAbonosCashTotal: activeShiftMetrics.creditAbonosCash,
                    cashOutTotal: activeShiftMetrics.cashOutTotal,
                    expectedCashInDrawer: activeShiftMetrics.expectedCash,
                  })
                }
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs cursor-pointer transition-all flex items-center gap-1.5"
                title="Imprimir o descargar en PDF el corte parcial del turno actual"
              >
                <Printer className="w-4 h-4 text-emerald-300" />
                <span>Imprimir / PDF Corte Parcial</span>
              </button>
            </div>
          ) : (
            <form onSubmit={handleOpenShift} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  L.
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  placeholder="Efectivo inicial (ej. 1500)"
                  value={openingCashInput}
                  onChange={(e) => setOpeningCashInput(e.target.value)}
                  className="w-full sm:w-52 pl-8 pr-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSavingShift}
                className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-md"
              >
                <Unlock className="w-4 h-4" />
                <span>Abrir Caja Ahora</span>
              </button>
            </form>
          )}
        </div>

        {/* Live Shift Breakdown + Cash Out + Close Shift */}
        {activeShift && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Column 1: Live Cash Drawer Calculation */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  <span>Resumen de Efectivo del Turno</span>
                </h3>
                <span className="text-[11px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-lg">
                  {activeShiftMetrics.salesCount} ventas
                </span>
              </div>

              <div className="space-y-2.5 text-xs sm:text-sm">
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">(+) Efectivo Inicial (Apertura):</span>
                  <span className="font-bold text-slate-900">
                    L. {activeShift.openingCash.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">(+) Ventas en Efectivo:</span>
                  <span className="font-bold text-emerald-700">
                    + L. {activeShiftMetrics.cashSales.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">(+) Abonos Crédito en Efectivo:</span>
                  <span className="font-bold text-emerald-700">
                    + L. {activeShiftMetrics.creditAbonosCash.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                  <span className="text-slate-600 font-medium">(−) Salidas de Efectivo / Gastos:</span>
                  <span className="font-bold text-rose-600">
                    − L. {activeShiftMetrics.cashOutTotal.toFixed(2)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between">
                  <span className="font-extrabold text-emerald-950 text-xs uppercase">
                    (=) Efectivo Esperado en Caja:
                  </span>
                  <span className="text-base sm:text-lg font-black text-emerald-800">
                    L. {activeShiftMetrics.expectedCash.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Other payment methods during shift */}
              <div className="pt-2 space-y-1.5 text-xs text-slate-600">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Otros Medios de Pago en este Turno
                </p>
                <div className="flex justify-between">
                  <span>Transferencias Bancarias:</span>
                  <span className="font-bold text-slate-800">
                    L. {activeShiftMetrics.transferSales.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas con Tarjeta (POS):</span>
                  <span className="font-bold text-slate-800">
                    L. {activeShiftMetrics.cardSales.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Ventas al Crédito (Fiado):</span>
                  <span className="font-bold text-amber-700">
                    L. {activeShiftMetrics.creditSales.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Column 2: Record Cash Out / Petty Cash Expense */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 flex flex-col">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <ArrowDownRight className="w-4 h-4 text-rose-600" />
                  <span>Registrar Salida de Efectivo (Caja Chica)</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Registra retiros de la gaveta para pagos rápidos (agua, bolsas, envío, comida, etc.)
                </p>
              </div>

              <form onSubmit={handleAddCashOutMovement} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Monto a Retirar (L.)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={cashOutAmount}
                      onChange={(e) => setCashOutAmount(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Categoría
                    </label>
                    <select
                      value={cashOutCategory}
                      onChange={(e) => setCashOutCategory(e.target.value as ExpenseCategory)}
                      className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold bg-white"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Motivo / Descripción
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. Compra de bolsas, pago de flete, agua..."
                    value={cashOutReason}
                    onChange={(e) => setCashOutReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={alsoRecordInExpenses}
                    onChange={(e) => setAlsoRecordInExpenses(e.target.checked)}
                    className="rounded text-rose-600 focus:ring-rose-500"
                  />
                  <span>Sumar también al módulo de Gastos Operativos del Local</span>
                </label>

                <button
                  type="submit"
                  disabled={isSavingShift}
                  className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5"
                >
                  <Plus className="w-4 h-4" />
                  <span>Registrar Salida de Efectivo</span>
                </button>
              </form>

              {/* List of cash movements in current shift */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pt-2 border-t border-slate-100 max-h-40">
                {(activeShift.cashMovements || []).length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">
                    Sin salidas de efectivo en este turno.
                  </p>
                ) : (
                  activeShift.cashMovements.map((m) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-bold text-slate-800 truncate">{m.reason}</p>
                        <p className="text-[10px] text-slate-400">
                          {m.dateFormatted} • {m.category}
                        </p>
                      </div>
                      <span className="font-black text-rose-600 shrink-0">
                        - L. {m.amount.toFixed(2)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Column 3: Final Count & Close Shift (Arqueo) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  <span>Arqueo y Cierre de Turno</span>
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cuenta los billetes y monedas físicos en gaveta y compáralos contra el saldo esperado.
                </p>
              </div>

              <form onSubmit={handleCloseShift} className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Dinero Físico Contado en Caja (L.)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                      L.
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder={activeShiftMetrics.expectedCash.toFixed(2)}
                      value={countedCashInput}
                      onChange={(e) => setCountedCashInput(e.target.value)}
                      className="w-full pl-8 pr-20 py-2.5 rounded-xl border border-slate-300 text-sm font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setCountedCashInput(activeShiftMetrics.expectedCash.toFixed(2))}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-lg border border-indigo-200 cursor-pointer"
                    >
                      Cuadre Exacto
                    </button>
                  </div>
                </div>

                {countedCashInput.trim() !== '' && (
                  <div
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between ${
                      Math.abs(liveDiff) < 0.01
                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                        : liveDiff > 0
                        ? 'bg-blue-50 border-blue-200 text-blue-800'
                        : 'bg-rose-50 border-rose-200 text-rose-800'
                    }`}
                  >
                    <span>Diferencia de Arqueo:</span>
                    <span className="text-sm font-black">
                      {Math.abs(liveDiff) < 0.01
                        ? '✓ Cuadre Exacto (L. 0.00)'
                        : liveDiff > 0
                        ? `Sobrante: + L. ${liveDiff.toFixed(2)}`
                        : `Faltante: − L. ${Math.abs(liveDiff).toFixed(2)}`}
                    </span>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Observaciones del Cierre (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Se dejó fondo de L. 1,000 para mañana..."
                    value={closingNotes}
                    onChange={(e) => setClosingNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSavingShift}
                  className="w-full py-3 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs sm:text-sm cursor-pointer transition-all flex items-center justify-center gap-2 shadow-md"
                >
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Cerrar Turno y Guardar Arqueo</span>
                </button>
              </form>
            </div>
          </div>
        )}

        {/* History of Closed Shifts */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm">
              Historial de Arqueos y Cierres de Caja ({shifts.filter((s) => s.status === 'closed').length})
            </h3>
          </div>

          {shifts.filter((s) => s.status === 'closed').length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              Aún no hay cierres de caja registrados.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Apertura / Cierre</th>
                    <th className="py-3 px-4">Cajero</th>
                    <th className="py-3 px-4 text-right">Inicial</th>
                    <th className="py-3 px-4 text-right">Ventas Efec.</th>
                    <th className="py-3 px-4 text-right">Salidas</th>
                    <th className="py-3 px-4 text-right">Esperado</th>
                    <th className="py-3 px-4 text-right">Contado</th>
                    <th className="py-3 px-4 text-center">Diferencia</th>
                    <th className="py-3 px-4 text-center">Reporte</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts
                    .filter((s) => s.status === 'closed')
                    .map((s) => {
                      const diff = Number(s.difference || 0);
                      return (
                        <tr key={s.id} className="hover:bg-slate-50">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800">{s.closedDate}</div>
                            <div className="text-[10px] text-slate-400">Abrió: {s.openedDate}</div>
                          </td>
                          <td className="py-3 px-4 font-semibold text-slate-700">
                            {s.closedBy || s.openedBy}
                          </td>
                          <td className="py-3 px-4 text-right font-mono">
                            L. {(s.openingCash || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-emerald-700 font-bold">
                            +L. {((s.cashSalesTotal || 0) + (s.creditAbonosCashTotal || 0)).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono text-rose-600">
                            -L. {(s.cashOutTotal || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                            L. {(s.expectedCashInDrawer || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-black text-slate-900">
                            L. {(s.countedPhysicalCash || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                                Math.abs(diff) < 0.01
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : diff > 0
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {Math.abs(diff) < 0.01
                                ? 'Exacto'
                                : diff > 0
                                ? `+L. ${diff.toFixed(2)}`
                                : `-L. ${Math.abs(diff).toFixed(2)}`}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handlePrintShiftReport(s)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                                title="Imprimir reporte de arqueo (Elegir Impresora)"
                              >
                                <Printer className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  downloadShiftArqueoPdf(s, storeSettings);
                                  showToast('PDF de Arqueo de Caja descargado.', 'success');
                                }}
                                className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                                title="Descargar Arqueo en PDF (.pdf)"
                              >
                                <Download className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Multi-Printer & PDF Modal for Shift Arqueo */}
        {shiftForPrintModal && (
          <PrintFormatModal
            isOpen={Boolean(shiftForPrintModal)}
            onClose={() => setShiftForPrintModal(null)}
            title="Reporte de Arqueo y Cierre de Caja"
            subtitle={`Cajero: ${shiftForPrintModal.closedBy || shiftForPrintModal.openedBy}`}
            storeSettings={storeSettings}
            buildHtml={(fmt) => buildShiftArqueoHtml(shiftForPrintModal, storeSettings, fmt)}
            onDownloadPdf={() => downloadShiftArqueoPdf(shiftForPrintModal, storeSettings)}
            showToast={showToast}
          />
        )}
      </div>
    );
  }

  // ==================== RENDER MODE 2: CREDIT ACCOUNTS / CARTERA ====================
  if (mode === 'credits') {
    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container p-3 sm:p-6 space-y-5 pb-32">
        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-amber-700 block">
              Total por Cobrar (Cartera)
            </span>
            <span className="text-xl sm:text-2xl font-black text-amber-700 mt-1 block">
              L. {creditPortfolioStats.totalReceivable.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400">Saldo pendiente en la calle</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-slate-500 block">
              Cuentas Pendientes
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
              {creditPortfolioStats.pendingAccountsCount}
            </span>
            <span className="text-[11px] text-slate-400">Facturas al crédito activas</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-emerald-700 block">
              Total Abonado / Recuperado
            </span>
            <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block">
              L. {creditPortfolioStats.totalCollectedFromCredits.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400">Primas y abonos recibidos</span>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-rose-700 block">
              Créditos Vencidos
            </span>
            <span className="text-xl sm:text-2xl font-black text-rose-600 mt-1 block">
              {creditPortfolioStats.overdueCount}
            </span>
            <span className="text-[11px] text-slate-400">Pasaron su fecha límite</span>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente, teléfono o N° de factura..."
              value={creditSearch}
              onChange={(e) => setCreditSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setCreditFilter('pending')}
                className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
                  creditFilter === 'pending'
                    ? 'bg-amber-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pendientes ({creditPortfolioStats.pendingAccountsCount})
              </button>
              <button
                type="button"
                onClick={() => setCreditFilter('paid')}
                className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
                  creditFilter === 'paid'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Pagadas
              </button>
              <button
                type="button"
                onClick={() => setCreditFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
                  creditFilter === 'all'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todas ({creditSales.length})
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                if (filteredCreditSales.length === 0) {
                  showToast('No hay cuentas por cobrar en esta vista para imprimir.', 'warning');
                  return;
                }
                setShowCreditPortfolioPrintModal(true);
              }}
              className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Imprimir o descargar en PDF la Cartera de Cuentas por Cobrar"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Imprimir / PDF Cartera</span>
            </button>
          </div>
        </div>

        {/* Credit Accounts List */}
        {filteredCreditSales.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
            <p className="font-bold text-slate-700 text-base">
              No hay cuentas por cobrar en esta vista
            </p>
            <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
              Para registrar una venta al crédito ("Fiado"), selecciona el método de pago{' '}
              <strong>"Crédito / Fiado"</strong> al cobrar en la pestaña Nueva Venta (POS).
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredCreditSales.map((sale) => {
              const bal =
                sale.balanceDue !== undefined
                  ? Number(sale.balanceDue)
                  : Math.max(0, Number(sale.total) - Number(sale.amountPaid || 0));
              const paid = Number(sale.amountPaid) || 0;
              const isPaid = bal <= 0.01 || sale.creditStatus === 'paid';
              const abonos = sale.creditPayments || [];

              return (
                <div
                  key={sale.id}
                  className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4 ${
                    isPaid ? 'border-emerald-200' : 'border-amber-200/90'
                  }`}
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs bg-slate-100 text-slate-800 px-2 py-0.5 rounded">
                            {sale.saleNumber}
                          </span>
                          <span
                            className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                              isPaid
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {isPaid ? 'PAGADO / LIQUIDADO' : 'SALDO PENDIENTE'}
                          </span>
                        </div>
                        <h3 className="text-base font-black text-slate-900 mt-1 flex items-center gap-1.5">
                          <User className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>{sale.customerName || 'Cliente'}</span>
                        </h3>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-0.5">
                          {sale.customerPhone && (
                            <span className="flex items-center gap-1 font-semibold text-emerald-700">
                              <Phone className="w-3 h-3" />
                              {sale.customerPhone}
                            </span>
                          )}
                          <span>Fecha: {sale.date}</span>
                          {sale.creditDueDate && (
                            <span className="text-rose-600 font-bold">
                              Vence: {sale.creditDueDate}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          Saldo Pendiente
                        </span>
                        <span
                          className={`text-lg sm:text-xl font-black block ${
                            isPaid ? 'text-emerald-600' : 'text-amber-700'
                          }`}
                        >
                          L. {bal.toFixed(2)}
                        </span>
                        <span className="text-[11px] text-slate-400 block">
                          Total: L. {sale.total.toFixed(2)} | Abonado: L. {paid.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {/* Items summary */}
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                      {(sale.items || []).map((it, idx) => (
                        <div key={idx} className="flex justify-between text-slate-700">
                          <span>
                            <strong>{it.quantity}x</strong> {it.name}
                          </span>
                          <span className="font-semibold">L. {it.subtotal.toFixed(2)}</span>
                        </div>
                      ))}
                    </div>

                    {/* Abonos History */}
                    {abonos.length > 0 && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                          Historial de Abonos ({abonos.length})
                        </p>
                        <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                          {abonos.map((cp) => (
                            <div
                              key={cp.id}
                              className="flex items-center justify-between text-[11px] bg-emerald-50/60 border border-emerald-100 px-2.5 py-1 rounded-lg"
                            >
                              <span className="text-slate-600">
                                {cp.date} ({cp.paymentMethod === 'cash' ? 'Efectivo' : cp.paymentMethod === 'transfer' ? 'Transf.' : 'Tarjeta'})
                              </span>
                              <span className="font-bold text-emerald-700">
                                + L. {cp.amount.toFixed(2)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                    {!isPaid && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedSaleForAbone(sale);
                          setAboneAmount(bal.toFixed(2));
                          setAboneMethod('cash');
                          setAboneNotes('');
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Registrar Abono</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleSendCreditReminderWhatsApp(sale)}
                      className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5 fill-white" />
                      <span>WhatsApp</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setCreditSaleForPrintModal(sale)}
                      className="py-2 px-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1 cursor-pointer"
                      title="Imprimir o descargar en PDF el Estado de Cuenta del cliente"
                    >
                      <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      <span>PDF / Imprimir</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onViewSaleTicket(sale)}
                      className="py-2 px-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
                      title="Ver Factura Original"
                    >
                      <Receipt className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal to Record Partial or Full Abono */}
        {selectedSaleForAbone && (
          <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
              <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-black text-sm sm:text-base">
                    Registrar Abono de Cliente
                  </h3>
                  <p className="text-xs text-amber-100">
                    {selectedSaleForAbone.customerName} • {selectedSaleForAbone.saleNumber}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedSaleForAbone(null)}
                  className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmitCreditAbone} className="p-5 space-y-4">
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                  <span className="font-bold text-amber-950">Saldo Pendiente Actual:</span>
                  <span className="text-lg font-black text-amber-800">
                    L.{' '}
                    {(
                      selectedSaleForAbone.balanceDue ??
                      selectedSaleForAbone.total - (selectedSaleForAbone.amountPaid || 0)
                    ).toFixed(2)}
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Monto del Abono (L.)
                    </label>
                    <button
                      type="button"
                      onClick={() =>
                        setAboneAmount(
                          (
                            selectedSaleForAbone.balanceDue ??
                            selectedSaleForAbone.total - (selectedSaleForAbone.amountPaid || 0)
                          ).toFixed(2)
                        )
                      }
                      className="text-[11px] font-bold text-amber-700 hover:underline cursor-pointer"
                    >
                      Liquidar todo el saldo
                    </button>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={aboneAmount}
                    onChange={(e) => setAboneAmount(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Método de Pago del Abono
                  </label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {(['cash', 'transfer', 'card'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setAboneMethod(m)}
                        className={`py-2 px-2 rounded-xl font-bold border cursor-pointer ${
                          aboneMethod === m
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transferencia' : 'Tarjeta'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nota / Referencia (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Abono quincenal en efectivo..."
                    value={aboneNotes}
                    onChange={(e) => setAboneNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedSaleForAbone(null)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingAbone}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer shadow-md"
                  >
                    {isSubmittingAbone ? 'Guardando...' : 'Confirmar Abono'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Multi-Printer & PDF Modal for Individual Customer Credit Statement */}
        {creditSaleForPrintModal && (
          <PrintFormatModal
            isOpen={Boolean(creditSaleForPrintModal)}
            onClose={() => setCreditSaleForPrintModal(null)}
            title={`Estado de Cuenta — ${creditSaleForPrintModal.customerName || 'Cliente'}`}
            subtitle={`Factura ${creditSaleForPrintModal.saleNumber}`}
            storeSettings={storeSettings}
            buildHtml={(fmt) => buildCreditStatementHtml(creditSaleForPrintModal, storeSettings, fmt)}
            onDownloadPdf={() => downloadCreditStatementPdf(creditSaleForPrintModal, storeSettings)}
            showToast={showToast}
          />
        )}

        {/* Multi-Printer & PDF Modal for Credit Portfolio Report */}
        <PrintFormatModal
          isOpen={showCreditPortfolioPrintModal}
          onClose={() => setShowCreditPortfolioPrintModal(false)}
          title="Reporte General de Cartera de Cuentas por Cobrar"
          subtitle={`${filteredCreditSales.length} cuentas filtradas`}
          storeSettings={storeSettings}
          defaultFormat="letter"
          buildHtml={(fmt) => buildCreditPortfolioReportHtml(filteredCreditSales, storeSettings, fmt)}
          onDownloadPdf={() => downloadCreditPortfolioReportPdf(filteredCreditSales, storeSettings)}
          showToast={showToast}
        />
      </div>
    );
  }

  // ==================== RENDER MODE 3: OPERATING EXPENSES & NET PROFIT ====================
  return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container p-3 sm:p-6 space-y-5 pb-32">
      {/* Period Selector + Formula Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-base sm:text-lg font-black text-slate-900">
              Estado de Resultados y Ganancia Neta Real
            </h2>
            <p className="text-xs text-slate-500">
              Fórmula financiera: <strong>Utilidad Bruta de Ventas − Gastos Operativos = Ganancia Neta Libre</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              {(
                [
                  { id: 'today', label: 'Hoy' },
                  { id: 'week', label: '7 Días' },
                  { id: 'month', label: 'Este Mes' },
                  { id: 'all', label: 'Todo' },
                ] as const
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setExpPeriodFilter(p.id)}
                  className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer transition-all ${
                    expPeriodFilter === p.id
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setShowIncomeStatementPrintModal(true)}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Imprimir o descargar en PDF el Estado de Resultados y Gastos"
            >
              <Printer className="w-3.5 h-3.5 text-emerald-400" />
              <span>Imprimir / PDF Estado de Resultados</span>
            </button>
          </div>
        </div>

        {/* Visual Equation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200">
            <span className="text-[11px] font-bold uppercase text-slate-500 block">
              1. Utilidad Bruta de Ventas ({financialStatement.salesCount} ventas)
            </span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block">
              L. {financialStatement.grossProfit.toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-400 block mt-0.5">
              Ventas Netas: L. {financialStatement.grossSalesRevenue.toFixed(2)} − Costo Mercadería: L.{' '}
              {financialStatement.totalCostOfGoods.toFixed(2)}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200">
            <span className="text-[11px] font-bold uppercase text-rose-700 block">
              2. (−) Gastos Operativos del Local ({financialStatement.filteredExpenses.length})
            </span>
            <span className="text-xl sm:text-2xl font-black text-rose-600 mt-1 block">
              − L. {financialStatement.totalOperatingExpenses.toFixed(2)}
            </span>
            <span className="text-[11px] text-rose-600/80 block mt-0.5">
              Alquiler, energía, personal, bolsas, transporte, etc.
            </span>
          </div>

          <div
            className={`p-4 rounded-2xl border ${
              financialStatement.netFreeProfit >= 0
                ? 'bg-emerald-50 border-emerald-300'
                : 'bg-rose-100 border-rose-300'
            }`}
          >
            <span className="text-[11px] font-extrabold uppercase text-emerald-900 block">
              3. (=) GANANCIA NETA LIBRE REAL
            </span>
            <span
              className={`text-xl sm:text-2xl font-black mt-1 block ${
                financialStatement.netFreeProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'
              }`}
            >
              {financialStatement.netFreeProfit >= 0 ? '+ ' : '− '}L.{' '}
              {Math.abs(financialStatement.netFreeProfit).toFixed(2)}
            </span>
            <span className="text-[11px] text-slate-600 font-semibold block mt-0.5">
              Rentabilidad Neta Libre: {financialStatement.netMarginPct.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* Expense Registration Form + Expense Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Add Operating Expense Form */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4 h-fit">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="font-black text-slate-900 text-sm flex items-center gap-2">
              <Plus className="w-4 h-4 text-rose-600" />
              <span>Registrar Gasto Operativo</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Registra alquiler, energía, planilla, bolsas o transporte para conocer tu ganancia real.
            </p>
          </div>

          <form onSubmit={handleAddExpense} className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Categoría del Gasto
              </label>
              <select
                value={expCategory}
                onChange={(e) => setExpCategory(e.target.value as ExpenseCategory)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold bg-white"
              >
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Descripción / Concepto
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Pago de alquiler mes actual, Recibo ENEE..."
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monto (L.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-black"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fecha
                </label>
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="w-full px-2.5 py-2 rounded-xl border border-slate-200 text-xs"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Pagado con
              </label>
              <div className="grid grid-cols-3 gap-1.5 text-xs">
                {(['cash', 'transfer', 'card'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setExpPaymentMethod(m)}
                    className={`py-1.5 px-2 rounded-lg font-bold border cursor-pointer ${
                      expPaymentMethod === m
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {m === 'cash' ? 'Efectivo' : m === 'transfer' ? 'Transf.' : 'Tarjeta'}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingExpense}
              className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer transition-all flex items-center justify-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Guardar Gasto Operativo</span>
            </button>
          </form>
        </div>

        {/* Right: Expenses List */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-black text-slate-900 text-sm">
              Desglose de Gastos Registrados ({financialStatement.filteredExpenses.length})
            </h3>
            <span className="text-xs font-black text-rose-600">
              Total: L. {financialStatement.totalOperatingExpenses.toFixed(2)}
            </span>
          </div>

          {financialStatement.filteredExpenses.length === 0 ? (
            <div className="p-10 text-center text-slate-400 text-xs">
              No hay gastos registrados en el período seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-3 px-4">Fecha</th>
                    <th className="py-3 px-4">Categoría</th>
                    <th className="py-3 px-4">Descripción</th>
                    <th className="py-3 px-4">Método</th>
                    <th className="py-3 px-4 text-right">Monto</th>
                    <th className="py-3 px-4 text-center">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {financialStatement.filteredExpenses.map((exp) => (
                    <tr key={exp.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">{exp.date}</td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 border border-rose-200 font-bold text-[10px]">
                          {exp.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-800">{exp.description}</td>
                      <td className="py-3 px-4 capitalize text-slate-500">
                        {exp.paymentMethod === 'cash'
                          ? 'Efectivo'
                          : exp.paymentMethod === 'transfer'
                          ? 'Transferencia'
                          : 'Tarjeta'}
                      </td>
                      <td className="py-3 px-4 text-right font-black text-rose-600">
                        L. {exp.amount.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Multi-Printer & PDF Modal for Income Statement & Expenses */}
      <PrintFormatModal
        isOpen={showIncomeStatementPrintModal}
        onClose={() => setShowIncomeStatementPrintModal(false)}
        title="Estado de Resultados y Gastos Operativos"
        subtitle={
          expPeriodFilter === 'today'
            ? 'Período: Hoy'
            : expPeriodFilter === 'week'
            ? 'Período: Últimos 7 Días'
            : expPeriodFilter === 'month'
            ? 'Período: Este Mes'
            : 'Período: Histórico Completo'
        }
        storeSettings={storeSettings}
        defaultFormat="letter"
        buildHtml={(fmt) =>
          buildIncomeStatementHtml(
            {
              periodLabel:
                expPeriodFilter === 'today'
                  ? 'Hoy'
                  : expPeriodFilter === 'week'
                  ? 'Últimos 7 Días'
                  : expPeriodFilter === 'month'
                  ? 'Este Mes'
                  : 'Histórico Completo',
              grossSalesRevenue: financialStatement.grossSalesRevenue,
              totalCostOfGoods: financialStatement.totalCostOfGoods,
              grossProfit: financialStatement.grossProfit,
              totalOperatingExpenses: financialStatement.totalOperatingExpenses,
              netFreeProfit: financialStatement.netFreeProfit,
              netMarginPct: financialStatement.netMarginPct,
              salesCount: financialStatement.salesCount,
              expenses: financialStatement.filteredExpenses,
            },
            storeSettings,
            fmt
          )
        }
        onDownloadPdf={() =>
          downloadIncomeStatementPdf(
            {
              periodLabel:
                expPeriodFilter === 'today'
                  ? 'Hoy'
                  : expPeriodFilter === 'week'
                  ? 'Últimos 7 Días'
                  : expPeriodFilter === 'month'
                  ? 'Este Mes'
                  : 'Histórico Completo',
              grossSalesRevenue: financialStatement.grossSalesRevenue,
              totalCostOfGoods: financialStatement.totalCostOfGoods,
              grossProfit: financialStatement.grossProfit,
              totalOperatingExpenses: financialStatement.totalOperatingExpenses,
              netFreeProfit: financialStatement.netFreeProfit,
              netMarginPct: financialStatement.netMarginPct,
              salesCount: financialStatement.salesCount,
              expenses: financialStatement.filteredExpenses,
            },
            storeSettings
          )
        }
        showToast={showToast}
      />
    </div>
  );
};
