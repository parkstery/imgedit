import type { Shape, Rect } from '../types';

/** 한글·라틴 모두 쓰기 좋은 시스템 폰트 스택 */
export const CANVAS_TEXT_FONT_STACK =
  'system-ui, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function setTextFont(ctx: CanvasRenderingContext2D, fontSize: number) {
  ctx.font = `${fontSize}px ${CANVAS_TEXT_FONT_STACK}`;
}

export function fillTextShapeOnContext(ctx: CanvasRenderingContext2D, shape: Shape) {
  if (shape.type !== 'text' || shape.text == null || shape.fontSize == null) return;
  ctx.fillStyle = shape.color;
  setTextFont(ctx, shape.fontSize);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(shape.text, shape.x1, shape.y1);
}

/** 선택 영역·겹침 판별용 근사 바운딩 박스 (이미지 좌표) */
export function measureTextShapeBounds(shape: Shape): Rect | null {
  if (shape.type !== 'text' || shape.text == null || shape.fontSize == null) return null;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  setTextFont(ctx, shape.fontSize);
  const m = ctx.measureText(shape.text);
  const left = shape.x1 + (m.actualBoundingBoxLeft ?? 0);
  const right = shape.x1 + (m.actualBoundingBoxRight ?? m.width);
  const ascent = m.actualBoundingBoxAscent ?? shape.fontSize * 0.72;
  const descent = m.actualBoundingBoxDescent ?? shape.fontSize * 0.28;
  const top = shape.y1 - ascent;
  const bottom = shape.y1 + descent;
  return {
    x: left,
    y: top,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
  };
}

/** 이미지 좌표(1픽셀=1단위)에 도형·텍스트를 그립니다. */
export function renderShapesOnContext(ctx: CanvasRenderingContext2D, shapes: readonly Shape[]) {
  for (const shape of shapes) {
    if (shape.type === 'text') {
      fillTextShapeOnContext(ctx, shape);
      continue;
    }
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.lineWidth;
    ctx.beginPath();
    if (shape.type === 'line') {
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
    } else if (shape.type === 'rect') {
      ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
    } else if (shape.type === 'ellipse') {
      const rx = Math.abs(shape.x2 - shape.x1) / 2;
      const ry = Math.abs(shape.y2 - shape.y1) / 2;
      const cx = (shape.x1 + shape.x2) / 2;
      const cy = (shape.y1 + shape.y2) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else if (shape.type === 'polyline' && shape.points && shape.points.length >= 2) {
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
    }
    ctx.stroke();
  }
}

/** @deprecated renderShapesOnContext 사용 권장 */
export function strokeShapesOnContext(ctx: CanvasRenderingContext2D, shapes: readonly Shape[]) {
  for (const shape of shapes) {
    if (shape.type === 'text') continue;
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.lineWidth;
    ctx.beginPath();
    if (shape.type === 'line') {
      ctx.moveTo(shape.x1, shape.y1);
      ctx.lineTo(shape.x2, shape.y2);
    } else if (shape.type === 'rect') {
      ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
    } else if (shape.type === 'ellipse') {
      const rx = Math.abs(shape.x2 - shape.x1) / 2;
      const ry = Math.abs(shape.y2 - shape.y1) / 2;
      const cx = (shape.x1 + shape.x2) / 2;
      const cy = (shape.y1 + shape.y2) / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    } else if (shape.type === 'polyline' && shape.points && shape.points.length >= 2) {
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
    }
    ctx.stroke();
  }
}
