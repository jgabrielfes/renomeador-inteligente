/**
 * Correspondentes de sucessões (camada 4, pilar B) — MOTOR PURO.
 *
 * Regras duras (ética OAB): a plataforma NÃO indica correspondente — exibe
 * perfis verificados que atendem aos filtros em ORDEM NEUTRA (comarca exata
 * primeiro, depois mesma UF, e dentro de cada grupo a data de cadastro);
 * nunca por preço, nunca por nota. O acerto de valores é ENTRE os advogados
 * (art. 34 da Lei 8.906/94; CED arts. 26–27) — a plataforma só registra o
 * termo de referência, sem processar pagamento.
 */

export const TIPOS_DILIGENCIA = [
  { id: 'retirada-certidao', rotulo: 'Retirada de certidão' },
  { id: 'audiencia', rotulo: 'Acompanhamento de audiência' },
  { id: 'diligencia-serventia', rotulo: 'Diligência em RI/RCPN/notas' },
  { id: 'assinatura-escritura', rotulo: 'Assinatura de escritura por procuração' },
  { id: 'protocolo-fisico', rotulo: 'Protocolo físico' },
  { id: 'copia-autos', rotulo: 'Cópia de autos' },
] as const;

export type TipoDiligencia = (typeof TIPOS_DILIGENCIA)[number]['id'];

export const ROTULO_TIPO_DILIGENCIA: Record<string, string> = Object.fromEntries(
  TIPOS_DILIGENCIA.map((t) => [t.id, t.rotulo]),
);

export const STATUS_DILIGENCIA = [
  'aberta',
  'aceita',
  'em_execucao',
  'relatorio_entregue',
  'concluida',
  'cancelada',
] as const;

export const ROTULO_STATUS_DILIGENCIA: Record<string, string> = {
  aberta: 'aberta — aguardando correspondentes',
  aceita: 'aceita — termo registrado',
  em_execucao: 'em execução',
  relatorio_entregue: 'relatório entregue',
  concluida: 'concluída',
  cancelada: 'cancelada',
};

export interface CorrespondenteParaOrdenar {
  userId: string;
  comarcas: number[];
  uf: string;
  criadoEm: string; // ISO
}

/** ORDEM NEUTRA: comarca exata → mesma UF → data de cadastro (asc). A UF de
 *  uma comarca IBGE são os dois primeiros dígitos — o chamador passa a UF
 *  resolvida. NUNCA ordenar por preço ou avaliação. */
export function ordenarCorrespondentes<T extends CorrespondenteParaOrdenar>(
  lista: readonly T[],
  alvo: { comarcaIbge: number; uf: string },
): T[] {
  const grupo = (c: CorrespondenteParaOrdenar): number => {
    if (c.comarcas.includes(alvo.comarcaIbge)) return 0;
    if (c.uf === alvo.uf) return 1;
    return 2;
  };
  return [...lista].sort(
    (a, b) => grupo(a) - grupo(b) || a.criadoEm.localeCompare(b.criadoEm),
  );
}

/** Critérios OBJETIVOS da avaliação mútua (1–5) — sem texto livre público. */
export const CRITERIOS_AVALIACAO = [
  { id: 'prazo', rotulo: 'Prazo cumprido' },
  { id: 'relatorio', rotulo: 'Relatório entregue' },
  { id: 'comunicacao', rotulo: 'Comunicação' },
] as const;

export interface AvaliacaoCriterios {
  prazo: number;
  relatorio: number;
  comunicacao: number;
}

/** Média agregada das avaliações (uma casa), com o % de diligências no
 *  prazo pesando: atraso sem justificativa derruba a média exibida. */
export function mediaAgregada(
  avaliacoes: readonly AvaliacaoCriterios[],
  atrasosSemJustificativa: number,
  totalConcluidas: number,
): number | null {
  if (avaliacoes.length === 0) return null;
  const soma = avaliacoes.reduce(
    (s, a) => s + (a.prazo + a.relatorio + a.comunicacao) / 3,
    0,
  );
  const base = soma / avaliacoes.length;
  const fatorPrazo =
    totalConcluidas > 0 ? 1 - Math.min(0.4, (atrasosSemJustificativa / totalConcluidas) * 0.4) : 1;
  return Math.round(base * fatorPrazo * 10) / 10;
}

/** Nome PADRONIZADO do relatório ao entrar na aba Documentos do caso. */
export function nomePadronizadoRelatorio(
  d: { tipo: string; municipio: string; uf: string },
  dataIso: string,
  nomeOriginal: string,
): string {
  const ext = nomeOriginal.includes('.') ? nomeOriginal.slice(nomeOriginal.lastIndexOf('.')) : '';
  const tipo = ROTULO_TIPO_DILIGENCIA[d.tipo] ?? 'Diligência';
  const limpo = (s: string) => s.replace(/[\\/:*?"<>|]/g, '').trim();
  return `${dataIso.slice(0, 10)} - ${limpo(tipo)} - ${limpo(d.municipio)}-${d.uf}${ext}`;
}

/**
 * PASTA DA DILIGÊNCIA — não-vazamento: o que circula é SÓ o que o
 * solicitante colocou na pasta ('pasta') e o que o correspondente entregou
 * ('relatorio'). Qualquer outra origem cai fora — defesa contra linha
 * adulterada no banco; o caso do solicitante nunca passa por aqui.
 */
export function conteudoDaPasta<T extends { origem: string }>(arquivos: readonly T[]): T[] {
  return arquivos.filter((a) => a.origem === 'pasta' || a.origem === 'relatorio');
}
