/**
 * Abas de minutas por perfil:
 *
 * - VII "Minutas" (Advogado(a)): requerimento ao Tabelionato (via
 *   extrajudicial) e petição inicial do inventário judicial (redação por IA
 *   com fallback local) — ambos em DOCX editável com a folha inteira dentro.
 * - VI "Escritura" (Escrevente Notarial): minuta da escritura do modelo do
 *   balcão, com a modalidade do ato escolhida aqui (presencial ·
 *   videoconferência e-Notariado · híbrida).
 */

import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ROTULO_MODALIDADE, type ModalidadeEscritura } from '@/lib/partilha/escritura';
import { agruparPendencias, type Pendencia } from '@/lib/partilha/pendencias';
import type { RelatorioAntecipador } from '@/lib/partilha/antecipador';
import { baixarBlob } from '@/lib/partilha/xlsx';
import { Pilula } from './familia';

/**
 * Checklist do que ainda vira LACUNA (______) na minuta — o profissional
 * completa antes ou gera mesmo assim, sabendo o que falta. Padrão adotado de
 * um gerador de minuta por template: pendências antes de gerar, agrupadas.
 */
export function ChecklistPendencias({ pendencias }: { pendencias: Pendencia[] }) {
  if (pendencias.length === 0) {
    return (
      <div className="nota registro">
        <span className="eyebrow">Pronto para gerar</span>
        <p>Nenhuma pendência: a folha tem tudo o que a minuta precisa — sem lacunas previstas.</p>
      </div>
    );
  }
  const grupos = agruparPendencias(pendencias);
  return (
    <div className="nota exigencia">
      <span className="eyebrow">
        {pendencias.length} campo(s) a completar — sairão como lacuna (______) para preencher à mão
      </span>
      <p style={{ marginBottom: 6 }}>
        Você pode completar na folha antes de gerar, ou gerar mesmo assim e preencher as
        lacunas no DOCX.
      </p>
      {grupos.map((g) => (
        <p key={g.grupo} style={{ margin: '4px 0 0' }}>
          <strong>{g.grupo}:</strong> {g.itens.join(', ')}.
        </p>
      ))}
    </div>
  );
}

/**
 * Antecipador de qualificação registral: confronto do ato com as matrículas
 * — o que o Registro de Imóveis pode exigir junto ao traslado/formal, antes
 * que vire nota devolutiva. Relatório inline + exportação em PDF nas cores
 * do módulo.
 */
export function AntecipadorSection({
  relatorio,
  nomeCaso,
  onPdf,
}: {
  relatorio: RelatorioAntecipador | null;
  nomeCaso: string;
  /** Telemetria: o PDF do antecipador saiu. */
  onPdf?: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [gerando, setGerando] = useState(false);
  if (!relatorio) return null;

  const baixarPdf = async () => {
    setGerando(true);
    try {
      const { montarAntecipadorPdf } = await import('@/lib/partilha/antecipador-pdf');
      const blob = await montarAntecipadorPdf(relatorio, nomeCaso);
      baixarBlob(blob, `Antecipador registral${nomeCaso ? ` - ${nomeCaso}` : ''}.pdf`);
      onPdf?.();
    } finally {
      setGerando(false);
    }
  };

  const Apontamento = ({ a }: { a: RelatorioAntecipador['gerais'][number] }) => (
    <p style={{ margin: '6px 0 0' }}>
      <strong style={{ color: a.nivel === 'EXIGENCIA' ? 'var(--lacre)' : 'var(--bronze)' }}>
        [{a.nivel === 'EXIGENCIA' ? 'EXIGÊNCIA' : 'CONFERIR'}]
      </strong>{' '}
      {a.texto} <span className="fund">{a.fundamento}</span>
    </p>
  );

  return (
    <div className="nota" style={{ marginTop: 16 }}>
      <span className="eyebrow">Antecipador de qualificação registral</span>
      <p style={{ marginBottom: 6 }}>
        Confronto do ato com as certidões de matrícula: o que o Registro de Imóveis pode
        exigir junto ao {relatorio.tituloRegistro} —{' '}
        <strong style={{ color: relatorio.totalExigencias > 0 ? 'var(--lacre)' : undefined }}>
          {relatorio.totalExigencias} exigência(s) prevista(s)
        </strong>
        . Relatório de apoio: a qualificação registral é do Oficial.
      </p>
      <div className="escolha">
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(!aberto)}>
          {aberto ? 'Recolher o relatório' : 'Ver o relatório'}
        </Button>
        <Button type="button" variant="outline" size="sm" loading={gerando} onClick={baixarPdf}>
          Baixar em PDF
        </Button>
      </div>
      {aberto && (
        <div style={{ marginTop: 8 }}>
          {relatorio.imoveis.map((im, i) => (
            <div key={i} style={{ marginTop: 8 }}>
              <strong>
                {im.descricao}
                {im.matricula ? ` — matrícula ${im.matricula}` : ''}
              </strong>
              {im.apontamentos.length === 0 ? (
                <p className="fund">Nenhum apontamento — a folha confere com a titularidade.</p>
              ) : (
                im.apontamentos.map((a, j) => <Apontamento key={j} a={a} />)
              )}
            </div>
          ))}
          <div style={{ marginTop: 8 }}>
            <strong>Itens de praxe do caso</strong>
            {relatorio.gerais.map((a, j) => (
              <Apontamento key={j} a={a} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Modelo próprio carregado (nome do arquivo + texto extraído). */
interface ModeloProprio {
  nome: string;
  texto: string;
}

/**
 * Anexo do MODELO PRÓPRIO do(a) profissional (padrão da serventia/escritório):
 * .docx, .pdf ou .txt lidos AQUI no navegador (o arquivo não sai da máquina —
 * só o texto extraído segue para a redação, que passa a seguir a estrutura e
 * o estilo do modelo). Persistido no navegador (localStorage), como os
 * modelos de honorários — vale para os próximos casos até ser trocado.
 */
function ModeloProprioAnexo({
  chave,
  rotulo,
  dica,
  modelo,
  setModelo,
}: {
  /** Chave do localStorage (um modelo por tipo de peça). */
  chave: string;
  rotulo: string;
  dica: string;
  modelo: ModeloProprio | null;
  setModelo: (m: ModeloProprio | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [lendo, setLendo] = useState(false);

  const carregar = async (file: File) => {
    setLendo(true);
    try {
      let texto = '';
      if (/\.docx$/i.test(file.name)) {
        const { extrairTextoOffice } = await import('@/lib/office-texto');
        texto = await extrairTextoOffice(file);
      } else if (/\.txt$/i.test(file.name)) {
        texto = await file.text();
      } else if (/\.pdf$/i.test(file.name)) {
        const { readDocument } = await import('@/lib/ocr');
        texto = await readDocument(file);
      } else {
        toast.error('Modelo em .docx, .pdf ou .txt.');
        return;
      }
      texto = texto.trim().slice(0, 40_000);
      if (texto.length < 200) {
        toast.warning('O modelo ficou com pouco texto legível — a redação pode não conseguir segui-lo.');
      }
      const novo = { nome: file.name, texto };
      setModelo(novo);
      try {
        localStorage.setItem(chave, JSON.stringify(novo));
      } catch {
        // modo restrito / cota: o modelo vale nesta sessão
      }
      toast.success('Modelo carregado — a minuta sai no SEU padrão.');
    } catch {
      toast.error('Não foi possível ler o modelo.');
    } finally {
      setLendo(false);
    }
  };

  const remover = () => {
    setModelo(null);
    try {
      localStorage.removeItem(chave);
    } catch {
      // modo restrito
    }
  };

  return (
    <div className="nota" style={{ marginTop: 12 }}>
      <span className="eyebrow">{rotulo}</span>
      <p style={{ margin: '4px 0 8px' }}>{dica}</p>
      {modelo ? (
        <p style={{ margin: '0 0 8px' }}>
          <strong>{modelo.nome}</strong>{' '}
          <span className="fund">— a próxima geração segue este padrão.</span>
        </p>
      ) : null}
      <div className="escolha">
        <Button
          type="button"
          variant="outline"
          size="sm"
          loading={lendo}
          onClick={() => inputRef.current?.click()}
        >
          {modelo ? 'Trocar o modelo' : '+ Anexar meu modelo (.docx, .pdf ou .txt)'}
        </Button>
        {modelo && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={remover}>
            remover (voltar ao padrão do sistema)
          </Button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".docx,.pdf,.txt"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void carregar(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}

/** Restaura o modelo salvo no navegador (efeito diferido — hidratação). */
function useModeloSalvo(chave: string): [ModeloProprio | null, (m: ModeloProprio | null) => void] {
  const [modelo, setModelo] = useState<ModeloProprio | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const bruto = localStorage.getItem(chave);
        if (!bruto) return;
        const salvo = JSON.parse(bruto) as ModeloProprio;
        if (salvo?.nome && salvo?.texto) setModelo(salvo);
      } catch {
        // modo restrito / JSON inválido
      }
    }, 0);
    return () => clearTimeout(t);
  }, [chave]);
  return [modelo, setModelo];
}

/** Campo de prompt à IA — instruções livres antes de gerar o DOCX. */
function CampoInstrucoes({
  valor,
  onChange,
}: {
  valor: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="campo" style={{ maxWidth: 640, margin: '14px 0' }}>
      <span>
        Instruções à IA <span className="dica">— opcional, aplicadas nesta geração</span>
      </span>
      <Textarea
        value={valor}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function MinutasView({
  onGerarPeticao,
  onGerarPeticaoJudicial,
  pendencias = [],
  antecipador = null,
  nomeCaso = '',
  onAntecipadorPdf,
}: {
  onGerarPeticao: (instrucoes: string) => Promise<void>;
  /** Recebe também o texto do MODELO PRÓPRIO do escritório (null = padrão). */
  onGerarPeticaoJudicial: (instrucoes: string, modeloTexto: string | null) => Promise<void>;
  /** Campos que ainda faltam para a minuta sair completa (checklist). */
  pendencias?: Pendencia[];
  /** Antecipador de qualificação registral (confronto com as matrículas). */
  antecipador?: RelatorioAntecipador | null;
  nomeCaso?: string;
  onAntecipadorPdf?: () => void;
}) {
  const [gerando, setGerando] = useState<'tabelionato' | 'judicial' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [instrucoes, setInstrucoes] = useState('');
  // Modelo PRÓPRIO da petição inicial do escritório — a redação o segue.
  const [modeloPeticao, setModeloPeticao] = useModeloSalvo('sucessorista-modelo-peticao');

  const executar = async (qual: 'tabelionato' | 'judicial', fn: () => Promise<void>) => {
    setGerando(qual);
    setErro(null);
    try {
      await fn();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao gerar a minuta.');
    } finally {
      setGerando(null);
    }
  };

  return (
    <section>
      <h1>Minutas</h1>
      <p className="subtitulo">
        As peças do caso, prontas da folha de trabalho: qualificação das partes, plano de
        partilha fundamentado (com as frações por bem), ITCMD e rol de documentos. Tudo sai
        em DOCX editável, como MINUTA para sua revisão e assinatura.
      </p>

      <ChecklistPendencias pendencias={pendencias} />

      <AntecipadorSection relatorio={antecipador} nomeCaso={nomeCaso} onPdf={onAntecipadorPdf} />

      <ModeloProprioAnexo
        chave="sucessorista-modelo-peticao"
        rotulo="Padrão do escritório — petição inicial"
        dica="Anexe a SUA petição inicial de inventário (um caso antigo serve): a redação por IA passa a seguir a estrutura, a ordem das seções e o estilo do seu modelo, preenchendo com os dados deste caso. O arquivo é lido aqui no navegador; sem modelo, sai a redação padrão do sistema."
        modelo={modeloPeticao}
        setModelo={setModeloPeticao}
      />

      <CampoInstrucoes
        valor={instrucoes}
        onChange={setInstrucoes}
      />

      <div className="check">
        <div className="check-item">
          <span className="prio">§</span>
          <div>
            <h4>Via extrajudicial — requerimento ao Tabelionato</h4>
            <p>
              CPC, art. 610, §§ 1º e 2º, e Res. CNJ 35/2007 — com os requisitos declarados,
              a nomeação de inventariante e o plano de partilha para a lavratura.
            </p>
            <p style={{ marginTop: 8 }}>
              <Button
                disabled={gerando !== null}
                loading={gerando === 'tabelionato'}
                onClick={() => executar('tabelionato', () => onGerarPeticao(instrucoes))}
              >
                Gerar minuta ao Tabelionato (DOCX)
              </Button>
            </p>
          </div>
          <span />
        </div>
        <div className="check-item">
          <span className="prio">⚖</span>
          <div>
            <h4>Via judicial — petição inicial completa</h4>
            <p>
              Abertura do inventário (CPC, arts. 610 e seguintes): fatos, cabimento,
              inventariante, primeiras declarações, esboço de partilha, ITCMD, pedidos e
              valor da causa. A redação do corpo vem da IA pela rota interna — se ela
              falhar, sai a redação padrão local, nunca vazia.
            </p>
            <p style={{ marginTop: 8 }}>
              <Button
                variant="outline"
                disabled={gerando !== null}
                loading={gerando === 'judicial'}
                onClick={() =>
                  executar('judicial', () =>
                    onGerarPeticaoJudicial(instrucoes, modeloPeticao?.texto ?? null),
                  )
                }
              >
                Gerar petição inicial (DOCX, IA)
              </Button>
            </p>
          </div>
          <span />
        </div>
      </div>
      {erro && <p className="mono-alerta">{erro}</p>}
    </section>
  );
}

export function EscrituraView({
  onGerarEscritura,
  pendencias = [],
  antecipador = null,
  nomeCaso = '',
  onAntecipadorPdf,
}: {
  onGerarEscritura: (
    modalidade: ModalidadeEscritura,
    partesRemotas: string,
    instrucoes: string,
    /** Texto do MODELO DA SERVENTIA (null = modelo padrão do sistema). */
    modeloTexto: string | null,
  ) => Promise<void>;
  /** Campos que ainda faltam para a escritura sair completa (checklist). */
  pendencias?: Pendencia[];
  /** Antecipador de qualificação registral (confronto com as matrículas). */
  antecipador?: RelatorioAntecipador | null;
  nomeCaso?: string;
  onAntecipadorPdf?: () => void;
}) {
  const [modalidade, setModalidade] = useState<ModalidadeEscritura>('PRESENCIAL');
  const [partesRemotas, setPartesRemotas] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Modelo PRÓPRIO da serventia — a minuta sai na estrutura e no estilo dele.
  const [modeloEscritura, setModeloEscritura] = useModeloSalvo('sucessorista-modelo-escritura');

  return (
    <section>
      <h1>Escritura</h1>
      <p className="subtitulo">
        A minuta da escritura de inventário e partilha, no modelo do balcão: cláusulas
        padrão intactas e as variáveis acompanhando a família, o acervo e a forma da
        partilha. Tabelionato, escrevente e tabelião ficam em branco — a minuta serve a
        qualquer serventia. Campo sem base na folha vira lacuna (______).
      </p>

      <span className="eyebrow">Modalidade do ato</span>
      <p className="fund" style={{ margin: '4px 0 8px' }}>
        Muda a introdução, o encerramento e as cláusulas do e-Notariado (Prov. CNJ
        149/2023).
      </p>
      <div className="escolha" style={{ marginBottom: 10 }}>
        {(Object.keys(ROTULO_MODALIDADE) as ModalidadeEscritura[]).map((m) => (
          <Pilula key={m} ativo={modalidade === m} onClick={() => setModalidade(m)}>
            {ROTULO_MODALIDADE[m]}
          </Pilula>
        ))}
      </div>
      {modalidade === 'HIBRIDA' && (
        <label className="campo" style={{ maxWidth: 480, marginBottom: 12 }}>
          Quem participa por videoconferência
          <Input
            value={partesRemotas}
            onChange={(e) => setPartesRemotas(e.target.value)}
          />
        </label>
      )}

      <ChecklistPendencias pendencias={pendencias} />

      <AntecipadorSection relatorio={antecipador} nomeCaso={nomeCaso} onPdf={onAntecipadorPdf} />

      <ModeloProprioAnexo
        chave="sucessorista-modelo-escritura"
        rotulo="Padrão da serventia — minuta da escritura"
        dica="Anexe a MINUTA-PADRÃO do seu balcão (uma escritura antiga de inventário serve): a geração passa a seguir a estrutura, a ordem das cláusulas e o estilo de redação DELA, preenchida com os dados deste caso pela redação por IA — e se a IA falhar, sai o modelo padrão do sistema, nunca vazia. O arquivo é lido aqui no navegador."
        modelo={modeloEscritura}
        setModelo={setModeloEscritura}
      />

      <CampoInstrucoes
        valor={instrucoes}
        onChange={setInstrucoes}
      />

      <div className="escolha">
        <Button
          loading={gerando}
          onClick={async () => {
            setGerando(true);
            setErro(null);
            try {
              await onGerarEscritura(
                modalidade,
                partesRemotas,
                instrucoes,
                modeloEscritura?.texto ?? null,
              );
            } catch (e) {
              setErro(e instanceof Error ? e.message : 'Falha ao gerar a minuta da escritura.');
            } finally {
              setGerando(false);
            }
          }}
        >
          Gerar minuta da escritura (DOCX)
        </Button>
      </div>
      {erro && <p className="mono-alerta">{erro}</p>}
      <p className="fund" style={{ marginTop: 10 }}>
        Condicionais automáticas: Carta de Anuência do Detran só com veículo no acervo;
        parágrafo bancário (art. 168 do CP) só com crédito bancário; tributo pago × isento
        conforme a apuração do item IV; partilha em tabela, pelo espelho ou pela partilha
        diferenciada.
      </p>
    </section>
  );
}
