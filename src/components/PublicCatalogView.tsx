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
import { useCatalogBrandPalette } from '../utils/catalogThemeEngine';

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

  // Dynamic Brand Palette extracted from the store's logo (or configured store catalog color)
  const { palette, onLogoImageLoaded } = useCatalogBrandPalette(storeSettings, effectiveLogo);

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

  // Count of items with available stock (> 0)
  const inStockCount = useMemo(() => {
    return inventory.filter((p) => (Number(p.stock) || 0) > 0).length;
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

  // Subtitle: Default to "Catálogo de productos" like the reference image unless a custom store tagline is set
  const catalogSubtitle = useMemo(() => {
    const raw = (storeSettings.tagline || '').trim();
    if (
      !raw ||
      raw.toLowerCase() === 'control de inventario y ventas' ||
      raw.toLowerCase() === 'control de inventario y auditoría' ||
      raw.toLowerCase() === 'control de inventario y auditoria'
    ) {
      return 'Catálogo de productos';
    }
    return raw;
  }, [storeSettings.tagline]);

  // Initials fallback when no logo image is uploaded
  const storeInitials = useMemo(() => {
    const words = displayStoreName
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return displayStoreName.slice(0, 3).toUpperCase();
  }, [displayStoreName]);

  return (
    <div
      className="w-full min-h-full flex flex-col text-stone-800 font-sans pb-48 transition-colors duration-300"
      style={{ backgroundColor: palette.pageBg }}
    >
      {/* Toast Floating Alert */}
      {toastMessage && (
        <div
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl shadow-xl text-xs sm:text-sm font-bold flex items-center gap-2 animate-in fade-in duration-200 border"
          style={{
            backgroundColor: palette.headerBg,
            color: palette.headerTitleColor,
            borderColor: palette.headerBorder,
          }}
        >
          <Sparkles className="w-4 h-4 shrink-0" style={{ color: palette.accentColor }} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Admin Preview Header Banner */}
      {isAdminPreview && (
        <div
          className="text-xs py-2 px-4 flex items-center justify-between font-bold sticky top-0 z-40 shadow-sm border-b"
          style={{
            backgroundColor: palette.accentColor,
            color: palette.accentTextColor,
            borderColor: palette.headerBorder,
          }}
        >
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span>Vista Previa del Cliente: Diseño adaptado al logo de {displayStoreName}.</span>
          </div>
          {onBackToAdmin && (
            <button
              onClick={onBackToAdmin}
              className="px-3 py-1 rounded-full text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1 shadow-xs"
              style={{
                backgroundColor: palette.headerBg,
                color: palette.headerTitleColor,
              }}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Volver al Panel</span>
            </button>
          )}
        </div>
      )}

      {/* ==================== STORE HEADER (REFERENCE DESIGN) ==================== */}
      <header
        className="px-4 sm:px-6 py-4 sm:py-5 shadow-md transition-colors duration-300"
        style={{
          backgroundColor: palette.headerBg,
          borderBottom: `3px solid ${palette.headerBorder}`,
        }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          {/* Left: Circular Logo Emblem + Store Title & Subtitle */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className="w-14 h-14 sm:w-16 sm:h-16 rounded-full overflow-hidden shrink-0 flex items-center justify-center shadow-md relative"
              style={{
                backgroundColor: palette.logoBgColor,
                border: `2px solid ${palette.logoRingColor}`,
              }}
            >
              {effectiveLogo ? (
                <img
                  src={effectiveLogo}
                  alt={displayStoreName}
                  crossOrigin={
                    effectiveLogo.startsWith('data:') || effectiveLogo.startsWith('/')
                      ? undefined
                      : 'anonymous'
                  }
                  onLoad={(e) => onLogoImageLoaded(e.currentTarget)}
                  onError={(e) => {
                    // Retry without crossOrigin if Firebase Storage blocks CORS
                    const img = e.currentTarget;
                    if (img.crossOrigin) {
                      img.removeAttribute('crossorigin');
                      img.src = effectiveLogo;
                    }
                  }}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span
                  className="font-black text-base sm:text-lg tracking-wider"
                  style={{ color: palette.headerTitleColor }}
                >
                  {storeInitials}
                </span>
              )}
            </div>

            <div className="min-w-0">
              <h1
                className="text-lg sm:text-2xl font-black uppercase tracking-wide truncate leading-tight"
                style={{ color: palette.headerTitleColor }}
              >
                {displayStoreName}
              </h1>
              <p
                className="text-xs sm:text-sm font-medium truncate mt-0.5"
                style={{ color: palette.headerSubtitleColor }}
              >
                {catalogSubtitle}
              </p>

              {/* Subtle Quick Links for Locations & Bank Accounts if configured */}
              {(effectiveLocations.length > 0 || activeBankAccounts.length > 0) && (
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
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
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer border"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        color: palette.headerTitleColor,
                        borderColor: `${palette.logoRingColor}66`,
                      }}
                    >
                      <MapPin className="w-3 h-3" />
                      <span>
                        {effectiveLocations.length === 1
                          ? 'Ubicación'
                          : `${effectiveLocations.length} Sucursales`}
                      </span>
                    </button>
                  )}

                  {activeBankAccounts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setIsBankModalOpen(true)}
                      className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer border"
                      style={{
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        color: palette.headerTitleColor,
                        borderColor: `${palette.logoRingColor}66`,
                      }}
                    >
                      <Landmark className="w-3 h-3" />
                      <span>Cuentas ({activeBankAccounts.length})</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Cart Counter Trigger Badge */}
          {cart.length > 0 && (
            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="font-extrabold px-3.5 sm:px-4 py-2.5 rounded-2xl shadow-md transition-all flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 shrink-0"
              style={{
                backgroundColor: palette.accentColor,
                color: palette.accentTextColor,
              }}
            >
              <div className="relative">
                <ShoppingCart className="w-5 h-5" />
                <span
                  className="absolute -top-2 -right-2 font-black text-[10px] w-4 h-4 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: palette.headerBg,
                    color: palette.headerTitleColor,
                  }}
                >
                  {totalCartItemsCount}
                </span>
              </div>
              <div className="text-left hidden sm:block">
                <div className="text-[10px] opacity-80 uppercase tracking-wide leading-none">
                  Mi Pedido
                </div>
                <div className="text-xs font-black leading-tight mt-0.5">
                  L. {cartTotal.toFixed(2)}
                </div>
              </div>
            </button>
          )}
        </div>
      </header>

      {/* ==================== MAIN CATALOG CONTENT (REFERENCE LAYOUT) ==================== */}
      <main className="max-w-5xl mx-auto w-full px-3.5 sm:px-6 py-4 sm:py-6 space-y-3.5 flex-1">
        {/* Pill Search Bar directly on warm background */}
        <div className="relative">
          <Search
            className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 pointer-events-none"
            style={{ color: palette.searchIconColor }}
          />
          <input
            type="text"
            placeholder="Buscar producto..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-11 pr-10 py-3 bg-white rounded-full text-xs sm:text-sm text-stone-900 placeholder-stone-400 focus:outline-none shadow-2xs font-medium transition-all"
            style={{
              border: `1.5px solid ${palette.cardBorder}`,
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 text-stone-400 hover:text-stone-700 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Stock Filter + Category Filter Pills Row */}
        <div className="flex items-center gap-2 overflow-x-auto py-1 scrollbar-none">
          {/* Stock Disponible Toggle Pill */}
          <button
            type="button"
            onClick={() =>
              setStockFilter((prev) => (prev === 'inStock' ? 'all' : 'inStock'))
            }
            className="px-3.5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer shrink-0 shadow-2xs flex items-center gap-1.5"
            style={
              stockFilter === 'inStock'
                ? {
                    backgroundColor: palette.headerBg,
                    color: palette.headerTitleColor,
                    border: `1.5px solid ${palette.headerBorder}`,
                  }
                : {
                    backgroundColor: palette.stockBadgeBg,
                    color: palette.stockBadgeText,
                    border: `1.5px solid ${palette.stockBadgeBorder}`,
                  }
            }
            title="Filtrar solo artículos con stock disponible"
          >
            <span>
              {stockFilter === 'inStock'
                ? `✓ Solo Disponibles (${inStockCount})`
                : `✓ Stock Disponible (${inStockCount})`}
            </span>
          </button>

          <span
            className="h-4 w-[1.5px] shrink-0 rounded-full"
            style={{ backgroundColor: palette.pillBorder }}
          />

          <button
            onClick={() => {
              setSelectedCategory('all');
              setStockFilter('all');
            }}
            className="px-4 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-all cursor-pointer shrink-0 shadow-2xs"
            style={
              selectedCategory === 'all' && stockFilter === 'all'
                ? {
                    backgroundColor: palette.accentColor,
                    color: palette.accentTextColor,
                    border: `1.5px solid ${palette.accentColor}`,
                  }
                : {
                    backgroundColor: '#ffffff',
                    color: '#3f3a30',
                    border: `1.5px solid ${palette.pillBorder}`,
                  }
            }
          >
            Todos ({inventory.length})
          </button>

          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className="px-4 py-1.5 rounded-full text-xs font-bold uppercase whitespace-nowrap transition-all cursor-pointer shrink-0 shadow-2xs"
                style={
                  isSelected
                    ? {
                        backgroundColor: palette.accentColor,
                        color: palette.accentTextColor,
                        border: `1.5px solid ${palette.accentColor}`,
                      }
                    : {
                        backgroundColor: '#ffffff',
                        color: '#4b4539',
                        border: `1.5px solid ${palette.pillBorder}`,
                      }
                }
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* Product Catalog Grid (2 columns on mobile, 3 on tablet, 4 on desktop) */}
        {isLoading ? (
          <PublicCatalogGridSkeleton count={8} />
        ) : filteredProducts.length === 0 ? (
          <div
            className="bg-white rounded-3xl p-12 text-center text-stone-500 space-y-3 shadow-2xs"
            style={{ border: `1.5px solid ${palette.cardBorder}` }}
          >
            <ShoppingBag
              className="w-12 h-12 mx-auto stroke-1"
              style={{ color: palette.accentColor }}
            />
            <p className="font-bold text-stone-800 text-base">
              No se encontraron productos en esta selección
            </p>
            <p className="text-xs text-stone-500 max-w-sm mx-auto">
              Intenta cambiar de categoría o buscar con otro nombre o código.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 pt-1">
            {filteredProducts.map((product) => {
              const stockNum = Number(product.stock) || 0;
              const cartItem = cart.find((it) => it.product.code === product.code);
              const qtyInCart = cartItem?.quantity || 0;

              return (
                <div
                  key={product.code}
                  className="bg-white rounded-[22px] p-2.5 sm:p-3 flex flex-col justify-between transition-all hover:shadow-md shadow-2xs group relative"
                  style={{ border: `1.5px solid ${palette.cardBorder}` }}
                >
                  {/* Rounded Product Image Frame */}
                  <div className="aspect-[1/1.05] w-full rounded-[16px] bg-stone-100 overflow-hidden relative mb-2.5 flex items-center justify-center">
                    <AdaptiveImage
                      src={product.img}
                      alt={product.name}
                      variant="product"
                      coverMode
                      enableZoom
                      hoverScale
                      fallback={
                        <div className="flex flex-col items-center justify-center text-stone-400 p-2 text-center">
                          <ShoppingBag
                            className="w-8 h-8 mb-1 stroke-1"
                            style={{ color: palette.accentColor }}
                          />
                          <span className="text-[9px] font-bold uppercase tracking-wider text-stone-400">
                            {displayStoreName}
                          </span>
                        </div>
                      }
                    />

                    {/* Top-Left Stock Badge (Exact Reference Style: ✓ Disponible (8)) */}
                    {stockNum > 0 ? (
                      <span
                        className="absolute top-2 left-2 z-20 pointer-events-none text-[10px] sm:text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-xs"
                        style={{
                          backgroundColor: palette.stockBadgeBg,
                          color: palette.stockBadgeText,
                          border: `1px solid ${palette.stockBadgeBorder}`,
                        }}
                      >
                        ✓ Disponible ({stockNum})
                      </span>
                    ) : (
                      <span className="absolute top-2 left-2 z-20 pointer-events-none text-[10px] font-extrabold bg-rose-50/95 text-rose-800 px-2.5 py-0.5 rounded-full border border-rose-200 shadow-xs">
                        Agotado / Solicitar
                      </span>
                    )}

                    {/* Quantity in cart indicator pill */}
                    {qtyInCart > 0 && (
                      <span
                        className="absolute top-2 right-2 z-20 pointer-events-none text-[10px] font-black px-2 py-0.5 rounded-full shadow-xs"
                        style={{
                          backgroundColor: palette.headerBg,
                          color: palette.headerTitleColor,
                          border: `1px solid ${palette.headerBorder}`,
                        }}
                      >
                        {qtyInCart} en pedido
                      </span>
                    )}
                  </div>

                  {/* Product Details (Code -> Uppercase Bold Name -> Categoría: X) */}
                  <div className="space-y-0.5 mb-2.5 flex-1 flex flex-col px-0.5">
                    <div className="flex items-center justify-between gap-1 text-[11px] text-stone-500">
                      <span className="font-semibold text-stone-500">{product.code}</span>
                      {product.size && (
                        <span className="bg-stone-100 text-stone-700 px-1.5 py-0.2 rounded text-[10px] font-semibold border border-stone-200">
                          Talla: {product.size}
                        </span>
                      )}
                    </div>

                    <h3 className="font-black text-stone-900 text-xs sm:text-sm uppercase line-clamp-2 leading-tight tracking-tight">
                      {product.name}
                    </h3>

                    {product.category && (
                      <span className="text-[11px] text-stone-400 font-medium block pt-0.5">
                        Categoría: {product.category.toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Price & "+ Agregar" Pill Button */}
                  <div
                    className="pt-2.5 border-t flex items-end justify-between gap-1.5 mt-auto px-0.5"
                    style={{ borderColor: palette.cardBorder }}
                  >
                    <div className="min-w-0">
                      <span className="text-[10px] text-stone-400 font-medium block leading-none mb-1">
                        Precio
                      </span>
                      <span
                        className="font-black text-sm sm:text-base leading-none block truncate"
                        style={{ color: palette.priceColor }}
                      >
                        L. {product.price.toFixed(2)}
                      </span>
                    </div>

                    {qtyInCart === 0 ? (
                      <button
                        onClick={() => addToCart(product)}
                        className="px-3 sm:px-3.5 py-1.5 rounded-full text-[11px] sm:text-xs font-extrabold transition-all shadow-2xs flex items-center gap-0.5 cursor-pointer active:scale-95 shrink-0 hover:brightness-95"
                        style={{
                          backgroundColor: palette.accentColor,
                          color: palette.accentTextColor,
                        }}
                        title="Agregar a mi pedido"
                      >
                        <span>+ Agregar</span>
                      </button>
                    ) : (
                      <div
                        className="flex items-center gap-1 p-0.5 rounded-full shrink-0 shadow-2xs"
                        style={{
                          backgroundColor: palette.stockBadgeBg,
                          border: `1px solid ${palette.stockBadgeBorder}`,
                        }}
                      >
                        <button
                          onClick={() => updateQuantity(product.code, qtyInCart - 1)}
                          className="w-6 h-6 rounded-full bg-white flex items-center justify-center font-black text-xs cursor-pointer shadow-2xs"
                          style={{ color: palette.stockBadgeText }}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span
                          className="text-xs font-black px-1.5"
                          style={{ color: palette.stockBadgeText }}
                        >
                          {qtyInCart}
                        </span>
                        <button
                          onClick={() => updateQuantity(product.code, qtyInCart + 1)}
                          className="w-6 h-6 rounded-full flex items-center justify-center font-black text-xs cursor-pointer shadow-2xs"
                          style={{
                            backgroundColor: palette.accentColor,
                            color: palette.accentTextColor,
                          }}
                          disabled={stockNum > 0 && qtyInCart >= stockNum}
                        >
                          <Plus className="w-3 h-3" />
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
            className="bg-white rounded-3xl shadow-xs overflow-hidden mt-6"
            style={{ border: `1.5px solid ${palette.cardBorder}` }}
          >
            {/* Section Header */}
            <div
              className="p-4 sm:p-5 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              style={{
                backgroundColor: palette.headerBg,
                borderBottom: `2px solid ${palette.headerBorder}`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${palette.accentColor}26`,
                    border: `1px solid ${palette.accentColor}66`,
                    color: palette.headerTitleColor,
                  }}
                >
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2
                      className="text-base sm:text-lg font-black tracking-tight"
                      style={{ color: palette.headerTitleColor }}
                    >
                      {effectiveLocations.length === 1
                        ? 'Ubicación de Nuestra Tienda'
                        : `Nuestras Tiendas y Sucursales (${effectiveLocations.length})`}
                    </h2>
                    <span
                      className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider"
                      style={{
                        backgroundColor: `${palette.accentColor}26`,
                        color: palette.headerTitleColor,
                      }}
                    >
                      Google Maps
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: palette.headerSubtitleColor }}>
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
              <div
                className="p-4 sm:p-5 space-y-4"
                style={{ backgroundColor: palette.pageBg }}
              >
                {/* Branch Selector Cards when the store has MORE THAN 1 location */}
                {effectiveLocations.length > 1 && (
                  <div className="space-y-2">
                    <span
                      className="text-[11px] font-extrabold uppercase tracking-wider block"
                      style={{ color: palette.priceColor }}
                    >
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
                            className="p-3 rounded-2xl border text-left transition-all cursor-pointer flex items-start gap-2.5 shadow-2xs"
                            style={
                              isSelected
                                ? {
                                    backgroundColor: palette.stockBadgeBg,
                                    borderColor: palette.accentColor,
                                    borderWidth: '2px',
                                  }
                                : {
                                    backgroundColor: '#ffffff',
                                    borderColor: palette.cardBorder,
                                    borderWidth: '1.5px',
                                  }
                            }
                          >
                            <div
                              className="w-7 h-7 rounded-full font-black text-xs flex items-center justify-center shrink-0 mt-0.5 shadow-2xs"
                              style={
                                isSelected
                                  ? {
                                      backgroundColor: palette.accentColor,
                                      color: palette.accentTextColor,
                                    }
                                  : {
                                      backgroundColor: palette.pageBg,
                                      color: palette.stockBadgeText,
                                      border: `1px solid ${palette.cardBorder}`,
                                    }
                              }
                            >
                              {idx + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="font-extrabold text-xs text-stone-900 truncate">
                                  {branch.name}
                                </span>
                                {branch.isMain && (
                                  <span
                                    className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded-full shrink-0"
                                    style={{
                                      backgroundColor: palette.headerBg,
                                      color: palette.headerTitleColor,
                                    }}
                                  >
                                    Principal
                                  </span>
                                )}
                              </div>
                              {branch.city && (
                                <span
                                  className="text-[11px] font-semibold block truncate"
                                  style={{ color: palette.priceColor }}
                                >
                                  {branch.city}
                                </span>
                              )}
                              {branch.address && (
                                <p className="text-[11px] text-stone-500 line-clamp-1 mt-0.5">
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
                  <div
                    className="lg:col-span-5 bg-white rounded-2xl p-4 flex flex-col justify-between space-y-4 shadow-2xs"
                    style={{ border: `1.5px solid ${palette.cardBorder}` }}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span
                            className="text-[10px] font-extrabold uppercase tracking-wider block"
                            style={{ color: palette.priceColor }}
                          >
                            {effectiveLocations.length > 1
                              ? 'Sucursal Seleccionada'
                              : 'Tienda Oficial'}
                          </span>
                          <h3 className="text-base sm:text-lg font-black text-stone-900 uppercase">
                            {activeBranch.name || displayStoreName}
                          </h3>
                          {activeBranch.city && (
                            <span className="text-xs font-bold text-stone-600 block">
                              {activeBranch.city}
                            </span>
                          )}
                        </div>
                        <span
                          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                          style={{
                            backgroundColor: palette.stockBadgeBg,
                            color: palette.stockBadgeText,
                            border: `1.5px solid ${palette.stockBadgeBorder}`,
                          }}
                        >
                          <Store className="w-5 h-5" />
                        </span>
                      </div>

                      <div
                        className="space-y-2.5 text-xs text-stone-700 pt-3 border-t"
                        style={{ borderColor: palette.cardBorder }}
                      >
                        {activeBranch.address && (
                          <div className="flex items-start gap-2.5">
                            <MapPin
                              className="w-4 h-4 shrink-0 mt-0.5"
                              style={{ color: palette.priceColor }}
                            />
                            <div>
                              <span className="font-bold text-stone-900 block">Dirección:</span>
                              <span className="text-stone-600 leading-relaxed">
                                {activeBranch.address}
                              </span>
                            </div>
                          </div>
                        )}

                        {activeBranch.schedule && (
                          <div className="flex items-start gap-2.5">
                            <Clock
                              className="w-4 h-4 shrink-0 mt-0.5"
                              style={{ color: palette.priceColor }}
                            />
                            <div>
                              <span className="font-bold text-stone-900 block">
                                Horario de Atención:
                              </span>
                              <span className="text-stone-600">{activeBranch.schedule}</span>
                            </div>
                          </div>
                        )}

                        {(activeBranch.phone || storeSettings.phone) && (
                          <div className="flex items-start gap-2.5">
                            <Phone
                              className="w-4 h-4 shrink-0 mt-0.5"
                              style={{ color: palette.priceColor }}
                            />
                            <div>
                              <span className="font-bold text-stone-900 block">
                                Teléfono / WhatsApp:
                              </span>
                              <span className="text-stone-700 font-bold">
                                {activeBranch.phone || storeSettings.phone}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Direct Action Buttons: Open in Google Maps & WhatsApp */}
                    <div
                      className="space-y-2 pt-3 border-t"
                      style={{ borderColor: palette.cardBorder }}
                    >
                      <a
                        href={buildBranchExternalMapsUrl(activeBranch, displayStoreName)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2.5 px-4 rounded-full font-extrabold text-xs flex items-center justify-center gap-2 shadow-sm transition-all hover:brightness-95"
                        style={{
                          backgroundColor: palette.accentColor,
                          color: palette.accentTextColor,
                        }}
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
                          className="w-full py-2.5 px-4 rounded-full font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                          style={{
                            backgroundColor: palette.headerBg,
                            color: palette.headerTitleColor,
                            border: `1.5px solid ${palette.headerBorder}`,
                          }}
                        >
                          <span style={{ color: palette.accentColor }} className="inline-flex">
                            <WhatsAppIcon className="w-4 h-4 fill-current" />
                          </span>
                          <span>Escribir por WhatsApp a esta Tienda</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Right: Embedded Interactive Google Map (7 cols) */}
                  <div
                    className="lg:col-span-7 min-h-[260px] sm:min-h-[310px] rounded-2xl overflow-hidden bg-stone-100 relative shadow-inner"
                    style={{ border: `1.5px solid ${palette.cardBorder}` }}
                  >
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
        <div
          className="fixed bottom-0 left-0 right-0 z-40 p-3 shadow-2xl"
          style={{
            backgroundColor: palette.headerBg,
            borderTop: `2px solid ${palette.headerBorder}`,
          }}
        >
          <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shrink-0 shadow-sm"
                style={{
                  backgroundColor: palette.accentColor,
                  color: palette.accentTextColor,
                }}
              >
                {totalCartItemsCount}
              </div>
              <div>
                <span
                  className="text-[10px] uppercase font-bold block"
                  style={{ color: palette.headerSubtitleColor }}
                >
                  Tu Pedido
                </span>
                <span
                  className="text-lg font-black"
                  style={{ color: palette.headerTitleColor }}
                >
                  L. {cartTotal.toFixed(2)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setIsOrderModalOpen(true)}
              className="font-extrabold px-5 py-2.5 rounded-full shadow-md transition-all flex items-center gap-2 cursor-pointer text-xs sm:text-sm hover:brightness-95 active:scale-95"
              style={{
                backgroundColor: palette.accentColor,
                color: palette.accentTextColor,
              }}
            >
              <span>Ver Pedido y Enviar WhatsApp</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== CUSTOMER ORDER MODAL (BRAND PALETTE) ==================== */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div
            className="rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[92vh] text-stone-800"
            style={{
              backgroundColor: palette.pageBg,
              border: `2px solid ${palette.headerBorder}`,
            }}
          >
            {/* Modal Header (Matches Store Header Palette) */}
            <div
              className="p-4 sm:p-5 flex items-center justify-between shrink-0"
              style={{
                backgroundColor: palette.headerBg,
                borderBottom: `2.5px solid ${palette.headerBorder}`,
              }}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0 shadow-sm overflow-hidden"
                  style={{
                    backgroundColor: palette.logoBgColor,
                    border: `2px solid ${palette.logoRingColor}`,
                  }}
                >
                  {effectiveLogo ? (
                    <img
                      src={effectiveLogo}
                      alt={displayStoreName}
                      className="w-full h-full object-cover rounded-full"
                    />
                  ) : (
                    <span style={{ color: palette.accentColor }} className="inline-flex">
                      <WhatsAppIcon className="w-5 h-5 fill-current" />
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <h3
                    className="font-black text-sm sm:text-base uppercase tracking-wide truncate"
                    style={{ color: palette.headerTitleColor }}
                  >
                    Confirmar Pedido por WhatsApp
                  </h3>
                  <p
                    className="text-[11px] font-medium truncate"
                    style={{ color: palette.headerSubtitleColor }}
                  >
                    {displayStoreName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOrderModalOpen(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer shrink-0"
                style={{ color: palette.headerTitleColor }}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: Order Items + Delivery Info Form */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {/* Order Items Table / Summary */}
              <div
                className="bg-white p-3.5 rounded-2xl space-y-2 shadow-2xs"
                style={{ border: `1.5px solid ${palette.cardBorder}` }}
              >
                <div
                  className="flex items-center justify-between text-xs font-extrabold uppercase pb-1.5 border-b"
                  style={{
                    color: palette.stockBadgeText,
                    borderColor: palette.cardBorder,
                  }}
                >
                  <span>Productos Solicitados ({totalCartItemsCount})</span>
                  <span>Subtotal</span>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1 text-xs">
                  {cart.map((item) => (
                    <div
                      key={item.product.code}
                      className="flex items-center justify-between gap-2 py-1.5 border-b last:border-b-0"
                      style={{ borderColor: `${palette.cardBorder}99` }}
                    >
                      <div className="flex-1 min-w-0">
                        <span className="font-black text-stone-900 uppercase block truncate">
                          {item.product.name}
                        </span>
                        <div className="text-[10px] text-stone-500 flex items-center gap-2 mt-0.5 font-medium">
                          <span>L. {item.product.price.toFixed(2)} c/u</span>
                          {item.product.size && <span>• Talla: {item.product.size}</span>}
                        </div>
                      </div>

                      {/* Quantity switcher */}
                      <div
                        className="flex items-center gap-1 p-0.5 rounded-full shrink-0 shadow-2xs"
                        style={{
                          backgroundColor: palette.stockBadgeBg,
                          border: `1px solid ${palette.stockBadgeBorder}`,
                        }}
                      >
                        <button
                          onClick={() => updateQuantity(item.product.code, item.quantity - 1)}
                          className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-xs font-black cursor-pointer"
                          style={{ color: palette.stockBadgeText }}
                        >
                          -
                        </button>
                        <span
                          className="font-extrabold text-xs px-1.5"
                          style={{ color: palette.stockBadgeText }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateQuantity(item.product.code, item.quantity + 1)}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black cursor-pointer"
                          style={{
                            backgroundColor: palette.accentColor,
                            color: palette.accentTextColor,
                          }}
                        >
                          +
                        </button>
                      </div>

                      <span
                        className="font-black shrink-0 min-w-[70px] text-right"
                        style={{ color: palette.priceColor }}
                      >
                        L. {(item.product.price * item.quantity).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Total Row */}
                <div
                  className="pt-2.5 border-t flex items-center justify-between text-sm font-black"
                  style={{ borderColor: palette.cardBorder }}
                >
                  <span className="text-stone-700">TOTAL ESTIMADO:</span>
                  <span className="text-base" style={{ color: palette.priceColor }}>
                    L. {cartTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Delivery Partner Selection */}
              <div
                className="space-y-2 bg-white p-3.5 rounded-2xl shadow-2xs"
                style={{ border: `1.5px solid ${palette.cardBorder}` }}
              >
                <label
                  className="block font-extrabold text-xs uppercase tracking-wide"
                  style={{ color: palette.stockBadgeText }}
                >
                  Selecciona el Método de Entrega
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {/* Option 1: Home Delivery */}
                  <button
                    type="button"
                    onClick={() => setShippingMethod('DVOLADA')}
                    className="p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2"
                    style={
                      shippingMethod === 'DVOLADA'
                        ? {
                            backgroundColor: palette.stockBadgeBg,
                            borderColor: palette.accentColor,
                            borderWidth: '2px',
                          }
                        : {
                            backgroundColor: '#ffffff',
                            borderColor: palette.cardBorder,
                            borderWidth: '1.5px',
                          }
                    }
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {showDvolada ? (
                        <img
                          src="/dvolada-delivery.jpg"
                          alt="D'VOLADA Delivery"
                          className="h-8 object-contain bg-white p-0.5 rounded-lg shrink-0 border border-stone-200"
                        />
                      ) : (
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0"
                          style={{
                            backgroundColor: palette.headerBg,
                            color: palette.headerTitleColor,
                          }}
                        >
                          <Truck className="w-4 h-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs text-stone-900 truncate">
                          {showDvolada ? "D'VOLADA Delivery" : 'Envío a Domicilio'}
                        </div>
                        <div
                          className="text-[10px] font-semibold truncate"
                          style={{ color: palette.priceColor }}
                        >
                          {showDvolada ? 'Envío rápido a domicilio 🚀' : 'Recibir en mi dirección 🛵'}
                        </div>
                      </div>
                    </div>
                    <div
                      className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                      style={
                        shippingMethod === 'DVOLADA'
                          ? {
                              borderColor: palette.accentColor,
                              backgroundColor: palette.accentColor,
                            }
                          : { borderColor: palette.pillBorder }
                      }
                    >
                      {shippingMethod === 'DVOLADA' && (
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: palette.accentTextColor }}
                        />
                      )}
                    </div>
                  </button>

                  {/* Option 2: Retiro en Tienda */}
                  <button
                    type="button"
                    onClick={() => setShippingMethod('RETIRO')}
                    className="p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2"
                    style={
                      shippingMethod === 'RETIRO'
                        ? {
                            backgroundColor: palette.stockBadgeBg,
                            borderColor: palette.accentColor,
                            borderWidth: '2px',
                          }
                        : {
                            backgroundColor: '#ffffff',
                            borderColor: palette.cardBorder,
                            borderWidth: '1.5px',
                          }
                    }
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center font-bold shrink-0"
                        style={{
                          backgroundColor: palette.headerBg,
                          color: palette.headerTitleColor,
                        }}
                      >
                        <Store className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-extrabold text-xs text-stone-900">Retiro en Tienda</div>
                        <div
                          className="text-[10px] font-semibold"
                          style={{ color: palette.priceColor }}
                        >
                          Pasar a recoger en el local
                        </div>
                      </div>
                    </div>
                    <div
                      className="w-4 h-4 rounded-full border flex items-center justify-center shrink-0"
                      style={
                        shippingMethod === 'RETIRO'
                          ? {
                              borderColor: palette.accentColor,
                              backgroundColor: palette.accentColor,
                            }
                          : { borderColor: palette.pillBorder }
                      }
                    >
                      {shippingMethod === 'RETIRO' && (
                        <div
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: palette.accentTextColor }}
                        />
                      )}
                    </div>
                  </button>
                </div>
              </div>

              {/* Delivery Info Form */}
              <div
                className="space-y-3 bg-white p-4 rounded-2xl text-xs shadow-2xs"
                style={{ border: `1.5px solid ${palette.cardBorder}` }}
              >
                <span
                  className="font-extrabold block text-xs tracking-wide uppercase"
                  style={{ color: palette.stockBadgeText }}
                >
                  Datos de Contacto {shippingMethod === 'DVOLADA' ? 'y Envío a Domicilio' : 'de Pedido'}
                </span>

                <div>
                  <label className="block font-bold text-stone-700 mb-1">
                    Tu Nombre Completo <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="ej. Juan Pérez"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50/70 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none font-medium"
                    style={{ border: `1.5px solid ${palette.cardBorder}` }}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">
                      Teléfono / WhatsApp
                    </label>
                    <input
                      type="tel"
                      placeholder="ej. 9876-5432"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-stone-50/70 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none font-medium"
                      style={{ border: `1.5px solid ${palette.cardBorder}` }}
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-stone-700 mb-1">
                      Método de Pago Preferido
                    </label>
                    <select
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value as any)}
                      className="w-full px-3.5 py-2.5 bg-stone-50/70 rounded-xl text-stone-900 font-bold focus:outline-none"
                      style={{ border: `1.5px solid ${palette.cardBorder}` }}
                    >
                      <option value="Efectivo">Efectivo al recibir</option>
                      <option value="Transferencia">Transferencia Bancaria</option>
                      <option value="Tarjeta al recibir">Tarjeta al recibir</option>
                    </select>
                  </div>
                </div>

                {/* Quick Visual Payment Selector Buttons */}
                <div className="space-y-1.5 pt-1">
                  <span className="block font-semibold text-stone-600 text-[11px]">
                    Elige cómo deseas pagar tu pedido:
                  </span>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'Efectivo', label: 'Efectivo', Icon: Banknote },
                        {
                          id: 'Transferencia',
                          label: 'Transferencia Bancaria',
                          Icon: Landmark,
                        },
                        {
                          id: 'Tarjeta al recibir',
                          label: 'Tarjeta al recibir',
                          Icon: CreditCard,
                        },
                      ] as const
                    ).map(({ id, label, Icon }) => {
                      const active = paymentMethod === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setPaymentMethod(id)}
                          className="p-2.5 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1"
                          style={
                            active
                              ? {
                                  backgroundColor: palette.stockBadgeBg,
                                  borderColor: palette.accentColor,
                                  borderWidth: '2px',
                                  color: palette.stockBadgeText,
                                }
                              : {
                                  backgroundColor: '#ffffff',
                                  borderColor: palette.cardBorder,
                                  borderWidth: '1.5px',
                                  color: '#57534e',
                                }
                          }
                        >
                          <Icon
                            className="w-4 h-4"
                            style={{
                              color: active ? palette.priceColor : '#78716c',
                            }}
                          />
                          <span className="text-[11px] font-extrabold leading-tight">
                            {label}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* ==================== BANK ACCOUNTS FOR TRANSFERENCIA BANCARIA ==================== */}
                {paymentMethod === 'Transferencia' && (
                  <div
                    className="mt-2 p-3.5 rounded-2xl space-y-3 animate-in fade-in duration-150"
                    style={{
                      backgroundColor: palette.stockBadgeBg,
                      border: `1.5px solid ${palette.stockBadgeBorder}`,
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-2xs"
                          style={{
                            backgroundColor: palette.headerBg,
                            color: palette.headerTitleColor,
                            border: `1.5px solid ${palette.headerBorder}`,
                          }}
                        >
                          <Landmark className="w-4 h-4" />
                        </div>
                        <div>
                          <h4
                            className="font-black text-xs sm:text-sm"
                            style={{ color: palette.stockBadgeText }}
                          >
                            Cuentas Bancarias Disponibles para Transferencia
                          </h4>
                          <p className="text-[11px] text-stone-700">
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
                            accentColor={palette.accentColor}
                            accentTextColor={palette.accentTextColor}
                            stockBadgeBg={palette.stockBadgeBg}
                            stockBadgeText={palette.stockBadgeText}
                            cardBorder={palette.cardBorder}
                          />
                        ))}
                        <div
                          className="p-2.5 rounded-xl bg-white/95 text-[11px] font-semibold flex items-center gap-2"
                          style={{
                            color: palette.stockBadgeText,
                            border: `1px solid ${palette.stockBadgeBorder}`,
                          }}
                        >
                          <CheckCircle2
                            className="w-4 h-4 shrink-0"
                            style={{ color: palette.priceColor }}
                          />
                          <span>
                            Una vez realizada tu transferencia por <strong>L. {cartTotal.toFixed(2)}</strong>, envía tu pedido y adjunta el comprobante en el chat de WhatsApp.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="p-3.5 rounded-xl bg-white text-xs text-stone-600 space-y-1.5"
                        style={{ border: `1px solid ${palette.cardBorder}` }}
                      >
                        <p className="font-bold text-stone-800">
                          Al enviar tu pedido por WhatsApp te compartiremos el número de cuenta bancaria para realizar la transferencia.
                        </p>
                        {isAdminPreview && (
                          <p
                            className="text-[11px] font-semibold"
                            style={{ color: palette.priceColor }}
                          >
                            💡 Vista de Administrador: Puedes configurar tus cuentas bancarias con logos de bancos desde Configuración de la Tienda o en el panel del Catálogo Digital.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {shippingMethod === 'DVOLADA' && (
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">
                      {showDvolada ? "Dirección de Envío para D'VOLADA Delivery" : 'Dirección de Envío a Domicilio'} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="ej. Barrio El Centro, ave. principal, frente a farmacia, casa #12"
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-stone-50/70 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none font-medium"
                      style={{ border: `1.5px solid ${palette.cardBorder}` }}
                    />
                  </div>
                )}

                {shippingMethod === 'RETIRO' && effectiveLocations.length > 1 && (
                  <div>
                    <label className="block font-bold text-stone-700 mb-1">
                      Selecciona en cuál Tienda / Sucursal recogerás tu pedido
                    </label>
                    <select
                      value={pickupBranchId || activeBranch?.id || ''}
                      onChange={(e) => setPickupBranchId(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-stone-50/70 rounded-xl text-stone-900 font-semibold focus:outline-none"
                      style={{ border: `1.5px solid ${palette.cardBorder}` }}
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
                  <label className="block font-bold text-stone-700 mb-1">
                    Notas adicionales / Indicaciones para la entrega (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="ej. Entregar por la tarde después de las 2:00 PM"
                    value={orderNotes}
                    onChange={(e) => setOrderNotes(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-stone-50/70 rounded-xl text-stone-900 placeholder-stone-400 focus:outline-none font-medium"
                    style={{ border: `1.5px solid ${palette.cardBorder}` }}
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions Footer */}
            <div
              className="p-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0"
              style={{
                backgroundColor: palette.headerBg,
                borderTop: `2px solid ${palette.headerBorder}`,
              }}
            >
              <button
                type="button"
                onClick={handleSendOrderWhatsApp}
                className="flex-1 py-3 px-4 font-extrabold text-xs sm:text-sm rounded-full flex items-center justify-center gap-2 cursor-pointer shadow-md transition-all hover:brightness-95 active:scale-[0.99]"
                style={{
                  backgroundColor: palette.accentColor,
                  color: palette.accentTextColor,
                }}
              >
                <WhatsAppIcon className="w-5 h-5 fill-current" />
                <span>Enviar Pedido por WhatsApp</span>
              </button>

              <button
                type="button"
                onClick={handleCopyOrderText}
                className="py-3 px-4 bg-white/10 hover:bg-white/20 font-bold text-xs rounded-full flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                style={{
                  color: palette.headerTitleColor,
                  border: `1px solid ${palette.logoRingColor}66`,
                }}
                title="Copiar texto del pedido"
              >
                <Copy className="w-4 h-4" />
                <span>Copiar Texto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== QUICK BANK ACCOUNTS MODAL (BRAND PALETTE) ==================== */}
      {isBankModalOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 animate-in fade-in duration-200">
          <div
            className="rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] text-stone-800"
            style={{
              backgroundColor: palette.pageBg,
              border: `2px solid ${palette.headerBorder}`,
            }}
          >
            <div
              className="p-4 sm:p-5 flex items-center justify-between shrink-0"
              style={{
                backgroundColor: palette.headerBg,
                borderBottom: `2.5px solid ${palette.headerBorder}`,
              }}
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center font-bold shrink-0"
                  style={{
                    backgroundColor: palette.logoBgColor,
                    border: `2px solid ${palette.logoRingColor}`,
                    color: palette.headerTitleColor,
                  }}
                >
                  <Landmark className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className="font-black text-sm sm:text-base uppercase tracking-wide"
                    style={{ color: palette.headerTitleColor }}
                  >
                    Cuentas Bancarias Oficiales
                  </h3>
                  <p
                    className="text-[11px] font-medium"
                    style={{ color: palette.headerSubtitleColor }}
                  >
                    {displayStoreName} · Toca para copiar sin errores
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsBankModalOpen(false)}
                className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
                style={{ color: palette.headerTitleColor }}
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
                  accentColor={palette.accentColor}
                  accentTextColor={palette.accentTextColor}
                  stockBadgeBg={palette.stockBadgeBg}
                  stockBadgeText={palette.stockBadgeText}
                  cardBorder={palette.cardBorder}
                />
              ))}
            </div>

            <div
              className="p-4 flex justify-end"
              style={{
                backgroundColor: palette.headerBg,
                borderTop: `2px solid ${palette.headerBorder}`,
              }}
            >
              <button
                type="button"
                onClick={() => setIsBankModalOpen(false)}
                className="px-6 py-2.5 font-extrabold text-xs rounded-full cursor-pointer"
                style={{
                  backgroundColor: palette.accentColor,
                  color: palette.accentTextColor,
                }}
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
