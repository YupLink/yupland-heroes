import { describe, expect, it } from "vitest";
import { isWalletLinked } from "./walletLinked";

describe("isWalletLinked", () => {
  it("вход только через Telegram — кошелька нет", () => {
    expect(isWalletLinked("tg123456")).toBe(false);
    expect(isWalletLinked(null)).toBe(false);
    expect(isWalletLinked("")).toBe(false);
  });
  it("настоящий кошелёк — есть", () => {
    expect(isWalletLinked("owner.near")).toBe(true);
    expect(isWalletLinked("i123.tg")).toBe(true);
    expect(isWalletLinked("hot.tg")).toBe(true);
  });
});
