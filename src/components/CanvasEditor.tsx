import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EditorState, Point, Rect, Shape } from '../types';
import { cn } from '../lib/utils';
import { floodFillImageData, hexToRgba } from '../lib/floodFill';

interface CanvasEditorProps {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  onImageLoad: (file: File) => void;
  onPaste: () => void;
  onShapeCommitted?: (label?: string) => void;
  /** 페인트통 등 비트맵 변경 직전에 Undo용 스냅샷을 쌓을 때 호출 */
  onPrepareImageUndo?: () => void;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({
  state,
  setState,
  onImageLoad,
  onPaste,
  onShapeCommitted,
  onPrepareImageUndo,
}) => {
  const getShapeCommitLabel = useCallback((tool: EditorState['tool']) => {
    switch (tool) {
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
      default:
        return '도형 추가';
    }
  }, []);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  /** 폴리라인: 마지막 점에서 커서까지 미리보기 */
  const [polyHover, setPolyHover] = useState<Point | null>(null);
  /** mouseup 직후 mouseleave가 한 번 더 오며 도형이 이중 커밋되는 것을 막음 */
  const shapeEndGuardRef = useRef(false);

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
      return { ...prev, shapes: [...prev.shapes, shape], polylineDraft: null };
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
      return { ...prev, shapes: [...prev.shapes, shape], freehandDraft: null };
    });
    queueMicrotask(() => onShapeCommitted?.('자유그리기'));
  }, [setState, onShapeCommitted]);

  useEffect(() => {
    if (state.tool !== 'polyline') setPolyHover(null);
  }, [state.tool]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.tool, state.polylineDraft, state.freehandDraft, commitPolylineDraft, commitFreehandDraft, setState]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.image) return;

    ctx.save();
    ctx.translate(state.position.x, state.position.y);
    ctx.scale(state.zoom, state.zoom);

    if (state.baseLayerVisible) {
      ctx.drawImage(state.image, 0, 0);
    }

    if (state.shapeLayerVisible) {
      state.shapes.forEach(shape => {
        ctx.strokeStyle = shape.color;
        ctx.lineWidth = shape.lineWidth / state.zoom;
        ctx.beginPath();
        if (shape.type === 'line') {
          ctx.moveTo(shape.x1, shape.y1);
          ctx.lineTo(shape.x2, shape.y2);
        } else if (shape.type === 'rect') {
          ctx.strokeRect(shape.x1, shape.y1, shape.x2 - shape.x1, shape.y2 - shape.y1);
        } else if (shape.type === 'ellipse') {
          const rx = Math.abs(shape.x2 - shape.x1) / 2;
          const ry = Math.abs(shape.y2 - shape.y1) / 2;
          const cx = (shape.x1 + shape.x2) / 2;
          const cy = (shape.y1 + shape.y2) / 2;
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        } else if (shape.type === 'polyline' && shape.points && shape.points.length >= 2) {
          ctx.moveTo(shape.points[0].x, shape.points[0].y);
          for (let i = 1; i < shape.points.length; i++) {
            ctx.lineTo(shape.points[i].x, shape.points[i].y);
          }
        }
        ctx.stroke();
      });

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
    }

    ctx.restore();
  }, [state, polyHover]);

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && canvasRef.current) {
        canvasRef.current.width = containerRef.current.clientWidth;
        canvasRef.current.height = containerRef.current.clientHeight;
        draw();
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, [draw]);

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
    return {
      x: (p.x - state.position.x) / state.zoom,
      y: (p.y - state.position.y) / state.zoom,
    };
  };

  const handlePolylineClick = (e: React.MouseEvent) => {
    if (state.tool !== 'polyline' || !state.image) return;
    if (state.activeLayer !== 'shape' || !state.shapeLayerVisible) return;
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
    if (state.tool !== 'freehand' || !state.image) return;
    if (state.activeLayer !== 'shape' || !state.shapeLayerVisible) return;
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
      queueMicrotask(() => onShapeCommitted?.('자유그리기'));
      return { ...prev, shapes: [...prev.shapes, shape], freehandDraft: null };
    });
  };

  const handleFillClick = (e: React.MouseEvent) => {
    if (state.tool !== 'fill' || !state.image) return;
    if (state.activeLayer !== 'base' || !state.baseLayerVisible) return;
    const imgPos = toImageCoords(getMousePos(e));
    const ix = Math.floor(imgPos.x);
    const iy = Math.floor(imgPos.y);
    const { image: img, color: fillHex } = state;

    if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return;

    onPrepareImageUndo?.();

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(img, 0, 0);

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
        image: nextImg,
        selection: null,
        polylineDraft: null,
        freehandDraft: null,
      }));
    };
    nextImg.onerror = () => {
      console.warn('페인트통: 결과 이미지를 불러오지 못했습니다.');
    };
    nextImg.src = dataUrl;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    setDragStart(pos);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setState(prev => ({ ...prev, isPanning: true }));
    } else if (e.button === 0) {
      if (state.tool === 'select') {
        setState(prev => ({ ...prev, isSelecting: true, selection: null }));
      } else if (
        state.tool !== 'polyline' &&
        state.tool !== 'freehand' &&
        state.tool !== 'fill' &&
        state.activeLayer === 'shape' &&
        state.shapeLayerVisible
      ) {
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

    if (state.polylineDraft) {
      setPolyHover(toImageCoords(pos));
    } else {
      setPolyHover(null);
    }

    if (state.tool === 'freehand' && state.freehandDraft && state.activeLayer === 'shape' && state.shapeLayerVisible) {
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
    if (state.activeShape) {
      if (shapeEndGuardRef.current) {
        setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
        setDragStart(null);
        return;
      }
      shapeEndGuardRef.current = true;
      setState(prev => ({
        ...prev,
        shapes: [...prev.shapes, prev.activeShape!],
        activeShape: null,
      }));
      onShapeCommitted?.(getShapeCommitLabel(state.tool));
      queueMicrotask(() => {
        shapeEndGuardRef.current = false;
      });
    }
    setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
    setDragStart(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const newZoom = Math.max(0.01, Math.min(8, state.zoom + delta));

    const mousePos = getMousePos(e);
    const imagePosBefore = toImageCoords(mousePos);

    setState(prev => {
      const nextPos = {
        x: mousePos.x - imagePosBefore.x * newZoom,
        y: mousePos.y - imagePosBefore.y * newZoom,
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

  return (
    <div
      ref={containerRef}
      className={cn(
        'flex-1 bg-neutral-900 overflow-hidden relative transition-colors touch-none',
        state.tool === 'fill' ? 'cursor-paint-bucket' : 'cursor-crosshair',
        isDraggingOver && 'bg-blue-500/10'
      )}
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
      <canvas ref={canvasRef} className="block w-full h-full" />
      {isDraggingOver && (
        <div className="absolute inset-0 border-2 border-dashed border-blue-500/50 flex items-center justify-center pointer-events-none bg-blue-500/5">
          <p className="text-blue-400 font-medium">이미지를 놓아서 불러오기</p>
        </div>
      )}
    </div>
  );
};
