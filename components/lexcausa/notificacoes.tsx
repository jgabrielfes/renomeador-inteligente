'use client';

/**
 * SINO do shell — a central de notificações da LexCausa: carrega os avisos
 * acionáveis dos produtos (notificacoes-actions) ao montar, mostra o badge
 * com a contagem e um painel com filtro por produto. Aviso é atalho, nunca
 * bloqueio — clicar leva à tela onde a ação acontece.
 */

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

import {
  notificacoesLexCausa,
  type NotificacaoLexCausa,
} from '@/app/(private)/notificacoes-actions';

export function SinoNotificacoes() {
  const [itens, setItens] = useState<NotificacaoLexCausa[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<string>('');
  const raiz = useRef<HTMLDivElement>(null);

  // Carga diferida (convenção): o efeito só agenda; melhor-esforço.
  useEffect(() => {
    const t = setTimeout(() => {
      void notificacoesLexCausa()
        .then(setItens)
        .catch(() => setItens([]));
    }, 0);
    return () => clearTimeout(t);
  }, []);

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const total = itens?.length ?? 0;
  const produtos = [...new Set((itens ?? []).map((i) => i.produto))];
  const visiveis = (itens ?? []).filter((i) => !filtro || i.produto === filtro);

  return (
    <div ref={raiz} style={{ position: 'relative' }}>
      <button
        type="button"
        className="lc-sino"
        aria-label={total > 0 ? `Notificações: ${total}` : 'Notificações'}
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        Avisos{total > 0 && <span className="lc-sino-badge num">{total}</span>}
      </button>
      {aberto && (
        <div className="lc-sino-painel" role="dialog" aria-label="Central de notificações">
          <div className="lc-sino-cabeca">
            <span className="lc-eyebrow" style={{ margin: 0 }}>Notificações</span>
            {produtos.length > 1 && (
              <span style={{ display: 'inline-flex', gap: 4 }}>
                <button type="button" className={filtro === '' ? 'ativa' : ''} onClick={() => setFiltro('')}>
                  Tudo
                </button>
                {produtos.map((p) => (
                  <button key={p} type="button" className={filtro === p ? 'ativa' : ''} onClick={() => setFiltro(p)}>
                    {p}
                  </button>
                ))}
              </span>
            )}
          </div>
          {itens === null && <p className="lc-fund" style={{ margin: 0 }}>Carregando…</p>}
          {itens !== null && visiveis.length === 0 && (
            <p className="lc-fund" style={{ margin: 0 }}>
              Nada aguardando você agora. Os avisos do CASO (prazos, chegadas do
              cofre) vivem no painel do próprio caso.
            </p>
          )}
          {visiveis.map((n, i) => (
            <Link key={i} href={n.href} onClick={() => setAberto(false)}>
              <span className="lc-fund">{n.produto}</span>
              {n.texto}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
