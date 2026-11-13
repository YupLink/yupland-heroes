// Метка «оплату вернули»: окно по ней берёт новый ключ нажатия, а игрок видит
// исходный текст ошибки (ru и en), без метки.
import { describe, expect, it } from "vitest";
import { OP_REFUNDED, attemptClosed, markRefunded, unmarkRefunded } from "./castleArchitectMark";
import { architectErrorText } from "./castleArchitectText";

describe("метка «оплату вернули»", () => {
  it("ставится один раз и снимается", () => {
    const m = markRefunded("market.backpack_need:1:0");
    expect(markRefunded(m)).toBe(m);
    expect(unmarkRefunded(m)).toEqual({ refunded: true, message: "market.backpack_need:1:0" });
    expect(unmarkRefunded(" market.need_hero ")).toEqual({
      refunded: false,
      message: "market.need_hero",
    });
  });

  it("ключ нажатия закрыт: метка или прямой отказ «уже вернули»; прочее — нет", () => {
    expect(attemptClosed(new Error(markRefunded("MCP timeout")))).toBe(true);
    expect(attemptClosed(new Error(OP_REFUNDED))).toBe(true);
    expect(attemptClosed(new Error("market.backpack_need:1:0"))).toBe(false);
    expect(attemptClosed(new Error("MCP timeout"))).toBe(false);
    expect(attemptClosed(null)).toBe(false);
  });
});

describe("architectErrorText с меткой", () => {
  for (const ru of [true, false]) {
    it(`текст — как у исходной ошибки (${ru ? "ru" : "en"})`, () => {
      for (const orig of [
        "market.backpack_need:1:0",
        "architect.no_resources",
        "что-то сломалось",
      ]) {
        const marked = architectErrorText(new Error(markRefunded(orig)), ru);
        expect(marked).toBe(architectErrorText(new Error(orig), ru));
        expect(marked).not.toContain("architect.refunded");
      }
    });
  }

  it("рюкзак полон — человеческий текст, не ключ", () => {
    const t = architectErrorText(new Error(markRefunded("market.backpack_need:1:0")), true);
    expect(t).not.toContain("market.");
  });
});
