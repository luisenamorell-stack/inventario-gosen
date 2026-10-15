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
}

export type ActiveTab = 'dashboard' | 'inventory' | 'audit' | 'price-checker' | 'suppliers';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
}
