/**
 * Gerador de eventos de calendário (.ics) e link do Google Agenda para os
 * PRAZOS do inventário — o advogado leva os vencimentos do ITCMD e da
 * declaração para o celular/Google/Apple/Outlook num clique. Motor PURO.
 *
 * Datas de dia inteiro (VALUE=DATE): o prazo é um dia, sem hora — o app de
 * calendário mostra como evento do dia. Um lembrete (VALARM) de 7 dias antes
 * vem embutido em cada evento.
 */

export interface EventoPrazo {
  /** Identificador estável (para o UID). */
  id: string;
  titulo: string;
  /** Data do prazo (ISO yyyy-mm-dd). */
  data: string;
  descricao: string;
}

/** yyyy-mm-dd → yyyymmdd. */
function dataIcs(iso: string): string {
  return iso.replace(/-/g, '');
}

/** Dia seguinte (DTEND exclusivo de eventos de dia inteiro). */
function diaSeguinte(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function escapar(s: string): string {
  return s.replace(/[\\;,]/g, (m) => `\\${m}`).replace(/\n/g, '\\n');
}

/**
 * Monta o .ics com todos os eventos. `carimbo` é o DTSTAMP (data-hora UTC de
 * geração) — passado de fora porque `new Date()` argless é proibido no motor;
 * a UI injeta `new Date().toISOString()`.
 */
export function montarIcs(eventos: EventoPrazo[], carimbo: string): string {
  const stamp = carimbo.replace(/[-:]/g, '').replace(/\.\d{3}/, '').replace(/Z?$/, 'Z');
  const linhas: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//O Sucessorista//Prazos do inventario//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const e of eventos) {
    linhas.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@osucessorista`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${dataIcs(e.data)}`,
      `DTEND;VALUE=DATE:${dataIcs(diaSeguinte(e.data))}`,
      `SUMMARY:${escapar(e.titulo)}`,
      `DESCRIPTION:${escapar(e.descricao)}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapar(e.titulo)}`,
      'TRIGGER:-P7D',
      'END:VALARM',
      'END:VEVENT',
    );
  }
  linhas.push('END:VCALENDAR');
  // CRLF é o exigido pela RFC 5545.
  return linhas.join('\r\n');
}

/** Link "Adicionar ao Google Agenda" de UM evento de dia inteiro. */
export function linkGoogleAgenda(e: EventoPrazo): string {
  const dates = `${dataIcs(e.data)}/${dataIcs(diaSeguinte(e.data))}`;
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.titulo,
    dates,
    details: e.descricao,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/**
 * Prazos-padrão do ITCMD-SP a partir da data do óbito (Lei 10.705/2000):
 *  · desconto de 5% recolhendo em até 90 dias (art. 17, §2º);
 *  · abertura do inventário em até 60 dias, senão multa de 10% (art. 21, I);
 *  · vencimento do ITCMD em 180 dias — depois, multa de 20% + juros.
 * Só entram os prazos AINDA relevantes (posteriores à data de referência não
 * é filtrado aqui — a UI decide; o motor devolve todos).
 */
export function prazosDoItcmd(
  dataObito: string,
  nomeCaso: string,
): EventoPrazo[] {
  const quem = nomeCaso ? ` — ${nomeCaso}` : '';
  return [
    {
      id: `itcmd-abertura-60-${dataObito}`,
      titulo: `Abrir o inventário (60 dias)${quem}`,
      data: somarDias(dataObito, 60),
      descricao:
        'Prazo do art. 21, I da Lei 10.705/2000: requerer o inventário em até 60 dias do óbito evita a multa de 10% do ITCMD.',
    },
    {
      id: `itcmd-desconto-90-${dataObito}`,
      titulo: `Desconto de 5% do ITCMD (90 dias)${quem}`,
      data: somarDias(dataObito, 90),
      descricao:
        'Prazo do art. 17, §2º: recolhendo o ITCMD em até 90 dias do óbito, o imposto tem desconto de 5%.',
    },
    {
      id: `itcmd-vencimento-180-${dataObito}`,
      titulo: `Vencimento do ITCMD (180 dias)${quem}`,
      data: somarDias(dataObito, 180),
      descricao:
        'Vencimento do ITCMD (art. 17, §1º). Depois de 180 dias correm multa de até 20% (art. 21) e juros pela Selic (art. 20).',
    },
  ];
}
