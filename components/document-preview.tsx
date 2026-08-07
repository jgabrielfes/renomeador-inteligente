"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface DocumentPreviewProps {
  // null = fechado. O arquivo já está em memória; nada sai da máquina.
  file: File | null;
  onClose: () => void;
  // Nome sugerido editável (quando a linha permite edição).
  name?: string;
  onNameChange?: (value: string) => void;
  onNameBlur?: () => void;
  onDownload?: () => void;
}

export function DocumentPreview({
  file,
  onClose,
  name,
  onNameChange,
  onNameBlur,
  onDownload,
}: DocumentPreviewProps) {
  // Blob URL do arquivo local; revogado quando o preview troca/fecha.
  const url = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );
  React.useEffect(() => {
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [url]);

  const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[85vh] flex-col gap-3 sm:max-w-4xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="truncate">{file?.name}</DialogTitle>
          <DialogDescription>
            Pré-visualização local — pressione Esc para fechar.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
          {url &&
            (isPdf ? (
              <iframe
                src={url}
                title={`Pré-visualização de ${file?.name}`}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL local; next/image não se aplica */}
                <img
                  src={url}
                  alt={`Pré-visualização de ${file?.name}`}
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ))}
        </div>
        {(name !== undefined || onDownload) && (
          <div className="flex items-center gap-2">
            {name !== undefined && (
              <Input
                value={name}
                onChange={(e) => onNameChange?.(e.target.value)}
                onBlur={onNameBlur}
                aria-label="Nome sugerido"
                className="h-8 flex-1"
              />
            )}
            {onDownload && (
              <Button variant="outline" size="sm" onClick={onDownload}>
                <Download className="size-4" />
                Baixar
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
