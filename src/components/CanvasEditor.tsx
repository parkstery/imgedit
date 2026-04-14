import React, { useRef, useEffect, useState, useCallback } from 'react';
import { EditorState, Point, Rect } from '../types';
import { cn } from '../lib/utils';

interface CanvasEditorProps {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  onImageLoad: (file: File) => void;
  onPaste: () => void;
  onShapeCommitted?: () => void;
}

export const CanvasEditor: React.FC<CanvasEditorProps> = ({ state, setState, onImageLoad, onPaste, onShapeCommitted }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!state.image) return;

    ctx.save();
    // Apply transformations
    ctx.translate(state.position.x, state.position.y);
    ctx.scale(state.zoom, state.zoom);

    // Draw image
    ctx.drawImage(state.image, 0, 0);

    // Draw existing shapes
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
      }
      ctx.stroke();
    });

    // Draw active shape
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

    // Draw selection
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
      
      // Semi-transparent overlay outside selection
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      // This is a bit complex for a simple stroke, but let's just do the box for now
    }

    ctx.restore();
  }, [state]);

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

  const handleMouseDown = (e: React.MouseEvent) => {
    const pos = getMousePos(e);
    setDragStart(pos);

    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      setState(prev => ({ ...prev, isPanning: true }));
    } else if (e.button === 0) {
      if (state.tool === 'select') {
        setState(prev => ({ ...prev, isSelecting: true, selection: null }));
      } else {
        const imgPos = toImageCoords(pos);
        setState(prev => ({
          ...prev,
          activeShape: {
            id: Math.random().toString(36).substr(2, 9),
            type: state.tool as any,
            x1: imgPos.x,
            y1: imgPos.y,
            x2: imgPos.x,
            y2: imgPos.y,
            color: state.color,
            lineWidth: 2,
          }
        }));
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const pos = getMousePos(e);

    if (state.isPanning && dragStart) {
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;
      setState(prev => ({
        ...prev,
        position: { x: prev.position.x + dx, y: prev.position.y + dy }
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
        activeShape: prev.activeShape ? {
          ...prev.activeShape,
          x2: current.x,
          y2: current.y,
        } : null
      }));
    }
  };

  const handleMouseUp = () => {
    if (state.activeShape) {
      setState(prev => ({
        ...prev,
        shapes: [...prev.shapes, prev.activeShape!],
        activeShape: null,
      }));
      onShapeCommitted?.();
    }
    setState(prev => ({ ...prev, isPanning: false, isSelecting: false }));
    setDragStart(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomSpeed = 0.1;
    const delta = e.deltaY > 0 ? -zoomSpeed : zoomSpeed;
    const newZoom = Math.max(0.01, Math.min(8, state.zoom + delta));
    
    // Zoom towards mouse position
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

  return (
    <div 
      ref={containerRef} 
      className={cn(
        "flex-1 bg-neutral-900 overflow-hidden relative cursor-crosshair transition-colors touch-none",
        isDraggingOver && "bg-blue-500/10"
      )}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onContextMenu={(e) => e.preventDefault()}
      onTouchStart={(e) => {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousedown', {
          clientX: touch.clientX,
          clientY: touch.clientY,
          button: 0
        });
        handleMouseDown(mouseEvent as any);
      }}
      onTouchMove={(e) => {
        const touch = e.touches[0];
        const mouseEvent = new MouseEvent('mousemove', {
          clientX: touch.clientX,
          clientY: touch.clientY
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
