// Detecção do documento na foto e correção de perspectiva ("efeito scanner").
//
// A ideia é a mesma dos apps de digitalização: achar os quatro cantos da folha
// dentro da foto e esticá-la para um retângulo, em vez de só recortar uma caixa
// — é isso que tira a impressão de "foto torta de um papel em cima da mesa" e
// dá a impressão de página digitalizada.
//
// Tudo em Canvas puro, sem dependências novas. Nenhuma etapa inventa conteúdo:
// a transformação é geométrica e a amostragem é bilinear (interpolação
// clássica, não generativa).

export interface Point {
  x: number;
  y: number;
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

// --- 1. Máscara do documento -------------------------------------------------
// A folha é a região clara e contígua no meio da foto; a mesa/fundo é mais
// escura. Um limiar de Otsu separa os dois grupos sem precisar de constante
// mágica, e a maior componente conexa clara é o documento. Buracos internos
// (texto, foto do RG) não atrapalham: o casco convexo os ignora.

function otsuThreshold(gray: Uint8ClampedArray): number {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const total = gray.length;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let max = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > max) {
      max = between;
      threshold = t;
    }
  }
  return threshold;
}

/** Maior componente conexa (4-vizinhos) de pixels acima do limiar. */
function largestBrightComponent(
  gray: Uint8ClampedArray,
  w: number,
  h: number,
  threshold: number
): { mask: Uint8Array; size: number } | null {
  const labels = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let best: { start: number; size: number } | null = null;
  let current = 0;

  for (let seed = 0; seed < gray.length; seed++) {
    if (labels[seed] !== -1 || gray[seed] <= threshold) continue;
    let top = 0;
    stack[top++] = seed;
    labels[seed] = current;
    let size = 0;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      // 4-vizinhos
      if (x > 0) {
        const n = p - 1;
        if (labels[n] === -1 && gray[n] > threshold) {
          labels[n] = current;
          stack[top++] = n;
        }
      }
      if (x < w - 1) {
        const n = p + 1;
        if (labels[n] === -1 && gray[n] > threshold) {
          labels[n] = current;
          stack[top++] = n;
        }
      }
      if (y > 0) {
        const n = p - w;
        if (labels[n] === -1 && gray[n] > threshold) {
          labels[n] = current;
          stack[top++] = n;
        }
      }
      if (y < h - 1) {
        const n = p + w;
        if (labels[n] === -1 && gray[n] > threshold) {
          labels[n] = current;
          stack[top++] = n;
        }
      }
    }
    if (!best || size > best.size) best = { start: current, size };
    current++;
  }

  if (!best) return null;
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) {
    if (labels[i] === best.start) mask[i] = 1;
  }
  return { mask, size: best.size };
}

// --- 2. Casco convexo e melhor quadrilátero ----------------------------------

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/** Casco convexo (monotone chain), devolvido em ordem consistente. */
function convexHull(points: Point[]): Point[] {
  if (points.length < 4) return points.slice();
  const sorted = points
    .slice()
    .sort((p, q) => (p.x === q.x ? p.y - q.y : p.x - q.x));

  const lower: Point[] = [];
  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0
    ) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Point[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0
    ) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Reduz o casco a no máximo `max` vértices para a busca do quadrilátero ser barata. */
function simplifyHull(hull: Point[], max: number): Point[] {
  if (hull.length <= max) return hull;
  const step = hull.length / max;
  const out: Point[] = [];
  for (let i = 0; i < max; i++) out.push(hull[Math.floor(i * step)]);
  return out;
}

function polygonArea(pts: Point[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Maior quadrilátero inscrito no casco convexo. Como o casco já está em ordem
 * angular, quaisquer 4 índices crescentes formam um quadrilátero convexo — dá
 * para enumerar todos (C(32,4) ≈ 36 mil, barato) e ficar com o de maior área.
 */
function largestQuad(hull: Point[]): Point[] | null {
  const pts = simplifyHull(hull, 32);
  const n = pts.length;
  if (n < 4) return null;

  let best: Point[] | null = null;
  let bestArea = 0;
  for (let i = 0; i < n - 3; i++) {
    for (let j = i + 1; j < n - 2; j++) {
      for (let k = j + 1; k < n - 1; k++) {
        for (let l = k + 1; l < n; l++) {
          const quad = [pts[i], pts[j], pts[k], pts[l]];
          const area = polygonArea(quad);
          if (area > bestArea) {
            bestArea = area;
            best = quad;
          }
        }
      }
    }
  }
  return best;
}

/** Ordena os cantos como [superior-esquerdo, superior-direito, inferior-direito, inferior-esquerdo]. */
function orderCorners(quad: Point[]): Point[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length;
  const cy = quad.reduce((s, p) => s + p.y, 0) / quad.length;
  const sorted = quad
    .slice()
    .sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));

  // Começa pelo canto mais próximo da origem (superior-esquerdo).
  let tl = 0;
  let bestSum = Infinity;
  for (let i = 0; i < sorted.length; i++) {
    const sum = sorted[i].x + sorted[i].y;
    if (sum < bestSum) {
      bestSum = sum;
      tl = i;
    }
  }
  const rotated = [
    sorted[tl],
    sorted[(tl + 1) % 4],
    sorted[(tl + 2) % 4],
    sorted[(tl + 3) % 4],
  ];
  // Garante sentido horário na tela: o segundo canto (superior-direito) tem
  // que estar à direita do último (inferior-esquerdo).
  if (rotated[1].x < rotated[3].x) {
    return [rotated[0], rotated[3], rotated[2], rotated[1]];
  }
  return rotated;
}

/**
 * Encontra os quatro cantos do documento na imagem. Devolve null quando não há
 * detecção confiável — nesse caso o chamador deve manter a imagem como está em
 * vez de arriscar cortar conteúdo.
 */
export function detectDocumentQuad(canvas: HTMLCanvasElement): Point[] | null {
  const maxDim = Math.max(canvas.width, canvas.height);
  const scale = Math.min(1, 500 / maxDim);
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));

  const small = newCanvas(w, h);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(canvas, 0, 0, w, h);
  const img = sctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }

  const threshold = otsuThreshold(gray);
  const component = largestBrightComponent(gray, w, h, threshold);
  if (!component) return null;

  const total = w * h;
  // Pequena demais para ser a folha, ou grande a ponto de ser a foto inteira
  // (aí não há o que reenquadrar).
  if (component.size < total * 0.12 || component.size > total * 0.985) return null;

  // Pixels de borda da componente alimentam o casco convexo.
  const { mask } = component;
  const border: Point[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!mask[i]) continue;
      const edge =
        x === 0 ||
        y === 0 ||
        x === w - 1 ||
        y === h - 1 ||
        !mask[i - 1] ||
        !mask[i + 1] ||
        !mask[i - w] ||
        !mask[i + w];
      if (edge) border.push({ x, y });
    }
  }
  if (border.length < 8) return null;

  const hull = convexHull(border);
  const quad = largestQuad(hull);
  if (!quad) return null;

  // O quadrilátero precisa explicar a maior parte da componente detectada;
  // senão a forma não é uma folha (mão na frente, dois documentos etc.).
  if (polygonArea(quad) < component.size * 0.75) return null;

  const inv = 1 / scale;
  return orderCorners(quad).map((p) => ({ x: p.x * inv, y: p.y * inv }));
}

// --- 3. Transformação de perspectiva ----------------------------------------

/** Resolve um sistema linear n×n por eliminação gaussiana com pivotamento parcial. */
function solveLinearSystem(matrix: number[][], n: number): number[] | null {
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-10) return null;
    [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];

    const pivotValue = matrix[col][col];
    for (let j = col; j <= n; j++) matrix[col][j] /= pivotValue;

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = matrix[row][col];
      if (factor === 0) continue;
      for (let j = col; j <= n; j++) matrix[row][j] -= factor * matrix[col][j];
    }
  }
  return matrix.map((row) => row[n]);
}

/**
 * Homografia que leva o retângulo de destino (0,0)-(w,h) de volta ao
 * quadrilátero de origem — mapeamento inverso, para amostrar a origem a partir
 * de cada pixel do destino.
 */
function inverseHomography(
  quad: Point[],
  w: number,
  h: number
): number[] | null {
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];
  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = dst[i];
    const { x: u, y: v } = quad[i];
    rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    rows.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  return solveLinearSystem(rows, 8);
}

/**
 * Estica o quadrilátero do documento para um retângulo, com amostragem
 * bilinear. As dimensões saem do próprio quadrilátero, para preservar a
 * proporção aparente do documento.
 */
export function warpToRectangle(
  canvas: HTMLCanvasElement,
  quad: Point[],
  maxDim = 2200
): HTMLCanvasElement | null {
  const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
  const [tl, tr, br, bl] = quad;
  let outW = Math.round(Math.max(dist(tl, tr), dist(bl, br)));
  let outH = Math.round(Math.max(dist(tl, bl), dist(tr, br)));
  if (outW < 16 || outH < 16) return null;

  const shrink = Math.min(1, maxDim / Math.max(outW, outH));
  outW = Math.max(16, Math.round(outW * shrink));
  outH = Math.max(16, Math.round(outH * shrink));

  const hm = inverseHomography(quad, outW, outH);
  if (!hm) return null;
  const [a, b, c, d, e, f, g, i] = hm;

  const srcW = canvas.width;
  const srcH = canvas.height;
  const sctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const src = sctx.getImageData(0, 0, srcW, srcH).data;

  const out = newCanvas(outW, outH);
  const octx = out.getContext("2d")!;
  const dstImg = octx.createImageData(outW, outH);
  const dst = dstImg.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = g * x + i * y + 1;
      const u = (a * x + b * y + c) / denom;
      const v = (d * x + e * y + f) / denom;

      const o = (y * outW + x) * 4;
      if (u < 0 || v < 0 || u > srcW - 1 || v > srcH - 1) {
        // Fora da foto original: papel branco, não transparência.
        dst[o] = dst[o + 1] = dst[o + 2] = 255;
        dst[o + 3] = 255;
        continue;
      }

      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const x1 = Math.min(srcW - 1, x0 + 1);
      const y1 = Math.min(srcH - 1, y0 + 1);
      const fx = u - x0;
      const fy = v - y0;

      const p00 = (y0 * srcW + x0) * 4;
      const p10 = (y0 * srcW + x1) * 4;
      const p01 = (y1 * srcW + x0) * 4;
      const p11 = (y1 * srcW + x1) * 4;

      for (let ch = 0; ch < 3; ch++) {
        const top = src[p00 + ch] * (1 - fx) + src[p10 + ch] * fx;
        const bottom = src[p01 + ch] * (1 - fx) + src[p11 + ch] * fx;
        dst[o + ch] = top * (1 - fy) + bottom * fy;
      }
      dst[o + 3] = 255;
    }
  }

  octx.putImageData(dstImg, 0, 0);
  return out;
}
