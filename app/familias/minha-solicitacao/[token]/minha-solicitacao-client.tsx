'use client';

/**
 * Painel do herdeiro no Radar: status honesto (inclusive quando NINGUÉM
 * respondeu), o resumo ANÔNIMO que os advogados veem (transparência total) e
 * o "Retirar solicitação", que apaga tudo do servidor na hora.
 */

import { useState } from 'react';

import '../../../(private)/sucessorista/sucessorista.css';

import type { CasoAnonimo } from '@/lib/radar/anonimizar';

const ROTULO_STATUS: Record<string, string> = {
  resultado: 'Resultado gerado — ainda não publicado no Radar',
  publicado: 'Publicada — aguardando respostas de advogados',
  em_conversa: 'Em conversa com um(a) advogado(a)',
  contratado: 'Concluída — você contratou um(a) advogado(a)',
};

const ROTULO_VIA: Record<string, string> = {
  EXTRAJUDICIAL: 'cartório (extrajudicial)',
  JUDICIAL: 'judicial',
  ALVARA: 'alvará (simplificado)',
};

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
  } | null;
  horasAviso: number;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [retirando, setRetirando] = useState(false);
  const [retirada, setRetirada] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
        {dados.publicadoEm && (
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

        {dados.casoAnonimo && (
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
          profissionais listados respondem voluntariamente à sua solicitação.
        </footer>
      </main>
    </div>
  );
}
