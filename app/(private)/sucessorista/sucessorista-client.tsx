'use client';

/**
 * O Sucessorista — folha de trabalho do inventário.
 *
 * Abas do processo: I A família · II Acervo · III Partilha (3 passos) ·
 * IV Cofre de documentos · V ITCMD.
 * O cálculo roda no navegador: o motor é função pura importada direto.
 * Identidade visual própria ("livro de notas"), escopada em .sucessorista.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import './sucessorista.css';

/** Alias estrutural — compatível com o ChangeEvent de input, select e checkbox. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };
import { partilhar } from '@/lib/partilha/engine';
import { apurarAtribuicao, type TitularidadeBem, type TituloCessao } from '@/lib/partilha/atribuicao';
import { montarChecklistAcervo, type StatusItemAcervo } from '@/lib/partilha/acervo';
import type { Caso, Bem } from '@/lib/partilha/types';
import { QUALIFICACAO_VAZIA, type DadosFalecido, type Qualificacao } from '@/lib/partilha/familia';
import type { ConviteHerdeiro, QualificacaoHerdeiro } from '@/lib/portal/store';
import { gerarXlsx, baixarBlob, type CelulaXlsx } from '@/lib/partilha/xlsx';
import { FamiliaView, type EstadoFamilia } from './familia';
import { CofreView } from './cofre';
import { ItcmdView } from './itcmd-view';

/* ---------- helpers ---------- */

const brl = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

let seq = 0;
const uid = (p: string) => `${p}${(seq += 1)}`;

const FALECIDO_VAZIO: DadosFalecido = {
  nome: '',
  cpf: '',
  dataObito: '',
  dataCasamento: '',
  ultimoDomicilio: '',
};

type Aba = 'familia' | 'acervo' | 'partilha' | 'cofre' | 'itcmd';

export default function SucessoristaClient() {
  const [abaProc, setAbaProc] = useState<Aba>('familia');

  /* --- I: a família (falecido, herdeiros, qualificação, perguntas ITCMD) --- */
  const [familia, setFamilia] = useState<EstadoFamilia>({
    falecido: FALECIDO_VAZIO,
    temSobrevivente: true,
    vinculo: 'CASAMENTO',
    regime: 'COMUNHAO_PARCIAL',
    nomeSobrev: '',
    herdeiros: [],
    qualificacoes: {},
    perguntas: {},
  });
  const { falecido, temSobrevivente, vinculo, regime, nomeSobrev, herdeiros } = familia;

  /* --- III: partilha (3 passos: bens · espelho · diferenciada) --- */
  const [passo, setPasso] = useState(1);
  const [bens, setBens] = useState<Bem[]>([]);

  const caso: Caso = useMemo(
    () => ({
      falecido: { dataObito: falecido.dataObito || new Date().toISOString().slice(0, 10) },
      sobrevivente: temSobrevivente
        ? { vinculo, regime, nome: nomeSobrev || 'Cônjuge/companheiro(a)' }
        : null,
      herdeiros,
      bens,
    }),
    [falecido.dataObito, temSobrevivente, vinculo, regime, nomeSobrev, herdeiros, bens],
  );

  const resultado = useMemo(() => {
    if (bens.length === 0 || (herdeiros.length === 0 && !temSobrevivente)) return null;
    try {
      return partilhar(caso);
    } catch {
      return null;
    }
  }, [caso, bens.length, herdeiros.length, temSobrevivente]);

  /* --- passo 3: partilha diferenciada --- */
  const [usufrutoAtivo, setUsufrutoAtivo] = useState(false);
  const [titulo, setTitulo] = useState<TituloCessao>('GRATUITO');

  const atribuicao = useMemo(() => {
    if (!resultado || !usufrutoAtivo || resultado.bloqueios.length > 0) return null;
    if (!temSobrevivente || bens.length === 0) return null;
    const nus = herdeiros.filter((h) => h.classe === 'DESCENDENTE' && h.status === 'ATIVO');
    if (nus.length === 0) return null;
    const titularidades: TitularidadeBem[] = bens.flatMap((b) => [
      { bemId: b.id, titularId: '__sobrevivente__', direito: 'USUFRUTO' as const, fracao: '1' },
      ...nus.map((h) => ({
        bemId: b.id,
        titularId: h.id,
        direito: 'NUA_PROPRIEDADE' as const,
        fracao: `1/${nus.length}`,
      })),
    ]);
    return apurarAtribuicao(caso, resultado, {
      titularidades,
      titulosPorCedente: { __sobrevivente__: titulo },
    });
  }, [resultado, usufrutoAtivo, titulo, caso, bens, herdeiros, temSobrevivente]);

  /* --- II: acervo --- */
  const [acervo, setAcervo] = useState(montarChecklistAcervo());
  const feitos = acervo.filter((i) => i.status === 'RECEBIDO' || i.status === 'NAO_SE_APLICA').length;

  /* --- IV: cofre de documentos --- */
  const [casoId] = useState(() => uid('caso-') + Date.now().toString(36));
  const [convites, setConvites] = useState<Record<string, ConviteHerdeiro>>({});

  const importarQualificacao = (herdeiroId: string, q: QualificacaoHerdeiro) => {
    const atual = familia.qualificacoes[herdeiroId] ?? QUALIFICACAO_VAZIA;
    const mesclada: Qualificacao = { ...atual };
    for (const campo of Object.keys(q) as (keyof QualificacaoHerdeiro)[]) {
      const v = q[campo];
      if (v) mesclada[campo] = v;
    }
    setFamilia({
      ...familia,
      qualificacoes: { ...familia.qualificacoes, [herdeiroId]: mesclada },
    });
    setAbaProc('familia');
  };

  /* ---------- render ---------- */

  return (
    <div className="sucessorista">
    <div className="processo">
      <nav className="lombada" aria-label="Abas do processo">
        <Link href="/" className="voltar">← Módulos</Link>
        <div className="marca">
          O Sucessorista
          <small>Folha de trabalho do inventário</small>
        </div>
        {(
          [
            ['familia', 'I', 'A família'],
            ['acervo', 'II', 'Acervo'],
            ['partilha', 'III', 'Partilha'],
            ['cofre', 'IV', 'Cofre de documentos'],
            ['itcmd', 'V', 'ITCMD'],
          ] as const
        ).map(([id, ind, rotulo]) => (
          <button
            key={id}
            className="aba"
            aria-current={abaProc === id}
            onClick={() => setAbaProc(id)}
          >
            <span className="indice">{ind}</span>
            {rotulo}
          </button>
        ))}
        <div className="selo">
          Cálculo de apoio com fundamento legal.
          <br />
          Revisão do advogado responsável é obrigatória.
        </div>
      </nav>

      <main className="folha">
        {abaProc === 'familia' && (
          <FamiliaView
            estado={familia}
            onChange={setFamilia}
            avancar={() => setAbaProc('acervo')}
          />
        )}

        {abaProc === 'acervo' && (
          <section>
            <h1>Acervo</h1>
            <p className="subtitulo">
              O que mais atrasa inventário é herdeiro que não sabe o que o falecido tinha.
              Percorra as fontes na ordem — o testamento primeiro, porque decide a via.
            </p>
            <p className="progresso num">
              {feitos} de {acervo.length} fontes concluídas
            </p>
            <div className="check">
              {acervo.map((item, idx) => (
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
                  <select
                    className="status-sel"
                    value={item.status}
                    aria-label={`Status de ${item.fonte.nome}`}
                    onChange={(e: Ev) =>
                      setAcervo((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, status: e.target.value as StatusItemAcervo } : x,
                        ),
                      )
                    }
                  >
                    <option value="PENDENTE">Pendente</option>
                    <option value="SOLICITADO">Solicitado</option>
                    <option value="RECEBIDO">Recebido</option>
                    <option value="NAO_SE_APLICA">Não se aplica</option>
                  </select>
                </div>
              ))}
            </div>
            <div className="rodape-acoes">
              <button className="acao fantasma" onClick={() => setAbaProc('familia')}>
                Voltar à família
              </button>
              <button className="acao" onClick={() => setAbaProc('partilha')}>
                Avançar à partilha
              </button>
            </div>
          </section>
        )}

        {abaProc === 'partilha' && (
          <>
            <h1>Partilha</h1>
            <p className="subtitulo">
              Dos bens ao espelho da partilha — com o fundamento legal de cada lançamento e
              a apuração de torna quando a família convenciona diferente do direito. O
              vínculo, o regime e os herdeiros vêm do item I.
            </p>

            <div className="passos" role="tablist" aria-label="Passos">
              {['Bens', 'Espelho da partilha', 'Partilha diferenciada'].map((t, i) => (
                <button key={t} aria-current={passo === i + 1} onClick={() => setPasso(i + 1)}>
                  {i + 1}. {t}
                </button>
              ))}
            </div>

            {passo === 1 && (
              <EditorBens
                bens={bens}
                setBens={setBens}
                voltar={() => setAbaProc('familia')}
                avancar={() => setPasso(2)}
              />
            )}

            {passo === 2 && (
              <EspelhoView
                resultado={resultado}
                bens={bens}
                nomeCaso={falecido.nome}
                voltar={() => setPasso(1)}
                avancar={() => setPasso(3)}
              />
            )}

            {passo === 3 && (
              <section>
                <span className="eyebrow">Passo 3</span>
                <h2>Partilha diferenciada — usufruto e torna</h2>
                <p className="subtitulo">
                  Quando o(a) sobrevivente reserva o usufruto do acervo inteiro e os
                  descendentes ficam com a nua-propriedade, o desvio entre direito e
                  atribuição é a torna — e a torna é fato gerador.
                </p>
                <div className="escolha">
                  <button aria-pressed={!usufrutoAtivo} onClick={() => setUsufrutoAtivo(false)}>
                    Partilha na proporção do direito
                  </button>
                  <button aria-pressed={usufrutoAtivo} onClick={() => setUsufrutoAtivo(true)}>
                    Usufruto ao sobrevivente + nua-propriedade aos descendentes
                  </button>
                </div>

                {usufrutoAtivo && (
                  <>
                    <h2>Título da cessão do excedente</h2>
                    <div className="escolha">
                      <button aria-pressed={titulo === 'GRATUITO'} onClick={() => setTitulo('GRATUITO')}>
                        Gratuito (doação — ITCMD)
                      </button>
                      <button aria-pressed={titulo === 'ONEROSO'} onClick={() => setTitulo('ONEROSO')}>
                        Oneroso (reposição — ITBI)
                      </button>
                    </div>

                    {atribuicao && atribuicao.bloqueios.length === 0 && (
                      <>
                        <h2>Quadro da torna</h2>
                        <div className="espelho">
                          <div className="cabeca">
                            <span>Titular</span>
                            <span>Direito</span>
                            <span style={{ textAlign: 'right' }}>Delta</span>
                          </div>
                          {atribuicao.posicoes.map((p) => (
                            <div key={p.titularId}>
                              <div className="lanc">
                                <span className="nome">{p.nome}</span>
                                <span className="fracao num">{brl(p.valorDeDireito)}</span>
                                <span
                                  className="valor num"
                                  style={{
                                    color:
                                      p.papel === 'CEDENTE'
                                        ? 'var(--lacre)'
                                        : p.papel === 'CESSIONARIO'
                                          ? 'var(--verde-registro)'
                                          : undefined,
                                  }}
                                >
                                  {brl(p.delta)}
                                </span>
                              </div>
                              <div className="fund">
                                atribuído: {brl(p.valorAtribuido)} ·{' '}
                                {p.papel === 'CEDENTE'
                                  ? 'cede o excedente'
                                  : p.papel === 'CESSIONARIO'
                                    ? 'recebe acima do quinhão'
                                    : 'neutro'}
                              </div>
                            </div>
                          ))}
                        </div>

                        <h2>Fatos geradores</h2>
                        {atribuicao.transferencias.map((tr, i) => (
                          <div key={i} className={`nota ${tr.tributo === 'ITCMD_DOACAO' ? '' : 'registro'}`}>
                            <span className="eyebrow">
                              {tr.tributo === 'ITCMD_DOACAO' ? 'Doação · ITCMD estadual' : 'Torna onerosa · ITBI municipal'}
                            </span>
                            <h3>
                              {tr.cedenteNome} → {tr.cessionarioNome} · <span className="num">{brl(tr.valor)}</span>
                            </h3>
                            <p>
                              {tr.imposto
                                ? `Imposto estimado: ${brl(tr.imposto)} (alíquota da tabela vigente). `
                                : 'Guia municipal — alíquota da prefeitura do imóvel. '}
                              {tr.observacao ?? ''}
                            </p>
                          </div>
                        ))}
                        {atribuicao.avisos.map((a, i) => (
                          <p key={i} className="fund">
                            {a}
                          </p>
                        ))}
                      </>
                    )}
                    {atribuicao?.bloqueios.map((b, i) => (
                      <p key={i} className="mono-alerta">
                        {b}
                      </p>
                    ))}
                    {!atribuicao && (
                      <p className="mono-alerta">
                        O quadro exige sobrevivente, ao menos um descendente ativo e bens lançados.
                      </p>
                    )}
                  </>
                )}
                <div className="rodape-acoes">
                  <button className="acao fantasma" onClick={() => setPasso(2)}>
                    Voltar ao espelho
                  </button>
                  <button className="acao" onClick={() => setAbaProc('itcmd')}>
                    Ver ITCMD
                  </button>
                </div>
              </section>
            )}
          </>
        )}

        {abaProc === 'cofre' && (
          <CofreView
            herdeiros={herdeiros}
            nomeFalecido={falecido.nome}
            casoId={casoId}
            convites={convites}
            setConvites={setConvites}
            onImportarQualificacao={importarQualificacao}
            irParaFamilia={() => setAbaProc('familia')}
          />
        )}

        {abaProc === 'itcmd' && (
          <ItcmdView
            falecido={falecido}
            temSobrevivente={temSobrevivente}
            nomeSobrev={nomeSobrev}
            herdeiros={herdeiros}
            perguntas={familia.perguntas}
            qualificacoes={familia.qualificacoes}
            bens={bens}
            resultado={resultado}
            irParaFamilia={() => setAbaProc('familia')}
            irParaPartilha={() => {
              setAbaProc('partilha');
              setPasso(1);
            }}
          />
        )}
      </main>
    </div>
    </div>
  );
}

/* ================= componentes ================= */

function EditorBens({
  bens,
  setBens,
  voltar,
  avancar,
}: {
  bens: Bem[];
  setBens: (b: Bem[]) => void;
  voltar: () => void;
  avancar: () => void;
}) {
  const [descricao, setDescricao] = useState('');
  const [valor, setValor] = useState('');
  const [natureza, setNatureza] = useState<'COMUM' | 'PARTICULAR'>('COMUM');

  const adicionar = () => {
    const limpo = valor.replace(/\./g, '').replace(',', '.');
    if (!descricao.trim() || !/^\d+(\.\d{1,2})?$/.test(limpo)) return;
    setBens([
      ...bens,
      { id: uid('b'), descricao: descricao.trim(), valor: Number(limpo).toFixed(2), natureza },
    ]);
    setDescricao('');
    setValor('');
  };

  return (
    <section>
      <span className="eyebrow">Passo 1</span>
      <h2>Bens do acervo</h2>
      <p className="subtitulo">
        Valores na data do óbito. A distinção comum × particular decide, na comunhão parcial,
        se o sobrevivente concorre — e sobre o quê.
      </p>
      <div className="grade c3">
        <label className="campo">
          Descrição
          <input
            type="text"
            value={descricao}
            onChange={(e: Ev) => setDescricao(e.target.value)}
            placeholder="Imóvel mat. 12.345 — Guarulhos/SP"
          />
        </label>
        <label className="campo">
          Valor (R$)
          <input
            type="text"
            inputMode="decimal"
            className="num"
            value={valor}
            onChange={(e: Ev) => setValor(e.target.value)}
            placeholder="900.000,00"
          />
        </label>
        <label className="campo">
          Natureza
          <select value={natureza} onChange={(e: Ev) => setNatureza(e.target.value as 'COMUM' | 'PARTICULAR')}>
            <option value="COMUM">Comum (adquirido na constância)</option>
            <option value="PARTICULAR">Particular (herança, doação, anterior)</option>
          </select>
        </label>
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="acao fantasma" onClick={adicionar}>
          Lançar bem
        </button>
      </div>
      {bens.map((b) => (
        <div className="linha-item" key={b.id}>
          <span>
            <strong>{b.descricao}</strong>
            <span className="fracao num">
              {' '}
              · {brl(b.valor)} · {b.natureza === 'COMUM' ? 'comum' : 'particular'}
            </span>
          </span>
          <button className="remover" onClick={() => setBens(bens.filter((x) => x.id !== b.id))}>
            remover
          </button>
        </div>
      ))}
      <div className="rodape-acoes">
        <button className="acao fantasma" onClick={voltar}>
          Voltar à família
        </button>
        <button className="acao" onClick={avancar} disabled={bens.length === 0}>
          Calcular o espelho
        </button>
      </div>
    </section>
  );
}

function EspelhoView({
  resultado,
  bens,
  nomeCaso,
  voltar,
  avancar,
}: {
  resultado: ReturnType<typeof partilhar> | null;
  bens: Bem[];
  nomeCaso: string;
  voltar: () => void;
  avancar: () => void;
}) {
  const [exportando, setExportando] = useState(false);

  if (!resultado) {
    return (
      <section>
        <div className="nota">
          <h3>Faltam dados</h3>
          <p>Lance ao menos um bem e cadastre a família (item I) para calcular.</p>
        </div>
        <div className="rodape-acoes">
          <button className="acao fantasma" onClick={voltar}>
            Voltar
          </button>
          <span />
        </div>
      </section>
    );
  }

  /** Exporta o espelho em Excel: Herdeiro · Patrimônio · Percentual Recebido · Valor. */
  const exportarExcel = async () => {
    setExportando(true);
    try {
      const massa = Number(resultado.acervo.massaPartilhavel);
      const patrimonio = bens.map((b) => b.descricao).join('; ');
      const linhas: CelulaXlsx[][] = [];
      if (resultado.meacao) {
        linhas.push([
          { tipo: 'texto', valor: `${resultado.meacao.beneficiario} (meação — não é herança)` },
          { tipo: 'texto', valor: patrimonio },
          { tipo: 'pct', valor: massa > 0 ? Number(resultado.meacao.valor) / massa : 0 },
          { tipo: 'moeda', valor: Number(resultado.meacao.valor) },
        ]);
      }
      for (const q of resultado.quinhoes) {
        linhas.push([
          { tipo: 'texto', valor: q.nome },
          { tipo: 'texto', valor: `Fração ideal (${q.fracaoHeranca} da herança) sobre: ${patrimonio}` },
          { tipo: 'pct', valor: massa > 0 ? Number(q.valor) / massa : 0 },
          { tipo: 'moeda', valor: Number(q.valor) },
        ]);
      }
      linhas.push([
        { tipo: 'texto', valor: 'Total (massa partilhável)' },
        { tipo: 'texto', valor: patrimonio },
        { tipo: 'pct', valor: massa > 0 ? 1 : 0 },
        { tipo: 'moeda', valor: massa },
      ]);
      const blob = await gerarXlsx(
        'Partilha',
        ['Herdeiro', 'Patrimônio', 'Percentual Recebido', 'Valor'],
        linhas,
        [34, 60, 18, 18],
      );
      baixarBlob(blob, `Partilha${nomeCaso ? ` - ${nomeCaso}` : ''}.xlsx`);
    } finally {
      setExportando(false);
    }
  };

  return (
    <section>
      <span className="eyebrow">Passo 2</span>
      <h2>Espelho da partilha</h2>

      {resultado.bloqueios.map((b, i) => (
        <div className="nota exigencia" key={i}>
          <span className="eyebrow">Bloqueio</span>
          <p>{b}</p>
        </div>
      ))}

      {resultado.bloqueios.length === 0 && (
        <>
          <div className="grade c2" style={{ margin: '14px 0 6px' }}>
            <div>
              <span className="eyebrow">Massa partilhável</span>
              <p className="num" style={{ fontFamily: 'var(--display)', fontSize: 24 }}>
                {brl(resultado.acervo.massaPartilhavel)}
              </p>
            </div>
            {resultado.meacao && (
              <div>
                <span className="eyebrow">Meação — {resultado.meacao.beneficiario}</span>
                <p className="num" style={{ fontFamily: 'var(--display)', fontSize: 24 }}>
                  {brl(resultado.meacao.valor)}
                </p>
                <p className="fund">{resultado.meacao.fundamento}</p>
              </div>
            )}
          </div>

          <div className="espelho">
            <div className="cabeca">
              <span>Herdeiro</span>
              <span>Fração</span>
              <span style={{ textAlign: 'right' }}>Quinhão</span>
            </div>
            {resultado.quinhoes.map((q) => (
              <div key={q.herdeiroId}>
                <div className="lanc">
                  <span className="nome">
                    {q.nome}
                    {q.reservaUmQuartoAplicada ? ' · reserva de ¼ aplicada' : ''}
                  </span>
                  <span className="fracao num">{q.fracaoHeranca}</span>
                  <span className="valor num">{brl(q.valor)}</span>
                </div>
                <div className="fund">
                  {q.fundamento}
                  {q.precedente ? <span className="prec"> · {q.precedente}</span> : null}
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 14 }}>
            <button className="acao fantasma" onClick={exportarExcel} disabled={exportando}>
              {exportando ? 'Gerando planilha…' : 'Exportar em Excel (.xlsx)'}
            </button>
          </div>

          {resultado.divergencias.map((d, i) => (
            <div className="nota exigencia" key={i}>
              <span className="eyebrow">Divergência doutrinária</span>
              <h3>{d.tema}</h3>
              <p>{d.descricao}</p>
              <div className="cenarios">
                <div>
                  <strong>Adotado:</strong> {d.cenarioAdotado}
                </div>
                <div>
                  <strong>Alternativo:</strong> {d.cenarioAlternativo}
                  {d.quinhoesAlternativos.length > 0 && (
                    <div style={{ marginTop: 6 }}>
                      {d.quinhoesAlternativos.map((q) => (
                        <div key={q.herdeiroId} className="num">
                          {q.nome}: {brl(q.valor)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {resultado.avisos.map((a, i) => (
            <p key={i} className="fund" style={{ marginTop: 6 }}>
              {a}
            </p>
          ))}
        </>
      )}

      <div className="rodape-acoes">
        <button className="acao fantasma" onClick={voltar}>
          Voltar aos bens
        </button>
        <button className="acao" onClick={avancar} disabled={resultado.bloqueios.length > 0}>
          Partilha diferenciada
        </button>
      </div>
    </section>
  );
}
