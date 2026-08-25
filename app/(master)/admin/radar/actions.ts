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
import { notificarAssinaturaRadar, notificarDecisaoOab } from '@/lib/radar/notificar';
import { varrerAviso72h } from '@/lib/radar/varredura';

type Resultado = { ok: boolean; erro?: string };

/** Origem da requisição (para montar os links dos e-mails). */
async function origemAtual(): Promise<string> {
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host') ?? ''}`;
}

/** E-mail da conta (melhor-esforço — nunca derruba a decisão do admin). */
async function emailDoUsuario(userId: string): Promise<string | null> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
    return u?.email ?? null;
  } catch {
    return null;
  }
}

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
    // A verificação da OAB é MANUAL: sem este aviso quem se cadastrou fica no
    // escuro esperando. Reativar não avisa (volta ao estado normal).
    if (acao !== 'reativar') {
      void notificarDecisaoOab({
        email: await emailDoUsuario(userId),
        origin: await origemAtual(),
        situacao: dados.situacao,
        motivo: dados.motivoRecusa,
      });
    }
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
    // A assinatura é concedida à mão — avisar é o que faz a pessoa voltar.
    void notificarAssinaturaRadar({
      email: await emailDoUsuario(userId),
      origin: await origemAtual(),
      uf: ufNorm,
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

/** Varredura MANUAL do aviso de 72h (botão do /admin) — o motor é o mesmo
 *  da rota do cron (`lib/radar/varredura.ts`), que roda sozinha todo dia. */
export async function executarVarredura72h(): Promise<{ ok: boolean; avisados?: number; erro?: string }> {
  await requireMaster();
  if (!EH_SUCESSORISTA) return { ok: false, erro: 'Recurso de outro site.' };
  return varrerAviso72h(await origemAtual());
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
      // Suspensão é decisão grave: a pessoa precisa saber (o MOTIVO da
      // denúncia em si não circula — só a suspensão e o caminho de revisão).
      void notificarDecisaoOab({
        email: await emailDoUsuario(denuncia.advogadoUserId),
        origin: await origemAtual(),
        situacao: 'suspenso',
        motivo: 'Suspenso após denúncia acatada pela equipe.',
      });
    }
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível decidir a denúncia.' };
  }
}

/**
 * MODERAÇÃO DO MURAL — retirar uma publicação (dado particular no texto,
 * conteúdo impróprio). A retirada NÃO apaga o resultado da família (isso é o
 * "retirar" dela, que apaga tudo): o caso sai do mural, a republicação fica
 * BLOQUEADA (status `despublicado` — a rota do Radar recusa; o caminho limpo
 * é refazer o questionário sem o dado) e a família recebe o e-mail com o
 * motivo — por isso o e-mail é obrigatório na publicação: é o canal desta
 * conversa. Conversa 1:1 aberta é encerrada junto (o caso não está mais no
 * ar); o histórico permanece no banco.
 */
export async function retirarPublicacaoRadar(
  intakeId: string,
  motivo: string,
): Promise<Resultado & { emailEnviado?: boolean }> {
  await requireMaster();
  if (!EH_SUCESSORISTA) return { ok: false, erro: 'Só no site do Sucessorista.' };
  const texto = String(motivo ?? '').trim().slice(0, 600);
  if (texto.length < 5) {
    return { ok: false, erro: 'Explique o motivo — a família vai ler exatamente este texto.' };
  }
  try {
    const intake = await prisma.familiaIntake.findUnique({ where: { id: intakeId } });
    if (!intake || !['publicado', 'em_conversa'].includes(intake.status)) {
      return { ok: false, erro: 'Publicação não encontrada (já retirada ou contratada).' };
    }
    await prisma.familiaIntake.update({
      where: { id: intakeId },
      data: {
        status: 'despublicado',
        publicadoEm: null,
        conversaAdvogadoUserId: null,
        conversaAbertaEm: null,
      },
    });

    // O aviso à família — melhor-esforço: falha de e-mail NÃO desfaz a
    // retirada (o dado particular sai do ar de qualquer jeito), mas o admin
    // fica sabendo que precisa avisar por outro canal.
    let emailEnviado = false;
    if (intake.email) {
      const origem = await origemAtual();
      emailEnviado = await enviarEmailPortal({
        para: intake.email,
        assunto: 'Sua publicação no Radar Sucessório foi retirada',
        titulo: 'Retiramos a sua solicitação do mural',
        paragrafos: [
          'A equipe da plataforma retirou a sua solicitação de análise do mural de advogados. O motivo:',
          `“${texto}”`,
          'Isso protege você: o mural é visto por advogados de todo o estado, e informações pessoais (nomes, endereços, telefones) não devem circular nele.',
          'Seu resultado continua disponível no seu link de sempre. Se quiser voltar ao mural, refaça o questionário — leva uns 5 minutos — sem incluir dados que identifiquem pessoas, e publique novamente.',
        ],
        urlPortal: `${origem}/familias`,
        rotuloBotao: 'Refazer o questionário',
        rodape:
          'Aviso automático do Radar Sucessório — não responda a este e-mail. Esta plataforma não intermedeia honorários nem indica advogados.',
      });
    }
    return { ok: true, emailEnviado };
  } catch {
    return { ok: false, erro: 'Não foi possível retirar — tente de novo.' };
  }
}
