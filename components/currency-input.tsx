"use client";

// Input de moeda pt-BR com máscara automática: os dígitos são centavos
// ("1234" → "12,34") e vírgula/ponto entram sozinhos (lib/moeda.ts).
// O valor exposto é o TEXTO mascarado ("1.234,56") — quem precisa do número
// usa moedaParaNumero. Com react-hook-form, entra via <Controller>.

import * as React from "react";

import { Input } from "@/components/ui/input";
import { mascararMoeda } from "@/lib/moeda";

export function CurrencyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (mascarado: string) => void;
}) {
  return (
    <Input
      inputMode="numeric"
      className={`num ${className ?? ""}`}
      value={value}
      onChange={(e) => onChange(mascararMoeda(e.target.value))}
      {...props}
    />
  );
}
