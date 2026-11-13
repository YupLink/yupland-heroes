// Пакетная проверка «можно улучшить» — те же ответы, что у кнопки «Улучшить».
import { describe, expect, it } from "vitest";
import { upgradeReadiness, type ReadinessRow } from "./chips-upgrade-ready";
import { planUpgrade, toPlanPool } from "./chips-upgrade-plan";

const NOW = Date.parse("2026-10-09T12:00:00Z");
let n = 0;
const chip = (level: number, template = "t1", extra: Partial<ReadinessRow> = {}): ReadinessRow => ({
  id: `uci_${String(++n).padStart(4, "0")}`,
  level,
  template_id: template,
  collection_id: "c1",
  serial_no: n,
  status: "owned",
  rest_until: null,
  obtained_at: `2026-10-0${1 + (n % 8)}T00:00:00Z`,
  ...extra,
});

describe("upgradeReadiness", () => {
  it("причины: маркет, университет, отдых, максимум", () => {
    const rows = [
      chip(1, "t1", { status: "listed" }),
      chip(1, "t1", { status: "staked" }),
      chip(1, "t1", { rest_until: "2026-10-09T13:00:00Z" }),
      chip(5),
    ];
    const r = upgradeReadiness(rows, 10_000, 1, NOW).chips;
    expect(r[rows[0].id]).toEqual({ can: false, reason: { kind: "listed" } });
    expect(r[rows[1].id]).toEqual({ can: false, reason: { kind: "studying" } });
    expect(r[rows[2].id]).toEqual({
      can: false,
      reason: { kind: "resting", until: "2026-10-09T13:00:00Z" },
    });
    expect(r[rows[3].id]).toEqual({ can: false, reason: { kind: "max" } });
  });

  it("1★ + такая же 1★ → можно за 9 золота; чужого вида — нельзя, нужен тот же вид", () => {
    const pair = [chip(1, "a"), chip(1, "a")];
    const ok = upgradeReadiness(pair, 100, 1, NOW).chips[pair[0].id];
    expect(ok).toEqual({ can: true, gold: 9, burn: 1 });
    const mixed = [chip(1, "a"), chip(1, "b")];
    expect(upgradeReadiness(mixed, 100, 1, NOW).chips[mixed[0].id]).toEqual({
      can: false,
      reason: { kind: "same_type", level: 1 },
    });
  });

  it("не хватает золота — причина с ценой и балансом", () => {
    const pair = [chip(1, "a"), chip(1, "a")];
    expect(upgradeReadiness(pair, 5, 1, NOW).chips[pair[0].id]).toEqual({
      can: false,
      reason: { kind: "gold", need: 9, have: 5 },
    });
  });

  it("цена по курсу: множитель 0,5 (курс 400) — вдвое дешевле, вверх до целого", () => {
    const pair = [chip(1, "a"), chip(1, "a")];
    expect(upgradeReadiness(pair, 5, 0.5, NOW).chips[pair[0].id]).toEqual({
      can: true,
      gold: 5,
      burn: 1,
    });
    expect(upgradeReadiness(pair, 4, 0.5, NOW).chips[pair[0].id]).toEqual({
      can: false,
      reason: { kind: "gold", need: 5, have: 4 },
    });
  });

  it("отдыхающая фишка в жертвы не идёт", () => {
    const rows = [chip(1, "a"), chip(1, "a", { rest_until: "2026-10-09T13:00:00Z" })];
    expect(upgradeReadiness(rows, 100, 1, NOW).chips[rows[0].id]).toMatchObject({ can: false });
  });

  it("автоподбор: 2★ собирается из 1★ — как у планировщика по одной фишке", () => {
    const rows = [chip(2, "a"), ...Array.from({ length: 6 }, () => chip(1, "a")), chip(1.5, "b")];
    const all = upgradeReadiness(rows, 1000, 1, NOW).chips;
    for (const r of rows.filter((x) => Number(x.level) < 5)) {
      const pool = toPlanPool(rows, r.id, NOW);
      const p = planUpgrade(
        { id: r.id, level: Number(r.level), template: r.template_id },
        pool,
        1000,
        1,
      );
      expect(all[r.id].can, r.id).toBe(p.feasible);
      if (all[r.id].can)
        expect(all[r.id]).toMatchObject({ gold: p.totalGold, burn: p.burnChips.length });
    }
    expect(all[rows[0].id]).toMatchObject({ can: true });
  });

  it("мало фишек — сколько каких не хватает", () => {
    const rows = [chip(3, "a")];
    const s = upgradeReadiness(rows, 10_000, 1, NOW).chips[rows[0].id];
    expect(s.can).toBe(false);
    if (!s.can) expect(s.reason.kind).toBe("same_type");
    const lone = [chip(1.5, "a")];
    const l = upgradeReadiness(lone, 10_000, 1, NOW).chips[lone[0].id];
    expect(l).toEqual({
      can: false,
      reason: { kind: "chips", shortfall: [{ level: 1, count: 4 }] },
    });
  });
});
