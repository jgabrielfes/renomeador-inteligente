'use client';

/**
 * Parte CLIENT das configurações — só o que vive no navegador: a
 * preferência "abrir direto" do hub (localStorage). O resto da página é
 * server (config/page.tsx).
 */

import { useEffect, useState } from 'react';

const PREF_KEY = 'lexcausa-produto-padrao';

export function PreferenciaProduto() {
  const [pref, setPref] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      try {
        setPref(localStorage.getItem(PREF_KEY) ?? '');
      } catch {
        /* modo restrito */
      }
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const marcar = (valor: string) => {
    setPref(valor);
    try {
      if (valor) localStorage.setItem(PREF_KEY, valor);
      else localStorage.removeItem(PREF_KEY);
    } catch {
      /* sem armazenamento */
    }
  };

  return (
    <div role="radiogroup" aria-label="Produto de entrada" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
      {[
        ['', 'Sempre mostrar o hub'],
        ['sucessorista', 'Abrir direto a ferramenta'],
      ].map(([valor, rotulo]) => (
        <label key={valor} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <input
            type="radio"
            name="produto-padrao"
            checked={pref === valor}
            onChange={() => marcar(valor)}
          />
          {rotulo}
        </label>
      ))}
    </div>
  );
}
