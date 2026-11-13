// Текст запросов лавки зачарования: итог одним утверждением, разрушение снимает
// артефакт со ВСЕХ героев аккаунта, заявка держит «одну попытку на предмет».
// Сам SQL прогнан пробой с откатом (scratchpad batch29/dry-enchant-01.sql).
import { describe, expect, it } from "vitest";
import type { EnchantSpell } from "@/lib/enchant/enchant";
import { finishGoneSql, finishNoneSql, finishOkSql } from "./enchant-finish-sql";
import { artifactsSql, attemptClaimSql, enchantPctSql, saveSpellsSql } from "./enchant-sql";
import { freeCopiesSql } from "@/server/api/heroes-gear-copies";

const f = { account: "acc_me", op: "op_000001", itemId: "it_1", result: { outcome: "x" } };
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("итог попытки", () => {
  it("разрушение: удаляет свой незачарованный экземпляр и снимает его с героев аккаунта", () => {
    const sql = flat(finishGoneSql(f));
    expect(sql).toContain(
      "DELETE FROM yuplink.user_game_item u WHERE u.id = 'it_1' AND u.account_id = 'acc_me' AND u.kind = 'artifact'",
    );
    expect(sql).toContain("UPDATE yuplink.hero_instance h SET equipped = COALESCE((");
    expect(sql).toContain("WHERE x.value <> 'it_1'");
    expect(sql).toContain("WHERE h.account_id = 'acc_me' AND EXISTS (SELECT 1 FROM del)");
    expect(sql).toContain("outcome = 'gone'");
    // Итог пишется только если предмет реально удалён.
    expect(sql).toContain("AND a.status = 'pending' AND EXISTS (SELECT 1 FROM del)");
  });

  it("успех: пометка с ключом на item_id — второе зачарование не встанет", () => {
    const sql = flat(finishOkSql({ ...f, pct: 15, spellId: "ench_1", spellName: "Огонь" }));
    expect(sql).toContain(
      "INSERT INTO yuplink.item_enchant (item_id, account_id, pct, spell_id, spell_name, op_ref)",
    );
    expect(sql).toContain("ON CONFLICT (item_id) DO NOTHING");
    expect(sql).toContain(
      "NOT EXISTS (SELECT 1 FROM yuplink.item_enchant e WHERE e.item_id = u.id)",
    );
    expect(sql).toContain("outcome = 'ok', pct = 15");
  });

  it("без изменений: только итог, если предмет свой и на месте", () => {
    const sql = flat(finishNoneSql(f));
    expect(sql).not.toMatch(/DELETE|INSERT/);
    expect(sql).toContain("outcome = 'none'");
    expect(sql).toContain("EXISTS (SELECT 1 FROM it)");
  });
});

describe("заявка и чтение", () => {
  const spell = { id: "ench_1" } as EnchantSpell;
  it("заявка: ключ аккаунт+opId, конфликт — ничего (повтор или предмет занят)", () => {
    const sql = flat(
      attemptClaimSql({
        account: "acc_me",
        op: "op_000001",
        itemId: "it_1",
        templateId: "art_1",
        mapId: "m1",
        q: 1,
        r: 2,
        spell,
        steps: 2,
        cost: [{ kind: "resource", code: "gold", amount: 130 }],
      }),
    );
    expect(sql).toContain("VALUES ('acc_me', 'op_000001', 'it_1', 'art_1'");
    expect(sql).toContain("ON CONFLICT DO NOTHING");
    expect(sql).toContain("'pending'");
  });

  it("процент зачарования читается подзапросом по экземпляру", () => {
    expect(enchantPctSql("a")).toBe(
      "(SELECT e.pct FROM yuplink.item_enchant e WHERE e.item_id = a.id)::float8",
    );
    expect(flat(artifactsSql("acc_me", "it_1"))).toContain("AND u.id = 'it_1'");
  });

  it("копия для «надеть» — той же прочности и того же зачарования", () => {
    const sql = freeCopiesSql("acc_me", "hero_main", { ring: "it_1" }) ?? "";
    expect(sql).toContain(`${enchantPctSql("f")} IS NOT DISTINCT FROM ${enchantPctSql("u")}`);
  });

  it("сохранение — только строки этой клетки; пустой список удаляет всё", () => {
    expect(flat(saveSpellsSql("m1", 1, 2, []))).toBe(
      "DELETE FROM yuplink.raid_enchant_spell WHERE map_id = 'm1' AND q = 1 AND r = 2;",
    );
    const sql = flat(
      saveSpellsSql("m1", 1, 2, [{ ...spell, name: "Огонь", cost: [], fx: {} } as never]),
    );
    expect(sql).toContain("AND id NOT IN ('ench_1')");
    expect(sql).toContain("WHERE yuplink.raid_enchant_spell.map_id = EXCLUDED.map_id");
  });
});
