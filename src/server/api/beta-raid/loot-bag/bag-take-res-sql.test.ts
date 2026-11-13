// SQL забора ресурса счёта из мешочка (§8.70): одно снятие под локом мешочка,
// из живых незакопанных порций, до 0,0001, и res_move вида bag_take тем же
// оператором — рюкзака не касается.
import { describe, expect, it } from "vitest";
import { takeResSql } from "./bag-take-res-sql";

const BAG = "lb_0123456789abcdef0123456789abcdef";

describe("SQL забора ресурса", () => {
  const sql = takeResSql({
    bagId: BAG,
    stackKey: "resource:wood",
    res: "wood",
    qty: 1.23456,
    op: "bagtake:acc1:p1:resource:wood",
    account: "acc1",
  });
  const flat = sql.replace(/\s+/g, " ");

  it("под локом мешочка, из живых незакопанных порций, до 0,0001", () => {
    expect(flat).toContain(`pg_advisory_xact_lock(hashtext('lootbag:${BAG}'))`);
    expect(flat).toContain("b.buried_at IS NULL");
    expect(flat).toContain("i.expires_at > now()");
    expect(flat).toContain("trunc(1.23456::numeric, 4)");
  });

  it("начисление — res_move вида bag_take с ключом нажатия, вместе со снятием", () => {
    expect(flat).toContain(
      "yuplink.res_move('acc1', 'wood', t.qty, 'bag_take', 'bagtake:acc1:p1:resource:wood')",
    );
    expect(flat).toContain("FROM tot t CROSS JOIN credit");
    expect(flat).toContain("'take', 'resource:wood', t.qty, t.parts, 'done'");
    expect(flat).not.toContain("raid_hero_backpack");
  });
});
