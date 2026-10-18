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
  minePrevSql,
  resSrcSql,
} from "@/server/api/tournament/tour-res-sql";

const flat = (s: string) => s.replace(/\s+/g, " ").trim();

describe("ref сбора шахты", () => {
  const re = new RegExp(MINE_REF_RE);
  it("карта, эпоха захвата и уровень часов — и у сбора, и у хвоста при захвате", () => {
    expect(re.exec("mine:rmap_UthOURxc:51:105:1789632309:427")?.slice(1)).toEqual([
      "rmap_UthOURxc",
      "1789632309",
      "427",
    ]);
    expect(re.exec("mine:rmap_UthOURxc:-48:123:1789193799:cap550")?.slice(1)).toEqual([
      "rmap_UthOURxc",
      "1789193799",
      "550",
    ]);
    // Старые дробные уровни (сентябрь) тоже разбираются.
    expect(re.exec("mine:m:49:36:1788502315:32.7524858055555556")?.[3]).toBe("32.7524858055555556");
  });

  it("«Добыча» и прочее — не шахта", () => {
    expect(re.test("raidtour:rmap_UthOURxc:c0:rr_KKvPzDGGPgTd")).toBe(false);
    expect(re.test("mine:m:1:2:abc:5")).toBe(false);
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

  it("прошлый сбор — той же шахты по карте и эпохе, не раньше захвата", () => {
    expect(sql).toContain("split_part(p.ref, ':', 2) = mr.map");
    expect(sql).toContain("split_part(p.ref, ':', 5) = (mr.ep)::text");
    expect(sql).toContain(
      "p.created_at < l.created_at AND p.created_at >= to_timestamp(mr.ep - 1)",
    );
    expect(sql).toContain("ORDER BY p.created_at DESC LIMIT 1), 0)");
    // Не по клетке: перенос в режиме бога двигает шахту с её часами.
    expect(sql).not.toContain("split_part(p.ref, ':', 3)");
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
    expect(flat(minePrevSql({ acc: "A", map: "M", ep: "E", before: "B" }))).toMatch(
      /^COALESCE\(.*, 0\)$/,
    );
  });
});
