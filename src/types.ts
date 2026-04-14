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
  imageDataUrl: string;
  fileName: string | null;
  shapes: Shape[];
  selection: Rect | null;
  zoom: number;
  position: Point;
}

export type UndoEntry =
  | { type: 'shape' }
  | { type: 'image'; snapshot: ImageUndoSnapshot };
