/**
 * ANTECIPADOR DE QUALIFICAÇÃO REGISTRAL — motor PURO (com testes).
 *
 * Confronta o ATO que vai ser lavrado (a folha: falecido, estado civil,
 * regime, partes) com o que as MATRÍCULAS trazem, e antecipa o que o
 * Registro de Imóveis vai exigir junto ao traslado da escritura ou ao
 * formal de partilha — antes que vire nota devolutiva:
 *
 *  - falecido solteiro na matrícula que casou depois → certidão de casamento
 *    para AVERBAÇÃO prévia (princípio da especialidade subjetiva; LRP,
 *    art. 167, II, 1, e art. 246);
 *  - grafia do nome na matrícula divergente da folha → retificação/averbação
 *    (LRP, art. 213, I);
 *  - cônjuge não mencionado na matrícula em regime de comunhão → conferir a
 *    meação e a cadeia (art. 1.647 do CC);
 *  - fração ideal parcial → a partilha limita-se à fração do falecido;
 *  - matrícula/RI não informados → certidão atualizada de inteiro teor;
 *  - itens de praxe: guia do ITCMD paga (ou isenção reconhecida), certidões
 *    com validade na prenotação, valor venal de referência.
 */

import type { Bem } from './types';

export interface EntradaAntecipador {
  falecido: {
    nome: string;
    /** Estado civil ATUAL do falecido na abertura da sucessão (da folha). */
    estadoCivil?: string | null;
  };
  temSobrevivente: boolean;
  nomeSobrev?: string | null;
  regime?: string | null;
  /** Rito do caso — muda o título que vai a registro. */
  extrajudicial: boolean;
  bens: Bem[];
}

export interface ApontamentoRegistral {
  /** EXIGENCIA = o RI vai pedir · CONFERIR = checar antes de prenotar. */
  nivel: 'EXIGENCIA' | 'CONFERIR';
  texto: string;
  fundamento: string;
}

export interface RelatorioImovelAntecipador {
  descricao: string;
  matricula: string | null;
  apontamentos: ApontamentoRegistral[];
}

export interface RelatorioAntecipador {
  titulo: string;
  /** O título que será levado a registro (traslado × formal). */
  tituloRegistro: string;
  imoveis: RelatorioImovelAntecipador[];
  /** Itens de praxe que valem para o caso inteiro. */
  gerais: ApontamentoRegistral[];
  totalExigencias: number;
}

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

const contem = (texto: string | null | undefined, termo: string) =>
  semAcento(texto ?? '').includes(semAcento(termo));

export function anteciparQualificacaoRegistral(e: EntradaAntecipador): RelatorioAntecipador {
  const tituloRegistro = e.extrajudicial
    ? 'traslado da escritura de inventário e partilha'
    : 'formal de partilha (ou carta de sentença)';
  const imoveis: RelatorioImovelAntecipador[] = [];

  const estadoAtual = (e.falecido.estadoCivil ?? '').toLowerCase();
  const casadoNoObito = estadoAtual.includes('casad') || e.temSobrevivente;

  for (const b of e.bens) {
    if (b.tipo !== 'IMOVEL' || b.sobrepartilha) continue;
    const im = b.imovel ?? {};
    const ap: ApontamentoRegistral[] = [];
    const exigencia = (texto: string, fundamento: string) =>
      ap.push({ nivel: 'EXIGENCIA', texto, fundamento });
    const conferir = (texto: string, fundamento: string) =>
      ap.push({ nivel: 'CONFERIR', texto, fundamento });

    const titularidade = im.proprietariosMatricula ?? '';

    if (!im.matricula || !im.registroImoveis) {
      exigencia(
        'Matrícula e/ou serventia do registro não informadas na folha — obter certidão ATUALIZADA de inteiro teor (validade usual de 30 dias na prenotação) e completar o lançamento do bem.',
        'LRP, art. 19; prazo de validade pela praxe das serventias (Normas de Serviço da CGJ-SP)',
      );
    }

    if (titularidade) {
      // Falecido consta solteiro na matrícula, mas faleceu casado → averbar
      // o casamento antes do registro da partilha (especialidade subjetiva).
      if (contem(titularidade, 'solteir') && casadoNoObito) {
        exigencia(
          `O(a) falecido(a) consta SOLTEIRO(A) na matrícula e faleceu casado(a)${e.nomeSobrev ? ` com ${e.nomeSobrev}` : ''} — anexar ao ${tituloRegistro} a CERTIDÃO DE CASAMENTO do(a) falecido(a), para averbação prévia da mudança de estado civil.`,
          'Princípio da especialidade subjetiva — LRP, arts. 167, II, 1, e 246',
        );
      }
      // Casado na matrícula sem menção ao cônjuge da folha → conferir cadeia.
      if (
        contem(titularidade, 'casad') &&
        e.nomeSobrev?.trim() &&
        !contem(titularidade, e.nomeSobrev)
      ) {
        exigencia(
          `A matrícula menciona titular casado(a), mas o cônjuge que consta não é ${e.nomeSobrev} (ou não está legível) — conferir se houve casamento anterior (juntar certidões que recomponham a cadeia: casamento anterior, divórcio/óbito e o casamento atual).`,
          'Continuidade registral — LRP, art. 195',
        );
      }
      // Grafia do nome do falecido divergente da matrícula.
      if (
        e.falecido.nome.trim() &&
        !contem(titularidade, e.falecido.nome) &&
        // só aponta se a matrícula traz ALGUM nome (não é campo genérico)
        titularidade.trim().length > 5
      ) {
        conferir(
          `O nome do(a) falecido(a) (${e.falecido.nome}) não confere literalmente com a titularidade da matrícula ("${titularidade}") — divergência de grafia exige retificação/averbação antes do registro.`,
          'LRP, art. 213, I (retificação de ofício ou a requerimento)',
        );
      }
    } else {
      conferir(
        'A folha não traz COMO o(s) proprietário(s) constam na matrícula (nome e estado civil no registro aquisitivo) — conferir na certidão: estado civil divergente do atual é a exigência mais comum do RI.',
        'Princípio da especialidade subjetiva — LRP, art. 246',
      );
    }

    // Regime de comunhão: o registro da partilha pressupõe a meação correta.
    if (contem(e.regime, 'comunhao') && e.temSobrevivente && titularidade && !contem(titularidade, 'casad')) {
      conferir(
        'Regime de comunhão com titular que não consta casado na matrícula — conferir se o bem é comum (meação) ou particular; a qualificação do registro aquisitivo decide.',
        'CC, arts. 1.658/1.667; continuidade registral (LRP, art. 195)',
      );
    }

    const fracao = Number(String(im.fracaoIdeal ?? '').replace(',', '.'));
    if (Number.isFinite(fracao) && fracao > 0 && fracao < 100) {
      conferir(
        `A titularidade é de FRAÇÃO IDEAL (${im.fracaoIdeal}%) — a partilha registra-se limitada à fração do(a) falecido(a); descrever a fração no ato exatamente como na matrícula.`,
        'Princípio da especialidade objetiva — LRP, art. 176, §1º, e art. 225',
      );
    }

    imoveis.push({
      descricao: b.descricao || 'Imóvel sem descrição',
      matricula: im.matricula ?? null,
      apontamentos: ap,
    });
  }

  // Itens de praxe: só o que o RI de fato confere no título. Validade de
  // certidões/matrículas e conferência do venal são do TABELIÃO ao lavrar
  // (não do registro) — ficaram FORA de propósito, a pedido do escritório.
  const gerais: ApontamentoRegistral[] = [
    {
      nivel: 'EXIGENCIA',
      texto: `Guia do ITCMD PAGA (ou o reconhecimento formal da isenção) acompanha o ${tituloRegistro} — o RI confere o recolhimento antes de registrar.`,
      fundamento: 'Lei 10.705/2000, art. 25; fiscalização pelo registrador (CTN, art. 192)',
    },
  ];

  const totalExigencias =
    imoveis.reduce((a, i) => a + i.apontamentos.filter((x) => x.nivel === 'EXIGENCIA').length, 0) +
    gerais.filter((x) => x.nivel === 'EXIGENCIA').length;

  return {
    titulo: 'Antecipador de qualificação registral',
    tituloRegistro,
    imoveis,
    gerais,
    totalExigencias,
  };
}
