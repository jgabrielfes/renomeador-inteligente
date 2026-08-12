"use client";

// Detalhes de acesso de um usuário: quantas vezes abriu CADA módulo e quando
// foi a última vez. Acesso = abertura do módulo numa sessão de navegador
// (não é login, e trocar de página não conta de novo).

import * as React from "react";
import { Eye } from "lucide-react";

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

export interface AcessosPorModulo {
  modulo: string;
  rotulo: string;
  quantidade: number;
  ultimo: string | null;
}

export function UserAccessDetails({
  nome,
  email,
  total,
  modulos,
}: {
  nome: string;
  email: string;
  total: number;
  modulos: AcessosPorModulo[];
}) {
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Ver acessos de ${nome}`}
            title="Ver acessos por módulo"
          />
        }
      >
        <Eye className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Acessos por módulo</DialogTitle>
          <DialogDescription>
            {nome} ({email}) — {total} abertura(s) de módulo. Cada sessão do
            navegador conta uma vez por módulo; trocar de página não conta de
            novo.
          </DialogDescription>
        </DialogHeader>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Módulo</TableHead>
              <TableHead className="text-right">Acessos</TableHead>
              <TableHead>Último</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modulos.map((m) => (
              <TableRow key={m.modulo}>
                <TableCell className="font-medium">{m.rotulo}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {m.quantidade > 0 ? (
                    m.quantidade
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {m.ultimo ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {total === 0 && (
          <p className="text-sm text-muted-foreground">
            Esta conta ainda não abriu nenhuma ferramenta.{" "}
            <Badge variant="outline">Só cadastro</Badge>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
