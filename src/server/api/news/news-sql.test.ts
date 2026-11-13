import { describe, expect, it } from "vitest";
import {
  adminCte,
  highlightsSql,
  leadersSql,
  heroesSql,
  totalsSql,
  windowSql,
  windowStart,
} from "./news-sql";

const NONE = { wallets: [], tgIds: [] };

describe("news-sql", () => {
  it("adminCte: пустые списки — пустая таблица, иначе аккаунты по TG и кошелькам", () => {
    expect(adminCte(NONE)).toBe("adm(id) AS (SELECT NULL::text WHERE false)");
    const sql = adminCte({ wallets: ["o'k.near"], tgIds: [42, -1] });
    expect(sql).toContain("a.telegram_id IN (42)");
    expect(sql).toContain("u.wallet IN ('o''k.near')");
    expect(sql).toContain(" UNION ");
  });

  it("windowStart: полночь UTC, «1 день» — сегодня, «7» — шесть дней до", () => {
    const now = Date.parse("2026-10-29T18:30:00Z");
    expect(windowStart(1, now)).toBe("2026-10-29T00:00:00.000Z");
    expect(windowStart(7, now)).toBe("2026-10-23T00:00:00.000Z");
  });

  it("цифры: окно и исключение админов во всех источниках", () => {
    const sql = totalsSql("2026-10-23T00:00:00.000Z", null, NONE);
    expect(sql).toContain("d.day >= '2026-10-23T00:00:00.000Z'::date");
    for (const col of [
      "d.account_id",
      "r.account_id",
      "x.id",
      "x.account_id",
      "x.new_account",
      "l.account_id",
    ])
      expect(sql).toContain(`adm.id = ${col}`);
    // Каждый подсчёт по журналу — со своим исключением админов.
    expect(sql.match(/FROM yuplink\.\w+ x\s+WHERE[^)]*adm\.id = x\./g)?.length).toBe(6);
    expect(sql).toContain("d.reason = 'step'");
    expect(sql).toContain("d.reason = 'decor'");
    expect(sql).toContain("yuplink.beta_raid_object_run");
    expect(sql).toContain("x.kind = 'capture'");
    expect(sql).not.toContain("'build'");
    expect(sql).not.toContain("'fight'");
    expect(sql).toContain("l.token = 'Darai'");
  });

  it("лидеры: все доски и лимит на доску", () => {
    const sql = leadersSql("2026-10-23T00:00:00.000Z", null, NONE, 10);
    for (const b of ["steps", "fights", "gathered", "mines", "energy", "darai"])
      expect(sql).toContain(`'${b}'`);
    expect(sql).not.toContain("'built'");
    expect(sql).toContain("FROM yuplink.beta_raid_object_run x");
    expect(sql).toContain(
      "x.kind = 'capture' AND NOT EXISTS (SELECT 1 FROM adm WHERE adm.id = x.new_account)",
    );
    expect(sql).toContain("r.resource IN ('gold', 'diamonds', 'wood', 'stone')");
    expect(sql).toContain("rn <= 10");
  });

  it("закрытое окно выпуска: конец не входит, у дня — по дате", () => {
    expect(windowSql("x.at", "2026-10-29T00:00:00.000Z", null)).toBe(
      "x.at >= '2026-10-29T00:00:00.000Z'",
    );
    expect(
      windowSql("d.day", "2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z", "::date"),
    ).toBe(
      "d.day >= '2026-10-29T00:00:00.000Z'::date AND d.day < '2026-10-30T00:00:00.000Z'::date",
    );
    const sql = totalsSql("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z", NONE);
    expect(sql).toContain("x.created_at < '2026-10-30T00:00:00.000Z'");
    expect(sql).toContain("count(DISTINCT d.account_id) AS active");
    expect(sql).not.toContain("last_seen_at");
    expect(leadersSql("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z", NONE, 3)).toContain(
      "x.seized_at < '2026-10-30T00:00:00.000Z'",
    );
  });

  it("герои: последний выбранный герой каждого аккаунта — имя и лицо", () => {
    const sql = heroesSql(["acc_1", "o'k"]);
    expect(sql).toContain("t.name, t.image_url AS image");
    expect(sql).toContain("h.account_id IN ('acc_1', 'o''k')");
    expect(sql).toContain("DISTINCT ON (h.account_id)");
    expect(sql).toContain("ORDER BY h.account_id, h.selected_at DESC NULLS LAST");
  });

  it("события окна: монстр по боям (без админов) и самый срубленный декор", () => {
    const sql = highlightsSql("2026-10-29T00:00:00.000Z", "2026-10-30T00:00:00.000Z", NONE);
    expect(sql).toContain("JOIN yuplink.raid_boss_template b ON b.id = x.object_id");
    expect(sql).toContain("adm.id = x.account_id");
    expect(sql).toContain("JOIN yuplink.mystic_item_template t ON t.id = x.decor_id");
    expect(sql).toContain("x.created_at < '2026-10-30T00:00:00.000Z'");
    expect(sql.match(/LIMIT 1/g)).toHaveLength(2);
  });
});
