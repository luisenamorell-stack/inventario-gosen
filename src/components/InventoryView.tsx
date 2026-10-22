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
  ArrowUp
} from 'lucide-react';

import { ConfirmDialog } from './ConfirmDialog';
import { ImageUploader } from './ImageUploader';
import {
  InventoryMobileCardSkeleton,
  InventoryTableRowsSkeleton,
} from './SkeletonLoaders';

interface InventoryViewProps {
  inventory: Product[];
  suppliers: Supplier[];
  isLoading?: boolean;
  initialSearchCode?: string;
  onSaveProduct: (product: Product, oldCode?: string) => void;
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
  onSaveProduct,
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
    | 'name-asc'
    | 'name-desc'
    | 'code-asc'
    | 'code-desc'
  >('stock-desc');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(showModalInitially);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // Deletion confirmation state
  const [itemToDelete, setItemToDelete] = useState<Product | null>(null);

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
      img: '',
    });
    setIsCustomCategoryMode(false);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (product: Product) => {
    setEditingProduct(product);
    setFormData({
      code: product.code,
      name: product.name,
      category: product.category || 'Otros',
      size: product.size || '',
      stock: product.stock,
      supplier: product.supplier || '',
      cost: product.cost,
      price: product.price,
      img: product.img || '',
    });
    setIsCustomCategoryMode(false);
    setIsModalOpen(true);
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
      img: formData.img.trim(),
    };

    onSaveProduct(savedItem, editingProduct?.code);
    handleCloseModal();
  };

  // Filter & Sort inventory items (Mayor a menor stock, precio, costo, etc.)
  const filteredInventory = React.useMemo(() => {
    const query = searchText.toLowerCase().trim();
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
  }, [inventory, searchText, selectedCategory, selectedSupplier, sortOption]);

  // Extract unique categories
  const categories = Array.from(
    new Set(['Ropa', 'Calzado', 'Accesorios', ...inventory.map((i) => i.category)])
  ).filter(Boolean);

  return (
    <div className="flex-1 min-h-0 h-full w-full overflow-y-auto scroll-container p-3 sm:p-6 space-y-4 pb-36 md:pb-20">
      {/* Header */}
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Catálogo de Productos</h1>
          <p className="text-xs sm:text-sm text-slate-500">Gestiona todos los artículos de la tienda.</p>
        </div>
        <button
          onClick={handleOpenCreate}
          className="w-full sm:w-auto bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-bold hover:bg-emerald-700 transition-colors shadow-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span>Nuevo Artículo</span>
        </button>
      </header>

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
              filteredInventory.map((item) => {
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
                      <span className="text-[10px] text-slate-400 block -mb-0.5">Precio</span>
                      <span className="font-bold text-slate-900 text-sm text-emerald-700">
                        L. {Number(item.price || 0).toFixed(2)}
                      </span>
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
                filteredInventory.map((item) => {
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
                        <p className="font-semibold text-slate-800">
                          V: L {Number(item.price || 0).toFixed(2)}
                        </p>
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
                            onClick={() => handleOpenEdit(item)}
                            className="text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-lg hover:bg-blue-50"
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
    </div>
  );
};
