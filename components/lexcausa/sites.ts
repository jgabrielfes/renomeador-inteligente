/**
 * ENDEREÇOS ENTRE OS DEPLOYS DA LEXCAUSA.
 *
 * A marca é uma só, mas mora em quatro deploys (lib/app.ts). Duas telas
 * precisam apontar para FORA do próprio deploy, e é isso que este módulo
 * resolve:
 *
 *   • a landing do apex (lexcausa.com.br, APP=hub) manda "Entrar",
 *     "Criar conta", "Para famílias" e o portal para o Sucessorista;
 *   • o hub logado do Sucessorista manda "Conhecer o produto" para as
 *     páginas institucionais /produtos/*, que vivem no apex.
 *
 * Dentro do próprio deploy o caminho continua RELATIVO — `caminho()` devolve
 * um ou outro conforme quem pergunta, para não haver link absoluto inútil
 * (que quebraria a navegação client-side do Next e a tranca de homologação).
 *
 * ATENÇÃO: estas páginas são estáticas, então o endereço é resolvido no
 * BUILD. Na Vercel isso é o que se quer (cada ambiente compila o seu), mas
 * trocar a variável sem recompilar não muda link nenhum.
 */

import { EH_HUB } from '@/lib/app';

const DOMINIO = 'lexcausa.com.br';

/** true = deploy de produção (a Vercel injeta VERCEL_ENV). */
function ehProducao(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

/** O apex da marca: a landing e as páginas institucionais de produto. */
export function urlDoHub(): string {
  if (ehProducao()) return `https://${DOMINIO}`;
  // Homologação: o apex de teste. `HUB_URL` cobre o caso de o domínio de
  // homologação do apex ainda não existir (aponte para onde quiser testar).
  return process.env.HUB_URL ?? `https://develop.${DOMINIO}`;
}

/** O site da ferramenta sucessória: login, cadastro, famílias e portal. */
export function urlDoSucessorista(): string {
  const prefixo = ehProducao() ? '' : 'develop-';
  return `https://${prefixo}osucessorista.${DOMINIO}`;
}

/**
 * Caminho para uma rota que vive no APEX (a landing e /produtos/*).
 * Relativo quando quem pergunta É o apex; absoluto vindo de outro deploy.
 */
export function noHub(caminho: string): string {
  return EH_HUB ? caminho : `${urlDoHub()}${caminho}`;
}

/**
 * Caminho para uma rota que vive no SUCESSORISTA (login, cadastro,
 * /familias, /portal). Relativo lá dentro; absoluto vindo do apex.
 */
export function noSucessorista(caminho: string): string {
  return EH_HUB ? `${urlDoSucessorista()}${caminho}` : caminho;
}
