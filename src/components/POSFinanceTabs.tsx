import React, { useState, useMemo } from 'react';
import {
  Product,
  SaleRecord,
  StoreSettings,
  UserAccount,
  UserSession,
  CashRegisterShift,
  CashOutMovement,
  StoreExpenseRecord,
  ExpenseCategory,
  CreditPaymentAbone,
  POSFinanceStoreData,
  CreditAccountControlMeta,
  CreditCollectionNoticeLog,
  RouteCollectorAlert,
  RouteCollectorGlobalConfig,
  LoyaltyCustomerProfile,
  LoyaltyProgramConfig,
  LoyaltyTransactionLog,
  CreditContractData,
  isStoreCreditContractEnabled,
  isCollaboratorRouteCollector,
  doesCreditAccountBelongToCollector,
  normalizeCollectorIdentifier,
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
  Bell,
  Pencil,
  MessageSquare,
  Award,
  Gift,
  Star,
  Sparkles,
  Settings,
  History,
  MapPin,
  Navigation,
  ExternalLink,
} from 'lucide-react';
import { WhatsAppIcon } from './SalesView';
import { PrintFormatModal } from './PrintFormatModal';
import { CreditContractModal } from './CreditContractModal';
import {
  CustomerGpsLocationModal,
  captureDeviceGpsLocation,
  reverseGeocodeCoordinates,
} from './CustomerGpsLocationModal';
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
  mode: 'cash-register' | 'credits' | 'expenses' | 'loyalty';
  inventory: Product[];
  sales: SaleRecord[];
  storeSettings: StoreSettings;
  userSession?: UserSession | null;
  users?: UserAccount[];
  posFinanceData: POSFinanceStoreData;
  onSavePOSFinanceData: (updated: POSFinanceStoreData) => Promise<void>;
  onRecordCreditPayment: (sale: SaleRecord, abone: CreditPaymentAbone) => Promise<SaleRecord>;
  onRecordSale?: (saleData: Omit<SaleRecord, 'id'>) => Promise<SaleRecord | void>;
  onSaveUser?: (user: UserAccount) => Promise<void>;
  onViewSaleTicket: (sale: SaleRecord) => void;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const POSFinanceTabs: React.FC<POSFinanceTabsProps> = ({
  mode,
  inventory,
  sales,
  storeSettings,
  userSession,
  users = [],
  posFinanceData,
  onSavePOSFinanceData,
  onRecordCreditPayment,
  onRecordSale,
  onSaveUser,
  onViewSaleTicket,
  showToast,
}) => {
  const currentUserName = userSession?.userName || 'Administrador';
  const isAdminSession = !userSession || userSession.role === 'admin';
  const allShifts = posFinanceData.shifts || [];
  const shifts = useMemo(() => {
    if (isAdminSession) return allShifts;
    const uname = currentUserName.trim().toLowerCase();
    const loginName = (userSession?.username || '').trim().toLowerCase().replace(/^@+/, '');
    return allShifts.filter((sh) => {
      const opened = (sh.openedBy || '').trim().toLowerCase().replace(/^@+/, '');
      return opened === uname || (Boolean(loginName) && opened === loginName);
    });
  }, [allShifts, isAdminSession, currentUserName, userSession?.username]);
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
        shifts: [newShift, ...allShifts],
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

      const updatedShifts = allShifts.map((s) =>
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

      const updatedShifts = allShifts.map((s) => (s.id === activeShift.id ? closedShift : s));
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
  const [creditFilter, setCreditFilter] = useState<
    'pending' | 'alerts' | 'profit_zone' | 'recovering_cost' | 'paid' | 'all'
  >('pending');
  const [selectedSaleForAbone, setSelectedSaleForAbone] = useState<SaleRecord | null>(null);
  const [aboneAmount, setAboneAmount] = useState<string>('');
  const [aboneMethod, setAboneMethod] = useState<'cash' | 'transfer' | 'card'>('cash');
  const [aboneNotes, setAboneNotes] = useState<string>('');
  const [aboneNextDate, setAboneNextDate] = useState<string>('');
  const [isSubmittingAbone, setIsSubmittingAbone] = useState<boolean>(false);

  // Control de Costo, Alerta de Cobro y Registro de Avisos Modal State
  const [selectedSaleForControl, setSelectedSaleForControl] = useState<SaleRecord | null>(null);
  const [selectedSaleForContract, setSelectedSaleForContract] = useState<SaleRecord | null>(null);
  const [ctrlCustomCost, setCtrlCustomCost] = useState<string>('');
  const [ctrlNextPaymentDate, setCtrlNextPaymentDate] = useState<string>('');
  const [ctrlFrequency, setCtrlFrequency] = useState<
    'weekly' | 'biweekly' | 'monthly' | 'daily' | 'custom'
  >('biweekly');
  const [ctrlInstallmentAmount, setCtrlInstallmentAmount] = useState<string>('');
  const [ctrlNotes, setCtrlNotes] = useState<string>('');
  const [ctrlAssignedCollectorUsername, setCtrlAssignedCollectorUsername] = useState<string>('');
  const [ctrlCustomerAddressOrRoute, setCtrlCustomerAddressOrRoute] = useState<string>('');
  const [manualNoticeChannel, setManualNoticeChannel] = useState<'call' | 'in_person'>('call');
  const [manualNoticeNote, setManualNoticeNote] = useState<string>('');
  const [isSavingControl, setIsSavingControl] = useState<boolean>(false);

  // ==================== COBRADOR DE RUTA & ADMIN CONFIG / ALERTS STATE ====================
  const matchedCollaborator = useMemo(() => {
    if (isAdminSession || !userSession) return undefined;
    return users.find(
      (u) =>
        u.id === userSession.userId ||
        u.username.trim().toLowerCase() === (userSession.username || '').trim().toLowerCase()
    );
  }, [isAdminSession, userSession, users]);

  const canViewCostsAndProfits =
    isAdminSession ||
    Boolean(
      matchedCollaborator?.salesPermissions?.canViewCostsAndProfits ??
        userSession?.salesPermissions?.canViewCostsAndProfits
    );

  const routeCollectorConfig = useMemo<RouteCollectorGlobalConfig>(() => {
    const raw = posFinanceData.routeCollectorConfig;
    return {
      autoCalculateNextDateOnAbone: raw?.autoCalculateNextDateOnAbone !== false,
      defaultPaymentFrequency: raw?.defaultPaymentFrequency || 'weekly',
      upcomingAlertDays: Math.max(1, Math.min(15, Number(raw?.upcomingAlertDays) || 3)),
      notifyAdminOnEveryAbone: raw?.notifyAdminOnEveryAbone !== false,
      notifyAdminOnReschedule: raw?.notifyAdminOnReschedule !== false,
      enabledCollectorUsernames: Array.isArray(raw?.enabledCollectorUsernames)
        ? raw.enabledCollectorUsernames
        : [],
    };
  }, [posFinanceData.routeCollectorConfig]);

  const routeCollectorAlerts = useMemo<RouteCollectorAlert[]>(() => {
    return Array.isArray(posFinanceData.routeCollectorAlerts)
      ? posFinanceData.routeCollectorAlerts
      : [];
  }, [posFinanceData.routeCollectorAlerts]);

  const unreadCollectorAlertsCount = useMemo(
    () => routeCollectorAlerts.filter((a) => a.status === 'unread').length,
    [routeCollectorAlerts]
  );

  const isCurrentUserRouteCollector = useMemo(() => {
    return isCollaboratorRouteCollector(userSession, users, posFinanceData);
  }, [userSession, users, posFinanceData]);

  // Collaborator users list (for assigning route collectors)
  const collaboratorUsers = useMemo(
    () => users.filter((u) => u.role === 'collaborator' && u.isActive !== false),
    [users]
  );

  const activeRouteCollectors = useMemo(
    () =>
      collaboratorUsers.filter((u) => {
        const cleanUname = normalizeCollectorIdentifier(u.username);
        const cleanName = normalizeCollectorIdentifier(u.name);
        const inEnabled = (routeCollectorConfig.enabledCollectorUsernames || []).some((raw) => {
          const norm = normalizeCollectorIdentifier(raw);
          return norm === cleanUname || norm === cleanName;
        });
        const hasAssignedAccount = Object.values(posFinanceData.creditAccountControls || {}).some(
          (meta) => doesCreditAccountBelongToCollector(meta, null, u)
        );
        return Boolean(u.salesPermissions?.isRouteCollector || inEnabled || hasAssignedAccount);
      }),
    [collaboratorUsers, routeCollectorConfig.enabledCollectorUsernames, posFinanceData.creditAccountControls]
  );

  // Admin can toggle between 'admin_full' and 'route_collector_view' or filter by collector
  const [adminCreditsViewMode, setAdminCreditsViewMode] = useState<'admin_full' | 'route_panel'>(
    'admin_full'
  );
  const [selectedCollectorFilter, setSelectedCollectorFilter] = useState<string>('all');
  const [showAdminCollectorConfigModal, setShowAdminCollectorConfigModal] =
    useState<boolean>(false);
  const [showAdminAlertsModal, setShowAdminAlertsModal] = useState<boolean>(false);

  // Quick Schedule Next Collection Date Modal (for Route Collector / Admin)
  const [selectedSaleForQuickSchedule, setSelectedSaleForQuickSchedule] =
    useState<SaleRecord | null>(null);
  const [quickScheduleDate, setQuickScheduleDate] = useState<string>('');
  const [quickScheduleFrequency, setQuickScheduleFrequency] = useState<
    'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom'
  >('weekly');
  const [quickScheduleNote, setQuickScheduleNote] = useState<string>('');
  const [isSavingQuickSchedule, setIsSavingQuickSchedule] = useState<boolean>(false);

  // Collaborator -> Admin Alert Modal
  const [selectedSaleForCollectorAlert, setSelectedSaleForCollectorAlert] =
    useState<SaleRecord | null>(null);
  const [collectorAlertType, setCollectorAlertType] = useState<RouteCollectorAlert['alertType']>(
    'customer_absent'
  );
  const [collectorAlertMessage, setCollectorAlertMessage] = useState<string>('');
  const [collectorAlertNextDate, setCollectorAlertNextDate] = useState<string>('');
  const [isSendingCollectorAlert, setIsSendingCollectorAlert] = useState<boolean>(false);

  // Direct Create New Credit Debt Modal (from Cuentas por Cobrar)
  const [showCreateDebtModal, setShowCreateDebtModal] = useState<boolean>(false);
  const [newDebtCustomerName, setNewDebtCustomerName] = useState<string>('');
  const [newDebtCustomerPhone, setNewDebtCustomerPhone] = useState<string>('');
  const [newDebtCustomerAddress, setNewDebtCustomerAddress] = useState<string>('');
  const [newDebtProductId, setNewDebtProductId] = useState<string>('');
  const [newDebtCustomItemName, setNewDebtCustomItemName] = useState<string>('');
  const [newDebtTotalAmount, setNewDebtTotalAmount] = useState<string>('');
  const [newDebtInitialAbono, setNewDebtInitialAbono] = useState<string>('0');
  const [newDebtInstallmentAmount, setNewDebtInstallmentAmount] = useState<string>('');
  const [newDebtFrequency, setNewDebtFrequency] = useState<
    'daily' | 'weekly' | 'biweekly' | 'monthly'
  >('weekly');
  const [newDebtNextPaymentDate, setNewDebtNextPaymentDate] = useState<string>('');
  const [newDebtCollectorUsername, setNewDebtCollectorUsername] = useState<string>('');
  const [newDebtNotes, setNewDebtNotes] = useState<string>('');
  const [newDebtGpsCoords, setNewDebtGpsCoords] = useState<{
    lat: number;
    lng: number;
    accuracy?: number;
    formattedAddress?: string;
    plusCode?: string;
  } | null>(null);
  const [isCreatingDebt, setIsCreatingDebt] = useState<boolean>(false);
  const [selectedSaleForGpsModal, setSelectedSaleForGpsModal] = useState<SaleRecord | null>(null);
  const [isCapturingInlineGps, setIsCapturingInlineGps] = useState<boolean>(false);

  const inventoryCostMap = useMemo(() => {
    const map = new Map<string, number>();
    inventory.forEach((p) => map.set((p.code || '').trim().toLowerCase(), Number(p.cost) || 0));
    return map;
  }, [inventory]);

  const creditAccountControls = useMemo(
    () => posFinanceData.creditAccountControls || {},
    [posFinanceData.creditAccountControls]
  );

  const getLocalTodayIso = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const addDaysToIso = (daysToAdd: number, baseIso?: string) => {
    const base =
      baseIso && /^\d{4}-\d{2}-\d{2}$/.test(baseIso)
        ? new Date(`${baseIso}T12:00:00`)
        : new Date();
    base.setDate(base.getDate() + daysToAdd);
    const yyyy = base.getFullYear();
    const mm = String(base.getMonth() + 1).padStart(2, '0');
    const dd = String(base.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const calculateNextDateByFrequency = (
    frequency?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'custom',
    currentEffectiveDate?: string
  ): string => {
    const todayIso = getLocalTodayIso();
    const baseDate =
      currentEffectiveDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(currentEffectiveDate) &&
      currentEffectiveDate > todayIso
        ? currentEffectiveDate
        : todayIso;
    const effectiveFreq =
      frequency && frequency !== 'custom'
        ? frequency
        : routeCollectorConfig.defaultPaymentFrequency || 'weekly';
    const daysMap: Record<'daily' | 'weekly' | 'biweekly' | 'monthly', number> = {
      daily: 1,
      weekly: 7,
      biweekly: 15,
      monthly: 30,
    };
    return addDaysToIso(daysMap[effectiveFreq] || 7, baseDate);
  };

  const getSaleCreditAnalytics = (sale: SaleRecord) => {
    const controlMeta: CreditAccountControlMeta | undefined = creditAccountControls[sale.id];
    const totalSale = Math.max(0, Number(sale.total) || 0);

    const calculatedItemsCost = (sale.items || []).reduce((acc, it) => {
      const unitCost =
        Number(it.cost) > 0
          ? Number(it.cost)
          : inventoryCostMap.get((it.code || '').trim().toLowerCase()) || 0;
      return acc + unitCost * (Number(it.quantity) || 1);
    }, 0);

    const hasCustomCost =
      controlMeta?.customTotalCost !== undefined &&
      controlMeta.customTotalCost !== null &&
      !Number.isNaN(Number(controlMeta.customTotalCost));

    const totalCost = Math.max(
      0,
      hasCustomCost ? Number(controlMeta!.customTotalCost) : calculatedItemsCost
    );
    const expectedTotalProfit = Math.max(0, totalSale - totalCost);

    const paid = Math.max(0, Number(sale.amountPaid) || 0);
    const balanceDue =
      sale.balanceDue !== undefined
        ? Math.max(0, Number(sale.balanceDue))
        : Math.max(0, totalSale - paid);
    const isPaid = balanceDue <= 0.01 || sale.creditStatus === 'paid';

    const costRecovered = Math.min(totalCost, paid);
    const costRemainingToRecover = Math.max(0, totalCost - paid);
    const isCostRecovered = totalCost > 0 ? paid >= totalCost - 0.01 : paid > 0;
    const realizedProfitCollected = Math.max(0, paid - totalCost);
    const remainingProfitToCollect = isCostRecovered
      ? balanceDue
      : Math.min(balanceDue, expectedTotalProfit);

    const costRecoveryPercent =
      totalCost > 0 ? Math.min(100, (costRecovered / totalCost) * 100) : 100;
    const profitCollectionPercent =
      expectedTotalProfit > 0
        ? Math.min(100, (realizedProfitCollected / expectedTotalProfit) * 100)
        : 0;

    // Collection Alert Calculation
    const todayIso = getLocalTodayIso();
    const effectiveNextDate = controlMeta?.nextPaymentDate || sale.creditDueDate || '';
    let daysDiff: number | null = null;
    if (effectiveNextDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveNextDate)) {
      const targetMs = new Date(`${effectiveNextDate}T00:00:00`).getTime();
      const todayMs = new Date(`${todayIso}T00:00:00`).getTime();
      daysDiff = Math.round((targetMs - todayMs) / (1000 * 60 * 60 * 24));
    }

    let alertStatus: 'paid' | 'overdue' | 'due_today' | 'upcoming' | 'on_track' = 'on_track';
    const alertThresholdDays = routeCollectorConfig.upcomingAlertDays || 3;
    if (isPaid) {
      alertStatus = 'paid';
    } else if (daysDiff !== null && daysDiff < 0) {
      alertStatus = 'overdue';
    } else if (daysDiff !== null && daysDiff === 0) {
      alertStatus = 'due_today';
    } else if (daysDiff !== null && daysDiff > 0 && daysDiff <= alertThresholdDays) {
      alertStatus = 'upcoming';
    }

    const notices = controlMeta?.notices || [];
    const noticeCount = controlMeta?.noticeCount ?? notices.length;

    return {
      controlMeta,
      totalSale,
      calculatedItemsCost,
      hasCustomCost,
      totalCost,
      expectedTotalProfit,
      paid,
      balanceDue,
      isPaid,
      costRecovered,
      costRemainingToRecover,
      isCostRecovered,
      realizedProfitCollected,
      remainingProfitToCollect,
      costRecoveryPercent,
      profitCollectionPercent,
      effectiveNextDate,
      daysDiff,
      alertStatus,
      notices,
      noticeCount,
    };
  };

  const creditSales = useMemo(() => {
    const allCredits = sales.filter(
      (s) =>
        s.status === 'completed' &&
        (s.paymentMethod === 'credit' ||
          (s.balanceDue !== undefined && s.balanceDue > 0) ||
          (s.creditPayments && s.creditPayments.length > 0))
    );

    // If collaborator is a Route Collector with 'assigned' scope, show accounts assigned to them or created by them
    if (!isAdminSession && isCurrentUserRouteCollector) {
      const scope =
        matchedCollaborator?.salesPermissions?.routeCollectorScope ||
        userSession?.salesPermissions?.routeCollectorScope ||
        'all';
      const myUsername = normalizeCollectorIdentifier(
        matchedCollaborator?.username || userSession?.username
      );
      const myName = normalizeCollectorIdentifier(
        matchedCollaborator?.name || userSession?.userName
      );
      const assignedList = allCredits.filter((s) => {
        const meta = creditAccountControls[s.id];
        if (doesCreditAccountBelongToCollector(meta, userSession, matchedCollaborator)) {
          return true;
        }
        const createdByMe =
          (Boolean(myUsername) &&
            normalizeCollectorIdentifier(s.cashierUsername) === myUsername) ||
          (Boolean(myName) && normalizeCollectorIdentifier(s.cashier) === myName);
        return createdByMe;
      });

      if (scope === 'assigned' && assignedList.length > 0) {
        return assignedList;
      }
      return allCredits;
    }

    return allCredits;
  }, [
    sales,
    isAdminSession,
    isCurrentUserRouteCollector,
    matchedCollaborator,
    userSession,
    creditAccountControls,
  ]);

  const filteredCreditSales = useMemo(() => {
    const q = creditSearch.trim().toLowerCase();
    return creditSales.filter((s) => {
      const analytics = getSaleCreditAnalytics(s);

      if (selectedCollectorFilter !== 'all') {
        const assignedUname = (analytics.controlMeta?.assignedCollectorUsername || '')
          .trim()
          .toLowerCase();
        if (selectedCollectorFilter === '__unassigned__') {
          if (assignedUname) return false;
        } else if (assignedUname !== selectedCollectorFilter.toLowerCase()) {
          return false;
        }
      }

      if (creditFilter === 'pending' && analytics.isPaid) return false;
      if (creditFilter === 'paid' && !analytics.isPaid) return false;
      if (
        creditFilter === 'alerts' &&
        (analytics.isPaid ||
          (analytics.alertStatus !== 'overdue' &&
            analytics.alertStatus !== 'due_today' &&
            analytics.alertStatus !== 'upcoming'))
      ) {
        return false;
      }
      if (
        creditFilter === 'profit_zone' &&
        (analytics.isPaid || !analytics.isCostRecovered)
      ) {
        return false;
      }
      if (
        creditFilter === 'recovering_cost' &&
        (analytics.isPaid || analytics.isCostRecovered)
      ) {
        return false;
      }

      if (q) {
        const cleanAmountQuery = q.replace(/,/g, '');
        const matchCust = (s.customerName || '').toLowerCase().includes(q);
        const matchPhone = (s.customerPhone || '').toLowerCase().includes(q);
        const matchRtn = (s.customerRtn || '').toLowerCase().includes(q);
        const matchNum = (s.saleNumber || '').toLowerCase().includes(q);
        const matchRoute = (analytics.controlMeta?.customerAddressOrRoute || '')
          .toLowerCase()
          .includes(q);
        const matchCollector = (analytics.controlMeta?.assignedCollectorName || '')
          .toLowerCase()
          .includes(q);
        const matchAmount =
          String(s.total).includes(cleanAmountQuery) ||
          s.total.toFixed(2).includes(cleanAmountQuery) ||
          String(analytics.balanceDue).includes(cleanAmountQuery);
        const matchItem = (s.items || []).some(
          (it) =>
            it.name.toLowerCase().includes(q) ||
            it.code.toLowerCase().includes(q)
        );
        if (
          !matchCust &&
          !matchPhone &&
          !matchRtn &&
          !matchNum &&
          !matchRoute &&
          !matchCollector &&
          !matchAmount &&
          !matchItem
        )
          return false;
      }
      return true;
    });
  }, [
    creditSales,
    creditSearch,
    creditFilter,
    selectedCollectorFilter,
    creditAccountControls,
    inventoryCostMap,
    routeCollectorConfig.upcomingAlertDays,
  ]);

  const creditPortfolioStats = useMemo(() => {
    let totalReceivable = 0;
    let totalCollectedFromCredits = 0;
    let pendingAccountsCount = 0;
    let overdueCount = 0;
    let dueTodayCount = 0;
    let upcomingCount = 0;
    let totalCostRemainingInStreet = 0;
    let totalProfitRemainingInStreet = 0;
    let totalRealizedProfitInHand = 0;
    let accountsInProfitZoneCount = 0;
    let accountsRecoveringCostCount = 0;
    const alertSales: Array<{
      sale: SaleRecord;
      analytics: ReturnType<typeof getSaleCreditAnalytics>;
    }> = [];

    creditSales.forEach((s) => {
      const a = getSaleCreditAnalytics(s);
      totalCollectedFromCredits += a.paid;
      totalRealizedProfitInHand += a.realizedProfitCollected;

      if (!a.isPaid) {
        totalReceivable += a.balanceDue;
        pendingAccountsCount += 1;
        totalCostRemainingInStreet += a.costRemainingToRecover;
        totalProfitRemainingInStreet += a.remainingProfitToCollect;

        if (a.isCostRecovered) {
          accountsInProfitZoneCount += 1;
        } else {
          accountsRecoveringCostCount += 1;
        }

        if (a.alertStatus === 'overdue') {
          overdueCount += 1;
          alertSales.push({ sale: s, analytics: a });
        } else if (a.alertStatus === 'due_today') {
          dueTodayCount += 1;
          alertSales.push({ sale: s, analytics: a });
        } else if (a.alertStatus === 'upcoming') {
          upcomingCount += 1;
          alertSales.push({ sale: s, analytics: a });
        }
      }
    });

    // Sort alerts: overdue first, then due_today, then upcoming
    alertSales.sort((x, y) => {
      const rank = { overdue: 0, due_today: 1, upcoming: 2, on_track: 3, paid: 4 };
      return rank[x.analytics.alertStatus] - rank[y.analytics.alertStatus];
    });

    return {
      totalReceivable,
      totalCollectedFromCredits,
      pendingAccountsCount,
      overdueCount,
      dueTodayCount,
      upcomingCount,
      totalAlertsCount: overdueCount + dueTodayCount + upcomingCount,
      totalCostRemainingInStreet,
      totalProfitRemainingInStreet,
      totalRealizedProfitInHand,
      accountsInProfitZoneCount,
      accountsRecoveringCostCount,
      alertSales,
    };
  }, [creditSales, creditAccountControls, inventoryCostMap]);

  const openAboneModalForSale = (sale: SaleRecord) => {
    const analytics = getSaleCreditAnalytics(sale);
    setSelectedSaleForAbone(sale);
    setAboneAmount(
      analytics.controlMeta?.installmentAmount &&
        analytics.controlMeta.installmentAmount <= analytics.balanceDue
        ? analytics.controlMeta.installmentAmount.toFixed(2)
        : analytics.balanceDue.toFixed(2)
    );
    setAboneMethod('cash');
    setAboneNotes('');
    if (routeCollectorConfig.autoCalculateNextDateOnAbone !== false) {
      const nextAutoDate = calculateNextDateByFrequency(
        analytics.controlMeta?.paymentFrequency,
        analytics.effectiveNextDate
      );
      setAboneNextDate(nextAutoDate);
    } else {
      setAboneNextDate(analytics.effectiveNextDate || '');
    }
  };

  const openControlModalForSale = (sale: SaleRecord) => {
    const a = getSaleCreditAnalytics(sale);
    setSelectedSaleForControl(sale);
    setCtrlCustomCost(a.totalCost.toFixed(2));
    setCtrlNextPaymentDate(a.effectiveNextDate || '');
    setCtrlFrequency(
      a.controlMeta?.paymentFrequency || routeCollectorConfig.defaultPaymentFrequency || 'weekly'
    );
    setCtrlInstallmentAmount(
      a.controlMeta?.installmentAmount && a.controlMeta.installmentAmount > 0
        ? a.controlMeta.installmentAmount.toFixed(2)
        : ''
    );
    setCtrlNotes(a.controlMeta?.collectionNotes || '');
    setCtrlAssignedCollectorUsername(a.controlMeta?.assignedCollectorUsername || '');
    setCtrlCustomerAddressOrRoute(a.controlMeta?.customerAddressOrRoute || '');
    setManualNoticeNote('');
  };

  const handleSaveCreditAccountControl = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForControl) return;
    setIsSavingControl(true);
    try {
      const existingMeta = creditAccountControls[selectedSaleForControl.id] || {
        saleId: selectedSaleForControl.id,
      };
      const parsedCost = parseFloat(ctrlCustomCost);
      const parsedInstallment = parseFloat(ctrlInstallmentAmount);
      const cleanAssignedUname = normalizeCollectorIdentifier(ctrlAssignedCollectorUsername);
      const matchedCollector = collaboratorUsers.find(
        (u) =>
          normalizeCollectorIdentifier(u.username) === cleanAssignedUname ||
          normalizeCollectorIdentifier(u.name) === cleanAssignedUname
      );

      const updatedMeta: CreditAccountControlMeta = {
        ...existingMeta,
        saleId: selectedSaleForControl.id,
        customTotalCost: !Number.isNaN(parsedCost) && parsedCost >= 0 ? parsedCost : undefined,
        nextPaymentDate: ctrlNextPaymentDate.trim() || undefined,
        paymentFrequency: ctrlFrequency,
        installmentAmount:
          !Number.isNaN(parsedInstallment) && parsedInstallment > 0 ? parsedInstallment : undefined,
        collectionNotes: ctrlNotes.trim() || undefined,
        assignedCollectorId: matchedCollector?.id || undefined,
        assignedCollectorUsername:
          matchedCollector?.username || (cleanAssignedUname || undefined),
        assignedCollectorName: matchedCollector?.name || undefined,
        customerAddressOrRoute: ctrlCustomerAddressOrRoute.trim() || undefined,
      };

      const currentEnabled = new Set(
        (routeCollectorConfig.enabledCollectorUsernames || []).map((u) =>
          normalizeCollectorIdentifier(u)
        )
      );
      if (cleanAssignedUname) {
        currentEnabled.add(
          normalizeCollectorIdentifier(matchedCollector?.username || cleanAssignedUname)
        );
      }

      if (matchedCollector && onSaveUser) {
        await onSaveUser({
          ...matchedCollector,
          allowedTabs: matchedCollector.allowedTabs?.includes('sales')
            ? matchedCollector.allowedTabs
            : [...(matchedCollector.allowedTabs || []), 'sales'],
          salesPermissions: {
            canEditSales:
              matchedCollector.salesPermissions?.canEditSales !== undefined
                ? matchedCollector.salesPermissions.canEditSales
                : true,
            canCancelSales: Boolean(matchedCollector.salesPermissions?.canCancelSales),
            canViewCostsAndProfits: Boolean(
              matchedCollector.salesPermissions?.canViewCostsAndProfits
            ),
            allowedWarehouseIds:
              matchedCollector.salesPermissions?.allowedWarehouseIds ||
              matchedCollector.allowedWarehouseIds,
            isRouteCollector: true,
            routeCollectorScope:
              matchedCollector.salesPermissions?.routeCollectorScope || 'all',
          },
        }).catch(() => {});
      }

      await onSavePOSFinanceData({
        ...posFinanceData,
        creditAccountControls: {
          ...creditAccountControls,
          [selectedSaleForControl.id]: updatedMeta,
        },
        routeCollectorConfig: {
          ...routeCollectorConfig,
          enabledCollectorUsernames: Array.from(currentEnabled),
        },
        updatedAt: Date.now(),
      });

      showToast(
        `Configuración de cobro y ruta guardada para ${selectedSaleForControl.customerName || 'Cliente'}${
          matchedCollector ? ` (Cobrador asignado: ${matchedCollector.name})` : ''
        }`,
        'success'
      );
      setSelectedSaleForControl(null);
    } finally {
      setIsSavingControl(false);
    }
  };

  const handleQuickScheduleNextDate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForQuickSchedule || !quickScheduleDate.trim()) {
      showToast('Selecciona la fecha del siguiente cobro.', 'warning');
      return;
    }
    setIsSavingQuickSchedule(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleString('es-HN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const existingMeta = creditAccountControls[selectedSaleForQuickSchedule.id] || {
        saleId: selectedSaleForQuickSchedule.id,
      };
      const updatedMeta: CreditAccountControlMeta = {
        ...existingMeta,
        saleId: selectedSaleForQuickSchedule.id,
        nextPaymentDate: quickScheduleDate.trim(),
        paymentFrequency: quickScheduleFrequency,
        collectionNotes: quickScheduleNote.trim()
          ? `${existingMeta.collectionNotes ? existingMeta.collectionNotes + ' | ' : ''}Próximo cobro (${quickScheduleDate}): ${quickScheduleNote.trim()}`
          : existingMeta.collectionNotes,
      };

      const nextAlerts = [...routeCollectorAlerts];
      if (!isAdminSession && routeCollectorConfig.notifyAdminOnReschedule !== false) {
        nextAlerts.unshift({
          id: `ralert_${Date.now()}`,
          saleId: selectedSaleForQuickSchedule.id,
          saleNumber: selectedSaleForQuickSchedule.saleNumber,
          customerName: selectedSaleForQuickSchedule.customerName || 'Cliente',
          customerPhone: selectedSaleForQuickSchedule.customerPhone,
          collectorId: userSession?.userId,
          collectorUsername: userSession?.username || 'cobrador',
          collectorName: currentUserName,
          alertType: 'rescheduled_date',
          title: `📅 Siguiente cobro programado para ${quickScheduleDate}`,
          message:
            quickScheduleNote.trim() ||
            `El cobrador ${currentUserName} programó el siguiente cobro de ${selectedSaleForQuickSchedule.customerName || 'Cliente'} para el ${quickScheduleDate}.`,
          scheduledNextDate: quickScheduleDate.trim(),
          timestamp: now.getTime(),
          dateFormatted: dateStr,
          status: 'unread',
        });
      }

      await onSavePOSFinanceData({
        ...posFinanceData,
        creditAccountControls: {
          ...creditAccountControls,
          [selectedSaleForQuickSchedule.id]: updatedMeta,
        },
        routeCollectorAlerts: nextAlerts.slice(0, 300),
        updatedAt: Date.now(),
      });

      showToast(
        `Siguiente cobro de ${selectedSaleForQuickSchedule.customerName || 'Cliente'} programado para el ${quickScheduleDate}.`,
        'success'
      );
      setSelectedSaleForQuickSchedule(null);
      setQuickScheduleNote('');
    } finally {
      setIsSavingQuickSchedule(false);
    }
  };

  const handleSendCollectorAlertToAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForCollectorAlert) return;
    setIsSendingCollectorAlert(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleString('es-HN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const titleMap: Record<RouteCollectorAlert['alertType'], string> = {
        abono_collected: '💵 Abono cobrado en ruta',
        rescheduled_date: '📅 Cliente solicitó reprogramar fecha de cobro',
        customer_absent: '🏠 Cliente no se encontraba en domicilio / negocio',
        promise_to_pay: '🤝 Cliente prometió realizar pago en fecha acordada',
        refused_or_issue: '🚨 Cliente con inconveniente de pago / Requiere Admin',
        gps_location_saved: '📍 Ubicación GPS del cliente guardada en sitio',
        custom_report: '📝 Reporte de Cobrador de Ruta',
      };

      const defaultMsgMap: Record<RouteCollectorAlert['alertType'], string> = {
        abono_collected: `Abono cobrado en ruta a ${selectedSaleForCollectorAlert.customerName}.`,
        rescheduled_date: `El cliente solicitó reprogramar la fecha de cobro${collectorAlertNextDate ? ` para el ${collectorAlertNextDate}` : ''}.`,
        customer_absent: `Se visitó al cliente ${selectedSaleForCollectorAlert.customerName} en ruta pero no se encontraba en su domicilio/negocio.`,
        promise_to_pay: `El cliente ${selectedSaleForCollectorAlert.customerName} se comprometió a pagar${collectorAlertNextDate ? ` el día ${collectorAlertNextDate}` : ' próximamente'}.`,
        refused_or_issue: `Atención Administrador: El cliente ${selectedSaleForCollectorAlert.customerName} presentó inconveniente o negativa de pago. Requiere seguimiento.`,
        gps_location_saved: `Se capturó la dirección GPS del cliente ${selectedSaleForCollectorAlert.customerName} en el lugar.`,
        custom_report: `Reporte de ruta sobre la cuenta ${selectedSaleForCollectorAlert.saleNumber}.`,
      };

      const newAlert: RouteCollectorAlert = {
        id: `ralert_${Date.now()}`,
        saleId: selectedSaleForCollectorAlert.id,
        saleNumber: selectedSaleForCollectorAlert.saleNumber,
        customerName: selectedSaleForCollectorAlert.customerName || 'Cliente',
        customerPhone: selectedSaleForCollectorAlert.customerPhone,
        collectorId: userSession?.userId,
        collectorUsername: userSession?.username || 'cobrador',
        collectorName: currentUserName,
        alertType: collectorAlertType,
        title: titleMap[collectorAlertType],
        message: collectorAlertMessage.trim() || defaultMsgMap[collectorAlertType],
        scheduledNextDate: collectorAlertNextDate.trim() || undefined,
        timestamp: now.getTime(),
        dateFormatted: dateStr,
        status: 'unread',
      };

      const nextControls = { ...creditAccountControls };
      if (collectorAlertNextDate.trim()) {
        const existingMeta = nextControls[selectedSaleForCollectorAlert.id] || {
          saleId: selectedSaleForCollectorAlert.id,
        };
        nextControls[selectedSaleForCollectorAlert.id] = {
          ...existingMeta,
          saleId: selectedSaleForCollectorAlert.id,
          nextPaymentDate: collectorAlertNextDate.trim(),
        };
      }

      await onSavePOSFinanceData({
        ...posFinanceData,
        creditAccountControls: nextControls,
        routeCollectorAlerts: [newAlert, ...routeCollectorAlerts].slice(0, 300),
        updatedAt: Date.now(),
      });

      showToast(
        `Alerta enviada al Administrador sobre ${selectedSaleForCollectorAlert.customerName || 'Cliente'}.`,
        'success'
      );
      setSelectedSaleForCollectorAlert(null);
      setCollectorAlertMessage('');
      setCollectorAlertNextDate('');
    } finally {
      setIsSendingCollectorAlert(false);
    }
  };

  const handleMarkCollectorAlertReviewed = async (alertId: string) => {
    const updatedAlerts = routeCollectorAlerts.map((a) =>
      a.id === alertId
        ? {
            ...a,
            status: 'reviewed' as const,
            reviewedBy: currentUserName,
            reviewedAt: Date.now(),
          }
        : a
    );
    await onSavePOSFinanceData({
      ...posFinanceData,
      routeCollectorAlerts: updatedAlerts,
      updatedAt: Date.now(),
    });
  };

  const handleMarkAllCollectorAlertsReviewed = async () => {
    const updatedAlerts = routeCollectorAlerts.map((a) => ({
      ...a,
      status: 'reviewed' as const,
      reviewedBy: currentUserName,
      reviewedAt: Date.now(),
    }));
    await onSavePOSFinanceData({
      ...posFinanceData,
      routeCollectorAlerts: updatedAlerts,
      updatedAt: Date.now(),
    });
    showToast('Todas las alertas de cobradores fueron marcadas como revisadas.', 'success');
  };

  const handleToggleCollaboratorRouteCollector = async (
    collab: UserAccount,
    enable: boolean,
    scope: 'all' | 'assigned' = 'all'
  ) => {
    const cleanUname = collab.username.trim().toLowerCase();
    const currentEnabled = new Set(
      (routeCollectorConfig.enabledCollectorUsernames || []).map((u) => u.trim().toLowerCase())
    );
    if (enable) {
      currentEnabled.add(cleanUname);
    } else {
      currentEnabled.delete(cleanUname);
    }

    if (onSaveUser) {
      await onSaveUser({
        ...collab,
        allowedTabs: collab.allowedTabs?.includes('sales')
          ? collab.allowedTabs
          : [...(collab.allowedTabs || []), 'sales'],
        salesPermissions: {
          canEditSales:
            collab.salesPermissions?.canEditSales !== undefined
              ? collab.salesPermissions.canEditSales
              : true,
          canCancelSales: Boolean(collab.salesPermissions?.canCancelSales),
          canViewCostsAndProfits: Boolean(collab.salesPermissions?.canViewCostsAndProfits),
          allowedWarehouseIds: collab.salesPermissions?.allowedWarehouseIds || collab.allowedWarehouseIds,
          isRouteCollector: enable,
          routeCollectorScope: scope,
        },
      });
    }

    await onSavePOSFinanceData({
      ...posFinanceData,
      routeCollectorConfig: {
        ...routeCollectorConfig,
        enabledCollectorUsernames: Array.from(currentEnabled),
      },
      updatedAt: Date.now(),
    });

    showToast(
      enable
        ? `Panel de Cobrador de Ruta habilitado para ${collab.name} (@${collab.username}).`
        : `Panel de Cobrador de Ruta desactivado para ${collab.name}.`,
      'success'
    );
  };

  const handleCreateDirectCreditDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onRecordSale) {
      showToast('Para crear una deuda usa el botón de Nueva Venta o recarga la vista.', 'warning');
      return;
    }
    const cleanCust = newDebtCustomerName.trim();
    if (!cleanCust) {
      showToast('Ingresa el nombre del cliente para la cuenta por cobrar.', 'warning');
      return;
    }
    const totalAmt = Math.max(0, parseFloat(newDebtTotalAmount) || 0);
    if (totalAmt <= 0) {
      showToast('Ingresa el monto total de la deuda / artículo al crédito.', 'warning');
      return;
    }
    const initAbono = Math.max(0, Math.min(totalAmt, parseFloat(newDebtInitialAbono) || 0));
    const balance = Math.max(0, totalAmt - initAbono);
    if (balance <= 0.01) {
      showToast('El saldo pendiente a cobrar debe ser mayor a L. 0.00.', 'warning');
      return;
    }

    const matchedProduct = inventory.find((p) => p.id === newDebtProductId);
    const articleTitle =
      newDebtCustomItemName.trim() ||
      (matchedProduct ? matchedProduct.name : 'Artículo Financiado al Crédito');

    setIsCreatingDebt(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleString('es-HN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const saleId = `sale_crd_${Date.now()}`;
      const saleNumber = `CRD-${String(Date.now()).slice(-6)}`;

      const initialPayments: CreditPaymentAbone[] =
        initAbono > 0
          ? [
              {
                id: `abn_init_${Date.now()}`,
                amount: initAbono,
                paymentMethod: 'cash',
                timestamp: now.getTime(),
                date: dateStr,
                receivedBy: currentUserName,
                notes: 'Prima / Abono inicial al crear cuenta por cobrar',
              },
            ]
          : [];

      const effectiveFirstDate =
        newDebtNextPaymentDate.trim() || calculateNextDateByFrequency(newDebtFrequency);

      const newCreditSaleData: Omit<SaleRecord, 'id'> = {
        saleNumber,
        companyId: storeSettings.companyId || 'gosen',
        date: dateStr,
        timestamp: now.getTime(),
        items: [
          {
            productId: matchedProduct?.id || `custom_${Date.now()}`,
            code: matchedProduct?.code || 'CREDITO',
            name: articleTitle,
            category: matchedProduct?.category || 'Crédito',
            cost: matchedProduct ? Number(matchedProduct.cost) || 0 : 0,
            price: totalAmt,
            creditPrice: totalAmt,
            unitDiscount: 0,
            quantity: 1,
            subtotal: totalAmt,
          },
        ],
        totalItems: 1,
        subtotal: totalAmt,
        discount: 0,
        tax: 0,
        total: totalAmt,
        paymentMethod: 'credit',
        customerName: cleanCust,
        customerPhone: newDebtCustomerPhone.trim() || undefined,
        customerAddress: newDebtCustomerAddress.trim() || undefined,
        notes: newDebtNotes.trim() || `Cuenta por cobrar (${newDebtFrequency})`,
        status: 'completed',
        cashier: currentUserName,
        cashierUserId: userSession?.userId,
        cashierUsername: userSession?.username,
        cashierRole: userSession?.role || 'admin',
        amountPaid: initAbono,
        change: 0,
        balanceDue: balance,
        creditDueDate: effectiveFirstDate,
        creditStatus: 'pending',
        creditPayments: initialPayments,
      };

      const recordedResult = await onRecordSale(newCreditSaleData);
      const recordedSaleId =
        recordedResult && typeof recordedResult === 'object' && 'id' in recordedResult
          ? recordedResult.id
          : saleId;
      const cleanAssignedUname = normalizeCollectorIdentifier(newDebtCollectorUsername);
      const matchedCollector = collaboratorUsers.find(
        (u) =>
          normalizeCollectorIdentifier(u.username) === cleanAssignedUname ||
          normalizeCollectorIdentifier(u.name) === cleanAssignedUname
      );
      const parsedInstallment = parseFloat(newDebtInstallmentAmount);

      const newControlMeta: CreditAccountControlMeta = {
        saleId: recordedSaleId,
        customTotalCost: matchedProduct ? Number(matchedProduct.cost) || 0 : 0,
        nextPaymentDate: effectiveFirstDate,
        paymentFrequency: newDebtFrequency,
        installmentAmount:
          !Number.isNaN(parsedInstallment) && parsedInstallment > 0 ? parsedInstallment : undefined,
        collectionNotes: newDebtNotes.trim() || undefined,
        assignedCollectorId: matchedCollector?.id || undefined,
        assignedCollectorUsername:
          matchedCollector?.username || (cleanAssignedUname || undefined),
        assignedCollectorName: matchedCollector?.name || undefined,
        customerAddressOrRoute: newDebtCustomerAddress.trim() || undefined,
        customerGpsLat: newDebtGpsCoords?.lat,
        customerGpsLng: newDebtGpsCoords?.lng,
        customerGpsAccuracy: newDebtGpsCoords?.accuracy,
        customerGpsCapturedAt: newDebtGpsCoords ? Date.now() : undefined,
        customerGpsCapturedBy: newDebtGpsCoords ? currentUserName : undefined,
        customerGpsFormattedAddress: newDebtGpsCoords?.formattedAddress,
        customerGpsPlusCode: newDebtGpsCoords?.plusCode,
        autoAdvanceNextDate: true,
      };

      const currentEnabled = new Set(
        (routeCollectorConfig.enabledCollectorUsernames || []).map((u) =>
          normalizeCollectorIdentifier(u)
        )
      );
      if (cleanAssignedUname) {
        currentEnabled.add(
          normalizeCollectorIdentifier(matchedCollector?.username || cleanAssignedUname)
        );
      }

      if (matchedCollector && onSaveUser) {
        await onSaveUser({
          ...matchedCollector,
          allowedTabs: matchedCollector.allowedTabs?.includes('sales')
            ? matchedCollector.allowedTabs
            : [...(matchedCollector.allowedTabs || []), 'sales'],
          salesPermissions: {
            canEditSales:
              matchedCollector.salesPermissions?.canEditSales !== undefined
                ? matchedCollector.salesPermissions.canEditSales
                : true,
            canCancelSales: Boolean(matchedCollector.salesPermissions?.canCancelSales),
            canViewCostsAndProfits: Boolean(
              matchedCollector.salesPermissions?.canViewCostsAndProfits
            ),
            allowedWarehouseIds:
              matchedCollector.salesPermissions?.allowedWarehouseIds ||
              matchedCollector.allowedWarehouseIds,
            isRouteCollector: true,
            routeCollectorScope:
              matchedCollector.salesPermissions?.routeCollectorScope || 'all',
          },
        }).catch(() => {});
      }

      await onSavePOSFinanceData({
        ...posFinanceData,
        creditAccountControls: {
          ...creditAccountControls,
          [recordedSaleId]: newControlMeta,
        },
        routeCollectorConfig: {
          ...routeCollectorConfig,
          enabledCollectorUsernames: Array.from(currentEnabled),
        },
        updatedAt: Date.now(),
      });

      showToast(
        `¡Cuenta por cobrar creada para ${cleanCust}! Saldo: L. ${balance.toFixed(2)} • Próximo cobro: ${effectiveFirstDate}`,
        'success'
      );
      setShowCreateDebtModal(false);
      setNewDebtCustomerName('');
      setNewDebtCustomerPhone('');
      setNewDebtCustomerAddress('');
      setNewDebtGpsCoords(null);
      setNewDebtProductId('');
      setNewDebtCustomItemName('');
      setNewDebtTotalAmount('');
      setNewDebtInitialAbono('0');
      setNewDebtInstallmentAmount('');
      setNewDebtNotes('');
    } finally {
      setIsCreatingDebt(false);
    }
  };

  const handleSaveCustomerGpsAddress = async (
    sale: SaleRecord,
    payload: {
      addressOrRoute: string;
      lat: number;
      lng: number;
      accuracy?: number;
      formattedAddress: string;
      plusCode?: string;
    }
  ) => {
    const now = new Date();
    const dateStr = now.toLocaleString('es-HN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const existingMeta: CreditAccountControlMeta = creditAccountControls[sale.id] || {
      saleId: sale.id,
    };

    const updatedMeta: CreditAccountControlMeta = {
      ...existingMeta,
      saleId: sale.id,
      customerAddressOrRoute: payload.addressOrRoute,
      customerGpsLat: payload.lat,
      customerGpsLng: payload.lng,
      customerGpsAccuracy: payload.accuracy,
      customerGpsCapturedAt: now.getTime(),
      customerGpsCapturedBy: currentUserName,
      customerGpsFormattedAddress: payload.formattedAddress,
      customerGpsPlusCode: payload.plusCode,
    };

    const nextAlerts = [...routeCollectorAlerts];
    if (!isAdminSession) {
      const gpsAlert: RouteCollectorAlert = {
        id: `rc_gps_${Date.now()}`,
        saleId: sale.id,
        saleNumber: sale.saleNumber,
        customerName: sale.customerName || 'Cliente',
        customerPhone: sale.customerPhone,
        collectorId: userSession?.userId,
        collectorUsername: userSession?.username || currentUserName,
        collectorName: currentUserName,
        alertType: 'gps_location_saved',
        title: `📍 Ubicación GPS capturada en sitio (${sale.customerName || 'Cliente'})`,
        message: `${currentUserName} registró la dirección GPS del cliente en ${payload.addressOrRoute} [Coordenadas: ${payload.lat.toFixed(
          6
        )}, ${payload.lng.toFixed(6)}]`,
        gpsLat: payload.lat,
        gpsLng: payload.lng,
        timestamp: now.getTime(),
        dateFormatted: dateStr,
        status: 'unread',
      };
      nextAlerts.unshift(gpsAlert);
    }

    await onSavePOSFinanceData({
      ...posFinanceData,
      creditAccountControls: {
        ...creditAccountControls,
        [sale.id]: updatedMeta,
      },
      routeCollectorAlerts: nextAlerts.slice(0, 150),
      updatedAt: now.getTime(),
    });

    showToast(
      `¡Dirección y punto GPS guardados para ${sale.customerName || 'Cliente'}!`,
      'success'
    );
  };

  const handleCaptureInlineGpsForField = async (target: 'control' | 'new_debt') => {
    setIsCapturingInlineGps(true);
    try {
      const pos = await captureDeviceGpsLocation();
      const geo = await reverseGeocodeCoordinates(pos.lat, pos.lng);
      const label = geo.plusCode
        ? `${geo.formattedAddress} (${geo.plusCode})`
        : geo.formattedAddress;
      if (target === 'control') {
        setCtrlCustomerAddressOrRoute(label);
        if (selectedSaleForControl) {
          await handleSaveCustomerGpsAddress(selectedSaleForControl, {
            addressOrRoute: label,
            lat: pos.lat,
            lng: pos.lng,
            accuracy: pos.accuracy,
            formattedAddress: geo.formattedAddress,
            plusCode: geo.plusCode,
          });
        }
      } else {
        setNewDebtCustomerAddress(label);
        setNewDebtGpsCoords({
          lat: pos.lat,
          lng: pos.lng,
          accuracy: pos.accuracy,
          formattedAddress: geo.formattedAddress,
          plusCode: geo.plusCode,
        });
        showToast(
          `📍 Dirección GPS detectada: ${geo.formattedAddress} (±${pos.accuracy}m)`,
          'success'
        );
      }
    } catch (err: any) {
      showToast(err?.message || 'No se pudo obtener el GPS actual.', 'warning');
    } finally {
      setIsCapturingInlineGps(false);
    }
  };

  const recordCollectionNoticeLog = async (
    sale: SaleRecord,
    type: CreditCollectionNoticeLog['noticeType'],
    channel: CreditCollectionNoticeLog['channel'],
    noteText: string
  ) => {
    const now = new Date();
    const dateStr = now.toLocaleString('es-HN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    const newNotice: CreditCollectionNoticeLog = {
      id: `ntc_${Date.now()}`,
      timestamp: now.getTime(),
      dateFormatted: dateStr,
      date: dateStr,
      noticeType: type,
      type,
      channel,
      sentBy: currentUserName,
      notes: noteText,
      note: noteText,
    };

    const existingMeta = creditAccountControls[sale.id] || { saleId: sale.id };
    const prevNotices = existingMeta.notices || [];
    const updatedMeta: CreditAccountControlMeta = {
      ...existingMeta,
      saleId: sale.id,
      lastNoticeAt: now.getTime(),
      lastNoticeTimestamp: now.getTime(),
      lastNoticeDate: dateStr,
      lastNoticeType:
        type === 'overdue'
          ? 'Cobro Vencido'
          : type === 'due_today'
          ? 'Día de Abono Hoy'
          : type === 'preventive'
          ? 'Recordatorio Preventivo'
          : 'Estado de Cuenta',
      noticeCount: (existingMeta.noticeCount ?? prevNotices.length) + 1,
      notices: [newNotice, ...prevNotices].slice(0, 40),
    };

    await onSavePOSFinanceData({
      ...posFinanceData,
      creditAccountControls: {
        ...creditAccountControls,
        [sale.id]: updatedMeta,
      },
      updatedAt: Date.now(),
    });
  };

  const handleSubmitCreditAbone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSaleForAbone) return;

    const currentBal =
      selectedSaleForAbone.balanceDue !== undefined
        ? Number(selectedSaleForAbone.balanceDue)
        : Math.max(
            0,
            Number(selectedSaleForAbone.total) - Number(selectedSaleForAbone.amountPaid || 0)
          );

    const amt = parseFloat(aboneAmount) || 0;
    if (amt <= 0 || amt > currentBal + 0.05) {
      showToast(`Ingresa un abono válido (máximo L. ${currentBal.toFixed(2)})`, 'warning');
      return;
    }

    setIsSubmittingAbone(true);
    try {
      const now = new Date();
      const dateStr = now.toLocaleString('es-HN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      const newAbone: CreditPaymentAbone = {
        id: `abn_${Date.now()}`,
        amount: Math.min(currentBal, amt),
        paymentMethod: aboneMethod,
        timestamp: now.getTime(),
        date: dateStr,
        receivedBy: currentUserName,
        notes: aboneNotes.trim() || '',
      };

      const analyticsBefore = getSaleCreditAnalytics(selectedSaleForAbone);
      const updatedSale = await onRecordCreditPayment(selectedSaleForAbone, newAbone);

      // Update nextPaymentDate (auto-calculated by frequency if not manually set) or clear if paid in full
      const newRemainingBalance = updatedSale.balanceDue ?? Math.max(0, currentBal - newAbone.amount);
      const existingMeta = creditAccountControls[selectedSaleForAbone.id] || {
        saleId: selectedSaleForAbone.id,
      };
      const resolvedNextPaymentDate =
        newRemainingBalance <= 0.01
          ? undefined
          : aboneNextDate.trim() ||
            (routeCollectorConfig.autoCalculateNextDateOnAbone !== false
              ? calculateNextDateByFrequency(
                  existingMeta.paymentFrequency,
                  analyticsBefore.effectiveNextDate
                )
              : existingMeta.nextPaymentDate);

      const updatedMeta: CreditAccountControlMeta = {
        ...existingMeta,
        saleId: selectedSaleForAbone.id,
        nextPaymentDate: resolvedNextPaymentDate,
      };

      const nextAlerts = [...routeCollectorAlerts];
      if (!isAdminSession && routeCollectorConfig.notifyAdminOnEveryAbone !== false) {
        nextAlerts.unshift({
          id: `ralert_${Date.now()}`,
          saleId: selectedSaleForAbone.id,
          saleNumber: selectedSaleForAbone.saleNumber,
          customerName: selectedSaleForAbone.customerName || 'Cliente',
          customerPhone: selectedSaleForAbone.customerPhone,
          collectorId: userSession?.userId,
          collectorUsername: userSession?.username || 'cobrador',
          collectorName: currentUserName,
          alertType: 'abono_collected',
          title: `💵 Abono cobrado en ruta: +L. ${newAbone.amount.toFixed(2)}`,
          message: `${currentUserName} registró un abono de L. ${newAbone.amount.toFixed(2)} (${
            aboneMethod === 'cash'
              ? 'Efectivo'
              : aboneMethod === 'transfer'
              ? 'Transferencia'
              : 'Tarjeta'
          }) de ${selectedSaleForAbone.customerName || 'Cliente'}. Nuevo saldo: L. ${newRemainingBalance.toFixed(2)}.${
            resolvedNextPaymentDate ? ` Próximo cobro programado: ${resolvedNextPaymentDate}.` : ' ¡Cuenta liquidada!'
          }`,
          amountCollected: newAbone.amount,
          scheduledNextDate: resolvedNextPaymentDate,
          timestamp: now.getTime(),
          dateFormatted: dateStr,
          status: 'unread',
        });
      }

      await onSavePOSFinanceData({
        ...posFinanceData,
        creditAccountControls: {
          ...creditAccountControls,
          [selectedSaleForAbone.id]: updatedMeta,
        },
        routeCollectorAlerts: nextAlerts.slice(0, 300),
        updatedAt: Date.now(),
      });

      const newPaidTotal = (Number(selectedSaleForAbone.amountPaid) || 0) + newAbone.amount;
      const crossedIntoProfit =
        canViewCostsAndProfits &&
        newRemainingBalance > 0.01 &&
        newPaidTotal >= analyticsBefore.totalCost - 0.01 &&
        analyticsBefore.totalCost > 0;

      setSelectedSaleForAbone(null);
      setAboneAmount('');
      setAboneNotes('');
      setAboneNextDate('');
      showToast(
        newRemainingBalance <= 0.01
          ? `¡Cuenta de ${updatedSale.customerName} liquidada en su totalidad!`
          : crossedIntoProfit
          ? `Abono registrado. ¡Precio Costo (L. ${analyticsBefore.totalCost.toFixed(2)}) 100% recuperado! Los L. ${newRemainingBalance.toFixed(2)} que restan son 100% GANANCIA.`
          : `Abono de L. ${newAbone.amount.toFixed(2)} registrado. Nuevo saldo: L. ${newRemainingBalance.toFixed(2)}${
              resolvedNextPaymentDate ? ` • Próximo cobro: ${resolvedNextPaymentDate}` : ''
            }`,
        'success'
      );
    } finally {
      setIsSubmittingAbone(false);
    }
  };

  const handleSendCreditReminderWhatsApp = (
    sale: SaleRecord,
    templateType: CreditCollectionNoticeLog['noticeType'] = 'statement'
  ) => {
    const a = getSaleCreditAnalytics(sale);
    const bal = a.balanceDue;
    const paid = a.paid;
    const storeTitle = (storeSettings.storeName || 'NUESTRA TIENDA').toUpperCase();
    const quotaText =
      a.controlMeta?.installmentAmount && a.controlMeta.installmentAmount > 0
        ? `L. ${a.controlMeta.installmentAmount.toFixed(2)}`
        : null;

    let msg = `👋 Hola *${sale.customerName || 'Estimado Cliente'}*, le saludamos cordialmente de *${storeTitle}*.\n\n`;

    if (templateType === 'overdue') {
      msg += `🚨 *AVISO DE COBRO DE ABONO PENDIENTE*\n`;
      msg += `Le recordamos que su fecha programada de abono (${a.effectiveNextDate || 'vencida'}) se encuentra pendiente de pago.\n`;
      if (quotaText) {
        msg += `💳 *Cuota / Abono acordado:* *${quotaText}*\n`;
      }
      msg += `\n`;
    } else if (templateType === 'due_today') {
      msg += `🔔 *RECORDATORIO: HOY CORRESPONDE SU ABONO*\n`;
      msg += `Le recordamos amablemente que el día de hoy (${a.effectiveNextDate || 'Hoy'}) está programado su abono a cuenta.\n`;
      if (quotaText) {
        msg += `💳 *Cuota / Abono acordado:* *${quotaText}*\n`;
      }
      msg += `\n`;
    } else if (templateType === 'preventive') {
      msg += `📅 *RECORDATORIO PREVENTIVO DE PRÓXIMO ABONO*\n`;
      if (a.effectiveNextDate) {
        msg += `Le recordamos que su próximo abono está programado para el día *${a.effectiveNextDate}*.\n`;
      }
      if (quotaText) {
        msg += `💳 *Cuota sugerida:* *${quotaText}*\n`;
      }
      msg += `\n`;
    } else {
      msg += `Le compartimos el estado de cuenta actualizado de su compra al crédito:\n`;
    }

    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `📄 *Factura / Ticket:* ${sale.saleNumber}\n`;
    msg += `📅 *Fecha de Compra:* ${sale.date}\n`;
    if (a.effectiveNextDate) {
      msg += `⏰ *Próximo Abono / Vencimiento:* ${a.effectiveNextDate}\n`;
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

    // Record the notice automatically in Firestore
    const noteLabel =
      templateType === 'overdue'
        ? `Aviso de cobro vencido enviado por WhatsApp (Saldo: L. ${bal.toFixed(2)})`
        : templateType === 'due_today'
        ? `Aviso de abono del día de hoy enviado por WhatsApp`
        : templateType === 'preventive'
        ? `Recordatorio preventivo de abono enviado por WhatsApp`
        : `Estado de cuenta enviado por WhatsApp`;

    void recordCollectionNoticeLog(sale, templateType, 'whatsapp', noteLabel);

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

  // ==================== 4. LOYALTY PROGRAM / CLIENTES FRECUENTES STATE ====================
  const loyaltyConfig: LoyaltyProgramConfig = useMemo(
    () => ({
      enabled: posFinanceData.loyaltyConfig?.enabled !== false,
      amountPerPoint: Math.max(1, Number(posFinanceData.loyaltyConfig?.amountPerPoint) || 100),
      pointsEarnedPerStep: Math.max(
        1,
        Number(posFinanceData.loyaltyConfig?.pointsEarnedPerStep) || 1
      ),
      lempirasPerPointRedeem: Math.max(
        0.1,
        Number(posFinanceData.loyaltyConfig?.lempirasPerPointRedeem) || 5
      ),
      minPointsToRedeem: Math.max(1, Number(posFinanceData.loyaltyConfig?.minPointsToRedeem) || 5),
      welcomeBonusPoints: Math.max(
        0,
        Number(posFinanceData.loyaltyConfig?.welcomeBonusPoints) || 0
      ),
    }),
    [posFinanceData.loyaltyConfig]
  );

  const loyaltyCustomers: LoyaltyCustomerProfile[] = useMemo(
    () =>
      (posFinanceData.loyaltyCustomers || []).slice().sort((a, b) => {
        if (b.currentPoints !== a.currentPoints) return b.currentPoints - a.currentPoints;
        return (b.totalPurchasesAmount || 0) - (a.totalPurchasesAmount || 0);
      }),
    [posFinanceData.loyaltyCustomers]
  );

  const [loyaltySearch, setLoyaltySearch] = useState<string>('');
  const [loyaltyTierFilter, setLoyaltyTierFilter] = useState<
    'all' | 'redeemable' | 'diamond' | 'gold' | 'silver' | 'bronze'
  >('all');
  const [showLoyaltyConfigModal, setShowLoyaltyConfigModal] = useState<boolean>(false);
  const [cfgEnabled, setCfgEnabled] = useState<boolean>(loyaltyConfig.enabled);
  const [cfgAmountPerPoint, setCfgAmountPerPoint] = useState<string>(
    String(loyaltyConfig.amountPerPoint)
  );
  const [cfgPointsPerStep, setCfgPointsPerStep] = useState<string>(
    String(loyaltyConfig.pointsEarnedPerStep)
  );
  const [cfgLempirasPerPoint, setCfgLempirasPerPoint] = useState<string>(
    String(loyaltyConfig.lempirasPerPointRedeem)
  );
  const [cfgMinRedeem, setCfgMinRedeem] = useState<string>(String(loyaltyConfig.minPointsToRedeem));
  const [cfgWelcomeBonus, setCfgWelcomeBonus] = useState<string>(
    String(loyaltyConfig.welcomeBonusPoints)
  );

  // Customer Create/Edit Modal State
  const [isLoyaltyCustomerModalOpen, setIsLoyaltyCustomerModalOpen] = useState<boolean>(false);
  const [editingLoyaltyCustomer, setEditingLoyaltyCustomer] =
    useState<LoyaltyCustomerProfile | null>(null);
  const [custFormName, setCustFormName] = useState<string>('');
  const [custFormPhone, setCustFormPhone] = useState<string>('');
  const [custFormRtn, setCustFormRtn] = useState<string>('');
  const [custFormBirthday, setCustFormBirthday] = useState<string>('');
  const [custFormNotes, setCustFormNotes] = useState<string>('');
  const [custFormInitialPoints, setCustFormInitialPoints] = useState<string>('');

  // Manual Points Adjustment Modal State
  const [customerForPointsAdjust, setCustomerForPointsAdjust] =
    useState<LoyaltyCustomerProfile | null>(null);
  const [adjustMode, setAdjustMode] = useState<'bonus' | 'redeem'>('bonus');
  const [adjustPointsInput, setAdjustPointsInput] = useState<string>('');
  const [adjustReasonInput, setAdjustReasonInput] = useState<string>('');

  // Customer History Modal State
  const [customerForHistoryModal, setCustomerForHistoryModal] =
    useState<LoyaltyCustomerProfile | null>(null);

  const getCustomerVipTier = (totalSpent: number) => {
    if (totalSpent >= 15000) {
      return {
        id: 'diamond' as const,
        label: 'Diamante VIP',
        badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300',
        cardGradient: 'from-indigo-900 via-purple-900 to-slate-900',
        nextTierLabel: 'Nivel Máximo Alcanzado',
        amountToNext: 0,
      };
    }
    if (totalSpent >= 7500) {
      return {
        id: 'gold' as const,
        label: 'Oro VIP',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
        cardGradient: 'from-amber-700 via-yellow-800 to-slate-900',
        nextTierLabel: 'Diamante VIP',
        amountToNext: Math.max(0, 15000 - totalSpent),
      };
    }
    if (totalSpent >= 2500) {
      return {
        id: 'silver' as const,
        label: 'Plata',
        badgeClass: 'bg-slate-200 text-slate-800 border-slate-300',
        cardGradient: 'from-slate-700 via-slate-800 to-slate-950',
        nextTierLabel: 'Oro VIP',
        amountToNext: Math.max(0, 7500 - totalSpent),
      };
    }
    return {
      id: 'bronze' as const,
      label: 'Bronce',
      badgeClass: 'bg-orange-100 text-orange-900 border-orange-300',
      cardGradient: 'from-emerald-800 via-teal-900 to-slate-950',
      nextTierLabel: 'Plata',
      amountToNext: Math.max(0, 2500 - totalSpent),
    };
  };

  const filteredLoyaltyCustomers = useMemo(() => {
    const q = loyaltySearch.trim().toLowerCase();
    return loyaltyCustomers.filter((c) => {
      const tier = getCustomerVipTier(c.totalPurchasesAmount || 0);
      if (loyaltyTierFilter === 'redeemable' && c.currentPoints < loyaltyConfig.minPointsToRedeem) {
        return false;
      }
      if (
        loyaltyTierFilter !== 'all' &&
        loyaltyTierFilter !== 'redeemable' &&
        tier.id !== loyaltyTierFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.phone || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        (c.rtn || '').toLowerCase().includes(q)
      );
    });
  }, [loyaltyCustomers, loyaltySearch, loyaltyTierFilter, loyaltyConfig.minPointsToRedeem]);

  const loyaltyStats = useMemo(() => {
    let totalActivePoints = 0;
    let totalRedeemedPoints = 0;
    let totalPurchasesVip = 0;
    let redeemableCustomersCount = 0;

    loyaltyCustomers.forEach((c) => {
      totalActivePoints += Number(c.currentPoints) || 0;
      totalRedeemedPoints += Number(c.totalPointsRedeemed) || 0;
      totalPurchasesVip += Number(c.totalPurchasesAmount) || 0;
      if ((Number(c.currentPoints) || 0) >= loyaltyConfig.minPointsToRedeem) {
        redeemableCustomersCount += 1;
      }
    });

    return {
      totalCustomers: loyaltyCustomers.length,
      totalActivePoints,
      totalActiveLempirasValue: totalActivePoints * loyaltyConfig.lempirasPerPointRedeem,
      totalRedeemedPoints,
      totalRedeemedLempirasValue: totalRedeemedPoints * loyaltyConfig.lempirasPerPointRedeem,
      totalPurchasesVip,
      redeemableCustomersCount,
    };
  }, [loyaltyCustomers, loyaltyConfig]);

  const handleSaveLoyaltyConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedCfg: LoyaltyProgramConfig = {
      enabled: cfgEnabled,
      amountPerPoint: Math.max(1, parseFloat(cfgAmountPerPoint) || 100),
      pointsEarnedPerStep: Math.max(1, Math.round(parseFloat(cfgPointsPerStep) || 1)),
      lempirasPerPointRedeem: Math.max(0.1, parseFloat(cfgLempirasPerPoint) || 5),
      minPointsToRedeem: Math.max(1, Math.round(parseFloat(cfgMinRedeem) || 5)),
      welcomeBonusPoints: Math.max(0, Math.round(parseFloat(cfgWelcomeBonus) || 0)),
    };

    await onSavePOSFinanceData({
      ...posFinanceData,
      loyaltyConfig: updatedCfg,
      updatedAt: Date.now(),
    });
    setShowLoyaltyConfigModal(false);
    showToast('Configuración del Programa de Puntos guardada correctamente', 'success');
  };

  const openNewLoyaltyCustomerModal = () => {
    setEditingLoyaltyCustomer(null);
    setCustFormName('');
    setCustFormPhone('');
    setCustFormRtn('');
    setCustFormBirthday('');
    setCustFormNotes('');
    setCustFormInitialPoints(
      loyaltyConfig.welcomeBonusPoints > 0 ? String(loyaltyConfig.welcomeBonusPoints) : ''
    );
    setIsLoyaltyCustomerModalOpen(true);
  };

  const openEditLoyaltyCustomerModal = (cust: LoyaltyCustomerProfile) => {
    setEditingLoyaltyCustomer(cust);
    setCustFormName(cust.name);
    setCustFormPhone(cust.phone);
    setCustFormRtn(cust.rtn || '');
    setCustFormBirthday(cust.birthday || '');
    setCustFormNotes(cust.notes || '');
    setCustFormInitialPoints(String(cust.currentPoints || 0));
    setIsLoyaltyCustomerModalOpen(true);
  };

  const handleSaveLoyaltyCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = custFormName.trim();
    const cleanPhone = custFormPhone.trim();
    if (!cleanName) {
      showToast('Ingresa el nombre completo del cliente frecuente', 'warning');
      return;
    }
    if (!cleanPhone) {
      showToast('Ingresa el número de teléfono / WhatsApp para identificar sus puntos', 'warning');
      return;
    }

    const normalizedDigits = cleanPhone.replace(/\D/g, '');
    const duplicate = loyaltyCustomers.find(
      (c) =>
        c.id !== editingLoyaltyCustomer?.id &&
        normalizedDigits.length >= 7 &&
        c.phone.replace(/\D/g, '') === normalizedDigits
    );
    if (duplicate) {
      showToast(
        `Ya existe un cliente registrado con ese número (${duplicate.name} - ${duplicate.code})`,
        'warning'
      );
      return;
    }

    const now = Date.now();
    const dateFormatted = new Date(now).toLocaleString('es-HN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    if (editingLoyaltyCustomer) {
      const updatedList = loyaltyCustomers.map((c) =>
        c.id === editingLoyaltyCustomer.id
          ? {
              ...c,
              name: cleanName,
              phone: cleanPhone,
              rtn: custFormRtn.trim() || undefined,
              birthday: custFormBirthday.trim() || undefined,
              notes: custFormNotes.trim() || undefined,
              updatedAt: now,
            }
          : c
      );
      await onSavePOSFinanceData({
        ...posFinanceData,
        loyaltyCustomers: updatedList,
        updatedAt: now,
      });
      showToast(`Datos de ${cleanName} actualizados`, 'success');
    } else {
      const initialPts = Math.max(0, Math.round(parseFloat(custFormInitialPoints) || 0));
      const nextCodeNum = 1001 + loyaltyCustomers.length;
      const newCust: LoyaltyCustomerProfile = {
        id: `vip_${now}_${Math.random().toString(36).slice(2, 6)}`,
        code: `VIP-${nextCodeNum}`,
        name: cleanName,
        phone: cleanPhone,
        rtn: custFormRtn.trim() || undefined,
        birthday: custFormBirthday.trim() || undefined,
        notes: custFormNotes.trim() || undefined,
        currentPoints: initialPts,
        totalPointsEarned: initialPts,
        totalPointsRedeemed: 0,
        totalPurchasesAmount: 0,
        purchasesCount: 0,
        history:
          initialPts > 0
            ? [
                {
                  id: `log_${now}`,
                  timestamp: now,
                  dateFormatted,
                  type: 'bonus',
                  points: initialPts,
                  balanceAfter: initialPts,
                  notes: 'Bono de bienvenida al inscribirse al Club de Clientes Frecuentes',
                  registeredBy: currentUserName,
                },
              ]
            : [],
        createdAt: now,
        updatedAt: now,
      };

      await onSavePOSFinanceData({
        ...posFinanceData,
        loyaltyCustomers: [newCust, ...loyaltyCustomers],
        updatedAt: now,
      });
      showToast(
        `¡Tarjeta ${newCust.code} creada para ${cleanName}${
          initialPts > 0 ? ` con +${initialPts} pts de bienvenida` : ''
        }!`,
        'success'
      );
    }

    setIsLoyaltyCustomerModalOpen(false);
  };

  const handleDeleteLoyaltyCustomer = async (cust: LoyaltyCustomerProfile) => {
    const updatedList = loyaltyCustomers.filter((c) => c.id !== cust.id);
    await onSavePOSFinanceData({
      ...posFinanceData,
      loyaltyCustomers: updatedList,
      updatedAt: Date.now(),
    });
    showToast(`Cliente ${cust.name} eliminado del programa de puntos`, 'info');
  };

  const handleAdjustCustomerPoints = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForPointsAdjust) return;
    const pts = Math.max(0, Math.round(parseFloat(adjustPointsInput) || 0));
    if (pts <= 0) {
      showToast('Ingresa una cantidad de puntos mayor a 0', 'warning');
      return;
    }
    if (adjustMode === 'redeem' && pts > customerForPointsAdjust.currentPoints) {
      showToast(
        `El cliente solo tiene ${customerForPointsAdjust.currentPoints} puntos disponibles`,
        'warning'
      );
      return;
    }

    const now = Date.now();
    const dateFormatted = new Date(now).toLocaleString('es-HN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const delta = adjustMode === 'bonus' ? pts : -pts;
    const newBalance = Math.max(0, (customerForPointsAdjust.currentPoints || 0) + delta);
    const logEntry: LoyaltyTransactionLog = {
      id: `log_${now}`,
      timestamp: now,
      dateFormatted,
      type: adjustMode === 'bonus' ? 'bonus' : 'redeem',
      points: delta,
      balanceAfter: newBalance,
      discountApplied:
        adjustMode === 'redeem' ? pts * loyaltyConfig.lempirasPerPointRedeem : undefined,
      notes:
        adjustReasonInput.trim() ||
        (adjustMode === 'bonus'
          ? 'Bono de puntos otorgado manualmente'
          : 'Canje manual de puntos en tienda'),
      registeredBy: currentUserName,
    };

    const updatedCustomers = loyaltyCustomers.map((c) =>
      c.id === customerForPointsAdjust.id
        ? {
            ...c,
            currentPoints: newBalance,
            totalPointsEarned:
              adjustMode === 'bonus' ? (c.totalPointsEarned || 0) + pts : c.totalPointsEarned || 0,
            totalPointsRedeemed:
              adjustMode === 'redeem'
                ? (c.totalPointsRedeemed || 0) + pts
                : c.totalPointsRedeemed || 0,
            history: [logEntry, ...(c.history || [])].slice(0, 80),
            updatedAt: now,
          }
        : c
    );

    await onSavePOSFinanceData({
      ...posFinanceData,
      loyaltyCustomers: updatedCustomers,
      updatedAt: now,
    });

    showToast(
      adjustMode === 'bonus'
        ? `¡+${pts} puntos acreditados a ${customerForPointsAdjust.name}! Nuevo saldo: ${newBalance} pts`
        : `¡${pts} puntos canjeados (-L. ${(pts * loyaltyConfig.lempirasPerPointRedeem).toFixed(2)}) para ${customerForPointsAdjust.name}!`,
      'success'
    );
    setCustomerForPointsAdjust(null);
    setAdjustPointsInput('');
    setAdjustReasonInput('');
  };

  // Sync past sales customers into Loyalty Directory with 1 click
  const handleSyncCustomersFromSalesHistory = async () => {
    const existingByPhone = new Set(
      loyaltyCustomers.map((c) => c.phone.replace(/\D/g, '')).filter((d) => d.length >= 7)
    );
    const existingByName = new Set(loyaltyCustomers.map((c) => c.name.trim().toLowerCase()));

    const grouped = new Map<
      string,
      {
        name: string;
        phone: string;
        rtn?: string;
        totalSpent: number;
        count: number;
      }
    >();

    sales.forEach((s) => {
      if (s.status !== 'completed') return;
      const rawName = (s.customerName || '').trim();
      const rawPhone = (s.customerPhone || '').trim();
      if (!rawName || rawName.toLowerCase() === 'consumidor final') return;

      const digits = rawPhone.replace(/\D/g, '');
      const key = digits.length >= 7 ? `tel_${digits}` : `name_${rawName.toLowerCase()}`;
      const prev = grouped.get(key);
      if (prev) {
        prev.totalSpent += Number(s.total) || 0;
        prev.count += 1;
        if (!prev.phone && rawPhone) prev.phone = rawPhone;
        if (!prev.rtn && s.customerRtn) prev.rtn = s.customerRtn;
      } else {
        grouped.set(key, {
          name: rawName,
          phone: rawPhone,
          rtn: s.customerRtn,
          totalSpent: Number(s.total) || 0,
          count: 1,
        });
      }
    });

    const newProfiles: LoyaltyCustomerProfile[] = [];
    const now = Date.now();
    const dateFormatted = new Date(now).toLocaleString('es-HN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });

    let seq = 1001 + loyaltyCustomers.length;
    grouped.forEach((item) => {
      const digits = item.phone.replace(/\D/g, '');
      if (digits.length >= 7 && existingByPhone.has(digits)) return;
      if (existingByName.has(item.name.toLowerCase())) return;

      const earnedPts =
        Math.floor(item.totalSpent / loyaltyConfig.amountPerPoint) *
        loyaltyConfig.pointsEarnedPerStep;

      newProfiles.push({
        id: `vip_${now}_${seq}`,
        code: `VIP-${seq}`,
        name: item.name,
        phone: item.phone || 'Sin teléfono',
        rtn: item.rtn,
        currentPoints: earnedPts,
        totalPointsEarned: earnedPts,
        totalPointsRedeemed: 0,
        totalPurchasesAmount: item.totalSpent,
        purchasesCount: item.count,
        history:
          earnedPts > 0
            ? [
                {
                  id: `log_sync_${seq}`,
                  timestamp: now,
                  dateFormatted,
                  type: 'earn',
                  points: earnedPts,
                  balanceAfter: earnedPts,
                  notes: `Puntos calculados de ${item.count} compra(s) en historial (L. ${item.totalSpent.toFixed(2)})`,
                  registeredBy: currentUserName,
                },
              ]
            : [],
        createdAt: now,
        updatedAt: now,
      });
      seq += 1;
    });

    if (newProfiles.length === 0) {
      showToast('Todos los clientes con nombre en tu historial de ventas ya están inscritos.', 'info');
      return;
    }

    await onSavePOSFinanceData({
      ...posFinanceData,
      loyaltyCustomers: [...newProfiles, ...loyaltyCustomers],
      updatedAt: now,
    });
    showToast(
      `¡Se importaron ${newProfiles.length} clientes frecuentes desde el historial de ventas con sus puntos acumulados!`,
      'success'
    );
  };

  const handleSendLoyaltyCardWhatsApp = (cust: LoyaltyCustomerProfile) => {
    const storeTitle = (storeSettings.storeName || 'NUESTRA TIENDA').toUpperCase();
    const tier = getCustomerVipTier(cust.totalPurchasesAmount || 0);
    const lempirasValue = (cust.currentPoints || 0) * loyaltyConfig.lempirasPerPointRedeem;
    const canRedeemNow = (cust.currentPoints || 0) >= loyaltyConfig.minPointsToRedeem;

    let msg = `🏆 *TARJETA DIGITAL DE CLIENTE FRECUENTE*\n`;
    msg += `✨ *${storeTitle}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `👤 *Titular:* ${cust.name}\n`;
    msg += `🪪 *Código VIP:* ${cust.code}\n`;
    msg += `⭐ *Nivel Actual:* ${tier.label}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🎁 *SALDO DE PUNTOS ACUMULADOS:*\n`;
    msg += `👉 *${cust.currentPoints} Puntos Disponibles*\n`;
    msg += `💵 *Equivalente en Descuento:* *L. ${lempirasValue.toFixed(2)}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    if (canRedeemNow) {
      msg += `✅ *¡Tus puntos ya están listos para canjear!* Puedes usarlos como descuento directo en tu próxima compra.\n`;
    } else {
      const missingPts = Math.max(0, loyaltyConfig.minPointsToRedeem - (cust.currentPoints || 0));
      msg += `🎯 Te faltan solo *${missingPts} puntos* para poder canjear tu descuento en caja (Mínimo: ${loyaltyConfig.minPointsToRedeem} pts).\n`;
    }
    msg += `\n💡 *¿Cómo ganas más puntos?*\n`;
    msg += `Por cada *L. ${loyaltyConfig.amountPerPoint.toFixed(0)}* de compra acumulas *+${loyaltyConfig.pointsEarnedPerStep} punto(s)* automáticamente con tu número de teléfono.\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `¡Gracias por ser parte de nuestros clientes preferenciales! 🙌`;

    const cleanDigits = (cust.phone || '').replace(/\D/g, '');
    const finalPhone = cleanDigits.length === 8 ? `504${cleanDigits}` : cleanDigits;
    const url =
      finalPhone.length >= 8
        ? `https://wa.me/${finalPhone}?text=${encodeURIComponent(msg)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    showToast(`Enviando Tarjeta Digital VIP a ${cust.name} por WhatsApp...`, 'success');
  };

  // ==================== RENDER MODE 4: LOYALTY / CLIENTES FRECUENTES ====================
  if (mode === 'loyalty') {
    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container px-3 sm:px-6 lg:px-8 py-3 sm:py-5 pb-32">
        <div className="w-full max-w-[1640px] mx-auto space-y-5">
        {/* Top Hero Banner */}
        <div className="p-4 sm:p-6 rounded-2xl bg-gradient-to-r from-amber-950 via-slate-900 to-indigo-950 text-white border border-amber-500/30 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0 shadow-inner">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950">
                  Fidelización VIP
                </span>
                <span
                  className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                    loyaltyConfig.enabled
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {loyaltyConfig.enabled ? '● Programa Activo en Caja POS' : '○ Programa Pausado'}
                </span>
              </div>
              <h2 className="text-lg sm:text-xl font-black mt-1">
                Tarjeta de Cliente Frecuente y Puntos Acumulados
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Regla actual: Cada{' '}
                <strong className="text-amber-300">
                  L. {loyaltyConfig.amountPerPoint.toFixed(0)}
                </strong>{' '}
                de compra suma{' '}
                <strong className="text-amber-300">
                  +{loyaltyConfig.pointsEarnedPerStep} punto(s)
                </strong>{' '}
                • Cada punto equivale a{' '}
                <strong className="text-emerald-300">
                  L. {loyaltyConfig.lempirasPerPointRedeem.toFixed(2)}
                </strong>{' '}
                de descuento al canjear.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCfgEnabled(loyaltyConfig.enabled);
                setCfgAmountPerPoint(String(loyaltyConfig.amountPerPoint));
                setCfgPointsPerStep(String(loyaltyConfig.pointsEarnedPerStep));
                setCfgLempirasPerPoint(String(loyaltyConfig.lempirasPerPointRedeem));
                setCfgMinRedeem(String(loyaltyConfig.minPointsToRedeem));
                setCfgWelcomeBonus(String(loyaltyConfig.welcomeBonusPoints));
                setShowLoyaltyConfigModal(true);
              }}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/15 flex items-center gap-1.5 cursor-pointer transition-all"
            >
              <Settings className="w-4 h-4 text-amber-300" />
              <span>Configurar Reglas de Puntos</span>
            </button>

            <button
              type="button"
              onClick={handleSyncCustomersFromSalesHistory}
              className="px-3.5 py-2.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white font-bold text-xs border border-indigo-400/30 flex items-center gap-1.5 cursor-pointer transition-all"
              title="Importar automáticamente clientes de ventas pasadas"
            >
              <Sparkles className="w-4 h-4 text-amber-200" />
              <span>Importar de Historial Ventas</span>
            </button>

            <button
              type="button"
              onClick={openNewLoyaltyCustomerModal}
              className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer transition-all shadow-sm"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Inscribir Cliente VIP</span>
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>CLIENTES FRECUENTES</span>
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-1">
              {loyaltyStats.totalCustomers}
            </p>
            <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">
              {loyaltyStats.redeemableCustomersCount} cliente(s) listos para canjear hoy
            </p>
          </div>

          <div className="bg-amber-50/90 p-4 rounded-2xl border border-amber-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-amber-900">
              <span>PUNTOS ACTIVOS DISPONIBLES</span>
              <Star className="w-4 h-4 text-amber-600 fill-amber-400" />
            </div>
            <p className="text-2xl font-black text-amber-950 mt-1">
              {loyaltyStats.totalActivePoints.toLocaleString()} pts
            </p>
            <p className="text-[11px] text-amber-800 font-bold mt-0.5">
              Equivalen a L. {loyaltyStats.totalActiveLempirasValue.toFixed(2)} en descuentos
            </p>
          </div>

          <div className="bg-emerald-50/90 p-4 rounded-2xl border border-emerald-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
              <span>PUNTOS YA CANJEADOS</span>
              <Gift className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-emerald-950 mt-1">
              {loyaltyStats.totalRedeemedPoints.toLocaleString()} pts
            </p>
            <p className="text-[11px] text-emerald-800 font-bold mt-0.5">
              L. {loyaltyStats.totalRedeemedLempirasValue.toFixed(2)} premiados a clientes
            </p>
          </div>

          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500">
              <span>COMPRAS ACUMULADAS VIP</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 mt-1">
              L. {loyaltyStats.totalPurchasesVip.toFixed(2)}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Mínimo para canjear: {loyaltyConfig.minPointsToRedeem} pts (L.{' '}
              {(loyaltyConfig.minPointsToRedeem * loyaltyConfig.lempirasPerPointRedeem).toFixed(2)})
            </p>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Buscar cliente por teléfono, nombre, código VIP o RTN..."
              value={loyaltySearch}
              onChange={(e) => setLoyaltySearch(e.target.value)}
              className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            {loyaltySearch && (
              <button
                type="button"
                onClick={() => setLoyaltySearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'Todos' },
              { id: 'redeemable', label: '🎁 Listos para Canjear' },
              { id: 'diamond', label: '💎 Diamante' },
              { id: 'gold', label: '🥇 Oro' },
              { id: 'silver', label: '🥈 Plata' },
              { id: 'bronze', label: '🥉 Bronce' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setLoyaltyTierFilter(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all ${
                  loyaltyTierFilter === tab.id
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Frequent Customers Cards Grid */}
        {filteredLoyaltyCustomers.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
              <Award className="w-7 h-7" />
            </div>
            <h3 className="text-base font-black text-slate-900">
              {loyaltyCustomers.length === 0
                ? 'Aún no hay Clientes Frecuentes inscritos'
                : 'No se encontraron clientes con ese filtro'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Inscribe a tus clientes con su nombre y número de teléfono o importa tus clientes del
              historial de ventas. En cada compra desde el Punto de Venta (POS) acumularán puntos
              automáticamente.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={openNewLoyaltyCustomerModal}
                className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Inscribir Primer Cliente Frecuente</span>
              </button>
              {sales.length > 0 && (
                <button
                  type="button"
                  onClick={handleSyncCustomersFromSalesHistory}
                  className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Importar Clientes de Ventas Realizadas</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredLoyaltyCustomers.map((cust) => {
              const tier = getCustomerVipTier(cust.totalPurchasesAmount || 0);
              const redeemValueLps =
                (Number(cust.currentPoints) || 0) * loyaltyConfig.lempirasPerPointRedeem;
              const isRedeemable =
                (Number(cust.currentPoints) || 0) >= loyaltyConfig.minPointsToRedeem;

              return (
                <div
                  key={cust.id}
                  className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col justify-between hover:shadow-md transition-all"
                >
                  {/* Top Digital VIP Card Header */}
                  <div
                    className={`p-4 bg-gradient-to-br ${tier.cardGradient} text-white relative overflow-hidden`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[10px] font-black tracking-wider bg-white/15 px-2 py-0.5 rounded-md border border-white/20">
                            {cust.code}
                          </span>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider bg-amber-400 text-slate-950 px-2 py-0.5 rounded-md">
                            {tier.label}
                          </span>
                        </div>
                        <h3 className="font-black text-base text-white mt-1.5 truncate">
                          {cust.name}
                        </h3>
                        <p className="text-xs text-slate-200 flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                          <span>{cust.phone || 'Sin teléfono'}</span>
                        </p>
                      </div>

                      <div className="text-right shrink-0 bg-black/25 backdrop-blur-xs px-3 py-2 rounded-xl border border-white/15">
                        <span className="text-[10px] uppercase tracking-wider text-amber-200 font-bold block">
                          Saldo Puntos
                        </span>
                        <span className="text-xl font-black text-amber-300 tabular-nums">
                          {cust.currentPoints}
                        </span>
                        <span className="text-[10px] text-emerald-300 font-bold block">
                          = L. {redeemValueLps.toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Body Metrics */}
                  <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                    <div className="space-y-2.5">
                      <div className="grid grid-cols-3 gap-2 text-center bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">
                            Compras
                          </span>
                          <span className="text-xs font-black text-slate-800">
                            {cust.purchasesCount || 0}
                          </span>
                        </div>
                        <div className="border-x border-slate-200/80 px-1">
                          <span className="text-[10px] text-slate-400 font-bold block">
                            Total Comprado
                          </span>
                          <span className="text-xs font-black text-slate-800">
                            L. {(cust.totalPurchasesAmount || 0).toFixed(0)}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold block">
                            Canjeados
                          </span>
                          <span className="text-xs font-black text-emerald-700">
                            {cust.totalPointsRedeemed || 0} pts
                          </span>
                        </div>
                      </div>

                      {isRedeemable ? (
                        <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs">
                          <span className="font-bold text-emerald-900 flex items-center gap-1.5">
                            <Gift className="w-4 h-4 text-emerald-600 shrink-0" />
                            <span>Descuento disponible en caja:</span>
                          </span>
                          <span className="font-black text-emerald-700">
                            - L. {redeemValueLps.toFixed(2)}
                          </span>
                        </div>
                      ) : (
                        <div className="px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-[11px] text-slate-500">
                          <span>
                            Faltan{' '}
                            <strong>
                              {Math.max(0, loyaltyConfig.minPointsToRedeem - cust.currentPoints)}{' '}
                              pts
                            </strong>{' '}
                            para poder canjear
                          </span>
                          <span>Mín: {loyaltyConfig.minPointsToRedeem} pts</span>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons Footer */}
                    <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSendLoyaltyCardWhatsApp(cust)}
                        className="flex-1 py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                        title="Enviar Tarjeta Digital con saldo de puntos por WhatsApp"
                      >
                        <WhatsAppIcon className="w-3.5 h-3.5 shrink-0" />
                        <span>Enviar Tarjeta</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCustomerForPointsAdjust(cust);
                          setAdjustMode('bonus');
                          setAdjustPointsInput('');
                          setAdjustReasonInput('');
                        }}
                        className="py-2 px-2.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-xs flex items-center justify-center gap-1 cursor-pointer transition-all"
                        title="Sumar bono de puntos o canjear puntos manualmente"
                      >
                        <Gift className="w-3.5 h-3.5 text-amber-700" />
                        <span>+Pts / Canjear</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCustomerForHistoryModal(cust)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="Ver historial de puntos del cliente"
                      >
                        <History className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditLoyaltyCustomerModal(cust)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                        title="Editar datos del cliente"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteLoyaltyCustomer(cust)}
                        className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Eliminar cliente"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* MODAL 1: CONFIGURAR REGLAS DEL PROGRAMA DE PUNTOS */}
        {showLoyaltyConfigModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-400" />
                  <h3 className="font-black text-sm">Configurar Programa de Puntos VIP</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowLoyaltyConfigModal(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveLoyaltyConfig} className="p-5 space-y-4 text-xs">
                <label className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <div>
                    <span className="font-black text-slate-900 block">
                      Activar Programa de Puntos en Caja
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Permite acumular y canjear puntos al facturar en el POS
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={cfgEnabled}
                    onChange={(e) => setCfgEnabled(e.target.checked)}
                    className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Por cada compra de (L.):
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      value={cfgAmountPerPoint}
                      onChange={(e) => setCfgAmountPerPoint(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-slate-900"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Ej. Cada L. 100 de compra
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      El cliente gana (Puntos):
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={cfgPointsPerStep}
                      onChange={(e) => setCfgPointsPerStep(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-amber-700"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Ej. Gana 1 punto
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Valor de 1 Punto al canjear (L.):
                    </label>
                    <input
                      type="number"
                      min="0.1"
                      step="any"
                      value={cfgLempirasPerPoint}
                      onChange={(e) => setCfgLempirasPerPoint(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-emerald-700"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Ej. 1 Punto = L. 5.00 de descuento
                    </span>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Mínimo para canjear (Pts):
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={cfgMinRedeem}
                      onChange={(e) => setCfgMinRedeem(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-slate-900"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      Ej. A partir de 5 puntos
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Bono de Bienvenida al inscribir nuevo cliente (Pts):
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={cfgWelcomeBonus}
                    onChange={(e) => setCfgWelcomeBonus(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-slate-900"
                  />
                </div>

                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 text-[11px]">
                  <strong>Resumen de equivalencia:</strong> Si un cliente compra{' '}
                  <strong>L. {(parseFloat(cfgAmountPerPoint) || 100) * 5}</strong>, ganará{' '}
                  <strong>{(parseInt(cfgPointsPerStep, 10) || 1) * 5} puntos</strong>, equivalentes a{' '}
                  <strong>
                    L.{' '}
                    {(
                      (parseInt(cfgPointsPerStep, 10) || 1) *
                      5 *
                      (parseFloat(cfgLempirasPerPoint) || 5)
                    ).toFixed(2)}
                  </strong>{' '}
                  de descuento para su próxima compra.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowLoyaltyConfigModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black cursor-pointer"
                  >
                    Guardar Reglas
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 2: CREAR / EDITAR CLIENTE FRECUENTE */}
        {isLoyaltyCustomerModalOpen && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-amber-400" />
                  <h3 className="font-black text-sm">
                    {editingLoyaltyCustomer
                      ? `Editar Cliente (${editingLoyaltyCustomer.code})`
                      : 'Inscribir Nuevo Cliente Frecuente'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLoyaltyCustomerModalOpen(false)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveLoyaltyCustomer} className="p-5 space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Nombre Completo del Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. María Fernanda López"
                    value={custFormName}
                    onChange={(e) => setCustFormName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-900"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Teléfono / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="Ej. 9876-5432"
                      value={custFormPhone}
                      onChange={(e) => setCustFormPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      RTN / Identidad (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="0801-..."
                      value={custFormRtn}
                      onChange={(e) => setCustFormRtn(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-slate-900"
                    />
                  </div>
                </div>

                {!editingLoyaltyCustomer && (
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      Puntos Iniciales de Bienvenida
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="0"
                      value={custFormInitialPoints}
                      onChange={(e) => setCustFormInitialPoints(e.target.value)}
                      className="w-full px-3 py-2 bg-amber-50 border border-amber-300 rounded-xl font-black text-amber-900"
                    />
                  </div>
                )}

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Notas / Preferencias de Talla o Estilo (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Talla M, prefiere pago por transferencia..."
                    value={custFormNotes}
                    onChange={(e) => setCustFormNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsLoyaltyCustomerModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black cursor-pointer"
                  >
                    {editingLoyaltyCustomer ? 'Guardar Cambios' : 'Crear Tarjeta VIP'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 3: SUMAR BONO O CANJEAR PUNTOS MANUALMENTE */}
        {customerForPointsAdjust && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="w-5 h-5 text-amber-400" />
                  <h3 className="font-black text-sm">
                    Gestionar Puntos — {customerForPointsAdjust.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomerForPointsAdjust(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAdjustCustomerPoints} className="p-5 space-y-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-100 flex items-center justify-between">
                  <span className="font-bold text-slate-700">Saldo Actual del Cliente:</span>
                  <span className="font-black text-base text-amber-700">
                    {customerForPointsAdjust.currentPoints} pts (L.{' '}
                    {(
                      customerForPointsAdjust.currentPoints * loyaltyConfig.lempirasPerPointRedeem
                    ).toFixed(2)}
                    )
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustMode('bonus')}
                    className={`py-2.5 px-3 rounded-xl font-black border cursor-pointer transition-all ${
                      adjustMode === 'bonus'
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    + Acreditar Bono de Puntos
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustMode('redeem')}
                    className={`py-2.5 px-3 rounded-xl font-black border cursor-pointer transition-all ${
                      adjustMode === 'redeem'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    - Canjear / Descontar Puntos
                  </button>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Cantidad de Puntos a {adjustMode === 'bonus' ? 'Sumar' : 'Canjear'}:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={
                      adjustMode === 'redeem' ? customerForPointsAdjust.currentPoints : undefined
                    }
                    required
                    placeholder="Ej. 10"
                    value={adjustPointsInput}
                    onChange={(e) => setAdjustPointsInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-black text-base text-slate-900"
                  />
                  {adjustPointsInput && (
                    <span className="text-[11px] font-bold text-emerald-700 mt-1 block">
                      Equivalente en Lempiras: L.{' '}
                      {(
                        (parseFloat(adjustPointsInput) || 0) * loyaltyConfig.lempirasPerPointRedeem
                      ).toFixed(2)}
                    </span>
                  )}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Motivo / Concepto:
                  </label>
                  <input
                    type="text"
                    placeholder={
                      adjustMode === 'bonus'
                        ? 'Ej. Regalía de cumpleaños / Promoción especial'
                        : 'Ej. Canje de descuento en tienda'
                    }
                    value={adjustReasonInput}
                    onChange={(e) => setAdjustReasonInput(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setCustomerForPointsAdjust(null)}
                    className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 font-bold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black cursor-pointer"
                  >
                    Confirmar Ajuste
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL 4: HISTORIAL DE PUNTOS DEL CLIENTE */}
        {customerForHistoryModal && (
          <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full max-h-[82vh] flex flex-col overflow-hidden">
              <div className="p-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div>
                  <h3 className="font-black text-sm">
                    Historial de Puntos — {customerForHistoryModal.name}
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Código {customerForHistoryModal.code} • Saldo actual:{' '}
                    {customerForHistoryModal.currentPoints} pts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomerForHistoryModal(null)}
                  className="text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-4 overflow-y-auto flex-1 space-y-2">
                {!(customerForHistoryModal.history || []).length ? (
                  <p className="text-center text-xs text-slate-400 py-8">
                    Aún no hay movimientos de puntos registrados para este cliente.
                  </p>
                ) : (
                  (customerForHistoryModal.history || []).map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded font-black text-[10px] ${
                              log.points >= 0
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {log.points >= 0 ? `+${log.points} pts` : `${log.points} pts`}
                          </span>
                          <span className="font-bold text-slate-800">
                            {log.notes ||
                              (log.type === 'earn'
                                ? `Compra ${log.saleNumber || ''}`
                                : 'Canje de puntos')}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {log.dateFormatted}{' '}
                          {log.registeredBy ? `• Por: ${log.registeredBy}` : ''}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-[10px] text-slate-400 block">Saldo</span>
                        <span className="font-black text-slate-900">{log.balanceAfter} pts</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
        </div>
      </div>
    );
  }

  // ==================== RENDER MODE 1: CASH REGISTER / ARQUEO ====================
  if (mode === 'cash-register') {
    const countedNum = parseFloat(countedCashInput) || 0;
    const liveDiff = countedCashInput.trim() !== '' ? countedNum - activeShiftMetrics.expectedCash : 0;

    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container px-3 sm:px-6 lg:px-8 py-3 sm:py-5 pb-32">
        <div className="w-full max-w-[1640px] mx-auto space-y-5">
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
      </div>
    );
  }

  // ==================== RENDER MODE 2: CREDIT ACCOUNTS / CARTERA & COBRADOR DE RUTA ====================
  if (mode === 'credits') {
    const isRoutePanelActive = !canViewCostsAndProfits || adminCreditsViewMode === 'route_panel';

    const aboneModalAnalytics = selectedSaleForAbone
      ? getSaleCreditAnalytics(selectedSaleForAbone)
      : null;
    const simulatedAboneAmt = Math.max(0, parseFloat(aboneAmount) || 0);
    const simulatedNewPaid = aboneModalAnalytics
      ? Math.min(aboneModalAnalytics.totalSale, aboneModalAnalytics.paid + simulatedAboneAmt)
      : 0;
    const simulatedNewBalance = aboneModalAnalytics
      ? Math.max(0, aboneModalAnalytics.totalSale - simulatedNewPaid)
      : 0;
    const simulatedCostRecovered = aboneModalAnalytics
      ? Math.min(aboneModalAnalytics.totalCost, simulatedNewPaid)
      : 0;
    const simulatedCostRemaining = aboneModalAnalytics
      ? Math.max(0, aboneModalAnalytics.totalCost - simulatedNewPaid)
      : 0;
    const simulatedIsCostRecovered = aboneModalAnalytics
      ? aboneModalAnalytics.totalCost > 0
        ? simulatedNewPaid >= aboneModalAnalytics.totalCost - 0.01
        : simulatedNewPaid > 0
      : false;
    const simulatedRealizedProfit = aboneModalAnalytics
      ? Math.max(0, simulatedNewPaid - aboneModalAnalytics.totalCost)
      : 0;

    const controlModalAnalytics = selectedSaleForControl
      ? getSaleCreditAnalytics(selectedSaleForControl)
      : null;

    return (
      <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container px-3 sm:px-6 lg:px-8 py-3 sm:py-5 pb-32">
        <div className="w-full max-w-[1640px] mx-auto space-y-5">
          {/* ==================== TOP HEADER: ADMIN CONTROL BAR OR EXCLUSIVE ROUTE COLLECTOR BANNER ==================== */}
          {isAdminSession ? (
            <div className="bg-slate-900 text-white p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-md flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3">
                <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 font-black text-lg">
                  🛵
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm sm:text-base font-black text-white">
                      Cuentas por Cobrar y Gestión de Cobradores de Ruta
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400/30">
                      {activeRouteCollectors.length} cobrador(es) activo(s)
                    </span>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-300 mt-0.5">
                    Crea deudas de artículos para clientes, asigna el panel exclusivo de Cobrador de Ruta a colaboradores, programa cobros automáticos y recibe alertas en tiempo real.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {onRecordSale && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewDebtFrequency(routeCollectorConfig.defaultPaymentFrequency || 'weekly');
                      setNewDebtNextPaymentDate(
                        calculateNextDateByFrequency(
                          routeCollectorConfig.defaultPaymentFrequency || 'weekly'
                        )
                      );
                      setShowCreateDebtModal(true);
                    }}
                    className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4 shrink-0" />
                    <span>Crear Deuda a Cliente</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setShowAdminCollectorConfigModal(true)}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Settings className="w-4 h-4 shrink-0" />
                  <span>Configurar Cobradores y Reglas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowAdminAlertsModal(true)}
                  className={`px-3 py-2 rounded-xl font-black text-xs flex items-center gap-1.5 cursor-pointer border transition-all whitespace-nowrap ${
                    unreadCollectorAlertsCount > 0
                      ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                >
                  <Bell className="w-4 h-4 shrink-0" />
                  <span>Alertas de Cobradores</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                      unreadCollectorAlertsCount > 0
                        ? 'bg-white text-rose-700'
                        : 'bg-slate-700 text-slate-300'
                    }`}
                  >
                    {unreadCollectorAlertsCount > 0
                      ? `${unreadCollectorAlertsCount} nueva(s)`
                      : routeCollectorAlerts.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setAdminCreditsViewMode(
                      adminCreditsViewMode === 'admin_full' ? 'route_panel' : 'admin_full'
                    )
                  }
                  className={`px-3 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer border whitespace-nowrap ${
                    adminCreditsViewMode === 'route_panel'
                      ? 'bg-teal-500 text-slate-950 border-teal-400 font-black'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                  }`}
                  title="Alternar entre la vista financiera completa del Administrador y el Panel de Cobrador de Ruta"
                >
                  <span>
                    {adminCreditsViewMode === 'route_panel'
                      ? '📊 Volver a Vista Admin'
                      : '🛵 Ver Panel Cobrador'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950 text-white p-4 sm:p-5 rounded-2xl border border-amber-500/30 shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 text-amber-300 flex items-center justify-center shrink-0 text-xl font-black">
                  🛵
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider">
                      Panel Exclusivo • Cobrador de Ruta
                    </span>
                    <span className="text-xs font-bold text-amber-200">
                      Colaborador: {currentUserName}
                    </span>
                  </div>
                  <h2 className="text-sm sm:text-base font-black text-white mt-1">
                    Control de Clientes por Cobrar, Abonos y Alertas de Ruta
                  </h2>
                  <p className="text-[11px] text-slate-300">
                    Registra abonos en ruta, consulta saldos pendientes, programa el siguiente cobro y envía alertas al Administrador.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
                <button
                  type="button"
                  onClick={() => setCreditFilter(creditFilter === 'alerts' ? 'pending' : 'alerts')}
                  className={`flex-1 sm:flex-initial px-3 py-2 rounded-xl font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer border ${
                    creditPortfolioStats.totalAlertsCount > 0
                      ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400'
                      : 'bg-slate-800 text-slate-200 border-slate-700'
                  }`}
                >
                  <Bell className="w-4 h-4 shrink-0" />
                  <span>
                    Cobros para Hoy / Vencidos ({creditPortfolioStats.overdueCount + creditPortfolioStats.dueTodayCount})
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* ==================== UNREAD COLLECTOR ALERTS BANNER FOR ADMIN ==================== */}
          {isAdminSession && unreadCollectorAlertsCount > 0 && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-3.5 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 font-black">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-rose-950">
                    🔔 Tienes {unreadCollectorAlertsCount} alerta(s) nueva(s) enviada(s) por tus Cobradores de Ruta
                  </h3>
                  <p className="text-[11px] text-rose-800 mt-0.5">
                    Última alerta: <strong>{routeCollectorAlerts.find((a) => a.status === 'unread')?.title}</strong> —{' '}
                    {routeCollectorAlerts.find((a) => a.status === 'unread')?.customerName} (por{' '}
                    {routeCollectorAlerts.find((a) => a.status === 'unread')?.collectorName})
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAdminAlertsModal(true)}
                  className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer"
                >
                  Ver Bandeja de Alertas
                </button>
                <button
                  type="button"
                  onClick={handleMarkAllCollectorAlertsReviewed}
                  className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-rose-100 text-rose-800 border border-rose-300 font-bold text-xs cursor-pointer"
                >
                  Marcar leídas
                </button>
              </div>
            </div>
          )}

          {/* ==================== TOP KPI CARDS (ROUTE MODE VS ADMIN FULL MODE) ==================== */}
          {isRoutePanelActive ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-amber-700 block">
                  Saldo por Cobrar en Ruta
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-700 mt-1 block tabular-nums">
                  L. {creditPortfolioStats.totalReceivable.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500">
                  {creditPortfolioStats.pendingAccountsCount} cliente(s) con deuda activa
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-rose-700 block">
                  ¡Toca Cobrar Hoy / Vencidos!
                </span>
                <span className="text-xl sm:text-2xl font-black text-rose-600 mt-1 block tabular-nums">
                  {creditPortfolioStats.overdueCount + creditPortfolioStats.dueTodayCount}
                </span>
                <span className="text-[11px] text-slate-500">
                  {creditPortfolioStats.overdueCount} atrasado(s) · {creditPortfolioStats.dueTodayCount} tocan hoy
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-indigo-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-indigo-700 block">
                  Próximos Cobros Programados
                </span>
                <span className="text-xl sm:text-2xl font-black text-indigo-700 mt-1 block tabular-nums">
                  {creditPortfolioStats.upcomingCount}
                </span>
                <span className="text-[11px] text-slate-500">
                  En los próximos {routeCollectorConfig.upcomingAlertDays} día(s)
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-emerald-700 block">
                  Total Abonos Recibidos
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block tabular-nums">
                  L. {creditPortfolioStats.totalCollectedFromCredits.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500">
                  Pagos acumulados de la cartera
                </span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="bg-white p-4 rounded-2xl border border-amber-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-amber-700 block">
                  Total por Cobrar (Cartera)
                </span>
                <span className="text-xl sm:text-2xl font-black text-amber-700 mt-1 block tabular-nums">
                  L. {creditPortfolioStats.totalReceivable.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500">
                  {creditPortfolioStats.pendingAccountsCount} cuenta(s) activa(s)
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-slate-600 block">
                  Costo por Recuperar
                </span>
                <span className="text-xl sm:text-2xl font-black text-slate-900 mt-1 block tabular-nums">
                  L. {creditPortfolioStats.totalCostRemainingInStreet.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500">
                  {creditPortfolioStats.accountsRecoveringCostCount} cuenta(s) cubriendo costo
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-emerald-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-emerald-700 block">
                  Ganancia por Cobrar (Calle)
                </span>
                <span className="text-xl sm:text-2xl font-black text-emerald-700 mt-1 block tabular-nums">
                  L. {creditPortfolioStats.totalProfitRemainingInStreet.toFixed(2)}
                </span>
                <span className="text-[11px] text-emerald-700 font-semibold">
                  {creditPortfolioStats.accountsInProfitZoneCount} cuenta(s) 100% en Ganancia
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-teal-200 shadow-xs">
                <span className="text-[11px] font-bold uppercase text-teal-700 block">
                  Ganancia Ya Cobrada (Mano)
                </span>
                <span className="text-xl sm:text-2xl font-black text-teal-700 mt-1 block tabular-nums">
                  L. {creditPortfolioStats.totalRealizedProfitInHand.toFixed(2)}
                </span>
                <span className="text-[11px] text-slate-500 tabular-nums">
                  Total abonado: L. {creditPortfolioStats.totalCollectedFromCredits.toFixed(2)}
                </span>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-rose-200 shadow-xs col-span-2 lg:col-span-1">
                <span className="text-[11px] font-bold uppercase text-rose-700 block">
                  Alertas de Cobro de Abono
                </span>
                <span className="text-xl sm:text-2xl font-black text-rose-600 mt-1 block tabular-nums">
                  {creditPortfolioStats.totalAlertsCount}
                </span>
                <span className="text-[11px] text-slate-500">
                  {creditPortfolioStats.overdueCount} vencido(s) · {creditPortfolioStats.dueTodayCount} hoy ·{' '}
                  {creditPortfolioStats.upcomingCount} próx.
                </span>
              </div>
            </div>
          )}

          {/* ==================== CENTRO DE ALERTAS DE RUTA Y AVISOS DE COBRO ==================== */}
          {creditPortfolioStats.alertSales.length > 0 && (
            <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-rose-600 shrink-0" />
                  <div>
                    <h3 className="text-xs sm:text-sm font-black text-slate-900">
                      Alertas de Ruta: Clientes que Toca Cobrar ({creditPortfolioStats.alertSales.length})
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Clientes con fecha de abono vencida, que corresponden cobrar hoy o en los próximos{' '}
                      {routeCollectorConfig.upcomingAlertDays} días
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCreditFilter(creditFilter === 'alerts' ? 'pending' : 'alerts')}
                  className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs cursor-pointer self-start sm:self-auto whitespace-nowrap"
                >
                  {creditFilter === 'alerts' ? 'Ver todas las pendientes' : 'Filtrar solo alertas'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {creditPortfolioStats.alertSales.slice(0, 6).map(({ sale, analytics }) => {
                  const isOverdue = analytics.alertStatus === 'overdue';
                  const isDueToday = analytics.alertStatus === 'due_today';
                  const templateToUse: CreditCollectionNoticeLog['type'] = isOverdue
                    ? 'overdue'
                    : isDueToday
                    ? 'due_today'
                    : 'preventive';

                  return (
                    <div
                      key={`alert_${sale.id}`}
                      className={`p-3 rounded-xl border flex flex-col justify-between gap-2 ${
                        isOverdue
                          ? 'bg-rose-50/60 border-rose-200'
                          : isDueToday
                          ? 'bg-amber-50/70 border-amber-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5 text-[11px] font-bold">
                            <span
                              className={
                                isOverdue
                                  ? 'text-rose-700'
                                  : isDueToday
                                  ? 'text-amber-800'
                                  : 'text-slate-700'
                              }
                            >
                              {isOverdue
                                ? `🚨 Cobro Atrasado (${Math.abs(analytics.daysDiff || 0)}d)`
                                : isDueToday
                                ? '🔔 ¡Toca Cobrar Hoy!'
                                : `📅 Próximo Abono en ${analytics.daysDiff}d`}
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="font-mono text-slate-600">{sale.saleNumber}</span>
                          </div>
                          <p className="text-xs font-black text-slate-900 mt-0.5">
                            {sale.customerName || 'Cliente'}
                          </p>
                          <p className="text-[11px] text-slate-600 tabular-nums">
                            Fecha cobro: <strong>{analytics.effectiveNextDate}</strong>
                            {analytics.controlMeta?.installmentAmount
                              ? ` · Cuota: L. ${analytics.controlMeta.installmentAmount.toFixed(2)}`
                              : ''}
                          </p>
                          {analytics.controlMeta?.customerAddressOrRoute && (
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              📍 {analytics.controlMeta.customerAddressOrRoute}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="text-xs font-black text-slate-900 block tabular-nums">
                            L. {analytics.balanceDue.toFixed(2)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            Abonado: L. {analytics.paid.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => openAboneModalForSale(sale)}
                          className="flex-1 py-1.5 px-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-[11px] cursor-pointer whitespace-nowrap"
                        >
                          💵 Abonar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSaleForQuickSchedule(sale);
                            setQuickScheduleFrequency(
                              analytics.controlMeta?.paymentFrequency ||
                                routeCollectorConfig.defaultPaymentFrequency ||
                                'weekly'
                            );
                            setQuickScheduleDate(
                              calculateNextDateByFrequency(
                                analytics.controlMeta?.paymentFrequency,
                                analytics.effectiveNextDate
                              )
                            );
                            setQuickScheduleNote('');
                          }}
                          className="py-1.5 px-2.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold text-[11px] cursor-pointer whitespace-nowrap"
                          title="Programar o cambiar fecha del siguiente cobro"
                        >
                          📅 Próx. Cobro
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedSaleForCollectorAlert(sale);
                            setCollectorAlertType('customer_absent');
                            setCollectorAlertMessage('');
                            setCollectorAlertNextDate('');
                          }}
                          className="py-1.5 px-2 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-[11px] cursor-pointer"
                          title="Enviar alerta de cobro al Administrador"
                        >
                          📣 Alerta
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendCreditReminderWhatsApp(sale, templateToUse)}
                          className="py-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] flex items-center justify-center cursor-pointer"
                          title="Enviar recordatorio por WhatsApp al cliente"
                        >
                          <WhatsAppIcon className="w-3.5 h-3.5 fill-white shrink-0" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ==================== SEARCH, COLLECTOR FILTER & STATUS FILTER BAR ==================== */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col xl:flex-row items-stretch xl:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Buscar cliente, teléfono, dirección/ruta o factura..."
                  value={creditSearch}
                  onChange={(e) => setCreditSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {isAdminSession && collaboratorUsers.length > 0 && (
                <select
                  value={selectedCollectorFilter}
                  onChange={(e) => setSelectedCollectorFilter(e.target.value)}
                  className="px-3 py-2 bg-amber-50/70 border border-amber-200 rounded-xl text-xs font-bold text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="all">🛵 Todos los Cobradores ({creditSales.length})</option>
                  {collaboratorUsers.map((col) => (
                    <option key={col.id} value={col.username}>
                      🛵 Ruta de: {col.name} (@{col.username})
                    </option>
                  ))}
                  <option value="__unassigned__">Sin cobrador asignado</option>
                </select>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
                <button
                  type="button"
                  onClick={() => setCreditFilter('pending')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-all whitespace-nowrap ${
                    creditFilter === 'pending'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pendientes ({creditPortfolioStats.pendingAccountsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setCreditFilter('alerts')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-all whitespace-nowrap ${
                    creditFilter === 'alerts'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Alertas Cobro ({creditPortfolioStats.totalAlertsCount})
                </button>
                {!isRoutePanelActive && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCreditFilter('profit_zone')}
                      className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-all whitespace-nowrap ${
                        creditFilter === 'profit_zone'
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      En Ganancia ({creditPortfolioStats.accountsInProfitZoneCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreditFilter('recovering_cost')}
                      className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-all whitespace-nowrap ${
                        creditFilter === 'recovering_cost'
                          ? 'bg-slate-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Cubriendo Costo ({creditPortfolioStats.accountsRecoveringCostCount})
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setCreditFilter('paid')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-all whitespace-nowrap ${
                    creditFilter === 'paid'
                      ? 'bg-teal-700 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Pagadas
                </button>
                <button
                  type="button"
                  onClick={() => setCreditFilter('all')}
                  className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer transition-all whitespace-nowrap ${
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
                className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                title="Imprimir o descargar en PDF la Cartera de Cuentas por Cobrar"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span>Imprimir / PDF Ruta</span>
              </button>
            </div>
          </div>

          {/* ==================== CREDIT ACCOUNTS / ROUTE CARDS LIST ==================== */}
          {filteredCreditSales.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
              <Users className="w-12 h-12 mx-auto mb-2 text-slate-300 stroke-1" />
              <p className="font-bold text-slate-700 text-base">
                No hay cuentas por cobrar en esta vista
              </p>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                Para registrar una deuda de un artículo para un cliente, presiona{' '}
                <strong>"Crear Deuda a Cliente"</strong> arriba o selecciona{' '}
                <strong>"Crédito / Fiado"</strong> al facturar en Nueva Venta (POS).
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredCreditSales.map((sale) => {
                const analytics = getSaleCreditAnalytics(sale);
                const {
                  totalSale,
                  totalCost,
                  expectedTotalProfit,
                  paid,
                  balanceDue: bal,
                  isPaid,
                  costRecovered,
                  costRemainingToRecover,
                  isCostRecovered,
                  realizedProfitCollected,
                  remainingProfitToCollect,
                  effectiveNextDate,
                  daysDiff,
                  alertStatus,
                  controlMeta,
                  noticeCount,
                } = analytics;
                const abonos = sale.creditPayments || [];

                // Progress bar proportions relative to totalSale
                const costShareOfSalePct =
                  totalSale > 0 ? Math.min(100, (totalCost / totalSale) * 100) : 0;
                const paidCostBarPct =
                  totalSale > 0
                    ? Math.min(costShareOfSalePct, (costRecovered / totalSale) * 100)
                    : 0;
                const paidProfitBarPct =
                  totalSale > 0
                    ? Math.min(
                        Math.max(0, 100 - costShareOfSalePct),
                        (realizedProfitCollected / totalSale) * 100
                      )
                    : 0;
                const simplePaidPct =
                  totalSale > 0 ? Math.min(100, (paid / totalSale) * 100) : 0;

                const freqLabel =
                  controlMeta?.paymentFrequency === 'weekly'
                    ? 'Semanal (7d)'
                    : controlMeta?.paymentFrequency === 'biweekly'
                    ? 'Quincenal (15d)'
                    : controlMeta?.paymentFrequency === 'monthly'
                    ? 'Mensual (30d)'
                    : controlMeta?.paymentFrequency === 'daily'
                    ? 'Diario (1d)'
                    : 'Personalizado';

                return (
                  <div
                    key={sale.id}
                    className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs flex flex-col justify-between space-y-4 ${
                      isPaid
                        ? 'border-emerald-200'
                        : alertStatus === 'overdue'
                        ? 'border-rose-300 ring-1 ring-rose-200'
                        : alertStatus === 'due_today'
                        ? 'border-amber-400 ring-1 ring-amber-200'
                        : isCostRecovered && !isRoutePanelActive
                        ? 'border-emerald-300'
                        : 'border-amber-200/90'
                    }`}
                  >
                    <div className="space-y-3.5">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-mono font-bold text-slate-800">
                              {sale.saleNumber}
                            </span>
                            <span aria-hidden="true" className="text-slate-300">
                              ·
                            </span>
                            {isRoutePanelActive ? (
                              <span
                                className={`text-[11px] font-black uppercase px-2 py-0.5 rounded-full ${
                                  isPaid
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : alertStatus === 'overdue'
                                    ? 'bg-rose-100 text-rose-800'
                                    : alertStatus === 'due_today'
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {isPaid
                                  ? '✓ Liquidado'
                                  : alertStatus === 'overdue'
                                  ? `🚨 Vencido (${Math.abs(daysDiff || 0)}d)`
                                  : alertStatus === 'due_today'
                                  ? '🔔 ¡Cobrar Hoy!'
                                  : 'Cuenta Activa'}
                              </span>
                            ) : (
                              <span
                                className={`text-[11px] font-black uppercase ${
                                  isPaid
                                    ? 'text-emerald-700'
                                    : isCostRecovered
                                    ? 'text-emerald-700'
                                    : 'text-amber-700'
                                }`}
                              >
                                {isPaid
                                  ? 'Liquidado'
                                  : isCostRecovered
                                  ? 'Costo Cubierto · En Ganancia'
                                  : 'Recuperando Costo'}
                              </span>
                            )}
                            {controlMeta?.assignedCollectorName && (
                              <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[10px] font-bold">
                                🛵 {controlMeta.assignedCollectorName}
                              </span>
                            )}
                          </div>

                          <h3 className="text-base font-black text-slate-900 mt-1 flex items-center gap-1.5">
                            <User className="w-4 h-4 text-amber-600 shrink-0" />
                            <span>{sale.customerName || 'Cliente'}</span>
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                            {sale.customerPhone && (
                              <>
                                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                                  <Phone className="w-3 h-3" />
                                  {sale.customerPhone}
                                </span>
                                <span aria-hidden="true">·</span>
                              </>
                            )}
                            <span>Fecha: {sale.date}</span>
                          </div>
                          {(controlMeta?.customerAddressOrRoute ||
                            (typeof controlMeta?.customerGpsLat === 'number' &&
                              typeof controlMeta?.customerGpsLng === 'number')) && (
                            <div className="mt-1.5 p-2 rounded-xl bg-amber-50/80 border border-amber-200/80 flex flex-wrap items-center justify-between gap-2">
                              <div className="text-xs text-slate-800">
                                <span className="font-bold text-amber-950 flex items-center gap-1">
                                  <MapPin className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                  <span>
                                    {controlMeta?.customerAddressOrRoute ||
                                      controlMeta?.customerGpsFormattedAddress ||
                                      `Coordenadas GPS: ${controlMeta?.customerGpsLat?.toFixed(
                                        5
                                      )}, ${controlMeta?.customerGpsLng?.toFixed(5)}`}
                                  </span>
                                </span>
                                {typeof controlMeta?.customerGpsLat === 'number' &&
                                  typeof controlMeta?.customerGpsLng === 'number' && (
                                    <span className="text-[10px] font-semibold text-emerald-800 block mt-0.5">
                                      🛰️ GPS Exacto: {controlMeta.customerGpsLat.toFixed(5)},{' '}
                                      {controlMeta.customerGpsLng.toFixed(5)}
                                      {controlMeta.customerGpsAccuracy
                                        ? ` (±${controlMeta.customerGpsAccuracy}m)`
                                        : ''}
                                      {controlMeta.customerGpsCapturedBy
                                        ? ` · Por: ${controlMeta.customerGpsCapturedBy}`
                                        : ''}
                                    </span>
                                  )}
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                {typeof controlMeta?.customerGpsLat === 'number' &&
                                  typeof controlMeta?.customerGpsLng === 'number' && (
                                    <a
                                      href={`https://www.google.com/maps/dir/?api=1&destination=${controlMeta.customerGpsLat},${controlMeta.customerGpsLng}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] flex items-center gap-1 shadow-2xs"
                                      title="Abrir navegación GPS en Google Maps hacia el cliente"
                                    >
                                      <Navigation className="w-3 h-3" />
                                      <span>Ir con GPS</span>
                                    </a>
                                  )}
                                <button
                                  type="button"
                                  onClick={() => setSelectedSaleForGpsModal(sale)}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 border border-emerald-300 text-emerald-900 font-bold text-[10px] flex items-center gap-1 cursor-pointer"
                                >
                                  <MapPin className="w-3 h-3 text-emerald-700" />
                                  <span>Ver Mapa / Actualizar GPS</span>
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            Saldo Pendiente
                          </span>
                          <span
                            className={`text-lg sm:text-xl font-black block tabular-nums ${
                              isPaid ? 'text-emerald-600' : 'text-amber-700'
                            }`}
                          >
                            L. {bal.toFixed(2)}
                          </span>
                          <span className="text-[11px] text-slate-500 block tabular-nums">
                            Total: L. {totalSale.toFixed(2)} · Abonado: L. {paid.toFixed(2)}
                          </span>
                        </div>
                      </div>

                      {/* ==================== ROUTE COLLECTOR PROGRESS SUMMARY OR ADMIN COST VS PROFIT ==================== */}
                      {isRoutePanelActive ? (
                        <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                          <div className="grid grid-cols-3 gap-2 text-center bg-white rounded-lg p-2 border border-amber-200/60 text-[11px]">
                            <div>
                              <span className="text-slate-500 block">Total Deuda</span>
                              <span className="font-black text-slate-900 tabular-nums">
                                L. {totalSale.toFixed(2)}
                              </span>
                            </div>
                            <div className="border-x border-slate-100">
                              <span className="text-emerald-700 font-semibold block">
                                Total Abonado
                              </span>
                              <span className="font-black text-emerald-700 tabular-nums">
                                L. {paid.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-amber-800 font-semibold block">
                                Saldo a Cobrar
                              </span>
                              <span className="font-black text-amber-800 tabular-nums">
                                L. {bal.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 tabular-nums">
                              <span>Avance de pago del cliente ({simplePaidPct.toFixed(0)}%)</span>
                              {controlMeta?.installmentAmount && controlMeta.installmentAmount > 0 ? (
                                <span className="text-amber-900 font-black">
                                  Cuota acordada: L. {controlMeta.installmentAmount.toFixed(2)}
                                </span>
                              ) : null}
                            </div>
                            <div className="h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                              <div
                                style={{ width: `${simplePaidPct}%` }}
                                className="h-full bg-emerald-600 transition-all duration-200"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div
                          className={`p-3 rounded-xl border space-y-2.5 ${
                            isCostRecovered
                              ? 'bg-emerald-50/70 border-emerald-200'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5">
                              <TrendingUp
                                className={`w-4 h-4 shrink-0 ${
                                  isCostRecovered ? 'text-emerald-700' : 'text-slate-700'
                                }`}
                              />
                              <span className="text-xs font-black text-slate-900">
                                Control de Precio Costo vs. Ganancia
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => openControlModalForSale(sale)}
                              className="text-[11px] font-bold text-slate-700 hover:text-slate-900 underline flex items-center gap-1 cursor-pointer"
                              title="Editar el Precio Costo, Cobrador de Ruta y Fecha de este artículo/cuenta"
                            >
                              <Pencil className="w-3 h-3" />
                              <span>Configurar Cuenta</span>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2 text-center bg-white/90 rounded-lg p-2 border border-slate-200/80 text-[11px]">
                            <div>
                              <span className="text-slate-500 block">Precio Venta</span>
                              <span className="font-black text-slate-900 tabular-nums">
                                L. {totalSale.toFixed(2)}
                              </span>
                            </div>
                            <div className="border-x border-slate-100">
                              <span className="text-slate-500 block">Precio Costo</span>
                              <span className="font-black text-slate-800 tabular-nums">
                                L. {totalCost.toFixed(2)}
                              </span>
                            </div>
                            <div>
                              <span className="text-emerald-700 font-semibold block">
                                Ganancia Total
                              </span>
                              <span className="font-black text-emerald-700 tabular-nums">
                                L. {expectedTotalProfit.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="flex items-center justify-between text-[10px] font-bold text-slate-600 tabular-nums">
                              <span>
                                Costo cubierto: L. {costRecovered.toFixed(2)} / L.{' '}
                                {totalCost.toFixed(2)}
                              </span>
                              <span className="text-emerald-700">
                                Ganancia cobrada: L. {realizedProfitCollected.toFixed(2)} / L.{' '}
                                {expectedTotalProfit.toFixed(2)}
                              </span>
                            </div>
                            <div className="relative h-2.5 w-full bg-slate-200 rounded-full overflow-hidden flex">
                              <div
                                style={{ width: `${paidCostBarPct}%` }}
                                className="h-full bg-amber-500 transition-all duration-200"
                              />
                              <div
                                style={{ width: `${paidProfitBarPct}%` }}
                                className="h-full bg-emerald-600 transition-all duration-200"
                              />
                              {costShareOfSalePct > 0 && costShareOfSalePct < 100 && (
                                <div
                                  style={{ left: `${costShareOfSalePct}%` }}
                                  className="absolute top-0 bottom-0 w-0.5 bg-slate-900/70"
                                />
                              )}
                            </div>
                          </div>

                          {isPaid ? (
                            <div className="p-2 rounded-lg bg-emerald-100/80 border border-emerald-200 text-emerald-950 text-xs flex items-center justify-between gap-2">
                              <span className="font-bold">
                                Cuenta 100% Liquidada — Costo (L. {totalCost.toFixed(2)}) y Ganancia
                                Total cobrados:
                              </span>
                              <span className="font-black text-emerald-800 tabular-nums shrink-0">
                                + L. {expectedTotalProfit.toFixed(2)}
                              </span>
                            </div>
                          ) : isCostRecovered ? (
                            <div className="p-2.5 rounded-lg bg-emerald-600 text-white text-xs space-y-1 shadow-2xs">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-black uppercase tracking-tight">
                                  ✓ ¡Precio Costo (L. {totalCost.toFixed(2)}) 100% Recuperado!
                                </span>
                                <span className="font-mono font-black text-emerald-100 tabular-nums shrink-0">
                                  Ganancia Pura
                                </span>
                              </div>
                              <p className="text-[11px] text-emerald-50 leading-snug">
                                El cliente ya abonó <strong>L. {paid.toFixed(2)}</strong>. Todo lo
                                que queda de abonar (
                                <strong className="underline">
                                  L. {remainingProfitToCollect.toFixed(2)}
                                </strong>
                                ) es <strong>100% GANANCIA</strong>.
                              </p>
                            </div>
                          ) : (
                            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200/80 text-amber-950 text-[11px] leading-snug">
                              <span className="font-bold">Etapa 1 (Recuperando Precio Costo):</span>{' '}
                              Faltan{' '}
                              <strong className="font-black tabular-nums">
                                L. {costRemainingToRecover.toFixed(2)}
                              </strong>{' '}
                              de abono para cubrir el Costo (L. {totalCost.toFixed(2)}).
                            </div>
                          )}
                        </div>
                      )}

                      {/* ==================== CONTROL DE PRÓXIMO COBRO, FRECUENCIA Y ALERTAS ==================== */}
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <Bell
                              className={`w-3.5 h-3.5 shrink-0 ${
                                alertStatus === 'overdue'
                                  ? 'text-rose-600'
                                  : alertStatus === 'due_today'
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                              }`}
                            />
                            <span className="font-black text-slate-900">
                              Programación de Cobro y Alertas
                            </span>
                          </div>

                          {!isPaid && (
                            <span
                              className={`text-[11px] font-bold ${
                                alertStatus === 'overdue'
                                  ? 'text-rose-600'
                                  : alertStatus === 'due_today'
                                  ? 'text-amber-700'
                                  : alertStatus === 'upcoming'
                                  ? 'text-amber-600'
                                  : 'text-slate-600'
                              }`}
                            >
                              {alertStatus === 'overdue'
                                ? `🚨 Cobro Atrasado (${Math.abs(daysDiff || 0)} día(s))`
                                : alertStatus === 'due_today'
                                ? '🔔 ¡Hoy Toca Cobrar Abono!'
                                : alertStatus === 'upcoming'
                                ? `📅 Próximo abono en ${daysDiff} día(s)`
                                : effectiveNextDate
                                ? `Programado: ${effectiveNextDate}`
                                : 'Sin fecha de próximo abono'}
                            </span>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600">
                          <div>
                            <span>
                              Siguiente Cobro:{' '}
                              <strong className="text-slate-900">
                                {effectiveNextDate || 'No asignado'}
                              </strong>
                            </span>
                            <span aria-hidden="true" className="mx-1.5 text-slate-300">
                              ·
                            </span>
                            <span>Frecuencia: {freqLabel}</span>
                            {controlMeta?.installmentAmount && controlMeta.installmentAmount > 0 && (
                              <>
                                <span aria-hidden="true" className="mx-1.5 text-slate-300">
                                  ·
                                </span>
                                <span className="font-bold text-slate-900 tabular-nums">
                                  Cuota: L. {controlMeta.installmentAmount.toFixed(2)}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="text-slate-500">
                            {noticeCount > 0 ? (
                              <span>
                                Avisos: <strong className="text-slate-800">{noticeCount}</strong>
                              </span>
                            ) : (
                              <span>0 avisos</span>
                            )}
                          </div>
                        </div>

                        {controlMeta?.collectionNotes && (
                          <p className="text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80">
                            📝 <strong>Nota de cobro:</strong> {controlMeta.collectionNotes}
                          </p>
                        )}

                        {!isPaid && (
                          <div className="flex flex-wrap items-center gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSaleForQuickSchedule(sale);
                                setQuickScheduleFrequency(
                                  controlMeta?.paymentFrequency ||
                                    routeCollectorConfig.defaultPaymentFrequency ||
                                    'weekly'
                                );
                                setQuickScheduleDate(
                                  calculateNextDateByFrequency(
                                    controlMeta?.paymentFrequency,
                                    effectiveNextDate
                                  )
                                );
                                setQuickScheduleNote('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-amber-50 border border-amber-300 text-amber-950 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <Calendar className="w-3.5 h-3.5 text-amber-600" />
                              <span>Programar Siguiente Cobro</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setSelectedSaleForGpsModal(sale)}
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
                              title="Capturar la dirección exacta del cliente estando en el lugar usando el GPS del teléfono"
                            >
                              <MapPin className="w-3.5 h-3.5" />
                              <span>
                                {typeof controlMeta?.customerGpsLat === 'number'
                                  ? '📍 Actualizar GPS Cliente'
                                  : '📍 Agregar Dirección con GPS'}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setSelectedSaleForCollectorAlert(sale);
                                setCollectorAlertType('customer_absent');
                                setCollectorAlertMessage('');
                                setCollectorAlertNextDate('');
                              }}
                              className="px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <Bell className="w-3.5 h-3.5 text-rose-600" />
                              <span>Enviar Alerta al Admin</span>
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleSendCreditReminderWhatsApp(
                                  sale,
                                  alertStatus === 'overdue'
                                    ? 'overdue'
                                    : alertStatus === 'due_today'
                                    ? 'due_today'
                                    : 'preventive'
                                )
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5 text-emerald-700" />
                              <span>
                                {alertStatus === 'overdue'
                                  ? 'WhatsApp Atraso'
                                  : alertStatus === 'due_today'
                                  ? 'WhatsApp Toca Hoy'
                                  : 'Recordatorio'}
                              </span>
                            </button>

                            {isAdminSession && (
                              <button
                                type="button"
                                onClick={() => openControlModalForSale(sale)}
                                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer"
                              >
                                <Settings className="w-3.5 h-3.5 text-slate-500" />
                                <span>Configurar / Asignar</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Items summary */}
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Artículo(s) en Deuda:
                        </span>
                        {(sale.items || []).map((it, idx) => (
                          <div
                            key={idx}
                            className="flex justify-between text-slate-700 tabular-nums"
                          >
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
                            Historial de Abonos Recibidos ({abonos.length})
                          </p>
                          <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                            {abonos.map((cp) => (
                              <div
                                key={cp.id}
                                className="flex items-center justify-between text-[11px] bg-emerald-50/60 border border-emerald-100 px-2.5 py-1 rounded-lg tabular-nums"
                              >
                                <span className="text-slate-600">
                                  {cp.date} (
                                  {cp.paymentMethod === 'cash'
                                    ? 'Efectivo'
                                    : cp.paymentMethod === 'transfer'
                                    ? 'Transf.'
                                    : 'Tarjeta'}
                                  {cp.receivedBy ? ` · ${cp.receivedBy}` : ''})
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
                    <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => openAboneModalForSale(sale)}
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95 col-span-2 sm:col-span-1"
                        >
                          <DollarSign className="w-4 h-4 shrink-0" />
                          <span>Registrar Abono</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => handleSendCreditReminderWhatsApp(sale, 'statement')}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      >
                        <WhatsAppIcon className="w-4 h-4 fill-white shrink-0" />
                        <span>WhatsApp</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setCreditSaleForPrintModal(sale)}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                        title="Imprimir o descargar en PDF el Estado de Cuenta del cliente"
                      >
                        <Printer className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Estado Cuenta</span>
                      </button>

                      {isStoreCreditContractEnabled(storeSettings) && (
                        <button
                          type="button"
                          onClick={() => setSelectedSaleForContract(sale)}
                          className="min-h-[42px] px-3 py-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                          title="Ver, editar, imprimir o enviar el Contrato de Arrendamiento con Reserva de Dominio"
                        >
                          <FileText className="w-4 h-4 text-amber-700 shrink-0" />
                          <span>Contrato de Crédito</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onViewSaleTicket(sale)}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                        title="Ver Factura Original"
                      >
                        <Receipt className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>Ver Factura</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ==================== MODAL 1: REGISTRAR ABONO + PROGRAMACIÓN AUTOMÁTICA DE SIGUIENTE COBRO ==================== */}
          {selectedSaleForAbone && aboneModalAnalytics && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[92vh] flex flex-col">
                <div className="px-5 py-4 bg-amber-600 text-white flex items-center justify-between shrink-0">
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

                <form
                  onSubmit={handleSubmitCreditAbone}
                  className="p-5 space-y-4 overflow-y-auto"
                >
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-bold text-amber-950 block">
                        Saldo Pendiente Actual:
                      </span>
                      <span className="text-[11px] text-amber-800 tabular-nums">
                        Total Deuda: L. {aboneModalAnalytics.totalSale.toFixed(2)} · Abonado: L.{' '}
                        {aboneModalAnalytics.paid.toFixed(2)}
                      </span>
                    </div>
                    <span className="text-lg font-black text-amber-800 tabular-nums">
                      L. {aboneModalAnalytics.balanceDue.toFixed(2)}
                    </span>
                  </div>

                  {/* Quick GPS capture option while collecting abono at customer's location */}
                  <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-2 text-xs">
                    <div className="text-[11px] text-emerald-950">
                      <span className="font-black block">
                        📍 ¿Estás cobrando en el lugar del cliente?
                      </span>
                      <span className="text-emerald-800">
                        {aboneModalAnalytics.controlMeta?.customerAddressOrRoute ||
                          'Puedes guardar la dirección exacta con GPS desde aquí.'}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedSaleForGpsModal(selectedSaleForAbone)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>Capturar GPS</span>
                    </button>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        Monto del Abono (L.)
                      </label>
                      <div className="flex items-center gap-2">
                        {aboneModalAnalytics.controlMeta?.installmentAmount &&
                          aboneModalAnalytics.controlMeta.installmentAmount <=
                            aboneModalAnalytics.balanceDue && (
                            <button
                              type="button"
                              onClick={() =>
                                setAboneAmount(
                                  aboneModalAnalytics.controlMeta!.installmentAmount!.toFixed(2)
                                )
                              }
                              className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                            >
                              Usar cuota (L.{' '}
                              {aboneModalAnalytics.controlMeta.installmentAmount.toFixed(2)})
                            </button>
                          )}
                        {canViewCostsAndProfits &&
                          !aboneModalAnalytics.isCostRecovered &&
                          aboneModalAnalytics.costRemainingToRecover <=
                            aboneModalAnalytics.balanceDue && (
                            <button
                              type="button"
                              onClick={() =>
                                setAboneAmount(
                                  aboneModalAnalytics.costRemainingToRecover.toFixed(2)
                                )
                              }
                              className="text-[11px] font-bold text-slate-700 hover:underline cursor-pointer"
                            >
                              Cubrir costo faltante (L.{' '}
                              {aboneModalAnalytics.costRemainingToRecover.toFixed(2)})
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() =>
                            setAboneAmount(aboneModalAnalytics.balanceDue.toFixed(2))
                          }
                          className="text-[11px] font-bold text-amber-700 hover:underline cursor-pointer"
                        >
                          Liquidar todo
                        </button>
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={aboneAmount}
                      onChange={(e) => setAboneAmount(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-base font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500 tabular-nums"
                    />
                  </div>

                  {/* Balance Projection */}
                  <div className="p-3 rounded-xl border bg-slate-50 border-slate-200 text-slate-800 text-xs space-y-1.5">
                    <div className="flex items-center justify-between font-bold">
                      <span>Proyección tras este abono:</span>
                      <span className="tabular-nums text-emerald-700">
                        Total Abonado: L. {simulatedNewPaid.toFixed(2)} / L.{' '}
                        {aboneModalAnalytics.totalSale.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200/60 tabular-nums">
                      <span className="text-slate-600 font-semibold">
                        Nuevo Saldo Pendiente del Cliente:
                      </span>
                      <span className="text-sm font-black text-amber-800">
                        L. {simulatedNewBalance.toFixed(2)}
                      </span>
                    </div>
                    {canViewCostsAndProfits && (
                      <div className="pt-1 border-t border-slate-200/60 text-[11px]">
                        {simulatedIsCostRecovered ? (
                          <span className="font-bold text-emerald-700">
                            ✓ Precio Costo (L. {aboneModalAnalytics.totalCost.toFixed(2)}) cubierto
                            • Ganancia en mano: L. {simulatedRealizedProfit.toFixed(2)}
                          </span>
                        ) : (
                          <span className="text-amber-900">
                            Faltarán <strong>L. {simulatedCostRemaining.toFixed(2)}</strong> para
                            recuperar el Precio Costo.
                          </span>
                        )}
                      </div>
                    )}
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
                          {m === 'cash'
                            ? 'Efectivo'
                            : m === 'transfer'
                            ? 'Transferencia'
                            : 'Tarjeta'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Schedule Next Payment Alert inside Abono Modal (Auto-Calculated + Manual) */}
                  {simulatedNewBalance > 0.01 && (
                    <div className="p-3 rounded-xl bg-amber-50/70 border border-amber-200 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <div>
                          <label className="text-xs font-black text-amber-950 block">
                            📅 Programar Siguiente Cobro (Alerta Automática)
                          </label>
                          <span className="text-[10px] text-amber-800 block">
                            ⚡ La app calculó automáticamente la siguiente fecha según la frecuencia estimada; puedes ajustarla si el cliente pidió otra fecha.
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setAboneNextDate(addDaysToIso(1))}
                          className="px-2 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                        >
                          Mañana (+1d)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAboneNextDate(addDaysToIso(7))}
                          className="px-2 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                        >
                          Semanal (+7d)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAboneNextDate(addDaysToIso(15))}
                          className="px-2 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                        >
                          Quincenal (+15d)
                        </button>
                        <button
                          type="button"
                          onClick={() => setAboneNextDate(addDaysToIso(30))}
                          className="px-2 py-1 rounded-lg bg-white border border-amber-300 font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                        >
                          Mensual (+30d)
                        </button>
                      </div>

                      <input
                        type="date"
                        value={aboneNextDate}
                        onChange={(e) => setAboneNextDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-black text-slate-900"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Nota / Referencia de Ruta (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Abono cobrado en ruta por visita domiciliaria..."
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

          {/* ==================== MODAL 2: CONFIGURAR CUENTA, COBRADOR DE RUTA, ALERTA Y BITÁCORA ==================== */}
          {selectedSaleForControl && controlModalAnalytics && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden max-h-[92vh] flex flex-col">
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-black text-sm sm:text-base">
                      Configuración de Cuenta por Cobrar, Ruta y Alertas
                    </h3>
                    <p className="text-xs text-slate-300">
                      {selectedSaleForControl.customerName} • {selectedSaleForControl.saleNumber} •
                      Venta Total: L. {controlModalAnalytics.totalSale.toFixed(2)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSaleForControl(null)}
                    className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-5">
                  <form onSubmit={handleSaveCreditAccountControl} className="space-y-4">
                    {/* Section A: Assign Route Collector & Customer Route Address */}
                    <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3">
                      <span className="text-xs font-black text-amber-950 block">
                        1. Asignación de Cobrador de Ruta y Dirección del Cliente
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Cobrador de Ruta Responsable
                          </label>
                          <select
                            value={ctrlAssignedCollectorUsername}
                            onChange={(e) => setCtrlAssignedCollectorUsername(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-amber-300 text-xs font-bold text-slate-900"
                          >
                            <option value="">-- Todos / Sin cobrador específico --</option>
                            {collaboratorUsers.map((col) => (
                              <option key={col.id} value={col.username}>
                                🛵 {col.name} (@{col.username})
                                {col.salesPermissions?.isRouteCollector ? ' [Cobrador Activo]' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <label className="block text-[11px] font-bold text-slate-700">
                              Dirección / Zona / Ruta del Cliente
                            </label>
                            <button
                              type="button"
                              disabled={isCapturingInlineGps}
                              onClick={() => handleCaptureInlineGpsForField('control')}
                              className="px-2 py-0.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] flex items-center gap-1 cursor-pointer"
                            >
                              <MapPin className="w-3 h-3" />
                              <span>
                                {isCapturingInlineGps ? 'Obteniendo GPS...' : '📍 Usar mi GPS aquí'}
                              </span>
                            </button>
                          </div>
                          <input
                            type="text"
                            placeholder="Ej. Barrio El Centro, 2 cuadras al sur..."
                            value={ctrlCustomerAddressOrRoute}
                            onChange={(e) => setCtrlCustomerAddressOrRoute(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-white border border-amber-300 text-xs font-semibold text-slate-900"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Section B: Cost & Profit Configuration (Admin only) */}
                    {canViewCostsAndProfits && (
                      <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-black text-slate-900">
                            2. Precio Costo vs. Ganancia de la Cuenta
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setCtrlCustomCost(
                                controlModalAnalytics.calculatedItemsCost.toFixed(2)
                              )
                            }
                            className="text-[11px] font-bold text-emerald-700 hover:underline cursor-pointer"
                          >
                            Usar costo de inventario (L.{' '}
                            {controlModalAnalytics.calculatedItemsCost.toFixed(2)})
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] font-bold text-slate-700 mb-1">
                              Precio Costo Total de la Venta (L.)
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={ctrlCustomCost}
                              onChange={(e) => setCtrlCustomCost(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-black text-slate-900 tabular-nums"
                            />
                          </div>
                          <div className="p-2.5 rounded-xl bg-white border border-emerald-200 flex flex-col justify-center">
                            <span className="text-[10px] font-bold uppercase text-slate-400">
                              Ganancia Total al Liquidar
                            </span>
                            <span className="text-base font-black text-emerald-700 tabular-nums">
                              L.{' '}
                              {Math.max(
                                0,
                                controlModalAnalytics.totalSale - (parseFloat(ctrlCustomCost) || 0)
                              ).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Section C: Payment Alert & Schedule */}
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                      <span className="text-xs font-black text-slate-900 block">
                        3. Programación de Fecha Estimada y Alerta de Próximo Cobro
                      </span>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Fecha Próximo Cobro
                          </label>
                          <input
                            type="date"
                            value={ctrlNextPaymentDate}
                            onChange={(e) => setCtrlNextPaymentDate(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Frecuencia Estimada
                          </label>
                          <select
                            value={ctrlFrequency}
                            onChange={(e) =>
                              setCtrlFrequency(
                                e.target.value as
                                  | 'weekly'
                                  | 'biweekly'
                                  | 'monthly'
                                  | 'daily'
                                  | 'custom'
                              )
                            }
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                          >
                            <option value="daily">Diario (cada día)</option>
                            <option value="weekly">Semanal (cada 7 días)</option>
                            <option value="biweekly">Quincenal (cada 15 días)</option>
                            <option value="monthly">Mensual (cada 30 días)</option>
                            <option value="custom">Personalizado</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-700 mb-1">
                            Cuota Acordada (L.)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            placeholder="Ej. 500.00"
                            value={ctrlInstallmentAmount}
                            onChange={(e) => setCtrlInstallmentAmount(e.target.value)}
                            className="w-full px-2.5 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900 tabular-nums"
                          />
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-slate-500 font-semibold">Programar rápido:</span>
                        <button
                          type="button"
                          onClick={() => setCtrlNextPaymentDate(getLocalTodayIso())}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          Hoy
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCtrlNextPaymentDate(addDaysToIso(7));
                            setCtrlFrequency('weekly');
                          }}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          +7 días (Semanal)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCtrlNextPaymentDate(addDaysToIso(15));
                            setCtrlFrequency('biweekly');
                          }}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          +15 días (Quincenal)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCtrlNextPaymentDate(addDaysToIso(30));
                            setCtrlFrequency('monthly');
                          }}
                          className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                        >
                          +30 días (Mensual)
                        </button>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Acuerdos / Notas de Cobro
                        </label>
                        <input
                          type="text"
                          placeholder="Ej. Paga los sábados al cobrador en ruta..."
                          value={ctrlNotes}
                          onChange={(e) => setCtrlNotes(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={isSavingControl}
                        className="px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs cursor-pointer shadow-sm"
                      >
                        {isSavingControl
                          ? 'Guardando...'
                          : 'Guardar Configuración de Cuenta y Ruta'}
                      </button>
                    </div>
                  </form>

                  {/* Section D: Send & Log Collection Notices */}
                  <div className="border-t border-slate-200 pt-4 space-y-3">
                    <span className="text-xs font-black text-slate-900 block">
                      4. Enviar Aviso de Cobro por WhatsApp o Registrar Visita
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleSendCreditReminderWhatsApp(selectedSaleForControl, 'preventive')
                        }
                        className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-bold text-[11px] text-center cursor-pointer"
                      >
                        Recordatorio Preventivo
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendCreditReminderWhatsApp(selectedSaleForControl, 'due_today')
                        }
                        className="p-2 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-bold text-[11px] text-center cursor-pointer"
                      >
                        Aviso: Hoy Toca Abono
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendCreditReminderWhatsApp(selectedSaleForControl, 'overdue')
                        }
                        className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-900 font-bold text-[11px] text-center cursor-pointer"
                      >
                        Aviso Cobro Vencido
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleSendCreditReminderWhatsApp(selectedSaleForControl, 'statement')
                        }
                        className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-800 font-bold text-[11px] text-center cursor-pointer"
                      >
                        Estado de Cuenta
                      </button>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                      <span className="text-[11px] font-bold text-slate-700 block">
                        Registrar aviso realizado por Llamada o Visita en Ruta:
                      </span>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={manualNoticeChannel}
                          onChange={(e) =>
                            setManualNoticeChannel(e.target.value as 'call' | 'in_person')
                          }
                          className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-700"
                        >
                          <option value="call">Llamada Telefónica</option>
                          <option value="in_person">Visita en Ruta / En Persona</option>
                        </select>
                        <input
                          type="text"
                          placeholder="Ej. Se visitó y confirmó abono para mañana..."
                          value={manualNoticeNote}
                          onChange={(e) => setManualNoticeNote(e.target.value)}
                          className="flex-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs"
                        />
                        <button
                          type="button"
                          onClick={async () => {
                            const note =
                              manualNoticeNote.trim() ||
                              (manualNoticeChannel === 'call'
                                ? 'Aviso de cobro vía llamada telefónica'
                                : 'Visita de cobro en persona');
                            await recordCollectionNoticeLog(
                              selectedSaleForControl,
                              'preventive',
                              manualNoticeChannel,
                              note
                            );
                            setManualNoticeNote('');
                            showToast('Aviso de cobro registrado en la bitácora.', 'success');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer whitespace-nowrap"
                        >
                          Registrar Aviso
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[11px] font-bold uppercase text-slate-400 block">
                        Bitácora de Avisos Enviados ({controlModalAnalytics.notices.length})
                      </span>
                      {controlModalAnalytics.notices.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">
                          Aún no se han registrado avisos de cobro para esta cuenta.
                        </p>
                      ) : (
                        <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1">
                          {controlModalAnalytics.notices.map((ntc) => (
                            <div
                              key={ntc.id}
                              className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px] flex items-start justify-between gap-2"
                            >
                              <div>
                                <span className="font-bold text-slate-800">
                                  {ntc.channel === 'whatsapp'
                                    ? 'WhatsApp'
                                    : ntc.channel === 'call'
                                    ? 'Llamada'
                                    : 'En Persona'}{' '}
                                  — {ntc.note || ntc.notes}
                                </span>
                                <span className="text-slate-400 block">
                                  Por: {ntc.sentBy} · {ntc.date || ntc.dateFormatted}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ==================== MODAL 3: PROGRAMAR SIGUIENTE COBRO RÁPIDO (COBRADOR / ADMIN) ==================== */}
          {selectedSaleForQuickSchedule && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-sm sm:text-base flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-amber-400" />
                      <span>Programar Siguiente Cobro</span>
                    </h3>
                    <p className="text-xs text-slate-300">
                      {selectedSaleForQuickSchedule.customerName} •{' '}
                      {selectedSaleForQuickSchedule.saleNumber}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSaleForQuickSchedule(null)}
                    className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleQuickScheduleNextDate} className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Frecuencia Estimada de Cobro
                    </label>
                    <select
                      value={quickScheduleFrequency}
                      onChange={(e) => {
                        const freq = e.target.value as
                          | 'daily'
                          | 'weekly'
                          | 'biweekly'
                          | 'monthly'
                          | 'custom';
                        setQuickScheduleFrequency(freq);
                        if (freq !== 'custom') {
                          setQuickScheduleDate(calculateNextDateByFrequency(freq));
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-300 text-xs font-bold text-slate-900"
                    >
                      <option value="daily">Diario (+1 día)</option>
                      <option value="weekly">Semanal (+7 días)</option>
                      <option value="biweekly">Quincenal (+15 días)</option>
                      <option value="monthly">Mensual (+30 días)</option>
                      <option value="custom">Fecha personalizada</option>
                    </select>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">
                        Fecha del Próximo Cobro
                      </label>
                      <div className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setQuickScheduleDate(addDaysToIso(1))}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                        >
                          Mañana
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickScheduleDate(addDaysToIso(7))}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                        >
                          +7d
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickScheduleDate(addDaysToIso(15))}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                        >
                          +15d
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuickScheduleDate(addDaysToIso(30))}
                          className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 font-bold text-slate-700 cursor-pointer"
                        >
                          +30d
                        </button>
                      </div>
                    </div>
                    <input
                      type="date"
                      required
                      value={quickScheduleDate}
                      onChange={(e) => setQuickScheduleDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl bg-white border border-amber-300 text-sm font-black text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Motivo / Nota para el Administrador (Opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Ej. Cliente pidió que pasemos el próximo sábado..."
                      value={quickScheduleNote}
                      onChange={(e) => setQuickScheduleNote(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSaleForQuickSchedule(null)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingQuickSchedule}
                      className="flex-1 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-black text-xs cursor-pointer shadow-md"
                    >
                      {isSavingQuickSchedule ? 'Guardando...' : 'Guardar Fecha de Cobro'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ==================== MODAL 4: ENVIAR ALERTA DE COBRADOR AL ADMINISTRADOR ==================== */}
          {selectedSaleForCollectorAlert && (
            <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                <div className="px-5 py-4 bg-rose-600 text-white flex items-center justify-between">
                  <div>
                    <h3 className="font-black text-sm sm:text-base flex items-center gap-1.5">
                      <Bell className="w-4 h-4" />
                      <span>Enviar Alerta al Administrador</span>
                    </h3>
                    <p className="text-xs text-rose-100">
                      Cliente: {selectedSaleForCollectorAlert.customerName} •{' '}
                      {selectedSaleForCollectorAlert.saleNumber}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedSaleForCollectorAlert(null)}
                    className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSendCollectorAlertToAdmin} className="p-5 space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      Selecciona el Tipo de Alerta de Ruta
                    </label>
                    <div className="space-y-1.5">
                      {(
                        [
                          {
                            id: 'customer_absent',
                            label: '🏠 Cliente no se encontraba en domicilio / negocio',
                          },
                          {
                            id: 'promise_to_pay',
                            label: '🤝 Cliente prometió pagar en nueva fecha acordada',
                          },
                          {
                            id: 'rescheduled_date',
                            label: '📅 Solicita reprogramar fecha de cobro',
                          },
                          {
                            id: 'refused_or_issue',
                            label: '🚨 Inconveniente / Negativa de pago (Requiere Admin)',
                          },
                          {
                            id: 'custom_report',
                            label: '📝 Otro reporte o nota para el Administrador',
                          },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setCollectorAlertType(opt.id)}
                          className={`w-full text-left px-3 py-2 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                            collectorAlertType === opt.id
                              ? 'bg-rose-50 border-rose-500 text-rose-950 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-white'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Programar / Actualizar Fecha de Siguiente Cobro (Opcional)
                    </label>
                    <input
                      type="date"
                      value={collectorAlertNextDate}
                      onChange={(e) => setCollectorAlertNextDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Detalle o Mensaje para el Administrador
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Escribe cualquier detalle de la visita o acuerdo con el cliente..."
                      value={collectorAlertMessage}
                      onChange={(e) => setCollectorAlertMessage(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSaleForCollectorAlert(null)}
                      className="flex-1 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isSendingCollectorAlert}
                      className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs cursor-pointer shadow-md"
                    >
                      {isSendingCollectorAlert ? 'Enviando...' : '📣 Enviar Alerta al Admin'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ==================== MODAL 5: PANEL DEL ADMINISTRADOR PARA CONFIGURAR COBRADORES Y REGLAS ==================== */}
          {showAdminCollectorConfigModal && isAdminSession && (
            <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[92vh] flex flex-col">
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-black text-sm sm:text-base flex items-center gap-2">
                      <Settings className="w-4 h-4 text-amber-400" />
                      <span>Panel del Administrador: Configurar Cobradores de Ruta y Reglas</span>
                    </h3>
                    <p className="text-xs text-slate-300">
                      Elige a qué colaborador(es) activar el Panel Exclusivo de Cliente por Cobrar y configura las reglas automáticas.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdminCollectorConfigModal(false)}
                    className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-5">
                  {/* 1. Collaborator Route Collector Selector */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="text-xs sm:text-sm font-black text-slate-900">
                        1. Colaboradores con Panel Exclusivo de Cobrador de Ruta
                      </h4>
                      <p className="text-xs text-slate-500">
                        Activa el interruptor en el colaborador que desees convertir en Cobrador de Ruta. Podrá ver las deudas, registrar abonos, programar cobros y enviarte alertas.
                      </p>
                    </div>

                    {collaboratorUsers.length === 0 ? (
                      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                        No tienes colaboradores creados aún. Ve al módulo <strong>Usuarios</strong> en el menú lateral para crear un colaborador.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {collaboratorUsers.map((collab) => {
                          const isEnabled =
                            Boolean(collab.salesPermissions?.isRouteCollector) ||
                            (routeCollectorConfig.enabledCollectorUsernames || []).includes(
                              collab.username.trim().toLowerCase()
                            );
                          const scope =
                            collab.salesPermissions?.routeCollectorScope === 'assigned'
                              ? 'assigned'
                              : 'all';

                          return (
                            <div
                              key={collab.id}
                              className={`p-3.5 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                                isEnabled
                                  ? 'bg-amber-50/70 border-amber-300'
                                  : 'bg-slate-50 border-slate-200'
                              }`}
                            >
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-slate-900 text-xs sm:text-sm">
                                    {collab.name}
                                  </span>
                                  <span className="font-mono text-xs text-slate-500">
                                    @{collab.username}
                                  </span>
                                  {isEnabled && (
                                    <span className="px-2 py-0.5 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black">
                                      🛵 Cobrador Activo
                                    </span>
                                  )}
                                </div>
                                {isEnabled && (
                                  <div className="flex items-center gap-2 mt-2 text-[11px]">
                                    <span className="text-slate-600 font-semibold">Alcance:</span>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleToggleCollaboratorRouteCollector(collab, true, 'all')
                                      }
                                      className={`px-2 py-0.5 rounded-md font-bold border cursor-pointer ${
                                        scope === 'all'
                                          ? 'bg-slate-900 text-white border-slate-900'
                                          : 'bg-white text-slate-700 border-slate-300'
                                      }`}
                                    >
                                      Ver todas las deudas
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        handleToggleCollaboratorRouteCollector(
                                          collab,
                                          true,
                                          'assigned'
                                        )
                                      }
                                      className={`px-2 py-0.5 rounded-md font-bold border cursor-pointer ${
                                        scope === 'assigned'
                                          ? 'bg-slate-900 text-white border-slate-900'
                                          : 'bg-white text-slate-700 border-slate-300'
                                      }`}
                                    >
                                      Solo deudas asignadas a él
                                    </button>
                                  </div>
                                )}
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleToggleCollaboratorRouteCollector(collab, !isEnabled, scope)
                                }
                                className={`px-3.5 py-2 rounded-xl font-black text-xs cursor-pointer transition-all shrink-0 ${
                                  isEnabled
                                    ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300'
                                    : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                                }`}
                              >
                                {isEnabled
                                  ? 'Quitar Panel de Cobrador'
                                  : '🛵 Activar Panel Cobrador'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* 2. Global Automatic Rules */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <h4 className="text-xs sm:text-sm font-black text-slate-900">
                      2. Reglas Automáticas de Programación de Cobro y Alertas
                    </h4>

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={routeCollectorConfig.autoCalculateNextDateOnAbone}
                        onChange={async (e) => {
                          await onSavePOSFinanceData({
                            ...posFinanceData,
                            routeCollectorConfig: {
                              ...routeCollectorConfig,
                              autoCalculateNextDateOnAbone: e.target.checked,
                            },
                            updatedAt: Date.now(),
                          });
                        }}
                        className="mt-0.5 rounded text-amber-600 w-4 h-4"
                      />
                      <div>
                        <span className="font-bold text-slate-900 block">
                          Programar automáticamente el siguiente cobro según la fecha/frecuencia estimada
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Al registrar un abono, la app calcula y propone automáticamente la siguiente fecha (+1 día Diario, +7 días Semanal, +15 días Quincenal, +30 días Mensual).
                        </span>
                      </div>
                    </label>

                    <label className="flex items-start gap-2.5 cursor-pointer text-xs">
                      <input
                        type="checkbox"
                        checked={routeCollectorConfig.notifyAdminOnEveryAbone}
                        onChange={async (e) => {
                          await onSavePOSFinanceData({
                            ...posFinanceData,
                            routeCollectorConfig: {
                              ...routeCollectorConfig,
                              notifyAdminOnEveryAbone: e.target.checked,
                            },
                            updatedAt: Date.now(),
                          });
                        }}
                        className="mt-0.5 rounded text-amber-600 w-4 h-4"
                      />
                      <div>
                        <span className="font-bold text-slate-900 block">
                          Recibir alerta automática cada vez que el Cobrador registre un Abono o reprograme fecha
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Envía una notificación inmediata a tu Bandeja de Alertas de Administrador.
                        </span>
                      </div>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Frecuencia Predeterminada para Nuevas Deudas
                        </label>
                        <select
                          value={routeCollectorConfig.defaultPaymentFrequency}
                          onChange={async (e) => {
                            await onSavePOSFinanceData({
                              ...posFinanceData,
                              routeCollectorConfig: {
                                ...routeCollectorConfig,
                                defaultPaymentFrequency: e.target.value as
                                  | 'daily'
                                  | 'weekly'
                                  | 'biweekly'
                                  | 'monthly',
                              },
                              updatedAt: Date.now(),
                            });
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                        >
                          <option value="daily">Diario (cada día)</option>
                          <option value="weekly">Semanal (cada 7 días)</option>
                          <option value="biweekly">Quincenal (cada 15 días)</option>
                          <option value="monthly">Mensual (cada 30 días)</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Días de Anticipación para Alerta de Próximo Cobro
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="15"
                          value={routeCollectorConfig.upcomingAlertDays}
                          onChange={async (e) => {
                            const days = Math.max(1, Math.min(15, parseInt(e.target.value, 10) || 3));
                            await onSavePOSFinanceData({
                              ...posFinanceData,
                              routeCollectorConfig: {
                                ...routeCollectorConfig,
                                upcomingAlertDays: days,
                              },
                              updatedAt: Date.now(),
                            });
                          }}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowAdminCollectorConfigModal(false)}
                    className="px-5 py-2 rounded-xl bg-slate-900 text-white font-black text-xs cursor-pointer"
                  >
                    Listo
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ==================== MODAL 6: BANDEJA DE ALERTAS DE COBRADORES DE RUTA (ADMIN) ==================== */}
          {showAdminAlertsModal && isAdminSession && (
            <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden max-h-[92vh] flex flex-col">
                <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-black text-sm sm:text-base flex items-center gap-2">
                      <Bell className="w-4 h-4 text-rose-400" />
                      <span>
                        Bandeja de Alertas de Cobradores de Ruta ({routeCollectorAlerts.length})
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300">
                      Reportes de abonos cobrados, reprogramaciones y alertas enviadas por tus colaboradores.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdminAlertsModal(false)}
                    className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 overflow-y-auto space-y-3 flex-1">
                  {routeCollectorAlerts.length === 0 ? (
                    <div className="p-8 text-center text-slate-400 text-xs">
                      Aún no se han recibido alertas de los cobradores de ruta.
                    </div>
                  ) : (
                    <>
                      {unreadCollectorAlertsCount > 0 && (
                        <div className="flex justify-end">
                          <button
                            type="button"
                            onClick={handleMarkAllCollectorAlertsReviewed}
                            className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer"
                          >
                            ✓ Marcar todas como revisadas ({unreadCollectorAlertsCount})
                          </button>
                        </div>
                      )}
                      {routeCollectorAlerts.map((al) => (
                        <div
                          key={al.id}
                          className={`p-3.5 rounded-xl border space-y-1.5 ${
                            al.status === 'unread'
                              ? 'bg-rose-50/70 border-rose-300'
                              : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <span className="text-xs font-black text-slate-900 block">
                                {al.title}
                              </span>
                              <span className="text-[11px] font-bold text-slate-600">
                                Cliente: <strong>{al.customerName}</strong> ({al.saleNumber}) · Cobrador:{' '}
                                <strong className="text-amber-800">{al.collectorName}</strong>
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 shrink-0">
                              {al.dateFormatted}
                            </span>
                          </div>
                          <p className="text-xs text-slate-700">{al.message}</p>
                          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {al.scheduledNextDate && (
                                <span className="text-[11px] font-bold text-amber-800">
                                  📅 Siguiente cobro: {al.scheduledNextDate}
                                </span>
                              )}
                              {typeof al.gpsLat === 'number' && typeof al.gpsLng === 'number' && (
                                <a
                                  href={`https://www.google.com/maps/dir/?api=1&destination=${al.gpsLat},${al.gpsLng}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] flex items-center gap-1"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Ver Punto GPS en Google Maps</span>
                                </a>
                              )}
                            </div>
                            {al.status === 'unread' ? (
                              <button
                                type="button"
                                onClick={() => handleMarkCollectorAlertReviewed(al.id)}
                                className="px-2.5 py-1 rounded-lg bg-white border border-rose-300 hover:bg-rose-100 text-rose-800 font-bold text-[11px] cursor-pointer"
                              >
                                Marcar como revisada
                              </button>
                            ) : (
                              <span className="text-[10px] font-bold text-emerald-700">
                                ✓ Revisada
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== MODAL 7: CREAR NUEVA DEUDA DE ARTÍCULO PARA CLIENTE ==================== */}
          {showCreateDebtModal && (
            <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden max-h-[92vh] flex flex-col">
                <div className="px-5 py-4 bg-emerald-700 text-white flex items-center justify-between shrink-0">
                  <div>
                    <h3 className="font-black text-sm sm:text-base">
                      Crear Nueva Deuda de Artículo para Cliente
                    </h3>
                    <p className="text-xs text-emerald-100">
                      Registra una cuenta por cobrar, programa su fecha estimada de cobro y asígnala a un Cobrador de Ruta.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreateDebtModal(false)}
                    className="p-1 rounded-lg hover:bg-white/10 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form
                  onSubmit={handleCreateDirectCreditDebt}
                  className="p-5 overflow-y-auto space-y-4"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Nombre del Cliente *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. María Fernanda López"
                        value={newDebtCustomerName}
                        onChange={(e) => setNewDebtCustomerName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Teléfono / WhatsApp
                      </label>
                      <input
                        type="text"
                        placeholder="Ej. 9988-7766"
                        value={newDebtCustomerPhone}
                        onChange={(e) => setNewDebtCustomerPhone(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="block text-xs font-bold text-slate-700">
                        Dirección / Ruta del Cliente (Para el Cobrador)
                      </label>
                      <button
                        type="button"
                        disabled={isCapturingInlineGps}
                        onClick={() => handleCaptureInlineGpsForField('new_debt')}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[11px] flex items-center gap-1 cursor-pointer shadow-2xs"
                      >
                        <MapPin className="w-3.5 h-3.5" />
                        <span>
                          {isCapturingInlineGps
                            ? 'Capturando GPS...'
                            : '📍 Obtener Dirección con GPS Aquí'}
                        </span>
                      </button>
                    </div>
                    <input
                      type="text"
                      placeholder="Ej. Col. Kennedy, bloque 4, casa 12..."
                      value={newDebtCustomerAddress}
                      onChange={(e) => setNewDebtCustomerAddress(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs"
                    />
                    {newDebtGpsCoords && (
                      <p className="text-[11px] font-bold text-emerald-700 mt-1">
                        ✓ Coordenadas GPS listas: {newDebtGpsCoords.lat.toFixed(6)},{' '}
                        {newDebtGpsCoords.lng.toFixed(6)}
                        {newDebtGpsCoords.accuracy ? ` (±${newDebtGpsCoords.accuracy}m)` : ''}
                      </p>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Seleccionar Artículo del Inventario (Opcional)
                      </label>
                      <select
                        value={newDebtProductId}
                        onChange={(e) => {
                          const pid = e.target.value;
                          setNewDebtProductId(pid);
                          const prod = inventory.find((p) => p.id === pid);
                          if (prod) {
                            setNewDebtCustomItemName(prod.name);
                            setNewDebtTotalAmount(
                              String(prod.creditPrice && prod.creditPrice > 0 ? prod.creditPrice : prod.price)
                            );
                          }
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                      >
                        <option value="">-- Elegir artículo o escribir abajo --</option>
                        {inventory.slice(0, 300).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.code}) — Contado: L. {p.price.toFixed(2)}
                            {p.creditPrice ? ` / Crédito: L. ${p.creditPrice.toFixed(2)}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Descripción del Artículo / Concepto de la Deuda *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="Ej. Televisor Smart 50 pulg / Refrigeradora..."
                        value={newDebtCustomItemName}
                        onChange={(e) => setNewDebtCustomItemName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-900"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Valor Total al Crédito (L.) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="1"
                          required
                          placeholder="0.00"
                          value={newDebtTotalAmount}
                          onChange={(e) => setNewDebtTotalAmount(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-amber-400 text-sm font-black text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Prima / Abono Inicial (L.)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0.00"
                          value={newDebtInitialAbono}
                          onChange={(e) => setNewDebtInitialAbono(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Cuota por Cobro (L.)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="Ej. 500.00"
                          value={newDebtInstallmentAmount}
                          onChange={(e) => setNewDebtInstallmentAmount(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-white border border-slate-300 text-sm font-bold text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Frecuencia de Cobro
                      </label>
                      <select
                        value={newDebtFrequency}
                        onChange={(e) => {
                          const f = e.target.value as 'daily' | 'weekly' | 'biweekly' | 'monthly';
                          setNewDebtFrequency(f);
                          setNewDebtNextPaymentDate(calculateNextDateByFrequency(f));
                        }}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                      >
                        <option value="daily">Diario (+1d)</option>
                        <option value="weekly">Semanal (+7d)</option>
                        <option value="biweekly">Quincenal (+15d)</option>
                        <option value="monthly">Mensual (+30d)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Fecha 1er Cobro
                      </label>
                      <input
                        type="date"
                        value={newDebtNextPaymentDate}
                        onChange={(e) => setNewDebtNextPaymentDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        Asignar Cobrador de Ruta
                      </label>
                      <select
                        value={newDebtCollectorUsername}
                        onChange={(e) => setNewDebtCollectorUsername(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-amber-300 bg-amber-50/50 text-xs font-bold text-slate-900"
                      >
                        <option value="">-- Todos / Sin asignar --</option>
                        {collaboratorUsers.map((col) => (
                          <option key={col.id} value={col.username}>
                            🛵 {col.name} (@{col.username})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCreateDebtModal(false)}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingDebt}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer shadow-md"
                    >
                      {isCreatingDebt ? 'Creando Cuenta...' : 'Crear Cuenta por Cobrar'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* ==================== MODAL 8: CAPTURAR DIRECCIÓN Y UBICACIÓN GPS DEL CLIENTE EN SITIO ==================== */}
          {selectedSaleForGpsModal && (
            <CustomerGpsLocationModal
              sale={selectedSaleForGpsModal}
              controlMeta={creditAccountControls[selectedSaleForGpsModal.id]}
              currentUserName={currentUserName}
              onClose={() => setSelectedSaleForGpsModal(null)}
              onSaveGpsAddress={async (payload) => {
                await handleSaveCustomerGpsAddress(selectedSaleForGpsModal, payload);
              }}
              showToast={showToast}
            />
          )}

          {/* Multi-Printer & PDF Modal for Individual Customer Credit Statement */}
          {creditSaleForPrintModal && (
            <PrintFormatModal
              isOpen={Boolean(creditSaleForPrintModal)}
              onClose={() => setCreditSaleForPrintModal(null)}
              title={`Estado de Cuenta — ${creditSaleForPrintModal.customerName || 'Cliente'}`}
              subtitle={`Factura ${creditSaleForPrintModal.saleNumber}`}
              storeSettings={storeSettings}
              buildHtml={(fmt) =>
                buildCreditStatementHtml(creditSaleForPrintModal, storeSettings, fmt)
              }
              onDownloadPdf={() =>
                downloadCreditStatementPdf(creditSaleForPrintModal, storeSettings)
              }
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
            buildHtml={(fmt) =>
              buildCreditPortfolioReportHtml(filteredCreditSales, storeSettings, fmt)
            }
            onDownloadPdf={() =>
              downloadCreditPortfolioReportPdf(filteredCreditSales, storeSettings)
            }
            showToast={showToast}
          />

          {/* Modal for Credit Lease Contract with Retention of Title (Contrato de Arrendamiento con Reserva de Dominio) */}
          {selectedSaleForContract && isStoreCreditContractEnabled(storeSettings) && (
            <CreditContractModal
              sale={
                creditAccountControls[selectedSaleForContract.id]?.creditContract
                  ? {
                      ...selectedSaleForContract,
                      creditContract:
                        creditAccountControls[selectedSaleForContract.id].creditContract,
                    }
                  : selectedSaleForContract
              }
              storeSettings={storeSettings}
              controlMeta={creditAccountControls[selectedSaleForContract.id]}
              inventory={inventory}
              onClose={() => setSelectedSaleForContract(null)}
              onSaveContract={async (updatedContract: CreditContractData) => {
                const existingMeta: CreditAccountControlMeta =
                  creditAccountControls[selectedSaleForContract.id] || {
                    saleId: selectedSaleForContract.id,
                  };
                const nextMeta: CreditAccountControlMeta = {
                  ...existingMeta,
                  saleId: selectedSaleForContract.id,
                  installmentAmount: updatedContract.installmentValue,
                  numberOfInstallments: updatedContract.numberOfInstallments,
                  nextPaymentDate:
                    updatedContract.firstPaymentDate || existingMeta.nextPaymentDate,
                  creditContract: updatedContract,
                };
                await onSavePOSFinanceData({
                  ...posFinanceData,
                  creditAccountControls: {
                    ...creditAccountControls,
                    [selectedSaleForContract.id]: nextMeta,
                  },
                  updatedAt: Date.now(),
                });
                setSelectedSaleForContract((prev) =>
                  prev ? { ...prev, creditContract: updatedContract } : null
                );
                showToast('Contrato de Crédito actualizado y guardado en la cuenta.', 'success');
              }}
            />
          )}
        </div>
      </div>
    );
  }

  // ==================== RENDER MODE 3: OPERATING EXPENSES & NET PROFIT ====================
  return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container px-3 sm:px-6 lg:px-8 py-3 sm:py-5 pb-32">
      <div className="w-full max-w-[1640px] mx-auto space-y-5">
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
    </div>
  );
};
