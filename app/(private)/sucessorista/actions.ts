"use server";

// Telemetria do Sucessorista — SEM nome de parte, CPF, nome de arquivo, texto
// livre ou VALOR ABSOLUTO do acervo. O porte do caso entra como FAIXA
// (decisão do dono do produto) e o resto é contagem, tag de enum ou flag.
//
// Quatro ações: LEITURA_COFRE (etapa 0), CALCULO (retrato do caso — UMA linha
// por casoId, atualizada conforme a folha evolui), DOCUMENTO (minuta/planilha/
// processo gerado) e PORTAL (convite ao herdeiro e resposta dele).
// Nunca quebra a ferramenta: com erro (ou banco fora), falha em silêncio.

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PORTES } from "@/lib/porte";
import type { AcaoSucessorista } from "@/lib/generated/prisma/enums";
import { EH_SUCESSORISTA } from "@/lib/app";

const PERFIS = ["ADVOGADO", "ESCREVENTE"];
const TIPOS_BEM = ["IMOVEL", "VEICULO", "FINANCEIRO", "QUOTAS", "OUTRO"];
const REGIMES = [
  "COMUNHAO_PARCIAL",
  "COMUNHAO_UNIVERSAL",
  "SEPARACAO_CONVENCIONAL",
  "SEPARACAO_OBRIGATORIA",
  "PARTICIPACAO_FINAL_AQUESTOS",
];
const VINCULOS = ["CASAMENTO", "UNIAO_ESTAVEL"];
const DOCUMENTOS = [
  "XLSX_PARTILHA",
  "MINUTA_TABELIONATO",
  "PETICAO_JUDICIAL",
  "ESCRITURA",
  "PROPOSTA_HONORARIOS",
  "CONTRATO_HONORARIOS",
  "PDF_PROCESSO",
  "ZIP_PROCESSO",
  "ARQUIVO_CASO",
  "ANALISE_MATRICULA",
  "ANALISE_MATRICULA_PDF",
  "ANTECIPADOR_REGISTRAL_PDF",
  "ORCAMENTO_PDF",
  "ORCAMENTO_DOCX",
];
const MODALIDADES = ["PRESENCIAL", "VIDEOCONFERENCIA", "HIBRIDA"];

function tag(valor: unknown, permitidos: readonly string[]): string | undefined {
  return typeof valor === "string" && permitidos.includes(valor) ? valor : undefined;
}

function inteiro(valor: unknown, max = 10_000): number {
  const n = Math.floor(Number(valor));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
}

function tags(valor: unknown, permitidos: readonly string[], max = 10): string[] {
  if (!Array.isArray(valor)) return [];
  return [...new Set(valor.filter((v): v is string => permitidos.includes(v as string)))].slice(
    0,
    max
  );
}

function casoIdLimpo(valor: unknown): string | null {
  // Id aleatório gerado no cliente (crypto.randomUUID) — sem dado pessoal.
  return typeof valor === "string" && valor.length > 0 && valor.length <= 60 ? valor : null;
}

async function usuarioLogado(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** Etapa 0: documentos lidos pela IA no cofre. */
export async function registrarLeituraDoCofre(dados: {
  casoId: string;
  perfil?: string;
  /** Arquivos efetivamente lidos pela IA. */
  lidos: number;
  /** Arquivos selecionados (inclui os que não vão para a IA). */
  selecionados: number;
  inelegiveis: number;
  lotesFalhos: number;
  duracaoMs: number;
  /** Tags de tipo de documento detectadas (nunca nomes de arquivo). */
  tipos: string[];
  identificouFalecido: boolean;
  outrosObitos: number;
  herdeirosLidos: number;
  bensLidos: number;
}): Promise<void> {
  // Telemetria do Sucessorista: no deploy do Renomeador estas actions
  // não valem (server action é endpoint público — o gate é no servidor).
  if (!EH_SUCESSORISTA) return;

  try {
    const userId = await usuarioLogado();
    if (!userId) return;
    await prisma.sucessoristaEvent.create({
      data: {
        acao: "LEITURA_COFRE",
        casoId: casoIdLimpo(dados.casoId),
        perfil: tag(dados.perfil, PERFIS) ?? null,
        quantidade: inteiro(dados.lidos, 500),
        duracaoMs: inteiro(dados.duracaoMs, 86_400_000),
        dados: {
          selecionados: inteiro(dados.selecionados, 5_000),
          inelegiveis: inteiro(dados.inelegiveis, 5_000),
          lotesFalhos: inteiro(dados.lotesFalhos, 500),
          // Tags livres do modelo ("Certidão de Óbito"…): truncadas e limitadas.
          tipos: (Array.isArray(dados.tipos) ? dados.tipos : [])
            .filter((t): t is string => typeof t === "string")
            .slice(0, 20)
            .map((t) => t.slice(0, 60)),
          identificouFalecido: dados.identificouFalecido === true,
          outrosObitos: inteiro(dados.outrosObitos, 20),
          herdeirosLidos: inteiro(dados.herdeirosLidos, 50),
          bensLidos: inteiro(dados.bensLidos, 100),
        },
        userId,
      },
    });
  } catch {
    // melhor-esforço
  }
}

/**
 * Retrato estrutural do caso quando a partilha fecha. UMA linha por casoId:
 * o cálculo roda a cada tecla, então aqui é upsert — o painel vê o estado
 * mais recente de cada inventário, não um evento por keystroke.
 */
export async function registrarCaso(dados: {
  casoId: string;
  perfil?: string;
  herdeiros: number;
  bens: number;
  tiposBem: string[];
  regime?: string | null;
  vinculo?: string | null;
  temSobrevivente: boolean;
  incapazes: number;
  /** true = elegível a inventário extrajudicial (motor). */
  extrajudicial: boolean;
  /** Faixa de porte do acervo — nunca o valor. */
  porte?: string | null;
  bloqueios: number;
  divergencias: number;
  /** Temas das divergências doutrinárias apontadas pelo motor. */
  temasDivergencia: string[];
  diferenciada: boolean;
  /** Torna apurada na partilha diferenciada. */
  torna: boolean;
  isencoes: number;
  /** Multas/juros presentes na provisão do ITCMD. */
  parcelasItcmd: string[];
  /** Cenário da reforma aplicado (óbito posterior à vigência informada). */
  progressivo: boolean;
}): Promise<void> {
  // Telemetria do Sucessorista: no deploy do Renomeador estas actions
  // não valem (server action é endpoint público — o gate é no servidor).
  if (!EH_SUCESSORISTA) return;

  try {
    const userId = await usuarioLogado();
    const casoId = casoIdLimpo(dados.casoId);
    if (!userId || !casoId) return;

    const payload = {
      acao: "CALCULO" as AcaoSucessorista,
      casoId,
      perfil: tag(dados.perfil, PERFIS) ?? null,
      quantidade: inteiro(dados.herdeiros, 100),
      dados: {
        bens: inteiro(dados.bens, 500),
        tiposBem: tags(dados.tiposBem, TIPOS_BEM, 5),
        regime: tag(dados.regime, REGIMES) ?? null,
        vinculo: tag(dados.vinculo, VINCULOS) ?? null,
        temSobrevivente: dados.temSobrevivente === true,
        incapazes: inteiro(dados.incapazes, 50),
        rito: dados.extrajudicial === true ? "EXTRAJUDICIAL" : "JUDICIAL",
        porte: tag(dados.porte, PORTES) ?? null,
        bloqueios: inteiro(dados.bloqueios, 50),
        divergencias: inteiro(dados.divergencias, 50),
        temasDivergencia: (Array.isArray(dados.temasDivergencia) ? dados.temasDivergencia : [])
          .filter((t): t is string => typeof t === "string")
          .slice(0, 6)
          .map((t) => t.slice(0, 80)),
        diferenciada: dados.diferenciada === true,
        torna: dados.torna === true,
        isencoes: inteiro(dados.isencoes, 50),
        parcelasItcmd: tags(
          dados.parcelasItcmd,
          ["imposto", "desconto", "multa-abertura", "multa-moratoria", "juros"],
          5
        ),
        progressivo: dados.progressivo === true,
      },
      userId,
    };

    // Upsert manual: sem unique em (casoId, acao) porque DOCUMENTO/PORTAL
    // têm várias linhas por caso — só o retrato do CALCULO é único.
    const existente = await prisma.sucessoristaEvent.findFirst({
      where: { casoId, acao: "CALCULO", userId },
      select: { id: true },
    });
    if (existente) {
      await prisma.sucessoristaEvent.update({ where: { id: existente.id }, data: payload });
    } else {
      await prisma.sucessoristaEvent.create({ data: payload });
    }
  } catch {
    // melhor-esforço
  }
}

/** Minuta, planilha ou processo gerado (o desfecho que vale dinheiro). */
export async function registrarDocumentoGerado(dados: {
  casoId: string;
  perfil?: string;
  documento: string;
  /** A IA redigiu (false = fallback local / texto padrão). */
  comIa?: boolean;
  /** Houve instruções livres à IA (só a flag — o texto nunca). */
  comInstrucoes?: boolean;
  modalidade?: string | null;
  /** Itens/arquivos que entraram (processo em PDF/ZIP, quinhões do xlsx…). */
  itens?: number;
  duracaoMs?: number;
}): Promise<void> {
  // Telemetria do Sucessorista: no deploy do Renomeador estas actions
  // não valem (server action é endpoint público — o gate é no servidor).
  if (!EH_SUCESSORISTA) return;

  try {
    const userId = await usuarioLogado();
    const documento = tag(dados.documento, DOCUMENTOS);
    if (!userId || !documento) return;
    await prisma.sucessoristaEvent.create({
      data: {
        acao: "DOCUMENTO",
        casoId: casoIdLimpo(dados.casoId),
        perfil: tag(dados.perfil, PERFIS) ?? null,
        quantidade: inteiro(dados.itens, 5_000),
        duracaoMs: dados.duracaoMs === undefined ? null : inteiro(dados.duracaoMs, 86_400_000),
        dados: {
          documento,
          comIa: dados.comIa === true,
          comInstrucoes: dados.comInstrucoes === true,
          modalidade: tag(dados.modalidade, MODALIDADES) ?? null,
        },
        userId,
      },
    });
  } catch {
    // melhor-esforço
  }
}

/**
 * Portal do herdeiro. `respondeu` vem da rota do portal (o herdeiro não tem
 * login — o evento fica sem usuário, com o casoId amarrando ao caso).
 */
export async function registrarPortal(dados: {
  casoId: string;
  /** CONVITE = advogado gerou o link; QUALIFICACAO/DOCUMENTO/CONFIRMACAO = herdeiro respondeu. */
  etapa: "CONVITE" | "QUALIFICACAO" | "DOCUMENTO" | "CONFIRMACAO";
  /** Convites do caso, campos preenchidos ou documentos enviados. */
  quantidade?: number;
  /** Tag de tipo do documento enviado pelo herdeiro (nunca o nome do arquivo). */
  tipoDetectado?: string | null;
  /** Preenchido só quando há sessão (o convite; a resposta não tem). */
  comUsuario?: boolean;
}): Promise<void> {
  // Telemetria do Sucessorista: no deploy do Renomeador estas actions
  // não valem (server action é endpoint público — o gate é no servidor).
  if (!EH_SUCESSORISTA) return;

  try {
    const etapa = tag(dados.etapa, ["CONVITE", "QUALIFICACAO", "DOCUMENTO", "CONFIRMACAO"]);
    if (!etapa) return;
    const userId = dados.comUsuario === false ? null : await usuarioLogado();
    await prisma.sucessoristaEvent.create({
      data: {
        acao: "PORTAL",
        casoId: casoIdLimpo(dados.casoId),
        quantidade: inteiro(dados.quantidade, 200),
        dados: {
          etapa,
          tipoDetectado:
            typeof dados.tipoDetectado === "string" ? dados.tipoDetectado.slice(0, 60) : null,
        },
        userId,
      },
    });
  } catch {
    // melhor-esforço
  }
}
