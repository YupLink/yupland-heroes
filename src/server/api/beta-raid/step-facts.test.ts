// Почему на клетку нельзя: декор держит только «живой» и непроходимый
// (decorBlocksSql уже решил), объект — только живой И существующий.
// Тестов на stepBlockedReason не было вовсе; правило про мёртвые ссылки
// (декор 20.09, объекты раньше) закрепляем таблицей.
import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ sql: "", rows: [] as unknown[] }));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => ((db.sql = sql), db.rows),
}));

import { loadStepFacts, stepBlockedReason, type StepFacts } from "./step-facts";
import { mineCellSql } from "./mine-cell-sql";

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
  mine: false,
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

  it("шахта — стена для всех (§8.59 п. 9): отказ ключом словаря", () => {
    expect(stepBlockedReason({ ...base, mine: true }, "w")).toBe("braid.mine_blocked");
    // Не зависит от того, кто идёт: в отличие от купола, обхода нет ни у кого.
    expect(stepBlockedReason({ ...base, mine: true }, null)).toBe("braid.mine_blocked");
  });

  it("сойти С шахты можно: решает только целевая клетка", () => {
    // Факты описывают клетку, КУДА шагают; клетка под ногами в них не участвует.
    expect(stepBlockedReason(base, "w")).toBeNull();
  });

  it("порядок отказов: местность → туман → декор → шахта → объект", () => {
    const wall = {
      ...base,
      decorationBlocks: true,
      mine: true,
      objectId: "chest:a",
      objectKnown: true,
    };
    expect(stepBlockedReason(wall, "w")).toMatch(/преграда/);
    expect(stepBlockedReason({ ...wall, decorationBlocks: false }, "w")).toBe("braid.mine_blocked");
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

  it("loadStepFacts спрашивает шахту тем же признаком (mineCellSql) и отдаёт флаг", async () => {
    db.rows = [{ terrain_id: "t", cost: 1, mine: true }];
    expect((await loadStepFacts("m", 1, 2))?.mine).toBe(true);
    expect(db.sql).toContain(`${mineCellSql("c")} AS mine`);
    db.rows = [{ terrain_id: "t", cost: 1, mine: null }];
    expect((await loadStepFacts("m", 1, 2))?.mine).toBe(false);
  });
});
