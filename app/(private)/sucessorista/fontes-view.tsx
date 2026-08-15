/**
 * Item X — Fontes de pesquisa patrimonial.
 *
 * O checklist de investigação do acervo, agora em item próprio (saiu do
 * Acervo a pedido do escritório): as fontes na ordem de prioridade — o
 * testamento primeiro, porque decide a via — com status por fonte e link do
 * portal de consulta. O que for encontrado é lançado no item II.
 */

import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { montarChecklistAcervo, StatusItemAcervo } from '@/lib/partilha/acervo';

export function FontesView({
  checklist,
  setChecklist,
  irParaAcervo,
}: {
  checklist: ReturnType<typeof montarChecklistAcervo>;
  setChecklist: (c: ReturnType<typeof montarChecklistAcervo>) => void;
  irParaAcervo: () => void;
}) {
  const feitos = checklist.filter(
    (i) => i.status === 'RECEBIDO' || i.status === 'NAO_SE_APLICA',
  ).length;

  return (
    <section>
      <h1>Fontes de pesquisa patrimonial</h1>
      <p className="subtitulo">
        O que mais atrasa inventário é herdeiro que não sabe o que o falecido tinha.
        Percorra as fontes na ordem — o testamento primeiro, porque decide a via — e lance
        no item II (O acervo) o que cada consulta revelar.
      </p>

      <p className="progresso num">
        {feitos} de {checklist.length} fontes concluídas
      </p>
      <div className="check">
        {checklist.map((item, idx) => (
          <div className="check-item" key={item.fonte.id}>
            <span className="prio">P{item.fonte.prioridade}</span>
            <div>
              <h4>{item.fonte.nome}</h4>
              <p>{item.fonte.oQueRevela}</p>
              <p>
                <strong>Como:</strong> {item.fonte.comoConsultar}{' '}
                {item.fonte.url && (
                  <a href={item.fonte.url} target="_blank" rel="noreferrer">
                    abrir portal ↗
                  </a>
                )}
              </p>
            </div>
            <Select
              value={item.status}
              onValueChange={(v) => {
                if (!v) return;
                setChecklist(
                  checklist.map((x, i) =>
                    i === idx ? { ...x, status: String(v) as StatusItemAcervo } : x,
                  ),
                );
              }}
            >
              <SelectTrigger size="sm" aria-label={`Status de ${item.fonte.nome}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDENTE">Pendente</SelectItem>
                <SelectItem value="SOLICITADO">Solicitado</SelectItem>
                <SelectItem value="RECEBIDO">Recebido</SelectItem>
                <SelectItem value="NAO_SE_APLICA">Não se aplica</SelectItem>
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>

      <div className="rodape-acoes">
        <span />
        <Button onClick={irParaAcervo}>Lançar os achados no acervo</Button>
      </div>
    </section>
  );
}
