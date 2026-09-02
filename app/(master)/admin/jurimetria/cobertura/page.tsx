// /admin/jurimetria/cobertura — o MAPA de onde falta dado (somente MASTER):
// cartório × tema com a contagem de exigências publicadas e a mais recente.
// Consome só o que vale no produto: publicado = true e sem duplicata.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireMaster } from '@/lib/auth';
import { gateStandby } from '@/lib/standby';
import { prisma } from '@/lib/prisma';

import { NavJurimetria } from '../fontes-client';

export const dynamic = 'force-dynamic';

export default async function CoberturaJurimetriaPage() {
  await requireMaster();
  await gateStandby('jurimetria');

  const [grupos, cartorios, temas, semTitular, gruposPendentes] = await Promise.all([
    prisma.exigencia.groupBy({
      by: ['cartorioId', 'temaId'],
      where: { publicado: true, duplicataDe: null, cartorioId: { not: null } },
      _count: { _all: true },
      _max: { dataExigencia: true },
    }),
    prisma.cartorio.findMany({ orderBy: { nome: 'asc' }, include: { _count: { select: { titulares: true } } } }),
    prisma.temaRegistral.findMany({ orderBy: { rotulo: 'asc' } }),
    prisma.exigencia.count({ where: { titularPendente: true } }),
    prisma.revisaoJurimetria.groupBy({ by: ['exigenciaId'], where: { status: 'pendente' } }),
  ]);
  const pendentes = gruposPendentes.length;

  const porChave = new Map<string, { n: number; ultima: Date | null }>();
  const totalPorCartorio = new Map<string, number>();
  for (const g of grupos) {
    porChave.set(`${g.cartorioId}|${g.temaId ?? ''}`, {
      n: g._count._all,
      ultima: g._max.dataExigencia,
    });
    totalPorCartorio.set(
      g.cartorioId as string,
      (totalPorCartorio.get(g.cartorioId as string) ?? 0) + g._count._all,
    );
  }
  const temasComDado: { id: string; rotulo: string }[] = temas.filter((t) =>
    grupos.some((g) => g.temaId === t.id),
  );
  // Exigência publicada SEM tema também aparece — coluna própria.
  if (grupos.some((g) => g.temaId === null))
    temasComDado.push({ id: '', rotulo: '(sem tema)' });
  const semTitularCadastrado = cartorios.filter((c) => c._count.titulares === 0);

  return (
    <main className="flex flex-col gap-6">
      <NavJurimetria ativa="cobertura" pendentes={pendentes} />

      {semTitularCadastrado.length > 0 && (
        <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <strong>{semTitularCadastrado.length} cartório(s) sem titular cadastrado</strong> — toda
          exigência deles entra pendente (TODO_VALIDACAO nº 5: cadastrar titulares com a data de
          início). Exigências com titular pendente hoje: {semTitular}.
        </div>
      )}

      {temasComDado.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nada publicado ainda — rode a coleta e revise a fila; a matriz nasce daqui.
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cartório</TableHead>
              <TableHead className="text-right">Total</TableHead>
              {temasComDado.map((t) => (
                <TableHead key={t.id} className="text-right">
                  {t.rotulo}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cartorios
              .filter((c) => totalPorCartorio.has(c.id))
              .map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.nome}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {totalPorCartorio.get(c.id) ?? 0}
                  </TableCell>
                  {temasComDado.map((t) => {
                    const celula = porChave.get(`${c.id}|${t.id}`);
                    return (
                      <TableCell key={t.id} className="text-right tabular-nums">
                        {celula ? (
                          <span title={celula.ultima ? `mais recente: ${celula.ultima.toLocaleDateString('pt-BR')}` : undefined}>
                            {celula.n}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">·</span>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
