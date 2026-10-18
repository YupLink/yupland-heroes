// SQL «Забрать сундук»: локи до чтения, сверка снимка, всё-или-ничего, остаток
// мешочком и ключ нажатия — у хозяина и у чужого. Базы нет — проверяем текст
// операторов.
import { describe, expect, it } from "vitest";
import {
  pickupDoneSql,
  pickupSnapSql,
  pickupSql,
} from "@/server/api/beta-raid/chest/chest-pickup-sql";

const flat = (x: string) => x.replace(/\s+/g, " ");
const who = { mapId: "rmap_x", q: 1, r: 2, owner: "acc_o", account: "acc_o", heroId: "h1" };
const ore = { k: "custom:cst_ore", kind: "custom", ref: "cst_ore", item: null, name: "Руда", image: null };
const write = (
  over: {
    confirm?: boolean;
    woundedOk?: boolean;
    last?: boolean;
    tpl?: string | null;
    whole?: boolean | null;
    account?: string;
    bagged?: boolean;
  } = {},
) =>
  flat(
    pickupSql({
      ...who,
      account: over.account ?? "acc_o",
      op: `chestpick:${over.account ?? "acc_o"}:op1`,
      confirm: over.confirm ?? false,
      woundedOk: over.woundedOk ?? false,
      expect: {
        bagFp: "bfp",
        netFp: "nfp",
        last: over.last ?? true,
        tpl: "tpl" in over ? (over.tpl ?? null) : "rbt_1",
        whole: "whole" in over ? (over.whole ?? null) : true,
      },
      rows: [
        {
          k: "custom:cst_mc",
          kind: "custom",
          ref: "cst_mc",
          item: "cst_mc",
          name: "O'Chest",
          image: null,
          qty: 1,
          loot: 0,
        },
        {
          k: "custom:cst_ore",
          kind: "custom",
          ref: "cst_ore",
          item: null,
          name: "Руда",
          image: null,
          qty: 3,
          loot: 3,
        },
      ],
      bagged: over.bagged ? [{ ...ore, n: 2.5, loot: 2.5 }] : [],
      items: [{ stackKey: "custom:cst_ore", count: 3 }],
      taken: [{ stackKey: "custom:cst_ore", qty: 3 }],
    }),
  );

describe("запись «Забрать сундук»", () => {
  it("лок сети, рюкзака и строки охраны — отдельными операторами до чтения", () => {
    // Удар по охране лок сети не берёт: строку охраны запираем сами, иначе урон
    // между снимком и DELETE вернул бы раненую охрану целой.
    expect(
      write().startsWith(
        "SELECT pg_advisory_xact_lock(hashtext('chest:acc_o')) AS l; " +
          "SELECT pg_advisory_xact_lock(hashtext('bp:h1')) AS l; " +
          "SELECT 1 FROM yuplink.raid_mine_guard g WHERE g.map_id = 'rmap_x' AND g.q = 1 AND g.r = 2 FOR UPDATE; " +
          "WITH prior AS",
      ),
    ).toBe(true);
  });

  it("план годен, только если снимок тот же: рюкзак, «последний», сеть, охрана и её HP", () => {
    const sql = write();
    expect(sql).toContain(
      "(st.bag_fp = 'bfp' AND st.last = true AND (NOT st.last OR st.net_fp = 'nfp') AND st.tpl IS NOT DISTINCT FROM 'rbt_1' AND st.whole IS NOT DISTINCT FROM true) AS ok",
    );
    expect(write({ tpl: null, whole: null })).toContain(
      "st.tpl IS NOT DISTINCT FROM NULL AND st.whole IS NOT DISTINCT FROM NULL",
    );
    // Целая ли охрана — тем же чтением, что и шаблон: HP на полном максимуме.
    expect(sql).toContain("(g.current_hp >= g.max_hp) AS whole");
    expect(sql).toContain("AS tpl, (SELECT whole FROM (SELECT g.boss_template_id AS tpl");
  });

  it("раненая охрана пропадает только с согласия игрока (видел строку в окне)", () => {
    expect(write()).toContain("AND (false OR st.whole IS NOT FALSE)");
    expect(write({ woundedOk: true, whole: false })).toContain(
      "AND (true OR st.whole IS NOT FALSE)",
    );
  });

  it("последний с товарами — только с подтверждением; захвата больше нет", () => {
    expect(write()).toContain(
      "WHERE NOT prior.was AND fresh.ok AND (false OR NOT st.last OR NOT st.has_net)",
    );
    expect(write({ confirm: true })).toContain("AND (true OR NOT st.last OR NOT st.has_net)");
    expect(write()).not.toContain("killed_by");
  });

  it("чужой — только без живой охраны (чьей угодно), под локом сети хозяина и своего рюкзака", () => {
    const sql = write({ account: "acc_t" });
    expect(sql.startsWith("SELECT pg_advisory_xact_lock(hashtext('chest:acc_o')) AS l;")).toBe(true);
    expect(sql).toContain(
      "EXISTS (SELECT 1 FROM yuplink.raid_mine_guard g WHERE g.map_id = 'rmap_x' AND g.q = 1 AND g.r = 2 AND g.killed_at IS NULL AND g.current_hp > 0) AS guarded",
    );
    expect(sql).toContain("AND (false OR NOT st.guarded)");
    expect(write()).toContain("AND (true OR NOT st.guarded)");
    // Снимается сундук хозяина, в рюкзак и журнал — снимающий.
    expect(sql).toContain("AND mc.owner_account = 'acc_o' AND mc.buried_at IS NULL RETURNING mc.map_id, mc.q, mc.r, mc.name");
    expect(sql).toContain("SELECT 'bp_' || substr(md5('chestpick:acc_t:op1' || ':' || x.k), 1, 20), 'h1', 'acc_t'");
    expect(sql).toContain("SELECT 'pku_' || md5('chestpick:acc_t:op1'), 'rmap_x', 1, 2, 'acc_o', 'acc_t'");
  });

  it("остаток — мешочком на клетке тем же оператором, только если сундук снят; id — от нажатия", () => {
    const sql = write({ bagged: true });
    expect(sql).toContain(
      "SELECT 'lb_' || md5('mcpick:chestpick:acc_o:op1'), d.map_id, d.q, d.r, now(), 'acc_o', 'chest', d.name, now() FROM del_ch d ON CONFLICT (id) DO NOTHING RETURNING id",
    );
    expect(sql).toContain('"n":2.5,"loot":2.5');
    expect(sql).toContain("0, 0, 0, LEAST(v.loot, v.n) FROM bag, jsonb_to_recordset(");
    expect(sql).toContain("(SELECT id FROM bag) AS bag_id");
    expect(write()).toContain("bag AS (SELECT NULL::text AS id WHERE false),");
  });

  it("снимается мой сундук и моя охрана, сеть — только у последнего", () => {
    const sql = write();
    expect(sql).toContain(
      "DELETE FROM yuplink.raid_magic_chest mc USING go WHERE mc.map_id = 'rmap_x' AND mc.q = 1 AND mc.r = 2 AND mc.owner_account = 'acc_o'",
    );
    expect(sql).toContain(
      "DELETE FROM yuplink.raid_mine_guard g USING del_ch WHERE g.map_id = 'rmap_x' AND g.q = 1 AND g.r = 2 AND g.owner_account = 'acc_o'",
    );
    expect(sql).toContain(
      "DELETE FROM yuplink.raid_chest_slot s USING del_ch, st WHERE s.account_id = 'acc_o' AND st.last",
    );
    // «Последний» — по всем картам: сеть одна на игрока.
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.raid_magic_chest oc WHERE oc.owner_account = 'acc_o' AND NOT (oc.map_id = 'rmap_x' AND oc.q = 1 AND oc.r = 2))",
    );
  });

  it("в рюкзак — ровно строки плана, метки по плану (все четыре), и только если сундук снят", () => {
    const sql = write();
    expect(sql).toContain('FROM del_ch, jsonb_to_recordset(\'[{"k":"custom:cst_mc"');
    expect(sql).toContain('"name":"O\'\'Chest"');
    expect(sql).toContain('"k":"custom:cst_ore","kind":"custom","ref":"cst_ore"');
    expect(sql).toContain('"qty":3,"loot":3');
    expect(sql).toContain(
      "count, mob_count, mine_count, field_count, loot_count) SELECT 'bp_' || substr(md5('chestpick:acc_o:op1' || ':' || x.k), 1, 20)",
    );
    expect(sql).toContain("x.image, x.qty, 0, 0, 0, x.loot FROM del_ch");
    expect(sql).toContain("qty numeric, loot numeric)");
    const old = "yuplink.raid_hero_backpack";
    expect(sql).toContain(`mob_count = LEAST(${old}.mob_count, ${old}.count) + EXCLUDED.mob_count`);
    expect(sql).toContain(
      `loot_count = (LEAST(${old}.mob_count + ${old}.mine_count + ${old}.field_count + ${old}.loot_count, ${old}.count) + EXCLUDED.mob_count + EXCLUDED.mine_count + EXCLUDED.field_count + EXCLUDED.loot_count)`,
    );
  });

  it("журнал и ключ нажатия — тем же оператором", () => {
    const sql = write();
    expect(sql).toContain(
      "SELECT 'pku_' || md5('chestpick:acc_o:op1'), 'rmap_x', 1, 2, 'acc_o', 'acc_o'",
    );
    expect(sql).toContain(
      "INSERT INTO yuplink.raid_backpack_op (op) SELECT 'chestpick:acc_o:op1' FROM del_ch",
    );
    expect(sql).toContain("WHERE op = 'chestpick:acc_o:op1') AS was");
  });
});

describe("снимок и журнал", () => {
  it("снимок считает отпечатки тем же выражением, что сверяет запись", () => {
    const snap = flat(pickupSnapSql(who));
    const fpBag =
      "(SELECT md5(COALESCE(string_agg(b.stack_key || '=' || b.count::text, ',' ORDER BY b.stack_key), '')) FROM yuplink.raid_hero_backpack b WHERE b.hero_id = 'h1' AND b.count > 0)";
    const fpNet =
      "(SELECT md5(COALESCE(string_agg(s.stack_key || '=' || s.count::text, ',' ORDER BY s.stack_key), '')) FROM yuplink.raid_chest_slot s WHERE s.account_id = 'acc_o' AND s.count > 0)";
    expect(snap).toContain(`${fpBag} AS bag_fp`);
    expect(snap).toContain(`${fpNet} AS net_fp`);
    expect(write()).toContain(`${fpBag} AS bag_fp, ${fpNet} AS net_fp`);
  });

  it("журнал нажатия — только снимающего и по ключу", () => {
    expect(flat(pickupDoneSql("acc_t", "chestpick:acc_t:op1"))).toContain(
      "WHERE p.id = 'pku_' || md5('chestpick:acc_t:op1') AND p.raider_account = 'acc_t'",
    );
  });
});
