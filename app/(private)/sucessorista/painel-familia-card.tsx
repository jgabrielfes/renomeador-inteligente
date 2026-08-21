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
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
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
import type { ConviteHerdeiro } from '@/lib/portal/store';
import { montarRelatorioComunicacaoPdf } from '@/lib/portal/relatorio-pdf';
import { baixarBlob } from '@/lib/partilha/xlsx';

import {
  encerrarPainel,
  estadoPainel,
  eventosDoCaso,
  publicarPainel,
  revogarConvite,
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
  estado,
  onEstado,
  onConviteAtualizado,
  onEncerrado,
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
  estado: EstadoPainelFamilia;
  onEstado: (patch: Partial<EstadoPainelFamilia>) => void;
  onConviteAtualizado: (convite: ConviteHerdeiro) => void;
  /** Encerrou no servidor: o client limpa os convites do caso. */
  onEncerrado: () => void;
  irParaDocumentos: () => void;
}) {
  const [publicando, setPublicando] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [confirmaEncerrar, setConfirmaEncerrar] = useState(false);
  const [revogando, setRevogando] = useState<string | null>(null);
  const [confirmaRevogar, setConfirmaRevogar] = useState<ConviteHerdeiro | null>(null);
  const [gerandoRelatorio, setGerandoRelatorio] = useState(false);
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
      const r = await publicarPainel({
        casoId,
        paineis: montarPaineisDoCaso(entrada, visibilidade),
        visibilidade,
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
