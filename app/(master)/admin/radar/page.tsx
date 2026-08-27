// /admin/radar — operação do Radar de famílias (MASTER): fila de verificação
// da OAB, créditos do Radar (concessão manual), funil por status/UF, varredura
// do aviso honesto de 72h e denúncias. Como todo /admin: requireMaster no topo
// e SÓ contadores/estados — nunca o conteúdo das conversas.


import { requirePlataforma } from "@/lib/app";
import { requireMaster } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { radarAtivo } from "@/lib/radar/config";
import { anonimizarIntake } from "@/lib/radar/anonimizar";
import { sanitizarRespostas } from "@/lib/familias/sanitizar";
import { AdminRadarClient, type DadosAdminRadar } from "./admin-radar-client";

export const dynamic = "force-dynamic";

const HORAS_AVISO = 72;

const limiteAviso = () => new Date(Date.now() - HORAS_AVISO * 3_600_000);

export default async function AdminRadarPage() {
  await requireMaster();
  await requirePlataforma("SUCESSORISTA");

  let dados: DadosAdminRadar = {
    ativo: radarAtivo(),
    perfis: [],
    denuncias: [],
    publicacoes: [],
    funil: {
      publicados: 0,
      emConversa: 0,
      contratados: 0,
      retirados: 0,
      respostas: 0,
      aguardandoConfirmacao: 0,
      semPedido: 0,
      porUf: [],
    },
    elegiveis72h: 0,
  };
  try {
    const [
      perfis,
      denuncias,
      publicados,
      emConversa,
      contratados,
      retirados,
      respostas,
      porUf,
      semAviso,
      aguardandoConfirmacao,
      semPedido,
    ] = await Promise.all([
        prisma.advogadoPerfil.findMany({ orderBy: { createdAt: "asc" }, take: 200 }),
        prisma.radarDenuncia.findMany({ orderBy: { createdAt: "asc" }, take: 100 }),
        prisma.familiaIntake.count({ where: { status: "publicado" } }),
        prisma.familiaIntake.count({ where: { status: "em_conversa" } }),
        prisma.familiaIntake.count({ where: { status: "contratado" } }),
        prisma.familiaIntake.count({ where: { status: "retirado" } }),
        prisma.radarResposta.count(),
        prisma.familiaIntake.groupBy({
          by: ["uf"],
          where: { status: { in: ["publicado", "em_conversa"] } },
          _count: { _all: true },
        }),
        prisma.familiaIntake.count({
          where: {
            status: "publicado",
            publicadoEm: { lt: limiteAviso() },
            aviso72hEm: null,
            email: { not: null },
          },
        }),
        // Pediu a análise e o link de confirmação FOI enviado, mas ninguém
        // clicou: o caso NÃO está no Radar (o clique é o consentimento).
        // Sem este contador a etapa era invisível — parecia que a
        // publicação tinha falhado.
        prisma.familiaIntake.count({
          where: { status: "resultado", confirmacaoToken: { not: null } },
        }),
        // Respondeu o questionário e nunca pediu análise — nem chegou ao
        // Radar por escolha da família.
        prisma.familiaIntake.count({
          where: { status: "resultado", confirmacaoToken: null },
        }),
      ]);
    // MODERAÇÃO DO MURAL: as publicações ativas, no MESMO recorte anônimo
    // que os advogados assinantes veem (anonimizarIntake) — inclusive as
    // observações livres da família, que são exatamente o campo a moderar.
    // Isto NÃO fura a regra "nunca conteúdo de intake em /admin": o card é o
    // conteúdo JÁ PÚBLICO do mural, não o intake bruto — nome, e-mail e
    // token seguem nunca aparecendo aqui.
    const linhasPublicadas = await prisma.familiaIntake.findMany({
      where: { status: { in: ["publicado", "em_conversa"] } },
      orderBy: { publicadoEm: "asc" },
      take: 100,
    });
    const agoraIso = new Date().toISOString();
    const publicacoes = linhasPublicadas.flatMap((l) => {
      const r = sanitizarRespostas(l.respostas);
      if (!r || !l.publicadoEm) return [];
      return [
        {
          intakeId: l.id,
          status: l.status,
          temEmail: Boolean(l.email),
          caso: anonimizarIntake({
            id: l.id,
            respostas: r,
            pequenoValor: l.pequenoValor,
            publicadoEm: l.publicadoEm.toISOString(),
            hoje: agoraIso,
          }),
        },
      ];
    });

    const ids = perfis.map((p) => p.userId);
    const usuarios = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, email: true },
    });
    const usuarioPor = new Map(usuarios.map((u) => [u.id, u]));
    dados = {
      ativo: radarAtivo(),
      perfis: perfis.map((p) => ({
        userId: p.userId,
        nome: usuarioPor.get(p.userId)?.name ?? "(conta apagada)",
        email: usuarioPor.get(p.userId)?.email ?? "",
        oab: `OAB/${p.oabUf} ${p.oab}`,
        situacao: p.situacao,
        motivoRecusa: p.motivoRecusa,
        quizOk: p.quizAprovadoEm !== null,
        aceitaPequenoValor: p.aceitaPequenoValor,
        creditos: p.creditosRadar,
      })),
      publicacoes,
      denuncias: denuncias.map((d) => ({
        id: d.id,
        advogado: usuarioPor.get(d.advogadoUserId)?.name ?? d.advogadoUserId,
        motivo: d.motivo,
        status: d.status,
        em: d.createdAt.toISOString().slice(0, 10),
      })),
      funil: {
        publicados,
        emConversa,
        contratados,
        retirados,
        respostas,
        aguardandoConfirmacao,
        semPedido,
        porUf: porUf
          .map((l) => ({ uf: l.uf, casos: l._count._all }))
          .sort((a, b) => b.casos - a.casos),
      },
      elegiveis72h: semAviso,
    };
  } catch {
    // migração pendente/erro de banco: a tela abre vazia com o aviso do client
  }

  return (
    <main className="flex flex-col gap-6">

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Radar de famílias</h1>
        <p className="text-sm text-muted-foreground">
          Verificação manual da OAB, créditos do Radar, aviso honesto de 72h e
          denúncias. A plataforma não intermedeia honorários nem indica advogados — este
          painel opera cadastros e contadores, nunca as conversas.
        </p>
      </header>

      <AdminRadarClient dados={dados} />
    </main>
  );
}
