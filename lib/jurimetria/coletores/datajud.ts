/**
 * Coletor A1 — API pública Datajud (CNJ): processos de classe "Dúvida" nas
 * Varas de Registros Públicos da Capital (TJSP).
 *
 * O Datajud devolve METADADOS + movimentações, não o inteiro teor
 * (TODO_VALIDACAO nº 1 do desenho): estes documentos alimentam a lista de
 * dúvidas e o cruzamento futuro com o DJE. Ainda assim as movimentações
 * carregam texto útil (julgamentos, resultados) — o pipeline trata como
 * documento de baixa densidade e a fila de revisão decide.
 *
 * A chave é a PÚBLICA divulgada pelo CNJ (env DATAJUD_API_KEY no worker) —
 * nada aqui é raspagem: é API oficial, com filtros e paginação.
 */

import type { Coletor, ConfigFonte, ConteudoColetado, ReferenciaColeta } from './tipos';

interface HitDatajud {
  /** Valores de ordenação do Elasticsearch — viram o search_after da página seguinte. */
  sort?: unknown[];
  _source?: {
    numeroProcesso?: string;
    classe?: { nome?: string };
    orgaoJulgador?: { nome?: string };
    dataAjuizamento?: string;
    movimentos?: { nome?: string; dataHora?: string; complementosTabelados?: { nome?: string }[] }[];
  };
}

function endpointDe(fonte: ConfigFonte): string {
  const base = fonte.urlBase ?? 'https://api-publica.datajud.cnj.jus.br';
  // Alias oficial do CNJ: api_publica_<tribunal> (SINGULAR — "api_publicas"
  // devolve 403 de índice não autorizado para a chave pública).
  const caminho = String(fonte.config.endpoint ?? '/api_publica_tjsp/_search').replace(
    'api_publicas_',
    'api_publica_',
  );
  return `${base}${caminho}`;
}

async function buscar(fonte: ConfigFonte, corpo: unknown): Promise<HitDatajud[]> {
  // A chave copiada do wiki do CNJ costuma vir com quebra de linha no meio
  // (e às vezes com o prefixo "APIKey" junto) — higienizada aqui, o segredo
  // colado de qualquer jeito funciona.
  const chave = (process.env.DATAJUD_API_KEY ?? '')
    .replace(/^\s*APIKey\s+/i, '')
    .replace(/\s+/g, '');
  if (!chave) throw new Error('DATAJUD_API_KEY ausente — cadastre o segredo do worker.');
  let r: Response;
  try {
    r = await fetch(endpointDe(fonte), {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `APIKey ${chave}` },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(60000),
    });
  } catch (e) {
    // O fetch do Node esconde a causa real (DNS/TLS/conexão) em `cause` —
    // desembrulhada aqui para o log da Action dizer o que de fato houve.
    const causas: string[] = [];
    for (let c: unknown = e; c instanceof Error; c = c.cause) causas.push(c.message);
    throw new Error(`Datajud: ${causas.join(' ← ') || 'falha de rede'}`);
  }
  if (!r.ok) {
    // O corpo do erro do Datajud explica o motivo (chave inválida, WAF…).
    const corpo = (await r.text().catch(() => '')).slice(0, 300).replace(/\s+/g, ' ');
    throw new Error(`Datajud: HTTP ${r.status}${corpo ? ` — ${corpo}` : ''}`);
  }
  const dados = (await r.json()) as { hits?: { hits?: HitDatajud[] } };
  return dados.hits?.hits ?? [];
}

export const coletorDatajud: Coletor = {
  async listar(fonte, _desde, jaConhecida) {
    const classes = (fonte.config.classes as string[] | undefined) ?? ['Dúvida', 'Dúvida Inversa'];
    // No Datajud o órgão vem como "01 REGISTROS PUBLICOS DE CENTRAL" (sem a
    // palavra "Vara") — o match_phrase parcial pega 01/02 e congêneres.
    const orgaos = (fonte.config.orgaos as string[] | undefined) ?? ['REGISTROS PUBLICOS'];
    const tamanho = Math.min(Number(fonte.config.tamanhoPagina ?? 100), 100);
    // BACKFILL do histórico inteiro (pedido do escritório): sem filtro de
    // data, paginando por search_after do mais novo ao mais antigo e PULANDO
    // o que já está no banco — cada rodada cava mais fundo até juntar
    // `maxNovos` referências inéditas.
    const maxNovos = Number(fonte.config.maxNovosPorColeta ?? 120);
    const maxPaginas = Number(fonte.config.maxPaginas ?? 30);
    const query = {
      bool: {
        must: [
          { bool: { should: classes.map((c) => ({ match_phrase: { 'classe.nome': c } })), minimum_should_match: 1 } },
          { bool: { should: orgaos.map((o) => ({ match_phrase: { 'orgaoJulgador.nome': o } })), minimum_should_match: 1 } },
        ],
      },
    };
    const refs: ReferenciaColeta[] = [];
    let searchAfter: unknown[] | undefined;
    for (let pagina = 0; pagina < maxPaginas && refs.length < maxNovos; pagina++) {
      const hits = await buscar(fonte, {
        size: tamanho,
        query,
        sort: [{ dataAjuizamento: 'desc' }, { '@timestamp': 'desc' }],
        ...(searchAfter ? { search_after: searchAfter } : {}),
      });
      if (hits.length === 0) break;
      searchAfter = hits[hits.length - 1].sort;
      for (const h of hits) {
        const numero = h._source?.numeroProcesso;
        if (!numero) continue;
        const url = `datajud:${numero}`;
        if (jaConhecida?.(url)) continue;
        refs.push({
          url,
          dataDocumento: h._source?.dataAjuizamento?.slice(0, 10),
          rotulo: `${h._source?.classe?.nome ?? 'Dúvida'} — ${h._source?.orgaoJulgador?.nome ?? ''}`,
        });
        if (refs.length >= maxNovos) break;
      }
      if (!searchAfter) break;
    }
    return refs;
  },

  async baixar(fonte, ref): Promise<ConteudoColetado> {
    const numero = ref.url.replace(/^datajud:/, '');
    const hits = await buscar(fonte, {
      size: 1,
      query: { match: { numeroProcesso: numero.replace(/\D/g, '') } },
    });
    const p = hits[0]?._source;
    if (!p) throw new Error(`Datajud: processo ${numero} não retornou`);
    const movimentos = (p.movimentos ?? [])
      .map((m) => {
        const compl = (m.complementosTabelados ?? []).map((c) => c.nome).filter(Boolean);
        return `${m.dataHora?.slice(0, 10) ?? ''} — ${m.nome ?? ''}${compl.length ? ` (${compl.join('; ')})` : ''}`;
      })
      .join('\n');
    const texto = [
      `Processo de ${p.classe?.nome ?? 'Dúvida'} — ${p.orgaoJulgador?.nome ?? ''}`,
      `Número CNJ: ${p.numeroProcesso ?? numero}`,
      `Ajuizamento: ${p.dataAjuizamento?.slice(0, 10) ?? '?'}`,
      '',
      'Movimentações:',
      movimentos || '(sem movimentações retornadas)',
    ].join('\n');
    return {
      urlOrigem: ref.url,
      mime: 'text/plain',
      texto,
      dataDocumento: ref.dataDocumento,
    };
  },
};
