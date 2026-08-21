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
  /**
   * ARQUIVO real recebido pelo portal (tabela `portal_arquivos`): id para o
   * advogado baixar/anexar ao caso. Ausente = só o registro chegou (arquivo
   * grande demais ou falha no envio — o herdeiro entrega por outro canal).
   */
  arquivoId?: string;
  arquivoTamanho?: number;
}

/** Campos aceitos no formulário do herdeiro (espelham a qualificação do caso).
 *  `uniaoEstavel` trafega como texto ('sim' | '') — união estável NÃO é
 *  estado civil; os campos de cônjuge/casamento qualificam o cônjuge OU o(a)
 *  convivente, conforme o vínculo. */
export const CAMPOS_QUALIFICACAO_HERDEIRO = [
  'rg',
  'cpf',
  'dataNascimento',
  'filiacao',
  'profissao',
  'estadoCivil',
  'uniaoEstavel',
  'email',
  'endereco',
  'complemento',
  'bairro',
  'cidade',
  'uf',
  'cep',
  'conjugeNome',
  'conjugeCpf',
  'conjugeRg',
  'conjugeDataNascimento',
  'conjugeProfissao',
  'casamentoData',
  'casamentoRegime',
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
  /** Painel do Cliente — status do convite, visto pelo advogado. O carimbo
   *  de acesso vem da VISITA do herdeiro (GET com ?visita=1), nunca da
   *  revalidação de fundo do advogado. */
  primeiroAcessoEm?: string;
  ultimoAcessoEm?: string;
  /** Convite revogado pelo advogado: o portal responde 410 e nada mais
   *  entra por este token. O registro fica (histórico), o acesso morre. */
  revogadoEm?: string;
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
  /** Carimba a visita do herdeiro (1º acesso preservado, último atualizado). */
  marcarAcesso(token: string, primeiro: string, ultimo: string): Promise<void>;
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
  async marcarAcesso(token, primeiro, ultimo) {
    const c = mem.get(token);
    if (!c) return;
    c.primeiroAcessoEm = c.primeiroAcessoEm ?? primeiro;
    c.ultimoAcessoEm = ultimo;
  },
};

/**
 * As rotas de API usam o store PERSISTENTE (`./store-prisma`) — este módulo
 * fica importável pelo CLIENTE (só tipos e constantes) e o memoryStore vira
 * o fallback de banco fora. Não voltar as rotas para cá.
 */
export const store: PortalStore = memoryStore;

export const DOCUMENTOS_PADRAO_HERDEIRO: Omit<DocumentoPedido, 'status'>[] = [
  { id: 'rg-cpf', titulo: 'RG e CPF (ou CNH)', descricao: 'Documento de identidade com CPF, frente e verso, legível.' },
  { id: 'certidao-estado-civil', titulo: 'Certidão de nascimento ou casamento', descricao: 'Atualizada (emitida há menos de 90 dias). Se casado, com o regime de bens legível; se houver pacto, o pacto registrado.' },
  { id: 'comprovante-endereco', titulo: 'Comprovante de endereço', descricao: 'Conta de consumo ou correspondência bancária recente, no seu nome.' },
  // "Outros documentos" no lugar do antigo pedido de profissão (que não
  // tinha arquivo a anexar — a profissão entra no formulário de dados).
  { id: 'outros-documentos', titulo: 'Outros documentos', descricao: 'O que o seu caso pedir: procuração, declarações, escritura de união estável, documentos do cônjuge/convivente…' },
];

export function gerarToken(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
