import React, { useState, useEffect } from 'react';
import { Product, Supplier, AuditHistoryRecord, ActiveTab, ToastMessage } from './types';
import { INITIAL_INVENTORY, INITIAL_SUPPLIERS, INITIAL_AUDIT_HISTORY } from './data/mockData';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { AuditView } from './components/AuditView';
import { PriceCheckerTab } from './components/PriceCheckerTab';
import { SuppliersView } from './components/SuppliersView';
import { ToastContainer } from './components/ToastContainer';
import {
  subscribeToInventory,
  subscribeToSuppliers,
  subscribeToAuditHistory,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveSupplierToFirestore,
  deleteSupplierFromFirestore,
  applyAuditChangesToFirestore,
  seedInitialDataIfEmpty
} from './firebase/firestoreService';
import { Cloud, Database } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';

export const App: React.FC = () => {
  // Application State
  const [inventory, setInventory] = useState<Product[]>(INITIAL_INVENTORY);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [auditHistory, setAuditHistory] = useState<AuditHistoryRecord[]>(INITIAL_AUDIT_HISTORY);
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);

  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Navigation helpers
  const [inventorySearchQuery, setInventorySearchQuery] = useState('');
  const [openProductModalTrigger, setOpenProductModalTrigger] = useState(false);
  const [openSupplierModalTrigger, setOpenSupplierModalTrigger] = useState(false);

  // Toast Notification System
  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const id = Date.now().toString() + Math.random().toString();
    const newToast: ToastMessage = { id, message, type };
    setToasts((prev) => [...prev, newToast]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Connect to Firestore on mount
  useEffect(() => {
    let unsubscribeInv: (() => void) | undefined;
    let unsubscribeSup: (() => void) | undefined;
    let unsubscribeAudit: (() => void) | undefined;

    const setupFirebase = async () => {
      try {
        await seedInitialDataIfEmpty();

        unsubscribeInv = subscribeToInventory(
          (items) => {
            if (items.length > 0) {
              setInventory(items);
            }
            setIsFirebaseConnected(true);
          },
          (err) => console.error('Inventory subscription error:', err)
        );

        unsubscribeSup = subscribeToSuppliers(
          (sups) => {
            if (sups.length > 0) {
              setSuppliers(sups);
            }
          },
          (err) => console.error('Suppliers subscription error:', err)
        );

        unsubscribeAudit = subscribeToAuditHistory(
          (records) => {
            setAuditHistory(records);
          },
          (err) => console.error('Audit history subscription error:', err)
        );
      } catch (err) {
        console.error('Firebase initialization error:', err);
      }
    };

    setupFirebase();

    return () => {
      if (unsubscribeInv) unsubscribeInv();
      if (unsubscribeSup) unsubscribeSup();
      if (unsubscribeAudit) unsubscribeAudit();
    };
  }, []);

  // Inventory Handlers
  const handleSaveProduct = async (product: Product) => {
    try {
      // Optimistic update
      setInventory((prev) => {
        const index = prev.findIndex((p) => p.code.toLowerCase() === product.code.toLowerCase());
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = product;
          return copy;
        }
        return [product, ...prev];
      });

      await saveProductToFirestore(product);
      showToast('Artículo guardado en la base de datos (tiendagosenhn)', 'success');
    } catch (err: any) {
      console.error('Error saving product to Firestore:', err);
      showToast('Error al guardar en Firestore: ' + (err.message || 'desconocido'), 'error');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    try {
      const itemToDelete = inventory.find((p) => p.id === id);
      const code = itemToDelete?.code;

      // Optimistic local state update
      setInventory((prev) => prev.filter((p) => p.id !== id && (code ? p.code !== code : true)));

      // Delete from Firestore
      await deleteProductFromFirestore(id, code);
      showToast('Artículo eliminado de la base de datos', 'info');
    } catch (err: any) {
      console.error('Error deleting product from Firestore:', err);
      showToast('Error al eliminar en Firestore: ' + (err.message || 'desconocido'), 'error');
    }
  };

  // Supplier Handlers
  const handleSaveSupplier = async (supplier: Supplier, oldName?: string) => {
    try {
      setSuppliers((prev) => {
        const index = prev.findIndex((s) => s.id === supplier.id);
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = supplier;
          return copy;
        }
        return [...prev, supplier];
      });

      await saveSupplierToFirestore(supplier, oldName, inventory);
      showToast('Proveedor guardado en la base de datos', 'success');
    } catch (err: any) {
      console.error('Error saving supplier to Firestore:', err);
      showToast('Error al guardar proveedor: ' + (err.message || 'desconocido'), 'error');
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    try {
      const supToDelete = suppliers.find((s) => s.id === id);
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      await deleteSupplierFromFirestore(id, supToDelete?.name);
      showToast('Proveedor eliminado de la base de datos', 'info');
    } catch (err: any) {
      console.error('Error deleting supplier from Firestore:', err);
      showToast('Error al eliminar proveedor: ' + (err.message || 'desconocido'), 'error');
    }
  };

  // Audit Changes
  const handleApplyAuditChanges = async (
    updatedInventory: Product[],
    historyRecord: AuditHistoryRecord
  ) => {
    try {
      setInventory(updatedInventory);
      setAuditHistory((prev) => [...prev, historyRecord]);

      await applyAuditChangesToFirestore(updatedInventory, historyRecord);
      showToast('¡Ajustes de inventario sincronizados en Firestore!', 'success');
    } catch (err: any) {
      console.error('Error applying audit changes to Firestore:', err);
      showToast('Error al sincronizar auditoría en Firestore: ' + (err.message || 'desconocido'), 'error');
    }
  };

  // Jump from Dashboard to Inventory filtered
  const handleFilterInventoryByCode = (code: string) => {
    setInventorySearchQuery(code);
    setActiveTab('inventory');
  };

  // Reset / Reseed data
  const handleExecuteReset = async () => {
    setShowResetConfirm(false);
    try {
      await seedInitialDataIfEmpty();
      showToast('Artículos iniciales restablecidos en la base de datos', 'info');
    } catch (err: any) {
      showToast('Error al restablecer: ' + err.message, 'error');
    }
  };

  return (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden text-slate-800 bg-slate-50">
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Main Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          if (tab === 'inventory') setInventorySearchQuery('');
        }}
        onResetData={() => setShowResetConfirm(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50">
        {/* Top Connection Status Bar */}
        <div className="bg-slate-900 text-slate-300 text-xs px-4 py-1.5 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-semibold text-slate-200">Firebase Firestore:</span>
            <span className="font-mono text-emerald-400 font-bold">tiendagosenhn</span>
          </div>
          <div className="flex items-center gap-3 text-slate-400">
            <span className="hidden sm:inline flex items-center gap-1">
              <Database className="w-3 h-3 text-emerald-400" />
              <span>Base de datos en la nube conectada</span>
            </span>
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <DashboardView
            inventory={inventory}
            auditHistory={auditHistory}
            onOpenNewProduct={() => {
              setActiveTab('inventory');
              setOpenProductModalTrigger(true);
            }}
            onStartAudit={() => setActiveTab('audit')}
            onFilterInventoryByCode={handleFilterInventoryByCode}
            onNavigateToAudit={() => setActiveTab('audit')}
          />
        )}

        {activeTab === 'inventory' && (
          <InventoryView
            inventory={inventory}
            suppliers={suppliers}
            initialSearchCode={inventorySearchQuery}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
            onOpenSupplierModal={() => {
              setActiveTab('suppliers');
              setOpenSupplierModalTrigger(true);
            }}
            showModalInitially={openProductModalTrigger}
            onCloseInitialModal={() => setOpenProductModalTrigger(false)}
          />
        )}

        {activeTab === 'audit' && (
          <AuditView
            inventory={inventory}
            onApplyAuditChanges={handleApplyAuditChanges}
            showToast={showToast}
          />
        )}

        {activeTab === 'price-checker' && (
          <PriceCheckerTab inventory={inventory} showToast={showToast} />
        )}

        {activeTab === 'suppliers' && (
          <SuppliersView
            suppliers={suppliers}
            inventory={inventory}
            onSaveSupplier={handleSaveSupplier}
            onDeleteSupplier={handleDeleteSupplier}
            showModalInitially={openSupplierModalTrigger}
            onCloseInitialModal={() => setOpenSupplierModalTrigger(false)}
          />
        )}
      </main>

      {/* Confirmation Dialog for Data Reset */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="¿Restablecer datos de prueba?"
        message="Se recargarán los artículos y proveedores de demostración en la base de datos de Firebase Firestore."
        confirmLabel="Sí, Restablecer"
        cancelLabel="Cancelar"
        isDestructive={false}
        onConfirm={handleExecuteReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
};

export default App;
