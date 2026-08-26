/**
 * TAREFAS DO CASO — a fila operacional do inventário (remodelagem LexCausa,
 * visão da equipe): o advogado (ou qualquer perfil) lança
 * tarefas com responsável e prazo, e quem executa marca feito. Vive no
 * SNAPSHOT do caso (caso.json, campo `tarefas` — retrocompatível): viaja
 * com a pasta/nuvem do processo e sincroniza pela nuvem da equipe, sem
 * tabela nova e sem dado de caso em /admin. Honorários e valores nunca
 * passam por aqui — é lista de providências, não financeiro.
 */

import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/date-input';
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

export interface TarefaCaso {
  id: string;
  texto: string;
  /** Quem entrega — texto livre (sugestões: membros da equipe). */
  responsavel?: string;
  /** ISO yyyy-mm-dd, opcional. */
  prazo?: string;
  criadaEm: string;
  /** ISO — null/ausente = pendente. */
  feitaEm?: string | null;
}

const esquemaNova = z.object({
  texto: z.string().trim().min(1, 'Descreva a tarefa — ex.: "Pedir certidão de óbito atualizada".'),
  responsavel: z.string().trim().max(80).optional(),
  prazo: z.string().optional(),
});

type NovaTarefa = z.infer<typeof esquemaNova>;

const hojeIso = () => new Date().toISOString().slice(0, 10);
const agoraIso = () => new Date().toISOString();

function dataBr(iso: string): string {
  return iso.slice(0, 10).split('-').reverse().join('/');
}

export function TarefasCaso({
  tarefas,
  onChange,
  sugestoes = [],
}: {
  tarefas: TarefaCaso[];
  onChange: (t: TarefaCaso[]) => void;
  /** Nomes sugeridos no campo Responsável (membros da equipe). */
  sugestoes?: string[];
}) {
  const [excluir, setExcluir] = useState<TarefaCaso | null>(null);
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<NovaTarefa>({
    resolver: zodResolver(esquemaNova),
    defaultValues: { texto: '', responsavel: '', prazo: '' },
  });

  const hoje = hojeIso();
  const pendentes = tarefas
    .filter((t) => !t.feitaEm)
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999') || a.criadaEm.localeCompare(b.criadaEm));
  const feitas = tarefas.filter((t) => Boolean(t.feitaEm));

  const alternar = (t: TarefaCaso) => {
    onChange(
      tarefas.map((x) => (x.id === t.id ? { ...x, feitaEm: x.feitaEm ? null : agoraIso() } : x)),
    );
  };

  const adicionar = (dados: NovaTarefa) => {
    onChange([
      ...tarefas,
      {
        id: crypto.randomUUID(),
        texto: dados.texto.trim(),
        responsavel: dados.responsavel?.trim() || undefined,
        prazo: dados.prazo || undefined,
        criadaEm: agoraIso(),
        feitaEm: null,
      },
    ]);
    reset();
  };

  return (
    <div className="cartao tarefas-caso">
      <div className="fases-cabeca">
        <span className="eyebrow">Tarefas do caso</span>
        <span className="fund num">
          {pendentes.length} pendente(s){feitas.length > 0 ? ` · ${feitas.length} feita(s)` : ''}
        </span>
      </div>
      {tarefas.length === 0 && (
        <p className="fund" style={{ margin: '6px 0 0' }}>
          A fila de providências do inventário — lance a primeira abaixo (ex.:
          &ldquo;Pedir matrícula atualizada no 2º RI&rdquo;) e marque o responsável.
          As tarefas viajam com o caso e a equipe vê a mesma lista.
        </p>
      )}
      <ul className="tarefas-lista">
        {[...pendentes, ...feitas].map((t) => {
          const vencida = !t.feitaEm && t.prazo && t.prazo < hoje;
          return (
            <li key={t.id} className={t.feitaEm ? 'feita' : undefined}>
              <label className="marcar" style={{ fontWeight: 400, flex: 1 }}>
                <Checkbox checked={Boolean(t.feitaEm)} onCheckedChange={() => alternar(t)} />
                <span className="tarefa-texto">{t.texto}</span>
              </label>
              {t.responsavel && <span className="tarefa-chip">{t.responsavel}</span>}
              {t.prazo && (
                <span className={`tarefa-prazo num${vencida ? ' vencida' : ''}`}>
                  {vencida ? 'venceu ' : ''}{dataBr(t.prazo)}
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`Excluir a tarefa "${t.texto}"`}
                onClick={() => setExcluir(t)}
              >
                ×
              </Button>
            </li>
          );
        })}
      </ul>

      <form noValidate onSubmit={handleSubmit(adicionar)} className="tarefas-form">
        <Field data-invalid={Boolean(errors.texto) || undefined} style={{ flex: '2 1 240px' }}>
          <FieldLabel htmlFor="tarefa-texto">Nova tarefa</FieldLabel>
          <Input
            id="tarefa-texto"
            placeholder="O que precisa ser feito?"
            aria-invalid={Boolean(errors.texto) || undefined}
            {...register('texto')}
          />
          <FieldError errors={[errors.texto]} />
        </Field>
        <Field style={{ flex: '1 1 150px' }}>
          <FieldLabel htmlFor="tarefa-resp">Responsável</FieldLabel>
          <Input id="tarefa-resp" list="tarefa-sugestoes" placeholder="Quem entrega" {...register('responsavel')} />
          {sugestoes.length > 0 && (
            <datalist id="tarefa-sugestoes">
              {sugestoes.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          )}
        </Field>
        <Field style={{ flex: '0 1 170px' }}>
          <FieldLabel>Prazo</FieldLabel>
          <Controller
            control={control}
            name="prazo"
            render={({ field }) => <DateInput value={field.value ?? ''} onChange={field.onChange} />}
          />
        </Field>
        <Button type="submit" style={{ alignSelf: 'flex-end' }}>
          Adicionar
        </Button>
      </form>

      {/* Excluir é destrutivo — confirmação sempre (convenção do projeto). */}
      <Dialog open={excluir !== null} onOpenChange={(v) => !v && setExcluir(null)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Excluir a tarefa?</DialogTitle>
            <DialogDescription>
              &ldquo;{excluir?.texto}&rdquo; sai da fila do caso — para registrar que
              foi cumprida, prefira marcar a caixinha.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExcluir(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (excluir) onChange(tarefas.filter((x) => x.id !== excluir.id));
                setExcluir(null);
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
