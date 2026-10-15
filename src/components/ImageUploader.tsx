import React, { useState, useRef } from 'react';
import { uploadProductImage } from '../firebase/storageService';
import {
  Camera,
  Upload,
  Image as ImageIcon,
  Trash2,
  RefreshCw,
  CheckCircle2,
  Link as LinkIcon,
  AlertCircle
} from 'lucide-react';

interface ImageUploaderProps {
  value: string;
  onChange: (url: string) => void;
  productCode?: string;
  isUploading?: boolean;
  setIsUploading?: (val: boolean) => void;
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

export const ImageUploader: React.FC<ImageUploaderProps> = ({
  value,
  onChange,
  productCode = 'PROD',
  isUploading: externalIsUploading,
  setIsUploading: externalSetIsUploading,
  showToast,
}) => {
  const [internalUploading, setInternalUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlDraft, setUrlDraft] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = externalIsUploading !== undefined ? externalIsUploading : internalUploading;
  const setUploadingState = (val: boolean) => {
    setInternalUploading(val);
    if (externalSetIsUploading) externalSetIsUploading(val);
  };

  const handleProcessFile = async (file: File) => {
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      if (showToast) showToast('El archivo seleccionado no es una imagen válida', 'warning');
      return;
    }

    // Limit raw file to 25MB (will be compressed down to <300KB)
    if (file.size > 25 * 1024 * 1024) {
      if (showToast) showToast('La imagen es demasiado grande (máximo 25MB)', 'warning');
      return;
    }

    setUploadingState(true);
    setProgress(5);
    setErrorMsg(null);

    try {
      const downloadUrl = await uploadProductImage(file, productCode, (percent) => {
        setProgress(percent);
      });

      onChange(downloadUrl);
      if (showToast) {
        showToast('Foto subida a Firebase Storage exitosamente', 'success');
      }
    } catch (err: any) {
      console.error('Error uploading image to Firebase Storage:', err);
      setErrorMsg('No se pudo subir a Storage. Puedes intentar de nuevo o ingresar una URL.');
      if (showToast) {
        showToast('Error al subir imagen a Firebase Storage', 'error');
      }
    } finally {
      setUploadingState(false);
      setProgress(0);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
    // Reset inputs so user can choose same file again if desired
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleProcessFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (urlDraft.trim()) {
      onChange(urlDraft.trim());
      setUrlDraft('');
      setShowUrlInput(false);
      if (showToast) showToast('URL de imagen asignada', 'info');
    }
  };

  const handleRemoveImage = () => {
    onChange('');
    setErrorMsg(null);
  };

  return (
    <div className="space-y-3">
      {/* Hidden native file inputs */}
      {/* 1. Camera input specifically for mobile devices */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 2. File picker for PC / Gallery */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">
        Foto del Artículo (Firebase Storage)
      </label>

      {/* Preview Card or Upload Zone */}
      {value ? (
        <div className="relative border-2 border-emerald-200 bg-emerald-50/40 rounded-xl p-3 flex items-center gap-4 transition-all">
          <div className="w-20 h-20 rounded-lg overflow-hidden bg-white border border-slate-200 shadow-sm shrink-0 flex items-center justify-center">
            <img
              src={value}
              alt="Vista previa"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>Imagen vinculada</span>
            </div>
            <p className="text-[11px] text-slate-500 truncate mt-0.5 font-mono">
              {value.startsWith('data:') ? 'Imagen local comprimida' : value}
            </p>

            <div className="flex items-center gap-2 mt-2">
              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                disabled={isUploading}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Camera className="w-3 h-3 text-emerald-600" />
                <span>Cambiar Foto</span>
              </button>

              <button
                type="button"
                onClick={handleRemoveImage}
                disabled={isUploading}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-rose-600 bg-white hover:bg-rose-50 border border-rose-200 rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                <span>Quitar</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-4 text-center transition-all ${
            isDragOver
              ? 'border-emerald-500 bg-emerald-50/60'
              : 'border-slate-300 hover:border-emerald-400 bg-slate-50/50'
          }`}
        >
          {isUploading ? (
            <div className="py-4 space-y-3">
              <RefreshCw className="w-7 h-7 text-emerald-600 animate-spin mx-auto" />
              <div>
                <p className="text-sm font-semibold text-slate-700">Subiendo a Firebase Storage...</p>
                <p className="text-xs text-slate-400 mt-0.5">{progress}% completado</p>
              </div>
              <div className="w-48 bg-slate-200 rounded-full h-2 mx-auto overflow-hidden">
                <div
                  className="bg-emerald-500 h-full transition-all duration-300 rounded-full"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <ImageIcon className="w-5 h-5" />
              </div>

              <div>
                <p className="text-xs font-medium text-slate-700">
                  Arrastra una imagen aquí o elije una opción:
                </p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Compatible con fotos de cámara móvil o archivos desde la PC (JPG, PNG, WebP)
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Tomar Foto (Móvil)</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg border border-slate-200 shadow-2xs transition-colors cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5 text-slate-500" />
                  <span>Subir desde PC / Galería</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:underline cursor-pointer"
                >
                  <LinkIcon className="w-3 h-3" />
                  <span>{showUrlInput ? 'Ocultar URL' : 'Pegar URL'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Manual URL Input fallback if requested */}
      {showUrlInput && !value && (
        <div className="flex gap-2 p-2 bg-slate-100 rounded-lg animate-in fade-in duration-150">
          <input
            type="url"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://ejemplo.com/foto.jpg"
            className="flex-1 text-xs p-2 bg-white border border-slate-300 rounded-md outline-none focus:border-emerald-500"
          />
          <button
            type="button"
            onClick={handleApplyUrl}
            className="px-3 py-1.5 bg-slate-800 text-white text-xs font-medium rounded-md hover:bg-slate-900 transition-colors cursor-pointer"
          >
            Aplicar
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-1.5 text-xs text-rose-600 bg-rose-50 p-2 rounded-lg border border-rose-200">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
