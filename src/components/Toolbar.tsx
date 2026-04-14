import React from 'react';
import { 
  FolderOpen, 
  Save, 
  ZoomIn, 
  ZoomOut, 
  Maximize, 
  Copy, 
  Scissors, 
  ClipboardPaste,
  MousePointer2,
  Download,
  Scale,
  Maximize2,
  Type,
  Square,
  Circle,
  Minus,
  Trash2,
  Undo2
} from 'lucide-react';
import { EditorState, Tool } from '../types';
import { cn } from '../lib/utils';

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
  onDeleteLastShape: () => void;
  canUndoLast: boolean;
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
  onDeleteLastShape,
  canUndoLast,
  onClearShapes,
  onCopy,
  onCut,
  onPaste
}) => {
  return (
    <div className="h-14 bg-neutral-800 border-b border-neutral-700 flex items-center px-2 gap-1 shrink-0 overflow-x-auto no-scrollbar">
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
          icon={<MousePointer2 size={18} />} 
          label="선택 도구" 
          active={state.tool === 'select'}
        />
        <ToolbarButton 
          onClick={() => onToolChange('line')} 
          icon={<Minus size={18} />} 
          label="선 그리기" 
          active={state.tool === 'line'}
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
          <ToolbarButton 
            onClick={onDeleteLastShape} 
            icon={<Undo2 size={18} />} 
            label="마지막 작업 되돌리기 (도형 / 붙여넣기)" 
            disabled={!canUndoLast}
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
