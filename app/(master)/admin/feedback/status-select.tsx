'use client';

/**
 * Select de SITUAÇÃO de um relato de feedback (/admin/feedback) — troca via
 * server action (que revalida a listagem). Padrão visual do Select do
 * shadcn, como o "itens por página".
 */

import { useState } from 'react';
import { toast } from 'sonner';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { alterarStatusFeedback } from './actions';

const OPCOES = [
  { valor: 'aberto', rotulo: 'Aberto' },
  { valor: 'em_analise', rotulo: 'Em análise' },
  { valor: 'resolvido', rotulo: 'Resolvido' },
] as const;

export function StatusFeedback({ id, inicial }: { id: string; inicial: string }) {
  const [valor, setValor] = useState(inicial);
  const [salvando, setSalvando] = useState(false);
  return (
    <Select
      value={valor}
      onValueChange={(novo) => {
        if (!novo) return;
        const anterior = valor;
        setValor(novo);
        setSalvando(true);
        void alterarStatusFeedback({ id, status: novo as 'aberto' | 'em_analise' | 'resolvido' })
          .then((r) => {
            if (!r.ok) {
              setValor(anterior);
              toast.error(r.erro ?? 'Não foi possível salvar.');
            }
          })
          .finally(() => setSalvando(false));
      }}
    >
      <SelectTrigger size="sm" aria-label="Situação do relato" disabled={salvando}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPCOES.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
