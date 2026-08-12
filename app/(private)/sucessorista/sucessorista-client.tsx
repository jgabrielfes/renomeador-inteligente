'use client';

/**
 * O Sucessorista — folha de trabalho do inventário.
 *
 * Esqueleto do protótipo aprovado: entrada pelo cofre (etapa 0, leitura real
 * dos documentos), navegação LIVRE entre as etapas (nada bloqueia nada) e o
 * painel do caso fixo à direita — cada campo digitado move um número lá na
 * hora. Abas: 0 O caso · I A família · II O acervo · III Partilha ·
 * IV ITCMD · V Documentos (ambiente + cofre de convites) · VI Honorários.
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
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

import { partilhar } from '@/lib/partilha/engine';
import {
  apurarAtribuicao,
  TABELA_SP_2026,
  type TitularidadeBem,
  type TituloCessao,
} from '@/lib/partilha/atribuicao';
import { montarChecklistAcervo, type StatusItemAcervo } from '@/lib/partilha/acervo';
import type { Caso, Bem } from '@/lib/partilha/types';
import { QUALIFICACAO_VAZIA, PERGUNTAS_ITCMD_VAZIAS, type DadosFalecido, type Qualificacao } from '@/lib/partilha/familia';
import { isencoesArt6, provisionarItcmd, ufespDoAno } from '@/lib/partilha/itcmd';
import {
  avaliarQuotas,
  chaveSociedade,
  mesclarSociedade,
  type SociedadeExtraida,
} from '@/lib/partilha/sociedade';
import type { ConviteHerdeiro, QualificacaoHerdeiro } from '@/lib/portal/store';
import type { CasoExtraido } from '@/lib/gemini-sucessorista';
import { gerarXlsx, baixarBlob, type CelulaXlsx } from '@/lib/partilha/xlsx';

import { CasoView, type ArquivoClassificado } from './caso-view';
import { FamiliaView, Pilula, type EstadoFamilia } from './familia';
import { AcervoView, paraDecimal } from './acervo-view';
import { CofreView } from './cofre';
import { DocumentosView, type AnexosProcesso } from './documentos';
import { ItcmdView, ESTADO_FISCAL_INICIAL, type EstadoFiscal } from './itcmd-view';
import { HonorariosView } from './honorarios-view';
import { CONDICOES_INICIAIS, type CondicoesHonorarios } from '@/lib/partilha/honorarios';
import { PainelCaso } from './painel-caso';

/* ---------- helpers ---------- */

const brl = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

// Aleatório (não sequencial): o caso é restaurado do sessionStorage e um
// contador zerado no reload geraria ids que colidem com os restaurados.
const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 8)}`;

/** Nome normalizado para comparação: sem acento, caixa alta, espaços únicos. */
const chaveNome = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * Mesma pessoa: nomes iguais após normalizar OU um contido no outro —
 * "Renata" e "Renata Pummer Carvalho Lavruhin" são a mesma herdeira, assim
 * como "Márcio"/"Marcio". É o critério de TODA mesclagem de pessoas da folha.
 */
const mesmaPessoa = (a: string, b: string) => {
  const na = chaveNome(a);
  const nb = chaveNome(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
};

/** Copia da origem apenas os campos VAZIOS da ficha (extração é apoio). */
function preencherVazios(
  destino: Qualificacao,
  origem: Partial<Record<keyof Qualificacao, string | null>> | null | undefined,
): Qualificacao {
  if (!origem) return destino;
  const ficha = { ...destino };
  for (const campo of Object.keys(QUALIFICACAO_VAZIA) as (keyof Qualificacao)[]) {
    const v = origem[campo];
    if (v && !ficha[campo]) ficha[campo] = v;
  }
  return ficha;
}

/** "%" digitado na matriz da partilha → número (aceita vírgula); vazio = 0. */
const pctNum = (v: string | undefined): number => {
  if (!v) return 0;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** Descrição enxuta do bem para a matriz (o título completo fica no title). */
const descricaoCurta = (s: string): string =>
  s.length > 64 ? `${s.slice(0, 61).trimEnd()}…` : s;

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

type Aba = 'caso' | 'familia' | 'acervo' | 'partilha' | 'documentos' | 'itcmd' | 'honorarios';

const ABAS: readonly Aba[] = ['caso', 'familia', 'acervo', 'partilha', 'documentos', 'itcmd', 'honorarios'];

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
  /** Sociedades lidas (snapshot posterior à v1 inicial — opcional). */
  sociedades?: Record<string, SociedadeExtraida>;
  fiscal: EstadoFiscal;
  passo: number;
  /** Partilha diferenciada (formato antigo, migrado): bemId → com quem ficava. */
  atribuicoes?: Record<string, string>;
  /** Partilha diferenciada: bemId → { participanteId → % do bem (texto) }. */
  atribuicoesPct?: Record<string, Record<string, string>>;
  titulo: TituloCessao;
  /** Condições de honorários do caso (o perfil do escritório é do navegador). */
  honorarios?: CondicoesHonorarios;
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
    // Cada aba é uma "página" nova da folha: começa no topo, não onde a
    // rolagem da aba anterior parou.
    window.scrollTo(0, 0);
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
    inventarianteId: null,
  });
  const { falecido, temSobrevivente, vinculo, regime, nomeSobrev, herdeiros } = familia;

  /* --- II: acervo (bens, dívidas, fontes de pesquisa) --- */
  const [bens, setBens] = useState<Bem[]>([]);
  /** Dívidas e despesas do espólio (R$) — abatem a massa antes da partilha. */
  const [dividasEspolio, setDividasEspolio] = useState('');
  const [checklistAcervo, setChecklistAcervo] = useState(montarChecklistAcervo());
  /** Sociedades lidas do contrato social/balanço, mescladas por empresa. */
  const [sociedades, setSociedades] = useState<Record<string, SociedadeExtraida>>({});

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

  /** Resumo das sociedades lidas, para a conferência no item II. */
  const resumoSociedades = useMemo(
    () =>
      Object.entries(sociedades).map(([chave, s]) => ({
        chave,
        sociedade: s,
        avaliacao: avaliarQuotas(s, falecido.nome, temSobrevivente ? nomeSobrev : '', regime),
      })),
    [sociedades, falecido.nome, nomeSobrev, temSobrevivente, regime],
  );

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

  /* --- passo 2 da partilha: matriz bem × participante (% de cada bem) --- */
  const [matriz, setMatriz] = useState<Record<string, Record<string, string>>>({});
  const [titulo, setTitulo] = useState<TituloCessao>('GRATUITO');

  /* --- VI: honorários do caso (perfil do escritório fica na própria view) --- */
  const [condicoesHonorarios, setCondicoesHonorarios] =
    useState<CondicoesHonorarios>(CONDICOES_INICIAIS);

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
            // Snapshot de versão anterior pode não ter inventarianteId.
            if (salvo.familia?.falecido)
              setFamilia({ ...salvo.familia, inventarianteId: salvo.familia.inventarianteId ?? null });
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
            if (salvo.sociedades && typeof salvo.sociedades === 'object')
              setSociedades(salvo.sociedades);
            if (salvo.fiscal) setFiscal(salvo.fiscal);
            if (Number.isInteger(salvo.passo) && salvo.passo >= 1) setPasso(salvo.passo);
            if (salvo.atribuicoesPct && typeof salvo.atribuicoesPct === 'object') {
              setMatriz(salvo.atribuicoesPct);
            } else if (salvo.atribuicoes && typeof salvo.atribuicoes === 'object') {
              // Migra o formato antigo (bem inteiro para uma pessoa) → 100%.
              const migrada: Record<string, Record<string, string>> = {};
              for (const [bemId, destino] of Object.entries(salvo.atribuicoes)) {
                if (destino) migrada[bemId] = { [destino]: '100' };
              }
              setMatriz(migrada);
            }
            if (salvo.titulo === 'GRATUITO' || salvo.titulo === 'ONEROSO') setTitulo(salvo.titulo);
            if (salvo.honorarios && typeof salvo.honorarios === 'object')
              setCondicoesHonorarios({ ...CONDICOES_INICIAIS, ...salvo.honorarios });
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
        sociedades,
        fiscal,
        passo,
        atribuicoesPct: matriz,
        titulo,
        honorarios: condicoesHonorarios,
        casoId,
        convites,
      };
      sessionStorage.setItem(CHAVE_CASO, JSON.stringify(salvo));
    } catch {
      // sem espaço ou modo restrito: a persistência é conforto, não requisito
    }
  }, [familia, bens, dividasEspolio, checklistAcervo, sociedades, fiscal, passo, matriz, titulo, condicoesHonorarios, casoId, convites]);

  /* --- sociedades lidas → bem de quotas no acervo ---
     Recalculado sempre que a sociedade, os nomes ou o regime mudam: o valor é
     max(patrimônio líquido, capital social) × percentual do falecido (ou do
     casal, nos regimes de comunhão). Id determinístico: atualiza em vez de
     duplicar; editar o bem na mão vale até a próxima mudança destes dados. */
  useEffect(() => {
    const chaves = Object.keys(sociedades);
    if (chaves.length === 0) return;
    // Diferido (setTimeout 0): setState síncrono em efeito dispararia render
    // em cascata (regra do lint) — mesmo padrão da restauração do snapshot.
    const t = setTimeout(() => {
    setBens((prev) => {
      let mudou = false;
      const proximos = [...prev];
      for (const chave of chaves) {
        const id = `quotas-${chave}`;
        const avaliacao = avaliarQuotas(
          sociedades[chave],
          falecido.nome,
          temSobrevivente ? nomeSobrev : '',
          regime,
        );
        const idx = proximos.findIndex((b) => b.id === id);
        if (!avaliacao) continue; // sem correspondência: não lança nem remove o que o advogado ajustou
        const bem: Bem = {
          id,
          descricao: avaliacao.descricao,
          valor: avaliacao.valor,
          natureza: avaliacao.natureza,
          tipo: 'QUOTAS',
        };
        if (idx < 0) {
          proximos.push(bem);
          mudou = true;
        } else if (
          proximos[idx].descricao !== bem.descricao ||
          proximos[idx].valor !== bem.valor ||
          proximos[idx].natureza !== bem.natureza
        ) {
          proximos[idx] = { ...proximos[idx], ...bem };
          mudou = true;
        }
      }
      return mudou ? proximos : prev;
    });
    }, 0);
    return () => clearTimeout(t);
  }, [sociedades, falecido.nome, nomeSobrev, temSobrevivente, regime]);

  /** Quem tem direito no caso (meação e/ou quinhão) — as opções do "fica com". */
  const participantes = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0) return [];
    const lista: { id: string; nome: string }[] = [];
    if (resultado.meacao) {
      lista.push({ id: '__sobrevivente__', nome: resultado.meacao.beneficiario });
    }
    for (const q of resultado.quinhoes) {
      if (!lista.some((x) => x.id === q.herdeiroId)) lista.push({ id: q.herdeiroId, nome: q.nome });
    }
    return lista;
  }, [resultado]);

  /** Quinhão de direito em R$ por participante (meação + quinhões). */
  const direitoPorParticipante = useMemo(() => {
    const mapa: Record<string, number> = {};
    if (!resultado || resultado.bloqueios.length > 0) return mapa;
    if (resultado.meacao) mapa['__sobrevivente__'] = Number(resultado.meacao.valor);
    for (const q of resultado.quinhoes)
      mapa[q.herdeiroId] = (mapa[q.herdeiroId] ?? 0) + Number(q.valor);
    return mapa;
  }, [resultado]);

  /**
   * Partilha diferenciada em MATRIZ: cada linha (bem) distribui percentuais
   * entre os participantes; linha toda vazia segue a proporção exata do
   * direito (meação + quinhão — neutro na conta). Linha preenchida precisa
   * fechar 100%. O desvio entre recebido e direito vira o acerto (torna),
   * com o imposto da cessão.
   */
  const atribuicao = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0 || bens.length === 0) return null;
    if (participantes.length === 0) return null;

    const linhas = bens.map((b, i) => {
      const linha = matriz[b.id] ?? {};
      const pcts = participantes.map((p) => pctNum(linha[p.id]));
      return { bem: b, indice: i, pcts, total: pcts.reduce((a, v) => a + v, 0) };
    });
    if (!linhas.some((l) => l.total > 0)) return null; // tudo na proporção do direito

    // Linha preenchida tem de fechar 100% (tolerância de dízima: ±0,05).
    const invalidas = linhas.filter((l) => l.total > 0 && Math.abs(l.total - 100) > 0.05);
    if (invalidas.length > 0) {
      return {
        posicoes: [],
        transferencias: [],
        totalTorna: '0.00',
        avisos: [],
        bloqueios: invalidas.map(
          (l) =>
            `Bem ${l.indice + 1}: os percentuais somam ${l.total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% — a linha precisa fechar 100% (ou ficar toda vazia para seguir a proporção do direito).`,
        ),
      };
    }

    const direitoCents = new Map<string, number>();
    for (const [id, v] of Object.entries(direitoPorParticipante)) {
      direitoCents.set(id, Math.round(v * 100));
    }
    const totalCents = [...direitoCents.values()].reduce((a, v) => a + v, 0);
    if (totalCents <= 0) return null;

    const titularidades: TitularidadeBem[] = [];
    for (const l of linhas) {
      if (l.total === 0) {
        for (const [id, cents] of direitoCents) {
          if (cents <= 0) continue;
          titularidades.push({
            bemId: l.bem.id,
            titularId: id,
            direito: 'PLENA',
            fracao: `${cents}/${totalCents}`,
          });
        }
        continue;
      }
      // Pontos-base normalizados para fechar EXATAMENTE 10000 — o motor exige
      // soma 1 por bem ("33,33" três vezes viraria 9999 sem o ajuste).
      const bps = l.pcts.map((p) => Math.round((p / l.total) * 10000));
      const soma = bps.reduce((a, v) => a + v, 0);
      let maior = 0;
      for (let i = 1; i < bps.length; i++) if (bps[i] > bps[maior]) maior = i;
      bps[maior] += 10000 - soma;
      participantes.forEach((p, i) => {
        if (bps[i] > 0)
          titularidades.push({
            bemId: l.bem.id,
            titularId: p.id,
            direito: 'PLENA',
            fracao: `${bps[i]}/10000`,
          });
      });
    }

    // Isenção de doação por donatário/ano (art. 6º, II, "a"): 2.500 UFESPs.
    const ufespAtual = ufespDoAno(new Date().getFullYear()).valor;
    return apurarAtribuicao(caso, resultado, {
      titularidades,
      titulosPorCedente: Object.fromEntries(participantes.map((p) => [p.id, titulo])),
      tabela: {
        ...TABELA_SP_2026,
        isencaoDoacaoAnualPorDonatario: (2500 * ufespAtual).toFixed(2),
      },
    });
  }, [resultado, titulo, caso, bens, matriz, participantes, direitoPorParticipante]);

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

      // Higiene da lista LIDA: cada pessoa uma única vez (une "Renata" com
      // "Renata Pummer Carvalho Lavruhin" e variações de acento, ficando o
      // nome mais completo) — e nem o(a) falecido(a) nem o(a) sobrevivente
      // entram como herdeiros (o viúvo não é herdeiro na lista).
      const nomeFalecido = fal.nome || lido.falecido.nome || '';
      const nomeSobrevivente = prev.nomeSobrev || lido.sobrevivente.nome || '';
      const lidos: typeof lido.herdeiros = [];
      for (const h of lido.herdeiros) {
        if (nomeFalecido && mesmaPessoa(h.nome, nomeFalecido)) continue;
        if (nomeSobrevivente && mesmaPessoa(h.nome, nomeSobrevivente)) continue;
        const visto = lidos.find((x) => mesmaPessoa(x.nome, h.nome));
        if (visto) {
          if (h.nome.trim().length > visto.nome.trim().length) visto.nome = h.nome;
          if (!visto.qualificacao && h.qualificacao) visto.qualificacao = h.qualificacao;
          continue;
        }
        lidos.push({ ...h });
      }

      const qualificacoes: Record<string, Qualificacao> = { ...prev.qualificacoes };
      const perguntas = { ...prev.perguntas };
      let inventarianteId = prev.inventarianteId;

      // Também deduplica a lista JÁ LANÇADA (leituras anteriores podem ter
      // duplicado): a primeira ocorrência fica (id preservado) com o nome
      // mais completo; a ficha ganha os campos vazios da duplicata removida.
      const mantidos: typeof prev.herdeiros = [];
      for (const h of prev.herdeiros) {
        const original = mantidos.find((x) => mesmaPessoa(x.nome, h.nome));
        if (!original) {
          mantidos.push({ ...h });
          continue;
        }
        if (h.nome.trim().length > original.nome.trim().length) original.nome = h.nome;
        qualificacoes[original.id] = preencherVazios(
          qualificacoes[original.id] ?? QUALIFICACAO_VAZIA,
          qualificacoes[h.id],
        );
        delete qualificacoes[h.id];
        delete perguntas[h.id];
        if (inventarianteId === h.id) inventarianteId = original.id;
      }

      // Nome mais completo lido atualiza quem já estava lançado.
      for (const m of mantidos) {
        const correspondente = lidos.find((x) => mesmaPessoa(x.nome, m.nome));
        if (correspondente && correspondente.nome.trim().length > m.nome.trim().length)
          m.nome = correspondente.nome;
      }

      const novos = lidos
        .filter((h) => !mantidos.some((x) => mesmaPessoa(x.nome, h.nome)))
        .map((h) => ({
          id: uid('h'),
          nome: h.nome,
          classe: 'DESCENDENTE' as const,
          grau: 1,
          status: 'ATIVO' as const,
          filhoDoSobrevivente: h.filhoDoSobrevivente ?? true,
        }));
      for (const n of novos) {
        qualificacoes[n.id] = QUALIFICACAO_VAZIA;
        perguntas[n.id] = PERGUNTAS_ITCMD_VAZIAS;
      }

      // Qualificação extraída (planilha do escritório, minutas): preenche só
      // campo VAZIO da ficha, casando por pessoa — vale para herdeiro novo e
      // para quem já estava lançado. Extração é apoio: a UI pede conferência.
      const todos = [...mantidos, ...novos];
      for (const lidoH of lido.herdeiros) {
        if (!lidoH.qualificacao) continue;
        const alvo = todos.find((h) => mesmaPessoa(h.nome, lidoH.nome));
        if (!alvo) continue;
        qualificacoes[alvo.id] = preencherVazios(
          qualificacoes[alvo.id] ?? QUALIFICACAO_VAZIA,
          lidoH.qualificacao,
        );
      }

      // Qualificação do(a) sobrevivente (coluna "VIÚVO(A)" das planilhas).
      if (lido.sobrevivente.qualificacao) {
        qualificacoes['__sobrevivente__'] = preencherVazios(
          qualificacoes['__sobrevivente__'] ?? QUALIFICACAO_VAZIA,
          lido.sobrevivente.qualificacao,
        );
      }

      return {
        ...prev,
        falecido: fal,
        temSobrevivente:
          lido.sobrevivente.existe !== null ? lido.sobrevivente.existe : prev.temSobrevivente,
        vinculo: lido.sobrevivente.vinculo ?? prev.vinculo,
        regime: lido.sobrevivente.regime ?? prev.regime,
        nomeSobrev: prev.nomeSobrev || (lido.sobrevivente.nome ?? ''),
        herdeiros: todos,
        qualificacoes,
        perguntas,
        inventarianteId,
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

    // Outros óbitos detectados: herdeiro com o mesmo nome vira PRÉ-MORTO
    // automaticamente (a certidão de óbito dele está na pasta). Nome sem
    // correspondência fica só no alerta da leitura — pode ser 2ª sucessão.
    if (lido.outrosFalecidos.length > 0) {
      setFamilia((prev) => ({
        ...prev,
        herdeiros: prev.herdeiros.map((h) =>
          lido.outrosFalecidos.some((o) => mesmaPessoa(o.nome, h.nome)) && h.status === 'ATIVO'
            ? { ...h, status: 'PRE_MORTO' as const }
            : h,
        ),
      }));
    }

    // Sociedades: mescla por empresa — contrato social num lote e balanço em
    // outro completam o MESMO registro; o efeito acima transforma em bem.
    if (lido.sociedades.length > 0) {
      setSociedades((prev) => {
        const proximas = { ...prev };
        for (const s of lido.sociedades) {
          const chave = chaveSociedade(s.empresa);
          if (!chave) continue;
          proximas[chave] = proximas[chave] ? mesclarSociedade(proximas[chave], s) : s;
        }
        return proximas;
      });
    }
  };

  /**
   * A leitura por IA terminou DEPOIS do anexo imediato: move cada arquivo já
   * anexado para o item do catálogo que ela apontou (identidade do objeto
   * File). Arquivo que a IA confirmou no mesmo item apenas permanece.
   */
  const reclassificarArquivos = (itens: ArquivoClassificado[]) => {
    if (itens.length === 0) return;
    setAnexosProcesso((prev) => {
      const destino = new Map<File, string>(
        itens.map((i) => [i.file, i.documentoId ?? 'outros']),
      );
      const proximos: AnexosProcesso = {};
      for (const [id, files] of Object.entries(prev)) {
        proximos[id] = files.filter((f) => !destino.has(f));
      }
      for (const [file, id] of destino) {
        proximos[id] = [...(proximos[id] ?? []), file];
      }
      return proximos;
    });
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

  /** Minuta de petição ao Tabelionato (.docx) a partir da folha inteira. */
  const gerarPeticao = async () => {
    const { montarPeticaoDocx } = await import('@/lib/partilha/peticao');
    const { CATALOGO_DOCUMENTOS } = await import('@/lib/partilha/documentos');
    const blob = await montarPeticaoDocx({
      falecido,
      temSobrevivente,
      nomeSobrev,
      vinculo,
      regime,
      herdeiros,
      qualificacoes: familia.qualificacoes,
      inventarianteId: familia.inventarianteId ?? null,
      bens,
      dividas: dividasEspolio.trim() ? paraDecimal(dividasEspolio) : '',
      resultado,
      provisao,
      documentos: CATALOGO_DOCUMENTOS.map((d) => ({
        titulo: d.titulo,
        arquivos: (anexosProcesso[d.id] ?? []).map((f) => f.name),
      })),
    });
    baixarBlob(
      blob,
      `Peticao - Inventario${falecido.nome ? ` de ${falecido.nome}` : ''}.docx`,
    );
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
            ['itcmd', 'IV', 'ITCMD'],
            ['documentos', 'V', 'Documentos'],
            ['honorarios', 'VI', 'Honorários'],
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
            reclassificarArquivos={reclassificarArquivos}
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
            sociedades={resumoSociedades}
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
                <h2>Partilha diferenciada</h2>
                <p className="subtitulo">
                  Monte a partilha como a família combinou: distribua o percentual de cada
                  bem entre as partes — cada linha preenchida precisa fechar 100%; linha em
                  branco segue a proporção do direito. Embaixo, o total que cada um recebe,
                  a diferença de quinhão (a provisão de torna) e o imposto de transmissão —
                  devido ou isento.
                </p>

                {(!resultado || resultado.bloqueios.length > 0 || participantes.length === 0) && (
                  <p className="mono-alerta">
                    Calcule o espelho no passo 1 (família + bens lançados) para montar a
                    partilha diferenciada.
                  </p>
                )}

                {resultado && resultado.bloqueios.length === 0 && participantes.length > 0 && (
                  <>
                    <Table className="matriz-partilha">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="col-bem">Bem</TableHead>
                          {participantes.map((p) => (
                            <TableHead key={p.id}>{p.nome}</TableHead>
                          ))}
                          <TableHead className="col-total">Σ %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bens.map((b, i) => {
                          const linha = matriz[b.id] ?? {};
                          const total = participantes.reduce((a, p) => a + pctNum(linha[p.id]), 0);
                          const fecha = total === 0 || Math.abs(total - 100) <= 0.05;
                          return (
                            <TableRow key={b.id}>
                              <TableCell className="col-bem" title={b.descricao}>
                                <span className="numero-bem num">{i + 1}.</span>{' '}
                                {descricaoCurta(b.descricao)}
                                <span className="fund num" style={{ display: 'block' }}>
                                  {brl(b.valor)}
                                </span>
                              </TableCell>
                              {participantes.map((p) => (
                                <TableCell key={p.id}>
                                  <Input
                                    className="pct num"
                                    inputMode="decimal"
                                    placeholder="—"
                                    aria-label={`Percentual do bem ${i + 1} para ${p.nome}`}
                                    value={linha[p.id] ?? ''}
                                    onChange={(e) => {
                                      const v = e.target.value.replace(/[^\d.,]/g, '').slice(0, 6);
                                      setMatriz((prev) => ({
                                        ...prev,
                                        [b.id]: { ...(prev[b.id] ?? {}), [p.id]: v },
                                      }));
                                    }}
                                  />
                                </TableCell>
                              ))}
                              <TableCell className={`col-total num ${fecha ? '' : 'nao-fecha'}`}>
                                {total === 0
                                  ? 'direito'
                                  : `${total.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell>Total recebido</TableCell>
                          {participantes.map((p) => {
                            const pos = atribuicao?.posicoes.find((x) => x.titularId === p.id);
                            return (
                              <TableCell key={p.id} className="num">
                                {pos ? brl(pos.valorAtribuido) : '—'}
                              </TableCell>
                            );
                          })}
                          <TableCell />
                        </TableRow>
                        <TableRow>
                          <TableCell>Quinhão de direito</TableCell>
                          {participantes.map((p) => (
                            <TableCell key={p.id} className="num">
                              {brl((direitoPorParticipante[p.id] ?? 0).toFixed(2))}
                            </TableCell>
                          ))}
                          <TableCell />
                        </TableRow>
                        <TableRow>
                          <TableCell>Diferença de quinhão</TableCell>
                          {participantes.map((p) => {
                            const pos = atribuicao?.posicoes.find((x) => x.titularId === p.id);
                            const delta = pos ? Number(pos.delta) : null;
                            return (
                              <TableCell
                                key={p.id}
                                className="num"
                                style={{
                                  color:
                                    delta === null || delta === 0
                                      ? undefined
                                      : delta > 0
                                        ? 'var(--verde-registro)'
                                        : 'var(--lacre)',
                                }}
                              >
                                {pos ? `${Number(pos.delta) > 0 ? '+' : ''}${brl(pos.delta)}` : '—'}
                              </TableCell>
                            );
                          })}
                          <TableCell />
                        </TableRow>
                      </TableFooter>
                    </Table>
                    <p className="fund" style={{ marginTop: 6 }}>
                      Diferença positiva = recebe além do quinhão (provisiona a torna e o
                      imposto da cessão); negativa = deixa de receber (torna a receber).
                    </p>

                    <h2>Se houver diferença, ela é…</h2>
                    <div className="escolha">
                      <Pilula ativo={titulo === 'GRATUITO'} onClick={() => setTitulo('GRATUITO')}>
                        Cedida de graça (doação — ITCMD estadual)
                      </Pilula>
                      <Pilula ativo={titulo === 'ONEROSO'} onClick={() => setTitulo('ONEROSO')}>
                        Compensada em dinheiro (ITBI municipal)
                      </Pilula>
                    </div>

                    {!atribuicao && (
                      <div className="nota" style={{ marginTop: 16 }}>
                        <p>
                          Todas as linhas estão em branco — a partilha segue o espelho, na
                          proporção do direito, sem acerto entre as partes. Distribua os
                          percentuais de um bem para ver o efeito.
                        </p>
                      </div>
                    )}

                    {atribuicao && atribuicao.bloqueios.length === 0 && (
                      <>
                        <h2>Acertos e impostos</h2>
                        {atribuicao.transferencias.map((tr, i) => {
                          const dentroDaIsencao =
                            tr.tributo === 'ITCMD_DOACAO' &&
                            Number(tr.valor) <= 2500 * ufespDoAno(new Date().getFullYear()).valor;
                          return (
                            <div key={i} className={`nota ${dentroDaIsencao ? 'registro' : ''}`}>
                              <span className="eyebrow">
                                {tr.tributo === 'ITCMD_DOACAO'
                                  ? 'Diferença cedida de graça · doação'
                                  : 'Diferença compensada em dinheiro · ITBI municipal'}
                              </span>
                              <h3>
                                {tr.cedenteNome} → {tr.cessionarioNome} ·{' '}
                                <span className="num">{brl(tr.valor)}</span>
                              </h3>
                              <p>
                                {tr.tributo === 'ITCMD_DOACAO'
                                  ? dentroDaIsencao
                                    ? 'Possivelmente ISENTO: doação de até 2.500 UFESPs por donatário no ano (Lei 10.705/2000, art. 6º, II, "a") — conferir outras doações do mesmo doador no exercício.'
                                    : `ITCMD de doação estimado: ${tr.imposto ? brl(tr.imposto) : '—'} (4%). ${tr.observacao ?? ''}`
                                  : 'Guia municipal — alíquota da prefeitura do imóvel.'}
                              </p>
                            </div>
                          );
                        })}
                        {atribuicao.transferencias.length === 0 && (
                          <div className="nota registro">
                            <p>Partilha equilibrada: as atribuições fecham com os direitos, sem acerto.</p>
                          </div>
                        )}
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
              temSobrevivente={temSobrevivente}
              onGerarPeticao={gerarPeticao}
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

        {abaProc === 'honorarios' && (
          <HonorariosView
            familia={familia}
            bens={bens}
            dividas={dividasEspolio}
            resultado={resultado}
            temPartilhaDiferenciada={bens.some((b) =>
              Object.values(matriz[b.id] ?? {}).some((v) => pctNum(v) > 0),
            )}
            condicoes={condicoesHonorarios}
            setCondicoes={setCondicoesHonorarios}
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
      // Mesma numeração da listagem do acervo (a ordem do array é a oficial).
      const patrimonio = bens.map((b, i) => `${i + 1}. ${b.descricao}`).join('; ');
      const linhas: CelulaXlsx[][] = [];
      if (resultado.meacao) {
        linhas.push([
          { tipo: 'texto', valor: `${resultado.meacao.beneficiario} (meação — não é herança)` },
          { tipo: 'texto', valor: `${resultado.meacao.fracao} — sobre: ${patrimonio}` },
          { tipo: 'pct', valor: massa > 0 ? Number(resultado.meacao.valor) / massa : 0 },
          { tipo: 'moeda', valor: Number(resultado.meacao.valor) },
        ]);
      }
      for (const q of resultado.quinhoes) {
        // Fração ideal POR BEM (nos comuns, já descontada a meação) — é a que
        // vai para a escritura; a fração da herança fica como referência.
        const porBem = [
          q.fracaoBemComum ? `${q.fracaoBemComum} de cada bem comum` : '',
          q.fracaoBemParticular ? `${q.fracaoBemParticular} de cada bem particular` : '',
        ]
          .filter(Boolean)
          .join(' e ');
        linhas.push([
          { tipo: 'texto', valor: q.nome },
          {
            tipo: 'texto',
            valor: `${porBem || `fração ideal de ${q.fracaoHeranca}`} (${q.fracaoHeranca} da herança) — sobre: ${patrimonio}`,
          },
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
                <p className="fund">
                  {resultado.meacao.fracao} — não é herança: essa metade de cada bem já é
                  do(a) meeiro(a), e as frações dos herdeiros abaixo incidem sobre a outra
                  metade. {resultado.meacao.fundamento}
                </p>
              </div>
            )}
          </div>

          {/* Relação de bens na MESMA numeração e ordem da listagem do acervo. */}
          <span className="eyebrow">Relação de bens partilhados</span>
          <div className="check" style={{ margin: '6px 0 18px' }}>
            {bens.map((b, i) => (
              <div className="check-item" key={b.id}>
                <span className="prio num">{i + 1}.</span>
                <p style={{ fontSize: 13.5 }}>
                  {b.descricao}
                  <span className="fracao num"> · {brl(b.valor)} · {b.natureza === 'COMUM' ? 'comum' : 'particular'}</span>
                </p>
                <span />
              </div>
            ))}
          </div>

          <div className="espelho">
            <div className="cabeca">
              <span>Herdeiro</span>
              <span>Fração da herança</span>
              <span style={{ textAlign: 'right' }}>Quinhão</span>
            </div>
            {resultado.quinhoes.map((q) => {
              // Fração ideal de CADA BEM (a que vai para a escritura): nos
              // comuns já desconta a meação — 3 filhos + viúva meeira = 1/6.
              const porBem = [
                q.fracaoBemComum ? `${q.fracaoBemComum} de cada bem comum` : '',
                q.fracaoBemParticular ? `${q.fracaoBemParticular} de cada bem particular` : '',
              ]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={q.herdeiroId}>
                  <div className="lanc">
                    <span className="nome">
                      {q.nome}
                      {q.reservaUmQuartoAplicada ? ' · reserva de ¼ aplicada' : ''}
                    </span>
                    <span className="fracao num">{q.fracaoHeranca}</span>
                    <span className="valor num">{brl(q.valor)}</span>
                  </div>
                  {porBem && (
                    <div className="fund num" style={{ fontWeight: 600 }}>
                      Fração ideal por bem: {porBem}
                    </div>
                  )}
                  <div className="fund">
                    {q.fundamento}
                    {q.precedente ? <span className="prec"> · {q.precedente}</span> : null}
                  </div>
                </div>
              );
            })}
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
