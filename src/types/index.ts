export interface Product {
  id: string;
  companyId?: string;
  code: string;
  name: string;
  category: string;
  size?: string;
  supplier?: string;
  cost: number;
  price: number;
  discount?: number;
  discountType?: 'fixed' | 'percent';
  discountValue?: number;
  stock: number;
  img?: string;
}

export interface Supplier {
  id: string;
  companyId?: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface AuditSessionItem {
  item: Product;
  expected: number;
  counted: number;
}

export interface GroupedAuditItem {
  name: string;
  category?: string;
  supplier?: string;
  expected: number;
  counted: number;
  codes: string[];
  hasBeenScanned: boolean;
  details: {
    code: string;
    size?: string;
    expected: number;
    counted: number;
    price: number;
    cost: number;
  }[];
}

export interface AuditHistoryRecord {
  id: string;
  companyId?: string;
  date: string;
  timestamp: number;
  match: number;
  missing: number;
  extra: number;
  netImpact: number;
  totalItems: number;
  scope?: string;
}

export type ActiveTab =
  | 'dashboard'
  | 'inventory'
  | 'sales'
  | 'purchases'
  | 'audit'
  | 'price-checker'
  | 'suppliers'
  | 'settings'
  | 'catalog'
  | 'users'
  | 'activity'
  | 'companies';

export const ALL_COMPANY_MODULES: ActiveTab[] = [
  'dashboard',
  'sales',
  'inventory',
  'price-checker',
  'catalog',
  'purchases',
  'audit',
  'suppliers',
  'users',
  'activity',
  'settings',
];

export type UserRole = 'admin' | 'collaborator';

export interface SubscriptionPaymentRecord {
  id: string;
  receiptNumber: string;
  companySlug: string;
  companyName: string;
  amount: number;
  plan: 'mensual' | 'anual' | 'vitalicio' | 'prueba';
  paymentMethod: 'transferencia' | 'efectivo' | 'tarjeta' | 'otro';
  reference?: string;
  periodLabel: string;
  previousBillingDate?: string;
  newBillingDate: string;
  paidAt: number;
  dateFormatted: string;
  notes?: string;
}

export interface SaaSAnnouncement {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'update' | 'promo';
  targetCompanySlug: string; // 'all' or specific company slug
  isActive: boolean;
  createdAt: number;
  author?: string;
}

export interface SaaSGlobalConfig {
  saasAdminPhone: string;
  saasBrandName: string;
  expiryWarningDays: number;
  announcements: SaaSAnnouncement[];
  updatedAt: number;
}

export interface CompanyTenant {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  phone: string;
  email?: string;
  plan: 'mensual' | 'anual' | 'vitalicio' | 'prueba';
  price: number;
  nextBillingDate?: string;
  status: 'active' | 'suspended';
  moraReason?: string;
  suspendedAt?: number;
  adminPassword: string;
  logoUrl?: string;
  tagline?: string;
  address?: string;
  notes?: string;
  allowedModules?: ActiveTab[];
  enableDeliveryDvolada?: boolean;
  maxProducts?: number; // 0 or undefined = Ilimitado
  maxUsers?: number; // 0 or undefined = Ilimitado
  paymentHistory?: SubscriptionPaymentRecord[];
  createdAt: number;
  isPrimary?: boolean;
}

export interface UserAccount {
  id: string;
  companyId?: string;
  name: string;
  username: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  allowedTabs: ActiveTab[];
  createdAt: number;
  lastLoginAt?: number;
}

export interface UserSession {
  userId: string;
  companyId: string;
  companyName?: string;
  isSuperAdmin?: boolean;
  isStandaloneSaaS?: boolean;
  userName: string;
  username: string;
  role: UserRole;
  allowedTabs: ActiveTab[];
}

export interface ActivityLogRecord {
  id: string;
  companyId?: string;
  timestamp: number;
  date: string;
  userName: string;
  userRole: UserRole;
  action: string;
  module: 'sales' | 'inventory' | 'purchases' | 'audit' | 'suppliers' | 'settings' | 'users' | 'catalog';
  details?: string;
}

export interface SaleItem {
  productId: string;
  code: string;
  name: string;
  category?: string;
  size?: string;
  originalPrice?: number;
  unitDiscount?: number;
  price: number;
  cost?: number;
  quantity: number;
  subtotal: number;
}

export interface CreditPaymentAbone {
  id: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  timestamp: number;
  date: string;
  receivedBy: string;
  notes?: string;
}

export interface SaleRecord {
  id: string;
  companyId?: string;
  saleNumber: string;
  timestamp: number;
  date: string;
  items: SaleItem[];
  totalItems: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'credit' | 'other';
  amountPaid: number;
  change: number;
  balanceDue?: number;
  creditStatus?: 'pending' | 'paid';
  creditDueDate?: string;
  creditPayments?: CreditPaymentAbone[];
  customerName?: string;
  customerPhone?: string;
  customerRtn?: string;
  notes?: string;
  status: 'completed' | 'cancelled';
  cashier?: string;
  cashierRole?: UserRole;
}

export interface CashOutMovement {
  id: string;
  amount: number;
  reason: string;
  category?: string;
  timestamp: number;
  dateFormatted: string;
  user: string;
}

export interface CashRegisterShift {
  id: string;
  companyId?: string;
  status: 'open' | 'closed';
  openedAt: number;
  openedDate: string;
  openedBy: string;
  openingCash: number;
  cashMovements: CashOutMovement[];
  closedAt?: number;
  closedDate?: string;
  closedBy?: string;
  cashSalesTotal?: number;
  transferSalesTotal?: number;
  cardSalesTotal?: number;
  creditSalesTotal?: number;
  creditAbonosCashTotal?: number;
  cashOutTotal?: number;
  expectedCashInDrawer?: number;
  countedPhysicalCash?: number;
  difference?: number;
  notes?: string;
}

export type ExpenseCategory =
  | 'Alquiler'
  | 'Energía / Servicios'
  | 'Pago de Personal'
  | 'Bolsas / Empaque'
  | 'Transporte / Envíos'
  | 'Publicidad'
  | 'Mantenimiento'
  | 'Otros';

export interface StoreExpenseRecord {
  id: string;
  companyId?: string;
  date: string;
  timestamp: number;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paymentMethod: 'cash' | 'transfer' | 'card';
  registeredBy: string;
  fromCashDrawer?: boolean;
}

export interface POSFinanceStoreData {
  companyId: string;
  shifts: CashRegisterShift[];
  expenses: StoreExpenseRecord[];
  updatedAt: number;
}

export interface PurchaseItem {
  productId: string;
  code: string;
  name: string;
  category?: string;
  size?: string;
  cost: number;
  salePrice?: number;
  quantity: number;
  subtotal: number;
}

export interface PurchaseInvoice {
  id: string;
  companyId?: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  timestamp: number;
  paymentCondition: 'cash' | 'credit';
  dueDate?: string;
  items: PurchaseItem[];
  totalItems: number;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  notes?: string;
  status: 'completed' | 'cancelled';
  receivedBy?: string;
}

export interface StoreSettings {
  companyId?: string;
  storeName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
  accessPassword?: string;
  whatsappOrderPhone?: string;
  catalogWelcomeMsg?: string;
  allowedModules?: ActiveTab[];
  enableDeliveryDvolada?: boolean;
  maxProducts?: number;
  maxUsers?: number;
  updatedAt?: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}
