'use client';

/**
 * Autocomplete de comarca — pergunta ao servidor (a base dos 5.587
 * municípios nunca entra no bundle). Usado no hub /diligencias e no dialog
 * "Solicitar diligência" da aba Documentos do caso.
 *
 * ATENÇÃO: não monte este componente dentro de um <label> — o clique no
 * item do dropdown seria re-encaminhado pelo label ao primeiro controle
 * rotulável remanescente, desfazendo a escolha (bug real de navegador).
 */

import { useRef, useState } from 'react';

import { Input } from '@/components/ui/input';
import type { Municipio } from '@/lib/rede/municipios';
import { buscarComarcas } from './diligencias-actions';

export function ComarcaAutocomplete({
  onEscolher,
  placeholder = 'Digite a comarca…',
}: {
  onEscolher: (m: Municipio) => void;
  placeholder?: string;
}) {
  const [texto, setTexto] = useState('');
  const [opcoes, setOpcoes] = useState<Municipio[]>([]);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  return (
    <div style={{ position: 'relative' }}>
      <Input
        value={texto}
        placeholder={placeholder}
        onChange={(e) => {
          const v = e.target.value;
          setTexto(v);
          if (debounce.current) clearTimeout(debounce.current);
          debounce.current = setTimeout(() => {
            void buscarComarcas(v).then(setOpcoes);
          }, 250);
        }}
      />
      {opcoes.length > 0 && (
        <div
          style={{
            position: 'absolute',
            zIndex: 20,
            insetInlineStart: 0,
            insetInlineEnd: 0,
            background: 'var(--background, #fff)',
            border: '1px solid var(--border, #ddd)',
            borderRadius: 8,
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {opcoes.map((m) => (
            <button
              key={m.ibge}
              type="button"
              style={{ display: 'block', width: '100%', textAlign: 'left', padding: '6px 10px' }}
              onClick={() => {
                onEscolher(m);
                setTexto('');
                setOpcoes([]);
              }}
            >
              {m.nome}/{m.uf}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
