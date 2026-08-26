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

import { CircleHelp, MessageSquareWarning, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { comandosPadrao } from '@/components/lexcausa/comandos';
import { FeedbackDialog } from '@/components/lexcausa/feedback';
import { MarcaLexCausa } from '@/components/lexcausa/marca';
import { SinoNotificacoes } from '@/components/lexcausa/notificacoes';
import { PaletaComandos } from '@/components/lexcausa/paleta-comandos';

export function LexTopbar({
  menu,
  ehMaster,
  radarAtivo,
  naoAdvogado = false,
  sub,
}: {
  menu?: ReactNode;
  ehMaster: boolean;
  radarAtivo: boolean;
  naoAdvogado?: boolean;
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
        {/* Os botões da barra são o Button do shadcn (convenção): a barra-noite
            já re-mapeia as variáveis de tema em `.lc-shell`, então o ghost
            veste o escuro sozinho — antes eram <button> crus com a classe do
            sino e um deles com estilo inline. */}
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          render={<Link href="/ajuda" />}
          title="Ajuda e tutoriais"
        >
          <CircleHelp />
          <span className="lc-so-largo">Ajuda</span>
        </Button>
        {/* Um botão só (pedido do escritório): o dialog traz as abas de
            bug E sugestão — dois botões abriam "a mesma coisa". */}
        <Button
          variant="ghost"
          size="sm"
          onClick={abrirFeedback}
          title="Reportar um problema ou sugerir uma melhoria"
        >
          <MessageSquareWarning />
          <span className="lc-so-largo">Reportar</span>
        </Button>
        <SinoNotificacoes />
        {/* "Buscar" diz o que faz; o ⌘K vira a dica do atalho, no lugar de ser
            o rótulo inteiro do botão. */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPaletaAberta(true)}
          aria-label="Buscar e navegar (Ctrl+K)"
          title="Buscar e navegar (Ctrl+K)"
        >
          <Search />
          <span className="lc-so-largo">Buscar</span>
          <kbd className="lc-atalho">⌘K</kbd>
        </Button>
        {menu}
      </header>
      <PaletaComandos
        comandos={comandosPadrao({ ehMaster, radarAtivo, naoAdvogado })}
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
