import React, { useCallback, useEffect, useRef } from 'react';
import { EditorState, Shape } from '../types';
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
  const inputRef = useRef<HTMLInputElement>(null);
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
        text: draft.text.trim(),
        fontSize: draft.fontSize,
      };
      return {
        ...prev,
        shapes: [...prev.shapes, shape],
        textDraft: null,
        shapeLayerVisible: true,
      };
    });
    queueMicrotask(onTextCommitted);
  }, [setState, onTextCommitted]);

  const cancel = useCallback(() => {
    setState(prev => ({ ...prev, textDraft: null }));
  }, [setState]);

  useEffect(() => {
    if (state.tool === 'text' && d) {
      inputRef.current?.focus();
    }
  }, [state.tool, d?.id, d?.x, d?.y]);

  if (state.tool !== 'text' || !d) return null;

  return (
    <div className="shrink-0 border-t border-neutral-800 bg-neutral-900/95 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
      <div className="flex flex-col gap-0.5 min-w-0 sm:w-44 shrink-0">
        <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wide">
          텍스트 입력
        </span>
        <span className="text-xs text-neutral-500 truncate" title="캔버스를 다시 클릭하면 위치만 바뀝니다">
          배치 위치: {Math.round(d.x)}, {Math.round(d.y)} (이미지 좌표)
        </span>
      </div>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
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
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        spellCheck={false}
        lang="ko"
        placeholder="여기에 입력 후 확인 또는 Enter"
        className="flex-1 min-w-0 rounded border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm outline-none focus:border-blue-500/70 focus:ring-1 focus:ring-blue-500/25"
        style={{ fontFamily: CANVAS_TEXT_FONT_STACK, color: d.color }}
      />
      <div className="flex items-center gap-2 shrink-0">
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
          Enter · Ctrl+Enter 확정 · Esc 취소
        </span>
      </div>
    </div>
  );
};
