import type { Rect, SelectionBitmapMask } from '../types';
import type { FloodFillOptions } from './floodFill';

export interface MagicWandOptions extends FloodFillOptions {
  /** 0~100. 높을수록 약한 경계에서도 확장을 멈춤(에지 민감). */
  edgeLimit: number;
}

function luminanceAt(data: Uint8ClampedArray, i: number): number {
  return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

/** Sobel 크기를 [1..w-2]×[1..h-2]에만 계산, 가장자리는 0 */
function computeSobelMagnitude(data: Uint8ClampedArray, w: number, h: number): Float32Array {
  const L = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      L[y * w + x] = luminanceAt(data, (y * w + x) * 4);
    }
  }
  const S = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const Gx =
        -L[i - w - 1] +
        L[i - w + 1] -
        2 * L[i - 1] +
        2 * L[i + 1] -
        L[i + w - 1] +
        L[i + w + 1];
      const Gy =
        -L[i - w - 1] -
        2 * L[i - w] -
        L[i - w + 1] +
        L[i + w - 1] +
        2 * L[i + w] +
        L[i + w + 1];
      S[i] = Math.hypot(Gx, Gy);
    }
  }
  return S;
}

function edgeThresholdFromLimit(edgeLimit: number): number {
  const e = Math.max(0, Math.min(100, edgeLimit));
  /** edgeLimit↑ → thr↓ → 강한 에지에서만 막힘 … 약한 에지에서도 막히려면 thr를 더 낮춤 */
  return Math.max(6, 255 - e * 2.35);
}

/**
 * 클릭 지점과 색이 이어진 영역을 고르되, Sobel 에지가 강한 곳에서는 확장을 멈춥니다.
 * @returns bbox + bbox 상대 0/255 마스크. 선택 픽셀이 없으면 null.
 */
export function magicWandRegionMask(
  imageData: ImageData,
  seedX: number,
  seedY: number,
  colorTolerance: number,
  options: MagicWandOptions
): { rect: Rect; mask: Uint8Array } | null {
  const w = imageData.width;
  const h = imageData.height;
  const data = imageData.data;
  const ignoreAlpha = options.ignoreAlpha ?? false;

  if (seedX < 0 || seedY < 0 || seedX >= w || seedY >= h) return null;

  const idx0 = (seedY * w + seedX) * 4;
  const tr = data[idx0];
  const tg = data[idx0 + 1];
  const tb = data[idx0 + 2];
  const ta = data[idx0 + 3];

  const matchesTarget = (i: number) => {
    const rgb =
      Math.abs(data[i] - tr) <= colorTolerance &&
      Math.abs(data[i + 1] - tg) <= colorTolerance &&
      Math.abs(data[i + 2] - tb) <= colorTolerance;
    if (ignoreAlpha) return rgb;
    return rgb && Math.abs(data[i + 3] - ta) <= colorTolerance;
  };

  if (!matchesTarget(idx0)) return null;

  const S = computeSobelMagnitude(data, w, h);
  const thr = edgeThresholdFromLimit(options.edgeLimit);

  const visited = new Uint8Array(w * h);
  const selected = new Uint8Array(w * h);
  const stack: number[] = [seedY * w + seedX];
  const maxOps = w * h * 10 + 1;
  let ops = 0;
  let count = 0;

  const d8 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  while (stack.length > 0 && ops++ < maxOps) {
    const p = stack.pop()!;
    if (visited[p]) continue;
    visited[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    const pi = p * 4;
    if (!matchesTarget(pi)) continue;

    selected[p] = 1;
    count++;

    for (const [dx, dy] of d8) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const np = ny * w + nx;
      if (visited[np]) continue;
      const edgeBlock = Math.max(S[p], S[np]) > thr;
      if (edgeBlock) continue;
      const ni = np * 4;
      if (!matchesTarget(ni)) continue;
      stack.push(np);
    }
  }

  if (count === 0) return null;

  let minX = w;
  let minY = h;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!selected[y * w + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }

  const rw = maxX - minX + 1;
  const rh = maxY - minY + 1;
  const mask = new Uint8Array(rw * rh);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (selected[y * w + x]) {
        mask[(y - minY) * rw + (x - minX)] = 255;
      }
    }
  }

  return {
    rect: { x: minX, y: minY, width: rw, height: rh },
    mask,
  };
}

/** 마스크 bbox가 rect와 동일한지(복사·크롭 검증용) */
export function selectionMaskMatchesRect(
  m: { x: number; y: number; width: number; height: number },
  r: Rect
): boolean {
  return m.x === r.x && m.y === r.y && m.width === r.width && m.height === r.height;
}

export function applySelectionMaskToCroppedCanvas(
  canvas: HTMLCanvasElement,
  mask: { width: number; height: number; data: Uint8Array }
): void {
  if (canvas.width !== mask.width || canvas.height !== mask.height) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const n = mask.width * mask.height;
  for (let i = 0; i < n; i++) {
    if (mask.data[i]) continue;
    const o = i * 4;
    d[o] = 0;
    d[o + 1] = 0;
    d[o + 2] = 0;
    d[o + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
}

export function cloneSelectionBitmapMask(m: SelectionBitmapMask | null): SelectionBitmapMask | null {
  if (!m) return null;
  return { ...m, data: new Uint8Array(m.data) };
}

/**
 * 비트마스크 선택의 실제 0/1 경계에 맞춰 점선 윤곽을 그립니다.
 * bbox `strokeRect`만 쓰면 사각형 선택처럼 보이는 문제를 줄입니다.
 */
export function strokeSelectionBitmapMaskOutline(
  ctx: CanvasRenderingContext2D,
  m: SelectionBitmapMask,
  zoom: number
): void {
  const w = m.width;
  const h = m.height;
  const d = m.data;
  const sel = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    return d[y * w + x] !== 0;
  };
  const dx = m.x;
  const dy = m.y;
  ctx.beginPath();
  for (let ex = 0; ex <= w; ex++) {
    for (let y = 0; y < h; y++) {
      if (sel(ex - 1, y) !== sel(ex, y)) {
        const x0 = dx + ex;
        const y0 = dy + y;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0, y0 + 1);
      }
    }
  }
  for (let ey = 0; ey <= h; ey++) {
    for (let x = 0; x < w; x++) {
      if (sel(x, ey - 1) !== sel(x, ey)) {
        const x0 = dx + x;
        const y0 = dy + ey;
        ctx.moveTo(x0, y0);
        ctx.lineTo(x0 + 1, y0);
      }
    }
  }
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = Math.max(1, 2 / zoom);
  ctx.setLineDash([5 / zoom, 5 / zoom]);
  ctx.stroke();
  ctx.setLineDash([]);
}
