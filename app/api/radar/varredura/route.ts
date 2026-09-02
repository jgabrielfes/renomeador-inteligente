/**
 * Varredura AUTOMÁTICA do aviso de 72h — endpoint de CRON.
 *
 * Quem chama é a GitHub Action `.github/workflows/varredura-radar.yml` (uma
 * vez por dia), autenticada pelo segredo `CRON_SECRET` no header
 * Authorization. Sem a env o endpoint NÃO EXISTE (404), como os demais
 * recursos env-gated do projeto — e o botão manual do /admin/radar continua
 * fazendo o mesmo trabalho pelo mesmo motor (`lib/radar/varredura.ts`).
 *
 * Não é rota de usuário: não há sessão aqui; o segredo é a credencial.
 */

import { foraDaPlataforma } from '@/lib/app';
import { foraSeStandby } from '@/lib/standby';
import { radarAtivo } from '@/lib/radar/config';
import { varrerAviso72h } from '@/lib/radar/varredura';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Comparação em tempo constante — segredo curto não vaza por timing. */
function segredoConfere(recebido: string, esperado: string): boolean {
  if (recebido.length !== esperado.length) return false;
  let diff = 0;
  for (let i = 0; i < recebido.length; i++) diff |= recebido.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: Request) {
  const parada = foraSeStandby('radar');
  if (parada) return parada;
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  const esperado = process.env.CRON_SECRET;
  // Sem segredo configurado o recurso não existe (nem revela que existiria).
  if (!esperado || !radarAtivo()) {
    return Response.json({ erro: 'Não encontrado.' }, { status: 404 });
  }
  const cabecalho = req.headers.get('authorization') ?? '';
  const recebido = cabecalho.startsWith('Bearer ') ? cabecalho.slice(7) : '';
  if (!segredoConfere(recebido, esperado)) {
    return Response.json({ erro: 'Não autorizado.' }, { status: 401 });
  }

  const origin = new URL(req.url).origin;
  const r = await varrerAviso72h(origin);
  return Response.json(r, { status: r.ok ? 200 : 500 });
}
