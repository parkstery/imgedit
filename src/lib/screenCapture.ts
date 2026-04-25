/** Chromium·Firefox 등: 화면·창·탭 공유 (브라우저 밖 포함) */
export function isDisplayMediaSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
  );
}

function getDisplayMediaOpts(): DisplayMediaStreamOptions {
  const opts: any = {
    video: { frameRate: { ideal: 30 } },
    audio: false,
  };
  // Chromium 전용 힌트: 현재 탭보다 외부 창/화면을 우선하도록 유도
  opts.preferCurrentTab = false;
  opts.selfBrowserSurface = 'exclude';
  opts.surfaceSwitching = 'include';
  return opts as DisplayMediaStreamOptions;
}

export async function startDisplayCaptureStream(): Promise<MediaStream | null> {
  if (!isDisplayMediaSupported()) return null;
  return navigator.mediaDevices.getDisplayMedia(getDisplayMediaOpts());
}

export function hasLiveVideoTrack(stream: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some(t => t.readyState === 'live' && t.enabled);
}

export async function captureFrameFromStream(stream: MediaStream): Promise<HTMLCanvasElement | null> {
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
  video.srcObject = null;
  return canvas;
}

/**
 * OS 공유 UI에서 소스를 고른 뒤 한 프레임을 캔버스로 만듭니다. 스트림은 즉시 종료됩니다.
 */
export async function captureDisplayOnceToCanvas(): Promise<HTMLCanvasElement | null> {
  if (!isDisplayMediaSupported()) return null;
  const stream = await startDisplayCaptureStream();
  if (!stream) return null;
  try {
    return captureFrameFromStream(stream);
  } finally {
    stream.getTracks().forEach(t => t.stop());
  }
}

export function stopMediaStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach(t => t.stop());
}
