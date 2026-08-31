/**
 * Origem do processo — MOTOR PURO.
 *
 * Da urlOrigem interna (cjpg:<numero>:<doc> | datajud:<numero>) derivam o
 * número CNJ formatado e os LINKS PÚBLICOS do e-SAJ: a consulta de julgados
 * (CJPG — abre a sentença) e a consulta processual (CPOPG — abre o
 * processo). E do cabeçalho do documento sai a EMENTA determinística que a
 * consulta mostra no lugar do texto cru.
 */

export function formatarNumeroCNJ(bruto: string): string | null {
  const d = bruto.replace(/\D/g, '');
  if (d.length !== 20) return null;
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

export interface OrigemProcesso {
  numeroCNJ: string | null;
  /** Consulta de julgados (CJPG) filtrada pelo número — abre a sentença. */
  linkSentenca: string | null;
  /** Consulta processual pública (CPOPG) pelo número unificado. */
  linkProcesso: string | null;
}

export function origemDoProcesso(urlOrigem: string | null | undefined): OrigemProcesso {
  const vazio: OrigemProcesso = { numeroCNJ: null, linkSentenca: null, linkProcesso: null };
  if (!urlOrigem) return vazio;
  let bruto: string | null = null;
  if (urlOrigem.startsWith('cjpg:')) bruto = urlOrigem.split(':')[1] ?? null;
  else if (urlOrigem.startsWith('datajud:')) bruto = urlOrigem.slice('datajud:'.length);
  if (!bruto) return vazio;
  const numeroCNJ = bruto.includes('-') ? bruto : formatarNumeroCNJ(bruto);
  if (!numeroCNJ) return vazio;
  const linkProcesso = `https://esaj.tjsp.jus.br/cpopg/search.do?cbPesquisa=NUMPROC&dadosConsulta.valorConsultaNuUnificado=${encodeURIComponent(numeroCNJ)}&dadosConsulta.tipoNuProcesso=UNIFICADO`;
  const linkSentenca = `https://esaj.tjsp.jus.br/cjpg/pesquisar.do?dadosConsulta.pesquisaLivre=${encodeURIComponent(`"${numeroCNJ}"`)}`;
  return { numeroCNJ, linkSentenca, linkProcesso };
}

/** Campo do cabeçalho ("Classe: …"), ignorando valores anonimizados. */
function campoDoCabecalho(texto: string, rotulo: string): string | null {
  const v = new RegExp(`^${rotulo}:\\s*(.+)$`, 'mi').exec(texto)?.[1]?.trim() ?? null;
  return v && !v.includes('[') && v.length <= 80 ? v : null;
}

/** "01 REGISTROS PUBLICOS DE CENTRAL" → "1ª Vara de Registros Públicos da Capital". */
function nomeLegivelDoOrgao(orgao: string): string {
  const vrp = /^0?([12])\s+REGISTROS\s+PUBLICOS\s+DE\s+CENTRAL$/i.exec(orgao.trim());
  if (vrp) return `${vrp[1]}ª Vara de Registros Públicos da Capital`;
  return orgao.trim();
}

/**
 * Ementa determinística do documento: sentença do CJPG usa Classe/Vara/
 * Comarca; processo do Datajud usa classe + órgão + assuntos da tabela CNJ.
 */
export function ementaDoDocumento(texto: string): string | null {
  const classe = campoDoCabecalho(texto, 'Classe');
  const vara = campoDoCabecalho(texto, 'Vara');
  const comarca = campoDoCabecalho(texto, 'Comarca');
  if (classe || vara || comarca) {
    const onde = [vara, comarca ? `Comarca de ${comarca}` : null].filter(Boolean).join(', ');
    return `Sentença em ${classe ?? 'processo'}${onde ? ` — ${onde}` : ''}`;
  }
  const cab = /^Processo de\s+([^—\n]+)—\s*(.+)$/m.exec(texto);
  if (cab) {
    const assuntos = campoDoCabecalho(texto, 'Assuntos \\(tabela CNJ\\)');
    const base = `${cab[1].trim()} — ${nomeLegivelDoOrgao(cab[2])}`;
    return assuntos ? `${base} · Assuntos: ${assuntos}` : base;
  }
  return null;
}

/**
 * O texto normalizado saiu CRU (cabeçalho do documento em vez da frase
 * impessoal — extração de fallback)? A consulta troca pela ementa e o
 * worker regrava.
 */
export function ehTextoCru(texto: string): boolean {
  return /Número CNJ:|^Sentença — CJPG|^Processo de\s/.test(texto);
}
