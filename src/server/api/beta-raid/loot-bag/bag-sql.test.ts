// Текст SQL мешочков, часть записи: лок мешочка отдельным оператором, id от
// ключа выпадения (повтор моста не роняет второй), порции со сроком 24 ч,
// «забор» мешочка надгробием и выдачи метками bp:/bpx:, снятие от ранней
// порции с ключом и порциями (parts), откат — в те же порции. Смысл —
// bag-*.test на фейке базы; закопать, положить, чтения — bag-read-sql.test.
import { describe, expect, it } from "vitest";
import { dropFenceSql, dropSql } from "./bag-sql";
import { takeSql } from "./bag-take-sql";
import { backSql, fenceSql, staleTakesSql, takeDoneSql } from "./bag-back-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const at = {
  key: "boss:hp1:2:acc_1",
  mapId: "map1",
  q: 3,
  r: -4,
  account: "acc_1",
  source: "boss" as const,
  sourceName: "Йети д'Артаньяна",
};
const stack = {
  stackKey: "custom:cst_b",
  kind: "custom",
  refId: "cst_b",
  itemId: "cst_b",
  name: "Банан",
  image: null,
  count: 5,
  marks: { mob: 5, mine: 0, field: 0, loot: 0 },
};
const ID = "'lb_' || md5('boss:hp1:2:acc_1')";
const DROP_LOCK = `SELECT pg_advisory_xact_lock(hashtext('lootbag:' || ${ID})) AS l;`;

describe("уронить мешочек", () => {
  const sql = flat(dropSql(at, [stack]));

  it("под локом мешочка (id от ключа — выражением базы), отдельным оператором", () => {
    expect(sql.startsWith(DROP_LOCK)).toBe(true);
    expect(sql).toContain("AS l; WITH bag AS");
  });

  it("id от ключа выпадения; повтор — ON CONFLICT DO NOTHING, порции только к новому", () => {
    expect(sql).toContain(`VALUES (${ID}, 'map1', 3, -4, now(), 'acc_1', 'boss', 'Йети д''Артаньяна', now())`);
    expect(sql).toContain("ON CONFLICT (id) DO NOTHING RETURNING id");
    expect(sql).toMatch(/FROM bag, \(VALUES \('custom:cst_b'::text, 'custom'::text, 'cst_b'::text/);
    expect(sql).toContain(`SELECT ${ID} AS id, EXISTS (SELECT 1 FROM bag) AS fresh`);
  });

  it("порция — вид, срок 24 часа с попадания и метки происхождения", () => {
    expect(sql).toContain(
      "(bag_id, stack_key, expires_at, kind, ref_id, item_id, name, image, count, mob_count, mine_count, field_count, loot_count)",
    );
    expect(sql).toContain("SELECT bag.id, v.k, now() + interval '24 hours', v.kind");
    expect(sql).toContain("5::numeric, 5::numeric, 0::numeric, 0::numeric, 0::numeric)");
  });

  it("«забор»: тот же лок, надгробие без порций; настоящий — тот, у кого порции есть", () => {
    const f = flat(dropFenceSql(at));
    expect(f.startsWith(DROP_LOCK)).toBe(true);
    expect(f).toContain("WITH t AS ( INSERT INTO yuplink.raid_loot_bag");
    expect(f).toContain("ON CONFLICT (id) DO NOTHING RETURNING 1");
    expect(f).not.toContain("raid_loot_bag_item (");
    expect(f).toContain(
      `EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item i WHERE i.bag_id = ${ID}) AS real`,
    );
  });
});

describe("снять стопку", () => {
  const sql = takeSql({
    bagId: "lb_x",
    stackKey: "custom:cst_b",
    qty: 7,
    cap: 9,
    op: "bagtake:a:o:k",
    account: "a",
    heroId: "h1",
  });
  const f = flat(sql);

  it("лок мешочка — отдельным оператором перед основным", () => {
    expect(
      sql.trimStart().startsWith("SELECT pg_advisory_xact_lock(hashtext('lootbag:lb_x')) AS l;"),
    ).toBe(true);
    expect(f).toContain("AS l; WITH prior AS");
  });

  it("живые порции вида, от ранней к поздней; закопанный и взятое этим ключом — ничего", () => {
    expect(f).toContain("i.count > 0 AND i.expires_at > now()");
    expect(f).toContain(
      "sum(i.count) OVER (ORDER BY i.expires_at ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING), 0) AS prev",
    );
    expect(f).toContain("b.buried_at IS NULL AND NOT EXISTS (SELECT 1 FROM prior)");
    expect(f).toContain("LEAST(l.count, w.mv - l.prev) AS part FROM live l, want w WHERE w.mv > l.prev");
  });

  it("не больше, чем лежит; пыль — со стеком, только если влезает (cap)", () => {
    expect(f).toContain("CASE WHEN sum(count) - 7 < 0.001 THEN LEAST(sum(count), 9) ELSE 7 END AS mv");
  });

  it("метки каждой порции — по правилу траты; снятое и порции — в ключ «снято»", () => {
    expect(f).toContain("mob_count = LEAST(i.mob_count, i.count - s.part)");
    expect(f).toContain("GREATEST(0, LEAST(s.mob_count, s.count) - i.mob_count) AS mob");
    expect(f).toContain("jsonb_agg(jsonb_build_object('e', e, 'n', n, 'mob', mob");
    expect(f).toContain("'a', 'h1', 'take', 'custom:cst_b', t.qty, t.mob, t.mine, t.field, t.loot, t.parts, 'taken'");
  });

  it("закрыть ключ — только из «снято»", () => {
    expect(takeDoneSql("k")).toContain("SET state = 'done' WHERE op = 'k' AND state = 'taken'");
  });
});

describe("«забор» выдачи и развязка", () => {
  it("забор: ключ выдачи и метка bpx: — под локом героя", () => {
    const f = flat(fenceSql("h1", "n1"));
    expect(f.startsWith("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l;")).toBe(true);
    expect(f).toContain(
      "INSERT INTO yuplink.raid_backpack_op (op) VALUES ('bp:n1') ON CONFLICT (op) DO NOTHING",
    );
    expect(f).toContain("SELECT 'bpx:n1' FROM fence");
    expect(f).toContain(
      "OR EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = 'bpx:n1')) AS yes",
    );
  });

  it("откат только при закрытой выдаче — в те же порции (срок из parts), с метками; прошла — ключ done", () => {
    const f = flat(backSql({ bagId: "lb_x", heroId: "h1", op: "o1", nonce: "o1" }));
    expect(f.indexOf("hashtext('bp:h1')")).toBeLessThan(f.indexOf("hashtext('lootbag:lb_x')"));
    expect(f).toContain(
      "WHERE o.op = 'o1' AND o.bag_id = 'lb_x' AND o.state = 'taken' AND (SELECT yes FROM blocked) RETURNING o.stack_key, o.parts",
    );
    expect(f).toContain(
      "jsonb_to_recordset(COALESCE(f.parts, '[]'::jsonb)) AS p(e timestamptz, n numeric",
    );
    expect(f).toContain("SET count = i.count + p.n");
    expect(f).toContain("WHERE i.bag_id = 'lb_x' AND i.stack_key = p.stack_key AND i.expires_at = p.e");
    expect(f).toContain(
      "SET state = 'done' WHERE o.op = 'o1' AND o.bag_id = 'lb_x' AND o.state = 'taken' AND NOT (SELECT yes FROM blocked)",
    );
  });

  it("зависшие — только «снято» старше 2 минут", () => {
    const f = flat(staleTakesSql());
    expect(f).toContain("o.state = 'taken' AND o.kind = 'take'");
    expect(f).toContain("o.at < now() - interval '2 minutes'");
  });
});
