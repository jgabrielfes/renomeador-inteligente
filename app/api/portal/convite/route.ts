import { auth } from '@/lib/auth';
import {
  gerarToken,
  DOCUMENTOS_PADRAO_HERDEIRO,
  type ConviteHerdeiro,
} from '@/lib/portal/store';
// Store PERSISTENTE (Postgres): o convite não expira e os envios sobrevivem
// aos cold starts — a memória era o que fazia o link "morrer".
import { store } from '@/lib/portal/store-prisma';
import { foraDaPlataforma } from '@/lib/app';
import { APP } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import { PEDIDO_DOCS_ADVOGADO } from '@/lib/rede/escopo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  casoId: string;
  herdeiroId?: string;
  nomeHerdeiro: string;
  nomeFalecido: string;
  nomeAdvogado: string;
  documentosExtras?: { id: string; titulo: string; descricao: string }[];
  /** 'mediador' cria o convite de MEDIADOR(A): acompanha o espaço do
   *  espólio sem deliberar — sem pedidos de documentos nem qualificação.
   *  'advogado' (camada 4) convida o(a) ADVOGADO(A) CONSTITUÍDO(A) de
   *  herdeiros específicos — exige conta no Sucessorista com OAB verificada. */
  papel?: string;
  /** Convite de advogado: e-mail da CONTA do(a) colega (OAB aprovada). */
  advogadoEmail?: string;
  /** Convite de advogado: tokens dos convites de herdeiro representados. */
  representaTokens?: string[];
  /** Convite de advogado: nomes dos representados (exibição nos cabeçalhos). */
  representaNomes?: string[];
  /** 'herdeiro' quando o ingresso nasceu da indicação no painel do herdeiro
   *  (advogadoProprio) — o convite do titular É a aprovação; fica no log. */
  indicadoPor?: string;
}

export async function POST(req: Request) {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  // Só o profissional logado emite convites; o herdeiro entra pelo token.
  const session = await auth();
  if (!session) {
    return Response.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }
  // Convite de ADVOGADO(A) não tem nomeHerdeiro — o nome vem da conta dele(a).
  if (!body?.casoId || (!body?.nomeHerdeiro && body?.papel !== 'advogado')) {
    return Response.json({ erro: 'casoId e nomeHerdeiro são obrigatórios' }, { status: 422 });
  }

  // O link leva o PRIMEIRO NOME do herdeiro (ex.: /portal/maria-8f3a…):
  // fica claro para quem é o convite ao compartilhar no WhatsApp/e-mail. A
  // credencial continua sendo a parte ALEATÓRIA — o nome é só legibilidade.
  const primeiroNome = body.nomeHerdeiro
    .trim()
    .split(/\s+/)[0]
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 24);

  // ADVOGADO(A) CONSTITUÍDO(A) (camada 4): o convite-espelho só nasce para
  // uma CONTA real do Sucessorista com OAB verificada (camada 3) — token é
  // credencial de leigo; o(a) colega entra identificado(a).
  if (body.papel === 'advogado') {
    const email = String(body.advogadoEmail ?? '').trim().toLowerCase();
    if (!email) return Response.json({ erro: 'Informe o e-mail da conta do(a) colega.' }, { status: 422 });
    const conta = await prisma.user.findUnique({
      where: { email_app: { email, app: APP } },
      select: { id: true, name: true },
    });
    if (!conta) {
      return Response.json(
        { erro: 'Não há conta do Sucessorista com este e-mail — peça ao(à) colega para criar uma e verificar a OAB.' },
        { status: 404 },
      );
    }
    const perfil = await prisma.advogadoPerfil.findUnique({ where: { userId: conta.id } });
    if (!perfil || perfil.situacao !== 'aprovado') {
      return Response.json(
        { erro: 'A conta existe, mas a OAB ainda não foi verificada (o(a) colega faz isso em /radar).' },
        { status: 409 },
      );
    }
    const jaNoCaso = await prisma.casoAdvogado.findUnique({
      where: { casoId_advogadoUserId: { casoId: body.casoId, advogadoUserId: conta.id } },
    });
    if (jaNoCaso && jaNoCaso.status === 'ativo') {
      return Response.json({ erro: 'Este(a) advogado(a) já está no caso.' }, { status: 409 });
    }
    const representaTokens = (body.representaTokens ?? []).map(String).slice(0, 40);
    const nomeAdv = conta.name ?? 'Advogado(a)';
    const convite: ConviteHerdeiro = {
      token: `adv-${gerarToken()}`,
      casoId: body.casoId,
      nomeHerdeiro: nomeAdv,
      nomeFalecido: body.nomeFalecido ?? '',
      nomeAdvogado: body.nomeAdvogado ?? '',
      criadoEm: new Date().toISOString(),
      papelConvite: 'advogado',
      representa: (body.representaNomes ?? []).map(String).slice(0, 40),
      oabAdvogado: `OAB/${perfil.oabUf} ${perfil.oab}`,
      // O único pedido do convite: os documentos que ele(a) quiser juntar
      // (procuração, substabelecimento…) — caem no card "Documentos do
      // advogado" da aba Documentos do titular, pelo pipeline existente.
      documentos: [{ ...PEDIDO_DOCS_ADVOGADO, status: 'PENDENTE' as const }],
    };
    await store.criar(convite);
    if (jaNoCaso) {
      await prisma.casoAdvogado.update({
        where: { id: jaNoCaso.id },
        data: {
          status: 'ativo',
          representaTokens,
          conviteToken: convite.token,
          indicadoPor: body.indicadoPor === 'herdeiro' ? 'herdeiro' : 'titular',
        },
      });
    } else {
      await prisma.casoAdvogado.create({
        data: {
          casoId: body.casoId,
          advogadoUserId: conta.id,
          convidadoPorUserId: session.user?.id ?? '',
          indicadoPor: body.indicadoPor === 'herdeiro' ? 'herdeiro' : 'titular',
          representaTokens,
          conviteToken: convite.token,
        },
      });
    }
    const { registrarEventoPortal } = await import('@/lib/portal/eventos-server');
    void registrarEventoPortal(
      convite.casoId,
      'ADVOGADO_CONVIDADO',
      { herdeiro: nomeAdv, resposta: body.indicadoPor === 'herdeiro' ? 'indicado pelo herdeiro' : 'convidado pelo titular' },
      convite.token,
    );
    return Response.json(
      {
        token: convite.token,
        url: `/portal/${convite.token}`,
        nome: nomeAdv,
        oab: convite.oabAdvogado,
      },
      { status: 201 },
    );
  }

  const mediador = body.papel === 'mediador';
  const convite: ConviteHerdeiro = {
    token: primeiroNome ? `${primeiroNome}-${gerarToken()}` : gerarToken(),
    casoId: body.casoId,
    herdeiroId: mediador ? undefined : body.herdeiroId,
    nomeHerdeiro: body.nomeHerdeiro,
    nomeFalecido: body.nomeFalecido ?? '',
    nomeAdvogado: body.nomeAdvogado ?? '',
    criadoEm: new Date().toISOString(),
    ...(mediador ? { papelConvite: 'mediador' as const } : {}),
    // Mediador(a) acompanha — não tem lista de documentos a enviar.
    documentos: mediador
      ? []
      : [
          ...DOCUMENTOS_PADRAO_HERDEIRO.map((d) => ({ ...d, status: 'PENDENTE' as const })),
          ...(body.documentosExtras ?? []).map((d) => ({ ...d, status: 'PENDENTE' as const })),
        ],
  };

  await store.criar(convite);
  // Registro de atendimento: convite emitido (nome do herdeiro é dado do
  // próprio escritório — nunca vai a /admin).
  const { registrarEventoPortal } = await import('@/lib/portal/eventos-server');
  void registrarEventoPortal(
    convite.casoId,
    'CONVITE',
    { herdeiro: convite.nomeHerdeiro },
    convite.token,
  );
  return Response.json({ token: convite.token, url: `/portal/${convite.token}` }, { status: 201 });
}
