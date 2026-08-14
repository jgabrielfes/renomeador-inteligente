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

import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/currency-input';
import { DateInput } from '@/components/date-input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import type { ProjecaoCustos } from '@/lib/partilha/custas';
import type { ProvisaoItcmd } from '@/lib/partilha/itcmd';
import { formatarData } from '@/lib/partilha/familia';
import type { SucessaoCumulada } from './itcmd-view';

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const uid = () => `su-${crypto.randomUUID().slice(0, 8)}`;

const esquemaSucessao = z.object({
  nome: z.string().trim().min(1, 'Informe o nome do(a) autor(a) desta sucessão.'),
  dataObito: z.string().min(1, 'Informe a data do óbito — é o fato gerador desta sucessão.'),
  base: z.string().trim().min(1, 'Informe a base transmitida nesta sucessão.'),
  qtdImoveis: z.string().regex(/^\d*$/, 'Use apenas números.'),
});

type NovaSucessao = z.infer<typeof esquemaSucessao>;

export function CustosView({
  custos,
  provisao,
  sucessoes,
  setSucessoes,
  provisoesSucessoes,
  issPct,
  setIssPct,
  irParaAcervo,
  irParaItcmd,
}: {
  custos: ProjecaoCustos | null;
  provisao: ProvisaoItcmd | null;
  sucessoes: SucessaoCumulada[];
  setSucessoes: (s: SucessaoCumulada[]) => void;
  provisoesSucessoes: { sucessao: SucessaoCumulada; provisao: ProvisaoItcmd }[];
  /** Alíquota do ISS do município da serventia (%). */
  issPct: string;
  setIssPct: (v: string) => void;
  irParaAcervo: () => void;
  irParaItcmd: () => void;
}) {
  const temTaxaJudicial = custos?.parcelas.some((p) => p.id === 'taxa-judiciaria') ?? false;
  const impostoSucessoes = provisoesSucessoes.reduce((a, p) => a + p.provisao.total, 0);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovaSucessao>({
    resolver: zodResolver(esquemaSucessao),
    defaultValues: { nome: '', dataObito: '', base: '', qtdImoveis: '' },
  });

  const lancarSucessao = (dados: NovaSucessao) => {
    const decimal = Number(dados.base.replace(/\./g, '').replace(',', '.'));
    setSucessoes([
      ...sucessoes,
      {
        id: uid(),
        nome: dados.nome,
        dataObito: dados.dataObito,
        base: (Number.isFinite(decimal) ? decimal : 0).toFixed(2),
        qtdImoveis: Number(dados.qtdImoveis) || 0,
      },
    ]);
    reset();
  };

  return (
    <section>
      <h1>Custos do inventário</h1>
      <p className="subtitulo">
        A planilha completa além do imposto (tabelas paulistas de 2026, Lei 11.331/2002,
        com o ISS ajustável abaixo — o padrão é 5%, o maior do estado): a escritura é UM
        ato pela LEGÍTIMA (herança descontada a meação), qualquer que seja a quantidade
        de bens, herdeiros ou pagamentos; renúncia entra como ato sem valor declarado por
        renunciante; torna/cessão de direitos hereditários é ato próprio pela base do
        valor da torna, além do imposto inter vivos, se o caso.
      </p>

      {!custos && (
        <p className="mono-alerta">
          Lance a família e os bens (itens I e II) para o cálculo dos custos aparecer.
        </p>
      )}

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

      {custos && (
        <>
          <div className="espelho">
            <div className="cabeca">
              <span>Parcela</span>
              <span>Fundamento</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
            </div>
            {custos.parcelas.map((p) => (
              <div key={p.id}>
                <div className="lanc">
                  <span className="nome">
                    {p.rotulo}
                    {p.aproximado ? ' *' : ''}
                  </span>
                  <span className="fracao">{p.fundamento}</span>
                  <span className="valor num" style={{ fontSize: 17 }}>{brl(p.valor)}</span>
                </div>
                {p.detalhe && <div className="fund">{p.detalhe}</div>}
              </div>
            ))}
            {provisoesSucessoes.map(({ sucessao, provisao: pv }) => (
              <div key={sucessao.id}>
                <div className="lanc">
                  <span className="nome">ITCMD — sucessão cumulada de {sucessao.nome}</span>
                  <span className="fracao">fato gerador em {formatarData(sucessao.dataObito)}</span>
                  <span className="valor num" style={{ fontSize: 17 }}>{brl(pv.total)}</span>
                </div>
                <div className="fund">
                  Base de {brl(Number(sucessao.base))} atualizada para {brl(pv.baseAtualizada)};{' '}
                  {pv.diasDeAtraso > 0
                    ? `${pv.diasDeAtraso} dia(s) após o vencimento desta sucessão (encargos incluídos).`
                    : 'dentro do prazo desta sucessão.'}
                </div>
              </div>
            ))}
            <div className="lanc">
              <span className="nome">Custos cartorários{temTaxaJudicial ? ' e judiciais' : ''}{impostoSucessoes > 0 ? ' + ITCMD das sucessões cumuladas' : ''}</span>
              <span />
              <span className="valor num" style={{ fontSize: 18 }}>{brl(custos.total + impostoSucessoes)}</span>
            </div>
            {provisao && (
              <div className="lanc">
                <span className="nome">
                  CUSTO TOTAL PROJETADO (ITCMD + cartório{temTaxaJudicial ? ' + justiça' : ''})
                </span>
                <span className="fracao">provisão do item IV</span>
                <span className="valor num" style={{ fontSize: 22 }}>
                  {brl(provisao.total + custos.total + impostoSucessoes)}
                </span>
              </div>
            )}
          </div>
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

      {/* ---------- sucessões cumuladas (CPC, art. 672) ---------- */}
      <h2>Sucessões cumuladas no mesmo inventário</h2>
      <p className="subtitulo" style={{ marginBottom: 10 }}>
        Inventário conjunto (cônjuge pré-morto, herdeiro falecido depois…): cada sucessão
        tem o PRÓPRIO fato gerador — o ITCMD é calculado pela UFESP e pelos prazos da data
        do óbito respectiva, e a escritura e os registros ganham atos próprios.
      </p>

      {sucessoes.map((su) => (
        <div key={su.id} className="linha-item">
          <span>
            <strong>{su.nome}</strong>
            <span className="fracao num">
              {' '}
              · óbito em {su.dataObito ? formatarData(su.dataObito) : '—'} · base{' '}
              {brl(Number(su.base))} · {su.qtdImoveis} imóvel(is)
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setSucessoes(sucessoes.filter((x) => x.id !== su.id))}
          >
            remover
          </Button>
        </div>
      ))}

      <form noValidate onSubmit={handleSubmit(lancarSucessao)}>
        <div className="grade c2" style={{ marginTop: 10 }}>
          <Field data-invalid={Boolean(errors.nome)}>
            <FieldLabel htmlFor="sucessao-nome">Autor(a) da sucessão cumulada</FieldLabel>
            <Input id="sucessao-nome" aria-invalid={Boolean(errors.nome)} {...register('nome')} />
            <FieldError errors={[errors.nome]} />
          </Field>
          <Field data-invalid={Boolean(errors.dataObito)}>
            <FieldLabel>Data do óbito (fato gerador)</FieldLabel>
            <Controller
              control={control}
              name="dataObito"
              render={({ field }) => <DateInput value={field.value} onChange={field.onChange} />}
            />
            <FieldError errors={[errors.dataObito]} />
          </Field>
          <Field data-invalid={Boolean(errors.base)}>
            <FieldLabel htmlFor="sucessao-base">Base transmitida (R$)</FieldLabel>
            <Controller
              control={control}
              name="base"
              render={({ field }) => (
                <CurrencyInput
                  id="sucessao-base"
                  aria-invalid={Boolean(errors.base)}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError errors={[errors.base]} />
          </Field>
          <Field data-invalid={Boolean(errors.qtdImoveis)}>
            <FieldLabel htmlFor="sucessao-imoveis">Imóveis envolvidos (nº)</FieldLabel>
            <Input
              id="sucessao-imoveis"
              inputMode="numeric"
              aria-invalid={Boolean(errors.qtdImoveis)}
              {...register('qtdImoveis')}
            />
            <FieldError errors={[errors.qtdImoveis]} />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="outline">
            Adicionar sucessão
          </Button>
        </div>
      </form>

      <div className="rodape-acoes">
        <Button variant="outline" onClick={irParaAcervo}>
          Voltar ao acervo
        </Button>
        <Button onClick={irParaItcmd}>Ver o ITCMD</Button>
      </div>
    </section>
  );
}
