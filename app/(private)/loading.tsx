// Loading das rotas privadas (Suspense do App Router): o CLIQUE responde na
// hora — esta casca aparece enquanto o servidor monta a página de destino,
// em vez de a tela anterior "congelar" até o render terminar. Neutro de
// marca de propósito: o grupo (private) serve aos três sites.

import { Spinner } from "@/components/ui/spinner";

export default function Loading() {
  return (
    <div
      aria-busy="true"
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        color: "var(--muted-foreground)",
      }}
    >
      <Spinner className="size-5" />
      <span style={{ fontSize: 14 }}>Carregando…</span>
    </div>
  );
}
