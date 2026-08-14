/**
 * Modo PASTA do CaseStore — a pasta do processo É o banco de dados.
 *
 * File System Access API: o usuário escolhe UMA vez a pasta-raiz (ex.:
 * `G:\Meu Drive\Inventários`); cada subpasta com `caso.json` é um caso. O
 * app só escreve `caso.json` e `.sucessorista/**` — documentos do usuário
 * JAMAIS são movidos, renomeados ou reescritos.
 *
 * Escrita segura via helpers de lib/fs.ts (abort em falha = sem arquivo
 * truncado; o createWritable comita no close). Antes de sobrescrever:
 * backup rotativo (10 últimos) e GUARDA DE CONFLITO — relê o caso.json e
 * compara `atualizadoEm` com a base carregada ao abrir; divergiu (outro
 * computador salvou via Drive/OneDrive), devolve o conflito em vez de
 * sobrescrever.
 */

import { overwriteFile } from '@/lib/fs';
import {
  migrarArquivoCaso,
  montarArquivoCaso,
  novoCabecalho,
  higienizarNomePasta,
  type ArquivoCaso,
  type CaseStore,
  type OpcoesSalvamento,
  type ResultadoSalvamento,
  type ResumoCaso,
} from './caso-store';
import { casarManifesto, type DiffManifesto, type InfoArquivoDisco } from './manifesto';
import { sha256DeBlob } from './sha256';
import { idbGet, idbPut, STORES } from './idb';

const CHAVE_RAIZ = 'raizCasos';
const CHAVE_DISPOSITIVO = 'dispositivo';
const CHAVE_CACHE = 'cache-resumos';
const ARQUIVO_CASO = 'caso.json';
const PASTA_APP = '.sucessorista';
const PASTA_ARQUIVADOS = '_Arquivados';
const MAX_BACKUPS = 10;

/** O modo pasta está disponível neste navegador/contexto? */
export function pastaDisponivel(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showDirectoryPicker' in window &&
    window.isSecureContext &&
    window.self === window.top
  );
}

export async function raizSalva(): Promise<FileSystemDirectoryHandle | null> {
  return idbGet<FileSystemDirectoryHandle>(STORES.config, CHAVE_RAIZ);
}

export async function dispositivoSalvo(): Promise<string | null> {
  return idbGet<string>(STORES.config, CHAVE_DISPOSITIVO);
}

export async function salvarDispositivo(nome: string): Promise<void> {
  await idbPut(STORES.config, CHAVE_DISPOSITIVO, nome);
}

/** Cache dos cabeçalhos para o painel pintar instantaneamente. */
export async function cacheDeResumos(): Promise<ResumoCaso[]> {
  return (await idbGet<ResumoCaso[]>(STORES.config, CHAVE_CACHE)) ?? [];
}

async function gravarCacheDeResumos(resumos: ResumoCaso[]): Promise<void> {
  await idbPut(STORES.config, CHAVE_CACHE, resumos);
}

/** Pede a pasta-raiz ao usuário (exige gesto). null = cancelou (AbortError). */
export async function escolherRaiz(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const picker = (
      window as unknown as {
        showDirectoryPicker: (o: object) => Promise<FileSystemDirectoryHandle>;
      }
    ).showDirectoryPicker;
    const handle = await picker({ id: 'sucessorista-raiz', mode: 'readwrite', startIn: 'documents' });
    await idbPut(STORES.config, CHAVE_RAIZ, handle);
    // Sem persist() o navegador pode despejar o IndexedDB — e o handle junto.
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* melhor esforço */
    }
    return handle;
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return null; // cancelou: não é erro
    throw err;
  }
}

export type EstadoPermissao = 'granted' | 'prompt' | 'denied' | 'sem-raiz' | 'raiz-sumiu';

export async function estadoDaRaiz(): Promise<{ estado: EstadoPermissao; raiz: FileSystemDirectoryHandle | null }> {
  const raiz = await raizSalva();
  if (!raiz) return { estado: 'sem-raiz', raiz: null };
  try {
    const q = await (
      raiz as unknown as { queryPermission: (o: object) => Promise<PermissionState> }
    ).queryPermission({ mode: 'readwrite' });
    return { estado: q as EstadoPermissao, raiz };
  } catch {
    return { estado: 'raiz-sumiu', raiz };
  }
}

/** requestPermission exige gesto do usuário — chamar só no clique. */
export async function pedirPermissao(raiz: FileSystemDirectoryHandle): Promise<boolean> {
  try {
    const r = await (
      raiz as unknown as { requestPermission: (o: object) => Promise<PermissionState> }
    ).requestPermission({ mode: 'readwrite' });
    return r === 'granted';
  } catch {
    return false;
  }
}

export class FolderCaseStore implements CaseStore {
  readonly modo = 'pasta' as const;
  /** caseId → nome da subpasta (preenchido pela varredura). */
  private pastas = new Map<string, string>();

  constructor(
    private raiz: FileSystemDirectoryHandle,
    private atualizadoPor: string,
  ) {}

  private async pastaDoCaso(caseId: string): Promise<FileSystemDirectoryHandle | null> {
    const nome = this.pastas.get(caseId);
    if (nome) {
      try {
        return await this.raiz.getDirectoryHandle(nome);
      } catch {
        this.pastas.delete(caseId); // pasta renomeada — revarre
      }
    }
    await this.listarCasos();
    const denovo = this.pastas.get(caseId);
    if (!denovo) return null;
    try {
      return await this.raiz.getDirectoryHandle(denovo);
    } catch {
      return null;
    }
  }

  async listarCasos(): Promise<ResumoCaso[]> {
    const resumos: ResumoCaso[] = [];
    this.pastas.clear();
    for await (const [nome, handle] of this.raiz as unknown as AsyncIterable<
      [string, FileSystemHandle]
    >) {
      if (handle.kind !== 'directory' || nome === PASTA_ARQUIVADOS || nome.startsWith('.')) continue;
      try {
        const arquivo = await (handle as FileSystemDirectoryHandle).getFileHandle(ARQUIVO_CASO);
        const caso = migrarArquivoCaso(JSON.parse(await (await arquivo.getFile()).text()));
        if (!caso) continue;
        this.pastas.set(caso.cabecalho.caseId, nome);
        resumos.push({ cabecalho: caso.cabecalho, modo: this.modo, caminhoPasta: nome });
      } catch {
        // subpasta sem caso.json (ou ilegível) não é caso — ignora
      }
    }
    await gravarCacheDeResumos(resumos);
    return resumos;
  }

  async abrirCaso(id: string): Promise<ArquivoCaso | null> {
    const pasta = await this.pastaDoCaso(id);
    if (!pasta) return null;
    try {
      const arquivo = await pasta.getFileHandle(ARQUIVO_CASO);
      return migrarArquivoCaso(JSON.parse(await (await arquivo.getFile()).text()));
    } catch {
      return null;
    }
  }

  async salvarCaso(caso: ArquivoCaso, opcoes: OpcoesSalvamento): Promise<ResultadoSalvamento> {
    const pasta = await this.pastaDoCaso(caso.cabecalho.caseId);
    if (!pasta) return { ok: false, erro: 'Pasta do caso não encontrada — ela foi movida?' };

    try {
      /* guarda de conflito: alguém (outro computador via pasta sincronizada)
         salvou depois que este caso foi aberto? */
      let anterior: { texto: string; caso: ArquivoCaso } | null = null;
      try {
        const atual = await pasta.getFileHandle(ARQUIVO_CASO);
        const texto = await (await atual.getFile()).text();
        const noDisco = migrarArquivoCaso(JSON.parse(texto));
        if (noDisco) anterior = { texto, caso: noDisco };
      } catch {
        anterior = null; // primeiro salvamento nesta pasta
      }
      if (
        anterior &&
        !opcoes.forcar &&
        opcoes.baseAtualizadoEm !== null &&
        anterior.caso.cabecalho.atualizadoEm !== opcoes.baseAtualizadoEm
      ) {
        return {
          ok: false,
          conflito: {
            atualizadoEm: anterior.caso.cabecalho.atualizadoEm,
            atualizadoPor: anterior.caso.cabecalho.atualizadoPor || 'outro dispositivo',
            arquivoNoDisco: anterior.caso,
          },
        };
      }

      /* backup rotativo da versão anterior */
      if (anterior) await this.guardarBackup(pasta, anterior.texto);

      const salvoEm = new Date().toISOString();
      const pronto: ArquivoCaso = {
        ...caso,
        cabecalho: { ...caso.cabecalho, atualizadoEm: salvoEm, atualizadoPor: this.atualizadoPor },
      };
      const handle = await pasta.getFileHandle(ARQUIVO_CASO, { create: true });
      await overwriteFile(handle, new Blob([JSON.stringify(pronto, null, 2)], { type: 'application/json' }));
      return { ok: true, salvoEm };
    } catch (err) {
      const nome = (err as DOMException)?.name;
      if (nome === 'NotAllowedError') return { ok: false, erro: 'Permissão da pasta perdida.' };
      return { ok: false, erro: err instanceof Error ? err.message : 'Falha ao gravar o caso.' };
    }
  }

  private async guardarBackup(pasta: FileSystemDirectoryHandle, texto: string): Promise<void> {
    try {
      const app = await pasta.getDirectoryHandle(PASTA_APP, { create: true });
      const backups = await app.getDirectoryHandle('backups', { create: true });
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
      const handle = await backups.getFileHandle(`caso.${carimbo}.json`, { create: true });
      await overwriteFile(handle, new Blob([texto], { type: 'application/json' }));
      /* poda: mantém os 10 últimos */
      const nomes: string[] = [];
      for await (const [nome, h] of backups as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (h.kind === 'file' && nome.startsWith('caso.')) nomes.push(nome);
      }
      nomes.sort();
      for (const velho of nomes.slice(0, Math.max(0, nomes.length - MAX_BACKUPS))) {
        await backups.removeEntry(velho);
      }
    } catch {
      // backup é melhor esforço — nunca impede o salvamento
    }
  }

  async listarBackups(caseId: string): Promise<{ nome: string; quando: string }[]> {
    const pasta = await this.pastaDoCaso(caseId);
    if (!pasta) return [];
    try {
      const app = await pasta.getDirectoryHandle(PASTA_APP);
      const backups = await app.getDirectoryHandle('backups');
      const lista: { nome: string; quando: string }[] = [];
      for await (const [nome, h] of backups as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (h.kind === 'file' && nome.startsWith('caso.')) lista.push({ nome, quando: nome.slice(5, -5) });
      }
      return lista.sort((a, b) => (a.nome < b.nome ? 1 : -1));
    } catch {
      return [];
    }
  }

  async restaurarBackup(caseId: string, nomeBackup: string): Promise<ArquivoCaso | null> {
    const pasta = await this.pastaDoCaso(caseId);
    if (!pasta) return null;
    try {
      const app = await pasta.getDirectoryHandle(PASTA_APP);
      const backups = await app.getDirectoryHandle('backups');
      const arquivo = await backups.getFileHandle(nomeBackup);
      const caso = migrarArquivoCaso(JSON.parse(await (await arquivo.getFile()).text()));
      if (!caso) return null;
      const destino = await pasta.getFileHandle(ARQUIVO_CASO, { create: true });
      await overwriteFile(destino, new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }));
      return caso;
    } catch {
      return null;
    }
  }

  /** Grava a versão em conflito como cópia, sem tocar no caso.json. */
  async salvarComoConflito(caso: ArquivoCaso): Promise<boolean> {
    const pasta = await this.pastaDoCaso(caso.cabecalho.caseId);
    if (!pasta) return false;
    try {
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
      const handle = await pasta.getFileHandle(`caso.conflito.${carimbo}.json`, { create: true });
      await overwriteFile(handle, new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }));
      return true;
    } catch {
      return false;
    }
  }

  async criarCaso(titulo: string, dadosIniciais: unknown): Promise<ArquivoCaso> {
    const nome = higienizarNomePasta(titulo);
    const pasta = await this.raiz.getDirectoryHandle(nome, { create: true });
    /* pasta já usada por outro caso? cria "nome (2)" em vez de misturar */
    let nomeFinal = nome;
    try {
      await pasta.getFileHandle(ARQUIVO_CASO);
      for (let n = 2; ; n++) {
        nomeFinal = `${nome} (${n})`;
        const alt = await this.raiz.getDirectoryHandle(nomeFinal, { create: true });
        try {
          await alt.getFileHandle(ARQUIVO_CASO);
        } catch {
          break;
        }
      }
    } catch {
      /* pasta livre */
    }
    const destino = await this.raiz.getDirectoryHandle(nomeFinal, { create: true });
    const caso = await montarArquivoCaso({
      cabecalho: novoCabecalho(titulo, this.atualizadoPor),
      dados: dadosIniciais,
      manifesto: [],
    });
    const handle = await destino.getFileHandle(ARQUIVO_CASO, { create: true });
    await overwriteFile(handle, new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }));
    this.pastas.set(caso.cabecalho.caseId, nomeFinal);
    return caso;
  }

  async lerDocumento(caseId: string, caminhoRelativo: string): Promise<File | null> {
    const pasta = await this.pastaDoCaso(caseId);
    if (!pasta) return null;
    try {
      const partes = caminhoRelativo.split('/').filter(Boolean);
      let dir = pasta;
      for (const parte of partes.slice(0, -1)) dir = await dir.getDirectoryHandle(parte);
      const arquivo = await dir.getFileHandle(partes[partes.length - 1]);
      return await arquivo.getFile();
    } catch {
      return null;
    }
  }

  async varrerDocumentos(caso: ArquivoCaso, _arquivos?: InfoArquivoDisco[]): Promise<DiffManifesto> {
    void _arquivos;
    const pasta = await this.pastaDoCaso(caso.cabecalho.caseId);
    if (!pasta) return casarManifesto([], caso.manifesto, async () => '');
    const arquivos: InfoArquivoDisco[] = [];
    const varrer = async (dir: FileSystemDirectoryHandle, prefixo: string) => {
      for await (const [nome, h] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (nome.startsWith('.') || nome === PASTA_APP) continue;
        if (h.kind === 'directory') {
          await varrer(h as FileSystemDirectoryHandle, `${prefixo}${nome}/`);
        } else if (nome !== ARQUIVO_CASO && !nome.startsWith('caso.conflito.')) {
          const f = await (h as FileSystemFileHandle).getFile();
          arquivos.push({
            caminhoRelativo: `${prefixo}${nome}`,
            nome,
            tamanho: f.size,
            lastModified: f.lastModified,
            mime: f.type || undefined,
            file: f,
          });
        }
      }
    };
    await varrer(pasta, '');
    return casarManifesto(arquivos, caso.manifesto, async (a) => (a.file ? sha256DeBlob(a.file) : ''));
  }

  /** Arquiva o caso: COPIA a pasta para _Arquivados/ e remove a original. */
  async arquivarCaso(caseId: string): Promise<boolean> {
    const nome = this.pastas.get(caseId);
    if (!nome) return false;
    try {
      const origem = await this.raiz.getDirectoryHandle(nome);
      const arquivados = await this.raiz.getDirectoryHandle(PASTA_ARQUIVADOS, { create: true });
      const destino = await arquivados.getDirectoryHandle(nome, { create: true });
      const copiar = async (de: FileSystemDirectoryHandle, para: FileSystemDirectoryHandle) => {
        for await (const [n, h] of de as unknown as AsyncIterable<[string, FileSystemHandle]>) {
          if (h.kind === 'directory') {
            await copiar(h as FileSystemDirectoryHandle, await para.getDirectoryHandle(n, { create: true }));
          } else {
            const f = await (h as FileSystemFileHandle).getFile();
            const alvo = await para.getFileHandle(n, { create: true });
            await overwriteFile(alvo, f);
          }
        }
      };
      await copiar(origem, destino);
      // só remove a original depois da cópia completa ter terminado sem erro
      await this.raiz.removeEntry(nome, { recursive: true });
      this.pastas.delete(caseId);
      return true;
    } catch {
      return false;
    }
  }
}
