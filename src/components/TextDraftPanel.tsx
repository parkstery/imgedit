import React, { useCallback, useLayoutEffect, useRef } from 'react';
import { EditorState, Shape } from '../types';
import { getActiveLayer, mapLayersReplaceActiveShapes } from '../lib/layers';
import { CANVAS_TEXT_FONT_STACK } from '../lib/drawShapes';

interface TextDraftPanelProps {
  state: EditorState;
  setState: React.Dispatch<React.SetStateAction<EditorState>>;
  onTextCommitted: () => void;
}

export const TextDraftPanel: React.FC<TextDraftPanelProps> = ({
  state,
  setState,
  onTextCommitted,
}) => {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const d = state.textDraft;

  const commit = useCallback(() => {
    setState(prev => {
      const draft = prev.textDraft;
      if (!draft || !draft.text.trim()) return { ...prev, textDraft: null };
      const shape: Shape = {
        id: draft.id,
        type: 'text',
        x1: draft.x,
        y1: draft.y,
        x2: draft.x,
        y2: draft.y,
        color: draft.color,
        lineWidth: 0,
        lineStyle: 'solid',
        text: draft.text.trim(),
        fontSize: draft.fontSize,
        bold: draft.bold,
        italic: draft.italic,
        underline: draft.underline,
      };
      const al = getActiveLayer(prev.layers, prev.activeLayerId);
      if (!al || al.locked) return { ...prev, textDraft: null };
      return {
        ...prev,
        layers: mapLayersReplaceActiveShapes(prev.layers, prev.activeLayerId, [...al.shapes, shape]),
        textDraft: null,
      };
    });
    queueMicrotask(onTextCommitted);
  }, [setState, onTextCommitted]);

  const cancel = useCallback(() => {
    setState(prev => ({ ...prev, textDraft: null }));
  }, [setState]);

  useLayoutEffect(() => {
    if (state.tool !== 'text' || !d) return;
    const el = inputRef.current;
    if (!el) return;
    const opts: FocusOptions = { preventScroll: true };
    const run = () => el.focus(opts);
    run();
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      run();
      raf2 = requestAnimationFrame(run);
    });
    const t = window.setTimeout(run, 0);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(t);
    };
  }, [state.tool, d?.id, d?.x, d?.y]);

  if (state.tool !== 'text' || !d) return null;

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/95 px-3 py-2.5 flex flex-col gap-2 sm:flex-row sm:gap-3 sm:items-center">
      <div className="flex flex-col gap-0.5 shrink-0 sm:w-44 min-w-0">
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
          텍스트 입력
        </span>
        <span className="text-xs text-neutral-500 truncate" title="캔버스를 다시 클릭하면 위치만 바뀝니다">
          배치 위치: {Math.round(d.x)}, {Math.round(d.y)} (이미지 좌표)
        </span>
      </div>
      <div className="flex-1 min-w-0 w-full min-h-[2.75rem] flex items-center">
        <textarea
          ref={inputRef}
          id="text-draft-input"
          autoFocus
          dir="ltr"
          value={d.text}
          onChange={e =>
            setState(prev =>
              prev.textDraft
                ? { ...prev, textDraft: { ...prev.textDraft, text: e.target.value } }
                : prev
            )
          }
          onKeyDown={e => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
              return;
            }
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
          }}
          spellCheck={false}
          lang="ko"
          rows={3}
          placeholder="여기에 여러 줄 입력 (Ctrl+Enter로 확정)"
          className="box-border w-full min-w-0 rounded border border-neutral-700 bg-neutral-950 px-2.5 py-2 text-sm text-left outline-none resize-y focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/25 sm:min-w-[14rem]"
          style={{
            fontFamily: CANVAS_TEXT_FONT_STACK,
            color: d.color,
            fontWeight: d.bold ? 700 : 400,
            fontStyle: d.italic ? 'italic' : 'normal',
            textDecoration: d.underline ? 'underline' : 'none',
          }}
        />
      </div>
      <div className="flex items-center gap-2 shrink-0 self-stretch sm:self-center">
        <button
          type="button"
          onClick={commit}
          className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500"
        >
          확인
        </button>
        <button
          type="button"
          onClick={cancel}
          className="rounded border border-neutral-600 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800"
        >
          취소
        </button>
        <span className="hidden lg:inline text-[10px] text-neutral-500 max-w-[200px]">
          Enter 줄바꿈 · Ctrl+Enter 확정 · Esc 취소
        </span>
      </div>
    </div>
  );
};
