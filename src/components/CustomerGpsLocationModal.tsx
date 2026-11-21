import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  APIProvider,
  Map as GoogleMap,
  AdvancedMarker,
  Pin,
  MapMouseEvent,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import {
  MapPin,
  Navigation,
  Crosshair,
  CheckCircle2,
  X,
  RefreshCw,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { SaleRecord, CreditAccountControlMeta } from '../types';

export interface CapturedGpsData {
  lat: number;
  lng: number;
  accuracy?: number;
  formattedAddress: string;
  plusCode?: string;
}

export async function reverseGeocodeCoordinates(
  lat: number,
  lng: number
): Promise<{ formattedAddress: string; plusCode?: string }> {
  try {
    const resp = await fetch(
      `/api/maps/reverse-geocode?lat=${encodeURIComponent(String(lat))}&lng=${encodeURIComponent(
        String(lng)
      )}`
    );
    if (resp.ok) {
      const data = await resp.json();
      if (data?.formattedAddress) {
        return {
          formattedAddress: String(data.formattedAddress),
          plusCode: data.plusCode ? String(data.plusCode) : undefined,
        };
      }
    }
  } catch (err) {
    console.warn('Error consulting reverse geocode endpoint:', err);
  }
  return {
    formattedAddress: `Ubicación GPS (${lat.toFixed(6)}, ${lng.toFixed(6)})`,
  };
}

export function captureDeviceGpsLocation(): Promise<{
  lat: number;
  lng: number;
  accuracy: number;
}> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Tu dispositivo o navegador no soporta geolocalización GPS.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy || 0),
        });
      },
      (err) => {
        if (err.code === 1) {
          reject(
            new Error(
              'Permiso de ubicación denegado. Por favor autoriza el acceso al GPS en tu navegador o teléfono.'
            )
          );
        } else if (err.code === 2) {
          reject(
            new Error(
              'Señal GPS no disponible en este momento. Verifica que la ubicación de tu teléfono esté encendida.'
            )
          );
        } else {
          reject(
            new Error('Tiempo agotado al obtener señal GPS. Intenta nuevamente en un lugar despejado.')
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  });
}

interface PanTarget {
  lat: number;
  lng: number;
  zoom?: number;
  seq: number;
}

const MapPanController: React.FC<{ panTarget: PanTarget | null }> = ({ panTarget }) => {
  const map = useMap();
  const lastSeqRef = useRef<number>(0);

  useEffect(() => {
    if (!map || !panTarget || panTarget.seq === lastSeqRef.current) return;
    lastSeqRef.current = panTarget.seq;
    map.panTo({ lat: panTarget.lat, lng: panTarget.lng });
    if (typeof panTarget.zoom === 'number') {
      const currentZoom = map.getZoom();
      if (currentZoom === undefined || currentZoom < panTarget.zoom) {
        map.setZoom(panTarget.zoom);
      }
    }
  }, [map, panTarget]);

  return null;
};

const MapLoadStatusGuard: React.FC<{
  coords: { lat: number; lng: number } | null;
}> = ({ coords }) => {
  const status = useApiLoadingStatus();

  if (status === APILoadingStatus.FAILED || status === APILoadingStatus.AUTH_FAILURE) {
    return (
      <div className="absolute inset-0 z-10 bg-slate-100/95 flex flex-col items-center justify-center p-4 text-center text-xs text-slate-700">
        <AlertCircle className="w-7 h-7 text-amber-600 mb-1.5" />
        <p className="font-bold text-slate-900">
          No se pudo cargar el mapa interactivo en este dispositivo.
        </p>
        <p className="text-[11px] text-slate-600 mt-1">
          {coords
            ? `Las coordenadas GPS ya están listas (${coords.lat.toFixed(6)}, ${coords.lng.toFixed(
                6
              )}) y puedes guardarlas normalmente.`
            : 'Verifica tu conexión a internet o presiona "Obtener Ubicación GPS Aquí".'}
        </p>
      </div>
    );
  }

  if (status === APILoadingStatus.LOADING || status === APILoadingStatus.NOT_LOADED) {
    return (
      <div className="absolute inset-0 z-10 bg-slate-100/80 flex items-center justify-center text-xs font-bold text-slate-600 gap-2 pointer-events-none">
        <RefreshCw className="w-4 h-4 animate-spin text-emerald-600" />
        <span>Cargando mapa interactivo...</span>
      </div>
    );
  }

  return null;
};

interface CustomerGpsLocationModalProps {
  sale: SaleRecord;
  controlMeta?: CreditAccountControlMeta;
  currentUserName: string;
  onClose: () => void;
  onSaveGpsAddress: (payload: {
    addressOrRoute: string;
    lat: number;
    lng: number;
    accuracy?: number;
    formattedAddress: string;
    plusCode?: string;
  }) => Promise<void>;
  showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const DEFAULT_HONDURAS_CENTER = { lat: 14.0818, lng: -87.2068 };

export const CustomerGpsLocationModal: React.FC<CustomerGpsLocationModalProps> = ({
  sale,
  controlMeta,
  currentUserName,
  onClose,
  onSaveGpsAddress,
  showToast,
}) => {
  const existingLat = controlMeta?.customerGpsLat;
  const existingLng = controlMeta?.customerGpsLng;
  const hasExistingCoords =
    typeof existingLat === 'number' &&
    !Number.isNaN(existingLat) &&
    typeof existingLng === 'number' &&
    !Number.isNaN(existingLng);

  const initialCenterRef = useRef<{ lat: number; lng: number }>(
    hasExistingCoords ? { lat: existingLat!, lng: existingLng! } : DEFAULT_HONDURAS_CENTER
  );
  const initialZoomRef = useRef<number>(hasExistingCoords ? 17 : 12);
  const hasAutoCapturedRef = useRef<boolean>(false);

  const [mapsApiKey, setMapsApiKey] = useState<string>(() => {
    const envKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY || '';
    return String(envKey || '');
  });

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(() =>
    hasExistingCoords ? { lat: existingLat!, lng: existingLng! } : null
  );
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [accuracy, setAccuracy] = useState<number | undefined>(controlMeta?.customerGpsAccuracy);
  const [formattedAddress, setFormattedAddress] = useState<string>(
    controlMeta?.customerGpsFormattedAddress || ''
  );
  const [plusCode, setPlusCode] = useState<string>(controlMeta?.customerGpsPlusCode || '');
  const [addressOrRouteInput, setAddressOrRouteInput] = useState<string>(
    controlMeta?.customerAddressOrRoute || sale.customerAddress || ''
  );
  const [referenceNotes, setReferenceNotes] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isReverseGeocoding, setIsReverseGeocoding] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/maps/config')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data?.apiKey) {
          setMapsApiKey(String(data.apiKey));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const updateSelectedCoordinates = useCallback(
    async (newLat: number, newLng: number, newAccuracy?: number) => {
      const cleanLat = Number(newLat.toFixed(6));
      const cleanLng = Number(newLng.toFixed(6));
      setCoords({ lat: cleanLat, lng: cleanLng });
      setAccuracy(newAccuracy);
      setIsReverseGeocoding(true);
      try {
        const geo = await reverseGeocodeCoordinates(cleanLat, cleanLng);
        setFormattedAddress(geo.formattedAddress);
        if (geo.plusCode) setPlusCode(geo.plusCode);
        setAddressOrRouteInput((prev) => {
          const cleanPrev = prev.trim();
          if (!cleanPrev || cleanPrev.startsWith('Ubicación GPS')) {
            return geo.formattedAddress;
          }
          return cleanPrev;
        });
      } finally {
        setIsReverseGeocoding(false);
      }
    },
    []
  );

  const handleCaptureGpsNow = useCallback(async () => {
    setIsLocating(true);
    setGpsError(null);
    try {
      const pos = await captureDeviceGpsLocation();
      setCoords({ lat: pos.lat, lng: pos.lng });
      setAccuracy(pos.accuracy);
      setPanTarget({ lat: pos.lat, lng: pos.lng, zoom: 17, seq: Date.now() });

      setIsReverseGeocoding(true);
      const geo = await reverseGeocodeCoordinates(pos.lat, pos.lng);
      setFormattedAddress(geo.formattedAddress);
      if (geo.plusCode) setPlusCode(geo.plusCode);

      setAddressOrRouteInput((prev) => {
        const cleanPrev = prev.trim();
        if (!cleanPrev || cleanPrev.startsWith('Ubicación GPS')) {
          return geo.formattedAddress;
        }
        if (!cleanPrev.includes(geo.formattedAddress)) {
          return `${geo.formattedAddress} (${cleanPrev})`;
        }
        return cleanPrev;
      });

      showToast(
        `¡Ubicación GPS capturada con éxito! Precisión: ±${pos.accuracy}m`,
        'success'
      );
    } catch (err: any) {
      const msg = err?.message || 'No se pudo obtener la ubicación GPS del dispositivo.';
      setGpsError(msg);
      showToast(msg, 'warning');
    } finally {
      setIsLocating(false);
      setIsReverseGeocoding(false);
    }
  }, [showToast]);

  // Automatically trigger GPS capture once when opened if no coordinates are saved yet
  useEffect(() => {
    if (!hasExistingCoords && !hasAutoCapturedRef.current) {
      hasAutoCapturedRef.current = true;
      handleCaptureGpsNow();
    }
  }, [hasExistingCoords, handleCaptureGpsNow]);

  const handleMapClick = useCallback(
    async (ev: MapMouseEvent) => {
      const clickedLat = ev.detail?.latLng?.lat;
      const clickedLng = ev.detail?.latLng?.lng;
      if (typeof clickedLat !== 'number' || typeof clickedLng !== 'number') return;
      await updateSelectedCoordinates(clickedLat, clickedLng, undefined);
    },
    [updateSelectedCoordinates]
  );

  const handleMarkerDragEnd = useCallback(
    async (ev: google.maps.MapMouseEvent) => {
      const draggedLat = ev.latLng?.lat();
      const draggedLng = ev.latLng?.lng();
      if (typeof draggedLat !== 'number' || typeof draggedLng !== 'number') return;
      await updateSelectedCoordinates(draggedLat, draggedLng, undefined);
    },
    [updateSelectedCoordinates]
  );

  const handleRecenterOnPin = () => {
    const target = coords || DEFAULT_HONDURAS_CENTER;
    setPanTarget({
      lat: target.lat,
      lng: target.lng,
      zoom: coords ? 17 : 12,
      seq: Date.now(),
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coords) {
      showToast('Primero presiona "Obtener Mi Ubicación GPS Aquí" o toca el mapa.', 'warning');
      return;
    }

    const baseAddr = addressOrRouteInput.trim() || formattedAddress || `GPS: ${coords.lat}, ${coords.lng}`;
    const finalAddr = referenceNotes.trim()
      ? `${baseAddr} — Ref: ${referenceNotes.trim()}`
      : baseAddr;

    setIsSaving(true);
    try {
      await onSaveGpsAddress({
        addressOrRoute: finalAddr,
        lat: coords.lat,
        lng: coords.lng,
        accuracy,
        formattedAddress: formattedAddress || finalAddr,
        plusCode: plusCode || undefined,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const googleMapsNavigationUrl = coords
    ? `https://www.google.com/maps/dir/?api=1&destination=${coords.lat},${coords.lng}`
    : '';

  return (
    <div className="fixed inset-0 bg-slate-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden max-h-[94vh] flex flex-col border border-emerald-200">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-700 via-teal-700 to-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
              <MapPin className="w-5 h-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="font-black text-sm sm:text-base">
                Dirección y Ubicación GPS del Cliente
              </h3>
              <p className="text-[11px] text-emerald-100">
                {sale.customerName || 'Cliente'} • Factura {sale.saleNumber}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-4 sm:p-5 overflow-y-auto space-y-4">
          {/* Primary Action: Capture GPS right at customer's location */}
          <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-xs font-black text-emerald-950 flex items-center gap-1.5">
                <Crosshair className="w-4 h-4 text-emerald-700" />
                <span>¿Estás en la casa o negocio del cliente?</span>
              </span>
              <p className="text-[11px] text-emerald-800 mt-0.5">
                Presiona el botón para capturar las coordenadas exactas por satélite y detectar la calle/colonia automáticamente.
              </p>
            </div>

            <button
              type="button"
              onClick={handleCaptureGpsNow}
              disabled={isLocating}
              className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-black text-xs cursor-pointer shadow-sm flex items-center justify-center gap-1.5 shrink-0 transition-all active:scale-95"
            >
              {isLocating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Capturando GPS...</span>
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4" />
                  <span>📍 Obtener Ubicación GPS Aquí</span>
                </>
              )}
            </button>
          </div>

          {gpsError && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">{gpsError}</p>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  También puedes mover el mapa, arrastrar el pin o tocar el punto exacto abajo.
                </p>
              </div>
            </div>
          )}

          {/* Coordinates & Reverse Geocoded Status Badge */}
          {coords && (
            <div className="p-3 rounded-xl bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="space-y-0.5">
                <div className="flex items-center gap-1.5 font-black text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    Coordenadas GPS: {coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}
                  </span>
                  {accuracy !== undefined && accuracy > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px]">
                      ±{accuracy}m
                    </span>
                  )}
                </div>
                {isReverseGeocoding ? (
                  <p className="text-[11px] text-slate-300">
                    Consultando nombre de calle y colonia en Google Maps...
                  </p>
                ) : formattedAddress ? (
                  <p className="text-[11px] text-slate-200">
                    📍 Detectado: <strong>{formattedAddress}</strong>
                    {plusCode ? ` (${plusCode})` : ''}
                  </p>
                ) : null}
              </div>

              <a
                href={googleMapsNavigationUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[11px] flex items-center gap-1 shrink-0 transition-all"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Iniciar Ruta GPS</span>
              </a>
            </div>
          )}

          {/* Interactive Google Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-300 shadow-xs bg-slate-100">
            <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 font-semibold">
              <span>Mapa Interactivo (Mueve el mapa, arrastra el pin o toca para ubicar)</span>
              <div className="flex items-center gap-2">
                {controlMeta?.customerGpsCapturedBy && (
                  <span className="text-[10px] text-emerald-700 font-bold">
                    Por: {controlMeta.customerGpsCapturedBy}
                  </span>
                )}
                {coords && (
                  <button
                    type="button"
                    onClick={handleRecenterOnPin}
                    className="px-2 py-0.5 rounded-md bg-white hover:bg-emerald-50 border border-slate-300 text-[10px] font-extrabold text-emerald-800 cursor-pointer flex items-center gap-1"
                    title="Centrar vista del mapa en el pin del cliente"
                  >
                    <Crosshair className="w-3 h-3" />
                    <span>Centrar Pin</span>
                  </button>
                )}
              </div>
            </div>
            <div className="relative" style={{ width: '100%', height: '300px', touchAction: 'none' }}>
              {mapsApiKey ? (
                <APIProvider
                  apiKey={mapsApiKey}
                  libraries={['marker']}
                  language="es"
                  region="HN"
                >
                  <MapLoadStatusGuard coords={coords} />
                  <GoogleMap
                    mapId="DEMO_MAP_ID"
                    defaultCenter={initialCenterRef.current}
                    defaultZoom={initialZoomRef.current}
                    gestureHandling="greedy"
                    zoomControl={true}
                    mapTypeControl={true}
                    streetViewControl={false}
                    fullscreenControl={true}
                    clickableIcons={false}
                    onClick={handleMapClick}
                    internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                    style={{ width: '100%', height: '300px' }}
                  >
                    <MapPanController panTarget={panTarget} />
                    {coords && (
                      <AdvancedMarker
                        position={coords}
                        draggable={true}
                        onDragEnd={handleMarkerDragEnd}
                        title={sale.customerName || 'Ubicación del Cliente (Arrastra para ajustar)'}
                      >
                        <Pin
                          background="#059669"
                          borderColor="#064e3b"
                          glyphColor="#ffffff"
                          scale={1.25}
                        />
                      </AdvancedMarker>
                    )}
                  </GoogleMap>
                </APIProvider>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-500 text-xs">
                  <MapPin className="w-8 h-8 text-emerald-600 mb-1" />
                  <p className="font-bold text-slate-700">
                    {coords
                      ? `Coordenadas listas: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`
                      : 'Presiona "Obtener Ubicación GPS Aquí" para capturar las coordenadas.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Editable Street Address & House Reference */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Dirección / Colonia / Calle del Cliente (Detectada por GPS o editable) *
              </label>
              <textarea
                rows={2}
                required
                placeholder="Ej. Col. Kennedy, Calle Principal, Tegucigalpa..."
                value={addressOrRouteInput}
                onChange={(e) => setAddressOrRouteInput(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Referencia Visual de la Casa / Local (Opcional para el Cobrador)
              </label>
              <input
                type="text"
                placeholder="Ej. Casa de dos plantas color verde, portón negro frente a pulpería..."
                value={referenceNotes}
                onChange={(e) => setReferenceNotes(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-800"
              />
            </div>
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || !coords}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white font-black text-xs cursor-pointer shadow-md flex items-center gap-1.5"
            >
              <MapPin className="w-4 h-4" />
              <span>
                {isSaving
                  ? 'Guardando GPS...'
                  : `Guardar Dirección GPS (${currentUserName})`}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
