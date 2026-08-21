/**
 * POST /api/portal/[token]/arquivo — upload REAL do documento do herdeiro.
 *
 * Exceção CONSCIENTE à fronteira de dados, decidida pelo escritório: o
 * arquivo enviado pelo link do convite repousa na tabela `portal_arquivos`
 * até o advogado baixá-lo/anexá-lo ao caso pela aba Documentos. O token é a
 * credencial (o herdeiro convidado não tem login), como nas demais rotas do
 * portal. UM arquivo por pedido — reenvio SUBSTITUI o anterior.
 *
 * Teto de 25 MB por arquivo. Cada REQUISIÇÃO fica sob os ~4,5 MB de corpo
 * das funções da Vercel: arquivo pequeno vem inteiro (uma chamada); maior
 * vem em FATIAS de ~3,5 MB (`envioId`/`indice`/`total`) guardadas em
 * `portal_arquivo_partes` — a ÚLTIMA fatia remonta o arquivo, grava em
 * `portal_arquivos` e apaga as fatias. Fatias órfãs de envios abandonados
 * são varridas por melhor-esforço a cada envio novo.
 *
 * Multipart: `arquivo` (o File inteiro OU a fatia), `docId`, e opcionais
 * `nomeArquivo`/`tipoDetectado` (propostos pelo renomeador local) + os
 * campos do fatiamento (`envioId`, `indice`, `total`, `nome`, `mime`).
 * Além de gravar o conteúdo, a rota marca o pedido como ENVIADO — o client
 * faz UMA sequência de chamadas por envio. Falha degrada para o registro
 * sem arquivo, como era antes do upload real.
 */

import { foraDaPlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import { store } from '@/lib/portal/store-prisma';
import { registrarPortal } from '@/app/(private)/sucessorista/actions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_FATIA = 3.8 * 1024 * 1024;
const MAX_TOTAL = 25 * 1024 * 1024;
const MAX_FATIAS = 10; // 25 MB ÷ 3,5 MB, com folga
const EXTENSOES = /\.(pdf|jpe?g|png|webp|bmp|heic|heif|docx|xlsx)$/i;

type Ctx = { params: Promise<{ token: string }> };

export async function POST(req: Request, ctx: Ctx) {
  // Rota do Sucessorista: nos outros deploys ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const { token } = await ctx.params;
  const convite = await store.obter(token);
  if (!convite) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
  if (convite.revogadoEm) {
    return Response.json({ erro: 'Este convite foi encerrado pelo advogado.' }, { status: 410 });
  }

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
  if (arquivo.size > MAX_FATIA) {
    return Response.json({ erro: 'Fatia acima do limite por requisição.' }, { status: 413 });
  }

  // Fatiamento: total ausente/1 = arquivo inteiro nesta requisição.
  const total = Math.trunc(Number(form.get('total') ?? 1));
  const indice = Math.trunc(Number(form.get('indice') ?? 0));
  const envioId = String(form.get('envioId') ?? '');
  const fatiado = total > 1;
  if (fatiado) {
    if (
      !Number.isFinite(total) || total > MAX_FATIAS ||
      !Number.isFinite(indice) || indice < 0 || indice >= total ||
      !/^[a-zA-Z0-9-]{8,64}$/.test(envioId)
    ) {
      return Response.json({ erro: 'Fatiamento inválido.' }, { status: 422 });
    }
  }

  // O nome ORIGINAL decide o formato aceito (a fatia não tem extensão).
  const nomeOriginal = String(form.get('nome') ?? arquivo.name);
  if (!EXTENSOES.test(nomeOriginal)) {
    return Response.json(
      { erro: 'Formato não aceito — envie PDF, foto (JPG/PNG/WEBP/HEIC) ou DOCX/XLSX.' },
      { status: 415 },
    );
  }

  const nomeProposto = String(form.get('nomeArquivo') ?? nomeOriginal).slice(0, 200);
  const tipoDetectado = String(form.get('tipoDetectado') ?? '').slice(0, 80);
  const mime = String(form.get('mime') ?? arquivo.type) || 'application/octet-stream';

  let conteudo: Uint8Array<ArrayBuffer>;
  try {
    if (fatiado) {
      // Guarda a fatia; só a última remonta. A varredura de órfãs (envios
      // abandonados há mais de 24h) pega carona na primeira fatia.
      if (indice === 0) {
        void prisma.portalArquivoParte
          .deleteMany({ where: { criadoEm: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
          .catch(() => {});
      }
      await prisma.portalArquivoParte.upsert({
        where: { envioId_indice: { envioId, indice } },
        create: { envioId, indice, dados: new Uint8Array(await arquivo.arrayBuffer()) },
        update: { dados: new Uint8Array(await arquivo.arrayBuffer()) },
      });
      if (indice < total - 1) return Response.json({ ok: true, parcial: true });

      const partes = await prisma.portalArquivoParte.findMany({
        where: { envioId },
        orderBy: { indice: 'asc' },
        select: { indice: true, dados: true },
      });
      if (partes.length !== total || partes.some((p, i) => p.indice !== i)) {
        return Response.json({ erro: 'Envio incompleto — tente de novo.' }, { status: 409 });
      }
      const tamanho = partes.reduce((acc, p) => acc + p.dados.byteLength, 0);
      if (tamanho > MAX_TOTAL) {
        await prisma.portalArquivoParte.deleteMany({ where: { envioId } });
        return Response.json({ erro: 'Arquivo acima de 25 MB.' }, { status: 413 });
      }
      conteudo = new Uint8Array(tamanho);
      let pos = 0;
      for (const p of partes) {
        conteudo.set(new Uint8Array(p.dados), pos);
        pos += p.dados.byteLength;
      }
      await prisma.portalArquivoParte.deleteMany({ where: { envioId } });
    } else {
      conteudo = new Uint8Array(await arquivo.arrayBuffer());
    }
  } catch {
    return Response.json({ erro: 'Não foi possível guardar o arquivo agora.' }, { status: 503 });
  }

  // Reenvio substitui o anterior — o id permanece o mesmo (o unique é
  // token+docId), então o link de download do advogado continua valendo.
  let arquivoId: string;
  try {
    const linha = await prisma.portalArquivo.upsert({
      where: { token_docId: { token, docId } },
      create: { token, docId, nome: nomeProposto, mime, tamanho: conteudo.byteLength, conteudo },
      update: { nome: nomeProposto, mime, tamanho: conteudo.byteLength, conteudo },
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
    arquivoTamanho: conteudo.byteLength,
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
