// "Minha solicitação" — o painel do herdeiro no Radar (token = credencial):
// status honesto, o resumo ANÔNIMO que os advogados veem (transparência), as
// RESPOSTAS recebidas (ordem aleatória FIXA — sem ranking), a conversa 1:1 e
// o botão de retirar, que apaga tudo do servidor.

import type { Metadata } from 'next';

import { requirePlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import { sanitizarRespostas } from '@/lib/familias/sanitizar';
import { anonimizarIntake, type CasoAnonimo } from '@/lib/radar/anonimizar';
import { embaralharFixo } from '@/lib/radar/ordem';
import { MinhaSolicitacaoClient } from './minha-solicitacao-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Minha solicitação — O Sucessorista',
  robots: { index: false },
};

const HORAS_AVISO = 72;
const DIAS_REABRIR_CONVERSA = 30;

const horasDesde = (d: Date): number => Math.floor((Date.now() - d.getTime()) / 3_600_000);

const conversaParada = (abertaEm: Date): boolean =>
  Date.now() - abertaEm.getTime() > DIAS_REABRIR_CONVERSA * 86_400_000;

export interface RespostaParaFamilia {
  advogadoId: string;
  nome: string;
  oab: string;
  apresentacao: string;
  conducao: string;
  em: string;
}

export interface ConversaParaFamilia {
  advogadoNome: string;
  advogadoOab: string;
  mensagens: { autor: string; texto: string; em: string }[];
}

export default async function MinhaSolicitacaoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await requirePlataforma('SUCESSORISTA');
  const { token } = await params;

  let dados: {
    status: string;
    publicadoEm: string | null;
    horasSemResposta: number | null;
    casoAnonimo: CasoAnonimo | null;
    urlResultado: string;
    respostas: RespostaParaFamilia[];
    conversa: ConversaParaFamilia | null;
    codigoContratacao: string | null;
  } | null = null;
  try {
    let intake = await prisma.familiaIntake.findUnique({
      where: { tokenGestao: token.slice(0, 120) },
    });
    // Conversa parada há mais de 30 dias sem contratação volta ao Radar.
    if (
      intake &&
      intake.status === 'em_conversa' &&
      intake.conversaAbertaEm &&
      conversaParada(intake.conversaAbertaEm)
    ) {
      intake = await prisma.familiaIntake.update({
        where: { id: intake.id },
        data: { status: 'publicado', conversaAdvogadoUserId: null, conversaAbertaEm: null },
      });
    }
    if (intake && intake.status !== 'retirado' && intake.expiraEm > new Date()) {
      const respostas = sanitizarRespostas(intake.respostas);
      const publicado = intake.publicadoEm !== null && intake.status !== 'resultado';

      // Respostas recebidas — nome e OAB SEMPRE aparecem (a identificação do
      // profissional é dever ético; anônima é só a família). Ordem aleatória
      // FIXA pelo token: sem ranking e sem re-sorteio a cada visita.
      let cartas: RespostaParaFamilia[] = [];
      let conversa: ConversaParaFamilia | null = null;
      let codigoContratacao: string | null = null;
      if (publicado) {
        const linhas = await prisma.radarResposta.findMany({
          where: { intakeId: intake.id },
          orderBy: { createdAt: 'asc' },
        });
        const ids = [...new Set(linhas.map((l) => l.advogadoUserId))];
        const [usuarios, perfis] = await Promise.all([
          prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
          prisma.advogadoPerfil.findMany({ where: { userId: { in: ids } } }),
        ]);
        const nomePor = new Map(usuarios.map((u) => [u.id, u.name ?? 'Advogado(a)']));
        const oabPor = new Map(perfis.map((p) => [p.userId, `OAB/${p.oabUf} ${p.oab}`]));
        cartas = embaralharFixo(
          linhas.map((l) => ({
            advogadoId: l.advogadoUserId,
            nome: nomePor.get(l.advogadoUserId) ?? 'Advogado(a)',
            oab: oabPor.get(l.advogadoUserId) ?? '',
            apresentacao: l.apresentacao,
            conducao: l.conducao,
            em: l.createdAt.toISOString().slice(0, 10),
          })),
          token,
        );

        if (intake.conversaAdvogadoUserId) {
          const mensagens = await prisma.radarMensagem.findMany({
            where: { intakeId: intake.id, advogadoUserId: intake.conversaAdvogadoUserId },
            orderBy: { createdAt: 'asc' },
            take: 500,
          });
          conversa = {
            advogadoNome: nomePor.get(intake.conversaAdvogadoUserId) ?? 'Advogado(a)',
            advogadoOab: oabPor.get(intake.conversaAdvogadoUserId) ?? '',
            mensagens: mensagens.map((m) => ({
              autor: m.autor,
              texto: m.texto,
              em: m.createdAt.toISOString(),
            })),
          };
        }
        if (intake.status === 'contratado') {
          const handoff = await prisma.intakeHandoff.findFirst({
            where: { intakeId: intake.id, advogadoUserId: { not: null } },
            orderBy: { createdAt: 'desc' },
          });
          codigoContratacao = handoff?.codigo ?? null;
        }
      }

      dados = {
        status: intake.status,
        publicadoEm: intake.publicadoEm?.toISOString() ?? null,
        horasSemResposta:
          publicado && intake.publicadoEm && cartas.length === 0
            ? horasDesde(intake.publicadoEm)
            : null,
        casoAnonimo:
          publicado && respostas && intake.publicadoEm
            ? anonimizarIntake({
                id: intake.id,
                respostas,
                pequenoValor: intake.pequenoValor,
                publicadoEm: intake.publicadoEm.toISOString(),
              })
            : null,
        urlResultado: `/familias/resultado/${intake.tokenGestao}`,
        respostas: cartas,
        conversa,
        codigoContratacao,
      };
    }
  } catch {
    dados = null;
  }

  return (
    <MinhaSolicitacaoClient token={token} dados={dados} horasAviso={HORAS_AVISO} />
  );
}
