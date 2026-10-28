import React, { useState, useEffect } from 'react';
import { Product, Supplier } from '../types';
import {
  Plus,
  Search,
  Box,
  Pencil,
  Trash2,
  X,
  Barcode,
  Sparkles,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  FileSpreadsheet,
  ChevronLeft,
  ChevronRight,
  Tag,
  Percent,
  Check,
  TrendingUp
} from 'lucide-react';

import { ConfirmDialog } from './ConfirmDialog';
import { ImageUploader } from './ImageUploader';
import {
  InventoryMobileCardSkeleton,
  InventoryTableRowsSkeleton,
} from './SkeletonLoaders';
import { BulkStockImportModal, StockUpdateMode } from './BulkStockImportModal';

interface InventoryViewProps {
  inventory: Product[];
  suppliers: Supplier[];
  isLoading?: boolean;
  initialSearchCode?: string;
  maxProducts?: number;
  saasAdminPhone?: string;
  onSaveProduct: (product: Product, oldCode?: string) => void;
  onBulkSaveProducts?: (
    products: Product[],
    newSuppliers: Supplier[],
    summary: { createdCount: number; updatedCount: number; totalUnitsProcessed: number; mode: StockUpdateMode }
  ) => Promise<void>;
  onDeleteProduct: (id: string) => void;
  onOpenSupplierModal: () => void;
  showModalInitially?: boolean;
  onCloseInitialModal?: () => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  inventory,
  suppliers,
  isLoading = false,
  initialSearchCode = '',
  maxProducts = 0,
  onSaveProduct,
  onBulkSaveProducts,
  onDeleteProduct,
  onOpenSupplierModal,
  showModalInitially = false,
  onCloseInitialModal,
  showToast,
}) => {
  const [searchText, setSearchText] = useState(initialSearchCode);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [sortOption, setSortOption] = useState<
    | 'default'
    | 'stock-desc'
    | 'stock-asc'
    | 'price-desc'
    | 'price-asc'
    | 'cost-desc'
    | 'cost-asc'
    | 'profit-desc'
    | 'profit-asc'
    | 'name-asc'
    | 'name-desc'
    | 'code-asc'
    | 'code-desc'
  >('stock-desc');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(showModalInitially);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Deletion confirmation state
  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);

  // Quick Per-Article Discount Modal State
  const [quickDiscountProduct, setQuickDiscountProduct] = useState<Product | null>(null);
  const [quickDiscountType, setQuickDiscountType] = useState<'fixed' | 'percent'>('fixed');
  const [quickDiscountValue, setQuickDiscountValue] = useState<string>('');

  // Form State
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    category: 'Ropa',
    size: '',
    stock: 0,
    supplier: '',
    cost: 0,
    price: 0,
    discountType: 'fixed' as 'fixed' | 'percent',
    discountValue: 0,
    img: '',
  });
  const [isCustomCategoryMode, setIsCustomCategoryMode] = useState<boolean>(false);

  useEffect(() => {
    if (initialSearchCode) {
      setSearchText(initialSearchCode);
    }
  }, [initialSearchCode]);

  useEffect(() => {
    if (showModalInitially) {
      handleOpenCreate();
      if (onCloseInitialModal) onCloseInitialModal();
    }
  }, [showModalInitially]);

  const handleOpenCreate = () => {
    if (maxProducts > 0 && inventory.length >= maxProducts) {
      if (showToast) {
        showToast(
          `Has alcanzado el límite de tu plan (${inventory.length}/${maxProducts} productos). Contacta al Administrador SaaS para ampliar tu plan.`,
          'warning'
        );
      }
      return;
    }
    setEditingProduct(null);
    setFormData({
      code: '',
      name: '',
      category: 'Ropa',
      size: '',
      stock: 0,
      supplier: suppliers.length > 0 ? suppliers[0].name : '',
      cost: 0,
      price: 0,
      discountType: 'fixed',
      discountValue: 0,
      img: '',
    });
    setIsCustomCategoryMode(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    const savedType = product.discountType === 'percent' ? 'percent' : 'fixed';
    const savedVal =
      product.discountValue !== undefined
        ? Number(product.discountValue) || 0
        : Number(product.discount) || 0;
    setFormData({
      code: product.code,
      name: product.name,
      category: product.category || 'Otros',
      size: product.size || '',
      stock: product.stock,
      supplier: product.supplier || '',
      cost: product.cost,
      price: product.price,
      discountType: savedType,
      discountValue: savedVal,
      img: product.img || '',
    });
    setIsCustomCategoryMode(false);
    setIsModalOpen(true);
  };

  const handleOpenQuickDiscount = (product: Product) => {
    setQuickDiscountProduct(product);
    const savedType = product.discountType === 'percent' ? 'percent' : 'fixed';
    const savedVal =
      product.discountValue !== undefined && Number(product.discountValue) > 0
        ? String(product.discountValue)
        : Number(product.discount) > 0
        ? String(product.discount)
        : '';
    setQuickDiscountType(savedType);
    setQuickDiscountValue(savedVal);
  };

  const handleSaveQuickDiscount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickDiscountProduct) return;

    const basePrice = Math.max(0, Number(quickDiscountProduct.price) || 0);
    const rawVal = Math.max(0, parseFloat(quickDiscountValue) || 0);
    const computedDiscount =
      quickDiscountType === 'percent'
        ? Math.min(basePrice, (basePrice * Math.min(100, rawVal)) / 100)
        : Math.min(basePrice, rawVal);

    const updatedItem: Product = {
      ...quickDiscountProduct,
      discount: Number(computedDiscount.toFixed(2)),
      discountType: quickDiscountType,
      discountValue: Number(rawVal.toFixed(2)),
    };

    onSaveProduct(updatedItem, quickDiscountProduct.code);
    if (showToast) {
      if (computedDiscount > 0) {
        showToast(
          `Descuento de L. ${computedDiscount.toFixed(2)} asignado a "${quickDiscountProduct.name}"`,
          'success'
        );
      } else {
        showToast(`Se quitó el descuento de "${quickDiscountProduct.name}"`, 'info');
      }
    }
    setQuickDiscountProduct(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleAutoGenerateCode = () => {
    const prefix = (formData.category || 'PROD').substring(0, 3).toUpperCase();
    const countWithPrefix = inventory.filter((p) => p.code.startsWith(prefix)).length + 1;
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const newCode = `${prefix}-${String(countWithPrefix).padStart(2, '0')}-${randomSuffix}`;
    setFormData((prev) => ({ ...prev, code: newCode }));
  };

  const computedFormDiscount = React.useMemo(() => {
    const basePrice = Math.max(0, Number(formData.price) || 0);
    const rawVal = Math.max(0, Number(formData.discountValue) || 0);
    if (rawVal <= 0 || basePrice <= 0) return 0;
    if (formData.discountType === 'percent') {
      return Math.min(basePrice, (basePrice * Math.min(100, rawVal)) / 100);
    }
    return Math.min(basePrice, rawVal);
  }, [formData.price, formData.discountType, formData.discountValue]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.code.trim()) return;

    const savedItem: Product = {
      id: editingProduct ? editingProduct.id : Date.now().toString(),
      code: formData.code.trim(),
      name: formData.name.trim(),
      category: formData.category,
      size: formData.size.trim(),
      stock: Number(formData.stock) || 0,
      supplier: formData.supplier,
      cost: Number(formData.cost) || 0,
      price: Number(formData.price) || 0,
      discount: Number(computedFormDiscount.toFixed(2)),
      discountType: formData.discountType,
      discountValue: Math.max(0, Number(formData.discountValue) || 0),
      img: formData.img.trim(),
    };

    onSaveProduct(savedItem, editingProduct?.code);
    handleCloseModal();
  };

  // Fast non-blocking search typing with useDeferredValue
  const deferredSearch = React.useDeferredValue(searchText);

  // Pagination State — limits DOM rendering to keep app fast and smooth
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number | 'all'>(35);

  // Reset page to 1 when filters or search change
  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearch, selectedCategory, selectedSupplier, sortOption]);

  // Filter & Sort inventory items (Mayor a menor stock, precio, costo, etc.)
  const filteredInventory = React.useMemo(() => {
    const query = deferredSearch.toLowerCase().trim();
    const filtered = inventory.filter((item) => {
      const matchesSearch =
        !query ||
        item.code.toLowerCase().includes(query) ||
        item.name.toLowerCase().includes(query) ||
        (item.size && item.size.toLowerCase().includes(query));

      const matchesCategory =
        selectedCategory === 'all' || item.category === selectedCategory;

      const matchesSupplier =
        selectedSupplier === 'all' || item.supplier === selectedSupplier;

      return matchesSearch && matchesCategory && matchesSupplier;
    });

    return [...filtered].sort((a, b) => {
      switch (sortOption) {
        case 'stock-desc':
          return (Number(b.stock) || 0) - (Number(a.stock) || 0);
        case 'stock-asc':
          return (Number(a.stock) || 0) - (Number(b.stock) || 0);
        case 'price-desc':
          return (Number(b.price) || 0) - (Number(a.price) || 0);
        case 'price-asc':
          return (Number(a.price) || 0) - (Number(b.price) || 0);
        case 'cost-desc':
          return (Number(b.cost) || 0) - (Number(a.cost) || 0);
        case 'cost-asc':
          return (Number(a.cost) || 0) - (Number(b.cost) || 0);
        case 'profit-desc': {
          const aFinal = Math.max(0, (Number(a.price) || 0) - (Number(a.discount) || 0));
          const bFinal = Math.max(0, (Number(b.price) || 0) - (Number(b.discount) || 0));
          const aProfit = aFinal - (Number(a.cost) || 0);
          const bProfit = bFinal - (Number(b.cost) || 0);
          return bProfit - aProfit;
        }
        case 'profit-asc': {
          const aFinal = Math.max(0, (Number(a.price) || 0) - (Number(a.discount) || 0));
          const bFinal = Math.max(0, (Number(b.price) || 0) - (Number(b.discount) || 0));
          const aProfit = aFinal - (Number(a.cost) || 0);
          const bProfit = bFinal - (Number(b.cost) || 0);
          return aProfit - bProfit;
        }
        case 'name-asc':
          return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
        case 'name-desc':
          return b.name.localeCompare(a.name, 'es', { sensitivity: 'base' });
        case 'code-asc':
          return a.code.localeCompare(b.code, 'es', { sensitivity: 'base' });
        case 'code-desc':
          return b.code.localeCompare(a.code, 'es', { sensitivity: 'base' });
        case 'default':
        default:
          return 0;
      }
    });
  }, [inventory, deferredSearch, selectedCategory, selectedSupplier, sortOption]);

  // Financial & Profit summary for currently filtered inventory
  const inventoryFinancialSummary = React.useMemo(() => {
    let totalCost = 0;
    let totalRetail = 0;
    let totalUnits = 0;
    filteredInventory.forEach((item) => {
      const st = Math.max(0, Number(item.stock) || 0);
      const co = Number(item.cost) || 0;
      const pr = Number(item.price) || 0;
      const disc = Math.min(pr, Math.max(0, Number(item.discount) || 0));
      const finalPrice = Math.max(0, pr - disc);
      totalUnits += st;
      totalCost += st * co;
      totalRetail += st * finalPrice;
    });
    const totalProfit = totalRetail - totalCost;
    const marginPct = totalRetail > 0 ? (totalProfit / totalRetail) * 100 : 0;
    return { totalUnits, totalCost, totalRetail, totalProfit, marginPct };
  }, [filteredInventory]);

  // Paginated subset to render only active page in DOM
  const totalPages = pageSize === 'all' ? 1 : Math.max(1, Math.ceil(filteredInventory.length / pageSize));
  const paginatedInventory = React.useMemo(() => {
    if (pageSize === 'all') return filteredInventory;
    const start = (currentPage - 1) * pageSize;
    return filteredInventory.slice(start, start + pageSize);
  }, [filteredInventory, currentPage, pageSize]);

  // Extract unique categories
  const categories = Array.from(
    new Set(['Ropa', 'Calzado', 'Accesorios', ...inventory.map((i) => i.category)])
  ).filter(Boolean);

  return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container p-3 sm:p-6 space-y-3 sm:space-y-4 pb-20 md:pb-20">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2.5 sm:gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-lg sm:text-2xl font-bold text-slate-800 leading-tight">Catálogo de Productos</h1>
            {maxProducts > 0 && (
              <span
                className={`px-2.5 py-0.5 rounded-lg text-xs font-extrabold border ${
                  inventory.length >= maxProducts
                    ? 'bg-amber-50 text-amber-800 border-amber-300'
                    : 'bg-indigo-50 text-indigo-800 border-indigo-200'
                }`}
              >
                Plan: {inventory.length} / {maxProducts} productos
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-slate-500">Gestiona todos los artículos de la tienda.</p>
        </div>
        <div className="grid grid-cols-2 sm:flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={() => {
              if (maxProducts > 0 && inventory.length >= maxProducts) {
                if (showToast) {
                  showToast(
                    `Has alcanzado el límite de tu plan (${inventory.length}/${maxProducts} productos). Contacta al Administrador SaaS para ampliar tu plan.`,
                    'warning'
                  );
                }
                return;
              }
              setIsBulkImportOpen(true);
            }}
            className="bg-slate-900 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer border border-slate-800 whitespace-nowrap"
            title="Subir stock o catálogo masivamente desde Excel (.xlsx / .csv) o copiando y pegando"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Carga Masiva Excel</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreate}
            className="bg-emerald-600 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Nuevo Artículo</span>
          </button>
        </div>
      </header>

      {/* Compact Profit & Valuation Strip for Filtered Inventory */}
      <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-600">
          <span>
            Costo Stock:{' '}
            <strong className="text-slate-900 font-bold">
              L. {inventoryFinancialSummary.totalCost.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </span>
          <span className="text-slate-300 hidden sm:inline">·</span>
          <span>
            Valor Venta:{' '}
            <strong className="text-slate-900 font-bold">
              L. {inventoryFinancialSummary.totalRetail.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-slate-600">Ganancia Potencial:</span>
          <strong className="text-emerald-700 font-extrabold text-xs sm:text-sm">
            + L. {inventoryFinancialSummary.totalProfit.toLocaleString('es-HN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </strong>
          <span className="text-slate-400 font-medium">
            ({inventoryFinancialSummary.marginPct.toFixed(1)}%)
          </span>
        </div>
      </div>

      {/* Main card table container */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200">
        {/* Search & Filter Bar */}
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col sm:flex-row gap-4">
          <div className="flex flex-1 bg-white rounded-xl border border-slate-200 overflow-hidden focus-within:ring-2 ring-emerald-500/20 focus-within:border-emerald-500 transition-all">
            <span className="p-3 text-slate-400">
              <Search className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Buscar por código, nombre o talla..."
              className="py-2.5 pr-4 outline-none w-full text-sm bg-transparent"
            />
            {searchText && (
              <button
                onClick={() => setSearchText('')}
                className="p-3 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:flex sm:items-center sm:gap-2.5">
            {/* Category filter */}
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm bg-white outline-none cursor-pointer hover:border-slate-300 font-medium text-slate-700 w-full"
            >
              <option value="all">Categorías (Todas)</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>

            {/* Supplier filter */}
            <select
              value={selectedSupplier}
              onChange={(e) => setSelectedSupplier(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm bg-white outline-none cursor-pointer hover:border-slate-300 font-medium text-slate-700 w-full"
            >
              <option value="all">Proveedores (Todos)</option>
              {suppliers.map((sup) => (
                <option key={sup.id} value={sup.name}>
                  {sup.name}
                </option>
              ))}
            </select>

            {/* Sort Order Selector (Mayor a Menor, etc.) */}
            <div className="col-span-2 sm:col-span-1 relative flex items-center">
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                className="border border-slate-200 rounded-xl px-3 sm:px-3.5 py-2.5 text-xs sm:text-sm bg-white outline-none cursor-pointer hover:border-slate-300 font-semibold text-emerald-800 w-full focus:ring-2 focus:ring-emerald-500/20"
                title="Ordenar artículos en el inventario"
              >
                <option value="stock-desc">📦 Stock: Mayor a Menor</option>
                <option value="stock-asc">📦 Stock: Menor a Mayor</option>
                <option value="profit-desc">📈 Ganancia: Mayor a Menor</option>
                <option value="profit-asc">📉 Ganancia: Menor a Mayor</option>
                <option value="price-desc">💰 Precio: Mayor a Menor</option>
                <option value="price-asc">💰 Precio: Menor a Mayor</option>
                <option value="cost-desc">🏷️ Costo: Mayor a Menor</option>
                <option value="cost-asc">🏷️ Costo: Menor a Mayor</option>
                <option value="name-asc">🔤 Nombre: A - Z</option>
                <option value="name-desc">🔤 Nombre: Z - A</option>
                <option value="code-asc">🔢 Código / SKU: A - Z</option>
                <option value="default">📋 Predeterminado</option>
              </select>
            </div>
          </div>
        </div>

        {/* Quick Sort / Active indicator bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-slate-100/70 border-b border-slate-200 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-semibold flex items-center gap-1 mr-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>Ordenar rápido:</span>
            </span>

            <button
              type="button"
              onClick={() => setSortOption((prev) => (prev === 'stock-desc' ? 'stock-asc' : 'stock-desc'))}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                sortOption === 'stock-desc'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : sortOption === 'stock-asc'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>Stock: {sortOption === 'stock-desc' ? 'Mayor a Menor ↓' : sortOption === 'stock-asc' ? 'Menor a Mayor ↑' : 'Mayor a Menor'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSortOption((prev) => (prev === 'price-desc' ? 'price-asc' : 'price-desc'))}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                sortOption === 'price-desc'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : sortOption === 'price-asc'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>Precio: {sortOption === 'price-desc' ? 'Mayor a Menor ↓' : sortOption === 'price-asc' ? 'Menor a Mayor ↑' : 'Mayor a Menor'}</span>
            </button>

            <button
              type="button"
              onClick={() => setSortOption((prev) => (prev === 'profit-desc' ? 'profit-asc' : 'profit-desc'))}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                sortOption === 'profit-desc'
                  ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                  : sortOption === 'profit-asc'
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              <span>Ganancia: {sortOption === 'profit-desc' ? 'Mayor a Menor ↓' : sortOption === 'profit-asc' ? 'Menor a Mayor ↑' : 'Mayor a Menor'}</span>
            </button>
          </div>

          <span className="text-slate-400 font-medium">
            {isLoading ? (
              <span className="inline-block h-4 w-20 animate-pulse bg-gray-200 rounded-md align-middle" />
            ) : (
              `${filteredInventory.length} ${filteredInventory.length === 1 ? 'artículo' : 'artículos'}`
            )}
          </span>
        </div>

        {/* Mobile Product Cards List (< sm) */}
        {isLoading ? (
          <InventoryMobileCardSkeleton count={6} />
        ) : (
          <div className="sm:hidden p-2.5 space-y-2.5">
            {filteredInventory.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Box className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="font-medium text-sm">No se encontraron artículos con los filtros aplicados.</p>
              </div>
            ) : (
              paginatedInventory.map((item) => {
              const stockNumber = Number(item.stock) || 0;
              const stockColor =
                stockNumber <= 0
                  ? 'text-red-700 bg-red-100'
                  : stockNumber <= 3
                  ? 'text-orange-700 bg-orange-100'
                  : 'text-emerald-800 bg-emerald-100';

              return (
                <div
                  key={item.id}
                  className="p-3 bg-white border border-slate-200/90 rounded-xl shadow-2xs space-y-2.5"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                      {item.img ? (
                        <img
                          src={item.img}
                          alt={item.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <Box className="w-6 h-6 text-slate-300" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-900 text-sm leading-snug">
                        {item.name}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[11px] text-slate-500">
                        <span className="font-mono font-bold bg-slate-100 px-1.5 py-0.2 rounded text-slate-700">
                          {item.code}
                        </span>
                        {item.size && (
                          <span className="bg-slate-100 px-1.5 py-0.2 rounded font-medium text-slate-700">
                            Talla: {item.size}
                          </span>
                        )}
                        <span className="text-slate-400">· {item.category}</span>
                      </div>
                      {item.supplier && (
                        <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                          Proveedor: {item.supplier}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block -mb-0.5">
                        Costo: L. {Number(item.cost || 0).toFixed(2)}
                      </span>
                      {(Number(item.discount) || 0) > 0 ? (
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-sm text-emerald-700">
                              L. {Math.max(0, Number(item.price || 0) - Number(item.discount || 0)).toFixed(2)}
                            </span>
                            <span className="text-[10px] line-through text-slate-400">
                              L. {Number(item.price || 0).toFixed(2)}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenQuickDiscount(item)}
                            className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.2 rounded cursor-pointer hover:bg-rose-100"
                          >
                            <Tag className="w-2.5 h-2.5" />
                            <span>Desc: -L. {Number(item.discount).toFixed(2)}</span>
                          </button>
                        </div>
                      ) : (
                        <span className="font-bold text-slate-900 text-sm text-emerald-700">
                          L. {Number(item.price || 0).toFixed(2)}
                        </span>
                      )}
                      {(() => {
                        const finalP = Math.max(0, Number(item.price || 0) - Number(item.discount || 0));
                        const unitProfit = finalP - Number(item.cost || 0);
                        const margin = finalP > 0 ? (unitProfit / finalP) * 100 : 0;
                        return (
                          <div
                            className={`text-[10px] font-bold mt-0.5 ${
                              unitProfit >= 0 ? 'text-teal-700' : 'text-rose-600'
                            }`}
                          >
                            Ganancia: {unitProfit >= 0 ? '+' : ''}L. {unitProfit.toFixed(2)} ({margin.toFixed(0)}%)
                          </div>
                        );
                      })()}
                    </div>

                    <div className="text-center">
                      <span className="text-[10px] text-slate-400 block -mb-0.5">Stock</span>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md font-bold text-xs ${stockColor}`}
                      >
                        {stockNumber} unids
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleOpenQuickDiscount(item)}
                        className={`p-2 rounded-lg transition-colors cursor-pointer ${
                          (Number(item.discount) || 0) > 0
                            ? 'text-rose-700 bg-rose-100 hover:bg-rose-200'
                            : 'text-slate-600 hover:text-amber-700 bg-slate-100 hover:bg-amber-50'
                        }`}
                        title="Asignar o cambiar descuento del artículo"
                      >
                        <Percent className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(item)}
                        className="p-2 text-slate-600 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                        title="Editar Artículo"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setItemToDelete(item)}
                        className="p-2 text-slate-400 hover:text-rose-600 bg-slate-100 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar Artículo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        )}

        {/* Desktop / Tablet Table (>= sm) */}
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm">
              <tr className="text-slate-500 text-xs uppercase tracking-wider border-b border-slate-200">
                <th
                  onClick={() =>
                    setSortOption((prev) => (prev === 'name-asc' ? 'name-desc' : 'name-asc'))
                  }
                  className="p-4 font-semibold cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar por nombre alfabéticamente"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Imagen / Info</span>
                    {sortOption === 'name-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : sortOption === 'name-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() =>
                    setSortOption((prev) => (prev === 'code-asc' ? 'code-desc' : 'code-asc'))
                  }
                  className="p-4 font-semibold cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar por código SKU"
                >
                  <div className="flex items-center gap-1.5">
                    <span>Código / SKU</span>
                    {sortOption === 'code-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : sortOption === 'code-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </th>

                <th className="p-4 font-semibold">Proveedor</th>

                <th
                  onClick={() =>
                    setSortOption((prev) =>
                      prev === 'price-desc' ? 'price-asc' : 'price-desc'
                    )
                  }
                  className="p-4 font-semibold text-right cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar por precio (Mayor a menor / Menor a mayor)"
                >
                  <div className="flex items-center justify-end gap-1.5">
                    <span>Costo / Precio</span>
                    {sortOption === 'price-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : sortOption === 'price-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </th>

                <th
                  onClick={() =>
                    setSortOption((prev) =>
                      prev === 'stock-desc' ? 'stock-asc' : 'stock-desc'
                    )
                  }
                  className="p-4 font-semibold text-center cursor-pointer hover:bg-slate-100 transition-colors select-none"
                  title="Ordenar por stock (Mayor a menor / Menor a mayor)"
                >
                  <div className="flex items-center justify-center gap-1.5">
                    <span>Stock</span>
                    {sortOption === 'stock-desc' ? (
                      <ArrowDown className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : sortOption === 'stock-asc' ? (
                      <ArrowUp className="w-3.5 h-3.5 text-emerald-600 font-bold" />
                    ) : (
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-300" />
                    )}
                  </div>
                </th>

                <th className="p-4 font-semibold text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="text-sm divide-y divide-slate-100">
              {isLoading ? (
                <InventoryTableRowsSkeleton rows={6} />
              ) : filteredInventory.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-slate-400">
                    <Box className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">No se encontraron artículos con los filtros aplicados.</p>
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item) => {
                  const stockNumber = Number(item.stock) || 0;
                  const stockColor =
                    stockNumber <= 0
                      ? 'text-red-600 bg-red-50'
                      : stockNumber <= 3
                      ? 'text-orange-600 bg-orange-50'
                      : 'text-emerald-700 bg-emerald-50';

                  return (
                    <tr key={item.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="p-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center overflow-hidden shrink-0">
                            {item.img ? (
                              <img
                                src={item.img}
                                alt={item.name}
                                loading="lazy"
                                decoding="async"
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  // Fallback icon on image load error
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Box className="w-5 h-5 text-slate-300" />
                            )}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800 text-sm whitespace-normal max-w-[220px] leading-tight">
                              {item.name}
                              {item.size && (
                                <span className="inline-block ml-1.5 px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded text-xs font-medium">
                                  Talla: {item.size}
                                </span>
                              )}
                            </p>
                            <p className="text-xs text-slate-400 mt-0.5 font-medium">{item.category}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 border-b border-slate-100">
                        <p className="font-mono text-xs font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded inline-block">
                          {item.code}
                        </p>
                      </td>
                      <td className="p-4 border-b border-slate-100 text-slate-600 text-sm">
                        {item.supplier || '-'}
                      </td>
                      <td className="p-4 border-b border-slate-100 text-right">
                        <p className="text-xs text-slate-400">
                          C: L {Number(item.cost || 0).toFixed(2)}
                        </p>
                        {(Number(item.discount) || 0) > 0 ? (
                          <div className="flex flex-col items-end">
                            <span className="text-xs line-through text-slate-400">
                              V: L {Number(item.price || 0).toFixed(2)}
                            </span>
                            <span className="font-bold text-emerald-700">
                              Final: L {Math.max(0, Number(item.price || 0) - Number(item.discount || 0)).toFixed(2)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleOpenQuickDiscount(item)}
                              className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded cursor-pointer hover:bg-rose-100"
                              title="Clic para modificar descuento asignado"
                            >
                              <Tag className="w-2.5 h-2.5" />
                              <span>
                                Desc: -L {Number(item.discount).toFixed(2)}
                                {item.discountType === 'percent' && item.discountValue
                                  ? ` (${item.discountValue}%)`
                                  : ''}
                              </span>
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="font-semibold text-slate-800">
                              V: L {Number(item.price || 0).toFixed(2)}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleOpenQuickDiscount(item)}
                              className="text-[10px] text-slate-400 hover:text-emerald-600 hover:underline cursor-pointer"
                            >
                              + Asignar desc.
                            </button>
                          </div>
                        )}
                        {(() => {
                          const finalP = Math.max(
                            0,
                            Number(item.price || 0) - Number(item.discount || 0)
                          );
                          const unitProfit = finalP - Number(item.cost || 0);
                          const margin = finalP > 0 ? (unitProfit / finalP) * 100 : 0;
                          return (
                            <p
                              className={`text-[11px] font-bold mt-1 ${
                                unitProfit >= 0 ? 'text-teal-700' : 'text-rose-600'
                              }`}
                            >
                              Ganancia: {unitProfit >= 0 ? '+' : ''}L {unitProfit.toFixed(2)} ({margin.toFixed(0)}%)
                            </p>
                          );
                        })()}
                      </td>
                      <td className="p-4 border-b border-slate-100 text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[3rem] px-2.5 py-1 rounded-lg font-bold text-sm ${stockColor}`}
                        >
                          {stockNumber}
                        </span>
                      </td>
                      <td className="p-4 border-b border-slate-100 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleOpenQuickDiscount(item)}
                            className={`transition-colors p-2 rounded-lg cursor-pointer ${
                              (Number(item.discount) || 0) > 0
                                ? 'text-rose-600 bg-rose-50 hover:bg-rose-100'
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title="Establecer descuento al artículo"
                          >
                            <Percent className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50 cursor-pointer"
                            title="Editar Artículo"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setItemToDelete(item)}
                            className="text-slate-400 hover:text-rose-600 transition-colors p-2 rounded-lg hover:bg-rose-50 cursor-pointer"
                            title="Eliminar Artículo"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls Bar */}
        {filteredInventory.length > 0 && (
          <div className="p-3 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600 rounded-b-2xl">
            <div className="flex items-center gap-2">
              <span>
                Mostrando{' '}
                <strong className="text-slate-900">
                  {pageSize === 'all'
                    ? 1
                    : (currentPage - 1) * pageSize + 1}
                </strong>{' '}
                -{' '}
                <strong className="text-slate-900">
                  {pageSize === 'all'
                    ? filteredInventory.length
                    : Math.min(currentPage * pageSize, filteredInventory.length)}
                </strong>{' '}
                de <strong className="text-slate-900">{filteredInventory.length}</strong> artículos
              </span>

              <div className="hidden sm:flex items-center gap-1 ml-3 border-l border-slate-300 pl-3">
                <span className="text-slate-400">Ver:</span>
                {[35, 70, 100].map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => {
                      setPageSize(size);
                      setCurrentPage(1);
                    }}
                    className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                      pageSize === size
                        ? 'bg-emerald-600 text-white shadow-2xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {size}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setPageSize('all');
                    setCurrentPage(1);
                  }}
                  className={`px-2 py-0.5 rounded font-bold transition-all cursor-pointer ${
                    pageSize === 'all'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Todos
                </button>
              </div>
            </div>

            {pageSize !== 'all' && totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                <span className="px-2 font-bold text-slate-800">
                  Página {currentPage} de {totalPages}
                </span>

                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal Agregar / Editar Producto */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h2 className="text-xl font-bold text-slate-800">
                {editingProduct ? 'Editar Artículo' : 'Agregar Nuevo Artículo'}
              </h2>
              <button
                onClick={handleCloseModal}
                className="text-slate-400 hover:text-slate-600 transition-colors w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto">
              <form id="product-modal-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* Basic info column */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        Nombre del Artículo *
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        placeholder="Ej. Camiseta Básica Algodón"
                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Categoría *
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsCustomCategoryMode(!isCustomCategoryMode)}
                            className="text-xs text-emerald-600 hover:text-emerald-700 font-bold hover:underline cursor-pointer"
                            title={isCustomCategoryMode ? 'Seleccionar de la lista de categorías' : 'Escribir nombre de categoría manualmente'}
                          >
                            {isCustomCategoryMode ? 'Lista' : '+ Manual'}
                          </button>
                        </div>

                        {isCustomCategoryMode ? (
                          <div className="relative">
                            <input
                              type="text"
                              list="categories-datalist"
                              required
                              value={formData.category}
                              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                              placeholder="Escribe la categoría..."
                              className="w-full p-2.5 border border-emerald-500 ring-2 ring-emerald-500/20 rounded-lg outline-none text-sm bg-white font-medium text-slate-800"
                              autoFocus
                            />
                            <datalist id="categories-datalist">
                              {categories.map((c) => (
                                <option key={c} value={c} />
                              ))}
                            </datalist>
                          </div>
                        ) : (
                          <select
                            value={categories.includes(formData.category) ? formData.category : '__custom__'}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                setIsCustomCategoryMode(true);
                              } else {
                                setFormData({ ...formData, category: e.target.value });
                              }
                            }}
                            className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white font-medium text-slate-800"
                          >
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            {!categories.includes(formData.category) && formData.category && (
                              <option value={formData.category}>
                                {formData.category}
                              </option>
                            )}
                            <option value="__custom__">+ Escribir nueva categoría manual...</option>
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Talla
                        </label>
                        <input
                          type="text"
                          value={formData.size}
                          onChange={(e) => setFormData({ ...formData, size: e.target.value })}
                          placeholder="Ej. M, 42"
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Stock
                        </label>
                        <input
                          type="number"
                          min="0"
                          required
                          value={formData.stock}
                          onChange={(e) =>
                            setFormData({ ...formData, stock: parseInt(e.target.value, 10) || 0 })
                          }
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Proveedor
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            handleCloseModal();
                            onOpenSupplierModal();
                          }}
                          className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold cursor-pointer"
                        >
                          + Crear Nuevo
                        </button>
                      </div>
                      <select
                        value={formData.supplier}
                        onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                        className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm bg-white"
                      >
                        <option value="">-- Seleccionar Proveedor --</option>
                        {suppliers.map((sup) => (
                          <option key={sup.id} value={sup.name}>
                            {sup.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Pricing and SKU column */}
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                          Código / SKU *
                        </label>
                        <button
                          type="button"
                          onClick={handleAutoGenerateCode}
                          className="text-emerald-600 hover:text-emerald-700 hover:underline text-xs font-semibold flex items-center gap-1 cursor-pointer"
                        >
                          <Sparkles className="w-3 h-3" />
                          <span>Generar Auto</span>
                        </button>
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-2.5 text-slate-400">
                          <Barcode className="w-4 h-4" />
                        </span>
                        <input
                          type="text"
                          required
                          value={formData.code}
                          onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                          placeholder="Ingresa o escanea código"
                          className="w-full p-2.5 pl-10 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-mono"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Costo Unit. (L)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.cost}
                          onChange={(e) =>
                            setFormData({ ...formData, cost: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0.00"
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
                          Precio Venta (L) *
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          required
                          value={formData.price}
                          onChange={(e) =>
                            setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })
                          }
                          placeholder="0.00"
                          className="w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-semibold"
                        />
                      </div>
                    </div>

                    {/* Per-Article Discount Section */}
                    <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-rose-500" />
                          <span>Descuento Asignado al Artículo</span>
                        </label>
                        <div className="flex items-center bg-white p-0.5 rounded-lg border border-slate-300">
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, discountType: 'fixed' })}
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              formData.discountType === 'fixed'
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            L. Fijo
                          </button>
                          <button
                            type="button"
                            onClick={() => setFormData({ ...formData, discountType: 'percent' })}
                            className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                              formData.discountType === 'percent'
                                ? 'bg-slate-800 text-white'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            % Porcentaje
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                            {formData.discountType === 'fixed' ? 'L.' : '%'}
                          </span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max={formData.discountType === 'percent' ? 100 : formData.price || undefined}
                            value={formData.discountValue || ''}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                discountValue: Math.max(0, parseFloat(e.target.value) || 0),
                              })
                            }
                            placeholder="0.00 (Sin descuento)"
                            className="w-full pl-8 pr-8 py-2 bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none text-sm font-bold text-slate-800"
                          />
                          {formData.discountValue > 0 && (
                            <button
                              type="button"
                              onClick={() => setFormData({ ...formData, discountValue: 0 })}
                              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 cursor-pointer"
                              title="Quitar descuento"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Quick Percentage Presets */}
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="text-slate-400 font-medium">Rápido:</span>
                        {[5, 10, 15, 20, 30, 50].map((pct) => (
                          <button
                            key={pct}
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                discountType: 'percent',
                                discountValue: pct,
                              })
                            }
                            className={`px-2 py-0.5 rounded border font-bold transition-all cursor-pointer ${
                              formData.discountType === 'percent' && formData.discountValue === pct
                                ? 'bg-rose-600 text-white border-rose-600'
                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {pct}%
                          </button>
                        ))}
                      </div>

                      {computedFormDiscount > 0 && (
                        <div className="p-2.5 bg-emerald-50/90 border border-emerald-200 rounded-lg flex items-center justify-between text-xs">
                          <div>
                            <span className="text-slate-500 block">
                              Descuento: <strong className="text-rose-600">- L. {computedFormDiscount.toFixed(2)}</strong>
                            </span>
                            <span className="text-emerald-900 font-bold">
                              Precio Final c/Descuento:
                            </span>
                          </div>
                          <span className="text-base font-black text-emerald-700">
                            L. {Math.max(0, (Number(formData.price) || 0) - computedFormDiscount).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Compact Live Profit & Margin Strip */}
                    {(() => {
                      const unitCost = Number(formData.cost) || 0;
                      const finalUnitPrice = Math.max(
                        0,
                        (Number(formData.price) || 0) - computedFormDiscount
                      );
                      const unitProfit = finalUnitPrice - unitCost;
                      const profitMarginPct =
                        finalUnitPrice > 0 ? (unitProfit / finalUnitPrice) * 100 : 0;
                      const stockQty = Math.max(0, Number(formData.stock) || 0);
                      const totalStockProfit = unitProfit * stockQty;
                      const isPositive = unitProfit >= 0;

                      return (
                        <div
                          className={`px-3.5 py-2.5 rounded-xl border flex flex-wrap items-center justify-between gap-2 text-xs ${
                            isPositive
                              ? 'bg-slate-50 border-slate-200 text-slate-700'
                              : 'bg-rose-50/70 border-rose-200 text-rose-700'
                          }`}
                        >
                          <div className="flex items-center gap-1.5 font-semibold">
                            <TrendingUp
                              className={`w-3.5 h-3.5 ${
                                isPositive ? 'text-emerald-600' : 'text-rose-600'
                              }`}
                            />
                            <span>Ganancia c/u:</span>
                            <strong
                              className={`font-extrabold ${
                                isPositive ? 'text-emerald-700' : 'text-rose-600'
                              }`}
                            >
                              {isPositive ? '+' : ''}L. {unitProfit.toFixed(2)} ({profitMarginPct.toFixed(1)}%)
                            </strong>
                          </div>

                          <div className="text-slate-500">
                            Total stock ({stockQty}):{' '}
                            <strong className="text-slate-800 font-bold">
                              {totalStockProfit >= 0 ? '+' : ''}L. {totalStockProfit.toFixed(2)}
                            </strong>
                          </div>
                        </div>
                      );
                    })()}

                    <div>
                      <ImageUploader
                        value={formData.img}
                        onChange={(url) => setFormData({ ...formData, img: url })}
                        productCode={formData.code || 'PROD'}
                        isUploading={isUploadingImage}
                        setIsUploading={setIsUploadingImage}
                        showToast={showToast}
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  {editingProduct ? (
                    <button
                      type="button"
                      onClick={() => setItemToDelete(editingProduct)}
                      className="px-4 py-2.5 text-rose-600 hover:bg-rose-50 rounded-xl transition-colors text-sm font-semibold flex items-center gap-2 cursor-pointer"
                      title="Eliminar este artículo"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Eliminar</span>
                    </button>
                  ) : (
                    <div></div>
                  )}

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleCloseModal}
                      className="px-5 py-2.5 text-slate-600 font-medium hover:bg-slate-100 rounded-xl transition-colors text-sm cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={isUploadingImage}
                      className="px-6 py-2.5 bg-emerald-600 text-white font-medium hover:bg-emerald-700 rounded-xl shadow-sm transition-colors text-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      <span>{isUploadingImage ? 'Subiendo Foto...' : 'Guardar Artículo'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Quick Modal: Establecer Descuento al Artículo */}
      {quickDiscountProduct && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-50 backdrop-blur-xs p-4">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <Percent className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 leading-tight">
                    Descuento del Artículo
                  </h3>
                  <p className="text-xs text-slate-500 truncate max-w-[240px]">
                    {quickDiscountProduct.name} ({quickDiscountProduct.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setQuickDiscountProduct(null)}
                className="text-slate-400 hover:text-slate-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickDiscount} className="p-5 space-y-4">
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-500 font-medium">Precio de Venta Normal:</span>
                <span className="text-sm font-bold text-slate-900">
                  L. {Number(quickDiscountProduct.price || 0).toFixed(2)}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Establecer Descuento
                  </label>
                  <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button
                      type="button"
                      onClick={() => setQuickDiscountType('fixed')}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        quickDiscountType === 'fixed'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Lempiras (L.)
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickDiscountType('percent')}
                      className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        quickDiscountType === 'percent'
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Porcentaje (%)
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">
                    {quickDiscountType === 'fixed' ? 'L.' : '%'}
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max={
                      quickDiscountType === 'percent'
                        ? 100
                        : Number(quickDiscountProduct.price) || undefined
                    }
                    value={quickDiscountValue}
                    onChange={(e) => setQuickDiscountValue(e.target.value)}
                    placeholder="0.00"
                    autoFocus
                    className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-base font-bold text-slate-900"
                  />
                  {quickDiscountValue && (
                    <button
                      type="button"
                      onClick={() => setQuickDiscountValue('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 cursor-pointer"
                      title="Limpiar"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] text-slate-400 font-medium mr-1">Opciones rápidas:</span>
                  {[5, 10, 15, 20, 25, 50].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setQuickDiscountType('percent');
                        setQuickDiscountValue(String(pct));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                        quickDiscountType === 'percent' && Number(quickDiscountValue) === pct
                          ? 'bg-rose-600 text-white border-rose-600'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setQuickDiscountValue('0')}
                    className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-500 hover:bg-slate-100 cursor-pointer"
                  >
                    Sin desc.
                  </button>
                </div>
              </div>

              {(() => {
                const baseP = Math.max(0, Number(quickDiscountProduct.price) || 0);
                const rawV = Math.max(0, parseFloat(quickDiscountValue) || 0);
                const discAmt =
                  quickDiscountType === 'percent'
                    ? Math.min(baseP, (baseP * Math.min(100, rawV)) / 100)
                    : Math.min(baseP, rawV);
                const finalP = Math.max(0, baseP - discAmt);

                return (
                  <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Descuento por unidad:</span>
                      <span className="font-bold text-rose-600">- L. {discAmt.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-1.5 border-t border-emerald-200/70">
                      <span className="font-bold text-emerald-950 text-sm">
                        Precio Final con Descuento:
                      </span>
                      <span className="text-lg font-black text-emerald-700">
                        L. {finalP.toFixed(2)}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setQuickDiscountProduct(null)}
                  className="px-4 py-2 text-slate-600 font-semibold hover:bg-slate-100 rounded-xl text-sm cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>Guardar Descuento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Product Deletion */}
      <ConfirmDialog
        isOpen={itemToDelete !== null}
        title="¿Eliminar este artículo?"
        message={
          itemToDelete
            ? `Se eliminará "${itemToDelete.name}" (${itemToDelete.code}) permanentemente de la base de datos de inventario.`
            : ''
        }
        confirmLabel="Sí, Eliminar Artículo"
        cancelLabel="Cancelar"
        isDestructive={true}
        onConfirm={() => {
          if (itemToDelete) {
            onDeleteProduct(itemToDelete.id);
            setItemToDelete(null);
            if (isModalOpen) handleCloseModal();
          }
        }}
        onCancel={() => setItemToDelete(null)}
      />

      {/* Bulk Stock & Catalog Excel Importer Modal (Option 1 + Option 2) */}
      <BulkStockImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        inventory={inventory}
        suppliers={suppliers}
        onConfirmBulkImport={async (finalProducts, newSuppliers, summary) => {
          if (onBulkSaveProducts) {
            await onBulkSaveProducts(finalProducts, newSuppliers, summary);
          } else {
            for (const prod of finalProducts) {
              await onSaveProduct(prod);
            }
          }
        }}
        showToast={showToast}
      />
    </div>
  );
};
