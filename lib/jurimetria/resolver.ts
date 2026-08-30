/**
 * Resolução de cartório e titular — MOTOR PURO.
 *
 * O cartório citado nos documentos aparece de mil formas ("2º RI da Capital",
 * "Segundo Oficial de Registro de Imóveis de São Paulo", "2º ORI-SP"); a
 * resolução normaliza e casa contra nome canônico + aliases da tabela.
 *
 * O TITULAR é o(a) registrador(a) vigente NA DATA do documento (princípio:
 * entendimento pertence ao registrador, não ao cartório): o vigente é o de
 * maior `titularDesde` ≤ data. Sem titular cadastrado → titularPendente.
 */

import type { CartorioRef, TitularRef } from './tipos';

const ORDINAIS: Record<string, string> = {
  primeiro: '1', segundo: '2', terceiro: '3', quarto: '4', quinto: '5',
  sexto: '6', setimo: '7', oitavo: '8', nono: '9', decimo: '10',
};

export function normalizarNomeCartorio(s: string): string {
  let n = s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°]/g, '')
    .replace(/\b(\d+)[oa]\b/g, '$1') // "2o"/"2a" → "2" (sem comer o "o" de "registro")
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // "decimo oitavo" → "18"; "primeiro" → "1".
  n = n.replace(/\bdecimo (primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|oitavo)\b/g, (_, u: string) =>
    String(10 + Number(ORDINAIS[u])),
  );
  n = n.replace(/\b(primeiro|segundo|terceiro|quarto|quinto|sexto|setimo|oitavo|nono|decimo)\b/g, (m) => ORDINAIS[m]);
  // Sinônimos institucionais → forma única "ri".
  n = n
    .replace(/\boficial de registro de imoveis\b/g, 'ri')
    .replace(/\bregistro de imoveis\b/g, 'ri')
    .replace(/\bregistro imobiliario\b/g, 'ri')
    .replace(/\bcartorio de ri\b/g, 'ri')
    .replace(/\bori\b/g, 'ri')
    .replace(/\bsp\b/g, 'sao paulo')
    .replace(/\bcapital\b/g, 'sao paulo')
    .replace(/\b(da|de|do|dos|das|comarca|municipio|cidade|local)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return n;
}

export function resolverCartorio(
  mencionado: string | null | undefined,
  cartorios: CartorioRef[],
): string | null {
  if (!mencionado || !mencionado.trim()) return null;
  const alvo = normalizarNomeCartorio(mencionado);
  if (!alvo) return null;
  for (const c of cartorios) {
    const formas = [c.nome, ...c.aliases].map(normalizarNomeCartorio);
    if (formas.some((f) => f === alvo)) return c.id;
  }
  // Casamento frouxo: mesmas palavras-chave, mesma numeração ("2 ri sao paulo").
  const alvoPartes = new Set(alvo.split(' '));
  for (const c of cartorios) {
    const formas = [c.nome, ...c.aliases].map(normalizarNomeCartorio);
    if (
      formas.some((f) => {
        const partes = f.split(' ');
        return partes.length > 0 && partes.every((p) => alvoPartes.has(p));
      })
    )
      return c.id;
  }
  return null;
}

/** Proposta de cadastro AUTOMÁTICO de serventia a partir de uma menção. */
export interface CartorioNovo {
  id: string;
  nome: string;
  cidade: string;
}

/**
 * O catálogo de cartórios CRESCE sozinho: quando a decisão nomeia uma
 * serventia que não casa com nenhum cadastro, esta função extrai da menção
 * o número (dígito ou por extenso) e o MUNICÍPIO e propõe o cadastro
 * canônico — sem município a menção é vaga demais (fica null), e na
 * Capital o número é obrigatório (são 18 RIs; "RI de São Paulo" sozinho é
 * ambíguo). Puro e testável; quem grava é o worker (upsert idempotente).
 */
export function cartorioDaMencao(mencionado: string | null | undefined): CartorioNovo | null {
  const bruta = (mencionado ?? '').replace(/\s+/g, ' ').trim();
  if (!/registro\s+de\s+im[óo]veis/i.test(bruta)) return null;

  const digito = /(?:^|\s)(\d{1,2})\s*[ºo°.]?\s+(?:oficial|of[íi]cio|registro|cart[óo]rio|ri\b)/i.exec(bruta)?.[1];
  const extensoBruto = /\b(primeiro|segundo|terceiro|quarto|quinto|sexto|s[ée]timo|oitavo|nono|d[ée]cimo)\b/i
    .exec(bruta)?.[1]
    ?.normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  const numero = digito ?? (extensoBruto ? ORDINAIS[extensoBruto] : undefined);

  const m = /im[óo]veis(?:\s*,?\s*t[íi]tulos\s+e\s+documentos)?(?:\s+e\s+anexos?)?(?:\s+(?:da|de)\s+comarca)?\s+d[eao]s?\s+([A-Za-zÀ-ú][A-Za-zÀ-ú' ]{1,50})/i.exec(
    bruta,
  );
  if (!m) return null;
  let cidade = m[1].split(/[\/,;.()–—-]/)[0].replace(/\s+/g, ' ').trim();
  cidade = cidade
    .replace(/\s+(?:no|na|nos|nas|em|para|que|onde|neste|nesta|desta|deste|pelo|pela)\b.*$/i, '')
    .replace(/\s+estado(?:\s+de\s+s[ãa]o\s+paulo)?$/i, '')
    .replace(/\s+sp$/i, '')
    .trim();
  if (!cidade || cidade.split(' ').length > 5) return null;
  if (/^capital$/i.test(cidade)) cidade = 'São Paulo';

  const ehCapital = normalizarNomeCartorio(cidade) === 'sao paulo';
  if (ehCapital && !numero) return null; // 18 RIs na Capital — sem número é ambíguo

  const slug = cidade
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, '')
    .trim()
    .replace(/\s+/g, '-');
  if (slug.length < 2) return null;
  const nn = numero ? numero.padStart(2, '0') : null;
  // A Capital reaproveita o esquema de id da semente (ri-sp-01…18) — o
  // upsert cai na linha existente em vez de duplicar.
  const id = (ehCapital ? `ri-sp-${nn}` : nn ? `ri-${slug}-${nn}` : `ri-${slug}`).slice(0, 40);
  const nome = `${numero ? `${numero}º ` : ''}Oficial de Registro de Imóveis de ${cidade}/SP`;
  return { id, nome, cidade };
}

export function resolverTitular(
  titulares: TitularRef[],
  cartorioId: string,
  dataDocumento: Date,
): { titularId: string | null; titularPendente: boolean } {
  const vigente = titulares
    .filter((t) => t.cartorioId === cartorioId && t.titularDesde.getTime() <= dataDocumento.getTime())
    .sort((a, b) => b.titularDesde.getTime() - a.titularDesde.getTime())[0];
  return vigente
    ? { titularId: vigente.id, titularPendente: false }
    : { titularId: null, titularPendente: true };
}
