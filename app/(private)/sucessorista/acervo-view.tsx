/**
 * Item II — O acervo.
 *
 * Bens pelo valor da data do óbito (a natureza comum × particular decide a
 * meação e a concorrência no regime parcial), passivo do espólio e as fontes
 * de pesquisa patrimonial na ordem de prioridade. O painel ao lado reage a
 * cada lançamento.
 */

import { useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/currency-input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { AvaliacaoBemSucessao, Bem, Herdeiro, TipoBem } from '@/lib/partilha/types';
import type { Colacao } from '@/lib/partilha/colacao';
import { TIPOS_BEM_ITCMD, tipoBemItcmd } from '@/lib/partilha/tipos-itcmd';
import type { SucessaoCumulada } from './itcmd-view';
import type { AvaliacaoQuotas, SociedadeExtraida } from '@/lib/partilha/sociedade';

export interface ResumoSociedade {
  chave: string;
  sociedade: SociedadeExtraida;
  avaliacao: AvaliacaoQuotas | null;
}

// Aleatório (não sequencial): o caso volta do sessionStorage e um contador
// zerado no reload geraria ids que colidem com os bens restaurados.
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

const brl = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

const ROTULO_TIPO_BEM: Record<TipoBem, string> = {
  IMOVEL: 'imóvel',
  VEICULO: 'veículo',
  FINANCEIRO: 'conta/aplicação',
  QUOTAS: 'quotas/ações',
  OUTRO: 'outro',
};

const VALOR_PTBR = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/;

/**
 * Seletor de tipo do bem com a lista OFICIAL da declaração do ITCMD-SP
 * (códigos 101–199) — janela rolável igual à do sistema da Sefaz. O código
 * escolhido mapeia para o TipoBem interno (isenções, Detran, cláusulas).
 */
function SeletorTipoItcmd({
  value,
  onChange,
  invalido,
}: {
  value: string;
  onChange: (codigo: string) => void;
  invalido?: boolean;
}) {
  return (
    <Select value={value || null} onValueChange={(v) => v && onChange(String(v))}>
      <SelectTrigger aria-label="Tipo do bem (lista do ITCMD-SP)" aria-invalid={invalido}>
        <SelectValue placeholder="Selecione na lista do ITCMD-SP…" />
      </SelectTrigger>
      <SelectContent className="max-h-[min(60vh,420px)] w-max max-w-[min(92vw,540px)]">
        {TIPOS_BEM_ITCMD.map((t) => (
          <SelectItem key={t.codigo} value={t.codigo}>
            <span className="num">{t.codigo}</span>
            <span className="whitespace-normal">{t.rotulo}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Rótulo curto do tipo para as linhas da lista: o código + nome oficial. */
function rotuloDoBem(bem: Bem): string {
  const oficial = tipoBemItcmd(bem.codigoItcmd);
  if (oficial) return `${oficial.codigo} · ${oficial.rotulo}`;
  return ROTULO_TIPO_BEM[bem.tipo ?? 'OUTRO'];
}

/**
 * Valores do bem por classe (pedido do escritório — NÃO são opcionais):
 * IMÓVEL lança TRÊS valores (venal na data do óbito, venal do exercício
 * corrente e avaliação); os demais bens lançam DOIS (venal na data do óbito
 * e avaliação). O ITCMD sai pelo MAIOR entre venal do óbito e avaliação; as
 * custas notariais/registrais, pelo MAIOR dos três (Enunciado 7 do CNB/SP).
 */
const esquemaBem = z
  .object({
    descricao: z.string().trim().min(1, 'Descreva o bem — ex.: "Imóvel mat. 12.345 — Guarulhos/SP".'),
    valor: z
      .string()
      .trim()
      .min(1, 'Informe o valor venal na data do óbito.')
      .regex(VALOR_PTBR, 'Valor inválido — use o formato 900.000,00.'),
    codigo: z.string().min(1, 'Escolha o tipo na lista da declaração do ITCMD-SP.'),
    natureza: z.enum(['COMUM', 'PARTICULAR']),
    valorVenal: z.string().trim().refine((v) => v === '' || VALOR_PTBR.test(v), 'Valor inválido.'),
    valorAvaliacao: z
      .string()
      .trim()
      .min(1, 'Informe o valor de avaliação.')
      .regex(VALOR_PTBR, 'Valor inválido — use o formato 900.000,00.'),
    // Campos da DECLARAÇÃO do ITCMD-SP por tipo (opcionais no lançamento —
    // a leitura do cofre também os preenche): imóvel × ativo financeiro.
    municipio: z.string().trim(),
    inscricaoCadastral: z.string().trim(),
    matricula: z.string().trim(),
    registroImoveis: z.string().trim(),
    instituicao: z.string().trim(),
    agencia: z.string().trim(),
    conta: z.string().trim(),
  })
  .superRefine((dados, ctx) => {
    // O venal do exercício corrente é campo de IMÓVEL — e lá é obrigatório.
    if (tipoBemItcmd(dados.codigo)?.tipo === 'IMOVEL' && !dados.valorVenal.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['valorVenal'],
        message: 'Informe o valor venal do exercício corrente.',
      });
    }
  });

type NovoBem = z.infer<typeof esquemaBem>;

export function paraDecimal(valor: string): string {
  const limpo = valor.replace(/\./g, '').replace(',', '.');
  return Number(limpo).toFixed(2);
}

/** Base das custas: o MAIOR entre valor atribuído, venal e avaliação. */
export function baseDeCustaMaior(bem: Bem): number {
  return Math.max(
    Number(bem.valor) || 0,
    Number(bem.valorVenal) || 0,
    Number(bem.valorAvaliacao) || 0,
  );
}

/** Decimal armazenado ("900000.00") → texto mascarado do CurrencyInput. */
function paraMascara(valorDecimal: string): string {
  return Number(valorDecimal).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function AcervoView({
  bens,
  setBens,
  dividas,
  setDividas,
  herdeiros = [],
  colacoes = [],
  setColacoes,
  sociedades = [],
  sucessoes = [],
  voltar,
  avancar,
}: {
  bens: Bem[];
  setBens: (b: Bem[]) => void;
  dividas: string;
  setDividas: (v: string) => void;
  /** Herdeiros do item I — donatários possíveis da colação. */
  herdeiros?: Herdeiro[];
  /** Bens levados à COLAÇÃO (CC 2.002): abatem o quinhão do donatário. */
  colacoes?: Colacao[];
  setColacoes?: (c: Colacao[]) => void;
  sociedades?: ResumoSociedade[];
  /** Sucessões cumuladas do caso: abrem a avaliação POR SUCESSÃO em cada bem. */
  sucessoes?: SucessaoCumulada[];
  voltar: () => void;
  avancar: () => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovoBem>({
    resolver: zodResolver(esquemaBem),
    defaultValues: {
      descricao: '', valor: '', codigo: '101', natureza: 'COMUM', valorVenal: '', valorAvaliacao: '',
      municipio: '', inscricaoCadastral: '', matricula: '', registroImoveis: '',
      instituicao: '', agencia: '', conta: '',
    },
  });
  // O TIPO é a primeira lacuna: decide os campos de valor (imóvel = 3,
  // demais = 2) e os campos da declaração que abrem (imóvel × financeiro).
  const codigoEscolhido = useWatch({ control, name: 'codigo' });
  const ehImovel = tipoBemItcmd(codigoEscolhido)?.tipo === 'IMOVEL';
  const ehFinanceiro = tipoBemItcmd(codigoEscolhido)?.tipo === 'FINANCEIRO';

  const lancar = (dados: NovoBem) => {
    const imovel = ehImovel
      ? Object.fromEntries(
          Object.entries({
            municipio: dados.municipio,
            inscricaoCadastral: dados.inscricaoCadastral,
            matricula: dados.matricula,
            registroImoveis: dados.registroImoveis,
          }).filter(([, v]) => v !== ''),
        )
      : {};
    const financeiro = ehFinanceiro
      ? Object.fromEntries(
          Object.entries({
            instituicao: dados.instituicao,
            agencia: dados.agencia,
            conta: dados.conta,
          }).filter(([, v]) => v !== ''),
        )
      : {};
    setBens([
      ...bens,
      {
        id: uid('b'),
        descricao: dados.descricao,
        valor: paraDecimal(dados.valor),
        natureza: dados.natureza,
        tipo: tipoBemItcmd(dados.codigo)?.tipo ?? 'OUTRO',
        codigoItcmd: dados.codigo,
        ...(dados.valorVenal.trim() ? { valorVenal: paraDecimal(dados.valorVenal) } : {}),
        ...(dados.valorAvaliacao.trim() ? { valorAvaliacao: paraDecimal(dados.valorAvaliacao) } : {}),
        ...(Object.keys(imovel).length > 0 ? { imovel } : {}),
        ...(Object.keys(financeiro).length > 0 ? { financeiro } : {}),
      },
    ]);
    reset({
      descricao: '', valor: '', codigo: dados.codigo, natureza: dados.natureza,
      valorVenal: '', valorAvaliacao: '', municipio: '', inscricaoCadastral: '',
      matricula: '', registroImoveis: '', instituicao: '', agencia: '', conta: '',
    });
  };

  return (
    <section>
      <h1>O acervo</h1>
      <p className="subtitulo">
        Bens pelo valor da data do óbito. A natureza — comum ou particular — decide a meação
        e, no regime parcial, decide se o(a) sobrevivente concorre com os filhos. O tipo do
        bem alimenta as isenções e o checklist do ITCMD.
      </p>

      <h2 style={{ marginTop: 0 }}>Bens</h2>
      <form noValidate onSubmit={handleSubmit(lancar)}>
        <div className="grade c2">
          {/* O TIPO abre o lançamento (pedido do escritório): a escolha na
              lista oficial decide quais campos da declaração aparecem. */}
          <Field data-invalid={Boolean(errors.codigo)}>
            <FieldLabel>Tipo do bem (declaração do ITCMD-SP)</FieldLabel>
            <Controller
              control={control}
              name="codigo"
              render={({ field }) => (
                <SeletorTipoItcmd
                  value={field.value}
                  onChange={field.onChange}
                  invalido={Boolean(errors.codigo)}
                />
              )}
            />
            <FieldError errors={[errors.codigo]} />
          </Field>
          <Field data-invalid={Boolean(errors.descricao)}>
            <FieldLabel htmlFor="bem-descricao">Descrição</FieldLabel>
            <Input
              id="bem-descricao"
              aria-invalid={Boolean(errors.descricao)}
              {...register('descricao')}
            />
            <FieldError errors={[errors.descricao]} />
          </Field>
          {/* Campos da DECLARAÇÃO por tipo — imóvel: identificação registral
              e municipal; financeiro: instituição/agência/conta. A leitura
              do cofre preenche os mesmos campos automaticamente. */}
          {ehImovel && (
            <>
              <Field>
                <FieldLabel htmlFor="bem-municipio">Município do imóvel</FieldLabel>
                <Input id="bem-municipio" placeholder="ex.: Guarulhos/SP" {...register('municipio')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bem-inscricao">Inscrição cadastral (nº do contribuinte)</FieldLabel>
                <Input id="bem-inscricao" placeholder="ex.: 084.33.20.0048.01.000" {...register('inscricaoCadastral')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bem-matricula">Matrícula</FieldLabel>
                <Input id="bem-matricula" placeholder="ex.: 12.345" {...register('matricula')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bem-ri">Registro de Imóveis (cartório)</FieldLabel>
                <Input id="bem-ri" placeholder="ex.: 1º RI de Guarulhos/SP" {...register('registroImoveis')} />
              </Field>
            </>
          )}
          {ehFinanceiro && (
            <>
              <Field>
                <FieldLabel htmlFor="bem-banco">Instituição financeira</FieldLabel>
                <Input id="bem-banco" placeholder="ex.: Banco do Brasil S.A." {...register('instituicao')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bem-agencia">Agência</FieldLabel>
                <Input id="bem-agencia" placeholder="ex.: 1234-5" {...register('agencia')} />
              </Field>
              <Field>
                <FieldLabel htmlFor="bem-conta">Conta (com dígito)</FieldLabel>
                <Input id="bem-conta" placeholder="ex.: 45.678-9" {...register('conta')} />
              </Field>
            </>
          )}
          <Field data-invalid={Boolean(errors.valor)}>
            <FieldLabel htmlFor="bem-valor">Valor venal na data do óbito (R$)</FieldLabel>
            <Controller
              control={control}
              name="valor"
              render={({ field }) => (
                <CurrencyInput
                  id="bem-valor"
                  aria-invalid={Boolean(errors.valor)}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError errors={[errors.valor]} />
          </Field>
          <Field>
            <FieldLabel>Natureza</FieldLabel>
            <Controller
              control={control}
              name="natureza"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v && field.onChange(String(v))}>
                  <SelectTrigger aria-label="Natureza do bem">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="COMUM">Comum (adquirido na constância)</SelectItem>
                    <SelectItem value="PARTICULAR">Particular (herança, doação, anterior)</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
          {/* Venal do exercício corrente: campo de IMÓVEL (códigos 1xx da
              lista) — abre conforme o tipo escolhido, e lá é obrigatório. */}
          {ehImovel && (
            <Field data-invalid={Boolean(errors.valorVenal)}>
              <FieldLabel htmlFor="bem-venal">Valor venal do exercício corrente (R$)</FieldLabel>
              <Controller
                control={control}
                name="valorVenal"
                render={({ field }) => (
                  <CurrencyInput
                    id="bem-venal"
                    aria-invalid={Boolean(errors.valorVenal)}
                    value={field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <FieldError errors={[errors.valorVenal]} />
            </Field>
          )}
          <Field data-invalid={Boolean(errors.valorAvaliacao)}>
            <FieldLabel htmlFor="bem-avaliacao">Valor de avaliação (R$)</FieldLabel>
            <Controller
              control={control}
              name="valorAvaliacao"
              render={({ field }) => (
                <CurrencyInput
                  id="bem-avaliacao"
                  aria-invalid={Boolean(errors.valorAvaliacao)}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError errors={[errors.valorAvaliacao]} />
          </Field>
        </div>
        <p className="fund" style={{ marginTop: 6 }}>
          O ITCMD é calculado sobre o MAIOR entre o valor venal na data do óbito e o valor
          de avaliação; as custas notariais e registrais, sobre o MAIOR entre venal do
          óbito, venal do exercício corrente e avaliação (Enunciado 7 do CNB/SP).
        </p>
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="outline">
            Lançar bem
          </Button>
        </div>
      </form>

      {bens.map((b, i) => (
        <LinhaBem
          key={b.id}
          bem={b}
          numero={i + 1}
          sucessoes={sucessoes}
          ehPrimeiro={i === 0}
          ehUltimo={i === bens.length - 1}
          onMover={(delta) => {
            const destino = i + delta;
            if (destino < 0 || destino >= bens.length) return;
            const proximos = [...bens];
            [proximos[i], proximos[destino]] = [proximos[destino], proximos[i]];
            setBens(proximos);
          }}
          onSalvar={(atualizado) => setBens(bens.map((x) => (x.id === b.id ? atualizado : x)))}
          onRemover={() => setBens(bens.filter((x) => x.id !== b.id))}
        />
      ))}
      {bens.length > 1 && (
        <p className="fund" style={{ marginTop: 6 }}>
          A numeração acima é a ordem oficial do caso: partilha, planilha e petição seguem a
          mesma sequência — use as setas para reordenar.
        </p>
      )}

      {sociedades.length > 0 && (
        <>
          <h2>Participações societárias lidas</h2>
          <p className="subtitulo" style={{ marginBottom: 8 }}>
            Do contrato social e do balanço patrimonial. A base das quotas é o MAIOR entre o
            patrimônio líquido e o capital social, na proporção do(a) falecido(a) — ou do
            casal, nos regimes de comunhão. Confira antes de confiar.
          </p>
          <div className="check">
            {sociedades.map(({ chave, sociedade, avaliacao }) => (
              <div className="check-item" key={chave}>
                <span className="prio">{avaliacao ? '✓' : '!'}</span>
                <div>
                  <h4>
                    {sociedade.empresa}
                    {sociedade.cnpj ? <span className="fracao num"> · CNPJ {sociedade.cnpj}</span> : null}
                  </h4>
                  <p className="num">
                    Capital social: {sociedade.capitalSocial ? brl(sociedade.capitalSocial) : '— (junte o contrato social)'} · Patrimônio
                    líquido: {sociedade.patrimonioLiquido ? brl(sociedade.patrimonioLiquido) : '— (junte o balanço)'}
                  </p>
                  {sociedade.socios.length > 0 && (
                    <p>
                      Quadro de sócios:{' '}
                      {sociedade.socios
                        .map((s) => `${s.nome}${s.percentual !== null ? ` (${s.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)` : ' (% ilegível)'}`)
                        .join(' · ')}
                    </p>
                  )}
                  {avaliacao ? (
                    <>
                      <p className="fund" style={{ color: 'var(--verde-registro)' }}>
                        Lançada no acervo: {brl(avaliacao.valor)} — {avaliacao.percentual.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de {brl(avaliacao.base)} (
                        {avaliacao.fonteBase === 'PATRIMONIO_LIQUIDO' ? 'patrimônio líquido' : 'capital social'}), titulares: {avaliacao.titulares.join(' e ')}.
                      </p>
                      {avaliacao.avisos.map((a, i) => (
                        <p key={i} className="alerta">{a}</p>
                      ))}
                    </>
                  ) : (
                    <p className="alerta">
                      Nem o(a) falecido(a) nem o cônjuge constam do quadro de sócios lido (ou
                      faltam valores) — confira os nomes no item I ou lance o bem manualmente.
                    </p>
                  )}
                </div>
                <span />
              </div>
            ))}
          </div>
        </>
      )}

      <h2>Passivo do espólio</h2>
      <div className="grade c2">
        <label className="campo">
          Dívidas e despesas do espólio (R$)
          <CurrencyInput value={dividas} onChange={setDividas} />
        </label>
      </div>
      <p className="fund" style={{ marginTop: 6 }}>
        Financiamentos, empréstimos e despesas abatem a massa antes da partilha — e reduzem a
        base do ITCMD.
      </p>

      {setColacoes && (
        <EditorColacoes herdeiros={herdeiros} colacoes={colacoes} setColacoes={setColacoes} />
      )}

      <div className="rodape-acoes">
        <Button variant="outline" onClick={voltar}>
          Voltar à família
        </Button>
        <Button onClick={avancar} disabled={bens.length === 0}>
          Calcular a partilha
        </Button>
      </div>
    </section>
  );
}

/* ---------- bens levados à COLAÇÃO (CC, arts. 2.002–2.012) ---------- */

const esquemaColacao = z.object({
  herdeiroId: z.string().min(1, 'Escolha o(a) herdeiro(a) que recebeu a doação.'),
  descricao: z.string().trim().min(1, 'Descreva o bem doado em vida.'),
  valor: z
    .string()
    .trim()
    .min(1, 'Informe o valor de colação.')
    .regex(VALOR_PTBR, 'Valor inválido — use 1.234,56.'),
});

type NovaColacao = z.infer<typeof esquemaColacao>;

/**
 * Bens doados em vida a herdeiros que voltam à massa de CÁLCULO (colação):
 * o valor soma ao monte fictício e ABATE do quinhão do donatário na partilha
 * — a lista abre por herdeiro, com o bem e o valor a abater.
 */
function EditorColacoes({
  herdeiros,
  colacoes,
  setColacoes,
}: {
  herdeiros: Herdeiro[];
  colacoes: Colacao[];
  setColacoes: (c: Colacao[]) => void;
}) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovaColacao>({
    resolver: zodResolver(esquemaColacao),
    defaultValues: { herdeiroId: '', descricao: '', valor: '' },
  });

  const nomeDo = (id: string) => herdeiros.find((h) => h.id === id)?.nome ?? '(herdeiro removido)';

  const lancar = (dados: NovaColacao) => {
    const decimal = Number(dados.valor.replace(/\./g, '').replace(',', '.'));
    setColacoes([
      ...colacoes,
      {
        id: uid('col'),
        herdeiroId: dados.herdeiroId,
        descricao: dados.descricao.trim(),
        valor: (Number.isFinite(decimal) ? decimal : 0).toFixed(2),
      },
    ]);
    reset();
  };

  return (
    <>
      <h2>Bens levados à colação</h2>
      <p className="subtitulo" style={{ marginBottom: 10 }}>
        Doações em vida a descendentes voltam à massa de CÁLCULO para igualar as legítimas
        (CC, art. 2.002): o valor soma ao monte fictício e ABATE do quinhão de quem já
        recebeu — o espelho do item III mostra o quadro ajustado. Lance por herdeiro o bem
        doado e o valor de colação (CC, art. 2.004).
      </p>
      <div className="cartao">
        {colacoes.map((c) => (
          <div key={c.id} className="linha-item">
            <span>
              <strong>{nomeDo(c.herdeiroId)}</strong>
              <span className="fracao">
                {' '}
                · {c.descricao} ·{' '}
                <span className="num">{brl(c.valor)}</span> a abater na partilha
              </span>
            </span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setColacoes(colacoes.filter((x) => x.id !== c.id))}
            >
              remover
            </Button>
          </div>
        ))}

        {herdeiros.length === 0 ? (
          <p className="fund">Lance os herdeiros no item I para registrar colações.</p>
        ) : (
          <form noValidate onSubmit={handleSubmit(lancar)}>
            <div className="grade c3" style={{ marginTop: colacoes.length > 0 ? 12 : 0 }}>
              <Field data-invalid={Boolean(errors.herdeiroId)}>
                <FieldLabel>Herdeiro(a) donatário(a)</FieldLabel>
                <Controller
                  control={control}
                  name="herdeiroId"
                  render={({ field }) => (
                    <Select value={field.value || null} onValueChange={(v) => v && field.onChange(String(v))}>
                      <SelectTrigger aria-invalid={Boolean(errors.herdeiroId)}>
                        <SelectValue placeholder="Quem recebeu a doação" />
                      </SelectTrigger>
                      <SelectContent>
                        {herdeiros.map((h) => (
                          <SelectItem key={h.id} value={h.id}>
                            {h.nome || '(sem nome)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[errors.herdeiroId]} />
              </Field>
              <Field data-invalid={Boolean(errors.descricao)}>
                <FieldLabel htmlFor="colacao-descricao">Bem doado em vida</FieldLabel>
                <Input
                  id="colacao-descricao"
                  aria-invalid={Boolean(errors.descricao)}
                  {...register('descricao')}
                />
                <FieldError errors={[errors.descricao]} />
              </Field>
              <Field data-invalid={Boolean(errors.valor)}>
                <FieldLabel htmlFor="colacao-valor">Valor de colação (R$)</FieldLabel>
                <Controller
                  control={control}
                  name="valor"
                  render={({ field }) => (
                    <CurrencyInput
                      id="colacao-valor"
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
            <div style={{ marginTop: 12 }}>
              <Button type="submit" variant="outline">
                Adicionar colação
              </Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}

/**
 * Linha de bem lançado, com edição inline (convenção do projeto: edição de
 * valores em lista usa validação ad-hoc, não react-hook-form).
 */
function LinhaBem({
  bem,
  numero,
  sucessoes = [],
  ehPrimeiro,
  ehUltimo,
  onMover,
  onSalvar,
  onRemover,
}: {
  bem: Bem;
  numero: number;
  sucessoes?: SucessaoCumulada[];
  ehPrimeiro: boolean;
  ehUltimo: boolean;
  onMover: (delta: number) => void;
  onSalvar: (b: Bem) => void;
  onRemover: () => void;
}) {
  const [editando, setEditando] = useState(false);
  const [descricao, setDescricao] = useState(bem.descricao);
  const [valor, setValor] = useState('');
  const [codigo, setCodigo] = useState(bem.codigoItcmd ?? '');
  const [natureza, setNatureza] = useState<Bem['natureza']>(bem.natureza);
  const [venal, setVenal] = useState('');
  const [avaliacao, setAvaliacao] = useState('');
  // Campos da declaração por tipo (imóvel × financeiro).
  const [municipio, setMunicipio] = useState('');
  const [inscricao, setInscricao] = useState('');
  const [matricula, setMatricula] = useState('');
  const [registroRI, setRegistroRI] = useState('');
  const [instituicao, setInstituicao] = useState('');
  const [agencia, setAgencia] = useState('');
  const [conta, setConta] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const abrir = () => {
    setDescricao(bem.descricao);
    setValor(paraMascara(bem.valor));
    setCodigo(bem.codigoItcmd ?? '');
    setNatureza(bem.natureza);
    setVenal(bem.valorVenal ? paraMascara(bem.valorVenal) : '');
    setAvaliacao(bem.valorAvaliacao ? paraMascara(bem.valorAvaliacao) : '');
    setMunicipio(bem.imovel?.municipio ?? '');
    setInscricao(bem.imovel?.inscricaoCadastral ?? '');
    setMatricula(bem.imovel?.matricula ?? '');
    setRegistroRI(bem.imovel?.registroImoveis ?? '');
    setInstituicao(bem.financeiro?.instituicao ?? '');
    setAgencia(bem.financeiro?.agencia ?? '');
    setConta(bem.financeiro?.conta ?? '');
    setErro(null);
    setEditando(true);
  };

  const salvar = () => {
    if (!descricao.trim()) {
      setErro('Descreva o bem.');
      return;
    }
    if (!VALOR_PTBR.test(valor.trim())) {
      setErro('Valor inválido — use o formato 900.000,00.');
      return;
    }
    // Bem lido/antigo pode não ter código — sem escolha, o tipo interno fica como está.
    const oficial = tipoBemItcmd(codigo);
    const tipoFinal = oficial ? oficial.tipo : bem.tipo;
    const limpo = (v: string) => (v.trim() ? v.trim() : undefined);
    const imovel =
      tipoFinal === 'IMOVEL'
        ? {
            ...bem.imovel,
            municipio: limpo(municipio),
            inscricaoCadastral: limpo(inscricao),
            matricula: limpo(matricula),
            registroImoveis: limpo(registroRI),
          }
        : bem.imovel;
    const financeiro =
      tipoFinal === 'FINANCEIRO'
        ? { instituicao: limpo(instituicao), agencia: limpo(agencia), conta: limpo(conta) }
        : bem.financeiro;
    onSalvar({
      ...bem,
      descricao: descricao.trim(),
      valor: paraDecimal(valor),
      tipo: tipoFinal,
      codigoItcmd: oficial ? codigo : bem.codigoItcmd,
      natureza,
      valorVenal: venal.trim() && VALOR_PTBR.test(venal.trim()) ? paraDecimal(venal) : undefined,
      valorAvaliacao: avaliacao.trim() && VALOR_PTBR.test(avaliacao.trim()) ? paraDecimal(avaliacao) : undefined,
      imovel,
      financeiro,
    });
    setEditando(false);
  };

  if (!editando) {
    return (
      <div>
      <div className="linha-item">
        <span>
          <span className="numero-bem num">{numero}.</span>{' '}
          <strong>{bem.descricao}</strong>
          <span className="fracao num">
            {' '}
            · {brl(bem.valor)} · {rotuloDoBem(bem)} ·{' '}
            {bem.natureza === 'COMUM' ? 'comum' : 'particular'}
          </span>
          {baseDeCustaMaior(bem) > Number(bem.valor) && (
            <span className="fund num" style={{ display: 'block' }}>
              Base das custas (maior valor): {brl(baseDeCustaMaior(bem).toFixed(2))}
              {bem.valorVenal ? ` · venal ${brl(bem.valorVenal)}` : ''}
              {bem.valorAvaliacao ? ` · avaliação ${brl(bem.valorAvaliacao)}` : ''}
            </span>
          )}
          {/* Identificação da declaração (preenchida pela leitura ou à mão). */}
          {(bem.imovel?.matricula || bem.imovel?.inscricaoCadastral) && (
            <span className="fund" style={{ display: 'block' }}>
              {bem.imovel?.matricula ? `Matrícula ${bem.imovel.matricula}` : ''}
              {bem.imovel?.registroImoveis ? ` — ${bem.imovel.registroImoveis}` : ''}
              {bem.imovel?.inscricaoCadastral ? ` · inscrição ${bem.imovel.inscricaoCadastral}` : ''}
              {bem.imovel?.municipio ? ` · ${bem.imovel.municipio}` : ''}
            </span>
          )}
          {(bem.financeiro?.instituicao || bem.financeiro?.conta) && (
            <span className="fund" style={{ display: 'block' }}>
              {bem.financeiro?.instituicao ?? ''}
              {bem.financeiro?.agencia ? ` · ag. ${bem.financeiro.agencia}` : ''}
              {bem.financeiro?.conta ? ` · conta ${bem.financeiro.conta}` : ''}
            </span>
          )}
        </span>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Mover o bem ${numero} para cima`}
            title="Mover para cima"
            disabled={ehPrimeiro}
            onClick={() => onMover(-1)}
          >
            ↑
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Mover o bem ${numero} para baixo`}
            title="Mover para baixo"
            disabled={ehUltimo}
            onClick={() => onMover(1)}
          >
            ↓
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={abrir}>
            editar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={onRemover}
          >
            remover
          </Button>
        </span>
      </div>
      {sucessoes.length > 0 && (
        <FaixaSucessoesDoBem bem={bem} sucessoes={sucessoes} onSalvar={onSalvar} />
      )}
      </div>
    );
  }

  return (
    <div className="ficha" style={{ marginTop: 8 }}>
      <span className="eyebrow">Editando o bem {numero}</span>
      <div className="grade c2" style={{ marginTop: 8 }}>
        <label className="campo">
          Descrição
          <Input
            value={descricao}
            aria-invalid={Boolean(erro && !descricao.trim())}
            onChange={(e) => setDescricao(e.target.value)}
          />
        </label>
        <label className="campo">
          Valor (R$)
          <CurrencyInput value={valor} onChange={setValor} />
        </label>
        <label className="campo">
          Tipo do bem (declaração do ITCMD-SP)
          <SeletorTipoItcmd value={codigo} onChange={setCodigo} />
        </label>
        <label className="campo">
          Natureza
          <Select
            value={natureza}
            onValueChange={(v) => v && setNatureza(v as Bem['natureza'])}
          >
            <SelectTrigger aria-label="Natureza do bem">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="COMUM">Comum (adquirido na constância)</SelectItem>
              <SelectItem value="PARTICULAR">Particular (herança, doação, anterior)</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="campo">
          Valor venal (R$) — opcional
          <CurrencyInput value={venal} onChange={setVenal} />
        </label>
        <label className="campo">
          Valor de avaliação (R$) — opcional
          <CurrencyInput value={avaliacao} onChange={setAvaliacao} />
        </label>
        {/* Campos da declaração do ITCMD-SP conforme o tipo em edição. */}
        {tipoBemItcmd(codigo)?.tipo === 'IMOVEL' && (
          <>
            <label className="campo">
              Município do imóvel
              <Input value={municipio} onChange={(e) => setMunicipio(e.target.value)} />
            </label>
            <label className="campo">
              Inscrição cadastral (nº do contribuinte)
              <Input value={inscricao} onChange={(e) => setInscricao(e.target.value)} />
            </label>
            <label className="campo">
              Matrícula
              <Input value={matricula} onChange={(e) => setMatricula(e.target.value)} />
            </label>
            <label className="campo">
              Registro de Imóveis (cartório)
              <Input value={registroRI} onChange={(e) => setRegistroRI(e.target.value)} />
            </label>
          </>
        )}
        {tipoBemItcmd(codigo)?.tipo === 'FINANCEIRO' && (
          <>
            <label className="campo">
              Instituição financeira
              <Input value={instituicao} onChange={(e) => setInstituicao(e.target.value)} />
            </label>
            <label className="campo">
              Agência
              <Input value={agencia} onChange={(e) => setAgencia(e.target.value)} />
            </label>
            <label className="campo">
              Conta (com dígito)
              <Input value={conta} onChange={(e) => setConta(e.target.value)} />
            </label>
          </>
        )}
      </div>
      {erro && <p className="mono-alerta">{erro}</p>}
      <div className="escolha" style={{ marginTop: 12 }}>
        <Button type="button" size="sm" onClick={salvar}>
          Salvar alterações
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Avaliação POR SUCESSÃO do bem (inventário conjunto): cada sucessão abre a
 * própria coluna — valor na data do óbito respectivo e a fração do bem que
 * transita naquela sucessão — além da exclusividade (bem que só integra o
 * rol de UMA das sucessões, como o particular adquirido pelo viúvo depois
 * do primeiro óbito). Edição inline ad-hoc, convenção das listas.
 */
function FaixaSucessoesDoBem({
  bem,
  sucessoes,
  onSalvar,
}: {
  bem: Bem;
  sucessoes: SucessaoCumulada[];
  onSalvar: (b: Bem) => void;
}) {
  const patchSucessao = (suId: string, patch: Partial<AvaliacaoBemSucessao>) => {
    const atual = bem.sucessoes?.[suId] ?? {};
    onSalvar({
      ...bem,
      sucessoes: { ...bem.sucessoes, [suId]: { ...atual, ...patch } },
    });
  };

  return (
    <div className="bem-sucessoes">
      <div className="cabeca-sucessoes">
        <span className="eyebrow">Avaliação por sucessão</span>
        <label className="campo exclusividade">
          <span>Integra</span>
          <select
            className="seletor"
            value={bem.sucessaoExclusiva ?? ''}
            aria-label={`Exclusividade do bem ${bem.descricao}`}
            onChange={(e) =>
              onSalvar({
                ...bem,
                sucessaoExclusiva: e.target.value || undefined,
              })
            }
          >
            <option value="">Todas as sucessões</option>
            <option value="PRINCIPAL">Só a 1ª sucessão (autor principal)</option>
            {sucessoes.map((su) => (
              <option key={su.id} value={su.id}>
                Só a sucessão de {su.nome || '(sem nome)'}
              </option>
            ))}
          </select>
        </label>
      </div>
      {sucessoes.map((su) => {
        // Bens particulares: a sucessão só considera os bens EXCLUSIVOS dela —
        // um bem compartilhado não abre coluna de avaliação para ela.
        const soBensProprios = su.mesmosBens === false;
        const excluido =
          (Boolean(bem.sucessaoExclusiva) && bem.sucessaoExclusiva !== su.id) ||
          (soBensProprios && bem.sucessaoExclusiva !== su.id);
        const av = bem.sucessoes?.[su.id] ?? {};
        return (
          <div key={su.id} className={`linha-sucessao${excluido ? ' excluido' : ''}`}>
            <span className="nome-sucessao">
              {su.nome || 'Sucessão'}
              {su.dataObito ? (
                <span className="fracao num"> · óbito {su.dataObito.slice(0, 4)}</span>
              ) : null}
            </span>
            {excluido ? (
              <span className="fracao">
                {soBensProprios && bem.sucessaoExclusiva !== su.id
                  ? 'usa bens particulares (lançados à parte)'
                  : 'fora do rol desta sucessão'}
              </span>
            ) : (
              <>
                <label className="campo">
                  <span>
                    Valor no óbito de {su.dataObito ? su.dataObito.slice(0, 4) : '—'} (R$)
                  </span>
                  <CurrencyInput
                    value={av.valor ? paraMascara(av.valor) : ''}
                    onChange={(v) =>
                      patchSucessao(su.id, {
                        valor: v.trim() ? paraDecimal(v) : undefined,
                      })
                    }
                  />
                </label>
                <label className="campo">
                  <span>Fração nesta sucessão (%)</span>
                  <Input
                    inputMode="decimal"
                    value={av.fracaoPct ?? ''}
                    onChange={(e) =>
                      patchSucessao(su.id, {
                        fracaoPct:
                          e.target.value.replace(/[^\d.,]/g, '').slice(0, 6) || undefined,
                      })
                    }
                  />
                </label>
              </>
            )}
          </div>
        );
      })}
      <p className="fund" style={{ margin: '4px 0 0' }}>
        Vazio = vale o valor lançado do bem e 100% — preencha quando a avaliação do fato
        gerador ou a proporção do(a) de cujus for outra. A base de cada sucessão soma
        (valor × fração) dos bens que a integram.
      </p>
    </div>
  );
}
