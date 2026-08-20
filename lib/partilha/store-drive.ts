/**
 * CaseStore do GOOGLE DRIVE — terceiro modo de armazenamento do caso.
 *
 * O usuário conecta o Drive UMA vez (escopo drive.file) e a "pasta do
 * processo" passa a viver na conta Google DELE: a aplicação cria a pasta
 * raiz "O Sucessorista" e, dentro dela, uma subpasta por caso com o
 * `caso.json` e os DOCUMENTOS — o mesmo desenho do modo pasta, mas
 * acessível de qualquer dispositivo (inclusive celular, onde o modo pasta
 * nunca existiu). Todo tráfego é navegador ↔ Google (API REST com access
 * token de vida curta renovado pela server action): documento não passa
 * pelo nosso servidor.
 *
 * Segurança do escopo: com drive.file a aplicação SÓ enxerga arquivos que
 * ela mesma criou — o resto do Drive do usuário é invisível.
 *
 * Conflitos: a MESMA guarda dos outros modos (`atualizadoEm` de quando o
 * caso foi aberto), com as três saídas. Backup rotativo não é replicado —
 * o Drive tem histórico de versões nativo para o caso.json.
 *
 * EXCLUSÃO de documento é destrutiva no Drive do usuário: a UI SEMPRE pede
 * uma autorização a mais antes de chamar `excluirDocumento` (pedido do
 * escritório) — este módulo não abre dialog, só executa.
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

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const PASTA_RAIZ = 'O Sucessorista';
const PASTA_ARQUIVADOS = '_Arquivados';
const ARQUIVO_CASO = 'caso.json';
const MIME_PASTA = 'application/vnd.google-apps.folder';

interface ArquivoDrive {
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  modifiedTime?: string;
  parents?: string[];
}

/** Renova o access token com folga de 2 min — uma promessa por vez. */
export class TokenDrivePool {
  private token: string | null = null;
  private validoAte = 0;
  private pendente: Promise<string | null> | null = null;
  constructor(
    private renovar: () => Promise<{ accessToken?: string; expiresIn?: number } | null>,
  ) {}
  async obter(): Promise<string | null> {
    if (this.token && Date.now() < this.validoAte) return this.token;
    this.pendente ??= (async () => {
      try {
        const r = await this.renovar();
        if (!r?.accessToken) return null;
        this.token = r.accessToken;
        this.validoAte = Date.now() + ((r.expiresIn ?? 3600) - 120) * 1000;
        return this.token;
      } finally {
        this.pendente = null;
      }
    })();
    return this.pendente;
  }
}

/** Teto do upload multipart/media simples do Drive (~5 MB) — acima disso a
 *  API exige sessão RESUMABLE (era a causa dos anexos grandes falharem). */
const LIMITE_UPLOAD_SIMPLES_DRIVE = 4 * 1024 * 1024;

export class DriveCaseStore implements CaseStore {
  readonly modo = 'drive' as const;
  /** Motivo da última falha de envio de documento (a UI mostra no toast). */
  ultimoErro: string | null = null;
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
    if (!token) throw new Error('Sem acesso ao Google Drive — reconecte.');
    return fetch(url, {
      ...init,
      headers: { ...(init?.headers as Record<string, string>), authorization: `Bearer ${token}` },
    });
  }

  /**
   * Erro LEGÍVEL da API do Drive: o corpo do 403 distingue "API não ativada
   * no projeto do console" de "consentimento sem o escopo de arquivos" — as
   * duas causas reais do "Drive respondeu 403" que já travou conexão nova.
   */
  private async erroDe(r: Response, acao: string): Promise<Error> {
    const corpo = (await r.json().catch(() => null)) as {
      error?: { message?: string; errors?: { reason?: string }[] };
    } | null;
    const razao = corpo?.error?.errors?.[0]?.reason ?? '';
    if (r.status === 403 && razao === 'accessNotConfigured') {
      return new Error(
        'A API do Google Drive não está ATIVADA no projeto do console do Google Cloud — ative "Google Drive API" em APIs e serviços › Biblioteca e tente de novo.',
      );
    }
    if (r.status === 403 && (razao === 'insufficientPermissions' || razao === 'insufficientScopes' || razao === 'forbidden')) {
      return new Error(
        'A conta conectou SEM conceder o acesso a arquivos — desconecte e conecte de novo, marcando a permissão do Drive na tela de consentimento do Google.',
      );
    }
    const msg = corpo?.error?.message;
    return new Error(`${acao} (${r.status}${msg ? ` — ${msg}` : ''}).`);
  }

  private async listar(q: string): Promise<ArquivoDrive[]> {
    const itens: ArquivoDrive[] = [];
    let pagina: string | undefined;
    do {
      const url = new URL(`${API}/files`);
      url.searchParams.set('q', q);
      url.searchParams.set('fields', 'nextPageToken,files(id,name,mimeType,size,modifiedTime,parents)');
      url.searchParams.set('pageSize', '200');
      url.searchParams.set('spaces', 'drive');
      if (pagina) url.searchParams.set('pageToken', pagina);
      const r = await this.chamar(url.toString());
      if (!r.ok) throw await this.erroDe(r, 'Drive recusou a listagem');
      const dados = (await r.json()) as { files?: ArquivoDrive[]; nextPageToken?: string };
      itens.push(...(dados.files ?? []));
      pagina = dados.nextPageToken;
    } while (pagina);
    return itens;
  }

  private async criarPasta(nome: string, paiId?: string): Promise<string> {
    const r = await this.chamar(`${API}/files?fields=id`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: nome, mimeType: MIME_PASTA, ...(paiId ? { parents: [paiId] } : {}) }),
    });
    if (!r.ok) throw await this.erroDe(r, 'Drive recusou a criação da pasta');
    return ((await r.json()) as { id: string }).id;
  }

  /**
   * Upload RESUMABLE: abre a sessão (POST cria / PATCH atualiza) e envia o
   * conteúdo INTEIRO num PUT à URL da sessão — vale para qualquer tamanho.
   */
  private async uploadResumable(
    inicioUrl: string,
    metodo: 'POST' | 'PATCH',
    metadados: object | null,
    conteudo: Blob,
  ): Promise<string> {
    const r = await this.chamar(inicioUrl, {
      method: metodo,
      headers: {
        ...(metadados ? { 'content-type': 'application/json; charset=UTF-8' } : {}),
        'x-upload-content-type': conteudo.type || 'application/octet-stream',
      },
      body: metadados ? JSON.stringify(metadados) : undefined,
    });
    if (!r.ok) throw await this.erroDe(r, 'Drive recusou o envio');
    const sessao = r.headers.get('location');
    if (!sessao) throw new Error('Drive não abriu a sessão de envio — tente de novo.');
    const up = await this.chamar(sessao, { method: 'PUT', body: conteudo });
    if (!up.ok) throw new Error(`Drive interrompeu o envio (${up.status}) — tente de novo.`);
    return (((await up.json().catch(() => ({}))) as { id?: string }).id ?? '');
  }

  /** Cria arquivo novo: multipart até ~4 MB; acima, sessão resumable. */
  private async criarArquivo(nome: string, paiId: string, conteudo: Blob): Promise<string> {
    if (conteudo.size > LIMITE_UPLOAD_SIMPLES_DRIVE) {
      return this.uploadResumable(
        `${UPLOAD}/files?uploadType=resumable&fields=id`,
        'POST',
        { name: nome, parents: [paiId] },
        conteudo,
      );
    }
    const meta = new Blob([JSON.stringify({ name: nome, parents: [paiId] })], {
      type: 'application/json',
    });
    const form = new FormData();
    form.set('metadata', meta);
    form.set('file', conteudo);
    const r = await this.chamar(`${UPLOAD}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      body: form,
    });
    if (!r.ok) throw await this.erroDe(r, 'Drive recusou o envio');
    return ((await r.json()) as { id: string }).id;
  }

  /** Atualiza o conteúdo: media até ~4 MB; acima, sessão resumable. */
  private async atualizarArquivo(fileId: string, conteudo: Blob): Promise<void> {
    if (conteudo.size > LIMITE_UPLOAD_SIMPLES_DRIVE) {
      await this.uploadResumable(
        `${UPLOAD}/files/${fileId}?uploadType=resumable`,
        'PATCH',
        null,
        conteudo,
      );
      return;
    }
    const r = await this.chamar(`${UPLOAD}/files/${fileId}?uploadType=media`, {
      method: 'PATCH',
      body: conteudo,
    });
    if (!r.ok) throw await this.erroDe(r, 'Drive recusou a atualização');
  }

  private async baixar(fileId: string): Promise<Blob | null> {
    const r = await this.chamar(`${API}/files/${fileId}?alt=media`);
    return r.ok ? r.blob() : null;
  }

  /* ------------------------------ estrutura ------------------------------ */

  private async raiz(): Promise<string> {
    if (this.raizId) return this.raizId;
    const achadas = await this.listar(
      `name='${PASTA_RAIZ}' and mimeType='${MIME_PASTA}' and trashed=false`,
    );
    this.raizId = achadas[0]?.id ?? (await this.criarPasta(PASTA_RAIZ));
    return this.raizId;
  }

  async listarCasos(): Promise<ResumoCaso[]> {
    const raizId = await this.raiz();
    const [pastas, casoJsons] = await Promise.all([
      this.listar(`'${raizId}' in parents and mimeType='${MIME_PASTA}' and trashed=false`),
      // Uma busca só pelos caso.json (drive.file: só os desta aplicação).
      this.listar(`name='${ARQUIVO_CASO}' and trashed=false`),
    ]);
    const porPasta = new Map(pastas.map((p) => [p.id, p]));
    this.casos.clear();
    const resumos: ResumoCaso[] = [];
    await Promise.all(
      casoJsons.map(async (arq) => {
        const pasta = arq.parents?.map((id) => porPasta.get(id)).find(Boolean);
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
    if (!entrada) return { ok: false, erro: 'Pasta do caso não encontrada no Drive.' };
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
      await this.atualizarArquivo(
        entrada.casoJsonId,
        new Blob([JSON.stringify(pronto, null, 2)], { type: 'application/json' }),
      );
      return { ok: true, salvoEm };
    } catch (err) {
      return { ok: false, erro: err instanceof Error ? err.message : 'Falha ao gravar no Drive.' };
    }
  }

  /** Grava a versão em conflito como cópia, sem tocar no caso.json. */
  async salvarComoConflito(caso: ArquivoCaso): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caso.cabecalho.caseId);
    if (!entrada) return false;
    try {
      const carimbo = new Date().toISOString().replace(/[:.]/g, '-');
      await this.criarArquivo(
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
    const casoJsonId = await this.criarArquivo(
      ARQUIVO_CASO,
      pastaId,
      new Blob([JSON.stringify(caso, null, 2)], { type: 'application/json' }),
    );
    this.casos.set(caso.cabecalho.caseId, { pastaId, casoJsonId, nome });
    return caso;
  }

  /* ------------------------------ documentos ------------------------------ */

  /** Arquivos do caso (pasta + 1 nível de subpastas), com caminho relativo. */
  private async listarDocumentos(
    pastaId: string,
  ): Promise<(ArquivoDrive & { caminho: string })[]> {
    const filhos = await this.listar(`'${pastaId}' in parents and trashed=false`);
    const docs: (ArquivoDrive & { caminho: string })[] = [];
    for (const f of filhos) {
      if (f.mimeType === MIME_PASTA) {
        if (f.name.startsWith('.')) continue;
        const netos = await this.listar(`'${f.id}' in parents and trashed=false`);
        for (const n of netos) {
          if (n.mimeType === MIME_PASTA || n.name.startsWith('.')) continue;
          docs.push({ ...n, caminho: `${f.name}/${n.name}` });
        }
      } else if (f.name !== ARQUIVO_CASO && !f.name.startsWith('caso.conflito.') && !f.name.startsWith('.')) {
        docs.push({ ...f, caminho: f.name });
      }
    }
    return docs;
  }

  private paraFile(meta: ArquivoDrive, blob: Blob): File {
    return new File([blob], meta.name, {
      type: blob.type || 'application/octet-stream',
      lastModified: meta.modifiedTime ? new Date(meta.modifiedTime).getTime() : Date.now(),
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
    // vez) para religar e REANEXAR nas caixas — é o que faz o caso abrir
    // completo em outro computador ou no celular.
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
          lastModified: m.modifiedTime ? new Date(m.modifiedTime).getTime() : 0,
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
    if (!entrada) {
      this.ultimoErro = 'Este caso não tem pasta no Drive conectado (veio da nuvem de outra máquina?).';
      return false;
    }
    try {
      let paiId = entrada.pastaId;
      if (subpasta) {
        const pastas = await this.listar(
          `'${entrada.pastaId}' in parents and name='${subpasta.replace(/'/g, "\\'")}' and mimeType='${MIME_PASTA}' and trashed=false`,
        );
        paiId = pastas[0]?.id ?? (await this.criarPasta(subpasta, entrada.pastaId));
      }
      // Nome repetido SUBSTITUI o conteúdo (o Drive guarda as versões) — a
      // mesma identidade de arquivo continua valendo no manifesto.
      const iguais = await this.listar(
        `'${paiId}' in parents and name='${file.name.replace(/'/g, "\\'")}' and trashed=false`,
      );
      if (iguais[0]) await this.atualizarArquivo(iguais[0].id, file);
      else await this.criarArquivo(file.name, paiId, file);
      this.ultimoErro = null;
      return true;
    } catch (err) {
      this.ultimoErro = err instanceof Error ? err.message : 'Falha de rede no envio ao Drive.';
      return false;
    }
  }

  /** Anexo do caso: sobe para a pasta do caso no Drive. */
  async enviarDocumento(caseId: string, file: File): Promise<boolean> {
    return this.gravarDocumento(caseId, file);
  }

  /** Envio do cofre do herdeiro: subpasta própria, como no modo pasta. */
  async salvarDocumentoRecebido(caseId: string, file: File): Promise<boolean> {
    return this.gravarDocumento(caseId, file, 'Recebidos do cofre');
  }

  /**
   * EXCLUI o documento do Drive (lixeira do Google — recuperável por lá por
   * 30 dias). A UI SEMPRE pediu a autorização extra antes de chegar aqui.
   */
  async excluirDocumento(caseId: string, caminhoRelativo: string): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return false;
    try {
      const docs = await this.listarDocumentos(entrada.pastaId);
      const meta = docs.find((d) => d.caminho === caminhoRelativo || d.name === caminhoRelativo);
      if (!meta) return false;
      const r = await this.chamar(`${API}/files/${meta.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trashed: true }),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  /** Link para abrir as pastas no SITE do Google Drive (a "porta" da nuvem). */
  async linkExterno(caseId?: string): Promise<string | null> {
    try {
      if (!caseId) return `https://drive.google.com/drive/folders/${await this.raiz()}`;
      const entrada = await this.entradaDoCaso(caseId);
      return entrada ? `https://drive.google.com/drive/folders/${entrada.pastaId}` : null;
    } catch {
      return null;
    }
  }

  /** Arquiva: move a pasta do caso para _Arquivados/ dentro da raiz. */
  async arquivarCaso(caseId: string): Promise<boolean> {
    const entrada = await this.entradaDoCaso(caseId);
    if (!entrada) return false;
    try {
      const raizId = await this.raiz();
      const arquivados = await this.listar(
        `'${raizId}' in parents and name='${PASTA_ARQUIVADOS}' and mimeType='${MIME_PASTA}' and trashed=false`,
      );
      const destinoId = arquivados[0]?.id ?? (await this.criarPasta(PASTA_ARQUIVADOS, raizId));
      const r = await this.chamar(
        `${API}/files/${entrada.pastaId}?addParents=${destinoId}&removeParents=${raizId}`,
        { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' },
      );
      if (!r.ok) return false;
      this.casos.delete(caseId);
      return true;
    } catch {
      return false;
    }
  }
}
