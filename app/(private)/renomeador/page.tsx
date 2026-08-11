// Rota privada: exige login. O gate roda aqui (server) e leva o caminho de
// volta — depois de logar, a pessoa cai direto no renomeador.

import RenomeadorClient from "./renomeador-client";
import { carregarLicoes } from "./licoes-actions";
import { requireSession } from "@/lib/auth";

export default async function RenomeadorPage() {
  await requireSession("/renomeador");
  // Regras + correções da conta, já no primeiro render (sem flash de vazio).
  const licoes = await carregarLicoes();
  return <RenomeadorClient initialLessons={licoes} />;
}
