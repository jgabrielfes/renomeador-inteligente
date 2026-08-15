import { auth } from '@/lib/auth';
import { partilhar, VERSAO_MOTOR } from '@/lib/partilha/engine';
import { apurarAtribuicao } from '@/lib/partilha/atribuicao';
import type { EntradaAtribuicao } from '@/lib/partilha/atribuicao';
import type { Caso } from '@/lib/partilha/types';
import { foraDaPlataforma } from '@/lib/app';

type Payload = Caso & { atribuicao?: EntradaAtribuicao };

// BigInt roda em ambos, mas o runtime Node evita surpresas de polyfill.
export const runtime = 'nodejs';
// Cálculo é determinístico e sem I/O — nada para cachear entre requisições.
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  // Recursos da plataforma exigem login — a rota acompanha as páginas privadas.
  const session = await auth();
  if (!session) {
    return Response.json({ erro: 'Não autenticado.' }, { status: 401 });
  }

  let caso: Payload;
  try {
    caso = (await req.json()) as Payload;
  } catch {
    return Response.json({ erro: 'JSON inválido' }, { status: 400 });
  }

  if (!caso?.falecido?.dataObito || !Array.isArray(caso.herdeiros) || !Array.isArray(caso.bens)) {
    return Response.json(
      { erro: 'Campos obrigatórios: falecido.dataObito, herdeiros[], bens[]' },
      { status: 422 },
    );
  }

  try {
    const resultado = partilhar(caso);

    // Partilha diferenciada (usufruto, nua-propriedade, torna) é opcional:
    // só roda quando o cliente envia as titularidades convencionadas.
    const atribuicao =
      caso.atribuicao && resultado.bloqueios.length === 0
        ? apurarAtribuicao(caso, resultado, caso.atribuicao)
        : null;

    // Bloqueio é resposta legítima do motor, não erro de servidor:
    // 422 sinaliza "entrada não calculável" sem alarmar o monitoramento.
    const travado =
      resultado.bloqueios.length > 0 || (atribuicao?.bloqueios.length ?? 0) > 0;
    return Response.json({ ...resultado, atribuicao }, { status: travado ? 422 : 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro desconhecido';
    return Response.json({ erro: msg, versaoMotor: VERSAO_MOTOR }, { status: 400 });
  }
}

export async function GET() {
  // Rota do Sucessorista: no deploy do Renomeador ela não existe.
  const fora = foraDaPlataforma('SUCESSORISTA');
  if (fora) return fora;

  return Response.json({ servico: 'motor-de-partilha', versao: VERSAO_MOTOR });
}
