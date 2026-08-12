// Filtro de período das telas /admin: Tabs (com o fundo do TabsList) em que
// cada aba é um Link — o valor ativo vem da URL (?periodo=...), seguindo a
// convenção de filtro via query string.

import Link from "next/link";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PERIODOS, type Periodo } from "@/lib/admin";

export function PeriodFilter({
  basePath,
  atual,
  query,
}: {
  basePath: string;
  atual: Periodo;
  /** Demais filtros a preservar (busca, ordenação) ao trocar o período. */
  query?: URLSearchParams;
}) {
  const href = (periodo: string) => {
    const proxima = new URLSearchParams(query);
    proxima.set("periodo", periodo);
    // Recorte novo, lista nova: volta ao começo.
    if (proxima.has("pagina")) proxima.set("pagina", "1");
    return `${basePath}?${proxima}`;
  };

  return (
    <Tabs value={atual}>
      <TabsList aria-label="Período">
        {PERIODOS.map((p) => (
          <TabsTrigger
            key={p.valor}
            value={p.valor}
            nativeButton={false}
            render={<Link href={href(p.valor)} />}
          >
            {p.rotulo}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
