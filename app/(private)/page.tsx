// A RAIZ DE CADA SITE.
//
// O repositório publica três sites (lib/app.ts). No Renomeador e no
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
import { UserMenu } from "@/components/user-menu";
import { APP, IDENTIDADE } from "@/lib/app";
import { auth, isMaster, requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { radarAtivo } from "@/lib/radar/config";

import { carregarLicoes } from "./renomeador/licoes-actions";

export default async function Home() {
  if (APP === "SUCESSORISTA") {
    const session = await auth();
    if (!session?.user) {
      const { EntradaSucessorista } = await import("./sucessorista/entrada");
      return <EntradaSucessorista />;
    }
    // HUB LexCausa — o perfil decide quais cards aparecem; falha de banco
    // degrada para null (o hub mostra tudo e os gates reais ficam nas rotas).
    let perfil: "ADVOGADO" | "ESCREVENTE" | null = null;
    try {
      const usuario = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { perfilSucessorista: true },
      });
      perfil = usuario?.perfilSucessorista ?? null;
    } catch {
      perfil = null;
    }
    // Aviso de casos novos no Radar É AQUI (dentro da plataforma — e-mail de
    // caso novo não existe, decisão do escritório): o badge conta o que foi
    // publicado nas UFs assinadas desde a última visita à lista.
    let radarNovos = 0;
    if (radarAtivo() && perfil !== "ESCREVENTE") {
      const { casosNovosRadar } = await import("./radar/radar-actions");
      radarNovos = await casosNovosRadar();
    }
    const { HubLexCausa } = await import("./hub-client");
    return (
      <HubLexCausa
        menu={<UserMenu />}
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
        <AccessTracker modulo={IDENTIDADE.modulo} />
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
      <AccessTracker modulo={IDENTIDADE.modulo} />
      <RenomeadorClient initialLessons={licoes} menu={<UserMenu />} />
    </>
  );
}
