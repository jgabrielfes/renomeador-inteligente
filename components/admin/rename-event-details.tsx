"use client";

// Detalhes de um evento de análise do renomeador (olho na coluna Ações de
// /admin/renomeacoes). Sem nomes de arquivo/pessoa — só a tag de tipo de cada
// documento, flags de download e o desfecho do lote (zip + montagem).

import * as React from "react";
import { Check, Download, Eye, Minus, Wand2 } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DetalhesEvento {
  data: string;
  usuario: string;
  metodo: string;
  quantidade: number;
  duracaoMs: number | null;
  itens: Array<{ tipo: string; baixado?: boolean; otimizado?: boolean }>;
  desfecho: {
    zip?: boolean;
    montagem?: {
      subpastas: boolean;
      converterPdf: boolean;
      numerar: boolean;
    };
  } | null;
}

function formatarDuracao(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;
  const segundos = ms / 1000;
  if (segundos < 60) {
    return `${segundos.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s`;
  }
  const minutos = Math.floor(segundos / 60);
  const resto = Math.round(segundos % 60);
  return `${minutos} min ${resto} s`;
}

function SimNao({ valor, rotulo }: { valor: boolean; rotulo: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      {valor ? (
        <Check className="size-3.5 text-primary" />
      ) : (
        <Minus className="size-3.5 text-muted-foreground" />
      )}
      <span className={valor ? "" : "text-muted-foreground"}>{rotulo}</span>
    </span>
  );
}

export function RenameEventDetails({ evento }: { evento: DetalhesEvento }) {
  const montagem = evento.desfecho?.montagem;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Ver detalhes da execução"
          />
        }
      >
        <Eye className="size-4" />
      </DialogTrigger>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Detalhes da análise</DialogTitle>
          <DialogDescription>
            {evento.data} · {evento.usuario}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5">
            <span className="text-muted-foreground">Método:</span>
            <Badge variant="secondary">{evento.metodo}</Badge>
          </span>
          <span>
            <span className="text-muted-foreground">Arquivos:</span>{" "}
            <span className="font-medium tabular-nums">
              {evento.quantidade}
            </span>
          </span>
          <span>
            <span className="text-muted-foreground">Duração:</span>{" "}
            <span className="font-medium tabular-nums">
              {formatarDuracao(evento.duracaoMs)}
            </span>
          </span>
        </div>

        <div className="space-y-1.5 rounded-lg border p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Desfecho do lote
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <SimNao
              valor={evento.desfecho?.zip === true}
              rotulo="Lote baixado em .zip"
            />
          </div>
          {montagem ? (
            <div className="flex flex-wrap gap-x-6 gap-y-1">
              <SimNao valor={montagem.subpastas} rotulo="Subpastas por conjunto" />
              <SimNao valor={montagem.converterPdf} rotulo="Imagens em PDF" />
              <SimNao valor={montagem.numerar} rotulo="Arquivos numerados" />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Montagem do processo: lote ainda não aplicado/baixado.
            </p>
          )}
        </div>

        {evento.itens.length > 0 ? (
          <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="w-40">Download</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {evento.itens.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      <Badge variant="secondary">{item.tipo}</Badge>
                    </TableCell>
                    <TableCell>
                      {item.baixado ? (
                        <span className="inline-flex items-center gap-1.5 text-sm">
                          {item.otimizado ? (
                            <>
                              <Wand2 className="size-3.5 text-primary" />
                              Baixado otimizado
                            </>
                          ) : (
                            <>
                              <Download className="size-3.5 text-primary" />
                              Baixado
                            </>
                          )}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Evento sem a lista de tipos (registrado antes deste detalhamento).
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
