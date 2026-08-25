'use client';

/**
 * Tela de RESULTADO da área "Para famílias" — compartilhada entre o fim do
 * questionário e a página salva (/familias/resultado/[token]). Recebe tudo
 * calculado (motores puros rodam em quem chama); `acoes` injeta os botões
 * do contexto (PDF, salvar, e-mail…).
 */

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { RespostasFamilia } from '@/lib/familias/tipos';
import type { Triagem } from '@/lib/familias/triagem';
import type { EstimativaCompleta } from '@/lib/familias/estimativas';
import type { ItemChecklist } from '@/lib/familias/documentos';

export const ROTULO_VIA = {
  EXTRAJUDICIAL: 'Inventário em cartório (extrajudicial)',
  JUDICIAL: 'Inventário judicial',
  ALVARA: 'Alvará judicial (caminho simplificado)',
} as const;

export const brl = (v: number) =>
  `R$ ${Math.round(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

export const dataBr = (iso: string) => {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

/**
 * "Já tem advogado?" — gera o CÓDIGO de uso único que a família entrega ao
 * advogado DELA: no Sucessorista, "Importar caso de família" monta a folha
 * pré-preenchida com estas respostas. Nenhuma indicação de profissional
 * acontece aqui — o código vai para quem a família escolher.
 */
export function GerarCodigoAdvogado({ token }: { token: string }) {
  const [codigo, setCodigo] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [erroCodigo, setErroCodigo] = useState<string | null>(null);

  const gerar = async () => {
    setErroCodigo(null);
    setGerando(true);
    try {
      const r = await fetch('/api/familias/handoff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const corpo = (await r.json().catch(() => null)) as { codigo?: string; erro?: string } | null;
      if (r.ok && corpo?.codigo) setCodigo(corpo.codigo);
      else setErroCodigo(corpo?.erro ?? 'Não foi possível gerar o código — tente de novo.');
    } catch {
      setErroCodigo('Não foi possível gerar o código — verifique a conexão.');
    } finally {
      setGerando(false);
    }
  };

  return (
    <div className="nota" style={{ marginTop: 12 }}>
      <p style={{ marginBottom: 6 }}>
        <strong>Já tem advogado(a)?</strong>{' '}
        <span className="fund">
          Gere um código e entregue a ele(a): no O Sucessorista, o código monta o caso já
          com o que você respondeu — a primeira reunião rende muito mais.
        </span>
      </p>
      {codigo ? (
        <p>
          Código para o(a) seu(sua) advogado(a):{' '}
          <strong className="num" style={{ letterSpacing: 2 }}>{codigo}</strong>
          <span className="fase-descricao">
            Uso único. Ele(a) importa em &quot;Página Inicial → Importar caso de família&quot;;
            depois da importação, suas respostas saem do nosso servidor.
          </span>
        </p>
      ) : (
        <button className="acao secundaria" type="button" disabled={gerando} onClick={() => void gerar()}>
          {gerando ? 'Gerando…' : 'Gerar código para meu advogado'}
        </button>
      )}
      {erroCodigo && <p className="mono-alerta">{erroCodigo}</p>}
    </div>
  );
}

/**
 * "Pedir análise de advogados especializados" — a porta do Radar, no ritmo do
 * herdeiro. O consentimento ESPECÍFICO (LGPD) é o aceite do diálogo de
 * confirmação, e é ele que PUBLICA: não há mais link por e-mail no caminho
 * (exigia e-mail de quem só queria ser respondido e deixava solicitações
 * paradas para sempre). O e-mail vem DEPOIS e é opcional, só para avisos.
 *
 * O bloco aparece DUAS vezes na folha (topo e pé) — por isso é CONTROLADO:
 * `publicado`/`onPublicado` vivem em quem chama, e publicar num lugar
 * atualiza o outro na hora.
 */
export function PedirAnalise({
  token,
  emailInicial,
  publicado,
  onPublicado,
  garantirToken,
}: {
  /** null no fim do questionário, enquanto o caso ainda não foi salvo. */
  token: string | null;
  emailInicial: string;
  publicado: boolean;
  onPublicado: () => void;
  /**
   * Salva o caso e devolve o token, quando ainda não existe — é o que
   * permite publicar direto do resultado recém-calculado, sem obrigar a
   * família a clicar antes em "Salvar".
   */
  garantirToken?: () => Promise<string | null>;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [publicando, setPublicando] = useState(false);
  const [email, setEmail] = useState(emailInicial);
  const [avisosSalvos, setAvisosSalvos] = useState(false);
  const [salvandoAvisos, setSalvandoAvisos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  /** Token de agora: o que veio por prop ou o que `garantirToken` salvar. */
  const obterToken = async (): Promise<string> => {
    const atual = token ?? (garantirToken ? await garantirToken() : null);
    if (!atual) throw new Error('Não foi possível salvar seu caso — tente de novo.');
    return atual;
  };

  const chamar = async (corpo: Record<string, unknown>) => {
    const r = await fetch('/api/familias/radar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: await obterToken(), ...corpo }),
    });
    const dados = (await r.json().catch(() => null)) as { erro?: string } | null;
    if (!r.ok) throw new Error(dados?.erro ?? 'Não foi possível concluir — tente de novo.');
  };

  const publicar = async () => {
    setErro(null);
    setPublicando(true);
    try {
      await chamar({ consentimento: true });
      setConfirmando(false);
      onPublicado();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível publicar — tente de novo.');
    } finally {
      setPublicando(false);
    }
  };

  const salvarAvisos = async () => {
    setErro(null);
    if (!/.+@.+\..+/.test(email.trim())) {
      setErro('Esse e-mail não parece válido — confira.');
      return;
    }
    setSalvandoAvisos(true);
    try {
      await chamar({ email: email.trim() });
      setAvisosSalvos(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar — tente de novo.');
    } finally {
      setSalvandoAvisos(false);
    }
  };

  if (publicado) {
    return (
      <div className="nota registro" style={{ marginTop: 12 }}>
        <span className="eyebrow">Caso publicado</span>
        <p>
          Pronto — advogados de sucessões da sua região já podem responder. Seu nome e
          seu contato não foram publicados. Guarde este endereço para acompanhar as
          respostas ou retirar a solicitação quando quiser:
        </p>
        {token && (
          <p className="num" style={{ wordBreak: 'break-all', marginTop: 4 }}>
            <a href={`/familias/minha-solicitacao/${token}`}>
              {typeof location !== 'undefined' ? location.origin : ''}
              /familias/minha-solicitacao/{token}
            </a>
          </p>
        )}
        {avisosSalvos ? (
          <p className="fund" style={{ marginTop: 8 }}>
            Avisaremos <strong>{email.trim()}</strong> quando alguém responder.
          </p>
        ) : (
          <>
            <label className="campo" style={{ marginTop: 10 }}>
              Quer ser avisado(a) por e-mail quando alguém responder? (opcional)
              <input
                type="text"
                inputMode="email"
                value={email}
                placeholder="seu@email.com"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            {erro && <p className="mono-alerta">{erro}</p>}
            <div style={{ marginTop: 8 }}>
              <button
                className="acao secundaria"
                type="button"
                disabled={salvandoAvisos}
                onClick={() => void salvarAvisos()}
              >
                {salvandoAvisos ? 'Salvando…' : 'Quero ser avisado(a)'}
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="nota" style={{ marginTop: 12 }}>
      <p style={{ marginBottom: 6 }}>
        <strong>Quer que advogados especializados analisem seu caso?</strong>{' '}
        <span className="fund">
          Seu caso é publicado SEM nome e sem contato; profissionais de sucessões da sua
          região podem responder com uma apresentação, e VOCÊ escolhe se (e com quem)
          conversa — um por vez.
        </span>
      </p>
      <button className="acao" type="button" onClick={() => setConfirmando(true)}>
        Pedir análise de advogados especializados
      </button>
      {erro && !confirmando && <p className="mono-alerta">{erro}</p>}
      <p className="fund" style={{ marginTop: 6 }}>
        Esta plataforma não intermedeia honorários nem indica advogados — os
        profissionais respondem voluntariamente à sua solicitação.
      </p>

      {/* Dupla confirmação: o aceite AQUI é o consentimento que publica. */}
      <Dialog
        open={confirmando}
        onOpenChange={(aberto) => {
          if (!aberto && !publicando) {
            setConfirmando(false);
            setErro(null);
          }
        }}
      >
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Publicar seu caso para advogados?</DialogTitle>
            <DialogDescription>
              Serão publicados apenas: a sua cidade e estado, o caminho provável do
              inventário, a faixa de valor e as particularidades que você respondeu.{' '}
              <strong>
                Seu nome, seu contato e o nome de quem faleceu NÃO são publicados.
              </strong>{' '}
              Advogados poderão responder com uma apresentação; você escolhe se e com
              quem conversa — um por vez —, e só então o seu contato é liberado. Pode
              retirar a solicitação a qualquer momento, apagando tudo.
            </DialogDescription>
          </DialogHeader>
          {erro && <p className="mono-alerta">{erro}</p>}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={publicando}
              onClick={() => setConfirmando(false)}
            >
              Agora não
            </Button>
            <Button type="button" loading={publicando} onClick={() => void publicar()}>
              Sim, publicar meu caso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ResultadoView({
  r,
  triagem,
  estimativa,
  docs,
  acoes,
  chamadaRadar,
}: {
  r: RespostasFamilia;
  triagem: Triagem;
  estimativa: EstimativaCompleta;
  docs: ItemChecklist[];
  acoes?: React.ReactNode;
  /**
   * O convite do Radar no TOPO da folha (o mesmo bloco que `acoes` repete no
   * pé): quem chega ao resultado vê a oferta sem precisar rolar tudo, e quem
   * leu até o fim a reencontra na hora de decidir.
   */
  chamadaRadar?: React.ReactNode;
}) {
  return (
    <>
      <span className="eyebrow">Seu resultado — gratuito, sem cadastro</span>
      <h1>{ROTULO_VIA[triagem.via]}</h1>
      <p className="subtitulo">
        Com base no que você respondeu{r.nome.trim() ? `, ${r.nome.trim().split(/\s+/)[0]}` : ''}.
        Os números são estimativas por faixa — servem para você chegar preparado(a) à
        conversa com um advogado, não para substituí-la.
      </p>

      {chamadaRadar}

      <h2>Por que esse caminho</h2>
      {triagem.motivos.map((m, i) => (
        <p key={i} style={{ marginTop: 6 }}>
          {m}
        </p>
      ))}
      {triagem.observacoes.map((o, i) => (
        <p key={i} className="fund" style={{ marginTop: 6 }}>
          {o}
        </p>
      ))}

      <h2>Estimativa do imposto (ITCMD)</h2>
      <ul className="custos-portal">
        {estimativa.itcmd.map((e) => (
          <li key={e.uf}>
            <span>
              {e.uf}
              <span className="fase-descricao">
                {e.precisao === 'motor-sp'
                  ? 'cálculo pela lei paulista, com atualização e eventuais multas'
                  : 'faixa pela alíquota do estado'}
              </span>
            </span>
            <span className="num">
              {brl(e.faixa.min)} a {brl(e.faixa.max)}
            </span>
          </li>
        ))}
        {estimativa.itcmd.length > 1 && (
          <li>
            <span>
              <strong>Total estimado</strong>
            </span>
            <span className="num">
              <strong>
                {brl(estimativa.itcmdTotal.min)} a {brl(estimativa.itcmdTotal.max)}
              </strong>
            </span>
          </li>
        )}
      </ul>
      {estimativa.itcmd.flatMap((e) => e.avisos).map((a, i) => (
        <p key={i} className="fund" style={{ marginTop: 4 }}>
          {a}
        </p>
      ))}

      <h2>{estimativa.custos.rotulo}</h2>
      <ul className="custos-portal">
        <li>
          <span>Faixa estimada</span>
          <span className="num">
            {brl(estimativa.custos.faixa.min)} a {brl(estimativa.custos.faixa.max)}
          </span>
        </li>
      </ul>
      {estimativa.custos.avisos.map((a, i) => (
        <p key={i} className="fund" style={{ marginTop: 4 }}>
          {a}
        </p>
      ))}

      <h2>Prazo</h2>
      <div className={`nota ${estimativa.prazo.aberturaVencida ? 'exigencia' : ''}`}>
        <p>{estimativa.prazo.texto}</p>
        {estimativa.prazo.limiteAbertura && (
          <p className="fund" style={{ marginTop: 4 }}>
            Prazo de abertura: até {dataBr(estimativa.prazo.limiteAbertura)}.
          </p>
        )}
      </div>

      <h2>Documentos que a família já pode separar</h2>
      <ul className="custos-portal">
        {docs.map((d) => (
          <li key={d.id}>
            <span>
              {d.titulo}
              <span className="fase-descricao">{d.detalhe}</span>
            </span>
          </li>
        ))}
      </ul>

      <h2>Próximos passos</h2>
      <ol className="fase-lista">
        <li className="fase-item atual">
          <span className="fase-ponto num">1</span>
          <span>Separe os documentos da lista acima — é o que mais adianta o trabalho.</span>
        </li>
        <li className="fase-item">
          <span className="fase-ponto num">2</span>
          <span>
            {r.consenso === 'sim'
              ? 'Combine com os demais herdeiros quem vai acompanhar o processo (o inventariante).'
              : 'Converse com os demais herdeiros — com todos de acordo, o caminho fica mais rápido e barato.'}
          </span>
        </li>
        <li className="fase-item">
          <span className="fase-ponto num">3</span>
          <span>
            Procure um(a) advogado(a) de sua confiança com experiência em inventários —
            mesmo em cartório, a lei exige advogado. Leve este resultado: ele encurta a
            primeira conversa.
          </span>
        </li>
      </ol>

      {estimativa.avisos.map((a, i) => (
        <p key={i} className="fund" style={{ marginTop: 8 }}>
          {a}
        </p>
      ))}

      {acoes}

      <footer className="rodape-etico">
        Orientação geral e gratuita — não substitui a consulta com advogado(a). Esta
        plataforma não intermedeia honorários nem indica advogados.
      </footer>
    </>
  );
}
