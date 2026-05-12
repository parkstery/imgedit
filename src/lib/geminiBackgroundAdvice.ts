export type GeminiBgMethod = 'border_histogram' | 'key_color';

export interface GeminiBackgroundAdvice {
  method: GeminiBgMethod;
  /** key_color일 때만 사용. border_histogram이면 null */
  backgroundHex: string | null;
  tolerance: number;
  ignoreAlpha: boolean;
  rationaleKo?: string;
}

function normalizeHex(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let h = input.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(h)) return `#${h.slice(1).toLowerCase()}`;
  if (/^[0-9A-Fa-f]{6}$/i.test(h)) return `#${h.toLowerCase()}`;
  return null;
}

/**
 * Gemini 텍스트 응답에서 배경 제거 JSON 한 덩어리를 파싱합니다. ```json … ``` 블록도 처리합니다.
 */
export function parseGeminiBackgroundAdvice(text: string): GeminiBackgroundAdvice | null {
  let t = text.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/im.exec(t);
  if (fence) t = fence[1].trim();
  const objStart = t.indexOf('{');
  const objEnd = t.lastIndexOf('}');
  if (objStart >= 0 && objEnd > objStart) t = t.slice(objStart, objEnd + 1);

  try {
    const o = JSON.parse(t) as Record<string, unknown>;
    const rawMethod = o.method ?? o.Method;
    const method: GeminiBgMethod | null =
      rawMethod === 'key_color'
        ? 'key_color'
        : rawMethod === 'border_histogram'
          ? 'border_histogram'
          : null;
    if (!method) return null;

    let tolerance = Number(o.tolerance ?? o.Tolerance);
    if (!Number.isFinite(tolerance)) tolerance = 36;
    tolerance = Math.max(0, Math.min(100, Math.round(tolerance)));

    const ignoreAlpha = Boolean(o.ignoreAlpha ?? o.ignore_alpha ?? o.IgnoreAlpha);

    const hexRaw = o.backgroundHex ?? o.background_hex ?? o.backgroundColor ?? o.keyColorHex;
    const backgroundHex = normalizeHex(hexRaw);

    if (method === 'key_color' && !backgroundHex) return null;

    const rationaleKo =
      typeof o.rationaleKo === 'string'
        ? o.rationaleKo
        : typeof o.rationale === 'string'
          ? o.rationale
          : typeof o.reason_ko === 'string'
            ? o.reason_ko
            : undefined;

    return {
      method,
      backgroundHex: method === 'border_histogram' ? null : backgroundHex,
      tolerance,
      ignoreAlpha,
      rationaleKo,
    };
  } catch {
    return null;
  }
}
