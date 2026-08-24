'use client';

/**
 * "NOVOS NEGÓCIOS" — a entrada dos clientes prospectados, no TOPO do painel
 * Meus casos (pedido do escritório: fora do caso já criado). O advogado cola
 * o CÓDIGO que a família gerou (questionário público ou contratação do
 * Radar) e o CASO NASCE SOZINHO no store ativo — quem importa de verdade é o
 * handler do client (o mesmo `importarDoRadar` do fluxo /s?importar=).
 */

import { useState } from 'react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';

export function NovosNegocios({
  onImportar,
  radarHref,
}: {
  /** Importa pelo código e CRIA o caso no store ativo (abre a folha). */
  onImportar: (codigo: string) => Promise<void>;
  /** Rota do Radar quando ligado — o caminho de onde os códigos vêm. */
  radarHref?: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [importando, setImportando] = useState(false);

  const importar = async () => {
    setImportando(true);
    try {
      await onImportar(codigo.trim().toUpperCase());
      setAberto(false);
      setCodigo('');
    } finally {
      setImportando(false);
    }
  };

  return (
    <div className="seletor-pasta" role="region" aria-label="Novos negócios">
      <span>
        🧭 <strong>Novos negócios</strong> — cliente prospectado (Radar ou
        questionário das famílias)? Cole o código e o inventário nasce pronto
        para conferir.
      </span>
      <span style={{ display: 'inline-flex', gap: 8, flexWrap: 'wrap' }}>
        {radarHref && (
          <Button size="sm" variant="outline" render={<Link href={radarHref} />} nativeButton={false}>
            Ver leads no Radar
          </Button>
        )}
        <Button size="sm" onClick={() => setAberto(true)}>
          Importar com código
        </Button>
      </span>
      <Dialog open={aberto} onOpenChange={(o) => !importando && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novos negócios — importar caso prospectado</DialogTitle>
            <DialogDescription>
              A família gera um código na área pública (ou na contratação pelo Radar) e
              entrega a você. A importação CRIA o caso com o que ela informou — datas,
              vínculo, herdeiros e bens por faixa — e abre a folha para conferência. Depois
              da importação, os dados saem do servidor.
            </DialogDescription>
          </DialogHeader>
          <label className="campo">
            Código recebido da família
            <Input
              value={codigo}
              placeholder="Ex.: K7MPQ2WX"
              autoFocus
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" disabled={importando} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button loading={importando} disabled={codigo.trim() === ''} onClick={() => void importar()}>
              Importar e criar o caso
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
