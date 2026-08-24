'use client';

/**
 * Shell da LexCausa — a barra-noite persistente no topo das telas de
 * produto: lockup da marca (clique volta ao hub), switcher entre produtos,
 * paleta de comandos (⌘K) e a faixa de sessão. As telas imersivas do
 * Sucessorista (folha do caso, com a lombada própria) não a montam — lá o
 * shell é a própria lombada, e a paleta entra sozinha.
 */

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import '@/app/lexcausa.css';

import { comandosPadrao } from '@/components/lexcausa/comandos';
import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { SinoNotificacoes } from '@/components/lexcausa/notificacoes';
import { PaletaComandos } from '@/components/lexcausa/paleta-comandos';

export function LexTopbar({
  menu,
  ehMaster,
  radarAtivo,
  escrevente = false,
  sub,
}: {
  menu?: ReactNode;
  ehMaster: boolean;
  radarAtivo: boolean;
  escrevente?: boolean;
  /** Submarca do produto ativo ("Radar Sucessório · by LexCausa"). */
  sub?: string;
}) {
  const pathname = usePathname();
  const [paletaAberta, setPaletaAberta] = useState(false);

  const guias: { rotulo: string; href: string; ativa: boolean }[] = [
    { rotulo: 'O Sucessorista', href: '/s', ativa: pathname.startsWith('/s') || pathname.startsWith('/caso') },
  ];
  if (!escrevente || ehMaster) {
    if (radarAtivo) guias.push({ rotulo: 'Radar Sucessório', href: '/radar', ativa: pathname.startsWith('/radar') });
    guias.push({ rotulo: 'Diligências', href: '/diligencias', ativa: pathname.startsWith('/diligencias') });
  }

  return (
    <div className="lexcausa lc-shell">
      <header className="lc-topo">
        <MarcaLexCausa href="/?hub=1" sub={sub} />
        <nav aria-label="Produtos LexCausa" style={{ marginLeft: 12, marginRight: 'auto', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {guias.map((g) => (
            <Link key={g.href} className={`lc-guia${g.ativa ? ' ativa' : ''}`} href={g.href}>
              {g.rotulo}
            </Link>
          ))}
        </nav>
        <SinoNotificacoes />
        <button
          type="button"
          onClick={() => setPaletaAberta(true)}
          aria-label="Abrir a paleta de comandos"
          title="Buscar e navegar (Ctrl+K)"
          style={{
            background: 'transparent',
            color: 'var(--muted-foreground)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '4px 10px',
            fontSize: 'var(--t-xs)',
          }}
        >
          ⌘K
        </button>
        {menu}
      </header>
      <PaletaComandos
        comandos={comandosPadrao({ ehMaster, radarAtivo, escrevente })}
        aberta={paletaAberta}
        onFechar={() => setPaletaAberta(false)}
      />
    </div>
  );
}
