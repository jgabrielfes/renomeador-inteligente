// Montagem SERVER do módulo Sucessorista — compartilhada pela raiz (`/`) e
// pela rota do caso (`/caso/<id>/<etapa>`, T1 da auditoria): o gate de
// sessão fica em cada page.tsx (o callbackUrl precisa do caminho real);
// aqui entram as cargas por conta (lições, perfil, equipe) e o client.

import { AccessTracker } from "@/components/access-tracker";
import { comandosPadrao } from "@/components/lexcausa/comandos";
import { PaletaComandos } from "@/components/lexcausa/paleta-comandos";
import { UserMenu } from "@/components/user-menu";
import { IDENTIDADE } from "@/lib/app";
import { isMaster } from "@/lib/auth";
import { radarAtivo } from "@/lib/radar/config";
import { prisma } from "@/lib/prisma";
import type { Session } from "next-auth";

import { carregarLicoes } from "../renomeador/licoes-actions";

export async function PaginaSucessorista({
  session,
  casoInicialId = null,
  etapaInicial = null,
}: {
  session: Session | null;
  /** Id do caso vindo do caminho /caso/<id> — o client o abre ao montar. */
  casoInicialId?: string | null;
  etapaInicial?: string | null;
}) {
  // Regras + correções da conta, já no primeiro render (sem flash de vazio).
  const licoes = await carregarLicoes();

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
  const { minhaEquipe } = await import("./equipe-actions");
  const equipe = await minhaEquipe();

  const { default: SucessoristaClient } = await import("./sucessorista-client");
  return (
    <>
      <AccessTracker modulo={IDENTIDADE.modulo} />
      {/* Shell LexCausa dentro do módulo imersivo: só a paleta (⌘K) — a
          lombada é a navegação visual daqui. */}
      <PaletaComandos
        comandos={comandosPadrao({
          ehMaster: isMaster(session),
          radarAtivo: radarAtivo(),
          escrevente: perfilConta === "ESCREVENTE",
        })}
      />
      <SucessoristaClient
        licoesRenomeador={licoes}
        menu={<UserMenu />}
        perfilConta={perfilConta}
        ehMaster={isMaster(session)}
        equipe={equipe}
        contaId={session?.user?.id ?? null}
        nomeConta={session?.user?.name ?? null}
        radarAtivo={radarAtivo()}
        casoInicialId={casoInicialId}
        etapaInicial={etapaInicial}
      />
    </>
  );
}
