// «Забрать охрану» своей шахты (владелец, 22.10.2026): оператор — лестница цены
// по запасу службы шахты, энергия до выдачи, босс стопкой boss:<шаблон>, ключ нажатия;
// разбор ответа ключами словаря; ручка — повтор не задваивает, обрыв после
// коммита судит ключ, нехватка энергии и «цена изменилась» — понятным отказом.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { guardTakeEnergySql, guardTakeVerdict, takeGuardSql } from "./mine-guard-take-sql";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  row: null as Record<string, unknown> | null,
  execError: null as string | null,
  done: false,
  published: [] as Array<Record<string, unknown>>,
  notes: [] as number[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (s.execError) throw new Error(s.execError);
    return s.row ? [{ _row: s.row }] : [];
  },
}));
vi.mock("@/server/raidLive", () => ({
  publishRaid: (e: Record<string, unknown>) => s.published.push(e),
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: "rmap_1", account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
}));
vi.mock("@/server/api/beta-raid/backpack-take-once", () => ({ opDone: async () => s.done }));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpend: async (_a: string, n: number) => {
    s.notes.push(n);
  },
}));

const { takeMineGuard } = await import("./mine-guard-take");
const take = (data: Record<string, unknown> = {}) =>
  (takeMineGuard as unknown as Fn)({ data: { q: 4, r: -2, expect: 100, op: "op123456", ...data } });
const flat = (x: string) => x.replace(/\s+/g, " ");

beforeEach(() => {
  Object.assign(s, {
    row: { was: false, taken: true, guard: true, owner: true, need: 100, fits: true, paid: 100 },
    execError: null,
    done: false,
  });
  s.sql.length = 0;
  s.published.length = 0;
  s.notes.length = 0;
});

describe("оператор «Забрать охрану»", () => {
  const sql = flat(
    takeGuardSql({
      mapId: "rmap_1",
      q: 4,
      r: -2,
      account: "acc_1",
      wallet: "w1.tg",
      heroId: "h1",
      capacity: 8,
      expect: 200,
      op: "guardtake:acc_1:o1",
    }),
  );

  it("лестница цены по запасу службы шахты: > 50 % — 100, 20–50 % — 200, < 20 % — 300; без запаса — 100", () => {
    expect(flat(guardTakeEnergySql("L"))).toBe(
      "CASE WHEN L IS NULL OR L > 0.5 THEN 100 WHEN L >= 0.2 THEN 200 ELSE 300 END",
    );
    // Доля — запас службы шахты сейчас (st.life), а не здоровье охранника.
    expect(sql).toContain(
      "price AS (SELECT CASE WHEN x.life IS NULL OR x.life > 0.5 THEN 100 WHEN x.life >= 0.2 THEN 200 ELSE 300 END AS need FROM g LEFT JOIN st x ON true)",
    );
    expect(sql).not.toContain("current_hp, 0) / NULLIF");
    // Не v2 (accrue_from пуст) — запаса нет: NULL → 100.
    expect(sql).toContain("CASE WHEN s.accrue_from IS NULL THEN NULL");
  });

  it("только хозяин и его охранник, только живой, цена не выше показанной, место в рюкзаке", () => {
    expect(sql).toContain("st.owner_account = 'acc_1'");
    const mine =
      "g.r = -2 AND g.owner_account = 'acc_1' AND g.killed_at IS NULL AND g.current_hp > 0";
    // И в выборке охраны, и в её снятии.
    expect(sql.split(mine)).toHaveLength(3);
    expect(sql).toContain("price.need <= 200 AND fits.ok");
    // Сломанная v2 охрану не отдаёт — по запасу службы шахты.
    expect(sql).toContain("(st.life IS NULL OR st.life > 0)");
    expect(sql).toContain("yuplink.raid_mine_mode_hours(s.mode)");
  });

  it("энергия — до выдачи: охрана снимается только вместе с удачным списанием", () => {
    expect(sql).toContain("yuplink.touch_energy_atomic('w1.tg', go.need::numeric)");
    expect(sql).toContain("DELETE FROM yuplink.raid_mine_guard g USING paid");
    expect(sql.indexOf("paid AS (")).toBeLessThan(sql.indexOf("del AS ("));
  });

  it("босс — стопкой лавки boss:<шаблон>, вид boss; ключ нажатия — вместе с выдачей", () => {
    expect(sql).toContain("'boss', d.boss_template_id, 'boss:' || d.boss_template_id");
    expect(sql).toContain("ON CONFLICT (hero_id, stack_key) DO UPDATE");
    expect(sql).toContain(
      "INSERT INTO yuplink.raid_backpack_op (op) SELECT 'guardtake:acc_1:o1' FROM del",
    );
    expect(sql).toContain(
      "SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = 'guardtake:acc_1:o1') AS was",
    );
    // Локи — отдельными операторами до WITH: рюкзак героя и шахта.
    expect(sql.indexOf("'bp:h1'")).toBeLessThan(sql.indexOf("WITH prior"));
    expect(sql.indexOf("'mine:rmap_1:4:-2'")).toBeLessThan(sql.indexOf("WITH prior"));
  });
});

describe("guardTakeVerdict", () => {
  it("снято или повтор — ok; иначе — почему", () => {
    expect(guardTakeVerdict({ taken: true })).toBe("ok");
    expect(guardTakeVerdict({ was: true })).toBe("ok");
    expect(guardTakeVerdict(null)).toBe("chest.busy");
    expect(guardTakeVerdict({ owner: false, guard: true })).toBe("mineguard.not_owner");
    expect(guardTakeVerdict({ owner: true, broken: true, guard: false })).toBe("braid.mine_broken");
    expect(guardTakeVerdict({ owner: true, guard: false })).toBe("mineguard.none");
    expect(guardTakeVerdict({ owner: true, guard: true, fits: false, free: 0 })).toBe(
      "market.backpack_need:1:0",
    );
    expect(guardTakeVerdict({ owner: true, guard: true, fits: true, need: "300" })).toBe(
      'mineguard.price_changed|{"need":300}',
    );
  });
});

describe("takeMineGuard", () => {
  it("снято: энергия в заметку трат, клетку узнают все", async () => {
    await expect(take()).resolves.toEqual({ ok: true, energy: 100 });
    expect(s.sql[0]).toContain("'guardtake:acc_1:op123456'");
    expect(s.notes).toEqual([100]);
    expect(s.published).toEqual([{ mapId: "rmap_1", type: "built", mine: true, cells: ["4,-2"] }]);
  });

  it("повтор нажатия — ok без второй заметки о трате", async () => {
    s.row = { was: true, taken: false, guard: false, owner: true, need: 100, paid: null };
    await expect(take()).resolves.toEqual({ ok: true, energy: 0 });
    expect(s.notes).toEqual([]);
  });

  it("цена выросла против показанной — отказ с новой ценой, без списаний", async () => {
    s.row = {
      was: false,
      taken: false,
      guard: true,
      owner: true,
      need: 200,
      fits: true,
      paid: null,
    };
    await expect(take()).rejects.toThrow('mineguard.price_changed|{"need":200}');
    expect(s.notes).toEqual([]);
  });

  it("нехватка энергии — понятным ключом с ценой", async () => {
    s.execError = "ERROR: not_enough_energy";
    await expect(take({ expect: 300 })).rejects.toThrow('mineplace.no_energy|{"need":300}');
  });

  it("обрыв после коммита: ключ лёг — снято; не лёг — ошибка как есть", async () => {
    s.execError = "bridge timeout";
    s.done = true;
    await expect(take()).resolves.toEqual({ ok: true, energy: 0 });
    s.done = false;
    await expect(take()).rejects.toThrow("bridge timeout");
  });
});
