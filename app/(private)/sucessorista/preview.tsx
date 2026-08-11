/**
 * Lupa — pré-visualização local de documento (PDF ou imagem) no Dialog do
 * shadcn, vestido pela identidade do módulo. O arquivo já está em memória;
 * nada sai da máquina. Fecha com Esc ou clique fora (comportamento do Dialog).
 */

import { useEffect, useMemo } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function LupaPreview({ file, onClose }: { file: File | null; onClose: () => void }) {
  const url = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const ehPdf = file?.name.toLowerCase().endsWith('.pdf') ?? false;

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
            Pré-visualização local — nada sai da máquina. Pressione Esc para fechar.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border">
          {url &&
            (ehPdf ? (
              <iframe
                src={url}
                title={`Pré-visualização de ${file?.name}`}
                className="h-full w-full border-0"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL local; next/image não se aplica */}
                <img
                  src={url}
                  alt={`Pré-visualização de ${file?.name}`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
