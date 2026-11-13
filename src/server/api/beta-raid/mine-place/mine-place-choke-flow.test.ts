// Проход при постановке шахты больше не проверяем (владелец, 22.10.2026: «если
// шахта преградит путь — то и пусть — давать размещать её и всё»): коридор в
// клетку не мешает, отпечатка шахт рядом под локом нет, повтор судит ключ.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  walk: [] as Array<[number, number]>,
  row: null as Record<string, unknown> | null,
  opRow: null as { q: number; r: number; sent: boolean } | null,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    inputValidator: (v: (d: unknown) => unknown) => ({
      handler: (fn: Fn) => async (a: { data: unknown }) => fn({ data: v(a.data) }),
    }),
  }),
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/kind, stack_key FROM yuplink\.raid_mine_plan/.test(sql))
      return [
        { map_id: "rmap_1", q: 11, r: 5, kind: "wood", stack_key: "custom:cst_mine_bp_wood" },
      ];
    if (/UNION ALL SELECT NULL, NULL/.test(sql))
      return [...s.walk.map(([q, r]) => ({ q, r, k: null })), { q: null, r: null, k: "K1" }];
    if (/WHERE o\.op = /.test(sql)) {
      const o = s.opRow;
      return o
        ? [{ op: "k", map_id: "rmap_1", building_id: "building_yYIdx793rM", kind: "wood", ...o }]
        : [];
    }
    if (/WITH prior AS/.test(sql)) return s.row ? [{ _row: s.row }] : [];
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: "rmap_1", account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonRef: async (_k: string, ref: string | null) => ref,
  refFromStackKey: (k: string) => k.slice(k.indexOf(":") + 1) || null,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  playerCell: async () => ({ q: 10, r: 5 }),
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));

const { placeMineBlueprint } = await import("./mine-place");
/** Чертёж лесопилки на (11, 5), герой рядом на (10, 5). */
const place = () => (placeMineBlueprint as unknown as Fn)({ data: { op: "op123456" } });
const placeSql = () => s.sql.find((x) => x.includes("WITH prior AS")) ?? "";

beforeEach(() => {
  Object.assign(s, { walk: [], row: null, opRow: null });
  s.sql.length = 0;
});

describe("постановка и проход", () => {
  it("коридор в клетку: шахта в (11,5) его режет — оператор постановки всё равно идёт", async () => {
    s.walk = [
      [9, 5],
      [10, 5],
      [11, 5],
      [12, 5],
      [13, 5],
    ];
    s.row = { was: false, placed: false, cell: true, box: true, trees: 3, road: true };
    await expect(place()).rejects.toThrow("mineplace.road");
    expect(placeSql()).not.toBe("");
    // Проверки прохода нет вовсе: ни выборки проходимых клеток, ни отпечатка шахт.
    expect(s.sql.some((x) => /UNION ALL SELECT NULL, NULL/.test(x))).toBe(false);
  });

  it("под локом нет сверки отпечатка шахт — «нажми ещё раз» из-за соседей не бывает", async () => {
    s.row = { was: false, placed: false, cell: true, box: true, trees: 3 };
    await place().catch(() => null);
    expect(placeSql()).not.toContain("AS same");
    expect(placeSql()).toMatch(/FROM f, ex, mc, na, box\s+WHERE/);
    expect(placeSql()).toContain("false AS moved");
  });

  it("повтор уже поставленного нажатия — судит ключ, ok", async () => {
    s.opRow = { q: 11, r: 5, sent: true };
    s.row = { was: true, placed: false, cell: true, box: false, trees: 3 };
    await expect(place()).resolves.toEqual({ ok: true, q: 11, r: 5, kind: "wood" });
  });
});
