/**
 * Área pública "Para famílias" — salvar o resultado e/ou recebê-lo por
 * e-mail. AQUI a plataforma é CONTROLADORA (LGPD): guarda só o que o
 * questionário coleta (sem dado sensível por desenho) e apaga sozinha em 90
 * dias (expiraEm) — o painel do herdeiro poderá retirar antes.
 *
 * O servidor NUNCA confia no corpo: sanitiza as respostas campo a campo e
 * RECALCULA triagem e estimativas com os motores puros antes de gravar.
 */

import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { foraSeStandby } from '@/lib/standby';
import { gerarToken } from '@/lib/portal/store';
import { sanitizarRespostas } from '@/lib/familias/sanitizar';
import { classificarVia } from '@/lib/familias/triagem';
import { estimarCustos } from '@/lib/familias/estimativas';
import { emailHabilitado, enviarEmailPortal } from '@/lib/portal/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DIAS_RETENCAO = 90;

export async function POST(req: Request) {
  const parada = foraSeStandby('familias');
  if (parada) return parada;
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  let body: { respostas?: unknown; acao?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  const acao = body.acao === 'email' ? 'email' : 'salvar';
  const respostas = sanitizarRespostas(body.respostas);
  if (!respostas) {
    return Response.json(
      { erro: 'Respostas incompletas — informe estado, data e ao menos um bem.' },
      { status: 422 },
    );
  }
  if (acao === 'email' && !/.+@.+\..+/.test(respostas.email)) {
    return Response.json({ erro: 'Informe um e-mail válido para receber o resultado.' }, { status: 422 });
  }

  // Recalcula no servidor — o resultado gravado nunca vem do cliente.
  const hoje = new Date().toISOString().slice(0, 10);
  const triagem = classificarVia(respostas);
  const estimativa = estimarCustos(respostas, hoje, triagem.via);

  const tokenGestao = gerarToken();
  const intake = await prisma.familiaIntake.create({
    data: {
      respostas: JSON.parse(JSON.stringify(respostas)) as object,
      resultado: JSON.parse(JSON.stringify({ triagem, estimativa, geradoEm: hoje })) as object,
      nome: respostas.nome || null,
      email: respostas.email || null,
      uf: respostas.ufFamilia || respostas.ufFalecido,
      cidade: respostas.cidade,
      pequenoValor: triagem.pequenoValor,
      tokenGestao,
      expiraEm: new Date(Date.now() + DIAS_RETENCAO * 86_400_000),
    },
  });

  const url = `${new URL(req.url).origin}/familias/resultado/${tokenGestao}`;
  let emailEnviado = false;
  if (acao === 'email' && emailHabilitado()) {
    emailEnviado = await enviarEmailPortal({
      para: respostas.email,
      assunto: 'Seu resultado: por onde começar o inventário',
      titulo: 'Guardamos o seu resultado',
      paragrafos: [
        `Olá${respostas.nome ? `, ${respostas.nome.split(/\s+/)[0]}` : ''}.`,
        'Este é o link do resultado que você gerou — a via indicada, as estimativas de imposto e custos, o prazo e a lista de documentos. Ele fica disponível por 90 dias.',
        'Leve-o à conversa com um(a) advogado(a) de sua confiança: ele encurta o primeiro atendimento.',
      ],
      urlPortal: url,
      rotuloBotao: 'Abrir meu resultado',
      rodape:
        'Você recebeu este e-mail porque pediu o resultado no questionário "Para famílias". Orientação geral e gratuita — não substitui a consulta com advogado(a). Esta plataforma não intermedeia honorários nem indica advogados.',
    });
  }

  return Response.json(
    { id: intake.id, token: tokenGestao, url: `/familias/resultado/${tokenGestao}`, emailEnviado },
    { status: 201 },
  );
}
