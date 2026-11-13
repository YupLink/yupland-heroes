// Рыба от красного динамита — тот же мешочек (30.10.2026): слой и окно знают, что это
// рыба (source 'floatfish'); «Открыть» тем же оператором снимает метку башмака; метки
// не видно ни плиткой окна, ни в «Забрать»; «Выбросить» и рюкзак проданного героя в
// рыбу не сыплют.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FISH_BAG_SOURCE, FISH_BOOT_KEY } from "@/lib/raid/dynamiteFish";

const h = vi.hoisted(() => ({ sql: [] as string[] }));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    h.sql.push(sql);
    return [];
  },
}));

const { bootAgainSql, bootAnswerSql, bootCtes } = await import("./bag-fish");
const { openPassSql } = await import("../open-pass/pass-sql");
const { loadStacks } = await import("./bag-take-read");
const { cellSql, nearSql } = await import("./bag-read-sql");
const { bagAtCellSql, discardToBagSql } = await import("./bag-discard-sql");
const { pawnDropSql } = await import("../hero-pawn-drop-sql");

const BAG = `lb_${"f".repeat(32)}`;
const flat = (s: string) => s.replace(/\s+/g, " ");
const NOT_FISH = `b.source <> '${FISH_BAG_SOURCE}'`;
const OPEN = {
  account: "acc_1",
  wallet: "w1",
  target: `lb:${BAG}`,
  priceSql: "1",
  op: "open:o1",
  cell: { q: 5, r: 6 },
};

beforeEach(() => {
  h.sql = [];
});

describe("«Открыть» рыбу с башмаком — одним оператором с входом", () => {
  it("лок мешочка, метка в ноль только при записанном входе или повторе, ответ boot", () => {
    const sql = flat(openPassSql({ ...OPEN, bagId: BAG }));
    expect(sql).toContain(`SELECT pg_advisory_xact_lock(hashtext('lootbag:${BAG}')) AS l;`);
    expect(sql).toContain(flat(bootCtes(BAG)));
    expect(sql).toContain(
      `WHERE bi.bag_id = '${BAG}' AND bi.stack_key = '${FISH_BOOT_KEY}' AND bi.count > 0 AND (EXISTS (SELECT 1 FROM put) OR EXISTS (SELECT 1 FROM free))`,
    );
    expect(sql).toContain(`UPDATE yuplink.raid_loot_bag lb SET updated_at = now()`);
    expect(sql).toContain(`${flat(bootAnswerSql(BAG))} AS boot ) _t;`);
    // CTE снятия — после put и free, ответ — колонкой той же строки.
    expect(sql.indexOf("put AS (")).toBeLessThan(sql.indexOf("boot AS ("));
  });

  it("ответ boot — и у снятой метки (строка с нулём): повтор видит, что это был башмак", () => {
    const ans = flat(bootAnswerSql(BAG));
    expect(ans).toContain(`bi.stack_key = '${FISH_BOOT_KEY}'`);
    expect(ans).not.toContain("count");
  });

  it("сундук и мешочек без bagId — без лока мешочка и без колонки boot", () => {
    const sql = flat(openPassSql(OPEN));
    expect(sql).not.toContain("lootbag:");
    expect(sql).not.toContain("AS boot");
  });

  it("повтор ручки: вход этого нажатия и строка башмака", () => {
    const sql = flat(
      bootAgainSql({ account: "a'1", target: `lb:${BAG}`, bagId: BAG, op: "open:o" }),
    );
    expect(sql).toContain(`p.account_id = 'a''1' AND p.target = 'lb:${BAG}' AND p.op = 'open:o'`);
    expect(sql).toContain(`bi.bag_id = '${BAG}' AND bi.stack_key = '${FISH_BOOT_KEY}'`);
  });
});

describe("метки башмака не видно", () => {
  it("«Забрать»: позиции мешочка без метки", async () => {
    await loadStacks(BAG);
    expect(flat(h.sql[0])).toContain(
      `WHERE i.bag_id = '${BAG}' AND i.count > 0 AND i.expires_at > now() AND i.stack_key NOT IN ('${FISH_BOOT_KEY}', 'dig:empty')`,
    );
  });

  it("окно: плитки мешочка без метки", () => {
    const sql = flat(cellSql({ mapId: "m", q: 1, r: 2, account: "acc_1" }));
    expect(sql).toContain(
      `WHERE x.bag_id = b.id AND x.count > 0 AND x.expires_at > now() AND x.stack_key NOT IN ('${FISH_BOOT_KEY}', 'dig:empty') GROUP BY x.stack_key`,
    );
  });
});

describe("слой и окно знают рыбу", () => {
  const fish = `(b.source = '${FISH_BAG_SOURCE}') AS fish`;

  it("слой: у мешочка — признак рыбы, у бугорка сундука — false, в том же месте", () => {
    const sql = flat(nearSql({ account: "acc_1", activeMapId: "m", admin: false }));
    expect(sql).toContain(`AS "leftMs", ${fish} FROM yuplink.beta_raid_positions p`);
    expect(sql).toContain(`AS "leftMs", false AS fish FROM yuplink.beta_raid_positions p`);
  });

  it("окно: признак рыбы сразу за сроком — и у мешочка, и у бугорков (UNION по порядку)", () => {
    const sql = flat(cellSql({ mapId: "m", q: 1, r: 2, account: "acc_1" }));
    expect(sql).toContain(
      `AS "leftMs", ${fish}, (b.source = 'dig') AS dig, CASE WHEN b.buried_at IS NOT NULL`,
    );
    expect(
      sql.match(/AS "leftMs", false AS fish, false AS dig, '\[\]'::json AS items, false AS open/g),
    ).toHaveLength(2);
  });
});

describe("в рыбу не сыплют", () => {
  it("«Выбросить»: мешочек клетки для «долить» — не рыба (и кандидат, и под локом)", () => {
    expect(flat(bagAtCellSql("m", 1, 2))).toContain(`AND ${NOT_FISH} AND EXISTS`);
    const sql = flat(
      discardToBagSql({
        op: "o",
        account: "a",
        heroId: "h",
        mapId: "m",
        q: 1,
        r: 2,
        stackKey: "custom:cst_x",
        qty: 1,
        key: "k",
        bagId: null,
      }),
    );
    expect(sql).toContain(`AND ${NOT_FISH} AND EXISTS`);
  });

  it("рюкзак проданного героя: мешочек клетки — не рыба", () => {
    const sql = flat(
      pawnDropSql({ ops: ["o"], account: "a", mapId: "m", q: 1, r: 2, key: "k", bagId: null }),
    );
    expect(sql).toContain(`AND ${NOT_FISH} /*`);
  });
});
