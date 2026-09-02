// FERRAMENTAS EM STANDBY — tiradas do ar "para um outro momento".
//
// Decisão do escritório: a LexCausa passa a ser SÓ a ferramenta de prática
// sucessória (a folha de trabalho do inventário). O Radar Sucessório, as
// Diligências e a Jurimetria Registral saem de cena — mas o CÓDIGO e as
// TABELAS do banco ficam no repositório, intactos, para voltarem depois.
//
// Este módulo é a FONTE ÚNICA do standby: as páginas ganham `gateStandby()`
// (404), as rotas de API `foraSeStandby()` (404) e a navegação (hub, ⌘K,
// /admin, ajuda, catálogo de produtos) filtra por `emStandby()`. Reativar uma
// ferramenta é uma linha só aqui — `false` — sem caçar rota por rota.
//
// Puro (sem 'server-only'): serve tanto o servidor (gates) quanto o cliente
// (filtros de navegação). O `notFound()`/`Response` só são tocados quando o
// gate roda, no servidor.

/** As ferramentas que podem entrar em standby (o Sucessorista nunca entra). */
export type FerramentaStandby = 'radar' | 'diligencias' | 'jurimetria' | 'familias';

/**
 * O que está em standby AGORA. `familias` é a porta pública do Radar (a
 * família registra o caso para os advogados responderem) — entra junto, pois
 * sem o Radar ela é um beco sem saída. Reativar = `false`.
 */
export const FERRAMENTAS_STANDBY: Record<FerramentaStandby, boolean> = {
  radar: true,
  diligencias: true,
  jurimetria: true,
  familias: true,
};

/**
 * Está em standby? Aceita `string` (o id de produto do catálogo, por exemplo)
 * e devolve `false` para o que não é ferramenta gerenciada aqui — assim o
 * `sucessorista` nunca é escondido.
 */
export function emStandby(ferramenta: string): boolean {
  return (
    Object.prototype.hasOwnProperty.call(FERRAMENTAS_STANDBY, ferramenta) &&
    FERRAMENTAS_STANDBY[ferramenta as FerramentaStandby]
  );
}

/** Gate de PÁGINA: responde 404 quando a ferramenta está em standby. */
export async function gateStandby(ferramenta: FerramentaStandby): Promise<void> {
  if (emStandby(ferramenta)) {
    const { notFound } = await import('next/navigation');
    notFound();
  }
}

/**
 * Gate de ROTA DE API: `Response` 404 quando em standby, `null` quando pode
 * seguir — mesma forma de `foraDaPlataforma()` de `lib/app.ts`.
 *
 *     const parada = foraSeStandby('familias');
 *     if (parada) return parada;
 */
export function foraSeStandby(ferramenta: FerramentaStandby): Response | null {
  return emStandby(ferramenta) ? new Response(null, { status: 404 }) : null;
}
