// Артефакт в мешочке (§8.73 п. 4): «Забрать» — в инвентарь (не в рюкзак), тот же id и износ,
// одним оператором под локом мешочка; повтор ключа второй раз не берёт; сгоревшая порция —
// артефакт сгорает (снимок убирает обход). Живой прогон — на проде с откатом.
import { describe, expect, it } from "vitest";
import { bagArtOf } from "@/lib/lootBag";
import { burnArtSql, takeArtSql } from "./bag-take-art-sql";
import { isArtStack } from "./bag-take-art";

const sql = takeArtSql({
  bagId: "lb_1",
  stackKey: "art:ugi_A",
  itemId: "ugi_A",
  op: "bagtake:acc1:p1:art:ugi_A",
  account: "acc1",
  wallet: "w1.near",
});

describe("артефакт в мешочке", () => {
  it("стопка art:<id> — артефакт; прочие — нет", () => {
    expect(bagArtOf("art:ugi_A")).toBe("ugi_A");
    expect(bagArtOf("art:")).toBeNull();
    expect(bagArtOf("resource:gold")).toBeNull();
    expect(isArtStack({ stackKey: "art:ugi_A" })).toBe(true);
    expect(isArtStack({ stackKey: "custom:cst_1" })).toBe(false);
  });

  it("лок мешочка до WITH; живая незакопанная порция; повтор ключа — ничего", () => {
    expect(sql.indexOf("lootbag:lb_1")).toBeLessThan(sql.indexOf("WITH prior"));
    expect(sql).toContain("b.buried_at IS NULL AND NOT EXISTS (SELECT 1 FROM prior)");
  });

  it("снимок → строка инвентаря забравшего с прежним износом, без ON CONFLICT", () => {
    expect(sql).toContain("DELETE FROM yuplink.raid_loot_bag_art a");
    expect(sql).toContain("SELECT r.id, 'w1.near', r.template_id, r.kind, 'loot_bag', now(), 'acc1', r.wear");
    expect(sql).not.toContain("ON CONFLICT");
    expect(sql).toContain("'take', 'art:ugi_A', 1, 'done' FROM ins");
  });

  it("сгорание — только снимок без живой порции и не свежий", () => {
    const burn = burnArtSql();
    expect(burn).toContain("a.created_at < now() - interval '5 minutes'");
    expect(burn).toContain("i.stack_key = 'art:' || a.item_id");
  });
});
