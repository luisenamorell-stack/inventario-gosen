import React, { useState, useMemo, useRef } from 'react';
import { Product, StoreSettings } from '../types';
import { WhatsAppIcon } from './SalesView';
import { PublicCatalogGridSkeleton } from './SkeletonLoaders';
import { AdaptiveImage } from './AdaptiveImage';
import {
  buildBranchEmbedMapUrl,
  buildBranchExternalMapsUrl,
  getEffectiveStoreLocations,
} from '../utils/storeLocationUtils';
import {
  ShoppingBag,
  Search,
  Plus,
  Minus,
  Trash2,
  Phone,
  MapPin,
  CheckCircle2,
  Tag,
  Sparkles,
  X,
  ChevronRight,
  Store,
  ArrowLeft,
  Send,
  Copy,
  AlertCircle,
  ShoppingCart,
  Truck,
  Navigation,
  Clock,
  ExternalLink,
  Landmark,
  CreditCard,
  Banknote,
} from 'lucide-react';
import { CatalogBankAccountCard } from './StoreBankAccountsEditor';
import { getCachedStoreSettings } from '../firebase/firestoreService';

interface CartItem {
  product: Product;
  quantity: number;
}

interface PublicCatalogViewProps {
  inventory: Product[];
  storeSettings: StoreSettings;
  isLoading?: boolean;
  onBackToAdmin?: () => void;
  isAdminPreview?: boolean;
}

export const PublicCatalogView: React.FC<PublicCatalogViewProps> = ({
  inventory,
  storeSettings,
  isLoading = false,
  onBackToAdmin,
  isAdminPreview = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);

  const isGosen = (storeSettings.companyId || 'gosen') === 'gosen';
  const showDvolada = storeSettings.enableDeliveryDvolada ?? isGosen;
  const effectiveLogo = storeSettings.logoUrl || (isGosen ? '/store-logo.jpg' : '');
  const displayStoreName = storeSettings.storeName || (isGosen ? 'Tienda Gosén' : 'Catálogo Oficial');

  // Store Locations & Multi-Branch Google Maps State
  const effectiveLocations = useMemo(
    () =>
      storeSettings.showLocationsInCatalog === false
        ? []
        : getEffectiveStoreLocations(storeSettings),
    [storeSettings]
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [isMapPanelExpanded, setIsMapPanelExpanded] = useState<boolean>(true);
  const locationsSectionRef = useRef<HTMLDivElement | null>(null);

  const activeBranch = useMemo(() => {
    if (effectiveLocations.length === 0) return null;
    return (
      effectiveLocations.find((b) => b.id === selectedBranchId) ||
      effectiveLocations.find((b) => b.isMain) ||
      effectiveLocations[0]
    );
  }, [effectiveLocations, selectedBranchId]);

  // Delivery & Customer Delivery Info Form
  const [shippingMethod, setShippingMethod] = useState<'DVOLADA' | 'RETIRO'>('DVOLADA');
  const [pickupBranchId, setPickupBranchId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Efectivo' | 'Transferencia' | 'Tarjeta al recibir'>('Efectivo');
  const [selectedBankAccountId, setSelectedBankAccountId] = useState<string>('');
  const [orderNotes, setOrderNotes] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isBankModalOpen, setIsBankModalOpen] = useState<boolean>(false);

  const activeBankAccounts = useMemo(() => {
    const propBanks = Array.isArray(storeSettings.bankAccounts)
      ? storeSettings.bankAccounts.filter(
          (b) => b && b.isActive !== false && (b.accountNumber || b.bankName)
        )
      : [];
    if (propBanks.length > 0) return propBanks;

    const cached = getCachedStoreSettings(storeSettings.companyId || 'gosen');
    if (cached && Array.isArray(cached.bankAccounts)) {
      return cached.bankAccounts.filter(
        (b) => b && b.isActive !== false && (b.accountNumber || b.bankName)
      );
    }
    return [];
  }, [storeSettings.bankAccounts, storeSettings.companyId]);

  const selectedBankAccount = useMemo(() => {
    if (activeBankAccounts.length === 0) return null;
    return (
      activeBankAccounts.find((b) => b.id === selectedBankAccountId) ||
      activeBankAccounts[0]
    );
  }, [activeBankAccounts, selectedBankAccountId]);

  const showToast = (msg: string, _type?: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Stock Filter State ('all' shows full inventory, 'inStock' shows items with stock > 0)
  const [stockFilter, setStockFilter] = useState<'all' | 'inStock'>('all');

  // Filtered inventory by stock state
  const baseInventory = useMemo(() => {
    if (stockFilter === 'inStock') {
      return inventory.filter((p) => (Number(p.stock) || 0) > 0);
    }
    return inventory;
  }, [inventory, stockFilter]);

  // Categories list from full inventory
  const categories = useMemo(() => {
    const set = new Set<string>();
    inventory.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [inventory]);

  // Filtered catalog by search, category, and stock filter
  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return baseInventory.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    });
  }, [baseInventory, selectedCategory, searchQuery]);

  // Count of items in stock
  const inStockCount = useMemo(() => {
    return inventory.filter((p) => (Number(p.stock) || 0) > 0).length;
  }, [inventory]);

  // Cart Helpers
  const addToCart = (product: Product) => {
    const existing = cart.find((item) => item.product.code === product.code);
    const maxStock = Number(product.stock) || 0;

    if (maxStock <= 0) {
      showToast(`"${product.name}" no tiene stock registrado, pero se agregará a tu pedido como solicitud.`, 'info');
    } else if (existing && existing.quantity >= maxStock) {
      showToast(`Solo hay ${maxStock} unidades disponibles en inventario.`);
      return;
    }

    if (existing) {
      setCart(
        cart.map((item) =>
          item.product.code === product.code
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setCart([...cart, { product, quantity: 1 }]);
    }
  };

  const updateQuantity = (code: string, qty: number) => {
    if (qty <= 0) {
      removeFromCart(code);
      return;
    }
    const item = cart.find((it) => it.product.code === code);
    if (item) {
      const maxStock = Number(item.product.stock) || 0;
      if (qty > maxStock) {
        showToast(`Solo hay ${maxStock} unidades disponibles.`);
        return;
      }
    }
    setCart(
      cart.map((item) =>
        item.product.code === code ? { ...item, quantity: qty } : item
      )
    );
  };

  const removeFromCart = (code: string) => {
    setCart(cart.filter((item) => item.product.code !== code));
  };

  const totalCartItemsCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0);
  }, [cart]);

  // Format WhatsApp Order Message
  const buildWhatsAppMessage = (): string => {
    const sName = displayStoreName.toUpperCase();
    const chosenPickupBranch =
      effectiveLocations.find((b) => b.id === pickupBranchId) ||
      activeBranch ||
      effectiveLocations[0] ||
      null;

    const deliveryMethodText =
      shippingMethod === 'DVOLADA'
        ? showDvolada
          ? "D'VOLADA Servicios de Delivery 🚀"
          : 'Envío a Domicilio 🛵'
        : chosenPickupBranch && effectiveLocations.length > 1
        ? `Retiro en Tienda (${chosenPickupBranch.name}) 🏪`
        : 'Retiro en Tienda 🏪';
    let text = `🛍️ *NUEVO PEDIDO DESDE EL CATÁLOGO DIGITAL*\n`;
    text += `🏪 *${sName}*\n`;
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `👤 *Cliente:* ${customerName.trim() || 'Sin especificar'}\n`;
    if (customerPhone.trim()) {
      text += `📞 *Teléfono:* ${customerPhone.trim()}\n`;
    }
    text += `🛵 *Método de entrega:* ${deliveryMethodText}\n`;
    if (shippingMethod === 'DVOLADA' && customerAddress.trim()) {
      text += `📍 *Dirección de envío:* ${customerAddress.trim()}\n`;
    } else if (shippingMethod === 'RETIRO' && chosenPickupBranch) {
      text += `📍 *Sucursal de retiro:* ${chosenPickupBranch.name}${
        chosenPickupBranch.address ? ` — ${chosenPickupBranch.address}` : ''
      }\n`;
    }
    text += `💳 *Método de pago preferido:* ${
      paymentMethod === 'Transferencia' ? 'Transferencia Bancaria' : paymentMethod
    }\n`;
    if (paymentMethod === 'Transferencia' && selectedBankAccount) {
      text += `🏦 *Cuenta seleccionada para transferencia:* ${selectedBankAccount.bankName} — Cta ${selectedBankAccount.accountType || 'Ahorro'}: ${selectedBankAccount.accountNumber} (Titular: ${selectedBankAccount.holderName})\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `📦 *DETALLE DEL PEDIDO (${totalCartItemsCount} ${totalCartItemsCount === 1 ? 'producto' : 'productos'}):*\n\n`;

    cart.forEach((item) => {
      const sizeStr = item.product.size ? ` (Talla: ${item.product.size})` : '';
      const itemSubtotal = (item.product.price * item.quantity).toFixed(2);
      text += `• *${item.quantity}x* ${item.product.name}${sizeStr}\n`;
      text += `  ↳ Total: L. ${itemSubtotal}  _(L. ${item.product.price.toFixed(2)} c/u)_\n`;
    });

    text += `\n━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `💰 *TOTAL A PAGAR:* L. ${cartTotal.toFixed(2)}\n`;
    if (orderNotes.trim()) {
      text += `📝 *Notas adicionales:* ${orderNotes.trim()}\n`;
    }
    text += `━━━━━━━━━━━━━━━━━━━━━\n`;
    text += `¡Hola! Quisiera realizar este pedido de productos disponibles en su catálogo digital. ¿Me confirman la disponibilidad para envío?`;

    return text;
  };

  // Send Order via WhatsApp
  const handleSendOrderWhatsApp = () => {
    if (cart.length === 0) {
      showToast('Tu carrito está vacío. Agrega productos para realizar un pedido.');
      return;
    }
    if (!customerName.trim()) {
      showToast('Por favor escribe tu nombre para la entrega del pedido.');
      return;
    }

    const chosenPickupBranch =
      shippingMethod === 'RETIRO'
        ? effectiveLocations.find((b) => b.id === pickupBranchId) || activeBranch
        : null;

    const message = buildWhatsAppMessage();
    const rawTargetPhone = (
      chosenPickupBranch?.phone ||
      storeSettings.whatsappOrderPhone ||
      storeSettings.phone ||
      ''
    ).trim();
    const cleanDigits = rawTargetPhone.replace(/\D/g, '');

    let url = '';
    if (cleanDigits.length > 0) {
      const finalPhone = cleanDigits.length === 8 ? `504${cleanDigits}` : cleanDigits;
      url = `https://wa.me/${finalPhone}?text=${encodeURIComponent(message)}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${encodeURIComponent(message)}`;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
    showToast('¡Abriendo WhatsApp para enviar tu pedido a la tienda!');
  };

  const handleCopyOrderText = async () => {
    try {
      const msg = buildWhatsAppMessage();
      await navigator.clipboard.writeText(msg);
      showToast('¡Texto del pedido copiado al portapapeles!');
    } catch {
      showToast('No se pudo copiar el texto.');
    }
  };

  return (
    <div className="w-full min-h-full flex flex-col bg-slate-50 text-slate-800 font-sans selection:bg-emerald-500 selection:text-white pb-48">
      {/* Toast Floating Alert */}
      {toastMessage && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-emerald-600 text-white px-4 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200 border border-emerald-400">
          <Sparkles className="w-4 h-4 text-emerald-200" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Admin Preview Header Banner */}
      {isAdminPreview && (
        <div className="bg-emerald-600 text-white text-xs py-2 px-4 flex items-center justify-between font-bold border-b border-emerald-500 sticky top-0 z-40 shadow-sm">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-200" />
            <span>Vista Previa del Cliente: Así verán tus clientes el Catálogo Digital.</span>
          </div>
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="bg-slate-900 hover:bg-slate-800 text-white px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver a la Administración</span>
            </button>
          )}
        </div>
      )}

      {/* Store Header & Branding */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-6 shadow-2xs">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            {effectiveLogo ? (
              <div className="w-full sm:w-auto max-w-[240px] sm:max-w-[300px] h-20 sm:h-24 flex items-center justify-center sm:justify-start overflow-hidden shrink-0 bg-white rounded-2xl border border-slate-100 p-1.5 shadow-2xs">
                <AdaptiveImage
                  src={effectiveLogo}
                  alt={displayStoreName}
                  variant="logo"
                  className="w-full h-full"
                  imgClassName="rounded-xl drop-shadow-2xs"
                  fallback={
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
                      <Store className="w-9 h-9" />
                    </div>
                  }
                />
              </div>
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 shadow-2xs">
                <Store className="w-9 h-9" />
              </div>
            )}
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold tracking-wide uppercase">
                <Store className="w-3.5 h-3.5 text-emerald-600" />
                <span>Catálogo Digital Oficial</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
                {displayStoreName}
              </h1>
              {storeSettings.tagline && (
                <p className="text-xs sm:text-sm text-slate-500 font-medium">
                  {storeSettings.tagline}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 text-xs text-slate-600 pt-1">
                {storeSettings.phone && (
                  <span className="flex items-center gap-1 font-semibold text-emerald-700">
                    <Phone className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{storeSettings.phone}</span>
                  </span>
                )}
                {storeSettings.address && (
                  <span className="flex items-center gap-1 text-slate-500">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{storeSettings.address}</span>
                  </span>
                )}
                {effectiveLocations.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsMapPanelExpanded(true);
                      setTimeout(() => {
                        locationsSectionRef.current?.scrollIntoView({
                          behavior: 'smooth',
                          block: 'start',
                        });
                      }, 80);
                    }}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-2xs transition-all cursor-pointer"
                  >
                    <MapPin className="w-3 h-3" />
                    <span>
                      {effectiveLocations.length === 1
                        ? 'Ver Ubicación en Google Maps'
                        : `Ver Nuestras ${effectiveLocations.length} Tiendas en Google Maps`}
                    </span>
                  </button>
                )}
                {activeBankAccounts.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setIsBankModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] shadow-2xs transition-all cursor-pointer"
                  >
                    <Landmark className="w-3 h-3 text-emerald-400" />
                    <span>
                      Cuentas Bancarias ({activeBankAccounts.length})
                    </span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Cart Counter Trigger Badge */}
          {cart.length > 0 && (
            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-4 py-3 rounded-2xl shadow-md transition-all flex items-center gap-2.5 cursor-pointer hover:scale-105 active:scale-95 border border-emerald-500"
            >
              <div className="relative">
                <ShoppingCart className="w-5 h-5 text-white" />
                <span className="absolute -top-2 -right-2 bg-amber-400 text-slate-950 font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-emerald-700">
                  {totalCartItemsCount}
                </span>
              </div>
              <div className="text-left">
                <div className="text-[10px] text-emerald-100 uppercase tracking-wide">Mi Pedido</div>
                <div className="text-sm font-black">L. {cartTotal.toFixed(2)}</div>
              </div>
            </button>
          )}
        </div>

        {/* Welcome Callout Banner */}
        <div className="max-w-5xl mx-auto mt-5 bg-emerald-50/90 p-3.5 sm:p-4 rounded-2xl border border-emerald-200 flex items-center gap-3 shadow-2xs">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 shrink-0">
            <WhatsAppIcon className="w-6 h-6 fill-emerald-600" />
          </div>
          <div className="text-xs sm:text-sm text-emerald-950 font-medium leading-snug">
            {storeSettings.catalogWelcomeMsg || (
              <>
                <strong>¡Bienvenidos a nuestro catálogo online!</strong> Selecciona los artículos disponibles que te gusten y envíanos tu pedido directamente por WhatsApp.
              </>
            )}
          </div>
        </div>

        {/* Delivery Partner Banner - D'VOLADA (Only if enabled for this client) */}
        {showDvolada && (
          <div className="max-w-5xl mx-auto mt-3 bg-orange-50/90 p-3.5 sm:p-4 rounded-2xl border border-orange-200 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-2xs relative overflow-hidden">
            <div className="flex items-center gap-3">
              <div className="bg-white p-1 rounded-xl shadow-xs shrink-0 border border-orange-200">
                <img
                  src="/dvolada-delivery.jpg"
                  alt="D'VOLADA Servicios de Delivery"
                  className="h-10 sm:h-12 object-contain rounded-lg"
                />
              </div>
              <div className="text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs font-black text-orange-800 uppercase tracking-wider">
                  <Truck className="w-3.5 h-3.5 text-orange-600" />
                  <span>Delivery Oficial D'VOLADA</span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-slate-800 mt-0.5 leading-snug">
                  Envíos rápidos y seguros a domicilio en toda la ciudad con <strong>D'VOLADA Servicios de Delivery</strong>.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-orange-100 text-orange-900 border border-orange-300 text-[11px] font-extrabold px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 shadow-2xs">
              <span>🚀 Entregas Directas a Domicilio</span>
            </div>
          </div>
        )}
      </header>

      {/* Main Catalog Content */}
      <main className="max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5 flex-1">
        {/* Search & Category Filter Toolbar */}
        <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200/90 space-y-3 shadow-xs">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar productos en el catálogo..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Category Filter Pills & Stock Toggle */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-thin">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
              <button
                onClick={() => setStockFilter('all')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  stockFilter === 'all'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({inventory.length})
              </button>
              <button
                onClick={() => setStockFilter('inStock')}
                className={`px-3 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                  stockFilter === 'inStock'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Solo Stock ({inStockCount})
              </button>
            </div>

            <span className="text-slate-300 font-bold">|</span>

            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
              }`}
            >
              Todas las categorías
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-xl font-bold whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Product Catalog Grid */}
        {isLoading ? (
          <PublicCatalogGridSkeleton count={8} />
        ) : filteredProducts.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center text-slate-500 space-y-3 shadow-2xs">
            <ShoppingBag className="w-12 h-12 mx-auto text-slate-400 stroke-1" />
            <p className="font-bold text-slate-800 text-base">No se encontraron productos en esta selección</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Intenta cambiar los filtros, buscar por otro término o desactivar el filtro de stock.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filteredProducts.map((product) => {
              const stockNum = Number(product.stock) || 0;
              const cartItem = cart.find((it) => it.product.code === product.code);
              const qtyInCart = cartItem?.quantity || 0;

              return (
                <div
                  key={product.code}
                  className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-col justify-between transition-all hover:border-emerald-500/60 hover:shadow-md shadow-2xs group relative"
                >
                  {/* Image / Placeholder (Smart Adaptive Container) */}
                  <div className="aspect-square w-full rounded-xl bg-slate-50 overflow-hidden relative mb-2.5 flex items-center justify-center border border-slate-200/80">
                    <AdaptiveImage
                      src={product.img}
                      alt={product.name}
                      variant="product"
                      enableZoom
                      hoverScale
                      fallback={
                        <div className="flex flex-col items-center justify-center text-slate-400 p-2 text-center">
                          <ShoppingBag className="w-8 h-8 mb-1 stroke-1 text-slate-300" />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                            {displayStoreName}
                          </span>
                        </div>
                      }
                    />

                    {/* Stock badge */}
                    {stockNum > 0 ? (
                      <span className="absolute top-2 left-2 z-20 pointer-events-none text-[10px] font-extrabold bg-emerald-50/95 backdrop-blur-md text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-200 shadow-xs">
                        ✓ Disponible ({stockNum})
                      </span>
                    ) : (
                      <span className="absolute top-2 left-2 z-20 pointer-events-none text-[10px] font-extrabold bg-rose-50/95 backdrop-blur-md text-rose-800 px-2 py-0.5 rounded-full border border-rose-200 shadow-xs">
                        🔴 Agotado / Solicitar
                      </span>
                    )}

                    {/* Quantity in cart pill */}
                    {qtyInCart > 0 && (
                      <span className="absolute top-2 right-2 z-20 pointer-events-none text-[11px] font-black bg-amber-400 text-slate-950 px-2 py-0.5 rounded-full shadow-xs">
                        {qtyInCart} en pedido
                      </span>
                    )}
                  </div>

                  {/* Product Details */}
                  <div className="space-y-1 mb-3 flex-1 flex flex-col">
                    <div className="flex items-center justify-between gap-1 text-[10px] text-slate-500 font-mono">
                      <span className="font-bold text-slate-600">{product.code}</span>
                      {product.size && (
                        <span className="bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded font-semibold font-sans border border-slate-200">
                          Talla: {product.size}
                        </span>
                      )}
                    </div>
                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-2 leading-snug group-hover:text-emerald-700 transition-colors">
                      {product.name}
                    </h3>
                    {product.category && (
                      <span className="text-[10px] text-slate-500 font-medium block">
                        Categoría: {product.category}
                      </span>
                    )}
                  </div>

                  {/* Price & Add Action */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
                    <div>
                      <span className="text-[10px] text-slate-400 block -mb-0.5">Precio</span>
                      <span className="font-black text-emerald-700 text-sm sm:text-base">
                        L. {product.price.toFixed(2)}
                      </span>
                    </div>

                    {qtyInCart === 0 ? (
                      <button
                        onClick={() => addToCart(product)}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white p-2 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 shrink-0"
                        title="Agregar a mi pedido"
                      >
                        <Plus className="w-4 h-4" />
                        <span className="hidden sm:inline">Agregar</span>
                      </button>
                    ) : (
                      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                        <button
                          onClick={() => updateQuantity(product.code, qtyInCart - 1)}
                          className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg cursor-pointer"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-xs font-black text-slate-900 px-1.5">
                          {qtyInCart}
                        </span>
                        <button
                          onClick={() => updateQuantity(product.code, qtyInCart + 1)}
                          className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg cursor-pointer"
                          disabled={qtyInCart >= stockNum}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ==================== STORE LOCATIONS & GOOGLE MAPS SECTION ==================== */}
        {effectiveLocations.length > 0 && activeBranch && (
          <section
            ref={locationsSectionRef}
            className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden mt-6"
          >
            {/* Section Header */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                      {effectiveLocations.length === 1
                        ? 'Ubicación de Nuestra Tienda'
                        : `Nuestras Tiendas y Sucursales (${effectiveLocations.length})`}
                    </h2>
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-extrabold uppercase tracking-wider">
                      Google Maps
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">
                    {effectiveLocations.length === 1
                      ? 'Visítanos en nuestro local o abre la ruta directa en Google Maps.'
                      : 'Selecciona cualquiera de nuestras tiendas para ver su dirección, horario y ubicación exacta en el mapa.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMapPanelExpanded((prev) => !prev)}
                className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer shrink-0"
              >
                {isMapPanelExpanded ? 'Ocultar Mapa' : 'Mostrar Mapa'}
              </button>
            </div>

            {isMapPanelExpanded && (
              <div className="p-4 sm:p-5 space-y-4">
                {/* Branch Selector Cards when the store has MORE THAN 1 location */}
                {effectiveLocations.length > 1 && (
                  <div className="space-y-2">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 block">
                      Selecciona una Tienda / Sucursal ({effectiveLocations.length} disponibles):
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {effectiveLocations.map((branch, idx) => {
                        const isSelected = activeBranch.id === branch.id;
                        return (
                          <button
                            key={branch.id}
                            type="button"
                            onClick={() => setSelectedBranchId(branch.id)}
                            className={`p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-2.5 ${
                              isSelected
                                ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                                : 'bg-slate-50/70 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-xl font-black text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                                isSelected
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-200 text-slate-700'
                              }`}
                            >
                              {idx + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-xs text-slate-900 truncate">
                                  {branch.name}
                                </span>
                                {branch.isMain && (
                                  <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-300 shrink-0">
                                    Principal
                                  </span>
                                )}
                              </div>
                              {branch.city && (
                                <span className="text-[11px] font-semibold text-emerald-700 block truncate">
                                  {branch.city}
                                </span>
                              )}
                              {branch.address && (
                                <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                  {branch.address}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Active Branch Details + Interactive Google Map Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                  {/* Left: Selected Branch Information & Action Buttons (5 cols) */}
                  <div className="lg:col-span-5 bg-slate-50 rounded-2xl p-4 border border-slate-200/90 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 block">
                            {effectiveLocations.length > 1
                              ? 'Sucursal Seleccionada'
                              : 'Tienda Oficial'}
                          </span>
                          <h3 className="text-base sm:text-lg font-black text-slate-900">
                            {activeBranch.name || displayStoreName}
                          </h3>
                          {activeBranch.city && (
                            <span className="text-xs font-bold text-slate-600 block">
                              {activeBranch.city}
                            </span>
                          )}
                        </div>
                        <span className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
                          <Store className="w-5 h-5" />
                        </span>
                      </div>

                      <div className="space-y-2 text-xs text-slate-700 pt-2 border-t border-slate-200/80">
                        {activeBranch.address && (
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-slate-900 block">Dirección:</span>
                              <span className="text-slate-600 leading-relaxed">
                                {activeBranch.address}
                              </span>
                            </div>
                          </div>
                        )}

                        {activeBranch.schedule && (
                          <div className="flex items-start gap-2">
                            <Clock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-slate-900 block">
                                Horario de Atención:
                              </span>
                              <span className="text-slate-600">{activeBranch.schedule}</span>
                            </div>
                          </div>
                        )}

                        {(activeBranch.phone || storeSettings.phone) && (
                          <div className="flex items-start gap-2">
                            <Phone className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <span className="font-bold text-slate-900 block">
                                Teléfono / WhatsApp:
                              </span>
                              <span className="text-slate-600 font-semibold">
                                {activeBranch.phone || storeSettings.phone}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Direct Action Buttons: Open in Google Maps & WhatsApp */}
                    <div className="space-y-2 pt-3 border-t border-slate-200/80">
                      <a
                        href={buildBranchExternalMapsUrl(activeBranch, displayStoreName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                      >
                        <Navigation className="w-4 h-4" />
                        <span>Cómo llegar en Google Maps</span>
                        <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                      </a>

                      {(activeBranch.phone || storeSettings.whatsappOrderPhone || storeSettings.phone) && (
                        <button
                          type="button"
                          onClick={() => {
                            const rawPhone = (
                              activeBranch.phone ||
                              storeSettings.whatsappOrderPhone ||
                              storeSettings.phone ||
                              ''
                            ).replace(/\D/g, '');
                            const clean =
                              rawPhone.length === 8 ? `504${rawPhone}` : rawPhone;
                            const msg = `¡Hola! Vi la ubicación de *${
                              activeBranch.name || displayStoreName
                            }* en su Catálogo Digital y quisiera hacer una consulta.`;
                            const url = clean
                              ? `https://wa.me/${clean}?text=${encodeURIComponent(msg)}`
                              : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                          className="w-full py-2 px-4 rounded-xl bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300 font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                        >
                          <WhatsAppIcon className="w-4 h-4 fill-emerald-600" />
                          <span>Escribir por WhatsApp a esta Tienda</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Embedded Interactive Google Map (7 cols) */}
                  <div className="lg:col-span-7 min-h-[260px] sm:min-h-[310px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 relative shadow-inner">
                    <iframe
                      key={activeBranch.id}
                      title={`Ubicación en Google Maps de ${
                        activeBranch.name || displayStoreName
                      }`}
                      src={buildBranchEmbedMapUrl(activeBranch, displayStoreName)}
                      className="w-full h-full min-h-[260px] sm:min-h-[310px] border-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      {/* Floating Bottom Cart Bar (if cart has items) */}
      {cart.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-2xl">
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
                {totalCartItemsCount}
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-500 block">Tu Pedido</span>
                <span className="text-lg font-black text-slate-900">L. {cartTotal.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-5 py-2.5 rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer border border-emerald-500 text-xs sm:text-sm"
            >
              <span>Ver Pedido y Enviar WhatsApp</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== CUSTOMER ORDER MODAL ==================== */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh] text-slate-800">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200">
                  <WhatsAppIcon className="w-5 h-5 fill-emerald-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">Confirmar Pedido por WhatsApp</h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {displayStoreName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOrderModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Order Items + Delivery Info Form */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Order Items Table / Summary */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold uppercase text-slate-500 pb-1.5 border-b border-slate-200">
                  <span>Productos Solicitados ({totalCartItemsCount})</span>
                  <span>Subtotal</span>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1 text-xs">
                  {cart.map((item) => (
                    <div key={item.product.code} className="flex items-center justify-between gap-2 py-1 border-b border-slate-200/60 last:border-b-0">
                      <div className="flex-1 min-w-0">
                        <span className="font-bold text-slate-900 block truncate">{item.product.name}</span>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 font-medium">
                          <span>L. {item.product.price.toFixed(2)} c/u</span>
                          {item.product.size && <span>• Talla: {item.product.size}</span>}
                        </div>
                      </div>

                      {/* Quantity switcher */}
                      <div className="flex items-center gap-1 bg-white border border-slate-200 px-1.5 py-0.5 rounded-lg shrink-0 shadow-2xs">
                        <button
                          onClick={() => updateQuantity(item.product.code, item.quantity - 1)}
                          className="text-slate-500 hover:text-slate-900 text-xs font-bold px-1"
                        >
                          -
                        </button>
                        <span className="font-extrabold text-slate-900 text-xs px-1">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.code, item.quantity + 1)}
                          className="text-slate-500 hover:text-slate-900 text-xs font-bold px-1"
                        >
                          +
                        </button>
                      </div>

                      <span className="font-black text-emerald-700 shrink-0 min-w-[65px] text-right">
                        L. {(item.product.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total Row */}
                <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-sm font-black">
                  <span className="text-slate-700">TOTAL ESTIMADO:</span>
                  <span className="text-emerald-700 text-base">L. {cartTotal.toFixed(2)}</span>
                </div>
              </div>

              {/* Delivery Partner Selection */}
              <div className="space-y-2 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                <label className="block font-bold text-slate-800 text-xs uppercase tracking-wide">
                  Selecciona el Método de Entrega
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Option 1: Home Delivery (D'VOLADA if enabled, otherwise Generic Home Delivery) */}
                  <button
                    type="button"
                    onClick={() => setShippingMethod('DVOLADA')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      shippingMethod === 'DVOLADA'
                        ? showDvolada
                          ? 'bg-orange-50 border-orange-400 text-slate-900 ring-2 ring-orange-500/30 shadow-xs'
                          : 'bg-emerald-50 border-emerald-500 text-slate-900 ring-2 ring-emerald-500/30 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {showDvolada ? (
                        <img
                          src="/dvolada-delivery.jpg"
                          alt="D'VOLADA Delivery"
                          className="h-8 object-contain bg-white p-0.5 rounded-lg shrink-0 border border-orange-200"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0 border border-emerald-200">
                          <Truck className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs text-slate-900 truncate">
                          {showDvolada ? "D'VOLADA Delivery" : 'Envío a Domicilio'}
                        </div>
                        <div className={`text-[10px] font-semibold truncate ${showDvolada ? 'text-orange-800' : 'text-emerald-700'}`}>
                          {showDvolada ? 'Envío rápido a domicilio 🚀' : 'Recibir en mi dirección 🛵'}
                        </div>
                      </div>
                    </div>
                    <div
                      className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                        shippingMethod === 'DVOLADA'
                          ? showDvolada
                            ? 'border-orange-500 bg-orange-500'
                            : 'border-emerald-500 bg-emerald-600'
                          : 'border-slate-300'
                      }`}
                    >
                      {shippingMethod === 'DVOLADA' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </button>

                  {/* Option 2: Retiro en Tienda */}
                  <button
                    type="button"
                    onClick={() => setShippingMethod('RETIRO')}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                      shippingMethod === 'RETIRO'
                        ? 'bg-emerald-50 border-emerald-500 text-slate-900 ring-2 ring-emerald-500/30 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:text-slate-900 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold shrink-0 border border-emerald-200">
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-extrabold text-xs text-slate-900">Retiro en Tienda</div>
                        <div className="text-[10px] text-slate-500 font-medium">Pasar a recoger en el local</div>
                      </div>
                    </div>
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${shippingMethod === 'RETIRO' ? 'border-emerald-500 bg-emerald-600' : 'border-slate-300'}`}>
                      {shippingMethod === 'RETIRO' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                    </div>
                  </button>
                </div>
              </div>

              {/* Delivery Info Form */}
              <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs">
                <span className="font-bold text-slate-800 block text-xs tracking-wide uppercase">
                  Datos de Contacto {shippingMethod === 'DVOLADA' ? 'y Envío a Domicilio' : 'de Pedido'}
                </span>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tu Nombre Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Juan Pérez"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Teléfono / WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="ej. 9876-5432"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Método de Pago Preferido
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      <option value="Efectivo">Efectivo al recibir</option>
                      <option value="Transferencia">Transferencia Bancaria</option>
                      <option value="Tarjeta al recibir">Tarjeta al recibir</option>
                    </select>
                  </div>
                </div>

                {/* Quick Visual Payment Selector Buttons */}
                <div className="space-y-1.5 pt-1">
                  <span className="block font-semibold text-slate-600 text-[11px]">
                    Elige cómo deseas pagar tu pedido:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('Efectivo')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        paymentMethod === 'Efectivo'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 font-extrabold'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 font-semibold'
                      }`}
                    >
                      <Banknote className="w-4 h-4 text-emerald-600" />
                      <span className="text-[11px] leading-tight">Efectivo</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('Transferencia')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        paymentMethod === 'Transferencia'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 font-extrabold'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 font-semibold'
                      }`}
                    >
                      <Landmark className="w-4 h-4 text-emerald-600" />
                      <span className="text-[11px] leading-tight">Transferencia Bancaria</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setPaymentMethod('Tarjeta al recibir')}
                      className={`p-2 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1 ${
                        paymentMethod === 'Tarjeta al recibir'
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-900 ring-2 ring-emerald-500/20 font-extrabold'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 font-semibold'
                      }`}
                    >
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                      <span className="text-[11px] leading-tight">Tarjeta al recibir</span>
                    </button>
                  </div>
                </div>

                {/* ==================== BANK ACCOUNTS FOR TRANSFERENCIA BANCARIA ==================== */}
                {paymentMethod === 'Transferencia' && (
                  <div className="mt-2 p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200 space-y-3 animate-in fade-in duration-150">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-2xs">
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-xs sm:text-sm">
                            Cuentas Bancarias Disponibles para Transferencia
                          </h4>
                          <p className="text-[11px] text-slate-600">
                            Toca <strong>"Copiar Cuenta"</strong> o <strong>"Copiar Nombre"</strong> para pegar los datos exactos en tu banco sin equivocaciones.
                          </p>
                        </div>
                      </div>
                    </div>

                    {activeBankAccounts.length > 0 ? (
                      <div className="space-y-2.5">
                        {activeBankAccounts.map((acc) => (
                          <CatalogBankAccountCard
                            key={acc.id}
                            account={acc}
                            isSelected={selectedBankAccount?.id === acc.id}
                            onSelect={() => setSelectedBankAccountId(acc.id)}
                            onCopyFeedback={(msg) => showToast(msg)}
                          />
                        ))}
                        <div className="p-2.5 rounded-xl bg-white/90 border border-emerald-200/80 text-[11px] text-emerald-950 font-medium flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>
                            Una vez realizada tu transferencia por <strong>L. {cartTotal.toFixed(2)}</strong>, envía tu pedido y adjunta el comprobante en el chat de WhatsApp.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-600 space-y-1.5">
                        <p className="font-bold text-slate-800">
                          Al enviar tu pedido por WhatsApp te compartiremos el número de cuenta bancaria para realizar la transferencia.
                        </p>
                        {isAdminPreview && (
                          <p className="text-[11px] text-emerald-700 font-semibold">
                            💡 Vista de Administrador: Puedes configurar tus cuentas bancarias con logos de bancos desde Configuración de la Tienda o en el panel del Catálogo Digital.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {shippingMethod === 'DVOLADA' && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {showDvolada ? "Dirección de Envío para D'VOLADA Delivery" : 'Dirección de Envío a Domicilio'} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Barrio El Centro, ave. principal, frente a farmacia, casa #12"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className={`w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 font-medium ${
                        showDvolada ? 'focus:ring-orange-500' : 'focus:ring-emerald-500'
                      }`}
                    />
                  </div>
                )}

                {shippingMethod === 'RETIRO' && effectiveLocations.length > 1 && (
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Selecciona en cuál Tienda / Sucursal recogerás tu pedido
                    </label>
                    <select
                      value={pickupBranchId || activeBranch?.id || ''}
                      onChange={(e) => setPickupBranchId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                      {effectiveLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.name}
                          {loc.city ? ` (${loc.city})` : ''}
                          {loc.address ? ` — ${loc.address}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Notas adicionales / Indicaciones para la entrega (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Entregar por la tarde después de las 2:00 PM"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSendOrderWhatsApp}
                className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs sm:text-sm rounded-2xl flex items-center justify-center gap-2 cursor-pointer shadow-md border border-emerald-500 transition-all active:scale-[0.99]"
              >
                <WhatsAppIcon className="w-5 h-5 fill-white" />
                <span>Enviar Pedido por WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleCopyOrderText}
                className="py-3 px-3 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl flex items-center justify-center gap-1.5 cursor-pointer border border-slate-200 shrink-0 shadow-2xs"
                title="Copiar texto del pedido"
              >
                <Copy className="w-4 h-4 text-emerald-600" />
                <span>Copiar Texto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== QUICK BANK ACCOUNTS MODAL ==================== */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] text-slate-800">
            <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold border border-emerald-200">
                  <Landmark className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                    Cuentas Bancarias Oficiales
                  </h3>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {displayStoreName} · Toca para copiar sin errores
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-200 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-3">
              {activeBankAccounts.map((acc) => (
                <CatalogBankAccountCard
                  key={acc.id}
                  account={acc}
                  onCopyFeedback={(msg) => showToast(msg)}
                />
              ))}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setIsBankModalOpen(false)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
