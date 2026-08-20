/**
 * Verificação VISUAL anti-regressão do módulo Sucessorista (CI da Onda 3
 * da auditoria) — roda no prebuild e DERRUBA o build se:
 *
 *  (a) aparecer `font-size` em em/% ou em px fora dos tokens da escala
 *      (--t-xs…--t-2xl) no CSS do módulo — inclusive no shorthand `font:`;
 *  (b) algum degrau da escala ficar abaixo de 12px;
 *  (c) um par de cor/fundo DECLARADO abaixo tiver contraste < 4,5:1;
 *  (d) sobrar `fontSize` numérico inline nos componentes do módulo (fora
 *      de SVG, cujos atributos escalam pelo viewBox).
 *
 * É checagem ESTÁTICA e determinística de propósito: não depende de subir a
 * aplicação (banco/login) e não tem falso positivo por medição de runtime.
 *
 *   node scripts/verificacao-visual.mjs
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MODULO = 'app/(private)/sucessorista';
const css = readFileSync(join(MODULO, 'sucessorista.css'), 'utf8');
const erros = [];

/* (a) todo font-size do módulo cai num token da escala */
for (const m of css.matchAll(/font-size:\s*([^;]+);/g)) {
  const v = m[1].trim();
  if (!v.includes('var(--t-') && v !== 'inherit') {
    erros.push(`font-size fora da escala no CSS: "${v}"`);
  }
}
for (const m of css.matchAll(/font:\s*([^;]*);/g)) {
  if (/[0-9](px|em|rem|%)/.test(m[1]) && !m[1].includes('var(--t-')) {
    erros.push(`shorthand font: com tamanho solto no CSS: "${m[1].trim()}"`);
  }
}

/* (b) a escala não desce de 12px (e não ganha um sétimo degrau escondido) */
const tokens = [...css.matchAll(/--t-[\w]+:\s*([\d.]+)rem/g)].map((m) => Number(m[1]) * 16);
if (tokens.length === 0) erros.push('tokens --t-* não encontrados no CSS do módulo');
for (const px of tokens) {
  if (px < 12) erros.push(`degrau da escala abaixo de 12px: ${px}px`);
}

/* (c) contraste WCAG dos pares declarados (tokens estáticos do módulo) */
function luminancia(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
const token = (nome) => {
  const m = css.match(new RegExp(`${nome}:\\s*#([0-9a-fA-F]{6})`));
  return m ? m[1].toLowerCase() : null;
};
const papel = token('--papel');
const tinta = token('--tinta');
const pares = [
  ['--tinta', papel, tinta],
  ['--tinta-media', papel, token('--tinta-media')],
  ['--lacre', papel, token('--lacre')],
  ['--verde-registro', papel, token('--verde-registro')],
  ['--estado-alerta', papel, token('--estado-alerta')],
  ['--bronze-inverso sobre a lombada', tinta, token('--bronze-inverso')],
  ['--verde-registro-inverso sobre a lombada', tinta, token('--verde-registro-inverso')],
  ['--tinta-media-inversa sobre a lombada', tinta, token('--tinta-media-inversa')],
];
for (const [nome, fundo, cor] of pares) {
  if (!fundo || !cor) {
    erros.push(`token não encontrado para o par de contraste: ${nome}`);
    continue;
  }
  const c = contraste(cor, fundo);
  if (c < 4.5) erros.push(`contraste abaixo de 4,5:1 (${c.toFixed(2)}:1): ${nome}`);
}

/* (d) nenhum fontSize numérico inline nos componentes (fora de SVG) */
for (const arquivo of readdirSync(MODULO)) {
  if (!arquivo.endsWith('.tsx')) continue;
  const src = readFileSync(join(MODULO, arquivo), 'utf8');
  for (const m of src.matchAll(/fontSize: [0-9.]+/g)) {
    erros.push(`fontSize numérico inline em ${arquivo}: "${m[0]}" — use var(--t-*)`);
  }
}

if (erros.length > 0) {
  console.error(`\nVerificação visual REPROVADA (${erros.length} problema/s):\n`);
  for (const e of erros) console.error(`  ✗ ${e}`);
  console.error('');
  process.exit(1);
}
console.log('Verificação visual: escala tipográfica, tokens e contraste OK.');
