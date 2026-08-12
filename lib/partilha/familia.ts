/**
 * A família — dados do falecido, composição familiar e qualificação das
 * partes para a escritura, mais as respostas das perguntas da declaração
 * do ITCMD-SP (planilha de qualificação do escritório).
 *
 * Tudo aqui é tipo/função pura; o estado vive na tela e nada disso sai do
 * navegador (fronteira de dados do projeto).
 */

import type { Herdeiro, Regime, Vinculo } from './types';

const PARTICULAS_DE_NOME = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);

/**
 * Nome de pessoa padronizado: primeira letra maiúscula em cada palavra e o
 * resto minúsculo ("RENATA PUMMER" → "Renata Pummer"), preservando as
 * partículas (de, da, dos…) em minúsculas. Documentos que exigem caixa alta
 * aplicam .toUpperCase() na saída — o dado guardado fica legível.
 */
export function nomeProprio(s: string): string {
  const limpo = s.replace(/\s+/g, ' ').trim();
  if (!limpo) return limpo;
  return limpo
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((p, i) =>
      i > 0 && PARTICULAS_DE_NOME.has(p)
        ? p
        : p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1),
    )
    .join(' ');
}

/** Dados do autor da herança que abrem o caso. */
export interface DadosFalecido {
  nome: string;
  cpf: string;
  /** Fato gerador do ITCMD e referência de todos os prazos. */
  dataObito: string;
  /** Preenchida quando havia casamento/união com pacto datado. */
  dataCasamento: string;
  ultimoDomicilio: string;
  /** Onde ocorreu o falecimento (hospital, cidade/UF) — vai para a escritura. */
  localFalecimento?: string;
  /** Certidão de óbito: "matrícula nº …, expedida pelo ORCPN …". */
  certidaoObito?: string;
  /** Certidão de casamento do falecido: "matrícula nº …, ORCPN …". */
  certidaoCasamento?: string;
}

/** Qualificação de uma parte (colunas da planilha do escritório). */
export interface Qualificacao {
  nacionalidade: string;
  rg: string;
  cpf: string;
  dataNascimento: string;
  filiacao: string;
  profissao: string;
  estadoCivil: string;
  email: string;
  endereco: string;
  complemento: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  /** Cônjuge da parte (bloco "CÔNJUGE" da planilha) — herdeiro casado. */
  conjugeNome: string;
  conjugeNacionalidade: string;
  conjugeRg: string;
  conjugeCpf: string;
  conjugeDataNascimento: string;
  conjugeFiliacao: string;
  conjugeProfissao: string;
  conjugeEmail: string;
  /** Casamento da parte: a escritura qualifica com data, regime e certidão. */
  casamentoData: string;
  casamentoRegime: string;
  casamentoCertidao: string;
}

export const QUALIFICACAO_VAZIA: Qualificacao = {
  nacionalidade: '',
  rg: '',
  cpf: '',
  dataNascimento: '',
  filiacao: '',
  profissao: '',
  estadoCivil: '',
  email: '',
  endereco: '',
  complemento: '',
  bairro: '',
  cidade: '',
  uf: '',
  cep: '',
  conjugeNome: '',
  conjugeNacionalidade: '',
  conjugeRg: '',
  conjugeCpf: '',
  conjugeDataNascimento: '',
  conjugeFiliacao: '',
  conjugeProfissao: '',
  conjugeEmail: '',
  casamentoData: '',
  casamentoRegime: '',
  casamentoCertidao: '',
};

/**
 * Perguntas da declaração do ITCMD-SP respondidas por herdeiro
 * (planilha "responder SIM ou NÃO"). As respostas alimentam o espelho da
 * declaração no item do ITCMD.
 */
export interface PerguntasItcmd {
  pertenceFamilia: boolean | null;
  possuiOutroImovel: boolean | null;
  enderecoMesmoDoObito: boolean | null;
}

export const PERGUNTAS_ITCMD_VAZIAS: PerguntasItcmd = {
  pertenceFamilia: null,
  possuiOutroImovel: null,
  enderecoMesmoDoObito: null,
};

export const ROTULOS_PERGUNTAS_ITCMD: { campo: keyof PerguntasItcmd; texto: string }[] = [
  {
    campo: 'pertenceFamilia',
    texto:
      'O herdeiro pertence à família do de cujus (cônjuge, descendente, ascendente ou colateral)?',
  },
  {
    campo: 'possuiOutroImovel',
    texto:
      'O herdeiro é proprietário de algum imóvel além do(s) que, eventualmente, esteja(m) sendo partilhado(s) neste processo?',
  },
  {
    campo: 'enderecoMesmoDoObito',
    texto: 'O endereço atual do herdeiro é o mesmo da data do óbito?',
  },
];

const ROTULO_REGIME: Record<Regime, string> = {
  COMUNHAO_PARCIAL: 'comunhão parcial de bens',
  COMUNHAO_UNIVERSAL: 'comunhão universal de bens',
  SEPARACAO_CONVENCIONAL: 'separação convencional de bens',
  SEPARACAO_OBRIGATORIA: 'separação obrigatória de bens',
  PARTICIPACAO_FINAL_AQUESTOS: 'participação final nos aquestos',
};

/** Resumo em uma linha da composição familiar, para o topo do caso. */
export function composicaoFamiliar(
  falecido: DadosFalecido,
  temSobrevivente: boolean,
  vinculo: Vinculo,
  regime: Regime,
  herdeiros: Herdeiro[],
): { quantidadeFilhos: number; resumo: string } {
  const filhos = herdeiros.filter((h) => h.classe === 'DESCENDENTE' && h.grau === 1);
  const ativos = herdeiros.filter((h) => h.status === 'ATIVO');
  const partes: string[] = [];

  if (temSobrevivente) {
    partes.push(
      `${vinculo === 'CASAMENTO' ? 'casado(a)' : 'em união estável'} sob ${ROTULO_REGIME[regime]}${
        falecido.dataCasamento ? ` desde ${formatarData(falecido.dataCasamento)}` : ''
      }`,
    );
  } else {
    partes.push('sem cônjuge ou companheiro(a) sobrevivente');
  }
  partes.push(`${filhos.length} filho(s)`);
  if (ativos.length !== herdeiros.length) {
    partes.push(`${herdeiros.length} herdeiro(s) lançado(s), ${ativos.length} ativo(s)`);
  }
  return { quantidadeFilhos: filhos.length, resumo: partes.join(' · ') };
}

export function formatarData(iso: string): string {
  const [a, m, d] = iso.split('-');
  if (!a || !m || !d) return iso;
  return `${d}/${m}/${a}`;
}
