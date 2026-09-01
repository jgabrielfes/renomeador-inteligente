/**
 * Descrição de um bem para as MINUTAS EM TEXTO (petição ao tabelionato e
 * petição judicial). O IMÓVEL é descrito PRIORITARIAMENTE pela MATRÍCULA — a
 * descrição integral como consta no registro (já com as averbações que
 * alteram a especialidade objetiva), a forma de aquisição pelo(a) autor(a) da
 * herança e os dados registrais/cadastrais — e só cai na descrição curta
 * digitada no acervo quando a matrícula não foi lida.
 *
 * A ESCRITURA tem formatação própria (negrito/sublinhado calibrados ao .docx
 * do balcão, em `escritura.ts`) e NÃO usa este helper — mas a fonte é a
 * mesma: `bem.imovel.descricaoMatricula`/`aquisicao`/… preenchidos pela
 * leitura do cofre.
 *
 * Puro; testes: npx tsx lib/partilha/descricao-bem.test.ts
 */

import type { Bem } from './types';

/**
 * Frase única, em texto corrido, descrevendo o bem para a peça. Imóvel com
 * dados de matrícula sai completo; sem eles, devolve a descrição curta.
 */
export function descricaoBemMinuta(b: Bem): string {
  if (b.tipo !== 'IMOVEL' || !b.imovel) return b.descricao;
  const im = b.imovel;
  const partes: string[] = [];

  // 1) A descrição INTEGRAL da matrícula (com averbações) tem prioridade
  //    sobre o texto curto digitado no acervo.
  partes.push(im.descricaoMatricula?.trim() || b.descricao);

  // 2) Dados registrais: matrícula nº X do Registro de Imóveis.
  const registro = im.matricula?.trim()
    ? `matrícula nº ${im.matricula.trim()}${im.registroImoveis?.trim() ? ` do ${im.registroImoveis.trim()}` : ''}`
    : im.registroImoveis?.trim() || '';
  if (registro) partes.push(registro);

  // 3) Forma de aquisição pelo(a) autor(a) da herança (o R./Av. da cadeia).
  if (im.aquisicao?.trim())
    partes.push(`havido(a) pelo(a) autor(a) da herança por força do ${im.aquisicao.trim()}`);

  // 4) Cadastro municipal.
  if (im.inscricaoCadastral?.trim())
    partes.push(
      `inscrição municipal nº ${im.inscricaoCadastral.trim()}${im.municipio?.trim() ? ` — ${im.municipio.trim()}` : ''}`,
    );

  return partes.join('; ');
}
