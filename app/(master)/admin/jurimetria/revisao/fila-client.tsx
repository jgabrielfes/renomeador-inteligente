'use client';

// Fila de revisão — um item por vez, atalhos A/C/D (aprovar/corrigir/
// descartar). Cada cartão é um componente COM KEY própria: trocar de item
// renasce o estado dos campos sem efeito de sincronização.

import { useCallback, useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { decidirRevisao } from '../actions';

interface CardRevisao {
  revisaoId: string;
  motivos: string[];
  textoNormalizado: string;
  trechoOrigem: string | null;
  fundamentacao: string[];
  resultado: string;
  dataExigencia: string;
  confianca: number;
  cartorioId: string | null;
  cartorioNome: string | null;
  titularNome: string | null;
  temaId: string | null;
  temaRotulo: string | null;
  fonteNome: string;
  urlOrigem: string | null;
}

interface Opcao {
  id: string;
  nome?: string;
  rotulo?: string;
}

const ROTULO_MOTIVO: Record<string, string> = {
  baixa_confianca: 'confiança baixa',
  titular_pendente: 'titular pendente',
  possivel_dado_pessoal: 'possível dado pessoal',
  cartorio_nao_identificado: 'cartório não identificado',
  auditoria: 'auditoria (5%)',
};

export function FilaRevisao({
  cards,
  cartorios,
  temas,
  totalPendentes,
}: {
  cards: CardRevisao[];
  cartorios: { id: string; nome: string }[];
  temas: { id: string; rotulo: string }[];
  totalPendentes: number;
}) {
  const [indice, setIndice] = useState(0);
  const item = cards[indice];
  const decididos = indice;
  const progresso = `${decididos} decidido(s) nesta sessão · ${Math.max(totalPendentes - decididos, 0)} na fila`;

  if (!item)
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        {totalPendentes - decididos > 0
          ? 'Lote concluído — recarregue a página para puxar os próximos 100.'
          : 'Fila vazia. Nada aguardando revisão.'}
        <p className="mt-1">{progresso}</p>
      </div>
    );

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{progresso}</span>
        <span>
          Atalhos: <kbd className="rounded border px-1">A</kbd> aprovar ·{' '}
          <kbd className="rounded border px-1">C</kbd> corrigir ·{' '}
          <kbd className="rounded border px-1">D</kbd> descartar
        </span>
      </div>
      <CartaoRevisao
        key={item.revisaoId}
        item={item}
        cartorios={cartorios}
        temas={temas}
        aoDecidir={() => setIndice((i) => i + 1)}
      />
    </section>
  );
}

function CartaoRevisao({
  item,
  cartorios,
  temas,
  aoDecidir,
}: {
  item: CardRevisao;
  cartorios: Opcao[];
  temas: Opcao[];
  aoDecidir: () => void;
}) {
  const [pendente, comecar] = useTransition();
  const [corrigindo, setCorrigindo] = useState(false);
  const [texto, setTexto] = useState(item.textoNormalizado);
  const [cartorioId, setCartorioId] = useState(item.cartorioId ?? '');
  const [temaId, setTemaId] = useState(item.temaId ?? '');
  const [resultado, setResultado] = useState(item.resultado);

  const decidir = useCallback(
    (decisao: Parameters<typeof decidirRevisao>[1]) => {
      if (pendente) return;
      comecar(async () => {
        const r = await decidirRevisao(item.revisaoId, decisao);
        if (r.ok) aoDecidir();
        else toast.error(r.erro ?? 'Não deu certo.');
      });
    },
    [item.revisaoId, pendente, aoDecidir],
  );

  const aprovar = useCallback(() => decidir({ tipo: 'aprovar' }), [decidir]);
  const descartar = useCallback(() => decidir({ tipo: 'descartar' }), [decidir]);
  const confirmarCorrecao = () =>
    decidir({
      tipo: 'corrigir',
      campos: {
        textoNormalizado: texto,
        cartorioId: cartorioId || null,
        temaId: temaId || null,
        resultado,
      },
    });

  // Atalhos A/C/D — ignorados enquanto um campo tem o foco.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT')
        return;
      if (e.key === 'a' || e.key === 'A') aprovar();
      else if (e.key === 'd' || e.key === 'D') descartar();
      else if (e.key === 'c' || e.key === 'C') setCorrigindo(true);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  }, [aprovar, descartar]);

  return (
    <article className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap gap-1.5">
        {item.motivos.map((m) => (
          <Badge key={m} variant="destructive">
            {ROTULO_MOTIVO[m] ?? m}
          </Badge>
        ))}
        <Badge variant="outline">confiança {item.confianca.toFixed(2)}</Badge>
        <Badge variant="outline">{item.dataExigencia}</Badge>
      </div>

      {corrigindo ? (
        <Input value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Texto da exigência" />
      ) : (
        <p className="text-base font-medium">{item.textoNormalizado}</p>
      )}

      {item.trechoOrigem && (
        <blockquote className="border-l-2 pl-3 text-sm text-muted-foreground">
          “{item.trechoOrigem}”
        </blockquote>
      )}
      {item.fundamentacao.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Fundamentação citada: {item.fundamentacao.join(' · ')}
        </p>
      )}

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">Cartório sugerido</dt>
          {corrigindo ? (
            <select
              className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5"
              value={cartorioId}
              onChange={(e) => setCartorioId(e.target.value)}
              aria-label="Cartório"
            >
              <option value="">— sem cartório (não publica) —</option>
              {cartorios.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          ) : (
            <dd>{item.cartorioNome ?? '—'}</dd>
          )}
        </div>
        <div>
          <dt className="text-muted-foreground">Tema sugerido</dt>
          {corrigindo ? (
            <select
              className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5"
              value={temaId}
              onChange={(e) => setTemaId(e.target.value)}
              aria-label="Tema"
            >
              <option value="">— sem tema —</option>
              {temas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.rotulo}
                </option>
              ))}
            </select>
          ) : (
            <dd>{item.temaRotulo ?? '—'}</dd>
          )}
        </div>
        <div>
          <dt className="text-muted-foreground">Titular na data</dt>
          <dd>{item.titularNome ?? 'pendente de cadastro'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Resultado</dt>
          {corrigindo ? (
            <select
              className="mt-1 w-full rounded-md border bg-transparent px-2 py-1.5"
              value={resultado}
              onChange={(e) => setResultado(e.target.value)}
              aria-label="Resultado"
            >
              <option value="sem_julgamento">sem julgamento</option>
              <option value="mantida">mantida</option>
              <option value="afastada">afastada</option>
              <option value="parcial">parcial</option>
            </select>
          ) : (
            <dd>{item.resultado.replace('_', ' ')}</dd>
          )}
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        Fonte: {item.fonteNome}
        {item.urlOrigem ? ` · ${item.urlOrigem}` : ''}
      </p>

      <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
        <Button type="button" variant="ghost" className="text-destructive" loading={pendente} onClick={descartar}>
          Descartar (D)
        </Button>
        {corrigindo ? (
          <Button type="button" loading={pendente} onClick={confirmarCorrecao}>
            Salvar correção e publicar
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => setCorrigindo(true)}>
              Corrigir (C)
            </Button>
            <Button type="button" loading={pendente} onClick={aprovar}>
              Aprovar (A)
            </Button>
          </>
        )}
      </div>
    </article>
  );
}
