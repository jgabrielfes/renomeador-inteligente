'use client';

/**
 * O Sucessorista — folha de trabalho do inventário.
 *
 * Esqueleto do protótipo aprovado: entrada pelo cofre (etapa 0, leitura real
 * dos documentos), navegação LIVRE entre as etapas (nada bloqueia nada) e o
 * painel do caso fixo à direita — cada campo digitado move um número lá na
 * hora. Abas: 0 O caso · I A família · II O acervo · III Partilha ·
 * IV Documentos (ambiente + cofre de convites) · V ITCMD.
 *
 * O cálculo roda no navegador (motor puro em lib/partilha); a leitura da
 * etapa 0 usa a rota interna /api/sucessorista. Identidade "livro de notas"
 * escopada em .sucessorista, por cima dos componentes do shadcn.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import './sucessorista.css';

import { Button } from '@/components/ui/button';

import { partilhar } from '@/lib/partilha/engine';
import { apurarAtribuicao, type TitularidadeBem, type TituloCessao } from '@/lib/partilha/atribuicao';
import { montarChecklistAcervo, type StatusItemAcervo } from '@/lib/partilha/acervo';
import type { Caso, Bem } from '@/lib/partilha/types';
import { QUALIFICACAO_VAZIA, PERGUNTAS_ITCMD_VAZIAS, type DadosFalecido, type Qualificacao } from '@/lib/partilha/familia';
import { isencoesArt6, provisionarItcmd, ufespDoAno } from '@/lib/partilha/itcmd';
import type { ConviteHerdeiro, QualificacaoHerdeiro } from '@/lib/portal/store';
import type { CasoExtraido } from '@/lib/gemini-sucessorista';
import { gerarXlsx, baixarBlob, type CelulaXlsx } from '@/lib/partilha/xlsx';

import { CasoView, type ArquivoClassificado } from './caso-view';
import { FamiliaView, Pilula, type EstadoFamilia } from './familia';
import { AcervoView, paraDecimal } from './acervo-view';
import { CofreView } from './cofre';
import { DocumentosView, type AnexosProcesso } from './documentos';
import { ItcmdView, ESTADO_FISCAL_INICIAL, type EstadoFiscal } from './itcmd-view';
import { PainelCaso } from './painel-caso';

/* ---------- helpers ---------- */

const brl = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

// Aleatório (não sequencial): o caso é restaurado do sessionStorage e um
// contador zerado no reload geraria ids que colidem com os restaurados.
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const FALECIDO_VAZIO: DadosFalecido = {
  nome: '',
  cpf: '',
  dataObito: '',
  dataCasamento: '',
  ultimoDomicilio: '',
};

type Aba = 'caso' | 'familia' | 'acervo' | 'partilha' | 'documentos' | 'itcmd';

const ABAS: readonly Aba[] = ['caso', 'familia', 'acervo', 'partilha', 'documentos', 'itcmd'];

// Valida contra a lista fechada, com default explícito (convenção de query string).
const abaValida = (v: string | null): Aba =>
  (ABAS as readonly string[]).includes(v ?? '') ? (v as Aba) : 'caso';

/** Snapshot do caso no sessionStorage: sobrevive ao F5, morre com a aba do
 *  navegador. Arquivos (anexos do processo) não são serializáveis — só eles
 *  precisam ser anexados de novo após recarregar. */
const CHAVE_CASO = 'sucessorista-caso';

interface CasoSalvo {
  v: 1;
  familia: EstadoFamilia;
  bens: Bem[];
  dividasEspolio: string;
  /** Só os status, por id da fonte — robusto a mudanças no catálogo. */
  statusAcervo: Record<string, StatusItemAcervo>;
  fiscal: EstadoFiscal;
  passo: number;
  usufrutoAtivo: boolean;
  titulo: TituloCessao;
  casoId: string;
  convites: Record<string, ConviteHerdeiro>;
}

export default function SucessoristaClient() {
  // A etapa vive na URL (?etapa=…): sobrevive ao F5 e o recorte é
  // compartilhável. A troca usa history.replaceState — atualização rasa, sem
  // round-trip ao servidor nem barra de progresso a cada clique de aba.
  const searchParams = useSearchParams();
  const [abaProc, setAbaProc] = useState<Aba>(() => abaValida(searchParams.get('etapa')));

  const irPara = (aba: Aba) => {
    setAbaProc(aba);
    const url = new URL(window.location.href);
    url.searchParams.set('etapa', aba);
    window.history.replaceState(null, '', url);
  };

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

  /* --- II: acervo (bens, dívidas, fontes de pesquisa) --- */
  const [bens, setBens] = useState<Bem[]>([]);
  /** Dívidas e despesas do espólio (R$) — abatem a massa antes da partilha. */
  const [dividasEspolio, setDividasEspolio] = useState('');
  const [checklistAcervo, setChecklistAcervo] = useState(montarChecklistAcervo());

  /* --- III: partilha (2 passos: espelho · diferenciada) --- */
  const [passo, setPasso] = useState(1);

  /* --- IV: documentos (ambiente + convites do cofre) --- */
  const [anexosProcesso, setAnexosProcesso] = useState<AnexosProcesso>({});
  const [casoId, setCasoId] = useState(() => uid('caso') + Date.now().toString(36));
  const [convites, setConvites] = useState<Record<string, ConviteHerdeiro>>({});

  /* --- V: estado fiscal (isenções, reforma, protocolo) — alimenta o painel --- */
  const [fiscal, setFiscal] = useState<EstadoFiscal>(ESTADO_FISCAL_INICIAL);

  const caso: Caso = useMemo(() => {
    const limpo = dividasEspolio.replace(/\./g, '').replace(',', '.');
    const dividas =
      /^\d+(\.\d{1,2})?$/.test(limpo) && Number(limpo) > 0
        ? [
            {
              id: 'div-espolio',
              descricao: 'Dívidas e despesas do espólio',
              valor: Number(limpo).toFixed(2),
              natureza: 'COMUM' as const,
            },
          ]
        : undefined;
    return {
      falecido: { dataObito: falecido.dataObito || new Date().toISOString().slice(0, 10) },
      sobrevivente: temSobrevivente
        ? { vinculo, regime, nome: nomeSobrev || 'Cônjuge/companheiro(a)' }
        : null,
      herdeiros,
      bens,
      dividas,
    };
  }, [falecido.dataObito, temSobrevivente, vinculo, regime, nomeSobrev, herdeiros, bens, dividasEspolio]);

  const resultado = useMemo(() => {
    if (bens.length === 0 || (herdeiros.length === 0 && !temSobrevivente)) return null;
    try {
      return partilhar(caso);
    } catch {
      return null;
    }
  }, [caso, bens.length, herdeiros.length, temSobrevivente]);

  /* --- fiscal computado uma vez, compartilhado entre o painel e o item V --- */
  const hoje = hojeIso();
  const ufespObito = falecido.dataObito
    ? ufespDoAno(Number(falecido.dataObito.slice(0, 4)))
    : null;

  const isencoes = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0 || !ufespObito) return null;
    return isencoesArt6({
      bens: bens.map((b) => ({ tipo: b.tipo, valor: Number(b.valor), descricao: b.descricao })),
      ufespObito: ufespObito.valor,
      aplicarImovelResidencial: fiscal.isencaoResidencial,
      aplicarDepositos: fiscal.isencaoDepositos,
    });
  }, [resultado, ufespObito, bens, fiscal.isencaoResidencial, fiscal.isencaoDepositos]);

  const provisao = useMemo(() => {
    if (!falecido.dataObito || !resultado || resultado.bloqueios.length > 0) return null;
    const herancaBruta = Number(resultado.heranca.total);
    const baseLiquida = Math.max(0, herancaBruta - (isencoes?.valorIsento ?? 0));
    const fator = herancaBruta > 0 ? baseLiquida / herancaBruta : 0;
    return provisionarItcmd({
      dataObito: falecido.dataObito,
      dataReferencia: hoje,
      baseCalculo: baseLiquida,
      dataProtocolo: fiscal.inventarioAberto && fiscal.dataProtocolo ? fiscal.dataProtocolo : null,
      quinhoes: resultado.quinhoes.map((q) => ({ nome: q.nome, valor: Number(q.valor) * fator })),
      faixasProgressivas: fiscal.faixas,
      vigenciaProgressiva: fiscal.vigencia,
    });
  }, [falecido.dataObito, resultado, hoje, isencoes, fiscal]);

  /* --- passo 2 da partilha: diferenciada --- */
  const [usufrutoAtivo, setUsufrutoAtivo] = useState(false);
  const [titulo, setTitulo] = useState<TituloCessao>('GRATUITO');

  /* --- persistência no sessionStorage: F5 não apaga a folha --- */

  // Restaura UMA vez, antes de qualquer gravação — o efeito de salvar espera
  // a flag (sem ela, gravaria o estado vazio por cima do snapshot). O apply é
  // diferido (setTimeout 0): evita setState síncrono em efeito (regra do
  // lint) e garante que a flag só liga DEPOIS de o snapshot ser aplicado.
  const restauradoRef = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const bruto = sessionStorage.getItem(CHAVE_CASO);
        if (bruto) {
          const salvo = JSON.parse(bruto) as CasoSalvo;
          if (salvo?.v === 1) {
            if (salvo.familia?.falecido) setFamilia(salvo.familia);
            if (Array.isArray(salvo.bens)) setBens(salvo.bens);
            if (typeof salvo.dividasEspolio === 'string') setDividasEspolio(salvo.dividasEspolio);
            if (salvo.statusAcervo && typeof salvo.statusAcervo === 'object') {
              setChecklistAcervo((prev) =>
                prev.map((item) =>
                  salvo.statusAcervo[item.fonte.id]
                    ? { ...item, status: salvo.statusAcervo[item.fonte.id] }
                    : item
                )
              );
            }
            if (salvo.fiscal) setFiscal(salvo.fiscal);
            if (Number.isInteger(salvo.passo) && salvo.passo >= 1) setPasso(salvo.passo);
            setUsufrutoAtivo(salvo.usufrutoAtivo === true);
            if (salvo.titulo === 'GRATUITO' || salvo.titulo === 'ONEROSO') setTitulo(salvo.titulo);
            if (typeof salvo.casoId === 'string' && salvo.casoId) setCasoId(salvo.casoId);
            if (salvo.convites && typeof salvo.convites === 'object') setConvites(salvo.convites);
          }
        }
      } catch {
        // snapshot corrompido: recomeça em branco
      }
      restauradoRef.current = true;
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Grava o snapshot a cada mudança. Arquivos (File) ficam de fora — não são
  // serializáveis; os anexos precisam ser reanexados após recarregar.
  useEffect(() => {
    if (!restauradoRef.current) return;
    try {
      const statusAcervo: Record<string, StatusItemAcervo> = {};
      for (const item of checklistAcervo) statusAcervo[item.fonte.id] = item.status;
      const salvo: CasoSalvo = {
        v: 1,
        familia,
        bens,
        dividasEspolio,
        statusAcervo,
        fiscal,
        passo,
        usufrutoAtivo,
        titulo,
        casoId,
        convites,
      };
      sessionStorage.setItem(CHAVE_CASO, JSON.stringify(salvo));
    } catch {
      // sem espaço ou modo restrito: a persistência é conforto, não requisito
    }
  }, [familia, bens, dividasEspolio, checklistAcervo, fiscal, passo, usufrutoAtivo, titulo, casoId, convites]);

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

  /* --- etapa 0: mesclagem da leitura na folha (campo vazio primeiro) --- */
  const aplicarLeitura = (lido: CasoExtraido, arquivos: ArquivoClassificado[]) => {
    if (arquivos.length > 0) {
      setAnexosProcesso((prev) => {
        const proximos = { ...prev };
        for (const a of arquivos) {
          const id = a.documentoId ?? 'outros';
          proximos[id] = [...(proximos[id] ?? []), a.file];
        }
        return proximos;
      });
    }

    setFamilia((prev) => {
      const fal = { ...prev.falecido };
      if (!fal.nome && lido.falecido.nome) fal.nome = lido.falecido.nome;
      if (!fal.cpf && lido.falecido.cpf) fal.cpf = lido.falecido.cpf;
      if (!fal.dataObito && lido.falecido.dataObito) fal.dataObito = lido.falecido.dataObito;
      if (!fal.dataCasamento && lido.falecido.dataCasamento)
        fal.dataCasamento = lido.falecido.dataCasamento;
      if (!fal.ultimoDomicilio && lido.falecido.ultimoDomicilio)
        fal.ultimoDomicilio = lido.falecido.ultimoDomicilio;

      const nomesAtuais = new Set(prev.herdeiros.map((h) => h.nome.trim().toLowerCase()));
      const novos = lido.herdeiros
        .filter((h) => !nomesAtuais.has(h.nome.trim().toLowerCase()))
        .map((h) => ({
          id: uid('h'),
          nome: h.nome,
          classe: 'DESCENDENTE' as const,
          grau: 1,
          status: 'ATIVO' as const,
          filhoDoSobrevivente: h.filhoDoSobrevivente ?? true,
        }));
      const qualificacoes: Record<string, Qualificacao> = { ...prev.qualificacoes };
      const perguntas = { ...prev.perguntas };
      for (const n of novos) {
        qualificacoes[n.id] = QUALIFICACAO_VAZIA;
        perguntas[n.id] = PERGUNTAS_ITCMD_VAZIAS;
      }

      // Qualificação extraída (planilha do escritório, minutas): preenche só
      // campo VAZIO da ficha, casando por nome — vale para herdeiro novo e
      // para quem já estava lançado. Extração é apoio: a UI pede conferência.
      const todos = [...prev.herdeiros, ...novos];
      for (const lidoH of lido.herdeiros) {
        if (!lidoH.qualificacao) continue;
        const alvo = todos.find(
          (h) => h.nome.trim().toLowerCase() === lidoH.nome.trim().toLowerCase(),
        );
        if (!alvo) continue;
        const ficha = { ...(qualificacoes[alvo.id] ?? QUALIFICACAO_VAZIA) };
        for (const campo of Object.keys(lidoH.qualificacao) as (keyof NonNullable<
          typeof lidoH.qualificacao
        >)[]) {
          const v = lidoH.qualificacao[campo];
          if (v && campo in ficha && !ficha[campo as keyof Qualificacao]) {
            ficha[campo as keyof Qualificacao] = v;
          }
        }
        qualificacoes[alvo.id] = ficha;
      }

      return {
        ...prev,
        falecido: fal,
        temSobrevivente:
          lido.sobrevivente.existe !== null ? lido.sobrevivente.existe : prev.temSobrevivente,
        vinculo: lido.sobrevivente.vinculo ?? prev.vinculo,
        regime: lido.sobrevivente.regime ?? prev.regime,
        nomeSobrev: prev.nomeSobrev || (lido.sobrevivente.nome ?? ''),
        herdeiros: [...prev.herdeiros, ...novos],
        qualificacoes,
        perguntas,
      };
    });

    if (lido.bens.length > 0) {
      setBens((prev) => {
        const descricoes = new Set(prev.map((b) => b.descricao.trim().toLowerCase()));
        const novos = lido.bens
          .filter((b) => !descricoes.has(b.descricao.trim().toLowerCase()))
          .map((b) => ({
            id: uid('b'),
            descricao: b.descricao,
            valor: b.valor ?? '0.00',
            natureza: b.natureza ?? ('COMUM' as const),
            tipo: b.tipo ?? ('OUTRO' as const),
          }));
        return [...prev, ...novos];
      });
    }
  };

  /** Início rápido: só a data do óbito (+ valor estimado) acorda o painel. */
  const inicioRapido = (dataObito: string, valorEstimado: string) => {
    setFamilia((prev) => ({ ...prev, falecido: { ...prev.falecido, dataObito } }));
    if (valorEstimado.trim()) {
      const valor = paraDecimal(valorEstimado);
      setBens((prev) => [
        ...prev.filter((b) => b.id !== 'estimativa'),
        {
          id: 'estimativa',
          descricao: 'Acervo estimado (início rápido — substitua pelos bens reais)',
          valor,
          natureza: 'COMUM',
          tipo: 'OUTRO',
        },
      ]);
    }
  };

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
    irPara('familia');
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
            ['caso', '0', 'O caso'],
            ['familia', 'I', 'A família'],
            ['acervo', 'II', 'O acervo'],
            ['partilha', 'III', 'Partilha'],
            ['documentos', 'IV', 'Documentos'],
            ['itcmd', 'V', 'ITCMD'],
          ] as const
        ).map(([id, ind, rotulo]) => (
          <button
            key={id}
            className="aba"
            aria-current={abaProc === id}
            onClick={() => irPara(id)}
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
        {abaProc === 'caso' && (
          <CasoView
            aplicarLeitura={aplicarLeitura}
            onInicioRapido={inicioRapido}
            irParaFamilia={() => irPara('familia')}
          />
        )}

        {abaProc === 'familia' && (
          <FamiliaView
            estado={familia}
            onChange={setFamilia}
            avancar={() => irPara('acervo')}
          />
        )}

        {abaProc === 'acervo' && (
          <AcervoView
            bens={bens}
            setBens={setBens}
            dividas={dividasEspolio}
            setDividas={setDividasEspolio}
            checklist={checklistAcervo}
            setChecklist={setChecklistAcervo}
            voltar={() => irPara('familia')}
            avancar={() => {
              irPara('partilha');
              setPasso(1);
            }}
          />
        )}

        {abaProc === 'partilha' && (
          <>
            <h1>Partilha</h1>
            <p className="subtitulo">
              O espelho da partilha com o fundamento legal de cada lançamento — e a apuração
              de torna quando a família convenciona diferente do direito. O vínculo, o regime
              e os herdeiros vêm do item I; os bens, do item II.
            </p>

            <div className="passos" role="tablist" aria-label="Passos">
              {['Espelho da partilha', 'Partilha diferenciada'].map((t, i) => (
                <Button
                  key={t}
                  size="sm"
                  variant={passo === i + 1 ? 'default' : 'outline'}
                  aria-current={passo === i + 1}
                  onClick={() => setPasso(i + 1)}
                >
                  {i + 1}. {t}
                </Button>
              ))}
            </div>

            {passo === 1 && (
              <EspelhoView
                resultado={resultado}
                bens={bens}
                nomeCaso={falecido.nome}
                voltar={() => irPara('acervo')}
                avancar={() => setPasso(2)}
              />
            )}

            {passo === 2 && (
              <section>
                <span className="eyebrow">Passo 2</span>
                <h2>Partilha diferenciada — usufruto e torna</h2>
                <p className="subtitulo">
                  Quando o(a) sobrevivente reserva o usufruto do acervo inteiro e os
                  descendentes ficam com a nua-propriedade, o desvio entre direito e
                  atribuição é a torna — e a torna é fato gerador.
                </p>
                <div className="escolha">
                  <Pilula ativo={!usufrutoAtivo} onClick={() => setUsufrutoAtivo(false)}>
                    Partilha na proporção do direito
                  </Pilula>
                  <Pilula ativo={usufrutoAtivo} onClick={() => setUsufrutoAtivo(true)}>
                    Usufruto ao sobrevivente + nua-propriedade aos descendentes
                  </Pilula>
                </div>

                {usufrutoAtivo && (
                  <>
                    <h2>Título da cessão do excedente</h2>
                    <div className="escolha">
                      <Pilula ativo={titulo === 'GRATUITO'} onClick={() => setTitulo('GRATUITO')}>
                        Gratuito (doação — ITCMD)
                      </Pilula>
                      <Pilula ativo={titulo === 'ONEROSO'} onClick={() => setTitulo('ONEROSO')}>
                        Oneroso (reposição — ITBI)
                      </Pilula>
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
                  <Button variant="outline" onClick={() => setPasso(1)}>
                    Voltar ao espelho
                  </Button>
                  <Button onClick={() => irPara('itcmd')}>Ver ITCMD</Button>
                </div>
              </section>
            )}
          </>
        )}

        {abaProc === 'documentos' && (
          <section>
            <h1>Documentos</h1>
            <p className="subtitulo">
              O que o caso exige, cruzado com o que já está na pasta — e o cofre de convites
              para os herdeiros mandarem o que falta.
            </p>
            <DocumentosView
              anexos={anexosProcesso}
              setAnexos={setAnexosProcesso}
              nomeCaso={falecido.nome}
            />
            <CofreView
              herdeiros={herdeiros}
              nomeFalecido={falecido.nome}
              casoId={casoId}
              convites={convites}
              setConvites={setConvites}
              onImportarQualificacao={importarQualificacao}
              irParaFamilia={() => irPara('familia')}
            />
          </section>
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
            fiscal={fiscal}
            setFiscal={setFiscal}
            isencoes={isencoes}
            provisao={provisao}
            hoje={hoje}
            irParaFamilia={() => irPara('familia')}
            irParaAcervo={() => irPara('acervo')}
          />
        )}
      </main>

      <PainelCaso
        falecido={falecido}
        temSobrevivente={temSobrevivente}
        vinculo={vinculo}
        regime={regime}
        herdeiros={herdeiros}
        bens={bens}
        resultado={resultado}
        provisao={provisao}
        isencoes={isencoes}
        faixas={fiscal.faixas}
      />
    </div>
    </div>
  );
}

/* ================= espelho da partilha ================= */

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
          <p>Lance ao menos um bem (item II) e cadastre a família (item I) para calcular.</p>
        </div>
        <div className="rodape-acoes">
          <Button variant="outline" onClick={voltar}>
            Voltar ao acervo
          </Button>
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
      <span className="eyebrow">Passo 1</span>
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
            <Button variant="outline" onClick={exportarExcel} loading={exportando}>
              Exportar em Excel (.xlsx)
            </Button>
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
        <Button variant="outline" onClick={voltar}>
          Voltar ao acervo
        </Button>
        <Button onClick={avancar} disabled={resultado.bloqueios.length > 0}>
          Partilha diferenciada
        </Button>
      </div>
    </section>
  );
}
