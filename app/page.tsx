"use client";

import * as React from "react";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  Check,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  GraduationCap,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  ZoomIn,
} from "lucide-react";

import { DocumentPreview } from "@/components/document-preview";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  AI_BATCH_MAX_BYTES,
  AI_BATCH_MAX_ITEMS,
  AiError,
  aiProposeBatch,
  fileEligibleForAi,
  getAiSettingsServerSnapshot,
  getAiSettingsSnapshot,
  saveAiSettings,
  subscribeAiSettings,
  type AiBatchItem,
  type AiMode,
  type AiProposal,
} from "@/lib/ai";
import {
  directoryHandleFromDrop,
  ensureWritePermission,
  existingNames,
  filesFromDataTransfer,
  folderPickerAvailable,
  listFolderFiles,
  pickFolder,
  renameInFolder,
} from "@/lib/fs";
import {
  addCorrection,
  clearCorrections,
  getLessonsServerSnapshot,
  getLessonsSnapshot,
  importLessons,
  saveRules,
  subscribeLessons,
} from "@/lib/lessons";
import { enhanceImageFileToBlob } from "@/lib/image-enhance";
import { IMAGE_EXTS, isSupported, readDocument } from "@/lib/ocr";
import { ensureExtension, proposeName, uniqueName } from "@/lib/renamer";

function isEnhanceableImage(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return IMAGE_EXTS.some((ext) => lower.endsWith(ext));
}

// Insere " (otimizado)" antes da extensão do arquivo.
function withOptimizedSuffix(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0
    ? `${name.slice(0, dot)} (otimizado)${name.slice(dot)}`
    : `${name} (otimizado)`;
}

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
  // De onde veio o nome sugerido — e, quando da IA, qual foi a sugestão
  // original (para detectar edições do usuário e aprender com elas).
  source?: "ia" | "local";
  aiProposed?: string;
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
  const [includeEnhanced, setIncludeEnhanced] = React.useState(false);
  const [enhancingId, setEnhancingId] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const queueRef = React.useRef<Row[]>([]);
  const processingRef = React.useRef(false);
  // Ligado quando a cota DIÁRIA do free tier esgota: esperar não resolve,
  // então a IA fica desligada até recarregar a página (e o aviso sai uma vez).
  const aiUnavailableRef = React.useRef(false);

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

  // false no HTML do servidor, true assim que o cliente hidrata. Evita piscar
  // o modo padrão antes de o localStorage ser lido: até lá, nenhum card
  // aparece selecionado.
  const hydrated = React.useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false
  );

  const lessons = React.useSyncExternalStore(
    subscribeLessons,
    getLessonsSnapshot,
    getLessonsServerSnapshot
  );
  const importInputRef = React.useRef<HTMLInputElement>(null);

  // Linha em pré-visualização (guarda o id: a linha "viva" vem de rows, então
  // o nome editado no preview e na tabela ficam sempre em sincronia).
  const [previewId, setPreviewId] = React.useState<string | null>(null);

  const patchRow = React.useCallback((id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }, []);

  // Edição de um nome sugerido pela IA vira "correção": exemplo few-shot que
  // calibra os próximos lotes (o cliente pediu exatamente isso).
  const captureCorrection = React.useCallback(
    (row: Row) => {
      const final = row.proposed.trim();
      if (
        row.source !== "ia" ||
        !row.aiProposed ||
        !final ||
        final === row.aiProposed
      ) {
        return;
      }
      addCorrection({
        tipo: row.docType,
        sugerido: row.aiProposed,
        corrigido: ensureExtension(final, row.file.name),
      });
      // Evita recapturar a mesma edição em blurs seguintes.
      patchRow(row.id, { aiProposed: final });
      toast.success("Correção aprendida", {
        description:
          "Os próximos documentos parecidos seguirão esse padrão de nome.",
      });
    },
    [patchRow]
  );

  const applyProposal = React.useCallback(
    (rowId: string, proposal: AiProposal, source: "ia" | "local") => {
      setRows((prev) => {
        const used = new Set(
          prev
            .filter((r) => r.id !== rowId && r.status === "ok")
            .map((r) => r.proposed.toLowerCase())
        );
        const name = uniqueName(used, proposal.name);
        return prev.map((r) =>
          r.id === rowId
            ? {
                ...r,
                status: "ok",
                proposed: name,
                docType: proposal.docType,
                source,
                aiProposed: source === "ia" ? name : undefined,
              }
            : r
        );
      });
    },
    []
  );

  const processLocally = React.useCallback(
    async (row: Row, text?: string | null) => {
      try {
        const extracted = text ?? (await readDocument(row.file));
        applyProposal(row.id, proposeName(row.file.name, extracted), "local");
      } catch (err) {
        patchRow(row.id, {
          status: "erro",
          use: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [applyProposal, patchRow]
  );

  const runQueue = React.useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const { mode } = getAiSettingsSnapshot();

        if (mode === "local" || aiUnavailableRef.current) {
          const row = queueRef.current.shift()!;
          patchRow(row.id, { status: "processando" });
          await processLocally(row);
          continue;
        }

        // Monta um lote para UMA chamada à IA — o free tier limita requisições
        // por minuto, então 10 documentos por requisição em vez de 10 requisições.
        // Limitado também pelo tamanho total (corpo da função serverless).
        // First-fit: um arquivo grande que não coube não fecha o lote — a
        // varredura segue adiante e completa com arquivos menores da fila.
        const batch: Row[] = [];
        let bytes = 0;
        let index = 0;
        while (
          index < queueRef.current.length &&
          batch.length < AI_BATCH_MAX_ITEMS
        ) {
          const candidate = queueRef.current[index];
          const size =
            mode === "arquivo" && fileEligibleForAi(candidate.file)
              ? candidate.file.size
              : 0;
          if (batch.length > 0 && bytes + size > AI_BATCH_MAX_BYTES) {
            index++;
            continue;
          }
          bytes += size;
          batch.push(candidate);
          queueRef.current.splice(index, 1);
        }
        batch.forEach((row) => patchRow(row.id, { status: "processando" }));

        // Prepara os itens: arquivo direto quando elegível; senão OCR local.
        const items: AiBatchItem[] = [];
        const itemRows: Row[] = [];
        const ocrTexts = new Map<string, string>();
        for (const row of batch) {
          if (mode === "arquivo" && fileEligibleForAi(row.file)) {
            items.push({ file: row.file });
            itemRows.push(row);
          } else {
            try {
              const text = await readDocument(row.file);
              ocrTexts.set(row.id, text);
              items.push({ fileName: row.file.name, text });
              itemRows.push(row);
            } catch (err) {
              patchRow(row.id, {
                status: "erro",
                use: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
        if (items.length === 0) continue;

        // Uma tentativa + um retry com espera para erros temporários do Gemini
        // (429 = cota por minuto; 503 = modelo sobrecarregado).
        let results: Array<AiProposal | null> | null = null;
        for (let attempt = 0; attempt < 2 && !results; attempt++) {
          try {
            // Regras e correções do escritório calibram cada lote — inclusive
            // as capturadas há pouco, nesta mesma sessão.
            const lessons = getLessonsSnapshot();
            results = await aiProposeBatch(items, {
              rules: lessons.rules,
              corrections: lessons.corrections,
            });
          } catch (err) {
            const aiError = err instanceof AiError ? err : null;
            const message = err instanceof Error ? err.message : String(err);

            // Cota DIÁRIA: esperar não resolve — desliga a IA nesta sessão.
            if (aiError?.dailyQuota) {
              aiUnavailableRef.current = true;
              toast.error("Cota diária gratuita da IA esgotada", {
                duration: 12000,
                description:
                  "O limite do free tier zera à meia-noite (horário do Pacífico). Até lá, os documentos usam a análise local no navegador. Para uso contínuo, habilite billing no projeto Google.",
              });
              break;
            }

            const quota =
              aiError?.geminiStatus === 429 || /429|quota/i.test(message);
            const unstable = /503|UNAVAILABLE|overload|high demand/i.test(message);
            if (attempt === 0 && (quota || unstable)) {
              // A Google manda no erro quanto esperar (retryDelay).
              const waitSeconds = Math.min(
                aiError?.retryDelaySeconds ?? (quota ? 25 : 8),
                60
              );
              toast.warning(
                quota
                  ? "Cota da IA atingida"
                  : "Gemini sobrecarregado no momento",
                {
                  description: `Tentando de novo em ${Math.round(waitSeconds)} segundos. Detalhe: ${message.slice(0, 140)}`,
                }
              );
              await new Promise((resolve) =>
                setTimeout(resolve, waitSeconds * 1000)
              );
            } else {
              toast.error("IA indisponível — usando análise local", {
                description: `Este lote foi analisado localmente no navegador. Detalhe: ${message.slice(0, 140)}`,
              });
            }
          }
        }

        for (let i = 0; i < itemRows.length; i++) {
          const row = itemRows[i];
          const proposal = results?.[i] ?? null;
          if (proposal) applyProposal(row.id, proposal, "ia");
          else await processLocally(row, ocrTexts.get(row.id) ?? null);
        }
      }
    } finally {
      processingRef.current = false;
    }
  }, [applyProposal, patchRow, processLocally]);

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

  const loadFolder = React.useCallback(
    async (dir: FileSystemDirectoryHandle) => {
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
    },
    [enqueueRows, onlyWhatsapp]
  );

  async function handlePickFolder() {
    try {
      const dir = await pickFolder();
      if (!dir) return;
      await loadFolder(dir);
    } catch (err) {
      setNotice(
        `Não foi possível acessar a pasta: ${err instanceof Error ? err.message : err}`
      );
    }
  }

  const previewRow = previewId
    ? (rows.find((r) => r.id === previewId) ?? null)
    : null;

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
  const hasEnhanceableRows = downloadable.some((r) => isEnhanceableImage(r.file.name));

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

        if (includeEnhanced && isEnhanceableImage(row.file.name)) {
          try {
            const enhanced = await enhanceImageFileToBlob(row.file);
            zip.file(withOptimizedSuffix(name), enhanced);
          } catch {
            // Se a otimização falhar para um arquivo, o original ainda vai no zip.
          }
        }
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

  async function downloadEnhanced(row: Row) {
    setEnhancingId(row.id);
    try {
      const enhanced = await enhanceImageFileToBlob(row.file);
      const name = ensureExtension(row.proposed.trim() || row.file.name, row.file.name);
      triggerDownload(enhanced, withOptimizedSuffix(name));
    } catch (err) {
      toast.error("Não foi possível gerar a versão otimizada", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setEnhancingId(null);
    }
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

      {hydrated && (aiSettings.mode === "local" ? (
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
      ))}

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
            value={hydrated ? aiSettings.mode : null}
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

      {hydrated && aiSettings.mode !== "local" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GraduationCap className="size-4" />
              Regras do escritório
            </CardTitle>
            <CardDescription>
              Ensine a IA no seu vocabulário: uma regra por linha, em português
              mesmo. Além disso, toda vez que você corrigir um nome sugerido, o
              app aprende o padrão e aplica nos próximos documentos.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={lessons.rules}
              onChange={(e) => saveRules(e.target.value)}
              rows={4}
              placeholder={
                "Exemplos:\ncertidão da prefeitura sobre débitos de imóvel → Certidão Negativa de Tributos Imobiliários\ncontrato de honorários → Honorários - {Nome do Cliente}"
              }
              className="font-mono text-sm"
            />
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span>
                {lessons.corrections.length > 0
                  ? `${lessons.corrections.length} correção(ões) aprendida(s) com suas edições.`
                  : "Nenhuma correção aprendida ainda — edite um nome sugerido pela IA para começar."}
              </span>
              {lessons.corrections.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    clearCorrections();
                    toast.info("Correções aprendidas foram apagadas.");
                  }}
                >
                  <Trash2 className="size-3.5" />
                  Esquecer correções
                </Button>
              )}
              <span className="ml-auto inline-flex gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Baixar regras e correções em JSON"
                  onClick={() => {
                    const blob = new Blob(
                      [JSON.stringify(lessons, null, 2)],
                      { type: "application/json" }
                    );
                    triggerDownload(blob, "regras-renomeador.json");
                  }}
                >
                  <Download className="size-3.5" />
                  Exportar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Restaurar regras e correções de um JSON exportado"
                  onClick={() => importInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  Importar
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    try {
                      importLessons(await file.text());
                      toast.success("Regras e correções importadas.");
                    } catch (err) {
                      toast.error("Não foi possível importar", {
                        description:
                          err instanceof Error ? err.message : String(err),
                      });
                    }
                  }}
                />
              </span>
            </div>
          </CardContent>
        </Card>
      )}

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
              // As leituras do DataTransfer precisam começar de forma
              // síncrona — os itens expiram depois de qualquer await.
              const dirPromise = directoryHandleFromDrop(e.dataTransfer);
              const filesPromise = filesFromDataTransfer(e.dataTransfer);
              void (async () => {
                try {
                  // Uma pasta arrastada no Chrome/Edge entra no modo pasta,
                  // com renomeação no lugar (após permissão de escrita).
                  const dir = dirPromise ? await dirPromise : null;
                  if (dir && folderSupported) {
                    if (await ensureWritePermission(dir)) {
                      await loadFolder(dir);
                      return;
                    }
                    toast.info("Sem permissão de escrita na pasta", {
                      description:
                        "Os arquivos serão analisados para baixar em .zip.",
                    });
                  }
                  addFiles(await filesPromise);
                } catch (err) {
                  setNotice(
                    `Não foi possível ler o que foi arrastado: ${err instanceof Error ? err.message : err}`
                  );
                }
              })();
            }}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/50"
            }`}
          >
            <Upload className="size-8 text-muted-foreground" />
            <p className="font-medium">
              Arraste arquivos ou uma pasta inteira aqui, ou clique para
              selecionar
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
                    <TableHead className="w-20" />
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
                            onBlur={() => captureCorrection(row)}
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
                          {(row.status === "ok" || row.status === "renomeado") &&
                            row.source && (
                              <Badge
                                variant="outline"
                                title={
                                  row.source === "ia"
                                    ? "Nome sugerido pela IA (Gemini)"
                                    : "Nome gerado pela análise local no navegador (a IA não estava disponível)"
                                }
                              >
                                {row.source === "ia" ? (
                                  <Sparkles className="size-3" />
                                ) : (
                                  <Cpu className="size-3" />
                                )}
                                {row.source === "ia" ? "IA" : "Local"}
                              </Badge>
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
                      <TableCell className="whitespace-nowrap">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setPreviewId(row.id)}
                          title="Pré-visualizar o documento"
                        >
                          <ZoomIn className="size-4" />
                        </Button>
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
                        {(row.status === "ok" || row.status === "renomeado") &&
                          isEnhanceableImage(row.file.name) && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => downloadEnhanced(row)}
                              disabled={enhancingId === row.id}
                              title="Baixar versão digitalizada (endireita a folha, remove sombra e realça o texto — sem alterar o conteúdo)"
                            >
                              {enhancingId === row.id ? (
                                <Loader2 className="size-4 animate-spin" />
                              ) : (
                                <Wand2 className="size-4" />
                              )}
                            </Button>
                          )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {hasEnhanceableRows && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={includeEnhanced}
                  onCheckedChange={(checked) =>
                    setIncludeEnhanced(checked === true)
                  }
                />
                Incluir também versão digitalizada no .zip (endireita a folha,
                remove sombra e realça o texto — sem alterar o conteúdo)
              </label>
            )}

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
        casamento, óbito, valor venal, tributos imobiliários, débitos,
        trabalhista, distribuição, protesto, ônus, vintenária), Matrícula de
        imóvel, IPTU, Guia de ITBI, Habite-se, Comprovantes (residência,
        pagamento), Boleto, Termo de quitação, Escritura, Procuração e
        Contratos (compra e venda, locação, serviços, honorários).
      </footer>

      <DocumentPreview
        file={previewRow?.file ?? null}
        onClose={() => setPreviewId(null)}
        name={previewRow?.status === "ok" ? previewRow.proposed : undefined}
        onNameChange={(value) =>
          previewRow && patchRow(previewRow.id, { proposed: value })
        }
        onNameBlur={() => previewRow && captureCorrection(previewRow)}
        onDownload={
          previewRow &&
          (previewRow.status === "ok" || previewRow.status === "renomeado")
            ? () => downloadSingle(previewRow)
            : undefined
        }
      />
    </main>
  );
}
