import { auth } from '@/lib/auth';
import {
  store,
  gerarToken,
  DOCUMENTOS_PADRAO_HERDEIRO,
  type ConviteHerdeiro,
} from '@/lib/portal/store';
import { foraDaPlataforma } from '@/lib/app';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface Body {
  casoId: string;
  herdeiroId?: string;
  nomeHerdeiro: string;
  nomeFalecido: string;
  nomeAdvogado: string;
  documentosExtras?: { id: string; titulo: string; descricao: string }[];
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
  if (!body?.casoId || !body?.nomeHerdeiro) {
    return Response.json({ erro: 'casoId e nomeHerdeiro são obrigatórios' }, { status: 422 });
  }

  const convite: ConviteHerdeiro = {
    token: gerarToken(),
    casoId: body.casoId,
    herdeiroId: body.herdeiroId,
    nomeHerdeiro: body.nomeHerdeiro,
    nomeFalecido: body.nomeFalecido ?? '',
    nomeAdvogado: body.nomeAdvogado ?? '',
    criadoEm: new Date().toISOString(),
    documentos: [
      ...DOCUMENTOS_PADRAO_HERDEIRO.map((d) => ({ ...d, status: 'PENDENTE' as const })),
      ...(body.documentosExtras ?? []).map((d) => ({ ...d, status: 'PENDENTE' as const })),
    ],
  };

  await store.criar(convite);
  return Response.json({ token: convite.token, url: `/portal/${convite.token}` }, { status: 201 });
}
