/**
 * Lupa — pré-visualização local de documento (PDF ou imagem) no Dialog do
 * shadcn, vestido pela identidade do módulo. O arquivo já está em memória;
 * nada sai da máquina. Fecha com Esc ou clique fora (comportamento do Dialog).
 *
 * ZOOM (pedido do escritório): em IMAGEM, a rolagem do mouse aproxima e
 * afasta (0,5×–6×; duplo clique alterna 1×↔2×; botões −/+/ajustar no topo).
 * Em PDF o visualizador nativo do navegador já tem zoom próprio (botões e
 * Ctrl + rolagem) — a dica aparece no subtítulo.
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 6;
const PASSO = 1.15;

export function LupaPreview({ file, onClose }: { file: File | null; onClose: () => void }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const ehPdf = file?.name.toLowerCase().endsWith('.pdf') ?? false;

  const [zoom, setZoom] = useState(1);
  // Troca de arquivo zera o zoom — ajuste DURANTE o render (padrão do React
  // para estado derivado de prop), não em efeito.
  const [ultimoArquivo, setUltimoArquivo] = useState<File | null>(null);
  if (file !== ultimoArquivo) {
    setUltimoArquivo(file);
    setZoom(1);
  }
  const areaRef = useRef<HTMLDivElement>(null);

  // Rolagem = zoom. O listener é manual porque o onWheel do React é passivo
  // (preventDefault não funcionaria e a página rolaria junto).
  useEffect(() => {
    const el = areaRef.current;
    if (!el || ehPdf) return;
    const aoRolar = (e: WheelEvent) => {
      e.preventDefault();
      setZoom((z) =>
        Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z * (e.deltaY < 0 ? PASSO : 1 / PASSO))),
      );
    };
    el.addEventListener('wheel', aoRolar, { passive: false });
    return () => el.removeEventListener('wheel', aoRolar);
  }, [ehPdf, url]);

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(aberto) => {
        if (!aberto) onClose();
      }}
    >
      <DialogContent className="sucessorista flex h-[85vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="truncate">{file?.name}</DialogTitle>
          <DialogDescription>
            {ehPdf
              ? 'Pré-visualização local — o visualizador de PDF tem zoom próprio (botões ou Ctrl + rolagem). Esc fecha.'
              : 'Pré-visualização local — role o mouse para dar ZOOM; duplo clique alterna 1×/2×. Esc fecha.'}
          </DialogDescription>
        </DialogHeader>
        {!ehPdf && url && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z / PASSO))}
            >
              −
            </Button>
            <span className="num" style={{ fontSize: 'var(--t-sm)', minWidth: 48, textAlign: 'center' }}>
              {Math.round(zoom * 100)}%
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z * PASSO))}
            >
              +
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setZoom(1)}>
              ajustar
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          {url &&
            (ehPdf ? (
              <iframe
                src={url}
                title={`Pré-visualização de ${file?.name}`}
                className="h-full w-full border-0"
              />
            ) : (
              <div
                ref={areaRef}
                className="h-full w-full overflow-auto"
                onDoubleClick={() => setZoom((z) => (z === 1 ? 2 : 1))}
              >
                {zoom === 1 ? (
                  <div className="flex h-full w-full items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- blob URL local; next/image não se aplica */}
                    <img
                      src={url}
                      alt={`Pré-visualização de ${file?.name}`}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element -- blob URL local; next/image não se aplica
                  <img
                    src={url}
                    alt={`Pré-visualização de ${file?.name}`}
                    style={{ width: `${zoom * 100}%`, maxWidth: 'none', display: 'block' }}
                  />
                )}
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
