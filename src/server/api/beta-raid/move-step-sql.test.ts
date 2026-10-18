// SQL шага: CAS по клетке «откуда» и плата тем же оператором — только со
// сторожем; без него (сход из окна корабля) SQL прежний.
import { describe, expect, it } from "vitest";
import { casPos, stepSql, type StepGuard } from "@/server/api/beta-raid/move-step-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const ACC = "'acc_me'";
const guard = (from: StepGuard["from"]): StepGuard => ({
  from,
  wallet: "w.near",
  cost: 0.5,
  op: "op1",
});
const sql = (mode: "walk" | "ashore" | "sail", g?: StepGuard) =>
  flat(stepSql({ acc: ACC, mapId: "map_1", q: 1, r: 0, mode, guard: g }));

describe("шаг ногами", () => {
  it("позиция меняется только со своей клетки «откуда»", () => {
    const s = sql("walk", guard({ q: 0, r: 0 }));
    expect(s).toContain(
      "VALUES ('acc_me', 1, 0, now(), 'map_1') ON CONFLICT (account_id) DO UPDATE SET q = EXCLUDED.q, r = EXCLUDED.r, updated_at = now(), map_id = EXCLUDED.map_id WHERE p.q = 0 AND p.r = 0 AND (p.map_id IS NULL OR p.map_id = EXCLUDED.map_id) RETURNING p.account_id",
    );
  });

  it("плата — тем же оператором и только за записанную позицию", () => {
    const s = sql("walk", guard({ q: 0, r: 0 }));
    expect(s).toContain(
      "spend AS ( SELECT e.energy_now FROM pos CROSS JOIN LATERAL yuplink.touch_energy_atomic('w.near', 0.5::numeric) e )",
    );
    // Не прочитанный CTE не выполнился бы — плата обязана попасть в итог.
    expect(s).toContain("(SELECT energy_now FROM spend)::float8 AS energy");
    expect(s).toContain("(SELECT count(*) FROM pos)::int AS moved");
  });

  it("метка нажатия — тем же оператором и только за записанную позицию", () => {
    const s = sql("walk", guard({ q: 0, r: 0 }));
    expect(s).toContain(
      "done AS ( INSERT INTO yuplink.rate_hits (key, at) SELECT 'stepop:op1', ARRAY[now()] FROM pos ON CONFLICT (key) DO NOTHING RETURNING 1 )",
    );
    expect(sql("walk")).not.toContain("rate_hits");
  });

  it("строки ещё нет — вставка; есть, но не на клетке «откуда» — ноль строк", () => {
    const s = flat(casPos(ACC, 33, 64, { q: 32, r: 64 }, "map_1"));
    expect(s).toContain("INSERT INTO yuplink.beta_raid_positions AS p");
    expect(s).toContain(
      "WHERE p.q = 32 AND p.r = 64 AND (p.map_id IS NULL OR p.map_id = EXCLUDED.map_id) RETURNING",
    );
    expect(s).not.toContain("DO NOTHING");
  });

  it("цена не число — ноль, а не сломанный SQL", () => {
    const g: StepGuard = { from: { q: 0, r: 0 }, wallet: "w", cost: Number.NaN, op: "op2" };
    const s = flat(stepSql({ acc: ACC, mapId: "m", q: 1, r: 0, mode: "walk", guard: g }));
    expect(s).toContain("touch_energy_atomic('w', 0::numeric)");
  });

  it("без сторожа — прежний upsert и никакой платы", () => {
    const s = sql("walk");
    expect(s).toContain("ON CONFLICT (account_id) DO UPDATE SET q = EXCLUDED.q");
    expect(s).not.toContain("touch_energy_atomic");
    expect(s).not.toContain("AS energy");
  });
});

describe("карта позиции (этажи, 07.10.2026)", () => {
  it("каждая запись позиции несёт карту шага — пустой она больше не остаётся", () => {
    for (const mode of ["walk", "ashore", "sail"] as const) {
      for (const g of [undefined, guard({ q: 0, r: 0 })]) {
        const s = sql(mode, g);
        expect(s).toContain("(account_id, q, r, updated_at, map_id)");
        expect(s).toContain("map_id = EXCLUDED.map_id");
        expect(s).toMatch(/now\(\), 'map_1'\)?/);
      }
    }
  });

  it("строка уже на другой карте (портал увёл) — шаг по прежней не применяется", () => {
    for (const g of [undefined, guard({ q: 0, r: 0 })]) {
      expect(sql("walk", g)).toContain("(p.map_id IS NULL OR p.map_id = EXCLUDED.map_id)");
    }
  });
});

describe("сход на берег", () => {
  it("борт отпускаем, только если сход записался", () => {
    const s = sql("ashore", guard({ q: 0, r: 0 }));
    expect(s).toContain("WITH pos AS (INSERT INTO yuplink.beta_raid_positions AS p");
    expect(s).toContain("WHERE p.q = 0 AND p.r = 0");
    expect(s).toContain("WHERE crew_account = 'acc_me' AND EXISTS (SELECT 1 FROM pos)");
    expect(s).toContain("touch_energy_atomic('w.near', 0.5::numeric)");
  });

  it("без сторожа — как было: борт отпускается, позиция upsert", () => {
    const s = sql("ashore");
    expect(s).toContain("WHERE crew_account = 'acc_me' RETURNING id");
    expect(s).toContain("ON CONFLICT (account_id) DO UPDATE");
  });
});

describe("плавание", () => {
  it("судно едет только со своей клетки, позиция — следом за судном", () => {
    const s = sql("sail", guard({ q: 0, r: 0 }));
    expect(s).toContain("RETURNING id), pos AS (INSERT INTO yuplink.beta_raid_positions");
    expect(s).toContain(") AND q = 0 AND r = 0 RETURNING id)");
    expect(s).toContain("FROM sh ON CONFLICT (account_id) DO UPDATE");
    expect(s).toContain("FROM pos CROSS JOIN LATERAL yuplink.touch_energy_atomic");
  });

  it("без сторожа — без условия на клетку судна", () => {
    const s = sql("sail");
    expect(s).not.toContain("AND q = 0 AND r = 0");
    expect(s).not.toContain("touch_energy_atomic");
  });
});
