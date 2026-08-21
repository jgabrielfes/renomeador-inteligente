/**
 * Card "Minha equipe" do dashboard O Caso.
 *
 * Sem equipe: criar a sua (vira CHEFE) ou entrar com o código do convite.
 * Com equipe: membros com papel, e as ações de GESTÃO só para o chefe —
 * gerar código de uso único, remover membro, excluir a equipe. O membro faz
 * tudo no módulo; gerir a equipe é exclusivo do chefe (validado no servidor).
 * O compartilhamento dos CASOS é a mesma pasta-raiz no Drive/OneDrive — o
 * card orienta; a guarda de conflito já arbitra edições simultâneas.
 */

import { useState } from 'react';
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
  criarEquipe,
  entrarNaEquipe,
  excluirEquipe,
  gerarConviteEquipe,
  removerMembroEquipe,
  sairDaEquipe,
  type InfoEquipe,
  type MembroEquipe,
} from './equipe-actions';

export function EquipeCard({ inicial }: { inicial: InfoEquipe | null }) {
  const [equipe, setEquipe] = useState<InfoEquipe | null>(inicial);
  const [nomeNova, setNomeNova] = useState('');
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [codigoGerado, setCodigoGerado] = useState<{ codigo: string; acessoCasos: boolean } | null>(null);
  const [conviteAcessoTotal, setConviteAcessoTotal] = useState(false);
  const [removendo, setRemovendo] = useState<MembroEquipe | null>(null);
  const [confirmandoFim, setConfirmandoFim] = useState<'excluir' | 'sair' | null>(null);

  const rodar = async <T,>(
    chave: string,
    acao: () => Promise<{ ok: true; dados: T } | { ok: false; erro: string }>,
    aoOk: (dados: T) => void,
  ) => {
    setOcupado(chave);
    try {
      const r = await acao();
      if (r.ok) aoOk(r.dados);
      else toast.error(r.erro);
    } catch {
      toast.error('Falha de rede — tente de novo.');
    } finally {
      setOcupado(null);
    }
  };

  return (
    <div className="cartao">
      <span className="eyebrow">Minha equipe</span>

      {equipe === null ? (
        <>
          <p className="fund" style={{ margin: '4px 0 10px' }}>
            Trabalhe o MESMO caso em equipe, cada um com o próprio login: o(a) chefe cria a
            equipe e convida por código. Convite comum compartilha os casos pela MESMA
            pasta-raiz no Google Drive/OneDrive (cada membro escolhe essa pasta no painel Meus
            Casos); convite de ACESSO TOTAL abre todos os casos do(a) chefe direto pela nuvem
            da equipe — em qualquer máquina, sem configurar pasta.
          </p>
          <label className="campo" style={{ maxWidth: 320 }}>
            Criar a minha equipe
            <Input
              value={nomeNova}
              placeholder="Nome da equipe (ex.: Equipe Dra. Maria)"
              onChange={(e) => setNomeNova(e.target.value)}
            />
          </label>
          <div className="escolha" style={{ marginTop: 8 }}>
            <Button
              size="sm"
              loading={ocupado === 'criar'}
              onClick={() =>
                void rodar('criar', () => criarEquipe(nomeNova), (dados) => {
                  setEquipe(dados);
                  toast.success('Equipe criada — você é o(a) chefe.');
                })
              }
            >
              Criar equipe
            </Button>
          </div>
          <label className="campo" style={{ maxWidth: 320, marginTop: 12 }}>
            <span>
              Fui convidado(a) <span className="dica">— cole o código do(a) chefe</span>
            </span>
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </label>
          <div className="escolha" style={{ marginTop: 8 }}>
            <Button
              size="sm"
              variant="outline"
              loading={ocupado === 'entrar'}
              onClick={() =>
                void rodar('entrar', () => entrarNaEquipe(codigo), (dados) => {
                  setEquipe(dados);
                  setCodigo('');
                  toast.success(`Você entrou na equipe "${dados.nome}".`);
                })
              }
            >
              Entrar na equipe
            </Button>
          </div>
        </>
      ) : (
        <>
          <h3 style={{ margin: '4px 0 2px' }}>{equipe.nome}</h3>
          <p className="fund" style={{ margin: '0 0 8px' }}>
            Você é {equipe.papel === 'CHEFE' ? 'o(a) CHEFE' : 'MEMBRO'} ·{' '}
            {equipe.membros.length} pessoa(s).{' '}
            {equipe.papel !== 'CHEFE' && equipe.meuAcessoCasos
              ? 'Você tem ACESSO TOTAL: os casos da nuvem da equipe aparecem no seu painel Meus Casos.'
              : 'Casos compartilhados pela MESMA pasta-raiz no Drive/OneDrive (escolhida no painel Meus Casos) ou pela nuvem da equipe (convite de acesso total).'}
          </p>
          {equipe.membros.map((m) => (
            <div key={m.id} className="linha-item" style={{ padding: '4px 0' }}>
              <span>
                <strong>{m.nome}</strong>
                <span className="fund">
                  {' '}· {m.email} · {m.papel === 'CHEFE' ? 'chefe' : 'membro'}
                  {m.papel !== 'CHEFE' && m.acessoCasos ? ' · acesso total aos casos' : ''}
                </span>
              </span>
              {equipe.papel === 'CHEFE' && m.papel !== 'CHEFE' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setRemovendo(m)}
                >
                  remover
                </Button>
              )}
            </div>
          ))}

          {equipe.papel === 'CHEFE' ? (
            <>
              <label className="marcar" style={{ marginTop: 10 }}>
                <Checkbox
                  checked={conviteAcessoTotal}
                  onCheckedChange={(v) => setConviteAcessoTotal(v === true)}
                />
                <span>
                  Convite com <strong>acesso a TODOS os meus casos</strong>{' '}
                  <span className="dica">
                    — como se você autorizasse o seu acervo: quem entrar enxerga e trabalha todos
                    os casos da nuvem da equipe, sem poder gerir a equipe
                  </span>
                </span>
              </label>
              <div className="escolha" style={{ marginTop: 8 }}>
                <Button
                  size="sm"
                  variant="outline"
                  loading={ocupado === 'convite'}
                  onClick={() =>
                    void rodar('convite', () => gerarConviteEquipe(conviteAcessoTotal), (dados) =>
                      setCodigoGerado(dados),
                    )
                  }
                >
                  Gerar código de convite
                </Button>
                {equipe.membros.length === 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    onClick={() => setConfirmandoFim('excluir')}
                  >
                    excluir equipe
                  </Button>
                )}
              </div>
              {codigoGerado && (
                <div className="nota registro" style={{ marginTop: 8 }}>
                  <span className="eyebrow">
                    {codigoGerado.acessoCasos
                      ? 'Código de convite — ACESSO TOTAL aos casos (uso único)'
                      : 'Código de convite (uso único)'}
                  </span>
                  <p className="num" style={{ fontSize: 'var(--t-base)', letterSpacing: '0.06em', margin: '4px 0' }}>
                    {codigoGerado.codigo}
                  </p>
                  <p className="fund" style={{ margin: 0 }}>
                    Envie ao membro: ele entra com a PRÓPRIA conta e cola este código aqui no
                    card. Cada código vale UMA entrada — gere outro para a próxima pessoa.
                    {codigoGerado.acessoCasos
                      ? ' Quem entrar com este código vê todos os casos da nuvem da equipe no painel Meus Casos.'
                      : ''}
                  </p>
                  <div className="escolha" style={{ marginTop: 6 }}>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(codigoGerado.codigo)
                          .then(() => toast.success('Código copiado.'))
                          .catch(() => toast.error('Não consegui copiar — selecione o texto.'));
                      }}
                    >
                      Copiar código
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="escolha" style={{ marginTop: 10 }}>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => setConfirmandoFim('sair')}
              >
                sair da equipe
              </Button>
            </div>
          )}
        </>
      )}

      {/* remover membro (destrutivo → confirmação) */}
      <Dialog open={removendo !== null} onOpenChange={(a) => !a && setRemovendo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remover da equipe?</DialogTitle>
            <DialogDescription>
              {removendo?.nome} perde o vínculo com a equipe (a conta dele(a) continua
              existindo). O acesso à pasta compartilhada no Drive é revogado por você, no
              próprio Drive.
            </DialogDescription>
          </DialogHeader>
          <div className="escolha" style={{ justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setRemovendo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={ocupado === 'remover'}
              onClick={() =>
                removendo &&
                void rodar('remover', () => removerMembroEquipe(removendo.id), (dados) => {
                  setEquipe(dados);
                  setRemovendo(null);
                  toast.success('Membro removido.');
                })
              }
            >
              Remover
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* excluir equipe / sair (destrutivo → confirmação) */}
      <Dialog open={confirmandoFim !== null} onOpenChange={(a) => !a && setConfirmandoFim(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmandoFim === 'excluir' ? 'Excluir a equipe?' : 'Sair da equipe?'}
            </DialogTitle>
            <DialogDescription>
              {confirmandoFim === 'excluir'
                ? 'A equipe deixa de existir (os casos na pasta compartilhada não são tocados).'
                : 'Você perde o vínculo com a equipe (os casos na pasta compartilhada não são tocados).'}
            </DialogDescription>
          </DialogHeader>
          <div className="escolha" style={{ justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={() => setConfirmandoFim(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={ocupado === 'fim'}
              onClick={() =>
                void rodar(
                  'fim',
                  confirmandoFim === 'excluir' ? excluirEquipe : sairDaEquipe,
                  () => {
                    setEquipe(null);
                    setConfirmandoFim(null);
                    setCodigoGerado(null);
                    toast.success(
                      confirmandoFim === 'excluir' ? 'Equipe excluída.' : 'Você saiu da equipe.',
                    );
                  },
                )
              }
            >
              {confirmandoFim === 'excluir' ? 'Excluir' : 'Sair'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
