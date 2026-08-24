'use client';

/**
 * Dialog "Responder" do /admin/feedback — a equipe escreve a resposta que o
 * usuário lê em "Meus Envios" do dialog do shell. Editar substitui a
 * resposta anterior (o relato do usuário nunca é editado).
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
import { Textarea } from '@/components/ui/textarea';

import { responderFeedback } from './actions';

const esquema = z.object({
  resposta: z
    .string()
    .trim()
    .min(1, 'Escreva a resposta.')
    .max(2000, 'A resposta vai até 2000 caracteres.'),
});

export function ResponderFeedback({
  id,
  titulo,
  respostaAtual,
}: {
  id: string;
  titulo: string;
  respostaAtual: string | null;
}) {
  const [aberto, setAberto] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof esquema>>({
    resolver: zodResolver(esquema),
    defaultValues: { resposta: respostaAtual ?? '' },
  });

  return (
    <>
      <Button size="sm" variant={respostaAtual ? 'ghost' : 'outline'} onClick={() => setAberto(true)}>
        {respostaAtual ? 'Editar resposta' : 'Responder'}
      </Button>
      <Dialog open={aberto} onOpenChange={(o) => !isSubmitting && setAberto(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Responder ao relato</DialogTitle>
            <DialogDescription>
              &ldquo;{titulo}&rdquo; — quem enviou lê a resposta na aba Meus Envios do
              dialog de Feedback.
            </DialogDescription>
          </DialogHeader>
          <form
            noValidate
            onSubmit={(e) =>
              void handleSubmit(async (dados) => {
                const r = await responderFeedback({ id, resposta: dados.resposta });
                if (r.ok) {
                  toast.success('Resposta enviada.');
                  setAberto(false);
                } else toast.error(r.erro ?? 'Não foi possível salvar.');
              })(e)
            }
            style={{ display: 'grid', gap: 12 }}
          >
            <Field data-invalid={Boolean(errors.resposta)}>
              <FieldLabel htmlFor={`resp-${id}`}>Resposta da equipe</FieldLabel>
              <Textarea
                id={`resp-${id}`}
                rows={4}
                placeholder="Ex.: Obrigado pelo relato — corrigimos na versão de hoje; recarregue a página."
                aria-invalid={Boolean(errors.resposta)}
                {...register('resposta')}
              />
              <FieldError errors={[errors.resposta]} />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={isSubmitting} onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" loading={isSubmitting}>
                Enviar resposta
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
