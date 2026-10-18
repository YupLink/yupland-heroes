import { describe, expect, it } from "vitest";
import { buildingEffect, cellBuildingEffect } from "./buildingEffect";
import { isPawnBuyout } from "@/server/api/beta-raid/market-pawn";

describe("казино и ломбард", () => {
  it("постройка с именем «Казино» сама получает поведение казино", () => {
    expect(buildingEffect(null, "Казино")).toBe("casino");
    expect(buildingEffect(null, "Казино 2")).toBe("casino");
    expect(buildingEffect({ effect: "casino" }, "Дом")).toBe("casino");
    // Админ сознательно выбрал «ничего» — имя не смотрим.
    expect(buildingEffect({ effect: "" }, "Казино")).toBeNull();
    expect(cellBuildingEffect({ effect: "casino" }, null, "Склад")).toBe("casino");
  });

  it("перепродажа с наценкой — только у скупки «Любой … артефакт»", () => {
    expect(isPawnBuyout({ side: "sell", kind: "art", refId: "art_any_rare" })).toBe(true);
    expect(isPawnBuyout({ side: "buy", kind: "art", refId: "art_any_rare" })).toBe(false);
    expect(isPawnBuyout({ side: "sell", kind: "art", refId: "tpl_sword" })).toBe(false);
    expect(isPawnBuyout({ side: "sell", kind: "custom", refId: null })).toBe(false);
  });
});
