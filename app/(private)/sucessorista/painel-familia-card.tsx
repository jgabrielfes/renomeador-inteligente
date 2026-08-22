'use client';

/**
 * Card "Painel da família" (dashboard O Caso) — o controle do advogado sobre
 * o Painel do Cliente: fase do rito em linguagem leiga (marcada À MÃO),
 * próximo passo com data ESTIMADA, alternâncias de visibilidade (padrão
 * restritivo), status dos convites (1º/último acesso, revogar) e os botões
 * Publicar × Encerrar.
 *
 * O snapshot sobe FILTRADO: montarPaineisDoCaso (lib/portal/painel.ts) roda
 * AQUI no navegador e produz um painel por convite — o caso completo nunca
 * sai da máquina. Honorários nunca entram nos custos visíveis (o call site
 * do client só passa ITCMD + cartório + adicionais).
 */

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { DateInput } from '@/components/date-input';
import {
  fasesDoRito,
  montarPaineisDoCaso,
  type CustoVisivel,
  type EntradaPainel,
  type RitoPainel,
} from '@/lib/portal/painel';
import { montarEspolioDoCaso, type EntradaEspolio } from '@/lib/portal/espolio';
import type { ConviteHerdeiro } from '@/lib/portal/store';
import { montarRelatorioComunicacaoPdf } from '@/lib/portal/relatorio-pdf';
import { baixarBlob } from '@/lib/partilha/xlsx';

import type { Alocacoes } from '@/lib/partilha/cenario';

import { montarTermoVotacaoPdf } from '@/lib/portal/termo-votacao-pdf';

import {
  abrirVotacao,
  cenariosDoEspolio,
  congelarCenario,
  decidirDespesa,
  decidirSugestao,
  encerrarPainel,
  encerrarVotacao,
  estadoPainel,
  eventosDoCaso,
  fatosDoEspolio,
  publicarPainel,
  retirarCenario,
  revogarConvite,
  votacoesDoEspolio,
  type CenarioDoCaso,
  type DespesaEspolio,
  type NotaEspolio,
  type VotacaoDoCaso,
} from './painel-actions';

/** Preferência do navegador: o card abre recolhido depois que o usuário o
 *  recolheu uma vez (é o primeiro bloco da Página Inicial). */
const CHAVE_RECOLHIDO = 'sucessorista-painel-familia-recolhido';

const agoraIso = () => new Date().toISOString();

/** Config do painel — vive no snapshot do CASO (caso.json), por caso. */
export interface EstadoPainelFamilia {
  /** Id da fase atual ('' = primeira do rito). */
  faseAtual: string;
  proximoPasso: string;
  /** ISO yyyy-mm-dd ou '' — sempre apresentada como ESTIMATIVA. */
  proximoPassoData: string;
  /** Visibilidades (padrão restritivo: só o contato nasce ligado). */
  contato: boolean;
  custos: boolean;
  quinhao: boolean;
  /** Contato que o advogado OPTA por exibir no cabeçalho do painel. */
  telefoneContato: string;
  emailContato: string;
  /** Espaço do Espólio (camada 2): o interruptor e o que ele libera —
   *  o MESMO conteúdo para todos os herdeiros do caso. */
  espolioAberto: boolean;
  espolioBens: boolean;
  espolioDividas: boolean;
  espolioQuinhoes: boolean;
  /** Eco local da última publicação (a verdade é o servidor). */
  publicadoEm?: string;
}

export const PAINEL_FAMILIA_INICIAL: EstadoPainelFamilia = {
  faseAtual: '',
  proximoPasso: '',
  proximoPassoData: '',
  contato: true,
  custos: false,
  quinhao: false,
  telefoneContato: '',
  emailContato: '',
  espolioAberto: false,
  espolioBens: true,
  espolioDividas: true,
  espolioQuinhoes: false,
};

const brlCard = (v: string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

/** Rótulo leigo das categorias de despesa adiantada (a lista fechada da rota). */
export const CATEGORIA_DESPESA_ROTULO: Record<string, string> = {
  funeral: 'Funeral',
  iptu: 'IPTU',
  condominio: 'Condomínio',
  itcmd: 'ITCMD',
  honorarios: 'Honorários',
  certidoes: 'Certidões',
  outra: 'Outra despesa',
};

const dataCurta = (iso?: string) => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) +
        ' ' +
        d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export function PainelFamiliaCard({
  casoId,
  nomeFalecido,
  nomeAdvogado,
  rito,
  convites,
  quinhoes,
  custosVisiveis,
  espolioDados,
  estado,
  onEstado,
  onConviteAtualizado,
  onEncerrado,
  onAplicarValor,
  onLevarParaPartilha,
  irParaDocumentos,
}: {
  casoId: string;
  nomeFalecido: string;
  nomeAdvogado: string;
  rito: RitoPainel;
  convites: ConviteHerdeiro[];
  /** Quinhão por herdeiroId (do resultado da partilha) — só entra liberado. */
  quinhoes: Record<string, { valor: string; fracao?: string }>;
  /** Custos agregados SEM honorários (ITCMD + cartório + adicionais). */
  custosVisiveis: CustoVisivel[];
  /** Espaço do Espólio: os fatos compartilháveis, já em formato de
   *  allowlist (bens com fonte, dívidas, quinhões de todos, participantes
   *  só com nome+papel) — montados pelo client. */
  espolioDados: EntradaEspolio;
  estado: EstadoPainelFamilia;
  onEstado: (patch: Partial<EstadoPainelFamilia>) => void;
  onConviteAtualizado: (convite: ConviteHerdeiro) => void;
  /** Encerrou no servidor: o client limpa os convites do caso. */
  onEncerrado: () => void;
  /** Sugestão de valor ACEITA: o client aplica no bem do acervo (nada muda
   *  no caso sem este aceite explícito do advogado). */
  onAplicarValor: (bemId: string, valor: string) => void;
  /** Cenário levado para a partilha: as alocações entram na matriz da
   *  seção III (mesmo formato — cópia direta). */
  onLevarParaPartilha: (alocacoes: Alocacoes) => void;
  irParaDocumentos: () => void;
}) {
  const [publicando, setPublicando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [confirmaEncerrar, setConfirmaEncerrar] = useState(false);
  const [revogando, setRevogando] = useState<string | null>(null);
  const [confirmaRevogar, setConfirmaRevogar] = useState<ConviteHerdeiro | null>(null);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
  /* Fatos do espólio (o que a família mandou): sugestões de valor,
     comentários e despesas adiantadas, com a decisão do escritório aqui. */
  const [notasEspolio, setNotasEspolio] = useState<NotaEspolio[]>([]);
  const [despesasEspolio, setDespesasEspolio] = useState<DespesaEspolio[]>([]);
  const [cenarios, setCenarios] = useState<CenarioDoCaso[]>([]);
  const [mudandoCenario, setMudandoCenario] = useState<string | null>(null);
  const [confirmaRetirar, setConfirmaRetirar] = useState<CenarioDoCaso | null>(null);
  /* Votações formais (deliberação em duas etapas). */
  const [votacoes, setVotacoes] = useState<VotacaoDoCaso[]>([]);
  const [abrindoVotacao, setAbrindoVotacao] = useState(false);
  const [perguntaVotacao, setPerguntaVotacao] = useState('');
  const [descricaoVotacao, setDescricaoVotacao] = useState('');
  const [opcoesVotacao, setOpcoesVotacao] = useState<string[]>(['', '']);
  const [salvandoVotacao, setSalvandoVotacao] = useState(false);
  const [confirmaEncerrarVotacao, setConfirmaEncerrarVotacao] = useState<VotacaoDoCaso | null>(null);
  const [encerrandoVotacao, setEncerrandoVotacao] = useState(false);
  const [gerandoTermo, setGerandoTermo] = useState<string | null>(null);
  const [decidindo, setDecidindo] = useState<string | null>(null);
  const [recusa, setRecusa] = useState<{ tipo: 'nota' | 'despesa'; id: string } | null>(null);
  const [motivoRecusa, setMotivoRecusa] = useState('');
  const [tratamentos, setTratamentos] = useState<Record<string, 'ressarcir' | 'compensar'>>({});
  /* Recolhível (é o primeiro bloco da Página Inicial): a preferência fica no
     navegador; a restauração é diferida para não brigar com a hidratação. */
  const [recolhido, setRecolhido] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(CHAVE_RECOLHIDO) === '1') setRecolhido(true);
      } catch {
        // modo restrito
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const alternarRecolhido = () => {
    setRecolhido((r) => {
      try {
        localStorage.setItem(CHAVE_RECOLHIDO, r ? '0' : '1');
      } catch {
        // modo restrito
      }
      return !r;
    });
  };

  const fases = fasesDoRito(rito);
  const faseAtual = fases.some((f) => f.id === estado.faseAtual)
    ? estado.faseAtual
    : fases[0].id;
  const ativos = convites.filter((c) => !c.revogadoEm);

  // Verdade do servidor sobre a publicação (outra máquina pode ter
  // publicado/encerrado) — melhor-esforço, uma vez por caso aberto.
  useEffect(() => {
    let vivo = true;
    void estadoPainel(casoId).then((r) => {
      if (!vivo) return;
      if (r.publicado && r.publicadoEm) onEstado({ publicadoEm: r.publicadoEm });
      else if (!r.publicado) onEstado({ publicadoEm: undefined });
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [casoId]);

  // Fatos do espólio: carrega quando o card está aberto com o espaço ligado
  // (fatos só existem se o espaço já esteve aberto) — melhor-esforço.
  useEffect(() => {
    if (recolhido || !estado.espolioAberto) return;
    let vivo = true;
    void fatosDoEspolio(casoId).then((r) => {
      if (!vivo || !r.ok) return;
      setNotasEspolio(r.notas ?? []);
      setDespesasEspolio(r.despesas ?? []);
    });
    void cenariosDoEspolio(casoId).then((r) => {
      if (!vivo || !r.ok) return;
      setCenarios(r.cenarios ?? []);
    });
    void votacoesDoEspolio(casoId).then((r) => {
      if (!vivo || !r.ok) return;
      setVotacoes(r.votacoes ?? []);
    });
    return () => {
      vivo = false;
    };
  }, [casoId, recolhido, estado.espolioAberto]);

  const recarregarCenarios = async () => {
    const r = await cenariosDoEspolio(casoId);
    if (r.ok) setCenarios(r.cenarios ?? []);
  };

  const mudarCenario = async (
    cenario: CenarioDoCaso,
    acao: 'congelar' | 'reabrir' | 'retirar',
  ) => {
    setMudandoCenario(cenario.id);
    try {
      const r =
        acao === 'retirar'
          ? await retirarCenario(cenario.id)
          : await congelarCenario(cenario.id, acao === 'congelar');
      if (!r.ok) {
        toast.error('Não foi possível alterar o cenário', { description: r.erro });
        return;
      }
      setConfirmaRetirar(null);
      await recarregarCenarios();
      if (acao === 'congelar') {
        toast.success('Cenário congelado como consenso', {
          description: 'As respostas da família não mudam mais; edite só reabrindo.',
        });
      } else if (acao === 'reabrir') {
        toast.success('Cenário reaberto para conversa');
      } else {
        toast.success('Cenário retirado da conversa', {
          description: 'Ele some do portal, mas fica no registro do caso.',
        });
      }
    } finally {
      setMudandoCenario(null);
    }
  };

  const descricaoDoBem = (bemId: string) =>
    espolioDados.bens.find((b) => b.id === bemId)?.descricao ?? 'bem não localizado no acervo atual';

  const decidirNota = async (nota: NotaEspolio, aceitar: boolean, motivo?: string) => {
    setDecidindo(nota.id);
    try {
      const r = await decidirSugestao(nota.id, aceitar, motivo);
      if (!r.ok || !r.nota) {
        toast.error('Não foi possível decidir', { description: r.erro });
        return;
      }
      setNotasEspolio((prev) => prev.map((n) => (n.id === nota.id ? r.nota! : n)));
      setRecusa(null);
      setMotivoRecusa('');
      if (aceitar && nota.tipo === 'sugestao_valor' && nota.valorSugerido) {
        // O aceite é o que muda o caso — aplica o valor no bem AQUI, no
        // navegador do advogado, nunca direto pelo herdeiro.
        onAplicarValor(nota.bemId, nota.valorSugerido);
        toast.success('Sugestão aceita e aplicada ao bem', {
          description: 'Confira o acervo e publique de novo para a família ver o número atualizado.',
        });
      } else if (aceitar) {
        toast.success('Comentário marcado como lido');
      } else {
        toast.success('Sugestão recusada', {
          description: 'O herdeiro vê o motivo no espaço do espólio.',
        });
      }
    } finally {
      setDecidindo(null);
    }
  };

  const decidirDespesaLocal = async (
    despesa: DespesaEspolio,
    decisao: 'reconhecida' | 'nao_reconhecida',
    motivo?: string,
  ) => {
    setDecidindo(despesa.id);
    try {
      const tratamento = tratamentos[despesa.id] ?? 'ressarcir';
      const r = await decidirDespesa(despesa.id, decisao, tratamento, motivo);
      if (!r.ok || !r.despesa) {
        toast.error('Não foi possível decidir', { description: r.erro });
        return;
      }
      setDespesasEspolio((prev) => prev.map((d) => (d.id === despesa.id ? r.despesa! : d)));
      setRecusa(null);
      setMotivoRecusa('');
      if (decisao === 'reconhecida') {
        toast.success('Despesa reconhecida', {
          description:
            tratamento === 'compensar'
              ? 'Entra nos cenários como adiantamento a compensar no quinhão de quem pagou.'
              : 'Entra nos cenários como reembolso integral a quem pagou, rateado por todos.',
        });
      } else {
        toast.success('Despesa não reconhecida', {
          description: 'O herdeiro vê o motivo no espaço do espólio.',
        });
      }
    } finally {
      setDecidindo(null);
    }
  };

  const abrirVotacaoLocal = async () => {
    setSalvandoVotacao(true);
    try {
      const r = await abrirVotacao({
        casoId,
        pergunta: perguntaVotacao,
        descricao: descricaoVotacao,
        opcoes: opcoesVotacao,
        nomeFalecido,
      });
      if (!r.ok) {
        toast.error('Não foi possível abrir a votação', { description: r.erro });
        return;
      }
      setAbrindoVotacao(false);
      setPerguntaVotacao('');
      setDescricaoVotacao('');
      setOpcoesVotacao(['', '']);
      const lista = await votacoesDoEspolio(casoId);
      if (lista.ok) setVotacoes(lista.votacoes ?? []);
      toast.success('Votação aberta à família', {
        description:
          'Cada herdeiro vota pelo próprio link; com e-mail configurado, todos recebem o aviso agora.',
      });
    } finally {
      setSalvandoVotacao(false);
    }
  };

  const encerrarVotacaoLocal = async (votacao: VotacaoDoCaso) => {
    setEncerrandoVotacao(true);
    try {
      const r = await encerrarVotacao(votacao.id, nomeFalecido);
      if (!r.ok || !r.votacao) {
        toast.error('Não foi possível encerrar', { description: r.erro });
        return;
      }
      setConfirmaEncerrarVotacao(null);
      setVotacoes((prev) => prev.map((v) => (v.id === votacao.id ? r.votacao! : v)));
      toast.success('Votação encerrada e apurada', {
        description:
          'O resultado já aparece no portal da família; baixe o termo de deliberação em PDF.',
      });
    } finally {
      setEncerrandoVotacao(false);
    }
  };

  const gerarTermo = async (votacao: VotacaoDoCaso) => {
    setGerandoTermo(votacao.id);
    try {
      const blob = await montarTermoVotacaoPdf({
        nomeFalecido,
        nomeAdvogado,
        agora: agoraIso(),
        votacao,
      });
      baixarBlob(
        blob,
        `Termo de deliberacao - ${votacao.dados.pergunta.slice(0, 60) || 'votacao'}.pdf`,
      );
    } finally {
      setGerandoTermo(null);
    }
  };

  const publicar = async () => {
    if (ativos.length === 0) {
      toast.error('Gere ao menos um convite no cofre antes de publicar', {
        description: 'Os convites aos herdeiros ficam na aba Documentos.',
      });
      return;
    }
    setPublicando(true);
    try {
      const entrada: EntradaPainel = {
        nomeFalecido,
        advogado: {
          nome: nomeAdvogado,
          telefone: estado.telefoneContato,
          email: estado.emailContato,
        },
        rito,
        faseAtual,
        proximoPasso: {
          texto: estado.proximoPasso,
          dataEstimada: estado.proximoPassoData,
        },
        custos: custosVisiveis,
        historico: [],
        convites: ativos.map((c) => ({
          token: c.token,
          nomeHerdeiro: c.nomeHerdeiro,
          quinhao: c.herdeiroId ? quinhoes[c.herdeiroId] : undefined,
        })),
      };
      const visibilidade = {
        contato: estado.contato,
        custos: estado.custos,
        quinhao: estado.quinhao,
      };
      // Espaço do Espólio: UM snapshot para o caso inteiro (igual para
      // todos os herdeiros), atrás do interruptor e das visibilidades.
      const espolio = montarEspolioDoCaso(espolioDados, {
        aberto: estado.espolioAberto,
        bens: estado.espolioBens,
        dividas: estado.espolioDividas,
        quinhoes: estado.espolioQuinhoes,
      });
      const r = await publicarPainel({
        casoId,
        paineis: montarPaineisDoCaso(entrada, visibilidade),
        visibilidade,
        espolio,
      });
      if (r.publicado) {
        onEstado({ publicadoEm: r.publicadoEm });
        toast.success('Painel publicado para a família', {
          description: `${r.convites} herdeiro(s) veem a versão de agora ao abrir o link.`,
        });
      } else {
        toast.error('Não foi possível publicar', { description: r.erro });
      }
    } finally {
      setPublicando(false);
    }
  };

  const encerrar = async () => {
    setEncerrando(true);
    try {
      const r = await encerrarPainel(casoId);
      if (r.ok) {
        setConfirmaEncerrar(false);
        onEstado({ publicadoEm: undefined });
        onEncerrado();
        toast.success('Compartilhamento encerrado', {
          description: `Painel, ${r.convitesApagados ?? 0} convite(s) e os arquivos enviados foram apagados do servidor.`,
        });
      } else {
        toast.error('Não foi possível encerrar', { description: r.erro });
      }
    } finally {
      setEncerrando(false);
    }
  };

  /** Fallback que sempre funciona (sem depender de e-mail): o aviso pronto
   *  para colar no WhatsApp da família — fase atual + próximo passo. */
  const copiarAvisoWhatsApp = async () => {
    const fase = fases.find((f) => f.id === faseAtual);
    const texto =
      `Olá! Atualização do inventário de ${nomeFalecido}: estamos na fase "${fase?.titulo ?? ''}".` +
      (estado.proximoPasso.trim() ? ` Próximo passo: ${estado.proximoPasso.trim()}.` : '') +
      ' Você pode acompanhar tudo pelo seu link do portal — qualquer dúvida, é só me chamar. — ' +
      nomeAdvogado;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Aviso copiado', {
        description: 'Cole no WhatsApp da família — cada herdeiro já tem o próprio link.',
      });
    } catch {
      toast.error('Não foi possível copiar o texto.');
    }
  };

  /** Registro de atendimento em papel: prova da comunicação com a família. */
  const gerarRelatorio = async () => {
    setGerandoRelatorio(true);
    try {
      const r = await eventosDoCaso(casoId);
      if (!r.ok || !r.eventos) {
        toast.error('Não foi possível carregar o registro', { description: r.erro });
        return;
      }
      const blob = await montarRelatorioComunicacaoPdf({
        nomeFalecido,
        nomeAdvogado,
        agora: agoraIso(),
        eventos: r.eventos,
      });
      baixarBlob(blob, `Relatorio de comunicacao - ${nomeFalecido || 'inventario'}.pdf`);
      if (r.eventos.length === 0) {
        toast.info('Ainda sem registros', {
          description: 'Os eventos passam a ser gravados com o uso do cofre e do painel.',
        });
      }
    } finally {
      setGerandoRelatorio(false);
    }
  };

  const revogar = async (convite: ConviteHerdeiro) => {
    setRevogando(convite.token);
    try {
      const r = await revogarConvite(convite.token);
      if (r.ok && r.convite) {
        setConfirmaRevogar(null);
        onConviteAtualizado(r.convite);
        toast.success(`Convite de ${convite.nomeHerdeiro} revogado`, {
          description: 'O link deixou de funcionar; o que já foi enviado permanece no caso.',
        });
      } else {
        toast.error('Não foi possível revogar', { description: r.erro });
      }
    } finally {
      setRevogando(null);
    }
  };

  return (
    <div className="cartao area-painel">
      {/* Cabeçalho clicável: primeiro bloco da Página Inicial, recolhível. */}
      <button
        type="button"
        className="painel-familia-topo"
        aria-expanded={!recolhido}
        onClick={alternarRecolhido}
      >
        <span className="eyebrow">Painel da família</span>
        <span className="fund">
          {estado.publicadoEm
            ? `publicado em ${dataCurta(estado.publicadoEm)} · ${ativos.length} convite(s)`
            : ativos.length > 0
              ? `${ativos.length} convite(s) — ainda não publicado`
              : 'não publicado'}
        </span>
        <span className="painel-familia-seta" aria-hidden>
          {recolhido ? '▸' : '▾'}
        </span>
      </button>

      {!recolhido && (
      <>
      <p className="fund" style={{ margin: '4px 0 10px' }}>
        Uma janela FILTRADA do caso para os herdeiros convidados: fase em linguagem
        simples, próximo passo e o que falta de cada um. Você decide o que aparece e
        clica Publicar — nada sobe sozinho, e o caso completo nunca sai desta máquina.
      </p>

      <div className="grade c2">
        <label className="campo">
          Onde estamos (fase marcada por você)
          <Select value={faseAtual} onValueChange={(v) => v && onEstado({ faseAtual: v })}>
            <SelectTrigger aria-label="Fase atual do inventário">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fases.map((f, i) => (
                <SelectItem key={f.id} value={f.id}>
                  {i + 1}. {f.titulo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="campo">
          Prazo estimado do próximo passo
          <DateInput
            value={estado.proximoPassoData}
            onChange={(iso) => onEstado({ proximoPassoData: iso })}
          />
        </label>
      </div>
      <label className="campo campo-longo" style={{ marginTop: 6 }}>
        Próximo passo (texto curto, para leigos)
        <Input
          value={estado.proximoPasso}
          placeholder="Ex.: Aguardando a certidão de casamento da Ana para emitir a guia do imposto"
          onChange={(e) => onEstado({ proximoPasso: e.target.value })}
        />
      </label>

      <div className="pilha" style={{ marginTop: 10, gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox checked={estado.contato} onCheckedChange={(v) => onEstado({ contato: v === true })} />
          <span>Exibir meu contato (telefone/WhatsApp e e-mail)</span>
        </label>
        {estado.contato && (
          <div className="grade c2">
            <label className="campo">
              Telefone/WhatsApp
              <Input
                value={estado.telefoneContato}
                placeholder="(11) 90000-0000"
                onChange={(e) => onEstado({ telefoneContato: e.target.value })}
              />
            </label>
            <label className="campo">
              E-mail de contato
              <Input
                value={estado.emailContato}
                placeholder="voce@escritorio.adv.br"
                onChange={(e) => onEstado({ emailContato: e.target.value })}
              />
            </label>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox checked={estado.custos} onCheckedChange={(v) => onEstado({ custos: v === true })} />
          <span>
            Mostrar custos do inventário (ITCMD, cartório e despesas — honorários nunca
            aparecem)
          </span>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox checked={estado.quinhao} onCheckedChange={(v) => onEstado({ quinhao: v === true })} />
          <span>
            Liberar o quinhão de cada herdeiro (cada um vê SÓ o seu, com aviso de
            estimativa)
          </span>
        </label>
      </div>

      {/* ---------- Espaço do Espólio (camada 2) ---------- */}
      <div style={{ marginTop: 14 }}>
        <span className="eyebrow">Espaço do espólio</span>
        <p className="fund" style={{ margin: '4px 0 6px' }}>
          O ambiente COMPARTILHADO: todos os herdeiros convidados veem os MESMOS fatos e
          números — o mesmo acervo, as mesmas dívidas, os quinhões calculados pela lei.
          Ver os números juntos é o que mais pacifica. Desligado por padrão.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Checkbox
            checked={estado.espolioAberto}
            onCheckedChange={(v) => onEstado({ espolioAberto: v === true })}
          />
          <span>
            <strong>Abrir para a família</strong> (vale após Publicar)
          </span>
        </label>
        {estado.espolioAberto && (
          <div className="pilha" style={{ marginTop: 6, marginLeft: 24, gap: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                checked={estado.espolioBens}
                onCheckedChange={(v) => onEstado({ espolioBens: v === true })}
              />
              <span>Inventário de bens com valores e fonte da avaliação</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                checked={estado.espolioDividas}
                onCheckedChange={(v) => onEstado({ espolioDividas: v === true })}
              />
              <span>Dívidas do espólio (reduzem o quinhão de todos)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Checkbox
                checked={estado.espolioQuinhoes}
                onCheckedChange={(v) => onEstado({ espolioQuinhoes: v === true })}
              />
              <span>Quinhões calculados de TODOS (cada um vê o dos outros)</span>
            </label>
          </div>
        )}

        {/* Fatos enviados pela família: nada muda no caso sem a decisão aqui. */}
        {estado.espolioAberto &&
          (notasEspolio.length > 0 || despesasEspolio.length > 0) && (
            <div style={{ marginTop: 10 }}>
              <span className="eyebrow">Chegou da família</span>
              {notasEspolio.map((n) => (
                <div className="linha-item" key={n.id}>
                  <span>
                    <strong>{n.autor}</strong>
                    {n.tipo === 'sugestao_valor' ? (
                      <>
                        {' '}sugeriu <strong className="num">{brlCard(n.valorSugerido ?? '0')}</strong>{' '}
                        para “{descricaoDoBem(n.bemId)}”
                      </>
                    ) : (
                      <> comentou “{descricaoDoBem(n.bemId)}”</>
                    )}
                    <span className="fund" style={{ display: 'block' }}>
                      “{n.texto}”
                      {n.status === 'aceita' &&
                        (n.tipo === 'sugestao_valor' ? ' · aceita e aplicada' : ' · lido')}
                      {n.status === 'recusada' && ` · recusada${n.motivo ? `: ${n.motivo}` : ''}`}
                    </span>
                  </span>
                  {n.status === 'pendente' && (
                    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={decidindo === n.id}
                        onClick={() => void decidirNota(n, true)}
                      >
                        {n.tipo === 'sugestao_valor' ? 'aceitar e aplicar' : 'marcar como lido'}
                      </Button>
                      {n.tipo === 'sugestao_valor' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={decidindo !== null}
                          onClick={() => {
                            setMotivoRecusa('');
                            setRecusa({ tipo: 'nota', id: n.id });
                          }}
                        >
                          recusar
                        </Button>
                      )}
                    </span>
                  )}
                </div>
              ))}
              {despesasEspolio.map((d) => (
                <div className="linha-item" key={d.id}>
                  <span>
                    <strong>{d.autor}</strong> adiantou{' '}
                    <strong className="num">{brlCard(d.valor)}</strong> —{' '}
                    {CATEGORIA_DESPESA_ROTULO[d.categoria] ?? d.categoria} · {d.descricao}
                    <span className="fund" style={{ display: 'block' }}>
                      pago em {d.data.split('-').reverse().join('/')} · comprovante na aba Documentos
                      {d.status === 'reconhecida' &&
                        ` · reconhecida (${d.tratamento === 'compensar' ? 'compensar no quinhão' : 'ressarcir pelo espólio'})`}
                      {d.status === 'nao_reconhecida' &&
                        ` · não reconhecida${d.motivo ? `: ${d.motivo}` : ''}`}
                    </span>
                  </span>
                  {d.status === 'pendente' && (
                    <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                      <Select
                        value={tratamentos[d.id] ?? 'ressarcir'}
                        onValueChange={(v) =>
                          v &&
                          setTratamentos((prev) => ({
                            ...prev,
                            [d.id]: v === 'compensar' ? 'compensar' : 'ressarcir',
                          }))
                        }
                      >
                        <SelectTrigger size="sm" aria-label="Tratamento da despesa nos cenários">
                          <SelectValue>
                            {(tratamentos[d.id] ?? 'ressarcir') === 'compensar'
                              ? 'compensar no quinhão'
                              : 'ressarcir pelo espólio'}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ressarcir">
                            ressarcir pelo espólio (reembolso integral, rateado por todos)
                          </SelectItem>
                          <SelectItem value="compensar">
                            compensar no quinhão (abate do que quem pagou tem a receber)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={decidindo === d.id}
                        onClick={() => void decidirDespesaLocal(d, 'reconhecida')}
                      >
                        reconhecer
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive"
                        disabled={decidindo !== null}
                        onClick={() => {
                          setMotivoRecusa('');
                          setRecusa({ tipo: 'despesa', id: d.id });
                        }}
                      >
                        não reconhecer
                      </Button>
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

        {/* Cenários de divisão propostos — o coração do espaço: a família
            responde pelo portal; todos aceitando, o cenário congela. */}
        {estado.espolioAberto && cenarios.filter((c) => c.status !== 'retirado').length > 0 && (
          <div style={{ marginTop: 10 }}>
            <span className="eyebrow">Cenários propostos</span>
            {cenarios
              .filter((c) => c.status !== 'retirado')
              .map((c) => {
                const atuais = c.adesoes.filter((a) => a.atual);
                const aceitos = atuais.filter((a) => a.resposta === 'aceito').length;
                return (
                  <div className="linha-item" key={c.id}>
                    <span>
                      <strong>{c.dados.titulo}</strong>
                      <span className="fracao num">
                        {c.status === 'congelado'
                          ? ' · CONSENSO (congelado)'
                          : ` · em conversa — ${aceitos} de ${ativos.length} aceitaram`}
                      </span>
                      {atuais.length > 0 && (
                        <span className="fund" style={{ display: 'block' }}>
                          {atuais
                            .map(
                              (a) =>
                                `${a.autor}: ${
                                  a.resposta === 'aceito'
                                    ? 'aceitou'
                                    : a.resposta === 'nao_aceito'
                                      ? 'não aceitou'
                                      : 'quer conversar'
                                }${a.comentario ? ` (“${a.comentario}”)` : ''}`,
                            )
                            .join(' · ')}
                        </span>
                      )}
                    </span>
                    <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      {c.status === 'congelado' && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          loading={mudandoCenario === c.id}
                          onClick={() => onLevarParaPartilha(c.dados.alocacoes)}
                        >
                          levar para a partilha
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        loading={mudandoCenario === c.id}
                        onClick={() =>
                          void mudarCenario(c, c.status === 'congelado' ? 'reabrir' : 'congelar')
                        }
                      >
                        {c.status === 'congelado' ? 'reabrir' : 'congelar consenso'}
                      </Button>
                      {c.status === 'proposto' && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          disabled={mudandoCenario !== null}
                          onClick={() => setConfirmaRetirar(c)}
                        >
                          retirar
                        </Button>
                      )}
                    </span>
                  </div>
                );
              })}
            <p className="fund" style={{ margin: '4px 0 0' }}>
              Cenário novo nasce na aba Partilha (seção III): monte a divisão na matriz e
              clique “Propor este cenário à família”.
            </p>
          </div>
        )}

        {/* Votações formais — deliberação em DUAS etapas: abrir (com aviso
            por e-mail) e encerrar (apuração + termo em PDF). */}
        {estado.espolioAberto && (
          <div style={{ marginTop: 10 }}>
            <span className="eyebrow">Votações da família</span>
            {votacoes.map((v) => {
              const validos = v.votos.filter((x) => x.atual);
              const resumo = v.dados.opcoes
                .map((o) => `${o.texto}: ${validos.filter((x) => x.opcaoId === o.id).length}`)
                .join(' · ');
              return (
                <div className="linha-item" key={v.id}>
                  <span>
                    <strong>{v.dados.pergunta}</strong>
                    <span className="fracao num">
                      {v.status === 'aberta'
                        ? ` · ABERTA — ${validos.length} de ${ativos.length} votaram`
                        : ` · encerrada em ${dataCurta(v.encerradaEm ?? undefined)}`}
                    </span>
                    <span className="fund" style={{ display: 'block' }}>
                      {resumo}
                      {validos.length > 0 &&
                        ` — ${validos
                          .map(
                            (x) =>
                              `${x.autor}: ${
                                v.dados.opcoes.find((o) => o.id === x.opcaoId)?.texto ?? x.opcaoId
                              }`,
                          )
                          .join(' · ')}`}
                    </span>
                  </span>
                  <span style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {v.status === 'aberta' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={encerrandoVotacao}
                        onClick={() => setConfirmaEncerrarVotacao(v)}
                      >
                        encerrar e apurar
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        loading={gerandoTermo === v.id}
                        onClick={() => void gerarTermo(v)}
                      >
                        termo de deliberação (PDF)
                      </Button>
                    )}
                  </span>
                </div>
              );
            })}
            <div style={{ marginTop: 6 }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAbrindoVotacao(true)}
              >
                Abrir votação para a família
              </Button>
            </div>
          </div>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        <span className="eyebrow">Convites</span>
        {convites.length === 0 ? (
          <p className="fund" style={{ margin: '4px 0 0' }}>
            Nenhum convite gerado ainda —{' '}
            <Button variant="ghost" size="sm" onClick={irParaDocumentos}>
              gerar convites na aba Documentos
            </Button>
          </p>
        ) : (
          convites.map((c) => (
            <div className="linha-item" key={c.token}>
              <span>
                <strong>{c.nomeHerdeiro}</strong>
                <span className="fracao num">
                  {c.revogadoEm
                    ? ` · revogado em ${dataCurta(c.revogadoEm)}`
                    : c.ultimoAcessoEm
                      ? ` · 1º acesso ${dataCurta(c.primeiroAcessoEm)} · último ${dataCurta(c.ultimoAcessoEm)}`
                      : ' · ainda não acessou'}
                  {!c.revogadoEm && estado.espolioAberto
                    ? c.espolioVistoEm
                      ? ` · viu o espólio em ${dataCurta(c.espolioVistoEm)}`
                      : ' · ainda não viu o espólio'
                    : ''}
                </span>
              </span>
              {!c.revogadoEm && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  onClick={() => setConfirmaRevogar(c)}
                >
                  revogar
                </Button>
              )}
            </div>
          ))
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
        <Button type="button" loading={publicando} onClick={() => void publicar()}>
          Publicar para a família
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={gerandoRelatorio}
          onClick={() => void gerarRelatorio()}
        >
          Relatório de comunicação (PDF)
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => void copiarAvisoWhatsApp()}>
          copiar aviso (WhatsApp)
        </Button>
        {estado.publicadoEm && (
          <>
            <span className="fund">Publicado em {dataCurta(estado.publicadoEm)}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={() => setConfirmaEncerrar(true)}
            >
              Encerrar compartilhamento
            </Button>
          </>
        )}
      </div>
      <p className="fund" style={{ marginTop: 8 }}>
        Mudou a fase ou o próximo passo? Publique de novo — a família só vê a versão
        publicada. Encerrar apaga do servidor o painel, os convites, os arquivos
        enviados e o registro de comunicação deste caso.
      </p>
      </>
      )}

      {/* 1ª etapa da deliberação: abrir a votação (pergunta + opções). */}
      <Dialog open={abrindoVotacao} onOpenChange={(o) => !salvandoVotacao && setAbrindoVotacao(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir votação para a família</DialogTitle>
            <DialogDescription>
              Cada herdeiro vota pelo próprio link e pode mudar o voto enquanto a
              votação estiver aberta (vale o mais recente). Com o e-mail configurado,
              todos recebem o aviso na abertura e no resultado.
            </DialogDescription>
          </DialogHeader>
          <label className="campo">
            Pergunta (em linguagem simples)
            <Input
              value={perguntaVotacao}
              placeholder="Ex.: Vendemos o apartamento da Rua X ou mantemos alugado?"
              onChange={(e) => setPerguntaVotacao(e.target.value)}
            />
          </label>
          <label className="campo">
            Contexto (opcional)
            <Input
              value={descricaoVotacao}
              placeholder="Ex.: A proposta de compra recebida vale até o fim do mês."
              onChange={(e) => setDescricaoVotacao(e.target.value)}
            />
          </label>
          {opcoesVotacao.map((op, i) => (
            <label className="campo" key={i}>
              Opção {i + 1}
              <span style={{ display: 'flex', gap: 6 }}>
                <Input
                  value={op}
                  placeholder={i === 0 ? 'Ex.: Vender pelo valor proposto' : 'Ex.: Manter alugado'}
                  onChange={(e) =>
                    setOpcoesVotacao((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                  }
                />
                {opcoesVotacao.length > 2 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Remover opção ${i + 1}`}
                    onClick={() => setOpcoesVotacao((prev) => prev.filter((_, j) => j !== i))}
                  >
                    ✕
                  </Button>
                )}
              </span>
            </label>
          ))}
          {opcoesVotacao.length < 6 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpcoesVotacao((prev) => [...prev, ''])}
            >
              + adicionar opção
            </Button>
          )}
          <DialogFooter>
            <Button variant="outline" disabled={salvandoVotacao} onClick={() => setAbrindoVotacao(false)}>
              Cancelar
            </Button>
            <Button
              loading={salvandoVotacao}
              disabled={
                perguntaVotacao.trim() === '' ||
                opcoesVotacao.filter((o) => o.trim() !== '').length < 2
              }
              onClick={() => void abrirVotacaoLocal()}
            >
              Abrir votação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 2ª etapa: encerrar e apurar — irreversível (deliberação nova é outra votação). */}
      <Dialog
        open={confirmaEncerrarVotacao !== null}
        onOpenChange={(o) => !encerrandoVotacao && !o && setConfirmaEncerrarVotacao(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar a votação “{confirmaEncerrarVotacao?.dados.pergunta}”?</DialogTitle>
            <DialogDescription>
              A apuração fecha com os votos atuais (
              {confirmaEncerrarVotacao?.votos.filter((v) => v.atual).length ?? 0} de {ativos.length}{' '}
              herdeiro(s) votaram) e ninguém mais vota — encerrada não reabre; para
              deliberar de novo, abra outra votação. A família é avisada do resultado.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="outline"
              disabled={encerrandoVotacao}
              onClick={() => setConfirmaEncerrarVotacao(null)}
            >
              Manter aberta
            </Button>
            <Button
              variant="destructive"
              loading={encerrandoVotacao}
              onClick={() =>
                confirmaEncerrarVotacao && void encerrarVotacaoLocal(confirmaEncerrarVotacao)
              }
            >
              Encerrar e apurar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmaRetirar !== null}
        onOpenChange={(o) => mudandoCenario === null && !o && setConfirmaRetirar(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirar o cenário “{confirmaRetirar?.dados.titulo}”?</DialogTitle>
            <DialogDescription>
              Ele some do portal da família na hora e não volta a ficar em conversa —
              para retomar a ideia, proponha um cenário novo pela aba Partilha. As
              respostas já dadas ficam no registro do caso.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="outline"
              disabled={mudandoCenario !== null}
              onClick={() => setConfirmaRetirar(null)}
            >
              Manter em conversa
            </Button>
            <Button
              variant="destructive"
              loading={mudandoCenario !== null}
              onClick={() => confirmaRetirar && void mudarCenario(confirmaRetirar, 'retirar')}
            >
              Retirar cenário
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Recusa de sugestão / não-reconhecimento de despesa: motivo obrigatório
          — o herdeiro lê exatamente este texto no espaço do espólio. */}
      <Dialog open={recusa !== null} onOpenChange={(o) => decidindo === null && !o && setRecusa(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {recusa?.tipo === 'nota' ? 'Recusar a sugestão de valor?' : 'Não reconhecer a despesa?'}
            </DialogTitle>
            <DialogDescription>
              Explique o motivo em linguagem simples — o herdeiro que enviou vai ler este
              texto no espaço do espólio.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivoRecusa}
            rows={3}
            placeholder={
              recusa?.tipo === 'nota'
                ? 'Ex.: O valor de referência é o venal do IPTU na data do óbito, que já está lançado.'
                : 'Ex.: O comprovante não identifica o pagamento — reenvie o recibo completo.'
            }
            onChange={(e) => setMotivoRecusa(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="outline" disabled={decidindo !== null} onClick={() => setRecusa(null)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              loading={decidindo !== null}
              disabled={motivoRecusa.trim() === ''}
              onClick={() => {
                if (!recusa) return;
                if (recusa.tipo === 'nota') {
                  const nota = notasEspolio.find((n) => n.id === recusa.id);
                  if (nota) void decidirNota(nota, false, motivoRecusa);
                } else {
                  const despesa = despesasEspolio.find((d) => d.id === recusa.id);
                  if (despesa) void decidirDespesaLocal(despesa, 'nao_reconhecida', motivoRecusa);
                }
              }}
            >
              {recusa?.tipo === 'nota' ? 'Recusar com este motivo' : 'Não reconhecer com este motivo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmaEncerrar} onOpenChange={(o) => !encerrando && setConfirmaEncerrar(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Encerrar o compartilhamento com a família?</DialogTitle>
            <DialogDescription>
              Todos os links dos herdeiros deixam de funcionar AGORA, e o servidor apaga
              o painel publicado, os {ativos.length} convite(s) e os arquivos que os
              herdeiros enviaram. O caso na sua máquina não é alterado. Esta ação não
              pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="outline" disabled={encerrando} onClick={() => setConfirmaEncerrar(false)}>
              Manter compartilhado
            </Button>
            <Button variant="destructive" loading={encerrando} onClick={() => void encerrar()}>
              Encerrar e apagar do servidor
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmaRevogar !== null} onOpenChange={(o) => !revogando && !o && setConfirmaRevogar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar o convite de {confirmaRevogar?.nomeHerdeiro}?</DialogTitle>
            <DialogDescription>
              O link deste herdeiro deixa de funcionar imediatamente. Os documentos e a
              qualificação que ele já enviou permanecem no caso; para apagar tudo do
              servidor, use &quot;Encerrar compartilhamento&quot;.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="outline" disabled={revogando !== null} onClick={() => setConfirmaRevogar(null)}>
              Manter o convite
            </Button>
            <Button
              variant="destructive"
              loading={revogando !== null}
              onClick={() => confirmaRevogar && void revogar(confirmaRevogar)}
            >
              Revogar acesso
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
