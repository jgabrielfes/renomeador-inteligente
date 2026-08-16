/**
 * MÓDULO 4 — Radar de bens FORA do inventário.
 *
 * Mapeia valores que os beneficiários recebem por fora do espólio (seguro,
 * VGBL/PGBL, pensão, conta conjunta, verbas da Lei 6.858/80) e, quando cabe,
 * RETIRA-os da base do ITCMD e do monte-mor — economia direta e mensurável.
 * Motor PURO (com testes); tudo é apoio ao profissional, a confirmar no caso.
 */

export type ItemRadar =
  | 'seguro_vida'
  | 'vgbl'
  | 'pgbl'
  | 'pensao_morte'
  | 'conta_conjunta'
  | 'fgts_pis_verbas'
  | 'consorcio_seguro';

export interface RespostaRadar {
  item: ItemRadar;
  presente: boolean;
  /** Valor total do item, quando quantificável (R$). */
  valor?: number;
  /** Seguro/plano COM beneficiário indicado? (false dispara o art. 792 CC). */
  temBeneficiario?: boolean;
}

export interface CardRadar {
  item: ItemRadar;
  titulo: string;
  quemRecebe: string;
  ondeRequerer: string;
  documentos: string[];
  prazo: string | null;
  fundamento: string;
  /** Não compõe o monte-mor da partilha. */
  foraDoMonteMor: boolean;
  /** Parcela que SAI da base do ITCMD (R$). */
  valorForaItcmd: number;
  alertas: string[];
}

export interface EntradaRadar {
  respostas: RespostaRadar[];
  /** Alíquota do ITCMD para estimar a economia (default 4% = 0.04). */
  aliquotaItcmd?: number;
}

export interface ResultadoRadar {
  cards: CardRadar[];
  /** Total recebido diretamente pelos beneficiários (fora do inventário). */
  totalForaDoInventario: number;
  /** Base retirada do ITCMD × alíquota — o imposto que NÃO se paga. */
  economiaItcmdEstimada: number;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Constrói o card de um item presente. */
function montarCard(resposta: RespostaRadar): CardRadar {
  const valor = resposta.valor && resposta.valor > 0 ? resposta.valor : 0;
  switch (resposta.item) {
    case 'seguro_vida': {
      // Sem beneficiário indicado: art. 792 — metade ao cônjuge, metade aos
      // herdeiros; entra no inventário e não é totalmente "fora".
      const semBeneficiario = resposta.temBeneficiario === false;
      return {
        item: 'seguro_vida',
        titulo: 'Seguro de vida',
        quemRecebe: semBeneficiario
          ? 'Sem beneficiário indicado: metade ao cônjuge, metade aos herdeiros (art. 792 CC)'
          : 'Beneficiário indicado na apólice, direto pela seguradora',
        ondeRequerer: 'Seguradora (aviso de sinistro)',
        documentos: ['Apólice', 'Certidão de óbito', 'Documentos do beneficiário'],
        prazo: 'Prescrição de 1 ano para o beneficiário (art. 206, §1º, II, CC)',
        fundamento: 'Código Civil, art. 794 (não integra a herança nem responde por dívidas)',
        foraDoMonteMor: !semBeneficiario,
        valorForaItcmd: semBeneficiario ? 0 : valor,
        alertas: semBeneficiario
          ? ['Sem beneficiário: o capital é rateado (art. 792) e ENTRA no inventário — confira a apólice.']
          : [],
      };
    }
    case 'vgbl':
      return {
        item: 'vgbl',
        titulo: 'VGBL',
        quemRecebe: 'Beneficiário indicado, direto pela seguradora',
        ondeRequerer: 'Seguradora/instituição financeira',
        documentos: ['Certificado do plano', 'Certidão de óbito', 'Documentos do beneficiário'],
        prazo: null,
        fundamento: 'STF, Tema 1214 (RE 1.363.013): não incide ITCMD sobre VGBL',
        foraDoMonteMor: true,
        valorForaItcmd: valor,
        alertas: [],
      };
    case 'pgbl':
      return {
        item: 'pgbl',
        titulo: 'PGBL',
        quemRecebe: 'Beneficiário indicado, direto pela instituição',
        ondeRequerer: 'Instituição financeira',
        documentos: ['Certificado do plano', 'Certidão de óbito', 'Documentos do beneficiário'],
        prazo: null,
        fundamento:
          'STF, Tema 1214: não incide ITCMD; IR retido na fonte conforme o regime de tributação escolhido',
        foraDoMonteMor: true,
        valorForaItcmd: valor,
        alertas: ['IR na fonte incide conforme o regime (progressivo × regressivo) — não é ITCMD.'],
      };
    case 'pensao_morte':
      return {
        item: 'pensao_morte',
        titulo: 'Pensão por morte (INSS/RPPS)',
        quemRecebe: 'Dependentes — direito próprio, não é herança',
        ondeRequerer: 'INSS (Meu INSS) ou o RPPS do ente',
        documentos: ['Certidão de óbito', 'Comprovante de dependência', 'Documentos do dependente'],
        prazo:
          'Requerer em até 90 dias do óbito para retroagir à data do óbito; depois, a partir do requerimento',
        fundamento: 'Lei 8.213/91 (benefício previdenciário, fora do espólio)',
        foraDoMonteMor: true,
        valorForaItcmd: 0, // renda mensal, não é acervo transmitido
        alertas: [],
      };
    case 'conta_conjunta': {
      // Presunção de 50% do cotitular fora do espólio (salvo prova).
      const metade = r2(valor / 2);
      return {
        item: 'conta_conjunta',
        titulo: 'Conta conjunta solidária',
        quemRecebe: 'Cotitular sobrevivente presume-se dono de 50% (o restante é do espólio)',
        ondeRequerer: 'Instituição financeira (a parte do espólio via inventário/alvará)',
        documentos: ['Extrato na data do óbito', 'Comprovante da titularidade conjunta'],
        prazo: null,
        fundamento: 'Presunção jurisprudencial (STJ) de rateio igual, salvo prova em contrário',
        foraDoMonteMor: false, // a metade do espólio ENTRA no inventário
        valorForaItcmd: metade, // a metade do cotitular sai da base
        alertas: [
          `Presunção de 50% (${r2(metade).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) ao cotitular — cabe prova em contrário sobre a origem dos recursos.`,
        ],
      };
    }
    case 'fgts_pis_verbas':
      return {
        item: 'fgts_pis_verbas',
        titulo: 'FGTS, PIS/PASEP e verbas trabalhistas',
        quemRecebe: 'Dependentes habilitados no INSS (ou sucessores, na falta)',
        ondeRequerer: 'Caixa Econômica Federal / empregador — ver o módulo do Alvará',
        documentos: ['Certidão de dependentes do INSS', 'Certidão de óbito'],
        prazo: null,
        fundamento: 'Lei 6.858/80 (dispensa de inventário para essas verbas)',
        foraDoMonteMor: true,
        valorForaItcmd: valor,
        alertas: ['Cruze com o Detector de Alvará (Lei 6.858/80) para o caminho de saque.'],
      };
    case 'consorcio_seguro':
      return {
        item: 'consorcio_seguro',
        titulo: 'Consórcio com seguro prestamista',
        quemRecebe: 'Depende da quitação da cota pelo seguro prestamista',
        ondeRequerer: 'Administradora do consórcio',
        documentos: ['Contrato do consórcio', 'Apólice do seguro prestamista', 'Certidão de óbito'],
        prazo: null,
        fundamento: 'Contratual — o seguro prestamista pode quitar a cota, alterando o que integra o espólio',
        foraDoMonteMor: false,
        valorForaItcmd: 0,
        alertas: ['Confirme se o seguro prestamista quitou a cota antes de lançar o bem no acervo.'],
      };
  }
}

export function analisarRadarBens(entrada: EntradaRadar): ResultadoRadar {
  const aliquota = entrada.aliquotaItcmd ?? 0.04;
  const cards = entrada.respostas
    .filter((r) => r.presente)
    .map(montarCard);

  // valorForaItcmd é a parcela que não transita pelo espólio (fora da base do
  // ITCMD): é ela que mede tanto o total recebido por fora quanto a economia.
  const baseForaItcmd = cards.reduce((a, c) => a + c.valorForaItcmd, 0);
  return {
    cards,
    totalForaDoInventario: r2(baseForaItcmd),
    economiaItcmdEstimada: r2(baseForaItcmd * aliquota),
  };
}

/** Rótulos amigáveis dos itens (para o questionário da UI). */
export const ROTULOS_ITEM_RADAR: Record<ItemRadar, string> = {
  seguro_vida: 'Seguro de vida',
  vgbl: 'VGBL',
  pgbl: 'PGBL',
  pensao_morte: 'Pensão por morte (INSS/RPPS)',
  conta_conjunta: 'Conta conjunta solidária',
  fgts_pis_verbas: 'FGTS / PIS-PASEP / verbas trabalhistas',
  consorcio_seguro: 'Consórcio com seguro prestamista',
};
