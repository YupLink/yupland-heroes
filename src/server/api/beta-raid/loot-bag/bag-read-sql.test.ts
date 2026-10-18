// Текст SQL мешочков, вторая часть: закопать/выкопать (срок бугорка, переслив
// порций, отказ при снятии в полёте), положить из рюкзака одной транзакцией,
// мешочки «второго обзора» (круг 20 по индексу, разведанное, купол), окно
// клетки, лопата и сборщик. Смысл — bag-*.test на фейке базы.
import { describe, expect, it } from "vitest";
import { digFenceSql, digSql } from "./bag-dig-sql";
import { putFenceSql, putSql } from "./bag-put-sql";
import { cellSql, nearSql, shovelSql, sweepSql } from "./bag-read-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("закопать / выкопать", () => {
  const bury = flat(digSql({ bagId: "lb_x", op: "d1", account: "a", bury: true, nonce: "n1" }));
  const dig = flat(digSql({ bagId: "lb_x", op: "d2", account: "a", bury: false, nonce: "n2" }));

  it("«моё ли» — по nonce вызова: слепой повтор моста свой, параллельный дубль — чужой", () => {
    expect(bury).toContain("jsonb_build_object('nonce', 'n1')");
    expect(bury).toContain(
      "(EXISTS (SELECT 1 FROM mark) OR COALESCE((SELECT nonce FROM prior) = 'n1', false)) AS mine",
    );
  });

  it("под локом мешочка; исход пишется в ключ и в отказе ('failed')", () => {
    expect(bury.startsWith("SELECT pg_advisory_xact_lock(hashtext('lootbag:lb_x')) AS l;")).toBe(true);
    expect(bury).toContain("SET buried_at = now(), buried_by = 'a', updated_at = now()");
    expect(bury).toContain("CASE WHEN EXISTS (SELECT 1 FROM upd) THEN 'done' ELSE 'failed' END");
    expect(bury).toContain("WHERE NOT EXISTS (SELECT 1 FROM prior)");
  });

  it("закопать: живой, не закопан, без снятий в полёте; сроки порций НЕ трогает (владелец, 29.09)", () => {
    expect(bury).toContain("cur.alive AND cur.buried = false AND NOT cur.busy");
    expect(bury).toContain("WHERE t.bag_id = b.id AND t.state = 'taken') AS busy");
    // Никаких «+24 ч»: порции не удаляются и не переписываются — у каждой свой срок.
    expect(bury).not.toContain("DELETE FROM yuplink.raid_loot_bag_item");
    expect(bury).not.toContain("INSERT INTO yuplink.raid_loot_bag_item");
    expect(bury).not.toContain("interval '24 hours'");
    expect(bury).toContain("buried_at = now()");
  });

  it("«забор» переворота: под тем же локом ключ с отказом, если его ещё нет; ответ — исход ключа", () => {
    const f = flat(digFenceSql({ bagId: "lb_x", op: "d3", account: "a", bury: true }));
    expect(f.startsWith("SELECT pg_advisory_xact_lock(hashtext('lootbag:lb_x')) AS l;")).toBe(true);
    expect(f).toContain("VALUES ('d3', 'lb_x', 'a', 'bury', 'failed') ON CONFLICT (op) DO NOTHING;");
    expect(f).toContain("SELECT state FROM yuplink.raid_loot_bag_op WHERE op = 'd3'");
  });

  it("выкопать: только живой бугорок, сроки не трогает", () => {
    expect(dig).toContain("SET buried_at = NULL, buried_by = NULL");
    expect(dig).toContain("cur.alive AND cur.buried = true )");
    expect(dig).not.toContain("DELETE");
    expect(dig).not.toContain("interval '24 hours'");
    expect(dig).toContain("x.count > 0 AND x.expires_at > now()) AS alive");
  });
});

describe("положить из рюкзака", () => {
  const f = flat(
    putSql({ bagId: "lb_x", heroId: "h1", stackKey: "custom:cst_b", qty: 3, op: "bagput:a:o", account: "a" }),
  );

  it("локи рюкзака и мешочка — отдельными операторами, рюкзак первым", () => {
    expect(
      f.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l; SELECT pg_advisory_xact_lock(hashtext('lootbag:lb_x')) AS l; WITH prior",
      ),
    ).toBe(true);
  });

  it("только в живой, не закопанный мешочек и только если в стопке хватает", () => {
    expect(f).toContain("WHERE b.id = 'lb_x' AND b.buried_at IS NULL AND NOT EXISTS (SELECT 1 FROM prior)");
    expect(f).toContain("h.count - 3 > -0.000000001 AND EXISTS (SELECT 1 FROM bag) FOR UPDATE");
  });

  it("снятое по правилу траты, метки — в новую порцию на 24 часа; один срок — сливается", () => {
    expect(f).toContain("SET count = GREATEST(0, ROUND(h.count - 3, 9))");
    expect(f).toContain("'custom:cst_b', now() + interval '24 hours', u.kind, u.ref_id, NULL, u.name");
    expect(f).toContain(
      "ON CONFLICT (bag_id, stack_key, expires_at) DO UPDATE SET count = it.count + EXCLUDED.count, mob_count = it.mob_count + EXCLUDED.mob_count",
    );
    expect(f).toContain("'a', 'h1', 'put', 'custom:cst_b', 3, u.mob, u.mine, u.field, u.loot, 'done'");
  });

  it("пустая стопка рюкзака — только эта (своя запись); ответ — строка ключа (повтор — тот же)", () => {
    expect(f).toContain(
      "DELETE FROM yuplink.raid_hero_backpack WHERE hero_id = 'h1' AND stack_key = 'custom:cst_b' AND count <= 0 AND updated_at = now();",
    );
    expect(f).toContain("FROM yuplink.raid_loot_bag_op o LEFT JOIN LATERAL");
    expect(f).toContain("WHERE o.op = 'bagput:a:o' ) _t;");
  });

  it("«забор» положить: те же локи, ключ с qty 0 ('failed'), ответ — как у положить", () => {
    const g = flat(
      putFenceSql({ bagId: "lb_x", heroId: "h1", stackKey: "custom:cst_b", op: "bagput:a:o", account: "a" }),
    );
    expect(g.startsWith("SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l;")).toBe(true);
    expect(g).toContain("'put', 'custom:cst_b', 0, 'failed') ON CONFLICT (op) DO NOTHING;");
    expect(g).toContain("WHERE o.op = 'bagput:a:o' ) _t;");
  });
});

describe("чтения и сборщик", () => {
  it("«второй обзор»: позиция по ключу, квадрат ±20 по индексу, круг 20, живые, разведанное, без купола", () => {
    const p = flat(nearSql({ account: "acc_1", activeMapId: "m", admin: false }));
    expect(p).toContain("FROM yuplink.beta_raid_positions p JOIN yuplink.raid_loot_bag b");
    expect(p).toContain("ON b.map_id = COALESCE(p.map_id, 'm')");
    expect(p).toContain("b.q BETWEEN p.q - 20 AND p.q + 20 AND b.r BETWEEN p.r - 20 AND p.r + 20");
    expect(p).toContain("/ 2 <= 20");
    expect(p).toContain("WHERE p.account_id = 'acc_1'");
    expect(p).toContain("x.count > 0 AND x.expires_at > now() ) life");
    expect(p).toContain("AND NOT COALESCE(c.void_fog, false)");
    expect(p).toContain(
      "s.owner = 'acc_1' AND s.map_id = b.map_id AND s.cell = b.q || ',' || b.r",
    );
    expect(p).toContain("ORDER BY (abs(b.q - p.q) + abs(b.r - p.r) + abs(b.q + b.r - p.q - p.r)) / 2, b.created_at");
    const admin = flat(nearSql({ account: "acc_1", activeMapId: "m", admin: true }));
    expect(admin).not.toContain("void_fog");
    expect(admin).not.toContain("beta_raid_fog_seen");
  });

  it("окно клетки: позиции — сумма живых порций и ближайший срок; у бугорка и без входа содержимого нет", () => {
    const f = flat(cellSql({ mapId: "m", q: 1, r: 2, account: "acc_1" }));
    expect(f).toContain("CASE WHEN b.buried_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM yuplink.raid_open_pass op");
    expect(f).toContain("op.account_id = 'acc_1' AND op.target = 'lb:' || b.id AND op.until > now()");
    expect(f).toContain("AS open FROM yuplink.raid_loot_bag b");
    expect(f).toContain("sum(x.count) AS count, min(x.expires_at) AS soon");
    expect(f).toContain("GROUP BY x.stack_key");
    expect(f).toContain("b.map_id = 'm' AND b.q = 1 AND b.r = 2 AND life.last IS NOT NULL");
  });

  it("лопата — свой товар с галочкой и целой штукой; надбитая — первой", () => {
    const f = flat(shovelSql("h1"));
    expect(f).toContain("ci.is_shovel AND b.count >= 1");
    expect(f).toContain("ORDER BY b.wear DESC");
  });

  it("сборщик: лок; сгоревшие и пустые (у тихого) порции, если снятий в полёте нет; мешочек — без порций, тихий", () => {
    const f = flat(sweepSql());
    expect(f.startsWith("SELECT pg_advisory_xact_lock(hashtext('lootbag-sweep')) AS l;")).toBe(true);
    expect(f.indexOf("DELETE FROM yuplink.raid_loot_bag_item i")).toBeLessThan(
      f.indexOf("DELETE FROM yuplink.raid_loot_bag d"),
    );
    expect(f).toContain("WHERE (i.bag_id, i.stack_key, i.expires_at) IN (");
    expect(f).toContain("(x.expires_at <= now() OR (x.count <= 0 AND EXISTS");
    expect(f).toContain("q.updated_at < now() - interval '10 minutes'");
    expect(f).toContain("AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_op o WHERE o.bag_id = x.bag_id AND o.state = 'taken')");
    expect(f).toContain(
      "WHERE d.updated_at < now() - interval '10 minutes' AND NOT EXISTS (SELECT 1 FROM yuplink.raid_loot_bag_item x WHERE x.bag_id = d.id)",
    );
    expect(f).toContain("SELECT DISTINCT map_id, q, r FROM gone");
  });
});

describe("под декором (дополнение №5)", () => {
  it("слой не отдаёт мешочки и бугорки под деревом — никому; сборщик сроки не трогает", () => {
    const sql = nearSql({ account: "a1", activeMapId: "m", admin: true }).replace(/\s+/g, " ");
    expect(sql.match(/AND c\.decoration_id IS NULL/g)).toHaveLength(2);
    // Дерево порции не продлевает и не держит: сборщик про декор не знает.
    expect(sweepSql()).not.toContain("decoration_id");
  });
});
