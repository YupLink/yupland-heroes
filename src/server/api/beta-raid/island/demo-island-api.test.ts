// Ручки демо-острова: войти — только с правом demo_island; строка профиля — у
// кого право или кто уже стоит на своём демо-острове; выйти — всегда.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({ right: false, onDemo: false, entered: 0, left: 0 }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({ handler: (h: () => unknown) => () => h() }),
}));
vi.mock("../gate", () => ({ requireBetaRaid: async () => "designer.near" }));
vi.mock("../owner", () => ({ raidOwner: async () => "acc_kai" }));
vi.mock("@/server/admin-rights", () => ({
  accountHasRight: async (_a: string, r: string) => r === "demo_island" && s.right,
}));
vi.mock("./demo-island", () => ({
  onDemoIsland: async () => s.onDemo,
  enterDemoIsland: async () => (s.entered++, { map: "isle_demo", at: { q: 5, r: 6 } }),
  leaveDemoIsland: async () => (s.left++, { map: "isle_barna", at: { q: 20, r: 32 } }),
}));

const api = await import("./demo-island-api");
const call = (f: unknown) => (f as () => Promise<unknown>)();

beforeEach(() => Object.assign(s, { right: false, onDemo: false, entered: 0, left: 0 }));

describe("демо-остров: ручки профиля", () => {
  it("без права — строки нет и войти нельзя", async () => {
    expect(await call(api.getDemoIslandAccess)).toEqual({ allowed: false, onDemo: false });
    await expect(call(api.demoIslandEnter)).rejects.toThrow("Доступ запрещён");
    expect(s.entered).toBe(0);
  });

  it("с правом — строка есть, вход ведёт на остров", async () => {
    s.right = true;
    expect(await call(api.getDemoIslandAccess)).toEqual({ allowed: true, onDemo: false });
    expect(await call(api.demoIslandEnter)).toEqual({ map: "isle_demo", at: { q: 5, r: 6 } });
  });

  it("право сняли, пока она там, — строка «уйти» остаётся и выводит", async () => {
    s.onDemo = true;
    expect(await call(api.getDemoIslandAccess)).toEqual({ allowed: true, onDemo: true });
    expect(await call(api.demoIslandLeave)).toEqual({ moved: { map: "isle_barna", at: { q: 20, r: 32 } } });
    expect(s.left).toBe(1);
  });
});
