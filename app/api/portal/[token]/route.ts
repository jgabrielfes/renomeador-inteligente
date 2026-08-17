import {
  CAMPOS_QUALIFICACAO_HERDEIRO,
  type QualificacaoHerdeiro,
} from '@/lib/portal/store';
// Store PERSISTENTE (Postgres): o convite não expira e os envios sobrevivem
// aos cold starts — a memória era o que fazia o link "morrer".
import { store } from '@/lib/portal/store-prisma';
import { registrarPortal } from '@/app/(private)/sucessorista/actions';
import { foraDaPlataforma } from '@/lib/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

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
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const { token } = await ctx.params;
  let body: {
    docId?: string;
    status?: string;
    nomeArquivo?: string;
    tipoDetectado?: string;
    observacaoAdvogado?: string;
    qualificacao?: Record<string, unknown>;
    confirmarEnvio?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  // Botão "Salvar" do herdeiro: registra a confirmação de que o envio chegou
  // à folha — devolve o convite com o carimbo para a página confirmar.
  if (body?.confirmarEnvio === true) {
    const atualizado = await store.confirmarEnvio(token);
    if (!atualizado) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
    void registrarPortal({
      casoId: atualizado.casoId,
      etapa: 'CONFIRMACAO',
      quantidade: atualizado.documentos.filter((d) => d.status !== 'PENDENTE').length,
      comUsuario: false,
    });
    return Response.json(atualizado);
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
    // Telemetria: o herdeiro respondeu a ficha. Só a CONTAGEM de campos —
    // os valores são CPF/RG/endereço e nunca entram. Evento sem usuário: o
    // herdeiro convidado não tem login (o casoId amarra ao caso).
    void registrarPortal({
      casoId: atualizado.casoId,
      etapa: 'QUALIFICACAO',
      quantidade: Object.keys(qualificacao).length,
      comUsuario: false,
    });
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
  if (patch.status === 'ENVIADO') {
    // Documento anexado pelo herdeiro: a TAG do tipo detectado é segura; o
    // nome do arquivo, não — ele fica de fora.
    void registrarPortal({
      casoId: atualizado.casoId,
      etapa: 'DOCUMENTO',
      quantidade: atualizado.documentos.filter((d) => d.status !== 'PENDENTE').length,
      tipoDetectado: patch.tipoDetectado ?? null,
      comUsuario: false,
    });
  }
  return Response.json(atualizado);
}
