'use server';

/**
 * /admin/radar — operação do Radar pela administração (MASTER):
 * fila de verificação da OAB (manual), assinaturas mensais por UF (manuais —
 * sem gateway, fora de escopo), varredura do aviso honesto de 72h e decisão
 * das denúncias (acatar = suspender o perfil).
 */

import { headers } from 'next/headers';

import { requireMaster } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { EH_SUCESSORISTA } from '@/lib/app';
import { UFS } from '@/lib/familias/tipos';
import { enviarEmailPortal } from '@/lib/portal/email';

const HORAS_AVISO = 72;

type Resultado = { ok: boolean; erro?: string };

export async function decidirPerfil(
  userId: string,
  acao: 'aprovar' | 'recusar' | 'suspender' | 'reativar',
  motivo?: string,
): Promise<Resultado> {
  await requireMaster();
  if (!EH_SUCESSORISTA) return { ok: false, erro: 'Recurso de outro site.' };
  try {
    const dados =
      acao === 'aprovar'
        ? { situacao: 'aprovado', motivoRecusa: null }
        : acao === 'recusar'
          ? { situacao: 'recusado', motivoRecusa: (motivo ?? '').trim().slice(0, 300) || 'Dados não conferem.' }
          : acao === 'suspender'
            ? { situacao: 'suspenso', motivoRecusa: (motivo ?? '').trim().slice(0, 300) || null }
            : { situacao: 'aprovado', motivoRecusa: null };
    await prisma.advogadoPerfil.update({ where: { userId }, data: dados });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível atualizar o perfil.' };
  }
}

export async function concederAssinatura(userId: string, uf: string): Promise<Resultado> {
  await requireMaster();
  if (!EH_SUCESSORISTA) return { ok: false, erro: 'Recurso de outro site.' };
  const ufNorm = uf.trim().toUpperCase();
  if (!(UFS as readonly string[]).includes(ufNorm)) return { ok: false, erro: 'UF inválida.' };
  try {
    await prisma.radarAssinatura.upsert({
      where: { userId_uf: { userId, uf: ufNorm } },
      update: {},
      create: { userId, uf: ufNorm },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível conceder a assinatura.' };
  }
}

export async function revogarAssinatura(userId: string, uf: string): Promise<Resultado> {
  await requireMaster();
  if (!EH_SUCESSORISTA) return { ok: false, erro: 'Recurso de outro site.' };
  try {
    await prisma.radarAssinatura.deleteMany({ where: { userId, uf: uf.trim().toUpperCase() } });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível revogar.' };
  }
}

/** Varredura do aviso HONESTO de 72h: famílias publicadas há mais de 72h SEM
 *  nenhuma resposta recebem UM e-mail dizendo isso com todas as letras (o
 *  aviso72hEm garante que não se repete). Devolve quantos foram avisados. */
export async function executarVarredura72h(): Promise<{ ok: boolean; avisados?: number; erro?: string }> {
  await requireMaster();
  if (!EH_SUCESSORISTA) return { ok: false, erro: 'Recurso de outro site.' };
  try {
    const limite = new Date(Date.now() - HORAS_AVISO * 3_600_000);
    const pendentes = await prisma.familiaIntake.findMany({
      where: {
        status: 'publicado',
        publicadoEm: { lt: limite },
        aviso72hEm: null,
        email: { not: null },
        emailConfirmadoEm: { not: null },
      },
      take: 50,
    });
    const h = await headers();
    const origin = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? ''}`;
    let avisados = 0;
    for (const intake of pendentes) {
      const respostas = await prisma.radarResposta.count({ where: { intakeId: intake.id } });
      if (respostas > 0) continue; // já tem resposta — nada a avisar
      const enviado = await enviarEmailPortal({
        para: intake.email!,
        assunto: 'Sua solicitação segue publicada — ainda sem respostas',
        titulo: 'Sendo honestos com você',
        paragrafos: [
          `Olá${intake.nome ? `, ${intake.nome.split(/\s+/)[0]}` : ''}. Já se passaram ${HORAS_AVISO} horas e nenhum(a) advogado(a) respondeu à sua solicitação ainda.`,
          'Ela continua publicada (o caso fica visível por 90 dias) e avisaremos assim que chegar uma resposta. Enquanto isso, o seu resultado — estimativas, prazo e lista de documentos — funciona igual com um(a) advogado(a) da sua confiança, de onde você quiser.',
          'Se preferir, você pode retirar a solicitação a qualquer momento pelo link abaixo — isso apaga tudo do nosso servidor.',
        ],
        urlPortal: `${origin}/familias/minha-solicitacao/${intake.tokenGestao}`,
        rotuloBotao: 'Ver minha solicitação',
        rodape: 'Esta plataforma não intermedeia honorários nem indica advogados.',
      });
      if (enviado) {
        await prisma.familiaIntake.update({
          where: { id: intake.id },
          data: { aviso72hEm: new Date() },
        });
        avisados++;
      }
    }
    return { ok: true, avisados };
  } catch {
    return { ok: false, erro: 'Não foi possível executar a varredura.' };
  }
}

export async function decidirDenuncia(
  id: string,
  acao: 'acatar' | 'arquivar',
): Promise<Resultado> {
  await requireMaster();
  if (!EH_SUCESSORISTA) return { ok: false, erro: 'Recurso de outro site.' };
  try {
    const denuncia = await prisma.radarDenuncia.findUnique({ where: { id } });
    if (!denuncia || denuncia.status !== 'pendente') {
      return { ok: false, erro: 'Denúncia não encontrada ou já decidida.' };
    }
    await prisma.radarDenuncia.update({
      where: { id },
      data: { status: acao === 'acatar' ? 'acatada' : 'arquivada', decididoEm: new Date() },
    });
    if (acao === 'acatar') {
      await prisma.advogadoPerfil.updateMany({
        where: { userId: denuncia.advogadoUserId },
        data: { situacao: 'suspenso', motivoRecusa: 'Suspenso após denúncia acatada.' },
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível decidir a denúncia.' };
  }
}
