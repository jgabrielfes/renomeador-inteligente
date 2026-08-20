/**
 * Painel do caso — coluna fixa à direita, sempre visível.
 *
 * A folha é preenchida no centro; aqui cada campo digitado vira número na
 * hora: régua do prazo do art. 611 do CPC com o custo em reais de cada
 * degrau (multa de 10% e 20%), custo fiscal aberto em imposto/multa/juros,
 * acervo, rito provável e pontos de atenção. Nada aqui é editável — é o
 * resumo executivo que o advogado consulta o tempo todo.
 */

import { useMemo } from 'react';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import type { ConviteHerdeiro } from '@/lib/portal/store';
import type { Bem, Herdeiro, Regime, Resultado, Vinculo } from '@/lib/partilha/types';
import { formatarData, type DadosFalecido } from '@/lib/partilha/familia';
import type { ProvisaoItcmd, ResultadoIsencoes } from '@/lib/partilha/itcmd';
import { faixaDoPrazo } from '@/lib/partilha/prazo';
import type { ProjecaoCustos } from '@/lib/partilha/custas';

const brl = (v: number | string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diffDias(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00`).getTime() - new Date(`${a}T00:00`).getTime()) / 86_400_000);
}

export function PainelCaso({
  falecido,
  temSobrevivente,
  vinculo,
  regime,
  herdeiros,
  bens,
  resultado,
  provisao,
  isencoes,
  custos = null,
  impostoSucessoes = 0,
  custosAdicionais = 0,
  alertasLeitura = [],
  notas = '',
  setNotas,
  convites = {},
  onVerCofre,
  aberto = false,
  onFechar,
  recolhido = false,
  onAlternarRecolhido,
  itcmdPago = false,
  itcmdQuitadoEm = '',
}: {
  falecido: DadosFalecido;
  temSobrevivente: boolean;
  vinculo: Vinculo;
  regime: Regime;
  herdeiros: Herdeiro[];
  bens: Bem[];
  resultado: Resultado | null;
  provisao: ProvisaoItcmd | null;
  isencoes: ResultadoIsencoes | null;
  custos?: ProjecaoCustos | null;
  /** Soma dos custos adicionais lançados à mão na aba V. */
  custosAdicionais?: number;
  /** ITCMD das sucessões cumuladas (fatos geradores próprios). */
  impostoSucessoes?: number;
  /** Alertas da leitura (herdeiros declarados sem lançamento, frações ideais). */
  alertasLeitura?: string[];
  /** Bloco de notas do caso — anotações livres, salvas com o snapshot. */
  notas?: string;
  setNotas?: (v: string) => void;
  /** Convites do cofre (portal do herdeiro) — alimentam o sino de notificações. */
  convites?: Record<string, ConviteHerdeiro>;
  /** Abre a aba Documentos (onde cada envio aparece no card correlato). */
  onVerCofre?: () => void;
  /** Celular: o painel vira gaveta — aberto/fechado pelo botão flutuante. */
  aberto?: boolean;
  onFechar?: () => void;
  /** Desktop: painel RECOLHIDO numa tira na margem direita — a seta reabre. */
  recolhido?: boolean;
  onAlternarRecolhido?: () => void;
  /** ITCMD marcado como PAGO na aba IV: o relógio do art. 611 fica verde. */
  itcmdPago?: boolean;
  itcmdQuitadoEm?: string;
}) {
  const temObito = Boolean(falecido.dataObito);
  const dias = temObito ? diffDias(falecido.dataObito, hojeIso()) : 0;
  const imposto = provisao?.imposto ?? 0;

  /* Sino de notificações do cofre: cada chegada pelo link do portal
     (documento enviado ou qualificação preenchida) conta no badge — os
     ARQUIVOS ficam no navegador do herdeiro; aqui chegam nome/tipo/status. */
  const notificacoesCofre = useMemo(() => {
    let total = 0;
    let aConferir = 0;
    let ultima = '';
    for (const c of Object.values(convites)) {
      if (c.qualificacaoEnviadaEm) {
        total += 1;
        ultima = `${c.nomeHerdeiro} preencheu a qualificação`;
      }
      for (const d of c.documentos) {
        if (d.status === 'PENDENTE' || !d.nomeArquivo) continue;
        total += 1;
        if (d.status === 'ENVIADO') aConferir += 1;
        ultima = `${c.nomeHerdeiro}: ${d.titulo}`;
      }
    }
    return { total, aConferir, ultima };
  }, [convites]);

  const incapaz = herdeiros.some((h) => h.menorOuIncapaz);

  const travas: string[] = [];
  if (incapaz)
    travas.push('Herdeiro incapaz — extrajudicial só com parecer favorável do MP (Res. CNJ 571/2024)');
  if (bens.some((b) => b.tipo === 'QUOTAS'))
    travas.push('Quotas no acervo — base a valor de mercado (LC 227/2026)');
  if (
    temSobrevivente &&
    regime === 'COMUNHAO_PARCIAL' &&
    resultado &&
    Number(resultado.heranca.particular) > 0
  )
    travas.push('Bens particulares — o(a) sobrevivente concorre com os descendentes');
  if (temSobrevivente && vinculo === 'UNIAO_ESTAVEL')
    travas.push('União estável — comprovar o vínculo e o regime aplicável');
  if (!bens.some((b) => Number(b.valor) > 0)) travas.push('Acervo ainda sem valores');
  for (const b of resultado?.bloqueios ?? []) travas.push(b);
  for (const a of alertasLeitura) travas.push(a);

  const custo10 = imposto * 0.1;
  const custo20 = imposto * 0.2;
  // Semântica de cor do prazo (lib/partilha/prazo.ts): ok → alerta →
  // vencido → histórico (neutro, "multa já incidente"). ITCMD PAGO deixa
  // tudo VERDE — o relógio parou de custar dinheiro.
  const faixaPrazo = itcmdPago ? 'ok' : faixaDoPrazo(dias);
  const cls = faixaPrazo === 'ok' ? '' : faixaPrazo;
  const largura = Math.min(100, Math.max(2, (dias / 240) * 100));

  return (
    <aside
      className={`painel${aberto ? ' aberto' : ''}${recolhido ? ' recolhido' : ''}`}
      aria-label="Painel do caso"
    >
      {/* Desktop: a setinha recolhe o painel numa tira na margem direita e o
          clique na tira reabre (no celular a gaveta cobre esse papel). */}
      {onAlternarRecolhido && (
        <button
          type="button"
          className="recolher-desktop"
          onClick={onAlternarRecolhido}
          aria-expanded={!recolhido}
          title={recolhido ? 'Abrir o painel do caso' : 'Recolher o painel do caso'}
        >
          {recolhido ? <ChevronLeft size={16} aria-hidden /> : <ChevronRight size={16} aria-hidden />}
          <span className="rotulo-vertical">Painel do caso</span>
        </button>
      )}
      {onFechar && (
        <button type="button" className="fechar-mobile" onClick={onFechar} aria-label="Fechar o painel">
          ✕
        </button>
      )}
      <h2>Painel do caso</h2>
      <p className="sub">
        {temObito
          ? `${falecido.nome || 'Caso sem nome'} — óbito em ${formatarData(falecido.dataObito)}`
          : 'Comece pela data do óbito — só isso já move três números aqui.'}
      </p>

      {/* Sino de notificações do cofre — pequeno, ACIMA do bloco de notas:
          o badge sobe (1, 2, 3…) conforme as chegadas pelo link do portal;
          o clique abre a aba Documentos, onde cada envio está no card
          correlato. */}
      {onVerCofre && (
        <button type="button" className="sino-cofre" onClick={onVerCofre}>
          <span className="sino">
            <Bell size={18} aria-hidden />
            {notificacoesCofre.total > 0 && (
              <span className="badge num" aria-hidden>
                {notificacoesCofre.total > 99 ? '99+' : notificacoesCofre.total}
              </span>
            )}
          </span>
          <span className="resumo">
            <b>
              Notificações do cofre
              {notificacoesCofre.aConferir > 0 && (
                <span style={{ color: 'var(--lacre)' }}>
                  {' '}· {notificacoesCofre.aConferir} a conferir
                </span>
              )}
            </b>
            <span>
              {notificacoesCofre.total === 0
                ? 'Nada recebido pelo link ainda'
                : notificacoesCofre.ultima}
            </span>
          </span>
        </button>
      )}

      {/* Bloco de notas do caso — no TOPO do painel (acima do prazo), maior:
          anotações livres, salvas com o caso. */}
      <div className="metrica">
        <div className="k">Bloco de notas</div>
        <Textarea
          value={notas}
          rows={7}
          placeholder="Anotações do caso — pendências, recados, o que combinar com a família…"
          onChange={(e) => setNotas?.(e.target.value)}
          style={{
            marginTop: 6,
            fontSize: 'var(--t-xs)',
            minHeight: 120,
            background: 'var(--papel-alto, transparent)',
          }}
        />
      </div>

      {temObito && (
        <div className="metrica">
          <div className="k">Prazo do art. 611 do CPC</div>
          <div
            className={`v num ${
              faixaPrazo === 'ok' ? 'verde' : faixaPrazo === 'alerta' ? 'alerta' : faixaPrazo === 'historico' ? 'historico' : 'lacre'
            }`}
            style={{ fontSize: 'var(--t-lg)' }}
          >
            {dias} dia(s) desde o óbito
            {itcmdPago && <span style={{ fontSize: 'var(--t-sm)' }}> · ITCMD pago</span>}
            {!itcmdPago && faixaPrazo === 'historico' && (
              <span style={{ fontSize: 'var(--t-sm)' }}> · multa já incidente</span>
            )}
          </div>
          <div className="regua" aria-hidden>
            <div className="barra">
              <div className={`preenchido ${cls}`} style={{ width: `${largura}%` }} />
            </div>
            <div className="marcas num">
              <span>0</span>
              <span>60 — multa 10%</span>
              <span>180 — multa 20%</span>
            </div>
          </div>
          <p className="rodape">
            {itcmdPago ? (
              <>
                <strong>ITCMD pago{itcmdQuitadoEm ? ` em ${formatarData(itcmdQuitadoEm)}` : ''}</strong>
                {' '}— multas e juros pararam na data do pagamento; o relógio deixou de
                pesar no custo do caso.
              </>
            ) : dias <= 60 ? (
              <>
                Restam <strong>{60 - dias} dia(s)</strong> para requerer sem multa.
                {imposto > 0 && <> Abrir depois custa {brl(custo10)}.</>}
              </>
            ) : dias <= 180 ? (
              <>
                Multa de 10% já incidente{imposto > 0 && <>: {brl(custo10)}</>}. Depois do 181º
                dia ela dobra{imposto > 0 && <> para {brl(custo20)}</>}.
              </>
            ) : (
              <>
                Multa de 20% incidente{imposto > 0 && <>: {brl(custo20)}</>}. Após o vencimento
                (180 dias) correm multa moratória e juros.
              </>
            )}
          </p>
        </div>
      )}

      {/* Monte-mor · Meação · Legítima: o retrato patrimonial do caso, entre
          o relógio do prazo e o custo — os três números que o advogado
          confere primeiro (dois de cada quando há sucessão cumulada). */}
      {resultado && resultado.bloqueios.length === 0 && (
        <div className="metrica">
          <div className="k">Monte-mor · Meação · Legítima</div>
          <table className="tabela-mml num">
            <tbody>
              <tr>
                <th scope="row">Monte-mor</th>
                <td>
                  {brl(
                    Number(resultado.acervo.bensComuns) +
                      Number(resultado.acervo.bensParticulares),
                  )}
                </td>
              </tr>
              <tr>
                <th scope="row">
                  Meação{resultado.meacao ? ` — ${resultado.meacao.beneficiario}` : ''}
                </th>
                <td>{resultado.meacao ? brl(resultado.meacao.valor) : brl(0)}</td>
              </tr>
              <tr>
                <th scope="row">Legítima (herança transmitida)</th>
                <td>{brl(resultado.heranca.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="metrica">
        <div className="k">Custo projetado do inventário</div>
        <div className="v num">
          {provisao ? brl(provisao.total + (custos?.total ?? 0) + impostoSucessoes + custosAdicionais) : '—'}
        </div>
        {provisao ? (
          <div className="pilha num">
            {/* ITCMD UNIFICADO no painel: imposto + encargos (atualização,
                multa, juros, desconto) num só número — a discriminação por
                artigo fica no item V (Custos), para não poluir o resumo. */}
            <div>
              <span className="rotulo">ITCMD (imposto + encargos)</span>
              <span>{brl(provisao.total)}</span>
            </div>
            {custosAdicionais > 0 && (
              <div>
                <span className="rotulo">Custos adicionais (lançados no item V)</span>
                <span>{brl(custosAdicionais)}</span>
              </div>
            )}
            {impostoSucessoes > 0 && (
              <div>
                <span className="rotulo">ITCMD — sucessões cumuladas</span>
                <span>{brl(impostoSucessoes)}</span>
              </div>
            )}
            {custos && (
              <>
                {custos.parcelas.some((p) => p.id === 'taxa-judiciaria') ? (
                  <div>
                    <span className="rotulo">Taxa judiciária (Lei 11.608/2003)</span>
                    <span>
                      {brl(custos.parcelas.find((p) => p.id === 'taxa-judiciaria')!.valor)}
                    </span>
                  </div>
                ) : (
                  <div>
                    <span className="rotulo">Escritura e atos notariais (est.)</span>
                    <span>
                      {brl(
                        // TODOS os atos de notas — escritura, torna, renúncias e
                        // reconhecimento de união estável: filtrar só por
                        // 'escritura*' deixava parcelas fora e o detalhamento
                        // não fechava com o total do cabeçalho.
                        custos.parcelas
                          .filter(
                            (p) =>
                              !p.id.startsWith('registro') &&
                              !p.id.startsWith('certid') &&
                              p.id !== 'taxa-judiciaria',
                          )
                          .reduce((a, p) => a + p.valor, 0),
                      )}
                    </span>
                  </div>
                )}
                {custos.parcelas.some((p) => p.id.startsWith('registro')) && (
                  <div>
                    <span className="rotulo">Registro de imóveis (est.)</span>
                    <span>
                      {brl(
                        custos.parcelas
                          .filter((p) => p.id.startsWith('registro'))
                          .reduce((a, p) => a + p.valor, 0),
                      )}
                    </span>
                  </div>
                )}
                <div>
                  <span className="rotulo">Certidões (aprox.)</span>
                  <span>
                    {brl(
                      custos.parcelas
                        .filter((p) => p.id.startsWith('certid'))
                        .reduce((a, p) => a + p.valor, 0),
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        ) : (
          <p className="rodape">Informe a data do óbito e ao menos um bem com valor.</p>
        )}
      </div>

      <div className="metrica">
        <div className="k">Acervo</div>
        <div className="v sm num">{resultado ? brl(resultado.acervo.massaPartilhavel) : '—'}</div>
        {resultado ? (
          <div className="pilha num">
            {resultado.meacao && (
              <div>
                <span className="rotulo">Meação — {resultado.meacao.beneficiario}</span>
                <span>{brl(resultado.meacao.valor)}</span>
              </div>
            )}
            <div>
              <span className="rotulo">Dívidas do espólio</span>
              <span>{brl(resultado.acervo.dividas)}</span>
            </div>
            <div>
              <span className="rotulo">Herança transmitida</span>
              <span>{brl(resultado.heranca.total)}</span>
            </div>
            {isencoes && isencoes.valorIsento > 0 && (
              <div>
                <span className="rotulo">Isenções do art. 6º</span>
                <span style={{ color: 'var(--verde-registro)' }}>− {brl(isencoes.valorIsento)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="rodape">Lance os bens no item II.</p>
        )}
      </div>

      <div className="metrica">
        <div className="k">Pontos de atenção</div>
        {travas.length > 0 ? (
          travas.map((t) => (
            <div key={t} className="alerta-painel">
              {t}
            </div>
          ))
        ) : (
          <p className="rodape">Nada travando por enquanto.</p>
        )}
      </div>
    </aside>
  );
}
