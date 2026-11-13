// Статистика входа по кошельку: совпадения считаются по разным аккаунтам.
import { describe, expect, it } from "vitest";
import { GROUPS_SQL, matchesOf } from "./walletLoginAdmin";
import { isGoogleTg, isWalletTg, WALLET_TG_BASE } from "@/lib/auth/googleTg";

describe("статистика входа по кошельку", () => {
  it("совпадения: у каждого — число других кошельков в общих группах", () => {
    const m = matchesOf([
      { by: "device", wallets: ["a", "b"] },
      { by: "ip", wallets: ["a", "b", "c"] },
    ]);
    expect(m.get("a")).toBe(2);
    expect(m.get("c")).toBe(2);
    expect(m.get("z")).toBeUndefined();
  });

  it("группа — только разные аккаунты (кошельки одного аккаунта не в счёт)", () => {
    expect(GROUPS_SQL.match(/count\(DISTINCT tg_id\) > 1/g)).toHaveLength(3);
  });

  it("номер входа по кошельку — не Telegram и не Google-подпись", () => {
    expect(WALLET_TG_BASE).toBe(6755399441055744);
    expect(isWalletTg(WALLET_TG_BASE + 1)).toBe(true);
    expect(isWalletTg(String(WALLET_TG_BASE + 1))).toBe(true);
    expect(isGoogleTg(WALLET_TG_BASE + 1)).toBe(true);
    expect(isWalletTg(2 ** 52 + 1)).toBe(false);
    expect(isWalletTg(8_994_098_844)).toBe(false);
  });
});
