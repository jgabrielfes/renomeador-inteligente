// Rota privada: exige login, como os demais módulos do painel.

import SucessoristaClient from "./sucessorista-client";
import { AccessTracker } from "@/components/access-tracker";
import { requireSession } from "@/lib/auth";

export default async function SucessoristaPage() {
  await requireSession("/sucessorista");
  return (
    <>
      <AccessTracker modulo="SUCESSORISTA" />
      <SucessoristaClient />
    </>
  );
}
