/**
 * MÓDULO 2 — Checklist e prazos da Declaração Final de Espólio.
 *
 * Motor de DATAS (IN SRF 81/2001): a partir do óbito e do marco da partilha
 * (escritura ou trânsito em julgado), monta o checklist das declarações no
 * CPF do falecido — inicial, intermediárias e final — com prazo, status
 * (OK/PENDENTE/ATRASADO) e a lista de herdeiros/quinhões para colar na DIRPF.
 * Motor PURO (com testes). Apoio ao profissional, a confirmar no caso.
 */

import { DARF_GANHO_CAPITAL } from './parametros-fiscais';

export interface HerdeiroQuinhao {
  nome: string;
  cpf: string;
  quinhao: number;
}

export interface EntradaDeclaracaoFinal {
  dataObito: string; // ISO
  /** Escritura ou trânsito em julgado da partilha (ISO) — null se ainda não há. */
  dataMarcoPartilha: string | null;
  /** Anos-base já declarados (ex.: [2024, 2025]). */
  declaracoesEntregues: number[];
  haviaBens: boolean;
  /** Herdeiros com quinhão, vindos da etapa III (para pré-preencher). */
  herdeiros?: HerdeiroQuinhao[];
  /** Data de referência (hoje, ISO) para o status. */
  dataReferencia: string;
}

export type StatusDF = 'OK' | 'PENDENTE' | 'ATRASADO';

export interface ItemChecklistDF {
  tipo: 'INICIAL' | 'INTERMEDIARIA' | 'FINAL';
  anoBase: number;
  /** Prazo de entrega (último dia útil de abril do ano seguinte), ISO. */
  prazo: string;
  entregue: boolean;
  status: StatusDF;
  observacao: string;
}

export interface ResultadoDeclaracaoFinal {
  obrigatoria: boolean;
  itens: ItemChecklistDF[];
  prazoFinal: string | null;
  /** Dias até o prazo da final (negativo = vencido); null sem marco. */
  diasParaFinal: number | null;
  herdeiros: HerdeiroQuinhao[];
  darf: typeof DARF_GANHO_CAPITAL;
  alertas: string[];
}

/** Último dia ÚTIL de abril do ano indicado (prazo da DIRPF), ISO. */
export function ultimoDiaUtilDeAbril(ano: number): string {
  const d = new Date(Date.UTC(ano, 3, 30)); // 30 de abril
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) {
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return d.toISOString().slice(0, 10);
}

function diffDias(deIso: string, ateIso: string): number {
  return Math.round(
    (new Date(`${ateIso}T00:00`).getTime() - new Date(`${deIso}T00:00`).getTime()) / 86_400_000,
  );
}

export function planejarDeclaracaoFinal(
  entrada: EntradaDeclaracaoFinal,
): ResultadoDeclaracaoFinal {
  const herdeiros = entrada.herdeiros ?? [];
  const entregues = new Set(entrada.declaracoesEntregues);
  const anoObito = Number(entrada.dataObito.slice(0, 4));
  const hoje = entrada.dataReferencia;

  // Sem bens a inventariar: não há Declaração Final obrigatória (IN 81/2001).
  if (!entrada.haviaBens) {
    return {
      obrigatoria: false,
      itens: [],
      prazoFinal: null,
      diasParaFinal: null,
      herdeiros,
      darf: DARF_GANHO_CAPITAL,
      alertas: [
        'Sem bens a inventariar: não há Declaração Final de Espólio obrigatória — verifique apenas a comunicação do óbito e a declaração normal do exercício, se for o caso.',
      ],
    };
  }

  const anoMarco = entrada.dataMarcoPartilha
    ? Number(entrada.dataMarcoPartilha.slice(0, 4))
    : null;

  const itens: ItemChecklistDF[] = [];
  const statusDe = (anoBase: number): { entregue: boolean; status: StatusDF; prazo: string } => {
    const prazo = ultimoDiaUtilDeAbril(anoBase + 1);
    const entregue = entregues.has(anoBase);
    const status: StatusDF = entregue ? 'OK' : hoje > prazo ? 'ATRASADO' : 'PENDENTE';
    return { entregue, status, prazo };
  };

  // Sem marco definido ainda: só as declarações do óbito até o ano de hoje
  // são exigíveis (intermediárias em curso), sem a final.
  const anoLimite = anoMarco ?? Number(hoje.slice(0, 4));

  for (let ano = anoObito; ano <= anoLimite; ano++) {
    const { entregue, status, prazo } = statusDe(ano);
    const ehFinal = anoMarco !== null && ano === anoMarco;
    const tipo: ItemChecklistDF['tipo'] = ehFinal ? 'FINAL' : ano === anoObito ? 'INICIAL' : 'INTERMEDIARIA';
    itens.push({
      tipo,
      anoBase: ano,
      prazo,
      entregue,
      status,
      observacao: ehFinal
        ? 'Declaração FINAL: rendimentos de 1º/jan até a partilha; bens pelo valor de transferência escolhido; imposto e o DARF 4600 do ganho de capital vencem na entrega (sem quota única para a final).'
        : ano === anoObito
          ? 'Declaração inicial do espólio (ano-calendário do falecimento).'
          : 'Declaração intermediária do espólio (ano-calendário entre o óbito e a partilha).',
    });
  }

  const prazoFinal = anoMarco !== null ? ultimoDiaUtilDeAbril(anoMarco + 1) : null;
  const diasParaFinal = prazoFinal ? diffDias(hoje, prazoFinal) : null;

  const alertas: string[] = [];
  const atrasadas = itens.filter((i) => i.status === 'ATRASADO' && i.tipo !== 'FINAL');
  if (atrasadas.length > 0) {
    alertas.push(
      `Declaração(ões) intermediária(s) em atraso: ano(s)-base ${atrasadas.map((i) => i.anoBase).join(', ')} — sujeito a multa por atraso (mínimo de R$ 165,74).`,
    );
  }
  if (prazoFinal && diasParaFinal !== null) {
    if (diasParaFinal < 0) {
      alertas.push(`Declaração FINAL VENCIDA há ${Math.abs(diasParaFinal)} dia(s) (prazo ${prazoFinal}).`);
    } else {
      alertas.push(`Declaração FINAL: ${diasParaFinal} dia(s) até o prazo (${prazoFinal}).`);
    }
  } else {
    alertas.push('Marco da partilha (escritura ou trânsito) ainda não definido — a Declaração Final abre quando ele ocorrer.');
  }
  alertas.push('Após a Declaração Final, o CPF do falecido é baixado: resolva certidões e pendências ANTES da entrega.');
  alertas.push('Rendimentos recebidos após a partilha pertencem aos herdeiros, não ao espólio.');

  return {
    obrigatoria: true,
    itens,
    prazoFinal,
    diasParaFinal,
    herdeiros,
    darf: DARF_GANHO_CAPITAL,
    alertas,
  };
}
