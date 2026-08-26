'use client';

/**
 * /admin/radar — client: ações da operação (aprovar/recusar/suspender perfil,
 * conceder/revogar UF, varredura 72h, decidir denúncia). Toda validação REAL
 * está nas server actions (requireMaster) — aqui é só a mesa de trabalho.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Toaster } from '@/components/ui/sonner';

import type { CasoAnonimo } from '@/lib/radar/anonimizar';

import {
  concederCreditosRadar,
  decidirDenuncia,
  decidirPerfil,
  executarVarredura72h,
  retirarPublicacaoRadar,
} from './actions';

export interface DadosAdminRadar {
  ativo: boolean;
  perfis: {
    userId: string;
    nome: string;
    email: string;
    oab: string;
    situacao: string;
    motivoRecusa: string | null;
    quizOk: boolean;
    aceitaPequenoValor: boolean;
    creditos: number;
  }[];
  denuncias: { id: string; advogado: string; motivo: string; status: string; em: string }[];
  /**
   * MODERAÇÃO: as publicações ativas do mural, no MESMO recorte anônimo que
   * os advogados veem (inclusive as observações — o campo a moderar). Nunca
   * o intake bruto: nome/e-mail/token não chegam aqui (temEmail é só a flag
   * de que o aviso da retirada tem para onde ir).
   */
  publicacoes: { intakeId: string; status: string; temEmail: boolean; caso: CasoAnonimo }[];
  funil: {
    publicados: number;
    emConversa: number;
    contratados: number;
    retirados: number;
    respostas: number;
    /** Pediu análise, recebeu o link e ainda NÃO clicou — fora do Radar. */
    aguardandoConfirmacao: number;
    /** Respondeu o questionário e nunca pediu análise. */
    semPedido: number;
    porUf: { uf: string; casos: number }[];
  };
  elegiveis72h: number;
}

const COR_SITUACAO: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  aprovado: 'default',
  pendente: 'secondary',
  recusado: 'outline',
  suspenso: 'destructive',
};

export function AdminRadarClient({ dados }: { dados: DadosAdminRadar }) {
  const router = useRouter();
  const [agindo, setAgindo] = useState(false);
  const [recusando, setRecusando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [creditosNovos, setCreditosNovos] = useState<Record<string, string>>({});

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

  /** Dialog de retirada do mural: publicação alvo + motivo que a família lê. */
  const [retirando, setRetirando] = useState<{ intakeId: string; rotulo: string; temEmail: boolean } | null>(null);
  const [motivoRetirada, setMotivoRetirada] = useState('');

  const pendentes = dados.perfis.filter((p) => p.situacao === 'pendente');
  const denunciasPendentes = dados.denuncias.filter((d) => d.status === 'pendente');

  return (
    <div className="flex flex-col gap-8">
      <Toaster position="bottom-right" duration={4000} visibleToasts={1} />

      {!dados.ativo && (
        <p className="rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-sm">
          O Radar está DESLIGADO neste deploy (defina <code>RADAR_ATIVO=1</code>) — os
          cadastros abaixo continuam operáveis.
        </p>
      )}

      {/* Funil — contadores próprios, nunca conteúdo. */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Funil</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ['Publicados', dados.funil.publicados],
              ['Em conversa', dados.funil.emConversa],
              ['Contratados', dados.funil.contratados],
              ['Respostas', dados.funil.respostas],
              ['Retirados', dados.funil.retirados],
            ] as const
          ).map(([rotulo, valor]) => (
            <div key={rotulo} className="rounded-lg border p-3">
              <p className="text-2xl font-semibold tabular-nums">{valor}</p>
              <p className="text-xs text-muted-foreground">{rotulo}</p>
            </div>
          ))}
        </div>
        {dados.funil.porUf.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Casos abertos por UF:{' '}
            {dados.funil.porUf.map((l) => `${l.uf} (${l.casos})`).join(' · ')}
          </p>
        )}
        {/* A etapa ANTES do Radar: quem respondeu o questionário e não pediu
            análise. A publicação virou imediata (o aceite na tela publica), e
            o primeiro contador guarda só o RESÍDUO da era do link por e-mail —
            solicitações que ficaram paradas naquele passo e nunca voltaram. */}
        <p className="text-sm text-muted-foreground">
          Antes do Radar: <strong>{dados.funil.semPedido}</strong> responderam o
          questionário e não pediram análise
          {dados.funil.aguardandoConfirmacao > 0 && (
            <>
              {' '}· <strong>{dados.funil.aguardandoConfirmacao}</strong> pararam no antigo
              link de confirmação por e-mail (antes de a publicação ser imediata) e nunca
              voltaram
            </>
          )}
          .
        </p>
      </section>

      {/* Varredura 72h — o aviso honesto, um por família. */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Aviso de 72 horas</h2>
        <p className="text-sm text-muted-foreground">
          {dados.elegiveis72h} família(s) publicada(s) há mais de 72h sem aviso enviado. A
          varredura manda UM e-mail honesto (&ldquo;ainda sem respostas&rdquo;) a quem não
          recebeu nenhuma resposta — nunca repete.
        </p>
        <Button
          loading={agindo}
          disabled={dados.elegiveis72h === 0}
          onClick={() =>
            void rodar(async () => {
              const r = await executarVarredura72h();
              if (r.ok) toast.info(`${r.avisados ?? 0} família(s) avisada(s).`);
              return r;
            }, 'Varredura concluída.')
          }
        >
          Executar varredura
        </Button>
      </section>

      {/* MODERAÇÃO DO MURAL — o card é o MESMO recorte anônimo que os
          advogados veem (observações incluídas: é o campo a moderar).
          Retirar exige motivo, que a família lê no e-mail. */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Publicações no mural{' '}
          {dados.publicacoes.length > 0 && <Badge>{dados.publicacoes.length}</Badge>}
        </h2>
        {dados.publicacoes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma publicação ativa no mural.</p>
        )}
        {dados.publicacoes.map((pub) => (
          <div key={pub.intakeId} className="flex flex-wrap items-start gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-medium">
                {pub.caso.cidade ? `${pub.caso.cidade}/` : ''}
                {pub.caso.uf} · {pub.caso.qtdHerdeiros} herdeiro(s) · acervo {pub.caso.faixaAcervo}
                {pub.status === 'em_conversa' && (
                  <Badge variant="secondary" className="ml-2">em conversa</Badge>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                publicado em {pub.caso.publicadoEm.split('-').reverse().join('/')}
                {' · '}
                {pub.caso.respostas.map((l) => `${l.rotulo}: ${l.valor}`).join(' · ')}
              </p>
              {pub.caso.observacoes && (
                <p className="text-sm">
                  <strong>A família escreveu:</strong> “{pub.caso.observacoes}”
                </p>
              )}
              {!pub.temEmail && (
                <p className="text-sm text-amber-600">
                  Sem e-mail cadastrado (publicação antiga) — retirar funciona, mas o aviso
                  não tem para onde ir.
                </p>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={agindo}
              onClick={() => {
                setMotivoRetirada('');
                setRetirando({
                  intakeId: pub.intakeId,
                  rotulo: `${pub.caso.cidade ? `${pub.caso.cidade}/` : ''}${pub.caso.uf}`,
                  temEmail: pub.temEmail,
                });
              }}
            >
              Retirar do mural
            </Button>
          </div>
        ))}
      </section>

      {/* Fila de verificação — OAB conferida À MÃO. */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Fila de verificação {pendentes.length > 0 && <Badge>{pendentes.length}</Badge>}
        </h2>
        {pendentes.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhum perfil aguardando verificação. A inscrição é feita pelo(a) próprio(a)
            advogado(a) em <strong>/radar</strong> (passo 1 — número da OAB + seccional);
            enviada, ela aparece aqui para você aprovar ou recusar.
          </p>
        )}
        {pendentes.map((p) => (
          <div key={p.userId} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{p.nome}</p>
              <p className="text-sm text-muted-foreground">
                {p.email} · {p.oab} · quiz {p.quizOk ? 'ok' : 'pendente'}
              </p>
            </div>
            <Button
              size="sm"
              loading={agindo}
              onClick={() => void rodar(() => decidirPerfil(p.userId, 'aprovar'), 'Perfil aprovado.')}
            >
              Aprovar
            </Button>
            <Button size="sm" variant="outline" disabled={agindo} onClick={() => { setRecusando(p.userId); setMotivo(''); }}>
              Recusar
            </Button>
          </div>
        ))}
      </section>

      {/* Perfis e CRÉDITOS do Radar — a assinatura do aplicativo os origina
          (concessão manual; cada candidatura consome 1, em qualquer UF). */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Perfis e créditos</h2>
        <p className="text-sm text-muted-foreground">
          O uso do Radar é por créditos da assinatura do aplicativo — sem restrição por
          UF. Crédito é preço de uso (consome na candidatura, tenha ou não retorno da
          família), nunca comissão por caso.
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Advogado(a)</TableHead>
              <TableHead>OAB</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>Créditos</TableHead>
              <TableHead>Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dados.perfis.map((p) => (
              <TableRow key={p.userId}>
                <TableCell>
                  <p className="font-medium">{p.nome}</p>
                  <p className="text-xs text-muted-foreground">{p.email}</p>
                </TableCell>
                <TableCell>{p.oab}</TableCell>
                <TableCell>
                  <Badge variant={COR_SITUACAO[p.situacao] ?? 'secondary'}>{p.situacao}</Badge>
                  {!p.quizOk && <p className="text-xs text-muted-foreground">quiz pendente</p>}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={p.creditos > 0 ? 'outline' : 'destructive'} className="tabular-nums">
                      {p.creditos}
                    </Badge>
                    <Input
                      value={creditosNovos[p.userId] ?? ''}
                      onChange={(e) =>
                        setCreditosNovos((prev) => ({
                          ...prev,
                          [p.userId]: e.target.value.replace(/[^0-9-]/g, '').slice(0, 5),
                        }))
                      }
                      placeholder="+10"
                      aria-label="Créditos a adicionar (negativo ajusta para baixo)"
                      className="h-7 w-16 text-xs"
                    />
                    {creditosNovos[p.userId] && Number(creditosNovos[p.userId]) !== 0 && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={agindo}
                        onClick={() =>
                          void rodar(
                            () => concederCreditosRadar(p.userId, Number(creditosNovos[p.userId])),
                            `Créditos atualizados (${creditosNovos[p.userId]}).`,
                          ).then(() => setCreditosNovos((prev) => ({ ...prev, [p.userId]: '' })))
                        }
                      >
                        Aplicar
                      </Button>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  {p.situacao === 'aprovado' && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={agindo}
                      onClick={() => void rodar(() => decidirPerfil(p.userId, 'suspender'), 'Perfil suspenso.')}
                    >
                      Suspender
                    </Button>
                  )}
                  {p.situacao === 'suspenso' && (
                    <Button
                      size="sm"
                      variant="outline"
                      loading={agindo}
                      onClick={() => void rodar(() => decidirPerfil(p.userId, 'reativar'), 'Perfil reativado.')}
                    >
                      Reativar
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      {/* Denúncias — acatar SUSPENDE o perfil. */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Denúncias {denunciasPendentes.length > 0 && <Badge variant="destructive">{denunciasPendentes.length}</Badge>}
        </h2>
        {dados.denuncias.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma denúncia registrada.</p>
        )}
        {dados.denuncias.map((d) => (
          <div key={d.id} className="rounded-lg border p-3">
            <p className="text-sm">
              <span className="font-medium">{d.advogado}</span> · {d.em} ·{' '}
              <Badge variant={d.status === 'pendente' ? 'secondary' : d.status === 'acatada' ? 'destructive' : 'outline'}>
                {d.status}
              </Badge>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">“{d.motivo}”</p>
            {d.status === 'pendente' && (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  loading={agindo}
                  onClick={() => void rodar(() => decidirDenuncia(d.id, 'acatar'), 'Denúncia acatada — perfil suspenso.')}
                >
                  Acatar e suspender
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  loading={agindo}
                  onClick={() => void rodar(() => decidirDenuncia(d.id, 'arquivar'), 'Denúncia arquivada.')}
                >
                  Arquivar
                </Button>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Recusa com motivo — o(a) advogado(a) lê na tela do Radar. */}
      <Dialog open={recusando !== null} onOpenChange={(v) => !v && setRecusando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Recusar verificação</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Motivo (o profissional lê): ex. inscrição não localizada no CNA"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            maxLength={300}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusando(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={agindo}
              disabled={motivo.trim().length < 5}
              onClick={() => {
                const alvo = recusando!;
                void rodar(() => decidirPerfil(alvo, 'recusar', motivo), 'Perfil recusado.').then(() =>
                  setRecusando(null),
                );
              }}
            >
              Recusar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Retirar do mural: destrutivo para a publicação (não para o resultado
          da família) — motivo obrigatório, porque é ELE que a família lê no
          e-mail. A republicação do mesmo conteúdo fica bloqueada; o caminho
          limpo é refazer o questionário sem o dado. */}
      <Dialog open={retirando !== null} onOpenChange={(o) => !o && setRetirando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retirar a publicação de {retirando?.rotulo} do mural?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O caso sai do mural na hora e a família não consegue republicar o mesmo
            conteúdo — o e-mail que ela recebe explica o motivo e orienta a refazer o
            questionário sem dados que identifiquem pessoas. O resultado dela continua
            acessível pelo link de sempre.
            {retirando && !retirando.temEmail && (
              <strong> Atenção: esta publicação não tem e-mail — avise por outro canal.</strong>
            )}
          </p>
          <label className="text-sm font-medium" htmlFor="motivo-retirada">
            Motivo (a família lê exatamente este texto)
          </label>
          <Input
            id="motivo-retirada"
            value={motivoRetirada}
            placeholder="Ex.: o texto livre continha nome e endereço de familiares"
            onChange={(e) => setMotivoRetirada(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetirando(null)} disabled={agindo}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={agindo}
              disabled={motivoRetirada.trim().length < 5}
              onClick={() => {
                if (!retirando) return;
                void rodar(async () => {
                  const r = await retirarPublicacaoRadar(retirando.intakeId, motivoRetirada);
                  if (r.ok && retirando.temEmail && !r.emailEnviado) {
                    toast.warning(
                      'Publicação retirada, mas o e-mail à família NÃO saiu (envio desligado ou falhou) — avise por outro canal.',
                    );
                  }
                  return r;
                }, 'Publicação retirada do mural.').then(() => setRetirando(null));
              }}
            >
              Retirar e avisar a família
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
