import React, { useState } from 'react';
import { StoreBranchLocation } from '../types';
import {
  buildBranchEmbedMapUrl,
  buildBranchExternalMapsUrl,
  extractCoordinatesFromText,
} from '../utils/storeLocationUtils';
import {
  MapPin,
  Plus,
  Trash2,
  Navigation,
  ExternalLink,
  Clock,
  Phone,
  Store,
  Eye,
  EyeOff,
  CheckCircle2,
  Compass,
} from 'lucide-react';

interface StoreLocationsEditorProps {
  storeName: string;
  defaultAddress?: string;
  defaultPhone?: string;
  showLocationsInCatalog: boolean;
  onToggleShowInCatalog: (val: boolean) => void;
  locations: StoreBranchLocation[];
  onChangeLocations: (next: StoreBranchLocation[]) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const StoreLocationsEditor: React.FC<StoreLocationsEditorProps> = ({
  storeName,
  defaultAddress = '',
  defaultPhone = '',
  showLocationsInCatalog,
  onToggleShowInCatalog,
  locations,
  onChangeLocations,
  showToast,
}) => {
  const [locatingBranchId, setLocatingBranchId] = useState<string | null>(null);
  const [previewMapBranchId, setPreviewMapBranchId] = useState<string | null>(
    locations[0]?.id || null
  );

  const handleAddBranch = () => {
    const isFirst = locations.length === 0;
    const newBranch: StoreBranchLocation = {
      id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: isFirst
        ? `${storeName || 'Tienda'} - Principal`
        : `Sucursal #${locations.length + 1}`,
      address: isFirst ? defaultAddress : '',
      city: '',
      phone: isFirst ? defaultPhone : '',
      schedule: 'Lun - Sáb: 8:00 AM - 6:00 PM',
      googleMapsUrl: '',
      isMain: isFirst,
    };
    const next = [...locations, newBranch];
    onChangeLocations(next);
    setPreviewMapBranchId(newBranch.id);
  };

  const handleRemoveBranch = (id: string) => {
    const next = locations.filter((b) => b.id !== id);
    if (next.length > 0 && !next.some((b) => b.isMain)) {
      next[0] = { ...next[0], isMain: true };
    }
    onChangeLocations(next);
    if (previewMapBranchId === id) {
      setPreviewMapBranchId(next[0]?.id || null);
    }
  };

  const handleUpdateBranch = (id: string, patch: Partial<StoreBranchLocation>) => {
    const next = locations.map((b) => {
      if (b.id !== id) {
        if (patch.isMain) {
          return { ...b, isMain: false };
        }
        return b;
      }
      const updated: StoreBranchLocation = { ...b, ...patch };
      if (patch.googleMapsUrl !== undefined) {
        const coords = extractCoordinatesFromText(patch.googleMapsUrl);
        if (coords) {
          updated.latitude = coords.lat;
          updated.longitude = coords.lng;
        }
      }
      return updated;
    });
    onChangeLocations(next);
  };

  const handleDetectCurrentGps = (branchId?: string) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showToast?.('Tu navegador o dispositivo no soporta geolocalización GPS.', 'warning');
      return;
    }

    const targetId = branchId || 'new';
    setLocatingBranchId(targetId);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = Number(pos.coords.latitude.toFixed(6));
        const lng = Number(pos.coords.longitude.toFixed(6));
        const mapsUrl = `https://www.google.com/maps?q=${lat},${lng}`;

        if (branchId) {
          handleUpdateBranch(branchId, {
            latitude: lat,
            longitude: lng,
            googleMapsUrl: mapsUrl,
          });
          setPreviewMapBranchId(branchId);
        } else {
          const isFirst = locations.length === 0;
          const newBranch: StoreBranchLocation = {
            id: `branch_${Date.now()}`,
            name: isFirst
              ? `${storeName || 'Tienda'} - Principal`
              : `Sucursal #${locations.length + 1}`,
            address: isFirst && defaultAddress ? defaultAddress : `Ubicación GPS (${lat}, ${lng})`,
            city: '',
            phone: isFirst ? defaultPhone : '',
            schedule: 'Lun - Sáb: 8:00 AM - 6:00 PM',
            googleMapsUrl: mapsUrl,
            latitude: lat,
            longitude: lng,
            isMain: isFirst,
          };
          const next = [...locations, newBranch];
          onChangeLocations(next);
          setPreviewMapBranchId(newBranch.id);
        }

        setLocatingBranchId(null);
        showToast?.(`¡Ubicación GPS detectada (${lat}, ${lng}) y conectada a Google Maps!`, 'success');
      },
      (err) => {
        setLocatingBranchId(null);
        console.warn('Geolocation error:', err);
        showToast?.(
          'No se pudo obtener el GPS automáticamente. Puedes pegar el enlace de Google Maps o escribir la dirección.',
          'warning'
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  return (
    <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-200/80 space-y-5">
      {/* Header & Visibility Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/70 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-extrabold text-slate-900">
                Ubicación de la Tienda y Sucursales (Google Maps)
              </h2>
              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-extrabold uppercase tracking-wider">
                {locations.length === 0
                  ? 'Sin configurar'
                  : locations.length === 1
                  ? '1 Tienda'
                  : `${locations.length} Tiendas / Sucursales`}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Agrega la ubicación principal de tu negocio o múltiples sucursales para que tus clientes vean el mapa interactivo y cómo llegar desde el Catálogo Digital.
            </p>
          </div>
        </div>

        {/* Toggle Switch to show/hide in Public Catalog */}
        <label className="inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer select-none shrink-0">
          <input
            type="checkbox"
            checked={showLocationsInCatalog}
            onChange={(e) => onToggleShowInCatalog(e.target.checked)}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
          />
          <span className="text-xs font-bold text-slate-800">
            Mostrar en Catálogo Digital
          </span>
        </label>
      </div>

      {/* Action Toolbar: Add Store / Branch or Detect GPS */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 bg-slate-50/80 p-3 rounded-xl border border-slate-200/80">
        <div className="text-xs text-slate-600 font-medium">
          {locations.length === 0 ? (
            <span>
              ¿Tienes una o varias tiendas físicas? Agrégalas aquí para mostrarlas en Google Maps.
            </span>
          ) : (
            <span>
              Si tienes <strong>más tiendas o sucursales</strong>, agrégalas todas y aparecerán como selector en el catálogo.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleDetectCurrentGps()}
            disabled={locatingBranchId === 'new'}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold text-xs transition-all cursor-pointer shadow-2xs disabled:opacity-50"
          >
            <Compass className={`w-3.5 h-3.5 ${locatingBranchId === 'new' ? 'animate-spin' : ''}`} />
            <span>
              {locatingBranchId === 'new'
                ? 'Detectando GPS...'
                : 'Agregar con mi GPS Actual'}
            </span>
          </button>

          <button
            type="button"
            onClick={handleAddBranch}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>
              {locations.length === 0
                ? 'Agregar Ubicación de Tienda'
                : 'Agregar Otra Tienda / Sucursal'}
            </span>
          </button>
        </div>
      </div>

      {/* List of Store Locations / Branches */}
      {locations.length === 0 ? (
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center space-y-2.5 bg-slate-50/40">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto border border-emerald-200/60">
            <MapPin className="w-6 h-6" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h3 className="text-sm font-bold text-slate-800">
              Conecta la ubicación de tu tienda con Google Maps
            </h3>
            <p className="text-xs text-slate-500">
              Haz clic en <strong>«Agregar Ubicación de Tienda»</strong> o en <strong>«Agregar con mi GPS Actual»</strong> para registrar tu tienda principal y todas las sucursales que tengas.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {locations.map((branch, idx) => {
            const isPreviewOpen = previewMapBranchId === branch.id;
            const embedUrl = buildBranchEmbedMapUrl(branch, storeName);
            const externalMapsUrl = buildBranchExternalMapsUrl(branch, storeName);

            return (
              <div
                key={branch.id}
                className={`rounded-2xl border p-4 transition-all space-y-4 ${
                  branch.isMain
                    ? 'bg-emerald-50/20 border-emerald-300/90 shadow-2xs'
                    : 'bg-slate-50/50 border-slate-200'
                }`}
              >
                {/* Branch Card Header */}
                <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-200/70 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-lg bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="font-extrabold text-slate-900 text-sm">
                      {branch.name || `Tienda / Sucursal #${idx + 1}`}
                    </span>
                    {branch.isMain ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] font-black uppercase">
                        <CheckCircle2 className="w-3 h-3" /> Principal
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleUpdateBranch(branch.id, { isMain: true })}
                        className="text-[11px] font-bold text-slate-500 hover:text-emerald-700 underline cursor-pointer"
                      >
                        Marcar como principal
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewMapBranchId(isPreviewOpen ? null : branch.id)
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-bold cursor-pointer transition-colors"
                    >
                      {isPreviewOpen ? (
                        <>
                          <EyeOff className="w-3.5 h-3.5 text-slate-500" />
                          <span>Ocultar Mapa</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Ver Mapa</span>
                        </>
                      )}
                    </button>

                    <a
                      href={externalMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-bold transition-colors"
                      title="Abrir ubicación en Google Maps"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Abrir Maps</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => handleRemoveBranch(branch.id)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 text-[11px] font-bold cursor-pointer transition-colors"
                      title="Eliminar esta sucursal"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Branch Form Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Store className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Nombre de la Tienda o Sucursal *</span>
                    </label>
                    <input
                      type="text"
                      value={branch.name}
                      onChange={(e) =>
                        handleUpdateBranch(branch.id, { name: e.target.value })
                      }
                      placeholder="Ej. Tienda Principal Centro, Sucursal #2 Mall..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Ciudad / Departamento</span>
                    </label>
                    <input
                      type="text"
                      value={branch.city || ''}
                      onChange={(e) =>
                        handleUpdateBranch(branch.id, { city: e.target.value })
                      }
                      placeholder="Ej. San Pedro Sula, Cortés o Tegucigalpa, F.M."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1">
                      Dirección Exacta y Referencias *
                    </label>
                    <input
                      type="text"
                      value={branch.address}
                      onChange={(e) =>
                        handleUpdateBranch(branch.id, { address: e.target.value })
                      }
                      placeholder="Ej. Barrio El Centro, 3ra Avenida, media cuadra al norte del Parque Central, Local #4"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Teléfono / WhatsApp de esta Sucursal</span>
                    </label>
                    <input
                      type="text"
                      value={branch.phone || ''}
                      onChange={(e) =>
                        handleUpdateBranch(branch.id, { phone: e.target.value })
                      }
                      placeholder="Ej. +504 9999-9999"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>Horario de Atención</span>
                    </label>
                    <input
                      type="text"
                      value={branch.schedule || ''}
                      onChange={(e) =>
                        handleUpdateBranch(branch.id, { schedule: e.target.value })
                      }
                      placeholder="Ej. Lun - Sáb: 8:00 AM - 6:00 PM"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-700 mb-1 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1">
                        <Navigation className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Enlace de Google Maps o Coordenadas GPS (Opcional)</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDetectCurrentGps(branch.id)}
                        disabled={locatingBranchId === branch.id}
                        className="inline-flex items-center gap-1 text-[11px] font-extrabold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
                      >
                        <Compass
                          className={`w-3 h-3 ${
                            locatingBranchId === branch.id ? 'animate-spin' : ''
                          }`}
                        />
                        <span>
                          {locatingBranchId === branch.id
                            ? 'Capturando GPS...'
                            : '📍 Capturar mi GPS aquí'}
                        </span>
                      </button>
                    </label>
                    <input
                      type="text"
                      value={branch.googleMapsUrl || ''}
                      onChange={(e) =>
                        handleUpdateBranch(branch.id, {
                          googleMapsUrl: e.target.value,
                        })
                      }
                      placeholder="Pega aquí el link de Google Maps (ej. https://maps.app.goo.gl/... o coordenadas 15.5041, -88.0250)"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl font-mono text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <p className="text-[11px] text-slate-400 mt-1">
                      💡 Si dejas este campo vacío, Google Maps ubicará automáticamente la tienda usando la dirección y ciudad escritas arriba.
                    </p>
                  </div>
                </div>

                {/* Live Embedded Google Map Preview */}
                {isPreviewOpen && (
                  <div className="pt-2 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                      <span>Vista previa del Mapa en el Catálogo Digital:</span>
                      <a
                        href={externalMapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-emerald-700 hover:underline inline-flex items-center gap-1"
                      >
                        <span>Probar ruta Cómo llegar</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div className="w-full h-52 sm:h-60 rounded-xl overflow-hidden border border-slate-300 bg-slate-100 shadow-inner">
                      <iframe
                        title={`Mapa de ${branch.name || 'Tienda'}`}
                        src={embedUrl}
                        className="w-full h-full border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
