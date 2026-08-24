/**
 * Barra das 5 FASES do inventário + ações rápidas — o esqueleto do produto
 * tornado visível no dashboard: composição → acervo → quinhões → cofre →
 * espelho ITCMD, cada fase CLICÁVEL (navega para a aba correspondente da
 * lombada) e marcada quando a folha já a alimentou. A navegação continua
 * LIVRE — a barra informa progresso, nunca bloqueia (invariante do módulo).
 */

import { Button } from '@/components/ui/button';

export interface FaseCaso {
  /** Aba da lombada que a fase abre. */
  aba: string;
  rotulo: string;
  /** true = a folha já tem o essencial desta fase. */
  completa: boolean;
  /** Uma linha de contexto ("3 herdeiros", "aguardando documentos"…). */
  resumo: string;
}

export interface AcaoRapida {
  rotulo: string;
  aba: string;
}

export function FasesCaso({
  fases,
  acoes,
  irPara,
}: {
  fases: FaseCaso[];
  acoes: AcaoRapida[];
  irPara: (aba: string) => void;
}) {
  const feitas = fases.filter((f) => f.completa).length;
  return (
    <div className="cartao fases-caso">
      <div className="fases-cabeca">
        <span className="eyebrow">As 5 fases do inventário</span>
        <span className="fund num">{feitas} de {fases.length} com o essencial</span>
      </div>
      <ol className="fases-trilho">
        {fases.map((f, i) => (
          <li key={f.aba}>
            <button
              type="button"
              className={`fase${f.completa ? ' completa' : ''}`}
              onClick={() => irPara(f.aba)}
              title={`Abrir ${f.rotulo}`}
            >
              <span className="fase-numero" aria-hidden>
                {f.completa ? '✓' : i + 1}
              </span>
              <span className="fase-rotulo">{f.rotulo}</span>
              <span className="fase-resumo">{f.resumo}</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="escolha" style={{ marginTop: 10 }}>
        {acoes.map((a) => (
          <Button key={a.aba + a.rotulo} size="sm" variant="outline" onClick={() => irPara(a.aba)}>
            {a.rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}
