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
import type { ReactNode } from 'react';

import '@/app/lexcausa.css';

import { comandosPadrao } from '@/components/lexcausa/comandos';
import { FeedbackDialog } from '@/components/lexcausa/feedback';
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
  const [feedbackAberto, setFeedbackAberto] = useState(false);
  // Cada abertura REMONTA o dialog (key) — volta sempre à aba inicial.
  const [aberturaFeedback, setAberturaFeedback] = useState(0);

  const abrirFeedback = () => {
    setAberturaFeedback((n) => n + 1);
    setFeedbackAberto(true);
  };

  // As guias de produto saíram da barra (pedido do escritório): a troca de
  // tela é pelo hub (clique na marca), pelos cards e pela paleta ⌘K.
  return (
    <div className="lexcausa lc-shell">
      <header className="lc-topo">
        <MarcaLexCausa href="/?hub=1" sub={sub} />
        <span style={{ marginRight: 'auto' }} />
        <Link className="lc-sino" href="/ajuda" title="Ajuda e tutoriais">
          Ajuda
        </Link>
        {/* Um botão só (pedido do escritório): o dialog traz as abas de
            bug E sugestão — dois botões abriam "a mesma coisa". */}
        <button
          type="button"
          className="lc-sino"
          title="Reportar um problema ou sugerir uma melhoria"
          onClick={abrirFeedback}
        >
          Reportar
        </button>
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
      <FeedbackDialog
        key={aberturaFeedback}
        aberto={feedbackAberto}
        abaInicial="bug"
        onFechar={() => setFeedbackAberto(false)}
      />
    </div>
  );
}
