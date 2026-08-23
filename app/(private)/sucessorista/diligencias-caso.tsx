'use client';

/**
 * Diligências do CASO (camada 4, pilar B) — a ponte da aba Documentos com a
 * rede de correspondentes: o dialog "Solicitar diligência" monta a PASTA
 * isolada com os anexos SELECIONADOS do caso (só eles circulam — o
 * correspondente nunca vê o resto), e os relatórios entregues voltam para o
 * card certo do catálogo com o nome padronizado
 * ("AAAA-MM-DD - Tipo - Município-UF"), como os envios do cofre.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/date-input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { CATALOGO_DOCUMENTOS, classificarNoCatalogo } from '@/lib/partilha/documentos';
import type { Municipio } from '@/lib/rede/municipios';
import {
  nomePadronizadoRelatorio,
  ROTULO_STATUS_DILIGENCIA,
  ROTULO_TIPO_DILIGENCIA,
  TIPOS_DILIGENCIA,
} from '@/lib/rede/diligencias';
import { ComarcaAutocomplete } from '../diligencias/comarca-autocomplete';
import {
  buscarComarcas,
  diligenciasDoCaso,
  type ArquivoDaPasta,
  type DiligenciaResumo,
} from '../diligencias/diligencias-actions';
import type { AnexosProcesso } from './documentos';

const MAX_ARQUIVO = 3_500_000;
const MAX_ARQUIVOS = 10;

const TITULO_DOC = new Map(CATALOGO_DOCUMENTOS.map((d) => [d.id, d.titulo]));

/** Puxa UM arquivo do relatório para o caso com o nome padronizado. */
function AcoesRelatorio({
  diligencia,
  arquivo,
  onAnexar,
}: {
  diligencia: DiligenciaResumo;
  arquivo: ArquivoDaPasta;
  onAnexar: (docId: string, file: File) => void;
}) {
  const [agindo, setAgindo] = useState(false);
  const [anexado, setAnexado] = useState(false);
  const nomeFinal = nomePadronizadoRelatorio(diligencia, arquivo.em, arquivo.nome);

  const puxar = async () => {
    setAgindo(true);
    try {
      const r = await fetch(`/api/diligencias/${diligencia.id}/arquivo?arquivo=${arquivo.id}`);
      if (!r.ok) {
        toast.error('Não foi possível baixar o arquivo do relatório.');
        return;
      }
      const blob = await r.blob();
      const file = new File([blob], nomeFinal, { type: blob.type });
      // O mesmo classificador do arraste decide o card; sem casa, "outros".
      const docId = classificarNoCatalogo('', nomeFinal) || 'outros';
      onAnexar(docId, file);
      setAnexado(true);
      toast.success(`“${nomeFinal}” anexado em ${TITULO_DOC.get(docId) ?? 'Outros'}.`);
    } catch {
      toast.error('Não foi possível baixar o arquivo do relatório.');
    } finally {
      setAgindo(false);
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
      <a href={`/api/diligencias/${diligencia.id}/arquivo?arquivo=${arquivo.id}`}>{arquivo.nome}</a>
      {anexado ? (
        <span className="fund">anexado ao caso ✓</span>
      ) : (
        <Button type="button" variant="ghost" size="sm" loading={agindo} onClick={() => void puxar()}>
          anexar ao caso
        </Button>
      )}
    </span>
  );
}

export function DiligenciasCaso({
  casoId,
  anexos,
  onAnexar,
  municipioSugestao,
}: {
  casoId: string;
  anexos: AnexosProcesso;
  /** O relatório entra no card do catálogo como um anexo normal do caso. */
  onAnexar: (docId: string, file: File) => void;
  /** Município do imóvel do acervo — pré-preenche a comarca do dialog. */
  municipioSugestao?: string;
}) {
  const [lista, setLista] = useState<(DiligenciaResumo & { arquivos: ArquivoDaPasta[] })[] | null>(null);
  const [aberto, setAberto] = useState(false);
  const [comarca, setComarca] = useState<Municipio | null>(null);
  const [tipo, setTipo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [prazo, setPrazo] = useState('');
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [criando, setCriando] = useState(false);

  const carregar = () => {
    void diligenciasDoCaso(casoId).then((r) => {
      if (r.ok) setLista(r.diligencias);
    });
  };
  // Uma carga por caso aberto — a lista revalida após cada solicitação.
  useEffect(carregar, [casoId]);

  // Anexos do caso elegíveis à pasta (respeitando o teto por arquivo).
  const candidatos = CATALOGO_DOCUMENTOS.flatMap((doc) =>
    (anexos[doc.id] ?? []).map((file, i) => ({
      chave: `${doc.id}:${i}`,
      titulo: doc.titulo,
      file,
      grande: file.size > MAX_ARQUIVO,
    })),
  );

  const abrirDialog = () => {
    setAberto(true);
    setSelecionados(new Set());
    // Comarca sugerida pelo município do imóvel — o servidor resolve o IBGE.
    if (!comarca && municipioSugestao) {
      void buscarComarcas(municipioSugestao).then((ms) => {
        if (ms.length > 0) setComarca(ms[0]);
      });
    }
  };

  const solicitar = async () => {
    if (!comarca) return;
    setCriando(true);
    try {
      const fd = new FormData();
      fd.set('casoId', casoId);
      fd.set('comarcaIbge', String(comarca.ibge));
      fd.set('tipo', tipo);
      fd.set('descricao', descricao);
      if (prazo) fd.set('prazoEm', prazo);
      for (const c of candidatos) {
        if (selecionados.has(c.chave)) fd.append('arquivos', c.file);
      }
      const r = await fetch('/api/diligencias', { method: 'POST', body: fd });
      const corpo = (await r.json().catch(() => null)) as { erro?: string } | null;
      if (!r.ok) {
        toast.error(corpo?.erro ?? 'Não foi possível solicitar.');
        return;
      }
      toast.success('Diligência publicada aos correspondentes da comarca — acompanhe em Diligências.');
      setAberto(false);
      setTipo('');
      setDescricao('');
      setPrazo('');
      carregar();
    } finally {
      setCriando(false);
    }
  };

  return (
    <>
      <h2>Diligências a distância</h2>
      <p className="subtitulo" style={{ marginBottom: 12 }}>
        Precisa de um ato em outra comarca — retirar certidão, protocolo, cartório?
        Publique aos correspondentes verificados: só os anexos que você SELECIONAR
        formam a pasta da diligência (o restante do caso nunca circula), e o
        relatório entregue volta para o card certo com nome padronizado.{' '}
        <Link href="/diligencias">Ver todas as minhas diligências →</Link>
      </p>
      <div className="escolha" style={{ marginBottom: 12 }}>
        <Button type="button" variant="outline" onClick={abrirDialog}>
          Solicitar diligência
        </Button>
      </div>
      {lista !== null && lista.length > 0 && (
        <div style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          {lista.map((d) => (
            <div key={d.id} className="nota" style={{ margin: 0 }}>
              <p style={{ margin: 0 }}>
                <strong>{ROTULO_TIPO_DILIGENCIA[d.tipo] ?? d.tipo}</strong> — {d.municipio}/{d.uf} ·{' '}
                {ROTULO_STATUS_DILIGENCIA[d.status] ?? d.status}
              </p>
              {d.arquivos.length > 0 && (
                <div style={{ display: 'grid', gap: 4, marginTop: 4 }}>
                  {d.arquivos.map((a) => (
                    <p key={a.id} className="fund" style={{ margin: 0 }}>
                      📄 <AcoesRelatorio diligencia={d} arquivo={a} onAnexar={onAnexar} />
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={aberto} onOpenChange={(v) => !criando && setAberto(v)}>
        <DialogContent className="sucessorista">
          <DialogHeader>
            <DialogTitle>Solicitar diligência deste caso</DialogTitle>
            <DialogDescription>
              Publicada aos correspondentes verificados da comarca (e mesma UF). A
              pasta leva SÓ os anexos marcados abaixo — é tudo o que o(a) colega verá.
            </DialogDescription>
          </DialogHeader>
          <div className="campo">
            Comarca
            {comarca ? (
              <p style={{ margin: '4px 0' }}>
                <strong>{comarca.nome}/{comarca.uf}</strong>{' '}
                <Button size="sm" variant="ghost" onClick={() => setComarca(null)}>trocar</Button>
              </p>
            ) : (
              <ComarcaAutocomplete onEscolher={setComarca} />
            )}
          </div>
          <label className="campo">
            Tipo
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              <option value="">Selecione…</option>
              {TIPOS_DILIGENCIA.map((t) => (
                <option key={t.id} value={t.id}>{t.rotulo}</option>
              ))}
            </select>
          </label>
          <label className="campo">
            O que precisa ser feito ({descricao.length}/1200)
            <Textarea rows={3} maxLength={1200} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>
          <label className="campo" style={{ maxWidth: 220 }}>
            Prazo desejado
            <DateInput value={prazo} onChange={setPrazo} />
          </label>
          <div className="campo">
            Anexos do caso que formam a pasta ({selecionados.size}/{MAX_ARQUIVOS})
            {candidatos.length === 0 && (
              <p className="fund" style={{ margin: '4px 0' }}>
                Nenhum anexo no caso ainda — dá para solicitar sem pasta.
              </p>
            )}
            <div style={{ display: 'grid', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
              {candidatos.map((c) => (
                <label key={c.chave} className="marcar" style={{ fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={selecionados.has(c.chave)}
                    disabled={c.grande || (!selecionados.has(c.chave) && selecionados.size >= MAX_ARQUIVOS)}
                    onChange={(e) =>
                      setSelecionados((prev) => {
                        const novo = new Set(prev);
                        if (e.target.checked) novo.add(c.chave);
                        else novo.delete(c.chave);
                        return novo;
                      })
                    }
                  />
                  {c.file.name} <span className="fund">({c.titulo}{c.grande ? ' — acima de 3,5 MB, fora do teto' : ''})</span>
                </label>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={criando} onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button
              loading={criando}
              disabled={!comarca || !tipo || descricao.trim().length < 10}
              onClick={() => void solicitar()}
            >
              Publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
