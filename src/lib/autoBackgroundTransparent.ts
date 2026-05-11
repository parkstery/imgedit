import type { Rgba } from './floodFill';
import { replaceMatchingPixelsWithTransparent } from './floodFill';

/**
 * 이미지 가장자리 `borderPx` 두께 띠에서, 불투명에 가까운 픽셀의 지배적인 RGB(히스토그램 최빈값)를 추정합니다.
 * 단색·근단색 배경 사진에 적합합니다.
 */
export function detectDominantBorderColor(
  imageData: ImageData,
  options?: { borderPx?: number; minSampleAlpha?: number }
): Rgba | null {
  const borderPx = Math.max(1, Math.min(32, options?.borderPx ?? 2));
  const minA = Math.max(0, Math.min(255, options?.minSampleAlpha ?? 12));
  const w = imageData.width;
  const h = imageData.height;
  if (w < 1 || h < 1) return null;
  const data = imageData.data;
  const hist = new Uint32Array(32 * 32 * 32);
  const edgeDist = (x: number, y: number) => Math.min(x, y, w - 1 - x, h - 1 - y);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (edgeDist(x, y) >= borderPx) continue;
      const i = (y * w + x) * 4;
      if (data[i + 3] < minA) continue;
      const k = ((data[i] >> 3) << 10) | ((data[i + 1] >> 3) << 5) | (data[i + 2] >> 3);
      hist[k]++;
    }
  }

  let bestK = -1;
  let bestC = 0;
  for (let k = 0; k < hist.length; k++) {
    if (hist[k] > bestC) {
      bestC = hist[k];
      bestK = k;
    }
  }
  if (bestK < 0 || bestC === 0) return null;

  const br = (bestK >> 10) & 31;
  const bg = (bestK >> 5) & 31;
  const bb = bestK & 31;
  return {
    r: Math.min(255, (br << 3) + 4),
    g: Math.min(255, (bg << 3) + 4),
    b: Math.min(255, (bb << 3) + 4),
    a: 255,
  };
}

/**
 * `HTMLImageElement`를 캔버스에 그린 뒤 `target` 색을 톨러런스에 맞춰 투명 처리한 PNG data URL.
 * @returns 변경된 픽셀이 없으면 null
 */
export function colorKeyTransparentDataUrlFromImage(
  img: HTMLImageElement,
  target: Rgba,
  tolerance: number,
  ignoreAlpha: boolean
): { dataUrl: string; changed: number } | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, img.width);
  canvas.height = Math.max(1, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  const changed = replaceMatchingPixelsWithTransparent(imageData, target, tolerance, {
    ignoreAlpha,
  });
  if (changed === 0) return null;
  ctx.putImageData(imageData, 0, 0);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL();
  } catch {
    return null;
  }
  return { dataUrl, changed };
}

export type DetectedBackgroundKeyResult =
  | { ok: true; dataUrl: string; detected: Rgba }
  | { ok: false; reason: 'no_border_sample' | 'no_matching_pixels' | 'read_or_export_failed' };

/**
 * 가장자리에서 배경색을 추정한 뒤 같은 비트맵에 색키 투명을 적용합니다.
 */
export function applyDetectedBorderColorKeyFromImage(
  img: HTMLImageElement,
  tolerance: number,
  ignoreAlpha: boolean
): DetectedBackgroundKeyResult {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, img.width);
  canvas.height = Math.max(1, img.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return { ok: false, reason: 'read_or_export_failed' };
  ctx.drawImage(img, 0, 0);
  let imageData: ImageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return { ok: false, reason: 'read_or_export_failed' };
  }
  const detected = detectDominantBorderColor(imageData);
  if (!detected) return { ok: false, reason: 'no_border_sample' };
  const changed = replaceMatchingPixelsWithTransparent(imageData, detected, tolerance, {
    ignoreAlpha,
  });
  if (changed === 0) return { ok: false, reason: 'no_matching_pixels' };
  ctx.putImageData(imageData, 0, 0);
  let dataUrl: string;
  try {
    dataUrl = canvas.toDataURL();
  } catch {
    return { ok: false, reason: 'read_or_export_failed' };
  }
  return { ok: true, dataUrl, detected };
}
