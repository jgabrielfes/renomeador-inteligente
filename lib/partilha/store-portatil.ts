/**
 * Modo PORTÁTIL do CaseStore — Firefox/Safari/iframe/permissão negada.
 *
 * Os casos vivem no IndexedDB (store `casos`, chave = caseId) e viajam como
 * arquivo `.json` que o usuário guarda na pasta do processo. O religamento
 * de documentos acontece quando o usuário arrasta a pasta de novo: o
 * manifesto casa os arquivos por caminho/hash sem retrabalho.
 */

import {
  montarArquivoCaso,
  migrarArquivoCaso,
  novoCabecalho,
  type ArquivoCaso,
  type CaseStore,
  type OpcoesSalvamento,
  type ResultadoSalvamento,
  type ResumoCaso,
} from './caso-store';
import { casarManifesto, type DiffManifesto, type InfoArquivoDisco } from './manifesto';
import { sha256DeBlob } from './sha256';
import { idbDelete, idbGet, idbPut, idbTodos, STORES } from './idb';

export class PortableCaseStore implements CaseStore {
  readonly modo = 'portatil' as const;

  constructor(private atualizadoPor: string) {}

  async listarCasos(): Promise<ResumoCaso[]> {
    const todos = await idbTodos<ArquivoCaso>(STORES.casos);
    return todos
      .map((bruto) => migrarArquivoCaso(bruto))
      .filter((c): c is ArquivoCaso => c !== null)
      .map((c) => ({ cabecalho: c.cabecalho, modo: this.modo }));
  }

  async abrirCaso(id: string): Promise<ArquivoCaso | null> {
    return migrarArquivoCaso(await idbGet(STORES.casos, id));
  }

  async salvarCaso(caso: ArquivoCaso, _opcoes: OpcoesSalvamento): Promise<ResultadoSalvamento> {
    // Um único navegador escreve neste banco — sem guarda de conflito aqui.
    void _opcoes;
    const salvoEm = new Date().toISOString();
    const pronto: ArquivoCaso = {
      ...caso,
      cabecalho: { ...caso.cabecalho, atualizadoEm: salvoEm, atualizadoPor: this.atualizadoPor },
    };
    const ok = await idbPut(STORES.casos, pronto.cabecalho.caseId, pronto);
    return ok ? { ok: true, salvoEm } : { ok: false, erro: 'Falha ao gravar no armazenamento do navegador.' };
  }

  async criarCaso(titulo: string, dadosIniciais: unknown): Promise<ArquivoCaso> {
    const caso = await montarArquivoCaso({
      cabecalho: novoCabecalho(titulo, this.atualizadoPor),
      dados: dadosIniciais,
      manifesto: [],
    });
    await idbPut(STORES.casos, caso.cabecalho.caseId, caso);
    return caso;
  }

  async lerDocumento(): Promise<File | null> {
    return null; // portátil: os documentos chegam pelo arraste da pasta
  }

  async varrerDocumentos(caso: ArquivoCaso, arquivos?: InfoArquivoDisco[]): Promise<DiffManifesto> {
    return casarManifesto(arquivos ?? [], caso.manifesto, async (a) =>
      a.file ? sha256DeBlob(a.file) : '',
    );
  }

  async removerCaso(id: string): Promise<boolean> {
    return idbDelete(STORES.casos, id);
  }

  /** Importa um `.json` portátil (arquivo do caso) para o banco local. */
  async importarArquivo(file: File): Promise<ArquivoCaso | null> {
    try {
      const caso = migrarArquivoCaso(JSON.parse(await file.text()));
      if (!caso) return null;
      await idbPut(STORES.casos, caso.cabecalho.caseId, caso);
      return caso;
    } catch {
      return null;
    }
  }
}
