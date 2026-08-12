/**
 * Rascunho local do caso em IndexedDB — sobrevive ao F5 E ao fechar o
 * navegador (o sessionStorage morria com a aba). Nada sai da máquina: é o
 * mesmo desenho de privacidade do módulo, só que persistente.
 *
 * Wrapper mínimo sem dependência: um banco ("sucessorista"), um store
 * ("rascunho"), uma chave ("caso-atual"). Toda operação falha em silêncio
 * devolvendo null/false — rascunho é conforto, nunca requisito (modo
 * anônimo, quota cheia e afins não podem quebrar a folha).
 */

const DB = 'sucessorista';
const STORE = 'rascunho';
const CHAVE = 'caso-atual';

export interface RascunhoSalvo {
  dados: unknown;
  salvoEm: string;
}

function abrir(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function salvarRascunho(dados: unknown): Promise<string | null> {
  const db = await abrir();
  if (!db) return null;
  const salvoEm = new Date().toISOString();
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put({ dados, salvoEm } satisfies RascunhoSalvo, CHAVE);
      tx.oncomplete = () => {
        db.close();
        resolve(salvoEm);
      };
      tx.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function carregarRascunho(): Promise<RascunhoSalvo | null> {
  const db = await abrir();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(CHAVE);
      req.onsuccess = () => {
        db.close();
        const r = req.result as RascunhoSalvo | undefined;
        resolve(r && typeof r === 'object' && 'dados' in r ? r : null);
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

export async function limparRascunho(): Promise<boolean> {
  const db = await abrir();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(CHAVE);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}
