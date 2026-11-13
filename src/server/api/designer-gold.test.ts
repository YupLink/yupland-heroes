// Кнопка золота дизайнера: только её аккаунт (TEAM_DESIGNER_ACCOUNT из env), 1 000 за
// нажатие, каждое нажатие — своя запись в журнале; остальным — отказ без начисления.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  wallet: "designer.near" as string | null,
  account: "acc_designer_test" as string | null,
  moves: [] as Array<{ account: string; delta: number; kind: string; ref: string }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (fn: () => Promise<unknown>) => fn }),
}));
vi.mock("@/server/auth", () => ({ getCurrentWallet: () => s.wallet }));
vi.mock("./currency/move", () => ({ accAccountId: async () => s.account }));
vi.mock("./gold-move", () => ({
  goldMove: async (account: string, delta: number, kind: string, ref: string) => {
    s.moves.push({ account, delta, kind, ref });
    return true;
  },
  goldOf: async () => 1000 * s.moves.length,
}));

const { getDesignerGoldAccess, takeDesignerGold } = await import("./designer-gold");
const call = (f: unknown) => (f as () => Promise<unknown>)();

beforeEach(() => {
  Object.assign(s, { wallet: "designer.near", account: "acc_designer_test", moves: [] });
  vi.stubEnv("TEAM_DESIGNER_ACCOUNT", "acc_designer_test");
});
afterEach(() => vi.unstubAllEnvs());

describe("золото Ангелины", () => {
  it("её аккаунт: доступ есть, каждое нажатие +1 000 со своим ключом", async () => {
    expect(await call(getDesignerGoldAccess)).toEqual({ allowed: true });
    expect(await call(takeDesignerGold)).toEqual({ gold: 1000 });
    expect(await call(takeDesignerGold)).toEqual({ gold: 2000 });
    expect(s.moves.map((m) => [m.account, m.delta, m.kind])).toEqual([
      ["acc_designer_test", 1000, "designer_gold"],
      ["acc_designer_test", 1000, "designer_gold"],
    ]);
    expect(s.moves[0].ref).not.toBe(s.moves[1].ref);
  });

  it("другой аккаунт или без входа — нельзя, золото не двигается", async () => {
    s.account = "acc_someone_else";
    expect(await call(getDesignerGoldAccess)).toEqual({ allowed: false });
    await expect(call(takeDesignerGold)).rejects.toThrow("Нет доступа");
    s.wallet = null;
    expect(await call(getDesignerGoldAccess)).toEqual({ allowed: false });
    await expect(call(takeDesignerGold)).rejects.toThrow("Нет доступа");
    expect(s.moves).toEqual([]);
  });

  it("TEAM_DESIGNER_ACCOUNT не задан — кнопки нет ни у кого", async () => {
    vi.stubEnv("TEAM_DESIGNER_ACCOUNT", "");
    expect(await call(getDesignerGoldAccess)).toEqual({ allowed: false });
    await expect(call(takeDesignerGold)).rejects.toThrow("Нет доступа");
    expect(s.moves).toEqual([]);
  });
});
