// ✦ к готовому списку одним запросом: поле только у зачарованных, сбой чтения
// и мусор вместо числа ответ не роняют и NaN в отметку не пускают.
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[][] = [];
let reply: Map<string, number> | Error = new Map();
vi.mock("./enchant-cards", () => ({
  enchantPcts: async (ids: string[]) => {
    calls.push(ids);
    if (reply instanceof Error) throw reply;
    return reply;
  },
}));

const { withEnchantPcts, safeEnchantPcts } = await import("./enchant-attach");

beforeEach(() => {
  calls.length = 0;
  reply = new Map();
});

describe("withEnchantPcts", () => {
  it("один запрос на весь список, без повторов id; поле — только у зачарованных", async () => {
    reply = new Map([["b", 12]]);
    const out = await withEnchantPcts([{ id: "a" }, { id: "b" }, { id: "a" }], (r) => r.id);
    expect(calls).toEqual([["a", "b"]]);
    expect(out).toEqual([{ id: "a" }, { id: "b", enchantPct: 12 }, { id: "a" }]);
  });

  it("пустой список — без запроса; сбой базы — строки как были", async () => {
    expect(await withEnchantPcts([], () => "x")).toEqual([]);
    expect(calls).toHaveLength(0);
    reply = new Error("db down");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await withEnchantPcts([{ id: "a" }], (r) => r.id)).toEqual([{ id: "a" }]);
    warn.mockRestore();
  });

  it("не число вместо процента — не зачарован", async () => {
    reply = new Map([["a", Number.NaN], ["b", -7]]);
    const got = await safeEnchantPcts(["a", "b", null]);
    expect([...got]).toEqual([["b", -7]]);
  });
});
