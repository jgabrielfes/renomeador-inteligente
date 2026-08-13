/**
 * Item II — O acervo.
 *
 * Bens pelo valor da data do óbito (a natureza comum × particular decide a
 * meação e a concorrência no regime parcial), passivo do espólio e as fontes
 * de pesquisa patrimonial na ordem de prioridade. O painel ao lado reage a
 * cada lançamento.
 */

import { useState } from 'react';
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
import { TIPOS_BEM_ITCMD, tipoBemItcmd } from '@/lib/partilha/tipos-itcmd';
import type { StatusItemAcervo } from '@/lib/partilha/acervo';
import type { montarChecklistAcervo } from '@/lib/partilha/acervo';
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

const esquemaBem = z.object({
  descricao: z.string().trim().min(1, 'Descreva o bem — ex.: "Imóvel mat. 12.345 — Guarulhos/SP".'),
  valor: z
    .string()
    .trim()
    .min(1, 'Informe o valor na data do óbito.')
    .regex(VALOR_PTBR, 'Valor inválido — use o formato 900.000,00.'),
  codigo: z.string().min(1, 'Escolha o tipo na lista da declaração do ITCMD-SP.'),
  natureza: z.enum(['COMUM', 'PARTICULAR']),
});

type NovoBem = z.infer<typeof esquemaBem>;

export function paraDecimal(valor: string): string {
  const limpo = valor.replace(/\./g, '').replace(',', '.');
  return Number(limpo).toFixed(2);
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
  sociedades = [],
  checklist,
  setChecklist,
  voltar,
  avancar,
}: {
  bens: Bem[];
  setBens: (b: Bem[]) => void;
  dividas: string;
  setDividas: (v: string) => void;
  sociedades?: ResumoSociedade[];
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
    defaultValues: { descricao: '', valor: '', codigo: '101', natureza: 'COMUM' },
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
        tipo: tipoBemItcmd(dados.codigo)?.tipo ?? 'OUTRO',
        codigoItcmd: dados.codigo,
      },
    ]);
    reset({ descricao: '', valor: '', codigo: dados.codigo, natureza: dados.natureza });
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

      {bens.map((b, i) => (
        <LinhaBem
          key={b.id}
          bem={b}
          numero={i + 1}
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

/**
 * Linha de bem lançado, com edição inline (convenção do projeto: edição de
 * valores em lista usa validação ad-hoc, não react-hook-form).
 */
function LinhaBem({
  bem,
  numero,
  ehPrimeiro,
  ehUltimo,
  onMover,
  onSalvar,
  onRemover,
}: {
  bem: Bem;
  numero: number;
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
  const [erro, setErro] = useState<string | null>(null);

  const abrir = () => {
    setDescricao(bem.descricao);
    setValor(paraMascara(bem.valor));
    setCodigo(bem.codigoItcmd ?? '');
    setNatureza(bem.natureza);
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
    onSalvar({
      ...bem,
      descricao: descricao.trim(),
      valor: paraDecimal(valor),
      tipo: oficial ? oficial.tipo : bem.tipo,
      codigoItcmd: oficial ? codigo : bem.codigoItcmd,
      natureza,
    });
    setEditando(false);
  };

  if (!editando) {
    return (
      <div className="linha-item">
        <span>
          <span className="numero-bem num">{numero}.</span>{' '}
          <strong>{bem.descricao}</strong>
          <span className="fracao num">
            {' '}
            · {brl(bem.valor)} · {rotuloDoBem(bem)} ·{' '}
            {bem.natureza === 'COMUM' ? 'comum' : 'particular'}
          </span>
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
          <CurrencyInput value={valor} onChange={setValor} placeholder="900.000,00" />
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
