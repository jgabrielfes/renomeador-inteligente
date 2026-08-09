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
  // ~200 dpi numa folha A4: o alvo aqui e IMPRESSAO legivel, e 1800 px
  // (~150 dpi) deixava texto pequeno esgarcado no papel.
  targetMaxDim: 2400,
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

/** Limiar de Otsu: separa tinta de papel sem constante mágica. */
function otsu(gray: Uint8ClampedArray): number {
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

  const bounds = findBounds(rowEnergy, colEnergy, sw, sh);

  // A energia de borda acha onde o documento começa, mas uma região de tinta
  // fraca (carimbo claro, texto apagado) tem borda fraca e ficaria de fora.
  // Unir com a caixa da TINTA garante que nada escrito seja cortado — é
  // preferível sobrar fundo a perder conteúdo.
  const limiar = otsu(gray);
  let inkTop = sh;
  let inkBottom = -1;
  let inkLeft = sw;
  let inkRight = -1;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (gray[y * sw + x] >= limiar) continue;
      if (y < inkTop) inkTop = y;
      if (y > inkBottom) inkBottom = y;
      if (x < inkLeft) inkLeft = x;
      if (x > inkRight) inkRight = x;
    }
  }
  const top = inkBottom >= 0 ? Math.min(bounds.top, inkTop) : bounds.top;
  const bottom = inkBottom >= 0 ? Math.max(bounds.bottom, inkBottom) : bounds.bottom;
  const left = inkRight >= 0 ? Math.min(bounds.left, inkLeft) : bounds.left;
  const right = inkRight >= 0 ? Math.max(bounds.right, inkRight) : bounds.right;

  const boxW = right - left;
  const boxH = bottom - top;
  // Segurança: se a detecção não achou uma região plausível, não corta nada
  // — é preferível manter uma margem de fundo a arriscar cortar conteúdo.
  if (boxW < sw * 0.5 || boxH < sh * 0.5) return canvas;

  const marginX = Math.round(boxW * 0.05);
  const marginY = Math.round(boxH * 0.05);
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
// Raios (na escala reduzida de 160px) dos dois níveis de papel de referência.
const BG_NIVEL_GROSSO_RADIUS = 30;
const BG_NIVEL_MEDIO_RADIUS = 12;
// Raios da interpolação da luz, do mais fino ao mais grosso. O fino segura o
// vinco; o grosso atravessa a foto 3x4.
const BG_RAIOS = [4, 9, 20, 45];
const BG_SUAVIZA_RADIUS = 5;
// Ver marcarPapel: limiar base (protege mancha de conteúdo), piso abaixo do
// qual é tinta, e raio da erosão que separa linha fina de mancha maciça.
// Ver marcarPapel: fração do nível local acima da qual o pixel é semente de
// papel, e quanto dois vizinhos podem diferir para o crescimento continuar.
const PAPEL_SEMENTE = 0.97;
const PAPEL_TOLERANCIA = 9;
// Abaixo desta fração do papel iluminado, o pixel é tratado como CONTEÚDO e
// não como sombra — é isso que impede a foto do documento de ser apagada.
const SHADOW_FLOOR_RATIO = 0.2;
// Teto do ganho da equalizacao. Acima disso a "sombra" provavelmente era
// conteudo escuro, e amplificar so geraria ruido.
const SHADOW_MAX_GAIN = 4;

function maxFilter(
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Uint8ClampedArray {
  // Separável: o máximo de uma janela quadrada é o máximo horizontal seguido
  // do vertical. Sem isso o custo é O(r²) por pixel, e os raios grandes de que
  // a estimativa precisa (para não afundar dentro de uma foto 3x4) ficariam
  // proibitivos.
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);

  for (let c = 0; c < 3; c++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let max = 0;
        const x0 = Math.max(0, x - radius);
        const x1 = Math.min(w - 1, x + radius);
        for (let xx = x0; xx <= x1; xx++) {
          const v = src[(y * w + xx) * 4 + c];
          if (v > max) max = v;
        }
        tmp[(y * w + x) * 4 + c] = max;
      }
    }
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        let max = 0;
        const y0 = Math.max(0, y - radius);
        const y1 = Math.min(h - 1, y + radius);
        for (let yy = y0; yy <= y1; yy++) {
          const v = tmp[(yy * w + x) * 4 + c];
          if (v > max) max = v;
        }
        out[(y * w + x) * 4 + c] = max;
      }
    }
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
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
/** Box blur separável sobre um mapa escalar, com soma corrente (O(1) por pixel). */
function blurEscalar(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const janela = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let soma = 0;
    for (let x = -r; x <= r; x++) soma += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = soma / janela;
      soma += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let soma = 0;
    for (let y = -r; y <= r; y++) soma += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = soma / janela;
      soma += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Marca as regiões de CONTEÚDO de tom contínuo (foto 3x4, faixa escura de
 * cabeçalho, brasão) pela caixa das manchas escuras grandes.
 *
 * O ponto: um bloco desses tem parte escura E parte clara. Só a parte escura
 * cai num limiar de tinta, mas a região INTEIRA precisa sair da estimativa de
 * luz — senão a estimativa acompanha a parte clara do bloco e a divisão
 * achata o bloco. Usar a caixa da mancha resolve, porque esses blocos são
 * aproximadamente retangulares.
 */
/** Nível de papel de referência: máximo local, em luminância. */
function nivelDePapel(
  rgb: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number
): Float32Array {
  const maxRgb = maxFilter(rgb, w, h, radius);
  const out = new Float32Array(w * h);
  for (let i = 0, j = 0; i < maxRgb.length; i += 4, j++) {
    out[j] = 0.299 * maxRgb[i] + 0.587 * maxRgb[i + 1] + 0.114 * maxRgb[i + 2];
  }
  return out;
}

/**
 * Decide quais pixels são PAPEL, ou seja, onde a luz pode ser medida.
 *
 * Nem brilho nem tamanho resolvem: um vinco e uma mancha cinza-clara grande
 * caem na mesma faixa de brilho, e têm áreas parecidas. Tentei limiar simples,
 * limiar + erosão e tapar depressões no campo — todos trocam uma coisa pela
 * outra (medido: o que achata a dobra clareia a mancha, e vice-versa).
 *
 * O que de fato separa os dois é a BORDA. Uma mancha de conteúdo tem contorno
 * nítido; sombra e vinco são rampas suaves. Então o papel é definido por
 * crescimento: parte-se das regiões mais claras (papel com certeza) e cresce-se
 * aceitando vizinhos de brilho parecido. A rampa do vinco é atravessada, o
 * degrau da mancha não — e a mancha fica de fora da medição, preservada.
 *
 * É a mesma ideia da detecção de fundo em lib/perspective.ts, aplicada agora
 * dentro do documento.
 */
function marcarPapel(
  gray: Float32Array,
  nivelPapel: Float32Array,
  w: number,
  h: number
): Float32Array {
  const n = w * h;
  const papel = new Uint8Array(n);
  const fila = new Int32Array(n);
  let head = 0;
  let tail = 0;

  // Sementes: o papel mais claro de cada vizinhança, onde não há dúvida.
  for (let i = 0; i < n; i++) {
    if (gray[i] >= nivelPapel[i] * PAPEL_SEMENTE) {
      papel[i] = 1;
      fila[tail++] = i;
    }
  }
  if (tail === 0) return new Float32Array(n);

  while (head < tail) {
    const p = fila[head++];
    const x = p % w;
    const y = (p / w) | 0;
    const v = gray[p];
    const tenta = (q: number) => {
      if (papel[q] || Math.abs(gray[q] - v) > PAPEL_TOLERANCIA) return;
      papel[q] = 1;
      fila[tail++] = q;
    };
    if (x > 0) tenta(p - 1);
    if (x < w - 1) tenta(p + 1);
    if (y > 0) tenta(p - w);
    if (y < h - 1) tenta(p + w);
  }

  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = papel[i];
  return out;
}

function marcarBlocosDeConteudo(
  gray: Float32Array,
  nivelPapel: Float32Array,
  w: number,
  h: number
): Uint8Array {
  const escuro = new Uint8Array(w * h);
  for (let i = 0; i < gray.length; i++) {
    escuro[i] = gray[i] < nivelPapel[i] * 0.55 ? 1 : 0;
  }

  const visitado = new Uint8Array(w * h);
  const pilha = new Int32Array(w * h);
  const blocos = new Uint8Array(w * h);
  const areaMinima = w * h * 0.012;

  for (let seed = 0; seed < escuro.length; seed++) {
    if (visitado[seed] || !escuro[seed]) continue;
    let topo = 0;
    pilha[topo++] = seed;
    visitado[seed] = 1;
    let area = 0;
    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    while (topo > 0) {
      const p = pilha[--topo];
      area++;
      const x = p % w;
      const y = (p / w) | 0;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x > 0 && !visitado[p - 1] && escuro[p - 1]) { visitado[p - 1] = 1; pilha[topo++] = p - 1; }
      if (x < w - 1 && !visitado[p + 1] && escuro[p + 1]) { visitado[p + 1] = 1; pilha[topo++] = p + 1; }
      if (y > 0 && !visitado[p - w] && escuro[p - w]) { visitado[p - w] = 1; pilha[topo++] = p - w; }
      if (y < h - 1 && !visitado[p + w] && escuro[p + w]) { visitado[p + w] = 1; pilha[topo++] = p + w; }
    }
    // Texto é escuro mas fino: cada letra/linha fica bem abaixo da área mínima.
    if (area < areaMinima) continue;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) blocos[y * w + x] = 1;
    }
  }
  return blocos;
}

/**
 * Campo de ILUMINAÇÃO da foto, estimado SÓ a partir dos pixels de papel.
 *
 * Esta é a diferença que faz a dobra sumir sem estragar o conteúdo. A versão
 * anterior estimava a luz com um máximo local seguido de borrão, e aí um único
 * raio tinha de servir para duas coisas incompatíveis: raio pequeno acompanha
 * o vinco (bom) mas afunda dentro da foto 3x4 e a achata (ruim); raio grande
 * preserva a foto (bom) mas não acompanha o vinco (ruim). Medido: raio 3 dava
 * espalhamento 13 no papel com a foto achatada a 23 de contraste; raio 26
 * salvava a foto e deixava o papel em 54.
 *
 * A saída é escolher DE ONDE medir, e não com que raio: o papel é o único
 * lugar onde a luz é observável (refletância constante), então mede-se só nele
 * e interpola-se por cima da tinta e dos blocos de conteúdo. A interpolação é
 * por convolução normalizada em vários raios — usa sempre o menor raio que
 * tenha papel suficiente por perto, o que mantém o vinco (papel dos dois
 * lados, raio pequeno basta) e atravessa a foto (só há papel longe, cai para
 * um raio grande).
 */
function estimateBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const sw = Math.min(160, canvas.width);
  const sh = Math.max(1, Math.round((canvas.height / canvas.width) * sw));
  const small = newCanvas(sw, sh);
  const sctx = small.getContext("2d", { willReadFrequently: true })!;
  sctx.imageSmoothingEnabled = true;
  sctx.imageSmoothingQuality = "high";
  sctx.drawImage(canvas, 0, 0, sw, sh);

  const img = sctx.getImageData(0, 0, sw, sh);
  const d = img.data;
  const n = sw * sh;

  const gray = new Float32Array(n);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) {
    gray[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  }

  // Nível de papel grosseiro, com raio grande o bastante para atravessar os
  // blocos de conteúdo — serve só para decidir o que é tinta.
  // DUAS escalas de referência, porque as duas decisões pedem coisas opostas:
  //
  //  - achar blocos de conteúdo (foto 3x4, faixa de cabeçalho) exige um raio
  //    GRANDE, que atravesse o bloco e compare com o papel em volta;
  //  - decidir papel × conteúdo pelo brilho relativo exige um raio
  //    INTERMEDIÁRIO: maior que uma mancha chapada (senão o interior dela vira
  //    a própria referência e ela passa por papel) e menor que um painel de
  //    dobra (senão o painel é comparado com o painel vizinho mais claro, é
  //    tomado por conteúdo e a dobra deixa de ser corrigida).
  const nivelGrosso = nivelDePapel(d, sw, sh, BG_NIVEL_GROSSO_RADIUS);
  const nivelMedio = nivelDePapel(d, sw, sh, BG_NIVEL_MEDIO_RADIUS);

  const blocos = marcarBlocosDeConteudo(gray, nivelGrosso, sw, sh);
  const papel = marcarPapel(gray, nivelMedio, sw, sh);
  let quantoPapel = 0;
  for (let i = 0; i < n; i++) {
    if (blocos[i]) papel[i] = 0;
    quantoPapel += papel[i];
  }

  const bg = newCanvas(canvas.width, canvas.height);
  const bctx = bg.getContext("2d")!;
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = "high";

  // Papel de menos para medir: melhor não mexer na iluminação a inventar uma.
  if (quantoPapel < n * 0.08) {
    bctx.drawImage(small, 0, 0, bg.width, bg.height);
    return bg;
  }

  const denoms = BG_RAIOS.map((r) => blurEscalar(papel, sw, sh, r));
  const canal = new Float32Array(n);
  const saida = new Float32Array(n);

  for (let c = 0; c < 3; c++) {
    for (let i = 0, j = 0; i < d.length; i += 4, j++) canal[j] = d[i + c] * papel[j];
    const nums = BG_RAIOS.map((r) => blurEscalar(canal, sw, sh, r));

    for (let i = 0; i < n; i++) {
      let v = -1;
      for (let k = 0; k < BG_RAIOS.length; k++) {
        if (denoms[k][i] >= 0.12) {
          v = nums[k][i] / denoms[k][i];
          break;
        }
      }
      // Nem no maior raio houve papel por perto: usa a média do maior raio.
      saida[i] = v >= 0 ? v : nums[nums.length - 1][i] / Math.max(1e-6, denoms[denoms.length - 1][i]);
    }
    // Suaviza o campo: iluminação não tem degrau.
    const suave = blurEscalar(saida, sw, sh, BG_SUAVIZA_RADIUS);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) d[i + c] = clamp(suave[j]);
  }
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
  sctx.putImageData(img, 0, 0);

  bctx.drawImage(small, 0, 0, bg.width, bg.height);
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

  // Nível do papel na parte MELHOR iluminada da foto — a referência para a
  // qual as partes sombreadas são trazidas.
  let paperLevel = 0;
  for (let i = 0; i < bd.length; i += 4) {
    const lum = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
    if (lum > paperLevel) paperLevel = lum;
  }
  if (paperLevel < 5) return canvas;

  // Sombra de foto de celular escurece o papel, mas não o faz ficar mais escuro
  // que ~72% do papel iluminado. Abaixo disso é CONTEÚDO (uma foto colada,
  // um fundo escuro impresso), não iluminação — e tratar conteúdo como sombra é
  // o que apaga a foto do documento. A trava impede esse caso.
  const floor = Math.max(1, paperLevel * SHADOW_FLOOR_RATIO);

  for (let i = 0; i < d.length; i += 4) {
    const bgLum = Math.max(
      floor,
      0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2]
    );
    // EQUALIZA, não clareia: leva cada região ao nível do papel bem iluminado,
    // e não a 255. Normalizar para 255 aqui somava-se ao ponto de branco dos
    // níveis logo depois, e esse clareamento em dose dupla era o que estourava
    // a luz. Aqui o ganho é 1 na área mais clara da foto e só sobe na sombra.
    const factor = Math.min(SHADOW_MAX_GAIN, paperLevel / bgLum);
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

// gamma 1 de proposito: qualquer curva != 1 desloca os meios-tons, ou seja,
// muda como o conteudo do documento aparece. Aqui so se estica o histograma
// entre preto e branco, que e uma transformacao linear e reversivel.
function scanLevels(canvas: HTMLCanvasElement, gamma = 1): HTMLCanvasElement {
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

  // O ponto de branco é o percentil ALTO — ou seja, o próprio papel, não algo
  // abaixo dele. A versão anterior colocava o branco a 90% do nível do papel
  // para "limpar" o resto da sombra, e era exatamente isso que estourava a luz:
  // TODO conteúdo cinza-claro (carimbo fraco, marca d'água, fundo de segurança,
  // parte clara da foto 3x4) caía nessa faixa e virava branco puro — perda de
  // informação do documento, que é justamente o que não se pode fazer aqui.
  // Com o branco no percentil 0.98, só a franja mais clara do papel satura.
  const white = percentile(0.98);
  // O ponto de preto sai da tinta — mas num documento com pouquíssimo texto
  // (uma certidão de duas linhas, uma página quase em branco) a tinta não
  // chega nem a 1% dos pixels e o percentil baixo cai sobre o PRÓPRIO PAPEL.
  // Sem o teto abaixo, preto e branco colapsam num intervalo minúsculo e a
  // página inteira sai preta. O teto mantém o preto bem abaixo do branco.
  const black = Math.min(percentile(0.004), white * 0.55);
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
      canvas.toBlob(resolve, type, 0.95)
    );
    if (!blob) throw new Error("Não foi possível gerar a imagem otimizada.");
    return blob;
  } finally {
    bitmap.close();
  }
}
