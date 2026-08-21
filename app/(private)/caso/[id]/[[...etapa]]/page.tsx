// /caso/<id>/<etapa> — a URL RESTAURA o caso (T1 da auditoria): F5,
// favorito e link colado entre membros da equipe voltam ao caso e à etapa
// certos. Rota exclusiva do site do Sucessorista (404 nos demais); o gate de
// sessão leva o caminho completo no callbackUrl para voltar direto após o
// login. Caso inexistente NÃO redireciona em silêncio — o client mostra a
// tela "caso não encontrado" com o link para a lista.

import { requirePlataforma } from "@/lib/app";
import { requireSession } from "@/lib/auth";

import { PaginaSucessorista } from "../../../sucessorista/pagina";

export default async function PaginaCaso({
  params,
}: {
  params: Promise<{ id: string; etapa?: string[] }>;
}) {
  await requirePlataforma("SUCESSORISTA");
  const { id, etapa } = await params;
  const etapaInicial = etapa?.[0] ?? null;
  const caminho = `/caso/${id}${etapaInicial ? `/${etapaInicial}` : ""}`;
  const session = await requireSession(caminho);
  return (
    <PaginaSucessorista
      session={session}
      casoInicialId={decodeURIComponent(id)}
      etapaInicial={etapaInicial}
    />
  );
}
