/**
 * Notificações do RADAR SUCESSÓRIO — SÓ SERVIDOR, env-gated como o resto do
 * e-mail da plataforma (`RESEND_API_KEY`): sem a chave nada daqui roda e o
 * fluxo continua funcionando pela tela.
 *
 * O desenho do Radar decidiu, com o escritório, que caso NOVO não gera
 * e-mail — o(a) advogado(a) descobre pelo sino e pela lista. O que estes
 * avisos cobrem é o oposto: o CICLO JÁ ABERTO entre pessoas que se
 * escolheram (conversa, contratação) e as decisões da plataforma sobre a
 * habilitação, que a pessoa não tem como adivinhar.
 *
 * Regras de conteúdo (docs/etica-oab.md):
 *  · nunca valores, nunca ranking, nunca "indicação";
 *  · o corpo do e-mail NÃO repete o texto da conversa (o conteúdo fica na
 *    plataforma — o e-mail só avisa que chegou);
 *  · o rodapé legal do Radar acompanha todo aviso à família.
 *
 * Tudo é melhor-esforço: falha de e-mail jamais derruba a ação de origem.
 */

import { emailHabilitado, enviarEmailPortal } from '@/lib/portal/email';

const RODAPE_FAMILIA =
  'Esta plataforma não intermedeia honorários nem indica advogados. Você pode retirar sua solicitação a qualquer momento.';
const RODAPE_ADVOGADO =
  'Aviso automático do Radar Sucessório — não responda a este e-mail. As respostas acontecem dentro da plataforma.';

const valido = (email: string | null | undefined): email is string =>
  typeof email === 'string' && /.+@.+\..+/.test(email);

/** Mensagem nova na conversa 1:1 — avisa o OUTRO lado (nunca o autor). */
export async function notificarMensagemRadar(opcoes: {
  /** 'familia' quando quem recebe é a família; 'advogado' no outro sentido. */
  destinatario: 'familia' | 'advogado';
  email: string | null | undefined;
  origin: string;
  /** Token de gestão da família (só quando o destinatário é ela). */
  tokenGestao?: string;
}): Promise<void> {
  if (!emailHabilitado() || !valido(opcoes.email)) return;
  const paraFamilia = opcoes.destinatario === 'familia';
  await enviarEmailPortal({
    para: opcoes.email,
    assunto: paraFamilia
      ? 'Nova mensagem do(a) advogado(a) que você escolheu'
      : 'Nova mensagem da família no Radar',
    titulo: 'Chegou uma mensagem',
    paragrafos: [
      paraFamilia
        ? 'O(a) advogado(a) com quem você abriu conversa respondeu. A mensagem está na sua solicitação — por segurança, o conteúdo não viaja por e-mail.'
        : 'A família com quem você conversa enviou uma mensagem. Ela espera por você no Radar — o conteúdo fica na plataforma.',
    ],
    urlPortal: paraFamilia
      ? opcoes.tokenGestao
        ? `${opcoes.origin}/familias/minha-solicitacao/${opcoes.tokenGestao}`
        : undefined
      : `${opcoes.origin}/radar`,
    rotuloBotao: paraFamilia ? 'Abrir a conversa' : 'Abrir o Radar',
    rodape: paraFamilia ? RODAPE_FAMILIA : RODAPE_ADVOGADO,
  });
}

/** A família confirmou "Contratei" — o(a) advogado(a) precisa do código. */
export async function notificarContratacaoRadar(opcoes: {
  email: string | null | undefined;
  origin: string;
  codigo: string;
}): Promise<void> {
  if (!emailHabilitado() || !valido(opcoes.email)) return;
  await enviarEmailPortal({
    para: opcoes.email,
    assunto: 'A família confirmou a contratação',
    titulo: 'Caso contratado pelo Radar',
    paragrafos: [
      'A família confirmou que contratou você para conduzir o inventário — obrigado por atendê-la com cuidado.',
      `Código para importar o caso em LexCausa: ${opcoes.codigo}. Use a faixa "Novos negócios" do painel Meus casos (ou o botão "Converter em inventário" no funil do Radar) — a folha nasce pré-preenchida com o que a família informou.`,
      'Os honorários são combinados diretamente com ela, fora da plataforma.',
    ],
    urlPortal: `${opcoes.origin}/radar`,
    rotuloBotao: 'Abrir o Radar',
    rodape: RODAPE_ADVOGADO,
  });
}

/** Verificação MANUAL da OAB decidida no /admin — aprovada, recusada ou
 *  suspensa. Quem se cadastrou fica no escuro sem este aviso. */
export async function notificarDecisaoOab(opcoes: {
  email: string | null | undefined;
  origin: string;
  situacao: 'aprovado' | 'recusado' | 'suspenso' | string;
  motivo?: string | null;
}): Promise<void> {
  if (!emailHabilitado() || !valido(opcoes.email)) return;
  const textos: Record<string, { assunto: string; titulo: string; paragrafos: string[] }> = {
    aprovado: {
      assunto: 'Sua inscrição na OAB foi verificada',
      titulo: 'Verificação concluída',
      paragrafos: [
        'Conferimos a sua inscrição na OAB e o seu perfil está aprovado no Radar Sucessório.',
        'Faltando algum passo (questionário deontológico), o próprio Radar mostra o que resta — aprovado(a), o mural inteiro de casos anônimos aparece, e cada candidatura consome 1 crédito da sua conta.',
      ],
    },
    recusado: {
      assunto: 'Não foi possível verificar a sua inscrição na OAB',
      titulo: 'Verificação não concluída',
      paragrafos: [
        'Não conseguimos confirmar a sua inscrição com os dados enviados.',
        opcoes.motivo
          ? `Motivo informado pela equipe: ${opcoes.motivo}`
          : 'Confira o número e a seccional no seu perfil e envie de novo.',
      ],
    },
    suspenso: {
      assunto: 'Seu perfil no Radar foi suspenso',
      titulo: 'Perfil suspenso',
      paragrafos: [
        'Seu perfil no Radar Sucessório foi suspenso e, por ora, não recebe novos casos.',
        opcoes.motivo
          ? `Motivo informado pela equipe: ${opcoes.motivo}`
          : 'Para entender o motivo e pedir revisão, fale com a equipe da plataforma.',
      ],
    },
  };
  const t = textos[opcoes.situacao];
  if (!t) return;
  await enviarEmailPortal({
    para: opcoes.email,
    assunto: t.assunto,
    titulo: t.titulo,
    paragrafos: t.paragrafos,
    urlPortal: `${opcoes.origin}/radar`,
    rotuloBotao: 'Abrir o Radar',
    rodape: RODAPE_ADVOGADO,
  });
}

/** Créditos do Radar concedidos à mão no /admin (a assinatura os origina). */
export async function notificarCreditosRadar(opcoes: {
  email: string | null;
  origin: string;
  quantidade: number;
  saldo: number;
}): Promise<void> {
  if (!opcoes.email) return;
  await enviarEmailPortal({
    para: opcoes.email,
    assunto: 'Seus créditos do Radar Sucessório foram atualizados',
    titulo: 'Créditos adicionados',
    paragrafos: [
      `${opcoes.quantidade} crédito(s) do Radar Sucessório foram adicionados à sua conta — saldo atual: ${opcoes.saldo}.`,
      'Cada candidatura a um caso consome 1 crédito, em qualquer UF. O crédito é preço de uso da plataforma — nunca comissão por caso: honorários seguem tratados diretamente entre você e a família.',
    ],
    urlPortal: `${opcoes.origin}/radar`,
    rotuloBotao: 'Abrir o Radar',
    rodape: 'Aviso automático — não responda a este e-mail.',
  });
}
