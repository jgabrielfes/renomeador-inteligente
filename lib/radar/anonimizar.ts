/**
 * Radar de herdeiros — ANONIMIZAÇÃO do caso publicado. MOTOR PURO com testes
 * anti-vazamento (o contrato central da etapa: o advogado NUNCA vê nome,
 * e-mail, telefone, nome do falecido nem o token de gestão da família).
 *
 * O objeto é RECONSTRUÍDO campo a campo (allowlist), como nos snapshots do
 * portal: o que não está declarado aqui não existe para o advogado.
 */

import type { RespostasFamilia } from '@/lib/familias/tipos';
import { classificarVia, faixaDoAcervo, type ViaIndicada } from '@/lib/familias/triagem';

export interface CasoAnonimo {
  /** Id do INTAKE (não é credencial — o tokenGestao nunca sai). */
  id: string;
  /** Onde a família está — só cidade e UF. */
  uf: string;
  cidade: string;
  /** UFs dos bens imóveis (competência do ITCMD). */
  ufsBens: string[];
  via: ViaIndicada;
  /** Faixa LEIGA do acervo declarado (nunca os valores por classe). */
  faixaAcervo: string;
  qtdHerdeiros: number;
  flags: {
    testamento: boolean;
    menorOuIncapaz: boolean;
    semConsenso: boolean;
    herdeiroExterior: boolean;
    empresa: boolean;
    dividas: boolean;
    pequenoValor: boolean;
  };
  /** ISO yyyy-mm-dd da publicação. */
  publicadoEm: string;
}

const kMil = (v: number) =>
  v >= 1_000_000
    ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
    : `R$ ${Math.round(v / 1_000)} mil`;

/** Faixa leiga do acervo: "R$ 210 mil a R$ 550 mil". */
export function rotuloFaixaAcervo(r: RespostasFamilia): string {
  const f = faixaDoAcervo(r);
  if (f.max <= 0) return 'não informado';
  return `${kMil(f.min)} a ${kMil(f.max)}`;
}

export function anonimizarIntake(entrada: {
  id: string;
  respostas: RespostasFamilia;
  pequenoValor: boolean;
  /** ISO da publicação — vem de fora (motor puro). */
  publicadoEm: string;
}): CasoAnonimo {
  const r = entrada.respostas;
  const triagem = classificarVia(r);
  return {
    id: entrada.id,
    uf: r.ufFamilia || r.ufFalecido,
    cidade: r.cidade,
    ufsBens: [...new Set([r.ufFalecido, ...r.bens.imoveisUfs])],
    via: triagem.via,
    faixaAcervo: rotuloFaixaAcervo(r),
    qtdHerdeiros: r.qtdHerdeiros,
    flags: {
      testamento: r.testamento !== 'nao',
      menorOuIncapaz: r.menorOuIncapaz === 'sim',
      semConsenso: r.consenso !== 'sim',
      herdeiroExterior: r.herdeiroExterior === 'sim',
      empresa: r.bens.empresa,
      dividas: r.dividas === 'sim',
      pequenoValor: entrada.pequenoValor,
    },
    publicadoEm: entrada.publicadoEm.slice(0, 10),
  };
}
