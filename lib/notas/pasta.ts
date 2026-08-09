// Índice da pasta do caso.
//
// O usuário arrasta a pasta inteira: nela vivem a nota devolutiva, o
// traslado da escritura (.docx) e o acervo de documentos. Este módulo
// distribui os papéis (quem é a nota, quem é o traslado, o que é acervo)
// e detecta o tipo de cada documento — é a etapa 1 do pipeline da
// especificação: sem o índice da pasta, "localizar o documento que já está
// na pasta" degenera em busca por nome de arquivo.
//
// A detecção de tipo prioriza o NOME do arquivo: no fluxo da aplicação a
// pasta já passou pelo renomeador, então os nomes carregam o tipo
// ("Certidão de Casamento - Fulana.pdf"). O texto é o desempate.

import { decompor } from "./resolvedor";

export type Papel = "nota" | "traslado" | "documento";

export interface ArquivoDoCaso {
  nome: string;
  texto: string; // texto barato já extraído; vazio para escaneados/imagens
}

// Tipos do acervo. Os sete primeiros usam EXATAMENTE os nomes que
// classificar() devolve em `alvos` — é o que permite casar a exigência de
// juntada com o documento da pasta por igualdade simples.
const TIPOS: Array<[RegExp, string]> = [
  [/certid[ãa]o.{0,25}casamento/i, "certidão de casamento"],
  [/pacto\s+antenupcial/i, "pacto antenupcial"],
  [/valor\s+venal/i, "certidão de valor venal"],
  [/\bITBI\b/i, "guia de ITBI"],
  [/\bIPTU\b|carn[êe]/i, "carnê de IPTU"],
  [/matr[íi]cula/i, "matrícula"],
  [/procura[çc][ãa]o/i, "procuração"],
  // demais tipos, só para leitura humana do índice
  [/certid[ãa]o.{0,25}nascimento/i, "certidão de nascimento"],
  [/certid[ãa]o.{0,25}[óo]bito/i, "certidão de óbito"],
  [/\bCNDT\b|d[ée]bitos?\s+trabalhistas/i, "CNDT"],
  [/formal\s+de\s+partilha/i, "formal de partilha"],
  [/\bCNH\b|habilita[çc][ãa]o/i, "CNH"],
  [/\bRG\b|carteira\s+de\s+identidade/i, "RG"],
  [/comprovante.{0,25}(endere[çc]o|resid[êe]ncia)/i, "comprovante de endereço"],
  [/procedimento|requerimento/i, "requerimento"],
  [/escritura/i, "escritura"],
  [/contrato/i, "contrato"],
];

export function tipoDoDocumento(nome: string, texto = ""): string | null {
  for (const [pat, tipo] of TIPOS) if (pat.test(nome)) return tipo;
  // Só o começo do texto: título do documento, não menções de passagem.
  const inicio = texto.slice(0, 600);
  for (const [pat, tipo] of TIPOS) if (pat.test(inicio)) return tipo;
  return null;
}

export function pontuarNota(a: ArquivoDoCaso): number {
  let s = 0;
  if (/nota/i.test(a.nome)) s += 2;
  if (/devolutiv|devolu[çc][ãa]o/i.test(a.nome)) s += 2;
  if (/exig[êe]ncia/i.test(a.nome)) s += 2;
  const t = a.texto;
  if (!t) return s;
  if (/nota\s+(?:de\s+)?devolu(?:[çc][ãa]o|tiva)/i.test(t)) s += 3;
  if (/prenota[çc]/i.test(t)) s += 2;
  if (/exig[êe]ncia/i.test(t)) s += 1;
  if (/apresentar|retificad|requerimento/i.test(t)) s += 1;
  if (decompor(t).length >= 2) s += 1;
  return s;
}

export function pontuarTraslado(a: ArquivoDoCaso): number {
  let s = 0;
  if (/traslado/i.test(a.nome)) s += 3;
  if (/escritura/i.test(a.nome)) s += 1;
  if (/\.docx$/i.test(a.nome)) s += 1;
  const t = a.texto;
  if (!t) return s;
  if (/TRASLADO\s*[–—-]\s*LIVRO/i.test(t)) s += 6;
  if (/SAIBAM/i.test(t)) s += 2;
  if (/QUE FAZEM/i.test(t)) s += 1;
  if (/a saber:/i.test(t)) s += 1;
  return s;
}

// Distribui os papéis: primeiro o traslado (o cabeçalho "TRASLADO – LIVRO"
// é quase definitivo), depois a nota entre os restantes. Devolve um array
// alinhado com a entrada.
export function distribuirPapeis(arquivos: ArquivoDoCaso[]): Papel[] {
  const papeis: Papel[] = arquivos.map(() => "documento");

  let melhor = -1;
  let melhorS = 0;
  arquivos.forEach((a, i) => {
    const s = pontuarTraslado(a);
    if (s > melhorS) {
      melhorS = s;
      melhor = i;
    }
  });
  if (melhor >= 0 && melhorS >= 3) papeis[melhor] = "traslado";

  let melhorNota = -1;
  let melhorNotaS = 0;
  arquivos.forEach((a, i) => {
    if (papeis[i] !== "documento") return;
    const s = pontuarNota(a);
    if (s > melhorNotaS) {
      melhorNotaS = s;
      melhorNota = i;
    }
  });
  if (melhorNota >= 0 && melhorNotaS >= 3) papeis[melhorNota] = "nota";

  return papeis;
}

// --- campos que a própria nota declara -------------------------------------

export function extrairPrenotacao(texto: string): string | null {
  const m =
    /prenota[çc][ãa]o\s*(?:sob\s*)?n?[°º]?\s*[.:]?\s*([\d./-]{3,})/i.exec(
      texto
    );
  return m ? m[1].replace(/[.,]+$/, "") : null;
}

// "Ler o prazo da própria nota, nunca calcular": as serventias divergem
// entre data fixa impressa e "20 dias úteis".
export function extrairPrazo(texto: string): string | null {
  let m =
    /(?:validade|v[áa]lida?)\s+at[ée]\s+(?:o\s+dia\s+)?(\d{2}\/\d{2}\/\d{4})/i.exec(
      texto
    );
  if (m) return `válida até ${m[1]}`;
  m = /(\d{1,2})\s*(?:\([^)]{0,20}\))?\s*dias\s+[úu]teis/i.exec(texto);
  if (m) return `${m[1]} dias úteis`;
  return null;
}

export function extrairServentia(texto: string): string | null {
  const m =
    /(\d+\s*[ºo°]?\s*(?:Oficial\s+d[eo]\s+)?Registro\s+(?:de\s+Im[óo]veis|Imobili[áa]rio)[^\n,;.]{0,40}|Registro\s+de\s+Im[óo]veis\s+(?:de|da\s+Comarca\s+de)\s+[^\n,;.]{3,40})/i.exec(
      texto
    );
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}
