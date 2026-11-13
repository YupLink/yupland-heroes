// Зачарованные артефакты на аукционе (31.10.2026): своя группа в пикере, залог
// берёт ровно такие, зачарование взятых едет победителю.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { enchantNarrowSql, freeSql } from "../beta-raid/art-stock-sql";

const sqls: string[] = [];
let rows: unknown[] = [];
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    sqls.push(sql);
    return rows;
  },
}));
vi.mock("../beta-raid/art-memo", () => ({
  recallTaken: async () => [
    { id: "ugi_1", templateId: "tpl_a" },
    { id: "ugi_2", templateId: "tpl_a" },
  ],
}));

beforeEach(() => {
  sqls.length = 0;
  rows = [];
});

describe("условие зачарования", () => {
  it("не задано — любые; null — без зачарования; число — ровно с ним", () => {
    expect(enchantNarrowSql(undefined)).toBe("");
    expect(enchantNarrowSql(null)).toContain("NOT EXISTS (SELECT 1 FROM yuplink.item_enchant e");
    expect(enchantNarrowSql(12)).toContain("e.pct = 12");
    expect(enchantNarrowSql(-8)).toContain("e.pct = -8");
    expect(freeSql("acc", { templateId: "t" })).not.toContain("item_enchant");
    expect(freeSql("acc", { templateId: "t", enchantPct: null })).toContain("NOT EXISTS");
  });
});

describe("уникальный арт на аукцион не попадает (владелец 09.11)", () => {
  it("пикер и счёт лота отсекают уникальный арт генератора", async () => {
    const { listAuctionArts, freeAuctionArtCount } = await import("./lot-arts");
    await listAuctionArts("acc");
    await freeAuctionArtCount("acc", { templateId: "t", wear: 0, enchantPct: null });
    expect(sqls).toHaveLength(2);
    for (const s of sqls) expect(s).toContain("coalesce(t.meta->>'unique', '') <> 'true'");
  });
});

describe("lot-arts", () => {
  it("пикер: зачарование — часть группы", async () => {
    rows = [
      {
        templateId: "tpl_a",
        name: "Cape",
        imageUrl: null,
        rarity: "rare",
        count: "2",
        wear: 0,
        enchantPct: null,
      },
      {
        templateId: "tpl_a",
        name: "Cape",
        imageUrl: null,
        rarity: "rare",
        count: 1,
        wear: 0,
        enchantPct: "12",
      },
    ];
    const { listAuctionArts } = await import("./lot-arts");
    const got = await listAuctionArts("acc");
    expect(got.map((g) => [g.count, g.enchantPct])).toEqual([
      [2, null],
      [1, 12],
    ]);
    expect(sqls[0]).toContain("GROUP BY template_id, name, image_url, rarity, wear, pct");
  });

  it("залог: зачарования взятых экземпляров — по памятке, в её порядке", async () => {
    rows = [{ item_id: "ugi_2", pct: 12, spell_id: "sp_1", spell_name: "Сила" }];
    const { lotEnchants } = await import("./lot-arts");
    const got = await lotEnchants("art:gauclot:x#");
    expect(got).toEqual([{ pct: 12, spellId: "sp_1", spellName: "Сила" }]);
    expect(sqls.at(-1)).toContain("item_id IN ('ugi_1', 'ugi_2')");
  });
});
