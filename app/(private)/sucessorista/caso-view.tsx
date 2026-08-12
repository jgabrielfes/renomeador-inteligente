/**
 * Etapa 0 — O caso.
 *
 * Porta de entrada da folha: solte a pasta do inventário e TODOS os arquivos
 * são anexados NA HORA ao processo (item V), classificados pelo nome — a
 * leitura de verdade (certidão de óbito, casamento, RG/CPF, matrículas…)
 * roda em segundo plano pela rota interna /api/sucessorista, em lotes
 * PARALELOS com fotos comprimidas no navegador, e depois só refina: move o
 * arquivo para o item certo e preenche a folha para o advogado CONFERIR,
 * não digitar. Sem a pasta em mãos, o início rápido (data do óbito + valor
 * estimado) já acorda o painel ao lado.
 */

import { useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { CurrencyInput } from '@/components/currency-input';
import { DateInput } from '@/components/date-input';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { AI_BATCH_MAX_BYTES, AI_BATCH_MAX_ITEMS, fileEligibleForAi } from '@/lib/ai';
import { filesFromDataTransfer } from '@/lib/fs';
import { classificarNoCatalogo } from '@/lib/partilha/documentos';
import type { CasoExtraido } from '@/lib/gemini-sucessorista';
import { registrarLeituraDoCofre } from './actions';

// Fora do componente: `performance.now` é impura e o lint do React proíbe
// chamá-la direto no corpo de função declarada dentro do componente.
const agora = () => performance.now();

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

/** Leitura vazia — usada para anexar arquivos sem mexer nos campos da folha. */
const CASO_VAZIO: CasoExtraido = {
  falecido: { nome: null, cpf: null, dataObito: null, dataCasamento: null, ultimoDomicilio: null, localFalecimento: null, certidaoObito: null, certidaoCasamento: null, qualificacao: null },
  sobrevivente: { existe: null, nome: null, vinculo: null, regime: null, qualificacao: null },
  herdeiros: [],
  bens: [],
  sociedades: [],
  outrosFalecidos: [],
  arquivos: [],
};

const EXT_IMAGEM = /\.(jpe?g|png|webp|bmp)$/i;

/**
 * Comprime foto/scan AQUI no navegador antes do envio (JPEG, lado maior
 * 1800px): documento continua legível para a leitura, mas o upload cai de
 * megabytes para centenas de KB — é o que mais acelera pastas de fotos, e
 * torna legível a foto que estourava o limite de 4 MB. Qualquer falha (ou
 * resultado maior que o original) devolve o arquivo intacto.
 */
async function comprimirImagem(file: File): Promise<File> {
  if (file.size <= 350 * 1024 && !/\.bmp$/i.test(file.name)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const LADO_MAX = 1800;
    const escala = Math.min(1, LADO_MAX / Math.max(bitmap.width, bitmap.height));
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));
    const canvas = document.createElement('canvas');
    canvas.width = largura;
    canvas.height = altura;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, largura, altura);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.72));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.\w+$/, '')}.jpg`, { type: 'image/jpeg' });
  } catch {
    return file;
  }
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
  reclassificarArquivos,
  onInicioRapido,
  irParaFamilia,
  rascunhoSalvoEm,
  onExportarCaso,
  onImportarCaso,
  onNovoCaso,
  casoId,
  perfil,
}: {
  /** Mescla o resultado de UM lote lido na folha (campos vazios primeiro). */
  aplicarLeitura: (caso: CasoExtraido, arquivos: ArquivoClassificado[]) => void;
  /** A IA refinou depois do anexo imediato: move os arquivos já anexados. */
  reclassificarArquivos: (itens: ArquivoClassificado[]) => void;
  onInicioRapido: (dataObito: string, valorEstimado: string) => void;
  irParaFamilia: () => void;
  /** Último salvamento do rascunho local (IndexedDB) — null sem rascunho. */
  rascunhoSalvoEm: string | null;
  onExportarCaso: () => void;
  onImportarCaso: (file: File) => Promise<void>;
  onNovoCaso: () => Promise<void>;
  /** Telemetria: id aleatório do caso e perfil ativo (sem dado pessoal). */
  casoId: string;
  perfil: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputPastaRef = useRef<HTMLInputElement>(null);
  const inputCasoRef = useRef<HTMLInputElement>(null);
  const [importando, setImportando] = useState(false);
  const [confirmandoNovo, setConfirmandoNovo] = useState(false);
  const [apagando, setApagando] = useState(false);
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
    setLendo(true);
    setResumo(null);
    setProgresso('Preparando os arquivos…');
    const inicioLeitura = agora();

    try {
      // DOCX/XLSX (planilha de qualificação, minuta de partilha): o texto é
      // extraído AQUI no navegador e segue como .txt para a leitura; fotos e
      // scans são COMPRIMIDOS aqui antes do envio. O arquivo ORIGINAL é o que
      // fica anexado no processo.
      const { ehArquivoOffice, extrairTextoOffice } = await import('@/lib/office-texto');
      const pares: { original: File; envio: File }[] = [];
      const inelegiveis: File[] = [];
      for (let i = 0; i < lista.length; i++) {
        const f = lista[i];
        if (lista.length > 8) setProgresso(`Preparando os arquivos… ${i + 1}/${lista.length}`);
        let envio = f;
        if (EXT_IMAGEM.test(f.name)) envio = await comprimirImagem(f);
        if (fileEligibleForAi(envio)) {
          pares.push({ original: f, envio });
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

      // ANEXO IMEDIATO: todos os arquivos entram no processo AGORA,
      // classificados pelo nome — nada de esperar a IA para trabalhar. A
      // leitura roda em segundo plano e depois só REFINA: move o que
      // classificar diferente e preenche a folha.
      const todos = [...pares.map((p) => p.original), ...inelegiveis];
      aplicarLeitura(
        CASO_VAZIO,
        todos.map((file) => ({
          file,
          documentoId: classificarNoCatalogo('', file.name),
          tipoDetectado: null,
        })),
      );
      toast.info(`${todos.length} arquivo(s) anexados ao processo`, {
        description:
          'Classificados pelo nome na hora — a leitura por IA segue em segundo plano preenchendo a folha e refinando a classificação. Você já pode navegar pelas abas.',
      });
      if (pares.length === 0) return;

      // Certidão de óbito PRIMEIRO no lote (depois casamento): é ela que
      // define o falecido — a ordem alfabética da pasta costuma pôr CNH/RG na
      // frente e já induziu identificação errada. A mesclagem preenche campo
      // vazio primeiro, então o primeiro lote precisa ser o da fonte certa.
      const prioridade = (nome: string): number => {
        const n = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        if (n.includes('OBITO')) return 0;
        if (n.includes('CASAMENTO') || n.includes('UNIAO ESTAVEL')) return 1;
        return 2;
      };
      pares.sort((a, b) => prioridade(a.original.name) - prioridade(b.original.name));

      // Lotes no mesmo limite do renomeador (nº de itens e corpo da função),
      // medidos pelo arquivo que VIAJA (o .txt/JPEG comprimido é pequeno).
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

      let lidos = 0;
      let concluidos = 0;
      let lotesFalhos = 0;
      let falecidoLido: string | null = null;
      // Telemetria: só as CONTAGENS do que a leitura trouxe (os nomes, não).
      let herdeirosLidos = 0;
      let bensLidos = 0;
      const outrosObitos = new Set<string>();
      const tipos = new Set<string>();
      const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

      // Cada lote é independente: 429 espera o retry-after (até 2 novas
      // tentativas); falha definitiva não perde nada — os arquivos já estão
      // anexados pelo nome — e a leitura continua nos demais lotes.
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
          if (tentativa < 2 && Number.isFinite(espera) && espera > 0 && !payload?.dailyQuota) {
            await pausa(Math.min(Math.ceil(espera), 45) * 1000);
            continue;
          }
          throw new Error(payload?.error ?? `Falha na leitura (HTTP ${res.status}).`);
        }
      };

      const executar = async (
        lote: { original: File; envio: File }[],
        rotulo: number,
        profundidade = 0,
      ) => {
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
          aplicarLeitura(caso, []); // só os campos da folha — o anexo já foi feito
          reclassificarArquivos(classificados); // move para o item apontado pela IA
          if (caso.falecido.nome && !falecidoLido) falecidoLido = caso.falecido.nome;
          for (const o of caso.outrosFalecidos) outrosObitos.add(o.nome);
          herdeirosLidos += caso.herdeiros.length;
          bensLidos += caso.bens.length;
          lidos += lote.length;
        } catch (err) {
          const mensagem = err instanceof Error ? err.message : String(err);
          // Estouro de tempo é quase sempre TAMANHO do lote: parte ao meio e
          // tenta de novo (duas metades cabem no orçamento da função) antes de
          // desistir e deixar os arquivos só com a classificação pelo nome.
          const semTempo = /sem resposta em|HTTP 504|504/i.test(mensagem);
          if (semTempo && lote.length > 1 && profundidade < 2) {
            const meio = Math.ceil(lote.length / 2);
            await executar(lote.slice(0, meio), rotulo, profundidade + 1);
            await executar(lote.slice(meio), rotulo, profundidade + 1);
            return;
          }
          lotesFalhos += 1;
          toast.error(`Lote ${rotulo} de ${lotes.length} sem leitura por IA`, {
            description: `Os arquivos dele seguem anexados pelo nome; a leitura continua nos demais. Detalhe: ${mensagem.slice(0, 120)}`,
          });
        } finally {
          // Só a chamada de topo conta no progresso — as metades da divisão
          // pertencem ao mesmo lote e inflariam o contador.
          if (profundidade === 0) {
            concluidos += 1;
            setProgresso(
              lotes.length > 1
                ? `Leitura por IA em segundo plano: ${concluidos} de ${lotes.length} lote(s)…`
                : 'Lendo os documentos por IA…',
            );
          }
        }
      };

      setProgresso(
        lotes.length > 1
          ? `Leitura por IA em segundo plano: 0 de ${lotes.length} lote(s)…`
          : 'Lendo os documentos por IA…',
      );

      // O 1º lote roda SOZINHO (é o do óbito/casamento — fixa o falecido);
      // os demais rodam em PARALELO (3 por vez): é o que corta o tempo total
      // da pasta pesada, no lugar da fila com pausa fixa entre lotes.
      await executar(lotes[0], 1);
      const restantes = lotes.slice(1);
      if (restantes.length > 0) {
        let cursor = 0;
        const trabalhador = async () => {
          for (;;) {
            const i = cursor;
            cursor += 1;
            if (i >= restantes.length) return;
            await executar(restantes[i], i + 2);
          }
        };
        await Promise.all(
          Array.from({ length: Math.min(3, restantes.length) }, () => trabalhador()),
        );
      }

      setResumo({ arquivos: lidos, tipos: [...tipos], falecido: falecidoLido });
      // Telemetria da etapa 0: tags de tipo, contagens e flags — nunca o nome
      // do falecido (só a flag de que a leitura o identificou).
      void registrarLeituraDoCofre({
        casoId,
        perfil,
        lidos,
        selecionados: lista.length,
        inelegiveis: inelegiveis.length,
        lotesFalhos,
        duracaoMs: Math.round(agora() - inicioLeitura),
        tipos: [...tipos],
        identificouFalecido: falecidoLido !== null,
        outrosObitos: outrosObitos.size,
        herdeirosLidos,
        bensLidos,
      });
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
          description: 'Os arquivos desses lotes ficaram classificados pelo nome — confira o item V.',
        });
      }
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
        documentos do processo (item V).
      </p>

      {/* Visível logo no início: o caso não se perde. */}
      <div className="nota registro" style={{ marginBottom: 14 }}>
        <span className="eyebrow">Rascunho local — nada sai desta máquina</span>
        <p>
          A folha é salva automaticamente <strong>neste navegador</strong> (IndexedDB):
          sobrevive ao F5 e a fechar o navegador
          {rascunhoSalvoEm
            ? ` — último salvamento ${new Date(rascunhoSalvoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
            : ''}
          . Para guardar na pasta do processo (e reabrir meses depois, inclusive em outro
          computador ou com um colega), use o <strong>Arquivo do caso</strong> abaixo.
        </p>
      </div>

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
            ? 'Os arquivos já estão anexados no item V — a leitura por IA roda em segundo plano pela rota interna (a chave nunca sai do servidor).'
            : 'PDF, JPG, PNG e WEBP — fotos grandes são otimizadas aqui no navegador antes da leitura — e DOCX/XLSX, como a planilha de qualificação e a minuta de partilha, que viram texto aqui mesmo. Subpastas entram junto.'}
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

      <h2>Arquivo do caso (.json)</h2>
      <p className="subtitulo" style={{ marginBottom: 12 }}>
        Exporte o caso inteiro num arquivo e salve na pasta do processo, junto dos
        documentos. Reabra meses depois — ou passe a um colega — importando o arquivo. Os
        anexos não vão no .json: eles já são a própria pasta do processo (basta arrastá-los
        de novo aqui).
      </p>
      <div className="escolha">
        <Button variant="outline" onClick={onExportarCaso}>
          Exportar arquivo do caso
        </Button>
        <Button variant="outline" onClick={() => inputCasoRef.current?.click()} loading={importando}>
          Importar arquivo do caso
        </Button>
        <Dialog open={confirmandoNovo} onOpenChange={setConfirmandoNovo}>
          <DialogTrigger
            render={<Button variant="ghost" className="text-destructive" />}
            nativeButton={false}
          >
            Começar caso novo
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Começar um caso novo?</DialogTitle>
              <DialogDescription>
                A folha atual e o rascunho salvo neste navegador serão apagados. Exporte o
                arquivo do caso antes, se quiser guardá-lo.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmandoNovo(false)}>
                Cancelar
              </Button>
              <Button
                variant="destructive"
                loading={apagando}
                onClick={async () => {
                  setApagando(true);
                  await onNovoCaso();
                }}
              >
                Apagar e começar do zero
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <input
        ref={inputCasoRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          setImportando(true);
          void onImportarCaso(f).finally(() => setImportando(false));
        }}
      />

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
