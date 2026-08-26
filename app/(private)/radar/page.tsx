// Radar de famílias — a tela do(a) ADVOGADO(A): habilitação (OAB verificada
// manualmente + quiz deontológico + assinatura mensal por UF) e a lista de
// casos ANÔNIMOS publicados pelas famílias, em ordem única por data. A rota
// só existe no site do Sucessorista e com o Radar ligado por env.

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { TourLexCausa } from '@/components/lexcausa/tour';
import { AvatarSessao } from '@/components/lexcausa/avatar-sessao';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { radarAtivo } from '@/lib/radar/config';
import {
  estadoRadarAdvogado,
  listarCasosRadar,
  minhasRespostasRadar,
  type CasoRadar,
  type RespostaMinha,
} from './radar-actions';
import { prisma } from '@/lib/prisma';
import { RadarClient } from './radar-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Radar Sucessório — LexCausa',
  robots: { index: false },
};

export default async function RadarPage() {
  await requirePlataforma('SUCESSORISTA');
  if (!radarAtivo()) notFound();
  await requireSession('/radar');

  const estado = await estadoRadarAdvogado();
  let casos: CasoRadar[] = [];
  let minhas: RespostaMinha[] = [];
  if (estado?.habilitado) {
    const [r, m] = await Promise.all([listarCasosRadar(), minhasRespostasRadar()]);
    if (r.ok) casos = r.casos;
    if (m.ok) minhas = m.respostas;
  }
  const session = await auth();
  // QUALIFICAÇÃO DE PRIMEIRO ACESSO: quem chega ao Radar sem perfil escolhido
  // passa pelo MESMO dialog do Sucessorista (perfil → identificação → quiz).
  let perfilConta: 'ADVOGADO' | 'NAO_ADVOGADO' | null = null;
  let nomeConta = '';
  try {
    const u = session?.user?.id
      ? await prisma.user.findUnique({
          where: { id: session.user.id },
          select: { perfilSucessorista: true, name: true },
        })
      : null;
    perfilConta = u?.perfilSucessorista ?? null;
    nomeConta = u?.name ?? '';
  } catch {
    // banco fora: degrada sem pedir a qualificação (nunca quebra a página)
    perfilConta = 'ADVOGADO';
  }
  return (
    <>
      <LexTopbar
        menu={<AvatarSessao />}
        ehMaster={isMaster(session)}
        radarAtivo
        sub="Radar Sucessório · by LexCausa"
      />
      <TourLexCausa
        id="radar"
        passos={[
          { titulo: 'Bem-vindo(a) ao Radar Sucessório', texto: 'Famílias publicam o caso ANÔNIMO e você vê os das suas UFs em ordem única por data — sem ranking, sem preço, sem disputa.' },
          { titulo: 'Candidatura com teto', texto: 'Cada caso aceita até dois advogados (o marcador X/2). A candidatura é a sua apresentação sóbria + como conduziria — a vitrine (áreas e experiência) acompanha.' },
          { titulo: 'A família escolhe', texto: 'Só quem ela chamar para conversar recebe o contato. Fechou? O funil "Minhas respostas" ganha o botão "Converter em inventário", que cria o caso pronto no Sucessorista.' },
        ]}
      />
      <RadarClient
        estado={estado}
        casos={casos}
        minhasRespostas={minhas}
        perfilConta={perfilConta}
        nomeConta={nomeConta}
      />
    </>
  );
}
