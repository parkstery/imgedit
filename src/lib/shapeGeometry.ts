import type { Point, Rect, Shape } from '../types';
import { getArcShapeBounds, hitTestArcShape } from './arcGeometry';
import { getShapeRotationCenter, measureTextShapeBounds } from './drawShapes';

export type CornerHandleId = 'TL' | 'TR' | 'BR' | 'BL';
export type EdgeHandleId = 'T' | 'R' | 'B' | 'L';
export type ResizeHandleId = CornerHandleId | EdgeHandleId;

export interface PickedHandle {
  kind: 'corner' | 'edge' | 'rotation';
  id: ResizeHandleId | 'ROT';
}

export interface OrientedHandles {
  center: Point;
  rotation: number;
  localBounds: Rect;
  corners: { id: CornerHandleId; world: Point }[];
  edges: { id: EdgeHandleId; world: Point }[];
  rotationHandle: Point;
  /** 드로잉용: 회전 적용된 OBB의 네 코너 (TL→TR→BR→BL) */
  cornersWorld: Point[];
}

/** stored(=로컬, 회전 미적용) 좌표계 기준 AABB. */
export function getShapeBounds(shape: Shape): Rect | null {
  if (shape.type === 'text') return measureTextShapeBounds(shape);
  if (shape.type === 'arc') {
    return getArcShapeBounds(shape);
  }
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

/** 두 축정렬 사각형의 합집합 AABB */
export function unionRects(a: Rect, b: Rect): Rect {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.width, b.x + b.width);
  const y2 = Math.max(a.y + a.height, b.y + b.height);
  return { x: x1, y: y1, width: Math.max(1, x2 - x1), height: Math.max(1, y2 - y1) };
}

/** 문서 좌표계에서 도형의 축정렬 바운드(회전 반영). */
export function getShapeWorldAabb(shape: Shape): Rect | null {
  const rot = shape.rotation ?? 0;
  const c = getShapeRotationCenter(shape);

  const aabbFromCorners = (corners: Point[]): Rect => {
    if (!rot) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of corners) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of corners) {
      const w = rotatePoint(p, c, rot);
      minX = Math.min(minX, w.x);
      maxX = Math.max(maxX, w.x);
      minY = Math.min(minY, w.y);
      maxY = Math.max(maxY, w.y);
    }
    return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
  };

  if (shape.type === 'text') {
    const b = measureTextShapeBounds(shape);
    if (!b) return null;
    return aabbFromCorners([
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ]);
  }

  if (shape.type === 'line') {
    return aabbFromCorners([
      { x: shape.x1, y: shape.y1 },
      { x: shape.x2, y: shape.y2 },
    ]);
  }

  if (shape.type === 'rect') {
    const x1 = Math.min(shape.x1, shape.x2);
    const x2 = Math.max(shape.x1, shape.x2);
    const y1 = Math.min(shape.y1, shape.y2);
    const y2 = Math.max(shape.y1, shape.y2);
    return aabbFromCorners([
      { x: x1, y: y1 },
      { x: x2, y: y1 },
      { x: x2, y: y2 },
      { x: x1, y: y2 },
    ]);
  }

  if (shape.type === 'ellipse') {
    const rx = Math.abs(shape.x2 - shape.x1) / 2;
    const ry = Math.abs(shape.y2 - shape.y1) / 2;
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    if (!rot) {
      return {
        x: cx - rx,
        y: cy - ry,
        width: Math.max(1, 2 * rx),
        height: Math.max(1, 2 * ry),
      };
    }
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const halfW = Math.hypot(rx * cos, ry * sin);
    const halfH = Math.hypot(rx * sin, ry * cos);
    return {
      x: cx - halfW,
      y: cy - halfH,
      width: Math.max(1, 2 * halfW),
      height: Math.max(1, 2 * halfH),
    };
  }

  if (shape.type === 'arc') {
    const b = getArcShapeBounds(shape);
    if (!b) return null;
    return aabbFromCorners([
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height },
    ]);
  }

  if (shape.type === 'polyline' && shape.points && shape.points.length > 0) {
    return aabbFromCorners(shape.points.map(p => ({ x: p.x, y: p.y })));
  }

  return null;
}

function rotatePoint(p: Point, c: Point, angle: number): Point {
  if (!angle) return { x: p.x, y: p.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

function rotateVec(v: Point, angle: number): Point {
  if (!angle) return { x: v.x, y: v.y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos };
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

/** 회전이 있으면 점을 도형 중심 기준으로 역회전한 뒤 축정렬 히트테스트. */
export function hitTestShape(shape: Shape, p: Point, tolerance: number): boolean {
  const r = shape.rotation ?? 0;
  const q = r ? rotatePoint(p, getShapeRotationCenter(shape), -r) : p;
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
    return pointInRect(q, padded);
  }
  const effectiveTol = Math.max(tol, shape.lineWidth / 2);
  if (shape.type === 'line') {
    return (
      pointToSegmentDistance(
        q,
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
      if (pointToSegmentDistance(q, a, b) <= effectiveTol) return true;
    }
    return false;
  }
  if (shape.type === 'ellipse') {
    const rx = Math.abs(shape.x2 - shape.x1) / 2;
    const ry = Math.abs(shape.y2 - shape.y1) / 2;
    const cx = (shape.x1 + shape.x2) / 2;
    const cy = (shape.y1 + shape.y2) / 2;
    return distanceToEllipseBoundary(q, cx, cy, rx, ry) <= effectiveTol;
  }
  if (shape.type === 'arc') {
    return hitTestArcShape(shape, q, effectiveTol);
  }
  if (shape.type === 'polyline' && shape.points && shape.points.length >= 2) {
    for (let i = 1; i < shape.points.length; i++) {
      if (pointToSegmentDistance(q, shape.points[i - 1], shape.points[i]) <= effectiveTol) {
        return true;
      }
    }
    return false;
  }
  return false;
}

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

export function cloneShape(shape: Shape): Shape {
  return {
    ...shape,
    points: shape.points ? shape.points.map((p) => ({ x: p.x, y: p.y })) : undefined,
  };
}

/** 선택 도형의 핸들 좌표(월드). rotationHandleOffset 은 이미지 좌표 기준 거리. */
export function getOrientedHandles(
  shape: Shape,
  rotationHandleOffset: number,
): OrientedHandles | null {
  const bounds = getShapeBounds(shape);
  if (!bounds) return null;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const r = shape.rotation ?? 0;
  const W = bounds.width;
  const H = bounds.height;
  const toWorld = (lx: number, ly: number): Point => {
    const wv = rotateVec({ x: lx, y: ly }, r);
    return { x: center.x + wv.x, y: center.y + wv.y };
  };
  const corners: OrientedHandles['corners'] = [
    { id: 'TL', world: toWorld(-W / 2, -H / 2) },
    { id: 'TR', world: toWorld(W / 2, -H / 2) },
    { id: 'BR', world: toWorld(W / 2, H / 2) },
    { id: 'BL', world: toWorld(-W / 2, H / 2) },
  ];
  const edges: OrientedHandles['edges'] = [
    { id: 'T', world: toWorld(0, -H / 2) },
    { id: 'R', world: toWorld(W / 2, 0) },
    { id: 'B', world: toWorld(0, H / 2) },
    { id: 'L', world: toWorld(-W / 2, 0) },
  ];
  const rotationHandle = toWorld(0, -H / 2 - rotationHandleOffset);
  return {
    center,
    rotation: r,
    localBounds: bounds,
    corners,
    edges,
    rotationHandle,
    cornersWorld: corners.map((c) => c.world),
  };
}

/** 핸들 히트테스트: 회전 핸들 → 코너 → 엣지 순으로 우선. */
export function hitTestHandle(
  handles: OrientedHandles,
  p: Point,
  tolerance: number,
  opts: { includeEdges?: boolean; includeRotation?: boolean } = {
    includeEdges: true,
    includeRotation: true,
  },
): PickedHandle | null {
  const t2 = tolerance * tolerance;
  const within = (a: Point, b: Point): boolean => {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy <= t2;
  };
  if (opts.includeRotation !== false && within(p, handles.rotationHandle)) {
    return { kind: 'rotation', id: 'ROT' };
  }
  for (const h of handles.corners) {
    if (within(p, h.world)) return { kind: 'corner', id: h.id };
  }
  if (opts.includeEdges !== false) {
    for (const h of handles.edges) {
      if (within(p, h.world)) return { kind: 'edge', id: h.id };
    }
  }
  return null;
}

const HANDLE_LOCAL: Record<ResizeHandleId, { hx: number; hy: number }> = {
  TL: { hx: 0, hy: 0 },
  T: { hx: 0.5, hy: 0 },
  TR: { hx: 1, hy: 0 },
  R: { hx: 1, hy: 0.5 },
  BR: { hx: 1, hy: 1 },
  B: { hx: 0.5, hy: 1 },
  BL: { hx: 0, hy: 1 },
  L: { hx: 0, hy: 0.5 },
};

/** 리사이즈 핸들 드래그: startShape 기준으로 새 도형 산출.
 *  opts.anchorAtCenter=true(Alt)면 중심 앵커, 아니면 반대편 핸들 앵커.
 *  opts.uniform=true(Shift)면 비율 고정(aspect ratio 유지).
 *  텍스트는 강제 uniform.
 */
export function applyResize(
  startShape: Shape,
  handle: ResizeHandleId,
  currentPointer: Point,
  opts: { anchorAtCenter?: boolean; uniform?: boolean } = {},
): Shape {
  const boundsStart = getShapeBounds(startShape);
  if (!boundsStart) return startShape;
  const { x: xMin, y: yMin, width: W0, height: H0 } = boundsStart;
  if (W0 <= 0 || H0 <= 0) return startShape;
  const center0 = { x: xMin + W0 / 2, y: yMin + H0 / 2 };
  const r = startShape.rotation ?? 0;
  const { hx, hy } = HANDLE_LOCAL[handle];
  const isEdge = hx === 0.5 || hy === 0.5;
  const anchorAtCenter = !!opts.anchorAtCenter;
  const anchor_u = anchorAtCenter ? 0.5 : hx === 0.5 ? 0.5 : 1 - hx;
  const anchor_v = anchorAtCenter ? 0.5 : hy === 0.5 ? 0.5 : 1 - hy;
  const anchorStored = { x: xMin + anchor_u * W0, y: yMin + anchor_v * H0 };
  const anchorWorld = rotatePoint(anchorStored, center0, r);
  const deltaLocal = rotateVec(
    { x: currentPointer.x - anchorWorld.x, y: currentPointer.y - anchorWorld.y },
    -r,
  );
  const kx = hx - anchor_u;
  const ky = hy - anchor_v;
  let W1 = W0;
  let H1 = H0;
  if (kx !== 0) W1 = deltaLocal.x / kx;
  if (ky !== 0) H1 = deltaLocal.y / ky;
  const forceUniform = startShape.type === 'text' && !isEdge;
  if ((opts.uniform || forceUniform) && kx !== 0 && ky !== 0) {
    const ratioX = W1 / W0;
    const ratioY = H1 / H0;
    const absX = Math.abs(ratioX);
    const absY = Math.abs(ratioY);
    if (absX >= absY) {
      const signY = ratioY >= 0 ? 1 : -1;
      H1 = H0 * absX * signY;
    } else {
      const signX = ratioX >= 0 ? 1 : -1;
      W1 = W0 * absY * signX;
    }
  }
  const minSize = 1;
  if (Math.abs(W1) < minSize) W1 = W1 < 0 ? -minSize : minSize;
  if (Math.abs(H1) < minSize) H1 = H1 < 0 ? -minSize : minSize;
  const centerOffsetLocal = { x: (anchor_u - 0.5) * W1, y: (anchor_v - 0.5) * H1 };
  const centerOffsetWorld = rotateVec(centerOffsetLocal, r);
  const center1 = {
    x: anchorWorld.x - centerOffsetWorld.x,
    y: anchorWorld.y - centerOffsetWorld.y,
  };
  const xMin1 = center1.x - W1 / 2;
  const yMin1 = center1.y - H1 / 2;
  const sx = W1 / W0;
  const sy = H1 / H0;
  const remap = (p: Point): Point => ({
    x: xMin1 + ((p.x - xMin) / W0) * W1,
    y: yMin1 + ((p.y - yMin) / H0) * H1,
  });
  const next: Shape = {
    ...startShape,
    x1: remap({ x: startShape.x1, y: startShape.y1 }).x,
    y1: remap({ x: startShape.x1, y: startShape.y1 }).y,
    x2: remap({ x: startShape.x2, y: startShape.y2 }).x,
    y2: remap({ x: startShape.x2, y: startShape.y2 }).y,
  };
  if (startShape.points) {
    next.points = startShape.points.map((p) => remap(p));
  }
  const sAvg = Math.sqrt(Math.max(1e-6, Math.abs(sx * sy)));
  next.lineWidth = Math.max(1, startShape.lineWidth * sAvg);
  if (startShape.type === 'text' && startShape.fontSize != null) {
    next.fontSize = Math.max(4, startShape.fontSize * Math.abs(sx));
  }
  return next;
}

/** 회전 핸들 드래그: startShape 기준으로 회전각만 갱신.
 *  snap15 가 true면 π/12(15°) 단위 스냅.
 */
export function applyRotation(
  startShape: Shape,
  startPointer: Point,
  currentPointer: Point,
  snap15: boolean,
): Shape {
  const center = getShapeRotationCenter(startShape);
  const startAngle = Math.atan2(startPointer.y - center.y, startPointer.x - center.x);
  const currentAngle = Math.atan2(currentPointer.y - center.y, currentPointer.x - center.x);
  let newRotation = (startShape.rotation ?? 0) + (currentAngle - startAngle);
  if (snap15) {
    const step = Math.PI / 12;
    newRotation = Math.round(newRotation / step) * step;
  }
  return { ...cloneShape(startShape), rotation: newRotation };
}

/** 핸들 ID별 기본 커서. 회전 상태에 따라 커서를 보정하면 더 정확하지만 1차에서는 단순 매핑. */
export function cursorForHandle(id: ResizeHandleId | 'ROT', rotation: number): string {
  if (id === 'ROT') return 'grab';
  const map: Record<ResizeHandleId, number> = {
    T: 0,
    TR: 45,
    R: 90,
    BR: 135,
    B: 180,
    BL: 225,
    L: 270,
    TL: 315,
  };
  const deg = map[id] + (rotation * 180) / Math.PI;
  const n = ((Math.round(deg / 45) % 8) + 8) % 8;
  switch (n) {
    case 0:
    case 4:
      return 'ns-resize';
    case 1:
    case 5:
      return 'nesw-resize';
    case 2:
    case 6:
      return 'ew-resize';
    case 3:
    case 7:
      return 'nwse-resize';
    default:
      return 'pointer';
  }
}
