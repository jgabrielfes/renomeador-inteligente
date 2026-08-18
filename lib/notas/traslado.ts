// Leitor de traslado.
//
// O tabelionato guarda o traslado em .doc/.docx — a minuta com o cabeçalho
// "1° TRASLADO – LIVRO N° X – FLS. Y" na frente. Texto nativo, sem OCR: é a
// fonte confiável para alimentar a rerratificação.
//
// REGRA CRÍTICA DE FONTE (da especificação): traslado escaneado NÃO serve
// como fonte de dados — num teste real, 5 de 8 campos vieram corrompidos pelo
// OCR. Ordem de preferência: .docx do cartório → PDF nato-digital → escaneado
// (só como índice para localizar o .docx, com todos os campos marcados como
// não confiáveis).
//
// Este módulo trabalha sobre TEXTO já extraído; quem chama decide a origem
// (docx via extractDocxText, PDF via readPdfPageTexts) e informa `confiavel`.

export interface DadosTraslado {
  confiavel: boolean;
  fonte: "docx" | "pdf-nativo" | "pdf-escaneado" | "texto";
  formato?: "quadro" | "corrido";
  quadro?: Record<string, string>;
  sinteseSugerida?: string;
  secoes?: string[];
  traslado?: { via: string; livro: string; fls: string };
  especie?: string;
  partesTitulo?: string;
  data?: string;
  videoconferencia: boolean;
  escrevente?: string;
  qualificacoes?: string;
  atoReferenciado?: { especie: string; data: string; livro: string; fls: string };
  prenotacao?: string;
  serventia?: string;
  padrao?: "A" | "B";
  blocoLapso?: string;
  blocoCorrecao?: string;
}

// Escrituras principais abrem com um quadro-resumo.
const CAMPOS_QUADRO = [
  "Valor da Transação",
  "Valor Venal",
  "Outorgante",
  "Outorgada",
  "Outorgantes",
  "Outorgados",
  "Imóvel",
  "Imóveis",
  "Cadastro Municipal",
  "Registro Imobiliário",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const RE_QUADRO = new RegExp(
  `^\\s*(${CAMPOS_QUADRO.map(escapeRegExp).join("|")}):\\s{2,}(.+)`
);

function lerQuadro(bruto: string): Record<string, string> {
  const q: Record<string, string> = {};
  for (const linha of bruto.split("\n")) {
    const m = RE_QUADRO.exec(linha);
    if (m) q[m[1]] = m[2].replace(/\s+/g, " ").trim().replace(/\.+$/, "");
  }
  return q;
}

// Índice das seções nomeadas — as âncoras que o item III da rerratificação
// cita ('No item "DA RELAÇÃO DOS HERDEIROS"').
function lerSecoes(bruto: string): string[] {
  const achadas: string[] = [];
  const padrao =
    /^(\d+(\.\d+)?\s*[-–]\s*)?[A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 ,ÇÃÕÁÉÍÓÚÂÊÔ“”"'\-–.]+$/;
  for (const linha of bruto.split("\n")) {
    const s = linha.trim();
    if (!s || s.length > 70) continue;
    if (padrao.test(s) && s.split(/\s+/).length >= 2 && s === s.toUpperCase()) {
      achadas.push(s);
    }
  }
  return achadas;
}

// Monta a síntese do item I a partir do quadro-resumo — que é exatamente
// como o tabelionato a redige: valor + imóvel integral + registro.
export function sinteseDoQuadro(q: Record<string, string>): string {
  const imovelBruto = q["Imóvel"] || q["Imóveis"];
  if (!imovelBruto) return "";
  const imovel = imovelBruto.replace(/\.+$/, "");
  const valor = (q["Valor da Transação"] ?? "").replace(/\.+$/, "");
  let reg = (q["Registro Imobiliário"] ?? "").replace(/\.+$/, "");
  reg = reg.replace(/^Matr[íi]cula/, "matrícula");
  let s = "o primeiro nomeado, vendeu ao segundo nomeado";
  if (valor) s += ` pelo valor de ${valor}`;
  s += `, ${imovel}`;
  if (reg) s += `, melhor descrito e caracterizado na ${reg}`;
  return s;
}

export function lerTraslado(
  bruto: string,
  fonte: DadosTraslado["fonte"]
): DadosTraslado {
  const t = bruto.replace(/\s+/g, " ").trim();
  const d: DadosTraslado = {
    // Campo vindo de OCR nasce marcado como não confiável (trava nº 3).
    confiavel: fonte !== "pdf-escaneado",
    fonte,
    videoconferencia: /VIDEOCONFER[ÊE]NCIA/i.test(t),
  };

  const q = lerQuadro(bruto);
  if (Object.keys(q).length > 0) {
    d.quadro = q;
    d.sinteseSugerida = sinteseDoQuadro(q);
  }
  const sec = lerSecoes(bruto);
  if (sec.length > 0) d.secoes = sec;

  // --- cabeçalho do traslado: livro e folhas DESTE ato ---
  let m =
    /(\d+)[°º]?\s*TRASLADO\s*[–-]\s*LIVRO\s*N[°º]?\s*([\d.]+)\s*[–-]\s*FLS\.?\s*([\d/]+)/i.exec(
      t
    );
  if (m) d.traslado = { via: m[1], livro: m[2], fls: m[3] };

  // --- espécie e partes do título ---
  m = /(ESCRITURA[^:]{0,60}?)\s+QUE FAZEM:\s*(.+?),\s*na forma abaixo/i.exec(t);
  if (m) {
    d.formato = "corrido"; // rerratificação, ata
    d.especie = m[1].trim();
    d.partesTitulo = m[2].trim();
  } else {
    // escritura principal: a espécie é o título logo após o cabeçalho
    d.formato = "quadro";
    m = /FLS\.?\s*[\d/]+\s*(ESCRITURA[^\n]{0,80})/i.exec(bruto);
    if (m) d.especie = m[1].replace(/\s+/g, " ").trim();
    const partes = ["Outorgante", "Outorgantes", "Outorgada", "Outorgados"]
      .map((k) => q[k])
      .filter(Boolean);
    if (partes.length > 0) d.partesTitulo = partes.join(" e ");
  }

  // --- data da lavratura, por extenso ---
  m =
    /aos?\s+[\wàáâãéêíóôõúç ]+?\((\d{1,2})\)\s*dias?\s*do m[êe]s de\s+(\w+)\s*\((\d{2})\),?\s*do ano de\s+[\w e]+?\((\d{4})\)/i.exec(
      t
    );
  if (m) d.data = `${m[1].padStart(2, "0")}/${m[3]}/${m[4]}`;

  m = /perante mim,\s*([^,]+?),\s*Escrevente/i.exec(t);
  if (m) d.escrevente = m[1].trim();

  // --- qualificações: do "a saber:" até o "Os presentes, reconhecidos" ---
  m =
    /a saber:\s*(?:como outorgantes e reciprocamente outorgados:?\s*)?([\s\S]+?)\s*Os presentes,\s*reconhecid/i.exec(
      t
    );
  if (m) d.qualificacoes = m[1].trim().replace(/\.+$/, "");

  // --- item I: o ato que está sendo rerratificado ---
  m =
    /I\)\s*(?:que,\s*)?[Pp]or\s+(.+?),?\s*lavrada nestas mesmas notas,\s*aos\s*(\d{2}\/\d{2}\/\d{4}),\s*n[oa]\s*livro\s*n[°º]?\s*([\d.]+),\s*[àa]s\s*fls\.?\s*([\d/]+)/.exec(
      t
    );
  if (m) {
    d.atoReferenciado = {
      especie: m[1].trim(),
      data: m[2],
      livro: m[3],
      fls: m[4],
    };
  }

  // --- nota devolutiva atendida ---
  m =
    /prenota[çc][ãa]o\s*n[°º]?\s*([\d./-]+)\)?\s*d[oe]\s*(.+?Registro Imobili[áa]rio[^,;]*)/i.exec(
      t
    );
  if (m) {
    d.prenotacao = m[1].replace(/\.+$/, "");
    d.serventia = m[2].trim();
  } else {
    m = /t[íi]tulo prenotado sob\s*n[°º]?\s*([\d./-]+)/i.exec(t);
    if (m) d.prenotacao = m[1].replace(/\.+$/, "");
  }

  // --- padrão do corpo ---
  if (/Entretanto,\s*por um lapso/i.test(t)) d.padrao = "A";
  else if (/para satisfazer a nota devolutiva/i.test(t)) d.padrao = "B";

  // --- blocos II e III ---
  m = /(II\)\s*Entretanto[\s\S]+?);\s*III\)/.exec(t);
  if (m) d.blocoLapso = m[1].slice(3).trim();
  m =
    /III\)\s*([\s\S]+?)(?:\.\s*Ent[ãa]o,|,\s*ratificado, outrossim|\.\s*Nos termos Provimento)/.exec(
      t
    );
  if (m) d.blocoCorrecao = m[1].trim();

  return d;
}
