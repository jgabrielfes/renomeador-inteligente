/**
 * Casos de teste do motor de partilha.
 *
 * Roda sem dependência externa:
 *   node --experimental-strip-types lib/partilha/engine.test.ts
 *
 * Com vitest instalado, os mesmos casos funcionam via `describe/it`
 * — basta trocar o runner no final do arquivo.
 */

import { partilhar } from './engine';
import type { Caso, Herdeiro } from './types';

let ok = 0;
let fail = 0;

function ser(v: unknown): string {
  return JSON.stringify(v, (_k, x) => {
    if (typeof x === 'bigint') return `${x}n`;
    if (x && typeof x === 'object' && !Array.isArray(x)) {
      return Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)));
    }
    return x;
  });
}

function eq(nome: string, atual: unknown, esperado: unknown) {
  const a = ser(atual);
  const e = ser(esperado);
  if (a === e) {
    ok += 1;
  } else {
    fail += 1;
    console.error(`  ✗ ${nome}\n      esperado: ${e}\n      obtido:   ${a}`);
  }
}

function valores(caso: Caso): Record<string, string> {
  const r = partilhar(caso);
  if (r.bloqueios.length) {
    return { __bloqueios__: r.bloqueios.join(' | ') };
  }
  const out: Record<string, string> = {};
  for (const q of r.quinhoes) out[q.herdeiroId] = q.valor;
  return out;
}

const filho = (id: string, comum = true): Herdeiro => ({
  id,
  nome: id,
  classe: 'DESCENDENTE',
  grau: 1,
  status: 'ATIVO',
  filhoDoSobrevivente: comum,
});

const base = (over: Partial<Caso>): Caso => ({
  falecido: { dataObito: '2026-03-14' },
  herdeiros: [],
  bens: [],
  ...over,
});

/* ---------------------------------------------------------------- */

console.log('\nMotor de partilha — casos do spec\n');

// 1 — comunhão parcial, 3 filhos comuns, só bens comuns
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_PARCIAL', nome: 'Maria' },
    herdeiros: [filho('f1'), filho('f2'), filho('f3')],
    bens: [{ id: 'b1', descricao: 'imóvel', valor: '900000.00', natureza: 'COMUM' }],
  });
  const r = partilhar(c);
  eq('caso 1 · meação', r.meacao?.valor, '450000.00');
  eq('caso 1 · quinhões', valores(c), { f1: '150000.00', f2: '150000.00', f3: '150000.00' });
}

// 2 — comunhão parcial com bens particulares, 2 filhos comuns
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_PARCIAL', nome: 'Maria' },
    herdeiros: [filho('f1'), filho('f2')],
    bens: [
      { id: 'b1', descricao: 'comum', valor: '600000.00', natureza: 'COMUM' },
      { id: 'b2', descricao: 'particular', valor: '300000.00', natureza: 'PARTICULAR' },
    ],
  });
  const r = partilhar(c);
  eq('caso 2 · meação', r.meacao?.valor, '300000.00');
  eq('caso 2 · herança total', r.heranca.total, '600000.00');
  eq('caso 2 · quinhões', valores(c), {
    __sobrevivente__: '100000.00',
    f1: '250000.00',
    f2: '250000.00',
  });
}

// 3 — comunhão universal, 2 filhos
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_UNIVERSAL', nome: 'Maria' },
    herdeiros: [filho('f1'), filho('f2')],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '800000.00', natureza: 'COMUM' }],
  });
  const r = partilhar(c);
  eq('caso 3 · meação', r.meacao?.valor, '400000.00');
  eq('caso 3 · quinhões', valores(c), { f1: '200000.00', f2: '200000.00' });
}

// 4 — separação convencional, 1 filho, reserva não acionada
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'SEPARACAO_CONVENCIONAL', nome: 'Maria' },
    herdeiros: [filho('f1')],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '600000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 4 · quinhões', valores(c), { __sobrevivente__: '300000.00', f1: '300000.00' });
}

// 5 — separação convencional, 5 filhos comuns, reserva de 1/4 ativa
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'SEPARACAO_CONVENCIONAL', nome: 'Maria' },
    herdeiros: ['f1', 'f2', 'f3', 'f4', 'f5'].map((i) => filho(i)),
    bens: [{ id: 'b1', descricao: 'acervo', valor: '600000.00', natureza: 'PARTICULAR' }],
  });
  const r = partilhar(c);
  eq('caso 5 · reserva sinalizada', r.quinhoes.find((q) => q.papel === 'SOBREVIVENTE')?.reservaUmQuartoAplicada, true);
  eq('caso 5 · quinhões', valores(c), {
    __sobrevivente__: '150000.00',
    f1: '90000.00',
    f2: '90000.00',
    f3: '90000.00',
    f4: '90000.00',
    f5: '90000.00',
  });
}

// 6 — filiação híbrida: emite divergência com os dois cenários
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'SEPARACAO_CONVENCIONAL', nome: 'Maria' },
    herdeiros: [
      filho('f1'), filho('f2'), filho('f3'),
      filho('f4', false), filho('f5', false),
    ],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '600000.00', natureza: 'PARTICULAR' }],
  });
  const r = partilhar(c);
  eq('caso 6 · cenário adotado (Enunciado 527)', valores(c)['__sobrevivente__'], '100000.00');
  const div = r.divergencias.find((d) => d.tema.includes('Filiação híbrida'));
  eq('caso 6 · divergência emitida', div !== undefined, true);
  eq(
    'caso 6 · cenário alternativo',
    div?.quinhoesAlternativos.find((q) => q.herdeiroId === '__sobrevivente__')?.valor,
    '150000.00',
  );
}

// 7 — sem descendentes, pai e mãe vivos
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_PARCIAL', nome: 'Maria' },
    herdeiros: [
      { id: 'pai', nome: 'pai', classe: 'ASCENDENTE', grau: 1, status: 'ATIVO', linha: 'PATERNA' },
      { id: 'mae', nome: 'mae', classe: 'ASCENDENTE', grau: 1, status: 'ATIVO', linha: 'MATERNA' },
    ],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '900000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 7 · quinhões', valores(c), {
    __sobrevivente__: '300000.00',
    pai: '300000.00',
    mae: '300000.00',
  });
}

// 8 — sem descendentes, só a mãe
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'SEPARACAO_CONVENCIONAL', nome: 'Maria' },
    herdeiros: [
      { id: 'mae', nome: 'mae', classe: 'ASCENDENTE', grau: 1, status: 'ATIVO', linha: 'MATERNA' },
    ],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '900000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 8 · quinhões', valores(c), { __sobrevivente__: '450000.00', mae: '450000.00' });
}

// 9 — avós: 2 paternos, 1 materna (art. 1.836, §2º)
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'SEPARACAO_CONVENCIONAL', nome: 'Maria' },
    herdeiros: [
      { id: 'avoP1', nome: 'avoP1', classe: 'ASCENDENTE', grau: 2, status: 'ATIVO', linha: 'PATERNA' },
      { id: 'avoP2', nome: 'avoP2', classe: 'ASCENDENTE', grau: 2, status: 'ATIVO', linha: 'PATERNA' },
      { id: 'avoM1', nome: 'avoM1', classe: 'ASCENDENTE', grau: 2, status: 'ATIVO', linha: 'MATERNA' },
    ],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '900000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 9 · quinhões', valores(c), {
    __sobrevivente__: '450000.00',
    avoP1: '112500.00',
    avoP2: '112500.00',
    avoM1: '225000.00',
  });
}

// 10 — filho pré-morto representado por 2 netos
{
  const c = base({
    herdeiros: [
      filho('f1'), filho('f2'),
      { id: 'f3', nome: 'f3', classe: 'DESCENDENTE', grau: 1, status: 'PRE_MORTO' },
      { id: 'n1', nome: 'n1', classe: 'DESCENDENTE', grau: 2, status: 'ATIVO', ascendenteId: 'f3' },
      { id: 'n2', nome: 'n2', classe: 'DESCENDENTE', grau: 2, status: 'ATIVO', ascendenteId: 'f3' },
    ],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '600000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 10 · representação', valores(c), {
    f1: '200000.00',
    f2: '200000.00',
    n1: '100000.00',
    n2: '100000.00',
  });
}

// 11 — mesmo cenário, mas o filho renuncia: netos não representam
{
  const c = base({
    herdeiros: [
      filho('f1'), filho('f2'),
      { id: 'f3', nome: 'f3', classe: 'DESCENDENTE', grau: 1, status: 'RENUNCIANTE' },
      { id: 'n1', nome: 'n1', classe: 'DESCENDENTE', grau: 2, status: 'ATIVO', ascendenteId: 'f3' },
      { id: 'n2', nome: 'n2', classe: 'DESCENDENTE', grau: 2, status: 'ATIVO', ascendenteId: 'f3' },
    ],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '600000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 11 · renúncia (art. 1.811)', valores(c), { f1: '300000.00', f2: '300000.00' });
}

// 12 — colaterais: 2 bilaterais + 1 unilateral
{
  const c = base({
    herdeiros: [
      { id: 'i1', nome: 'i1', classe: 'COLATERAL', grau: 2, status: 'ATIVO', vinculoIrmao: 'BILATERAL' },
      { id: 'i2', nome: 'i2', classe: 'COLATERAL', grau: 2, status: 'ATIVO', vinculoIrmao: 'BILATERAL' },
      { id: 'i3', nome: 'i3', classe: 'COLATERAL', grau: 2, status: 'ATIVO', vinculoIrmao: 'UNILATERAL' },
    ],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '500000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 12 · art. 1.841', valores(c), {
    i1: '200000.00',
    i2: '200000.00',
    i3: '100000.00',
  });
}

// 13 — união estável, comunhão parcial, sem bens particulares
{
  const c = base({
    sobrevivente: { vinculo: 'UNIAO_ESTAVEL', regime: 'COMUNHAO_PARCIAL', nome: 'Joana' },
    herdeiros: [filho('f1')],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '400000.00', natureza: 'COMUM' }],
  });
  const r = partilhar(c);
  eq('caso 13 · meação', r.meacao?.valor, '200000.00');
  eq('caso 13 · sem concorrência', valores(c), { f1: '200000.00' });
}

// 14 — cônjuge sozinho
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'SEPARACAO_CONVENCIONAL', nome: 'Maria' },
    herdeiros: [],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '500000.00', natureza: 'PARTICULAR' }],
  });
  eq('caso 14 · art. 1.838', valores(c), { __sobrevivente__: '500000.00' });
}

// 15 — testamento consumindo toda a disponível
{
  const c = base({
    herdeiros: [filho('f1'), filho('f2')],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '800000.00', natureza: 'PARTICULAR' }],
    testamento: { existe: true, legados: [{ beneficiario: 'Terceiro', fracaoDaHeranca: '1/2' }] },
  });
  const r = partilhar(c);
  eq('caso 15 · não elegível a extrajudicial', r.elegivelExtrajudicial, false);
  eq('caso 15 · quinhões', valores(c), {
    f1: '200000.00',
    f2: '200000.00',
    __legatario_0__: '400000.00',
  });
}

// 16 — acervo vazio bloqueia
{
  const c = base({ herdeiros: [filho('f1')], bens: [] });
  const r = partilhar(c);
  eq('caso 16 · bloqueio de acervo vazio', r.bloqueios.length > 0, true);
}

// 17 — separação obrigatória com Súmula 377 marcada
{
  const c = base({
    sobrevivente: {
      vinculo: 'CASAMENTO',
      regime: 'SEPARACAO_OBRIGATORIA',
      nome: 'Maria',
      sumula377EsforcoComumProvado: true,
    },
    herdeiros: [filho('f1'), filho('f2')],
    bens: [{ id: 'b1', descricao: 'aquestos', valor: '400000.00', natureza: 'COMUM' }],
  });
  const r = partilhar(c);
  eq('caso 17 · meação sobre aquestos', r.meacao?.valor, '200000.00');
  eq('caso 17 · sem concorrência', valores(c), { f1: '100000.00', f2: '100000.00' });
}

// 18 — resíduo de centavos: 100,00 entre 3 filhos
{
  const c = base({
    herdeiros: [filho('f1'), filho('f2'), filho('f3')],
    bens: [{ id: 'b1', descricao: 'acervo', valor: '100.00', natureza: 'PARTICULAR' }],
  });
  const r = partilhar(c);
  const soma = r.quinhoes.reduce((a, q) => a + BigInt(q.valor.replace('.', '')), 0n);
  eq('caso 18 · soma fecha exatamente', soma === 10000n, true);
  eq('caso 18 · resíduo registrado', r.residuo.ajustados.length, 1);
}

// 19 — fração ideal POR BEM: viúva meeira + 3 filhos, bens todos comuns.
// Cada filho tem 1/3 da herança, mas 1/6 de cada BEM (a outra metade do bem
// é a meação) — o caso relatado do balcão.
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_PARCIAL' },
    herdeiros: [filho('f1'), filho('f2'), filho('f3')],
    bens: [
      { id: 'b1', descricao: 'casa', valor: '600000.00', natureza: 'COMUM' },
      { id: 'b2', descricao: 'saldo', valor: '300000.00', natureza: 'COMUM' },
    ],
  });
  const r = partilhar(c);
  const f1 = r.quinhoes.find((q) => q.herdeiroId === 'f1')!;
  eq('caso 19 · fração da herança 1/3', f1.fracaoHeranca, '1/3');
  eq('caso 19 · fração de cada bem comum 1/6', f1.fracaoBemComum, '1/6');
  eq('caso 19 · sem bem particular', f1.fracaoBemParticular, undefined);
}

// 20 — mistura comum + particular na comunhão parcial: cônjuge concorre só
// nos particulares; frações por bem separadas por natureza.
{
  const c = base({
    sobrevivente: { vinculo: 'CASAMENTO', regime: 'COMUNHAO_PARCIAL' },
    herdeiros: [filho('f1'), filho('f2')],
    bens: [
      { id: 'b1', descricao: 'aquesto', valor: '400000.00', natureza: 'COMUM' },
      { id: 'b2', descricao: 'herdado', valor: '300000.00', natureza: 'PARTICULAR' },
    ],
  });
  const r = partilhar(c);
  const f1 = r.quinhoes.find((q) => q.herdeiroId === 'f1')!;
  const s = r.quinhoes.find((q) => q.herdeiroId === '__sobrevivente__')!;
  // Comum: meação 1/2; filhos dividem a outra metade → 1/4 cada.
  eq('caso 20 · filho: 1/4 de cada bem comum', f1.fracaoBemComum, '1/4');
  // Particular: cônjuge concorre em igualdade com 2 filhos → 1/3 cada.
  eq('caso 20 · filho: 1/3 de cada bem particular', f1.fracaoBemParticular, '1/3');
  eq('caso 20 · cônjuge: 1/3 de cada bem particular', s.fracaoBemParticular, '1/3');
  eq('caso 20 · cônjuge: sem quinhão nos comuns (meação à parte)', s.fracaoBemComum, undefined);
}

/* ---------------------------------------------------------------- */

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
