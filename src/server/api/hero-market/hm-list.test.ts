// Рынок героев: выставление пачкой — итог по каждому герою, отказы ключами словаря,
// повтор того же нажатия, мешочек с не влезшим (событие клетке, сборщик, журнал).
// База подделана (hm-list.fake): hero_market_list отвечает заготовкой по копии
// (раскладка карманов — hm-list-pockets.test.ts; сама функция — migrations/
// hero-market-03, сверка текста — hm-migration-03.test.ts).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fx, listCalls, resetFx } from "./hm-list.fake";

vi.mock("@/server/db/mcpClient", async () => (await import("./hm-list.fake")).mocks.mcp);
vi.mock("@/server/raidLive", async () => (await import("./hm-list.fake")).mocks.live);
vi.mock(
  "@/server/api/beta-raid/loot-bag/bag-note",
  async () => (await import("./hm-list.fake")).mocks.note,
);
vi.mock(
  "@/server/api/beta-raid/loot-bag/bag-sweep",
  async () => (await import("./hm-list.fake")).mocks.sweep,
);
vi.mock(
  "@/server/api/beta-raid/market-backpack",
  async () => (await import("./hm-list.fake")).mocks.backpack,
);

const { listHeroesAs, listInputSchema } = await import("./hm-list");
const st = fx;

const bag = { id: "lb_1", mapId: "rmap_A", q: 5, r: -3, fresh: true };
const okWithPockets = {
  ok: true,
  fresh: true,
  lotId: "hml_1",
  bag,
  pockets: [
    { stackKey: "custom:cst_honey", kind: "custom", refId: "cst_honey", name: "Мёд", count: 3 },
    { stackKey: "custom:cst_potion", kind: "custom", refId: "cst_potion", name: "Зелье", count: 2 },
  ],
};

beforeEach(() => resetFx());

const input = (
  heroes: Array<{ itemId: string; priceGold?: number | null; priceDarai?: number | null }>,
) => listInputSchema.parse({ op: "click-0001", heroes });

describe("выставить пачкой", () => {
  it("итог по каждому: кто выставлен, кто нет и почему (ключ + числа)", async () => {
    st.byItem.set("ugi_ok", okWithPockets);
    st.byItem.set("ugi_common", { ok: false, error: "common" });
    st.byItem.set("ugi_main", { ok: false, error: "active" });
    st.byItem.set("ugi_cheap", { ok: false, error: "gold_min", min: 2500, rarity: "epic" });
    const res = await listHeroesAs(
      "w.near",
      "acc_S",
      input([
        { itemId: "ugi_ok", priceGold: 1500 },
        { itemId: "ugi_common", priceGold: 5000 },
        { itemId: "ugi_main", priceGold: 5000 },
        { itemId: "ugi_cheap", priceGold: 2000 },
      ]),
    );
    expect(res.listed).toBe(1);
    expect(res.results.map((r) => (r.ok ? `ok:${r.lotId}` : r.error))).toEqual([
      "ok:hml_1",
      "heromkt.common",
      "heromkt.active",
      "heromkt.gold_min",
    ]);
    const cheap = res.results[3];
    expect(cheap.ok === false && cheap.params).toEqual({ min: 2500, rarity: "epic" });
  });

  it("форма цены — до базы: без цены и дробная цена в базу не идут", async () => {
    const res = await listHeroesAs(
      "w.near",
      "acc_S",
      input([{ itemId: "ugi_a" }, { itemId: "ugi_b", priceGold: 1500.5 }]),
    );
    expect(res.results.map((r) => !r.ok && r.error)).toEqual([
      "heromkt.price_required",
      "heromkt.price_bad",
    ]);
    expect(st.sqls).toHaveLength(0);
  });

  it("один герой дважды в пачке — второй отказ «указан дважды», в базу один вызов", async () => {
    st.byItem.set("ugi_ok", okWithPockets);
    const res = await listHeroesAs(
      "w.near",
      "acc_S",
      input([
        { itemId: "ugi_ok", priceGold: 1500 },
        { itemId: "ugi_ok", priceGold: 1600 },
      ]),
    );
    expect(res.results.map((r) => r.ok || r.error)).toEqual([true, "heromkt.duplicate"]);
    expect(listCalls()).toHaveLength(1);
  });

  it("сбой базы на одном герое не роняет остальных; ответ — ключ, без сырого текста", async () => {
    st.byItem.set("ugi_a", "throw:canceling statement due to lock timeout");
    st.byItem.set("ugi_b", { ...okWithPockets, lotId: "hml_b", bag: null, pockets: [] });
    st.byItem.set("ugi_c", "throw:connection reset");
    const res = await listHeroesAs(
      "w.near",
      "acc_S",
      input([
        { itemId: "ugi_a", priceGold: 1500 },
        { itemId: "ugi_b", priceGold: 1500 },
        { itemId: "ugi_c", priceGold: 1500 },
      ]),
    );
    expect(res.results.map((r) => (r.ok ? "ok" : r.error))).toEqual([
      "heromkt.busy_retry",
      "ok",
      "heromkt.failed",
    ]);
  });

  it("ключ операции свой у каждого героя и у каждого аккаунта; цена и минимумы — в вызове", async () => {
    st.byItem.set("ugi_ok", okWithPockets);
    await listHeroesAs(
      "w.near",
      "acc_S",
      input([{ itemId: "ugi_ok", priceGold: 1500, priceDarai: 300000 }]),
    );
    const [call] = listCalls();
    expect(call).toContain("'hm:acc_S:click-0001:ugi_ok'");
    expect(call).toContain("1500, 300000");
    expect(call).toContain('{"rare":1000,"epic":2500,"legendary":5000}');
  });
});

describe("не влезшее → мешочек", () => {
  it("событие «bags» клетке мешочка, сборщик запущен, по стопке — строка журнала", async () => {
    st.byItem.set("ugi_ok", okWithPockets);
    const res = await listHeroesAs(
      "w.near",
      "acc_S",
      input([{ itemId: "ugi_ok", priceGold: 1500 }]),
    );
    const r = res.results[0];
    expect(r.ok && r.bag).toEqual({ id: "lb_1", mapId: "rmap_A", q: 5, r: -3 });
    expect(r.ok && r.pockets.map((p) => `${p.stackKey}×${p.count}`)).toEqual([
      "custom:cst_honey×3",
      "custom:cst_potion×2",
    ]);
    expect(st.events).toEqual([{ mapId: "rmap_A", type: "bags", cells: ["5,-3"] }]);
    // Сборщик грузится лениво (import()) — ждём его тик.
    await vi.waitFor(() => expect(st.sweeps).toBe(1));
    expect(st.notes).toHaveLength(2);
    expect(st.notes[0]).toMatchObject({
      qty: 3,
      bag: { q: 5, r: -3 },
      actor: { account: "acc_S", mapId: "rmap_A" },
    });
  });

  it("пустые карманы — без мешочка, событий и журнала", async () => {
    st.byItem.set("ugi_ok", { ...okWithPockets, bag: null, pockets: [] });
    const res = await listHeroesAs(
      "w.near",
      "acc_S",
      input([{ itemId: "ugi_ok", priceGold: 1500 }]),
    );
    expect(res.results[0].ok && res.results[0].bag).toBeNull();
    expect(st.events).toHaveLength(0);
    expect(st.notes).toHaveLength(0);
    expect(st.sweeps).toBe(0);
  });

  it("повтор того же нажатия — тот же лот, fresh=false, мешочек второй раз не роняется", async () => {
    st.byItem.set("ugi_ok", okWithPockets);
    const first = await listHeroesAs(
      "w.near",
      "acc_S",
      input([{ itemId: "ugi_ok", priceGold: 1500 }]),
    );
    st.events = [];
    st.notes = [];
    const again = await listHeroesAs(
      "w.near",
      "acc_S",
      input([{ itemId: "ugi_ok", priceGold: 1500 }]),
    );
    expect(first.results[0].ok && first.results[0].fresh).toBe(true);
    expect(again.results[0].ok && again.results[0]).toMatchObject({ lotId: "hml_1", fresh: false });
    expect(st.events).toHaveLength(0);
    expect(st.notes).toHaveLength(0);
  });
});
