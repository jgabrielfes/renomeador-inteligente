/**
 * Item V — Custos do inventário.
 *
 * A planilha de custos além do imposto: escritura em UM ato pela LEGÍTIMA
 * (herança sem a meação), renúncias como atos sem valor declarado, torna/
 * cessão pela base do valor da torna, registros por imóvel, certidões e a
 * taxa judiciária no rito judicial — tabelas oficiais 2026 com ISS de 5%
 * (motor: lib/partilha/custas.ts). Sucessões CUMULADAS entram aqui com o
 * PRÓPRIO fato gerador: ITCMD, escritura e registros de cada uma somam na
 * projeção. O total fecha com a provisão do ITCMD do item IV.
 */

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ProjecaoCustos } from '@/lib/partilha/custas';
import type { ProvisaoItcmd } from '@/lib/partilha/itcmd';
import { formatarData } from '@/lib/partilha/familia';
import type { SucessaoCumulada } from './itcmd-view';

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function CustosView({
  custos,
  provisao,
  provisoesSucessoes,
  issPct,
  setIssPct,
  irParaFamilia,
  irParaAcervo,
  avancar,
}: {
  custos: ProjecaoCustos | null;
  provisao: ProvisaoItcmd | null;
  provisoesSucessoes: { sucessao: SucessaoCumulada; base: number; provisao: ProvisaoItcmd }[];
  /** Alíquota do ISS do município da serventia (%). */
  issPct: string;
  setIssPct: (v: string) => void;
  irParaFamilia: () => void;
  irParaAcervo: () => void;
  /** Avança para o próximo item da esteira (Documentos). */
  avancar: () => void;
}) {
  const temTaxaJudicial = custos?.parcelas.some((p) => p.id === 'taxa-judiciaria') ?? false;
  const impostoSucessoes = provisoesSucessoes.reduce((a, p) => a + p.provisao.total, 0);

  return (
    <section>
      <h1>Custos do inventário</h1>
      <p className="subtitulo">
        A planilha completa além do imposto (tabelas paulistas de 2026, Lei 11.331/2002,
        com o ISS ajustável abaixo — o padrão é 5%, o maior do estado): a escritura é UM
        ato pela LEGÍTIMA (herança descontada a meação), qualquer que seja a quantidade
        de bens, herdeiros ou pagamentos; renúncia entra como ato sem valor declarado por
        renunciante; torna/cessão de direitos hereditários é ato próprio pela base do
        valor da torna, além do imposto inter vivos, se o caso.
      </p>

      {!custos && (
        <p className="mono-alerta">
          Lance a família e os bens (itens I e II) para o cálculo dos custos aparecer.
        </p>
      )}

      <div className="grade c2" style={{ marginBottom: 14, maxWidth: 420 }}>
        <label className="campo">
          <span>
            ISS do município da serventia (%){' '}
            <span className="dica">— a tabela oficial é publicada com 5%, o maior do estado</span>
          </span>
          <Input
            inputMode="decimal"
            value={issPct}
            onChange={(e) => setIssPct(e.target.value.replace(/[^\d.,]/g, '').slice(0, 5))}
          />
        </label>
      </div>

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
            {provisoesSucessoes.map(({ sucessao, base, provisao: pv }) => (
              <div key={sucessao.id}>
                <div className="lanc">
                  <span className="nome">ITCMD — sucessão cumulada de {sucessao.nome}</span>
                  <span className="fracao">fato gerador em {formatarData(sucessao.dataObito)}</span>
                  <span className="valor num" style={{ fontSize: 17 }}>{brl(pv.total)}</span>
                </div>
                <div className="fund">
                  Base de {brl(base)} (acervo por sucessão ou lançamento do item I) atualizada
                  para {brl(pv.baseAtualizada)};{' '}
                  {pv.diasDeAtraso > 0
                    ? `${pv.diasDeAtraso} dia(s) após o vencimento desta sucessão (encargos incluídos).`
                    : 'dentro do prazo desta sucessão.'}
                </div>
              </div>
            ))}
            <div className="lanc">
              <span className="nome">Custos cartorários{temTaxaJudicial ? ' e judiciais' : ''}{impostoSucessoes > 0 ? ' + ITCMD das sucessões cumuladas' : ''}</span>
              <span />
              <span className="valor num" style={{ fontSize: 18 }}>{brl(custos.total + impostoSucessoes)}</span>
            </div>
            {provisao && (
              <div className="lanc">
                <span className="nome">
                  CUSTO TOTAL PROJETADO (ITCMD + cartório{temTaxaJudicial ? ' + justiça' : ''})
                </span>
                <span className="fracao">provisão do item IV</span>
                <span className="valor num" style={{ fontSize: 22 }}>
                  {brl(provisao.total + custos.total + impostoSucessoes)}
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

      {/* O LANÇAMENTO das sucessões cumuladas fica no item I (A família) —
          aqui a planilha só reflete o impacto delas nos custos. */}
      {provisoesSucessoes.length === 0 && (
        <p className="fund" style={{ marginTop: 18 }}>
          Inventário com duas ou mais sucessões (cônjuge pré-morto, herdeiro falecido
          depois…)? Lance as sucessões cumuladas no item I —{' '}
          <Button variant="ghost" size="sm" onClick={irParaFamilia}>
            ir para A família
          </Button>{' '}
          — e cada uma entra aqui com o próprio fato gerador, escritura e registros.
        </p>
      )}

      <div className="rodape-acoes">
        <Button variant="outline" onClick={irParaAcervo}>
          Voltar ao acervo
        </Button>
        <Button onClick={avancar}>Avançar aos documentos</Button>
      </div>
    </section>
  );
}
