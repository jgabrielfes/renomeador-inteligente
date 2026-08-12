/**
 * Item V — ITCMD.
 *
 * Espelho completo da declaração do ITCMD-SP (de cujus, interessados com as
 * perguntas do sistema, bens e apuração) e a provisão do imposto causa mortis
 * na data de hoje, contada do fato gerador (óbito), com cada parcela
 * discriminada pelo dispositivo da Lei 10.705/2000.
 *
 * O estado fiscal (isenções, vigência, faixas, protocolo) vive no client do
 * módulo — o painel do caso mostra os MESMOS números que esta aba detalha.
 */

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/date-input';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import type { Bem, Herdeiro, Resultado } from '@/lib/partilha/types';
import {
  formatarData,
  ROTULOS_PERGUNTAS_ITCMD,
  PERGUNTAS_ITCMD_VAZIAS,
  type PerguntasItcmd,
  type Qualificacao,
  type DadosFalecido,
} from '@/lib/partilha/familia';
import {
  ALIQUOTA_ITCMD_SP,
  analisarIsencoesPorBem,
  impostoProgressivo,
  ufespDoAno,
  FAIXAS_PL7_2024,
  FAIXAS_TETO_NACIONAL,
  type FaixaProgressiva,
  type ProvisaoItcmd,
  type ResultadoIsencoes,
} from '@/lib/partilha/itcmd';
import { Pilula } from './familia';

const brl = (v: number | string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Estado fiscal do caso — elevado ao client para alimentar também o painel. */
export interface EstadoFiscal {
  isencaoResidencial: boolean;
  isencaoDepositos: boolean;
  /** Cenário da reforma: início de vigência da tabela progressiva. */
  vigencia: string;
  faixas: FaixaProgressiva[];
  inventarioAberto: boolean;
  dataProtocolo: string;
}

export const ESTADO_FISCAL_INICIAL: EstadoFiscal = {
  isencaoResidencial: false,
  isencaoDepositos: false,
  vigencia: '2027-01-01',
  faixas: FAIXAS_PL7_2024.map((f) => ({ ...f })),
  inventarioAberto: false,
  dataProtocolo: '',
};

export function ItcmdView({
  falecido,
  temSobrevivente,
  nomeSobrev,
  herdeiros,
  perguntas,
  qualificacoes,
  bens,
  resultado,
  fiscal,
  setFiscal,
  isencoes,
  provisao,
  hoje,
  irParaFamilia,
  irParaAcervo,
}: {
  falecido: DadosFalecido;
  temSobrevivente: boolean;
  nomeSobrev: string;
  herdeiros: Herdeiro[];
  perguntas: Record<string, PerguntasItcmd>;
  qualificacoes: Record<string, Qualificacao>;
  bens: Bem[];
  resultado: Resultado | null;
  fiscal: EstadoFiscal;
  setFiscal: (f: EstadoFiscal) => void;
  isencoes: ResultadoIsencoes | null;
  provisao: ProvisaoItcmd | null;
  hoje: string;
  irParaFamilia: () => void;
  irParaAcervo: () => void;
}) {
  const faltaObito = !falecido.dataObito;
  const faltaCalculo = !resultado || resultado.bloqueios.length > 0;
  const patch = (p: Partial<EstadoFiscal>) => setFiscal({ ...fiscal, ...p });

  const perguntasPendentes = herdeiros.some((h) => {
    const p = perguntas[h.id] ?? PERGUNTAS_ITCMD_VAZIAS;
    return p.pertenceFamilia === null || p.possuiOutroImovel === null || p.enderecoMesmoDoObito === null;
  });

  return (
    <section>
      <h1>ITCMD</h1>
      <p className="subtitulo">
        Espelho da declaração do ITCMD-SP e provisão do imposto causa mortis até hoje
        ({formatarData(hoje)}), contada do fato gerador — a data do óbito. Cada parcela sai
        com o artigo da Lei 10.705/2000 que a fundamenta.
      </p>

      {faltaObito && (
        <div className="nota exigencia">
          <span className="eyebrow">Falta o fato gerador</span>
          <p>
            Informe a data do óbito no item I —{' '}
            <Button variant="ghost" size="sm" onClick={irParaFamilia}>
              ir para A família
            </Button>
          </p>
        </div>
      )}
      {faltaCalculo && (
        <div className="nota exigencia">
          <span className="eyebrow">Falta a base de cálculo</span>
          <p>
            Lance os bens no item II —{' '}
            <Button variant="ghost" size="sm" onClick={irParaAcervo}>
              ir para O acervo
            </Button>
          </p>
        </div>
      )}

      {!faltaObito && !faltaCalculo && resultado && provisao && (
        <>
          {/* ---------- espelho da declaração ---------- */}
          <h2>Espelho da declaração</h2>
          <div className="espelho">
            <div className="cabeca">
              <span>De cujus</span>
              <span />
              <span />
            </div>
            <div className="lanc">
              <span className="nome">{falecido.nome || '— informe no item I'}</span>
              <span className="fracao num">{falecido.cpf || 'CPF —'}</span>
              <span className="valor num" style={{ fontSize: 15 }}>
                óbito {formatarData(falecido.dataObito)}
              </span>
            </div>
            <div className="fund">
              {falecido.ultimoDomicilio ? `Último domicílio: ${falecido.ultimoDomicilio} · ` : ''}
              {temSobrevivente
                ? `deixa ${nomeSobrev || 'cônjuge/companheiro(a)'}${
                    falecido.dataCasamento ? ` (casamento/união desde ${formatarData(falecido.dataCasamento)})` : ''
                  }`
                : 'não deixa cônjuge ou companheiro(a)'}
            </div>
          </div>

          <h2>Interessados e perguntas do sistema</h2>
          {perguntasPendentes && (
            <p className="mono-alerta">
              Há perguntas do ITCMD sem resposta — complete as fichas dos herdeiros no item I
              antes de transmitir a declaração.
            </p>
          )}
          <div className="check">
            {herdeiros.map((h) => {
              const p = perguntas[h.id] ?? PERGUNTAS_ITCMD_VAZIAS;
              const q = qualificacoes[h.id];
              return (
                <div className="check-item" key={h.id}>
                  <span className="prio">·</span>
                  <div>
                    <h4>
                      {h.nome}
                      {q?.cpf ? <span className="fracao num"> · CPF {q.cpf}</span> : null}
                    </h4>
                    {ROTULOS_PERGUNTAS_ITCMD.map(({ campo, texto }) => (
                      <p key={campo}>
                        {texto}{' '}
                        <strong>
                          {p[campo] === null ? '— responder no item I' : p[campo] ? 'SIM' : 'NÃO'}
                        </strong>
                      </p>
                    ))}
                  </div>
                  <span />
                </div>
              );
            })}
          </div>

          <h2>Bens e transmissão</h2>
          <div className="espelho">
            <div className="cabeca">
              <span>Bem declarado</span>
              <span>Natureza</span>
              <span style={{ textAlign: 'right' }}>Valor no óbito</span>
            </div>
            {bens.map((b) => (
              <div className="lanc" key={b.id}>
                <span className="nome">{b.descricao}</span>
                <span className="fracao">{b.natureza === 'COMUM' ? 'comum' : 'particular'}</span>
                <span className="valor num" style={{ fontSize: 16 }}>{brl(b.valor)}</span>
              </div>
            ))}
            <div className="lanc">
              <span className="nome">Total do acervo</span>
              <span />
              <span className="valor num">{brl(resultado.acervo.massaPartilhavel)}</span>
            </div>
            {resultado.meacao && (
              <>
                <div className="lanc">
                  <span className="nome">(−) Meação de {resultado.meacao.beneficiario}</span>
                  <span className="fracao">não é herança — fora da base</span>
                  <span className="valor num">{brl(resultado.meacao.valor)}</span>
                </div>
                <div className="fund">{resultado.meacao.fundamento} — a meação não é transmissão causa mortis.</div>
              </>
            )}
            <div className="lanc">
              <span className="nome">Base de cálculo (herança transmitida)</span>
              <span className="fracao">art. 9º — valor venal (mercado) na data do óbito</span>
              <span className="valor num">{brl(resultado.heranca.total)}</span>
            </div>
            {isencoes && isencoes.valorIsento > 0 && (
              <>
                <div className="lanc">
                  <span className="nome">(−) Isenções do art. 6º</span>
                  <span className="fracao">marcadas abaixo</span>
                  <span className="valor num" style={{ color: 'var(--verde-registro)' }}>
                    {brl(isencoes.valorIsento)}
                  </span>
                </div>
                <div className="lanc">
                  <span className="nome">Base tributável líquida</span>
                  <span />
                  <span className="valor num">
                    {brl(Math.max(0, Number(resultado.heranca.total) - isencoes.valorIsento))}
                  </span>
                </div>
              </>
            )}
          </div>

          <h2>Isenções (art. 6º da Lei 10.705/2000)</h2>

          {/* Leitura AUTOMÁTICA: o sistema interpreta cada bem contra as
              hipóteses do art. 6º, I (medidas em UFESPs do ano do óbito) e
              demonstra o enquadramento; requisitos de fato saem como
              condições a confirmar antes de marcar a isenção abaixo. */}
          {falecido.dataObito && bens.length > 0 && (
            <>
              <span className="eyebrow">Leitura automática do acervo</span>
              <div className="check" style={{ margin: '6px 0 14px' }}>
                {analisarIsencoesPorBem(
                  bens.map((b) => ({ tipo: b.tipo, valor: Number(b.valor), descricao: b.descricao })),
                  ufespDoAno(Number(falecido.dataObito.slice(0, 4))).valor,
                ).map((a) => (
                  <div className="check-item" key={a.indice}>
                    <span
                      className="prio"
                      style={{
                        color:
                          a.verdito === 'ISENTO_POSSIVEL'
                            ? 'var(--verde-registro)'
                            : a.verdito === 'AVALIAR'
                              ? 'var(--bronze)'
                              : 'var(--lacre)',
                      }}
                    >
                      {a.verdito === 'ISENTO_POSSIVEL' ? '✓' : a.verdito === 'AVALIAR' ? '?' : '✗'}
                    </span>
                    <div>
                      <h4>
                        {a.indice}. {a.descricao}{' '}
                        <span className="num" style={{ fontWeight: 400 }}>· {brl(a.valor)}</span>
                      </h4>
                      <p>
                        <strong>
                          {a.verdito === 'ISENTO_POSSIVEL'
                            ? `Possivelmente ISENTO (${a.hipotese})`
                            : a.verdito === 'AVALIAR'
                              ? `Avaliar (${a.hipotese})`
                              : 'Tributado'}
                        </strong>{' '}
                        — {a.explicacao}
                      </p>
                      {a.condicoes.map((c, j) => (
                        <p key={j} style={{ color: 'var(--tinta-media)' }}>
                          Confirmar: {c}
                        </p>
                      ))}
                    </div>
                    <span />
                  </div>
                ))}
              </div>
              <p className="fund" style={{ marginBottom: 10 }}>
                A isenção é declarada no próprio sistema da declaração do ITCMD (Sefaz-SP) —
                confirmadas as condições, marque abaixo para o sistema abater da base.
              </p>
            </>
          )}

          <label className="marcar">
            <Checkbox
              checked={fiscal.isencaoResidencial}
              onCheckedChange={(v) => patch({ isencaoResidencial: v === true })}
            />
            <span>
              Imóvel residencial em que os familiares residem, sem outro imóvel — isento até
              5.000 UFESPs (art. 6º, I, &quot;a&quot;)
            </span>
          </label>
          <label className="marcar">
            <Checkbox
              checked={fiscal.isencaoDepositos}
              onCheckedChange={(v) => patch({ isencaoDepositos: v === true })}
            />
            <span>
              Depósitos bancários e aplicações financeiras — isentos até 1.000 UFESPs no
              conjunto (art. 6º, I, &quot;d&quot;)
            </span>
          </label>
          <p className="fund">
            O teto não é franquia: bem que ultrapassa o limite é tributado por inteiro.
            Confirme os requisitos caso a caso antes de aplicar.
          </p>
          {isencoes?.detalhes.map((d, i) => (
            <p key={i} className="fund" style={{ color: 'var(--verde-registro)' }}>
              {d}
            </p>
          ))}
          {isencoes?.avisos.map((a, i) => (
            <p key={i} className="mono-alerta">
              {a}
            </p>
          ))}

          {bens.some((b) => b.tipo === 'QUOTAS') && (
            <div className="nota exigencia">
              <span className="eyebrow">Quotas e ações no acervo</span>
              <p>
                A LC 227/2026 passa a exigir base a valor de MERCADO para participações em
                sociedades não listadas — patrimônio líquido ajustado + fundo de comércio.
                Balanço contábil puro tende a ser recusado; holdings com imóvel a custo
                histórico encarecem. Prepare o balanço ajustado antes da declaração.
              </p>
            </div>
          )}

          {/* ---------- provisão ---------- */}
          <h2>Provisão do imposto em {formatarData(hoje)}</h2>
          <div className="grade c2" style={{ margin: '10px 0 4px' }}>
            <div className="campo">
              O inventário já foi aberto (protocolado)?
              <div className="escolha">
                <Pilula ativo={fiscal.inventarioAberto} onClick={() => patch({ inventarioAberto: true })}>
                  Sim
                </Pilula>
                <Pilula ativo={!fiscal.inventarioAberto} onClick={() => patch({ inventarioAberto: false })}>
                  Não
                </Pilula>
              </div>
            </div>
            {fiscal.inventarioAberto && (
              <label className="campo">
                Data do protocolo
                <DateInput
                  value={fiscal.dataProtocolo}
                  onChange={(iso) => patch({ dataProtocolo: iso })}
                />
              </label>
            )}
          </div>

          <div className="espelho">
            <div className="cabeca">
              <span>Parcela</span>
              <span>Fundamento</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
            </div>
            <div className="lanc">
              <span className="nome">Base atualizada pela UFESP</span>
              <span className="fracao">art. 15</span>
              <span className="valor num" style={{ fontSize: 16 }}>{brl(provisao.baseAtualizada)}</span>
            </div>
            <div className="fund">
              {provisao.baseEmUfesps.toFixed(2)} UFESPs (UFESP do óbito {brl(provisao.ufespObito)} →
              atual {brl(provisao.ufespReferencia)}) · alíquota de {ALIQUOTA_ITCMD_SP * 100}% (art. 16).
            </div>
            {provisao.parcelas.map((p) => (
              <div key={p.id}>
                <div className="lanc">
                  <span className="nome">{p.rotulo}</span>
                  <span className="fracao">{p.fundamento.replace('Lei 10.705/2000, ', '')}</span>
                  <span
                    className="valor num"
                    style={{ color: p.valor < 0 ? 'var(--verde-registro)' : undefined, fontSize: 17 }}
                  >
                    {p.valor < 0 ? `− ${brl(-p.valor)}` : brl(p.valor)}
                  </span>
                </div>
                {p.detalhe && <div className="fund">{p.detalhe}</div>}
              </div>
            ))}
            <div className="lanc">
              <span className="nome">Provisão total em {formatarData(hoje)}</span>
              <span />
              <span className="valor num" style={{ fontSize: 22 }}>{brl(provisao.total)}</span>
            </div>
          </div>

          <div className="grade c2" style={{ marginTop: 14 }}>
            <div className="nota">
              <span className="eyebrow">Prazos do caso</span>
              <div className="regua num" aria-hidden>
                <div className="barra">
                  <div
                    className={`preenchido${provisao.diasDesdeObito > 180 ? ' tarde' : provisao.diasDesdeObito > 60 ? ' meio' : ''}`}
                    style={{ width: `${Math.min(100, Math.max(2, (provisao.diasDesdeObito / 240) * 100))}%` }}
                  />
                </div>
                <div className="marcas">
                  <span>0</span>
                  <span>60 — multa 10%</span>
                  <span>180 — multa 20% e juros</span>
                </div>
              </div>
              <p>
                Desconto de 5%: recolhendo até <strong>{formatarData(sumDias(falecido.dataObito, 90))}</strong> (art. 17, §2º).
                <br />
                Vencimento sem encargos: <strong>{formatarData(provisao.vencimento)}</strong> — 180 dias do
                óbito (art. 17, §1º).
                <br />
                {provisao.diasDeAtraso > 0
                  ? `Hoje: ${provisao.diasDeAtraso} dia(s) após o vencimento.`
                  : `Hoje: ${provisao.diasDesdeObito} dia(s) do óbito, dentro do prazo.`}
              </p>
            </div>
            <div className="nota">
              <span className="eyebrow">Como recolher</span>
              <p>
                Declaração no{' '}
                <a
                  href="https://www10.fazenda.sp.gov.br/ITCMD_DEC/Default.aspx"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ textDecoration: 'underline', fontWeight: 600 }}
                >
                  sistema da declaração do ITCMD (Sefaz-SP)
                </a>{' '}
                e DARE emitido lá — o demonstrativo oficial fecha centavos com a Selic
                efetiva do Banco Central. Esta provisão orienta a reserva de caixa da
                família.
              </p>
            </div>
          </div>

          {provisao.avisos.map((a, i) => (
            <p key={i} className="fund" style={{ marginTop: 6 }}>
              {a}
            </p>
          ))}

          {/* ---------- cenário da reforma ---------- */}
          <h2>Cenário da reforma (EC 132/2023 · LC 227/2026)</h2>
          <p className="subtitulo" style={{ marginBottom: 12 }}>
            O imposto segue a lei vigente na DATA DO ÓBITO — óbito de hoje continua a 4%
            mesmo que a partilha saia depois. A progressividade da LC 227/2026 incide sobre o
            quinhão de cada herdeiro, não sobre o monte: mais herdeiros diluem a alíquota.
            Nenhuma faixa está em vigor em SP (PL 7/2024 e PL 409/2025 tramitam) — a tabela é
            hipótese editável.
          </p>
          <div className="grade c2">
            <label className="campo">
              Faixas progressivas em vigor a partir de
              <DateInput
                value={fiscal.vigencia}
                onChange={(iso) => patch({ vigencia: iso })}
              />
            </label>
            <label className="campo">
              Tabela de partida
              <Select
                value={fiscal.faixas.length === 1 ? 'teto' : 'pl7'}
                onValueChange={(v) => {
                  if (!v) return;
                  patch({
                    faixas:
                      v === 'teto'
                        ? [...FAIXAS_TETO_NACIONAL]
                        : FAIXAS_PL7_2024.map((f) => ({ ...f })),
                  });
                }}
              >
                <SelectTrigger aria-label="Tabela de partida das faixas">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pl7">PL 7/2024 — SP (2% a 8%)</SelectItem>
                  <SelectItem value="teto">Teto nacional (8% linear)</SelectItem>
                </SelectContent>
              </Select>
            </label>
          </div>
          <div className="espelho" style={{ marginTop: 12 }}>
            <div className="cabeca">
              <span>Faixa do quinhão (UFESPs)</span>
              <span>Em reais (UFESP atual)</span>
              <span style={{ textAlign: 'right' }}>Alíquota %</span>
            </div>
            {fiscal.faixas.map((f, i) => {
              const de = i === 0 ? 0 : fiscal.faixas[i - 1].ateUfesps ?? 0;
              const rotulo =
                f.ateUfesps === null
                  ? `acima de ${de.toLocaleString('pt-BR')}`
                  : `${de.toLocaleString('pt-BR')} a ${f.ateUfesps.toLocaleString('pt-BR')}`;
              const reais =
                f.ateUfesps === null
                  ? `acima de ${brl(de * provisao.ufespReferencia)}`
                  : `até ${brl(f.ateUfesps * provisao.ufespReferencia)}`;
              return (
                <div className="lanc" key={i}>
                  <span className="nome" style={{ fontWeight: 400 }}>{rotulo}</span>
                  <span className="fracao num">{reais}</span>
                  <span className="valor" style={{ fontSize: 15 }}>
                    <Input
                      inputMode="decimal"
                      className="num ml-auto"
                      style={{ maxWidth: 88, textAlign: 'right' }}
                      value={String(f.aliquota)}
                      aria-label={`Alíquota da faixa ${rotulo}`}
                      onChange={(e) => {
                        const v = Number(e.target.value.replace(',', '.'));
                        if (!Number.isFinite(v) || v < 0) return;
                        patch({
                          faixas: fiscal.faixas.map((x, xi) =>
                            xi === i ? { ...x, aliquota: v } : x
                          ),
                        });
                      }}
                    />
                  </span>
                </div>
              );
            })}
          </div>

          <h3 style={{ margin: '18px 0 6px', fontSize: 15 }}>
            Comparativo por herdeiro — hoje (4%) × tabela progressiva
          </h3>
          <div className="espelho">
            <div className="cabeca">
              <span>Herdeiro</span>
              <span>Hoje (4%)</span>
              <span style={{ textAlign: 'right' }}>Progressivo (diferença)</span>
            </div>
            {(() => {
              const herancaBruta = Number(resultado.heranca.total);
              const baseLiquida = Math.max(0, herancaBruta - (isencoes?.valorIsento ?? 0));
              const fatorIsencao = herancaBruta > 0 ? baseLiquida / herancaBruta : 0;
              const fatorAtualizacao = baseLiquida > 0 ? provisao.baseAtualizada / baseLiquida : 0;
              const linhas = resultado.quinhoes.map((q) => {
                const base = Number(q.valor) * fatorIsencao * fatorAtualizacao;
                const fixo = base * ALIQUOTA_ITCMD_SP;
                const prog = impostoProgressivo(base, provisao.ufespReferencia, fiscal.faixas);
                return { nome: q.nome, fixo, prog: prog.imposto, efetiva: prog.aliquotaEfetiva };
              });
              const totalFixo = linhas.reduce((s, l) => s + l.fixo, 0);
              const totalProg = linhas.reduce((s, l) => s + l.prog, 0);
              return (
                <>
                  {linhas.map((l) => (
                    <div className="lanc" key={l.nome}>
                      <span className="nome">{l.nome}</span>
                      <span className="fracao num">{brl(l.fixo)}</span>
                      <span
                        className="valor num"
                        style={{
                          fontSize: 16,
                          color: l.prog > l.fixo ? 'var(--lacre)' : 'var(--verde-registro)',
                        }}
                      >
                        {brl(l.prog)} ({l.prog > l.fixo ? '+' : ''}
                        {brl(l.prog - l.fixo)} · {l.efetiva.toFixed(2)}%)
                      </span>
                    </div>
                  ))}
                  <div className="lanc">
                    <span className="nome">Total</span>
                    <span className="fracao num">{brl(totalFixo)}</span>
                    <span
                      className="valor num"
                      style={{ color: totalProg > totalFixo ? 'var(--lacre)' : 'var(--verde-registro)' }}
                    >
                      {brl(totalProg)} ({totalProg > totalFixo ? '+' : ''}
                      {brl(totalProg - totalFixo)})
                    </span>
                  </div>
                  <div className="fund">
                    Bases líquidas de isenção e atualizadas pela UFESP. Lei estadual publicada
                    em 2026 só produz efeito a partir de 01/01/2027 (anterioridades anual e
                    nonagesimal) — ajuste a vigência acima quando a lei sair e o motor aplica
                    sozinho aos óbitos posteriores.
                  </div>
                </>
              );
            })()}
          </div>

          {/* ---------- avaliação a valor de mercado ---------- */}
          <div className="nota exigencia" style={{ marginTop: 24 }}>
            <span className="eyebrow">Evite a notificação de lançamento</span>
            <h3>Declare os imóveis pelo valor de MERCADO, não pelo venal de IPTU</h3>
            <p>
              A base de cálculo é o valor de mercado na data do óbito (art. 9º da Lei
              10.705/2000). Imóvel declarado abaixo disso sujeita o caso a arbitramento de
              ofício (art. 11): a Sefaz-SP apura pelo <strong>Método Comparativo Direto de
              Dados de Mercado</strong> — ao menos 3 amostras de anúncios de imóveis
              semelhantes, considerando 90% do valor médio do m² — e emite notificação de
              lançamento com declaração retificadora, prazo de 30 dias para impugnar ou pagar.
            </p>
            <p style={{ marginTop: 8 }}>
              Sugestão: antes de transmitir a declaração, avalie cada imóvel pelo mesmo
              método (3+ anúncios comparáveis, ajustados a 90%) ou contrate laudo de
              avaliador habilitado, e guarde as evidências com a minuta. Custa menos que o
              contencioso — e a diferença de imposto viria com multa e juros.
            </p>
            <p style={{ marginTop: 8 }}>
              Na defesa, vale lembrar: o STJ (Tema 1.371) só admite a revisão do valor
              declarado por procedimento administrativo formal e motivado — o Fisco não pode
              trocar automaticamente o valor declarado por tabela de referência infralegal.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

function sumDias(data: string, dias: number): string {
  const [a, m, d] = data.split('-').map(Number);
  const t = new Date(Date.UTC(a, m - 1, d) + dias * 86_400_000);
  return t.toISOString().slice(0, 10);
}
