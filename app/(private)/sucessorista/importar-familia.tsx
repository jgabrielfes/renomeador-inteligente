'use client';

/**
 * "Importar caso de família" — o advogado digita o CÓDIGO que a família
 * gerou na área pública e o caso nasce AQUI, no navegador (intakeParaCaso →
 * aplicarSnapshot), com as seções 0/I/II pré-preenchidas por faixa. Depois
 * da montagem, a importação é confirmada e o servidor PODA o intake.
 */

import { useState } from 'react';
import { toast } from 'sonner';

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
import { intakeParaCaso } from '@/lib/familias/intake-para-caso';

import { confirmarImportacaoIntake, resgatarIntake } from './familias-actions';

export function ImportarCasoFamilia({
  onCaso,
}: {
  /** Recebe o snapshot v1 pronto (CasoSalvo) — o client aplica na folha. */
  onCaso: (caso: unknown) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [importando, setImportando] = useState(false);

  const importar = async () => {
    setImportando(true);
    try {
      const r = await resgatarIntake(codigo);
      if (!r.ok || !r.respostas) {
        toast.error('Não foi possível importar', { description: r.erro });
        return;
      }
      const caso = intakeParaCaso(r.respostas, {
        casoId: `caso-${crypto.randomUUID().slice(0, 8)}-${Date.now().toString(36)}`,
        gerarId: (p) => `${p}-${crypto.randomUUID().slice(0, 8)}`,
      });
      onCaso(caso);
      await confirmarImportacaoIntake(codigo);
      setAberto(false);
      setCodigo('');
      toast.success('Caso da família importado — confira a folha', {
        description:
          (r.nome || r.email
            ? `Contato de quem respondeu: ${[r.nome, r.email].filter(Boolean).join(' · ')}. `
            : '') +
          'Valores por faixa e fichas em branco: complete com os documentos. Os dados saíram do servidor.',
      });
    } finally {
      setImportando(false);
    }
  };

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        Importar caso de família
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !importando && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Importar caso de família</DialogTitle>
            <DialogDescription>
              A família que respondeu ao questionário público gera um código e entrega a
              você. A importação monta a folha com o que ela informou — datas, vínculo,
              número de herdeiros e bens por faixa — e as anotações de alerta. O caso
              nasce nesta máquina; depois da importação, os dados saem do servidor.
            </DialogDescription>
          </DialogHeader>
          <label className="campo">
            Código recebido da família
            <Input
              value={codigo}
              placeholder="Ex.: K7MPQ2WX"
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
            />
          </label>
          <DialogFooter>
            <Button variant="outline" disabled={importando} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button loading={importando} disabled={codigo.trim() === ''} onClick={() => void importar()}>
              Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
