/**
 * Sanitização das respostas do questionário — o SERVIDOR nunca confia no
 * corpo enviado: reconstrói o objeto campo a campo (enums validados, textos
 * limitados) e RECALCULA triagem e estimativas com os motores puros. Devolve
 * null quando o mínimo (UF do falecido, data e algum bem) não está presente.
 */

import { UFS, type FaixaValor, type RespostasFamilia } from './tipos';

const FAIXAS: FaixaValor[] = ['ate-50', '50-200', '200-500', '500-1000', '1000-2000', 'acima-2000'];

const uf = (v: unknown): string =>
  typeof v === 'string' && (UFS as readonly string[]).includes(v.toUpperCase())
    ? v.toUpperCase()
    : '';

const faixa = (v: unknown): FaixaValor | null =>
  typeof v === 'string' && (FAIXAS as string[]).includes(v) ? (v as FaixaValor) : null;

const opcao = <T extends string>(v: unknown, opcoes: readonly T[], padrao: T): T =>
  typeof v === 'string' && (opcoes as readonly string[]).includes(v) ? (v as T) : padrao;

const texto = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const dataIso = (v: unknown): string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '';

export function sanitizarRespostas(bruto: unknown): RespostasFamilia | null {
  if (!bruto || typeof bruto !== 'object') return null;
  const b = bruto as Record<string, unknown>;
  const bens = (b.bens ?? {}) as Record<string, unknown>;
  const r: RespostasFamilia = {
    ufFalecido: uf(b.ufFalecido),
    dataObito: dataIso(b.dataObito),
    testamento: opcao(b.testamento, ['sim', 'nao', 'nao-sei'] as const, 'nao'),
    vinculo: opcao(b.vinculo, ['nao', 'casado', 'uniao-estavel'] as const, 'nao'),
    regime: opcao(
      b.regime,
      ['', 'comunhao-parcial', 'comunhao-universal', 'separacao', 'nao-sei'] as const,
      '',
    ),
    qtdHerdeiros: Math.min(30, Math.max(1, Number(b.qtdHerdeiros) || 1)),
    menorOuIncapaz: opcao(b.menorOuIncapaz, ['sim', 'nao'] as const, 'nao'),
    consenso: opcao(b.consenso, ['sim', 'nao', 'nao-conversamos'] as const, 'sim'),
    bens: {
      imoveis: faixa(bens.imoveis),
      imoveisUfs: Array.isArray(bens.imoveisUfs)
        ? bens.imoveisUfs.map(uf).filter((x) => x !== '').slice(0, 27)
        : [],
      veiculos: faixa(bens.veiculos),
      financeiro: faixa(bens.financeiro),
      empresa: bens.empresa === true,
      outros: faixa(bens.outros),
    },
    dividas: opcao(b.dividas, ['sim', 'nao'] as const, 'nao'),
    herdeiroExterior: opcao(b.herdeiroExterior, ['sim', 'nao'] as const, 'nao'),
    jaTemAdvogado: opcao(b.jaTemAdvogado, ['sim', 'nao'] as const, 'nao'),
    cidade: texto(b.cidade, 120),
    ufFamilia: uf(b.ufFamilia) || uf(b.ufFalecido),
    nome: texto(b.nome, 80),
    email: texto(b.email, 200),
  };
  // Mínimo para um resultado fazer sentido.
  const temBem =
    r.bens.imoveis !== null ||
    r.bens.veiculos !== null ||
    r.bens.financeiro !== null ||
    r.bens.outros !== null ||
    r.bens.empresa;
  if (!r.ufFalecido || !r.dataObito || !temBem) return null;
  return r;
}
