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

export type Tool = 'select' | 'line' | 'polyline' | 'rect' | 'ellipse';

export interface PolylineDraft {
  id: string;
  points: Point[];
  color: string;
  lineWidth: number;
}

export interface Shape {
  id: string;
  type: 'line' | 'rect' | 'ellipse' | 'polyline';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lineWidth: number;
  /** type이 polyline일 때 꼭짓점 (이미지 좌표) */
  points?: Point[];
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
  /** 폴리라인 그리는 중 (클릭으로 점 추가, Enter·우클릭으로 완료) */
  polylineDraft: PolylineDraft | null;
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
