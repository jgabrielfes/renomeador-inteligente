'use client';

/**
 * FERRAMENTAS SUCESSÓRIAS — o agrupador das antigas abas IX/X/XI (pedido do
 * escritório): um item só na lombada, SEM algarismo, que abre as três
 * ferramentas de apoio. Cada card leva à ferramenta (as abas internas
 * `matricula`/`fontes`/`fiscal` seguem valendo — URL e F5 restauram).
 */

import { Button } from '@/components/ui/button';

const FERRAMENTAS = [
  {
    id: 'matricula',
    titulo: 'Análise de Matrícula',
    texto:
      'Relatório de situação dominial das certidões de matrícula — cadeia de titularidade, ônus ativos e alertas, com PDF nas cores do módulo.',
  },
  {
    id: 'fontes',
    titulo: 'Fontes de Pesquisa',
    texto:
      'Checklist da pesquisa patrimonial: onde procurar bens, saldos, veículos e participações do espólio, marcando o que já foi coberto.',
  },
  {
    id: 'fiscal',
    titulo: 'Imposto de Renda e GCAP',
    texto:
      'Ganho de capital do espólio (GCAP) — declarado × mercado, reduções e a decisão de atualizar — e o calendário da Declaração Final de Espólio.',
  },
] as const;

export type FerramentaSucessoria = (typeof FERRAMENTAS)[number]['id'];

export function FerramentasView({
  onAbrir,
}: {
  onAbrir: (id: FerramentaSucessoria) => void;
}) {
  return (
    <section>
      <h1>Ferramentas Sucessórias</h1>
      <p className="subtitulo">
        Três apoios ao caso, fora do rito das etapas — abra a ferramenta e volte
        quando quiser; nada aqui bloqueia a folha.
      </p>
      <div className="dash-grade" style={{ marginTop: 14 }}>
        {FERRAMENTAS.map((f) => (
          <div className="cartao" key={f.id}>
            <span className="eyebrow">Ferramenta</span>
            <h2 style={{ marginTop: 4 }}>{f.titulo}</h2>
            <p className="fund">{f.texto}</p>
            <Button size="sm" onClick={() => onAbrir(f.id)}>
              Abrir {f.titulo}
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
