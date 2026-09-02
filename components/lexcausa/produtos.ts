/**
 * Catálogo de PRODUTOS da LexCausa — a fonte única de nome, submarca, texto
 * e destino de cada produto, consumida pela landing pública, pelas páginas
 * institucionais (/produtos/*) e pelo hub logado. Produto novo entra AQUI e
 * as telas o herdam.
 */

export interface ProdutoLexCausa {
  id: 'sucessorista' | 'radar' | 'diligencias' | 'jurimetria';
  nome: string;
  /** Classe de escopo do acento visual (app/lexcausa.css). */
  classe:
    | 'produto-sucessorista'
    | 'produto-radar'
    | 'produto-diligencias'
    | 'produto-jurimetria';
  /** Uma linha — o card do hub e da landing. */
  tagline: string;
  /** Parágrafo da landing/página do produto. */
  descricao: string;
  perfis: string[];
  /** Entrada do produto para quem está logado. */
  href: string;
  /** Página institucional. */
  landing: string;
}

export const PRODUTOS_LEXCAUSA: ProdutoLexCausa[] = [
  {
    id: 'sucessorista',
    nome: 'LexCausa',
    classe: 'produto-sucessorista',
    tagline: 'Gestão de inventários, do primeiro atendimento ao registro.',
    descricao:
      'A folha de trabalho do inventário inteira: composição familiar com a qualificação das partes, acervo com os valores que a lei pede, quinhões com fundamento legal, cofre de documentos com leitura por IA e o espelho do ITCMD-SP — além de custas, honorários, minutas e o portal da família.',
    perfis: ['Advogado(a)', 'Não advogado(a)'],
    href: '/s',
    landing: '/produtos/sucessorista',
  },
  {
    id: 'radar',
    nome: 'Radar Sucessório',
    classe: 'produto-radar',
    tagline: 'O encontro entre famílias e advogados, com ética por construção.',
    descricao:
      'Famílias que precisam resolver um inventário registram a situação de graça e sem juridiquês; advogados(as) verificados(as) — OAB aprovada e questionário deontológico — respondem com apresentação e condução técnica. A família escolhe com quem falar; a plataforma não intermedeia honorários nem indica advogados.',
    perfis: ['Advogado(a) verificado(a)', 'Famílias'],
    href: '/radar',
    landing: '/produtos/radar',
  },
  {
    id: 'diligencias',
    nome: 'Diligências',
    classe: 'produto-diligencias',
    tagline: 'Correspondentes por comarca, com termo de referência e pasta isolada.',
    descricao:
      'Precisa de um ato em outra comarca — retirar certidão, acompanhar audiência, protocolo, ITCMD? Publique aos correspondentes verificados (OAB aprovada + questionário deontológico): as ofertas chegam em ordem neutra, o termo de referência registra escopo, prazo e valor combinados ENTRE os advogados, e a pasta isolada leva só os arquivos que você selecionar. O relatório entregue volta direto ao caso.',
    perfis: ['Advogado(a)', 'Não advogado(a)'],
    href: '/diligencias',
    landing: '/produtos/diligencias',
  },
  {
    id: 'jurimetria',
    nome: 'Jurimetria Registral',
    classe: 'produto-jurimetria',
    tagline: 'O histórico de exigências dos cartórios, antes do protocolo.',
    descricao:
      'Arraste o título ou a minuta ANTES de protocolar e veja o que os Registros de Imóveis registraram de exigência em atos parecidos — por cartório e por tema, com a decisão pública de origem. Ou navegue sem documento: escolha o cartório ou o tema e leia o histórico. O documento é lido no seu navegador e nunca sobe; e o que a tela mostra é histórico observado, nunca previsão ou garantia.',
    perfis: ['Advogado(a)', 'Não advogado(a)'],
    href: '/jurimetria',
    landing: '/produtos/jurimetria',
  },
];

/** Texto legal fixo do Radar (docs/etica-oab.md) — sempre visível nas telas. */
export const TEXTO_LEGAL_RADAR =
  'Esta plataforma não intermedeia honorários nem indica advogados.';
