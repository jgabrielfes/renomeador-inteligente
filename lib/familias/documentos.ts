/**
 * Checklist de documentos da área "Para famílias" — MOTOR PURO derivado das
 * respostas do questionário. A lista é a mesma lógica do catálogo do módulo
 * profissional, dita em linguagem leiga e SEM pedir nada sensível agora: é o
 * que a família já pode ir separando enquanto decide os próximos passos.
 */

import type { RespostasFamilia } from './tipos';
import type { ViaIndicada } from './triagem';

export interface ItemChecklist {
  id: string;
  titulo: string;
  detalhe: string;
}

export function montarChecklistDocumentos(
  r: RespostasFamilia,
  via: ViaIndicada,
): ItemChecklist[] {
  const itens: ItemChecklist[] = [
    {
      id: 'certidao-obito',
      titulo: 'Certidão de óbito',
      detalhe: 'O documento que abre tudo. Peça 2ª via no cartório de registro civil se não tiver em mãos.',
    },
    {
      id: 'docs-falecido',
      titulo: 'RG e CPF de quem faleceu',
      detalhe: 'Cópias legíveis; se não encontrar, o número do CPF já ajuda.',
    },
    {
      id: 'certidao-casamento-obito',
      titulo:
        r.vinculo === 'casado'
          ? 'Certidão de casamento atualizada'
          : r.vinculo === 'uniao-estavel'
            ? 'Prova da união estável'
            : 'Certidão de nascimento ou casamento de quem faleceu',
      detalhe:
        r.vinculo === 'casado'
          ? 'Emitida há menos de 90 dias, com o regime de bens legível (e o pacto, se houver).'
          : r.vinculo === 'uniao-estavel'
            ? 'Escritura ou declaração da união, se existir — sem documento, a união pode ser reconhecida no próprio inventário.'
            : 'Atualizada (menos de 90 dias), para provar o estado civil.',
    },
    {
      id: 'docs-herdeiros',
      titulo: 'RG, CPF e certidões de cada herdeiro',
      detalhe:
        'Documento com foto + certidão de nascimento/casamento de cada um. Herdeiro casado junta também a do cônjuge.',
    },
    {
      id: 'comprovante-endereco',
      titulo: 'Comprovante de endereço do falecido',
      detalhe: 'Conta recente — define onde o inventário corre.',
    },
  ];

  if (r.testamento !== 'nao') {
    itens.push({
      id: 'certidao-testamento',
      titulo: 'Certidão de testamento',
      detalhe:
        'A busca no colégio notarial diz se existe testamento registrado — cartórios e juízes exigem essa certidão de qualquer forma.',
    });
  }

  if (r.bens.imoveis) {
    itens.push(
      {
        id: 'matriculas',
        titulo: 'Matrícula atualizada de cada imóvel',
        detalhe: 'Certidão do registro de imóveis (vale a de menos de 30 dias na hora do ato).',
      },
      {
        id: 'iptu-itr',
        titulo: 'IPTU ou ITR de cada imóvel',
        detalhe: 'O carnê/certidão de valor venal — é a base do imposto.',
      },
    );
  }
  if (r.bens.veiculos) {
    itens.push({
      id: 'crlv',
      titulo: 'Documento dos veículos (CRLV)',
      detalhe: 'E o valor de referência (tabela Fipe) de cada um.',
    });
  }
  if (r.bens.financeiro) {
    itens.push({
      id: 'extratos',
      titulo: 'Extratos de contas e investimentos',
      detalhe:
        'Extrato na DATA DO FALECIMENTO de cada banco/corretora. FGTS e PIS entram aqui também.',
    });
  }
  if (r.bens.empresa) {
    itens.push({
      id: 'contrato-social',
      titulo: 'Contrato social e último balanço da empresa',
      detalhe: 'Para apurar o valor das quotas/participação de quem faleceu.',
    });
  }
  if (r.dividas === 'sim') {
    itens.push({
      id: 'dividas',
      titulo: 'Relação das dívidas',
      detalhe: 'Contratos, faturas e saldos — as dívidas saem do total antes da divisão.',
    });
  }
  if (r.herdeiroExterior === 'sim') {
    itens.push({
      id: 'procuracao-exterior',
      titulo: 'Procuração de quem está fora do país',
      detalhe:
        'Feita no consulado brasileiro ou por videoconferência (e-Notariado) — vale começar cedo, é o item mais demorado.',
    });
  }
  if (via === 'ALVARA') {
    itens.push({
      id: 'comprovantes-valores',
      titulo: 'Comprovantes dos valores a receber',
      detalhe: 'Extrato do FGTS/PIS, saldo bancário, holerites de verbas — o juiz libera com base neles.',
    });
  }

  return itens;
}
