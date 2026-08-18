/**
 * GET /api/portal/arquivo/[id] — download do arquivo enviado pelo herdeiro.
 *
 * Lado do ESCRITÓRIO: exige sessão (401), como as demais rotas privadas — o
 * id aleatório não é credencial. A aba Documentos usa esta rota nos botões
 * "baixar" e "anexar ao caso" da linha do envio do cofre.
 */

import { foraDaPlataforma } from '@/lib/app';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  // Rota do Sucessorista: nos outros deploys ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const session = await auth();
  if (!session) return Response.json({ erro: 'Não autenticado.' }, { status: 401 });

  const { id } = await ctx.params;
  let linha: { nome: string; mime: string; conteudo: Uint8Array } | null = null;
  try {
    linha = await prisma.portalArquivo.findUnique({
      where: { id },
      select: { nome: true, mime: true, conteudo: true },
    });
  } catch {
    return Response.json({ erro: 'Banco indisponível.' }, { status: 503 });
  }
  if (!linha) return Response.json({ erro: 'Arquivo não encontrado.' }, { status: 404 });

  // filename* (RFC 5987) preserva acentos do nome proposto pelo renomeador.
  return new Response(new Uint8Array(linha.conteudo), {
    headers: {
      'content-type': linha.mime,
      'content-length': String(linha.conteudo.byteLength),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(linha.nome)}`,
      'cache-control': 'no-store',
    },
  });
}
