/**
 * Rede advogado-advogado (camada 4) — MATRIZ PAPEL × RECURSO do portal.
 *
 * Motor puro e único: toda rota/action que decide "este papel pode isto?"
 * pergunta AQUI — a regra nunca é duplicada em call site. Papéis do portal:
 *
 *  - herdeiro   (padrão): delibera — qualifica, envia documentos, adere a
 *    cenário, vota, lança despesa; conta para consenso e votações.
 *  - mediador   (camada 2): acompanha e comenta (nota/mural); NÃO delibera,
 *    não envia documentos, não tem painel.
 *  - advogado   (camada 4): advogado(a) constituído(a) de herdeiros
 *    específicos — lê TUDO do espólio, comenta (nota/mural), JUNTA
 *    documentos (pedido próprio `docs-advogado`) e lê o painel individual
 *    dos SEUS representados; NÃO delibera (adesão/voto/despesa são atos do
 *    herdeiro) e não conta para consenso.
 *
 * O que NENHUM papel do portal alcança (fica no navegador do titular, por
 * construção): honorários, bloco de notas do caso, folha de partilha e os
 * documentos internos — nada disso entra no snapshot publicado.
 */

export type PapelPortal = 'herdeiro' | 'mediador' | 'advogado';

export type RecursoPortal =
  /** Preencher a própria qualificação (formulário do portal). */
  | 'qualificacao'
  /** Enviar arquivos aos pedidos do próprio convite. */
  | 'upload'
  /** Aderir a cenário de divisão. */
  | 'adesao'
  /** Votar em votação formal. */
  | 'voto'
  /** Lançar despesa adiantada. */
  | 'despesa'
  /** Comentar/sugerir valor por bem (nota do espólio). */
  | 'nota'
  /** Escrever no mural moderado. */
  | 'mural'
  /** Ver o próprio painel individual. */
  | 'painel-proprio'
  /** Ver os painéis individuais dos herdeiros REPRESENTADOS. */
  | 'paineis-representados';

const MATRIZ: Record<PapelPortal, Record<RecursoPortal, boolean>> = {
  herdeiro: {
    qualificacao: true,
    upload: true,
    adesao: true,
    voto: true,
    despesa: true,
    nota: true,
    mural: true,
    'painel-proprio': true,
    'paineis-representados': false,
  },
  mediador: {
    qualificacao: false,
    upload: false,
    adesao: false,
    voto: false,
    despesa: false,
    nota: true,
    mural: true,
    'painel-proprio': false,
    'paineis-representados': false,
  },
  advogado: {
    qualificacao: false,
    upload: true,
    adesao: false,
    voto: false,
    despesa: false,
    nota: true,
    mural: true,
    'painel-proprio': false,
    'paineis-representados': true,
  },
};

/** Papel efetivo de um convite (ausente = herdeiro). */
export function papelDoConvite(papelConvite: string | undefined | null): PapelPortal {
  return papelConvite === 'mediador' || papelConvite === 'advogado' ? papelConvite : 'herdeiro';
}

export function podeNoPortal(papel: PapelPortal, recurso: RecursoPortal): boolean {
  return MATRIZ[papel][recurso];
}

/** Só HERDEIRO conta para consenso de cenário e apuração de votação. */
export function deliberaNoEspolio(papel: PapelPortal): boolean {
  return papel === 'herdeiro';
}

/** Pedido de documentos que nasce no convite do advogado constituído. */
export const PEDIDO_DOCS_ADVOGADO = {
  id: 'docs-advogado',
  titulo: 'Documentos do(a) advogado(a)',
  descricao:
    'Procuração, substabelecimento, petições e outros documentos que deseja juntar ao caso.',
} as const;
