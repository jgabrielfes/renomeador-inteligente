/**
 * Testes do motor de correspondentes + base de municípios (camada 4, B).
 *   npx tsx lib/rede/diligencias.test.ts
 */

import { buscarMunicipios, municipioPorIbge } from './municipios';
import {
  conteudoDaPasta,
  mediaAgregada,
  nomePadronizadoRelatorio,
  ordenarCorrespondentes,
  TIPOS_DILIGENCIA,
} from './diligencias';

let ok = 0, fail = 0;
function teste(nome: string, cond: boolean, detalhe?: string) {
  if (cond) ok++;
  else { fail++; console.error(`  ✗ ${nome}${detalhe ? `\n    ${detalhe}` : ''}`); }
}

console.log('\nRede — correspondentes e municípios\n');

/* ---------- base de municípios ---------- */
{
  const g = municipioPorIbge(351880);
  teste('Guarulhos pelo IBGE', g?.nome === 'Guarulhos' && g.uf === 'SP');
  const busca = buscarMunicipios('guaru');
  teste('busca sem acento acha Guarulhos', busca.some((m) => m.nome === 'Guarulhos'));
  teste('busca acentuada = sem acento', buscarMunicipios('São José')[0]?.nome === buscarMunicipios('sao jose')[0]?.nome);
  teste('consulta curta não varre a base', buscarMunicipios('a').length === 0);
  teste('limite respeitado', buscarMunicipios('santa', 5).length <= 5);
}

/* ---------- ordem NEUTRA ---------- */
{
  const lista = [
    { userId: 'c', comarcas: [330455], uf: 'RJ', criadoEm: '2026-01-01' }, // outra UF
    { userId: 'b', comarcas: [355030], uf: 'SP', criadoEm: '2026-03-01' }, // mesma UF
    { userId: 'a', comarcas: [351880], uf: 'SP', criadoEm: '2026-06-01' }, // comarca exata
    { userId: 'd', comarcas: [351880], uf: 'SP', criadoEm: '2026-02-01' }, // comarca exata, mais antigo
  ];
  const ordem = ordenarCorrespondentes(lista, { comarcaIbge: 351880, uf: 'SP' }).map((c) => c.userId);
  teste('comarca exata primeiro, por cadastro; depois UF; depois o resto', ordem.join('') === 'dabc', ordem.join(','));
  teste('não muta a entrada', lista[0].userId === 'c');
}

/* ---------- média agregada e atraso ---------- */
{
  const notas = [
    { prazo: 5, relatorio: 5, comunicacao: 5 },
    { prazo: 4, relatorio: 4, comunicacao: 4 },
  ];
  teste('média simples sem atrasos', mediaAgregada(notas, 0, 2) === 4.5);
  const comAtraso = mediaAgregada(notas, 1, 2)!;
  teste('atraso sem justificativa DERRUBA a média', comAtraso < 4.5);
  teste('sem avaliações = null (nunca nota fabricada)', mediaAgregada([], 0, 0) === null);
}

/* ---------- nome padronizado do relatório ---------- */
{
  const nome = nomePadronizadoRelatorio(
    { tipo: 'retirada-certidao', municipio: 'Guarulhos', uf: 'SP' },
    '2026-08-23T12:00:00Z',
    'scan_final?.pdf',
  );
  teste('nome padronizado com data, tipo e comarca', nome === '2026-08-23 - Retirada de certidão - Guarulhos-SP.pdf', nome);
}

/* ---------- pasta da diligência (não-vazamento) ---------- */
{
  const arquivos = [
    { origem: 'pasta', nome: 'matricula.pdf' },
    { origem: 'relatorio', nome: 'relatorio.pdf' },
    { origem: 'caso', nome: 'honorarios.pdf' }, // linha adulterada: cai fora
  ];
  const vis = conteudoDaPasta(arquivos);
  teste('só pasta e relatório circulam', vis.length === 2 && !vis.some((a) => a.nome === 'honorarios.pdf'));
}

teste('tipos de diligência fechados (8)', TIPOS_DILIGENCIA.length === 8);
teste(
  'ITCMD e Outros na lista',
  TIPOS_DILIGENCIA.some((t) => t.id === 'itcmd') && TIPOS_DILIGENCIA.some((t) => t.id === 'outros'),
);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
