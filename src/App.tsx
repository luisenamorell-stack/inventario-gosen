import React, { useState, useEffect } from 'react';
import { Product, Supplier, AuditHistoryRecord, ActiveTab, ToastMessage, StoreSettings } from './types';
import { INITIAL_INVENTORY, INITIAL_SUPPLIERS, INITIAL_AUDIT_HISTORY } from './data/mockData';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { AuditView } from './components/AuditView';
import { PriceCheckerTab } from './components/PriceCheckerTab';
import { SuppliersView } from './components/SuppliersView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { ToastContainer } from './components/ToastContainer';
import { LoginView } from './components/LoginView';
import {
  subscribeToInventory,
  subscribeToSuppliers,
  subscribeToAuditHistory,
  subscribeToStoreSettings,
  saveStoreSettingsToFirestore,
  DEFAULT_STORE_SETTINGS,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveSupplierToFirestore,
  deleteSupplierFromFirestore,
  applyAuditChangesToFirestore,
  seedInitialDataIfEmpty,
  pingFirestore
} from './firebase/firestoreService';
import { Database, Wifi, WifiOff, RefreshCw, CheckCircle2, Clock, Store, Menu, PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';

export const App: React.FC = () => {
  // Application State
  const [inventory, setInventory] = useState<Product[]>(INITIAL_INVENTORY);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [auditHistory, setAuditHistory] = useState<AuditHistoryRecord[]>(INITIAL_AUDIT_HISTORY);

  // Store Branding & Profile State (with instant local cache fallback)
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    try {
      const cached = localStorage.getItem('stockmaster_store_settings');
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_STORE_SETTINGS;
  });
  
  // Real-time Connection State
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Authentication State (Simple Password: GOSEN2026)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const localAuth = localStorage.getItem('stockmaster_authenticated');
      const sessionAuth = sessionStorage.getItem('stockmaster_authenticated');
      return localAuth === 'true' || sessionAuth === 'true';
    } catch {
      return false;
    }
  });

  const handleLoginSuccess = (remember: boolean) => {
    setIsAuthenticated(true);
    try {
      if (remember) {
        localStorage.setItem('stockmaster_authenticated', 'true');
      } else {
        sessionStorage.setItem('stockmaster_authenticated', 'true');
      }
    } catch {}
    showToast('¡Bienvenido al sistema!', 'success');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('stockmaster_authenticated');
      sessionStorage.removeItem('stockmaster_authenticated');
    } catch {}
    showToast('Sesión cerrada correctamente', 'info');
  };

  // Sidebar Collapsible and Mobile Drawer State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('stockmaster_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const toggleSidebarCollapse = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('stockmaster_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // Close mobile drawer on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  // Synchronize document title with configured store name
  useEffect(() => {
    document.title = `${storeSettings.storeName || 'StockMaster'} - Control de Inventario y Auditoría`;
  }, [storeSettings.storeName]);

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

  // Immediate Real-Time Subscriptions to Firestore on mount
  useEffect(() => {
    setIsConnecting(true);

    // 1. Subscribe to real-time inventory
    const unsubscribeInv = subscribeToInventory(
      (items) => {
        setInventory(items);
        setIsFirebaseConnected(true);
        setIsConnecting(false);
        setLastSyncTime(new Date());
        setIsSyncing(true);
        setTimeout(() => setIsSyncing(false), 600);
      },
      (err) => {
        console.error('Inventory real-time error:', err);
        setIsFirebaseConnected(false);
        setIsConnecting(false);
      }
    );

    // 2. Subscribe to real-time suppliers
    const unsubscribeSup = subscribeToSuppliers(
      (sups) => {
        setSuppliers(sups);
        setIsFirebaseConnected(true);
        setLastSyncTime(new Date());
      },
      (err) => {
        console.error('Suppliers real-time error:', err);
      }
    );

    // 3. Subscribe to real-time audit history
    const unsubscribeAudit = subscribeToAuditHistory(
      (records) => {
        setAuditHistory(records);
        setIsFirebaseConnected(true);
        setLastSyncTime(new Date());
      },
      (err) => {
        console.error('Audit history real-time error:', err);
      }
    );

    // 4. Subscribe to real-time store settings (branding, name, logo)
    const unsubscribeSettings = subscribeToStoreSettings(
      (settings) => {
        setStoreSettings(settings);
        try {
          localStorage.setItem('stockmaster_store_settings', JSON.stringify(settings));
        } catch {}
      },
      (err) => {
        console.warn('Store settings real-time subscription error:', err);
      }
    );

    // 5. Background seed check if database is entirely empty
    seedInitialDataIfEmpty().catch((err) => {
      console.warn('Initial seed check error:', err);
    });

    return () => {
      unsubscribeInv();
      unsubscribeSup();
      unsubscribeAudit();
      unsubscribeSettings();
    };
  }, []);

  // Save Store Settings to Firestore & Local Storage
  const handleSaveStoreSettings = async (newSettings: StoreSettings) => {
    setIsSyncing(true);
    setStoreSettings(newSettings);
    try {
      localStorage.setItem('stockmaster_store_settings', JSON.stringify(newSettings));
    } catch {}

    try {
      await saveStoreSettingsToFirestore(newSettings);
      setLastSyncTime(new Date());
    } finally {
      setIsSyncing(false);
    }
  };

  // Ping Firestore to test live latency & round-trip connection
  const handleTestConnection = async () => {
    setIsPinging(true);
    try {
      const result = await pingFirestore();
      if (result.ok) {
        setPingLatency(result.latencyMs);
        setIsFirebaseConnected(true);
        setLastSyncTime(new Date());
        showToast(`Conexión en tiempo real con Firestore activa (${result.latencyMs}ms)`, 'success');
      } else {
        setIsFirebaseConnected(false);
        showToast(`Error al conectar con Firestore: ${result.error || 'Desconocido'}`, 'error');
      }
    } catch (e: any) {
      setIsFirebaseConnected(false);
      showToast(`Fallo de conexión: ${e?.message || e}`, 'error');
    } finally {
      setIsPinging(false);
    }
  };

  // Inventory Handlers
  const handleSaveProduct = async (product: Product, oldCode?: string) => {
    setIsSyncing(true);
    try {
      // Optimistic update
      setInventory((prev) => {
        const index = prev.findIndex((p) => p.code.toLowerCase() === (oldCode || product.code).toLowerCase());
        if (index >= 0) {
          const copy = [...prev];
          copy[index] = product;
          return copy;
        }
        return [product, ...prev];
      });

      await saveProductToFirestore(product, oldCode);
      setLastSyncTime(new Date());
      showToast(`"${product.name}" guardado y sincronizado en Firestore`, 'success');
    } catch (err: any) {
      console.error('Error saving product to Firestore:', err);
      showToast('Error al guardar en Firestore: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    setIsSyncing(true);
    try {
      const itemToDelete = inventory.find((p) => p.id === id);
      const code = itemToDelete?.code;

      // Optimistic local state update
      setInventory((prev) => prev.filter((p) => p.id !== id && (code ? p.code !== code : true)));

      // Delete from Firestore
      await deleteProductFromFirestore(id, code);
      setLastSyncTime(new Date());
      showToast('Artículo eliminado de Firestore en tiempo real', 'info');
    } catch (err: any) {
      console.error('Error deleting product from Firestore:', err);
      showToast('Error al eliminar en Firestore: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  // Supplier Handlers
  const handleSaveSupplier = async (supplier: Supplier, oldName?: string) => {
    setIsSyncing(true);
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
      setLastSyncTime(new Date());
      showToast('Proveedor guardado y sincronizado en tiempo real', 'success');
    } catch (err: any) {
      console.error('Error saving supplier to Firestore:', err);
      showToast('Error al guardar proveedor: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const handleDeleteSupplier = async (id: string) => {
    setIsSyncing(true);
    try {
      const supToDelete = suppliers.find((s) => s.id === id);
      setSuppliers((prev) => prev.filter((s) => s.id !== id));
      await deleteSupplierFromFirestore(id, supToDelete?.name);
      setLastSyncTime(new Date());
      showToast('Proveedor eliminado de Firestore', 'info');
    } catch (err: any) {
      console.error('Error deleting supplier from Firestore:', err);
      showToast('Error al eliminar proveedor: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  // Audit Changes
  const handleApplyAuditChanges = async (
    updatedInventory: Product[],
    historyRecord: AuditHistoryRecord
  ) => {
    setIsSyncing(true);
    try {
      setInventory(updatedInventory);
      setAuditHistory((prev) => [...prev, historyRecord]);

      await applyAuditChangesToFirestore(updatedInventory, historyRecord);
      setLastSyncTime(new Date());
      showToast('¡Ajustes de inventario sincronizados en Firestore en tiempo real!', 'success');
    } catch (err: any) {
      console.error('Error applying audit changes to Firestore:', err);
      showToast('Error al sincronizar auditoría en Firestore: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
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
    setIsSyncing(true);
    try {
      await seedInitialDataIfEmpty();
      showToast('Datos iniciales restablecidos en la base de datos', 'info');
    } catch (err: any) {
      showToast('Error al restablecer: ' + err.message, 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 500);
    }
  };

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Conectando...';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  // If not authenticated, show protected login view with password GOSEN2026
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen w-screen overflow-auto bg-slate-950">
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
        <LoginView
          storeSettings={storeSettings}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

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
        storeSettings={storeSettings}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-slate-50 min-w-0 transition-all duration-350 ease-in-out">
        {/* Top Real-time Connection Status Bar */}
        <div className="bg-slate-900 text-slate-300 text-xs px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between border-b border-slate-800 shrink-0 gap-2">
          {/* Left: Menu toggles + Status indicator */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Mobile Drawer Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer border border-slate-700/80 shrink-0"
              aria-label="Abrir menú de navegación"
              title="Abrir menú"
            >
              <Menu className="w-4 h-4 text-emerald-400" />
            </button>

            {/* Desktop Collapse / Expand Toggle Button */}
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="hidden md:inline-flex p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer border border-slate-700/80 shrink-0"
              title={isSidebarCollapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
              aria-label="Alternar barra lateral"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-emerald-400" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-slate-300" />
              )}
            </button>

            <div className="flex items-center gap-2">
              {isConnecting ? (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping"></span>
              ) : isFirebaseConnected ? (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                </span>
              ) : (
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              )}

              <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-400" />
                <span>Firestore en Tiempo Real:</span>
              </span>

              <span className="font-mono bg-slate-800 text-emerald-400 px-2 py-0.5 rounded text-[11px] font-bold border border-slate-700">
                tiendagosenhn
              </span>
            </div>

            {/* Store custom name badge */}
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              title="Haz clic para personalizar el nombre y logo de la tienda"
              className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 hover:border-slate-600 transition-colors cursor-pointer text-[11px] font-semibold"
            >
              <Store className="w-3 h-3 text-emerald-400" />
              <span className="truncate max-w-[140px]">{storeSettings.storeName || 'StockMaster'}</span>
            </button>

            {/* Syncing spinner */}
            {isSyncing && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-700/50 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin text-indigo-400" />
                <span>Sincronizando...</span>
              </span>
            )}
          </div>

          {/* Right: Real-time Metrics & Ping Trigger */}
          <div className="flex items-center gap-3 text-slate-400">
            <div className="hidden lg:flex items-center gap-3 text-[11px]">
              <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50 text-slate-300">
                <strong className="text-white">{inventory.length}</strong> artículos
              </span>
              <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50 text-slate-300">
                <strong className="text-white">{suppliers.length}</strong> proveedores
              </span>
              <span className="bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700/50 text-slate-300">
                <strong className="text-white">{auditHistory.length}</strong> auditorías
              </span>
            </div>

            {lastSyncTime && (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-slate-400">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>Sync: {formatLastSync(lastSyncTime)}</span>
                {pingLatency !== null && <span className="text-emerald-400 font-mono">({pingLatency}ms)</span>}
              </span>
            )}

            <button
              onClick={handleTestConnection}
              disabled={isPinging}
              title="Probar y verificar conexión en tiempo real con Firestore"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors text-[11px] font-medium border border-slate-700 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 text-indigo-400 ${isPinging ? 'animate-spin' : ''}`} />
              <span>{isPinging ? 'Probando...' : 'Probar Conexión'}</span>
            </button>

            {/* Logout button */}
            <button
              onClick={handleLogout}
              title="Cerrar sesión del sistema"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 transition-colors text-[11px] font-medium border border-rose-800/60 cursor-pointer"
            >
              <LogOut className="w-3 h-3 text-rose-400" />
              <span className="hidden sm:inline">Cerrar Sesión</span>
            </button>
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
            showToast={showToast}
          />
        )}

        {activeTab === 'audit' && (
          <AuditView
            inventory={inventory}
            onApplyAuditChanges={handleApplyAuditChanges}
            showToast={showToast}
            storeSettings={storeSettings}
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

        {activeTab === 'settings' && (
          <StoreSettingsView
            currentSettings={storeSettings}
            onSaveSettings={handleSaveStoreSettings}
            showToast={showToast}
            isFirebaseConnected={isFirebaseConnected}
          />
        )}
      </main>

      {/* Confirmation Dialog for Data Reset */}
      <ConfirmDialog
        isOpen={showResetConfirm}
        title="¿Restablecer datos de prueba?"
        message="Se recargarán los artículos y proveedores de demostración en la base de datos de Firebase Firestore en tiempo real."
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
