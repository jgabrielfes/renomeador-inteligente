'use client';

/**
 * Jurimetria Registral — a tela da consulta.
 *
 * Modo TÍTULO: o arquivo é lido AQUI, no navegador (pdf/imagem via
 * lib/ocr.ts, docx via lib/office-texto.ts); a detecção de temas/ato/
 * cartório é local (motores puros) e ao servidor vai SÓ a estrutura.
 * Modo NAVEGAÇÃO: filtros por cartório/tema na query string (Links) — o
 * histórico filtrado chega renderizado do servidor.
 */

import Link from 'next/link';
import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { extrairTextoOffice, ehArquivoOffice } from '@/lib/office-texto';
import { anonimizar } from '@/lib/jurimetria/anonimizar';
import { analisarNotaDevolutiva, type AnaliseNota } from '@/lib/jurimetria/nota-analise';
import {
  detectarAtoTipo,
  detectarTemas,
  mencoesDeCartorio,
  TEMAS_LOCAIS,
} from '@/lib/jurimetria/temas-local';
import { resolverCartorio } from '@/lib/jurimetria/resolver';
import { ROTULO_VIA } from '@/lib/notas-rotulos';

import { consultarJurimetria, contribuirNota, type HistoricoJurimetria } from './actions';

interface Cartorio {
  id: string;
  nome: string;
  aliases: string[];
}
interface Tema {
  id: string;
  rotulo: string;
}

const ROTULO_ATO: Record<string, string> = {
  inventario: 'inventário',
  partilha: 'partilha',
  doacao: 'doação',
  divorcio: 'divórcio',
  compra_venda: 'compra e venda',
  outro: 'ato registral',
};

function Disclaimer() {
  return (
    <p className="lc-fund" style={{ marginTop: 'var(--e-4)' }}>
      O que esta tela mostra é <strong>histórico de entendimentos públicos</strong> (exigência
      registrada em decisões e orientações, com a fonte) — nunca previsão, recomendação ou
      garantia de como um cartório decidirá o seu caso.
    </p>
  );
}

function ListaExigencias({ historico }: { historico: HistoricoJurimetria }) {
  if (historico.exigencias.length === 0)
    return (
      <div className="lc-cartao" style={{ textAlign: 'center' }}>
        <p style={{ margin: 0 }}>
          Nada publicado ainda para este recorte — a base cresce com a coleta diária e a revisão
          humana. Volte em breve ou mude o filtro.
        </p>
      </div>
    );
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--e-3)' }}>
      {historico.exigencias.map((e, i) => (
        <li key={i} className="lc-cartao">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: 'var(--e-2)' }}>
            <Badge variant="outline">{e.cartorioNome}</Badge>
            {e.temaRotulo && <Badge variant="outline">{e.temaRotulo}</Badge>}
            <Badge variant="outline">{e.dataExigencia}</Badge>
            {e.resultado && e.resultado !== 'sem_julgamento' && (
              <Badge>{e.resultado === 'mantida' ? 'exigência mantida' : e.resultado === 'afastada' ? 'exigência afastada' : 'parcial'}</Badge>
            )}
          </div>
          <p style={{ margin: 0 }}>{e.texto}</p>
          {e.fundamentacao.length > 0 && (
            <p style={{ margin: 'var(--e-2) 0 0', fontSize: 'var(--t-sm)', opacity: 0.8 }}>
              Fundamentação citada: {e.fundamentacao.join(' · ')}
            </p>
          )}
          <p style={{ margin: 'var(--e-1) 0 0', fontSize: 'var(--t-xs)', opacity: 0.7 }}>
            Fonte: {e.fonteNome}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function JurimetriaClient({
  cartorios,
  temas,
  cartorioAtivo,
  temaAtivo,
  historico,
}: {
  cartorios: Cartorio[];
  temas: Tema[];
  cartorioAtivo: string | null;
  temaAtivo: string | null;
  historico: HistoricoJurimetria | null;
}) {
  const [lendo, setLendo] = useState(false);
  const [pendente, comecar] = useTransition();
  const [analise, setAnalise] = useState<{
    arquivo: string;
    ato: string;
    temas: string[];
    cartorioId: string | null;
    resultado: HistoricoJurimetria | null;
  } | null>(null);
  const [lendoNota, setLendoNota] = useState(false);
  const [nota, setNota] = useState<{
    arquivo: string;
    analise: AnaliseNota;
    cartorioId: string | null;
    resultado: HistoricoJurimetria | null;
    contribuida: boolean | null;
  } | null>(null);

  const lerArquivo = useCallback(async (file: File): Promise<string> => {
    if (ehArquivoOffice(file.name)) return extrairTextoOffice(file);
    const { readDocument } = await import('@/lib/ocr');
    return readDocument(file);
  }, []);

  const analisar = useCallback(
    async (file: File) => {
      setLendo(true);
      try {
        // FRONTEIRA DE DADOS: leitura 100% local — o arquivo não sai daqui.
        const texto = await lerArquivo(file);
        if (texto.trim().length < 80) {
          toast.error('Não consegui ler texto suficiente deste arquivo.');
          return;
        }
        const temasDetectados = detectarTemas(texto);
        const ato = detectarAtoTipo(texto);
        const cartorioId =
          mencoesDeCartorio(texto)
            .map((m) => resolverCartorio(m, cartorios))
            .find((id) => id !== null) ?? null;
        comecar(async () => {
          const r = await consultarJurimetria({ cartorioId, temas: temasDetectados });
          if (!r.ok) {
            toast.error(r.erro);
            return;
          }
          setAnalise({
            arquivo: file.name,
            ato: ROTULO_ATO[ato] ?? ato,
            temas: temasDetectados,
            cartorioId,
            resultado: r,
          });
        });
      } catch {
        toast.error('Falha ao ler o arquivo neste navegador.');
      } finally {
        setLendo(false);
      }
    },
    [cartorios, lerArquivo],
  );

  const analisarNota = useCallback(
    async (file: File) => {
      setLendoNota(true);
      try {
        // FRONTEIRA DE DADOS: leitura e decomposição 100% locais.
        const texto = await lerArquivo(file);
        if (texto.trim().length < 120) {
          toast.error('Não consegui ler texto suficiente desta nota.');
          return;
        }
        const a = analisarNotaDevolutiva(texto);
        if (a.itens.length === 0) {
          toast.error('Não reconheci exigências numeradas neste arquivo — é uma nota devolutiva?');
          return;
        }
        const cartorioId =
          a.mencoesCartorio.map((m) => resolverCartorio(m, cartorios)).find((id) => id !== null) ??
          null;
        setNota({ arquivo: file.name, analise: a, cartorioId, resultado: null, contribuida: null });
        comecar(async () => {
          const r = await consultarJurimetria({ cartorioId, temas: a.temas });
          if (r.ok) setNota((n) => (n ? { ...n, resultado: r } : n));
          // Contribuição AUTOMÁTICA (aviso fixo na tela): o que sai daqui é
          // o texto JÁ ANONIMIZADO no navegador — nunca a nota original.
          const { texto: anonimo } = anonimizar(texto);
          const c = await contribuirNota({ texto: anonimo, cartorioId });
          setNota((n) => (n ? { ...n, contribuida: c.ok ? c.recebida : false } : n));
        });
      } catch {
        toast.error('Falha ao ler o arquivo neste navegador.');
      } finally {
        setLendoNota(false);
      }
    },
    [cartorios, lerArquivo],
  );

  const baixarPdfNota = useCallback(async () => {
    if (!nota) return;
    const { montarRelatorioNotaPdf } = await import('@/lib/jurimetria/nota-pdf');
    const blob = await montarRelatorioNotaPdf(nota.analise, {
      cartorioNome: cartorios.find((c) => c.id === nota.cartorioId)?.nome ?? null,
      total: nota.resultado?.total ?? 0,
      porTema: nota.resultado?.porTema ?? [],
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'analise-nota-devolutiva.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }, [nota, cartorios]);

  const nomeCartorio = (id: string | null) => cartorios.find((c) => c.id === id)?.nome ?? null;
  const rotuloTemaLocal = (id: string) =>
    TEMAS_LOCAIS.find((t) => t.id === id)?.rotulo ?? temas.find((t) => t.id === id)?.rotulo ?? id;

  return (
    <main className="lc-miolo produto-jurimetria">
      <section className="lc-hero">
        <span className="lc-eyebrow">Jurimetria Registral</span>
        <h1>O histórico dos cartórios, antes do protocolo</h1>
        <p className="lc-sub">
          Arraste o título ou a minuta e veja o que os Registros de Imóveis registraram de
          exigência em atos parecidos — ou navegue por cartório e tema sem documento nenhum.
        </p>
      </section>

      {/* ---------------- modo 1: arrastar o título ---------------- */}
      <section className="lc-secao">
        <div
          className="lc-cartao"
          role="button"
          tabIndex={0}
          aria-label="Enviar título ou minuta para análise local"
          style={{ textAlign: 'center', borderStyle: 'dashed', cursor: 'pointer' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void analisar(f);
          }}
          onClick={() => document.getElementById('jurimetria-arquivo')?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ')
              document.getElementById('jurimetria-arquivo')?.click();
          }}
        >
          {lendo || pendente ? (
            <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Spinner /> lendo o documento no seu navegador…
            </p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Solte aqui o título ou a minuta (PDF, DOCX ou foto)</h3>
              <p style={{ margin: 0 }}>
                A leitura acontece <strong>no seu navegador</strong> — o documento não é enviado a
                lugar nenhum; a consulta manda só o tipo de ato, o cartório e os temas detectados.
              </p>
            </>
          )}
          <input
            id="jurimetria-arquivo"
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void analisar(f);
              e.target.value = '';
            }}
          />
        </div>

        {analise && (
          <div className="lc-cartao" style={{ marginTop: 'var(--e-4)' }}>
            <span className="lc-eyebrow">Análise local de {analise.arquivo}</span>
            <p style={{ margin: 'var(--e-2) 0' }}>
              Ato detectado: <strong>{analise.ato}</strong>
              {' · '}Cartório:{' '}
              <strong>{nomeCartorio(analise.cartorioId) ?? 'não identificado no texto'}</strong>
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: 'var(--e-3)' }}>
              {analise.temas.length === 0 ? (
                <Badge variant="outline">nenhum tema registral detectado</Badge>
              ) : (
                analise.temas.map((t) => <Badge key={t}>{rotuloTemaLocal(t)}</Badge>)
              )}
            </div>
            {analise.resultado && (
              <>
                <p style={{ margin: '0 0 var(--e-3)' }}>
                  Histórico publicado para este recorte:{' '}
                  <strong>{analise.resultado.total} exigência(s)</strong>
                  {analise.resultado.porTema.length > 0 && (
                    <>
                      {' — temas mais frequentes: '}
                      {analise.resultado.porTema
                        .slice(0, 3)
                        .map((t) => `${t.rotulo} (${t.n})`)
                        .join(', ')}
                    </>
                  )}
                </p>
                <ListaExigencias historico={analise.resultado} />
              </>
            )}
            <Disclaimer />
          </div>
        )}
      </section>

      {/* ---------------- nota devolutiva: entregável + contribuição ---------------- */}
      <section className="lc-secao">
        <h2>Recebi uma nota devolutiva</h2>
        <div
          className="lc-cartao"
          role="button"
          tabIndex={0}
          aria-label="Enviar nota devolutiva para análise local"
          style={{ textAlign: 'center', borderStyle: 'dashed', cursor: 'pointer' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void analisarNota(f);
          }}
          onClick={() => document.getElementById('jurimetria-nota')?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ')
              document.getElementById('jurimetria-nota')?.click();
          }}
        >
          {lendoNota ? (
            <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Spinner /> decompondo a nota no seu navegador…
            </p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>Solte aqui a nota devolutiva (PDF, DOCX ou foto)</h3>
              <p style={{ margin: 0 }}>
                Você recebe na hora a nota decomposta exigência a exigência, com a via de solução
                sugerida, o histórico do cartório e o relatório em PDF. Em troca, o texto —{' '}
                <strong>anonimizado no seu navegador antes de sair da sua máquina</strong> — alimenta
                a base coletiva de jurimetria (nomes, CPFs e matrículas nunca sobem).
              </p>
            </>
          )}
          <input
            id="jurimetria-nota"
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void analisarNota(f);
              e.target.value = '';
            }}
          />
        </div>

        {nota && (
          <div className="lc-cartao" style={{ marginTop: 'var(--e-4)' }}>
            <span className="lc-eyebrow">Nota decomposta — {nota.arquivo}</span>
            <p style={{ margin: 'var(--e-2) 0' }}>
              <strong>{nota.analise.itens.length} exigência(s)</strong>
              {' · '}Cartório:{' '}
              <strong>{nomeCartorio(nota.cartorioId) ?? 'não identificado no texto'}</strong>
            </p>
            <ol style={{ margin: 0, paddingLeft: '1.2em', display: 'grid', gap: 'var(--e-3)' }}>
              {nota.analise.itens.map((item, i) => (
                <li key={i}>
                  <p style={{ margin: 0, fontWeight: 600 }}>{item.rotulo || item.texto.slice(0, 90)}</p>
                  <p style={{ margin: 'var(--e-1) 0 0' }}>{item.texto}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: 'var(--e-1)' }}>
                    <Badge>{ROTULO_VIA[item.via] ?? item.via}</Badge>
                    {item.temas.map((t) => (
                      <Badge key={t} variant="outline">{rotuloTemaLocal(t)}</Badge>
                    ))}
                  </div>
                  {item.nota && (
                    <p style={{ margin: 'var(--e-1) 0 0', fontSize: 'var(--t-sm)', opacity: 0.8 }}>
                      {item.nota}
                    </p>
                  )}
                </li>
              ))}
            </ol>
            {nota.resultado && (
              <p style={{ margin: 'var(--e-3) 0 0' }}>
                Histórico publicado nos temas desta nota
                {nota.cartorioId ? ' (neste cartório)' : ''}:{' '}
                <strong>{nota.resultado.total} exigência(s)</strong>
                {nota.resultado.porTema.length > 0 && (
                  <> — {nota.resultado.porTema.slice(0, 3).map((t) => `${t.rotulo} (${t.n})`).join(', ')}</>
                )}
              </p>
            )}
            <div className="lc-acoes" style={{ marginTop: 'var(--e-3)' }}>
              <Button type="button" onClick={() => void baixarPdfNota()}>
                Baixar relatório (PDF)
              </Button>
            </div>
            <p style={{ margin: 'var(--e-2) 0 0', fontSize: 'var(--t-xs)', opacity: 0.75 }}>
              {nota.contribuida === null
                ? 'Enviando a versão anonimizada para a base coletiva…'
                : nota.contribuida
                  ? 'Obrigado! A versão anonimizada desta nota entrou na fila da base coletiva (passa por extração e revisão antes de publicar).'
                  : 'A versão anonimizada desta nota já constava da base — nada foi duplicado.'}
            </p>
            <Disclaimer />
          </div>
        )}
      </section>

      {/* ---------------- modo 2: navegação por cartório × tema ---------------- */}
      <section className="lc-secao">
        <h2>Navegar pelo histórico</h2>
        <p style={{ marginTop: 0 }}>
          Cartório:{' '}
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px' }}>
            <FiltroLink ativo={!cartorioAtivo} href={hrefFiltro(null, temaAtivo)} rotulo="todos" />
            {cartorios.map((c) => (
              <FiltroLink
                key={c.id}
                ativo={cartorioAtivo === c.id}
                href={hrefFiltro(c.id, temaAtivo)}
                rotulo={c.nome.replace(' de São Paulo/SP', '')}
              />
            ))}
          </span>
        </p>
        <p>
          Tema:{' '}
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px' }}>
            <FiltroLink ativo={!temaAtivo} href={hrefFiltro(cartorioAtivo, null)} rotulo="todos" />
            {temas.map((t) => (
              <FiltroLink
                key={t.id}
                ativo={temaAtivo === t.id}
                href={hrefFiltro(cartorioAtivo, t.id)}
                rotulo={t.rotulo}
              />
            ))}
          </span>
        </p>

        {historico ? (
          <>
            <p>
              <strong>{historico.total}</strong> exigência(s) publicada(s) neste recorte.
            </p>
            <ListaExigencias historico={historico} />
          </>
        ) : (
          <div className="lc-cartao">
            <p style={{ margin: 0 }}>Não consegui carregar o histórico agora — recarregue a página.</p>
          </div>
        )}
        <Disclaimer />
      </section>
    </main>
  );
}

function hrefFiltro(cartorio: string | null, tema: string | null): string {
  const q = new URLSearchParams();
  if (cartorio) q.set('cartorio', cartorio);
  if (tema) q.set('tema', tema);
  const s = q.toString();
  return s ? `/jurimetria?${s}` : '/jurimetria';
}

function FiltroLink({ ativo, href, rotulo }: { ativo: boolean; href: string; rotulo: string }) {
  return (
    <Button
      variant={ativo ? 'default' : 'outline'}
      size="sm"
      nativeButton={false}
      render={<Link href={href} />}
    >
      {rotulo}
    </Button>
  );
}
