/**
 * Painel do caso — coluna fixa à direita, sempre visível.
 *
 * A folha é preenchida no centro; aqui cada campo digitado vira número na
 * hora: régua do prazo do art. 611 do CPC com o custo em reais de cada
 * degrau (multa de 10% e 20%), custo fiscal aberto em imposto/multa/juros,
 * acervo, rito provável e pontos de atenção. Nada aqui é editável — é o
 * resumo executivo que o advogado consulta o tempo todo.
 */

import { useMemo } from 'react';
import type { Bem, Herdeiro, Regime, Resultado, Vinculo } from '@/lib/partilha/types';
import { formatarData, type DadosFalecido } from '@/lib/partilha/familia';
import {
  ALIQUOTA_ITCMD_SP,
  impostoProgressivo,
  type FaixaProgressiva,
  type ProvisaoItcmd,
  type ResultadoIsencoes,
} from '@/lib/partilha/itcmd';

const brl = (v: number | string) =>
  `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function hojeIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function diffDias(a: string, b: string): number {
  return Math.round((new Date(`${b}T00:00`).getTime() - new Date(`${a}T00:00`).getTime()) / 86_400_000);
}

export function PainelCaso({
  falecido,
  temSobrevivente,
  vinculo,
  regime,
  herdeiros,
  bens,
  resultado,
  provisao,
  isencoes,
  faixas,
}: {
  falecido: DadosFalecido;
  temSobrevivente: boolean;
  vinculo: Vinculo;
  regime: Regime;
  herdeiros: Herdeiro[];
  bens: Bem[];
  resultado: Resultado | null;
  provisao: ProvisaoItcmd | null;
  isencoes: ResultadoIsencoes | null;
  faixas: FaixaProgressiva[];
}) {
  const temObito = Boolean(falecido.dataObito);
  const dias = temObito ? diffDias(falecido.dataObito, hojeIso()) : 0;
  const imposto = provisao?.imposto ?? 0;

  const parcela = (id: string) =>
    provisao?.parcelas.filter((p) => p.id === id).reduce((s, p) => s + p.valor, 0) ?? 0;
  const multas = parcela('multa-abertura') + parcela('multa-moratoria');
  const juros = parcela('juros');
  const desconto = parcela('desconto');

  /* comparativo da reforma: mesmas bases do item V (líquidas de isenção e
     atualizadas pela UFESP), faixas sobre cada quinhão */
  const comparativo = useMemo(() => {
    if (!resultado || !provisao || resultado.bloqueios.length > 0) return null;
    const herancaBruta = Number(resultado.heranca.total);
    if (herancaBruta <= 0) return null;
    const baseLiquida = Math.max(0, herancaBruta - (isencoes?.valorIsento ?? 0));
    const fatorIsencao = baseLiquida / herancaBruta;
    const fatorAtualizacao = baseLiquida > 0 ? provisao.baseAtualizada / baseLiquida : 0;
    let fixo = 0;
    let prog = 0;
    for (const q of resultado.quinhoes) {
      const base = Number(q.valor) * fatorIsencao * fatorAtualizacao;
      fixo += base * ALIQUOTA_ITCMD_SP;
      prog += impostoProgressivo(base, provisao.ufespReferencia, faixas).imposto;
    }
    return { fixo, prog, diferenca: prog - fixo };
  }, [resultado, provisao, isencoes, faixas]);

  const incapaz = herdeiros.some((h) => h.menorOuIncapaz);
  const extrajudicial = resultado ? resultado.elegivelExtrajudicial : !incapaz;

  const travas: string[] = [];
  if (incapaz)
    travas.push('Herdeiro incapaz — extrajudicial só com parecer favorável do MP (Res. CNJ 571/2024)');
  if (bens.some((b) => b.tipo === 'QUOTAS'))
    travas.push('Quotas no acervo — base a valor de mercado (LC 227/2026)');
  if (
    temSobrevivente &&
    regime === 'COMUNHAO_PARCIAL' &&
    resultado &&
    Number(resultado.heranca.particular) > 0
  )
    travas.push('Bens particulares — o(a) sobrevivente concorre com os descendentes');
  if (temSobrevivente && vinculo === 'UNIAO_ESTAVEL')
    travas.push('União estável — comprovar o vínculo e o regime aplicável');
  if (!bens.some((b) => Number(b.valor) > 0)) travas.push('Acervo ainda sem valores');
  for (const b of resultado?.bloqueios ?? []) travas.push(b);

  const custo10 = imposto * 0.1;
  const custo20 = imposto * 0.2;
  const cls = dias > 180 ? 'tarde' : dias > 60 ? 'meio' : '';
  const largura = Math.min(100, Math.max(2, (dias / 240) * 100));

  return (
    <aside className="painel" aria-label="Painel do caso">
      <h2>Painel do caso</h2>
      <p className="sub">
        {temObito
          ? `${falecido.nome || 'Caso sem nome'} — óbito em ${formatarData(falecido.dataObito)}`
          : 'Comece pela data do óbito — só isso já move três números aqui.'}
      </p>

      {temObito && (
        <div className="metrica">
          <div className="k">Prazo do art. 611 do CPC</div>
          <div className={`v num ${dias > 60 ? 'lacre' : 'verde'}`} style={{ fontSize: 20 }}>
            {dias} dia(s) desde o óbito
          </div>
          <div className="regua" aria-hidden>
            <div className="barra">
              <div className={`preenchido ${cls}`} style={{ width: `${largura}%` }} />
            </div>
            <div className="marcas num">
              <span>0</span>
              <span>60 — multa 10%</span>
              <span>180 — multa 20%</span>
            </div>
          </div>
          <p className="rodape">
            {dias <= 60 ? (
              <>
                Restam <strong>{60 - dias} dia(s)</strong> para requerer sem multa.
                {imposto > 0 && <> Abrir depois custa {brl(custo10)}.</>}
              </>
            ) : dias <= 180 ? (
              <>
                Multa de 10% já incidente{imposto > 0 && <>: {brl(custo10)}</>}. Depois do 181º
                dia ela dobra{imposto > 0 && <> para {brl(custo20)}</>}.
              </>
            ) : (
              <>
                Multa de 20% incidente{imposto > 0 && <>: {brl(custo20)}</>}. Após o vencimento
                (180 dias) correm multa moratória e juros.
              </>
            )}
          </p>
        </div>
      )}

      <div className="metrica">
        <div className="k">Custo fiscal do inventário</div>
        <div className="v num">{provisao ? brl(provisao.total) : '—'}</div>
        {provisao ? (
          <div className="pilha num">
            <div>
              <span className="rotulo">ITCMD</span>
              <span>{brl(imposto)}</span>
            </div>
            <div>
              <span className="rotulo">Multas</span>
              <span>{brl(multas)}</span>
            </div>
            <div>
              <span className="rotulo">Juros</span>
              <span>{brl(juros)}</span>
            </div>
            {desconto < 0 && (
              <div>
                <span className="rotulo">Desconto de 5% (até 90 dias)</span>
                <span style={{ color: 'var(--verde-registro)' }}>− {brl(-desconto)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="rodape">Informe a data do óbito e ao menos um bem com valor.</p>
        )}
      </div>

      <div className="metrica">
        <div className="k">Acervo</div>
        <div className="v sm num">{resultado ? brl(resultado.acervo.massaPartilhavel) : '—'}</div>
        {resultado ? (
          <div className="pilha num">
            {resultado.meacao && (
              <div>
                <span className="rotulo">Meação — {resultado.meacao.beneficiario}</span>
                <span>{brl(resultado.meacao.valor)}</span>
              </div>
            )}
            <div>
              <span className="rotulo">Dívidas do espólio</span>
              <span>{brl(resultado.acervo.dividas)}</span>
            </div>
            <div>
              <span className="rotulo">Herança transmitida</span>
              <span>{brl(resultado.heranca.total)}</span>
            </div>
            {isencoes && isencoes.valorIsento > 0 && (
              <div>
                <span className="rotulo">Isenções do art. 6º</span>
                <span style={{ color: 'var(--verde-registro)' }}>− {brl(isencoes.valorIsento)}</span>
              </div>
            )}
          </div>
        ) : (
          <p className="rodape">Lance os bens no item II.</p>
        )}
      </div>

      <div className="metrica">
        <div className="k">Rito provável</div>
        <div className={`v sm ${extrajudicial ? '' : 'lacre'}`}>
          {extrajudicial ? 'Extrajudicial' : 'Judicial'}
        </div>
        <p className="rodape">
          {extrajudicial
            ? incapaz
              ? 'Com herdeiro incapaz, a escritura exige parecer favorável do Ministério Público (Res. CNJ 571/2024).'
              : 'Herdeiros capazes e consenso permitem escritura em qualquer tabelionato.'
            : 'Há bloqueio apontado pelo motor — ver pontos de atenção.'}
        </p>
      </div>

      {comparativo && (
        <div className="metrica">
          <div className="k">Se a tabela progressiva valesse hoje</div>
          <div className={`v sm num ${comparativo.diferenca > 0 ? 'lacre' : 'verde'}`}>
            {comparativo.diferenca > 0 ? '+' : ''}
            {brl(comparativo.diferenca)}
          </div>
          <p className="rodape num">
            {brl(comparativo.prog)} contra {brl(comparativo.fixo)} de hoje. A progressividade da
            LC 227/2026 incide sobre cada quinhão — mais herdeiros diluem a alíquota.
          </p>
        </div>
      )}

      <div className="metrica">
        <div className="k">Pontos de atenção</div>
        {travas.length > 0 ? (
          travas.map((t) => (
            <div key={t} className="alerta-painel">
              {t}
            </div>
          ))
        ) : (
          <p className="rodape">Nada travando por enquanto.</p>
        )}
      </div>
    </aside>
  );
}
