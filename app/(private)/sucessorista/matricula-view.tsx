/**
 * Item IX — Analisador de Matrícula.
 *
 * Relatório completo de situação dominial de certidões de matrícula: arraste
 * matrículas independentes OU analise as já anexadas ao rol de documentos do
 * caso. A leitura roda pela rota interna /api/sucessorista (tipo=MATRICULA —
 * chave do Gemini só no servidor, fronteira de dados do projeto) e devolve
 * identificação, Tabela Consolidada de Situação Dominial (tabela de verdade),
 * ônus ativos, alertas [ALTA]/[BAIXA] com ação recomendada, resumo booleano,
 * análise jurídica da cadeia dominial, pontos de atenção e confiabilidade —
 * com o relatório em PDF nas cores do módulo (lib/partilha/matricula-pdf).
 */

import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { AnaliseMatricula } from '@/lib/gemini-matricula';
import { comprimirImagem, pdfParaImagens } from '@/lib/envio-imagens';
import { baixarBlob } from '@/lib/partilha/xlsx';
import type { AnexosProcesso } from './documentos';

const MAX_ARQUIVOS = 10;
const MAX_TOTAL_BYTES = 4.2 * 1024 * 1024;
/** PDF até este tamanho segue inteiro; acima, vira uma imagem por página. */
const MAX_PDF_DIRETO = 3.6 * 1024 * 1024;
const EXT_IMAGEM = /\.(jpe?g|png|webp|bmp)$/i;

const simNao = (v: boolean | null) => (v === null ? '—' : v ? 'sim' : 'não');

export function MatriculaView({
  anexos,
  onAnalisado,
  onRelatorioPdf,
}: {
  /** Anexos do caso — as matrículas do item "matricula-imovel" entram aqui. */
  anexos: AnexosProcesso;
  /** Telemetria: análise concluída (quantidade de matrículas — nunca nomes). */
  onAnalisado?: (qtd: number) => void;
  /** Telemetria: relatório em PDF baixado. */
  onRelatorioPdf?: () => void;
}) {
  const [analises, setAnalises] = useState<AnaliseMatricula[] | null>(null);
  const [nomesAnalisados, setNomesAnalisados] = useState<string[]>([]);
  const [analisando, setAnalisando] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState<number | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [arrastoAtivo, setArrastoAtivo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const matriculasDoCaso = anexos['matricula-imovel'] ?? [];

  const analisar = async (arquivos: File[]) => {
    if (arquivos.length === 0) return;
    if (arquivos.length > MAX_ARQUIVOS) {
      setErro(`Máximo de ${MAX_ARQUIVOS} arquivos por análise — envie em lotes menores.`);
      return;
    }
    setAnalisando(true);
    setErro(null);
    try {
      // Matrícula GRANDE não é mais barreira: foto/scan é comprimida aqui no
      // navegador e PDF acima do teto vira uma imagem JPEG por página — o
      // conteúdo continua saindo só pela rota interna.
      const preparados: File[] = [];
      const avisosPreparo: string[] = [];
      for (const f of arquivos) {
        if (EXT_IMAGEM.test(f.name)) {
          preparados.push(await comprimirImagem(f));
          continue;
        }
        if (/\.pdf$/i.test(f.name) && f.size > MAX_PDF_DIRETO) {
          try {
            const r = await pdfParaImagens(f);
            if (r.paginas.length === 0) throw new Error('sem páginas');
            preparados.push(...r.paginas);
            if (r.totalPaginas > r.paginas.length) {
              avisosPreparo.push(
                `${f.name}: convertidas as ${r.paginas.length} primeiras páginas de ${r.totalPaginas} — divida o PDF se o essencial ficou de fora.`,
              );
            }
            continue;
          } catch {
            preparados.push(f); // conversão falhou: tenta o PDF inteiro mesmo
          }
          continue;
        }
        preparados.push(f);
      }
      if (preparados.reduce((a, f) => a + f.size, 0) > MAX_TOTAL_BYTES) {
        setErro(
          'Mesmo depois da conversão o lote passou de ~4 MB — analise menos matrículas por vez.',
        );
        return;
      }
      if (avisosPreparo.length > 0) setErro(avisosPreparo.join(' '));

      const form = new FormData();
      form.set('tipo', 'MATRICULA');
      for (const f of preparados) form.append('item', f);
      const r = await fetch('/api/sucessorista', { method: 'POST', body: form });
      const corpo = (await r.json().catch(() => null)) as {
        matriculas?: AnaliseMatricula[];
        error?: string;
      } | null;
      if (!r.ok || !corpo?.matriculas?.length) {
        throw new Error(corpo?.error ?? `Falha na leitura (HTTP ${r.status}).`);
      }
      setAnalises(corpo.matriculas);
      setNomesAnalisados(arquivos.map((f) => f.name));
      onAnalisado?.(corpo.matriculas.length);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível analisar as matrículas.');
    } finally {
      setAnalisando(false);
    }
  };

  const baixarPdf = async (analise: AnaliseMatricula, indice: number) => {
    setGerandoPdf(indice);
    try {
      const { montarRelatorioMatriculaPdf } = await import('@/lib/partilha/matricula-pdf');
      const blob = await montarRelatorioMatriculaPdf(analise);
      const numero = analise.identificacao.numeroMatricula;
      baixarBlob(blob, `Analise de Matricula${numero ? ` ${numero}` : ''}.pdf`);
      onRelatorioPdf?.();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar o PDF do relatório.');
    } finally {
      setGerandoPdf(null);
    }
  };

  return (
    <section>
      <h1>Analisador de Matrícula</h1>
      <p className="subtitulo">
        A certidão de matrícula lida por inteiro: quem é dono hoje (aplicada toda a cadeia
        de registros), os ônus vigentes, os alertas com a ação recomendada e a análise
        jurídica da cadeia dominial — com o relatório para baixar em PDF. Funciona com
        matrículas avulsas (arraste abaixo) ou com as já anexadas ao caso.
      </p>

      {/* ---------- entrada 1: matrículas independentes ---------- */}
      <div
        className={`arrasto${arrastoAtivo ? ' ativo' : ''}`}
        role="button"
        tabIndex={0}
        aria-label="Arrastar ou escolher certidões de matrícula"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastoAtivo(true);
        }}
        onDragLeave={() => setArrastoAtivo(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastoAtivo(false);
          const files = Array.from(e.dataTransfer.files ?? []);
          if (files.length > 0) void analisar(files);
        }}
      >
        <b>Arraste as certidões de matrícula aqui</b>
        <span className="dica">
          PDF ou foto nítida do inteiro teor — até {MAX_ARQUIVOS} arquivos por análise.
          Matrícula pesada não é problema: PDF grande vira uma imagem por página e fotos
          são comprimidas aqui no navegador antes do envio. Uma matrícula em várias
          páginas/arquivos é agrupada sozinha.
        </span>
        <div className="arrasto-acoes">
          <Button type="button" variant="outline" size="sm" loading={analisando}>
            Escolher arquivos
          </Button>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept=".pdf,.jpg,.jpeg,.png,.webp,.bmp"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length > 0) void analisar(files);
        }}
      />

      {/* ---------- entrada 2: matrículas do rol de documentos do caso ---------- */}
      <h2>Matrículas anexadas ao caso</h2>
      {matriculasDoCaso.length === 0 ? (
        <p className="fund">
          Nenhuma matrícula no rol de documentos ainda — anexe no item &quot;Matrícula
          atualizada de cada imóvel&quot; da aba Documentos (ou arraste avulsas acima).
        </p>
      ) : (
        <>
          {matriculasDoCaso.map((f, i) => (
            <div className="linha-item" key={`${f.name}-${i}`}>
              <span className="num" style={{ fontSize: 'var(--t-sm)' }}>
                {f.name}
              </span>
              <span />
            </div>
          ))}
          <div style={{ marginTop: 12 }}>
            <Button
              type="button"
              variant="outline"
              loading={analisando}
              onClick={() => void analisar(matriculasDoCaso.slice(0, MAX_ARQUIVOS))}
            >
              Analisar as matrículas do caso
            </Button>
          </div>
        </>
      )}

      {erro && <p className="mono-alerta">{erro}</p>}
      {analisando && (
        <p className="fund" style={{ marginTop: 10 }}>
          Lendo as certidões — identificação, cadeia dominial, ônus e alertas…
        </p>
      )}

      {/* ---------- relatórios ---------- */}
      {analises?.map((analise, indice) => (
        <RelatorioMatricula
          key={indice}
          analise={analise}
          nomesArquivos={analise.arquivos.map((n) => nomesAnalisados[n - 1]).filter(Boolean)}
          gerandoPdf={gerandoPdf === indice}
          onBaixarPdf={() => void baixarPdf(analise, indice)}
        />
      ))}
    </section>
  );
}

/* ---------- o relatório de uma matrícula ---------- */

function RelatorioMatricula({
  analise,
  nomesArquivos,
  gerandoPdf,
  onBaixarPdf,
}: {
  analise: AnaliseMatricula;
  nomesArquivos: string[];
  gerandoPdf: boolean;
  onBaixarPdf: () => void;
}) {
  const ident = analise.identificacao;
  const resumoItens: Array<{ rotulo: string; valor: string; atencao: boolean }> = [
    { rotulo: 'Imóvel livre de ônus', valor: simNao(analise.resumo.livreDeOnus), atencao: analise.resumo.livreDeOnus === false },
    { rotulo: 'Ônus ativos', valor: simNao(analise.resumo.onusAtivos), atencao: analise.resumo.onusAtivos === true },
    { rotulo: 'Usufruto vigente', valor: simNao(analise.resumo.usufrutoVigente), atencao: analise.resumo.usufrutoVigente === true },
    { rotulo: 'Cláusulas restritivas', valor: simNao(analise.resumo.clausulasRestritivas), atencao: analise.resumo.clausulasRestritivas === true },
    { rotulo: 'Indisponibilidade', valor: simNao(analise.resumo.indisponibilidade), atencao: analise.resumo.indisponibilidade === true },
    { rotulo: 'Processo judicial', valor: simNao(analise.resumo.processoJudicial), atencao: analise.resumo.processoJudicial === true },
    { rotulo: 'Proprietário falecido', valor: simNao(analise.resumo.proprietarioFalecido), atencao: analise.resumo.proprietarioFalecido === true },
    { rotulo: 'Documento completo', valor: simNao(analise.resumo.documentoCompleto), atencao: analise.resumo.documentoCompleto === false },
    { rotulo: 'Certidão vigente', valor: simNao(analise.resumo.certidaoVigente), atencao: analise.resumo.certidaoVigente === false },
    { rotulo: 'Quantidade de proprietários', valor: analise.resumo.qtdProprietarios === null ? '—' : String(analise.resumo.qtdProprietarios), atencao: false },
    { rotulo: 'Quantidade de usufrutuários', valor: analise.resumo.qtdUsufrutuarios === null ? '—' : String(analise.resumo.qtdUsufrutuarios), atencao: false },
    { rotulo: 'Quantidade de ônus ativos', valor: analise.resumo.qtdOnusAtivos === null ? '—' : String(analise.resumo.qtdOnusAtivos), atencao: false },
    { rotulo: 'Soma das frações fecha em 100%', valor: simNao(analise.resumo.fracoesFecham100), atencao: analise.resumo.fracoesFecham100 === false },
  ];

  return (
    <div className="cartao" style={{ marginTop: 26 }}>
      <span className="eyebrow">
        Matrícula {ident.numeroMatricula ?? 'sem número'}
        {ident.comarca ? ` — ${ident.comarca}` : ''}
      </span>
      {analise.descricaoImovel && (
        <p style={{ fontWeight: 600, margin: '6px 0 0' }}>{analise.descricaoImovel}</p>
      )}
      {nomesArquivos.length > 0 && (
        <p className="fund num" style={{ marginTop: 4 }}>
          Fonte: {nomesArquivos.join(' · ')}
        </p>
      )}
      <div style={{ marginTop: 10 }}>
        <Button size="sm" loading={gerandoPdf} onClick={onBaixarPdf}>
          Baixar relatório em PDF
        </Button>
      </div>

      <h2>Identificação da Matrícula</h2>
      <div className="grade c2">
        {(
          [
            ['Tipo de documento', ident.tipoDocumento],
            ['Número da matrícula', ident.numeroMatricula],
            ['Livro', ident.livro],
            ['Cartório', ident.cartorio],
            ['Comarca', ident.comarca],
            ['Data de abertura', ident.dataAbertura],
            ['Emissão da certidão', ident.dataEmissaoCertidao],
            ['Selo digital', ident.seloDigital],
            ['CNM', ident.cnm],
          ] as const
        )
          .filter(([, v]) => v)
          .map(([rotulo, valor]) => (
            <p key={rotulo} style={{ fontSize: 'var(--t-sm)', margin: 0 }}>
              <span style={{ color: 'var(--tinta-media)' }}>{rotulo}:</span>{' '}
              <strong className="num">{valor}</strong>
            </p>
          ))}
      </div>

      <h2>Tabela Consolidada de Situação Dominial</h2>
      <p className="fund" style={{ margin: '0 0 6px' }}>
        Casal com bem comunicado sai numa linha só (os dois juntos, 100% do casal), com o
        regime de bens e o tipo do ato de origem — é o tipo (venda, doação, partilha…) que
        indica a comunicação.
      </p>
      <Table className="tabela-dominial">
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>Fração</TableHead>
            <TableHead>Participação (%)</TableHead>
            <TableHead>Tipo de Domínio</TableHead>
            <TableHead>Regime de Bens</TableHead>
            <TableHead>Origens</TableHead>
            <TableHead>Status Cônjuge</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {analise.proprietarios.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>Nenhum titular atual identificado.</TableCell>
            </TableRow>
          )}
          {analise.proprietarios.map((p, i) => (
            <TableRow key={i}>
              <TableCell style={{ fontWeight: 600 }}>{p.nome}</TableCell>
              <TableCell className="num">{p.fracao ?? '—'}</TableCell>
              <TableCell className="num">
                {p.participacaoPct !== null ? `${p.participacaoPct}%` : '—'}
              </TableCell>
              <TableCell>{p.tipoDominio ?? '—'}</TableCell>
              <TableCell>{p.regimeBens ?? '—'}</TableCell>
              <TableCell>{p.origens ?? '—'}</TableCell>
              <TableCell>{p.statusConjuge ?? '—'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <h2>Ônus Ativos</h2>
      {analise.onusAtivos.length === 0 && (
        <div className="nota registro">
          <p>Nenhum ônus vigente identificado na certidão.</p>
        </div>
      )}
      {analise.onusAtivos.map((o, i) => (
        <div className="nota exigencia" key={i}>
          <span className="eyebrow">{o.status ? `Status: ${o.status}` : 'Ônus'}</span>
          <h3>{o.titulo}</h3>
          <p>
            {[
              o.dataRegistro ? `Registro em ${o.dataRegistro}` : null,
              o.credor ? `Credor/beneficiário: ${o.credor}` : null,
              o.valor ? `Valor: ${o.valor}` : null,
              o.prazo ? `Prazo: ${o.prazo}` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {o.descricao && <p>{o.descricao}</p>}
        </div>
      ))}

      <h2>Alertas</h2>
      {analise.alertas.length === 0 && (
        <div className="nota registro">
          <p>Nenhum alerta — situação dominial sem apontamentos.</p>
        </div>
      )}
      {analise.alertas.map((a, i) => (
        <div className={`nota ${a.nivel === 'ALTA' ? 'exigencia' : ''}`} key={i}>
          <span className="eyebrow">
            [{a.nivel}] {a.tipo}
          </span>
          <p>{a.descricao}</p>
          {a.acaoRecomendada && (
            <p>
              <strong>Ação recomendada:</strong> {a.acaoRecomendada}
            </p>
          )}
        </div>
      ))}

      <h2>Resumo da Situação</h2>
      <div className="grade c2" style={{ gap: '4px 18px' }}>
        {resumoItens.map((item) => (
          <p
            key={item.rotulo}
            style={{
              fontSize: 'var(--t-sm)',
              margin: 0,
              display: 'flex',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--fio)',
              paddingBottom: 3,
            }}
          >
            <span style={{ color: 'var(--tinta-media)' }}>{item.rotulo}</span>
            <strong className="num" style={item.atencao ? { color: 'var(--lacre)' } : undefined}>
              {item.valor}
            </strong>
          </p>
        ))}
      </div>

      <h2>Análise Jurídica</h2>
      {analise.analiseJuridica.map((par, i) => (
        <p key={i} style={{ fontSize: 'var(--t-sm)', margin: '0 0 10px', maxWidth: '75ch' }}>
          {par}
        </p>
      ))}
      {analise.analiseJuridica.length === 0 && (
        <p className="fund">A leitura não produziu a análise da cadeia dominial.</p>
      )}

      <h2>Pontos de Atenção</h2>
      {analise.pontosDeAtencao.length === 0 && (
        <div className="nota registro">
          <p>Nenhum ponto pendente antes de negociar o imóvel.</p>
        </div>
      )}
      {analise.pontosDeAtencao.map((ponto, i) => (
        <div className="nota" key={i}>
          <h3>{ponto.titulo}</h3>
          <p>{ponto.descricao}</p>
        </div>
      ))}

      <h2>Confiabilidade da Extração</h2>
      <p style={{ fontSize: 'var(--t-sm)', margin: 0 }}>
        {analise.confiabilidade.indicePct !== null && (
          <strong className="num" style={{ fontSize: 'var(--t-base)' }}>
            Índice: {analise.confiabilidade.indicePct}%
          </strong>
        )}
        {analise.confiabilidade.justificativa && (
          <span style={{ display: 'block', color: 'var(--tinta-media)', marginTop: 4 }}>
            {analise.confiabilidade.justificativa}
          </span>
        )}
      </p>
      <p className="fund" style={{ marginTop: 10 }}>
        Relatório de apoio — a conferência com a certidão original e a validação jurídica
        são do(a) profissional responsável.
      </p>
    </div>
  );
}
