/**
 * Casos de teste da persistência local: serialização estável + hash,
 * SHA-256 incremental e o matcher do manifesto (religamento por hash).
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/caso-store.test.ts
 */

import {
  serializarEstavel,
  hashDados,
  montarArquivoCaso,
  migrarArquivoCaso,
  novoCabecalho,
  higienizarNomePasta,
} from './caso-store';
import { Sha256, sha256DeBlob } from './sha256';
import { casarManifesto, resumoDoDiff, type EntradaManifesto, type InfoArquivoDisco } from './manifesto';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

async function main() {
  console.log('\nPersistência — serialização estável e hash\n');

  eq('chaves ordenadas', serializarEstavel({ b: 1, a: 2 }), '{"a":2,"b":1}');
  eq('aninhado e array', serializarEstavel({ z: [{ y: 1, x: 2 }], a: null }), '{"a":null,"z":[{"x":2,"y":1}]}');
  eq('undefined some', serializarEstavel({ a: undefined, b: 1 }), '{"b":1}');
  eq('determinístico', serializarEstavel({ a: 1, b: 2 }), serializarEstavel({ b: 2, a: 1 }));
  const h1 = await hashDados({ a: 1, b: 2 });
  const h2 = await hashDados({ b: 2, a: 1 });
  const h3 = await hashDados({ a: 1, b: 3 });
  eq('hash igual para ordem diferente', h1, h2);
  eq('hash muda com o dado', h1 === h3, false);

  console.log('\nSHA-256 incremental\n');

  eq('vetor vazio', new Sha256().hex(), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  eq('vetor "abc"', new Sha256().update(new TextEncoder().encode('abc')).hex(),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  // Igual ao crypto.subtle em dado que cruza fronteiras de bloco.
  const dados = new Uint8Array(200_003);
  for (let i = 0; i < dados.length; i++) dados[i] = (i * 31 + 7) % 256;
  const ref = [...new Uint8Array(await crypto.subtle.digest('SHA-256', dados))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  const inc = new Sha256();
  for (let i = 0; i < dados.length; i += 777) inc.update(dados.subarray(i, i + 777));
  eq('incremental = crypto.subtle', inc.hex(), ref);
  eq('blob em blocos', await sha256DeBlob(new Blob([dados])), ref);

  console.log('\nCaso.json v1\n');

  const cab = novoCabecalho('Silva, João - 2019', 'PC do escritório');
  const arq = await montarArquivoCaso({ cabecalho: cab, dados: { x: 1 }, manifesto: [] });
  eq('schema v1', arq.schemaVersion, 1);
  eq('cabecalho é a primeira chave', Object.keys(arq)[2], 'cabecalho');
  eq('hash de integridade presente', arq.integridade.hashDados.length, 64);
  eq('migração aceita o próprio formato', migrarArquivoCaso(JSON.parse(JSON.stringify(arq)))?.cabecalho.caseId, cab.caseId);
  eq('migração recusa lixo', migrarArquivoCaso({ foo: 1 }), null);
  eq('migração recusa versão futura', migrarArquivoCaso({ ...arq, schemaVersion: 99 }), null);
  eq('higieniza nome de pasta', higienizarNomePasta('Silva, João - 2019: "teste"?'), 'Silva, João - 2019 teste');
  eq('higieniza vazio', higienizarNomePasta('///'), 'Caso sem título');

  console.log('\nManifesto — religamento\n');

  const M = (over: Partial<EntradaManifesto>): EntradaManifesto => ({
    caminhoRelativo: 'Certidões/obito.pdf',
    nome: 'obito.pdf',
    tamanho: 100,
    lastModified: 1000,
    sha256: 'H1',
    classificacao: 'certidao_obito',
    camposExtraidos: { data: '2019-03-01' },
    ...over,
  });
  const A = (over: Partial<InfoArquivoDisco>): InfoArquivoDisco => ({
    caminhoRelativo: 'Certidões/obito.pdf',
    nome: 'obito.pdf',
    tamanho: 100,
    lastModified: 1000,
    ...over,
  });
  // hash falso: dirigido pelo nome do arquivo (determinístico nos testes)
  const hashes: Record<string, string> = {};
  const hashDe = async (a: InfoArquivoDisco) => hashes[a.caminhoRelativo] ?? 'H?';

  // 1. mesmo caminho + metadados → religa sem hashear
  let chamadas = 0;
  const d1 = await casarManifesto([A({})], [M({})], async (a) => { chamadas++; return hashDe(a); });
  eq('religado sem hash', [d1.resumo.religados, chamadas], [1, 0]);
  eq('classificação preservada', d1.manifesto[0].classificacao, 'certidao_obito');

  // 2. mesmo caminho, meta diferente, hash igual → religado; hash diferente → alterado
  hashes['Certidões/obito.pdf'] = 'H1';
  const d2 = await casarManifesto([A({ lastModified: 2000 })], [M({})], hashDe);
  eq('só mtime mudou: religado', d2.resumo.religados, 1);
  hashes['Certidões/obito.pdf'] = 'H2';
  const d3 = await casarManifesto([A({ lastModified: 2000, tamanho: 120 })], [M({})], hashDe);
  eq('conteúdo mudou: alterado', d3.resumo.alterados, 1);
  eq('alterado invalida camposExtraidos', d3.manifesto[0].camposExtraidos, undefined);
  eq('alterado atualiza o hash', d3.manifesto[0].sha256, 'H2');

  // 3. movido/renomeado pelo hash
  hashes['Bens/certidao-obito.pdf'] = 'H1';
  const d4 = await casarManifesto(
    [A({ caminhoRelativo: 'Bens/certidao-obito.pdf', nome: 'certidao-obito.pdf', lastModified: 3000 })],
    [M({})],
    hashDe,
  );
  eq('movido religa pelo hash', d4.resumo.movidos, 1);
  eq('movido atualiza o caminho', d4.manifesto[0].caminhoRelativo, 'Bens/certidao-obito.pdf');
  eq('movido preserva a classificação', d4.manifesto[0].classificacao, 'certidao_obito');

  // 4 e 5. novo + faltando
  hashes['Bens/matricula.pdf'] = 'H9';
  const d5 = await casarManifesto(
    [A({ caminhoRelativo: 'Bens/matricula.pdf', nome: 'matricula.pdf' })],
    [M({})],
    hashDe,
  );
  eq('novo e faltando', [d5.resumo.novos, d5.resumo.faltando], [1, 1]);
  eq('faltando não é apagado do manifesto', d5.manifesto.length, 2);
  eq('faltando marcado', d5.manifesto.find((m) => m.sha256 === 'H1')?.faltando, true);
  eq('resumo legível', resumoDoDiff(d5).includes('1 novo(s), 1 não encontrado(s)'), true);

  console.log(`\n${ok} passaram, ${fail} falharam\n`);
  if (fail > 0) process.exit(1);
}

void main();
