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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import './sucessorista.css';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { type TituloCessao } from '@/lib/partilha/atribuicao';
import { montarChecklistAcervo, type StatusItemAcervo } from '@/lib/partilha/acervo';
import type { Caso, Bem, Herdeiro, Resultado } from '@/lib/partilha/types';
import { QUALIFICACAO_VAZIA, PERGUNTAS_ITCMD_VAZIAS, nomeProprio, type DadosFalecido, type Qualificacao } from '@/lib/partilha/familia';
import { analisarIsencoesPorBem, provisionarItcmd, ufespDoAno, type ProvisaoItcmd } from '@/lib/partilha/itcmd';
import { mapearEconomias } from '@/lib/partilha/economia';
import { baseDeEmolumentosDaEscritura, projetarCustos } from '@/lib/partilha/custas';
import { totalCustosManuais, ufsForaDeSp } from '@/lib/partilha/custos-manuais';
import { QualificacaoConta } from '@/components/qualificacao-conta';
import { pendenciasDaMinuta } from '@/lib/partilha/pendencias';
import { aplicarColacoes, type Colacao } from '@/lib/partilha/colacao';
import { conferirQualificacoes, type PessoaConferencia } from '@/lib/partilha/conferencia';
import { anteciparQualificacaoRegistral, ehImovelDeRegistro } from '@/lib/partilha/antecipador';
import { fundirImoveisPorInscricao } from '@/lib/partilha/imoveis';
import { nomeConstaEm, semQualificadoresDeNome } from '@/lib/partilha/nomes';
import { faixaDoPrazo, rotuloDoPrazo } from '@/lib/partilha/prazo';
import {
  avaliarQuotas,
  chaveSociedade,
  mesclarSociedade,
  type SociedadeExtraida,
} from '@/lib/partilha/sociedade';
import type { ConviteHerdeiro, QualificacaoHerdeiro } from '@/lib/portal/store';
import type { CasoExtraido } from '@/lib/gemini-sucessorista';
import { gerarXlsx, baixarBlob, type CelulaXlsx } from '@/lib/partilha/xlsx';

import { porteDoAcervo } from '@/lib/porte';
import { registrarCaso, registrarDocumentoGerado } from './actions';
import { CasoView, type ArquivoClassificado } from './caso-view';
import { FasesCaso } from './fases-caso';
import { TarefasCaso, type TarefaCaso } from './tarefas-caso';
import { intakeParaCaso } from '@/lib/familias/intake-para-caso';
import { confirmarImportacaoIntake, resgatarIntake } from './familias-actions';
import { FamiliaView, Pilula, type EstadoFamilia } from './familia';
import { AcervoView, paraDecimal } from './acervo-view';
import { CofreView } from './cofre';
import { DocumentosView, type AnexosProcesso } from './documentos';
import { ItcmdView, ESTADO_FISCAL_INICIAL, type EstadoFiscal, type SucessaoCumulada } from './itcmd-view';
import { EconomiaView } from './economia-view';
import { CustosView } from './custos-view';
import { somaAdicionais, type DespesaAdicional } from '@/lib/partilha/orcamento';
import {
  FiscalView,
  ESTADO_MODULOS_FISCAIS_INICIAL,
  type EstadoModulosFiscais,
} from './fiscal-view';
import { SobrepartilhaView } from './sobrepartilha-view';
import { CasosView, type EstadoPainel } from './casos-view';
import { DriveCaseStore, TokenDrivePool } from '@/lib/partilha/store-drive';
import { desconectarDrive, estadoDrive, tokenDrive, type EstadoDrive } from './drive-actions';
import { OneDriveCaseStore } from '@/lib/partilha/store-onedrive';
import { desconectarOneDrive, estadoOneDrive, tokenOneDrive, type EstadoOneDrive } from './onedrive-actions';
import { DropboxCaseStore } from '@/lib/partilha/store-dropbox';
import { desconectarDropbox, estadoDropbox, tokenDropbox, type EstadoDropbox } from './dropbox-actions';
import { GraficoQuinhoes } from './grafico-quinhoes';
import { FerramentasView } from './ferramentas-view';
import { FontesView } from './fontes-view';
import {
  migrarArquivoCaso,
  montarArquivoCaso,
  type ArquivoCaso,
  type CabecalhoCaso,
  type CaseStore,
  type ConflitoSalvamento,
  type ResumoCaso,
} from '@/lib/partilha/caso-store';
import {
  abrirCasoNuvem,
  listarCasosNuvem,
  removerCasoNuvem,
  salvarCasoNuvem,
  type CabecalhoNuvem,
} from './nuvem-actions';
import { casarManifesto, resumoDoDiff, type EntradaManifesto, type InfoArquivoDisco } from '@/lib/partilha/manifesto';
import { sha256DeBlob } from '@/lib/partilha/sha256';
import { PortableCaseStore } from '@/lib/partilha/store-portatil';
import {
  FolderCaseStore,
  cacheDeResumos,
  definirContaAtiva,
  dispositivoSalvo,
  escolherRaiz,
  estadoDaRaiz,
  pastaDisponivel,
  pedirPermissao,
  salvarDispositivo,
} from '@/lib/partilha/store-pasta';
import { idbGet, idbPut, STORES } from '@/lib/partilha/idb';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { HonorariosView } from './honorarios-view';
import { MatriculaView } from './matricula-view';
import { MinutasView, EscrituraView } from './minutas-view';
import { CONDICOES_INICIAIS, type CondicoesHonorarios } from '@/lib/partilha/honorarios';
import { carregarRascunho, limparRascunho } from '@/lib/partilha/rascunho';
import type { SecaoRedigida } from '@/lib/partilha/honorarios-docx';
import type {
  DadosEscritura,
  ModalidadeEscritura,
  PagamentoDiferenciado,
  SucessaoEscritura,
} from '@/lib/partilha/escritura';
import { toast } from 'sonner';
import { PainelCaso } from './painel-caso';
import { Doutrina } from './doutrina';
import { Espelho, FundEspelho, LinhaEspelho } from './espelho-tabela';
import {
  apurarCenario,
  direitosDoResultado,
  ehFracao,
  fracaoBonita,
  mmc,
  participantesDoResultado,
  pctNum,
  resumoDoCenario,
  temAlocacao,
  type DespesaAdiantada,
} from '@/lib/partilha/cenario';
import { montarCenarioCompartilhado } from '@/lib/portal/espolio';
import { fatosDoEspolio, salvarCenario } from './painel-actions';
import {
  PainelFamiliaCard,
  PAINEL_FAMILIA_INICIAL,
  type EstadoPainelFamilia,
} from './painel-familia-card';

/* ---------- helpers ---------- */

const brl = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

/** Percentual da massa partilhável no espelho da partilha (1 casa). */
const pctFmtEspelho = (valor: string, massa: string): string => {
  const m = Number(massa);
  if (!(m > 0)) return '—';
  return `${((Number(valor) / m) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
};

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
  origem: Partial<Record<keyof Qualificacao, string | boolean | null>> | null | undefined,
): Qualificacao {
  if (!origem) return destino;
  const ficha = { ...destino };
  // Só os campos de TEXTO da ficha (QUALIFICACAO_VAZIA não traz o boolean
  // uniaoEstavel — ele nunca é sobrescrito pela mesclagem).
  for (const campo of Object.keys(QUALIFICACAO_VAZIA) as (keyof Qualificacao)[]) {
    const v = origem[campo];
    if (typeof v === 'string' && v && !ficha[campo])
      (ficha as unknown as Record<string, string>)[campo] = v;
  }
  return ficha;
}

/** Descrição enxuta do bem para a matriz (o título completo fica no title). */
const descricaoCurta = (s: string): string =>
  s.length > 64 ? `${s.slice(0, 61).trimEnd()}…` : s;

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Dias corridos desde uma data ISO — a contagem do relógio do art. 611. */
const diasDesdeObito = (iso: string): number =>
  Math.round((new Date(`${hojeIso()}T00:00`).getTime() - new Date(`${iso}T00:00`).getTime()) / 86_400_000);

const FALECIDO_VAZIO: DadosFalecido = {
  nome: '',
  cpf: '',
  dataObito: '',
  dataCasamento: '',
  ultimoDomicilio: '',
};

type Aba =
  | 'caso'
  | 'familia'
  | 'acervo'
  | 'partilha'
  | 'documentos'
  | 'itcmd'
  | 'custos'
  | 'honorarios'
  | 'minutas'
  | 'escritura'
  | 'matricula'
  | 'fontes'
  | 'fiscal'
  | 'ferramentas';

const ABAS: readonly Aba[] = [
  'caso',
  'familia',
  'acervo',
  'partilha',
  'documentos',
  'itcmd',
  'custos',
  'honorarios',
  'minutas',
  'escritura',
  'matricula',
  'fontes',
  'fiscal',
  // Agrupador das três ferramentas acima (a lombada mostra SÓ este item;
  // os ids individuais seguem válidos para URL/F5).
  'ferramentas',
];

// Valida contra a lista fechada, com default explícito (convenção de query string).
const abaValida = (v: string | null): Aba =>
  (ABAS as readonly string[]).includes(v ?? '') ? (v as Aba) : 'caso';

/** Snapshot do caso no sessionStorage: sobrevive ao F5, morre com a aba do
 *  navegador. Arquivos (anexos do processo) não são serializáveis — só eles
 *  precisam ser anexados de novo após recarregar. */
const CHAVE_CASO = 'sucessorista-caso';

/** Perfil de uso do módulo — muda as minutas da montagem do processo. */
export type Perfil = 'ADVOGADO' | 'ESCREVENTE';
const CHAVE_PERFIL = 'sucessorista-perfil';

/** Tema do módulo (claro = identidade papel; escuro = mesma paleta invertida). */
export type TemaSucessorista = 'claro' | 'escuro';
const CHAVE_TEMA = 'sucessorista-tema';
/** Painel do caso RECOLHIDO para a margem direita (preferência do navegador). */
const CHAVE_PAINEL_RECOLHIDO = 'sucessorista-painel-recolhido';

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
  /** Rótulos da matriz (ex.: "usufruto vitalício") — marcam o redesenho por
   *  usufruto × nua-propriedade, que muda os atos de registro (1/3 + 2/3). */
  anotacoesMatriz?: Record<string, Record<string, string>>;
  titulo: TituloCessao;
  /** Condições de honorários do caso (o perfil do escritório é do navegador). */
  honorarios?: CondicoesHonorarios;
  casoId: string;
  convites: Record<string, ConviteHerdeiro>;
  /** Módulos fiscais e pré-inventário (radar, alvará, declaração, ganho). */
  modulosFiscais?: EstadoModulosFiscais;
  /** Sobrepartilha aberta (bens de fora marcados no próprio array de bens). */
  sobrepartilhaAberta?: boolean;
  /** Bloco de notas do painel do caso (anotações livres do profissional). */
  notas?: string;
  /** Bens levados à colação (CC 2.002) — abatem na partilha. */
  colacoes?: Colacao[];
  /** Custos adicionais lançados à mão na aba V (retrocompatível). */
  custosAdicionais?: DespesaAdicional[];
  /** Painel do Cliente — config do espelho publicado (fase, visibilidades). */
  painelFamilia?: EstadoPainelFamilia;
  /** Coluna "Responsável" da aba Documentos (docId → quem entrega). */
  responsaveisDocs?: Record<string, string>;
  /** Fila de TAREFAS do caso (LexCausa fase 2) — viaja no caso.json. */
  tarefas?: TarefaCaso[];
}

export default function SucessoristaClient({
  licoesRenomeador = null,
  menu,
  shell = null,
  perfilConta = null,
  ehMaster = false,
  equipe = null,
  contaId = null,
  nomeConta = null,
  casoInicialId = null,
  etapaInicial = null,
  radarAtivo = false,
}: {
  /** Regras + correções do renomeador da conta — o cofre embute a ferramenta
   *  completa e ela abre com as lições do escritório já carregadas. */
  licoesRenomeador?: import('@/lib/lessons').LessonsState | null;
  /** Faixa de sessão (nome, papel, Administração, Sair). Vem pronta de um
   *  server component — este arquivo é client e não pode chamar auth(). */
  menu?: React.ReactNode;
  /** Barra LexCausa (topbar) — renderizada SÓ fora da folha do caso (painel
   *  Meus casos e telas de espera): dentro do caso a lombada é o shell. */
  shell?: React.ReactNode;
  /** Perfil VINCULADO À CONTA (banco): null = primeiro acesso, ainda não
   *  escolhido — o módulo abre a escolha obrigatória. */
  perfilConta?: Perfil | null;
  /** MASTER circula pelos dois perfis (alternador na lombada); conta comum
   *  fica travada no perfil escolhido no primeiro acesso. */
  ehMaster?: boolean;
  /** Equipe da conta (card "Minha equipe" do dashboard) — null sem equipe. */
  equipe?: import('./equipe-actions').InfoEquipe | null;
  /** Id do usuário logado — escopa a pasta-raiz e o cache POR CONTA. */
  contaId?: string | null;
  /** Nome da conta (sessão) — cabeçalho do Painel da família. */
  nomeConta?: string | null;
  /** Rota /caso/<id>/<etapa> (T1): o caso a abrir ao montar — F5, favorito
   *  e link colado entre membros da equipe voltam ao caso certo. */
  casoInicialId?: string | null;
  etapaInicial?: string | null;
  /** Radar de famílias ligado neste deploy (env) — mostra o atalho /radar
   *  no painel Meus casos para o perfil Advogado(a). */
  radarAtivo?: boolean;
}) {
  // A etapa e o CASO vivem na URL (/caso/<id>/<etapa>; ?etapa= segue como
  // compatibilidade): sobrevivem ao F5 e o recorte é compartilhável. A troca
  // usa history.replaceState — atualização rasa, sem round-trip ao servidor.
  const searchParams = useSearchParams();
  const [abaProc, setAbaProc] = useState<Aba>(() =>
    abaValida(etapaInicial ?? searchParams.get('etapa')),
  );

  // Celular: o painel do caso vira uma GAVETA sobre a folha (botão
  // flutuante abre/fecha). Em tela larga o estado é inócuo — o painel é a
  // coluna fixa de sempre e o botão nem aparece (CSS).
  const [painelAberto, setPainelAberto] = useState(false);
  /* Desktop: painel do caso recolhido numa tira na margem direita — a
     setinha recolhe/reabre; a preferência fica no navegador e é restaurada
     no efeito diferido (não quebra a hidratação). */
  // FECHADO por padrão (V3 da auditoria): a barra de status no topo da
  // folha mantém os números à vista; quem abrir o painel fica com ele.
  const [painelRecolhido, setPainelRecolhido] = useState(true);

  const irPara = (aba: Aba) => {
    setAbaProc(aba);
    setPainelAberto(false);
    // A URL é gravada pelo efeito de rota (/caso/<id>/<etapa>) — aqui só a
    // rolagem: cada aba é uma "página" nova da folha, começa no topo.
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
    herdeirosDeclarados: [],
  });
  const { falecido, temSobrevivente, vinculo, regime, nomeSobrev, herdeiros } = familia;

  /* --- II: acervo (bens, dívidas, fontes de pesquisa) --- */
  const [bens, setBens] = useState<Bem[]>([]);
  /** Dívidas e despesas do espólio (R$) — abatem a massa antes da partilha. */
  const [dividasEspolio, setDividasEspolio] = useState('');
  /** Bens levados à COLAÇÃO (CC 2.002): doações em vida que abatem o quinhão. */
  const [colacoes, setColacoes] = useState<Colacao[]>([]);
  // Custos ADICIONAIS lançados à mão na aba V — persistem no caso.
  const [custosAdicionais, setCustosAdicionais] = useState<DespesaAdicional[]>([]);
  /** Bloco de notas do painel do caso — anotações livres, salvas no caso. */
  const [notasCaso, setNotasCaso] = useState('');
  const [checklistAcervo, setChecklistAcervo] = useState(montarChecklistAcervo());
  /** Sociedades lidas do contrato social/balanço, mescladas por empresa. */
  const [sociedades, setSociedades] = useState<Record<string, SociedadeExtraida>>({});

  /* --- III: partilha (2 passos: espelho · diferenciada) --- */
  const [passo, setPasso] = useState(1);

  /* --- IV: documentos (ambiente + convites do cofre) --- */
  const [anexosProcesso, setAnexosProcesso] = useState<AnexosProcesso>({});
  const [casoId, setCasoId] = useState(() => uid('caso') + Date.now().toString(36));
  const [convites, setConvites] = useState<Record<string, ConviteHerdeiro>>({});
  /* Painel do Cliente: config do espelho publicado (fase, visibilidades). */
  const [painelFamilia, setPainelFamilia] = useState<EstadoPainelFamilia>(PAINEL_FAMILIA_INICIAL);
  /* Coluna "Responsável" por item do catálogo de documentos. */
  const [responsaveisDocs, setResponsaveisDocs] = useState<Record<string, string>>({});
  const [tarefasCaso, setTarefasCaso] = useState<TarefaCaso[]>([]);
  /* Despesas adiantadas RECONHECIDAS (Espaço do Espólio) — entram nas
     linhas dos cenários de partilha (ressarcir × compensar). */
  const [despesasCenario, setDespesasCenario] = useState<DespesaAdiantada[]>([]);
  /* Propor a atribuição atual como CENÁRIO para a família (Etapa 4). */
  const [proporAberto, setProporAberto] = useState(false);
  const [tituloCenario, setTituloCenario] = useState('');
  const [descricaoCenario, setDescricaoCenario] = useState('');
  const [enviandoCenario, setEnviandoCenario] = useState(false);

  /* --- V: estado fiscal (isenções, reforma, protocolo) — alimenta o painel --- */
  const [fiscal, setFiscal] = useState<EstadoFiscal>(ESTADO_FISCAL_INICIAL);

  /* --- XI: módulos fiscais e pré-inventário (radar, alvará, DF, ganho) --- */
  const [modulosFiscais, setModulosFiscais] = useState<EstadoModulosFiscais>(
    ESTADO_MODULOS_FISCAIS_INICIAL,
  );
  /* --- sobrepartilha (CPC 669/670): bens de fora, partilha suplementar --- */
  const [sobrepartilhaAberta, setSobrepartilhaAberta] = useState(false);

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
      // Bem EXCLUSIVO de sucessão cumulada e bem de SOBREPARTILHA não entram
      // no rol do inventário principal — cada um é partilhado à parte.
      bens: bens.filter(
        (b) => !b.sobrepartilha && (!b.sucessaoExclusiva || b.sucessaoExclusiva === 'PRINCIPAL'),
      ),
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

  /**
   * Isenções do art. 6º aplicadas AUTOMATICAMENTE pela leitura do acervo:
   * bem possivelmente isento entra abatendo a base na hora — o advogado só
   * desmarca quando a condição de fato não se confirma (isencoesRecusadas).
   */
  const isencoes = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0 || !ufespObito) return null;
    // Óbito ANTERIOR à Lei 10.705/2000: as isenções do art. 6º não existem
    // no regime da Lei 9.591/66 (Súmula 112/STF — vale a lei do óbito).
    if (falecido.dataObito && falecido.dataObito < '2001-01-01') {
      return {
        valorIsento: 0,
        detalhes: [],
        avisos: [
          'Óbito anterior a 01/01/2001 (regime da Lei 9.591/66): as isenções do art. 6º da Lei 10.705/2000 NÃO se aplicam — nenhum bem foi abatido da base.',
        ],
      };
    }
    // Ficha do item I: as respostas "possui outro imóvel?" dos herdeiros
    // decidem automaticamente o requisito da alínea "a" do art. 6º, I.
    let respostasOutroImovel = 0;
    let algumComOutroImovel = false;
    for (const h of herdeiros) {
      const p = familia.perguntas[h.id];
      if (p?.possuiOutroImovel === true) {
        respostasOutroImovel += 1;
        algumComOutroImovel = true;
      } else if (p?.possuiOutroImovel === false) {
        respostasOutroImovel += 1;
      }
    }
    const analise = analisarIsencoesPorBem(
      bens.map((b) => ({ tipo: b.tipo, valor: Number(b.valor), descricao: b.descricao, codigoItcmd: b.codigoItcmd })),
      ufespObito.valor,
      {
        herdeiros: herdeiros.length,
        respostasOutroImovel,
        algumComOutroImovel,
        nenhumComOutroImovel:
          herdeiros.length > 0 &&
          respostasOutroImovel === herdeiros.length &&
          !algumComOutroImovel,
      },
    );
    const recusadas = new Set(fiscal.isencoesRecusadas ?? []);
    let valorIsento = 0;
    const detalhes: string[] = [];
    const avisos: string[] = [];
    analise.forEach((a, i) => {
      const bem = bens[i];
      if (a.verdito !== 'ISENTO_POSSIVEL' || !bem) return;
      if (recusadas.has(bem.id)) {
        avisos.push(`Bem ${a.indice}: isenção (${a.hipotese}) recusada pelo advogado — tributado.`);
        return;
      }
      valorIsento += a.valor;
      detalhes.push(`Bem ${a.indice} isento (${a.hipotese}) — ${brl(a.valor.toFixed(2))} abatido da base.`);
    });
    return { valorIsento, detalhes, avisos };
  }, [resultado, ufespObito, bens, herdeiros, familia.perguntas, fiscal.isencoesRecusadas, falecido.dataObito]);

  /**
   * Relógio do ITCMD: com o imposto DECLARADO/PAGO e a data informada (aba
   * IV), os encargos são projetados ATÉ ESSA DATA — o prazo para de correr.
   */
  /**
   * CASO FORA DE SP — o modo manual (aba V) SILENCIA os motores calibrados:
   * a provisão do ITCMD, a projeção de custas e as sucessões cumuladas
   * devolvem vazio, e os valores informados pelo profissional assumem o
   * painel, o cabeçalho e o orçamento. Provisão de outro estado com a lei de
   * SP seria número errado com cara de certo (decisão do escritório).
   */
  const manuais = fiscal.custosManuais?.ativo ? fiscal.custosManuais : null;
  const totalManual = totalCustosManuais(manuais);
  /** UFs fora de SP detectadas no caso (melhor-esforço) — só AVISA, nunca liga sozinho. */
  const ufsFora = useMemo(
    () =>
      ufsForaDeSp({
        ultimoDomicilio: falecido.ultimoDomicilio,
        registrosImoveis: bens.map((b) => b.imovel?.registroImoveis),
      }),
    [falecido.ultimoDomicilio, bens],
  );

  const referenciaItcmd = useMemo(() => {
    const marco =
      (fiscal.itcmdSituacao === 'DECLARADO' || fiscal.itcmdSituacao === 'PAGO') &&
      fiscal.itcmdQuitadoEm
        ? fiscal.itcmdQuitadoEm
        : null;
    return marco && marco < hoje ? marco : hoje;
  }, [fiscal.itcmdSituacao, fiscal.itcmdQuitadoEm, hoje]);

  const provisao = useMemo(() => {
    // Modo manual (fora de SP): o motor da Lei 10.705/2000 fica mudo.
    if (fiscal.custosManuais?.ativo) return null;
    if (!falecido.dataObito || !resultado || resultado.bloqueios.length > 0) return null;
    const herancaBruta = Number(resultado.heranca.total);
    // ITCMD pelo MAIOR entre o venal na data do óbito (bem.valor, que monta
    // o espelho) e o valor de AVALIAÇÃO — apurado bem a bem e aplicado como
    // fator de escala sobre a herança (mesmo desenho do Enunciado 7 nas
    // custas; o venal do exercício corrente NÃO entra no imposto).
    const somaObito = bens.reduce((a, b) => a + Math.max(0, Number(b.valor) || 0), 0);
    const somaMaior = bens.reduce(
      (a, b) =>
        a + Math.max(Math.max(0, Number(b.valor) || 0), Number(b.valorAvaliacao) || 0),
      0,
    );
    const fatorAvaliacao = somaObito > 0 && somaMaior > somaObito ? somaMaior / somaObito : 1;
    const baseLiquida = Math.max(
      0,
      herancaBruta * fatorAvaliacao - (isencoes?.valorIsento ?? 0),
    );
    const fator = herancaBruta > 0 ? baseLiquida / herancaBruta : 0;
    return provisionarItcmd({
      dataObito: falecido.dataObito,
      dataReferencia: referenciaItcmd,
      baseCalculo: baseLiquida,
      dataProtocolo: fiscal.inventarioAberto && fiscal.dataProtocolo ? fiscal.dataProtocolo : null,
      quinhoes: resultado.quinhoes.map((q) => ({ nome: q.nome, valor: Number(q.valor) * fator })),
      faixasProgressivas: fiscal.faixas,
      vigenciaProgressiva: fiscal.vigencia,
    });
  }, [falecido.dataObito, resultado, bens, referenciaItcmd, isencoes, fiscal]);

  /* --- passo 2 da partilha: matriz bem × participante (% de cada bem) --- */
  const [matriz, setMatriz] = useState<Record<string, Record<string, string>>>({});
  const [titulo, setTitulo] = useState<TituloCessao>('GRATUITO');
  /* Rótulos pequenos sob cada célula da matriz (ex.: "usufruto vitalício",
     "50% da nua-propriedade") — hint efêmero preenchido pelo redesenho do
     usufruto; some ao editar a célula ou limpar a matriz. */
  const [anotacoesMatriz, setAnotacoesMatriz] = useState<Record<string, Record<string, string>>>({});
  /* Modo de digitação da matriz: percentual ("33,33") × fração ("1/3") — a
     fração é exata e não fabrica torna de dízima. Alternar CONVERTE as
     células preenchidas (33,33 ⇆ 1/3) sem mexer no que não casa limpo. */
  const [matrizEmFracao, setMatrizEmFracao] = useState(false);
  const alternarModoMatriz = (fracao: boolean) => {
    setMatrizEmFracao(fracao);
    setMatriz((prev) => {
      const nova: typeof prev = {};
      for (const [bemId, linha] of Object.entries(prev)) {
        const l: Record<string, string> = {};
        for (const [pid, v] of Object.entries(linha)) {
          if (!v) continue;
          l[pid] = fracao
            ? ehFracao(v)
              ? v
              : (fracaoBonita(pctNum(v)) ?? v)
            : ehFracao(v)
              ? pctNum(v).toFixed(2).replace('.', ',')
              : v;
        }
        nova[bemId] = l;
      }
      return nova;
    });
  };

  /* --- VI: honorários do caso (perfil do escritório fica na própria view) --- */
  const [condicoesHonorarios, setCondicoesHonorarios] =
    useState<CondicoesHonorarios>(CONDICOES_INICIAIS);

  /* --- perfil de uso (vinculado à CONTA) + tema + rascunho local --- */
  // O perfil vem do banco (users.perfilSucessorista): a conta comum escolhe
  // UMA vez no primeiro acesso e fica travada nele; só MASTER alterna.
  const [perfil, setPerfil] = useState<Perfil>(perfilConta ?? 'ADVOGADO');
  const [escolhendoPerfil, setEscolhendoPerfil] = useState(false);
  const [tema, setTema] = useState<TemaSucessorista>('claro');
  const [rascunhoSalvoEm, setRascunhoSalvoEm] = useState<string | null>(null);

  /* --- persistência local: CaseStore (pasta do processo ou portátil) --- */
  const [estadoPainel, setEstadoPainel] = useState<EstadoPainel>('carregando');
  const estadoPainelRef = useRef<EstadoPainel>('carregando');
  useEffect(() => {
    estadoPainelRef.current = estadoPainel;
  }, [estadoPainel]);
  const [store, setStore] = useState<CaseStore | null>(null);
  const [resumos, setResumos] = useState<ResumoCaso[] | null>(null);
  /* --- nuvem de casos: espelho do caso.json no servidor ---
     SEMPRE ativa: a nuvem da CONTA cobre qualquer usuário logado (é o que
     faz o login puxar os casos em outro computador); chefe/membro com
     acesso usam a da EQUIPE — o servidor decide o escopo, o client não
     sabe qual é. Os documentos nunca sobem — só a folha (fronteira). */
  const nuvemAtiva = true;
  const [resumosNuvem, setResumosNuvem] = useState<CabecalhoNuvem[]>([]);
  /** true = o caso aberto veio da nuvem (não existe no store local): salva na nuvem. */
  const origemNuvemRef = useRef(false);
  /** Guarda de conflito da nuvem: atualizadoEm de quando o caso foi aberto lá. */
  const baseNuvemRef = useRef<string | null>(null);
  /** Dedupe do aviso "espelho ficou para trás" (um por caso aberto). */
  const avisoNuvemRef = useRef(false);
  const [dispositivo, setDispositivo] = useState('');
  /** Nome da pasta-raiz ativa — mostrado no seletor do painel Meus Casos. */
  const [nomeRaiz, setNomeRaiz] = useState('');
  /** Google Drive conectado (modo drive): estado vindo do servidor. */
  const [drive, setDrive] = useState<EstadoDrive | null>(null);
  /** OneDrive conectado (modo onedrive): estado vindo do servidor. */
  const [oneDrive, setOneDrive] = useState<EstadoOneDrive | null>(null);
  /** Dropbox conectado (modo dropbox): estado vindo do servidor. */
  const [dropbox, setDropbox] = useState<EstadoDropbox | null>(null);
  /** Link da pasta-raiz no SITE da nuvem de arquivos (abrir no navegador). */
  const [linkNuvem, setLinkNuvem] = useState<string | null>(null);
  /** Anexos já enviados à nuvem de arquivos nesta sessão (não reenviar). */
  const enviadosDriveRef = useRef(new WeakSet<File>());
  const [temRascunhoLegado, setTemRascunhoLegado] = useState(false);
  const [casoAberto, setCasoAberto] = useState<{ cabecalho: CabecalhoCaso } | null>(null);
  const [salvamento, setSalvamento] = useState<{
    estado: 'ocioso' | 'salvando' | 'salvo' | 'erro' | 'somente-leitura';
    quando?: string;
    erro?: string;
  }>({ estado: 'ocioso' });
  const [conflito, setConflito] = useState<ConflitoSalvamento | null>(null);
  const storeRef = useRef<CaseStore | null>(null);
  const casoAbertoRef = useRef<{ cabecalho: CabecalhoCaso } | null>(null);
  const baseAtualizadoEmRef = useRef<string | null>(null);
  const manifestoRef = useRef<EntradaManifesto[]>([]);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);
  useEffect(() => {
    casoAbertoRef.current = casoAberto;
  }, [casoAberto]);

  /** Chegada por /caso/<id> ainda em restauração: segura a URL e mostra a
   *  tela "reabrindo" no lugar do painel Meus casos — um F5 no meio da
   *  restauração NÃO pode regredir para a lista. */
  const [restaurandoCaso, setRestaurandoCaso] = useState(() => Boolean(casoInicialId));
  const restaurandoCasoRef = useRef(restaurandoCaso);
  useEffect(() => {
    restaurandoCasoRef.current = restaurandoCaso;
  }, [restaurandoCaso]);

  /* A IDENTIDADE do caso vive no caminho (T1): /caso/<id>/<etapa> — F5,
     favorito e link colado restauram caso E etapa. Sem caso aberto, a URL
     volta a /s, a casa do módulo desde a remodelagem LexCausa (o ?etapa=
     antigo segue aceito na chegada) — mas NUNCA durante a restauração:
     apagar /caso/<id> antes de o caso abrir fazia o F5 seguinte cair em
     Meus casos. */
  useEffect(() => {
    const id = casoAberto?.cabecalho.caseId;
    if (id) {
      window.history.replaceState(null, '', `/caso/${encodeURIComponent(id)}/${abaProc}`);
    } else if (!restaurandoCasoRef.current && window.location.pathname.startsWith('/caso/')) {
      window.history.replaceState(null, '', '/s');
    }
  }, [casoAberto, abaProc]);

  /** Rota apontou um caso que não existe/não abriu: tela própria, nunca um
   *  redirecionamento silencioso para a lista. */
  const [casoNaoEncontrado, setCasoNaoEncontrado] = useState(false);

  /* --- telemetria (privacidade: nada de nome, CPF ou valor absoluto) --- */

  // A apuração da partilha diferenciada é calculada mais abaixo; o ref evita
  // depender da ordem de declaração dentro do componente.
  const atribuicaoRef = useRef<{ transferencias: unknown[] } | null>(null);

  /** Registra o documento gerado — o desfecho que vale para o escritório. */
  const registrarDoc = useCallback(
    (documento: string, extras?: { comIa?: boolean; comInstrucoes?: boolean; modalidade?: string | null; itens?: number }) => {
      void registrarDocumentoGerado({ casoId, perfil, documento, ...extras });
    },
    [casoId, perfil],
  );

  /**
   * Retrato estrutural do caso: o motor recalcula a cada tecla, então o envio
   * é DEBOUNCED e a action faz upsert por casoId — uma linha por inventário
   * com o estado mais recente, em vez de um evento por digitação.
   */
  useEffect(() => {
    if (!resultado || resultado.bloqueios.length > 0) return;
    const t = setTimeout(() => {
      void registrarCaso({
        casoId,
        perfil,
        herdeiros: herdeiros.length,
        bens: bens.length,
        tiposBem: bens.map((b) => b.tipo ?? 'OUTRO'),
        regime: temSobrevivente ? regime : null,
        vinculo: temSobrevivente ? vinculo : null,
        temSobrevivente,
        incapazes: herdeiros.filter((h) => h.menorOuIncapaz).length,
        extrajudicial: resultado.elegivelExtrajudicial,
        // Só a FAIXA de porte: o valor do acervo nunca sai do navegador.
        porte: porteDoAcervo(Number(resultado.acervo.massaPartilhavel)),
        bloqueios: resultado.bloqueios.length,
        divergencias: resultado.divergencias.length,
        temasDivergencia: resultado.divergencias.map((d) => d.tema),
        diferenciada: Object.keys(matriz).length > 0,
        torna: (atribuicaoRef.current?.transferencias.length ?? 0) > 0,
        isencoes: isencoes?.detalhes.length ?? 0,
        parcelasItcmd: (provisao?.parcelas ?? []).map((p) => p.id),
        progressivo: Boolean(provisao && falecido.dataObito >= fiscal.vigencia),
      });
      // 15s: o retrato não precisa ser em tempo real, e a folha é editada
      // continuamente — janela curta viraria uma gravação a cada pausa.
    }, 15_000);
    return () => clearTimeout(t);
  }, [
    casoId,
    perfil,
    resultado,
    herdeiros,
    bens,
    regime,
    vinculo,
    temSobrevivente,
    matriz,
    isencoes,
    provisao,
    falecido.dataObito,
    fiscal.vigencia,
  ]);

  /* --- persistência no sessionStorage: F5 não apaga a folha --- */

  // Restaura UMA vez, antes de qualquer gravação — o efeito de salvar espera
  // a flag (sem ela, gravaria o estado vazio por cima do snapshot). O apply é
  // diferido (setTimeout 0): evita setState síncrono em efeito (regra do
  // lint) e garante que a flag só liga DEPOIS de o snapshot ser aplicado.
  const restauradoRef = useRef(false);

  /** Aplica um snapshot (rascunho do IndexedDB, sessionStorage legado ou
   *  Arquivo do caso importado) na folha inteira — campo a campo, tolerante
   *  a versões anteriores do formato. */
  const aplicarSnapshot = (salvo: CasoSalvo) => {
    if (salvo?.v !== 1) return;
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
    if (salvo.sociedades && typeof salvo.sociedades === 'object') setSociedades(salvo.sociedades);
    if (salvo.fiscal) setFiscal(salvo.fiscal);
    if (Number.isInteger(salvo.passo) && salvo.passo >= 1) setPasso(salvo.passo);
    if (salvo.anotacoesMatriz && typeof salvo.anotacoesMatriz === 'object')
      setAnotacoesMatriz(salvo.anotacoesMatriz);
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
    if (salvo.modulosFiscais && typeof salvo.modulosFiscais === 'object')
      setModulosFiscais(salvo.modulosFiscais);
    if (typeof salvo.sobrepartilhaAberta === 'boolean') setSobrepartilhaAberta(salvo.sobrepartilhaAberta);
    if (typeof salvo.notas === 'string') setNotasCaso(salvo.notas);
    if (Array.isArray(salvo.colacoes)) setColacoes(salvo.colacoes);
    if (Array.isArray(salvo.custosAdicionais)) setCustosAdicionais(salvo.custosAdicionais);
    setPainelFamilia(
      salvo.painelFamilia && typeof salvo.painelFamilia === 'object'
        ? { ...PAINEL_FAMILIA_INICIAL, ...salvo.painelFamilia }
        : PAINEL_FAMILIA_INICIAL,
    );
    setResponsaveisDocs(
      salvo.responsaveisDocs && typeof salvo.responsaveisDocs === 'object'
        ? salvo.responsaveisDocs
        : {},
    );
    setTarefasCaso(Array.isArray(salvo.tarefas) ? salvo.tarefas : []);
  };

  const montarSnapshot = (): CasoSalvo => {
    const statusAcervo: Record<string, StatusItemAcervo> = {};
    for (const item of checklistAcervo) statusAcervo[item.fonte.id] = item.status;
    return {
      v: 1,
      familia,
      bens,
      dividasEspolio,
      statusAcervo,
      sociedades,
      fiscal,
      passo,
      atribuicoesPct: matriz,
      anotacoesMatriz,
      titulo,
      honorarios: condicoesHonorarios,
      casoId,
      convites,
      modulosFiscais,
      sobrepartilhaAberta,
      notas: notasCaso,
      colacoes,
      custosAdicionais,
      painelFamilia,
      responsaveisDocs,
      tarefas: tarefasCaso,
    };
  };

  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        try {
          // Perfil agora é da CONTA (banco, via prop) — a chave antiga do
          // navegador só vale como transição para quem ainda não escolheu.
          if (perfilConta === null) {
            const p = localStorage.getItem(CHAVE_PERFIL);
            if (p === 'ADVOGADO' || p === 'ESCREVENTE') setPerfil(p);
          }
          const t = localStorage.getItem(CHAVE_TEMA);
          if (t === 'claro' || t === 'escuro') setTema(t);
          if (localStorage.getItem(CHAVE_PAINEL_RECOLHIDO) === '0') setPainelRecolhido(false);
        } catch {
          // modo restrito
        }
        restauradoRef.current = true;

        /* painel "Meus casos": decide o modo de persistência e pinta do
           cache antes da varredura (nunca tela vazia esperando I/O). A
           pasta-raiz é POR CONTA: o escopo entra antes de qualquer leitura.
           TODA chamada abaixo tem fallback próprio: uma falha isolada
           (IndexedDB em modo restrito, server action fora do ar, permissão
           negada) não pode matar o efeito antes do setEstadoPainel — foi o
           que congelava o painel no "carregando" sem erro visível. */
        let nomeDisp = '';
        try {
          definirContaAtiva(contaId);
          nomeDisp = (await dispositivoSalvo()) ?? '';
          setDispositivo(nomeDisp);
          const rascunho = await carregarRascunho();
          const migrado = await idbGet<boolean>(STORES.config, 'rascunho-migrado');
          setTemRascunhoLegado(Boolean(rascunho) && !migrado);
          if (rascunho) setRascunhoSalvoEm(rascunho.salvoEm);
        } catch {
          // IndexedDB indisponível — segue sem rascunho/nome do dispositivo
        }

        // NUVEM DE ARQUIVOS conectada tem prioridade: a "pasta do processo"
        // vive na conta Google/Microsoft/Dropbox do usuário e vale em
        // qualquer dispositivo — sem seletor de pasta local (é o que resolve
        // o conflito entre máquinas). Com mais de uma conectada, a ordem é
        // Google → OneDrive → Dropbox (desconecte para cair na seguinte).
        const nuvemFora = { disponivel: false, conectado: false, email: null };
        const [eDrive, eOneDrive, eDropbox] = await Promise.all([
          estadoDrive().catch(() => nuvemFora),
          estadoOneDrive().catch(() => nuvemFora),
          estadoDropbox().catch(() => nuvemFora),
        ]);
        setDrive(eDrive);
        setOneDrive(eOneDrive);
        setDropbox(eDropbox);
        try {
          if (eDrive.conectado) {
            const s = new DriveCaseStore(
              new TokenDrivePool(tokenDrive),
              nomeDisp || 'Google Drive',
            );
            setStore(s);
            setEstadoPainel('drive');
            setResumos(null);
            s.listarCasos().then(setResumos).catch(() => setResumos([]));
            void s.linkExterno().then(setLinkNuvem).catch(() => {});
          } else if (eOneDrive.conectado) {
            const s = new OneDriveCaseStore(
              new TokenDrivePool(tokenOneDrive),
              nomeDisp || 'OneDrive',
            );
            setStore(s);
            setEstadoPainel('onedrive');
            setResumos(null);
            s.listarCasos().then(setResumos).catch(() => setResumos([]));
            void s.linkExterno().then(setLinkNuvem).catch(() => {});
          } else if (eDropbox.conectado) {
            const s = new DropboxCaseStore(
              new TokenDrivePool(tokenDropbox),
              nomeDisp || 'Dropbox',
            );
            setStore(s);
            setEstadoPainel('dropbox');
            setResumos(null);
            s.listarCasos().then(setResumos).catch(() => setResumos([]));
            void s.linkExterno().then(setLinkNuvem).catch(() => {});
          } else if (pastaDisponivel()) {
            const { estado, raiz } = await estadoDaRaiz();
            if (estado === 'granted' && raiz) {
              const s = new FolderCaseStore(raiz, nomeDisp || 'Este computador');
              setStore(s);
              setNomeRaiz(raiz.name);
              setEstadoPainel('pasta');
              setResumos(await cacheDeResumos());
              void s.listarCasos().then(setResumos).catch(() => {});
            } else if ((estado === 'prompt' || estado === 'denied') && raiz) {
              setEstadoPainel('pasta-bloqueada');
              setResumos(await cacheDeResumos());
            } else {
              setEstadoPainel('sem-raiz');
              setResumos([]);
            }
          } else {
            const s = new PortableCaseStore(nomeDisp || 'Este navegador');
            setStore(s);
            setEstadoPainel('portatil');
            void s.listarCasos().then(setResumos).catch(() => setResumos([]));
          }
        } catch {
          // Último recurso: qualquer falha inesperada acima cai no modo
          // portátil — painel utilizável em vez de congelado.
          const s = new PortableCaseStore(nomeDisp || 'Este navegador');
          setStore(s);
          setEstadoPainel('portatil');
          s.listarCasos().then(setResumos).catch(() => setResumos([]));
        }

        // Nuvem (conta ou equipe): os casos espelhados entram no painel
        // junto dos locais (melhor-esforço — falha vira lista vazia).
        if (nuvemAtiva) {
          void listarCasosNuvem()
            .then((lista) => {
              if (lista) setResumosNuvem(lista);
            })
            .catch(() => {});
        }
      })();
    }, 0);
    return () => clearTimeout(t);
    // perfilConta, nuvemAtiva e contaId vêm de props do servidor, estáveis
    // na sessão — o efeito continua rodando uma vez só.
  }, [perfilConta, nuvemAtiva, contaId]);


  /* --- ações do painel "Meus casos" --- */

  const ativarPasta = async (raiz: FileSystemDirectoryHandle, nomeDisp: string) => {
    const s = new FolderCaseStore(raiz, nomeDisp || 'Este computador');
    setStore(s);
    setNomeRaiz(raiz.name);
    setEstadoPainel('pasta');
    setResumos(await cacheDeResumos());
    setResumos(await s.listarCasos());
  };

  const escolherPastaRaiz = async (nomeDisp: string) => {
    try {
      setDispositivo(nomeDisp);
      await salvarDispositivo(nomeDisp);
      const raiz = await escolherRaiz();
      if (raiz) await ativarPasta(raiz, nomeDisp);
    } catch {
      toast.error('Não consegui acessar a pasta escolhida.');
    }
  };

  const desbloquearPasta = async () => {
    const { raiz } = await estadoDaRaiz();
    if (!raiz) {
      setEstadoPainel('sem-raiz');
      return;
    }
    try {
      if (await pedirPermissao(raiz)) await ativarPasta(raiz, dispositivo);
      else toast.error('Permissão negada — escolha a pasta de novo se preferir.');
    } catch {
      setEstadoPainel('sem-raiz');
      toast.error('Não encontrei a pasta dos casos. Ela foi movida ou renomeada?');
    }
  };

  /** Religa os documentos ao abrir (modo pasta): manifesto + anexos de volta. */
  const religarDocumentos = async (s: CaseStore, caso: ArquivoCaso) => {
    try {
      const diff = await s.varrerDocumentos(caso);
      manifestoRef.current = diff.manifesto;
      if (caso.manifesto.length > 0 || diff.resumo.novos > 0) toast.info(resumoDoDiff(diff));
      // Reanexa os arquivos religados nas caixas de documentos do processo.
      const mapa: AnexosProcesso = {};
      for (const item of diff.itens) {
        if (!item.arquivo?.file) continue;
        // Nuvem de arquivos: o arquivo VEIO de lá — o efeito de upload não
        // deve devolvê-lo.
        if (s.modo === 'drive' || s.modo === 'onedrive' || s.modo === 'dropbox')
          enviadosDriveRef.current.add(item.arquivo.file);
        const entrada = diff.manifesto.find((m) => m.caminhoRelativo === item.caminhoRelativo);
        const docId = entrada?.classificacao;
        if (!docId) continue;
        (mapa[docId] ??= []).push(item.arquivo.file);
      }
      if (Object.keys(mapa).length > 0) {
        setAnexosProcesso((prev) => {
          const proximos = { ...prev };
          for (const [id, files] of Object.entries(mapa)) {
            const atuais = proximos[id] ?? [];
            const novos = files.filter((f) => !atuais.some((a) => a.name === f.name));
            if (novos.length > 0) proximos[id] = [...atuais, ...novos];
          }
          return proximos;
        });
      }
    } catch {
      // religamento é conforto: a folha abre mesmo sem ele
    }
  };

  const abrirCasoDoPainel = async (caseId: string): Promise<boolean> => {
    // Sem store local (outra máquina, pasta não configurada) o caso ainda
    // abre — direto da nuvem.
    const s = storeRef.current;
    let caso = s ? await s.abrirCaso(caseId) : null;
    origemNuvemRef.current = false;
    baseNuvemRef.current = null;
    avisoNuvemRef.current = false;
    // Guarda do DISCO local: sempre o atualizadoEm do arquivo que está lá —
    // mesmo quando os dados adotados vêm da nuvem (mais novos).
    const baseDisco = caso?.cabecalho.atualizadoEm ?? null;

    if (caso && nuvemAtiva) {
      // O espelho da nuvem pode estar MAIS NOVO (editado por outro membro):
      // a versão mais recente vence — o autosave regrava no disco local.
      const daNuvem = migrarArquivoCaso(await abrirCasoNuvem(caseId));
      if (daNuvem && daNuvem.cabecalho.atualizadoEm > caso.cabecalho.atualizadoEm) {
        caso = { ...daNuvem, cabecalho: { ...daNuvem.cabecalho } };
        baseNuvemRef.current = daNuvem.cabecalho.atualizadoEm;
        toast.info(
          `Carregada a versão mais recente da nuvem (por ${daNuvem.cabecalho.atualizadoPor || 'outro dispositivo'}).`,
        );
      } else if (daNuvem) {
        baseNuvemRef.current = daNuvem.cabecalho.atualizadoEm;
      }
    } else if (!caso && nuvemAtiva) {
      // Caso que só existe na nuvem (outra máquina ou chefe): abre de lá e
      // continua salvando lá — os DOCUMENTOS ficam na máquina de quem os tem.
      const daNuvem = migrarArquivoCaso(await abrirCasoNuvem(caseId));
      if (daNuvem) {
        origemNuvemRef.current = true;
        baseNuvemRef.current = daNuvem.cabecalho.atualizadoEm;
        if (daNuvem.dados) aplicarSnapshot(daNuvem.dados as CasoSalvo);
        manifestoRef.current = daNuvem.manifesto;
        baseAtualizadoEmRef.current = daNuvem.cabecalho.atualizadoEm;
        setCasoAberto({ cabecalho: daNuvem.cabecalho });
        setSalvamento({ estado: 'salvo', quando: daNuvem.cabecalho.atualizadoEm });
        return true;
      }
    }

    if (!caso) {
      toast.error('Não consegui abrir o caso — a pasta foi movida?');
      return false;
    }
    if (caso.dados) aplicarSnapshot(caso.dados as CasoSalvo);
    manifestoRef.current = caso.manifesto;
    baseAtualizadoEmRef.current = baseDisco ?? caso.cabecalho.atualizadoEm;
    setCasoAberto({ cabecalho: caso.cabecalho });
    setSalvamento({ estado: 'salvo', quando: caso.cabecalho.atualizadoEm });
    if (s) void religarDocumentos(s, caso);
    return true;
  };

  /* Chegada por /caso/<id>: abre o caso assim que o store local fica pronto
     (ou direto da nuvem). Caso inexistente vira a tela "caso não
     encontrado" — nunca um redirecionamento silencioso. */
  const casoInicialTratadoRef = useRef(false);
  useEffect(() => {
    if (!casoInicialId || casoInicialTratadoRef.current) return;
    let vivo = true;
    const tentar = async (restantes: number) => {
      if (!vivo || casoInicialTratadoRef.current) return;
      // Pasta aguardando permissão (ou sem raiz): o store local NÃO vem sem
      // um clique do usuário — não adianta esperar; o caso abre da nuvem.
      const semStoreLocal =
        estadoPainelRef.current === 'pasta-bloqueada' || estadoPainelRef.current === 'sem-raiz';
      if (storeRef.current || semStoreLocal || restantes <= 0) {
        casoInicialTratadoRef.current = true;
        let abriu = false;
        try {
          abriu = await abrirCasoDoPainel(casoInicialId);
        } finally {
          if (vivo) {
            setRestaurandoCaso(false);
            if (!abriu) setCasoNaoEncontrado(true);
          }
        }
        return;
      }
      setTimeout(() => void tentar(restantes - 1), 300);
    };
    void tentar(20);
    return () => {
      vivo = false;
    };
    // abrirCasoDoPainel não é memoizada; o ref garante execução única.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoInicialId]);

  const criarCasoDoPainel = async (tituloNovo: string) => {
    const s = storeRef.current;
    if (!s) return;
    try {
      // O painel só aparece com a folha pristina — o snapshot atual É o vazio.
      origemNuvemRef.current = false;
      baseNuvemRef.current = null;
      avisoNuvemRef.current = false;
      const caso = await s.criarCaso(tituloNovo, montarSnapshot());
      manifestoRef.current = [];
      baseAtualizadoEmRef.current = caso.cabecalho.atualizadoEm;
      setCasoAberto({ cabecalho: caso.cabecalho });
      setSalvamento({ estado: 'salvo', quando: caso.cabecalho.atualizadoEm });
      irPara('caso');
    } catch (e) {
      // O motivo importa: "Drive respondeu 403" aponta conta sem acesso ao
      // app (test users do console), "reconecte" aponta token revogado etc.
      toast.error('Não consegui criar a pasta do caso.', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const duplicarCasoDoPainel = async (caseId: string) => {
    const s = storeRef.current;
    if (!s) return;
    try {
      const original = await s.abrirCaso(caseId);
      if (!original) return;
      await s.criarCaso(`${original.cabecalho.titulo} (cópia)`, original.dados);
      setResumos(await s.listarCasos());
      toast.success('Caso duplicado.');
    } catch (e) {
      toast.error('Não consegui duplicar o caso.', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const exportarCasoDoPainel = async (caseId: string) => {
    const s = storeRef.current;
    if (!s) return;
    const caso = await s.abrirCaso(caseId);
    if (!caso) return;
    const blob = new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${caso.cabecalho.titulo || 'caso'}.sucessorista.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const arquivarCasoDoPainel = async (caseId: string) => {
    const s = storeRef.current;
    if (!s?.arquivarCaso) return;
    const ok = await s.arquivarCaso(caseId);
    if (ok) {
      toast.success('Caso arquivado em _Arquivados/.');
      setResumos(await s.listarCasos());
      // O espelho sai da nuvem junto — arquivado não circula.
      if (nuvemAtiva) {
        void removerCasoNuvem(caseId).then((removido) => {
          if (removido) setResumosNuvem((prev) => prev.filter((c) => c.caseId !== caseId));
        });
      }
    } else {
      toast.error('Não consegui arquivar — nada foi movido.');
    }
  };

  /**
   * Remove o ESPELHO do caso na nuvem da conta/equipe (cards "na nuvem" —
   * casos que vivem em OUTRO computador). O caso em si não é apagado; se a
   * máquina de origem espelhar de novo, ele volta — o dialog explica e
   * orienta a ARQUIVAR lá para sumir de vez.
   */
  const removerCasoNuvemDoPainel = async (caseId: string) => {
    const ok = await removerCasoNuvem(caseId);
    if (ok) {
      setResumosNuvem((prev) => prev.filter((c) => c.caseId !== caseId));
      toast.success('Caso removido da nuvem. Ele continua salvo na máquina onde vive.');
    } else {
      toast.error('Não consegui remover da nuvem — tente de novo.');
    }
  };

  /** Abre a PASTA DO CASO no site da nuvem de arquivos (Drive/OneDrive). */
  const abrirPastaNaNuvem = async (caseId: string) => {
    const s = storeRef.current;
    const url = await s?.linkExterno?.(caseId);
    if (url) window.open(url, '_blank', 'noopener');
    else toast.error('Não consegui montar o link da pasta — tente de novo.');
  };

  const restaurarBackupDoPainel = async (caseId: string) => {
    const s = storeRef.current;
    if (!(s instanceof FolderCaseStore)) return;
    const backups = await s.listarBackups(caseId);
    if (backups.length === 0) {
      toast.info('Este caso ainda não tem backups.');
      return;
    }
    const caso = await s.restaurarBackup(caseId, backups[0].nome);
    if (caso) {
      toast.success(`Versão anterior restaurada (${backups[0].quando}).`);
      setResumos(await s.listarCasos());
    } else {
      toast.error('Não consegui restaurar o backup.');
    }
  };

  const importarCasoDoPainel = async (file: File) => {
    const s = storeRef.current;
    if (!(s instanceof PortableCaseStore)) return;
    const caso = await s.importarArquivo(file);
    if (caso) {
      setResumos(await s.listarCasos());
      toast.success('Caso importado — os documentos religam quando você arrastar a pasta.');
    } else {
      toast.error('Este arquivo não é um caso válido.');
    }
  };

  const migrarRascunhoLegado = async () => {
    const s = storeRef.current;
    if (!s) return;
    const rascunho = await carregarRascunho();
    if (!rascunho) return;
    const dados = rascunho.dados as CasoSalvo;
    const tituloRasc = dados?.familia?.falecido?.nome || 'Rascunho migrado';
    try {
      await s.criarCaso(tituloRasc, dados);
      await idbPut(STORES.config, 'rascunho-migrado', true);
      setTemRascunhoLegado(false);
      setResumos(await s.listarCasos());
      toast.success('Rascunho guardado como caso — o original permanece no navegador.');
    } catch {
      toast.error('Não consegui guardar o rascunho como caso.');
    }
  };

  /**
   * Envia TODOS os casos locais para a nuvem de uma vez (os salvamentos
   * seguintes mantêm o espelho sozinhos). O servidor recusa o que faria
   * versão mais nova regredir. `silencioso` é o espelho AUTOMÁTICO ao abrir
   * o painel — mantém tudo na nuvem sem toasts nem clique.
   */
  const espelharCasosNaNuvem = async (silencioso = false) => {
    const s = storeRef.current;
    if (!s || !nuvemAtiva) return;
    const lista = await s.listarCasos();
    let enviados = 0;
    let mantidos = 0;
    for (const r of lista) {
      const caso = await s.abrirCaso(r.cabecalho.caseId);
      if (!caso) continue;
      const res = await salvarCasoNuvem(caso, { baseAtualizadoEm: null, espelho: true });
      if (res.ok) enviados += 1;
      else if (res.desatualizado) mantidos += 1;
    }
    const atualizados = await listarCasosNuvem();
    if (atualizados) setResumosNuvem(atualizados);
    if (silencioso) return;
    if (enviados > 0)
      toast.success(
        `${enviados} caso(s) enviados para a nuvem${mantidos > 0 ? ` (${mantidos} já estavam mais novos lá)` : ''}.`,
      );
    else if (mantidos > 0) toast.info('A nuvem já tem versões mais novas de todos os casos.');
    else toast.info('Nenhum caso local para enviar.');
  };
  const enviarCasosParaNuvem = () => espelharCasosNaNuvem();

  /**
   * Espelho automático: com o painel carregado num store local, sobe o que
   * está só nesta máquina (uma vez por visita) — é a outra metade do "login
   * puxa tudo": este PC também DEIXA tudo na nuvem para os demais.
   */
  const espelhoInicialRef = useRef(false);
  useEffect(() => {
    if (!store || espelhoInicialRef.current) return;
    if (estadoPainel !== 'pasta' && estadoPainel !== 'portatil') return;
    espelhoInicialRef.current = true;
    // Diferido (mesmo padrão do carregamento do painel): o espelho roda em
    // segundo plano, sem segurar a pintura dos cards.
    const t = setTimeout(() => void espelharCasosNaNuvem(true), 0);
    return () => clearTimeout(t);
    // roda uma vez, quando o store local fica pronto
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, estadoPainel]);

  /** Volta do consentimento (?drive= / ?onedrive= / ?dropbox=) — toast e limpa a URL. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('drive');
    const qOne = params.get('onedrive');
    const qDbx = params.get('dropbox');
    if (!q && !qOne && !qDbx) return;
    if (q === 'conectado') toast.success('Google Drive conectado — seus casos agora vivem na sua conta Google.');
    else if (q === 'erro') toast.error('Não foi possível conectar o Google Drive — tente de novo.');
    if (qOne === 'conectado') toast.success('OneDrive conectado — seus casos agora vivem na sua conta Microsoft.');
    else if (qOne === 'erro') toast.error('Não foi possível conectar o OneDrive — tente de novo.');
    if (qDbx === 'conectado') toast.success('Dropbox conectado — seus casos agora vivem na sua conta Dropbox.');
    else if (qDbx === 'erro') toast.error('Não foi possível conectar o Dropbox — tente de novo.');
    const url = new URL(window.location.href);
    url.searchParams.delete('drive');
    url.searchParams.delete('onedrive');
    url.searchParams.delete('dropbox');
    window.history.replaceState(null, '', url.toString());
  }, []);

  const desconectarDoDrive = async () => {
    const ok = await desconectarDrive();
    if (!ok) {
      toast.error('Não consegui desconectar — tente de novo.');
      return;
    }
    toast.success('Google Drive desconectado. Seus arquivos continuam no seu Drive; o app voltou ao armazenamento local.');
    window.location.reload();
  };

  const desconectarDoOneDrive = async () => {
    const ok = await desconectarOneDrive();
    if (!ok) {
      toast.error('Não consegui desconectar — tente de novo.');
      return;
    }
    toast.success('OneDrive desconectado. Seus arquivos continuam no seu OneDrive; o app voltou ao armazenamento local.');
    window.location.reload();
  };

  const desconectarDoDropbox = async () => {
    const ok = await desconectarDropbox();
    if (!ok) {
      toast.error('Não consegui desconectar — tente de novo.');
      return;
    }
    toast.success('Dropbox desconectado. Seus arquivos continuam no seu Dropbox; o app voltou ao armazenamento local.');
    window.location.reload();
  };

  /**
   * NUVEM DE ARQUIVOS (Drive/OneDrive): anexo novo do caso sobe
   * automaticamente para a pasta do caso (direto do navegador) — é o que
   * faz o documento aparecer nas outras máquinas. Depois do lote, o
   * manifesto é revarrido em silêncio para o caso.json apontar para os
   * arquivos novos.
   */
  useEffect(() => {
    const s = storeRef.current;
    const aberto = casoAbertoRef.current;
    if (!s || (s.modo !== 'drive' && s.modo !== 'onedrive' && s.modo !== 'dropbox') || !s.enviarDocumento || !aberto) return;
    // Caso aberto DIRETO da nuvem da conta (sem pasta na nuvem de arquivos
    // desta máquina): não há para onde subir — sem tentar, sem toast de erro.
    if (origemNuvemRef.current) return;
    const pendentes: File[] = [];
    for (const files of Object.values(anexosProcesso)) {
      for (const f of files) {
        if (!enviadosDriveRef.current.has(f)) pendentes.push(f);
      }
    }
    if (pendentes.length === 0) return;
    for (const f of pendentes) enviadosDriveRef.current.add(f);
    const caseId = aberto.cabecalho.caseId;
    const t = setTimeout(() => {
      void (async () => {
        let falhas = 0;
        for (const f of pendentes) {
          const ok = await s.enviarDocumento!(caseId, f);
          if (!ok) {
            falhas += 1;
            enviadosDriveRef.current.delete(f);
          }
        }
        if (falhas > 0) {
          toast.error(
            `${falhas} documento(s) não subiram para a nuvem — eles seguem anexados ao caso; reenvie pela aba Documentos ("Subir para a nuvem").`,
            { description: s.ultimoErro ?? undefined },
          );
        }
        try {
          // Revarre com um arquivo SINTÉTICO (o store só olha caseId +
          // manifesto) — as entradas novas ganham hash e religam nas outras
          // máquinas na próxima abertura.
          const diff = await s.varrerDocumentos({
            schemaVersion: 1,
            appVersion: '',
            cabecalho: aberto.cabecalho,
            dados: null,
            manifesto: manifestoRef.current,
            integridade: { hashDados: '' },
          });
          manifestoRef.current = diff.manifesto;
        } catch {
          // manifesto atualiza na próxima abertura
        }
      })();
    }, 800);
    return () => clearTimeout(t);
     
  }, [anexosProcesso]);

  const voltarAoPainel = () => {
    // Flush + recarga: o painel volta com a folha pristina (o estado do
    // wizard é extenso demais para reset campo a campo com segurança).
    void salvarAgoraRef.current().finally(() => {
      // Recarga proposital: zera a folha para o painel abrir pristino.
      // A raiz É o módulo neste site (a rota /sucessorista não existe mais).
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = '/';
    });
  };

  // Perfil (Advogado × Escrevente) agora é da CONTA; a chave do navegador
  // segue gravada só como espelho de transição (contas antigas sem escolha).
  useEffect(() => {
    if (!restauradoRef.current) return;
    try {
      localStorage.setItem(CHAVE_PERFIL, perfil);
    } catch {
      // modo restrito
    }
  }, [perfil]);

  /** Primeiro acesso: a conta ainda não escolheu o perfil — escolha
   *  obrigatória (dialog). Se o navegador JÁ guarda uma escolha (era do
   *  localStorage, ou gravação anterior que falhou), não pergunta de novo:
   *  aplica e tenta ressincronizar com o banco em silêncio. */
  useEffect(() => {
    if (perfilConta !== null) return;
    const t = setTimeout(() => {
      let guardado: string | null = null;
      try {
        guardado = localStorage.getItem(CHAVE_PERFIL);
      } catch {
        // modo restrito
      }
      if (guardado === 'ADVOGADO' || guardado === 'ESCREVENTE') {
        setPerfil(guardado);
        // Ressincronização silenciosa: quando o banco voltar (ou a migração
        // rodar), a escolha do navegador vira a da conta — sem toast.
        void import('./perfil-actions').then(({ salvarPerfilConta }) =>
          salvarPerfilConta(guardado).catch(() => undefined),
        );
      } else {
        setEscolhendoPerfil(true);
      }
    }, 0);
    return () => clearTimeout(t);
  }, [perfilConta]);

  const escolherPerfilConta = async (p: Perfil) => {
    setPerfil(p);
    // O dialog NÃO fecha aqui: a qualificação continua (identificação/quiz)
    // e quem fecha é o aoConcluir do componente.
    try {
      const { salvarPerfilConta } = await import('./perfil-actions');
      const r = await salvarPerfilConta(p);
      if (!r.ok && r.motivo === 'ja-escolhido') {
        toast.error('O perfil desta conta já foi definido', {
          description:
            'Trocar de perfil é ato de administração — fale com o(a) responsável pela plataforma.',
        });
      } else if (!r.ok && r.motivo === 'sem-sessao') {
        toast.error('Sessão expirada', {
          description: 'Entre de novo para gravar o perfil na conta.',
        });
      } else if (!r.ok) {
        // Banco fora (ou migração perfil_sucessorista_por_conta pendente):
        // a escolha fica no navegador e o sistema ressincroniza sozinho no
        // próximo acesso — sem pedir nada de novo.
        toast.info('Perfil guardado neste navegador', {
          description:
            'Não deu para gravar na conta agora (banco indisponível). Sua escolha já vale e será sincronizada automaticamente no próximo acesso.',
        });
      }
    } catch {
      // melhor-esforço: a escolha local segue valendo nesta sessão
    }
  };

  // Tema claro × escuro: preferência do navegador, como o perfil.
  useEffect(() => {
    if (!restauradoRef.current) return;
    try {
      localStorage.setItem(CHAVE_TEMA, tema);
    } catch {
      // modo restrito
    }
  }, [tema]);

  // Painel recolhido: mesma mecânica de preferência do navegador.
  useEffect(() => {
    if (!restauradoRef.current) return;
    try {
      localStorage.setItem(CHAVE_PAINEL_RECOLHIDO, painelRecolhido ? '1' : '0');
    } catch {
      // modo restrito
    }
  }, [painelRecolhido]);

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

  /** Quem tem direito no caso (meação e/ou quinhão) — as opções do "fica com".
   *  Derivações do motor de cenários (lib/partilha/cenario.ts) — o mesmo que
   *  o Espaço do Espólio usa. */
  const participantes = useMemo(
    () => (!resultado || resultado.bloqueios.length > 0 ? [] : participantesDoResultado(resultado)),
    [resultado],
  );

  /** Quinhão de direito em R$ por participante (meação + quinhões). */
  const direitoPorParticipante = useMemo(
    () => (!resultado || resultado.bloqueios.length > 0 ? {} : direitosDoResultado(resultado)),
    [resultado],
  );

  /** Pendências da minuta: o que ainda vira lacuna na escritura/petição. */
  const pendenciasMinuta = useMemo(
    () =>
      pendenciasDaMinuta({
        falecido,
        qualificacaoFalecido: familia.qualificacoes['__falecido__'],
        temSobrevivente,
        nomeSobrev,
        qualificacaoSobrevivente: familia.qualificacoes['__sobrevivente__'],
        herdeiros,
        qualificacoes: familia.qualificacoes,
        bens,
      }),
    [falecido, familia.qualificacoes, temSobrevivente, nomeSobrev, herdeiros, bens],
  );

  /** Herdeiros com quinhão e CPF — alimenta a Declaração Final (módulo fiscal). */
  const herdeirosQuinhao = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0) return [];
    const porHerdeiro = new Map<string, number>();
    for (const q of resultado.quinhoes)
      porHerdeiro.set(q.herdeiroId, (porHerdeiro.get(q.herdeiroId) ?? 0) + Number(q.valor));
    return herdeiros
      .filter((h) => porHerdeiro.has(h.id))
      .map((h) => ({
        nome: h.nome,
        cpf: familia.qualificacoes[h.id]?.cpf ?? '',
        quinhao: porHerdeiro.get(h.id) ?? 0,
      }));
  }, [resultado, herdeiros, familia.qualificacoes]);

  /**
   * Partilha diferenciada em MATRIZ: cada linha (bem) distribui percentuais
   * entre os participantes; linha toda vazia segue a proporção exata do
   * direito (meação + quinhão — neutro na conta). Linha preenchida precisa
   * fechar 100%. O desvio entre recebido e direito vira o acerto (torna),
   * com o imposto da cessão.
   */
  // Despesas adiantadas reconhecidas: carregadas do servidor (best-effort)
  // quando o caso tem convites do cofre — só elas entram na conta.
  const temConvites = Object.keys(convites).length > 0;
  useEffect(() => {
    if (!temConvites) return;
    let vivo = true;
    void fatosDoEspolio(casoId).then((r) => {
      if (!vivo || !r.ok) return;
      setDespesasCenario(
        (r.despesas ?? [])
          .filter((d) => d.status === 'reconhecida' && d.herdeiroId)
          .map((d) => ({
            participanteId: d.herdeiroId as string,
            descricao: d.descricao,
            valor: Number(d.valor) || 0,
            tratamento: d.tratamento === 'compensar' ? ('compensar' as const) : ('ressarcir' as const),
          })),
      );
    });
    return () => {
      vivo = false;
    };
  }, [casoId, temConvites]);

  const apuracaoCenario = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0 || bens.length === 0) return null;
    if (participantes.length === 0) return null;
    if (!temAlocacao(matriz, bens, participantes)) return null; // tudo na proporção do direito

    // Apuração pelo MOTOR DE CENÁRIOS (lib/partilha/cenario.ts) — o mesmo do
    // Espaço do Espólio: matriz → frações exatas → apurarAtribuicao. A
    // isenção de doação por donatário/ano (art. 6º, II, "a") é 2.500 UFESPs.
    // As despesas adiantadas RECONHECIDAS entram nas linhas do cenário
    // (ressarcir × compensar) — não mexem na atribuição técnica.
    const ufespAtual = ufespDoAno(new Date().getFullYear()).valor;
    const cenario = apurarCenario({
      caso,
      resultado,
      alocacoes: matriz,
      titulo,
      isencaoDoacaoAnual: 2500 * ufespAtual,
      despesas: despesasCenario,
    });
    if (!cenario.atribuicao && cenario.bloqueios.length === 0) return null;
    return cenario;
  }, [resultado, titulo, caso, bens, matriz, participantes, despesasCenario]);

  const atribuicao = useMemo(() => {
    if (!apuracaoCenario) return null;
    return (
      apuracaoCenario.atribuicao ?? {
        posicoes: [],
        transferencias: [],
        totalTorna: '0.00',
        avisos: [],
        bloqueios: apuracaoCenario.bloqueios,
      }
    );
  }, [apuracaoCenario]);

  /** Propõe a atribuição ATUAL como cenário do Espaço do Espólio: o snapshot
   *  leigo é montado aqui (allowlist) e a família responde pelo portal. */
  const proporCenario = async () => {
    if (!apuracaoCenario || apuracaoCenario.bloqueios.length > 0) return;
    setEnviandoCenario(true);
    try {
      const cenario = montarCenarioCompartilhado({
        titulo: tituloCenario.trim(),
        descricao: descricaoCenario,
        // Autoria visível (camada 4): cenário do escritório titular leva o
        // nome de quem propôs — os do advogado constituído também levarão.
        autor: nomeConta ?? undefined,
        bens: bens.map((b) => ({ id: b.id, descricao: b.descricao })),
        participantes: participantes.map((p) => ({ id: p.id, nome: p.nome })),
        alocacoes: matriz,
        linhas: apuracaoCenario.linhas,
        resumo: resumoDoCenario(apuracaoCenario),
        avisos: apuracaoCenario.avisos,
        totalTorna: apuracaoCenario.totalTorna,
        totalDespesasReconhecidas: apuracaoCenario.totalDespesasReconhecidas,
      });
      const r = await salvarCenario({ casoId, cenario });
      if (r.ok) {
        setProporAberto(false);
        setTituloCenario('');
        setDescricaoCenario('');
        toast.success('Cenário proposto à família', {
          description:
            'Cada herdeiro responde pelo próprio link — o cenário aparece com o espaço do espólio ABERTO e o painel publicado.',
        });
      } else {
        toast.error('Não foi possível propor', { description: r.erro });
      }
    } finally {
      setEnviandoCenario(false);
    }
  };

  // Espelho para a telemetria do caso (o retrato é montado antes daqui).
  useEffect(() => {
    atribuicaoRef.current = atribuicao;
  }, [atribuicao]);

  /**
   * Base de CADA sucessão cumulada: quando o acervo tem colunas por sucessão
   * (avaliação no fato gerador respectivo × fração do de cujus, e bens
   * exclusivos), a base é calculada dali — (valor × fração) somados sobre os
   * bens que integram a sucessão. Sem coluna preenchida, vale a base manual
   * lançada no item I.
   */
  const basesSucessoes = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const su of fiscal.sucessoes ?? []) {
      // Bens particulares: a base sai SÓ dos bens exclusivos desta sucessão.
      const soBensProprios = su.mesmosBens === false;
      let temColuna = false;
      let soma = 0;
      for (const b of bens) {
        if (b.sucessaoExclusiva && b.sucessaoExclusiva !== su.id) continue;
        if (soBensProprios && b.sucessaoExclusiva !== su.id) continue;
        const av = b.sucessoes?.[su.id];
        if (av?.valor || av?.fracaoPct || b.sucessaoExclusiva === su.id) temColuna = true;
        const valor = Number(av?.valor ?? b.valor) || 0;
        const frac =
          av?.fracaoPct !== undefined && String(av.fracaoPct).trim() !== ''
            ? (Number(String(av.fracaoPct).replace(',', '.')) || 0) / 100
            : 1;
        soma += valor * frac;
      }
      mapa[su.id] = temColuna ? Math.round(soma * 100) / 100 : Number(su.base) || 0;
    }
    return mapa;
  }, [fiscal.sucessoes, bens]);

  /**
   * RITO EFETIVO do caso: a escolha do dashboard "O Caso" manda
   * (fiscal.rito EXTRAJUDICIAL/JUDICIAL); em AUTO, segue o motor de
   * elegibilidade. Decide a projeção de custas (escritura × taxa
   * judiciária), o encerramento do cofre e o antecipador registral.
   */
  const ritoMotor: 'EXTRAJUDICIAL' | 'JUDICIAL' | null =
    resultado && resultado.bloqueios.length === 0
      ? resultado.elegivelExtrajudicial
        ? 'EXTRAJUDICIAL'
        : 'JUDICIAL'
      : null;
  const ritoEfetivo: 'EXTRAJUDICIAL' | 'JUDICIAL' | null =
    fiscal.rito === 'EXTRAJUDICIAL' || fiscal.rito === 'JUDICIAL' ? fiscal.rito : ritoMotor;

  /**
   * Projeção de custos além do imposto: escritura/atos notariais, registros
   * por imóvel (com atos extras na partilha diferenciada), certidões e a
   * taxa judiciária quando o rito é o judicial.
   */
  const custos = useMemo(() => {
    // Modo manual (fora de SP): tabelas paulistas ficam mudas.
    if (fiscal.custosManuais?.ativo) return null;
    if (!resultado || resultado.bloqueios.length > 0) return null;
    const atribuicaoOk = atribuicao && atribuicao.bloqueios.length === 0;
    const transferencias = atribuicaoOk
      ? atribuicao.transferencias.map((t) => ({ valor: Number(t.valor), tributo: t.tributo }))
      : [];
    return projetarCustos({
      monteMor: Number(resultado.acervo.massaPartilhavel),
      // Legítima pelo ENUNCIADO 7 do CNB/SP: um ato pelo MAIOR entre o valor
      // atribuído e o venal na data da lavratura — e também o valor venal e o
      // de avaliação lançados no acervo (o maior de todos manda nas custas).
      baseEscritura: baseDeEmolumentosDaEscritura({
        bens: bens.map((b) => ({
          valor: Number(b.valor),
          venalAtual: Math.max(
            Number(b.imovel?.valorVenalAtual) || 0,
            Number(b.valorVenal) || 0,
            Number(b.valorAvaliacao) || 0,
          ) || null,
        })),
        legitima: Number(resultado.heranca.total),
      }),
      qtdRenunciantes: herdeiros.filter((h) => h.status === 'RENUNCIANTE').length,
      sucessoes: (fiscal.sucessoes ?? []).map((su) => ({
        nome: su.nome,
        base: basesSucessoes[su.id] ?? 0,
        qtdImoveis: su.qtdImoveis,
      })),
      // Registro de imóveis: base pelo MAIOR entre atribuído, venal e
      // avaliação — sobre a fração TRANSMITIDA. Sai da base só o que FICA
      // com o(a) meeiro(a), ATÉ o limite da meação (50%): na partilha
      // igualitária é a metade; na diferenciada, a linha do bem decide —
      // meeiro(a) sem direito remanescente no bem = ato pelo valor TOTAL.
      imoveis: bens
        .filter((b) => b.tipo === 'IMOVEL')
        .map((b) => {
          const maior = Math.max(
            Number(b.valor) || 0,
            Number(b.valorVenal) || 0,
            Number(b.valorAvaliacao) || 0,
          );
          const fracaoTransmitida = (() => {
            if (!resultado.meacao || (b.natureza ?? 'COMUM') !== 'COMUM') return 1;
            const linha = matriz[b.id];
            const total = linha
              ? participantes.reduce((a, p) => a + pctNum(linha[p.id]), 0)
              : 0;
            if (linha && Math.abs(total - 100) <= 0.05) {
              const ficaComMeeiro = Math.min(pctNum(linha['__sobrevivente__']) / 100, 0.5);
              return 1 - ficaComMeeiro;
            }
            return 0.5; // sem linha preenchida: segue o direito (meação de 1/2)
          })();
          return {
            descricao: b.descricao,
            valor: maior,
            valorTransmitido: Math.round(maior * fracaoTransmitida * 100) / 100,
            // Redesenho por usufruto aceito (rótulos da matriz): o registro
            // deste imóvel vira DOIS atos — 1/3 (usufruto) e 2/3 (nua).
            // QUALQUER rótulo da linha basta: editar uma célula apaga só o
            // rótulo dela, e o ajuste fino do % do sobrevivente não pode
            // devolver o registro a um ato único pelo valor cheio.
            usufrutoNua: Object.values(anotacoesMatriz[b.id] ?? {}).some((r) =>
              /usufruto|nua-propriedade/i.test(r),
            ),
          };
        }),
      // A escolha do dashboard manda; AUTO segue o motor de elegibilidade.
      rito:
        fiscal.rito === 'EXTRAJUDICIAL' || fiscal.rito === 'JUDICIAL'
          ? fiscal.rito
          : resultado.elegivelExtrajudicial
            ? 'EXTRAJUDICIAL'
            : 'JUDICIAL',
      // Certidões do registro civil: provisiona pelo MAIOR entre os herdeiros
      // lançados e os DECLARADOS na certidão de óbito (documentação a vir).
      qtdHerdeiros: Math.max(herdeiros.length, (familia.herdeirosDeclarados ?? []).length),
      temSobrevivente,
      // União estável a RECONHECER no próprio inventário (escolha do item I):
      // soma um ato sem valor declarado na escritura.
      reconhecerUniaoEstavel:
        temSobrevivente &&
        vinculo === 'UNIAO_ESTAVEL' &&
        familia.uniaoEstavelFormalizada === 'RECONHECER',
      transferencias,
      ufesp: provisao?.ufespReferencia ?? ufespDoAno(new Date().getFullYear()).valor,
      issPct: Math.min(5, Math.max(2, Number(fiscal.issPct ?? '5') || 5)),
    });
  }, [resultado, atribuicao, bens, herdeiros, familia.herdeirosDeclarados, temSobrevivente, vinculo, familia.uniaoEstavelFormalizada, provisao, fiscal.sucessoes, basesSucessoes, fiscal.issPct, fiscal.rito, fiscal.custosManuais, matriz, anotacoesMatriz, participantes]);


  /**
   * ITCMD das sucessões CUMULADAS: cada uma tem o PRÓPRIO fato gerador —
   * UFESP do ano do óbito respectivo, prazos e encargos independentes.
   */
  const provisoesSucessoes = useMemo(() => {
    // Modo manual (fora de SP): UFESP/prazos de SP não valem para o caso.
    if (fiscal.custosManuais?.ativo) return [];
    return (fiscal.sucessoes ?? [])
      .map((su) => ({ su, base: basesSucessoes[su.id] ?? 0 }))
      .filter(({ su, base }) => su.dataObito && base > 0)
      .map(({ su, base }) => ({
        sucessao: su,
        base,
        provisao: provisionarItcmd({
          dataObito: su.dataObito,
          dataReferencia: referenciaItcmd,
          baseCalculo: base,
        }),
      }));
  }, [fiscal.sucessoes, basesSucessoes, referenciaItcmd, fiscal.custosManuais]);
  const impostoSucessoes = provisoesSucessoes.reduce((a, p) => a + p.provisao.total, 0);

  /**
   * PAINEL DA FAMÍLIA — o que o espelho publicado PODE mostrar, já pronto:
   * quinhão por herdeiro (só entra se o advogado liberar) e os custos
   * AGREGADOS do caso (ITCMD + cartório/justiça + adicionais). Honorários
   * NUNCA entram aqui — é a lista inteira que o card pode publicar.
   */
  const quinhoesPainel = useMemo(() => {
    const mapa: Record<string, { valor: string; fracao?: string }> = {};
    if (resultado && resultado.bloqueios.length === 0) {
      for (const q of resultado.quinhoes) {
        mapa[q.herdeiroId] = { valor: String(q.valor), fracao: q.fracaoHeranca };
      }
    }
    return mapa;
  }, [resultado]);
  const custosVisiveisPainel = useMemo(() => {
    const linhas: import('@/lib/portal/painel').CustoVisivel[] = [];
    const pago = fiscal.itcmdSituacao === 'PAGO';
    // Modo manual (fora de SP): as linhas publicáveis são as informadas.
    if (manuais) {
      if (Number(manuais.itcmd) > 0) {
        linhas.push({
          rotulo: 'Imposto sobre a herança (ITCMD/ITCD)',
          valor: (Number(manuais.itcmd) || 0).toFixed(2),
          situacao: pago ? 'PAGO' : 'PREVISTO',
        });
      }
      const resto =
        (Number(manuais.cartorioJustica) || 0) +
        (Number(manuais.registros) || 0) +
        (Number(manuais.certidoes) || 0);
      if (resto > 0) {
        linhas.push({
          rotulo: 'Cartório/justiça, registros e certidões',
          valor: resto.toFixed(2),
          situacao: 'PREVISTO',
        });
      }
      for (const a of custosAdicionais) {
        linhas.push({
          rotulo: a.descricao || 'Despesa adicional',
          valor: (Number(a.valor) || 0).toFixed(2),
          situacao: 'PREVISTO',
        });
      }
      return linhas;
    }
    if (provisao) {
      linhas.push({
        rotulo: 'Imposto sobre a herança (ITCMD)',
        valor: provisao.total.toFixed(2),
        situacao: pago ? 'PAGO' : 'PREVISTO',
      });
    }
    if (impostoSucessoes > 0) {
      linhas.push({
        rotulo: 'ITCMD das sucessões anteriores',
        valor: impostoSucessoes.toFixed(2),
        situacao: pago ? 'PAGO' : 'PREVISTO',
      });
    }
    if (custos) {
      linhas.push({
        rotulo:
          ritoEfetivo === 'JUDICIAL'
            ? 'Custas judiciais, registros e certidões'
            : 'Cartório, registros e certidões',
        valor: custos.total.toFixed(2),
        situacao: 'PREVISTO',
      });
    }
    for (const a of custosAdicionais) {
      linhas.push({
        rotulo: a.descricao || 'Despesa adicional',
        valor: (Number(a.valor) || 0).toFixed(2),
        situacao: 'PREVISTO',
      });
    }
    return linhas;
  }, [provisao, custos, custosAdicionais, impostoSucessoes, fiscal.itcmdSituacao, ritoEfetivo, manuais]);

  /**
   * ESPAÇO DO ESPÓLIO — os fatos compartilháveis, já no formato de allowlist
   * do motor (lib/portal/espolio.ts): participantes SÓ com nome+papel, bens
   * com a fonte leiga da avaliação, dívidas e os quinhões de todos. O que
   * não está aqui não tem como subir.
   */
  const espolioDadosPainel = useMemo((): import('@/lib/portal/espolio').EntradaEspolio => {
    const papelDe = (id: string): import('@/lib/portal/espolio').PapelParticipante =>
      id === '__sobrevivente__'
        ? 'cônjuge meeiro(a)'
        : id === familia.inventarianteId
          ? 'inventariante'
          : 'herdeiro(a)';
    const fonteDe = (b: Bem): string =>
      Number(b.valorAvaliacao) > 0
        ? 'avaliação lançada no caso'
        : Number(b.valorVenal) > 0 || Number(b.imovel?.valorVenalAtual) > 0
          ? 'valor venal (IPTU/ITR)'
          : 'valor declarado pela família';
    const ok = resultado && resultado.bloqueios.length === 0;
    return {
      nomeFalecido: falecido.nome,
      participantes: ok
        ? participantesDoResultado(resultado).map((p) => ({ nome: p.nome, papel: papelDe(p.id) }))
        : herdeiros.map((h) => ({ nome: h.nome, papel: papelDe(h.id) })),
      bens: bens.map((b) => ({
        id: b.id,
        descricao: b.descricao,
        valor: String(b.valor ?? '0'),
        fonteAvaliacao: fonteDe(b),
      })),
      totalAcervo: ok ? String(resultado.acervo.massaPartilhavel) : undefined,
      dividas:
        Number(dividasEspolio.replace(/\./g, '').replace(',', '.')) > 0
          ? [
              {
                descricao: 'Dívidas do espólio (total declarado)',
                valor: Number(dividasEspolio.replace(/\./g, '').replace(',', '.')).toFixed(2),
              },
            ]
          : [],
      quinhoes: ok
        ? [
            ...(resultado.meacao
              ? [
                  {
                    nome: resultado.meacao.beneficiario,
                    papel: 'cônjuge meeiro(a)' as const,
                    valor: String(resultado.meacao.valor),
                    fracao: 'meação (não é herança)',
                  },
                ]
              : []),
            ...resultado.quinhoes.map((q) => ({
              nome: q.nome,
              papel: papelDe(q.herdeiroId),
              valor: String(q.valor),
              fracao: q.fracaoHeranca,
            })),
          ]
        : [],
    };
  }, [resultado, falecido.nome, familia.inventarianteId, herdeiros, bens, dividasEspolio]);

  /**
   * Alertas da leitura: herdeiro DECLARADO na certidão de óbito sem
   * lançamento/qualificação, e frações ideais dos venais que não fecham
   * 100% (exceto unidade autônoma/apartamento, onde a fração é do terreno).
   */
  const alertasLeitura = useMemo(() => {
    const lista: string[] = [];
    for (const declarado of familia.herdeirosDeclarados ?? []) {
      // A certidão qualifica o filho ("Pedro Vitor, Maior") — só o NOME
      // cruza com a ficha, palavra a palavra (o item I tem o nome completo).
      const nome = semQualificadoresDeNome(declarado);
      if (!nome) continue;
      const h = herdeiros.find((x) => mesmaPessoa(nome, x.nome) || nomeConstaEm(nome, x.nome));
      if (!h) {
        lista.push(
          `Certidão de óbito declara o(a) herdeiro(a) ${nome} — ainda não lançado(a) no item I (documentação faltando?)`,
        );
      } else {
        const q = familia.qualificacoes[h.id];
        if (!q?.cpf || !q?.endereco) {
          lista.push(
            `Herdeiro(a) ${h.nome} consta na certidão de óbito, mas a qualificação está incompleta (CPF/endereço)`,
          );
        }
      }
    }
    for (const [i, b] of bens.entries()) {
      if (b.tipo !== 'IMOVEL') continue;
      const fr = Number(String(b.imovel?.fracaoIdeal ?? '').replace(',', '.'));
      if (!Number.isFinite(fr) || fr <= 0) continue;
      const texto = `${b.descricao} ${b.imovel?.descricaoMatricula ?? ''}`
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const unidadeAutonoma = /APARTAMENTO|UNIDADE AUTONOMA|VAGA DE GARAGEM|BOX|SALA COMERCIAL|CONJUNTO COMERCIAL/.test(texto);
      if (Math.abs(fr - 100) > 0.05 && !unidadeAutonoma) {
        lista.push(
          `Bem ${i + 1}: as frações ideais das certidões de valor venal somam ${fr.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% — deveriam fechar 100% (falta certidão de alguma inscrição?)`,
        );
      }
    }
    // NATUREZA × registro aquisitivo: comunhão PARCIAL com o(a) falecido(a)
    // SOLTEIRO(A) no registro pelo qual adquiriu = bem de ANTES do casamento
    // → PARTICULAR (sem meação). Lançado como "comum", pede conferência —
    // a meação indevida muda a partilha e o orçamento inteiros.
    if (regime === 'COMUNHAO_PARCIAL' && temSobrevivente && falecido.nome.trim()) {
      for (const [i, b] of bens.entries()) {
        const prop = b.imovel?.proprietariosMatricula;
        if (b.tipo !== 'IMOVEL' || !prop?.trim()) continue;
        if ((b.natureza ?? 'COMUM') !== 'COMUM') continue;
        if ((mesmaPessoa(falecido.nome, prop) || nomeConstaEm(falecido.nome, prop)) && /solteir/i.test(prop)) {
          lista.push(
            `Bem ${i + 1}: o registro aquisitivo mostra o(a) falecido(a) SOLTEIRO(A) — na comunhão parcial, bem adquirido antes do casamento é PARTICULAR (sem meação). Confira a natureza lançada (está "comum")`,
          );
        }
      }
    }
    // TITULARIDADE pela matrícula × certidão de óbito: o(a) falecido(a) (ou
    // o cônjuge, no bem comum) precisa constar do registro aquisitivo — se
    // não consta, o bem pode não ser do espólio (ou falta averbação prévia).
    if (falecido.nome.trim()) {
      for (const [i, b] of bens.entries()) {
        const prop = b.imovel?.proprietariosMatricula;
        if (b.tipo !== 'IMOVEL' || !prop?.trim()) continue;
        // Por PALAVRAS além do substring: o registro aquisitivo intercala
        // RG/CPF/qualificação entre os nomes ("VENDIDO a FRANCISCO DIMAS DA
        // SILVA (RG nº …), brasileiro, solteiro") e o alerta não pode
        // acusar divergência que não existe.
        const consta =
          mesmaPessoa(falecido.nome, prop) ||
          nomeConstaEm(falecido.nome, prop) ||
          (temSobrevivente &&
            nomeSobrev.trim() &&
            (mesmaPessoa(nomeSobrev, prop) || nomeConstaEm(nomeSobrev, prop)));
        if (!consta) {
          lista.push(
            `Bem ${i + 1}: o(a) falecido(a) NÃO aparece na titularidade da matrícula (consta: ${prop}) — confira se o bem é mesmo do espólio, se a aquisição está registrada, ou se falta averbação prévia no RI`,
          );
        }
      }
    }
    return lista;
  }, [familia.herdeirosDeclarados, familia.qualificacoes, herdeiros, bens, falecido.nome, temSobrevivente, nomeSobrev, regime]);

  /**
   * Conferidor de QUALIFICAÇÃO CRUZADA (motor puro): folha × certidões do
   * registro civil lidas pelo cofre — divórcio averbado × declarado casado,
   * casamento pré-1977, regime sem pacto, grafia, datas. Divergência ALTA
   * vira alerta VERMELHO no item I e no painel, pedindo a correção.
   */
  const divergenciasConferencia = useMemo(() => {
    const certidoes = familia.certidoesCivis ?? [];
    if (certidoes.length === 0 && herdeiros.length === 0) return [];
    const pessoas: PessoaConferencia[] = [];
    const q = (id: string) => familia.qualificacoes[id];
    if (falecido.nome.trim()) {
      pessoas.push({
        id: '__falecido__',
        nome: falecido.nome,
        papel: 'FALECIDO',
        estadoCivil: q('__falecido__')?.estadoCivil,
        uniaoEstavel: q('__falecido__')?.uniaoEstavel,
        conjugeNome: temSobrevivente ? nomeSobrev : q('__falecido__')?.conjugeNome,
        casamentoRegime: q('__falecido__')?.casamentoRegime,
        dataNascimento: q('__falecido__')?.dataNascimento,
      });
    }
    if (temSobrevivente && nomeSobrev.trim()) {
      pessoas.push({
        id: '__sobrevivente__',
        nome: nomeSobrev,
        papel: 'SOBREVIVENTE',
        estadoCivil: q('__sobrevivente__')?.estadoCivil,
        uniaoEstavel: q('__sobrevivente__')?.uniaoEstavel,
        conjugeNome: falecido.nome,
        casamentoRegime: q('__sobrevivente__')?.casamentoRegime,
        dataNascimento: q('__sobrevivente__')?.dataNascimento,
      });
    }
    for (const h of herdeiros) {
      pessoas.push({
        id: h.id,
        nome: h.nome,
        papel: 'HERDEIRO',
        estadoCivil: q(h.id)?.estadoCivil,
        uniaoEstavel: q(h.id)?.uniaoEstavel,
        conjugeNome: q(h.id)?.conjugeNome,
        casamentoRegime: q(h.id)?.casamentoRegime,
        dataNascimento: q(h.id)?.dataNascimento,
      });
    }
    return conferirQualificacoes({
      pessoas,
      certidoes,
      dataObitoInventario: falecido.dataObito || null,
    });
  }, [familia.certidoesCivis, familia.qualificacoes, falecido.nome, falecido.dataObito, temSobrevivente, nomeSobrev, herdeiros]);

  /**
   * COLAÇÃO aplicada (motor puro): bens doados em vida somam à massa de
   * cálculo e abatem do quinhão do herdeiro donatário — o espelho mostra o
   * quadro ajustado quando há colação lançada.
   */
  const resultadoColacoes = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0) return null;
    return aplicarColacoes(resultado, colacoes);
  }, [resultado, colacoes]);

  /**
   * ANTECIPADOR DE QUALIFICAÇÃO REGISTRAL (motor puro): confronto do ato com
   * as matrículas — o que o RI vai exigir junto ao traslado/formal.
   */
  const relatorioAntecipador = useMemo(() => {
    // Mesmo reconhecimento de imóvel do motor: por tipo, código 1xx da
    // declaração ou dados registrais na ficha — o antecipador não pode sumir
    // só porque a marcação interna `tipo` faltou num bem lido/antigo.
    if (!bens.some(ehImovelDeRegistro)) return null;
    return anteciparQualificacaoRegistral({
      falecido: {
        nome: falecido.nome,
        estadoCivil: familia.qualificacoes['__falecido__']?.estadoCivil ?? null,
      },
      temSobrevivente,
      nomeSobrev,
      regime,
      extrajudicial:
        fiscal.rito === 'EXTRAJUDICIAL' || fiscal.rito === 'JUDICIAL'
          ? fiscal.rito === 'EXTRAJUDICIAL'
          : resultado
            ? resultado.elegivelExtrajudicial
            : true,
      bens,
    });
  }, [bens, falecido.nome, familia.qualificacoes, temSobrevivente, nomeSobrev, regime, resultado, fiscal.rito]);

  /**
   * Monta o caso.json atual: cabeçalho vivo (autor, óbito, nº de documentos
   * e custo projetado saem da própria folha), dados = snapshot do wizard e
   * manifesto com a classificação sincronizada dos anexos.
   */
  const montarArquivoCasoAtual = async (): Promise<ArquivoCaso | null> => {
    const aberto = casoAbertoRef.current;
    if (!aberto) return null;
    const manifesto = manifestoRef.current.map((m) => {
      if (m.classificacao) return m;
      const docId = Object.keys(anexosProcesso).find((id) =>
        (anexosProcesso[id] ?? []).some((f) => f.name === m.nome),
      );
      return docId ? { ...m, classificacao: docId } : m;
    });
    manifestoRef.current = manifesto;
    const totalAdicionais = somaAdicionais(custosAdicionais);
    // Modo manual (fora de SP): o custo do cabeçalho é o informado.
    const custoTotal = manuais
      ? totalManual + totalAdicionais
      : provisao && custos
        ? provisao.total + custos.total + totalAdicionais
        : provisao
          ? provisao.total + totalAdicionais
          : null;
    return montarArquivoCaso({
      cabecalho: {
        ...aberto.cabecalho,
        autorDaHeranca: falecido.nome || aberto.cabecalho.autorDaHeranca,
        dataObito: falecido.dataObito || aberto.cabecalho.dataObito,
        qtdDocumentos: manifesto.filter((m) => !m.faltando).length,
        custoProjetado: custoTotal,
      },
      dados: montarSnapshot(),
      manifesto,
    });
  };

  /**
   * Espelha o arquivo salvo na nuvem da equipe (melhor-esforço). O servidor
   * recusa espelho que andaria PARA TRÁS (nuvem mais nova) — nesse caso um
   * aviso único sugere reabrir o caso para puxar a versão da equipe.
   */
  const espelharNaNuvem = async (arquivo: ArquivoCaso) => {
    try {
      const r = await salvarCasoNuvem(arquivo, { baseAtualizadoEm: null, espelho: true });
      if (r.ok && r.salvoEm) {
        baseNuvemRef.current = r.salvoEm;
      } else if (r.desatualizado && !avisoNuvemRef.current) {
        avisoNuvemRef.current = true;
        toast.info(
          `A nuvem tem uma versão MAIS NOVA deste caso (por ${r.desatualizado.atualizadoPor || 'outro dispositivo'}). Volte ao painel e reabra o caso para carregá-la — suas alterações continuam salvas na sua pasta.`,
        );
      }
    } catch {
      // espelho é melhor-esforço: o salvamento local já garantiu o caso
    }
  };

  /** Salva o caso aberto no store ativo, com a guarda de conflito. */
  const executarSalvamento = async (forcar = false): Promise<void> => {
    const s = storeRef.current;
    if (!casoAbertoRef.current) return;
    const arquivo = await montarArquivoCasoAtual();
    if (!arquivo) return;

    // Caso aberto DA NUVEM (não existe no store local): grava direto lá,
    // com a mesma guarda de conflito de três saídas.
    if (origemNuvemRef.current) {
      setSalvamento((v) => (v.estado === 'somente-leitura' ? v : { ...v, estado: 'salvando' }));
      const agora = new Date().toISOString();
      const arquivoNuvem: ArquivoCaso = {
        ...arquivo,
        cabecalho: {
          ...arquivo.cabecalho,
          atualizadoEm: agora,
          atualizadoPor: dispositivo || 'Membro da equipe',
        },
      };
      const r = await salvarCasoNuvem(arquivoNuvem, {
        baseAtualizadoEm: baseNuvemRef.current,
        forcar,
      });
      if (r.ok && r.salvoEm) {
        baseNuvemRef.current = r.salvoEm;
        baseAtualizadoEmRef.current = r.salvoEm;
        setConflito(null);
        setSalvamento({ estado: 'salvo', quando: r.salvoEm });
        setRascunhoSalvoEm(r.salvoEm);
      } else if (r.conflito) {
        const arquivoNoDisco = migrarArquivoCaso(r.conflito.arquivo);
        if (arquivoNoDisco) {
          setConflito({
            atualizadoEm: r.conflito.atualizadoEm,
            atualizadoPor: r.conflito.atualizadoPor,
            arquivoNoDisco,
          });
        }
        setSalvamento({ estado: 'erro', erro: 'conflito' });
      } else {
        setSalvamento({ estado: 'erro', erro: r.erro ?? 'Falha ao salvar na nuvem.' });
      }
      return;
    }

    if (!s) return;
    setSalvamento((v) => (v.estado === 'somente-leitura' ? v : { ...v, estado: 'salvando' }));
    const r = await s.salvarCaso(arquivo, {
      baseAtualizadoEm: baseAtualizadoEmRef.current,
      forcar,
    });
    if (r.ok && r.salvoEm) {
      baseAtualizadoEmRef.current = r.salvoEm;
      setConflito(null);
      setSalvamento({ estado: 'salvo', quando: r.salvoEm });
      setRascunhoSalvoEm(r.salvoEm);
      // Nuvem da equipe ativa: todo salvamento local espelha a folha lá
      // (documentos nunca sobem) — é o que compartilha o caso com a equipe.
      if (nuvemAtiva) {
        void espelharNaNuvem({
          ...arquivo,
          cabecalho: {
            ...arquivo.cabecalho,
            atualizadoEm: r.salvoEm,
            atualizadoPor: dispositivo || arquivo.cabecalho.atualizadoPor,
          },
        });
      }
    } else if (r.conflito) {
      setConflito(r.conflito);
      setSalvamento({ estado: 'erro', erro: 'conflito' });
    } else {
      setSalvamento({
        estado: r.erro?.includes('Permissão') ? 'somente-leitura' : 'erro',
        erro: r.erro,
      });
    }
  };
  /**
   * Salvamentos SERIALIZADOS (fila de um): o flush de blur/aba escondida
   * dispara junto do debounce, e dois salvamentos em paralelo faziam o
   * segundo ler a base antiga e enxergar a PRÓPRIA gravação anterior como
   * "conflito de outro computador". Encadeando, cada salvamento parte da
   * base já atualizada pelo anterior.
   */
  const filaSalvamentoRef = useRef<Promise<void>>(Promise.resolve());
  const salvarAgora = (forcar = false): Promise<void> => {
    const proximo = filaSalvamentoRef.current.then(() => executarSalvamento(forcar));
    filaSalvamentoRef.current = proximo.catch(() => undefined);
    return proximo;
  };
  const salvarAgoraRef = useRef(salvarAgora);
  useEffect(() => {
    salvarAgoraRef.current = salvarAgora;
  });

  // Salvamento automático: 1s após a última alteração da folha.
  useEffect(() => {
    if (!restauradoRef.current || !casoAberto) return;
    const t = setTimeout(() => {
      void salvarAgoraRef.current();
    }, 1000);
    return () => clearTimeout(t);
  }, [familia, bens, dividasEspolio, checklistAcervo, sociedades, fiscal, modulosFiscais, sobrepartilhaAberta, notasCaso, colacoes, custosAdicionais, passo, matriz, anotacoesMatriz, titulo, condicoesHonorarios, casoId, convites, painelFamilia, responsaveisDocs, tarefasCaso, casoAberto]);

  // Flush ao esconder/perder o foco/fechar — o que der para gravar, grava.
  useEffect(() => {
    const flush = () => void salvarAgoraRef.current();
    const aoEsconder = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', aoEsconder);
    window.addEventListener('blur', flush);
    window.addEventListener('beforeunload', flush);
    return () => {
      document.removeEventListener('visibilitychange', aoEsconder);
      window.removeEventListener('blur', flush);
      window.removeEventListener('beforeunload', flush);
    };
  }, []);

  /**
   * Ações dos cards de economia: quando o advogado ACEITA a sugestão, o
   * sistema redesenha a partilha diferenciada na hora (a matriz é
   * preenchida/limpada e a folha recalcula tudo — sempre para conferência).
   */

  /** Linha da matriz com 2 casas, ajustada no maior valor para fechar 100. */
  const fecharLinha = (pcts: Record<string, number>): Record<string, string> => {
    const ids = Object.keys(pcts).filter((id) => pcts[id] > 0);
    if (ids.length === 0) return {};
    const arred = ids.map((id) => ({ id, pct: Math.round(pcts[id] * 100) / 100 }));
    const soma = arred.reduce((a, x) => a + x.pct, 0);
    let maior = 0;
    for (let i = 1; i < arred.length; i++) if (arred[i].pct > arred[maior].pct) maior = i;
    arred[maior].pct = Math.round((arred[maior].pct + (100 - soma)) * 100) / 100;
    return Object.fromEntries(
      arred.filter((x) => x.pct > 0).map((x) => [x.id, x.pct.toFixed(2).replace('.', ',')]),
    );
  };

  /**
   * Linha do redesenho em FRAÇÕES exatas quando cada parcela casa com uma
   * fração pequena E a soma fecha o bem inteiro ("1/3" + "1/3" + "1/3");
   * senão, percentuais com o ajuste de 2 casas. É o que impede 33,33 +
   * 33,33 + 33,34 de fabricar uma torna de centavos.
   */
  const linhaDoRedesenho = (pcts: Record<string, number>): Record<string, string> => {
    const ids = Object.keys(pcts).filter((id) => pcts[id] > 0);
    const fracoes = ids.map((id) => fracaoBonita(pcts[id]));
    if (ids.length > 0 && fracoes.every((f): f is string => f !== null)) {
      const rats = fracoes.map((f) => f.split('/').map(Number) as [number, number]);
      const den = rats.reduce((a, [, d]) => mmc(a, d), 1);
      const soma = rats.reduce((a, [n, d]) => a + n * (den / d), 0);
      if (soma === den) return Object.fromEntries(ids.map((id, i) => [id, fracoes[i]]));
    }
    return fecharLinha(pcts);
  };

  /**
   * Sugestão do usufruto aceita: cada imóvel é dividido pelos COEFICIENTES
   * fiscais do RITCMD-SP — o(a) sobrevivente reserva o USUFRUTO VITALÍCIO
   * (1/3) e os herdeiros ficam com a NUA-PROPRIEDADE (2/3, rateada pela
   * proporção do direito entre si). O(a) sobrevivente é ainda compensado(a)
   * com os bens não-imóveis até o seu quinhão, minimizando a torna. O espelho
   * recebe os rótulos "usufruto vitalício" e "% da nua-propriedade" sob cada
   * célula, e a reserva entra como cláusula na minuta.
   */
  const redesenharComUsufruto = () => {
    if (!resultado || resultado.bloqueios.length > 0) return;
    const sobrev = participantes.find((p) => p.id === '__sobrevivente__');
    const herdeirosPart = participantes.filter((p) => p.id !== '__sobrevivente__');
    const dirHerdeiros = herdeirosPart.map((p) => direitoPorParticipante[p.id] ?? 0);
    const somaHerd = dirHerdeiros.reduce((a, v) => a + v, 0);
    if (somaHerd <= 0) return;

    const nova: Record<string, Record<string, string>> = {};
    const anot: Record<string, Record<string, string>> = {};
    const PCT_USUFRUTO = 100 / 3; // coeficiente fiscal do usufruto (1/3)
    const fmtPct = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

    for (const b of bens) {
      if (b.tipo !== 'IMOVEL') continue;
      if (sobrev) {
        // Usufruto (1/3) ao sobrevivente + nua-propriedade (2/3) rateada.
        nova[b.id] = linhaDoRedesenho({
          [sobrev.id]: PCT_USUFRUTO,
          ...Object.fromEntries(
            herdeirosPart.map((p, i) => [p.id, (dirHerdeiros[i] / somaHerd) * (100 - PCT_USUFRUTO)]),
          ),
        });
        anot[b.id] = {
          [sobrev.id]: 'usufruto vitalício',
          ...Object.fromEntries(
            herdeirosPart.map((p, i) => [
              p.id,
              `${fmtPct((dirHerdeiros[i] / somaHerd) * 100)}% da nua-propriedade`,
            ]),
          ),
        };
      } else {
        // Sem sobrevivente: herdeiros em plena propriedade, pela proporção.
        nova[b.id] = linhaDoRedesenho(
          Object.fromEntries(herdeirosPart.map((p, i) => [p.id, (dirHerdeiros[i] / somaHerd) * 100])),
        );
      }
    }

    // Compensação do(a) sobrevivente: o usufruto (1/3 dos imóveis) já cobre
    // parte do quinhão; o restante é buscado nos bens não-imóveis, do maior
    // para o menor — o que sobrar vira a torna, apontada pelo espelho.
    if (sobrev) {
      const valorUsufrutoImoveis = bens
        .filter((b) => b.tipo === 'IMOVEL')
        .reduce((a, b) => a + Number(b.valor) / 3, 0);
      let alvoSobrev = Math.max(
        0,
        (direitoPorParticipante['__sobrevivente__'] ?? 0) - valorUsufrutoImoveis,
      );
      const naoImoveis = bens
        .filter((b) => b.tipo !== 'IMOVEL')
        .sort((a, b) => Number(b.valor) - Number(a.valor));
      for (const b of naoImoveis) {
        const v = Number(b.valor);
        if (v <= 0) continue;
        if (alvoSobrev <= 0) {
          nova[b.id] = linhaDoRedesenho(
            Object.fromEntries(herdeirosPart.map((p, i) => [p.id, (dirHerdeiros[i] / somaHerd) * 100])),
          );
          continue;
        }
        const pctSobrev = Math.min(100, (alvoSobrev / v) * 100);
        alvoSobrev = Math.max(0, alvoSobrev - v);
        const resto = 100 - pctSobrev;
        nova[b.id] = linhaDoRedesenho({
          __sobrevivente__: pctSobrev,
          ...Object.fromEntries(
            herdeirosPart.map((p, i) => [p.id, (dirHerdeiros[i] / somaHerd) * resto]),
          ),
        });
      }
    }

    setMatriz(nova);
    setAnotacoesMatriz(anot);
    setPasso(2);
    toast.success('Partilha redesenhada com usufruto (1/3) e nua-propriedade (2/3)', {
      description:
        'Cada imóvel foi dividido pelos coeficientes fiscais em FRAÇÕES EXATAS: 1/3 de usufruto vitalício ao(à) sobrevivente e 2/3 de nua-propriedade aos herdeiros — sem dízima e sem torna de centavos. Inclua a RESERVA DE USUFRUTO na minuta e confira a torna e as custas extra no card antes de gerar.',
    });
  };

  /** Sugestão aceita: partilha na proporção exata do direito — sem torna. */
  const redesenharSemTorna = () => {
    setMatriz({});
    setAnotacoesMatriz({});
    setPasso(2);
    toast.success('Partilha redesenhada na proporção do direito', {
      description:
        'Todas as linhas voltaram ao espelho legal: sem diferença de quinhão, sem torna e sem imposto de cessão.',
    });
  };

  /** Sugestão aceita: a diferença passa a ser cedida de graça (doação). */
  const converterParaGratuita = () => {
    setTitulo('GRATUITO');
    setPasso(2);
    toast.success('Diferença convertida em cessão gratuita', {
      description:
        'O acerto deixou de ser reposição onerosa (ITBI) e passou a doação — dentro de 2.500 UFESPs por donatário/ano, isenta (art. 6º, II, "a"). Só vale se a parte cedente realmente dispensar a compensação.',
    });
  };

  /**
   * Oportunidades de economia (motor puro): isenções e prazos deste
   * inventário, tornas dentro da isenção de doação e o planejamento do
   * usufruto no lugar do segundo inventário do(a) sobrevivente.
   */
  const economias = useMemo(() => {
    if (!resultado || resultado.bloqueios.length > 0) return [];
    const transferencias =
      atribuicao && atribuicao.bloqueios.length === 0
        ? atribuicao.transferencias.map((t) => ({
            valor: Number(t.valor),
            titulo: t.titulo,
            tributo: t.tributo,
            imposto: t.imposto === null ? null : Number(t.imposto),
          }))
        : [];
    return mapearEconomias({
      valorSobrevivente: direitoPorParticipante['__sobrevivente__'] ?? 0,
      nomeSobrevivente: temSobrevivente ? nomeSobrev || null : null,
      bens: bens.map((b) => ({ descricao: b.descricao, valor: Number(b.valor), tipo: b.tipo })),
      imposto: provisao?.imposto ?? null,
      diasDesdeObito: provisao?.diasDesdeObito ?? null,
      protocolado: Boolean(fiscal.inventarioAberto),
      valorIsento: isencoes?.valorIsento ?? 0,
      ufespReferencia: provisao?.ufespReferencia ?? null,
      // Donatários da torna da reserva: os herdeiros que efetivamente herdam.
      qtdHerdeiros: herdeiros.filter((h) => h.status !== 'RENUNCIANTE').length,
      extrajudicial:
        fiscal.rito === 'EXTRAJUDICIAL' || fiscal.rito === 'JUDICIAL'
          ? fiscal.rito === 'EXTRAJUDICIAL'
          : resultado.elegivelExtrajudicial,
      transferencias,
      issPct: Math.min(5, Math.max(2, Number(fiscal.issPct ?? '5') || 5)),
    });
  }, [
    resultado,
    atribuicao,
    direitoPorParticipante,
    temSobrevivente,
    nomeSobrev,
    bens,
    herdeiros,
    provisao,
    fiscal.inventarioAberto,
    fiscal.issPct,
    fiscal.rito,
    isencoes,
  ]);

  /* --- etapa 0: mesclagem da leitura na folha (campo vazio primeiro) --- */
  const aplicarLeitura = (lido: CasoExtraido, arquivos: ArquivoClassificado[]) => {
    // Manifesto: casa os arquivos arrastados com o que o caso conhece —
    // religamento por hash no modo portátil (no modo pasta, a varredura da
    // própria pasta já religa ao abrir).
    if (casoAbertoRef.current && arquivos.length > 0) {
      const infos: InfoArquivoDisco[] = arquivos.map(({ file }) => ({
        caminhoRelativo:
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        nome: file.name,
        tamanho: file.size,
        lastModified: file.lastModified,
        mime: file.type || undefined,
        file,
      }));
      void casarManifesto(infos, manifestoRef.current, async (a) =>
        a.file ? sha256DeBlob(a.file) : '',
      ).then((diff) => {
        manifestoRef.current = diff.manifesto.map((m) => {
          if (m.classificacao) return m;
          const a = arquivos.find((x) => x.file.name === m.nome && x.documentoId);
          return a?.documentoId ? { ...m, classificacao: a.documentoId } : m;
        });
        if (diff.resumo.religados + diff.resumo.movidos + diff.resumo.faltando > 0) {
          toast.info(resumoDoDiff(diff));
        }
      });
    }
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
      if (!fal.nome && lido.falecido.nome) fal.nome = nomeProprio(lido.falecido.nome);
      if (!fal.cpf && lido.falecido.cpf) fal.cpf = lido.falecido.cpf;
      if (!fal.dataObito && lido.falecido.dataObito) fal.dataObito = lido.falecido.dataObito;
      if (!fal.dataCasamento && lido.falecido.dataCasamento)
        fal.dataCasamento = lido.falecido.dataCasamento;
      if (!fal.ultimoDomicilio && lido.falecido.ultimoDomicilio)
        fal.ultimoDomicilio = lido.falecido.ultimoDomicilio;
      if (!fal.localFalecimento && lido.falecido.localFalecimento)
        fal.localFalecimento = lido.falecido.localFalecimento;
      if (!fal.certidaoObito && lido.falecido.certidaoObito)
        fal.certidaoObito = lido.falecido.certidaoObito;
      if (!fal.certidaoCasamento && lido.falecido.certidaoCasamento)
        fal.certidaoCasamento = lido.falecido.certidaoCasamento;

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
          if (h.nome.trim().length > visto.nome.trim().length) visto.nome = nomeProprio(h.nome);
          if (!visto.qualificacao && h.qualificacao) visto.qualificacao = h.qualificacao;
          continue;
        }
        // Nome padronizado: primeira maiúscula, resto minúsculo (partículas preservadas).
        lidos.push({ ...h, nome: nomeProprio(h.nome) });
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

      // Ficha do(a) falecido(a) (certidão de óbito/planilha) — qualifica o
      // "de cujus" na escritura e nas petições.
      if (lido.falecido.qualificacao) {
        // GUARDA do estado civil: a certidão de CASAMENTO qualifica os
        // nubentes como "solteiros" À ÉPOCA DO ATO — lida junto com a
        // certidão de óbito, esse "solteiro" NÃO pode virar o estado civil
        // do(a) falecido(a) (caso real: CC + CO no mesmo lote preencheram
        // "solteiro" para autor casado). Havendo casamento no conjunto,
        // o estado civil que entra é "casado(a)".
        const qFal = { ...lido.falecido.qualificacao };
        const houveCasamento =
          (lido.sobrevivente.existe === true &&
            (lido.sobrevivente.vinculo ?? 'CASAMENTO') === 'CASAMENTO') ||
          Boolean(fal.certidaoCasamento?.trim() || fal.dataCasamento);
        if (
          houveCasamento &&
          (!qFal.estadoCivil || qFal.estadoCivil.toLowerCase().includes('solteir'))
        ) {
          qFal.estadoCivil = 'casado(a)';
        }
        qualificacoes['__falecido__'] = preencherVazios(
          qualificacoes['__falecido__'] ?? QUALIFICACAO_VAZIA,
          qFal,
        );
      }

      return {
        ...prev,
        falecido: fal,
        temSobrevivente:
          lido.sobrevivente.existe !== null ? lido.sobrevivente.existe : prev.temSobrevivente,
        vinculo: lido.sobrevivente.vinculo ?? prev.vinculo,
        regime: lido.sobrevivente.regime ?? prev.regime,
        nomeSobrev: prev.nomeSobrev || nomeProprio(lido.sobrevivente.nome ?? ''),
        herdeiros: todos,
        qualificacoes,
        perguntas,
        inventarianteId,
        // Declarados na certidão de óbito: guardados para o alerta de
        // documentação/qualificação faltante e para a provisão de certidões.
        herdeirosDeclarados: (() => {
          const atuais = prev.herdeirosDeclarados ?? [];
          const novosDecl = lido.herdeirosNoObito
            .map((n) => nomeProprio(semQualificadoresDeNome(n)))
            .filter((n) => n && !atuais.some((x) => mesmaPessoa(x, n)));
          return [...atuais, ...novosDecl];
        })(),
        // Certidões do registro civil lidas: acumulam (dedup por tipo +
        // titular) e alimentam o conferidor de qualificação cruzada.
        certidoesCivis: (() => {
          const atuais = prev.certidoesCivis ?? [];
          const novas = (lido.certidoesCivis ?? []).filter(
            (c) =>
              !atuais.some(
                (x) => x.tipo === c.tipo && mesmaPessoa(x.pessoa, c.pessoa),
              ),
          );
          return novas.length > 0 ? [...atuais, ...novas] : atuais;
        })(),
      };
    });

    if (lido.bens.length > 0) {
      // UM imóvel pode vir em mais de uma inscrição municipal (Guarulhos:
      // 084.33.20.0048.01.000 e ...02.000): funde em um bem só, com os
      // valores SOMADOS — um ato de registro, não dois.
      const bensLidos = fundirImoveisPorInscricao(lido.bens);
      const soDigitos = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');
      // Preenche só o que está vazio — detalhe já digitado/lido nunca é
      // sobrescrito, mas leitura NOVA completa as lacunas que faltavam.
      const preencherDetalhes = (
        atual: object | undefined,
        lidoDet: object | null | undefined,
      ): Record<string, unknown> | undefined => {
        if (!lidoDet) return atual as Record<string, unknown> | undefined;
        const doLido = Object.fromEntries(
          Object.entries(lidoDet).filter(([, v]) => v !== null && v !== undefined && v !== ''),
        );
        const doAtual = Object.fromEntries(
          Object.entries(atual ?? {}).filter(([, v]) => v !== null && v !== undefined && v !== ''),
        );
        const junto = { ...doLido, ...doAtual };
        return Object.keys(junto).length > 0 ? junto : (atual as Record<string, unknown> | undefined);
      };
      // Certidões de valor venal preenchem os CAMPOS DE VALOR do bem pelos
      // exercícios: venal do ano do ÓBITO → valor do fato gerador
      // (bem.valor); venal do exercício CORRENTE → bem.valorVenal. Só campo
      // vazio/zerado — valor já digitado nunca é sobrescrito. Certidões
      // FRACIONADAS já chegam SOMADAS (fundirImoveisPorInscricao); fração
      // total abaixo de 100% ganha aviso para conferir a certidão faltante.
      const vazio = (v: string | undefined) => !v || !(Number(v) > 0);
      const aplicarVenais = <T extends { valor: string; valorVenal?: string; imovel?: { valorVenalObito?: string; valorVenalAtual?: string; fracaoIdeal?: string; percentualVenal?: string } }>(bem: T): T => {
        const det = bem.imovel;
        if (!det) return bem;
        // % do venal (imóvel em ÁREA MAIOR na prefeitura): se o usuário já
        // informou o percentual na ficha, a certidão entra pelo EFETIVO.
        const pctBruto = Number(String(det.percentualVenal ?? '').replace(',', '.'));
        const fator =
          Number.isFinite(pctBruto) && pctBruto > 0 && pctBruto <= 100 ? pctBruto / 100 : 1;
        const efetivo = (v: string) => (Number(v) * fator).toFixed(2);
        const comObito =
          vazio(bem.valor) && det.valorVenalObito && Number(det.valorVenalObito) > 0
            ? { valor: efetivo(det.valorVenalObito) }
            : {};
        const comAtual =
          vazio(bem.valorVenal) && det.valorVenalAtual && Number(det.valorVenalAtual) > 0
            ? { valorVenal: efetivo(det.valorVenalAtual) }
            : {};
        return { ...bem, ...comObito, ...comAtual };
      };
      // NATUREZA decidida pelo REGISTRO AQUISITIVO × regime quando a IA não
      // afirmou: na comunhão PARCIAL, o(a) falecido(a) constando SOLTEIRO(A)
      // no registro pelo qual adquiriu = bem de ANTES do casamento →
      // PARTICULAR (sem meação — muda partilha e orçamento); nos regimes de
      // separação, PARTICULAR; nos demais (ou sem elementos), COMUM.
      const regimeLido = lido.sobrevivente.regime ?? regime;
      const nomeDoAutor = lido.falecido.nome ?? falecido.nome;
      const naturezaDoBem = (b: (typeof bensLidos)[number]): 'COMUM' | 'PARTICULAR' => {
        if (b.natureza) return b.natureza;
        if (regimeLido === 'SEPARACAO_CONVENCIONAL' || regimeLido === 'SEPARACAO_OBRIGATORIA')
          return 'PARTICULAR';
        const prop = b.imovel?.proprietariosMatricula ?? '';
        const adquiriuSolteiro =
          Boolean(nomeDoAutor) &&
          (mesmaPessoa(nomeDoAutor, prop) || nomeConstaEm(nomeDoAutor, prop)) &&
          /solteir/i.test(prop);
        if (regimeLido === 'COMUNHAO_PARCIAL' && adquiriuSolteiro) return 'PARTICULAR';
        return 'COMUM';
      };
      // Aviso das frações: certidões que não fecham o imóvel inteiro.
      for (const b of bensLidos) {
        const fr = Number(String(b.imovel?.fracaoIdeal ?? '').replace(',', '.'));
        if (Number.isFinite(fr) && fr > 0 && fr < 99.99) {
          toast.warning(`Certidões de venal somam ${fr.toLocaleString('pt-BR')}% — ${b.descricao}`, {
            description:
              'Se o(a) falecido(a) era dono(a) do imóvel INTEIRO, falta certidão de fração (inscrição) — os venais preenchidos estão parciais. Titularidade realmente fracionária: está correto.',
            duration: 12000,
          });
        }
      }
      setBens((prev) => {
        // Bem já lançado ganha os DETALHES lidos (matrícula, valores venais,
        // CRLV): casa por descrição igual OU pela MATRÍCULA (a matrícula lida
        // aparecendo na descrição/detalhe do bem já lançado).
        const casados = new Set<(typeof bensLidos)[number]>();
        const atualizados = prev.map((bem) => {
          const lidoB = bensLidos.find((x) => {
            if (casados.has(x)) return false;
            if (x.descricao.trim().toLowerCase() === bem.descricao.trim().toLowerCase()) return true;
            const matLida = soDigitos(x.imovel?.matricula as string | undefined);
            if (matLida.length >= 3) {
              if (soDigitos(bem.imovel?.matricula) === matLida) return true;
              if (soDigitos(bem.descricao).includes(matLida)) return true;
            }
            // MESMA inscrição municipal (dígitos): certidão de venal sem
            // matrícula casa com o imóvel já lançado — nunca vira 2º bem.
            const insLida = soDigitos(x.imovel?.inscricaoCadastral as string | undefined);
            if (insLida.length >= 6 && soDigitos(bem.imovel?.inscricaoCadastral) === insLida)
              return true;
            return false;
          });
          if (!lidoB) return bem;
          casados.add(lidoB);
          return aplicarVenais({
            ...bem,
            imovel: preencherDetalhes(bem.imovel, lidoB.imovel) as typeof bem.imovel,
            veiculo: preencherDetalhes(bem.veiculo, lidoB.veiculo) as typeof bem.veiculo,
            financeiro: preencherDetalhes(bem.financeiro, lidoB.financeiro) as typeof bem.financeiro,
          });
        });
        const novos = bensLidos
          .filter((b) => !casados.has(b))
          // A IDENTIDADE do imóvel é a MATRÍCULA: bem lido cuja matrícula já
          // está lançada (na ficha ou na descrição) NUNCA entra como segundo
          // bem — certidões de venal de exercícios diferentes são o MESMO
          // imóvel (os detalhes já entraram pelo casamento acima).
          .filter((b) => {
            const matLida = soDigitos(b.imovel?.matricula as string | undefined);
            const insLida = soDigitos(b.imovel?.inscricaoCadastral as string | undefined);
            return !atualizados.some(
              (x) =>
                x.descricao.trim().toLowerCase() === b.descricao.trim().toLowerCase() ||
                (matLida.length >= 3 &&
                  (soDigitos(x.imovel?.matricula) === matLida ||
                    soDigitos(x.descricao).includes(matLida))) ||
                (insLida.length >= 6 && soDigitos(x.imovel?.inscricaoCadastral) === insLida),
            );
          })
          .map((b) =>
            aplicarVenais({
              id: uid('b'),
              descricao: b.descricao,
              valor: b.valor ?? '0.00',
              natureza: naturezaDoBem(b),
              tipo: b.tipo ?? ('OUTRO' as const),
              ...(b.imovel
                ? { imovel: Object.fromEntries(Object.entries(b.imovel).filter(([, v]) => v !== null)) as NonNullable<Bem['imovel']> }
                : {}),
              ...(b.veiculo
                ? { veiculo: Object.fromEntries(Object.entries(b.veiculo).filter(([, v]) => v !== null)) }
                : {}),
              ...(b.financeiro
                ? { financeiro: Object.fromEntries(Object.entries(b.financeiro).filter(([, v]) => v !== null)) }
                : {}),
            }),
          );
        return [...atualizados, ...novos];
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

  /**
   * Cláusulas adicionais redigidas pela IA a partir das INSTRUÇÕES digitadas
   * no campo de prompt — para os documentos determinísticos (minuta ao
   * tabelionato e escritura). Falha vira aviso; a geração segue sem elas.
   */
  const redigirClausulas = async (alvo: string, instrucoes: string): Promise<SecaoRedigida[] | null> => {
    if (!instrucoes.trim()) return null;
    try {
      const r = await fetch('/api/sucessorista', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: 'CLAUSULAS',
          contexto: `Documento-alvo: ${alvo}.\n${contextoDoCaso()}`,
          modeloEscritorio: null,
          instrucoes,
        }),
      });
      const corpo = (await r.json().catch(() => null)) as { secoes?: SecaoRedigida[]; error?: string } | null;
      if (!r.ok || !corpo?.secoes?.length) throw new Error(corpo?.error ?? `HTTP ${r.status}`);
      return corpo.secoes;
    } catch (e) {
      toast.warning('As instruções à IA não puderam ser atendidas — o documento saiu sem as cláusulas adicionais.', {
        description: e instanceof Error ? e.message : undefined,
      });
      return null;
    }
  };

  /** Minuta de petição ao Tabelionato (.docx) a partir da folha inteira. */
  const gerarPeticao = async (instrucoes = '') => {
    const extras = instrucoes.trim()
      ? await redigirClausulas('minuta de requerimento de lavratura de escritura de inventário e partilha, dirigida a Tabelionato de Notas (estilo forense)', instrucoes)
      : null;
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
    }, extras);
    baixarBlob(
      blob,
      `Peticao - Inventario${falecido.nome ? ` de ${falecido.nome}` : ''}.docx`,
    );
    registrarDoc('MINUTA_TABELIONATO', {
      comIa: extras !== null,
      comInstrucoes: instrucoes.trim().length > 0,
      itens: herdeiros.length,
    });
  };

  /* --- Arquivo do caso (.json): salva na pasta do processo, reabre depois --- */

  const exportarCaso = () => {
    const arquivo = {
      app: 'sucessorista',
      exportadoEm: new Date().toISOString(),
      ...montarSnapshot(),
    };
    baixarBlob(
      new Blob([JSON.stringify(arquivo, null, 2)], { type: 'application/json' }),
      `Caso${falecido.nome ? ` - ${falecido.nome}` : ''}.sucessorista.json`,
    );
    toast.success('Arquivo do caso exportado', {
      description:
        'Guarde o .json na pasta do processo, junto dos documentos. Os anexos não vão no arquivo — ficam na própria pasta.',
    });
    registrarDoc('ARQUIVO_CASO', { itens: bens.length });
  };

  const importarCaso = async (file: File) => {
    try {
      const dados = JSON.parse(await file.text()) as CasoSalvo & { app?: string };
      if (dados?.v !== 1) throw new Error('Formato não reconhecido.');
      aplicarSnapshot(dados);
      toast.success('Arquivo do caso importado — confira a folha', {
        description: 'Reanexe os documentos da pasta do processo no item 0 ou no item V.',
      });
    } catch (e) {
      toast.error('Não foi possível importar o arquivo do caso.', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  const novoCaso = async () => {
    await limparRascunho();
    try {
      sessionStorage.removeItem(CHAVE_CASO);
    } catch {
      // modo restrito: o reload abaixo resolve do mesmo jeito
    }
    // Recomeçar do zero exige RELOAD de verdade (navegação client-side
    // preservaria os estados preenchidos) — exceção consciente à regra.
    // Desde a remodelagem LexCausa o módulo mora em /s (a raiz é o hub).
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/s';
  };

  /**
   * "Converter em inventário" (LexCausa fase 3): a contratação do Radar chega
   * por /s?importar=<código do handoff> e vira um caso NOVO no store ativo —
   * resgata o intake, monta o CasoSalvo no navegador (intakeParaCaso), cria a
   * pasta e confirma a importação (o servidor PODA o intake).
   */
  const importarDoRadar = async (codigo: string) => {
    const s = storeRef.current;
    if (!s) return;
    const r = await resgatarIntake(codigo);
    if (!r.ok || !r.respostas) {
      toast.error('Não foi possível importar o caso prospectado', { description: r.erro });
      return;
    }
    const dados = intakeParaCaso(r.respostas, {
      casoId: `caso-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`,
      gerarId: (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`,
    });
    try {
      origemNuvemRef.current = false;
      baseNuvemRef.current = null;
      avisoNuvemRef.current = false;
      const caso = await s.criarCaso(
        r.nome ? `Família ${r.nome}` : `Novo negócio ${codigo}`,
        dados,
      );
      manifestoRef.current = [];
      baseAtualizadoEmRef.current = caso.cabecalho.atualizadoEm;
      aplicarSnapshot(dados as unknown as CasoSalvo);
      setCasoAberto({ cabecalho: caso.cabecalho });
      setSalvamento({ estado: 'salvo', quando: caso.cabecalho.atualizadoEm });
      irPara('caso');
      await confirmarImportacaoIntake(codigo);
      toast.success('Caso prospectado virou inventário — confira a folha', {
        description:
          (r.nome || r.email
            ? `Contato de quem respondeu: ${[r.nome, r.email].filter(Boolean).join(' · ')}. `
            : '') +
          'Valores por faixa e fichas em branco: complete com os documentos. Os dados saíram do servidor.',
      });
    } catch (e) {
      toast.error('Não consegui criar a pasta do caso.', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
  };

  /* Chegada por /s?importar=<código> — espera o store ficar pronto e roda
     UMA vez; o parâmetro sai da URL antes (F5 não importa duas vezes). */
  const importarRadarRef = useRef(false);
  useEffect(() => {
    if (importarRadarRef.current || casoAberto || casoInicialId || !store) return;
    const codigo = new URLSearchParams(window.location.search).get('importar');
    if (!codigo) return;
    importarRadarRef.current = true;
    window.history.replaceState(null, '', '/s');
    // Diferido (convenção): o efeito só agenda; nada de setState direto aqui.
    const t = setTimeout(() => void importarDoRadar(codigo.trim().toUpperCase()), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, casoAberto, casoInicialId]);

  /** Contexto textual do caso para a redação por IA (nunca os documentos). */
  const contextoDoCaso = (): string => {
    const linhas: string[] = [];
    linhas.push(
      `Inventário de ${falecido.nome || '(nome não informado)'}${falecido.dataObito ? `, óbito em ${falecido.dataObito}` : ''}${falecido.ultimoDomicilio ? `, último domicílio ${falecido.ultimoDomicilio}` : ''}.`,
    );
    linhas.push(
      temSobrevivente
        ? `Cônjuge/companheiro(a) sobrevivente: ${nomeSobrev || '(nome não informado)'} (${vinculo === 'CASAMENTO' ? 'casamento' : 'união estável'}).`
        : 'Sem cônjuge/companheiro(a) sobrevivente.',
    );
    linhas.push(
      `Herdeiros (${herdeiros.length}): ${herdeiros.map((h) => `${h.nome}${h.status !== 'ATIVO' ? ` [${h.status}]` : ''}${h.menorOuIncapaz ? ' [menor/incapaz]' : ''}`).join('; ') || '(nenhum lançado)'}.`,
    );
    linhas.push(
      `Acervo (${bens.length} bem/ns): ${bens.map((b, i) => `${i + 1}. ${b.descricao} — ${brl(b.valor)} (${b.natureza})`).join('; ') || '(nenhum lançado)'}.`,
    );
    if (resultado && resultado.bloqueios.length === 0) {
      linhas.push(
        `Monte-mor ${brl(resultado.acervo.massaPartilhavel)}${resultado.meacao ? `; meação ${brl(resultado.meacao.valor)}` : ''}; herança ${brl(resultado.heranca.total)}. Quinhões: ${resultado.quinhoes.map((q) => `${q.nome} ${q.fracaoHeranca} = ${brl(q.valor)}`).join('; ')}.`,
      );
    }
    if (provisao) {
      linhas.push(
        `ITCMD: base ${brl(provisao.baseAtualizada.toFixed(2))}, imposto ${brl(provisao.imposto.toFixed(2))}, provisão ${brl(provisao.total.toFixed(2))}.`,
      );
    }
    return linhas.join('\n').slice(0, 18_000);
  };

  /** Minuta de petição INICIAL de inventário judicial (IA + fallback local). */
  const gerarPeticaoJudicial = async (instrucoes = '', modeloTexto: string | null = null) => {
    let secoes: SecaoRedigida[] | null = null;
    try {
      const r = await fetch('/api/sucessorista', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          tipo: 'PETICAO_JUDICIAL',
          contexto: contextoDoCaso(),
          // Padrão do PRÓPRIO escritório, quando anexado — a redação o segue.
          modeloEscritorio: modeloTexto,
          instrucoes: instrucoes.trim() || null,
        }),
      });
      const corpo = (await r.json().catch(() => null)) as { secoes?: SecaoRedigida[]; error?: string } | null;
      if (r.ok && corpo?.secoes?.length) secoes = corpo.secoes;
      else throw new Error(corpo?.error ?? `HTTP ${r.status}`);
    } catch (e) {
      toast.warning('Redação por IA indisponível — a minuta saiu com a redação padrão local.', {
        description: e instanceof Error ? e.message : undefined,
      });
    }
    const { montarPeticaoJudicialDocx } = await import('@/lib/partilha/peticao-judicial');
    const blob = await montarPeticaoJudicialDocx({
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
      secoes,
    });
    baixarBlob(blob, `Peticao inicial - Inventario judicial${falecido.nome ? ` de ${falecido.nome}` : ''}.docx`);
    // comIa=false aqui significa que a IA falhou e valeu o fallback local —
    // é a métrica de saúde da redação assistida neste módulo.
    registrarDoc('PETICAO_JUDICIAL', {
      comIa: secoes !== null,
      comInstrucoes: instrucoes.trim().length > 0,
      itens: herdeiros.length,
    });
  };

  /**
   * Minuta da ESCRITURA (perfil escrevente) — determinística, do modelo do
   * balcão. Com o MODELO DA SERVENTIA anexado, a redação por IA preenche o
   * padrão PRÓPRIO do escrevente com os dados do caso; se a IA falhar, sai o
   * modelo padrão do sistema — nunca vazia.
   */
  const gerarEscritura = async (
    modalidade: ModalidadeEscritura,
    partesRemotas: string,
    instrucoes = '',
    modeloTexto: string | null = null,
  ) => {
    // Caminho do MODELO PRÓPRIO: a IA redige a escritura inteira seguindo a
    // estrutura/estilo do modelo da serventia, com os dados do caso.
    if (modeloTexto) {
      try {
        const r = await fetch('/api/sucessorista', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            tipo: 'ESCRITURA',
            contexto: `${contextoDoCaso()}\nModalidade do ato: ${modalidade === 'PRESENCIAL' ? 'presencial' : modalidade === 'VIDEOCONFERENCIA' ? 'por videoconferência (e-Notariado)' : `híbrida (por videoconferência: ${partesRemotas || '______'})`}.`,
            modeloEscritorio: modeloTexto,
            instrucoes: instrucoes.trim() || null,
          }),
        });
        const corpo = (await r.json().catch(() => null)) as { secoes?: SecaoRedigida[]; error?: string } | null;
        if (r.ok && corpo?.secoes?.length) {
          // DOCX na formatação do balcão (Tahoma, títulos centralizados).
          const { montarDocxRico } = await import('@/lib/partilha/docx');
          const blob = await montarDocxRico(
            corpo.secoes.flatMap((s) => [
              { tipo: 'p' as const, texto: s.titulo.toUpperCase(), titulo: true, negrito: true },
              ...s.paragrafos.map((p) => ({ tipo: 'p' as const, texto: p })),
            ]),
            { estilo: { fonte: 'Tahoma', tamanho: 22, tituloCentrado: true } },
          );
          baixarBlob(blob, `Minuta de escritura - Inventario${falecido.nome ? ` de ${falecido.nome}` : ''}.docx`);
          registrarDoc('ESCRITURA', {
            comIa: true,
            comInstrucoes: instrucoes.trim().length > 0,
            modalidade,
          });
          return;
        }
        throw new Error(corpo?.error ?? `HTTP ${r.status}`);
      } catch (e) {
        toast.warning('Redação pelo SEU modelo indisponível — saiu o modelo padrão do sistema.', {
          description: e instanceof Error ? e.message : undefined,
        });
      }
    }

    const clausulasExtras = instrucoes.trim()
      ? await redigirClausulas('escritura pública de inventário e partilha de bens (estilo notarial, cláusulas com título em caixa alta)', instrucoes)
      : null;
    // Partilha diferenciada da matriz vira os PAGAMENTOS da escritura.
    let diferenciada: DadosEscritura['diferenciada'] = null;
    if (atribuicao && atribuicao.bloqueios.length === 0 && atribuicao.posicoes.length > 0) {
      const pagamentos: PagamentoDiferenciado[] = participantes
        .map((pt) => {
          const pos = atribuicao.posicoes.find((x) => x.titularId === pt.id);
          const itens = bens
            .map((b, i) => ({ numero: i + 1, descricao: descricaoCurta(b.descricao), pct: pctNum((matriz[b.id] ?? {})[pt.id]) }))
            .filter((it) => it.pct > 0);
          return { nome: pt.nome, itens, valorRecebido: pos?.valorAtribuido ?? '0.00' };
        })
        .filter((pg) => pg.itens.length > 0);
      diferenciada = {
        pagamentos,
        tornas: atribuicao.transferencias.map((t) => ({
          de: t.cedenteNome,
          para: t.cessionarioNome,
          valor: t.valor,
          titulo: t.titulo,
        })),
      };
    }
    // Sucessões cumuladas: cada uma entra na MESMA escritura com a partilha
    // sintética dela ("mesmos herdeiros" — o mesmo cálculo do item III) e a
    // provisão do próprio fato gerador.
    const sucessoesEscritura: SucessaoEscritura[] = (fiscal.sucessoes ?? [])
      .filter((su) => su.dataObito && (basesSucessoes[su.id] ?? 0) > 0)
      .map((su) => {
        const base = basesSucessoes[su.id] ?? 0;
        let resultadoSu: Resultado | null = null;
        if (su.mesmosHerdeiros && herdeiros.length > 0) {
          try {
            resultadoSu = partilhar({
              falecido: { dataObito: su.dataObito },
              sobrevivente: null,
              herdeiros,
              bens: [
                {
                  id: `su-base-${su.id}`,
                  descricao: `Base transmitida na sucessão de ${su.nome}`,
                  valor: base.toFixed(2),
                  natureza: 'PARTICULAR',
                },
              ],
            });
          } catch {
            resultadoSu = null;
          }
        }
        return {
          id: su.id,
          nome: su.nome,
          dataObito: su.dataObito,
          base,
          resultado: resultadoSu,
          provisao: provisoesSucessoes.find((p) => p.sucessao.id === su.id)?.provisao ?? null,
        };
      });
    const { montarEscrituraDocx } = await import('@/lib/partilha/escritura');
    const blob = await montarEscrituraDocx({
      modalidade,
      partesRemotas,
      falecido,
      qualificacaoFalecido: familia.qualificacoes['__falecido__'],
      temSobrevivente,
      nomeSobrev,
      vinculo,
      regime,
      herdeiros,
      qualificacoes: familia.qualificacoes,
      inventarianteId: familia.inventarianteId ?? null,
      bens,
      resultado,
      provisao,
      diferenciada,
      clausulasExtras,
      sucessoes: sucessoesEscritura.length > 0 ? sucessoesEscritura : undefined,
    });
    baixarBlob(blob, `Minuta de escritura - Inventario${falecido.nome ? ` de ${falecido.nome}` : ''}.docx`);
    registrarDoc('ESCRITURA', {
      comIa: clausulasExtras !== null,
      comInstrucoes: instrucoes.trim().length > 0,
      modalidade,
      itens: diferenciada?.pagamentos.length ?? 0,
    });
  };

  /**
   * Minuta da ESCRITURA DE SOBREPARTILHA — o caso sintético da view (só os
   * bens de fora + a mesma família) sai pelo MESMO gerador determinístico,
   * com a seção "DA SOBREPARTILHA" e a remissão à escritura anterior em
   * lacunas para o(a) escrevente completar.
   */
  const gerarEscrituraSobrepartilha = async (args: {
    modalidade: ModalidadeEscritura;
    resultado: Resultado;
    provisao: ProvisaoItcmd | null;
  }) => {
    const { montarEscrituraDocx } = await import('@/lib/partilha/escritura');
    const blob = await montarEscrituraDocx({
      modalidade: args.modalidade,
      partesRemotas: '',
      falecido,
      qualificacaoFalecido: familia.qualificacoes['__falecido__'],
      temSobrevivente,
      nomeSobrev,
      vinculo,
      regime,
      herdeiros,
      qualificacoes: familia.qualificacoes,
      inventarianteId: familia.inventarianteId ?? null,
      bens: bens.filter((b) => b.sobrepartilha),
      resultado: args.resultado,
      provisao: args.provisao,
      diferenciada: null,
      sobrepartilha: true,
    });
    baixarBlob(blob, `Minuta de sobrepartilha${falecido.nome ? ` - ${falecido.nome}` : ''}.docx`);
    registrarDoc('ESCRITURA_SOBREPARTILHA', { modalidade: args.modalidade });
  };

  /**
   * Reenvio MANUAL à nuvem de arquivos (aba Documentos): sobe um documento
   * (ou todos) para a pasta do caso — o plano B quando o envio automático
   * falhou. Marca o WeakSet (o efeito automático não repete) e revarre o
   * manifesto em silêncio no fim do lote.
   */
  const subirParaNuvem = async (
    files: File[],
  ): Promise<{ ok: number; falhas: number; motivo?: string }> => {
    const s = storeRef.current;
    const aberto = casoAbertoRef.current;
    if (!s?.enviarDocumento || !aberto) {
      return { ok: 0, falhas: files.length, motivo: 'Nuvem de arquivos indisponível neste caso.' };
    }
    let ok = 0;
    let falhas = 0;
    for (const f of files) {
      const subiu = await s.enviarDocumento(aberto.cabecalho.caseId, f);
      if (subiu) {
        ok += 1;
        enviadosDriveRef.current.add(f);
      } else {
        falhas += 1;
      }
    }
    if (ok > 0) {
      try {
        const diff = await s.varrerDocumentos({
          schemaVersion: 1,
          appVersion: '',
          cabecalho: aberto.cabecalho,
          dados: null,
          manifesto: manifestoRef.current,
          integridade: { hashDados: '' },
        });
        manifestoRef.current = diff.manifesto;
      } catch {
        // manifesto atualiza na próxima abertura
      }
    }
    return { ok, falhas, motivo: s.ultimoErro ?? undefined };
  };

  /** Mescla a qualificação vinda do PORTAL numa ficha (campo vazio primeiro;
   *  uniaoEstavel trafega como 'sim'/'' e vira a caixinha booleana). */
  const mesclarQualificacaoDoPortal = (
    atual: Qualificacao,
    q: QualificacaoHerdeiro,
  ): Qualificacao => {
    const mesclada: Qualificacao = { ...atual };
    for (const campo of Object.keys(q) as (keyof QualificacaoHerdeiro)[]) {
      const v = q[campo];
      if (!v) continue;
      if (campo === 'uniaoEstavel') {
        if (mesclada.uniaoEstavel === undefined) mesclada.uniaoEstavel = v === 'sim';
        continue;
      }
      if (!(mesclada as unknown as Record<string, string>)[campo])
        (mesclada as unknown as Record<string, string>)[campo] = v;
    }
    return mesclada;
  };

  const importarQualificacao = (herdeiroId: string, q: QualificacaoHerdeiro) => {
    setFamilia({
      ...familia,
      qualificacoes: {
        ...familia.qualificacoes,
        [herdeiroId]: mesclarQualificacaoDoPortal(
          familia.qualificacoes[herdeiroId] ?? QUALIFICACAO_VAZIA,
          q,
        ),
      },
    });
    irPara('familia');
  };

  /**
   * NOTIFICAÇÕES AO VIVO: os convites emitidos são REVALIDADOS no servidor
   * (a cada 60s e ao focar a janela) — documento anexado ou qualificação
   * preenchida pelo herdeiro chega ao card "Notificações do cofre" do
   * dashboard sem precisar abrir a aba Documentos, com um toast avisando.
   */
  const convitesRef = useRef(convites);
  useEffect(() => {
    convitesRef.current = convites;
  }, [convites]);
  // A chave só muda quando a LISTA de convites muda (emitir/remover) — o
  // conteúdo atualizado pelo próprio polling não recria o intervalo.
  const chaveConvites = Object.values(convites)
    .map((c) => c.token)
    .sort()
    .join(',');
  useEffect(() => {
    if (!chaveConvites) return;
    let ativo = true;
    const revalidar = async () => {
      const atuais = convitesRef.current;
      const proximos: Record<string, ConviteHerdeiro> = { ...atuais };
      const chegadas: string[] = [];
      let mudou = false;
      for (const [herdeiroId, convite] of Object.entries(atuais)) {
        try {
          const r = await fetch(`/api/portal/${convite.token}`);
          if (r.status === 410) {
            // Revogado em outra tela/máquina: o estado aprende em silêncio —
            // o cofre passa a oferecer "Gerar novo link" sem toast de chegada.
            if (!convite.revogadoEm) {
              proximos[herdeiroId] = { ...convite, revogadoEm: new Date().toISOString() };
              mudou = true;
            }
            continue;
          }
          if (!r.ok) continue;
          const novo = (await r.json()) as ConviteHerdeiro;
          if (JSON.stringify(novo) !== JSON.stringify(convite)) {
            proximos[herdeiroId] = novo;
            chegadas.push(novo.nomeHerdeiro || 'herdeiro');
            mudou = true;
          }
        } catch {
          // rede fora — tenta no próximo ciclo
        }
      }
      if (!ativo || !mudou) return;
      setConvites(proximos);
      if (chegadas.length === 0) return;
      toast.info(
        chegadas.length === 1
          ? `Novidade no cofre: ${chegadas[0]} enviou documentos ou informações`
          : `Novidades no cofre: ${chegadas.join(', ')} enviaram documentos ou informações`,
        { description: 'Veja no card "Notificações do cofre" ou na aba Documentos.' },
      );
    };
    const t0 = setTimeout(() => void revalidar(), 1500);
    const intervalo = setInterval(() => void revalidar(), 60_000);
    const aoFocar = () => void revalidar();
    window.addEventListener('focus', aoFocar);
    return () => {
      ativo = false;
      clearTimeout(t0);
      clearInterval(intervalo);
      window.removeEventListener('focus', aoFocar);
    };
  }, [chaveConvites]);

  /**
   * As qualificações recebidas pelo LINK DO COFRE caem SOZINHAS no item I
   * (A família): a cada atualização dos convites, a ficha do herdeiro
   * correspondente ganha os campos que estiverem vazios — digitação do
   * advogado nunca é sobrescrita, e o botão manual do cofre segue valendo.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      setFamilia((prev) => {
        let mudou = false;
        const qualificacoes = { ...prev.qualificacoes };
        for (const c of Object.values(convites)) {
          if (!c.qualificacao || !c.herdeiroId) continue;
          if (!prev.herdeiros.some((h) => h.id === c.herdeiroId)) continue;
          const atual = qualificacoes[c.herdeiroId] ?? QUALIFICACAO_VAZIA;
          const mesclada = mesclarQualificacaoDoPortal(atual, c.qualificacao);
          if (JSON.stringify(mesclada) !== JSON.stringify(atual)) {
            qualificacoes[c.herdeiroId] = mesclada;
            mudou = true;
          }
        }
        return mudou ? { ...prev, qualificacoes } : prev;
      });
    }, 0);
    return () => clearTimeout(t);
  }, [convites]);

  /* ---------- render ---------- */

  return (
    <div className={`sucessorista${tema === 'escuro' ? ' tema-escuro' : ''}`}>
    {/* Barra LexCausa FORA da folha do caso (pedido do escritório): no painel
        Meus casos dá para voltar ao hub; dentro do caso a lombada assume. */}
    {casoAberto === null && shell}
    {/* Rota /caso/<id> que não abriu: tela própria com o caminho de volta
        — nunca um redirecionamento silencioso (T1 da auditoria). */}
    {casoAberto === null && casoNaoEncontrado ? (
      <div className="folha" style={{ maxWidth: 720, margin: '0 auto' }}>
        {shell ? null : menu}
        <h1>Caso não encontrado</h1>
        <p className="subtitulo">
          O link aponta um caso que não está nesta máquina nem na sua nuvem — ele pode ter
          sido arquivado, a pasta pode ter sido movida, ou o link veio de outra conta.
        </p>
        <Button
          onClick={() => {
            setCasoNaoEncontrado(false);
            window.history.replaceState(null, '', '/s');
          }}
        >
          Ir para Meus casos
        </Button>
      </div>
    ) : casoAberto === null && restaurandoCaso ? (
      /* F5 dentro do caso: a folha está sendo reaberta — mostrar o painel
         Meus casos aqui daria a impressão de ter "voltado" para a lista. */
      <div className="folha" style={{ maxWidth: 720, margin: '0 auto' }}>
        {shell ? null : menu}
        <h1>Reabrindo o caso…</h1>
        <p className="subtitulo">
          Restaurando a folha e os documentos deste inventário. Um instante.
        </p>
      </div>
    ) : casoAberto === null ? (
      <div className="folha" style={{ maxWidth: 1100, margin: '0 auto' }}>
        {shell ? null : menu}
        <CasosView
          radarHref={radarAtivo && (perfil === 'ADVOGADO' || ehMaster) ? '/radar' : null}
          onImportarFamilia={
            perfil === 'ADVOGADO' || ehMaster ? (codigo) => importarDoRadar(codigo) : null
          }
          estado={estadoPainel}
          resumos={(() => {
            // A nuvem entra no painel junto dos casos locais; caso
            // que existe nos dois lugares aparece UMA vez (o card local —
            // a adoção da versão mais nova acontece ao abrir).
            if (!nuvemAtiva || resumosNuvem.length === 0) return resumos;
            const locais = new Set((resumos ?? []).map((r) => r.cabecalho.caseId));
            const daNuvem: ResumoCaso[] = resumosNuvem
              .filter((c) => !locais.has(c.caseId))
              .map((c) => ({ cabecalho: c, modo: 'nuvem' }));
            return [...(resumos ?? []), ...daNuvem];
          })()}
          comNuvem={nuvemAtiva}
          onEnviarNuvem={
            nuvemAtiva && (resumos?.length ?? 0) > 0 ? enviarCasosParaNuvem : null
          }
          drive={drive}
          onDesconectarDrive={() => void desconectarDoDrive()}
          oneDrive={oneDrive}
          onDesconectarOneDrive={() => void desconectarDoOneDrive()}
          dropbox={dropbox}
          onDesconectarDropbox={() => void desconectarDoDropbox()}
          linkNuvem={linkNuvem}
          onAbrirPasta={(id) => void abrirPastaNaNuvem(id)}
          dispositivo={dispositivo}
          temRascunhoLegado={temRascunhoLegado}
          onEscolherPasta={(nome) => void escolherPastaRaiz(nome)}
          onTrocarPasta={() => void escolherPastaRaiz(dispositivo || 'Meu computador')}
          pastaAtual={nomeRaiz}
          onDesbloquear={() => void desbloquearPasta()}
          onAbrir={(id) => void abrirCasoDoPainel(id)}
          onCriar={(t) => void criarCasoDoPainel(t)}
          onDuplicar={(id) => void duplicarCasoDoPainel(id)}
          onExportar={(id) => void exportarCasoDoPainel(id)}
          onArquivar={(id) => void arquivarCasoDoPainel(id)}
          onRemoverNuvem={nuvemAtiva ? removerCasoNuvemDoPainel : null}
          onRestaurarBackup={(id) => void restaurarBackupDoPainel(id)}
          onImportar={(f) => void importarCasoDoPainel(f)}
          onMigrarRascunho={() => void migrarRascunhoLegado()}
        />
      </div>
    ) : (
    <div className={`processo${painelRecolhido ? ' painel-recolhido' : ''}`}>
      <nav className="lombada" aria-label="Abas do processo">
        <button className="voltar" onClick={voltarAoPainel}>← Meus casos</button>
        <div className="marca">
          O Sucessorista
          <small>Folha de trabalho do inventário</small>
        </div>
        {/* O perfil é da CONTA e NÃO se alterna aqui — nem para o MASTER.
            Havia um par de botões nesta faixa que trocava Advogado ×
            Escrevente na sessão; ele saiu por decisão do escritório: o perfil
            é escolhido no primeiro acesso e só a administração troca depois
            (/admin/usuarios), para que a folha de um mesmo login nunca mude
            de balcão no meio do trabalho. Fica só a etiqueta do que a conta é. */}
        <div className="perfil" aria-label="Perfil da conta">
          <button className="ativo" disabled aria-disabled="true">
            {perfil === 'ADVOGADO' ? 'Advogado(a)' : 'Escrevente Notarial'}
          </button>
        </div>
        {(
          [
            ['caso', '0', 'Página Inicial'],
            ['familia', 'I', 'A família'],
            ['acervo', 'II', 'O acervo'],
            ['partilha', 'III', 'Partilha'],
            ['itcmd', 'IV', 'ITCMD'],
            ['custos', 'V', 'Custos'],
            ['documentos', 'VI', 'Documentos'],
            // Abas finais por perfil: honorários e minutas são do advogado;
            // a escritura é o item VII do balcão do escrevente. As TRÊS
            // ferramentas de apoio (matrícula, fontes, IR/GCAP) viraram o
            // agrupador "Ferramentas Sucessórias", SEM algarismo (pedido do
            // escritório) — os ids individuais seguem válidos por URL.
            ...(perfil === 'ADVOGADO'
              ? ([
                  ['honorarios', 'VII', 'Honorários'],
                  ['minutas', 'VIII', 'Minutas'],
                ] as const)
              : ([['escritura', 'VII', 'Escritura']] as const)),
            ['ferramentas', '', 'Ferramentas Sucessórias'],
          ] as const
        ).map(([id, ind, rotulo]) => (
          <button
            key={id}
            className="aba"
            aria-current={
              abaProc === id ||
              (id === 'ferramentas' &&
                (abaProc === 'matricula' || abaProc === 'fontes' || abaProc === 'fiscal'))
            }
            onClick={() => irPara(id)}
          >
            {ind !== '' && <span className="indice">{ind}</span>}
            {rotulo}
          </button>
        ))}
        {/* Faixa de sessão no pé da lombada: com um caso aberto, é daqui que
            se chega à Administração e ao Sair. (O indicador de salvamento
            saiu daqui para a barra de status da folha — T2 da auditoria.) */}
        {menu && <div className="sessao">{menu}</div>}
        <div className="selo">
          Cálculo de apoio com fundamento legal.
          <br />
          Revisão do advogado responsável é obrigatória.
        </div>
      </nav>

      <main className="folha">
        {/* Barra de status FINA no topo da folha (V3): prazo do art. 611,
            custo projetado e salvamento sempre à vista — o painel do caso
            pode ficar recolhido sem o advogado perder os números. */}
        <div className="barra-status num" role="status">
          {falecido.dataObito ? (
            <span
              className={`bs-prazo ${
                fiscal.itcmdSituacao === 'PAGO' ? 'ok' : faixaDoPrazo(diasDesdeObito(falecido.dataObito))
              }`}
            >
              Art. 611: {diasDesdeObito(falecido.dataObito)} dia(s) —{' '}
              {fiscal.itcmdSituacao === 'PAGO' ? 'ITCMD pago' : rotuloDoPrazo(diasDesdeObito(falecido.dataObito))}
            </span>
          ) : (
            <span className="bs-prazo">Art. 611: informe a data do óbito</span>
          )}
          <span
            title={
              manuais
                ? 'Valores informados pelo profissional (caso fora de SP) — aba V'
                : undefined
            }
          >
            Custo projetado:{' '}
            {manuais
              ? `${brl((totalManual + somaAdicionais(custosAdicionais)).toFixed(2))} (informado)`
              : provisao
                ? brl(
                    (
                      provisao.total +
                      (custos?.total ?? 0) +
                      impostoSucessoes +
                      somaAdicionais(custosAdicionais)
                    ).toFixed(2),
                  )
                : '—'}
          </span>
          <span
            className="bs-salva"
            title={
              store?.modo === 'drive'
                ? 'Gravado no SEU Google Drive — acessível de qualquer dispositivo com o seu login'
                : store?.modo === 'onedrive'
                  ? 'Gravado no SEU OneDrive — acessível de qualquer dispositivo com o seu login'
                  : store?.modo === 'dropbox'
                    ? 'Gravado no SEU Dropbox — acessível de qualquer dispositivo com o seu login'
                    : store?.modo === 'pasta'
                      ? 'Gravado direto na pasta do processo — nada sai desta máquina'
                      : 'Gravado neste navegador (modo portátil) — nada sai desta máquina'
            }
          >
            {salvamento.estado === 'erro' ? (
              <button className="bs-acao" onClick={() => void salvarAgoraRef.current()}>
                ● erro ao salvar — tentar de novo
              </button>
            ) : salvamento.estado === 'somente-leitura' ? (
              <button className="bs-acao" onClick={() => void desbloquearPasta()}>
                ● somente leitura — reconectar pasta
              </button>
            ) : salvamento.estado === 'salvando' ? (
              '● salvando…'
            ) : salvamento.estado === 'salvo' && salvamento.quando ? (
              `● salvo às ${new Date(salvamento.quando).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`
            ) : (
              '● salvamento automático'
            )}{' '}
            {store?.modo === 'drive'
              ? 'no seu Google Drive'
              : store?.modo === 'onedrive'
                ? 'no seu OneDrive'
                : store?.modo === 'dropbox'
                  ? 'no seu Dropbox'
                  : store?.modo === 'pasta'
                    ? 'na pasta do processo'
                    : 'neste navegador'}
          </span>
        </div>
        {abaProc === 'caso' && (
          <CasoView
            tarefas={
              <TarefasCaso
                tarefas={tarefasCaso}
                onChange={setTarefasCaso}
                sugestoes={[
                  ...(nomeConta ? [nomeConta] : []),
                  ...(equipe?.membros.map((m) => m.nome) ?? []),
                ].filter((n, i, a) => a.indexOf(n) === i)}
              />
            }
            fases={
              <FasesCaso
                irPara={(aba) => irPara(aba as Aba)}
                fases={[
                  {
                    aba: 'familia',
                    rotulo: 'Composição',
                    completa: falecido.nome.trim().length > 0 && herdeiros.length > 0,
                    resumo:
                      herdeiros.length > 0
                        ? `${herdeiros.length} herdeiro(s)`
                        : 'família e qualificação',
                  },
                  {
                    aba: 'acervo',
                    rotulo: 'Acervo',
                    completa: bens.length > 0,
                    resumo: bens.length > 0 ? `${bens.length} bem(ns) lançado(s)` : 'bens e dívidas',
                  },
                  {
                    aba: 'partilha',
                    rotulo: 'Quinhões',
                    completa: resultado !== null,
                    resumo: resultado !== null ? 'partilha calculada' : 'aguarda família e acervo',
                  },
                  {
                    aba: 'documentos',
                    rotulo: 'Cofre',
                    completa: Object.values(anexosProcesso).some((fs) => fs.length > 0),
                    resumo: (() => {
                      const n = Object.values(anexosProcesso).reduce((acc, fs) => acc + fs.length, 0);
                      return n > 0 ? `${n} documento(s)` : 'documentos do processo';
                    })(),
                  },
                  {
                    aba: 'itcmd',
                    rotulo: 'Espelho ITCMD',
                    completa: fiscal.itcmdSituacao === 'DECLARADO' || fiscal.itcmdSituacao === 'PAGO',
                    resumo:
                      fiscal.itcmdSituacao === 'PAGO'
                        ? 'imposto pago'
                        : fiscal.itcmdSituacao === 'DECLARADO'
                        ? 'declarado'
                        : 'declaração e provisão',
                  },
                ]}
                acoes={
                  perfil === 'ADVOGADO'
                    ? [
                        { rotulo: 'Calcular ITCMD', aba: 'itcmd' },
                        { rotulo: 'Projetar custos', aba: 'custos' },
                        { rotulo: 'Sugerir honorários', aba: 'honorarios' },
                        { rotulo: 'Gerar minuta', aba: 'minutas' },
                      ]
                    : [
                        { rotulo: 'Calcular ITCMD', aba: 'itcmd' },
                        { rotulo: 'Projetar custos', aba: 'custos' },
                        { rotulo: 'Gerar escritura', aba: 'escritura' },
                      ]
                }
              />
            }
            aplicarLeitura={aplicarLeitura}
            reclassificarArquivos={reclassificarArquivos}
            onInicioRapido={inicioRapido}
            irParaFamilia={() => irPara('familia')}
            rascunhoSalvoEm={rascunhoSalvoEm}
            onExportarCaso={exportarCaso}
            onImportarCaso={importarCaso}
            onNovoCaso={novoCaso}
            casoId={casoId}
            perfil={perfil}
            tema={tema}
            setTema={setTema}
            licoesRenomeador={licoesRenomeador}
            rito={fiscal.rito ?? 'AUTO'}
            setRito={(r) => setFiscal({ ...fiscal, rito: r })}
            ritoMotor={ritoMotor}
            equipe={equipe}
            painelFamilia={
              <PainelFamiliaCard
                casoId={casoId}
                nomeFalecido={falecido.nome || 'o inventário'}
                nomeAdvogado={nomeConta || 'Advogado(a) responsável'}
                rito={ritoEfetivo ?? 'EXTRAJUDICIAL'}
                convites={Object.values(convites)}
                quinhoes={quinhoesPainel}
                custosVisiveis={custosVisiveisPainel}
                espolioDados={espolioDadosPainel}
                estado={painelFamilia}
                onEstado={(p) => setPainelFamilia((prev) => ({ ...prev, ...p }))}
                onConviteAtualizado={(c) =>
                  setConvites((prev) => {
                    const chave = Object.keys(prev).find((k) => prev[k].token === c.token);
                    return chave ? { ...prev, [chave]: c } : prev;
                  })
                }
                onNovoConvite={(c) =>
                  // Convite de mediador(a) nasce no card — chave pelo token
                  // (os de herdeiro são chaveados pelo herdeiroId no cofre).
                  setConvites((prev) => ({ ...prev, [c.token]: c }))
                }
                onEncerrado={() => setConvites({})}
                onLevarParaPartilha={(alocacoes, tituloCenarioAplicado) => {
                  // Consenso vira partilha: as alocações do cenário são o
                  // MESMO formato da matriz da seção III — cópia direta. O
                  // eco fica no caso.json (o .json transporta o consenso).
                  setMatriz(alocacoes);
                  setPainelFamilia((prev) => ({
                    ...prev,
                    consensoAplicado: {
                      titulo: tituloCenarioAplicado,
                      em: new Date().toISOString(),
                    },
                  }));
                  irPara('partilha');
                  toast.success('Cenário levado para a partilha', {
                    description:
                      'A matriz da seção III recebeu as alocações do cenário — confira o espelho e os acertos.',
                  });
                }}
                onAplicarValor={(bemId, valor) =>
                  // Sugestão de valor ACEITA pelo advogado: entra como
                  // AVALIAÇÃO do bem (o venal do óbito segue sendo o
                  // documento oficial; custas/ITCMD já usam o maior).
                  setBens((prev) =>
                    prev.map((b) =>
                      b.id === bemId ? { ...b, valorAvaliacao: Number(valor).toFixed(2) } : b,
                    ),
                  )
                }
                irParaDocumentos={() => irPara('documentos')}
              />
            }
          />
        )}

        {abaProc === 'familia' && (
          <FamiliaView
            estado={familia}
            onChange={setFamilia}
            avancar={() => irPara('acervo')}
            sucessoes={fiscal.sucessoes ?? []}
            setSucessoes={(s) => setFiscal({ ...fiscal, sucessoes: s })}
            basesSucessoes={basesSucessoes}
            divergencias={divergenciasConferencia}
          />
        )}

        {abaProc === 'acervo' && (
          <AcervoView
            bens={bens}
            setBens={setBens}
            dividas={dividasEspolio}
            setDividas={setDividasEspolio}
            herdeiros={herdeiros}
            colacoes={colacoes}
            setColacoes={setColacoes}
            sociedades={resumoSociedades}
            sucessoes={fiscal.sucessoes ?? []}
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
            <Doutrina
              id="partilha"
              resumo="O espelho da partilha com o fundamento legal de cada lançamento."
            >
              A torna é apurada quando a família convenciona diferente do direito. O
              vínculo, o regime e os herdeiros vêm do item I; os bens, do item II.
            </Doutrina>

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
                irParaItcmd={() => irPara('itcmd')}
                onExportado={(quinhoes) =>
                  registrarDoc('XLSX_PARTILHA', { itens: quinhoes })
                }
                colacao={resultadoColacoes}
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
                    {/* Modo de digitação: % × fração. Alternar CONVERTE as células
                        (33,33 ⇆ 1/3) — a fração é exata e não fabrica torna de
                        dízima quando o combinado é "um terço para cada". */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 10px', flexWrap: 'wrap' }}>
                      <span className="fund">Trabalhar com:</span>
                      <Button
                        size="sm"
                        variant={matrizEmFracao ? 'outline' : 'default'}
                        aria-pressed={!matrizEmFracao}
                        onClick={() => alternarModoMatriz(false)}
                      >
                        Percentual
                      </Button>
                      <Button
                        size="sm"
                        variant={matrizEmFracao ? 'default' : 'outline'}
                        aria-pressed={matrizEmFracao}
                        onClick={() => alternarModoMatriz(true)}
                      >
                        Fração
                      </Button>
                      <span className="fund">
                        — fração é exata (1/3, 1/6…): três vezes 1/3 fecha o bem inteiro, sem a
                        torna de centavos da dízima. Os dois formatos valem em qualquer célula.
                      </span>
                    </div>
                    <ScrollArea className="matriz-scroll" orientation="vertical">
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
                                  {/* Sufixo % dentro do campo — some quando a célula
                                      é FRAÇÃO ("1/3"), aceita nos dois modos. */}
                                  <span className="pct-campo">
                                    <Input
                                      className="pct num"
                                      inputMode="decimal"
                                      placeholder={matrizEmFracao ? '1/3' : '—'}
                                      aria-label={`Percentual ou fração do bem ${i + 1} para ${p.nome}`}
                                      value={linha[p.id] ?? ''}
                                      onChange={(e) => {
                                        const v = e.target.value.replace(/[^\d.,/]/g, '').slice(0, 8);
                                        setMatriz((prev) => ({
                                          ...prev,
                                          [b.id]: { ...(prev[b.id] ?? {}), [p.id]: v },
                                        }));
                                        // Edição manual invalida o rótulo do redesenho.
                                        setAnotacoesMatriz((prev) => {
                                          if (!prev[b.id]?.[p.id]) return prev;
                                          const linhaAnot = { ...prev[b.id] };
                                          delete linhaAnot[p.id];
                                          return { ...prev, [b.id]: linhaAnot };
                                        });
                                      }}
                                    />
                                    {!ehFracao(linha[p.id]) && <span aria-hidden="true">%</span>}
                                  </span>
                                  {anotacoesMatriz[b.id]?.[p.id] && (
                                    <span className="pct-rotulo">{anotacoesMatriz[b.id][p.id]}</span>
                                  )}
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
                    </ScrollArea>
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

                        {/* Simulador do Espaço do Espólio: a atribuição atual
                            vira um CENÁRIO que a família responde pelo portal. */}
                        {temConvites && (
                          <div className="nota" style={{ marginTop: 12 }}>
                            <span className="eyebrow">Espaço do espólio</span>
                            <p>
                              Esta divisão pode virar um <strong>cenário proposto à família</strong>:
                              cada herdeiro vê os números em linguagem simples no próprio link e
                              responde aceito · não aceito · quero conversar. Quando todos aceitam,
                              o cenário congela como consenso.
                            </p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => setProporAberto(true)}
                            >
                              Propor este cenário à família
                            </Button>
                          </div>
                        )}
                      </>
                    )}

                    <Dialog
                      open={proporAberto}
                      onOpenChange={(o) => !enviandoCenario && setProporAberto(o)}
                    >
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Propor este cenário à família</DialogTitle>
                          <DialogDescription>
                            A família vê quem fica com o quê, o acerto em dinheiro e o total de
                            cada um — em linguagem simples, com os mesmos números para todos.
                            Honorários e anotações internas nunca entram.
                          </DialogDescription>
                        </DialogHeader>
                        <label className="campo">
                          Nome do cenário (como a família vai chamá-lo)
                          <Input
                            value={tituloCenario}
                            placeholder="Ex.: Casa para Ana, apartamento para Bruno"
                            onChange={(e) => setTituloCenario(e.target.value)}
                          />
                        </label>
                        <label className="campo">
                          Explicação curta (opcional)
                          <Input
                            value={descricaoCenario}
                            placeholder="Ex.: Evita vender a casa; a diferença é compensada em dinheiro"
                            onChange={(e) => setDescricaoCenario(e.target.value)}
                          />
                        </label>
                        <DialogFooter>
                          <Button
                            variant="outline"
                            disabled={enviandoCenario}
                            onClick={() => setProporAberto(false)}
                          >
                            Cancelar
                          </Button>
                          <Button
                            loading={enviandoCenario}
                            disabled={tituloCenario.trim() === ''}
                            onClick={() => void proporCenario()}
                          >
                            Propor à família
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
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

            {/* Uma partilha POR SUCESSÃO cumulada (art. 672 do CPC): cada uma
                com o próprio fato gerador e o próprio espelho — os herdeiros
                são os mesmos quando a sucessão está marcada assim no item I. */}
            <PartilhasSucessoes sucessoes={fiscal.sucessoes ?? []} herdeiros={herdeiros} bases={basesSucessoes} />

            <EconomiaView
              economias={economias}
              acoes={{
                'usufruto-nua-propriedade': {
                  rotulo: 'Aceitar: redesenhar com a nua-propriedade nos herdeiros',
                  executar: redesenharComUsufruto,
                },
                'torna-acima-da-isencao': {
                  rotulo: 'Aceitar: redesenhar sem torna (proporção do direito)',
                  executar: redesenharSemTorna,
                },
                'torna-onerosa-vs-doacao': {
                  rotulo: 'Aceitar: tratar a diferença como cessão gratuita',
                  executar: converterParaGratuita,
                },
              }}
            />

            {/* Ao final do caso: abrir a sobrepartilha (bens que ficaram de
                fora), reaproveitando família e herdeiros — CPC, arts. 669/670. */}
            {!sobrepartilhaAberta ? (
              <div className="rodape-acoes" style={{ marginTop: 28 }}>
                <span />
                <Button variant="outline" onClick={() => setSobrepartilhaAberta(true)}>
                  + Abrir sobrepartilha (bens de fora)
                </Button>
              </div>
            ) : (
              <SobrepartilhaView
                bens={bens}
                setBens={setBens}
                falecido={{ dataObito: falecido.dataObito, nome: falecido.nome }}
                temSobrevivente={temSobrevivente}
                vinculo={vinculo}
                regime={regime}
                nomeSobrev={nomeSobrev}
                herdeiros={herdeiros}
                issPct={Math.min(5, Math.max(2, Number(fiscal.issPct ?? '5') || 5))}
                ufesp={provisao?.ufespReferencia ?? ufespDoAno(new Date().getFullYear()).valor}
                onFechar={() => setSobrepartilhaAberta(false)}
                onMinuta={gerarEscrituraSobrepartilha}
              />
            )}
          </>
        )}

        {abaProc === 'documentos' && (
          <section>
            <h1>Documentos</h1>
            <p className="subtitulo">
              O cofre de convites para os herdeiros mandarem o que falta — e o que o caso
              exige, cruzado com o que já está na pasta.
            </p>
            {/* O cofre de convites ABRE a aba (pedido do escritório): gerar os
                links aos herdeiros vem antes do catálogo do processo. */}
            <CofreView
              herdeiros={herdeiros}
              nomeFalecido={falecido.nome}
              casoId={casoId}
              convites={convites}
              setConvites={setConvites}
              onImportarQualificacao={importarQualificacao}
              irParaFamilia={() => irPara('familia')}
            />
            <DocumentosView
              anexos={anexosProcesso}
              setAnexos={setAnexosProcesso}
              nomeCaso={falecido.nome}
              temSobrevivente={temSobrevivente}
              rito={ritoEfetivo}
              convites={convites}
              onConviteAtualizado={(c) =>
                setConvites((prev) => {
                  const chave = Object.keys(prev).find((k) => prev[k].token === c.token);
                  return chave ? { ...prev, [chave]: c } : prev;
                })
              }
              responsaveis={responsaveisDocs}
              onResponsavel={(docId, valor) =>
                setResponsaveisDocs((prev) => ({ ...prev, [docId]: valor }))
              }
              herdeirosCaso={herdeiros.map((h) => ({ id: h.id, nome: h.nome }))}
              onSalvarNaPasta={async (file) => {
                // Modo pasta/Drive: o envio do cofre também vai ao armazenamento,
                // em "Recebidos do cofre/" do caso (o manifesto religa sozinho).
                const s = storeRef.current;
                const aberto = casoAbertoRef.current;
                if (!s?.salvarDocumentoRecebido || !aberto) return false;
                enviadosDriveRef.current.add(file);
                return s.salvarDocumentoRecebido(aberto.cabecalho.caseId, file);
              }}
              modoDrive={store?.modo === 'drive' || store?.modo === 'onedrive' || store?.modo === 'dropbox'}
              nuvemNome={store?.modo === 'onedrive' ? 'OneDrive' : store?.modo === 'dropbox' ? 'Dropbox' : 'Google Drive'}
              onSubirNuvem={subirParaNuvem}
              onExcluirDrive={async (file) => {
                // Chamado SÓ depois da autorização extra do dialog.
                const s = storeRef.current;
                const aberto = casoAbertoRef.current;
                if (!s?.excluirDocumento || !aberto) return false;
                return s.excluirDocumento(aberto.cabecalho.caseId, file.name);
              }}
              onMontado={(formato, itens) => registrarDoc(formato, { itens })}
              casoId={casoId}
              municipioSugestao={bens.find((b) => b.imovel?.municipio)?.imovel?.municipio}
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

        {abaProc === 'custos' && (
          <CustosView
            custos={custos}
            provisao={provisao}
            issPct={fiscal.issPct ?? '5'}
            setIssPct={(v) => setFiscal({ ...fiscal, issPct: v })}
            provisoesSucessoes={provisoesSucessoes}
            adicionais={custosAdicionais}
            setAdicionais={setCustosAdicionais}
            manuais={fiscal.custosManuais ?? null}
            setManuais={(m) => setFiscal({ ...fiscal, custosManuais: m })}
            ufsForaDetectadas={ufsFora}
            nomeCaso={falecido.nome}
            dataObito={falecido.dataObito}
            caso={caso}
            resultado={resultado}
            atribuicoes={matriz}
            onOrcamento={(formato) => registrarDoc(formato)}
            irParaFamilia={() => irPara('familia')}
            irParaAcervo={() => irPara('acervo')}
            avancar={() => irPara('documentos')}
            rito={ritoEfetivo}
          />
        )}

        {abaProc === 'honorarios' && (
          <HonorariosView
            familia={familia}
            bens={bens}
            dividas={dividasEspolio}
            resultado={resultado}
            provisao={provisao}
            valorIsento={isencoes?.valorIsento ?? 0}
            temPartilhaDiferenciada={bens.some((b) =>
              Object.values(matriz[b.id] ?? {}).some((v) => pctNum(v) > 0),
            )}
            condicoes={condicoesHonorarios}
            setCondicoes={setCondicoesHonorarios}
            onGerado={(tipo, extras) =>
              registrarDoc(
                tipo === 'PROPOSTA' ? 'PROPOSTA_HONORARIOS' : 'CONTRATO_HONORARIOS',
                { comIa: extras.comIa, comInstrucoes: extras.comInstrucoes },
              )
            }
          />
        )}

        {abaProc === 'minutas' && perfil === 'ADVOGADO' && (
          <MinutasView
            onGerarPeticao={gerarPeticao}
            onGerarPeticaoJudicial={gerarPeticaoJudicial}
            pendencias={pendenciasMinuta}
            antecipador={relatorioAntecipador}
            nomeCaso={falecido.nome}
            onAntecipadorPdf={() => registrarDoc('ANTECIPADOR_REGISTRAL_PDF')}
          />
        )}

        {abaProc === 'escritura' && perfil === 'ESCREVENTE' && (
          <EscrituraView
            onGerarEscritura={gerarEscritura}
            pendencias={pendenciasMinuta}
            antecipador={relatorioAntecipador}
            nomeCaso={falecido.nome}
            onAntecipadorPdf={() => registrarDoc('ANTECIPADOR_REGISTRAL_PDF')}
          />
        )}

        {abaProc === 'ferramentas' && <FerramentasView onAbrir={(id) => irPara(id)} />}

        {(abaProc === 'matricula' || abaProc === 'fontes' || abaProc === 'fiscal') && (
          <p style={{ margin: '0 0 10px' }}>
            <Button size="sm" variant="ghost" onClick={() => irPara('ferramentas')}>
              ← Ferramentas Sucessórias
            </Button>
          </p>
        )}

        {abaProc === 'matricula' && (
          <MatriculaView
            anexos={anexosProcesso}
            onAnalisado={(qtd) => registrarDoc('ANALISE_MATRICULA', { comIa: true, itens: qtd })}
            onRelatorioPdf={() => registrarDoc('ANALISE_MATRICULA_PDF')}
          />
        )}

        {abaProc === 'fontes' && (
          <FontesView
            checklist={checklistAcervo}
            setChecklist={setChecklistAcervo}
            irParaAcervo={() => irPara('acervo')}
          />
        )}

        {abaProc === 'fiscal' && (
          <FiscalView
            estado={modulosFiscais}
            setEstado={setModulosFiscais}
            bens={bens}
            herdeiros={herdeirosQuinhao}
            dataObito={falecido.dataObito}
          />
        )}
      </main>

      <PainelCaso
        casoId={casoId}
        falecido={falecido}
        temSobrevivente={temSobrevivente}
        vinculo={vinculo}
        regime={regime}
        herdeiros={herdeiros}
        bens={bens}
        resultado={resultado}
        provisao={provisao}
        isencoes={isencoes}
        custos={custos}
        impostoSucessoes={impostoSucessoes}
        custosAdicionais={somaAdicionais(custosAdicionais)}
        custosManuais={manuais}
        alertasLeitura={[
          // Divergências ALTAS do conferidor entram como pontos de atenção
          // (alerta vermelho) — a correção é pedida no item I.
          ...divergenciasConferencia
            .filter((d) => d.nivel === 'ALTA')
            .map((d) => `${d.pessoa}: ${d.mensagem}`),
          ...alertasLeitura,
        ]}
        notas={notasCaso}
        setNotas={setNotasCaso}
        convites={convites}
        onVerCofre={() => irPara('documentos')}
        aberto={painelAberto}
        onFechar={() => setPainelAberto(false)}
        recolhido={painelRecolhido}
        onAlternarRecolhido={() => setPainelRecolhido((v) => !v)}
        itcmdPago={fiscal.itcmdSituacao === 'PAGO'}
        itcmdQuitadoEm={fiscal.itcmdQuitadoEm ?? ''}
      />

      {/* Celular: fundo escurecido + botão flutuante que abre o painel. */}
      <div
        className={`painel-fundo${painelAberto ? ' aberto' : ''}`}
        aria-hidden
        onClick={() => setPainelAberto(false)}
      />
      <button
        type="button"
        className="painel-fab"
        aria-expanded={painelAberto}
        onClick={() => setPainelAberto((v) => !v)}
      >
        {painelAberto ? 'Fechar painel' : 'Painel do caso'}
      </button>
    </div>
    )}

    {/* primeiro acesso: QUALIFICAÇÃO da conta — a escolha do perfil é
        obrigatória (fica na conta, como sempre), e a identificação segue na
        hora: advogado(a) informa nome + OAB (fila do /admin/radar) e faz o
        quiz deontológico; escrevente informa nome completo + serventia. */}
    <QualificacaoConta
      aberta={escolhendoPerfil}
      aoEscolherPerfil={(p) => void escolherPerfilConta(p)}
      aoConcluir={() => setEscolhendoPerfil(false)}
    />

    {/* guarda de conflito: outro computador salvou este caso depois de você abrir */}
    <Dialog open={conflito !== null} onOpenChange={() => undefined}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Este caso foi alterado em outro lugar</DialogTitle>
          <DialogDescription>
            {conflito
              ? `Salvo por ${conflito.atualizadoPor} em ${new Date(conflito.atualizadoEm).toLocaleString('pt-BR')} — depois de você abrir. Nenhuma versão será perdida: escolha o que fazer.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter style={{ flexWrap: 'wrap', gap: 8 }}>
          <Button
            variant="outline"
            onClick={() => {
              if (!conflito) return;
              const disco = conflito.arquivoNoDisco;
              if (disco.dados) aplicarSnapshot(disco.dados as CasoSalvo);
              manifestoRef.current = disco.manifesto;
              baseAtualizadoEmRef.current = disco.cabecalho.atualizadoEm;
              if (origemNuvemRef.current) baseNuvemRef.current = disco.cabecalho.atualizadoEm;
              setCasoAberto({ cabecalho: disco.cabecalho });
              setConflito(null);
              setSalvamento({ estado: 'salvo', quando: disco.cabecalho.atualizadoEm });
              toast.info(
                origemNuvemRef.current
                  ? 'Recarregado da nuvem da equipe — as SUAS alterações não salvas foram descartadas.'
                  : 'Recarregado do disco — as SUAS alterações não salvas foram descartadas.',
              );
            }}
          >
            {'Recarregar a versão salva'}
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void (async () => {
                const s = storeRef.current;
                const arquivo = await montarArquivoCasoAtual();
                if (origemNuvemRef.current && s && arquivo) {
                  // Caso da nuvem: a cópia vira um caso LOCAL seu.
                  try {
                    await s.criarCaso(`${arquivo.cabecalho.titulo} (cópia)`, arquivo.dados);
                    setResumos(await s.listarCasos());
                    toast.success('Sua versão foi salva como um caso local ("(cópia)").');
                  } catch {
                    toast.error('Não consegui salvar a cópia.');
                  }
                  return;
                }
                if (s && 'salvarComoConflito' in s && arquivo && (await (s as FolderCaseStore).salvarComoConflito(arquivo))) {
                  toast.success('Sua versão foi salva como caso.conflito.<data>.json na pasta.');
                } else {
                  toast.error('Não consegui salvar a cópia.');
                }
              })();
            }}
          >
            Salvar como cópia
          </Button>
          <Button onClick={() => void salvarAgoraRef.current(true)}>Manter a minha versão</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  );
}

/* ================= partilhas das sucessões cumuladas ================= */

/**
 * Item 1 estendido: o inventário com duas ou mais sucessões mostra UMA
 * partilha por sucessão. A sucessão marcada com "mesmos herdeiros" (item I)
 * roda o MESMO motor de partilha sobre a base transmitida dela, com a data
 * do óbito própria — quinhões, frações e fundamentos legais independentes.
 */
function PartilhasSucessoes({
  sucessoes,
  herdeiros,
  bases,
}: {
  sucessoes: SucessaoCumulada[];
  herdeiros: Herdeiro[];
  /** Base de cada sucessão (calculada pelo acervo ou manual) — por id. */
  bases: Record<string, number>;
}) {
  const elegiveis = sucessoes.filter((su) => su.dataObito && (bases[su.id] ?? 0) > 0);
  if (elegiveis.length === 0) return null;
  return (
    <div style={{ marginTop: 32 }}>
      <h2>Partilhas das sucessões cumuladas</h2>
      <p className="subtitulo" style={{ marginBottom: 10 }}>
        Inventário conjunto: cada sucessão tem partilha própria, calculada sobre a base
        transmitida nela — {elegiveis.length + 1} partilha(s) no total, contando a do(a)
        autor(a) da herança acima.
      </p>
      {elegiveis.map((su, i) => (
        <PartilhaDeSucessao
          key={su.id}
          sucessao={su}
          indice={i + 2}
          herdeiros={herdeiros}
          base={bases[su.id] ?? 0}
        />
      ))}
    </div>
  );
}

function PartilhaDeSucessao({
  sucessao,
  indice,
  herdeiros,
  base,
}: {
  sucessao: SucessaoCumulada;
  indice: number;
  herdeiros: Herdeiro[];
  base: number;
}) {
  // Caso sintético: só a base transmitida, sem meação (o que o sobrevivente
  // pré-morto deixou É a base) — o motor aplica as mesmas regras de vocação.
  const resultado = useMemo(() => {
    if (!sucessao.mesmosHerdeiros || herdeiros.length === 0) return null;
    try {
      return partilhar({
        falecido: { dataObito: sucessao.dataObito },
        sobrevivente: null,
        herdeiros,
        bens: [
          {
            id: `su-base-${sucessao.id}`,
            descricao: `Base transmitida na sucessão de ${sucessao.nome}`,
            valor: base.toFixed(2),
            natureza: 'PARTICULAR',
          },
        ],
      });
    } catch {
      return null;
    }
  }, [sucessao, herdeiros, base]);

  if (!sucessao.mesmosHerdeiros) {
    return (
      <div className="nota">
        <span className="eyebrow">{indice}ª sucessão — {sucessao.nome}</span>
        <p>
          Esta sucessão não está marcada com &quot;mesmos herdeiros&quot;. Marque a opção no
          item I (A família) para a partilha dela aparecer aqui — ou trate-a em um caso
          próprio quando os herdeiros forem outros.
        </p>
      </div>
    );
  }

  if (!resultado || resultado.bloqueios.length > 0) {
    return (
      <div className="nota exigencia">
        <span className="eyebrow">{indice}ª sucessão — {sucessao.nome}</span>
        <p>
          Não foi possível calcular esta partilha
          {herdeiros.length === 0 ? ' — lance os herdeiros no item I' : ''}.
          {resultado?.bloqueios.map((b) => ` ${b}`) ?? ''}
        </p>
      </div>
    );
  }

  return (
    <div className="cartao">
      <span className="eyebrow">
        {indice}ª sucessão — {sucessao.nome} · óbito em{' '}
        {sucessao.dataObito.split('-').reverse().join('/')} · base {brl(base.toFixed(2))}
      </span>
      <Espelho colunas={['Herdeiro', 'Fração', 'Quinhão']}>
        {resultado.quinhoes.map((q) => (
          <Fragment key={q.herdeiroId}>
            <LinhaEspelho nome={q.nome} meio={q.fracaoHeranca} valor={brl(q.valor)} />
            <FundEspelho>{q.fundamento}</FundEspelho>
          </Fragment>
        ))}
      </Espelho>
      <p className="fund" style={{ marginTop: 8 }}>
        ITCMD, escritura e registros desta sucessão já somam no painel e no item V
        (Custos), pelo fato gerador próprio dela.
      </p>
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
  irParaItcmd,
  onExportado,
  colacao = null,
}: {
  resultado: ReturnType<typeof partilhar> | null;
  bens: Bem[];
  nomeCaso: string;
  voltar: () => void;
  avancar: () => void;
  irParaItcmd: () => void;
  /** Telemetria: a planilha da partilha saiu (quantidade de quinhões). */
  onExportado: (quinhoes: number) => void;
  /** Quadro ajustado pela COLAÇÃO (CC 2.002), quando há colação lançada. */
  colacao?: import('@/lib/partilha/colacao').ResultadoColacao | null;
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
      onExportado(resultado.quinhoes.length);
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
              <p className="num" style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-xl)' }}>
                {brl(resultado.acervo.massaPartilhavel)}
              </p>
            </div>
            {resultado.meacao && (
              <div>
                <span className="eyebrow">Meação — {resultado.meacao.beneficiario}</span>
                <p className="num" style={{ fontFamily: 'var(--display)', fontSize: 'var(--t-xl)' }}>
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

          {/* Pizza VIVA da partilha: a divisão percentual do acervo entre
              meação e quinhões, animada ao abrir a aba. */}
          <span className="eyebrow">Divisão do acervo — meação e quinhões</span>
          <GraficoQuinhoes
            fatias={[
              ...(resultado.meacao
                ? [
                    {
                      nome: `${resultado.meacao.beneficiario} — meação`,
                      valor: Number(resultado.meacao.valor),
                      sub: 'não é herança',
                    },
                  ]
                : []),
              ...resultado.quinhoes.map((q) => ({
                nome: q.nome,
                valor: Number(q.valor),
                sub: `${q.fracaoHeranca} da herança`,
              })),
            ]}
            total={Number(resultado.acervo.massaPartilhavel)}
          />

          {/* Relação de bens na MESMA numeração e ordem da listagem do acervo. */}
          <span className="eyebrow">Relação de bens partilhados</span>
          <div className="check" style={{ margin: '6px 0 18px' }}>
            {bens.map((b, i) => (
              <div className="check-item" key={b.id}>
                <span className="prio num">{i + 1}.</span>
                <p style={{ fontSize: 'var(--t-sm)' }}>
                  {b.descricao}
                  <span className="fracao num"> · {brl(b.valor)} · {b.natureza === 'COMUM' ? 'comum' : 'particular'}</span>
                </p>
                <span />
              </div>
            ))}
          </div>

          {/* Tabela SEMÂNTICA (T4 da auditoria): thead/th com scope — números
              tabulares alinhados à direita, seleção e cópia para Word/Excel
              preservando as colunas, leitura correta por leitor de tela e a
              repetição do cabeçalho por página na impressão. O fundamento
              legal de cada lançamento fica visível na linha seguinte. */}
          <Table className="espelho-tabela">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Herdeiro</TableHead>
                <TableHead scope="col">Fração da herança</TableHead>
                <TableHead scope="col" className="text-right">
                  % da massa
                </TableHead>
                <TableHead scope="col" className="text-right">
                  Quinhão
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {resultado.meacao && (
                <>
                  <TableRow>
                    <TableCell className="espelho-nome">
                      {resultado.meacao.beneficiario} · meação — não é herança
                    </TableCell>
                    <TableCell className="num">{resultado.meacao.fracao}</TableCell>
                    <TableCell className="num text-right">
                      {pctFmtEspelho(resultado.meacao.valor, resultado.acervo.massaPartilhavel)}
                    </TableCell>
                    <TableCell className="num text-right">{brl(resultado.meacao.valor)}</TableCell>
                  </TableRow>
                  <TableRow className="espelho-fundamento">
                    <TableCell colSpan={4}>{resultado.meacao.fundamento}</TableCell>
                  </TableRow>
                </>
              )}
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
                  <Fragment key={q.herdeiroId}>
                    <TableRow>
                      <TableCell className="espelho-nome">
                        {q.nome}
                        {q.reservaUmQuartoAplicada ? ' · reserva de ¼ aplicada' : ''}
                      </TableCell>
                      <TableCell className="num">{q.fracaoHeranca}</TableCell>
                      <TableCell className="num text-right">
                        {pctFmtEspelho(q.valor, resultado.acervo.massaPartilhavel)}
                      </TableCell>
                      <TableCell className="num text-right">{brl(q.valor)}</TableCell>
                    </TableRow>
                    <TableRow className="espelho-fundamento">
                      <TableCell colSpan={4}>
                        {porBem && (
                          <span className="num" style={{ fontWeight: 600 }}>
                            Fração ideal por bem: {porBem} ·{' '}
                          </span>
                        )}
                        {q.fundamento}
                        {q.precedente ? <span className="prec"> · {q.precedente}</span> : null}
                      </TableCell>
                    </TableRow>
                  </Fragment>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total (massa partilhável)</TableCell>
                <TableCell />
                <TableCell className="num text-right">100%</TableCell>
                <TableCell className="num text-right">{brl(resultado.acervo.massaPartilhavel)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>

          {/* COLAÇÃO (CC 2.002): quadro ajustado — massa fictícia, abate do
              donatário e quinhão líquido a receber de cada herdeiro. */}
          {colacao && (
            <div className="nota" style={{ marginTop: 14 }}>
              <span className="eyebrow">
                Colação aplicada — {brl(colacao.totalColacionado.toFixed(2))} voltando à massa de cálculo
              </span>
              <Table className="espelho-tabela" style={{ marginTop: 8 }}>
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Herdeiro</TableHead>
                    <TableHead scope="col" className="text-right">
                      Quinhão − colacionado
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Líquido a receber
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {colacao.quinhoes.map((q) => (
                    <TableRow key={q.herdeiroId}>
                      <TableCell className="espelho-nome">{q.nome}</TableCell>
                      <TableCell className="num text-right">
                        {brl(q.valorComMassaFicticia.toFixed(2))}
                        {q.colacionado > 0 ? ` − ${brl(q.colacionado.toFixed(2))}` : ''}
                      </TableCell>
                      <TableCell className="num text-right">{brl(q.valorLiquido.toFixed(2))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {colacao.avisos.map((a, i) => (
                <p key={i} className="mono-alerta" style={{ marginTop: 6 }}>
                  {a}
                </p>
              ))}
              <p className="fund" style={{ marginTop: 6 }}>
                {colacao.fundamento}
              </p>
            </div>
          )}

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
        <span style={{ display: 'inline-flex', gap: 8 }}>
          <Button variant="outline" onClick={avancar} disabled={resultado.bloqueios.length > 0}>
            Partilha diferenciada
          </Button>
          <Button onClick={irParaItcmd}>Avançar ao ITCMD (IV)</Button>
        </span>
      </div>
    </section>
  );
}
