/**
 * Checklist de PENDÊNCIAS da minuta — o que ainda falta para a escritura/
 * petição sair completa. As minutas do módulo SEMPRE geram (com lacunas
 * "______" no lugar do que falta, como o modelo do balcão); este motor puro
 * PREVÊ, a partir da folha, exatamente quais campos virarão lacuna, para o
 * profissional completar ANTES — ou gerar mesmo assim, sabendo o que falta.
 *
 * Ideia adotada de um gerador de minuta por template: (1) listar as
 * pendências antes de gerar, com rótulos amigáveis, agrupadas por parte/bem;
 * (2) a contagem por grupo é a "rede de segurança" — nada sai incompleto sem
 * o profissional ver. Motor PURO (com testes).
 */

import type { Bem, Herdeiro } from './types';
import type { DadosFalecido, Qualificacao } from './familia';

export interface Pendencia {
  /** Grupo (parte ou bem) a que a pendência pertence. */
  grupo: string;
  /** Rótulo amigável do campo faltante. */
  rotulo: string;
}

export interface EntradaPendencias {
  falecido: DadosFalecido;
  qualificacaoFalecido?: Qualificacao;
  temSobrevivente: boolean;
  nomeSobrev: string;
  qualificacaoSobrevivente?: Qualificacao;
  herdeiros: Herdeiro[];
  qualificacoes: Record<string, Qualificacao>;
  bens: Bem[];
}

const vazio = (v: string | undefined | null): boolean => !v || !v.trim();

/** Campos NUCLEARES da qualificação de uma pessoa (viram lacuna na escritura). */
function pendenciasQualificacao(q: Qualificacao | undefined, grupo: string): Pendencia[] {
  const p: Pendencia[] = [];
  const falta = (cond: boolean, rotulo: string) => {
    if (cond) p.push({ grupo, rotulo });
  };
  falta(vazio(q?.cpf), 'CPF');
  falta(vazio(q?.rg), 'RG');
  falta(vazio(q?.dataNascimento), 'Data de nascimento');
  falta(vazio(q?.filiacao), 'Filiação');
  falta(vazio(q?.profissao), 'Profissão');
  falta(vazio(q?.estadoCivil), 'Estado civil');
  falta(vazio(q?.endereco) || (vazio(q?.cidade) && vazio(q?.uf)), 'Endereço completo');
  // Herdeiro/sobrevivente casado: o cônjuge e o casamento também qualificam.
  const casado =
    Boolean(q?.conjugeNome?.trim()) || (q?.estadoCivil ?? '').toLowerCase().includes('casad');
  if (casado) {
    falta(vazio(q?.conjugeNome), 'Nome do cônjuge');
    falta(vazio(q?.conjugeCpf), 'CPF do cônjuge');
    falta(vazio(q?.casamentoData), 'Data do casamento');
    falta(vazio(q?.casamentoRegime), 'Regime de bens');
    falta(vazio(q?.casamentoCertidao), 'Certidão de casamento');
  }
  return p;
}

/** Pendências de UM bem, conforme a classe (o que a escritura exige dele). */
function pendenciasBem(b: Bem, indice: number): Pendencia[] {
  const grupo = `Bem ${indice}: ${b.descricao || 'sem descrição'}`;
  const p: Pendencia[] = [];
  const falta = (cond: boolean, rotulo: string) => {
    if (cond) p.push({ grupo, rotulo });
  };
  falta(!(Number(b.valor) > 0), 'Valor atribuído');
  if (b.tipo === 'IMOVEL') {
    const im = b.imovel ?? {};
    falta(vazio(im.descricaoMatricula), 'Descrição da matrícula');
    falta(vazio(im.matricula), 'Número da matrícula');
    falta(vazio(im.registroImoveis), 'Cartório de registro de imóveis');
    falta(vazio(im.aquisicao), 'Forma de aquisição (registro/averbação)');
    falta(vazio(im.municipio), 'Município do cadastro');
    falta(vazio(im.inscricaoCadastral), 'Inscrição cadastral');
    falta(vazio(im.valorVenalAtual), 'Valor venal atual');
  } else if (b.tipo === 'VEICULO') {
    const v = b.veiculo ?? {};
    falta(vazio(v.marcaModelo), 'Marca/modelo');
    falta(vazio(v.renavam), 'RENAVAM');
    falta(vazio(v.placa), 'Placa');
    falta(vazio(v.chassi), 'Chassi');
  } else if (b.tipo === 'FINANCEIRO') {
    falta(true, 'Banco, agência e conta (preencher na minuta)');
  } else if (b.tipo === 'QUOTAS') {
    falta(true, 'Empresa, CNPJ e quantidade de quotas (preencher na minuta)');
  }
  return p;
}

/**
 * Todas as pendências da minuta, na ordem em que aparecem no ato: autor da
 * herança, cônjuge/companheiro(a), cada herdeiro e cada bem.
 */
export function pendenciasDaMinuta(e: EntradaPendencias): Pendencia[] {
  const lista: Pendencia[] = [];
  const G_FALECIDO = 'Autor(a) da herança';

  if (vazio(e.falecido.nome)) lista.push({ grupo: G_FALECIDO, rotulo: 'Nome' });
  if (vazio(e.falecido.cpf)) lista.push({ grupo: G_FALECIDO, rotulo: 'CPF' });
  if (vazio(e.falecido.dataObito)) lista.push({ grupo: G_FALECIDO, rotulo: 'Data do óbito' });
  if (vazio(e.falecido.certidaoObito))
    lista.push({ grupo: G_FALECIDO, rotulo: 'Certidão de óbito (matrícula/ORCPN)' });
  lista.push(...pendenciasQualificacao(e.qualificacaoFalecido, G_FALECIDO));

  if (e.temSobrevivente) {
    const g = `Cônjuge/companheiro(a): ${e.nomeSobrev || 'sem nome'}`;
    if (vazio(e.nomeSobrev)) lista.push({ grupo: g, rotulo: 'Nome' });
    if (vazio(e.falecido.certidaoCasamento))
      lista.push({ grupo: g, rotulo: 'Certidão de casamento com o(a) falecido(a)' });
    lista.push(...pendenciasQualificacao(e.qualificacaoSobrevivente, g));
  }

  for (const h of e.herdeiros) {
    const g = `Herdeiro(a): ${h.nome || 'sem nome'}`;
    if (vazio(h.nome)) lista.push({ grupo: g, rotulo: 'Nome' });
    lista.push(...pendenciasQualificacao(e.qualificacoes[h.id], g));
  }

  e.bens.forEach((b, i) => lista.push(...pendenciasBem(b, i + 1)));

  return lista;
}

/** Pendências agrupadas (para o checklist da UI), preservando a ordem. */
export function agruparPendencias(pendencias: Pendencia[]): { grupo: string; itens: string[] }[] {
  const grupos: { grupo: string; itens: string[] }[] = [];
  for (const p of pendencias) {
    const g = grupos.find((x) => x.grupo === p.grupo);
    if (g) g.itens.push(p.rotulo);
    else grupos.push({ grupo: p.grupo, itens: [p.rotulo] });
  }
  return grupos;
}
