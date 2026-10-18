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
    expect(sql).toContain("s.owner_account = pe.account_id AND s.captured_at < pe.ends_at");
    expect(sql).toContain("l.kind = 'mine' AND l.created_at >= pe.ends_at");
    expect(sql).toContain("SELECT DISTINCT ON (x.map, x.ep, x.acc) x.*");
  });

  it("уровень последнего сбора — по журналу ДО конца, часы — от порога до конца", () => {
    expect(sql).toContain("p.created_at < pe.ends_at");
    expect(sql).toContain(
      "GREATEST(1, ceil((extract(epoch from pe.thr) - pa.ep) / 3600.0 - pv.pn))",
    );
    expect(sql).toContain("floor((extract(epoch from pe.ends_at) - pa.ep) / 3600.0 - pv.pn) AS hi");
    expect(sql).toContain("h.cnt * y.yld AS qty");
    expect(sql).toContain("c.building_config->>'resource' = 'wood'");
  });

  it("«Добыча»: добытое в [порог, конец) без начисления до конца", () => {
    expect(sql).toContain("rr.reward_kind = 'resource' AND rr.pack_id = 'wood'");
    expect(sql).toContain("rr.created_at >= pe.thr AND rr.created_at < pe.ends_at");
    expect(sql).toContain(
      "l.kind IN ('mine', 'mob', 'reward') AND l.created_at < pe.ends_at AND l.ref = 'raidtour:' || rr.location_id || ':c' || rr.cycle_no || ':' || rr.id",
    );
  });

  it("ключи постоянные — повтор финиша не засчитает дважды; фильтр записи — общий", () => {
    expect(sql).toContain("'minetail:' || pa.map || ':' || pa.ep || ':' || pa.acc AS ref");
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
