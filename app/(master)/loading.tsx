// Loading das rotas de administração (Suspense do App Router): o CLIQUE responde na
// hora — esta casca aparece enquanto o servidor monta a página de destino,
// em vez de a tela anterior "congelar" até o render terminar. Mesma casca do grupo (private).

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
