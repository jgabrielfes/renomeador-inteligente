'use client';

/**
 * QUALIFICAÇÃO DE PRIMEIRO ACESSO — o dialog que recebe a conta nova, no
 * Sucessorista (/s) E no Radar (/radar).
 *
 * Etapas:
 *   1. perfil     — Advogado(a) × Não advogado(a) (escolha ÚNICA da conta,
 *                   como sempre foi: trocar depois é ato de administração em
 *                   /admin/usuarios);
 *   2a. advogado  — nome completo + inscrição na OAB (entra na MESMA fila de
 *                   verificação manual do /admin/radar) → quiz deontológico;
 *   2b. não advogado — nome completo.
 *
 * A escolha do PERFIL é obrigatória (o dialog não fecha por fora antes dela).
 * A identificação e o quiz têm a saída discreta "concluir depois": travar a
 * ferramenta inteira atrás de 10 perguntas seria hostil — mas o caminho
 * completo é apresentado JÁ no primeiro acesso, e quem pular termina em
 * /radar (advogado) ou /config, onde tudo continua disponível.
 *
 * Formulários de ENTRADA seguem a convenção: react-hook-form + zod,
 * noValidate, Field/FieldError. As actions validam tudo de novo no servidor.
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { QuizDeontologico } from '@/components/quiz-deontologico';
import { UFS } from '@/lib/familias/tipos';
import {
  responderQuizConta,
  salvarIdentificacaoAdvogado,
  salvarIdentificacaoNaoAdvogado,
} from '@/app/(private)/sucessorista/perfil-actions';

type Perfil = 'ADVOGADO' | 'NAO_ADVOGADO';
type Etapa = 'perfil' | 'advogado' | 'quiz' | 'nao-advogado';

const esquemaAdvogado = z.object({
  nomeCompleto: z.string().trim().min(5, 'Informe o seu nome completo.'),
  oab: z.string().trim().min(2, 'Informe o número de inscrição.').max(20, 'Número longo demais.'),
  uf: z.string().min(2, 'Escolha a seccional (UF).'),
});

const esquemaNaoAdvogado = z.object({
  nomeCompleto: z.string().trim().min(5, 'Informe o seu nome completo.'),
});

export function QualificacaoConta({
  aberta,
  nomeInicial = '',
  aoEscolherPerfil,
  aoConcluir,
}: {
  aberta: boolean;
  /** Nome atual da conta (users.name) — pré-preenche a identificação. */
  nomeInicial?: string;
  /**
   * Grava o PERFIL na conta (a action travada de sempre) — chamado na etapa
   * 1, antes da identificação: a escolha única não depende do resto.
   */
  aoEscolherPerfil: (p: Perfil) => void | Promise<void>;
  /** Fecha o dialog (identificação concluída ou adiada). */
  aoConcluir: () => void;
}) {
  const [etapa, setEtapa] = useState<Etapa>('perfil');

  const formAdv = useForm<z.infer<typeof esquemaAdvogado>>({
    resolver: zodResolver(esquemaAdvogado),
    defaultValues: { nomeCompleto: nomeInicial, oab: '', uf: '' },
  });
  const formEsc = useForm<z.infer<typeof esquemaNaoAdvogado>>({
    resolver: zodResolver(esquemaNaoAdvogado),
    defaultValues: { nomeCompleto: nomeInicial },
  });

  const escolher = async (p: Perfil) => {
    // O perfil grava JÁ — se a pessoa fechar no meio da identificação, a
    // escolha única está feita e o dialog não volta no próximo acesso.
    await aoEscolherPerfil(p);
    setEtapa(p === 'ADVOGADO' ? 'advogado' : 'nao-advogado');
  };

  return (
    <Dialog open={aberta} onOpenChange={() => undefined}>
      <DialogContent className="sucessorista flex max-h-[85vh] flex-col">
        {etapa === 'perfil' && (
          <>
            <DialogHeader>
              <DialogTitle>Como você usa O Sucessorista?</DialogTitle>
              <DialogDescription>
                Primeiro acesso: escolha o perfil da sua conta. A escolha fica VINCULADA
                ao seu login — os DOIS perfis trabalham o caso, a escritura e as
                Diligências; honorários, minutas de advogado e o Radar Sucessório são
                exclusivos de Advogado(a). Para trocar depois, fale com a administração.
              </DialogDescription>
            </DialogHeader>
            <div className="escolha" style={{ marginTop: 8, gap: 10 }}>
              <Button onClick={() => void escolher('ADVOGADO')}>Advogado(a)</Button>
              <Button variant="outline" onClick={() => void escolher('NAO_ADVOGADO')}>
                Não advogado(a)
              </Button>
            </div>
          </>
        )}

        {etapa === 'advogado' && (
          <>
            <DialogHeader>
              <DialogTitle>Identifique-se: seus dados de advogado(a)</DialogTitle>
              <DialogDescription>
                Nome e inscrição acompanham suas candidaturas no Radar Sucessório — a
                identificação do profissional é dever ético (Provimento 205/2021);
                anonimato é só da família. A verificação da inscrição é MANUAL, feita
                pela administração.
              </DialogDescription>
            </DialogHeader>
            <form
              noValidate
              onSubmit={formAdv.handleSubmit(async (v) => {
                const r = await salvarIdentificacaoAdvogado({
                  nomeCompleto: v.nomeCompleto,
                  oab: v.oab,
                  uf: v.uf,
                });
                if (!r.ok) {
                  toast.error('Não foi possível salvar a identificação', {
                    description:
                      r.motivo === 'banco'
                        ? 'Banco indisponível — você pode concluir depois em /radar.'
                        : 'Confira os dados e tente de novo.',
                  });
                  return;
                }
                toast.success('Inscrição enviada para verificação.');
                setEtapa('quiz');
              })}
              className="flex flex-col gap-3"
            >
              <Field data-invalid={formAdv.formState.errors.nomeCompleto ? true : undefined}>
                <FieldLabel>Nome completo</FieldLabel>
                <Input
                  aria-invalid={!!formAdv.formState.errors.nomeCompleto}
                  {...formAdv.register('nomeCompleto')}
                />
                <FieldError errors={[formAdv.formState.errors.nomeCompleto]} />
              </Field>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Field
                  data-invalid={formAdv.formState.errors.oab ? true : undefined}
                  style={{ flex: '1 1 180px' }}
                >
                  <FieldLabel>Inscrição na OAB</FieldLabel>
                  <Input
                    placeholder="ex.: 123.456"
                    aria-invalid={!!formAdv.formState.errors.oab}
                    {...formAdv.register('oab')}
                  />
                  <FieldError errors={[formAdv.formState.errors.oab]} />
                </Field>
                <Field
                  data-invalid={formAdv.formState.errors.uf ? true : undefined}
                  style={{ maxWidth: 120 }}
                >
                  <FieldLabel>Seccional</FieldLabel>
                  <select {...formAdv.register('uf')}>
                    <option value="">UF…</option>
                    {UFS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                  <FieldError errors={[formAdv.formState.errors.uf]} />
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="submit" loading={formAdv.formState.isSubmitting}>
                  Continuar para o questionário
                </Button>
                <Button type="button" variant="ghost" onClick={aoConcluir}>
                  Concluir depois (em /radar)
                </Button>
              </div>
            </form>
          </>
        )}

        {etapa === 'quiz' && (
          <>
            <DialogHeader>
              <DialogTitle>Questionário deontológico</DialogTitle>
              <DialogDescription>
                Última etapa da sua qualificação: 10 perguntas sobre as regras do Radar.
                Aprovado(a) aqui, falta só a verificação manual da OAB e a assinatura da
                sua UF para responder famílias.
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="min-h-0 flex-1">
              <QuizDeontologico responder={responderQuizConta} aoAprovar={aoConcluir} />
            </ScrollArea>
            <div>
              <Button type="button" variant="ghost" onClick={aoConcluir}>
                Fazer depois (em /radar)
              </Button>
            </div>
          </>
        )}

        {etapa === 'nao-advogado' && (
          <>
            <DialogHeader>
              <DialogTitle>Identifique-se</DialogTitle>
              <DialogDescription>
                Seu nome completo identifica a sua conta na equipe e nos documentos que
                você gerar.
              </DialogDescription>
            </DialogHeader>
            <form
              noValidate
              onSubmit={formEsc.handleSubmit(async (v) => {
                const r = await salvarIdentificacaoNaoAdvogado({
                  nomeCompleto: v.nomeCompleto,
                });
                if (!r.ok) {
                  toast.error('Não foi possível salvar a identificação', {
                    description:
                      r.motivo === 'banco'
                        ? 'Banco indisponível — você pode concluir depois em /config.'
                        : 'Confira os dados e tente de novo.',
                  });
                  return;
                }
                toast.success('Identificação salva.');
                aoConcluir();
              })}
              className="flex flex-col gap-3"
            >
              <Field data-invalid={formEsc.formState.errors.nomeCompleto ? true : undefined}>
                <FieldLabel>Nome completo</FieldLabel>
                <Input
                  aria-invalid={!!formEsc.formState.errors.nomeCompleto}
                  {...formEsc.register('nomeCompleto')}
                />
                <FieldError errors={[formEsc.formState.errors.nomeCompleto]} />
              </Field>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <Button type="submit" loading={formEsc.formState.isSubmitting}>
                  Concluir
                </Button>
                <Button type="button" variant="ghost" onClick={aoConcluir}>
                  Preencher depois (em /config)
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
