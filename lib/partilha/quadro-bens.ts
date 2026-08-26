/**
 * QUADRO DA PARTILHA POR BEM — motor puro.
 *
 * O espelho da aba III responde "quanto cabe a cada herdeiro". Este quadro
 * responde a outra pergunta, a do balcão: "quem fica com qual fração DE QUAL
 * BEM, e quanto isso vale" — é o que vai à escritura e ao registro, e é o que
 * o orçamento completo apresenta à família.
 *
 * Duas fontes, nesta ordem:
 *  1. a MATRIZ da partilha diferenciada (`atribuicoesPct`), quando o bem tem
 *     alocação lançada — ali o escritório já disse quem fica com o quê;
 *  2. na falta dela, a FRAÇÃO IDEAL que o motor já apurou por quinhão
 *     (`fracaoBemComum`/`fracaoBemParticular`, que nos bens comuns já vêm com
 *     a meação descontada) mais a meação do(a) sobrevivente, que incide só
 *     sobre os bens COMUNS.
 *
 * A soma das linhas de um bem tem de esgotar o bem; quando não esgota (matriz
 * incompleta), a diferença sai como aviso em vez de virar uma linha
 * inventada — o quadro é conferência, não adivinhação.
 */

import type { Bem, Caso, Resultado } from './types';
import { fracaoBonita, pctNum, type Alocacoes } from './cenario';

export interface LinhaQuadroBem {
  bemId: string;
  /** Descrição do bem, como está no acervo. */
  bem: string;
  natureza: 'COMUM' | 'PARTICULAR';
  /** Valor do bem que serve de base ao quadro (o atribuído do acervo). */
  valorBem: number;
  /** Nome de quem recebe. */
  nome: string;
  /** É a meação do(a) sobrevivente (não é herança). */
  meacao: boolean;
  /** Proporção como se escreve no ato: "1/6", "50%"… */
  proporcao: string;
  /** A mesma proporção em número (0–1), para conferência e soma. */
  fracao: number;
  /** Valor da fração deste bem (arredondado ao centavo). */
  valor: number;
}

export interface QuadroPorBem {
  linhas: LinhaQuadroBem[];
  /** Bens cuja soma das frações não fecha 100% — conferir a matriz. */
  avisos: string[];
  /** Total das linhas (deve bater com a soma dos bens lançados). */
  total: number;
}

/** "1/6" → 0.1666…; devolve null quando não é fração escrita. */
function fracaoTexto(v: string | undefined): number | null {
  const m = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(v ?? '');
  if (!m) return null;
  const d = Number(m[2]);
  return d === 0 ? null : Number(m[1]) / d;
}

const cent = (v: number) => Math.round(v * 100) / 100;

/** Proporção legível: fração exata quando existe, senão percentual. */
function comoProporcao(fracao: number, textoOriginal?: string): string {
  if (textoOriginal && fracaoTexto(textoOriginal) !== null) return textoOriginal;
  const bonita = fracaoBonita(fracao * 100);
  if (bonita) return bonita;
  return `${(fracao * 100).toFixed(2).replace('.', ',')}%`;
}

/**
 * O MESMO quadro, consolidado em MATRIZ bens × participantes — uma linha por
 * bem, uma coluna por quem recebe (a meação primeiro, marcada como tal, pois
 * não é herança) e a proporção + valor na célula. É o formato do PDF do
 * orçamento completo: a lista linha a linha ficava extensa demais para
 * apresentar à família (pedido do escritório).
 */
export interface MatrizPartilha {
  /** Colunas, na ordem do ato: meação primeiro, depois herdeiros por aparição. */
  participantes: { nome: string; meacao: boolean }[];
  linhas: {
    bem: string;
    natureza: 'COMUM' | 'PARTICULAR';
    valorBem: number;
    /** Uma célula por participante; null = nada deste bem para essa coluna. */
    celulas: ({ proporcao: string; valor: number } | null)[];
  }[];
  /** Total recebido por participante (rodapé da matriz). */
  totais: number[];
}

export function matrizDoQuadro(linhas: LinhaQuadroBem[]): MatrizPartilha {
  // O(a) sobrevivente pode aparecer DUAS vezes — meação e quinhão — e são
  // colunas distintas de propósito: é como o ato descreve.
  const chave = (l: { nome: string; meacao: boolean }) => `${l.meacao ? 'M' : 'H'}|${l.nome}`;
  const participantes: { nome: string; meacao: boolean }[] = [];
  const indice = new Map<string, number>();
  for (const l of linhas.filter((x) => x.meacao)) {
    if (!indice.has(chave(l))) {
      indice.set(chave(l), participantes.length);
      participantes.push({ nome: l.nome, meacao: true });
    }
  }
  for (const l of linhas.filter((x) => !x.meacao)) {
    if (!indice.has(chave(l))) {
      indice.set(chave(l), participantes.length);
      participantes.push({ nome: l.nome, meacao: false });
    }
  }

  const porBem = new Map<string, MatrizPartilha['linhas'][number]>();
  const ordem: string[] = [];
  for (const l of linhas) {
    let linha = porBem.get(l.bemId);
    if (!linha) {
      linha = {
        bem: l.bem,
        natureza: l.natureza,
        valorBem: l.valorBem,
        celulas: participantes.map(() => null),
      };
      porBem.set(l.bemId, linha);
      ordem.push(l.bemId);
    }
    const i = indice.get(chave(l))!;
    const atual = linha.celulas[i];
    linha.celulas[i] = atual
      ? // Mesmo bem, mesma coluna, duas linhas (raro): soma os valores e
        // justapõe as proporções — nada se perde na consolidação.
        { proporcao: `${atual.proporcao} + ${l.proporcao}`, valor: cent(atual.valor + l.valor) }
      : { proporcao: l.proporcao, valor: l.valor };
  }

  const linhasMatriz = ordem.map((id) => porBem.get(id)!);
  const totais = participantes.map((_, i) =>
    cent(linhasMatriz.reduce((a, l) => a + (l.celulas[i]?.valor ?? 0), 0)),
  );
  return { participantes, linhas: linhasMatriz, totais };
}

export function montarQuadroPorBem(
  caso: Caso,
  resultado: Resultado,
  alocacoes: Alocacoes = {},
): QuadroPorBem {
  const linhas: LinhaQuadroBem[] = [];
  const avisos: string[] = [];

  // Quem é quem: a matriz guarda ids, o quadro mostra nomes.
  const nomePorId = new Map<string, string>();
  for (const h of caso.herdeiros) nomePorId.set(h.id, h.nome);
  if (caso.sobrevivente?.nome) nomePorId.set('__sobrevivente__', caso.sobrevivente.nome);

  const fracaoMeacao = fracaoTexto(resultado.meacao?.fracao ?? undefined) ?? 0.5;

  for (const bem of caso.bens as Bem[]) {
    const valorBem = Number(bem.valor) || 0;
    const comum = bem.natureza === 'COMUM';
    const daMatriz = alocacoes[bem.id] ?? {};
    const comAlocacao = Object.values(daMatriz).some((v) => pctNum(v) > 0);

    const doBem: LinhaQuadroBem[] = [];

    if (comAlocacao) {
      // 1) A matriz mandou. Normaliza pela PRÓPRIA soma (é o que a seção III
      //    faz): três células de 33,33 valem 1/3 cada, sem sobra de centavo.
      const soma = Object.values(daMatriz).reduce((a, v) => a + pctNum(v), 0);
      for (const [id, celula] of Object.entries(daMatriz)) {
        const pct = pctNum(celula);
        if (pct <= 0) continue;
        const fracao = soma > 0 ? pct / soma : 0;
        doBem.push({
          bemId: bem.id,
          bem: bem.descricao,
          natureza: comum ? 'COMUM' : 'PARTICULAR',
          valorBem,
          nome: nomePorId.get(id) ?? id,
          meacao: false,
          proporcao: comoProporcao(fracao, celula),
          fracao,
          valor: cent(valorBem * fracao),
        });
      }
    } else {
      // 2) Fração ideal. A meação só existe nos bens COMUNS.
      if (comum && resultado.meacao) {
        doBem.push({
          bemId: bem.id,
          bem: bem.descricao,
          natureza: 'COMUM',
          valorBem,
          nome: resultado.meacao.beneficiario,
          meacao: true,
          proporcao: resultado.meacao.fracao,
          fracao: fracaoMeacao,
          valor: cent(valorBem * fracaoMeacao),
        });
      }
      for (const q of resultado.quinhoes) {
        // O sobrevivente meeiro pode também herdar: as duas linhas convivem,
        // uma como meação e outra como quinhão, que é como o ato descreve.
        const texto = comum ? q.fracaoBemComum : q.fracaoBemParticular;
        const fracao = fracaoTexto(texto);
        if (fracao === null || fracao <= 0) continue;
        doBem.push({
          bemId: bem.id,
          bem: bem.descricao,
          natureza: comum ? 'COMUM' : 'PARTICULAR',
          valorBem,
          nome: q.nome,
          meacao: false,
          proporcao: texto ?? comoProporcao(fracao),
          fracao,
          valor: cent(valorBem * fracao),
        });
      }
    }

    const somaFracoes = doBem.reduce((a, l) => a + l.fracao, 0);
    if (doBem.length > 0 && Math.abs(somaFracoes - 1) > 0.005) {
      avisos.push(
        `"${bem.descricao}": as frações lançadas somam ${(somaFracoes * 100)
          .toFixed(2)
          .replace('.', ',')}% do bem — confira a partilha antes de levar ao ato.`,
      );
    }
    linhas.push(...doBem);
  }

  return {
    linhas,
    avisos,
    total: cent(linhas.reduce((a, l) => a + l.valor, 0)),
  };
}
