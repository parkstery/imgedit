import React, { useRef, useState } from 'react';
import { 
  FolderOpen,
  FilePlus,
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
  PaintBucket,
  Palette,
  Type,
  ArrowUpRight,
  Frame,
  Crop,
  Monitor,
  RotateCcw,
  RotateCw,
} from 'lucide-react';
import { EditorState, Tool } from '../types';
import { cn } from '../lib/utils';
import { AdvancedColorWindow } from './AdvancedColorWindow';
import { documentHasRaster, totalShapeCount } from '../lib/layers';

/** 오른쪽 팔레트(클릭 시 현재 그리기 색으로 설정) */
const PAINT_PALETTE = [
  '#000000',
  '#404040',
  '#808080',
  '#c0c0c0',
  '#ffffff',
  '#7f1d1d',
  '#ea580c',
  '#ca8a04',
  '#16a34a',
  '#2563eb',
  '#7c3aed',
  '#db2777',
] as const;

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
  onNewCanvas: () => void;
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
  onTextFontSizeChange: (px: number) => void;
  onFillToleranceChange: (tolerance: number) => void;
  onFillIgnoreAlphaChange: (ignoreAlpha: boolean) => void;
  onDeleteLastShape: () => void;
  onRedoLastShape: () => void;
  canUndoLast: boolean;
  canRedoLast: boolean;
  canTransformSelection: boolean;
  onTransformScaleDown: () => void;
  onTransformScaleUp: () => void;
  onTransformRotateLeft: () => void;
  onTransformRotateRight: () => void;
  onClearShapes: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: (clipboardData?: any, asNew?: boolean) => void;
  /** 문서 합성 기준: 선택 박스 영역을 PNG로 클립보드에 복사 */
  onCaptureSelection: () => void;
  /** 영역 드래그 캡처 모드 토글(캔버스에서 지정) */
  onToggleAreaCapture: () => void;
  /** 문서 합성 전체를 PNG로 클립보드에 복사 */
  onCaptureFullDocument: () => void;
  areaCaptureArmed: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  state,
  onOpen,
  onNewCanvas,
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
  onTextFontSizeChange,
  onFillToleranceChange,
  onFillIgnoreAlphaChange,
  onDeleteLastShape,
  onRedoLastShape,
  canUndoLast,
  canRedoLast,
  canTransformSelection,
  onTransformScaleDown,
  onTransformScaleUp,
  onTransformRotateLeft,
  onTransformRotateRight,
  onClearShapes,
  onCopy,
  onCut,
  onPaste,
  onCaptureSelection,
  onToggleAreaCapture,
  onCaptureFullDocument,
  areaCaptureArmed,
}) => {
  const [advancedColorOpen, setAdvancedColorOpen] = useState(false);
  const advancedColorAnchorRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="min-h-14 bg-neutral-800 border-b border-neutral-700 flex flex-col gap-y-1 py-1.5 px-2 shrink-0 overflow-x-auto overflow-y-visible no-scrollbar relative z-30 lg:flex-row lg:items-center lg:gap-y-0 lg:py-0 lg:min-h-14">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-1 lg:min-h-14 lg:gap-y-1">
      <div className="flex items-center gap-0.5 pr-2 border-r border-neutral-700">
        <ToolbarButton onClick={onOpen} icon={<FolderOpen size={18} />} label="열기" />
        <ToolbarButton onClick={onNewCanvas} icon={<FilePlus size={18} />} label="새 캔버스" />
        <ToolbarButton onClick={() => onPaste(undefined, true)} icon={<ClipboardPaste size={18} />} label="클립보드에서 새 이미지로 열기" />
        <ToolbarButton onClick={onSave} icon={<Save size={18} />} label="저장" disabled={!documentHasRaster(state.layers)} />
        <ToolbarButton onClick={onSaveAs} icon={<Download size={18} />} label="다른 이름으로 저장" disabled={!documentHasRaster(state.layers)} />
        <ToolbarButton onClick={onResize} icon={<Scale size={18} />} label="이미지 크기 조절" disabled={!documentHasRaster(state.layers)} />
        <ToolbarButton onClick={onCanvasSize} icon={<Maximize2 size={18} />} label="캔버스 크기 조절 (잘라내기/확장)" disabled={!documentHasRaster(state.layers)} />
        <div className="mx-0.5 h-5 w-px bg-neutral-600 shrink-0" aria-hidden />
        <ToolbarButton
          onClick={() => void onCaptureSelection()}
          icon={<Frame size={18} strokeWidth={1.75} />}
          label="문서 점선 선택 영역 캡처(클립보드)"
          disabled={
            !documentHasRaster(state.layers) ||
            !state.selection ||
            state.selection.width < 2 ||
            state.selection.height < 2
          }
        />
        <ToolbarButton
          onClick={onToggleAreaCapture}
          icon={<Crop size={18} strokeWidth={1.75} />}
          label="캔버스에서 영역 드래그 캡처(클립보드)"
          disabled={!documentHasRaster(state.layers)}
          active={areaCaptureArmed}
        />
        <ToolbarButton
          onClick={() => void onCaptureFullDocument()}
          icon={<Monitor size={18} strokeWidth={1.75} />}
          label="문서 합성 전체를 클립보드로"
          disabled={!documentHasRaster(state.layers)}
        />
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-x-0.5 gap-y-1 px-2 border-r border-neutral-700">
        <ToolbarButton
          onClick={() => onToolChange('select')}
          icon={<ArrowUpRight size={18} strokeWidth={2} />}
          label="개체 선택 (도형·이미지)"
          active={state.tool === 'select'}
        />
        <ToolbarButton
          onClick={() => onToolChange('marquee')}
          icon={<SelectionBoxToolbarIcon size={18} />}
          label="영역 선택 (점선 박스)"
          active={state.tool === 'marquee'}
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
        <ToolbarButton
          onClick={() => onToolChange('fill')}
          icon={<PaintBucket size={18} />}
          label="페인트통"
          active={state.tool === 'fill'}
        />
        <ToolbarButton
          onClick={() => onToolChange('text')}
          icon={<Type size={18} />}
          label="텍스트"
          active={state.tool === 'text'}
          disabled={!documentHasRaster(state.layers)}
        />
        {state.tool === 'text' && (
          <div className="flex items-center gap-1 ml-0.5 px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-900 shrink-0">
            <span className="text-[10px] text-neutral-400 whitespace-nowrap">글자 크기</span>
            <input
              type="number"
              min={8}
              max={256}
              step={1}
              value={state.textFontSize}
              onChange={(e) =>
                onTextFontSizeChange(Math.max(8, Math.min(256, parseInt(e.target.value || '24', 10))))
              }
              className="w-14 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-blue-500"
              title="텍스트 크기(px)"
            />
          </div>
        )}
        {state.tool === 'fill' && (
          <div
            className="flex items-center gap-2 ml-0.5 px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-900 shrink-0"
            role="group"
            aria-label="페인트통 옵션"
          >
            <div className="flex items-center gap-1.5">
              <span id="fill-tolerance-label" className="text-[10px] text-neutral-400 whitespace-nowrap">
                톨러런스
              </span>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={state.fillTolerance}
                onChange={(e) => onFillToleranceChange(parseInt(e.target.value, 10))}
                className="w-20 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                title="페인트통 색 일치 허용 오차 (높을수록 넓게 채움)"
                aria-labelledby="fill-tolerance-label"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={state.fillTolerance}
                aria-valuetext={`${state.fillTolerance}, 전체 범위 0에서 100`}
              />
              <span className="text-[10px] text-neutral-400 w-6 tabular-nums text-right" aria-hidden>
                {state.fillTolerance}
              </span>
            </div>
            <label
              className="flex items-center gap-1 cursor-pointer select-none shrink-0"
              title="켜면 채우기 영역 판별 시 RGB만 비교합니다. 반투명·안티앨리어싱 경계에 유리합니다."
            >
              <input
                id="fill-ignore-alpha"
                type="checkbox"
                checked={state.fillIgnoreAlpha}
                onChange={(e) => onFillIgnoreAlphaChange(e.target.checked)}
                className="rounded border-neutral-600 bg-neutral-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-[10px] text-neutral-400 whitespace-nowrap">알파 무시</span>
            </label>
          </div>
        )}
        
        <div className="flex items-center gap-1 ml-1 px-1 border-l border-neutral-700">
          <input 
            type="color" 
            value={state.color} 
            onChange={(e) => onColorChange(e.target.value)}
            className="w-6 h-6 rounded cursor-pointer bg-transparent border-none"
            title="색상 선택"
          />
          <div className="flex items-center gap-1 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1">
            <span className="text-xs text-neutral-300">선두께</span>
            <input
              type="number"
              min="1"
              max="50"
              step="1"
              value={state.lineWidth}
              onChange={(e) => onLineWidthChange(Math.max(1, Math.min(50, parseInt(e.target.value || '1', 10))))}
              className="w-14 bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-xs text-center focus:outline-none focus:border-blue-500"
              title="선두께 (위/아래 화살표로 조절)"
            />
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
            disabled={totalShapeCount(state.layers) === 0}
          />
        </div>
        <div className="flex items-center gap-0.5 ml-1 px-1 border-l border-neutral-700">
          <ToolbarButton
            onClick={onTransformScaleDown}
            icon={<ZoomOut size={18} />}
            label="선택 축소 (90%)"
            disabled={!canTransformSelection}
          />
          <ToolbarButton
            onClick={onTransformScaleUp}
            icon={<ZoomIn size={18} />}
            label="선택 확대 (110%)"
            disabled={!canTransformSelection}
          />
          <ToolbarButton
            onClick={onTransformRotateLeft}
            icon={<RotateCcw size={18} />}
            label="선택 회전 (-15°)"
            disabled={!canTransformSelection}
          />
          <ToolbarButton
            onClick={onTransformRotateRight}
            icon={<RotateCw size={18} />}
            label="선택 회전 (+15°)"
            disabled={!canTransformSelection}
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
      </div>

      <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-1 gap-y-1 border-t border-neutral-700 pt-1 -mx-2 px-2 sm:-mx-2 lg:mx-0 lg:flex-none lg:border-t-0 lg:border-l lg:border-neutral-700 lg:pt-0 lg:pl-2">
        <div className="flex items-center gap-0.5 shrink-0">
          <ToolbarButton 
            onClick={onCopy} 
            icon={<Copy size={18} />} 
            label="복사" 
            disabled={!state.selection && state.selectedShapeIds.length === 0 && !state.selectedRasterLayerId} 
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
        <div className="flex items-center gap-0.5 pl-2 pr-1 py-1 ml-1 border-l border-neutral-700 shrink-0 lg:ml-1">
          <button
            ref={advancedColorAnchorRef}
            type="button"
            onClick={() => setAdvancedColorOpen(true)}
            className="relative w-5 h-5 rounded border border-neutral-500 cursor-pointer overflow-hidden hover:ring-2 hover:ring-blue-400/80 focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="고급 색상 선택"
            aria-label="고급 색상 선택"
            aria-haspopup="dialog"
            aria-expanded={advancedColorOpen}
          >
            <div className="absolute inset-0 bg-[conic-gradient(from_0deg,red,yellow,lime,cyan,blue,magenta,red)]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-white/45" />
            <div className="absolute inset-0 flex items-center justify-center text-white/90 pointer-events-none">
              <Palette size={12} />
            </div>
          </button>
          <AdvancedColorWindow
            isOpen={advancedColorOpen}
            anchorRef={advancedColorAnchorRef}
            color={state.color}
            onColorChange={onColorChange}
            onRequestClose={() => setAdvancedColorOpen(false)}
          />
          <input
            type="text"
            readOnly
            value={state.color.toLowerCase()}
            title="현재 색상 HEX 값"
            className="w-24 h-6 bg-neutral-900 border border-neutral-700 rounded px-1 text-[15px] leading-none text-neutral-200 font-mono select-text cursor-text"
          />
          {PAINT_PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              title={c}
              onClick={() => onColorChange(c)}
              className={cn(
                'w-4 h-4 rounded-sm border border-neutral-600 shrink-0',
                'hover:ring-2 hover:ring-blue-400/80 focus:outline-none focus:ring-2 focus:ring-blue-500',
                state.color.toLowerCase() === c.toLowerCase() && 'ring-2 ring-blue-400'
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

interface ToolbarButtonProps {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  shortcut?: string;
  active?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, icon, label, disabled, shortcut, active }) => (
  <button
    type="button"
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
