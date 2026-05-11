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

/** 마법 선택: `selection`과 동일한 bbox 안에서 1비트(0/255) row-major 마스크 */
export interface SelectionBitmapMask {
  x: number;
  y: number;
  width: number;
  height: number;
  data: Uint8Array;
}

/** 점선 원(복사·잘라내기·영역 캡처용). 중심+반지름은 selectionCircle에 저장 */
export interface SelectionCircle {
  cx: number;
  cy: number;
  r: number;
}

export type LineStyle = 'solid' | 'dashed' | 'dotted' | 'dashDot';

export type Tool =
  | 'select'
  /** 파란 점선 사각형(복사·잘라내기·선택 캡처용 영역) */
  | 'marquee'
  /** 파란 점선 원(복사·잘라내기·선택 캡처용) */
  | 'marqueeCircle'
  /** 색 연결 + 에지(Sobel) 기반 마법 선택 */
  | 'magicWand'
  | 'freehand'
  | 'line'
  | 'polyline'
  | 'rect'
  | 'ellipse'
  /** 원호: 세 점(시작, 끝, 호 위 중간) */
  | 'arc'
  | 'fill'
  /** 클릭한 위치와 색이 이어진 영역을 투명으로(페인트통과 동일 합성·톨러런스 옵션 공유) */
  | 'transparentFill'
  | 'eraser'
  | 'text';

export interface PolylineDraft {
  id: string;
  points: Point[];
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
}

export interface FreehandDraft {
  id: string;
  points: Point[];
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
}

/** 텍스트 도구: 클릭한 이미지 좌표에 배치, 입력 후 확정 */
export interface TextDraft {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
}

/** 벡터 도형이 모이는 레이어(아래에서 위로 쌓임) */
export interface EditorLayer {
  id: string;
  name: string;
  visible: boolean;
  /** true면 선택·이동·그리기 등 편집 불가(표시만) */
  locked: boolean;
  /** 이 레이어에 귀속된 래스터(없으면 도형만) */
  image: HTMLImageElement | null;
  fileName: string | null;
  /** 래스터 왼쪽 위를 문서 좌표 (0,0) 기준으로 배치 */
  imageX: number;
  imageY: number;
  /** 래스터 회전(라디안). 비트맵 중심(imageX+W/2, imageY+H/2) 기준. 없으면 0. */
  imageRotation?: number;
  shapes: Shape[];
}

export interface Shape {
  id: string;
  type: 'line' | 'rect' | 'ellipse' | 'arc' | 'polyline' | 'text';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  /** polyline: 꼭짓점 / arc: [시작, 끝, 중간(호 위)] 세 점 */
  points?: Point[];
  /** type이 text일 때 (x1,y1) 왼쪽 베이스라인, fillText 기준 */
  text?: string;
  fontSize?: number;
  /** type이 text일 때 기본 글자 모양 */
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  /** 회전 각(라디안). 기본 0. 회전 앵커는 항상 stored AABB의 중심. */
  rotation?: number;
  /** type이 arc이고 구식 2점만 있을 때: 지름 반원의 반대편 */
  arcFlip?: boolean;
  /** type이 rect일 때 둥근 모서리 반지름(px). 기본 0 */
  rectRadius?: number;
}

export interface EditorState {
  zoom: number;
  position: Point;
  selection: Rect | null;
  /** 원형 영역 선택(복사·잘라내기). marqueeCircle 도구일 때 사용. 사각 selection 과 동시에 쓰지 않음 */
  selectionCircle: SelectionCircle | null;
  /** 마법 선택 등 비사각 선택 마스크. null이면 `selection`만 사각형으로 유효 */
  selectionMask: SelectionBitmapMask | null;
  isSelecting: boolean;
  isPanning: boolean;
  tool: Tool;
  color: string;
  lineWidth: number;
  lineStyle: LineStyle;
  /** 지우개 도구 브러시 크기(px) */
  eraserSize: number;
  /** 사각형 도구 모서리 반지름(px), 기본 0 */
  rectRadius: number;
  /** 텍스트 도구 글자 크기(px) */
  textFontSize: number;
  /** 텍스트 도구 기본 글자 모양 */
  textBold: boolean;
  textItalic: boolean;
  textUnderline: boolean;
  /** 페인트통 채우기 색 일치 허용 오차 (0~100, 채널별) */
  fillTolerance: number;
  /** true면 채우기 영역 판별 시 RGB만 비교하고 알파는 무시 */
  fillIgnoreAlpha: boolean;
  /** 마법 선택: 에지 차단 강도 0~100 (높을수록 경계에서 확장을 더 일찍 멈춤) */
  magicWandEdgeLimit: number;
  /** 아래→위 순서. 새 도형은 activeLayerId 레이어에 추가 */
  layers: EditorLayer[];
  activeLayerId: string;
  activeShape: Shape | null;
  /** 선택된 벡터 도형 id들. 영역 selection(Rect)과는 개념이 다름. */
  selectedShapeIds: string[];
  /** 선택 도구로 선택한 레이어 래스터(이동·삭제). 도형 선택과 동시에 쓰지 않음. */
  selectedRasterLayerId: string | null;
  /** 폴리라인 그리는 중 (클릭으로 점 추가, Enter·우클릭으로 완료) */
  polylineDraft: PolylineDraft | null;
  /** 자유그리기 중 (첫 클릭 시작, 다음 클릭 완료) */
  freehandDraft: FreehandDraft | null;
  /** 텍스트 입력 중 (캔버스로 배치 위치 지정 후 하단 고정 패널에서 입력) */
  textDraft: TextDraft | null;
}

export interface ImageUndoSnapshot {
  layers: EditorLayer[];
  activeLayerId: string;
  selection: Rect | null;
  selectionCircle: SelectionCircle | null;
  selectionMask: SelectionBitmapMask | null;
  zoom: number;
  position: Point;
}

/** image: 캔버스 전체 교체(새로 붙여넣기 등), imageMerge: 기존 이미지 위에 합성(부분 붙여넣기) */
export type UndoEntry =
  | { type: 'shape'; layerId: string; label?: string }
  | { type: 'image'; snapshot: ImageUndoSnapshot; label?: string }
  | { type: 'imageMerge'; snapshot: ImageUndoSnapshot; label?: string }
  /** 레이어·도형 일괄 변경 전 스냅샷 */
  | { type: 'layersSnapshot'; beforeLayers: EditorLayer[]; beforeActiveLayerId: string; label?: string };
