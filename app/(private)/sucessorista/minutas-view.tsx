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

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ROTULO_MODALIDADE, type ModalidadeEscritura } from '@/lib/partilha/escritura';
import { Pilula } from './familia';

/** Campo de prompt à IA — instruções livres antes de gerar o DOCX. */
function CampoInstrucoes({
  valor,
  onChange,
  exemplo,
}: {
  valor: string;
  onChange: (v: string) => void;
  exemplo: string;
}) {
  return (
    <label className="campo" style={{ maxWidth: 640, margin: '14px 0' }}>
      <span>
        Instruções à IA <span className="dica">— opcional, aplicadas nesta geração</span>
      </span>
      <Textarea
        value={valor}
        rows={3}
        placeholder={exemplo}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function MinutasView({
  onGerarPeticao,
  onGerarPeticaoJudicial,
}: {
  onGerarPeticao: (instrucoes: string) => Promise<void>;
  onGerarPeticaoJudicial: (instrucoes: string) => Promise<void>;
}) {
  const [gerando, setGerando] = useState<'tabelionato' | 'judicial' | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [instrucoes, setInstrucoes] = useState('');

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

      <CampoInstrucoes
        valor={instrucoes}
        onChange={setInstrucoes}
        exemplo="ex.: incluir cláusula de cessão de direitos hereditários da herdeira Renata ao irmão; pedir prioridade de tramitação (idoso)…"
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
                onClick={() => executar('judicial', () => onGerarPeticaoJudicial(instrucoes))}
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
}: {
  onGerarEscritura: (
    modalidade: ModalidadeEscritura,
    partesRemotas: string,
    instrucoes: string,
  ) => Promise<void>;
}) {
  const [modalidade, setModalidade] = useState<ModalidadeEscritura>('PRESENCIAL');
  const [partesRemotas, setPartesRemotas] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

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
            placeholder="ex.: a herdeira Renata Pummer Carvalho Lavruhin"
            onChange={(e) => setPartesRemotas(e.target.value)}
          />
        </label>
      )}

      <CampoInstrucoes
        valor={instrucoes}
        onChange={setInstrucoes}
        exemplo="ex.: incluir cláusula de reserva de usufruto do imóvel 1 em favor da viúva; consignar alvará para venda do veículo…"
      />

      <div className="escolha">
        <Button
          loading={gerando}
          onClick={async () => {
            setGerando(true);
            setErro(null);
            try {
              await onGerarEscritura(modalidade, partesRemotas, instrucoes);
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
