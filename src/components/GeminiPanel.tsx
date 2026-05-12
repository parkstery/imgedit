import React, { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Sparkles, MessageSquare, Wand2 } from 'lucide-react';
import type { EditorLayer } from '../types';
import { createCompositeCanvas } from '../lib/documentCapture';
import { getActiveLayer } from '../lib/layers';
import { canvasToGeminiImagePart, geminiGenerate } from '../lib/geminiClient';
import { parseGeminiBackgroundAdvice, type GeminiBackgroundAdvice } from '../lib/geminiBackgroundAdvice';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import { formStyles } from './ui/formStyles';

type Scope = 'document' | 'activeRaster';

const GEMINI_BG_JSON_PROMPT = `당신은 사진 편집 도우미입니다. 첨부 이미지는 편집기의 **활성 레이어 비트맵**입니다. 이 레이어에서 "배경을 투명하게" 만들기 위한 파라미터만 추천하세요.

편집기는 두 가지 방식을 지원합니다.
(1) border_histogram: 가장자리 띠에서 가장 흔한 색을 배경으로 추정한 뒤, 그 색과 비슷한 픽셀을 전역으로 투명 처리합니다. 배경이 화면 가장자리에 잘 드러나고 단색·근단색일 때 적합합니다.
(2) key_color: 지정한 RGB(#RRGGBB)와 비슷한 **모든** 픽셀을 한 번에 투명 처리합니다. 피사체가 프레임 끝까지 닿거나, 가장자리 색이 복잡·그라데이션일 때 배경 대표 색을 직접 지정할 때 적합합니다.

응답은 **설명 문장 없이** JSON 객체 **하나만** 출력하세요(앞뒤에 백틱이나 마크다운 금지). 키 이름은 정확히 다음과 같아야 합니다:
{"method":"border_histogram" 또는 "key_color","backgroundHex":"#RRGGBB 또는 null","tolerance":0~100 사이 정수,"ignoreAlpha":true 또는 false,"rationaleKo":"한국어 한 문장"}

규칙:
- border_histogram이면 backgroundHex는 반드시 null.
- key_color이면 backgroundHex에 제거할 배경의 대표 색(#RRGGBB)을 넣으세요.
- tolerance: JPEG 압축·노이즈·경계 번짐이 크면 45~90, 깨끗한 PNG·단색 경계면 10~40 정도.
- 머리카락·모피·안티앨리어싱 경계가 배경과 섞이면 ignoreAlpha를 true.
- rationaleKo에는 왜 그 방법·수치를 골랐는지 한 문장만 적으세요.`;

interface GeminiPanelProps {
  isOpen: boolean;
  onClose: () => void;
  layers: EditorLayer[];
  activeLayerId: string;
  onApplyGeminiFillPrefs: (next: {
    fillTolerance: number;
    fillIgnoreAlpha: boolean;
    colorHex?: string;
  }) => void;
  onRunGeminiBackgroundRemoval: (advice: GeminiBackgroundAdvice) => void;
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

export const GeminiPanel: React.FC<GeminiPanelProps> = ({
  isOpen,
  onClose,
  layers,
  activeLayerId,
  onApplyGeminiFillPrefs,
  onRunGeminiBackgroundRemoval,
}) => {
  const [scope, setScope] = useState<Scope>('document');
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [smartAdvice, setSmartAdvice] = useState<GeminiBackgroundAdvice | null>(null);
  const [smartRaw, setSmartRaw] = useState('');
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError, setSmartError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSmartAdvice(null);
      setSmartRaw('');
      setSmartError(null);
    }
  }, [isOpen]);

  const activeLayer = getActiveLayer(layers, activeLayerId);
  const activeHasRaster = Boolean(activeLayer?.image);
  const activeLocked = Boolean(activeLayer?.locked);

  const handleSmartBgAnalyze = async () => {
    setSmartError(null);
    setSmartLoading(true);
    setSmartAdvice(null);
    setSmartRaw('');
    try {
      if (!activeLayer?.image) {
        throw new Error('활성 레이어에 이미지가 없습니다.');
      }
      if (activeLayer.locked) {
        throw new Error('활성 레이어가 잠겨 있습니다. 잠금을 해제한 뒤 다시 시도하세요.');
      }
      const c = rasterOnlyCanvas(activeLayer);
      if (!c) throw new Error('레이어 이미지를 읽을 수 없습니다.');
      const imagePart = canvasToGeminiImagePart(c);
      const raw = await geminiGenerate([{ type: 'text', text: GEMINI_BG_JSON_PROMPT }, imagePart]);
      setSmartRaw(raw);
      const parsed = parseGeminiBackgroundAdvice(raw);
      if (!parsed) {
        throw new Error('모델 응답에서 JSON을 해석하지 못했습니다. 아래 원문을 확인하세요.');
      }
      setSmartAdvice(parsed);
    } catch (e) {
      setSmartError(e instanceof Error ? e.message : String(e));
    } finally {
      setSmartLoading(false);
    }
  };

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
            className="relative flex max-h-[min(92vh,880px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-neutral-700 bg-neutral-800 shadow-2xl"
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

              <div className="space-y-3 rounded-xl border border-violet-500/35 bg-violet-950/20 p-4">
                <div className="flex items-center gap-2">
                  <Wand2 size={16} className="text-violet-300 shrink-0" aria-hidden />
                  <span className="text-xs font-medium uppercase tracking-wider text-violet-200/90">
                    스마트 배경 제거 (Gemini)
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-neutral-400">
                  활성 레이어 비트맵만 Gemini에 보냅니다. 모델이 가장자리 추정(
                  <code className="text-neutral-300">border_histogram</code>) 또는 대표 배경색(
                  <code className="text-neutral-300">key_color</code>)·톨러런스·알파 무시를 JSON으로 제안하면, 툴바
                  옵션에 반영하거나 바로 투명 처리합니다.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => void handleSmartBgAnalyze()}
                  disabled={smartLoading || !activeHasRaster || activeLocked || loading}
                  className="gap-1.5"
                >
                  <Wand2 size={14} aria-hidden />
                  Gemini로 배경 분석
                </Button>
                {smartLoading && <p className="text-sm text-neutral-400">배경 파라미터 분석 중…</p>}
                {smartError && (
                  <div className="space-y-2">
                    <p className="rounded-lg border border-red-900/50 bg-red-950/40 px-3 py-2 text-sm text-red-200">
                      {smartError}
                    </p>
                    {smartRaw ? (
                      <div className="max-h-32 overflow-y-auto whitespace-pre-wrap rounded-lg border border-neutral-600 bg-neutral-900/80 p-2 font-mono text-[11px] text-neutral-400">
                        {smartRaw}
                      </div>
                    ) : null}
                  </div>
                )}
                {smartAdvice && (
                  <div className="space-y-3 rounded-lg border border-neutral-600 bg-neutral-900/60 p-3">
                    {smartAdvice.rationaleKo ? (
                      <p className="text-sm text-neutral-200">{smartAdvice.rationaleKo}</p>
                    ) : null}
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-neutral-300">
                      <dt className="text-neutral-500">방식</dt>
                      <dd className="font-mono text-neutral-100">
                        {smartAdvice.method === 'border_histogram' ? '가장자리 추정' : '대표 색 키'}
                      </dd>
                      <dt className="text-neutral-500">배경 HEX</dt>
                      <dd className="font-mono text-neutral-100">
                        {smartAdvice.backgroundHex ?? '— (가장자리 추정 시 없음)'}
                      </dd>
                      <dt className="text-neutral-500">톨러런스</dt>
                      <dd>{smartAdvice.tolerance}</dd>
                      <dt className="text-neutral-500">알파 무시</dt>
                      <dd>{smartAdvice.ignoreAlpha ? '예' : '아니오'}</dd>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() =>
                          onApplyGeminiFillPrefs({
                            fillTolerance: smartAdvice.tolerance,
                            fillIgnoreAlpha: smartAdvice.ignoreAlpha,
                            ...(smartAdvice.method === 'key_color' && smartAdvice.backgroundHex
                              ? { colorHex: smartAdvice.backgroundHex }
                              : {}),
                          })
                        }
                      >
                        툴바 설정만 반영
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => onRunGeminiBackgroundRemoval(smartAdvice)}
                        className="gap-1"
                      >
                        분석대로 배경 제거 실행
                      </Button>
                    </div>
                  </div>
                )}
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
