/**
 * Comandos de navegação da paleta (⌘K) — módulo COMPARTILHADO, sem
 * 'use client' de propósito: a lista é montada tanto em client components
 * (topbar) quanto em server components (pagina do módulo), e função
 * exportada de arquivo 'use client' não pode ser CHAMADA no servidor.
 */

import { emStandby } from '@/lib/standby';

export interface ComandoLexCausa {
  id: string;
  rotulo: string;
  /** Contexto curto exibido à direita (nome do produto, "admin"…). */
  dica?: string;
  href: string;
}

/** Comandos de navegação padrão — filtrados pelo que a conta pode ver. */
export function comandosPadrao(opcoes: {
  ehMaster: boolean;
  radarAtivo: boolean;
  naoAdvogado?: boolean;
}): ComandoLexCausa[] {
  const lista: ComandoLexCausa[] = [
    { id: 'hub', rotulo: 'Ir ao hub', dica: 'LexCausa', href: '/?hub=1' },
    { id: 'casos', rotulo: 'Meus casos', dica: 'LexCausa', href: '/s' },
    { id: 'novo', rotulo: 'Novo inventário', dica: 'LexCausa', href: '/s' },
  ];
  // Ferramentas em standby (lib/standby.ts) não entram na paleta — voltam
  // sozinhas quando reativadas. Radar ainda depende de perfil + env.
  if ((!opcoes.naoAdvogado || opcoes.ehMaster) && opcoes.radarAtivo && !emStandby('radar')) {
    lista.push({ id: 'radar', rotulo: 'Radar Sucessório', dica: 'prospecção', href: '/radar' });
  }
  if (!emStandby('diligencias')) {
    lista.push({ id: 'diligencias', rotulo: 'Diligências', dica: 'rede', href: '/diligencias' });
  }
  if (!emStandby('jurimetria')) {
    lista.push({ id: 'jurimetria', rotulo: 'Jurimetria Registral', dica: 'histórico dos cartórios', href: '/jurimetria' });
  }
  if (opcoes.ehMaster) {
    lista.push({ id: 'admin', rotulo: 'Administração', dica: 'master', href: '/admin' });
  }
  lista.push(
    { id: 'config', rotulo: 'Configurações', dica: 'LexCausa', href: '/config' },
    { id: 'ajuda', rotulo: 'Ajuda e Tutoriais', dica: 'hub de ajuda', href: '/ajuda' },
    { id: 'ajuda-s', rotulo: 'Como funciona: LexCausa', dica: 'ajuda', href: '/ajuda/sucessorista' },
    { id: 'prod-s', rotulo: 'Página do produto: LexCausa', dica: 'institucional', href: '/produtos/sucessorista' },
  );
  if (!emStandby('radar')) {
    lista.push(
      { id: 'ajuda-r', rotulo: 'Como funciona: Radar Sucessório', dica: 'ajuda', href: '/ajuda/radar' },
      { id: 'familias', rotulo: 'Área para famílias', dica: 'público', href: '/familias' },
      { id: 'prod-r', rotulo: 'Página do produto: Radar Sucessório', dica: 'institucional', href: '/produtos/radar' },
    );
  }
  if (!emStandby('diligencias')) {
    lista.push({ id: 'prod-d', rotulo: 'Página do produto: Diligências', dica: 'institucional', href: '/produtos/diligencias' });
  }
  if (!emStandby('jurimetria')) {
    lista.push({ id: 'prod-j', rotulo: 'Página do produto: Jurimetria Registral', dica: 'institucional', href: '/produtos/jurimetria' });
  }
  return lista;
}
