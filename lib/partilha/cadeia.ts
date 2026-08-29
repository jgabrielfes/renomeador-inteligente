/**
 * CADEIA das sucessões cumuladas — MOTOR PURO.
 *
 * Calibrado por cinco escrituras REAIS do balcão (CUTOLO, MOMBACH, VALDOMIRO,
 * DIORIPES e XAVIER DA SILVA): o que define o MONTE da sucessão seguinte é o
 * VÍNCULO do(a) novo(a) falecido(a) com a cadeia —
 *
 *  - MEEIRO(A): era cônjuge/companheiro(a) meeiro(a) do falecimento anterior
 *    (o padrão marido e mulher). Transita a MEAÇÃO: 50% de cada bem comum.
 *  - HERDEIRO(A): era herdeiro(a) do falecimento anterior (pai e filho).
 *    Transita a fração HERDADA: o partível daquela sucessão ÷ nº de herdeiros
 *    (ex.: 7 filhos sem meação → 1/7 por cabeça — o monte do filho falecido).
 *  - MANCOMUNHEIRO(A): ex-cônjuge com divórcio SEM partilha (mancomunhão).
 *    Transita METADE do monte do falecimento anterior (1/7 → 1/14).
 *  - NENHUM: sem vínculo patrimonial com a cadeia — a sucessão vive de bens
 *    particulares, lançados à parte (fração sugerida não se aplica).
 *
 * E o partível de uma sucessão para os herdeiros DELA cai pela metade quando
 * alguém posterior aponta para ela como meeiro(a)/mancomunheiro(a) — a meação
 * sai antes da legítima (CUTOLO: monte 1/7, mancomunheira 1/14, legítima 1/14).
 *
 * A fração é SUGESTÃO editável (a coluna de fração do acervo sempre vence):
 * quem herdou em MAIS de uma sucessão anterior (MOMBACH: a filha herdou da mãe
 * e do pai) acumula frações que este motor não soma sozinho — o aviso da UI
 * manda conferir.
 *
 * Testes: npx tsx lib/partilha/cadeia.test.ts
 */

export type VinculoSucessao = 'meeiro' | 'herdeiro' | 'mancomunheiro' | 'nenhum';

export const ROTULOS_VINCULO: Record<VinculoSucessao, string> = {
  meeiro: 'Cônjuge/companheiro(a) meeiro(a)',
  herdeiro: 'Herdeiro(a) do falecimento anterior',
  mancomunheiro: 'Ex-cônjuge em mancomunhão',
  nenhum: 'Sem vínculo patrimonial',
};

export interface EloCadeia {
  id: string;
  /** Vínculo do(a) autor(a) desta sucessão com a cadeia (padrão: meeiro). */
  vinculo?: VinculoSucessao;
  /** Id da sucessão anterior a que o vínculo se refere ('PRINCIPAL' ou o id
   *  de outra sucessão). Ausente = o elo imediatamente anterior. */
  vinculoCom?: string;
  /** Quantos herdam NESTA sucessão (para a fração por cabeça dela). */
  nHerdeiros: number;
}

export interface FracaoDaCadeia {
  /** Fração de cada bem COMUM que transita nesta sucessão (0..1). */
  fracaoMonte: number;
  /** Fração por herdeiro DESTA sucessão (monte partível ÷ nº herdeiros). */
  fracaoPorHerdeiro: number;
  /** Explicação leiga da fração sugerida ("meação de 50% dos bens comuns"…). */
  explicacao: string;
}

export const ID_PRINCIPAL = 'PRINCIPAL';

/** "1/7" quando a fração fecha bonita; senão "14,29%". */
export function fracaoDaCadeiaBonita(fracao: number): string {
  if (fracao <= 0) return '0%';
  for (let d = 1; d <= 64; d++) {
    const n = fracao * d;
    if (Math.abs(n - Math.round(n)) < 1e-9 && Math.round(n) >= 1) {
      const num = Math.round(n);
      return d === 1 ? '100%' : `${num}/${d}`;
    }
  }
  return `${(fracao * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/**
 * Frações sugeridas de TODA a cadeia, por id de sucessão.
 *
 * `meacaoNaPrincipal` = a 1ª sucessão tem cônjuge/companheiro(a) meeiro(a)
 * (o partível dela já sai de 50%); `nHerdeirosPrincipal` = herdeiros da 1ª.
 * As sucessões vêm NA ORDEM dos óbitos (a ordem do lançamento).
 */
export function fracoesDaCadeia(entrada: {
  sucessoes: EloCadeia[];
  nHerdeirosPrincipal: number;
  meacaoNaPrincipal: boolean;
}): Record<string, FracaoDaCadeia> {
  const { sucessoes, nHerdeirosPrincipal, meacaoNaPrincipal } = entrada;
  const resultado: Record<string, FracaoDaCadeia> = {};

  // Alguém posterior tira meação/mancomunhão DESTE elo? A legítima dele cai
  // pela metade (a meação sai antes da partilha).
  const alvoDe = (id: string): boolean =>
    sucessoes.some((s, i) => {
      const alvo = s.vinculoCom ?? (i === 0 ? ID_PRINCIPAL : sucessoes[i - 1].id);
      return (
        alvo === id && (s.vinculo === 'meeiro' || s.vinculo === 'mancomunheiro') && s.id !== id
      );
    });

  const fracaoMonteDe = (id: string): number => {
    if (id === ID_PRINCIPAL) return 1;
    return resultado[id]?.fracaoMonte ?? 1;
  };

  const porHerdeiroDe = (id: string): number => {
    if (id === ID_PRINCIPAL) {
      const partivel = meacaoNaPrincipal || alvoDe(ID_PRINCIPAL) ? 0.5 : 1;
      return partivel / Math.max(1, nHerdeirosPrincipal);
    }
    const elo = sucessoes.find((s) => s.id === id);
    const partivel = fracaoMonteDe(id) * (alvoDe(id) ? 0.5 : 1);
    return partivel / Math.max(1, elo?.nHerdeiros ?? 1);
  };

  sucessoes.forEach((su, i) => {
    const vinculo = su.vinculo ?? 'meeiro';
    const anterior = su.vinculoCom ?? (i === 0 ? ID_PRINCIPAL : sucessoes[i - 1].id);
    let fracaoMonte = 1;
    let explicacao = '';
    if (vinculo === 'meeiro') {
      fracaoMonte = 0.5;
      explicacao = 'meação de 50% de cada bem comum do casal';
    } else if (vinculo === 'herdeiro') {
      fracaoMonte = porHerdeiroDe(anterior);
      explicacao = `fração herdada no falecimento anterior (${fracaoDaCadeiaBonita(fracaoMonte)} de cada bem)`;
    } else if (vinculo === 'mancomunheiro') {
      fracaoMonte = fracaoMonteDe(anterior) / 2;
      explicacao = `metade da mancomunhão sobre o quinhão do falecimento anterior (${fracaoDaCadeiaBonita(fracaoMonte)} de cada bem)`;
    } else {
      fracaoMonte = 0;
      explicacao = 'sem vínculo com a cadeia — a base sai só dos bens particulares desta sucessão';
    }
    const partivel = fracaoMonte * (alvoDe(su.id) ? 0.5 : 1);
    resultado[su.id] = {
      fracaoMonte,
      fracaoPorHerdeiro: partivel / Math.max(1, su.nHerdeiros),
      explicacao,
    };
  });

  return resultado;
}
