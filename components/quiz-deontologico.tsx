'use client';

/**
 * QUIZ DEONTOLÓGICO — as 10 perguntas sobre as regras do Radar (Provimento
 * 205/2021 + Código de Ética), aprovação só com 10/10.
 *
 * Extraído do /radar para servir DOIS lugares com a mesma cara: a página do
 * Radar (passo 2 da habilitação) e a qualificação de primeiro acesso da
 * conta. Quem corrige é a server action recebida por prop — o /radar usa a
 * dele (gated pelo produto), o onboarding usa a da conta — e o componente só
 * cuida da tela.
 */

import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { QUESTOES_RADAR, type CorrecaoQuiz } from '@/lib/radar/quiz';

export function QuizDeontologico({
  responder,
  aoAprovar,
}: {
  /** Server action que corrige e grava a aprovação no perfil. */
  responder: (
    respostas: Record<string, number>,
  ) => Promise<{ ok: boolean; erro?: string; motivo?: string; correcao?: CorrecaoQuiz }>;
  aoAprovar: () => void;
}) {
  const [respostas, setRespostas] = useState<Record<string, number>>({});
  const [correcao, setCorrecao] = useState<CorrecaoQuiz | null>(null);
  const [enviando, setEnviando] = useState(false);
  const faltam = QUESTOES_RADAR.filter((q) => respostas[q.id] === undefined).length;

  const corrigir = async () => {
    setEnviando(true);
    try {
      const r = await responder(respostas);
      if (!r.ok || !r.correcao) {
        toast.error(r.erro ?? 'Não foi possível corrigir — tente de novo.');
        return;
      }
      setCorrecao(r.correcao);
      if (r.correcao.aprovado) {
        toast.success('Aprovado(a) — as regras do Radar valem para todas as suas respostas.');
        aoAprovar();
      }
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="nota" style={{ marginTop: 12 }}>
      <span className="eyebrow">Questionário deontológico</span>
      <h3>Antes de responder famílias: 10 perguntas sobre as regras</h3>
      <p className="fund">
        A aprovação exige as 10 corretas — pode refazer quantas vezes precisar. É o
        compromisso com o Provimento 205/2021 e com o Código de Ética que sustenta o
        Radar.
      </p>
      {QUESTOES_RADAR.map((q, i) => (
        <fieldset key={q.id} style={{ border: 0, padding: 0, margin: '12px 0 0' }}>
          <legend style={{ fontWeight: 600 }}>
            {i + 1}. {q.enunciado}
            {correcao && (
              <span
                className={correcao.erradas.includes(q.id) ? 'mono-alerta' : ''}
                style={{ marginLeft: 6 }}
              >
                {correcao.erradas.includes(q.id) ? '✗ rever' : '✓'}
              </span>
            )}
          </legend>
          {q.opcoes.map((op, j) => (
            <label key={j} className="marcar" style={{ fontWeight: 400, display: 'flex', marginTop: 4 }}>
              <input
                type="radio"
                name={`quiz-${q.id}`}
                checked={respostas[q.id] === j}
                onChange={() => setRespostas((prev) => ({ ...prev, [q.id]: j }))}
              />
              {op}
            </label>
          ))}
        </fieldset>
      ))}
      <div style={{ marginTop: 14 }}>
        {/* O botão CONCLUI o questionário (envia e corrige). Ele já se chamou
            "Corrigir" e parecia edição de respostas — usuários procuravam um
            "Concluir" que não existia. Convenção do módulo: botão desabilitado
            leva a razão por escrito logo abaixo. */}
        <Button loading={enviando} disabled={faltam > 0} onClick={() => void corrigir()}>
          {correcao && !correcao.aprovado ? 'Enviar de novo' : 'Concluir questionário'}
        </Button>
        {faltam > 0 && (
          <p className="fund" style={{ marginTop: 8 }}>
            Responda as 10 perguntas para concluir — {faltam === 1 ? 'falta 1' : `faltam ${faltam}`}.
          </p>
        )}
        {correcao && !correcao.aprovado && (
          <p className="mono-alerta" style={{ marginTop: 8 }}>
            {correcao.acertos} de {correcao.total} — reveja as marcadas com ✗ e envie de novo.
          </p>
        )}
      </div>
    </div>
  );
}
