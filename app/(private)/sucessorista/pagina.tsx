// Montagem SERVER do módulo Sucessorista — compartilhada pela raiz (`/`) e
// pela rota do caso (`/caso/<id>/<etapa>`, T1 da auditoria): o gate de
// sessão fica em cada page.tsx (o callbackUrl precisa do caminho real);
// aqui entram as cargas por conta (lições, perfil, equipe) e o client.

import { AccessTracker } from "@/components/access-tracker";
import { comandosPadrao } from "@/components/lexcausa/comandos";
import { PaletaComandos } from "@/components/lexcausa/paleta-comandos";
import { LexTopbar } from "@/components/lexcausa/topbar";
import { TourLexCausa } from "@/components/lexcausa/tour";
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
      {/* Tour de primeiro acesso por PERFIL — 4 passos, dispensável; o
          conteúdo completo fica em /ajuda/sucessorista. */}
      <TourLexCausa
        id={`sucessorista-${perfilConta === "ESCREVENTE" ? "escrevente" : "advogado"}`}
        passos={
          perfilConta === "ESCREVENTE"
            ? [
                { titulo: "Bem-vindo(a) ao O Sucessorista", texto: "Seus casos vivem na SUA pasta ou na SUA nuvem — crie o primeiro em “Novo caso” e tudo se salva sozinho enquanto digita." },
                { titulo: "O cofre lê os documentos", texto: "Solte a pasta do caso no cofre da Página Inicial: certidões, matrículas e venais viram campos preenchidos — sempre para a sua conferência." },
                { titulo: "A escritura do balcão", texto: "A aba Escritura monta a minuta calibrada por atos reais — Tahoma, tabelas de patrimônio e partilha, adjudicação, sobrepartilha e dois óbitos." },
                { titulo: "Conferências que evitam nota", texto: "O conferidor de qualificação cruzada e o antecipador registral apontam divergências e exigências do RI antes de lavrar." },
              ]
            : [
                { titulo: "Bem-vindo(a) ao O Sucessorista", texto: "Seus casos vivem na SUA pasta ou na SUA nuvem — crie o primeiro em “Novo caso” e tudo se salva sozinho enquanto digita." },
                { titulo: "O cofre lê os documentos", texto: "Solte a pasta do caso no cofre da Página Inicial: a IA preenche o que tiver base clara no documento, e a folha fica em branco no resto — apoio, nunca verdade." },
                { titulo: "As 5 fases do inventário", texto: "Composição, acervo, quinhões, cofre e espelho ITCMD — a barra do dashboard mostra o progresso e leva à aba certa; a navegação é sempre livre." },
                { titulo: "A família participa pelo portal", texto: "O card “Painel da família” gera convites por link: qualificação e documentos chegam sozinhos, e as deliberações do espólio ficam registradas." },
              ]
        }
      />
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
        shell={
          /* Barra LexCausa no painel Meus casos (o client a esconde dentro
             da folha do caso, onde a lombada é o shell). */
          <LexTopbar
            menu={<UserMenu />}
            ehMaster={isMaster(session)}
            radarAtivo={radarAtivo()}
            escrevente={perfilConta === "ESCREVENTE"}
            sub="O Sucessorista · by LexCausa"
          />
        }
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
