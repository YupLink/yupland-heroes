// Текст SQL «Посадить дерево» и разбор ответа: локи до чтения; клетка — как у
// шахт, но кучке (бугорку) можно, стоящему сундуку и мешочку на земле — нет;
// шаблон ещё раз сверяется; энергия — тем же оператором и только вместе с
// деревом; минус штука из стопки; рассылка — строкой decor-respawn; ключ
// нажатия; все записи — только если дерево встало.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { plantTreeSql, treePlantVerdict } from "./tree-plant-sql";
import { TREE_HELD } from "./tree-cell-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const lock = (k: string) => `SELECT pg_advisory_xact_lock(hashtext('${k}')) AS l;`;
const sql = flat(
  plantTreeSql({
    mapId: "m",
    q: 4,
    r: -2,
    account: "acc_1",
    wallet: "w1.tg",
    heroId: "h1",
    decorId: "decoration_oak",
    op: "tplant:acc_1:o",
    cost: 15,
  }),
);

describe("SQL «Посадить дерево»", () => {
  it("локи карты, рюкзака, возврата декора, клетки, мешочков и шахты — до WITH", () => {
    expect(
      sql.startsWith(
        `${lock("godmove:m")} ${lock("bp:h1")} ${lock("decor-respawn")} ` +
          `${lock("chestcell:m:4:-2")} ${lock("lootdrop:m:4:-2")} ${lock("mine:m:4:-2")} WITH prior`,
      ),
    ).toBe(true);
  });

  it("клетка: всё, что держит шахту, кроме бугорков; стоящий сундук и мешочек на земле — держат", () => {
    expect(sql).toContain(
      `SELECT 1 FROM tf, tpl, item WHERE NOT EXISTS (SELECT 1 FROM prior) AND NOT ${TREE_HELD}`,
    );
    expect(TREE_HELD).not.toMatch(/tf\.chest\b/);
    expect(TREE_HELD).not.toMatch(/tf\.bag\b/);
    for (const f of [
      "building",
      "obj",
      "water",
      "dome",
      "guard",
      "decor",
      "ship",
      "road",
      "taken",
      "player",
      "stand_chest",
      "ground_bag",
    ]) {
      expect(TREE_HELD, f).toContain(`tf.${f}`);
    }
    expect(sql).toContain(
      "raid_magic_chest sm WHERE sm.map_id = 'm' AND sm.q = 4 AND sm.r = -2 AND sm.buried_at IS NULL",
    );
    expect(sql).toContain(
      "raid_plain_chest sp WHERE sp.map_id = 'm' AND sp.q = 4 AND sp.r = -2 AND sp.buried_at IS NULL",
    );
    expect(sql).toContain(
      "raid_loot_bag gb WHERE gb.map_id = 'm' AND gb.q = 4 AND gb.r = -2 AND gb.buried_at IS NULL AND",
    );
    // Дорога, блок/объект/декор, игрок — те же столбцы, что у шахт.
    expect(sql).toContain("NULLIF(btrim(COALESCE(c.road_id, '')), '') IS NOT NULL AS road");
    expect(sql).toContain(
      "(c.group_id IS NOT NULL OR c.object_id IS NOT NULL OR c.decoration_id IS NOT NULL) AS taken",
    );
    expect(sql).toContain("p.account_id <> 'acc_1') AS player");
    // Проход, природа и жила не проверяются.
    expect(sql).not.toContain("raid_nature_around");
    expect(sql).not.toContain("raid_map_vein");
  });

  it("шаблон — срубаемое дерево; стопка — tree:<шаблон> героя", () => {
    expect(sql).toContain("WHERE d.id = 'decoration_oak' AND (d.kind = 'decoration'");
    expect(sql).toContain(
      "lower(btrim(COALESCE(d.meta->'interact'->'label'->>'ru', ''))) = 'срубить'",
    );
    expect(sql).toContain(
      "b.hero_id = 'h1' AND b.stack_key = 'tree:decoration_oak' AND b.count >= 1 FOR UPDATE",
    );
  });

  it("дерево встаёт декором с меткой «посадил игрок» на пустую клетку (CAS), энергия 15 — только вместе с ним", () => {
    expect(sql).toContain(
      "SET decoration_id = tpl.id, planted_decor = tpl.id, saved_at = now() FROM go, tpl WHERE c.map_id = 'm' AND c.q = 4 AND c.r = -2 AND c.decoration_id IS NULL AND c.building_id IS NULL AND c.object_id IS NULL",
    );
    expect(sql).toContain(
      "paid AS ( SELECT 1 FROM setc CROSS JOIN LATERAL yuplink.touch_energy_atomic('w1.tg', 15::numeric) e )",
    );
    // paid обязан читаться итогом — иначе CTE без записи не выполнится и энергия не спишется.
    expect(sql).toContain("(SELECT count(*) FROM paid)::int * 15 AS paid");
  });

  it("минус штука из стопки; последняя — строки нет", () => {
    expect(sql).toContain(
      "SET count = b.count - 1, updated_at = now() FROM item, setc WHERE b.id = item.id AND item.count > 1",
    );
    expect(sql).toContain(
      "DELETE FROM yuplink.raid_hero_backpack b USING item, setc WHERE b.id = item.id AND item.count <= 1",
    );
  });

  it("рассылка — строкой decor-respawn «встал, не разослан»; ждавший декор — в under_decor", () => {
    expect(sql).toContain("INSERT INTO yuplink.raid_decor_respawn AS x");
    expect(sql).toContain(
      "SET under_decor = CASE WHEN x.placed_at IS NULL THEN x.decor_id ELSE x.under_decor END",
    );
    expect(sql).toContain(
      "now(), s.terrain_id, s.road_id, s.building_id, s.object_id, s.group_id, now(), now() FROM setc s",
    );
    expect(sql).toContain("placed_at = EXCLUDED.placed_at");
  });

  it("ключ нажатия и версия правок — только вместе с деревом", () => {
    expect(sql).toContain(
      "INSERT INTO yuplink.raid_tree_plant_op (op, account_id, map_id, q, r, decor_id, paid) SELECT 'tplant:acc_1:o', 'acc_1', 'm', 4, -2, s.decoration_id, 15 FROM setc s",
    );
    expect(sql).toContain(
      "SET edit_seq = COALESCE(mp.edit_seq, 0) + 1 FROM setc WHERE mp.id = 'm'",
    );
    expect(sql).toContain("EXISTS (SELECT 1 FROM prior) AS was");
  });
});

describe("разбор ответа посадки", () => {
  const ok = { was: false, placed: false, cell: true, kind: true, box: true, flags: {} };

  it("встало или повтор — ok", () => {
    expect(treePlantVerdict({ ...ok, placed: true })).toBe("ok");
    expect(treePlantVerdict({ ...ok, was: true })).toBe("ok");
  });

  it("нет клетки, нет дерева в рюкзаке, шаблон больше не дерево", () => {
    expect(treePlantVerdict(null)).toBe("tree.busy");
    expect(treePlantVerdict({ ...ok, cell: false })).toBe("tree.busy");
    expect(treePlantVerdict({ ...ok, box: false })).toBe("tree.no_item");
    expect(treePlantVerdict({ ...ok, kind: false })).toBe("tree.gone_kind");
  });

  it("клетка — вердиктом признаков", () => {
    expect(treePlantVerdict({ ...ok, flags: { road: true } })).toBe("tree.road");
    expect(treePlantVerdict({ ...ok, flags: { building: true } })).toBe("tree.busy");
    expect(treePlantVerdict({ ...ok, flags: { ground_bag: true } })).toBe("tree.bag");
  });
});

describe("SQL «Поставить камень» (rock, 25.10.2026)", () => {
  const rockSql = flat(
    plantTreeSql({
      mapId: "m",
      q: 4,
      r: -2,
      account: "acc_1",
      wallet: "w1.tg",
      heroId: "h1",
      decorId: "decoration_stone",
      kind: "rock",
      op: "tplant:acc_1:o",
      cost: 15,
    }),
  );

  it("шаблон — под кирку, стопка — rock:<шаблон>", () => {
    expect(rockSql).toContain("ci.name ~* '(кирк|pick)'");
    expect(rockSql).not.toContain("= 'срубить'");
    expect(rockSql).toContain("b.stack_key = 'rock:decoration_stone'");
  });

  it("метка «поставил игрок» та же — добытый камень не отрастает", () => {
    expect(rockSql).toContain("planted_decor = tpl.id");
  });

  it("дерево по умолчанию — прежние срубаемое и tree:<шаблон>", () => {
    expect(sql).toContain("= 'срубить'");
    expect(sql).toContain("b.stack_key = 'tree:decoration_oak'");
  });
});
