/**
 * Portal do herdeiro — armazenamento.
 *
 * Interface plugável com implementação em memória para desenvolvimento.
 * ATENÇÃO: memória zera a cada cold start de função serverless — em produção
 * na Vercel, troque `memoryStore` por uma implementação Postgres
 * (Neon/Supabase) ou Vercel KV mantendo esta mesma interface.
 * O upload real de arquivos pluga em Vercel Blob no mesmo ponto.
 */

export interface DocumentoPedido {
  id: string;
  titulo: string;
  descricao: string;
  status: 'PENDENTE' | 'ENVIADO' | 'APROVADO' | 'REJEITADO';
  observacaoAdvogado?: string;
  nomeArquivo?: string;
  /** Tipo detectado pelo renomeador local no navegador do herdeiro. */
  tipoDetectado?: string;
  enviadoEm?: string;
}

/** Campos aceitos no formulário do herdeiro (espelham a qualificação do caso). */
export const CAMPOS_QUALIFICACAO_HERDEIRO = [
  'rg',
  'cpf',
  'dataNascimento',
  'filiacao',
  'profissao',
  'estadoCivil',
  'email',
  'endereco',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'cep',
] as const;

export type QualificacaoHerdeiro = Partial<
  Record<(typeof CAMPOS_QUALIFICACAO_HERDEIRO)[number], string>
>;

export interface ConviteHerdeiro {
  token: string;
  casoId: string;
  /** Id do herdeiro no caso do advogado, para reimportar a qualificação. */
  herdeiroId?: string;
  nomeHerdeiro: string;
  nomeFalecido: string;
  nomeAdvogado: string;
  documentos: DocumentoPedido[];
  /** Preenchida pelo próprio herdeiro no portal. */
  qualificacao?: QualificacaoHerdeiro;
  qualificacaoEnviadaEm?: string;
  /** O herdeiro clicou "Salvar": confirmação de que o envio chegou à folha. */
  envioConfirmadoEm?: string;
  criadoEm: string;
}

export interface PortalStore {
  criar(convite: ConviteHerdeiro): Promise<void>;
  obter(token: string): Promise<ConviteHerdeiro | null>;
  atualizarDocumento(
    token: string,
    docId: string,
    patch: Partial<DocumentoPedido>,
  ): Promise<ConviteHerdeiro | null>;
  salvarQualificacao(
    token: string,
    qualificacao: QualificacaoHerdeiro,
  ): Promise<ConviteHerdeiro | null>;
  confirmarEnvio(token: string): Promise<ConviteHerdeiro | null>;
}

const mem = new Map<string, ConviteHerdeiro>();

export const memoryStore: PortalStore = {
  async criar(c) {
    mem.set(c.token, c);
  },
  async obter(token) {
    return mem.get(token) ?? null;
  },
  async atualizarDocumento(token, docId, patch) {
    const c = mem.get(token);
    if (!c) return null;
    const doc = c.documentos.find((d) => d.id === docId);
    if (!doc) return null;
    Object.assign(doc, patch);
    return c;
  },
  async salvarQualificacao(token, qualificacao) {
    const c = mem.get(token);
    if (!c) return null;
    c.qualificacao = { ...c.qualificacao, ...qualificacao };
    c.qualificacaoEnviadaEm = new Date().toISOString();
    return c;
  },
  async confirmarEnvio(token) {
    const c = mem.get(token);
    if (!c) return null;
    c.envioConfirmadoEm = new Date().toISOString();
    return c;
  },
};

/** Troque aqui pela implementação persistente em produção. */
export const store: PortalStore = memoryStore;

export const DOCUMENTOS_PADRAO_HERDEIRO: Omit<DocumentoPedido, 'status'>[] = [
  { id: 'rg-cpf', titulo: 'RG e CPF (ou CNH)', descricao: 'Documento de identidade com CPF, frente e verso, legível.' },
  { id: 'certidao-estado-civil', titulo: 'Certidão de nascimento ou casamento', descricao: 'Atualizada (emitida há menos de 90 dias). Se casado, com o regime de bens legível; se houver pacto, o pacto registrado.' },
  { id: 'comprovante-endereco', titulo: 'Comprovante de endereço', descricao: 'Conta de consumo ou correspondência bancária recente, no seu nome.' },
  { id: 'profissao', titulo: 'Profissão e dados de qualificação', descricao: 'Informe profissão, nacionalidade e e-mail — entram na qualificação da escritura.' },
];

export function gerarToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
