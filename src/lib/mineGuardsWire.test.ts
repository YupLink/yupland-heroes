import { describe, expect, it } from "vitest";
import { packGuards, unpackGuards } from "./mineGuardsWire";

describe("охрана шахт по проводу", () => {
  it("виды без повторов, обратно — то же самое", () => {
    const g = { templateId: "boss_1", image: "/a.png", name: "Страж" };
    const guards = {
      "1,2": g,
      "3,4": { ...g },
      "5,6": { templateId: "boss_2", image: null, name: "Тень" },
    };
    const w = packGuards(guards);
    expect(w.kinds).toHaveLength(2);
    expect(unpackGuards(w)).toEqual(guards);
  });
  it("порядок ключей не меняет упаковку (версия стабильна)", () => {
    const a = { templateId: "t", image: null, name: "n" };
    expect(JSON.stringify(packGuards({ "1,1": a, "2,2": a }))).toBe(
      JSON.stringify(packGuards({ "2,2": a, "1,1": a })),
    );
  });
});
