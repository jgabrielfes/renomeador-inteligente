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
import { classificarNoCatalogo } from '@/lib/partilha/documentos';
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
  const [resumo, setResumo] = useState<{
    arquivos: number;
    tipos: string[];
    falecido: string | null;
  } | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<InicioRapido>({
    resolver: zodResolver(esquemaInicioRapido),
    defaultValues: { dataObito: '', valorEstimado: '' },
  });

  /**
   * Seletor de pasta pelo File System Access API: marca a pasta RAIZ e
   * confirma — sem o comportamento do diálogo clássico de entrar nas
   * subpastas. Percorre tudo recursivamente; sem suporte (Firefox/Safari),
   * cai no input webkitdirectory.
   */
  async function selecionarPasta() {
    type ComPicker = Window & {
      showDirectoryPicker?: (opts?: { mode?: string }) => Promise<FileSystemDirectoryHandle>;
    };
    const picker = (window as ComPicker).showDirectoryPicker;
    if (!picker) {
      inputPastaRef.current?.click();
      return;
    }
    try {
      const raiz = await picker.call(window, { mode: 'read' });
      const arquivos: File[] = [];
      const percorrer = async (dir: FileSystemDirectoryHandle): Promise<void> => {
        for await (const handle of dir.values()) {
          if (handle.kind === 'file') {
            arquivos.push(await (handle as FileSystemFileHandle).getFile());
          } else if (handle.kind === 'directory') {
            await percorrer(handle as FileSystemDirectoryHandle);
          }
        }
      };
      await percorrer(raiz);
      const lista = preparar(arquivos);
      if (lista.length === 0) {
        toast.info(`Pasta "${raiz.name}" sem arquivos legíveis.`);
        return;
      }
      toast.info(`Pasta "${raiz.name}": ${lista.length} arquivo(s), subpastas incluídas`, {
        description: 'Iniciando a leitura…',
      });
      void lerArquivos(lista);
    } catch (err) {
      // Cancelou o diálogo: silêncio. Outros erros caem no input clássico.
      if (err instanceof DOMException && err.name === 'AbortError') return;
      inputPastaRef.current?.click();
    }
  }

  async function lerArquivos(lista: File[]) {
    if (lendo || lista.length === 0) return;

    // DOCX/XLSX (planilha de qualificação, minuta de partilha): o texto é
    // extraído AQUI no navegador e segue como .txt para a leitura; o arquivo
    // ORIGINAL é o que fica anexado no processo.
    const { ehArquivoOffice, extrairTextoOffice } = await import('@/lib/office-texto');
    const pares: { original: File; envio: File }[] = [];
    const inelegiveis: File[] = [];
    for (const f of lista) {
      if (fileEligibleForAi(f)) {
        pares.push({ original: f, envio: f });
        continue;
      }
      if (ehArquivoOffice(f.name) && f.size <= 15 * 1024 * 1024) {
        try {
          const texto = await extrairTextoOffice(f);
          if (texto.trim()) {
            pares.push({
              original: f,
              envio: new File([texto], `${f.name}.txt`, { type: 'text/plain' }),
            });
            continue;
          }
        } catch {
          // ilegível/corrompido: cai para o anexo sem leitura
        }
      }
      inelegiveis.push(f);
    }

    // Certidão de óbito PRIMEIRO no lote (depois casamento): é ela que define
    // o falecido — a ordem alfabética da pasta costuma pôr CNH/RG na frente e
    // já induziu identificação errada do falecido. A mesclagem preenche campo
    // vazio primeiro, então o primeiro lote precisa ser o da fonte certa.
    const prioridade = (nome: string): number => {
      const n = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
      if (n.includes('OBITO')) return 0;
      if (n.includes('CASAMENTO') || n.includes('UNIAO ESTAVEL')) return 1;
      return 2;
    };
    pares.sort((a, b) => prioridade(a.original.name) - prioridade(b.original.name));

    if (inelegiveis.length > 0) {
      // Sem leitura para eles, mas nada se perde: o classificador de reserva
      // usa o NOME do arquivo para acertar o item do catálogo.
      aplicarLeitura(
        { falecido: { nome: null, cpf: null, dataObito: null, dataCasamento: null, ultimoDomicilio: null }, sobrevivente: { existe: null, nome: null, vinculo: null, regime: null, qualificacao: null }, herdeiros: [], bens: [], sociedades: [], outrosFalecidos: [], arquivos: [] },
        inelegiveis.map((file) => ({
          file,
          documentoId: classificarNoCatalogo('', file.name),
          tipoDetectado: null,
        }))
      );
      toast.info(`${inelegiveis.length} arquivo(s) fora do formato/tamanho da leitura`, {
        description: 'Foram anexados ao processo classificados pelo nome do arquivo — confira no item IV.',
      });
    }
    if (pares.length === 0) return;

    // Lotes no mesmo limite do renomeador (nº de itens e corpo da função),
    // medidos pelo arquivo que VIAJA (o .txt extraído é minúsculo).
    const lotes: { original: File; envio: File }[][] = [];
    let atual: { original: File; envio: File }[] = [];
    let bytes = 0;
    for (const par of pares) {
      if (atual.length >= AI_BATCH_MAX_ITEMS || (atual.length > 0 && bytes + par.envio.size > AI_BATCH_MAX_BYTES)) {
        lotes.push(atual);
        atual = [];
        bytes = 0;
      }
      atual.push(par);
      bytes += par.envio.size;
    }
    if (atual.length > 0) lotes.push(atual);

    setLendo(true);
    setResumo(null);
    let lidos = 0;
    let lotesFalhos = 0;
    let falecidoLido: string | null = null;
    const outrosObitos = new Set<string>();
    const tipos = new Set<string>();
    const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

    // Pasta pesada = vários lotes. Cada lote é independente: 429 espera o
    // retry-after e tenta de novo UMA vez; falha definitiva anexa os arquivos
    // do lote classificados pelo NOME e segue para o próximo — nunca aborta
    // a leitura inteira.
    const lerLote = async (lote: { original: File; envio: File }[]): Promise<CasoExtraido> => {
      for (let tentativa = 0; ; tentativa++) {
        const form = new FormData();
        for (const par of lote) form.append('item', par.envio);
        const res = await fetch('/api/sucessorista', { method: 'POST', body: form });
        const payload = await res.json().catch(() => null);
        if (res.ok) {
          const caso = payload?.caso as CasoExtraido | undefined;
          if (!caso) throw new Error('Resposta inválida da leitura.');
          return caso;
        }
        const espera = Number(payload?.retryDelaySeconds);
        if (tentativa === 0 && Number.isFinite(espera) && espera > 0 && !payload?.dailyQuota) {
          const segundos = Math.min(Math.ceil(espera), 45);
          setProgresso(`Limite de leituras por minuto — aguardando ${segundos}s para continuar…`);
          await pausa(segundos * 1000);
          continue;
        }
        throw new Error(payload?.error ?? `Falha na leitura (HTTP ${res.status}).`);
      }
    };

    for (let i = 0; i < lotes.length; i++) {
      const lote = lotes[i];
      setProgresso(
        lotes.length > 1
          ? `Lendo lote ${i + 1} de ${lotes.length} (${lote.length} arquivo(s))…`
          : `Lendo ${lote.length} arquivo(s)…`
      );
      try {
        const caso = await lerLote(lote);
        const classificados: ArquivoClassificado[] = lote.map((par, idx) => {
          const info = caso.arquivos.find((a) => a.indice === idx + 1);
          if (info?.tipoDetectado) tipos.add(info.tipoDetectado);
          return {
            file: par.original,
            documentoId:
              info?.documentoId ??
              classificarNoCatalogo(info?.tipoDetectado ?? '', par.original.name),
            tipoDetectado: info?.tipoDetectado ?? null,
          };
        });
        aplicarLeitura(caso, classificados);
        if (caso.falecido.nome && !falecidoLido) falecidoLido = caso.falecido.nome;
        for (const o of caso.outrosFalecidos) outrosObitos.add(o.nome);
        lidos += lote.length;
      } catch (err) {
        lotesFalhos += 1;
        const mensagem = err instanceof Error ? err.message : String(err);
        // Arquivos do lote falho não se perdem: classificados pelo nome.
        aplicarLeitura(
          { falecido: { nome: null, cpf: null, dataObito: null, dataCasamento: null, ultimoDomicilio: null }, sobrevivente: { existe: null, nome: null, vinculo: null, regime: null, qualificacao: null }, herdeiros: [], bens: [], sociedades: [], outrosFalecidos: [], arquivos: [] },
          lote.map((par) => ({
            file: par.original,
            documentoId: classificarNoCatalogo('', par.original.name),
            tipoDetectado: null,
          }))
        );
        toast.error(`Lote ${i + 1} de ${lotes.length} sem leitura`, {
          description: `Arquivos anexados pelo nome; a leitura continua nos demais. Detalhe: ${mensagem.slice(0, 120)}`,
        });
      }
      // Respiro entre lotes: alivia o limite por minuto do free tier.
      if (i < lotes.length - 1) await pausa(1200);
    }

    setResumo({ arquivos: lidos, tipos: [...tipos], falecido: falecidoLido });
    if (outrosObitos.size > 0) {
      toast.warning(`Mais de um óbito detectado: ${[...outrosObitos].join(', ')}`, {
        description:
          'Se for herdeiro pré-morto, a folha marca a situação automaticamente quando o nome casa; se forem DUAS sucessões (ex.: pai e mãe), trate cada uma em um caso separado.',
        duration: 12000,
      });
    }
    if (lidos > 0 && lotesFalhos === 0) {
      toast.success('Leitura concluída — confira a folha', {
        description: 'A IA preenche para você conferir: nenhum campo extraído dispensa a conferência no documento.',
      });
    } else if (lidos > 0) {
      toast.warning(`Leitura parcial: ${lotesFalhos} lote(s) falharam`, {
        description: 'Os arquivos desses lotes foram anexados classificados pelo nome — confira o item IV.',
      });
    }
    setLendo(false);
    setProgresso('');
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
            : 'PDF, JPG, PNG e WEBP (até 4 MB por arquivo) — e DOCX/XLSX, como a planilha de qualificação e a minuta de partilha, que viram texto aqui no navegador. Subpastas entram junto.'}
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
                void selecionarPasta();
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
          accept=".pdf,.jpg,.jpeg,.png,.webp,.docx,.xlsx"
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
          {resumo.falecido && (
            <p>
              Autor(a) da herança identificado(a): <strong>{resumo.falecido}</strong> —{' '}
              <strong>confira na certidão de óbito</strong>; se estiver errado, corrija no
              item I antes de seguir.
            </p>
          )}
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
