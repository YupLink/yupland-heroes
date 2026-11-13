// Список шагов для окна (25.10, пробный выпуск обучения): порядок — сервера,
// герой — сразу после приветствия, пропуск — без текущего шага.
import { describe, expect, it } from "vitest";
import { make } from "./island.fixture";
import { islandStepList } from "./stepList";
import { ISLAND_STEP_IDS } from "./steps";

describe("список шагов обучения", () => {
  const p = make(11).places;

  it("все шаги по порядку, герой — второй; вид, глава и цель", () => {
    const list = islandStepList(new Set(["hello"]), p);
    expect(list.map((s) => s.id)).toEqual([...ISLAND_STEP_IDS]);
    expect(list[1]).toMatchObject({ id: "hero_pick", kind: "fact", chapter: "map", current: true });
    expect(list.find((s) => s.id === "x_energy")).toMatchObject({ kind: "ack", chapter: "battle" });
    expect(list.find((s) => s.id === "chest")?.target).toEqual(p.chest);
    expect(list.filter((s) => s.current)).toHaveLength(1);
  });

  it("засчитанное в любом порядке — текущий первый незасчитанный", () => {
    const list = islandStepList(new Set(["hello", "hero_pick", "chop", "axe"]), p);
    expect(list.find((s) => s.current)?.id).toBe("walk");
    expect(list.find((s) => s.id === "chop")?.done).toBe(true);
  });

  it("пропуск: текущего нет, засчитанное остаётся", () => {
    const list = islandStepList(new Set(["hello", "hero_pick"]), p, true);
    expect(list.some((s) => s.current)).toBe(false);
    expect(list.filter((s) => s.done).map((s) => s.id)).toEqual(["hello", "hero_pick"]);
  });

  it("шаги старых островов (артефакт, пак с босса) — недоступны у новых", () => {
    const list = islandStepList(new Set(), p);
    for (const id of ["x_artifact", "art_take", "equip", "pack_boss"])
      expect(list.find((s) => s.id === id)?.available).toBe(false);
  });
});
