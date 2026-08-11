/**
 * Extração de texto de arquivos Office (.docx e .xlsx) no NAVEGADOR, sobre o
 * jszip já usado no app — sem dependência nova e sem o arquivo sair da
 * máquina. O texto extraído é o que segue para a leitura do cofre: planilhas
 * de qualificação e minutas de partilha viram texto plano que a IA entende.
 *
 * Parser deliberadamente simples (regex sobre o XML do OOXML): o objetivo é
 * recuperar o CONTEÚDO das células/parágrafos, não a formatação.
 */

export const OFFICE_EXTS = ['.docx', '.xlsx'] as const;

/** Limite do texto extraído por arquivo — planilha gigante não vira prompt. */
export const OFFICE_TEXTO_MAX = 40_000;

export function ehArquivoOffice(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return OFFICE_EXTS.some((ext) => lower.endsWith(ext));
}

function decodificarEntidades(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function limitar(texto: string): string {
  const limpo = texto.replace(/\n{3,}/g, '\n\n').trim();
  return limpo.length > OFFICE_TEXTO_MAX
    ? `${limpo.slice(0, OFFICE_TEXTO_MAX)}\n[… conteúdo truncado …]`
    : limpo;
}

/* ---------- .docx ---------- */

function textoDeDocumentoXml(xml: string): string {
  return decodificarEntidades(
    xml
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<w:br[^>]*\/>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, ''),
  );
}

/* ---------- .xlsx ---------- */

function textosCompartilhados(xml: string): string[] {
  const saida: string[] = [];
  for (const [, si] of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const partes = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => t);
    saida.push(decodificarEntidades(partes.join('')));
  }
  return saida;
}

function textoDePlanilhaXml(xml: string, compartilhados: string[]): string {
  const linhas: string[] = [];
  for (const [, linha] of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const celulas: string[] = [];
    for (const [, attrs, corpo] of linha.matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const tipo = /\bt="([^"]+)"/.exec(attrs)?.[1];
      let valor = '';
      if (tipo === 's') {
        const idx = Number(/<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1]);
        valor = Number.isInteger(idx) ? (compartilhados[idx] ?? '') : '';
      } else if (tipo === 'inlineStr') {
        const partes = [...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(([, t]) => t);
        valor = decodificarEntidades(partes.join(''));
      } else {
        valor = decodificarEntidades(/<v>([\s\S]*?)<\/v>/.exec(corpo)?.[1] ?? '');
      }
      if (valor.trim()) celulas.push(valor.trim());
    }
    if (celulas.length > 0) linhas.push(celulas.join(' | '));
  }
  return linhas.join('\n');
}

/**
 * Texto plano de um .docx ou .xlsx. Lança erro para arquivo ilegível/corrompido
 * — quem chama decide o fallback (anexar sem leitura).
 */
export async function extrairTextoOffice(file: File): Promise<string> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const lower = file.name.toLowerCase();

  if (lower.endsWith('.docx')) {
    const doc = await zip.file('word/document.xml')?.async('string');
    if (!doc) throw new Error('DOCX sem word/document.xml.');
    return limitar(textoDeDocumentoXml(doc));
  }

  // .xlsx: todas as abas, na ordem dos arquivos de planilha.
  const compartilhadosXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const compartilhados = compartilhadosXml ? textosCompartilhados(compartilhadosXml) : [];
  const nomes = Object.keys(zip.files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(/sheet(\d+)/.exec(a)![1]) - Number(/sheet(\d+)/.exec(b)![1]));
  if (nomes.length === 0) throw new Error('XLSX sem planilhas.');

  const abas: string[] = [];
  for (const nome of nomes) {
    const xml = await zip.file(nome)!.async('string');
    const texto = textoDePlanilhaXml(xml, compartilhados);
    if (texto) abas.push(nomes.length > 1 ? `— Aba ${abas.length + 1} —\n${texto}` : texto);
  }
  return limitar(abas.join('\n\n'));
}
