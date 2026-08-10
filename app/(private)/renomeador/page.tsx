// Rota privada: exige login. O gate roda aqui (server) e leva o caminho de
// volta — depois de logar, a pessoa cai direto no renomeador.

import RenomeadorClient from "./renomeador-client";
import { requireSession } from "@/lib/auth";

export default async function RenomeadorPage() {
  await requireSession("/renomeador");
  return <RenomeadorClient />;
}
