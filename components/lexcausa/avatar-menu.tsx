'use client';

/**
 * AVATAR da barra LexCausa — o ícone redondo com a foto do perfil (ou as
 * iniciais) que abre o menu da conta: perfil e preferências, administração
 * (master) e sair.
 *
 * Usa o DropdownMenu do shadcn (convenção do repositório). A versão anterior
 * era um painel feito à mão — useState + listener de mousedown para fechar ao
 * clicar fora, reusando a classe do painel do sino —, e vinham dali os
 * defeitos visuais: o item em hover pintava de tinta escura sobre texto
 * escuro, e o "Sair" aparecia como um botão preto solto no meio da lista. O
 * primitivo resolve posicionamento, foco, teclado, Esc e clique fora.
 *
 * O "Sair" é ação destrutiva de sessão: continua pedindo confirmação em
 * Dialog (convenção da plataforma). O dialog fica FORA do menu — abri-lo de
 * dentro de um item que desmonta ao fechar era o antigo bug do "Sair que não
 * sai".
 */

import * as React from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { LogOut, Settings, ShieldCheck } from 'lucide-react';

import { useProgressRouter } from '@/components/navigation-progress';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

function iniciais(nome: string | null): string {
  const partes = (nome ?? '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0][0] ?? '';
  const ultima = partes.length > 1 ? partes[partes.length - 1][0] ?? '' : '';
  return (primeira + ultima).toUpperCase();
}

export function AvatarMenu({
  nome,
  email,
  foto,
  ehMaster,
}: {
  nome: string | null;
  email: string | null;
  foto: string | null;
  ehMaster: boolean;
}) {
  const router = useProgressRouter();
  const [confirmarSaida, setConfirmarSaida] = React.useState(false);
  const [saindo, setSaindo] = React.useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await signOut({ redirect: false });
      router.push('/');
      router.refresh();
    } finally {
      setSaindo(false);
      setConfirmarSaida(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        {/* Duas sutilezas do `render` no Base UI: o conteúdo vai DENTRO do
            elemento passado (como children do Trigger ele não é repassado), e
            o `className` precisa vir no Trigger — no elemento do render ele é
            sobrescrito, e o avatar perdia a veste redonda do .lc-avatar. */}
        <DropdownMenuTrigger
          className="lc-avatar"
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Conta de ${nome ?? 'usuário'} — abrir o menu`}
            >
              {foto ? (
                // eslint-disable-next-line @next/next/no-img-element -- data URL do banco, sem otimização a fazer
                <img src={foto} alt="" width={28} height={28} />
              ) : (
                <span aria-hidden>{iniciais(nome)}</span>
              )}
            </Button>
          }
        />
        {/* align="end": encosta na borda direita da barra, sem sair da tela. */}
        <DropdownMenuContent align="end" className="w-64">
          {/* Cabeçalho da conta como <div>, não DropdownMenuLabel: o
              GroupLabel do Base UI exige um Group em volta e, sem ele, lança
              o erro #31 — que derruba a renderização e o menu não abre. Aqui
              é identificação, não rótulo de um grupo de itens. */}
          <div className="px-2 py-1.5">
            <span className="block truncate text-sm font-medium">
              {nome ?? 'Sua conta'}
            </span>
            {email && (
              <span className="block truncate text-xs text-muted-foreground">
                {email}
              </span>
            )}
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem render={<Link href="/config" />}>
            <Settings />
            Perfil e preferências
          </DropdownMenuItem>
          {ehMaster && (
            <DropdownMenuItem render={<Link href="/admin" />}>
              <ShieldCheck />
              Administração
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => setConfirmarSaida(true)}
          >
            <LogOut />
            Sair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={confirmarSaida} onOpenChange={setConfirmarSaida}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Sair da conta?</DialogTitle>
            <DialogDescription>
              A ferramenta exige login — você voltará para a tela de entrada.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmarSaida(false)}
              disabled={saindo}
            >
              Cancelar
            </Button>
            <Button variant="destructive" loading={saindo} onClick={sair}>
              Sair
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
