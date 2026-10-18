// Совместимость со второй редакцией: невыбранная добыча старого журнала
// грабежа. Новые захваты сюда не пишут (добыча сразу в «Добыче»), но старая
// запись по-прежнему разбирается одноразово: сундук первым и не «с мобов»,
// товары сети — «с мобов», невыбранное пропадает. Базы нет — mcpExec подменён.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  claim: null as Record<string, unknown> | null,
  deposits: [] as Array<{ stackKey: string; origin?: string | null }>,
  bag: [] as Array<{ stackKey: string; count: number; potion: boolean }>,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    // Снимок невыбранной добычи до забора — та же строка, что отдаст забор.
    if (sql.includes("SELECT p.id, p.owner_account")) return s.claim ? [s.claim] : [];
    if (sql.includes("UPDATE yuplink.raid_chest_plunder p")) return s.claim ? [s.claim] : [];
    return [];
  },
}));
vi.mock("@/server/api/beta-raid/econ/chest-note", () => ({ noteChestLoot: async () => {} }));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  chestActor: async () => ({ wallet: "w1", mapId: "rmap_x", account: "acc_w" }),
  sqlRow: <T>(rows: unknown[] | undefined) => rows?.[0] as T | undefined,
  num: (v: unknown) => Number(v) || 0,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 10, potionCapacity: 0 }),
  depositToBackpack: async (o: { item: { id: string; kind: string }; origin?: string | null }) =>
    void s.deposits.push({ stackKey: `${o.item.kind}:${o.item.id}`, origin: o.origin }),
}));
vi.mock("@/server/api/beta-raid/chest/chest-net-read", () => ({
  loadBag: async () => s.bag,
  bagOccupied: () => 0,
}));
vi.mock("@/server/api/beta-raid/potion-bag", () => ({ potionKeysOf: async () => new Set() }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  refFromStackKey: (k: string) => k.split(":")[1] ?? "",
}));
vi.mock("@/server/api/beta-raid/gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("@/server/api/currency/move", () => ({ accAccountId: async () => "acc_w" }));

const { plunderChest } = await import("@/server/api/beta-raid/chest/chest-plunder");
const plunderFn = plunderChest as unknown as (a: {
  data: { plunderId: string; picks: Array<{ stackKey: string; qty: number }> };
}) => Promise<{ taken: unknown[]; lost: unknown[] }>;

beforeEach(() => {
  s.sql = [];
  s.claim = null;
  s.deposits = [];
  s.bag = [];
});

describe("plunderChest — старая невыбранная добыча", () => {
  it("уже выбрана (другой вызов) — chest.loot_gone, в рюкзак ничего", async () => {
    await expect(plunderFn({ data: { plunderId: "plu_x", picks: [] } })).rejects.toThrow(
      "chest.loot_gone",
    );
    expect(s.deposits).toHaveLength(0);
  });

  it("сундук ложится обычным предметом, товары сети — loot; невыбранное пропало", async () => {
    s.claim = lootRow({
      stackKey: "custom:cst_gem",
      kind: "custom",
      refId: "cst_gem",
      name: "Камень",
      image: null,
      count: 2,
    });
    const res = await plunderFn({
      data: {
        plunderId: "plu_x",
        picks: [
          { stackKey: "custom:cst_mc", qty: 1 },
          { stackKey: "custom:cst_ore", qty: 25 },
        ],
      },
    });
    expect(s.deposits).toEqual([
      { stackKey: "custom:cst_mc", origin: null },
      { stackKey: "custom:cst_ore", origin: "loot" },
    ]);
    expect(res.lost).toEqual([
      { stackKey: "custom:cst_ore", qty: 15 },
      { stackKey: "custom:cst_gem", qty: 2 },
    ]);
    const claim = s.sql.find((x) => x.includes("UPDATE yuplink.raid_chest_plunder p")) ?? "";
    expect(claim).toContain("p.raider_account = 'acc_w'");
  });

  it("клиент снял сундук — он всё равно уходит первым", async () => {
    s.claim = lootRow();
    await plunderFn({
      data: { plunderId: "plu_x", picks: [{ stackKey: "custom:cst_ore", qty: 5 }] },
    });
    expect(s.deposits[0]).toEqual({ stackKey: "custom:cst_mc", origin: null });
  });

  it("сундуку нет места — отказ ДО забора, добыча ждёт", async () => {
    s.claim = lootRow();
    s.bag = Array.from({ length: 10 }, (_, i) => ({ stackKey: `x${i}`, count: 20, potion: false }));
    await expect(
      plunderFn({ data: { plunderId: "plu_x", picks: [{ stackKey: "custom:cst_ore", qty: 5 }] } }),
    ).rejects.toThrow("market.backpack_full");
    expect(s.sql.some((x) => x.includes("UPDATE yuplink.raid_chest_plunder p"))).toBe(false);
    expect(s.deposits).toHaveLength(0);
  });
});

/** Невыбранная добыча: сундук первым, руда (count строкой — как отдаёт мост). */
function lootRow(...more: Array<Record<string, unknown>>): Record<string, unknown> {
  const item = (key: string, name: string, count: number | string) => ({
    stackKey: `custom:${key}`,
    kind: "custom",
    refId: key,
    name,
    image: null,
    count,
  });
  return {
    id: "plu_x",
    owner_account: "acc_o",
    map_id: "rmap_x",
    q: 1,
    r: 2,
    items: [{ ...item("cst_mc", "С", 1), chest: true }, item("cst_ore", "Руда", "40"), ...more],
  };
}
