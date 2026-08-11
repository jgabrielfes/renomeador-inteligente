/**
 * Gerador mínimo de .xlsx (Office Open XML) sobre o jszip já usado no app —
 * sem dependência nova de planilha. Cobre o que os espelhos exportam:
 * texto, moeda (R$) e percentual, com cabeçalho em negrito.
 *
 * Roda no navegador; o arquivo nasce e morre na máquina do usuário
 * (fronteira de dados do projeto).
 */

export type CelulaXlsx =
  | { tipo: 'texto'; valor: string }
  | { tipo: 'moeda'; valor: number }
  | { tipo: 'pct'; valor: number }; // fração: 0.25 → 25,00%

function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function letraColuna(i: number): string {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

const RELS_RAIZ = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

const RELS_WORKBOOK = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

/* Estilos: 0 padrão · 1 cabeçalho negrito · 2 moeda R$ · 3 percentual. */
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="4">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
</cellXfs>
</styleSheet>`;

function workbookXml(nomeAba: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${escaparXml(nomeAba)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
}

function celulaXml(ref: string, celula: CelulaXlsx, negrito: boolean): string {
  if (celula.tipo === 'texto') {
    const estilo = negrito ? ' s="1"' : '';
    return `<c r="${ref}" t="inlineStr"${estilo}><is><t xml:space="preserve">${escaparXml(celula.valor)}</t></is></c>`;
  }
  const estilo = celula.tipo === 'moeda' ? 2 : 3;
  return `<c r="${ref}" s="${estilo}"><v>${celula.valor}</v></c>`;
}

function sheetXml(cabecalho: string[], linhas: CelulaXlsx[][], larguras: number[]): string {
  const cols = larguras
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('');
  const linhaCabecalho = `<row r="1">${cabecalho
    .map((t, i) => celulaXml(`${letraColuna(i)}1`, { tipo: 'texto', valor: t }, true))
    .join('')}</row>`;
  const corpo = linhas
    .map(
      (linha, li) =>
        `<row r="${li + 2}">${linha
          .map((c, ci) => celulaXml(`${letraColuna(ci)}${li + 2}`, c, false))
          .join('')}</row>`,
    )
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols>${cols}</cols>
<sheetData>${linhaCabecalho}${corpo}</sheetData>
</worksheet>`;
}

export async function gerarXlsx(
  nomeAba: string,
  cabecalho: string[],
  linhas: CelulaXlsx[][],
  larguras?: number[],
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const ws = larguras ?? cabecalho.map(() => 22);

  zip.file('[Content_Types].xml', CONTENT_TYPES);
  zip.file('_rels/.rels', RELS_RAIZ);
  zip.file('xl/workbook.xml', workbookXml(nomeAba));
  zip.file('xl/_rels/workbook.xml.rels', RELS_WORKBOOK);
  zip.file('xl/styles.xml', ESTILOS);
  zip.file('xl/worksheets/sheet1.xml', sheetXml(cabecalho, linhas, ws));

  // uint8array em vez de blob: funciona igual no navegador e no runner de teste.
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** Dispara o download do blob no navegador. */
export function baixarBlob(blob: Blob, nomeArquivo: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}
