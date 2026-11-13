// «Съесть» гриб (§8.85): ручка зовёт базу с ключом нажатия и видом стопки,
// отказ — ключом словаря; обход возвращает съеденных на жилы и рассылает клетки;
// миграция mushroom-07 — числа владельца и 10 часов.
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  rows: [] as unknown[],
  fail: null as string | null,
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
    if (s.fail) throw new Error(s.fail);
    return s.rows;
  },
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: "m", account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1", capacity: 8, potionCapacity: 2 }),
}));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpend: async (_a: string, n: number) => {
    s.notes.push(n);
  },
}));

const { eatMushroom, eatResOf } = await import("./dmine-eat");
const eat = (data: Record<string, unknown>) =>
  (eatMushroom as unknown as Fn)({ data: { op: "op123456", cost: 50, ...data } });

beforeEach(() => {
  s.sql.length = 0;
  s.rows = [];
  s.fail = null;
  s.notes.length = 0;
});

describe("«Съесть» — ручка", () => {
  it("вид — из стопки, ключ — по аккаунту и нажатию, награда — из ответа базы", async () => {
    s.rows = [{ res: { was: false, kind: "diamonds", reward: 5, paid: 50 } }];
    await expect(eat({ stackKey: "dmine:diamonds" })).resolves.toEqual({
      ok: true,
      kind: "diamonds",
      reward: 5,
      paid: 50,
    });
    expect(s.notes).toEqual([50]);
    expect(s.sql[0]).toContain(
      "yuplink.raid_mushroom_eat('dmeat:acc_1:op123456', 'acc_1', 'w1.tg',",
    );
    expect(s.sql[0]).toContain("'h1', 'diamonds', 50)");
  });

  it("не гриб — отказ без базы; гриба нет — dmine.no_item", async () => {
    await expect(eat({ stackKey: "custom:cst_x" })).rejects.toThrow("dmine.no_item");
    expect(s.sql).toHaveLength(0);
    s.fail = "ERROR: dmine_no_item";
    await expect(eat({ stackKey: "dmine:gold" })).rejects.toThrow("dmine.no_item");
  });

  it("без подтверждённой цены (старая вкладка) — отказ до базы", async () => {
    await expect(eat({ stackKey: "dmine:gold", cost: undefined })).rejects.toThrow();
    await expect(eat({ stackKey: "dmine:gold", cost: 5 })).rejects.toThrow();
    expect(s.sql).toHaveLength(0);
  });

  it("энергии нет — понятный отказ с ценой 50", async () => {
    s.fail = "ERROR: not_enough_energy";
    await expect(eat({ stackKey: "dmine:darai" })).rejects.toThrow(
      'mineplace.no_energy|{"need":50}',
    );
  });

  it("повтор нажатия — энергию второй раз не записываем", async () => {
    s.rows = [{ res: { was: true, kind: "gold", reward: 5, paid: 50 } }];
    await eat({ stackKey: "dmine:gold" });
    expect(s.notes).toEqual([]);
  });

  it("ответ строкой разбирается", () => {
    expect(eatResOf([{ res: '{"kind":"darai","reward":25000,"paid":50}' }])).toEqual({
      kind: "darai",
      reward: 25000,
      paid: 50,
      was: false,
    });
    expect(eatResOf([])).toBeNull();
  });
});

describe("миграции mushroom-10/11/12", () => {
  const read = (f: string) => readFileSync(`migrations/${f}`, "utf8").replace(/\s+/g, " ");
  const eatSql = read("mushroom-10-eat-energy.sql");
  const spawn = read("mushroom-11-spawn-hour-restore.sql");
  const drop = read("mushroom-12-drop-respawn.sql");
  it("награды владельца и энергия тем же оператором", () => {
    expect(eatSql).toContain("v_amt := CASE p_kind WHEN 'darai' THEN 25000 ELSE 5 END;");
    expect(eatSql).toContain("PERFORM yuplink.touch_energy_atomic(p_wallet, p_cost);");
    expect(eatSql).toContain("PERFORM yuplink.raid_mine_credit(p_account, p_wallet,");
    expect(eatSql).toContain("AND b.stack_key = v_stack AND b.count >= 1");
  });
  it("возврата нет: respawn_at пуст, обход — пустышка, потом удаляется", () => {
    expect(eatSql).not.toContain("interval '10 hours'");
    expect(eatSql).toContain("ALTER COLUMN respawn_at DROP NOT NULL");
    expect(eatSql).toContain("LANGUAGE sql AS $fn$ SELECT NULL::jsonb $fn$;");
    expect(drop).toContain(
      "DROP FUNCTION IF EXISTS yuplink.raid_mushroom_respawn_due(text, integer);",
    );
  });
  it("появление — без ждущих возврата", () => {
    expect(spawn).toContain(
      "CREATE OR REPLACE FUNCTION yuplink.raid_mushroom_spawn_hour(p_op text)",
    );
    expect(spawn).not.toContain("raid_mushroom_eat");
  });
});
