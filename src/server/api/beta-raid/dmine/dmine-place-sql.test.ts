// Текст SQL «Посадить» гриб DARAI и разбор ответа: локи до чтения, правила
// клетки — как у постановки шахт v2 (без природы и жилы); гриб — ближайшее
// выпадение среди живых (игрок) или именно этот (обход, late); энергия —
// тем же оператором до постановки; стопка dmine:darai — минус штука; предел
// часов до конца жизни; все записи — только если постройка встала.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { dminePlaceVerdict, placeDmineSql, type DminePlaceRow } from "./dmine-place-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const lock = (k: string) => `SELECT pg_advisory_xact_lock(hashtext('${k}')) AS l;`;
const base = {
  mapId: "m",
  q: 4,
  r: -2,
  account: "acc_1",
  wallet: "w1.tg",
  heroId: "h1",
  op: "dmplace:acc_1:o",
  kind: "darai" as const,
};
const sql = flat(placeDmineSql({ ...base, cost: 5 }));
const auto = flat(
  placeDmineSql({ ...base, wallet: null, dmineId: "dm_7", op: "dmauto:dm_7", late: true, cost: 0 }),
);

describe("SQL «Посадить» гриб", () => {
  it("вид — стопка dmine:<вид> и грибы этого вида", () => {
    const gold = flat(placeDmineSql({ ...base, kind: "gold", cost: 5 }));
    expect(gold).toContain("b.stack_key = 'dmine:gold' AND b.count >= 1");
    expect(gold).toContain("d.mushroom = 'gold'");
    expect(gold).not.toContain("dmine:darai");
  });

  it("локи карты, рюкзака, возврата декора, клетки, мешочков и шахты — до WITH", () => {
    expect(
      sql.startsWith(
        `${lock("godmove:m")} ${lock("bp:h1")} ${lock("decor-respawn")} ` +
          `${lock("chestcell:m:4:-2")} ${lock("lootdrop:m:4:-2")} ${lock("mine:m:4:-2")} WITH prior`,
      ),
    ).toBe(true);
  });

  it("правила клетки как у шахт v2, без природы, жилы и прохода", () => {
    expect(sql).toContain(
      "NOT (f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship)",
    );
    expect(sql).toContain("NOT mc.road AND NOT mc.taken AND NOT mc.player AND NOT mc.bag");
    // Проход не проверяем (владелец: «если шахта преградит путь — то и пусть»).
    expect(sql).not.toContain("AS same");
    expect(sql).toContain("false AS moved");
    expect(sql).toContain("SELECT 1 FROM f, ex, mc, item, dm WHERE");
    expect(sql).not.toContain("raid_nature_around");
    expect(sql).not.toContain("raid_map_vein");
  });

  it("игрок: живой гриб героя с ближайшим выпадением, ещё не просроченный", () => {
    expect(sql).toContain(
      "WHERE d.state = 'item' AND d.hero_id = 'h1' AND d.mushroom = 'darai' AND (d.dies_at IS NULL OR d.dies_at > now()) AND d.taken_at > now() - interval '3600 seconds'",
    );
    expect(sql).toContain(
      "ORDER BY LEAST(d.taken_at + interval '3600 seconds', COALESCE(d.dies_at, 'infinity'::timestamptz)), d.id LIMIT 1 FOR UPDATE",
    );
    // Просроченные — обходу: игроку «встанет сам».
    expect(sql).toContain(
      "(NOT EXISTS (SELECT 1 FROM dm) AND EXISTS (SELECT 1 FROM overdue)) AS expired",
    );
  });

  it("обход сервера: именно этот гриб, и просроченный годен; даром", () => {
    expect(auto).toContain("AND d.id = 'dm_7'");
    expect(auto).not.toContain("d.taken_at > now()");
    expect(auto).not.toContain("touch_energy_atomic");
    expect(auto).toMatch(/SELECT 'm', 4, -2, 'acc_1', NULL, now\(\), 0, 'base'/);
    expect(auto).toContain("'dmauto:dm_7', 'place', 'acc_1', dm.id, 'm', 4, -2, 0 FROM setc, dm");
  });

  it("энергия — тем же оператором и только вместе с грибом: клетку перехватили — ни траты", () => {
    // Как у шахт v2: списание идёт от setc, нехватка роняет весь оператор.
    expect(sql).toContain(
      "paid AS ( SELECT 1 FROM setc CROSS JOIN LATERAL yuplink.touch_energy_atomic('w1.tg', 5::numeric) e )",
    );
    expect(sql).toContain("FROM go, dm WHERE");
    expect(sql.indexOf("setc AS (")).toBeLessThan(sql.indexOf("paid AS ("));
    expect(sql).toContain(
      "'dmplace:acc_1:o', 'place', 'acc_1', dm.id, 'm', 4, -2, 5 FROM setc, dm",
    );
    // Итог читает paid — без этого CTE не исполнился бы и энергия не списалась.
    expect(sql).toContain("(SELECT count(*) FROM paid)::int * 5 AS paid");
  });

  it("стопка dmine:darai — минус штука; последняя — строки нет", () => {
    expect(sql).toContain("b.hero_id = 'h1' AND b.stack_key = 'dmine:darai' AND b.count >= 1");
    expect(sql).toContain(
      "UPDATE yuplink.raid_hero_backpack b SET count = b.count - 1, updated_at = now() FROM item, setc WHERE b.id = item.id AND item.count > 1",
    );
    expect(sql).toContain(
      "DELETE FROM yuplink.raid_hero_backpack b USING item, setc WHERE b.id = item.id AND item.count <= 1",
    );
  });

  it("настройки и облик — прежние; предел часов — целые часы до конца жизни; хозяин — посадивший", () => {
    // Конец жизни клетке — из строки гриба: настройка не потеряет срок.
    expect(sql).toContain(
      "(dm.building_config - 'maxHours') || jsonb_build_object('diesAt', dm.dies_at, 'maxHours', GREATEST(0, floor(extract(epoch FROM (dm.dies_at - now())) / 3600))::int)",
    );
    expect(sql).toContain("building_skin_id = dm.building_skin_id");
    expect(sql).toMatch(
      /SELECT 'm', 4, -2, 'acc_1', 'w1\.tg', now\(\), 0, 'base', 1, now\(\), NULL FROM setc/,
    );
    expect(sql).toContain("accrue_from = NULL");
  });

  it("всё пишется только вместе с постройкой; гриб — «встал»", () => {
    const order = [
      "own",
      "dec",
      "del",
      "tier_set",
      "tier_drop",
      "held",
      "ghost",
      "seq",
      "done",
      "mark",
    ];
    order.forEach((cte, i) => {
      const from = sql.indexOf(`${cte} AS (`);
      const to =
        i + 1 < order.length
          ? sql.indexOf(`${order[i + 1]} AS (`)
          : sql.indexOf("SELECT row_to_json");
      expect(from, cte).toBeGreaterThan(0);
      expect(sql.slice(from, to), cte).toContain("setc");
    });
    expect(sql).toContain("SET state = 'placed', placed_by = 'acc_1', placed_map = 'm'");
    expect(sql).toContain("FROM setc, dm WHERE d.id = dm.id");
  });

  it("ожидание срубленного декора клетки сразу «держит гриб» — таймер с ухода гриба", () => {
    expect(sql).toContain(
      "UPDATE yuplink.raid_decor_respawn d SET held_at = now(), due_at = now() + interval '1 minute' " +
        "FROM setc WHERE d.map_id = 'm' AND d.q = 4 AND d.r = -2 AND d.placed_at IS NULL",
    );
  });

  it("другая карта (этаж, мир) — та, где стоит герой: все записи на ней", () => {
    const other = flat(placeDmineSql({ ...base, mapId: "rmap_6C7t2Vnb", q: 2, r: 3, cost: 5 }));
    expect(other).toContain("'godmove:rmap_6C7t2Vnb'");
    expect(other).toContain("c.map_id = 'rmap_6C7t2Vnb' AND c.q = 2 AND c.r = 3");
    expect(other).toContain("placed_map = 'rmap_6C7t2Vnb'");
  });

  it("тир — прежний: больше нуля — строка тира, ноль — без неё", () => {
    expect(sql).toContain("FROM setc, dm WHERE dm.tier > 0");
    expect(sql).toContain("AND dm.tier <= 0");
  });
});

describe("dminePlaceVerdict", () => {
  const ok: Partial<DminePlaceRow> = { cell: true, dm: true, box: true };
  it("встал или повтор — ok", () => {
    expect(dminePlaceVerdict({ placed: true })).toBe("ok");
    expect(dminePlaceVerdict({ was: true })).toBe("ok");
  });

  it("отказы — по порядку причин", () => {
    expect(dminePlaceVerdict(null)).toBe("mineplace.busy");
    expect(dminePlaceVerdict({ ...ok, cell: false })).toBe("mineplace.busy");
    expect(dminePlaceVerdict({ ...ok, dm: false, box: false })).toBe("dmine.no_item");
    expect(dminePlaceVerdict({ ...ok, dm: false, expired: true })).toBe("dmine.expired");
    expect(dminePlaceVerdict({ ...ok, dm: false })).toBe("dmine.gone");
    expect(dminePlaceVerdict({ ...ok, bag: true })).toBe("mineplace.busy");
    expect(dminePlaceVerdict({ ...ok, road: true })).toBe("mineplace.road");
    expect(dminePlaceVerdict({ ...ok, player: true })).toBe("mineplace.player");
    expect(dminePlaceVerdict({ ...ok, moved: true })).toBe("mineplace.retry");
    expect(dminePlaceVerdict(ok)).toBe("mineplace.busy");
  });
});
