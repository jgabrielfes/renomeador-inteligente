/**
 * POST /api/portal/[token]/arquivo — upload REAL do documento do herdeiro.
 *
 * Exceção CONSCIENTE à fronteira de dados, decidida pelo escritório: o
 * arquivo enviado pelo link do convite repousa na tabela `portal_arquivos`
 * até o advogado baixá-lo/anexá-lo ao caso pela aba Documentos. O token é a
 * credencial (o herdeiro convidado não tem login), como nas demais rotas do
 * portal. UM arquivo por pedido — reenvio SUBSTITUI o anterior.
 *
 * Multipart: `arquivo` (o File), `docId` (pedido do convite) e, opcionais,
 * `nomeArquivo`/`tipoDetectado` (propostos pelo renomeador local no navegador
 * do herdeiro). Além de gravar o conteúdo, a rota marca o pedido como
 * ENVIADO — o client faz UMA chamada por envio. Teto de 4 MB (limite de
 * corpo das funções da Vercel); acima disso o client cai no registro sem
 * arquivo, como era antes.
 */

import { foraDaPlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import { store } from '@/lib/portal/store-prisma';
import { registrarPortal } from '@/app/(private)/sucessorista/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_BYTES = 4 * 1024 * 1024;
const EXTENSOES = /\.(pdf|jpe?g|png|webp|bmp|heic|heif|docx|xlsx)$/i;

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, ctx: Ctx) {
  // Rota do Sucessorista: nos outros deploys ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const { token } = await ctx.params;
  const convite = await store.obter(token);
  if (!convite) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ erro: 'Esperado multipart/form-data.' }, { status: 400 });
  }

  const docId = String(form.get('docId') ?? '');
  const doc = convite.documentos.find((d) => d.id === docId);
  if (!doc) return Response.json({ erro: 'Pedido não encontrado no convite.' }, { status: 422 });

  const arquivo = form.get('arquivo');
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return Response.json({ erro: 'Arquivo ausente.' }, { status: 422 });
  }
  if (arquivo.size > MAX_BYTES) {
    return Response.json({ erro: 'Arquivo acima de 4 MB.' }, { status: 413 });
  }
  if (!EXTENSOES.test(arquivo.name)) {
    return Response.json(
      { erro: 'Formato não aceito — envie PDF, foto (JPG/PNG/WEBP/HEIC) ou DOCX/XLSX.' },
      { status: 415 },
    );
  }

  const nomeProposto = String(form.get('nomeArquivo') ?? arquivo.name).slice(0, 200);
  const tipoDetectado = String(form.get('tipoDetectado') ?? '').slice(0, 80);
  const conteudo = new Uint8Array(await arquivo.arrayBuffer());

  // Reenvio substitui o anterior — o id permanece o mesmo (o unique é
  // token+docId), então o link de download do advogado continua valendo.
  let arquivoId: string;
  try {
    const linha = await prisma.portalArquivo.upsert({
      where: { token_docId: { token, docId } },
      create: { token, docId, nome: nomeProposto, mime: arquivo.type || 'application/octet-stream', tamanho: arquivo.size, conteudo },
      update: { nome: nomeProposto, mime: arquivo.type || 'application/octet-stream', tamanho: arquivo.size, conteudo },
      select: { id: true },
    });
    arquivoId = linha.id;
  } catch {
    // Banco fora (ou migração pendente): o envio degrada para o registro sem
    // arquivo — o client avisa o herdeiro para entregar por outro canal.
    return Response.json({ erro: 'Não foi possível guardar o arquivo agora.' }, { status: 503 });
  }

  const atualizado = await store.atualizarDocumento(token, docId, {
    status: 'ENVIADO',
    enviadoEm: new Date().toISOString(),
    nomeArquivo: nomeProposto,
    ...(tipoDetectado ? { tipoDetectado } : {}),
    arquivoId,
    arquivoTamanho: arquivo.size,
  });
  if (!atualizado) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });

  // Telemetria: mesma da rota PATCH — tags e contagens, nunca o conteúdo
  // nem o nome do arquivo.
  void registrarPortal({
    casoId: atualizado.casoId,
    etapa: 'DOCUMENTO',
    quantidade: atualizado.documentos.filter((d) => d.status !== 'PENDENTE').length,
    tipoDetectado: tipoDetectado || null,
    comUsuario: false,
  });

  return Response.json(atualizado);
}
