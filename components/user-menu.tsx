// Faixa de sessão (server component). A plataforma funciona sem login, então
// há dois estados: deslogado (Entrar / Criar conta) e logado (nome, papel e
// sair — com confirmação, em components/logout-button.tsx). Usuários MASTER
// veem também o atalho para /admin (a página revalida o papel no servidor).

import Link from "next/link";
import { LogIn, ShieldCheck, UserPlus } from "lucide-react";

import { LogoutButton } from "@/components/logout-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { auth, isMaster } from "@/lib/auth";

export async function UserMenu() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="flex items-center justify-end gap-2 text-sm">
        {/* nativeButton={false}: o render troca o <button> por <a> (Link) e o
            Base UI exige a marcação explícita para não perder a semântica. */}
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/login" />}
        >
          <LogIn className="size-3.5" />
          Entrar
        </Button>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/cadastro" />}
        >
          <UserPlus className="size-3.5" />
          Criar conta
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
      <span className="text-muted-foreground">{session.user.name}</span>
      {session.user.role === "MASTER" && <Badge>Master</Badge>}
      {isMaster(session) && (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href="/admin" />}
        >
          <ShieldCheck className="size-3.5" />
          Administração
        </Button>
      )}
      <LogoutButton />
    </div>
  );
}
