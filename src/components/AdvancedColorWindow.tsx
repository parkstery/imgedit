import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pipette, X } from 'lucide-react';
import { cn } from '../lib/utils';

export interface AdvancedColorWindowProps {
  isOpen: boolean;
  /** 열 때 창을 배치할 기준(팔레트 버튼 등) */
  anchorRef?: React.RefObject<HTMLElement | null>;
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

/** 이전 대비 창·패널 시각적 크기 약 60% */
const SCALE = 0.6;
const SV_W = Math.round(220 * SCALE);
const SV_H = Math.round(160 * SCALE);

const PANEL_EST_W = Math.round(352 * SCALE);
const PANEL_EST_H = Math.round(480 * SCALE);

function clampPanelPosition(x: number, y: number, w: number, h: number): { x: number; y: number } {
  const pad = 8;
  const maxX = Math.max(pad, window.innerWidth - w - pad);
  const maxY = Math.max(pad, window.innerHeight - h - pad);
  return {
    x: Math.min(Math.max(pad, x), maxX),
    y: Math.min(Math.max(pad, y), maxY),
  };
}

export const AdvancedColorWindow: React.FC<AdvancedColorWindowProps> = ({
  isOpen,
  anchorRef,
  color,
  onColorChange,
  onRequestClose,
}) => {
  const [h, setH] = useState(0);
  const [s, setS] = useState(1);
  const [v, setV] = useState(1);
  const [hexInput, setHexInput] = useState('#ffffff');
  const [position, setPosition] = useState({ x: 16, y: 72 });
  const positionRef = useRef(position);
  positionRef.current = position;
  const svCanvasRef = useRef<HTMLCanvasElement>(null);
  const svDraggingRef = useRef(false);
  const [eyedropperBusy, setEyedropperBusy] = useState(false);
  /** 스포이드로 색을 집은 뒤 버튼을 다시 누르기 전까지 시각적 활성 */
  const [eyedropperActive, setEyedropperActive] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevOpenRef = useRef(false);
  const dragRef = useRef<{ pointerId: number; ox: number; oy: number; px: number; py: number } | null>(null);

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

  useLayoutEffect(() => {
    if (!isOpen) {
      prevOpenRef.current = false;
      return;
    }
    if (!prevOpenRef.current) {
      prevOpenRef.current = true;
      const anchor = anchorRef?.current;
      let x = window.innerWidth - PANEL_EST_W - 16;
      let y = 72;
      if (anchor) {
        const r = anchor.getBoundingClientRect();
        x = r.left;
        y = r.bottom + 8;
      }
      setPosition(clampPanelPosition(x, y, PANEL_EST_W, PANEL_EST_H));

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
  }, [isOpen, h, color, anchorRef, redrawSvCanvas]);

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
    if (!isOpen) setEyedropperActive(false);
  }, [isOpen]);

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

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      ox: positionRef.current.x,
      oy: positionRef.current.y,
      px: e.clientX,
      py: e.clientY,
    };
  };

  const onHeaderPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    const nx = d.ox + e.clientX - d.px;
    const ny = d.oy + e.clientY - d.py;
    const panel = panelRef.current;
    const w = panel?.offsetWidth ?? PANEL_EST_W;
    const h = panel?.offsetHeight ?? PANEL_EST_H;
    setPosition(clampPanelPosition(nx, ny, w, h));
  };

  const endHeaderDrag = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d || e.pointerId !== d.pointerId) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    dragRef.current = null;
  };

  useEffect(() => {
    if (!isOpen) return;
    const onResize = () => {
      const panel = panelRef.current;
      if (!panel) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      setPosition(p => clampPanelPosition(p.x, p.y, w, h));
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isOpen]);

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
          setEyedropperActive(true);
        }
      }
    } catch {
      /* 취소 */
    } finally {
      setEyedropperBusy(false);
    }
  };

  const markerLeft = `${(s * 100).toFixed(2)}%`;
  const markerTop = `${((1 - v) * 100).toFixed(2)}%`;

  if (!isOpen) return null;

  const panel = (
    <div
      ref={panelRef}
      role="dialog"
      aria-labelledby="advanced-color-title"
      className="fixed z-[90] w-[min(calc(100vw-1rem),13.2rem)] rounded-lg border border-neutral-700 bg-neutral-800 shadow-2xl shadow-black/40"
      style={{ left: position.x, top: position.y }}
    >
      <div
        className="flex cursor-grab active:cursor-grabbing items-center justify-between gap-1.5 border-b border-neutral-700 px-2 py-1.5 select-none touch-none"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={endHeaderDrag}
        onPointerCancel={endHeaderDrag}
      >
        <h2 id="advanced-color-title" className="text-xs font-semibold text-neutral-100 truncate pr-1">
          고급 색상 선택
        </h2>
        <button
          type="button"
          onClick={e => {
            e.stopPropagation();
            onRequestClose();
          }}
          onPointerDown={e => e.stopPropagation()}
          className="shrink-0 flex items-center gap-0.5 rounded border border-neutral-600 bg-neutral-900 px-1.5 py-0.5 text-[10px] font-medium text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
        >
          <X size={12} className="shrink-0 opacity-80" aria-hidden />
          닫기
        </button>
      </div>

      <div className="p-2.5 space-y-2.5">
        <div className="relative overflow-hidden rounded border border-neutral-600 touch-none">
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
            className="pointer-events-none absolute w-2 h-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md ring-1 ring-black/40"
            style={{ left: markerLeft, top: markerTop }}
          />
        </div>

        <div className="space-y-0.5">
          <label className="text-[9px] font-medium text-neutral-400" htmlFor="adv-color-hue">
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
            className="w-full h-1.5 rounded-lg accent-blue-500 cursor-pointer"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <label className="text-[9px] text-neutral-400 shrink-0" htmlFor="adv-color-hex">
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
            className="flex-1 min-w-[4.5rem] rounded border border-neutral-600 bg-neutral-900 px-1.5 py-1 font-mono text-[11px] text-neutral-100 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {eyeDropperSupported ? (
            <button
              type="button"
              disabled={eyedropperBusy}
              onClick={() => {
                if (eyedropperActive) {
                  setEyedropperActive(false);
                  return;
                }
                void runEyedropper();
              }}
              title={
                eyedropperActive
                  ? '스포이드 활성 해제 (다시 누르면 화면에서 색 추출)'
                  : '화면에서 색 추출. 색을 고른 뒤에는 버튼이 활성으로 남으며, 한 번 더 누르면 해제됩니다.'
              }
              aria-pressed={eyedropperActive}
              className={cn(
                'inline-flex items-center gap-1 rounded border bg-neutral-900 px-1.5 py-1 text-[10px] font-medium',
                'focus:outline-none focus:ring-2 focus:ring-blue-500',
                eyedropperActive
                  ? 'border-blue-400 bg-blue-950/50 text-blue-100 ring-1 ring-blue-500/60'
                  : 'border-neutral-600 text-neutral-200 hover:bg-neutral-700 hover:border-neutral-500',
                'disabled:opacity-50 disabled:pointer-events-none'
              )}
            >
              <Pipette size={12} className="shrink-0" aria-hidden />
              스포이드
            </button>
          ) : (
            <span className="text-[9px] text-neutral-500">스포이드는 Chrome·Edge 등에서 지원됩니다.</span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <div
            className="h-5 w-9 shrink-0 rounded border border-neutral-600 shadow-inner"
            style={{ backgroundColor: hsvToHex(h, s, v) }}
            title="미리보기"
          />
          <p className="text-[9px] text-neutral-500 leading-snug">
            제목 줄을 드래그해 이동합니다. 스포이드로 색을 고르면 버튼이 활성로 남고, 다시 누르면 해제됩니다.
          </p>
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
};
