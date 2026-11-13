// Оплата сданных героев (§8.73 п. 4): отметка «оплачено» и высыпание рюкзака —
// одной строкой запроса; клетка — основного героя (нет — лавки); живой мешочек
// клетки — кандидат; ответ для окна — стопки и число снятых артефактов.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  sqls: [] as string[],
  snaps: [] as Array<{ hero_id: string | null; equipped: unknown }>,
  bag: [] as Array<{ id: string }>,
  rows: [] as unknown[],
  cell: { q: 5, r: 6 } as { q: number; r: number } | null,
  published: [] as unknown[],
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    st.sqls.push(sql);
    if (sql.includes("WITH heroes AS")) return st.rows;
    if (sql.includes("p.instance->'equipped'")) return st.snaps;
    if (sql.startsWith("SELECT b.id FROM yuplink.raid_loot_bag")) return st.bag;
    return [];
  },
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: (e: unknown) => void st.published.push(e) }));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({ ownCell: async () => st.cell }));
vi.mock("@/server/api/beta-raid/loot-bag/bag-sweep", () => ({ startLootBagSweeper: () => {} }));

const { payPawnHeroes, equippedCount } = await import("./hero-pawn-drop");

const heroes = [
  { op: "mkt-sell:1:ugi_1", itemId: "ugi_1", templateId: "hero_A" },
  { op: "mkt-sell:1:ugi_2", itemId: "ugi_2", templateId: "hero_B" },
];
const pay = () =>
  payPawnHeroes({ wallet: "w1", account: "acc1", mapId: "map1", shop: { q: 1, r: 2 }, heroes });

beforeEach(() => {
  Object.assign(st, { sqls: [], snaps: [], bag: [], rows: [], cell: { q: 5, r: 6 }, published: [] });
});

describe("payPawnHeroes", () => {
  it("оплата и высыпание — одной строкой; мешочек на клетке основного, окно — стопки и арты", async () => {
    st.snaps = [
      { hero_id: "hero_1", equipped: { Голова: "ugi_a", Ноги: "ugi_b" } },
      { hero_id: null, equipped: null },
    ];
    st.bag = [{ id: "lb_old" }];
    st.rows = [
      { _row: { stack_key: "custom:apple", name: "Яблоко", image: "/a.png", put: "14", bag_id: "lb_old", fresh: false } },
      { _row: JSON.stringify({ stack_key: "custom:axe", name: "Топор", image: null, put: 2, bag_id: "lb_old", fresh: false }) },
    ];
    expect(await pay()).toEqual({
      q: 5,
      r: 6,
      items: [
        { name: "Яблоко", image: "/a.png", count: 14 },
        { name: "Топор", image: null, count: 2 },
      ],
      arts: 2,
    });
    const tx = st.sqls.find((s) => s.includes("WITH heroes AS"))!;
    expect(tx.indexOf("SET paid_at = now()")).toBeLessThan(tx.indexOf("WITH heroes AS"));
    expect(tx).toContain("'mkt-sell:1:ugi_1', 'mkt-sell:1:ugi_2'");
    expect(tx).toContain("hashtext('bp:' || (p.instance->>'id'))");
    expect(tx).toContain("b.q = 5 AND b.r = 6");
    expect(tx).toContain("ORDER BY (b.id = 'lb_old') DESC");
    expect(st.published).toEqual([{ mapId: "map1", type: "bags", cells: ["5,6"] }]);
  });

  it("основного героя на карте нет — клетка лавки", async () => {
    st.cell = null;
    st.snaps = [{ hero_id: "hero_1", equipped: {} }];
    st.rows = [{ _row: { stack_key: "k", name: "Груша", image: null, put: 1, bag_id: "lb_n", fresh: true } }];
    expect((await pay())?.q).toBe(1);
    expect(st.sqls.find((s) => s.includes("WITH heroes AS"))).toContain("b.q = 1 AND b.r = 2");
  });

  it("высыпать нечего (спящие) — отметка оплаты той же строкой, окна нет", async () => {
    st.snaps = [{ hero_id: null, equipped: null }];
    expect(await pay()).toBeNull();
    const tx = st.sqls.find((s) => s.includes("WITH heroes AS"))!;
    expect(tx).toContain("SET paid_at = now()");
  });

  it("сбой чтения снимков не отменяет высыпания (герои — из самого запроса)", async () => {
    st.snaps = null as unknown as typeof st.snaps;
    st.rows = [{ _row: { stack_key: "k", name: "Груша", image: null, put: 1, bag_id: "lb_n", fresh: true } }];
    expect(await pay()).toEqual({ q: 5, r: 6, items: [{ name: "Груша", image: null, count: 1 }], arts: 0 });
  });

  it("надетый арт лёг в мешочек — в списке, а не «в инвентаре»; не лёг — «в инвентаре»", async () => {
    st.snaps = [{ hero_id: "hero_1", equipped: { Руки: "ugi_x", Ноги: "ugi_y" } }];
    st.rows = [{ _row: { stack_key: "art:ugi_x", kind: "art", ref_id: "tpl", name: "Меч", image: null, put: 1, bag_id: "lb", fresh: true } }];
    expect(await pay()).toEqual({ q: 5, r: 6, items: [{ name: "Меч", image: null, count: 1 }], arts: 1 });
    st.rows = [];
    expect(await pay()).toEqual({ q: 5, r: 6, items: [], arts: 2 });
  });

  it("надетое считается по непустым слотам", () => {
    expect(equippedCount({ a: "ugi_1", b: "", c: null })).toBe(1);
    expect(equippedCount(null)).toBe(0);
    expect(equippedCount(["ugi_1"])).toBe(0);
  });
});
