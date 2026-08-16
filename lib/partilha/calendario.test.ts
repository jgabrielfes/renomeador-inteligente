/**
 * Casos de teste do gerador de calendário dos prazos do inventário.
 *
 * Roda sem dependência externa:
 *   npx tsx lib/partilha/calendario.test.ts
 */

import { montarIcs, linkGoogleAgenda, prazosDoItcmd } from './calendario';

let ok = 0, fail = 0;
function eq(nome: string, a: unknown, e: unknown) {
  if (JSON.stringify(a) === JSON.stringify(e)) ok++;
  else { fail++; console.error(`  ✗ ${nome}\n    esperado ${JSON.stringify(e)}\n    obtido   ${JSON.stringify(a)}`); }
}

console.log('\nCalendário dos prazos do inventário\n');

// Prazos a partir do óbito.
const prazos = prazosDoItcmd('2026-01-01', 'Espólio de João');
eq('três prazos', prazos.map((p) => p.id.split('-').slice(0, 3).join('-')), [
  'itcmd-abertura-60',
  'itcmd-desconto-90',
  'itcmd-vencimento-180',
]);
eq('abertura em 60 dias', prazos[0].data, '2026-03-02');
eq('desconto em 90 dias', prazos[1].data, '2026-04-01');
eq('vencimento em 180 dias', prazos[2].data, '2026-06-30');
eq('título traz o nome do caso', prazos[0].titulo.includes('Espólio de João'), true);

// ICS bem formado.
const ics = montarIcs(prazos, '2026-08-14T12:00:00.000Z');
eq('abre e fecha VCALENDAR', ics.startsWith('BEGIN:VCALENDAR') && ics.trimEnd().endsWith('END:VCALENDAR'), true);
eq('três VEVENT', (ics.match(/BEGIN:VEVENT/g) ?? []).length, 3);
eq('data de dia inteiro', ics.includes('DTSTART;VALUE=DATE:20260302'), true);
eq('DTEND é o dia seguinte', ics.includes('DTEND;VALUE=DATE:20260303'), true);
eq('lembrete de 7 dias', ics.includes('TRIGGER:-P7D'), true);
eq('CRLF entre linhas', ics.includes('\r\n'), true);

// Link do Google Agenda.
const link = linkGoogleAgenda(prazos[2]);
eq('link para o calendar.google', link.startsWith('https://calendar.google.com/calendar/render?'), true);
eq('datas no link', link.includes('dates=20260630%2F20260701'), true);

console.log(`\n${ok} passaram, ${fail} falharam\n`);
if (fail > 0) process.exit(1);
