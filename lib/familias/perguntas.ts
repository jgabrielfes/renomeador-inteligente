/**
 * "10 perguntas para fazer ao(à) advogado(a)" — conteúdo EDUCATIVO estático
 * da área "Para famílias". Prepara a família para a primeira conversa, com
 * qualquer profissional — a plataforma não indica advogados nem intermedeia
 * honorários (docs/etica-oab.md).
 */

export interface PerguntaAoAdvogado {
  pergunta: string;
  porque: string;
}

export const PERGUNTAS_AO_ADVOGADO: PerguntaAoAdvogado[] = [
  {
    pergunta: 'No nosso caso, o inventário pode ser feito em cartório ou precisa ir ao juiz?',
    porque: 'A via muda o prazo e o custo — e a resposta depende de detalhes que só a conversa revela.',
  },
  {
    pergunta: 'Quanto devemos reservar para o imposto (ITCMD) e há como reduzir legalmente?',
    porque: 'Isenções e a forma de declarar os valores mudam a conta — cada estado tem regras próprias.',
  },
  {
    pergunta: 'Já passou algum prazo? O que isso custa e como estancar?',
    porque: 'Multas por atraso crescem com o tempo — saber onde o relógio está é o primeiro passo.',
  },
  {
    pergunta: 'Quais documentos faltam e quem consegue cada um?',
    porque: 'Dividir a coleta entre a família acelera semanas do processo.',
  },
  {
    pergunta: 'Como ficam as contas bancárias, o FGTS e os valores a receber do falecido?',
    porque: 'Alguns valores saem por caminho mais curto (alvará) — sem esperar o inventário inteiro.',
  },
  {
    pergunta: 'Quem deve ser o(a) inventariante e quais são as responsabilidades?',
    porque: 'O(a) inventariante representa o espólio e assina por ele — é bom escolher com consciência.',
  },
  {
    pergunta: 'Como serão cobrados os honorários e o que está incluído?',
    porque: 'Honorários são combinados livremente entre a família e o(a) profissional — clareza no início evita surpresa no fim.',
  },
  {
    pergunta: 'Quanto tempo o senhor/a senhora estima para o nosso caso, com as etapas principais?',
    porque: 'Uma linha do tempo realista ajuda a família a se organizar (e a cobrar andamento).',
  },
  {
    pergunta: 'Podemos vender ou usar algum bem antes do fim do inventário?',
    porque: 'Em regra não, mas há autorizações possíveis — vale saber antes de assumir compromissos.',
  },
  {
    pergunta: 'E se aparecer um bem ou uma dívida depois de terminado?',
    porque: 'Existe a sobrepartilha para bens esquecidos — saber disso tira o peso de "ter que lembrar de tudo agora".',
  },
];
