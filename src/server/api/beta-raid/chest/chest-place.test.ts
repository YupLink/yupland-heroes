// Установка сундука (третья редакция): с охраной или без, одним оператором.
// Базы нет — mcpExec подменён: отвечает так, как ответил бы оператор
// установки, а тест смотрит, что ушло в базу и чем ответила ручка.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  res: {} as Record<string, unknown>,
  fail: null as Error | null,
  done: false,
  tpl: true,
  published: 0,
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
    if (s.fail) throw s.fail;
    return [{ _row: s.res }];
  },
}));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  chestActor: async () => ({ wallet: "w1", mapId: "rmap_x", account: "acc_1" }),
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
}));
vi.mock("@/server/api/beta-raid/chest/chest-item", () => ({ isMagicChestStack: async () => true }));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 10, potionCapacity: 0 }),
}));
vi.mock("@/server/api/beta-raid/encounter-target", () => ({
  loadEncounterTarget: async () =>
    s.tpl
      ? {
          name: "Тролль",
          imageUrl: null,
          backgroundUrl: null,
          maxHp: 500,
          interactionCost: 10,
          abilities: [],
          damage: 25,
        }
      : null,
}));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonCustomMeta: async () => ({ name: "Сундук", image: "/c.png" }),
  refFromStackKey: (k: string) => k.split(":")[1] ?? "",
}));
vi.mock("@/server/api/beta-raid/encounter-where", () => ({
  playerCell: async () => ({ q: 1, r: 2 }),
}));
vi.mock("@/server/api/beta-raid/voidGate", () => ({ requireNotVoid: async () => {} }));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => void s.published++ }));
vi.mock("@/server/api/beta-raid/backpack-take-once", () => ({ opDone: async () => s.done }));

const { placeMagicChest } = await import("@/server/api/beta-raid/chest/chest-place");
const place = placeMagicChest as unknown as (a: {
  data: { stackKey: string; guardKey?: string };
}) => Promise<{ ok: true; q: number; r: number }>;
const withGuard = { stackKey: "custom:cst_mc", guardKey: "boss:b1" };
const bare = { stackKey: "custom:cst_mc" };
const ok = { was: false, placed: true, cell: true, busy: false, box: true, boss: true };
const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  s.sql = [];
  s.res = { ...ok };
  s.fail = null;
  s.done = false;
  s.tpl = true;
  s.published = 0;
});

describe("placeMagicChest с охраной", () => {
  it("сундук, охрана и оба списания — одним оператором; событие карте", async () => {
    await expect(place({ data: withGuard })).resolves.toEqual({ ok: true, q: 1, r: 2 });
    expect(s.sql).toHaveLength(1);
    const sql = flat(s.sql[0] ?? "");
    expect(sql).toContain("INSERT INTO yuplink.raid_magic_chest");
    expect(sql).toContain("INSERT INTO yuplink.raid_mine_guard");
    expect(sql).toContain("b.stack_key = 'boss:b1' AND b.kind = 'boss'");
    expect(s.published).toBe(1);
  });

  it("не босс в guardKey или шаблона нет — chest.need_guard до всякой записи", async () => {
    await expect(place({ data: { ...withGuard, guardKey: "custom:cst_x" } })).rejects.toThrow(
      "chest.need_guard",
    );
    s.tpl = false;
    await expect(place({ data: withGuard })).rejects.toThrow("chest.need_guard");
    expect(s.sql).toHaveLength(0);
  });

  it("босса в рюкзаке нет — оператор ничего не тронул, chest.need_guard", async () => {
    s.res = { ...ok, placed: false, boss: false };
    await expect(place({ data: withGuard })).rejects.toThrow("chest.need_guard");
    expect(s.published).toBe(0);
  });
});

describe("placeMagicChest без охраны", () => {
  it("сундук встаёт один: охраны и босса в операторе нет", async () => {
    await expect(place({ data: bare })).resolves.toEqual({ ok: true, q: 1, r: 2 });
    const sql = flat(s.sql[0] ?? "");
    expect(sql).not.toContain("INSERT INTO yuplink.raid_mine_guard");
    expect(sql).not.toContain("stack_key = 'boss:");
    expect(s.published).toBe(1);
  });

  it("сундука в рюкзаке нет — market.not_found", async () => {
    s.res = { ...ok, placed: false, box: false };
    await expect(place({ data: bare })).rejects.toThrow("market.not_found");
  });

  it("клетка занята — chest.cell_busy", async () => {
    s.res = { ...ok, placed: false, busy: true };
    await expect(place({ data: bare })).rejects.toThrow("chest.cell_busy");
  });
});

describe("повтор моста", () => {
  it("ключ уже стоит (повтор после коммита) — поставлено", async () => {
    s.res = { ...ok, was: true, placed: false };
    await expect(place({ data: bare })).resolves.toEqual({ ok: true, q: 1, r: 2 });
  });

  it("ответ потерялся после коммита — спрашиваем ключ: поставлено", async () => {
    s.fail = new Error("pool is closed");
    s.done = true;
    await expect(place({ data: withGuard })).resolves.toEqual({ ok: true, q: 1, r: 2 });
  });

  it("сбой до коммита — ошибка наверх, событий нет", async () => {
    s.fail = new Error("pool is closed");
    await expect(place({ data: withGuard })).rejects.toThrow("pool is closed");
    expect(s.published).toBe(0);
  });
});
