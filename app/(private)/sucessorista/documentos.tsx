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
  CATALOGO_DOCUMENTOS,
  ROTULO_GRUPO,
  type GrupoDocumento,
} from '@/lib/partilha/documentos';
import { montarPdfUnificado, montarZipIndividualizado } from '@/lib/partilha/processo';
import { baixarBlob } from '@/lib/partilha/xlsx';
import type { ConviteHerdeiro } from '@/lib/portal/store';
import { LupaPreview } from './preview';

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
  nomeArquivo: string;
  tipoDetectado?: string;
  status: string;
  /** Arquivo REAL guardado pelo portal — habilita baixar/anexar ao caso. */
  arquivoId?: string;
  arquivoTamanho?: number;
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
  arrasto,
  onFimArrasto,
}: {
  file: File;
  onAbrir: () => void;
  onRemover: () => void;
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
      <figcaption className="doc-card-nome num" title={file.name}>
        {file.name}
      </figcaption>
    </figure>
  );
}

function BotaoAnexar({ onFiles }: { onFiles: (lista: FileList) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <span style={{ display: 'inline-block', marginTop: 8 }}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full"
        onClick={() => ref.current?.click()}
      >
        + anexar arquivo(s)
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

export function DocumentosView({
  anexos,
  setAnexos,
  nomeCaso,
  temSobrevivente = true,
  rito = null,
  convites = {},
  onSalvarNaPasta,
  modoDrive = false,
  onExcluirDrive,
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
  /** Modo pasta: grava o envio do cofre em "Recebidos do cofre/" do caso. */
  onSalvarNaPasta?: (file: File) => Promise<boolean>;
  /** true = os anexos deste caso vivem no Google Drive do usuário. */
  modoDrive?: boolean;
  /** Exclui o documento do Drive (chamado SÓ após a autorização extra). */
  onExcluirDrive?: (file: File) => Promise<boolean>;
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
      const docId = CATALOGO_DO_PEDIDO_PORTAL[d.id] ?? 'outros';
      (enviosDoCofre[docId] ??= []).push({
        herdeiro: convite.nomeHerdeiro,
        nomeArquivo: d.nomeArquivo,
        tipoDetectado: d.tipoDetectado,
        status: d.status,
        arquivoId: d.arquivoId,
        arquivoTamanho: d.arquivoTamanho,
      });
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
        O que o ITCMD-SP e o tabelionato exigem, na ordem de montagem. Anexe conforme for
        recebendo — o que a etapa 0 leu já chegou classificado — e, se algo caiu no tópico
        errado, ARRASTE a miniatura para o card certo. No final, gere o processo em PDF
        único ou individualizado.
      </p>
      <p className="progresso num">
        {itensComAnexo} de {catalogoDoCasoTopo.length} itens com anexo · {totalAnexos} arquivo(s)
      </p>

      {grupos.map(({ grupo, docs }) => (
        <div key={grupo}>
          <span className="eyebrow">{ROTULO_GRUPO[grupo]}</span>
          <div className="check" style={{ marginBottom: 18 }}>
            {docs.map((doc) => {
              const arquivos = anexos[doc.id] ?? [];
              return (
                <div
                  className={`check-item${alvoDrop === doc.id ? ' solta-aqui' : ''}`}
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
                    try {
                      const { docId, indice } = JSON.parse(bruto) as { docId: string; indice: number };
                      moverAnexo(docId, indice, doc.id);
                    } catch {
                      // payload de outra origem — ignora
                    }
                  }}
                >
                  <span className="prio">{arquivos.length > 0 ? '✓' : '·'}</span>
                  <div>
                    <h4>{doc.titulo}</h4>
                    <p>{doc.descricao}</p>
                    {(enviosDoCofre[doc.id] ?? []).map((envio, i) => (
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
                        </span>
                        <AcoesEnvioCofre
                          envio={envio}
                          onAnexar={(file) => anexar(doc.id, [file])}
                          onSalvarNaPasta={onSalvarNaPasta}
                        />
                      </p>
                    ))}
                    {arquivos.length > 0 && (
                      <div className="doc-cards">
                        {arquivos.map((f, i) => (
                          <MiniaturaCard
                            key={`${f.name}-${i}`}
                            file={f}
                            onAbrir={() => setPreview(f)}
                            onRemover={() => pedirRemocao(doc.id, i, f)}
                            arrasto={{ docId: doc.id, indice: i }}
                            onFimArrasto={() => setAlvoDrop(null)}
                          />
                        ))}
                      </div>
                    )}
                    <BotaoAnexar onFiles={(lista) => anexar(doc.id, lista)} />
                  </div>
                  <span />
                </div>
              );
            })}
          </div>
        </div>
      ))}

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
              Este caso vive no seu Google Drive. Você pode tirar o documento só desta
              folha (o arquivo continua no Drive) — ou excluí-lo TAMBÉM do seu Google
              Drive, indo para a lixeira do Google (recuperável por lá por 30 dias).
            </DialogDescription>
          </DialogHeader>
          {erroExcluir && (
            <p className="mono-alerta">Não consegui excluir do Drive — tente de novo.</p>
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
              Excluir também do meu Drive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
