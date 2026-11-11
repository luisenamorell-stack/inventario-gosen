export interface Product {
  id: string;
  companyId?: string;
  code: string;
  name: string;
  category: string;
  size?: string;
  color?: string;
  colors?: string[];
  supplier?: string;
  cost: number;
  price: number;
  discount?: number;
  discountType?: 'fixed' | 'percent';
  discountValue?: number;
  stock: number;
  warehouseStocks?: Record<string, number>;
  img?: string;
  img2?: string;
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
  | 'warehouses'
  | 'sales'
  | 'online-sales'
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
  'online-sales',
  'inventory',
  'warehouses',
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

export interface SaaSBankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountType: string; // 'Ahorro' | 'Cheques' | 'Billetera Móvil'
  holderName: string;
  identidadOrRtn?: string;
}

export interface TenantUsageMetrics {
  companySlug: string;
  productCount: number;
  userCount: number;
  monthlySalesCount: number;
  monthlySalesTotal: number;
  totalSalesCount: number;
  lastSaleTimestamp: number | null;
}

export interface SaaSProviderContractDefaults {
  providerName: string;
  providerBrand: string;
  providerIdentityOrRtn: string;
  providerPhone: string;
  providerEmail: string;
  cityAndCountry: string;
  supportHours: string;
  defaultCustomClauses?: string;
}

export interface SaaSContractData {
  contractNumber: string;
  issueDate: string;
  cityAndCountry: string;
  providerName: string;
  providerBrand: string;
  providerIdentityOrRtn: string;
  providerPhone: string;
  providerEmail: string;
  clientRepresentative: string;
  clientIdentityOrRtn: string;
  clientBusinessName: string;
  clientAddress: string;
  clientPhone: string;
  planModality: 'mensual' | 'anual' | 'vitalicio' | 'prueba';
  agreedPrice: number;
  setupFee: number;
  billingDayOrDate: string;
  graceDays: number;
  supportHours: string;
  customClauses: string;
  status: 'draft' | 'sent' | 'signed';
  signedAt?: string;
  updatedAt: number;
}

export const OFFICIAL_SAAS_DOMAIN = 'https://miapphn.online';

export function getOfficialAppBaseUrl(customDomain?: string): string {
  const configured = (customDomain || '').trim().replace(/\/+$/, '');
  if (configured) {
    return configured.startsWith('http') ? configured : `https://${configured}`;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host.endsWith('.run.app') || host === 'localhost' || host === '127.0.0.1') {
      return OFFICIAL_SAAS_DOMAIN;
    }
    return (window.location.origin + window.location.pathname).replace(/\/+$/, '');
  }
  return OFFICIAL_SAAS_DOMAIN;
}

export interface SaaSGlobalConfig {
  saasAdminPhone: string;
  saasBrandName: string;
  saasLogo?: string;
  customDomain?: string;
  expiryWarningDays: number;
  autoSuspendOverdue?: boolean;
  gracePeriodDays?: number;
  bankAccounts?: SaaSBankAccount[];
  announcements: SaaSAnnouncement[];
  contractDefaults?: SaaSProviderContractDefaults;
  updatedAt: number;
}

export interface SaaSDemoRequest {
  id: string;
  requestCode: string;
  contactName: string;
  businessName: string;
  phone: string;
  email?: string;
  city: string;
  businessType: string;
  planInterest: 'prueba15' | 'emprendedor' | 'comercial' | 'empresarial' | 'anual' | 'vitalicio';
  planLabel: string;
  notes?: string;
  status: 'pending' | 'contacted' | 'demo_created' | 'converted' | 'archived';
  createdTenantSlug?: string;
  createdTenantPassword?: string;
  createdAt: number;
  dateFormatted: string;
  updatedAt: number;
}

export interface CompanyTenant {
  id: string;
  name: string;
  slug: string;
  ownerName: string;
  phone: string;
  email?: string;
  clientRtnOrId?: string;
  plan: 'mensual' | 'anual' | 'vitalicio' | 'prueba';
  price: number;
  nextBillingDate?: string;
  status: 'active' | 'suspended';
  moraReason?: string;
  suspendedAt?: number;
  autoSuspend?: boolean;
  adminPassword: string;
  logoUrl?: string;
  tagline?: string;
  address?: string;
  notes?: string;
  allowedModules?: ActiveTab[];
  enableDeliveryDvolada?: boolean;
  enableOnlineSales?: boolean;
  maxProducts?: number; // 0 or undefined = Ilimitado
  maxUsers?: number; // 0 or undefined = Ilimitado
  paymentHistory?: SubscriptionPaymentRecord[];
  contractData?: SaaSContractData;
  createdAt: number;
  isPrimary?: boolean;
}

export interface CollaboratorSalesPermissions {
  canEditSales?: boolean;
  canCancelSales?: boolean;
  canViewCostsAndProfits?: boolean;
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
  salesPermissions?: CollaboratorSalesPermissions;
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
  salesPermissions?: CollaboratorSalesPermissions;
}

export interface ActivityLogRecord {
  id: string;
  companyId?: string;
  timestamp: number;
  date: string;
  userName: string;
  userRole: UserRole;
  action: string;
  module: 'sales' | 'online-sales' | 'inventory' | 'warehouses' | 'purchases' | 'audit' | 'suppliers' | 'settings' | 'users' | 'catalog';
  details?: string;
}

export interface WarehouseLocation {
  id: string;
  code: string;
  name: string;
  address?: string;
  manager?: string;
  phone?: string;
  isMainSalesFloor?: boolean;
  isActive: boolean;
  createdAt: number;
}

export interface WarehouseTransferItem {
  productId: string;
  code: string;
  name: string;
  category?: string;
  size?: string;
  quantity: number;
  previousStock?: number;
  newStock?: number;
  cost?: number;
  price?: number;
}

export interface WarehouseTransferRecord {
  id: string;
  transferNumber: string;
  companyId?: string;
  movementType?: 'transfer' | 'entry' | 'adjustment';
  fromWarehouseId: string;
  fromWarehouseName: string;
  toWarehouseId: string;
  toWarehouseName: string;
  items: WarehouseTransferItem[];
  totalUnits: number;
  notes?: string;
  createdBy: string;
  receivedBy?: string;
  timestamp: number;
  dateFormatted: string;
}

export interface StoreWarehousesData {
  companyId: string;
  warehouses: WarehouseLocation[];
  transfers: WarehouseTransferRecord[];
  updatedAt: number;
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

export type OnlineSaleChannel =
  | 'tiktok_live'
  | 'tiktok_shop'
  | 'facebook_live'
  | 'instagram'
  | 'whatsapp'
  | 'website';

export type OnlineShippingStatus =
  | 'pending_pack'
  | 'guide_ready'
  | 'shipped'
  | 'delivered'
  | 'returned';

export interface OnlineOrderMeta {
  isOnlineSale: boolean;
  channel: OnlineSaleChannel;
  liveSessionName?: string;
  socialHandle?: string;
  recipientName: string;
  recipientPhone: string;
  departmentCity: string;
  shippingAddress: string;
  carrierName: string;
  trackingNumber?: string;
  shippingChargedToCustomer: number;
  shippingGuideCost: number;
  packagingCost?: number;
  shippingStatus: OnlineShippingStatus;
  codAmountToCollect?: number;
  dispatchedAt?: string;
  deliveredAt?: string;
}

export interface OnlineCustomerProfile {
  id: string;
  name: string;
  socialHandle?: string;
  channel: OnlineSaleChannel;
  phone: string;
  departmentCity: string;
  shippingAddress: string;
  preferredCarrier?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
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
  warehouseId?: string;
  warehouseName?: string;
  onlineOrder?: OnlineOrderMeta;
  cashier?: string;
  cashierRole?: UserRole;
  lastEditedBy?: string;
  lastEditedAt?: string;
  loyaltyCustomerId?: string;
  loyaltyPointsEarned?: number;
  loyaltyPointsRedeemed?: number;
  loyaltyDiscountAmount?: number;
  loyaltyPointsBalanceAfter?: number;
}

export interface LoyaltyTransactionLog {
  id: string;
  timestamp: number;
  dateFormatted: string;
  type: 'earn' | 'redeem' | 'bonus' | 'adjust';
  points: number; // positive for earn/bonus, negative for redeem
  balanceAfter: number;
  saleNumber?: string;
  saleTotal?: number;
  discountApplied?: number;
  notes?: string;
  registeredBy?: string;
}

export interface LoyaltyCustomerProfile {
  id: string;
  code: string; // e.g. VIP-1042
  name: string;
  phone: string;
  rtn?: string;
  email?: string;
  birthday?: string;
  currentPoints: number;
  totalPointsEarned: number;
  totalPointsRedeemed: number;
  totalPurchasesAmount: number;
  purchasesCount: number;
  notes?: string;
  history?: LoyaltyTransactionLog[];
  createdAt: number;
  updatedAt: number;
}

export interface LoyaltyProgramConfig {
  enabled: boolean;
  amountPerPoint: number; // e.g. L. 100 = 1 point
  pointsEarnedPerStep: number; // e.g. 1 point per step
  lempirasPerPointRedeem: number; // e.g. 1 point = L. 5.00 or L. 1.00 discount
  minPointsToRedeem: number; // e.g. 10 points minimum to redeem
  welcomeBonusPoints: number; // e.g. 5 points when registering a new frequent customer
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
  isOnlineChannelExpense?: boolean;
  onlineChannel?: OnlineSaleChannel;
  liveSessionName?: string;
}

export interface CreditCollectionNoticeLog {
  id: string;
  timestamp: number;
  dateFormatted: string;
  date?: string;
  channel: 'whatsapp' | 'call' | 'in_person';
  noticeType: 'preventive' | 'due_today' | 'overdue' | 'statement';
  type?: 'preventive' | 'due_today' | 'overdue' | 'statement';
  sentBy: string;
  notes?: string;
  note?: string;
}

export interface CreditAccountControlMeta {
  saleId: string;
  customTotalCost?: number;
  nextPaymentDate?: string;
  paymentFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'daily' | 'custom';
  installmentAmount?: number;
  collectionNotes?: string;
  lastNoticeAt?: number;
  lastNoticeTimestamp?: number;
  lastNoticeDate?: string;
  lastNoticeType?: string;
  noticeCount?: number;
  notices?: CreditCollectionNoticeLog[];
}

export interface POSFinanceStoreData {
  companyId: string;
  shifts: CashRegisterShift[];
  expenses: StoreExpenseRecord[];
  creditAccountControls?: Record<string, CreditAccountControlMeta>;
  onlineCustomers?: OnlineCustomerProfile[];
  loyaltyConfig?: LoyaltyProgramConfig;
  loyaltyCustomers?: LoyaltyCustomerProfile[];
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
  warehouseId?: string;
  warehouseName?: string;
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

export type PrinterPaperFormat = '80mm' | '58mm' | 'letter' | 'half-letter';

export interface StoreBranchLocation {
  id: string;
  name: string;
  address: string;
  city?: string;
  phone?: string;
  schedule?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  isMain?: boolean;
}

export interface StoreBankAccount {
  id: string;
  bankId?: string;
  bankName: string;
  accountNumber: string;
  accountType: string; // 'Ahorro' | 'Cheques' | 'Billetera Móvil'
  currency?: 'HNL' | 'USD' | string;
  holderName: string;
  holderIdOrRtn?: string;
  customLogoUrl?: string;
  isActive?: boolean;
}

export type InvoiceTemplateStyle = 'classic' | 'modern' | 'minimal' | 'corporate';

export interface InvoiceTemplateConfig {
  templateStyle?: InvoiceTemplateStyle;
  accentColor?: string;
  salesDocumentTitle?: string;
  creditDocumentTitle?: string;
  purchaseDocumentTitle?: string;
  thermalDocumentTitle?: string;
  headerCustomNote?: string;
  issuerLabel?: string;
  defaultIssuerName?: string;
  caiNumber?: string;
  caiRange?: string;
  caiExpiryDate?: string;
  showLogo?: boolean;
  showTagline?: boolean;
  showStoreRtn?: boolean;
  showCustomerRtn?: boolean;
  showCustomerPhone?: boolean;
  showSellerName?: boolean;
  showItemCode?: boolean;
  showItemDiscount?: boolean;
  showAmountInWords?: boolean;
  showQrCode?: boolean;
  showBankAccounts?: boolean;
  showSignatureLines?: boolean;
  signatureLeftLabel?: string;
  signatureRightLabel?: string;
  warrantyTitle?: string;
  warrantyPolicyText?: string;
  footerThankYouTitle?: string;
}

export interface StoreSettings {
  companyId?: string;
  storeName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
  storeRtn?: string;
  defaultPrinterFormat?: PrinterPaperFormat;
  receiptFooterText?: string;
  invoiceTemplate?: InvoiceTemplateConfig;
  accessPassword?: string;
  whatsappOrderPhone?: string;
  catalogWelcomeMsg?: string;
  showLocationsInCatalog?: boolean;
  storeLocations?: StoreBranchLocation[];
  bankAccounts?: StoreBankAccount[];
  catalogAccentColor?: string;
  catalogHeaderBg?: string;
  allowedModules?: ActiveTab[];
  enableDeliveryDvolada?: boolean;
  enableOnlineSales?: boolean;
  maxProducts?: number;
  maxUsers?: number;
  updatedAt?: number;
}

export function getDefaultInvoiceTemplate(
  storeSettings?: StoreSettings | null
): Required<InvoiceTemplateConfig> {
  const defaultAccent = storeSettings?.catalogAccentColor?.trim() || '#047857';
  return {
    templateStyle: 'classic',
    accentColor: defaultAccent,
    salesDocumentTitle: 'FACTURA COMERCIAL DE VENTA',
    creditDocumentTitle: 'FACTURA AL CRÉDITO',
    purchaseDocumentTitle: 'ORDEN DE RECEPCIÓN Y FACTURA DE COMPRA',
    thermalDocumentTitle: 'FACTURA / TICKET',
    headerCustomNote: '',
    issuerLabel: 'Atendido por',
    defaultIssuerName: '',
    caiNumber: '',
    caiRange: '',
    caiExpiryDate: '',
    showLogo: true,
    showTagline: true,
    showStoreRtn: true,
    showCustomerRtn: true,
    showCustomerPhone: true,
    showSellerName: true,
    showItemCode: true,
    showItemDiscount: true,
    showAmountInWords: true,
    showQrCode: true,
    showBankAccounts: false,
    showSignatureLines: true,
    signatureLeftLabel: 'Firma y Sello Autorizado',
    signatureRightLabel: 'Firma Recibido Conforme Cliente',
    warrantyTitle: 'CONDICIONES Y GARANTÍA',
    warrantyPolicyText: '',
    footerThankYouTitle: '¡GRACIAS POR SU COMPRA!',
  };
}

export function getEffectiveInvoiceTemplate(
  storeSettings?: StoreSettings | null
): Required<InvoiceTemplateConfig> {
  const defaults = getDefaultInvoiceTemplate(storeSettings);
  const raw = storeSettings?.invoiceTemplate || {};

  return {
    templateStyle:
      raw.templateStyle === 'modern' ||
      raw.templateStyle === 'minimal' ||
      raw.templateStyle === 'corporate' ||
      raw.templateStyle === 'classic'
        ? raw.templateStyle
        : defaults.templateStyle,
    accentColor: raw.accentColor?.trim() || defaults.accentColor,
    salesDocumentTitle:
      raw.salesDocumentTitle !== undefined
        ? raw.salesDocumentTitle
        : defaults.salesDocumentTitle,
    creditDocumentTitle:
      raw.creditDocumentTitle !== undefined
        ? raw.creditDocumentTitle
        : defaults.creditDocumentTitle,
    purchaseDocumentTitle:
      raw.purchaseDocumentTitle !== undefined
        ? raw.purchaseDocumentTitle
        : defaults.purchaseDocumentTitle,
    thermalDocumentTitle:
      raw.thermalDocumentTitle !== undefined
        ? raw.thermalDocumentTitle
        : defaults.thermalDocumentTitle,
    headerCustomNote:
      raw.headerCustomNote !== undefined ? raw.headerCustomNote : defaults.headerCustomNote,
    issuerLabel: raw.issuerLabel !== undefined ? raw.issuerLabel : defaults.issuerLabel,
    defaultIssuerName:
      raw.defaultIssuerName !== undefined ? raw.defaultIssuerName : defaults.defaultIssuerName,
    caiNumber: raw.caiNumber !== undefined ? raw.caiNumber : defaults.caiNumber,
    caiRange: raw.caiRange !== undefined ? raw.caiRange : defaults.caiRange,
    caiExpiryDate:
      raw.caiExpiryDate !== undefined ? raw.caiExpiryDate : defaults.caiExpiryDate,
    showLogo: raw.showLogo !== undefined ? Boolean(raw.showLogo) : defaults.showLogo,
    showTagline: raw.showTagline !== undefined ? Boolean(raw.showTagline) : defaults.showTagline,
    showStoreRtn:
      raw.showStoreRtn !== undefined ? Boolean(raw.showStoreRtn) : defaults.showStoreRtn,
    showCustomerRtn:
      raw.showCustomerRtn !== undefined ? Boolean(raw.showCustomerRtn) : defaults.showCustomerRtn,
    showCustomerPhone:
      raw.showCustomerPhone !== undefined
        ? Boolean(raw.showCustomerPhone)
        : defaults.showCustomerPhone,
    showSellerName:
      raw.showSellerName !== undefined ? Boolean(raw.showSellerName) : defaults.showSellerName,
    showItemCode:
      raw.showItemCode !== undefined ? Boolean(raw.showItemCode) : defaults.showItemCode,
    showItemDiscount:
      raw.showItemDiscount !== undefined
        ? Boolean(raw.showItemDiscount)
        : defaults.showItemDiscount,
    showAmountInWords:
      raw.showAmountInWords !== undefined
        ? Boolean(raw.showAmountInWords)
        : defaults.showAmountInWords,
    showQrCode: raw.showQrCode !== undefined ? Boolean(raw.showQrCode) : defaults.showQrCode,
    showBankAccounts:
      raw.showBankAccounts !== undefined
        ? Boolean(raw.showBankAccounts)
        : defaults.showBankAccounts,
    showSignatureLines:
      raw.showSignatureLines !== undefined
        ? Boolean(raw.showSignatureLines)
        : defaults.showSignatureLines,
    signatureLeftLabel:
      raw.signatureLeftLabel !== undefined
        ? raw.signatureLeftLabel
        : defaults.signatureLeftLabel,
    signatureRightLabel:
      raw.signatureRightLabel !== undefined
        ? raw.signatureRightLabel
        : defaults.signatureRightLabel,
    warrantyTitle:
      raw.warrantyTitle !== undefined ? raw.warrantyTitle : defaults.warrantyTitle,
    warrantyPolicyText:
      raw.warrantyPolicyText !== undefined ? raw.warrantyPolicyText : defaults.warrantyPolicyText,
    footerThankYouTitle:
      raw.footerThankYouTitle !== undefined
        ? raw.footerThankYouTitle
        : defaults.footerThankYouTitle,
  };
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}


