// Артефакт по редкости в призах турнира: выбор детерминированный по ключу подарка.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const refs = [...sql.matchAll(/\('([^']+)', '(legendary|epic|rare|common)'\)/g)];
    return refs
      .filter((m) => m[2] !== "epic")
      .map((m) => ({ ref: m[1], id: `art_${m[2]}`, name: `Арт ${m[2]}`, image: null }));
  },
}));

const { resolveArtRarity, pickArtSql } = await import("./tour-art");
const gift = (ref: string, refId: string, kind = "art") =>
  ({
    accountId: "a",
    kind,
    amount: 1,
    refId,
    title: "Турнир «Урон»: 1 место",
    sourceRef: ref,
  }) as never;

describe("артефакт по редкости", () => {
  it("SQL: только активные артефакты этой редкости, порядок от ключа подарка", () => {
    const sql = pickArtSql([{ ref: "tour:t:1:0", rarity: "legendary" }]).replace(/\s+/g, " ");
    expect(sql).toContain("t.kind = 'artifact' AND t.active AND t.rarity = v.rarity");
    expect(sql).toContain("ORDER BY md5(v.ref || t.id) LIMIT 1");
  });

  it("редкость → конкретный артефакт; обычные призы не трогает; нет такой редкости — приз пропущен", async () => {
    const out = await resolveArtRarity([
      gift("r1", "rarity:legendary"),
      gift("r2", "gold", "resource"),
      gift("r3", "rarity:epic"),
      gift("r4", "artifact_fixed"),
    ]);
    expect(out.map((g) => g.refId)).toEqual(["art_legendary", "gold", "artifact_fixed"]);
  });
});
