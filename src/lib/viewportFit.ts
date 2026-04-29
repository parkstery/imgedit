import type { Point } from '../types';

/** `CanvasEditor` 스크롤 뷰포트 — `getDocumentCanvasSize`와 동일한 SCROLL_PAD 규칙과 맞출 것 */
export const EDITOR_CANVAS_VIEWPORT_SELECTOR = '[data-editor-canvas-viewport]';

const FIT_SCROLL_PAD = 64;

export function getEditorCanvasViewportSize(): { w: number; h: number } | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector(EDITOR_CANVAS_VIEWPORT_SELECTOR);
  if (!el) return null;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w < 48 || h < 48) return null;
  return { w, h };
}

/**
 * 문서 전체가 뷰포트 안에 들어가도록 zoom·position.
 * 1픽셀=1문서단위를 넘지 않도록 zoom 상한 1.
 */
export function computeFitZoomPosition(
  docW: number,
  docH: number,
  viewportW: number,
  viewportH: number,
): { zoom: number; position: Point } {
  const pad = 24;
  const availW = Math.max(1, viewportW - pad - FIT_SCROLL_PAD);
  const availH = Math.max(1, viewportH - pad - FIT_SCROLL_PAD);
  if (docW <= 0 || docH <= 0) {
    return { zoom: 1, position: { x: pad, y: pad } };
  }
  const zoomFit = Math.min(availW / docW, availH / docH);
  const zoom = Math.max(0.01, Math.min(8, Math.min(1, zoomFit)));
  return { zoom, position: { x: pad, y: pad } };
}
