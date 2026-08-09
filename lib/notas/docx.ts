// Leitura e preenchimento de .docx no navegador, sem dependência nova:
// .docx é um zip (JSZip já é dependência do projeto) e o texto vive em
// word/document.xml.
//
// O preenchimento replica o resolvedor.py: placeholders {{CHAVE}} são
// substituídos onde houver dado; SEM dado, o placeholder PERMANECE VISÍVEL
// na minuta (trava de segurança nº 4 — nunca preencher por inferência, nunca
// deixar passar em branco silenciosamente).

import JSZip from "jszip";

const ENTIDADES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

function decodeXml(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTIDADES[m])
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)));
}

function encodeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Texto plano do documento: parágrafos viram linhas; tabulações viram
// espaço duplo (o quadro-resumo dos traslados separa rótulo e valor por
// tabulação, e o leitor de quadro casa com `\s{2,}`).
export async function extractDocxText(data: ArrayBuffer | Blob): Promise<string> {
  const zip = await JSZip.loadAsync(data);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("Arquivo .docx sem word/document.xml");
  const xml = await doc.async("string");

  const linhas: string[] = [];
  for (const par of xml.split(/<\/w:p>/)) {
    let s = par
      .replace(/<w:tab[^>]*\/>/g, "  ")
      .replace(/<w:br[^>]*\/>/g, "\n");
    // Só o conteúdo dos nós de texto conta — descarta o resto da marcação.
    const pedacos = [...s.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) =>
      decodeXml(m[1])
    );
    s = pedacos.join("");
    linhas.push(s);
  }
  return linhas.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export interface ResultadoPreenchimento {
  blob: Blob;
  faltando: string[];
}

// Preenche um template .docx. Chaves ausentes (undefined) em `dados` ficam
// como {{PLACEHOLDER}} no documento e são devolvidas em `faltando`; string
// vazia é valor legítimo (campo opcional deliberadamente omitido, como o
// bloco MNE de um ato sem videoconferência) e apaga o placeholder.
export async function fillDocxTemplate(
  template: ArrayBuffer | Blob,
  dados: Record<string, string | undefined>
): Promise<ResultadoPreenchimento> {
  const zip = await JSZip.loadAsync(template);
  const doc = zip.file("word/document.xml");
  if (!doc) throw new Error("Template .docx sem word/document.xml");
  let xml = await doc.async("string");

  const faltando = new Set<string>();
  // Chaves {{...}} nunca aparecem dentro de tags XML, só em texto — a
  // substituição global é segura (verificado: todos os placeholders dos três
  // templates estão intactos dentro de um único run).
  xml = xml.replace(/\{\{(\w+)\}\}/g, (todo, chave: string) => {
    const valor = dados[chave];
    if (valor === undefined) {
      faltando.add(chave);
      return todo;
    }
    return encodeXml(valor);
  });

  zip.file("word/document.xml", xml);
  const blob = await zip.generateAsync({
    type: "blob",
    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  return { blob, faltando: [...faltando].sort() };
}
