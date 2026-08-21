// /portal — "recebi um convite mas perdi o link".
//
// Página PÚBLICA do site do Sucessorista (o herdeiro não tem login): com o
// e-mail transacional habilitado no deploy, reenvia o link por e-mail; sem
// ele, orienta a pedir o link ao advogado. A resposta nunca confirma se um
// e-mail existe.

import { requirePlataforma } from "@/lib/app";
import { emailHabilitado } from "@/lib/portal/email";

import RecuperarLink from "./recuperar-client";

export default async function PortalIndexPage() {
  await requirePlataforma("SUCESSORISTA");
  return <RecuperarLink emailAtivo={emailHabilitado()} />;
}
