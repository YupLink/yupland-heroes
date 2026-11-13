// Проверка ID-токена Google: свой RSA-ключ вместо ключей Google, fetch подменён.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { resetGoogleJwksCache, verifyGoogleIdToken } from "./verifyGoogleToken";

const CLIENT = "123-abc.apps.googleusercontent.com";
const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
const nowS = NOW / 1000;

type Keys = { priv: CryptoKey; jwk: JsonWebKey & { kid: string } };
let mine: Keys;
let stranger: Keys;
const realFetch = globalThis.fetch;
let fetches = 0;

async function makeKeys(kid: string): Promise<Keys> {
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  return { priv: pair.privateKey, jwk: { ...jwk, kid, alg: "RS256", use: "sig" } };
}

const b64url = (bytes: Uint8Array) =>
  Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const enc = (o: unknown) => b64url(new TextEncoder().encode(JSON.stringify(o)));

async function token(
  claims: Record<string, unknown>,
  opts: { key?: CryptoKey; kid?: string } = {},
): Promise<string> {
  const head = enc({ alg: "RS256", kid: opts.kid ?? "k1", typ: "JWT" });
  const body = enc({
    iss: "https://accounts.google.com",
    aud: CLIENT,
    sub: "1098765432101234567890",
    email: "player@gmail.com",
    email_verified: true,
    iat: nowS - 10,
    exp: nowS + 3600,
    ...claims,
  });
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    opts.key ?? mine.priv,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

beforeAll(async () => {
  mine = await makeKeys("k1");
  stranger = await makeKeys("k1");
});

beforeEach(() => {
  resetGoogleJwksCache();
  fetches = 0;
  globalThis.fetch = vi.fn(async (url: unknown) => {
    fetches++;
    expect(String(url)).toBe("https://www.googleapis.com/oauth2/v3/certs");
    return new Response(JSON.stringify({ keys: [mine.jwk] }), {
      headers: { "content-type": "application/json", "cache-control": "public, max-age=600" },
    });
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("verifyGoogleIdToken", () => {
  it("верный токен → sub, почта и срок; ключи берутся из кэша по max-age", async () => {
    await expect(verifyGoogleIdToken(await token({}), CLIENT, NOW)).resolves.toEqual({
      sub: "1098765432101234567890",
      email: "player@gmail.com",
      exp: nowS + 3600,
    });
    await verifyGoogleIdToken(await token({ iss: "accounts.google.com" }), CLIENT, NOW + 60_000);
    expect(fetches).toBe(1);
  });

  it("чужой aud — отказ", async () => {
    await expect(
      verifyGoogleIdToken(
        await token({ aud: "999-other.apps.googleusercontent.com" }),
        CLIENT,
        NOW,
      ),
    ).rejects.toThrow("google.badToken");
  });

  it("просрочен (больше запаса 60 с) — отказ; в пределах запаса — проходит", async () => {
    await expect(verifyGoogleIdToken(await token({ exp: nowS - 61 }), CLIENT, NOW)).rejects.toThrow(
      "google.badToken",
    );
    await expect(
      verifyGoogleIdToken(await token({ exp: nowS - 30 }), CLIENT, NOW),
    ).resolves.toBeTruthy();
  });

  it("чужая подпись (ключ с тем же kid) — отказ", async () => {
    const forged = await token({}, { key: stranger.priv });
    await expect(verifyGoogleIdToken(forged, CLIENT, NOW)).rejects.toThrow("google.badToken");
  });

  it("подменённое тело при верной подписи — отказ", async () => {
    const [h, , s] = (await token({})).split(".");
    const tampered = `${h}.${enc({ iss: "accounts.google.com", aud: CLIENT, sub: "x", email_verified: true, exp: nowS + 99 })}.${s}`;
    await expect(verifyGoogleIdToken(tampered, CLIENT, NOW)).rejects.toThrow("google.badToken");
  });

  it("почта не подтверждена — отказ", async () => {
    await expect(
      verifyGoogleIdToken(await token({ email_verified: false }), CLIENT, NOW),
    ).rejects.toThrow("google.badToken");
    await expect(
      verifyGoogleIdToken(await token({ email_verified: "true" }), CLIENT, NOW),
    ).rejects.toThrow("google.badToken");
  });

  it("чужой издатель, неизвестный kid, мусор — отказ", async () => {
    await expect(
      verifyGoogleIdToken(await token({ iss: "https://evil.example" }), CLIENT, NOW),
    ).rejects.toThrow("google.badToken");
    await expect(
      verifyGoogleIdToken(await token({}, { kid: "nope" }), CLIENT, NOW),
    ).rejects.toThrow("google.badToken");
    await expect(verifyGoogleIdToken("not.a.jwt", CLIENT, NOW)).rejects.toThrow("google.badToken");
  });

  it("ключи Google не получены — отказ, а не вход без проверки", async () => {
    globalThis.fetch = vi.fn(async () => new Response("down", { status: 503 })) as typeof fetch;
    await expect(verifyGoogleIdToken(await token({}), CLIENT, NOW)).rejects.toThrow(
      "google.badToken",
    );
  });
});
