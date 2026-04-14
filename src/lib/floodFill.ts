export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function hexToRgba(hex: string): Rgba {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) {
    h = h
      .split('')
      .map(c => c + c)
      .join('');
  }
  if (h.length === 6) {
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return { r: 0, g: 0, b: 0, a: 255 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 255 };
  }
  return { r: 0, g: 0, b: 0, a: 255 };
}

export interface FloodFillOptions {
  /** true면 영역 판별·채울 필요 여부 판단에서 알파 채널을 비교하지 않음 */
  ignoreAlpha?: boolean;
}

/**
 * 연결된 동일 색(허용 오차) 영역을 채웁니다. 그림판식 페인트통.
 * @returns 채운 픽셀 수 (0이면 시작점이 범위 밖이거나 채울 필요 없음)
 */
export function floodFillImageData(
  imageData: ImageData,
  startX: number,
  startY: number,
  fill: Rgba,
  tolerance = 36,
  options?: FloodFillOptions
): number {
  const ignoreAlpha = options?.ignoreAlpha ?? false;
  const w = imageData.width;
  const h = imageData.height;
  if (startX < 0 || startY < 0 || startX >= w || startY >= h) return 0;

  const data = imageData.data;
  const idx0 = (startY * w + startX) * 4;
  const tr = data[idx0];
  const tg = data[idx0 + 1];
  const tb = data[idx0 + 2];
  const ta = data[idx0 + 3];

  const matchesTarget = (i: number) => {
    const rgb =
      Math.abs(data[i] - tr) <= tolerance &&
      Math.abs(data[i + 1] - tg) <= tolerance &&
      Math.abs(data[i + 2] - tb) <= tolerance;
    if (ignoreAlpha) return rgb;
    return rgb && Math.abs(data[i + 3] - ta) <= tolerance;
  };

  const rgbMatchesStart = () =>
    Math.abs(fill.r - tr) <= tolerance &&
    Math.abs(fill.g - tg) <= tolerance &&
    Math.abs(fill.b - tb) <= tolerance;

  if (ignoreAlpha) {
    if (rgbMatchesStart()) return 0;
  } else if (
    rgbMatchesStart() &&
    Math.abs(fill.a - ta) <= tolerance
  ) {
    return 0;
  }

  const stack: number[] = [startY * w + startX];
  let filled = 0;
  const maxOps = w * h + 1;
  let ops = 0;

  while (stack.length > 0 && ops++ < maxOps) {
    const p = stack.pop()!;
    const x = p % w;
    const y = (p / w) | 0;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = (y * w + x) * 4;
    if (!matchesTarget(i)) continue;

    data[i] = fill.r;
    data[i + 1] = fill.g;
    data[i + 2] = fill.b;
    data[i + 3] = fill.a;
    filled++;

    stack.push(y * w + (x + 1), y * w + (x - 1), (y + 1) * w + x, (y - 1) * w + x);
  }

  return filled;
}
