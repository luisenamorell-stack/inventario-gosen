import React, { useState, useMemo } from 'react';
import {
  Product,
  Supplier,
  StoreSettings,
  UserSession,
  WarehouseLocation,
  WarehouseTransferItem,
  WarehouseTransferRecord,
  StoreWarehousesData,
} from '../types';
import { getProductStockInWarehouse } from '../firebase/firestoreService';
import {
  Boxes,
  ArrowLeftRight,
  Building2,
  Plus,
  Search,
  Printer,
  CheckCircle2,
  Edit2,
  Trash2,
  X,
  Package,
  MapPin,
  User,
  Phone,
  Sliders,
  ArrowRight,
  FileDown,
  Store,
  FileSpreadsheet,
  PackagePlus,
} from 'lucide-react';
import { WhatsAppIcon } from './SalesView';
import { BulkStockImportModal, StockUpdateMode } from './BulkStockImportModal';
import {
  printHtmlDocument,
  buildWarehouseTransferReceiptHtml,
  downloadWarehouseTransferReceiptPdf,
  buildWarehouseMovementsHistoryHtml,
  downloadWarehouseMovementsHistoryPdf,
  buildWarehouseStockReportHtml,
  downloadWarehouseStockReportPdf,
} from '../utils/printPdfService';
import {
  cleanCategoryName,
  matchesCategoryFilter,
  matchesProductSearch,
  normalizeSearchText,
  scoreProductSearchRelevance,
} from '../utils/productSearch';

interface WarehousesViewProps {
  inventory: Product[];
  suppliers?: Supplier[];
  warehousesData: StoreWarehousesData;
  storeSettings: StoreSettings;
  userSession?: UserSession | null;
  onSaveWarehousesData: (nextData: StoreWarehousesData) => Promise<void>;
  onSaveProduct: (product: Product, oldCode?: string) => Promise<void>;
  onBulkSaveProducts: (products: Product[]) => Promise<void>;
  onBulkImportWithSummary?: (
    products: Product[],
    newSuppliers: Supplier[],
    summary: {
      createdCount: number;
      updatedCount: number;
      totalUnitsProcessed: number;
      mode: StockUpdateMode;
      targetWarehouseId?: string;
      targetWarehouseName?: string;
    }
  ) => Promise<void>;
  onRecordActivity?: (action: string, details: string) => void;
  showToast: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const WarehousesView: React.FC<WarehousesViewProps> = ({
  inventory,
  suppliers = [],
  warehousesData,
  storeSettings,
  userSession,
  onSaveWarehousesData,
  onSaveProduct,
  onBulkSaveProducts,
  onBulkImportWithSummary,
  onRecordActivity,
  showToast,
}) => {
  const isCollaborator = userSession?.role === 'collaborator';
  const canViewCosts =
    !isCollaborator || userSession?.salesPermissions?.canViewCostsAndProfits !== false;

  const [subTab, setSubTab] = useState<'stock' | 'transfers' | 'locations'>('stock');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('Todas');
  const [isBulkImportOpen, setIsBulkImportOpen] = useState<boolean>(false);

  const warehouses = useMemo(
    () =>
      Array.isArray(warehousesData.warehouses) && warehousesData.warehouses.length > 0
        ? warehousesData.warehouses
        : [],
    [warehousesData.warehouses]
  );

  const activeWarehouses = useMemo(
    () => warehouses.filter((w) => w.isActive !== false),
    [warehouses]
  );

  const mainWarehouse = useMemo(
    () => activeWarehouses.find((w) => w.isMainSalesFloor) || activeWarehouses[0],
    [activeWarehouses]
  );

  // --- ULTRA-INTUITIVE QUICK ADD / CREATE ARTICLES IN WAREHOUSE MODAL STATE ---
  const [isQuickAddModalOpen, setIsQuickAddModalOpen] = useState<boolean>(false);
  const [quickAddWhId, setQuickAddWhId] = useState<string>('');
  const [quickAddTab, setQuickAddTab] = useState<'existing' | 'new'>('existing');
  const [quickAddSearch, setQuickAddSearch] = useState<string>('');
  const [quickAddCategory, setQuickAddCategory] = useState<string>('Todas');
  const [quickAddOnlyMissing, setQuickAddOnlyMissing] = useState<boolean>(false);
  const [quickAddQtyMap, setQuickAddQtyMap] = useState<Record<string, string>>({});
  const [quickAddCostMap, setQuickAddCostMap] = useState<Record<string, string>>({});
  const [quickAddPriceMap, setQuickAddPriceMap] = useState<Record<string, string>>({});
  const [quickAddingCode, setQuickAddingCode] = useState<string | null>(null);
  const [recentlyAddedCodes, setRecentlyAddedCodes] = useState<Record<string, number>>({});

  // New Product directly into Warehouse form state
  const [newWhProdCode, setNewWhProdCode] = useState<string>('');
  const [newWhProdName, setNewWhProdName] = useState<string>('');
  const [newWhProdCategory, setNewWhProdCategory] = useState<string>('General');
  const [newWhProdSize, setNewWhProdSize] = useState<string>('');
  const [newWhProdQty, setNewWhProdQty] = useState<string>('1');
  const [newWhProdCost, setNewWhProdCost] = useState<string>('');
  const [newWhProdPrice, setNewWhProdPrice] = useState<string>('');
  const [isCreatingWhProduct, setIsCreatingWhProduct] = useState<boolean>(false);

  // Quick single-item edit modal inside a specific warehouse (Stock + Costo + Precio Venta)
  const [quickEditItem, setQuickEditItem] = useState<{
    product: Product;
    warehouseId: string;
  } | null>(null);
  const [quickEditStockVal, setQuickEditStockVal] = useState<string>('0');
  const [quickEditAddDelta, setQuickEditAddDelta] = useState<string>('0');
  const [quickEditMode, setQuickEditMode] = useState<'add' | 'set'>('add');
  const [quickEditCostVal, setQuickEditCostVal] = useState<string>('0');
  const [quickEditPriceVal, setQuickEditPriceVal] = useState<string>('0');
  const [isSavingQuickEdit, setIsSavingQuickEdit] = useState<boolean>(false);

  const openQuickAddModal = (
    targetWarehouseId?: string,
    initialTab: 'existing' | 'new' = 'existing'
  ) => {
    const resolvedWh =
      targetWarehouseId && targetWarehouseId !== 'all'
        ? targetWarehouseId
        : selectedWarehouseFilter !== 'all'
        ? selectedWarehouseFilter
        : activeWarehouses.find((w) => !w.isMainSalesFloor)?.id ||
          mainWarehouse?.id ||
          activeWarehouses[0]?.id ||
          'principal';
    setQuickAddWhId(resolvedWh);
    setQuickAddTab(initialTab);
    setQuickAddSearch('');
    setQuickAddCategory('Todas');
    setQuickAddOnlyMissing(false);
    setRecentlyAddedCodes({});
    const nextCodeSeq = String(inventory.length + 1).padStart(4, '0');
    setNewWhProdCode(`ART-${nextCodeSeq}`);
    setNewWhProdName('');
    setNewWhProdCategory('General');
    setNewWhProdSize('');
    setNewWhProdQty('1');
    setNewWhProdCost('');
    setNewWhProdPrice('');
    setIsQuickAddModalOpen(true);
  };

  const openQuickEditInWarehouse = (prod: Product, whId: string) => {
    const currQty = getProductStockInWarehouse(prod, whId, warehouses);
    setQuickEditItem({ product: prod, warehouseId: whId });
    setQuickEditStockVal(String(currQty));
    setQuickEditAddDelta('1');
    setQuickEditMode('add');
    setQuickEditCostVal(String(Number(prod.cost) || 0));
    setQuickEditPriceVal(String(Number(prod.price) || 0));
  };

  const updateProductStockAndPricesInWarehouse = async (
    prod: Product,
    whId: string,
    newWhQty: number,
    nextCost?: number,
    nextPrice?: number,
    reasonNote?: string
  ) => {
    const cleanQty = Math.max(0, Math.round(Number(newWhQty) || 0));
    const prevWhQty = getProductStockInWarehouse(prod, whId, warehouses);
    const nextMap: Record<string, number> = {};
    let newTotalStock = 0;

    activeWarehouses.forEach((w) => {
      const q = w.id === whId ? cleanQty : getProductStockInWarehouse(prod, w.id, warehouses);
      nextMap[w.id] = q;
      newTotalStock += q;
    });

    const updatedProd: Product = {
      ...prod,
      cost:
        nextCost !== undefined && Number.isFinite(nextCost) && nextCost >= 0
          ? nextCost
          : prod.cost,
      price:
        nextPrice !== undefined && Number.isFinite(nextPrice) && nextPrice >= 0
          ? nextPrice
          : prod.price,
      stock: newTotalStock,
      warehouseStocks: nextMap,
    };

    await onSaveProduct(updatedProd, prod.code);

    const targetWhObj = warehouses.find((w) => w.id === whId);
    const targetWhName = targetWhObj ? targetWhObj.name : 'Bodega';
    const diff = cleanQty - prevWhQty;
    const seq = String((warehousesData.transfers?.length || 0) + 1).padStart(4, '0');
    const now = new Date();

    const newRecord: WarehouseTransferRecord = {
      id: `mov_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      transferNumber: diff > 0 ? `ING-${seq}` : `ASG-${seq}`,
      companyId: warehousesData.companyId,
      movementType: diff > 0 ? 'entry' : 'adjustment',
      fromWarehouseId: 'ingreso_directo',
      fromWarehouseName: diff > 0 ? 'Ingreso Directo a Bodega' : 'Ajuste en Bodega',
      toWarehouseId: whId,
      toWarehouseName: targetWhName,
      items: [
        {
          productId: updatedProd.id,
          code: updatedProd.code,
          name: updatedProd.name,
          category: updatedProd.category,
          size: updatedProd.size,
          quantity: Math.abs(diff) || cleanQty,
          previousStock: prevWhQty,
          newStock: cleanQty,
          cost: updatedProd.cost,
          price: updatedProd.price,
        },
      ],
      totalUnits: Math.abs(diff) || cleanQty,
      notes:
        reasonNote ||
        (diff > 0
          ? `Se sumaron +${diff} uds en ${targetWhName} (Antes: ${prevWhQty} → Ahora: ${cleanQty})`
          : `Existencia en ${targetWhName} actualizada a ${cleanQty} uds`),
      createdBy: userSession?.userName || 'Administrador',
      receivedBy: targetWhObj?.manager || userSession?.userName || 'Encargado',
      timestamp: now.getTime(),
      dateFormatted: now.toLocaleString('es-HN', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    await onSaveWarehousesData({
      ...warehousesData,
      transfers: [newRecord, ...(warehousesData.transfers || [])],
      updatedAt: Date.now(),
    });

    if (onRecordActivity) {
      onRecordActivity(
        `Actualizó "${updatedProd.name}" en ${targetWhName}`,
        `Stock en ${targetWhName}: ${prevWhQty} → ${cleanQty} uds | Costo: L.${updatedProd.cost} | Venta: L.${updatedProd.price}`
      );
    }
  };

  const handleInstantAddExistingToWarehouse = async (
    prod: Product,
    mode: 'add' | 'set' = 'add'
  ) => {
    if (!quickAddWhId) return;
    const rawQty = Number(quickAddQtyMap[prod.code] ?? '1');
    if (!Number.isFinite(rawQty) || (mode === 'add' && rawQty <= 0) || rawQty < 0) {
      showToast('Ingresa una cantidad válida mayor a 0.', 'warning');
      return;
    }

    const currWhStock = getProductStockInWarehouse(prod, quickAddWhId, warehouses);
    const targetWhQty = mode === 'add' ? currWhStock + Math.round(rawQty) : Math.round(rawQty);

    const rawCost = quickAddCostMap[prod.code];
    const rawPrice = quickAddPriceMap[prod.code];
    const parsedCost =
      rawCost !== undefined && rawCost.trim() !== '' ? Number(rawCost) : prod.cost;
    const parsedPrice =
      rawPrice !== undefined && rawPrice.trim() !== '' ? Number(rawPrice) : prod.price;

    setQuickAddingCode(prod.code);
    try {
      await updateProductStockAndPricesInWarehouse(
        prod,
        quickAddWhId,
        targetWhQty,
        parsedCost,
        parsedPrice
      );
      const whName = warehouses.find((w) => w.id === quickAddWhId)?.name || 'la bodega';
      setRecentlyAddedCodes((prev) => ({
        ...prev,
        [prod.code]: targetWhQty,
      }));
      showToast(
        `✅ "${prod.name}" guardado en ${whName} (Stock ahora: ${targetWhQty} uds)`,
        'success'
      );
    } catch (err: any) {
      showToast(
        'Error al agregar artículo a la bodega: ' + (err?.message || 'desconocido'),
        'error'
      );
    } finally {
      setQuickAddingCode(null);
    }
  };

  const handleCreateNewProductInWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickAddWhId) {
      showToast('Selecciona una bodega destino.', 'warning');
      return;
    }
    const cleanCode = newWhProdCode.trim().toUpperCase();
    const cleanName = newWhProdName.trim();
    if (!cleanCode || !cleanName) {
      showToast('Completa el código y el nombre del artículo.', 'warning');
      return;
    }
    const duplicate = inventory.find((p) => p.code.trim().toUpperCase() === cleanCode);
    if (duplicate) {
      showToast(
        `El código "${cleanCode}" ya existe (${duplicate.name}). Búscalo en la pestaña "Elegir de mi Inventario".`,
        'warning'
      );
      return;
    }

    const qty = Math.max(0, Math.round(Number(newWhProdQty) || 0));
    const cost = Math.max(0, Number(newWhProdCost) || 0);
    const price = Math.max(0, Number(newWhProdPrice) || 0);

    if (price <= 0) {
      showToast('Ingresa un Precio de Venta válido mayor a 0.', 'warning');
      return;
    }

    setIsCreatingWhProduct(true);
    try {
      const whStocks: Record<string, number> = {};
      activeWarehouses.forEach((w) => {
        whStocks[w.id] = w.id === quickAddWhId ? qty : 0;
      });

      const newProduct: Product = {
        id: `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        code: cleanCode,
        name: cleanName,
        category: cleanCategoryName(newWhProdCategory) || 'General',
        size: newWhProdSize.trim() || undefined,
        cost,
        price,
        stock: qty,
        warehouseStocks: whStocks,
      };

      await onSaveProduct(newProduct);

      const targetWhObj = warehouses.find((w) => w.id === quickAddWhId);
      const targetWhName = targetWhObj?.name || 'Bodega';
      const seq = String((warehousesData.transfers?.length || 0) + 1).padStart(4, '0');
      const now = new Date();

      const newRecord: WarehouseTransferRecord = {
        id: `mov_${Date.now()}`,
        transferNumber: `ING-${seq}`,
        companyId: warehousesData.companyId,
        movementType: 'entry',
        fromWarehouseId: 'nuevo_articulo',
        fromWarehouseName: 'Creación Directa en Bodega',
        toWarehouseId: quickAddWhId,
        toWarehouseName: targetWhName,
        items: [
          {
            productId: newProduct.id,
            code: newProduct.code,
            name: newProduct.name,
            category: newProduct.category,
            size: newProduct.size,
            quantity: qty,
            previousStock: 0,
            newStock: qty,
            cost: newProduct.cost,
            price: newProduct.price,
          },
        ],
        totalUnits: qty,
        notes: `Artículo nuevo creado directamente en ${targetWhName}`,
        createdBy: userSession?.userName || 'Administrador',
        receivedBy: targetWhObj?.manager || userSession?.userName || 'Encargado',
        timestamp: now.getTime(),
        dateFormatted: now.toLocaleString('es-HN', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      await onSaveWarehousesData({
        ...warehousesData,
        transfers: [newRecord, ...(warehousesData.transfers || [])],
        updatedAt: Date.now(),
      });

      showToast(
        `✅ Artículo "${cleanName}" creado en ${targetWhName} con ${qty} unidades`,
        'success'
      );

      const nextCodeSeq = String(inventory.length + 2).padStart(4, '0');
      setNewWhProdCode(`ART-${nextCodeSeq}`);
      setNewWhProdName('');
      setNewWhProdSize('');
      setNewWhProdQty('1');
      setNewWhProdCost('');
      setNewWhProdPrice('');
    } catch (err: any) {
      showToast('Error al crear artículo en bodega: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsCreatingWhProduct(false);
    }
  };

  const handleSaveQuickEditInWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditItem) return;
    const { product, warehouseId } = quickEditItem;
    const currQty = getProductStockInWarehouse(product, warehouseId, warehouses);
    const targetQty =
      quickEditMode === 'add'
        ? Math.max(0, currQty + Math.round(Number(quickEditAddDelta) || 0))
        : Math.max(0, Math.round(Number(quickEditStockVal) || 0));
    const nextCost = Math.max(0, Number(quickEditCostVal) || 0);
    const nextPrice = Math.max(0, Number(quickEditPriceVal) || 0);

    setIsSavingQuickEdit(true);
    try {
      await updateProductStockAndPricesInWarehouse(
        product,
        warehouseId,
        targetQty,
        nextCost,
        nextPrice
      );
      const whName = warehouses.find((w) => w.id === warehouseId)?.name || 'la bodega';
      showToast(
        `✅ "${product.name}" actualizado en ${whName} (${targetQty} uds • Costo: L.${nextCost.toFixed(2)} • Venta: L.${nextPrice.toFixed(2)})`,
        'success'
      );
      setQuickEditItem(null);
    } catch (err: any) {
      showToast('Error al actualizar artículo: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSavingQuickEdit(false);
    }
  };

  const handleQuickStepStock = async (prod: Product, whId: string, delta: number) => {
    const currQty = getProductStockInWarehouse(prod, whId, warehouses);
    const nextQty = Math.max(0, currQty + delta);
    if (nextQty === currQty) return;
    try {
      await updateProductStockAndPricesInWarehouse(prod, whId, nextQty);
      const whName = warehouses.find((w) => w.id === whId)?.name || 'Bodega';
      showToast(
        `${delta > 0 ? '➕' : '➖'} "${prod.name}" en ${whName}: ${currQty} → ${nextQty} uds`,
        'success'
      );
    } catch (err: any) {
      showToast('Error al ajustar stock: ' + (err?.message || 'desconocido'), 'error');
    }
  };

  // --- DISTRIBUTE / ADJUST PRODUCT WAREHOUSE STOCK MODAL STATE ---
  const [adjustingProduct, setAdjustingProduct] = useState<Product | null>(null);
  const [tempWhStocks, setTempWhStocks] = useState<Record<string, string>>({});
  const [isSavingProductStock, setIsSavingProductStock] = useState<boolean>(false);

  const openAdjustProductModal = (prod: Product) => {
    const initialMap: Record<string, string> = {};
    activeWarehouses.forEach((wh) => {
      const qty = getProductStockInWarehouse(prod, wh.id, warehouses);
      initialMap[wh.id] = String(qty);
    });
    setTempWhStocks(initialMap);
    setAdjustingProduct(prod);
  };

  const handleSaveProductWarehouseDistribution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingProduct) return;
    setIsSavingProductStock(true);
    try {
      const nextMap: Record<string, number> = {
        ...(adjustingProduct.warehouseStocks || {}),
      };
      let newTotalStock = 0;

      activeWarehouses.forEach((wh) => {
        const val = Math.max(0, Math.round(Number(tempWhStocks[wh.id]) || 0));
        nextMap[wh.id] = val;
        newTotalStock += val;
      });

      const updatedProd: Product = {
        ...adjustingProduct,
        stock: newTotalStock,
        warehouseStocks: nextMap,
      };

      await onSaveProduct(updatedProd, adjustingProduct.code);

      const breakdown = activeWarehouses
        .map((w) => `${w.name}: ${nextMap[w.id] || 0}`)
        .join(' | ');

      // Also record in warehouse movements history so it can be printed/exported to PDF
      const seq = String((warehousesData.transfers?.length || 0) + 1).padStart(4, '0');
      const now = new Date();
      const targetMain = mainWarehouse || activeWarehouses[0];
      const newMovRecord: WarehouseTransferRecord = {
        id: `mov_${Date.now()}`,
        transferNumber: `ASG-${seq}`,
        companyId: warehousesData.companyId,
        movementType: 'adjustment',
        fromWarehouseId: 'inventario_general',
        fromWarehouseName: 'Distribución por Bodegas',
        toWarehouseId: targetMain?.id || 'principal',
        toWarehouseName: breakdown.slice(0, 80),
        items: [
          {
            productId: adjustingProduct.id,
            code: adjustingProduct.code,
            name: adjustingProduct.name,
            category: adjustingProduct.category,
            size: adjustingProduct.size,
            quantity: newTotalStock,
            previousStock: adjustingProduct.stock,
            newStock: newTotalStock,
            cost: adjustingProduct.cost,
            price: adjustingProduct.price,
          },
        ],
        totalUnits: newTotalStock,
        notes: `Distribución manual (${breakdown})`,
        createdBy: userSession?.userName || 'Administrador',
        receivedBy: userSession?.userName || 'Encargado Bodega',
        timestamp: now.getTime(),
        dateFormatted: now.toLocaleString('es-HN', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      await onSaveWarehousesData({
        ...warehousesData,
        transfers: [newMovRecord, ...(warehousesData.transfers || [])],
        updatedAt: Date.now(),
      });

      if (onRecordActivity) {
        onRecordActivity(
          `Ajustó stock por bodega de "${adjustingProduct.name}" (${adjustingProduct.code})`,
          `Nuevo Total: ${newTotalStock} uds (${breakdown})`
        );
      }
      showToast(
        `✅ Distribución de bodegas actualizada para "${adjustingProduct.name}" (Total: ${newTotalStock} uds)`,
        'success'
      );
      setAdjustingProduct(null);
    } catch (err: any) {
      showToast('Error al guardar stock por bodega: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSavingProductStock(false);
    }
  };

  // --- WAREHOUSE TRANSFER & EXISTING PRODUCT ASSIGNMENT STATE ---
  const [operationMode, setOperationMode] = useState<'transfer' | 'assign_to_warehouse'>('transfer');

  // State for Mode A: Transfer between warehouses
  const [fromWhId, setFromWhId] = useState<string>(() => {
    const secondary = activeWarehouses.find((w) => !w.isMainSalesFloor);
    return secondary ? secondary.id : activeWarehouses[0]?.id || 'bodega_central';
  });
  const [toWhId, setToWhId] = useState<string>(() => {
    return mainWarehouse?.id || 'principal';
  });
  const [transferSearch, setTransferSearch] = useState<string>('');
  const [transferCart, setTransferCart] = useState<WarehouseTransferItem[]>([]);
  const [transferReceivedBy, setTransferReceivedBy] = useState<string>('');
  const [transferNotes, setTransferNotes] = useState<string>('');
  const [isExecutingTransfer, setIsExecutingTransfer] = useState<boolean>(false);
  const [selectedTransferReceipt, setSelectedTransferReceipt] =
    useState<WarehouseTransferRecord | null>(null);

  // State for Mode B: Add / Assign Existing Products to Any Warehouse
  const [assignTargetWhId, setAssignTargetWhId] = useState<string>(() => {
    const secondary = activeWarehouses.find((w) => !w.isMainSalesFloor);
    return secondary ? secondary.id : activeWarehouses[0]?.id || 'principal';
  });
  const [assignActionType, setAssignActionType] = useState<'entry' | 'adjustment'>('entry');
  const [assignSearch, setAssignSearch] = useState<string>('');
  const [assignCategoryFilter, setAssignCategoryFilter] = useState<string>('Todas');
  const [assignCart, setAssignCart] = useState<WarehouseTransferItem[]>([]);
  const [assignReceivedBy, setAssignReceivedBy] = useState<string>('');
  const [assignNotes, setAssignNotes] = useState<string>('');
  const [isExecutingAssign, setIsExecutingAssign] = useState<boolean>(false);

  // History filter state
  const [historyTypeFilter, setHistoryTypeFilter] = useState<'all' | 'transfer' | 'entry_adj'>('all');
  const [historyWarehouseFilter, setHistoryWarehouseFilter] = useState<string>('all');

  const handleQuickStartTransferForProduct = (prod: Product) => {
    let bestOriginId = fromWhId;
    let maxQty = -1;
    activeWarehouses.forEach((w) => {
      const q = getProductStockInWarehouse(prod, w.id, warehouses);
      if (q > maxQty) {
        maxQty = q;
        bestOriginId = w.id;
      }
    });
    const destWh =
      activeWarehouses.find((w) => w.id !== bestOriginId) || activeWarehouses[0];

    if (bestOriginId && destWh) {
      setFromWhId(bestOriginId);
      setToWhId(destWh.id);
    }

    const availInOrigin = getProductStockInWarehouse(prod, bestOriginId, warehouses);
    if (availInOrigin > 0) {
      setOperationMode('transfer');
      setTransferCart((prev) => {
        const exists = prev.find((i) => i.code === prod.code);
        if (exists) return prev;
        return [
          ...prev,
          {
            productId: prod.id,
            code: prod.code,
            name: prod.name,
            category: prod.category,
            size: prod.size,
            quantity: 1,
            cost: prod.cost,
            price: prod.price,
          },
        ];
      });
    } else {
      // If product has 0 stock, open directly in "Ingresar / Asignar a Bodega" mode!
      setOperationMode('assign_to_warehouse');
      setAssignCart((prev) => {
        const exists = prev.find((i) => i.code === prod.code);
        if (exists) return prev;
        const currInTarget = getProductStockInWarehouse(prod, assignTargetWhId, warehouses);
        return [
          ...prev,
          {
            productId: prod.id,
            code: prod.code,
            name: prod.name,
            category: prod.category,
            size: prod.size,
            quantity: 1,
            previousStock: currInTarget,
            newStock: assignActionType === 'entry' ? currInTarget + 1 : 1,
            cost: prod.cost,
            price: prod.price,
          },
        ];
      });
    }
    setSubTab('transfers');
  };

  const handleQuickAssignProductToWarehouse = (prod: Product) => {
    const targetId =
      selectedWarehouseFilter !== 'all'
        ? selectedWarehouseFilter
        : assignTargetWhId || mainWarehouse?.id || 'principal';
    setAssignTargetWhId(targetId);
    setOperationMode('assign_to_warehouse');
    const currInTarget = getProductStockInWarehouse(prod, targetId, warehouses);
    setAssignCart((prev) => {
      const exists = prev.find((i) => i.code === prod.code);
      if (exists) return prev;
      return [
        ...prev,
        {
          productId: prod.id,
          code: prod.code,
          name: prod.name,
          category: prod.category,
          size: prod.size,
          quantity: 1,
          previousStock: currInTarget,
          newStock: assignActionType === 'entry' ? currInTarget + 1 : 1,
          cost: prod.cost,
          price: prod.price,
        },
      ];
    });
    setSubTab('transfers');
  };

  const handleSwapTransferWarehouses = () => {
    const prevFrom = fromWhId;
    setFromWhId(toWhId);
    setToWhId(prevFrom);
    setTransferCart([]);
  };

  const handleAddProductToTransferCart = (prod: Product) => {
    if (fromWhId === toWhId) {
      showToast('Selecciona una bodega de destino diferente a la de origen.', 'warning');
      return;
    }
    const availableInOrigin = getProductStockInWarehouse(prod, fromWhId, warehouses);
    if (availableInOrigin <= 0) {
      showToast(
        `El artículo "${prod.name}" tiene 0 existencias en la bodega de origen seleccionada.`,
        'warning'
      );
      return;
    }

    setTransferCart((prev) => {
      const existing = prev.find((it) => it.code === prod.code);
      if (existing) {
        if (existing.quantity + 1 > availableInOrigin) {
          showToast(`Solo hay ${availableInOrigin} unidades disponibles en origen.`, 'warning');
          return prev;
        }
        return prev.map((it) =>
          it.code === prod.code ? { ...it, quantity: it.quantity + 1 } : it
        );
      }
      return [
        ...prev,
        {
          productId: prod.id,
          code: prod.code,
          name: prod.name,
          category: prod.category,
          size: prod.size,
          quantity: 1,
          cost: prod.cost,
          price: prod.price,
        },
      ];
    });
  };

  const handleUpdateTransferItemQty = (code: string, newQty: number) => {
    const prod = inventory.find((p) => p.code === code);
    const maxAvail = prod ? getProductStockInWarehouse(prod, fromWhId, warehouses) : 9999;
    const clamped = Math.max(1, Math.min(maxAvail, Math.round(newQty || 1)));
    setTransferCart((prev) =>
      prev.map((it) => (it.code === code ? { ...it, quantity: clamped } : it))
    );
  };

  const handleRemoveTransferItem = (code: string) => {
    setTransferCart((prev) => prev.filter((it) => it.code !== code));
  };

  // --- HANDLERS FOR ADDING / ASSIGNING EXISTING PRODUCTS TO ANY WAREHOUSE ---
  const handleAddProductToAssignCart = (prod: Product) => {
    const currentInTarget = getProductStockInWarehouse(prod, assignTargetWhId, warehouses);
    setAssignCart((prev) => {
      const existing = prev.find((it) => it.code === prod.code);
      if (existing) {
        const nextQty = existing.quantity + 1;
        return prev.map((it) =>
          it.code === prod.code
            ? {
                ...it,
                quantity: nextQty,
                previousStock: currentInTarget,
                newStock: assignActionType === 'entry' ? currentInTarget + nextQty : nextQty,
              }
            : it
        );
      }
      const defaultQty = assignActionType === 'entry' ? 1 : Math.max(1, currentInTarget || 1);
      return [
        ...prev,
        {
          productId: prod.id,
          code: prod.code,
          name: prod.name,
          category: prod.category,
          size: prod.size,
          quantity: defaultQty,
          previousStock: currentInTarget,
          newStock: assignActionType === 'entry' ? currentInTarget + defaultQty : defaultQty,
          cost: prod.cost,
          price: prod.price,
        },
      ];
    });
  };

  const handleUpdateAssignItemQty = (code: string, rawVal: number) => {
    const prod = inventory.find((p) => p.code === code);
    const currentInTarget = prod ? getProductStockInWarehouse(prod, assignTargetWhId, warehouses) : 0;
    const minAllowed = assignActionType === 'entry' ? 1 : 0;
    const clamped = Math.max(minAllowed, Math.round(Number(rawVal) || 0));
    setAssignCart((prev) =>
      prev.map((it) =>
        it.code === code
          ? {
              ...it,
              quantity: clamped,
              previousStock: currentInTarget,
              newStock: assignActionType === 'entry' ? currentInTarget + clamped : clamped,
            }
          : it
      )
    );
  };

  const handleRemoveAssignItem = (code: string) => {
    setAssignCart((prev) => prev.filter((it) => it.code !== code));
  };

  const handleExecuteAssignToWarehouse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (assignCart.length === 0) {
      showToast('Selecciona al menos un artículo para ingresar o asignar a la bodega.', 'warning');
      return;
    }
    const targetWh = warehouses.find((w) => w.id === assignTargetWhId);
    if (!targetWh) {
      showToast('Selecciona una bodega válida.', 'error');
      return;
    }

    setIsExecutingAssign(true);
    try {
      const modifiedProducts: Product[] = [];
      const finalizedItems: WarehouseTransferItem[] = [];

      assignCart.forEach((item) => {
        const prod = inventory.find((p) => p.code === item.code);
        if (!prod) return;

        const nextMap: Record<string, number> = { ...(prod.warehouseStocks || {}) };
        activeWarehouses.forEach((w) => {
          nextMap[w.id] = getProductStockInWarehouse(prod, w.id, warehouses);
        });

        const prevInWh = nextMap[targetWh.id] || 0;
        const newInWh =
          assignActionType === 'entry'
            ? Math.max(0, prevInWh + Math.max(1, Math.round(item.quantity)))
            : Math.max(0, Math.round(item.quantity));

        nextMap[targetWh.id] = newInWh;

        const totalStock = Object.values(nextMap).reduce(
          (sum, val) => sum + Math.max(0, Math.round(Number(val) || 0)),
          0
        );

        modifiedProducts.push({
          ...prod,
          stock: totalStock,
          warehouseStocks: nextMap,
        });

        finalizedItems.push({
          ...item,
          previousStock: prevInWh,
          newStock: newInWh,
          quantity: assignActionType === 'entry' ? Math.max(1, Math.round(item.quantity)) : newInWh,
        });
      });

      await onBulkSaveProducts(modifiedProducts);

      const seq = String((warehousesData.transfers?.length || 0) + 1).padStart(4, '0');
      const now = new Date();
      const prefix = assignActionType === 'entry' ? 'ING' : 'ASG';
      const newRecord: WarehouseTransferRecord = {
        id: `mov_${Date.now()}`,
        transferNumber: `${prefix}-${seq}`,
        companyId: warehousesData.companyId,
        movementType: assignActionType,
        fromWarehouseId: 'catalogo_general',
        fromWarehouseName:
          assignActionType === 'entry'
            ? 'Ingreso de Artículos a Bodega'
            : 'Asignación Directa de Stock',
        toWarehouseId: targetWh.id,
        toWarehouseName: targetWh.name,
        items: finalizedItems,
        totalUnits: finalizedItems.reduce((acc, it) => acc + (Number(it.quantity) || 0), 0),
        notes:
          assignNotes.trim() ||
          (assignActionType === 'entry'
            ? `Ingreso directo de existencias a ${targetWh.name}`
            : `Asignación de stock en ${targetWh.name}`),
        createdBy: userSession?.userName || 'Administrador',
        receivedBy: assignReceivedBy.trim() || targetWh.manager || 'Encargado de Bodega',
        timestamp: now.getTime(),
        dateFormatted: now.toLocaleString('es-HN', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      const nextWarehousesData: StoreWarehousesData = {
        ...warehousesData,
        transfers: [newRecord, ...(warehousesData.transfers || [])],
        updatedAt: Date.now(),
      };

      await onSaveWarehousesData(nextWarehousesData);

      if (onRecordActivity) {
        onRecordActivity(
          `${assignActionType === 'entry' ? 'Ingresó stock a bodega' : 'Asignó stock en bodega'} ${newRecord.transferNumber} → ${targetWh.name}`,
          `${newRecord.totalUnits} unidades en ${finalizedItems.length} artículos`
        );
      }

      setAssignCart([]);
      setAssignNotes('');
      setAssignReceivedBy('');
      setSelectedTransferReceipt(newRecord);
      showToast(
        `✅ ${assignActionType === 'entry' ? 'Ingreso' : 'Asignación'} ${newRecord.transferNumber} aplicado en "${targetWh.name}"`,
        'success'
      );
    } catch (err: any) {
      showToast('Error al registrar artículos en bodega: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsExecutingAssign(false);
    }
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (fromWhId === toWhId) {
      showToast('La bodega de origen y destino no pueden ser la misma.', 'warning');
      return;
    }
    if (transferCart.length === 0) {
      showToast('Agrega al menos un artículo para realizar el traslado.', 'warning');
      return;
    }

    const fromWh = warehouses.find((w) => w.id === fromWhId);
    const toWh = warehouses.find((w) => w.id === toWhId);
    if (!fromWh || !toWh) {
      showToast('Bodega inválida.', 'error');
      return;
    }

    for (const item of transferCart) {
      const prod = inventory.find((p) => p.code === item.code);
      if (!prod) continue;
      const avail = getProductStockInWarehouse(prod, fromWhId, warehouses);
      if (item.quantity > avail) {
        showToast(
          `Stock insuficiente de "${item.name}" en ${fromWh.name} (Disponible: ${avail})`,
          'error'
        );
        return;
      }
    }

    setIsExecutingTransfer(true);
    try {
      const modifiedProducts: Product[] = [];

      transferCart.forEach((item) => {
        const prod = inventory.find((p) => p.code === item.code);
        if (!prod) return;

        const nextMap: Record<string, number> = { ...(prod.warehouseStocks || {}) };
        activeWarehouses.forEach((w) => {
          nextMap[w.id] = getProductStockInWarehouse(prod, w.id, warehouses);
        });

        nextMap[fromWhId] = Math.max(0, (nextMap[fromWhId] || 0) - item.quantity);
        nextMap[toWhId] = Math.max(0, (nextMap[toWhId] || 0) + item.quantity);

        const totalStock = Object.values(nextMap).reduce(
          (sum, val) => sum + Math.max(0, Math.round(Number(val) || 0)),
          0
        );

        modifiedProducts.push({
          ...prod,
          stock: totalStock,
          warehouseStocks: nextMap,
        });
      });

      await onBulkSaveProducts(modifiedProducts);

      const seq = String((warehousesData.transfers?.length || 0) + 1).padStart(4, '0');
      const now = new Date();
      const newTransfer: WarehouseTransferRecord = {
        id: `tr_${Date.now()}`,
        transferNumber: `TRAS-${seq}`,
        companyId: warehousesData.companyId,
        movementType: 'transfer',
        fromWarehouseId: fromWh.id,
        fromWarehouseName: fromWh.name,
        toWarehouseId: toWh.id,
        toWarehouseName: toWh.name,
        items: [...transferCart],
        totalUnits: transferCart.reduce((acc, it) => acc + it.quantity, 0),
        notes: transferNotes.trim(),
        createdBy: userSession?.userName || 'Administrador',
        receivedBy: transferReceivedBy.trim() || 'Encargado Destino',
        timestamp: now.getTime(),
        dateFormatted: now.toLocaleString('es-HN', {
          year: 'numeric',
          month: 'short',
          day: '2-digit',
          hour: '2-digit',
        }),
      };

      const nextWarehousesData: StoreWarehousesData = {
        ...warehousesData,
        transfers: [newTransfer, ...(warehousesData.transfers || [])],
        updatedAt: Date.now(),
      };

      await onSaveWarehousesData(nextWarehousesData);

      if (onRecordActivity) {
        onRecordActivity(
          `Realizó Traslado ${newTransfer.transferNumber} (${fromWh.name} → ${toWh.name})`,
          `${newTransfer.totalUnits} unidades trasladadas (${newTransfer.items.length} referencias)`
        );
      }

      setTransferCart([]);
      setTransferNotes('');
      setTransferReceivedBy('');
      setSelectedTransferReceipt(newTransfer);
      showToast(
        `✅ Traslado ${newTransfer.transferNumber} completado (${fromWh.name} → ${toWh.name})`,
        'success'
      );
    } catch (err: any) {
      showToast('Error al ejecutar traslado: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsExecutingTransfer(false);
    }
  };

  // --- PRINT, PDF & WHATSAPP HANDLERS ---
  const handlePrintTransferReceipt = (tr: WarehouseTransferRecord) => {
    const html = buildWarehouseTransferReceiptHtml(tr, storeSettings, 'letter');
    printHtmlDocument(html, `Comprobante ${tr.transferNumber}`, 'letter', storeSettings);
  };

  const handleDownloadTransferPdf = async (tr: WarehouseTransferRecord) => {
    try {
      await downloadWarehouseTransferReceiptPdf(tr, storeSettings);
      showToast(`📄 PDF del comprobante ${tr.transferNumber} descargado`, 'success');
    } catch (err: any) {
      showToast('Error al generar PDF: ' + (err?.message || 'desconocido'), 'error');
    }
  };

  const handlePrintAllMovementsHistory = (list: WarehouseTransferRecord[], label: string) => {
    if (list.length === 0) {
      showToast('No hay movimientos o traslados para imprimir.', 'warning');
      return;
    }
    const html = buildWarehouseMovementsHistoryHtml(list, storeSettings, 'letter', label);
    printHtmlDocument(html, 'Reporte de Movimientos y Traslados de Bodega', 'letter', storeSettings);
  };

  const handleDownloadAllMovementsHistoryPdf = async (
    list: WarehouseTransferRecord[],
    label: string
  ) => {
    if (list.length === 0) {
      showToast('No hay movimientos o traslados para exportar a PDF.', 'warning');
      return;
    }
    try {
      await downloadWarehouseMovementsHistoryPdf(list, storeSettings, label);
      showToast('📄 PDF de Movimientos y Traslados de Bodega descargado', 'success');
    } catch (err: any) {
      showToast('Error al generar PDF de movimientos: ' + (err?.message || 'desconocido'), 'error');
    }
  };

  const handlePrintWarehouseStockReport = (whId = selectedWarehouseFilter) => {
    const listToPrint =
      whId === selectedWarehouseFilter
        ? filteredProducts
        : inventory.filter((p) =>
            whId === 'all' ? true : getProductStockInWarehouse(p, whId, warehouses) > 0
          );
    if (listToPrint.length === 0) {
      showToast('No hay artículos en la vista actual para imprimir.', 'warning');
      return;
    }
    const html = buildWarehouseStockReportHtml(
      listToPrint,
      warehouses,
      whId,
      storeSettings,
      'letter',
      canViewCosts
    );
    printHtmlDocument(html, 'Existencias por Bodega', 'letter', storeSettings);
  };

  const handleDownloadWarehouseStockPdf = async (whId = selectedWarehouseFilter) => {
    const listToExport =
      whId === selectedWarehouseFilter
        ? filteredProducts
        : inventory.filter((p) =>
            whId === 'all' ? true : getProductStockInWarehouse(p, whId, warehouses) > 0
          );
    if (listToExport.length === 0) {
      showToast('No hay artículos en la vista actual para exportar a PDF.', 'warning');
      return;
    }
    try {
      await downloadWarehouseStockReportPdf(
        listToExport,
        warehouses,
        whId,
        storeSettings,
        canViewCosts
      );
      showToast('📄 PDF de Existencias por Bodega descargado', 'success');
    } catch (err: any) {
      showToast('Error al generar PDF de existencias: ' + (err?.message || 'desconocido'), 'error');
    }
  };

  const handleSendTransferWhatsApp = (tr: WarehouseTransferRecord) => {
    const isEntry = tr.movementType === 'entry';
    const isAdj = tr.movementType === 'adjustment';
    const headerTitle = isEntry
      ? `📥 *COMPROBANTE DE INGRESO A BODEGA — ${tr.transferNumber}*`
      : isAdj
      ? `📋 *COMPROBANTE DE ASIGNACIÓN DE STOCK — ${tr.transferNumber}*`
      : `📦 *COMPROBANTE DE TRASLADO DE BODEGA — ${tr.transferNumber}*`;

    const itemsLines = (tr.items || [])
      .map((it) => `• *${it.quantity}x* ${it.name} (\`${it.code}\`)`)
      .join('\n');
    const msg =
      `${headerTitle}\n` +
      `*${storeSettings.storeName || 'Tienda'}*\n\n` +
      `• *Fecha:* ${tr.dateFormatted}\n` +
      `• *Origen:* ${tr.fromWarehouseName}\n` +
      `• *Bodega Destino:* ${tr.toWarehouseName}\n` +
      `• *Autorizado por:* ${tr.createdBy}\n` +
      `• *Recibido por:* ${tr.receivedBy || 'Encargado'}\n` +
      (tr.notes ? `• *Nota:* ${tr.notes}\n` : '') +
      `\n*Detalle de Artículos (${tr.totalUnits} uds):*\n${itemsLines}`;

    const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // --- CREATE / EDIT WAREHOUSE LOCATION MODAL STATE ---
  const [showLocationModal, setShowLocationModal] = useState<boolean>(false);
  const [editingLocation, setEditingLocation] = useState<WarehouseLocation | null>(null);
  const [locCode, setLocCode] = useState<string>('');
  const [locName, setLocName] = useState<string>('');
  const [locAddress, setLocAddress] = useState<string>('');
  const [locManager, setLocManager] = useState<string>('');
  const [locPhone, setLocPhone] = useState<string>('');
  const [locIsMain, setLocIsMain] = useState<boolean>(false);
  const [isSavingLocation, setIsSavingLocation] = useState<boolean>(false);

  const openNewLocationModal = () => {
    setEditingLocation(null);
    const nextNum = warehouses.length + 1;
    setLocCode(`BOD-0${nextNum}`);
    setLocName('');
    setLocAddress('');
    setLocManager('');
    setLocPhone('');
    setLocIsMain(false);
    setShowLocationModal(true);
  };

  const openEditLocationModal = (wh: WarehouseLocation) => {
    setEditingLocation(wh);
    setLocCode(wh.code);
    setLocName(wh.name);
    setLocAddress(wh.address || '');
    setLocManager(wh.manager || '');
    setLocPhone(wh.phone || '');
    setLocIsMain(Boolean(wh.isMainSalesFloor));
    setShowLocationModal(true);
  };

  const handleSaveWarehouseLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) {
      showToast('Ingresa el nombre de la bodega o sucursal.', 'warning');
      return;
    }
    setIsSavingLocation(true);
    try {
      const id =
        editingLocation?.id ||
        `bodega_${locName
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .slice(0, 20)}_${Date.now().toString().slice(-4)}`;

      const newWh: WarehouseLocation = {
        id,
        code: locCode.trim().toUpperCase() || 'BOD',
        name: locName.trim(),
        address: locAddress.trim(),
        manager: locManager.trim(),
        phone: locPhone.trim(),
        isMainSalesFloor: locIsMain,
        isActive: true,
        createdAt: editingLocation?.createdAt || Date.now(),
      };

      let nextList = editingLocation
        ? warehouses.map((w) => (w.id === editingLocation.id ? newWh : w))
        : [...warehouses, newWh];

      if (locIsMain) {
        nextList = nextList.map((w) => ({
          ...w,
          isMainSalesFloor: w.id === id,
        }));
      } else if (!nextList.some((w) => w.isMainSalesFloor) && nextList.length > 0) {
        nextList[0].isMainSalesFloor = true;
      }

      await onSaveWarehousesData({
        ...warehousesData,
        warehouses: nextList,
        updatedAt: Date.now(),
      });

      setShowLocationModal(false);
      showToast(
        editingLocation
          ? `Bodega "${newWh.name}" actualizada`
          : `✅ Nueva bodega "${newWh.name}" creada exitosamente`,
        'success'
      );
    } catch (err: any) {
      showToast('Error al guardar bodega: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSavingLocation(false);
    }
  };

  const handleDeleteWarehouseLocation = async (wh: WarehouseLocation) => {
    if (wh.isMainSalesFloor) {
      showToast('No puedes eliminar la Sala de Ventas Principal.', 'warning');
      return;
    }
    const unitsInWh = inventory.reduce(
      (sum, p) => sum + getProductStockInWarehouse(p, wh.id, warehouses),
      0
    );
    if (unitsInWh > 0) {
      showToast(
        `Esta bodega aún tiene ${unitsInWh} unidades. Trasládalas a otra bodega antes de eliminarla.`,
        'warning'
      );
      return;
    }

    const nextList = warehouses.filter((w) => w.id !== wh.id);
    await onSaveWarehousesData({
      ...warehousesData,
      warehouses: nextList,
      updatedAt: Date.now(),
    });
    showToast(`Bodega "${wh.name}" eliminada.`, 'info');
  };

  // --- COMPUTED METRICS PER WAREHOUSE ---
  const warehouseMetrics = useMemo(() => {
    return activeWarehouses.map((wh) => {
      let totalUnits = 0;
      let skuCount = 0;
      let totalSaleValue = 0;
      let totalCostValue = 0;

      inventory.forEach((prod) => {
        const q = getProductStockInWarehouse(prod, wh.id, warehouses);
        if (q > 0) {
          totalUnits += q;
          skuCount += 1;
          totalSaleValue += q * (Number(prod.price) || 0);
          totalCostValue += q * (Number(prod.cost) || 0);
        }
      });

      const totalProfitValue = totalSaleValue - totalCostValue;

      return {
        warehouse: wh,
        totalUnits,
        skuCount,
        totalSaleValue,
        totalCostValue,
        totalProfitValue,
      };
    });
  }, [activeWarehouses, inventory, warehouses]);

  const selectedWhMetric = useMemo(
    () =>
      selectedWarehouseFilter !== 'all'
        ? warehouseMetrics.find((m) => m.warehouse.id === selectedWarehouseFilter) || null
        : null,
    [warehouseMetrics, selectedWarehouseFilter]
  );

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    inventory.forEach((p) => {
      const cleaned = cleanCategoryName(p.category);
      if (cleaned) {
        const key = normalizeSearchText(cleaned);
        if (!map.has(key)) {
          map.set(key, cleaned);
        }
      }
    });
    return [
      'Todas',
      ...Array.from(map.values()).sort((a, b) =>
        a.localeCompare(b, 'es', { sensitivity: 'base' })
      ),
    ];
  }, [inventory]);

  const filteredProducts = useMemo(() => {
    const raw = searchQuery.trim();
    const list = inventory.filter((prod) => {
      if (!matchesCategoryFilter(prod.category, categoryFilter)) return false;
      if (selectedWarehouseFilter !== 'all') {
        const qtyInWh = getProductStockInWarehouse(prod, selectedWarehouseFilter, warehouses);
        if (qtyInWh <= 0) return false;
      }
      if (!raw) return true;
      return matchesProductSearch(prod, raw);
    });

    if (!raw) return list;
    return [...list].sort((a, b) => {
      const scoreA = scoreProductSearchRelevance(a, raw);
      const scoreB = scoreProductSearchRelevance(b, raw);
      if (scoreA !== scoreB) return scoreB - scoreA;
      return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
    });
  }, [inventory, categoryFilter, selectedWarehouseFilter, searchQuery, warehouses]);

  // Totals for the currently filtered table rows
  const filteredTableTotals = useMemo(() => {
    let units = 0;
    let costTotal = 0;
    let saleTotal = 0;
    filteredProducts.forEach((p) => {
      const qty =
        selectedWarehouseFilter !== 'all'
          ? getProductStockInWarehouse(p, selectedWarehouseFilter, warehouses)
          : Math.max(0, Number(p.stock) || 0);
      if (qty > 0) {
        units += qty;
        costTotal += qty * (Number(p.cost) || 0);
        saleTotal += qty * (Number(p.price) || 0);
      }
    });
    return {
      units,
      costTotal,
      saleTotal,
      profitTotal: saleTotal - costTotal,
    };
  }, [filteredProducts, selectedWarehouseFilter, warehouses]);

  // Products shown in Quick Add Modal (Tab 1: Existing Inventory)
  const quickAddFilteredInventory = useMemo(() => {
    const q = quickAddSearch.trim();
    const list = inventory.filter((prod) => {
      if (!matchesCategoryFilter(prod.category, quickAddCategory)) return false;
      if (quickAddOnlyMissing && quickAddWhId) {
        const curr = getProductStockInWarehouse(prod, quickAddWhId, warehouses);
        if (curr > 0) return false;
      }
      if (!q) return true;
      return matchesProductSearch(prod, q);
    });
    if (q) {
      list.sort((a, b) => scoreProductSearchRelevance(b, q) - scoreProductSearchRelevance(a, q));
    }
    return list.slice(0, 60);
  }, [inventory, quickAddSearch, quickAddCategory, quickAddOnlyMissing, quickAddWhId, warehouses]);

  const transferEligibleProducts = useMemo(() => {
    const q = transferSearch.trim();
    const list = inventory.filter((prod) => {
      const avail = getProductStockInWarehouse(prod, fromWhId, warehouses);
      if (avail <= 0) return false;
      if (!q) return true;
      return matchesProductSearch(prod, q);
    });
    if (q) {
      list.sort((a, b) => scoreProductSearchRelevance(b, q) - scoreProductSearchRelevance(a, q));
    }
    return list.slice(0, 45);
  }, [inventory, fromWhId, transferSearch, warehouses]);

  // Eligible products for "Ingresar / Asignar Artículos Existentes a Cualquier Bodega" (ALL inventory items!)
  const assignEligibleProducts = useMemo(() => {
    const q = assignSearch.trim();
    const list = inventory.filter((prod) => {
      if (!matchesCategoryFilter(prod.category, assignCategoryFilter)) return false;
      if (!q) return true;
      return matchesProductSearch(prod, q);
    });
    if (q) {
      list.sort((a, b) => scoreProductSearchRelevance(b, q) - scoreProductSearchRelevance(a, q));
    }
    return list.slice(0, 60);
  }, [inventory, assignSearch, assignCategoryFilter]);

  // Filtered transfers / movements history
  const filteredTransfersHistory = useMemo(() => {
    const all = warehousesData.transfers || [];
    return all.filter((tr) => {
      if (historyTypeFilter === 'transfer') {
        if (tr.movementType && tr.movementType !== 'transfer') return false;
      } else if (historyTypeFilter === 'entry_adj') {
        if (tr.movementType !== 'entry' && tr.movementType !== 'adjustment') return false;
      }
      if (historyWarehouseFilter !== 'all') {
        if (
          tr.fromWarehouseId !== historyWarehouseFilter &&
          tr.toWarehouseId !== historyWarehouseFilter
        ) {
          return false;
        }
      }
      return true;
    });
  }, [warehousesData.transfers, historyTypeFilter, historyWarehouseFilter]);

  const historyFilterSummaryLabel = useMemo(() => {
    const typeText =
      historyTypeFilter === 'transfer'
        ? 'Solo Traslados entre Bodegas'
        : historyTypeFilter === 'entry_adj'
        ? 'Solo Ingresos y Asignaciones a Bodega'
        : 'Todos los Movimientos y Traslados';
    if (historyWarehouseFilter === 'all') return typeText;
    const wh = warehouses.find((w) => w.id === historyWarehouseFilter);
    return `${typeText} • Bodega: ${wh ? wh.name : historyWarehouseFilter}`;
  }, [historyTypeFilter, historyWarehouseFilter, warehouses]);

  return (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden bg-slate-50">
      {/* Top Sub-Navigation Header */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
            <Boxes className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
              Control de Bodegas, Costos, Precios de Venta y Ganancias
            </h1>
            <p className="text-xs text-slate-500">
              Haz clic en cualquier bodega para ver solo lo que tiene esa bodega con su Precio Costo, Precio Venta y Ganancia, o agrega artículos con 1 clic.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openQuickAddModal(selectedWarehouseFilter, 'existing')}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            title="Agregar artículos existentes o crear artículos nuevos directamente en una bodega con 1 clic"
          >
            <PackagePlus className="w-4 h-4 text-white shrink-0" />
            <span>+ Agregar Artículos a Bodega</span>
          </button>

          <button
            type="button"
            onClick={() => setIsBulkImportOpen(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
            title="Cargar artículos nuevos o stock masivamente en una bodega específica desde Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Carga Excel</span>
          </button>

          <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80 overflow-x-auto">
            <button
              type="button"
              onClick={() => setSubTab('stock')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                subTab === 'stock'
                  ? 'bg-white text-indigo-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Package className="w-3.5 h-3.5 text-indigo-600" />
              <span>Ver Bodegas</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('transfers')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                subTab === 'transfers'
                  ? 'bg-white text-indigo-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-600" />
              <span>Traslados ({(warehousesData.transfers || []).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('locations')}
              className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                subTab === 'locations'
                  ? 'bg-white text-indigo-950 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3.5 h-3.5 text-amber-600" />
              <span>Crear / Editar Bodegas ({activeWarehouses.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-4 max-w-7xl w-full mx-auto">
        {/* TAB 1: EXISTENCIAS POR BODEGA */}
        {subTab === 'stock' && (
          <>
            {/* Warehouse Selector Cards Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* All Warehouses Card */}
              <div
                onClick={() => setSelectedWarehouseFilter('all')}
                className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  selectedWarehouseFilter === 'all'
                    ? 'bg-slate-900 text-white border-slate-900 shadow-md ring-2 ring-slate-900/20'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-slate-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                        selectedWarehouseFilter === 'all'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      Consolidado Global
                    </span>
                    <Boxes className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="font-black text-base mt-2 truncate">Todas las Bodegas</div>
                  <div className="text-xs mt-1 opacity-85 tabular-nums">
                    <strong>
                      {inventory
                        .reduce((s, p) => s + (Number(p.stock) || 0), 0)
                        .toLocaleString('es-HN')}
                    </strong>{' '}
                    uds totales ({inventory.length} art.)
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-700/30 flex items-center justify-between text-[11px]">
                  <span className="opacity-75">Ver resumen global</span>
                  <span className="font-extrabold underline">Seleccionar &rarr;</span>
                </div>
              </div>

              {warehouseMetrics.map(
                ({
                  warehouse,
                  totalUnits,
                  skuCount,
                  totalSaleValue,
                  totalCostValue,
                  totalProfitValue,
                }) => {
                  const isSelected = selectedWarehouseFilter === warehouse.id;
                  return (
                    <div
                      key={warehouse.id}
                      onClick={() => setSelectedWarehouseFilter(warehouse.id)}
                      className={`p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-indigo-950 text-white border-indigo-700 shadow-md ring-2 ring-indigo-500/30'
                          : 'bg-white text-slate-800 border-slate-200 hover:border-indigo-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${
                              warehouse.isMainSalesFloor
                                ? isSelected
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : isSelected
                                ? 'bg-indigo-500/30 text-indigo-200'
                                : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                            }`}
                          >
                            {warehouse.code} •{' '}
                            {warehouse.isMainSalesFloor ? 'Sala Ventas POS' : 'Bodega'}
                          </span>
                          <span className="text-[11px] font-extrabold tabular-nums opacity-90">
                            {skuCount} art. ({totalUnits} uds)
                          </span>
                        </div>
                        <div className="font-black text-sm sm:text-base mt-2 truncate">
                          {warehouse.name}
                        </div>

                        <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px] tabular-nums pt-2 border-t border-slate-200/30">
                          <div>
                            <span className="opacity-70 block">Costo</span>
                            <span className="font-bold">
                              L.{Math.round(totalCostValue).toLocaleString('es-HN')}
                            </span>
                          </div>
                          <div>
                            <span className="opacity-70 block">Venta</span>
                            <span className="font-bold">
                              L.{Math.round(totalSaleValue).toLocaleString('es-HN')}
                            </span>
                          </div>
                          <div>
                            <span className="opacity-70 block">Ganancia</span>
                            <span
                              className={`font-black ${
                                isSelected ? 'text-emerald-300' : 'text-emerald-600'
                              }`}
                            >
                              +L.{Math.round(totalProfitValue).toLocaleString('es-HN')}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="mt-3 pt-2 border-t border-slate-200/20 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-extrabold underline">
                          {isSelected ? '✓ Viendo esta bodega' : 'Ver solo esta bodega'}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openQuickAddModal(warehouse.id, 'existing');
                          }}
                          className={`px-2.5 py-1 rounded-lg font-extrabold text-[10px] inline-flex items-center gap-1 cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          <Plus className="w-3 h-3" />
                          <span>Agregar</span>
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* EXCLUSIVE SINGLE WAREHOUSE FINANCIAL SUMMARY BANNER */}
            {selectedWhMetric && (
              <div className="rounded-2xl bg-slate-900 text-white p-4 sm:p-5 border border-slate-800 shadow-sm space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300 shrink-0">
                      <Building2 className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[10px] font-black uppercase tracking-wider">
                          Vista Exclusiva de Bodega • {selectedWhMetric.warehouse.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => setSelectedWarehouseFilter('all')}
                          className="text-[11px] font-bold text-slate-300 hover:text-white underline cursor-pointer"
                        >
                          &larr; Ver todas las bodegas
                        </button>
                      </div>
                      <h2 className="text-base sm:text-lg font-black text-white mt-0.5">
                        {selectedWhMetric.warehouse.name}
                      </h2>
                      <p className="text-xs text-slate-300">
                        Mostrando únicamente los artículos disponibles en{' '}
                        <strong>{selectedWhMetric.warehouse.name}</strong> con su Precio Costo,
                        Precio Venta y Ganancia.
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        openQuickAddModal(selectedWhMetric.warehouse.id, 'existing')
                      }
                      className="px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs inline-flex items-center gap-1.5 shadow-sm cursor-pointer"
                    >
                      <PackagePlus className="w-4 h-4" />
                      <span>+ Agregar Artículos a {selectedWhMetric.warehouse.name}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openQuickAddModal(selectedWhMetric.warehouse.id, 'new')}
                      className="px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Crear Artículo Nuevo aquí</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handlePrintWarehouseStockReport(selectedWhMetric.warehouse.id)
                      }
                      className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs inline-flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        handleDownloadWarehouseStockPdf(selectedWhMetric.warehouse.id)
                      }
                      className="px-3 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>PDF Bodega</span>
                    </button>
                  </div>
                </div>

                {/* 4 Financial KPI Cards for the Selected Warehouse */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 tabular-nums">
                  <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700">
                    <span className="text-[10px] font-extrabold uppercase text-slate-400 block">
                      Artículos en esta Bodega
                    </span>
                    <div className="text-lg sm:text-xl font-black text-white mt-0.5">
                      {selectedWhMetric.totalUnits.toLocaleString('es-HN')} uds
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {selectedWhMetric.skuCount} referencias con existencia
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700">
                    <span className="text-[10px] font-extrabold uppercase text-amber-300 block">
                      Total Precio Costo (Inversión)
                    </span>
                    <div className="text-lg sm:text-xl font-black text-amber-300 mt-0.5">
                      L.{' '}
                      {selectedWhMetric.totalCostValue.toLocaleString('es-HN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Costo de mercadería en esta bodega
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-800/90 border border-slate-700">
                    <span className="text-[10px] font-extrabold uppercase text-indigo-300 block">
                      Total Precio Venta
                    </span>
                    <div className="text-lg sm:text-xl font-black text-indigo-200 mt-0.5">
                      L.{' '}
                      {selectedWhMetric.totalSaleValue.toLocaleString('es-HN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      Valor de venta en esta bodega
                    </span>
                  </div>

                  <div className="p-3.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40">
                    <span className="text-[10px] font-extrabold uppercase text-emerald-300 block">
                      Ganancia Total en Bodega
                    </span>
                    <div className="text-lg sm:text-xl font-black text-emerald-300 mt-0.5">
                      +L.{' '}
                      {selectedWhMetric.totalProfitValue.toLocaleString('es-HN', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </div>
                    <span className="text-[11px] text-emerald-200/80">
                      Utilidad proyectada (Venta - Costo)
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Filter, Search, Print & PDF Bar */}
            <div className="bg-white rounded-2xl border border-slate-200 p-3 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 shadow-2xs">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={
                    selectedWhMetric
                      ? `Buscar artículo dentro de ${selectedWhMetric.warehouse.name} por código o nombre...`
                      : 'Buscar artículo por código, nombre o categoría...'
                  }
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedWarehouseFilter}
                  onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50/70 text-xs font-black text-indigo-950"
                >
                  <option value="all">📍 Ver: Todas las Bodegas (Consolidado)</option>
                  {activeWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      🏢 Solo Bodega: {w.name} ({w.code})
                    </option>
                  ))}
                </select>

                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat === 'Todas' ? 'Todas las Categorías' : cat}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => openQuickAddModal(selectedWarehouseFilter, 'existing')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs cursor-pointer shrink-0 shadow-2xs"
                >
                  <PackagePlus className="w-3.5 h-3.5" />
                  <span>
                    {selectedWhMetric
                      ? `+ Agregar a ${selectedWhMetric.warehouse.name}`
                      : '+ Agregar a Bodega'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintWarehouseStockReport(selectedWarehouseFilter)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-extrabold text-xs cursor-pointer shrink-0"
                  title="Imprimir reporte de existencias, costos y ganancias"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-700" />
                  <span>Imprimir</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDownloadWarehouseStockPdf(selectedWarehouseFilter)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs cursor-pointer shrink-0 shadow-2xs"
                  title="Descargar PDF con Precio Costo, Precio Venta y Ganancia"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </button>
              </div>
            </div>

            {/* TABLE: EXCLUSIVE SINGLE-WAREHOUSE VIEW vs CONSOLIDATED VIEW */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                {selectedWhMetric ? (
                  /* =========================================================================
                     SINGLE-WAREHOUSE EXCLUSIVE TABLE: ONLY THIS WAREHOUSE + COST + PRICE + PROFIT
                     ========================================================================= */
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4 font-extrabold">Código / Artículo</th>
                        <th className="py-3 px-3 font-extrabold text-center bg-indigo-950 text-indigo-200">
                          Stock en {selectedWhMetric.warehouse.name}
                        </th>
                        <th className="py-3 px-3 font-extrabold text-right">Precio Costo</th>
                        <th className="py-3 px-3 font-extrabold text-right">Precio Venta</th>
                        <th className="py-3 px-3 font-extrabold text-right bg-emerald-950 text-emerald-300">
                          Ganancia (Venta - Costo)
                        </th>
                        <th className="py-3 px-4 font-extrabold text-right">Acciones Rápidas</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 px-4 text-center">
                            <div className="max-w-md mx-auto space-y-3">
                              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 mx-auto">
                                <PackagePlus className="w-6 h-6" />
                              </div>
                              <div className="font-black text-slate-900 text-sm">
                                No hay artículos registrados en {selectedWhMetric.warehouse.name}
                              </div>
                              <p className="text-xs text-slate-500">
                                Agrega artículos de tu inventario o crea uno nuevo directamente en{' '}
                                <strong>{selectedWhMetric.warehouse.name}</strong> con un clic.
                              </p>
                              <div className="flex items-center justify-center gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    openQuickAddModal(selectedWhMetric.warehouse.id, 'existing')
                                  }
                                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                                >
                                  <PackagePlus className="w-4 h-4" />
                                  <span>+ Agregar Artículos a {selectedWhMetric.warehouse.name}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    openQuickAddModal(selectedWhMetric.warehouse.id, 'new')
                                  }
                                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                                >
                                  <Plus className="w-4 h-4" />
                                  <span>Crear Artículo Nuevo</span>
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.slice(0, 200).map((prod) => {
                          const whId = selectedWhMetric.warehouse.id;
                          const qtyInWh = getProductStockInWarehouse(prod, whId, warehouses);
                          const unitCost = Number(prod.cost) || 0;
                          const unitPrice = Number(prod.price) || 0;
                          const unitProfit = unitPrice - unitCost;
                          const totalCostInWh = qtyInWh * unitCost;
                          const totalSaleInWh = qtyInWh * unitPrice;
                          const totalProfitInWh = qtyInWh * unitProfit;
                          const marginPct =
                            unitPrice > 0 ? Math.round((unitProfit / unitPrice) * 100) : 0;

                          return (
                            <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4">
                                <div className="flex items-center gap-2.5">
                                  <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                    {prod.code}
                                  </span>
                                  <div>
                                    <div className="font-bold text-slate-900">{prod.name}</div>
                                    <div className="text-[10px] text-slate-500">
                                      {prod.category || 'General'}
                                      {prod.size ? ` • Talla: ${prod.size}` : ''}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* Stock in THIS warehouse with 1-click - / + buttons */}
                              <td className="py-3 px-3 text-center bg-indigo-50/30">
                                <div className="inline-flex items-center gap-1.5 bg-white border border-indigo-200 rounded-xl px-1.5 py-1 shadow-2xs">
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStepStock(prod, whId, -1)}
                                    className="w-6 h-6 rounded-lg bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-700 font-black text-xs flex items-center justify-center cursor-pointer"
                                    title="Restar 1 unidad de esta bodega"
                                  >
                                    -
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => openQuickEditInWarehouse(prod, whId)}
                                    className="px-2 font-black text-sm text-indigo-950 hover:text-indigo-600 cursor-pointer"
                                    title="Clic para ingresar cantidad o editar precios"
                                  >
                                    {qtyInWh} uds
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleQuickStepStock(prod, whId, 1)}
                                    className="w-6 h-6 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-black text-xs flex items-center justify-center cursor-pointer"
                                    title="Sumar 1 unidad a esta bodega"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>

                              {/* Precio Costo (Unitario y Total en Bodega) */}
                              <td className="py-3 px-3 text-right">
                                <div className="font-bold text-slate-700">
                                  L. {unitCost.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  Total Costo: L.{' '}
                                  {totalCostInWh.toLocaleString('es-HN', {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              </td>

                              {/* Precio Venta (Unitario y Total en Bodega) */}
                              <td className="py-3 px-3 text-right">
                                <div className="font-black text-slate-900">
                                  L. {unitPrice.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-[10px] text-indigo-600 font-bold">
                                  Total Venta: L.{' '}
                                  {totalSaleInWh.toLocaleString('es-HN', {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              </td>

                              {/* Ganancia (Unitaria y Ganancia Total en esta Bodega) */}
                              <td className="py-3 px-3 text-right bg-emerald-50/30">
                                <div
                                  className={`font-black ${
                                    unitProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                  }`}
                                >
                                  {unitProfit >= 0 ? '+' : ''}L.{' '}
                                  {unitProfit.toLocaleString('es-HN', {
                                    minimumFractionDigits: 2,
                                  })}{' '}
                                  <span className="text-[10px] font-bold opacity-80">
                                    ({marginPct}%)
                                  </span>
                                </div>
                                <div
                                  className={`text-[10px] font-extrabold ${
                                    totalProfitInWh >= 0 ? 'text-emerald-800' : 'text-rose-700'
                                  }`}
                                >
                                  Ganancia Total: {totalProfitInWh >= 0 ? '+' : ''}L.{' '}
                                  {totalProfitInWh.toLocaleString('es-HN', {
                                    minimumFractionDigits: 2,
                                  })}
                                </div>
                              </td>

                              {/* Acciones Rápidas */}
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                                  <button
                                    type="button"
                                    onClick={() => openQuickEditInWarehouse(prod, whId)}
                                    className="px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                    title="Sumar unidades o editar Precio Costo y Precio Venta"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>+ Stock / Precios</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleQuickStartTransferForProduct(prod)}
                                    className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                    title="Trasladar este artículo a otra bodega"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                    <span>Trasladar</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    {filteredProducts.length > 0 && (
                      <tfoot>
                        <tr className="bg-slate-900 text-white font-black text-xs tabular-nums">
                          <td className="py-3 px-4 uppercase">
                            Totales en {selectedWhMetric.warehouse.name} ({filteredProducts.length}{' '}
                            artículos)
                          </td>
                          <td className="py-3 px-3 text-center text-indigo-300 text-sm">
                            {filteredTableTotals.units.toLocaleString('es-HN')} uds
                          </td>
                          <td className="py-3 px-3 text-right text-amber-300">
                            L.{' '}
                            {filteredTableTotals.costTotal.toLocaleString('es-HN', {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-3 px-3 text-right text-indigo-200">
                            L.{' '}
                            {filteredTableTotals.saleTotal.toLocaleString('es-HN', {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-3 px-3 text-right text-emerald-300 text-sm">
                            +L.{' '}
                            {filteredTableTotals.profitTotal.toLocaleString('es-HN', {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="py-3 px-4"></td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                ) : (
                  /* =========================================================================
                     CONSOLIDATED ALL-WAREHOUSES TABLE (WITH COST, PRICE, PROFIT & WAREHOUSES)
                     ========================================================================= */
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[10px] tracking-wider">
                        <th className="py-3 px-4 font-extrabold">Código / Artículo</th>
                        <th className="py-3 px-3 font-extrabold text-right">Precio Costo</th>
                        <th className="py-3 px-3 font-extrabold text-right">Precio Venta</th>
                        <th className="py-3 px-3 font-extrabold text-right text-emerald-300">
                          Ganancia Unit.
                        </th>
                        {activeWarehouses.map((wh) => (
                          <th
                            key={wh.id}
                            onClick={() => setSelectedWarehouseFilter(wh.id)}
                            className={`py-3 px-3 font-extrabold text-center cursor-pointer hover:opacity-90 ${
                              wh.isMainSalesFloor
                                ? 'bg-emerald-950 text-emerald-300'
                                : 'bg-indigo-950 text-indigo-200'
                            }`}
                            title={`Clic para ver solo la bodega ${wh.name}`}
                          >
                            <div className="underline">{wh.name}</div>
                            <div className="text-[9px] opacity-75 font-mono">{wh.code}</div>
                          </th>
                        ))}
                        <th className="py-3 px-3 font-extrabold text-center bg-slate-800">
                          Total Global
                        </th>
                        <th className="py-3 px-4 font-extrabold text-right">Acciones de Bodega</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 tabular-nums">
                      {filteredProducts.length === 0 ? (
                        <tr>
                          <td
                            colSpan={activeWarehouses.length + 6}
                            className="py-10 text-center text-slate-400 font-medium"
                          >
                            No se encontraron artículos con los filtros seleccionados.
                          </td>
                        </tr>
                      ) : (
                        filteredProducts.slice(0, 150).map((prod) => {
                          const unitCost = Number(prod.cost) || 0;
                          const unitPrice = Number(prod.price) || 0;
                          const unitProfit = unitPrice - unitCost;
                          return (
                            <tr key={prod.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-2.5 px-4">
                                <div className="flex items-center gap-2.5">
                                  <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded bg-slate-100 text-slate-800 border border-slate-200">
                                    {prod.code}
                                  </span>
                                  <div>
                                    <div className="font-bold text-slate-900">{prod.name}</div>
                                    <div className="text-[10px] text-slate-400">
                                      {prod.category}
                                      {prod.size ? ` • Talla: ${prod.size}` : ''}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-3 text-right font-semibold text-slate-600">
                                L. {unitCost.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                              </td>

                              <td className="py-2.5 px-3 text-right font-extrabold text-slate-900">
                                L. {unitPrice.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                              </td>

                              <td
                                className={`py-2.5 px-3 text-right font-black ${
                                  unitProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'
                                }`}
                              >
                                {unitProfit >= 0 ? '+' : ''}L.{' '}
                                {unitProfit.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                              </td>

                              {activeWarehouses.map((wh) => {
                                const qty = getProductStockInWarehouse(prod, wh.id, warehouses);
                                return (
                                  <td
                                    key={wh.id}
                                    onClick={() => openQuickEditInWarehouse(prod, wh.id)}
                                    className={`py-2.5 px-3 text-center font-black cursor-pointer hover:underline ${
                                      qty > 0
                                        ? wh.isMainSalesFloor
                                          ? 'text-emerald-700 bg-emerald-50/30'
                                          : 'text-indigo-700 bg-indigo-50/30'
                                        : 'text-slate-300'
                                    }`}
                                    title={`Clic para agregar o editar stock en ${wh.name}`}
                                  >
                                    {qty}
                                  </td>
                                );
                              })}

                              <td className="py-2.5 px-3 text-center">
                                <span className="px-2.5 py-1 rounded-lg font-black bg-slate-900 text-white text-xs">
                                  {prod.stock}
                                </span>
                              </td>

                              <td className="py-2.5 px-4 text-right">
                                <div className="inline-flex items-center gap-1.5 flex-wrap justify-end">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const targetWh =
                                        activeWarehouses.find((w) => !w.isMainSalesFloor)?.id ||
                                        activeWarehouses[0]?.id ||
                                        'principal';
                                      openQuickEditInWarehouse(prod, targetWh);
                                    }}
                                    className="px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                    title="Sumar stock o editar en una bodega con 1 clic"
                                  >
                                    <PackagePlus className="w-3 h-3" />
                                    <span>+ Bodega</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => openAdjustProductModal(prod)}
                                    className="px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                    title="Asignar o repartir cuántas unidades hay en cada bodega"
                                  >
                                    <Sliders className="w-3 h-3" />
                                    <span>Distribuir</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => handleQuickStartTransferForProduct(prod)}
                                    className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                                    title="Trasladar este artículo a otra bodega"
                                  >
                                    <ArrowLeftRight className="w-3 h-3" />
                                    <span>Trasladar</span>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}

        {/* TAB 2: TRASLADOS Y ASIGNACIÓN DE ARTÍCULOS EXISTENTES A BODEGA */}
        {subTab === 'transfers' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Left Column: Mode Switcher + Transfer OR Assign Existing Products to Any Warehouse */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
              {/* Operation Mode Selector */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setOperationMode('transfer')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    operationMode === 'transfer'
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowLeftRight className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>1. Traslado entre Bodegas</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOperationMode('assign_to_warehouse')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                    operationMode === 'assign_to_warehouse'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PackagePlus className="w-4 h-4 text-amber-300 shrink-0" />
                  <span>2. Agregar Artículos Existentes a Bodega</span>
                </button>
              </div>

              {operationMode === 'assign_to_warehouse' ? (
                /* MODE B: AGREGAR / ASIGNAR ARTÍCULOS EXISTENTES A CUALQUIER BODEGA */
                <div className="space-y-4">
                  <div className="border-b border-slate-100 pb-3">
                    <h2 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-2">
                      <PackagePlus className="w-4 h-4 text-indigo-600" />
                      <span>Agregar o Asignar Artículos Existentes a una Bodega</span>
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Selecciona cualquier artículo existente de tu inventario, elige a qué bodega va y define el stock que ingresa o queda en esa bodega. Genera comprobante imprimible y PDF.
                    </p>
                  </div>

                  {/* Step 1: Select Destination Warehouse & Action Type */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-2xl bg-indigo-950 text-white">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-amber-300 mb-1">
                        📥 ¿A qué Bodega van los artículos?
                      </label>
                      <select
                        value={assignTargetWhId}
                        onChange={(e) => {
                          const nextWhId = e.target.value;
                          setAssignTargetWhId(nextWhId);
                          // Recalculate preview stock for items already in cart
                          setAssignCart((prev) =>
                            prev.map((it) => {
                              const prod = inventory.find((p) => p.code === it.code);
                              const curr = prod
                                ? getProductStockInWarehouse(prod, nextWhId, warehouses)
                                : 0;
                              return {
                                ...it,
                                previousStock: curr,
                                newStock:
                                  assignActionType === 'entry' ? curr + it.quantity : it.quantity,
                              };
                            })
                          );
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-indigo-400/40 text-xs font-bold text-white"
                      >
                        {activeWarehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black uppercase text-emerald-300 mb-1">
                        ⚙️ Tipo de Operación en la Bodega:
                      </label>
                      <select
                        value={assignActionType}
                        onChange={(e) => {
                          const nextMode = e.target.value as 'entry' | 'adjustment';
                          setAssignActionType(nextMode);
                          setAssignCart((prev) =>
                            prev.map((it) => {
                              const curr = it.previousStock ?? 0;
                              return {
                                ...it,
                                newStock: nextMode === 'entry' ? curr + it.quantity : it.quantity,
                              };
                            })
                          );
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-emerald-400/40 text-xs font-bold text-emerald-300"
                      >
                        <option value="entry">
                          + Sumar Stock a la Bodega (Ingreso de Unidades)
                        </option>
                        <option value="adjustment">
                          = Fijar Stock Exacto en esa Bodega (Asignación Directa)
                        </option>
                      </select>
                    </div>
                  </div>

                  {/* Step 2: Search Any Existing Product in Catalog */}
                  <div className="space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="block text-xs font-extrabold text-slate-700">
                        1. Buscar y seleccionar artículo existente del inventario ({inventory.length} disponibles):
                      </label>
                      <select
                        value={assignCategoryFilter}
                        onChange={(e) => setAssignCategoryFilter(e.target.value)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700"
                      >
                        {categories.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat === 'Todas' ? 'Todas las Categorías' : cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={assignSearch}
                        onChange={(e) => setAssignSearch(e.target.value)}
                        placeholder="Buscar por código SKU, nombre o categoría para enviarlo a la bodega..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
                      />
                    </div>

                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                      {assignEligibleProducts.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-400">
                          No se encontraron artículos con esa búsqueda.
                        </div>
                      ) : (
                        assignEligibleProducts.map((prod) => {
                          const currInTarget = getProductStockInWarehouse(
                            prod,
                            assignTargetWhId,
                            warehouses
                          );
                          const targetWhName =
                            warehouses.find((w) => w.id === assignTargetWhId)?.name || 'Bodega';
                          return (
                            <div
                              key={prod.id}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-white transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-black text-indigo-900 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200 mr-2">
                                  {prod.code}
                                </span>
                                <span className="font-bold text-slate-900">{prod.name}</span>
                                {prod.size && (
                                  <span className="ml-1.5 text-[10px] text-slate-500">
                                    (Talla {prod.size})
                                  </span>
                                )}
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  En <strong>{targetWhName}</strong>: <strong>{currInTarget} uds</strong> • Stock Global: <strong>{prod.stock} uds</strong>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleAddProductToAssignCart(prod)}
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[11px] cursor-pointer shrink-0"
                              >
                                + Seleccionar
                              </button>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Step 3: Selected Products & Stock Input for Target Warehouse */}
                  <form
                    onSubmit={handleExecuteAssignToWarehouse}
                    className="space-y-3 pt-2 border-t border-slate-100"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-extrabold text-slate-700">
                        2. Artículos que van a{' '}
                        <span className="text-indigo-700 underline">
                          {warehouses.find((w) => w.id === assignTargetWhId)?.name || 'Bodega'}
                        </span>{' '}
                        ({assignCart.length} artículos):
                      </div>
                      {assignCart.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setAssignCart([])}
                          className="text-[11px] font-bold text-rose-600 hover:underline cursor-pointer"
                        >
                          Limpiar lista
                        </button>
                      )}
                    </div>

                    {assignCart.length === 0 ? (
                      <div className="p-5 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                        Selecciona uno o varios artículos arriba para indicar cuánto stock va a la bodega elegida.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {assignCart.map((item) => {
                          const prod = inventory.find((p) => p.code === item.code);
                          const currInTarget = prod
                            ? getProductStockInWarehouse(prod, assignTargetWhId, warehouses)
                            : 0;
                          const resultingInTarget =
                            assignActionType === 'entry'
                              ? currInTarget + item.quantity
                              : item.quantity;

                          return (
                            <div
                              key={item.code}
                              className="p-2.5 rounded-xl bg-indigo-50/50 border border-indigo-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">
                                  <span className="font-mono font-black text-indigo-800 mr-1.5">
                                    [{item.code}]
                                  </span>
                                  {item.name}
                                </div>
                                <div className="text-[10px] text-slate-600 mt-0.5">
                                  Stock actual en esta bodega: <strong>{currInTarget} uds</strong> &rarr;{' '}
                                  <span className="text-emerald-700 font-black">
                                    Quedará en: {resultingInTarget} uds
                                  </span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-extrabold uppercase text-slate-600">
                                  {assignActionType === 'entry' ? '+ Ingresar:' : 'Stock Bodega:'}
                                </span>
                                <input
                                  type="number"
                                  min={assignActionType === 'entry' ? '1' : '0'}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleUpdateAssignItemQty(item.code, Number(e.target.value))
                                  }
                                  className="w-20 px-2.5 py-1.5 rounded-lg border border-indigo-300 bg-white text-center font-black text-slate-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveAssignItem(item.code)}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                  title="Quitar de la lista"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                          Recibido por / Encargado de Bodega
                        </label>
                        <input
                          type="text"
                          value={assignReceivedBy}
                          onChange={(e) => setAssignReceivedBy(e.target.value)}
                          placeholder="Ej. Encargado de Bodega Central"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                          Motivo / Nota del Movimiento
                        </label>
                        <input
                          type="text"
                          value={assignNotes}
                          onChange={(e) => setAssignNotes(e.target.value)}
                          placeholder="Ej. Ingreso de mercadería existente a bodega"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isExecutingAssign || assignCart.length === 0}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {isExecutingAssign
                            ? 'Guardando stock en bodega...'
                            : `Confirmar Stock en ${warehouses.find((w) => w.id === assignTargetWhId)?.name || 'Bodega'} y Generar Comprobante`}
                        </span>
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                /* MODE A: TRASLADO ENTRE BODEGAS */
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h2 className="font-black text-slate-900 text-sm sm:text-base flex items-center gap-2">
                        <ArrowLeftRight className="w-4 h-4 text-emerald-600" />
                        <span>Nueva Orden de Traslado entre Bodegas</span>
                      </h2>
                      <p className="text-[11px] text-slate-500">
                        Mueve mercadería de una Bodega de Origen hacia otra Bodega de Destino generando orden de salida/entrada en PDF.
                      </p>
                    </div>
                  </div>

                  {/* Origin -> Destination Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-11 gap-2 items-center p-3.5 rounded-2xl bg-slate-900 text-white">
                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-black uppercase text-amber-300 mb-1">
                        📤 Bodega de Origen (Sale de):
                      </label>
                      <select
                        value={fromWhId}
                        onChange={(e) => {
                          setFromWhId(e.target.value);
                          setTransferCart([]);
                        }}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white"
                      >
                        {activeWarehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="sm:col-span-1 flex justify-center pt-3">
                      <button
                        type="button"
                        onClick={handleSwapTransferWarehouses}
                        className="p-2 rounded-xl bg-slate-800 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-slate-700 transition-colors cursor-pointer"
                        title="Invertir origen y destino"
                      >
                        <ArrowLeftRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="sm:col-span-5">
                      <label className="block text-[10px] font-black uppercase text-emerald-300 mb-1">
                        📥 Bodega de Destino (Entra a):
                      </label>
                      <select
                        value={toWhId}
                        onChange={(e) => setToWhId(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-emerald-500/50 text-xs font-bold text-emerald-300"
                      >
                        {activeWarehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name} ({w.code})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Product Search in Origin Warehouse */}
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-700">
                      1. Buscar o escanear artículos disponibles en{' '}
                      <span className="text-indigo-700">
                        {warehouses.find((w) => w.id === fromWhId)?.name || 'Bodega Origen'}
                      </span>
                      :
                    </label>
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={transferSearch}
                        onChange={(e) => setTransferSearch(e.target.value)}
                        placeholder="Escribe el código o nombre del artículo para agregarlo al traslado..."
                        className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900"
                      />
                    </div>

                    <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                      {transferEligibleProducts.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                          <div>
                            No hay artículos con stock disponible en esta bodega de origen.
                          </div>
                          <button
                            type="button"
                            onClick={() => setOperationMode('assign_to_warehouse')}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-extrabold text-[11px] cursor-pointer"
                          >
                            Ir a &ldquo;2. Agregar Artículos Existentes a Bodega&rdquo; &rarr;
                          </button>
                        </div>
                      ) : (
                        transferEligibleProducts.map((prod) => {
                          const avail = getProductStockInWarehouse(prod, fromWhId, warehouses);
                          return (
                            <div
                              key={prod.id}
                              className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-white transition-colors"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-black text-slate-700 mr-2">
                                  {prod.code}
                                </span>
                                <span className="font-bold text-slate-900">{prod.name}</span>
                                {prod.size && (
                                  <span className="ml-1.5 text-[10px] text-slate-500">
                                    (Talla {prod.size})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                  Disp: {avail}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleAddProductToTransferCart(prod)}
                                  className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] cursor-pointer"
                                >
                                  + Agregar
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Transfer Cart Items */}
                  <form onSubmit={handleExecuteTransfer} className="space-y-3 pt-2 border-t border-slate-100">
                    <div className="text-xs font-extrabold text-slate-700">
                      2. Artículos a trasladar ({transferCart.length} referencias •{' '}
                      {transferCart.reduce((s, i) => s + i.quantity, 0)} unidades):
                    </div>

                    {transferCart.length === 0 ? (
                      <div className="p-5 rounded-xl border border-dashed border-slate-300 text-center text-xs text-slate-400">
                        Aún no has agregado artículos a la orden de traslado.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-52 overflow-y-auto">
                        {transferCart.map((item) => {
                          const prod = inventory.find((p) => p.code === item.code);
                          const maxAvail = prod
                            ? getProductStockInWarehouse(prod, fromWhId, warehouses)
                            : item.quantity;
                          return (
                            <div
                              key={item.code}
                              className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-bold text-slate-900 truncate">
                                  {item.name}{' '}
                                  <span className="font-mono text-[11px] text-slate-500">
                                    ({item.code})
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  Disponible en origen: <strong>{maxAvail} uds</strong>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                <input
                                  type="number"
                                  min="1"
                                  max={maxAvail}
                                  value={item.quantity}
                                  onChange={(e) =>
                                    handleUpdateTransferItemQty(item.code, Number(e.target.value))
                                  }
                                  className="w-16 px-2 py-1 rounded-lg border border-slate-300 bg-white text-center font-black text-slate-900"
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTransferItem(item.code)}
                                  className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                          Recibido por / Responsable
                        </label>
                        <input
                          type="text"
                          value={transferReceivedBy}
                          onChange={(e) => setTransferReceivedBy(e.target.value)}
                          placeholder="Ej. María López (Sala de Ventas)"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                          Motivo / Nota del Traslado
                        </label>
                        <input
                          type="text"
                          value={transferNotes}
                          onChange={(e) => setTransferNotes(e.target.value)}
                          placeholder="Ej. Reposición de mostrador fin de semana"
                          className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-800"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button
                        type="submit"
                        disabled={isExecutingTransfer || transferCart.length === 0}
                        className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-sm transition-all cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        <span>
                          {isExecutingTransfer
                            ? 'Procesando traslado...'
                            : 'Confirmar y Generar Orden de Traslado'}
                        </span>
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* Right Column: Transfer & Movements History + Print & PDF Buttons */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs flex flex-col space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-black text-slate-900 text-sm">
                    Historial de Movimientos y Traslados ({filteredTransfersHistory.length})
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Imprime o descarga en PDF cualquier traslado, ingreso a bodega o el reporte general.
                  </p>
                </div>

                {/* Global Print & PDF Report Buttons for All Filtered Movements */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      handlePrintAllMovementsHistory(
                        filteredTransfersHistory,
                        historyFilterSummaryLabel
                      )
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                    title="Imprimir reporte de todos los movimientos y traslados listados"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Imprimir</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadAllMovementsHistoryPdf(
                        filteredTransfersHistory,
                        historyFilterSummaryLabel
                      )
                    }
                    className="px-2.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-[11px] inline-flex items-center gap-1 cursor-pointer shadow-2xs"
                    title="Descargar PDF de los movimientos y traslados de bodegas"
                  >
                    <FileDown className="w-3.5 h-3.5" />
                    <span>PDF Movimientos</span>
                  </button>
                </div>
              </div>

              {/* Filters for Movements History */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={historyTypeFilter}
                  onChange={(e) =>
                    setHistoryTypeFilter(e.target.value as 'all' | 'transfer' | 'entry_adj')
                  }
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700"
                >
                  <option value="all">Todos (Traslados e Ingresos)</option>
                  <option value="transfer">Solo Traslados entre Bodegas</option>
                  <option value="entry_adj">Solo Ingresos / Asignaciones</option>
                </select>

                <select
                  value={historyWarehouseFilter}
                  onChange={(e) => setHistoryWarehouseFilter(e.target.value)}
                  className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700"
                >
                  <option value="all">Todas las Bodegas</option>
                  {activeWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>

              {selectedTransferReceipt && (
                <div className="p-3.5 rounded-2xl bg-slate-900 text-white space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-black uppercase">
                      Comprobante Generado • {selectedTransferReceipt.transferNumber}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedTransferReceipt(null)}
                      className="text-slate-400 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="text-xs font-bold">
                    {selectedTransferReceipt.fromWarehouseName} &rarr;{' '}
                    <span className="text-emerald-300">
                      {selectedTransferReceipt.toWarehouseName}
                    </span>{' '}
                    ({selectedTransferReceipt.totalUnits} uds)
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePrintTransferReceipt(selectedTransferReceipt)}
                      className="px-3 py-1.5 rounded-lg bg-white text-slate-900 font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Imprimir</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadTransferPdf(selectedTransferReceipt)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      <span>Descargar PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSendTransferWhatsApp(selectedTransferReceipt)}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-extrabold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <WhatsAppIcon className="w-3.5 h-3.5" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-2.5 overflow-y-auto max-h-[540px] pr-1">
                {filteredTransfersHistory.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    No hay movimientos o traslados registrados con el filtro seleccionado.
                  </div>
                ) : (
                  filteredTransfersHistory.map((tr) => {
                    const isEntry = tr.movementType === 'entry';
                    const isAdj = tr.movementType === 'adjustment';
                    return (
                      <div
                        key={tr.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-indigo-900 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                              {tr.transferNumber}
                            </span>
                            <span
                              className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${
                                isEntry
                                  ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                  : isAdj
                                  ? 'bg-purple-50 text-purple-800 border border-purple-200'
                                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {isEntry
                                ? 'Ingreso a Bodega'
                                : isAdj
                                ? 'Asignación Stock'
                                : 'Traslado'}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">{tr.dateFormatted}</span>
                        </div>

                        <div className="font-bold text-slate-900 flex items-center gap-1.5 flex-wrap">
                          <span>{tr.fromWarehouseName}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="text-emerald-700">{tr.toWarehouseName}</span>
                        </div>

                        <div className="text-[11px] text-slate-600">
                          {(tr.items || []).map((it) => `${it.quantity}x ${it.name} (${it.code})`).join(', ')}
                        </div>

                        {tr.notes && (
                          <div className="text-[10px] text-slate-500 italic">
                            Nota: {tr.notes}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 gap-2 flex-wrap">
                          <span className="text-[11px] font-extrabold text-slate-700">
                            Total: {tr.totalUnits} uds
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handlePrintTransferReceipt(tr)}
                              className="px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              title="Imprimir comprobante"
                            >
                              <Printer className="w-3 h-3" />
                              <span>Imprimir</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadTransferPdf(tr)}
                              className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              title="Descargar comprobante en PDF"
                            >
                              <FileDown className="w-3 h-3" />
                              <span>PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSendTransferWhatsApp(tr)}
                              className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] inline-flex items-center gap-1 cursor-pointer"
                              title="Enviar por WhatsApp"
                            >
                              <WhatsAppIcon className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: MIS BODEGAS / UBICACIONES */}
        {subTab === 'locations' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
              <div>
                <h2 className="font-black text-slate-900 text-sm sm:text-base">
                  Directorio de Bodegas, Almacenes y Sucursales ({warehouses.length})
                </h2>
                <p className="text-xs text-slate-500">
                  Crea todas las bodegas físicas que necesites (Ej. Sala de Ventas, Bodega 1, Bodega 2, Sucursal).
                </p>
              </div>
              <button
                type="button"
                onClick={openNewLocationModal}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs cursor-pointer shrink-0 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Bodega / Ubicación</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {warehouseMetrics.map(
                ({
                  warehouse,
                  totalUnits,
                  skuCount,
                  totalSaleValue,
                  totalCostValue,
                  totalProfitValue,
                }) => (
                  <div
                    key={warehouse.id}
                    className={`bg-white rounded-2xl border p-4 flex flex-col justify-between gap-3 shadow-2xs ${
                      warehouse.isMainSalesFloor
                        ? 'border-emerald-300 ring-1 ring-emerald-500/20'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="font-mono font-black text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200">
                            {warehouse.code}
                          </span>
                          <h3 className="font-black text-slate-900 text-sm sm:text-base mt-1">
                            {warehouse.name}
                          </h3>
                        </div>
                        {warehouse.isMainSalesFloor ? (
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black uppercase flex items-center gap-1">
                            <Store className="w-3 h-3" /> Sala Ventas POS
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black uppercase">
                            Bodega Almacén
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 space-y-1">
                        {warehouse.address && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{warehouse.address}</span>
                          </div>
                        )}
                        {warehouse.manager && (
                          <div className="flex items-center gap-1.5">
                            <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>Encargado: {warehouse.manager}</span>
                          </div>
                        )}
                        {warehouse.phone && (
                          <div className="flex items-center gap-1.5">
                            <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{warehouse.phone}</span>
                          </div>
                        )}
                      </div>

                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 grid grid-cols-2 gap-2 text-xs tabular-nums">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Mercadería
                          </span>
                          <span className="font-black text-slate-900">
                            {totalUnits.toLocaleString('es-HN')} uds ({skuCount} art.)
                          </span>
                          <span className="block text-[10px] text-slate-500 mt-0.5">
                            Costo: <strong>L. {Math.round(totalCostValue).toLocaleString('es-HN')}</strong>
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Venta y Ganancia
                          </span>
                          <span className="font-black text-indigo-900">
                            Venta: L. {Math.round(totalSaleValue).toLocaleString('es-HN')}
                          </span>
                          <span className="block text-[10px] font-black text-emerald-700 mt-0.5">
                            Ganancia: +L. {Math.round(totalProfitValue).toLocaleString('es-HN')}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedWarehouseFilter(warehouse.id);
                            setSubTab('stock');
                          }}
                          className="text-xs font-extrabold text-indigo-600 hover:underline cursor-pointer"
                        >
                          Ver solo esta bodega &rarr;
                        </button>
                        <button
                          type="button"
                          onClick={() => openQuickAddModal(warehouse.id, 'existing')}
                          className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[11px] cursor-pointer"
                        >
                          + Agregar Artículos
                        </button>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDownloadWarehouseStockPdf(warehouse.id)}
                          className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 cursor-pointer"
                          title="Descargar PDF de inventario de esta bodega"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditLocationModal(warehouse)}
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer"
                          title="Editar bodega"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        {!warehouse.isMainSalesFloor && (
                          <button
                            type="button"
                            onClick={() => handleDeleteWarehouseLocation(warehouse)}
                            className="p-1.5 rounded-lg text-rose-500 hover:bg-rose-50 cursor-pointer"
                            title="Eliminar bodega"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          MODAL 1: AGREGAR ARTÍCULOS A BODEGA (ELEGIR CON 1 CLIC O CREAR NUEVO)
          ========================================================================= */}
      {isQuickAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base">
                    Agregar Artículos a Bodega (Fácil y Rápido)
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Elige artículos existentes de tu inventario con 1 clic o crea un artículo nuevo directamente en la bodega.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsQuickAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step 1: Target Warehouse Selector + Mode Switcher */}
            <div className="p-4 bg-slate-100 border-b border-slate-200 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <label className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>1. ¿A qué Bodega quieres ingresar los artículos?</span>
                </label>
                <select
                  value={quickAddWhId}
                  onChange={(e) => setQuickAddWhId(e.target.value)}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-black text-xs border border-slate-700 sm:min-w-[260px]"
                >
                  {activeWarehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      🏢 {w.name} ({w.code})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-white border border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuickAddTab('existing')}
                  className={`py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    quickAddTab === 'existing'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Package className="w-3.5 h-3.5" />
                  <span>Elegir de mi Inventario (Con 1 Clic)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQuickAddTab('new')}
                  className={`py-2 px-3 rounded-lg text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                    quickAddTab === 'new'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear Artículo Nuevo en esta Bodega</span>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5">
              {quickAddTab === 'existing' ? (
                <div className="space-y-3">
                  {/* Search & Filters */}
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={quickAddSearch}
                        onChange={(e) => setQuickAddSearch(e.target.value)}
                        placeholder="Escribe el código o nombre del artículo..."
                        className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                        autoFocus
                      />
                    </div>
                    <select
                      value={quickAddCategory}
                      onChange={(e) => setQuickAddCategory(e.target.value)}
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700"
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat === 'Todas' ? 'Todas las Categorías' : cat}
                        </option>
                      ))}
                    </select>
                    <label className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-bold text-slate-700 inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={quickAddOnlyMissing}
                        onChange={(e) => setQuickAddOnlyMissing(e.target.checked)}
                        className="rounded text-indigo-600"
                      />
                      <span>Solo sin stock aquí</span>
                    </label>
                  </div>

                  <div className="text-[11px] text-slate-500 flex items-center justify-between">
                    <span>
                      Escribe cuántas unidades vas a ingresar y presiona{' '}
                      <strong className="text-emerald-700">+ Sumar a Bodega</strong>:
                    </span>
                    <span className="font-bold text-slate-700">
                      Bodega:{' '}
                      <strong className="text-indigo-700">
                        {warehouses.find((w) => w.id === quickAddWhId)?.name || 'Bodega'}
                      </strong>
                    </span>
                  </div>

                  {/* Product List */}
                  <div className="border border-slate-200 rounded-2xl divide-y divide-slate-100 overflow-hidden">
                    {quickAddFilteredInventory.length === 0 ? (
                      <div className="p-8 text-center space-y-2">
                        <div className="text-xs font-bold text-slate-500">
                          No se encontraron artículos con esa búsqueda.
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            if (quickAddSearch.trim()) {
                              setNewWhProdName(quickAddSearch.trim());
                            }
                            setQuickAddTab('new');
                          }}
                          className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white font-extrabold text-xs cursor-pointer"
                        >
                          + Crear como Artículo Nuevo en esta Bodega
                        </button>
                      </div>
                    ) : (
                      quickAddFilteredInventory.map((prod) => {
                        const currInWh = getProductStockInWarehouse(
                          prod,
                          quickAddWhId,
                          warehouses
                        );
                        const qtyInputVal = quickAddQtyMap[prod.code] ?? '1';
                        const costVal = Number(prod.cost) || 0;
                        const priceVal = Number(prod.price) || 0;
                        const profitVal = priceVal - costVal;
                        const wasJustAdded = recentlyAddedCodes[prod.code] !== undefined;

                        return (
                          <div
                            key={prod.id}
                            className={`p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs transition-colors ${
                              wasJustAdded ? 'bg-emerald-50/60' : 'hover:bg-slate-50'
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-black text-[11px] px-2 py-0.5 rounded bg-indigo-50 text-indigo-900 border border-indigo-200">
                                  {prod.code}
                                </span>
                                <span className="font-black text-slate-900">{prod.name}</span>
                                {prod.size && (
                                  <span className="text-[10px] text-slate-500">
                                    (Talla {prod.size})
                                  </span>
                                )}
                                {wasJustAdded && (
                                  <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-black">
                                    ✓ Guardado ({recentlyAddedCodes[prod.code]} uds)
                                  </span>
                                )}
                              </div>
                              <div className="mt-1 flex items-center gap-3 flex-wrap text-[11px] text-slate-600 tabular-nums">
                                <span className="px-2 py-0.5 rounded bg-slate-100 font-extrabold text-slate-800">
                                  En esta bodega: <strong>{currInWh} uds</strong>
                                </span>
                                <span>
                                  Costo: <strong>L.{costVal.toFixed(2)}</strong>
                                </span>
                                <span>
                                  Venta: <strong>L.{priceVal.toFixed(2)}</strong>
                                </span>
                                <span className="text-emerald-700 font-bold">
                                  Ganancia: +{profitVal >= 0 ? `L.${profitVal.toFixed(2)}` : `L.${profitVal.toFixed(2)}`}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex flex-col">
                                <span className="text-[9px] font-extrabold uppercase text-slate-400">
                                  Cantidad
                                </span>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={qtyInputVal}
                                  onChange={(e) =>
                                    setQuickAddQtyMap((prev) => ({
                                      ...prev,
                                      [prod.code]: e.target.value,
                                    }))
                                  }
                                  className="w-20 px-2.5 py-1.5 rounded-xl border border-slate-300 bg-white text-center font-black text-xs text-slate-900"
                                />
                              </div>

                              <button
                                type="button"
                                disabled={quickAddingCode === prod.code}
                                onClick={() => handleInstantAddExistingToWarehouse(prod, 'add')}
                                className="mt-3.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1 shadow-2xs"
                                title="Sumar esta cantidad a la bodega seleccionada con 1 clic"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>
                                  {quickAddingCode === prod.code ? 'Guardando...' : 'Sumar a Bodega'}
                                </span>
                              </button>

                              <button
                                type="button"
                                disabled={quickAddingCode === prod.code}
                                onClick={() => handleInstantAddExistingToWarehouse(prod, 'set')}
                                className="mt-3.5 px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-extrabold text-[11px] cursor-pointer disabled:opacity-50"
                                title="Fijar exactamente esta cantidad como el stock de esta bodega"
                              >
                                = Fijar
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                /* TAB 2: CREATE NEW PRODUCT DIRECTLY IN THE SELECTED WAREHOUSE */
                <form onSubmit={handleCreateNewProductInWarehouse} className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950">
                    Este artículo nuevo se creará en tu catálogo y sus unidades iniciales quedarán registradas automáticamente en{' '}
                    <strong>
                      {warehouses.find((w) => w.id === quickAddWhId)?.name || 'la bodega seleccionada'}
                    </strong>
                    .
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-[11px] font-extrabold uppercase text-slate-600">
                          Código / SKU *
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setNewWhProdCode(
                              `ART-${String(Math.floor(1000 + Math.random() * 9000))}`
                            )
                          }
                          className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer"
                        >
                          Generar
                        </button>
                      </div>
                      <input
                        type="text"
                        required
                        value={newWhProdCode}
                        onChange={(e) => setNewWhProdCode(e.target.value.toUpperCase())}
                        placeholder="Ej. ART-001"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-xs font-black text-slate-900"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                        Nombre o Descripción del Artículo *
                      </label>
                      <input
                        type="text"
                        required
                        value={newWhProdName}
                        onChange={(e) => setNewWhProdName(e.target.value)}
                        placeholder="Ej. Camisa Polo Azul / Tenis Deportivos"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                        Categoría
                      </label>
                      <input
                        type="text"
                        value={newWhProdCategory}
                        onChange={(e) => setNewWhProdCategory(e.target.value)}
                        placeholder="Ej. General, Calzado, Ropa"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                        Talla / Medida (Opcional)
                      </label>
                      <input
                        type="text"
                        value={newWhProdSize}
                        onChange={(e) => setNewWhProdSize(e.target.value)}
                        placeholder="Ej. M, L, 40"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-800"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-extrabold uppercase text-indigo-700 mb-1">
                        Cantidad en esta Bodega *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        required
                        value={newWhProdQty}
                        onChange={(e) => setNewWhProdQty(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-indigo-300 bg-indigo-50/50 text-xs font-black text-indigo-950"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                        Precio Costo Unitario (L.) *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        required
                        value={newWhProdCost}
                        onChange={(e) => setNewWhProdCost(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-black text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-extrabold uppercase text-emerald-700 mb-1">
                        Precio Venta Unitario (L.) *
                      </label>
                      <input
                        type="number"
                        min="0.01"
                        step="any"
                        required
                        value={newWhProdPrice}
                        onChange={(e) => setNewWhProdPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-emerald-50/40 text-xs font-black text-slate-900"
                      />
                    </div>
                  </div>

                  {/* Live Profit Preview Card */}
                  {(() => {
                    const q = Math.max(0, Math.round(Number(newWhProdQty) || 0));
                    const c = Math.max(0, Number(newWhProdCost) || 0);
                    const p = Math.max(0, Number(newWhProdPrice) || 0);
                    const unitProf = p - c;
                    const totProf = q * unitProf;
                    return (
                      <div className="p-3.5 rounded-2xl bg-slate-900 text-white grid grid-cols-3 gap-3 text-xs tabular-nums">
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Costo Total ({q} uds)
                          </span>
                          <span className="font-black text-amber-300">
                            L. {(q * c).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">
                            Venta Total ({q} uds)
                          </span>
                          <span className="font-black text-indigo-200">
                            L. {(q * p).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-300 font-bold uppercase block">
                            Ganancia Estimada
                          </span>
                          <span className="font-black text-emerald-300">
                            {totProf >= 0 ? '+' : ''}L.{' '}
                            {totProf.toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                          </span>
                          <span className="block text-[10px] text-slate-400">
                            ({unitProf >= 0 ? '+' : ''}L.{unitProf.toFixed(2)} c/u)
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsQuickAddModalOpen(false)}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                    >
                      Cerrar
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingWhProduct}
                      className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {isCreatingWhProduct
                          ? 'Creando en Bodega...'
                          : `Crear y Guardar en ${warehouses.find((w) => w.id === quickAddWhId)?.name || 'Bodega'}`}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>

            {quickAddTab === 'existing' && (
              <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
                <span className="text-slate-500">
                  Los cambios al presionar <strong>+ Sumar a Bodega</strong> se guardan al instante.
                </span>
                <button
                  type="button"
                  onClick={() => setIsQuickAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs cursor-pointer"
                >
                  Listo / Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: SUMAR STOCK / EDITAR PRECIO COSTO Y VENTA EN UNA BODEGA (1 CLIC)
          ========================================================================= */}
      {quickEditItem && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                  {warehouses.find((w) => w.id === quickEditItem.warehouseId)?.name || 'Bodega'}
                </span>
                <h3 className="font-black text-sm sm:text-base mt-1 truncate">
                  {quickEditItem.product.name} ({quickEditItem.product.code})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQuickEditItem(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickEditInWarehouse} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-100 border border-slate-200">
                <button
                  type="button"
                  onClick={() => setQuickEditMode('add')}
                  className={`py-2 px-2.5 rounded-lg text-xs font-black cursor-pointer ${
                    quickEditMode === 'add'
                      ? 'bg-emerald-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  + Sumar Unidades
                </button>
                <button
                  type="button"
                  onClick={() => setQuickEditMode('set')}
                  className={`py-2 px-2.5 rounded-lg text-xs font-black cursor-pointer ${
                    quickEditMode === 'set'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  = Fijar Stock Exacto
                </button>
              </div>

              {(() => {
                const currInWh = getProductStockInWarehouse(
                  quickEditItem.product,
                  quickEditItem.warehouseId,
                  warehouses
                );
                const resultingStock =
                  quickEditMode === 'add'
                    ? Math.max(0, currInWh + Math.round(Number(quickEditAddDelta) || 0))
                    : Math.max(0, Math.round(Number(quickEditStockVal) || 0));

                return (
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600">
                        Existencia actual en esta bodega:
                      </span>
                      <span className="font-black text-slate-900">{currInWh} uds</span>
                    </div>

                    {quickEditMode === 'add' ? (
                      <div>
                        <label className="block text-[11px] font-extrabold uppercase text-emerald-700 mb-1">
                          Cantidad a sumar en esta bodega:
                        </label>
                        <input
                          type="number"
                          step="1"
                          value={quickEditAddDelta}
                          onChange={(e) => setQuickEditAddDelta(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-emerald-400 bg-white text-center font-black text-base text-slate-900"
                          autoFocus
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-extrabold uppercase text-indigo-700 mb-1">
                          Nuevo stock exacto en esta bodega:
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={quickEditStockVal}
                          onChange={(e) => setQuickEditStockVal(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-indigo-400 bg-white text-center font-black text-base text-slate-900"
                          autoFocus
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200">
                      <span className="font-bold text-slate-600">Quedará en esta bodega:</span>
                      <span className="font-black text-emerald-700 text-sm">
                        {resultingStock} uds
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Precio Costo (L.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quickEditCostVal}
                    onChange={(e) => setQuickEditCostVal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-xs text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Precio Venta (L.)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={quickEditPriceVal}
                    onChange={(e) => setQuickEditPriceVal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-black text-xs text-slate-900"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-between text-xs tabular-nums">
                <span className="font-bold text-emerald-950">Ganancia Unitaria:</span>
                <span className="font-black text-emerald-700 text-sm">
                  +L.{' '}
                  {(
                    (Number(quickEditPriceVal) || 0) - (Number(quickEditCostVal) || 0)
                  ).toLocaleString('es-HN', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setQuickEditItem(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingQuickEdit}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingQuickEdit ? 'Guardando...' : 'Guardar en Bodega'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DISTRIBUIR / AJUSTAR EXISTENCIAS POR BODEGA */}
      {adjustingProduct && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm sm:text-base">
                  Distribuir Stock en Bodegas
                </h3>
                <p className="text-[11px] text-slate-300 truncate">
                  {adjustingProduct.name} ({adjustingProduct.code})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdjustingProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProductWarehouseDistribution} className="p-5 space-y-4">
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200 text-xs text-indigo-950 flex items-center justify-between">
                <span>Stock Total Anterior: <strong>{adjustingProduct.stock} uds</strong></span>
                <span>
                  Nuevo Total:{' '}
                  <strong className="text-emerald-700 text-sm">
                    {activeWarehouses.reduce(
                      (s, w) => s + Math.max(0, Math.round(Number(tempWhStocks[w.id]) || 0)),
                      0
                    )}{' '}
                    uds
                  </strong>
                </span>
              </div>

              <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                {activeWarehouses.map((wh) => (
                  <div
                    key={wh.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="font-black text-xs text-slate-900">{wh.name}</div>
                      <div className="text-[10px] text-slate-500">
                        {wh.code} • {wh.isMainSalesFloor ? 'Sala de Ventas Principal' : 'Almacén'}
                      </div>
                    </div>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={tempWhStocks[wh.id] ?? '0'}
                      onChange={(e) =>
                        setTempWhStocks((prev) => ({ ...prev, [wh.id]: e.target.value }))
                      }
                      className="w-24 px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-right font-black text-sm text-slate-900"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustingProduct(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingProductStock}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingProductStock ? 'Guardando...' : 'Guardar Existencias'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CREAR / EDITAR BODEGA O SUCURSAL */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-black text-sm sm:text-base">
                  {editingLocation ? `Editar Bodega: ${editingLocation.name}` : 'Nueva Bodega / Ubicación'}
                </h3>
                <p className="text-[11px] text-slate-300">
                  Registra una bodega de almacenamiento o sucursal para tu inventario.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLocationModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveWarehouseLocation} className="p-5 space-y-3.5">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Código *
                  </label>
                  <input
                    type="text"
                    required
                    value={locCode}
                    onChange={(e) => setLocCode(e.target.value.toUpperCase())}
                    placeholder="BOD-03"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-black text-slate-900"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Nombre de la Bodega *
                  </label>
                  <input
                    type="text"
                    required
                    value={locName}
                    onChange={(e) => setLocName(e.target.value)}
                    placeholder="Ej. Bodega 2 Calzado / Sucursal Centro"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                  Ubicación / Dirección Física
                </label>
                <input
                  type="text"
                  value={locAddress}
                  onChange={(e) => setLocAddress(e.target.value)}
                  placeholder="Ej. Segunda planta / Local #4"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Encargado / Bodeguero
                  </label>
                  <input
                    type="text"
                    value={locManager}
                    onChange={(e) => setLocManager(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase text-slate-600 mb-1">
                    Teléfono
                  </label>
                  <input
                    type="text"
                    value={locPhone}
                    onChange={(e) => setLocPhone(e.target.value)}
                    placeholder="Ej. 9988-7766"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-800"
                  />
                </div>
              </div>

              <label className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center gap-2.5 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={locIsMain}
                  onChange={(e) => setLocIsMain(e.target.checked)}
                  className="rounded text-emerald-600"
                />
                <span className="font-bold text-emerald-950">
                  Es la Sala de Ventas Principal (Mostrador POS)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLocationModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingLocation}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingLocation ? 'Guardando...' : 'Guardar Bodega'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Stock & Catalog Excel Importer Modal with Target Warehouse Selector */}
      <BulkStockImportModal
        isOpen={isBulkImportOpen}
        onClose={() => setIsBulkImportOpen(false)}
        inventory={inventory}
        suppliers={suppliers}
        warehouses={activeWarehouses}
        initialWarehouseId={
          selectedWarehouseFilter !== 'all' ? selectedWarehouseFilter : mainWarehouse?.id
        }
        onConfirmBulkImport={async (finalProducts, newSuppliers, summary) => {
          if (onBulkImportWithSummary) {
            await onBulkImportWithSummary(finalProducts, newSuppliers, summary);
          } else {
            await onBulkSaveProducts(finalProducts);
          }
        }}
        showToast={showToast}
      />
    </div>
  );
};
