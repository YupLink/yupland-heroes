import { describe, expect, it } from "vitest";
import { templateName } from "./spawnTemplate";

describe("templateName", () => {
  it("мобы по именам со счётом и радиус", () => {
    const names = new Map([
      ["wolf", "Волк"],
      ["bat", "Мышь"],
    ]);
    expect(
      templateName(
        3,
        [
          { mob: "wolf", count: 2 },
          { mob: "bat", count: 1 },
        ],
        names,
      ),
    ).toBe("Волк ×2, Мышь · r3");
  });
  it("не длиннее 60 знаков; незнакомый моб — по id", () => {
    const long = templateName(
      0,
      Array.from({ length: 10 }, () => ({ mob: "goblin_king", count: 9 })),
      new Map(),
    );
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long.startsWith("goblin_king ×9")).toBe(true);
  });
});
