import type { EditorLayer, Rect } from '../types';
import { drawLayerStackToContext, getDocumentCanvasSize } from './layers';

/** 합성 문서를 한 장의 캔버스로 그립니다. */
export function createCompositeCanvas(layers: readonly EditorLayer[]): HTMLCanvasElement | null {
  const { width, height } = getDocumentCanvasSize(layers);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawLayerStackToContext(ctx, layers, width, height);
  return canvas;
}

/** rect를 문서(0,0)~(dw,dh) 안으로 자릅니다. width/height는 양수라고 가정합니다. */
export function clampRectToBounds(rect: Rect, dw: number, dh: number): Rect {
  const x1 = Math.max(0, Math.min(rect.x, dw));
  const y1 = Math.max(0, Math.min(rect.y, dh));
  const x2 = Math.max(x1, Math.min(rect.x + rect.width, dw));
  const y2 = Math.max(y1, Math.min(rect.y + rect.height, dh));
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

export function cropCanvasToRegion(full: HTMLCanvasElement, rect: Rect): HTMLCanvasElement | null {
  const dw = full.width;
  const dh = full.height;
  const r = clampRectToBounds(rect, dw, dh);
  if (r.width < 1 || r.height < 1) return null;
  const out = document.createElement('canvas');
  out.width = Math.floor(r.width);
  out.height = Math.floor(r.height);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(full, r.x, r.y, r.width, r.height, 0, 0, out.width, out.height);
  return out;
}

export async function writeCanvasToClipboardPng(canvas: HTMLCanvasElement): Promise<void> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}
