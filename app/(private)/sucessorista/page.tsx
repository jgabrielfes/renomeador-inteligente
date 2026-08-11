// Rota privada: exige login, como os demais módulos do painel.

import SucessoristaClient from "./sucessorista-client";
import { requireSession } from "@/lib/auth";

export default async function SucessoristaPage() {
  await requireSession("/sucessorista");
  return <SucessoristaClient />;
}
