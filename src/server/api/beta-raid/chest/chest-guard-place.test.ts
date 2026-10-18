// Охрана к своему сундуку — одним оператором вместе со списанием босса. Базы
// нет: SQL-модули подменены метками, mcpExec — модель клетки и рюкзака, где
// каждая запись атомарна, как оператор под локами сети и рюкзака. Главное —
// гонка с «Забрать сундук»: босс не удваивается.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  chest: true,
  guard: false,
  deadByOther: false,
  bossInBag: 1,
  chestInBag: 0,
  ops: new Set<string>(),
  lost: false,
  published: 0,
}));

function guardWrite(op: string) {
  if (s.ops.has(op)) return { was: true, placed: false, chest: true, busy: false, boss: true };
  const busy = s.guard || s.deadByOther;
  const go = s.chest && !busy && s.bossInBag >= 1;
  if (go) {
    s.guard = true;
    s.bossInBag -= 1;
    s.ops.add(op);
    if (s.lost) throw new Error("pool is closed");
  }
  return { was: false, placed: go, chest: s.chest, busy, boss: s.bossInBag >= 1 || go };
}

/** «Забрать сундук» (не последний) — та же атомарность: сундук и живая охрана в рюкзак. */
function pickupWrite() {
  if (!s.chest) return;
  s.chest = false;
  s.chestInBag += 1;
  if (s.guard) s.bossInBag += 1;
  s.guard = false;
}

vi.mock("@/server/api/beta-raid/chest/chest-place-sql", () => ({
  chestGuardSql: (_o: unknown, _g: unknown, op: string) => `GUARD${op}`,
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => [{ _row: guardWrite(sql.slice(5)) }],
}));
vi.mock("@/server/api/beta-raid/backpack-take-once", () => ({
  opDone: async (op: string) => s.ops.has(op),
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 10, potionCapacity: 0 }),
}));
vi.mock("@/server/raidLive", () => ({ publishRaid: () => void s.published++ }));
vi.mock("@/server/api/beta-raid/chest/chest-row", () => ({
  sqlRow: <T>(rows: Array<{ _row: T }> | undefined) => rows?.[0]?._row,
}));

const { placeChestGuard } = await import("@/server/api/beta-raid/chest/chest-guard-place");
const tpl = {
  name: "Тролль",
  imageUrl: null,
  backgroundUrl: null,
  maxHp: 500,
  interactionCost: 10,
  abilities: [],
  damage: 25,
};
const place = () =>
  placeChestGuard({
    wallet: "w1",
    account: "acc_1",
    mapId: "rmap_x",
    q: 1,
    r: 2,
    stackKey: "boss:rbt_1",
    templateId: "rbt_1",
    tpl: tpl as never,
  });

beforeEach(() => {
  s.chest = true;
  s.guard = false;
  s.deadByOther = false;
  s.bossInBag = 1;
  s.chestInBag = 0;
  s.ops = new Set();
  s.lost = false;
  s.published = 0;
});

describe("placeChestGuard", () => {
  it("охрана встаёт вместе со списанием босса; событие карте", async () => {
    const res = await place();
    expect(res.guard).toMatchObject({ name: "Тролль", maxHp: 500, currentHp: 500, damage: "25" });
    expect(s.guard).toBe(true);
    expect(s.bossInBag).toBe(0);
    expect(s.published).toBe(1);
  });

  it("сундука нет — chest.gone; живая охрана или чужая победа — guard_busy; босса нет", async () => {
    s.chest = false;
    await expect(place()).rejects.toThrow("chest.gone");
    s.chest = true;
    s.deadByOther = true;
    await expect(place()).rejects.toThrow("chest.guard_busy");
    s.deadByOther = false;
    s.bossInBag = 0;
    await expect(place()).rejects.toThrow("chest.need_guard");
    expect(s.published).toBe(0);
  });

  it("ответ потерялся после коммита — поставлено, босс списан один раз", async () => {
    s.lost = true;
    await expect(place()).resolves.toMatchObject({ ok: true });
    expect(s.bossInBag).toBe(0);
  });
});

describe("гонка с «Забрать сундук»", () => {
  it("охрана раньше — «Забрать» возвращает оплаченного босса: всего один", async () => {
    await place();
    pickupWrite();
    expect(s.bossInBag + (s.guard ? 1 : 0)).toBe(1);
    expect(s.chestInBag).toBe(1);
  });

  it("«Забрать» раньше — охрана не встаёт, босс не тронут: всего один", async () => {
    pickupWrite();
    await expect(place()).rejects.toThrow("chest.gone");
    expect(s.bossInBag).toBe(1);
    expect(s.guard).toBe(false);
  });
});
