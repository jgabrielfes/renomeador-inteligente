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
  | 'NOTIFICACAO';

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
}

/** Tipos que o HERDEIRO pode ver nas "Atualizações do caso" — os demais são
 *  bastidores do escritório. Evento com token só aparece para AQUELE token
 *  (o filtro é de quem consulta). */
export const TIPOS_VISIVEIS_AO_HERDEIRO: TipoEventoPortal[] = [
  'FASE',
  'DOC_ACEITO',
  'DOC_RECUSADO',
  'PENDENCIA',
  'QUINHAO_LIBERADO',
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
};
