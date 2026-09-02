// Chrome comum de TODAS as telas /admin: cabeçalho + barra de seções. O gate
// de MASTER roda no layout do grupo (master); aqui é só apresentação — as
// páginas seguem repetindo requireMaster() por defesa em profundidade.
//
// A lista de seções depende do SITE (lib/app.ts): o painel de cada plataforma
// mostra só o que existe nela. Renomeações fica FORA do site da LexCausa
// (pedido do escritório — o Renomeador embutido não é acompanhado por lá) e do
// site do Resolvedor de Notas (o Renomeador nem roda lá).

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { AdminNav, type ItemAdminNav } from "@/components/admin/admin-nav";
import { EH_NOTAS, EH_SUCESSORISTA, IDENTIDADE } from "@/lib/app";
import { emStandby } from "@/lib/standby";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const itens: ItemAdminNav[] = [
    { href: "/admin", rotulo: "Resumo" },
    ...(EH_SUCESSORISTA
      ? [
          { href: "/admin/sucessorista", rotulo: "Casos" },
          // Radar e Jurimetria em standby (lib/standby.ts) saem da barra.
          ...(!emStandby("radar") ? [{ href: "/admin/radar", rotulo: "Radar" }] : []),
          ...(!emStandby("jurimetria")
            ? [{ href: "/admin/jurimetria", rotulo: "Jurimetria" }]
            : []),
        ]
      : []),
    ...(EH_NOTAS ? [{ href: "/admin/notas", rotulo: "Notas" }] : []),
    ...(!EH_SUCESSORISTA && !EH_NOTAS
      ? [{ href: "/admin/renomeacoes", rotulo: "Renomeações" }]
      : []),
    { href: "/admin/usuarios", rotulo: "Usuários" },
    { href: "/admin/erros", rotulo: "Erros" },
    { href: "/admin/feedback", rotulo: "Feedback" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Administração</h1>
          <p className="text-sm text-muted-foreground">{IDENTIDADE.nome}</p>
        </header>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para a ferramenta
        </Link>
      </div>

      <AdminNav itens={itens} />

      {children}
    </div>
  );
}
