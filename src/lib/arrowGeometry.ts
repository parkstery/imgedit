import type { Point } from '../types';

const ARROW_HEAD_HALF_ANGLE = Math.PI / 7;

export function getArrowHeadLength(lineWidth: number): number {
  return Math.max(8, lineWidth * 4);
}

export interface ArrowHeadVertices {
  tip: Point;
  left: Point;
  right: Point;
}

export function getArrowHeadVertices(
  tailX: number,
  tailY: number,
  tipX: number,
  tipY: number,
  lineWidth: number,
): ArrowHeadVertices {
  const headLen = getArrowHeadLength(lineWidth);
  const angle = Math.atan2(tipY - tailY, tipX - tailX);
  const tip = { x: tipX, y: tipY };
  const left = {
    x: tipX + headLen * Math.cos(angle + Math.PI - ARROW_HEAD_HALF_ANGLE),
    y: tipY + headLen * Math.sin(angle + Math.PI - ARROW_HEAD_HALF_ANGLE),
  };
  const right = {
    x: tipX + headLen * Math.cos(angle + Math.PI + ARROW_HEAD_HALF_ANGLE),
    y: tipY + headLen * Math.sin(angle + Math.PI + ARROW_HEAD_HALF_ANGLE),
  };
  return { tip, left, right };
}

export function pointInTriangle(p: Point, a: Point, b: Point, c: Point): boolean {
  const sign = (p1: Point, p2: Point, p3: Point) =>
    (p1.x - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (p1.y - p3.y);
  const d1 = sign(p, a, b);
  const d2 = sign(p, b, c);
  const d3 = sign(p, c, a);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/** 현재 strokeStyle·fillStyle을 사용해 화살표(몸통+촉)를 그립니다. */
export function strokeArrowOnContext(
  ctx: CanvasRenderingContext2D,
  tailX: number,
  tailY: number,
  tipX: number,
  tipY: number,
  lineWidth: number,
): void {
  const head = getArrowHeadVertices(tailX, tailY, tipX, tipY, lineWidth);
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(tipX, tipY);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(head.tip.x, head.tip.y);
  ctx.lineTo(head.left.x, head.left.y);
  ctx.lineTo(head.right.x, head.right.y);
  ctx.closePath();
  const fill = ctx.fillStyle;
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
  ctx.fillStyle = fill;
}
