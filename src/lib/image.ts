import type { ImageAttachment } from '../types';

export const SUPPORTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

export const MAX_IMAGE_SIZE = 20 * 1024 * 1024; // 20MB

/**
 * Convert a Blob to base64 string (without data URL prefix)
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      // Remove the data URL prefix (e.g., "data:image/png;base64,")
      const base64 = dataUrl.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Check if a MIME type is supported for image attachments
 */
export function isSupportedMimeType(mimeType: string): mimeType is SupportedMimeType {
  return SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType);
}

/**
 * Convert a File to an ImageAttachment
 */
export async function fileToImageAttachment(file: File): Promise<ImageAttachment> {
  if (!isSupportedMimeType(file.type)) {
    throw new Error(`Unsupported image type: ${file.type}. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`);
  }

  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }

  const data = await blobToBase64(file);
  const previewUrl = URL.createObjectURL(file);

  return {
    id: crypto.randomUUID(),
    data,
    mimeType: file.type as SupportedMimeType,
    previewUrl,
  };
}

/**
 * Convert a Blob to an ImageAttachment
 */
export async function blobToImageAttachment(blob: Blob, mimeType: string): Promise<ImageAttachment> {
  if (!isSupportedMimeType(mimeType)) {
    throw new Error(`Unsupported image type: ${mimeType}. Supported types: ${SUPPORTED_MIME_TYPES.join(', ')}`);
  }

  if (blob.size > MAX_IMAGE_SIZE) {
    throw new Error(`Image too large: ${(blob.size / 1024 / 1024).toFixed(1)}MB. Maximum size: ${MAX_IMAGE_SIZE / 1024 / 1024}MB`);
  }

  const data = await blobToBase64(blob);
  const previewUrl = URL.createObjectURL(blob);

  return {
    id: crypto.randomUUID(),
    data,
    mimeType: mimeType as SupportedMimeType,
    previewUrl,
  };
}

/**
 * Read an image from the clipboard
 * Returns null if no image is found
 */
export async function readClipboardImage(): Promise<ImageAttachment | null> {
  try {
    const clipboardItems = await navigator.clipboard.read();

    for (const item of clipboardItems) {
      // Find the first supported image type
      for (const type of SUPPORTED_MIME_TYPES) {
        if (item.types.includes(type)) {
          const blob = await item.getType(type);
          return blobToImageAttachment(blob, type);
        }
      }
    }

    return null;
  } catch (error) {
    // Clipboard access may be denied or not supported
    console.error('Failed to read clipboard:', error);
    return null;
  }
}

/**
 * Clean up preview URLs to prevent memory leaks
 */
export function revokeImagePreview(image: ImageAttachment): void {
  URL.revokeObjectURL(image.previewUrl);
}
