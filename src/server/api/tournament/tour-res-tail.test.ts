// Финиш «Дерева» и «Камня»: часы шахт и «Добыча», добытые в турнире, но не
// собранные к концу, ложатся очками до подведения мест — один раз и без
// задвоения со сбором после конца.
import { beforeEach, describe, expect, it, vi } from "vitest";

const log = vi.hoisted(() => ({ sql: [] as string[], metric: "wood" }));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    log.sql.push(sql);
    // Захват выплаты удался; остальное — пусто (места, подарки, «проверка»).
    return sql.includes("SET status = 'paying'") ? [{ id: "t1" }] : [];
  },
}));
vi.mock("./tour-sync", () => ({
  loadTourWork: async (id: string) => ({ id, metric: log.metric }),
  syncTournament: async () => {
    log.sql.push("-- подтяжка");
  },
}));
vi.mock("./tour-note", () => ({ dropTourCache: () => {} }));
vi.mock("../gifts-create", () => ({ createGifts: async () => [] }));
vi.mock("../darai-pools-move", () => ({ insertPoolMove: async () => ({ inserted: false }) }));

const { resTailSql, settleResourceTail } = await import("./tour-res-tail");
const { finishTournament } = await import("./tour-finish");

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

beforeEach(() => {
  log.sql = [];
  log.metric = "wood";
});

describe("хвост на финише", () => {
  const sql = flat(resTailSql("tour_1", "wood"));

  it("только турнир на выплате, чей конец наступил", () => {
    expect(sql).toContain("t.id = 'tour_1' AND t.status = 'paying'");
    expect(sql).toContain("AND t.ends_at <= now()");
  });

  it("шахты: живые у участника и отбитые уже после конца (их cap в журнале)", () => {
    expect(sql).toContain(
      "s.owner_account = pe.account_id AND COALESCE(s.accrue_from, s.captured_at) < pe.ends_at",
    );
    expect(sql).toContain("l.kind = 'mine' AND l.created_at >= pe.ends_at");
    // Строка после конца — первая строка отрезка с уровнем (хвост часа не
    // разбирается) и только если живой шахты с этим отрезком нет: собранная
    // после конца на A и перенесённая на B не ляжет дважды.
    expect(sql).toContain(
      "(SELECT DISTINCT ON (mr.map, mr.ep, l.account_id) 1, mr.map, mr.q::int, mr.r::int",
    );
    expect(sql).toContain("CROSS JOIN LATERAL (SELECT x.m[1] AS map");
    expect(sql).toContain(
      "WHERE NOT EXISTS (SELECT 1 FROM lv WHERE lv.map = mr.map AND lv.ep = mr.ep AND lv.acc = l.account_id) ORDER BY mr.map, mr.ep, l.account_id, l.created_at)",
    );
    expect(sql).not.toContain("<> 'tail'");
  });

  it("живые шахты одного игрока с одной эпохой — каждая своя: клетки соседок вне поиска", () => {
    expect(sql).toContain(
      "ARRAY(SELECT o.q || ':' || o.r FROM lv o WHERE o.map = lv.map AND o.ep = lv.ep AND o.acc = lv.acc AND (o.q, o.r) <> (lv.q, lv.r)) AS sib",
    );
    expect(sql).toContain("<> ALL (pa.sib)");
  });

  it("нижняя граница — последний сбор отрезка на любой клетке; часы — от порога до конца", () => {
    expect(sql).toContain("p.created_at < pe.ends_at");
    // Перенос режимом бога туда и обратно: собранное на другой клетке второй
    // раз не ляжет — клетки в поиске границы нет.
    const pl = sql.slice(sql.indexOf("LEFT JOIN LATERAL (SELECT"), sql.indexOf(") pl ON true"));
    expect(pl).toContain("split_part(p.ref, ':', 5) = (pa.ep)::text");
    expect(pl).not.toContain("split_part(p.ref, ':', 3) = (pa.q)::text");
    expect(sql).toContain(
      "GREATEST(1, ceil((extract(epoch from GREATEST(pe.thr, pv.lat)) - pa.ep) / 3600.0 - pv.pn))",
    );
    expect(sql).toContain(
      "LEAST(CASE WHEN pv.is_v2 THEN pa.n - pv.pn END, floor((extract(epoch from LEAST(pe.ends_at, CASE WHEN pv.is_v2 THEN pa.brk END)) - pa.ep) / 3600.0 - pv.pn)) AS hi",
    );
    expect(sql).toContain("h.cnt * y.yld AS qty");
    expect(sql).toContain("c.building_config->>'resource' = 'wood'");
  });

  it("поиск сбора — один на шахту: pv, y и h за забором", () => {
    expect(sql).toMatch(/ORDER BY p\.created_at DESC LIMIT 1\) pl ON true/);
    expect(sql).toContain("SELECT COALESCE(pl.pn, 0) AS pn, pl.lat,");
    expect(sql).toMatch(/OFFSET 0 \) pv/);
    expect(sql).toMatch(/OFFSET 0 \) y/);
    expect(sql).toMatch(/OFFSET 0\) h/);
  });

  it("шахты v2 (§8.59): эпоха — начало отрезка, выход — стандарт × режим, часы — до поломки", () => {
    expect(sql).toContain(
      "extract(epoch from COALESCE(s.accrue_from, s.captured_at))::bigint AS ep",
    );
    expect(sql).toContain(
      "CASE WHEN s.accrue_from IS NOT NULL THEN yuplink.raid_mine_break_at(s.mode, s.life_left, s.life_at) END AS brk",
    );
    expect(sql).toContain(
      "(pa.pri = 1 OR pa.brk IS NOT NULL) AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL AS is_v2",
    );
    expect(sql).toContain(
      "WHEN pa.pri = 0 THEN yuplink.raid_mine_v2_std(c.building_config) * pa.mult",
    );
    // Отрезок, закрытый после конца: выход — delta первой строки на её часы.
    expect(sql).toContain(
      "WHEN pa.n > pv.pn THEN round(pa.delta / (pa.n - LEAST(pv.pn, COALESCE((SELECT",
    );
  });

  it("выход отрезка после конца — от уровня своей клетки, если он ниже: соседка его не раздует", () => {
    // Сбор соседки с той же эпохой (закрыта до конца, вне поиска) — граница
    // часов, но не делитель выхода: иначе delta с часами до порога легла бы
    // на один час. Поиск по своей клетке — только в этой ветке.
    const y = sql.slice(sql.indexOf("WHEN pa.n > pv.pn"), sql.indexOf("END AS yld"));
    expect(y).toContain(
      "split_part(p.ref, ':', 3) = (pa.q)::text AND split_part(p.ref, ':', 4) = (pa.r)::text",
    );
    expect(y).toContain("p.created_at < pe.ends_at");
    expect(y).toContain("ORDER BY p.created_at DESC LIMIT 1), 0))), 4)");
    expect(sql.split("= (pa.q)::text")).toHaveLength(2);
  });

  it("«Добыча»: добытое в [порог, конец) без начисления до конца", () => {
    expect(sql).toContain("rr.reward_kind = 'resource' AND rr.pack_id = 'wood'");
    expect(sql).toContain("rr.created_at >= pe.thr AND rr.created_at < pe.ends_at");
    expect(sql).toContain(
      "l.kind IN ('mine', 'mob', 'reward') AND l.created_at < pe.ends_at AND l.ref = 'raidtour:' || rr.location_id || ':c' || rr.cycle_no || ':' || rr.id",
    );
  });

  it("ключи постоянные — повтор финиша не засчитает дважды; фильтр записи — общий", () => {
    expect(sql).toContain(
      "'minetail:' || pa.map || ':' || pa.q || ':' || pa.r || ':' || pa.ep || ':' || pa.acc AS ref",
    );
    // Шахту перенесли между прогонами — у отрезка minetail уже есть на другой
    // клетке, второй не ляжет.
    expect(sql).toContain("done AS MATERIALIZED (");
    expect(sql).toContain(
      // и прежний формат ключа (без клетки, до выката 20.10) тоже узнаётся
      "CROSS JOIN LATERAL regexp_match(t.ref, '^minetail:([^:]+):(?:-?[0-9]+:-?[0-9]+:)?([0-9]+):(.+)$') m WHERE left(t.ref, 9) = 'minetail:'",
    );
    expect(sql).toContain(
      "AND NOT EXISTS (SELECT 1 FROM done d WHERE d.map = pa.map AND d.ep = pa.ep::text AND d.acc = pa.acc)",
    );
    expect(sql).toContain("'loot:' || rr.id AS ref");
    expect(sql).toContain("ON CONFLICT (tournament_id, ref) DO NOTHING");
    expect(sql).toContain("AND e.paid AND src.at >= e.joined_at");
  });

  it("кривая выработка в настройке постройки не роняет оператор", () => {
    expect(sql).toContain(
      "CASE WHEN c.building_config->>'yield' ~ '^[0-9]+([.][0-9]+)?$' THEN (c.building_config->>'yield')::numeric END",
    );
  });
});

describe("кому нужен хвост", () => {
  it("дерево и камень — да, остальные категории — нет", async () => {
    await settleResourceTail({ id: "t", metric: "stone" });
    expect(log.sql).toHaveLength(1);
    expect(log.sql[0]).toContain("rr.pack_id = 'stone'");
    for (const metric of ["gold", "damage", "chop", "farm"] as const) {
      await settleResourceTail({ id: "t", metric });
    }
    expect(log.sql).toHaveLength(1);
  });

  it("финиш: подтяжка → хвост → места", async () => {
    await finishTournament("t1");
    const at = (needle: string) => log.sql.findIndex((s) => s.includes(needle));
    expect(at("-- подтяжка")).toBeGreaterThan(at("SET status = 'paying'"));
    expect(at("'minetail:'")).toBeGreaterThan(at("-- подтяжка"));
    expect(at("INSERT INTO yuplink.tournament_place")).toBeGreaterThan(at("'minetail:'"));
  });

  it("финиш не ресурсной категории хвост не трогает", async () => {
    log.metric = "damage";
    await finishTournament("t1");
    expect(log.sql.some((s) => s.includes("'minetail:'"))).toBe(false);
  });
});
