// QUAL PLATAFORMA ESTE DEPLOY É.
//
// O repositório é um só, mas publica DOIS sites independentes na Vercel — um
// por módulo. A variável de ambiente `APP` é o que os diferencia:
//
//   APP=renomeador    → renomeador-inteligente.vercel.app
//   APP=sucessorista  → osucessorista.vercel.app
//
// Tudo que é "só de um dos lados" pergunta a este módulo: qual módulo mora na
// raiz `/`, quais telas de administração existem, de qual plataforma são as
// contas que entram no login, o que vai no título e no manifesto do PWA.
//
// Server-side apenas (`process.env.APP` não existe no navegador). O cliente
// recebe a plataforma por prop, vinda de um server component — assim continua
// existindo UMA variável de ambiente, e não uma cópia NEXT_PUBLIC_ para
// esquecer de atualizar.

import type { Modulo } from "@/lib/generated/prisma/enums";

export type Plataforma = "RENOMEADOR" | "SUCESSORISTA";

const VALORES: Record<string, Plataforma> = {
  renomeador: "RENOMEADOR",
  sucessorista: "SUCESSORISTA",
};

function lerPlataforma(): Plataforma {
  const bruto = (process.env.APP ?? "").trim().toLowerCase();
  const valor = VALORES[bruto];
  if (!valor) {
    // Falha explícita em vez de assumir um dos dois: publicar o Sucessorista
    // achando que é o Renomeador (ou o contrário) seria pior que não subir.
    throw new Error(
      `Variável de ambiente APP ausente ou inválida (recebido: ${JSON.stringify(
        process.env.APP ?? null
      )}). Defina APP=renomeador ou APP=sucessorista — veja .env.example.`
    );
  }
  return valor;
}

/** A plataforma deste deploy. */
export const APP: Plataforma = lerPlataforma();

export const EH_RENOMEADOR = APP === "RENOMEADOR";
export const EH_SUCESSORISTA = APP === "SUCESSORISTA";

export interface IdentidadeDaPlataforma {
  /** Nome por extenso — título da aba, cabeçalho do admin. */
  nome: string;
  /** Nome curto — PWA e menus. */
  nomeCurto: string;
  descricao: string;
  /** Módulo correspondente na telemetria (`module_accesses.modulo`). */
  modulo: Modulo;
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
    nome: "O Sucessorista",
    nomeCurto: "Sucessorista",
    descricao:
      "Folha de trabalho do inventário: composição familiar, acervo, quinhões com fundamento legal, cofre de documentos e espelho do ITCMD-SP. Cálculo de apoio — a revisão do advogado responsável é obrigatória.",
    modulo: "SUCESSORISTA",
  },
};

/** Identidade da plataforma deste deploy. */
export const IDENTIDADE = IDENTIDADES[APP];

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
