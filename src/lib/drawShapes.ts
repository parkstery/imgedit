import type { LineStyle, Point, Shape, Rect } from '../types';
import { circumcircleThroughThreePoints, getArcStrokeParams } from './arcGeometry';

/** 한글·라틴 모두 쓰기 좋은 시스템 폰트 스택 */
export const CANVAS_TEXT_FONT_STACK =
  'system-ui, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function setTextFont(ctx: CanvasRenderingContext2D, fontSize: number) {
  ctx.font = `${fontSize}px ${CANVAS_TEXT_FONT_STACK}`;
}

export function getLineDashPattern(style: LineStyle, lineWidth: number): number[] {
  const u = Math.max(1, lineWidth);
  switch (style) {
    case 'dashed':
      return [u * 4, u * 2.5];
    case 'dotted':
      return [u, u * 2.2];
    case 'dashDot':
      return [u * 4, u * 2.2, u, u * 2.2];
    case 'solid':
    default:
      return [];
  }
}

export function applyStrokeStyle(ctx: CanvasRenderingContext2D, lineWidth: number, lineStyle: LineStyle) {
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(getLineDashPattern(lineStyle, lineWidth));
}

/** 회전 중심점(= stored AABB 중심). 회전은 이 점을 기준으로 적용된다. */
export function getShapeRotationCenter(shape: Shape): Point {
  if (shape.type === 'text') {
    const b = measureTextShapeBounds(shape);
    if (b) return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    return { x: shape.x1, y: shape.y1 };
  }
  if (shape.type === 'arc' && shape.points && shape.points.length >= 3) {
    const o = circumcircleThroughThreePoints(shape.points[0], shape.points[1], shape.points[2]);
    if (o) return { x: o.cx, y: o.cy };
  }
  if (shape.type === 'polyline' && shape.points && shape.points.length > 0) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of shape.points) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  }
  return { x: (shape.x1 + shape.x2) / 2, y: (shape.y1 + shape.y2) / 2 };
}

function applyShapeRotationTransform(
  ctx: CanvasRenderingContext2D,
  shape: Shape,
): boolean {
  const r = shape.rotation ?? 0;
  if (!r) return false;
  const c = getShapeRotationCenter(shape);
  ctx.translate(c.x, c.y);
  ctx.rotate(r);
  ctx.translate(-c.x, -c.y);
  return true;
}

export function fillTextShapeOnContext(ctx: CanvasRenderingContext2D, shape: Shape) {
  if (shape.type !== 'text' || shape.text == null || shape.fontSize == null) return;
  const fs = Math.max(1, shape.fontSize);
  ctx.save();
  applyShapeRotationTransform(ctx, shape);
  ctx.globalAlpha = 1;
  ctx.fillStyle = shape.color;
  setTextFont(ctx, fs);
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(shape.text, shape.x1, shape.y1);
  ctx.restore();
}

/** 선택 영역·겹침 판별용 근사 바운딩 박스 (이미지 좌표, 회전 미반영 = 로컬 AABB) */
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

function drawShapePath(ctx: CanvasRenderingContext2D, shape: Shape) {
  ctx.beginPath();
  if (shape.type === 'line') {
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
  } else if (shape.type === 'rect') {
    ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
    return;
  } else if (shape.type === 'ellipse') {
    const rx = Math.abs(shape.x2 - shape.x1) / 2;
    const ry = Math.abs(shape.y2 - shape.y1) / 2;
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  } else if (shape.type === 'arc') {
    const ap = getArcStrokeParams(shape);
    if (ap) {
      ctx.arc(ap.cx, ap.cy, ap.r, ap.startAngle, ap.endAngle, ap.counterclockwise);
    }
  } else if (shape.type === 'polyline' && shape.points && shape.points.length >= 2) {
    ctx.moveTo(shape.points[0].x, shape.points[0].y);
    for (let i = 1; i < shape.points.length; i++) {
      ctx.lineTo(shape.points[i].x, shape.points[i].y);
    }
  }
  ctx.stroke();
}

/** 이미지 좌표(1픽셀=1단위)에 도형·텍스트를 그립니다. 회전은 내부에서 자동 적용. */
export function renderShapesOnContext(ctx: CanvasRenderingContext2D, shapes: readonly Shape[]) {
  for (const shape of shapes) {
    if (shape.type === 'text') {
      fillTextShapeOnContext(ctx, shape);
      continue;
    }
    ctx.save();
    applyShapeRotationTransform(ctx, shape);
    ctx.strokeStyle = shape.color;
    applyStrokeStyle(ctx, shape.lineWidth, shape.lineStyle);
    drawShapePath(ctx, shape);
    ctx.setLineDash([]);
    ctx.restore();
  }
}

/** @deprecated renderShapesOnContext 사용 권장 */
export function strokeShapesOnContext(ctx: CanvasRenderingContext2D, shapes: readonly Shape[]) {
  for (const shape of shapes) {
    if (shape.type === 'text') continue;
    ctx.save();
    applyShapeRotationTransform(ctx, shape);
    ctx.strokeStyle = shape.color;
    applyStrokeStyle(ctx, shape.lineWidth, shape.lineStyle);
    drawShapePath(ctx, shape);
    ctx.setLineDash([]);
    ctx.restore();
  }
}
