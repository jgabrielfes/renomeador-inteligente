/**
 * Coletor A1b — CJPG do e-SAJ (TJSP): sentenças de 1º grau em processos de
 * DÚVIDA registral, com INTEIRO TEOR.
 *
 * O que a sonda confirmou (2026-08-30): a consulta é um GET público sem
 * captcha e sem login, e o TEXTO COMPLETO de cada sentença já vem embutido
 * na própria página de resultados (num <div style="display:none"> por linha
 * — o "+" da tela só alterna a exibição). Por isso o coletor lê SÓ a página
 * 1 ordenada por data decrescente (a página 2 exige sessão/cookie) e não
 * baixa nada além da listagem: com coleta diária, as sentenças novas cabem
 * na primeira página — e menos requisições é mais respeitoso.
 *
 * Complementa o Datajud (que traz metadados/movimentações, nunca o teor).
 * A busca é estadual: comarcas do interior julgam dúvida em vara cível
 * comum, então NÃO filtramos por vara — a triagem é pelo conteúdo (menção a
 * dúvida + vocabulário registral) e o resolvedor/fila de revisão decide o
 * cartório.
 */

import { buscarRespeitoso, htmlParaTexto } from './http';
import type { Coletor, ConteudoColetado, ReferenciaColeta } from './tipos';

export interface LinhaCjpg {
  numeroCNJ: string;
  /** Id estável da âncora da linha (cdProcesso-foro--cdDocumento). */
  idDocumento: string;
  classe?: string;
  assunto?: string;
  magistrado?: string;
  comarca?: string;
  foro?: string;
  vara?: string;
  /** Data de disponibilização (ISO), quando a linha traz. */
  data?: string;
  /** Inteiro teor da sentença, já sem HTML. */
  texto: string;
}

const RE_NUMERO_CNJ = /\d{7}-\d{2}\.\d{4}\.8\.26\.\d{4}/;

function campoDaLinha(html: string, rotulo: string): string | undefined {
  const re = new RegExp(`<strong>\\s*${rotulo}:\\s*<\\/strong>\\s*([^<]+)`, 'i');
  const bruto = re.exec(html)?.[1]?.trim();
  return bruto ? bruto.replace(/\s+/g, ' ') : undefined;
}

function dataIso(html: string): string | undefined {
  const bruto = campoDaLinha(html, 'Data de Disponibiliza[^:<]*');
  const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(bruto ?? '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : undefined;
}

/** Sanidade: a sentença fala mesmo de dúvida registral? */
export function pareceDuvidaRegistral(texto: string): boolean {
  return (
    /d[uú]vida/i.test(texto) &&
    /registr|matr[ií]cula|averba|oficial|tabeli|qualifica[çc][ãa]o|prenota/i.test(texto)
  );
}

/** Parser PURO da página de resultados do CJPG (testável com fixture). */
export function linhasDoCjpg(html: string): LinhaCjpg[] {
  const linhas: LinhaCjpg[] = [];
  const blocos = html.split(/<tr class="fundocinza1">/i).slice(1);
  for (const bloco of blocos) {
    const numeroCNJ = RE_NUMERO_CNJ.exec(bloco)?.[0];
    const idDocumento = /name="([^"]+)"/.exec(bloco)?.[1];
    if (!numeroCNJ || !idDocumento) continue;
    // O teor completo é o ÚLTIMO <div display:none> da linha; o visível é o
    // resumo truncado. Pega o maior span escondido.
    const escondidos = [
      ...bloco.matchAll(
        /<div[^>]*style="display:\s*none;?"[^>]*>\s*<span>([\s\S]*?)<\/span>\s*<img class="mostrarOcultarConteudo"/gi,
      ),
    ].map((m) => m[1]);
    const maior = escondidos.sort((a, b) => b.length - a.length)[0];
    if (!maior) continue;
    const texto = htmlParaTexto(maior);
    if (texto.length < 100) continue;
    linhas.push({
      numeroCNJ,
      idDocumento,
      classe: campoDaLinha(bloco, 'Classe'),
      assunto: campoDaLinha(bloco, 'Assunto'),
      magistrado: campoDaLinha(bloco, 'Magistrado'),
      comarca: campoDaLinha(bloco, 'Comarca'),
      foro: campoDaLinha(bloco, 'Foro'),
      vara: campoDaLinha(bloco, 'Vara'),
      data: dataIso(bloco),
      texto,
    });
  }
  return linhas;
}

/** Monta o documento textual que segue ao pipeline (cabeçalho + teor). */
export function documentoDaLinha(l: LinhaCjpg): string {
  return [
    `Sentença — CJPG/TJSP (inteiro teor público)`,
    `Número CNJ: ${l.numeroCNJ}`,
    l.classe ? `Classe: ${l.classe}` : null,
    l.vara ? `Vara: ${l.vara}` : null,
    l.comarca ? `Comarca: ${l.comarca}` : null,
    l.data ? `Disponibilização: ${l.data}` : null,
    '',
    l.texto,
  ]
    .filter((x) => x !== null)
    .join('\n');
}

// A listagem já carrega o teor; o baixar lê daqui (mesma execução do worker).
const teoresDaExecucao = new Map<string, ConteudoColetado>();

export const coletorCjpg: Coletor = {
  async listar(fonte) {
    const base = fonte.urlBase ?? 'https://esaj.tjsp.jus.br';
    // Termo SEM acento (o motor do e-SAJ casou os dois jeitos na sonda; as
    // próprias sentenças escrevem "duvida" sem acento com frequência).
    const termo = String(fonte.config.pesquisaLivre ?? '"duvida" registro de imoveis');
    // Janela FIXA em vez do incremental por ultimaColeta: só a página 1 é
    // lida e o dedupe por hash impede reprocessar — assim a coleta não
    // depende do relógio da fonte e dúvida é decisão rara (a mais nova pode
    // ter meses).
    const janelaDias = Number(fonte.config.janelaDias ?? 365);
    const dtInicio = new Date(Date.now() - janelaDias * 86400000).toLocaleDateString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
    });
    const url =
      `${base}/cjpg/pesquisar.do?dadosConsulta.pesquisaLivre=${encodeURIComponent(termo)}` +
      `&dadosConsulta.dtInicio=${encodeURIComponent(dtInicio)}&dadosConsulta.ordenacao=DESC`;
    const r = await buscarRespeitoso(url);
    const html = await r.text();
    const refs: ReferenciaColeta[] = [];
    for (const linha of linhasDoCjpg(html)) {
      if (!pareceDuvidaRegistral(linha.texto)) continue;
      const ref = `cjpg:${linha.numeroCNJ}:${linha.idDocumento}`;
      teoresDaExecucao.set(ref, {
        urlOrigem: ref,
        mime: 'text/plain',
        texto: documentoDaLinha(linha),
        dataDocumento: linha.data,
      });
      refs.push({
        url: ref,
        dataDocumento: linha.data,
        rotulo: `${linha.classe ?? 'Sentença'} — ${linha.vara ?? ''} ${linha.comarca ?? ''}`.trim(),
      });
    }
    return refs;
  },

  async baixar(_fonte, ref): Promise<ConteudoColetado> {
    const pronto = teoresDaExecucao.get(ref.url);
    if (!pronto)
      throw new Error(`CJPG: teor de ${ref.url} não veio na listagem desta execução`);
    return pronto;
  },
};
