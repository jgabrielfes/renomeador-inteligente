/**
 * Ambiente de documentos do processo — anexos por item do catálogo exigido
 * pelo ITCMD-SP/inventário, lupa de pré-visualização e a montagem final:
 * PDF unificado do processo ou ZIP com PDFs individualizados, tudo no
 * navegador (nenhum arquivo sai da máquina). Os arquivos lidos pelo cofre
 * da etapa 0 chegam aqui já classificados.
 */

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  CATALOGO_DOCUMENTOS,
  classificarNoCatalogo,
  ROTULO_GRUPO,
  type GrupoDocumento,
} from '@/lib/partilha/documentos';
import { montarPdfUnificado, montarZipIndividualizado } from '@/lib/partilha/processo';
import { baixarBlob } from '@/lib/partilha/xlsx';
import type { ConviteHerdeiro } from '@/lib/portal/store';
import { LupaPreview } from './preview';
import { toast } from 'sonner';

export type AnexosProcesso = Record<string, File[]>;

/**
 * Onde cada pedido do PORTAL DO HERDEIRO se encaixa no catálogo do processo
 * — é o que faz o envio do cofre aparecer no card CERTO, na ordem correlata.
 */
const CATALOGO_DO_PEDIDO_PORTAL: Record<string, string> = {
  'rg-cpf': 'docs-herdeiros',
  'certidao-estado-civil': 'certidoes-herdeiros',
  'comprovante-endereco': 'comprovantes-endereco',
  'outros-documentos': 'outros',
  // Convites antigos ainda carregam o pedido de profissão.
  profissao: 'docs-herdeiros',
};

const ROTULO_STATUS_PORTAL: Record<string, string> = {
  ENVIADO: 'aguardando conferência',
  APROVADO: 'aprovado',
  REJEITADO: 'devolvido para reenvio',
};

interface EnvioDoCofre {
  herdeiro: string;
  /** Token do convite + id do pedido: é o endereço do aceite/recusa. */
  token: string;
  pedidoId: string;
  nomeArquivo: string;
  tipoDetectado?: string;
  status: string;
  /** Arquivo REAL guardado pelo portal — habilita baixar/anexar ao caso. */
  arquivoId?: string;
  arquivoTamanho?: number;
  /** Data de emissão lida no navegador do herdeiro (alerta de validade). */
  emitidaEm?: string;
}

/** Certidão emitida há mais de 90 dias — o alerta dos dois lados. */
function diasDesdeEmissao(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(`${iso}T12:00:00`).getTime();
  return Number.isNaN(t) ? null : Math.floor((Date.now() - t) / 86_400_000);
}

function tamanhoLegivel(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Ações do envio REAL do cofre: baixar o arquivo do herdeiro ou puxá-lo
 * direto para o card do processo (vira anexo com miniatura, como se tivesse
 * sido arrastado). A rota de download exige a sessão do escritório.
 */
function AcoesEnvioCofre({
  envio,
  onAnexar,
  onSalvarNaPasta,
}: {
  envio: EnvioDoCofre;
  onAnexar: (file: File) => void;
  /** Modo pasta: grava o arquivo em "Recebidos do cofre/" no caso (Explorer). */
  onSalvarNaPasta?: (file: File) => Promise<boolean>;
}) {
  const [agindo, setAgindo] = useState<'baixar' | 'anexar' | null>(null);
  const [erro, setErro] = useState(false);
  const [anexado, setAnexado] = useState(false);
  const [naPasta, setNaPasta] = useState(false);
  if (!envio.arquivoId) return null;

  const buscar = async (): Promise<File | null> => {
    const r = await fetch(`/api/portal/arquivo/${envio.arquivoId}`);
    if (!r.ok) return null;
    const blob = await r.blob();
    return new File([blob], envio.nomeArquivo, { type: blob.type });
  };

  const agir = async (acao: 'baixar' | 'anexar') => {
    setAgindo(acao);
    setErro(false);
    try {
      const file = await buscar();
      if (!file) {
        setErro(true);
        return;
      }
      if (acao === 'baixar') {
        baixarBlob(file, envio.nomeArquivo);
      } else {
        onAnexar(file);
        setAnexado(true);
        // Modo pasta: o arquivo também vai para o disco, na subpasta
        // "Recebidos do cofre" do caso — aí o manifesto religa sozinho.
        if (onSalvarNaPasta) setNaPasta(await onSalvarNaPasta(file));
      }
    } catch {
      setErro(true);
    } finally {
      setAgindo(null);
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={agindo === 'baixar'}
        disabled={agindo !== null}
        onClick={() => void agir('baixar')}
      >
        baixar
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={agindo === 'anexar'}
        disabled={agindo !== null || anexado}
        onClick={() => void agir('anexar')}
      >
        {anexado ? 'anexado \u2713' : 'anexar ao caso'}
      </Button>
      {naPasta && <span className="fund">salvo na pasta do caso</span>}
      {erro && <span className="mono-alerta">falha ao buscar o arquivo</span>}
    </>
  );
}

/**
 * Conferência do envio do cofre: APROVAR (o herdeiro vê "Aprovado") ou
 * RECUSAR com motivo ("foto cortada, reenvie por favor") — o portal reabre o
 * envio daquele item e mostra o recado. A rota é a mesma PATCH do portal
 * (o token é o endereço); o convite atualizado volta para o estado do caso.
 */
function AcoesConferencia({
  envio,
  onConviteAtualizado,
}: {
  envio: EnvioDoCofre;
  onConviteAtualizado: (c: ConviteHerdeiro) => void;
}) {
  const [agindo, setAgindo] = useState<'aprovar' | 'recusar' | null>(null);
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');

  const decidir = async (status: 'APROVADO' | 'REJEITADO') => {
    setAgindo(status === 'APROVADO' ? 'aprovar' : 'recusar');
    try {
      const r = await fetch(`/api/portal/${envio.token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          docId: envio.pedidoId,
          status,
          observacaoAdvogado: status === 'REJEITADO' ? motivo.trim() : '',
        }),
      });
      if (!r.ok) throw new Error();
      onConviteAtualizado((await r.json()) as ConviteHerdeiro);
      setRecusando(false);
      setMotivo('');
      toast.success(
        status === 'APROVADO'
          ? `Documento de ${envio.herdeiro} aprovado`
          : `Devolvido para reenvio — ${envio.herdeiro} verá o motivo no portal`,
      );
    } catch {
      toast.error('Não foi possível registrar a conferência — tente de novo.');
    } finally {
      setAgindo(null);
    }
  };

  if (envio.status === 'APROVADO') return null;
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        loading={agindo === 'aprovar'}
        disabled={agindo !== null}
        onClick={() => void decidir('APROVADO')}
      >
        aprovar
      </Button>
      {envio.status !== 'REJEITADO' && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={agindo !== null}
          onClick={() => setRecusando(true)}
        >
          recusar
        </Button>
      )}
      <Dialog open={recusando} onOpenChange={(o) => agindo === null && setRecusando(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Devolver o envio de {envio.herdeiro} para reenvio</DialogTitle>
            <DialogDescription>
              Escreva o motivo em linguagem simples — ele aparece para {envio.herdeiro} no
              portal, junto do pedido reaberto. Ex.: &quot;A foto veio cortada — reenvie o
              documento inteiro, sem sombra&quot;.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={motivo}
            placeholder="Motivo da recusa (o herdeiro lê exatamente isto)"
            onChange={(e) => setMotivo(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" disabled={agindo !== null} onClick={() => setRecusando(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              loading={agindo === 'recusar'}
              disabled={motivo.trim() === ''}
              onClick={() => void decidir('REJEITADO')}
            >
              Devolver com este motivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Miniatura do anexo (estilo organizador de páginas do Acrobat): imagem sai
 * direto do arquivo; PDF renderiza a PRIMEIRA página no navegador (pdfjs via
 * loadPdfjs); DOCX/XLSX ganham o selo da extensão. O cache por File evita
 * re-renderizar a cada troca de estado da aba — nada sai da máquina.
 */
const cacheMiniaturas = new WeakMap<File, Promise<string | null>>();

function gerarMiniatura(file: File): Promise<string | null> {
  const pendente = cacheMiniaturas.get(file);
  if (pendente) return pendente;
  const tarefa = (async () => {
    try {
      const nome = file.name.toLowerCase();
      if (/\.(png|jpe?g|webp|bmp)$/.test(nome)) return URL.createObjectURL(file);
      if (!nome.endsWith('.pdf')) return null;
      const { loadPdfjs } = await import('@/lib/ocr');
      const pdfjs = await loadPdfjs();
      const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
      const doc = await loadingTask.promise;
      try {
        const page = await doc.getPage(1);
        const vp1 = page.getViewport({ scale: 1 });
        // ~2× a largura do card, nítido também em tela retina.
        const viewport = page.getViewport({ scale: 260 / vp1.width });
        const canvas = document.createElement('canvas');
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        await page.render({ canvas, canvasContext: ctx, viewport }).promise;
        return canvas.toDataURL('image/jpeg', 0.8);
      } finally {
        await loadingTask.destroy();
      }
    } catch {
      return null;
    }
  })();
  cacheMiniaturas.set(file, tarefa);
  return tarefa;
}

function MiniaturaCard({
  file,
  onAbrir,
  onRemover,
  onNuvem,
  enviandoNuvem = false,
  arrasto,
  onFimArrasto,
}: {
  file: File;
  onAbrir: () => void;
  onRemover: () => void;
  /** Reenvio manual à nuvem de arquivos (o ☁ no canto da miniatura). */
  onNuvem?: () => void;
  enviandoNuvem?: boolean;
  /** Payload do clique-e-arraste entre tópicos (docId + posição). */
  arrasto?: { docId: string; indice: number };
  onFimArrasto?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);
  useEffect(() => {
    let vivo = true;
    void gerarMiniatura(file).then((s) => {
      if (!vivo) return;
      setSrc(s);
      setPronto(true);
    });
    return () => {
      vivo = false;
    };
  }, [file]);
  const ext = (file.name.split('.').pop() ?? 'DOC').toUpperCase();
  return (
    <figure
      className="doc-card"
      draggable={Boolean(arrasto)}
      onDragStart={(e) => {
        if (!arrasto) return;
        e.dataTransfer.setData('application/x-anexo-caso', JSON.stringify(arrasto));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={onFimArrasto}
    >
      <button
        type="button"
        className="doc-card-thumb"
        title={`Pré-visualizar ${file.name}`}
        onClick={onAbrir}
      >
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura local (data/blob URL); next/image não se aplica
          <img src={src} alt="" />
        ) : (
          <span className="doc-card-ext">{pronto ? ext : '…'}</span>
        )}
      </button>
      <button
        type="button"
        className="doc-card-remover"
        title={`Remover ${file.name}`}
        aria-label={`Remover ${file.name}`}
        onClick={onRemover}
      >
        ✕
      </button>
      {onNuvem && (
        <button
          type="button"
          className="doc-card-nuvem"
          title={`Subir ${file.name} para a nuvem`}
          aria-label={`Subir ${file.name} para a nuvem`}
          disabled={enviandoNuvem}
          onClick={onNuvem}
        >
          {enviandoNuvem ? '…' : '☁'}
        </button>
      )}
      <figcaption className="doc-card-nome num" title={file.name}>
        {file.name}
      </figcaption>
    </figure>
  );
}

function BotaoAnexar({ onFiles, discreto = false }: { onFiles: (lista: FileList) => void; discreto?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span style={discreto ? undefined : { display: 'inline-block', marginTop: 8 }}>
      <Button
        type="button"
        variant={discreto ? 'ghost' : 'outline'}
        size="sm"
        className={discreto ? 'doc-linha-acao' : 'rounded-full'}
        onClick={() => ref.current?.click()}
      >
        {discreto ? 'anexar' : '+ anexar arquivo(s)'}
      </Button>
      <input
        ref={ref}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp,.docx,.xlsx"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) onFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </span>
  );
}

/**
 * Coluna "Responsável" do item do catálogo: advogado, inventariante ou um
 * herdeiro específico. Responsável herdeiro COM convite do cofre ganha o
 * "pedir pelo cofre" — o item entra como pendência no portal DELE (aparece
 * em "O que falta de você"), com id `caso-<docId>` para o envio voltar ao
 * card certo.
 */
function ResponsavelDoc({
  doc,
  valor,
  onMudar,
  herdeiros,
  convites,
  onConviteAtualizado,
}: {
  doc: (typeof CATALOGO_DOCUMENTOS)[number];
  valor: string;
  onMudar: (v: string) => void;
  herdeiros: { id: string; nome: string }[];
  convites: Record<string, ConviteHerdeiro>;
  onConviteAtualizado?: (c: ConviteHerdeiro) => void;
}) {
  const [pedindo, setPedindo] = useState(false);
  const convite = valor && convites[valor] && !convites[valor].revogadoEm ? convites[valor] : null;
  const jaPedido =
    convite?.documentos.some(
      (d) => d.id === `caso-${doc.id}` || CATALOGO_DO_PEDIDO_PORTAL[d.id] === doc.id,
    ) ?? false;

  const pedirPeloCofre = async () => {
    if (!convite || !onConviteAtualizado) return;
    setPedindo(true);
    try {
      const r = await fetch(`/api/portal/${convite.token}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          novoPedido: { id: `caso-${doc.id}`, titulo: doc.titulo, descricao: doc.descricao },
        }),
      });
      if (!r.ok) throw new Error();
      onConviteAtualizado((await r.json()) as ConviteHerdeiro);
      toast.success(`Pedido no portal de ${convite.nomeHerdeiro}`, {
        description: `"${doc.titulo}" agora aparece em "O que falta de você" no link dele(a).`,
      });
    } catch {
      toast.error('Não foi possível pedir pelo cofre — tente de novo.');
    } finally {
      setPedindo(false);
    }
  };

  return (
    <span className="doc-resp">
      <Select value={valor || '__ninguem__'} onValueChange={(v) => v && onMudar(v === '__ninguem__' ? '' : v)}>
        <SelectTrigger size="sm" aria-label={`Responsável por ${doc.titulo}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__ninguem__">Responsável…</SelectItem>
          <SelectItem value="__advogado__">Escritório</SelectItem>
          <SelectItem value="__inventariante__">Inventariante</SelectItem>
          {herdeiros.map((h) => (
            <SelectItem key={h.id} value={h.id}>
              {h.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {convite && !jaPedido && onConviteAtualizado && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          loading={pedindo}
          onClick={() => void pedirPeloCofre()}
        >
          pedir pelo cofre
        </Button>
      )}
      {convite && jaPedido && <span className="fund">no portal dele(a)</span>}
    </span>
  );
}

export function DocumentosView({
  anexos,
  setAnexos,
  nomeCaso,
  temSobrevivente = true,
  rito = null,
  convites = {},
  onConviteAtualizado,
  responsaveis = {},
  onResponsavel,
  herdeirosCaso = [],
  onSalvarNaPasta,
  modoDrive = false,
  nuvemNome = 'Google Drive',
  onExcluirDrive,
  onSubirNuvem,
  onMontado,
}: {
  anexos: AnexosProcesso;
  setAnexos: (a: AnexosProcesso) => void;
  nomeCaso: string;
  /** false esconde o grupo do cônjuge supérstite — sucessão sem essa parte. */
  temSobrevivente?: boolean;
  /** Rito provável do caso: decide o título de ENCERRAMENTO que aparece —
   *  traslado da escritura (extrajudicial) × formal de partilha (judicial). */
  rito?: 'EXTRAJUDICIAL' | 'JUDICIAL' | null;
  /** Convites do cofre: o que cada herdeiro enviou aparece no card certo. */
  convites?: Record<string, ConviteHerdeiro>;
  /** Conferência do advogado (aprovar/recusar) devolve o convite fresco. */
  onConviteAtualizado?: (c: ConviteHerdeiro) => void;
  /** Coluna "Responsável" por item do catálogo (persistida no caso):
   *  '' | '__advogado__' | '__inventariante__' | herdeiroId. */
  responsaveis?: Record<string, string>;
  onResponsavel?: (docId: string, valor: string) => void;
  /** Herdeiros do item I — as opções da coluna Responsável. */
  herdeirosCaso?: { id: string; nome: string }[];
  /** Modo pasta: grava o envio do cofre em "Recebidos do cofre/" do caso. */
  onSalvarNaPasta?: (file: File) => Promise<boolean>;
  /** true = os anexos deste caso vivem na nuvem de arquivos do usuário. */
  modoDrive?: boolean;
  /** Nome da nuvem conectada ("Google Drive" | "OneDrive") — textos do dialog. */
  nuvemNome?: string;
  /** Exclui o documento da nuvem (chamado SÓ após a autorização extra). */
  onExcluirDrive?: (file: File) => Promise<boolean>;
  /**
   * Reenvio MANUAL à nuvem de arquivos ("Subir tudo" + o ☁ das miniaturas)
   * — o plano B quando o envio automático falhou (rede, arquivo grande).
   */
  onSubirNuvem?: (files: File[]) => Promise<{ ok: number; falhas: number; motivo?: string }>;
  /** Telemetria: o processo foi montado (só o formato e a contagem). */
  onMontado?: (formato: 'PDF_PROCESSO' | 'ZIP_PROCESSO', itens: number) => void;
}) {
  const [preview, setPreview] = useState<File | null>(null);
  /** Pedido de remoção aguardando a AUTORIZAÇÃO EXTRA (modo Drive). */
  const [excluir, setExcluir] = useState<{ docId: string; indice: number; file: File } | null>(null);
  const [excluindoDrive, setExcluindoDrive] = useState(false);
  const [erroExcluir, setErroExcluir] = useState(false);
  const [gerando, setGerando] = useState<'pdf' | 'zip' | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  // Envios do PORTAL agrupados pelo item do catálogo em que se encaixam.
  // Com upload real (portal_arquivos), a linha ganha "baixar" e "anexar ao
  // caso"; sem arquivo guardado (envio antigo, >4 MB ou falha), fica só o
  // registro — o advogado cobra o original por outro canal.
  const enviosDoCofre: Record<string, EnvioDoCofre[]> = {};
  for (const convite of Object.values(convites)) {
    for (const d of convite.documentos) {
      if (!d.nomeArquivo || d.status === 'PENDENTE') continue;
      // Pedidos "caso-<docId>" nascem da coluna Responsável: o envio volta
      // exatamente para o item do catálogo que o originou.
      const docId =
        CATALOGO_DO_PEDIDO_PORTAL[d.id] ??
        (d.id.startsWith('caso-') ? d.id.slice(5) : 'outros');
      // Um pedido aceita VÁRIOS arquivos (frente/verso/correlatos): uma
      // linha por arquivo guardado; registro antigo sem lista vira uma só.
      const guardados =
        d.arquivos && d.arquivos.length > 0
          ? d.arquivos
          : [
              {
                arquivoId: d.arquivoId ?? '',
                nome: d.nomeArquivo,
                tamanho: d.arquivoTamanho ?? 0,
                tipoDetectado: d.tipoDetectado,
                emitidaEm: d.emitidaEm,
              },
            ];
      for (const a of guardados) {
        (enviosDoCofre[docId] ??= []).push({
          herdeiro: convite.nomeHerdeiro,
          token: convite.token,
          pedidoId: d.id,
          nomeArquivo: a.nome,
          tipoDetectado: a.tipoDetectado,
          status: d.status,
          arquivoId: a.arquivoId || undefined,
          arquivoTamanho: a.tamanho || undefined,
          emitidaEm: a.emitidaEm,
        });
      }
    }
  }

  const catalogoDoCasoTopo = CATALOGO_DOCUMENTOS.filter((doc) => {
    if (!temSobrevivente && doc.grupo === 'SOBREVIVENTE') return false;
    // Encerramento pelo rito: extrajudicial junta o TRASLADO; judicial, o
    // FORMAL — o outro título não aparece (rito indefinido mostra os dois).
    if (doc.id === 'traslado-escritura' && rito === 'JUDICIAL') return false;
    if (doc.id === 'formal-partilha' && rito === 'EXTRAJUDICIAL') return false;
    return true;
  });
  const totalAnexos = Object.values(anexos).reduce((acc, fs) => acc + fs.length, 0);
  const itensComAnexo = catalogoDoCasoTopo.filter((d) => (anexos[d.id] ?? []).length > 0).length;

  const anexar = (docId: string, lista: FileList | File[]) => {
    setAnexos({ ...anexos, [docId]: [...(anexos[docId] ?? []), ...Array.from(lista)] });
  };

  const remover = (docId: string, indice: number) => {
    const atuais = anexos[docId] ?? [];
    setAnexos({ ...anexos, [docId]: atuais.filter((_, i) => i !== indice) });
  };

  /** Card em que o arraste está pairando — realce do "solte aqui". */
  const [alvoDrop, setAlvoDrop] = useState<string | null>(null);

  /* A LISTA INTEIRA é zona de drop (I3): arrastar arquivos do computador
     sobre ela aciona o classificador local pelo nome e distribui cada um no
     item correspondente — o mesmo classificador do cofre da etapa 0. */
  const [dropGlobal, setDropGlobal] = useState(false);
  const soltarNaLista = (files: File[]) => {
    if (files.length === 0) return;
    const novo: AnexosProcesso = { ...anexos };
    const destinos = new Map<string, number>();
    for (const file of files) {
      const docId = classificarNoCatalogo('', file.name);
      novo[docId] = [...(novo[docId] ?? []), file];
      destinos.set(docId, (destinos.get(docId) ?? 0) + 1);
    }
    setAnexos(novo);
    const resumo = [...destinos.entries()]
      .map(([docId, n]) => {
        const titulo = CATALOGO_DOCUMENTOS.find((d) => d.id === docId)?.titulo ?? docId;
        return `${n}× ${titulo}`;
      })
      .join(' · ');
    toast.success(`${files.length} arquivo(s) distribuído(s) pelo nome`, {
      description: `${resumo}. Caiu no tópico errado? Arraste a miniatura para o card certo.`,
    });
  };

  /* Reenvio manual à nuvem de arquivos: tudo de uma vez ou um por um. */
  const [subindoTudo, setSubindoTudo] = useState(false);
  const [subindoUm, setSubindoUm] = useState<File | null>(null);
  const subirTudo = async () => {
    if (!onSubirNuvem) return;
    const todos = Object.values(anexos).flat();
    if (todos.length === 0) return;
    setSubindoTudo(true);
    try {
      const r = await onSubirNuvem(todos);
      if (r.falhas === 0) toast.success(`${r.ok} documento(s) na pasta do caso no seu ${nuvemNome} — tudo sincronizado.`);
      else toast.error(`${r.ok} subiram; ${r.falhas} falharam — tente de novo.`, { description: r.motivo });
    } finally {
      setSubindoTudo(false);
    }
  };
  const subirUm = async (file: File) => {
    if (!onSubirNuvem) return;
    setSubindoUm(file);
    try {
      const r = await onSubirNuvem([file]);
      if (r.falhas === 0) toast.success(`“${file.name}” está na pasta do caso no seu ${nuvemNome}.`);
      else toast.error(`Não consegui subir “${file.name}”.`, { description: r.motivo });
    } finally {
      setSubindoUm(null);
    }
  };

  /** Clique-e-arraste entre tópicos: move o anexo de um card para outro. */
  const moverAnexo = (deDocId: string, indice: number, paraDocId: string) => {
    if (deDocId === paraDocId) return;
    const origem = anexos[deDocId] ?? [];
    const file = origem[indice];
    if (!file) return;
    setAnexos({
      ...anexos,
      [deDocId]: origem.filter((_, i) => i !== indice),
      [paraDocId]: [...(anexos[paraDocId] ?? []), file],
    });
  };

  /**
   * MODO DRIVE: remover um anexo pode alcançar o arquivo no Google Drive do
   * usuário — ação destrutiva. Pedido do escritório: SEMPRE pedir uma
   * autorização A MAIS antes de excluir do Drive; o dialog abaixo oferece as
   * duas saídas (só do caso × caso + Drive). Fora do modo Drive, remove
   * direto, como sempre.
   */
  const pedirRemocao = (docId: string, indice: number, file: File) => {
    if (!modoDrive || !onExcluirDrive) {
      remover(docId, indice);
      return;
    }
    setErroExcluir(false);
    setExcluir({ docId, indice, file });
  };

  const itensOrdenados = () =>
    CATALOGO_DOCUMENTOS.map((d) => ({ titulo: d.titulo, arquivos: anexos[d.id] ?? [] })).filter(
      (i) => i.arquivos.length > 0,
    );

  const gerarUnificado = async () => {
    setGerando('pdf');
    setErro(null);
    setAvisos([]);
    try {
      const r = await montarPdfUnificado(itensOrdenados());
      setAvisos(r.avisos);
      baixarBlob(r.blob, `Processo${nomeCaso ? ` - ${nomeCaso}` : ''}.pdf`);
      onMontado?.('PDF_PROCESSO', totalAnexos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF unificado.');
    } finally {
      setGerando(null);
    }
  };

  const gerarIndividualizado = async () => {
    setGerando('zip');
    setErro(null);
    setAvisos([]);
    try {
      const r = await montarZipIndividualizado(itensOrdenados());
      setAvisos(r.avisos);
      baixarBlob(r.blob, `Processo${nomeCaso ? ` - ${nomeCaso}` : ''} (individualizado).zip`);
      onMontado?.('ZIP_PROCESSO', totalAnexos);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o ZIP.');
    } finally {
      setGerando(null);
    }
  };

  // Agrupa preservando a ordem do catálogo (que é a ordem do processo).
  // Sem cônjuge/companheiro(a) na sucessão, o grupo do supérstite nem abre
  // (anexo que porventura caiu lá continua acessível se o grupo reabrir).
  const grupos: { grupo: GrupoDocumento; docs: typeof CATALOGO_DOCUMENTOS }[] = [];
  for (const doc of catalogoDoCasoTopo) {
    const g = grupos.find((x) => x.grupo === doc.grupo);
    if (g) g.docs.push(doc);
    else grupos.push({ grupo: doc.grupo, docs: [doc] });
  }

  return (
    <>
      <h2>Documentos do processo</h2>
      <p className="subtitulo" style={{ marginBottom: 10 }}>
        O que o ITCMD-SP e o tabelionato exigem, na ordem de montagem. ARRASTE arquivos do
        computador sobre a lista — cada um cai no item correspondente pelo nome — ou anexe
        item a item; miniatura no tópico errado se arrasta para o certo. Passe o mouse no
        “?” para a descrição do documento.
      </p>
      <p className="progresso num">
        {itensComAnexo} de {catalogoDoCasoTopo.length} itens com anexo · {totalAnexos} arquivo(s)
      </p>

      {modoDrive && onSubirNuvem && totalAnexos > 0 && (
        <div className="escolha" style={{ alignItems: 'center', margin: '2px 0 14px' }}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={subindoTudo}
            onClick={() => void subirTudo()}
          >
            ☁ Subir tudo para a nuvem ({totalAnexos})
          </Button>
          <span className="fund">
            Reenvia TODOS os anexos para a pasta do caso no seu {nuvemNome} (nome repetido
            substitui — nada duplica). Use quando algum envio automático falhar; o ☁ de
            cada miniatura sobe um por vez.
          </span>
        </div>
      )}

      {/* Cada item do catálogo é UMA linha (I3): chip de status legível,
          título, "?" com a descrição e a ação discreta — os detalhes
          (miniaturas, envios do cofre) só abrem espaço quando existem. A
          LISTA INTEIRA aceita o arraste de arquivos do computador. */}
      <div
        className={`doc-drop-global${dropGlobal ? ' ativa' : ''}`}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          setDropGlobal(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDropGlobal(false);
        }}
        onDrop={(e) => {
          setDropGlobal(false);
          if (!e.dataTransfer.types.includes('Files')) return;
          e.preventDefault();
          soltarNaLista(Array.from(e.dataTransfer.files));
        }}
      >
        {dropGlobal && (
          <p className="doc-drop-aviso">
            Solte aqui: cada arquivo cai no item correspondente pelo nome.
          </p>
        )}
        {grupos.map(({ grupo, docs }) => {
          const comAnexo = docs.filter((d) => (anexos[d.id] ?? []).length > 0).length;
          return (
            <div key={grupo}>
              <span className="eyebrow">
                {ROTULO_GRUPO[grupo]}{' '}
                <span className="num contador-grupo">
                  {comAnexo} de {docs.length}
                </span>
              </span>
              <div className="doc-lista" style={{ marginBottom: 18 }}>
                {docs.map((doc) => {
                  const arquivos = anexos[doc.id] ?? [];
                  const envios = enviosDoCofre[doc.id] ?? [];
                  const tem = arquivos.length > 0;
                  return (
                    <div
                      className={`doc-linha${alvoDrop === doc.id ? ' solta-aqui' : ''}`}
                      key={doc.id}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes('application/x-anexo-caso')) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        setAlvoDrop(doc.id);
                      }}
                      onDragLeave={() => setAlvoDrop((atual) => (atual === doc.id ? null : atual))}
                      onDrop={(e) => {
                        const bruto = e.dataTransfer.getData('application/x-anexo-caso');
                        setAlvoDrop(null);
                        if (!bruto) return;
                        e.preventDefault();
                        e.stopPropagation();
                        try {
                          const { docId, indice } = JSON.parse(bruto) as { docId: string; indice: number };
                          moverAnexo(docId, indice, doc.id);
                        } catch {
                          // payload de outra origem — ignora
                        }
                      }}
                    >
                      <div className="doc-linha-cabeca">
                        <span className={`chip-doc ${tem ? 'ok' : 'falta'}`}>
                          {tem ? `${arquivos.length} anexado(s)` : 'falta'}
                        </span>
                        <h4 title={doc.descricao}>{doc.titulo}</h4>
                        <span className="doc-ajuda" title={doc.descricao} aria-label={doc.descricao}>
                          ?
                        </span>
                        <span className="doc-linha-fio" aria-hidden />
                        {onResponsavel && (
                          <ResponsavelDoc
                            doc={doc}
                            valor={responsaveis[doc.id] ?? ''}
                            onMudar={(v) => onResponsavel(doc.id, v)}
                            herdeiros={herdeirosCaso}
                            convites={convites}
                            onConviteAtualizado={onConviteAtualizado}
                          />
                        )}
                        <BotaoAnexar discreto onFiles={(lista) => anexar(doc.id, lista)} />
                      </div>
                      {envios.map((envio, i) => {
                        const idade = diasDesdeEmissao(envio.emitidaEm);
                        // Aprovar/recusar age no PEDIDO inteiro: com vários
                        // arquivos do mesmo pedido, só a última linha decide.
                        const decideAqui =
                          onConviteAtualizado !== undefined &&
                          !envios
                            .slice(i + 1)
                            .some((x) => x.token === envio.token && x.pedidoId === envio.pedidoId);
                        return (
                        <p className="anexo-linha cofre" key={`cofre-${envio.herdeiro}-${i}`}>
                          <span>
                            🔗 <strong>{envio.herdeiro}</strong> enviou pelo cofre:{' '}
                            <span className="num">{envio.nomeArquivo}</span>
                            {envio.tipoDetectado ? ` · lido como ${envio.tipoDetectado}` : ''} ·{' '}
                            {ROTULO_STATUS_PORTAL[envio.status] ?? envio.status}
                            {envio.arquivoTamanho ? (
                              <span className="num"> · {tamanhoLegivel(envio.arquivoTamanho)}</span>
                            ) : (
                              ' · arquivo com o herdeiro (peça por outro canal)'
                            )}
                            {idade !== null && idade > 90 && (
                              <span className="mono-alerta" style={{ display: 'block', marginTop: 2 }}>
                                Certidão possivelmente vencida: emissão lida em{' '}
                                {new Date(`${envio.emitidaEm}T12:00:00`).toLocaleDateString('pt-BR')}{' '}
                                ({idade} dias — validade comum: 90). Confira antes de aprovar.
                              </span>
                            )}
                          </span>
                          <AcoesEnvioCofre
                            envio={envio}
                            onAnexar={(file) => anexar(doc.id, [file])}
                            onSalvarNaPasta={onSalvarNaPasta}
                          />
                          {onConviteAtualizado && decideAqui && (
                            <AcoesConferencia envio={envio} onConviteAtualizado={onConviteAtualizado} />
                          )}
                        </p>
                        );
                      })}
                      {tem && (
                        <div className="doc-cards">
                          {arquivos.map((f, i) => (
                            <MiniaturaCard
                              key={`${f.name}-${i}`}
                              file={f}
                              onAbrir={() => setPreview(f)}
                              onRemover={() => pedirRemocao(doc.id, i, f)}
                              onNuvem={modoDrive && onSubirNuvem ? () => void subirUm(f) : undefined}
                              enviandoNuvem={subindoUm === f}
                              arrasto={{ docId: doc.id, indice: i }}
                              onFimArrasto={() => setAlvoDrop(null)}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <h2>Montar o processo</h2>
      <p className="subtitulo" style={{ marginBottom: 12 }}>
        Imagens viram página A4; PDFs entram como estão. A ordem é a do catálogo acima. As
        minutas (petições e escritura) têm aba própria na lombada, conforme o seu perfil.
      </p>
      <div className="escolha">
        <Button
          disabled={gerando !== null || totalAnexos === 0}
          loading={gerando === 'pdf'}
          onClick={gerarUnificado}
        >
          Gerar PDF unificado
        </Button>
        <Button
          variant="outline"
          disabled={gerando !== null || totalAnexos === 0}
          loading={gerando === 'zip'}
          onClick={gerarIndividualizado}
        >
          Baixar PDFs individualizados (ZIP)
        </Button>
      </div>
      {erro && <p className="mono-alerta">{erro}</p>}
      {avisos.map((a, i) => (
        <p key={i} className="mono-alerta">
          {a}
        </p>
      ))}

      <LupaPreview file={preview} onClose={() => setPreview(null)} />

      {/* AUTORIZAÇÃO EXTRA do modo Drive: excluir do app pode excluir do
          Google Drive do usuário — nunca sem este segundo aval. */}
      <Dialog
        open={excluir !== null}
        onOpenChange={(aberto) => {
          if (!aberto && !excluindoDrive) setExcluir(null);
        }}
      >
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Remover “{excluir?.file.name}”?</DialogTitle>
            <DialogDescription>
              Este caso vive no seu {nuvemNome}. Você pode tirar o documento só desta
              folha (o arquivo continua lá) — ou excluí-lo TAMBÉM do seu {nuvemNome},
              indo para a lixeira (recuperável por lá por um tempo).
            </DialogDescription>
          </DialogHeader>
          {erroExcluir && (
            <p className="mono-alerta">Não consegui excluir do {nuvemNome} — tente de novo.</p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={excluindoDrive}
              onClick={() => {
                if (excluir) remover(excluir.docId, excluir.indice);
                setExcluir(null);
              }}
            >
              Remover só do caso
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={excluindoDrive}
              onClick={() => {
                if (!excluir || !onExcluirDrive) return;
                setExcluindoDrive(true);
                setErroExcluir(false);
                void onExcluirDrive(excluir.file)
                  .then((ok) => {
                    if (!ok) {
                      setErroExcluir(true);
                      return;
                    }
                    remover(excluir.docId, excluir.indice);
                    setExcluir(null);
                  })
                  .finally(() => setExcluindoDrive(false));
              }}
            >
              Excluir também do meu {nuvemNome}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
