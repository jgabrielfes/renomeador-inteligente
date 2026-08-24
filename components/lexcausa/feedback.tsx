'use client';

/**
 * FEEDBACK do shell — os botões "Reportar" e "Sugestão" da barra abrem o
 * MESMO dialog com três abas (Novo Bug · Nova Sugestão · Meus Envios),
 * inspirado no padrão que o escritório usa em outra ferramenta. A página
 * atual é registrada automaticamente (só o caminho); não há captura de
 * tela — o texto avisa. A severidade é classificada pela equipe.
 */

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { z } from 'zod';

import {
  enviarFeedback,
  meusFeedbacks,
  type MeuFeedback,
} from '@/app/(private)/feedback-actions';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

const esquemaBug = z.object({
  titulo: z.string().trim().min(1, 'Dê um título curto — ex.: "Botão X não responde".').max(120, 'O título vai até 120 caracteres.'),
  descricao: z
    .string()
    .trim()
    .min(1, 'Descreva o que aconteceu, o que esperava e os passos para reproduzir.')
    .max(4000, 'A descrição vai até 4000 caracteres.'),
});

const esquemaSugestao = z.object({
  titulo: z.string().trim().min(1, 'Dê um título curto — ex.: "Adicionar modo escuro".').max(120, 'O título vai até 120 caracteres.'),
  categoria: z.enum(['funcionalidade', 'usabilidade', 'outro']),
  descricao: z
    .string()
    .trim()
    .min(1, 'Explique sua sugestão e por que ela seria útil.')
    .max(4000, 'A descrição vai até 4000 caracteres.'),
});

const ROTULO_STATUS: Record<string, string> = {
  aberto: 'aberto',
  em_analise: 'em análise',
  resolvido: 'resolvido',
};

function FormBug({ onEnviado }: { onEnviado: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof esquemaBug>>({ resolver: zodResolver(esquemaBug) });
  return (
    <form
      noValidate
      onSubmit={(e) =>
        void handleSubmit(async (dados) => {
          const r = await enviarFeedback({
            tipo: 'bug',
            titulo: dados.titulo,
            descricao: dados.descricao,
            pagina: window.location.pathname,
          });
          if (r.ok) {
            toast.success('Bug reportado — obrigado! A equipe classifica a severidade.');
            reset();
            onEnviado();
          } else toast.error(r.erro ?? 'Não foi possível enviar.');
        })(e)
      }
      style={{ display: 'grid', gap: 12 }}
    >
      <Field data-invalid={Boolean(errors.titulo)}>
        <FieldLabel htmlFor="bug-titulo">Título</FieldLabel>
        <Input id="bug-titulo" placeholder="Ex.: Botão X não responde" aria-invalid={Boolean(errors.titulo)} {...register('titulo')} />
        <FieldError errors={[errors.titulo]} />
      </Field>
      <Field data-invalid={Boolean(errors.descricao)}>
        <FieldLabel htmlFor="bug-descricao">Descrição</FieldLabel>
        <Textarea
          id="bug-descricao"
          rows={5}
          placeholder="Descreva o que aconteceu, o que esperava e os passos para reproduzir…"
          aria-invalid={Boolean(errors.descricao)}
          {...register('descricao')}
        />
        <FieldError errors={[errors.descricao]} />
      </Field>
      <p className="lc-fund" style={{ margin: 0 }}>
        O report vai sem captura de tela. A página atual é registrada
        automaticamente; a severidade será classificada pela equipe.
      </p>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="submit" loading={isSubmitting}>
          Enviar bug
        </Button>
      </div>
    </form>
  );
}

function FormSugestao({ onEnviado }: { onEnviado: () => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof esquemaSugestao>>({
    resolver: zodResolver(esquemaSugestao),
    defaultValues: { categoria: 'funcionalidade' },
  });
  const categoria = watch('categoria');
  return (
    <form
      noValidate
      onSubmit={(e) =>
        void handleSubmit(async (dados) => {
          const r = await enviarFeedback({
            tipo: 'sugestao',
            categoria: dados.categoria,
            titulo: dados.titulo,
            descricao: dados.descricao,
            pagina: window.location.pathname,
          });
          if (r.ok) {
            toast.success('Sugestão enviada — obrigado!');
            reset();
            onEnviado();
          } else toast.error(r.erro ?? 'Não foi possível enviar.');
        })(e)
      }
      style={{ display: 'grid', gap: 12 }}
    >
      <Field data-invalid={Boolean(errors.titulo)}>
        <FieldLabel htmlFor="sug-titulo">Título</FieldLabel>
        <Input id="sug-titulo" placeholder="Ex.: Adicionar modo escuro" aria-invalid={Boolean(errors.titulo)} {...register('titulo')} />
        <FieldError errors={[errors.titulo]} />
      </Field>
      <Field>
        <FieldLabel htmlFor="sug-categoria">Categoria</FieldLabel>
        <Select
          value={categoria}
          onValueChange={(v) =>
            setValue('categoria', v as 'funcionalidade' | 'usabilidade' | 'outro')
          }
        >
          <SelectTrigger id="sug-categoria" aria-label="Categoria da sugestão">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="funcionalidade">Funcionalidade</SelectItem>
            <SelectItem value="usabilidade">Usabilidade</SelectItem>
            <SelectItem value="outro">Outro</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field data-invalid={Boolean(errors.descricao)}>
        <FieldLabel htmlFor="sug-descricao">Descrição</FieldLabel>
        <Textarea
          id="sug-descricao"
          rows={5}
          placeholder="Explique sua sugestão e por que ela seria útil…"
          aria-invalid={Boolean(errors.descricao)}
          {...register('descricao')}
        />
        <FieldError errors={[errors.descricao]} />
      </Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <Button type="submit" loading={isSubmitting}>
          Enviar sugestão
        </Button>
      </div>
    </form>
  );
}

function MeusEnvios({ recarregar }: { recarregar: number }) {
  const [itens, setItens] = useState<MeuFeedback[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      void meusFeedbacks()
        .then(setItens)
        .catch(() => setItens([]));
    }, 0);
    return () => clearTimeout(t);
  }, [recarregar]);
  if (itens === null) return <p className="lc-fund">Carregando…</p>;
  if (itens.length === 0) {
    return <p className="lc-fund">Você ainda não enviou bugs nem sugestões.</p>;
  }
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
      {itens.map((f) => (
        <li key={f.id} style={{ display: 'grid', gap: 2 }}>
          <span>
            {f.tipo === 'bug' ? '🐞' : '💡'} <strong>{f.titulo}</strong>
          </span>
          <span className="lc-fund">
            {new Date(f.criadoEm).toLocaleDateString('pt-BR')} · situação:{' '}
            {ROTULO_STATUS[f.status] ?? f.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FeedbackDialog({
  aberto,
  abaInicial,
  onFechar,
}: {
  aberto: boolean;
  abaInicial: 'bug' | 'sugestao';
  onFechar: () => void;
}) {
  // A aba inicial acompanha o botão que abriu o dialog (Reportar ×
  // Sugestão): o CALLER remonta este componente com uma `key` nova a cada
  // abertura — nada de sincronizar estado em efeito.
  const [aba, setAba] = useState<string>(abaInicial);
  const [versaoEnvios, setVersaoEnvios] = useState(0);

  const enviado = () => {
    setVersaoEnvios((v) => v + 1);
    setAba('envios');
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && onFechar()}>
      <DialogContent className="lexcausa" style={{ background: 'var(--lc-alto)' }}>
        <DialogHeader>
          <DialogTitle>Feedback</DialogTitle>
          <DialogDescription>
            Reporte bugs ou sugira melhorias sem sair da tela atual.
          </DialogDescription>
        </DialogHeader>
        <Tabs value={aba} onValueChange={setAba}>
          <TabsList aria-label="Tipo de feedback">
            <TabsTrigger value="bug">🐞 Novo Bug</TabsTrigger>
            <TabsTrigger value="sugestao">💡 Nova Sugestão</TabsTrigger>
            <TabsTrigger value="envios">Meus Envios</TabsTrigger>
          </TabsList>
          <TabsContent value="bug">
            <FormBug onEnviado={enviado} />
          </TabsContent>
          <TabsContent value="sugestao">
            <FormSugestao onEnviado={enviado} />
          </TabsContent>
          <TabsContent value="envios">
            <MeusEnvios recarregar={versaoEnvios} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
