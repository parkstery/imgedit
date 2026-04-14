export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Tool = 'select' | 'line' | 'rect' | 'ellipse';

export interface Shape {
  id: string;
  type: 'line' | 'rect' | 'ellipse';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lineWidth: number;
}

export interface EditorState {
  zoom: number;
  position: Point;
  selection: Rect | null;
  isSelecting: boolean;
  isPanning: boolean;
  image: HTMLImageElement | null;
  fileName: string | null;
  tool: Tool;
  color: string;
  shapes: Shape[];
  activeShape: Shape | null;
}

export interface ImageUndoSnapshot {
  /** 가능할 때만(동일 출처 등). 없으면 imageElement로 복구 */
  imageDataUrl?: string;
  /** toDataURL 불가(tainted 캔버스)여도 붙여넣기 직전 비트맵을 참조로 보존 */
  imageElement?: HTMLImageElement | null;
  fileName: string | null;
  shapes: Shape[];
  selection: Rect | null;
  zoom: number;
  position: Point;
}

/** image: 캔버스 전체 교체(새로 붙여넣기 등), imageMerge: 기존 이미지 위에 합성(부분 붙여넣기) */
export type UndoEntry =
  | { type: 'shape' }
  | { type: 'image'; snapshot: ImageUndoSnapshot }
  | { type: 'imageMerge'; snapshot: ImageUndoSnapshot };
