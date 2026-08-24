'use client';

/**
 * Shell da LexCausa — a barra-noite persistente no topo das telas de
 * produto: lockup da marca (clique volta ao hub), switcher entre produtos,
 * paleta de comandos (⌘K) e a faixa de sessão. As telas imersivas do
 * Sucessorista (folha do caso, com a lombada própria) não a montam — lá o
 * shell é a própria lombada, e a paleta entra sozinha.
 */

import { useState } from 'react';
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
  const [paletaAberta, setPaletaAberta] = useState(false);

  // As guias de produto saíram da barra (pedido do escritório): a troca de
  // tela é pelo hub (clique na marca), pelos cards e pela paleta ⌘K.
  return (
    <div className="lexcausa lc-shell">
      <header className="lc-topo">
        <MarcaLexCausa href="/?hub=1" sub={sub} />
        <span style={{ marginRight: 'auto' }} />
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
