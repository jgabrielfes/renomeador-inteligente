"use client";

// "Ver correções": dialog que lista as correções aprendidas do renomeador de
// um jeito amigável (o que a IA sugeriu × o que o usuário corrigiu) e permite
// esquecer UMA correção específica — o "Esquecer correções" (todas) continua
// no card. Esquecer é destrutivo: confirmação com botão destructive.
// O componente segue montado com o dialog aberto mesmo se a lista esvaziar
// (ao esquecer a última): mostra o estado vazio em vez de sumir da tela.

import * as React from "react";
import { ArrowRight, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { removeCorrection, type Correction } from "@/lib/lessons";

export function CorrectionsDialog({
  corrections,
}: {
  corrections: Correction[];
}) {
  const [open, setOpen] = React.useState(false);
  const [paraEsquecer, setParaEsquecer] = React.useState<Correction | null>(
    null
  );

  if (corrections.length === 0 && !open) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger render={<Button variant="ghost" size="sm" />}>
          <Eye className="size-3.5" />
          Ver correções
        </DialogTrigger>
        <DialogContent className="flex max-h-[80vh] flex-col gap-4 sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Correções aprendidas</DialogTitle>
            <DialogDescription>
              Cada correção que você fez vira exemplo para a IA nos próximos
              documentos parecidos. Esquecer uma correção faz a IA parar de
              seguir aquele padrão.
            </DialogDescription>
          </DialogHeader>

          {corrections.length === 0 ? (
            <p className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
              Nenhuma correção aprendida — edite um nome sugerido pela IA para
              começar.
            </p>
          ) : (
            <ScrollArea className="min-h-0 flex-1 rounded-lg border">
              <ul className="divide-y">
                {corrections.map((c, i) => (
                  <li
                    // Índice na key: dados antigos podem ter duplicatas até a
                    // próxima gravação sanear (a lista é recriada a cada mudança).
                    key={`${i}-${c.sugerido}`}
                    className="flex items-center gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      {c.tipo && (
                        <Badge variant="secondary">{c.tipo}</Badge>
                      )}
                      <p
                        className="truncate text-sm text-muted-foreground"
                        title={c.sugerido}
                      >
                        <span className="line-through">{c.sugerido}</span>
                      </p>
                      <p
                        className="flex items-center gap-1.5 truncate text-sm font-medium"
                        title={c.corrigido}
                      >
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                        {c.corrigido}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Esquecer esta correção"
                      onClick={() => setParaEsquecer(c)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={paraEsquecer !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setParaEsquecer(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Esquecer esta correção?</DialogTitle>
            <DialogDescription>
              A IA vai parar de usar &ldquo;{paraEsquecer?.corrigido}&rdquo;
              como exemplo nos próximos documentos. As demais correções e as
              regras escritas não são afetadas.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setParaEsquecer(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (paraEsquecer) {
                  removeCorrection(paraEsquecer);
                  toast.info("Correção esquecida.");
                }
                setParaEsquecer(null);
              }}
            >
              <Trash2 className="size-3.5" />
              Esquecer correção
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
