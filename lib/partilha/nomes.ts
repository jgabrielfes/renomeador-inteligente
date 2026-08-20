/**
 * Comparação de NOMES entre documentos e a folha — motor puro (com testes).
 *
 * Documentos reais nunca trazem o nome "limpo": a certidão de óbito declara
 * os filhos com qualificadores ("Pedro Vitor, maior"), o registro aquisitivo
 * intercala RG/CPF/nacionalidade entre os nomes, e grafia/acento variam. O
 * cruzamento de contexto (alertas de leitura, titularidade da matrícula)
 * compara por PALAVRAS — nunca por igualdade/substring cruas.
 */

const normalizar = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();

/** Conectivos que não pesam na comparação palavra a palavra. */
const CONECTIVOS = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);

export const palavrasDoNome = (s: string): string[] =>
  normalizar(s)
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((p) => p && !CONECTIVOS.has(p));

/**
 * Nome contido num texto, PALAVRA a palavra e EM SEQUÊNCIA (ignorando
 * acentos, pontuação e conectivos): "Pedro Vitor" da certidão de óbito
 * consta em "Pedro Vitor Barros Silva" da ficha, e "Francisco Dimas da
 * Silva" consta no registro aquisitivo "vendido a FRANCISCO DIMAS DA SILVA
 * (RG nº …), brasileiro, solteiro…". A sequência é obrigatória — juntar
 * "João" de uma pessoa com "Silva" de outra NÃO é o mesmo nome.
 */
export function nomeConstaEm(nome: string, texto: string): boolean {
  const partes = palavrasDoNome(nome);
  const alvo = palavrasDoNome(texto);
  if (partes.length === 0 || alvo.length < partes.length) return false;
  for (let i = 0; i + partes.length <= alvo.length; i++) {
    let casa = true;
    for (let j = 0; j < partes.length; j++) {
      if (alvo[i + j] !== partes[j]) {
        casa = false;
        break;
      }
    }
    if (casa) return true;
  }
  return false;
}

/**
 * Remove os QUALIFICADORES que a certidão de óbito apõe ao nome dos filhos
 * ("Pedro Vitor, maior", "Ana, menor impúbere", "José, 22 anos", "capaz") —
 * não são nome e quebram o cruzamento com o item I.
 */
export function semQualificadoresDeNome(nome: string): string {
  let s = nome.trim();
  for (let i = 0; i < 4; i++) {
    const antes = s;
    s = s
      .replace(/[\s,;–—-]+(maior(es)?|menor(es)?)(\s+(de\s+idade|imp[uú]bere(s)?|p[uú]bere(s)?))?\s*$/i, '')
      .replace(/[\s,;–—-]+(capaz(es)?|incapaz(es)?)\s*$/i, '')
      .replace(/[\s,;–—-]+\d{1,3}\s*anos?(\s+de\s+idade)?\s*$/i, '')
      .replace(/[\s,;–—-]+e\s*$/i, '') // "maior E capaz" deixa um "e" solto
      .replace(/[\s,;]+$/, '')
      .trim();
    if (s === antes) break;
  }
  return s;
}
