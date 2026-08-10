// Rate limiting em memória, por chave (normalmente o IP do cliente).
//
// Janela deslizante: guarda os timestamps das últimas requisições de cada
// chave e recusa quando o limite da janela é atingido. É a segunda camada de
// proteção (além da senha): mesmo autenticado, ninguém dispara centenas de
// chamadas por segundo contra o Gemini.
//
// Limitação conhecida: em serverless (Vercel) cada instância tem a própria
// memória, então o teto efetivo é "limite × instâncias ativas". Para conter
// rajadas de abuso — o cenário que gera custo — isso basta; um limite global
// exato exigiria um armazenamento externo (ex.: Upstash Redis).

const buckets = new Map<string, number[]>();

// Poda periódica para a memória não crescer com chaves que nunca voltam.
const MAX_KEYS = 5000;

export interface RateLimitResult {
  ok: boolean;
  retryAfterSeconds: number;
}

export function rateLimit(
  bucket: string,
  key: string,
  limit: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now();
  const id = `${bucket}:${key}`;

  if (buckets.size > MAX_KEYS) {
    for (const [k, hits] of buckets) {
      if (hits.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }

  const hits = (buckets.get(id) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(id, hits);
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((hits[0] + windowMs - now) / 1000),
    };
  }
  hits.push(now);
  buckets.set(id, hits);
  return { ok: true, retryAfterSeconds: 0 };
}

// IP do cliente atrás do proxy da Vercel (ou outro reverso). Sem cabeçalho,
// todas as requisições caem numa chave única — ainda protege o total.
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "desconhecido";
}

// Resposta 429 no mesmo formato de erro que o cliente já entende
// (retryDelaySeconds é o campo que lib/ai.ts usa para decidir esperar).
export function rateLimitResponse(result: RateLimitResult): Response {
  return Response.json(
    {
      error: "Muitas requisições em sequência — aguarde um instante.",
      retryDelaySeconds: result.retryAfterSeconds,
    },
    {
      status: 429,
      headers: { "Retry-After": String(result.retryAfterSeconds) },
    }
  );
}
