/**
 * CaseStore do ONEDRIVE — quarto modo de armazenamento do caso.
 *
 * Espelho do DriveCaseStore sobre a Microsoft Graph API: o usuário conecta o
 * OneDrive UMA vez (escopo Files.ReadWrite.AppFolder) e a "pasta do
 * processo" passa a viver na conta Microsoft dele — a pasta de app
 * ("Apps/O Sucessorista") com uma subpasta por caso, `caso.json` +
 * DOCUMENTOS. Todo tráfego é navegador ↔ Microsoft (access token de vida
 * curta renovado pela server action): documento não passa pelo nosso
 * servidor.
 *
 * Segurança do escopo: com Files.ReadWrite.AppFolder a aplicação SÓ enxerga
 * a própria pasta de app — o resto do OneDrive do usuário é invisível.
 *
 * Conflitos: a MESMA guarda dos outros modos (`atualizadoEm` de quando o
 * caso foi aberto), com as três saídas. O OneDrive versiona o caso.json
 * nativamente (histórico de versões), como o Drive.
 *
 * Upload: até 4 MB vai num PUT simples; acima disso a Graph API exige uma
 * UPLOAD SESSION em fatias (múltiplos de 320 KiB — usamos 5 MiB por fatia).
 *
 * EXCLUSÃO de documento é destrutiva no OneDrive do usuário (lixeira da
 * Microsoft — recuperável por lá): a UI SEMPRE pede uma autorização a mais
 * antes de chamar `excluirDocumento` — este módulo não abre dialog.
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

const API = 'https://graph.microsoft.com/v1.0/me/drive';
const PASTA_ARQUIVADOS = '_Arquivados';
const ARQUIVO_CASO = 'caso.json';
/** Teto do PUT simples da Graph API; acima disso, upload session em fatias. */
const LIMITE_UPLOAD_SIMPLES = 4 * 1024 * 1024;
/** Fatia da upload session — 5 MiB (múltiplo exigido de 320 KiB). */
const FATIA_UPLOAD = 5 * 1024 * 1024;

interface ItemOneDrive {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: object;
  file?: { mimeType?: string };
  parentReference?: { id?: string };
}

export class OneDriveCaseStore implements CaseStore {
  readonly modo = 'onedrive' as const;
  private raizId: string | null = null;
  /** caseId → { pastaId, casoJsonId, nome } (preenchido pela listagem). */
  private casos = new Map<string, { pastaId: string; casoJsonId: string; nome: string }>();

  constructor(
    private tokens: TokenDrivePool,
    private atualizadoPor: string,
  ) {}

  /* ------------------------------ API crua ------------------------------ */

  private async chamar(url: string, init?: RequestInit): Promise<Response> {
    const token = await this.tokens.obter();
    if (!token) throw new Error('Sem acesso ao OneDrive — reconecte.');
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${token}` },
    });
  }

  /** Lista paginada (children/search) — segue o @odata.nextLink. */
  private async listar(url: string): Promise<ItemOneDrive[]> {
    const itens: ItemOneDrive[] = [];
    let proxima: string | undefined = url;
    while (proxima) {
      const r = await this.chamar(proxima);
      if (!r.ok) throw new Error(`OneDrive respondeu ${r.status}.`);
      const dados = (await r.json()) as { value?: ItemOneDrive[]; '@odata.nextLink'?: string };
      itens.push(...(dados.value ?? []));
      proxima = dados['@odata.nextLink'];
    }
    return itens;
  }

  private async filhos(pastaId: string): Promise<ItemOneDrive[]> {
    return this.listar(`${API}/items/${pastaId}/children?$top=200`);
  }

  private async criarPasta(nome: string, paiId: string): Promise<string> {
    const r = await this.chamar(`${API}/items/${paiId}/children`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nome, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
    });
    if (r.status === 409) {
      // Corrida: outra aba/dispositivo criou primeiro — usa a existente.
      const iguais = (await this.filhos(paiId)).filter((f) => f.folder && f.name === nome);
      if (iguais[0]) return iguais[0].id;
    }
    if (!r.ok) throw new Error(`OneDrive recusou a criação da pasta (${r.status}).`);
    return ((await r.json()) as { id: string }).id;
  }

  /**
   * Grava (cria OU substitui — o PUT por caminho troca o conteúdo mantendo a
   * identidade do arquivo). Acima de 4 MB, upload session em fatias.
   */
  private async gravarArquivo(nome: string, paiId: string, conteudo: Blob): Promise<void> {
    const caminho = `${API}/items/${paiId}:/${encodeURIComponent(nome)}`;
    if (conteudo.size <= LIMITE_UPLOAD_SIMPLES) {
      const r = await this.chamar(`${caminho}:/content`, { method: 'PUT', body: conteudo });
      if (!r.ok) throw new Error(`OneDrive recusou o envio (${r.status}).`);
      return;
    }
    const sessao = await this.chamar(`${caminho}:/createUploadSession`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace', name: nome } }),
    });
    if (!sessao.ok) throw new Error(`OneDrive recusou a sessão de envio (${sessao.status}).`);
    const { uploadUrl } = (await sessao.json()) as { uploadUrl: string };
    for (let inicio = 0; inicio < conteudo.size; inicio += FATIA_UPLOAD) {
      const fim = Math.min(inicio + FATIA_UPLOAD, conteudo.size);
      // A uploadUrl é pré-autenticada — vai SEM o header de autorização.
      const r = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'content-range': `bytes ${inicio}-${fim - 1}/${conteudo.size}` },
        body: conteudo.slice(inicio, fim),
      });
      if (!r.ok) throw new Error(`OneDrive interrompeu o envio (${r.status}).`);
    }
  }

  private async baixar(itemId: string): Promise<Blob | null> {
    // O /content devolve 302 para uma URL pré-autenticada — o fetch segue.
    const r = await this.chamar(`${API}/items/${itemId}/content`);
    return r.ok ? r.blob() : null;
  }

  /* ------------------------------ estrutura ------------------------------ */

  /** Pasta de app ("Apps/O Sucessorista") — a Graph cria no primeiro acesso. */
  private async raiz(): Promise<string> {
    if (this.raizId) return this.raizId;
    const r = await this.chamar(`${API}/special/approot?$select=id`);
    if (!r.ok) throw new Error(`OneDrive respondeu ${r.status}.`);
    this.raizId = ((await r.json()) as { id: string }).id;
    return this.raizId;
  }

  async listarCasos(): Promise<ResumoCaso[]> {
    const raizId = await this.raiz();
    const [pastas, achados] = await Promise.all([
      this.filhos(raizId).then((fs) => fs.filter((f) => f.folder)),
      // Uma busca só pelos caso.json em toda a pasta de app.
      this.listar(`${API}/items/${raizId}/search(q='${ARQUIVO_CASO}')?$top=200`),
    ]);
    const porPasta = new Map(pastas.map((p) => [p.id, p]));
    this.casos.clear();
    const resumos: ResumoCaso[] = [];
    await Promise.all(
      achados
        .filter((a) => a.name === ARQUIVO_CASO)
        .map(async (arq) => {
          const pasta = arq.parentReference?.id ? porPasta.get(arq.parentReference.id) : undefined;
          if (!pasta || pasta.name === PASTA_ARQUIVADOS || pasta.name.startsWith('.')) return;
          const blob = await this.baixar(arq.id);
          if (!blob) return;
          try {
            const caso = migrarArquivoCaso(JSON.parse(await blob.text()));
            if (!caso) return;
            this.casos.set(caso.cabecalho.caseId, {
              pastaId: pasta.id,
              casoJsonId: arq.id,
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
    const blob = await this.baixar(entrada.casoJsonId);
    if (!blob) return null;
    try {
      return migrarArquivoCaso(JSON.parse(await blob.text()));
    } catch {
      return null;
    }
  }

  async salvarCaso(caso: ArquivoCaso, opcoes: OpcoesSalvamento): Promise<ResultadoSalvamento> {
    const entrada = await this.entradaDoCaso(caso.cabecalho.caseId);
    if (!entrada) return { ok: false, erro: 'Pasta do caso não encontrada no OneDrive.' };
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
        ARQUIVO_CASO,
        entrada.pastaId,
        new Blob([JSON.stringify(pronto, null, 2)], { type: 'application/json' }),
      );
      return { ok: true, salvoEm };
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Falha ao gravar no OneDrive.' };
    }
  }

  /** Grava a versão em conflito como cópia, sem tocar no caso.json. */
  async salvarComoConflito(caso: ArquivoCaso): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caso.cabecalho.caseId);
    if (!entrada) return false;
    try {
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
      await this.gravarArquivo(
        `caso.conflito.${carimbo}.json`,
        entrada.pastaId,
        new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async criarCaso(titulo: string, dadosIniciais: unknown): Promise<ArquivoCaso> {
    const raizId = await this.raiz();
    const nome = higienizarNomePasta(titulo);
    const pastaId = await this.criarPasta(nome, raizId);
    const caso = await montarArquivoCaso({
      cabecalho: novoCabecalho(titulo, this.atualizadoPor),
      dados: dadosIniciais,
      manifesto: [],
    });
    await this.gravarArquivo(
      ARQUIVO_CASO,
      pastaId,
      new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }),
    );
    const casoJson = (await this.filhos(pastaId)).find((f) => f.name === ARQUIVO_CASO);
    this.casos.set(caso.cabecalho.caseId, { pastaId, casoJsonId: casoJson?.id ?? '', nome });
    return caso;
  }

  /* ------------------------------ documentos ------------------------------ */

  /** Arquivos do caso (pasta + 1 nível de subpastas), com caminho relativo. */
  private async listarDocumentos(
    pastaId: string,
  ): Promise<(ItemOneDrive & { caminho: string })[]> {
    const filhos = await this.filhos(pastaId);
    const docs: (ItemOneDrive & { caminho: string })[] = [];
    for (const f of filhos) {
      if (f.folder) {
        if (f.name.startsWith('.')) continue;
        const netos = await this.filhos(f.id);
        for (const n of netos) {
          if (n.folder || n.name.startsWith('.')) continue;
          docs.push({ ...n, caminho: `${f.name}/${n.name}` });
        }
      } else if (f.name !== ARQUIVO_CASO && !f.name.startsWith('caso.conflito.') && !f.name.startsWith('.')) {
        docs.push({ ...f, caminho: f.name });
      }
    }
    return docs;
  }

  private paraFile(meta: ItemOneDrive, blob: Blob): File {
    return new File([blob], meta.name, {
      type: blob.type || meta.file?.mimeType || 'application/octet-stream',
      lastModified: meta.lastModifiedDateTime ? new Date(meta.lastModifiedDateTime).getTime() : Date.now(),
    });
  }

  async lerDocumento(caseId: string, caminhoRelativo: string): Promise<File | null> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return null;
    try {
      const docs = await this.listarDocumentos(entrada.pastaId);
      const meta = docs.find((d) => d.caminho === caminhoRelativo);
      if (!meta) return null;
      const blob = await this.baixar(meta.id);
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
    // vez) para religar e REANEXAR nas caixas — como no modo Drive.
    const metas = await this.listarDocumentos(entrada.pastaId);
    const arquivos: InfoArquivoDisco[] = [];
    const fila = [...metas];
    const baixarLote = async () => {
      for (let m = fila.shift(); m; m = fila.shift()) {
        const blob = await this.baixar(m.id);
        const file = blob ? this.paraFile(m, blob) : undefined;
        arquivos.push({
          caminhoRelativo: m.caminho,
          nome: m.name,
          tamanho: file?.size ?? Number(m.size ?? 0),
          lastModified: m.lastModifiedDateTime ? new Date(m.lastModifiedDateTime).getTime() : 0,
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
      let paiId = entrada.pastaId;
      if (subpasta) {
        const pastas = (await this.filhos(entrada.pastaId)).filter(
          (f) => f.folder && f.name === subpasta,
        );
        paiId = pastas[0]?.id ?? (await this.criarPasta(subpasta, entrada.pastaId));
      }
      // Nome repetido SUBSTITUI o conteúdo (o OneDrive guarda as versões) —
      // a mesma identidade de arquivo continua valendo no manifesto.
      await this.gravarArquivo(file.name, paiId, file);
      return true;
    } catch {
      return false;
    }
  }

  /** Anexo do caso: sobe para a pasta do caso no OneDrive. */
  async enviarDocumento(caseId: string, file: File): Promise<boolean> {
    return this.gravarDocumento(caseId, file);
  }

  /** Envio do cofre do herdeiro: subpasta própria, como nos outros modos. */
  async salvarDocumentoRecebido(caseId: string, file: File): Promise<boolean> {
    return this.gravarDocumento(caseId, file, 'Recebidos do cofre');
  }

  /**
   * EXCLUI o documento do OneDrive (lixeira da Microsoft — recuperável por
   * lá). A UI SEMPRE pediu a autorização extra antes de chegar aqui.
   */
  async excluirDocumento(caseId: string, caminhoRelativo: string): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return false;
    try {
      const docs = await this.listarDocumentos(entrada.pastaId);
      const meta = docs.find((d) => d.caminho === caminhoRelativo || d.name === caminhoRelativo);
      if (!meta) return false;
      const r = await this.chamar(`${API}/items/${meta.id}`, { method: 'DELETE' });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Arquiva: move a pasta do caso para _Arquivados/ dentro da pasta de app. */
  async arquivarCaso(caseId: string): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return false;
    try {
      const raizId = await this.raiz();
      const arquivados = (await this.filhos(raizId)).filter(
        (f) => f.folder && f.name === PASTA_ARQUIVADOS,
      );
      const destinoId = arquivados[0]?.id ?? (await this.criarPasta(PASTA_ARQUIVADOS, raizId));
      const r = await this.chamar(`${API}/items/${entrada.pastaId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentReference: { id: destinoId } }),
      });
      if (!r.ok) return false;
      this.casos.delete(caseId);
      return true;
    } catch {
      return false;
    }
  }
}
