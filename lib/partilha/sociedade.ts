/**
 * Participação societária no inventário.
 *
 * O contrato social diz QUEM tem quantas quotas; o balanço diz quanto a
 * empresa vale por dentro (patrimônio líquido). A avaliação das quotas para
 * o acervo segue a prática do ITCMD-SP (Lei 10.705/2000, art. 14, § 3º —
 * valor patrimonial para participação sem negociação em bolsa; a LC 227/2026
 * aponta para valor de mercado com PL ajustado): base = o MAIOR entre o
 * patrimônio líquido e o capital social, proporcional ao percentual do(a)
 * falecido(a) — ou do CASAL, quando o regime comunica as quotas.
 *
 * Motor puro: entra a sociedade extraída dos documentos + nomes/regime da
 * folha, sai o bem calculado com fundamento e avisos. Nada aqui é verdade
 * absoluta — a UI repete que é para conferir.
 */

import type { Natureza, Regime } from './types';

export interface SocioExtraido {
  nome: string;
  /** Percentual do capital (0–100). */
  percentual: number | null;
}

export interface SociedadeExtraida {
  empresa: string;
  cnpj: string | null;
  /** Decimais em string ("500000.00"), como o resto do módulo. */
  capitalSocial: string | null;
  patrimonioLiquido: string | null;
  socios: SocioExtraido[];
}

export interface AvaliacaoQuotas {
  /** Valor do bem para o acervo (decimal em string). */
  valor: string;
  natureza: Natureza;
  /** Percentual considerado (0–100). */
  percentual: number;
  /** Base usada (decimal em string) e qual venceu. */
  base: string;
  fonteBase: 'PATRIMONIO_LIQUIDO' | 'CAPITAL_SOCIAL';
  descricao: string;
  /** Quem entrou na conta. */
  titulares: string[];
  avisos: string[];
}

/** Chave estável da sociedade para mesclar leituras de lotes diferentes. */
export function chaveSociedade(empresa: string): string {
  return empresa
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function nomesBatem(a: string, b: string): boolean {
  const na = chaveSociedade(a);
  const nb = chaveSociedade(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

/** Mescla duas leituras da MESMA sociedade (contrato num lote, balanço noutro). */
export function mesclarSociedade(
  atual: SociedadeExtraida,
  nova: SociedadeExtraida,
): SociedadeExtraida {
  const socios = [...atual.socios];
  for (const s of nova.socios) {
    const existente = socios.find((x) => nomesBatem(x.nome, s.nome));
    if (!existente) socios.push(s);
    else if (existente.percentual === null && s.percentual !== null) {
      existente.percentual = s.percentual;
    }
  }
  return {
    empresa: atual.empresa || nova.empresa,
    cnpj: atual.cnpj ?? nova.cnpj,
    capitalSocial: atual.capitalSocial ?? nova.capitalSocial,
    patrimonioLiquido: atual.patrimonioLiquido ?? nova.patrimonioLiquido,
    socios,
  };
}

/**
 * Avalia as quotas para o acervo. Devolve null quando nem o(a) falecido(a)
 * nem (quando aplicável) o cônjuge constam do quadro de sócios — aí não há
 * bem a lançar, só conferência manual.
 */
export function avaliarQuotas(
  s: SociedadeExtraida,
  nomeFalecido: string,
  /** Nome do cônjuge/companheiro(a) — vazio quando não há. */
  nomeConjuge: string,
  regime: Regime,
): AvaliacaoQuotas | null {
  if (!nomeFalecido.trim()) return null;

  const avisos: string[] = [];

  // Regimes de comunhão comunicam as quotas do casal (sociedade conjugal);
  // separações deixam só as quotas do próprio falecido.
  const comunhao = regime === 'COMUNHAO_PARCIAL' || regime === 'COMUNHAO_UNIVERSAL';

  const doFalecido = s.socios.find((x) => nomesBatem(x.nome, nomeFalecido));
  const doConjuge =
    comunhao && nomeConjuge.trim()
      ? s.socios.find((x) => nomesBatem(x.nome, nomeConjuge) && x !== doFalecido)
      : undefined;

  if (!doFalecido && !doConjuge) return null;

  let percentual = 0;
  const titulares: string[] = [];
  for (const socio of [doFalecido, doConjuge]) {
    if (!socio) continue;
    if (socio.percentual === null) {
      avisos.push(`Sócio(a) ${socio.nome}: percentual não legível no contrato social — confira.`);
      continue;
    }
    percentual += socio.percentual;
    titulares.push(socio.nome);
  }
  if (percentual <= 0 || percentual > 100) return null;

  const capital = s.capitalSocial ? Number(s.capitalSocial) : 0;
  const pl = s.patrimonioLiquido ? Number(s.patrimonioLiquido) : 0;
  if (capital <= 0 && pl <= 0) return null;

  const usaPl = pl >= capital;
  const base = usaPl ? pl : capital;
  if (!s.patrimonioLiquido) {
    avisos.push(
      'Sem balanço patrimonial legível: base pelo capital social. Junte o balanço — se o patrimônio líquido for maior, a base sobe.',
    );
  }
  if (pl > 0 && pl < capital) {
    avisos.push(
      'Patrimônio líquido menor que o capital social: a base ficou no capital social (o maior dos dois). O Fisco pode exigir PL ajustado a mercado (LC 227/2026).',
    );
  }

  const valor = (base * percentual) / 100;

  // Natureza: comunhão comunica (comum); separação mantém particular.
  // Na comunhão parcial a presunção é aquisição na constância — ajustável.
  const natureza: Natureza = comunhao ? 'COMUM' : 'PARTICULAR';
  if (regime === 'COMUNHAO_PARCIAL') {
    avisos.push(
      'Comunhão parcial: quotas presumidas adquiridas na constância (bem comum). Se forem anteriores ao casamento ou de herança/doação, edite a natureza para particular.',
    );
  }

  const fonte = usaPl ? 'patrimônio líquido' : 'capital social';
  return {
    valor: valor.toFixed(2),
    natureza,
    percentual,
    base: base.toFixed(2),
    fonteBase: usaPl ? 'PATRIMONIO_LIQUIDO' : 'CAPITAL_SOCIAL',
    descricao: `Quotas da ${s.empresa}${s.cnpj ? ` (CNPJ ${s.cnpj})` : ''} — ${percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% sobre ${fonte} de R$ ${base.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
    titulares,
    avisos,
  };
}
