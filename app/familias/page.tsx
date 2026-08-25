// Área pública "Para famílias" — a porta de entrada de quem acabou de perder
// alguém e não sabe por onde começar. SEM cadastro, SEM dado sensível: um
// questionário curto que termina numa orientação honesta (via, custos por
// faixa, prazo e documentos). Renderizada no servidor com metadados (SEO).

import type { Metadata } from 'next';

import { requirePlataforma } from '@/lib/app';
import { radarAtivo } from '@/lib/radar/config';
import { FamiliasClient } from './familias-client';

export const metadata: Metadata = {
  title: 'Inventário: por onde começar? Guia gratuito para famílias — O Sucessorista',
  description:
    'Perdeu alguém e não sabe por onde começar o inventário? Responda até 12 perguntas e veja, de graça e sem cadastro: cartório ou justiça, estimativa do imposto (ITCMD) e dos custos, prazo legal e a lista de documentos para separar.',
  keywords: [
    'inventário',
    'como fazer inventário',
    'inventário extrajudicial',
    'ITCMD',
    'custo de inventário',
    'prazo do inventário',
    'alvará judicial',
  ],
  openGraph: {
    title: 'Inventário: por onde começar? — guia gratuito para famílias',
    description:
      'Cartório ou justiça? Quanto custa? Qual o prazo? Responda até 12 perguntas e receba uma orientação clara, de graça e sem cadastro.',
    type: 'website',
  },
};

/**
 * RENDERIZAÇÃO POR REQUISIÇÃO — de propósito.
 *
 * `radarAtivo()` lê `RADAR_ATIVO` do ambiente. Enquanto esta página era
 * ESTÁTICA, a flag entrava no BUILD: ligar o Radar no painel da Vercel (ou
 * pela action) não mudava nada até alguém republicar o site — e, pior, o
 * `/admin/radar` (que é dinâmico) já dizia "LIGADO" enquanto a família
 * continuava sem o convite. Foi exatamente esse descompasso que fez o Radar
 * parecer quebrado depois de configurado.
 *
 * O custo é perder o cache estático de uma página de marketing; o HTML servido
 * é o mesmo (os metadados de SEO acima continuam valendo), e o conteúdo não
 * depende de banco. Vale menos que a armadilha de um interruptor que só liga
 * no próximo deploy.
 */
export const dynamic = 'force-dynamic';

export default async function FamiliasPage() {
  // Página do site do Sucessorista — nos demais deploys ela não existe.
  await requirePlataforma('SUCESSORISTA');
  // O Radar é ligado pelo admin (RADAR_ATIVO=1) — lido a cada requisição.
  return <FamiliasClient radarAtivo={radarAtivo()} />;
}
