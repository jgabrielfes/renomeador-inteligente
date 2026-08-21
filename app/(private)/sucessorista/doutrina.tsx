'use client';

/**
 * Doutrina COLAPSADA (V5 da auditoria visual): cada etapa abre com UMA linha
 * de resumo e um <details> "Por quê?" com a explicação jurídica completa —
 * o conteúdo é bom, mas o advogado só precisa dele na primeira vez. O estado
 * aberto/fechado é lembrado POR ETAPA no navegador.
 */

import { useEffect, useState, type ReactNode } from 'react';

const CHAVE = (id: string) => `sucessorista-doutrina-${id}`;

export function Doutrina({
  id,
  resumo,
  children,
}: {
  /** Identificador estável da etapa (ex.: "familia", "acervo"). */
  id: string;
  /** A linha sempre visível. */
  resumo: string;
  /** A explicação completa, dentro do "Por quê?". */
  children: ReactNode;
}) {
  // Nasce fechada e restaura a preferência num efeito — não quebra a
  // hidratação (mesma convenção das demais preferências do módulo).
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    // Diferido: restaurar depois da pintura não briga com a hidratação.
    const t = setTimeout(() => {
      try {
        if (localStorage.getItem(CHAVE(id)) === '1') setAberto(true);
      } catch {
        // modo restrito
      }
    }, 0);
    return () => clearTimeout(t);
  }, [id]);

  return (
    <div className="doutrina">
      <p className="subtitulo">{resumo}</p>
      <details
        className="doutrina-detalhe"
        open={aberto}
        onToggle={(e) => {
          const v = e.currentTarget.open;
          setAberto(v);
          try {
            localStorage.setItem(CHAVE(id), v ? '1' : '0');
          } catch {
            // modo restrito
          }
        }}
      >
        <summary>Por quê?</summary>
        <div className="doutrina-texto">{children}</div>
      </details>
    </div>
  );
}
