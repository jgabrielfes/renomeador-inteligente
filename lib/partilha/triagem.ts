/**
 * Triagem de viabilidade — extrajudicial ou judicial?
 *
 * Árvore de decisão pura. Cada resposta que fecha a via extrajudicial vira um
 * impedimento com fundamento; o parecer preliminar sai montado para o advogado
 * colar na comunicação com o cliente.
 *
 * CPC art. 610 e Resolução CNJ 35/2007. As hipóteses de inventário
 * extrajudicial COM testamento mudaram por normas do CNJ nos últimos anos —
 * o item correspondente exige verificação na redação vigente, e o módulo
 * sinaliza isso em vez de decidir.
 */

export interface RespostasTriagem {
  todosMaioresECapazes: boolean;
  consensoEntreHerdeiros: boolean;
  existeTestamento: boolean;
  /** Se existe: já foi aberto/registrado e cumprido judicialmente? */
  testamentoCumpridoJudicialmente?: boolean;
  herdeiroNoExterior: boolean;
  bemNoExterior: boolean;
  falecidoDeixouDividasRelevantes: boolean;
  uf: string;
}

export type Via = 'EXTRAJUDICIAL' | 'JUDICIAL' | 'EXTRAJUDICIAL_CONDICIONADA';

export interface Impedimento {
  codigo: string;
  descricao: string;
  fundamento: string;
  contornavel: boolean;
  comoContornar?: string;
}

export interface ParecerTriagem {
  via: Via;
  impedimentos: Impedimento[];
  condicoes: string[];
  proximosPassos: string[];
  parecerPreliminar: string;
}

export function triagem(r: RespostasTriagem): ParecerTriagem {
  const impedimentos: Impedimento[] = [];
  const condicoes: string[] = [];

  if (!r.todosMaioresECapazes) {
    impedimentos.push({
      codigo: 'INCAPAZ',
      descricao: 'Há herdeiro menor de idade ou incapaz.',
      fundamento: 'CPC art. 610, caput',
      contornavel: false,
    });
  }

  if (!r.consensoEntreHerdeiros) {
    impedimentos.push({
      codigo: 'LITIGIO',
      descricao: 'Não há consenso entre os herdeiros sobre a partilha.',
      fundamento: 'CPC art. 610, §1º — a escritura exige acordo de todos',
      contornavel: true,
      comoContornar:
        'Mediação prévia ou negociação assistida. Alcançado o consenso, a via extrajudicial reabre.',
    });
  }

  if (r.existeTestamento && !r.testamentoCumpridoJudicialmente) {
    impedimentos.push({
      codigo: 'TESTAMENTO',
      descricao: 'Há testamento ainda não cumprido judicialmente.',
      fundamento:
        'CPC art. 610, caput; hipóteses de dispensa via normas do CNJ — VERIFICAR redação vigente do Código Nacional de Normas',
      contornavel: true,
      comoContornar:
        'Abertura/registro e cumprimento do testamento, ou enquadramento em hipótese normativa de dispensa (com autorização do juízo quando exigida). Conferir também a norma da corregedoria estadual.',
    });
  }

  if (r.herdeiroNoExterior) {
    condicoes.push(
      'Herdeiro no exterior: não impede a escritura — participa por procuração pública (lavrada em consulado ou notário local com apostila e tradução juramentada).',
    );
  }

  if (r.bemNoExterior) {
    impedimentos.push({
      codigo: 'BEM_EXTERIOR',
      descricao: 'Há bem situado no exterior.',
      fundamento:
        'A jurisdição brasileira inventaria os bens situados no Brasil (CPC art. 23, II); o bem estrangeiro segue procedimento no país de situação.',
      contornavel: true,
      comoContornar:
        'Partilha no Brasil limitada aos bens aqui situados; procedimento sucessório paralelo no país do bem.',
    });
  }

  if (r.falecidoDeixouDividasRelevantes) {
    condicoes.push(
      'Dívidas relevantes do espólio: a escritura deve equacioná-las (reserva de bens ou anuência de credores). Dívida fiscal impede a emissão de certidões negativas exigidas para lavratura.',
    );
  }

  const fatais = impedimentos.filter((i) => !i.contornavel);
  const contornaveis = impedimentos.filter((i) => i.contornavel);

  let via: Via;
  if (fatais.length > 0) via = 'JUDICIAL';
  else if (contornaveis.length > 0) via = 'EXTRAJUDICIAL_CONDICIONADA';
  else via = 'EXTRAJUDICIAL';

  const proximosPassos: string[] = [];
  if (via === 'EXTRAJUDICIAL') {
    proximosPassos.push(
      'Reunir documentos pessoais e certidões (módulo de acervo e certidões).',
      'Levantar o acervo completo antes das primeiras declarações.',
      `Verificar prazo de abertura e multa do ITCMD na UF ${r.uf}.`,
      'Escolher o tabelionato (livre escolha, independente do domicílio — Res. CNJ 35, art. 1º).',
    );
  } else if (via === 'EXTRAJUDICIAL_CONDICIONADA') {
    proximosPassos.push(
      'Tratar os impedimentos contornáveis listados; reavaliar a via após cada um.',
      'Enquanto isso, iniciar o levantamento de acervo — aproveita para as duas vias.',
    );
  } else {
    proximosPassos.push(
      'Distribuir inventário judicial no foro do último domicílio do falecido (CPC art. 48).',
      'Avaliar arrolamento sumário se houver consenso (CPC art. 659) — mais célere que o rito comum.',
    );
  }

  const parecerPreliminar = montarParecer(via, impedimentos, condicoes);

  return { via, impedimentos, condicoes, proximosPassos, parecerPreliminar };
}

function montarParecer(via: Via, imp: Impedimento[], cond: string[]): string {
  const partes: string[] = [];
  if (via === 'EXTRAJUDICIAL') {
    partes.push(
      'Análise preliminar: o inventário PODE tramitar pela via extrajudicial (escritura pública em tabelionato de notas), presentes os requisitos do art. 610 do CPC e da Resolução CNJ 35/2007.',
    );
  } else if (via === 'EXTRAJUDICIAL_CONDICIONADA') {
    partes.push(
      'Análise preliminar: a via extrajudicial é POSSÍVEL, condicionada à superação dos seguintes pontos:',
    );
    for (const i of imp) {
      partes.push(`— ${i.descricao} (${i.fundamento}). Caminho: ${i.comoContornar ?? '—'}`);
    }
  } else {
    partes.push('Análise preliminar: o inventário deve tramitar pela via JUDICIAL.');
    for (const i of imp.filter((x) => !x.contornavel)) {
      partes.push(`— ${i.descricao} (${i.fundamento}).`);
    }
  }
  for (const c of cond) partes.push(`Atenção: ${c}`);
  partes.push(
    'Este parecer é preliminar e automatizado; não substitui a análise do advogado responsável.',
  );
  return partes.join('\n');
}
