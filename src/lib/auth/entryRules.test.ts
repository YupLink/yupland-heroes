// Три входа (§8.127): звёзды — только с настоящим Telegram; «только Google» по номеру и по tg<id>.
import { describe, expect, it } from "vitest";
import { GOOGLE_TG_BASE, WALLET_TG_BASE } from "./googleTg";
import { googleOnly, googleOnlyWallet, starsAllowed } from "./entryRules";
import { houseCurrencies } from "@/lib/auctionHouse";

describe("правила входа", () => {
  it("звёзды: Telegram — да; Google, кошелёк, гость — нет", () => {
    expect(starsAllowed(100200300)).toBe(true);
    expect(starsAllowed(String(100200300))).toBe(true);
    expect(starsAllowed(GOOGLE_TG_BASE + 3)).toBe(false);
    expect(starsAllowed(WALLET_TG_BASE + 3)).toBe(false);
    expect(starsAllowed(null)).toBe(false);
  });
  it("«только Google»: номер Google и адрес tg<номер Google>; кошелёк и Telegram — нет", () => {
    expect(googleOnly(GOOGLE_TG_BASE + 3)).toBe(true);
    expect(googleOnly(WALLET_TG_BASE + 3)).toBe(false);
    expect(googleOnlyWallet(`tg${GOOGLE_TG_BASE + 3}`)).toBe(true);
    expect(googleOnlyWallet("tg100200300")).toBe(false);
    expect(googleOnlyWallet(`tg${WALLET_TG_BASE + 3}`)).toBe(false);
    expect(googleOnlyWallet("player.near")).toBe(false);
  });
  it("аукцион: «только Google» продаёт за одно золото на любом уровне дома", () => {
    expect(houseCurrencies(10, false, true)).toEqual(["res:gold"]);
    expect(houseCurrencies(0, false, true)).toEqual([]);
    expect(houseCurrencies(10, false)).toContain("STARS");
    expect(houseCurrencies(10, true)).toContain("USDT");
  });
});

describe("вход по домену", async () => {
  const { entryForHost } = await import("./entryHost");
  it("tg. — Telegram, near. — кошелёк, остальное — Google", () => {
    expect(entryForHost("tg.service.yupland.io")).toBe("tg");
    expect(entryForHost("near.service.yupland.io:443")).toBe("near");
    expect(entryForHost("service.yupland.io")).toBe("google");
    expect(entryForHost("localhost:3000")).toBe("google");
    expect(entryForHost(null)).toBe("google");
  });
});
