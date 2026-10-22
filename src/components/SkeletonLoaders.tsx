import React from 'react';

/**
 * Reusable Skeleton Block using the requested Tailwind classes:
 * animate-pulse bg-gray-200 rounded-md
 */
export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md ${className}`} />
);

/**
 * Mobile Inventory Cards Skeleton (< sm)
 * Matches the shape of mobile product cards in InventoryView.tsx
 */
export const InventoryMobileCardSkeleton: React.FC<{ count?: number }> = ({ count = 6 }) => {
  return (
    <div className="sm:hidden p-2.5 space-y-2.5" aria-busy="true" aria-label="Cargando inventario desde Firebase">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="p-3 bg-white border border-slate-200/90 rounded-xl shadow-2xs space-y-2.5"
        >
          {/* Top row: Image thumbnail + Name & SKU */}
          <div className="flex items-start gap-3">
            {/* Image square placeholder */}
            <div className="w-12 h-12 shrink-0 animate-pulse bg-gray-200 rounded-md" />
            <div className="flex-1 min-w-0 space-y-2 py-0.5">
              {/* Product title bar */}
              <div className="h-4 w-3/4 animate-pulse bg-gray-200 rounded-md" />
              {/* SKU, Size & Category badges */}
              <div className="flex items-center gap-1.5">
                <div className="h-3.5 w-16 animate-pulse bg-gray-200 rounded-md" />
                <div className="h-3.5 w-14 animate-pulse bg-gray-200 rounded-md" />
                <div className="h-3.5 w-12 animate-pulse bg-gray-200 rounded-md" />
              </div>
              {/* Supplier line */}
              <div className="h-2.5 w-2/5 animate-pulse bg-gray-200 rounded-md" />
            </div>
          </div>

          {/* Bottom row: Price, Stock badge & Actions */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100">
            <div className="space-y-1">
              <div className="h-2.5 w-10 animate-pulse bg-gray-200 rounded-md" />
              <div className="h-4 w-20 animate-pulse bg-gray-200 rounded-md" />
            </div>

            <div className="flex flex-col items-center space-y-1">
              <div className="h-2.5 w-10 animate-pulse bg-gray-200 rounded-md" />
              <div className="h-5 w-16 animate-pulse bg-gray-200 rounded-md" />
            </div>

            <div className="flex items-center gap-1.5">
              <div className="w-8 h-8 animate-pulse bg-gray-200 rounded-md" />
              <div className="w-8 h-8 animate-pulse bg-gray-200 rounded-md" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Desktop Inventory Table Rows Skeleton (>= sm)
 * Matches the 6-column table layout in InventoryView.tsx
 */
export const InventoryTableRowsSkeleton: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <>
      {Array.from({ length: rows }).map((_, idx) => (
        <tr key={idx} className="border-b border-slate-100">
          {/* Col 1: Product Image & Info */}
          <td className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 shrink-0 animate-pulse bg-gray-200 rounded-md" />
              <div className="space-y-2">
                <div className="h-4 w-44 animate-pulse bg-gray-200 rounded-md" />
                <div className="h-3 w-28 animate-pulse bg-gray-200 rounded-md" />
              </div>
            </div>
          </td>
          {/* Col 2: SKU */}
          <td className="p-4">
            <div className="h-6 w-24 animate-pulse bg-gray-200 rounded-md" />
          </td>
          {/* Col 3: Supplier */}
          <td className="p-4">
            <div className="h-4 w-28 animate-pulse bg-gray-200 rounded-md" />
          </td>
          {/* Col 4: Cost & Price */}
          <td className="p-4">
            <div className="space-y-1.5">
              <div className="h-4 w-20 animate-pulse bg-gray-200 rounded-md" />
              <div className="h-3 w-16 animate-pulse bg-gray-200 rounded-md" />
            </div>
          </td>
          {/* Col 5: Stock */}
          <td className="p-4 text-center">
            <div className="h-6 w-16 mx-auto animate-pulse bg-gray-200 rounded-md" />
          </td>
          {/* Col 6: Actions */}
          <td className="p-4 text-right">
            <div className="flex items-center justify-end gap-1.5">
              <div className="w-8 h-8 animate-pulse bg-gray-200 rounded-md" />
              <div className="w-8 h-8 animate-pulse bg-gray-200 rounded-md" />
            </div>
          </td>
        </tr>
      ))}
    </>
  );
};

/**
 * POS Product Cards Grid Skeleton
 * Matches the product cards in SalesView.tsx
 */
export const PosProductGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-3"
      aria-busy="true"
      aria-label="Cargando productos del punto de venta"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex flex-col justify-between p-3 rounded-xl border border-slate-200/90 bg-white"
        >
          {/* Top Stock Badge */}
          <div className="flex items-start justify-between gap-1.5 mb-2">
            <div className="h-4 w-16 animate-pulse bg-gray-200 rounded-md" />
          </div>

          {/* Product Image Box */}
          <div className="w-full h-24 mb-2 animate-pulse bg-gray-200 rounded-md" />

          {/* Product Name & Code */}
          <div className="space-y-2 mb-2">
            <div className="h-4 w-4/5 animate-pulse bg-gray-200 rounded-md" />
            <div className="flex items-center justify-between">
              <div className="h-3 w-16 animate-pulse bg-gray-200 rounded-md" />
              <div className="h-3.5 w-10 animate-pulse bg-gray-200 rounded-md" />
            </div>
          </div>

          {/* Price & Add Button */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-auto">
            <div className="space-y-1">
              <div className="h-2.5 w-10 animate-pulse bg-gray-200 rounded-md" />
              <div className="h-4 w-20 animate-pulse bg-gray-200 rounded-md" />
            </div>
            <div className="w-7 h-7 animate-pulse bg-gray-200 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Public Catalog Product Cards Grid Skeleton
 * Matches the cards in PublicCatalogView.tsx
 */
export const PublicCatalogGridSkeleton: React.FC<{ count?: number }> = ({ count = 8 }) => {
  return (
    <div
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4"
      aria-busy="true"
      aria-label="Cargando catálogo de productos"
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="bg-white border border-slate-200/90 rounded-2xl p-3 flex flex-col justify-between shadow-2xs"
        >
          {/* Square Image Placeholder */}
          <div className="aspect-square w-full mb-2.5 animate-pulse bg-gray-200 rounded-md" />

          {/* Details */}
          <div className="space-y-2 mb-3 flex-1">
            <div className="flex items-center justify-between gap-1">
              <div className="h-3 w-16 animate-pulse bg-gray-200 rounded-md" />
              <div className="h-3.5 w-12 animate-pulse bg-gray-200 rounded-md" />
            </div>
            <div className="h-4 w-5/6 animate-pulse bg-gray-200 rounded-md" />
            <div className="h-3 w-1/2 animate-pulse bg-gray-200 rounded-md" />
          </div>

          {/* Price & Button */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 mt-auto">
            <div className="space-y-1">
              <div className="h-2.5 w-10 animate-pulse bg-gray-200 rounded-md" />
              <div className="h-4 w-20 animate-pulse bg-gray-200 rounded-md" />
            </div>
            <div className="h-8 w-20 animate-pulse bg-gray-200 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
};

/**
 * Dashboard Stat Cards & Low Stock List Skeleton
 * Matches the KPI cards and low-stock item cards in DashboardView.tsx
 */
export const DashboardStatCardsSkeleton: React.FC = () => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          key={index}
          className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800/80 flex items-center"
        >
          <div className="w-14 h-14 mr-4 shrink-0 animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-24 animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md" />
            <div className="h-7 w-16 animate-pulse bg-gray-200 dark:bg-slate-800 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const DashboardLowStockSkeleton: React.FC<{ count?: number }> = ({ count = 4 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex items-center p-3 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-100 dark:border-slate-700/80"
        >
          <div className="w-8 h-8 mr-3 shrink-0 animate-pulse bg-gray-200 dark:bg-slate-700 rounded-md" />
          <div className="flex-1 mr-2 space-y-1.5">
            <div className="h-4 w-3/4 animate-pulse bg-gray-200 dark:bg-slate-700 rounded-md" />
            <div className="h-3 w-1/2 animate-pulse bg-gray-200 dark:bg-slate-700 rounded-md" />
          </div>
          <div className="h-6 w-16 animate-pulse bg-gray-200 dark:bg-slate-700 rounded-md" />
        </div>
      ))}
    </div>
  );
};
