// Токен доступа своей кнопки Google сверяем у Google (tokeninfo): наш Client ID, срок,
// подтверждённая почта — как у ID-токена; иначе google.badToken.
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyGoogleAccessToken } from "./verifyGoogleAccess";

const CID = "1-x.apps.googleusercontent.com";
const NOW = 1_800_000_000_000;
const TOKEN = "ya29.a0AfB_byC" + "x".repeat(30);
const ok = {
  aud: CID,
  azp: CID,
  sub: "1234567890",
  exp: String(NOW / 1000 + 3000),
  email: "a@b.c",
  email_verified: "true",
};

const mockInfo = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

afterEach(() => vi.unstubAllGlobals());

describe("verifyGoogleAccessToken", () => {
  it("наш Client ID, не просрочен, почта подтверждена — sub и почта", async () => {
    mockInfo(200, ok);
    await expect(verifyGoogleAccessToken(TOKEN, CID, NOW)).resolves.toEqual({
      sub: "1234567890",
      email: "a@b.c",
      exp: NOW / 1000 + 3000,
    });
    const url = String((fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]);
    expect(url).toBe(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(TOKEN)}`,
    );
  });

  it("чужое приложение, просрочен, почта не подтверждена, отказ Google, мусор — badToken", async () => {
    for (const body of [
      { ...ok, aud: "other" },
      { ...ok, azp: "other" },
      { ...ok, exp: String(NOW / 1000 - 1) },
      { ...ok, email_verified: "false" },
      { ...ok, sub: "a b" },
    ]) {
      mockInfo(200, body);
      await expect(verifyGoogleAccessToken(TOKEN, CID, NOW)).rejects.toThrow("google.badToken");
    }
    mockInfo(400, { error: "invalid_token" });
    await expect(verifyGoogleAccessToken(TOKEN, CID, NOW)).rejects.toThrow("google.badToken");
    await expect(verifyGoogleAccessToken("bad token!", CID, NOW)).rejects.toThrow(
      "google.badToken",
    );
  });
});
