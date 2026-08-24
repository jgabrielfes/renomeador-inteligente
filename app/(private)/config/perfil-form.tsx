'use client';

/**
 * Formulário do PERFIL do usuário (/config): foto (redimensionada NO
 * NAVEGADOR para ~192px antes de subir — nunca o arquivo bruto), bio,
 * endereço do escritório e contatos, mais o dialog "Alterar senha".
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

import { alterarSenha, salvarPerfilUsuario } from './perfil-actions';

/** Lê e REDIMENSIONA a imagem no navegador (lado maior = 192px, JPEG). */
async function fotoParaDataUrl(arquivo: File): Promise<string> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Não consegui ler a imagem.'));
      i.src = url;
    });
    const maior = Math.max(img.width, img.height) || 1;
    const escala = Math.min(1, 192 / maior);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Navegador sem suporte a canvas.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const esquemaPerfil = z.object({
  bio: z.string().max(600, 'A apresentação vai até 600 caracteres.'),
  enderecoEscritorio: z.string().max(200, 'O endereço vai até 200 caracteres.'),
  telefoneContato: z.string().max(40, 'O telefone vai até 40 caracteres.'),
  emailContato: z
    .string()
    .trim()
    .max(120, 'O e-mail vai até 120 caracteres.')
    .refine((v) => v === '' || /.+@.+\..+/.test(v), 'Informe um e-mail válido.'),
});

export function PerfilUsuarioForm({
  inicial,
}: {
  inicial: {
    fotoPerfil: string | null;
    bio: string | null;
    enderecoEscritorio: string | null;
    telefoneContato: string | null;
    emailContato: string | null;
  };
}) {
  const [foto, setFoto] = useState<string>(inicial.fotoPerfil ?? '');
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof esquemaPerfil>>({
    resolver: zodResolver(esquemaPerfil),
    defaultValues: {
      bio: inicial.bio ?? '',
      enderecoEscritorio: inicial.enderecoEscritorio ?? '',
      telefoneContato: inicial.telefoneContato ?? '',
      emailContato: inicial.emailContato ?? '',
    },
  });

  const enviar = handleSubmit(async (dados) => {
    const r = await salvarPerfilUsuario({ ...dados, fotoPerfil: foto });
    if (r.ok) toast.success('Perfil salvo.');
    else toast.error(r.erro ?? 'Não foi possível salvar.');
  });

  return (
    <form noValidate onSubmit={(e) => void enviar(e)} style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {foto ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL local, sem otimização a fazer
          <img
            src={foto}
            alt="Sua foto de perfil"
            width={56}
            height={56}
            style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
          />
        ) : (
          <span
            aria-hidden
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--muted)',
              color: 'var(--muted-foreground)',
              fontSize: 'var(--t-lg)',
            }}
          >
            🙂
          </span>
        )}
        <label className="lc-fund" style={{ display: 'grid', gap: 4 }}>
          Foto do perfil (reduzida neste navegador antes de salvar)
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              void fotoParaDataUrl(f)
                .then(setFoto)
                .catch(() => toast.error('Não consegui ler essa imagem.'));
            }}
          />
        </label>
        {foto && (
          <Button type="button" size="sm" variant="outline" onClick={() => setFoto('')}>
            Remover foto
          </Button>
        )}
      </div>

      <Field data-invalid={Boolean(errors.bio)}>
        <FieldLabel htmlFor="perfil-bio">Apresentação (bio)</FieldLabel>
        <Textarea
          id="perfil-bio"
          rows={3}
          placeholder="Ex.: Advogada em Guarulhos-SP, com atuação em sucessões e família."
          aria-invalid={Boolean(errors.bio)}
          {...register('bio')}
        />
        <FieldError errors={[errors.bio]} />
      </Field>

      <Field data-invalid={Boolean(errors.enderecoEscritorio)}>
        <FieldLabel htmlFor="perfil-endereco">Endereço do escritório</FieldLabel>
        <Input
          id="perfil-endereco"
          placeholder="Rua, número, bairro, cidade-UF"
          aria-invalid={Boolean(errors.enderecoEscritorio)}
          {...register('enderecoEscritorio')}
        />
        <FieldError errors={[errors.enderecoEscritorio]} />
      </Field>

      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Field data-invalid={Boolean(errors.telefoneContato)}>
          <FieldLabel htmlFor="perfil-fone">Telefone para contato</FieldLabel>
          <Input
            id="perfil-fone"
            placeholder="(11) 90000-0000"
            aria-invalid={Boolean(errors.telefoneContato)}
            {...register('telefoneContato')}
          />
          <FieldError errors={[errors.telefoneContato]} />
        </Field>
        <Field data-invalid={Boolean(errors.emailContato)}>
          <FieldLabel htmlFor="perfil-email">E-mail para contato</FieldLabel>
          <Input
            id="perfil-email"
            placeholder="contato@escritorio.adv.br"
            aria-invalid={Boolean(errors.emailContato)}
            {...register('emailContato')}
          />
          <FieldError errors={[errors.emailContato]} />
        </Field>
      </div>

      <div>
        <Button type="submit" size="sm" loading={isSubmitting}>
          Salvar perfil
        </Button>
      </div>
    </form>
  );
}

const esquemaSenha = z
  .object({
    senhaAtual: z.string().min(1, 'Informe a senha atual.'),
    novaSenha: z.string().min(8, 'A nova senha precisa de pelo menos 8 caracteres.'),
    confirmar: z.string().min(1, 'Repita a nova senha.'),
  })
  .refine((d) => d.novaSenha === d.confirmar, {
    path: ['confirmar'],
    message: 'As senhas não coincidem.',
  });

export function AlterarSenha({ temSenha }: { temSenha: boolean }) {
  const [aberto, setAberto] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof esquemaSenha>>({ resolver: zodResolver(esquemaSenha) });

  if (!temSenha) {
    return (
      <p className="lc-fund" style={{ margin: 0 }}>
        Esta conta entra pelo Google — a senha é gerenciada na sua conta Google.
      </p>
    );
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        Alterar senha
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !isSubmitting && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Alterar a senha de acesso</DialogTitle>
            <DialogDescription>
              A troca vale imediatamente para os próximos logins nesta plataforma.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(e) =>
              void handleSubmit(async (dados) => {
                const r = await alterarSenha({
                  senhaAtual: dados.senhaAtual,
                  novaSenha: dados.novaSenha,
                });
                if (r.ok) {
                  toast.success('Senha alterada.');
                  reset();
                  setAberto(false);
                } else toast.error(r.erro ?? 'Não foi possível alterar.');
              })(e)
            }
            style={{ display: 'grid', gap: 12 }}
          >
            <Field data-invalid={Boolean(errors.senhaAtual)}>
              <FieldLabel htmlFor="senha-atual">Senha atual</FieldLabel>
              <Input id="senha-atual" type="password" aria-invalid={Boolean(errors.senhaAtual)} {...register('senhaAtual')} />
              <FieldError errors={[errors.senhaAtual]} />
            </Field>
            <Field data-invalid={Boolean(errors.novaSenha)}>
              <FieldLabel htmlFor="senha-nova">Nova senha</FieldLabel>
              <Input id="senha-nova" type="password" aria-invalid={Boolean(errors.novaSenha)} {...register('novaSenha')} />
              <FieldError errors={[errors.novaSenha]} />
            </Field>
            <Field data-invalid={Boolean(errors.confirmar)}>
              <FieldLabel htmlFor="senha-confirma">Repita a nova senha</FieldLabel>
              <Input id="senha-confirma" type="password" aria-invalid={Boolean(errors.confirmar)} {...register('confirmar')} />
              <FieldError errors={[errors.confirmar]} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Alterar senha
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
