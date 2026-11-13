// Письмо админам о покупке картой — кто купил (владелец, 13.11.2026: «веди учёт, кто возьмёт
// что-либо через тестовую карту»): ник Telegram или почта Google наполовину, и номер аккаунта.
import { describe, expect, it } from "vitest";
import { cardSaleText, maskEmail } from "./xsollaNotify";

const order = { orderId: 7, account: "acc_1", items: [{ sku: "gold_1k", quantity: 1 }], sandbox: true, amount: "5", currency: "USD" };

describe("письмо о покупке картой", () => {
  it("тест помечен, покупатель и аккаунт — в письме", () => {
    const t = cardSaleText(order as never, [], "Google mis***@gmail.com");
    expect(t).toContain("💳 Картой (тест): gold_1k");
    expect(t).toContain("👤 Google mis***@gmail.com · acc_1");
  });
  it("без имени — только аккаунт", () => {
    expect(cardSaleText(order as never, [])).toContain("👤 acc_1");
  });
  it("почта — наполовину", () => {
    expect(maskEmail("misytka666@gmail.com")).toBe("mis***@gmail.com");
    expect(maskEmail("ab@x.io")).toBe("a***@x.io");
  });
});
