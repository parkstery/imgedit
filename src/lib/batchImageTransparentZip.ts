import JSZip from 'jszip';
import { hexToRgba, replaceMatchingPixelsWithTransparent } from './floodFill';

export interface BatchTransparentOptions {
  colorHex: string;
  tolerance: number;
  ignoreAlpha: boolean;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('read'));
    r.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지 디코딩 실패'));
    img.src = src;
  });
}

/** ZIP 안 파일명(경로·위험 문자 제거, .png) */
export function safeZipPngName(originalName: string, index: number): string {
  const raw = (originalName || '').replace(/\\/g, '/').split('/').pop() || '';
  const cleaned = raw.replace(/[^\w.\-가-힣\u3040-\u30ff\u4e00-\u9fff\s()\[\]]+/gu, '_').slice(0, 160);
  const base = (cleaned || `image-${index + 1}`).replace(/\.[^.]+$/i, '');
  return `${base || `image-${index + 1}`}.png`;
}

/**
 * 한 장의 이미지 파일에서 `target` 색(톨러런스)과 일치하는 픽셀을 전역으로 투명 처리한 PNG Blob.
 */
export async function fileToColorkeyTransparentPngBlob(
  file: File,
  options: BatchTransparentOptions
): Promise<Blob | null> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);
  const w = Math.max(1, img.naturalWidth || img.width);
  const h = Math.max(1, img.naturalHeight || img.height);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, w, h);
  } catch {
    return null;
  }
  const target = hexToRgba(options.colorHex);
  replaceMatchingPixelsWithTransparent(imageData, target, options.tolerance, {
    ignoreAlpha: options.ignoreAlpha,
  });
  ctx.putImageData(imageData, 0, 0);
  return await new Promise<Blob | null>(resolve => {
    canvas.toBlob(b => resolve(b), 'image/png');
  });
}

export interface BatchZipResult {
  blob: Blob;
  successCount: number;
  failCount: number;
}

/**
 * 여러 이미지를 각각 동일 옵션으로 투명 배경 처리한 뒤 하나의 ZIP으로 묶습니다.
 * @throws 성공한 파일이 하나도 없을 때
 */
export async function buildTransparentPngZip(
  files: readonly File[],
  options: BatchTransparentOptions
): Promise<BatchZipResult> {
  const zip = new JSZip();
  let successCount = 0;
  let failCount = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    try {
      const blob = await fileToColorkeyTransparentPngBlob(f, options);
      if (blob && blob.size > 0) {
        zip.file(safeZipPngName(f.name, i), blob);
        successCount++;
      } else {
        failCount++;
      }
    } catch {
      failCount++;
    }
  }
  if (successCount === 0) {
    const err = new Error('NO_SUCCESS');
    throw err;
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  return { blob, successCount, failCount };
}
