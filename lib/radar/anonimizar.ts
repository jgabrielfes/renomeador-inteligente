/**
 * Radar de herdeiros — ANONIMIZAÇÃO do caso publicado. MOTOR PURO com testes
 * anti-vazamento (o contrato central da etapa: o advogado NUNCA vê nome,
 * e-mail, telefone, nome do falecido nem o token de gestão da família).
 *
 * O objeto é RECONSTRUÍDO campo a campo (allowlist), como nos snapshots do
 * portal: o que não está declarado aqui não existe para o advogado.
 */

import { ROTULO_FAIXA, type RespostasFamilia } from '@/lib/familias/tipos';
import { classificarVia, faixaDoAcervo, type ViaIndicada } from '@/lib/familias/triagem';

/** Uma resposta do questionário, pronta para exibir: rótulo curto + valor. */
export interface LinhaResposta {
  rotulo: string;
  valor: string;
}

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
  /**
   * As DEMAIS respostas do questionário, em linhas curtas e na ordem em que
   * foram perguntadas — o que as `flags` acima não cobrem (quando foi o
   * falecimento, o vínculo e o regime, os bens classe a classe, se já há
   * advogado). Juntas, `flags` + `respostas` cobrem as 12 perguntas: as
   * flags são a linha escaneável, estas são o detalhe.
   *
   * Linha sem conteúdo não entra — a publicação fica enxuta.
   */
  respostas: LinhaResposta[];
  /**
   * O texto livre que a família escreveu ("quer explicar algo?").
   *
   * ATENÇÃO — este campo é a exceção deliberada ao resto do módulo: tudo aqui
   * é reconstruído por allowlist justamente para não deixar passar nada que
   * identifique, e um campo livre pode conter qualquer coisa (o nome do
   * irmão, o endereço da casa). Ele ficou FORA do Radar por muito tempo por
   * esse motivo. Entrou por decisão do escritório, e a contrapartida é o
   * CONSENTIMENTO: a família é avisada no próprio campo e de novo no diálogo
   * de publicação de que estas linhas vão aos advogados. Nunca publicar isto
   * sem esse aviso na tela.
   */
  observacoes: string;
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

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/**
 * Quando foi o falecimento — em MÊS/ANO e no tempo decorrido, nunca no dia
 * exato.
 *
 * O advogado precisa do relógio (art. 611 do CPC, multa do ITCMD), e isso o
 * mês resolve. Já o dia exato somado à cidade é chave de busca: obituário e
 * cartório são públicos, e a família que se publicou como anônima deixaria de
 * ser. É a mesma disciplina das faixas de valor — informação suficiente para
 * decidir, insuficiente para identificar.
 */
function quandoFaleceu(iso: string, hojeIso: string): string {
  const [a, m, d] = iso.split('-').map(Number);
  if (!a || !m || !d) return '';
  const mesAno = `${MESES[m - 1]}/${a}`;
  const dias = Math.floor(
    (Date.parse(`${hojeIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) / 86_400_000,
  );
  if (!Number.isFinite(dias) || dias < 0) return mesAno;
  const meses = Math.floor(dias / 30);
  const quanto =
    dias < 60
      ? `há ${dias} dias`
      : meses < 24
        ? `há ${meses} meses`
        : `há ${Math.floor(meses / 12)} anos`;
  return `${mesAno} (${quanto})`;
}

const ROTULO_REGIME: Record<string, string> = {
  'comunhao-parcial': 'comunhão parcial',
  'comunhao-universal': 'comunhão universal',
  separacao: 'separação de bens',
  'nao-sei': 'regime não informado',
};

/** "Imóveis R$ 210 mil a R$ 550 mil (SP, RJ) · Veículos até R$ 50 mil" */
function bensPorClasse(r: RespostasFamilia): string {
  const b = r.bens;
  const partes: string[] = [];
  if (b.imoveis) {
    const ufs = b.imoveisUfs.length > 0 ? ` (${b.imoveisUfs.join(', ')})` : '';
    partes.push(`imóveis ${ROTULO_FAIXA[b.imoveis]}${ufs}`);
  }
  if (b.veiculos) partes.push(`veículos ${ROTULO_FAIXA[b.veiculos]}`);
  if (b.financeiro) partes.push(`contas/investimentos ${ROTULO_FAIXA[b.financeiro]}`);
  if (b.empresaValor) partes.push(`empresa ${ROTULO_FAIXA[b.empresaValor]}`);
  else if (b.empresa) partes.push('empresa (valor não informado)');
  if (b.outros) partes.push(`outros ${ROTULO_FAIXA[b.outros]}`);
  return partes.join(' · ');
}

/**
 * As respostas que as `flags` não cobrem, em linhas curtas.
 *
 * O que já é chip lá em cima (testamento, menor/incapaz, falta de consenso,
 * herdeiro no exterior, empresa, dívidas) NÃO se repete aqui — a publicação
 * tem de caber num cartão.
 */
function linhasDasRespostas(r: RespostasFamilia, hojeIso: string): LinhaResposta[] {
  const linhas: LinhaResposta[] = [];

  const quando = r.dataObito ? quandoFaleceu(r.dataObito, hojeIso) : '';
  if (quando) linhas.push({ rotulo: 'Falecimento', valor: `${quando} · domicílio ${r.ufFalecido}` });

  if (r.vinculo === 'casado') {
    linhas.push({
      rotulo: 'Cônjuge',
      valor: `casado(a) — ${ROTULO_REGIME[r.regime] ?? 'regime não informado'}`,
    });
  } else if (r.vinculo === 'uniao-estavel') {
    linhas.push({
      rotulo: 'Companheiro(a)',
      valor: `união estável — ${ROTULO_REGIME[r.regime] ?? 'regime não informado'}`,
    });
  } else {
    linhas.push({ rotulo: 'Cônjuge', valor: 'não havia cônjuge nem companheiro(a)' });
  }

  const bens = bensPorClasse(r);
  if (bens) linhas.push({ rotulo: 'Bens declarados', valor: bens });

  // Sempre "ainda não" na prática (o convite do Radar não é oferecido a quem
  // já tem advogado constituído) — e é exatamente por isso que a linha vale:
  // confirma ao(à) profissional que o caso não é de cliente alheio.
  linhas.push({
    rotulo: 'Advogado(a) constituído(a)',
    valor: r.jaTemAdvogado === 'sim' ? 'sim' : 'ainda não',
  });

  return linhas;
}

export function anonimizarIntake(entrada: {
  id: string;
  respostas: RespostasFamilia;
  pequenoValor: boolean;
  /** ISO da publicação — vem de fora (motor puro). */
  publicadoEm: string;
  /**
   * ISO de HOJE, para o "há quanto tempo" do falecimento. Injetado de fora
   * pela mesma razão de sempre (o motor não chama Date.now()); omitido, vale
   * a data da publicação — o caso expira em 90 dias, então o desvio é
   * pequeno, mas quem tem a data certa deve passá-la.
   */
  hoje?: string;
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
    respostas: linhasDasRespostas(r, (entrada.hoje ?? entrada.publicadoEm).slice(0, 10)),
    // Texto livre, publicado COM o consentimento da família (ver o comentário
    // do campo). Cortado no mesmo teto do questionário — a sanitização da
    // entrada já limita, isto é o cinto de segurança do lado da saída.
    observacoes: (r.observacoes ?? '').trim().slice(0, 500),
    publicadoEm: entrada.publicadoEm.slice(0, 10),
  };
}
