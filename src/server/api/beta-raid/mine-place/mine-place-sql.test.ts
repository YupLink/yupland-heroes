// Текст SQL постановки шахты и разбор её ответа (§8.59.8): локи до чтения,
// правила клетки тем же оператором, что пишет, все записи — только если
// постройка встала, и понятный отказ игроку.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { placeMineSql } from "./mine-place-sql";
import { placeOpSql, placeOpSweepSql, placeSentSql, placeUnsentSql } from "./mine-place-op-sql";
import { placeVerdict } from "./mine-place-verdict";
import type { PlaceMineRow } from "./mine-place-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const lock = (k: string) => `SELECT pg_advisory_xact_lock(hashtext('${k}')) AS l;`;
const at = {
  mapId: "m",
  q: 4,
  r: -2,
  account: "acc_1",
  wallet: "w1.tg",
  heroId: "h1",
  stackKey: "custom:cst_mine_bp_wood",
  op: "mplace:acc_1:o",
  energy: 10,
};
const wood = flat(placeMineSql({ ...at, kind: "wood" }));
const stone = flat(placeMineSql({ ...at, kind: "stone" }));
const gold = flat(placeMineSql({ ...at, kind: "gold", stackKey: "custom:cst_mine_bp_gold" }));
const diam = flat(placeMineSql({ ...at, kind: "diamonds" }));

describe("SQL постановки", () => {
  it("локи карты, рюкзака, возврата декора, клетки, мешочков и шахты — до WITH", () => {
    expect(
      wood.startsWith(
        `${lock("godmove:m")} ${lock("bp:h1")} ${lock("decor-respawn")} ` +
          `${lock("chestcell:m:4:-2")} ${lock("lootdrop:m:4:-2")} ${lock("mine:m:4:-2")} WITH prior`,
      ),
    ).toBe(true);
  });

  it("живой мешочек (на земле или закопанный) держит клетку, пустой — нет", () => {
    expect(wood).toContain(
      "EXISTS (SELECT 1 FROM yuplink.raid_loot_bag lb WHERE lb.map_id = 'm' AND lb.q = 4 AND lb.r = -2 AND (" +
        "EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x WHERE x.bag_id = lb.id AND x.count > 0 AND x.expires_at > now()) " +
        "OR EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_op o WHERE o.bag_id = lb.id AND o.state = 'taken'))) AS bag",
    );
    expect(wood).not.toMatch(/raid_loot_bag lb WHERE [^)]*buried_at/);
    expect(wood).toContain("AND NOT mc.player AND NOT mc.bag AND ");
    expect(wood).toContain("(SELECT mc.bag FROM mc) AS bag, (SELECT mc.player FROM mc) AS player");
    // Родная клетка моба клетку не держит (§8.49 п.2: моб ждёт).
    expect(wood).not.toContain("raid_mob_spawn");
  });

  it("клетку держит то же, что у сундука, плюс дорога, блок, объект, декор и чужой игрок", () => {
    expect(wood).toContain(
      "NOT (f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship)",
    );
    expect(wood).toContain("NOT mc.road AND NOT mc.taken AND NOT mc.player");
    expect(wood).toContain("NULLIF(btrim(COALESCE(c.road_id, '')), '') IS NOT NULL AS road");
    expect(wood).toContain(
      "(c.group_id IS NOT NULL OR c.object_id IS NOT NULL OR c.decoration_id IS NOT NULL) AS taken",
    );
    expect(wood).toContain("AND p.account_id <> 'acc_1') AS player");
  });

  it("лесопилке — 3 дерева вокруг, каменной — 3 горы; жилы им не нужны", () => {
    expect(wood).toContain("FROM yuplink.raid_nature_around('m', 4, -2) n");
    expect(wood).toContain("AND na.trees >= 3");
    expect(stone).toContain("AND na.mountains >= 3");
    expect(wood).toContain("SELECT 1 FROM f, ex, mc, na, box WHERE");
    // Проход не проверяем: ни отпечатка шахт рядом, ни «нажми ещё раз» из-за соседей.
    expect(wood).not.toContain("AS same");
    expect(wood).toContain("false AS moved");
    expect(wood).toContain("NULL::boolean AS vein");
    // Дерево и камень не зависят от таблицы жил (она может ещё не стоять).
    expect(wood + stone).not.toContain("raid_map_vein");
  });

  it("золотой и алмазной — жила своего вида под клеткой, природа не считается", () => {
    expect(gold).toContain(
      "vn AS ( SELECT EXISTS (SELECT 1 FROM yuplink.raid_map_vein v " +
        "WHERE v.map_id = 'm' AND v.q = 4 AND v.r = -2 AND v.kind = 'gold') AS here )",
    );
    expect(diam).toContain("AND v.kind = 'diamonds') AS here");
    expect(gold).toContain("SELECT 1 FROM f, ex, mc, vn, box WHERE");
    expect(gold).toContain("AND NOT mc.player AND NOT mc.bag AND vn.here");
    expect(gold).toContain(
      "NULL::int AS trees, NULL::int AS mountains, (SELECT vn.here FROM vn) AS vein",
    );
    expect(gold + diam).not.toContain("raid_nature_around");
    // Остальное — как у дерева: локи до WITH, клетка, место дерева; прохода нет.
    expect(gold).toContain(`${lock("mine:m:4:-2")} WITH prior`);
    expect(gold).toContain("NOT mc.road AND NOT mc.taken AND NOT mc.player");
    expect(gold).not.toContain("AS same");
    expect(gold).toContain("DELETE FROM yuplink.raid_decor_respawn d USING setc");
  });

  it("постройка — шаблон шахты с настройкой, облик снят; только на пустую клетку", () => {
    expect(wood).toContain("SET building_id = 'building_yYIdx793rM'");
    expect(wood).toContain(
      `building_config = '{"resource":"wood","captureCost":10,"yield":10}'::jsonb`,
    );
    expect(stone).toContain("SET building_id = 'building_IbP4EseH2O'");
    expect(gold).toContain("SET building_id = 'building_UbJz0SbcXB'");
    expect(gold).toContain(
      `building_config = '{"resource":"gold","captureCost":10,"yield":1}'::jsonb`,
    );
    expect(diam).toContain("SET building_id = 'building_JTzVEXzUQH'");
    expect(diam).toContain(`'{"resource":"diamonds","captureCost":20,"yield":1}'::jsonb`);
    expect(gold).toContain("b.stack_key = 'custom:cst_mine_bp_gold'");
    expect(diam).toContain("SELECT 'mplace:acc_1:o', 'acc_1', 'm', 4, -2, 'diamonds' FROM setc");
    expect(wood).toContain("building_skin_id = NULL");
    expect(wood).toContain("AND c.building_id IS NULL AND c.decoration_id IS NULL RETURNING c.q");
  });

  it("шахта сразу моя: база, запас 100 %, добыча с этой минуты", () => {
    expect(wood).toContain("'acc_1', 'w1.tg', now(), 0, 'base', 1, now(), now() FROM setc");
    expect(wood).toContain("mode = 'base', life_left = 1, life_at = now(), accrue_from = now()");
  });

  it("заготовка: целая штука под замком, списывается одна — только вместе с постройкой", () => {
    expect(wood).toContain(
      "b.hero_id = 'h1' AND b.stack_key = 'custom:cst_mine_bp_wood' AND b.count >= 1 AND (b.wear = 0 OR b.count >= 2) FOR UPDATE",
    );
    expect(wood).toContain("SET count = b.count - 1");
    expect(wood).toContain("FROM box, setc WHERE b.id = box.id AND b.count - 1 >= 0.001");
    expect(wood).toContain(
      "USING box, setc WHERE b.id = box.id AND b.count - 1 < 0.001 AND b.wear = 0",
    );
  });

  it("дерево на месте шахты больше не вырастает; след прежней шахты снят; карта — правка", () => {
    expect(wood).toContain(
      "DELETE FROM yuplink.raid_decor_respawn d USING setc WHERE d.map_id = 'm' AND d.q = 4 AND d.r = -2",
    );
    expect(wood).toContain("(g.killed_at IS NOT NULL OR g.current_hp <= 0)");
    expect(wood).toContain("DELETE FROM yuplink.beta_raid_building_state s USING setc");
    expect(wood).toContain(
      "SET edit_seq = COALESCE(mp.edit_seq, 0) + 1 FROM setc WHERE mp.id = 'm'",
    );
  });

  it("энергия — тем же оператором и только с шахтой; чертёж клетки стирается", () => {
    expect(wood).toContain(
      "paid AS ( SELECT 1 FROM setc CROSS JOIN LATERAL " +
        "yuplink.touch_energy_atomic('w1.tg', 10::numeric) e WHERE 10 > 0 )",
    );
    expect(wood).toContain("(SELECT count(*) FROM paid)::int AS paid");
    expect(wood).toContain(
      "DELETE FROM yuplink.raid_mine_plan pl USING setc WHERE pl.account_id = 'acc_1' " +
        "AND pl.map_id = 'm' AND pl.q = 4 AND pl.r = -2",
    );
    const free = flat(placeMineSql({ ...at, kind: "wood", energy: 0 }));
    expect(free).toContain("WHERE 0 > 0");
  });

  it("ключ нажатия ложится только с шахтой; повтор видит его", () => {
    expect(wood).toContain("SELECT 1 FROM yuplink.raid_mine_place_op WHERE op = 'mplace:acc_1:o'");
    expect(wood).toContain("SELECT 'mplace:acc_1:o', 'acc_1', 'm', 4, -2, 'wood' FROM setc");
    expect(placeOpSql("x'y")).toContain("WHERE o.op = 'x''y'");
    expect(placeOpSweepSql()).toContain("interval '2 days'");
  });

  it("ключ с клеткой как она есть; досылка — неразосланные старше 30 с, отметка — один раз", () => {
    const op = flat(placeOpSql("k"));
    expect(op).toContain("o.sent_at IS NOT NULL AS sent, c.building_id");
    expect(op).toContain("ON c.map_id = o.map_id AND c.q = o.q AND c.r = o.r");
    const unsent = flat(placeUnsentSql());
    expect(unsent).toContain("WHERE o.sent_at IS NULL AND o.at < now() - interval '30 seconds'");
    expect(unsent).toContain("ORDER BY o.at LIMIT 100;");
    expect(flat(placeSentSql("x'y"))).toContain(
      "SET sent_at = now() WHERE op = 'x''y' AND sent_at IS NULL;",
    );
  });
});

describe("ответ игроку", () => {
  const row = (over: Partial<PlaceMineRow>): Partial<PlaceMineRow> => ({
    was: false,
    placed: false,
    cell: true,
    busy: false,
    road: false,
    taken: false,
    bag: false,
    player: false,
    trees: 3,
    mountains: 3,
    box: true,
    ...over,
  });

  it("встала или повтор того же нажатия — ok", () => {
    expect(placeVerdict(row({ placed: true }), "wood")).toBe("ok");
    expect(placeVerdict({ was: true }, "stone")).toBe("ok");
  });

  it("отказы по порядку: клетки нет, заготовки нет, занято, дорога, игрок", () => {
    expect(placeVerdict(null, "wood")).toBe("mineplace.busy");
    expect(placeVerdict(row({ cell: false }), "wood")).toBe("mineplace.busy");
    expect(placeVerdict(row({ box: false, busy: true }), "wood")).toBe("mineplace.no_blueprint");
    expect(placeVerdict(row({ busy: true, road: true }), "wood")).toBe("mineplace.busy");
    expect(placeVerdict(row({ taken: true }), "wood")).toBe("mineplace.busy");
    expect(placeVerdict(row({ bag: true }), "wood")).toBe("mineplace.busy");
    expect(placeVerdict(row({ bag: true, road: true }), "stone")).toBe("mineplace.busy");
    expect(placeVerdict(row({ road: true, player: true }), "wood")).toBe("mineplace.road");
    expect(placeVerdict(row({ player: true }), "wood")).toBe("mineplace.player");
  });

  it("мало природы — с числами; гонка после всех проверок — занято", () => {
    expect(placeVerdict(row({ trees: "2" }), "wood")).toBe('mineplace.need_trees|{"n":2,"need":3}');
    expect(placeVerdict(row({ mountains: 0 }), "stone")).toBe(
      'mineplace.need_mountains|{"n":0,"need":3}',
    );
    expect(placeVerdict(row({ trees: 0 }), "stone")).toBe("mineplace.busy");
  });

  it("нет жилы своего вида — отказ; природа золоту и алмазам не важна", () => {
    const vein = (over: Partial<PlaceMineRow>) => row({ trees: null, mountains: null, ...over });
    expect(placeVerdict(vein({ vein: false }), "gold")).toBe("mineplace.need_vein_gold");
    expect(placeVerdict(vein({ vein: null }), "diamonds")).toBe("mineplace.need_vein_diamonds");
    expect(placeVerdict(vein({ vein: true }), "gold")).toBe("mineplace.busy");
    expect(placeVerdict(vein({ vein: true, moved: true }), "diamonds")).toBe("mineplace.retry");
    expect(placeVerdict(vein({ vein: true, placed: true }), "gold")).toBe("ok");
    // Занятость и дорога — раньше жилы, как у дерева.
    expect(placeVerdict(vein({ vein: false, taken: true }), "gold")).toBe("mineplace.busy");
    expect(placeVerdict(vein({ vein: false, road: true }), "gold")).toBe("mineplace.road");
    expect(placeVerdict(vein({ vein: false, player: true }), "gold")).toBe("mineplace.player");
  });
});
