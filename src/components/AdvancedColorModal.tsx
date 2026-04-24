import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Pipette, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface AdvancedColorModalProps {
  isOpen: boolean;
  /** 현재 앱 색상 (모달이 열릴 때 동기화) */
  color: string;
  onColorChange: (hex: string) => void;
  onRequestClose: () => void;
}

function normalizeHex(input: string): string | null {
  let h = input.trim().toLowerCase();
  if (!h.startsWith('#')) h = `#${h}`;
  if (/^#[0-9a-f]{3}$/.test(h)) {
    h = `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`;
  }
  if (!/^#[0-9a-f]{6}$/.test(h)) return null;
  return h;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function rgbToHsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb(h: number, s: number, v: number): { r: number; g: number; b: number } {
  const hh = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = v - c;
  let rp = 0;
  let gp = 0;
  let bp = 0;
  if (hh < 60) {
    rp = c;
    gp = x;
  } else if (hh < 120) {
    rp = x;
    gp = c;
  } else if (hh < 180) {
    gp = c;
    bp = x;
  } else if (hh < 240) {
    gp = x;
    bp = c;
  } else if (hh < 300) {
    rp = x;
    bp = c;
  } else {
    rp = c;
    bp = x;
  }
  return {
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  };
}

function hsvToHex(h: number, s: number, v: number): string {
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

const SV_W = 220;
const SV_H = 160;

export const AdvancedColorModal: React.FC<AdvancedColorModalProps> = ({
  isOpen,
  color,
  onColorChange,
  onRequestClose,
}) => {
  const [h, setH] = useState(0);
  const [s, setS] = useState(1);
  const [v, setV] = useState(1);
  const [hexInput, setHexInput] = useState('#ffffff');
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const svDraggingRef = useRef(false);
  const [eyedropperBusy, setEyedropperBusy] = useState(false);

  const applyHsv = useCallback(
    (nh: number, ns: number, nv: number) => {
      const hh = ((nh % 360) + 360) % 360;
      const ss = Math.max(0, Math.min(1, ns));
      const vv = Math.max(0, Math.min(1, nv));
      setH(hh);
      setS(ss);
      setV(vv);
      const hex = hsvToHex(hh, ss, vv);
      setHexInput(hex);
      onColorChange(hex);
    },
    [onColorChange]
  );

  useLayoutEffect(() => {
    if (!isOpen) return;
    const rgb = hexToRgb(color);
    if (!rgb) return;
    const { h: nh, s: ns, v: nv } = rgbToHsv(rgb.r, rgb.g, rgb.b);
    setH(nh);
    setS(ns);
    setV(nv);
    const hex = normalizeHex(color) ?? hsvToHex(nh, ns, nv);
    setHexInput(hex);
  }, [isOpen, color]);

  const redrawSvCanvas = useCallback((hueOverride?: number) => {
    const canvas = svCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const hh = (((hueOverride ?? h) % 360) + 360) % 360;
    const img = ctx.createImageData(SV_W, SV_H);
    const d = img.data;
    for (let py = 0; py < SV_H; py++) {
      const vv = 1 - py / (SV_H - 1 || 1);
      for (let px = 0; px < SV_W; px++) {
        const ss = px / (SV_W - 1 || 1);
        const { r, g, b } = hsvToRgb(hh, ss, vv);
        const i = (py * SV_W + px) * 4;
        d[i] = r;
        d[i + 1] = g;
        d[i + 2] = b;
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [h]);

  const prevOpenRef = useRef(false);

  useLayoutEffect(() => {
    if (!isOpen) {
      prevOpenRef.current = false;
      return;
    }
    if (!prevOpenRef.current) {
      prevOpenRef.current = true;
      const rgb = hexToRgb(color);
      if (rgb) {
        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        setH(hsv.h);
        setS(hsv.s);
        setV(hsv.v);
        setHexInput(normalizeHex(color) ?? hsvToHex(hsv.h, hsv.s, hsv.v));
        redrawSvCanvas(hsv.h);
        return;
      }
    }
    redrawSvCanvas();
  }, [isOpen, h, color, redrawSvCanvas]);

  const pickSvFromClient = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = svCanvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const px = Math.max(0, Math.min(SV_W - 1, Math.floor(((clientX - r.left) / r.width) * SV_W)));
      const py = Math.max(0, Math.min(SV_H - 1, Math.floor(((clientY - r.top) / r.height) * SV_H)));
      const ns = px / (SV_W - 1 || 1);
      const nv = 1 - py / (SV_H - 1 || 1);
      applyHsv(h, ns, nv);
    },
    [h, applyHsv]
  );

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onRequestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onRequestClose]);

  const eyeDropperSupported =
    typeof window !== 'undefined' &&
    typeof (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper ===
      'function';

  const runEyedropper = async () => {
    if (!eyeDropperSupported) return;
    const EyeCtor = (window as unknown as { EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> } })
      .EyeDropper;
    setEyedropperBusy(true);
    try {
      const eye = new EyeCtor();
      const result = await eye.open();
      const hex = normalizeHex(result.sRGBHex);
      if (hex) {
        const rgb = hexToRgb(hex);
        if (rgb) {
          const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
          setH(hsv.h);
          setS(hsv.s);
          setV(hsv.v);
          setHexInput(hex);
          onColorChange(hex);
        }
      }
    } catch {
      /* 사용자 취소 등 — 모달은 열린 채 유지 */
    } finally {
      setEyedropperBusy(false);
    }
  };

  const markerLeft = `${(s * 100).toFixed(2)}%`;
  const markerTop = `${((1 - v) * 100).toFixed(2)}%`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="advanced-color-title"
            className="relative w-full max-w-sm rounded-xl border border-neutral-700 bg-neutral-800 shadow-2xl"
            onMouseDown={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-neutral-700 px-4 py-3">
              <h2 id="advanced-color-title" className="text-sm font-semibold text-neutral-100">
                고급 색상 선택
              </h2>
              <button
                type="button"
                onClick={onRequestClose}
                className="flex items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <X size={14} className="shrink-0 opacity-80" aria-hidden />
                닫기
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="relative rounded-md overflow-hidden border border-neutral-600 touch-none">
                <canvas
                  ref={svCanvasRef}
                  width={SV_W}
                  height={SV_H}
                  className="block w-full h-auto cursor-crosshair"
                  onMouseDown={e => {
                    e.preventDefault();
                    svDraggingRef.current = true;
                    pickSvFromClient(e.clientX, e.clientY);
                  }}
                  onMouseMove={e => {
                    if (!svDraggingRef.current) return;
                    pickSvFromClient(e.clientX, e.clientY);
                  }}
                  onMouseUp={() => {
                    svDraggingRef.current = false;
                  }}
                  onMouseLeave={() => {
                    svDraggingRef.current = false;
                  }}
                />
                <div
                  className="pointer-events-none absolute w-3 h-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/40"
                  style={{ left: markerLeft, top: markerTop }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-neutral-400" htmlFor="adv-color-hue">
                  색상(H)
                </label>
                <input
                  id="adv-color-hue"
                  type="range"
                  min={0}
                  max={360}
                  step={1}
                  value={Math.round(((h % 360) + 360) % 360)}
                  onChange={e => applyHsv(parseInt(e.target.value, 10), s, v)}
                  className="w-full h-2 rounded-lg accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-neutral-400 shrink-0" htmlFor="adv-color-hex">
                  HEX
                </label>
                <input
                  id="adv-color-hex"
                  type="text"
                  value={hexInput}
                  onChange={e => {
                    const raw = e.target.value;
                    setHexInput(raw);
                    const n = normalizeHex(raw);
                    if (n) {
                      const rgb = hexToRgb(n);
                      if (rgb) {
                        const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
                        setH(hsv.h);
                        setS(hsv.s);
                        setV(hsv.v);
                        onColorChange(n);
                      }
                    }
                  }}
                  onBlur={() => {
                    const n = normalizeHex(hexInput);
                    if (n) setHexInput(n);
                    else {
                      setHexInput(hsvToHex(h, s, v));
                    }
                  }}
                  spellCheck={false}
                  className="flex-1 min-w-[7rem] rounded border border-neutral-600 bg-neutral-900 px-2 py-1.5 font-mono text-sm text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                {eyeDropperSupported ? (
                  <button
                    type="button"
                    disabled={eyedropperBusy}
                    onClick={() => void runEyedropper()}
                    title="화면에서 색 추출 (선택 후에도 이 창은 열려 있습니다)"
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-md border border-neutral-600 bg-neutral-900 px-2.5 py-1.5 text-xs font-medium text-neutral-200',
                      'hover:bg-neutral-700 hover:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500',
                      'disabled:opacity-50 disabled:pointer-events-none'
                    )}
                  >
                    <Pipette size={16} className="shrink-0" aria-hidden />
                    스포이드
                  </button>
                ) : (
                  <span className="text-[10px] text-neutral-500">스포이드는 Chrome·Edge 등에서 지원됩니다.</span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div
                  className="h-9 w-14 shrink-0 rounded border border-neutral-600 shadow-inner"
                  style={{ backgroundColor: hsvToHex(h, s, v) }}
                  title="미리보기"
                />
                <p className="text-[11px] text-neutral-500 leading-snug">
                  스포이드로 색을 고른 뒤에도 창이 닫히지 않습니다. 작업을 마치면 상단의 닫기를 누르세요.
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
