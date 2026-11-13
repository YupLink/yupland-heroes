// Проверка токена доступа Google — вход своей кнопкой (владелец, 09.11.2026: кнопка
// Google Identity Services перерисовывалась в несколько шагов — «дёргается»). Своя
// кнопка открывает окно выбора аккаунта Google (token client, google.accounts.oauth2)
// и отдаёт токен доступа; его сверяем у самого Google (tokeninfo): выдан НАШЕМУ
// приложению (aud — наш Client ID), не просрочен, почта подтверждена — те же условия,
// что у ID-токена (verifyGoogleToken.ts). Любой отказ — одна ошибка google.badToken.
import type { GoogleIdentity } from "./verifyGoogleToken";

const TOKENINFO = "https://oauth2.googleapis.com/tokeninfo";
const FETCH_TIMEOUT_MS = 5_000;

const bad = () => new Error("google.badToken");

type TokenInfo = {
  aud?: unknown;
  azp?: unknown;
  sub?: unknown;
  exp?: unknown;
  email?: unknown;
  email_verified?: unknown;
};

export async function verifyGoogleAccessToken(
  token: string,
  clientId: string,
  nowMs = Date.now(),
): Promise<GoogleIdentity> {
  if (!/^[A-Za-z0-9._~+/=-]{20,4096}$/.test(token)) throw bad();
  let info: TokenInfo;
  try {
    const res = await fetch(`${TOKENINFO}?access_token=${encodeURIComponent(token)}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw bad();
    info = (await res.json()) as TokenInfo;
  } catch {
    throw bad();
  }
  if (info.aud !== clientId) throw bad();
  if (info.azp !== undefined && info.azp !== clientId) throw bad();
  const exp = Number(info.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= nowMs) throw bad();
  if (info.email_verified !== true && info.email_verified !== "true") throw bad();
  const sub = info.sub;
  if (typeof sub !== "string" || !/^[A-Za-z0-9_-]{1,255}$/.test(sub)) throw bad();
  const email = typeof info.email === "string" ? info.email.slice(0, 320) : null;
  return { sub, email, exp };
}
