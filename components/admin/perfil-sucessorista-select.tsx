"use client";

// Perfil de uso do Sucessorista (Advogado × Escrevente) na tabela de usuários.
//
// A conta escolhe UMA vez, no primeiro acesso, e trava — trocar depois é ato
// de administração, e este é o único lugar onde acontece (o alternador que
// existia na lombada da folha saiu: ele mudava a SESSÃO, não a conta).
//
// Trocar o perfil muda as abas finais da folha de quem usa (honorários e
// minutas × escritura), então a troca passa por confirmação em Dialog, como
// as demais ações de consequência do /admin.

import * as React from "react";
import { UserCog } from "lucide-react";
import { toast } from "sonner";

import { definirPerfilSucessorista } from "@/app/(master)/admin/usuarios/actions";
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

/** null = a conta ainda não escolheu (o dialog do primeiro acesso vai pedir). */
export type PerfilConta = "ADVOGADO" | "ESCREVENTE" | null;

const ROTULO: Record<"ADVOGADO" | "ESCREVENTE", string> = {
  ADVOGADO: "Advogado(a)",
  ESCREVENTE: "Escrevente Notarial",
};

const DESCRICAO: Record<"ADVOGADO" | "ESCREVENTE", string> = {
  ADVOGADO: "Abas de honorários e das minutas (Tabelionato e petição judicial).",
  ESCREVENTE: "Aba da escritura de inventário e partilha.",
};

export function PerfilSucessoristaSelect({
  userId,
  nome,
  perfil,
}: {
  userId: string;
  nome: string;
  perfil: PerfilConta;
}) {
  const [open, setOpen] = React.useState(false);
  const [salvando, setSalvando] = React.useState<string | null>(null);

  async function definir(novo: "ADVOGADO" | "ESCREVENTE" | "") {
    setSalvando(novo || "limpar");
    try {
      const r = await definirPerfilSucessorista(userId, novo);
      if (!r.ok) {
        toast.error("Não foi possível alterar o perfil", { description: r.error });
        return;
      }
      toast.success(
        novo
          ? `${nome} agora usa o perfil ${ROTULO[novo]}.`
          : `${nome} vai escolher o perfil no próximo acesso.`
      );
      setOpen(false);
    } finally {
      setSalvando(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="xs">
            <UserCog className="size-3" />
            {perfil ? ROTULO[perfil] : "Sem perfil"}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Perfil de uso de {nome}</DialogTitle>
          <DialogDescription>
            {perfil
              ? `Hoje: ${ROTULO[perfil]}. Trocar muda as abas finais da folha de trabalho desta conta.`
              : "A conta ainda não escolheu — a escolha vai ser pedida no próximo acesso. Você pode definir aqui."}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {(["ADVOGADO", "ESCREVENTE"] as const).map((p) => (
            <Button
              key={p}
              variant={perfil === p ? "default" : "outline"}
              className="h-auto flex-col items-start gap-0.5 py-2 text-left"
              loading={salvando === p}
              disabled={salvando !== null || perfil === p}
              onClick={() => void definir(p)}
            >
              <span className="font-medium">{ROTULO[p]}</span>
              <span className="text-xs font-normal opacity-80">{DESCRICAO[p]}</span>
            </Button>
          ))}
        </div>
        <DialogFooter className="sm:justify-between">
          {/* Limpar devolve a conta ao estado de primeiro acesso: quem se
              cadastrou no papel errado reescolhe sozinho, sem o admin ter de
              adivinhar qual é o certo. */}
          <Button
            variant="ghost"
            size="sm"
            loading={salvando === "limpar"}
            disabled={salvando !== null || perfil === null}
            onClick={() => void definir("")}
          >
            Pedir para escolher de novo
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={salvando !== null}>
            Fechar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
