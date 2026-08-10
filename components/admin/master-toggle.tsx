"use client";

// Ação "Tornar master / Revogar master" da tabela de usuários. Revogar é
// destrutivo (tira acesso de administração) — pede confirmação em Dialog, com
// o botão de confirmar destructive + loading (convenções do AGENTS.md).

import * as React from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

import { alternarMaster } from "@/app/admin/usuarios/actions";
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

export function MasterToggle({
  userId,
  nome,
  ehMaster,
}: {
  userId: string;
  nome: string;
  ehMaster: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [executando, setExecutando] = React.useState(false);

  async function executar() {
    setExecutando(true);
    try {
      const result = await alternarMaster(userId);
      if (!result.ok) {
        toast.error("Não foi possível alterar o papel", {
          description: result.error,
        });
        return;
      }
      toast.success(
        ehMaster ? `${nome} não é mais master.` : `${nome} agora é master.`
      );
    } finally {
      setExecutando(false);
      setOpen(false);
    }
  }

  if (!ehMaster) {
    return (
      <Button
        variant="outline"
        size="xs"
        loading={executando}
        onClick={executar}
      >
        <ShieldCheck className="size-3" />
        Tornar master
      </Button>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="xs">
            <ShieldOff className="size-3" />
            Revogar master
          </Button>
        }
      />
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Revogar master de {nome}?</DialogTitle>
          <DialogDescription>
            A pessoa perde o acesso à administração imediatamente.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={executando}
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            loading={executando}
            onClick={executar}
          >
            Revogar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
