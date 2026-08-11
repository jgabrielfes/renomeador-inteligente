"use client";

import * as React from "react";
import { ArrowLeft, Cpu, Loader2, Scissors, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  analyzePdfSegments,
  extractSegments,
  PdfSplitError,
  renderPdfThumbnails,
  type PdfSegment,
} from "@/lib/pdf-split";
import { getLessonsSnapshot } from "@/lib/lessons";

interface PdfSplitDialogProps {
  file: File | null;
  onClose: () => void;
  /** Nome da pasta quando o arquivo veio do modo pasta; muda o texto do botão. */
  folderName?: string;
  onApply: (
    results: Array<{ segment: PdfSegment; blob: Blob }>
  ) => Promise<void>;
}

export function PdfSplitDialog({
  file,
  onClose,
  folderName,
  onApply,
}: PdfSplitDialogProps) {
  const [segments, setSegments] = React.useState<PdfSegment[] | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [error, setError] = React.useState("");
  const [naoAplicavel, setNaoAplicavel] = React.useState(false);
  const [progress, setProgress] = React.useState("");
  const [applying, setApplying] = React.useState(false);
  // Miniatura de cada página (índice 0 = página 1) e a página aberta em zoom.
  const [thumbs, setThumbs] = React.useState<string[]>([]);
  const [zoomPage, setZoomPage] = React.useState<number | null>(null);

  // Ajuste em fase de render: cada arquivo novo zera o resultado e já entra em
  // "analisando", para o efeito abaixo só precisar fazer o trabalho assíncrono.
  const [lastFile, setLastFile] = React.useState(file);
  if (lastFile !== file) {
    setLastFile(file);
    setSegments(null);
    setError("");
    setNaoAplicavel(false);
    setProgress("");
    setAnalyzing(file !== null);
    setThumbs([]);
    setZoomPage(null);
  }

  React.useEffect(() => {
    if (!file) return;
    // A análise faz OCR página a página e pode levar minutos; se o usuário
    // fechar o diálogo no meio, o resultado que chegar depois é descartado.
    let cancelled = false;
    void (async () => {
      try {
        // As miniaturas vêm primeiro e são baratas: o usuário já vê as páginas
        // enquanto a classificação (que pode fazer OCR) ainda roda.
        const imagens = await renderPdfThumbnails(file);
        if (cancelled) return;
        setThumbs(imagens);

        const lessons = getLessonsSnapshot();
        const found = await analyzePdfSegments(file, lessons, (p) => {
          if (cancelled) return;
          setProgress(
            p.stage === "lendo"
              ? `Lendo página ${p.page} de ${p.total}…`
              : "Identificando os documentos…"
          );
        });
        if (!cancelled) setSegments(found);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setNaoAplicavel(err instanceof PdfSplitError);
      } finally {
        if (!cancelled) {
          setAnalyzing(false);
          setProgress("");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file]);

  function pagesOf(s: PdfSegment): number[] {
    const pages = [];
    for (let p = s.startPage; p <= s.endPage; p++) pages.push(p);
    return pages;
  }

  function renameSegment(index: number, name: string) {
    setSegments((prev) =>
      prev ? prev.map((s, i) => (i === index ? { ...s, name } : s)) : prev
    );
  }

  async function apply() {
    if (!file || !segments?.length) return;
    setApplying(true);
    try {
      await onApply(await extractSegments(file, segments));
    } finally {
      setApplying(false);
    }
  }

  const total = segments?.length ?? 0;

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => {
        if (!open && !applying) onClose();
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader className="pr-10">
          <DialogTitle className="truncate">
            Separar documentos — {file?.name}
          </DialogTitle>
          <DialogDescription>
            Este PDF parece juntar vários documentos. Revise os nomes antes de
            aplicar — tudo roda no seu navegador.
          </DialogDescription>
        </DialogHeader>

        {zoomPage !== null && thumbs[zoomPage - 1] && (
          <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setZoomPage(null)}>
                <ArrowLeft className="size-4" />
                Voltar à lista
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={zoomPage <= 1}
                onClick={() => setZoomPage(zoomPage - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={zoomPage >= thumbs.length}
                onClick={() => setZoomPage(zoomPage + 1)}
              >
                Próxima
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {zoomPage} de {thumbs.length}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-muted/30 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL local */}
              <img
                src={thumbs[zoomPage - 1]}
                alt={`Página ${zoomPage}`}
                className="mx-auto max-h-full w-auto object-contain"
              />
            </div>
          </div>
        )}

        <ScrollArea
          className={`min-h-0 flex-1 ${zoomPage !== null ? "hidden" : ""}`}
        >
          {analyzing ? (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-6 animate-spin" />
              Analisando o PDF…
              {progress && <span className="text-xs">{progress}</span>}
            </div>
          ) : error ? (
            <div
              className={`flex h-40 items-center justify-center p-6 text-center text-sm ${
                naoAplicavel ? "text-muted-foreground" : "text-destructive"
              }`}
            >
              <span className="max-w-md">
                {naoAplicavel ? error : `Não foi possível analisar: ${error}`}
              </span>
            </div>
          ) : segments && segments.length <= 1 ? (
            <div className="flex h-40 items-center justify-center p-6 text-center text-sm text-muted-foreground">
              <span className="max-w-md">
                Só foi identificado um documento neste PDF — não há o que
                separar.
              </span>
            </div>
          ) : (
            segments && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-44">Páginas</TableHead>
                    <TableHead>Nome do arquivo</TableHead>
                    <TableHead className="w-40">Tipo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {segments.map((s, i) => (
                    <TableRow key={`${s.startPage}-${s.endPage}`}>
                      <TableCell className="align-top">
                        <span className="text-xs text-muted-foreground">
                          {s.startPage === s.endPage
                            ? `Página ${s.startPage}`
                            : `Páginas ${s.startPage}–${s.endPage}`}
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {pagesOf(s).map((pagina) =>
                            thumbs[pagina - 1] ? (
                              <button
                                key={pagina}
                                type="button"
                                onClick={() => setZoomPage(pagina)}
                                title={`Ver a página ${pagina} maior`}
                                className="overflow-hidden rounded border transition-colors hover:border-primary"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element -- data URL local */}
                                <img
                                  src={thumbs[pagina - 1]}
                                  alt={`Página ${pagina}`}
                                  className="h-16 w-auto object-contain"
                                />
                              </button>
                            ) : null
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={s.name}
                          onChange={(e) => renameSegment(i, e.target.value)}
                          aria-label={`Nome do documento das páginas ${s.startPage} a ${s.endPage}`}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {s.docType && (
                            <Badge variant="secondary">{s.docType}</Badge>
                          )}
                          <Badge
                            variant="outline"
                            title={
                              s.source === "ia"
                                ? "Nome sugerido pela IA (Gemini)"
                                : "Nome gerado pela análise local no navegador"
                            }
                          >
                            {s.source === "ia" ? (
                              <Sparkles className="size-3" />
                            ) : (
                              <Cpu className="size-3" />
                            )}
                            {s.source === "ia" ? "IA" : "Local"}
                          </Badge>
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          )}
        </ScrollArea>

        {total > 1 && !error && zoomPage === null && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={apply} loading={applying}>
              <Scissors className="size-4" />
              {folderName
                ? `Substituir na pasta por ${total} arquivos`
                : `Separar em ${total} arquivos`}
            </Button>
            <p className="text-sm text-muted-foreground">
              {folderName
                ? `O PDF original será apagado da pasta "${folderName}".`
                : "O PDF original sai da lista e entra no lugar dos novos arquivos."}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
