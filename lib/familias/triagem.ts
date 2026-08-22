/**
 * Triagem da via do inventário — MOTOR PURO da área "Para famílias".
 *
 * Regras (as mesmas do motor de elegibilidade do módulo, ditas em linguagem
 * leiga): testamento, herdeiro menor/incapaz ou falta de consenso levam ao
 * JUDICIAL como regra prática — com as ressalvas honestas (testamento com
 * autorização do juiz, Res. 35/CNJ e provimentos estaduais; incapaz em
 * cartório com o Ministério Público, Res. 571/2024 do CNJ) SEM prometer.
 * Acervo pequeno sem imóvel aponta o ALVARÁ da Lei 6.858/80.
 *
 * Testes: npx tsx lib/familias/triagem.test.ts
 */

import { LIMITES_FAIXA, type RespostasFamilia } from './tipos';

export type ViaIndicada = 'EXTRAJUDICIAL' | 'JUDICIAL' | 'ALVARA';

export interface Triagem {
  via: ViaIndicada;
  /** Por que essa via, em frases leigas (a ordem importa: a mais forte primeiro). */
  motivos: string[];
  /** Ressalvas e possibilidades — nunca promessas. */
  observacoes: string[];
  /** Acervo pequeno sem imóvel (marcador para o Radar e para o resultado). */
  pequenoValor: boolean;
}

/** Soma das faixas em R$ — {min, max} do acervo declarado. */
export function faixaDoAcervo(r: RespostasFamilia): { min: number; max: number } {
  let min = 0;
  let max = 0;
  for (const f of [r.bens.imoveis, r.bens.veiculos, r.bens.financeiro, r.bens.outros]) {
    if (!f) continue;
    min += LIMITES_FAIXA[f].min;
    max += LIMITES_FAIXA[f].max;
  }
  return { min, max };
}

export function classificarVia(r: RespostasFamilia): Triagem {
  const motivos: string[] = [];
  const observacoes: string[] = [];

  const temImovel = r.bens.imoveis !== null;
  const acervo = faixaDoAcervo(r);

  /* ---------- caminho do alvará (Lei 6.858/80) ---------- */
  // Só valores em dinheiro (saldos, FGTS/PIS, verbas a receber) e, no máximo,
  // um veículo de baixo valor — sem imóvel e sem empresa: pode nem precisar
  // de inventário completo.
  const soDinheiroEVeiculoPequeno =
    !temImovel &&
    !r.bens.empresa &&
    r.bens.outros === null &&
    (r.bens.veiculos === null || r.bens.veiculos === 'ate-50');
  const pequenoValor = soDinheiroEVeiculoPequeno && acervo.max <= 100_000;

  if (pequenoValor && r.bens.financeiro !== null) {
    motivos.push(
      'Os bens são basicamente valores em dinheiro (saldos, FGTS, PIS, verbas a receber)' +
        (r.bens.veiculos ? ' e um veículo de baixo valor' : '') +
        ' — para isso a lei tem um caminho mais curto e barato que o inventário completo: o alvará judicial (Lei 6.858/80).',
    );
    observacoes.push(
      'O alvará é um pedido simples ao juiz para liberar esses valores aos herdeiros. Um advogado confirma se o seu caso cabe nele — depende dos valores exatos e do que mais existir.',
    );
    if (r.menorOuIncapaz === 'sim') {
      observacoes.push(
        'Com herdeiro menor de idade ou incapaz, o juiz ouve o Ministério Público antes de liberar os valores.',
      );
    }
    return { via: 'ALVARA', motivos, observacoes, pequenoValor: true };
  }

  /* ---------- judicial × extrajudicial ---------- */
  let judicial = false;

  if (r.testamento === 'sim') {
    judicial = true;
    motivos.push(
      'Havia testamento — a regra geral é que o inventário com testamento passe pelo juiz.',
    );
    observacoes.push(
      'Em muitos estados, com todos os herdeiros maiores e de acordo, dá para fazer em cartório mesmo com testamento, depois de uma autorização do juiz que cuida do testamento (Resolução 35 do CNJ e normas estaduais). Um advogado avalia se cabe no seu caso.',
    );
  } else if (r.testamento === 'nao-sei') {
    observacoes.push(
      'Vale pedir uma certidão de testamento (busca no colégio notarial) antes de decidir a via — se aparecer um testamento, o caminho muda.',
    );
  }

  if (r.menorOuIncapaz === 'sim') {
    judicial = true;
    motivos.push(
      'Há herdeiro menor de idade ou incapaz — o caminho usual é o judicial, para que o juiz proteja a parte dele.',
    );
    observacoes.push(
      'Desde 2024 existe a possibilidade de fazer em cartório mesmo com menor ou incapaz, com a participação do Ministério Público e a parte dele preservada (Resolução 571/2024 do CNJ) — um advogado avalia se o seu caso se encaixa.',
    );
  }

  if (r.consenso === 'nao') {
    judicial = true;
    motivos.push(
      'Nem todos concordam com a divisão — sem acordo de todos, o inventário é decidido pelo juiz.',
    );
    observacoes.push(
      'Se a família chegar a um acordo no caminho, é possível migrar para a via de cartório, que costuma ser mais rápida e barata.',
    );
  } else if (r.consenso === 'nao-conversamos') {
    observacoes.push(
      'A via de cartório exige que TODOS os herdeiros assinem de acordo. Vale conversar antes: com consenso, o processo fica bem mais rápido e barato.',
    );
  }

  if (r.herdeiroExterior === 'sim') {
    observacoes.push(
      'Herdeiro fora do país não impede a via de cartório: ele pode assinar por procuração feita no consulado ou por videoconferência (e-Notariado). Só precisa de organização a mais.',
    );
  }

  if (judicial) {
    return { via: 'JUDICIAL', motivos, observacoes, pequenoValor: false };
  }

  motivos.push(
    'Sem testamento, com todos os herdeiros maiores e de acordo, o inventário pode ser feito em CARTÓRIO (escritura pública) — sem processo judicial, normalmente em semanas em vez de anos.',
  );
  motivos.push('Mesmo em cartório, a lei exige um advogado assinando com a família (CPC, art. 610).');
  return { via: 'EXTRAJUDICIAL', motivos, observacoes, pequenoValor: false };
}
