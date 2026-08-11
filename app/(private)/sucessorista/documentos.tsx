/**
 * Ambiente de documentos do acervo — anexos por item do catálogo exigido
 * pelo ITCMD-SP/inventário, lupa de pré-visualização e a montagem final:
 * PDF unificado do processo ou ZIP com PDFs individualizados, tudo no
 * navegador (nenhum arquivo sai da máquina).
 */

import { useState } from 'react';
import {
  CATALOGO_DOCUMENTOS,
  ROTULO_GRUPO,
  type GrupoDocumento,
} from '@/lib/partilha/documentos';
import { montarPdfUnificado, montarZipIndividualizado } from '@/lib/partilha/processo';
import { baixarBlob } from '@/lib/partilha/xlsx';
import { LupaPreview } from './preview';

/** Alias estrutural — compatível com o ChangeEvent de input file. */
type Ev = { target: { value: string; files?: FileList | null; checked?: boolean } };

export type AnexosProcesso = Record<string, File[]>;

export function DocumentosView({
  anexos,
  setAnexos,
  nomeCaso,
}: {
  anexos: AnexosProcesso;
  setAnexos: (a: AnexosProcesso) => void;
  nomeCaso: string;
}) {
  const [preview, setPreview] = useState<File | null>(null);
  const [gerando, setGerando] = useState<'pdf' | 'zip' | null>(null);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const totalAnexos = Object.values(anexos).reduce((acc, fs) => acc + fs.length, 0);
  const itensComAnexo = CATALOGO_DOCUMENTOS.filter((d) => (anexos[d.id] ?? []).length > 0).length;

  const anexar = (docId: string, lista: FileList | null) => {
    if (!lista || lista.length === 0) return;
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
  const grupos: { grupo: GrupoDocumento; docs: typeof CATALOGO_DOCUMENTOS }[] = [];
  for (const doc of CATALOGO_DOCUMENTOS) {
    const g = grupos.find((x) => x.grupo === doc.grupo);
    if (g) g.docs.push(doc);
    else grupos.push({ grupo: doc.grupo, docs: [doc] });
  }

  return (
    <>
      <h2>Documentos do processo</h2>
      <p className="subtitulo" style={{ marginBottom: 10 }}>
        O que o ITCMD-SP e o tabelionato exigem, na ordem de montagem. Anexe conforme for
        recebendo (inclusive o que chegar pelo cofre de documentos) e, no final, gere o
        processo em PDF único ou individualizado. Os arquivos ficam só neste navegador.
      </p>
      <p className="progresso num">
        {itensComAnexo} de {CATALOGO_DOCUMENTOS.length} itens com anexo · {totalAnexos} arquivo(s)
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
                        <button
                          type="button"
                          className="lupa"
                          title={`Pré-visualizar ${f.name}`}
                          aria-label={`Pré-visualizar ${f.name}`}
                          onClick={() => setPreview(f)}
                        >
                          🔍
                        </button>
                        <button type="button" className="remover" onClick={() => remover(doc.id, i)}>
                          remover
                        </button>
                      </p>
                    ))}
                    <label className="anexar">
                      + anexar arquivo(s)
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp"
                        onChange={(e: Ev) => {
                          anexar(doc.id, e.target.files ?? null);
                          e.target.value = '';
                        }}
                      />
                    </label>
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
        Imagens viram página A4; PDFs entram como estão. A ordem é a do catálogo acima.
      </p>
      <div className="escolha">
        <button
          className="acao"
          disabled={gerando !== null || totalAnexos === 0}
          onClick={gerarUnificado}
        >
          {gerando === 'pdf' ? 'Gerando PDF…' : 'Gerar PDF unificado'}
        </button>
        <button
          className="acao fantasma"
          disabled={gerando !== null || totalAnexos === 0}
          onClick={gerarIndividualizado}
        >
          {gerando === 'zip' ? 'Gerando ZIP…' : 'Baixar PDFs individualizados (ZIP)'}
        </button>
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
