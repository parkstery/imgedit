import { useState, useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { CanvasEditor } from './components/CanvasEditor';
import { StatusBar } from './components/StatusBar';
import { TextDraftPanel } from './components/TextDraftPanel';
import { LayersPanel } from './components/LayersPanel';
import { SaveModal } from './components/SaveModal';
import { ResizeModal } from './components/ResizeModal';
import { CanvasSizeModal } from './components/CanvasSizeModal';
import { EditorState, Rect, Point, ImageUndoSnapshot, UndoEntry, Shape, EditorLayer } from './types';
import {
  bakeRasterLayerVisualToAxisAligned,
  cloneLayersDeep,
  createEditorLayer,
  documentHasRaster,
  drawLayerStackToContext,
  drawRasterImageOnContext,
  findShapeInLayers,
  getActiveLayer,
  getDocumentCanvasSize,
  mapLayersReplaceActiveLayerRaster,
  mapLayersReplaceActiveShapes,
  mapLayersUpdateShapeById,
  totalShapeCount,
} from './lib/layers';
import { getShapeRotationCenter } from './lib/drawShapes';
import {
  readFillTolerance,
  readFillIgnoreAlpha,
  writeFillTolerance,
  writeFillIgnoreAlpha,
} from './lib/fillToolStorage';
import {
  createCompositeCanvas,
  cropCanvasToRegion,
  writeCanvasToClipboardPng,
} from './lib/documentCapture';

const INITIAL_STATE_BASE: Omit<EditorState, 'layers' | 'activeLayerId'> = {
  zoom: 1,
  position: { x: 0, y: 0 },
  selection: null,
  isSelecting: false,
  isPanning: false,
  tool: 'select',
  color: '#ff0000',
  lineWidth: 2,
  textFontSize: 24,
  fillTolerance: 40,
  fillIgnoreAlpha: false,
  activeShape: null,
  selectedShapeIds: [],
  selectedRasterLayerId: null,
  polylineDraft: null,
  freehandDraft: null,
  textDraft: null,
};

function createFreshEditorState(): EditorState {
  const L = createEditorLayer('레이어 1');
  return { ...INITIAL_STATE_BASE, layers: [L], activeLayerId: L.id };
}

/** 흰색 빈 캔버스(1200×800)를 만들고 로드된 `HTMLImageElement`로 콜백을 호출합니다. */
function loadBlankStarterImage(onLoaded: (img: HTMLImageElement) => void): void {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 800;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const img = new Image();
  img.onload = () => onLoaded(img);
  img.src = canvas.toDataURL();
}

function cloneShapeDeep(shape: Shape): Shape {
  return {
    ...shape,
    points: shape.points ? shape.points.map(p => ({ x: p.x, y: p.y })) : undefined,
  };
}

function loadFillToolPrefsFromStorage(): Pick<EditorState, 'fillTolerance' | 'fillIgnoreAlpha'> {
  return {
    fillTolerance: readFillTolerance(INITIAL_STATE_BASE.fillTolerance),
    fillIgnoreAlpha: readFillIgnoreAlpha(INITIAL_STATE_BASE.fillIgnoreAlpha),
  };
}

function rotatePointAround(p: Point, center: Point, rad: number): Point {
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function scalePointAround(p: Point, center: Point, scale: number): Point {
  return {
    x: center.x + (p.x - center.x) * scale,
    y: center.y + (p.y - center.y) * scale,
  };
}

function remapShapePoints(shape: Shape, map: (p: Point) => Point): Shape {
  const p1 = map({ x: shape.x1, y: shape.y1 });
  const p2 = map({ x: shape.x2, y: shape.y2 });
  return {
    ...shape,
    x1: p1.x,
    y1: p1.y,
    x2: p2.x,
    y2: p2.y,
    points: shape.points?.map(map),
  };
}

function newId(): string {
  return Math.random().toString(36).slice(2, 11);
}

type InternalClipboardPayload =
  | { kind: 'shapes'; entries: { layerId: string; shape: Shape }[] }
  | { kind: 'raster'; image: HTMLImageElement; x: number; y: number; fileName: string | null }
  | { kind: 'selection'; rect: Rect };

async function cloneImageElement(src: HTMLImageElement): Promise<HTMLImageElement | null> {
  const c = document.createElement('canvas');
  c.width = Math.max(1, src.width);
  c.height = Math.max(1, src.height);
  const x = c.getContext('2d');
  if (!x) return null;
  x.drawImage(src, 0, 0);
  const dataUrl = c.toDataURL();
  return await new Promise(resolve => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

export default function App() {
  const [state, setState] = useState<EditorState>(() => ({
    ...createFreshEditorState(),
    ...loadFillToolPrefsFromStorage(),
  }));
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<ImageUndoSnapshot[]>([]);
  const redoStackRef = useRef<ImageUndoSnapshot[]>([]);
  /** Ctrl+Z용: 붙여넣기 직전 스냅샷만 (도형이 스택 위에 있어도 마지막 붙여넣기 취소 가능) */
  const pasteUndoRef = useRef<ImageUndoSnapshot[]>([]);
  const stateRef = useRef(state);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isResizeModalOpen, setIsResizeModalOpen] = useState(false);
  const [isCanvasSizeModalOpen, setIsCanvasSizeModalOpen] = useState(false);
  /** 캔버스 영역 스크롤을 초기화할 때 증가 (맞춤 등) */
  const [canvasScrollResetKey, setCanvasScrollResetKey] = useState(0);
  /** 툴바「영역 캡처」: 캔버스에서 드래그로 문서 좌표 영역 지정 */
  const [areaCaptureArmed, setAreaCaptureArmed] = useState(false);
  const internalClipboardRef = useRef<InternalClipboardPayload | null>(null);

  // Initialize with a blank white canvas (1번 레이어에 래스터 귀속)
  useEffect(() => {
    loadBlankStarterImage(img => {
      setState(prev => {
        const base = createFreshEditorState();
        const L0 = base.layers[0];
        return {
          ...base,
          ...loadFillToolPrefsFromStorage(),
          fillTolerance: prev.fillTolerance,
          fillIgnoreAlpha: prev.fillIgnoreAlpha,
          textFontSize: prev.textFontSize,
          layers: [{ ...L0, image: img, fileName: 'new-image.png' }],
          position: { x: 50, y: 50 },
          zoom: 0.8,
        };
      });
    });
  }, []);

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useLayoutEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  useLayoutEffect(() => {
    redoStackRef.current = redoStack;
  }, [redoStack]);

  const clearRedoStack = useCallback(() => {
    redoStackRef.current = [];
    setRedoStack([]);
  }, []);

  const appendUndoEntry = useCallback((entry: UndoEntry) => {
    const next = [...undoStackRef.current, entry];
    undoStackRef.current = next;
    setUndoStack(next);
    clearRedoStack();
  }, [clearRedoStack]);

  const pushPasteUndoSnapshot = useCallback((snapshot: ImageUndoSnapshot) => {
    pasteUndoRef.current = [...pasteUndoRef.current, snapshot];
  }, []);

  const applyImageSnapshot = useCallback((snap: ImageUndoSnapshot) => {
    setState(prev => ({
      ...prev,
      layers: cloneLayersDeep(snap.layers),
      activeLayerId: snap.activeLayerId,
      selection: snap.selection ? { ...snap.selection } : null,
      zoom: snap.zoom,
      position: { ...snap.position },
      selectedRasterLayerId: null,
    }));
  }, []);

  const buildStateSnapshot = useCallback((source: EditorState): ImageUndoSnapshot | null => {
    if (!documentHasRaster(source.layers)) return null;
    return {
      layers: cloneLayersDeep(source.layers),
      activeLayerId: source.activeLayerId,
      selection: source.selection ? { ...source.selection } : null,
      zoom: source.zoom,
      position: { ...source.position },
    };
  }, []);

  const handlePrepareImageUndoForPaint = useCallback(() => {
    const snap = buildStateSnapshot(stateRef.current);
    if (snap) appendUndoEntry({ type: 'image', snapshot: snap, label: '페인트통 채우기' });
  }, [buildStateSnapshot, appendUndoEntry]);

  const handleLayersMutation = useCallback((beforeLayers: EditorLayer[], beforeActiveLayerId: string, label?: string) => {
    appendUndoEntry({
      type: 'layersSnapshot',
      beforeLayers: cloneLayersDeep(beforeLayers),
      beforeActiveLayerId,
      label,
    });
  }, [appendUndoEntry]);

  const handleImageLoad = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        undoStackRef.current = [];
        pasteUndoRef.current = [];
        redoStackRef.current = [];
        setUndoStack([]);
        setRedoStack([]);
        setState(prev => ({
          ...prev,
          layers: prev.layers.map(l =>
            l.id === prev.activeLayerId
              ? { ...l, image: img, fileName: file.name, shapes: [], imageX: 0, imageY: 0 }
              : l
          ),
          selection: null,
          selectedShapeIds: [],
          selectedRasterLayerId: null,
          position: { x: 50, y: 50 },
          zoom: 0.8,
        }));
      };
      img.src = e.target?.result as string;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleOpen = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleImageLoad(file);
    };
    input.click();
  };

  const handleNewCanvas = useCallback(() => {
    if (
      !window.confirm(
        '새 캔버스를 펼칩니다. (Yes / No)\n\n현재 작업을 모두 폐기하고 새로 시작합니다. 계속하려면 확인(Yes)을 누르세요.'
      )
    ) {
      return;
    }
    undoStackRef.current = [];
    pasteUndoRef.current = [];
    redoStackRef.current = [];
    setUndoStack([]);
    setRedoStack([]);
    setCanvasScrollResetKey(k => k + 1);
    loadBlankStarterImage(img => {
      setState(prev => {
        const base = createFreshEditorState();
        const L0 = base.layers[0];
        return {
          ...base,
          fillTolerance: prev.fillTolerance,
          fillIgnoreAlpha: prev.fillIgnoreAlpha,
          textFontSize: prev.textFontSize,
          layers: [{ ...L0, image: img, fileName: 'new-image.png' }],
          position: { x: 50, y: 50 },
          zoom: 0.8,
        };
      });
    });
  }, []);

  const handleSave = (filename?: string, format: string = 'image/png', quality: number = 0.92) => {
    if (!documentHasRaster(state.layers)) return;
    const { width: dw, height: dh } = getDocumentCanvasSize(state.layers);
    const canvas = document.createElement('canvas');
    canvas.width = dw;
    canvas.height = dh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // For JPEG, we should fill background with white if there are transparent areas
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    drawLayerStackToContext(ctx, state.layers, dw, dh);

    const extension = format.split('/')[1];
    const activeFn = getActiveLayer(state.layers, state.activeLayerId)?.fileName;
    const finalFilename =
      filename || `edited-${(activeFn?.split('.')[0] ?? 'image')}.${extension}`;
    
    const link = document.createElement('a');
    link.download = finalFilename;
    link.href = canvas.toDataURL(format, quality);
    link.click();
    setIsSaveModalOpen(false);
  };

  const handleZoomIn = () => setState(prev => ({ ...prev, zoom: Math.min(8, prev.zoom + 0.1) }));
  const handleZoomOut = () => setState(prev => ({ ...prev, zoom: Math.max(0.01, prev.zoom - 0.1) }));
  const handleResetZoom = () => {
    setCanvasScrollResetKey(k => k + 1);
    setState(prev => ({ ...prev, zoom: 1, position: { x: 50, y: 50 } }));
  };
  const handleZoomChange = (value: number) => setState(prev => ({ ...prev, zoom: Math.max(0.01, Math.min(8, value)) }));

  const handleToolChange = (tool: EditorState['tool']) =>
    setState(prev => {
      const { width: tw, height: th } = getDocumentCanvasSize(prev.layers);
      const textDraft =
        tool === 'text' && documentHasRaster(prev.layers)
          ? {
              id: Math.random().toString(36).slice(2, 11),
              x: tw / 2,
              y: th / 2,
              text: '',
              color: prev.color,
              fontSize: prev.textFontSize,
            }
          : null;
      const keepPick =
        tool === 'select' || tool === 'marquee';
      return {
        ...prev,
        tool,
        selection: keepPick ? prev.selection : null,
        isSelecting: false,
        selectedShapeIds: keepPick ? prev.selectedShapeIds : [],
        selectedRasterLayerId: keepPick ? prev.selectedRasterLayerId : null,
        polylineDraft: null,
        freehandDraft: null,
        textDraft,
      };
    });
  const handleColorChange = (color: string) => setState(prev => ({ ...prev, color }));
  const handleLineWidthChange = (lineWidth: number) => setState(prev => ({ ...prev, lineWidth }));
  const handleTextFontSizeChange = (textFontSize: number) => {
    const next = Math.max(8, Math.min(256, Math.round(textFontSize)));
    setState(prev => ({
      ...prev,
      textFontSize: next,
      textDraft: prev.textDraft ? { ...prev.textDraft, fontSize: next } : null,
    }));
  };
  const handleFillToleranceChange = (fillTolerance: number) => {
    const next = Math.max(0, Math.min(100, Math.round(fillTolerance)));
    writeFillTolerance(next);
    setState(prev => ({ ...prev, fillTolerance: next }));
  };
  const handleFillIgnoreAlphaChange = (fillIgnoreAlpha: boolean) => {
    writeFillIgnoreAlpha(fillIgnoreAlpha);
    setState(prev => ({ ...prev, fillIgnoreAlpha }));
  };

  const transformSelectedRaster = useCallback((opts: { scale?: number; rotateDeg?: number }) => {
    const s = stateRef.current;
    if (!s.selectedRasterLayerId) return;
    const layer = s.layers.find(l => l.id === s.selectedRasterLayerId);
    if (!layer?.image) return;

    const hasScale = opts.scale != null;
    const rotateDeg = opts.rotateDeg ?? 0;
    const rotateRad = (rotateDeg * Math.PI) / 180;
    const hasRotate = opts.rotateDeg != null && rotateRad !== 0;

    if (!hasScale && !hasRotate) return;

    if (!hasScale && hasRotate) {
      const before = cloneLayersDeep(s.layers);
      setState(prev => ({
        ...prev,
        layers: prev.layers.map(l =>
          l.id === layer.id ? { ...l, imageRotation: (l.imageRotation ?? 0) + rotateRad } : l
        ),
      }));
      handleLayersMutation(before, s.activeLayerId, '이미지 회전');
      return;
    }

    const scale = Math.max(0.1, opts.scale ?? 1);
    const snapshotBefore = cloneLayersDeep(s.layers);

    const applyPixelRasterTransform = (L: EditorLayer) => {
      if (!L.image) return;
      const srcW = L.image.width;
      const srcH = L.image.height;
      if (srcW <= 0 || srcH <= 0) return;

      const scaledW = Math.max(1, Math.round(srcW * scale));
      const scaledH = Math.max(1, Math.round(srcH * scale));
      const absCos = Math.abs(Math.cos(rotateRad));
      const absSin = Math.abs(Math.sin(rotateRad));
      const outW = Math.max(1, Math.ceil(scaledW * absCos + scaledH * absSin));
      const outH = Math.max(1, Math.ceil(scaledW * absSin + scaledH * absCos));

      const c = document.createElement('canvas');
      c.width = outW;
      c.height = outH;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      ctx.translate(outW / 2, outH / 2);
      if (rotateRad) ctx.rotate(rotateRad);
      ctx.drawImage(L.image, -scaledW / 2, -scaledH / 2, scaledW, scaledH);

      let dataUrl: string;
      try {
        dataUrl = c.toDataURL();
      } catch {
        return;
      }
      const centerX = (L.imageX ?? 0) + srcW / 2;
      const centerY = (L.imageY ?? 0) + srcH / 2;

      const next = new Image();
      next.onload = () => {
        setState(prev => ({
          ...prev,
          layers: prev.layers.map(l =>
            l.id === L.id
              ? {
                  ...l,
                  image: next,
                  imageX: centerX - outW / 2,
                  imageY: centerY - outH / 2,
                  imageRotation: undefined,
                }
              : l
          ),
        }));
        handleLayersMutation(snapshotBefore, s.activeLayerId, '이미지 변형');
      };
      next.src = dataUrl;
    };

    const baseRot = layer.imageRotation ?? 0;
    if (baseRot !== 0) {
      void bakeRasterLayerVisualToAxisAligned(layer).then(baked => {
        if (!baked) return;
        const merged: EditorLayer = {
          ...layer,
          image: baked.image,
          imageX: baked.imageX,
          imageY: baked.imageY,
          imageRotation: undefined,
        };
        applyPixelRasterTransform(merged);
      });
      return;
    }

    applyPixelRasterTransform(layer);
  }, [handleLayersMutation]);

  const transformSelectedShapes = useCallback((opts: { scale?: number; rotateDeg?: number }) => {
    const s = stateRef.current;
    if (s.selectedShapeIds.length === 0) return;
    const selectedIds = new Set(s.selectedShapeIds);
    const selected: Shape[] = [];
    s.layers.forEach(layer => {
      layer.shapes.forEach(sh => {
        if (selectedIds.has(sh.id)) selected.push(sh);
      });
    });
    if (selected.length === 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    selected.forEach(sh => {
      const c = getShapeRotationCenter(sh);
      minX = Math.min(minX, c.x);
      minY = Math.min(minY, c.y);
      maxX = Math.max(maxX, c.x);
      maxY = Math.max(maxY, c.y);
    });
    const groupCenter: Point = { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

    const rotateRad = ((opts.rotateDeg ?? 0) * Math.PI) / 180;
    const scale = Math.max(0.1, opts.scale ?? 1);
    const before = cloneLayersDeep(s.layers);
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(layer => ({
        ...layer,
        shapes: layer.shapes.map(sh => {
          if (!selectedIds.has(sh.id)) return sh;
          let next = cloneShapeDeep(sh);
          if (opts.scale != null) {
            const ownCenter = getShapeRotationCenter(next);
            next = remapShapePoints(next, p => scalePointAround(p, ownCenter, scale));
            next.lineWidth = Math.max(1, next.lineWidth * scale);
            if (next.type === 'text' && next.fontSize != null) {
              next.fontSize = Math.max(4, next.fontSize * scale);
            }
          }
          if (opts.rotateDeg != null && rotateRad !== 0) {
            const ownCenter = getShapeRotationCenter(next);
            const movedCenter = rotatePointAround(ownCenter, groupCenter, rotateRad);
            const dx = movedCenter.x - ownCenter.x;
            const dy = movedCenter.y - ownCenter.y;
            next = remapShapePoints(next, p => ({ x: p.x + dx, y: p.y + dy }));
            next.rotation = (next.rotation ?? 0) + rotateRad;
          }
          return next;
        }),
      })),
    }));
    handleLayersMutation(before, s.activeLayerId, '개체 변형');
  }, [handleLayersMutation]);

  const handleTransformScaleUp = useCallback(() => {
    const s = stateRef.current;
    if (s.selectedRasterLayerId) {
      transformSelectedRaster({ scale: 1.1 });
      return;
    }
    if (s.selectedShapeIds.length > 0) {
      transformSelectedShapes({ scale: 1.1 });
    }
  }, [transformSelectedRaster, transformSelectedShapes]);

  const handleTransformScaleDown = useCallback(() => {
    const s = stateRef.current;
    if (s.selectedRasterLayerId) {
      transformSelectedRaster({ scale: 0.9 });
      return;
    }
    if (s.selectedShapeIds.length > 0) {
      transformSelectedShapes({ scale: 0.9 });
    }
  }, [transformSelectedRaster, transformSelectedShapes]);

  const handleTransformRotateLeft = useCallback(() => {
    const s = stateRef.current;
    if (s.selectedRasterLayerId) {
      transformSelectedRaster({ rotateDeg: -15 });
      return;
    }
    if (s.selectedShapeIds.length > 0) {
      transformSelectedShapes({ rotateDeg: -15 });
    }
  }, [transformSelectedRaster, transformSelectedShapes]);

  const handleTransformRotateRight = useCallback(() => {
    const s = stateRef.current;
    if (s.selectedRasterLayerId) {
      transformSelectedRaster({ rotateDeg: 15 });
      return;
    }
    if (s.selectedShapeIds.length > 0) {
      transformSelectedShapes({ rotateDeg: 15 });
    }
  }, [transformSelectedRaster, transformSelectedShapes]);

  const handleSelectionRotationDegCommit = useCallback(
    (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      const s = stateRef.current;
      if (s.selectedRasterLayerId) {
        const before = cloneLayersDeep(s.layers);
        setState(prev => ({
          ...prev,
          layers: prev.layers.map(l =>
            l.id === s.selectedRasterLayerId ? { ...l, imageRotation: rad } : l
          ),
        }));
        handleLayersMutation(before, s.activeLayerId, '이미지 회전');
        return;
      }
      if (s.selectedShapeIds.length === 1) {
        const sid = s.selectedShapeIds[0];
        const target = findShapeInLayers(s.layers, sid);
        if (!target) return;
        const before = cloneLayersDeep(s.layers);
        setState(prev => ({
          ...prev,
          layers: mapLayersUpdateShapeById(prev.layers, sid, { ...target, rotation: rad }),
        }));
        handleLayersMutation(before, s.activeLayerId, '도형 회전');
      }
    },
    [handleLayersMutation],
  );

  const selectionRotationDeg = useMemo(() => {
    if (state.selectedRasterLayerId) {
      const lyr = state.layers.find(l => l.id === state.selectedRasterLayerId);
      if (!lyr?.image) return null;
      return ((lyr.imageRotation ?? 0) * 180) / Math.PI;
    }
    if (state.selectedShapeIds.length === 1) {
      const sh = findShapeInLayers(state.layers, state.selectedShapeIds[0]);
      if (!sh) return null;
      return ((sh.rotation ?? 0) * 180) / Math.PI;
    }
    return null;
  }, [state.selectedRasterLayerId, state.selectedShapeIds, state.layers]);

  const handleDeleteLastShape = useCallback(() => {
    const undoPoint = buildStateSnapshot(stateRef.current);
    const prevStack = undoStackRef.current;
    if (prevStack.length === 0) {
      setState(s => {
        const al = getActiveLayer(s.layers, s.activeLayerId);
        if (!al || al.shapes.length === 0) return s;
        return {
          ...s,
          layers: mapLayersReplaceActiveShapes(s.layers, s.activeLayerId, al.shapes.slice(0, -1)),
          selectedShapeIds: [],
          selectedRasterLayerId: null,
        };
      });
      if (undoPoint && totalShapeCount(stateRef.current.layers) > 0) {
        const nextRedo = [...redoStackRef.current, undoPoint];
        redoStackRef.current = nextRedo;
        setRedoStack(nextRedo);
      }
      return;
    }
    const last = prevStack[prevStack.length - 1];
    const nextStack = prevStack.slice(0, -1);
    undoStackRef.current = nextStack;
    setUndoStack(nextStack);
    if (last.type === 'shape') {
      setState(s => ({
        ...s,
        layers: s.layers.map(l =>
          l.id !== last.layerId ? l : { ...l, shapes: l.shapes.slice(0, -1) }
        ),
        selectedShapeIds: [],
        selectedRasterLayerId: null,
      }));
    } else if (last.type === 'image' || last.type === 'imageMerge') {
      if (pasteUndoRef.current.length > 0) {
        pasteUndoRef.current = pasteUndoRef.current.slice(0, -1);
      }
      applyImageSnapshot(last.snapshot);
    } else if (last.type === 'layersSnapshot') {
      setState(s => ({
        ...s,
        layers: cloneLayersDeep(last.beforeLayers),
        activeLayerId: last.beforeActiveLayerId,
        selectedShapeIds: [],
        selectedRasterLayerId: null,
      }));
    }
    if (undoPoint) {
      const nextRedo = [...redoStackRef.current, undoPoint];
      redoStackRef.current = nextRedo;
      setRedoStack(nextRedo);
    }
  }, [applyImageSnapshot, buildStateSnapshot]);

  const handleRedoLastShape = useCallback(() => {
    const prevRedo = redoStackRef.current;
    if (prevRedo.length === 0) return;
    const redoSnap = prevRedo[prevRedo.length - 1];
    const nextRedo = prevRedo.slice(0, -1);
    redoStackRef.current = nextRedo;
    setRedoStack(nextRedo);

    const undoPoint = buildStateSnapshot(stateRef.current);
    if (undoPoint) {
      const nextUndo = [...undoStackRef.current, { type: 'image', snapshot: undoPoint } as UndoEntry];
      undoStackRef.current = nextUndo;
      setUndoStack(nextUndo);
    }
    applyImageSnapshot(redoSnap);
  }, [applyImageSnapshot, buildStateSnapshot]);

  const handleClearShapes = () => {
    const next = undoStackRef.current.filter(e => e.type !== 'shape');
    undoStackRef.current = next;
    setUndoStack(next);
    clearRedoStack();
    setState(prev => ({
      ...prev,
      layers: prev.layers.map(l => ({ ...l, shapes: [] })),
      selectedShapeIds: [],
      selectedRasterLayerId: null,
    }));
  };

  const handleResize = (newWidth: number, newHeight: number) => {
    if (!documentHasRaster(state.layers)) return;

    const rescaleLayerImage = async (layer: EditorLayer): Promise<EditorLayer> => {
      if (!layer.image) return layer;
      const baked = await bakeRasterLayerVisualToAxisAligned(layer);
      const L = baked
        ? { ...layer, image: baked.image, imageX: baked.imageX, imageY: baked.imageY, imageRotation: undefined }
        : layer;
      const c = document.createElement('canvas');
      c.width = newWidth;
      c.height = newHeight;
      const x = c.getContext('2d');
      if (!x) return L;
      x.drawImage(L.image!, 0, 0, newWidth, newHeight);
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => resolve({ ...L, image: img, imageX: 0, imageY: 0, imageRotation: undefined });
        img.onerror = () => resolve(L);
        img.src = c.toDataURL();
      });
    };

    Promise.all(state.layers.map(rescaleLayerImage)).then(nextLayers => {
      setState(prev => ({
        ...prev,
        layers: nextLayers,
        selection: null,
        selectedRasterLayerId: null,
      }));
      setIsResizeModalOpen(false);
    });
  };

  const handleCanvasSize = (newWidth: number, newHeight: number) => {
    if (!documentHasRaster(state.layers)) return;
    const { width: currentWidth, height: currentHeight } = getDocumentCanvasSize(state.layers);

    const scaleX = newWidth / currentWidth;
    const scaleY = newHeight / currentHeight;

    const scaleShape = (shape: Shape): Shape => {
      if (shape.type === 'text' && shape.text != null && shape.fontSize != null) {
        return {
          ...shape,
          x1: shape.x1 * scaleX,
          y1: shape.y1 * scaleY,
          x2: shape.x1 * scaleX,
          y2: shape.y1 * scaleY,
          fontSize: shape.fontSize * Math.sqrt(scaleX * scaleY),
          lineWidth: 0,
        };
      }
      const base = {
        ...shape,
        x1: shape.x1 * scaleX,
        y1: shape.y1 * scaleY,
        x2: shape.x2 * scaleX,
        y2: shape.y2 * scaleY,
        lineWidth: shape.lineWidth * Math.sqrt(scaleX * scaleY),
      };
      if (shape.type === 'polyline' && shape.points) {
        return {
          ...base,
          points: shape.points.map((p: Point) => ({ x: p.x * scaleX, y: p.y * scaleY })),
        };
      }
      return base;
    };

    const rescaleLayerImage = async (layer: EditorLayer): Promise<EditorLayer> => {
      if (!layer.image) {
        return {
          ...layer,
          shapes: layer.shapes.map(scaleShape),
          imageX: Math.round((layer.imageX ?? 0) * scaleX),
          imageY: Math.round((layer.imageY ?? 0) * scaleY),
        };
      }
      const baked = await bakeRasterLayerVisualToAxisAligned(layer);
      const L = baked
        ? { ...layer, image: baked.image, imageX: baked.imageX, imageY: baked.imageY, imageRotation: undefined }
        : layer;
      const c = document.createElement('canvas');
      c.width = newWidth;
      c.height = newHeight;
      const x = c.getContext('2d');
      if (!x) return L;
      x.drawImage(L.image!, 0, 0, newWidth, newHeight);
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () =>
          resolve({
            ...L,
            image: img,
            shapes: L.shapes.map(scaleShape),
            imageX: Math.round((L.imageX ?? 0) * scaleX),
            imageY: Math.round((L.imageY ?? 0) * scaleY),
            imageRotation: undefined,
          });
        img.onerror = () =>
          resolve({
            ...L,
            shapes: L.shapes.map(scaleShape),
            imageX: Math.round((L.imageX ?? 0) * scaleX),
            imageY: Math.round((L.imageY ?? 0) * scaleY),
          });
        img.src = c.toDataURL();
      });
    };

    Promise.all(state.layers.map(rescaleLayerImage)).then(nextLayers => {
      setState(prev => ({
        ...prev,
        layers: nextLayers,
        selection: null,
        selectedRasterLayerId: null,
      }));
      setIsCanvasSizeModalOpen(false);
    });
  };

  const getSelectionCanvas = useCallback((rect: Rect): HTMLCanvasElement | null => {
    const full = createCompositeCanvas(state.layers);
    if (!full) return null;
    return cropCanvasToRegion(full, rect);
  }, [state.layers]);

  const copyCanvasToSystemClipboard = useCallback(async (canvas: HTMLCanvasElement) => {
    return new Promise<void>((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (!blob) {
          reject(new Error('Canvas to blob failed'));
          return;
        }
        try {
          const item = new ClipboardItem({ [blob.type]: blob });
          await navigator.clipboard.write([item]);
          resolve();
        } catch (err) {
          reject(err);
        }
      }, 'image/png');
    });
  }, []);

  const handleCopy = useCallback(async () => {
    if (!documentHasRaster(state.layers)) return;

    if (state.selectedShapeIds.length > 0) {
      const idSet = new Set(state.selectedShapeIds);
      const entries: { layerId: string; shape: Shape }[] = [];
      state.layers.forEach(layer => {
        const picked = layer.shapes.filter(sh => idSet.has(sh.id)).map(cloneShapeDeep);
        if (picked.length > 0) {
          picked.forEach(shape => entries.push({ layerId: layer.id, shape }));
        }
      });
      if (entries.length > 0) {
        internalClipboardRef.current = { kind: 'shapes', entries };
      }
      return;
    }

    if (state.selectedRasterLayerId) {
      const layer = state.layers.find(l => l.id === state.selectedRasterLayerId);
      if (!layer?.image) return;
      const baked = await bakeRasterLayerVisualToAxisAligned(layer);
      const src = baked ? baked.image : layer.image;
      const cloned = await cloneImageElement(src);
      if (!cloned) return;
      internalClipboardRef.current = {
        kind: 'raster',
        image: cloned,
        x: baked ? baked.imageX : layer.imageX ?? 0,
        y: baked ? baked.imageY : layer.imageY ?? 0,
        fileName: layer.fileName,
      };
      const c = document.createElement('canvas');
      c.width = cloned.width;
      c.height = cloned.height;
      const x = c.getContext('2d');
      if (x) {
        x.drawImage(cloned, 0, 0);
        try {
          await copyCanvasToSystemClipboard(c);
        } catch {
          // 내부 클립보드만으로도 붙여넣기는 동작.
        }
      }
      return;
    }

    if (!state.selection) return;
    const canvas = getSelectionCanvas(state.selection);
    if (!canvas) return;
    internalClipboardRef.current = { kind: 'selection', rect: { ...state.selection } };
    try {
      await copyCanvasToSystemClipboard(canvas);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [state, getSelectionCanvas, copyCanvasToSystemClipboard]);

  const handleCaptureSelection = useCallback(async () => {
    const sel = state.selection;
    if (!sel || sel.width < 2 || sel.height < 2 || !documentHasRaster(state.layers)) return;
    const canvas = getSelectionCanvas(sel);
    if (!canvas) return;
    try {
      await writeCanvasToClipboardPng(canvas);
    } catch (err) {
      console.error('선택 영역 캡처 실패:', err);
    }
  }, [state.selection, state.layers, getSelectionCanvas]);

  const handleCaptureFullDocument = useCallback(async () => {
    if (!documentHasRaster(state.layers)) return;
    const full = createCompositeCanvas(state.layers);
    if (!full) return;
    try {
      await writeCanvasToClipboardPng(full);
    } catch (err) {
      console.error('전체 문서 캡처 실패:', err);
    }
  }, [state.layers]);

  const handleAreaCaptureResult = useCallback(
    async (rect: Rect | null) => {
      setAreaCaptureArmed(false);
      if (!rect || rect.width < 2 || rect.height < 2 || !documentHasRaster(state.layers)) {
        return;
      }
      const full = createCompositeCanvas(state.layers);
      if (!full) return;
      const cropped = cropCanvasToRegion(full, rect);
      if (!cropped) return;
      try {
        await writeCanvasToClipboardPng(cropped);
      } catch (err) {
        console.error('영역 캡처 실패:', err);
      }
    },
    [state.layers],
  );

  const handleCut = useCallback(async () => {
    if (!state.selection || !documentHasRaster(state.layers)) return;

    try {
      await handleCopy();

      const { width: dw, height: dh } = getDocumentCanvasSize(state.layers);
      const activeLayer = getActiveLayer(state.layers, state.activeLayerId);
      const canvas = document.createElement('canvas');
      canvas.width = dw;
      canvas.height = dh;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (activeLayer?.image) {
        drawRasterImageOnContext(ctx, activeLayer);
      }
      ctx.clearRect(state.selection.x, state.selection.y, state.selection.width, state.selection.height);

      const newImg = new Image();
      newImg.onload = () => {
        setState(prev => ({
          ...prev,
          layers: mapLayersReplaceActiveLayerRaster(
            prev.layers,
            prev.activeLayerId,
            newImg,
            activeLayer?.fileName ?? getActiveLayer(prev.layers, prev.activeLayerId)?.fileName ?? null
          ),
          selection: null,
          selectedRasterLayerId: null,
        }));
      };
      newImg.src = canvas.toDataURL();
    } catch (err) {
      console.error('Cut failed:', err);
    }
  }, [state.selection, state.layers, handleCopy]);

  const pasteFromInternalClipboard = useCallback(async (): Promise<boolean> => {
    const payload = internalClipboardRef.current;
    if (!payload) return false;
    const s = stateRef.current;

    if (payload.kind === 'shapes') {
      const before = cloneLayersDeep(s.layers);
      const dx = 20;
      const dy = 20;
      const copiedByLayer = new Map<string, Shape[]>();
      payload.entries.forEach(({ layerId }) => {
        if (!copiedByLayer.has(layerId)) copiedByLayer.set(layerId, []);
      });
      payload.entries.forEach(({ layerId, shape }) => {
        const mapped = remapShapePoints(cloneShapeDeep(shape), (p) => ({ x: p.x + dx, y: p.y + dy }));
        mapped.id = newId();
        const targetLayerId = s.layers.some(l => l.id === layerId) ? layerId : s.activeLayerId;
        if (!copiedByLayer.has(targetLayerId)) copiedByLayer.set(targetLayerId, []);
        copiedByLayer.get(targetLayerId)!.push(mapped);
      });
      const insertedIds = Array.from(copiedByLayer.values()).flat().map(sh => sh.id);
      setState(prev => ({
        ...prev,
        tool: 'select',
        layers: prev.layers.map(layer => {
          const add = copiedByLayer.get(layer.id) ?? [];
          if (add.length === 0) return layer;
          return { ...layer, shapes: [...layer.shapes, ...add] };
        }),
        selectedShapeIds: insertedIds,
        selectedRasterLayerId: null,
        selection: null,
      }));
      handleLayersMutation(before, s.activeLayerId, '도형 붙여넣기');
      return true;
    }

    if (payload.kind === 'raster') {
      const cloned = await cloneImageElement(payload.image);
      if (!cloned) return false;
      const before = cloneLayersDeep(s.layers);
      const activeLayer = getActiveLayer(s.layers, s.activeLayerId);
      if (!activeLayer) return false;
      const canvas = document.createElement('canvas');
      const nx = payload.x + 20;
      const ny = payload.y + 20;
      const pw = cloned.width;
      const ph = cloned.height;
      const hasBase = !!activeLayer.image;
      const ax = activeLayer.imageX ?? 0;
      const ay = activeLayer.imageY ?? 0;
      const aw = activeLayer.image?.width ?? 0;
      const ah = activeLayer.image?.height ?? 0;
      const left = hasBase ? Math.min(ax, nx) : nx;
      const top = hasBase ? Math.min(ay, ny) : ny;
      const right = hasBase ? Math.max(ax + aw, nx + pw) : nx + pw;
      const bottom = hasBase ? Math.max(ay + ah, ny + ph) : ny + ph;
      canvas.width = Math.max(1, Math.ceil(right - left));
      canvas.height = Math.max(1, Math.ceil(bottom - top));
      const ctx = canvas.getContext('2d');
      if (!ctx) return false;
      ctx.save();
      ctx.translate(-left, -top);
      if (activeLayer.image) {
        drawRasterImageOnContext(ctx, activeLayer);
      }
      ctx.drawImage(cloned, nx, ny);
      ctx.restore();
      const merged = new Image();
      merged.onload = () => {
        setState(prev => ({
          ...prev,
          tool: 'select',
          layers: prev.layers.map(l =>
            l.id === prev.activeLayerId
              ? {
                  ...l,
                  image: merged,
                  fileName: activeLayer.fileName ?? payload.fileName ?? 'pasted-image.png',
                  imageX: left,
                  imageY: top,
                  imageRotation: undefined,
                }
              : l
          ),
          selectedShapeIds: [],
          selectedRasterLayerId: prev.activeLayerId,
          selection: null,
        }));
      };
      merged.src = canvas.toDataURL();
      handleLayersMutation(before, s.activeLayerId, '이미지 붙여넣기');
      return true;
    }

    if (payload.kind === 'selection') {
      setState(prev => ({ ...prev, selection: { ...payload.rect }, tool: 'marquee' }));
      return false;
    }
    return false;
  }, [handleLayersMutation]);

  const processPastedImage = useCallback((img: HTMLImageElement, asNew: boolean = false) => {
    const s = stateRef.current;

    const buildPasteSnapshot = (): ImageUndoSnapshot => ({
      layers: cloneLayersDeep(s.layers),
      activeLayerId: s.activeLayerId,
      selection: s.selection ? { ...s.selection } : null,
      zoom: s.zoom,
      position: { ...s.position },
    });

    const snapshot = buildPasteSnapshot();

    if (!documentHasRaster(s.layers) || asNew) {
      appendUndoEntry({ type: 'image', snapshot, label: '붙여넣기 (새 이미지)' });
      pushPasteUndoSnapshot(snapshot);
      setState(prev => {
        const fresh = createFreshEditorState();
        const L0 = fresh.layers[0];
        return {
          ...prev,
          tool: 'select',
          layers: [{ ...L0, image: img, fileName: 'pasted-image.png' }],
          activeLayerId: L0.id,
          zoom: 1,
          position: { x: 50, y: 50 },
          selection: null,
          selectedShapeIds: [],
          selectedRasterLayerId: L0.id,
        };
      });
    } else {
      const activeLayer = getActiveLayer(s.layers, s.activeLayerId);
      if (!activeLayer) return;
      const hasBase = !!activeLayer.image;
      const ax = activeLayer.imageX ?? 0;
      const ay = activeLayer.imageY ?? 0;
      const aw = activeLayer.image?.width ?? 0;
      const ah = activeLayer.image?.height ?? 0;
      const pasteW = s.selection ? Math.max(1, Math.round(s.selection.width)) : img.width;
      const pasteH = s.selection ? Math.max(1, Math.round(s.selection.height)) : img.height;
      const { width: dw, height: dh } = getDocumentCanvasSize(s.layers);
      const pasteX = s.selection ? s.selection.x : (dw - img.width) / 2;
      const pasteY = s.selection ? s.selection.y : (dh - img.height) / 2;
      const left = hasBase ? Math.min(ax, pasteX) : pasteX;
      const top = hasBase ? Math.min(ay, pasteY) : pasteY;
      const right = hasBase ? Math.max(ax + aw, pasteX + pasteW) : pasteX + pasteW;
      const bottom = hasBase ? Math.max(ay + ah, pasteY + pasteH) : pasteY + pasteH;
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(right - left));
      canvas.height = Math.max(1, Math.ceil(bottom - top));
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      /** 활성 레이어 래스터만 깔고 그 위에 붙여넣기(다른 레이어 래스터는 합성하지 않음). */
      ctx.save();
      ctx.translate(-left, -top);
      if (activeLayer.image) {
        drawRasterImageOnContext(ctx, activeLayer);
      }

      if (s.selection) {
        ctx.drawImage(img, pasteX, pasteY, pasteW, pasteH);
      } else {
        ctx.drawImage(img, pasteX, pasteY);
      }
      ctx.restore();

      let mergedDataUrl: string;
      try {
        mergedDataUrl = canvas.toDataURL();
      } catch {
        console.warn('이미지 붙여넣기 합성에 실패했습니다(캔버스 보안 제한 등).');
        return;
      }

      const mergedImg = new Image();
      mergedImg.onload = () => {
        appendUndoEntry({ type: 'imageMerge', snapshot, label: '붙여넣기 (현재 이미지)' });
        pushPasteUndoSnapshot(snapshot);
        setState(prev => ({
          ...prev,
          tool: 'select',
          layers: prev.layers.map(l =>
            l.id === prev.activeLayerId
              ? {
                  ...l,
                  image: mergedImg,
                  fileName: activeLayer.fileName ?? 'pasted-image.png',
                  imageX: left,
                  imageY: top,
                  imageRotation: undefined,
                }
              : l
          ),
          selection: null,
          selectedShapeIds: [],
          selectedRasterLayerId: prev.activeLayerId,
        }));
      };
      mergedImg.src = mergedDataUrl;
    }
  }, [appendUndoEntry, pushPasteUndoSnapshot]);

  const handlePaste = useCallback(async (clipboardData?: DataTransfer, asNew: boolean = false) => {
    try {
      if (!asNew) {
        const consumed = await pasteFromInternalClipboard();
        if (consumed) return;
      }

      // 1. Try to get from DataTransfer (from 'paste' event)
      if (clipboardData) {
        const items = Array.from(clipboardData.items);
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            if (blob) {
              const reader = new FileReader();
              reader.onload = (e) => {
                const img = new Image();
                img.onload = () => processPastedImage(img, asNew);
                img.src = e.target?.result as string;
              };
              reader.readAsDataURL(blob);
              return;
            }
          }
        }
      }

      // 2. Fallback to navigator.clipboard.read()
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageTypes = item.types.filter(type => type.startsWith('image/'));
        if (imageTypes.length > 0) {
          const blob = await item.getType(imageTypes[0]);
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => processPastedImage(img, asNew);
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    } catch (err) {
      console.warn('Paste failed:', err);
    }
  }, [processPastedImage, pasteFromInternalClipboard]);

  // Keyboard shortcuts and paste event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const isUndoKey = !e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z');
        if (isUndoKey && pasteUndoRef.current.length > 0) {
          const undoPoint = buildStateSnapshot(stateRef.current);
          e.preventDefault();
          const snaps = pasteUndoRef.current;
          const snap = snaps[snaps.length - 1];
          pasteUndoRef.current = snaps.slice(0, -1);
          let st = [...undoStackRef.current];
          while (st.length > 0) {
            const t = st[st.length - 1];
            st.pop();
            if (t.type === 'image' || t.type === 'imageMerge') break;
          }
          undoStackRef.current = st;
          setUndoStack(st);
          applyImageSnapshot(snap);
          if (undoPoint) {
            const nextRedo = [...redoStackRef.current, undoPoint];
            redoStackRef.current = nextRedo;
            setRedoStack(nextRedo);
          }
          return;
        }

        const isRedoKey =
          (e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z')) ||
          e.code === 'KeyY' ||
          e.key.toLowerCase() === 'y';
        if (isRedoKey) {
          e.preventDefault();
          handleRedoLastShape();
          return;
        }

        switch (e.key.toLowerCase()) {
          case 'c':
            {
              const s = stateRef.current;
              if (s.selection || s.selectedRasterLayerId || s.selectedShapeIds.length > 0) {
                e.preventDefault();
                void handleCopy();
              }
            }
            break;
          case 'x':
            {
              const s = stateRef.current;
              if (s.selection) {
                e.preventDefault();
                void handleCut();
              }
            }
            break;
          case 'v':
            // We'll handle this via the 'paste' event for better compatibility
            break;
          case 's':
            e.preventDefault();
            if (e.shiftKey) {
              setIsSaveModalOpen(true);
            } else {
              handleSave();
            }
            break;
          case 'o':
            e.preventDefault();
            handleOpen();
            break;
        }
      }
    };

    const handleGlobalPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (
        t instanceof HTMLTextAreaElement ||
        t instanceof HTMLInputElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (e.clipboardData) {
        handlePaste(e.clipboardData);
      } else {
        handlePaste();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('paste', handleGlobalPaste);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('paste', handleGlobalPaste);
    };
  }, [handleCopy, handleCut, handlePaste, handleSave, applyImageSnapshot, buildStateSnapshot, handleRedoLastShape]);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-blue-500/30">
      <Toolbar 
        state={state}
        onOpen={handleOpen}
        onNewCanvas={handleNewCanvas}
        onSave={() => handleSave()}
        onSaveAs={() => setIsSaveModalOpen(true)}
        onResize={() => setIsResizeModalOpen(true)}
        onCanvasSize={() => setIsCanvasSizeModalOpen(true)}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        onZoomChange={handleZoomChange}
        onToolChange={handleToolChange}
        onColorChange={handleColorChange}
        onLineWidthChange={handleLineWidthChange}
        onTextFontSizeChange={handleTextFontSizeChange}
        onFillToleranceChange={handleFillToleranceChange}
        onFillIgnoreAlphaChange={handleFillIgnoreAlphaChange}
        onDeleteLastShape={handleDeleteLastShape}
        onRedoLastShape={handleRedoLastShape}
        canUndoLast={undoStack.length > 0 || totalShapeCount(state.layers) > 0}
        canRedoLast={redoStack.length > 0}
        canTransformSelection={state.selectedRasterLayerId != null || state.selectedShapeIds.length > 0}
        onTransformScaleDown={handleTransformScaleDown}
        onTransformScaleUp={handleTransformScaleUp}
        onTransformRotateLeft={handleTransformRotateLeft}
        onTransformRotateRight={handleTransformRotateRight}
        selectionRotationDeg={selectionRotationDeg}
        onSelectionRotationDegCommit={handleSelectionRotationDegCommit}
        onClearShapes={handleClearShapes}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
        areaCaptureArmed={areaCaptureArmed}
        onToggleAreaCapture={() => setAreaCaptureArmed(a => !a)}
        onCaptureSelection={handleCaptureSelection}
        onCaptureFullDocument={handleCaptureFullDocument}
      />
      
      <main className="flex-1 flex overflow-hidden min-h-0">
        <CanvasEditor
          state={state}
          setState={setState}
          onImageLoad={handleImageLoad}
          onPaste={() => handlePaste()}
          onShapeCommitted={(label) =>
            appendUndoEntry({ type: 'shape', layerId: stateRef.current.activeLayerId, label })
          }
          onLayersMutation={handleLayersMutation}
          onPrepareImageUndo={handlePrepareImageUndoForPaint}
          scrollResetKey={canvasScrollResetKey}
          areaCaptureArmed={areaCaptureArmed}
          onAreaCaptureResult={handleAreaCaptureResult}
        />
        <LayersPanel state={state} setState={setState} />
      </main>

      <SaveModal 
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSave}
        defaultFileName={getActiveLayer(state.layers, state.activeLayerId)?.fileName || 'image.png'}
      />

      <ResizeModal
        isOpen={isResizeModalOpen}
        onClose={() => setIsResizeModalOpen(false)}
        onResize={handleResize}
        currentWidth={getDocumentCanvasSize(state.layers).width}
        currentHeight={getDocumentCanvasSize(state.layers).height}
      />

      <CanvasSizeModal
        isOpen={isCanvasSizeModalOpen}
        onClose={() => setIsCanvasSizeModalOpen(false)}
        onApply={handleCanvasSize}
        currentWidth={getDocumentCanvasSize(state.layers).width}
        currentHeight={getDocumentCanvasSize(state.layers).height}
      />

      <TextDraftPanel
        state={state}
        setState={setState}
        onTextCommitted={() => appendUndoEntry({ type: 'shape', label: '텍스트' })}
      />

      <StatusBar state={state} />
    </div>
  );
}
