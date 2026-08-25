/**
 * CUSTOS MANUAIS — o caso FORA de São Paulo.
 *
 * Toda a projeção automática do módulo é calibrada para SP: o ITCMD pela Lei
 * 10.705/2000 (conferido contra demonstrativo real da Sefaz), as custas pelas
 * tabelas paulistas de 2026 (Lei 11.331/2002, Anoreg-SP, RI-SP, Lei
 * 11.608/2003). Cada estado tem lei própria de ITCMD/ITCD, índice próprio,
 * isenções próprias e tabelas anuais de emolumentos do próprio TJ — números
 * que NÃO temos calibrados, e provisão errada com cara de certa é pior que
 * nenhuma (decisão do escritório).
 *
 * Então o caminho honesto: quando o caso tem elemento fora de SP (domicílio
 * do falecido, imóvel registrado em outra UF), o profissional LIGA o modo
 * manual — a projeção automática silencia por inteiro e ele informa os
 * valores apurados na legislação do estado dele. Os números passam a ser DELE,
 * e a plataforma diz isso em todas as telas ("informado pelo profissional").
 * As demais ferramentas (partilha, minutas, cofre, portal) seguem valendo.
 *
 * Motor puro: tipos, total e a DETECÇÃO de UF fora de SP — com testes em
 * custos-manuais.test.ts.
 */

export interface CustosManuais {
  /** true = a projeção automática (SP) fica silenciada e estes valores valem. */
  ativo: boolean;
  /** UF de referência informada pelo profissional (rótulo das telas). */
  uf: string;
  /** Valores em decimal "1234.56" (mesma convenção de DespesaAdicional). */
  itcmd: string;
  /** Emolumentos da escritura OU custas judiciais, conforme o rito. */
  cartorioJustica: string;
  registros: string;
  certidoes: string;
  /** Nota livre do profissional (ex.: "ITCD-MG 5%, guia emitida no SIARE"). */
  observacao: string;
}

export const CUSTOS_MANUAIS_VAZIOS: CustosManuais = {
  ativo: false,
  uf: '',
  itcmd: '',
  cartorioJustica: '',
  registros: '',
  certidoes: '',
  observacao: '',
};

const num = (v: string): number => Math.max(0, Number(v) || 0);

/** Soma dos valores informados (0 para campo vazio/ilegível). */
export function totalCustosManuais(m: CustosManuais | null | undefined): number {
  if (!m) return 0;
  return num(m.itcmd) + num(m.cartorioJustica) + num(m.registros) + num(m.certidoes);
}

/** As parcelas informadas, no formato das linhas de espelho/orçamento. */
export function parcelasManuais(
  m: CustosManuais,
): { id: string; rotulo: string; valor: number }[] {
  const linhas = [
    { id: 'manual-itcmd', rotulo: 'ITCMD/ITCD', valor: num(m.itcmd) },
    { id: 'manual-cartorio', rotulo: 'Cartório ou custas judiciais', valor: num(m.cartorioJustica) },
    { id: 'manual-registros', rotulo: 'Registros', valor: num(m.registros) },
    { id: 'manual-certidoes', rotulo: 'Certidões', valor: num(m.certidoes) },
  ];
  return linhas.filter((l) => l.valor > 0);
}

const UFS_VALIDAS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]);

/**
 * A UF no FIM de um texto ("Guarulhos/SP", "Niterói - RJ", "Comarca de BH/MG").
 * Devolve null quando o texto não termina numa sigla reconhecível — detecção é
 * MELHOR-ESFORÇO: texto livre da era anterior pode não casar, e tudo bem (o
 * aviso é sugestão, nunca trava).
 */
export function ufDoTexto(texto: string | null | undefined): string | null {
  const m = (texto ?? '').trim().match(/[/\-–\s]([A-Za-z]{2})\.?\s*$/);
  const uf = m ? m[1].toUpperCase() : null;
  return uf && UFS_VALIDAS.has(uf) ? uf : null;
}

/**
 * As UFs FORA de SP que aparecem no caso — o gatilho do aviso.
 *
 * Olha onde a competência mora: o último domicílio do falecido (ITCMD dos
 * bens móveis) e a serventia de registro de cada imóvel (ITCMD e registro do
 * imóvel são do estado onde ele fica). Devolve a lista única, ordenada.
 */
export function ufsForaDeSp(entrada: {
  ultimoDomicilio?: string | null;
  /** Textos de registro dos imóveis (ex.: "1º Registro de Imóveis de Niterói/RJ"). */
  registrosImoveis: (string | null | undefined)[];
}): string[] {
  const achadas = new Set<string>();
  const doDomicilio = ufDoTexto(entrada.ultimoDomicilio);
  if (doDomicilio && doDomicilio !== 'SP') achadas.add(doDomicilio);
  for (const r of entrada.registrosImoveis) {
    const uf = ufDoTexto(r);
    if (uf && uf !== 'SP') achadas.add(uf);
  }
  return [...achadas].sort();
}
