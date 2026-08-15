/**
 * Item XI — Módulos fiscais e pré-inventário.
 *
 * Quatro motores puros (lib/partilha) sobre os dados que já existem no caso:
 *  · Radar de bens FORA do inventário (VGBL/PGBL/seguro fora do ITCMD)
 *  · Detector de Alvará simplificado (Lei 6.858/80)
 *  · Checklist e prazos da Declaração Final de Espólio
 *  · Simulador de Ganho de Capital do espólio (declarado × mercado)
 * Tudo é estimativa de APOIO ao profissional, a confirmar no caso concreto.
 */

import { Checkbox } from '@/components/ui/checkbox';
import { CurrencyInput } from '@/components/currency-input';
import { DateInput } from '@/components/date-input';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import type { Bem } from '@/lib/partilha/types';
import {
  analisarRadarBens,
  ROTULOS_ITEM_RADAR,
  type ItemRadar,
  type RespostaRadar,
} from '@/lib/partilha/radar-bens';
import {
  detectarAlvara,
  ROTULOS_SUBTIPO_ALVARA,
  type SubtipoFinanceiro,
} from '@/lib/partilha/alvara';
import { planejarDeclaracaoFinal, type HerdeiroQuinhao } from '@/lib/partilha/declaracao-final';
import {
  simularGanhoCapital,
  type BemGanhoCapital,
  type RecomendacaoGC,
  type TipoBemGC,
} from '@/lib/partilha/ganho-capital';

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (s: string): number => Number(String(s).replace(/\./g, '').replace(',', '.')) || 0;

/* ---------- estado extra do módulo (persistido no caso) ---------- */

export interface GanhoCapitalBemEstado {
  custoDeclarado?: string;
  dataAquisicao?: string;
  valorMercado?: string;
  unicoImovel?: boolean;
  alienou5anos?: boolean;
  pretendeVender?: boolean;
}

export interface EstadoModulosFiscais {
  /** Radar: presença/valor por item. */
  radar?: Partial<Record<ItemRadar, { presente: boolean; valor?: string; temBeneficiario?: boolean }>>;
  /** Alvará: subtipo financeiro por bem (bemId → subtipo). */
  alvaraSubtipos?: Record<string, SubtipoFinanceiro>;
  existemDependentesInss?: boolean;
  valor500Otn?: string;
  /** Declaração final. */
  marcoPartilha?: string;
  declaracoesEntregues?: string; // "2024, 2025"
  haviaBens?: boolean;
  /** Ganho de capital por bem. */
  ganhoCapital?: Record<string, GanhoCapitalBemEstado>;
}

export const ESTADO_MODULOS_FISCAIS_INICIAL: EstadoModulosFiscais = {};

const ITENS_RADAR: ItemRadar[] = [
  'seguro_vida',
  'vgbl',
  'pgbl',
  'pensao_morte',
  'conta_conjunta',
  'fgts_pis_verbas',
  'consorcio_seguro',
];

const TIPO_GC_POR_BEM = (b: Bem): TipoBemGC => {
  switch (b.tipo) {
    case 'IMOVEL':
      return 'imovel';
    case 'VEICULO':
      return 'veiculo';
    case 'QUOTAS':
      return 'participacao_societaria';
    default:
      return 'outros';
  }
};

export function FiscalView({
  estado,
  setEstado,
  bens,
  herdeiros,
  dataObito,
  aliquotaItcmd = 0.04,
}: {
  estado: EstadoModulosFiscais;
  setEstado: (e: EstadoModulosFiscais) => void;
  bens: Bem[];
  herdeiros: HerdeiroQuinhao[];
  dataObito: string;
  aliquotaItcmd?: number;
}) {
  const set = (patch: Partial<EstadoModulosFiscais>) => setEstado({ ...estado, ...patch });
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <section>
      <h1>Fiscal e pré-inventário</h1>
      <p className="subtitulo">
        Quatro leituras fiscais sobre os dados que o caso já tem — todas de APOIO ao
        profissional, a confirmar no caso concreto. Os valores de referência ficam em
        tabela versionada (isenções, faixas, 500 OTN).
      </p>

      <RadarSecao estado={estado} set={set} aliquotaItcmd={aliquotaItcmd} />
      <AlvaraSecao estado={estado} set={set} bens={bens} />
      <DeclaracaoFinalSecao estado={estado} set={set} herdeiros={herdeiros} dataObito={dataObito} hoje={hoje} />
      <GanhoCapitalSecao estado={estado} set={set} bens={bens} hoje={hoje} />
    </section>
  );
}

/* ---------- Módulo 4 — Radar ---------- */

function RadarSecao({
  estado,
  set,
  aliquotaItcmd,
}: {
  estado: EstadoModulosFiscais;
  set: (p: Partial<EstadoModulosFiscais>) => void;
  aliquotaItcmd: number;
}) {
  const radar = estado.radar ?? {};
  const respostas: RespostaRadar[] = ITENS_RADAR.map((item) => ({
    item,
    presente: radar[item]?.presente ?? false,
    valor: radar[item]?.valor ? num(radar[item]!.valor!) : undefined,
    temBeneficiario: radar[item]?.temBeneficiario,
  }));
  const resultado = analisarRadarBens({ respostas, aliquotaItcmd });

  const patchItem = (item: ItemRadar, p: Partial<{ presente: boolean; valor: string; temBeneficiario: boolean }>) =>
    set({ radar: { ...radar, [item]: { ...radar[item], presente: radar[item]?.presente ?? false, ...p } } });

  return (
    <div className="cartao">
      <span className="eyebrow">Módulo 4 · Radar de bens fora do inventário</span>
      <p className="fund" style={{ margin: '4px 0 12px' }}>
        Marque o que a família recebe por fora do espólio. VGBL, PGBL e seguro saem da base
        do ITCMD (STF, Tema 1214; art. 794 CC) — economia direta e mensurável.
      </p>

      {ITENS_RADAR.map((item) => {
        const info = radar[item];
        const presente = info?.presente ?? false;
        const precisaBeneficiario = item === 'seguro_vida';
        const precisaValor = item !== 'pensao_morte';
        return (
          <div key={item} className="radar-item">
            <label className="marcar" style={{ margin: 0 }}>
              <Checkbox checked={presente} onCheckedChange={(v) => patchItem(item, { presente: v === true })} />
              {ROTULOS_ITEM_RADAR[item]}
            </label>
            {presente && (
              <div className="radar-campos">
                {precisaValor && (
                  <label className="campo">
                    <span>Valor (R$)</span>
                    <CurrencyInput value={info?.valor ?? ''} onChange={(v) => patchItem(item, { valor: v })} />
                  </label>
                )}
                {precisaBeneficiario && (
                  <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                    <Checkbox
                      checked={info?.temBeneficiario ?? false}
                      onCheckedChange={(v) => patchItem(item, { temBeneficiario: v === true })}
                    />
                    Tem beneficiário indicado na apólice
                  </label>
                )}
              </div>
            )}
          </div>
        );
      })}

      {resultado.cards.length > 0 && (
        <>
          {resultado.economiaItcmdEstimada > 0 && (
            <div className="nota registro" style={{ marginTop: 12 }}>
              <span className="eyebrow">ITCMD que você NÃO vai pagar</span>
              <h3 className="num" style={{ color: 'var(--verde-registro)' }}>
                {brl(resultado.economiaItcmdEstimada)}
              </h3>
              <p>
                {brl(resultado.totalForaDoInventario)} saem da base do ITCMD (alíquota de{' '}
                {(aliquotaItcmd * 100).toLocaleString('pt-BR')}%). Esses valores não compõem o
                monte-mor da partilha.
              </p>
            </div>
          )}
          {resultado.cards.map((c) => (
            <div key={c.item} className="nota" style={{ marginTop: 10 }}>
              <span className="eyebrow">{c.titulo}</span>
              <p><strong>Quem recebe:</strong> {c.quemRecebe}</p>
              <p><strong>Onde:</strong> {c.ondeRequerer}</p>
              {c.prazo && <p><strong>Prazo:</strong> {c.prazo}</p>}
              <p className="fund">{c.fundamento}</p>
              {c.alertas.map((a, i) => (
                <p key={i} className="mono-alerta">{a}</p>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/* ---------- Módulo 3 — Alvará ---------- */

function AlvaraSecao({
  estado,
  set,
  bens,
}: {
  estado: EstadoModulosFiscais;
  set: (p: Partial<EstadoModulosFiscais>) => void;
  bens: Bem[];
}) {
  const subtipos = estado.alvaraSubtipos ?? {};
  const itens = bens
    .filter((b) => Number(b.valor) > 0)
    .map((b) => ({ descricao: b.descricao, valor: Number(b.valor), subtipo: subtipos[b.id] }));
  const resultado = detectarAlvara({
    itens,
    existemDependentesInss: estado.existemDependentesInss ?? false,
    valor500Otn: estado.valor500Otn ? num(estado.valor500Otn) : undefined,
  });

  const cor: Record<string, string> = {
    DISPENSA_TOTAL: 'var(--verde-registro)',
    ALVARA_SIMPLIFICADO: 'var(--verde-registro)',
    INVENTARIO_COM_PARALELO: 'var(--bronze)',
    INVENTARIO_COMUM: 'var(--lacre)',
  };

  return (
    <div className="cartao">
      <span className="eyebrow">Módulo 3 · Detector de Alvará (Lei 6.858/80)</span>
      <p className="fund" style={{ margin: '4px 0 12px' }}>
        Classifique os itens financeiros do acervo (etapa II) e o detector diz quando o
        inventário é DESNECESSÁRIO — a ferramenta que avisa quando o cliente nem precisa do
        serviço caro.
      </p>

      <label className="marcar" style={{ margin: '0 0 8px', fontWeight: 400 }}>
        <Checkbox
          checked={estado.existemDependentesInss ?? false}
          onCheckedChange={(v) => set({ existemDependentesInss: v === true })}
        />
        Existem dependentes habilitados no INSS
      </label>
      <label className="campo" style={{ maxWidth: 280, marginBottom: 8 }}>
        <span>Teto das 500 OTN (R$) — ajuste ao juízo local</span>
        <CurrencyInput value={estado.valor500Otn ?? ''} onChange={(v) => set({ valor500Otn: v })} />
      </label>

      {bens.filter((b) => Number(b.valor) > 0).length === 0 ? (
        <p className="fund">Lance os bens no item II para o detector rodar.</p>
      ) : (
        <div className="check" style={{ marginTop: 6 }}>
          {bens
            .filter((b) => Number(b.valor) > 0)
            .map((b) => (
              <div className="check-item" key={b.id}>
                <span className="prio">·</span>
                <div>
                  <h4>{b.descricao}</h4>
                  <p className="num">{brl(Number(b.valor))}</p>
                </div>
                <Select
                  value={(subtipos[b.id] ?? '__nenhum__') as string}
                  onValueChange={(v) => {
                    const val = String(v ?? '');
                    const proximos = { ...subtipos };
                    if (!val || val === '__nenhum__') delete proximos[b.id];
                    else proximos[b.id] = val as SubtipoFinanceiro;
                    set({ alvaraSubtipos: proximos });
                  }}
                >
                  <SelectTrigger size="sm" aria-label={`Subtipo de ${b.descricao}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhum__">Bem sujeito a inventário</SelectItem>
                    {(Object.keys(ROTULOS_SUBTIPO_ALVARA) as SubtipoFinanceiro[]).map((s) => (
                      <SelectItem key={s} value={s}>
                        {ROTULOS_SUBTIPO_ALVARA[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
        </div>
      )}

      <div
        className="nota"
        style={{ marginTop: 12, borderLeftColor: cor[resultado.conclusao] }}
      >
        <span className="eyebrow" style={{ color: cor[resultado.conclusao] }}>
          {resultado.titulo}
        </span>
        {resultado.parecer.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
        {resultado.alertas.map((a, i) => (
          <p key={i} className="fund">{a}</p>
        ))}
      </div>
    </div>
  );
}

/* ---------- Módulo 2 — Declaração Final ---------- */

function DeclaracaoFinalSecao({
  estado,
  set,
  herdeiros,
  dataObito,
  hoje,
}: {
  estado: EstadoModulosFiscais;
  set: (p: Partial<EstadoModulosFiscais>) => void;
  herdeiros: HerdeiroQuinhao[];
  dataObito: string;
  hoje: string;
}) {
  const anos = (estado.declaracoesEntregues ?? '')
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => n >= 1990 && n <= 2100);
  const resultado = dataObito
    ? planejarDeclaracaoFinal({
        dataObito,
        dataMarcoPartilha: estado.marcoPartilha || null,
        declaracoesEntregues: anos,
        haviaBens: estado.haviaBens ?? true,
        herdeiros,
        dataReferencia: hoje,
      })
    : null;

  const corStatus: Record<string, string> = {
    OK: 'var(--verde-registro)',
    PENDENTE: 'var(--bronze)',
    ATRASADO: 'var(--lacre)',
  };

  return (
    <div className="cartao">
      <span className="eyebrow">Módulo 2 · Declaração Final de Espólio</span>
      <p className="fund" style={{ margin: '4px 0 12px' }}>
        Prazos das declarações no CPF do falecido (inicial, intermediárias e final) e a
        lista de herdeiros/quinhões para colar na DIRPF.
      </p>

      <div className="grade c2" style={{ marginBottom: 10 }}>
        <label className="campo">
          <span>Marco da partilha (escritura ou trânsito em julgado)</span>
          <DateInput value={estado.marcoPartilha ?? ''} onChange={(iso) => set({ marcoPartilha: iso })} />
        </label>
        <label className="campo">
          <span>Anos-base já declarados (ex.: 2024, 2025)</span>
          <Input
            value={estado.declaracoesEntregues ?? ''}
            onChange={(e) => set({ declaracoesEntregues: e.target.value })}
            placeholder="—"
          />
        </label>
      </div>
      <label className="marcar" style={{ margin: '0 0 8px', fontWeight: 400 }}>
        <Checkbox
          checked={estado.haviaBens ?? true}
          onCheckedChange={(v) => set({ haviaBens: v === true })}
        />
        O falecido deixou bens a inventariar
      </label>

      {!dataObito && <p className="fund">Informe a data do óbito no item I para os prazos aparecerem.</p>}

      {resultado && !resultado.obrigatoria && (
        <div className="nota registro">
          <p>{resultado.alertas[0]}</p>
        </div>
      )}

      {resultado && resultado.obrigatoria && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Declaração</TableHead>
                <TableHead>Ano-base</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.itens.map((i) => (
                <TableRow key={i.anoBase}>
                  <TableCell>{i.tipo === 'FINAL' ? 'Final' : i.tipo === 'INICIAL' ? 'Inicial' : 'Intermediária'}</TableCell>
                  <TableCell className="num">{i.anoBase}</TableCell>
                  <TableCell className="num">{i.prazo.split('-').reverse().join('/')}</TableCell>
                  <TableCell style={{ color: corStatus[i.status], fontWeight: 600 }}>{i.status}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {resultado.alertas.map((a, i) => (
            <p key={i} className="fund" style={{ marginTop: 6 }}>{a}</p>
          ))}
          {resultado.herdeiros.length > 0 && (
            <>
              <h3 style={{ fontSize: 14, margin: '14px 0 6px' }}>Herdeiros e quinhões (para a DIRPF)</h3>
              {resultado.herdeiros.map((h, i) => (
                <p key={i} className="fund num">
                  {h.nome}{h.cpf ? ` · CPF ${h.cpf}` : ''} · {brl(h.quinhao)}
                </p>
              ))}
            </>
          )}
          <p className="fund" style={{ marginTop: 8 }}>
            DARF do ganho de capital: código {resultado.darf.codigo} · contribuinte {resultado.darf.contribuinte} ·
            vence na {resultado.darf.vencimento}.
          </p>
        </>
      )}
    </div>
  );
}

/* ---------- Módulo 1 — Ganho de capital ---------- */

const ROTULO_RECOMENDACAO: Record<RecomendacaoGC, { texto: string; cor: string }> = {
  ATUALIZAR_SEM_CUSTO: { texto: 'Atualizar (grátis)', cor: 'var(--verde-registro)' },
  ATUALIZAR_COMPENSA: { texto: 'Atualizar compensa', cor: 'var(--verde-registro)' },
  MANTER_DECLARADO: { texto: 'Manter declarado', cor: 'var(--bronze)' },
};

function GanhoCapitalSecao({
  estado,
  set,
  bens,
  hoje,
}: {
  estado: EstadoModulosFiscais;
  set: (p: Partial<EstadoModulosFiscais>) => void;
  bens: Bem[];
  hoje: string;
}) {
  const gc = estado.ganhoCapital ?? {};
  const patchBem = (id: string, p: Partial<GanhoCapitalBemEstado>) =>
    set({ ganhoCapital: { ...gc, [id]: { ...gc[id], ...p } } });

  const bensGC: BemGanhoCapital[] = bens.map((b) => {
    const e = gc[b.id] ?? {};
    return {
      bemId: b.id,
      tipo: TIPO_GC_POR_BEM(b),
      custoDeclarado: num(e.custoDeclarado ?? ''),
      dataAquisicao: e.dataAquisicao || '2010-01-01',
      valorMercado: e.valorMercado ? num(e.valorMercado) : Number(b.valor) || 0,
      unicoImovel: e.unicoImovel,
      alienouImovelUltimos5Anos: e.alienou5anos,
      herdeiroPretendeVender: e.pretendeVender,
    };
  });
  const preenchidos = bensGC.filter((b) => b.custoDeclarado > 0 || b.valorMercado > 0);
  const resultado = preenchidos.length > 0
    ? simularGanhoCapital({ bens: preenchidos, dataTransferencia: hoje })
    : null;

  return (
    <div className="cartao">
      <span className="eyebrow">Módulo 1 · Ganho de capital do espólio</span>
      <p className="fund" style={{ margin: '4px 0 12px' }}>
        Cada bem pode ser transferido pelo valor DECLARADO (sem imposto agora) ou pelo valor
        de MERCADO (tributa a diferença agora, atualiza o custo). Preencha o custo declarado
        e a data de aquisição — o valor de mercado vem do acervo, editável.
      </p>

      {bens.length === 0 && <p className="fund">Lance os bens no item II.</p>}

      {bens.map((b) => {
        const e = gc[b.id] ?? {};
        const ehImovel = b.tipo === 'IMOVEL';
        return (
          <div key={b.id} className="ficha" style={{ marginTop: 8 }}>
            <span className="eyebrow">{b.descricao}</span>
            <div className="grade c3" style={{ marginTop: 8 }}>
              <label className="campo">
                <span>Custo na última declaração (R$)</span>
                <CurrencyInput value={e.custoDeclarado ?? ''} onChange={(v) => patchBem(b.id, { custoDeclarado: v })} />
              </label>
              <label className="campo">
                <span>Data de aquisição</span>
                <DateInput value={e.dataAquisicao ?? ''} onChange={(iso) => patchBem(b.id, { dataAquisicao: iso })} />
              </label>
              <label className="campo">
                <span>Valor de mercado (R$)</span>
                <CurrencyInput
                  value={e.valorMercado ?? (Number(b.valor) ? Number(b.valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '')}
                  onChange={(v) => patchBem(b.id, { valorMercado: v })}
                />
              </label>
            </div>
            <div className="escolha" style={{ marginTop: 8 }}>
              {ehImovel && (
                <>
                  <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                    <Checkbox checked={e.unicoImovel ?? false} onCheckedChange={(v) => patchBem(b.id, { unicoImovel: v === true })} />
                    Único imóvel
                  </label>
                  <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                    <Checkbox checked={e.alienou5anos ?? false} onCheckedChange={(v) => patchBem(b.id, { alienou5anos: v === true })} />
                    Alienou imóvel nos últimos 5 anos
                  </label>
                </>
              )}
              <label className="marcar" style={{ margin: 0, fontWeight: 400 }}>
                <Checkbox checked={e.pretendeVender ?? false} onCheckedChange={(v) => patchBem(b.id, { pretendeVender: v === true })} />
                Herdeiro pretende vender
              </label>
            </div>
          </div>
        );
      })}

      {resultado && (
        <>
          <Table style={{ marginTop: 12 }}>
            <TableHeader>
              <TableRow>
                <TableHead>Bem</TableHead>
                <TableHead>Imposto agora (mercado)</TableHead>
                <TableHead>Imposto futuro (declarado)</TableHead>
                <TableHead>Recomendação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.porBem.map((r) => {
                const bem = bens.find((b) => b.id === r.bemId);
                const rec = ROTULO_RECOMENDACAO[r.recomendacao];
                return (
                  <TableRow key={r.bemId}>
                    <TableCell>{bem?.descricao ?? r.bemId}</TableCell>
                    <TableCell className="num">{brl(r.cenarioB.impostoAgora)}</TableCell>
                    <TableCell className="num">{brl(r.cenarioA.impostoFuturoProjetado)}</TableCell>
                    <TableCell style={{ color: rec.cor, fontWeight: 600 }}>{rec.texto}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <div className="nota" style={{ marginTop: 10 }}>
            <p className="num">
              Se tudo pelo mercado: {brl(resultado.resumo.impostoAgoraSeTudoMercado)} de imposto AGORA. Mix ótimo por
              bem economiza {brl(resultado.resumo.mixOtimo.economiaVsPiorCenario)} frente ao pior cenário.
            </p>
            <p className="fund">
              DARF {resultado.resumo.darf.codigo} (espólio), vence na {resultado.resumo.darf.vencimento}. A escolha é
              por bem e irrevogável após a Declaração Final — estimativa de apoio, confirme no caso concreto.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
