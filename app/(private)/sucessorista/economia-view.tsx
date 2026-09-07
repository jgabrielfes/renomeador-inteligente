/**
 * Oportunidades de economia do caso — o mapeamento do motor
 * (lib/partilha/economia.ts) exibido na aba Partilha: o que a folha JÁ
 * garante e as sugestões de montagem que trazem economia real (imediata ou
 * no segundo óbito). Tudo é sugestão de planejamento — validação do(a)
 * advogado(a) responsável é obrigatória.
 */

import { Button } from '@/components/ui/button';
import { totalEstimado, type OportunidadeEconomia } from '@/lib/partilha/economia';

const brl = (v: number) =>
  `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Ação de aceite: redesenha a partilha automaticamente pela sugestão. */
export interface AcaoEconomia {
  rotulo: string;
  executar: () => void;
}

export function EconomiaView({
  economias,
  acoes = {},
}: {
  economias: OportunidadeEconomia[];
  /** Por id da oportunidade — cards sem ação ficam só informativos. */
  acoes?: Record<string, AcaoEconomia | undefined>;
}) {
  // "Economia garantida" saiu da tela (pedido do escritório): entre as já
  // aplicadas só fica a ISENÇÃO DE BENS do art. 6º — o sistema identificou
  // bem isento e isso é informação, não elogio. Sugestões seguem todas.
  const visiveis = economias.filter((o) => !o.aplicada || o.id === 'isencao-art6');
  if (visiveis.length === 0) return null;
  const total = totalEstimado(visiveis);
  const garantidas = visiveis.filter((o) => o.aplicada).length;

  return (
    <div className="economias">
      <h2>Oportunidades de economia</h2>
      <p className="subtitulo" style={{ marginBottom: 10 }}>
        Montagens de <strong>menor custo tributário</strong> mapeadas
        automaticamente a partir da folha — {garantidas > 0 ? `${garantidas} isenção(ões) de bem já identificada(s) e ` : ''}
        o restante depende de decisão da família. Economia estimada somada:{' '}
        <strong className="num">{brl(total)}</strong>.
      </p>
      <p className="fund" style={{ marginTop: -4, marginBottom: 10 }}>
        Comparação aritmética entre montagens lícitas, com as premissas à vista em
        cada card — não é recomendação nem aconselhamento jurídico: a decisão é do(a)
        advogado(a) com a família.
      </p>
      {visiveis.map((o) => (
        <div key={o.id} className={`nota oportunidade${o.aplicada ? ' registro' : ''}`}>
          <span className="eyebrow">
            {o.aplicada ? 'Bem isento identificado' : 'Sugestão'} ·{' '}
            {o.horizonte === 'FUTURA' ? 'evita custo futuro' : 'neste inventário'}
            {o.economiaEstimada !== null && (
              <span className="num"> · {brl(o.economiaEstimada)}</span>
            )}
          </span>
          <h3>{o.titulo}</h3>
          <p>{o.explicacao}</p>
          {o.condicoes.length > 0 && (
            <ul className="condicoes">
              {o.condicoes.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
          )}
          <p className="fund">{o.fundamento}</p>
          {acoes[o.id] && (
            <div className="escolha" style={{ marginTop: 10 }}>
              <Button size="sm" onClick={acoes[o.id]!.executar}>
                {acoes[o.id]!.rotulo}
              </Button>
              <span className="fund" style={{ alignSelf: 'center' }}>
                Redesenha a partilha na hora — confira o espelho antes de gerar documentos.
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
