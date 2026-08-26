/**
 * Quiz deontológico do Radar — 10 questões sobre as regras que o(a)
 * advogado(a) aceita ao responder famílias pela plataforma (EOAB, Código de
 * Ética e Provimento 205/2021 do CFOAB). APROVAÇÃO SÓ COM AS 10 CORRETAS —
 * pode refazer quantas vezes quiser; a correção mostra o que rever.
 *
 * Motor puro (sem relógio, sem I/O): a UI pergunta, o servidor corrige.
 */

export interface QuestaoQuiz {
  id: string;
  enunciado: string;
  opcoes: string[];
  /** Índice da opção correta em `opcoes`. */
  correta: number;
}

export const QUESTOES_RADAR: QuestaoQuiz[] = [
  {
    id: 'captacao',
    enunciado:
      'Ao responder um caso do Radar, o(a) advogado(a) pode prometer resultado ("garanto o inventário em 60 dias")?',
    opcoes: [
      'Sim, se tiver experiência suficiente para cumprir.',
      'Não — prometer resultado é vedado; a resposta apresenta qualificação e uma visão técnica da condução.',
      'Sim, desde que por escrito.',
    ],
    correta: 1,
  },
  {
    id: 'honorarios',
    enunciado: 'Onde os honorários são tratados?',
    opcoes: [
      'Na própria resposta do Radar, para a família já comparar preços.',
      'No chat, antes de a família escolher.',
      'Fora da plataforma, diretamente entre advogado(a) e cliente — a resposta e o chat não trazem valores de honorários.',
    ],
    correta: 2,
  },
  {
    id: 'mercantilizacao',
    enunciado: 'A plataforma cobra do(a) advogado(a) créditos de uso pela assinatura do aplicativo. Por que não uma comissão por caso fechado?',
    opcoes: [
      'Porque comissão por caso caracterizaria captação de clientela e mercantilização da advocacia, vedadas pelo Código de Ética.',
      'Porque a comissão seria difícil de calcular.',
      'Por opção comercial, podendo mudar no futuro.',
    ],
    correta: 0,
  },
  {
    id: 'escolha',
    enunciado: 'Quem escolhe o(a) advogado(a)?',
    opcoes: [
      'A plataforma, indicando o perfil mais adequado ao caso.',
      'Sempre a família — a plataforma não indica, não ranqueia e não destaca respostas.',
      'O(a) advogado(a) que responder primeiro.',
    ],
    correta: 1,
  },
  {
    id: 'publicidade',
    enunciado: 'Pelo Provimento 205/2021, a apresentação profissional na resposta deve ser:',
    opcoes: [
      'Sóbria e informativa (qualificação, experiência, forma de trabalho), sem autopromoção comparativa nem juridiquês desnecessário.',
      'Persuasiva, destacando ser "o melhor da região".',
      'Curta ao máximo, apenas nome e telefone.',
    ],
    correta: 0,
  },
  {
    id: 'sigilo',
    enunciado: 'O que o(a) advogado(a) vê de um caso ANTES de a família abrir conversa?',
    opcoes: [
      'Nome e telefone da família, para contato direto.',
      'Só o resumo anônimo (UF, via provável, faixa de valores, marcadores) — a identidade da família fica oculta até ELA escolher conversar.',
      'O questionário completo com os dados de contato.',
    ],
    correta: 1,
  },
  {
    id: 'contato-direto',
    enunciado: 'A família ainda não abriu conversa. Procurá-la por fora (redes sociais, telefone) é:',
    opcoes: [
      'Permitido, se a intenção for ajudar.',
      'Permitido após 72 horas sem resposta.',
      'Vedado — seria captação; o contato nasce apenas do "Quero conversar" da família.',
    ],
    correta: 2,
  },
  {
    id: 'identificacao',
    enunciado: 'A resposta ao caso identifica o(a) profissional?',
    opcoes: [
      'Sim — nome e inscrição na OAB acompanham a resposta; anonimato é da família, nunca do(a) advogado(a).',
      'Não, para evitar concorrência desleal.',
      'Só se a família pedir.',
    ],
    correta: 0,
  },
  {
    id: 'conflito',
    enunciado: 'Ao abrir a conversa, o(a) advogado(a) percebe que já atende a parte contrária da mesma família. O que fazer?',
    opcoes: [
      'Seguir normalmente — o Radar não cria impedimento.',
      'Declinar do caso e encerrar a conversa: há conflito de interesses.',
      'Atender os dois lados, cobrando de cada um.',
    ],
    correta: 1,
  },
  {
    id: 'plataforma',
    enunciado: 'Qual é o papel da plataforma na relação advogado(a) × família?',
    opcoes: [
      'Intermediar a contratação e reter os honorários até o fim do caso.',
      'Fiscalizar o contrato de honorários.',
      'Nenhum na contratação: ela não intermedeia honorários nem indica advogados(as) — só publica o caso anônimo e entrega a escolha à família.',
    ],
    correta: 2,
  },
];

export interface CorrecaoQuiz {
  total: number;
  acertos: number;
  /** Ids das questões erradas (ou não respondidas). */
  erradas: string[];
  /** Aprovado = TODAS corretas. */
  aprovado: boolean;
}

export function corrigirQuiz(respostas: Record<string, number>): CorrecaoQuiz {
  const erradas = QUESTOES_RADAR.filter((q) => respostas[q.id] !== q.correta).map((q) => q.id);
  return {
    total: QUESTOES_RADAR.length,
    acertos: QUESTOES_RADAR.length - erradas.length,
    erradas,
    aprovado: erradas.length === 0,
  };
}
