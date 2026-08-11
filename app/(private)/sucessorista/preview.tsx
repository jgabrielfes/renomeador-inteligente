/**
 * Lupa — pré-visualização local de documento (PDF ou imagem) na identidade
 * do módulo. O arquivo já está em memória; nada sai da máquina. Fecha com
 * Esc ou clique fora.
 */

import { useEffect, useMemo } from 'react';

export function LupaPreview({ file, onClose }: { file: File | null; onClose: () => void }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  useEffect(() => {
    if (!file) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [file, onClose]);

  if (!file || !url) return null;
  const ehPdf = file.name.toLowerCase().endsWith('.pdf');

  return (
    <div
      className="visor"
      role="dialog"
      aria-modal="true"
      aria-label={`Pré-visualização de ${file.name}`}
      onClick={onClose}
    >
      <div className="visor-caixa" onClick={(e) => e.stopPropagation()}>
        <div className="visor-topo">
          <strong>{file.name}</strong>
          <button type="button" onClick={onClose}>
            fechar ✕
          </button>
        </div>
        {ehPdf ? (
          <iframe src={url} title={`Pré-visualização de ${file.name}`} />
        ) : (
          <div className="visor-img">
            {/* eslint-disable-next-line @next/next/no-img-element -- blob URL local; next/image não se aplica */}
            <img src={url} alt={`Pré-visualização de ${file.name}`} />
          </div>
        )}
      </div>
    </div>
  );
}
