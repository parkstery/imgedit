import type { Shape } from '../types';

/** 이미지 좌표(1픽셀=1단위) 캔버스에 도형 스트로크만 그립니다. 저장/페인트통 합성에 동일하게 사용합니다. */
export function strokeShapesOnContext(ctx: CanvasRenderingContext2D, shapes: readonly Shape[]) {
  for (const shape of shapes) {
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
