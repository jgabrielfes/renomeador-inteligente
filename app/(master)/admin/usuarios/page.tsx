// /admin/usuarios — tabela paginada de contas (somente MASTER).
// Query string: ?busca= (nome/e-mail), ?pagina=&porPagina= (10/25/50/100) e
// ?ordenar=&direcao= — busca e ordenação SEMPRE no banco, coluna validada
// contra lista fechada. A coluna "Acessos" conta ABERTURAS de módulo (não
// logins) — o olho abre o detalhamento por ferramenta.
//
// Recorte por PLATAFORMA: cada site lista só as contas dele (lib/app.ts).

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { MasterToggle } from "@/components/admin/master-toggle";
import { QueryPagination } from "@/components/admin/query-pagination";
import { SearchFilter } from "@/components/admin/search-filter";
import { SortableHeader } from "@/components/admin/sortable-header";
import { UserAccessDetails } from "@/components/admin/user-access-details";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  dataCurta,
  idsDaBuscaDeUsuarios,
  parseBusca,
  parseOrdenacao,
  parsePaginacao,
  queryDaTabela,
} from "@/lib/admin";
import { APP, IDENTIDADE } from "@/lib/app";
import { requireMaster } from "@/lib/auth";
import { ROTULO_MODULO } from "@/lib/modulos";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

const COLUNAS = ["nome", "email", "confirmado", "cadastro", "papel", "acessos"] as const;
type Coluna = (typeof COLUNAS)[number];

function ordemDoPrisma(
  coluna: Coluna,
  direcao: "asc" | "desc"
): Prisma.UserOrderByWithRelationInput {
  switch (coluna) {
    case "nome":
      return { name: direcao };
    case "email":
      return { email: direcao };
    case "confirmado":
      return { emailVerified: direcao };
    case "papel":
      return { role: direcao };
    case "acessos":
      // Prisma ordena por contagem da relação — a agregação é do banco.
      return { accesses: { _count: direcao } };
    default:
      return { createdAt: direcao };
  }
}

export default async function UsuariosPage({
  searchParams,
}: PageProps<"/admin/usuarios">) {
  const session = await requireMaster();

  const params = await searchParams;
  const paginacao = parsePaginacao(params);
  const busca = parseBusca(params.busca);
  const ordenacao = parseOrdenacao<Coluna>(params, COLUNAS, {
    coluna: "cadastro",
    direcao: "desc",
  });

  // Busca em nome OU e-mail, indiferente a caixa E a acento — a comparação
  // sem acento é do Postgres (unaccent), então o filtro vem como lista de ids
  // e a ordenação/paginação seguem sendo as do Prisma.
  //
  // SEMPRE recortado pela plataforma deste deploy: o banco é o mesmo para os
  // dois sites, mas o /admin de um NUNCA lista (nem promove a master) contas
  // do outro.
  const where: Prisma.UserWhereInput = busca
    ? { app: APP, id: { in: await idsDaBuscaDeUsuarios(prisma, busca, APP) } }
    : { app: APP };

  const [total, usuarios] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: ordemDoPrisma(ordenacao.coluna, ordenacao.direcao),
      skip: (paginacao.pagina - 1) * paginacao.porPagina,
      take: paginacao.porPagina,
    }),
  ]);

  // Acessos das contas desta página, só ao módulo DESTE site (uma consulta
  // agregada). O filtro por módulo importa pelo histórico: contas anteriores à
  // separação carregam acessos das duas ferramentas.
  const porModulo = await prisma.moduleAccess.groupBy({
    by: ["userId", "modulo"],
    where: {
      userId: { in: usuarios.map((u) => u.id) },
      modulo: IDENTIDADE.modulo,
    },
    _count: { _all: true },
    _max: { createdAt: true },
  });

  const query = queryDaTabela({ busca, paginacao, ordenacao });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-4 py-6">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar para a administração
      </Link>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuários</h1>
        <p className="text-sm text-muted-foreground">
          {busca
            ? `${total} conta(s) encontrada(s) para “${busca}”.`
            : `${total} conta(s) cadastrada(s).`}{" "}
          &ldquo;Acessos&rdquo; conta aberturas de módulo (uma por sessão do
          navegador), não logins.
        </p>
      </header>

      <SearchFilter
        basePath="/admin/usuarios"
        atual={busca}
        query={query}
        placeholder="Buscar por nome ou e-mail…"
        rotulo="Buscar usuários por nome ou e-mail"
      />

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableHeader
                coluna="nome"
                ordenacao={ordenacao}
                basePath="/admin/usuarios"
                query={query}
              >
                Nome
              </SortableHeader>
              <SortableHeader
                coluna="email"
                ordenacao={ordenacao}
                basePath="/admin/usuarios"
                query={query}
              >
                E-mail
              </SortableHeader>
              <SortableHeader
                coluna="confirmado"
                ordenacao={ordenacao}
                basePath="/admin/usuarios"
                query={query}
              >
                E-mail confirmado
              </SortableHeader>
              <SortableHeader
                coluna="cadastro"
                ordenacao={ordenacao}
                basePath="/admin/usuarios"
                query={query}
              >
                Cadastro
              </SortableHeader>
              <SortableHeader
                coluna="papel"
                ordenacao={ordenacao}
                basePath="/admin/usuarios"
                query={query}
              >
                Papel
              </SortableHeader>
              <SortableHeader
                coluna="acessos"
                ordenacao={ordenacao}
                basePath="/admin/usuarios"
                query={query}
                className="text-right"
              >
                Acessos
              </SortableHeader>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map((u) => {
              // Um módulo por site: o detalhamento traz só a ferramenta deste
              // deploy (o outro site tem o próprio /admin).
              const linha = porModulo.find((p) => p.userId === u.id);
              const acessos = linha?._count._all ?? 0;
              const modulos = [
                {
                  modulo: IDENTIDADE.modulo,
                  rotulo: ROTULO_MODULO[IDENTIDADE.modulo],
                  quantidade: acessos,
                  ultimo: linha?._max.createdAt
                    ? dataCurta.format(linha._max.createdAt)
                    : null,
                },
              ];
              return (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {u.email}
                  </TableCell>
                  <TableCell>
                    {u.emailVerified ? (
                      <Badge variant="secondary">Sim</Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 text-amber-600"
                      >
                        Não
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {dataCurta.format(u.createdAt)}
                  </TableCell>
                  <TableCell>
                    {u.role === "MASTER" ? (
                      <Badge>Master</Badge>
                    ) : (
                      <Badge variant="secondary">Usuário</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center gap-1">
                      <span className="font-medium tabular-nums">
                        {acessos}
                      </span>
                      <UserAccessDetails
                        nome={u.name}
                        email={u.email}
                        total={acessos}
                        modulos={modulos}
                      />
                    </span>
                  </TableCell>
                  <TableCell>
                    {u.id === session.user.id ? (
                      <span className="text-xs text-muted-foreground">
                        (você)
                      </span>
                    ) : (
                      <MasterToggle
                        userId={u.id}
                        nome={u.name}
                        ehMaster={u.role === "MASTER"}
                      />
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="text-center text-muted-foreground"
                >
                  {busca
                    ? `Nenhuma conta com “${busca}” no nome ou no e-mail.`
                    : "Nenhum usuário nesta página."}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <QueryPagination
        basePath="/admin/usuarios"
        paginacao={paginacao}
        totalDeItens={total}
        queryExtra={{
          ...(busca ? { busca } : {}),
          ordenar: ordenacao.coluna,
          direcao: ordenacao.direcao,
        }}
      />
    </main>
  );
}
