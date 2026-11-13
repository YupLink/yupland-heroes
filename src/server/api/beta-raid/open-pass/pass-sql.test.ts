// Текст SQL входа (§8.23, поправки 30.09): лок входа и строка позиции —
// отдельными операторами до WITH; без платы и без записи — повтор того же
// нажатия (без срока давности) или живой вход; иначе цена в миг открытия (не
// меньше 1, не выше показанной кнопкой) и списание энергии той же транзакцией
// (нехватка роняет всё); вход — 10 минут от нажатия и версия позиции.
// Закрыть — погасить срок своих входов, не стирая ключ нажатия. Смысл —
// pass.test и pass-race.test на фейке.
import { describe, expect, it } from "vitest";
import { CELL_SIZE } from "@/lib/hero/backpackCells";
import {
  bagTarget,
  cellsPriceSql,
  closePassSql,
  magicTarget,
  openPassSql,
  passAliveSql,
  plainTarget,
} from "@/server/api/beta-raid/open-pass/pass-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");
const openSql = (maxPrice?: number) =>
  flat(
    openPassSql({
      account: "acc1",
      wallet: "w1",
      target: "pc:pc_1",
      priceSql: cellsPriceSql("yuplink.raid_plain_chest_slot", "s.chest_id = 'pc_1'"),
      op: "open:o1",
      cell: { q: 5, r: 6 },
      maxPrice,
    }),
  );
const sql = openSql(3);

describe("открыть", () => {
  it("лок входа и строка позиции — до WITH: шаг подождёт, вход не запишется с чужой клетки", () => {
    const head =
      "SELECT pg_advisory_xact_lock(hashtext('pass:acc1:pc:pc_1')) AS l; " +
      "SELECT 1 FROM yuplink.beta_raid_positions WHERE account_id = 'acc1' FOR UPDATE;";
    expect(sql.startsWith(head)).toBe(true);
  });

  it("без платы и без записи: повтор того же нажатия (без срока давности) или живой вход", () => {
    expect(sql).toContain(
      "free AS ( SELECT 1 FROM cur, pos WHERE cur.op = 'open:o1' OR (cur.until > now() AND cur.pos_at IS NOT DISTINCT FROM pos.updated_at) )",
    );
    expect(sql).not.toContain("interval '1 minute'");
    expect(sql).toContain("go AS ( SELECT 1 FROM near, price WHERE NOT EXISTS (SELECT 1 FROM");
    // Вход пишется только новым открытием: живой не продлевается.
    expect(sql).toContain("FROM pos, go ON CONFLICT");
    expect(sql).toContain("need AS (SELECT price.c FROM price, go WHERE price.c > 0)");
  });

  it("не дороже показанного кнопкой; вкладка до выката — без потолка", () => {
    expect(sql).toContain("WHERE NOT EXISTS (SELECT 1 FROM free) AND price.c <= 3 )");
    expect(openSql()).not.toContain("price.c <=");
    // Остров: цена дробная — потолок не режется вниз до 0 (тогда вход не открылся бы).
    expect(openSql(0.5)).toContain("AND price.c <= 0.5 )");
  });

  it("цена — занятые ячейки в миг открытия, не меньше 1; списание — той же транзакцией", () => {
    expect(sql).toContain(`GREATEST(1, (SELECT COALESCE(SUM(CEIL(s.count / ${CELL_SIZE}.0)), 0)`);
    expect(sql).toContain("CROSS JOIN LATERAL yuplink.touch_energy_atomic('w1', need.c)");
  });

  it("вход на 10 минут от нажатия с версией позиции; только со своей или соседней клетки", () => {
    expect(sql).toContain("now() + interval '10 minutes', pos.updated_at");
    expect(sql).toContain(
      "(abs(pos.q - 5) + abs(pos.r - 6) + abs(pos.q + pos.r - 5 - 6)) / 2 <= 1",
    );
  });
});

describe("жив ли и закрыть", () => {
  it("живой — не истёк (и не закрыт) и позиция не менялась", () => {
    expect(flat(passAliveSql("acc1", "'pc:pc_1'"))).toContain(
      "op.until > now() AND pos.updated_at IS NOT DISTINCT FROM op.pos_at",
    );
  });

  it("цели: мешочек по id, обычный сундук по id, магический по клетке", () => {
    expect([bagTarget("lb_1"), plainTarget("pc_1"), magicTarget("m", 1, -2)]).toEqual([
      "lb:lb_1",
      "pc:pc_1",
      "mc:m:1:-2",
    ]);
  });

  it("закрыть окно сундука — только свои входы (ключи нажатий); срок гаснет, строка остаётся", () => {
    const at = { account: "acc1", mapId: "m", q: 1, r: -2, bagIds: ["lb_1"] };
    const c = flat(closePassSql({ ...at, ops: ["open:o1"] }));
    expect(c.startsWith("UPDATE yuplink.raid_open_pass SET until = now()")).toBe(true);
    expect(c).not.toContain("DELETE");
    expect(c).toContain("target IN ('mc:m:1:-2', 'lb:lb_1')");
    expect(c).toContain("SELECT 'pc:' || c.id FROM yuplink.raid_plain_chest c");
    expect(c).toContain("AND op IN ('open:o1');");
    // Вкладка до выката ключей не шлёт — закрывается всё на клетке, как раньше.
    expect(flat(closePassSql(at))).not.toContain("op IN");
  });

  it("окно мешочков (chest: false) — только мешочки, сундук клетки не трогает", () => {
    const c = flat(
      closePassSql({ account: "acc1", mapId: "m", q: 1, r: -2, bagIds: ["lb_1"], chest: false }),
    );
    expect(c).toContain("target IN ('lb:lb_1')");
    expect(c).not.toContain("mc:m:1:-2");
    expect(c).not.toContain("raid_plain_chest");
  });
});
