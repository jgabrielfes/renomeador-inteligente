'use client';

/**
 * Tela de RESULTADO da área "Para famílias" — compartilhada entre o fim do
 * questionário e a página salva (/familias/resultado/[token]). Recebe tudo
 * calculado (motores puros rodam em quem chama); `acoes` injeta os botões
 * do contexto (PDF, salvar, e-mail…).
 */

import type { RespostasFamilia } from '@/lib/familias/tipos';
import type { Triagem } from '@/lib/familias/triagem';
import type { EstimativaCompleta } from '@/lib/familias/estimativas';
import type { ItemChecklist } from '@/lib/familias/documentos';

export const ROTULO_VIA = {
  EXTRAJUDICIAL: 'Inventário em cartório (extrajudicial)',
  JUDICIAL: 'Inventário judicial',
  ALVARA: 'Alvará judicial (caminho simplificado)',
} as const;

export const brl = (v: number) =>
  `R$ ${Math.round(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;

export const dataBr = (iso: string) => {
  if (!iso) return '';
  const [a, m, d] = iso.split('-');
  return `${d}/${m}/${a}`;
};

export function ResultadoView({
  r,
  triagem,
  estimativa,
  docs,
  acoes,
}: {
  r: RespostasFamilia;
  triagem: Triagem;
  estimativa: EstimativaCompleta;
  docs: ItemChecklist[];
  acoes?: React.ReactNode;
}) {
  return (
    <>
      <span className="eyebrow">Seu resultado — gratuito, sem cadastro</span>
      <h1>{ROTULO_VIA[triagem.via]}</h1>
      <p className="subtitulo">
        Com base no que você respondeu{r.nome.trim() ? `, ${r.nome.trim().split(/\s+/)[0]}` : ''}.
        Os números são estimativas por faixa — servem para você chegar preparado(a) à
        conversa com um advogado, não para substituí-la.
      </p>

      <h2>Por que esse caminho</h2>
      {triagem.motivos.map((m, i) => (
        <p key={i} style={{ marginTop: 6 }}>
          {m}
        </p>
      ))}
      {triagem.observacoes.map((o, i) => (
        <p key={i} className="fund" style={{ marginTop: 6 }}>
          {o}
        </p>
      ))}

      <h2>Estimativa do imposto (ITCMD)</h2>
      <ul className="custos-portal">
        {estimativa.itcmd.map((e) => (
          <li key={e.uf}>
            <span>
              {e.uf}
              <span className="fase-descricao">
                {e.precisao === 'motor-sp'
                  ? 'cálculo pela lei paulista, com atualização e eventuais multas'
                  : 'faixa pela alíquota do estado'}
              </span>
            </span>
            <span className="num">
              {brl(e.faixa.min)} a {brl(e.faixa.max)}
            </span>
          </li>
        ))}
        {estimativa.itcmd.length > 1 && (
          <li>
            <span>
              <strong>Total estimado</strong>
            </span>
            <span className="num">
              <strong>
                {brl(estimativa.itcmdTotal.min)} a {brl(estimativa.itcmdTotal.max)}
              </strong>
            </span>
          </li>
        )}
      </ul>
      {estimativa.itcmd.flatMap((e) => e.avisos).map((a, i) => (
        <p key={i} className="fund" style={{ marginTop: 4 }}>
          {a}
        </p>
      ))}

      <h2>{estimativa.custos.rotulo}</h2>
      <ul className="custos-portal">
        <li>
          <span>Faixa estimada</span>
          <span className="num">
            {brl(estimativa.custos.faixa.min)} a {brl(estimativa.custos.faixa.max)}
          </span>
        </li>
      </ul>
      {estimativa.custos.avisos.map((a, i) => (
        <p key={i} className="fund" style={{ marginTop: 4 }}>
          {a}
        </p>
      ))}

      <h2>Prazo</h2>
      <div className={`nota ${estimativa.prazo.aberturaVencida ? 'exigencia' : ''}`}>
        <p>{estimativa.prazo.texto}</p>
        {estimativa.prazo.limiteAbertura && (
          <p className="fund" style={{ marginTop: 4 }}>
            Prazo de abertura: até {dataBr(estimativa.prazo.limiteAbertura)}.
          </p>
        )}
      </div>

      <h2>Documentos que a família já pode separar</h2>
      <ul className="custos-portal">
        {docs.map((d) => (
          <li key={d.id}>
            <span>
              {d.titulo}
              <span className="fase-descricao">{d.detalhe}</span>
            </span>
          </li>
        ))}
      </ul>

      <h2>Próximos passos</h2>
      <ol className="fase-lista">
        <li className="fase-item atual">
          <span className="fase-ponto num">1</span>
          <span>Separe os documentos da lista acima — é o que mais adianta o trabalho.</span>
        </li>
        <li className="fase-item">
          <span className="fase-ponto num">2</span>
          <span>
            {r.consenso === 'sim'
              ? 'Combine com os demais herdeiros quem vai acompanhar o processo (o inventariante).'
              : 'Converse com os demais herdeiros — com todos de acordo, o caminho fica mais rápido e barato.'}
          </span>
        </li>
        <li className="fase-item">
          <span className="fase-ponto num">3</span>
          <span>
            Procure um(a) advogado(a) de sua confiança com experiência em inventários —
            mesmo em cartório, a lei exige advogado. Leve este resultado: ele encurta a
            primeira conversa.
          </span>
        </li>
      </ol>

      {estimativa.avisos.map((a, i) => (
        <p key={i} className="fund" style={{ marginTop: 8 }}>
          {a}
        </p>
      ))}

      {acoes}

      <footer className="rodape-etico">
        Orientação geral e gratuita — não substitui a consulta com advogado(a). Esta
        plataforma não intermedeia honorários nem indica advogados.
      </footer>
    </>
  );
}
