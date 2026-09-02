// /admin/jurimetria/revisao — a FILA DE REVISÃO humana (somente MASTER).
//
// Meta do desenho: revisar 100 itens em menos de 20 minutos — um item por
// vez, atalhos A (aprovar) / C (corrigir) / D (descartar) no client.

import { requireMaster } from '@/lib/auth';
import { gateStandby } from '@/lib/standby';
import { prisma } from '@/lib/prisma';

import { NavJurimetria } from '../fontes-client';
import { FilaRevisao } from './fila-client';

export const dynamic = 'force-dynamic';

export default async function RevisaoJurimetriaPage() {
  await requireMaster();
  await gateStandby('jurimetria');

  const [itens, cartorios, temas, gruposPendentes] = await Promise.all([
    prisma.revisaoJurimetria.findMany({
      where: { status: 'pendente' },
      orderBy: { criadoEm: 'asc' },
      take: 100,
      include: {
        exigencia: {
          include: {
            cartorio: { select: { nome: true } },
            titular: { select: { nome: true } },
            tema: { select: { rotulo: true } },
            documento: { select: { urlOrigem: true, fonte: { select: { nome: true } } } },
          },
        },
      },
    }),
    prisma.cartorio.findMany({ orderBy: { nome: 'asc' }, select: { id: true, nome: true } }),
    prisma.temaRegistral.findMany({ orderBy: { rotulo: 'asc' }, select: { id: true, rotulo: true } }),
    prisma.revisaoJurimetria.groupBy({ by: ['exigenciaId'], where: { status: 'pendente' } }),
  ]);
  // A fila conta EXIGÊNCIAS (um card decide todos os motivos dela).
  const pendentes = gruposPendentes.length;

  // Um card por EXIGÊNCIA (motivos agregados) — decidir uma resolve todos.
  const porExigencia = new Map<string, { revisaoId: string; motivos: string[] }>();
  for (const r of itens) {
    const atual = porExigencia.get(r.exigenciaId);
    if (atual) atual.motivos.push(r.motivo);
    else porExigencia.set(r.exigenciaId, { revisaoId: r.id, motivos: [r.motivo] });
  }
  const cards = [...porExigencia.entries()].map(([exigenciaId, agg]) => {
    const r = itens.find((x) => x.exigenciaId === exigenciaId)!;
    const e = r.exigencia;
    return {
      revisaoId: agg.revisaoId,
      motivos: agg.motivos,
      textoNormalizado: e.textoNormalizado,
      trechoOrigem: e.trechoOrigem,
      fundamentacao: e.fundamentacao,
      resultado: e.resultado ?? 'sem_julgamento',
      dataExigencia: e.dataExigencia.toISOString().slice(0, 10),
      confianca: Number(e.confianca),
      cartorioId: e.cartorioId,
      cartorioNome: e.cartorio?.nome ?? null,
      titularNome: e.titular?.nome ?? null,
      temaId: e.temaId,
      temaRotulo: e.tema?.rotulo ?? null,
      fonteNome: e.documento.fonte.nome,
      urlOrigem: e.documento.urlOrigem,
    };
  });

  return (
    <main className="flex flex-col gap-6">
      <NavJurimetria ativa="revisao" pendentes={pendentes} />
      <FilaRevisao cards={cards} cartorios={cartorios} temas={temas} totalPendentes={pendentes} />
    </main>
  );
}
