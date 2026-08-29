// /admin/jurimetria — FONTES da semente pública (somente MASTER).
//
// A tela responde três perguntas: de onde o dado vem, quando veio pela
// última vez e o que está BLOQUEADO (captcha/403 — nunca contornado, só
// reportado). "Coletar agora" enfileira; quem coleta é o worker da Action.

import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireMaster } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

import { AcoesFonte, NavJurimetria } from './fontes-client';

export const dynamic = 'force-dynamic';

const ROTULO_TIPO: Record<string, string> = {
  DUVIDA_1VRP: 'Dúvidas — VRP (Datajud)',
  DUVIDA_CGJ: 'CGJ-SP',
  IRIB_PUBLICACAO: 'IRIB',
  CARTORIO_SITE: 'Site de cartório',
  USUARIO_SUCESSORISTA: 'Usuário (Camada B)',
  PARCEIRO_TABELIONATO: 'Parceiro — tabelionato',
  PARCEIRO_INCORPORADORA: 'Parceiro — incorporadora',
  RECIPROCIDADE: 'Reciprocidade',
};

export default async function JurimetriaAdminPage() {
  await requireMaster();

  const [fontes, gruposPendentes, publicadas, documentos, jobsPendentes] = await Promise.all([
    prisma.fonteJurimetria.findMany({ orderBy: [{ tipo: 'asc' }, { nome: 'asc' }] }),
    prisma.revisaoJurimetria.groupBy({ by: ['exigenciaId'], where: { status: 'pendente' } }),
    prisma.exigencia.count({ where: { publicado: true, duplicataDe: null } }),
    prisma.documentoJurimetria.count(),
    prisma.jobJurimetria.count({ where: { status: { in: ['pendente', 'rodando'] } } }),
  ]);
  // A fila conta EXIGÊNCIAS (um card decide todos os motivos dela).
  const pendentes = gruposPendentes.length;

  return (
    <main className="flex flex-col gap-6">
      <NavJurimetria ativa="fontes" pendentes={pendentes} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { rotulo: 'Documentos coletados', valor: documentos },
          { rotulo: 'Exigências publicadas', valor: publicadas },
          { rotulo: 'Fila de revisão', valor: pendentes },
          { rotulo: 'Jobs na fila do worker', valor: jobsPendentes },
        ].map((c) => (
          <div key={c.rotulo} className="rounded-lg border p-3">
            <p className="text-2xl font-semibold tabular-nums">{c.valor}</p>
            <p className="text-xs text-muted-foreground">{c.rotulo}</p>
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Fontes</h2>
        <p className="text-sm text-muted-foreground">
          Fonte de site de cartório nasce inativa: cadastre a URL da página de
          orientações para ativá-la. Bloqueio (captcha/403) é registro honesto —
          a coleta para e ninguém contorna.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fonte</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Última coleta</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fontes.map((f) => (
              <TableRow key={f.id}>
                <TableCell>
                  <p className="font-medium">{f.nome}</p>
                  <p className="text-xs text-muted-foreground">
                    {ROTULO_TIPO[f.tipo] ?? f.tipo}
                    {f.urlBase ? ` · ${f.urlBase}` : ''}
                  </p>
                  {f.motivoBloqueio && (
                    <p className="text-xs text-destructive">{f.motivoBloqueio}</p>
                  )}
                </TableCell>
                <TableCell>
                  {f.bloqueadaEm ? (
                    <Badge variant="destructive">bloqueada</Badge>
                  ) : f.ativa ? (
                    <Badge>ativa</Badge>
                  ) : (
                    <Badge variant="outline">inativa</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm tabular-nums">
                  {f.ultimaColeta ? f.ultimaColeta.toLocaleDateString('pt-BR') : '—'}
                </TableCell>
                <TableCell className="text-right">
                  <AcoesFonte
                    fonteId={f.id}
                    bloqueada={Boolean(f.bloqueadaEm)}
                    ativa={f.ativa}
                    pedeUrl={f.tipo === 'CARTORIO_SITE' && !f.ativa}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <p className="text-xs text-muted-foreground">
        O que sai daqui para o produto é sempre <strong>histórico de entendimentos</strong>{' '}
        (exigência registrada em, frequência observada) — nunca previsão ou garantia. Fila
        vazia + fonte saudável = veja a{' '}
        <Link className="underline" href="/admin/jurimetria/cobertura">
          cobertura
        </Link>{' '}
        para saber onde falta dado.
      </p>
    </main>
  );
}
