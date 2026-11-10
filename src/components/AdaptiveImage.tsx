import React, { useState, useMemo } from 'react';
import { ZoomIn, X, ChevronLeft, ChevronRight, Images } from 'lucide-react';

export type ImageAspectShape = 'square' | 'portrait' | 'landscape' | 'ultra-wide';

interface AdaptiveImageProps {
  src?: string;
  secondarySrc?: string;
  alt: string;
  variant?: 'product' | 'logo';
  className?: string;
  containerClassName?: string;
  imgClassName?: string;
  fallback?: React.ReactNode;
  enableZoom?: boolean;
  hoverScale?: boolean;
  darkSurface?: boolean;
  coverMode?: boolean;
  compactGalleryControls?: boolean;
}

/**
 * Smart Adaptive Image Component with Dual-Image Gallery Support (Foto 1 & Foto 2)
 */
export const AdaptiveImage: React.FC<AdaptiveImageProps> = ({
  src,
  secondarySrc,
  alt,
  variant = 'product',
  className = '',
  containerClassName = '',
  imgClassName = '',
  fallback = null,
  enableZoom = false,
  hoverScale = false,
  darkSurface = false,
  coverMode = false,
  compactGalleryControls = false,
}) => {
  const validImages = useMemo(() => {
    const list: string[] = [];
    if (src && src.trim()) list.push(src.trim());
    if (secondarySrc && secondarySrc.trim() && secondarySrc.trim() !== src?.trim()) {
      list.push(secondarySrc.trim());
    }
    return list;
  }, [src, secondarySrc]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [shape, setShape] = useState<ImageAspectShape>('square');
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  const safeIndex = activeIndex < validImages.length ? activeIndex : 0;
  const currentSrc = validImages[safeIndex] || '';
  const hasMultipleImages = validImages.length > 1;

  React.useEffect(() => {
    setActiveIndex(0);
    setHasError(false);
    setIsLoaded(false);
  }, [src, secondarySrc]);

  if (!currentSrc || hasError) {
    return <>{fallback}</>;
  }

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || 1;
    const h = img.naturalHeight || 1;
    const ratio = w / h;

    if (ratio > 1.75) {
      setShape('ultra-wide');
    } else if (ratio > 1.15) {
      setShape('landscape');
    } else if (ratio < 0.86) {
      setShape('portrait');
    } else {
      setShape('square');
    }
    setIsLoaded(true);
  };

  if (variant === 'logo') {
    const logoPadding =
      shape === 'ultra-wide' || shape === 'landscape' ? 'px-1.5 py-0.5' : 'p-1';

    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden select-none ${containerClassName} ${className}`}
      >
        <img
          src={currentSrc}
          alt={alt}
          onLoad={handleImageLoad}
          onError={() => setHasError(true)}
          decoding="async"
          className={`max-w-full max-h-full w-auto h-auto object-contain transition-opacity duration-200 ${logoPadding} ${
            isLoaded ? 'opacity-100' : 'opacity-90'
          } ${imgClassName}`}
        />
      </div>
    );
  }

  const isNearSquare = shape === 'square';

  const handleToggleImage = (e: React.MouseEvent, targetIdx?: number) => {
    e.stopPropagation();
    if (!hasMultipleImages) return;
    if (targetIdx !== undefined) {
      setActiveIndex(targetIdx);
    } else {
      setActiveIndex((prev) => (prev + 1) % validImages.length);
    }
  };

  return (
    <>
      <div
        onClick={
          enableZoom
            ? (e) => {
                e.stopPropagation();
                setIsZoomOpen(true);
              }
            : hasMultipleImages
            ? (e) => handleToggleImage(e)
            : undefined
        }
        className={`relative isolate z-0 w-full h-full flex items-center justify-center overflow-hidden select-none ${
          darkSurface ? 'bg-slate-900' : 'bg-slate-50/90'
        } ${enableZoom ? 'cursor-zoom-in group/zoom' : hasMultipleImages ? 'cursor-pointer' : ''} ${containerClassName} ${className}`}
      >
        {/* Lightweight Studio Backdrop */}
        <div
          className={`absolute inset-0 pointer-events-none ${
            darkSurface
              ? 'bg-gradient-to-b from-slate-900/30 via-transparent to-slate-900/40'
              : 'bg-radial from-white via-slate-50/70 to-slate-100/90'
          }`}
        />

        {/* Crisp Foreground Image adapted to available container space */}
        <img
          src={currentSrc}
          alt={`${alt}${hasMultipleImages ? ` (Foto ${safeIndex + 1})` : ''}`}
          loading="lazy"
          decoding="async"
          onLoad={handleImageLoad}
          onError={() => {
            if (hasMultipleImages && safeIndex === 0 && validImages[1]) {
              setActiveIndex(1);
            } else {
              setHasError(true);
            }
          }}
          className={`relative z-10 max-w-full max-h-full w-full h-full ${
            coverMode
              ? 'object-cover'
              : isNearSquare
              ? 'object-contain p-0.5'
              : 'object-contain p-1'
          } drop-shadow-2xs transition-transform duration-300 ${
            hoverScale ? 'group-hover:scale-105' : ''
          } ${imgClassName}`}
        />

        {/* Dual-Image Controls on Card / Thumbnail */}
        {hasMultipleImages && !compactGalleryControls && (
          <>
            {/* Left / Right Subtle Switcher Buttons */}
            <button
              type="button"
              onClick={(e) => handleToggleImage(e, (safeIndex - 1 + validImages.length) % validImages.length)}
              title="Ver foto anterior"
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-slate-900/65 hover:bg-slate-900/85 text-white flex items-center justify-center shadow-xs backdrop-blur-xs transition-all cursor-pointer active:scale-90"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={(e) => handleToggleImage(e, (safeIndex + 1) % validImages.length)}
              title="Ver siguiente foto"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-6 h-6 rounded-full bg-slate-900/65 hover:bg-slate-900/85 text-white flex items-center justify-center shadow-xs backdrop-blur-xs transition-all cursor-pointer active:scale-90"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>

            {/* Bottom Center Photo Dots + Counter Pill */}
            <div
              onClick={(e) => handleToggleImage(e)}
              title="Cambiar entre Foto 1 y Foto 2"
              className="absolute bottom-1.5 left-1.5 z-20 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-900/70 hover:bg-slate-900/90 text-white text-[10px] font-extrabold backdrop-blur-xs shadow-xs cursor-pointer"
            >
              <Images className="w-2.5 h-2.5" />
              <span>
                {safeIndex + 1}/{validImages.length}
              </span>
            </div>
          </>
        )}

        {/* Compact Badge for Small Thumbnails (Table / Mobile rows) */}
        {hasMultipleImages && compactGalleryControls && (
          <button
            type="button"
            onClick={(e) => handleToggleImage(e)}
            title="Tiene 2 fotos (clic para alternar)"
            className="absolute bottom-0.5 right-0.5 z-20 px-1 py-0.2 rounded bg-slate-900/75 text-white text-[9px] font-black leading-none shadow-2xs cursor-pointer"
          >
            {safeIndex + 1}/2
          </button>
        )}

        {enableZoom && !compactGalleryControls && (
          <span
            title="Ampliar imagen"
            className="
              absolute bottom-1.5 right-1.5 z-20
              w-6 h-6 rounded-full bg-slate-900/65 text-white
              flex items-center justify-center
              opacity-0 group-hover/zoom:opacity-100 transition-opacity
              backdrop-blur-xs shadow-xs pointer-events-none
            "
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </span>
        )}
      </div>

      {/* Fullscreen Adaptive Lightbox when user clicks zoomable image */}
      {enableZoom && isZoomOpen && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            setIsZoomOpen(false);
          }}
          className="fixed inset-0 z-[9999] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-150"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-2xl w-full max-h-[90vh] bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <div className="min-w-0 pr-3">
                <p className="font-bold text-slate-800 text-sm truncate">{alt}</p>
                {hasMultipleImages && (
                  <p className="text-[11px] font-semibold text-emerald-700">
                    Foto {safeIndex + 1} de {validImages.length}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer shrink-0"
                aria-label="Cerrar vista previa"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative flex-1 min-h-[280px] max-h-[68vh] p-4 flex items-center justify-center bg-slate-100 overflow-hidden">
              <img
                src={currentSrc}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-30 pointer-events-none"
              />
              <img
                src={currentSrc}
                alt={`${alt} - Foto ${safeIndex + 1}`}
                className="relative z-10 max-w-full max-h-[62vh] w-auto h-auto object-contain rounded-xl drop-shadow-md"
              />

              {hasMultipleImages && (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      setActiveIndex((prev) => (prev - 1 + validImages.length) % validImages.length)
                    }
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white flex items-center justify-center shadow-lg cursor-pointer transition-transform active:scale-95"
                    title="Foto anterior"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveIndex((prev) => (prev + 1) % validImages.length)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-slate-900/75 hover:bg-slate-900 text-white flex items-center justify-center shadow-lg cursor-pointer transition-transform active:scale-95"
                    title="Siguiente foto"
                  >
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnail Strip in Lightbox when product has 2 photos */}
            {hasMultipleImages && (
              <div className="px-4 py-3 bg-white border-t border-slate-100 flex items-center justify-center gap-3">
                {validImages.map((imgUrl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setActiveIndex(idx)}
                    className={`relative w-16 h-16 rounded-xl overflow-hidden border-2 transition-all cursor-pointer flex items-center justify-center bg-slate-50 ${
                      safeIndex === idx
                        ? 'border-emerald-600 ring-2 ring-emerald-500/30 scale-105 shadow-sm'
                        : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={imgUrl}
                      alt={`Miniatura ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute bottom-0.5 right-0.5 px-1 rounded bg-slate-900/75 text-white text-[9px] font-black">
                      #{idx + 1}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};
