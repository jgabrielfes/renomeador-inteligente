// QUAL PLATAFORMA ESTE DEPLOY É.
//
// O repositório é um só, mas publica QUATRO sites independentes na Vercel. A
// variável de ambiente `APP` é o que os diferencia:
//
//   APP=hub           → lexcausa.com.br (a vitrine da marca — sem conta)
//   APP=renomeador    → renomeadorinteligente.lexcausa.com.br
//   APP=sucessorista  → osucessorista.lexcausa.com.br
//   APP=notas         → notasdevolutivas.lexcausa.com.br
//
// Tudo que é "só de um dos lados" pergunta a este módulo: qual módulo mora na
// raiz `/`, quais telas de administração existem, de qual plataforma são as
// contas que entram no login, o que vai no título e no manifesto do PWA.
//
// Server-side apenas (`process.env.APP` não existe no navegador). O cliente
// recebe a plataforma por prop, vinda de um server component — assim continua
// existindo UMA variável de ambiente, e não uma cópia NEXT_PUBLIC_ para
// esquecer de atualizar.

import type {
  Modulo,
  Plataforma as PlataformaDeDados,
} from "@/lib/generated/prisma/enums";

export type Plataforma = "RENOMEADOR" | "SUCESSORISTA" | "NOTAS" | "HUB";

/**
 * As plataformas que têm CONTA e dados no banco — é o enum `Plataforma` do
 * Prisma, e não inclui o HUB.
 *
 * A distinção é de propósito: o hub é uma vitrine sem login, sem usuário e sem
 * telemetria, então não pode virar valor de coluna. Manter os dois tipos
 * separados faz o compilador recusar `where: { app: APP }` numa consulta que
 * rodasse no hub, em vez de deixar passar um valor que o banco não conhece.
 */
export type PlataformaComConta = PlataformaDeDados;

const VALORES: Record<string, Plataforma> = {
  renomeador: "RENOMEADOR",
  sucessorista: "SUCESSORISTA",
  notas: "NOTAS",
  hub: "HUB",
};

function lerPlataforma(): Plataforma {
  const bruto = (process.env.APP ?? "").trim().toLowerCase();
  const valor = VALORES[bruto];
  if (!valor) {
    // Falha explícita em vez de assumir um dos sites: publicar um achando
    // que é o outro seria pior que não subir.
    throw new Error(
      `Variável de ambiente APP ausente ou inválida (recebido: ${JSON.stringify(
        process.env.APP ?? null
      )}). Defina APP=hub, APP=renomeador, APP=sucessorista ou APP=notas — veja .env.example.`
    );
  }
  return valor;
}

/** A plataforma deste deploy. */
export const APP: Plataforma = lerPlataforma();

export const EH_RENOMEADOR = APP === "RENOMEADOR";
export const EH_SUCESSORISTA = APP === "SUCESSORISTA";
export const EH_NOTAS = APP === "NOTAS";
/** A vitrine da marca: sem login, sem banco, sem /admin — só os produtos. */
export const EH_HUB = APP === "HUB";

export interface IdentidadeDaPlataforma {
  /** Nome por extenso — título da aba, cabeçalho do admin. */
  nome: string;
  /** Nome curto — PWA e menus. */
  nomeCurto: string;
  descricao: string;
  /**
   * Módulo correspondente na telemetria (`module_accesses.modulo`).
   * `null` no HUB: vitrine pública, sem conta e sem telemetria de uso —
   * quem precisa do valor usa `moduloDaPlataforma()`.
   */
  modulo: Modulo | null;
}

export const IDENTIDADES: Record<Plataforma, IdentidadeDaPlataforma> = {
  RENOMEADOR: {
    nome: "Renomeador Inteligente de Documentos",
    nomeCurto: "Renomeador",
    descricao:
      "Analisa imagens e PDFs no seu navegador e sugere nomes de arquivo com base no conteúdo do documento. Nada é enviado para servidores.",
    modulo: "RENOMEADOR",
  },
  SUCESSORISTA: {
    // Remodelagem de marca: a LEXCAUSA é a marca-mãe deste site; O
    // Sucessorista e o Radar Sucessório são os produtos dentro dela. O
    // `modulo` de telemetria NÃO muda — é chave de dados, não de marca.
    nome: "LexCausa",
    nomeCurto: "LexCausa",
    descricao:
      "A prática sucessória, organizada: O Sucessorista (gestão de inventários, do primeiro atendimento ao registro) e o Radar Sucessório (o encontro entre famílias e advogados). Cálculo de apoio — a revisão do advogado responsável é obrigatória.",
    modulo: "SUCESSORISTA",
  },
  HUB: {
    nome: "LexCausa",
    nomeCurto: "LexCausa",
    descricao:
      "As ferramentas do escritório num lugar só: O Sucessorista para a prática sucessória, o Renomeador Inteligente para a organização documental e o Resolvedor de Notas Devolutivas para as exigências do registro.",
    // Vitrine pública: nenhuma conta, nenhum acesso medido.
    modulo: null,
  },
  NOTAS: {
    nome: "Resolvedor de Notas Devolutivas",
    nomeCurto: "Resolvedor de Notas",
    descricao:
      "Envie a pasta do caso: a nota devolutiva é decomposta em exigências, cada uma cai numa via de resolução e a minuta da peça já sai montada. A saída é sempre rascunho para a sua revisão.",
    modulo: "NOTAS",
  },
};

/** Identidade da plataforma deste deploy. */
export const IDENTIDADE = IDENTIDADES[APP];

/**
 * Módulo de telemetria deste deploy, garantido não-nulo.
 *
 * Só as plataformas COM CONTA registram uso, e as telas que medem (`/` de
 * cada ferramenta, `/admin`) não existem no HUB. Lançar aqui é melhor que um
 * `!` silencioso: se um dia alguém montar essas telas na vitrine, o erro
 * aparece na hora em vez de virar um filtro `undefined` no Prisma — que
 * significaria "sem filtro" e vazaria dados entre os sites.
 */
export function moduloDaPlataforma(): Modulo {
  if (!IDENTIDADE.modulo) {
    throw new Error(
      `A plataforma ${APP} não tem módulo de telemetria — esta tela não deveria existir aqui.`
    );
  }
  return IDENTIDADE.modulo;
}

/**
 * A plataforma deste deploy como chave de DADOS (coluna `app`).
 *
 * Lança no HUB pelo mesmo motivo de `moduloDaPlataforma()`: login, cadastro,
 * telemetria e portal não existem lá, então chegar aqui significa que uma
 * tela foi montada onde não devia — melhor o erro explícito do que gravar
 * linha órfã ou filtrar por um valor inexistente.
 */
export function appComConta(): PlataformaComConta {
  if (APP === "HUB") {
    throw new Error(
      "O HUB não tem contas nem dados — esta operação não deveria rodar aqui."
    );
  }
  return APP;
}

/**
 * Gate de rota que só existe em uma das plataformas: responde 404 quando o
 * deploy é o outro app. Vale a mesma lógica do /admin — a rota do módulo
 * alheio não "existe" aqui, em vez de existir e negar.
 */
export async function requirePlataforma(esperada: Plataforma) {
  if (APP === esperada) return;
  const { notFound } = await import("next/navigation");
  notFound();
}

/**
 * Mesma ideia para ROTA DE API: devolve a resposta 404 quando o deploy é o
 * outro app, ou `null` quando a rota pode seguir. Route handler responde com
 * `Response` em vez de renderizar página, daí o formato.
 *
 *     const fora = foraDaPlataforma("SUCESSORISTA");
 *     if (fora) return fora;
 */
export function foraDaPlataforma(esperada: Plataforma): Response | null {
  return APP === esperada ? null : new Response(null, { status: 404 });
}
