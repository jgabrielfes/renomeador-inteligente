"use client";

// Barra de seções da administração — visível em TODAS as telas /admin (vem do
// layout do grupo), para trocar de seção sem voltar ao resumo a cada clique.
// O item ativo sai da URL (usePathname); os itens vêm do servidor, porque a
// lista depende do site (lib/app.ts) e process.env.APP é só do servidor.

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

export interface ItemAdminNav {
  href: string;
  rotulo: string;
}

export function AdminNav({ itens }: { itens: ItemAdminNav[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Seções da administração"
      className="flex flex-wrap gap-1 border-b pb-2"
    >
      {itens.map((i) => {
        const ativo =
          i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              ativo
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {i.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
