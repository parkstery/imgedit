import React, { useEffect, useMemo, useRef, useState } from 'react';
import { 
  FolderOpen, 
  Save, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Copy, 
  Scissors, 
  ClipboardPaste,
  Download,
  Scale,
  Maximize2,
  Pencil,
  Square,
  Circle,
  Minus,
  Trash2,
  Undo2,
  Redo2,
  ChevronDown
} from 'lucide-react';
import { EditorState, Tool } from '../types';
import { cn } from '../lib/utils';

/** 캔버스 선택 상자와 같은 점선 박스 */
function SelectionBoxToolbarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden
    >
      <rect
        x="3.5"
        y="3.5"
        width="17"
        height="17"
        rx="1"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="3.5 3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PolylineToolbarIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0"
      aria-hidden
    >
      <path
        d="M4 17 L9 7 L15 13 L20 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="4" cy="17" r="2" fill="currentColor" />
      <circle cx="9" cy="7" r="2" fill="currentColor" />
      <circle cx="15" cy="13" r="2" fill="currentColor" />
      <circle cx="20" cy="6" r="2" fill="currentColor" />
    </svg>
  );
}

interface ToolbarProps {
  state: EditorState;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onResize: () => void;
  onCanvasSize: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onZoomChange: (value: number) => void;
  onToolChange: (tool: Tool) => void;
  onColorChange: (color: string) => void;
  onLineWidthChange: (lineWidth: number) => void;
  onDeleteLastShape: () => void;
  onRedoLastShape: () => void;
  canUndoLast: boolean;
  canRedoLast: boolean;
  onClearShapes: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: (clipboardData?: any, asNew?: boolean) => void;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  state,
  onOpen,
  onSave,
  onSaveAs,
  onResize,
  onCanvasSize,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onZoomChange,
  onToolChange,
  onColorChange,
  onLineWidthChange,
  onDeleteLastShape,
  onRedoLastShape,
  canUndoLast,
  canRedoLast,
  onClearShapes,
  onCopy,
  onCut,
  onPaste
}) => {
  const [isLineWidthOpen, setIsLineWidthOpen] = useState(false);
  const lineWidthMenuRef = useRef<HTMLDivElement>(null);
  const lineWidthOptions = useMemo(
    () => [
      { width: 2 },
      { width: 4 },
      { width: 6 },
      { width: 8 },
      { width: 10 },
    ],
    []
  );

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideMenu = lineWidthMenuRef.current?.contains(target);
      const insideButton = (target as HTMLElement).closest('[data-line-width-button]');
      if (!insideMenu && !insideButton) {
        setIsLineWidthOpen(false);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    return () => window.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  return (
    <div className="h-14 bg-neutral-800 border-b border-neutral-700 flex items-center px-2 gap-1 shrink-0 overflow-x-auto overflow-y-visible no-scrollbar relative z-30">
      <div className="flex items-center gap-0.5 pr-2 border-r border-neutral-700">
        <ToolbarButton onClick={onOpen} icon={<FolderOpen size={18} />} label="열기" />
        <ToolbarButton onClick={() => onPaste(undefined, true)} icon={<ClipboardPaste size={18} />} label="클립보드에서 새 이미지로 열기" />
        <ToolbarButton onClick={onSave} icon={<Save size={18} />} label="저장" disabled={!state.image} />
        <ToolbarButton onClick={onSaveAs} icon={<Download size={18} />} label="다른 이름으로 저장" disabled={!state.image} />
        <ToolbarButton onClick={onResize} icon={<Scale size={18} />} label="이미지 크기 조절" disabled={!state.image} />
        <ToolbarButton onClick={onCanvasSize} icon={<Maximize2 size={18} />} label="캔버스 크기 조절 (잘라내기/확장)" disabled={!state.image} />
      </div>

      <div className="flex items-center gap-0.5 px-2 border-r border-neutral-700">
        <ToolbarButton 
          onClick={() => onToolChange('select')} 
          icon={<SelectionBoxToolbarIcon size={18} />} 
          label="선택 박스" 
          active={state.tool === 'select'}
        />
        <ToolbarButton 
          onClick={() => onToolChange('freehand')} 
          icon={<Pencil size={18} />} 
          label="자유그리기" 
          active={state.tool === 'freehand'}
        />
        <ToolbarButton 
          onClick={() => onToolChange('line')} 
          icon={<Minus size={18} />} 
          label="선 그리기" 
          active={state.tool === 'line'}
        />
        <ToolbarButton 
          onClick={() => onToolChange('polyline')} 
          icon={<PolylineToolbarIcon size={18} />} 
          label="폴리라인" 
          active={state.tool === 'polyline'}
        />
        <ToolbarButton 
          onClick={() => onToolChange('rect')} 
          icon={<Square size={18} />} 
          label="사각형 그리기" 
          active={state.tool === 'rect'}
        />
        <ToolbarButton 
          onClick={() => onToolChange('ellipse')} 
          icon={<Circle size={18} />} 
          label="원 그리기" 
          active={state.tool === 'ellipse'}
        />
        
        <div className="flex items-center gap-1 ml-1 px-1 border-l border-neutral-700">
          <input 
            type="color" 
            value={state.color} 
            onChange={(e) => onColorChange(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
            title="색상 선택"
          />
          <div className="relative">
            <button
              data-line-width-button
              onClick={() => setIsLineWidthOpen(prev => !prev)}
              title="선두께"
              className="h-7 px-2 rounded-md transition-colors flex items-center gap-1 text-xs text-neutral-200 hover:bg-neutral-700 active:bg-neutral-600"
            >
              <span>선두께</span>
              <span className="text-neutral-300">{state.lineWidth}px</span>
              <ChevronDown size={14} className={cn("transition-transform", isLineWidthOpen && "rotate-180")} />
            </button>
            {isLineWidthOpen && (
              <div
                ref={lineWidthMenuRef}
                className="absolute left-0 top-full mt-1 w-36 rounded-md border border-neutral-700 bg-neutral-900 shadow-xl z-40 py-1"
              >
                {lineWidthOptions.map(({ width }) => (
                  <button
                    key={width}
                    onClick={() => {
                      onLineWidthChange(width);
                      setIsLineWidthOpen(false);
                    }}
                    className={cn(
                      "w-full px-2.5 py-1.5 text-left text-xs flex items-center justify-between hover:bg-neutral-800",
                      state.lineWidth === width ? "text-blue-400" : "text-neutral-200"
                    )}
                  >
                    <span className="w-8">{width}</span>
                    <svg width="48" height="14" viewBox="0 0 48 14" aria-hidden>
                      <line
                        x1="2"
                        y1="7"
                        x2="46"
                        y2="7"
                        stroke="currentColor"
                        strokeWidth={width}
                        strokeLinecap="round"
                      />
                    </svg>
                  </button>
                ))}
              </div>
            )}
          </div>
          <ToolbarButton 
            onClick={onDeleteLastShape} 
            icon={<Undo2 size={18} />} 
            label="Undo" 
            disabled={!canUndoLast}
          />
          <ToolbarButton
            onClick={onRedoLastShape}
            icon={<Redo2 size={18} />}
            label="Redo"
            disabled={!canRedoLast}
          />
          <ToolbarButton 
            onClick={onClearShapes} 
            icon={<Trash2 size={18} />} 
            label="모든 도형 삭제" 
            disabled={state.shapes.length === 0}
          />
        </div>
      </div>

      <div className="flex items-center gap-2 px-2 border-r border-neutral-700">
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={onZoomOut} icon={<ZoomOut size={18} />} label="축소" />
          <input 
            type="range" 
            min="0.01" 
            max="8" 
            step="0.01" 
            value={state.zoom} 
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className="w-16 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
          />
          <ToolbarButton onClick={onZoomIn} icon={<ZoomIn size={18} />} label="확대" />
        </div>
        
        <div className="flex items-center gap-2">
          <input 
            type="number" 
            min="1" 
            max="800" 
            value={Math.round(state.zoom * 100)} 
            onChange={(e) => onZoomChange(parseInt(e.target.value) / 100)}
            className="w-16 bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-blue-500"
          />
          <span className="text-xs text-neutral-500">%</span>
        </div>

        <ToolbarButton onClick={onResetZoom} icon={<Maximize size={18} />} label="맞춤" />
      </div>

      <div className="flex items-center gap-0.5 px-2">
        <ToolbarButton 
          onClick={onCopy} 
          icon={<Copy size={18} />} 
          label="복사" 
          disabled={!state.selection} 
          shortcut="Ctrl+C"
        />
        <ToolbarButton 
          onClick={onCut} 
          icon={<Scissors size={18} />} 
          label="잘라내기" 
          disabled={!state.selection} 
          shortcut="Ctrl+X"
        />
        <ToolbarButton 
          onClick={onPaste} 
          icon={<ClipboardPaste size={18} />} 
          label="붙여넣기" 
          shortcut="Ctrl+V"
        />
      </div>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  shortcut?: string;
  active?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, icon, label, disabled, shortcut, active }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    title={shortcut ? `${label} (${shortcut})` : label}
    className={cn(
      "p-1.5 rounded-md transition-colors flex items-center justify-center",
      "hover:bg-neutral-700 active:bg-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed",
      active ? "bg-blue-600 text-white hover:bg-blue-500" : "text-neutral-200"
    )}
  >
    {icon}
  </button>
);
