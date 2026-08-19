/**
 * Fusão de imóveis com MÚLTIPLAS inscrições municipais — alguns municípios
 * (ex.: Guarulhos) lançam UM imóvel em mais de uma inscrição
 * (084.33.20.0048.01.000 e 084.33.20.0048.02.000). Para o inventário é UM
 * bem só: os valores venais se SOMAM e os atos de registro contam uma vez.
 *
 * Motor puro (com testes): funde bens lidos da pasta quando a MATRÍCULA é a
 * mesma ou quando as inscrições compartilham a base (os quatro primeiros
 * grupos), somando valores e listando as inscrições no imóvel resultante.
 */

interface DetalhesFundiveis {
  matricula?: string | null;
  inscricaoCadastral?: string | null;
  valorVenalObito?: string | null;
  valorVenalAtual?: string | null;
  /** Fração ideal (%) da inscrição — na fusão as frações se SOMAM. */
  fracaoIdeal?: string | null;
}

export interface BemFundivel {
  descricao: string;
  valor: string | null;
  tipo?: string | null;
  imovel?: DetalhesFundiveis | null;
}

const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/** Base da inscrição municipal: os 4 primeiros grupos (sem a sub-inscrição). */
export function baseDaInscricao(inscricao: string | null | undefined): string | null {
  if (!inscricao) return null;
  const grupos = inscricao.replace(/[^\d.]/g, '').split('.').filter(Boolean);
  if (grupos.length < 5) return null; // sem sub-inscrição aparente
  return grupos.slice(0, 4).join('.');
}

function somar(a: string | null | undefined, b: string | null | undefined): string | null {
  const na = a ? Number(a) : null;
  const nb = b ? Number(b) : null;
  if (na !== null && Number.isFinite(na) && nb !== null && Number.isFinite(nb))
    return (na + nb).toFixed(2);
  return a ?? b ?? null;
}

/**
 * Funde imóveis que são o MESMO bem (matrícula igual ou base de inscrição
 * igual): o primeiro vira o principal, valores somam, inscrições se listam.
 */
export function fundirImoveisPorInscricao<T extends BemFundivel>(bens: T[]): T[] {
  const saida: T[] = [];
  for (const bem of bens) {
    const ehImovel = bem.tipo === 'IMOVEL' || Boolean(bem.imovel);
    const matricula = soDigitos(bem.imovel?.matricula);
    const base = baseDaInscricao(bem.imovel?.inscricaoCadastral);
    const principal = ehImovel
      ? saida.find((s) => {
          if (s.tipo !== 'IMOVEL' && !s.imovel) return false;
          const matS = soDigitos(s.imovel?.matricula);
          if (matricula.length >= 3 && matS.length >= 3) return matricula === matS;
          const baseS = baseDaInscricao(s.imovel?.inscricaoCadastral);
          return base !== null && baseS !== null && base === baseS;
        })
      : undefined;
    if (!principal) {
      saida.push(bem);
      continue;
    }
    const im: Record<string, unknown> = { ...((principal.imovel ?? {}) as Record<string, unknown>) };
    const inscricaoAtual = im.inscricaoCadastral as string | null | undefined;
    const outraInscricao = bem.imovel?.inscricaoCadastral;
    // MESMO LANÇAMENTO (a MESMA inscrição municipal nos dois): não é fração
    // do imóvel, são certidões do MESMO cadastro em EXERCÍCIOS diferentes (a
    // rotina do balcão: venal do ano do óbito + venal do exercício corrente).
    // Nada se SOMA — cada certidão preenche o campo vazio do seu exercício e
    // a fração fica a MAIOR informada. (Sem inscrição dos dois lados, vale a
    // soma: unidades distintas numa mesma matrícula, como apto + vaga.)
    const insA = soDigitos(inscricaoAtual);
    const insB = soDigitos(outraInscricao);
    const mesmoLancamento = insA.length > 0 && insA === insB;
    if (mesmoLancamento) {
      principal.valor = principal.valor ?? bem.valor;
      if (!im.valorVenalObito && bem.imovel?.valorVenalObito)
        im.valorVenalObito = bem.imovel.valorVenalObito;
      if (!im.valorVenalAtual && bem.imovel?.valorVenalAtual)
        im.valorVenalAtual = bem.imovel.valorVenalAtual;
      const frA = Number(im.fracaoIdeal ?? 0);
      const frB = Number(bem.imovel?.fracaoIdeal ?? 0);
      if (Number.isFinite(frB) && frB > (Number.isFinite(frA) ? frA : 0))
        im.fracaoIdeal = bem.imovel?.fracaoIdeal ?? im.fracaoIdeal;
    } else {
      /* inscrições DIFERENTES do mesmo imóvel (sub-inscrições): soma os
         valores e lista as inscrições — um ato de registro, não dois */
      principal.valor = somar(principal.valor, bem.valor);
      if (outraInscricao && inscricaoAtual && !inscricaoAtual.includes(outraInscricao)) {
        im.inscricaoCadastral = `${inscricaoAtual} e ${outraInscricao}`;
      } else if (outraInscricao && !inscricaoAtual) {
        im.inscricaoCadastral = outraInscricao;
      }
      im.valorVenalObito = somar(im.valorVenalObito as string | null, bem.imovel?.valorVenalObito);
      im.valorVenalAtual = somar(im.valorVenalAtual as string | null, bem.imovel?.valorVenalAtual);
      im.fracaoIdeal = somar(im.fracaoIdeal as string | null, bem.imovel?.fracaoIdeal);
    }
    /* demais campos: preenche o que o principal ainda não tem */
    for (const [k, v] of Object.entries((bem.imovel ?? {}) as Record<string, unknown>)) {
      if (v !== null && v !== undefined && v !== '' && (im[k] === null || im[k] === undefined || im[k] === '')) {
        im[k] = v;
      }
    }
    principal.imovel = im as unknown as T['imovel'];
  }
  return saida;
}
