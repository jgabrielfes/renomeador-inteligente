"use client";

// Detalhes de uma triagem de nota devolutiva. Sem texto da nota e sem nomes:
// por exigência ficam a VIA sugerida, a via que o humano escolheu, os alvos
// (tags de documento), se o classificador casou uma regra e o que aconteceu
// depois (peça gerada, IA, download).

import { Check, Eye, Minus, Sparkles } from "lucide-react";

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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROTULO_VIA, ROTULO_PECA } from "@/lib/notas-rotulos";

export interface ItemDaNota {
  via: string;
  viaFinal?: string;
  alvos: string[];
  temGatilho: boolean;
  pessoas: number;
  achadosNaPasta?: number;
  status?: string;
  peca?: string;
  comIa?: boolean;
  camposIa?: number;
  faltando?: number;
  baixouMinuta?: boolean;
  baixouJuntada?: boolean;
}

export interface DetalhesNota {
  data: string;
  usuario: string;
  fonte: string;
  manual: boolean;
  arquivos: number;
  duracaoMs: number | null;
  duracaoPasta: number | null;
  itens: ItemDaNota[];
}

function duracao(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}

export function NotaEventDetails({ evento }: { evento: DetalhesNota }) {
  const corrigidas = evento.itens.filter(
    (i) => i.viaFinal && i.viaFinal !== i.via
  ).length;
  const semGatilho = evento.itens.filter((i) => !i.temGatilho).length;
  const minutas = evento.itens.filter((i) => i.peca).length;
  const entregas = evento.itens.filter(
    (i) => i.baixouMinuta || i.baixouJuntada
  ).length;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ver detalhes da triagem"
          />
        }
      >
        <Eye className="size-4" />
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Detalhes da triagem</DialogTitle>
          <DialogDescription>
            {evento.data} · {evento.usuario}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Linha rotulo="Origem do texto">
            <Badge variant="secondary">{evento.fonte}</Badge>{" "}
            {evento.manual ? (
              <Badge variant="outline">colado à mão</Badge>
            ) : (
              <Badge variant="outline">lido da pasta</Badge>
            )}
          </Linha>
          <Linha rotulo="Arquivos na pasta">
            {evento.arquivos > 0 ? evento.arquivos : "—"}
          </Linha>
          <Linha rotulo="Exigências">{evento.itens.length}</Linha>
          <Linha rotulo="Duração da triagem">{duracao(evento.duracaoMs)}</Linha>
          {evento.duracaoPasta !== null && (
            <Linha rotulo="Indexação da pasta">
              {duracao(evento.duracaoPasta)}
            </Linha>
          )}
          <Linha rotulo="Minutas geradas">{minutas}</Linha>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">Qualidade do classificador</p>
          <p className="text-muted-foreground">
            {semGatilho} de {evento.itens.length} exigência(s) sem regra
            local (viraram &ldquo;classificar à mão&rdquo;) ·{" "}
            {corrigidas} via(s) corrigida(s) pelo usuário · {entregas}{" "}
            entrega(s) baixada(s).
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Via sugerida</TableHead>
                <TableHead>Via escolhida</TableHead>
                <TableHead>Documentos pedidos</TableHead>
                <TableHead>Desfecho</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {evento.itens.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Badge variant="secondary">
                      {ROTULO_VIA[item.via] ?? item.via}
                    </Badge>
                    {!item.temGatilho && (
                      <Badge variant="outline" className="ml-1">
                        sem regra
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {!item.viaFinal || item.viaFinal === item.via ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Check className="size-3.5" />
                        manteve
                      </span>
                    ) : (
                      <Badge className="bg-amber-100 text-amber-800">
                        {ROTULO_VIA[item.viaFinal] ?? item.viaFinal}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {item.alvos.length > 0 ? (
                      <span>
                        {item.alvos.join(", ")}
                        {item.achadosNaPasta !== undefined && (
                          <span className="block text-xs">
                            {item.achadosNaPasta > 0
                              ? `${item.achadosNaPasta} na pasta`
                              : "nada na pasta"}
                          </span>
                        )}
                      </span>
                    ) : (
                      <Minus className="size-3.5" />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="flex flex-wrap gap-1">
                      {item.peca && (
                        <Badge variant="secondary">
                          {ROTULO_PECA[item.peca] ?? item.peca}
                        </Badge>
                      )}
                      {item.comIa && (
                        <Badge variant="outline">
                          <Sparkles className="size-3" />
                          IA {item.camposIa ?? 0} campo(s)
                        </Badge>
                      )}
                      {item.faltando !== undefined && item.faltando > 0 && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/50 text-amber-600"
                        >
                          {item.faltando} campo(s) vazio(s)
                        </Badge>
                      )}
                      {item.baixouMinuta && <Badge>minuta baixada</Badge>}
                      {item.baixouJuntada && <Badge>documento baixado</Badge>}
                      {item.status === "resolvido" && (
                        <Badge className="bg-emerald-100 text-emerald-800">
                          resolvido
                        </Badge>
                      )}
                      {!item.peca &&
                        !item.baixouJuntada &&
                        !item.status && (
                          <span className="text-muted-foreground">—</span>
                        )}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {evento.itens.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={4}
                    className="text-center text-muted-foreground"
                  >
                    A triagem não encontrou exigências nesta nota.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function Linha({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <p className="flex items-center justify-between gap-2 border-b py-1 last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="text-right font-medium tabular-nums">{children}</span>
    </p>
  );
}
