'use client';

/**
 * Questionário público "Começar um inventário" — uma pergunta por tela no
 * celular, com barra de progresso e voltar. NENHUM dado sensível (sem CPF,
 * sem nome do falecido, sem endereço); valores por FAIXA. O resultado sai na
 * hora, sem cadastro — nome/e-mail são a ÚLTIMA tela e opcionais.
 *
 * Os números vêm dos motores puros de lib/familias (triagem, estimativas,
 * checklist), que reaproveitam o ITCMD e as custas do módulo profissional.
 */

import { useMemo, useState } from 'react';

import '../(private)/sucessorista/sucessorista.css';

import {
  RESPOSTAS_INICIAIS,
  ROTULO_FAIXA,
  UFS,
  type BensDaFamilia,
  type FaixaValor,
  type RespostasFamilia,
} from '@/lib/familias/tipos';
import { classificarVia, type Triagem } from '@/lib/familias/triagem';
import { estimarCustos, type EstimativaCompleta } from '@/lib/familias/estimativas';
import { montarChecklistDocumentos, type ItemChecklist } from '@/lib/familias/documentos';
import { montarResultadoPdf } from '@/lib/familias/resultado-pdf';
import { baixarBlob } from '@/lib/partilha/xlsx';
import { GerarCodigoAdvogado, PedirAnalise, ResultadoView } from './resultado-view';

const TOTAL_TELAS = 12;

const FAIXAS: FaixaValor[] = ['ate-50', '50-200', '200-500', '500-1000', '1000-2000', 'acima-2000'];

/**
 * Ações do resultado recém-gerado: baixar em PDF, salvar (link de 90 dias)
 * e receber por e-mail — captura de contato SÓ aqui, com clareza e sem
 * pressão (o resultado já está na tela de qualquer forma).
 */
function AcoesResultado({
  r,
  triagem,
  estimativa,
  docs,
  radarAtivo,
  onRevisar,
}: {
  r: RespostasFamilia;
  triagem: Triagem;
  estimativa: EstimativaCompleta;
  docs: ItemChecklist[];
  radarAtivo: boolean;
  onRevisar: () => void;
}) {
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [salvando, setSalvando] = useState<'salvar' | 'email' | null>(null);
  const [urlSalvo, setUrlSalvo] = useState<string | null>(null);
  const [tokenSalvo, setTokenSalvo] = useState<string | null>(null);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [email, setEmail] = useState(r.email);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  const baixarPdf = async () => {
    setGerandoPdf(true);
    try {
      const blob = await montarResultadoPdf({
        r,
        triagem,
        estimativa,
        docs,
        agora: new Date().toISOString(),
      });
      baixarBlob(blob, 'Por onde comecar o inventario.pdf');
    } finally {
      setGerandoPdf(false);
    }
  };

  const enviar = async (acao: 'salvar' | 'email') => {
    setErroAcao(null);
    if (acao === 'email' && !/.+@.+\..+/.test(email.trim())) {
      setErroAcao('Informe um e-mail válido para receber o resultado.');
      return;
    }
    setSalvando(acao);
    try {
      const resp = await fetch('/api/familias', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ respostas: { ...r, email: email.trim() || r.email }, acao }),
      });
      const corpo = (await resp.json().catch(() => null)) as
        | { url?: string; token?: string; emailEnviado?: boolean; erro?: string }
        | null;
      if (!resp.ok || !corpo?.url) {
        setErroAcao(corpo?.erro ?? 'Não foi possível salvar agora — tente de novo.');
        return;
      }
      setUrlSalvo(corpo.url);
      setTokenSalvo(corpo.token ?? null);
      if (acao === 'email') setEmailEnviado(corpo.emailEnviado === true);
    } catch {
      setErroAcao('Não foi possível salvar — verifique a conexão e tente de novo.');
    } finally {
      setSalvando(null);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button className="acao" type="button" disabled={gerandoPdf} onClick={() => void baixarPdf()}>
          {gerandoPdf ? 'Gerando…' : 'Baixar em PDF'}
        </button>
        <button
          className="acao secundaria"
          type="button"
          disabled={salvando !== null}
          onClick={() => void enviar('salvar')}
        >
          {salvando === 'salvar' ? 'Salvando…' : 'Salvar e continuar depois'}
        </button>
        <button className="acao secundaria" type="button" onClick={onRevisar}>
          Revisar respostas
        </button>
      </div>

      <div className="nota" style={{ marginTop: 12 }}>
        <p style={{ marginBottom: 6 }}>
          <strong>Receber este resultado por e-mail</strong>{' '}
          <span className="fund">(com o link para reabrir quando quiser — guardado por 90 dias)</span>
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label className="campo" style={{ flex: '1 1 240px' }}>
            Seu e-mail
            <input
              type="text"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button
            className="acao"
            type="button"
            disabled={salvando !== null}
            onClick={() => void enviar('email')}
          >
            {salvando === 'email' ? 'Enviando…' : 'Receber por e-mail'}
          </button>
        </div>
        <p className="fund" style={{ marginTop: 6 }}>
          Usamos o e-mail só para isto — nada de lista de marketing.
        </p>
      </div>

      {erroAcao && <p className="mono-alerta">{erroAcao}</p>}
      {urlSalvo && (
        <div className="nota registro" style={{ marginTop: 10 }}>
          <span className="eyebrow">Resultado salvo</span>
          <p>
            {emailEnviado
              ? 'Enviamos o link para o seu e-mail. '
              : ''}
            Guarde este endereço para reabrir quando quiser (vale por 90 dias):
          </p>
          <p className="num" style={{ wordBreak: 'break-all', marginTop: 4 }}>
            <a href={urlSalvo}>{typeof location !== 'undefined' ? location.origin : ''}{urlSalvo}</a>
          </p>
        </div>
      )}
      {tokenSalvo && r.jaTemAdvogado === 'sim' && <GerarCodigoAdvogado token={tokenSalvo} />}
      {tokenSalvo && radarAtivo && r.jaTemAdvogado !== 'sim' && (
        <PedirAnalise token={tokenSalvo} emailInicial={email} />
      )}
    </>
  );
}

/** Botão de escolha única — cheio quando marcado, contorno quando não. */
function Opcao({
  marcado,
  onEscolher,
  children,
}: {
  marcado: boolean;
  onEscolher: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`acao ${marcado ? '' : 'secundaria'}`}
      style={{ display: 'block', width: '100%', textAlign: 'left', marginTop: 8 }}
      onClick={onEscolher}
    >
      {children}
    </button>
  );
}

/** Faixa de valor aproximado por classe de bem. */
function SeletorFaixa({
  valor,
  onMudar,
  rotuloVazio = 'não há / não se aplica',
}: {
  valor: FaixaValor | null;
  onMudar: (f: FaixaValor | null) => void;
  /** Texto da opção nula (a empresa usa "não sei informar"). */
  rotuloVazio?: string;
}) {
  return (
    <select
      value={valor ?? ''}
      onChange={(e) => onMudar((e.target.value || null) as FaixaValor | null)}
    >
      <option value="">{rotuloVazio}</option>
      {FAIXAS.map((f) => (
        <option key={f} value={f}>
          {ROTULO_FAIXA[f]}
        </option>
      ))}
    </select>
  );
}

export function FamiliasClient({ radarAtivo = false }: { radarAtivo?: boolean }) {
  const [tela, setTela] = useState(0); // 0 = capa; 1..12 = perguntas; 13 = resultado
  const [r, setR] = useState<RespostasFamilia>({ ...RESPOSTAS_INICIAIS });
  const [erro, setErro] = useState<string | null>(null);

  const patch = (p: Partial<RespostasFamilia>) => {
    setErro(null);
    setR((prev) => ({ ...prev, ...p }));
  };
  const patchBens = (p: Partial<BensDaFamilia>) => {
    setErro(null);
    setR((prev) => ({ ...prev, bens: { ...prev.bens, ...p } }));
  };

  // O relógio fica FORA dos motores (puros): a data de hoje nasce aqui, no
  // clique que gera o resultado.
  const [resultado, setResultado] = useState<{
    triagem: Triagem;
    estimativa: EstimativaCompleta;
  } | null>(null);

  const temAlgumBem = useMemo(
    () =>
      r.bens.imoveis !== null ||
      r.bens.veiculos !== null ||
      r.bens.financeiro !== null ||
      r.bens.outros !== null ||
      r.bens.empresa,
    [r.bens],
  );

  const validarTela = (): string | null => {
    switch (tela) {
      case 1:
        return r.ufFalecido ? null : 'Escolha o estado para continuar.';
      case 2:
        return r.dataObito ? null : 'Informe a data (pode ser aproximada).';
      case 5:
        return r.qtdHerdeiros >= 1 ? null : 'Informe quantos herdeiros são.';
      case 7:
        if (!temAlgumBem) return 'Marque ao menos um tipo de bem (ou "outros").';
        if (r.bens.imoveis && r.bens.imoveisUfs.length === 0)
          return 'Marque em que estado(s) ficam os imóveis.';
        return null;
      case 11:
        return r.ufFamilia ? null : 'Escolha o estado onde a família está.';
      default:
        return null;
    }
  };

  const avancar = () => {
    const e = validarTela();
    if (e) {
      setErro(e);
      return;
    }
    if (tela === 11 && !r.ufFamilia) return;
    if (tela === TOTAL_TELAS) {
      const triagem = classificarVia(r);
      const hoje = new Date().toISOString().slice(0, 10);
      setResultado({ triagem, estimativa: estimarCustos(r, hoje, triagem.via) });
      setTela(TOTAL_TELAS + 1);
      window.scrollTo({ top: 0 });
      return;
    }
    setTela((t) => t + 1);
    window.scrollTo({ top: 0 });
  };
  const voltar = () => {
    setErro(null);
    setTela((t) => Math.max(0, t - 1));
  };

  /* ---------- resultado ---------- */

  if (tela === TOTAL_TELAS + 1 && resultado) {
    const { triagem, estimativa } = resultado;
    const docs = montarChecklistDocumentos(r, triagem.via);
    return (
      <div className="sucessorista">
        <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
          <ResultadoView
            r={r}
            triagem={triagem}
            estimativa={estimativa}
            docs={docs}
            acoes={
              <AcoesResultado
                r={r}
                triagem={triagem}
                estimativa={estimativa}
                docs={docs}
                radarAtivo={radarAtivo}
                onRevisar={() => setTela(TOTAL_TELAS)}
              />
            }
          />
        </main>
      </div>
    );
  }

  /* ---------- capa ---------- */

  if (tela === 0) {
    return (
      <div className="sucessorista">
        <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
          <span className="eyebrow">Para famílias</span>
          <h1>Perdeu alguém e não sabe por onde começar?</h1>
          <p className="subtitulo">
            O inventário é o processo que passa os bens de quem faleceu para a família. Em
            até 12 perguntas — uns 5 minutos — você descobre, de graça e sem cadastro:
          </p>
          <ul className="custos-portal">
            <li><span>Se o caminho é o cartório, a justiça ou um pedido mais simples (alvará)</span></li>
            <li><span>Quanto custa, em faixas honestas: imposto (ITCMD) e cartório/justiça</span></li>
            <li><span>O prazo legal e o que acontece se ele passar</span></li>
            <li><span>A lista de documentos que a família já pode separar</span></li>
          </ul>
          <p className="fund" style={{ marginTop: 8 }}>
            Não pedimos CPF, nome de quem faleceu nem endereço. Valores entram por faixa
            aproximada — o suficiente para estimar, nada além.
          </p>
          <div style={{ marginTop: 14 }}>
            <button className="acao" type="button" onClick={() => setTela(1)}>
              Começar — é grátis
            </button>
          </div>
          <footer className="rodape-etico">
            Orientação geral — não substitui a consulta com advogado(a). Esta plataforma não
            intermedeia honorários nem indica advogados.
          </footer>
        </main>
      </div>
    );
  }

  /* ---------- perguntas (1..12) ---------- */

  return (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
        <span className="eyebrow">
          Pergunta {tela} de {TOTAL_TELAS}
        </span>
        {/* Barra de progresso simples, nos tokens da identidade. */}
        <div
          aria-hidden
          style={{ height: 4, background: 'var(--fio)', borderRadius: 2, margin: '8px 0 16px' }}
        >
          <div
            style={{
              height: 4,
              width: `${Math.round((tela / TOTAL_TELAS) * 100)}%`,
              background: 'var(--bronze)',
              borderRadius: 2,
            }}
          />
        </div>

        {tela === 1 && (
          <>
            <h1>Em que estado a pessoa que faleceu morava?</h1>
            <p className="fund">É o estado que define onde o inventário corre e parte do imposto.</p>
            <label className="campo" style={{ maxWidth: 240 }}>
              Estado (UF)
              <select value={r.ufFalecido} onChange={(e) => patch({ ufFalecido: e.target.value })}>
                <option value="">Selecione…</option>
                {UFS.map((uf) => (
                  <option key={uf}>{uf}</option>
                ))}
              </select>
            </label>
          </>
        )}

        {tela === 2 && (
          <>
            <h1>Quando foi o falecimento?</h1>
            <p className="fund">Pode ser a data aproximada — ela define prazos e eventuais multas.</p>
            <label className="campo" style={{ maxWidth: 240 }}>
              Data
              <input
                type="date"
                value={r.dataObito}
                onChange={(e) => patch({ dataObito: e.target.value })}
              />
            </label>
          </>
        )}

        {tela === 3 && (
          <>
            <h1>Havia testamento?</h1>
            <Opcao marcado={r.testamento === 'nao'} onEscolher={() => patch({ testamento: 'nao' })}>
              Não
            </Opcao>
            <Opcao marcado={r.testamento === 'sim'} onEscolher={() => patch({ testamento: 'sim' })}>
              Sim
            </Opcao>
            <Opcao
              marcado={r.testamento === 'nao-sei'}
              onEscolher={() => patch({ testamento: 'nao-sei' })}
            >
              Não sei — nunca verificamos
            </Opcao>
          </>
        )}

        {tela === 4 && (
          <>
            <h1>A pessoa era casada ou vivia com alguém?</h1>
            <Opcao marcado={r.vinculo === 'nao'} onEscolher={() => patch({ vinculo: 'nao', regime: '' })}>
              Não (solteira, divorciada ou viúva)
            </Opcao>
            <Opcao marcado={r.vinculo === 'casado'} onEscolher={() => patch({ vinculo: 'casado' })}>
              Casada
            </Opcao>
            <Opcao
              marcado={r.vinculo === 'uniao-estavel'}
              onEscolher={() => patch({ vinculo: 'uniao-estavel' })}
            >
              Vivia em união estável
            </Opcao>
            {r.vinculo !== 'nao' && (
              <label className="campo" style={{ marginTop: 12 }}>
                Regime de bens (se souber)
                <select
                  value={r.regime}
                  onChange={(e) => patch({ regime: e.target.value as RespostasFamilia['regime'] })}
                >
                  <option value="">não sei</option>
                  <option value="comunhao-parcial">Comunhão parcial (o mais comum)</option>
                  <option value="comunhao-universal">Comunhão universal</option>
                  <option value="separacao">Separação de bens</option>
                </select>
              </label>
            )}
          </>
        )}

        {tela === 5 && (
          <>
            <h1>Quantos herdeiros são?</h1>
            <p className="fund">
              Em geral: filhos e cônjuge/companheiro(a). Sem filhos, entram pais; sem pais,
              irmãos. Conte quem você acredita que herda.
            </p>
            <label className="campo" style={{ maxWidth: 200 }}>
              Número de herdeiros
              <input
                type="number"
                min={1}
                max={30}
                value={r.qtdHerdeiros}
                onChange={(e) => patch({ qtdHerdeiros: Math.max(1, Number(e.target.value) || 1) })}
              />
            </label>
            <p style={{ marginTop: 12 }}>
              <strong>Algum herdeiro é menor de idade ou incapaz?</strong>
            </p>
            <Opcao marcado={r.menorOuIncapaz === 'nao'} onEscolher={() => patch({ menorOuIncapaz: 'nao' })}>
              Não — todos maiores e capazes
            </Opcao>
            <Opcao marcado={r.menorOuIncapaz === 'sim'} onEscolher={() => patch({ menorOuIncapaz: 'sim' })}>
              Sim
            </Opcao>
          </>
        )}

        {tela === 6 && (
          <>
            <h1>Todos concordam com a divisão?</h1>
            <p className="fund">O acordo de todos é o que permite o caminho mais rápido, em cartório.</p>
            <Opcao marcado={r.consenso === 'sim'} onEscolher={() => patch({ consenso: 'sim' })}>
              Sim, todos de acordo
            </Opcao>
            <Opcao marcado={r.consenso === 'nao'} onEscolher={() => patch({ consenso: 'nao' })}>
              Não — há divergência
            </Opcao>
            <Opcao
              marcado={r.consenso === 'nao-conversamos'}
              onEscolher={() => patch({ consenso: 'nao-conversamos' })}
            >
              Ainda não conversamos sobre isso
            </Opcao>
          </>
        )}

        {tela === 7 && (
          <>
            <h1>Que bens a pessoa deixou?</h1>
            <p className="fund">
              Valores aproximados, por faixa — servem só para estimar o imposto e os custos.
            </p>
            <label className="campo">
              Imóveis (casa, apartamento, terreno) — total aproximado
              <SeletorFaixa valor={r.bens.imoveis} onMudar={(f) => patchBens({ imoveis: f, imoveisUfs: f ? r.bens.imoveisUfs : [] })} />
            </label>
            {r.bens.imoveis && (
              <div className="nota" style={{ marginTop: 6 }}>
                <p style={{ marginBottom: 4 }}>
                  <strong>Em que estado(s) ficam os imóveis?</strong>{' '}
                  <span className="fund">(o imposto do imóvel é do estado onde ele fica)</span>
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {UFS.map((uf) => (
                    <label key={uf} className="marcar" style={{ fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={r.bens.imoveisUfs.includes(uf)}
                        onChange={(e) =>
                          patchBens({
                            imoveisUfs: e.target.checked
                              ? [...r.bens.imoveisUfs, uf]
                              : r.bens.imoveisUfs.filter((x) => x !== uf),
                          })
                        }
                      />
                      {uf}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <label className="campo" style={{ marginTop: 8 }}>
              Veículos — total aproximado
              <SeletorFaixa valor={r.bens.veiculos} onMudar={(f) => patchBens({ veiculos: f })} />
            </label>
            <label className="campo" style={{ marginTop: 8 }}>
              Dinheiro, contas, investimentos, FGTS/PIS, valores a receber
              <SeletorFaixa valor={r.bens.financeiro} onMudar={(f) => patchBens({ financeiro: f })} />
            </label>
            <label className="marcar" style={{ marginTop: 10, fontWeight: 400 }}>
              <input
                type="checkbox"
                checked={r.bens.empresa}
                onChange={(e) =>
                  patchBens({ empresa: e.target.checked, empresaValor: null })
                }
              />
              Tinha participação em empresa (sociedade, quotas)
            </label>
            {r.bens.empresa && (
              <label className="campo" style={{ marginTop: 8 }}>
                Capital social ou patrimônio líquido da parte dele(a) — aproximado
                <SeletorFaixa
                  valor={r.bens.empresaValor}
                  onMudar={(f) => patchBens({ empresaValor: f })}
                  rotuloVazio="não sei informar"
                />
              </label>
            )}
            <label className="campo" style={{ marginTop: 8 }}>
              Outros bens (joias, obras, semoventes…)
              <SeletorFaixa valor={r.bens.outros} onMudar={(f) => patchBens({ outros: f })} />
            </label>
          </>
        )}

        {tela === 8 && (
          <>
            <h1>Havia dívidas relevantes?</h1>
            <p className="fund">Financiamentos, empréstimos, impostos atrasados — elas saem do total antes da divisão.</p>
            <Opcao marcado={r.dividas === 'nao'} onEscolher={() => patch({ dividas: 'nao' })}>
              Não (ou nada relevante)
            </Opcao>
            <Opcao marcado={r.dividas === 'sim'} onEscolher={() => patch({ dividas: 'sim' })}>
              Sim
            </Opcao>
          </>
        )}

        {tela === 9 && (
          <>
            <h1>Algum herdeiro mora fora do país ou é difícil de localizar?</h1>
            <Opcao marcado={r.herdeiroExterior === 'nao'} onEscolher={() => patch({ herdeiroExterior: 'nao' })}>
              Não
            </Opcao>
            <Opcao marcado={r.herdeiroExterior === 'sim'} onEscolher={() => patch({ herdeiroExterior: 'sim' })}>
              Sim
            </Opcao>
          </>
        )}

        {tela === 10 && (
          <>
            <h1>A família já tem advogado(a) para o inventário?</h1>
            <Opcao marcado={r.jaTemAdvogado === 'nao'} onEscolher={() => patch({ jaTemAdvogado: 'nao' })}>
              Ainda não
            </Opcao>
            <Opcao marcado={r.jaTemAdvogado === 'sim'} onEscolher={() => patch({ jaTemAdvogado: 'sim' })}>
              Sim
            </Opcao>
          </>
        )}

        {tela === 11 && (
          <>
            <h1>Onde a família está?</h1>
            <p className="fund">Cidade e estado — só para contextualizar a orientação.</p>
            <div className="grade q-grid">
              <label className="campo">
                Cidade
                <input
                  type="text"
                  value={r.cidade}
                  onChange={(e) => patch({ cidade: e.target.value })}
                />
              </label>
              <label className="campo">
                Estado (UF)
                <select value={r.ufFamilia} onChange={(e) => patch({ ufFamilia: e.target.value })}>
                  <option value="">Selecione…</option>
                  {UFS.map((uf) => (
                    <option key={uf}>{uf}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}

        {tela === 12 && (
          <>
            <h1>Como prefere ser chamado(a)?</h1>
            <p className="fund">
              Opcional: o resultado sai do mesmo jeito. O e-mail só é necessário se você
              quiser salvar o resultado ou recebê-lo depois.
            </p>
            <div className="grade q-grid">
              <label className="campo">
                Primeiro nome (opcional)
                <input type="text" value={r.nome} onChange={(e) => patch({ nome: e.target.value })} />
              </label>
              <label className="campo">
                E-mail (opcional)
                <input
                  type="text"
                  inputMode="email"
                  value={r.email}
                  onChange={(e) => patch({ email: e.target.value })}
                />
              </label>
            </div>
            <label className="campo campo-longo" style={{ marginTop: 8 }}>
              Quer explicar algo em poucas palavras? (opcional)
              <textarea
                rows={3}
                maxLength={500}
                value={r.observacoes}
                onChange={(e) => patch({ observacoes: e.target.value })}
                placeholder="Ex.: a casa ainda está no nome dos avós; um irmão mora fora; a empresa está parada…"
              />
            </label>
            <p className="fund" style={{ marginTop: 4 }}>
              Essas observações acompanham o seu caso se você levá-lo a um(a)
              advogado(a) — não entram no resumo anônimo do Radar.
            </p>
          </>
        )}

        {erro && <p className="mono-alerta">{erro}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          <button className="acao secundaria" type="button" onClick={voltar}>
            Voltar
          </button>
          <button className="acao" type="button" onClick={avancar}>
            {tela === TOTAL_TELAS ? 'Ver meu resultado' : 'Continuar'}
          </button>
        </div>
      </main>
    </div>
  );
}
