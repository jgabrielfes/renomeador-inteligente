/**
 * CONFERIDOR DE QUALIFICAÇÃO CRUZADA + ANALISADOR DE CERTIDÕES DE ESTADO
 * CIVIL — motor PURO (com testes).
 *
 * Cruza o que a FOLHA declara (estado civil, cônjuge, datas, grafia) com o
 * que as CERTIDÕES do registro civil lidas pelo cofre efetivamente trazem, e
 * aponta as divergências que travam escritura e geram nota devolutiva:
 *
 *  - divórcio averbado × parte declarada casada (e o inverso: declarada
 *    divorciada sem averbação na certidão);
 *  - casamento anterior a 26/12/1977 (Lei 6.515/77): o regime LEGAL era a
 *    comunhão universal — declarar comunhão parcial sem pacto diverge;
 *  - regime que EXIGE pacto antenupcial (universal pós-77, separação
 *    convencional, participação final) sem pacto na certidão;
 *  - regime declarado ≠ regime da certidão; cônjuge declarado ≠ cônjuge da
 *    certidão; cônjuge não mencionado; grafia de nome divergente; data de
 *    nascimento trocada; data do óbito inconsistente com a folha.
 *
 * Divergência de qualificação é a causa nº 1 de nota devolutiva — o alerta é
 * VERMELHO (nível ALTA) quando trava o ato, e ATENÇÃO quando pede conferência.
 */

export interface CertidaoCivilLida {
  /** NASCIMENTO, CASAMENTO ou OBITO. */
  tipo: 'NASCIMENTO' | 'CASAMENTO' | 'OBITO';
  /** Titular da certidão (nos dois nubentes, o que casar com a parte). */
  pessoa: string;
  /** Outro nubente, na certidão de casamento. */
  conjuge?: string | null;
  dataCasamento?: string | null;
  /** Regime que a certidão declara (texto livre da certidão). */
  regime?: string | null;
  /** true = a certidão menciona pacto antenupcial. */
  pactoAntenupcial?: boolean | null;
  /** true = há averbação de divórcio na certidão. */
  averbacaoDivorcio?: boolean | null;
  /** true = há averbação de óbito do cônjuge (viuvez). */
  averbacaoObitoConjuge?: boolean | null;
  dataNascimento?: string | null;
  dataObito?: string | null;
}

export interface PessoaConferencia {
  /** '__falecido__', '__sobrevivente__' ou id do herdeiro. */
  id: string;
  nome: string;
  papel: 'FALECIDO' | 'SOBREVIVENTE' | 'HERDEIRO';
  estadoCivil?: string | null;
  uniaoEstavel?: boolean;
  conjugeNome?: string | null;
  casamentoRegime?: string | null;
  dataNascimento?: string | null;
}

export interface DivergenciaConferencia {
  /** ALTA = trava a escritura (alerta vermelho) · ATENCAO = conferir. */
  nivel: 'ALTA' | 'ATENCAO';
  pessoa: string;
  mensagem: string;
  /** O que fazer para sanar. */
  acao: string;
}

/** Vigência da Lei 6.515/1977 — antes dela o regime legal era o da comunhão
 *  universal (CC/1916, art. 258 na redação original). */
export const CORTE_LEI_DO_DIVORCIO = '1977-12-26';

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/** Mesmo nome ignorando caixa/acento (grafia solta compara depois). */
const mesmoNome = (a: string, b: string) => {
  const na = semAcento(a);
  const nb = semAcento(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

const declara = (estadoCivil: string | null | undefined, termo: string) =>
  (estadoCivil ?? '').toLowerCase().includes(termo);

/** Normaliza o regime para comparação (texto da folha × texto da certidão). */
function chaveRegime(texto: string | null | undefined): string | null {
  const t = semAcento(texto ?? '');
  if (!t) return null;
  if (t.includes('UNIVERSAL')) return 'UNIVERSAL';
  if (t.includes('PARCIAL')) return 'PARCIAL';
  if (t.includes('PARTICIPACAO')) return 'PARTICIPACAO';
  if (t.includes('SEPARACAO')) return t.includes('OBRIGATORIA') || t.includes('LEGAL') ? 'SEPARACAO_OBRIGATORIA' : 'SEPARACAO';
  return null;
}

/** Regimes que só existem com PACTO antenupcial (pós-1977). */
const REGIMES_COM_PACTO = new Set(['UNIVERSAL', 'SEPARACAO', 'PARTICIPACAO']);

export function conferirQualificacoes(entrada: {
  pessoas: PessoaConferencia[];
  certidoes: CertidaoCivilLida[];
  /** Data do óbito da folha — confere com a certidão de óbito lida. */
  dataObitoInventario?: string | null;
}): DivergenciaConferencia[] {
  const lista: DivergenciaConferencia[] = [];
  const alta = (pessoa: string, mensagem: string, acao: string) =>
    lista.push({ nivel: 'ALTA', pessoa, mensagem, acao });
  const atencao = (pessoa: string, mensagem: string, acao: string) =>
    lista.push({ nivel: 'ATENCAO', pessoa, mensagem, acao });

  for (const p of entrada.pessoas) {
    if (!p.nome?.trim()) continue;
    const certidoesDaPessoa = entrada.certidoes.filter(
      (c) => mesmoNome(c.pessoa, p.nome) || (c.conjuge ? mesmoNome(c.conjuge, p.nome) : false),
    );

    // Cônjuge preenchido com estado civil de quem não tem cônjuge (sem
    // união estável marcada) — qualificação interna inconsistente.
    if (
      p.conjugeNome?.trim() &&
      !p.uniaoEstavel &&
      (declara(p.estadoCivil, 'solteir') || declara(p.estadoCivil, 'divorciad') || declara(p.estadoCivil, 'viuv'))
    ) {
      atencao(
        p.nome,
        `Declarado(a) ${p.estadoCivil}, mas a ficha traz cônjuge (${p.conjugeNome}) sem união estável marcada.`,
        'Marcar a união estável na ficha ou corrigir o estado civil/cônjuge.',
      );
    }

    for (const c of certidoesDaPessoa) {
      if (c.tipo === 'CASAMENTO') {
        // Grafia: certidão achou a pessoa, mas o texto difere do lançado.
        const nomeNaCertidao = mesmoNome(c.pessoa, p.nome) ? c.pessoa : c.conjuge ?? '';
        if (nomeNaCertidao && semAcento(nomeNaCertidao) !== semAcento(p.nome)) {
          atencao(
            p.nome,
            `Grafia divergente: a folha traz "${p.nome}" e a certidão de casamento, "${nomeNaCertidao}".`,
            'Padronizar pela certidão (ou retificar o registro) — grafia divergente gera nota devolutiva.',
          );
        }

        if (c.averbacaoDivorcio === true && declara(p.estadoCivil, 'casad')) {
          alta(
            p.nome,
            'A certidão de casamento tem AVERBAÇÃO DE DIVÓRCIO, mas a folha declara casado(a).',
            'Corrigir o estado civil para divorciado(a) — ou juntar certidão de casamento posterior, se casou de novo.',
          );
        }
        if (c.averbacaoDivorcio !== true && declara(p.estadoCivil, 'divorciad')) {
          alta(
            p.nome,
            'Declarado(a) divorciado(a), mas a certidão de casamento apresentada NÃO tem averbação do divórcio.',
            'Averbar o divórcio no registro civil antes do ato — sem a averbação a escritura trava.',
          );
        }

        // O cônjuge declarado precisa ser o da certidão (ou constar nela).
        const outro = mesmoNome(c.pessoa, p.nome) ? c.conjuge : c.pessoa;
        if (p.conjugeNome?.trim() && outro && !mesmoNome(p.conjugeNome, outro) && !c.averbacaoDivorcio) {
          alta(
            p.nome,
            `O cônjuge declarado (${p.conjugeNome}) não confere com o da certidão de casamento (${outro}).`,
            'Conferir se há novo casamento (juntar a certidão respectiva) ou corrigir o nome do cônjuge.',
          );
        }

        // Regime declarado × regime da certidão.
        const regimeFolha = chaveRegime(p.casamentoRegime);
        const regimeCertidao = chaveRegime(c.regime);
        if (regimeFolha && regimeCertidao && regimeFolha !== regimeCertidao) {
          alta(
            p.nome,
            `Regime de bens divergente: a folha declara "${p.casamentoRegime}" e a certidão, "${c.regime}".`,
            'Prevalece a certidão (com pacto, o pacto registrado) — corrigir a folha.',
          );
        }

        // Casamento pré-Lei do Divórcio: regime legal era a comunhão UNIVERSAL.
        if (
          c.dataCasamento &&
          c.dataCasamento < CORTE_LEI_DO_DIVORCIO &&
          c.pactoAntenupcial !== true &&
          regimeFolha === 'PARCIAL'
        ) {
          alta(
            p.nome,
            `Casamento em ${c.dataCasamento.slice(0, 10)} — ANTES da Lei 6.515/77: sem pacto, o regime legal era a COMUNHÃO UNIVERSAL, não a parcial declarada.`,
            'Corrigir o regime para comunhão universal de bens (ou juntar o pacto antenupcial, se houver).',
          );
        }

        // Regime que exige pacto sem pacto mencionado (casamento pós-77).
        if (
          regimeCertidao === null &&
          regimeFolha &&
          REGIMES_COM_PACTO.has(regimeFolha) &&
          c.pactoAntenupcial !== true &&
          (!c.dataCasamento || c.dataCasamento >= CORTE_LEI_DO_DIVORCIO)
        ) {
          atencao(
            p.nome,
            `Regime declarado (${p.casamentoRegime}) exige PACTO ANTENUPCIAL, e a certidão apresentada não o menciona.`,
            'Juntar a escritura de pacto antenupcial registrada (ou conferir o regime na própria certidão).',
          );
        }
      }

      if (c.tipo === 'NASCIMENTO' && c.dataNascimento && p.dataNascimento) {
        if (c.dataNascimento.slice(0, 10) !== p.dataNascimento.slice(0, 10)) {
          alta(
            p.nome,
            `Data de nascimento divergente: folha ${p.dataNascimento.slice(0, 10)} × certidão ${c.dataNascimento.slice(0, 10)}.`,
            'Corrigir pela certidão de nascimento — data trocada gera nota devolutiva.',
          );
        }
      }

      if (c.tipo === 'OBITO' && p.papel === 'FALECIDO' && c.dataObito && entrada.dataObitoInventario) {
        if (c.dataObito.slice(0, 10) !== entrada.dataObitoInventario.slice(0, 10)) {
          alta(
            p.nome,
            `Data do óbito divergente: a folha traz ${entrada.dataObitoInventario.slice(0, 10)} e a certidão de óbito, ${c.dataObito.slice(0, 10)}.`,
            'Corrigir a data na folha — ela é o fato gerador do ITCMD e muda prazos e multas.',
          );
        }
      }
    }
  }

  // ALTA primeiro (alerta vermelho no topo).
  return lista.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'ALTA' ? -1 : 1));
}
