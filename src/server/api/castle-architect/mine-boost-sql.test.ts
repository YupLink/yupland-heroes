// Оператор покупки усиления: лок вида, уровень тот, что видел игрок, алмазы
// ключом уровня и подъём на один уровень — одним оператором.
import { describe, expect, it } from "vitest";
import { buyMineBoostSql } from "./mine-boost-sql";

const flat = (x: string) => x.replace(/\s+/g, " ");

describe("покупка усиления", () => {
  const sql = flat(buyMineBoostSql({ account: "acc_1", kind: "diamonds", from: 2, diamonds: 15 }));

  it("лок вида до WITH, списание алмазов ключом следующего уровня", () => {
    expect(sql.slice(0, sql.indexOf("WITH"))).toContain("hashtext('mineboost:acc_1:diamonds')");
    expect(sql).toContain(
      "yuplink.res_move('acc_1', 'diamonds', -15, 'mine_boost', 'mboost:acc_1:diamonds:3')",
    );
  });

  it("только с уровня, что видел игрок, и ровно на один", () => {
    expect(sql).toContain("go AS (SELECT 1 FROM cur WHERE cur.lvl = 2)");
    expect(sql).toContain("SELECT 'acc_1', 'diamonds', 3, now() FROM pay");
    expect(sql).toContain("WHERE yuplink.account_mine_boost.level = 2");
  });
});

describe("постановка усиленного чертежа", () => {
  it("цена захвата в настройке шахты — усиленная, не ниже базовой", async () => {
    const { placeMineSql } = await import("@/server/api/beta-raid/mine-place/mine-place-sql");
    const at = { mapId: "m", q: 1, r: 2, account: "a", wallet: "w", heroId: "h" };
    const sql = (captureCost?: number) =>
      placeMineSql({
        ...at,
        stackKey: "custom:x",
        kind: "diamonds",
        op: "o",
        energy: 160,
        captureCost,
      });
    expect(sql(160)).toContain('"captureCost":160');
    expect(sql(undefined)).toContain('"captureCost":20');
    expect(sql(5)).toContain('"captureCost":20');
  });
});
