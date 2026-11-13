// Карандаш цены декора: право — редактор внутрянки (админ + дизайнер), цена —
// целое золото, правка — точечный jsonb_set одного вида, кэш цен сброшен.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({ editor: true, sql: [] as string[], dropped: 0 }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (v: (d: unknown) => unknown) => ({
      handler: (fn: Fn) => async (a: { data: unknown }) => fn({ data: v(a.data) }),
    }),
  }),
}));
vi.mock("@/server/auth", () => ({
  requireCastleEditor: async () => {
    if (!s.editor) throw new Error("Доступ запрещён: редактор внутрянки замка");
    return "w_me";
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql.replace(/\s+/g, " "));
    return null;
  },
}));
vi.mock("./townhall-config", () => ({ dropTownHallConfigCache: () => void (s.dropped += 1) }));

const { setTownHallDecorPrice } = await import("./townhall-decor-price");
const call = (data: unknown) => (setTownHallDecorPrice as unknown as Fn)({ data });

beforeEach(() => Object.assign(s, { editor: true, sql: [], dropped: 0 }));

describe("цена вида декора", () => {
  it("редактор ставит цену: один jsonb_set по виду, кэш сброшен", async () => {
    await expect(call({ kind: "elven-bench", gold: 900 })).resolves.toEqual({ kind: "elven-bench", gold: 900 });
    expect(s.sql).toHaveLength(1);
    expect(s.sql[0]).toContain(`VALUES ('townhall_config', '{"decor":{"elven-bench":900}}')`);
    expect(s.sql[0]).toContain("ARRAY['decor', 'elven-bench'], to_jsonb(900::int)");
    expect(s.dropped).toBe(1);
  });

  it("не редактор — отказ, база не тронута", async () => {
    s.editor = false;
    await expect(call({ kind: "lamp", gold: 10 })).rejects.toThrow("Доступ запрещён");
    expect(s.sql).toEqual([]);
  });

  it("только целое золото от 1, вид — id каталога", async () => {
    for (const bad of [{ kind: "lamp", gold: 0 }, { kind: "lamp", gold: 1.5 }, { kind: "Lamp'", gold: 5 }]) {
      await expect(call(bad)).rejects.toThrow();
    }
    expect(s.sql).toEqual([]);
  });
});
