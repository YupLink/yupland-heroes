// Telegram-номер (кошелёк «tg<id>») наружу не уходит (аудит 11.11.2026).
import { describe, expect, it } from "vitest";
import { publicRows, publicWallet } from "./publicWallet";

describe("publicWallet", () => {
  it("tg<номер> — непрозрачная метка, одна и та же для одного кошелька", async () => {
    const a = await publicWallet("tg123456789");
    expect(a).toMatch(/^#[0-9a-f]{8}$/);
    expect(a).not.toContain("123456789");
    expect(await publicWallet("tg123456789")).toBe(a);
    expect(await publicWallet("tg987654321")).not.toBe(a);
  });
  it("NEAR-кошелёк — как есть", async () => {
    expect(await publicWallet("player1.tg")).toBe("player1.tg");
  });
  it("запасная подпись (= кошелёк) тоже прячется, @ник — остаётся", async () => {
    const [x, y] = await publicRows([
      { wallet: "tg111", name: "tg111" },
      { wallet: "tg222", name: "@nick" },
    ]);
    expect(x.name).toBe(x.wallet);
    expect(x.wallet).toMatch(/^#/);
    expect(y.name).toBe("@nick");
  });
});
