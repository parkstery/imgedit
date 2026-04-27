import type { Point, Rect, Shape } from '../types';

/** 캔버스 ctx.arc에 넘길 원호 파라미터 */
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

/** 세 점을 지나는 원 (일직선이면 null) */
export function circumcircleThroughThreePoints(a: Point, b: Point, c: Point): { cx: number; cy: number; r: number } | null {
  const ax = a.x;
  const ay = a.y;
  const bx = b.x;
  const by = b.y;
  const cx = c.x;
  const cy = c.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-9) return null;
  const a2 = ax * ax + ay * ay;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  const r = Math.hypot(ax - ux, ay - uy);
  if (r < 1e-6) return null;
  return { cx: ux, cy: uy, r };
}

/** 시작→끝 호가 중간점을 지나도록 하는 방향 */
function pickArcDirection(
  as: number,
  ae: number,
  ai: number,
): { counterclockwise: boolean } | null {
  const ccwSI = angleDeltaToward(as, ai, true);
  const ccwIE = angleDeltaToward(ai, ae, true);
  const ccwSE = angleDeltaToward(as, ae, true);
  const ccwOk = Math.abs(ccwSI + ccwIE - ccwSE) < 0.03;

  const cwSI = angleDeltaToward(as, ai, false);
  const cwIE = angleDeltaToward(ai, ae, false);
  const cwSE = angleDeltaToward(as, ae, false);
  const cwOk = Math.abs(cwSI + cwIE - cwSE) < 0.03;

  if (ccwOk && !cwOk) return { counterclockwise: true };
  if (!ccwOk && cwOk) return { counterclockwise: false };
  if (ccwOk && cwOk) {
    return Math.abs(ccwSE) <= Math.abs(cwSE) ? { counterclockwise: true } : { counterclockwise: false };
  }
  return null;
}

/** 세 점: points[0]=시작, points[1]=끝, points[2]=호 위의 중간점 */
export function getArcStrokeParamsFromThreePoints(start: Point, end: Point, mid: Point): ArcStrokeParams | null {
  const o = circumcircleThroughThreePoints(start, end, mid);
  if (!o) return null;
  const { cx, cy, r } = o;
  const as = Math.atan2(start.y - cy, start.x - cx);
  const ae = Math.atan2(end.y - cy, end.x - cx);
  const ai = Math.atan2(mid.y - cy, mid.x - cx);
  const dir = pickArcDirection(as, ae, ai);
  if (!dir) return null;
  return {
    cx,
    cy,
    r,
    startAngle: as,
    endAngle: ae,
    counterclockwise: dir.counterclockwise,
  };
}

/** 이전 저장분: points 없이 x1,y1–x2,y2 지름 반원 + arcFlip */
function getArcStrokeParamsLegacyChord(shape: Shape): ArcStrokeParams | null {
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
  return { cx, cy, r, startAngle: a1, endAngle: a2, counterclockwise };
}

export function getArcStrokeParams(shape: Shape): ArcStrokeParams | null {
  if (shape.type !== 'arc') return null;
  const pts = shape.points;
  if (pts && pts.length >= 3) {
    return getArcStrokeParamsFromThreePoints(pts[0], pts[1], pts[2]);
  }
  return getArcStrokeParamsLegacyChord(shape);
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

function rectFromPoints(pts: readonly Point[]): Rect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function getArcShapeBounds(shape: Shape): Rect | null {
  if (shape.type !== 'arc') return null;
  const p = getArcStrokeParams(shape);
  if (!p) {
    if (shape.points && shape.points.length >= 3) return rectFromPoints(shape.points.slice(0, 3));
    return null;
  }
  const { cx, cy, r, startAngle, endAngle, counterclockwise } = p;
  const n = 40;
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
  const samples = 56;
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
