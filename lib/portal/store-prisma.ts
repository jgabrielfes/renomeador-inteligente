/**
 * Portal do herdeiro — armazenamento PERSISTENTE (Postgres via Prisma).
 *
 * Substitui o memoryStore nas rotas de API: o convite vive na tabela
 * `portal_convites` (o memoryStore zerava a cada cold start de função
 * serverless — o link "expirava" e os envios sumiam). O convite NÃO expira:
 * o token é a credencial e dura o quanto o caso durar.
 *
 * SÓ O SERVIDOR importa este módulo (rotas de API) — o cliente importa
 * apenas os TIPOS de `./store`. Falha de banco (ou migração
 * `portal_convites_persistentes` pendente) degrada para o memoryStore, sem
 * quebrar o portal — melhor-esforço, como o perfil por conta.
 */

import { prisma } from '@/lib/prisma';
import {
  memoryStore,
  type ConviteHerdeiro,
  type PortalStore,
  type QualificacaoHerdeiro,
} from './store';

async function lerDoBanco(token: string): Promise<ConviteHerdeiro | null> {
  const linha = await prisma.portalConvite.findUnique({ where: { token } });
  return linha ? (linha.dados as unknown as ConviteHerdeiro) : null;
}

async function gravarNoBanco(convite: ConviteHerdeiro): Promise<void> {
  const dados = JSON.parse(JSON.stringify(convite)) as object;
  await prisma.portalConvite.upsert({
    where: { token: convite.token },
    create: { token: convite.token, casoId: convite.casoId, dados },
    update: { dados },
  });
}

export const store: PortalStore = {
  async criar(convite) {
    try {
      await gravarNoBanco(convite);
    } catch {
      await memoryStore.criar(convite);
    }
  },

  async obter(token) {
    try {
      const c = await lerDoBanco(token);
      if (c) return c;
    } catch {
      // banco fora — tenta a memória
    }
    return memoryStore.obter(token);
  },

  async atualizarDocumento(token, docId, patch) {
    try {
      const c = await lerDoBanco(token);
      if (c) {
        const doc = c.documentos.find((d) => d.id === docId);
        if (!doc) return null;
        Object.assign(doc, patch);
        await gravarNoBanco(c);
        return c;
      }
    } catch {
      // banco fora — tenta a memória
    }
    return memoryStore.atualizarDocumento(token, docId, patch);
  },

  async salvarQualificacao(token, qualificacao: QualificacaoHerdeiro) {
    try {
      const c = await lerDoBanco(token);
      if (c) {
        c.qualificacao = { ...c.qualificacao, ...qualificacao };
        c.qualificacaoEnviadaEm = new Date().toISOString();
        await gravarNoBanco(c);
        return c;
      }
    } catch {
      // banco fora — tenta a memória
    }
    return memoryStore.salvarQualificacao(token, qualificacao);
  },

  async confirmarEnvio(token) {
    try {
      const c = await lerDoBanco(token);
      if (c) {
        c.envioConfirmadoEm = new Date().toISOString();
        await gravarNoBanco(c);
        return c;
      }
    } catch {
      // banco fora — tenta a memória
    }
    return memoryStore.confirmarEnvio(token);
  },

  async marcarAcesso(token, primeiro, ultimo) {
    try {
      const c = await lerDoBanco(token);
      if (c) {
        c.primeiroAcessoEm = c.primeiroAcessoEm ?? primeiro;
        c.ultimoAcessoEm = ultimo;
        await gravarNoBanco(c);
        return;
      }
    } catch {
      // banco fora — tenta a memória
    }
    await memoryStore.marcarAcesso(token, primeiro, ultimo);
  },

  async adicionarPedido(token, pedido) {
    try {
      const c = await lerDoBanco(token);
      if (c) {
        if (!c.documentos.some((d) => d.id === pedido.id)) {
          c.documentos.push({ ...pedido, status: 'PENDENTE' });
          await gravarNoBanco(c);
        }
        return c;
      }
    } catch {
      // banco fora — tenta a memória
    }
    return memoryStore.adicionarPedido(token, pedido);
  },

  async salvarPreferencias(token, prefs) {
    try {
      const c = await lerDoBanco(token);
      if (c) {
        if (prefs.emailNotificacao !== undefined) c.emailNotificacao = prefs.emailNotificacao;
        if (prefs.notificacoes !== undefined) c.notificacoes = prefs.notificacoes;
        await gravarNoBanco(c);
        return c;
      }
    } catch {
      // banco fora — tenta a memória
    }
    return memoryStore.salvarPreferencias(token, prefs);
  },
};
