// Resultado SALVO da área "Para famílias" — o link que a família guarda e
// compartilha (token = credencial, como no portal). O prazo e as estimativas
// são RECALCULADOS a cada visita com a data de hoje; expirado/retirado, a
// página responde com honestidade.

import type { Metadata } from 'next';

import { requirePlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';
import { sanitizarRespostas } from '@/lib/familias/sanitizar';
import { classificarVia } from '@/lib/familias/triagem';
import { estimarCustos } from '@/lib/familias/estimativas';
import { montarChecklistDocumentos } from '@/lib/familias/documentos';
import { radarAtivo } from '@/lib/radar/config';
import { ResultadoSalvoClient } from './resultado-salvo-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Meu resultado — por onde começar o inventário',
  robots: { index: false },
};

export default async function ResultadoSalvoPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await requirePlataforma('SUCESSORISTA');
  const { token } = await params;

  const indisponivel = (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
        <h1>Resultado indisponível</h1>
        <div className="nota exigencia">
          <p>
            Este link não existe mais — resultados ficam guardados por 90 dias, e quem os
            salvou pode retirá-los antes. Você pode gerar um novo em poucos minutos.
          </p>
        </div>
        <div style={{ marginTop: 12 }}>
          <a className="acao" href="/familias" style={{ textDecoration: 'none', display: 'inline-block' }}>
            Refazer o questionário
          </a>
        </div>
      </main>
    </div>
  );

  let linha: {
    respostas: unknown;
    status: string;
    expiraEm: Date;
    email: string | null;
    publicadoEm: Date | null;
  } | null = null;
  try {
    linha = await prisma.familiaIntake.findUnique({
      where: { tokenGestao: token.slice(0, 120) },
      select: { respostas: true, status: true, expiraEm: true, email: true, publicadoEm: true },
    });
  } catch {
    linha = null;
  }
  if (!linha || linha.status === 'retirado' || linha.status === 'expirado' || linha.expiraEm < new Date()) {
    return indisponivel;
  }
  const respostas = sanitizarRespostas(linha.respostas);
  if (!respostas) return indisponivel;

  const hoje = new Date().toISOString().slice(0, 10);
  const triagem = classificarVia(respostas);
  const estimativa = estimarCustos(respostas, hoje, triagem.via);
  const docs = montarChecklistDocumentos(respostas, triagem.via);

  return (
    <ResultadoSalvoClient
      token={token}
      r={respostas}
      triagem={triagem}
      estimativa={estimativa}
      docs={docs}
      radar={radarAtivo() ? (linha.publicadoEm ? 'publicado' : 'disponivel') : 'inativo'}
      emailInicial={linha.email ?? respostas.email}
    />
  );
}
