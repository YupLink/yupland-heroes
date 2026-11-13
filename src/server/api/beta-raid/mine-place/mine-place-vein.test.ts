// Золотая и алмазная шахты из заготовки (владелец 21.10.2026): ставятся по тем
// же правилам, что лесопилка и каменная, только место — жила своего вида под
// клеткой вместо природы вокруг. Ручка поверх фейковой базы: SQL с жилой,
// постройка и рассылка своего шаблона, отказ «нет жилы», повтор нажатия.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  row: null as Record<string, unknown> | null,
  opRow: null as Record<string, unknown> | null,
  plan: null as Record<string, unknown> | null,
  patches: [] as Array<{ patches: unknown[]; assets: unknown }>,
  published: [] as Array<Record<string, unknown>>,
}));

const T = {
  gold: { id: "building_UbJz0SbcXB", name: "Золотая шахта" },
  diamonds: { id: "building_JTzVEXzUQH", name: "Алмазная шахта" },
};

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
    if (/kind, stack_key FROM yuplink\.raid_mine_plan/.test(sql)) return s.plan ? [s.plan] : [];
    if (/UNION ALL SELECT NULL, NULL/.test(sql)) return [{ q: null, r: null, k: "K1" }];
    if (/WHERE o\.op = /.test(sql)) return s.opRow ? [s.opRow] : [];
    if (/WITH prior AS/.test(sql)) return s.row ? [{ _row: s.row }] : [];
    const tpl = /mystic_item_template\s+WHERE id = '([^']+)'/.exec(sql)?.[1];
    if (tpl) return [{ id: tpl, name: tpl, meta: { effect: "mine" } }];
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: Record<string, unknown>) => s.published.push(e),
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
vi.mock("@/server/api/beta-raid/voidCells", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  withoutVoid: async (_m: string, cells: string[]) => cells,
}));
vi.mock("@/server/api/beta-raid/map-journal", () => ({
  recordMapChange: async (
    _m: string,
    change: { patches: unknown[] },
    assetsFor?: () => Promise<unknown>,
  ) => {
    s.patches.push({ patches: change.patches, assets: await assetsFor?.() });
    return 1;
  },
}));

const { placeMineBlueprint } = await import("./mine-place");
/** Чертёж на (10 + dq, 5 + dr) от героя на (10, 5), затем «Разместить». */
const place = (kind: "gold" | "diamonds", d: { dq?: number; dr?: number } = {}) => {
  const [q, r] = [10 + (d.dq ?? 0), 5 + (d.dr ?? 1)];
  s.plan = { map_id: "rmap_1", q, r, kind, stack_key: `custom:cst_mine_bp_${kind}` };
  return (placeMineBlueprint as unknown as Fn)({ data: { op: "op123456" } });
};
const placeSql = () => s.sql.find((x) => x.includes("WITH prior AS")) ?? "";
const flat = (x: string) => x.replace(/\s+/g, " ");
const refused = { was: false, placed: false, cell: true, box: true, trees: null };

beforeEach(() => {
  Object.assign(s, { row: { was: false, placed: true, cell: true, box: true }, opRow: null });
  s.sql.length = 0;
  s.patches.length = 0;
  s.published.length = 0;
});

describe("золотая и алмазная — на жилу", () => {
  it.each(["gold", "diamonds"] as const)("%s: жила в SQL, свой шаблон, рассылка", async (k) => {
    await expect(place(k)).resolves.toEqual({ ok: true, q: 10, r: 6, kind: k });
    const sql = flat(placeSql());
    expect(sql).toContain(
      `FROM yuplink.raid_map_vein v WHERE v.map_id = 'rmap_1' AND v.q = 10 AND v.r = 6 ` +
        `AND v.kind = '${k}'`,
    );
    expect(sql).not.toContain("raid_nature_around");
    expect(sql).toContain(`SET building_id = '${T[k].id}'`);
    expect(sql).toContain(`b.stack_key = 'custom:cst_mine_bp_${k}'`);
    expect(s.patches[0]?.patches).toEqual([
      {
        q: 10,
        r: 6,
        buildingId: T[k].id,
        buildingSkinId: null,
        buildingConfig: { effect: "mine" },
      },
    ]);
    expect(s.published).toEqual([
      { mapId: "rmap_1", type: "built", mine: true, owner: true, cells: ["10,6"] },
    ]);
  });

  it("жилы нет — отказ своим текстом, без рассылки", async () => {
    s.row = { ...refused, vein: false };
    await expect(place("gold")).rejects.toThrow("mineplace.need_vein_gold");
    s.row = { ...refused, vein: false };
    await expect(place("diamonds")).rejects.toThrow("mineplace.need_vein_diamonds");
    expect(s.patches).toHaveLength(0);
    expect(s.published).toHaveLength(0);
  });

  it("прочие правила — как у дерева: дорога, игрок, мешочек", async () => {
    s.row = { ...refused, vein: true, road: true };
    await expect(place("gold")).rejects.toThrow("mineplace.road");
    s.row = { ...refused, vein: true, player: true };
    await expect(place("gold")).rejects.toThrow("mineplace.player");
    s.row = { ...refused, vein: true, bag: true };
    await expect(place("diamonds")).rejects.toThrow("mineplace.busy");
    await expect(place("gold", { dq: 1, dr: 1 })).rejects.toThrow("mineplace.far");
  });

  it("повтор нажатия: ключ с алмазной шахтой узнаётся и досылается", async () => {
    s.row = { was: true, placed: false, cell: true, box: false };
    s.opRow = {
      op: "k",
      map_id: "rmap_1",
      q: 9,
      r: 6,
      kind: "diamonds",
      sent: false,
      building_id: T.diamonds.id,
    };
    await expect(place("diamonds")).resolves.toEqual({ ok: true, q: 9, r: 6, kind: "diamonds" });
    expect(s.patches[0]?.patches).toMatchObject([{ q: 9, r: 6, buildingId: T.diamonds.id }]);
    expect(s.sql.filter((x) => x.includes("SET sent_at = now()"))).toHaveLength(1);
  });
});
