"use client";

import * as React from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Clock,
  Download,
  FileText,
  FileWarning,
  Loader2,
  ScrollText,
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
  triar,
  VIAS,
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

// ---------------------------------------------------------------------------
// Extração de texto dos arquivos de entrada

type FontePdf = "pdf-nativo" | "pdf-escaneado";

async function textoDePdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<{ texto: string; fonte: FontePdf }> {
  // Primeiro tenta só a camada nativa (rápido). Se não houver texto de
  // verdade, cai para o caminho com OCR — e marca a fonte como escaneada,
  // porque campo vindo de OCR nasce não confiável.
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const doc = await task.promise;
  try {
    const partes: string[] = [];
    let nativo = true;
    for (let i = 1; i <= Math.min(doc.numPages, 20); i++) {
      const t = await pageNativeText(await doc.getPage(i));
      if (!meaningfulNativeText(t)) {
        nativo = false;
        break;
      }
      partes.push(t);
    }
    if (nativo) return { texto: partes.join("\n"), fonte: "pdf-nativo" };
  } finally {
    await task.destroy();
  }
  const paginas = await readPdfPageTexts(file, 20, onProgress);
  return { texto: paginas.join("\n"), fonte: "pdf-escaneado" };
}

async function textoDeArquivo(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<{ texto: string; fonte: DadosTraslado["fonte"] }> {
  const nome = file.name.toLowerCase();
  if (nome.endsWith(".docx")) {
    return { texto: await extractDocxText(file), fonte: "docx" };
  }
  if (nome.endsWith(".txt")) {
    return { texto: await file.text(), fonte: "texto" };
  }
  if (nome.endsWith(".pdf")) {
    return textoDePdf(file, onProgress);
  }
  throw new Error(
    "Formato não suportado. Use .docx, .pdf ou .txt (arquivos .doc antigos: salve como .docx no Word)."
  );
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

const NOTA_VIA: Record<Via, string> = Object.fromEntries([
  ...VIAS.map((v) => [v.via, v.nota]),
  ["INDEFINIDO", "Nenhum gatilho conhecido. Item vai para triagem manual."],
]) as Record<Via, string>;

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
  // --- nota devolutiva ---
  const [notaTexto, setNotaTexto] = React.useState("");
  const [notaFonte, setNotaFonte] = React.useState<string | null>(null);
  const [lendoNota, setLendoNota] = React.useState(false);
  const [progresso, setProgresso] = React.useState("");
  const [prazo, setPrazo] = React.useState("");
  const [prenotacao, setPrenotacao] = React.useState("");
  const [serventia, setServentia] = React.useState("");
  const [itens, setItens] = React.useState<ItemTriado[]>([]);
  const notaInputRef = React.useRef<HTMLInputElement>(null);

  // --- traslado ---
  const [traslado, setTraslado] = React.useState<DadosTraslado | null>(null);
  const [trasladoNome, setTrasladoNome] = React.useState("");
  const [lendoTraslado, setLendoTraslado] = React.useState(false);
  const trasladoInputRef = React.useRef<HTMLInputElement>(null);

  // --- geração ---
  const [itemPecaId, setItemPecaId] = React.useState<number | null>(null);
  const [gerando, setGerando] = React.useState(false);
  const [faltando, setFaltando] = React.useState<string[]>([]);
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

  async function lerNota(file: File) {
    setLendoNota(true);
    setProgresso("");
    try {
      const { texto, fonte } = await textoDeArquivo(file, (p, t) =>
        setProgresso(`OCR da página ${p} de ${t}…`)
      );
      setNotaTexto(texto);
      setNotaFonte(fonte);
      if (fonte === "pdf-escaneado") {
        toast.warning("Nota escaneada — texto veio de OCR", {
          description:
            "Confira o texto extraído abaixo antes de triar: OCR erra números e datas.",
        });
      }
      // Prenotação e serventia, quando a própria nota as declara.
      const m =
        /prenota[çc][ãa]o\s*(?:sob\s*)?n?[°º]?\s*[.:]?\s*([\d./-]{3,})/i.exec(
          texto
        );
      if (m) setPrenotacao(m[1].replace(/[.,]+$/, ""));
    } catch (err) {
      toast.error("Não foi possível ler a nota", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLendoNota(false);
      setProgresso("");
    }
  }

  function triarNota() {
    const classificados = triar(notaTexto);
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
    if (classificados.length === 0) {
      toast.info("Nenhum item de exigência encontrado no texto.");
    }
  }

  async function lerArquivoTraslado(file: File) {
    setLendoTraslado(true);
    try {
      const { texto, fonte } = await textoDeArquivo(file);
      setTraslado(lerTraslado(texto, fonte));
      setTrasladoNome(file.name);
    } catch (err) {
      toast.error("Não foi possível ler o traslado", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLendoTraslado(false);
    }
  }

  function mudarItem(id: number, patch: Partial<ItemTriado>) {
    setItens((prev) =>
      prev.map((it) => (it.id === id ? { ...it, ...patch } : it))
    );
  }

  const itemPeca = itens.find((it) => it.id === itemPecaId) ?? null;
  const tipoPeca: TipoPeca | null = itemPeca
    ? pecaDaVia(itemPeca.viaEscolhida)
    : null;

  // Trava de segurança: sem amparo documental declarado, a via da ata não é
  // oferecida — sem lastro, a ata não se sustenta.
  const ataSemAmparo = tipoPeca === "ata" && !ata.amparoDocumental.trim();

  async function gerarPeca() {
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
      const { blob, faltando: semDado } = await fillDocxTemplate(
        template,
        dados
      );
      setFaltando(semDado);
      const nome = `RASCUNHO - ${NOMES_PECA[tipoPeca]} - item ${itemPeca.ref}.docx`;
      triggerDownload(blob, nome);
      mudarItem(itemPeca.id, { status: "em_preparo" });
      if (semDado.length > 0) {
        toast.warning(`Minuta gerada com ${semDado.length} campo(s) sem dado`, {
          description:
            "Os placeholders ficaram visíveis no documento — preencha antes de usar.",
        });
      } else {
        toast.success("Minuta gerada — confira antes de qualquer lavratura.");
      }
    } catch (err) {
      toast.error("Não foi possível gerar a minuta", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setGerando(false);
    }
  }

  const confirmaveis = itens.filter(
    (it) => it.confirmado && pecaDaVia(it.viaEscolhida)
  );

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
          Decompõe a nota de exigências em itens, classifica cada um na via de
          resolução e prepara a minuta da peça correspondente.
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

      {/* ------------------------------------------------ 1. nota */}
      <Card>
        <CardHeader>
          <CardTitle>1. Nota devolutiva</CardTitle>
          <CardDescription>
            Envie a nota (PDF, DOCX ou TXT) ou cole o texto. O prazo da
            prenotação deve ser lido na própria nota — as serventias divergem
            (data fixa impressa ou &ldquo;20 dias úteis&rdquo;).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => notaInputRef.current?.click()}
              disabled={lendoNota}
            >
              {lendoNota ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {lendoNota ? progresso || "Lendo…" : "Enviar nota"}
            </Button>
            <input
              ref={notaInputRef}
              type="file"
              accept=".pdf,.docx,.txt"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) lerNota(f);
              }}
            />
            {notaFonte === "pdf-escaneado" && (
              <Badge className="bg-amber-100 text-amber-800">
                <AlertTriangle className="size-3" />
                texto de OCR — conferir
              </Badge>
            )}
          </div>

          <Textarea
            value={notaTexto}
            onChange={(e) => setNotaTexto(e.target.value)}
            rows={8}
            placeholder={
              "Ou cole aqui o texto da nota devolutiva…\n\n1) Apresentar a certidão atualizada de casamento…\n2) O item VENDEDORA deverá ser retificado para constar…"
            }
            className="font-mono text-xs"
          />

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

          <Button onClick={triarNota} disabled={!notaTexto.trim()}>
            <FileText className="size-4" />
            Triar exigências
          </Button>
        </CardContent>
      </Card>

      {/* ------------------------------------------------ 2. triagem */}
      {itens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>2. Triagem das exigências</CardTitle>
            <CardDescription>
              {itens.length} item(ns). O status é por item, não por nota — uma
              nota com 7 itens costuma ter 4 vias diferentes. Confirme a via de
              cada item antes de gerar a peça.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {itens.map((it) => (
              <div key={it.id} className="space-y-2 rounded-lg border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">item {it.ref}</Badge>
                  <Badge className={COR_VIA[it.viaEscolhida]}>
                    {ROTULO_VIA[it.viaEscolhida]}
                  </Badge>
                  {!it.confirmado && it.via !== "INDEFINIDO" && (
                    <span className="text-xs text-muted-foreground">
                      sugerida
                      {it.gatilho ? ` (gatilho: “${it.gatilho}”)` : ""}
                    </span>
                  )}
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
                      {(Object.keys(STATUS) as StatusItem[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <p className="text-sm">{it.texto}</p>

                <p className="text-xs text-muted-foreground">
                  {NOTA_VIA[it.viaEscolhida]}
                </p>

                {(it.pessoas.length > 0 || it.alvos.length > 0) && (
                  <div className="flex flex-wrap gap-1.5">
                    {it.pessoas.map((p) => (
                      <Badge key={p} variant="secondary">
                        {p}
                      </Badge>
                    ))}
                    {it.alvos.map((a) => (
                      <Badge key={a} variant="outline">
                        buscar: {a}
                      </Badge>
                    ))}
                  </div>
                )}

                {it.viaEscolhida === "PROVIDENCIA_EXTERNA" && (
                  <p className="text-xs font-medium text-orange-700">
                    Depende de terceiro — é a via que mais atrasa e mais escapa
                    do radar. Acompanhe em separado.
                  </p>
                )}

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
            ))}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------ 3. traslado */}
      {itens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>3. Traslado do ato</CardTitle>
            <CardDescription>
              Fonte das qualificações e da identificação do ato. Ordem de
              preferência: <strong>.docx do arquivo do cartório</strong> → PDF
              nato-digital → escaneado (só como último recurso: o OCR corrompe
              CPFs, RGs e datas).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                onClick={() => trasladoInputRef.current?.click()}
                disabled={lendoTraslado}
              >
                {lendoTraslado ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ScrollText className="size-4" />
                )}
                {trasladoNome || "Enviar traslado (.docx, .pdf, .txt)"}
              </Button>
              <input
                ref={trasladoInputRef}
                type="file"
                accept=".docx,.pdf,.txt"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) lerArquivoTraslado(f);
                }}
              />
            </div>

            {traslado && !traslado.confiavel && (
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="size-4 text-amber-600" />
                <AlertTitle className="text-amber-800">
                  Traslado escaneado — campos não confiáveis
                </AlertTitle>
                <AlertDescription className="text-amber-700">
                  O texto veio de OCR. Num teste real, 5 de 8 campos vieram
                  corrompidos. Use este arquivo apenas para localizar o .docx
                  do cartório; confira campo a campo o que for aproveitado.
                </AlertDescription>
              </Alert>
            )}

            {traslado && (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {(
                  [
                    ["Formato", traslado.formato],
                    ["Espécie", traslado.especie],
                    [
                      "Livro / folhas",
                      traslado.traslado
                        ? `livro ${traslado.traslado.livro}, fls. ${traslado.traslado.fls}`
                        : undefined,
                    ],
                    ["Data da lavratura", traslado.data],
                    ["Partes", traslado.partesTitulo],
                    ["Escrevente", traslado.escrevente],
                    [
                      "Videoconferência",
                      traslado.videoconferencia
                        ? "sim — bloco MNE será incluído"
                        : "não",
                    ],
                    [
                      "Qualificações",
                      traslado.qualificacoes
                        ? `${traslado.qualificacoes.length} caracteres extraídos`
                        : undefined,
                    ],
                    ["Síntese sugerida", traslado.sinteseSugerida],
                    [
                      "Ato referenciado",
                      traslado.atoReferenciado
                        ? `${traslado.atoReferenciado.especie} — livro ${traslado.atoReferenciado.livro}, fls. ${traslado.atoReferenciado.fls}, ${traslado.atoReferenciado.data}`
                        : undefined,
                    ],
                  ] as Array<[string, string | undefined]>
                )
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="font-medium">{k}</dt>
                      <dd className="text-muted-foreground">{v}</dd>
                    </div>
                  ))}
              </dl>
            )}

            {traslado?.atoReferenciado && (
              <Alert>
                <AlertTriangle className="size-4" />
                <AlertTitle>Este ato já é uma rerratificação</AlertTitle>
                <AlertDescription>
                  Ele referencia o livro {traslado.atoReferenciado.livro}, fls.{" "}
                  {traslado.atoReferenciado.fls}. Corrija contra a versão
                  retificada mais recente, não contra a escritura original.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* ------------------------------------------------ 4. geração */}
      {confirmaveis.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>4. Gerar minuta (rascunho)</CardTitle>
            <CardDescription>
              Disponível para itens confirmados cuja via gera peça: ata
              retificativa, requerimento ou rerratificação. Juntada e
              providência externa não geram peça.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1">
              <Label>Item da nota</Label>
              <Select
                items={Object.fromEntries(
                  confirmaveis.map((it) => [
                    String(it.id),
                    `item ${it.ref} — ${ROTULO_VIA[it.viaEscolhida]}`,
                  ])
                )}
                value={itemPecaId === null ? null : String(itemPecaId)}
                onValueChange={(v) => setItemPecaId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher item confirmado…" />
                </SelectTrigger>
                <SelectContent>
                  {confirmaveis.map((it) => (
                    <SelectItem key={it.id} value={String(it.id)}>
                      item {it.ref} — {ROTULO_VIA[it.viaEscolhida]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {tipoPeca === "ata" && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="campo-data-da-ata">Data da ata (dd/mm/aaaa)</Label>
                  <Input
                    id="campo-data-da-ata"
                    value={ata.dataAto}
                    onChange={(e) => setAta({ ...ata, dataAto: e.target.value })}
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
                      setAta({ ...ata, artigoNscgj: v as "53" | "54" })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="53">
                        53 — qualificação de pessoa
                      </SelectItem>
                      <SelectItem value="54">54 — descrição de bem</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="campo-provimentos">Provimentos</Label>
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
                  <Label htmlFor="campo-natureza-do-erro">Natureza do erro</Label>
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
                  <Label htmlFor="campo-especie-da-escritura">Espécie da escritura</Label>
                  <Input
                    id="campo-especie-da-escritura"
                    value={ata.especieEscritura}
                    onChange={(e) =>
                      setAta({ ...ata, especieEscritura: e.target.value })
                    }
                    placeholder={traslado?.especie ?? "Escritura de Venda e Compra"}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-teor-da-retificacao">Teor da retificação</Label>
                  <Textarea
                    id="campo-teor-da-retificacao"
                    rows={3}
                    value={ata.teorRetificacao}
                    onChange={(e) =>
                      setAta({ ...ata, teorRetificacao: e.target.value })
                    }
                    placeholder="onde constou X, deve constar Y…"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-amparo-documental">Amparo documental{" "}
                    <span className="text-destructive">*</span></Label>
                  <Input
                    id="campo-amparo-documental"
                    value={ata.amparoDocumental}
                    onChange={(e) =>
                      setAta({ ...ata, amparoDocumental: e.target.value })
                    }
                    placeholder="ex.: Certidão de Casamento arquivada nestas notas"
                  />
                  <p className="text-xs text-muted-foreground">
                    A ata precisa declarar em que documento arquivado se apoia.
                    Sem amparo documental, a via da ata não se sustenta — e a
                    minuta não é gerada.
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
                  <Label htmlFor="campo-serventia-destinataria">Serventia destinatária</Label>
                  <Input
                    id="campo-serventia-destinataria"
                    value={req.serventia}
                    onChange={(e) =>
                      setReq({ ...req, serventia: e.target.value })
                    }
                    placeholder={serventia || "1º Registro Imobiliário de…"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="campo-verbo">Verbo</Label>
                  <Input
                    id="campo-verbo"
                    value={req.verbo}
                    onChange={(e) => setReq({ ...req, verbo: e.target.value })}
                    placeholder="requerer / solicitar / expor"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-qualificacao-do-requerente">Qualificação do requerente</Label>
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
                  <Label htmlFor="campo-referencia">Referência (opcional)</Label>
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
                    onChange={(e) => setReq({ ...req, data: e.target.value })}
                    placeholder="09/08/2026"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-objeto-do-requerimento">Objeto do requerimento</Label>
                  <Textarea
                    id="campo-objeto-do-requerimento"
                    rows={3}
                    value={req.objeto}
                    onChange={(e) => setReq({ ...req, objeto: e.target.value })}
                    placeholder="o que se requer, em uma frase"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-bloco-extra">Bloco extra (DOS FATOS / esclarecimentos — opcional)</Label>
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
                    <AlertTitle>Carregue o traslado do ato</AlertTitle>
                    <AlertDescription>
                      As qualificações e a identificação do ato saem do
                      traslado, sem redigitação. Sem ele, esses campos ficarão
                      como placeholders.
                    </AlertDescription>
                  </Alert>
                )}
                <div className="space-y-1">
                  <Label htmlFor="campo-data-do-novo-ato">Data do novo ato (dd/mm/aaaa)</Label>
                  <Input
                    id="campo-data-do-novo-ato"
                    value={rerrat.dataAto}
                    onChange={(e) =>
                      setRerrat({ ...rerrat, dataAto: e.target.value })
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
                      setRerrat({ ...rerrat, tabeliao: e.target.value })
                    }
                    placeholder="nome do tabelião"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-sintese-do-ato">Síntese do ato (item I)</Label>
                  <Textarea
                    id="campo-sintese-do-ato"
                    rows={3}
                    value={rerrat.sintese}
                    onChange={(e) =>
                      setRerrat({ ...rerrat, sintese: e.target.value })
                    }
                    placeholder={
                      traslado?.sinteseSugerida ??
                      "o primeiro nomeado, vendeu ao segundo nomeado pelo valor de…"
                    }
                  />
                  {traslado?.sinteseSugerida && (
                    <p className="text-xs text-muted-foreground">
                      Vazio = usa a síntese derivada do quadro-resumo do
                      traslado.
                    </p>
                  )}
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-bloco-do-lapso">Bloco do lapso (item II — o que constou errado)</Label>
                  <Textarea
                    id="campo-bloco-do-lapso"
                    rows={3}
                    value={rerrat.blocoLapso}
                    onChange={(e) =>
                      setRerrat({ ...rerrat, blocoLapso: e.target.value })
                    }
                    placeholder="Entretanto, por um lapso, constou erroneamente naquela escritura que: a) …"
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="campo-bloco-da-correcao">Bloco da correção (item III — pareado com o II)</Label>
                  <Textarea
                    id="campo-bloco-da-correcao"
                    rows={3}
                    value={rerrat.blocoCorrecao}
                    onChange={(e) =>
                      setRerrat({ ...rerrat, blocoCorrecao: e.target.value })
                    }
                    placeholder="RETIFICAM aquela escritura, para constar que: a) …"
                  />
                  <p className="text-xs text-muted-foreground">
                    Os itens II e III são pareados um a um: “a)” errado ↔ “a)”
                    correto.
                  </p>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="campo-prenotacao">Prenotação</Label>
                  <Input
                    id="campo-prenotacao"
                    value={rerrat.prenotacao}
                    onChange={(e) =>
                      setRerrat({ ...rerrat, prenotacao: e.target.value })
                    }
                    placeholder={prenotacao || "nº da prenotação"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="campo-serventia">Serventia</Label>
                  <Input
                    id="campo-serventia"
                    value={rerrat.serventia}
                    onChange={(e) =>
                      setRerrat({ ...rerrat, serventia: e.target.value })
                    }
                    placeholder={serventia || "serventia da nota"}
                  />
                </div>
              </div>
            )}

            {itemPeca && tipoPeca && (
              <div className="space-y-2">
                {ataSemAmparo && (
                  <p className="text-sm font-medium text-destructive">
                    Informe o amparo documental para liberar a geração da ata.
                  </p>
                )}
                <Button
                  onClick={gerarPeca}
                  disabled={gerando || ataSemAmparo}
                >
                  {gerando ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  Gerar {NOMES_PECA[tipoPeca]} (.docx)
                </Button>
                {faltando.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Campos sem dado (mantidos como placeholder):{" "}
                    {faltando.join(", ")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </main>
  );
}
