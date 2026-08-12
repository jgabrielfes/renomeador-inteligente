/**
 * Builder .docx mínimo e compartilhado (jszip, roda no NAVEGADOR) — usado
 * pela minuta de petição e pelos documentos de honorários. A4, Times 12,
 * corpo justificado; suporta um logotipo no topo (marca branca do escritório)
 * embutido como imagem inline do OOXML.
 *
 * O pacote é o menor que Word e LibreOffice aceitam: [Content_Types].xml,
 * _rels/.rels, word/_rels/document.xml.rels (obrigatório mesmo vazio) e
 * word/document.xml (+ word/media/logo quando há marca).
 */

export interface Paragrafo {
  texto: string;
  negrito?: boolean;
  centrado?: boolean;
  titulo?: boolean;
  /** Fonte menor (9pt) — linhas de contato do cabeçalho do escritório. */
  discreto?: boolean;
  sublinhado?: boolean;
  /** Tamanho da fonte em half-points (22 = 11pt); default do documento. */
  tamanho?: number;
}

/** Tabela simples com bordas (formato dos modelos notariais). */
export interface TabelaDocx {
  /** Largura das colunas em twips (1/20 pt). */
  colunas: number[];
  linhas: { celulas: string[]; negrito?: boolean }[];
  /** Tamanho da fonte das células em half-points. */
  tamanho?: number;
}

export type BlocoDocx =
  | ({ tipo: 'p' } & Paragrafo)
  | ({ tipo: 'tabela' } & TabelaDocx);

export interface LogoDocx {
  /** data URL image/png ou image/jpeg (validada aqui). */
  dataUrl: string;
  larguraPx: number;
  alturaPx: number;
}

export function escaparXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface EstiloDoc {
  fonte: string;
  /** Tamanho padrão do corpo em half-points. */
  tamanho: number;
  /** Títulos de seção centralizados (modelos notariais) em vez de à esquerda. */
  tituloCentrado?: boolean;
}

const ESTILO_PADRAO: EstiloDoc = { fonte: 'Times New Roman', tamanho: 24 };

function paragrafoXml(par: Paragrafo, estilo: EstiloDoc): string {
  const jc = par.centrado ? 'center' : par.titulo ? (estilo.tituloCentrado ? 'center' : 'left') : 'both';
  const negrito = par.negrito || par.titulo;
  const sz = String(par.tamanho ?? (par.discreto ? 18 : estilo.tamanho));
  const rPr = `<w:rPr><w:rFonts w:ascii="${estilo.fonte}" w:hAnsi="${estilo.fonte}"/>${
    negrito ? '<w:b/>' : ''
  }${par.sublinhado ? '<w:u w:val="single"/>' : ''}<w:sz w:val="${sz}"/></w:rPr>`;
  // Ordem dos filhos de pPr conforme o esquema (spacing antes de jc, rPr por último).
  const pPr = `<w:pPr><w:spacing w:before="${par.titulo ? '240' : '0'}" w:after="${
    par.titulo ? '240' : par.discreto ? '40' : '160'
  }"/><w:jc w:val="${jc}"/>${negrito ? `<w:rPr><w:b/></w:rPr>` : ''}</w:pPr>`;
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escaparXml(par.texto)}</w:t></w:r></w:p>`;
}

function tabelaXml(t: TabelaDocx, estilo: EstiloDoc): string {
  const borda = 'w:sz="4" w:space="0" w:color="000000"';
  const tblPr =
    `<w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>` +
    `<w:top w:val="single" ${borda}/><w:left w:val="single" ${borda}/>` +
    `<w:bottom w:val="single" ${borda}/><w:right w:val="single" ${borda}/>` +
    `<w:insideH w:val="single" ${borda}/><w:insideV w:val="single" ${borda}/>` +
    `</w:tblBorders></w:tblPr>`;
  const grid = `<w:tblGrid>${t.colunas.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const sz = String(t.tamanho ?? estilo.tamanho);
  const linhas = t.linhas
    .map((linha) => {
      const celulas = linha.celulas
        .map((c, i) => {
          const rPr = `<w:rPr><w:rFonts w:ascii="${estilo.fonte}" w:hAnsi="${estilo.fonte}"/>${
            linha.negrito ? '<w:b/>' : ''
          }<w:sz w:val="${sz}"/></w:rPr>`;
          const pPr = `<w:pPr><w:spacing w:before="20" w:after="20"/>${linha.negrito ? '<w:rPr><w:b/></w:rPr>' : ''}</w:pPr>`;
          return `<w:tc><w:tcPr><w:tcW w:w="${t.colunas[i] ?? 0}" w:type="dxa"/></w:tcPr><w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${escaparXml(c)}</w:t></w:r></w:p></w:tc>`;
        })
        .join('');
      return `<w:tr>${celulas}</w:tr>`;
    })
    .join('');
  // Parágrafo vazio após a tabela: exigência do esquema quando duas tabelas
  // se seguem, e respiro visual como no modelo.
  return `<w:tbl>${tblPr}${grid}${linhas}</w:tbl><w:p><w:pPr><w:spacing w:before="0" w:after="120"/></w:pPr></w:p>`;
}

/* ---------- logotipo (imagem inline) ---------- */

const EMU_POR_PX = 9525; // 96 dpi
const LOGO_MAX_LARGURA_EMU = 2_160_000; // ~6 cm
const LOGO_MAX_ALTURA_EMU = 720_000; // ~2 cm

interface LogoPreparado {
  extensao: 'png' | 'jpeg';
  contentType: 'image/png' | 'image/jpeg';
  bytes: Uint8Array;
  cx: number;
  cy: number;
}

function decodificarBase64(b64: string): Uint8Array {
  // atob existe no navegador e no Node moderno; Buffer cobre o restante.
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

function prepararLogo(logo: LogoDocx): LogoPreparado | null {
  const m = /^data:image\/(png|jpeg);base64,(.+)$/.exec(logo.dataUrl);
  if (!m) return null;
  const largura = logo.larguraPx > 0 ? logo.larguraPx : 240;
  const altura = logo.alturaPx > 0 ? logo.alturaPx : 80;
  const cxNatural = largura * EMU_POR_PX;
  const cyNatural = altura * EMU_POR_PX;
  const escala = Math.min(1, LOGO_MAX_LARGURA_EMU / cxNatural, LOGO_MAX_ALTURA_EMU / cyNatural);
  return {
    extensao: m[1] as 'png' | 'jpeg',
    contentType: m[1] === 'png' ? 'image/png' : 'image/jpeg',
    bytes: decodificarBase64(m[2]),
    cx: Math.round(cxNatural * escala),
    cy: Math.round(cyNatural * escala),
  };
}

function logoXml(l: LogoPreparado): string {
  const grafico =
    `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">` +
    `<a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    `<pic:nvPicPr><pic:cNvPr id="1" name="Logotipo"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdLogo"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${l.cx}" cy="${l.cy}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>` +
    `</pic:pic></a:graphicData></a:graphic>`;
  return (
    `<w:p><w:pPr><w:spacing w:before="0" w:after="120"/><w:jc w:val="center"/></w:pPr>` +
    `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="${l.cx}" cy="${l.cy}"/>` +
    `<wp:docPr id="1" name="Logotipo"/>` +
    grafico +
    `</wp:inline></w:drawing></w:r></w:p>`
  );
}

/* ---------- pacote ---------- */

function contentTypes(logo: LogoPreparado | null): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${logo ? `<Default Extension="${logo.extensao}" ContentType="${logo.contentType}"/>\n` : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Sem este arquivo (mesmo vazio) o LibreOffice recusa o pacote.
function relsDocumento(logo: LogoPreparado | null): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
    logo
      ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${logo.extensao}"/>`
      : ''
  }</Relationships>`;
}

/** Gera o .docx (A4, Times 12, corpo justificado; logo opcional no topo). */
export async function montarDocx(
  paragrafos: Paragrafo[],
  opcoes?: { logo?: LogoDocx | null },
): Promise<Blob> {
  return montarDocxRico(
    paragrafos.map((p) => ({ tipo: 'p' as const, ...p })),
    { logo: opcoes?.logo ?? null },
  );
}

/**
 * Gera o .docx a partir de BLOCOS (parágrafos + tabelas) com o estilo do
 * documento (fonte/tamanho) — usado pela escritura, que segue a formatação
 * exata do modelo do balcão (Tahoma, títulos centralizados, tabelas).
 */
export async function montarDocxRico(
  blocos: BlocoDocx[],
  opcoes?: { logo?: LogoDocx | null; estilo?: Partial<EstiloDoc> },
): Promise<Blob> {
  const estilo: EstiloDoc = { ...ESTILO_PADRAO, ...opcoes?.estilo };
  const logo = opcoes?.logo ? prepararLogo(opcoes.logo) : null;
  const corpo =
    (logo ? logoXml(logo) : '') +
    blocos
      .map((b) => (b.tipo === 'tabela' ? tabelaXml(b, estilo) : paragrafoXml(b, estilo)))
      .join('');
  const documento = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1701" w:left="1701"/></w:sectPr></w:body>
</w:document>`;

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  zip.file('[Content_Types].xml', contentTypes(logo));
  zip.file('_rels/.rels', RELS);
  zip.file('word/_rels/document.xml.rels', relsDocumento(logo));
  zip.file('word/document.xml', documento);
  if (logo) zip.file(`word/media/logo.${logo.extensao}`, logo.bytes);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
