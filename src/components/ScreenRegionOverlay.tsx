import React, { useCallback, useEffect, useRef, useState } from 'react';
import { stopMediaStream } from '../lib/screenCapture';

type Point = { x: number; y: number };

interface ScreenRegionOverlayProps {
  stream: MediaStream;
  onComplete: (canvas: HTMLCanvasElement) => void;
  onCancel: () => void;
}

/** 공유된 화면 위에서 드래그한 직사각형만 잘라 PNG 소스 캔버스로 넘깁니다. */
export const ScreenRegionOverlay: React.FC<ScreenRegionOverlayProps> = ({
  stream,
  onComplete,
  onCancel,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ start: Point; cur: Point } | null>(null);
  const [, setTick] = useState(0);
  const force = () => setTick(t => t + 1);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    void v.play().catch(() => undefined);
    return () => {
      v.srcObject = null;
    };
  }, [stream]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        dragRef.current = null;
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const clientToVideoCrop = useCallback(
    (clientX1: number, clientY1: number, clientX2: number, clientY2: number) => {
      const video = videoRef.current;
      const wrap = wrapRef.current;
      if (!video || !wrap || video.videoWidth < 2 || video.videoHeight < 2) return null;
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const cr = wrap.getBoundingClientRect();
      const cw = cr.width;
      const ch = cr.height;
      const scale = Math.min(cw / vw, ch / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const offX = cr.left + (cw - dw) / 2;
      const offY = cr.top + (ch - dh) / 2;

      const toV = (clientX: number, clientY: number) => ({
        x: (clientX - offX) / scale,
        y: (clientY - offY) / scale,
      });

      const a = toV(clientX1, clientY1);
      const b = toV(clientX2, clientY2);
      const sx = Math.max(0, Math.min(a.x, b.x, vw - 1));
      const sy = Math.max(0, Math.min(a.y, b.y, vh - 1));
      const sw = Math.max(1, Math.min(vw - sx, Math.abs(b.x - a.x)));
      const sh = Math.max(1, Math.min(vh - sy, Math.abs(b.y - a.y)));
      return { sx, sy, sw, sh, video };
    },
    [],
  );

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { start: { x: e.clientX, y: e.clientY }, cur: { x: e.clientX, y: e.clientY } };
    force();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = { start: dragRef.current.start, cur: { x: e.clientX, y: e.clientY } };
    force();
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    force();
    if (!d) return;
    const crop = clientToVideoCrop(d.start.x, d.start.y, e.clientX, e.clientY);
    if (!crop || crop.sw < 2 || crop.sh < 2) {
      stopMediaStream(stream);
      onCancel();
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(crop.sw);
    canvas.height = Math.floor(crop.sh);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(crop.video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    stopMediaStream(stream);
    onComplete(canvas);
  };

  const d = dragRef.current;
  const boxStyle = (): React.CSSProperties | undefined => {
    if (!d) return undefined;
    const x1 = Math.min(d.start.x, d.cur.x);
    const y1 = Math.min(d.start.y, d.cur.y);
    const w = Math.abs(d.cur.x - d.start.x);
    const h = Math.abs(d.cur.y - d.start.y);
    return {
      position: 'fixed',
      left: x1,
      top: y1,
      width: w,
      height: h,
      border: '2px dashed #fbbf24',
      background: 'rgba(251, 191, 36, 0.12)',
      pointerEvents: 'none',
      zIndex: 201,
    };
  };

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black/85 text-neutral-100">
      <div className="shrink-0 border-b border-neutral-700 px-3 py-2 text-center text-sm">
        <span className="font-medium text-amber-200">화면 영역 캡처</span>
        <span className="text-neutral-400"> · 공유 화면 위를 드래그 · Esc 취소</span>
      </div>
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          playsInline
          muted
          autoPlay
        />
        <div
          className="absolute inset-0 touch-none"
          style={{ cursor: 'crosshair' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
            force();
          }}
        />
      </div>
      {d && <div style={boxStyle()} aria-hidden />}
    </div>
  );
};
