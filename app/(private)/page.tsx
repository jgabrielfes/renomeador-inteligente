// A RAIZ DE CADA SITE.
//
// O repositório publica quatro sites (lib/app.ts). No HUB (lexcausa.com.br) a
// raiz é a VITRINE PÚBLICA da marca: sem login, sem banco — só os cartões das
// ferramentas. É a única página deste grupo `(private)` que não exige sessão,
// e por isso o retorno acontece antes de qualquer `auth()`. No Renomeador e no
// Resolvedor de Notas, `/` é o próprio módulo — não existe painel de escolha
// de ferramenta, e as rotas `/renomeador` e `/notas` não existem.
//
// No site da LEXCAUSA (APP=sucessorista) a raiz mudou com a remodelagem de
// marca: DESLOGADO vê a landing institucional (produtos + porta das
// famílias); LOGADO cai no HUB de produtos — O Sucessorista mora em `/s`
// (montagem compartilhada com /caso/<id>/<etapa>) e o Radar Sucessório em
// /radar. A preferência "abrir direto" do hub devolve o clique único a quem
// só usa um produto.
//
// O `await import()` do módulo ativo é proposital: o outro client não entra no
// payload desta rota, então o navegador nunca baixa o bundle do módulo que
// este site não serve.

import { AccessTracker } from "@/components/access-tracker";
import { AvatarSessao } from "@/components/lexcausa/avatar-sessao";
import { UserMenu } from "@/components/user-menu";
import { APP, moduloDaPlataforma } from "@/lib/app";
import { auth, isMaster, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { radarAtivo } from "@/lib/radar/config";

import { carregarLicoes } from "./renomeador/licoes-actions";

export default async function Home() {
  if (APP === "HUB") {
    const { VitrineLexCausa } = await import("@/components/lexcausa/vitrine");
    return <VitrineLexCausa />;
  }

  if (APP === "SUCESSORISTA") {
    const session = await auth();
    if (!session?.user) {
      const { EntradaSucessorista } = await import("./sucessorista/entrada");
      return <EntradaSucessorista />;
    }
    // HUB LexCausa — o perfil decide quais cards aparecem; falha de banco
    // degrada para null (o hub mostra tudo e os gates reais ficam nas rotas).
    // As duas cargas rodam em PARALELO (velocidade): o aviso de casos novos
    // do Radar (o badge — e-mail de caso novo não existe, decisão do
    // escritório) não espera a consulta do perfil terminar.
    const [perfil, radarNovosBruto] = await Promise.all([
      prisma.user
        .findUnique({
          where: { id: session.user.id },
          select: { perfilSucessorista: true },
        })
        .then((u) => u?.perfilSucessorista ?? null)
        .catch(() => null),
      radarAtivo()
        ? import("./radar/radar-actions").then((m) => m.casosNovosRadar())
        : Promise.resolve(0),
    ]);
    const radarNovos = perfil === "ESCREVENTE" ? 0 : radarNovosBruto;
    const { HubLexCausa } = await import("./hub-client");
    return (
      <HubLexCausa
        menu={<AvatarSessao />}
        perfil={perfil}
        ehMaster={isMaster(session)}
        radarAtivo={radarAtivo()}
        radarNovos={radarNovos}
      />
    );
  }

  await requireSession("/");

  if (APP === "NOTAS") {
    const { default: NotasClient } = await import("./notas/notas-client");
    return (
      <>
        <AccessTracker modulo={moduloDaPlataforma()} />
        <NotasClient menu={<UserMenu />} />
      </>
    );
  }

  // Regras + correções da conta, já no primeiro render (sem flash de vazio).
  const licoes = await carregarLicoes();

  const { default: RenomeadorClient } = await import(
    "./renomeador/renomeador-client"
  );
  return (
    <>
      <AccessTracker modulo={moduloDaPlataforma()} />
      <RenomeadorClient initialLessons={licoes} menu={<UserMenu />} />
    </>
  );
}
