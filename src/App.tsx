import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  UserSession,
  CompanyTenant,
  ALL_COMPANY_MODULES,
  SaaSGlobalConfig,
  POSFinanceStoreData,
  CreditPaymentAbone
} from './types';
import { INITIAL_INVENTORY, INITIAL_SUPPLIERS, INITIAL_AUDIT_HISTORY } from './data/mockData';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { InventoryView } from './components/InventoryView';
import { AuditView } from './components/AuditView';
import { PriceCheckerTab } from './components/PriceCheckerTab';
import { SuppliersView } from './components/SuppliersView';
import { SalesView, SalesSubTab, WhatsAppIcon } from './components/SalesView';
import { PurchasesView } from './components/PurchasesView';
import { StoreSettingsView } from './components/StoreSettingsView';
import { DigitalCatalogView } from './components/DigitalCatalogView';
import { PublicCatalogView } from './components/PublicCatalogView';
import { UserManagementView } from './components/UserManagementView';
import { ActivityLogView } from './components/ActivityLogView';
import { CompaniesSaaSView, getDaysUntilBilling, formatShortDateEs } from './components/CompaniesSaaSView';
import { ToastContainer } from './components/ToastContainer';
import { LoginView } from './components/LoginView';
import {
  getActiveCompanyId,
  setActiveCompanyId,
  normalizeCompanySlug,
  getScopedDocId,
  getCachedInventory,
  setCachedInventory,
  getCachedSuppliers,
  setCachedSuppliers,
  getCachedSales,
  setCachedSales,
  getCachedPurchases,
  setCachedPurchases,
  getCachedAuditHistory,
  setCachedAuditHistory,
  getCachedUsers,
  setCachedUsers,
  getCachedStoreSettings,
  setCachedStoreSettings,
  getCachedCompanies,
  setCachedCompanies,
  DEFAULT_GOSEN_COMPANY,
  fetchCompaniesOnce,
  subscribeToCompaniesRealtime,
  saveCompanyToFirestore,
  deleteCompanyFromFirestore,
  getCachedSaaSGlobalConfig,
  fetchSaaSGlobalConfigOnce,
  subscribeToSaaSGlobalConfig,
  saveSaaSGlobalConfigToFirestore,
  fetchInventorySmart,
  fetchStoreSettingsOnce,
  fetchSuppliersOnce,
  fetchSalesOnce,
  subscribeToSales,
  fetchPurchasesOnce,
  fetchAuditHistoryOnce,
  fetchUsersOnce,
  fetchActivityLogsOnce,
  saveStoreSettingsToFirestore,
  DEFAULT_STORE_SETTINGS,
  saveProductToFirestore,
  bulkSaveProductsToFirestore,
  deleteProductFromFirestore,
  saveSupplierToFirestore,
  deleteSupplierFromFirestore,
  applyAuditChangesToFirestore,
  recordSaleInFirestore,
  recordCreditPaymentInFirestore,
  cancelSaleInFirestore,
  recordPurchaseInFirestore,
  cancelPurchaseInFirestore,
  saveUserToFirestore,
  deleteUserFromFirestore,
  logActivityInFirestore,
  getCachedPOSFinanceData,
  fetchPOSFinanceDataOnce,
  subscribeToPOSFinanceData,
  savePOSFinanceDataToFirestore,
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
  Truck,
  LayoutGrid,
  Package,
  Building2,
  Lock,
  AlertTriangle,
  ArrowLeft,
  Megaphone,
  X
} from 'lucide-react';
import { ConfirmDialog } from './components/ConfirmDialog';
import { PWAInstallPrompt } from './components/PWAInstallPrompt';
import { SplashScreen } from './components/SplashScreen';

export const App: React.FC = () => {
  // Active Multi-Tenant Company Slug (defaults to 'gosen' or ?empresa= URL param)
  const [activeCompanyId, setActiveCompanyIdState] = useState<string>(() => getActiveCompanyId());
  const [companies, setCompanies] = useState<CompanyTenant[]>(() => {
    const cached = getCachedCompanies();
    return cached && cached.length > 0 ? cached : [DEFAULT_GOSEN_COMPANY];
  });
  const [saasGlobalConfig, setSaasGlobalConfig] = useState<SaaSGlobalConfig>(() =>
    getCachedSaaSGlobalConfig()
  );
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem('stockmaster_dismissed_saas_announcements');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [expiryBannerDismissedToday, setExpiryBannerDismissedToday] = useState<boolean>(false);

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

  // Application Data State — Initialized immediately from localStorage cache (0 reads on paint)
  const [inventory, setInventory] = useState<Product[]>(() => {
    const slug = getActiveCompanyId();
    const cached = getCachedInventory(slug);
    if (cached && cached.length > 0) return cached;
    return slug === 'gosen' ? INITIAL_INVENTORY : [];
  });
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    const slug = getActiveCompanyId();
    const cached = getCachedSuppliers(slug);
    if (cached && cached.length > 0) return cached;
    return slug === 'gosen' ? INITIAL_SUPPLIERS : [];
  });
  const [auditHistory, setAuditHistory] = useState<AuditHistoryRecord[]>(() => {
    const slug = getActiveCompanyId();
    const cached = getCachedAuditHistory(slug);
    if (cached && cached.length > 0) return cached;
    return slug === 'gosen' ? INITIAL_AUDIT_HISTORY : [];
  });
  const [sales, setSales] = useState<SaleRecord[]>(() => getCachedSales(getActiveCompanyId()) || []);
  const [purchases, setPurchases] = useState<PurchaseInvoice[]>(() => getCachedPurchases(getActiveCompanyId()) || []);
  const [users, setUsers] = useState<UserAccount[]>(() => getCachedUsers(getActiveCompanyId()) || []);
  const [activityLogs, setActivityLogs] = useState<ActivityLogRecord[]>([]);
  const [posFinanceData, setPosFinanceData] = useState<POSFinanceStoreData>(() =>
    getCachedPOSFinanceData(getActiveCompanyId())
  );
  const [salesSubTab, setSalesSubTab] = useState<SalesSubTab>('pos');

  // Track which secondary collections have been synced during this browser session
  const loadedModulesRef = useRef<Record<string, boolean>>({});
  const lastVisibilityCheckRef = useRef<number>(Date.now());

  // Store Branding & Profile State
  const [storeSettings, setStoreSettings] = useState<StoreSettings>(() => {
    const slug = getActiveCompanyId();
    const cached = getCachedStoreSettings(slug);
    if (cached) return cached;
    return slug === 'gosen'
      ? DEFAULT_STORE_SETTINGS
      : {
          companyId: slug,
          storeName: slug.toUpperCase(),
          tagline: 'Control de Inventario y Ventas',
          logoUrl: '',
          phone: '',
          address: '',
          accessPassword: 'ADMIN2026',
          allowedModules: [...ALL_COMPANY_MODULES],
          enableDeliveryDvolada: false,
        };
  });

  // User Session & Authentication State
  const [userSession, setUserSession] = useState<UserSession | null>(() => {
    try {
      const localSess = localStorage.getItem('stockmaster_user_session');
      const sessionSess = sessionStorage.getItem('stockmaster_user_session');
      const raw = localSess || sessionSess;
      if (raw) {
        const parsed = JSON.parse(raw);
        if (!parsed.companyId) parsed.companyId = 'gosen';
        const isOwnerUnlocked =
          localStorage.getItem('stockmaster_saas_owner_unlocked') === 'true';
        parsed.isSuperAdmin = Boolean(
          parsed.role === 'admin' && parsed.isSuperAdmin === true && isOwnerUnlocked
        );
        return parsed;
      }
    } catch {}
    return null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return userSession !== null;
  });

  // Connection & Sync State
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(() => {
    const cached = getCachedInventory(getActiveCompanyId());
    return !(cached && cached.length > 0);
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [isPinging, setIsPinging] = useState<boolean>(false);

  // Walking Shoe Splash Screen State on App Open — snappy cold boot with zero lag on warm visits
  const [showSplash, setShowSplash] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem('stockmaster_visited')) {
      return false;
    }
    return true;
  });
  const [isSplashExiting, setIsSplashExiting] = useState<boolean>(false);
  const [isSkeletonTransition, setIsSkeletonTransition] = useState<boolean>(() => {
    const cached = getCachedInventory(getActiveCompanyId());
    return !(cached && cached.length > 0);
  });

  const [splashWelcomeUser, setSplashWelcomeUser] = useState<string | null>(null);
  const [splashWelcomeRole, setSplashWelcomeRole] = useState<'admin' | 'collaborator' | null>(null);
  const splashTimersRef = useRef<{ exit?: ReturnType<typeof setTimeout>; hide?: ReturnType<typeof setTimeout> }>({});

  useEffect(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('stockmaster_visited', '1');
    }
    const exitTimer = setTimeout(() => {
      setIsSplashExiting(true);
    }, 650);
    const hideTimer = setTimeout(() => {
      setShowSplash(false);
      setIsSkeletonTransition(false);
    }, 950);
    return () => {
      clearTimeout(exitTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  const triggerBriefSplash = (durationMs = 1150, welcomeSession?: UserSession) => {
    if (splashTimersRef.current.exit) clearTimeout(splashTimersRef.current.exit);
    if (splashTimersRef.current.hide) clearTimeout(splashTimersRef.current.hide);

    if (welcomeSession) {
      setSplashWelcomeUser(welcomeSession.userName);
      setSplashWelcomeRole(welcomeSession.role);
    } else {
      setSplashWelcomeUser(null);
      setSplashWelcomeRole(null);
    }

    setIsSplashExiting(false);
    setShowSplash(true);

    splashTimersRef.current.exit = setTimeout(() => {
      setIsSplashExiting(true);
    }, Math.max(300, durationMs - 300));

    splashTimersRef.current.hide = setTimeout(() => {
      setShowSplash(false);
      setIsSkeletonTransition(false);
      setSplashWelcomeUser(null);
      setSplashWelcomeRole(null);
    }, durationMs);
  };

  const isInventoryLoading = isConnecting || isSkeletonTransition;

  const [showResetConfirm, setShowResetConfirm] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Triggers for modals from shortcuts
  const [openProductModalTrigger, setOpenProductModalTrigger] = useState<boolean>(false);
  const [openSupplierModalTrigger, setOpenSupplierModalTrigger] = useState<boolean>(false);
  const [inventorySearchQuery, setInventorySearchQuery] = useState<string>('');

  const handleDismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newToast: ToastMessage = {
        id,
        message,
        type,
      };
      setToasts((prev) => {
        const filtered = prev.filter((t) => t.message !== message);
        return [...filtered.slice(-2), newToast];
      });
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3400);
    },
    []
  );


  // Switch active company context (from LoginView or from Super Admin panel)
  const handleSelectCompanyContext = useCallback((companySlug: string) => {
    const cleanSlug = setActiveCompanyId(companySlug);
    setActiveCompanyIdState(cleanSlug);
    loadedModulesRef.current = {};

    // Hydrate immediate local cache for the selected company
    const cachedSettings = getCachedStoreSettings(cleanSlug);
    if (cachedSettings) {
      setStoreSettings(cachedSettings);
    } else {
      const compObj = companies.find((c) => c.slug === cleanSlug);
      setStoreSettings(
        cleanSlug === 'gosen'
          ? DEFAULT_STORE_SETTINGS
          : {
              companyId: cleanSlug,
              storeName: compObj?.name || cleanSlug.toUpperCase(),
              tagline: compObj?.tagline || 'Control de Inventario y Ventas',
              logoUrl: compObj?.logoUrl || '',
              phone: compObj?.phone || '',
              address: compObj?.address || '',
              accessPassword: compObj?.adminPassword || 'ADMIN2026',
              allowedModules: compObj?.allowedModules || [...ALL_COMPANY_MODULES],
              enableDeliveryDvolada: compObj?.enableDeliveryDvolada ?? false,
            }
      );
    }

    const cachedInv = getCachedInventory(cleanSlug);
    setInventory(cachedInv || (cleanSlug === 'gosen' ? INITIAL_INVENTORY : []));
    setSuppliers(getCachedSuppliers(cleanSlug) || (cleanSlug === 'gosen' ? INITIAL_SUPPLIERS : []));
    setSales(getCachedSales(cleanSlug) || []);
    setPurchases(getCachedPurchases(cleanSlug) || []);
    setAuditHistory(getCachedAuditHistory(cleanSlug) || []);
    setUsers(getCachedUsers(cleanSlug) || []);
    setPosFinanceData(getCachedPOSFinanceData(cleanSlug));
    setActivityLogs([]);
  }, [companies]);

  // Auth Handlers — Fluid login animation over instant background workspace mount
  const handleLoginSuccess = (session: UserSession, remember: boolean) => {
    const sessionCompany = normalizeCompanySlug(session.companyId || activeCompanyId || 'gosen');
    if (sessionCompany !== activeCompanyId) {
      handleSelectCompanyContext(sessionCompany);
    }

    triggerBriefSplash(1150, session);
    setUserSession(session);
    setIsAuthenticated(true);

    try {
      if (remember) {
        localStorage.setItem('stockmaster_user_session', JSON.stringify(session));
      } else {
        sessionStorage.setItem('stockmaster_user_session', JSON.stringify(session));
      }
    } catch {}

    const compObj = companies.find((c) => normalizeCompanySlug(c.slug) === sessionCompany);
    const compAllowed =
      compObj?.allowedModules && compObj.allowedModules.length > 0
        ? compObj.allowedModules
        : ALL_COMPANY_MODULES;

    if (session.role !== 'admin') {
      const validCollabTabs = (session.allowedTabs || ['sales', 'inventory', 'price-checker']).filter(
        (t) => compAllowed.includes(t)
      );
      const firstAllowed = validCollabTabs.length > 0 ? validCollabTabs[0] : compAllowed[0] || 'sales';
      setActiveTab(firstAllowed);
    } else if (session.isSuperAdmin) {
      setActiveTab('companies');
    } else {
      const firstAdminTab = compAllowed.includes('dashboard') ? 'dashboard' : compAllowed[0] || 'sales';
      setActiveTab(firstAdminTab);
    }

    logActivityInFirestore(
      {
        companyId: sessionCompany,
        userName: session.userName,
        userRole: session.role,
        action: `Inició sesión en la plataforma (${session.role === 'admin' ? 'Administrador' : 'Colaborador'})`,
        module: 'users',
      },
      sessionCompany
    );

    showToast(`¡Bienvenido ${session.userName}!`, 'success');
  };

  const handleUnlockSuperAdmin = (masterKeyInput: string): boolean => {
    const expectedMasterKey = (
      localStorage.getItem('stockmaster_saas_master_key') || 'SAASMASTER2026'
    ).trim();

    if (masterKeyInput.trim().toUpperCase() !== expectedMasterKey.toUpperCase()) {
      return false;
    }

    try {
      localStorage.setItem('stockmaster_saas_owner_unlocked', 'true');
    } catch {}

    setUserSession((prev) => {
      if (!prev) return prev;
      const updated: UserSession = {
        ...prev,
        isSuperAdmin: true,
        isStandaloneSaaS: true,
        userName: 'Administrador SaaS',
        allowedTabs: Array.from(new Set([...(prev.allowedTabs || []), 'companies'])) as ActiveTab[],
      };
      try {
        if (localStorage.getItem('stockmaster_user_session')) {
          localStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        } else {
          sessionStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        }
      } catch {}
      return updated;
    });

    setActiveTab('companies');
    showToast('Consola Central SaaS abierta', 'success');
    return true;
  };

  const handleLockSuperAdmin = () => {
    try {
      localStorage.removeItem('stockmaster_saas_owner_unlocked');
    } catch {}

    // Always return the owner to Tienda Gosén when exiting the SaaS console
    handleSelectCompanyContext('gosen');

    setUserSession((prev) => {
      if (!prev) return prev;
      const updated: UserSession = {
        ...prev,
        companyId: 'gosen',
        companyName: 'Tienda Gosén',
        isSuperAdmin: false,
        isStandaloneSaaS: false,
        userName: 'Administrador Gosén',
        allowedTabs: (prev.allowedTabs || []).filter((t) => t !== 'companies'),
      };
      try {
        if (localStorage.getItem('stockmaster_user_session')) {
          localStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        } else {
          sessionStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        }
      } catch {}
      return updated;
    });

    if (activeTab === 'companies') {
      setActiveTab('dashboard');
    }
    showToast('Panel SaaS cerrado. Has vuelto a Tienda Gosén.', 'info');
  };

  const handleLogout = () => {
    if (userSession) {
      logActivityInFirestore(
        {
          companyId: activeCompanyId,
          userName: userSession.userName,
          userRole: userSession.role,
          action: 'Cerró sesión del sistema',
          module: 'users',
        },
        activeCompanyId
      );
    }

    setUserSession(null);
    setIsAuthenticated(false);
    try {
      localStorage.removeItem('stockmaster_user_session');
      sessionStorage.removeItem('stockmaster_user_session');
      localStorage.removeItem('stockmaster_saas_owner_unlocked');
      const params = new URLSearchParams(window.location.search);
      const urlCompany = params.get('empresa') || params.get('tienda') || params.get('cliente');
      if (!urlCompany) {
        handleSelectCompanyContext('gosen');
      }
    } catch {}
    showToast('Sesión cerrada correctamente', 'info');
  };

  // Safe Navigation Handler enforcing SaaS company permissions + RBAC permissions
  const handleTabChange = (targetTab: ActiveTab) => {
    if (!userSession) return;

    const isSuper = Boolean(userSession.role === 'admin' && userSession.isSuperAdmin === true);
    if (!isSuper && targetTab !== 'companies') {
      const activeComp = companies.find(
        (c) => normalizeCompanySlug(c.slug) === normalizeCompanySlug(activeCompanyId)
      );
      const compModules =
        activeComp?.allowedModules && activeComp.allowedModules.length > 0
          ? activeComp.allowedModules
          : storeSettings.allowedModules && storeSettings.allowedModules.length > 0
          ? storeSettings.allowedModules
          : ALL_COMPANY_MODULES;

      if (!compModules.includes(targetTab)) {
        showToast('Esta función no está incluida o habilitada en el plan de tu tienda.', 'warning');
        return;
      }
    }

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

  // Prevent iOS Safari on iPhone from scrolling the window and pushing the top header off-screen
  useEffect(() => {
    const resetIosScroll = () => {
      if (window.scrollY !== 0 || document.documentElement.scrollTop !== 0 || document.body.scrollTop !== 0) {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
    };

    resetIosScroll();
    const handleFocusOut = () => {
      setTimeout(resetIosScroll, 50);
    };

    window.addEventListener('focusout', handleFocusOut);
    window.addEventListener('orientationchange', resetIosScroll);
    return () => {
      window.removeEventListener('focusout', handleFocusOut);
      window.removeEventListener('orientationchange', resetIosScroll);
    };
  }, [isAuthenticated, activeTab]);

  // 1. Smart Initial Load: Store Settings + 1-Read Inventory Sync Check + Companies Directory
  useEffect(() => {
    let isMounted = true;

    const initCoreData = async () => {
      setIsSyncing(true);
      try {
        if (!isPublicCatalogMode && activeCompanyId === 'gosen') {
          await seedInitialDataIfEmpty('gosen');
        }

        const [settings, invResult, companiesList, globalCfg] = await Promise.all([
          fetchStoreSettingsOnce(activeCompanyId),
          fetchInventorySmart(false, activeCompanyId),
          fetchCompaniesOnce(false),
          fetchSaaSGlobalConfigOnce(),
        ]);

        if (!isMounted) return;
        setStoreSettings(settings);
        setInventory(invResult.items);
        setCompanies(companiesList);
        setSaasGlobalConfig(globalCfg);
        setIsFirebaseConnected(true);
        setIsConnecting(false);
        setLastSyncTime(new Date());
      } catch (err) {
        console.error('Error loading core data:', err);
        if (isMounted) {
          setIsFirebaseConnected(false);
          setIsConnecting(false);
        }
      } finally {
        if (isMounted) {
          setTimeout(() => setIsSyncing(false), 400);
        }
      }
    };

    initCoreData();

    return () => {
      isMounted = false;
    };
  }, [isPublicCatalogMode, activeCompanyId]);

  // 1b. Real-Time Subscription to Companies Directory & SaaS Global Config
  useEffect(() => {
    const unsubscribeComps = subscribeToCompaniesRealtime((liveCompanies) => {
      setCompanies(liveCompanies);
      const myTenant = liveCompanies.find(
        (c) => normalizeCompanySlug(c.slug) === normalizeCompanySlug(activeCompanyId)
      );
      if (myTenant) {
        setStoreSettings((prev) => {
          const updated: StoreSettings = {
            ...prev,
            allowedModules:
              myTenant.allowedModules && myTenant.allowedModules.length > 0
                ? myTenant.allowedModules
                : prev.allowedModules || [...ALL_COMPANY_MODULES],
            enableDeliveryDvolada:
              myTenant.enableDeliveryDvolada !== undefined
                ? myTenant.enableDeliveryDvolada
                : prev.enableDeliveryDvolada ?? activeCompanyId === 'gosen',
            maxProducts: myTenant.maxProducts ?? prev.maxProducts ?? 0,
            maxUsers: myTenant.maxUsers ?? prev.maxUsers ?? 0,
          };
          setCachedStoreSettings(updated, activeCompanyId);
          return updated;
        });
      }
    });

    const unsubscribeGlobal = subscribeToSaaSGlobalConfig((liveCfg) => {
      setSaasGlobalConfig(liveCfg);
    });

    let unsubscribeSales: (() => void) | undefined;
    let unsubscribePosFinance: (() => void) | undefined;

    if (!isPublicCatalogMode) {
      unsubscribeSales = subscribeToSales(
        (liveSales) => {
          setSales(liveSales);
        },
        (err) => {
          console.warn('Sales realtime listener warning:', err);
        },
        activeCompanyId
      );

      unsubscribePosFinance = subscribeToPOSFinanceData(
        (liveFinance) => {
          setPosFinanceData(liveFinance);
        },
        activeCompanyId
      );
    }

    return () => {
      unsubscribeComps();
      unsubscribeGlobal();
      if (unsubscribeSales) unsubscribeSales();
      if (unsubscribePosFinance) unsubscribePosFinance();
    };
  }, [activeCompanyId, isPublicCatalogMode]);

  // 2. Load Users on Login Screen (only if not in Public Catalog Mode)
  useEffect(() => {
    if (isPublicCatalogMode) return;
    if (!isAuthenticated && !loadedModulesRef.current[`users_${activeCompanyId}`]) {
      loadedModulesRef.current[`users_${activeCompanyId}`] = true;
      fetchUsersOnce(false, activeCompanyId)
        .then((list) => setUsers(list))
        .catch((err) => console.warn('Users load warning:', err));
    }
  }, [isPublicCatalogMode, isAuthenticated, activeCompanyId]);

  // 3. Lazy-Load Secondary Collections Based on Active Tab & Active Company
  useEffect(() => {
    if (isPublicCatalogMode || !isAuthenticated) return;

    const loadTabDependencies = async () => {
      try {
        const keySuffix = `_${activeCompanyId}`;
        if (activeTab === 'dashboard') {
          if (!loadedModulesRef.current[`sales${keySuffix}`]) {
            loadedModulesRef.current[`sales${keySuffix}`] = true;
            fetchSalesOnce(false, activeCompanyId).then(setSales).catch(console.warn);
          }
          if (!loadedModulesRef.current[`posfinance${keySuffix}`]) {
            loadedModulesRef.current[`posfinance${keySuffix}`] = true;
            fetchPOSFinanceDataOnce(activeCompanyId).then(setPosFinanceData).catch(console.warn);
          }
          if (!loadedModulesRef.current[`audit${keySuffix}`]) {
            loadedModulesRef.current[`audit${keySuffix}`] = true;
            fetchAuditHistoryOnce(false, activeCompanyId).then(setAuditHistory).catch(console.warn);
          }
        } else if (activeTab === 'sales') {
          if (!loadedModulesRef.current[`sales${keySuffix}`]) {
            loadedModulesRef.current[`sales${keySuffix}`] = true;
            fetchSalesOnce(false, activeCompanyId).then(setSales).catch(console.warn);
          }
          if (!loadedModulesRef.current[`posfinance${keySuffix}`]) {
            loadedModulesRef.current[`posfinance${keySuffix}`] = true;
            fetchPOSFinanceDataOnce(activeCompanyId).then(setPosFinanceData).catch(console.warn);
          }
        } else if (activeTab === 'inventory') {
          if (!loadedModulesRef.current[`suppliers${keySuffix}`]) {
            loadedModulesRef.current[`suppliers${keySuffix}`] = true;
            fetchSuppliersOnce(false, activeCompanyId).then(setSuppliers).catch(console.warn);
          }
        } else if (activeTab === 'purchases') {
          if (!loadedModulesRef.current[`purchases${keySuffix}`]) {
            loadedModulesRef.current[`purchases${keySuffix}`] = true;
            fetchPurchasesOnce(false, activeCompanyId).then(setPurchases).catch(console.warn);
          }
          if (!loadedModulesRef.current[`suppliers${keySuffix}`]) {
            loadedModulesRef.current[`suppliers${keySuffix}`] = true;
            fetchSuppliersOnce(false, activeCompanyId).then(setSuppliers).catch(console.warn);
          }
        } else if (activeTab === 'audit') {
          if (!loadedModulesRef.current[`suppliers${keySuffix}`]) {
            loadedModulesRef.current[`suppliers${keySuffix}`] = true;
            fetchSuppliersOnce(false, activeCompanyId).then(setSuppliers).catch(console.warn);
          }
          if (!loadedModulesRef.current[`audit${keySuffix}`]) {
            loadedModulesRef.current[`audit${keySuffix}`] = true;
            fetchAuditHistoryOnce(false, activeCompanyId).then(setAuditHistory).catch(console.warn);
          }
        } else if (activeTab === 'suppliers') {
          if (!loadedModulesRef.current[`suppliers${keySuffix}`]) {
            loadedModulesRef.current[`suppliers${keySuffix}`] = true;
            fetchSuppliersOnce(false, activeCompanyId).then(setSuppliers).catch(console.warn);
          }
        } else if (activeTab === 'users') {
          if (!loadedModulesRef.current[`users${keySuffix}`]) {
            loadedModulesRef.current[`users${keySuffix}`] = true;
            fetchUsersOnce(false, activeCompanyId).then(setUsers).catch(console.warn);
          }
        } else if (activeTab === 'activity') {
          if (!loadedModulesRef.current[`activity${keySuffix}`]) {
            loadedModulesRef.current[`activity${keySuffix}`] = true;
            fetchActivityLogsOnce(activeCompanyId).then(setActivityLogs).catch(console.warn);
          }
        } else if (activeTab === 'companies') {
          if (!loadedModulesRef.current['companies_all']) {
            loadedModulesRef.current['companies_all'] = true;
            fetchCompaniesOnce(true).then(setCompanies).catch(console.warn);
          }
        }
      } catch (err) {
        console.warn('Lazy module load warning:', err);
      }
    };

    loadTabDependencies();
  }, [activeTab, isAuthenticated, isPublicCatalogMode, activeCompanyId]);

  // 4. Lightweight 1-Read Sync Check When Returning to Tab After > 5 Minutes
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const elapsed = Date.now() - lastVisibilityCheckRef.current;
        if (elapsed > 5 * 60 * 1000) {
          lastVisibilityCheckRef.current = Date.now();
          fetchInventorySmart(false, activeCompanyId)
            .then((res) => {
              if (!res.fromCache) {
                setInventory(res.items);
                setLastSyncTime(new Date());
              }
            })
            .catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [activeCompanyId]);

  // Manual Cloud Sync Button Handler
  const handleManualSync = useCallback(async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const [invResult, settings] = await Promise.all([
        fetchInventorySmart(true, activeCompanyId),
        fetchStoreSettingsOnce(activeCompanyId),
      ]);
      setInventory(invResult.items);
      setStoreSettings(settings);

      if (activeTab === 'sales' || activeTab === 'dashboard') {
        const [freshSales, freshPosFinance] = await Promise.all([
          fetchSalesOnce(true, activeCompanyId),
          fetchPOSFinanceDataOnce(activeCompanyId),
        ]);
        setSales(freshSales);
        setPosFinanceData(freshPosFinance);
      } else if (activeTab === 'purchases') {
        const [freshPurchases, freshSuppliers] = await Promise.all([
          fetchPurchasesOnce(true, activeCompanyId),
          fetchSuppliersOnce(true, activeCompanyId),
        ]);
        setPurchases(freshPurchases);
        setSuppliers(freshSuppliers);
      } else if (activeTab === 'suppliers' || activeTab === 'inventory') {
        const freshSuppliers = await fetchSuppliersOnce(true, activeCompanyId);
        setSuppliers(freshSuppliers);
      } else if (activeTab === 'audit') {
        const freshAudit = await fetchAuditHistoryOnce(true, activeCompanyId);
        setAuditHistory(freshAudit);
      } else if (activeTab === 'users') {
        const freshUsers = await fetchUsersOnce(true, activeCompanyId);
        setUsers(freshUsers);
      } else if (activeTab === 'activity') {
        const freshLogs = await fetchActivityLogsOnce(activeCompanyId);
        setActivityLogs(freshLogs);
      } else if (activeTab === 'companies') {
        const freshCompanies = await fetchCompaniesOnce(true);
        setCompanies(freshCompanies);
      }

      setIsFirebaseConnected(true);
      setLastSyncTime(new Date());
      showToast(`Inventario sincronizado con la nube (${invResult.items.length} artículos)`, 'success');
    } catch (err: any) {
      console.error('Manual sync error:', err);
      showToast('No se pudo sincronizar con la nube. Usando datos en caché.', 'warning');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  }, [activeTab, isSyncing, activeCompanyId]);

  // Save Store Settings
  const handleSaveStoreSettings = async (newSettings: StoreSettings) => {
    setIsSyncing(true);
    const enrichedSettings: StoreSettings = { ...newSettings, companyId: activeCompanyId };
    setStoreSettings(enrichedSettings);
    setCachedStoreSettings(enrichedSettings, activeCompanyId);

    try {
      await saveStoreSettingsToFirestore(enrichedSettings, activeCompanyId);
      setCompanies((prev) => {
        const next = prev.map((c) =>
          c.slug === activeCompanyId
            ? {
                ...c,
                name: enrichedSettings.storeName || c.name,
                adminPassword: enrichedSettings.accessPassword || c.adminPassword,
                logoUrl: enrichedSettings.logoUrl,
                phone: enrichedSettings.phone || c.phone,
                tagline: enrichedSettings.tagline || c.tagline,
                address: enrichedSettings.address || c.address,
              }
            : c
        );
        setCachedCompanies(next);
        return next;
      });
      setLastSyncTime(new Date());

      logActivityInFirestore(
        {
          companyId: activeCompanyId,
          userName: userSession?.userName || 'Administrador',
          userRole: userSession?.role || 'admin',
          action: 'Actualizó la configuración general de la tienda',
          module: 'settings',
        },
        activeCompanyId
      );
    } finally {
      setIsSyncing(false);
    }
  };

  // Multi-Company SaaS Handlers (Create/Update/Delete/Switch Client Company)
  const handleSaveCompany = async (companyPayload: CompanyTenant) => {
    setIsSyncing(true);
    try {
      const saved = await saveCompanyToFirestore(companyPayload);
      setCompanies((prev) => {
        const idx = prev.findIndex((c) => c.slug === saved.slug);
        const next = idx >= 0 ? prev.map((c, i) => (i === idx ? saved : c)) : [saved, ...prev];
        setCachedCompanies(next);
        return next;
      });

      if (saved.slug === activeCompanyId) {
        setStoreSettings((prev) => ({
          ...prev,
          companyId: saved.slug,
          storeName: saved.name,
          tagline: saved.tagline || prev.tagline,
          logoUrl: saved.logoUrl ?? prev.logoUrl,
          phone: saved.phone || prev.phone,
          address: saved.address || prev.address,
          accessPassword: saved.adminPassword || prev.accessPassword,
          allowedModules: saved.allowedModules || prev.allowedModules || [...ALL_COMPANY_MODULES],
          enableDeliveryDvolada:
            saved.enableDeliveryDvolada !== undefined
              ? saved.enableDeliveryDvolada
              : prev.enableDeliveryDvolada ?? saved.slug === 'gosen',
          maxProducts: saved.maxProducts ?? prev.maxProducts ?? 0,
          maxUsers: saved.maxUsers ?? prev.maxUsers ?? 0,
        }));
      }
      setLastSyncTime(new Date());
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveSaaSGlobalConfig = async (cfg: SaaSGlobalConfig) => {
    setIsSyncing(true);
    try {
      const saved = await saveSaaSGlobalConfigToFirestore(cfg);
      setSaasGlobalConfig(saved);
      setLastSyncTime(new Date());
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDismissAnnouncement = (annId: string) => {
    setDismissedAnnouncements((prev) => {
      const next = Array.from(new Set([...prev, annId]));
      try {
        localStorage.setItem('stockmaster_dismissed_saas_announcements', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const handleDeleteCompany = async (slugToDelete: string) => {
    setIsSyncing(true);
    try {
      await deleteCompanyFromFirestore(slugToDelete);
      setCompanies((prev) => {
        const next = prev.filter((c) => c.slug !== slugToDelete);
        setCachedCompanies(next);
        return next;
      });
      if (activeCompanyId === slugToDelete) {
        handleSelectCompanyContext('gosen');
      }
      showToast(`Cliente "${slugToDelete}" eliminado`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Error al eliminar cliente', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSwitchCompanyWorkspace = (targetSlug: string) => {
    const clean = normalizeCompanySlug(targetSlug);
    handleSelectCompanyContext(clean);
    const targetObj = companies.find((c) => c.slug === clean);
    setUserSession((prev) => {
      if (!prev) return prev;
      const updated: UserSession = {
        ...prev,
        companyId: clean,
        companyName: targetObj?.name || clean.toUpperCase(),
        isStandaloneSaaS: false,
      };
      try {
        if (localStorage.getItem('stockmaster_user_session')) {
          localStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        } else {
          sessionStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        }
      } catch {}
      return updated;
    });
    setActiveTab('dashboard');
    showToast(
      `Inspeccionando tienda: ${targetObj?.name || clean.toUpperCase()}`,
      'success'
    );
  };

  const handleReturnToSaaSPortal = () => {
    setUserSession((prev) => {
      if (!prev) return prev;
      const updated: UserSession = {
        ...prev,
        isSuperAdmin: true,
        isStandaloneSaaS: true,
      };
      try {
        if (localStorage.getItem('stockmaster_user_session')) {
          localStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        } else {
          sessionStorage.setItem('stockmaster_user_session', JSON.stringify(updated));
        }
      } catch {}
      return updated;
    });
    setActiveTab('companies');
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
        showToast(`Conexión con Firestore activa (${result.latencyMs}ms)`, 'success');
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

  // Inventory Handlers (Optimistic local + cache update, 0 collection re-reads)
  const handleSaveProduct = async (product: Product, oldCode?: string) => {
    const isExisting = inventory.some(
      (p) => p.code.toLowerCase() === (oldCode || product.code).toLowerCase()
    );
    const activeComp = companies.find(
      (c) => normalizeCompanySlug(c.slug) === normalizeCompanySlug(activeCompanyId)
    );
    const effectiveMaxProducts = activeComp?.maxProducts || storeSettings.maxProducts || 0;
    if (!isExisting && effectiveMaxProducts > 0 && inventory.length >= effectiveMaxProducts) {
      showToast(
        `Límite de tu plan alcanzado (${inventory.length}/${effectiveMaxProducts} productos). Contacta al Administrador SaaS para ampliar tu plan.`,
        'warning'
      );
      return;
    }

    setIsSyncing(true);
    try {
      const normalizedProduct: Product = {
        ...product,
        id: getScopedDocId(product.code, activeCompanyId),
        companyId: activeCompanyId,
      };

      setInventory((prev) => {
        const index = prev.findIndex((p) => p.code.toLowerCase() === (oldCode || product.code).toLowerCase());
        let next: Product[];
        if (index >= 0) {
          next = [...prev];
          next[index] = normalizedProduct;
        } else {
          next = [normalizedProduct, ...prev];
        }
        setCachedInventory(next, Date.now(), activeCompanyId);
        return next;
      });

      await saveProductToFirestore(normalizedProduct, oldCode, activeCompanyId);
      setLastSyncTime(new Date());

      logActivityInFirestore(
        {
          userName: userSession?.userName || 'Usuario',
          userRole: userSession?.role || 'collaborator',
          action: `Guardó producto "${product.name}" (${product.code})`,
          module: 'inventory',
          details: `Stock: ${product.stock}, Precio: L. ${product.price.toFixed(2)}`,
        },
        activeCompanyId
      );

      showToast(`"${product.name}" guardado y sincronizado`, 'success');
    } catch (err: any) {
      console.error('Error saving product:', err);
      showToast('Error al guardar en Firestore: ' + (err.message || 'desconocido'), 'error');
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const handleBulkSaveProducts = async (
    productsToSave: Product[],
    newSuppliers: Supplier[],
    summary: { createdCount: number; updatedCount: number; totalUnitsProcessed: number; mode: 'add' | 'replace' }
  ) => {
    const activeComp = companies.find(
      (c) => normalizeCompanySlug(c.slug) === normalizeCompanySlug(activeCompanyId)
    );
    const effectiveMaxProducts = activeComp?.maxProducts || storeSettings.maxProducts || 0;
    if (effectiveMaxProducts > 0 && inventory.length + summary.createdCount > effectiveMaxProducts) {
      showToast(
        `Esta carga supera el límite de tu plan (${effectiveMaxProducts} productos máx). Tienes ${inventory.length} registrados e intentas crear ${summary.createdCount} nuevos.`,
        'warning'
      );
      throw new Error('Límite de plan excedido');
    }

    setIsSyncing(true);
    try {
      const normalizedProducts = productsToSave.map((p) => ({
        ...p,
        id: getScopedDocId(p.code, activeCompanyId),
        companyId: activeCompanyId,
      }));

      // Optimistic local state & cache update
      if (newSuppliers.length > 0) {
        setSuppliers((prev) => {
          const nextSup = [...prev, ...newSuppliers];
          setCachedSuppliers(nextSup, activeCompanyId);
          return nextSup;
        });
      }

      setInventory((prev) => {
        const map = new Map<string, Product>();
        prev.forEach((p) => map.set(p.code.trim().toLowerCase(), p));
        normalizedProducts.forEach((p) => map.set(p.code.trim().toLowerCase(), p));
        const nextInv = Array.from(map.values());
        setCachedInventory(nextInv, Date.now(), activeCompanyId);
        return nextInv;
      });

      await bulkSaveProductsToFirestore(normalizedProducts, newSuppliers, activeCompanyId);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'admin',
        action: `Carga masiva Excel (${productsToSave.length} artículos procesados)`,
        module: 'inventory',
        details: `Nuevos: ${summary.createdCount}, Actualizados: ${summary.updatedCount}, Modo: ${
          summary.mode === 'add' ? 'Sumar al stock' : 'Reemplazar stock'
        }`,
      });

      showToast(
        `¡Carga masiva exitosa! ${summary.createdCount} nuevos y ${summary.updatedCount} actualizados en Firebase.`,
        'success'
      );
    } catch (err: any) {
      console.error('Error in bulk save:', err);
      showToast('Error en carga masiva: ' + (err.message || 'desconocido'), 'error');
      throw err;
    } finally {
      setTimeout(() => setIsSyncing(false), 400);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    setIsSyncing(true);
    try {
      const itemToDelete = inventory.find((p) => p.id === id);
      const code = itemToDelete?.code;

      setInventory((prev) => {
        const next = prev.filter((p) => p.id !== id && (code ? p.code !== code : true));
        setCachedInventory(next, Date.now());
        return next;
      });

      await deleteProductFromFirestore(id, code);
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'admin',
        action: `Eliminó el producto "${itemToDelete?.name || id}" (${code || ''})`,
        module: 'inventory',
      });

      showToast('Artículo eliminado correctamente', 'info');
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
        const next = index >= 0 ? prev.map((s, i) => (i === index ? supplier : s)) : [...prev, supplier];
        setCachedSuppliers(next);
        return next;
      });

      if (oldName && oldName !== supplier.name) {
        setInventory((prev) => {
          const nextInv = prev.map((item) =>
            item.supplier === oldName ? { ...item, supplier: supplier.name.trim() } : item
          );
          setCachedInventory(nextInv, Date.now());
          return nextInv;
        });
      }

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
      setSuppliers((prev) => {
        const next = prev.filter((s) => s.id !== id);
        setCachedSuppliers(next);
        return next;
      });
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
      setCachedInventory(updatedInventory, Date.now());
      setAuditHistory((prev) => {
        const next = [...prev, historyRecord];
        setCachedAuditHistory(next);
        return next;
      });

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

  // Sales Handlers (Direct local stock deduction + cache update, 0 collection re-reads)
  const handleRecordSale = async (saleData: Omit<SaleRecord, 'id'>) => {
    setIsSyncing(true);
    try {
      const activeCashier = userSession?.userName || saleData.cashier || 'Administrador';
      const activeCashierRole =
        userSession?.role ||
        saleData.cashierRole ||
        (activeCashier.toLowerCase().includes('admin') ? 'admin' : 'collaborator');
      const payload = {
        ...saleData,
        cashier: activeCashier,
        cashierRole: activeCashierRole,
      };

      const recorded = await recordSaleInFirestore(payload, inventory, activeCompanyId);

      // Update local inventory stock & cache directly
      setInventory((prev) => {
        const nextInv = prev.map((prod) => {
          const soldItem = saleData.items.find(
            (it) => it.code.trim().toLowerCase() === prod.code.trim().toLowerCase() || it.productId === prod.id
          );
          if (!soldItem) return prod;
          return {
            ...prod,
            stock: Math.max(0, (Number(prod.stock) || 0) - (Number(soldItem.quantity) || 1)),
          };
        });
        setCachedInventory(nextInv, Date.now(), activeCompanyId);
        return nextInv;
      });

      // Prepend sale to local sales state & cache (deduplicated with real-time listener)
      setSales((prev) => {
        const nextSales = [recorded, ...prev.filter((s) => s.id !== recorded.id)];
        setCachedSales(nextSales, activeCompanyId);
        return nextSales;
      });

      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: activeCashier,
        userRole: userSession?.role || 'collaborator',
        action: `Registró Venta N° ${saleData.saleNumber} (${saleData.totalItems} ítems)`,
        module: 'sales',
        details: `Total: L. ${saleData.total.toFixed(2)} (${saleData.paymentMethod.toUpperCase()}) - Cliente: ${saleData.customerName || 'Consumidor Final'}`,
      }, activeCompanyId);

      return recorded;
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCancelSale = async (sale: SaleRecord) => {
    setIsSyncing(true);
    try {
      await cancelSaleInFirestore(sale, inventory, activeCompanyId);

      // Restore local inventory stock & cache directly
      setInventory((prev) => {
        const nextInv = prev.map((prod) => {
          const soldItem = sale.items.find(
            (it) => it.code.trim().toLowerCase() === prod.code.trim().toLowerCase() || it.productId === prod.id
          );
          if (!soldItem) return prod;
          return {
            ...prod,
            stock: (Number(prod.stock) || 0) + (Number(soldItem.quantity) || 1),
          };
        });
        setCachedInventory(nextInv, Date.now(), activeCompanyId);
        return nextInv;
      });

      setSales((prev) => {
        const nextSales = prev.map((s) => (s.id === sale.id ? { ...s, status: 'cancelled' as const } : s));
        setCachedSales(nextSales, activeCompanyId);
        return nextSales;
      });

      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || 'Usuario',
        userRole: userSession?.role || 'admin',
        action: `Anuló la Venta N° ${sale.saleNumber}`,
        module: 'sales',
        details: `Total devuelto al stock: L. ${sale.total.toFixed(2)}`,
      }, activeCompanyId);
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSavePOSFinanceData = async (nextData: POSFinanceStoreData) => {
    setIsSyncing(true);
    try {
      const saved = await savePOSFinanceDataToFirestore(nextData, activeCompanyId);
      setPosFinanceData(saved);
      setLastSyncTime(new Date());
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRecordCreditPayment = async (sale: SaleRecord, abone: CreditPaymentAbone) => {
    setIsSyncing(true);
    try {
      const updatedSale = await recordCreditPaymentInFirestore(sale, abone, activeCompanyId);
      setSales((prev) => {
        const nextSales = prev.map((s) => (s.id === sale.id ? updatedSale : s));
        setCachedSales(nextSales, activeCompanyId);
        return nextSales;
      });
      setLastSyncTime(new Date());

      logActivityInFirestore({
        userName: userSession?.userName || abone.receivedBy || 'Usuario',
        userRole: userSession?.role || 'collaborator',
        action: `Registró abono a Venta N° ${sale.saleNumber} (${sale.customerName || 'Cliente'})`,
        module: 'sales',
        details: `Abono: L. ${abone.amount.toFixed(2)} (${abone.paymentMethod.toUpperCase()}) - Restante: L. ${(updatedSale.balanceDue || 0).toFixed(2)}`,
      }, activeCompanyId);

      return updatedSale;
    } finally {
      setIsSyncing(false);
    }
  };

  // Supplier Purchases Handlers (Direct local stock addition + cache update)
  const handleRecordPurchase = async (purchaseData: Omit<PurchaseInvoice, 'id'>) => {
    setIsSyncing(true);
    try {
      const activeUser = userSession?.userName || purchaseData.receivedBy || 'Usuario';
      const payload = {
        ...purchaseData,
        receivedBy: activeUser,
      };

      const recorded = await recordPurchaseInFirestore(payload, inventory);

      setInventory((prev) => {
        const map = new Map<string, Product>();
        prev.forEach((p) => map.set(p.code.trim().toLowerCase(), p));

        purchaseData.items.forEach((item) => {
          const key = item.code.trim().toLowerCase();
          const existing = map.get(key);
          if (existing) {
            map.set(key, {
              ...existing,
              stock: (Number(existing.stock) || 0) + (Number(item.quantity) || 0),
              cost: Number(item.cost) || existing.cost,
              price: item.salePrice && item.salePrice > 0 ? Number(item.salePrice) : existing.price,
              supplier: existing.supplier || purchaseData.supplierName,
            });
          } else {
            map.set(key, {
              id: item.code.trim().replace(/\//g, '_'),
              code: item.code.trim(),
              name: item.name.trim(),
              category: item.category?.trim() || 'General',
              size: item.size?.trim() || '',
              supplier: purchaseData.supplierName.trim(),
              cost: Number(item.cost) || 0,
              price: item.salePrice && item.salePrice > 0 ? Number(item.salePrice) : (Number(item.cost) || 0) * 1.35,
              stock: Number(item.quantity) || 0,
              img: '',
            });
          }
        });

        const nextInv = Array.from(map.values());
        setCachedInventory(nextInv, Date.now());
        return nextInv;
      });

      setPurchases((prev) => {
        const nextPurchases = [recorded, ...prev];
        setCachedPurchases(nextPurchases);
        return nextPurchases;
      });

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

      setInventory((prev) => {
        const nextInv = prev.map((prod) => {
          const purchasedItem = purchase.items.find(
            (it) => it.code.trim().toLowerCase() === prod.code.trim().toLowerCase() || it.productId === prod.id
          );
          if (!purchasedItem) return prod;
          return {
            ...prod,
            stock: Math.max(0, (Number(prod.stock) || 0) - (Number(purchasedItem.quantity) || 0)),
          };
        });
        setCachedInventory(nextInv, Date.now());
        return nextInv;
      });

      setPurchases((prev) => {
        const nextPurchases = prev.map((p) => (p.id === purchase.id ? { ...p, status: 'cancelled' as const } : p));
        setCachedPurchases(nextPurchases);
        return nextPurchases;
      });

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
      const userId = userPayload.id || `usr_${Date.now()}`;
      const normalizedUser: UserAccount = { ...userPayload, id: userId };

      setUsers((prev) => {
        const idx = prev.findIndex((u) => u.id === userId);
        const next = idx >= 0 ? prev.map((u, i) => (i === idx ? normalizedUser : u)) : [...prev, normalizedUser];
        setCachedUsers(next);
        return next;
      });

      await saveUserToFirestore(normalizedUser);
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
      setUsers((prev) => {
        const next = prev.filter((u) => u.id !== userId);
        setCachedUsers(next);
        return next;
      });

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
      <div className="fixed inset-0 w-full h-full overflow-y-auto bg-slate-50 scroll-smooth">
        {showSplash && (
          <SplashScreen
            storeSettings={storeSettings}
            companyId={activeCompanyId}
            isExiting={isSplashExiting}
          />
        )}
        <PublicCatalogView
          inventory={inventory}
          storeSettings={storeSettings}
          isLoading={isInventoryLoading}
          isAdminPreview={isAdminPreviewMode}
          onBackToAdmin={() => setIsAdminPreviewMode(false)}
        />
      </div>
    );
  }

  // Login Screen if not authenticated
  if (!isAuthenticated || !userSession) {
    return (
      <div className="fixed inset-0 w-full h-full overflow-y-auto bg-slate-950 pt-[env(safe-area-inset-top,0px)] pb-[env(safe-area-inset-bottom,0px)]">
        {showSplash && (
          <SplashScreen
            storeSettings={storeSettings}
            companyId={activeCompanyId}
            isExiting={isSplashExiting}
          />
        )}
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
        <LoginView
          storeSettings={storeSettings}
          users={users}
          companies={companies}
          activeCompanyId={activeCompanyId}
          onSelectCompany={handleSelectCompanyContext}
          onLoginSuccess={handleLoginSuccess}
        />
      </div>
    );
  }

  const isSuperAdminSession = Boolean(
    userSession.role === 'admin' && userSession.isSuperAdmin === true
  );

  const activeCompanyTenant = companies.find(
    (c) => normalizeCompanySlug(c.slug) === normalizeCompanySlug(activeCompanyId)
  );

  // REAL-TIME MORA LOCK SCREEN: If a client is in arrears ('suspended') and is NOT the SaaS Super-Admin, block the app immediately!
  if (!isSuperAdminSession && activeCompanyTenant?.status === 'suspended') {
    return (
      <div className="fixed inset-0 w-full h-full bg-slate-950 text-white flex flex-col items-center justify-center p-6 select-none z-[999]">
        <div className="w-full max-w-md bg-slate-900 border border-rose-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-400 mx-auto">
            <Lock className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[11px] font-black uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" /> Cuenta en Mora • Acceso Deshabilitado
            </span>
            <h1 className="text-xl sm:text-2xl font-black text-white">
              {activeCompanyTenant.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              El servicio de tu aplicación se encuentra temporalmente <strong>suspendido por mora o pago pendiente de renovación</strong>.
            </p>
            {activeCompanyTenant.moraReason && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/30 text-xs text-rose-200 font-semibold">
                Motivo: {activeCompanyTenant.moraReason}
              </div>
            )}
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 space-y-1 text-left">
            <p className="font-bold text-slate-200">✅ Tu información está 100% segura</p>
            <p>
              Todo tu inventario, ventas y configuraciones están resguardados. Comunícate con el Administrador del sistema para realizar tu pago y reactivar tu cuenta al instante.
            </p>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            className="w-full py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs sm:text-sm transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Volver al Inicio de Sesión</span>
          </button>
        </div>
      </div>
    );
  }

  // STANDALONE SAAS SUPER-ADMIN PORTAL (Completely separate from Tienda Gosén and other stores)
  if (isSuperAdminSession && userSession.isStandaloneSaaS !== false) {
    return (
      <div className="fixed inset-0 w-full h-full flex flex-col overflow-hidden bg-slate-100 text-slate-800">
        {showSplash && (
          <SplashScreen
            storeSettings={storeSettings}
            companyId={activeCompanyId}
            isSaaSAdmin={true}
            isExiting={isSplashExiting}
            welcomeUser={splashWelcomeUser}
            welcomeRole={splashWelcomeRole}
          />
        )}
        <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />
        <CompaniesSaaSView
          companies={companies}
          activeCompanyId={activeCompanyId}
          saasGlobalConfig={saasGlobalConfig}
          onSaveCompany={handleSaveCompany}
          onDeleteCompany={handleDeleteCompany}
          onSwitchCompany={handleSwitchCompanyWorkspace}
          onSaveSaaSGlobalConfig={handleSaveSaaSGlobalConfig}
          onLogout={handleLogout}
          onRefreshCompanies={async () => {
            const fresh = await fetchCompaniesOnce(true);
            setCompanies(fresh);
            showToast('Lista de clientes sincronizada desde la nube', 'success');
          }}
          isStandalonePortal={true}
          showToast={showToast}
        />
      </div>
    );
  }

  // Compute SaaS-level allowed modules and plan limits for the active client company
  const companyAllowedModules: ActiveTab[] =
    activeCompanyTenant?.allowedModules && activeCompanyTenant.allowedModules.length > 0
      ? activeCompanyTenant.allowedModules
      : storeSettings.allowedModules && storeSettings.allowedModules.length > 0
      ? storeSettings.allowedModules
      : ALL_COMPANY_MODULES;

  const companyMaxProducts: number =
    activeCompanyTenant?.maxProducts ?? storeSettings.maxProducts ?? 0;
  const companyMaxUsers: number =
    activeCompanyTenant?.maxUsers ?? storeSettings.maxUsers ?? 0;

  // Compute Upcoming Subscription Expiry Warning for this Store
  const daysUntilBilling = getDaysUntilBilling(activeCompanyTenant?.nextBillingDate);
  const warningDaysThreshold = saasGlobalConfig.expiryWarningDays || 5;
  const showExpiryWarningBanner =
    !expiryBannerDismissedToday &&
    activeCompanyTenant &&
    activeCompanyTenant.plan !== 'vitalicio' &&
    daysUntilBilling !== null &&
    daysUntilBilling <= warningDaysThreshold;

  // Compute Active SaaS Announcements targeting 'all' or this specific store
  const visibleAnnouncements = (saasGlobalConfig.announcements || []).filter(
    (ann) =>
      ann.isActive &&
      (ann.targetCompanySlug === 'all' ||
        normalizeCompanySlug(ann.targetCompanySlug) === normalizeCompanySlug(activeCompanyId)) &&
      !dismissedAnnouncements.includes(ann.id)
  );

  const handleSendPaymentVoucherToSaaSAdmin = () => {
    const storeTitle = storeSettings.storeName || activeCompanyTenant?.name || activeCompanyId;
    const amountStr = Number(activeCompanyTenant?.price || 0).toLocaleString('es-HN', {
      minimumFractionDigits: 2,
    });
    const dueStr = formatShortDateEs(activeCompanyTenant?.nextBillingDate);
    const msg =
      `👋 Hola Administrador SaaS, envío el comprobante de pago de renovación para nuestra tienda:\n\n` +
      `• *Tienda:* ${storeTitle} (Código: \`${activeCompanyId}\`)\n` +
      `• *Fecha de Corte:* ${dueStr}\n` +
      `• *Monto del Plan:* L. ${amountStr}\n\n` +
      `Adjunto imagen del comprobante para actualizar nuestra fecha de corte. ¡Gracias!`;

    const cleanPhone = (saasGlobalConfig.saasAdminPhone || '').replace(/\D/g, '');
    const waUrl = cleanPhone
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');
  };

  // Filter navigation & bottom nav items based on SaaS company permissions + collaborator allowedTabs
  const baseRoleTabs: ActiveTab[] =
    userSession.role === 'admin'
      ? ALL_COMPANY_MODULES
      : (userSession.allowedTabs || ['sales', 'inventory', 'price-checker']);

  const allowedTabsList: ActiveTab[] = isSuperAdminSession
    ? ALL_COMPANY_MODULES
    : baseRoleTabs.filter((tab) => companyAllowedModules.includes(tab));

  // If the current activeTab was disabled by the SaaS Administrator, switch to the first allowed module
  const activeTabToRender: ActiveTab =
    activeTab === 'companies' && isSuperAdminSession
      ? 'companies'
      : allowedTabsList.includes(activeTab)
      ? activeTab
      : allowedTabsList[0] || 'sales';

  return (
    <div className="fixed inset-0 w-full h-full flex flex-col md:flex-row overflow-hidden text-slate-800 bg-slate-50">
      {showSplash && (
        <SplashScreen
          storeSettings={storeSettings}
          companyId={activeCompanyId}
          isSaaSAdmin={false}
          isExiting={isSplashExiting}
          welcomeUser={splashWelcomeUser}
          welcomeRole={splashWelcomeRole}
        />
      )}
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Main Sidebar */}
      <Sidebar
        activeTab={activeTabToRender}
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
        onUnlockSuperAdmin={handleUnlockSuperAdmin}
        onLockSuperAdmin={handleLockSuperAdmin}
        companyAllowedModules={companyAllowedModules}
      />

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-0 min-w-0 w-full h-full overflow-hidden relative bg-slate-50 transition-all duration-350 ease-in-out">
        {/* Top Floating Banner ONLY when SaaS Owner is inspecting a client's store */}
        {isSuperAdminSession && (
          <div className="bg-slate-950 text-white px-3 sm:px-4 py-2 flex items-center justify-between gap-2 border-b border-teal-500/30 shrink-0 z-40">
            <div className="flex items-center gap-2 text-xs min-w-0">
              <span className="px-2 py-0.5 rounded bg-teal-500/20 text-teal-300 border border-teal-500/40 font-black text-[10px] uppercase shrink-0">
                Modo Inspector SaaS
              </span>
              <span className="truncate text-slate-300">
                Viendo tienda: <strong className="text-white">{storeSettings.storeName || activeCompanyId.toUpperCase()}</strong>
              </span>
            </div>
            <button
              type="button"
              onClick={handleReturnToSaaSPortal}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-teal-600 hover:bg-teal-500 text-white font-extrabold text-xs transition-all cursor-pointer shrink-0 shadow-xs"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a mi Panel Central SaaS</span>
            </button>
          </div>
        )}

        {/* Automatic Upcoming Subscription Expiry Warning Banner (Visible to Store when <= warningDaysThreshold) */}
        {showExpiryWarningBanner && daysUntilBilling !== null && (
          <div
            className={`px-3 sm:px-4 py-2 flex items-center justify-between gap-2 border-b shrink-0 z-35 text-xs ${
              daysUntilBilling < 0
                ? 'bg-rose-600 text-white border-rose-700'
                : 'bg-amber-500 text-slate-950 border-amber-600/40'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Clock className="w-4 h-4 shrink-0" />
              <span className="font-bold truncate">
                {daysUntilBilling < 0
                  ? `⚠️ Tu suscripción venció el ${formatShortDateEs(activeCompanyTenant?.nextBillingDate)}. Realiza tu pago para evitar la suspensión del sistema.`
                  : daysUntilBilling === 0
                  ? `⚠️ Tu suscripción vence HOY (${formatShortDateEs(activeCompanyTenant?.nextBillingDate)}). Realiza tu pago para evitar suspensión.`
                  : `🔔 Tu suscripción vence el ${formatShortDateEs(activeCompanyTenant?.nextBillingDate)} (en ${daysUntilBilling} ${daysUntilBilling === 1 ? 'día' : 'días'}). Realiza tu pago para evitar suspensión.`}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSendPaymentVoucherToSaaSAdmin}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-extrabold text-[11px] transition-all cursor-pointer shadow-2xs ${
                  daysUntilBilling < 0
                    ? 'bg-white text-rose-700 hover:bg-rose-50'
                    : 'bg-slate-950 text-white hover:bg-slate-800'
                }`}
              >
                <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>Enviar Comprobante</span>
              </button>
              <button
                type="button"
                onClick={() => setExpiryBannerDismissedToday(true)}
                className="p-1 rounded hover:bg-black/10 cursor-pointer"
                title="Ocultar aviso por ahora"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Global / Targeted SaaS Admin Announcement Banner */}
        {visibleAnnouncements.map((ann) => (
          <div
            key={ann.id}
            className={`px-3 sm:px-4 py-2 flex items-center justify-between gap-2 border-b shrink-0 z-35 text-xs ${
              ann.type === 'warning'
                ? 'bg-rose-50 text-rose-950 border-rose-200'
                : ann.type === 'promo'
                ? 'bg-indigo-900 text-white border-indigo-800'
                : 'bg-teal-900 text-white border-teal-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <Megaphone className="w-4 h-4 shrink-0 text-amber-400" />
              <div className="min-w-0 truncate">
                <strong className="font-black mr-1.5">{ann.title}:</strong>
                <span className="opacity-95">{ann.message}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleDismissAnnouncement(ann.id)}
              className="px-2.5 py-1 rounded-lg bg-white/15 hover:bg-white/25 font-extrabold text-[11px] shrink-0 cursor-pointer"
            >
              Entendido
            </button>
          </div>
        ))}

        {/* Top Header - Compact & Responsive Mobile Layout */}
        <header className="w-full max-w-full overflow-hidden bg-white text-slate-800 px-3 sm:px-4 py-2 sm:py-2.5 flex items-center justify-between border-b border-slate-200/80 shadow-xs shrink-0 gap-2 z-30">
          {/* Left: Mobile/Desktop Sidebar Toggles + Store Branding */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
            {/* Mobile Drawer Hamburger Button */}
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen(true)}
              className="md:hidden inline-flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-2 rounded-xl bg-slate-900 hover:bg-slate-800 active:scale-95 text-white transition-all cursor-pointer shadow-xs shrink-0 text-xs font-bold"
              aria-label="Abrir menú de navegación"
              title="Abrir menú"
            >
              <Menu className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">Menú</span>
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
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1 overflow-hidden">
              {storeSettings.logoUrl ? (
                <div className="h-8 w-8 sm:h-9 sm:w-auto sm:max-w-[160px] rounded-lg p-0.5 shrink-0 flex items-center justify-center overflow-hidden bg-transparent">
                  <img
                    src={storeSettings.logoUrl}
                    alt={storeSettings.storeName || activeCompanyId.toUpperCase()}
                    className="h-full w-full object-contain rounded-md mix-blend-multiply filter drop-shadow-2xs"
                  />
                </div>
              ) : (
                <Store className="w-5 h-5 text-emerald-600 shrink-0" />
              )}
              <span className="font-extrabold text-slate-900 text-sm sm:text-base tracking-tight truncate block">
                {storeSettings.storeName || activeCompanyId.toUpperCase()}
              </span>
            </div>
          </div>

          {/* Right Controls: Manual Cloud Sync Button, User Profile Badge, Install App & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-slate-600 shrink-0">

            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              title="Sincronizar cambios recientes desde la nube (Modo ahorro de lecturas activo)"
              className={`inline-flex items-center justify-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer shrink-0 ${
                isSyncing
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border-slate-200/80 hover:border-emerald-200 active:scale-95'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">{isSyncing ? 'Sincronizando...' : 'Sincronizando'.slice(0, 0) || 'Sincronizar'}</span>
            </button>

            {userSession && (
              <div
                className="flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-slate-100 border border-slate-200/80 text-xs font-bold shrink-0"
                title={`${userSession.userName} (${userSession.role === 'admin' ? 'Admin' : 'Colaborador'})`}
              >
                {userSession.role === 'admin' ? (
                  <ShieldCheck className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-amber-600 shrink-0" />
                ) : (
                  <User className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-emerald-600 shrink-0" />
                )}
                <span className="hidden sm:inline text-slate-900 truncate max-w-[120px]">
                  {userSession.userName}
                </span>
                <span className="hidden md:inline text-[10px] text-slate-500 uppercase font-mono">
                  ({userSession.role === 'admin' ? 'Admin' : 'Colaborador'})
                </span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsInstallPromptOpen(true)}
              title="Instalar aplicación móvil o de escritorio"
              className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 transition-colors text-xs font-bold border border-emerald-200 cursor-pointer shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Instalar App</span>
            </button>

            <button
              type="button"
              onClick={handleLogout}
              title="Cerrar sesión del sistema"
              aria-label="Cerrar sesión"
              className="inline-flex items-center justify-center gap-1.5 p-2 sm:px-3 sm:py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-700 transition-all text-xs font-bold border border-rose-200 cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-rose-600 shrink-0" />
              <span className="hidden sm:inline">Salir</span>
            </button>
          </div>
        </header>

        {/* Tab Views Container — Reserves exact 60px on mobile for the fixed bottom bar */}
        <div className="flex-1 min-h-0 min-w-0 w-full flex flex-col overflow-hidden relative pb-[60px] md:pb-0">
          {activeTabToRender === 'dashboard' && allowedTabsList.includes('dashboard') && (
            <DashboardView
              inventory={inventory}
              auditHistory={auditHistory}
              sales={sales}
              expenses={posFinanceData.expenses}
              isLoading={isInventoryLoading}
              onOpenNewProduct={() => {
                handleTabChange('inventory');
                setOpenProductModalTrigger(true);
              }}
              onStartAudit={() => handleTabChange('audit')}
              onNavigateToSales={() => {
                setSalesSubTab('pos');
                handleTabChange('sales');
              }}
              onNavigateToPurchases={() => handleTabChange('purchases')}
              onNavigateToExpenses={() => {
                setSalesSubTab('expenses');
                handleTabChange('sales');
              }}
              onNavigateToCredits={() => {
                setSalesSubTab('credits');
                handleTabChange('sales');
              }}
              onFilterInventoryByCode={handleFilterInventoryByCode}
              onNavigateToAudit={() => handleTabChange('audit')}
            />
          )}

          {activeTabToRender === 'sales' && allowedTabsList.includes('sales') && (
            <SalesView
              inventory={inventory}
              sales={sales}
              storeSettings={storeSettings}
              userSession={userSession}
              users={users}
              isLoading={isInventoryLoading}
              initialSubTab={salesSubTab}
              posFinanceData={posFinanceData}
              onRecordSale={handleRecordSale}
              onCancelSale={handleCancelSale}
              onSavePOSFinanceData={handleSavePOSFinanceData}
              onRecordCreditPayment={handleRecordCreditPayment}
              showToast={showToast}
            />
          )}

          {activeTabToRender === 'inventory' && allowedTabsList.includes('inventory') && (
            <InventoryView
              inventory={inventory}
              suppliers={suppliers}
              storeSettings={storeSettings}
              isLoading={isInventoryLoading}
              initialSearchCode={inventorySearchQuery}
              maxProducts={companyMaxProducts}
              saasAdminPhone={saasGlobalConfig.saasAdminPhone}
              onSaveProduct={handleSaveProduct}
              onBulkSaveProducts={handleBulkSaveProducts}
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

          {activeTabToRender === 'price-checker' && allowedTabsList.includes('price-checker') && (
            <PriceCheckerTab
              inventory={inventory}
              showToast={showToast}
            />
          )}

          {activeTabToRender === 'catalog' && allowedTabsList.includes('catalog') && (
            <DigitalCatalogView
              storeSettings={storeSettings}
              inventory={inventory}
              onSaveSettings={handleSaveStoreSettings}
              onOpenPreview={() => setIsAdminPreviewMode(true)}
              showToast={showToast}
            />
          )}

          {activeTabToRender === 'purchases' && allowedTabsList.includes('purchases') && (
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

          {activeTabToRender === 'audit' && allowedTabsList.includes('audit') && (
            <AuditView
              inventory={inventory}
              suppliers={suppliers}
              onApplyAuditChanges={handleApplyAuditChanges}
              showToast={showToast}
              storeSettings={storeSettings}
            />
          )}

          {activeTabToRender === 'suppliers' && allowedTabsList.includes('suppliers') && (
            <SuppliersView
              suppliers={suppliers}
              inventory={inventory}
              onSaveSupplier={handleSaveSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              showModalInitially={openSupplierModalTrigger}
              onCloseInitialModal={() => setOpenSupplierModalTrigger(false)}
            />
          )}

          {activeTabToRender === 'users' && allowedTabsList.includes('users') && (
            <UserManagementView
              users={users}
              storeSettings={storeSettings}
              companyAllowedModules={companyAllowedModules}
              maxUsers={companyMaxUsers}
              onSaveUser={handleSaveUser}
              onDeleteUser={handleDeleteUser}
              showToast={showToast}
            />
          )}

          {activeTabToRender === 'activity' && allowedTabsList.includes('activity') && (
            <ActivityLogView
              logs={activityLogs}
              storeSettings={storeSettings}
              showToast={showToast}
            />
          )}

          {activeTabToRender === 'settings' && allowedTabsList.includes('settings') && (
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

          {activeTabToRender === 'companies' && isSuperAdminSession && (
            <CompaniesSaaSView
              companies={companies}
              activeCompanyId={activeCompanyId}
              saasGlobalConfig={saasGlobalConfig}
              onSaveCompany={handleSaveCompany}
              onDeleteCompany={handleDeleteCompany}
              onSwitchCompany={handleSwitchCompanyWorkspace}
              onSaveSaaSGlobalConfig={handleSaveSaaSGlobalConfig}
              onLockSuperAdmin={handleLockSuperAdmin}
              showToast={showToast}
            />
          )}
        </div>

        {/* Mobile Bottom Navigation Dock (< md) — Fixed 60px height, vertically centered & flush to bottom edge */}
        <nav
          aria-label="Navegación rápida móvil"
          className="md:hidden fixed bottom-0 left-0 right-0 w-full h-[60px] z-30 bg-white border-t border-slate-200 px-1.5 flex items-center justify-center shadow-[0_-4px_16px_rgba(15,23,42,0.08)] select-none"
        >
          <div className="grid grid-cols-5 items-center w-full max-w-md mx-auto h-full">
            {/* 1. Left Outer: INICIO (Dashboard) */}
            <button
              type="button"
              onClick={() => handleTabChange('dashboard')}
              className={`flex flex-col items-center justify-center h-12 px-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'dashboard'
                  ? 'bg-emerald-50/90 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 active:scale-95'
              } ${!allowedTabsList.includes('dashboard') ? 'opacity-45' : ''}`}
            >
              <LayoutGrid className="w-5 h-5 stroke-[2.2] shrink-0" />
              <span className="text-[9px] font-extrabold tracking-wide uppercase mt-1 leading-none whitespace-nowrap">
                INICIO
              </span>
            </button>

            {/* 2. Left Inner: INVENTARIO (Inventory) */}
            <button
              type="button"
              onClick={() => handleTabChange('inventory')}
              className={`flex flex-col items-center justify-center h-12 px-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'inventory'
                  ? 'bg-emerald-50/90 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 active:scale-95'
              } ${!allowedTabsList.includes('inventory') ? 'opacity-45' : ''}`}
            >
              <Package className="w-5 h-5 stroke-[2.1] shrink-0" />
              <span className="text-[8.5px] sm:text-[9px] font-extrabold tracking-tight uppercase mt-1 leading-none whitespace-nowrap">
                INVENTARIO
              </span>
            </button>

            {/* 3. Center Raised Action: VENTAS POS (Sales) */}
            <div className="flex flex-col items-center justify-center relative -mt-5 z-10">
              <button
                type="button"
                onClick={() => handleTabChange('sales')}
                className={`group flex flex-col items-center justify-center focus:outline-none cursor-pointer ${
                  !allowedTabsList.includes('sales') ? 'opacity-50' : ''
                }`}
              >
                {/* Raised Emerald Circle with White Bezel */}
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center border-[3.5px] border-white transition-all duration-200 group-active:scale-95 ${
                    activeTab === 'sales'
                      ? 'bg-emerald-600 shadow-[0_4px_14px_rgba(5,150,105,0.45)] ring-2 ring-emerald-500/40'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-[0_4px_12px_rgba(15,23,42,0.18)] ring-1 ring-slate-200'
                  }`}
                >
                  <ShoppingCart className="w-5 h-5 text-white stroke-[2.3] shrink-0" />
                </div>

                {/* Stadium Pill Label */}
                <div
                  className={`mt-0.5 px-2 py-0.5 rounded-full border transition-all shadow-2xs flex items-center justify-center ${
                    activeTab === 'sales'
                      ? 'bg-emerald-700 border-emerald-600 text-white'
                      : 'bg-slate-800 border-slate-700 text-white'
                  }`}
                >
                  <span className="text-[8px] font-black tracking-wider uppercase whitespace-nowrap leading-none">
                    VENTAS POS
                  </span>
                </div>
              </button>
            </div>

            {/* 4. Right Inner: CONSULTAR PRECIO (Price Checker) */}
            <button
              type="button"
              onClick={() => handleTabChange('price-checker')}
              className={`flex flex-col items-center justify-center h-12 px-0.5 rounded-xl transition-all cursor-pointer ${
                activeTab === 'price-checker'
                  ? 'bg-emerald-50/90 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 active:scale-95'
              } ${!allowedTabsList.includes('price-checker') ? 'opacity-45' : ''}`}
            >
              {/* Barcode Scanner Icon */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-5 h-5 shrink-0"
              >
                <path d="M3 7V5a2 2 0 0 1 2-2h2" />
                <path d="M17 3h2a2 2 0 0 1 2 2v2" />
                <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
                <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="8" y1="7" x2="8" y2="17" />
                <line x1="12" y1="7" x2="12" y2="17" />
                <line x1="16" y1="7" x2="16" y2="17" />
              </svg>
              <span className="text-[7.5px] sm:text-[8.5px] font-extrabold tracking-tighter uppercase mt-1 leading-none whitespace-nowrap">
                PRECIOS
              </span>
            </button>

            {/* 5. Right Outer: CONTEO (Audit) */}
            <button
              type="button"
              onClick={() => handleTabChange('audit')}
              className={`flex flex-col items-center justify-center h-12 px-1 rounded-xl transition-all cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-emerald-50/90 text-emerald-700 border border-emerald-200/80 shadow-2xs'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 active:scale-95'
              } ${!allowedTabsList.includes('audit') ? 'opacity-45' : ''}`}
            >
              <ClipboardCheck className="w-5 h-5 stroke-[2.1] shrink-0" />
              <span className="text-[9px] font-extrabold tracking-wide uppercase mt-1 leading-none whitespace-nowrap">
                CONTEO
              </span>
            </button>
          </div>
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
