/**
 * Ambiente de documentos do processo — anexos por item do catálogo exigido
 * pelo ITCMD-SP/inventário, lupa de pré-visualização e a montagem final:
 * PDF unificado do processo ou ZIP com PDFs individualizados, tudo no
 * navegador (nenhum arquivo sai da máquina). Os arquivos lidos pelo cofre
 * da etapa 0 chegam aqui já classificados.
 */

import { useRef, useState } from 'react';
import { ZoomIn } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  CATALOGO_DOCUMENTOS,
  ROTULO_GRUPO,
  type GrupoDocumento,
} from '@/lib/partilha/documentos';
import { montarPdfUnificado, montarZipIndividualizado } from '@/lib/partilha/processo';
import { baixarBlob } from '@/lib/partilha/xlsx';
import { LupaPreview } from './preview';

export type AnexosProcesso = Record<string, File[]>;

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
  onGerarPeticao,
}: {
  anexos: AnexosProcesso;
  setAnexos: (a: AnexosProcesso) => void;
  nomeCaso: string;
  /** false esconde o grupo do cônjuge supérstite — sucessão sem essa parte. */
  temSobrevivente?: boolean;
  /** Gera a minuta de petição ao Tabelionato (.docx) a partir da folha. */
  onGerarPeticao?: () => Promise<void>;
}) {
  const [preview, setPreview] = useState<File | null>(null);
  const [gerando, setGerando] = useState<'pdf' | 'zip' | 'peticao' | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const catalogoDoCasoTopo = CATALOGO_DOCUMENTOS.filter(
    (doc) => temSobrevivente || doc.grupo !== 'SOBREVIVENTE',
  );
  const totalAnexos = Object.values(anexos).reduce((acc, fs) => acc + fs.length, 0);
  const itensComAnexo = catalogoDoCasoTopo.filter((d) => (anexos[d.id] ?? []).length > 0).length;

  const anexar = (docId: string, lista: FileList) => {
    setAnexos({ ...anexos, [docId]: [...(anexos[docId] ?? []), ...Array.from(lista)] });
  };

  const remover = (docId: string, indice: number) => {
    const atuais = anexos[docId] ?? [];
    setAnexos({ ...anexos, [docId]: atuais.filter((_, i) => i !== indice) });
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
        recebendo — o que a etapa 0 leu já chegou classificado — e, no final, gere o
        processo em PDF único ou individualizado. Os arquivos ficam só neste navegador.
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
                <div className="check-item" key={doc.id}>
                  <span className="prio">{arquivos.length > 0 ? '✓' : '·'}</span>
                  <div>
                    <h4>{doc.titulo}</h4>
                    <p>{doc.descricao}</p>
                    {arquivos.map((f, i) => (
                      <p className="anexo-linha" key={`${f.name}-${i}`}>
                        <span className="num">{f.name}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title={`Pré-visualizar ${f.name}`}
                          aria-label={`Pré-visualizar ${f.name}`}
                          onClick={() => setPreview(f)}
                        >
                          <ZoomIn className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => remover(doc.id, i)}
                        >
                          remover
                        </Button>
                      </p>
                    ))}
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
        Imagens viram página A4; PDFs entram como estão. A ordem é a do catálogo acima. A
        minuta de petição sai em DOCX editável, com a qualificação das partes, o plano de
        partilha fundamentado, o ITCMD e o rol dos documentos juntados.
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
        {onGerarPeticao && (
          <Button
            variant="outline"
            disabled={gerando !== null}
            loading={gerando === 'peticao'}
            onClick={async () => {
              setGerando('peticao');
              setErro(null);
              try {
                await onGerarPeticao();
              } catch (e) {
                setErro(e instanceof Error ? e.message : 'Falha ao gerar a minuta da petição.');
              } finally {
                setGerando(null);
              }
            }}
          >
            Gerar minuta de petição ao Tabelionato (DOCX)
          </Button>
        )}
      </div>
      {erro && <p className="mono-alerta">{erro}</p>}
      {avisos.map((a, i) => (
        <p key={i} className="mono-alerta">
          {a}
        </p>
      ))}

      <LupaPreview file={preview} onClose={() => setPreview(null)} />
    </>
  );
}
