/**
 * Guias da área "Para famílias" — a ESTRUTURA das páginas de conteúdo (SEO).
 * Renderização no servidor com metadados; os TEXTOS finais são do escritório
 * (os corpos abaixo são rascunhos de estrutura, marcados como tal).
 *
 * Guia novo = uma entrada aqui (slug estável, título, descrição e seções).
 */

export interface SecaoGuia {
  titulo: string;
  paragrafos: string[];
}

export interface Guia {
  slug: string;
  titulo: string;
  /** Meta description (SEO) e subtítulo da página. */
  descricao: string;
  /** true enquanto o texto final do escritório não chegar. */
  rascunho: boolean;
  secoes: SecaoGuia[];
}

export const GUIAS: Guia[] = [
  {
    slug: 'inventario-extrajudicial-quando-e-possivel',
    titulo: 'Inventário em cartório: quando é possível?',
    descricao:
      'Os requisitos do inventário extrajudicial, o que mudou com as resoluções do CNJ e quando o caminho ainda é o judicial — em linguagem simples.',
    rascunho: true,
    secoes: [
      {
        titulo: 'Os requisitos básicos',
        paragrafos: [
          '[Rascunho — texto final do escritório] Todos os herdeiros maiores e de acordo, com advogado(a); a escritura é lavrada no tabelionato.',
        ],
      },
      {
        titulo: 'Testamento, menores e o que mudou',
        paragrafos: [
          '[Rascunho] Testamento com autorização do juízo competente (Res. 35/CNJ e normas estaduais); menor/incapaz com participação do MP (Res. 571/2024).',
        ],
      },
    ],
  },
  {
    slug: 'itcmd-sp',
    titulo: 'ITCMD em São Paulo: como o imposto do inventário é calculado',
    descricao:
      'Alíquota, base de cálculo, prazo de 180 dias, desconto de 90 dias, multas e isenções do ITCMD paulista (Lei 10.705/2000) — explicado para famílias.',
    rascunho: true,
    secoes: [
      {
        titulo: 'A conta em uma frase',
        paragrafos: [
          '[Rascunho] 4% sobre o valor transmitido (excluída a meação), atualizado pela UFESP até o vencimento; atraso soma multas e juros.',
        ],
      },
      {
        titulo: 'Prazos que valem dinheiro',
        paragrafos: [
          '[Rascunho] 60 dias para abrir (CPC 611 e multa estadual), desconto até 90 dias, vencimento em 180 dias.',
        ],
      },
    ],
  },
  {
    slug: 'prazo-do-inventario-e-multa',
    titulo: 'Prazo para abrir o inventário: o que acontece se passar?',
    descricao:
      'Os 60 dias do art. 611 do CPC, as multas estaduais no imposto e por que atrasar não impede nada — mas custa caro.',
    rascunho: true,
    secoes: [
      {
        titulo: 'O prazo e a multa',
        paragrafos: ['[Rascunho] O que é o prazo de abertura, onde a multa incide e como estancar.'],
      },
    ],
  },
  {
    slug: 'alvara-judicial-lei-6858',
    titulo: 'Alvará judicial: quando a família nem precisa de inventário completo',
    descricao:
      'Saldos bancários, FGTS, PIS e verbas de pequeno valor podem ser liberados por alvará (Lei 6.858/80) — mais rápido e barato que o inventário.',
    rascunho: true,
    secoes: [
      {
        titulo: 'O que cabe no alvará',
        paragrafos: ['[Rascunho] Hipóteses da Lei 6.858/80, documentos e custo típico.'],
      },
    ],
  },
];

export const guiaPorSlug = (slug: string): Guia | null =>
  GUIAS.find((g) => g.slug === slug) ?? null;
