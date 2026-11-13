// «Дерево» и «Камень»: в очки идёт только добытое внутри турнира. Шахта — по
// часам выработки (не по моменту «Собрать»), «Добыча» — по моменту добычи,
// несобранное к концу досчитывается на финише и не задваивается со сбором.
// Арифметика часов сверена на проде (только SELECT): подтяжка + хвост на
// воображаемом конце = все часы, отработанные к этому концу, до единицы.
import { describe, expect, it } from "vitest";
import { syncSql } from "@/server/api/tournament/tour-sql";
import {
  MINE_REF_RE,
  mineHoursSql,
  mineLastSql,
  minePrevSql,
  resSrcSql,
} from "@/server/api/tournament/tour-res-sql";

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("ref сбора шахты", () => {
  const re = new RegExp(MINE_REF_RE);
  it("карта, клетка, эпоха отрезка и уровень часов — и у сбора, и у хвоста при захвате", () => {
    expect(re.exec("mine:rmap_UthOURxc:51:105:1789632309:427")?.slice(1)).toEqual([
      "rmap_UthOURxc",
      "51",
      "105",
      "1789632309",
      "427",
    ]);
    expect(re.exec("mine:rmap_UthOURxc:-48:123:1789193799:cap550")?.slice(1)).toEqual([
      "rmap_UthOURxc",
      "-48",
      "123",
      "1789193799",
      "550",
    ]);
    // Старые дробные уровни (сентябрь) тоже разбираются.
    expect(re.exec("mine:m:49:36:1788502315:32.7524858055555556")?.[5]).toBe("32.7524858055555556");
  });

  it("«Добыча», хвост поломки и прочее — не уровень часов шахты", () => {
    expect(re.test("raidtour:rmap_UthOURxc:c0:rr_KKvPzDGGPgTd")).toBe(false);
    expect(re.test("mine:m:1:2:abc:5")).toBe(false);
    expect(re.test("mine:m:1:2:1789632309:tail")).toBe(false);
  });
});

describe("подтяжка ресурса", () => {
  const sql = flat(syncSql("tour_1", "wood") ?? "");

  it("окно отдаёт старт и конец турнира — от них порог и граница часов", () => {
    expect(sql).toContain("SELECT t.id, t.started_at, t.ends_at,");
  });

  it("порог игрока — старт или запись, что позже; только оплатившие", () => {
    expect(sql).toContain(
      "JOIN yuplink.tournament_entry e ON e.tournament_id = w.id AND e.account_id = l.account_id AND e.paid",
    );
    expect(sql).toContain("GREATEST(w.started_at, e.joined_at)");
  });

  it("«Добыча»: момент — когда добыто, добытое до порога не засчитывается", () => {
    expect(sql).toContain(
      "LEFT JOIN yuplink.raid_reward rr ON left(l.ref, 9) = 'raidtour:' AND rr.id = split_part(l.ref, ':', 4)",
    );
    expect(sql).toContain(
      "(rr.id IS NULL OR rr.created_at >= GREATEST(w.started_at, e.joined_at))",
    );
    expect(sql).toContain("ELSE COALESCE(rr.created_at, l.created_at) END AS at");
  });

  it("шахта: доля часов внутри [порог, конец] от delta строки сбора", () => {
    expect(sql).toContain(
      "WHEN (mr.n - mp.pn) > 0 THEN round(l.delta * mh.cnt / (mr.n - mp.pn), 4)",
    );
    // Не шахта — вся строка, как раньше.
    expect(sql).toContain("CASE WHEN mr.ep IS NULL THEN l.delta");
    // Момент очка — когда «капнул» последний засчитанный час (не позже сбора).
    expect(sql).toContain("LEAST(l.created_at, to_timestamp(mr.ep + (mp.pn + mh.hi) * 3600))");
  });

  it("прошлый сбор — той же шахты: карта, клетка и эпоха, не раньше начала отрезка", () => {
    expect(sql).toContain("split_part(p.ref, ':', 2) = mr.map");
    expect(sql).toContain("split_part(p.ref, ':', 5) = (mr.ep)::text");
    // Шахты одного игрока с одной эпохой не затеняют друг друга.
    expect(sql).toContain(
      "split_part(p.ref, ':', 3) = (mr.q)::text AND split_part(p.ref, ':', 4) = (mr.r)::text",
    );
    expect(sql).toContain(
      "p.created_at < l.created_at AND p.created_at >= to_timestamp(mr.ep - 1)",
    );
    expect(sql).toContain("ORDER BY p.created_at DESC LIMIT 1), 0)");
    expect(sql).toContain(
      "substring(split_part(p.ref, ':', 6) from '^(?:cap)?([0-9]+(?:[.][0-9]+)?)$')::numeric",
    );
    // Разбор ref — за забором (OFFSET 0): regexp_match не уходит в фильтр
    // каждой строки журнала.
    expect(sql).toContain("WHERE x.m IS NOT NULL OFFSET 0");
  });

  it("окно журнала — по моменту строки; виды дохода и пропуск паков — прежние", () => {
    expect(sql).toContain("l.created_at >= w.since AND l.created_at < w.till");
    expect(sql).toContain("l.kind IN ('mob', 'reward', 'mine', 'field')");
    expect(sql).toContain("left(l.ref, 7) <> 'mystic:'");
    expect(sql).toContain("SET synced_at = w.till");
  });

  it("ресурс подставлен с экранированием", () => {
    expect(resSrcSql("st'one", "true")).toContain("l.resource = 'st''one'");
  });
});

describe("часы шахты", () => {
  it("час j после уровня pn капает в ep + (pn + j) ч: от потолка порога до пола конца", () => {
    const h = flat(mineHoursSql({ ep: "E", pn: "P", thr: "T", ends: "Z", top: "H" }));
    expect(h).toContain("GREATEST(0, j.hi - j.lo + 1) AS cnt");
    expect(h).toContain("GREATEST(1, ceil((extract(epoch from T) - E) / 3600.0 - P)) AS lo");
    expect(h).toContain("LEAST(H, floor((extract(epoch from Z) - E) / 3600.0 - P)) AS hi");
  });

  it("без верхней границы строки — хвост к концу турнира", () => {
    const h = flat(mineHoursSql({ ep: "E", pn: "P", thr: "T", ends: "Z" }));
    expect(h).toContain("floor((extract(epoch from Z) - E) / 3600.0 - P) AS hi");
    expect(h).not.toContain("LEAST(");
  });

  it("прошлый уровень без сборов — 0", () => {
    expect(flat(minePrevSql({ acc: "A", map: "M", q: "Q", r: "R", ep: "E", before: "B" }))).toMatch(
      /^COALESCE\(.*, 0\)$/,
    );
  });

  it("последний сбор отрезка — на любой клетке, кроме живых соседок, с уровнем и моментом", () => {
    const at = flat(mineLastSql({ acc: "A", map: "M", ep: "E", before: "B", skip: "S" }));
    expect(at).toMatch(
      /^SELECT substring\(split_part\(p\.ref, ':', 6\) from '.*'\)::numeric AS pn, p\.created_at AS lat FROM yuplink\.res_ledger p/,
    );
    expect(at).toContain("split_part(p.ref, ':', 5) = (E)::text");
    // Клетки нет — перенос режимом бога (туда и обратно) не пересчитает часы.
    expect(at).not.toContain("split_part(p.ref, ':', 3) = ");
    // Хвост часа — не сбор; клетки живых соседок с той же эпохой — вне поиска.
    expect(at).toContain(
      "AND CASE WHEN substring(split_part(p.ref, ':', 6) from '^(?:cap)?([0-9]+(?:[.][0-9]+)?)$') IS NULL THEN false WHEN cardinality(S) = 0 THEN true ELSE split_part(p.ref, ':', 3) || ':' || split_part(p.ref, ':', 4) <> ALL (S) END",
    );
    // Один поиск на шахту: LIMIT — забор от подстановки в каждое упоминание.
    expect(at).toMatch(/ORDER BY p\.created_at DESC LIMIT 1$/);
  });
});

describe("хвост часа (…:tail): поломка, смена режима, починка своей, перевод", () => {
  const sql = flat(syncSql("tour_1", "wood") ?? "");

  it("доход один раз в момент записи — не уровень часов", () => {
    const re = new RegExp(MINE_REF_RE);
    expect(re.test("mine:rmap_UthOURxc:51:105:1789632309:tail")).toBe(false);
    // ref не разобрался — вся delta строки (доли часа), момент — строки.
    expect(sql).toContain("CASE WHEN mr.ep IS NULL THEN l.delta");
    expect(sql).toContain("ELSE COALESCE(rr.created_at, l.created_at) END AS at");
    expect(sql).toContain("SELECT w.id AS tournament_id, 'res:' || l.id AS ref");
    expect(sql).toContain("l.kind IN ('mob', 'reward', 'mine', 'field')");
  });

  it("уровень прошлого сбора по хвосту — NULL, то есть 0, а не чужая доля", () => {
    const prev = flat(minePrevSql({ acc: "A", map: "M", q: "Q", r: "R", ep: "E", before: "B" }));
    expect(prev).toContain(
      "COALESCE((SELECT substring(split_part(p.ref, ':', 6) from '^(?:cap)?([0-9]+(?:[.][0-9]+)?)$')::numeric",
    );
  });
});
