// Поведение «Корона гречневого королевства» — только явным выбором админа: по
// имени постройки не угадываем (как казино).
import { describe, expect, it } from "vitest";
import { buildingEffect, cellBuildingEffect } from "./buildingEffect";

describe("поведение «Корона гречневого королевства»", () => {
  it("выбрано админом — работает", () => {
    expect(buildingEffect({ effect: "buckwheat" }, "Дом")).toBe("buckwheat");
    expect(cellBuildingEffect({ effect: "buckwheat" }, null, "Склад")).toBe("buckwheat");
  });
  it("по имени не угадывается", () => {
    expect(buildingEffect(null, "Гречневое королевство")).toBeNull();
  });
});
