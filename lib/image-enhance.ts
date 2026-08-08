// Pipeline de melhoria de imagem para fotos de documentos (RG, CNH, contratos
// fotografados com o celular etc.), com o objetivo de fazer a foto passar por
// uma digitalização: correção de perspectiva a partir dos quatro cantos da
// folha (lib/perspective.ts), remoção de sombra/iluminação irregular, redução
// leve de ruído, níveis por percentil, nitidez e upscaling clássico
// (interpolação nativa do Canvas — nunca generativo). Tudo roda no navegador,
// em Canvas puro, sem dependências novas.
//
// Cada etapa só altera legibilidade, nunca o conteúdo: nenhuma etapa "inventa"
// pixels (upscaling é interpolação clássica) e o arquivo original nunca é
// sobrescrito — estas funções sempre produzem uma cópia num canvas novo.
//
// Deliberadamente NÃO inclui binarização (preto e branco puro): o pipeline de
// OCR deste projeto já é calibrado em cima de imagens em escala de cinza
// (ver lib/ocr.ts) e binarizar por padrão arriscaria perder traços finos e
// regredir a precisão já calibrada.

import { detectDocumentQuad, warpToRectangle } from "./perspective";

export interface EnhanceOptions {
  /** Amplia a imagem até essa dimensão máxima quando ela for menor. */
  targetMaxDim?: number;
  /** Detecta os cantos da folha e a estica para um retângulo ("efeito scanner"). */
  perspective?: boolean;
  /** Recorte por caixa — usado só quando a detecção de perspectiva falha. */
  crop?: boolean;
  deskew?: boolean;
  shadowRemoval?: boolean;
  denoise?: boolean;
  contrast?: boolean;
  sharpen?: boolean;
}

const DEFAULTS: Required<EnhanceOptions> = {
  targetMaxDim: 1800,
  perspective: true,
  crop: true,
  deskew: true,
  shadowRemoval: true,
  denoise: true,
  contrast: true,
  sharpen: true,
};

export interface EnhanceResult {
  canvas: HTMLCanvasElement;
  /** true se o enquadramento (perspectiva, recorte ou rotação) foi aplicado. */
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

// --- Remoção de sombra/iluminação irregular: estima o "papel" (a luminância
// que o fundo teria sem tinta) e normaliza cada pixel por ela.
//
// A estimativa reduz a imagem a poucos pixels e aplica um filtro de MÁXIMO
// local antes de reampliar. O máximo é o que faz diferença aqui: uma média
// simples é puxada para baixo pelo próprio texto, e dividir por ela lava as
// letras junto com a sombra. O máximo local ignora a tinta e captura só a
// iluminação do papel — inclusive as dobras de um papel amassado. ---

// Parâmetros do campo de iluminação, na escala reduzida de 160px de largura.
// Calibrados empiricamente contra quatro casos: foto em ângulo, papel amassado,
// documento com foto 3x4 e digitalização já limpa (ver README).
const BG_MAX_RADIUS = 3;
const BG_BLUR_RADIUS = 16;
// Abaixo desta fração do papel iluminado, o pixel é tratado como CONTEÚDO e
// não como sombra — é isso que impede a foto do documento de ser apagada.
const SHADOW_FLOOR_RATIO = 0.72;

function maxFilter(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < 3; c++) {
        let max = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          for (let dx = -radius; dx <= radius; dx++) {
            const xx = Math.min(w - 1, Math.max(0, x + dx));
            const v = src[(yy * w + xx) * 4 + c];
            if (v > max) max = v;
          }
        }
        out[(y * w + x) * 4 + c] = max;
      }
      out[(y * w + x) * 4 + 3] = 255;
    }
  }
  return out;
}

// A resolução da estimativa é um equilíbrio: grosseira demais não acompanha as
// dobras de um papel amassado (sobram manchas), fina demais começa a "ver" o
// conteúdo e o lava junto. 160px de largura com raio 3 no máximo local cobre
// ~2 linhas de texto na escala reduzida — passa por cima da tinta e ainda
// segue as ondulações da folha.
//
// O borrão depois do máximo é o que protege regiões de tom contínuo (a foto
// 3x4 de um RG, um brasão): sem ele, o máximo local dentro da foto é a própria
// foto, a divisão normaliza a foto contra ela mesma e ela sai estourada em
// branco. Borrando, a estimativa vira um campo de ILUMINAÇÃO suave — que é o
// que ela deveria ser — em vez de acompanhar o conteúdo.
function estimateBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const sw = Math.min(160, canvas.width);
  const sh = Math.max(1, Math.round((canvas.height / canvas.width) * sw));
  const small = newCanvas(sw, sh);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, sw, sh);

  const img = sctx.getImageData(0, 0, sw, sh);
  const dilated = maxFilter(img.data, sw, sh, BG_MAX_RADIUS);
  const smoothed = boxBlurSeparable(dilated, sw, sh, BG_BLUR_RADIUS);
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = smoothed[i];
    img.data[i + 1] = smoothed[i + 1];
    img.data[i + 2] = smoothed[i + 2];
    img.data[i + 3] = 255;
  }
  sctx.putImageData(img, 0, 0);

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

  // Nível do papel bem iluminado, para servir de referência.
  let paperLevel = 0;
  for (let i = 0; i < bd.length; i += 4) {
    const lum = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
    if (lum > paperLevel) paperLevel = lum;
  }
  // Sombra de foto de celular escurece o papel, mas não o faz ficar mais escuro
  // que ~metade do papel iluminado. Abaixo disso é CONTEÚDO (uma foto colada,
  // um fundo escuro impresso), não iluminação — e tratar conteúdo como sombra é
  // o que apaga a foto do documento. A trava impede esse caso.
  const floor = Math.max(1, paperLevel * SHADOW_FLOOR_RATIO);

  for (let i = 0; i < d.length; i += 4) {
    const bgLum = Math.max(
      floor,
      0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2]
    );
    const factor = Math.min(2.2, 255 / bgLum);
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

// --- Acabamento de digitalização: níveis por PERCENTIL, não por mínimo e
// máximo absolutos. Um único pixel queimado ou um respingo preto bastam para
// travar um autocontraste por min/max e deixar a imagem só "clareada"; os
// percentis ignoram esses extremos e levam o papel a branco de verdade e o
// texto a preto de verdade — que é o que dá a impressão de página escaneada. ---

function scanLevels(canvas: HTMLCanvasElement, gamma = 1.15): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  }
  const total = d.length / 4;

  const percentile = (p: number) => {
    const target = total * p;
    let acc = 0;
    for (let v = 0; v < 256; v++) {
      acc += hist[v];
      if (acc >= target) return v;
    }
    return 255;
  };

  // O papel domina a área da imagem, então o percentil alto cai sobre ele.
  // O ponto de branco fica um pouco ABAIXO desse nível de propósito: o que
  // sobrou de sombra/vinco depois da normalização vive nessa faixa logo abaixo
  // do papel, e é justamente ele que faz a imagem parecer "foto clareada" em
  // vez de digitalizada. Cortar essa faixa para branco puro é o que os apps de
  // scanner fazem — e 10% é margem suficiente para não comer conteúdo legítimo
  // (foto do RG, carimbos claros ficam bem abaixo disso).
  const paper = percentile(0.65);
  const white = paper * 0.9;
  // O ponto de preto sai da tinta — mas num documento com pouquíssimo texto
  // (uma certidão de duas linhas, uma página quase em branco) a tinta não
  // chega a 2% dos pixels e o percentil baixo cai sobre o PRÓPRIO PAPEL. Sem
  // o teto abaixo, preto e branco colapsam num intervalo minúsculo e a página
  // inteira sai preta. O teto mantém o preto bem abaixo do branco sempre.
  const black = Math.min(percentile(0.02), white * 0.6);
  if (white - black < 20) return canvas; // contraste já plano; não force

  const range = white - black;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) {
    const normalized = Math.min(1, Math.max(0, (v - black) / range));
    lut[v] = clamp(Math.pow(normalized, gamma) * 255);
  }
  for (let i = 0; i < d.length; i += 4) {
    d[i] = lut[d[i]];
    d[i + 1] = lut[d[i + 1]];
    d[i + 2] = lut[d[i + 2]];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

// --- Nitidez (unsharp mask): devolve o "corte" das letras que a foto de
// celular e a reamostragem da perspectiva suavizam. ---

function unsharpMask(canvas: HTMLCanvasElement, amount = 0.6): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const blurred = boxBlurSeparable(d, w, h, 1);
  for (let i = 0; i < d.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      d[i + c] = clamp(d[i + c] + amount * (d[i + c] - blurred[i + c]));
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
  let framed = false;

  // Enquadramento: primeiro tenta achar os quatro cantos da folha e esticá-la
  // para um retângulo — é o que transforma a foto numa página, em vez de só
  // recortá-la. Se a detecção não for confiável, cai no recorte por caixa +
  // rotação, que não depende de achar cantos.
  if (opts.perspective) {
    const quad = detectDocumentQuad(canvas);
    if (quad) {
      const warped = warpToRectangle(canvas, quad);
      if (warped) {
        canvas = warped;
        changed = true;
        framed = true;
      }
    }
  }

  if (!framed && opts.crop) {
    const cropped = cropToContent(canvas);
    if (cropped !== canvas) {
      canvas = cropped;
      changed = true;
    }
  }

  // Depois do endireitamento por perspectiva as linhas já estão na horizontal;
  // rodar o deskew de novo só arriscaria reintroduzir uma inclinação.
  if (!framed && opts.deskew) {
    const angle = estimateSkewAngle(canvas);
    if (angle) {
      canvas = rotateCanvas(canvas, angle);
      changed = true;
    }
  }

  if (opts.shadowRemoval) canvas = removeShadow(canvas);
  if (opts.denoise) canvas = denoiseLight(canvas);
  if (opts.contrast) canvas = scanLevels(canvas);
  canvas = upscaleIfSmall(canvas, opts.targetMaxDim);
  if (opts.sharpen) canvas = unsharpMask(canvas);

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
