// Portal do herdeiro — server fino só para o gate; a tela é o client ao lado.
//
// O portal é do Sucessorista: no deploy do Renomeador esta rota não existe
// (404), como qualquer outra rota do módulo alheio.
//
// Exceção deliberada da plataforma: aqui NÃO há login. O token do convite é a
// credencial — o herdeiro convidado não tem conta.

import { requirePlataforma } from "@/lib/app";

import PortalHerdeiro from "./portal-client";

export default async function PortalPage({
  params,
}: PageProps<"/portal/[token]">) {
  await requirePlataforma("SUCESSORISTA");
  return <PortalHerdeiro params={params} />;
}
