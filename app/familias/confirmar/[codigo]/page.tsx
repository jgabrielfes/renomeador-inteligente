// Confirmação do e-mail + PUBLICAÇÃO da solicitação no Radar — o clique no
// link do e-mail é o que consuma o consentimento (LGPD): carimba
// emailConfirmadoEm/consentimentoEm/publicadoEm e muda o status. O código é
// de USO ÚNICO (é apagado ao confirmar).

import type { Metadata } from 'next';
import Link from 'next/link';

import { requirePlataforma } from '@/lib/app';
import { prisma } from '@/lib/prisma';

import '../../../(private)/sucessorista/sucessorista.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Confirmar publicação — LexCausa',
  robots: { index: false },
};

export default async function ConfirmarPage({
  params,
}: {
  params: Promise<{ codigo: string }>;
}) {
  await requirePlataforma('SUCESSORISTA');
  const { codigo } = await params;

  let tokenGestao: string | null = null;
  try {
    const intake = await prisma.familiaIntake.findUnique({
      where: { confirmacaoToken: codigo.slice(0, 120) },
    });
    if (intake && intake.status !== 'retirado' && intake.expiraEm > new Date()) {
      const agora = new Date();
      await prisma.familiaIntake.update({
        where: { id: intake.id },
        data: {
          emailConfirmadoEm: agora,
          consentimentoEm: agora,
          publicadoEm: agora,
          status: 'publicado',
          confirmacaoToken: null,
        },
      });
      tokenGestao = intake.tokenGestao;
    }
  } catch {
    tokenGestao = null;
  }

  return (
    <div className="sucessorista">
      <main className="folha" style={{ margin: '0 auto', maxWidth: 720 }}>
        {tokenGestao ? (
          <>
            <span className="eyebrow">Solicitação publicada</span>
            <h1>Pronto — advogados da sua região já podem responder</h1>
            <p className="subtitulo">
              O seu caso foi publicado SEM o seu nome e sem contato: advogados veem só um
              resumo anônimo. Quando alguém responder, você escolhe com calma se quer
              conversar — um por vez, e só então o seu contato é liberado.
            </p>
            <div className="nota">
              <p>
                Acompanhe (e retire quando quiser) pela sua página da solicitação — guarde
                o link:
              </p>
              <p style={{ marginTop: 6 }}>
                <Link className="acao" href={`/familias/minha-solicitacao/${tokenGestao}`} style={{ textDecoration: 'none', display: 'inline-block' }}>
                  Abrir minha solicitação
                </Link>
              </p>
            </div>
            <footer className="rodape-etico">
              Esta plataforma não intermedeia honorários nem indica advogados. Os
              profissionais que responderem o fazem voluntariamente à sua solicitação.
            </footer>
          </>
        ) : (
          <>
            <h1>Link de confirmação inválido</h1>
            <div className="nota exigencia">
              <p>
                Este link já foi usado ou expirou. Se você ainda quer publicar a
                solicitação, peça um novo e-mail de confirmação pela página do seu
                resultado.
              </p>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
