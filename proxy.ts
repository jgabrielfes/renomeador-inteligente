// TRANCA DO AMBIENTE DE HOMOLOGAÇÃO (HTTP Basic Auth).
//
// Os domínios de teste (a `develop` de cada site) ficam fechados atrás do
// usuário e da senha do navegador — aquela janelinha nativa "Fazer login".
// Produção não usa nada disso.
//
// COMO LIGA E DESLIGA: pelas variáveis de ambiente BASIC_AUTH_USER e
// BASIC_AUTH_PASSWORD. Com as duas preenchidas, o site inteiro exige a senha;
// faltando qualquer uma, o proxy deixa tudo passar sem custo. Não existe uma
// terceira env dizendo "isto é homologação": a credencial é o próprio
// interruptor, então não há como acabar num estado ambíguo (ambiente marcado
// como protegido, mas sem senha para entrar).
//
// Na Vercel, defina as duas no ambiente **Preview** de cada projeto e NÃO as
// defina em Production. É o mesmo código nos dois; o que muda é a env.
//
// ─────────────────────────────────────────────────────────────────────────
// Por que existe um proxy.ts se o AGENTS.md diz que não deve haver um?
//
// A proibição de antes era sobre AUTENTICAÇÃO DE SESSÃO: houve um proxy que
// olhava a PRESENÇA do cookie do NextAuth para decidir quem entra, e isso
// causou um laço de redirecionamento — cookie morto (banco resetado, prazo
// vencido) não é sessão, mas parecia uma para quem só olha o cookie. Essa
// regra continua valendo e não é o que este arquivo faz.
//
// Aqui não há cookie, não há sessão, não há redirecionamento: é uma tranca de
// ambiente, resolvida no próprio cabeçalho da requisição, respondendo 401 até
// a senha certa chegar. O login da aplicação (lib/auth.ts) segue intacto e
// acontece DEPOIS desta tranca, normalmente.
// ─────────────────────────────────────────────────────────────────────────

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { EH_HUB } from "@/lib/app";

const USUARIO = process.env.BASIC_AUTH_USER;
const SENHA = process.env.BASIC_AUTH_PASSWORD;

/** O nome que aparece na janelinha do navegador. */
const REALM = "Ambiente de homologação";

/**
 * Comparação de texto em tempo constante.
 *
 * O `===` do JavaScript para no primeiro caractere diferente, e o tempo dessa
 * parada é observável: dá para descobrir a senha caractere a caractere medindo
 * a resposta. Aqui todos os caracteres são sempre percorridos, então o tempo
 * não conta nada sobre o conteúdo.
 */
function igualEmTempoConstante(a: string, b: string): boolean {
  // O comprimento vaza de qualquer jeito (o loop teria tamanhos diferentes);
  // comparar o tamanho antes só evita indexar fora da string.
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/** Lê o cabeçalho `Authorization: Basic …` como { usuario, senha }. */
function lerCredenciais(
  cabecalho: string | null
): { usuario: string; senha: string } | null {
  if (!cabecalho?.startsWith("Basic ")) return null;

  let texto: string;
  try {
    // atob devolve bytes como latin1; o TextDecoder os relê como UTF-8, que é
    // o que o navegador manda quando a senha tem acento ou cedilha.
    const bytes = Uint8Array.from(atob(cabecalho.slice(6).trim()), (c) =>
      c.charCodeAt(0)
    );
    texto = new TextDecoder().decode(bytes);
  } catch {
    return null; // base64 inválido
  }

  // Só o PRIMEIRO ":" separa: o usuário não pode conter dois-pontos, a senha
  // pode (e senha gerada por gerenciador costuma conter).
  const corte = texto.indexOf(":");
  if (corte < 0) return null;
  return { usuario: texto.slice(0, corte), senha: texto.slice(corte + 1) };
}

/**
 * O HUB é uma vitrine de UMA página: `/` e os arquivos de identidade visual.
 * Tudo o mais — login, /admin, rotas do Sucessorista, rotas de API, inclusive
 * as do NextAuth — não existe lá.
 *
 * O bloqueio é aqui, e não gate a gate nas páginas, porque assim vale por
 * padrão: rota nova criada para outro site já nasce invisível na vitrine, sem
 * depender de alguém lembrar de adicionar o gate.
 */
const CAMINHOS_DO_HUB = new Set([
  "/",
  "/favicon.ico",
  "/icon.svg",
  "/apple-icon.png",
  "/manifest.webmanifest",
  "/robots.txt",
  "/sitemap.xml",
]);

export function proxy(request: NextRequest) {
  if (EH_HUB && !CAMINHOS_DO_HUB.has(request.nextUrl.pathname)) {
    // 404 e não 403: a rota não existe nesta plataforma — mesma disciplina do
    // requirePlataforma()/foraDaPlataforma() nas outras.
    return new NextResponse(null, { status: 404 });
  }

  // Produção (sem as envs): nada a fazer — segue direto para a aplicação.
  if (!USUARIO || !SENHA) return NextResponse.next();

  const credenciais = lerCredenciais(request.headers.get("authorization"));

  // As duas comparações rodam SEMPRE, mesmo quando a primeira já falhou: com
  // `&&` o curto-circuito diria, pelo tempo de resposta, se o usuário existe.
  const usuarioOk = igualEmTempoConstante(credenciais?.usuario ?? "", USUARIO);
  const senhaOk = igualEmTempoConstante(credenciais?.senha ?? "", SENHA);

  if (credenciais && usuarioOk && senhaOk) return NextResponse.next();

  // 401 + WWW-Authenticate é o que faz o navegador abrir a janelinha de login
  // (e reabri-la quando a senha estiver errada). charset="UTF-8" avisa como
  // codificar acentos.
  return new NextResponse("Acesso restrito.", {
    status: 401,
    headers: {
      "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"`,
      // Nenhuma camada (navegador, CDN da Vercel) pode guardar a resposta de
      // recusa nem a página que vier depois da senha aceita.
      "Cache-Control": "no-store",
    },
  });
}

export const config = {
  // Fecha o site inteiro — páginas, rotas de API, manifesto do PWA, portal do
  // herdeiro. Ficam de fora apenas os assets já compilados do Next
  // (`_next/static`, `_next/image`), que são arquivos versionados por hash,
  // sem dado de usuário: incluí-los faria cada imagem e cada chunk de
  // JavaScript gastar uma invocação de proxy na Vercel, sem proteger nada que
  // já não esteja atrás da tranca nas páginas que os carregam.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
