/**
 * Item V — Custos do inventário.
 *
 * A planilha de custos além do imposto: escritura em UM ato pela LEGÍTIMA
 * (herança sem a meação), renúncias como atos sem valor declarado, torna/
 * cessão pela base do valor da torna, registros por imóvel, certidões e a
 * taxa judiciária no rito judicial — tabelas oficiais 2026 com ISS de 5%
 * (motor: lib/partilha/custas.ts). Sucessões CUMULADAS entram aqui com o
 * PRÓPRIO fato gerador: ITCMD, escritura e registros de cada uma somam na
 * projeção. O total fecha com a provisão do ITCMD do item IV.
 */

import { Fragment, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/currency-input';
import { mascararMoeda, moedaParaNumero } from '@/lib/moeda';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ProjecaoCustos } from '@/lib/partilha/custas';
import type { ProvisaoItcmd } from '@/lib/partilha/itcmd';
import type { Caso, Resultado } from '@/lib/partilha/types';
import type { Alocacoes } from '@/lib/partilha/cenario';
import { formatarData } from '@/lib/partilha/familia';
import {
  somaAdicionais,
  montarDadosOrcamento,
  type DespesaAdicional,
  type DossieOrcamento,
} from '@/lib/partilha/orcamento';
import { baixarBlob } from '@/lib/partilha/xlsx';
import {
  CUSTOS_MANUAIS_VAZIOS,
  parcelasManuais,
  totalCustosManuais,
  type CustosManuais,
} from '@/lib/partilha/custos-manuais';
import { Espelho, FundEspelho, LinhaEspelho } from './espelho-tabela';
import type { SucessaoCumulada } from './itcmd-view';

/**
 * As seções do PDF completo, montadas a partir do que a folha já tem: as
 * partes, o acervo com a avaliação, as fatias do gráfico (na MESMA ordem da
 * pizza da aba III — meação primeiro) e o quadro bem a bem do motor puro
 * `quadro-bens.ts`. Nada é recalculado aqui: só recortado para o papel.
 */
async function montarDossie(
  caso: Caso,
  resultado: Resultado,
  atribuicoes: Alocacoes = {},
): Promise<DossieOrcamento> {
  const { matrizDoQuadro, montarQuadroPorBem } = await import('@/lib/partilha/quadro-bens');
  const massa = Number(resultado.acervo.massaPartilhavel) || 0;
  const pct = (v: number) => (massa > 0 ? (v / massa) * 100 : 0);
  const quadro = montarQuadroPorBem(caso, resultado, atribuicoes);
  return {
    meeiro: resultado.meacao
      ? {
          nome: resultado.meacao.beneficiario,
          fracao: resultado.meacao.fracao,
          valor: Number(resultado.meacao.valor) || 0,
        }
      : undefined,
    herdeiros: resultado.quinhoes.map((q) => ({
      nome: q.nome,
      fracao: q.fracaoHeranca,
      valor: Number(q.valor) || 0,
      pctMassa: pct(Number(q.valor) || 0),
    })),
    acervo: caso.bens.map((b) => ({
      descricao: b.descricao,
      natureza: b.natureza === 'COMUM' ? ('COMUM' as const) : ('PARTICULAR' as const),
      valor: Number(b.valor) || 0,
      avaliacao: b.valorAvaliacao ? Number(b.valorAvaliacao) || undefined : undefined,
    })),
    fatias: [
      ...(resultado.meacao
        ? [{ nome: `${resultado.meacao.beneficiario} — meação`, valor: Number(resultado.meacao.valor) || 0 }]
        : []),
      ...resultado.quinhoes.map((q) => ({ nome: q.nome, valor: Number(q.valor) || 0 })),
    ],
    massaPartilhavel: massa,
    matriz: matrizDoQuadro(quadro.linhas),
    avisosQuadro: quadro.avisos,
  };
}

const VALOR_PTBR = /^\d{1,3}(\.\d{3})*(,\d{2})?$|^\d+(,\d{2})?$/;
const paraDecimal = (v: string) => Number(v.replace(/\./g, '').replace(',', '.')).toFixed(2);

/* Conversão dos campos MANUAIS (edição inline contínua, convenção da folha):
   o estado persiste em decimal "1234.56" e o input mostra "1.234,56". */
const decimalParaMascara = (v: string) => (v ? mascararMoeda(v) : '');
const mascaraParaDecimal = (m: string) => {
  const n = moedaParaNumero(m);
  return n === undefined ? '' : n.toFixed(2);
};

const esquemaDespesa = z.object({
  descricao: z.string().trim().min(1, 'Descreva a despesa — ex.: "Certidões estaduais avulsas".'),
  valor: z
    .string()
    .trim()
    .min(1, 'Informe o valor da despesa.')
    .regex(VALOR_PTBR, 'Valor inválido — use 1.234,56.'),
});
type NovaDespesa = z.infer<typeof esquemaDespesa>;

/**
 * CUSTOS ADICIONAIS — lançamento manual de despesas fora das tabelas
 * (despachante, avaliador, certidões de outros estados, traduções…): entram
 * na planilha, no total projetado e na folha de orçamento.
 */
function EditorDespesasAdicionais({
  adicionais,
  setAdicionais,
}: {
  adicionais: DespesaAdicional[];
  setAdicionais: (d: DespesaAdicional[]) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovaDespesa>({
    resolver: zodResolver(esquemaDespesa),
    defaultValues: { descricao: '', valor: '' },
  });

  const lancar = (dados: NovaDespesa) => {
    setAdicionais([
      ...adicionais,
      { id: crypto.randomUUID(), descricao: dados.descricao, valor: paraDecimal(dados.valor) },
    ]);
    reset({ descricao: '', valor: '' });
  };

  return (
    <div style={{ marginTop: 18 }}>
      <span className="eyebrow">Custos adicionais</span>
      <p className="fund" style={{ margin: '4px 0 8px' }}>
        Despesas fora das tabelas oficiais (despachante, avaliação, certidões de outros
        estados, traduções…) — entram no total projetado e na folha de orçamento.
      </p>
      <form noValidate onSubmit={handleSubmit(lancar)}>
        <div className="grade c2" style={{ maxWidth: 640 }}>
          <Field data-invalid={Boolean(errors.descricao)}>
            <FieldLabel htmlFor="despesa-descricao">Descrição</FieldLabel>
            <Input
              id="despesa-descricao"
              aria-invalid={Boolean(errors.descricao)}
              {...register('descricao')}
            />
            <FieldError errors={[errors.descricao]} />
          </Field>
          <Field data-invalid={Boolean(errors.valor)}>
            <FieldLabel htmlFor="despesa-valor">Valor (R$)</FieldLabel>
            <Controller
              control={control}
              name="valor"
              render={({ field }) => (
                <CurrencyInput
                  id="despesa-valor"
                  aria-invalid={Boolean(errors.valor)}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError errors={[errors.valor]} />
          </Field>
        </div>
        <div style={{ marginTop: 8 }}>
          <Button type="submit" variant="outline" size="sm">
            Lançar despesa
          </Button>
        </div>
      </form>
      {adicionais.map((a) => (
        <div className="linha-item" key={a.id}>
          <span>
            {a.descricao}{' '}
            <span className="fracao num">· {brl(Number(a.valor) || 0)}</span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setAdicionais(adicionais.filter((x) => x.id !== a.id))}
          >
            remover
          </Button>
        </div>
      ))}
    </div>
  );
}

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CustosView({
  custos,
  provisao,
  provisoesSucessoes,
  issPct,
  setIssPct,
  adicionais,
  setAdicionais,
  manuais = null,
  setManuais,
  ufsForaDetectadas = [],
  nomeCaso = '',
  dataObito,
  caso,
  resultado,
  atribuicoes = {},
  onOrcamento,
  irParaFamilia,
  irParaAcervo,
  avancar,
  rito = null,
}: {
  custos: ProjecaoCustos | null;
  provisao: ProvisaoItcmd | null;
  provisoesSucessoes: { sucessao: SucessaoCumulada; base: number; provisao: ProvisaoItcmd }[];
  /** Alíquota do ISS do município da serventia (%). */
  issPct: string;
  setIssPct: (v: string) => void;
  /** Custos ADICIONAIS lançados à mão — persistem no caso. */
  adicionais: DespesaAdicional[];
  setAdicionais: (d: DespesaAdicional[]) => void;
  /**
   * CASO FORA DE SP — os valores manuais que substituem a projeção (a
   * projeção automática vem NULA quando o modo está ativo; o client silencia
   * os motores). null/inativo = projeção paulista normal.
   */
  manuais?: CustosManuais | null;
  setManuais?: (m: CustosManuais) => void;
  /** UFs fora de SP detectadas no caso (domicílio/registros) — só aviso. */
  ufsForaDetectadas?: string[];
  /** Autor(a) da herança e óbito — cabeçalho da folha de orçamento. */
  nomeCaso?: string;
  dataObito?: string;
  /**
   * O caso e a partilha apurada — o PDF sai COMPLETO com eles (partes,
   * acervo, pizza e quadro bem a bem antes da folha de custos). Sem partilha
   * lançada, o PDF cai na folha enxuta de sempre.
   */
  caso?: Caso;
  resultado?: Resultado | null;
  /** Matriz da partilha diferenciada, quando o escritório lançou alguma. */
  atribuicoes?: Alocacoes;
  /** Telemetria: a folha de orçamento saiu (formato). */
  onOrcamento?: (formato: 'ORCAMENTO_PDF' | 'ORCAMENTO_DOCX') => void;
  irParaFamilia: () => void;
  irParaAcervo: () => void;
  /** Avança para o próximo item da esteira (Documentos). */
  avancar: () => void;
  /** Rito EFETIVO do caso (escolha do dashboard, ou o motor em automático). */
  rito?: 'EXTRAJUDICIAL' | 'JUDICIAL' | null;
}) {
  const [gerando, setGerando] = useState<'pdf' | 'docx' | null>(null);
  const manuaisAtivos = Boolean(manuais?.ativo);
  const totalManual = totalCustosManuais(manuais);
  const temTaxaJudicial = custos?.parcelas.some((p) => p.id === 'taxa-judiciaria') ?? false;
  const impostoSucessoes = provisoesSucessoes.reduce((a, p) => a + p.provisao.total, 0);
  const totalAdicionais = somaAdicionais(adicionais);

  /** Folha de orçamento — mesma tabela do espelho, em PDF ou DOCX editável. */
  const gerarOrcamento = async (formato: 'pdf' | 'docx') => {
    if (!custos && !(manuaisAtivos && manuais)) return;
    setGerando(formato);
    try {
      const { montarOrcamentoPdf, montarOrcamentoDocx } = await import('@/lib/partilha/orcamento');
      // Modo manual (fora de SP): a folha sai com os valores informados —
      // o ITCMD entra como a "provisão" e as demais parcelas com o
      // fundamento honesto de que são do profissional, não das tabelas.
      const fonteManual = manuaisAtivos && manuais
        ? {
            parcelas: parcelasManuais(manuais)
              .filter((l) => l.id !== 'manual-itcmd')
              .map((l) => ({
                rotulo: l.rotulo,
                valor: l.valor,
                detalhe: `Valor informado pelo(a) profissional${manuais.uf ? ` — legislação de ${manuais.uf}` : ''}.`,
                aproximado: false,
              })),
            avisos: manuais.observacao ? [`Nota do escritório: ${manuais.observacao}`] : [],
            provisaoTotal: Number(manuais.itcmd) > 0 ? Number(manuais.itcmd) : null,
          }
        : null;
      const dados = montarDadosOrcamento({
        nomeCaso,
        dataObito,
        rito,
        parcelas: fonteManual ? fonteManual.parcelas : custos!.parcelas,
        avisos: fonteManual ? fonteManual.avisos : custos!.avisos,
        provisaoTotal: fonteManual
          ? fonteManual.provisaoTotal
          : provisao
            ? provisao.total
            : null,
        sucessoes: provisoesSucessoes.map(({ sucessao, provisao: pv }) => ({
          nome: sucessao.nome,
          dataObito: sucessao.dataObito,
          total: pv.total,
        })),
        adicionais,
        geradoEm: new Date().toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' }),
      });
      // O PDF sai COMPLETO quando há partilha apurada; o DOCX segue enxuto —
      // é a folha que o escritório edita e manda para a família.
      const completo =
        formato === 'pdf' && caso && resultado ? await montarDossie(caso, resultado, atribuicoes) : undefined;
      const blob =
        formato === 'pdf'
          ? await montarOrcamentoPdf({ ...dados, completo })
          : await montarOrcamentoDocx(dados);
      baixarBlob(
        blob,
        `Orçamento do inventário${nomeCaso ? ` - ${nomeCaso}` : ''}.${formato === 'pdf' ? 'pdf' : 'docx'}`,
      );
      onOrcamento?.(formato === 'pdf' ? 'ORCAMENTO_PDF' : 'ORCAMENTO_DOCX');
    } finally {
      setGerando(null);
    }
  };

  return (
    <section>
      <h1>Custos do inventário</h1>
      {rito && (
        <p className="eyebrow" style={{ marginBottom: 4 }}>
          Rito {rito === 'EXTRAJUDICIAL' ? 'extrajudicial' : 'judicial'} — escolha no
          dashboard &quot;O Caso&quot;
        </p>
      )}
      {!manuaisAtivos && (rito === 'JUDICIAL' ? (
        <p className="subtitulo">
          A planilha completa além do imposto, no RITO JUDICIAL: a taxa judiciária entra
          por faixas FIXAS de UFESPs sobre o monte-mor (Lei 11.608/2003, art. 4º, §7º, na
          redação da Lei 17.785/2023) no lugar da escritura; os registros das partilhas
          nos imóveis (o formal também vai a registro) e as certidões seguem valendo.
          Diligências, editais, perícias e custas recursais não entram — variam por caso.
        </p>
      ) : (
        <p className="subtitulo">
          A planilha completa além do imposto (tabelas paulistas de 2026, Lei 11.331/2002,
          com o ISS ajustável abaixo — o padrão é 5%, o maior do estado): a escritura é UM
          ato pela LEGÍTIMA (herança descontada a meação), qualquer que seja a quantidade
          de bens, herdeiros ou pagamentos; renúncia entra como ato sem valor declarado por
          renunciante; torna/cessão de direitos hereditários é ato próprio pela base do
          valor da torna, além do imposto inter vivos, se o caso.
        </p>
      ))}

      {/* CASO FORA DE SP — o interruptor honesto: a projeção desta aba é
          calibrada para a legislação paulista; inventário regido por outro
          estado desliga o motor e o profissional informa os valores apurados
          na legislação local. NUNCA liga sozinho — a detecção só avisa. */}
      {!manuaisAtivos && setManuais && (
        <div className={ufsForaDetectadas.length > 0 ? 'nota exigencia' : 'nota'} style={{ marginBottom: 14 }}>
          <span className="eyebrow">Caso fora de São Paulo?</span>
          <p>
            {ufsForaDetectadas.length > 0 && (
              <>
                Este caso tem elementos fora de SP (<strong>{ufsForaDetectadas.join(', ')}</strong>
                ) — último domicílio ou imóvel registrado em outro estado.{' '}
              </>
            )}
            A projeção automática desta aba vale para a <strong>legislação paulista</strong>{' '}
            (ITCMD da Lei 10.705/2000 e tabelas de custas de SP). Cada estado tem lei,
            alíquotas, isenções e emolumentos próprios — para inventário regido por outro
            estado, desligue a projeção e informe os valores apurados na legislação local.
            As demais ferramentas do caso continuam valendo normalmente.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setManuais({
                ...(manuais ?? CUSTOS_MANUAIS_VAZIOS),
                ativo: true,
                uf: manuais?.uf || ufsForaDetectadas[0] || '',
              })
            }
          >
            Preencher custos manualmente
          </Button>
        </div>
      )}

      {manuaisAtivos && manuais && setManuais && (
        <div className="nota" style={{ marginBottom: 14 }}>
          <span className="eyebrow">
            Custos informados pelo profissional{manuais.uf ? ` — ${manuais.uf}` : ''}
          </span>
          <p className="fund" style={{ margin: '4px 0 8px' }}>
            A projeção automática (SP) está <strong>desligada</strong> neste caso: os
            valores abaixo são os que você apurou na legislação do estado — eles valem no
            painel do caso, no custo projetado e na folha de orçamento. Campo sem valor
            não entra na soma.
          </p>
          <div className="grade c2" style={{ maxWidth: 640 }}>
            <label className="campo" style={{ maxWidth: 120 }}>
              UF do inventário
              <Input
                maxLength={2}
                value={manuais.uf}
                onChange={(e) =>
                  setManuais({ ...manuais, uf: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })
                }
              />
            </label>
            <label className="campo">
              ITCMD/ITCD (R$)
              <CurrencyInput
                value={decimalParaMascara(manuais.itcmd)}
                onChange={(m) => setManuais({ ...manuais, itcmd: mascaraParaDecimal(m) })}
              />
            </label>
            <label className="campo">
              Cartório ou custas judiciais (R$)
              <CurrencyInput
                value={decimalParaMascara(manuais.cartorioJustica)}
                onChange={(m) => setManuais({ ...manuais, cartorioJustica: mascaraParaDecimal(m) })}
              />
            </label>
            <label className="campo">
              Registros (R$)
              <CurrencyInput
                value={decimalParaMascara(manuais.registros)}
                onChange={(m) => setManuais({ ...manuais, registros: mascaraParaDecimal(m) })}
              />
            </label>
            <label className="campo">
              Certidões (R$)
              <CurrencyInput
                value={decimalParaMascara(manuais.certidoes)}
                onChange={(m) => setManuais({ ...manuais, certidoes: mascaraParaDecimal(m) })}
              />
            </label>
            <label className="campo campo-longo">
              Nota do escritório (fundamento, guia, referência)
              <Input
                value={manuais.observacao}
                title={manuais.observacao}
                placeholder="Ex.: ITCD-MG 5% (Lei 14.941/2003), guia emitida no SIARE em 20/08"
                onChange={(e) => setManuais({ ...manuais, observacao: e.target.value })}
              />
            </label>
          </div>
          <div style={{ marginTop: 10 }}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setManuais({ ...manuais, ativo: false })}
            >
              Voltar à projeção automática (SP)
            </Button>
          </div>
        </div>
      )}

      {manuaisAtivos && manuais && (
        <Espelho colunas={['Parcela', 'Fundamento', 'Valor']}>
          {parcelasManuais(manuais).map((l) => (
            <LinhaEspelho
              key={l.id}
              nome={l.rotulo}
              meio={`informado pelo(a) profissional${manuais.uf ? ` — ${manuais.uf}` : ''}`}
              valor={brl(l.valor)}
              valorStyle={{ fontSize: 'var(--t-base)' }}
            />
          ))}
          {adicionais.map((a) => (
            <LinhaEspelho
              key={a.id}
              nome={a.descricao || 'Despesa adicional'}
              meio="custo adicional — lançamento do escritório"
              valor={brl(Number(a.valor) || 0)}
              valorStyle={{ fontSize: 'var(--t-base)' }}
            />
          ))}
          <LinhaEspelho
            nome={<>CUSTO TOTAL INFORMADO{totalAdicionais > 0 ? ' + adicionais' : ''}</>}
            valor={brl(totalManual + totalAdicionais)}
            valorStyle={{ fontSize: 'var(--t-lg)' }}
          />
        </Espelho>
      )}

      {!custos && !manuaisAtivos && (
        <p className="mono-alerta">
          Lance a família e os bens (itens I e II) para o cálculo dos custos aparecer.
        </p>
      )}

      {!manuaisAtivos && (
        <div className="grade c2" style={{ marginBottom: 14, maxWidth: 420 }}>
          <label className="campo">
            <span>
              ISS do município da serventia (%){' '}
              <span className="dica">— a tabela oficial é publicada com 5%, o maior do estado</span>
            </span>
            <Input
              inputMode="decimal"
              value={issPct}
              onChange={(e) => setIssPct(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
            />
          </label>
        </div>
      )}

      {custos && (
        <>
          <Espelho colunas={['Parcela', 'Fundamento', 'Valor']}>
            {custos.parcelas.map((p) => (
              <Fragment key={p.id}>
                <LinhaEspelho
                  nome={
                    <>
                      {p.rotulo}
                      {p.aproximado ? ' *' : ''}
                    </>
                  }
                  meio={p.fundamento}
                  valor={brl(p.valor)}
                  valorStyle={{ fontSize: 'var(--t-base)' }}
                />
                {p.detalhe && <FundEspelho>{p.detalhe}</FundEspelho>}
              </Fragment>
            ))}
            {provisoesSucessoes.map(({ sucessao, base, provisao: pv }) => (
              <Fragment key={sucessao.id}>
                <LinhaEspelho
                  nome={<>ITCMD — sucessão cumulada de {sucessao.nome}</>}
                  meio={<>fato gerador em {formatarData(sucessao.dataObito)}</>}
                  valor={brl(pv.total)}
                  valorStyle={{ fontSize: 'var(--t-base)' }}
                />
                <FundEspelho>
                  Base de {brl(base)} (acervo por sucessão ou lançamento do item I) atualizada
                  para {brl(pv.baseAtualizada)};{' '}
                  {pv.diasDeAtraso > 0
                    ? `${pv.diasDeAtraso} dia(s) após o vencimento desta sucessão (encargos incluídos).`
                    : 'dentro do prazo desta sucessão.'}
                </FundEspelho>
              </Fragment>
            ))}
            {adicionais.map((a) => (
              <LinhaEspelho
                key={a.id}
                nome={a.descricao || 'Despesa adicional'}
                meio="custo adicional — lançamento do escritório"
                valor={brl(Number(a.valor) || 0)}
                valorStyle={{ fontSize: 'var(--t-base)' }}
              />
            ))}
            <LinhaEspelho
              nome={<>Custos cartorários{temTaxaJudicial ? ' e judiciais' : ''}{impostoSucessoes > 0 ? ' + ITCMD das sucessões cumuladas' : ''}{totalAdicionais > 0 ? ' + adicionais' : ''}</>}
              valor={brl(custos.total + impostoSucessoes + totalAdicionais)}
              valorStyle={{ fontSize: 'var(--t-lg)' }}
            />
            {provisao && (
              <LinhaEspelho
                nome={<>CUSTO TOTAL PROJETADO (ITCMD + cartório{temTaxaJudicial ? ' + justiça' : ''}{totalAdicionais > 0 ? ' + adicionais' : ''})</>}
                meio="provisão do item IV"
                valor={brl(provisao.total + custos.total + impostoSucessoes + totalAdicionais)}
                valorStyle={{ fontSize: 'var(--t-lg)' }}
              />
            )}
          </Espelho>
          <p className="fund" style={{ marginTop: 6 }}>
            * valor aproximado ou contagem de atos a confirmar — conferir a tabela vigente
            (anoregsp.org.br · registrodeimoveis.org.br · registrocivil.org.br) e os
            enunciados do CNB/SP antes de fechar o orçamento com a família.
          </p>
          {custos.avisos.map((a, i) => (
            <p key={i} className="fund" style={{ marginTop: 6 }}>
              {a}
            </p>
          ))}
        </>
      )}

      <EditorDespesasAdicionais adicionais={adicionais} setAdicionais={setAdicionais} />

      {(custos || manuaisAtivos) && (
        <div style={{ marginTop: 18 }}>
          <span className="eyebrow">Folha de orçamento</span>
          <p className="fund" style={{ margin: '4px 0 8px' }}>
            {caso && resultado ? (
              <>
                O <strong>PDF sai completo</strong>, para apresentar à família: autor(a)
                da herança, meeiro(a) e herdeiros, o acervo com os valores de avaliação, o
                gráfico da divisão, o quadro da partilha bem a bem e, ao final, esta
                planilha de custos. O <strong>DOCX</strong> traz só a planilha (Item ·
                Valor), para editar antes de entregar.
              </>
            ) : (
              <>
                A planilha acima numa folha apresentável à família, enxuta (Item · Valor) —
                em PDF nas cores do módulo, ou em DOCX para editar antes de entregar.
                Lance a partilha (item III) e o PDF passa a sair completo, com as partes, o
                acervo, o gráfico da divisão e o quadro bem a bem.
              </>
            )}
          </p>
          <div className="escolha">
            <Button
              type="button"
              loading={gerando === 'pdf'}
              disabled={gerando !== null}
              onClick={() => void gerarOrcamento('pdf')}
            >
              {caso && resultado ? 'Baixar PDF completo' : 'Baixar orçamento (PDF)'}
            </Button>
            <Button
              type="button"
              variant="outline"
              loading={gerando === 'docx'}
              disabled={gerando !== null}
              onClick={() => void gerarOrcamento('docx')}
            >
              Orçamento editável (DOCX)
            </Button>
          </div>
        </div>
      )}

      {/* O LANÇAMENTO das sucessões cumuladas fica no item I (A família) —
          aqui a planilha só reflete o impacto delas nos custos. */}
      {provisoesSucessoes.length === 0 && (
        <p className="fund" style={{ marginTop: 18 }}>
          Inventário com duas ou mais sucessões (cônjuge pré-morto, herdeiro falecido
          depois…)? Lance as sucessões cumuladas no item I —{' '}
          <Button variant="ghost" size="sm" onClick={irParaFamilia}>
            ir para A família
          </Button>{' '}
          — e cada uma entra aqui com o próprio fato gerador, escritura e registros.
        </p>
      )}

      <div className="rodape-acoes">
        <Button variant="outline" onClick={irParaAcervo}>
          Voltar ao acervo
        </Button>
        <Button onClick={avancar}>Avançar aos documentos</Button>
      </div>
    </section>
  );
}
