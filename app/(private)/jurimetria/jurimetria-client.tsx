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
import {
  detectarAtoTipo,
  detectarTemas,
  mencoesDeCartorio,
  TEMAS_LOCAIS,
} from '@/lib/jurimetria/temas-local';
import { resolverCartorio } from '@/lib/jurimetria/resolver';

import { consultarJurimetria, type HistoricoJurimetria } from './actions';

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

  const analisar = useCallback(
    async (file: File) => {
      setLendo(true);
      try {
        // FRONTEIRA DE DADOS: leitura 100% local — o arquivo não sai daqui.
        let texto = '';
        if (ehArquivoOffice(file.name)) texto = await extrairTextoOffice(file);
        else {
          const { readDocument } = await import('@/lib/ocr');
          texto = await readDocument(file);
        }
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
    [cartorios],
  );

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
