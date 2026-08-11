"use client";

// Detalhes de um erro registrado (olho na coluna Ações de /admin/erros).
// A mensagem completa vive aqui — em bloco monoespaçado, com botão de copiar
// que confirma virando check por um instante.

import * as React from "react";
import { Check, Copy, Eye } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export interface DetalhesErro {
  data: string;
  usuario: string;
  origem: string;
  status: number | null;
  mensagem: string;
}

export function ErrorEventDetails({ erro }: { erro: DetalhesErro }) {
  const [copiado, setCopiado] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(erro.mensagem);
      setCopiado(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopiado(false), 2000);
    } catch {
      // clipboard indisponível (permissão/contexto): sem confirmação
    }
  }

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ver detalhes do erro"
          />
        }
      >
        <Eye className="size-4" />
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalhes do erro</DialogTitle>
          <DialogDescription>
            {erro.data} · {erro.usuario}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Origem:</span>
            <Badge variant="secondary">{erro.origem}</Badge>
          </span>
          <span>
            <span className="text-muted-foreground">Status:</span>{" "}
            <span className="font-medium tabular-nums">
              {erro.status ?? "—"}
            </span>
          </span>
        </div>

        <div className="min-h-0 flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Mensagem
            </p>
            <Button variant="outline" size="xs" onClick={copiar}>
              {copiado ? (
                <>
                  <Check className="size-3 text-primary" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  Copiar
                </>
              )}
            </Button>
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg border bg-muted/50 p-3 font-mono text-xs break-words whitespace-pre-wrap">
            {erro.mensagem}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}
