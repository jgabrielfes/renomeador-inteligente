/**
 * Casos de teste do pipeline da jurimetria registral — fixtures SINTÉTICAS
 * (nenhum dado real de pessoa).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/jurimetria/pipeline.test.ts
 */

import { anonimizar } from './anonimizar';
import { extrairExigenciasLocal, esquemaExtracao, daRespostaLLM } from './extrair';
import { normalizarNomeCartorio, resolverCartorio, resolverTitular } from './resolver';
import { similaridadeTexto, ehDuplicata, encaminhar } from './encaminhar';

let ok = 0,
  fail = 0;
function afirmar(nome: string, cond: boolean, extra?: unknown) {
  if (cond) ok++;
  else {
    fail++;
    console.error(`  ✗ ${nome}`, extra ?? '');
  }
}

console.log('\nJurimetria — pipeline (anonimizar, extrair, resolver, dedupe, encaminhar)\n');

/* ---------- anonimizar: nota sintética com 3 herdeiros e 2 matrículas ---------- */
{
  const nota = [
    'NOTA DE DEVOLUÇÃO. Título prenotado sob nº 123.456.',
    'Interessados: Fulano Dativo Silva, CPF 123.456.789-09, nascido em 01/02/1960,',
    'Beltrana Sicrana de Souza, RG nº 12.345.678-9, e Terceiro Herdeiro Santos,',
    'residentes na Rua das Figueiras Altas, nº 1000, casa 2, CEP 07000-000.',
    'Contato: exemplo@teste.com, telefone (11) 91234-5678.',
    'Referente à matrícula nº 12.345 e à matrícula nº 67.890 deste Registro.',
    '1- Apresentar certidão de casamento atualizada do primeiro interessado.',
  ].join('\n');
  const r = anonimizar(nota);
  afirmar('nota: nenhum CPF sobrevive', !/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(r.texto));
  afirmar('nota: nomes dos 3 herdeiros saem', !/Dativo|Sicrana|Terceiro Herdeiro/.test(r.texto), r.texto);
  afirmar('nota: matrículas viram token', (r.texto.match(/\[MATRICULA\]/g) ?? []).length === 2);
  afirmar('nota: protocolo vira token', r.texto.includes('[PROTOCOLO]'));
  afirmar('nota: endereço vira token', r.texto.includes('[ENDERECO]'));
  afirmar('nota: e-mail e telefone saem', !r.texto.includes('exemplo@teste.com') && !r.texto.includes('91234'));
  afirmar('nota: nascimento vira token preservando o anúncio', /nascido em \[NASCIMENTO\]/.test(r.texto));
  afirmar('nota: ocorrências registradas', r.ocorrencias.length >= 8, r.ocorrencias.length);
  afirmar(
    'nota: a exigência em si permanece legível',
    r.texto.includes('Apresentar certidão de casamento atualizada'),
  );
}

/* ---------- anonimizar: decisão citando registrador (PRESERVAR) ---------- */
{
  const decisao = [
    'Processo de Dúvida. Suscitante: o Oficial Joaquim Registrador Exemplar, do 2º Oficial de',
    'Registro de Imóveis de São Paulo. Suscitada: Maria Requerente Teste, CPF 987.654.321-00.',
    'A exigência de apresentar a certidão de inteiro teor foi mantida pelo juízo.',
  ].join('\n');
  const r = anonimizar(decisao, ['Joaquim Registrador Exemplar']);
  afirmar('decisão: nome do registrador PRESERVADO (allowlist)', r.texto.includes('Joaquim Registrador Exemplar'));
  afirmar('decisão: nome da parte sai', !r.texto.includes('Maria Requerente Teste'));
  afirmar('decisão: instituição preservada', /Registro de Imóveis de São Paulo/.test(r.texto));
  afirmar('decisão: CPF sai', !r.texto.includes('987.654.321-00'));
}

/* ---------- anonimizar: título de agente público preserva sem allowlist ---------- */
{
  const r = anonimizar('Decidiu a Juíza Ana Julgadora Modelo pela manutenção da exigência.');
  afirmar('título "Juíza" antes do nome preserva', r.texto.includes('Ana Julgadora Modelo'), r.texto);
}

/* ---------- anonimizar: texto sem dado pessoal fica intacto ---------- */
{
  const texto =
    'Para o registro do formal de partilha, apresentar a guia do ITCMD e a certidão de casamento.';
  const r = anonimizar(texto);
  afirmar('sem dado pessoal: zero ocorrências', r.ocorrencias.length === 0, r.ocorrencias);
  afirmar('sem dado pessoal: texto idêntico', r.texto === texto);
}

/* ---------- extrair (fallback local pelo triar do Resolvedor) ---------- */
{
  const texto = [
    '1- Apresentar certidão de casamento atualizada, expedida há menos de 90 dias, para a devida averbação.',
    '2- Recolher o ITCMD e apresentar a respectiva guia com o comprovante correspondente.',
  ].join('\n');
  const r = extrairExigenciasLocal(texto, 'CARTORIO_SITE');
  afirmar('local: extrai 2 itens', r.exigencias.length === 2, r.exigencias.length);
  afirmar('local: confiança 0.5 (vai à revisão)', r.confianca === 0.5);
  afirmar('local: sem_julgamento', r.exigencias.every((e) => e.resultado === 'sem_julgamento'));
}

/* ---------- contrato do LLM (Zod) ---------- */
{
  const bruto = {
    cartorio_mencionado: '2º RI da Capital',
    registrador_mencionado: null,
    data_documento: '2025-03-10',
    ato_tipo: 'inventario',
    exigencias: [
      {
        texto_normalizado: 'Apresentar certidão negativa de débitos do ITCMD.',
        fundamentacao: ['Lei 10.705/2000, art. 15'],
        resultado: 'mantida',
        trecho_origem: 'mantida a exigência de quitação do imposto',
        tema: 'itcmd-recolhimento',
      },
    ],
  };
  const v = esquemaExtracao.safeParse(bruto);
  afirmar('zod: resposta válida passa', v.success);
  if (v.success) {
    const e = daRespostaLLM(v.data);
    afirmar('llm→interno: confiança 0.85', e.confianca === 0.85);
    afirmar('llm→interno: tema por exigência', e.temas?.[0] === 'itcmd-recolhimento');
  }
  afirmar(
    'zod: resultado inválido reprova',
    !esquemaExtracao.safeParse({ ...bruto, exigencias: [{ ...bruto.exigencias[0], resultado: 'aceita' }] }).success,
  );
}

/* ---------- resolver cartório ---------- */
{
  const cartorios = [
    { id: 'ri-sp-02', nome: '2º Oficial de Registro de Imóveis de São Paulo/SP', aliases: ['2º RI da Capital', '2º ORI-SP'] },
    { id: 'ri-guarulhos-01', nome: '1º Oficial de Registro de Imóveis de Guarulhos/SP', aliases: ['1º RI de Guarulhos'] },
  ];
  afirmar('resolve alias exato', resolverCartorio('2º RI da Capital', cartorios) === 'ri-sp-02');
  afirmar(
    'resolve por extenso',
    resolverCartorio('Segundo Oficial de Registro de Imóveis de São Paulo', cartorios) === 'ri-sp-02',
  );
  afirmar('resolve sigla ORI', resolverCartorio('2º ORI-SP', cartorios) === 'ri-sp-02');
  afirmar('resolve Guarulhos sem confundir', resolverCartorio('1º RI de Guarulhos', cartorios) === 'ri-guarulhos-01');
  afirmar('não resolve o desconhecido', resolverCartorio('RI de Atlântida', cartorios) === null);
  afirmar('normaliza ordinal por extenso', normalizarNomeCartorio('Décimo Oitavo Registro de Imóveis da Capital').startsWith('18 ri'));
}

/* ---------- resolver titular pela data ---------- */
{
  const titulares = [
    { id: 't-antigo', cartorioId: 'ri-sp-02', titularDesde: new Date('2000-01-01') },
    { id: 't-novo', cartorioId: 'ri-sp-02', titularDesde: new Date('2020-06-01') },
  ];
  afirmar('titular vigente na data recente', resolverTitular(titulares, 'ri-sp-02', new Date('2024-01-01')).titularId === 't-novo');
  afirmar('titular vigente na data antiga', resolverTitular(titulares, 'ri-sp-02', new Date('2010-01-01')).titularId === 't-antigo');
  const sem = resolverTitular(titulares, 'ri-sp-02', new Date('1990-01-01'));
  afirmar('sem titular na data → pendente', sem.titularId === null && sem.titularPendente);
  afirmar('cartório sem titular → pendente', resolverTitular(titulares, 'ri-sp-99', new Date('2024-01-01')).titularPendente);
}

/* ---------- dedupe ---------- */
{
  const a = 'Apresentar certidão negativa de débitos do ITCMD com data posterior à escritura.';
  const b = 'Apresentar a certidão negativa de débitos do ITCMD em data posterior à escritura.';
  const c = 'Promover a averbação prévia do divórcio na matrícula do imóvel.';
  afirmar('quase idênticas ≥ limiar', similaridadeTexto(a, b) >= 0.62, similaridadeTexto(a, b));
  afirmar('diferentes < limiar', similaridadeTexto(a, c) < 0.62, similaridadeTexto(a, c));
  afirmar(
    'duplicata só no MESMO cartório+tema',
    ehDuplicata(
      { textoNormalizado: a, cartorioId: 'x', temaId: 't' },
      { textoNormalizado: b, cartorioId: 'x', temaId: 't' },
    ) &&
      !ehDuplicata(
        { textoNormalizado: a, cartorioId: 'x', temaId: 't' },
        { textoNormalizado: b, cartorioId: 'y', temaId: 't' },
      ),
  );
}

/* ---------- encaminhar ---------- */
{
  const base = { confianca: 0.9, cartorioId: 'x', titularPendente: false };
  afirmar('publica com tudo certo', encaminhar(base, () => 0.99).destino === 'publicado');
  afirmar('auditoria amostra 5%', encaminhar(base, () => 0.01).motivos.includes('auditoria'));
  afirmar('confiança baixa → revisão', encaminhar({ ...base, confianca: 0.7 }).destino === 'revisao');
  afirmar('sem cartório → revisão', encaminhar({ ...base, cartorioId: null }).motivos.includes('cartorio_nao_identificado'));
  afirmar('titular pendente → revisão', encaminhar({ ...base, titularPendente: true }).motivos.includes('titular_pendente'));
  afirmar(
    'possível dado pessoal → revisão',
    encaminhar({ ...base, possivelDadoPessoal: true }).motivos.includes('possivel_dado_pessoal'),
  );
}

console.log(`\n${ok} passaram, ${fail} falharam`);
if (fail > 0) process.exit(1);
