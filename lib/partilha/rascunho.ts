/**
 * Rascunho local LEGADO do caso ("caso-atual") em IndexedDB — mantido para a
 * migração ao novo painel "Meus casos" (lib/partilha/caso-store.ts). Nada
 * sai da máquina. O banco agora é aberto pelo abridor único de idb.ts
 * (versão 2, com os stores de casos e config).
 */

import { idbDelete, idbGet, idbPut, STORES } from './idb';

const CHAVE = 'caso-atual';

export interface RascunhoSalvo {
  dados: unknown;
  salvoEm: string;
}

export async function salvarRascunho(dados: unknown): Promise<string | null> {
  const salvoEm = new Date().toISOString();
  const ok = await idbPut(STORES.rascunho, CHAVE, { dados, salvoEm } satisfies RascunhoSalvo);
  return ok ? salvoEm : null;
}

export async function carregarRascunho(): Promise<RascunhoSalvo | null> {
  const r = await idbGet<RascunhoSalvo>(STORES.rascunho, CHAVE);
  return r && typeof r === 'object' && 'dados' in r ? r : null;
}

export async function limparRascunho(): Promise<boolean> {
  return idbDelete(STORES.rascunho, CHAVE);
}
