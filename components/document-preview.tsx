"use client";

import * as React from "react";
import { Download, Loader2, Save, Wand2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { enhanceImageFileToBlob } from "@/lib/image-enhance";

type View = "original" | "digitalizada";

interface DocumentPreviewProps {
  // null = fechado. O arquivo já está em memória; nada sai da máquina.
  file: File | null;
  onClose: () => void;
  // Nome sugerido editável (quando a linha permite edição).
  name?: string;
  onNameChange?: (value: string) => void;
  onNameBlur?: () => void;
  onDownload?: () => void;
  // Só imagens têm versão digitalizada; sem isto o alternador não aparece.
  canEnhance?: boolean;
  // Substitui o arquivo original pela versão digitalizada. Quem implementa é
  // responsável por confirmar com o usuário — a ação não tem desfazer.
  onReplace?: (blob: Blob) => Promise<void>;
}

export function DocumentPreview({
  file,
  onClose,
  name,
  onNameChange,
  onNameBlur,
  onDownload,
  canEnhance = false,
  onReplace,
}: DocumentPreviewProps) {
  const [view, setView] = React.useState<View>("original");
  const [scanBlob, setScanBlob] = React.useState<Blob | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [scanError, setScanError] = React.useState("");
  const [replacing, setReplacing] = React.useState(false);

  // Cada arquivo recomeça no original e descarta a digitalização do anterior.
  // Também cobre o caso de o próprio arquivo ter sido substituído: a versão
  // em cache passaria a ser a de um conteúdo que não existe mais.
  // Ajuste em fase de render (não em efeito) — é o padrão do React para
  // derivar estado de uma prop que mudou, sem o render extra do efeito.
  const [lastFile, setLastFile] = React.useState(file);
  if (lastFile !== file) {
    setLastFile(file);
    setView("original");
    setScanBlob(null);
    setScanError("");
  }

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

  const scanUrl = React.useMemo(
    () => (scanBlob ? URL.createObjectURL(scanBlob) : null),
    [scanBlob]
  );
  React.useEffect(() => {
    return () => {
      if (scanUrl) URL.revokeObjectURL(scanUrl);
    };
  }, [scanUrl]);

  const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;
  const showToggle = canEnhance && !isPdf && file !== null;

  async function showScan() {
    setView("digitalizada");
    if (scanBlob || !file) return;
    setGenerating(true);
    setScanError("");
    try {
      setScanBlob(await enhanceImageFileToBlob(file));
    } catch (err) {
      setScanError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function downloadScan() {
    if (!scanUrl || !file) return;
    const dot = file.name.lastIndexOf(".");
    const scanName =
      dot > 0
        ? `${file.name.slice(0, dot)} (digitalizado)${file.name.slice(dot)}`
        : `${file.name} (digitalizado)`;
    const a = document.createElement("a");
    a.href = scanUrl;
    a.download = scanName;
    a.click();
  }

  async function replace() {
    if (!scanBlob || !onReplace) return;
    setReplacing(true);
    try {
      await onReplace(scanBlob);
    } finally {
      setReplacing(false);
    }
  }

  const showingScan = view === "digitalizada";
  const visibleUrl = showingScan ? scanUrl : url;

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

        {showToggle && (
          <div className="flex items-center gap-2">
            <div className="inline-flex gap-1 rounded-lg border p-1">
              <Button
                variant={showingScan ? "ghost" : "secondary"}
                size="sm"
                onClick={() => setView("original")}
                aria-pressed={!showingScan}
              >
                Original
              </Button>
              <Button
                variant={showingScan ? "secondary" : "ghost"}
                size="sm"
                onClick={showScan}
                aria-pressed={showingScan}
              >
                <Wand2 className="size-3.5" />
                Digitalizada
              </Button>
            </div>
            {showingScan && (
              <p className="text-sm text-muted-foreground">
                Endireita a folha, remove sombra e realça o texto — sem alterar
                o conteúdo.
              </p>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
          {showingScan && generating ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              Gerando a versão digitalizada…
            </div>
          ) : showingScan && scanError ? (
            <div className="flex h-full w-full items-center justify-center p-6 text-center text-sm text-destructive">
              Não foi possível gerar a versão digitalizada: {scanError}
            </div>
          ) : (
            visibleUrl &&
            (isPdf && !showingScan ? (
              <iframe
                src={visibleUrl}
                title={`Pré-visualização de ${file?.name}`}
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL local; next/image não se aplica */}
                <img
                  src={visibleUrl}
                  alt={
                    showingScan
                      ? `Versão digitalizada de ${file?.name}`
                      : `Pré-visualização de ${file?.name}`
                  }
                  className="max-h-full max-w-full object-contain"
                />
              </div>
            ))
          )}
        </div>

        {(name !== undefined || onDownload || showToggle) && (
          <div className="flex flex-wrap items-center gap-2">
            {name !== undefined && (
              <Input
                value={name}
                onChange={(e) => onNameChange?.(e.target.value)}
                onBlur={onNameBlur}
                aria-label="Nome sugerido"
                className="h-8 min-w-50 flex-1"
              />
            )}
            {showingScan ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadScan}
                  disabled={!scanBlob || generating}
                >
                  <Download className="size-4" />
                  Baixar digitalizada
                </Button>
                {onReplace && (
                  <Button
                    size="sm"
                    onClick={replace}
                    disabled={!scanBlob || generating || replacing}
                    title="Grava a versão digitalizada por cima do arquivo original"
                  >
                    {replacing ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Substituir original
                  </Button>
                )}
              </>
            ) : (
              onDownload && (
                <Button variant="outline" size="sm" onClick={onDownload}>
                  <Download className="size-4" />
                  Baixar
                </Button>
              )
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
