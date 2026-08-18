/**
 * Gráfico de PIZZA VIVO da partilha (aba III): a divisão percentual do
 * acervo entre meação e quinhões, animada ao abrir a aba — as fatias
 * crescem e os percentuais sobem até o valor final (~0,9s, easing suave).
 *
 * Convenções de dataviz: cores categóricas em ORDEM FIXA (paleta validada
 * para daltonismo sobre o papel do módulo), fatias separadas por um fio de
 * papel, identidade sempre com RÓTULO (legenda com nome, % e valor — nunca
 * cor sozinha) e tooltip nativo por fatia. Mais de 7 participantes: o
 * excedente agrupa em "Outros" (nunca inventar cor nova).
 */

import { useEffect, useRef, useState } from 'react';

export interface FatiaQuinhao {
  nome: string;
  valor: number;
  /** Linha auxiliar da legenda (ex.: a fração da herança). */
  sub?: string;
}

/** Ordem fixa — paleta categórica validada (CVD ΔE ≥ 9 sobre o papel). */
const CORES = [
  '#2a78d6',
  '#eb6834',
  '#1baf7a',
  '#eda100',
  '#e87ba4',
  '#008300',
  '#4a3aa7',
  '#e34948',
];

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function arco(cx: number, cy: number, r: number, a0: number, a1: number): string {
  // Ângulos em graus, 0° no topo, sentido horário. Fatia = setor circular.
  const rad = (a: number) => ((a - 90) * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  const grande = a1 - a0 > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${x0} ${y0} A ${r} ${r} 0 ${grande} 1 ${x1} ${y1} Z`;
}

export function GraficoQuinhoes({ fatias, total }: { fatias: FatiaQuinhao[]; total: number }) {
  // Progresso da animação (0 → 1), easing ease-out cúbico.
  const [t, setT] = useState(0);
  const rafRef = useRef(0);
  useEffect(() => {
    const inicio = performance.now();
    const DURACAO = 900;
    const passo = (agora: number) => {
      const linear = Math.min(1, (agora - inicio) / DURACAO);
      setT(1 - Math.pow(1 - linear, 3));
      if (linear < 1) rafRef.current = requestAnimationFrame(passo);
    };
    rafRef.current = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  const validas = fatias.filter((f) => f.valor > 0);
  if (total <= 0 || validas.length === 0) return null;

  // Mais participantes que cores: o excedente vira "Outros" (ordem fixa).
  const LIMITE = CORES.length - 1;
  const visiveis =
    validas.length <= CORES.length
      ? validas
      : [
          ...validas.slice(0, LIMITE),
          {
            nome: `Outros (${validas.length - LIMITE})`,
            valor: validas.slice(LIMITE).reduce((a, f) => a + f.valor, 0),
          },
        ];

  // Frações acumuladas SEM reatribuição (regra do React Compiler): o início
  // de cada fatia é a soma das anteriores.
  const setores = visiveis.map((f, i) => {
    const antes = visiveis.slice(0, i).reduce((a, x) => a + x.valor / total, 0);
    const fracao = f.valor / total;
    const a0 = antes * 360 * t;
    // Limita a 359.98° para a fatia única (100%) não degenerar o arco.
    const a1 = Math.min((antes + fracao) * 360 * t, 359.98);
    return { ...f, fracao, a0, a1, cor: CORES[i] };
  });

  return (
    <div className="pizza-quinhoes">
      <svg width={190} height={190} viewBox="0 0 190 190" role="img" aria-label="Divisão do acervo em percentuais">
        {setores.map((s) => (
          <path
            key={s.nome}
            d={arco(95, 95, 88, s.a0, s.a1)}
            fill={s.cor}
            stroke="var(--papel-alto)"
            strokeWidth={2}
            strokeLinejoin="round"
          >
            <title>{`${s.nome} — ${(s.fracao * 100).toFixed(2).replace('.', ',')}% · ${brl(s.valor)}`}</title>
          </path>
        ))}
      </svg>
      <div className="pizza-legenda">
        {setores.map((s) => (
          <div className="item" key={s.nome}>
            <span className="cor" style={{ background: s.cor }} aria-hidden />
            <span>
              {s.nome}
              {'sub' in s && s.sub ? <span className="fund"> · {s.sub}</span> : null}
              <span className="fund num" style={{ display: 'block' }}>{brl(s.valor)}</span>
            </span>
            <span className="pct num">{(s.fracao * 100 * t).toFixed(2).replace('.', ',')}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
