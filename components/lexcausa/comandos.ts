/**
 * Comandos de navegação da paleta (⌘K) — módulo COMPARTILHADO, sem
 * 'use client' de propósito: a lista é montada tanto em client components
 * (topbar) quanto em server components (pagina do módulo), e função
 * exportada de arquivo 'use client' não pode ser CHAMADA no servidor.
 */

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
  escrevente?: boolean;
}): ComandoLexCausa[] {
  const lista: ComandoLexCausa[] = [
    { id: 'hub', rotulo: 'Ir ao hub de produtos', dica: 'LexCausa', href: '/?hub=1' },
    { id: 'casos', rotulo: 'Meus casos', dica: 'O Sucessorista', href: '/s' },
    { id: 'novo', rotulo: 'Novo inventário', dica: 'O Sucessorista', href: '/s' },
  ];
  if (!opcoes.escrevente || opcoes.ehMaster) {
    if (opcoes.radarAtivo) {
      lista.push({ id: 'radar', rotulo: 'Radar Sucessório', dica: 'prospecção', href: '/radar' });
    }
    lista.push({ id: 'diligencias', rotulo: 'Diligências entre advogados', dica: 'rede', href: '/diligencias' });
  }
  if (opcoes.ehMaster) {
    lista.push({ id: 'admin', rotulo: 'Administração', dica: 'master', href: '/admin' });
  }
  lista.push(
    { id: 'config', rotulo: 'Configurações', dica: 'LexCausa', href: '/config' },
    { id: 'ajuda', rotulo: 'Ajuda e Tutoriais', dica: 'hub de ajuda', href: '/ajuda' },
    { id: 'ajuda-s', rotulo: 'Como funciona: O Sucessorista', dica: 'ajuda', href: '/ajuda/sucessorista' },
    { id: 'ajuda-r', rotulo: 'Como funciona: Radar Sucessório', dica: 'ajuda', href: '/ajuda/radar' },
    { id: 'familias', rotulo: 'Área para famílias', dica: 'público', href: '/familias' },
    { id: 'prod-s', rotulo: 'Página do produto: O Sucessorista', dica: 'institucional', href: '/produtos/sucessorista' },
    { id: 'prod-r', rotulo: 'Página do produto: Radar Sucessório', dica: 'institucional', href: '/produtos/radar' },
    { id: 'prod-d', rotulo: 'Página do produto: Diligências entre advogados', dica: 'institucional', href: '/produtos/diligencias' },
  );
  return lista;
}
