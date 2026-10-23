import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Product, Supplier } from '../types';
import {
  FileSpreadsheet,
  Upload,
  Download,
  ClipboardPaste,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Sparkles,
  RefreshCw,
  X,
  ArrowRight,
  Layers,
  Replace,
  FileDown,
  Info,
  Search
} from 'lucide-react';

export type StockUpdateMode = 'add' | 'replace';

export interface BulkImportRow {
  rowId: string;
  code: string;
  name: string;
  category: string;
  size: string;
  supplier: string;
  cost: number;
  price: number;
  excelQuantity: number;
}

interface BulkStockImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: Product[];
  suppliers: Supplier[];
  onConfirmBulkImport: (
    finalProducts: Product[],
    newSuppliers: Supplier[],
    summary: { createdCount: number; updatedCount: number; totalUnitsProcessed: number; mode: StockUpdateMode }
  ) => Promise<void>;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

// Helper to normalize column headers (strip accents, lowercase, symbols)
const normalizeHeader = (header: string): string => {
  return String(header || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
};

// Parse numeric value cleanly from strings like "L. 1,250.50" or "450"
const parseCleanNumber = (val: any, defaultVal = 0): number => {
  if (typeof val === 'number' && !Number.isNaN(val)) return val;
  if (val === null || val === undefined || val === '') return defaultVal;
  const cleaned = String(val)
    .replace(/[L$€,\s]/gi, '')
    .replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return Number.isNaN(parsed) ? defaultVal : parsed;
};

export const BulkStockImportModal: React.FC<BulkStockImportModalProps> = ({
  isOpen,
  onClose,
  inventory,
  suppliers,
  onConfirmBulkImport,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'file' | 'paste'>('file');
  const [stockMode, setStockMode] = useState<StockUpdateMode>('add');
  const [rows, setRows] = useState<BulkImportRow[]>([]);
  const [pasteText, setPasteText] = useState<string>('');
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [filterPreview, setFilterPreview] = useState<'all' | 'new' | 'existing' | 'invalid'>('all');
  const [searchPreview, setSearchPreview] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Map existing inventory by lowercase code for fast O(1) lookup
  const inventoryByCode = useMemo(() => {
    const map = new Map<string, Product>();
    inventory.forEach((item) => {
      if (item.code) {
        map.set(item.code.trim().toLowerCase(), item);
      }
    });
    return map;
  }, [inventory]);

  // 1. Download official Excel template (.xlsx)
  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        Codigo: 'CAL-01-101',
        Nombre: 'Tenis Deportivo Nike Air Blanco',
        Categoria: 'Calzado',
        Talla: '40',
        Proveedor: suppliers[0]?.name || 'Distribuidora Central',
        Costo: 650,
        Precio: 1200,
        Stock: 12,
      },
      {
        Codigo: 'CAL-01-102',
        Nombre: 'Sandalia Dama Cuero Café',
        Categoria: 'Calzado',
        Talla: '37',
        Proveedor: suppliers[0]?.name || 'Distribuidora Central',
        Costo: 320,
        Precio: 650,
        Stock: 8,
      },
      {
        Codigo: 'ROP-01-205',
        Nombre: 'Camisa Polo Clásica Negra',
        Categoria: 'Ropa',
        Talla: 'M',
        Proveedor: suppliers[1]?.name || 'Textiles del Norte',
        Costo: 250,
        Precio: 490,
        Stock: 15,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleData);
    worksheet['!cols'] = [
      { wch: 16 }, // Codigo
      { wch: 34 }, // Nombre
      { wch: 16 }, // Categoria
      { wch: 10 }, // Talla
      { wch: 24 }, // Proveedor
      { wch: 12 }, // Costo
      { wch: 12 }, // Precio
      { wch: 10 }, // Stock
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla_Stock_Gosen');
    XLSX.writeFile(workbook, 'Plantilla_Carga_Masiva_Tienda_Gosen.xlsx');
    showToast?.('Plantilla de Excel descargada correctamente', 'info');
  };

  // 2. Export current inventory to Excel (.xlsx) for mass editing
  const handleExportCurrentInventory = () => {
    const exportData = inventory.map((item) => ({
      Codigo: item.code,
      Nombre: item.name,
      Categoria: item.category || 'General',
      Talla: item.size || '',
      Proveedor: item.supplier || '',
      Costo: Number(item.cost) || 0,
      Precio: Number(item.price) || 0,
      Stock: Number(item.stock) || 0,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    worksheet['!cols'] = [
      { wch: 16 },
      { wch: 34 },
      { wch: 16 },
      { wch: 10 },
      { wch: 24 },
      { wch: 12 },
      { wch: 12 },
      { wch: 10 },
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Inventario_Actual');
    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Inventario_Tienda_Gosen_${dateStr}.xlsx`);
    showToast?.('Inventario actual exportado a Excel', 'success');
  };

  // Convert raw 2D array or JSON objects from Excel/Paste into BulkImportRow[]
  const mapRawObjectsToRows = (rawObjects: Record<string, any>[]): BulkImportRow[] => {
    const parsedRows: BulkImportRow[] = [];

    rawObjects.forEach((obj, idx) => {
      let code = '';
      let name = '';
      let category = '';
      let size = '';
      let supplier = '';
      let cost: number | undefined = undefined;
      let price: number | undefined = undefined;
      let excelQuantity: number | undefined = undefined;

      Object.entries(obj).forEach(([rawKey, rawVal]) => {
        const key = normalizeHeader(rawKey);
        const strVal = rawVal !== null && rawVal !== undefined ? String(rawVal).trim() : '';

        if (['codigo', 'codigosku', 'sku', 'code', 'id', 'cod', 'referencia', 'barras', 'codigodebarras'].includes(key)) {
          code = strVal;
        } else if (['nombre', 'producto', 'articulo', 'descripcion', 'name', 'item', 'prenda', 'calzado', 'estilo'].includes(key)) {
          name = strVal;
        } else if (['categoria', 'departamento', 'linea', 'tipo', 'category', 'familia'].includes(key)) {
          category = strVal;
        } else if (['talla', 'medida', 'size', 'numero', 'num', 'talle'].includes(key)) {
          size = strVal;
        } else if (['proveedor', 'marca', 'supplier', 'distribuidor', 'fabricante'].includes(key)) {
          supplier = strVal;
        } else if (['costo', 'preciocosto', 'costounitario', 'cost', 'compra', 'valorcosto'].includes(key)) {
          cost = parseCleanNumber(rawVal, 0);
        } else if (['precio', 'precioventa', 'venta', 'price', 'pvp', 'valor', 'preciopublico'].includes(key)) {
          price = parseCleanNumber(rawVal, 0);
        } else if (['stock', 'cantidad', 'existencia', 'existencias', 'unidades', 'cant', 'qty', 'quantity', 'ingreso', 'nuevostock'].includes(key)) {
          excelQuantity = Math.round(parseCleanNumber(rawVal, 0));
        }
      });

      // Ignore completely blank rows
      if (!code && !name && cost === undefined && price === undefined && excelQuantity === undefined) {
        return;
      }

      // Check if product already exists by code to pre-fill missing fields (useful for quick 2-column stock updates!)
      const existing = code ? inventoryByCode.get(code.toLowerCase()) : undefined;

      parsedRows.push({
        rowId: `row_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        code: code || '',
        name: name || existing?.name || '',
        category: category || existing?.category || 'Calzado',
        size: size || existing?.size || '',
        supplier: supplier || existing?.supplier || (suppliers[0]?.name || ''),
        cost: cost !== undefined ? cost : (existing?.cost ?? 0),
        price: price !== undefined ? price : (existing?.price ?? 0),
        excelQuantity: excelQuantity !== undefined ? excelQuantity : 0,
      });
    });

    return parsedRows;
  };

  // Parse uploaded Excel or CSV file
  const processExcelFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        // First try header-based JSON extraction
        const rawJson = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' });
        if (rawJson.length === 0) {
          showToast?.('El archivo Excel está vacío o no contiene filas.', 'warning');
          return;
        }

        const mapped = mapRawObjectsToRows(rawJson);

        // If header recognition didn't match standard headers, fallback to positional columns
        const hasRecognizedContent = mapped.some((r) => r.code || r.name);
        if (!hasRecognizedContent) {
          const aoa = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1, defval: '' });
          const fallbackRows = parsePositionalRows(aoa);
          setRows(fallbackRows);
          showToast?.(`Se cargaron ${fallbackRows.length} filas del archivo "${file.name}"`, 'success');
        } else {
          setRows(mapped);
          showToast?.(`Se cargaron ${mapped.length} filas desde "${file.name}"`, 'success');
        }
      } catch (err: any) {
        console.error('Error leyendo Excel:', err);
        showToast?.('No se pudo leer el archivo Excel. Verifica que sea .xlsx, .xls o .csv', 'error');
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Fallback or Paste positional parser (supports header row OR direct positional columns)
  const parsePositionalRows = (matrix: any[][]): BulkImportRow[] => {
    const cleanMatrix = matrix
      .map((row) => row.map((cell) => (cell !== null && cell !== undefined ? String(cell).trim() : '')))
      .filter((row) => row.some((cell) => cell !== ''));

    if (cleanMatrix.length === 0) return [];

    // Check if first row looks like headers
    const firstRowNormalized = cleanMatrix[0].map(normalizeHeader);
    const headerKeywords = [
      'codigo', 'sku', 'nombre', 'producto', 'articulo', 'categoria',
      'talla', 'proveedor', 'costo', 'precio', 'stock', 'cantidad', 'existencia'
    ];
    const isFirstRowHeader = firstRowNormalized.some((h) => headerKeywords.includes(h));

    if (isFirstRowHeader && cleanMatrix.length > 1) {
      const headers = cleanMatrix[0];
      const objects = cleanMatrix.slice(1).map((rowCells) => {
        const obj: Record<string, any> = {};
        headers.forEach((h, i) => {
          obj[h || `col_${i}`] = rowCells[i] ?? '';
        });
        return obj;
      });
      return mapRawObjectsToRows(objects);
    }

    // Positional mapping when user copies cells without headers:
    // Supports:
    // - 2 cols: Codigo | Stock
    // - 3 cols: Codigo | Precio | Stock  OR  Codigo | Nombre | Stock
    // - 4 cols: Codigo | Nombre | Precio | Stock
    // - 5+ cols: Codigo | Nombre | Categoria | Talla | Proveedor | Costo | Precio | Stock
    return cleanMatrix.map((cols, idx) => {
      const code = cols[0] || '';
      const existing = code ? inventoryByCode.get(code.toLowerCase()) : undefined;

      if (cols.length === 2) {
        return {
          rowId: `paste_${Date.now()}_${idx}`,
          code,
          name: existing?.name || '',
          category: existing?.category || 'Calzado',
          size: existing?.size || '',
          supplier: existing?.supplier || (suppliers[0]?.name || ''),
          cost: existing?.cost ?? 0,
          price: existing?.price ?? 0,
          excelQuantity: Math.round(parseCleanNumber(cols[1], 0)),
        };
      }

      if (cols.length === 3) {
        const secondIsNumber = !Number.isNaN(Number(cols[1].replace(/[L$,\s]/g, ''))) && existing;
        return {
          rowId: `paste_${Date.now()}_${idx}`,
          code,
          name: secondIsNumber ? existing.name : (cols[1] || existing?.name || ''),
          category: existing?.category || 'Calzado',
          size: existing?.size || '',
          supplier: existing?.supplier || (suppliers[0]?.name || ''),
          cost: existing?.cost ?? 0,
          price: secondIsNumber ? parseCleanNumber(cols[1], existing?.price ?? 0) : (existing?.price ?? 0),
          excelQuantity: Math.round(parseCleanNumber(cols[2], 0)),
        };
      }

      if (cols.length === 4) {
        return {
          rowId: `paste_${Date.now()}_${idx}`,
          code,
          name: cols[1] || existing?.name || '',
          category: existing?.category || 'Calzado',
          size: existing?.size || '',
          supplier: existing?.supplier || (suppliers[0]?.name || ''),
          cost: existing?.cost ?? 0,
          price: parseCleanNumber(cols[2], existing?.price ?? 0),
          excelQuantity: Math.round(parseCleanNumber(cols[3], 0)),
        };
      }

      return {
        rowId: `paste_${Date.now()}_${idx}`,
        code,
        name: cols[1] || existing?.name || '',
        category: cols[2] || existing?.category || 'Calzado',
        size: cols[3] || existing?.size || '',
        supplier: cols[4] || existing?.supplier || (suppliers[0]?.name || ''),
        cost: parseCleanNumber(cols[5], existing?.cost ?? 0),
        price: parseCleanNumber(cols[6], existing?.price ?? 0),
        excelQuantity: Math.round(parseCleanNumber(cols[7] ?? cols[cols.length - 1], 0)),
      };
    });
  };

  // Parse pasted text from Excel / Google Sheets
  const handleProcessPaste = (rawText?: string) => {
    const textToParse = rawText !== undefined ? rawText : pasteText;
    if (!textToParse.trim()) {
      showToast?.('Pega primero las celdas copiadas desde tu hoja de Excel', 'warning');
      return;
    }

    const lines = textToParse
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      .split('\n')
      .filter((line) => line.trim() !== '');

    const matrix = lines.map((line) => {
      if (line.includes('\t')) return line.split('\t');
      if (line.includes(';')) return line.split(';');
      return line.split(',');
    });

    const parsed = parsePositionalRows(matrix);
    if (parsed.length === 0) {
      showToast?.('No se detectaron filas válidas en el texto pegado.', 'warning');
      return;
    }

    setRows((prev) => [...prev, ...parsed]);
    setPasteText('');
    showToast?.(`${parsed.length} filas agregadas a la tabla de vista previa`, 'success');
  };

  // Row manipulation in Live Editor
  const handleUpdateRow = (rowId: string, field: keyof BulkImportRow, value: any) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.rowId !== rowId) return row;
        const updated = { ...row, [field]: value };

        // If user typed a code that matches an existing product and name is still empty, auto-fill from inventory
        if (field === 'code') {
          const found = inventoryByCode.get(String(value || '').trim().toLowerCase());
          if (found) {
            if (!updated.name) updated.name = found.name;
            if (!updated.size && found.size) updated.size = found.size;
            if (!updated.supplier && found.supplier) updated.supplier = found.supplier;
            if (!updated.cost && found.cost) updated.cost = found.cost;
            if (!updated.price && found.price) updated.price = found.price;
            if (found.category) updated.category = found.category;
          }
        }
        return updated;
      })
    );
  };

  const handleDeleteRow = (rowId: string) => {
    setRows((prev) => prev.filter((r) => r.rowId !== rowId));
  };

  const handleAddEmptyRow = () => {
    setRows((prev) => [
      ...prev,
      {
        rowId: `manual_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        code: '',
        name: '',
        category: 'Calzado',
        size: '',
        supplier: suppliers[0]?.name || '',
        cost: 0,
        price: 0,
        excelQuantity: 1,
      },
    ]);
  };

  const handleAutoGenerateMissingCodes = () => {
    let generated = 0;
    setRows((prev) =>
      prev.map((row, index) => {
        if (row.code.trim()) return row;
        generated++;
        const prefix = (row.category || 'ART').substring(0, 3).toUpperCase();
        const rand = Math.floor(100 + Math.random() * 900);
        return {
          ...row,
          code: `${prefix}-${String(inventory.length + index + 1).padStart(2, '0')}-${rand}`,
        };
      })
    );
    if (generated > 0) {
      showToast?.(`Se generaron códigos automáticos para ${generated} filas`, 'info');
    }
  };

  // Enrich rows with status (existing vs new vs invalid)
  const enrichedRows = useMemo(() => {
    return rows.map((row) => {
      const cleanCode = row.code.trim();
      const existing = cleanCode ? inventoryByCode.get(cleanCode.toLowerCase()) : undefined;
      const currentStock = existing ? Number(existing.stock) || 0 : 0;
      const qty = Number(row.excelQuantity) || 0;
      const finalStock = existing
        ? stockMode === 'add'
          ? Math.max(0, currentStock + qty)
          : Math.max(0, qty)
        : Math.max(0, qty);

      const isValid = Boolean(cleanCode && row.name.trim());

      return {
        ...row,
        existing,
        isExisting: Boolean(existing),
        currentStock,
        finalStock,
        isValid,
      };
    });
  }, [rows, inventoryByCode, stockMode]);

  const stats = useMemo(() => {
    const validRows = enrichedRows.filter((r) => r.isValid);
    const newCount = validRows.filter((r) => !r.isExisting).length;
    const existingCount = validRows.filter((r) => r.isExisting).length;
    const invalidCount = enrichedRows.filter((r) => !r.isValid).length;
    const totalUnits = validRows.reduce((acc, r) => acc + (Number(r.excelQuantity) || 0), 0);
    return {
      total: enrichedRows.length,
      validCount: validRows.length,
      newCount,
      existingCount,
      invalidCount,
      totalUnits,
    };
  }, [enrichedRows]);

  const filteredPreviewRows = useMemo(() => {
    const q = searchPreview.trim().toLowerCase();
    return enrichedRows.filter((r) => {
      if (filterPreview === 'new' && (r.isExisting || !r.isValid)) return false;
      if (filterPreview === 'existing' && (!r.isExisting || !r.isValid)) return false;
      if (filterPreview === 'invalid' && r.isValid) return false;
      if (q) {
        return (
          r.code.toLowerCase().includes(q) ||
          r.name.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q) ||
          r.supplier.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [enrichedRows, filterPreview, searchPreview]);

  // Final save handler -> Consolidates duplicate codes in the sheet & commits to Firestore
  const handleConfirmSave = async () => {
    const validRows = enrichedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      showToast?.('No hay filas completas para importar. Asegúrate de que tengan Código y Nombre.', 'warning');
      return;
    }

    setIsSaving(true);
    try {
      // Consolidate in case the same SKU appears multiple times in the Excel sheet
      const consolidatedMap = new Map<string, Product>();
      const createdCodes = new Set<string>();
      const updatedCodes = new Set<string>();

      validRows.forEach((row) => {
        const key = row.code.trim().toLowerCase();
        const existingInDb = inventoryByCode.get(key);
        const alreadyInBatch = consolidatedMap.get(key);

        if (alreadyInBatch) {
          // If same SKU appears twice in the Excel file, accumulate or overwrite
          const nextStock =
            stockMode === 'add'
              ? alreadyInBatch.stock + (Number(row.excelQuantity) || 0)
              : Number(row.excelQuantity) || 0;

          consolidatedMap.set(key, {
            ...alreadyInBatch,
            name: row.name.trim() || alreadyInBatch.name,
            category: row.category.trim() || alreadyInBatch.category,
            size: row.size.trim() || alreadyInBatch.size,
            supplier: row.supplier.trim() || alreadyInBatch.supplier,
            cost: Number(row.cost) >= 0 ? Number(row.cost) : alreadyInBatch.cost,
            price: Number(row.price) > 0 ? Number(row.price) : alreadyInBatch.price,
            stock: Math.max(0, Math.round(nextStock)),
          });
        } else if (existingInDb) {
          updatedCodes.add(key);
          const baseStock = Number(existingInDb.stock) || 0;
          const nextStock =
            stockMode === 'add'
              ? baseStock + (Number(row.excelQuantity) || 0)
              : Number(row.excelQuantity) || 0;

          consolidatedMap.set(key, {
            id: existingInDb.id || row.code.trim(),
            code: existingInDb.code, // preserve original casing
            name: row.name.trim() || existingInDb.name,
            category: row.category.trim() || existingInDb.category || 'Calzado',
            size: row.size.trim() !== '' ? row.size.trim() : (existingInDb.size || ''),
            supplier: row.supplier.trim() !== '' ? row.supplier.trim() : (existingInDb.supplier || ''),
            cost: Number(row.cost) > 0 ? Number(row.cost) : existingInDb.cost,
            price: Number(row.price) > 0 ? Number(row.price) : existingInDb.price,
            stock: Math.max(0, Math.round(nextStock)),
            img: existingInDb.img || '',
          });
        } else {
          createdCodes.add(key);
          consolidatedMap.set(key, {
            id: row.code.trim(),
            code: row.code.trim(),
            name: row.name.trim(),
            category: row.category.trim() || 'Calzado',
            size: row.size.trim(),
            supplier: row.supplier.trim(),
            cost: Math.max(0, Number(row.cost) || 0),
            price: Math.max(0, Number(row.price) || 0),
            stock: Math.max(0, Math.round(Number(row.excelQuantity) || 0)),
            img: '',
          });
        }
      });

      // Detect any new supplier names that aren't in suppliers list yet
      const existingSupplierNames = new Set(
        suppliers.map((s) => s.name.trim().toLowerCase())
      );
      const newSuppliersToCreate: Supplier[] = [];

      consolidatedMap.forEach((prod) => {
        const supName = (prod.supplier || '').trim();
        if (supName && !existingSupplierNames.has(supName.toLowerCase())) {
          existingSupplierNames.add(supName.toLowerCase());
          newSuppliersToCreate.push({
            id: `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            name: supName,
          });
        }
      });

      const finalProducts = Array.from(consolidatedMap.values());

      await onConfirmBulkImport(finalProducts, newSuppliersToCreate, {
        createdCount: createdCodes.size,
        updatedCount: updatedCodes.size,
        totalUnitsProcessed: stats.totalUnits,
        mode: stockMode,
      });

      setRows([]);
      setFileName('');
      setPasteText('');
      onClose();
    } catch (err: any) {
      console.error('Error en importación masiva:', err);
      showToast?.('Error al guardar el lote en Firebase: ' + (err?.message || 'desconocido'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-6xl shadow-2xl border border-slate-200 flex flex-col max-h-[94vh] overflow-hidden">
        {/* Top Modal Header */}
        <div className="px-4 sm:px-6 py-4 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-extrabold tracking-tight truncate">
                Carga Masiva de Inventario y Stock (Excel)
              </h2>
              <p className="text-xs text-slate-300 truncate">
                Sube tu plantilla .xlsx/.csv o pega celdas directamente desde Excel con vista previa editable
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs (Opción 1: Subir Archivo Excel | Opción 2: Copiar y Pegar) + Stock Action Selector */}
        <div className="px-4 sm:px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 shrink-0">
          {/* Option 1 & Option 2 Tabs */}
          <div className="grid grid-cols-2 sm:inline-flex bg-slate-200/80 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('file')}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'file'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>1. Subir Archivo Excel</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`px-3.5 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                activeTab === 'paste'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-4 h-4 text-blue-600 shrink-0" />
              <span>2. Copiar y Pegar de Excel</span>
            </button>
          </div>

          {/* Stock Calculation Mode Selector */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Si el código ya existe:
            </span>
            <div className="inline-flex bg-slate-200/80 p-1 rounded-xl gap-1">
              <button
                type="button"
                onClick={() => setStockMode('add')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  stockMode === 'add'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Suma la cantidad del Excel al stock que ya tienes en tienda"
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Sumar al Stock Actual (+Stock)</span>
              </button>

              <button
                type="button"
                onClick={() => setStockMode('replace')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                  stockMode === 'replace'
                    ? 'bg-amber-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Reemplaza el stock actual por el número exacto que venga en el Excel"
              >
                <Replace className="w-3.5 h-3.5 shrink-0" />
                <span>Reemplazar Stock (=Stock)</span>
              </button>
            </div>
          </div>
        </div>

        {/* Main Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* TAB 1: UPLOAD EXCEL FILE + DOWNLOAD TEMPLATE */}
          {activeTab === 'file' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Left: Drag & Drop Excel File Zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) processExcelFile(droppedFile);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`lg:col-span-7 border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-emerald-500 bg-emerald-50/70'
                    : 'border-slate-300 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) processExcelFile(file);
                    e.target.value = '';
                  }}
                />
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 shadow-2xs">
                  <Upload className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-800">
                  {fileName
                    ? `Archivo cargado: ${fileName}`
                    : 'Haz clic aquí o arrastra tu archivo de Excel (.xlsx, .xls, .csv)'}
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-md">
                  Detecta automáticamente las columnas: <strong className="text-slate-700">Código, Nombre, Categoría, Talla, Proveedor, Costo, Precio y Stock</strong>.
                </p>
                <span className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold shadow-xs hover:bg-emerald-700 transition-colors">
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Seleccionar Archivo Excel</span>
                </span>
              </div>

              {/* Right: Template Download & Export Helpers */}
              <div className="lg:col-span-5 bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col justify-between space-y-3">
                <div>
                  <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Download className="w-4 h-4 text-emerald-600" />
                    <span>Plantillas Oficiales de Excel</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Descarga la plantilla vacía con ejemplos o descarga tu inventario actual para actualizar cantidades y precios en Excel.
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={handleDownloadTemplate}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-white hover:bg-emerald-50 text-slate-800 border border-slate-200 hover:border-emerald-300 text-xs font-bold flex items-center justify-between transition-all cursor-pointer shadow-2xs"
                  >
                    <span className="flex items-center gap-2">
                      <FileDown className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Descargar Plantilla de Ejemplo (.xlsx)</span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCurrentInventory}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-white hover:bg-blue-50 text-slate-800 border border-slate-200 hover:border-blue-300 text-xs font-bold flex items-center justify-between transition-all cursor-pointer shadow-2xs"
                  >
                    <span className="flex items-center gap-2">
                      <FileSpreadsheet className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>Exportar mi Inventario Actual (.xlsx)</span>
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: COPY & PASTE DIRECTLY FROM EXCEL */}
          {activeTab === 'paste' && (
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <ClipboardPaste className="w-4 h-4 text-blue-600" />
                    <span>Pega tus celdas directamente desde Excel o Google Sheets</span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Selecciona las filas en Excel (<kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px] font-mono">Ctrl + C</kbd>) y pégalas abajo (<kbd className="px-1.5 py-0.5 bg-white border rounded text-[11px] font-mono">Ctrl + V</kbd>). Puedes pegar con o sin encabezados.
                  </p>
                </div>

                <div className="text-[11px] bg-blue-50 text-blue-800 border border-blue-200 px-3 py-1.5 rounded-xl font-medium">
                  Orden sugerido: <strong>Código | Nombre | Categoría | Talla | Proveedor | Costo | Precio | Stock</strong>
                </div>
              </div>

              <textarea
                rows={4}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                onPaste={(e) => {
                  const clipText = e.clipboardData?.getData('text');
                  if (clipText && clipText.includes('\t')) {
                    e.preventDefault();
                    handleProcessPaste(clipText);
                  }
                }}
                placeholder={`Ejemplo pegando desde Excel:\nCAL-01-101\tTenis Deportivo Nike\tCalzado\t40\tDistribuidora Central\t650\t1200\t10\nCAL-01-102\tSandalia Dama Cuero\tCalzado\t37\tDistribuidora Central\t320\t650\t6`}
                className="w-full p-3 rounded-xl border border-slate-300 bg-white text-xs sm:text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none"
              />

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>También acepta formato rápido de 2 columnas (<strong>Código | Cantidad</strong>) para productos existentes.</span>
                </span>

                <button
                  type="button"
                  onClick={() => handleProcessPaste()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                >
                  <Plus className="w-4 h-4" />
                  <span>Procesar Texto Pegado</span>
                </button>
              </div>
            </div>
          )}

          {/* PREVIEW & LIVE EDITOR SECTION */}
          <div className="space-y-3">
            {/* Summary Bar & Quick Actions */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFilterPreview('all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    filterPreview === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Todas ({stats.total})
                </button>

                <button
                  type="button"
                  onClick={() => setFilterPreview('new')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    filterPreview === 'new'
                      ? 'bg-blue-600 text-white'
                      : 'bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Nuevos ({stats.newCount})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFilterPreview('existing')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    filterPreview === 'existing'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Ya existen ({stats.existingCount})</span>
                </button>

                {stats.invalidCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilterPreview('invalid')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                      filterPreview === 'invalid'
                        ? 'bg-amber-600 text-white'
                        : 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Incompletos ({stats.invalidCount})</span>
                  </button>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {rows.length > 0 && (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                    <input
                      type="text"
                      value={searchPreview}
                      onChange={(e) => setSearchPreview(e.target.value)}
                      placeholder="Filtrar en vista previa..."
                      className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl outline-none focus:border-emerald-500 w-44"
                    />
                  </div>
                )}

                {stats.invalidCount > 0 && (
                  <button
                    type="button"
                    onClick={handleAutoGenerateMissingCodes}
                    className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Genera un código SKU automático a las filas que no tengan código"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-700" />
                    <span>Generar Códigos Faltantes</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddEmptyRow}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar Fila</span>
                </button>

                {rows.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRows([]);
                      setFileName('');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Limpiar Tabla</span>
                  </button>
                )}
              </div>
            </div>

            {/* Editable Preview Table */}
            {rows.length === 0 ? (
              <div className="border border-slate-200 rounded-2xl bg-slate-50/50 p-10 text-center space-y-2">
                <FileSpreadsheet className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-600">
                  La tabla de vista previa está vacía
                </p>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Sube un archivo Excel arriba, pega celdas desde tu hoja de cálculo o haz clic en "Agregar Fila" para comenzar a editar en vivo.
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white shadow-2xs">
                <div className="overflow-x-auto max-h-[38vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-slate-100 text-slate-600 uppercase text-[10px] font-extrabold tracking-wider border-b border-slate-200 z-10">
                      <tr>
                        <th className="py-2.5 px-3">Estado</th>
                        <th className="py-2.5 px-2 min-w-[130px]">Código / SKU *</th>
                        <th className="py-2.5 px-2 min-w-[200px]">Nombre del Artículo *</th>
                        <th className="py-2.5 px-2 min-w-[115px]">Categoría</th>
                        <th className="py-2.5 px-2 w-20">Talla</th>
                        <th className="py-2.5 px-2 min-w-[135px]">Proveedor</th>
                        <th className="py-2.5 px-2 w-24 text-right">Costo (L)</th>
                        <th className="py-2.5 px-2 w-24 text-right">Precio (L)</th>
                        <th className="py-2.5 px-2 w-24 text-center">
                          {stockMode === 'add' ? 'Cant. a Sumar' : 'Nuevo Stock'}
                        </th>
                        <th className="py-2.5 px-3 text-center">Stock Final</th>
                        <th className="py-2.5 px-2 text-center w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPreviewRows.map((row) => (
                        <tr
                          key={row.rowId}
                          className={`transition-colors ${
                            !row.isValid
                              ? 'bg-amber-50/60'
                              : row.isExisting
                              ? 'hover:bg-emerald-50/30'
                              : 'hover:bg-blue-50/30'
                          }`}
                        >
                          {/* Status Badge */}
                          <td className="py-2 px-3 whitespace-nowrap">
                            {!row.isValid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px]">
                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                Falta código/nombre
                              </span>
                            ) : row.isExisting ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                <CheckCircle2 className="w-3 h-3 shrink-0" />
                                Existe (Actual: {row.currentStock})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-800 font-bold text-[10px]">
                                <Sparkles className="w-3 h-3 shrink-0" />
                                Nuevo
                              </span>
                            )}
                          </td>

                          {/* Code */}
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.code}
                              onChange={(e) => handleUpdateRow(row.rowId, 'code', e.target.value)}
                              placeholder="SKU-001"
                              className={`w-full px-2 py-1.5 rounded-lg border font-mono text-xs outline-none ${
                                !row.code.trim()
                                  ? 'border-amber-400 bg-white'
                                  : 'border-slate-200 focus:border-emerald-500 bg-white'
                              }`}
                            />
                          </td>

                          {/* Name */}
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.name}
                              onChange={(e) => handleUpdateRow(row.rowId, 'name', e.target.value)}
                              placeholder="Nombre del producto..."
                              className={`w-full px-2 py-1.5 rounded-lg border text-xs outline-none ${
                                !row.name.trim()
                                  ? 'border-amber-400 bg-white'
                                  : 'border-slate-200 focus:border-emerald-500 bg-white'
                              }`}
                            />
                          </td>

                          {/* Category */}
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.category}
                              onChange={(e) => handleUpdateRow(row.rowId, 'category', e.target.value)}
                              placeholder="Calzado"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:border-emerald-500 bg-white text-xs outline-none"
                            />
                          </td>

                          {/* Size */}
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.size}
                              onChange={(e) => handleUpdateRow(row.rowId, 'size', e.target.value)}
                              placeholder="Ej. 40"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:border-emerald-500 bg-white text-xs outline-none text-center"
                            />
                          </td>

                          {/* Supplier */}
                          <td className="py-1.5 px-2">
                            <input
                              type="text"
                              value={row.supplier}
                              onChange={(e) => handleUpdateRow(row.rowId, 'supplier', e.target.value)}
                              placeholder="Proveedor"
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:border-emerald-500 bg-white text-xs outline-none"
                            />
                          </td>

                          {/* Cost */}
                          <td className="py-1.5 px-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.cost}
                              onChange={(e) =>
                                handleUpdateRow(row.rowId, 'cost', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:border-emerald-500 bg-white text-xs outline-none text-right"
                            />
                          </td>

                          {/* Price */}
                          <td className="py-1.5 px-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={row.price}
                              onChange={(e) =>
                                handleUpdateRow(row.rowId, 'price', parseFloat(e.target.value) || 0)
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 focus:border-emerald-500 bg-white text-xs font-bold text-emerald-800 outline-none text-right"
                            />
                          </td>

                          {/* Excel Quantity */}
                          <td className="py-1.5 px-2">
                            <input
                              type="number"
                              value={row.excelQuantity}
                              onChange={(e) =>
                                handleUpdateRow(
                                  row.rowId,
                                  'excelQuantity',
                                  parseInt(e.target.value, 10) || 0
                                )
                              }
                              className="w-full px-2 py-1.5 rounded-lg border border-emerald-300 focus:border-emerald-600 bg-emerald-50/40 text-xs font-extrabold text-slate-900 outline-none text-center"
                            />
                          </td>

                          {/* Calculated Final Stock */}
                          <td className="py-2 px-3 text-center whitespace-nowrap">
                            {row.isExisting ? (
                              <div className="inline-flex items-center gap-1 font-mono text-xs">
                                <span className="text-slate-400">{row.currentStock}</span>
                                <ArrowRight className="w-3 h-3 text-slate-400" />
                                <span className="font-extrabold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-md">
                                  {row.finalStock}
                                </span>
                              </div>
                            ) : (
                              <span className="font-extrabold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-md font-mono">
                                {row.finalStock}
                              </span>
                            )}
                          </td>

                          {/* Delete row */}
                          <td className="py-1.5 px-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(row.rowId)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Quitar esta fila"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Bottom Footer with Summary & Confirm Action */}
        <div className="px-4 sm:px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
            <span>
              Listos para procesar: <strong className="text-slate-900">{stats.validCount} artículos</strong>
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-blue-700 font-semibold">
              {stats.newCount} nuevos
            </span>
            <span className="text-slate-300">·</span>
            <span className="text-emerald-700 font-semibold">
              {stats.existingCount} actualizaciones ({stockMode === 'add' ? 'sumando stock' : 'reemplazando stock'})
            </span>
          </div>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs sm:text-sm font-bold transition-colors cursor-pointer"
            >
              Cancelar
            </button>

            <button
              type="button"
              disabled={isSaving || stats.validCount === 0}
              onClick={handleConfirmSave}
              className="flex-1 sm:flex-initial px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs sm:text-sm font-extrabold shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Sincronizando con Firebase...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    Confirmar y Subir {stats.validCount > 0 ? `(${stats.validCount})` : ''}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
