// Filtro de período das telas /admin: Tabs (com o fundo do TabsList) em que
// cada aba é um Link — o valor ativo vem da URL (?periodo=...), seguindo a
// convenção de filtro via query string.

import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERIODOS, type Periodo } from "@/lib/admin";

export function PeriodFilter({
  basePath,
  atual,
}: {
  basePath: string;
  atual: Periodo;
}) {
  return (
    <Tabs value={atual}>
      <TabsList aria-label="Período">
        {PERIODOS.map((p) => (
          <TabsTrigger
            key={p.valor}
            value={p.valor}
            nativeButton={false}
            render={<Link href={`${basePath}?periodo=${p.valor}`} />}
          >
            {p.rotulo}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
