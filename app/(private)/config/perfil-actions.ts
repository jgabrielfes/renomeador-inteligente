'use server';

/**
 * PERFIL do usuário (/config) — foto, bio, endereço do escritório e contatos
 * de trabalho, mais a troca de senha. Server actions com validação COMPLETA
 * no servidor (server action é endpoint público): a sessão é obrigatória e
 * cada action só grava a linha do próprio usuário.
 */

import { compare, hash } from 'bcryptjs';
import { z } from 'zod';

import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Foto: data URL de imagem, REDIMENSIONADA no navegador (o form limita a
// ~192px) — o teto de caracteres barra upload de arquivo bruto por engano.
const esquemaPerfil = z.object({
  fotoPerfil: z
    .string()
    .max(400_000, 'A foto ficou grande demais — tente outra imagem.')
    .refine((v) => v === '' || v.startsWith('data:image/'), 'Formato de foto inválido.')
    .optional(),
  bio: z.string().max(600, 'A apresentação vai até 600 caracteres.').optional(),
  enderecoEscritorio: z.string().max(200, 'O endereço vai até 200 caracteres.').optional(),
  telefoneContato: z.string().max(40, 'O telefone vai até 40 caracteres.').optional(),
  emailContato: z
    .string()
    .max(120, 'O e-mail vai até 120 caracteres.')
    .refine((v) => v === '' || /.+@.+\..+/.test(v), 'Informe um e-mail válido.')
    .optional(),
});

export async function salvarPerfilUsuario(
  entrada: z.infer<typeof esquemaPerfil>,
): Promise<{ ok: boolean; erro?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, erro: 'Sessão expirada — entre de novo.' };
  const parsed = esquemaPerfil.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  const d = parsed.data;
  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        // Gravação PARCIAL (convenção das lições): campo ausente não toca a
        // coluna; string vazia LIMPA (o "remover foto" manda '').
        ...(d.fotoPerfil !== undefined ? { fotoPerfil: d.fotoPerfil || null } : {}),
        ...(d.bio !== undefined ? { bio: d.bio.trim() || null } : {}),
        ...(d.enderecoEscritorio !== undefined
          ? { enderecoEscritorio: d.enderecoEscritorio.trim() || null }
          : {}),
        ...(d.telefoneContato !== undefined
          ? { telefoneContato: d.telefoneContato.trim() || null }
          : {}),
        ...(d.emailContato !== undefined ? { emailContato: d.emailContato.trim() || null } : {}),
      },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível salvar agora — tente de novo.' };
  }
}

const esquemaSenha = z.object({
  senhaAtual: z.string().min(1, 'Informe a senha atual.'),
  novaSenha: z.string().min(8, 'A nova senha precisa de pelo menos 8 caracteres.'),
});

export async function alterarSenha(
  entrada: z.infer<typeof esquemaSenha>,
): Promise<{ ok: boolean; erro?: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, erro: 'Sessão expirada — entre de novo.' };
  const parsed = esquemaSenha.safeParse(entrada);
  if (!parsed.success) {
    return { ok: false, erro: parsed.error.issues[0]?.message ?? 'Dados inválidos.' };
  }
  try {
    const usuario = await prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!usuario?.passwordHash) {
      return {
        ok: false,
        erro: 'Esta conta entra pelo Google e não tem senha própria.',
      };
    }
    const confere = await compare(parsed.data.senhaAtual, usuario.passwordHash);
    if (!confere) return { ok: false, erro: 'A senha atual não confere.' };
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(parsed.data.novaSenha, 12) },
    });
    return { ok: true };
  } catch {
    return { ok: false, erro: 'Não foi possível alterar agora — tente de novo.' };
  }
}
