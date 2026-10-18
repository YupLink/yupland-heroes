// SQL сундука: правило «что держит клетку», локи сети, ключи повтора и забор
// чужим под локом хозяина. Базы нет — проверяем текст операторов.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/server/db/mcpClient", () => ({ mcpExec: vi.fn() }));

import { cellFlagsSql } from "@/server/api/beta-raid/chest/chest-cell";
import { returnSql, storeSql, takeSql } from "@/server/api/beta-raid/chest/chest-net-sql";
import {
  claimSql,
  pendingListSql,
  pendingSql,
  plunderItems,
  plunderTakenSql,
} from "@/server/api/beta-raid/chest/chest-plunder-sql";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("клетка под сундук", () => {
  const sql = flat(cellFlagsSql("rmap_x", 4, -2));

  it("держат клетку постройка, живой объект, беглец, вода, купол, сундук и живая охрана", () => {
    // Здание — и вся площадь большого (блок клеток с постройкой), владелец 03.10.
    expect(sql).toContain("c.building_id IS NOT NULL");
    expect(sql).toContain("bb.group_id = c.group_id AND bb.building_id IS NOT NULL");
    expect(sql).toContain("c.object_id IS NOT NULL");
    expect(sql).toContain("beta_raid_runner rr");
    expect(sql).toContain("AS water");
    expect(sql).toContain("COALESCE(c.void_fog, false) AS dome");
    expect(sql).toContain(
      "raid_magic_chest mc WHERE mc.map_id = 'rmap_x' AND mc.q = 4 AND mc.r = -2",
    );
    expect(sql).toContain("g.killed_at IS NULL AND g.current_hp > 0");
  });
});

describe("сеть: положить", () => {
  const sql = flat(
    storeSql({
      account: "acc_1",
      heroId: "hero_1",
      stackKey: "custom:cst_a",
      qty: 5,
      op: "chestput:n1",
    }),
  );

  it("изношенный инструмент целиком не уходит: ни ключа, ни DELETE стопки с износом", () => {
    expect(sql).toContain("AS worn_all");
    expect(sql).toContain("AND NOT chk.worn_all");
    expect(sql).toMatch(/DELETE FROM yuplink\.raid_hero_backpack b[^;]*AND b\.wear = 0/);
  });

  it("сначала лок сети, потом лок рюкзака", () => {
    expect(sql.indexOf("hashtext('chest:acc_1')")).toBeGreaterThan(-1);
    expect(sql.indexOf("hashtext('bp:hero_1')")).toBeGreaterThan(
      sql.indexOf("hashtext('chest:acc_1')"),
    );
  });

  it("локи — отдельными операторами ДО чтения: место считается по свежему снимку", () => {
    expect(
      sql.startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('chest:acc_1')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('bp:hero_1')) AS l; WITH prior AS",
      ),
    ).toBe(true);
    expect(sql).not.toContain("FROM _l2");
  });

  it("строка рюкзака заперта: ключ операции значит «переложено»", () => {
    expect(sql).toContain("WHERE b.hero_id = 'hero_1' AND b.stack_key = 'custom:cst_a' FOR UPDATE");
  });

  const got = "LEAST(b.mob_count + b.mine_count + b.field_count + b.loot_count, b.count)";

  it("кладётся только собранное (любая метка) и только в пределах десяти ячеек", () => {
    expect(sql).toContain(`${got} AS got`);
    expect(sql).toContain("(src.got >= src.mv) AS got_ok");
    expect(sql).toContain("AND chk.mv > 0 AND chk.got_ok AND chk.fits AND NOT chk.worn_all");
    expect(sql).toContain("<= (GREATEST(10, net.used) - net.used) AS fits");
    // Условие повторено на самой строке: и у частичного вклада, и у всего стека.
    expect(sql).toContain(`AND b.count > chk.mv AND ${got} >= chk.mv RETURNING 1`);
    expect(sql).toContain(`AND b.count = chk.mv AND ${got} >= chk.mv AND b.wear = 0`);
  });

  it("метки после вклада — все четыре: безымянное остаётся, собранное уходит", () => {
    expect(sql).toContain(`mob_count = LEAST(b.mob_count, ${got} - chk.mv)`);
    expect(sql).toContain(
      `loot_count = (LEAST(b.mob_count + b.mine_count + b.field_count + b.loot_count, ${got} - chk.mv))`,
    );
  });

  it("пыль сверх просьбы — со стеком, только если собрана; перебор меньше пыли — собранное", () => {
    expect(sql).toContain(
      `CASE WHEN ${got} >= b.count THEN CASE WHEN b.count - 5 < 0.001 THEN b.count ELSE 5 END WHEN 5 - ${got} < 0.001 THEN LEAST(5, ${got}) ELSE 5 END AS mv`,
    );
  });

  it("в сеть ложится только реально снятое с рюкзака", () => {
    expect(sql).toContain("FROM chk, (SELECT 1 FROM upd UNION ALL SELECT 1 FROM del) moved");
    expect(sql).toContain("WHERE op = 'chestput:n1'");
  });
});

describe("сеть: положить через сундук (30.09 — кладёт и чужой)", () => {
  const via = { mapId: "rmap_x", q: 1, r: -2 };
  const store = (own: boolean) =>
    flat(
      storeSql({
        account: "acc_o",
        heroId: "h_t",
        stackKey: "custom:cst_a",
        qty: 5,
        op: "chestput:n1",
        via: { ...via, own },
      }),
    );

  it("чужой — сундук хозяина стоит, не закопан, живой охраны нет: тем же оператором под локом сети хозяина", () => {
    const sql = store(false);
    const lock = "SELECT pg_advisory_xact_lock(hashtext('chest:acc_o')) AS l;";
    expect(sql.startsWith(lock)).toBe(true);
    expect(sql).toContain(
      "here AS (SELECT 1 WHERE true AND EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE mc.map_id = 'rmap_x' AND mc.q = 1 AND mc.r = -2 AND mc.owner_account = 'acc_o' AND mc.buried_at IS NULL) AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g WHERE g.map_id = 'rmap_x' AND g.q = 1 AND g.r = -2 AND NOT (g.killed_at IS NOT NULL OR g.current_hp <= 0))),",
    );
  });

  it("не пускает — ни ключа, ни снятия с рюкзака, ни строки сети; ответ here", () => {
    const sql = store(false);
    expect(sql).toContain("SELECT 'chestput:n1' FROM chk, prior, here WHERE NOT prior.was");
    expect(sql).toContain("FROM chk, claim WHERE b.hero_id = 'h_t'");
    expect(sql).toContain("EXISTS (SELECT 1 FROM here) AS here");
  });

  it("хозяин — сундук стоит и не закопан; своя охрана не помеха", () => {
    const sql = store(true);
    expect(sql).toContain("mc.owner_account = 'acc_o' AND mc.buried_at IS NULL)),");
    expect(sql).not.toContain("raid_mine_guard");
  });
});

describe("сеть: забрать и вернуть", () => {
  it("снимает только из МОЕЙ строки и под локом сети", () => {
    const sql = flat(
      takeSql({ account: "acc_1", stackKey: "custom:cst_a", qty: 3, op: "chesttake:n1" }),
    );
    expect(sql).toContain("hashtext('chest:acc_1')");
    expect(sql).toContain("s.account_id = 'acc_1' AND s.stack_key = 'custom:cst_a'");
    expect(sql).toContain("CASE WHEN s.count - 3 < 0.001 THEN s.count ELSE 3 END");
  });

  it("лок до чтения и только полное количество: повтор «было» = снято ровно qty", () => {
    const sql = flat(
      takeSql({ account: "acc_1", stackKey: "custom:cst_a", qty: 3, op: "chesttake:n1" }),
    );
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('chest:acc_1')) AS l; WITH")).toBe(
      true,
    );
    expect(sql).toContain("AND s.count - 3 > -0.000000001");
  });

  it("свой забор клетку не проверяет: сеть одна на все сундуки хозяина", () => {
    const sql = flat(
      takeSql({ account: "acc_1", stackKey: "custom:cst_a", qty: 3, op: "chesttake:n1" }),
    );
    expect(sql).not.toContain("raid_magic_chest");
    expect(sql).not.toContain("raid_mine_guard");
  });

  it("чужой — через стоящий незакопанный сундук хозяина без живой охраны, тем же оператором", () => {
    const via = { mapId: "rmap_x", q: 1, r: -2 };
    const sql = flat(
      takeSql({ account: "acc_1", stackKey: "custom:cst_a", qty: 3, op: "chesttake:n1", via }),
    );
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('chest:acc_1')) AS l; WITH")).toBe(
      true,
    );
    expect(sql).toContain(
      "AND s.count - 3 > -0.000000001 AND EXISTS (SELECT 1 FROM yuplink.raid_magic_chest mc WHERE mc.map_id = 'rmap_x' AND mc.q = 1 AND mc.r = -2 AND mc.owner_account = 'acc_1' AND mc.buried_at IS NULL)",
    );
    expect(sql).toContain(
      "AND NOT EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g WHERE g.map_id = 'rmap_x' AND g.q = 1 AND g.r = -2 AND NOT (g.killed_at IS NOT NULL OR g.current_hp <= 0))",
    );
  });

  it("откат кладёт в мою строку и один раз", () => {
    const sql = flat(
      returnSql({
        account: "acc_1",
        stackKey: "custom:cst_a",
        snap: { kind: "custom", refId: "cst_a", itemId: null, name: "Руда", image: null },
        qty: 3,
        op: "chestback:n1",
      }),
    );
    expect(sql).toContain("SELECT 'chestback:n1' FROM _lock");
    expect(sql).toContain(
      "SELECT 'acc_1', 'custom:cst_a', 'custom', 'cst_a', NULL, 'Руда', NULL, 3 FROM claim",
    );
  });
});

describe("выбор добычи второй редакции (совместимость)", () => {
  it("забор одноразовый: только мой, невыбранный или с моим ключом", () => {
    const sql = flat(claimSql({ id: "plu_1", raider: "acc_w", op: "n1" }));
    expect(sql).toContain("SET claimed_at = COALESCE(p.claimed_at, now()), claim_op = 'n1'");
    expect(sql).toContain(
      "WHERE p.id = 'plu_1' AND p.raider_account = 'acc_w' AND (p.claimed_at IS NULL OR p.claim_op = 'n1')",
    );
    // Повтор моста — та же строка SQL с тем же ключом, другой вызов — другой.
    expect(flat(claimSql({ id: "plu_1", raider: "acc_w", op: "n1" }))).toBe(sql);
    expect(flat(claimSql({ id: "plu_1", raider: "acc_w", op: "n2" }))).not.toBe(sql);
  });

  it("окно и список — только мои невыбранные", () => {
    expect(flat(pendingSql("plu_1", "acc_w"))).toContain(
      "p.id = 'plu_1' AND p.raider_account = 'acc_w' AND p.claimed_at IS NULL",
    );
    const list = flat(pendingListSql("acc_w"));
    expect(list).toContain("jsonb_array_length(p.items) AS kinds");
    expect(list).toContain("p.raider_account = 'acc_w' AND p.claimed_at IS NULL");
  });

  it("уехавшее дописывается в журнал экранированным JSON", () => {
    expect(flat(plunderTakenSql("plu_1", [{ stackKey: "custom:o'k", qty: 2 }]))).toContain(
      `'[{"stackKey":"custom:o''k","qty":2}]'::jsonb`,
    );
  });

  it("items из ответа — массивом или строкой", () => {
    const one = { stackKey: "a", kind: "custom", refId: null, name: "A", image: null, count: 1 };
    expect(plunderItems([one])).toEqual([one]);
    expect(plunderItems(JSON.stringify([one]))).toEqual([one]);
    expect(plunderItems("oops")).toEqual([]);
    expect(plunderItems(null)).toEqual([]);
  });
});
