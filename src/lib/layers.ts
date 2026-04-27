import type { EditorLayer, Point, Rect, Shape } from '../types';
import { pickTopShape } from './shapeGeometry';
import { renderShapesOnContext } from './drawShapes';

/** 래스터(비트맵 + imageX/Y + imageRotation)의 문서 좌표계에서의 축정렬 바운딩 박스 */
export function getRasterDocWorldAabb(layer: EditorLayer): Rect | null {
  const img = layer.image;
  if (!img) return null;
  const ix = layer.imageX ?? 0;
  const iy = layer.imageY ?? 0;
  const w = img.width;
  const h = img.height;
  const r = layer.imageRotation ?? 0;
  if (!r || Math.abs(r) < 1e-9) {
    return { x: ix, y: iy, width: w, height: h };
  }
  const cx = ix + w / 2;
  const cy = iy + h / 2;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const corners = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of corners) {
    const rx = p.x * cos - p.y * sin + cx;
    const ry = p.x * sin + p.y * cos + cy;
    minX = Math.min(minX, rx);
    maxX = Math.max(maxX, rx);
    minY = Math.min(minY, ry);
    maxY = Math.max(maxY, ry);
  }
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function drawRasterImageOnContext(ctx: CanvasRenderingContext2D, layer: EditorLayer): void {
  const img = layer.image;
  if (!img) return;
  const ix = layer.imageX ?? 0;
  const iy = layer.imageY ?? 0;
  const w = img.width;
  const h = img.height;
  const r = layer.imageRotation ?? 0;
  if (!r || Math.abs(r) < 1e-9) {
    ctx.drawImage(img, ix, iy);
    return;
  }
  const cx = ix + w / 2;
  const cy = iy + h / 2;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(r);
  ctx.drawImage(img, -w / 2, -h / 2);
  ctx.restore();
}

export function newLayerId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export const DEFAULT_DOC_WIDTH = 1200;
export const DEFAULT_DOC_HEIGHT = 800;

export function createEditorLayer(name: string, shapes: Shape[] = []): EditorLayer {
  return {
    id: newLayerId(),
    name,
    visible: true,
    locked: false,
    image: null,
    fileName: null,
    imageX: 0,
    imageY: 0,
    shapes,
  };
}

/** 기존 "레이어 N" 이름과 겹치지 않는 다음 기본 이름을 만듭니다. */
export function getNextLayerName(layers: readonly EditorLayer[]): string {
  let maxNo = 0;
  for (const layer of layers) {
    const m = /^레이어\s+(\d+)$/.exec(layer.name.trim());
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (!Number.isNaN(n)) maxNo = Math.max(maxNo, n);
  }
  return `레이어 ${maxNo + 1}`;
}

/** 모든 레이어 래스터 배치의 합집합(없으면 기본 문서 크기) */
export function getDocumentCanvasSize(layers: readonly EditorLayer[]): { width: number; height: number } {
  let maxR = 0;
  let maxB = 0;
  for (const layer of layers) {
    if (layer.image) {
      const box = getRasterDocWorldAabb(layer);
      if (box) {
        maxR = Math.max(maxR, box.x + box.width);
        maxB = Math.max(maxB, box.y + box.height);
      }
    }
  }
  if (maxR <= 0 || maxB <= 0) return { width: DEFAULT_DOC_WIDTH, height: DEFAULT_DOC_HEIGHT };
  return {
    width: Math.max(DEFAULT_DOC_WIDTH, maxR),
    height: Math.max(DEFAULT_DOC_HEIGHT, maxB),
  };
}

export function documentHasRaster(layers: readonly EditorLayer[]): boolean {
  return layers.some(l => l.image != null);
}

/** 아래 레이어부터 각 레이어의 래스터 후 도형을 그립니다(문서 좌표). */
export function drawLayerStackToContext(
  ctx: CanvasRenderingContext2D,
  layers: readonly EditorLayer[],
  docW: number,
  docH: number,
): void {
  ctx.clearRect(0, 0, docW, docH);
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.image) {
      drawRasterImageOnContext(ctx, layer);
    }
    renderShapesOnContext(ctx, layer.shapes);
  }
}

/** 표시 중인 레이어의 래스터만 순서대로(페인트통 마스크용, 도형 제외). */
export function drawVisibleLayerRastersToContext(
  ctx: CanvasRenderingContext2D,
  layers: readonly EditorLayer[],
  docW: number,
  docH: number,
): void {
  ctx.clearRect(0, 0, docW, docH);
  for (const layer of layers) {
    if (!layer.visible) continue;
    if (layer.image) {
      drawRasterImageOnContext(ctx, layer);
    }
  }
}

/** 하단(배경) → 상단(전경) 순으로 이어붙인 도형 배열 (그리기·히트 테스트용) */
export function flattenVisibleShapesInOrder(layers: readonly EditorLayer[]): Shape[] {
  const out: Shape[] = [];
  for (const layer of layers) {
    if (!layer.visible) continue;
    out.push(...layer.shapes);
  }
  return out;
}

export function getActiveLayer(
  layers: readonly EditorLayer[],
  activeLayerId: string
): EditorLayer | undefined {
  return layers.find(l => l.id === activeLayerId);
}

export function cloneLayerDeep(layer: EditorLayer): EditorLayer {
  return {
    ...layer,
    image: layer.image,
    fileName: layer.fileName,
    shapes: layer.shapes.map(sh => ({
      ...sh,
      points: sh.points ? sh.points.map(p => ({ x: p.x, y: p.y })) : undefined,
    })),
  };
}

export function cloneLayersDeep(layers: readonly EditorLayer[]): EditorLayer[] {
  return layers.map(cloneLayerDeep);
}

export function mapLayersReplaceActiveShapes(
  layers: readonly EditorLayer[],
  activeLayerId: string,
  shapes: Shape[]
): EditorLayer[] {
  return layers.map(l => (l.id === activeLayerId ? { ...l, shapes } : l));
}

export function mapLayersUpdateLayer(
  layers: readonly EditorLayer[],
  layerId: string,
  fn: (layer: EditorLayer) => EditorLayer
): EditorLayer[] {
  return layers.map(l => (l.id === layerId ? fn(l) : l));
}

/** 합성된 단일 비트맵을 활성 레이어에 두고, 나머지 레이어 래스터·도형은 비움(평탄화 붙여넣기·채우기·잘라내기 등). */
export function mapLayersFlattenRasterToActive(
  layers: readonly EditorLayer[],
  activeLayerId: string,
  mergedImage: HTMLImageElement,
  activeFileName: string | null,
): EditorLayer[] {
  return layers.map(l =>
    l.id === activeLayerId
      ? {
          ...l,
          image: mergedImage,
          fileName: activeFileName ?? l.fileName,
          shapes: [],
          imageX: 0,
          imageY: 0,
          imageRotation: undefined,
        }
      : { ...l, image: null, fileName: null, shapes: [], imageX: 0, imageY: 0, imageRotation: undefined }
  );
}

/** 활성 레이어의 래스터만 교체(도형·다른 레이어는 그대로). 클립보드 붙여넣기 등에 사용. */
export function mapLayersReplaceActiveLayerRaster(
  layers: readonly EditorLayer[],
  activeLayerId: string,
  image: HTMLImageElement,
  fileName: string | null,
): EditorLayer[] {
  return layers.map(l =>
    l.id === activeLayerId
      ? { ...l, image, fileName: fileName ?? l.fileName, imageX: 0, imageY: 0, imageRotation: undefined }
      : l
  );
}

/** 도형 id가 속한 레이어 id (없으면 undefined) */
export function findLayerIdForShapeId(
  layers: readonly EditorLayer[],
  shapeId: string
): string | undefined {
  for (const layer of layers) {
    if (layer.shapes.some(s => s.id === shapeId)) return layer.id;
  }
  return undefined;
}

export function totalShapeCount(layers: readonly EditorLayer[]): number {
  return layers.reduce((n, l) => n + l.shapes.length, 0);
}

/** 위 레이어부터, 잠금 레이어는 스킵 */
export function pickTopShapeInLayers(
  layers: readonly EditorLayer[],
  p: Point,
  tolerance: number
): Shape | null {
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li];
    if (!layer.visible || layer.locked) continue;
    const hit = pickTopShape(layer.shapes, p, tolerance);
    if (hit) return hit;
  }
  return null;
}

export type InteractivePickResult =
  | { kind: 'shape'; shape: Shape; layerId: string }
  | { kind: 'raster'; layerId: string };

/** 위 레이어부터: 같은 레이어에서는 도형이 래스터보다 위. 잠금·숨김 레이어는 제외. */
export function pickTopInteractiveTarget(
  layers: readonly EditorLayer[],
  p: Point,
  tolerance: number
): InteractivePickResult | null {
  for (let li = layers.length - 1; li >= 0; li--) {
    const layer = layers[li];
    if (!layer.visible || layer.locked) continue;
    const shapeHit = pickTopShape(layer.shapes, p, tolerance);
    if (shapeHit) return { kind: 'shape', shape: shapeHit, layerId: layer.id };
    if (layer.image) {
      const ix = layer.imageX ?? 0;
      const iy = layer.imageY ?? 0;
      const w = layer.image.width;
      const h = layer.image.height;
      const r = layer.imageRotation ?? 0;
      const cx = ix + w / 2;
      const cy = iy + h / 2;
      const dx = p.x - cx;
      const dy = p.y - cy;
      let lx = dx;
      let ly = dy;
      if (r) {
        const cos = Math.cos(-r);
        const sin = Math.sin(-r);
        lx = dx * cos - dy * sin;
        ly = dx * sin + dy * cos;
      }
      if (lx >= -w / 2 && lx <= w / 2 && ly >= -h / 2 && ly <= h / 2) {
        return { kind: 'raster', layerId: layer.id };
      }
    }
  }
  return null;
}

export function findShapeInLayers(
  layers: readonly EditorLayer[],
  shapeId: string
): Shape | undefined {
  for (const layer of layers) {
    const sh = layer.shapes.find(s => s.id === shapeId);
    if (sh) return sh;
  }
  return undefined;
}

export function mapLayersUpdateShapeById(
  layers: readonly EditorLayer[],
  shapeId: string,
  nextShape: Shape
): EditorLayer[] {
  return layers.map(layer => ({
    ...layer,
    shapes: layer.shapes.map(sh => (sh.id === shapeId ? nextShape : sh)),
  }));
}

/** 현재 시각(회전 포함)을 비트맵에 굽고 imageRotation 은 제거합니다. toDataURL 불가 시 null. */
export function bakeRasterLayerVisualToAxisAligned(layer: EditorLayer): Promise<{
  image: HTMLImageElement;
  imageX: number;
  imageY: number;
} | null> {
  if (!layer.image) return Promise.resolve(null);
  const r = layer.imageRotation ?? 0;
  const ix = layer.imageX ?? 0;
  const iy = layer.imageY ?? 0;
  if (!r || Math.abs(r) < 1e-9) {
    return Promise.resolve({ image: layer.image, imageX: ix, imageY: iy });
  }
  const box = getRasterDocWorldAabb(layer);
  if (!box) return Promise.resolve(null);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(box.width));
  c.height = Math.max(1, Math.ceil(box.height));
  const ctx = c.getContext('2d');
  if (!ctx) return Promise.resolve(null);
  ctx.setTransform(1, 0, 0, 1, -box.x, -box.y);
  drawRasterImageOnContext(ctx, layer);
  let dataUrl: string;
  try {
    dataUrl = c.toDataURL();
  } catch {
    return Promise.resolve(null);
  }
  return new Promise(resolve => {
    const out = new Image();
    out.onload = () => resolve({ image: out, imageX: box.x, imageY: box.y });
    out.onerror = () => resolve(null);
    out.src = dataUrl;
  });
}
