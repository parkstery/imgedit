const KEY_TOLERANCE = 'imgedit.fillTolerance';
const KEY_IGNORE_ALPHA = 'imgedit.fillIgnoreAlpha';

function safeParseInt(raw: string | null, fallback: number, min: number, max: number): number {
  if (raw == null || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function readFillTolerance(fallback: number): number {
  if (typeof window === 'undefined') return fallback;
  try {
    return safeParseInt(window.localStorage.getItem(KEY_TOLERANCE), fallback, 0, 100);
  } catch {
    return fallback;
  }
}

export function writeFillTolerance(value: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_TOLERANCE, String(value));
  } catch {
    /* quota / private mode */
  }
}

export function readFillIgnoreAlpha(fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(KEY_IGNORE_ALPHA);
    if (raw === '1' || raw === 'true') return true;
    if (raw === '0' || raw === 'false') return false;
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeFillIgnoreAlpha(value: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_IGNORE_ALPHA, value ? '1' : '0');
  } catch {
    /* quota / private mode */
  }
}
