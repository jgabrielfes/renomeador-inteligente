'use client';

/**
 * Radar de famílias — client do(a) advogado(a).
 *
 * Fluxo de habilitação: OAB (verificação MANUAL) → quiz deontológico (10 de
 * 10) → assinatura mensal por UF (marcada à mão pela administração). Depois,
 * a lista de casos anônimos em ordem única por data — sem ranking, sem
 * honorários na resposta, contato da família só quando ELA abrir a conversa.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { toast } from 'sonner';

import '../sucessorista/sucessorista.css';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Toaster } from '@/components/ui/sonner';

import { UFS } from '@/lib/familias/tipos';
import {
  marcadorCandidaturas,
  TETO_CANDIDATURAS_POR_CASO,
} from '@/lib/radar/candidatura';
import { QUESTOES_RADAR, type CorrecaoQuiz } from '@/lib/radar/quiz';
import { ROTULO_VIA, dataBr } from '../../familias/resultado-view';
import {
  conversaRadar,
  enviarMensagemRadar,
  responderCasoRadar,
  responderQuizRadar,
  salvarPerfilOab,
  salvarPreferenciasRadar,
  salvarVitrineRadar,
  type CasoRadar,
  type ConversaRadar,
  type EstadoAdvogado,
  type RespostaMinha,
} from './radar-actions';

const AVISO_LEGAL =
  'Esta plataforma não intermedeia honorários nem indica advogados. A escolha é sempre da família; honorários são tratados fora da plataforma, diretamente entre advogado(a) e cliente.';

const esquemaOab = z.object({
  oab: z.string().trim().min(2, 'Informe o número de inscrição.').max(20, 'Número longo demais.'),
  uf: z.string().min(2, 'Escolha a seccional (UF).'),
});

function FormOab({ aoSalvar }: { aoSalvar: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof esquemaOab>>({
    resolver: zodResolver(esquemaOab),
    defaultValues: { oab: '', uf: '' },
  });
  return (
    <form
      noValidate
      onSubmit={handleSubmit(async (v) => {
        const r = await salvarPerfilOab(v.oab, v.uf);
        if (r.ok) {
          toast.success('Inscrição enviada — a verificação é manual e você será avisado(a).');
          aoSalvar();
        } else toast.error(r.erro ?? 'Não foi possível salvar.');
      })}
      style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}
    >
      <Field data-invalid={errors.oab ? true : undefined} style={{ maxWidth: 220 }}>
        <FieldLabel>Inscrição na OAB</FieldLabel>
        <Input placeholder="ex.: 123.456" aria-invalid={!!errors.oab} {...register('oab')} />
        <FieldError errors={[errors.oab]} />
      </Field>
      <Field data-invalid={errors.uf ? true : undefined} style={{ maxWidth: 120 }}>
        <FieldLabel>Seccional</FieldLabel>
        <select {...register('uf')}>
          <option value="">UF…</option>
          {UFS.map((u) => (
            <option key={u}>{u}</option>
          ))}
        </select>
        <FieldError errors={[errors.uf]} />
      </Field>
      <Button type="submit" loading={isSubmitting}>
        Enviar para verificação
      </Button>
    </form>
  );
}

function Quiz({ aoAprovar }: { aoAprovar: () => void }) {
  const [respostas, setRespostas] = useState<Record<string, number>>({});
  const [correcao, setCorrecao] = useState<CorrecaoQuiz | null>(null);
  const [enviando, setEnviando] = useState(false);

  const corrigir = async () => {
    setEnviando(true);
    try {
      const r = await responderQuizRadar(respostas);
      if (!r.ok || !r.correcao) {
        toast.error(r.erro ?? 'Não foi possível corrigir.');
        return;
      }
      setCorrecao(r.correcao);
      if (r.correcao.aprovado) {
        toast.success('Aprovado(a) — as regras do Radar valem para todas as suas respostas.');
        aoAprovar();
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="nota" style={{ marginTop: 12 }}>
      <span className="eyebrow">Questionário deontológico</span>
      <h3>Antes de responder famílias: 10 perguntas sobre as regras</h3>
      <p className="fund">
        A aprovação exige as 10 corretas — pode refazer quantas vezes precisar. É o
        compromisso com o Provimento 205/2021 e com o Código de Ética que sustenta o
        Radar.
      </p>
      {QUESTOES_RADAR.map((q, i) => (
        <fieldset key={q.id} style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
          <legend style={{ fontWeight: 600 }}>
            {i + 1}. {q.enunciado}
            {correcao && (
              <span className={correcao.erradas.includes(q.id) ? 'mono-alerta' : ''} style={{ marginLeft: 6 }}>
                {correcao.erradas.includes(q.id) ? '✗ rever' : '✓'}
              </span>
            )}
          </legend>
          {q.opcoes.map((op, j) => (
            <label key={j} className="marcar" style={{ fontWeight: 400, display: 'flex', marginTop: 4 }}>
              <input
                type="radio"
                name={`quiz-${q.id}`}
                checked={respostas[q.id] === j}
                onChange={() => setRespostas((prev) => ({ ...prev, [q.id]: j }))}
              />
              {op}
            </label>
          ))}
        </fieldset>
      ))}
      <div style={{ marginTop: 14 }}>
        <Button loading={enviando} onClick={() => void corrigir()}>
          Corrigir
        </Button>
        {correcao && !correcao.aprovado && (
          <p className="mono-alerta" style={{ marginTop: 8 }}>
            {correcao.acertos} de {correcao.total} — reveja as marcadas com ✗ e corrija de novo.
          </p>
        )}
      </div>
    </div>
  );
}

const ROTULO_FLAG: Record<string, string> = {
  testamento: 'testamento',
  menorOuIncapaz: 'menor/incapaz',
  semConsenso: 'sem consenso',
  herdeiroExterior: 'herdeiro no exterior',
  empresa: 'empresa',
  dividas: 'dívidas',
  pequenoValor: 'pequeno valor',
};

function CardCaso({ item, aoResponder, aoConversar }: {
  item: CasoRadar;
  aoResponder: () => void;
  aoConversar: () => void;
}) {
  const c = item.caso;
  const flags = Object.entries(c.flags).filter(([, v]) => v).map(([k]) => ROTULO_FLAG[k] ?? k);
  const completo = item.respostas >= TETO_CANDIDATURAS_POR_CASO;
  return (
    <section className="nota" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow">
        {item.novo && (
          <strong style={{ color: 'var(--verde-registro)', marginRight: 8 }}>NOVO</strong>
        )}
        {c.cidade ? `${c.cidade}/` : ''}{c.uf} · publicado em {dataBr(c.publicadoEm)}
      </span>
      <h3 style={{ margin: 0 }}>
        {ROTULO_VIA[c.via as keyof typeof ROTULO_VIA] ?? c.via} · acervo {c.faixaAcervo}
      </h3>
      <p style={{ margin: 0 }}>
        {c.qtdHerdeiros} herdeiro(s){c.ufsBens.length > 1 ? ` · bens em ${c.ufsBens.join(', ')}` : ''}
        {flags.length > 0 ? ` · ${flags.join(' · ')}` : ''}
      </p>
      {/* O QUE A FAMÍLIA RESPONDEU — as perguntas que os chips acima não
          cobrem (quando faleceu, cônjuge e regime, bens classe a classe,
          advogado constituído). Linhas curtas para o cartão continuar
          escaneável; nada aqui identifica a família. */}
      {c.respostas.length > 0 && (
        <dl className="respostas-caso">
          {c.respostas.map((l) => (
            <div key={l.rotulo}>
              <dt>{l.rotulo}</dt>
              <dd>{l.valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {/* Texto livre da própria família, publicado com o consentimento dela. */}
      {c.observacoes && (
        <p className="fund" style={{ margin: 0 }}>
          <strong>A família escreveu:</strong> “{c.observacoes}”
        </p>
      )}
      <p className="fund num" style={{ margin: 0 }}>
        {marcadorCandidaturas(item.respostas)}
        {item.minhaResposta ? ' — você entre eles(as)' : completo ? ' — caso completo' : ''}
      </p>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        {item.conversaComigo ? (
          <Button onClick={aoConversar}>Conversa aberta — responder</Button>
        ) : item.minhaResposta ? (
          <Button variant="outline" disabled>
            Aguardando a família
          </Button>
        ) : (
          <Button onClick={aoResponder} disabled={completo}>
            {completo
              ? `Caso completo (${marcadorCandidaturas(item.respostas)})`
              : 'Candidatar-se (apresentação à família)'}
          </Button>
        )}
      </div>
    </section>
  );
}

/**
 * FICHA do(a) profissional — a PRÉVIA exata do que a família vê no alto de
 * cada candidatura: foto (ou iniciais), nome completo, OAB/UF e endereço do
 * escritório.
 *
 * Por que uma prévia e não mais um formulário: nome, foto e endereço são do
 * PERFIL da conta e se editam em `/config`. Duplicar os campos aqui criaria
 * duas verdades para o mesmo dado. Então o Radar mostra o resultado e manda
 * para o lugar certo quando falta algo.
 *
 * O aviso de ficha incompleta é uma FAIXA que fica — e não um diálogo de
 * primeiro acesso. Diálogo dispensado é diálogo esquecido, e a ficha é
 * justamente o que a família lê antes de decidir; a faixa some sozinha
 * quando a foto e o endereço estiverem lá.
 */
export function FichaProfissionalPrevia({
  ficha,
  oab,
  aviso = true,
}: {
  ficha: { nome: string; foto: string | null; enderecoEscritorio: string | null };
  /** "OAB/SP 123.456" — vazio enquanto a inscrição não foi cadastrada. */
  oab: string;
  /** false na prévia de dentro do formulário de resposta (a faixa já apareceu). */
  aviso?: boolean;
}) {
  const falta = [
    !ficha.foto ? 'a sua foto' : null,
    !ficha.enderecoEscritorio ? 'o endereço do escritório' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="nota" style={{ marginTop: 8 }}>
      <span className="eyebrow">Como a família vê você</span>
      <div className="ficha-advogado">
        {ficha.foto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="ficha-foto" src={ficha.foto} alt="" />
        ) : (
          <span className="ficha-foto ficha-foto-vazia" aria-hidden>
            {iniciaisDoNome(ficha.nome)}
          </span>
        )}
        <div className="ficha-dados">
          <strong>{ficha.nome}</strong>
          <span className="fund">{oab || 'Inscrição na OAB ainda não cadastrada'}</span>
          {ficha.enderecoEscritorio && <span className="fund">{ficha.enderecoEscritorio}</span>}
        </div>
      </div>
      {aviso && falta.length > 0 && (
        <p className="mono-alerta" style={{ marginTop: 8 }}>
          Sua ficha está incompleta: falta {falta.join(' e ')}. É o primeiro contato da
          família com você — vale completar antes de se candidatar.{' '}
          <Link href="/config">Completar meu perfil</Link>
        </p>
      )}
    </div>
  );
}

/** Iniciais para o círculo de quem ainda não subiu foto. */
function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1][0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}

/**
 * VITRINE do(a) advogado(a) — o que a família vê junto da candidatura.
 * Informação sóbria por regra (Provimento 205/2021): áreas e experiência,
 * sem promessa, sem valores, sem avaliações.
 */
function VitrineForm({
  inicial,
  aoSalvar,
}: {
  inicial: { areasAtuacao: string | null; experiencia: string | null };
  aoSalvar: () => void;
}) {
  const [areas, setAreas] = useState(inicial.areasAtuacao ?? '');
  const [exp, setExp] = useState(inicial.experiencia ?? '');
  const [salvando, setSalvando] = useState(false);
  return (
    <details className="nota" style={{ marginTop: 8 }}>
      <summary style={{ fontWeight: 600 }}>
        Minha vitrine — o que a família vê junto da sua candidatura
      </summary>
      <p className="fund" style={{ margin: '6px 0' }}>
        Sempre com o seu nome e OAB. Informação sóbria, sem promessa de resultado e
        sem valores (Provimento 205/2021) — avaliações não existem nesta plataforma.
      </p>
      <label className="campo">
        Áreas de atuação ({areas.length}/200)
        <Input
          maxLength={200}
          value={areas}
          placeholder="Ex.: Inventários extrajudiciais, ITCMD-SP, planejamento sucessório"
          onChange={(e) => setAreas(e.target.value)}
        />
      </label>
      <label className="campo">
        Experiência ({exp.length}/600)
        <Textarea
          rows={3}
          maxLength={600}
          value={exp}
          placeholder="Ex.: 12 anos de atuação em sucessões na região de Guarulhos; equipe própria para certidões e diligências."
          onChange={(e) => setExp(e.target.value)}
        />
      </label>
      <Button
        size="sm"
        loading={salvando}
        onClick={() => {
          setSalvando(true);
          void salvarVitrineRadar({ areasAtuacao: areas, experiencia: exp })
            .then((r) => {
              if (r.ok) {
                toast.success('Vitrine salva — vale para as próximas candidaturas.');
                aoSalvar();
              } else toast.error(r.erro ?? 'Não foi possível salvar.');
            })
            .finally(() => setSalvando(false));
        }}
      >
        Salvar vitrine
      </Button>
    </details>
  );
}

/** Dias desde um ISO — helper module-level (react-hooks/purity). */
const diasDesde = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const ROTULO_SITUACAO: Record<RespostaMinha['situacao'], string> = {
  aguardando: 'Aguardando a família',
  conversa: 'Em conversa',
  contratado: 'Contratado',
  encerrado: 'Encerrado',
};

/**
 * Funil pessoal de acompanhamento — as MINHAS respostas por estágio. É
 * organizador do próprio trabalho, nunca ranking: a escolha é da família e
 * o estágio "encerrado" é neutro de propósito.
 */
function PipelineMinhasRespostas({ respostas }: { respostas: RespostaMinha[] }) {
  if (respostas.length === 0) return null;
  const colunas: RespostaMinha['situacao'][] = ['aguardando', 'conversa', 'contratado', 'encerrado'];
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ marginBottom: 0 }}>Minhas respostas</h2>
      <p className="fund" style={{ marginTop: 4 }}>
        O acompanhamento do seu trabalho no Radar — quem decide é sempre a família.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10 }}>
        {colunas.map((col) => {
          const itens = respostas.filter((r) => r.situacao === col);
          return (
            <div key={col} className="nota" style={{ margin: 0 }}>
              <span className="eyebrow">
                {ROTULO_SITUACAO[col]} · {itens.length}
              </span>
              <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
                {itens.length === 0 && <p className="fund" style={{ margin: 0 }}>—</p>}
                {itens.map((r) => (
                  <div key={r.intakeId} style={{ borderTop: '1px solid var(--fio)', paddingTop: 6 }}>
                    <p style={{ margin: 0 }}>
                      {r.cidade && r.uf ? `${r.cidade}/${r.uf}` : 'Caso fora do ar'}
                      {r.via && (
                        <span className="fund"> · {ROTULO_VIA[r.via as keyof typeof ROTULO_VIA] ?? r.via}</span>
                      )}
                    </p>
                    <p className="fund" style={{ margin: 0 }}>respondida em {dataBr(r.respondidaEm)}</p>
                    {r.codigoHandoff && (
                      <Button
                        size="sm"
                        style={{ marginTop: 6 }}
                        nativeButton={false}
                        render={<Link href={`/s?importar=${r.codigoHandoff}`} />}
                      >
                        Converter em inventário
                      </Button>
                    )}
                    {r.situacao === 'contratado' && r.handoffImportado && (
                      <p className="fund" style={{ margin: '4px 0 0' }}>já virou inventário ✓</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function RadarClient({
  estado,
  casos,
  minhasRespostas = [],
}: {
  estado: EstadoAdvogado | null;
  casos: CasoRadar[];
  minhasRespostas?: RespostaMinha[];
}) {
  const router = useRouter();
  const [filtroUf, setFiltroUf] = useState('');
  const [filtroVia, setFiltroVia] = useState('');
  const [filtroDias, setFiltroDias] = useState('');
  const [respondendo, setRespondendo] = useState<CasoRadar | null>(null);
  const [apresentacao, setApresentacao] = useState('');
  const [conducao, setConducao] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [conversaDe, setConversaDe] = useState<CasoRadar | null>(null);
  const [conversa, setConversa] = useState<ConversaRadar | null>(null);
  const [mensagem, setMensagem] = useState('');

  // Filtros de RECORTE (UF, via, recência) — a ordem por data NUNCA muda
  // (sem ranking); filtrar por valor não existe de propósito (ética OAB).
  const visiveis = useMemo(
    () =>
      casos.filter(
        (c) =>
          (!filtroUf || c.caso.uf === filtroUf) &&
          (!filtroVia || c.caso.via === filtroVia) &&
          (!filtroDias || diasDesde(c.caso.publicadoEm) <= Number(filtroDias)),
      ),
    [casos, filtroUf, filtroVia, filtroDias],
  );

  const enviarResposta = async () => {
    if (!respondendo) return;
    setEnviando(true);
    try {
      const r = await responderCasoRadar(respondendo.caso.id, apresentacao, conducao);
      if (r.ok) {
        toast.success('Resposta enviada — a família decide se quer conversar.');
        setRespondendo(null);
        setApresentacao('');
        setConducao('');
        router.refresh();
      } else toast.error(r.erro ?? 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  };

  const abrirConversa = async (item: CasoRadar) => {
    setConversaDe(item);
    setConversa(null);
    const r = await conversaRadar(item.caso.id);
    if (r.ok) setConversa(r.conversa);
    else {
      toast.error(r.erro);
      setConversaDe(null);
    }
  };

  const enviarMensagem = async () => {
    if (!conversaDe || !mensagem.trim()) return;
    setEnviando(true);
    try {
      const r = await enviarMensagemRadar(conversaDe.caso.id, mensagem);
      if (r.ok) {
        setMensagem('');
        const c = await conversaRadar(conversaDe.caso.id);
        if (c.ok) setConversa(c.conversa);
      } else toast.error(r.erro ?? 'Não foi possível enviar.');
    } finally {
      setEnviando(false);
    }
  };

  const perfil = estado?.perfil ?? null;

  return (
    <div className="sucessorista">
      <Toaster position="bottom-right" duration={4000} visibleToasts={1} />
      <main className="folha" style={{ margin: '0 auto', maxWidth: 860 }}>
        <span className="eyebrow">Radar Sucessório · by LexCausa</span>
        <h1>Radar Sucessório</h1>
        <p className="subtitulo">
          Famílias publicam o caso ANÔNIMO e escolhem com quem conversar. {AVISO_LEGAL}
        </p>
        <p style={{ marginTop: -18 }}>
          <Link href="/s">← Meus casos</Link>
        </p>

        {!estado && (
          <div className="nota exigencia">
            <p>Não foi possível carregar o seu estado no Radar — recarregue a página.</p>
          </div>
        )}

        {/* A FICHA abre a tela — antes dos passos de habilitação. É o topo da
            candidatura que a família lê, e o aviso de "falta foto/endereço"
            precisa dar as caras logo no primeiro acesso, não escondido num
            <details> lá embaixo que ninguém abre. */}
        {estado && (
          <FichaProfissionalPrevia
            ficha={estado.ficha}
            oab={perfil ? `OAB/${perfil.oabUf} ${perfil.oab}` : ''}
          />
        )}

        {/* O formulário da OAB aparece TAMBÉM para o MASTER sem perfil: ele
            navega habilitado por ofício, mas antes o passo 1 sumia da tela
            dele e ninguém achava onde a inscrição se cadastra. A inscrição
            do MASTER entra na MESMA fila de verificação do /admin/radar. */}
        {estado && !perfil && (
          <div className="nota" style={{ marginTop: 8 }}>
            <span className="eyebrow">
              {estado.master ? 'Passo 1 de 3 (o que o advogado comum vê)' : 'Passo 1 de 3'}
            </span>
            <h3>Identifique-se: inscrição na OAB</h3>
            <p className="fund">
              A verificação é MANUAL, feita pela administração — anonimato aqui é só da
              família, nunca do(a) advogado(a).
              {estado.master && (
                <>
                  {' '}Como administrador(a) você navega sem os passos de habilitação; se
                  também for atuar como advogado(a), cadastre a sua inscrição aqui — ela
                  entra na mesma fila de verificação do /admin/radar.
                </>
              )}
            </p>
            <FormOab aoSalvar={() => router.refresh()} />
          </div>
        )}

        {perfil && perfil.situacao === 'pendente' && (
          <div className="nota registro" style={{ marginTop: 8 }}>
            <p>
              Inscrição OAB/{perfil.oabUf} {perfil.oab} enviada — <strong>verificação manual em
              andamento</strong>. Você já pode adiantar o questionário abaixo.
            </p>
          </div>
        )}

        {perfil && perfil.situacao === 'recusado' && (
          <div className="nota exigencia" style={{ marginTop: 8 }}>
            <p>
              A verificação não foi concluída{perfil.motivoRecusa ? `: ${perfil.motivoRecusa}` : '.'}{' '}
              Confira os dados e reenvie.
            </p>
            <FormOab aoSalvar={() => router.refresh()} />
          </div>
        )}

        {perfil && perfil.situacao === 'suspenso' && (
          <div className="nota exigencia" style={{ marginTop: 8 }}>
            <p>Perfil suspenso — fale com a administração da plataforma.</p>
          </div>
        )}

        {((perfil && !perfil.quizOk && perfil.situacao !== 'suspenso') ||
          (estado?.master && perfil && !perfil.quizOk)) && (
          <Quiz aoAprovar={() => router.refresh()} />
        )}

        {perfil && perfil.situacao === 'aprovado' && perfil.quizOk && estado &&
          estado.ufsAssinadas.length === 0 && !estado.master && (
          <div className="nota" style={{ marginTop: 8 }}>
            <span className="eyebrow">Passo 3 de 3</span>
            <h3>Assinatura por UF</h3>
            <p>
              O acesso aos casos é por <strong>assinatura mensal</strong>, por estado —
              nunca comissão por caso (é o que mantém o Radar dentro da ética). A
              liberação é feita pela administração: fale com a plataforma indicando a(s)
              UF(s) de atuação.
            </p>
          </div>
        )}

        {estado?.habilitado && perfil && (
          <VitrineForm
            inicial={{ areasAtuacao: perfil.areasAtuacao, experiencia: perfil.experiencia }}
            aoSalvar={() => router.refresh()}
          />
        )}

        {estado?.habilitado && (
          <>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>Casos abertos</h2>
              <select value={filtroUf} onChange={(e) => setFiltroUf(e.target.value)} style={{ maxWidth: 160 }}>
                <option value="">
                  {estado.master ? 'Todas as UFs' : `Minhas UFs (${estado.ufsAssinadas.join(', ')})`}
                </option>
                {(estado.master ? UFS : estado.ufsAssinadas).map((u) => (
                  <option key={u}>{u}</option>
                ))}
              </select>
              <select value={filtroVia} onChange={(e) => setFiltroVia(e.target.value)} style={{ maxWidth: 200 }} aria-label="Filtrar por via">
                <option value="">Todas as vias</option>
                <option value="EXTRAJUDICIAL">Extrajudicial (cartório)</option>
                <option value="JUDICIAL">Judicial</option>
                <option value="ALVARA">Alvará (pequeno valor)</option>
              </select>
              <select value={filtroDias} onChange={(e) => setFiltroDias(e.target.value)} style={{ maxWidth: 180 }} aria-label="Filtrar por recência">
                <option value="">Qualquer data</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
              </select>
              {perfil && (
                <label className="marcar" style={{ fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={perfil.aceitaPequenoValor}
                    onChange={(e) => {
                      void salvarPreferenciasRadar({ aceitaPequenoValor: e.target.checked }).then((r) => {
                        if (r.ok) router.refresh();
                        else toast.error(r.erro ?? 'Não foi possível salvar.');
                      });
                    }}
                  />
                  aceito casos de pequeno valor (alvará)
                </label>
              )}
            </div>
            <p className="fund" style={{ marginTop: 4 }}>
              Ordem única: mais recentes primeiro. Sem ranking, sem destaque pago. Cada
              caso aceita até {TETO_CANDIDATURAS_POR_CASO} candidaturas — o marcador
              X/{TETO_CANDIDATURAS_POR_CASO} mostra as vagas; candidatar-se depende do
              seu plano de assinatura (em implantação — hoje vale a assinatura por UF).
            </p>
            {casos.some((c) => c.novo) && (
              <p style={{ marginTop: 4 }}>
                <strong style={{ color: 'var(--verde-registro)' }}>
                  {casos.filter((c) => c.novo).length} caso(s) novo(s)
                </strong>{' '}
                desde a sua última visita — marcados com NOVO.
              </p>
            )}
            {visiveis.length === 0 && (
              <p style={{ marginTop: 8 }}>
                Nenhum caso aberto no seu recorte agora — os avisos de caso novo
                aparecem no hub e aqui. Enquanto isso, revise a sua{' '}
                <strong>vitrine</strong> acima ou veja{' '}
                <Link href="/ajuda/radar">como o Radar funciona</Link>.
              </p>
            )}
            <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
              {visiveis.map((item) => (
                <CardCaso
                  key={item.caso.id}
                  item={item}
                  aoResponder={() => setRespondendo(item)}
                  aoConversar={() => void abrirConversa(item)}
                />
              ))}
            </div>
          </>
        )}

        {estado?.habilitado && <PipelineMinhasRespostas respostas={minhasRespostas} />}

        <p className="fund" style={{ marginTop: 24 }}>{AVISO_LEGAL}</p>
      </main>

      {/* Responder: apresentação + condução — SEM honorários, por desenho. */}
      <Dialog open={respondendo !== null} onOpenChange={(v) => !v && setRespondendo(null)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Candidatar-se — apresentação à família</DialogTitle>
            <DialogDescription>
              Sóbrio e informativo (Provimento 205/2021): quem é você e como conduziria.
              Sem promessa de resultado e sem valores — honorários são tratados fora da
              plataforma, se a família escolher conversar. Cada caso aceita até{' '}
              {TETO_CANDIDATURAS_POR_CASO} candidaturas, e a sua vale pelo seu plano de
              assinatura.
            </DialogDescription>
          </DialogHeader>
          <label className="campo">
            Apresentação profissional ({apresentacao.length}/600)
            <Textarea
              rows={4}
              maxLength={600}
              value={apresentacao}
              onChange={(e) => setApresentacao(e.target.value)}
              placeholder="Qualificação, experiência com inventários, forma de trabalho…"
            />
          </label>
          <label className="campo">
            Como conduziria este caso ({conducao.length}/800)
            <Textarea
              rows={5}
              maxLength={800}
              value={conducao}
              onChange={(e) => setConducao(e.target.value)}
              placeholder="Visão técnica a partir do resumo anônimo: via, passos, prazos, pontos de atenção…"
            />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRespondendo(null)}>
              Cancelar
            </Button>
            <Button loading={enviando} onClick={() => void enviarResposta()}>
              Enviar resposta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversa 1:1 — aberta pela família; o contato dela aparece aqui. */}
      <Dialog open={conversaDe !== null} onOpenChange={(v) => !v && setConversaDe(null)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Conversa com a família</DialogTitle>
            <DialogDescription>
              {conversa
                ? `Contato liberado pela família: ${[conversa.familia.nome, conversa.familia.email].filter(Boolean).join(' · ') || '(sem contato informado)'}`
                : 'Carregando…'}
            </DialogDescription>
          </DialogHeader>
          {conversa && (
            <>
              {conversa.status === 'contratado' && (
                <p className="nota registro" style={{ margin: 0 }}>
                  A família confirmou a contratação — o código do caso está na conversa.
                </p>
              )}
              <div style={{ display: 'grid', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
                {conversa.mensagens.length === 0 && (
                  <p className="fund">A família abriu a conversa — apresente o próximo passo.</p>
                )}
                {conversa.mensagens.map((m, i) => (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      padding: '6px 10px',
                      borderRadius: 8,
                      background: m.autor === 'advogado' ? 'var(--papel-alto, #eee)' : 'transparent',
                      border: '1px solid var(--border, #ddd)',
                    }}
                  >
                    <strong>{m.autor === 'advogado' ? 'Você' : 'Família'}:</strong> {m.texto}
                  </p>
                ))}
              </div>
              <label className="campo">
                Mensagem
                <Textarea rows={2} maxLength={2000} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConversaDe(null)}>
                  Fechar
                </Button>
                <Button loading={enviando} onClick={() => void enviarMensagem()}>
                  Enviar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
