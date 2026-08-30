/**
 * HTTP RESPEITOSO dos coletores — os princípios do scraping da casa:
 * robots.txt respeitado, no máximo 1 requisição a cada 2s por host,
 * User-Agent identificado, retry com backoff exponencial e PARADA
 * automática (FonteBloqueadaError) em 403/429 ou captcha aparente.
 */

import { FonteBloqueadaError } from './tipos';

export const USER_AGENT =
  'LexCausaJurimetriaBot/1.0 (+https://osucessorista.vercel.app/portal/privacidade; coleta de decisoes e orientacoes publicas; contato pelo site)';

const INTERVALO_POR_HOST_MS = 2000;
const ultimaChamada = new Map<string, number>();
const robotsCache = new Map<string, string[]>();

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function respeitarRitmo(host: string) {
  const antes = ultimaChamada.get(host) ?? 0;
  const espera = antes + INTERVALO_POR_HOST_MS - Date.now();
  if (espera > 0) await dormir(espera);
  ultimaChamada.set(host, Date.now());
}

/** Regras Disallow do robots.txt para User-agent: * (parser simples). */
async function regrasRobots(origem: string): Promise<string[]> {
  const cacheado = robotsCache.get(origem);
  if (cacheado) return cacheado;
  let regras: string[] = [];
  try {
    const r = await fetch(`${origem}/robots.txt`, {
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(10000),
    });
    if (r.ok) {
      const texto = await r.text();
      let valePraNos = false;
      for (const linha of texto.split('\n')) {
        const [chaveBruta, ...resto] = linha.split(':');
        const chave = chaveBruta.trim().toLowerCase();
        const valor = resto.join(':').trim();
        if (chave === 'user-agent') valePraNos = valor === '*' || /lexcausa/i.test(valor);
        else if (valePraNos && chave === 'disallow' && valor) regras.push(valor);
      }
    }
  } catch {
    regras = [];
  }
  robotsCache.set(origem, regras);
  return regras;
}

export async function permitidoPorRobots(url: string): Promise<boolean> {
  const u = new URL(url);
  const regras = await regrasRobots(u.origin);
  return !regras.some((regra) => u.pathname.startsWith(regra));
}

const PARECE_CAPTCHA = /captcha|recaptcha|hcaptcha|cf-challenge|prove que você não é um robô/i;

export async function buscarRespeitoso(
  url: string,
  init: RequestInit = {},
  tentativas = 3,
): Promise<Response> {
  if (!(await permitidoPorRobots(url)))
    throw new FonteBloqueadaError(`robots.txt proíbe ${new URL(url).pathname}`);
  const host = new URL(url).host;
  let ultimoErro: unknown;
  for (let i = 0; i < tentativas; i++) {
    await respeitarRitmo(host);
    try {
      const r = await fetch(url, {
        ...init,
        headers: { 'user-agent': USER_AGENT, ...(init.headers ?? {}) },
        signal: AbortSignal.timeout(45000),
      });
      // 403/429: parada AUTOMÁTICA — a fonte pediu para parar; ninguém contorna.
      if (r.status === 403 || r.status === 429)
        throw new FonteBloqueadaError(`HTTP ${r.status} em ${host}`);
      if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r;
    } catch (e) {
      if (e instanceof FonteBloqueadaError) throw e;
      ultimoErro = e;
      await dormir(2000 * 2 ** i); // backoff exponencial: 2s, 4s, 8s
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
}

/** HTML → texto legível, sem lib nova: corta chrome, decodifica entidades. */
export function htmlParaTexto(html: string): string {
  const semBlocos = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');
  // Prioriza o miolo quando a página marca <main>/<article>.
  const miolo =
    /<main[\s\S]*?<\/main>/i.exec(semBlocos)?.[0] ??
    /<article[\s\S]*?<\/article>/i.exec(semBlocos)?.[0] ??
    semBlocos;
  const texto = miolo
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (PARECE_CAPTCHA.test(html) && texto.length < 400)
    throw new FonteBloqueadaError('página exige captcha');
  return texto;
}
