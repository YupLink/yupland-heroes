// Кандидаты режима стройки (§8.59 п. 8): один запрос признаков на весь круг —
// те же столбцы, что у оператора постановки, — и вердикт тем же cellVerdict.
// Проход не проверяем (владелец, 22.10.2026: «если шахта преградит путь — то и
// пусть»): клетка в узком коридоре — зелёная.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { candidatesSql, candidateVerdicts, type CandidateRow } from "./mine-plan-candidates";
import { placeMineSql } from "./mine-place-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const at = { mapId: "m", q: 4, r: -2, account: "acc_1" };
const wood = flat(candidatesSql({ ...at, kind: "wood" }));
const gold = flat(candidatesSql({ ...at, kind: "gold" }));

describe("SQL кандидатов", () => {
  it("круг радиуса 2 по индексу клетки; признаки — по строке клетки c", () => {
    expect(wood).toContain(
      "WHERE c.map_id = 'm' AND c.q BETWEEN 2 AND 6 AND c.r BETWEEN -4 AND 0 " +
        "AND abs((c.q + c.r) - 2) <= 2",
    );
    expect(wood).toContain(
      "(f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship) AS busy",
    );
    expect(wood).toContain("CROSS JOIN LATERAL (SELECT f.decor, f.ship) ex");
    expect(wood).toContain(
      "raid_magic_chest mc WHERE mc.map_id = c.map_id AND mc.q = c.q AND mc.r = c.r",
    );
    expect(wood).toContain(
      "raid_loot_bag lb WHERE lb.map_id = c.map_id AND lb.q = c.q AND lb.r = c.r",
    );
    expect(wood).toContain("AND p.account_id <> 'acc_1') AS player");
    expect(wood).not.toMatch(/LIMIT 1/);
  });

  it("те же столбцы клетки, что у постановки (без расхождения правил)", () => {
    const place = flat(
      placeMineSql({
        ...at,
        wallet: "w",
        heroId: "h",
        stackKey: "s",
        kind: "wood",
        op: "o",
        energy: 10,
      }),
    );
    const cols = (x: string) => x.replace(/c\.map_id = 'm' AND (\w+)\.q = 4/g, "");
    for (const piece of [
      "NULLIF(btrim(COALESCE(c.road_id, '')), '') IS NOT NULL AS road",
      "(c.group_id IS NOT NULL OR c.object_id IS NOT NULL OR c.decoration_id IS NOT NULL) AS taken",
      "COALESCE(c.void_fog, false) AS dome",
      "g.killed_at IS NULL AND g.current_hp > 0) AS guard",
    ]) {
      expect(cols(wood), piece).toContain(piece);
      expect(cols(place), piece).toContain(piece);
    }
  });

  it("лесопилке — природа вокруг той же функцией; золоту — жила своего вида", () => {
    expect(wood).toContain(
      "LEFT JOIN LATERAL yuplink.raid_nature_around(c.map_id, c.q, c.r) na ON true",
    );
    expect(wood).toContain("na.trees AS trees, na.mountains AS mountains, NULL::boolean AS vein");
    expect(gold).toContain(
      "EXISTS (SELECT 1 FROM yuplink.raid_map_vein v WHERE v.map_id = c.map_id AND v.q = c.q " +
        "AND v.r = c.r AND v.kind = 'gold') AS vein",
    );
    expect(gold).not.toContain("raid_nature_around");
  });
});

describe("вердикт кандидатов", () => {
  const center = { q: 0, r: 0 };
  const row = (q: number, r: number, over: Partial<CandidateRow> = {}): CandidateRow => ({
    q,
    r,
    busy: false,
    road: false,
    taken: false,
    bag: false,
    player: false,
    trees: 3,
    mountains: 0,
    vein: null,
    ...over,
  });

  it("19 клеток; нет строки — нет клетки на карте; правила — как у постановки", () => {
    const rows = [
      row(0, 0),
      row(1, 0, { road: true }),
      row(0, 1, { trees: "2" }),
      row(-1, 1, { bag: true }),
      row(-1, 0, { player: true }),
      row(0, -1, { busy: true }),
      row(2, 0),
    ];
    const out = candidateVerdicts(center, "wood", rows);
    expect(out).toHaveLength(19);
    const by = (q: number, r: number) => out.find((c) => c.q === q && c.r === r);
    expect(by(0, 0)).toEqual({ q: 0, r: 0, ok: true, reason: null });
    expect(by(1, 0)?.reason).toBe("mineplace.road");
    expect(by(0, 1)?.reason).toBe('mineplace.need_trees|{"n":2,"need":3}');
    expect(by(-1, 1)?.reason).toBe("mineplace.busy");
    expect(by(-1, 0)?.reason).toBe("mineplace.player");
    expect(by(0, -1)?.reason).toBe("mineplace.busy");
    expect(by(1, -1)?.reason).toBe("mineplace.busy"); // строки нет
    expect(by(2, 0)?.ok).toBe(true);
  });

  it("жила: без жилы — отказ своим текстом", () => {
    const rows = [row(0, 0, { vein: true, trees: null }), row(1, 0, { vein: false, trees: null })];
    const out = candidateVerdicts(center, "diamonds", rows);
    expect(out[0].ok).toBe(true);
    expect(out.find((c) => c.q === 1 && c.r === 0)?.reason).toBe("mineplace.need_vein_diamonds");
  });

  it("коридор: шахта в нём перекроет проход — всё равно зелёная (проход не проверяем)", () => {
    const out = candidateVerdicts(center, "wood", [row(0, 0), row(1, 0)]);
    expect(out[0]).toEqual({ q: 0, r: 0, ok: true, reason: null });
    expect(out.some((c) => c.reason === "mineplace.blocks_path")).toBe(false);
  });
});
