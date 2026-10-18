// SQL очков турнира: очко с ключом-доказательством засчитывается один раз, счёт
// растёт только на вставленное, окна журналов перекрываются, источники верные.
import { describe, expect, it } from "vitest";
import { farmSql, incomeWhere, noteSql, noteTimedSql, oneRow, scoreSql, syncSql } from "./tour-sql";
import { expiredTourDaraiSql } from "./tour-expire";
import { claimSql, givenSql, placesSql, baseRef } from "./tour-finish-sql";

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("очки и счёт одним оператором", () => {
  const sql = flat(scoreSql({ src: "SELECT 1" }));

  it("очко — ON CONFLICT DO NOTHING, счёт — только из RETURNING вставки", () => {
    expect(sql).toContain("INSERT INTO yuplink.tournament_point");
    expect(sql).toContain("ON CONFLICT (tournament_id, ref) DO NOTHING");
    expect(sql).toContain("RETURNING tournament_id, account_id, qty, at");
    // Счёт берётся из ins (вставленное этим оператором), не из src.
    expect(sql).toMatch(/agg AS \( SELECT .* FROM ins GROUP BY/);
    expect(sql).toContain("SET score = s.score + EXCLUDED.score");
    expect(sql).toContain("last_at = GREATEST(s.last_at, EXCLUDED.last_at)");
  });

  it("изменяющие CTE не завёрнуты снаружи: итог отдаёт сам SELECT", () => {
    expect(sql.startsWith("WITH ")).toBe(true);
    expect(sql).toMatch(
      /SELECT row_to_json\(_t\.\*\) AS _row FROM \(SELECT \(SELECT count\(\*\) FROM ins\)::int AS points\) _t;$/,
    );
  });
});

describe("учёт только записавшимся и с момента записи (04.10.2026)", () => {
  // Неоплаченная запись (paid=false: плата ещё идёт или сорвалась) очков не даёт.
  const FILTER =
    "JOIN yuplink.tournament_entry e ON e.tournament_id = src.tournament_id " +
    "AND e.account_id = src.account_id AND e.paid AND src.at >= e.joined_at";

  it("фильтр стоит во вставке очков: незаписанный и событие до записи не проходят", () => {
    const sql = flat(scoreSql({ src: "SELECT 1" }));
    // Внутри ins: строка src без записи (или раньше joined_at) не вставится —
    // а счёт растёт только из вставленного (RETURNING), значит и места нет.
    expect(sql).toMatch(
      /ins AS \( INSERT INTO yuplink\.tournament_point .* FROM src JOIN yuplink\.tournament_entry e .* WHERE src\.qty > 0 ON CONFLICT/,
    );
    expect(sql).toContain(FILTER);
  });

  it("одно место для всех путей: живые хуки, журналы, фарм, прибыль с продаж", async () => {
    const { profitSql } = await import("./tour-profit");
    const all = [
      noteSql({ metric: "steps", account: "a", qty: 1, ref: "r" }),
      syncSql("t", "damage") ?? "",
      syncSql("t", "wood") ?? "",
      farmSql("t", 1),
      profitSql("t", 1, [{ id: "1", account: "a", at: 0, profit: 5 }]),
    ];
    for (const s of all) expect(flat(s)).toContain(FILTER);
  });
});

describe("живое очко", () => {
  it("во все идущие турниры категории, только внутри [старт, конец)", () => {
    const sql = flat(noteSql({ metric: "steps", account: "acc_1", qty: 1, ref: "step:acc_1:x" }));
    expect(sql).toContain("t.status = 'running' AND t.metric = 'steps'");
    expect(sql).toContain("t.started_at <= now() AND t.ends_at > now()");
    expect(sql).toContain("'step:acc_1:x' AS ref, 'acc_1' AS account_id");
  });

  it("кавычки в ключе не ломают SQL", () => {
    expect(noteSql({ metric: "chop", account: "a'b", qty: 1, ref: "r'1" })).toContain("'a''b'");
  });

  it("улов по времени поимок: в зачёт только поимки внутри турнира и после записи", () => {
    const sql = flat(
      noteTimedSql({ metric: "fish_catch", account: "acc_1", ref: "fish:k", times: [1000, 2000] }),
    );
    expect(sql).toContain("VALUES (to_timestamp(1000 / 1000.0)), (to_timestamp(2000 / 1000.0))");
    expect(sql).toContain("v.at >= t.started_at AND v.at < t.ends_at AND v.at >= e.joined_at");
    expect(sql).toContain("count(*)::numeric AS qty, max(v.at) AS at");
    expect(sql).toContain("e.paid AND src.at >= e.joined_at");
  });
});

describe("подтяжка журналов", () => {
  it("урон — удары по всем боссам (и с удалённым шаблоном), с перекрытием окна", () => {
    const sql = flat(syncSql("tour_1", "damage") ?? "");
    // Какие удары — боссы, проверяет tour-sql-combat.test.
    expect(sql).toContain("FROM yuplink.raid_boss_template bt");
    expect(sql).toContain("~ '^rbt_'");
    expect(sql).toContain("o.rounds > 0 AND o.damage > 0");
    expect(sql).toContain("'run:' || o.id AS ref");
    expect(sql).toContain("o.damage::numeric AS qty");
    expect(sql).toContain("COALESCE(t.synced_at, t.started_at) - interval '2 minutes'");
    expect(sql).toContain("LEAST(now(), t.ends_at) AS till");
    expect(sql).toContain("SET synced_at = w.till");
  });

  it("убийства — последний удар, по 1", () => {
    const sql = flat(syncSql("tour_1", "boss_kills") ?? "");
    expect(sql).toContain("1::numeric AS qty");
    expect(sql).toContain("o.rounds > 0 AND o.killed");
  });

  it("ресурсы — доход по видам добычи, без мистических паков", () => {
    const sql = flat(syncSql("tour_1", "wood") ?? "");
    expect(sql).toContain("l.resource = 'wood'");
    expect(sql).toContain("l.kind IN ('mob', 'reward', 'mine', 'field')");
    expect(sql).toContain("left(l.ref, 7) <> 'mystic:'");
    expect(sql).toContain("'res:' || l.id AS ref");
    expect(incomeWhere("x")).toContain("x.delta > 0");
  });

  it("живые категории и фарм журнала не имеют", () => {
    expect(syncSql("tour_1", "steps")).toBeNull();
    expect(syncSql("tour_1", "chop")).toBeNull();
    expect(syncSql("tour_1", "farm")).toBeNull();
  });

  it("снимок фарма: шахты с постройкой на клетке, один раз на номер", () => {
    const sql = flat(farmSql("tour_1", 3));
    expect(sql).toContain("'farm:3:' || m.owner_account AS ref");
    expect(sql).toContain("c.building_id IS NOT NULL");
    expect(sql).toContain("t.snapshots < 3");
    expect(sql).toContain("SET snapshots = GREATEST(snapshots, 3)");
  });
});

describe("финиш и сгоревшие призы", () => {
  it("захват — только у идущего, конец не позже «сейчас»", () => {
    const sql = flat(claimSql("tour_1"));
    expect(sql).toContain(
      "status = 'paying', finished_at = now(), ends_at = LEAST(ends_at, now())",
    );
    expect(sql).toContain("AND status = 'running'");
  });

  it("места пишутся один раз целиком; место — по очкам, равные на одном месте", () => {
    const sql = flat(placesSql("tour_1"));
    expect(sql).toContain("SELECT tournament_id, rank() OVER (ORDER BY score DESC), account_id");
    expect(sql).toContain("NOT EXISTS (SELECT 1 FROM yuplink.tournament_place p");
    expect(sql).toContain("score > 0");
    // Без ON CONFLICT: гонка двух финишей — ошибка ключа, а не тихий пропуск.
    expect(sql).not.toContain("ON CONFLICT");
  });

  it("выданные подарки ищутся с хвостом сгоревшего", () => {
    expect(flat(givenSql("tour_1"))).toContain("left(source_ref, 12) = 'tour:tour_1:'");
    expect(baseRef("tour:t:1:0:x:gft_9")).toBe("tour:t:1:0");
    expect(baseRef("tour:t:1:0")).toBe("tour:t:1:0");
  });

  it("сгоревший приз DARAI — в пул по ключу подарка, повтор не возвращает дважды", () => {
    const sql = flat(expiredTourDaraiSql());
    expect(sql).toContain("'map_release', g.amount, 'tour-x:' || g.id");
    expect(sql).toContain("g.status = 'expired'");
    expect(sql).toContain("left(g.source_ref, 5) = 'tour:'");
    expect(sql).toContain("g.kind = 'token' AND g.ref_id = 'Darai'");
    expect(sql).toContain("ON CONFLICT (ref) DO NOTHING");
  });
});

describe("разбор ответа", () => {
  it("и сырая строка, и _row (объект или JSON-строка)", () => {
    expect(oneRow<{ a: number }>([{ a: 1 }])?.a).toBe(1);
    expect(oneRow<{ a: number }>([{ _row: { a: 2 } }])?.a).toBe(2);
    expect(oneRow<{ a: number }>([{ _row: '{"a":3}' }])?.a).toBe(3);
    expect(oneRow([])).toBeUndefined();
    expect(oneRow(null)).toBeUndefined();
  });
});
