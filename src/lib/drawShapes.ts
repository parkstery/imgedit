import type { LineStyle, Point, Shape, Rect } from '../types';
import { circumcircleThroughThreePoints, getArcStrokeParams } from './arcGeometry';

/** 한글·라틴 모두 쓰기 좋은 시스템 폰트 스택 */
export const CANVAS_TEXT_FONT_STACK =
  'system-ui, "Segoe UI", "Malgun Gothic", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function setTextFont(ctx: CanvasRenderingContext2D, fontSize: number) {
  ctx.font = `${fontSize}px ${CANVAS_TEXT_FONT_STACK}`;
}

function setTextFontStyled(
  ctx: CanvasRenderingContext2D,
  fontSize: number,
  opts: { bold?: boolean; italic?: boolean } = {},
) {
  const fw = opts.bold ? '700' : '400';
  const fs = opts.italic ? 'italic' : 'normal';
  ctx.font = `${fs} ${fw} ${fontSize}px ${CANVAS_TEXT_FONT_STACK}`;
}

function splitTextLines(text: string): string[] {
  return text.split(/\r?\n/);
}

function getTextLineHeight(fontSize: number): number {
  return Math.max(1, fontSize * 1.25);
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
  const lines = splitTextLines(shape.text);
  const lineHeight = getTextLineHeight(fs);
  ctx.save();
  applyShapeRotationTransform(ctx, shape);
  ctx.globalAlpha = 1;
  ctx.fillStyle = shape.color;
  setTextFontStyled(ctx, fs, { bold: shape.bold, italic: shape.italic });
  ctx.textBaseline = 'alphabetic';
  lines.forEach((line, i) => {
    const yy = shape.y1 + i * lineHeight;
    ctx.fillText(line, shape.x1, yy);
    if (shape.underline) {
      const m = ctx.measureText(line || ' ');
      const left = shape.x1 + (m.actualBoundingBoxLeft ?? 0);
      const right = shape.x1 + (m.actualBoundingBoxRight ?? m.width);
      const uy = yy + Math.max(1, fs * 0.12);
      ctx.beginPath();
      ctx.moveTo(left, uy);
      ctx.lineTo(right, uy);
      ctx.lineWidth = Math.max(1, fs * 0.08);
      ctx.strokeStyle = shape.color;
      ctx.stroke();
    }
  });
  ctx.restore();
}

/** 선택 영역·겹침 판별용 근사 바운딩 박스 (이미지 좌표, 회전 미반영 = 로컬 AABB) */
export function measureTextShapeBounds(shape: Shape): Rect | null {
  if (shape.type !== 'text' || shape.text == null || shape.fontSize == null) return null;
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  const fs = Math.max(1, shape.fontSize);
  const lines = splitTextLines(shape.text);
  const lineHeight = getTextLineHeight(fs);
  setTextFontStyled(ctx, fs, { bold: shape.bold, italic: shape.italic });
  let minLeft = 0;
  let maxRight = 0;
  let firstAscent = fs * 0.72;
  let lastDescent = fs * 0.28;
  lines.forEach((line, i) => {
    const m = ctx.measureText(line);
    const left = m.actualBoundingBoxLeft ?? 0;
    const right = m.actualBoundingBoxRight ?? m.width;
    minLeft = Math.min(minLeft, left);
    maxRight = Math.max(maxRight, right);
    if (i === 0) firstAscent = m.actualBoundingBoxAscent ?? firstAscent;
    if (i === lines.length - 1) lastDescent = m.actualBoundingBoxDescent ?? lastDescent;
  });
  const top = shape.y1 - firstAscent;
  let bottom = shape.y1 + (lines.length - 1) * lineHeight + lastDescent;
  if (shape.underline) {
    const underlineBottom = shape.y1 + (lines.length - 1) * lineHeight + Math.max(1, fs * 0.2);
    bottom = Math.max(bottom, underlineBottom);
  }
  return {
    x: shape.x1 + minLeft,
    y: top,
    width: Math.max(1, maxRight - minLeft),
    height: Math.max(1, bottom - top),
  };
}

function drawShapePath(ctx: CanvasRenderingContext2D, shape: Shape) {
  ctx.beginPath();
  if (shape.type === 'line') {
    ctx.moveTo(shape.x1, shape.y1);
    ctx.lineTo(shape.x2, shape.y2);
  } else if (shape.type === 'rect') {
    const x = Math.min(shape.x1, shape.x2);
    const y = Math.min(shape.y1, shape.y2);
    const w = Math.abs(shape.x2 - shape.x1);
    const h = Math.abs(shape.y2 - shape.y1);
    const radius = Math.max(0, Math.min(shape.rectRadius ?? 0, w / 2, h / 2));
    if (radius <= 0) {
      ctx.strokeRect(x, y, w, h);
    } else {
      ctx.roundRect(x, y, w, h, radius);
      ctx.stroke();
    }
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
