/**
 * Pós-escritura — o que acontece DEPOIS da lavratura, gerado a partir do
 * próprio caso: cada bem, cada torna e cada característica do espólio
 * produz suas tarefas. Nada de checklist genérico igual para todo mundo.
 */

import type { Caso, Resultado } from './types';
import type { ResultadoAtribuicao } from './atribuicao';

export interface TarefaPosEscritura {
  id: string;
  titulo: string;
  detalhe: string;
  orgao: string;
  prazoOuAlerta?: string;
  bemId?: string;
  prioridade: 1 | 2 | 3;
}

export function gerarPosEscritura(
  caso: Caso,
  resultado: Resultado,
  atribuicao?: ResultadoAtribuicao | null,
): TarefaPosEscritura[] {
  const t: TarefaPosEscritura[] = [];
  const n = (prefix: string, i: number) => `${prefix}-${i}`;

  /* --- por bem --- */
  caso.bens.forEach((b, i) => {
    const d = b.descricao.toLowerCase();
    const pareceImovel = /im[óo]vel|matr[íi]cula|apart|casa|terreno|lote|sala|loja/.test(d);
    const pareceVeiculo = /ve[íi]culo|carro|moto|caminh|placa/.test(d);
    const pareceConta = /conta|poupan|aplica|investim|banco|corretora/.test(d);
    const pareceQuota = /quota|cota|sociedade|empresa|ltda|s\/a|participa/.test(d);

    if (pareceImovel) {
      t.push({
        id: n('imovel', i),
        titulo: `Registrar a partilha na matrícula — ${b.descricao}`,
        detalhe:
          'Levar o traslado da escritura ao Registro de Imóveis da circunscrição do bem. A propriedade só se transmite aos herdeiros com o REGISTRO (CC art. 1.245); a escritura sozinha não basta.',
        orgao: 'Registro de Imóveis',
        prazoOuAlerta:
          'Fazer logo: a escritura não registrada não bloqueia atos do antigo titular perante terceiros de boa-fé.',
        bemId: b.id,
        prioridade: 1,
      });
    }
    if (pareceVeiculo) {
      t.push({
        id: n('veiculo', i),
        titulo: `Transferir o veículo — ${b.descricao}`,
        detalhe:
          'Transferência de propriedade no DETRAN com o traslado da escritura, vistoria e quitação de débitos (IPVA, multas, licenciamento).',
        orgao: 'DETRAN da UF do registro',
        prazoOuAlerta:
          'O CTB fixa 30 dias para o adquirente providenciar a transferência, sob pena de multa.',
        bemId: b.id,
        prioridade: 2,
      });
    }
    if (pareceConta) {
      t.push({
        id: n('banco', i),
        titulo: `Levantar valores — ${b.descricao}`,
        detalhe:
          'Apresentar o traslado ao banco/corretora para transferência dos saldos e posições aos quinhões definidos na escritura. Encerrar a conta do falecido ao final.',
        orgao: 'Instituição financeira',
        bemId: b.id,
        prioridade: 2,
      });
    }
    if (pareceQuota) {
      t.push({
        id: n('quota', i),
        titulo: `Alterar o quadro societário — ${b.descricao}`,
        detalhe:
          'Alteração contratual com o ingresso dos herdeiros (ou apuração de haveres, conforme o contrato social) e arquivamento na junta comercial. Verificar cláusula de sucessão no contrato.',
        orgao: 'Junta comercial da sede',
        bemId: b.id,
        prioridade: 2,
      });
    }
  });

  /* --- tornas e tributos inter vivos --- */
  const doacoes = atribuicao?.transferencias.filter((x) => x.tributo === 'ITCMD_DOACAO') ?? [];
  const onerosas = atribuicao?.transferencias.filter((x) => x.tributo === 'ITBI') ?? [];

  if (doacoes.length > 0) {
    t.push({
      id: 'itcmd-doacao',
      titulo: 'Declarar o ITCMD da cessão gratuita (transmissão inter vivos)',
      detalhe:
        `A partilha diferenciada gerou ${doacoes.length} cessão(ões) gratuita(s) — ` +
        doacoes.map((x) => `${x.cedenteNome} → ${x.cessionarioNome}: R$ ${x.valor}`).join('; ') +
        '. Declaração de DOAÇÃO no sistema estadual, SEPARADA da declaração causa mortis, com recolhimento antes da lavratura quando exigido.',
      orgao: 'SEFAZ estadual',
      prazoOuAlerta: 'O tabelião exige a comprovação do recolhimento para lavrar.',
      prioridade: 1,
    });
  }
  if (onerosas.length > 0) {
    t.push({
      id: 'itbi-torna',
      titulo: 'Recolher ITBI sobre a torna onerosa',
      detalhe:
        'A reposição em dinheiro sobre imóvel configura transmissão onerosa da fração excedente — ITBI municipal, guia emitida pela prefeitura do imóvel.',
      orgao: 'Prefeitura do município do imóvel',
      prioridade: 1,
    });
  }

  /* --- sempre --- */
  t.push(
    {
      id: 'homologacao-itcmd',
      titulo: 'Obter a homologação/certidão do ITCMD causa mortis',
      detalhe:
        'Acompanhar a declaração causa mortis até a certidão de homologação (em SP, emitida no Sistema Declaratório após a quitação). Guardar com o traslado.',
      orgao: 'SEFAZ estadual',
      prioridade: 1,
    },
    {
      id: 'ir-espolio-final',
      titulo: 'Entregar a Declaração Final de Espólio',
      detalhe:
        'Com a partilha lavrada, o espólio se encerra: DIRPF final de espólio na Receita, informando a destinação dos bens a cada herdeiro pelos valores da partilha. Avaliar ganho de capital se houve atribuição acima do custo declarado.',
      orgao: 'Receita Federal',
      prazoOuAlerta:
        'Prazo legal contado do trânsito/lavratura conforme a IN vigente — conferir o calendário do exercício.',
      prioridade: 1,
    },
    {
      id: 'atualizacao-cadastros',
      titulo: 'Atualizar cadastros dos bens transmitidos',
      detalhe:
        'IPTU (titularidade municipal), concessionárias, condomínio, seguros e contratos de locação existentes sobre os bens partilhados.',
      orgao: 'Diversos',
      prioridade: 3,
    },
    {
      id: 'baixa-cpf-pendencias',
      titulo: 'Conferir pendências residuais no CPF do falecido',
      detalhe:
        'Após a final de espólio, verificar se não restaram vínculos ativos (empresas, procurações, financiamentos) no CPF do falecido.',
      orgao: 'Receita Federal / diversos',
      prioridade: 3,
    },
  );

  /* --- condicionais do resultado --- */
  if (resultado.quinhoes.some((q) => q.papel === 'LEGATARIO')) {
    t.push({
      id: 'entrega-legado',
      titulo: 'Formalizar a entrega dos legados',
      detalhe:
        'Cumprimento das disposições testamentárias com registro/tradição conforme a natureza de cada bem legado.',
      orgao: 'Conforme o bem',
      prioridade: 2,
    });
  }

  return t.sort((a, b) => a.prioridade - b.prioridade);
}
