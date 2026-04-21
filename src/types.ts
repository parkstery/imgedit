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

export type Tool = 'select' | 'freehand' | 'line' | 'polyline' | 'rect' | 'ellipse' | 'fill' | 'text';

export interface PolylineDraft {
  id: string;
  points: Point[];
  color: string;
  lineWidth: number;
}

export interface FreehandDraft {
  id: string;
  points: Point[];
  color: string;
  lineWidth: number;
}

/** 텍스트 도구: 클릭한 이미지 좌표에 배치, 입력 후 확정 */
export interface TextDraft {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
}

export interface Shape {
  id: string;
  type: 'line' | 'rect' | 'ellipse' | 'polyline' | 'text';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lineWidth: number;
  /** type이 polyline일 때 꼭짓점 (이미지 좌표) */
  points?: Point[];
  /** type이 text일 때 (x1,y1) 왼쪽 베이스라인, fillText 기준 */
  text?: string;
  fontSize?: number;
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
  lineWidth: number;
  /** 텍스트 도구 글자 크기(px) */
  textFontSize: number;
  /** 페인트통 채우기 색 일치 허용 오차 (0~100, 채널별) */
  fillTolerance: number;
  /** true면 채우기 영역 판별 시 RGB만 비교하고 알파는 무시 */
  fillIgnoreAlpha: boolean;
  shapes: Shape[];
  activeShape: Shape | null;
  /** 선택된 벡터 도형 id들. 영역 selection(Rect)과는 개념이 다름. */
  selectedShapeIds: string[];
  /** 폴리라인 그리는 중 (클릭으로 점 추가, Enter·우클릭으로 완료) */
  polylineDraft: PolylineDraft | null;
  /** 자유그리기 중 (첫 클릭 시작, 다음 클릭 완료) */
  freehandDraft: FreehandDraft | null;
  /** 텍스트 입력 중 (캔버스로 배치 위치 지정 후 하단 고정 패널에서 입력) */
  textDraft: TextDraft | null;
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
  | { type: 'shape'; label?: string }
  | { type: 'image'; snapshot: ImageUndoSnapshot; label?: string }
  | { type: 'imageMerge'; snapshot: ImageUndoSnapshot; label?: string }
  /** 벡터 도형 배열 변경(이동/삭제/넛지). beforeShapes 로 되돌림. */
  | { type: 'shapesSnapshot'; beforeShapes: Shape[]; label?: string };
