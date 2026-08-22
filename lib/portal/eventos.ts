/**
 * Registro de atendimento do Painel do Cliente — TIPOS E RÓTULOS, importáveis
 * pelo CLIENTE (o relatório em PDF monta no navegador). A GRAVAÇÃO fica em
 * `./eventos-server.ts` (só servidor — importa o Prisma).
 *
 * Conteúdo dos eventos: rótulos, nomes de herdeiro e motivos de recusa —
 * dado do PRÓPRIO escritório (como renamer_lessons), NUNCA exibido em /admin
 * e nunca com conteúdo de documento.
 */

export type TipoEventoPortal =
  | 'CONVITE'
  | 'CONVITE_REVOGADO'
  | 'ACESSO'
  | 'DADOS_RECEBIDOS'
  | 'CONFIRMACAO'
  | 'DOC_RECEBIDO'
  | 'DOC_ACEITO'
  | 'DOC_RECUSADO'
  | 'DOC_APAGADO'
  | 'PENDENCIA'
  | 'PUBLICACAO'
  | 'FASE'
  | 'QUINHAO_LIBERADO'
  | 'NOTIFICACAO'
  | 'ESPOLIO_ABERTO'
  | 'ESPOLIO_FECHADO'
  | 'ESPOLIO_VISTO'
  | 'ESPOLIO_NOTA'
  | 'ESPOLIO_SUGESTAO_DECIDIDA'
  | 'ESPOLIO_DESPESA'
  | 'ESPOLIO_DESPESA_DECIDIDA'
  | 'ESPOLIO_CENARIO'
  | 'ESPOLIO_CENARIO_RETIRADO'
  | 'ESPOLIO_ADESAO'
  | 'ESPOLIO_CONSENSO'
  | 'ESPOLIO_VOTACAO_ABERTA'
  | 'ESPOLIO_VOTO'
  | 'ESPOLIO_VOTACAO_ENCERRADA'
  | 'ESPOLIO_MURAL'
  | 'ESPOLIO_MURAL_MODERADA'
  | 'ESPOLIO_DIGEST'
  | 'CONTATO_TENTATIVA'
  | 'ADVOGADO_PROPRIO';

export interface DetalheEventoPortal {
  /** Nome do herdeiro do convite relacionado. */
  herdeiro?: string;
  /** Título do documento/pedido em questão. */
  documento?: string;
  /** Motivo da recusa (o texto que o herdeiro leu). */
  motivo?: string;
  /** FASE: título leigo da fase que passou a valer. */
  fase?: string;
  /** PUBLICACAO: quantos convites o espelho cobre. */
  convites?: number;
  /** Cenários do espólio: título do cenário em questão. */
  cenario?: string;
  /** ESPOLIO_ADESAO: resposta dada (aceito|nao_aceito|conversar). */
  resposta?: string;
  /** Votações do espólio: a pergunta deliberada. */
  votacao?: string;
  /** CONTATO_TENTATIVA: por onde se tentou falar (telefone, WhatsApp…). */
  meio?: string;
}

/** Meios da tentativa de contato com herdeiro ausente (lista fechada).
 *  Vive AQUI (e não em painel-actions.ts) porque arquivo 'use server' só
 *  pode exportar funções async — exportar a constante de lá derrubava o
 *  módulo INTEIRO de actions do painel em runtime (500 em todas). */
export const MEIOS_DE_CONTATO = [
  'telefone',
  'whatsapp',
  'e-mail',
  'carta',
  'pessoalmente',
  'outro',
] as const;

/** Tipos que o HERDEIRO pode ver nas "Atualizações do caso" — os demais são
 *  bastidores do escritório. Evento com token só aparece para AQUELE token
 *  (o filtro é de quem consulta). */
export const TIPOS_VISIVEIS_AO_HERDEIRO: TipoEventoPortal[] = [
  'FASE',
  'DOC_ACEITO',
  'DOC_RECUSADO',
  'PENDENCIA',
  'QUINHAO_LIBERADO',
  'ESPOLIO_CENARIO',
  'ESPOLIO_CONSENSO',
  'ESPOLIO_VOTACAO_ABERTA',
  'ESPOLIO_VOTACAO_ENCERRADA',
];

/** Texto LEIGO de um evento para o histórico do herdeiro — null = não exibir. */
export function textoLeigoDoEvento(
  tipo: string,
  detalhe: DetalheEventoPortal | null,
): string | null {
  switch (tipo) {
    case 'FASE':
      return detalhe?.fase
        ? `O inventário avançou para: ${detalhe.fase}`
        : 'O inventário mudou de fase';
    case 'DOC_ACEITO':
      return detalhe?.documento
        ? `Documento aprovado: ${detalhe.documento}`
        : 'Um documento seu foi aprovado';
    case 'DOC_RECUSADO':
      return detalhe?.documento
        ? `Documento devolvido para reenvio: ${detalhe.documento}`
        : 'Um documento seu precisa ser reenviado';
    case 'PENDENCIA':
      return detalhe?.documento
        ? `Novo documento solicitado a você: ${detalhe.documento}`
        : 'Um novo documento foi solicitado a você';
    case 'QUINHAO_LIBERADO':
      return 'Seu quinhão foi liberado para consulta nesta página';
    case 'ESPOLIO_CENARIO':
      return detalhe?.cenario
        ? `Novo cenário de divisão proposto à família: ${detalhe.cenario}`
        : 'Um novo cenário de divisão foi proposto à família';
    case 'ESPOLIO_CONSENSO':
      return detalhe?.cenario
        ? `A família fechou consenso no cenário: ${detalhe.cenario}`
        : 'A família fechou consenso em um cenário de divisão';
    case 'ESPOLIO_VOTACAO_ABERTA':
      return detalhe?.votacao
        ? `Nova votação aberta à família: ${detalhe.votacao}`
        : 'Uma nova votação foi aberta à família';
    case 'ESPOLIO_VOTACAO_ENCERRADA':
      return detalhe?.votacao
        ? `Votação encerrada com o resultado apurado: ${detalhe.votacao}`
        : 'Uma votação da família foi encerrada';
    default:
      return null;
  }
}

/** Rótulo do evento no RELATÓRIO do advogado (todos os tipos aparecem). */
export const ROTULO_EVENTO: Record<string, string> = {
  CONVITE: 'Convite enviado',
  CONVITE_REVOGADO: 'Convite revogado',
  ACESSO: 'Primeiro acesso do herdeiro ao portal',
  DADOS_RECEBIDOS: 'Formulário de dados recebido',
  CONFIRMACAO: 'Envio confirmado pelo herdeiro',
  DOC_RECEBIDO: 'Documento recebido',
  DOC_ACEITO: 'Documento aprovado',
  DOC_RECUSADO: 'Documento devolvido para reenvio',
  DOC_APAGADO: 'Arquivo apagado pelo herdeiro',
  PENDENCIA: 'Pendência atribuída pelo cofre',
  PUBLICACAO: 'Painel publicado para a família',
  FASE: 'Fase do inventário alterada',
  QUINHAO_LIBERADO: 'Quinhão liberado para consulta',
  NOTIFICACAO: 'Aviso enviado por e-mail',
  ESPOLIO_ABERTO: 'Espaço do espólio aberto para a família',
  ESPOLIO_FECHADO: 'Espaço do espólio fechado',
  ESPOLIO_VISTO: 'Herdeiro abriu o espaço do espólio (1º acesso)',
  ESPOLIO_NOTA: 'Comentário/sugestão registrado no espólio',
  ESPOLIO_SUGESTAO_DECIDIDA: 'Sugestão de valor decidida pelo escritório',
  ESPOLIO_DESPESA: 'Despesa adiantada informada por herdeiro',
  ESPOLIO_DESPESA_DECIDIDA: 'Despesa adiantada decidida pelo escritório',
  ESPOLIO_CENARIO: 'Cenário de divisão proposto à família',
  ESPOLIO_CENARIO_RETIRADO: 'Cenário de divisão retirado da conversa',
  ESPOLIO_ADESAO: 'Resposta de herdeiro a um cenário',
  ESPOLIO_CONSENSO: 'Consenso da família em um cenário (congelado)',
  ESPOLIO_VOTACAO_ABERTA: 'Votação aberta à família',
  ESPOLIO_VOTO: 'Voto de herdeiro em votação',
  ESPOLIO_VOTACAO_ENCERRADA: 'Votação encerrada (resultado apurado)',
  ESPOLIO_MURAL: 'Mensagem enviada ao mural da família',
  ESPOLIO_MURAL_MODERADA: 'Mensagem do mural moderada pelo escritório',
  ESPOLIO_DIGEST: 'Resumo do caso enviado à família por e-mail',
  CONTATO_TENTATIVA: 'Tentativa de contato com herdeiro registrada',
  ADVOGADO_PROPRIO: 'Herdeiro informou advogado(a) próprio(a)',
};
