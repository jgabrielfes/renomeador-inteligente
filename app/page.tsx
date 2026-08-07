"use client";

import * as React from "react";
import JSZip from "jszip";
import {
  Check,
  Download,
  FileText,
  FolderOpen,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupCard } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  aiProposeFromFile,
  aiProposeFromText,
  fileEligibleForAi,
  getAiSettingsServerSnapshot,
  getAiSettingsSnapshot,
  saveAiSettings,
  subscribeAiSettings,
  type AiMode,
} from "@/lib/ai";
import {
  existingNames,
  folderPickerAvailable,
  listFolderFiles,
  pickFolder,
  renameInFolder,
} from "@/lib/fs";
import { isSupported, readDocument } from "@/lib/ocr";
import { ensureExtension, proposeName, uniqueName } from "@/lib/renamer";

type RowStatus = "aguardando" | "processando" | "ok" | "erro" | "renomeado";

interface Row {
  id: string;
  file: File;
  handle?: FileSystemFileHandle;
  proposed: string;
  docType: string;
  status: RowStatus;
  use: boolean;
  error?: string;
}

const subscribeNoop = () => () => {};

const AI_MODES: Array<{ value: AiMode; title: string; description: string }> = [
  {
    value: "arquivo",
    title: "IA — arquivo inteiro",
    description: "O documento é enviado ao Gemini, que o lê diretamente. Mais preciso.",
  },
  {
    value: "texto",
    title: "IA — somente texto",
    description: "O OCR roda no navegador e apenas o texto extraído é enviado.",
  },
  {
    value: "local",
    title: "Somente local",
    description: "Nada sai do navegador: OCR e regras de nomeação locais.",
  },
];

export default function Home() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [dirHandle, setDirHandle] =
    React.useState<FileSystemDirectoryHandle | null>(null);
  const [onlyWhatsapp, setOnlyWhatsapp] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [zipping, setZipping] = React.useState(false);
  const [applying, setApplying] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const queueRef = React.useRef<Row[]>([]);
  const processingRef = React.useRef(false);

  const folderSupported = React.useSyncExternalStore(
    subscribeNoop,
    folderPickerAvailable,
    () => false
  );

  const aiSettings = React.useSyncExternalStore(
    subscribeAiSettings,
    getAiSettingsSnapshot,
    getAiSettingsServerSnapshot
  );

  const patchRow = React.useCallback((id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  const runQueue = React.useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      for (;;) {
        const next = queueRef.current.shift();
        if (!next) break;
        patchRow(next.id, { status: "processando" });
        try {
          // IA primeiro (conforme configuração); heurística local é o fallback.
          const { mode } = getAiSettingsSnapshot();
          let proposal: { name: string; docType: string } | null = null;
          let text: string | null = null;

          if (mode !== "local") {
            try {
              if (mode === "arquivo" && fileEligibleForAi(next.file)) {
                proposal = await aiProposeFromFile(next.file);
              } else {
                text = await readDocument(next.file);
                proposal = await aiProposeFromText(next.file.name, text);
              }
            } catch {
              setNotice(
                "IA indisponível no momento — usando análise local como alternativa."
              );
            }
          }

          if (!proposal) {
            if (text === null) text = await readDocument(next.file);
            proposal = proposeName(next.file.name, text);
          }
          setRows((prev) => {
            const used = new Set(
              prev
                .filter((r) => r.id !== next.id && r.status === "ok")
                .map((r) => r.proposed.toLowerCase())
            );
            const name = uniqueName(used, proposal.name);
            return prev.map((r) =>
              r.id === next.id
                ? { ...r, status: "ok", proposed: name, docType: proposal.docType }
                : r
            );
          });
        } catch (err) {
          patchRow(next.id, {
            status: "erro",
            use: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [patchRow]);

  const enqueueRows = React.useCallback(
    (newRows: Row[], replace: boolean) => {
      setRows((prev) => (replace ? newRows : [...prev, ...newRows]));
      if (replace) queueRef.current = [...newRows];
      else queueRef.current.push(...newRows);
      void runQueue();
    },
    [runQueue]
  );

  const addFiles = React.useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const supported = list.filter((f) => isSupported(f.name));
      const ignored = list.length - supported.length;
      setNotice(
        ignored > 0
          ? `${ignored} arquivo(s) ignorado(s) por formato não suportado.`
          : ""
      );
      if (supported.length === 0) return;
      enqueueRows(
        supported.map((file) => ({
          id: crypto.randomUUID(),
          file,
          proposed: file.name,
          docType: "",
          status: "aguardando" as const,
          use: true,
        })),
        false
      );
    },
    [enqueueRows]
  );

  async function handlePickFolder() {
    try {
      const dir = await pickFolder();
      if (!dir) return;
      setDirHandle(dir);
      const entries = await listFolderFiles(
        dir,
        (name) =>
          isSupported(name) &&
          (!onlyWhatsapp || name.toLowerCase().includes("whatsapp"))
      );
      if (entries.length === 0) {
        setNotice("Nenhum arquivo compatível encontrado na pasta.");
        enqueueRows([], true);
        return;
      }
      setNotice(
        `${entries.length} arquivo(s) encontrado(s) em "${dir.name}".`
      );
      enqueueRows(
        entries.map(({ file, handle }) => ({
          id: crypto.randomUUID(),
          file,
          handle,
          proposed: file.name,
          docType: "",
          status: "aguardando" as const,
          use: true,
        })),
        true
      );
    } catch (err) {
      setNotice(
        `Não foi possível acessar a pasta: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  const total = rows.length;
  const done = rows.filter((r) => r.status !== "aguardando" && r.status !== "processando").length;
  const processing = total > 0 && done < total;
  const downloadable = rows.filter(
    (r) => r.use && (r.status === "ok" || r.status === "renomeado")
  );
  const applyTargets = rows.filter(
    (r) =>
      r.use &&
      r.status === "ok" &&
      r.handle &&
      ensureExtension(r.proposed.trim() || r.file.name, r.file.name) !==
        r.handle.name
  );
  const hasFolderRows = rows.some((r) => r.handle);

  async function applyRenames() {
    if (!dirHandle || applyTargets.length === 0) return;
    if (
      !window.confirm(
        `Renomear ${applyTargets.length} arquivo(s) na pasta "${dirHandle.name}"?\n\nRecomenda-se revisar a lista antes de confirmar.`
      )
    ) {
      return;
    }
    setApplying(true);
    try {
      const used = await existingNames(dirHandle);
      for (const row of applyTargets) {
        const handle = row.handle!;
        const desired = ensureExtension(
          row.proposed.trim() || row.file.name,
          row.file.name
        );
        used.delete(handle.name.toLowerCase());
        const name = uniqueName(used, desired);
        try {
          await renameInFolder(dirHandle, handle, name);
          used.add(name.toLowerCase());
          patchRow(row.id, { status: "renomeado", proposed: name });
        } catch (err) {
          used.add(handle.name.toLowerCase());
          patchRow(row.id, {
            status: "erro",
            error: `Falha ao renomear: ${err instanceof Error ? err.message : err}`,
          });
        }
      }
    } finally {
      setApplying(false);
    }
  }

  async function downloadZip() {
    if (downloadable.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      const used = new Set<string>();
      for (const row of downloadable) {
        const name = uniqueName(
          used,
          ensureExtension(row.proposed.trim() || row.file.name, row.file.name)
        );
        used.add(name.toLowerCase());
        zip.file(name, row.file);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, "documentos-renomeados.zip");
    } finally {
      setZipping(false);
    }
  }

  function downloadSingle(row: Row) {
    const name = ensureExtension(row.proposed.trim() || row.file.name, row.file.name);
    triggerDownload(row.file, name);
  }

  function triggerDownload(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  function clearAll() {
    setRows([]);
    setDirHandle(null);
    setNotice("");
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Renomeador Inteligente de Documentos
        </h1>
        <p className="text-muted-foreground">
          Analisa imagens e PDFs (RG, CNH, certidões, matrículas, contratos…) e
          sugere nomes de arquivo com base no conteúdo do documento.
        </p>
      </header>

      {aiSettings.mode === "local" ? (
        <Alert>
          <ShieldCheck className="size-4" />
          <AlertTitle>100% local</AlertTitle>
          <AlertDescription>
            O OCR roda dentro do seu navegador. Os documentos não são enviados
            para nenhum servidor.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <Sparkles className="size-4" />
          <AlertTitle>Análise com IA (Google Gemini)</AlertTitle>
          <AlertDescription>
            {aiSettings.mode === "arquivo"
              ? "Os documentos são enviados ao Google Gemini para identificação. "
              : "Apenas o texto extraído pelo OCR local é enviado ao Google Gemini. "}
            Se a IA falhar, a análise local no navegador é usada como
            alternativa. Prefere não enviar nada? Escolha o modo
            &ldquo;Somente local&rdquo; abaixo.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inteligência artificial</CardTitle>
          <CardDescription>
            Como os documentos devem ser analisados. A escolha fica salva neste
            navegador.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={aiSettings.mode}
            onValueChange={(value) =>
              saveAiSettings({ mode: value as AiMode })
            }
            className="grid gap-3 sm:grid-cols-3"
          >
            {AI_MODES.map((mode) => (
              <RadioGroupCard key={mode.value} value={mode.value}>
                <span className="pr-8 font-medium">{mode.title}</span>
                <span className="text-sm text-muted-foreground">
                  {mode.description}
                </span>
              </RadioGroupCard>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>1. Selecione os documentos</CardTitle>
          <CardDescription>
            Formatos aceitos: JPG, PNG, WEBP, BMP e PDF.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {folderSupported && (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <Button
                  onClick={handlePickFolder}
                  disabled={processing || applying}
                >
                  <FolderOpen className="size-4" />
                  Selecionar pasta
                </Button>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox
                    checked={onlyWhatsapp}
                    onCheckedChange={(checked) =>
                      setOnlyWhatsapp(checked === true)
                    }
                  />
                  Somente arquivos com &ldquo;WhatsApp&rdquo; no nome
                </label>
              </div>
              <p className="text-sm text-muted-foreground">
                Ao confirmar, os arquivos são renomeados direto na pasta
                escolhida — sem precisar baixar nada.
              </p>
            </div>
          )}

          {folderSupported && (
            <p className="text-center text-sm text-muted-foreground">
              ou, se preferir baixar os arquivos renomeados:
            </p>
          )}

          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <Upload className="size-8 text-muted-foreground" />
            <p className="font-medium">
              Arraste os arquivos aqui ou clique para selecionar
            </p>
            <p className="text-sm text-muted-foreground">
              Na primeira análise, o navegador baixa o motor de OCR (~15 MB).
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".jpg,.jpeg,.png,.webp,.bmp,.pdf"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {notice && (
            <p className="text-sm text-muted-foreground">{notice}</p>
          )}
        </CardContent>
      </Card>

      {total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Revise os nomes sugeridos</CardTitle>
            <CardDescription>
              O OCR não é infalível — revise antes de aplicar. Você pode editar
              o nome sugerido e desmarcar arquivos que não quer incluir.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {processing && (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">
                  Analisando {Math.min(done + 1, total)} de {total}…
                </p>
                <Progress value={(done / total) * 100} />
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">Usar</TableHead>
                    <TableHead>Arquivo original</TableHead>
                    <TableHead>Nome sugerido</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={row.use}
                          disabled={row.status !== "ok"}
                          onCheckedChange={(checked) =>
                            patchRow(row.id, { use: checked === true })
                          }
                          aria-label={`Incluir ${row.file.name}`}
                        />
                      </TableCell>
                      <TableCell
                        className="max-w-55 truncate text-muted-foreground"
                        title={row.file.name}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <FileText className="size-3.5 shrink-0" />
                          {row.file.name}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-70">
                        {row.status === "ok" ? (
                          <Input
                            value={row.proposed}
                            onChange={(e) =>
                              patchRow(row.id, { proposed: e.target.value })
                            }
                            className="h-8"
                          />
                        ) : row.status === "renomeado" ? (
                          <span className="text-sm">{row.proposed}</span>
                        ) : row.status === "erro" ? (
                          <span className="text-sm text-destructive">
                            {row.error}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
                            {row.status === "processando" && (
                              <Loader2 className="size-3.5 animate-spin" />
                            )}
                            {row.status === "processando"
                              ? "Analisando…"
                              : "Na fila"}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {(row.status === "ok" || row.status === "renomeado") &&
                            row.docType && (
                              <Badge variant="secondary">{row.docType}</Badge>
                            )}
                          {row.status === "renomeado" && (
                            <Badge>
                              <Check className="size-3" />
                              Renomeado
                            </Badge>
                          )}
                          {row.status === "erro" && (
                            <Badge variant="destructive">Erro</Badge>
                          )}
                        </span>
                      </TableCell>
                      <TableCell>
                        {(row.status === "ok" || row.status === "renomeado") && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => downloadSingle(row)}
                            title="Baixar este arquivo"
                          >
                            <Download className="size-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {hasFolderRows && (
                <Button
                  onClick={applyRenames}
                  disabled={applyTargets.length === 0 || applying || processing}
                >
                  {applying ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  Renomear {applyTargets.length} arquivo(s) na pasta
                </Button>
              )}
              <Button
                variant={hasFolderRows ? "outline" : "default"}
                onClick={downloadZip}
                disabled={downloadable.length === 0 || zipping}
              >
                {zipping ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Download className="size-4" />
                )}
                Baixar {downloadable.length} arquivo(s) (.zip)
              </Button>
              <Button
                variant="outline"
                onClick={clearAll}
                disabled={processing || applying}
              >
                <Trash2 className="size-4" />
                Limpar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <footer className="text-center text-sm text-muted-foreground">
        Tipos reconhecidos: RG, CNH, CPF, Passaporte, Certidões (nascimento,
        casamento, óbito), Comprovante de residência, Matrícula de imóvel,
        IPTU, ITBI, Escritura, Procuração e Contrato.
      </footer>
    </main>
  );
}
