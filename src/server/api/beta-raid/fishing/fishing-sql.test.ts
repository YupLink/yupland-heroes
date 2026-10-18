// Текст SQL рыбалки (§8.35): поимка — один оператор под локом героя (CAS по
// счётчику попыток, гард удочки в руках, износ — каждая попытка, с рыбой и без),
// старт — под локом аккаунта и
// только на проверенной клетке, конец и «видели» — только своей идущей рыбалки.
//
// Арифметика k ударов (timesCtes) сверена с моделью hitStackTimes на живом
// Postgres только SELECT-ами по VALUES, без таблиц: 2304 сочетания (износ 1…100,
// штуки 0…7 с дробью, износ текущей 0…99, k 1…120) — 2304 совпадения
// (04.10.2026). Берег (shoreSql) прогнан SELECT-ом на боевой карте: клетка суши у
// воды — да, суша вдали — нет, вода — нет.
import { describe, expect, it } from "vitest";
import { effectiveMain, pickMain, type ToolStack } from "@/lib/raid/mainTool";
import { catchSql, timesCtes } from "./fishing-catch-sql";
import { actedSql, closeSql, readSql, shoreSql, startSql, touchSql } from "./fishing-sql";
import { mainOkSql } from "../main-tool/main-tool-sql";
import { fx, packOf, resetFx, rodOkModel } from "./fishing.fake";

const at = {
  heroId: "h1",
  rodKey: "custom:cst_rod",
  account: "acc1",
  sid: "op1",
  tries: 4,
  k: 3,
  /** Рыба — во 2-й и 3-й из трёх попыток. */
  succ: [2, 3],
  step: 25,
  intervalMin: 10,
  nonce: "n1",
  seenMs: 1_700_000_000_123,
};

describe("поимка", () => {
  const sql = catchSql(at);
  it("лок героя отдельным оператором, первым — тот же, что у удара и выдачи в рюкзак", () => {
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l;")).toBe(true);
  });

  it("захват — CAS по счётчику попыток идущей рыбалки этого нажатия, и в выборке, и в записи", () => {
    const cas = "f.account_id = 'acc1' AND f.op = 'op1' AND f.tries = 4 AND f.stopped_at IS NULL";
    expect(sql.split(cas)).toHaveLength(3);
    expect(sql).toContain("claim = 'n1'");
    expect(sql).toContain("SET tries = f.tries + d.done, caught = f.caught + d.hits");
    expect(sql).toContain("next_at = f.next_at + (d.done * 10) * interval '1 minute'");
  });

  it("попытки: отыграно столько, сколько выдержала удочка; рыба — те из них, что с шансом", () => {
    expect(sql).toContain(
      "(SELECT count(*) FROM unnest(ARRAY[2, 3]::int[]) x WHERE x <= h.done)::int AS hits",
    );
    expect(sql).toContain("FROM (SELECT COALESCE((SELECT hits FROM upd), 0)::int AS done) h");
    expect(sql).toContain("AND d.done > 0");
    // Без рыбы удочка всё равно изнашивается: условия «есть рыба» у стопки нет.
    const empty = catchSql({ ...at, succ: [] });
    expect(empty).toContain("unnest(ARRAY[]::int[])");
    expect(empty).toContain("LEAST(3, x.first");
    expect(empty).not.toContain("0 > 0");
  });

  it("бьёт только удочка в руках: гард основного в выборке стопки, стопка — FOR UPDATE", () => {
    const src = sql.slice(sql.indexOf("src AS ("), sql.indexOf("rc1 AS ("));
    expect(src).toContain(mainOkSql("h1", "custom:cst_rod", "rod"));
    expect(src).toContain("FOR UPDATE");
    expect(sql).toContain(
      "adopt AS (UPDATE yuplink.hero_instance hi SET main_tool = 'custom:cst_rod'",
    );
  });

  it("износ — удар за каждую попытку: потолок — их число, штука ломается целиком", () => {
    expect(sql).toContain("LEAST(3, x.first");
    expect(sql).toContain("CEIL((100 - x.wear) / (25)::numeric)");
    expect(sql).toContain("wear = CASE WHEN c.count - c.broken >= 1 THEN c.rest ELSE 0 END");
    expect(sql).toContain("mob_count = LEAST(c.mob_count, c.count - c.broken)");
    expect(timesCtes("v", "x.step", "x.k", "4")).toContain(
      "LEAST(x.k, x.first + (x.whole - 1) * (4))",
    );
  });

  it("герой не на месте — «видели» не двигаем", () => {
    expect(catchSql({ ...at, seenMs: null })).toContain("seen_at = GREATEST(f.seen_at, NULL)");
  });
});

describe("старт, чтение, «видели», конец, другое действие", () => {
  it("старт: лок аккаунта; только на проверенной клетке; идущую и повтор не трогает", () => {
    const sql = startSql({
      account: "acc1",
      op: "op1",
      heroId: "h1",
      mapId: "m",
      q: 2,
      r: -1,
      intervalMin: 10,
      planTries: 45,
    });
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('fish:acc1')) AS l;")).toBe(true);
    // Заказ заброса едет в строку: сорок пять попыток — сорок пять минут.
    expect(sql).toContain("45,");
    expect(sql).toContain("p.account_id = 'acc1' AND p.q = 2 AND p.r = -1");
    expect(sql).toContain(
      "WHERE NOT EXISTS (SELECT 1 FROM cur WHERE cur.op = 'op1' OR cur.stopped_at IS NULL)",
    );
    expect(sql).toContain("WHERE f.stopped_at IS NOT NULL");
    expect(sql).toContain("now() + 10 * interval '1 minute'");
  });

  it("старт: соль зерна — новая на каждый заброс; ключ, которым уже ловил, не берётся", () => {
    const sql = startSql({
      account: "acc_1-x",
      op: "op_1",
      heroId: "h1",
      mapId: "m",
      q: 0,
      r: 0,
      intervalMin: 1,
      planTries: 60,
    });
    expect(sql).toContain("now(), gen_random_uuid()::text\n        FROM pos");
    expect(sql).toContain("seed_salt = EXCLUDED.seed_salt");
    // Ключ выдачи улова этого op у этого аккаунта — сравнение префикса, без LIKE
    // (в ключах бывает «_», а он у LIKE — любой символ).
    const used =
      "EXISTS (SELECT 1 FROM yuplink.trade_journal j\n" +
      "                   WHERE j.account_id = 'acc_1-x' AND j.source = 'fish'\n" +
      "                     AND left(j.ref, 18) = 'fish:acc_1-x:op_1:')";
    expect(sql).toContain(`AND NOT ${used}`);
    expect(sql).toContain(`${used} AS used`);
    expect(sql).not.toContain("LIKE");
  });

  it("старт: ступени шанса по срокам баффов удачи — jsonb; нет ступеней — NULL (14.10)", () => {
    const base = { account: "a", op: "op_1", heroId: "h1", mapId: "m", q: 0, r: 0 };
    const o = { ...base, intervalMin: 1, planTries: 60, chancePct: 17 };
    const sql = startSql({ ...o, chanceSteps: [{ at: 1_700_000_240_000.7, pct: 15.004 }] });
    expect(sql).toContain(
      `60,\n             17,\n             '[{"at":1700000240000,"pct":15}]'::jsonb,`,
    );
    expect(sql).toContain("plan_tries, chance_pct, chance_steps, seen_at");
    expect(sql).toContain("chance_steps = EXCLUDED.chance_steps");
    expect(startSql({ ...o, chanceSteps: [] })).toContain(
      "17,\n             NULL,\n             now()",
    );
    expect(startSql(o)).toContain("17,\n             NULL,\n             now()");
    expect(readSql("acc1")).toContain('f.chance_steps AS "chanceSteps"');
  });

  it("чтение: версия позиции, выбранный герой и времена базы в мс", () => {
    const sql = readSql("acc1");
    expect(sql).toContain("p.updated_at IS NOT DISTINCT FROM f.pos_at");
    expect(sql).toContain("h.id = f.hero_id AND h.selected_at IS NOT NULL");
    expect(sql).toContain('(extract(epoch FROM now()) * 1000)::float8 AS "nowMs"');
    expect(sql).toContain("f.seed_salt AS salt");
  });

  it("«видели» и конец — только идущей рыбалки этого нажатия; конец не позже «сейчас»", () => {
    expect(touchSql("acc1", "op1", 5)).toContain(
      "op = 'op1'\n      AND stopped_at IS NULL AND acted_at IS NULL",
    );
    const close = closeSql("acc1", "op1", "moved", 5000);
    expect(close).toContain("LEAST(now(), to_timestamp(5000 / 1000.0))");
    expect(close).toContain("stop_reason = 'moved'");
    expect(close).toContain("AND stopped_at IS NULL");
  });

  it("другое действие: первый миг и версия позиции, только у идущей", () => {
    const sql = actedSql("acc1");
    expect(sql).toContain("acted_at = now()");
    expect(sql).toContain("SELECT p.updated_at FROM yuplink.beta_raid_positions p");
    expect(sql).toContain("f.stopped_at IS NULL AND f.acted_at IS NULL");
  });

  it("берег: своя клетка — суша, соседи — шесть клеток вокруг", () => {
    const sql = shoreSql({ mapId: "m", q: 3, r: -2 });
    expect(sql).toContain("(w.q, w.r) IN ((4, -2), (4, -3), (3, -3), (2, -2), (2, -1), (3, -1))");
    expect(sql).toContain("c.map_id = 'm' AND c.q = 3 AND c.r = -2");
  });
});

describe("гард удочки не строже правила (§8.24)", () => {
  it("правило велит ловить стопкой — гард её пропускает", () => {
    const KEYS = ["custom:cst_axe", "custom:cst_sh1", "custom:cst_rod1", "custom:cst_rod2"];
    let checked = 0;
    for (const stored of [null, ...KEYS, "custom:cst_gone"])
      for (let mask = 0; mask < 16; mask++) {
        resetFx();
        fx.catalog.set("cst_sh1", { name: "s", shovel: true });
        fx.catalog.set("cst_rod1", { name: "r1", rod: true });
        fx.catalog.set("cst_rod2", { name: "r2", rod: true });
        fx.main.set("h1", stored);
        KEYS.forEach((k, i) => packOf("h1").set(k, { count: (mask >> i) & 1, wear: 0 }));
        const stacks: ToolStack[] = KEYS.map((k, i) => ({
          stackKey: k,
          count: (mask >> i) & 1,
          shovel: k.endsWith("sh1"),
          rod: k.includes("rod"),
          durability: 100,
        }));
        const flags = { shovel: !!stored?.endsWith("sh1"), rod: !!stored?.includes("rod") };
        const pick = pickMain(effectiveMain({ key: stored, ...flags }, stacks), stacks, {
          kind: "rod",
        });
        if (!pick.ok) continue;
        checked++;
        expect(rodOkModel("h1", pick.key), `${stored}/${mask}`).toBe(true);
      }
    expect(checked).toBeGreaterThan(20);
  });
});
