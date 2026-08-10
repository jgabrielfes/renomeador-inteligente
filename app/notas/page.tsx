"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FileWarning,
  FolderOpen,
  Loader2,
  ScrollText,
  Sparkles,
  XCircle,
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { extractDocxText, fillDocxTemplate } from "@/lib/notas/docx";
import {
  casarComPasta,
  distribuirPapeis,
  extrairPrazo,
  extrairPrenotacao,
  extrairServentia,
  tipoDoDocumento,
  type Papel,
} from "@/lib/notas/pasta";
import { documentoParaAssinatura } from "@/lib/notas/pdfa";
import {
  dadosAta,
  dadosRequerimento,
  dadosRerratificacao,
  NOMES_PECA,
  pecaDaVia,
  TEMPLATES,
  type EntradaAta,
  type EntradaRequerimento,
  type EntradaRerratificacao,
  type TipoPeca,
} from "@/lib/notas/pecas";
import {
  sintetizar,
  triar,
  type ItemClassificado,
  type Via,
} from "@/lib/notas/resolvedor";
import { lerTraslado, type DadosTraslado } from "@/lib/notas/traslado";
import {
  loadPdfjs,
  meaningfulNativeText,
  pageNativeText,
  readPdfPageTexts,
} from "@/lib/ocr";
import { renderPdfThumbnails } from "@/lib/pdf-split";

// ---------------------------------------------------------------------------
// Extração de texto dos arquivos do caso

type Fonte = DadosTraslado["fonte"] | "imagem" | "outro";

// Texto barato: só a camada nativa do PDF (sem OCR) — para indexar a pasta
// inteira sem custo. O OCR fica reservado ao arquivo identificado como nota.
async function textoNativoPdf(
  file: File,
  maxPages = 20
): Promise<{ texto: string; nativo: boolean }> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  try {
    const partes: string[] = [];
    let nativo = true;
    for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
      const t = await pageNativeText(await doc.getPage(i));
      if (!meaningfulNativeText(t)) nativo = false;
      partes.push(t);
    }
    return { texto: partes.join("\n").trim(), nativo };
  } finally {
    await task.destroy();
  }
}

async function textoBarato(
  file: File
): Promise<{ texto: string; fonte: Fonte }> {
  const nome = file.name.toLowerCase();
  try {
    if (nome.endsWith(".docx")) {
      return { texto: await extractDocxText(file), fonte: "docx" };
    }
    if (nome.endsWith(".txt")) {
      return { texto: await file.text(), fonte: "texto" };
    }
    if (nome.endsWith(".pdf")) {
      const { texto, nativo } = await textoNativoPdf(file);
      return {
        texto: nativo ? texto : "",
        fonte: nativo ? "pdf-nativo" : "pdf-escaneado",
      };
    }
    if (/\.(jpe?g|png|webp|bmp|gif|heic)$/.test(nome)) {
      return { texto: "", fonte: "imagem" };
    }
  } catch {
    // arquivo ilegível entra no índice mesmo assim, só pelo nome
  }
  return { texto: "", fonte: "outro" };
}

// Arrastar uma PASTA entrega DataTransferItems com webkitGetAsEntry; este
// helper percorre a árvore e devolve todos os arquivos.
async function filesFromDataTransfer(dt: DataTransfer): Promise<File[]> {
  const entries = Array.from(dt.items)
    .map((item) => item.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => Boolean(e));
  if (entries.length === 0) return Array.from(dt.files);

  const out: File[] = [];
  async function walk(entry: FileSystemEntry): Promise<void> {
    if (entry.isFile) {
      const f = await new Promise<File>((res, rej) =>
        (entry as FileSystemFileEntry).file(res, rej)
      );
      out.push(f);
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries devolve em lotes; repetir até vir vazio.
    for (;;) {
      const lote = await new Promise<FileSystemEntry[]>((res, rej) =>
        reader.readEntries(res, rej)
      );
      if (lote.length === 0) break;
      for (const e of lote) await walk(e);
    }
  }
  for (const e of entries) await walk(e);
  return out;
}

// ---------------------------------------------------------------------------
// Triagem

type StatusItem = "pendente" | "em_preparo" | "aguardando" | "resolvido";

const STATUS: Record<StatusItem, string> = {
  pendente: "Pendente",
  em_preparo: "Em preparo",
  aguardando: "Aguardando terceiro",
  resolvido: "Resolvido",
};

interface ItemTriado extends ItemClassificado {
  id: number;
  viaEscolhida: Via;
  confirmado: boolean;
  status: StatusItem;
}

const ROTULO_VIA: Record<Via, string> = {
  PROVIDENCIA_EXTERNA: "Providência externa",
  RERRATIFICACAO: "Rerratificação",
  REQUERIMENTO: "Requerimento",
  JUNTADA: "Juntada de documento",
  ATA_RETIFICATIVA: "Ata retificativa",
  INDEFINIDO: "Classificar à mão",
};

const COR_VIA: Record<Via, string> = {
  PROVIDENCIA_EXTERNA: "bg-orange-100 text-orange-800",
  RERRATIFICACAO: "bg-purple-100 text-purple-800",
  REQUERIMENTO: "bg-blue-100 text-blue-800",
  JUNTADA: "bg-emerald-100 text-emerald-800",
  ATA_RETIFICATIVA: "bg-amber-100 text-amber-800",
  INDEFINIDO: "bg-muted text-muted-foreground",
};

interface ArquivoCaso {
  id: number;
  file: File;
  nome: string;
  texto: string;
  fonte: Fonte;
  papel: Papel | "ignorar";
  tipo: string | null;
}

const ROTULO_PAPEL: Record<Papel | "ignorar", string> = {
  nota: "Nota devolutiva",
  traslado: "Traslado do ato",
  documento: "Documento do caso",
  ignorar: "Ignorar",
};

type PreviewNota =
  | { tipo: "paginas"; urls: string[] }
  | { tipo: "imagem"; url: string }
  | { tipo: "texto"; texto: string };

interface Minuta {
  texto: string;
  blob: Blob;
  nome: string;
  faltando: string[];
}

// ---------------------------------------------------------------------------

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NotasPage() {
  // --- pasta do caso ---
  const [arquivos, setArquivos] = React.useState<ArquivoCaso[]>([]);
  const [indexando, setIndexando] = React.useState(false);
  const [progresso, setProgresso] = React.useState("");
  const [arrastando, setArrastando] = React.useState(false);
  const [notaPreview, setNotaPreview] = React.useState<PreviewNota | null>(
    null
  );
  const pastaInputRef = React.useRef<HTMLInputElement>(null);
  const arquivosInputRef = React.useRef<HTMLInputElement>(null);

  // --- nota devolutiva ---
  const [notaTexto, setNotaTexto] = React.useState("");
  const [notaFonte, setNotaFonte] = React.useState<Fonte | null>(null);
  const [prazo, setPrazo] = React.useState("");
  const [prenotacao, setPrenotacao] = React.useState("");
  const [serventia, setServentia] = React.useState("");
  const [itens, setItens] = React.useState<ItemTriado[]>([]);

  // --- traslado (fonte interna das qualificações; sem card próprio) ---
  const [traslado, setTraslado] = React.useState<DadosTraslado | null>(null);

  // --- resolução / minuta ---
  const [itemPecaId, setItemPecaId] = React.useState<number | null>(null);
  const [gerando, setGerando] = React.useState(false);
  const [redigindo, setRedigindo] = React.useState(false);
  const [minuta, setMinuta] = React.useState<Minuta | null>(null);
  const [baixandoDoc, setBaixandoDoc] = React.useState<number | null>(null);
  const [ata, setAta] = React.useState<EntradaAta>({
    dataAto: "",
    artigoNscgj: "53",
    provimentos: "40/2012",
    naturezaErro: "o erro material",
    especieEscritura: "",
    teorRetificacao: "",
    amparoDocumental: "",
    subscritor: "",
  });
  const [req, setReq] = React.useState<EntradaRequerimento>({
    serventia: "",
    qualificacao: "",
    verbo: "requerer",
    referencia: "",
    objeto: "",
    blocoExtra: "",
    data: "",
    assinante: "",
  });
  const [rerrat, setRerrat] = React.useState<EntradaRerratificacao>({
    dataAto: "",
    sintese: "",
    blocoLapso: "",
    blocoCorrecao: "",
    prenotacao: "",
    serventia: "",
    tabeliao: "",
  });

  function triarDe(texto: string) {
    const classificados = triar(texto);
    setItens(
      classificados.map((c, i) => ({
        ...c,
        id: i,
        viaEscolhida: c.via,
        confirmado: false,
        status: "pendente",
      }))
    );
    setItemPecaId(null);
    setMinuta(null);
    return classificados.length;
  }

  // Aplica o texto de um arquivo como nota devolutiva: preenche os campos que
  // a própria nota declara e roda a triagem.
  function aplicarNota(texto: string, fonte: Fonte) {
    setNotaTexto(texto);
    setNotaFonte(fonte);
    const pren = extrairPrenotacao(texto);
    if (pren) setPrenotacao(pren);
    const pz = extrairPrazo(texto);
    if (pz) setPrazo(pz);
    const sv = extrairServentia(texto);
    if (sv) setServentia(sv);
    return triarDe(texto);
  }

  async function gerarPreviewNota(a: ArquivoCaso) {
    try {
      if (/\.pdf$/i.test(a.nome)) {
        const urls = await renderPdfThumbnails(a.file, 10, 700);
        setNotaPreview({ tipo: "paginas", urls });
        return;
      }
      if (/\.(jpe?g|png|webp|bmp|gif)$/i.test(a.nome)) {
        setNotaPreview({ tipo: "imagem", url: URL.createObjectURL(a.file) });
        return;
      }
      setNotaPreview(a.texto ? { tipo: "texto", texto: a.texto } : null);
    } catch {
      setNotaPreview(a.texto ? { tipo: "texto", texto: a.texto } : null);
    }
  }

  function aplicarTraslado(texto: string, fonte: Fonte) {
    const fonteTraslado: DadosTraslado["fonte"] =
      fonte === "imagem" || fonte === "outro"
        ? "pdf-escaneado"
        : (fonte as DadosTraslado["fonte"]);
    setTraslado(lerTraslado(texto, fonteTraslado));
  }

  async function processarPasta(files: File[]) {
    const uteis = files.filter((f) => !f.name.startsWith("."));
    if (uteis.length === 0) return;
    setIndexando(true);
    setProgresso("");
    try {
      // 1. texto barato de todos (sem OCR)
      const lidos: ArquivoCaso[] = [];
      for (let i = 0; i < uteis.length; i++) {
        setProgresso(`Lendo ${i + 1} de ${uteis.length}: ${uteis[i].name}`);
        const { texto, fonte } = await textoBarato(uteis[i]);
        lidos.push({
          id: i,
          file: uteis[i],
          nome: uteis[i].name,
          texto,
          fonte,
          papel: "documento",
          tipo: null,
        });
      }

      // 2. papéis: quem é a nota, quem é o traslado, o que é acervo
      const papeis = distribuirPapeis(
        lidos.map((a) => ({ nome: a.nome, texto: a.texto }))
      );
      papeis.forEach((p, i) => {
        lidos[i].papel = p;
        if (p === "documento") {
          lidos[i].tipo = tipoDoDocumento(lidos[i].nome, lidos[i].texto);
        }
      });

      // 3. nota escaneada: OCR só dela (essencial e cara)
      const nota = lidos.find((a) => a.papel === "nota");
      if (nota && !nota.texto && nota.fonte === "pdf-escaneado") {
        const paginas = await readPdfPageTexts(nota.file, 20, (p, t) =>
          setProgresso(`OCR da nota — ${p} de ${t} páginas…`)
        );
        nota.texto = paginas.join("\n");
        toast.warning("Nota escaneada — texto veio de OCR", {
          description:
            "Confira o texto extraído antes de confiar na triagem: OCR erra números e datas.",
        });
      }

      setArquivos(lidos);

      // 4. resolução automática
      const trasladoArq = lidos.find((a) => a.papel === "traslado");
      if (trasladoArq) aplicarTraslado(trasladoArq.texto, trasladoArq.fonte);
      if (nota) await gerarPreviewNota(nota);
      if (nota && nota.texto) {
        const n = aplicarNota(nota.texto, nota.fonte);
        toast.success(
          `Pasta indexada: ${lidos.length} arquivo(s), ${n} exigência(s) na nota` +
            (trasladoArq ? `, traslado “${trasladoArq.nome}”` : "")
        );
      } else {
        toast.info(
          "Pasta indexada, mas a nota devolutiva não foi identificada. " +
            "Marque abaixo qual arquivo é a nota, ou cole o texto dela."
        );
      }
    } catch (err) {
      toast.error("Não foi possível indexar a pasta", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIndexando(false);
      setProgresso("");
    }
  }

  async function mudarPapel(a: ArquivoCaso, papel: Papel | "ignorar") {
    setArquivos((prev) =>
      prev.map((x) =>
        x.id === a.id
          ? {
              ...x,
              papel,
              tipo:
                papel === "documento"
                  ? tipoDoDocumento(x.nome, x.texto)
                  : x.tipo,
            }
          : papel !== "documento" && papel !== "ignorar" && x.papel === papel
            ? { ...x, papel: "documento", tipo: tipoDoDocumento(x.nome, x.texto) }
            : x
      )
    );
    if (papel === "nota") {
      let texto = a.texto;
      if (!texto && a.fonte === "pdf-escaneado") {
        setIndexando(true);
        try {
          const paginas = await readPdfPageTexts(a.file, 20, (p, t) =>
            setProgresso(`OCR da nota — ${p} de ${t} páginas…`)
          );
          texto = paginas.join("\n");
          setArquivos((prev) =>
            prev.map((x) => (x.id === a.id ? { ...x, texto } : x))
          );
        } catch (err) {
          toast.error("Não foi possível ler a nota", {
            description: err instanceof Error ? err.message : String(err),
          });
        } finally {
          setIndexando(false);
          setProgresso("");
        }
      }
      await gerarPreviewNota({ ...a, texto });
      if (texto) aplicarNota(texto, a.fonte);
    }
    if (papel === "traslado") aplicarTraslado(a.texto, a.fonte);
  }

  function mudarItem(id: number, patch: Partial<ItemTriado>) {
    setItens((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }

  const documentosDoCaso = arquivos.filter((a) => a.papel === "documento");

  // Casa uma exigência de juntada com o acervo: os nomes de `alvos` e os
  // tipos do índice usam o mesmo vocabulário; documento pessoal é filtrado
  // pelas partes citadas no item.
  function encontrarNaPasta(alvo: string, pessoas: string[]): ArquivoCaso[] {
    return casarComPasta(alvo, pessoas, documentosDoCaso);
  }

  async function baixarParaAssinatura(doc: ArquivoCaso, itemRef: string) {
    setBaixandoDoc(doc.id);
    try {
      const r = await documentoParaAssinatura(doc.file);
      triggerDownload(r.blob, `item ${itemRef} - ${r.nome}`);
      toast.success(
        r.convertido
          ? "Documento convertido para PDF/A — pronto para o Assinador ONR."
          : "PDF baixado intocado (pode conter assinatura prévia)."
      );
    } catch (err) {
      toast.error("Não foi possível preparar o documento", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBaixandoDoc(null);
    }
  }

  const itemPeca = itens.find((it) => it.id === itemPecaId) ?? null;
  const tipoPeca: TipoPeca | null = itemPeca
    ? pecaDaVia(itemPeca.viaEscolhida)
    : null;

  // Amparo documental sugerido para a ata: documento da pasta que casa com os
  // alvos do item.
  const amparoSugerido =
    tipoPeca === "ata" && itemPeca
      ? (itemPeca.alvos.flatMap((alvo) =>
          encontrarNaPasta(alvo, itemPeca.pessoas)
        )[0] ?? null)
      : null;

  // Trava de segurança: sem amparo documental declarado, a ata não é gerada —
  // sem lastro, a ata não se sustenta.
  const ataSemAmparo = tipoPeca === "ata" && !ata.amparoDocumental.trim();

  // Redação assistida (Gemini): a IA sugere o conteúdo dos campos VAZIOS da
  // peça — os templates .docx não são alterados e campo já preenchido pelo
  // operador nunca é sobrescrito.
  async function redigirComIa() {
    if (!itemPeca || !tipoPeca) return;
    setRedigindo(true);
    try {
      const camposAtuais: Record<string, string> =
        tipoPeca === "ata"
          ? {
              teorRetificacao: ata.teorRetificacao,
              naturezaErro: ata.naturezaErro,
              especieEscritura: ata.especieEscritura,
              amparoDocumental: ata.amparoDocumental,
            }
          : tipoPeca === "requerimento"
            ? {
                objeto: req.objeto,
                blocoExtra: req.blocoExtra,
                referencia: req.referencia,
                verbo: req.verbo,
              }
            : {
                sintese: rerrat.sintese,
                blocoLapso: rerrat.blocoLapso,
                blocoCorrecao: rerrat.blocoCorrecao,
              };

      const resp = await fetch("/api/notas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          peca: tipoPeca,
          contexto: {
            exigencia: itemPeca.texto,
            serventia: serventia || undefined,
            prenotacao: prenotacao || undefined,
            traslado: traslado
              ? {
                  especie: traslado.especie,
                  data: traslado.data,
                  livro: traslado.traslado?.livro,
                  fls: traslado.traslado?.fls,
                  partes: traslado.partesTitulo,
                  sintese: traslado.sinteseSugerida,
                  qualificacoes: traslado.qualificacoes,
                  confiavel: traslado.confiavel,
                }
              : undefined,
            documentos: documentosDoCaso.map((d) => ({
              nome: d.nome,
              tipo: d.tipo,
            })),
            camposAtuais,
          },
        }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(data.error ?? `HTTP ${resp.status}`);
      }
      const campos: Record<string, string> = data.campos ?? {};

      // Só entra em campo vazio.
      const novos: Record<string, string> = {};
      for (const [k, v] of Object.entries(campos)) {
        if (v && !(camposAtuais[k] ?? "").trim()) novos[k] = v;
      }
      if (tipoPeca === "ata") setAta((prev) => ({ ...prev, ...novos }));
      else if (tipoPeca === "requerimento")
        setReq((prev) => ({ ...prev, ...novos }));
      else setRerrat((prev) => ({ ...prev, ...novos }));

      const n = Object.keys(novos).length;
      if (n === 0) {
        toast.info("A IA não teve base para preencher os campos vazios.", {
          description:
            "Os campos já preenchidos por você nunca são sobrescritos.",
        });
      } else {
        toast.success(`A IA redigiu ${n} campo(s) — revise antes de gerar.`, {
          description:
            "Sugestão de rascunho: confira cada campo. O template da peça não foi alterado.",
        });
      }
    } catch (err) {
      toast.error("Não foi possível redigir com a IA", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRedigindo(false);
    }
  }

  async function gerarMinuta() {
    if (!itemPeca || !tipoPeca) return;
    setGerando(true);
    try {
      const resp = await fetch(TEMPLATES[tipoPeca]);
      if (!resp.ok) throw new Error("Template não encontrado.");
      const template = await resp.arrayBuffer();
      const dados =
        tipoPeca === "ata"
          ? dadosAta(traslado, ata)
          : tipoPeca === "requerimento"
            ? dadosRequerimento({
                ...req,
                serventia: req.serventia || serventia,
              })
            : dadosRerratificacao(traslado, {
                ...rerrat,
                prenotacao: rerrat.prenotacao || prenotacao,
                serventia: rerrat.serventia || serventia,
              });
      const { blob, faltando } = await fillDocxTemplate(template, dados);
      const texto = await extractDocxText(blob);
      setMinuta({
        texto,
        blob,
        nome: `RASCUNHO - ${NOMES_PECA[tipoPeca]} - item ${itemPeca.ref}.docx`,
        faltando,
      });
      mudarItem(itemPeca.id, { status: "em_preparo" });
      if (faltando.length > 0) {
        toast.warning(
          `Minuta gerada com ${faltando.length} campo(s) sem dado`,
          {
            description:
              "Os placeholders ficaram visíveis — preencha antes de usar.",
          }
        );
      }
    } catch (err) {
      toast.error("Não foi possível gerar a minuta", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGerando(false);
    }
  }

  const notaIdentificada = arquivos.some((a) => a.papel === "nota");

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
          Resolvedor de Notas Devolutivas
        </h1>
        <p className="text-muted-foreground">
          Envie a pasta do caso completa: a nota devolutiva, o traslado da
          escritura e os documentos são identificados automaticamente e a
          resolução de cada exigência já sai montada.
        </p>
      </header>

      <Alert>
        <FileWarning className="size-4" />
        <AlertTitle>A saída é sempre rascunho</AlertTitle>
        <AlertDescription>
          Nada é lavrado automaticamente. A via sugerida para cada exigência
          precisa ser confirmada por você antes de gerar a minuta, e campos sem
          dado permanecem como {"{{PLACEHOLDER}}"} visível no documento.
        </AlertDescription>
      </Alert>

      {/* ------------------------------------------------ 1. Pasta do Caso */}
      <Card>
        <CardHeader>
          <CardTitle>1. Pasta do Caso</CardTitle>
          <CardDescription>
            Arraste a pasta inteira (nota devolutiva, traslado em .docx e os
            demais documentos). Cada arquivo é identificado pelo nome e pelo
            conteúdo; o prazo, a prenotação e a serventia são lidos da própria
            nota.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            role="button"
            tabIndex={0}
            aria-label="Enviar a pasta do caso"
            onClick={() => pastaInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                pastaInputRef.current?.click();
              }
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setArrastando(true);
            }}
            onDragLeave={() => setArrastando(false)}
            onDrop={async (e) => {
              e.preventDefault();
              setArrastando(false);
              const files = await filesFromDataTransfer(e.dataTransfer);
              await processarPasta(files);
            }}
            className={`flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
              arrastando
                ? "border-primary bg-accent/40"
                : "border-muted-foreground/25 hover:bg-accent/20"
            }`}
          >
            {indexando ? (
              <Loader2 className="size-8 animate-spin text-muted-foreground" />
            ) : (
              <FolderOpen className="size-8 text-muted-foreground" />
            )}
            <p className="font-medium">
              {indexando
                ? progresso || "Indexando…"
                : "Arraste a pasta do caso aqui"}
            </p>
            {!indexando && (
              <p className="text-sm text-muted-foreground">
                ou clique para selecionar a pasta
              </p>
            )}
          </div>
          <input
            ref={pastaInputRef}
            type="file"
            // @ts-expect-error webkitdirectory é fora do padrão mas universal
            webkitdirectory=""
            multiple
            className="hidden"
            onChange={async (e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              await processarPasta(files);
            }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              disabled={indexando}
              onClick={() => arquivosInputRef.current?.click()}
            >
              <FileText className="size-3.5" />
              Ou escolher arquivos avulsos
            </Button>
            <input
              ref={arquivosInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp,.bmp"
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                await processarPasta(files);
              }}
            />
          </div>

          {arquivos.length > 0 && (
            <div className="space-y-1.5">
              {arquivos.map((a) => (
                <div
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  {a.papel === "nota" ? (
                    <FileWarning className="size-4 shrink-0 text-red-600" />
                  ) : a.papel === "traslado" ? (
                    <ScrollText className="size-4 shrink-0 text-purple-600" />
                  ) : (
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1 truncate" title={a.nome}>
                    {a.nome}
                  </span>
                  {a.papel === "documento" && a.tipo && (
                    <Badge variant="secondary">{a.tipo}</Badge>
                  )}
                  {a.fonte === "pdf-escaneado" && (
                    <Badge variant="outline">escaneado</Badge>
                  )}
                  <Select
                    items={ROTULO_PAPEL}
                    value={a.papel}
                    onValueChange={(v) => mudarPapel(a, v as Papel | "ignorar")}
                  >
                    <SelectTrigger size="sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.keys(ROTULO_PAPEL) as Array<Papel | "ignorar">
                      ).map((p) => (
                        <SelectItem key={p} value={p}>
                          {ROTULO_PAPEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}

          {arquivos.length > 0 && !notaIdentificada && !notaTexto && (
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="size-4 text-amber-600" />
              <AlertTitle className="text-amber-800">
                Nota devolutiva não identificada
              </AlertTitle>
              <AlertDescription className="text-amber-700">
                Marque acima qual arquivo é a nota (menu à direita) ou cole o
                texto dela no campo abaixo.
              </AlertDescription>
            </Alert>
          )}

          {notaPreview && (
            <details open className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                <Eye className="mr-1 inline size-3.5" />
                Pré-visualização da nota de exigência identificada
              </summary>
              <div className="mt-3 max-h-[28rem] space-y-3 overflow-y-auto rounded-md bg-muted/40 p-3">
                {notaPreview.tipo === "paginas" &&
                  notaPreview.urls.map((u, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={u}
                      alt={`Página ${i + 1} da nota devolutiva`}
                      className="mx-auto w-full max-w-xl border bg-white shadow-sm"
                    />
                  ))}
                {notaPreview.tipo === "imagem" && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={notaPreview.url}
                    alt="Nota devolutiva"
                    className="mx-auto w-full max-w-xl border bg-white shadow-sm"
                  />
                )}
                {notaPreview.tipo === "texto" && (
                  <pre className="whitespace-pre-wrap font-mono text-xs">
                    {notaPreview.texto}
                  </pre>
                )}
              </div>
            </details>
          )}

          <details
            className="space-y-3"
            open={!notaIdentificada && arquivos.length === 0}
          >
            <summary className="cursor-pointer text-sm text-muted-foreground">
              Texto da nota devolutiva (conferir ou colar manualmente)
            </summary>
            <Textarea
              value={notaTexto}
              onChange={(e) => setNotaTexto(e.target.value)}
              rows={8}
              placeholder={
                "Cole aqui o texto da nota devolutiva…\n\n1) Apresentar a certidão atualizada de casamento…\n2) O item VENDEDORA deverá ser retificado para constar…"
              }
              className="mt-2 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              disabled={!notaTexto.trim()}
              onClick={() => {
                const n = aplicarNota(notaTexto, notaFonte ?? "texto");
                if (n === 0)
                  toast.info("Nenhum item de exigência encontrado no texto.");
              }}
            >
              <FileText className="size-3.5" />
              Triar este texto
            </Button>
          </details>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="prazo">Prazo da prenotação</Label>
              <Input
                id="prazo"
                value={prazo}
                onChange={(e) => setPrazo(e.target.value)}
                placeholder="ex.: válida até 18/08/2026"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="prenotacao">Nº da prenotação</Label>
              <Input
                id="prenotacao"
                value={prenotacao}
                onChange={(e) => setPrenotacao(e.target.value)}
                placeholder="ex.: 4.720"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="serventia">Serventia</Label>
              <Input
                id="serventia"
                value={serventia}
                onChange={(e) => setServentia(e.target.value)}
                placeholder="ex.: 1º Registro Imobiliário de Guarulhos/SP"
              />
            </div>
          </div>

          {prazo.trim() && (
            <Alert className="border-red-200 bg-red-50">
              <Clock className="size-4 text-red-600" />
              <AlertTitle className="text-red-800">
                Prenotação: {prazo}
              </AlertTitle>
              <AlertDescription className="text-red-700">
                Prenotação perdida significa refazer o protocolo e perder a
                prioridade. Nada compete com este prazo.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* ------------------------------------------------ 2. Exigências */}
      {itens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Exigências</CardTitle>
            <CardDescription>
              A nota, sintetizada: {itens.length} exigência(s), cada uma com a
              via de resolução sugerida. O status é por item, não por nota.
              Confirme a via de cada item para liberar a resolução na etapa 3.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {itens.map((it) => {
              const s = sintetizar(it);
              return (
                <div key={it.id} className="space-y-2 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">item {it.ref}</Badge>
                    <Badge className={COR_VIA[it.viaEscolhida]}>
                      {ROTULO_VIA[it.viaEscolhida]}
                    </Badge>
                    <span className="ml-auto" />
                    <Select
                      items={ROTULO_VIA}
                      value={it.viaEscolhida}
                      onValueChange={(v) =>
                        mudarItem(it.id, {
                          viaEscolhida: v as Via,
                          confirmado: false,
                        })
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(ROTULO_VIA) as Via[]).map((v) => (
                          <SelectItem key={v} value={v}>
                            {ROTULO_VIA[v]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      items={STATUS}
                      value={it.status}
                      onValueChange={(v) =>
                        mudarItem(it.id, { status: v as StatusItem })
                      }
                    >
                      <SelectTrigger size="sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS) as StatusItem[]).map((st) => (
                          <SelectItem key={st} value={st}>
                            {STATUS[st]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-sm font-medium">{s.acao}</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
                    <li>{s.complemento}</li>
                    {it.pessoas.map((p) => (
                      <li key={p}>Parte citada: {p}</li>
                    ))}
                    {it.alvos.map((alvo) => {
                      const achados = encontrarNaPasta(alvo, it.pessoas);
                      return (
                        <li
                          key={alvo}
                          className={
                            achados.length > 0
                              ? "text-emerald-700"
                              : "text-red-600"
                          }
                        >
                          {achados.length > 0
                            ? `${alvo} — na pasta: ${achados
                                .map((d) => `“${d.nome}”`)
                                .join(", ")}`
                            : `${alvo} — não encontrado na pasta (obter/reemitir)`}
                        </li>
                      );
                    })}
                  </ul>

                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      Ver texto original da nota
                    </summary>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {it.texto}
                    </p>
                  </details>

                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={it.confirmado}
                      onCheckedChange={(c) =>
                        mudarItem(it.id, { confirmado: c === true })
                      }
                    />
                    Confirmo a via de resolução deste item
                  </label>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* --------------------------------- 3. Resolvendo as Exigências */}
      {itens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Resolvendo as Exigências</CardTitle>
            <CardDescription>
              Juntada: o documento sai da pasta em PDF/A, pronto para assinar
              no Assinador ONR e reingressar na ONR – RI Digital. Demais vias:
              a minuta da peça é montada aqui.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {itens.map((it) => {
              const peca = pecaDaVia(it.viaEscolhida);
              return (
                <div key={it.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">item {it.ref}</Badge>
                    <Badge className={COR_VIA[it.viaEscolhida]}>
                      {ROTULO_VIA[it.viaEscolhida]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {STATUS[it.status]}
                    </span>
                  </div>

                  {/* ------------------------ juntada: documento da pasta */}
                  {it.viaEscolhida === "JUNTADA" && (
                    <div className="space-y-2">
                      {it.alvos.length === 0 && (
                        <p className="text-sm text-muted-foreground">
                          Nenhum documento específico reconhecido no texto —
                          identifique o documento pedido e junte-o pela pasta.
                        </p>
                      )}
                      {it.alvos.map((alvo) => {
                        const achados = encontrarNaPasta(alvo, it.pessoas);
                        if (achados.length === 0) {
                          return (
                            <p
                              key={alvo}
                              className="flex items-center gap-1.5 text-sm text-red-600"
                            >
                              <XCircle className="size-4 shrink-0" />
                              {alvo}: não está na pasta — obter/reemitir antes
                              de assinar.
                            </p>
                          );
                        }
                        return achados.map((doc) => (
                          <div
                            key={`${alvo}-${doc.id}`}
                            className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm"
                          >
                            <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                            <span
                              className="min-w-0 flex-1 truncate"
                              title={doc.nome}
                            >
                              {doc.nome}
                            </span>
                            <Badge variant="secondary">{alvo}</Badge>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={baixandoDoc === doc.id}
                              onClick={() => baixarParaAssinatura(doc, it.ref)}
                            >
                              {baixandoDoc === doc.id ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Download className="size-3.5" />
                              )}
                              Baixar PDF/A
                            </Button>
                          </div>
                        ));
                      })}
                      <p className="text-xs text-muted-foreground">
                        Assine o PDF no{" "}
                        <a
                          href="https://assinador.onr.org.br"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-0.5 underline hover:text-foreground"
                        >
                          Assinador ONR
                          <ExternalLink className="size-3" />
                        </a>{" "}
                        e reingresse o título pela plataforma ONR – RI Digital.
                      </p>
                    </div>
                  )}

                  {/* ------------------------ providência externa */}
                  {it.viaEscolhida === "PROVIDENCIA_EXTERNA" && (
                    <p className="text-sm text-orange-700">
                      Depende de ato de terceiro ou de outro protocolo — não se
                      resolve com peça nossa. É a via que mais atrasa e mais
                      escapa do radar: use o status “Aguardando terceiro” e
                      acompanhe em separado.
                    </p>
                  )}

                  {/* ------------------------ indefinido */}
                  {it.viaEscolhida === "INDEFINIDO" && (
                    <p className="text-sm text-muted-foreground">
                      Nenhum gatilho conhecido — classifique a via manualmente
                      na etapa 2 para liberar a resolução.
                    </p>
                  )}

                  {/* ------------------------ vias com peça: minuta */}
                  {peca && !it.confirmado && (
                    <p className="text-sm text-muted-foreground">
                      Confirme a via na etapa 2 para preparar a minuta de{" "}
                      {NOMES_PECA[peca]}.
                    </p>
                  )}
                  {peca && it.confirmado && itemPecaId !== it.id && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setItemPecaId(it.id);
                        setMinuta(null);
                      }}
                    >
                      <ScrollText className="size-3.5" />
                      Preparar minuta de {NOMES_PECA[peca]}
                    </Button>
                  )}

                  {peca && it.confirmado && itemPecaId === it.id && (
                    <div className="space-y-4 border-t pt-3">
                      {tipoPeca === "ata" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="campo-data-da-ata">
                              Data da ata (dd/mm/aaaa)
                            </Label>
                            <Input
                              id="campo-data-da-ata"
                              value={ata.dataAto}
                              onChange={(e) =>
                                setAta({ ...ata, dataAto: e.target.value })
                              }
                              placeholder="09/08/2026"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label>Artigo NSCGJ</Label>
                            <Select
                              items={{
                                "53": "53 — qualificação de pessoa",
                                "54": "54 — descrição de bem",
                              }}
                              value={ata.artigoNscgj}
                              onValueChange={(v) =>
                                setAta({
                                  ...ata,
                                  artigoNscgj: v as "53" | "54",
                                })
                              }
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="53">
                                  53 — qualificação de pessoa
                                </SelectItem>
                                <SelectItem value="54">
                                  54 — descrição de bem
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-provimentos">
                              Provimentos
                            </Label>
                            <Input
                              id="campo-provimentos"
                              value={ata.provimentos}
                              onChange={(e) =>
                                setAta({ ...ata, provimentos: e.target.value })
                              }
                              placeholder="40/2012 ou 40/2012 e 7/2013"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-natureza-do-erro">
                              Natureza do erro
                            </Label>
                            <Input
                              id="campo-natureza-do-erro"
                              value={ata.naturezaErro}
                              onChange={(e) =>
                                setAta({ ...ata, naturezaErro: e.target.value })
                              }
                              placeholder="o erro material / ao erro de redação"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-especie-da-escritura">
                              Espécie da escritura
                            </Label>
                            <Input
                              id="campo-especie-da-escritura"
                              value={ata.especieEscritura}
                              onChange={(e) =>
                                setAta({
                                  ...ata,
                                  especieEscritura: e.target.value,
                                })
                              }
                              placeholder={
                                traslado?.especie ??
                                "Escritura de Venda e Compra"
                              }
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-teor-da-retificacao">
                              Teor da retificação
                            </Label>
                            <Textarea
                              id="campo-teor-da-retificacao"
                              rows={3}
                              value={ata.teorRetificacao}
                              onChange={(e) =>
                                setAta({
                                  ...ata,
                                  teorRetificacao: e.target.value,
                                })
                              }
                              placeholder="onde constou X, deve constar Y…"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-amparo-documental">
                              Amparo documental{" "}
                              <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="campo-amparo-documental"
                              value={ata.amparoDocumental}
                              onChange={(e) =>
                                setAta({
                                  ...ata,
                                  amparoDocumental: e.target.value,
                                })
                              }
                              placeholder="ex.: Certidão de Casamento arquivada nestas notas"
                            />
                            {amparoSugerido &&
                              !ata.amparoDocumental.trim() && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() =>
                                    setAta({
                                      ...ata,
                                      amparoDocumental: `${amparoSugerido.tipo} arquivada na pasta do processo (arquivo: ${amparoSugerido.nome})`,
                                    })
                                  }
                                >
                                  <CheckCircle2 className="size-3.5" />
                                  Usar da pasta: {amparoSugerido.nome}
                                </Button>
                              )}
                            <p className="text-xs text-muted-foreground">
                              A ata precisa declarar em que documento arquivado
                              se apoia. Sem amparo documental, a via da ata não
                              se sustenta — e a minuta não é gerada.
                              {!amparoSugerido &&
                                documentosDoCaso.length > 0 &&
                                " Nenhum documento de amparo foi localizado na pasta para este item."}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-subscritor">Subscritor</Label>
                            <Input
                              id="campo-subscritor"
                              value={ata.subscritor}
                              onChange={(e) =>
                                setAta({ ...ata, subscritor: e.target.value })
                              }
                              placeholder="nome de quem subscreve a ata"
                            />
                          </div>
                        </div>
                      )}

                      {tipoPeca === "requerimento" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label htmlFor="campo-serventia-destinataria">
                              Serventia destinatária
                            </Label>
                            <Input
                              id="campo-serventia-destinataria"
                              value={req.serventia}
                              onChange={(e) =>
                                setReq({ ...req, serventia: e.target.value })
                              }
                              placeholder={
                                serventia || "1º Registro Imobiliário de…"
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-verbo">Verbo</Label>
                            <Input
                              id="campo-verbo"
                              value={req.verbo}
                              onChange={(e) =>
                                setReq({ ...req, verbo: e.target.value })
                              }
                              placeholder="requerer / solicitar / expor"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-qualificacao-do-requerente">
                              Qualificação do requerente
                            </Label>
                            <Textarea
                              id="campo-qualificacao-do-requerente"
                              rows={3}
                              value={req.qualificacao}
                              onChange={(e) =>
                                setReq({ ...req, qualificacao: e.target.value })
                              }
                              placeholder={
                                traslado?.qualificacoes
                                  ? "cole aqui a qualificação (o traslado carregado tem o bloco completo)"
                                  : "NOME, nacionalidade, RG…, inscrito no CPF/MF sob nº…"
                              }
                            />
                            {traslado?.qualificacoes && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  setReq({
                                    ...req,
                                    qualificacao: traslado.qualificacoes ?? "",
                                  })
                                }
                              >
                                Usar qualificações do traslado
                              </Button>
                            )}
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-referencia">
                              Referência (opcional)
                            </Label>
                            <Input
                              id="campo-referencia"
                              value={req.referencia}
                              onChange={(e) =>
                                setReq({ ...req, referencia: e.target.value })
                              }
                              placeholder=", em resposta à nota devolutiva nº…"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-data">Data (dd/mm/aaaa)</Label>
                            <Input
                              id="campo-data"
                              value={req.data}
                              onChange={(e) =>
                                setReq({ ...req, data: e.target.value })
                              }
                              placeholder="09/08/2026"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-objeto-do-requerimento">
                              Objeto do requerimento
                            </Label>
                            <Textarea
                              id="campo-objeto-do-requerimento"
                              rows={3}
                              value={req.objeto}
                              onChange={(e) =>
                                setReq({ ...req, objeto: e.target.value })
                              }
                              placeholder="o que se requer, em uma frase"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-bloco-extra">
                              Bloco extra (DOS FATOS / esclarecimentos —
                              opcional)
                            </Label>
                            <Textarea
                              id="campo-bloco-extra"
                              rows={3}
                              value={req.blocoExtra}
                              onChange={(e) =>
                                setReq({ ...req, blocoExtra: e.target.value })
                              }
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-assinante">Assinante</Label>
                            <Input
                              id="campo-assinante"
                              value={req.assinante}
                              onChange={(e) =>
                                setReq({ ...req, assinante: e.target.value })
                              }
                              placeholder="nome de quem assina"
                            />
                          </div>
                        </div>
                      )}

                      {tipoPeca === "rerratificacao" && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          {!traslado && (
                            <Alert className="sm:col-span-2">
                              <AlertTriangle className="size-4" />
                              <AlertTitle>
                                Carregue o traslado do ato
                              </AlertTitle>
                              <AlertDescription>
                                As qualificações e a identificação do ato saem
                                do traslado, sem redigitação. Sem ele, esses
                                campos ficarão como placeholders. Marque o
                                arquivo do traslado na pasta do caso (etapa 1).
                              </AlertDescription>
                            </Alert>
                          )}
                          <div className="space-y-1">
                            <Label htmlFor="campo-data-do-novo-ato">
                              Data do novo ato (dd/mm/aaaa)
                            </Label>
                            <Input
                              id="campo-data-do-novo-ato"
                              value={rerrat.dataAto}
                              onChange={(e) =>
                                setRerrat({
                                  ...rerrat,
                                  dataAto: e.target.value,
                                })
                              }
                              placeholder="09/08/2026"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-tabeliao">Tabelião</Label>
                            <Input
                              id="campo-tabeliao"
                              value={rerrat.tabeliao}
                              onChange={(e) =>
                                setRerrat({
                                  ...rerrat,
                                  tabeliao: e.target.value,
                                })
                              }
                              placeholder="nome do tabelião"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-sintese-do-ato">
                              Síntese do ato (item I)
                            </Label>
                            <Textarea
                              id="campo-sintese-do-ato"
                              rows={3}
                              value={rerrat.sintese}
                              onChange={(e) =>
                                setRerrat({
                                  ...rerrat,
                                  sintese: e.target.value,
                                })
                              }
                              placeholder={
                                traslado?.sinteseSugerida ??
                                "o primeiro nomeado, vendeu ao segundo nomeado pelo valor de…"
                              }
                            />
                            {traslado?.sinteseSugerida && (
                              <p className="text-xs text-muted-foreground">
                                Vazio = usa a síntese derivada do quadro-resumo
                                do traslado.
                              </p>
                            )}
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-bloco-do-lapso">
                              Bloco do lapso (item II — o que constou errado)
                            </Label>
                            <Textarea
                              id="campo-bloco-do-lapso"
                              rows={3}
                              value={rerrat.blocoLapso}
                              onChange={(e) =>
                                setRerrat({
                                  ...rerrat,
                                  blocoLapso: e.target.value,
                                })
                              }
                              placeholder="Entretanto, por um lapso, constou erroneamente naquela escritura que: a) …"
                            />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label htmlFor="campo-bloco-da-correcao">
                              Bloco da correção (item III — pareado com o II)
                            </Label>
                            <Textarea
                              id="campo-bloco-da-correcao"
                              rows={3}
                              value={rerrat.blocoCorrecao}
                              onChange={(e) =>
                                setRerrat({
                                  ...rerrat,
                                  blocoCorrecao: e.target.value,
                                })
                              }
                              placeholder="RETIFICAM aquela escritura, para constar que: a) …"
                            />
                            <p className="text-xs text-muted-foreground">
                              Os itens II e III são pareados um a um: “a)”
                              errado ↔ “a)” correto.
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-prenotacao">Prenotação</Label>
                            <Input
                              id="campo-prenotacao"
                              value={rerrat.prenotacao}
                              onChange={(e) =>
                                setRerrat({
                                  ...rerrat,
                                  prenotacao: e.target.value,
                                })
                              }
                              placeholder={prenotacao || "nº da prenotação"}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label htmlFor="campo-serventia-rerrat">
                              Serventia
                            </Label>
                            <Input
                              id="campo-serventia-rerrat"
                              value={rerrat.serventia}
                              onChange={(e) =>
                                setRerrat({
                                  ...rerrat,
                                  serventia: e.target.value,
                                })
                              }
                              placeholder={serventia || "serventia da nota"}
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2">
                        {ataSemAmparo && (
                          <p className="text-sm font-medium text-destructive">
                            Informe o amparo documental para liberar a geração
                            da ata.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            onClick={redigirComIa}
                            disabled={redigindo || gerando}
                          >
                            {redigindo ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Sparkles className="size-4" />
                            )}
                            Redigir com IA
                          </Button>
                          <Button
                            onClick={gerarMinuta}
                            disabled={gerando || ataSemAmparo}
                          >
                            {gerando ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <Eye className="size-4" />
                            )}
                            {minuta ? "Atualizar minuta" : "Gerar minuta"}
                          </Button>
                          {minuta && (
                            <Button
                              variant="outline"
                              onClick={() =>
                                triggerDownload(minuta.blob, minuta.nome)
                              }
                            >
                              <Download className="size-4" />
                              Baixar .docx
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          A IA (Google Gemini) redige apenas o conteúdo dos
                          campos vazios, a partir da exigência, do traslado e
                          dos documentos da pasta — os templates da ata e da
                          rerratificação não são alterados, campo preenchido
                          por você não é sobrescrito e nada é inventado: sem
                          base, o campo fica em branco.
                        </p>
                        {minuta && (
                          <div className="space-y-2">
                            {minuta.faltando.length > 0 && (
                              <p className="text-xs text-muted-foreground">
                                Campos sem dado (mantidos como placeholder):{" "}
                                {minuta.faltando.join(", ")}
                              </p>
                            )}
                            <div className="max-h-96 overflow-y-auto rounded-md border bg-muted/40 p-4">
                              <p className="whitespace-pre-wrap text-sm">
                                {minuta.texto}
                              </p>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Minuta de conferência — rascunho. Revise antes de
                              qualquer lavratura.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
