// Área pública "Para famílias" — a porta de entrada de quem acabou de perder
// alguém e não sabe por onde começar. SEM cadastro, SEM dado sensível: um
// questionário curto que termina numa orientação honesta (via, custos por
// faixa, prazo e documentos). Renderizada no servidor com metadados (SEO).

import type { Metadata } from 'next';

import { requirePlataforma } from '@/lib/app';
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

export default async function FamiliasPage() {
  // Página do site do Sucessorista — nos demais deploys ela não existe.
  await requirePlataforma('SUCESSORISTA');
  return <FamiliasClient />;
}
