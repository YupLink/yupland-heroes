// Использовать товар-буст: списание из рюкзака может не просто вернуть «нет», а
// бросить (изношенный инструмент, §8.18) — ключ нажатия тогда отпускается, как
// и при «столько нет», и бафф не выдаётся.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ released: [] as string[], applied: 0, take: "throw" as string }));

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [{ boost: null }] }));
vi.mock("../../auth", () => ({ requireWallet: () => "w1" }));
vi.mock("./market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", heroName: "Воин" }),
  takeFromBackpackStack: async () => {
    if (s.take === "throw") throw new Error("braid.tool_worn_stays");
    return null;
  },
  returnToBackpackStack: async () => {},
}));
vi.mock("./item-alias", () => ({ canonRef: async (_k: string, ref: string) => ref }));
vi.mock("./hero-boost", () => ({
  claimBoostOp: async () => true,
  releaseBoostOp: async (op: string) => void s.released.push(op),
  boostOpAmount: async () => 0,
}));
vi.mock("./hero-buff", () => ({ applyBoostRoll: async () => void s.applied++ }));
vi.mock("@/lib/hero/boost", async (orig) => ({
  ...(await orig<object>()),
  parseBoostEffects: () => [{ stat: "atk", value: "1", minutes: "30" }],
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));

const { applyItemBoost } = await import("./boost-item");
const use = () =>
  (applyItemBoost as unknown as (a: { data: object }) => Promise<unknown>)({
    data: { stackKey: "custom:cst_potion", op: "op_123456", qty: 1 },
  });

beforeEach(() => Object.assign(s, { released: [], applied: 0, take: "throw" }));

describe("буст из рюкзака: списание бросило", () => {
  it("ключ нажатия отпущен, бафф не выдан, причина — та, что бросило списание", async () => {
    await expect(use()).rejects.toThrow("braid.tool_worn_stays");
    expect(s.released).toEqual(["op_123456"]);
    expect(s.applied).toBe(0);
  });

  it("«столько нет» — как раньше: ключ отпущен", async () => {
    s.take = "null";
    await expect(use()).rejects.toThrow("Столько штук в сумке нет");
    expect(s.released).toEqual(["op_123456"]);
  });
});
