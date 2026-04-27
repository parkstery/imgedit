import type { Point, Rect, Shape } from '../types';

/** 캔버스 ctx.arc에 넘길 반원(현의 지름 = x1,y1 ~ x2,y2) 파라미터 */
export type ArcStrokeParams = {
  cx: number;
  cy: number;
  r: number;
  startAngle: number;
  endAngle: number;
  counterclockwise: boolean;
};

function normAngle(t: number): number {
  let u = t;
  while (u <= -Math.PI) u += 2 * Math.PI;
  while (u > Math.PI) u -= 2 * Math.PI;
  return u;
}

function angleDeltaToward(start: number, end: number, counterclockwise: boolean): number {
  let d = end - start;
  if (counterclockwise) {
    while (d <= 0) d += 2 * Math.PI;
  } else {
    while (d >= 0) d -= 2 * Math.PI;
  }
  return d;
}

/** chord의 왼쪽(시작→끝 벡터 기준 반시계 90°)에 불룩한 반원. arcFlip이면 반대편 반원 */
export function getArcStrokeParams(shape: Shape): ArcStrokeParams | null {
  if (shape.type !== 'arc') return null;
  const { x1, y1, x2, y2, arcFlip } = shape;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const c = Math.hypot(dx, dy);
  if (c < 1e-6) return null;
  const r = c / 2;
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const ux = (-dy / c) * r;
  const uy = (dx / c) * r;
  const apexX = cx + (arcFlip ? -ux : ux);
  const apexY = cy + (arcFlip ? -uy : uy);
  const a1 = Math.atan2(y1 - cy, x1 - cx);
  const a2 = Math.atan2(y2 - cy, x2 - cx);
  const apexAng = Math.atan2(apexY - cy, apexX - cx);

  const midCCW = normAngle(a1 + Math.PI / 2);
  const midCW = normAngle(a1 - Math.PI / 2);
  const dist = (u: number, v: number) => Math.abs(normAngle(u - v));
  const counterclockwise = dist(midCCW, apexAng) <= dist(midCW, apexAng);

  return {
    cx,
    cy,
    r,
    startAngle: a1,
    endAngle: a2,
    counterclockwise,
  };
}

function arcPointAt(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
  counterclockwise: boolean,
  t: number,
): Point {
  const delta = angleDeltaToward(startAngle, endAngle, counterclockwise);
  const ang = startAngle + delta * t;
  return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
}

export function getArcShapeBounds(shape: Shape): Rect | null {
  if (shape.type !== 'arc') return null;
  const p = getArcStrokeParams(shape);
  if (!p) return null;
  const { cx, cy, r, startAngle, endAngle, counterclockwise } = p;
  const n = 32;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= n; i++) {
    const pt = arcPointAt(cx, cy, r, startAngle, endAngle, counterclockwise, i / n);
    minX = Math.min(minX, pt.x);
    maxX = Math.max(maxX, pt.x);
    minY = Math.min(minY, pt.y);
    maxY = Math.max(maxY, pt.y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function pointToArcStrokeDistance(q: Point, p: ArcStrokeParams): number {
  const { cx, cy, r, startAngle, endAngle, counterclockwise } = p;
  const samples = 48;
  let best = Infinity;
  for (let i = 0; i <= samples; i++) {
    const pt = arcPointAt(cx, cy, r, startAngle, endAngle, counterclockwise, i / samples);
    const d = Math.hypot(q.x - pt.x, q.y - pt.y);
    if (d < best) best = d;
  }
  return best;
}

export function hitTestArcShape(shape: Shape, q: Point, tolerance: number): boolean {
  if (shape.type !== 'arc') return false;
  const p = getArcStrokeParams(shape);
  if (!p) return false;
  const eff = Math.max(tolerance, shape.lineWidth / 2);
  return pointToArcStrokeDistance(q, p) <= eff;
}
