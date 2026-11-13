// Генератор (§8.122): массовый арт выпадает другим, уникальный и лабораторный — нет;
// уникальным делает только оператор с условием «копий нет».
import { describe, expect, it } from "vitest";
import { droppable, notCrafted } from "@/server/api/craft/crafted-sql";
import { markUniqueSql } from "./art-gen-unique";
import { artGenExtra } from "./art-gen-extra";
import { uniqueInput } from "./art-gen-api";

describe("droppable", () => {
  it("обычный шаблон или массовый арт генератора; уникальный и лаборатория — нет", () => {
    const s = droppable("t");
    expect(s).toContain(notCrafted("t"));
    expect(s).toContain("t.meta->>'crafted' = 'gen'");
    expect(s).toContain("coalesce(t.meta->>'unique', '') <> 'true'");
    expect(droppable()).toContain("meta->>'crafted' = 'gen'");
  });
});

describe("markUniqueSql", () => {
  const sql = markUniqueSql("art_ai_job1", "job1", "artgenu:art_ai_job1:try1", "acc_me");
  it("только арт генератора, ещё не уникальный, без копий кроме вещи создателя", () => {
    expect(sql).toContain(
      "jsonb_build_object('unique', true, 'unique_ref', 'artgenu:art_ai_job1:try1')",
    );
    expect(sql).toContain("t.meta->>'crafted' = 'gen'");
    // Повтор моста узнаёт свою отметку по метке попытки.
    expect(sql).toContain("OR t.meta->>'unique_ref' = 'artgenu:art_ai_job1:try1'");
    expect(sql).toContain("u.template_id = 'art_ai_job1' AND u.id <> 'ugi_craft_job1'");
    // Только свой арт: вещь создателя лежит у этого аккаунта (владелец 08.11).
    expect(sql).toContain("o.id = 'ugi_craft_job1' AND o.account_id = 'acc_me'");
    // Копии — и на карте, и на полках, и в аукционах, подарках, промокодах.
    for (const t of [
      "raid_map_cells",
      "raid_market_item",
      "yuplink.auction",
      "player_gift",
      "promo_code_line",
    ])
      expect(sql).toContain(t);
    expect(sql).toContain("RETURNING t.id");
  });
});

describe("artGenExtra", () => {
  const gold = { resource: "gold" as const, amount: 10 };
  it("недострой важнее ненастроенности", () => {
    expect(artGenExtra({ built: false, cellConfig: null }).reasonKey).toBe("artgen.unbuilt");
    expect(artGenExtra({ built: true, cellConfig: null }).reasonKey).toBe("artgen.not_set");
  });
  it("настроено и достроено — можно, цены едут в окно", () => {
    const x = artGenExtra({
      built: true,
      cellConfig: { artGen: { prices: { rare: [gold] }, unique: [gold] } },
    });
    expect(x.can).toBe(true);
    expect(x.prices.rare).toEqual([gold]);
    expect(x.unique).toEqual([gold]);
  });
});

describe("uniqueInput", () => {
  it("клиент шлёт клетку и задание — без ключа (жалоба 08.11: «op Required»)", () => {
    expect(uniqueInput.parse({ q: 1, r: 2, id: "abcdef123" })).toEqual({
      q: 1,
      r: 2,
      id: "abcdef123",
    });
    expect(() => uniqueInput.parse({ q: 1, r: 2 })).toThrow();
  });
});
