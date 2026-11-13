// Корабли под синим динамитом (§8.75а, 26.10.2026) без базы: разбор итога, кого из
// экипажа ещё нести, SQL «застрял на обломках», отметок ключа и обхода. И миграция
// dynamite-05: корабли клетки рушит только синий, экипаж — в итог и crew_due.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  crewDoneSql,
  crewDueSql,
  crewToHome,
  homedOf,
  homedSql,
  shipsOf,
  strandedSql,
} from "./dynamite-ships";

const flat = (s: string) => s.replace(/\s+/g, " ");

describe("итог и экипаж", () => {
  it("корабли из итога; мусор — мимо; вид по умолчанию малый", () => {
    expect(
      shipsOf([
        { id: "ship_a", kind: "big", crew: "acc_a" },
        { id: "ship_b", kind: "x", crew: null },
        null,
        7,
      ]),
    ).toEqual([
      { id: "ship_a", kind: "big", crew: "acc_a" },
      { id: "ship_b", kind: "small", crew: null },
    ]);
    expect(shipsOf(undefined)).toEqual([]);
    expect(homedOf(["acc_a", 5, ""])).toEqual(["acc_a"]);
    expect(homedOf("acc_a")).toEqual([]);
  });

  it("нести — экипаж без отметки, без повторов; пустые корабли — никого", () => {
    const ships = [
      { id: "1", kind: "big" as const, crew: "acc_a" },
      { id: "2", kind: "small" as const, crew: null },
      { id: "3", kind: "small" as const, crew: "acc_b" },
      { id: "4", kind: "small" as const, crew: "acc_b" },
    ];
    expect(crewToHome({ ships, homed: [] })).toEqual(["acc_a", "acc_b"]);
    expect(crewToHome({ ships, homed: ["acc_a"] })).toEqual(["acc_b"]);
    expect(crewToHome({ ships: [ships[1]], homed: [] })).toEqual([]);
  });
});

describe("SQL ключа нажатия", () => {
  it("застрял: стоит на клетке взрыва этой карты (пустая карта — главный мир) и не в лодке", () => {
    const sql = flat(strandedSql("acc_o'k", "rmap_1", { q: 3, r: -2 }));
    expect(sql).toContain("p.account_id = 'acc_o''k' AND p.q = 3 AND p.r = -2");
    expect(sql).toContain("st.key = 'beta_raid_map')) = 'rmap_1'");
    expect(sql).toContain(
      "AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s WHERE s.crew_account = 'acc_o''k')",
    );
  });

  it("отметка «отнесён» — без задвоения; ключ снимается флагом; обход — не свежие и не старые", () => {
    const homed = flat(homedSql("dyn:acc_me:op", "acc_a"));
    expect(homed).toContain("jsonb_set(detail, '{homed}', (COALESCE(detail->'homed', '[]'::jsonb)");
    expect(homed).toContain("- 'acc_a') || to_jsonb('acc_a'::text)) WHERE op = 'dyn:acc_me:op';");
    expect(flat(crewDoneSql("dyn:x"))).toBe(
      "UPDATE yuplink.raid_dynamite_op SET crew_due = false WHERE op = 'dyn:x' AND crew_due;",
    );
    const due = flat(crewDueSql());
    expect(due).toContain("WHERE o.crew_due AND o.created_at < now() - interval '30 seconds'");
    expect(due).toContain("o.created_at > now() - interval '2 days'");
  });
});

describe("миграция dynamite-05", () => {
  const sql = flat(readFileSync("migrations/dynamite-05-ships.sql", "utf8"));
  const blast = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION yuplink.raid_dynamite_blast("));
  const at = (s: string) => blast.indexOf(s);

  it("одна транзакция, короткий лок, повтор безвреден", () => {
    expect(sql).toMatch(/BEGIN; SET LOCAL lock_timeout = '5s';.*COMMIT; $/);
    expect(sql).toContain(
      "ALTER TABLE yuplink.raid_dynamite_op ADD COLUMN IF NOT EXISTS crew_due boolean NOT NULL DEFAULT false;",
    );
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS raid_dynamite_op_crew_due_idx ON yuplink.raid_dynamite_op (created_at) WHERE crew_due;",
    );
    expect(sql).not.toMatch(/DROP (TABLE|FUNCTION)/);
  });

  it("только синий: все корабли клетки — hp 0, без экипажа, штамп; после локов и штуки", () => {
    const block = blast.slice(at("IF p_kind = 'blue' THEN FOR r_s IN"), at("-- 1) Шахты"));
    expect(block).toContain("WHERE s.map_id = p_map AND s.q = p_q AND s.r = p_r");
    expect(block).toContain("FOR UPDATE OF s");
    expect(block).toContain(
      "SET hp = 0, hp_zero_at = COALESCE(su.hp_zero_at, now()), crew_account = NULL, crew_wallet = NULL",
    );
    expect(block).toContain("'id', r_s.id, 'kind', r_s.kind, 'crew', r_s.crew_account");
    expect(at("'mine:'")).toBeLessThan(at("FOR r_s IN"));
    expect(at("PERFORM yuplink.energy_touch_acc(p_account, p_cost)")).toBeLessThan(
      at("FOR r_s IN"),
    );
    // Красный корабли не трогает: больше нигде корабли не пишутся.
    expect(blast.split("UPDATE yuplink.beta_raid_ship").length).toBe(2);
  });

  it("итог с кораблями, ключ ждёт экипаж; прежнее поведение на месте", () => {
    expect(blast).toContain("'kind', p_kind, 'blue', v_blue, 'ships', v_ships);");
    expect(blast).toContain(
      "INSERT INTO yuplink.raid_dynamite_op (op, account_id, map_id, q, r, detail, crew_due) VALUES (p_op, p_account, p_map, p_q, p_r, v_res, v_crew);",
    );
    expect(blast).toContain("RETURN v_prev || jsonb_build_object('was', true)");
    expect(blast).toContain("v_hit := yuplink.raid_dynamite_blue_mine(p_map, r_m.q, r_m.r);");
    expect(blast).toContain("AND dr.placed_at IS NOT NULL AND dr.under_decor IS NOT NULL;");
  });
});
