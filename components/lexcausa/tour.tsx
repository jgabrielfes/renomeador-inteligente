'use client';

/**
 * TOUR de primeiro acesso (LexCausa) — 3 a 5 passos, sempre dispensável.
 * Aparece UMA vez por produto/perfil (localStorage `lexcausa-tour-<id>`);
 * "Pular" e "Concluir" gravam o visto. Nunca bloqueia: é um Dialog comum,
 * fechável por Esc, sobre a tela já funcional.
 */

import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export interface PassoTour {
  titulo: string;
  texto: string;
}

export function TourLexCausa({ id, passos }: { id: string; passos: PassoTour[] }) {
  const [aberto, setAberto] = useState(false);
  const [indice, setIndice] = useState(0);
  const chave = `lexcausa-tour-${id}`;

  // Diferido (convenção de hidratação): só abre se nunca foi visto.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        if (!localStorage.getItem(chave)) setAberto(true);
      } catch {
        /* modo restrito: sem tour, sem quebra */
      }
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fechar = () => {
    try {
      localStorage.setItem(chave, '1');
    } catch {
      /* sem armazenamento, o tour volta na próxima — aceitável */
    }
    setAberto(false);
  };

  const passo = passos[indice];
  if (!passo) return null;
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && fechar()}>
      <DialogContent className="lexcausa" style={{ background: 'var(--lc-alto)' }}>
        <DialogHeader>
          <DialogTitle>{passo.titulo}</DialogTitle>
          <DialogDescription>
            Passo {indice + 1} de {passos.length} — dá para pular e voltar pela
            ajuda (⌘K → &ldquo;Como funciona&rdquo;).
          </DialogDescription>
        </DialogHeader>
        <p style={{ margin: 0 }}>{passo.texto}</p>
        <DialogFooter>
          <Button variant="outline" onClick={fechar}>
            Pular
          </Button>
          {indice > 0 && (
            <Button variant="outline" onClick={() => setIndice((i) => i - 1)}>
              Voltar
            </Button>
          )}
          {indice < passos.length - 1 ? (
            <Button onClick={() => setIndice((i) => i + 1)}>Avançar</Button>
          ) : (
            <Button onClick={fechar}>Concluir</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
