'use client';

/**
 * AVATAR da barra LexCausa — o ícone redondo com a foto do perfil (ou as
 * iniciais) que abre o menu do usuário: perfil e preferências (/config),
 * administração (master) e sair. Mesmo padrão de painel do sino (clique
 * fora fecha), para não depender de dropdown que o registry não tem.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import { LogoutButton } from '@/components/logout-button';

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
  const [aberto, setAberto] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (raiz.current?.contains(alvo)) return;
      // Clique dentro de um DIALOG aberto A PARTIR do menu (o confirmar do
      // Sair): o portal fica fora desta árvore — fechar o menu aqui
      // desmontaria o dialog no mousedown e o clique nunca completaria
      // (era o bug do "Sair que não sai").
      if (alvo instanceof Element && alvo.closest('[data-slot^="dialog"], [role="dialog"]')) return;
      setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  return (
    <div ref={raiz} style={{ position: 'relative' }}>
      <button
        type="button"
        className="lc-avatar"
        aria-label={`Conta de ${nome ?? 'usuário'} — abrir o menu`}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL do banco, sem otimização a fazer
          <img src={foto} alt="" width={28} height={28} />
        ) : (
          <span aria-hidden>{iniciais(nome)}</span>
        )}
      </button>
      {aberto && (
        <div className="lc-sino-painel" role="dialog" aria-label="Menu do usuário">
          <div style={{ display: 'grid', gap: 2 }}>
            <strong>{nome ?? 'Sua conta'}</strong>
            {email && <span className="lc-fund">{email}</span>}
          </div>
          <Link href="/config" onClick={() => setAberto(false)}>
            Perfil e preferências
          </Link>
          {ehMaster && (
            <Link href="/admin" onClick={() => setAberto(false)}>
              Administração
            </Link>
          )}
          <div>
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
