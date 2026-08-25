'use client';

/**
 * Escolha de COMARCA — estado primeiro, município depois.
 *
 * Era um autocomplete por digitação sobre os 5.587 municípios do país: quem
 * não lembrava a grafia exata não achava, e "São" trazia dezenas de lugares de
 * estados diferentes. Virou o mesmo par UF → lista que a plataforma inteira
 * usa nos campos de município: escolhida a UF, desce a lista daquele estado.
 *
 * A base continua NO SERVIDOR — o cliente pede a lista de um estado por vez
 * (`listarMunicipiosDaUf`) e nunca carrega o país no bundle. O contrato de
 * quem chama não mudou: `onEscolher` recebe o `Municipio` completo, com o
 * código do IBGE, que é o que a diligência grava.
 *
 * ATENÇÃO: não monte este componente dentro de um <label> — ele traz os
 * próprios rótulos, e label dentro de label é HTML inválido (o clique do
 * controle de dentro seria roubado pelo de fora).
 */

import { useEffect, useState } from 'react';

import { listarMunicipiosDaUf } from '@/lib/rede/municipios-actions';
import type { Municipio } from '@/lib/rede/municipios';

const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

export function ComarcaAutocomplete({ onEscolher }: { onEscolher: (m: Municipio) => void }) {
  const [uf, setUf] = useState('');
  // Mesmo desenho do seletor geral: o cache carrega a UF a que pertence, e
  // "carregando" é derivado — nada de setState síncrono dentro do efeito.
  const [cache, setCache] = useState<{ uf: string; itens: Municipio[] } | null>(null);
  const daUfAtual = cache?.uf === uf;
  const lista = daUfAtual ? (cache?.itens ?? []) : [];
  const carregando = uf.length === 2 && !daUfAtual;

  useEffect(() => {
    if (uf.length !== 2) return;
    let vivo = true;
    void listarMunicipiosDaUf(uf)
      .then((m) => {
        if (vivo) setCache({ uf, itens: m });
      })
      .catch(() => {
        if (vivo) setCache({ uf, itens: [] });
      });
    return () => {
      vivo = false;
    };
  }, [uf]);

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <label className="campo" style={{ maxWidth: 120 }}>
        Estado (UF)
        <select value={uf} onChange={(e) => setUf(e.target.value)}>
          <option value="">UF…</option>
          {UFS.map((u) => (
            <option key={u} value={u}>
              {u}
            </option>
          ))}
        </select>
      </label>
      <label className="campo" style={{ flex: '1 1 220px' }}>
        Comarca (município)
        <select
          value=""
          disabled={uf.length !== 2}
          onChange={(e) => {
            const escolhido = lista.find((m) => String(m.ibge) === e.target.value);
            if (escolhido) onEscolher(escolhido);
          }}
        >
          <option value="">
            {uf.length !== 2 ? 'Escolha o estado primeiro' : carregando ? 'Carregando…' : 'Selecione…'}
          </option>
          {lista.map((m) => (
            <option key={m.ibge} value={m.ibge}>
              {m.nome}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
