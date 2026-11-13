// Проверка ID-токена Google (вход через Google, 29.10.2026) — без новых зависимостей.
//
// Токен — JWT RS256 от Google Identity Services. Подпись проверяем ключами Google
// (JWKS, кэш по max-age, ключ по kid) через crypto.subtle; дальше — издатель,
// получатель (наш Client ID), срок (запас 60 с на расхождение часов) и
// подтверждённая почта. Любой отказ — одна ошибка google.badToken: подробности
// снаружи не нужны, а перебор по ним — подсказка подделывающему.

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
/** Запас на расхождение часов, секунды. */
const SKEW_S = 60;
/** Нет max-age в ответе — держим ключи 5 минут. */
const DEFAULT_TTL_MS = 5 * 60_000;
/** Неизвестный kid перечитывает ключи не чаще раза в минуту (ротация у Google — редкость). */
const REFETCH_GAP_MS = 60_000;
const FETCH_TIMEOUT_MS = 5_000;

type Jwk = { kid: string; kty: string; n: string; e: string };
type Cache = { keys: Jwk[]; until: number; at: number };

let cache: Cache | null = null;

/** Для тестов: забыть ключи. */
export function resetGoogleJwksCache(): void {
  cache = null;
}

/** exp — срок токена в секундах (для одноразовой метки, googleOnce.ts). */
export type GoogleIdentity = { sub: string; email: string | null; exp: number };

const bad = () => new Error("google.badToken");

function b64urlBytes(s: string): Uint8Array<ArrayBuffer> {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(norm + "=".repeat((4 - (norm.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function maxAgeMs(cacheControl: string | null): number {
  const m = /max-age=(\d+)/i.exec(cacheControl ?? "");
  return m ? Number(m[1]) * 1000 : DEFAULT_TTL_MS;
}

async function fetchKeys(nowMs: number): Promise<Cache> {
  const res = await fetch(JWKS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`google jwks: HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: unknown };
  const keys = (Array.isArray(body.keys) ? body.keys : []).filter(
    (k): k is Jwk =>
      !!k &&
      typeof k === "object" &&
      (k as Jwk).kty === "RSA" &&
      typeof (k as Jwk).kid === "string" &&
      typeof (k as Jwk).n === "string" &&
      typeof (k as Jwk).e === "string",
  );
  cache = { keys, at: nowMs, until: nowMs + maxAgeMs(res.headers.get("cache-control")) };
  return cache;
}

async function keyFor(kid: string, nowMs: number): Promise<Jwk | null> {
  let c = cache && cache.until > nowMs ? cache : await fetchKeys(nowMs);
  let hit = c.keys.find((k) => k.kid === kid) ?? null;
  if (!hit && nowMs - c.at >= REFETCH_GAP_MS) {
    c = await fetchKeys(nowMs);
    hit = c.keys.find((k) => k.kid === kid) ?? null;
  }
  return hit;
}

/**
 * Проверить ID-токен и вернуть личность Google. Сбой сети за ключами — тоже отказ
 * (google.badToken): без ключей подпись не проверить, а войти без проверки нельзя.
 */
export async function verifyGoogleIdToken(
  credential: string,
  clientId: string,
  nowMs: number = Date.now(),
): Promise<GoogleIdentity> {
  const parts = credential.split(".");
  if (parts.length !== 3 || parts.some((p) => !p || !/^[A-Za-z0-9_-]+$/.test(p))) throw bad();
  const header = b64urlJson(parts[0]);
  const payload = b64urlJson(parts[1]);
  if (!header || !payload) throw bad();
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw bad();

  let jwk: Jwk | null;
  try {
    jwk = await keyFor(header.kid, nowMs);
  } catch (e) {
    console.warn("[google-login] ключи Google не получены:", e instanceof Error ? e.message : e);
    throw bad();
  }
  if (!jwk) throw bad();

  let ok = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    ok = false;
  }
  if (!ok) throw bad();

  const nowS = nowMs / 1000;
  if (typeof payload.iss !== "string" || !ISSUERS.has(payload.iss)) throw bad();
  if (payload.aud !== clientId) throw bad();
  if (typeof payload.exp !== "number" || payload.exp + SKEW_S < nowS) throw bad();
  if (typeof payload.nbf === "number" && payload.nbf - SKEW_S > nowS) throw bad();
  if (payload.email_verified !== true) throw bad();
  const sub = payload.sub;
  if (typeof sub !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(sub)) throw bad();
  const email = typeof payload.email === "string" ? payload.email.slice(0, 320) : null;
  return { sub, email, exp: payload.exp };
}
