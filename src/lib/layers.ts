import type { EditorLayer, Point, Shape } from '../types';
import { pickTopShape } from './shapeGeometry';
import { renderShapesOnContext } from './drawShapes';

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

/** 모든 레이어 래스터 배치의 합집합(없으면 기본 문서 크기) */
export function getDocumentCanvasSize(layers: readonly EditorLayer[]): { width: number; height: number } {
  let maxR = 0;
  let maxB = 0;
  for (const layer of layers) {
    if (layer.image) {
      const ix = layer.imageX ?? 0;
      const iy = layer.imageY ?? 0;
      maxR = Math.max(maxR, ix + layer.image.width);
      maxB = Math.max(maxB, iy + layer.image.height);
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
      ctx.drawImage(layer.image, layer.imageX ?? 0, layer.imageY ?? 0);
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
      ctx.drawImage(layer.image, layer.imageX ?? 0, layer.imageY ?? 0);
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
        }
      : { ...l, image: null, fileName: null, shapes: [], imageX: 0, imageY: 0 }
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
      ? { ...l, image, fileName: fileName ?? l.fileName, imageX: 0, imageY: 0 }
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
      if (p.x >= ix && p.y >= iy && p.x < ix + w && p.y < iy + h) {
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
