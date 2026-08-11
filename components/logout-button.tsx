"use client";

// "Sair" com confirmação: ação destrutiva de sessão pede Dialog (convenção da
// plataforma). O botão de confirmar usa variant destructive e mostra o
// Spinner no lugar do texto enquanto encerra a sessão.

import * as React from "react";
import { signOut } from "next-auth/react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useProgressRouter } from "@/components/navigation-progress";

export function LogoutButton() {
  const router = useProgressRouter();
  const [open, setOpen] = React.useState(false);
  const [saindo, setSaindo] = React.useState(false);

  async function confirmar() {
    setSaindo(true);
    try {
      await signOut({ redirect: false });
      router.push("/");
      router.refresh();
    } finally {
      setSaindo(false);
      setOpen(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm">
            <LogOut className="size-3.5" />
            Sair
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Sair da conta?</DialogTitle>
          <DialogDescription>
            Você continua podendo usar as ferramentas deslogado.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={saindo}
          >
            Cancelar
          </Button>
          <Button variant="destructive" loading={saindo} onClick={confirmar}>
            Sair
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
