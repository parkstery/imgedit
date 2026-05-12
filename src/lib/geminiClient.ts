export type GeminiClientPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; base64: string };

/** 개발·프리뷰 서버의 `/api/gemini/generate`로 요청합니다. API 키는 서버에서만 사용됩니다. */
export async function geminiGenerate(parts: GeminiClientPart[]): Promise<string> {
  const res = await fetch('/api/gemini/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parts }),
  });
  const raw = await res.text();
  let data: { text?: string; error?: string };
  try {
    data = JSON.parse(raw) as { text?: string; error?: string };
  } catch {
    throw new Error(res.ok ? '응답 파싱 실패' : raw || res.statusText);
  }
  if (!res.ok) {
    throw new Error(data.error || raw || res.statusText);
  }
  const text = data.text?.trim();
  if (!text) {
    throw new Error(data.error || '응답에 본문이 없습니다.');
  }
  return text;
}

/** API 전송용으로 긴 변을 줄입니다(JPEG). */
export function canvasToGeminiImagePart(
  canvas: HTMLCanvasElement,
  maxDim = 1536,
  jpegQuality = 0.88
): { type: 'image'; mimeType: string; base64: string } {
  const w = canvas.width;
  const h = canvas.height;
  if (w < 1 || h < 1) {
    throw new Error('캔버스 크기가 유효하지 않습니다.');
  }
  const scale = Math.min(1, maxDim / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const out = document.createElement('canvas');
  out.width = tw;
  out.height = th;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('2D 컨텍스트를 사용할 수 없습니다.');
  ctx.drawImage(canvas, 0, 0, tw, th);
  const dataUrl = out.toDataURL('image/jpeg', jpegQuality);
  const i = dataUrl.indexOf(',');
  const base64 = i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
  return { type: 'image', mimeType: 'image/jpeg', base64 };
}
