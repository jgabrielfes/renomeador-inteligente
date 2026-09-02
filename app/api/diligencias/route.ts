/**
 * Criação de DILIGÊNCIA (camada 4, pilar B) — multipart: campos + os anexos
 * SELECIONADOS, que formam a PASTA isolada (o correspondente nunca vê o
 * caso). Nasce de um caso (casoId) ou avulsa. Exige sessão.
 *
 * Limite desta rodada: ~3,5 MB por arquivo e 10 arquivos por pasta (teto de
 * requisição da Vercel; o fatiamento do portal pode ser portado depois).
 */

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { foraDaPlataforma } from '@/lib/app';
import { foraSeStandby } from '@/lib/standby';
import { municipioPorIbge } from '@/lib/rede/municipios';
import { ROTULO_TIPO_DILIGENCIA } from '@/lib/rede/diligencias';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ARQUIVO = 3_500_000;
const MAX_ARQUIVOS = 10;

export async function POST(req: Request) {
  const parada = foraSeStandby('diligencias');
  if (parada) return parada;
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return Response.json({ erro: 'Não autenticado.' }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ erro: 'Envio inválido.' }, { status: 400 });
  }

  const comarcaIbge = Number(form.get('comarcaIbge'));
  const municipio = municipioPorIbge(comarcaIbge);
  if (!municipio) return Response.json({ erro: 'Escolha a comarca na lista.' }, { status: 422 });
  const tipo = String(form.get('tipo') ?? '');
  if (!(tipo in ROTULO_TIPO_DILIGENCIA)) {
    return Response.json({ erro: 'Escolha o tipo de diligência.' }, { status: 422 });
  }
  const descricao = String(form.get('descricao') ?? '').trim().slice(0, 1200);
  if (descricao.length < 10) {
    return Response.json({ erro: 'Descreva a diligência (ao menos 10 caracteres).' }, { status: 422 });
  }
  const casoId = String(form.get('casoId') ?? '').slice(0, 80) || null;
  const prazoBruto = String(form.get('prazoEm') ?? '');
  const prazoEm = /^\d{4}-\d{2}-\d{2}$/.test(prazoBruto) ? new Date(`${prazoBruto}T23:59:59`) : null;

  const arquivos = form.getAll('arquivos').filter((a): a is File => a instanceof File);
  if (arquivos.length > MAX_ARQUIVOS) {
    return Response.json({ erro: `No máximo ${MAX_ARQUIVOS} arquivos na pasta.` }, { status: 422 });
  }
  for (const a of arquivos) {
    if (a.size > MAX_ARQUIVO) {
      return Response.json(
        { erro: `"${a.name}" passa de 3,5 MB — reduza o arquivo (o teto desta versão).` },
        { status: 413 },
      );
    }
  }

  const d = await prisma.diligencia.create({
    data: {
      solicitanteUserId: userId,
      casoId,
      comarcaIbge,
      municipio: municipio.nome,
      uf: municipio.uf,
      tipo,
      descricao,
      prazoEm,
    },
  });
  for (const a of arquivos) {
    await prisma.diligenciaArquivo.create({
      data: {
        diligenciaId: d.id,
        origem: 'pasta',
        nome: a.name.slice(0, 200),
        mime: a.type || 'application/octet-stream',
        tamanho: a.size,
        conteudo: Buffer.from(await a.arrayBuffer()),
      },
    });
  }
  return Response.json({ ok: true, id: d.id }, { status: 201 });
}
