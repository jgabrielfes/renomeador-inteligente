/**
 * Sobrepartilha (CPC, arts. 669 e 670).
 *
 * Ao final do inventário, abre a partilha SUPLEMENTAR de bens que ficaram de
 * fora (sonegados, litigiosos, de difícil liquidação ou descobertos depois),
 * REAPROVEITANDO tudo o que o caso já tem — família, herdeiros, qualificações
 * e documentos. Só os bens NOVOS entram aqui (marcados `sobrepartilha`), com
 * a mesma vocação hereditária; e o impacto FISCAL (ITCMD, escritura e
 * registros) da sobrepartilha é calculado à parte. Estimativa de apoio.
 */

import { useMemo, useState } from 'react';
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

import { partilhar } from '@/lib/partilha/engine';
import { provisionarItcmd, type ProvisaoItcmd } from '@/lib/partilha/itcmd';
import { baseDeEmolumentosDaEscritura, projetarCustos } from '@/lib/partilha/custas';
import { tipoBemItcmd } from '@/lib/partilha/tipos-itcmd';
import type { ModalidadeEscritura } from '@/lib/partilha/escritura';
import type { Bem, Caso, Herdeiro, Regime, Resultado, Vinculo } from '@/lib/partilha/types';
import { paraDecimal } from './acervo-view';
import { Espelho, LinhaEspelho } from './espelho-tabela';

const brl = (v: number | string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;
const VALOR_PTBR = /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+([.,]\d{1,2})?$/;

const esquema = z.object({
  descricao: z.string().trim().min(1, 'Descreva o bem da sobrepartilha.'),
  valor: z.string().trim().min(1, 'Informe o valor.').regex(VALOR_PTBR, 'Valor inválido — use 900.000,00.'),
  codigo: z.string().min(1, 'Escolha o tipo.'),
  natureza: z.enum(['COMUM', 'PARTICULAR']),
});
type NovoBem = z.infer<typeof esquema>;

const TIPOS_RAPIDOS = [
  { codigo: '101', rotulo: 'Imóvel urbano' },
  { codigo: '111', rotulo: 'Imóvel rural' },
  { codigo: '121', rotulo: 'Veículo' },
  { codigo: '131', rotulo: 'Conta/aplicação financeira' },
  { codigo: '141', rotulo: 'Quotas/ações' },
  { codigo: '199', rotulo: 'Outro bem' },
];

export function SobrepartilhaView({
  bens,
  setBens,
  falecido,
  temSobrevivente,
  vinculo,
  regime,
  nomeSobrev,
  herdeiros,
  issPct,
  ufesp,
  onFechar,
  onMinuta,
}: {
  bens: Bem[];
  setBens: (b: Bem[]) => void;
  falecido: { dataObito: string; nome: string };
  temSobrevivente: boolean;
  vinculo: Vinculo;
  regime: Regime;
  nomeSobrev: string;
  herdeiros: Herdeiro[];
  issPct: number;
  ufesp: number;
  onFechar: () => void;
  /** Minuta da ESCRITURA DE SOBREPARTILHA (gerador determinístico do client). */
  onMinuta?: (args: {
    modalidade: ModalidadeEscritura;
    resultado: Resultado;
    provisao: ProvisaoItcmd | null;
  }) => Promise<void> | void;
}) {
  const sobrepartilha = bens.filter((b) => b.sobrepartilha);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovoBem>({
    resolver: zodResolver(esquema),
    defaultValues: { descricao: '', valor: '', codigo: '101', natureza: 'COMUM' },
  });

  const lancar = (dados: NovoBem) => {
    setBens([
      ...bens,
      {
        id: uid('sp'),
        descricao: dados.descricao,
        valor: paraDecimal(dados.valor),
        natureza: dados.natureza,
        tipo: tipoBemItcmd(dados.codigo)?.tipo ?? 'OUTRO',
        codigoItcmd: dados.codigo,
        sobrepartilha: true,
      },
    ]);
    reset({ descricao: '', valor: '', codigo: dados.codigo, natureza: dados.natureza });
  };

  const hoje = new Date().toISOString().slice(0, 10);

  // Caso sintético: MESMA família/herdeiros, só os bens da sobrepartilha.
  const resultado = useMemo(() => {
    if (sobrepartilha.length === 0 || (herdeiros.length === 0 && !temSobrevivente)) return null;
    const caso: Caso = {
      falecido: { dataObito: falecido.dataObito || hoje },
      sobrevivente: temSobrevivente ? { vinculo, regime, nome: nomeSobrev || 'Cônjuge/companheiro(a)' } : null,
      herdeiros,
      bens: sobrepartilha,
    };
    try {
      return partilhar(caso);
    } catch {
      return null;
    }
  }, [sobrepartilha, herdeiros, temSobrevivente, vinculo, regime, nomeSobrev, falecido.dataObito, hoje]);

  const provisao = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0 || !falecido.dataObito) return null;
    return provisionarItcmd({
      dataObito: falecido.dataObito,
      dataReferencia: hoje,
      baseCalculo: Number(resultado.heranca.total),
    });
  }, [resultado, falecido.dataObito, hoje]);

  const custos = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0) return null;
    return projetarCustos({
      monteMor: Number(resultado.acervo.massaPartilhavel),
      baseEscritura: baseDeEmolumentosDaEscritura({
        bens: sobrepartilha.map((b) => ({
          valor: Number(b.valor),
          venalAtual: Math.max(Number(b.valorVenal) || 0, Number(b.valorAvaliacao) || 0) || null,
        })),
        legitima: Number(resultado.heranca.total),
      }),
      qtdRenunciantes: 0,
      sucessoes: [],
      imoveis: sobrepartilha
        .filter((b) => b.tipo === 'IMOVEL')
        .map((b) => ({ descricao: b.descricao, valor: Number(b.valor) })),
      rito: resultado.elegivelExtrajudicial ? 'EXTRAJUDICIAL' : 'JUDICIAL',
      qtdHerdeiros: herdeiros.length,
      temSobrevivente,
      transferencias: [],
      ufesp,
      issPct,
    });
  }, [resultado, sobrepartilha, herdeiros.length, temSobrevivente, ufesp, issPct]);

  const custoTotal = (provisao?.total ?? 0) + (custos?.total ?? 0);

  /* Minuta da escritura de sobrepartilha — modalidade escolhida aqui mesmo. */
  const [modalidadeMinuta, setModalidadeMinuta] = useState<ModalidadeEscritura>('PRESENCIAL');
  const [gerandoMinuta, setGerandoMinuta] = useState(false);
  const gerarMinuta = async () => {
    if (!onMinuta || !resultado || resultado.bloqueios.length > 0) return;
    setGerandoMinuta(true);
    try {
      await onMinuta({ modalidade: modalidadeMinuta, resultado, provisao });
    } finally {
      setGerandoMinuta(false);
    }
  };

  return (
    <div className="cartao" style={{ marginTop: 28, borderLeft: '3px solid var(--bronze)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div>
          <span className="eyebrow">Sobrepartilha · CPC, arts. 669 e 670</span>
          <h2 style={{ marginTop: 4 }}>Bens que ficaram de fora do inventário</h2>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
          fechar sobrepartilha
        </Button>
      </div>
      <p className="fund" style={{ margin: '0 0 12px' }}>
        Reaproveita a família, os herdeiros e os documentos do caso. Lance aqui os bens
        sonegados, litigiosos, de difícil liquidação ou descobertos depois — a partilha e o
        custo fiscal saem à parte, com o MESMO fato gerador (a data do óbito).
      </p>

      <form noValidate onSubmit={handleSubmit(lancar)}>
        <div className="grade c2">
          <Field data-invalid={Boolean(errors.descricao)}>
            <FieldLabel htmlFor="sp-descricao">Descrição do bem</FieldLabel>
            <Input id="sp-descricao" aria-invalid={Boolean(errors.descricao)} {...register('descricao')} />
            <FieldError errors={[errors.descricao]} />
          </Field>
          <Field data-invalid={Boolean(errors.valor)}>
            <FieldLabel htmlFor="sp-valor">Valor (R$)</FieldLabel>
            <Controller
              control={control}
              name="valor"
              render={({ field }) => (
                <CurrencyInput id="sp-valor" value={field.value} onChange={field.onChange} onBlur={field.onBlur} />
              )}
            />
            <FieldError errors={[errors.valor]} />
          </Field>
          <Field>
            <FieldLabel>Tipo do bem</FieldLabel>
            <Controller
              control={control}
              name="codigo"
              render={({ field }) => (
                <Select value={field.value} onValueChange={(v) => v && field.onChange(String(v))}>
                  <SelectTrigger aria-label="Tipo do bem da sobrepartilha">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIPOS_RAPIDOS.map((t) => (
                      <SelectItem key={t.codigo} value={t.codigo}>{t.rotulo}</SelectItem>
                    ))}
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
                    <SelectItem value="COMUM">Comum</SelectItem>
                    <SelectItem value="PARTICULAR">Particular</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
          </Field>
        </div>
        <div style={{ marginTop: 12 }}>
          <Button type="submit" variant="outline">Lançar bem da sobrepartilha</Button>
        </div>
      </form>

      {sobrepartilha.map((b) => (
        <div key={b.id} className="linha-item">
          <span>
            <strong>{b.descricao}</strong>
            <span className="fracao num"> · {brl(b.valor)} · {b.natureza === 'COMUM' ? 'comum' : 'particular'}</span>
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

      {resultado && resultado.bloqueios.length === 0 && (
        <>
          <Espelho colunas={['Herdeiro', 'Fração', 'Quinhão']} style={{ marginTop: 16 }}>
            {resultado.meacao && (
              <LinhaEspelho
                nome={<>{resultado.meacao.beneficiario} (meação)</>}
                meio={resultado.meacao.fracao}
                meioNum
                valor={brl(resultado.meacao.valor)}
              />
            )}
            {resultado.quinhoes.map((q) => (
              <LinhaEspelho
                key={q.herdeiroId}
                nome={q.nome}
                meio={q.fracaoHeranca}
                meioNum
                valor={brl(q.valor)}
              />
            ))}
          </Espelho>

          <div className="nota" style={{ marginTop: 12 }}>
            <span className="eyebrow">Impacto fiscal da sobrepartilha</span>
            <div className="pilha num" style={{ marginTop: 6 }}>
              <div>
                <span className="rotulo">ITCMD sobre a sobrepartilha</span>
                <span>{brl(provisao?.total ?? 0)}</span>
              </div>
              <div>
                <span className="rotulo">Escritura, registros e certidões</span>
                <span>{brl(custos?.total ?? 0)}</span>
              </div>
              <div style={{ borderTop: '1px solid var(--fio)', paddingTop: 4 }}>
                <span className="rotulo"><strong>Custo total da sobrepartilha</strong></span>
                <span><strong>{brl(custoTotal)}</strong></span>
              </div>
            </div>
            <p className="fund" style={{ marginTop: 6 }}>
              Mesmo fato gerador (óbito), mas ato de escritura e registros próprios — some ao
              custo do inventário principal. Estimativa de apoio, a confirmar no caso.
            </p>
          </div>

          {onMinuta && (
            <div style={{ marginTop: 14 }}>
              <span className="eyebrow">Minuta da escritura de sobrepartilha</span>
              <div className="escolha" style={{ marginTop: 6, alignItems: 'center' }}>
                <Select
                  value={modalidadeMinuta}
                  onValueChange={(v) => v && setModalidadeMinuta(v as ModalidadeEscritura)}
                >
                  <SelectTrigger aria-label="Modalidade do ato da sobrepartilha" style={{ maxWidth: 280 }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRESENCIAL">Ato presencial</SelectItem>
                    <SelectItem value="VIDEOCONFERENCIA">Por videoconferência (e-Notariado)</SelectItem>
                    <SelectItem value="HIBRIDA">Híbrida (parte por vídeo)</SelectItem>
                  </SelectContent>
                </Select>
                <Button type="button" loading={gerandoMinuta} onClick={() => void gerarMinuta()}>
                  Baixar minuta (DOCX)
                </Button>
              </div>
              <p className="fund" style={{ marginTop: 6 }}>
                Sai no modelo do balcão, com a seção &quot;DA SOBREPARTILHA&quot; e a remissão à
                escritura anterior (data, tabelionato, livro e folhas) em lacunas para completar.
                Minuta para conferência do(a) responsável.
              </p>
            </div>
          )}
        </>
      )}
      {resultado && resultado.bloqueios.length > 0 && (
        <p className="mono-alerta" style={{ marginTop: 10 }}>
          {resultado.bloqueios.join(' ')}
        </p>
      )}
    </div>
  );
}
