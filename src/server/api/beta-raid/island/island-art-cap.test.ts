// Потолок артефактов острова: 20 у игрока — с босса не падает; сдача фишек — одна команда.
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/secureRandom", () => ({ secureRandomInt: () => 0 })); // каждый шанс «выпал»
vi.mock("../art-rarity", () => ({ pickArtTemplateByRarity: async () => ({ id: "art_common_1" }) }));
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: async () => [] }));

const { islandDropsFor, artFullSql } = await import("./island-drops");
const { consumeSql } = await import("./training-sale");

describe("потолок артефактов", () => {
  it("меньше 20 — артефакт падает; 20 и больше — нет, прочее как было", async () => {
    expect((await islandDropsFor(false)).some((d) => d.kind === "item")).toBe(true);
    const full = await islandDropsFor(false, true);
    expect(full.some((d) => d.kind === "item")).toBe(false);
    expect(full.some((d) => d.kind === "likes")).toBe(true);
  });

  it("считаются и незабранные в «Добыче» острова", () => {
    const sql = artFullSql(["acc_A"]);
    expect(sql).toContain("u.kind = 'artifact'");
    expect(sql).toContain("w.claimed_at IS NULL");
    expect(sql).toContain(">= 20");
  });
});

describe("сдача тренировочных фишек — SQL", () => {
  it("десятка сильнейших не трогается, гасятся слабейшие, повтор — мимо погашенных", () => {
    const sql = consumeSql("acc_A", 3);
    expect(sql).toContain("rn > 10");
    expect(sql).toContain("ORDER BY r.star ASC");
    expect(sql.trimStart().startsWith("UPDATE")).toBe(true);
    expect(sql).toContain("LIMIT 3");
    expect(sql).toContain("t.consumed_at IS NULL");
  });
});
