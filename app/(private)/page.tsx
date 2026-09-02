// A RAIZ DE CADA SITE.
//
// O repositório publica quatro sites (lib/app.ts):
//
//   HUB (lexcausa.com.br) — a LANDING INSTITUCIONAL da marca, pública: hero,
//   produtos, porta das famílias e áreas de atuação. É a única página deste
//   grupo `(private)` que não exige sessão, e por isso o retorno acontece
//   antes de qualquer `auth()`. Login e cadastro não existem no apex: os
//   botões apontam para o deploy da ferramenta (components/lexcausa/sites.ts).
//
//   SUCESSORISTA — a raiz é SÓ o hub de produtos, para quem tem sessão. Quem
//   chega deslogado vai direto para o login: a apresentação da marca virou
//   trabalho do apex, e uma segunda landing aqui só duplicaria a porta de
//   entrada. LexCausa mora em `/s` (montagem compartilhada com
//   /caso/<id>/<etapa>) e o Radar Sucessório em /radar.
//
//   RENOMEADOR e NOTAS — `/` é o próprio módulo; as rotas `/renomeador` e
//   `/notas` não existem.
//
// A preferência "abrir direto" do hub devolve o clique único a quem
// só usa um produto.
//
// O `await import()` do módulo ativo é proposital: o outro client não entra no
// payload desta rota, então o navegador nunca baixa o bundle do módulo que
// este site não serve.

import { AccessTracker } from "@/components/access-tracker";
import { AvatarSessao } from "@/components/lexcausa/avatar-sessao";
import { UserMenu } from "@/components/user-menu";
import { APP, moduloDaPlataforma } from "@/lib/app";
import { isMaster, requireSession } from "@/lib/auth";

import { carregarLicoes } from "./renomeador/licoes-actions";

export default async function Home() {
  if (APP === "HUB") {
    const { LandingLexCausa } = await import("@/components/lexcausa/landing");
    return <LandingLexCausa />;
  }

  if (APP === "SUCESSORISTA") {
    // Sem sessão, a raiz da ferramenta é o login — a landing da marca mora no
    // apex. `requireSession` leva o `callbackUrl`, então quem entra volta para
    // cá e cai no HUB. Com a LexCausa reduzida a UMA ferramenta (Radar,
    // Diligências e Jurimetria em standby), o hub virou a porta única, com o
    // botão "Entrar na ferramenta" → /s; não há mais catálogo de produtos a
    // carregar aqui.
    const session = await requireSession("/");
    const { HubLexCausa } = await import("./hub-client");
    return <HubLexCausa menu={<AvatarSessao />} ehMaster={isMaster(session)} />;
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
