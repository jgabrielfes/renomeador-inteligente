// Analisador de Matrícula de Imóvel — item IX do Sucessorista.
//
// O Gemini lê certidões de matrícula (inteiro teor) e devolve o RELATÓRIO
// COMPLETO de situação dominial: identificação, tabela consolidada de
// proprietários, ônus ativos, alertas com ação recomendada, resumo booleano,
// análise jurídica da cadeia dominial, pontos de atenção e o índice de
// confiabilidade da extração. Mesmo desenho de segurança do cofre
// (lib/gemini-sucessorista.ts): a chave vive só no servidor e o documento só
// sai da máquina pela rota interna /api/sucessorista.
//
// Regra de honestidade: campo sem base clara no documento volta null — o
// relatório é APOIO à conferência do profissional, nunca verdade absoluta.

import { AI_MIME_TYPES, GeminiError, geminiJson } from "./gemini";
import { getExtension } from "./renamer";
import type { ArquivoCofre } from "./gemini-sucessorista";

export interface ProprietarioMatricula {
  nome: string;
  /** Fração ideal como consta ("1/4", "50%"). */
  fracao: string | null;
  /** Participação em % (0–100). */
  participacaoPct: number | null;
  /** Plena, nua-propriedade, usufruto, resolúvel… */
  tipoDominio: string | null;
  /** Registro(s) de origem ("Compra e venda R.09"). */
  origens: string | null;
  /** Meeiro(a), próprio, não consta… */
  statusConjuge: string | null;
}

export interface OnusMatricula {
  /** "Cláusula Resolutiva Expressa — Registro R.09" */
  titulo: string;
  status: string | null;
  dataRegistro: string | null;
  credor: string | null;
  valor: string | null;
  prazo: string | null;
  descricao: string | null;
}

export interface AlertaMatricula {
  nivel: "ALTA" | "BAIXA";
  /** Tag curta: ONUS_ATIVO, MULTIPLOS_PROPRIETARIOS, USUFRUTO… */
  tipo: string;
  descricao: string;
  acaoRecomendada: string | null;
}

export interface ResumoMatricula {
  livreDeOnus: boolean | null;
  onusAtivos: boolean | null;
  usufrutoVigente: boolean | null;
  clausulasRestritivas: boolean | null;
  indisponibilidade: boolean | null;
  processoJudicial: boolean | null;
  proprietarioFalecido: boolean | null;
  documentoCompleto: boolean | null;
  certidaoVigente: boolean | null;
  qtdProprietarios: number | null;
  qtdUsufrutuarios: number | null;
  qtdOnusAtivos: number | null;
  fracoesFecham100: boolean | null;
}

export interface AnaliseMatricula {
  /** Índices (1-based) dos arquivos enviados que compõem esta matrícula. */
  arquivos: number[];
  identificacao: {
    tipoDocumento: string | null;
    numeroMatricula: string | null;
    livro: string | null;
    cartorio: string | null;
    comarca: string | null;
    dataAbertura: string | null;
    dataEmissaoCertidao: string | null;
    seloDigital: string | null;
    cnm: string | null;
  };
  /** Descrição curta do imóvel (tipo, endereço, área) para o cabeçalho. */
  descricaoImovel: string | null;
  proprietarios: ProprietarioMatricula[];
  onusAtivos: OnusMatricula[];
  alertas: AlertaMatricula[];
  resumo: ResumoMatricula;
  /** Parágrafos da análise jurídica da cadeia dominial. */
  analiseJuridica: string[];
  pontosDeAtencao: Array<{ titulo: string; descricao: string }>;
  confiabilidade: { indicePct: number | null; justificativa: string | null };
}

const texto = { type: "string", nullable: true } as const;
const boolN = { type: "boolean", nullable: true } as const;
const intN = { type: "integer", nullable: true } as const;

const SCHEMA_MATRICULA = {
  type: "object",
  properties: {
    matriculas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          arquivos: { type: "array", items: { type: "integer" } },
          identificacao: {
            type: "object",
            properties: {
              tipoDocumento: texto,
              numeroMatricula: texto,
              livro: texto,
              cartorio: texto,
              comarca: texto,
              dataAbertura: texto,
              dataEmissaoCertidao: texto,
              seloDigital: texto,
              cnm: texto,
            },
          },
          descricaoImovel: texto,
          proprietarios: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nome: { type: "string" },
                fracao: texto,
                participacaoPct: { type: "number", nullable: true },
                tipoDominio: texto,
                origens: texto,
                statusConjuge: texto,
              },
              required: ["nome"],
            },
          },
          onusAtivos: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titulo: { type: "string" },
                status: texto,
                dataRegistro: texto,
                credor: texto,
                valor: texto,
                prazo: texto,
                descricao: texto,
              },
              required: ["titulo"],
            },
          },
          alertas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                nivel: { type: "string", enum: ["ALTA", "BAIXA"] },
                tipo: { type: "string" },
                descricao: { type: "string" },
                acaoRecomendada: texto,
              },
              required: ["nivel", "tipo", "descricao"],
            },
          },
          resumo: {
            type: "object",
            properties: {
              livreDeOnus: boolN,
              onusAtivos: boolN,
              usufrutoVigente: boolN,
              clausulasRestritivas: boolN,
              indisponibilidade: boolN,
              processoJudicial: boolN,
              proprietarioFalecido: boolN,
              documentoCompleto: boolN,
              certidaoVigente: boolN,
              qtdProprietarios: intN,
              qtdUsufrutuarios: intN,
              qtdOnusAtivos: intN,
              fracoesFecham100: boolN,
            },
          },
          analiseJuridica: { type: "array", items: { type: "string" } },
          pontosDeAtencao: {
            type: "array",
            items: {
              type: "object",
              properties: {
                titulo: { type: "string" },
                descricao: { type: "string" },
              },
              required: ["titulo", "descricao"],
            },
          },
          confiabilidade: {
            type: "object",
            properties: {
              indicePct: { type: "number", nullable: true },
              justificativa: texto,
            },
          },
        },
        required: [
          "arquivos",
          "identificacao",
          "proprietarios",
          "onusAtivos",
          "alertas",
          "resumo",
          "analiseJuridica",
          "pontosDeAtencao",
          "confiabilidade",
        ],
      },
    },
  },
  required: ["matriculas"],
} as const;

function promptMatricula(total: number): string {
  return `Você é analista registral sênior de um cartório de registro de imóveis no Brasil. Acima estão ${total} documento(s), cada um precedido de "DOCUMENTO n" — certidões de matrícula de imóvel (inteiro teor). Produza UMA análise completa por MATRÍCULA (uma matrícula pode ocupar mais de um arquivo — agrupe pelos números; liste em "arquivos" os índices usados).

Para cada matrícula, extraia e analise:

1. identificacao — tipoDocumento ("Matrícula de Imóvel"), numeroMatricula, livro, cartorio (nome completo da serventia), comarca, dataAbertura (dd/mm/aaaa), dataEmissaoCertidao (dd/mm/aaaa), seloDigital (autenticação/selo digital da certidão) e cnm (Código Nacional de Matrícula), quando constarem.
2. descricaoImovel — descrição curta e útil (tipo, endereço, área).
3. proprietarios — a TABELA CONSOLIDADA DE SITUAÇÃO DOMINIAL: a situação ATUAL da propriedade, aplicando toda a cadeia de registros e averbações (o último ato prevalece). Um item por titular ATUAL: nome; fracao como consta ("1/4"); participacaoPct em número (25); tipoDominio (Plena, Nua-propriedade, Usufruto, Resolúvel…); origens (ato de aquisição, ex.: "Compra e venda R.09"); statusConjuge (Meeiro(a) quando o regime comunica a aquisição ao cônjuge; "próprio" quando adquiriu em nome próprio; null se não constar). ATENÇÃO ao regime de bens: aquisição onerosa na comunhão parcial/universal comunica ao cônjuge — inclua o cônjuge como titular meeiro com a fração dele.
4. onusAtivos — APENAS os ônus VIGENTES (hipoteca, alienação fiduciária, penhora, usufruto, cláusula resolutiva, indisponibilidade…): titulo ("Cláusula Resolutiva Expressa — Registro R.09"), status ("ativo"), dataRegistro, credor/beneficiário, valor (como consta, ex.: "R$ 120.000,00"), prazo e descricao (o teor resumido, com a consequência jurídica). Ônus CANCELADOS por averbação NÃO entram.
5. alertas — o que o profissional precisa ver: nivel ALTA (impede/condiciona negócio: ônus ativo, indisponibilidade, bloqueio judicial, proprietário falecido sem inventário) ou BAIXA (atenção operacional: múltiplos proprietários, certidão antiga…); tipo em tag curta em caixa alta (ONUS_ATIVO, INDISPONIBILIDADE, USUFRUTO, PROPRIETARIO_FALECIDO, MULTIPLOS_PROPRIETARIOS, CERTIDAO_VENCIDA…); descricao objetiva; acaoRecomendada prática (que documento exigir, que averbação providenciar).
6. resumo — o checklist booleano da situação: livreDeOnus, onusAtivos, usufrutoVigente, clausulasRestritivas, indisponibilidade, processoJudicial (penhora/bloqueio/citação registrados), proprietarioFalecido (titular atual com óbito averbado ou conhecido), documentoCompleto (a certidão veio inteira, sem páginas faltando), certidaoVigente (emitida há menos de 30 dias da data de emissão mais recente no lote), qtdProprietarios, qtdUsufrutuarios, qtdOnusAtivos e fracoesFecham100 (a soma das frações dos titulares atuais fecha 100%).
7. analiseJuridica — 2 a 5 parágrafos de prosa técnica narrando a CADEIA DOMINIAL: como a propriedade chegou aos titulares atuais (registros relevantes na ordem), o efeito do regime de bens, e a consequência jurídica dos ônus vigentes (o que precisa acontecer para a propriedade ficar plena e negociável).
8. pontosDeAtencao — itens objetivos com titulo curto e descricao prática: o que precisa ser resolvido/averbado ANTES de qualquer negócio (quitações, cancelamentos, inventários pendentes, retificações).
9. confiabilidade — indicePct (0 a 100) da qualidade da extração e justificativa (legibilidade, páginas faltando, carimbos sobre texto…).

REGRAS: não invente nada — campo sem base clara volta null (ou lista vazia); valores e datas exatamente como constam; responda apenas o JSON.`;
}

function limpar(v: unknown, max = 300): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

function pct(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? Math.round(n * 100) / 100 : null;
}

function boolOuNull(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function intOuNull(v: unknown, max = 1000): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
}

/** Lê o lote de certidões de matrícula e devolve as análises, já saneadas. */
export async function analisarMatriculas(
  apiKey: string,
  arquivos: ArquivoCofre[]
): Promise<AnaliseMatricula[]> {
  const parts: Array<Record<string, unknown>> = [];
  arquivos.forEach((arq, i) => {
    const ext = getExtension(arq.fileName);
    if (ext === ".txt") {
      const conteudo = Buffer.from(arq.data).toString("utf-8").slice(0, 60_000);
      parts.push({ text: `DOCUMENTO ${i + 1}: ${arq.fileName}\n${conteudo}` });
      return;
    }
    const mimeType = AI_MIME_TYPES[ext];
    if (!mimeType) {
      throw new GeminiError(`Formato não suportado pela IA: ${arq.fileName}`, 415);
    }
    parts.push({ text: `DOCUMENTO ${i + 1}: ${arq.fileName}` });
    parts.push({
      inline_data: {
        mime_type: mimeType,
        data: Buffer.from(arq.data).toString("base64"),
      },
    });
  });
  parts.push({ text: promptMatricula(arquivos.length) });

  const bruto = (await geminiJson(apiKey, parts, SCHEMA_MATRICULA)) as Record<string, unknown>;
  const lista = Array.isArray(bruto?.matriculas) ? bruto.matriculas : [];
  if (lista.length === 0) {
    throw new GeminiError(
      "Nenhuma matrícula reconhecida nos arquivos — confira se são certidões de matrícula legíveis.",
      422
    );
  }

  return lista
    .map((item) => {
      const m = item as Record<string, unknown>;
      const ident = (m.identificacao ?? {}) as Record<string, unknown>;
      const resumo = (m.resumo ?? {}) as Record<string, unknown>;
      const conf = (m.confiabilidade ?? {}) as Record<string, unknown>;
      const saida: AnaliseMatricula = {
        arquivos: (Array.isArray(m.arquivos) ? m.arquivos : [])
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 1 && n <= arquivos.length)
          .slice(0, arquivos.length),
        identificacao: {
          tipoDocumento: limpar(ident.tipoDocumento, 60),
          numeroMatricula: limpar(ident.numeroMatricula, 40),
          livro: limpar(ident.livro, 20),
          cartorio: limpar(ident.cartorio, 200),
          comarca: limpar(ident.comarca, 80),
          dataAbertura: limpar(ident.dataAbertura, 20),
          dataEmissaoCertidao: limpar(ident.dataEmissaoCertidao, 20),
          seloDigital: limpar(ident.seloDigital, 80),
          cnm: limpar(ident.cnm, 40),
        },
        descricaoImovel: limpar(m.descricaoImovel, 300),
        proprietarios: (Array.isArray(m.proprietarios) ? m.proprietarios : [])
          .map((x) => {
            const p = x as Record<string, unknown>;
            const nome = limpar(p.nome, 120);
            if (!nome) return null;
            return {
              nome,
              fracao: limpar(p.fracao, 30),
              participacaoPct: pct(p.participacaoPct),
              tipoDominio: limpar(p.tipoDominio, 60),
              origens: limpar(p.origens, 120),
              statusConjuge: limpar(p.statusConjuge, 60),
            };
          })
          .filter((x): x is ProprietarioMatricula => x !== null)
          .slice(0, 30),
        onusAtivos: (Array.isArray(m.onusAtivos) ? m.onusAtivos : [])
          .map((x) => {
            const o = x as Record<string, unknown>;
            const titulo = limpar(o.titulo, 160);
            if (!titulo) return null;
            return {
              titulo,
              status: limpar(o.status, 40),
              dataRegistro: limpar(o.dataRegistro, 20),
              credor: limpar(o.credor, 120),
              valor: limpar(o.valor, 60),
              prazo: limpar(o.prazo, 160),
              descricao: limpar(o.descricao, 1200),
            };
          })
          .filter((x): x is OnusMatricula => x !== null)
          .slice(0, 20),
        alertas: (Array.isArray(m.alertas) ? m.alertas : [])
          .map((x) => {
            const a = x as Record<string, unknown>;
            const descricao = limpar(a.descricao, 800);
            const tipo = limpar(a.tipo, 60);
            if (!descricao || !tipo) return null;
            return {
              nivel: a.nivel === "ALTA" ? ("ALTA" as const) : ("BAIXA" as const),
              tipo,
              descricao,
              acaoRecomendada: limpar(a.acaoRecomendada, 500),
            };
          })
          .filter((x): x is AlertaMatricula => x !== null)
          .slice(0, 15),
        resumo: {
          livreDeOnus: boolOuNull(resumo.livreDeOnus),
          onusAtivos: boolOuNull(resumo.onusAtivos),
          usufrutoVigente: boolOuNull(resumo.usufrutoVigente),
          clausulasRestritivas: boolOuNull(resumo.clausulasRestritivas),
          indisponibilidade: boolOuNull(resumo.indisponibilidade),
          processoJudicial: boolOuNull(resumo.processoJudicial),
          proprietarioFalecido: boolOuNull(resumo.proprietarioFalecido),
          documentoCompleto: boolOuNull(resumo.documentoCompleto),
          certidaoVigente: boolOuNull(resumo.certidaoVigente),
          qtdProprietarios: intOuNull(resumo.qtdProprietarios),
          qtdUsufrutuarios: intOuNull(resumo.qtdUsufrutuarios),
          qtdOnusAtivos: intOuNull(resumo.qtdOnusAtivos),
          fracoesFecham100: boolOuNull(resumo.fracoesFecham100),
        },
        analiseJuridica: (Array.isArray(m.analiseJuridica) ? m.analiseJuridica : [])
          .map((par) => (typeof par === "string" ? par.trim().slice(0, 3000) : ""))
          .filter(Boolean)
          .slice(0, 8),
        pontosDeAtencao: (Array.isArray(m.pontosDeAtencao) ? m.pontosDeAtencao : [])
          .map((x) => {
            const pa = x as Record<string, unknown>;
            const titulo = limpar(pa.titulo, 120);
            const descricao = limpar(pa.descricao, 800);
            return titulo && descricao ? { titulo, descricao } : null;
          })
          .filter((x): x is { titulo: string; descricao: string } => x !== null)
          .slice(0, 12),
        confiabilidade: {
          indicePct: pct(conf.indicePct),
          justificativa: limpar(conf.justificativa, 400),
        },
      };
      return saida;
    })
    .slice(0, 10);
}
