'use client';

/**
 * Diligências entre advogados — client. Três mesas de trabalho: o perfil de
 * correspondente (selo obrigatório), as diligências ABERTAS (ordem por
 * data; nunca por preço/nota) e as minhas — como solicitante (ofertas,
 * termo, pasta, conclusão) e como correspondente (termo, relatório,
 * atraso). O acerto de valores é ENTRE os advogados; a plataforma só
 * registra o termo de referência.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import '../sucessorista/sucessorista.css';

import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/date-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Toaster } from '@/components/ui/sonner';

import type { Municipio } from '@/lib/rede/municipios';
import { ComarcaAutocomplete } from './comarca-autocomplete';
import {
  CRITERIOS_AVALIACAO,
  ROTULO_STATUS_DILIGENCIA,
  ROTULO_TIPO_DILIGENCIA,
  TIPOS_DILIGENCIA,
  type AvaliacaoCriterios,
} from '@/lib/rede/diligencias';
import {
  arquivosDaDiligencia,
  avaliarDiligencia,
  cancelarDiligencia,
  concluirDiligencia,
  confirmarTermo,
  escolherOferta,
  justificarAtraso,
  ofertar,
  ofertasDaDiligencia,
  salvarPerfilCorrespondente,
  type ArquivoDaPasta,
  type DiligenciaResumo,
  type OfertaResumo,
  type PerfilCorrespondente,
} from './diligencias-actions';

const AVISO_LEGAL =
  'A correspondência é combinada ENTRE os advogados — a plataforma não participa dos honorários da diligência, não processa pagamento e não indica correspondente: a lista segue ordem neutra.';

const hojeIso = () => new Date().toISOString().slice(0, 10);

function CardDiligencia({
  d,
  children,
}: {
  d: DiligenciaResumo;
  children?: React.ReactNode;
}) {
  const vencida =
    d.prazoEm && d.prazoEm < hojeIso() && (d.status === 'aceita' || d.status === 'em_execucao');
  return (
    <section className="nota" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="eyebrow">
        {d.municipio}/{d.uf} · {d.criadaEm.split('-').reverse().join('/')}
        {d.casoId ? ' · de um caso' : ''}
      </span>
      <h3 style={{ margin: 0 }}>{ROTULO_TIPO_DILIGENCIA[d.tipo] ?? d.tipo}</h3>
      <p style={{ margin: 0 }}>{d.descricao}</p>
      <p className="fund" style={{ margin: 0 }}>
        {ROTULO_STATUS_DILIGENCIA[d.status] ?? d.status}
        {d.prazoEm ? ` · prazo ${d.prazoEm.split('-').reverse().join('/')}` : ''}
        {vencida && (
          <span className="mono-alerta"> · PRAZO VENCIDO{d.justificativaAtraso ? ' (justificado)' : ''}</span>
        )}
        {d.correspondente ? ` · com ${d.correspondente.nome}${d.correspondente.oab ? ` (${d.correspondente.oab})` : ''}` : ''}
        {d.solicitante ? ` · solicitada por ${d.solicitante.nome}` : ''}
      </p>
      {d.termo && (
        <p className="fund" style={{ margin: 0 }}>
          Termo: {d.termo.escopo}
          {d.termo.prazo ? ` · prazo combinado: ${d.termo.prazo}` : ''}
          {d.termo.valor ? ` · valor combinado entre os advogados: ${d.termo.valor}` : ''}
          {d.termo.confirmadoEm ? ' · confirmado pelo correspondente' : ' · aguardando confirmação'}
        </p>
      )}
      {children}
    </section>
  );
}

function Avaliar({ diligenciaId, aoAvaliar }: { diligenciaId: string; aoAvaliar: () => void }) {
  const [notas, setNotas] = useState<AvaliacaoCriterios>({ prazo: 5, relatorio: 5, comunicacao: 5 });
  const [enviando, setEnviando] = useState(false);
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
      {CRITERIOS_AVALIACAO.map((c) => (
        <label key={c.id} className="campo" style={{ maxWidth: 130 }}>
          {c.rotulo}
          <select
            value={notas[c.id as keyof AvaliacaoCriterios]}
            onChange={(e) => setNotas((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))}
          >
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </label>
      ))}
      <Button
        size="sm"
        loading={enviando}
        onClick={() => {
          setEnviando(true);
          void avaliarDiligencia(diligenciaId, notas)
            .then((r) => {
              if (r.ok) {
                toast.success('Avaliação registrada.');
                aoAvaliar();
              } else toast.error(r.erro ?? 'Não foi possível avaliar.');
            })
            .finally(() => setEnviando(false));
        }}
      >
        Avaliar
      </Button>
    </div>
  );
}

export function DiligenciasClient({
  estado,
  solicitadas,
  aceitas,
  abertas,
}: {
  estado: { selo?: boolean; assinante?: boolean; perfil?: PerfilCorrespondente | null; historico?: { concluidas: number; comarcasAtendidas: number; media: number | null } } | null;
  solicitadas: DiligenciaResumo[];
  aceitas: DiligenciaResumo[];
  abertas: DiligenciaResumo[];
}) {
  const router = useRouter();
  const [agindo, setAgindo] = useState(false);

  /* perfil */
  const [comarcas, setComarcas] = useState<Municipio[]>(estado?.perfil?.comarcas ?? []);
  const [tipos, setTipos] = useState<string[]>(estado?.perfil?.tipos ?? []);
  const [prazoMedio, setPrazoMedio] = useState(String(estado?.perfil?.prazoMedioDias ?? 5));
  const [raio, setRaio] = useState(String(estado?.perfil?.raioKm ?? 0));
  const [ativo, setAtivo] = useState(estado?.perfil?.ativo ?? true);
  const [salvandoPerfil, setSalvandoPerfil] = useState(false);

  /* nova diligência avulsa */
  const [novaAberta, setNovaAberta] = useState(false);
  const [novaComarca, setNovaComarca] = useState<Municipio | null>(null);
  const [novoTipo, setNovoTipo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novoPrazo, setNovoPrazo] = useState('');
  const [novosArquivos, setNovosArquivos] = useState<File[]>([]);
  const [criando, setCriando] = useState(false);

  /* ofertar */
  const [ofertando, setOfertando] = useState<DiligenciaResumo | null>(null);
  const [msgOferta, setMsgOferta] = useState('');
  const [prazoOferta, setPrazoOferta] = useState('5');

  /* ofertas recebidas + termo */
  const [vendoOfertas, setVendoOfertas] = useState<DiligenciaResumo | null>(null);
  const [ofertas, setOfertas] = useState<OfertaResumo[]>([]);
  const [escolhida, setEscolhida] = useState<OfertaResumo | null>(null);
  const [termoEscopo, setTermoEscopo] = useState('');
  const [termoPrazo, setTermoPrazo] = useState('');
  const [termoValor, setTermoValor] = useState('');

  /* pasta */
  const [pastaDe, setPastaDe] = useState<DiligenciaResumo | null>(null);
  const [pasta, setPasta] = useState<ArquivoDaPasta[]>([]);

  /* relatório (correspondente) */
  const [relatorioDe, setRelatorioDe] = useState<DiligenciaResumo | null>(null);
  const [relArquivos, setRelArquivos] = useState<File[]>([]);
  const [justificativa, setJustificativa] = useState('');

  const habilitadoCorrespondente = useMemo(
    () => Boolean(estado?.selo && estado?.perfil?.ativo),
    [estado],
  );

  const rodar = async (fn: () => Promise<{ ok: boolean; erro?: string }>, sucesso: string) => {
    setAgindo(true);
    try {
      const r = await fn();
      if (r.ok) {
        toast.success(sucesso);
        router.refresh();
      } else toast.error(r.erro ?? 'Não foi possível concluir.');
    } finally {
      setAgindo(false);
    }
  };

  const criarAvulsa = async () => {
    if (!novaComarca) return;
    setCriando(true);
    try {
      const fd = new FormData();
      fd.set('comarcaIbge', String(novaComarca.ibge));
      fd.set('tipo', novoTipo);
      fd.set('descricao', novaDescricao);
      if (novoPrazo) fd.set('prazoEm', novoPrazo);
      for (const f of novosArquivos) fd.append('arquivos', f);
      const r = await fetch('/api/diligencias', { method: 'POST', body: fd });
      const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
      if (!r.ok) {
        toast.error(corpo?.erro ?? 'Não foi possível criar.');
        return;
      }
      toast.success('Diligência publicada aos correspondentes da comarca.');
      setNovaAberta(false);
      setNovaComarca(null);
      setNovoTipo('');
      setNovaDescricao('');
      setNovoPrazo('');
      setNovosArquivos([]);
      router.refresh();
    } finally {
      setCriando(false);
    }
  };

  const abrirPasta = async (d: DiligenciaResumo) => {
    setPastaDe(d);
    const r = await arquivosDaDiligencia(d.id);
    if (r.ok) setPasta(r.arquivos);
    else {
      toast.error(r.erro);
      setPastaDe(null);
    }
  };

  const entregarRelatorio = async () => {
    if (!relatorioDe || relArquivos.length === 0) return;
    setAgindo(true);
    try {
      const fd = new FormData();
      for (const f of relArquivos) fd.append('arquivos', f);
      const r = await fetch(`/api/diligencias/${relatorioDe.id}/arquivo`, { method: 'POST', body: fd });
      const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
      if (!r.ok) {
        toast.error(corpo?.erro ?? 'Não foi possível entregar.');
        return;
      }
      if (justificativa.trim()) await justificarAtraso(relatorioDe.id, justificativa);
      toast.success('Relatório entregue — o solicitante já pode puxar os documentos para o caso.');
      setRelatorioDe(null);
      setRelArquivos([]);
      setJustificativa('');
      router.refresh();
    } finally {
      setAgindo(false);
    }
  };

  return (
    <div className="sucessorista">
      <Toaster position="bottom-right" duration={4000} visibleToasts={1} />
      <main className="folha" style={{ margin: '0 auto', maxWidth: 860 }}>
        <span className="eyebrow">O Sucessorista</span>
        <h1>Diligências entre advogados</h1>
        <p className="subtitulo">
          Atos a distância — retirar certidão, audiência, cartório, escritura por
          procuração — com colegas que entendem do rito sucessório. {AVISO_LEGAL}
        </p>
        <p style={{ marginTop: -18 }}>
          <Link href="/s">← Meus casos</Link>
        </p>

        {/* ------- perfil de correspondente ------- */}
        <h2>Minha atuação como correspondente</h2>
        {!estado?.selo ? (
          <div className="nota">
            <p>
              Atuar como correspondente exige a <strong>verificação da OAB e o
              questionário deontológico</strong> (o selo da plataforma) — faça em{' '}
              <Link href="/radar">/radar</Link>. Depois, cadastre aqui as comarcas.
            </p>
          </div>
        ) : (
          <div className="nota" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div>
              <span className="eyebrow">Comarcas atendidas</span>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '6px 0' }}>
                {comarcas.map((m) => (
                  <span key={m.ibge} className="fracao" style={{ border: '1px solid var(--border, #ccc)', borderRadius: 999, padding: '2px 10px' }}>
                    {m.nome}/{m.uf}{' '}
                    <button type="button" aria-label={`Remover ${m.nome}`} onClick={() => setComarcas((prev) => prev.filter((x) => x.ibge !== m.ibge))}>
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <ComarcaAutocomplete
                onEscolher={(m) =>
                  setComarcas((prev) => (prev.some((x) => x.ibge === m.ibge) ? prev : [...prev, m]))
                }
              />
            </div>
            <div>
              <span className="eyebrow">Tipos de diligência</span>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                {TIPOS_DILIGENCIA.map((t) => (
                  <label key={t.id} className="marcar" style={{ fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={tipos.includes(t.id)}
                      onChange={(e) =>
                        setTipos((prev) => (e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id)))
                      }
                    />
                    {t.rotulo}
                  </label>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="campo" style={{ maxWidth: 160 }}>
                Prazo médio (dias)
                <Input inputMode="numeric" value={prazoMedio} onChange={(e) => setPrazoMedio(e.target.value)} />
              </label>
              <label className="campo" style={{ maxWidth: 200 }}>
                Raio de deslocamento (km)
                <Input inputMode="numeric" value={raio} onChange={(e) => setRaio(e.target.value)} />
              </label>
              <label className="marcar" style={{ fontWeight: 400 }}>
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
                perfil ativo (aparece nas buscas)
              </label>
              <Button
                loading={salvandoPerfil}
                onClick={() => {
                  setSalvandoPerfil(true);
                  void salvarPerfilCorrespondente({
                    comarcas: comarcas.map((m) => m.ibge),
                    tipos,
                    prazoMedioDias: Number(prazoMedio) || 5,
                    raioKm: Number(raio) || 0,
                    ativo,
                  })
                    .then((r) => {
                      if (r.ok) {
                        toast.success('Perfil de correspondente salvo.');
                        router.refresh();
                      } else toast.error(r.erro ?? 'Não foi possível salvar.');
                    })
                    .finally(() => setSalvandoPerfil(false));
                }}
              >
                Salvar perfil
              </Button>
            </div>
            {estado?.historico && estado.historico.concluidas > 0 && (
              <p className="fund" style={{ margin: 0 }}>
                Histórico: {estado.historico.concluidas} diligência(s) concluída(s) em{' '}
                {estado.historico.comarcasAtendidas} comarca(s)
                {estado.historico.media !== null ? ` · média ${estado.historico.media}` : ''} — sem
                valores, nunca públicos.
              </p>
            )}
          </div>
        )}

        {/* ------- diligências abertas (correspondente) ------- */}
        {habilitadoCorrespondente && (
          <>
            <h2>Diligências abertas</h2>
            <p className="fund" style={{ marginTop: 0 }}>
              Da sua comarca e UF, mais novas primeiro — sem ranking e sem preço.
            </p>
            {abertas.length === 0 && <p>Nenhuma diligência aberta na sua região agora.</p>}
            <div style={{ display: 'grid', gap: 12 }}>
              {abertas.map((d) => (
                <CardDiligencia key={d.id} d={d}>
                  <div>
                    <Button
                      size="sm"
                      disabled={d.jaOfertei || agindo}
                      onClick={() => {
                        setOfertando(d);
                        setMsgOferta('');
                        setPrazoOferta('5');
                      }}
                    >
                      {d.jaOfertei ? 'Você já respondeu' : 'Estou disponível'}
                    </Button>
                  </div>
                </CardDiligencia>
              ))}
            </div>
          </>
        )}

        {/* ------- minhas como correspondente ------- */}
        {aceitas.length > 0 && (
          <>
            <h2>Minhas diligências (correspondente)</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {aceitas.map((d) => (
                <CardDiligencia key={d.id} d={d}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <Button size="sm" variant="outline" disabled={agindo} onClick={() => void abrirPasta(d)}>
                      Abrir a pasta
                    </Button>
                    {d.status === 'aceita' && !d.termo?.confirmadoEm && (
                      <Button
                        size="sm"
                        loading={agindo}
                        onClick={() => void rodar(() => confirmarTermo(d.id), 'Termo confirmado — mãos à obra.')}
                      >
                        Confirmar o termo e iniciar
                      </Button>
                    )}
                    {(d.status === 'em_execucao' || d.status === 'aceita') && (
                      <Button size="sm" disabled={agindo} onClick={() => setRelatorioDe(d)}>
                        Entregar relatório
                      </Button>
                    )}
                    {d.status === 'concluida' && !d.minhaAvaliacaoFeita && (
                      <Avaliar diligenciaId={d.id} aoAvaliar={() => router.refresh()} />
                    )}
                  </div>
                </CardDiligencia>
              ))}
            </div>
          </>
        )}

        {/* ------- minhas solicitações ------- */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 16 }}>
          <h2 style={{ margin: 0 }}>Minhas solicitações</h2>
          <Button size="sm" onClick={() => setNovaAberta(true)}>
            Nova diligência
          </Button>
        </div>
        {solicitadas.length === 0 && (
          <p className="fund">
            Nenhuma ainda — crie aqui (avulsa) ou de dentro do caso, na aba Documentos,
            onde os anexos selecionados formam a pasta.
          </p>
        )}
        <div style={{ display: 'grid', gap: 12, marginTop: 8 }}>
          {solicitadas.map((d) => (
            <CardDiligencia key={d.id} d={d}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {d.status === 'aberta' && (
                  <Button
                    size="sm"
                    disabled={agindo || d.ofertas === 0}
                    onClick={() => {
                      setVendoOfertas(d);
                      setOfertas([]);
                      void ofertasDaDiligencia(d.id).then((r) => {
                        if (r.ok) setOfertas(r.ofertas);
                      });
                    }}
                  >
                    {d.ofertas === 0 ? 'Sem respostas ainda' : `Ver ${d.ofertas} resposta(s)`}
                  </Button>
                )}
                <Button size="sm" variant="outline" disabled={agindo} onClick={() => void abrirPasta(d)}>
                  Abrir a pasta
                </Button>
                {d.status === 'relatorio_entregue' && (
                  <Button
                    size="sm"
                    loading={agindo}
                    onClick={() => void rodar(() => concluirDiligencia(d.id), 'Diligência concluída — avalie o(a) colega.')}
                  >
                    Concluir
                  </Button>
                )}
                {(d.status === 'aberta' || d.status === 'aceita') && (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={agindo}
                    onClick={() => void rodar(() => cancelarDiligencia(d.id), 'Diligência cancelada.')}
                  >
                    Cancelar
                  </Button>
                )}
                {d.status === 'concluida' && !d.minhaAvaliacaoFeita && (
                  <Avaliar diligenciaId={d.id} aoAvaliar={() => router.refresh()} />
                )}
              </div>
            </CardDiligencia>
          ))}
        </div>

        <p className="fund" style={{ marginTop: 24 }}>{AVISO_LEGAL}</p>
      </main>

      {/* nova diligência avulsa */}
      <Dialog open={novaAberta} onOpenChange={(v) => !criando && setNovaAberta(v)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Nova diligência</DialogTitle>
            <DialogDescription>
              Publicada aos correspondentes verificados da comarca (e mesma UF). Os
              anexos formam a pasta — é só o que o(a) colega verá.
            </DialogDescription>
          </DialogHeader>
          {/* div, não label: o clique no item do dropdown seria re-encaminhado
              pelo label ao primeiro controle rotulável (o "trocar" recém-montado),
              desfazendo a escolha na hora */}
          <div className="campo">
            Comarca
            {novaComarca ? (
              <p style={{ margin: '4px 0' }}>
                <strong>{novaComarca.nome}/{novaComarca.uf}</strong>{' '}
                <Button size="sm" variant="ghost" onClick={() => setNovaComarca(null)}>trocar</Button>
              </p>
            ) : (
              <ComarcaAutocomplete onEscolher={setNovaComarca} />
            )}
          </div>
          <label className="campo">
            Tipo
            <select value={novoTipo} onChange={(e) => setNovoTipo(e.target.value)}>
              <option value="">Selecione…</option>
              {TIPOS_DILIGENCIA.map((t) => (
                <option key={t.id} value={t.id}>{t.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            O que precisa ser feito ({novaDescricao.length}/1200)
            <Textarea rows={3} maxLength={1200} value={novaDescricao} onChange={(e) => setNovaDescricao(e.target.value)} />
          </label>
          <label className="campo" style={{ maxWidth: 220 }}>
            Prazo desejado
            <DateInput value={novoPrazo} onChange={setNovoPrazo} />
          </label>
          <label className="campo">
            Anexos da pasta (até 10, 3,5 MB cada)
            <input
              type="file"
              multiple
              onChange={(e) => setNovosArquivos(Array.from(e.target.files ?? []).slice(0, 10))}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" disabled={criando} onClick={() => setNovaAberta(false)}>
              Cancelar
            </Button>
            <Button
              loading={criando}
              disabled={!novaComarca || !novoTipo || novaDescricao.trim().length < 10}
              onClick={() => void criarAvulsa()}
            >
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ofertar (correspondente) */}
      <Dialog open={ofertando !== null} onOpenChange={(v) => !v && setOfertando(null)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Estou disponível</DialogTitle>
            <DialogDescription>
              Como atenderia e em quantos dias — SEM valores aqui: o combinado
              financeiro é tratado direto com o(a) solicitante no termo.
            </DialogDescription>
          </DialogHeader>
          <label className="campo">
            Observações ({msgOferta.length}/600)
            <Textarea rows={3} maxLength={600} value={msgOferta} onChange={(e) => setMsgOferta(e.target.value)} />
          </label>
          <label className="campo" style={{ maxWidth: 160 }}>
            Prazo (dias)
            <Input inputMode="numeric" value={prazoOferta} onChange={(e) => setPrazoOferta(e.target.value)} />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOfertando(null)}>Cancelar</Button>
            <Button
              loading={agindo}
              disabled={msgOferta.trim().length < 10}
              onClick={() => {
                const alvo = ofertando!;
                void rodar(
                  () => ofertar(alvo.id, msgOferta, Number(prazoOferta) || 5),
                  'Disponibilidade enviada ao(à) solicitante.',
                ).then(() => setOfertando(null));
              }}
            >
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ofertas recebidas + termo de referência */}
      <Dialog open={vendoOfertas !== null} onOpenChange={(v) => !v && (setVendoOfertas(null), setEscolhida(null))}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Respostas de correspondentes</DialogTitle>
            <DialogDescription>
              Ordem de chegada — sem ranking. Escolha e registre o termo de referência
              (escopo, prazo e o valor combinado ENTRE vocês).
            </DialogDescription>
          </DialogHeader>
          {!escolhida ? (
            <div style={{ display: 'grid', gap: 10, maxHeight: 320, overflowY: 'auto' }}>
              {ofertas.length === 0 && <p className="fund">Carregando…</p>}
              {ofertas.map((o) => (
                <div key={o.id} className="nota" style={{ margin: 0 }}>
                  <p style={{ margin: 0 }}>
                    <strong>{o.nome}</strong>{o.oab ? ` — ${o.oab}` : ''} · {o.prazoDias} dia(s)
                  </p>
                  <p className="fund" style={{ margin: '4px 0' }}>{o.mensagem}</p>
                  <p className="fund" style={{ margin: 0 }}>
                    {o.historico.concluidas} diligência(s) concluída(s)
                    {o.historico.media !== null ? ` · média ${o.historico.media}` : ''}
                  </p>
                  <Button size="sm" style={{ marginTop: 6 }} onClick={() => setEscolhida(o)}>
                    Escolher
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p style={{ margin: 0 }}>
                Termo de referência com <strong>{escolhida.nome}</strong>:
              </p>
              <label className="campo">
                Escopo combinado
                <Textarea rows={2} maxLength={800} value={termoEscopo} onChange={(e) => setTermoEscopo(e.target.value)} />
              </label>
              <label className="campo">
                Prazo combinado
                <Input maxLength={120} value={termoPrazo} onChange={(e) => setTermoPrazo(e.target.value)} placeholder={`${escolhida.prazoDias} dias úteis`} />
              </label>
              <label className="campo">
                Valor combinado (entre os advogados — a plataforma não processa)
                <Input maxLength={200} value={termoValor} onChange={(e) => setTermoValor(e.target.value)} />
              </label>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEscolhida(null)}>Voltar</Button>
                <Button
                  loading={agindo}
                  disabled={termoEscopo.trim().length < 5}
                  onClick={() => {
                    const alvo = vendoOfertas!;
                    void rodar(
                      () => escolherOferta(alvo.id, escolhida.id, { escopo: termoEscopo, prazo: termoPrazo, valor: termoValor }),
                      'Termo registrado — o(a) correspondente confirma e inicia.',
                    ).then(() => {
                      setVendoOfertas(null);
                      setEscolhida(null);
                    });
                  }}
                >
                  Registrar termo
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* pasta da diligência */}
      <Dialog open={pastaDe !== null} onOpenChange={(v) => !v && setPastaDe(null)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Pasta da diligência</DialogTitle>
            <DialogDescription>
              Só o que está aqui circula entre vocês — nada do caso além disto.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'grid', gap: 6, maxHeight: 300, overflowY: 'auto' }}>
            {pasta.length === 0 && <p className="fund">Pasta vazia.</p>}
            {pasta.map((a) => (
              <p key={a.id} className="fund" style={{ margin: 0 }}>
                {a.origem === 'relatorio' ? '📄 (relatório) ' : '📎 '}
                <a href={`/api/diligencias/${pastaDe?.id}/arquivo?arquivo=${a.id}`}>{a.nome}</a>{' '}
                · {(a.tamanho / 1_000_000).toFixed(1).replace('.', ',')} MB · {a.em.split('-').reverse().join('/')}
              </p>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* entrega do relatório (correspondente) */}
      <Dialog open={relatorioDe !== null} onOpenChange={(v) => !v && setRelatorioDe(null)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Entregar relatório</DialogTitle>
            <DialogDescription>
              O relatório e os documentos obtidos entram na pasta — o(a) solicitante
              puxa para o caso com nome padronizado.
            </DialogDescription>
          </DialogHeader>
          <label className="campo">
            Arquivos (3,5 MB cada)
            <input type="file" multiple onChange={(e) => setRelArquivos(Array.from(e.target.files ?? []).slice(0, 10))} />
          </label>
          {relatorioDe?.prazoEm && relatorioDe.prazoEm < hojeIso() && (
            <label className="campo">
              Prazo vencido — justifique (obrigatório para não pesar na média)
              <Textarea rows={2} maxLength={400} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} />
            </label>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={agindo} onClick={() => setRelatorioDe(null)}>
              Cancelar
            </Button>
            <Button loading={agindo} disabled={relArquivos.length === 0} onClick={() => void entregarRelatorio()}>
              Entregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
