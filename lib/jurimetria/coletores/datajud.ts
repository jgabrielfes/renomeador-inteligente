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

import type { Coletor, ConfigFonte, ConteudoColetado } from './tipos';

interface HitDatajud {
  _source?: {
    numeroProcesso?: string;
    classe?: { nome?: string };
    orgaoJulgador?: { nome?: string };
    dataAjuizamento?: string;
    movimentos?: { nome?: string; dataHora?: string; complementosTabelados?: { nome?: string }[] }[];
  };
}

function endpointDe(fonte: ConfigFonte): string {
  const base = fonte.urlBase ?? 'https://api-publica.datajud.cnj.br';
  const caminho = String(fonte.config.endpoint ?? '/api_publicas_tjsp/_search');
  return `${base}${caminho}`;
}

async function buscar(fonte: ConfigFonte, corpo: unknown): Promise<HitDatajud[]> {
  const chave = process.env.DATAJUD_API_KEY;
  if (!chave) throw new Error('DATAJUD_API_KEY ausente — cadastre o segredo do worker.');
  const r = await fetch(endpointDe(fonte), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `APIKey ${chave}` },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(60000),
  });
  if (!r.ok) throw new Error(`Datajud: HTTP ${r.status}`);
  const dados = (await r.json()) as { hits?: { hits?: HitDatajud[] } };
  return dados.hits?.hits ?? [];
}

export const coletorDatajud: Coletor = {
  async listar(fonte, desde) {
    const classes = (fonte.config.classes as string[] | undefined) ?? ['Dúvida', 'Dúvida Inversa'];
    const orgaos = (fonte.config.orgaos as string[] | undefined) ?? ['Vara de Registros Públicos'];
    const tamanho = Number(fonte.config.tamanhoPagina ?? 100);
    const hits = await buscar(fonte, {
      size: Math.min(tamanho, 100),
      query: {
        bool: {
          must: [
            { bool: { should: classes.map((c) => ({ match_phrase: { 'classe.nome': c } })) } },
            { bool: { should: orgaos.map((o) => ({ match_phrase: { 'orgaoJulgador.nome': o } })) } },
            { range: { dataAjuizamento: { gte: desde.toISOString().slice(0, 10) } } },
          ],
        },
      },
      sort: [{ dataAjuizamento: 'desc' }],
    });
    return hits
      .filter((h) => h._source?.numeroProcesso)
      .map((h) => ({
        url: `datajud:${h._source!.numeroProcesso}`,
        dataDocumento: h._source?.dataAjuizamento?.slice(0, 10),
        rotulo: `${h._source?.classe?.nome ?? 'Dúvida'} — ${h._source?.orgaoJulgador?.nome ?? ''}`,
      }));
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
