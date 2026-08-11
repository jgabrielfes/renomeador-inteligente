/**
 * Item V — ITCMD.
 *
 * Espelho completo da declaração do ITCMD-SP (de cujus, interessados com as
 * perguntas do sistema, bens e apuração) e a provisão do imposto causa mortis
 * na data de hoje, contada do fato gerador (óbito), com cada parcela
 * discriminada pelo dispositivo da Lei 10.705/2000.
 */

import { useMemo, useState } from 'react';
import type { Bem, Herdeiro, Resultado } from '@/lib/partilha/types';
import {
  formatarData,
  ROTULOS_PERGUNTAS_ITCMD,
  PERGUNTAS_ITCMD_VAZIAS,
  type PerguntasItcmd,
  type Qualificacao,
  type DadosFalecido,
} from '@/lib/partilha/familia';
import { provisionarItcmd, ALIQUOTA_ITCMD_SP } from '@/lib/partilha/itcmd';

/** Alias estrutural — compatível com o ChangeEvent de input e select. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };

const brl = (v: number | string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ItcmdView({
  falecido,
  temSobrevivente,
  nomeSobrev,
  herdeiros,
  perguntas,
  qualificacoes,
  bens,
  resultado,
  irParaFamilia,
  irParaPartilha,
}: {
  falecido: DadosFalecido;
  temSobrevivente: boolean;
  nomeSobrev: string;
  herdeiros: Herdeiro[];
  perguntas: Record<string, PerguntasItcmd>;
  qualificacoes: Record<string, Qualificacao>;
  bens: Bem[];
  resultado: Resultado | null;
  irParaFamilia: () => void;
  irParaPartilha: () => void;
}) {
  const hoje = hojeIso();
  const [inventarioAberto, setInventarioAberto] = useState(false);
  const [dataProtocolo, setDataProtocolo] = useState('');

  const faltaObito = !falecido.dataObito;
  const faltaCalculo = !resultado || resultado.bloqueios.length > 0;

  const provisao = useMemo(() => {
    if (faltaObito || faltaCalculo || !resultado) return null;
    return provisionarItcmd({
      dataObito: falecido.dataObito,
      dataReferencia: hoje,
      baseCalculo: Number(resultado.heranca.total),
      dataProtocolo: inventarioAberto && dataProtocolo ? dataProtocolo : null,
    });
  }, [faltaObito, faltaCalculo, resultado, falecido.dataObito, hoje, inventarioAberto, dataProtocolo]);

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
            <button className="remover" onClick={irParaFamilia}>ir para A família</button>
          </p>
        </div>
      )}
      {faltaCalculo && (
        <div className="nota exigencia">
          <span className="eyebrow">Falta a base de cálculo</span>
          <p>
            Lance os bens e calcule o espelho no item III —{' '}
            <button className="remover" onClick={irParaPartilha}>ir para a Partilha</button>
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
          </div>

          {/* ---------- provisão ---------- */}
          <h2>Provisão do imposto em {formatarData(hoje)}</h2>
          <div className="grade c2" style={{ margin: '10px 0 4px' }}>
            <label className="campo">
              O inventário já foi aberto (protocolado)?
              <select
                value={inventarioAberto ? 's' : 'n'}
                onChange={(e: Ev) => setInventarioAberto(e.target.value === 's')}
              >
                <option value="n">Ainda não</option>
                <option value="s">Sim</option>
              </select>
            </label>
            {inventarioAberto && (
              <label className="campo">
                Data do protocolo
                <input
                  type="date"
                  value={dataProtocolo}
                  onChange={(e: Ev) => setDataProtocolo(e.target.value)}
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
                Declaração no sistema da Sefaz-SP (www10.fazenda.sp.gov.br/ITCMD_DEC) e DARE
                emitido lá — o demonstrativo oficial fecha centavos com a Selic efetiva do
                Banco Central. Esta provisão orienta a reserva de caixa da família.
              </p>
            </div>
          </div>

          {(provisao.estimativa || provisao.avisos.length > 0) && (
            <>
              {provisao.avisos.map((a, i) => (
                <p key={i} className="fund" style={{ marginTop: 6 }}>
                  {a}
                </p>
              ))}
            </>
          )}

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
