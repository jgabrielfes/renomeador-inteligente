'use client';

/**
 * Primitivas do "espelho" em TABELA SEMÂNTICA (T4 da auditoria visual) —
 * thead/th com scope, números tabulares à direita, fundamento em linha
 * própria, cópia para Word/Excel preservando colunas e leitura correta por
 * leitor de tela. Vestem o Table do shadcn (convenção do projeto); a
 * assinatura visual vem do `.espelho-tabela` no sucessorista.css.
 */

import type { CSSProperties, ReactNode } from 'react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function Espelho({
  colunas,
  children,
  style,
}: {
  /** Os três títulos do cabeçalho (o último alinha à direita). */
  colunas: [ReactNode, ReactNode, ReactNode];
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <Table className="espelho-tabela" style={style}>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{colunas[0]}</TableHead>
          <TableHead scope="col">{colunas[1]}</TableHead>
          <TableHead scope="col" className="text-right">
            {colunas[2]}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

export function LinhaEspelho({
  nome,
  meio,
  valor,
  nomeStyle,
  meioStyle,
  valorStyle,
}: {
  nome: ReactNode;
  meio?: ReactNode;
  valor: ReactNode;
  nomeStyle?: CSSProperties;
  meioStyle?: CSSProperties;
  valorStyle?: CSSProperties;
}) {
  return (
    <TableRow>
      <TableCell className="espelho-nome" style={nomeStyle}>
        {nome}
      </TableCell>
      <TableCell className="num" style={meioStyle}>
        {meio}
      </TableCell>
      <TableCell className="num text-right" style={valorStyle}>
        {valor}
      </TableCell>
    </TableRow>
  );
}

/** Linha discreta de fundamento/detalhe sob um lançamento. */
export function FundEspelho({ children }: { children: ReactNode }) {
  return (
    <TableRow className="espelho-fundamento">
      <TableCell colSpan={3}>{children}</TableCell>
    </TableRow>
  );
}
