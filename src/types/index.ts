export interface Product {
  id: string;
  code: string;
  name: string;
  category: string;
  size?: string;
  supplier?: string;
  cost: number;
  price: number;
  stock: number;
  img?: string;
}

export interface Supplier {
  id: string;
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
  date: string;
  timestamp: number;
  match: number;
  missing: number;
  extra: number;
  netImpact: number;
  totalItems: number;
  scope?: string;
}

export type ActiveTab = 'dashboard' | 'inventory' | 'sales' | 'purchases' | 'audit' | 'price-checker' | 'suppliers' | 'settings' | 'catalog';

export interface SaleItem {
  productId: string;
  code: string;
  name: string;
  category?: string;
  size?: string;
  price: number;
  cost?: number;
  quantity: number;
  subtotal: number;
}

export interface SaleRecord {
  id: string;
  saleNumber: string;
  timestamp: number;
  date: string;
  items: SaleItem[];
  totalItems: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'transfer' | 'other';
  amountPaid: number;
  change: number;
  customerName?: string;
  customerPhone?: string;
  customerRtn?: string;
  notes?: string;
  status: 'completed' | 'cancelled';
  cashier?: string;
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
  storeName: string;
  tagline?: string;
  logoUrl?: string;
  phone?: string;
  address?: string;
  accessPassword?: string;
  whatsappOrderPhone?: string;
  catalogWelcomeMsg?: string;
  updatedAt?: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}
