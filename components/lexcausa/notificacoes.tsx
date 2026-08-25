'use client';

/**
 * SINO do shell — a central de notificações da LexCausa: carrega os avisos
 * acionáveis dos produtos (notificacoes-actions) ao montar, mostra o badge
 * com a contagem e um painel com filtro por produto. Aviso é atalho, nunca
 * bloqueio — clicar leva à tela onde a ação acontece.
 *
 * O painel é o Popover do shadcn (convenção do repositório). Antes era um
 * <div> posicionado à mão, com listener de mousedown para fechar ao clicar
 * fora — e uma guarda extra para não desmontar dialogs abertos de dentro
 * dele. O primitivo resolve posicionamento, foco, Esc e clique fora.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';

import {
  notificacoesLexCausa,
  type NotificacaoLexCausa,
} from '@/app/(private)/notificacoes-actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';

export function SinoNotificacoes() {
  const [itens, setItens] = useState<NotificacaoLexCausa[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<string>('');

  // Carga diferida (convenção): o efeito só agenda; melhor-esforço.
  useEffect(() => {
    const t = setTimeout(() => {
      void notificacoesLexCausa()
        .then(setItens)
        .catch(() => setItens([]));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const total = itens?.length ?? 0;
  const produtos = [...new Set((itens ?? []).map((i) => i.produto))];
  const visiveis = (itens ?? []).filter((i) => !filtro || i.produto === filtro);

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="sm"
            aria-label={total > 0 ? `Avisos: ${total}` : 'Avisos'}
            title="Avisos e pendências"
          >
            <Bell />
            <span className="lc-so-largo">Avisos</span>
            {total > 0 && (
              <Badge className="ml-0.5 h-4 min-w-4 px-1 tabular-nums">
                {total}
              </Badge>
            )}
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
            Notificações
          </span>
          {produtos.length > 1 && (
            <span className="inline-flex gap-1">
              <Button
                variant={filtro === '' ? 'secondary' : 'ghost'}
                size="xs"
                onClick={() => setFiltro('')}
              >
                Tudo
              </Button>
              {produtos.map((p) => (
                <Button
                  key={p}
                  variant={filtro === p ? 'secondary' : 'ghost'}
                  size="xs"
                  onClick={() => setFiltro(p)}
                >
                  {p}
                </Button>
              ))}
            </span>
          )}
        </div>

        {itens === null && (
          <p className="px-3 py-4 text-sm text-muted-foreground">Carregando…</p>
        )}
        {itens !== null && visiveis.length === 0 && (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Nada aguardando você agora. Os avisos do caso (prazos, chegadas do
            cofre) vivem no painel do próprio caso.
          </p>
        )}
        {visiveis.length > 0 && (
          <ScrollArea className="max-h-80">
            <ul className="flex flex-col py-1">
              {visiveis.map((n, i) => (
                <li key={i}>
                  <Link
                    href={n.href}
                    onClick={() => setAberto(false)}
                    className="flex flex-col gap-0.5 px-3 py-2 text-sm hover:bg-accent"
                  >
                    <span className="text-xs text-muted-foreground">
                      {n.produto}
                    </span>
                    {n.texto}
                  </Link>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
