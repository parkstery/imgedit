import { useState, useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { Toolbar } from './components/Toolbar';
import { CanvasEditor } from './components/CanvasEditor';
import { StatusBar } from './components/StatusBar';
import { SaveModal } from './components/SaveModal';
import { ResizeModal } from './components/ResizeModal';
import { CanvasSizeModal } from './components/CanvasSizeModal';
import { EditorState, Rect, Point, ImageUndoSnapshot, UndoEntry } from './types';
import { motion, AnimatePresence } from 'motion/react';

function shapeToBoundsRect(shape: { x1: number; y1: number; x2: number; y2: number }): Rect {
  return {
    x: Math.min(shape.x1, shape.x2),
    y: Math.min(shape.y1, shape.y2),
    width: Math.abs(shape.x2 - shape.x1),
    height: Math.abs(shape.y2 - shape.y1),
  };
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x + a.width < b.x || b.x + b.width < a.x || a.y + a.height < b.y || b.y + b.height < a.y);
}

const INITIAL_STATE: EditorState = {
  zoom: 1,
  position: { x: 0, y: 0 },
  selection: null,
  isSelecting: false,
  isPanning: false,
  image: null,
  fileName: null,
  tool: 'select',
  color: '#ff0000',
  shapes: [],
  activeShape: null,
  polylineDraft: null,
};

export default function App() {
  const [state, setState] = useState<EditorState>(INITIAL_STATE);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const undoStackRef = useRef<UndoEntry[]>([]);
  /** Ctrl+Z용: 붙여넣기 직전 스냅샷만 (도형이 스택 위에 있어도 마지막 붙여넣기 취소 가능) */
  const pasteUndoRef = useRef<ImageUndoSnapshot[]>([]);
  const stateRef = useRef(state);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isResizeModalOpen, setIsResizeModalOpen] = useState(false);
  const [isCanvasSizeModalOpen, setIsCanvasSizeModalOpen] = useState(false);

  // Initialize with a blank white canvas
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 800;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const img = new Image();
      img.onload = () => {
        setState(prev => ({
          ...prev,
          image: img,
          fileName: 'new-image.png',
          position: { x: 50, y: 50 },
          zoom: 0.8
        }));
      };
      img.src = canvas.toDataURL();
    }
  }, []);

  useLayoutEffect(() => {
    stateRef.current = state;
  }, [state]);

  useLayoutEffect(() => {
    undoStackRef.current = undoStack;
  }, [undoStack]);

  const appendUndoEntry = useCallback((entry: UndoEntry) => {
    const next = [...undoStackRef.current, entry];
    undoStackRef.current = next;
    setUndoStack(next);
  }, []);

  const pushPasteUndoSnapshot = useCallback((snapshot: ImageUndoSnapshot) => {
    pasteUndoRef.current = [...pasteUndoRef.current, snapshot];
  }, []);

  const applyImageSnapshot = useCallback((snap: ImageUndoSnapshot) => {
    const nextMeta = {
      fileName: snap.fileName,
      shapes: snap.shapes.map(sh => ({ ...sh })),
      selection: snap.selection ? { ...snap.selection } : null,
      zoom: snap.zoom,
      position: { ...snap.position },
    };

    if (snap.imageDataUrl) {
      const img = new Image();
      img.onload = () => {
        setState(prev => ({ ...prev, ...nextMeta, image: img }));
      };
      img.onerror = () => {
        if (snap.imageElement) {
          setState(prev => ({ ...prev, ...nextMeta, image: snap.imageElement! }));
        }
      };
      img.src = snap.imageDataUrl;
      return;
    }

    if (snap.imageElement) {
      setState(prev => ({ ...prev, ...nextMeta, image: snap.imageElement! }));
    }
  }, []);

  const handleImageLoad = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        undoStackRef.current = [];
        pasteUndoRef.current = [];
        setUndoStack([]);
        setState(prev => ({
          ...INITIAL_STATE,
          image: img,
          fileName: file.name,
          // Center image initially
          position: { x: 50, y: 50 },
          zoom: 0.8
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

  const handleSave = (filename?: string, format: string = 'image/png', quality: number = 0.92) => {
    if (!state.image) return;
    const canvas = document.createElement('canvas');
    canvas.width = state.image.width;
    canvas.height = state.image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // For JPEG, we should fill background with white if there are transparent areas
    if (format === 'image/jpeg') {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    
    ctx.drawImage(state.image, 0, 0);
    
    // Draw shapes on export
    state.shapes.forEach(shape => {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
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
    
    const extension = format.split('/')[1];
    const finalFilename = filename || `edited-${state.fileName?.split('.')[0] || 'image'}.${extension}`;
    
    const link = document.createElement('a');
    link.download = finalFilename;
    link.href = canvas.toDataURL(format, quality);
    link.click();
    setIsSaveModalOpen(false);
  };

  const handleZoomIn = () => setState(prev => ({ ...prev, zoom: Math.min(8, prev.zoom + 0.1) }));
  const handleZoomOut = () => setState(prev => ({ ...prev, zoom: Math.max(0.01, prev.zoom - 0.1) }));
  const handleResetZoom = () => setState(prev => ({ ...prev, zoom: 1, position: { x: 50, y: 50 } }));
  const handleZoomChange = (value: number) => setState(prev => ({ ...prev, zoom: Math.max(0.01, Math.min(8, value)) }));

  const handleToolChange = (tool: EditorState['tool']) =>
    setState(prev => ({ ...prev, tool, selection: null, polylineDraft: null }));
  const handleColorChange = (color: string) => setState(prev => ({ ...prev, color }));

  const handleDeleteLastShape = useCallback(() => {
    const prevStack = undoStackRef.current;
    if (prevStack.length === 0) {
      setState(s => {
        if (s.shapes.length === 0) return s;
        return { ...s, shapes: s.shapes.slice(0, -1) };
      });
      return;
    }
    const last = prevStack[prevStack.length - 1];
    const nextStack = prevStack.slice(0, -1);
    undoStackRef.current = nextStack;
    setUndoStack(nextStack);
    if (last.type === 'shape') {
      setState(s => ({ ...s, shapes: s.shapes.slice(0, -1) }));
    } else if (last.type === 'image' || last.type === 'imageMerge') {
      if (pasteUndoRef.current.length > 0) {
        pasteUndoRef.current = pasteUndoRef.current.slice(0, -1);
      }
      applyImageSnapshot(last.snapshot);
    }
  }, [applyImageSnapshot]);

  const handleClearShapes = () => {
    const next = undoStackRef.current.filter(e => e.type !== 'shape');
    undoStackRef.current = next;
    setUndoStack(next);
    setState(prev => ({ ...prev, shapes: [] }));
  };

  const handleResize = (newWidth: number, newHeight: number) => {
    if (!state.image) return;
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(state.image, 0, 0, newWidth, newHeight);
    
    const newImg = new Image();
    newImg.onload = () => {
      setState(prev => ({ ...prev, image: newImg, selection: null }));
      setIsResizeModalOpen(false);
    };
    newImg.src = canvas.toDataURL();
  };

  const handleCanvasSize = (newWidth: number, newHeight: number) => {
    if (!state.image) return;
    const currentWidth = state.image.width;
    const currentHeight = state.image.height;
    
    const canvas = document.createElement('canvas');
    canvas.width = newWidth;
    canvas.height = newHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Stretch image to new dimensions as requested
    ctx.drawImage(state.image, 0, 0, newWidth, newHeight);
    
    // Scale shapes to match new dimensions
    const scaleX = newWidth / currentWidth;
    const scaleY = newHeight / currentHeight;
    
    const scaledShapes = state.shapes.map(shape => {
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
    });

    const newImg = new Image();
    newImg.onload = () => {
      setState(prev => ({ 
        ...prev, 
        image: newImg, 
        selection: null, 
        shapes: scaledShapes 
      }));
      setIsCanvasSizeModalOpen(false);
    };
    newImg.src = canvas.toDataURL();
  };

  const getSelectionCanvas = useCallback((rect: Rect): HTMLCanvasElement | null => {
    if (!state.image) return null;
    const canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    
    // Draw base image
    ctx.drawImage(
      state.image,
      rect.x, rect.y, rect.width, rect.height,
      0, 0, rect.width, rect.height
    );

    // Draw shapes that intersect with the selection
    state.shapes.forEach(shape => {
      if (shape.type === 'polyline') {
        if (!rectsOverlap(rect, shapeToBoundsRect(shape))) return;
      }
      ctx.save();
      ctx.translate(-rect.x, -rect.y);
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.lineWidth;
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
      ctx.restore();
    });

    return canvas;
  }, [state.image, state.shapes]);

  const handleCopy = useCallback(async () => {
    if (!state.selection || !state.image) return;
    const canvas = getSelectionCanvas(state.selection);
    if (!canvas) return;

    return new Promise<void>((resolve, reject) => {
      canvas.toBlob(async (blob) => {
        if (blob) {
          try {
            const item = new ClipboardItem({ [blob.type]: blob });
            await navigator.clipboard.write([item]);
            console.log('Copied to clipboard');
            resolve();
          } catch (err) {
            console.error('Failed to copy:', err);
            reject(err);
          }
        } else {
          reject(new Error('Canvas to blob failed'));
        }
      }, 'image/png');
    });
  }, [state.selection, state.image, getSelectionCanvas]);

  const handleCut = useCallback(async () => {
    if (!state.selection || !state.image) return;
    
    try {
      // Wait for copy to complete
      await handleCopy();

      const canvas = document.createElement('canvas');
      canvas.width = state.image.width;
      canvas.height = state.image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(state.image, 0, 0);
      ctx.clearRect(state.selection.x, state.selection.y, state.selection.width, state.selection.height);

      const newImg = new Image();
      newImg.onload = () => {
        setState(prev => ({ ...prev, image: newImg, selection: null }));
      };
      newImg.src = canvas.toDataURL();
    } catch (err) {
      console.error('Cut failed:', err);
    }
  }, [state.selection, state.image, handleCopy]);

  const processPastedImage = useCallback((img: HTMLImageElement, asNew: boolean = false) => {
    const s = stateRef.current;

    const buildPasteSnapshot = (): ImageUndoSnapshot | null => {
      if (!s.image) return null;
      let imageDataUrl: string | undefined;
      try {
        imageDataUrl = s.image.toDataURL();
      } catch {
        /* 교차 출처 등으로 픽셀 읽기 불가 → imageElement만으로 복구 */
      }
      return {
        ...(imageDataUrl ? { imageDataUrl } : {}),
        imageElement: s.image,
        fileName: s.fileName,
        shapes: s.shapes.map(sh => ({ ...sh })),
        selection: s.selection ? { ...s.selection } : null,
        zoom: s.zoom,
        position: { ...s.position },
      };
    };

    const snapshot = buildPasteSnapshot();

    if (!s.image || asNew) {
      if (snapshot) {
        appendUndoEntry({ type: 'image', snapshot });
        pushPasteUndoSnapshot(snapshot);
      }
      setState(prev => ({
        ...prev,
        image: img,
        fileName: 'pasted-image.png',
        zoom: 1,
        position: { x: 50, y: 50 },
        shapes: [],
        selection: null
      }));
    } else {
      const canvas = document.createElement('canvas');
      canvas.width = s.image.width;
      canvas.height = s.image.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.drawImage(s.image, 0, 0);

      if (s.selection) {
        ctx.drawImage(
          img,
          s.selection.x,
          s.selection.y,
          s.selection.width,
          s.selection.height
        );
      } else {
        const x = (s.image.width - img.width) / 2;
        const y = (s.image.height - img.height) / 2;
        ctx.drawImage(img, x, y);
      }

      let mergedDataUrl: string;
      try {
        mergedDataUrl = canvas.toDataURL();
      } catch {
        console.warn('이미지 붙여넣기 합성에 실패했습니다(캔버스 보안 제한 등).');
        return;
      }

      const mergedImg = new Image();
      mergedImg.onload = () => {
        if (snapshot) {
          appendUndoEntry({ type: 'imageMerge', snapshot });
          pushPasteUndoSnapshot(snapshot);
        }
        setState(prev => ({ ...prev, image: mergedImg, selection: null }));
      };
      mergedImg.src = mergedDataUrl;
    }
  }, [appendUndoEntry, pushPasteUndoSnapshot]);

  const handlePaste = useCallback(async (clipboardData?: DataTransfer, asNew: boolean = false) => {
    try {
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
  }, [processPastedImage]);

  // Keyboard shortcuts and paste event
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        const isUndoKey = !e.shiftKey && (e.code === 'KeyZ' || e.key.toLowerCase() === 'z');
        if (isUndoKey && pasteUndoRef.current.length > 0) {
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
          return;
        }

        switch (e.key.toLowerCase()) {
          case 'c':
            if (state.selection) {
              e.preventDefault();
              handleCopy();
            }
            break;
          case 'x':
            if (state.selection) {
              e.preventDefault();
              handleCut();
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
  }, [state.selection, handleCopy, handleCut, handlePaste, handleSave, applyImageSnapshot]);

  return (
    <div className="flex flex-col h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-blue-500/30">
      <Toolbar 
        state={state}
        onOpen={handleOpen}
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
        onDeleteLastShape={handleDeleteLastShape}
        canUndoLast={undoStack.length > 0 || state.shapes.length > 0}
        onClearShapes={handleClearShapes}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={handlePaste}
      />
      
      <main className="flex-1 flex overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div 
            key="editor"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col"
          >
            <CanvasEditor 
              state={state} 
              setState={setState} 
              onImageLoad={handleImageLoad}
              onPaste={() => handlePaste()}
              onShapeCommitted={() => appendUndoEntry({ type: 'shape' })}
            />
          </motion.div>
        </AnimatePresence>
      </main>

      <SaveModal 
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        onSave={handleSave}
        defaultFileName={state.fileName || 'image.png'}
      />

      <ResizeModal
        isOpen={isResizeModalOpen}
        onClose={() => setIsResizeModalOpen(false)}
        onResize={handleResize}
        currentWidth={state.image?.width || 0}
        currentHeight={state.image?.height || 0}
      />

      <CanvasSizeModal
        isOpen={isCanvasSizeModalOpen}
        onClose={() => setIsCanvasSizeModalOpen(false)}
        onApply={handleCanvasSize}
        currentWidth={state.image?.width || 0}
        currentHeight={state.image?.height || 0}
      />

      <StatusBar state={state} />
    </div>
  );
}
