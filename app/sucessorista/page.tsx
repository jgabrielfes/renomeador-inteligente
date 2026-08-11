'use client';

/**
 * O Sucessorista — folha de trabalho do inventário.
 *
 * Abas do processo: I Triagem · II Partilha (5 passos) · III Acervo · IV Pós-escritura.
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
import { triagem, type RespostasTriagem } from '@/lib/partilha/triagem';
import { montarChecklistAcervo, type StatusItemAcervo } from '@/lib/partilha/acervo';
import { gerarPosEscritura } from '@/lib/partilha/posescritura';
import type { Caso, Herdeiro, Bem, Regime, Vinculo } from '@/lib/partilha/types';

/* ---------- helpers ---------- */

const brl = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

let seq = 0;
const uid = (p: string) => `${p}${(seq += 1)}`;

/* ---------- estado inicial ---------- */

const REGIMES: { v: Regime; t: string }[] = [
  { v: 'COMUNHAO_PARCIAL', t: 'Comunhão parcial' },
  { v: 'COMUNHAO_UNIVERSAL', t: 'Comunhão universal' },
  { v: 'SEPARACAO_CONVENCIONAL', t: 'Separação convencional' },
  { v: 'SEPARACAO_OBRIGATORIA', t: 'Separação obrigatória' },
];

export default function Pagina() {
  const [abaProc, setAbaProc] = useState<'triagem' | 'partilha' | 'acervo' | 'pos'>('partilha');

  /* --- triagem --- */
  const [tri, setTri] = useState<RespostasTriagem>({
    todosMaioresECapazes: true,
    consensoEntreHerdeiros: true,
    existeTestamento: false,
    herdeiroNoExterior: false,
    bemNoExterior: false,
    falecidoDeixouDividasRelevantes: false,
    uf: 'SP',
  });
  const parecer = useMemo(() => triagem(tri), [tri]);

  /* --- partilha: 5 passos --- */
  const [passo, setPasso] = useState(1);
  const [temSobrevivente, setTemSobrevivente] = useState(true);
  const [vinculo, setVinculo] = useState<Vinculo>('CASAMENTO');
  const [regime, setRegime] = useState<Regime>('COMUNHAO_PARCIAL');
  const [nomeSobrev, setNomeSobrev] = useState('');
  const [herdeiros, setHerdeiros] = useState<Herdeiro[]>([]);
  const [bens, setBens] = useState<Bem[]>([]);

  const caso: Caso = useMemo(
    () => ({
      falecido: { dataObito: new Date().toISOString().slice(0, 10) },
      sobrevivente: temSobrevivente
        ? { vinculo, regime, nome: nomeSobrev || 'Cônjuge/companheiro(a)' }
        : null,
      herdeiros,
      bens,
    }),
    [temSobrevivente, vinculo, regime, nomeSobrev, herdeiros, bens],
  );

  const resultado = useMemo(() => {
    if (bens.length === 0 || (herdeiros.length === 0 && !temSobrevivente)) return null;
    try {
      return partilhar(caso);
    } catch {
      return null;
    }
  }, [caso, bens.length, herdeiros.length, temSobrevivente]);

  /* --- passo 5: partilha diferenciada --- */
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

  /* --- acervo --- */
  const [acervo, setAcervo] = useState(montarChecklistAcervo());
  const feitos = acervo.filter((i) => i.status === 'RECEBIDO' || i.status === 'NAO_SE_APLICA').length;

  /* --- pós-escritura --- */
  const tarefasPos = useMemo(
    () => (resultado ? gerarPosEscritura(caso, resultado, atribuicao) : []),
    [caso, resultado, atribuicao],
  );
  const [posFeitas, setPosFeitas] = useState<Record<string, boolean>>({});

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
            ['triagem', 'I', 'Triagem de via'],
            ['partilha', 'II', 'Partilha'],
            ['acervo', 'III', 'Acervo'],
            ['pos', 'IV', 'Pós-escritura'],
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
        {abaProc === 'triagem' && (
          <TriagemView tri={tri} setTri={setTri} parecer={parecer} />
        )}

        {abaProc === 'partilha' && (
          <>
            <h1>Partilha</h1>
            <p className="subtitulo">
              Do regime de bens ao espelho da partilha — com o fundamento legal de cada
              lançamento e a apuração de torna quando a família convenciona diferente do direito.
            </p>

            <div className="passos" role="tablist" aria-label="Passos">
              {['Vínculo e regime', 'Herdeiros', 'Bens', 'Espelho da partilha', 'Partilha diferenciada'].map(
                (t, i) => (
                  <button key={t} aria-current={passo === i + 1} onClick={() => setPasso(i + 1)}>
                    {i + 1}. {t}
                  </button>
                ),
              )}
            </div>

            {passo === 1 && (
              <section>
                <span className="eyebrow">Passo 1</span>
                <h2>Havia cônjuge ou companheiro(a)?</h2>
                <div className="escolha">
                  <button aria-pressed={temSobrevivente} onClick={() => setTemSobrevivente(true)}>
                    Sim
                  </button>
                  <button aria-pressed={!temSobrevivente} onClick={() => setTemSobrevivente(false)}>
                    Não
                  </button>
                </div>
                {temSobrevivente && (
                  <>
                    <h2>Vínculo</h2>
                    <div className="escolha">
                      <button aria-pressed={vinculo === 'CASAMENTO'} onClick={() => setVinculo('CASAMENTO')}>
                        Casamento
                      </button>
                      <button
                        aria-pressed={vinculo === 'UNIAO_ESTAVEL'}
                        onClick={() => setVinculo('UNIAO_ESTAVEL')}
                      >
                        União estável
                      </button>
                    </div>
                    <h2>Regime de bens</h2>
                    <div className="escolha">
                      {REGIMES.map((r) => (
                        <button key={r.v} aria-pressed={regime === r.v} onClick={() => setRegime(r.v)}>
                          {r.t}
                        </button>
                      ))}
                    </div>
                    <h2>Nome</h2>
                    <div className="grade c2">
                      <label className="campo">
                        Cônjuge/companheiro(a) sobrevivente
                        <input
                          type="text"
                          value={nomeSobrev}
                          onChange={(e: Ev) => setNomeSobrev(e.target.value)}
                          placeholder="Maria"
                        />
                      </label>
                    </div>
                  </>
                )}
                <div className="rodape-acoes">
                  <span />
                  <button className="acao" onClick={() => setPasso(2)}>
                    Avançar aos herdeiros
                  </button>
                </div>
              </section>
            )}

            {passo === 2 && (
              <EditorHerdeiros
                herdeiros={herdeiros}
                setHerdeiros={setHerdeiros}
                temSobrevivente={temSobrevivente}
                voltar={() => setPasso(1)}
                avancar={() => setPasso(3)}
              />
            )}

            {passo === 3 && (
              <EditorBens bens={bens} setBens={setBens} voltar={() => setPasso(2)} avancar={() => setPasso(4)} />
            )}

            {passo === 4 && (
              <EspelhoView resultado={resultado} voltar={() => setPasso(3)} avancar={() => setPasso(5)} />
            )}

            {passo === 5 && (
              <section>
                <span className="eyebrow">Passo 5</span>
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
                  <button className="acao fantasma" onClick={() => setPasso(4)}>
                    Voltar ao espelho
                  </button>
                  <button className="acao" onClick={() => setAbaProc('pos')}>
                    Ver pós-escritura
                  </button>
                </div>
              </section>
            )}
          </>
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
          </section>
        )}

        {abaProc === 'pos' && (
          <section>
            <h1>Pós-escritura</h1>
            <p className="subtitulo">
              A etapa que todo mundo esquece. Estas tarefas foram geradas a partir do SEU
              caso — cada bem, cada torna e cada característica do espólio produziu as suas.
            </p>
            {tarefasPos.length === 0 && (
              <div className="nota">
                <h3>Sem cálculo, sem checklist</h3>
                <p>Lance os bens e calcule a partilha na aba II para gerar as tarefas do caso.</p>
              </div>
            )}
            <div className="check">
              {tarefasPos.map((tarefa) => (
                <div className="check-item" key={tarefa.id}>
                  <input
                    type="checkbox"
                    checked={posFeitas[tarefa.id] ?? false}
                    aria-label={`Concluir: ${tarefa.titulo}`}
                    onChange={(e: Ev) => setPosFeitas((p) => ({ ...p, [tarefa.id]: e.target.checked === true }))}
                  />
                  <div style={{ opacity: posFeitas[tarefa.id] ? 0.45 : 1 }}>
                    <h4>{tarefa.titulo}</h4>
                    <p>{tarefa.detalhe}</p>
                    <p className="fund">{tarefa.orgao}</p>
                    {tarefa.prazoOuAlerta && <p className="alerta">{tarefa.prazoOuAlerta}</p>}
                  </div>
                  <span className="prio">P{tarefa.prioridade}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
    </div>
  );
}

/* ================= componentes ================= */

function Pergunta({
  campo,
  texto,
  tri,
  setTri,
}: {
  campo: keyof RespostasTriagem;
  texto: string;
  tri: RespostasTriagem;
  setTri: (t: RespostasTriagem) => void;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}>{texto}</p>
      <div className="escolha">
        <button
          aria-pressed={tri[campo] === true}
          onClick={() => setTri({ ...tri, [campo]: true })}
        >
          Sim
        </button>
        <button
          aria-pressed={tri[campo] === false}
          onClick={() => setTri({ ...tri, [campo]: false })}
        >
          Não
        </button>
      </div>
    </div>
  );
}

function TriagemView({
  tri,
  setTri,
  parecer,
}: {
  tri: RespostasTriagem;
  setTri: (t: RespostasTriagem) => void;
  parecer: ReturnType<typeof triagem>;
}) {
  const cls =
    parecer.via === 'EXTRAJUDICIAL' ? 'ok' : parecer.via === 'JUDICIAL' ? 'jud' : 'cond';
  const rotulo =
    parecer.via === 'EXTRAJUDICIAL'
      ? 'Via extrajudicial'
      : parecer.via === 'JUDICIAL'
        ? 'Via judicial'
        : 'Extrajudicial condicionada';

  return (
    <section>
      <h1>Triagem de via</h1>
      <p className="subtitulo">
        Sete respostas decidem se o inventário cabe em tabelionato ou vai ao juízo — e o
        parecer preliminar sai pronto para a comunicação com o cliente.
      </p>
      <Pergunta campo="todosMaioresECapazes" texto="Todos os herdeiros são maiores e capazes?" tri={tri} setTri={setTri} />
      <Pergunta campo="consensoEntreHerdeiros" texto="Há consenso sobre a partilha?" tri={tri} setTri={setTri} />
      <Pergunta campo="existeTestamento" texto="O falecido deixou testamento?" tri={tri} setTri={setTri} />
      {tri.existeTestamento && (
        <Pergunta campo="testamentoCumpridoJudicialmente" texto="O testamento já foi cumprido judicialmente?" tri={tri} setTri={setTri} />
      )}
      <Pergunta campo="herdeiroNoExterior" texto="Algum herdeiro reside no exterior?" tri={tri} setTri={setTri} />
      <Pergunta campo="bemNoExterior" texto="Há bem situado no exterior?" tri={tri} setTri={setTri} />
      <Pergunta campo="falecidoDeixouDividasRelevantes" texto="O falecido deixou dívidas relevantes?" tri={tri} setTri={setTri} />

      <h2>
        <span className={`selo-via ${cls}`}>{rotulo}</span>
      </h2>
      {parecer.impedimentos.map((i) => (
        <div className="nota exigencia" key={i.codigo}>
          <span className="eyebrow">{i.contornavel ? 'Impedimento contornável' : 'Impedimento'}</span>
          <h3>{i.descricao}</h3>
          <p>
            {i.fundamento}
            {i.comoContornar ? ` — Caminho: ${i.comoContornar}` : ''}
          </p>
        </div>
      ))}
      {parecer.condicoes.map((c, i) => (
        <div className="nota" key={i}>
          <p>{c}</p>
        </div>
      ))}
      <h2>Próximos passos</h2>
      <div className="check">
        {parecer.proximosPassos.map((p, i) => (
          <div className="check-item" key={i}>
            <span className="prio">·</span>
            <p style={{ fontSize: 14 }}>{p}</p>
            <span />
          </div>
        ))}
      </div>
      <h2>Parecer preliminar</h2>
      <div className="nota" style={{ whiteSpace: 'pre-line', fontSize: 13.5 }}>
        {parecer.parecerPreliminar}
      </div>
    </section>
  );
}

function EditorHerdeiros({
  herdeiros,
  setHerdeiros,
  temSobrevivente,
  voltar,
  avancar,
}: {
  herdeiros: Herdeiro[];
  setHerdeiros: (h: Herdeiro[]) => void;
  temSobrevivente: boolean;
  voltar: () => void;
  avancar: () => void;
}) {
  const [nome, setNome] = useState('');
  const [status, setStatus] = useState<Herdeiro['status']>('ATIVO');
  const [comum, setComum] = useState(true);

  const adicionar = () => {
    if (!nome.trim()) return;
    setHerdeiros([
      ...herdeiros,
      {
        id: uid('h'),
        nome: nome.trim(),
        classe: 'DESCENDENTE',
        grau: 1,
        status,
        filhoDoSobrevivente: comum,
      },
    ]);
    setNome('');
    setStatus('ATIVO');
    setComum(true);
  };

  return (
    <section>
      <span className="eyebrow">Passo 2</span>
      <h2>Descendentes</h2>
      <p className="subtitulo">
        Marque quem é filho(a) também do sobrevivente — em filiação híbrida a lei diverge, e
        o espelho mostrará os dois cenários.
      </p>
      <div className="grade c3">
        <label className="campo">
          Nome
          <input type="text" value={nome} onChange={(e: Ev) => setNome(e.target.value)} placeholder="Ana" />
        </label>
        <label className="campo">
          Situação
          <select value={status} onChange={(e: Ev) => setStatus(e.target.value as Herdeiro['status'])}>
            <option value="ATIVO">Vivo(a)</option>
            <option value="PRE_MORTO">Pré-morto(a)</option>
            <option value="RENUNCIANTE">Renunciante</option>
          </select>
        </label>
        {temSobrevivente && (
          <label className="campo">
            Filho(a) do sobrevivente?
            <select value={comum ? 's' : 'n'} onChange={(e: Ev) => setComum(e.target.value === 's')}>
              <option value="s">Sim</option>
              <option value="n">Não</option>
            </select>
          </label>
        )}
      </div>
      <div style={{ marginTop: 12 }}>
        <button className="acao fantasma" onClick={adicionar}>
          Adicionar herdeiro
        </button>
      </div>
      {herdeiros.map((h) => (
        <div className="linha-item" key={h.id}>
          <span>
            <strong>{h.nome}</strong>
            <span className="fracao">
              {' '}
              · {h.status === 'ATIVO' ? 'vivo(a)' : h.status === 'PRE_MORTO' ? 'pré-morto(a)' : 'renunciante'}
              {h.filhoDoSobrevivente === false ? ' · de outro relacionamento' : ''}
            </span>
          </span>
          <button className="remover" onClick={() => setHerdeiros(herdeiros.filter((x) => x.id !== h.id))}>
            remover
          </button>
        </div>
      ))}
      <p className="fund" style={{ marginTop: 10 }}>
        Representação de pré-morto por netos, ascendentes e colaterais: disponíveis no motor —
        nesta tela simplificada, casos com essas classes seguem pelo caso completo.
      </p>
      <div className="rodape-acoes">
        <button className="acao fantasma" onClick={voltar}>
          Voltar
        </button>
        <button className="acao" onClick={avancar}>
          Avançar aos bens
        </button>
      </div>
    </section>
  );
}

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
      <span className="eyebrow">Passo 3</span>
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
          Voltar
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
  voltar,
  avancar,
}: {
  resultado: ReturnType<typeof partilhar> | null;
  voltar: () => void;
  avancar: () => void;
}) {
  if (!resultado) {
    return (
      <section>
        <div className="nota">
          <h3>Faltam dados</h3>
          <p>Lance ao menos um bem e um herdeiro (ou sobrevivente) para calcular.</p>
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

  return (
    <section>
      <span className="eyebrow">Passo 4</span>
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
