import React, { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Sparkles, MessageSquare } from 'lucide-react';
import type { EditorLayer } from '../types';
import { createCompositeCanvas } from '../lib/documentCapture';
import { getActiveLayer } from '../lib/layers';
import { canvasToGeminiImagePart, geminiGenerate } from '../lib/geminiClient';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { formStyles } from './ui/formStyles';

type Scope = 'document' | 'activeRaster';

interface GeminiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  layers: EditorLayer[];
  activeLayerId: string;
}

function rasterOnlyCanvas(layer: EditorLayer): HTMLCanvasElement | null {
  if (!layer.image) return null;
  const img = layer.image;
  const c = document.createElement('canvas');
  c.width = Math.max(1, img.naturalWidth || img.width);
  c.height = Math.max(1, img.naturalHeight || img.height);
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  return c;
}

export const GeminiPanel: React.FC<GeminiPanelProps> = ({ isOpen, onClose, layers, activeLayerId }) => {
  const [scope, setScope] = useState<Scope>('document');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildImagePart = useCallback(() => {
    if (scope === 'document') {
      const full = createCompositeCanvas(layers);
      if (!full) throw new Error('문서를 이미지로 만들 수 없습니다.');
      return canvasToGeminiImagePart(full);
    }
    const layer = getActiveLayer(layers, activeLayerId);
    if (!layer?.image) throw new Error('활성 레이어에 이미지가 없습니다.');
    const c = rasterOnlyCanvas(layer);
    if (!c) throw new Error('레이어 이미지를 읽을 수 없습니다.');
    return canvasToGeminiImagePart(c);
  }, [scope, layers, activeLayerId]);

  const handleDescribe = async () => {
    setError(null);
    setLoading(true);
    setResult('');
    try {
      const imagePart = buildImagePart();
      const text = await geminiGenerate([
        {
          type: 'text',
          text:
            '이 이미지는 이미지 편집기에서 연 화면입니다. 한국어로 간결하게 설명해 주세요. 주요 피사체, 배경, 대략적인 색 조화, 텍스트나 도형이 있으면 그것도 언급해 주세요.',
        },
        imagePart,
      ]);
      setResult(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = async () => {
    const q = question.trim();
    if (!q) {
      setError('질문을 입력해 주세요.');
      return;
    }
    setError(null);
    setLoading(true);
    setResult('');
    try {
      const imagePart = buildImagePart();
      const text = await geminiGenerate([
        {
          type: 'text',
          text: `다음 이미지를 보고 사용자 질문에 한국어로 답해 주세요.\n\n질문: ${q}`,
        },
        imagePart,
      ]);
      setResult(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const activeHasRaster = Boolean(getActiveLayer(layers, activeLayerId)?.image);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-800 shadow-2xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-neutral-700 px-5 py-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-amber-400" aria-hidden />
                <h2 className="text-base font-semibold text-neutral-100">Gemini 이미지 분석</h2>
              </div>
              <Button onClick={onClose} variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full">
                <X size={20} className="text-neutral-400" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
              <div className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">분석 대상</span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setScope('document')}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                      scope === 'document'
                        ? 'border-amber-500/60 bg-amber-950/40 text-amber-100'
                        : 'border-neutral-600 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                    )}
                  >
                    전체 문서 합성
                  </button>
                  <button
                    type="button"
                    disabled={!activeHasRaster}
                    onClick={() => setScope('activeRaster')}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      scope === 'activeRaster'
                        ? 'border-amber-500/60 bg-amber-950/40 text-amber-100'
                        : 'border-neutral-600 bg-neutral-900 text-neutral-300 hover:bg-neutral-800'
                    )}
                  >
                    활성 레이어 이미지
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => void handleDescribe()} disabled={loading} className="gap-1.5">
                  <Sparkles size={14} aria-hidden />
                  자동 설명
                </Button>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-neutral-400">
                  <MessageSquare size={12} aria-hidden />
                  질문
                </label>
                <textarea
                  value={question}
                  onChange={e => setQuestion(e.target.value)}
                  rows={3}
                  placeholder="예: 배경을 단순하게 바꾸려면 어떻게 하면 좋을까?"
                  className={cn('w-full resize-y rounded-lg px-3 py-2 text-sm', formStyles.inputBase)}
                />
                <Button type="button" variant="secondary" onClick={() => void handleAsk()} disabled={loading}>
                  질문 보내기
                </Button>
              </div>

              {error && (
                <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                  {error}
                </p>
              )}

              {loading && <p className="text-sm text-neutral-400">Gemini에 요청 중…</p>}

              {result && (
                <div className="space-y-1">
                  <span className="text-xs font-medium uppercase tracking-wider text-neutral-400">응답</span>
                  <div className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-600 bg-neutral-900/80 p-3 text-sm text-neutral-100">
                    {result}
                  </div>
                </div>
              )}

              <p className="text-xs leading-relaxed text-neutral-500">
                API 키는 서버(개발/프리뷰)에서만 사용됩니다. 정적 배포만으로는 동작하지 않으며, 키는{' '}
                <code className="text-neutral-400">.env.local</code>의 GEMINI_API_KEY에 넣고 서버를 다시 시작하세요.
              </p>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
