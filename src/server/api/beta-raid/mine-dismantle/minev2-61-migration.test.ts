// minev2-61: ресурсы разборки — сразу на счёт разобравшего (res_move вида
// 'mine_dismantle', ключ '<нажатие>:<ресурс>'), мешочек — только товарам; всё
// прочее — тело с прода (minecap-01): локи, повтор ключа, поломка «разобрали»,
// энергия до клетки. Динамит зовёт с '[]' — ни ресурсов, ни мешочка. Вид в
// сводке — «прочее», не доход шахты (турниры его не считают).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { groupOfKind } from "@/server/api/beta-raid/econ/kinds";
import { dismantledOf, gotOf } from "@/server/api/beta-raid/mine-dismantle/mine-dismantle-sql";

const read = (f: string) =>
  readFileSync(new URL(`../../../../../migrations/${f}`, import.meta.url), "utf8").replace(
    /\s+/g,
    " ",
  );
const flat = read("minev2-61-dismantle-balance.sql");
const prod = read("minecap-01-pending-claim.sql");
const fnOf = (sql: string) => {
  const from = sql.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_mine_dismantle(");
  return sql.slice(from, sql.indexOf("END $fn$;", from));
};
const body = fnOf(flat);
const at = (s: string) => body.indexOf(s);

describe("minev2-61-dismantle-balance", () => {
  it("транзакция, короткий лок; сигнатура прежняя — повтор безвреден", () => {
    expect(flat).toMatch(/^.*BEGIN; SET LOCAL lock_timeout = '5s';/);
    expect(flat.trim().endsWith("COMMIT;")).toBe(true);
    const sig = (b: string) => b.slice(0, b.indexOf("RETURNS"));
    expect(sig(body)).toBe(sig(fnOf(prod)));
  });

  it("прежнее с прода на месте: локи, повтор ключа, поломка «разобрали», энергия", () => {
    for (const s of [
      "'godmove:'",
      "RETURN v_prev || jsonb_build_object('was', true)",
      "RAISE EXCEPTION 'mine_working'",
      "SET kind = 'dismantle'",
      "PERFORM yuplink.energy_touch_acc(p_account, p_cost)",
      "SET group_id = NULL, icon_scale = NULL",
      "VALUES (p_op, 'dismantle', p_map, p_q, p_r, p_account, v_res)",
    ]) {
      expect(body).toContain(s);
    }
  });

  it("ресурсы — на счёт разобравшего: вид mine_dismantle, ключ на ресурс, до 0,0001", () => {
    expect(body).toContain(
      "yuplink.res_move(p_account, r_it.res, r_it.n, 'mine_dismantle', p_op || ':' || r_it.res)",
    );
    expect(body).toContain(
      "WHERE v.kind = 'resource' AND v.ref IN ('wood', 'stone', 'gold', 'diamonds') AND v.n > 0",
    );
    expect(body).toContain("sum(trunc(v.n, 4))");
    // Сначала плата и пустая клетка, потом начисление.
    const credit = at("yuplink.res_move(");
    expect(credit).toBeGreaterThan(at("PERFORM yuplink.energy_touch_acc"));
    expect(credit).toBeGreaterThan(at("UPDATE yuplink.raid_maps SET edit_seq"));
    expect(credit).toBeLessThan(at("INSERT INTO yuplink.raid_mine_op"));
    expect(body).toContain("'got', v_got");
  });

  it("мешочек — только товарам; лок мешочка до лока счёта (как у «Забрать»)", () => {
    expect(body).toContain("WHERE e->>'kind' = 'custom'");
    expect(body).toContain("FROM jsonb_to_recordset(v_goods)");
    expect(body).not.toContain("FROM jsonb_to_recordset(p_items)");
    expect(at("'lootbag:'")).toBeLessThan(at("yuplink.res_move("));
  });

  it("динамит и посаженное зовут разборку с '[]' — ничего не начислится", () => {
    const call =
      "PERFORM yuplink.raid_mine_dismantle(v_dop, p_map, r_m.q, r_m.r, p_account, 0::numeric, '[]'::jsonb, NULL::text)";
    expect(read("dynamite-01-blast.sql")).toContain(call);
    expect(read("decor-05-planted-hold.sql")).toContain(call);
  });

  it("сводка: mine_dismantle — «прочее» (как bag_take), не доход шахты", () => {
    expect(groupOfKind("res", "mine_dismantle", "mdis:acc:op:wood")).toBe("other");
    expect(groupOfKind("res", "bag_take", "bagtake:acc:op:resource:wood")).toBe("other");
  });
});

describe("ответ: got", () => {
  it("только ресурсы v2 и положительные числа", () => {
    expect(gotOf({ wood: 90, stone: "15", gold: 0, dust: 5, diamonds: -1 })).toEqual({
      wood: 90,
      stone: 15,
    });
    expect(gotOf(null)).toEqual({});
  });

  it("detail до minev2-61 — got пустой; строкой — разбирается", () => {
    expect(dismantledOf({ bag: "lb_x", paid: 100 })?.got).toEqual({});
    expect(dismantledOf('{"bag":null,"got":{"gold":45},"paid":100}')).toMatchObject({
      bag: null,
      got: { gold: 45 },
      paid: 100,
    });
  });
});
