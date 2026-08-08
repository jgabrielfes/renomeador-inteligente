// Pipeline de melhoria de imagem para fotos de documentos (RG, CNH, contratos
// fotografados com o celular etc.): recorte automático das bordas, correção
// de inclinação (deskew), remoção de sombra/iluminação irregular, redução
// leve de ruído, autocontraste e upscaling clássico (interpolação nativa do
// Canvas — nunca generativo). Tudo roda no navegador, em Canvas puro, sem
// dependências novas.
//
// Cada etapa só altera legibilidade, nunca o conteúdo: nenhuma etapa "inventa"
// pixels (upscaling é interpolação clássica) e o arquivo original nunca é
// sobrescrito — estas funções sempre produzem uma cópia num canvas novo.
//
// Deliberadamente NÃO inclui binarização (preto e branco puro): o pipeline de
// OCR deste projeto já é calibrado em cima de imagens em escala de cinza
// (ver lib/ocr.ts) e binarizar por padrão arriscaria perder traços finos e
// regredir a precisão já calibrada.

export interface EnhanceOptions {
  /** Amplia a imagem até essa dimensão máxima quando ela for menor. */
  targetMaxDim?: number;
  crop?: boolean;
  deskew?: boolean;
  shadowRemoval?: boolean;
  denoise?: boolean;
  contrast?: boolean;
}

const DEFAULTS: Required<EnhanceOptions> = {
  targetMaxDim: 1800,
  crop: true,
  deskew: true,
  shadowRemoval: true,
  denoise: true,
  contrast: true,
};

export interface EnhanceResult {
  canvas: HTMLCanvasElement;
  /** true se recorte e/ou correção de inclinação foram de fato aplicados. */
  changed: boolean;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

function sourceToCanvas(source: ImageBitmap | HTMLCanvasElement): HTMLCanvasElement {
  const canvas = newCanvas(source.width, source.height);
  canvas.getContext("2d")!.drawImage(source, 0, 0);
  return canvas;
}

function grayscaleOf(canvas: HTMLCanvasElement): {
  data: Uint8ClampedArray;
  w: number;
  h: number;
} {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const gray = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
  }
  return { data: gray, w, h };
}

// --- Recorte automático (encontra a "caixa" do documento pela densidade de
// bordas por linha/coluna: fundo uniforme tem pouco gradiente, o documento
// concentra bordas de texto/contorno). ---

function findBounds(rowEnergy: Float64Array, colEnergy: Float64Array, w: number, h: number) {
  let rowMax = 0;
  for (let i = 0; i < h; i++) if (rowEnergy[i] > rowMax) rowMax = rowEnergy[i];
  let colMax = 0;
  for (let i = 0; i < w; i++) if (colEnergy[i] > colMax) colMax = colEnergy[i];
  const rowThresh = rowMax * 0.06;
  const colThresh = colMax * 0.06;

  let top = 0;
  while (top < h && rowEnergy[top] < rowThresh) top++;
  let bottom = h - 1;
  while (bottom > top && rowEnergy[bottom] < rowThresh) bottom--;
  let left = 0;
  while (left < w && colEnergy[left] < colThresh) left++;
  let right = w - 1;
  while (right > left && colEnergy[right] < colThresh) right--;

  return { top, bottom, left, right };
}

function cropToContent(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  // Detecção roda numa cópia pequena (mais rápido); o recorte real é feito
  // no canvas em resolução original, escalando a caixa encontrada de volta.
  const scale = Math.min(1, 800 / Math.max(w, h));
  const sw = Math.max(1, Math.round(w * scale));
  const sh = Math.max(1, Math.round(h * scale));
  const small = newCanvas(sw, sh);
  small.getContext("2d")!.drawImage(canvas, 0, 0, sw, sh);
  const { data: gray } = grayscaleOf(small);

  const rowEnergy = new Float64Array(sh);
  const colEnergy = new Float64Array(sw);
  for (let y = 0; y < sh; y++) {
    let rowSum = 0;
    for (let x = 1; x < sw; x++) {
      const diff = Math.abs(gray[y * sw + x] - gray[y * sw + x - 1]);
      rowSum += diff;
      colEnergy[x] += diff;
    }
    rowEnergy[y] = rowSum;
  }

  const { top, bottom, left, right } = findBounds(rowEnergy, colEnergy, sw, sh);
  const boxW = right - left;
  const boxH = bottom - top;
  // Segurança: se a detecção não achou uma região plausível, não corta nada
  // — é preferível manter uma margem de fundo a arriscar cortar conteúdo.
  if (boxW < sw * 0.5 || boxH < sh * 0.5) return canvas;

  const marginX = Math.round(boxW * 0.03);
  const marginY = Math.round(boxH * 0.03);
  const sx0 = Math.max(0, left - marginX);
  const sy0 = Math.max(0, top - marginY);
  const sx1 = Math.min(sw, right + marginX);
  const sy1 = Math.min(sh, bottom + marginY);
  // Já enquadrado (documento ocupa quase todo o frame): não vale recortar.
  if (sx1 - sx0 >= sw * 0.98 && sy1 - sy0 >= sh * 0.98) return canvas;

  const inv = 1 / scale;
  const cx0 = Math.round(sx0 * inv);
  const cy0 = Math.round(sy0 * inv);
  const cx1 = Math.min(w, Math.round(sx1 * inv));
  const cy1 = Math.min(h, Math.round(sy1 * inv));
  const cw = cx1 - cx0;
  const ch = cy1 - cy0;
  if (cw <= 0 || ch <= 0) return canvas;

  const out = newCanvas(cw, ch);
  out.getContext("2d")!.drawImage(canvas, cx0, cy0, cw, ch, 0, 0, cw, ch);
  return out;
}

// --- Correção de inclinação (deskew): busca, por força bruta entre -10° e
// +10°, o ângulo que maximiza a variância da energia de borda por linha
// (mesma ideia do recorte automático: linhas de texto alinhadas horizontal-
// mente concentram bordas em faixas nítidas, em vez de espalhadas). Usar
// energia de borda em vez de um limiar de intensidade evita que o fundo que
// sobra nos cantos do recorte retangular (o documento pode estar rotacionado
// dentro da caixa) seja confundido com "tinta". A busca aplica a MESMA
// função de rotação usada para corrigir a imagem final, então não há risco
// de inverter o sinal do ângulo. ---

function rotateCanvas(canvas: HTMLCanvasElement, angleDeg: number): HTMLCanvasElement {
  if (!angleDeg) return canvas;
  const rad = (angleDeg * Math.PI) / 180;
  const w = canvas.width;
  const h = canvas.height;
  const sin = Math.abs(Math.sin(rad));
  const cos = Math.abs(Math.cos(rad));
  const newW = Math.max(1, Math.round(w * cos + h * sin));
  const newH = Math.max(1, Math.round(w * sin + h * cos));
  const out = newCanvas(newW, newH);
  const ctx = out.getContext("2d")!;
  // Cantos expostos pela rotação viram fundo branco (papel), não transparência.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, newW, newH);
  ctx.translate(newW / 2, newH / 2);
  ctx.rotate(rad);
  ctx.drawImage(canvas, -w / 2, -h / 2);
  return out;
}

function rowEdgeEnergyVariance(canvas: HTMLCanvasElement): number {
  const { data: gray, w, h } = grayscaleOf(canvas);
  const rowEnergy = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = 1; x < w; x++) {
      s += Math.abs(gray[y * w + x] - gray[y * w + x - 1]);
    }
    rowEnergy[y] = s;
  }
  let mean = 0;
  for (let i = 0; i < h; i++) mean += rowEnergy[i];
  mean /= h || 1;
  let variance = 0;
  for (let i = 0; i < h; i++) {
    const diff = rowEnergy[i] - mean;
    variance += diff * diff;
  }
  return variance / (h || 1);
}

function estimateSkewAngle(canvas: HTMLCanvasElement): number {
  const maxDim = Math.max(canvas.width, canvas.height);
  const scale = Math.min(1, 400 / maxDim);
  const sw = Math.max(1, Math.round(canvas.width * scale));
  const sh = Math.max(1, Math.round(canvas.height * scale));
  const small = newCanvas(sw, sh);
  small.getContext("2d")!.drawImage(canvas, 0, 0, sw, sh);

  let bestAngle = 0;
  let bestScore = -Infinity;
  for (let a = -10; a <= 10; a++) {
    const candidate = a === 0 ? small : rotateCanvas(small, a);
    const score = rowEdgeEnergyVariance(candidate);
    if (score > bestScore) {
      bestScore = score;
      bestAngle = a;
    }
  }
  // Abaixo de 1° o ganho não compensa o leve corte de bordas da rotação.
  return Math.abs(bestAngle) >= 1 ? bestAngle : 0;
}

// --- Remoção de sombra/iluminação irregular: estima o "fundo" reduzindo a
// imagem a poucos pixels e reampliando (equivalente barato a um blur muito
// forte), depois normaliza cada pixel pela luminância local do fundo. ---

function estimateBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const sw = 48;
  const sh = Math.max(1, Math.round((canvas.height / canvas.width) * sw));
  const small = newCanvas(sw, sh);
  small.getContext("2d")!.drawImage(canvas, 0, 0, sw, sh);

  const bg = newCanvas(canvas.width, canvas.height);
  const ctx = bg.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small, 0, 0, bg.width, bg.height);
  return bg;
}

function removeShadow(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const bg = estimateBackground(canvas);
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const bctx = bg.getContext("2d", { willReadFrequently: true })!;
  const bimg = bctx.getImageData(0, 0, w, h);
  const d = img.data;
  const bd = bimg.data;
  for (let i = 0; i < d.length; i += 4) {
    const bgLum = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
    // Limita o fator para não estourar o branco quando o fundo estimado sai
    // escuro demais (ex.: documento ocupando quase todo o frame).
    const factor = bgLum > 5 ? Math.min(3, 255 / bgLum) : 1;
    d[i] = clamp(d[i] * factor);
    d[i + 1] = clamp(d[i + 1] * factor);
    d[i + 2] = clamp(d[i + 2] * factor);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// --- Redução leve de ruído: blur em caixa separável (rápido, O(w·h) e
// independente do raio) misturado a 40% com a imagem original. ---

function boxBlurSeparable(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const size = radius * 2 + 1;

  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -radius; x <= radius; x++) {
        const xx = Math.min(w - 1, Math.max(0, x));
        sum += src[(y * w + xx) * 4 + c];
      }
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 4 + c] = sum / size;
        const addX = Math.min(w - 1, x + radius + 1);
        const removeX = Math.max(0, x - radius);
        sum += src[(y * w + addX) * 4 + c] - src[(y * w + removeX) * 4 + c];
      }
    }
  }

  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -radius; y <= radius; y++) {
        const yy = Math.min(h - 1, Math.max(0, y));
        sum += tmp[(yy * w + x) * 4 + c];
      }
      for (let y = 0; y < h; y++) {
        out[(y * w + x) * 4 + c] = sum / size;
        const addY = Math.min(h - 1, y + radius + 1);
        const removeY = Math.max(0, y - radius);
        sum += tmp[(addY * w + x) * 4 + c] - tmp[(removeY * w + x) * 4 + c];
      }
    }
  }
  return out;
}

function denoiseLight(canvas: HTMLCanvasElement, amount = 0.4): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const blurred = boxBlurSeparable(d, w, h, 1);
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] * (1 - amount) + blurred[i] * amount);
    d[i + 1] = clamp(d[i + 1] * (1 - amount) + blurred[i + 1] * amount);
    d[i + 2] = clamp(d[i + 2] * (1 - amount) + blurred[i + 2] * amount);
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// --- Autocontraste: alonga o histograma de luminância e aplica o mesmo
// fator a R/G/B (preserva a cor em vez de dessaturar como em lib/ocr.ts,
// que converte tudo para cinza). ---

function autocontrastColor(canvas: HTMLCanvasElement, boost = 1.25): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (lum < min) min = lum;
    if (lum > max) max = lum;
  }
  const range = Math.max(1, max - min);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      let v = ((d[i + c] - min) / range) * 255;
      v = (v - 128) * boost + 128;
      d[i + c] = clamp(v);
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// --- Upscaling clássico (interpolação bicúbica nativa do Canvas — nunca
// generativo) para fotos tiradas de longe. ---

function upscaleIfSmall(
  canvas: HTMLCanvasElement,
  targetMaxDim: number,
  maxFactor = 2.2
): HTMLCanvasElement {
  const maxDim = Math.max(canvas.width, canvas.height);
  if (maxDim >= targetMaxDim) return canvas;
  const scale = Math.min(maxFactor, targetMaxDim / maxDim);
  const w = Math.round(canvas.width * scale);
  const h = Math.round(canvas.height * scale);
  const out = newCanvas(w, h);
  const ctx = out.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, w, h);
  return out;
}

export function enhanceDocumentImage(
  source: ImageBitmap | HTMLCanvasElement,
  options: EnhanceOptions = {}
): EnhanceResult {
  const opts = { ...DEFAULTS, ...options };
  let canvas = sourceToCanvas(source);
  let changed = false;

  if (opts.crop) {
    const cropped = cropToContent(canvas);
    if (cropped !== canvas) {
      canvas = cropped;
      changed = true;
    }
  }

  if (opts.deskew) {
    const angle = estimateSkewAngle(canvas);
    if (angle) {
      canvas = rotateCanvas(canvas, angle);
      changed = true;
    }
  }

  if (opts.shadowRemoval) canvas = removeShadow(canvas);
  if (opts.denoise) canvas = denoiseLight(canvas);
  if (opts.contrast) canvas = autocontrastColor(canvas);
  canvas = upscaleIfSmall(canvas, opts.targetMaxDim);

  return { canvas, changed };
}

/** Gera a versão "otimizada para leitura" de um arquivo de imagem como Blob — nunca sobrescreve o original. */
export async function enhanceImageFileToBlob(
  file: File,
  options?: EnhanceOptions
): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Não foi possível decodificar a imagem.");
  }
  try {
    const { canvas } = enhanceDocumentImage(bitmap, options);
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, type, 0.92)
    );
    if (!blob) throw new Error("Não foi possível gerar a imagem otimizada.");
    return blob;
  } finally {
    bitmap.close();
  }
}
