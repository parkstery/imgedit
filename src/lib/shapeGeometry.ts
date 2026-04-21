import type { Point, Rect, Shape } from '../types';
import { measureTextShapeBounds } from './drawShapes';

/** 이미지 좌표계 기준 도형 바운딩 박스. 폴리라인은 점 집합, 텍스트는 measureText 기반. */
export function getShapeBounds(shape: Shape): Rect | null {
  if (shape.type === 'text') return measureTextShapeBounds(shape);
  if (shape.type === 'polyline' && shape.points && shape.points.length > 0) {
    let minX = shape.points[0].x;
    let minY = shape.points[0].y;
    let maxX = minX;
    let maxY = minY;
    for (const p of shape.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };
  }
  const x = Math.min(shape.x1, shape.x2);
  const y = Math.min(shape.y1, shape.y2);
  const w = Math.max(1, Math.abs(shape.x2 - shape.x1));
  const h = Math.max(1, Math.abs(shape.y2 - shape.y1));
  return { x, y, width: w, height: h };
}

function pointToSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  const qx = a.x + t * dx;
  const qy = a.y + t * dy;
  return Math.hypot(p.x - qx, p.y - qy);
}

function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

/** 점과 축정렬 타원 경계까지의 근사 거리. (rx,ry 중 하나가 0이면 Infinity) */
function distanceToEllipseBoundary(
  p: Point,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): number {
  if (rx <= 0 || ry <= 0) return Infinity;
  const dx = p.x - cx;
  const dy = p.y - cy;
  const f = Math.hypot(dx / rx, dy / ry);
  if (f === 0) return Math.min(rx, ry);
  const bx = cx + dx / f;
  const by = cy + dy / f;
  return Math.hypot(p.x - bx, p.y - by);
}

/** p가 shape의 "외곽선/영역" 근처인지. tolerance는 이미지 좌표계 거리(px). */
export function hitTestShape(shape: Shape, p: Point, tolerance: number): boolean {
  const tol = Math.max(1, tolerance);
  if (shape.type === 'text') {
    const b = getShapeBounds(shape);
    if (!b) return false;
    const padded: Rect = {
      x: b.x - tol,
      y: b.y - tol,
      width: b.width + tol * 2,
      height: b.height + tol * 2,
    };
    return pointInRect(p, padded);
  }
  const effectiveTol = Math.max(tol, shape.lineWidth / 2);
  if (shape.type === 'line') {
    return (
      pointToSegmentDistance(
        p,
        { x: shape.x1, y: shape.y1 },
        { x: shape.x2, y: shape.y2 },
      ) <= effectiveTol
    );
  }
  if (shape.type === 'rect') {
    const x1 = Math.min(shape.x1, shape.x2);
    const x2 = Math.max(shape.x1, shape.x2);
    const y1 = Math.min(shape.y1, shape.y2);
    const y2 = Math.max(shape.y1, shape.y2);
    const corners: Point[] = [
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ];
    for (let i = 0; i < 4; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 4];
      if (pointToSegmentDistance(p, a, b) <= effectiveTol) return true;
    }
    return false;
  }
  if (shape.type === 'ellipse') {
    const rx = Math.abs(shape.x2 - shape.x1) / 2;
    const ry = Math.abs(shape.y2 - shape.y1) / 2;
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    return distanceToEllipseBoundary(p, cx, cy, rx, ry) <= effectiveTol;
  }
  if (shape.type === 'polyline' && shape.points && shape.points.length >= 2) {
    for (let i = 1; i < shape.points.length; i++) {
      if (pointToSegmentDistance(p, shape.points[i - 1], shape.points[i]) <= effectiveTol) {
        return true;
      }
    }
    return false;
  }
  return false;
}

/** 최상단 우선(배열 끝에서부터) 탐색. 맞는 것이 없으면 null. */
export function pickTopShape(
  shapes: readonly Shape[],
  p: Point,
  tolerance: number,
): Shape | null {
  for (let i = shapes.length - 1; i >= 0; i--) {
    if (hitTestShape(shapes[i], p, tolerance)) return shapes[i];
  }
  return null;
}

/** 모든 좌표/점을 dx, dy만큼 평행이동한 새 도형 반환. */
export function translateShape(shape: Shape, dx: number, dy: number): Shape {
  const next: Shape = {
    ...shape,
    x1: shape.x1 + dx,
    y1: shape.y1 + dy,
    x2: shape.x2 + dx,
    y2: shape.y2 + dy,
  };
  if (shape.points) {
    next.points = shape.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
  }
  return next;
}

/** 도형 한 개를 깊은 복사. (이동 시작 시 스냅샷용) */
export function cloneShape(shape: Shape): Shape {
  return {
    ...shape,
    points: shape.points ? shape.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
  };
}
