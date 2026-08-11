/**
 * Localizador de acervo — checklist guiado das fontes onde procurar o que o
 * falecido tinha. Catálogo estático + estado de progresso por caso.
 *
 * URLs conferidas na criação do módulo; portais públicos mudam de endereço —
 * mantenha este catálogo como DADO revisável, não verdade eterna.
 */

export type CategoriaFonte =
  | 'TESTAMENTO'
  | 'FINANCEIRO'
  | 'IMOVEIS'
  | 'VEICULOS'
  | 'TRABALHISTA'
  | 'FISCAL'
  | 'SOCIETARIO';

export interface FonteAcervo {
  id: string;
  nome: string;
  categoria: CategoriaFonte;
  oQueRevela: string;
  comoConsultar: string;
  url?: string;
  quemPodePedir: string;
  custo: 'GRATUITO' | 'PAGO' | 'VARIA';
  prioridade: 1 | 2 | 3;
}

export const CATALOGO_ACERVO: FonteAcervo[] = [
  {
    id: 'censec-testamento',
    nome: 'CENSEC / RCTO — testamentos',
    categoria: 'TESTAMENTO',
    oQueRevela: 'Existência de testamento público ou cerrado lavrado em qualquer tabelionato do país.',
    comoConsultar:
      'Pedido no portal do CNB/CENSEC com certidão de óbito. PRIMEIRA consulta do caso: o resultado decide a via (triagem).',
    url: 'https://censec.org.br',
    quemPodePedir: 'Qualquer interessado, após o óbito, com a certidão',
    custo: 'PAGO',
    prioridade: 1,
  },
  {
    id: 'svr-bacen',
    nome: 'Valores a Receber (Banco Central)',
    categoria: 'FINANCEIRO',
    oQueRevela: 'Saldos esquecidos em bancos, consórcios e cotas de capital em nome do falecido.',
    comoConsultar:
      'Sistema Valores a Receber do BC. Para falecidos, a consulta é feita por herdeiro/inventariante conforme o fluxo próprio do sistema.',
    url: 'https://valoresareceber.bcb.gov.br',
    quemPodePedir: 'Herdeiro, inventariante ou representante legal',
    custo: 'GRATUITO',
    prioridade: 1,
  },
  {
    id: 'registrato-ccs',
    nome: 'Registrato / CCS — relacionamentos bancários',
    categoria: 'FINANCEIRO',
    oQueRevela:
      'TODOS os bancos onde o falecido tinha conta ou relacionamento (CCS), chaves Pix, empréstimos.',
    comoConsultar:
      'Ofício judicial no inventário judicial; na via extrajudicial, requerimento do inventariante nomeado na escritura de nomeação, conforme o procedimento do BC.',
    url: 'https://registrato.bcb.gov.br',
    quemPodePedir: 'Inventariante / juízo',
    custo: 'GRATUITO',
    prioridade: 1,
  },
  {
    id: 'b3-investidor',
    nome: 'B3 — ações e renda fixa em bolsa',
    categoria: 'FINANCEIRO',
    oQueRevela: 'Posições em ações, FIIs, Tesouro Direto e custódia em corretoras.',
    comoConsultar:
      'Requerimento de herdeiro/inventariante ao atendimento da B3 com óbito e documentos; corretoras individuais também respondem a pedido formal.',
    url: 'https://www.investidor.b3.com.br',
    quemPodePedir: 'Inventariante / herdeiros com documentação',
    custo: 'GRATUITO',
    prioridade: 2,
  },
  {
    id: 'previdencia-privada',
    nome: 'Previdência privada e seguros de vida (VGBL/PGBL)',
    categoria: 'FINANCEIRO',
    oQueRevela:
      'Planos e apólices com beneficiários. ATENÇÃO: em regra não integram o inventário (pagam direto ao beneficiário), mas precisam ser localizados.',
    comoConsultar:
      'Consulta de apólices e planos em nome do falecido junto à SUSEP/entidades e seguradoras; o extrato do IR do falecido é a melhor pista.',
    quemPodePedir: 'Beneficiários / inventariante',
    custo: 'GRATUITO',
    prioridade: 2,
  },
  {
    id: 'matriculas-imoveis',
    nome: 'Imóveis — busca de matrículas',
    categoria: 'IMOVEIS',
    oQueRevela: 'Imóveis registrados em nome do falecido em cartórios de registro de imóveis.',
    comoConsultar:
      'Pesquisa por CPF nas centrais de registradores (ONR/SAEC e centrais estaduais, ex.: registradores.org.br em SP). Cobrir as UFs onde o falecido viveu.',
    url: 'https://www.registrodeimoveis.org.br',
    quemPodePedir: 'Qualquer pessoa (busca paga por CPF)',
    custo: 'PAGO',
    prioridade: 1,
  },
  {
    id: 'iptu-prefeitura',
    nome: 'Cadastro imobiliário municipal (IPTU)',
    categoria: 'IMOVEIS',
    oQueRevela: 'Imóveis lançados no cadastro fiscal do município — pega posses e imóveis não registrados.',
    comoConsultar: 'Requerimento na prefeitura de cada município relevante, com óbito e vínculo.',
    quemPodePedir: 'Herdeiro / inventariante',
    custo: 'GRATUITO',
    prioridade: 3,
  },
  {
    id: 'detran-veiculos',
    nome: 'DETRAN — veículos',
    categoria: 'VEICULOS',
    oQueRevela: 'Veículos registrados no CPF do falecido, débitos e restrições.',
    comoConsultar:
      'Consulta por CPF no DETRAN da UF (em SP, via portal/atendimento com documentação de herdeiro).',
    quemPodePedir: 'Herdeiro / inventariante',
    custo: 'GRATUITO',
    prioridade: 2,
  },
  {
    id: 'fgts-inss',
    nome: 'FGTS, PIS/PASEP e resíduos do INSS',
    categoria: 'TRABALHISTA',
    oQueRevela:
      'Saldos de FGTS/PIS e valores não recebidos em vida do INSS. Lei 6.858/80: podem ser pagos aos dependentes habilitados SEM inventário.',
    comoConsultar:
      'FGTS: app FGTS/Caixa com habilitação de dependentes. INSS: requerimento de valores não recebidos pelo Meu INSS.',
    url: 'https://www.gov.br/pt-br/servicos/receber-valores-nao-recebidos-em-vida-pelo-segurado-falecido',
    quemPodePedir: 'Dependentes habilitados / sucessores',
    custo: 'GRATUITO',
    prioridade: 2,
  },
  {
    id: 'irpf-dirpf',
    nome: 'Última declaração de IR do falecido',
    categoria: 'FISCAL',
    oQueRevela:
      'O MAPA do patrimônio: bens declarados, contas, dívidas, previdência. É a fonte que orienta todas as outras.',
    comoConsultar:
      'Cópia da DIRPF via e-CAC com procuração/habilitação do inventariante, ou nos arquivos pessoais do falecido.',
    url: 'https://cav.receita.fazenda.gov.br',
    quemPodePedir: 'Inventariante habilitado na RFB',
    custo: 'GRATUITO',
    prioridade: 1,
  },
  {
    id: 'restituicao-ir',
    nome: 'Restituição de IR pendente',
    categoria: 'FISCAL',
    oQueRevela: 'Restituições não resgatadas em nome do falecido.',
    comoConsultar:
      'Consulta de restituição na Receita; liberação a dependentes/sucessores conforme Lei 6.858/80 ou alvará.',
    quemPodePedir: 'Dependentes / inventariante',
    custo: 'GRATUITO',
    prioridade: 3,
  },
  {
    id: 'juntas-comerciais',
    nome: 'Juntas comerciais e Receita — participações societárias',
    categoria: 'SOCIETARIO',
    oQueRevela: 'Quotas de sociedades, MEI e empresas em que o falecido era sócio ou titular.',
    comoConsultar:
      'Consulta por CPF do QSA na Receita (cartão CNPJ / consulta de sócio) e ficha cadastral nas juntas das UFs relevantes (JUCESP em SP).',
    quemPodePedir: 'Qualquer pessoa (dados públicos de QSA)',
    custo: 'VARIA',
    prioridade: 2,
  },
  {
    id: 'criptoativos',
    nome: 'Criptoativos e exchanges',
    categoria: 'FINANCEIRO',
    oQueRevela: 'Posições em exchanges nacionais (declaradas à RFB via IN 1.888) e carteiras próprias.',
    comoConsultar:
      'Pistas na DIRPF (código de bens de cripto) e e-mails do falecido; pedido formal às exchanges com documentos do inventário. Carteira autocustodiada sem chave é, na prática, irrecuperável.',
    quemPodePedir: 'Inventariante',
    custo: 'GRATUITO',
    prioridade: 3,
  },
];

export type StatusItemAcervo = 'PENDENTE' | 'SOLICITADO' | 'RECEBIDO' | 'NAO_SE_APLICA';

export interface ItemChecklistAcervo {
  fonte: FonteAcervo;
  status: StatusItemAcervo;
  anotacao?: string;
}

/** Checklist inicial ordenado: prioridade 1 primeiro, testamento no topo. */
export function montarChecklistAcervo(): ItemChecklistAcervo[] {
  return [...CATALOGO_ACERVO]
    .sort((a, b) =>
      a.prioridade !== b.prioridade
        ? a.prioridade - b.prioridade
        : a.categoria === 'TESTAMENTO'
          ? -1
          : b.categoria === 'TESTAMENTO'
            ? 1
            : 0,
    )
    .map((fonte) => ({ fonte, status: 'PENDENTE' as const }));
}
