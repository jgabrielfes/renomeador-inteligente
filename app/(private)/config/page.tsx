// CONFIGURAÇÕES da conta LexCausa — um lugar só para ver conta, perfil,
// equipe, nuvens conectadas, Radar e o plano (em implantação). A página é
// de LEITURA + atalhos: as ações continuam onde sempre viveram (perfil é
// ato de administração; nuvens conectam/desconectam em Meus Casos; equipe
// no card do dashboard) — nada de duplicar fluxo de mutação.

import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/lexcausa.css';

import { LexTopbar } from '@/components/lexcausa/topbar';
import { AvatarSessao } from '@/components/lexcausa/avatar-sessao';
import { requirePlataforma } from '@/lib/app';
import { auth, isMaster, requireSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { radarAtivo } from '@/lib/radar/config';
import { minhaEquipe } from '../sucessorista/equipe-actions';
import { PreferenciaProduto } from './config-client';
import { AlterarSenha, PerfilUsuarioForm } from './perfil-form';

export const metadata: Metadata = {
  title: 'Configurações — LexCausa',
  robots: { index: false },
};

export default async function ConfigPage() {
  await requirePlataforma('SUCESSORISTA');
  await requireSession('/config');
  const session = await auth();

  let usuario: {
    name: string | null;
    email: string;
    perfilSucessorista: string | null;
    passwordHash: string | null;
    fotoPerfil: string | null;
    bio: string | null;
    enderecoEscritorio: string | null;
    telefoneContato: string | null;
    emailContato: string | null;
    driveRefreshToken: string | null;
    oneDriveEmail: string | null;
    oneDriveRefreshToken: string | null;
    dropboxEmail: string | null;
    dropboxRefreshToken: string | null;
  } | null = null;
  let radar: { situacao: string | null; ufs: string[] } = { situacao: null, ufs: [] };
  // TUDO em paralelo (velocidade) — banco fora: a página mostra o que der.
  let equipe: Awaited<ReturnType<typeof minhaEquipe>> = null;
  try {
    const [u, perfil, assinaturas, eq] = await Promise.all([
      prisma.user.findUnique({
        where: { id: session?.user?.id ?? '' },
        select: {
          name: true,
          email: true,
          perfilSucessorista: true,
          passwordHash: true,
          fotoPerfil: true,
          bio: true,
          enderecoEscritorio: true,
          telefoneContato: true,
          emailContato: true,
          driveRefreshToken: true,
          oneDriveEmail: true,
          oneDriveRefreshToken: true,
          dropboxEmail: true,
          dropboxRefreshToken: true,
        },
      }),
      prisma.advogadoPerfil.findUnique({ where: { userId: session?.user?.id ?? '' } }),
      prisma.radarAssinatura.findMany({ where: { userId: session?.user?.id ?? '' } }),
      minhaEquipe(),
    ]);
    usuario = u;
    radar = { situacao: perfil?.situacao ?? null, ufs: assinaturas.map((a) => a.uf) };
    equipe = eq;
  } catch {
    // banco fora: a página mostra o que der, nunca quebra
  }
  const ehMaster = isMaster(session);

  const nuvens = [
    usuario?.driveRefreshToken ? 'Google Drive' : null,
    usuario?.oneDriveRefreshToken ? `OneDrive${usuario.oneDriveEmail ? ` (${usuario.oneDriveEmail})` : ''}` : null,
    usuario?.dropboxRefreshToken ? `Dropbox${usuario.dropboxEmail ? ` (${usuario.dropboxEmail})` : ''}` : null,
  ].filter((n): n is string => n !== null);

  return (
    <>
      <LexTopbar menu={<AvatarSessao />} ehMaster={ehMaster} radarAtivo={radarAtivo()} />
      <div className="lexcausa" style={{ minHeight: '100vh' }}>
        <main className="lc-miolo">
          <section className="lc-hero" style={{ paddingTop: 'var(--e-6)' }}>
            <span className="lc-eyebrow">LexCausa</span>
            <h1>Configurações</h1>
          </section>

          <div className="lc-cartoes">
            <section className="lc-cartao">
              <span className="lc-eyebrow">Conta</span>
              <h3>{usuario?.name ?? 'Sua conta'}</h3>
              <p style={{ margin: 0 }}>{usuario?.email}</p>
              <p className="lc-fund" style={{ margin: 0 }}>
                Perfil no Sucessorista:{' '}
                {usuario?.perfilSucessorista === 'ESCREVENTE'
                  ? 'Escrevente Notarial'
                  : usuario?.perfilSucessorista === 'ADVOGADO'
                  ? 'Advogado(a)'
                  : 'ainda não escolhido (o primeiro acesso pergunta)'}
                {ehMaster ? ' · conta Master' : ''}. Trocar o perfil é ato de
                administração — fale com a plataforma.
              </p>
              <PerfilUsuarioForm
                inicial={{
                  fotoPerfil: usuario?.fotoPerfil ?? null,
                  bio: usuario?.bio ?? null,
                  enderecoEscritorio: usuario?.enderecoEscritorio ?? null,
                  telefoneContato: usuario?.telefoneContato ?? null,
                  emailContato: usuario?.emailContato ?? null,
                }}
              />
              <div>
                <AlterarSenha temSenha={Boolean(usuario?.passwordHash)} />
              </div>
            </section>

            <section className="lc-cartao">
              <span className="lc-eyebrow">Entrada</span>
              <h3>Produto de entrada</h3>
              <p className="lc-fund" style={{ margin: 0 }}>
                O que abre quando você entra (guardado neste navegador). O clique na
                marca sempre volta ao hub.
              </p>
              <PreferenciaProduto />
              <p className="lc-fund" style={{ margin: 0 }}>
                Tema claro × escuro do Sucessorista: alternador no topo da Página
                Inicial de cada caso (preferência deste navegador).
              </p>
            </section>

            <section className="lc-cartao">
              <span className="lc-eyebrow">Equipe</span>
              <h3>{equipe ? equipe.nome : 'Sem equipe'}</h3>
              <p style={{ margin: 0 }}>
                {equipe
                  ? `Você é ${equipe.papel === 'CHEFE' ? 'chefe' : 'membro'} · ${equipe.membros.length} pessoa(s)${equipe.meuAcessoCasos ? ' · nuvem de casos da equipe ativa' : ''}.`
                  : 'Crie ou entre numa equipe pelo card "Minha equipe" na Página Inicial de um caso.'}
              </p>
              <p className="lc-fund" style={{ margin: 0 }}>
                Contas individuais por convite — login compartilhado não existe.
              </p>
            </section>

            <section className="lc-cartao">
              <span className="lc-eyebrow">Nuvens conectadas</span>
              <h3>{nuvens.length > 0 ? nuvens.join(' · ') : 'Nenhuma nuvem conectada'}</h3>
              <p style={{ margin: 0 }}>
                {nuvens.length > 0
                  ? 'Seus casos e documentos vivem na SUA conta dessa nuvem.'
                  : 'Conectar Google Drive, OneDrive ou Dropbox deixa os casos acessíveis de qualquer dispositivo.'}
              </p>
              <div className="lc-acoes">
                <Link className="lc-acao secundaria" href="/s">
                  Gerenciar em Meus casos
                </Link>
              </div>
            </section>

            <section className="lc-cartao produto-radar">
              <span className="lc-eyebrow">Radar Sucessório</span>
              <h3>
                {radar.situacao === 'aprovado'
                  ? `OAB verificada · UF(s): ${radar.ufs.join(', ') || 'nenhuma assinada'}`
                  : radar.situacao
                  ? `Verificação da OAB: ${radar.situacao}`
                  : 'Perfil ainda não cadastrado'}
              </h3>
              <p style={{ margin: 0 }}>
                A habilitação (OAB + questionário + assinatura por UF) e a vitrine são
                feitas no próprio Radar.
              </p>
              <div className="lc-acoes">
                <Link className="lc-acao secundaria" href="/radar">
                  Abrir o Radar
                </Link>
              </div>
            </section>

            <section className="lc-cartao desabilitado">
              <span className="lc-eyebrow">Assinatura</span>
              <h3>Plano LexCausa — em implantação</h3>
              <p style={{ margin: 0 }}>
                O plano de assinatura está em desenvolvimento; quando entrar no ar, a
                gestão aparece aqui. Hoje o acesso ao Radar vale pela assinatura
                mensal por UF, concedida pela administração.
              </p>
            </section>
          </div>
        </main>
      </div>
    </>
  );
}
