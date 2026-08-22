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

import { fracaoBonita, pctNum, type Alocacoes } from '@/lib/partilha/cenario';

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
  /** Id do bem no caso — âncora dos comentários/sugestões da família.
   *  É o id ALEATÓRIO do lançamento (crypto.randomUUID), sem dado pessoal. */
  id: string;
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
  bens: { id: string; descricao: string; valor: string; fonteAvaliacao: string }[];
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
/* ---------- cenários de divisão (simulador, Etapa 4) ---------- */

/** Linha LEIGA de um cenário — números em R$ (a UI formata). */
export interface LinhaCenarioLeiga {
  nome: string;
  /** Quinhão a que tem direito pela lei. */
  direito: number;
  /** O que recebe em bens neste cenário. */
  recebeEmBens: number;
  /** Acerto em dinheiro: positivo recebe, negativo paga. */
  acertoEmDinheiro: number;
  /** Efeito líquido das despesas adiantadas reconhecidas. */
  efeitoDespesas: number;
  /** Com quanto sai do cenário no total. */
  total: number;
}

/**
 * Cenário de divisão COMPARTILHADO com a família: só texto leigo e números
 * agregados — nada de contato, honorário ou memória técnica. As `alocacoes`
 * viajam junto (ids ALEATÓRIOS de bem/participante, sem dado pessoal): são o
 * que o "Levar para a partilha" copia de volta para a seção III.
 */
export interface CenarioCompartilhado {
  v: 1;
  titulo: string;
  descricao?: string;
  /** Quem fica com o quê, por bem, em uma frase ("Casa → Ana (100%)"). */
  mapaBens: { bem: string; destino: string }[];
  linhas: LinhaCenarioLeiga[];
  /** Frases do resumoDoCenario (motor da Etapa 1). */
  resumo: string[];
  avisos: string[];
  /** Total de tornas em dinheiro no cenário (decimal texto), se houver. */
  totalTorna?: string;
  /** O cenário já conta despesas adiantadas reconhecidas. */
  temDespesas: boolean;
  alocacoes: Alocacoes;
}

export interface EntradaCenarioCompartilhado {
  titulo: string;
  descricao?: string;
  bens: { id: string; descricao: string }[];
  participantes: { id: string; nome: string }[];
  alocacoes: Alocacoes;
  linhas: {
    nome: string;
    direito: number;
    recebeEmBens: number;
    acertoEmDinheiro: number;
    reembolsoDespesas: number;
    abateDespesas: number;
    total: number;
  }[];
  resumo: string[];
  avisos: string[];
  totalTorna: string;
  totalDespesasReconhecidas: number;
}

const rotuloCelula = (celula: string): string => {
  const f = fracaoBonita(pctNum(celula));
  return f ?? `${String(Math.round(pctNum(celula) * 100) / 100).replace('.', ',')}%`;
};

/**
 * Monta o cenário compartilhável a partir da apuração da seção III —
 * reconstrução campo a campo (allowlist): nada da entrada atravessa por
 * referência, e só entram os campos declarados acima.
 */
export function montarCenarioCompartilhado(
  entrada: EntradaCenarioCompartilhado,
): CenarioCompartilhado {
  const mapaBens = entrada.bens.map((b) => {
    const linha = entrada.alocacoes[b.id] ?? {};
    const partes = entrada.participantes
      .filter((p) => pctNum(linha[p.id]) > 0)
      .map((p) =>
        pctNum(linha[p.id]) >= 99.995
          ? p.nome
          : `${p.nome} (${rotuloCelula(linha[p.id])})`,
      );
    return {
      bem: b.descricao,
      destino: partes.length > 0 ? partes.join(', ') : 'segue a proporção do direito de cada um',
    };
  });
  return {
    v: 1,
    titulo: entrada.titulo,
    descricao: textoOuNada(entrada.descricao),
    mapaBens,
    linhas: entrada.linhas.map((l) => ({
      nome: l.nome,
      direito: l.direito,
      recebeEmBens: l.recebeEmBens,
      acertoEmDinheiro: l.acertoEmDinheiro,
      efeitoDespesas: l.reembolsoDespesas - l.abateDespesas,
      total: l.total,
    })),
    resumo: entrada.resumo.map((f) => String(f)),
    avisos: entrada.avisos.map((f) => String(f)),
    totalTorna: Number(entrada.totalTorna) > 0 ? entrada.totalTorna : undefined,
    temDespesas: entrada.totalDespesasReconhecidas > 0,
    alocacoes: JSON.parse(JSON.stringify(entrada.alocacoes)) as Alocacoes,
  };
}

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
          id: b.id,
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
