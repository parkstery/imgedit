import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { EditorState, Point, Rect, Shape, EditorLayer } from '../types';
import { cn } from '../lib/utils';
import { floodFillImageData, hexToRgba } from '../lib/floodFill';
import {
  fillTextShapeOnContext,
  CANVAS_TEXT_FONT_STACK,
  strokeShapesOnContext,
  getShapeRotationCenter,
} from '../lib/drawShapes';
import {
  cloneShape,
  translateShape,
  getOrientedHandles,
  getShapeBounds,
  hitTestHandle,
  applyResize,
  applyRotation,
  cursorForHandle,
  type ResizeHandleId,
  type PickedHandle,
} from '../lib/shapeGeometry';
import {
  cloneLayersDeep,
  documentHasRaster,
  drawLayerStackToContext,
  drawVisibleLayerRastersToContext,
  findShapeInLayers,
  flattenVisibleShapesInOrder,
  getActiveLayer,
  getDocumentCanvasSize,
  mapLayersFlattenRasterToActive,
  mapLayersReplaceActiveShapes,
  mapLayersUpdateShapeById,
  pickTopInteractiveTarget,
} from '../lib/layers';

interface CanvasEditorProps {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  onImageLoad: (file: File) => void;
  onPaste: () => void;
  onShapeCommitted?: (label?: string) => void;
  /** 레이어·도형이 (추가가 아닌) 변형/삭제될 때: 변경 전 스냅샷을 Undo 스택에 쌓음 */
  onLayersMutation?: (beforeLayers: EditorLayer[], beforeActiveLayerId: string, label?: string) => void;
  /** 페인트통 등 비트맵 변경 직전에 Undo용 스냅샷을 쌓을 때 호출 */
  onPrepareImageUndo?: () => void;
  /** 맞춤 등에서 뷰 스크롤을 맨 위·왼쪽으로 맞출 때 증가 */
  scrollResetKey?: number;
  /** true면 첫 드래그로 문서 좌표 영역을 지정해 캡처(클립보드) */
  areaCaptureArmed?: boolean;
  /** 드래그 종료 시 유효한 rect면 캡처, null이면 취소·무효 */
  onAreaCaptureResult?: (rect: Rect | null) => void;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  state,
  setState,
  onImageLoad,
  onPaste,
  onShapeCommitted,
  onLayersMutation,
  onPrepareImageUndo,
  scrollResetKey = 0,
  areaCaptureArmed = false,
  onAreaCaptureResult,
}) => {
  const getShapeCommitLabel = useCallback((tool: EditorState['tool']) => {
    switch (tool) {
      case 'marquee':
        return '영역 선택';
      case 'line':
        return '선 그리기';
      case 'rect':
        return '사각형 그리기';
      case 'ellipse':
        return '원 그리기';
      case 'polyline':
        return '폴리라인';
      case 'freehand':
        return '자유그리기';
      case 'text':
        return '텍스트';
      default:
        return '도형 추가';
    }
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  /** overflow 영역 스크롤 (그리기·이미지 좌표에 반영) */
  const scrollPosRef = useRef({ x: 0, y: 0 });
  const drawRef = useRef<() => void>(() => {});
  const [viewportSize, setViewportSize] = useState({ w: 0, h: 0 });
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  /** ResizeObserver 연속 호출을 프레임당 1회로 제한 */
  const resizeRafRef = useRef<number | null>(null);
  /** 폴리라인: 마지막 점에서 커서까지 미리보기 */
  const [polyHover, setPolyHover] = useState<Point | null>(null);
  /** mouseup 직후 mouseleave가 한 번 더 오며 도형이 이중 커밋되는 것을 막음 */
  const shapeEndGuardRef = useRef(false);
  /** 선택 도구 도형 이동 중 상태. initialById: 이동 시작 시점의 해당 도형 원본. snapshotBefore: Undo용 전체 배열. */
  const moveStateRef = useRef<{
    startImagePoint: Point;
    shapeIds: string[];
    initialById: Map<string, Shape>;
    snapshotBefore: EditorLayer[];
    hasMoved: boolean;
  } | null>(null);
  /** 리사이즈 드래그 중 상태. 단일 도형 기준. */
  const resizeStateRef = useRef<{
    shapeId: string;
    handle: ResizeHandleId;
    startShape: Shape;
    snapshotBefore: EditorLayer[];
    hasMoved: boolean;
  } | null>(null);
  /** 회전 드래그 중 상태. */
  const rotateStateRef = useRef<{
    shapeId: string;
    startShape: Shape;
    startPointer: Point;
    snapshotBefore: EditorLayer[];
    hasMoved: boolean;
  } | null>(null);
  /** 선택 도구: 레이어 래스터 드래그 이동 */
  const rasterMoveStateRef = useRef<{
    startImagePoint: Point;
    layerId: string;
    initialX: number;
    initialY: number;
    snapshotBefore: EditorLayer[];
    hasMoved: boolean;
  } | null>(null);
  /** 선택된 래스터: 도형과 동일한 코너·엣지 드래그로 비율/크기 조절 */
  const rasterResizeStateRef = useRef<{
    layerId: string;
    handle: ResizeHandleId;
    startBoundsShape: Shape;
    startImageDataUrl: string;
    snapshotBefore: EditorLayer[];
    hasMoved: boolean;
  } | null>(null);
  const rasterResizeGenRef = useRef(0);
  /** 선택된 래스터: 회전 핸들 드래그(도형 회전과 동일 UX, Shift 시 15° 스냅) */
  const rasterRotateStateRef = useRef<{
    layerId: string;
    centerX: number;
    centerY: number;
    startAngle: number;
    sourceImage: HTMLImageElement;
    srcW: number;
    srcH: number;
    snapshotBefore: EditorLayer[];
    hasMoved: boolean;
  } | null>(null);
  const rasterRotateGenRef = useRef(0);
  const areaCaptureDragRef = useRef<{ start: Point } | null>(null);
  const lastImgPosRef = useRef<Point>({ x: 0, y: 0 });
  const [captureDraftRect, setCaptureDraftRect] = useState<Rect | null>(null);

  /** 선택 도구에서 커서 아래 도형이 있을 때 true → 커서를 move 로 바꿈 */
  const [hoveringShape, setHoveringShape] = useState(false);
  /** 선택 도구에서 핸들 위 호버 상태 (커서 피드백용) */
  const [hoverHandle, setHoverHandle] = useState<PickedHandle | null>(null);

  const ROTATION_HANDLE_OFFSET_PX = 24; // 화면 픽셀 기준 상단에서 떨어지는 거리
  const HANDLE_HIT_TOL_PX = 10;
  const HANDLE_DRAW_SIZE_PX = 9;

  /** 현재 상태에서 단일 선택 도형의 핸들. 선택이 1개가 아니면 null. */
  const getActiveHandles = useCallback(() => {
    if (state.selectedShapeIds.length !== 1) return null;
    const selId = state.selectedShapeIds[0];
    const sh = findShapeInLayers(state.layers, selId);
    if (!sh) return null;
    const offset = ROTATION_HANDLE_OFFSET_PX / state.zoom;
    return { shape: sh, handles: getOrientedHandles(sh, offset) };
  }, [state.selectedShapeIds, state.layers, state.zoom]);

  const buildRasterBoundsShape = useCallback((lyr: EditorLayer): Shape | null => {
    if (!lyr.image) return null;
    const ix = lyr.imageX ?? 0;
    const iy = lyr.imageY ?? 0;
    const w = lyr.image.width;
    const h = lyr.image.height;
    return {
      id: '__raster_bounds__',
      type: 'rect',
      x1: ix,
      y1: iy,
      x2: ix + w,
      y2: iy + h,
      color: '#000000',
      lineWidth: 1,
    };
  }, []);

  const commitPolylineDraft = useCallback(() => {
    setState(prev => {
      const d = prev.polylineDraft;
      if (!d || d.points.length < 2) return prev;
      const xs = d.points.map(p => p.x);
      const ys = d.points.map(p => p.y);
      const x1 = Math.min(...xs);
      const x2 = Math.max(...xs);
      const y1 = Math.min(...ys);
      const y2 = Math.max(...ys);
      const shape: Shape = {
        id: d.id,
        type: 'polyline',
        x1,
        y1,
        x2,
        y2,
        points: d.points.map(p => ({ x: p.x, y: p.y })),
        color: d.color,
        lineWidth: d.lineWidth,
      };
      const al = getActiveLayer(prev.layers, prev.activeLayerId);
      if (!al || al.locked) return prev;
      return {
        ...prev,
        layers: mapLayersReplaceActiveShapes(prev.layers, prev.activeLayerId, [...al.shapes, shape]),
        polylineDraft: null,
      };
    });
    setPolyHover(null);
    queueMicrotask(() => onShapeCommitted?.('폴리라인'));
  }, [setState, onShapeCommitted]);

  const commitFreehandDraft = useCallback(() => {
    setState(prev => {
      const d = prev.freehandDraft;
      if (!d || d.points.length < 2) return { ...prev, freehandDraft: null };
      const xs = d.points.map(p => p.x);
      const ys = d.points.map(p => p.y);
      const shape: Shape = {
        id: d.id,
        type: 'polyline',
        x1: Math.min(...xs),
        y1: Math.min(...ys),
        x2: Math.max(...xs),
        y2: Math.max(...ys),
        points: d.points.map(p => ({ x: p.x, y: p.y })),
        color: d.color,
        lineWidth: d.lineWidth,
      };
      const al = getActiveLayer(prev.layers, prev.activeLayerId);
      if (!al || al.locked) return prev;
      return {
        ...prev,
        layers: mapLayersReplaceActiveShapes(prev.layers, prev.activeLayerId, [...al.shapes, shape]),
        freehandDraft: null,
      };
    });
    queueMicrotask(() => onShapeCommitted?.('자유그리기'));
  }, [setState, onShapeCommitted]);

  useEffect(() => {
    if (state.tool !== 'polyline') setPolyHover(null);
    if (state.tool !== 'select') setHoveringShape(false);
  }, [state.tool]);

  useEffect(() => {
    if (!areaCaptureArmed) {
      areaCaptureDragRef.current = null;
      setCaptureDraftRect(null);
    }
  }, [areaCaptureArmed]);

  useEffect(() => {
    if (!areaCaptureArmed) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      areaCaptureDragRef.current = null;
      setCaptureDraftRect(null);
      onAreaCaptureResult?.(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [areaCaptureArmed, onAreaCaptureResult]);

  const isEditableTarget = (t: EventTarget | null) =>
    t instanceof HTMLInputElement ||
    t instanceof HTMLTextAreaElement ||
    (t instanceof HTMLElement && t.isContentEditable);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && state.textDraft) {
        e.preventDefault();
        setState(prev => ({ ...prev, textDraft: null }));
        return;
      }
      if (state.tool === 'polyline' && state.polylineDraft) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitPolylineDraft();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setState(prev => ({ ...prev, polylineDraft: null }));
          setPolyHover(null);
        }
      }
      if (state.tool === 'freehand' && state.freehandDraft) {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitFreehandDraft();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          setState(prev => ({ ...prev, freehandDraft: null }));
        }
      }

      if (isEditableTarget(e.target)) return;

      if (state.tool === 'marquee') {
        if (e.key === 'Escape') {
          if (state.selection || state.isSelecting) {
            e.preventDefault();
            setState(prev => ({ ...prev, selection: null, isSelecting: false }));
            return;
          }
        }
      }

      if (state.tool === 'select') {
        if (e.key === 'Escape') {
          if (state.selectedShapeIds.length > 0) {
            e.preventDefault();
            setState(prev => ({ ...prev, selectedShapeIds: [] }));
            return;
          }
          if (state.selectedRasterLayerId) {
            e.preventDefault();
            setState(prev => ({ ...prev, selectedRasterLayerId: null }));
            return;
          }
        }

        if (state.selectedShapeIds.length > 0) {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const before = cloneLayersDeep(state.layers);
            const removing = new Set(state.selectedShapeIds);
            setState(prev => ({
              ...prev,
              layers: prev.layers.map(layer => ({
                ...layer,
                shapes: layer.shapes.filter(sh => !removing.has(sh.id)),
              })),
              selectedShapeIds: [],
            }));
            onLayersMutation?.(before, state.activeLayerId, '도형 삭제');
            return;
          }
          const arrow =
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown';
          if (arrow) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            const before = cloneLayersDeep(state.layers);
            const movingIds = new Set(state.selectedShapeIds);
            setState(prev => ({
              ...prev,
              layers: prev.layers.map(layer => ({
                ...layer,
                shapes: layer.shapes.map(sh =>
                  movingIds.has(sh.id) ? translateShape(sh, dx, dy) : sh
                ),
              })),
            }));
            onLayersMutation?.(before, state.activeLayerId, '도형 이동');
            return;
          }
        } else if (state.selectedRasterLayerId) {
          if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            const rid = state.selectedRasterLayerId;
            const before = cloneLayersDeep(state.layers);
            setState(prev => ({
              ...prev,
              layers: prev.layers.map(l =>
                l.id === rid
                  ? { ...l, image: null, fileName: null, imageX: 0, imageY: 0 }
                  : l
              ),
              selectedRasterLayerId: null,
            }));
            onLayersMutation?.(before, state.activeLayerId, '이미지 삭제');
            return;
          }
          const arrow =
            e.key === 'ArrowLeft' ||
            e.key === 'ArrowRight' ||
            e.key === 'ArrowUp' ||
            e.key === 'ArrowDown';
          if (arrow) {
            e.preventDefault();
            const step = e.shiftKey ? 10 : 1;
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            const before = cloneLayersDeep(state.layers);
            const rid = state.selectedRasterLayerId;
            setState(prev => ({
              ...prev,
              layers: prev.layers.map(l =>
                l.id === rid
                  ? {
                      ...l,
                      imageX: Math.max(0, (l.imageX ?? 0) + dx),
                      imageY: Math.max(0, (l.imageY ?? 0) + dy),
                    }
                  : l
              ),
            }));
            onLayersMutation?.(before, state.activeLayerId, '이미지 이동');
            return;
          }
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    state.tool,
    state.polylineDraft,
    state.freehandDraft,
    state.textDraft,
    state.selectedShapeIds,
    state.selectedRasterLayerId,
    state.selection,
    state.isSelecting,
    state.layers,
    state.activeLayerId,
    commitPolylineDraft,
    commitFreehandDraft,
    setState,
    onLayersMutation,
  ]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { width: dw, height: dh } = getDocumentCanvasSize(state.layers);
    const sx = scrollPosRef.current.x;
    const sy = scrollPosRef.current.y;
    ctx.save();
    ctx.translate(state.position.x - sx, state.position.y - sy);
    ctx.scale(state.zoom, state.zoom);

    drawLayerStackToContext(ctx, state.layers, dw, dh);

    if (state.activeShape) {
        ctx.strokeStyle = state.activeShape.color;
        ctx.lineWidth = state.activeShape.lineWidth / state.zoom;
        ctx.beginPath();
        if (state.activeShape.type === 'line') {
          ctx.moveTo(state.activeShape.x1, state.activeShape.y1);
          ctx.lineTo(state.activeShape.x2, state.activeShape.y2);
        } else if (state.activeShape.type === 'rect') {
          ctx.strokeRect(state.activeShape.x1, state.activeShape.y1, state.activeShape.x2 - state.activeShape.x1, state.activeShape.y2 - state.activeShape.y1);
        } else if (state.activeShape.type === 'ellipse') {
          const rx = Math.abs(state.activeShape.x2 - state.activeShape.x1) / 2;
          const ry = Math.abs(state.activeShape.y2 - state.activeShape.y1) / 2;
          const cx = (state.activeShape.x1 + state.activeShape.x2) / 2;
          const cy = (state.activeShape.y1 + state.activeShape.y2) / 2;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        }
        ctx.stroke();
    }

    if (state.polylineDraft && state.polylineDraft.points.length > 0) {
        const pts = state.polylineDraft.points;
        ctx.strokeStyle = state.polylineDraft.color;
        ctx.lineWidth = state.polylineDraft.lineWidth / state.zoom;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        if (polyHover) {
          ctx.lineTo(polyHover.x, polyHover.y);
        }
        ctx.stroke();
    }

    if (state.freehandDraft && state.freehandDraft.points.length > 1) {
        const pts = state.freehandDraft.points;
        ctx.strokeStyle = state.freehandDraft.color;
        ctx.lineWidth = state.freehandDraft.lineWidth / state.zoom;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
    }

    if (state.tool === 'text' && state.textDraft) {
        const d = state.textDraft;
        ctx.save();
        if (d.text.trim()) {
          ctx.globalAlpha = 0.5;
          ctx.fillStyle = d.color;
          ctx.font = `${d.fontSize}px ${CANVAS_TEXT_FONT_STACK}`;
          ctx.textBaseline = 'alphabetic';
          ctx.fillText(d.text, d.x, d.y);
        } else {
          ctx.strokeStyle = d.color;
          ctx.lineWidth = Math.max(1, 1 / state.zoom);
          const m = 6 / state.zoom;
          ctx.beginPath();
          ctx.moveTo(d.x - m, d.y);
          ctx.lineTo(d.x + m, d.y);
          ctx.moveTo(d.x, d.y - m);
          ctx.lineTo(d.x, d.y + m);
          ctx.stroke();
        }
        ctx.restore();
    }

    if (state.selection) {
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2 / state.zoom;
      ctx.setLineDash([5 / state.zoom, 5 / state.zoom]);
      ctx.strokeRect(
        state.selection.x,
        state.selection.y,
        state.selection.width,
        state.selection.height
      );
      ctx.setLineDash([]);
    }

    if (captureDraftRect && (captureDraftRect.width > 0 || captureDraftRect.height > 0)) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2 / state.zoom;
      ctx.setLineDash([6 / state.zoom, 4 / state.zoom]);
      ctx.strokeRect(
        captureDraftRect.x,
        captureDraftRect.y,
        captureDraftRect.width,
        captureDraftRect.height
      );
      ctx.setLineDash([]);
    }

    if (state.tool === 'select' && state.selectedShapeIds.length > 0) {
      const selectedSet = new Set(state.selectedShapeIds);
      const isSingle = state.selectedShapeIds.length === 1;
      ctx.strokeStyle = '#22d3ee';
      ctx.lineWidth = 1.5 / state.zoom;
      ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
      state.layers.forEach(layer => {
        layer.shapes.forEach(sh => {
        if (!selectedSet.has(sh.id)) return;
        const hOff = ROTATION_HANDLE_OFFSET_PX / state.zoom;
        const h = getOrientedHandles(sh, hOff);
        if (!h) return;
        const [p0, p1, p2, p3] = h.cornersWorld;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.lineTo(p3.x, p3.y);
        ctx.closePath();
        ctx.stroke();
        });
      });
      ctx.setLineDash([]);

      if (isSingle) {
        const sh = findShapeInLayers(state.layers, state.selectedShapeIds[0]);
        if (sh) {
          const hOff = ROTATION_HANDLE_OFFSET_PX / state.zoom;
          const h = getOrientedHandles(sh, hOff);
          if (h) {
            const handleSize = HANDLE_DRAW_SIZE_PX / state.zoom;
            ctx.lineWidth = 1 / state.zoom;
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0891b2';
            const drawSquare = (p: Point) => {
              const s = handleSize;
              ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
              ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
            };
            h.corners.forEach(c => drawSquare(c.world));
            if (sh.type !== 'text') {
              h.edges.forEach(ed => drawSquare(ed.world));
            }
            const t = h.corners[0];
            const top = { x: (h.corners[0].world.x + h.corners[1].world.x) / 2, y: (h.corners[0].world.y + h.corners[1].world.y) / 2 };
            ctx.beginPath();
            ctx.moveTo(top.x, top.y);
            ctx.lineTo(h.rotationHandle.x, h.rotationHandle.y);
            ctx.stroke();
            const rr = (handleSize * 0.6);
            ctx.beginPath();
            ctx.arc(h.rotationHandle.x, h.rotationHandle.y, rr, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            void t;
          }
        }
      }
    }

    if (
      state.tool === 'select' &&
      state.selectedRasterLayerId &&
      state.selectedShapeIds.length === 0
    ) {
      const rl = state.layers.find(l => l.id === state.selectedRasterLayerId);
      if (rl?.image && !rl.locked) {
        const ix = rl.imageX ?? 0;
        const iy = rl.imageY ?? 0;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5 / state.zoom;
        ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
        ctx.strokeRect(ix, iy, rl.image.width, rl.image.height);
        ctx.setLineDash([]);
        const bs: Shape = {
          id: '__raster_bounds_draw__',
          type: 'rect',
          x1: ix,
          y1: iy,
          x2: ix + rl.image.width,
          y2: iy + rl.image.height,
          color: '#000000',
          lineWidth: 1,
        };
        const hOff = ROTATION_HANDLE_OFFSET_PX / state.zoom;
        const h = getOrientedHandles(bs, hOff);
        if (h) {
          const handleSize = HANDLE_DRAW_SIZE_PX / state.zoom;
          ctx.lineWidth = 1 / state.zoom;
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#0891b2';
          const drawSquare = (p: Point) => {
            const s = handleSize;
            ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
            ctx.strokeRect(p.x - s / 2, p.y - s / 2, s, s);
          };
          h.corners.forEach(c => drawSquare(c.world));
          h.edges.forEach(ed => drawSquare(ed.world));
          const top = {
            x: (h.corners[0].world.x + h.corners[1].world.x) / 2,
            y: (h.corners[0].world.y + h.corners[1].world.y) / 2,
          };
          ctx.beginPath();
          ctx.moveTo(top.x, top.y);
          ctx.lineTo(h.rotationHandle.x, h.rotationHandle.y);
          ctx.stroke();
          const rr = handleSize * 0.6;
          ctx.beginPath();
          ctx.arc(h.rotationHandle.x, h.rotationHandle.y, rr, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        }
      } else if (rl?.image && rl.locked) {
        const ix = rl.imageX ?? 0;
        const iy = rl.imageY ?? 0;
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 1.5 / state.zoom;
        ctx.setLineDash([4 / state.zoom, 3 / state.zoom]);
        ctx.strokeRect(ix, iy, rl.image.width, rl.image.height);
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }, [state, polyHover, captureDraftRect]);

  useLayoutEffect(() => {
    drawRef.current = draw;
  }, [draw]);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;

    const applySizeNow = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w <= 0 || h <= 0) return;
      setViewportSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
      canvas.width = w;
      canvas.height = h;
      const sx = el.scrollLeft;
      const sy = el.scrollTop;
      scrollPosRef.current = { x: sx, y: sy };
      drawRef.current();
    };
    const applySize = () => {
      if (resizeRafRef.current != null) return;
      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        applySizeNow();
      });
    };

    applySizeNow();
    const ro = new ResizeObserver(applySize);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (resizeRafRef.current != null) {
        cancelAnimationFrame(resizeRafRef.current);
        resizeRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onScroll = () => {
      const sx = el.scrollLeft;
      const sy = el.scrollTop;
      scrollPosRef.current = { x: sx, y: sy };
      drawRef.current();
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    el.scrollTo(0, 0);
    scrollPosRef.current = { x: 0, y: 0 };
    drawRef.current();
  }, [scrollResetKey]);

  useEffect(() => {
    draw();
  }, [draw]);

  const getMousePos = (e: React.MouseEvent | MouseEvent): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const toImageCoords = (p: Point): Point => {
    const sx = scrollPosRef.current.x;
    const sy = scrollPosRef.current.y;
    const ox = state.position.x - sx;
    const oy = state.position.y - sy;
    return {
      x: (p.x - ox) / state.zoom,
      y: (p.y - oy) / state.zoom,
    };
  };

  const handlePolylineClick = (e: React.MouseEvent) => {
    if (state.tool !== 'polyline' || !documentHasRaster(state.layers)) return;
    const al0 = getActiveLayer(state.layers, state.activeLayerId);
    if (al0?.locked) return;
    const imgPos = toImageCoords(getMousePos(e));
    setState(prev => {
      if (prev.tool !== 'polyline') return prev;
      if (!prev.polylineDraft) {
        return {
          ...prev,
          polylineDraft: {
            id: Math.random().toString(36).slice(2, 11),
            points: [imgPos],
            color: prev.color,
            lineWidth: prev.lineWidth,
          },
        };
      }
      return {
        ...prev,
        polylineDraft: {
          ...prev.polylineDraft,
          points: [...prev.polylineDraft.points, imgPos],
        },
      };
    });
  };

  const handleFreehandClick = (e: React.MouseEvent) => {
    if (state.tool !== 'freehand' || !documentHasRaster(state.layers)) return;
    const al0 = getActiveLayer(state.layers, state.activeLayerId);
    if (al0?.locked) return;
    const imgPos = toImageCoords(getMousePos(e));
    setState(prev => {
      if (prev.tool !== 'freehand') return prev;
      if (!prev.freehandDraft) {
        return {
          ...prev,
          freehandDraft: {
            id: Math.random().toString(36).slice(2, 11),
            points: [imgPos],
            color: prev.color,
            lineWidth: prev.lineWidth,
          },
        };
      }
      if (prev.freehandDraft.points.length < 2) {
        return { ...prev, freehandDraft: null };
      }
      const draft = prev.freehandDraft;
      const xs = draft.points.map(p => p.x);
      const ys = draft.points.map(p => p.y);
      const shape: Shape = {
        id: draft.id,
        type: 'polyline',
        x1: Math.min(...xs),
        y1: Math.min(...ys),
        x2: Math.max(...xs),
        y2: Math.max(...ys),
        points: draft.points.map(p => ({ x: p.x, y: p.y })),
        color: draft.color,
        lineWidth: draft.lineWidth,
      };
      const al = getActiveLayer(prev.layers, prev.activeLayerId);
      if (!al || al.locked) return { ...prev, freehandDraft: null };
      queueMicrotask(() => onShapeCommitted?.('자유그리기'));
      return {
        ...prev,
        layers: mapLayersReplaceActiveShapes(prev.layers, prev.activeLayerId, [...al.shapes, shape]),
        freehandDraft: null,
      };
    });
  };

  const handleFillClick = (e: React.MouseEvent) => {
    if (state.tool !== 'fill' || !documentHasRaster(state.layers)) return;
    const { width: dw, height: dh } = getDocumentCanvasSize(state.layers);
    const imgPos = toImageCoords(getMousePos(e));
    const ix = Math.floor(imgPos.x);
    const iy = Math.floor(imgPos.y);
    const fillHex = state.color;
    const shapes = flattenVisibleShapesInOrder(state.layers);

    if (ix < 0 || iy < 0 || ix >= dw || iy >= dh) return;

    onPrepareImageUndo?.();

    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    drawVisibleLayerRastersToContext(ctx, state.layers, dw, dh);
    /** 도형 외곽선을 비트맵에 합성한 뒤 채우기 */
    strokeShapesOnContext(ctx, shapes);

    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      console.warn('페인트통: 픽셀을 읽을 수 없습니다.', err);
      return;
    }

    const fill = hexToRgba(fillHex);
    floodFillImageData(imageData, ix, iy, fill, state.fillTolerance, {
      ignoreAlpha: state.fillIgnoreAlpha,
    });
    ctx.putImageData(imageData, 0, 0);

    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL();
    } catch {
      console.warn('페인트통: 결과 이미지를 만들 수 없습니다.');
      return;
    }

    const nextImg = new Image();
    nextImg.onload = () => {
      setState(prev => ({
        ...prev,
        layers: mapLayersFlattenRasterToActive(
          prev.layers,
          prev.activeLayerId,
          nextImg,
          getActiveLayer(prev.layers, prev.activeLayerId)?.fileName ?? null
        ),
        activeShape: null,
        selection: null,
        polylineDraft: null,
        freehandDraft: null,
        textDraft: null,
      }));
    };
    nextImg.onerror = () => {
      console.warn('페인트통: 결과 이미지를 불러오지 못했습니다.');
    };
    nextImg.src = dataUrl;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);

    if (areaCaptureArmed && e.button === 0 && !e.altKey && documentHasRaster(state.layers)) {
      const imgPos = toImageCoords(pos);
      areaCaptureDragRef.current = { start: imgPos };
      lastImgPosRef.current = imgPos;
      setCaptureDraftRect({ x: imgPos.x, y: imgPos.y, width: 0, height: 0 });
      return;
    }

    setDragStart(pos);

    if (e.button === 1 || (e.button === 0 && e.altKey && !(state.tool === 'select' && state.selectedShapeIds.length === 1))) {
      setState(prev => ({ ...prev, isPanning: true }));
    } else if (e.button === 0) {
      if (state.tool === 'select') {
        const imgPos = toImageCoords(pos);
        if (state.selectedShapeIds.length === 1) {
          const active = getActiveHandles();
          if (active?.handles) {
            const picked = hitTestHandle(
              active.handles,
              imgPos,
              HANDLE_HIT_TOL_PX / state.zoom,
              { includeEdges: active.shape.type !== 'text' },
            );
            if (picked) {
              if (picked.kind === 'rotation') {
                rotateStateRef.current = {
                  shapeId: active.shape.id,
                  startShape: cloneShape(active.shape),
                  startPointer: imgPos,
                  snapshotBefore: cloneLayersDeep(state.layers),
                  hasMoved: false,
                };
              } else {
                resizeStateRef.current = {
                  shapeId: active.shape.id,
                  handle: picked.id as ResizeHandleId,
                  startShape: cloneShape(active.shape),
                  snapshotBefore: cloneLayersDeep(state.layers),
                  hasMoved: false,
                };
              }
              setState(prev => ({ ...prev, isSelecting: false, selection: null }));
              return;
            }
          }
        }
        if (state.selectedRasterLayerId && state.selectedShapeIds.length === 0) {
          const lyr = state.layers.find(l => l.id === state.selectedRasterLayerId);
          if (lyr?.image && !lyr.locked) {
            const boundsShape = buildRasterBoundsShape(lyr);
            if (boundsShape) {
              const hOff = ROTATION_HANDLE_OFFSET_PX / state.zoom;
              const handles = getOrientedHandles(boundsShape, hOff);
              const picked = hitTestHandle(handles, imgPos, HANDLE_HIT_TOL_PX / state.zoom, {
                includeEdges: true,
                includeRotation: false,
              });
              if (picked && picked.kind !== 'rotation') {
                const c = document.createElement('canvas');
                c.width = Math.max(1, lyr.image.width);
                c.height = Math.max(1, lyr.image.height);
                const x = c.getContext('2d');
                if (x) {
                  x.drawImage(lyr.image, 0, 0);
                  let startImageDataUrl: string;
                  try {
                    startImageDataUrl = c.toDataURL();
                  } catch {
                    startImageDataUrl = '';
                  }
                  if (startImageDataUrl) {
                    rasterResizeStateRef.current = {
                      layerId: lyr.id,
                      handle: picked.id as ResizeHandleId,
                      startBoundsShape: cloneShape(boundsShape),
                      startImageDataUrl,
                      snapshotBefore: cloneLayersDeep(state.layers),
                      hasMoved: false,
                    };
                    setState(prev => ({ ...prev, isSelecting: false, selection: null }));
                    return;
                  }
                }
              }
              const rotPick = hitTestHandle(handles, imgPos, HANDLE_HIT_TOL_PX / state.zoom, {
                includeEdges: false,
                includeRotation: true,
              });
              if (rotPick?.kind === 'rotation') {
                const centerX = (lyr.imageX ?? 0) + lyr.image.width / 2;
                const centerY = (lyr.imageY ?? 0) + lyr.image.height / 2;
                const startAngle = Math.atan2(imgPos.y - centerY, imgPos.x - centerX);
                rasterRotateStateRef.current = {
                  layerId: lyr.id,
                  centerX,
                  centerY,
                  startAngle,
                  sourceImage: lyr.image,
                  srcW: lyr.image.width,
                  srcH: lyr.image.height,
                  snapshotBefore: cloneLayersDeep(state.layers),
                  hasMoved: false,
                };
                setState(prev => ({ ...prev, isSelecting: false, selection: null }));
                return;
              }
            }
          }
        }
        const tol = 6 / state.zoom;
        const target = pickTopInteractiveTarget(state.layers, imgPos, tol);
        if (target?.kind === 'shape') {
          const hit = target.shape;
          const layerIdForHit = target.layerId;
          const ids = state.selectedShapeIds.includes(hit.id) && state.selectedShapeIds.length > 0
            ? state.selectedShapeIds
            : [hit.id];
          const initialById = new Map<string, Shape>();
          state.layers.forEach(layer => {
            layer.shapes.forEach(sh => {
              if (ids.includes(sh.id)) initialById.set(sh.id, cloneShape(sh));
            });
          });
          moveStateRef.current = {
            startImagePoint: imgPos,
            shapeIds: ids,
            initialById,
            snapshotBefore: cloneLayersDeep(state.layers),
            hasMoved: false,
          };
          setState(prev => ({
            ...prev,
            activeLayerId: layerIdForHit ?? prev.activeLayerId,
            selectedShapeIds: ids,
            selectedRasterLayerId: null,
            selection: null,
            isSelecting: false,
          }));
        } else if (target?.kind === 'raster') {
          const lyr = state.layers.find(l => l.id === target.layerId);
          if (lyr?.image) {
            rasterMoveStateRef.current = {
              startImagePoint: imgPos,
              layerId: target.layerId,
              initialX: lyr.imageX ?? 0,
              initialY: lyr.imageY ?? 0,
              snapshotBefore: cloneLayersDeep(state.layers),
              hasMoved: false,
            };
            setState(prev => ({
              ...prev,
              activeLayerId: target.layerId,
              selectedRasterLayerId: target.layerId,
              selectedShapeIds: [],
              selection: null,
              isSelecting: false,
            }));
          }
        } else {
          setState(prev => ({
            ...prev,
            selectedShapeIds: [],
            selectedRasterLayerId: null,
            isSelecting: false,
            selection: null,
          }));
        }
      } else if (state.tool === 'marquee' && documentHasRaster(state.layers)) {
        setState(prev => ({
          ...prev,
          isSelecting: true,
          selection: null,
          selectedShapeIds: [],
          selectedRasterLayerId: null,
        }));
      } else if (state.tool === 'text' && documentHasRaster(state.layers)) {
        const al = getActiveLayer(state.layers, state.activeLayerId);
        if (al?.locked) return;
        const imgPos = toImageCoords(pos);
        setState(prev => ({
          ...prev,
          textDraft: {
            id: prev.textDraft?.id ?? Math.random().toString(36).slice(2, 11),
            x: imgPos.x,
            y: imgPos.y,
            text: prev.textDraft?.text ?? '',
            color: prev.color,
            fontSize: prev.textFontSize,
          },
        }));
      } else if (
        state.tool !== 'polyline' &&
        state.tool !== 'freehand' &&
        state.tool !== 'fill' &&
        state.tool !== 'text' &&
        state.tool !== 'select' &&
        state.tool !== 'marquee'
      ) {
        const al = getActiveLayer(state.layers, state.activeLayerId);
        if (al?.locked) return;
        const imgPos = toImageCoords(pos);
        setState(prev => ({
          ...prev,
          activeShape: {
            id: Math.random().toString(36).substr(2, 9),
            type: state.tool as 'line' | 'rect' | 'ellipse',
            x1: imgPos.x,
            y1: imgPos.y,
            x2: imgPos.x,
            y2: imgPos.y,
            color: state.color,
            lineWidth: state.lineWidth,
          },
        }));
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    const imgPos = toImageCoords(pos);
    lastImgPosRef.current = imgPos;

    if (areaCaptureDragRef.current && areaCaptureArmed) {
      const st = areaCaptureDragRef.current.start;
      setCaptureDraftRect({
        x: Math.min(st.x, imgPos.x),
        y: Math.min(st.y, imgPos.y),
        width: Math.abs(imgPos.x - st.x),
        height: Math.abs(imgPos.y - st.y),
      });
      return;
    }

    if (resizeStateRef.current) {
      const current = toImageCoords(pos);
      const st = resizeStateRef.current;
      const updated = applyResize(st.startShape, st.handle, current, {
        anchorAtCenter: e.altKey,
        uniform: e.shiftKey,
      });
      st.hasMoved = true;
      setState(prev => ({
        ...prev,
        layers: mapLayersUpdateShapeById(prev.layers, st.shapeId, updated),
      }));
      return;
    }

    if (rotateStateRef.current) {
      const current = toImageCoords(pos);
      const st = rotateStateRef.current;
      const updated = applyRotation(st.startShape, st.startPointer, current, e.shiftKey);
      st.hasMoved = true;
      setState(prev => ({
        ...prev,
        layers: mapLayersUpdateShapeById(prev.layers, st.shapeId, updated),
      }));
      return;
    }

    if (rasterRotateStateRef.current) {
      const st = rasterRotateStateRef.current;
      const current = toImageCoords(pos);
      let rotateRad =
        Math.atan2(current.y - st.centerY, current.x - st.centerX) - st.startAngle;
      if (e.shiftKey) {
        const step = Math.PI / 12;
        rotateRad = Math.round(rotateRad / step) * step;
      }
      st.hasMoved = true;
      const scaledW = st.srcW;
      const scaledH = st.srcH;
      const absCos = Math.abs(Math.cos(rotateRad));
      const absSin = Math.abs(Math.sin(rotateRad));
      const outW = Math.max(1, Math.ceil(scaledW * absCos + scaledH * absSin));
      const outH = Math.max(1, Math.ceil(scaledW * absSin + scaledH * absCos));
      const gen = ++rasterRotateGenRef.current;
      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.translate(outW / 2, outH / 2);
      ctx.rotate(rotateRad);
      try {
        ctx.drawImage(st.sourceImage, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      } catch {
        return;
      }
      let url: string;
      try {
        url = c.toDataURL();
      } catch {
        return;
      }
      const out = new Image();
      out.onload = () => {
        if (gen !== rasterRotateGenRef.current) return;
        setState(prev => ({
          ...prev,
          layers: prev.layers.map(l =>
            l.id === st.layerId
              ? {
                  ...l,
                  image: out,
                  imageX: st.centerX - outW / 2,
                  imageY: st.centerY - outH / 2,
                }
              : l
          ),
        }));
      };
      out.onerror = () => {};
      out.src = url;
      return;
    }

    if (rasterResizeStateRef.current) {
      const st = rasterResizeStateRef.current;
      const current = toImageCoords(pos);
      const updated = applyResize(st.startBoundsShape, st.handle, current, {
        anchorAtCenter: e.altKey,
        uniform: e.shiftKey,
      });
      st.hasMoved = true;
      const b = getShapeBounds(updated);
      if (!b || b.width < 1 || b.height < 1) return;
      const cw = Math.max(1, Math.round(b.width));
      const ch = Math.max(1, Math.round(b.height));
      const gen = ++rasterResizeGenRef.current;
      const srcImg = new Image();
      srcImg.onload = () => {
        if (gen !== rasterResizeGenRef.current) return;
        const oc = document.createElement('canvas');
        oc.width = cw;
        oc.height = ch;
        const octx = oc.getContext('2d');
        if (!octx) return;
        try {
          octx.drawImage(srcImg, 0, 0, cw, ch);
        } catch {
          return;
        }
        let url: string;
        try {
          url = oc.toDataURL();
        } catch {
          return;
        }
        const out = new Image();
        out.onload = () => {
          if (gen !== rasterResizeGenRef.current) return;
          setState(prev => ({
            ...prev,
            layers: prev.layers.map(l =>
              l.id === st.layerId ? { ...l, image: out, imageX: b.x, imageY: b.y } : l
            ),
          }));
        };
        out.onerror = () => {};
        out.src = url;
      };
      srcImg.onerror = () => {};
      srcImg.src = st.startImageDataUrl;
      return;
    }

    if (rasterMoveStateRef.current) {
      const st = rasterMoveStateRef.current;
      const current = toImageCoords(pos);
      const dx = current.x - st.startImagePoint.x;
      const dy = current.y - st.startImagePoint.y;
      if (dx !== 0 || dy !== 0) st.hasMoved = true;
      const nx = Math.max(0, st.initialX + dx);
      const ny = Math.max(0, st.initialY + dy);
      setState(prev => ({
        ...prev,
        layers: prev.layers.map(l =>
          l.id === st.layerId ? { ...l, imageX: nx, imageY: ny } : l
        ),
      }));
      return;
    }

    if (moveStateRef.current) {
      const { startImagePoint, initialById } = moveStateRef.current;
      const current = toImageCoords(pos);
      const dx = current.x - startImagePoint.x;
      const dy = current.y - startImagePoint.y;
      if (dx !== 0 || dy !== 0) moveStateRef.current.hasMoved = true;
      setState(prev => ({
        ...prev,
        layers: prev.layers.map(layer => ({
          ...layer,
          shapes: layer.shapes.map(sh => {
            const init = initialById.get(sh.id);
            return init ? translateShape(init, dx, dy) : sh;
          }),
        })),
      }));
      return;
    }

    if (
      state.tool === 'select' &&
      !state.isSelecting &&
      !state.isPanning &&
      documentHasRaster(state.layers)
    ) {
      const imgPos = toImageCoords(pos);
      let picked: PickedHandle | null = null;
      if (state.selectedShapeIds.length === 1) {
        const active = getActiveHandles();
        if (active?.handles) {
          picked = hitTestHandle(active.handles, imgPos, HANDLE_HIT_TOL_PX / state.zoom, {
            includeEdges: active.shape.type !== 'text',
          });
        }
      } else if (state.selectedRasterLayerId && state.selectedShapeIds.length === 0) {
        const lyr = state.layers.find(l => l.id === state.selectedRasterLayerId);
        if (lyr?.image && !lyr.locked) {
          const bs = buildRasterBoundsShape(lyr);
          if (bs) {
            const hOff = ROTATION_HANDLE_OFFSET_PX / state.zoom;
            const handles = getOrientedHandles(bs, hOff);
            picked = hitTestHandle(handles, imgPos, HANDLE_HIT_TOL_PX / state.zoom, {
              includeEdges: true,
              includeRotation: false,
            });
            if (!picked) {
              picked = hitTestHandle(handles, imgPos, HANDLE_HIT_TOL_PX / state.zoom, {
                includeEdges: false,
                includeRotation: true,
              });
            }
          }
        }
      }
      if (picked) {
        if (!hoverHandle || hoverHandle.id !== picked.id || hoverHandle.kind !== picked.kind) {
          setHoverHandle(picked);
        }
        if (hoveringShape) setHoveringShape(false);
      } else {
        if (hoverHandle) setHoverHandle(null);
        const tol = 6 / state.zoom;
        const t = pickTopInteractiveTarget(state.layers, imgPos, tol);
        const hoverMove = t != null;
        if (hoverMove !== hoveringShape) setHoveringShape(hoverMove);
      }
    } else {
      if (hoverHandle) setHoverHandle(null);
      if (hoveringShape) setHoveringShape(false);
    }

    if (state.polylineDraft) {
      setPolyHover(toImageCoords(pos));
    } else {
      setPolyHover(null);
    }

    if (state.tool === 'freehand' && state.freehandDraft) {
      const current = toImageCoords(pos);
      setState(prev => {
        if (!prev.freehandDraft || prev.tool !== 'freehand') return prev;
        const points = prev.freehandDraft.points;
        const last = points[points.length - 1];
        const dx = current.x - last.x;
        const dy = current.y - last.y;
        if (dx * dx + dy * dy < 1) return prev;
        return {
          ...prev,
          freehandDraft: {
            ...prev.freehandDraft,
            points: [...points, current],
          },
        };
      });
    }

    if (state.isPanning && dragStart) {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      setState(prev => ({
        ...prev,
        position: { x: prev.position.x + dx, y: prev.position.y + dy },
      }));
      setDragStart(pos);
    } else if (state.isSelecting && dragStart) {
      const start = toImageCoords(dragStart);
      const current = toImageCoords(pos);

      const rect: Rect = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      };

      setState(prev => ({ ...prev, selection: rect }));
    } else if (state.activeShape) {
      const current = toImageCoords(pos);
      setState(prev => ({
        ...prev,
        activeShape: prev.activeShape
          ? {
              ...prev.activeShape,
              x2: current.x,
              y2: current.y,
            }
          : null,
      }));
    }
  };

  const handleMouseUp = () => {
    if (areaCaptureDragRef.current && areaCaptureArmed) {
      const start = areaCaptureDragRef.current.start;
      areaCaptureDragRef.current = null;
      const cur = lastImgPosRef.current;
      setCaptureDraftRect(null);
      const rect: Rect = {
        x: Math.min(start.x, cur.x),
        y: Math.min(start.y, cur.y),
        width: Math.abs(cur.x - start.x),
        height: Math.abs(cur.y - start.y),
      };
      const valid = rect.width >= 2 && rect.height >= 2 ? rect : null;
      onAreaCaptureResult?.(valid);
      setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
      setDragStart(null);
      return;
    }

    if (resizeStateRef.current) {
      const { snapshotBefore, hasMoved } = resizeStateRef.current;
      resizeStateRef.current = null;
      if (hasMoved) onLayersMutation?.(snapshotBefore, state.activeLayerId, '도형 크기조절');
      setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
      setDragStart(null);
      return;
    }
    if (rotateStateRef.current) {
      const { snapshotBefore, hasMoved } = rotateStateRef.current;
      rotateStateRef.current = null;
      if (hasMoved) onLayersMutation?.(snapshotBefore, state.activeLayerId, '도형 회전');
      setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
      setDragStart(null);
      return;
    }
    if (rasterRotateStateRef.current) {
      const st = rasterRotateStateRef.current;
      rasterRotateStateRef.current = null;
      rasterRotateGenRef.current += 1;
      if (st.hasMoved) {
        onLayersMutation?.(st.snapshotBefore, st.layerId, '이미지 회전');
      }
      setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
      setDragStart(null);
      return;
    }
    if (rasterResizeStateRef.current) {
      const st = rasterResizeStateRef.current;
      rasterResizeStateRef.current = null;
      rasterResizeGenRef.current += 1;
      if (st.hasMoved) {
        onLayersMutation?.(st.snapshotBefore, st.layerId, '이미지 크기 조절');
      }
      setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
      setDragStart(null);
      return;
    }
    if (rasterMoveStateRef.current) {
      const st = rasterMoveStateRef.current;
      rasterMoveStateRef.current = null;
      if (st.hasMoved) {
        onLayersMutation?.(st.snapshotBefore, st.layerId, '이미지 이동');
      }
      setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
      setDragStart(null);
      return;
    }
    if (moveStateRef.current) {
      const { snapshotBefore, hasMoved } = moveStateRef.current;
      moveStateRef.current = null;
      if (hasMoved) {
        onLayersMutation?.(snapshotBefore, state.activeLayerId, '도형 이동');
      }
      setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
      setDragStart(null);
      return;
    }
    if (state.activeShape) {
      if (shapeEndGuardRef.current) {
        setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
        setDragStart(null);
        return;
      }
      shapeEndGuardRef.current = true;
      setState(prev => {
        const al = getActiveLayer(prev.layers, prev.activeLayerId);
        const targetLayer =
          al && !al.locked
            ? al
            : prev.layers.find(l => !l.locked) ?? null;
        if (!targetLayer) return { ...prev, activeShape: null };
        return {
          ...prev,
          activeLayerId: targetLayer.id,
          layers: mapLayersReplaceActiveShapes(prev.layers, targetLayer.id, [
            ...targetLayer.shapes,
            prev.activeShape!,
          ]),
          activeShape: null,
        };
      });
      onShapeCommitted?.(getShapeCommitLabel(state.tool));
      queueMicrotask(() => {
        shapeEndGuardRef.current = false;
      });
    }
    setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
    setDragStart(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    const zoomModifier = e.ctrlKey || e.metaKey;
    if (!zoomModifier) {
      return;
    }
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const newZoom = Math.max(0.01, Math.min(8, state.zoom + delta));

    const mousePos = getMousePos(e);
    const sx = scrollPosRef.current.x;
    const sy = scrollPosRef.current.y;
    const imagePosBefore = {
      x: (mousePos.x - state.position.x + sx) / state.zoom,
      y: (mousePos.y - state.position.y + sy) / state.zoom,
    };

    setState(prev => {
      const nextPos = {
        x: mousePos.x - imagePosBefore.x * newZoom + sx,
        y: mousePos.y - imagePosBefore.y * newZoom + sy,
      };
      return { ...prev, zoom: newZoom, position: nextPos };
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };

  const handleDragLeave = () => {
    setIsDraggingOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      onImageLoad(file);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (state.tool === 'polyline' && state.polylineDraft && state.polylineDraft.points.length >= 2) {
      commitPolylineDraft();
    }
    if (state.tool === 'freehand' && state.freehandDraft && state.freehandDraft.points.length >= 2) {
      commitFreehandDraft();
    }
  };

  const SCROLL_PAD = 64;
  const vw = viewportSize.w;
  const vh = viewportSize.h;
  const { width: docW, height: docH } = getDocumentCanvasSize(state.layers);
  const contentW =
    vw > 0
      ? Math.max(vw, Math.ceil(state.position.x + docW * state.zoom + SCROLL_PAD))
      : Math.max(vw, 1);
  const contentH =
    vh > 0
      ? Math.max(vh, Math.ceil(state.position.y + docH * state.zoom + SCROLL_PAD))
      : Math.max(vh, 1);

  return (
    <div
      ref={viewportRef}
      className={cn(
        'flex-1 min-h-0 bg-neutral-900 overflow-auto relative transition-colors touch-none',
        areaCaptureArmed
          ? 'cursor-crosshair'
          : state.tool === 'marquee'
            ? 'cursor-crosshair'
          : state.tool === 'fill'
          ? 'cursor-paint-bucket'
          : state.tool === 'text'
            ? 'cursor-text'
            : state.tool === 'select' &&
                (hoverHandle ||
                  resizeStateRef.current ||
                  rotateStateRef.current ||
                  rasterRotateStateRef.current ||
                  rasterResizeStateRef.current)
              ? null
              : state.tool === 'select' &&
                (hoveringShape || moveStateRef.current || rasterMoveStateRef.current)
                ? 'cursor-move'
                : state.tool === 'select'
                  ? 'cursor-default'
                  : 'cursor-crosshair',
        isDraggingOver && 'bg-blue-500/10'
      )}
      style={(() => {
        if (state.tool !== 'select') return undefined;
        if (rotateStateRef.current) return { cursor: 'grabbing' } as React.CSSProperties;
        if (rasterRotateStateRef.current) return { cursor: 'grabbing' } as React.CSSProperties;
        if (resizeStateRef.current) {
          const sh = findShapeInLayers(state.layers, resizeStateRef.current!.shapeId);
          return { cursor: cursorForHandle(resizeStateRef.current.handle, sh?.rotation ?? 0) } as React.CSSProperties;
        }
        if (rasterResizeStateRef.current) {
          return {
            cursor: cursorForHandle(rasterResizeStateRef.current.handle, 0),
          } as React.CSSProperties;
        }
        if (hoverHandle) {
          const sh =
            state.selectedShapeIds.length === 1
              ? findShapeInLayers(state.layers, state.selectedShapeIds[0])
              : null;
          const r = sh?.rotation ?? 0;
          if (hoverHandle.kind === 'rotation') return { cursor: 'grab' } as React.CSSProperties;
          return { cursor: cursorForHandle(hoverHandle.id as ResizeHandleId, r) } as React.CSSProperties;
        }
        return undefined;
      })()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={(e) => {
        handlePolylineClick(e);
        handleFreehandClick(e);
        handleFillClick(e);
      }}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={handleContextMenu}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0,
        });
        handleMouseDown(mouseEvent as any);
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY,
        });
        handleMouseMove(mouseEvent as any);
      }}
      onTouchEnd={() => {
        handleMouseUp();
      }}
    >
      {areaCaptureArmed && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 max-w-[min(36rem,calc(100%-2rem))] -translate-x-1/2 rounded-md border border-amber-600/40 bg-amber-950/95 px-3 py-1.5 text-center text-[11px] leading-snug text-amber-100 shadow-md">
          <span className="font-semibold text-amber-50">영역 드래그 캡처</span>
          <span className="text-amber-200/95"> · 문서 위에서 드래그 후 놓기 · Esc 취소 · 도구 다시 눌러 종료</span>
        </div>
      )}
      <div className="relative pointer-events-none" style={{ width: contentW, height: contentH }}>
        <div
          className="sticky top-0 left-0 z-10 pointer-events-auto"
          style={{
            width: vw > 0 ? vw : undefined,
            height: vh > 0 ? vh : undefined,
            minWidth: vw > 0 ? vw : '100%',
            minHeight: vh > 0 ? vh : '100%',
          }}
        >
          <canvas
            ref={canvasRef}
            className="block"
            style={{
              width: vw > 0 ? vw : '100%',
              height: vh > 0 ? vh : '100%',
            }}
          />
        </div>
      </div>
      {isDraggingOver && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-500/50 flex items-center justify-center pointer-events-none bg-blue-500/5">
          <p className="text-blue-400 font-medium">이미지를 놓아서 불러오기</p>
        </div>
      )}
    </div>
  );
};
