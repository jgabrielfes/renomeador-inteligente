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

type View = "original" | "otimizada";

interface DocumentPreviewProps {
  // null = fechado. O arquivo já está em memória; nada sai da máquina.
  file: File | null;
  onClose: () => void;
  // Nome sugerido editável (quando a linha permite edição).
  name?: string;
  onNameChange?: (value: string) => void;
  onNameBlur?: () => void;
  onDownload?: () => void;
  // Só imagens têm versão otimizada; sem isto o alternador não aparece.
  canEnhance?: boolean;
  // Substitui o arquivo original pela versão otimizada. Quem implementa é
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
  const [optimizedBlob, setOptimizedBlob] = React.useState<Blob | null>(null);
  const [generating, setGenerating] = React.useState(false);
  const [optimizedError, setOptimizedError] = React.useState("");
  // Recusa deliberada (ex.: PDF já digital) — não é falha, então é mostrada
  // como aviso, não como erro em vermelho.
  const [skipped, setSkipped] = React.useState(false);
  const [progress, setProgress] = React.useState("");
  const [replacing, setReplacing] = React.useState(false);

  // Cada arquivo recomeça no original e descarta a otimização do anterior.
  // Também cobre o caso de o próprio arquivo ter sido substituído: a versão
  // em cache passaria a ser a de um conteúdo que não existe mais.
  // Ajuste em fase de render (não em efeito) — é o padrão do React para
  // derivar estado de uma prop que mudou, sem o render extra do efeito.
  const [lastFile, setLastFile] = React.useState(file);
  if (lastFile !== file) {
    setLastFile(file);
    setView("original");
    setOptimizedBlob(null);
    setOptimizedError("");
    setSkipped(false);
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

  const optimizedUrl = React.useMemo(
    () => (optimizedBlob ? URL.createObjectURL(optimizedBlob) : null),
    [optimizedBlob]
  );
  React.useEffect(() => {
    return () => {
      if (optimizedUrl) URL.revokeObjectURL(optimizedUrl);
    };
  }, [optimizedUrl]);

  const isPdf = file?.name.toLowerCase().endsWith(".pdf") ?? false;
  const showToggle = canEnhance && file !== null;

  async function showOptimized() {
    setView("otimizada");
    if (optimizedBlob || !file) return;
    setGenerating(true);
    setOptimizedError("");
    setProgress("");
    try {
      if (isPdf) {
        const { enhancePdfFileToBlob } = await import("@/lib/pdf-enhance");
        setOptimizedBlob(
          await enhancePdfFileToBlob(file, ({ page, total }) =>
            setProgress(`Página ${page} de ${total}…`)
          )
        );
      } else {
        setOptimizedBlob(await enhanceImageFileToBlob(file));
      }
    } catch (err) {
      const { PdfEnhanceSkipped } = await import("@/lib/pdf-enhance");
      setOptimizedError(err instanceof Error ? err.message : String(err));
      setSkipped(err instanceof PdfEnhanceSkipped);
    } finally {
      setGenerating(false);
      setProgress("");
    }
  }

  function downloadOptimized() {
    if (!optimizedUrl || !file) return;
    const dot = file.name.lastIndexOf(".");
    const optimizedName =
      dot > 0
        ? `${file.name.slice(0, dot)} (otimizado)${file.name.slice(dot)}`
        : `${file.name} (otimizado)`;
    const a = document.createElement("a");
    a.href = optimizedUrl;
    a.download = optimizedName;
    a.click();
  }

  async function replace() {
    if (!optimizedBlob || !onReplace) return;
    setReplacing(true);
    try {
      await onReplace(optimizedBlob);
    } finally {
      setReplacing(false);
    }
  }

  const showingOptimized = view === "otimizada";
  const visibleUrl = showingOptimized ? optimizedUrl : url;

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
                variant={showingOptimized ? "ghost" : "secondary"}
                size="sm"
                onClick={() => setView("original")}
                aria-pressed={!showingOptimized}
              >
                Original
              </Button>
              <Button
                variant={showingOptimized ? "secondary" : "ghost"}
                size="sm"
                onClick={showOptimized}
                aria-pressed={showingOptimized}
              >
                <Wand2 className="size-3.5" />
                Otimizada
              </Button>
            </div>
            {showingOptimized && (
              <p className="text-sm text-muted-foreground">
                {isPdf
                  ? "Cada página é reprocessada: remove sombra e realça o texto — sem alterar o conteúdo."
                  : "Endireita a folha, remove sombra e realça o texto — sem alterar o conteúdo."}
              </p>
            )}
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-muted/30">
          {showingOptimized && generating ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              Gerando a versão otimizada…
              {progress && <span className="text-xs">{progress}</span>}
            </div>
          ) : showingOptimized && optimizedError ? (
            <div
              className={`flex h-full w-full items-center justify-center p-6 text-center text-sm ${
                skipped ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              <span className="max-w-md">
                {skipped
                  ? optimizedError
                  : `Não foi possível gerar a versão otimizada: ${optimizedError}`}
              </span>
            </div>
          ) : (
            visibleUrl &&
            (isPdf ? (
              <iframe
                src={visibleUrl}
                title={
                  showingOptimized
                    ? `Versão otimizada de ${file?.name}`
                    : `Pré-visualização de ${file?.name}`
                }
                className="h-full w-full"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center overflow-auto p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL local; next/image não se aplica */}
                <img
                  src={visibleUrl}
                  alt={
                    showingOptimized
                      ? `Versão otimizada de ${file?.name}`
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
            {showingOptimized ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={downloadOptimized}
                  disabled={!optimizedBlob || generating}
                >
                  <Download className="size-4" />
                  Baixar otimizada
                </Button>
                {onReplace && (
                  <Button
                    size="sm"
                    onClick={replace}
                    disabled={!optimizedBlob || generating || replacing}
                    title="Grava a versão otimizada por cima do arquivo original"
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
