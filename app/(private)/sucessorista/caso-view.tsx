/**
 * Etapa 0 — O caso.
 *
 * Porta de entrada da folha: solte a pasta do inventário e o cofre LÊ os
 * documentos de verdade (certidão de óbito, casamento, RG/CPF, matrículas…)
 * pela rota interna /api/sucessorista — o Gemini devolve a folha preenchida
 * para o advogado CONFERIR, não digitar. Cada arquivo já cai classificado no
 * catálogo do processo (item IV). Sem a pasta em mãos, o início rápido
 * (data do óbito + valor estimado) já acorda o painel ao lado.
 */

import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { CurrencyInput } from '@/components/currency-input';
import { DateInput } from '@/components/date-input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { AI_BATCH_MAX_BYTES, AI_BATCH_MAX_ITEMS, fileEligibleForAi } from '@/lib/ai';
import { filesFromDataTransfer } from '@/lib/fs';
import type { CasoExtraido } from '@/lib/gemini-sucessorista';

// Pasta arrastada vem com lixo de sistema (.DS_Store, Thumbs.db…) — fora.
// A ordem é alfabética pelo caminho relativo (subpasta junto do que é dela),
// para a leitura e a classificação saírem estáveis entre visitas.
const LIXO_DE_SISTEMA = /^\.|^(thumbs\.db|desktop\.ini)$/i;
function preparar(lista: File[]): File[] {
  return lista
    .filter((f) => !LIXO_DE_SISTEMA.test(f.name))
    .sort((a, b) => {
      const pa = (a as File & { webkitRelativePath?: string }).webkitRelativePath || a.name;
      const pb = (b as File & { webkitRelativePath?: string }).webkitRelativePath || b.name;
      return pa.localeCompare(pb, 'pt-BR');
    });
}

export interface ArquivoClassificado {
  file: File;
  documentoId: string | null;
  tipoDetectado: string | null;
}

const esquemaInicioRapido = z.object({
  dataObito: z
    .string()
    .min(1, 'Informe a data do óbito — é o fato gerador do ITCMD.')
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
  valorEstimado: z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(v), {
      message: 'Valor inválido — use o formato 900.000,00.',
    }),
});

type InicioRapido = z.infer<typeof esquemaInicioRapido>;

export function CasoView({
  aplicarLeitura,
  onInicioRapido,
  irParaFamilia,
}: {
  /** Mescla o resultado de UM lote lido na folha (campos vazios primeiro). */
  aplicarLeitura: (caso: CasoExtraido, arquivos: ArquivoClassificado[]) => void;
  onInicioRapido: (dataObito: string, valorEstimado: string) => void;
  irParaFamilia: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputPastaRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [resumo, setResumo] = useState<{ arquivos: number; tipos: string[] } | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InicioRapido>({
    resolver: zodResolver(esquemaInicioRapido),
    defaultValues: { dataObito: '', valorEstimado: '' },
  });

  async function lerArquivos(lista: File[]) {
    if (lendo || lista.length === 0) return;

    const elegiveis = lista.filter((f) => fileEligibleForAi(f));
    const inelegiveis = lista.filter((f) => !fileEligibleForAi(f));
    if (inelegiveis.length > 0) {
      // Sem leitura para eles, mas nada se perde: entram no catálogo em "outros".
      aplicarLeitura(
        { falecido: { nome: null, cpf: null, dataObito: null, dataCasamento: null, ultimoDomicilio: null }, sobrevivente: { existe: null, nome: null, vinculo: null, regime: null }, herdeiros: [], bens: [], arquivos: [] },
        inelegiveis.map((file) => ({ file, documentoId: 'outros', tipoDetectado: null }))
      );
      toast.info(`${inelegiveis.length} arquivo(s) fora do formato/tamanho da leitura`, {
        description: 'Foram anexados em "Outros documentos" para classificação manual.',
      });
    }
    if (elegiveis.length === 0) return;

    // Lotes no mesmo limite do renomeador (nº de itens e corpo da função).
    const lotes: File[][] = [];
    let atual: File[] = [];
    let bytes = 0;
    for (const f of elegiveis) {
      if (atual.length >= AI_BATCH_MAX_ITEMS || (atual.length > 0 && bytes + f.size > AI_BATCH_MAX_BYTES)) {
        lotes.push(atual);
        atual = [];
        bytes = 0;
      }
      atual.push(f);
      bytes += f.size;
    }
    if (atual.length > 0) lotes.push(atual);

    setLendo(true);
    setResumo(null);
    let lidos = 0;
    const tipos = new Set<string>();
    try {
      for (let i = 0; i < lotes.length; i++) {
        const lote = lotes[i];
        setProgresso(
          lotes.length > 1
            ? `Lendo lote ${i + 1} de ${lotes.length} (${lote.length} arquivo(s))…`
            : `Lendo ${lote.length} arquivo(s)…`
        );
        const form = new FormData();
        for (const f of lote) form.append('item', f);
        const res = await fetch('/api/sucessorista', { method: 'POST', body: form });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error ?? `Falha na leitura (HTTP ${res.status}).`);
        }
        const caso = payload?.caso as CasoExtraido | undefined;
        if (!caso) throw new Error('Resposta inválida da leitura.');

        const classificados: ArquivoClassificado[] = lote.map((file, idx) => {
          const info = caso.arquivos.find((a) => a.indice === idx + 1);
          if (info?.tipoDetectado) tipos.add(info.tipoDetectado);
          return {
            file,
            documentoId: info?.documentoId ?? 'outros',
            tipoDetectado: info?.tipoDetectado ?? null,
          };
        });
        aplicarLeitura(caso, classificados);
        lidos += lote.length;
      }
      setResumo({ arquivos: lidos, tipos: [...tipos] });
      toast.success('Leitura concluída — confira a folha', {
        description: 'A IA preenche para você conferir: nenhum campo extraído dispensa a conferência no documento.',
      });
    } catch (err) {
      const mensagem = err instanceof Error ? err.message : String(err);
      toast.error('Não foi possível ler os documentos', {
        description: `Os arquivos foram anexados ao processo mesmo assim; preencha a folha manualmente. Detalhe: ${mensagem.slice(0, 140)}`,
      });
      // A leitura falhou, mas os arquivos não se perdem: entram sem classificação.
      aplicarLeitura(
        { falecido: { nome: null, cpf: null, dataObito: null, dataCasamento: null, ultimoDomicilio: null }, sobrevivente: { existe: null, nome: null, vinculo: null, regime: null }, herdeiros: [], bens: [], arquivos: [] },
        elegiveis.slice(lidos).map((file) => ({ file, documentoId: 'outros', tipoDetectado: null }))
      );
    } finally {
      setLendo(false);
      setProgresso('');
    }
  }

  return (
    <section>
      <h1>O caso</h1>
      <p className="subtitulo">
        Solte aqui a pasta do inventário. O cofre lê certidão de óbito, certidão de
        casamento, RG, CPF e matrículas — e devolve a folha preenchida para você{' '}
        <strong>conferir</strong>, não digitar. Cada arquivo já cai classificado nos
        documentos do processo (item IV).
      </p>

      <div
        role="button"
        tabIndex={0}
        aria-label="Arraste os arquivos do caso ou clique para selecionar"
        className={`arrasto${arrastando ? ' ativo' : ''}`}
        onClick={() => !lendo && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !lendo) inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          if (lendo) return;
          // filesFromDataTransfer percorre PASTAS arrastadas recursivamente
          // (dataTransfer.files sozinho as ignora) — e precisa ser chamado
          // de forma síncrona dentro do evento.
          const coleta = filesFromDataTransfer(e.dataTransfer);
          void coleta.then((coletados) => {
            const lista = preparar(coletados);
            if (lista.length === 0) {
              toast.error('Nenhum arquivo encontrado no que foi solto', {
                description:
                  'Se o navegador bloqueou a pasta arrastada, use o botão "Selecionar pasta" logo abaixo.',
              });
              return;
            }
            toast.info(
              `${lista.length} arquivo(s) coletado(s) — subpastas incluídas`,
              { description: 'Iniciando a leitura…' },
            );
            void lerArquivos(lista);
          });
        }}
      >
        <b>{lendo ? progresso || 'Lendo os documentos…' : 'Arraste a pasta do caso — ou os arquivos'}</b>
        <span className="dica">
          {lendo
            ? 'A leitura roda pela rota interna da plataforma — a chave da IA nunca sai do servidor.'
            : 'PDF, JPG, PNG e WEBP (até 4 MB por arquivo). A pasta inteira vale: subpastas entram junto.'}
        </span>
        {!lendo && (
          <span className="arrasto-acoes">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                inputRef.current?.click();
              }}
            >
              Selecionar arquivos
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                inputPastaRef.current?.click();
              }}
            >
              Selecionar pasta
            </Button>
          </span>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={(e) => {
            if (e.target.files) void lerArquivos(preparar(Array.from(e.target.files)));
            e.target.value = '';
          }}
        />
        <input
          ref={inputPastaRef}
          type="file"
          multiple
          className="hidden"
          // @ts-expect-error webkitdirectory é fora do padrão mas universal
          webkitdirectory=""
          onChange={(e) => {
            const lista = preparar(Array.from(e.target.files ?? []));
            e.target.value = '';
            if (lista.length === 0) return;
            // O seletor do navegador envia a pasta ABERTA no diálogo — quem
            // entra numa subpasta acaba selecionando só ela. O aviso mostra
            // qual pasta veio, para o erro ficar visível na hora.
            const raiz = (lista[0] as File & { webkitRelativePath?: string }).webkitRelativePath?.split('/')[0];
            toast.info(
              raiz
                ? `Pasta "${raiz}": ${lista.length} arquivo(s), subpastas incluídas`
                : `${lista.length} arquivo(s) selecionado(s)`,
              {
                description:
                  'Se veio menos do que esperava, selecione a pasta RAIZ do caso sem entrar nela (um clique + "Selecionar pasta") — ou arraste a pasta inteira para cá.',
              },
            );
            void lerArquivos(lista);
          }}
        />
      </div>

      {resumo && (
        <div className="nota registro">
          <span className="eyebrow">Leitura concluída</span>
          <h3>
            {resumo.arquivos} documento(s) lido(s)
            {resumo.tipos.length > 0 ? ` — ${resumo.tipos.join(', ')}` : ''}
          </h3>
          <p>
            Os campos reconhecidos entraram na folha e os arquivos foram classificados no
            processo. A extração é apoio: <strong>confira cada campo no documento</strong> antes
            de usar.
          </p>
          <p style={{ marginTop: 10 }}>
            <Button onClick={irParaFamilia}>Conferir a folha preenchida</Button>
          </p>
        </div>
      )}

      <h2>Sem a pasta em mãos?</h2>
      <p className="subtitulo" style={{ marginBottom: 14 }}>
        Preencha só a data do óbito e um valor estimado do acervo. O painel ao lado já
        devolve prazo, multa e provisão do imposto — o resto pode vir depois.
      </p>
      <form
        noValidate
        onSubmit={handleSubmit((dados) => {
          onInicioRapido(dados.dataObito, dados.valorEstimado);
          toast.success('Caso iniciado', {
            description: 'O painel ao lado já mostra prazo e provisão. Complete a família e o acervo quando puder.',
          });
        })}
      >
        <div className="grade c2" style={{ maxWidth: 560 }}>
          <Field data-invalid={Boolean(errors.dataObito)}>
            <FieldLabel htmlFor="inicio-obito">Data do óbito</FieldLabel>
            <Controller
              control={control}
              name="dataObito"
              render={({ field }) => (
                <DateInput
                  id="inicio-obito"
                  aria-invalid={Boolean(errors.dataObito)}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError errors={[errors.dataObito]} />
          </Field>
          <Field data-invalid={Boolean(errors.valorEstimado)}>
            <FieldLabel htmlFor="inicio-valor">Valor estimado do acervo (R$)</FieldLabel>
            <Controller
              control={control}
              name="valorEstimado"
              render={({ field }) => (
                <CurrencyInput
                  id="inicio-valor"
                  placeholder="900.000,00"
                  aria-invalid={Boolean(errors.valorEstimado)}
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                />
              )}
            />
            <FieldError errors={[errors.valorEstimado]} />
          </Field>
        </div>
        <div style={{ marginTop: 14 }}>
          <Button type="submit" variant="outline">
            Começar pelo essencial
          </Button>
        </div>
      </form>
    </section>
  );
}
