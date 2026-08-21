/**
 * Painel do Cliente (herdeiro) — o MOTOR do espelho publicado.
 *
 * O painel é uma PROJEÇÃO FILTRADA do caso, controlada pelo advogado: o
 * navegador dele monta aqui o snapshot que sobe ao servidor (tabela
 * `portal_paineis`), já SEGMENTADO por convite — cada herdeiro recebe um
 * painel próprio e nada além dele. O caso completo nunca sai da máquina.
 *
 * Regra de ouro (garantida por construção + testes em painel.test.ts): a
 * montagem é por ALLOWLIST — cada campo do painel é copiado nominalmente da
 * entrada; nenhum spread de objeto da folha entra aqui. O que o motor não
 * conhece, o painel não carrega: honorários, notas internas, folha de
 * partilha, análises de matrícula, minutas e os DEMAIS herdeiros ficam de
 * fora por impossibilidade estrutural, não por filtragem posterior.
 *
 * Motor PURO (sem Date.now/aleatoriedade): datas e ids vêm de fora.
 * Testes: npx tsx lib/portal/painel.test.ts
 */

/* ---------- fases do rito, em linguagem leiga ---------- */

export type RitoPainel = 'EXTRAJUDICIAL' | 'JUDICIAL';

export interface FasePainel {
  id: string;
  titulo: string;
  /** 1–2 frases para o leigo — sem jargão sem explicação. */
  descricao: string;
}

export const FASES_EXTRAJUDICIAL: FasePainel[] = [
  {
    id: 'documentos',
    titulo: 'Reunindo documentos',
    descricao:
      'Estamos juntando certidões e documentos da família e dos bens. É a etapa que mais depende de todos — cada documento enviado acelera o processo.',
  },
  {
    id: 'minuta',
    titulo: 'Preparando a minuta',
    descricao:
      'O advogado redige o texto da escritura (a "minuta") descrevendo os bens e como serão divididos, para todos conferirem antes do cartório.',
  },
  {
    id: 'itcmd',
    titulo: 'Imposto (ITCMD)',
    descricao:
      'Declaração e pagamento do imposto estadual sobre a herança. Sem a guia paga, o cartório não lavra a escritura.',
  },
  {
    id: 'escritura',
    titulo: 'Escritura no cartório',
    descricao:
      'Assinatura da escritura de inventário no Tabelionato de Notas — é o ato que formaliza a partilha.',
  },
  {
    id: 'registros',
    titulo: 'Registros finais',
    descricao:
      'A escritura é levada ao Registro de Imóveis (e demais órgãos) para passar cada bem ao nome de quem o recebeu. Aqui o inventário termina.',
  },
];

export const FASES_JUDICIAL: FasePainel[] = [
  {
    id: 'documentos',
    titulo: 'Reunindo documentos',
    descricao:
      'Estamos juntando certidões e documentos da família e dos bens. É a etapa que mais depende de todos — cada documento enviado acelera o processo.',
  },
  {
    id: 'peticao-inicial',
    titulo: 'Petição inicial',
    descricao:
      'O advogado apresenta o pedido de abertura do inventário ao juiz.',
  },
  {
    id: 'primeiras-declaracoes',
    titulo: 'Primeiras declarações',
    descricao:
      'Documento que apresenta ao juiz a família, os bens e as dívidas conhecidas.',
  },
  {
    id: 'citacoes',
    titulo: 'Citações',
    descricao:
      'O juiz dá ciência do processo a todos os interessados e à Fazenda. Depende dos prazos do fórum.',
  },
  {
    id: 'itcmd',
    titulo: 'Imposto (ITCMD)',
    descricao:
      'Declaração e pagamento do imposto estadual sobre a herança.',
  },
  {
    id: 'ultimas-declaracoes',
    titulo: 'Últimas declarações',
    descricao:
      'Versão final da lista de bens e do plano de partilha, para a decisão do juiz.',
  },
  {
    id: 'sentenca',
    titulo: 'Sentença',
    descricao:
      'O juiz homologa (aprova) a partilha. O tempo desta etapa depende do andamento do fórum.',
  },
  {
    id: 'formal-de-partilha',
    titulo: 'Formal de partilha',
    descricao:
      'Documento expedido pelo fórum que comprova o que coube a cada um — é o equivalente judicial da escritura.',
  },
  {
    id: 'registros',
    titulo: 'Registros finais',
    descricao:
      'O formal é levado ao Registro de Imóveis (e demais órgãos) para passar cada bem ao nome de quem o recebeu. Aqui o inventário termina.',
  },
];

export function fasesDoRito(rito: RitoPainel): FasePainel[] {
  return rito === 'JUDICIAL' ? FASES_JUDICIAL : FASES_EXTRAJUDICIAL;
}

/* ---------- entrada (o que o advogado decide publicar) ---------- */

/** Alternâncias de visibilidade — o padrão é o mais restritivo. */
export interface VisibilidadePainel {
  /** Exibe telefone/e-mail do advogado no cabeçalho. */
  contato: boolean;
  /** Exibe a lista de custos MARCADOS como visíveis. */
  custos: boolean;
  /** Libera o quinhão de cada herdeiro (sempre com o aviso de estimativa). */
  quinhao: boolean;
}

export const VISIBILIDADE_PADRAO: VisibilidadePainel = {
  contato: true,
  custos: false,
  quinhao: false,
};

export interface CustoVisivel {
  rotulo: string;
  /** Decimal como texto ("1234.56") — a UI formata. */
  valor: string;
  situacao: 'PAGO' | 'PREVISTO';
}

export interface EventoPainel {
  /** ISO (yyyy-mm-dd) — vem de fora, o motor não olha o relógio. */
  data: string;
  texto: string;
}

export interface ConviteDoPainel {
  token: string;
  nomeHerdeiro: string;
  /** Quinhão DESTE herdeiro; só entra no painel com visibilidade.quinhao. */
  quinhao?: { valor: string; fracao?: string };
}

export interface EntradaPainel {
  nomeFalecido: string;
  advogado: { nome: string; telefone?: string; email?: string };
  rito: RitoPainel;
  /** Id da fase atual (marcada MANUALMENTE pelo advogado). */
  faseAtual: string;
  /** Texto curto editável pelo advogado + data estimada (sempre estimativa). */
  proximoPasso?: { texto: string; dataEstimada?: string };
  /** Somente itens que o advogado marcou como visíveis. */
  custos?: CustoVisivel[];
  /** Histórico de atualizações, do mais recente ao mais antigo. */
  historico?: EventoPainel[];
  convites: ConviteDoPainel[];
}

/* ---------- saída (um painel POR convite) ---------- */

export const AVISO_QUINHAO =
  'Valores estimados, sujeitos a alteração até a partilha final.';

export interface PainelHerdeiro {
  v: 1;
  nomeFalecido: string;
  nomeHerdeiro: string;
  advogado: { nome: string; telefone?: string; email?: string };
  rito: RitoPainel;
  fases: (FasePainel & { atual: boolean; concluida: boolean })[];
  proximoPasso?: { texto: string; dataEstimada?: string };
  custos?: CustoVisivel[];
  quinhao?: { valor: string; fracao?: string; aviso: string };
  historico: EventoPainel[];
}

/** Texto opcional só entra no painel quando tem conteúdo de verdade. */
function textoOuNada(v: string | undefined): string | undefined {
  const t = (v ?? '').trim();
  return t === '' ? undefined : t;
}

/**
 * Monta os painéis do caso, UM por convite (chave = token). Cada painel é
 * reconstruído campo a campo — nada da entrada atravessa por referência ou
 * spread, e o painel de um herdeiro não conhece os demais convites.
 */
export function montarPaineisDoCaso(
  entrada: EntradaPainel,
  visibilidade: VisibilidadePainel,
): Record<string, PainelHerdeiro> {
  const fases = fasesDoRito(entrada.rito);
  const indiceAtual = Math.max(0, fases.findIndex((f) => f.id === entrada.faseAtual));
  const linhaDoTempo = fases.map((f, i) => ({
    id: f.id,
    titulo: f.titulo,
    descricao: f.descricao,
    atual: i === indiceAtual,
    concluida: i < indiceAtual,
  }));

  const custos =
    visibilidade.custos && entrada.custos && entrada.custos.length > 0
      ? entrada.custos.map((c) => ({
          rotulo: c.rotulo,
          valor: c.valor,
          situacao: c.situacao,
        }))
      : undefined;

  const historico = (entrada.historico ?? []).map((e) => ({ data: e.data, texto: e.texto }));

  const proximoTexto = textoOuNada(entrada.proximoPasso?.texto);
  const proximoPasso = proximoTexto
    ? { texto: proximoTexto, dataEstimada: textoOuNada(entrada.proximoPasso?.dataEstimada) }
    : undefined;

  const paineis: Record<string, PainelHerdeiro> = {};
  for (const convite of entrada.convites) {
    if (!convite.token) continue;
    paineis[convite.token] = {
      v: 1,
      nomeFalecido: entrada.nomeFalecido,
      nomeHerdeiro: convite.nomeHerdeiro,
      advogado: visibilidade.contato
        ? {
            nome: entrada.advogado.nome,
            telefone: textoOuNada(entrada.advogado.telefone),
            email: textoOuNada(entrada.advogado.email),
          }
        : { nome: entrada.advogado.nome },
      rito: entrada.rito,
      // Cópia POR PAINEL: um snapshot serializado por convite não pode
      // compartilhar referências (mutação num vazaria no outro).
      fases: linhaDoTempo.map((f) => ({ ...f })),
      proximoPasso: proximoPasso ? { ...proximoPasso } : undefined,
      custos: custos?.map((c) => ({ ...c })),
      quinhao:
        visibilidade.quinhao && convite.quinhao
          ? {
              valor: convite.quinhao.valor,
              fracao: textoOuNada(convite.quinhao.fracao),
              aviso: AVISO_QUINHAO,
            }
          : undefined,
      historico: historico.map((e) => ({ ...e })),
    };
  }
  return paineis;
}
