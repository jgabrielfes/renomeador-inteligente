/**
 * CATÁLOGO DOS SITES DA LEXCAUSA — a vitrine em lexcausa.com.br.
 *
 * Não confundir com `produtos.ts`: aquele lista os produtos DE DENTRO do site
 * sucessório (O Sucessorista, Radar, Diligências), que moram no mesmo deploy e
 * por isso têm `href` relativo. Aqui estão as três FERRAMENTAS, cada uma num
 * deploy e num subdomínio próprios — daí a URL absoluta.
 *
 * A hierarquia de marca é essa: a raiz apresenta as ferramentas; quem entra na
 * do Sucessorista encontra lá dentro os produtos sucessórios.
 *
 * DESTINO POR AMBIENTE: o hub publicado em homologação aponta para os
 * `develop-*`, e o de produção para a produção — dá para percorrer o fluxo
 * inteiro sem sair do ambiente em que se está testando. Quem decide é o
 * `VERCEL_ENV`, que a própria Vercel injeta ("production" só na produção);
 * rodando local, sem essa variável, vale homologação.
 *
 * ATENÇÃO: a vitrine é uma página ESTÁTICA, então estes endereços são
 * resolvidos no BUILD, não a cada requisição. Na Vercel isso é o que se quer
 * (cada ambiente compila o seu), mas significa que trocar o valor da variável
 * sem recompilar não muda link nenhum.
 */

export interface SiteLexCausa {
  id: 'sucessorista' | 'renomeador' | 'notas';
  nome: string;
  /** Classe do acento visual (app/lexcausa.css). */
  classe: 'produto-sucessorista' | 'produto-renomeador' | 'produto-notas';
  /** Uma linha — o subtítulo do cartão. */
  tagline: string;
  /** O parágrafo do cartão. */
  descricao: string;
  /** Para quem é a ferramenta. */
  perfis: string[];
  /** Subdomínio, sem o `develop-` e sem o domínio (montados abaixo). */
  sub: string;
}

/** O domínio da marca. Trocar aqui muda os seis endereços de uma vez. */
const DOMINIO = 'lexcausa.com.br';

export const SITES_LEXCAUSA: SiteLexCausa[] = [
  {
    id: 'sucessorista',
    nome: 'O Sucessorista',
    classe: 'produto-sucessorista',
    tagline: 'A prática sucessória, do primeiro atendimento ao registro.',
    descricao:
      'A folha de trabalho do inventário inteira: composição familiar com a qualificação das partes, acervo, quinhões com fundamento legal, cofre de documentos com leitura por IA e o espelho do ITCMD-SP — além de custas, honorários, minutas e o portal da família. Dentro dele ficam também o Radar Sucessório e as Diligências entre advogados.',
    perfis: ['Advogado(a)', 'Escrevente Notarial', 'Famílias'],
    sub: 'osucessorista',
  },
  {
    id: 'renomeador',
    nome: 'Renomeador Inteligente',
    classe: 'produto-renomeador',
    tagline: 'Documentos com nome de gente, sem digitar um por um.',
    descricao:
      'Arraste RG, CNH, certidões, matrículas e contratos: a ferramenta lê cada documento e propõe o nome do arquivo pelo conteúdo. Otimiza fotos com aspecto de digitalização, separa PDFs com vários documentos e monta o processo em subpastas numeradas — com as regras de nomenclatura do seu escritório.',
    perfis: ['Escritórios', 'Cartórios'],
    sub: 'renomeador',
  },
  {
    id: 'notas',
    nome: 'Resolvedor de Notas Devolutivas',
    classe: 'produto-notas',
    tagline: 'Da exigência do registro à minuta da peça.',
    descricao:
      'Envie a pasta do caso: a nota devolutiva é decomposta em exigências, cada uma cai na sua via de resolução e a minuta da peça já sai montada, pronta para a sua revisão. O que o cartório pediu vira uma lista de trabalho em vez de um texto corrido para reler.',
    perfis: ['Advogado(a)', 'Escrevente Notarial'],
    sub: 'notasdevolutivas',
  },
];

/** true = este deploy é o de produção (a Vercel injeta VERCEL_ENV). */
export function ehProducao(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/**
 * O endereço do site no ambiente ATUAL. Em produção,
 * `https://osucessorista.lexcausa.com.br`; fora dela,
 * `https://develop-osucessorista.lexcausa.com.br`.
 */
export function urlDoSite(site: SiteLexCausa): string {
  const prefixo = ehProducao() ? '' : 'develop-';
  return `https://${prefixo}${site.sub}.${DOMINIO}`;
}
