// Faixa de sessão (server component). Vive DENTRO do módulo — a raiz de cada
// site é a própria ferramenta, e é daqui que se chega à administração e ao
// sair (com confirmação, em components/logout-button.tsx). Usuários MASTER
// veem o atalho para /admin (a página revalida o papel no servidor).
//
// O estado deslogado continua aqui por segurança: se algum dia o menu for
// montado numa tela pública, ele não quebra — mas hoje a ferramenta exige
// sessão, então na prática só o segundo estado aparece.

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
