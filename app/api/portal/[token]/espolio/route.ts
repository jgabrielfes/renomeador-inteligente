/**
 * Espaço do Espólio — FATOS enviados pelo herdeiro: comentário/sugestão de
 * valor por bem e despesa adiantada. A credencial é o TOKEN do convite (o
 * herdeiro não tem login) e só funciona com o espaço ABERTO pelo advogado.
 *
 * Imutabilidade: aqui só se CRIA — não há edição nem exclusão. A decisão do
 * escritório (aceitar/recusar, reconhecer/não) muda apenas status/motivo,
 * pela server action com sessão; corrigir é registrar um fato novo.
 */
import { store } from '@/lib/portal/store-prisma';
import { foraDaPlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import { registrarEventoPortal } from '@/lib/portal/eventos-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ token: string }> };

const CATEGORIAS_DESPESA = [
  'funeral',
  'iptu',
  'condominio',
  'itcmd',
  'honorarios',
  'certidoes',
  'outra',
] as const;

const ehDecimal = (v: string) => /^\d{1,13}(\.\d{1,2})?$/.test(v);
const ehDataIso = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);

export async function POST(req: Request, ctx: Ctx) {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  const { token } = await ctx.params;
  const convite = await store.obter(token);
  if (!convite) return Response.json({ erro: 'Convite não encontrado' }, { status: 404 });
  if (convite.revogadoEm) {
    return Response.json({ erro: 'Este convite foi encerrado pelo advogado.' }, { status: 410 });
  }

  // O espaço precisa estar ABERTO (coluna espolio não-nula) — fechado, nada entra.
  let aberto = false;
  try {
    const linha = await prisma.portalPainel.findUnique({
      where: { casoId: convite.casoId },
      select: { espolio: true },
    });
    aberto = linha?.espolio != null;
  } catch {
    aberto = false;
  }
  if (!aberto) {
    return Response.json(
      { erro: 'O espaço do espólio não está aberto para a família.' },
      { status: 409 },
    );
  }

  let body: {
    nota?: { bemId?: string; tipo?: string; texto?: string; valorSugerido?: string };
    despesa?: { categoria?: string; valor?: string; data?: string; descricao?: string };
    adesao?: { cenarioId?: string; resposta?: string; comentario?: string };
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  const autor = convite.nomeHerdeiro;

  /* ---------- comentário / sugestão de valor por bem ---------- */
  if (body?.nota && typeof body.nota === 'object') {
    const bemId = String(body.nota.bemId ?? '').slice(0, 80);
    const tipo = String(body.nota.tipo ?? '');
    const texto = String(body.nota.texto ?? '').trim().slice(0, 600);
    const valorSugerido = String(body.nota.valorSugerido ?? '').trim();
    if (!bemId || (tipo !== 'comentario' && tipo !== 'sugestao_valor')) {
      return Response.json({ erro: 'Nota sem bem ou com tipo inválido.' }, { status: 422 });
    }
    if (texto === '') {
      return Response.json({ erro: 'Escreva o comentário.' }, { status: 422 });
    }
    if (tipo === 'sugestao_valor' && !ehDecimal(valorSugerido)) {
      return Response.json({ erro: 'Sugestão de valor precisa de um número válido.' }, { status: 422 });
    }
    const nota = await prisma.espolioNota.create({
      data: {
        casoId: convite.casoId,
        token,
        autor,
        bemId,
        tipo,
        texto,
        valorSugerido: tipo === 'sugestao_valor' ? valorSugerido : null,
      },
    });
    void registrarEventoPortal(convite.casoId, 'ESPOLIO_NOTA', { herdeiro: autor }, token);
    return Response.json({ nota });
  }

  /* ---------- despesa adiantada (o comprovante sobe pelo pedido criado) ---------- */
  if (body?.despesa && typeof body.despesa === 'object') {
    const categoria = String(body.despesa.categoria ?? '');
    const valor = String(body.despesa.valor ?? '').trim();
    const data = String(body.despesa.data ?? '').trim();
    const descricao = String(body.despesa.descricao ?? '').trim().slice(0, 300);
    if (!(CATEGORIAS_DESPESA as readonly string[]).includes(categoria)) {
      return Response.json({ erro: 'Categoria de despesa inválida.' }, { status: 422 });
    }
    if (!ehDecimal(valor)) {
      return Response.json({ erro: 'Informe o valor pago (número válido).' }, { status: 422 });
    }
    if (!ehDataIso(data)) {
      return Response.json({ erro: 'Informe a data do pagamento.' }, { status: 422 });
    }
    if (descricao === '') {
      return Response.json({ erro: 'Descreva a despesa.' }, { status: 422 });
    }
    const despesa = await prisma.espolioDespesa.create({
      data: {
        casoId: convite.casoId,
        token,
        autor,
        herdeiroId: convite.herdeiroId ?? null,
        categoria,
        valor,
        data,
        descricao,
      },
    });
    // O COMPROVANTE é obrigatório e sobe pelo MESMO fluxo de arquivos do
    // portal: a despesa cria um pedido `despesa-<id>` no convite e o upload
    // reaproveita POST /api/portal/[token]/arquivo (miniatura, conferência,
    // baixar/anexar — tudo que os outros envios já têm).
    const atualizado = await store.adicionarPedido(token, {
      id: `despesa-${despesa.id}`,
      titulo: `Comprovante — ${descricao.slice(0, 120)}`,
      descricao: 'Comprovante da despesa adiantada informada no espaço do espólio.',
    });
    void registrarEventoPortal(
      convite.casoId,
      'ESPOLIO_DESPESA',
      { herdeiro: autor, documento: descricao.slice(0, 160) },
      token,
    );
    return Response.json({ despesa, convite: atualizado });
  }

  /* ---------- adesão a um cenário de divisão ---------- */
  if (body?.adesao && typeof body.adesao === 'object') {
    const cenarioId = String(body.adesao.cenarioId ?? '').slice(0, 80);
    const resposta = String(body.adesao.resposta ?? '');
    const comentario = String(body.adesao.comentario ?? '').trim().slice(0, 400);
    if (!cenarioId || !['aceito', 'nao_aceito', 'conversar'].includes(resposta)) {
      return Response.json({ erro: 'Adesão sem cenário ou com resposta inválida.' }, { status: 422 });
    }
    const cenario = await prisma.espolioCenario.findUnique({ where: { id: cenarioId } });
    if (!cenario || cenario.casoId !== convite.casoId) {
      return Response.json({ erro: 'Cenário não encontrado.' }, { status: 404 });
    }
    if (cenario.status !== 'proposto') {
      return Response.json(
        { erro: 'Este cenário foi fechado ou retirado — a resposta não muda mais.' },
        { status: 409 },
      );
    }
    const adesao = await prisma.espolioAdesao.create({
      data: {
        cenarioId,
        casoId: convite.casoId,
        token,
        autor,
        resposta,
        comentario: comentario === '' ? null : comentario,
      },
    });
    const tituloCenario = (cenario.dados as { titulo?: string } | null)?.titulo;
    void registrarEventoPortal(
      convite.casoId,
      'ESPOLIO_ADESAO',
      { herdeiro: autor, cenario: tituloCenario, resposta },
      token,
    );
    // CONSENSO: a resposta mais recente de TODO convite ativo é "aceito" —
    // o cenário congela sozinho e a família (e o advogado) veem o fecho.
    let consenso = false;
    try {
      const [convitesDoCaso, adesoes] = await Promise.all([
        prisma.portalConvite.findMany({
          where: { casoId: convite.casoId },
          select: { token: true, dados: true },
        }),
        prisma.espolioAdesao.findMany({
          where: { cenarioId },
          orderBy: { createdAt: 'asc' },
          select: { token: true, resposta: true },
        }),
      ]);
      const ativos = convitesDoCaso.filter(
        (c) => !(c.dados as { revogadoEm?: string } | null)?.revogadoEm,
      );
      const ultimaPorToken = new Map<string, string>();
      for (const a of adesoes) ultimaPorToken.set(a.token, a.resposta);
      consenso =
        ativos.length > 0 &&
        ativos.every((c) => ultimaPorToken.get(c.token) === 'aceito');
      if (consenso) {
        await prisma.espolioCenario.update({
          where: { id: cenarioId },
          data: { status: 'congelado' },
        });
        void registrarEventoPortal(convite.casoId, 'ESPOLIO_CONSENSO', {
          cenario: tituloCenario,
        });
      }
    } catch {
      consenso = false;
    }
    return Response.json({ adesao: { id: adesao.id, resposta, comentario }, consenso });
  }

  return Response.json({ erro: 'Nada para registrar.' }, { status: 422 });
}
