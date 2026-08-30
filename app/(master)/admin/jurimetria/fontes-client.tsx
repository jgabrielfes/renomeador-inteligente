'use client';

// Peças client do /admin/jurimetria: sub-navegação das três telas e as
// ações por fonte (coletar agora / desbloquear / cadastrar URL do site).

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { coletarAgora, desbloquearFonte, salvarPaginaFonte } from './actions';

export function NavJurimetria({
  ativa,
  pendentes,
}: {
  ativa: 'fontes' | 'revisao' | 'cobertura';
  pendentes: number;
}) {
  const abas = [
    { id: 'fontes', href: '/admin/jurimetria', rotulo: 'Fontes' },
    { id: 'revisao', href: '/admin/jurimetria/revisao', rotulo: 'Fila de revisão' },
    { id: 'cobertura', href: '/admin/jurimetria/cobertura', rotulo: 'Cobertura' },
  ] as const;
  return (
    <nav className="flex flex-wrap items-center gap-2">
      {abas.map((a) => (
        <Link
          key={a.id}
          href={a.href}
          aria-current={ativa === a.id ? 'page' : undefined}
          className={`rounded-full border px-3 py-1 text-sm ${
            ativa === a.id ? 'bg-foreground text-background' : 'hover:bg-muted'
          }`}
        >
          {a.rotulo}
          {a.id === 'revisao' && pendentes > 0 ? (
            <Badge className="ml-1.5" variant="destructive">
              {pendentes}
            </Badge>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}

export function AcoesFonte({
  fonteId,
  bloqueada,
  ativa,
  pedeUrl,
}: {
  fonteId: string;
  bloqueada: boolean;
  ativa: boolean;
  pedeUrl: boolean;
}) {
  const [pendente, comecar] = useTransition();
  const [url, setUrl] = useState('');

  const rodar = (fn: () => Promise<{ ok: boolean; erro?: string }>, feito: string) =>
    comecar(async () => {
      const r = await fn();
      if (r.ok) toast.success(feito);
      else toast.error(r.erro ?? 'Não deu certo.');
    });

  if (pedeUrl)
    return (
      <form
        noValidate
        className="flex items-center justify-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          rodar(() => salvarPaginaFonte(fonteId, url), 'URL cadastrada — fonte ativada.');
        }}
      >
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://… (página de orientações)"
          className="h-8 w-56"
          aria-label="URL da página de orientações"
        />
        <Button type="submit" size="sm" variant="outline" loading={pendente}>
          Ativar
        </Button>
      </form>
    );

  return (
    <span className="inline-flex gap-2">
      {bloqueada && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={pendente}
          onClick={() => rodar(() => desbloquearFonte(fonteId), 'Fonte desbloqueada.')}
        >
          Desbloquear
        </Button>
      )}
      {ativa && !bloqueada && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          loading={pendente}
          onClick={() =>
            rodar(() => coletarAgora(fonteId), 'Na fila — o worker coleta na próxima execução.')
          }
        >
          Coletar agora
        </Button>
      )}
    </span>
  );
}
