'use client';

/**
 * Jurimetria Registral — a tela da consulta, TEMA-PRIMEIRO.
 *
 * O usuário chega com um problema: a lista de temas (A–Z, itens recolhidos)
 * abre pela query string e mostra as decisões da mais recente para a mais
 * antiga; dentro do tema, o cruzamento com o Registro de Imóveis escolhido
 * traz o RESUMO em percentuais das dúvidas julgadas (exigência afastada =
 * dúvida improcedente = êxito do apresentante).
 *
 * Abaixo, o modo DOCUMENTOS: título + complementares são lidos JUNTOS, aqui
 * no navegador (pdf/imagem via lib/ocr.ts, docx via lib/office-texto.ts); a
 * detecção de temas/ato/cartório é local e ao servidor vai SÓ a estrutura.
 * Por último, o depósito de notas devolutivas (entregável + contribuição).
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
  n: number;
}

const ROTULO_ATO: Record<string, string> = {
  inventario: 'inventário',
  partilha: 'partilha',
  doacao: 'doação',
  divorcio: 'divórcio',
  compra_venda: 'compra e venda',
  outro: 'ato registral',
};

const ROTULO_RESULTADO: Record<string, string> = {
  mantida: 'exigência mantida (dúvida procedente)',
  afastada: 'exigência afastada — êxito do apresentante',
  parcial: 'parcialmente mantida',
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

/**
 * O resumo do cruzamento tema × cartório: percentuais SÓ sobre as dúvidas
 * julgadas, com a projeção sempre amarrada à linguagem de histórico.
 */
function ResumoCruzamento({
  historico,
  recorte,
}: {
  historico: HistoricoJurimetria;
  recorte: string;
}) {
  const r = historico.porResultado;
  const julgadas = r.mantidas + r.afastadas + r.parciais;
  const pct = (n: number) => Math.round((n / julgadas) * 100);
  return (
    <div className="lc-cartao" style={{ marginBottom: 'var(--e-3)' }}>
      <span className="lc-eyebrow">Resumo do recorte — {recorte}</span>
      <p style={{ margin: 'var(--e-2) 0 0' }}>
        <strong>{historico.total}</strong> exigência(s) publicada(s)
        {julgadas > 0 ? (
          <>
            , das quais <strong>{julgadas}</strong> vieram de dúvidas registrais{' '}
            <strong>julgadas</strong>:
          </>
        ) : (
          <>
            . Ainda não há dúvida registral julgada publicada neste recorte — os percentuais
            aparecem quando houver julgamento.
          </>
        )}
      </p>
      {julgadas > 0 && (
        <>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 'var(--e-3) 0 0',
              display: 'grid',
              gap: 'var(--e-2)',
            }}
          >
            <li>
              <strong style={{ fontSize: 'var(--t-lg)' }}>{pct(r.afastadas)}%</strong> — exigência
              afastada: a dúvida foi julgada <strong>improcedente</strong> e o apresentante obteve
              êxito ({r.afastadas} caso{r.afastadas === 1 ? '' : 's'})
            </li>
            <li>
              <strong style={{ fontSize: 'var(--t-lg)' }}>{pct(r.mantidas)}%</strong> — exigência
              mantida: a dúvida foi julgada procedente e o entendimento do oficial prevaleceu (
              {r.mantidas} caso{r.mantidas === 1 ? '' : 's'})
            </li>
            {r.parciais > 0 && (
              <li>
                <strong style={{ fontSize: 'var(--t-lg)' }}>{pct(r.parciais)}%</strong> —
                parcialmente mantida ({r.parciais} caso{r.parciais === 1 ? '' : 's'})
              </li>
            )}
          </ul>
          <p style={{ margin: 'var(--e-3) 0 0', fontSize: 'var(--t-sm)' }}>
            <strong>Projeção pelo histórico:</strong> se os próximos casos deste recorte se
            comportarem como os já julgados, cerca de {pct(r.afastadas)}% das impugnações
            terminariam favoráveis ao apresentante — é estatística do passado, nunca promessa
            sobre o seu caso.
          </p>
        </>
      )}
      {r.semJulgamento > 0 && (
        <p style={{ margin: 'var(--e-2) 0 0', fontSize: 'var(--t-sm)', opacity: 0.8 }}>
          As demais {r.semJulgamento} exigência(s) vêm de notas devolutivas e orientações sem
          julgamento — mostram o que o cartório costuma exigir, não quem prevaleceu.
        </p>
      )}
    </div>
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
              <Badge>{ROTULO_RESULTADO[e.resultado] ?? e.resultado}</Badge>
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
  totalPublicado,
  semTemaN,
  cartorioAtivo,
  temaAtivo,
  historico,
}: {
  cartorios: Cartorio[];
  temas: Tema[];
  totalPublicado: number;
  semTemaN: number;
  cartorioAtivo: string | null;
  temaAtivo: string | null;
  historico: HistoricoJurimetria | null;
}) {
  const [lendo, setLendo] = useState(false);
  const [pendente, comecar] = useTransition();
  const [analise, setAnalise] = useState<{
    arquivos: string[];
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
    async (files: File[]) => {
      const lote = files.slice(0, 8);
      if (lote.length === 0) return;
      setLendo(true);
      try {
        // FRONTEIRA DE DADOS: leitura 100% local — os arquivos não saem daqui.
        // O primeiro arquivo é o TÍTULO; os demais, complementares (certidões,
        // matrícula…) — todos entram na mesma detecção de temas/cartório.
        const lidos: { nome: string; texto: string }[] = [];
        for (const f of lote) {
          try {
            const texto = await lerArquivo(f);
            if (texto.trim().length >= 80) lidos.push({ nome: f.name, texto });
          } catch {
            // arquivo ilegível não derruba o lote — segue para o próximo
          }
        }
        if (lidos.length === 0) {
          toast.error('Não consegui ler texto suficiente destes arquivos.');
          return;
        }
        if (lidos.length < lote.length)
          toast.warning(
            `${lote.length - lidos.length} arquivo(s) sem texto legível ficaram de fora da análise.`,
          );
        const textoTudo = lidos.map((l) => l.texto).join('\n\n');
        const temasDetectados = detectarTemas(textoTudo);
        const ato = detectarAtoTipo(lidos[0].texto);
        const cartorioId =
          mencoesDeCartorio(textoTudo)
            .map((m) => resolverCartorio(m, cartorios))
            .find((id) => id !== null) ?? null;
        comecar(async () => {
          const r = await consultarJurimetria({ cartorioId, temas: temasDetectados });
          if (!r.ok) {
            toast.error(r.erro);
            return;
          }
          setAnalise({
            arquivos: lidos.map((l) => l.nome),
            ato: ROTULO_ATO[ato] ?? ato,
            temas: temasDetectados,
            cartorioId,
            resultado: r,
          });
        });
      } catch {
        toast.error('Falha ao ler os arquivos neste navegador.');
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
  const rotuloRecorte = (cartorioId: string | null, temaRotulo: string) =>
    `${temaRotulo} × ${nomeCartorio(cartorioId) ?? 'todos os cartórios'}`;

  return (
    <main className="lc-miolo produto-jurimetria">
      <section className="lc-hero">
        <span className="lc-eyebrow">Jurimetria Registral</span>
        <h1>O histórico dos cartórios, antes do protocolo</h1>
        <p className="lc-sub">
          Chegue com o problema: abra o tema da sua questão, cruze com o Registro de Imóveis que
          quiser e veja o histórico com percentuais — ou desça a página para analisar o título com
          os documentos do caso.
        </p>
      </section>

      {/* ---------------- 1. navegação tema-primeiro ---------------- */}
      <section className="lc-secao">
        <h2>Comece pelo problema</h2>
        <p style={{ marginTop: 0 }}>
          Os temas abaixo estão em ordem alfabética, com a contagem do que já foi publicado (
          {totalPublicado} exigência{totalPublicado === 1 ? '' : 's'} na base). Abra um tema para
          ver as decisões — da mais recente para a mais antiga — e escolha um cartório para cruzar.
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 'var(--e-2)' }}>
          {temas.map((t) => {
            const aberto = temaAtivo === t.id;
            const cabecalho = (
              <Link
                href={aberto ? hrefFiltro(cartorioAtivo, null) : hrefFiltro(cartorioAtivo, t.id)}
                aria-expanded={aberto}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--e-3)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontWeight: aberto ? 600 : 500 }}>
                  <span aria-hidden style={{ marginRight: '8px' }}>{aberto ? '▾' : '▸'}</span>
                  {t.rotulo}
                </span>
                <Badge variant={aberto ? 'default' : 'outline'}>{t.n}</Badge>
              </Link>
            );
            if (!aberto)
              return (
                <li key={t.id} className="lc-cartao" style={{ padding: 'var(--e-3) var(--e-4)' }}>
                  {cabecalho}
                </li>
              );
            return (
              <li key={t.id} className="lc-cartao">
                {cabecalho}
                <div style={{ marginTop: 'var(--e-3)' }}>
                  <p style={{ margin: '0 0 var(--e-2)' }}>
                    Cruzar com o Registro de Imóveis:{' '}
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px' }}>
                      <FiltroLink
                        ativo={!cartorioAtivo}
                        href={hrefFiltro(null, t.id)}
                        rotulo="todos"
                      />
                      {cartorios.map((c) => (
                        <FiltroLink
                          key={c.id}
                          ativo={cartorioAtivo === c.id}
                          href={hrefFiltro(c.id, t.id)}
                          rotulo={c.nome.replace(' de São Paulo/SP', '')}
                        />
                      ))}
                    </span>
                  </p>
                  {historico ? (
                    <>
                      <ResumoCruzamento
                        historico={historico}
                        recorte={rotuloRecorte(cartorioAtivo, t.rotulo)}
                      />
                      <ListaExigencias historico={historico} />
                    </>
                  ) : (
                    <div className="lc-cartao">
                      <p style={{ margin: 0 }}>
                        Não consegui carregar o histórico agora — recarregue a página.
                      </p>
                    </div>
                  )}
                  <Disclaimer />
                </div>
              </li>
            );
          })}
          {(semTemaN > 0 || temaAtivo === 'sem-tema') && (
            <li className="lc-cartao" style={temaAtivo === 'sem-tema' ? undefined : { padding: 'var(--e-3) var(--e-4)' }}>
              <Link
                href={
                  temaAtivo === 'sem-tema'
                    ? hrefFiltro(cartorioAtivo, null)
                    : hrefFiltro(cartorioAtivo, 'sem-tema')
                }
                aria-expanded={temaAtivo === 'sem-tema'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 'var(--e-3)',
                  textDecoration: 'none',
                  color: 'inherit',
                }}
              >
                <span style={{ fontWeight: temaAtivo === 'sem-tema' ? 600 : 500 }}>
                  <span aria-hidden style={{ marginRight: '8px' }}>
                    {temaAtivo === 'sem-tema' ? '▾' : '▸'}
                  </span>
                  Ainda sem tema definido
                </span>
                <Badge variant={temaAtivo === 'sem-tema' ? 'default' : 'outline'}>{semTemaN}</Badge>
              </Link>
              {temaAtivo === 'sem-tema' && (
                <div style={{ marginTop: 'var(--e-3)' }}>
                  <p style={{ margin: '0 0 var(--e-2)', fontSize: 'var(--t-sm)', opacity: 0.8 }}>
                    Exigências publicadas cuja classificação por tema ainda não foi possível — a
                    coleta reclassifica continuamente e elas migram para os temas acima.
                  </p>
                  <p style={{ margin: '0 0 var(--e-2)' }}>
                    Cruzar com o Registro de Imóveis:{' '}
                    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '6px' }}>
                      <FiltroLink ativo={!cartorioAtivo} href={hrefFiltro(null, 'sem-tema')} rotulo="todos" />
                      {cartorios.map((c) => (
                        <FiltroLink
                          key={c.id}
                          ativo={cartorioAtivo === c.id}
                          href={hrefFiltro(c.id, 'sem-tema')}
                          rotulo={c.nome.replace(' de São Paulo/SP', '')}
                        />
                      ))}
                    </span>
                  </p>
                  {historico ? (
                    <>
                      <ResumoCruzamento
                        historico={historico}
                        recorte={rotuloRecorte(cartorioAtivo, 'ainda sem tema')}
                      />
                      <ListaExigencias historico={historico} />
                    </>
                  ) : (
                    <div className="lc-cartao">
                      <p style={{ margin: 0 }}>
                        Não consegui carregar o histórico agora — recarregue a página.
                      </p>
                    </div>
                  )}
                  <Disclaimer />
                </div>
              )}
            </li>
          )}
        </ul>
      </section>

      {/* ---------------- 2. análise de documentos (título + complementares) ---------------- */}
      <section className="lc-secao">
        <h2>Analisar o título e os documentos do caso</h2>
        <div
          className="lc-cartao"
          role="button"
          tabIndex={0}
          aria-label="Enviar título e documentos complementares para análise local"
          style={{ textAlign: 'center', borderStyle: 'dashed', cursor: 'pointer' }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const fs = Array.from(e.dataTransfer.files ?? []);
            if (fs.length > 0) void analisar(fs);
          }}
          onClick={() => document.getElementById('jurimetria-arquivo')?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ')
              document.getElementById('jurimetria-arquivo')?.click();
          }}
        >
          {lendo || pendente ? (
            <p style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              <Spinner /> lendo os documentos no seu navegador…
            </p>
          ) : (
            <>
              <h3 style={{ marginTop: 0 }}>
                Solte aqui o título e os complementares (PDF, DOCX ou foto — vários de uma vez)
              </h3>
              <p style={{ margin: 0 }}>
                O título e os documentos que o acompanham (matrícula, certidões…) são analisados{' '}
                <strong>juntos, no seu navegador</strong> — nada é enviado a lugar nenhum; a
                consulta manda só o tipo de ato, o cartório e os temas detectados.
              </p>
            </>
          )}
          <input
            id="jurimetria-arquivo"
            type="file"
            accept=".pdf,.docx,.png,.jpg,.jpeg,.webp"
            multiple
            hidden
            onChange={(e) => {
              const fs = Array.from(e.target.files ?? []);
              if (fs.length > 0) void analisar(fs);
              e.target.value = '';
            }}
          />
        </div>

        {analise && (
          <div className="lc-cartao" style={{ marginTop: 'var(--e-4)' }}>
            <span className="lc-eyebrow">
              Análise local de {analise.arquivos.length} documento
              {analise.arquivos.length === 1 ? '' : 's'}
            </span>
            <p style={{ margin: 'var(--e-2) 0 0', fontSize: 'var(--t-sm)', opacity: 0.8 }}>
              {analise.arquivos.join(' · ')}
            </p>
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
                <ResumoCruzamento
                  historico={analise.resultado}
                  recorte={`temas do documento × ${nomeCartorio(analise.cartorioId) ?? 'todos os cartórios'}`}
                />
                <ListaExigencias historico={analise.resultado} />
              </>
            )}
            <Disclaimer />
          </div>
        )}
      </section>

      {/* ---------------- 3. nota devolutiva: entregável + contribuição ---------------- */}
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
