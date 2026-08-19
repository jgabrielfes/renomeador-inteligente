/**
 * CaseStore do DROPBOX — quinto modo de armazenamento do caso.
 *
 * Espelho do DriveCaseStore/OneDriveCaseStore sobre a API do Dropbox: o
 * usuário conecta o Dropbox UMA vez (app com acesso "App folder") e a
 * "pasta do processo" passa a viver na conta Dropbox dele — a pasta
 * "Apps/O Sucessorista", com uma subpasta por caso, `caso.json` +
 * DOCUMENTOS. Todo tráfego é navegador ↔ Dropbox (access token de vida
 * curta renovado pela server action): documento não passa pelo nosso
 * servidor.
 *
 * Segurança do escopo: app "App folder" SÓ enxerga a própria pasta — o
 * resto do Dropbox do usuário é invisível. Os CAMINHOS da API já são
 * relativos a ela ('' = raiz da pasta de app).
 *
 * Conflitos: a MESMA guarda dos outros modos (`atualizadoEm` de quando o
 * caso foi aberto), com as três saídas. O Dropbox versiona os arquivos
 * nativamente (histórico de versões do caso.json).
 *
 * Upload: o endpoint simples aceita até 150 MB — muito acima dos
 * documentos de um caso; não precisamos de upload em sessão aqui.
 *
 * Detalhe da API: o header `Dropbox-API-Arg` só aceita ASCII — nomes
 * acentuados (comuns em "Silva, João") são escapados como \\uXXXX.
 *
 * EXCLUSÃO de documento é destrutiva no Dropbox do usuário (arquivos
 * excluídos ficam recuperáveis por lá por um período): a UI SEMPRE pede
 * uma autorização a mais antes de chamar `excluirDocumento`.
 */

import type {
  ArquivoCaso,
  CaseStore,
  OpcoesSalvamento,
  ResultadoSalvamento,
  ResumoCaso,
} from './caso-store';
import { higienizarNomePasta, migrarArquivoCaso, montarArquivoCaso, novoCabecalho } from './caso-store';
import { casarManifesto, type DiffManifesto, type InfoArquivoDisco } from './manifesto';
import { sha256DeBlob } from './sha256';
import type { TokenDrivePool } from './store-drive';

const RPC = 'https://api.dropboxapi.com/2';
const CONTEUDO = 'https://content.dropboxapi.com/2';
const PASTA_ARQUIVADOS = '_Arquivados';
const ARQUIVO_CASO = 'caso.json';

interface EntradaDropbox {
  '.tag': 'file' | 'folder' | 'deleted';
  name: string;
  path_display?: string;
  server_modified?: string;
  size?: number;
}

/** JSON ASCII-safe para o header Dropbox-API-Arg (só aceita ASCII). */
const argHeader = (obj: unknown): string =>
  JSON.stringify(obj).replace(/[\u007f-\uffff]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** Profundidade do caminho relativo à pasta de app ('/A/b.pdf' → 2). */
const profundidade = (path: string): number => path.split('/').filter(Boolean).length;

export class DropboxCaseStore implements CaseStore {
  readonly modo = 'dropbox' as const;
  /** caseId → { pasta: '/Nome', nome } (preenchido pela listagem). */
  private casos = new Map<string, { pasta: string; nome: string }>();

  constructor(
    private tokens: TokenDrivePool,
    private atualizadoPor: string,
  ) {}

  /* ------------------------------ API crua ------------------------------ */

  private async chamar(url: string, init?: RequestInit): Promise<Response> {
    const token = await this.tokens.obter();
    if (!token) throw new Error('Sem acesso ao Dropbox — reconecte.');
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${token}` },
    });
  }

  private async rpc(rota: string, corpo: unknown): Promise<Response> {
    return this.chamar(`${RPC}/${rota}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
  }

  /** Listagem recursiva a partir de um caminho (cursor até o fim). */
  private async listar(path: string): Promise<EntradaDropbox[]> {
    const entradas: EntradaDropbox[] = [];
    let r = await this.rpc('files/list_folder', { path, recursive: true, limit: 2000 });
    for (;;) {
      if (!r.ok) throw new Error(`Dropbox respondeu ${r.status}.`);
      const dados = (await r.json()) as {
        entries?: EntradaDropbox[];
        cursor?: string;
        has_more?: boolean;
      };
      entradas.push(...(dados.entries ?? []));
      if (!dados.has_more || !dados.cursor) break;
      r = await this.rpc('files/list_folder/continue', { cursor: dados.cursor });
    }
    return entradas;
  }

  private async criarPasta(path: string): Promise<void> {
    const r = await this.rpc('files/create_folder_v2', { path, autorename: false });
    // 409 = já existe (corrida entre abas/dispositivos) — segue usando-a.
    if (!r.ok && r.status !== 409) throw new Error(`Dropbox recusou a criação da pasta (${r.status}).`);
  }

  /** Grava (cria OU substitui — mode overwrite; o Dropbox guarda versões). */
  private async gravarArquivo(path: string, conteudo: Blob): Promise<void> {
    const r = await this.chamar(`${CONTEUDO}/files/upload`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'dropbox-api-arg': argHeader({ path, mode: 'overwrite', mute: true }),
      },
      body: conteudo,
    });
    if (!r.ok) throw new Error(`Dropbox recusou o envio (${r.status}).`);
  }

  private async baixar(path: string): Promise<Blob | null> {
    const r = await this.chamar(`${CONTEUDO}/files/download`, {
      method: 'POST',
      headers: { 'dropbox-api-arg': argHeader({ path }) },
    });
    return r.ok ? r.blob() : null;
  }

  /* ------------------------------ estrutura ------------------------------ */

  async listarCasos(): Promise<ResumoCaso[]> {
    // Uma listagem recursiva só da pasta de app: pastas de caso (nível 1) e
    // os caso.json (nível 2) saem juntos.
    const entradas = await this.listar('');
    const pastas = new Map(
      entradas
        .filter((e) => e['.tag'] === 'folder' && e.path_display && profundidade(e.path_display) === 1)
        .map((e) => [e.path_display!.toLowerCase(), e]),
    );
    this.casos.clear();
    const resumos: ResumoCaso[] = [];
    await Promise.all(
      entradas
        .filter(
          (e) =>
            e['.tag'] === 'file' &&
            e.name === ARQUIVO_CASO &&
            e.path_display &&
            profundidade(e.path_display) === 2,
        )
        .map(async (arq) => {
          const pastaPath = arq.path_display!.slice(0, -(`/${ARQUIVO_CASO}`.length));
          const pasta = pastas.get(pastaPath.toLowerCase());
          if (!pasta || pasta.name === PASTA_ARQUIVADOS || pasta.name.startsWith('.')) return;
          const blob = await this.baixar(arq.path_display!);
          if (!blob) return;
          try {
            const caso = migrarArquivoCaso(JSON.parse(await blob.text()));
            if (!caso) return;
            this.casos.set(caso.cabecalho.caseId, {
              pasta: pasta.path_display ?? pastaPath,
              nome: pasta.name,
            });
            resumos.push({ cabecalho: caso.cabecalho, modo: this.modo, caminhoPasta: pasta.name });
          } catch {
            // caso.json ilegível não é caso
          }
        }),
    );
    resumos.sort((a, b) => (a.cabecalho.atualizadoEm < b.cabecalho.atualizadoEm ? 1 : -1));
    return resumos;
  }

  private async entradaDoCaso(caseId: string) {
    if (!this.casos.has(caseId)) await this.listarCasos();
    return this.casos.get(caseId) ?? null;
  }

  async abrirCaso(id: string): Promise<ArquivoCaso | null> {
    const entrada = await this.entradaDoCaso(id);
    if (!entrada) return null;
    const blob = await this.baixar(`${entrada.pasta}/${ARQUIVO_CASO}`);
    if (!blob) return null;
    try {
      return migrarArquivoCaso(JSON.parse(await blob.text()));
    } catch {
      return null;
    }
  }

  async salvarCaso(caso: ArquivoCaso, opcoes: OpcoesSalvamento): Promise<ResultadoSalvamento> {
    const entrada = await this.entradaDoCaso(caso.cabecalho.caseId);
    if (!entrada) return { ok: false, erro: 'Pasta do caso não encontrada no Dropbox.' };
    try {
      // Guarda de conflito: outro dispositivo salvou depois desta abertura?
      const anterior = await this.abrirCaso(caso.cabecalho.caseId);
      if (
        anterior &&
        !opcoes.forcar &&
        opcoes.baseAtualizadoEm !== null &&
        anterior.cabecalho.atualizadoEm !== opcoes.baseAtualizadoEm
      ) {
        return {
          ok: false,
          conflito: {
            atualizadoEm: anterior.cabecalho.atualizadoEm,
            atualizadoPor: anterior.cabecalho.atualizadoPor || 'outro dispositivo',
            arquivoNoDisco: anterior,
          },
        };
      }
      const salvoEm = new Date().toISOString();
      const pronto: ArquivoCaso = {
        ...caso,
        cabecalho: { ...caso.cabecalho, atualizadoEm: salvoEm, atualizadoPor: this.atualizadoPor },
      };
      await this.gravarArquivo(
        `${entrada.pasta}/${ARQUIVO_CASO}`,
        new Blob([JSON.stringify(pronto, null, 2)], { type: 'application/json' }),
      );
      return { ok: true, salvoEm };
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Falha ao gravar no Dropbox.' };
    }
  }

  /** Grava a versão em conflito como cópia, sem tocar no caso.json. */
  async salvarComoConflito(caso: ArquivoCaso): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caso.cabecalho.caseId);
    if (!entrada) return false;
    try {
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
      await this.gravarArquivo(
        `${entrada.pasta}/caso.conflito.${carimbo}.json`,
        new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async criarCaso(titulo: string, dadosIniciais: unknown): Promise<ArquivoCaso> {
    const nome = higienizarNomePasta(titulo);
    const pasta = `/${nome}`;
    await this.criarPasta(pasta);
    const caso = await montarArquivoCaso({
      cabecalho: novoCabecalho(titulo, this.atualizadoPor),
      dados: dadosIniciais,
      manifesto: [],
    });
    await this.gravarArquivo(
      `${pasta}/${ARQUIVO_CASO}`,
      new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }),
    );
    this.casos.set(caso.cabecalho.caseId, { pasta, nome });
    return caso;
  }

  /* ------------------------------ documentos ------------------------------ */

  /** Arquivos do caso (pasta + 1 nível de subpastas), com caminho relativo. */
  private async listarDocumentos(
    pasta: string,
  ): Promise<(EntradaDropbox & { caminho: string })[]> {
    const base = profundidade(pasta);
    const entradas = await this.listar(pasta);
    const docs: (EntradaDropbox & { caminho: string })[] = [];
    for (const e of entradas) {
      if (e['.tag'] !== 'file' || !e.path_display) continue;
      const relativo = e.path_display.split('/').filter(Boolean).slice(base);
      if (relativo.length === 1) {
        if (e.name === ARQUIVO_CASO || e.name.startsWith('caso.conflito.') || e.name.startsWith('.')) continue;
        docs.push({ ...e, caminho: e.name });
      } else if (relativo.length === 2) {
        if (relativo[0].startsWith('.') || e.name.startsWith('.')) continue;
        docs.push({ ...e, caminho: `${relativo[0]}/${e.name}` });
      }
    }
    return docs;
  }

  private paraFile(meta: EntradaDropbox, blob: Blob): File {
    return new File([blob], meta.name, {
      type: blob.type || 'application/octet-stream',
      lastModified: meta.server_modified ? new Date(meta.server_modified).getTime() : Date.now(),
    });
  }

  async lerDocumento(caseId: string, caminhoRelativo: string): Promise<File | null> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return null;
    try {
      const docs = await this.listarDocumentos(entrada.pasta);
      const meta = docs.find((d) => d.caminho === caminhoRelativo);
      if (!meta?.path_display) return null;
      const blob = await this.baixar(meta.path_display);
      return blob ? this.paraFile(meta, blob) : null;
    } catch {
      return null;
    }
  }

  async varrerDocumentos(caso: ArquivoCaso, _arquivos?: InfoArquivoDisco[]): Promise<DiffManifesto> {
    void _arquivos;
    const entrada = await this.entradaDoCaso(caso.cabecalho.caseId);
    if (!entrada) return casarManifesto([], caso.manifesto, async () => '');
    // "Logar e aparecer tudo": baixa os documentos do caso (limite de 6 por
    // vez) para religar e REANEXAR nas caixas — como nos outros modos.
    const metas = await this.listarDocumentos(entrada.pasta);
    const arquivos: InfoArquivoDisco[] = [];
    const fila = [...metas];
    const baixarLote = async () => {
      for (let m = fila.shift(); m; m = fila.shift()) {
        const blob = m.path_display ? await this.baixar(m.path_display) : null;
        const file = blob ? this.paraFile(m, blob) : undefined;
        arquivos.push({
          caminhoRelativo: m.caminho,
          nome: m.name,
          tamanho: file?.size ?? Number(m.size ?? 0),
          lastModified: m.server_modified ? new Date(m.server_modified).getTime() : 0,
          mime: file?.type || undefined,
          file,
        });
      }
    };
    await Promise.all(Array.from({ length: 6 }, baixarLote));
    return casarManifesto(arquivos, caso.manifesto, async (a) => (a.file ? sha256DeBlob(a.file) : ''));
  }

  private async gravarDocumento(caseId: string, file: File, subpasta?: string): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return false;
    try {
      // Nome repetido SUBSTITUI o conteúdo (mode overwrite; o Dropbox guarda
      // as versões) — a mesma identidade continua valendo no manifesto.
      const destino = subpasta ? `${entrada.pasta}/${subpasta}/${file.name}` : `${entrada.pasta}/${file.name}`;
      await this.gravarArquivo(destino, file);
      return true;
    } catch {
      return false;
    }
  }

  /** Anexo do caso: sobe para a pasta do caso no Dropbox. */
  async enviarDocumento(caseId: string, file: File): Promise<boolean> {
    return this.gravarDocumento(caseId, file);
  }

  /** Envio do cofre do herdeiro: subpasta própria, como nos outros modos. */
  async salvarDocumentoRecebido(caseId: string, file: File): Promise<boolean> {
    return this.gravarDocumento(caseId, file, 'Recebidos do cofre');
  }

  /**
   * EXCLUI o documento do Dropbox (recuperável por lá pelo período de
   * versões da conta). A UI SEMPRE pediu a autorização extra antes daqui.
   */
  async excluirDocumento(caseId: string, caminhoRelativo: string): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return false;
    try {
      const docs = await this.listarDocumentos(entrada.pasta);
      const meta = docs.find((d) => d.caminho === caminhoRelativo || d.name === caminhoRelativo);
      if (!meta?.path_display) return false;
      const r = await this.rpc('files/delete_v2', { path: meta.path_display });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Arquiva: move a pasta do caso para _Arquivados/ na pasta de app. */
  async arquivarCaso(caseId: string): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return false;
    try {
      await this.criarPasta(`/${PASTA_ARQUIVADOS}`);
      const r = await this.rpc('files/move_v2', {
        from_path: entrada.pasta,
        to_path: `/${PASTA_ARQUIVADOS}/${entrada.nome}`,
        autorename: true,
      });
      if (!r.ok) return false;
      this.casos.delete(caseId);
      return true;
    } catch {
      return false;
    }
  }
}
