/** Chromium·Firefox 등: 화면·창·탭 공유 (브라우저 밖 포함) */
export function isDisplayMediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

/**
 * OS 공유 UI에서 소스를 고른 뒤 한 프레임을 캔버스로 만듭니다. 스트림은 즉시 종료됩니다.
 */
export async function captureDisplayOnceToCanvas(): Promise<HTMLCanvasElement | null> {
  if (!isDisplayMediaSupported()) return null;
  const stream = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 30 } } as MediaTrackConstraints,
    audio: false,
  });
  try {
    const video = document.createElement('video');
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play().catch(() => undefined);

    await new Promise<void>((resolve, reject) => {
      const done = () => resolve();
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        done();
        return;
      }
      video.onloadeddata = done;
      video.onerror = () => reject(new Error('video load'));
    });

    let w = video.videoWidth;
    let h = video.videoHeight;
    if (w < 2 || h < 2) {
      await new Promise<void>(resolve => {
        if ('requestVideoFrameCallback' in video) {
          (video as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => void }).requestVideoFrameCallback(
            () => resolve(),
          );
        } else {
          requestAnimationFrame(() => resolve());
        }
      });
      w = video.videoWidth;
      h = video.videoHeight;
    }
    if (w < 2 || h < 2) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, w, h);
    return canvas;
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop());
}
