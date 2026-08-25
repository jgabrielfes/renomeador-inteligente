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
import { UFS } from '@/lib/familias/tipos';

import {
  concederAssinatura,
  decidirDenuncia,
  decidirPerfil,
  executarVarredura72h,
  revogarAssinatura,
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
    ufs: string[];
  }[];
  denuncias: { id: string; advogado: string; motivo: string; status: string; em: string }[];
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
  const [ufNova, setUfNova] = useState<Record<string, string>>({});

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

  const pendentes = dados.perfis.filter((p) => p.situacao === 'pendente');
  const denunciasPendentes = dados.denuncias.filter((d) => d.status === 'pendente');

  return (
    <div className="flex flex-col gap-8">
      <Toaster position="bottom-right" duration={4000} visibleToasts={1} />

      {!dados.ativo && (
        <p className="rounded-md border border-amber-600/40 bg-amber-500/10 p-3 text-sm">
          O Radar está DESLIGADO neste deploy (defina <code>RADAR_ATIVO=1</code> e{' '}
          <code>RESEND_API_KEY</code>) — os cadastros abaixo continuam operáveis.
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
        {/* As duas etapas ANTES da publicação: sem elas, uma solicitação
            parada no clique do e-mail some do painel e parece defeito. */}
        <p className="text-sm text-muted-foreground">
          Antes do Radar: <strong>{dados.funil.aguardandoConfirmacao}</strong> pediram
          análise e ainda não clicaram no link de confirmação do e-mail (o clique é o
          consentimento — sem ele o caso não é publicado) ·{' '}
          <strong>{dados.funil.semPedido}</strong> responderam o questionário e não
          pediram análise.
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

      {/* Fila de verificação — OAB conferida À MÃO. */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Fila de verificação {pendentes.length > 0 && <Badge>{pendentes.length}</Badge>}
        </h2>
        {pendentes.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum perfil aguardando verificação.</p>
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

      {/* Perfis e assinaturas por UF. */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Perfis e assinaturas</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Advogado(a)</TableHead>
              <TableHead>OAB</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead>UFs assinadas</TableHead>
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
                  <div className="flex flex-wrap items-center gap-1">
                    {p.ufs.map((uf) => (
                      <Badge key={uf} variant="outline" className="gap-1">
                        {uf}
                        <button
                          type="button"
                          aria-label={`Revogar ${uf}`}
                          onClick={() => void rodar(() => revogarAssinatura(p.userId, uf), `Assinatura ${uf} revogada.`)}
                        >
                          ×
                        </button>
                      </Badge>
                    ))}
                    <select
                      value={ufNova[p.userId] ?? ''}
                      onChange={(e) => setUfNova((prev) => ({ ...prev, [p.userId]: e.target.value }))}
                      className="h-7 rounded-md border bg-transparent px-1 text-xs"
                    >
                      <option value="">+UF</option>
                      {UFS.filter((u) => !p.ufs.includes(u)).map((u) => (
                        <option key={u}>{u}</option>
                      ))}
                    </select>
                    {ufNova[p.userId] && (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={agindo}
                        onClick={() =>
                          void rodar(
                            () => concederAssinatura(p.userId, ufNova[p.userId]),
                            `Assinatura ${ufNova[p.userId]} concedida.`,
                          ).then(() => setUfNova((prev) => ({ ...prev, [p.userId]: '' })))
                        }
                      >
                        Conceder
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
    </div>
  );
}
