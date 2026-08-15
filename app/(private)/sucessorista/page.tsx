// Rota privada: exige login, como os demais módulos do painel.

import SucessoristaClient from "./sucessorista-client";
import { carregarLicoes } from "../renomeador/licoes-actions";
import { AccessTracker } from "@/components/access-tracker";
import { requireSession } from "@/lib/auth";

export default async function SucessoristaPage() {
  await requireSession("/sucessorista");
  // Regras + correções do renomeador da conta: o cofre embute o Renomeador
  // completo, e ele abre já com as lições do escritório carregadas.
  const licoes = await carregarLicoes();
  return (
    <>
      <AccessTracker modulo="SUCESSORISTA" />
      <SucessoristaClient licoesRenomeador={licoes} />
    </>
  );
}
