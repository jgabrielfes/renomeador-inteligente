'use client';

/**
 * Painel do herdeiro no Radar: status honesto (inclusive quando NINGUÉM
 * respondeu), o resumo ANÔNIMO que os advogados veem (transparência total),
 * as respostas recebidas em ORDEM ALEATÓRIA FIXA (sem ranking), a conversa
 * 1:1 com o(a) advogado(a) escolhido(a) — um por vez — e o "Retirar
 * solicitação", que apaga tudo do servidor na hora.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import '../../../(private)/sucessorista/sucessorista.css';

import type { CasoAnonimo } from '@/lib/radar/anonimizar';
import { TETO_CANDIDATURAS_POR_CASO } from '@/lib/radar/candidatura';
import type { ConversaParaFamilia, RespostaParaFamilia } from './page';

const ROTULO_STATUS: Record<string, string> = {
  resultado: 'Resultado gerado — ainda não publicado no Radar',
  publicado: 'Publicada — aguardando respostas de advogados',
  em_conversa: 'Em conversa com um(a) advogado(a)',
  contratado: 'Concluída — você contratou um(a) advogado(a)',
  // Moderação: a plataforma retirou do mural (dado particular no texto).
  despublicado: 'Retirada do mural pela plataforma — veja o e-mail que enviamos',
};

const ROTULO_VIA: Record<string, string> = {
  EXTRAJUDICIAL: 'cartório (extrajudicial)',
  JUDICIAL: 'judicial',
  ALVARA: 'alvará (simplificado)',
};

/** Iniciais do círculo de quem ainda não subiu foto — a ausência não vira
 *  buraco no layout nem ícone genérico de "usuário desconhecido". */
function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

export function MinhaSolicitacaoClient({
  token,
  dados,
  horasAviso,
}: {
  token: string;
  dados: {
    status: string;
    publicadoEm: string | null;
    horasSemResposta: number | null;
    casoAnonimo: CasoAnonimo | null;
    urlResultado: string;
    respostas: RespostaParaFamilia[];
    conversa: ConversaParaFamilia | null;
    codigoContratacao: string | null;
  } | null;
  horasAviso: number;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [retirada, setRetirada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [escolhendo, setEscolhendo] = useState<RespostaParaFamilia | null>(null);
  const [agindo, setAgindo] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [confirmandoContratei, setConfirmandoContratei] = useState(false);
  const [confirmandoEncerrar, setConfirmandoEncerrar] = useState(false);
  const [denunciando, setDenunciando] = useState<{ advogadoId: string; nome: string } | null>(null);
  const [motivoDenuncia, setMotivoDenuncia] = useState('');
  const [denunciaEnviada, setDenunciaEnviada] = useState(false);

  const acaoConversa = async (corpo: Record<string, unknown>): Promise<boolean> => {
    setErro(null);
    setAgindo(true);
    try {
      const r = await fetch('/api/familias/conversa', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, ...corpo }),
      });
      if (r.ok) {
        router.refresh();
        return true;
      }
      const c = (await r.json().catch(() => null)) as { erro?: string } | null;
      setErro(c?.erro ?? 'Não foi possível concluir — tente de novo.');
      return false;
    } catch {
      setErro('Não foi possível concluir — verifique a conexão.');
      return false;
    } finally {
      setAgindo(false);
    }
  };

  const retirar = async () => {
    setErro(null);
    setRetirando(true);
    try {
      const r = await fetch('/api/familias/retirar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      if (r.ok) setRetirada(true);
      else {
        const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
        setErro(corpo?.erro ?? 'Não foi possível retirar agora — tente de novo.');
      }
    } catch {
      setErro('Não foi possível retirar — verifique a conexão.');
    } finally {
      setRetirando(false);
    }
  };

  if (retirada) {
    return (
      <div className="sucessorista">
        <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
          <span className="eyebrow">Solicitação retirada</span>
          <h1>Tudo apagado</h1>
          <p className="subtitulo">
            Sua solicitação, o resultado e os códigos gerados saíram do nosso servidor.
            Se mudar de ideia, é só refazer o questionário — leva uns 5 minutos.
          </p>
          <a className="acao" href="/familias" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Refazer o questionário
          </a>
        </main>
      </div>
    );
  }

  if (!dados) {
    return (
      <div className="sucessorista">
        <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
          <h1>Solicitação não encontrada</h1>
          <div className="nota exigencia">
            <p>Este link não existe mais — a solicitação pode ter sido retirada ou expirado (90 dias).</p>
          </div>
        </main>
      </div>
    );
  }

  const semResposta =
    dados.status === 'publicado' &&
    dados.horasSemResposta !== null &&
    dados.horasSemResposta >= horasAviso;

  return (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
        <span className="eyebrow">Minha solicitação</span>
        <h1>{ROTULO_STATUS[dados.status] ?? dados.status}</h1>
        {dados.publicadoEm && dados.status === 'publicado' && (
          <p className="subtitulo">
            Publicada em {new Date(dados.publicadoEm).toLocaleDateString('pt-BR')} — o caso
            aparece para advogados SEM o seu nome e sem contato; você decide com quem
            conversar, um por vez.
          </p>
        )}

        {semResposta && (
          <div className="nota exigencia">
            <p>
              Sendo honestos: ainda não há advogados disponíveis que tenham respondido na
              sua região. Seu caso continua visível por 90 dias — e o seu resultado
              (estimativas, documentos, PDF) funciona igual com um(a) advogado(a) de sua
              confiança, de onde você quiser.
            </p>
          </div>
        )}

        {/* CONVERSA 1:1 — aberta pelo "Quero conversar"; um(a) por vez. */}
        {dados.conversa && (
          <section className="nota" style={{ marginTop: 8 }}>
            <span className="eyebrow">Sua conversa</span>
            <h3 style={{ margin: 0 }}>
              {dados.conversa.advogadoNome}
              {dados.conversa.advogadoOab ? ` — ${dados.conversa.advogadoOab}` : ''}
            </h3>
            {dados.status === 'contratado' && dados.codigoContratacao && (
              <div className="nota registro" style={{ marginTop: 8 }}>
                <p>
                  Contratação confirmada. Código do seu caso:{' '}
                  <strong style={{ fontSize: '1.2em', letterSpacing: '0.1em' }}>{dados.codigoContratacao}</strong>
                  {' '}— o(a) advogado(a) usa este código no Sucessorista para importar tudo o
                  que você respondeu (ele também já está na conversa).
                </p>
              </div>
            )}
            <div style={{ display: 'grid', gap: 6, marginTop: 8, maxHeight: 300, overflowY: 'auto' }}>
              {dados.conversa.mensagens.length === 0 && (
                <p className="fund">Conversa aberta — escreva a primeira mensagem se quiser.</p>
              )}
              {dados.conversa.mensagens.map((m, i) => (
                <p
                  key={i}
                  style={{
                    margin: 0,
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border, #ddd)',
                    background: m.autor === 'familia' ? 'var(--papel-alto, #eee)' : 'transparent',
                  }}
                >
                  <strong>{m.autor === 'familia' ? 'Você' : dados.conversa!.advogadoNome}:</strong> {m.texto}
                </p>
              ))}
            </div>
            <label className="campo" style={{ marginTop: 8 }}>
              Mensagem
              <textarea
                rows={2}
                maxLength={2000}
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
              />
            </label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
              <button
                className="acao"
                type="button"
                disabled={agindo || !mensagem.trim()}
                onClick={() => {
                  void acaoConversa({ acao: 'mensagem', texto: mensagem }).then((ok) => {
                    if (ok) setMensagem('');
                  });
                }}
              >
                Enviar
              </button>
              {dados.status === 'em_conversa' && (
                <>
                  <button className="acao secundaria" type="button" disabled={agindo} onClick={() => setConfirmandoContratei(true)}>
                    Contratei este(a) advogado(a)
                  </button>
                  <button className="acao secundaria" type="button" disabled={agindo} onClick={() => setConfirmandoEncerrar(true)}>
                    Encerrar conversa
                  </button>
                </>
              )}
            </div>
            {confirmandoContratei && (
              <div className="nota registro" style={{ marginTop: 10 }}>
                <p>
                  Confirmar a contratação gera um <strong>código do caso</strong> para o(a)
                  advogado(a) importar suas respostas — e a solicitação sai do Radar.
                  Honorários e contrato são combinados diretamente com ele(a), fora da
                  plataforma.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="acao secundaria" type="button" disabled={agindo} onClick={() => setConfirmandoContratei(false)}>
                    Voltar
                  </button>
                  <button
                    className="acao"
                    type="button"
                    disabled={agindo}
                    onClick={() => {
                      void acaoConversa({ acao: 'contratei' }).then(() => setConfirmandoContratei(false));
                    }}
                  >
                    {agindo ? 'Confirmando…' : 'Confirmar contratação'}
                  </button>
                </div>
              </div>
            )}
            {confirmandoEncerrar && (
              <div className="nota exigencia" style={{ marginTop: 10 }}>
                <p>
                  Encerrar devolve o caso ao Radar e você pode conversar com outro(a)
                  advogado(a). O histórico desta conversa continua visível para você.
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="acao secundaria" type="button" disabled={agindo} onClick={() => setConfirmandoEncerrar(false)}>
                    Voltar
                  </button>
                  <button
                    className="acao"
                    type="button"
                    disabled={agindo}
                    onClick={() => {
                      void acaoConversa({ acao: 'encerrar' }).then(() => setConfirmandoEncerrar(false));
                    }}
                  >
                    {agindo ? 'Encerrando…' : 'Encerrar conversa'}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {/* RESPOSTAS — ordem aleatória fixa, sem destaque; a escolha é sua. */}
        {dados.status === 'publicado' && dados.respostas.length > 0 && (
          <>
            <h2>Respostas recebidas ({dados.respostas.length} de {TETO_CANDIDATURAS_POR_CASO})</h2>
            <p className="fund" style={{ marginTop: 0 }}>
              A ordem abaixo é aleatória e fixa — ninguém paga por destaque. Leia com
              calma; você só libera seu contato se escolher conversar, com um(a) de cada
              vez.
            </p>
            <div style={{ display: 'grid', gap: 12 }}>
              {dados.respostas.map((r) => (
                <section key={r.advogadoId} className="nota" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span className="eyebrow">respondeu em {r.em.split('-').reverse().join('/')}</span>
                  {/* FICHA: rosto, nome completo, OAB e endereço do escritório.
                      A identificação do profissional é dever ético (Prov.
                      205/2021) e é o primeiro contato da família com quem
                      respondeu — antes vinha só uma linha de OAB e o nome. */}
                  <div className="ficha-advogado">
                    {r.foto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="ficha-foto" src={r.foto} alt="" />
                    ) : (
                      <span className="ficha-foto ficha-foto-vazia" aria-hidden>
                        {iniciaisDoNome(r.nome)}
                      </span>
                    )}
                    <div className="ficha-dados">
                      <h3 style={{ margin: 0 }}>{r.nome}</h3>
                      <span className="fund">{r.oab || 'Advogado(a)'}</span>
                      {r.enderecoEscritorio && (
                        <span className="fund">{r.enderecoEscritorio}</span>
                      )}
                    </div>
                  </div>
                  {r.areasAtuacao && (
                    <p className="fund" style={{ margin: 0 }}>
                      <strong>Atua com:</strong> {r.areasAtuacao}
                    </p>
                  )}
                  <p style={{ margin: 0 }}>{r.apresentacao}</p>
                  {r.experiencia && (
                    <p className="fund" style={{ margin: 0 }}>
                      <strong>Experiência:</strong> {r.experiencia}
                    </p>
                  )}
                  <p style={{ margin: 0 }} className="fund">
                    <strong>Como conduziria:</strong> {r.conducao}
                  </p>
                  <div style={{ marginTop: 4, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button className="acao" type="button" disabled={agindo} onClick={() => setEscolhendo(r)}>
                      Quero conversar
                    </button>
                    <button
                      className="acao secundaria"
                      type="button"
                      disabled={agindo}
                      onClick={() => {
                        setDenunciando({ advogadoId: r.advogadoId, nome: r.nome });
                        setMotivoDenuncia('');
                        setDenunciaEnviada(false);
                      }}
                    >
                      Denunciar
                    </button>
                  </div>
                </section>
              ))}
            </div>
            {denunciando && (
              <div className="nota exigencia" style={{ marginTop: 12 }}>
                {denunciaEnviada ? (
                  <p>
                    Denúncia registrada — a administração da plataforma analisa toda
                    denúncia e pode suspender o perfil do(a) profissional. Obrigado por
                    avisar.
                  </p>
                ) : (
                  <>
                    <p>
                      <strong>Denunciar {denunciando.nome}:</strong> conte o que aconteceu
                      (promessa de resultado, cobrança pela plataforma, contato fora do
                      combinado…). A administração analisa e pode suspender o perfil.
                    </p>
                    <label className="campo" style={{ marginTop: 8 }}>
                      O que aconteceu?
                      <textarea
                        rows={3}
                        maxLength={1000}
                        value={motivoDenuncia}
                        onChange={(e) => setMotivoDenuncia(e.target.value)}
                      />
                    </label>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="acao secundaria" type="button" disabled={agindo} onClick={() => setDenunciando(null)}>
                        Voltar
                      </button>
                      <button
                        className="acao"
                        type="button"
                        disabled={agindo || motivoDenuncia.trim().length < 10}
                        onClick={() => {
                          void acaoConversa({
                            acao: 'denunciar',
                            advogadoId: denunciando.advogadoId,
                            texto: motivoDenuncia,
                          }).then((ok) => {
                            if (ok) setDenunciaEnviada(true);
                          });
                        }}
                      >
                        {agindo ? 'Enviando…' : 'Enviar denúncia'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {escolhendo && (
              <div className="nota registro" style={{ marginTop: 12 }}>
                <p>
                  Abrir conversa com <strong>{escolhendo.nome}</strong> libera para ele(a) o
                  seu nome e e-mail — e só para ele(a), enquanto a conversa durar. Você pode
                  encerrar quando quiser e escolher outro(a).
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button className="acao secundaria" type="button" disabled={agindo} onClick={() => setEscolhendo(null)}>
                    Voltar
                  </button>
                  <button
                    className="acao"
                    type="button"
                    disabled={agindo}
                    onClick={() => {
                      void acaoConversa({ acao: 'conversar', advogadoId: escolhendo.advogadoId }).then(() =>
                        setEscolhendo(null),
                      );
                    }}
                  >
                    {agindo ? 'Abrindo…' : 'Abrir conversa'}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {dados.casoAnonimo && dados.status === 'publicado' && (
          <>
            <h2>O que os advogados veem (e nada além disto)</h2>
            <ul className="custos-portal">
              <li><span>Região da família</span><span>{dados.casoAnonimo.cidade || '—'}/{dados.casoAnonimo.uf}</span></li>
              <li><span>Estados dos bens</span><span>{dados.casoAnonimo.ufsBens.join(', ')}</span></li>
              <li><span>Via provável</span><span>{ROTULO_VIA[dados.casoAnonimo.via] ?? dados.casoAnonimo.via}</span></li>
              <li><span>Faixa de valor do acervo</span><span>{dados.casoAnonimo.faixaAcervo}</span></li>
              <li><span>Herdeiros</span><span className="num">{dados.casoAnonimo.qtdHerdeiros}</span></li>
              <li>
                <span>Particularidades</span>
                <span>
                  {[
                    dados.casoAnonimo.flags.testamento && 'testamento',
                    dados.casoAnonimo.flags.menorOuIncapaz && 'menor/incapaz',
                    dados.casoAnonimo.flags.semConsenso && 'sem consenso ainda',
                    dados.casoAnonimo.flags.herdeiroExterior && 'herdeiro no exterior',
                    dados.casoAnonimo.flags.empresa && 'empresa',
                    dados.casoAnonimo.flags.dividas && 'dívidas',
                    dados.casoAnonimo.flags.pequenoValor && 'pequeno valor',
                  ]
                    .filter(Boolean)
                    .join(' · ') || 'nenhuma'}
                </span>
              </li>
              {/* As demais respostas do questionário, exatamente como o(a)
                  advogado(a) as lê — esta lista é a prova de que "nada além
                  disto" é verdade. */}
              {dados.casoAnonimo.respostas.map((l) => (
                <li key={l.rotulo}>
                  <span>{l.rotulo}</span>
                  <span>{l.valor}</span>
                </li>
              ))}
              {dados.casoAnonimo.observacoes && (
                <li>
                  <span>O que você escreveu</span>
                  <span>“{dados.casoAnonimo.observacoes}”</span>
                </li>
              )}
            </ul>
            <p className="fund" style={{ marginTop: 4 }}>
              Seu nome, e-mail e o nome de quem faleceu NÃO aparecem — nunca. O contato só
              é liberado ao(à) advogado(a) que VOCÊ escolher conversar.
            </p>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
          <a className="acao secundaria" href={dados.urlResultado} style={{ textDecoration: 'none', display: 'inline-block' }}>
            Ver meu resultado completo
          </a>
          {!confirmando ? (
            <button className="acao secundaria" type="button" onClick={() => setConfirmando(true)}>
              Retirar solicitação
            </button>
          ) : null}
        </div>

        {confirmando && (
          <div className="nota exigencia" style={{ marginTop: 12 }}>
            <p>
              <strong>Retirar apaga TUDO do servidor, agora:</strong> a solicitação, o
              resultado salvo e os códigos gerados. Advogados deixam de ver o caso na
              hora. Não dá para desfazer.
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button className="acao secundaria" type="button" disabled={retirando} onClick={() => setConfirmando(false)}>
                Manter publicada
              </button>
              <button className="acao" type="button" disabled={retirando} onClick={() => void retirar()}>
                {retirando ? 'Apagando…' : 'Retirar e apagar tudo'}
              </button>
            </div>
          </div>
        )}
        {erro && <p className="mono-alerta">{erro}</p>}

        <footer className="rodape-etico">
          Esta plataforma não intermedeia honorários nem indica advogados. Os
          profissionais respondem voluntariamente à sua solicitação e a escolha é sempre
          sua — honorários são combinados diretamente com o(a) advogado(a), fora da
          plataforma.
        </footer>
      </main>
    </div>
  );
}
