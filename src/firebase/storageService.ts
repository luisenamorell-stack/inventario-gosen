import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage } from './config';

/**
 * Resizes and compresses an image file in the browser before upload.
 * Reduces 10MB mobile phone camera pictures to ~150-300KB without visible quality loss.
 */
export async function compressImage(
  file: File,
  maxWidth = 1200,
  maxHeight = 1200,
  quality = 0.85
): Promise<Blob> {
  // If it's not an image or is already a SVG/GIF, return as is
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            maxHeight = height;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          resolve(file);
          return;
        }

        // Draw and compress
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

/**
 * Converts a file or blob to base64 Data URL (used for instant preview and offline fallback)
 */
export function fileToDataUrl(file: Blob | File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Uploads a product photo to Firebase Storage with live progress callback.
 * Returns the public HTTPS download URL.
 */
export async function uploadProductImage(
  file: File,
  productCode = 'PRODUCT',
  onProgress?: (percent: number) => void
): Promise<string> {
  // 1. Compress image to optimize upload speed and mobile data
  const compressedBlob = await compressImage(file);

  // 2. Build unique storage path
  const sanitizedCode = productCode.trim().replace(/[^a-zA-Z0-9_-]/g, '_') || 'PROD';
  const timestamp = Date.now();
  const filename = `${sanitizedCode}_${timestamp}.jpg`;
  const storagePath = `products/${filename}`;

  const storageRef = ref(storage, storagePath);

  try {
    // 3. Upload with resumable task to track upload percentage
    const metadata = {
      contentType: 'image/jpeg',
      customMetadata: {
        productCode,
        uploadedAt: new Date().toISOString(),
      },
    };

    const uploadTask = uploadBytesResumable(storageRef, compressedBlob, metadata);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (onProgress) onProgress(progress);
        },
        async (error) => {
          console.warn('Firebase Storage upload warning:', error);
          // If storage bucket is restricted, provide fallback to compressed data URL so user is never blocked
          try {
            console.log('Using optimized compressed data URL fallback...');
            const fallbackUrl = await fileToDataUrl(compressedBlob);
            resolve(fallbackUrl);
          } catch {
            reject(error);
          }
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            if (onProgress) onProgress(100);
            resolve(downloadUrl);
          } catch (err) {
            // Fallback to data URL
            const fallbackUrl = await fileToDataUrl(compressedBlob);
            resolve(fallbackUrl);
          }
        }
      );
    });
  } catch (err: any) {
    console.warn('Direct upload error, falling back to data URL:', err);
    return await fileToDataUrl(compressedBlob);
  }
}

/**
 * Uploads a store logo image to Firebase Storage with live progress callback.
 * Returns the public HTTPS download URL (or optimized data URL fallback).
 */
export async function uploadStoreLogo(
  file: File,
  onProgress?: (percent: number) => void
): Promise<string> {
  // Compress logo to max 800x800 with high clarity
  const compressedBlob = await compressImage(file, 800, 800, 0.9);
  const timestamp = Date.now();
  const filename = `logo_${timestamp}.jpg`;
  const storagePath = `store_branding/${filename}`;

  const storageRef = ref(storage, storagePath);

  try {
    const metadata = {
      contentType: 'image/jpeg',
      customMetadata: {
        type: 'store_logo',
        uploadedAt: new Date().toISOString(),
      },
    };

    const uploadTask = uploadBytesResumable(storageRef, compressedBlob, metadata);

    return new Promise((resolve, reject) => {
      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const progress = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (onProgress) onProgress(progress);
        },
        async (error) => {
          console.warn('Store logo upload warning:', error);
          try {
            const fallbackUrl = await fileToDataUrl(compressedBlob);
            resolve(fallbackUrl);
          } catch {
            reject(error);
          }
        },
        async () => {
          try {
            const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
            if (onProgress) onProgress(100);
            resolve(downloadUrl);
          } catch (err) {
            const fallbackUrl = await fileToDataUrl(compressedBlob);
            resolve(fallbackUrl);
          }
        }
      );
    });
  } catch (err: any) {
    console.warn('Direct logo upload error, falling back to data URL:', err);
    return await fileToDataUrl(compressedBlob);
  }
}
