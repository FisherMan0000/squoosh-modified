import type { Options } from '../shared/meta';

interface RGB {
  r: number;
  g: number;
  b: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function collectMeanColor(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  pick: (x: number, y: number) => boolean,
): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!pick(x, y)) continue;
      const i = (y * width + x) * 4;
      r += data[i + 0];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  }

  if (!count) return { r: 127, g: 127, b: 127 };

  return {
    r: r / count,
    g: g / count,
    b: b / count,
  };
}

function colorDistSq(r: number, g: number, b: number, ref: RGB): number {
  const dr = r - ref.r;
  const dg = g - ref.g;
  const db = b - ref.b;
  return dr * dr + dg * dg + db * db;
}

function makeInitialMask(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  opts: Options,
): Uint8Array {
  const fgMean = collectMeanColor(data, width, height, (x, y) => {
    const leftBand = x < width * 0.45;
    const centerBand = y > height * 0.1 && y < height * 0.9;
    return leftBand && centerBand;
  });

  const bgMean = collectMeanColor(data, width, height, (x, y) => {
    const border =
      x < width * 0.06 ||
      x > width * 0.94 ||
      y < height * 0.06 ||
      y > height * 0.94;
    const rightBand = x > width * 0.6;
    return border || rightBand;
  });

  const rawScores = new Float32Array(width * height);
  let minScore = Number.POSITIVE_INFINITY;
  let maxScore = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const i = idx * 4;
      const r = data[i + 0];
      const g = data[i + 1];
      const b = data[i + 2];
      const dFg = colorDistSq(r, g, b, fgMean);
      const dBg = colorDistSq(r, g, b, bgMean);

      // Positive when pixel is closer to foreground than background.
      const colorScore = dBg - dFg;
      const xNorm = width > 1 ? x / (width - 1) : 0;
      const leftPrior = 1 - opts.leftBias * xNorm;
      const score = colorScore * leftPrior;

      rawScores[idx] = score;
      if (score < minScore) minScore = score;
      if (score > maxScore) maxScore = score;
    }
  }

  const spread = Math.max(1e-5, maxScore - minScore);
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i += 1) {
    const normalized = (rawScores[i] - minScore) / spread;
    mask[i] = normalized >= opts.threshold ? 1 : 0;
  }

  return mask;
}

function keepMainLeftComponent(
  mask: Uint8Array,
  width: number,
  height: number,
  minRegionRatio: number,
  leftBias: number,
): Uint8Array {
  const visited = new Uint8Array(mask.length);
  const minArea = Math.max(1, Math.floor(mask.length * minRegionRatio));

  let bestScore = Number.NEGATIVE_INFINITY;
  let bestPixels: number[] = [];

  const queueX = new Int32Array(mask.length);
  const queueY = new Int32Array(mask.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIdx = y * width + x;
      if (!mask[startIdx] || visited[startIdx]) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[startIdx] = 1;

      const pixels: number[] = [];
      let sumX = 0;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head += 1;

        const idx = cy * width + cx;
        pixels.push(idx);
        sumX += cx;

        for (let ny = cy - 1; ny <= cy + 1; ny += 1) {
          if (ny < 0 || ny >= height) continue;
          for (let nx = cx - 1; nx <= cx + 1; nx += 1) {
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (!mask[nIdx] || visited[nIdx]) continue;
            visited[nIdx] = 1;
            queueX[tail] = nx;
            queueY[tail] = ny;
            tail += 1;
          }
        }
      }

      if (pixels.length < minArea) continue;

      const areaNorm = pixels.length / mask.length;
      const centroidX = sumX / pixels.length;
      const centroidNorm = width > 1 ? centroidX / (width - 1) : 0;

      // Large and farther-left components score higher.
      const componentScore = areaNorm - leftBias * centroidNorm;
      if (componentScore > bestScore) {
        bestScore = componentScore;
        bestPixels = pixels;
      }
    }
  }

  // If no component passed filters, keep original mask to avoid deleting everything.
  if (!bestPixels.length) return mask;

  const result = new Uint8Array(mask.length);
  for (const idx of bestPixels) result[idx] = 1;
  return result;
}

function blurAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  radius: number,
): Uint8ClampedArray {
  if (radius <= 0) return alpha;

  const out = new Uint8ClampedArray(alpha.length);
  const kernelSize = (radius * 2 + 1) * (radius * 2 + 1);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let sum = 0;
      for (let ky = -radius; ky <= radius; ky += 1) {
        const sy = clamp(y + ky, 0, height - 1);
        for (let kx = -radius; kx <= radius; kx += 1) {
          const sx = clamp(x + kx, 0, width - 1);
          sum += alpha[sy * width + sx];
        }
      }
      out[y * width + x] = Math.round(sum / kernelSize);
    }
  }

  return out;
}

export default async function leftSubjectMask(
  data: ImageData,
  options: Options,
): Promise<ImageData> {
  const opts: Options = {
    threshold: clamp(options.threshold, 0, 1),
    leftBias: clamp(options.leftBias, 0, 1),
    minRegionRatio: clamp(options.minRegionRatio, 0.0001, 0.5),
    featherRadius: Math.round(clamp(options.featherRadius, 0, 4)),
  };

  const width = data.width;
  const height = data.height;
  const rgba = new Uint8ClampedArray(data.data);

  const seedMask = makeInitialMask(rgba, width, height, opts);
  const subjectMask = keepMainLeftComponent(
    seedMask,
    width,
    height,
    opts.minRegionRatio,
    opts.leftBias,
  );

  const alpha = new Uint8ClampedArray(subjectMask.length);
  for (let i = 0; i < subjectMask.length; i += 1) {
    alpha[i] = subjectMask[i] ? 255 : 0;
  }

  const softened = blurAlpha(alpha, width, height, opts.featherRadius);

  for (let i = 0; i < subjectMask.length; i += 1) {
    const aIdx = i * 4 + 3;
    rgba[aIdx] = Math.min(rgba[aIdx], softened[i]);
  }

  return new ImageData(rgba, width, height);
}
