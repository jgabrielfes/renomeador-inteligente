"use client";

import * as React from "react";
import Link from "next/link";
import JSZip from "jszip";
import { toast } from "sonner";
import {
  ArrowLeft,
  Check,
  Cpu,
  Download,
  FileText,
  FolderOpen,
  GraduationCap,
  Loader2,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
} from "lucide-react";

import {
  registrarAnalise,
  registrarDesfecho,
  registrarDownloadDeItem,
  registrarErroDeAnalise,
} from "@/app/(private)/renomeador/actions";
import type { MetodoAnalise } from "@/lib/generated/prisma/enums";
import { CorrectionsDialog } from "@/components/corrections-dialog";
import { DocumentPreview } from "@/components/document-preview";
import { PdfSplitDialog } from "@/components/pdf-split-dialog";
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  getSubfolder,
  listFolderFiles,
  namesIn,
  overwriteFile,
  pickFolder,
  removeFile,
  renameInFolder,
  writeNewFile,
} from "@/lib/fs";
import {
  addCorrection,
  clearCorrections,
  flushRules,
  getLessonsServerSnapshot,
  getLessonsSnapshot,
  importLessons,
  initLessons,
  migrateLegacyLessons,
  saveRules,
  subscribeLessons,
  type LessonsState,
} from "@/lib/lessons";
import { categoriaDe } from "@/lib/categories";
import { IMAGE_EXTS, PDF_EXTS, isSupported, readDocument } from "@/lib/ocr";
import type { PdfSegment } from "@/lib/pdf-split";
import { ensureExtension, proposeName, uniqueName, withSequence } from "@/lib/renamer";
import { imageFileToPdfBlob, isImageFile, pdfNameFor } from "@/lib/to-pdf";

// Imagens sempre; PDFs também — mas só os digitalizados, o que só dá para
// saber abrindo o arquivo. A pré-visualização decide e explica a recusa.
function isEnhanceable(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return [...IMAGE_EXTS, ...PDF_EXTS].some((ext) => lower.endsWith(ext));
}

function isPdfFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return PDF_EXTS.some((ext) => lower.endsWith(ext));
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

export default function Home({
  initialLessons,
}: {
  // Regras + correções da conta, carregadas no servidor (null = falha).
  initialLessons: LessonsState | null;
}) {
  // Uma vez por mount, ANTES do useSyncExternalStore das lições ler o
  // snapshot (inicializador de useState roda no primeiro render).
  React.useState(() => initLessons(initialLessons));
  // Migração única do localStorage antigo — efeito, porque grava no servidor.
  React.useEffect(() => {
    migrateLegacyLessons();
  }, []);

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
  // Telemetria: liga cada linha analisada ao evento registrado (para marcar
  // download/otimizada/zip depois). Vive só nesta sessão da página.
  const telemetriaRef = React.useRef(
    new Map<string, { eventId: string; indice: number }>()
  );

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
  // Linha aberta no separador de PDF (mesma ideia do previewId).
  const [splitId, setSplitId] = React.useState<string | null>(null);
  const [organizarEmSubpastas, setOrganizarEmSubpastas] = React.useState(false);
  const [converterParaPdf, setConverterParaPdf] = React.useState(false);
  const [numerarArquivos, setNumerarArquivos] = React.useState(false);

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
    async (row: Row, text?: string | null): Promise<string | null> => {
      try {
        const extracted = text ?? (await readDocument(row.file));
        const proposal = proposeName(row.file.name, extracted);
        applyProposal(row.id, proposal, "local");
        return proposal.docType || "Documento";
      } catch (err) {
        patchRow(row.id, {
          status: "erro",
          use: false,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }
    },
    [applyProposal, patchRow]
  );

  const runQueue = React.useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    // Telemetria: contabiliza NO MOMENTO DA ANÁLISE (arquivo enviado para a
    // IA ou para o OCR), por método — registrado ao fim da rodada da fila,
    // com duração e os nomes de → para de cada arquivo.
    const criarBucket = () => ({
      quantidade: 0,
      duracaoMs: 0,
      itens: [] as Array<{ tipo: string }>,
      rowIds: [] as string[],
    });
    const contadores: Record<MetodoAnalise, ReturnType<typeof criarBucket>> = {
      IA_ARQUIVO: criarBucket(),
      IA_TEXTO: criarBucket(),
      LOCAL: criarBucket(),
    };
    const registrarItem = (metodo: MetodoAnalise, rowId: string, tipo: string) => {
      contadores[metodo].quantidade += 1;
      contadores[metodo].itens.push({ tipo });
      contadores[metodo].rowIds.push(rowId);
    };
    try {
      while (queueRef.current.length > 0) {
        const { mode } = getAiSettingsSnapshot();

        if (mode === "local" || aiUnavailableRef.current) {
          const row = queueRef.current.shift()!;
          patchRow(row.id, { status: "processando" });
          const inicioLocal = performance.now();
          const tipoLocal = await processLocally(row);
          if (tipoLocal !== null) {
            contadores.LOCAL.duracaoMs += performance.now() - inicioLocal;
            registrarItem("LOCAL", row.id, tipoLocal);
          }
          continue;
        }

        // Monta um lote para UMA chamada à IA — o free tier limita requisições
        // por minuto, então 10 documentos por requisição em vez de 10 requisições.
        // Limitado também pelo tamanho total (corpo da função serverless).
        // First-fit: um arquivo grande que não coube não fecha o lote — a
        // varredura segue adiante e completa com arquivos menores da fila.
        const inicioLote = performance.now();
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
        const itemKinds: Array<"arquivo" | "texto"> = [];
        const ocrTexts = new Map<string, string>();
        for (const row of batch) {
          if (mode === "arquivo" && fileEligibleForAi(row.file)) {
            items.push({ file: row.file });
            itemRows.push(row);
            itemKinds.push("arquivo");
          } else {
            try {
              const text = await readDocument(row.file);
              ocrTexts.set(row.id, text);
              items.push({ fileName: row.file.name, text });
              itemRows.push(row);
              itemKinds.push("texto");
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
              // O fallback também vai para /admin/erros — a rota só registra o
              // que chega até ela; rede/timeout/resposta inválida só existem aqui.
              void registrarErroDeAnalise(message, aiError?.geminiStatus ?? null);
              toast.error("IA indisponível — usando análise local", {
                description: `Este lote foi analisado localmente no navegador. Detalhe: ${message.slice(0, 140)}`,
              });
            }
          }
        }

        const metodosDoLote = new Set<MetodoAnalise>();
        for (let i = 0; i < itemRows.length; i++) {
          const row = itemRows[i];
          const proposal = results?.[i] ?? null;
          if (proposal) {
            applyProposal(row.id, proposal, "ia");
            const metodo =
              itemKinds[i] === "arquivo" ? "IA_ARQUIVO" : "IA_TEXTO";
            registrarItem(metodo, row.id, proposal.docType || "Documento");
            metodosDoLote.add(metodo);
          } else {
            const tipoLocal = await processLocally(
              row,
              ocrTexts.get(row.id) ?? null
            );
            if (tipoLocal !== null) {
              registrarItem("LOCAL", row.id, tipoLocal);
              metodosDoLote.add("LOCAL");
            }
          }
        }
        // A duração do lote (preparação + chamada à IA + distribuição) vale
        // para cada método presente nele — foi o tempo de parede que aqueles
        // arquivos levaram para serem analisados.
        const duracaoLote = performance.now() - inicioLote;
        for (const metodo of metodosDoLote) {
          contadores[metodo].duracaoMs += duracaoLote;
        }
      }
      for (const [metodo, bucket] of Object.entries(contadores)) {
        if (bucket.quantidade === 0) continue;
        const evento = await registrarAnalise(
          metodo as MetodoAnalise,
          bucket.quantidade,
          Math.round(bucket.duracaoMs),
          bucket.itens
        );
        if (evento) {
          bucket.rowIds.forEach((rowId, indice) => {
            telemetriaRef.current.set(rowId, { eventId: evento.id, indice });
          });
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
  const splitRow = splitId ? (rows.find((r) => r.id === splitId) ?? null) : null;

  const total = rows.length;
  const done = rows.filter((r) => r.status !== "aguardando" && r.status !== "processando").length;
  const processing = total > 0 && done < total;
  const downloadable = rows.filter(
    (r) => r.use && (r.status === "ok" || r.status === "renomeado")
  );
  // Um arquivo entra na renomeação se o nome muda OU se alguma das opções
  // implica mexer nele mesmo com o nome igual — mudar de pasta, virar PDF ou
  // ganhar número. Sem esta última parte, um arquivo já com o nome certo
  // ficaria de fora e não seria movido para a subpasta.
  const applyTargets = rows.filter((r) => {
    if (!r.use || r.status !== "ok" || !r.handle) return false;
    if (organizarEmSubpastas || numerarArquivos) return true;
    if (converterParaPdf && isImageFile(r.file.name)) return true;
    return (
      ensureExtension(r.proposed.trim() || r.file.name, r.file.name) !==
      r.handle.name
    );
  });
  const hasFolderRows = rows.some((r) => r.handle);
  // Prévia das subpastas, para o usuário conferir o agrupamento ANTES de
  // mexer na pasta. Vale para os dois modos, por isso sai de `downloadable`
  // (todas as linhas aproveitáveis) e não só dos alvos da renomeação.
  const subpastasPrevistas = React.useMemo(() => {
    const contagem = new Map<string, number>();
    for (const row of downloadable) {
      const categoria = categoriaDe(row.docType);
      contagem.set(categoria, (contagem.get(categoria) ?? 0) + 1);
    }
    return [...contagem.entries()]
      .map(([categoria, quantidade]) => ({ categoria, quantidade }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria));
  }, [downloadable]);
  const imagensParaConverter = downloadable.filter((r) =>
    isImageFile(r.file.name)
  ).length;

  // Agrupa as linhas pela pasta de destino, preservando a ordem da tabela.
  // A numeração é POR PASTA: cada subpasta é um conjunto do processo e começa
  // no 01. Sem subpastas há uma pasta só, então a sequência é a da lista.
  function planejarDestinos(alvos: Row[]) {
    const porPasta = new Map<string, Row[]>();
    for (const row of alvos) {
      const categoria = organizarEmSubpastas ? categoriaDe(row.docType) : "";
      const lista = porPasta.get(categoria);
      if (lista) lista.push(row);
      else porPasta.set(categoria, [row]);
    }
    return porPasta;
  }

  // Nome final de um arquivo, aplicando as opções na ordem em que elas fazem
  // sentido: extensão → .pdf (se converter) → prefixo numérico.
  function nomeFinal(row: Row, posicao: number, totalNaPasta: number) {
    let nome = ensureExtension(
      row.proposed.trim() || row.file.name,
      row.file.name
    );
    const converter = converterParaPdf && isImageFile(row.file.name);
    if (converter) nome = pdfNameFor(nome);
    if (numerarArquivos) nome = withSequence(posicao, totalNaPasta, nome);
    return { nome, converter };
  }

  async function applyRenames() {
    if (!dirHandle || applyTargets.length === 0) return;
    const porPasta = planejarDestinos(applyTargets);
    const pastas = [...porPasta.keys()].filter(Boolean).sort();
    const convertidos = applyTargets.filter(
      (r) => converterParaPdf && isImageFile(r.file.name)
    ).length;

    const detalhes = [
      organizarEmSubpastas && pastas.length > 0
        ? `Serão criadas ${pastas.length} subpasta(s): ${pastas.join(", ")}.`
        : "",
      convertidos > 0
        ? `${convertidos} imagem(ns) será(ão) convertida(s) em PDF (o arquivo de imagem original é apagado).`
        : "",
      numerarArquivos
        ? organizarEmSubpastas
          ? "Os arquivos serão numerados, recomeçando em 01 dentro de cada subpasta."
          : "Os arquivos serão numerados na ordem da lista."
        : "",
    ].filter(Boolean);

    if (
      !window.confirm(
        `Renomear ${applyTargets.length} arquivo(s) na pasta "${dirHandle.name}"?\n\n${detalhes.join("\n")}${detalhes.length ? "\n\n" : ""}Recomenda-se revisar a lista antes de confirmar.`
      )
    ) {
      return;
    }

    setApplying(true);
    try {
      // Um conjunto de nomes por pasta de destino: a raiz e cada subpasta têm
      // seu próprio espaço de nomes, então "RG - João.pdf" pode existir em
      // duas categorias sem virar "(2)".
      const raiz = await existingNames(dirHandle);
      const usados = new Map<string, Set<string>>([["", raiz]]);

      for (const [categoria, linhas] of porPasta) {
        let destino: FileSystemDirectoryHandle | undefined;
        if (categoria) {
          destino = await getSubfolder(dirHandle, categoria);
          usados.set(categoria, await namesIn(destino));
        }
        const used = usados.get(categoria)!;

        for (let i = 0; i < linhas.length; i++) {
          const row = linhas[i];
          const handle = row.handle!;
          const { nome: desejado, converter } = nomeFinal(
            row,
            i + 1,
            linhas.length
          );

          try {
            // O próprio arquivo não conta como conflito quando fica na raiz.
            if (!categoria) raiz.delete(handle.name.toLowerCase());
            const name = uniqueName(used, desejado);

            let novoHandle = handle;
            let novoFile = row.file;
            if (converter) {
              // Converter é criar um arquivo novo e apagar a imagem: não dá
              // para "renomear" um JPG em PDF. O original só sai depois que o
              // PDF está gravado.
              const blob = await imageFileToPdfBlob(row.file);
              novoHandle = await writeNewFile(destino ?? dirHandle, name, blob);
              await removeFile(dirHandle, handle.name);
              novoFile = new File([blob], name, {
                type: "application/pdf",
                lastModified: Date.now(),
              });
            } else {
              await renameInFolder(dirHandle, handle, name, destino);
            }

            used.add(name.toLowerCase());
            patchRow(row.id, {
              status: "renomeado",
              proposed: categoria ? `${categoria}/${name}` : name,
              handle: novoHandle,
              file: novoFile,
            });
          } catch (err) {
            raiz.add(handle.name.toLowerCase());
            patchRow(row.id, {
              status: "erro",
              error: `Falha ao renomear: ${err instanceof Error ? err.message : err}`,
            });
          }
        }
      }
      const eventos = [
        ...new Set(
          applyTargets
            .map((r) => telemetriaRef.current.get(r.id)?.eventId)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      void registrarDesfecho(eventos, {
        montagem: {
          subpastas: organizarEmSubpastas,
          converterPdf: converterParaPdf,
          numerar: numerarArquivos,
        },
      });
    } finally {
      setApplying(false);
    }
  }

  async function downloadZip() {
    if (downloadable.length === 0) return;
    setZipping(true);
    try {
      const zip = new JSZip();
      // As mesmas opções do modo pasta valem aqui: o .zip sai com as subpastas,
      // a numeração por pasta e as imagens já em PDF.
      const porPasta = planejarDestinos(downloadable);
      const usados = new Map<string, Set<string>>();

      for (const [categoria, linhas] of porPasta) {
        const used = usados.get(categoria) ?? new Set<string>();
        usados.set(categoria, used);

        for (let i = 0; i < linhas.length; i++) {
          const row = linhas[i];
          const { nome: desejado, converter } = nomeFinal(
            row,
            i + 1,
            linhas.length
          );
          const name = uniqueName(used, desejado);
          used.add(name.toLowerCase());

          const conteudo = converter
            ? await imageFileToPdfBlob(row.file)
            : row.file;
          zip.file(categoria ? `${categoria}/${name}` : name, conteudo);
        }
      }

      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, "documentos-renomeados.zip");
      const eventos = [
        ...new Set(
          downloadable
            .map((r) => telemetriaRef.current.get(r.id)?.eventId)
            .filter((id): id is string => Boolean(id))
        ),
      ];
      void registrarDesfecho(eventos, {
        zip: true,
        montagem: {
          subpastas: organizarEmSubpastas,
          converterPdf: converterParaPdf,
          numerar: numerarArquivos,
        },
      });
    } finally {
      setZipping(false);
    }
  }

  function marcarDownload(row: Row, otimizado: boolean) {
    const ref = telemetriaRef.current.get(row.id);
    if (ref) void registrarDownloadDeItem(ref.eventId, ref.indice, otimizado);
  }

  function downloadSingle(row: Row) {
    marcarDownload(row, false);
    const name = ensureExtension(row.proposed.trim() || row.file.name, row.file.name);
    triggerDownload(row.file, name);
  }

  // Substitui o arquivo pela versão otimizada. No modo pasta isso GRAVA por
  // cima do arquivo do usuário e não tem desfazer — daí a confirmação explícita
  // e o aviso diferente para cada modo.
  async function replaceWithOptimized(row: Row, blob: Blob) {
    const onDisk = Boolean(row.handle);
    const warning = onDisk
      ? `Substituir "${row.file.name}" pela versão otimizada?\n\nO arquivo será gravado por cima na pasta "${dirHandle?.name}". Esta ação não pode ser desfeita.`
      : `Substituir "${row.file.name}" pela versão otimizada?\n\nO download e o .zip passarão a usar a versão otimizada. Seu arquivo no disco não é alterado.`;
    if (!window.confirm(warning)) return;

    try {
      if (row.handle) {
        if (dirHandle && !(await ensureWritePermission(dirHandle))) {
          toast.error("Sem permissão de escrita na pasta", {
            description: "Conceda a permissão para substituir o arquivo.",
          });
          return;
        }
        await overwriteFile(row.handle, blob);
      }
      // Mesmo no modo pasta o File em memória precisa ser trocado: é dele que
      // saem a pré-visualização e o .zip.
      patchRow(row.id, {
        file: new File([blob], row.file.name, {
          type: blob.type,
          lastModified: Date.now(),
        }),
      });
      toast.success("Arquivo substituído pela versão otimizada", {
        description: onDisk
          ? `Gravado na pasta "${dirHandle?.name}".`
          : "Vale para o download e o .zip desta sessão.",
      });
    } catch (err) {
      toast.error("Não foi possível substituir o arquivo", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Troca o PDF original pelos documentos separados. No modo pasta grava os
  // novos arquivos e APAGA o original do disco — daí a confirmação.
  async function applySplit(
    row: Row,
    results: Array<{ segment: PdfSegment; blob: Blob }>
  ) {
    const onDisk = Boolean(row.handle && dirHandle);
    const warning = onDisk
      ? `Separar "${row.file.name}" em ${results.length} arquivos?\n\nOs novos arquivos serão gravados na pasta "${dirHandle?.name}" e o PDF original será APAGADO. Esta ação não pode ser desfeita.`
      : `Separar "${row.file.name}" em ${results.length} arquivos?\n\nO PDF original sai da lista e os novos entram no lugar. Seu arquivo no disco não é alterado.`;
    if (!window.confirm(warning)) return;

    try {
      if (onDisk && !(await ensureWritePermission(dirHandle!))) {
        toast.error("Sem permissão de escrita na pasta", {
          description: "Conceda a permissão para separar o arquivo.",
        });
        return;
      }

      // Nomes únicos contra o que já existe na pasta, para não sobrescrever
      // um arquivo alheio que por acaso tenha o mesmo nome.
      const used = onDisk ? await existingNames(dirHandle!) : new Set<string>();
      const novos: Row[] = [];
      // Só arquivos criados por esta operação (nomes únicos garantem que não
      // são de terceiros), para poder desfazer se algo falhar no meio.
      const criados: string[] = [];
      try {
        for (const { segment, blob } of results) {
          const name = uniqueName(used, ensureExtension(segment.name, row.file.name));
          used.add(name.toLowerCase());
          const file = new File([blob], name, {
            type: "application/pdf",
            lastModified: Date.now(),
          });
          let handle: FileSystemFileHandle | undefined;
          if (onDisk) {
            handle = await writeNewFile(dirHandle!, name, blob);
            criados.push(name);
          }
          novos.push({
            id: crypto.randomUUID(),
            file,
            handle,
            proposed: name,
            docType: segment.docType,
            status: "ok",
            use: true,
            source: segment.source,
          });
        }
      } catch (err) {
        // Desfaz o que já tinha sido gravado: sem isso, uma falha no meio
        // deixaria arquivos pela metade na pasta ao lado do original.
        for (const name of criados) {
          await removeFile(dirHandle!, name).catch(() => {});
        }
        throw err;
      }

      // O original só é apagado depois que TODOS os novos foram gravados —
      // se a escrita falhar no meio, o PDF de origem continua lá.
      if (onDisk) await removeFile(dirHandle!, row.handle!.name);

      setRows((prev) => prev.flatMap((r) => (r.id === row.id ? novos : [r])));
      setSplitId(null);
      toast.success(`PDF separado em ${novos.length} arquivos`, {
        description: onDisk
          ? `Gravados na pasta "${dirHandle?.name}"; o original foi apagado.`
          : "Os novos arquivos entraram na lista no lugar do original.",
      });
    } catch (err) {
      toast.error("Não foi possível separar o PDF", {
        description: err instanceof Error ? err.message : String(err),
      });
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
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Módulos
        </Link>
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
              app aprende o padrão e aplica nos próximos documentos. Tudo fica
              salvo na sua conta e vale em qualquer navegador.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              value={lessons.rules}
              onChange={(e) => saveRules(e.target.value)}
              onBlur={flushRules}
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
              <CorrectionsDialog corrections={lessons.corrections} />
              {lessons.corrections.length > 0 && (
                <Dialog>
                  <DialogTrigger render={<Button variant="ghost" size="sm" />}>
                    <Trash2 className="size-3.5" />
                    Esquecer correções
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>
                        Tem certeza que deseja esquecer as correções?
                      </DialogTitle>
                      <DialogDescription>
                        {lessons.corrections.length} correção(ões) aprendida(s)
                        com suas edições serão apagadas definitivamente — o app
                        volta a sugerir nomes sem esse aprendizado. As regras
                        escritas acima não são afetadas. Para guardar uma cópia
                        antes, use “Exportar”.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="outline" />}>
                        Cancelar
                      </DialogClose>
                      <DialogClose
                        render={
                          <Button
                            variant="destructive"
                            onClick={() => {
                              clearCorrections();
                              toast.info(
                                "Correções aprendidas foram apagadas."
                              );
                            }}
                          />
                        }
                      >
                        <Trash2 className="size-3.5" />
                        Sim, esquecer correções
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
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
                        {isPdfFile(row.file.name) && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSplitId(row.id)}
                            title="Separar em documentos individuais (para PDFs que juntam matrícula, RG, CNH, certidões…)"
                          >
                            <Scissors className="size-4" />
                          </Button>
                        )}
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

            <div className="space-y-2 rounded-lg border p-4">
              <p className="text-sm font-medium">Montagem do processo</p>
              <p className="text-sm text-muted-foreground">
                Estas opções valem tanto para a renomeação na pasta quanto para
                o .zip.
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={organizarEmSubpastas}
                  onCheckedChange={(checked) =>
                    setOrganizarEmSubpastas(checked === true)
                  }
                />
                Organizar em subpastas por conjunto (Documentos Pessoais,
                Documentos do Imóvel, Contratos, Imposto de Transmissão…)
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={converterParaPdf}
                  onCheckedChange={(checked) =>
                    setConverterParaPdf(checked === true)
                  }
                />
                Converter imagens (JPG, PNG, WEBP, BMP) em PDF
                {imagensParaConverter > 0 && (
                  <Badge variant="secondary">
                    {imagensParaConverter} imagem(ns)
                  </Badge>
                )}
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <Checkbox
                  checked={numerarArquivos}
                  onCheckedChange={(checked) =>
                    setNumerarArquivos(checked === true)
                  }
                />
                Numerar os arquivos (01, 02, 03…)
                {numerarArquivos && organizarEmSubpastas && (
                  <span className="text-xs">
                    — recomeça em 01 dentro de cada subpasta
                  </span>
                )}
              </label>

              {organizarEmSubpastas && subpastasPrevistas.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-sm">
                  <span className="text-muted-foreground">Serão criadas:</span>
                  {subpastasPrevistas.map(({ categoria, quantidade }) => (
                    <Badge key={categoria} variant="secondary">
                      {categoria} ({quantidade})
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {hasFolderRows && (
                <Button
                  onClick={applyRenames}
                  loading={applying}
                  disabled={applyTargets.length === 0 || processing}
                >
                  <Check className="size-4" />
                  Renomear {applyTargets.length} arquivo(s) na pasta
                </Button>
              )}
              <Button
                variant={hasFolderRows ? "outline" : "default"}
                onClick={downloadZip}
                loading={zipping}
                disabled={downloadable.length === 0}
              >
                <Download className="size-4" />
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
        onDownloadOptimized={
          previewRow ? () => marcarDownload(previewRow, true) : undefined
        }
        canEnhance={previewRow ? isEnhanceable(previewRow.file.name) : false}
        onReplace={
          previewRow ? (blob) => replaceWithOptimized(previewRow, blob) : undefined
        }
      />

      <PdfSplitDialog
        file={splitRow?.file ?? null}
        onClose={() => setSplitId(null)}
        folderName={splitRow?.handle ? (dirHandle?.name ?? undefined) : undefined}
        onApply={async (results) => {
          if (splitRow) await applySplit(splitRow, results);
        }}
      />
    </main>
  );
}
