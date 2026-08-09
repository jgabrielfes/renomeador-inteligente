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

// Os alvos só valem perto de um verbo de comando. A nota cita "matrícula nº
// 131.131" para IDENTIFICAR o imóvel e o rodapé padrão lista "carnê do iptu,
// guia do itbi" como aviso genérico — nada disso é pedido. O que o oficial
// manda apresentar vem logo depois do verbo (calibrado na nota 4.720/2026:
// só a certidão de casamento é exigida, embora ITBI, IPTU e matrícula
// apareçam no texto).
const VERBOS_COMANDO =
  /(?:re)?apresentar|juntar|exibir|instruir|anexar|acompanhad[oa]s?\s+d[eo]|munid[oa]s?\s+d[eo]/gi;
const JANELA_COMANDO = 260;

export function alvosDe(t: string): string[] {
  const janelas: string[] = [];
  for (const m of t.matchAll(VERBOS_COMANDO)) {
    janelas.push(t.slice(m.index, m.index + JANELA_COMANDO));
  }
  // Sem verbo nenhum ("certidão vencida", "falta o pacto"), o texto todo vale.
  const base = janelas.length > 0 ? janelas.join("\n") : t;
  return ALVOS.filter(([pat]) => pat.test(base)).map(([, nome]) => nome);
}

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
          alvos: alvosDe(t),
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

// A nota impressa carrega blocos que não são exigência: o recibo, o aviso de
// funcionamento, o rodapé "ATENÇÃO: documentos anexos ao título, tais como
// carnê do iptu, guia do itbi…" (presente em TODA nota da serventia) e a
// assinatura do escrevente. Se entrarem na triagem, viram alvos e pessoas
// falsos. O corte é no primeiro marcador de fim de teor.
const FIM_DO_TEOR: RegExp[] = [
  /Exig[êe]ncia elaborada por/i,
  /^\s*RECIBO\s*$/im,
  /Declaro haver recebido/i,
  /^\s*IMPORTANTE\s*$/im,
  /Hor[áa]rio de funcionamento/i,
  /\*?\s*ATEN[ÇC][ÃA]O\s*:\s*documentos anexos/i,
  /N[ãa]o concordando com os termos/i,
  /Impresso em/i,
  /Para gerar o boleto/i,
];

export function limparNota(texto: string): string {
  let corte = texto.length;
  for (const pat of FIM_DO_TEOR) {
    const m = pat.exec(texto);
    if (m && m.index > 0 && m.index < corte) corte = m.index;
  }
  return texto.slice(0, corte).trim();
}

export function triar(texto: string): ItemClassificado[] {
  return decompor(limparNota(texto)).map(classificar);
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
