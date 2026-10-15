import { Product, Supplier, AuditHistoryRecord } from '../types';

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup1',
    name: 'Textiles HN',
    contact: 'Juan Pérez',
    phone: '+504 9999-0000',
    email: 'ventas@textileshn.com',
    address: 'Zona Industrial, San Pedro Sula'
  },
  {
    id: 'sup2',
    name: 'Dist. Moda',
    contact: 'Ana García',
    phone: '+504 8888-1111',
    email: 'contacto@distmoda.com',
    address: 'Tegucigalpa, Centro'
  },
  {
    id: 'sup3',
    name: 'Calzados Sur',
    contact: 'Luis López',
    phone: '+504 3333-2222',
    email: 'pedidos@calzadossur.com',
    address: 'Choluteca'
  },
  {
    id: 'sup4',
    name: 'Accesorios Import',
    contact: 'María Ruiz',
    phone: '+504 7777-3333',
    email: 'import@accesorios.com',
    address: 'Bodegas Puerto Cortés'
  }
];

export const INITIAL_INVENTORY: Product[] = [
  {
    id: '1',
    code: 'CAMI-01-S',
    name: 'Camiseta Básica Algodón',
    category: 'Ropa',
    size: 'S',
    supplier: 'Textiles HN',
    cost: 120,
    price: 250,
    stock: 5,
    img: ''
  },
  {
    id: '2',
    code: 'CAMI-01-M',
    name: 'Camiseta Básica Algodón',
    category: 'Ropa',
    size: 'M',
    supplier: 'Textiles HN',
    cost: 150,
    price: 350,
    stock: 15,
    img: ''
  },
  {
    id: '3',
    code: 'CAMI-01-L',
    name: 'Camiseta Básica Algodón',
    category: 'Ropa',
    size: 'L',
    supplier: 'Textiles HN',
    cost: 180,
    price: 400,
    stock: 0,
    img: ''
  },
  {
    id: '4',
    code: 'PANT-01',
    name: 'Pantalón Denim Clásico',
    category: 'Ropa',
    size: '32',
    supplier: 'Dist. Moda',
    cost: 450,
    price: 850,
    stock: 5,
    img: ''
  },
  {
    id: '5',
    code: 'ZAP-01',
    name: 'Zapatos Casuales Cuero',
    category: 'Calzado',
    size: '42',
    supplier: 'Calzados Sur',
    cost: 600,
    price: 1200,
    stock: 8,
    img: ''
  },
  {
    id: '6',
    code: 'ZAP-02',
    name: 'Zapatos Casuales Cuero',
    category: 'Calzado',
    size: '40',
    supplier: 'Calzados Sur',
    cost: 600,
    price: 1200,
    stock: 2,
    img: ''
  },
  {
    id: '7',
    code: 'GOR-01',
    name: 'Gorra Deportiva Logo',
    category: 'Accesorios',
    size: 'Única',
    supplier: 'Accesorios Import',
    cost: 100,
    price: 300,
    stock: 0,
    img: ''
  }
];

export const INITIAL_AUDIT_HISTORY: AuditHistoryRecord[] = [];
