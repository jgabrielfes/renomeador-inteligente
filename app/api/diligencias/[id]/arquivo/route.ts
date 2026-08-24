/**
 * Arquivos da PASTA da diligência (camada 4, pilar B).
 *
 * GET ?arquivo=<id> — download em STREAM, só para o solicitante e o(a)
 * correspondente escolhido(a); qualquer origem fora de pasta/relatório é
 * negada (não-vazamento, mesmo motor testado).
 *
 * POST multipart — o(a) CORRESPONDENTE entrega o relatório e os documentos
 * obtidos (origem 'relatorio'); a diligência passa a 'relatorio_entregue'.
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { conteudoDaPasta } from '@/lib/rede/diligencias';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ARQUIVO = 3_500_000;

type Ctx = { params: Promise<{ id: string }> };

async function diligenciaAutorizada(id: string) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { erro: Response.json({ erro: 'Não autenticado.' }, { status: 401 }) };
  const d = await prisma.diligencia.findUnique({ where: { id } });
  if (!d || (d.solicitanteUserId !== userId && d.correspondenteUserId !== userId)) {
    return { erro: Response.json({ erro: 'Diligência não encontrada.' }, { status: 404 }) };
  }
  return { d, userId };
}

export async function GET(req: Request, ctx: Ctx) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  const { id } = await ctx.params;
  const r = await diligenciaAutorizada(id);
  if ('erro' in r) return r.erro;

  const arquivoId = new URL(req.url).searchParams.get('arquivo') ?? '';
  const arquivo = await prisma.diligenciaArquivo.findUnique({ where: { id: arquivoId } });
  if (!arquivo || arquivo.diligenciaId !== id || conteudoDaPasta([arquivo]).length === 0) {
    return Response.json({ erro: 'Arquivo não encontrado.' }, { status: 404 });
  }
  return new Response(new Uint8Array(arquivo.conteudo), {
    headers: {
      'content-type': arquivo.mime,
      'content-length': String(arquivo.tamanho),
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(arquivo.nome)}`,
    },
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  const { id } = await ctx.params;
  const r = await diligenciaAutorizada(id);
  if ('erro' in r) return r.erro;
  if (r.d.correspondenteUserId !== r.userId) {
    return Response.json({ erro: 'Só o(a) correspondente entrega o relatório.' }, { status: 403 });
  }
  if (r.d.status !== 'em_execucao' && r.d.status !== 'aceita' && r.d.status !== 'relatorio_entregue') {
    return Response.json({ erro: 'A diligência não está em execução.' }, { status: 409 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ erro: 'Envio inválido.' }, { status: 400 });
  }
  const arquivos = form.getAll('arquivos').filter((a): a is File => a instanceof File);
  if (arquivos.length === 0) return Response.json({ erro: 'Anexe o relatório.' }, { status: 422 });
  for (const a of arquivos) {
    if (a.size > MAX_ARQUIVO) {
      return Response.json({ erro: `"${a.name}" passa de 3,5 MB.` }, { status: 413 });
    }
  }
  for (const a of arquivos) {
    await prisma.diligenciaArquivo.create({
      data: {
        diligenciaId: id,
        origem: 'relatorio',
        nome: a.name.slice(0, 200),
        mime: a.type || 'application/octet-stream',
        tamanho: a.size,
        conteudo: Buffer.from(await a.arrayBuffer()),
      },
    });
  }
  await prisma.diligencia.update({ where: { id }, data: { status: 'relatorio_entregue' } });
  return Response.json({ ok: true }, { status: 201 });
}
