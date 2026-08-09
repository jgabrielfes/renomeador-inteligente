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

/**
 * Tolerância de cor do crescimento do fundo (ver backgroundMask).
 *
 * Calibrada contra uma foto em ângulo cujo documento tem faixa PRETA no
 * cabeçalho — o caso que quebra: no downscale, a transição faixa-escura/mesa
 * fica suave e o fundo atravessa para dentro do documento, comendo o
 * cabeçalho. Medido, o quadrilátero sai exato de 8 a 18 e passa a cortar o
 * cabeçalho a partir de 22. 14 fica no meio da faixa que funciona.
 */
const BG_TOLERANCIA = 14;

/**
 * Máscara do documento por ELIMINAÇÃO DO FUNDO.
 *
 * A versão anterior procurava "a maior região clara", e isso quebrava em
 * qualquer documento com faixa escura no cabeçalho, foto 3x4 grande ou fundo
 * colorido impresso: a região clara era só um PEDAÇO da folha, e esticar esse
 * pedaço produzia o "zoom no meio do documento".
 *
 * Aqui a lógica se inverte: a MESA é que toca as bordas da foto. Cresce-se uma
 * região a partir das quatro bordas, aceitando vizinhos de cor parecida (o que
 * acompanha o degradê de iluminação da mesa) e parando no contraste da beirada
 * do papel. O que sobra é o documento — inteiro, com faixa escura e tudo.
 */
function backgroundMask(
  rgb: Uint8ClampedArray,
  w: number,
  h: number,
  tolerancia = BG_TOLERANCIA
): Uint8Array {
  const fundo = new Uint8Array(w * h);
  const fila = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const push = (p: number) => {
    if (!fundo[p]) {
      fundo[p] = 1;
      fila[tail++] = p;
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }

  const parecido = (a: number, b: number) => {
    const ia = a * 4;
    const ib = b * 4;
    return (
      Math.abs(rgb[ia] - rgb[ib]) < tolerancia &&
      Math.abs(rgb[ia + 1] - rgb[ib + 1]) < tolerancia &&
      Math.abs(rgb[ia + 2] - rgb[ib + 2]) < tolerancia
    );
  };

  while (head < tail) {
    const p = fila[head++];
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0 && !fundo[p - 1] && parecido(p, p - 1)) push(p - 1);
    if (x < w - 1 && !fundo[p + 1] && parecido(p, p + 1)) push(p + 1);
    if (y > 0 && !fundo[p - w] && parecido(p, p - w)) push(p - w);
    if (y < h - 1 && !fundo[p + w] && parecido(p, p + w)) push(p + w);
  }
  return fundo;
}

/** Maior componente conexa (4-vizinhos) de pixels marcados na máscara. */
function largestComponent(
  mask: Uint8Array,
  w: number,
  h: number
): { mask: Uint8Array; size: number } | null {
  const labels = new Int32Array(w * h).fill(-1);
  const stack = new Int32Array(w * h);
  let best = -1;
  let bestSize = 0;
  let current = 0;

  for (let seed = 0; seed < mask.length; seed++) {
    if (labels[seed] !== -1 || !mask[seed]) continue;
    let top = 0;
    stack[top++] = seed;
    labels[seed] = current;
    let size = 0;
    while (top > 0) {
      const p = stack[--top];
      size++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x > 0 && labels[p - 1] === -1 && mask[p - 1]) {
        labels[p - 1] = current;
        stack[top++] = p - 1;
      }
      if (x < w - 1 && labels[p + 1] === -1 && mask[p + 1]) {
        labels[p + 1] = current;
        stack[top++] = p + 1;
      }
      if (y > 0 && labels[p - w] === -1 && mask[p - w]) {
        labels[p - w] = current;
        stack[top++] = p - w;
      }
      if (y < h - 1 && labels[p + w] === -1 && mask[p + w]) {
        labels[p + w] = current;
        stack[top++] = p + w;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = current;
    }
    current++;
  }

  if (best < 0) return null;
  const out = new Uint8Array(w * h);
  for (let i = 0; i < labels.length; i++) if (labels[i] === best) out[i] = 1;
  return { mask: out, size: bestSize };
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

function pontoDentro(quad: Point[], x: number, y: number): boolean {
  let dentro = false;
  for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
    const a = quad[i];
    const b = quad[j];
    if (
      a.y > y !== b.y > y &&
      x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x
    ) {
      dentro = !dentro;
    }
  }
  return dentro;
}

/**
 * Fração do DOCUMENTO que ficaria de fora do quadrilátero.
 *
 * Esta é a trava que impede o "zoom no meio do documento": ela olha a máscara
 * do documento (tudo que não é fundo) e mede quanto disso o quadrilátero
 * deixaria de lado. Se o crescimento do fundo vazou para dentro da folha, ou
 * se o quadrilátero cortou um canto, aparece aqui e o enquadramento é recusado.
 *
 * Importante: NÃO dá para medir isso por "pixel escuro". A mesa costuma ser
 * mais escura que o papel, então um limiar de tinta contaria o fundo inteiro
 * como conteúdo perdido e recusaria todo enquadramento — foi exatamente o que
 * aconteceu na primeira versão desta trava.
 */
function documentoForaDoQuad(
  documento: Uint8Array,
  w: number,
  h: number,
  quad: Point[]
): number {
  let total = 0;
  let fora = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!documento[y * w + x]) continue;
      total++;
      if (!pontoDentro(quad, x + 0.5, y + 0.5)) fora++;
    }
  }
  return total === 0 ? 0 : fora / total;
}

/** Acima disso, o quadrilátero está cortando o documento — melhor não enquadrar. */
const MAX_DOCUMENTO_FORA = 0.04;


/**
 * Encontra os quatro cantos do documento na imagem. Devolve null quando não há
 * detecção confiável — nesse caso o chamador deve manter a imagem como está em
 * vez de arriscar cortar conteúdo.
 */
export function detectDocumentQuad(
  canvas: HTMLCanvasElement,
  tolerancia = BG_TOLERANCIA
): Point[] | null {
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

  const total = w * h;

  // O documento é o que NÃO é fundo. O fundo (a mesa) é a região que encosta
  // nas bordas da foto.
  const fundo = backgroundMask(d, w, h, tolerancia);
  let tamanhoFundo = 0;
  for (let i = 0; i < fundo.length; i++) if (fundo[i]) tamanhoFundo++;

  // Fundo quase inexistente = a foto já é só o documento; não há o que
  // reenquadrar. Fundo quase total = o crescimento vazou para dentro do papel
  // (mesa da cor do papel), e aí a detecção não é confiável.
  if (tamanhoFundo < total * 0.04 || tamanhoFundo > total * 0.9) return null;

  const documento = new Uint8Array(total);
  for (let i = 0; i < total; i++) documento[i] = fundo[i] ? 0 : 1;
  const component = largestComponent(documento, w, h);
  if (!component) return null;

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

  // Trava final: nada de recortar por cima do documento. Uma folga de 2% na
  // borda evita recusar por causa de um antialiasing na moldura, mas qualquer
  // texto, carimbo ou foto que fique de fora reprova o enquadramento.
  const folga = 0.02;
  const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
  const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
  const comFolga = quad.map((p) => ({
    x: p.x + (p.x - cx) * folga,
    y: p.y + (p.y - cy) * folga,
  }));
  if (documentoForaDoQuad(documento, w, h, comFolga) > MAX_DOCUMENTO_FORA) {
    return null;
  }

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

