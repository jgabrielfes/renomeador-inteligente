/**
 * Manifesto de documentos do caso e RELIGAMENTO POR HASH.
 *
 * O caso.json guarda uma entrada por documento (caminho, tamanho, mtime,
 * sha256, classificação). Ao varrer a pasta (modo pasta) ou rearrastar os
 * arquivos (modo portátil), o matcher religa cada arquivo ao manifesto sem
 * retrabalho, nesta ordem:
 *
 *  1. caminho idêntico + tamanho/mtime iguais → religa sem reler nem hashear;
 *  2. caminho idêntico, metadados diferentes → re-hasheia; hash mudou =
 *     `alterado` (invalida camposExtraidos);
 *  3. hash igual em caminho diferente → `movido`/renomeado: religa e
 *     atualiza o caminho;
 *  4. sem correspondência → `novo`;
 *  5. entrada sem arquivo → `faltando` (a entrada NÃO é apagada).
 *
 * Motor puro: o hash entra por injeção (`hashDe`), então os testes rodam
 * sem worker e a UI pluga o SHA-256 em blocos com progresso.
 */

export interface EntradaManifesto {
  caminhoRelativo: string;
  nome: string;
  tamanho: number;
  lastModified: number;
  sha256: string;
  mime?: string;
  classificacao?: string;
  lidoEm?: string;
  camposExtraidos?: Record<string, unknown>;
  /** Marcado quando o arquivo não foi encontrado na última varredura. */
  faltando?: boolean;
}

export interface InfoArquivoDisco {
  caminhoRelativo: string;
  nome: string;
  tamanho: number;
  lastModified: number;
  mime?: string;
  /** O arquivo em si, quando disponível (religamento de anexos na UI). */
  file?: File;
}

export type StatusReligamento = 'religado' | 'alterado' | 'movido' | 'novo' | 'faltando';

export interface ItemReligamento {
  caminhoRelativo: string;
  status: StatusReligamento;
  arquivo?: InfoArquivoDisco;
}

export interface DiffManifesto {
  /** Manifesto atualizado (entradas religadas/movidas/alteradas/novas + faltantes marcadas). */
  manifesto: EntradaManifesto[];
  itens: ItemReligamento[];
  resumo: { religados: number; alterados: number; movidos: number; novos: number; faltando: number };
}

export async function casarManifesto(
  arquivos: InfoArquivoDisco[],
  manifesto: EntradaManifesto[],
  hashDe: (arquivo: InfoArquivoDisco) => Promise<string>,
): Promise<DiffManifesto> {
  const porCaminho = new Map(manifesto.map((m) => [m.caminhoRelativo, m]));
  const casadas = new Set<EntradaManifesto>();
  const saida: EntradaManifesto[] = [];
  const itens: ItemReligamento[] = [];
  const pendentes: InfoArquivoDisco[] = [];

  const religa = (m: EntradaManifesto, a: InfoArquivoDisco, status: StatusReligamento, extra: Partial<EntradaManifesto> = {}) => {
    casadas.add(m);
    saida.push({
      ...m,
      caminhoRelativo: a.caminhoRelativo,
      nome: a.nome,
      tamanho: a.tamanho,
      lastModified: a.lastModified,
      mime: a.mime ?? m.mime,
      faltando: undefined,
      ...extra,
    });
    itens.push({ caminhoRelativo: a.caminhoRelativo, status, arquivo: a });
  };

  /* passos 1 e 2: pelo caminho */
  for (const a of arquivos) {
    const m = porCaminho.get(a.caminhoRelativo);
    if (!m || casadas.has(m)) {
      pendentes.push(a);
      continue;
    }
    if (m.tamanho === a.tamanho && m.lastModified === a.lastModified) {
      religa(m, a, 'religado');
      continue;
    }
    const hash = await hashDe(a);
    if (hash === m.sha256) {
      religa(m, a, 'religado'); // só o mtime mudou (cópia/sincronização)
    } else {
      religa(m, a, 'alterado', { sha256: hash, camposExtraidos: undefined, lidoEm: undefined });
    }
  }

  /* passo 3: movidos/renomeados pelo hash; passo 4: novos */
  const soltas = manifesto.filter((m) => !casadas.has(m));
  const porHash = new Map<string, EntradaManifesto[]>();
  for (const m of soltas) {
    const lista = porHash.get(m.sha256) ?? [];
    lista.push(m);
    porHash.set(m.sha256, lista);
  }
  for (const a of pendentes) {
    const hash = await hashDe(a);
    const candidatas = porHash.get(hash) ?? [];
    const m = candidatas.find((x) => !casadas.has(x));
    if (m) {
      religa(m, a, 'movido');
    } else {
      saida.push({
        caminhoRelativo: a.caminhoRelativo,
        nome: a.nome,
        tamanho: a.tamanho,
        lastModified: a.lastModified,
        sha256: hash,
        mime: a.mime,
      });
      itens.push({ caminhoRelativo: a.caminhoRelativo, status: 'novo', arquivo: a });
    }
  }

  /* passo 5: entradas sem arquivo ficam marcadas, nunca apagadas */
  for (const m of manifesto) {
    if (casadas.has(m)) continue;
    saida.push({ ...m, faltando: true });
    itens.push({ caminhoRelativo: m.caminhoRelativo, status: 'faltando' });
  }

  const conta = (s: StatusReligamento) => itens.filter((i) => i.status === s).length;
  return {
    manifesto: saida,
    itens,
    resumo: {
      religados: conta('religado'),
      alterados: conta('alterado'),
      movidos: conta('movido'),
      novos: conta('novo'),
      faltando: conta('faltando'),
    },
  };
}

/** Frase objetiva do resultado: "48 religados, 2 novos, 1 não encontrado". */
export function resumoDoDiff(d: DiffManifesto): string {
  const partes: string[] = [];
  const r = d.resumo;
  if (r.religados > 0) partes.push(`${r.religados} religado(s)`);
  if (r.movidos > 0) partes.push(`${r.movidos} movido(s)/renomeado(s)`);
  if (r.alterados > 0) partes.push(`${r.alterados} alterado(s)`);
  if (r.novos > 0) partes.push(`${r.novos} novo(s)`);
  if (r.faltando > 0) partes.push(`${r.faltando} não encontrado(s)`);
  return partes.length > 0 ? `Documentos: ${partes.join(', ')}.` : 'Nenhum documento na pasta.';
}
