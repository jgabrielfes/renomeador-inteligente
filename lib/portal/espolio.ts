/**
 * Espaço do Espólio — o snapshot COMPARTILHADO do caso para a família.
 *
 * Diferença central para o Painel do Cliente: aqui TODOS os herdeiros veem
 * o MESMO conteúdo (o mesmo acervo, as mesmas dívidas, os mesmos quinhões —
 * a maior ferramenta de pacificação é ver os números juntos). O advogado
 * liga o espaço e escolhe, item a item, o que libera; nada sobe sozinho.
 *
 * Mesma disciplina do painel individual (lib/portal/painel.ts): montagem
 * por ALLOWLIST campo a campo — honorários, notas internas, matrículas,
 * análises e CONTATOS dos herdeiros entre si ficam fora por construção.
 * Só nome e papel circulam entre os herdeiros.
 *
 * Motor PURO (sem relógio/aleatoriedade). Testes: npx tsx lib/portal/espolio.test.ts
 */

/* ---------- visibilidades (padrão restritivo) ---------- */

export interface VisibilidadeEspolio {
  /** Interruptor geral "Abrir para a família" — desligado por padrão. */
  aberto: boolean;
  /** Inventário de bens com valores e fonte da avaliação. */
  bens: boolean;
  /** Dívidas do espólio (reduzem o quinhão de todos). */
  dividas: boolean;
  /** Quinhões calculados pela lei, de TODOS os participantes. */
  quinhoes: boolean;
}

export const VISIBILIDADE_ESPOLIO_PADRAO: VisibilidadeEspolio = {
  aberto: false,
  bens: true,
  dividas: true,
  quinhoes: false,
};

/* ---------- o snapshot compartilhado ---------- */

export type PapelParticipante = 'inventariante' | 'herdeiro(a)' | 'cônjuge meeiro(a)';

export interface ParticipanteEspolio {
  /** SÓ nome e papel — nenhum contato circula entre herdeiros. */
  nome: string;
  papel: PapelParticipante;
}

export interface BemEspolio {
  descricao: string;
  /** Decimal como texto ("300000.00") — a UI formata. */
  valor: string;
  /** De onde saiu o número — em linguagem leiga ("avaliação", "valor venal",
   *  "valor declarado pela família"). */
  fonteAvaliacao: string;
}

export interface DividaEspolio {
  descricao: string;
  valor: string;
}

export interface QuinhaoEspolio {
  nome: string;
  papel: PapelParticipante;
  valor: string;
  fracao?: string;
}

export interface EspolioCompartilhado {
  v: 1;
  nomeFalecido: string;
  /** Quem participa da sucessão — o mesmo rol para todos. */
  participantes: ParticipanteEspolio[];
  bens?: BemEspolio[];
  totalAcervo?: string;
  dividas?: DividaEspolio[];
  quinhoes?: QuinhaoEspolio[];
  /** Aviso fixo — os números são estimativas de apoio, não a partilha final. */
  aviso: string;
}

export const AVISO_ESPOLIO =
  'Valores de referência para a conversa da família — a partilha final é a que for lavrada ou homologada.';

/* ---------- entrada (o que o advogado decide publicar) ---------- */

export interface EntradaEspolio {
  nomeFalecido: string;
  participantes: { nome: string; papel: PapelParticipante }[];
  bens: { descricao: string; valor: string; fonteAvaliacao: string }[];
  /** Total do acervo (decimal texto) — soma dos bens visíveis. */
  totalAcervo?: string;
  dividas: { descricao: string; valor: string }[];
  quinhoes: { nome: string; papel: PapelParticipante; valor: string; fracao?: string }[];
}

const textoOuNada = (v: string | undefined): string | undefined => {
  const t = (v ?? '').trim();
  return t === '' ? undefined : t;
};

/**
 * Monta o snapshot compartilhado — UM para o caso inteiro (todo herdeiro
 * recebe exatamente este objeto). Devolve null com o espaço fechado.
 * Reconstrução campo a campo: nada da entrada atravessa por referência.
 */
export function montarEspolioDoCaso(
  entrada: EntradaEspolio,
  visibilidade: VisibilidadeEspolio,
): EspolioCompartilhado | null {
  if (!visibilidade.aberto) return null;
  return {
    v: 1,
    nomeFalecido: entrada.nomeFalecido,
    participantes: entrada.participantes.map((p) => ({ nome: p.nome, papel: p.papel })),
    bens: visibilidade.bens
      ? entrada.bens.map((b) => ({
          descricao: b.descricao,
          valor: b.valor,
          fonteAvaliacao: b.fonteAvaliacao,
        }))
      : undefined,
    totalAcervo: visibilidade.bens ? textoOuNada(entrada.totalAcervo) : undefined,
    dividas: visibilidade.dividas
      ? entrada.dividas.map((d) => ({ descricao: d.descricao, valor: d.valor }))
      : undefined,
    quinhoes: visibilidade.quinhoes
      ? entrada.quinhoes.map((q) => ({
          nome: q.nome,
          papel: q.papel,
          valor: q.valor,
          fracao: textoOuNada(q.fracao),
        }))
      : undefined,
    aviso: AVISO_ESPOLIO,
  };
}
