/**
 * Detecção LOCAL de temas registrais num título/minuta — o motor do modo
 * "arrastar o título" da consulta de jurimetria.
 *
 * Roda NO NAVEGADOR (fronteira de dados): o documento nunca sai da máquina —
 * para o servidor vai só a estrutura detectada (cartório + tipo de ato +
 * ids de tema). Por isso este módulo é puro, sem Prisma e sem 'use server'.
 *
 * Os ids espelham os 24 temas semeados em `jurimetria_temas` (migração
 * jurimetria_semente_publica) — tema novo entra lá E aqui.
 */

import type { AtoTipo } from './tipos';

export interface TemaLocal {
  id: string;
  rotulo: string;
  re: RegExp;
}

export const TEMAS_LOCAIS: TemaLocal[] = [
  { id: 'itcmd-recolhimento', rotulo: 'ITCMD — recolhimento/isenção', re: /itcmd|imposto\s+de\s+transmiss[ãa]o|causa\s+mortis/i },
  { id: 'certidoes-fiscais', rotulo: 'Certidões fiscais', re: /certid[ãa]o\s+(negativa|de\s+d[ée]bitos|conjunta)|cnd\b|receita\s+federal/i },
  { id: 'iptu-debitos', rotulo: 'IPTU / débitos municipais', re: /iptu|d[ée]bitos?\s+municipa|tributos?\s+imobili[áa]rio/i },
  { id: 'qualificacao-partes', rotulo: 'Qualificação das partes', re: /qualifica[çc][ãa]o|\bRG\b|\bCPF\b|estado\s+civil|profiss[ãa]o.*domic[ií]lio/i },
  { id: 'especialidade-subjetiva', rotulo: 'Especialidade subjetiva', re: /especialidade\s+subjetiva|titularidade.*(diverge|n[ãa]o\s+coincide)|constar?\s+como\s+propriet[áa]ri/i },
  { id: 'especialidade-objetiva', rotulo: 'Especialidade objetiva', re: /especialidade\s+objetiva|descri[çc][ãa]o\s+do\s+im[óo]vel|confronta[çc][õo]es|metragem|área\s+(real|constante)/i },
  { id: 'continuidade-registral', rotulo: 'Continuidade registral', re: /continuidade\s+registr|cadeia\s+(dominial|filiat[óo]ria)|transcri[çc][ãa]o\s+anterior/i },
  { id: 'retificacao-nome-grafia', rotulo: 'Retificação de nome/grafia', re: /retifica[çc][ãa]o|grafia|diverg[êe]ncia\s+de\s+nome|nome\s+diverge/i },
  { id: 'certidao-casamento-regime', rotulo: 'Casamento / regime de bens', re: /certid[ãa]o\s+de\s+casamento|regime\s+de\s+(bens|comunh[ãa]o)|pacto\s+antenupcial|comunh[ãa]o\s+(universal|parcial)/i },
  { id: 'certidao-obito', rotulo: 'Certidão de óbito', re: /certid[ãa]o\s+de\s+[óo]bito|falecid|de\s+cujus|esp[óo]lio/i },
  { id: 'testamento-cnb', rotulo: 'Testamento / CENSEC', re: /testament|censec|colégio\s+notarial|cnb/i },
  { id: 'inventariante-nomeacao', rotulo: 'Inventariante', re: /inventariante|compromisso\s+de\s+invent[áa]rio/i },
  { id: 'representacao-procuracao', rotulo: 'Procuração / representação', re: /procura[çc][ãa]o|representad[oa]|outorg(a|ante|ado)|mandat[áa]rio/i },
  { id: 'menor-incapaz-mp', rotulo: 'Menor/incapaz e MP', re: /\bmenor(es)?\b|incapaz|curatel|minist[ée]rio\s+p[úu]blico|\bMP\b/i },
  { id: 'valor-venal-avaliacao', rotulo: 'Valor venal / avaliação', re: /valor\s+venal|avalia[çc][ãa]o|base\s+de\s+c[áa]lculo|valor\s+de\s+refer[êe]ncia/i },
  { id: 'fracao-ideal-partilha', rotulo: 'Fração ideal na partilha', re: /fra[çc][ãa]o\s+ideal|parte\s+ideal|\b\d+\s*\/\s*\d+\s+(do\s+im[óo]vel|da\s+propriedade)/i },
  { id: 'meacao-conjuge', rotulo: 'Meação do cônjuge', re: /mea[çc][ãa]o|meeir[oa]|c[ôo]njuge\s+sup[ée]rstite/i },
  { id: 'renuncia-cessao', rotulo: 'Renúncia / cessão', re: /ren[úu]ncia|cess[ãa]o\s+de\s+direitos|cedente|cession[áa]ri/i },
  { id: 'usufruto-instituicao', rotulo: 'Usufruto', re: /usufrut|nua[- ]propriedade/i },
  { id: 'doacao-colacao', rotulo: 'Doação / colação', re: /doa[çc][ãa]o|cola[çc][ãa]o|adiantamento\s+de\s+leg[ií]tima/i },
  { id: 'imovel-rural', rotulo: 'Imóvel rural', re: /im[óo]vel\s+rural|\bccir\b|\bitr\b|\bincra\b|georreferenc/i },
  { id: 'onus-gravames', rotulo: 'Ônus e gravames', re: /hipoteca|aliena[çc][ãa]o\s+fiduci[áa]ria|penhora|indisponibilidade|[ôo]nus|gravame/i },
  { id: 'formalidades-titulo', rotulo: 'Formalidades do título', re: /firma\s+reconhecida|via\s+original|traslado|formal\s+de\s+partilha|instrumento\s+p[úu]blico/i },
];

/** Ids dos temas presentes no texto (ordem fixa do catálogo, sem duplicar). */
export function detectarTemas(texto: string): string[] {
  return TEMAS_LOCAIS.filter((t) => t.re.test(texto)).map((t) => t.id);
}

export function detectarAtoTipo(texto: string): AtoTipo {
  if (/invent[áa]rio/i.test(texto) && /partilha/i.test(texto)) return 'inventario';
  if (/invent[áa]rio/i.test(texto)) return 'inventario';
  if (/partilha/i.test(texto)) return 'partilha';
  if (/div[óo]rcio|dissolu[çc][ãa]o/i.test(texto)) return 'divorcio';
  if (/doa[çc][ãa]o/i.test(texto)) return 'doacao';
  if (/compra\s+e\s+venda|venda\s+e\s+compra|alienante|adquirente/i.test(texto))
    return 'compra_venda';
  return 'outro';
}

/**
 * Menções a serventias de Registro de Imóveis no texto ("5º Oficial de
 * Registro de Imóveis…", "Registro de Imóveis de Guarulhos") — cada menção
 * segue ao `resolverCartorio` (que também é puro e roda no navegador).
 */
export function mencoesDeCartorio(texto: string): string[] {
  const achadas = new Set<string>();
  const re =
    /((?:\d+\s*[ºo°]?\s*)?(?:oficial\s+de\s+)?registro\s+de\s+im[óo]veis(?:\s+(?:e\s+anexos\s+)?(?:da\s+comarca\s+)?de\s+[A-Za-zÀ-ú][A-Za-zÀ-ú ]{2,30})?)/gi;
  for (const m of texto.matchAll(re)) {
    const bruta = m[1].replace(/\s+/g, ' ').trim();
    if (bruta.length > 15) achadas.add(bruta);
  }
  return [...achadas].slice(0, 5);
}
