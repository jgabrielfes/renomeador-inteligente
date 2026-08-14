/**
 * Item V — Custos do inventário.
 *
 * A planilha de custos além do imposto: escritura calculada POR PAGAMENTO
 * (Nota Explicativa 3.1.1), atos inter vivos da partilha diferenciada,
 * registros por imóvel, certidões e a taxa judiciária no rito judicial —
 * tabelas oficiais 2026 com ISS de 5% (motor: lib/partilha/custas.ts). O
 * total fecha com a provisão do ITCMD do item IV.
 */

import { Button } from '@/components/ui/button';
import type { ProjecaoCustos } from '@/lib/partilha/custas';
import type { ProvisaoItcmd } from '@/lib/partilha/itcmd';

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CustosView({
  custos,
  provisao,
  irParaAcervo,
  irParaItcmd,
}: {
  custos: ProjecaoCustos | null;
  provisao: ProvisaoItcmd | null;
  irParaAcervo: () => void;
  irParaItcmd: () => void;
}) {
  const temTaxaJudicial = custos?.parcelas.some((p) => p.id === 'taxa-judiciaria') ?? false;

  return (
    <section>
      <h1>Custos do inventário</h1>
      <p className="subtitulo">
        A planilha completa além do imposto: emolumentos pelas tabelas paulistas de 2026
        (Lei 11.331/2002, sempre com ISS de 5% — o maior do estado, para não errar para
        menos) e certidões. A escritura da partilha é calculada POR PAGAMENTO (Nota
        Explicativa 3.1.1) e a forma da partilha importa: ato inter vivos embutido
        (doação, cessão, usufruto/nua-propriedade) gera atos A MAIS no tabelionato e no
        registro.
      </p>

      {!custos && (
        <p className="mono-alerta">
          Lance a família e os bens (itens I e II) para o cálculo dos custos aparecer.
        </p>
      )}

      {custos && (
        <>
          <div className="espelho">
            <div className="cabeca">
              <span>Parcela</span>
              <span>Fundamento</span>
              <span style={{ textAlign: 'right' }}>Valor</span>
            </div>
            {custos.parcelas.map((p) => (
              <div key={p.id}>
                <div className="lanc">
                  <span className="nome">
                    {p.rotulo}
                    {p.aproximado ? ' *' : ''}
                  </span>
                  <span className="fracao">{p.fundamento}</span>
                  <span className="valor num" style={{ fontSize: 17 }}>{brl(p.valor)}</span>
                </div>
                {p.detalhe && <div className="fund">{p.detalhe}</div>}
              </div>
            ))}
            <div className="lanc">
              <span className="nome">Custos cartorários{temTaxaJudicial ? ' e judiciais' : ''}</span>
              <span />
              <span className="valor num" style={{ fontSize: 18 }}>{brl(custos.total)}</span>
            </div>
            {provisao && (
              <div className="lanc">
                <span className="nome">
                  CUSTO TOTAL PROJETADO (ITCMD + cartório{temTaxaJudicial ? ' + justiça' : ''})
                </span>
                <span className="fracao">provisão do item IV</span>
                <span className="valor num" style={{ fontSize: 22 }}>
                  {brl(provisao.total + custos.total)}
                </span>
              </div>
            )}
          </div>
          <p className="fund" style={{ marginTop: 6 }}>
            * valor aproximado ou contagem de atos a confirmar — conferir a tabela vigente
            (anoregsp.org.br · registrodeimoveis.org.br · registrocivil.org.br) e os
            enunciados do CNB/SP antes de fechar o orçamento com a família.
          </p>
          {custos.avisos.map((a, i) => (
            <p key={i} className="fund" style={{ marginTop: 6 }}>
              {a}
            </p>
          ))}
        </>
      )}

      <div className="rodape-acoes">
        <Button variant="outline" onClick={irParaAcervo}>
          Voltar ao acervo
        </Button>
        <Button onClick={irParaItcmd}>Ver o ITCMD</Button>
      </div>
    </section>
  );
}
