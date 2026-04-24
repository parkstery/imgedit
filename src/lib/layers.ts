import type { EditorLayer, Point, Shape } from '../types';
import { pickTopShape } from './shapeGeometry';

export function newLayerId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function createEditorLayer(name: string, shapes: Shape[] = []): EditorLayer {
  return {
    id: newLayerId(),
    name,
    visible: true,
    locked: false,
    shapes,
  };
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
