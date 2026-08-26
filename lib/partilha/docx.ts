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
  /** Itálico no parágrafo inteiro — rodapés institucionais. */
  italico?: boolean;
  /** Tamanho da fonte em half-points (22 = 11pt); default do documento. */
  tamanho?: number;
  /** Retângulo em volta do parágrafo (títulos de cláusula dos modelos). */
  moldura?: boolean;
  /** Cor do texto em hex RRGGBB sem "#" (default: cor do documento). */
  cor?: string;
  /** Filete inferior na cor dada (hex RRGGBB) — títulos de seção da identidade. */
  filete?: string;
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

export interface EstiloDoc {
  fonte: string;
  /** Tamanho padrão do corpo em half-points. */
  tamanho: number;
  /** Títulos de seção centralizados (modelos notariais) em vez de à esquerda. */
  tituloCentrado?: boolean;
  /** Cor padrão do texto em hex RRGGBB (default: automática/preta). */
  cor?: string;
  /** Cor de fundo da PÁGINA em hex RRGGBB — identidade "papel" do Sucessorista. */
  fundo?: string;
}

const ESTILO_PADRAO: EstiloDoc = { fonte: 'Times New Roman', tamanho: 24 };

/**
 * Paleta da identidade do Sucessorista em hex OOXML (sem "#") — mesmos
 * valores de app/(private)/sucessorista/sucessorista.css; mudou lá, muda aqui.
 */
export const IDENTIDADE_SUCESSORISTA = {
  papel: 'F6F4EE',
  tinta: '1A2320',
  tintaMedia: '4A544F',
  bronze: '8A6D3B',
  lacre: '9E2B25',
  verde: '2E5E4E',
  fioForte: 'B9B29C',
} as const;

/**
 * Estilo-base das minutas do módulo: página "papel", texto "tinta" em serifa.
 * A EXCEÇÃO é a escritura, que segue a formatação do modelo do balcão
 * (Tahoma, preto no branco) por exigência do tabelionato.
 */
export const ESTILO_SUCESSORISTA: Partial<EstiloDoc> = {
  fonte: 'Georgia',
  tamanho: 22,
  cor: IDENTIDADE_SUCESSORISTA.tinta,
  fundo: IDENTIDADE_SUCESSORISTA.papel,
};

/** Títulos de seção em bronze com filete; cores explícitas são preservadas. */
export function vestirIdentidade(paragrafos: Paragrafo[]): Paragrafo[] {
  return paragrafos.map((par) =>
    par.titulo
      ? {
          ...par,
          cor: par.cor ?? IDENTIDADE_SUCESSORISTA.bronze,
          filete: par.filete ?? IDENTIDADE_SUCESSORISTA.fioForte,
        }
      : par,
  );
}

/**
 * Runs INLINE por marcação leve no texto: **negrito** e __sublinhado__
 * (combináveis: __**NOME**__) — a formatação dos modelos do balcão vive
 * DENTRO do parágrafo (o nome da parte, o valor, o rótulo da cláusula),
 * nunca no parágrafo inteiro. Segurança: "__" encostado em outro underscore
 * é literal (a lacuna "______" e as linhas de assinatura), e marcação
 * desbalanceada no parágrafo inteiro vira texto literal — nunca corrompe.
 */
function segmentosInline(texto: string): { t: string; b: boolean; u: boolean }[] {
  const marcaB = (i: number) => texto.startsWith('**', i);
  const marcaU = (i: number) =>
    texto.startsWith('__', i) && texto[i - 1] !== '_' && texto[i + 2] !== '_';
  let nb = 0;
  let nu = 0;
  for (let i = 0; i < texto.length; i++) {
    if (marcaB(i)) {
      nb++;
      i++;
    } else if (marcaU(i)) {
      nu++;
      i++;
    }
  }
  const usarB = nb > 0 && nb % 2 === 0;
  const usarU = nu > 0 && nu % 2 === 0;
  const segs: { t: string; b: boolean; u: boolean }[] = [];
  let b = false;
  let u = false;
  let atual = '';
  const fecha = () => {
    if (atual) segs.push({ t: atual, b, u });
    atual = '';
  };
  for (let i = 0; i < texto.length; i++) {
    if (usarB && marcaB(i)) {
      fecha();
      b = !b;
      i++;
      continue;
    }
    if (usarU && marcaU(i)) {
      fecha();
      u = !u;
      i++;
      continue;
    }
    atual += texto[i];
  }
  fecha();
  return segs.length > 0 ? segs : [{ t: texto, b: false, u: false }];
}

function paragrafoXml(par: Paragrafo, estilo: EstiloDoc): string {
  const jc = par.centrado ? 'center' : par.titulo ? (estilo.tituloCentrado ? 'center' : 'left') : 'both';
  const negrito = par.negrito || par.titulo;
  const sz = String(par.tamanho ?? (par.discreto ? 18 : estilo.tamanho));
  const cor = par.cor ?? estilo.cor;
  const rPrDe = (b: boolean, u: boolean) =>
    `<w:rPr><w:rFonts w:ascii="${estilo.fonte}" w:hAnsi="${estilo.fonte}"/>${
      b ? '<w:b/>' : ''
    }${par.italico ? '<w:i/>' : ''}${cor ? `<w:color w:val="${cor}"/>` : ''}${
      u ? '<w:u w:val="single"/>' : ''
    }<w:sz w:val="${sz}"/></w:rPr>`;
  // Retângulo do título (mesmas bordas do modelo notarial) ou filete inferior
  // colorido (títulos de seção da identidade do Sucessorista).
  const pBdr = par.moldura
    ? '<w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="auto"/><w:left w:val="single" w:sz="4" w:space="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/><w:right w:val="single" w:sz="4" w:space="4" w:color="auto"/></w:pBdr>'
    : par.filete
      ? `<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="2" w:color="${par.filete}"/></w:pBdr>`
      : '';
  // Ordem dos filhos de pPr conforme o esquema (pBdr antes de spacing, spacing antes de jc, rPr por último).
  const pPr = `<w:pPr>${pBdr}<w:spacing w:before="${par.titulo ? '240' : '0'}" w:after="${
    par.titulo ? '240' : par.discreto ? '40' : '160'
  }"/><w:jc w:val="${jc}"/>${negrito ? `<w:rPr><w:b/></w:rPr>` : ''}</w:pPr>`;
  const runs = segmentosInline(par.texto)
    .map(
      (s) =>
        `<w:r>${rPrDe(Boolean(negrito) || s.b, Boolean(par.sublinhado) || s.u)}<w:t xml:space="preserve">${escaparXml(s.t)}</w:t></w:r>`,
    )
    .join('');
  return `<w:p>${pPr}${runs || `<w:r>${rPrDe(Boolean(negrito), Boolean(par.sublinhado))}<w:t xml:space="preserve"></w:t></w:r>`}</w:p>`;
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
          const pPr = `<w:pPr><w:spacing w:before="20" w:after="20"/>${linha.negrito ? '<w:rPr><w:b/></w:rPr>' : ''}</w:pPr>`;
          // Mesma marcação inline dos parágrafos (**…** e __…__) — os rótulos
          // da tabela-resumo dos modelos são negrito com o valor normal.
          const runs = segmentosInline(c)
            .map((s) => {
              const rPr = `<w:rPr><w:rFonts w:ascii="${estilo.fonte}" w:hAnsi="${estilo.fonte}"/>${
                linha.negrito || s.b ? '<w:b/>' : ''
              }${estilo.cor ? `<w:color w:val="${estilo.cor}"/>` : ''}${
                s.u ? '<w:u w:val="single"/>' : ''
              }<w:sz w:val="${sz}"/></w:rPr>`;
              return `<w:r>${rPr}<w:t xml:space="preserve">${escaparXml(s.t)}</w:t></w:r>`;
            })
            .join('');
          return `<w:tc><w:tcPr><w:tcW w:w="${t.colunas[i] ?? 0}" w:type="dxa"/></w:tcPr><w:p>${pPr}${runs}</w:p></w:tc>`;
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

function contentTypes(logo: LogoPreparado | null, comSettings: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
${logo ? `<Default Extension="${logo.extensao}" ContentType="${logo.contentType}"/>\n` : ''}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
${comSettings ? '<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>\n' : ''}</Types>`;
}

const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

// Sem este arquivo (mesmo vazio) o LibreOffice recusa o pacote.
function relsDocumento(logo: LogoPreparado | null, comSettings: boolean): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${
    logo
      ? `<Relationship Id="rIdLogo" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.${logo.extensao}"/>`
      : ''
  }${
    comSettings
      ? '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>'
      : ''
  }</Relationships>`;
}

// Sem displayBackgroundShape o Word ignora o <w:background> (fundo da página).
const SETTINGS_FUNDO = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:displayBackgroundShape/></w:settings>`;

/** Gera o .docx (A4, Times 12, corpo justificado; logo opcional no topo). */
export async function montarDocx(
  paragrafos: Paragrafo[],
  opcoes?: { logo?: LogoDocx | null; estilo?: Partial<EstiloDoc> },
): Promise<Blob> {
  return montarDocxRico(
    paragrafos.map((p) => ({ tipo: 'p' as const, ...p })),
    { logo: opcoes?.logo ?? null, estilo: opcoes?.estilo },
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
${estilo.fundo ? `<w:background w:color="${estilo.fundo}"/>\n` : ''}<w:body>${corpo}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1701" w:right="1134" w:bottom="1701" w:left="1701"/></w:sectPr></w:body>
</w:document>`;

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const comSettings = Boolean(estilo.fundo);
  zip.file('[Content_Types].xml', contentTypes(logo, comSettings));
  zip.file('_rels/.rels', RELS);
  zip.file('word/_rels/document.xml.rels', relsDocumento(logo, comSettings));
  zip.file('word/document.xml', documento);
  if (comSettings) zip.file('word/settings.xml', SETTINGS_FUNDO);
  if (logo) zip.file(`word/media/logo.${logo.extensao}`, logo.bytes);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  return new Blob([bytes as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}
