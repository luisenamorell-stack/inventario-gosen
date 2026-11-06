import React, { useState } from 'react';
import { ZoomIn, X } from 'lucide-react';

export type ImageAspectShape = 'square' | 'portrait' | 'landscape' | 'ultra-wide';

interface AdaptiveImageProps {
  src?: string;
  alt: string;
  variant?: 'product' | 'logo';
  className?: string;
  containerClassName?: string;
  imgClassName?: string;
  fallback?: React.ReactNode;
  enableZoom?: boolean;
  hoverScale?: boolean;
  darkSurface?: boolean;
}

/**
 * Smart Adaptive Image Component
 * Automatically inspects the natural dimensions (naturalWidth / naturalHeight) of any uploaded
 * photo or store logo and adapts its layout, padding, object-fit, and ambient studio backdrop
 * so that vertical mobile photos, wide product shots, and panoramic logos always fit their
 * container cleanly without cropping off key parts of the image or leaving harsh blank bars.
 */
export const AdaptiveImage: React.FC<AdaptiveImageProps> = ({
  src,
  alt,
  variant = 'product',
  className = '',
  containerClassName = '',
  imgClassName = '',
  fallback = null,
  enableZoom = false,
  hoverScale = false,
  darkSurface = false,
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [shape, setShape] = useState<ImageAspectShape>('square');
  const [isZoomOpen, setIsZoomOpen] = useState(false);

  React.useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [src]);

  if (!src || hasError) {
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
          src={src}
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

  // Product variant: uses an ambient blurred studio backdrop + full adaptive containment
  // so neither vertical phone camera photos nor wide furniture/appliance photos are cut off.
  const isNearSquare = shape === 'square';

  return (
    <>
      <div
        onClick={
          enableZoom
            ? (e) => {
                e.stopPropagation();
                setIsZoomOpen(true);
              }
            : undefined
        }
        className={`relative isolate z-0 w-full h-full flex items-center justify-center overflow-hidden select-none ${
          darkSurface ? 'bg-slate-900' : 'bg-slate-50/90'
        } ${enableZoom ? 'cursor-zoom-in group/zoom' : ''} ${containerClassName} ${className}`}
      >
        {/* Lightweight Studio Backdrop (avoids decoding large base64 images twice with GPU blur on every table row) */}
        <div
          className={`absolute inset-0 pointer-events-none ${
            darkSurface
              ? 'bg-gradient-to-b from-slate-900/30 via-transparent to-slate-900/40'
              : 'bg-radial from-white via-slate-50/70 to-slate-100/90'
          }`}
        />

        {/* Crisp Foreground Image adapted to available container space */}
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={handleImageLoad}
          onError={() => setHasError(true)}
          className={`relative z-10 max-w-full max-h-full w-full h-full ${
            isNearSquare ? 'object-contain p-0.5' : 'object-contain p-1'
          } drop-shadow-2xs transition-transform duration-300 ${
            hoverScale ? 'group-hover:scale-105' : ''
          } ${imgClassName}`}
        />

        {enableZoom && (
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
            className="relative max-w-2xl w-full max-h-[88vh] bg-white rounded-3xl overflow-hidden shadow-2xl border border-slate-200 flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <p className="font-bold text-slate-800 text-sm truncate pr-4">{alt}</p>
              <button
                type="button"
                onClick={() => setIsZoomOpen(false)}
                className="p-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer"
                aria-label="Cerrar vista previa"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="relative flex-1 min-h-[280px] max-h-[75vh] p-4 flex items-center justify-center bg-slate-100 overflow-hidden">
              <img
                src={src}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover scale-125 blur-2xl opacity-30 pointer-events-none"
              />
              <img
                src={src}
                alt={alt}
                className="relative z-10 max-w-full max-h-[68vh] w-auto h-auto object-contain rounded-xl drop-shadow-md"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};
