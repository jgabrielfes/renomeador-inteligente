/**
 * IndexedDB do Sucessorista — abridor ÚNICO do banco (versão 2).
 *
 * Stores:
 *  - `rascunho`: o rascunho legado ("caso-atual") — mantido pela migração;
 *  - `casos`: casos completos do modo portátil, chaveados por caseId;
 *  - `config`: handle da pasta-raiz (estruturado-clonável), nome do
 *    dispositivo e cache de resumos do painel.
 *
 * Toda operação falha em silêncio (null/false): persistência local é
 * conforto, nunca requisito — modo anônimo e quota cheia não quebram a folha.
 */

const DB = 'sucessorista';
const VERSAO = 2;
export const STORES = { rascunho: 'rascunho', casos: 'casos', config: 'config' } as const;

export function abrirDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, VERSAO);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const nome of Object.values(STORES)) {
          if (!db.objectStoreNames.contains(nome)) db.createObjectStore(nome);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function idbGet<T>(store: string, chave: IDBValidKey): Promise<T | null> {
  const db = await abrirDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).get(chave);
      req.onsuccess = () => {
        db.close();
        resolve((req.result as T | undefined) ?? null);
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

export async function idbPut(store: string, chave: IDBValidKey, valor: unknown): Promise<boolean> {
  const db = await abrirDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(valor, chave);
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

export async function idbDelete(store: string, chave: IDBValidKey): Promise<boolean> {
  const db = await abrirDb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(chave);
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

export async function idbTodos<T>(store: string): Promise<T[]> {
  const db = await abrirDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const req = db.transaction(store, 'readonly').objectStore(store).getAll();
      req.onsuccess = () => {
        db.close();
        resolve((req.result as T[]) ?? []);
      };
      req.onerror = () => {
        db.close();
        resolve([]);
      };
    } catch {
      db.close();
      resolve([]);
    }
  });
}
