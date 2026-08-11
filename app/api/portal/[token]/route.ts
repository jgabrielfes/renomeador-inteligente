import {
  store,
  CAMPOS_QUALIFICACAO_HERDEIRO,
  type QualificacaoHerdeiro,
} from '@/lib/portal/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const convite = await store.obter(token);
  if (!convite) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
  return Response.json(convite);
}

/**
 * Marca um documento como enviado / aprovado / rejeitado.
 * Envio de ARQUIVO real: plugar Vercel Blob aqui — receber multipart,
 * gravar o blob e salvar a URL em nomeArquivo.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  let body: {
    docId?: string;
    status?: string;
    nomeArquivo?: string;
    tipoDetectado?: string;
    observacaoAdvogado?: string;
    qualificacao?: Record<string, unknown>;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  // Formulário do herdeiro: só os campos conhecidos entram, sempre como texto.
  if (body?.qualificacao && typeof body.qualificacao === 'object') {
    const qualificacao: QualificacaoHerdeiro = {};
    for (const campo of CAMPOS_QUALIFICACAO_HERDEIRO) {
      const v = body.qualificacao[campo];
      if (typeof v === 'string') qualificacao[campo] = v.slice(0, 300);
    }
    const atualizado = await store.salvarQualificacao(token, qualificacao);
    if (!atualizado) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
    return Response.json(atualizado);
  }

  if (!body?.docId) return Response.json({ erro: 'docId é obrigatório' }, { status: 422 });

  const patch: Record<string, string> = {};
  if (body.status && ['PENDENTE', 'ENVIADO', 'APROVADO', 'REJEITADO'].includes(body.status)) {
    patch.status = body.status;
    if (body.status === 'ENVIADO') patch.enviadoEm = new Date().toISOString();
  }
  if (body.nomeArquivo) patch.nomeArquivo = body.nomeArquivo.slice(0, 200);
  if (body.tipoDetectado) patch.tipoDetectado = body.tipoDetectado.slice(0, 80);
  if (body.observacaoAdvogado !== undefined) patch.observacaoAdvogado = String(body.observacaoAdvogado);

  const atualizado = await store.atualizarDocumento(token, body.docId, patch);
  if (!atualizado) return Response.json({ erro: 'Convite ou documento não encontrado' }, { status: 404 });
  return Response.json(atualizado);
}
