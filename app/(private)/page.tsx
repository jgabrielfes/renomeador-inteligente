// A RAIZ DE CADA SITE É O PRÓPRIO MÓDULO.
//
// O repositório publica dois sites (lib/app.ts): no deploy do Renomeador, `/`
// é o Renomeador; no do Sucessorista, `/` é o Sucessorista. Não existe mais
// painel de escolha de ferramenta, e as rotas `/renomeador` e `/sucessorista`
// deixaram de existir — quem chegar nelas cai no 404 da plataforma.
//
// O gate é aqui (server): sem sessão, vai para o login e volta para `/`.
//
// O `await import()` do módulo ativo é proposital: o outro client não entra no
// payload desta rota, então o navegador nunca baixa o bundle do módulo que
// este site não serve.

import { AccessTracker } from "@/components/access-tracker";
import { UserMenu } from "@/components/user-menu";
import { APP, IDENTIDADE } from "@/lib/app";
import { isMaster, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { carregarLicoes } from "./renomeador/licoes-actions";

export default async function Home() {
  const session = await requireSession("/");
  // Regras + correções da conta, já no primeiro render (sem flash de vazio).
  // Valem nos dois sites: o cofre do Sucessorista embute o Renomeador inteiro.
  const licoes = await carregarLicoes();

  if (APP === "SUCESSORISTA") {
    // Perfil de uso VINCULADO À CONTA (null = primeiro acesso pergunta).
    // Falha de banco (ou migração ainda não aplicada) degrada para null.
    let perfilConta: "ADVOGADO" | "ESCREVENTE" | null = null;
    try {
      const usuario = session?.user?.id
        ? await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { perfilSucessorista: true },
          })
        : null;
      perfilConta = usuario?.perfilSucessorista ?? null;
    } catch {
      perfilConta = null;
    }

    // Equipe da conta (card "Minha equipe" do dashboard) — melhor-esforço.
    const { minhaEquipe } = await import("./sucessorista/equipe-actions");
    const equipe = await minhaEquipe();

    const { default: SucessoristaClient } = await import(
      "./sucessorista/sucessorista-client"
    );
    return (
      <>
        <AccessTracker modulo={IDENTIDADE.modulo} />
        <SucessoristaClient
          licoesRenomeador={licoes}
          menu={<UserMenu />}
          perfilConta={perfilConta}
          ehMaster={isMaster(session)}
          equipe={equipe}
          contaId={session?.user?.id ?? null}
        />
      </>
    );
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
