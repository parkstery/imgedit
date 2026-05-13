import React, { useEffect, useRef, useState } from 'react';
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
  Eraser,
  Palette,
  Type,
  ArrowUpRight,
  Frame,
  Crop,
  Monitor,
  RotateCcw,
  RotateCw,
  ArrowLeft,
  ArrowRight,
  ImageOff,
  ImageMinus,
  Wand2,
  Images,
  ImagePlus,
  Sparkles,
  ChevronDown,
} from 'lucide-react';
import { EditorState, LineStyle, Tool } from '../types';
import { cn } from '../lib/utils';
import { AdvancedColorWindow } from './AdvancedColorWindow';
import { documentHasRaster, getActiveLayer, totalShapeCount } from '../lib/layers';
import { Button } from './ui/Button';
import { formStyles } from './ui/formStyles';

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

/** 점선 원 — 원형 영역 선택 도구 */
function SelectionCircleToolbarIcon({ size = 18 }: { size?: number }) {
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
      <circle
        cx="12"
        cy="12"
        r="8.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="3.5 3.5"
        strokeLinecap="round"
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

function ArcToolbarIcon({ size = 18 }: { size?: number }) {
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
        d="M5 16 A 10 10 0 0 1 19 16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
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
  onLineStyleChange: (lineStyle: LineStyle) => void;
  onEraserSizeChange: (eraserSize: number) => void;
  onRectRadiusChange: (radius: number) => void;
  onTextFontSizeChange: (px: number) => void;
  onTextStyleChange: (next: Partial<Pick<EditorState, 'textBold' | 'textItalic' | 'textUnderline'>>) => void;
  onFillToleranceChange: (tolerance: number) => void;
  onFillIgnoreAlphaChange: (ignoreAlpha: boolean) => void;
  onMagicWandEdgeLimitChange: (edgeLimit: number) => void;
  /** 활성 레이어 래스터에서 현재 색(톨러런스·알파 무시 옵션)과 일치하는 모든 픽셀을 투명 처리 */
  onReplaceCurrentColorTransparentOnLayer: () => void;
  /** 가장자리 색 히스토그램으로 배경을 추정한 뒤 투명 처리 (톨러런스·알파 무시는 페인트통과 동일) */
  onAutoRemoveDetectedBackgroundOnLayer: () => void;
  /** 여러 이미지 파일을 현재 색·톨러런스·알파 무시로 일괄 투명 처리 후 PNG ZIP 내려받기 */
  onBatchTransparentPngZip: () => void;
  onDeleteLastShape: () => void;
  onRedoLastShape: () => void;
  canUndoLast: boolean;
  canRedoLast: boolean;
  canTransformSelection: boolean;
  onTransformScaleDown: () => void;
  onTransformScaleUp: () => void;
  onTransformRotateLeft: () => void;
  onTransformRotateRight: () => void;
  /** 단일 도형 또는 래스터 선택 시 도 단위(절대 각). 없으면 입력란 숨김 */
  selectionRotationDeg: number | null;
  onSelectionRotationDegCommit: (deg: number) => void;
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
  /** Gemini 이미지 분석 패널 */
  onOpenGemini: () => void;
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
  onLineStyleChange,
  onEraserSizeChange,
  onRectRadiusChange,
  onTextFontSizeChange,
  onTextStyleChange,
  onFillToleranceChange,
  onFillIgnoreAlphaChange,
  onMagicWandEdgeLimitChange,
  onReplaceCurrentColorTransparentOnLayer,
  onAutoRemoveDetectedBackgroundOnLayer,
  onBatchTransparentPngZip,
  onDeleteLastShape,
  onRedoLastShape,
  canUndoLast,
  canRedoLast,
  canTransformSelection,
  onTransformScaleDown,
  onTransformScaleUp,
  onTransformRotateLeft,
  onTransformRotateRight,
  selectionRotationDeg,
  onSelectionRotationDegCommit,
  onClearShapes,
  onCopy,
  onCut,
  onPaste,
  onCaptureSelection,
  onToggleAreaCapture,
  onCaptureFullDocument,
  areaCaptureArmed,
  onOpenGemini,
}) => {
  const activeLayer = getActiveLayer(state.layers, state.activeLayerId);
  const [advancedColorOpen, setAdvancedColorOpen] = useState(false);
  const advancedColorAnchorRef = useRef<HTMLButtonElement>(null);
  const [rotationDraft, setRotationDraft] = useState('');
  const [compactUi, setCompactUi] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = window.localStorage.getItem('toolbarCompactUi');
    if (saved == null) return true;
    return saved === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem('toolbarCompactUi', compactUi ? '1' : '0');
  }, [compactUi]);

  useEffect(() => {
    if (selectionRotationDeg == null) {
      setRotationDraft('');
      return;
    }
    const rounded = Math.round(selectionRotationDeg * 1000) / 1000;
    setRotationDraft(String(rounded));
  }, [selectionRotationDeg]);

  const commitRotationDraft = () => {
    if (selectionRotationDeg == null) return;
    const v = parseFloat(rotationDraft.replace(/,/g, '.'));
    if (Number.isFinite(v)) {
      onSelectionRotationDegCommit(v);
    } else {
      setRotationDraft(String(Math.round(selectionRotationDeg * 1000) / 1000));
    }
  };

  const stepRotationBy45 = (delta: number) => {
    if (selectionRotationDeg == null) return;
    const parsed = parseFloat(rotationDraft.replace(/,/g, '.'));
    const base = Number.isFinite(parsed) ? parsed : selectionRotationDeg;
    onSelectionRotationDegCommit(base + delta);
  };

  const fileMenuRef = useRef<HTMLDetailsElement>(null);
  const geminiMenuRef = useRef<HTMLDetailsElement>(null);

  const closeDetails = (r: React.RefObject<HTMLDetailsElement | null | undefined>) => {
    if (r.current) r.current.open = false;
  };

  const menuSummaryClass = cn(
    'flex cursor-pointer list-none items-center gap-0.5 rounded-md border border-neutral-600 bg-neutral-900 px-2 text-xs font-medium text-neutral-100 hover:bg-neutral-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shrink-0',
    '[&::-webkit-details-marker]:hidden',
    compactUi ? 'h-7' : 'h-8'
  );
  const menuPanelClass =
    'absolute left-0 top-full z-50 mt-0.5 min-w-[12.5rem] overflow-hidden rounded-md border border-neutral-700 bg-neutral-900 py-0.5 shadow-xl';
  const menuRowClass =
    'flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-neutral-100 hover:bg-neutral-800 disabled:pointer-events-none disabled:opacity-40';

  return (
    <div
      className={cn(
        'bg-neutral-800 border-b border-neutral-700 flex flex-wrap items-center content-center gap-x-2 gap-y-1 px-2 py-1.5 shrink-0 overflow-x-hidden overflow-y-hidden relative z-30',
        'max-md:flex-nowrap max-md:overflow-x-auto max-md:no-scrollbar',
        compactUi && '[&_.tb-btn]:h-7 [&_.tb-btn]:w-7 [&_.tb-input]:h-6 [&_.tb-input]:py-0 [&_.tb-group]:gap-0.5'
      )}
    >
      <div className="flex items-center gap-0.5 pr-2 border-r border-neutral-700 shrink-0 tb-group">
        <details ref={fileMenuRef} className="group relative shrink-0">
          <summary className={menuSummaryClass} title="열기·저장·크기">
            파일
            <ChevronDown size={14} className="shrink-0 opacity-70 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className={menuPanelClass} role="menu">
            <button
              type="button"
              className={menuRowClass}
              onClick={() => {
                onOpen();
                closeDetails(fileMenuRef);
              }}
            >
              <FolderOpen size={14} className="shrink-0 text-neutral-400" aria-hidden />
              열기
            </button>
            <button
              type="button"
              className={menuRowClass}
              onClick={() => {
                onNewCanvas();
                closeDetails(fileMenuRef);
              }}
            >
              <FilePlus size={14} className="shrink-0 text-neutral-400" aria-hidden />
              새 캔버스
            </button>
            <button
              type="button"
              className={menuRowClass}
              onClick={() => {
                void onPaste(undefined, true);
                closeDetails(fileMenuRef);
              }}
            >
              <ClipboardPaste size={14} className="shrink-0 text-neutral-400" aria-hidden />
              클립보드 → 새 이미지
            </button>
            <button
              type="button"
              className={menuRowClass}
              disabled={!documentHasRaster(state.layers)}
              title="저장"
              onClick={() => {
                onSave();
                closeDetails(fileMenuRef);
              }}
            >
              <Save size={14} className="shrink-0 text-neutral-400" aria-hidden />
              저장
            </button>
            <button
              type="button"
              className={menuRowClass}
              disabled={!documentHasRaster(state.layers)}
              title="다른 이름으로 저장"
              onClick={() => {
                onSaveAs();
                closeDetails(fileMenuRef);
              }}
            >
              <Download size={14} className="shrink-0 text-neutral-400" aria-hidden />
              다른 이름으로 저장
            </button>
            <button
              type="button"
              className={menuRowClass}
              disabled={!documentHasRaster(state.layers)}
              title="이미지 크기 조절"
              onClick={() => {
                onResize();
                closeDetails(fileMenuRef);
              }}
            >
              <Scale size={14} className="shrink-0 text-neutral-400" aria-hidden />
              이미지 크기
            </button>
            <button
              type="button"
              className={menuRowClass}
              disabled={!documentHasRaster(state.layers)}
              title="캔버스 크기 조절(잘라내기/확장)"
              onClick={() => {
                onCanvasSize();
                closeDetails(fileMenuRef);
              }}
            >
              <Maximize2 size={14} className="shrink-0 text-neutral-400" aria-hidden />
              캔버스 크기
            </button>
          </div>
        </details>

        <ToolbarButton
          compact={compactUi}
          onClick={onNewCanvas}
          icon={<FilePlus size={18} />}
          label="새 캔버스"
        />
        <ToolbarButton
          compact={compactUi}
          onClick={() => void onPaste(undefined, false)}
          icon={<ImagePlus size={18} strokeWidth={1.75} />}
          label="클립보드의 이미지를 현재 캔버스(활성 레이어)에 불러오기 (내부 복사·시스템 클립보드 이미지, Ctrl+V와 동일)"
        />

        <ToolbarButton
          compact={compactUi}
          onClick={onReplaceCurrentColorTransparentOnLayer}
          icon={<ImageMinus size={18} strokeWidth={1.75} />}
          label="활성 레이어 전체에서 현재 색을 투명으로 (톨러런스·알파 무시는 페인트통/배경투명 도구와 동일)"
          disabled={!documentHasRaster(state.layers) || !activeLayer?.image || activeLayer.locked}
        />
        <ToolbarButton
          compact={compactUi}
          onClick={onAutoRemoveDetectedBackgroundOnLayer}
          icon={<Sparkles size={18} strokeWidth={1.75} />}
          label="배경 자동 감지·제거: 가장자리에서 지배 색을 추정해 투명 처리 후 툴바 색을 감지 색으로 맞춤"
          disabled={!documentHasRaster(state.layers) || !activeLayer?.image || activeLayer.locked}
        />
        <ToolbarButton
          compact={compactUi}
          onClick={onBatchTransparentPngZip}
          icon={<Images size={18} strokeWidth={1.75} />}
          label="여러 이미지 일괄 투명 배경: 파일마다 가장자리 배경 자동 감지·제거(톨러런스·알파 무시는 페인트통 옵션과 동일) 후 PNG ZIP 저장"
        />
        <div className="mx-0.5 h-5 w-px bg-neutral-600 shrink-0" aria-hidden />

        <ToolbarButton
          compact={compactUi}
          onClick={() => void onCaptureSelection()}
          icon={<Frame size={18} strokeWidth={1.75} />}
          label="문서 점선 선택 영역 캡처(클립보드)"
          disabled={
            !documentHasRaster(state.layers) ||
            ((!state.selection || state.selection.width < 2 || state.selection.height < 2) &&
              (!state.selectionCircle || state.selectionCircle.r < 1))
          }
        />
        <ToolbarButton
          compact={compactUi}
          onClick={onToggleAreaCapture}
          icon={<Crop size={18} strokeWidth={1.75} />}
          label="캔버스에서 영역 드래그 캡처(클립보드)"
          disabled={!documentHasRaster(state.layers)}
          active={areaCaptureArmed}
        />
        <ToolbarButton
          compact={compactUi}
          onClick={() => void onCaptureFullDocument()}
          icon={<Monitor size={18} strokeWidth={1.75} />}
          label="문서 합성 전체를 클립보드로"
          disabled={!documentHasRaster(state.layers)}
        />

        <details ref={geminiMenuRef} className="group relative shrink-0">
          <summary className={menuSummaryClass} title="Google Gemini">
            Gemini
            <ChevronDown size={14} className="shrink-0 opacity-70 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className={menuPanelClass} role="menu">
            <button
              type="button"
              className={menuRowClass}
              disabled={!documentHasRaster(state.layers)}
              title="현재 화면을 Gemini에 보내 설명·질문"
              onClick={() => {
                onOpenGemini();
                closeDetails(geminiMenuRef);
              }}
            >
              <Sparkles size={14} className="shrink-0 text-amber-400/90" strokeWidth={1.75} aria-hidden />
              이미지 분석…
            </button>
          </div>
        </details>
      </div>

      <div className="flex items-center gap-x-0.5 px-2 border-r border-neutral-700 shrink-0 tb-group">
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('select')}
          icon={<ArrowUpRight size={18} strokeWidth={2} />}
          label="개체 선택"
          active={state.tool === 'select'}
        />
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('marquee')}
          icon={<SelectionBoxToolbarIcon size={18} />}
          label="사각 영역"
          active={state.tool === 'marquee'}
        />
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('marqueeCircle')}
          icon={<SelectionCircleToolbarIcon size={18} />}
          label="원형 영역(지름=두 클릭 간 거리)"
          active={state.tool === 'marqueeCircle'}
        />
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('magicWand')}
          icon={<Wand2 size={18} strokeWidth={1.75} />}
          label="마법 선택(드래그로 시드 이동·실제 윤곽 점선)"
          active={state.tool === 'magicWand'}
        />
        <ToolbarButton compact={compactUi} 
          onClick={() => onToolChange('freehand')} 
          icon={<Pencil size={18} />} 
          label="자유그리기" 
          active={state.tool === 'freehand'}
        />
        <ToolbarButton compact={compactUi} 
          onClick={() => onToolChange('line')} 
          icon={<Minus size={18} />} 
          label="선 그리기" 
          active={state.tool === 'line'}
        />
        <ToolbarButton compact={compactUi} 
          onClick={() => onToolChange('polyline')} 
          icon={<PolylineToolbarIcon size={18} />} 
          label="폴리라인" 
          active={state.tool === 'polyline'}
        />
        <ToolbarButton compact={compactUi} 
          onClick={() => onToolChange('rect')} 
          icon={<Square size={18} />} 
          label="사각형 그리기" 
          active={state.tool === 'rect'}
        />
        {state.tool === 'rect' && (
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[10px] text-neutral-400">R</span>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              value={state.rectRadius}
              onChange={(e) =>
                onRectRadiusChange(Math.max(0, Math.min(999, parseInt(e.target.value || '0', 10))))
              }
              className={cn('w-12 px-1 py-0.5 text-[11px] text-center', formStyles.inputBase)}
              title="직사각형 반지름(px, 위/아래 화살표로 조절)"
              aria-label="직사각형 반지름"
            />
          </div>
        )}
        <ToolbarButton compact={compactUi} 
          onClick={() => onToolChange('ellipse')} 
          icon={<Circle size={18} />} 
          label="원 그리기" 
          active={state.tool === 'ellipse'}
        />
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('arc')}
          icon={<ArcToolbarIcon size={18} />}
          label="아크(시작·끝·호 위 점)"
          active={state.tool === 'arc'}
        />
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('fill')}
          icon={<PaintBucket size={18} />}
          label="페인트통"
          active={state.tool === 'fill'}
        />
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('transparentFill')}
          icon={<ImageOff size={18} strokeWidth={1.75} />}
          label="연결 영역 투명"
          active={state.tool === 'transparentFill'}
        />
        <ToolbarButton compact={compactUi}
          onClick={() => onToolChange('eraser')}
          icon={<Eraser size={18} />}
          label="지우개"
          active={state.tool === 'eraser'}
        />
        <ToolbarButton compact={compactUi}
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
              className={cn('w-14 px-1.5 py-0.5 text-xs text-center', formStyles.inputBase)}
              title="텍스트 크기(px)"
            />
            <Button
              onClick={() => onTextStyleChange({ textBold: !state.textBold })}
              size="icon"
              variant={state.textBold ? 'primary' : 'secondary'}
              className="h-6 w-6 text-[11px] font-bold"
              title="굵게"
            >
              B
            </Button>
            <Button
              onClick={() => onTextStyleChange({ textItalic: !state.textItalic })}
              size="icon"
              variant={state.textItalic ? 'primary' : 'secondary'}
              className="h-6 w-6 text-[11px] italic"
              title="기울임"
            >
              I
            </Button>
            <Button
              onClick={() => onTextStyleChange({ textUnderline: !state.textUnderline })}
              size="icon"
              variant={state.textUnderline ? 'primary' : 'secondary'}
              className="h-6 w-6 text-[11px] underline"
              title="밑줄"
            >
              U
            </Button>
          </div>
        )}
        {(state.tool === 'fill' || state.tool === 'transparentFill' || state.tool === 'magicWand') && (
          <div
            className="flex items-center gap-2 ml-0.5 px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-900 shrink-0"
            role="group"
            aria-label={
              state.tool === 'fill'
                ? '페인트통 옵션'
                : state.tool === 'transparentFill'
                  ? '배경 투명 옵션'
                  : '마법 선택 옵션 (좌클릭 유지 후 드래그로 시드 이동)'
            }
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
                className={cn('w-20 bg-neutral-700', formStyles.sliderBase)}
                title="색 일치 허용 오차 (페인트통·연결 영역 투명·레이어 전역 투명·마법 선택에 공통)"
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
            {state.tool === 'magicWand' && (
              <div className="flex items-center gap-1.5 border-l border-neutral-600 pl-2">
                <span id="magic-edge-label" className="text-[10px] text-neutral-400 whitespace-nowrap">
                  에지
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={state.magicWandEdgeLimit}
                  onChange={(e) => onMagicWandEdgeLimitChange(parseInt(e.target.value, 10))}
                  className={cn('w-20 bg-neutral-700', formStyles.sliderBase)}
                  title="높을수록 약한 경계에서도 확장을 멈춤 (Sobel 에지 강도 기준)"
                  aria-labelledby="magic-edge-label"
                  aria-valuenow={state.magicWandEdgeLimit}
                />
                <span className="text-[10px] text-neutral-400 w-6 tabular-nums text-right" aria-hidden>
                  {state.magicWandEdgeLimit}
                </span>
              </div>
            )}
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
        {state.tool === 'eraser' && (
          <div className="flex items-center gap-1 ml-0.5 px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-900 shrink-0">
            <span className="text-[10px] text-neutral-400 whitespace-nowrap">지우개 크기</span>
            <input
              type="number"
              min={2}
              max={200}
              step={1}
              value={state.eraserSize}
              onChange={(e) => onEraserSizeChange(parseInt(e.target.value || '24', 10))}
              className={cn('w-14 px-1.5 py-0.5 text-xs text-center', formStyles.inputBase)}
              title="지우개 크기(px)"
            />
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
            <span className="text-[10px] text-neutral-300">선</span>
            <input
              type="number"
              min="1"
              max="50"
              step="1"
              value={state.lineWidth}
              onChange={(e) => onLineWidthChange(Math.max(1, Math.min(50, parseInt(e.target.value || '1', 10))))}
              className={cn('w-14 px-1.5 py-0.5 text-xs text-center', formStyles.inputBase)}
              title="선두께 (위/아래 화살표로 조절)"
            />
            <select
              value={state.lineStyle}
              onChange={(e) => onLineStyleChange(e.target.value as LineStyle)}
              className={cn('w-20 px-1 py-0.5 text-xs text-center', formStyles.selectBase)}
              title="선 종류"
            >
              <option value="solid">실선</option>
              <option value="dashed">점선</option>
              <option value="dotted">점점선</option>
              <option value="dashDot">일점쇄선</option>
            </select>
          </div>
          <ToolbarButton compact={compactUi} 
            onClick={onDeleteLastShape} 
            icon={<Undo2 size={18} />} 
            label="Undo" 
            disabled={!canUndoLast}
            shortcut="Ctrl+Z"
          />
          <ToolbarButton compact={compactUi}
            onClick={onRedoLastShape}
            icon={<Redo2 size={18} />}
            label="Redo"
            disabled={!canRedoLast}
          />
          <ToolbarButton compact={compactUi} 
            onClick={onClearShapes} 
            icon={<Trash2 size={18} />} 
            label="도형 삭제" 
            disabled={totalShapeCount(state.layers) === 0}
          />
        </div>
        <div className="flex items-center gap-0.5 ml-1 px-1 border-l border-neutral-700">
          <ToolbarButton compact={compactUi}
            onClick={onTransformScaleDown}
            icon={<ZoomOut size={18} />}
            label="선택 90%"
            disabled={!canTransformSelection}
          />
          <ToolbarButton compact={compactUi}
            onClick={onTransformScaleUp}
            icon={<ZoomIn size={18} />}
            label="선택 110%"
            disabled={!canTransformSelection}
          />
          <ToolbarButton compact={compactUi}
            onClick={onTransformRotateLeft}
            icon={<RotateCcw size={18} />}
            label="회전 −15°"
            disabled={!canTransformSelection}
          />
          <ToolbarButton compact={compactUi}
            onClick={onTransformRotateRight}
            icon={<RotateCw size={18} />}
            label="회전 +15°"
            disabled={!canTransformSelection}
          />
          {selectionRotationDeg != null && (
            <div
              className="flex items-center gap-0.5 ml-0.5 px-1.5 py-0.5 rounded-md border border-neutral-700 bg-neutral-900 shrink-0"
              title="절대 각도(도). Enter 또는 포커스 해제로 적용. 화살표는 45°씩 조절"
            >
              <span className="text-[10px] text-neutral-400 whitespace-nowrap pr-0.5">각도 °</span>
              <Button
                onClick={() => stepRotationBy45(-45)}
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="45° 감소"
                aria-label="회전 각도 45도 감소"
              >
                <ArrowLeft size={20} strokeWidth={2.5} className="shrink-0" aria-hidden />
              </Button>
              <input
                type="text"
                inputMode="decimal"
                value={rotationDraft}
                onChange={(e) => setRotationDraft(e.target.value)}
                onBlur={() => commitRotationDraft()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRotationDraft();
                    (e.target as HTMLInputElement).blur();
                  }
                }}
                className={cn('w-14 px-1 py-0.5 text-xs text-center tabular-nums', formStyles.inputBase)}
                aria-label="선택 개체 회전 각도(도)"
              />
              <Button
                onClick={() => stepRotationBy45(45)}
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="45° 증가"
                aria-label="회전 각도 45도 증가"
              >
                <ArrowRight size={20} strokeWidth={2.5} className="shrink-0" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-2 border-r border-neutral-700 tb-group shrink-0">
        <div className="flex items-center gap-0.5 tb-group">
          <ToolbarButton compact={compactUi} onClick={onZoomOut} icon={<ZoomOut size={18} />} label="축소" />
          <input 
            type="range" 
            min="0.01" 
            max="8" 
            step="0.01" 
            value={state.zoom} 
            onChange={(e) => onZoomChange(parseFloat(e.target.value))}
            className={cn('w-16 bg-neutral-700', formStyles.sliderBase)}
          />
          <ToolbarButton compact={compactUi} onClick={onZoomIn} icon={<ZoomIn size={18} />} label="확대" />
        </div>
        
        <div className="flex items-center gap-2">
          <input 
            type="number" 
            min="1" 
            max="800" 
            value={Math.round(state.zoom * 100)} 
            onChange={(e) => onZoomChange(parseInt(e.target.value) / 100)}
            className={cn('tb-input w-16 px-2 py-1 text-xs text-center', formStyles.inputBase)}
          />
          <span className="text-xs text-neutral-500">%</span>
        </div>

        <ToolbarButton compact={compactUi} onClick={onResetZoom} icon={<Maximize size={18} />} label="원본크기" />
        <Button
          size="sm"
          variant={compactUi ? 'primary' : 'secondary'}
          className="h-7 px-2 text-[10px]"
          onClick={() => setCompactUi(v => !v)}
          title="툴바 밀도 전환"
        >
          밀도
        </Button>
      </div>

      <div className="flex items-center gap-x-1 border-l border-neutral-700 pl-2 shrink-0 tb-group">
        <div className="flex items-center gap-0.5 shrink-0">
          <ToolbarButton compact={compactUi} 
            onClick={onCopy} 
            icon={<Copy size={18} />} 
            label="복사" 
            disabled={
              !state.selection &&
              !state.selectionCircle &&
              state.selectedShapeIds.length === 0 &&
              !state.selectedRasterLayerId
            }
            shortcut="Ctrl+C"
          />
          <ToolbarButton compact={compactUi} 
            onClick={onCut} 
            icon={<Scissors size={18} />} 
            label="잘라내기" 
            disabled={!state.selection && !state.selectionCircle}
            shortcut="Ctrl+X"
          />
          <ToolbarButton compact={compactUi} 
            onClick={onPaste} 
            icon={<ClipboardPaste size={18} />} 
            label="붙여넣기" 
            shortcut="Ctrl+V"
          />
        </div>
      </div>

      <div className="flex items-center gap-0.5 border-l border-neutral-700 pl-2 shrink-0 tb-group">
        <Button
          ref={advancedColorAnchorRef}
          onClick={() => setAdvancedColorOpen(true)}
          variant="secondary"
          size="icon"
          className="relative h-6 w-6 overflow-hidden border-neutral-500 p-0"
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
        </Button>
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
          className={cn('w-24 h-6 px-1 text-[15px] leading-none select-text cursor-text', formStyles.inputBase, formStyles.inputMono)}
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
  );
};

interface ToolbarButtonProps {
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  shortcut?: string;
  active?: boolean;
  compact?: boolean;
}

const ToolbarButton: React.FC<ToolbarButtonProps> = ({ onClick, icon, label, disabled, shortcut, active, compact = false }) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    title={shortcut ? `${label} (${shortcut})` : label}
    variant={active ? 'primary' : 'ghost'}
    size="icon"
    className={cn('tb-btn', compact ? 'h-7 w-7' : 'h-8 w-8')}
  >
    {icon}
  </Button>
);
