// Текст SQL обычного сундука и закапывания: локи отдельными операторами до
// чтения, проверка «не закопан» тем же оператором, что пишет, ключи нажатий,
// бугорки в слое мешочков без срока. Смысл — pchest-*.test на фейке базы.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { placePlainSql } from "./pchest-place-sql";
import { putSql, takeSql } from "./pchest-move-sql";
import { pickupWriteSql } from "./pchest-pickup-sql";
import { flipSql } from "./pchest-dig-sql";
import { cellSql, nearSql } from "../loot-bag/bag-read-sql";
import { takeSql as netTakeSql } from "../chest/chest-net-sql";
import { chestGuardSql } from "../chest/chest-place-sql";
import { pickupSnapSql } from "../chest/chest-pickup-sql";
import type { EncounterTarget } from "../encounter-target";

const flat = (s: string) => s.replace(/\s+/g, " ");
const lock = (k: string) => `SELECT pg_advisory_xact_lock(hashtext('${k}')) AS l;`;
const at = { chestId: "pc_1", heroId: "h1", account: "a1", stackKey: "custom:cst_a", qty: 5, op: "pcput:a1:o" };

describe("поставить", () => {
  const sql = flat(
    placePlainSql({
      mapId: "m",
      q: 4,
      r: -2,
      account: "a1",
      heroId: "h1",
      itemId: "cst_box",
      name: "Сундук",
      image: null,
      stackKey: "custom:cst_box",
      op: "pcplace:a1:o",
    }),
  );
  it("локи рюкзака и клетки (общий с магическим) — отдельными операторами до WITH", () => {
    expect(sql.startsWith(`${lock("bp:h1")} ${lock("chestcell:m:4:-2")} WITH prior`)).toBe(true);
  });
  it("клетку держат любой сундук (и бугорок), постройка, объект, вода, купол, охрана, декор, судно", () => {
    expect(sql).toContain("raid_magic_chest mc WHERE mc.map_id = 'm' AND mc.q = 4 AND mc.r = -2");
    expect(sql).toContain("raid_plain_chest pc WHERE pc.map_id = 'm' AND pc.q = 4 AND pc.r = -2");
    expect(sql).toContain("NOT (f.building OR f.obj OR f.water OR f.dome OR f.chest OR f.guard OR ex.decor OR ex.ship)");
    expect(sql).toContain("COALESCE(dk.meta->>'walkable', '') <> 'true'");
  });
  it("целая штука заперта; изношенная остаётся; id и ключ — от нажатия", () => {
    expect(sql).toContain("AND b.count >= 1 AND (b.wear = 0 OR b.count >= 2) FOR UPDATE");
    expect(sql).toContain("b.count - 1 < 0.001 AND b.wear = 0");
    expect(sql).toContain("'pc_' || md5('pcplace:a1:o')");
    expect(sql).toContain("'place', 'done', 1 FROM ins");
  });
});

describe("положить / забрать", () => {
  const put = flat(putSql(at));
  const take = flat(
    takeSql({ ...at, op: "pctake:a1:o", potion: false, capacity: 4, potionCapacity: 1, cap: 30 }),
  );
  const potion = flat(takeSql({ ...at, op: "pctake:a1:p", potion: true, capacity: 4, potionCapacity: 2, cap: 5 }));

  it("локи рюкзака, затем сундука; сундук — стоящий, тем же оператором", () => {
    for (const s of [put, take]) {
      expect(s.startsWith(`${lock("bp:h1")} ${lock("pchest:pc_1")} WITH prior`)).toBe(true);
      expect(s).toContain("FROM yuplink.raid_plain_chest WHERE id = 'pc_1' AND buried_at IS NULL");
    }
  });
  it("положить: 10 ячеек и долив своей, изношенная не уходит, метки — по правилу траты", () => {
    expect(put).toContain("<= (GREATEST(10, net.used) - net.used) AS fits");
    expect(put).toContain("(COALESCE(src.wear, 0) > 0 AND m.mv > src.cnt - 1 + 0.000000001) AS worn");
    expect(put).toContain("WHERE b.id = go.id AND b.count = go.mv AND b.wear = 0");
    expect(put).toContain("mob_count = LEAST(b.mob_count, b.count - go.mv)");
    expect(put).toContain("ON CONFLICT (chest_id, stack_key) DO UPDATE");
    expect(put).not.toContain("raid_plain_chest_slot (chest_id, stack_key, kind, ref_id, item_id, name, image, count, mob");
  });
  it("забрать: место как у выдачи, безымянным, пыль — только если влезает", () => {
    expect(take).toContain("chk.items + chk.d <= GREATEST(4, chk.items)");
    expect(potion).toContain("chk.potions + chk.d <= 2");
    expect(take).toContain("go.mv, 0, 0, 0, 0");
    expect(take).toContain("THEN LEAST(slot.count, 30)");
    expect(take).toContain("'take', 'done', go.mv FROM go, ins");
  });
});

describe("«Забрать сундук»", () => {
  const sql = flat(
    pickupWriteSql({
      chestId: "pc_1",
      heroId: "h1",
      account: "a1",
      op: "pcpick:a1:o",
      expect: { bagFp: "bf", slotFp: "sf" },
      rows: [{ k: "custom:cst_box", kind: "custom", ref: "cst_box", item: "cst_box", name: "С", image: null, qty: 1, loot: 0 }],
      taken: [],
      bagged: [{ k: "custom:cst_a", kind: "custom", ref: "cst_a", item: null, name: "А", image: null, n: 3, loot: 0 }],
    }),
  );
  it("под локами рюкзака и сундука; только по свежему снимку и только стоящий", () => {
    expect(sql.startsWith(`${lock("bp:h1")} ${lock("pchest:pc_1")} WITH prior`)).toBe(true);
    expect(sql).toContain("= 'bf' AND");
    expect(sql).toContain("= 'sf') AS ok");
    expect(sql).toContain("WHERE NOT EXISTS (SELECT 1 FROM prior) AND NOT ch.buried AND fresh.ok");
    expect(sql).toContain("WHERE c.id = 'pc_1' AND c.buried_at IS NULL RETURNING");
  });
  it("остаток — мешочком на клетке: id от сундука, порции на 24 ч без меток", () => {
    expect(sql).toContain("'lb_' || md5('pchest:pc_1')");
    expect(sql).toContain("now(), 'a1', 'chest', d.name, now() FROM del_ch d");
    expect(sql).toContain("now() + interval '24 hours', v.kind, v.ref, v.item, v.name, v.image, v.n, 0, 0, 0, LEAST(v.loot, v.n)");
    expect(sql).toContain('"n":3,"loot":0');
    expect(sql).toContain("'pickup', 'done', jsonb_build_object('taken'");
  });
});

describe("закопать / выкопать", () => {
  const plain = flat(flipSql({ target: { kind: "plain", chestId: "pc_1" }, op: "o1", account: "a1", bury: true, nonce: "n1" }));
  const magic = flat(
    flipSql({ target: { kind: "magic", mapId: "m", q: 1, r: 2, owner: "a9" }, op: "o2", account: "a9", bury: true, nonce: "n2" }),
  );
  const up = flat(flipSql({ target: { kind: "plain", chestId: "pc_1" }, op: "o3", account: "a1", bury: false, nonce: "n3" }));

  it("обычный — под локом сундука; исход — в ключ в обоих случаях", () => {
    expect(plain.startsWith(`${lock("pchest:pc_1")} WITH prior`)).toBe(true);
    expect(plain).toContain("SET buried_at = now(), buried_by = 'a1'");
    expect(plain).toContain("CASE WHEN EXISTS (SELECT 1 FROM upd) THEN 'done' ELSE 'failed' END");
    expect(up).toContain("SET buried_at = NULL, buried_by = NULL");
  });
  it("магический — под локом сети владельца, только без живой охраны (поверженная не держит)", () => {
    expect(magic.startsWith(`${lock("chest:a9")} WITH prior`)).toBe(true);
    expect(magic).toContain("c.owner_account = 'a9'");
    expect(magic).toContain("AND NOT (g.killed_at IS NOT NULL OR g.current_hp <= 0)");
    expect(magic).not.toContain("g.killed_by");
    expect(magic).toContain("AND NOT EXISTS (SELECT 1 FROM held)");
    expect(magic).toContain("'mc:m:1:2'");
  });
});

describe("бугорок сундука и магический", () => {
  it("слой мешочков: бугорки сундуков — тот же круг, разведанное и купол, без срока", () => {
    const p = flat(nearSql({ account: "a1", activeMapId: "m", admin: false }));
    expect(p).toContain("FROM yuplink.raid_plain_chest x WHERE x.buried_at IS NOT NULL");
    expect(p).toContain("FROM yuplink.raid_magic_chest x WHERE x.buried_at IS NOT NULL");
    expect(p).toContain("true AS buried, 315360000000::bigint AS \"leftMs\"");
    expect(p).toContain("s.owner = 'a1' AND s.map_id = m.map_id AND s.cell = m.q || ',' || m.r");
    expect(p).toContain("(abs(m.q - p.q) + abs(m.r - p.r) + abs(m.q + m.r - p.q - p.r)) / 2 <= 20");
    const c = flat(cellSql({ mapId: "m", q: 1, r: 2, account: "a1" }));
    expect(c).toContain("'[]'::json AS items, false AS open FROM yuplink.raid_plain_chest x WHERE x.map_id = 'm' AND x.q = 1 AND x.r = 2 AND x.buried_at IS NOT NULL");
  });

  it("закопанный магический: чужой из сети не берёт, не забирают, охрану на него не ставят", () => {
    const via = { mapId: "m", q: 1, r: 2 };
    expect(flat(netTakeSql({ account: "a9", stackKey: "custom:x", qty: 1, op: "o", via }))).toContain(
      "mc.owner_account = 'a9' AND mc.buried_at IS NULL)",
    );
    const who = { mapId: "m", q: 1, r: 2, owner: "a9", account: "w", heroId: "h" };
    expect(flat(pickupSnapSql(who))).toContain("mc.owner_account = 'a9' AND mc.buried_at IS NULL");
    const tpl = { name: "Т", imageUrl: null, backgroundUrl: null, maxHp: 5, interactionCost: 1, abilities: [], damage: 1 };
    const g = flat(
      chestGuardSql(
        { mapId: "m", q: 1, r: 2, account: "a9", heroId: "h" },
        { stackKey: "boss:t", templateId: "t", tpl: tpl as unknown as EncounterTarget },
        "op",
      ),
    );
    expect(g).toContain("AND mc.owner_account = 'a9' AND mc.buried_at IS NULL )");
    expect(g).toContain("AND mc.buried_at IS NOT NULL) AS buried");
  });
});
