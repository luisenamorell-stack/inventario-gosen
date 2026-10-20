import React, { useState, useEffect } from 'react';
import {
  Product,
  Supplier,
  AuditHistoryRecord,
  ActiveTab,
  ToastMessage,
  StoreSettings,
  SaleRecord,
  PurchaseInvoice,
  UserAccount,
  ActivityLogRecord,
  UserSession
} from './types';
import { INITIAL_INVENTORY, INITIAL_SUPPLIERS, INITIAL_AUDIT_HISTORY } from './data/mockData';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { AuditView } from './components/AuditView';
import { PriceCheckerTab } from './components/PriceCheckerTab';
import { SuppliersView } from './components/SuppliersView';
import { SalesView } from './components/SalesView';
import { PurchasesView } from './components/PurchasesView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { DigitalCatalogView } from './components/DigitalCatalogView';
import { PublicCatalogView } from './components/PublicCatalogView';
import { UserManagementView } from './components/UserManagementView';
import { ActivityLogView } from './components/ActivityLogView';
import { ToastContainer } from './components/ToastContainer';
import { LoginView } from './components/LoginView';
import {
  subscribeToInventory,
  subscribeToSuppliers,
  subscribeToAuditHistory,
  subscribeToStoreSettings,
  subscribeToSales,
  subscribeToPurchases,
  subscribeToUsers,
  subscribeToActivityLogs,
  saveStoreSettingsToFirestore,
  DEFAULT_STORE_SETTINGS,
  saveProductToFirestore,
  deleteProductFromFirestore,
  saveSupplierToFirestore,
  deleteSupplierFromFirestore,
  applyAuditChangesToFirestore,
  recordSaleInFirestore,
  cancelSaleInFirestore,
  recordPurchaseInFirestore,
  cancelPurchaseInFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  logActivityInFirestore,
  seedInitialDataIfEmpty,
  pingFirestore
} from './firebase/firestoreService';
import {
  Database,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle2,
  Clock,
  Store,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  LogOut,
  Settings,
  PieChart,
  List,
  ShoppingCart,
  FileText,
  Download,
  Globe,
  Users,
  Activity,
  User,
  ShieldCheck,
  Tag,
  ClipboardCheck,
  Truck
} from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';

export const App: React.FC = () => {
  // Public Customer Catalog Mode Detection (?catalogo=1)
  const [isPublicCatalogMode, setIsPublicCatalogMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return (
      search.includes('catalogo') ||
      search.includes('catalog') ||
      hash.includes('catalogo') ||
      hash.includes('catalog')
    );
  });
  const [isAdminPreviewMode, setIsAdminPreviewMode] = useState<boolean>(false);

  // Application Data State
  const [inventory, setInventory] = useState<Product[]>(INITIAL_INVENTORY);
  const [suppliers, setSuppliers] = useState<Supplier[]>(INITIAL_SUPPLIERS);
  const [auditHistory, setAuditHistory] = useState<AuditHistoryRecord[]>(INITIAL_AUDIT_HISTORY);
  const [sales, setSales] = useState<SaleRecord[]>([]);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);

  // Store Branding & Profile State
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    try {
      const cached = localStorage.getItem('stockmaster_store_settings');
      if (cached) return JSON.parse(cached);
    } catch {}
    return DEFAULT_STORE_SETTINGS;
  });

  // User Session & Authentication State
  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    try {
      const localSess = localStorage.getItem('stockmaster_user_session');
      const sessionSess = sessionStorage.getItem('stockmaster_user_session');
      if (localSess) return JSON.parse(localSess);
      if (sessionSess) return JSON.parse(sessionSess);
    } catch {}
    return null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return userSession !== null;
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

  // Triggers for modals from shortcuts
  const [openProductModalTrigger, setOpenProductModalTrigger] = useState<boolean>(false);
  const [openSupplierModalTrigger, setOpenSupplierModalTrigger] = useState<boolean>(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState<string>('');

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    const newToast: ToastMessage = {
      id: `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      message,
      type,
    };
    setToasts((prev) => [...prev, newToast]);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Auth Handlers
  const handleLoginSuccess = (session: UserSession, remember: boolean) => {
    setUserSession(session);
    setIsAuthenticated(true);

    try {
      if (remember) {
        localStorage.setItem('stockmaster_user_session', JSON.stringify(session));
      } else {
        sessionStorage.setItem('stockmaster_user_session', JSON.stringify(session));
      }
    } catch {}

    // Default activeTab to first allowed tab for collaborator
    if (session.role !== 'admin') {
      const firstAllowed = session.allowedTabs && session.allowedTabs.length > 0 ? session.allowedTabs[0] : 'sales';
      setActiveTab(firstAllowed);
    } else {
      setActiveTab('dashboard');
    }

    logActivityInFirestore({
      userName: session.userName,
      userRole: session.role,
      action: `Inició sesión en la plataforma (${session.role === 'admin' ? 'Administrador' : 'Colaborador'})`,
      module: 'users',
    });

    showToast(`¡Bienvenido ${session.userName}!`, 'success');
  };

  const handleLogout = () => {
    if (userSession) {
      logActivityInFirestore({
        userName: userSession.userName,
        userRole: userSession.role,
        action: 'Cerró sesión del sistema',
        module: 'users',
      });
    }

    setUserSession(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('stockmaster_user_session');
      sessionStorage.removeItem('stockmaster_user_session');
    } catch {}
    showToast('Sesión cerrada correctamente', 'info');
  };

  // Safe Navigation Handler enforcing RBAC permissions
  const handleTabChange = (targetTab: ActiveTab) => {
    if (!userSession) return;

    if (userSession.role !== 'admin') {
      const allowed = userSession.allowedTabs || ['sales', 'inventory', 'price-checker'];
      if (!allowed.includes(targetTab)) {
        showToast('No tienes permiso para ingresar a este módulo. Contacta a tu Administrador.', 'warning');
        return;
      }
    }

    setActiveTab(targetTab);
    if (targetTab === 'inventory') setInventorySearchQuery('');
  };

  // Sidebar Collapsible and Mobile Drawer State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('stockmaster_sidebar_collapsed');
      if (saved !== null) return saved === 'true';
      return typeof window !== 'undefined' && window.innerWidth < 1024;
    } catch {
      return false;
    }
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isInstallPromptOpen, setIsInstallPromptOpen] = useState<boolean>(false);

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

  // Real-time Firestore Subscriptions
  useEffect(() => {
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

    // 4. Subscribe to real-time store settings
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

    // 5. Subscribe to real-time sales transactions & history
    const unsubscribeSales = subscribeToSales(
      (salesRecords) => {
        setSales(salesRecords);
        setIsFirebaseConnected(true);
        setLastSyncTime(new Date());
      },
      (err) => {
        console.error('Sales subscription real-time error:', err);
      }
    );

    // 6. Subscribe to real-time purchases from suppliers
    const unsubscribePurchases = subscribeToPurchases(
      (purchaseRecords) => {
        setPurchases(purchaseRecords);
        setIsFirebaseConnected(true);
        setLastSyncTime(new Date());
      },
      (err) => {
        console.error('Purchases subscription real-time error:', err);
      }
    );

    // 7. Subscribe to real-time collaborator users
    const unsubscribeUsers = subscribeToUsers(
      (userList) => {
        setUsers(userList);
      },
      (err) => {
        console.warn('Users subscription error:', err);
      }
    );

    // 8. Subscribe to real-time activity logs
    const unsubscribeActivity = subscribeToActivityLogs(
      (logs) => {
        setActivityLogs(logs);
      },
      (err) => {
        console.warn('Activity logs subscription error:', err);
      }
    );

    // Seed check
    seedInitialDataIfEmpty().catch((err) => {
      console.warn('Initial seed check error:', err);
    });

    return () => {
      unsubscribeInv();
      unsubscribeSup();
      unsubscribeAudit();
      unsubscribeSettings();
      unsubscribeSales();
      unsubscribePurchases();
      unsubscribeUsers();
      unsubscribeActivity();
    };
  }, []);

  // Save Store Settings
  const handleSaveStoreSettings = async (newSettings: StoreSettings) => {
    setIsSyncing(true);
    setStoreSettings(newSettings);
    try {
      localStorage.setItem('stockmaster_store_settings', JSON.stringify(newSettings));
    } catch {}

    try {
      await saveStoreSettingsToFirestore(newSettings);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Administrador',
        userRole: userSession?.role || 'admin',
        action: 'Actualizó la configuración general de la tienda',
        module: 'settings',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Test Firestore Connection
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

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'collaborator',
        action: `Guardó producto "${product.name}" (${product.code})`,
        module: 'inventory',
        details: `Stock: ${product.stock}, Precio: L. ${product.price.toFixed(2)}`,
      });

      showToast(`"${product.name}" guardado y sincronizado`, 'success');
    } catch (err: any) {
      console.error('Error saving product:', err);
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

      setInventory((prev) => prev.filter((p) => p.id !== id && (code ? p.code !== code : true)));

      await deleteProductFromFirestore(id, code);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'admin',
        action: `Eliminó el producto "${itemToDelete?.name || id}" (${code || ''})`,
        module: 'inventory',
      });

      showToast('Artículo eliminado en tiempo real', 'info');
    } catch (err: any) {
      console.error('Error deleting product:', err);
      showToast('Error al eliminar: ' + (err.message || 'desconocido'), 'error');
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

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'collaborator',
        action: `Guardó proveedor "${supplier.name}"`,
        module: 'suppliers',
      });

      showToast('Proveedor guardado y sincronizado', 'success');
    } catch (err: any) {
      console.error('Error saving supplier:', err);
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

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'admin',
        action: `Eliminó el proveedor "${supToDelete?.name || id}"`,
        module: 'suppliers',
      });

      showToast('Proveedor eliminado', 'info');
    } catch (err: any) {
      console.error('Error deleting supplier:', err);
      showToast('Error al eliminar proveedor: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  // Audit Changes
  const handleApplyAuditChanges = async (
    updatedInventory: Product[],
    historyRecord: AuditHistoryRecord,
    auditedCodes?: string[]
  ) => {
    setIsSyncing(true);
    try {
      setInventory(updatedInventory);
      setAuditHistory((prev) => [...prev, historyRecord]);

      await applyAuditChangesToFirestore(updatedInventory, historyRecord, auditedCodes);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'collaborator',
        action: `Aplicó auditoría de stock (${historyRecord.scope || 'General'})`,
        module: 'audit',
        details: `Coincidencias: ${historyRecord.match}, Faltantes: ${historyRecord.missing}, Sobrantes: ${historyRecord.extra}`,
      });

      showToast('¡Ajustes de inventario de auditoría aplicados correctamente!', 'success');
    } catch (err: any) {
      console.error('Error applying audit changes:', err);
      showToast('Error al sincronizar auditoría: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const handleFilterInventoryByCode = (code: string) => {
    setInventorySearchQuery(code);
    handleTabChange('inventory');
  };

  // Sales Handlers
  const handleRecordSale = async (saleData: Omit<SaleRecord, 'id'>) => {
    setIsSyncing(true);
    try {
      const activeCashier = userSession?.userName || saleData.cashier || 'Cajero';
      const payload = {
        ...saleData,
        cashier: activeCashier,
      };

      const recorded = await recordSaleInFirestore(payload, inventory);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: activeCashier,
        userRole: userSession?.role || 'collaborator',
        action: `Registró Venta N° ${saleData.saleNumber} (${saleData.totalItems} ítems)`,
        module: 'sales',
        details: `Total: L. ${saleData.total.toFixed(2)} (${saleData.paymentMethod.toUpperCase()}) - Cliente: ${saleData.customerName || 'Consumidor Final'}`,
      });

      return recorded;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCancelSale = async (sale: SaleRecord) => {
    setIsSyncing(true);
    try {
      await cancelSaleInFirestore(sale, inventory);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'admin',
        action: `Anuló la Venta N° ${sale.saleNumber}`,
        module: 'sales',
        details: `Total devuelto al stock: L. ${sale.total.toFixed(2)}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Supplier Purchases Handlers
  const handleRecordPurchase = async (purchaseData: Omit<PurchaseInvoice, 'id'>) => {
    setIsSyncing(true);
    try {
      const activeUser = userSession?.userName || purchaseData.receivedBy || 'Usuario';
      const payload = {
        ...purchaseData,
        receivedBy: activeUser,
      };

      const recorded = await recordPurchaseInFirestore(payload, inventory);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: activeUser,
        userRole: userSession?.role || 'collaborator',
        action: `Registró compra/factura N° ${purchaseData.invoiceNumber} de ${purchaseData.supplierName}`,
        module: 'purchases',
        details: `Total: L. ${purchaseData.total.toFixed(2)} (${purchaseData.totalItems} ítems agregados a stock)`,
      });

      return recorded;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCancelPurchase = async (purchase: PurchaseInvoice) => {
    setIsSyncing(true);
    try {
      await cancelPurchaseInFirestore(purchase, inventory);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'admin',
        action: `Anuló la factura de compra N° ${purchase.invoiceNumber}`,
        module: 'purchases',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Users & Collaborators Handlers
  const handleSaveUser = async (userPayload: UserAccount) => {
    setIsSyncing(true);
    try {
      await saveUserToFirestore(userPayload);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Administrador',
        userRole: 'admin',
        action: `Guardó colaborador "${userPayload.name}" (@${userPayload.username})`,
        module: 'users',
        details: `Permisos: ${userPayload.allowedTabs.join(', ')}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setIsSyncing(true);
    try {
      await deleteUserFromFirestore(userId);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Administrador',
        userRole: 'admin',
        action: `Eliminó al colaborador con ID ${userId}`,
        module: 'users',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Public Catalog View (?catalogo=1) or Admin Preview
  if (isPublicCatalogMode || isAdminPreviewMode) {
    return (
      <div className="w-full h-screen h-[100dvh] overflow-y-auto bg-slate-50 scroll-smooth">
        <PublicCatalogView
          inventory={inventory}
          storeSettings={storeSettings}
          isAdminPreview={isAdminPreviewMode}
          onBackToAdmin={() => setIsAdminPreviewMode(false)}
        />
      </div>
    );
  }

  // Login Screen if not authenticated
  if (!isAuthenticated || !userSession) {
    return (
      <div className="min-h-screen w-screen overflow-auto bg-slate-950">
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
        <LoginView
          storeSettings={storeSettings}
          users={users}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  // Filter bottom nav items based on collaborator allowedTabs
  const allowedTabsList = userSession.role === 'admin'
    ? ['dashboard', 'sales', 'inventory', 'price-checker', 'catalog', 'purchases', 'audit', 'suppliers', 'users', 'activity', 'settings']
    : (userSession.allowedTabs || ['sales', 'inventory', 'price-checker']);

  return (
    <div className="h-screen h-[100dvh] min-h-[100dvh] flex flex-col md:flex-row overflow-hidden text-slate-800 bg-slate-50">
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Main Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onResetData={() => setShowResetConfirm(true)}
        storeSettings={storeSettings}
        userSession={userSession}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapse}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        onLogout={handleLogout}
        onOpenInstallPrompt={() => setIsInstallPromptOpen(true)}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative bg-slate-50 min-w-0 transition-all duration-350 ease-in-out">
        {/* Top Header - Clean and Streamlined */}
        <header className="bg-white text-slate-800 px-2.5 sm:px-4 py-2 flex items-center justify-between border-b border-slate-200/80 shadow-xs shrink-0 gap-2">
          {/* Left: Mobile/Desktop Sidebar Toggles + Clean Store Branding */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {/* Mobile Drawer Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white transition-colors cursor-pointer shadow-xs shrink-0 text-xs font-bold"
              aria-label="Abrir menú de navegación"
              title="Abrir menú"
            >
              <Menu className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Menú</span>
            </button>

            {/* Desktop Collapse / Expand Toggle Button */}
            <button
              type="button"
              onClick={toggleSidebarCollapse}
              className="hidden md:inline-flex p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer border border-slate-200/80 shrink-0"
              title={isSidebarCollapsed ? "Expandir barra lateral" : "Contraer barra lateral"}
              aria-label="Alternar barra lateral"
            >
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-emerald-600" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {/* Store brand / Title */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {(storeSettings.logoUrl || '/store-logo.jpg') ? (
                <div className="h-9 sm:h-12 max-w-[140px] sm:max-w-[280px] rounded-xl p-0.5 shrink-0 flex items-center justify-center overflow-hidden bg-transparent">
                  <img
                    src={storeSettings.logoUrl || '/store-logo.jpg'}
                    alt={storeSettings.storeName || 'Tienda Gosén'}
                    className="h-full w-full object-contain rounded-lg mix-blend-multiply filter drop-shadow-2xs"
                  />
                </div>
              ) : (
                <Store className="w-5 h-5 text-emerald-600 shrink-0" />
              )}
              <span className="font-extrabold text-slate-900 text-xs sm:text-base tracking-tight truncate">
                {storeSettings.storeName || 'Tienda Gosén'}
              </span>
            </div>

            {/* Subtle background syncing spinner */}
            {isSyncing && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 animate-pulse shrink-0">
                <RefreshCw className="w-3 h-3 animate-spin text-emerald-600" />
                <span className="hidden sm:inline">Sincronizando...</span>
              </span>
            )}
          </div>

          {/* Right Controls: User Profile Badge, Install App & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600 shrink-0">
            {userSession && (
              <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 rounded-xl bg-slate-100 border border-slate-200/80 text-[11px] sm:text-xs font-bold">
                {userSession.role === 'admin' ? (
                  <ShieldCheck className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600 shrink-0" />
                ) : (
                  <User className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                )}
                <span className="text-slate-900 truncate max-w-[75px] sm:max-w-[120px]">{userSession.userName}</span>
                <span className="hidden md:inline text-[10px] text-slate-500 uppercase font-mono">
                  ({userSession.role === 'admin' ? 'Admin' : 'Colaborador'})
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsInstallPromptOpen(true)}
              title="Instalar aplicación móvil o de escritorio"
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors text-xs font-bold border border-emerald-200 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Instalar App</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión del sistema"
              className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors text-xs font-semibold border border-rose-200 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* Tab Views */}
        {activeTab === 'dashboard' && allowedTabsList.includes('dashboard') && (
          <DashboardView
            inventory={inventory}
            auditHistory={auditHistory}
            sales={sales}
            onOpenNewProduct={() => {
              handleTabChange('inventory');
              setOpenProductModalTrigger(true);
            }}
            onStartAudit={() => handleTabChange('audit')}
            onNavigateToSales={() => handleTabChange('sales')}
            onNavigateToPurchases={() => handleTabChange('purchases')}
            onFilterInventoryByCode={handleFilterInventoryByCode}
            onNavigateToAudit={() => handleTabChange('audit')}
          />
        )}

        {activeTab === 'sales' && allowedTabsList.includes('sales') && (
          <SalesView
            inventory={inventory}
            sales={sales}
            storeSettings={storeSettings}
            onRecordSale={handleRecordSale}
            onCancelSale={handleCancelSale}
            showToast={showToast}
          />
        )}

        {activeTab === 'inventory' && allowedTabsList.includes('inventory') && (
          <InventoryView
            inventory={inventory}
            suppliers={suppliers}
            initialSearchCode={inventorySearchQuery}
            onSaveProduct={handleSaveProduct}
            onDeleteProduct={handleDeleteProduct}
            onOpenSupplierModal={() => {
              handleTabChange('suppliers');
              setOpenSupplierModalTrigger(true);
            }}
            showModalInitially={openProductModalTrigger}
            onCloseInitialModal={() => setOpenProductModalTrigger(false)}
            showToast={showToast}
          />
        )}

        {activeTab === 'price-checker' && allowedTabsList.includes('price-checker') && (
          <PriceCheckerTab
            inventory={inventory}
            showToast={showToast}
          />
        )}

        {activeTab === 'catalog' && allowedTabsList.includes('catalog') && (
          <DigitalCatalogView
            storeSettings={storeSettings}
            inventory={inventory}
            onSaveSettings={handleSaveStoreSettings}
            onOpenPreview={() => setIsAdminPreviewMode(true)}
            showToast={showToast}
          />
        )}

        {activeTab === 'purchases' && allowedTabsList.includes('purchases') && (
          <PurchasesView
            suppliers={suppliers}
            inventory={inventory}
            purchases={purchases}
            storeSettings={storeSettings}
            onRecordPurchase={handleRecordPurchase}
            onCancelPurchase={handleCancelPurchase}
            onSaveSupplier={handleSaveSupplier}
            showToast={showToast}
          />
        )}

        {activeTab === 'audit' && allowedTabsList.includes('audit') && (
          <AuditView
            inventory={inventory}
            suppliers={suppliers}
            onApplyAuditChanges={handleApplyAuditChanges}
            showToast={showToast}
            storeSettings={storeSettings}
          />
        )}

        {activeTab === 'suppliers' && allowedTabsList.includes('suppliers') && (
          <SuppliersView
            suppliers={suppliers}
            inventory={inventory}
            onSaveSupplier={handleSaveSupplier}
            onDeleteSupplier={handleDeleteSupplier}
            showModalInitially={openSupplierModalTrigger}
            onCloseInitialModal={() => setOpenSupplierModalTrigger(false)}
          />
        )}

        {activeTab === 'users' && allowedTabsList.includes('users') && (
          <UserManagementView
            users={users}
            storeSettings={storeSettings}
            onSaveUser={handleSaveUser}
            onDeleteUser={handleDeleteUser}
            showToast={showToast}
          />
        )}

        {activeTab === 'activity' && allowedTabsList.includes('activity') && (
          <ActivityLogView
            logs={activityLogs}
            showToast={showToast}
          />
        )}

        {activeTab === 'settings' && allowedTabsList.includes('settings') && (
          <StoreSettingsView
            currentSettings={storeSettings}
            onSaveSettings={handleSaveStoreSettings}
            showToast={showToast}
            isFirebaseConnected={isFirebaseConnected}
            lastSyncTime={lastSyncTime}
            pingLatency={pingLatency}
            onTestConnection={handleTestConnection}
            isPinging={isPinging}
            inventoryCount={inventory.length}
            suppliersCount={suppliers.length}
            auditHistoryCount={auditHistory.length}
            salesCount={sales.length}
            purchasesCount={purchases.length}
            onResetData={() => setShowResetConfirm(true)}
            onOpenInstallPrompt={() => setIsInstallPromptOpen(true)}
          />
        )}

        {/* Mobile Bottom Navigation Bar (< md) with horizontal slide for ALL allowed modules */}
        <nav
          aria-label="Navegación rápida móvil"
          className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white/95 backdrop-blur-md border-t border-slate-200/90 px-2 pt-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom,0px))] flex items-center gap-1 overflow-x-auto shadow-lg"
        >
          {allowedTabsList.includes('dashboard') && (
            <button
              type="button"
              onClick={() => handleTabChange('dashboard')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'dashboard'
                  ? 'text-emerald-700 font-bold bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <PieChart className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Panel</span>
            </button>
          )}

          {allowedTabsList.includes('sales') && (
            <button
              type="button"
              onClick={() => handleTabChange('sales')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'sales'
                  ? 'text-emerald-700 font-bold bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ShoppingCart className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Ventas</span>
            </button>
          )}

          {allowedTabsList.includes('inventory') && (
            <button
              type="button"
              onClick={() => handleTabChange('inventory')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'inventory'
                  ? 'text-emerald-700 font-bold bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <List className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Stock</span>
            </button>
          )}

          {allowedTabsList.includes('price-checker') && (
            <button
              type="button"
              onClick={() => handleTabChange('price-checker')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'price-checker'
                  ? 'text-emerald-700 font-bold bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Tag className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Precios</span>
            </button>
          )}

          {allowedTabsList.includes('catalog') && (
            <button
              type="button"
              onClick={() => handleTabChange('catalog')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'catalog'
                  ? 'text-emerald-700 font-bold bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Globe className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Catálogo</span>
            </button>
          )}

          {allowedTabsList.includes('purchases') && (
            <button
              type="button"
              onClick={() => handleTabChange('purchases')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'purchases'
                  ? 'text-indigo-700 font-bold bg-indigo-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Compras</span>
            </button>
          )}

          {allowedTabsList.includes('audit') && (
            <button
              type="button"
              onClick={() => handleTabChange('audit')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'audit'
                  ? 'text-emerald-700 font-bold bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <ClipboardCheck className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Auditoría</span>
            </button>
          )}

          {allowedTabsList.includes('suppliers') && (
            <button
              type="button"
              onClick={() => handleTabChange('suppliers')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'suppliers'
                  ? 'text-indigo-700 font-bold bg-indigo-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Truck className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Proveedores</span>
            </button>
          )}

          {allowedTabsList.includes('users') && (
            <button
              type="button"
              onClick={() => handleTabChange('users')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'users'
                  ? 'text-amber-700 font-bold bg-amber-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Users className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Usuarios</span>
            </button>
          )}

          {allowedTabsList.includes('activity') && (
            <button
              type="button"
              onClick={() => handleTabChange('activity')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'activity'
                  ? 'text-indigo-700 font-bold bg-indigo-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Activity className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Movimientos</span>
            </button>
          )}

          {allowedTabsList.includes('settings') && (
            <button
              type="button"
              onClick={() => handleTabChange('settings')}
              className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all cursor-pointer shrink-0 min-w-[60px] ${
                activeTab === 'settings'
                  ? 'text-emerald-700 font-bold bg-emerald-50'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <Store className="w-5 h-5 shrink-0" />
              <span className="text-[10px] mt-0.5 tracking-tight whitespace-nowrap">Ajustes</span>
            </button>
          )}
        </nav>
      </main>

      {/* PWA Install Drawer Prompt */}
      <PWAInstallPrompt
        isOpen={isInstallPromptOpen}
        onClose={() => setIsInstallPromptOpen(false)}
        storeSettings={storeSettings}
      />
    </div>
  );
};

export default App;
