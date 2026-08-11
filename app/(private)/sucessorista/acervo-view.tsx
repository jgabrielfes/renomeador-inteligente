/**
 * Item II — O acervo.
 *
 * Bens pelo valor da data do óbito (a natureza comum × particular decide a
 * meação e a concorrência no regime parcial), passivo do espólio e as fontes
 * de pesquisa patrimonial na ordem de prioridade. O painel ao lado reage a
 * cada lançamento.
 */

import { Controller, useForm } from 'react-hook-form';
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

import type { Bem, TipoBem } from '@/lib/partilha/types';
import type { StatusItemAcervo } from '@/lib/partilha/acervo';
import type { montarChecklistAcervo } from '@/lib/partilha/acervo';

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

const esquemaBem = z.object({
  descricao: z.string().trim().min(1, 'Descreva o bem — ex.: "Imóvel mat. 12.345 — Guarulhos/SP".'),
  valor: z
    .string()
    .trim()
    .min(1, 'Informe o valor na data do óbito.')
    .regex(VALOR_PTBR, 'Valor inválido — use o formato 900.000,00.'),
  tipo: z.enum(['IMOVEL', 'VEICULO', 'FINANCEIRO', 'QUOTAS', 'OUTRO']),
  natureza: z.enum(['COMUM', 'PARTICULAR']),
});

type NovoBem = z.infer<typeof esquemaBem>;

export function paraDecimal(valor: string): string {
  const limpo = valor.replace(/\./g, '').replace(',', '.');
  return Number(limpo).toFixed(2);
}

export function AcervoView({
  bens,
  setBens,
  dividas,
  setDividas,
  checklist,
  setChecklist,
  voltar,
  avancar,
}: {
  bens: Bem[];
  setBens: (b: Bem[]) => void;
  dividas: string;
  setDividas: (v: string) => void;
  checklist: ReturnType<typeof montarChecklistAcervo>;
  setChecklist: (c: ReturnType<typeof montarChecklistAcervo>) => void;
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
    defaultValues: { descricao: '', valor: '', tipo: 'IMOVEL', natureza: 'COMUM' },
  });

  const feitos = checklist.filter(
    (i) => i.status === 'RECEBIDO' || i.status === 'NAO_SE_APLICA'
  ).length;

  const lancar = (dados: NovoBem) => {
    setBens([
      ...bens,
      {
        id: uid('b'),
        descricao: dados.descricao,
        valor: paraDecimal(dados.valor),
        natureza: dados.natureza,
        tipo: dados.tipo,
      },
    ]);
    reset({ descricao: '', valor: '', tipo: dados.tipo, natureza: dados.natureza });
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
          <Field data-invalid={Boolean(errors.descricao)}>
            <FieldLabel htmlFor="bem-descricao">Descrição</FieldLabel>
            <Input
              id="bem-descricao"
              placeholder="Imóvel mat. 12.345 — Guarulhos/SP"
              aria-invalid={Boolean(errors.descricao)}
              {...register('descricao')}
            />
            <FieldError errors={[errors.descricao]} />
          </Field>
          <Field data-invalid={Boolean(errors.valor)}>
            <FieldLabel htmlFor="bem-valor">Valor (R$)</FieldLabel>
            <Controller
              control={control}
              name="valor"
              render={({ field }) => (
                <CurrencyInput
                  id="bem-valor"
                  placeholder="900.000,00"
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
            <FieldLabel>Tipo do bem</FieldLabel>
            <Controller
              control={control}
              name="tipo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v && field.onChange(String(v))}>
                  <SelectTrigger aria-label="Tipo do bem">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="IMOVEL">Imóvel</SelectItem>
                    <SelectItem value="VEICULO">Veículo</SelectItem>
                    <SelectItem value="FINANCEIRO">Conta/aplicação</SelectItem>
                    <SelectItem value="QUOTAS">Quotas/ações</SelectItem>
                    <SelectItem value="OUTRO">Outro</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
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
        </div>
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="outline">
            Lançar bem
          </Button>
        </div>
      </form>

      {bens.map((b) => (
        <div className="linha-item" key={b.id}>
          <span>
            <strong>{b.descricao}</strong>
            <span className="fracao num">
              {' '}
              · {brl(b.valor)} · {ROTULO_TIPO_BEM[b.tipo ?? 'OUTRO']} ·{' '}
              {b.natureza === 'COMUM' ? 'comum' : 'particular'}
            </span>
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => setBens(bens.filter((x) => x.id !== b.id))}
          >
            remover
          </Button>
        </div>
      ))}

      <h2>Passivo do espólio</h2>
      <div className="grade c2">
        <label className="campo">
          Dívidas e despesas do espólio (R$)
          <CurrencyInput value={dividas} onChange={setDividas} placeholder="0,00" />
        </label>
      </div>
      <p className="fund" style={{ marginTop: 6 }}>
        Financiamentos, empréstimos e despesas abatem a massa antes da partilha — e reduzem a
        base do ITCMD.
      </p>

      <h2>Fontes de pesquisa patrimonial</h2>
      <p className="subtitulo" style={{ marginBottom: 8 }}>
        O que mais atrasa inventário é herdeiro que não sabe o que o falecido tinha. Percorra
        as fontes na ordem — o testamento primeiro, porque decide a via.
      </p>
      <p className="progresso num">
        {feitos} de {checklist.length} fontes concluídas
      </p>
      <div className="check">
        {checklist.map((item, idx) => (
          <div className="check-item" key={item.fonte.id}>
            <span className="prio">P{item.fonte.prioridade}</span>
            <div>
              <h4>{item.fonte.nome}</h4>
              <p>{item.fonte.oQueRevela}</p>
              <p>
                <strong>Como:</strong> {item.fonte.comoConsultar}{' '}
                {item.fonte.url && (
                  <a href={item.fonte.url} target="_blank" rel="noreferrer">
                    abrir portal ↗
                  </a>
                )}
              </p>
            </div>
            <Select
              value={item.status}
              onValueChange={(v) => {
                if (!v) return;
                setChecklist(
                  checklist.map((x, i) =>
                    i === idx ? { ...x, status: String(v) as StatusItemAcervo } : x
                  )
                );
              }}
            >
              <SelectTrigger size="sm" aria-label={`Status de ${item.fonte.nome}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="SOLICITADO">Solicitado</SelectItem>
                <SelectItem value="RECEBIDO">Recebido</SelectItem>
                <SelectItem value="NAO_SE_APLICA">Não se aplica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

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
