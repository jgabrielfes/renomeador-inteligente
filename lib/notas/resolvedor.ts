// Resolvedor de nota devolutiva — núcleo.
//
// Duas etapas puras (a geração da peça fica em lib/notas/docx.ts):
//   decompor()   — quebra a nota nos itens de exigência
//   classificar() — roteia cada item para uma das seis vias
//
// O vocabulário do classificador foi calibrado em quatro notas reais
// (1º e 2º RI de Guarulhos e RI de Itaquaquecetuba). Regra de calibração:
// ancorar nos VERBOS DE REMÉDIO (o que o oficial manda fazer), nunca nos
// princípios registrários citados ("especialidade subjetiva" aparece tanto
// em juntada quanto em ata e não serve de gatilho).
//
// IMPORTANTE: a saída é sempre um RASCUNHO. A via sugerida precisa de
// aprovação humana antes de gerar qualquer peça.

export type Via =
  | "PROVIDENCIA_EXTERNA"
  | "RERRATIFICACAO"
  | "REQUERIMENTO"
  | "JUNTADA"
  | "ATA_RETIFICATIVA"
  | "INDEFINIDO";

export interface ItemNota {
  ref: string;
  texto: string;
}

export interface ItemClassificado extends ItemNota {
  via: Via;
  rotulo: string;
  nota: string;
  gatilho: string | null;
  alvos: string[];
  pessoas: string[];
}

// As notas numeram os itens de formas diferentes:
//   1º RI Guarulhos    -> títulos em caixa alta ("QUANTO AO ESTADO CIVIL...")
//   2º RI Guarulhos    -> "1-", "2-", "3-"
//   RI Itaquaquecetuba -> "1)", "1.1)", "2)"
const PADRAO_NUMERADO = /^\s*(\d+(?:\.\d+)?)\s*[)\-–]\s+(.*)/s;
const PADRAO_TITULO = /^\s*(QUANTO [AÀ][^\n]{3,80})\s*$/i;

export function decompor(texto: string): ItemNota[] {
  const linhas = texto.split("\n").map((l) => l.replace(/\s+$/, ""));
  const itens: ItemNota[] = [];
  let atual: ItemNota | null = null;

  for (const linha of linhas) {
    let m = PADRAO_NUMERADO.exec(linha);
    if (m) {
      if (atual) itens.push(atual);
      atual = { ref: m[1], texto: m[2].trim() };
      continue;
    }
    const s = linha.trim();
    m = PADRAO_TITULO.exec(s);
    if (m && s === s.toUpperCase()) {
      if (atual) itens.push(atual);
      atual = { ref: m[1].trim(), texto: "" };
      continue;
    }
    if (atual && s) atual.texto += (atual.texto ? " " : "") + s;
  }
  if (atual) itens.push(atual);

  // Nota sem numeração nenhuma: o corpo inteiro vira um item só.
  if (itens.length === 0 && texto.trim()) {
    itens.push({ ref: "único", texto: texto.trim() });
  }
  return itens;
}

interface DefinicaoVia {
  via: Via;
  rotulo: string;
  gatilhos: RegExp[];
  nota: string;
}

// Ordem importa: a primeira via cujo gatilho casar vence. As vias mais
// específicas vêm antes das genéricas.
export const VIAS: DefinicaoVia[] = [
  {
    via: "PROVIDENCIA_EXTERNA",
    rotulo: "Providência externa",
    gatilhos: [
      /depende.{0,40}do registro/i,
      /prenotada separadamente/i,
      /registro anterior/i,
      /artigo 195/i,
      /continuidade/i,
    ],
    nota:
      "Depende de ato de terceiro ou de outro protocolo. Não se resolve com " +
      "peça nossa — precisa de acompanhamento próprio.",
  },
  {
    via: "RERRATIFICACAO",
    rotulo: "Escritura de rerratificação",
    gatilhos: [
      /metragem/i,
      /[áa]rea do im[óo]vel/i,
      /confronta/i,
      /descri[çc][ãa]o do im[óo]vel/i,
      /objeto do neg[óo]cio/i,
      /valor do neg[óo]cio/i,
      /pre[çc]o/i,
      /partes? deve[mr][áa] comparecer/i,
    ],
    nota:
      "Toca a substância do negócio ou a descrição do imóvel — exige novo " +
      "ato notarial com comparecimento das partes.",
  },
  {
    via: "REQUERIMENTO",
    rotulo: "Requerimento",
    gatilhos: [
      /apresentar requerimento/i,
      /requerimento neste sentido/i,
      /formato PDF[/-]A/i,
      /certificado digital/i,
    ],
    nota: "Resolve-se por petição do apresentante.",
  },
  {
    via: "JUNTADA",
    rotulo: "Juntada de documento",
    gatilhos: [
      /apresentar a certid[ãa]o/i,
      /apresentar as certid[õo]es/i,
      /certid[ãa]o atualizada/i,
      /c[óo]pia autenticada/i,
      /via original/i,
      /pacto antenupcial/i,
      /guia/i,
      /carn[êe]/i,
      /comprovante/i,
    ],
    nota: "Buscar na pasta do processo; se ausente ou vencida, reemitir.",
  },
  {
    via: "ATA_RETIFICATIVA",
    rotulo: "Ata retificativa",
    gatilhos: [
      // Só verbos de remédio. Princípios registrários ("especialidade
      // subjetiva/objetiva") aparecem tanto em juntada quanto em ata,
      // então não servem de gatilho.
      /deve[rá]{0,3} ser retificad/i,
      /ser retificado para constar/i,
      /aditamento/i,
      /complementa[çc][ãa]o da qualifica[çc][ãa]o/i,
      /n[ãa]o consigna a completa qualifica[çc][ãa]o/i,
      /n[úu]mero correto do contribuinte/i,
      /atual contribuinte/i,
      /nome correto/i,
      /e n[ãa]o como constou/i,
    ],
    nota:
      "Erro material evidente, corrigível de ofício pelo tabelião. " +
      "CONFIRMAR que não altera a declaração de vontade.",
  },
];

// O que a exigência pede, quando é juntada — alimenta a busca na pasta.
const ALVOS: Array<[RegExp, string]> = [
  [/certid[ãa]o.{0,30}casamento/i, "certidão de casamento"],
  [/pacto antenupcial/i, "pacto antenupcial"],
  [/valor venal/i, "certidão de valor venal"],
  [/\bITBI\b/i, "guia de ITBI"],
  [/\bIPTU\b|carn[êe]/i, "carnê de IPTU"],
  [/matr[íi]cula/i, "matrícula"],
  [/procura[çc][ãa]o/i, "procuração"],
];

export function classificar(item: ItemNota): ItemClassificado {
  const t = item.texto;
  for (const v of VIAS) {
    for (const g of v.gatilhos) {
      const m = g.exec(t);
      if (m) {
        return {
          ...item,
          via: v.via,
          rotulo: v.rotulo,
          nota: v.nota,
          gatilho: m[0],
          alvos: ALVOS.filter(([pat]) => pat.test(t)).map(([, nome]) => nome),
          pessoas: pessoasCitadas(t),
        };
      }
    }
  }
  return {
    ...item,
    via: "INDEFINIDO",
    rotulo: "Classificar à mão",
    nota: "Nenhum gatilho conhecido. Item vai para triagem manual.",
    gatilho: null,
    alvos: [],
    pessoas: pessoasCitadas(t),
  };
}

// Nomes em CAIXA ALTA com 2+ palavras — é como as notas referenciam as partes.
const RUIDO =
  /^(QUANTO|CPF|RG|OAB|CNPJ|PDF|ORCPN|CENAD|CNJ|RI|IPTU|ITBI|REGISTRO|IM[ÓO]VEL|MATR[ÍI]CULA|SERVENTIA|LEI|C[ÓO]DIGO|CIVIL)/;

export function pessoasCitadas(t: string): string[] {
  const brutos =
    t.match(/\b[A-ZÀ-Ý]{3,}(?:\s+(?:D[AEO]S?\s+)?[A-ZÀ-Ý]{2,}){1,5}\b/g) ?? [];
  const vistos = new Set<string>();
  const out: string[] = [];
  for (const bruto of brutos) {
    const b = bruto.trim();
    if (RUIDO.test(b) || vistos.has(b) || b.split(/\s+/).length < 2) continue;
    vistos.add(b);
    out.push(b);
  }
  return out;
}

export function triar(texto: string): ItemClassificado[] {
  return decompor(texto).map(classificar);
}

// ---------------------------------------------------------------------------
// Síntese: transforma o texto corrido da exigência num apontamento objetivo
// ("o que fazer" + complemento curto), para a lista da etapa 2. O texto
// integral continua disponível — a síntese nunca o substitui como fonte.

export interface Sintese {
  acao: string;
  complemento: string;
}

const ACAO_VIA: Record<Via, string> = {
  JUNTADA: "Juntar documento",
  ATA_RETIFICATIVA: "Lavrar ata retificativa",
  RERRATIFICACAO: "Lavrar escritura de rerratificação",
  REQUERIMENTO: "Apresentar requerimento",
  PROVIDENCIA_EXTERNA: "Acompanhar providência externa",
  INDEFINIDO: "Classificar à mão",
};

export function sintetizar(item: ItemClassificado): Sintese {
  const acao =
    item.via === "JUNTADA" && item.alvos.length > 0
      ? `Juntar: ${item.alvos.join(", ")}`
      : ACAO_VIA[item.via];

  let t = item.texto.replace(/\s+/g, " ").trim();
  // Fundamentação jurídica não é apontamento — sai da síntese.
  t = t
    .replace(
      /,?\s*(?:em|com)\s+(?:respeito|observ[âa]ncia|aten[çc][ãa]o|conformidade)\s+(?:ao?s?|à|com)\s+princ[íi]pio[^,.;]*/gi,
      ""
    )
    .replace(/,?\s*nos termos d[oa][^,.;]*/gi, "")
    .replace(/,?\s*conforme\s+(?:o\s+)?(?:art(?:igo)?|item)\.?\s*[\d.º°]+[^,.;]*/gi, "")
    .replace(/\s+([,.;])/g, "$1");

  // Primeira frase (sem tropeçar em abreviações), limitada em ~180 chars.
  const semAbrev = t.replace(/\b(fls?|n|art|Sr|Sra|Dr|Dra|nº)\./gi, (m) =>
    m.replace(".", " ")
  );
  const fim = semAbrev.search(/\.(?:\s|$)/);
  if (fim > 30) t = t.slice(0, fim + 1);
  if (t.length > 180) {
    const corte = t.lastIndexOf(" ", 177);
    t = t.slice(0, corte > 100 ? corte : 177) + "…";
  }
  return { acao, complemento: t };
}
