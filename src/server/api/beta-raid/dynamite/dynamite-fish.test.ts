// Рыба под красным динамитом (dynamite-fish) без базы: какие клетки — вода (правило
// берега удочки), шанс — настройка рыбалки с бонусом героя и погодой, бросок — от
// зерна броска на сервере (тот же ключ — тот же улов), синий и суша — без рыбы,
// башмак — порция-метка вместо улова.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blastCells } from "@/lib/dynamite";
import { dynamiteFishChance, rollBlastFish } from "@/lib/raid/dynamiteFish";
import { WATER_SQL } from "@/server/api/beta-raid/cell-sql";
import { fishSeed } from "@/server/api/beta-raid/fishing/fishing-seed";

const h = vi.hoisted(() => ({
  water: [] as Array<{ q: number; r: number }>,
  queries: [] as string[],
  cfg: {
    intervalMin: 1,
    chancePct: 10,
    items: [
      { id: "cst_pike", pct: 50 },
      { id: "cst_boot", pct: 50 },
    ],
  },
  bonus: 0,
  coef: 1,
  names: { cst_pike: "Щука", cst_boot: "Старый башмак" } as Record<string, string>,
}));

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    h.queries.push(sql);
    return h.water;
  },
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-config", () => ({
  loadFishingConfig: async () => h.cfg,
}));
vi.mock("@/server/api/beta-raid/fishing/fishing-bonus", () => ({
  fishBonusOf: async () => ({ bonusPct: h.bonus, addPct: 0 }),
}));
vi.mock("@/server/api/beta-raid/weather/weather-read", () => ({
  mapWeatherCoefs: async () => ({ fish: h.coef, mine: 1, farm: 1, step: 1, ship: 1 }),
}));
vi.mock("@/server/api/beta-raid/loot-bag/bag-deliver-parts", () => ({
  groupItems: async (items: Array<{ itemId: string; amount: number; origin: string }>) => ({
    groups: items.map((it) => ({
      stackKey: `custom:${it.itemId}`,
      kind: "custom",
      refId: it.itemId,
      itemId: it.itemId,
      name: h.names[it.itemId] ?? it.itemId,
      image: `/img/${it.itemId}.webp`,
      count: it.amount,
      marks: { mob: 0, mine: 0, field: 0, loot: it.origin === "loot" ? it.amount : 0 },
      items: [],
    })),
    bad: [],
  }),
}));

const { blastFish, blastWaterSql, fishItems, DYNAMITE_FISH_SALT } = await import("./dynamite-fish");

const AT = { q: 1, r: 0 };
const OP = "dyn:acc_me:op_abcdef";
const base = { mapId: "rmap_1", at: AT, kind: "red" as const, account: "acc_me", wallet: "w_me" };
const ALL = blastCells(AT, "red");

beforeEach(() => {
  h.water = ALL.map((c) => ({ ...c }));
  h.queries = [];
  h.cfg = { ...h.cfg, chancePct: 10 };
  h.bonus = 0;
  h.coef = 1;
});

describe("клетки воды", () => {
  it("семь клеток красного взрыва, вода — правилом берега удочки, без купола", () => {
    const sql = blastWaterSql("rmap'1", AT).replace(/\s+/g, " ");
    expect(sql).toContain(WATER_SQL);
    expect(sql).toContain("JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id");
    expect(sql).toContain("c.map_id = 'rmap''1'");
    expect(sql).toContain("AND NOT COALESCE(c.void_fog, false)");
    expect(sql).toContain(`(c.q, c.r) IN (${ALL.map((c) => `(${c.q}, ${c.r})`).join(", ")})`);
  });
});

describe("бросок только у красного и только на воде", () => {
  it("синий — пусто, в базу не ходит", async () => {
    await expect(blastFish({ ...base, kind: "blue", op: OP })).resolves.toEqual([]);
    expect(h.queries).toEqual([]);
  });

  it("воды под взрывом нет — пусто", async () => {
    h.water = [];
    h.cfg = { ...h.cfg, chancePct: 100 };
    await expect(blastFish({ ...base, op: OP })).resolves.toEqual([]);
  });

  it("улов не настроен — пусто", async () => {
    const was = h.cfg;
    h.cfg = { ...was, items: [] };
    await expect(blastFish({ ...base, op: OP })).resolves.toEqual([]);
    h.cfg = was;
  });

  it("на клетках суши рыбы нет, даже при шансе 100 %", async () => {
    h.cfg = { ...h.cfg, chancePct: 100 };
    h.water = [ALL[0], ALL[2]];
    const res = await blastFish({ ...base, op: OP });
    expect(res.map((f) => `${f.q},${f.r}`).sort()).toEqual(
      [ALL[0], ALL[2]].map((c) => `${c.q},${c.r}`).sort(),
    );
  });
});

describe("шанс и зерно — как у удочки, с сервера", () => {
  it("шанс клетки — база мира × бонус героя × погода; зерно — HMAC от ключа броска", async () => {
    h.cfg = { ...h.cfg, chancePct: 10 };
    h.bonus = 60;
    h.coef = 1.5;
    const res = await blastFish({ ...base, op: OP });
    const want = rollBlastFish({
      seed: fishSeed("acc_me", OP, DYNAMITE_FISH_SALT),
      at: AT,
      isWater: () => true,
      chancePct: dynamiteFishChance(10, 60, 1.5),
      items: h.cfg.items,
    });
    expect(res.map((f) => ({ q: f.q, r: f.r }))).toEqual(want.map((w) => ({ q: w.q, r: w.r })));
  });

  it("повтор того же ключа — тот же улов; ключ другого броска бросает по-новому", async () => {
    h.cfg = { ...h.cfg, chancePct: 40 };
    const a = await blastFish({ ...base, op: OP });
    expect(await blastFish({ ...base, op: OP })).toEqual(a);
    const other = await Promise.all(
      ["x1", "x2", "x3", "x4", "x5"].map((k) => blastFish({ ...base, op: `dyn:acc_me:${k}` })),
    );
    expect(other.some((o) => JSON.stringify(o) !== JSON.stringify(a))).toBe(true);
  });

  it("погода «не клюёт» (×0) — рыбы нет", async () => {
    h.cfg = { ...h.cfg, chancePct: 100 };
    h.coef = 0;
    await expect(blastFish({ ...base, op: OP })).resolves.toEqual([]);
  });
});

describe("что всплывает", () => {
  it("рыба — одна штука товара улова с меткой «собрано», срок как у мешочка", async () => {
    expect(await fishItems("cst_pike")).toEqual([
      {
        k: "custom:cst_pike",
        kind: "custom",
        ref: "cst_pike",
        item: "cst_pike",
        name: "Щука",
        image: "/img/cst_pike.webp",
        n: 1,
        h: 24,
        mob: 0,
        mine: 0,
        field: 0,
        loot: 1,
      },
    ]);
  });

  it("башмак — порция-метка вместо товара: в рюкзак не попадёт", async () => {
    expect(await fishItems("cst_boot")).toEqual([
      {
        k: "fish:boot",
        kind: "boot",
        ref: null,
        item: null,
        name: "Упс, показалось",
        image: null,
        n: 1,
        h: 24,
        mob: 0,
        mine: 0,
        field: 0,
        loot: 0,
      },
    ]);
  });

  it("всплывшее — подпись источника и порции на своей клетке", async () => {
    h.cfg = { ...h.cfg, chancePct: 100 };
    const res = await blastFish({ ...base, op: OP });
    expect(res).toHaveLength(7);
    for (const f of res) {
      expect(f.nm).toBe("Рыбалка динамитом");
      expect(f.items).toHaveLength(1);
      expect(["custom:cst_pike", "fish:boot"]).toContain(f.items[0].k);
    }
  });
});
