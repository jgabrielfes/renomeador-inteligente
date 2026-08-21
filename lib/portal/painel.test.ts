/**
 * Testes do motor do Painel do Cliente — o contrato central é ANTI-VAZAMENTO:
 * dado um caso com dados sensíveis (honorários, notas internas, folha de
 * partilha, outros herdeiros), o snapshot publicado NÃO os contém, nem por
 * campo extra contrabandeado na entrada, nem por referência compartilhada.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/portal/painel.test.ts
 */

import {
  AVISO_QUINHAO,
  FASES_EXTRAJUDICIAL,
  FASES_JUDICIAL,
  montarPaineisDoCaso,
  VISIBILIDADE_PADRAO,
  type EntradaPainel,
  type VisibilidadePainel,
} from './painel';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}
function eq(nome: string, a: unknown, e: unknown) {
  teste(nome, JSON.stringify(a) === JSON.stringify(e), `esperado ${JSON.stringify(e)}, obtido ${JSON.stringify(a)}`);
}

const TUDO_VISIVEL: VisibilidadePainel = { contato: true, custos: true, quinhao: true };

function entradaBase(): EntradaPainel {
  return {
    nomeFalecido: 'José Exemplo',
    advogado: { nome: 'Dra. Advogada Teste', telefone: '11 90000-0000', email: 'adv@exemplo.com' },
    rito: 'EXTRAJUDICIAL',
    faseAtual: 'itcmd',
    proximoPasso: { texto: 'Emitir a guia do imposto', dataEstimada: '2026-09-15' },
    custos: [
      { rotulo: 'ITCMD', valor: '12000.00', situacao: 'PREVISTO' },
      { rotulo: 'Certidões', valor: '350.00', situacao: 'PAGO' },
    ],
    historico: [{ data: '2026-08-12', texto: 'Guia do ITCMD emitida' }],
    convites: [
      { token: 'token-da-ana', nomeHerdeiro: 'Ana Herdeira', quinhao: { valor: '150000.00', fracao: '1/3' } },
      { token: 'token-do-bruno', nomeHerdeiro: 'Bruno Herdeiro', quinhao: { valor: '150000.00', fracao: '1/3' } },
    ],
  };
}

console.log('\nPainel do Cliente — motor do espelho filtrado\n');

/* ---------- estrutura básica e segmentação por convite ---------- */

{
  const paineis = montarPaineisDoCaso(entradaBase(), TUDO_VISIVEL);
  eq('um painel por token', Object.keys(paineis).sort(), ['token-da-ana', 'token-do-bruno']);

  const ana = JSON.stringify(paineis['token-da-ana']);
  teste('painel da Ana não contém o nome do Bruno', !ana.includes('Bruno'));
  teste('painel do Bruno não contém o nome da Ana', !JSON.stringify(paineis['token-do-bruno']).includes('Ana'));
  teste('painel da Ana não contém o token do Bruno', !ana.includes('token-do-bruno'));
  eq('quinhão da Ana é só o dela', paineis['token-da-ana'].quinhao, {
    valor: '150000.00', fracao: '1/3', aviso: AVISO_QUINHAO,
  });
}

/* ---------- anti-vazamento: campos sensíveis contrabandeados ---------- */

{
  // A folha real tem MUITO mais campos que a EntradaPainel. Simula um call
  // site descuidado que passa o objeto rico inteiro: nada disso pode
  // atravessar, porque a montagem é por allowlist (campo a campo).
  const contaminada = {
    ...entradaBase(),
    honorarios: { percentual: 10, valor: '45000.00' },
    notas: 'cliente difícil, cobrar sinal antes',
    partilha: { matriz: { 'bem-1': { 'ana': 50, 'bruno': 50 } } },
    analiseMatricula: 'ônus ativo de hipoteca',
    minuta: 'SAIBAM quantos esta virem…',
    advogado: {
      nome: 'Dra. Advogada Teste',
      telefone: '11 90000-0000',
      email: 'adv@exemplo.com',
      oab: 'OAB/SP 123.456',
      honorariosPorHora: '500.00',
    },
    custos: [
      { rotulo: 'ITCMD', valor: '12000.00', situacao: 'PREVISTO', notaInterna: 'renegociar' },
    ],
    historico: [{ data: '2026-08-12', texto: 'Guia do ITCMD emitida', autorInterno: 'estagiário' }],
    convites: [
      {
        token: 'token-da-ana',
        nomeHerdeiro: 'Ana Herdeira',
        cpf: '111.222.333-44',
        quinhao: { valor: '150000.00', fracao: '1/3', memoriaDeCalculo: 'legítima 2/3…' },
      },
    ],
  } as unknown as EntradaPainel;

  const texto = JSON.stringify(montarPaineisDoCaso(contaminada, TUDO_VISIVEL));
  for (const proibido of [
    'honorarios', '45000', 'cobrar sinal', 'matriz', 'hipoteca', 'SAIBAM',
    'OAB', 'honorariosPorHora', 'notaInterna', 'renegociar', 'autorInterno',
    'estagiário', '111.222.333-44', 'memoriaDeCalculo', 'legítima',
  ]) {
    teste(`snapshot não contém "${proibido}"`, !texto.includes(proibido));
  }
}

/* ---------- alternâncias de visibilidade (padrão restritivo) ---------- */

{
  const paineis = montarPaineisDoCaso(entradaBase(), VISIBILIDADE_PADRAO);
  const p = paineis['token-da-ana'];
  eq('padrão: sem custos', p.custos, undefined);
  eq('padrão: sem quinhão', p.quinhao, undefined);
  teste('padrão: contato do advogado aparece', p.advogado.telefone === '11 90000-0000');

  const texto = JSON.stringify(paineis);
  teste('sem quinhão liberado, o VALOR não está em lugar nenhum', !texto.includes('150000'));
  teste('sem custos visíveis, o valor do ITCMD não está no snapshot', !texto.includes('12000'));
}

{
  const semContato = montarPaineisDoCaso(entradaBase(), { contato: false, custos: true, quinhao: true });
  const p = semContato['token-da-ana'];
  eq('contato desligado: nome fica, telefone/e-mail somem', p.advogado, { nome: 'Dra. Advogada Teste' });
  teste('contato desligado: e-mail não está no snapshot', !JSON.stringify(semContato).includes('adv@exemplo.com'));
}

{
  const entrada = entradaBase();
  entrada.convites[0].quinhao = undefined;
  const p = montarPaineisDoCaso(entrada, TUDO_VISIVEL)['token-da-ana'];
  eq('quinhão liberado mas sem valor lançado: não aparece', p.quinhao, undefined);
}

/* ---------- linha do tempo das fases ---------- */

{
  const p = montarPaineisDoCaso(entradaBase(), TUDO_VISIVEL)['token-da-ana'];
  eq('extrajudicial tem 5 fases', p.fases.length, FASES_EXTRAJUDICIAL.length);
  eq('fase atual = itcmd', p.fases.filter((f) => f.atual).map((f) => f.id), ['itcmd']);
  eq('anteriores concluídas', p.fases.filter((f) => f.concluida).map((f) => f.id), ['documentos', 'minuta']);
  teste('posteriores nem atuais nem concluídas', p.fases.slice(3).every((f) => !f.atual && !f.concluida));
  teste('toda fase tem descrição leiga', p.fases.every((f) => f.descricao.length > 20));
}

{
  const entrada = entradaBase();
  entrada.rito = 'JUDICIAL';
  entrada.faseAtual = 'sentenca';
  const p = montarPaineisDoCaso(entrada, TUDO_VISIVEL)['token-da-ana'];
  eq('judicial tem 9 fases', p.fases.length, FASES_JUDICIAL.length);
  eq('fase atual = sentença', p.fases.filter((f) => f.atual).map((f) => f.id), ['sentenca']);
}

{
  const entrada = entradaBase();
  entrada.faseAtual = 'fase-que-nao-existe';
  const p = montarPaineisDoCaso(entrada, TUDO_VISIVEL)['token-da-ana'];
  eq('fase desconhecida cai na primeira', p.fases.filter((f) => f.atual).map((f) => f.id), ['documentos']);
  eq('…sem nada concluído', p.fases.filter((f) => f.concluida).length, 0);
}

/* ---------- próximo passo e textos vazios ---------- */

{
  const entrada = entradaBase();
  entrada.proximoPasso = { texto: '   ' };
  const p = montarPaineisDoCaso(entrada, TUDO_VISIVEL)['token-da-ana'];
  eq('próximo passo em branco não entra', p.proximoPasso, undefined);
}

{
  const entrada = entradaBase();
  entrada.advogado.telefone = '';
  const p = montarPaineisDoCaso(entrada, TUDO_VISIVEL)['token-da-ana'];
  eq('telefone vazio vira ausente (não string vazia)', p.advogado.telefone, undefined);
}

/* ---------- isolamento de referências entre painéis ---------- */

{
  const paineis = montarPaineisDoCaso(entradaBase(), TUDO_VISIVEL);
  paineis['token-da-ana'].fases[0].titulo = 'ALTERADO';
  paineis['token-da-ana'].historico[0].texto = 'ALTERADO';
  teste('mutar o painel da Ana não afeta o do Bruno (fases)',
    paineis['token-do-bruno'].fases[0].titulo !== 'ALTERADO');
  teste('mutar o painel da Ana não afeta o do Bruno (histórico)',
    paineis['token-do-bruno'].historico[0].texto !== 'ALTERADO');
  teste('as constantes de fase não foram mutadas', FASES_EXTRAJUDICIAL[0].titulo === 'Reunindo documentos');
}

/* ---------- convite sem token é ignorado ---------- */

{
  const entrada = entradaBase();
  entrada.convites.push({ token: '', nomeHerdeiro: 'Sem Token' });
  const paineis = montarPaineisDoCaso(entrada, TUDO_VISIVEL);
  eq('convite sem token não gera painel', Object.keys(paineis).length, 2);
}

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
