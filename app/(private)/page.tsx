// A RAIZ DE CADA SITE É O PRÓPRIO MÓDULO.
//
// O repositório publica três sites (lib/app.ts): no deploy do Renomeador, `/`
// é o Renomeador; no do Sucessorista, `/` é o Sucessorista; no do Resolvedor
// de Notas, `/` é o resolvedor. Não existe painel de escolha de ferramenta, e
// as rotas `/renomeador`, `/sucessorista` e `/notas` não existem — quem chegar
// nelas cai no 404 da plataforma.
//
// O gate é aqui (server): sem sessão, vai para o login e volta para `/`.
//
// O `await import()` do módulo ativo é proposital: o outro client não entra no
// payload desta rota, então o navegador nunca baixa o bundle do módulo que
// este site não serve.

import { AccessTracker } from "@/components/access-tracker";
import { UserMenu } from "@/components/user-menu";
import { APP, IDENTIDADE } from "@/lib/app";
import { requireSession } from "@/lib/auth";

import { carregarLicoes } from "./renomeador/licoes-actions";

export default async function Home() {
  const session = await requireSession("/");

  if (APP === "NOTAS") {
    const { default: NotasClient } = await import("./notas/notas-client");
    return (
      <>
        <AccessTracker modulo={IDENTIDADE.modulo} />
        <NotasClient menu={<UserMenu />} />
      </>
    );
  }

  // Regras + correções da conta, já no primeiro render (sem flash de vazio).
  // Valem nos dois sites: o cofre do Sucessorista embute o Renomeador inteiro.
  const licoes = await carregarLicoes();

  if (APP === "SUCESSORISTA") {
    // Montagem compartilhada com a rota /caso/<id>/<etapa> (T1): as cargas
    // por conta (perfil, equipe, client) vivem em sucessorista/pagina.tsx.
    const { PaginaSucessorista } = await import("./sucessorista/pagina");
    return <PaginaSucessorista session={session} />;
  }

  const { default: RenomeadorClient } = await import(
    "./renomeador/renomeador-client"
  );
  return (
    <>
      <AccessTracker modulo={IDENTIDADE.modulo} />
      <RenomeadorClient initialLessons={licoes} menu={<UserMenu />} />
    </>
  );
}
