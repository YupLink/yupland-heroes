// Почему на клетку нельзя: декор держит только «живой» и непроходимый
// (decorBlocksSql уже решил), объект — только живой И существующий.
// Тестов на stepBlockedReason не было вовсе; правило про мёртвые ссылки
// (декор 20.09, объекты раньше) закрепляем таблицей.
import { describe, expect, it } from "vitest";
import { stepBlockedReason, type StepFacts } from "./step-facts";

const base: StepFacts = {
  terrainId: "terrain_x",
  decorationId: null,
  decorationBlocks: false,
  objectId: null,
  objectKnown: false,
  voidFog: false,
  hpFound: false,
  hpValue: null,
  water: false,
  ocean: false,
  cost: 1,
  berth: null,
  gate: null,
};

describe("step-facts.stepBlockedReason", () => {
  it("нет клетки или местности — нельзя", () => {
    expect(stepBlockedReason(null, "w")).toMatch(/нет местности/);
    expect(stepBlockedReason({ ...base, terrainId: null }, "w")).toMatch(/нет местности/);
  });

  it("мёртвая ссылка декора (шаблон удалён) клетку не держит", () => {
    const facts = { ...base, decorationId: "decoration_rHEmoXdaUy", decorationBlocks: false };
    expect(stepBlockedReason(facts, "w")).toBeNull();
  });

  it("живой непроходимый декор — преграда", () => {
    const facts = { ...base, decorationId: "decoration_tree", decorationBlocks: true };
    expect(stepBlockedReason(facts, "w")).toMatch(/преграда/);
  });

  it("проходимая табличка (meta.walkable) — можно", () => {
    const facts = { ...base, decorationId: "decoration_sign", decorationBlocks: false };
    expect(stepBlockedReason(facts, "w")).toBeNull();
  });

  it("объект: живой и существующий держит, мёртвая ссылка — нет", () => {
    const alive = { ...base, objectId: "chest:a", objectKnown: true };
    expect(stepBlockedReason(alive, "w")).toMatch(/Объект блокирует/);
    const dead = { ...alive, objectKnown: false };
    expect(stepBlockedReason(dead, "w")).toBeNull();
    const defeated = { ...alive, hpFound: true, hpValue: 0 };
    expect(stepBlockedReason(defeated, "w")).toBeNull();
  });

  it("порядок отказов: местность → туман → декор → объект", () => {
    const all = {
      ...base,
      voidFog: true,
      decorationId: "d",
      decorationBlocks: true,
      objectId: "chest:a",
      objectKnown: true,
    };
    expect(stepBlockedReason(all, "w")).toBe("braid.void_blocked");
    expect(stepBlockedReason({ ...all, voidFog: false }, "w")).toMatch(/преграда/);
  });
});
