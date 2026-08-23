'use client';

/**
 * Paleta de comandos da LexCausa (⌘K / Ctrl+K) — busca e atalhos de
 * navegação em toda a aplicação.
 *
 * COMPOSTA dos componentes de components/ui (Dialog + Input), conforme a
 * convenção de componentes próprios: o registry do shadcn não é alcançável
 * deste ambiente (proxy) e copiar o `command` de memória é proibido — a
 * versão base-nova é Base UI, com API diferente da Radix. A mecânica é a
 * mesma: busca sem acento, setas + Enter, clique.
 */

import { useEffect, useMemo, useState } from 'react';

import { useProgressRouter } from '@/components/navigation-progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

import type { ComandoLexCausa } from './comandos';

const semAcento = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function PaletaComandos({
  comandos,
  aberta,
  onFechar,
}: {
  comandos: ComandoLexCausa[];
  /** Controle externo (botão da topbar). O ⌘K interno soma-se a ele. */
  aberta?: boolean;
  onFechar?: () => void;
}) {
  const router = useProgressRouter();
  const [abertaTeclado, setAbertaTeclado] = useState(false);
  const [termo, setTermo] = useState('');
  const [indice, setIndice] = useState(0);

  const visivel = (aberta ?? false) || abertaTeclado;

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setAbertaTeclado((v) => !v);
      }
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, []);

  const filtrados = useMemo(() => {
    const q = semAcento(termo.trim());
    if (!q) return comandos;
    return comandos.filter((c) => semAcento(`${c.rotulo} ${c.dica ?? ''}`).includes(q));
  }, [comandos, termo]);

  const fechar = () => {
    setAbertaTeclado(false);
    onFechar?.();
    setTermo('');
    setIndice(0);
  };

  const executar = (c: ComandoLexCausa | undefined) => {
    if (!c) return;
    fechar();
    router.push(c.href);
  };

  return (
    <Dialog open={visivel} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="lexcausa" style={{ background: 'var(--lc-alto)' }}>
        <DialogHeader>
          <DialogTitle>Para onde vamos?</DialogTitle>
          <DialogDescription>
            Digite para filtrar; Enter abre o primeiro resultado.
          </DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          placeholder="Buscar tela ou ação…"
          value={termo}
          onChange={(e) => {
            setTermo(e.target.value);
            setIndice(0);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setIndice((i) => Math.min(i + 1, filtrados.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setIndice((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              executar(filtrados[indice] ?? filtrados[0]);
            }
          }}
        />
        <div className="lc-paleta-lista" role="listbox" aria-label="Comandos">
          {filtrados.length === 0 && (
            <p className="lc-fund" style={{ margin: 0, padding: 'var(--e-2) var(--e-3)' }}>
              Nada com esse nome — tente “casos”, “radar”, “famílias”…
            </p>
          )}
          {filtrados.map((c, i) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={i === indice}
              className={i === indice ? 'selecionado' : undefined}
              onMouseEnter={() => setIndice(i)}
              onClick={() => executar(c)}
            >
              {c.rotulo}
              {c.dica && <span className="lc-fund">{c.dica}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
