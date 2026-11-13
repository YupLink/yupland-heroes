// Цена входа в цель на карте игрока (priceOnMap): на острове новичка — в 10 раз
// (island/energy), в мире — та же цель, тем же объектом. Через неё идут бой,
// подбор и карточка цели — показанное совпадает со списанным. Шаблон при этом
// не меняется: applyCellOverride может вернуть его же, и правка на месте
// задела бы другие карты.
import { describe, expect, it, vi } from "vitest";
import type { EncounterTarget } from "@/server/api/beta-raid/encounter-target";

vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: () => Promise.reject(new Error("тест не ходит в базу")),
}));

const { applyCellOverride, priceOnMap } = await import("@/server/api/beta-raid/cell-override");

const tpl = (interactionCost: number): EncounterTarget => ({
  kind: "boss",
  templateId: "boss:wolf",
  name: "Волк",
  imageUrl: null,
  backgroundUrl: "bg.png",
  badgeLabel: "Босс",
  maxHp: 100,
  interactionCost,
  rewardConfig: null,
  abilities: [],
  damage: null,
});

describe("priceOnMap", () => {
  it("мир — та же цель тем же объектом, цена прежняя", () => {
    const t = tpl(10);
    expect(priceOnMap(t, "rmap_world")).toBe(t);
  });

  it("остров — копия с ценой в 10 раз меньше, шаблон не тронут", () => {
    const t = tpl(10);
    const got = priceOnMap(t, "isle_abc");
    expect(got).not.toBe(t);
    expect(got.interactionCost).toBe(1);
    expect(got.maxHp).toBe(100);
    expect(t.interactionCost).toBe(10);
  });

  it("монетка за 1 → 0.1; даром — даром; 0.01 — не дешевле 0.01", () => {
    expect(priceOnMap(tpl(1), "isle_abc").interactionCost).toBe(0.1);
    expect(priceOnMap(tpl(0), "isle_abc").interactionCost).toBe(0);
    expect(priceOnMap(tpl(0.01), "isle_abc").interactionCost).toBe(0.01);
  });

  it("поверх переопределения клетки: её цена 7 → 0.7, а сам шаблон — 10", () => {
    const t = tpl(10);
    const cell = applyCellOverride(t, { interactionCost: 7 }, null);
    expect(priceOnMap(cell, "isle_abc").interactionCost).toBe(0.7);
    expect(priceOnMap(applyCellOverride(t, null, null), "isle_abc").interactionCost).toBe(1);
    expect(t.interactionCost).toBe(10);
  });
});
