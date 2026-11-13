import { describe, expect, it } from "vitest";
import { heroLabels, heroShortName, twinLabel } from "./news-heroes";

const h = (name: string) => ({ name, image: null });

describe("news-heroes", () => {
  it("heroShortName: имя до тире", () => {
    expect(heroShortName("Fedr - Stubborn Mage")).toBe("Fedr");
    expect(heroShortName("An — Sad Face")).toBe("An");
    expect(heroShortName("Om")).toBe("Om");
  });

  it("twinLabel: первый — имя, остальные — брат-близнец без номеров", () => {
    expect(twinLabel("Fedr", 0, "ru")).toBe("Fedr");
    expect(twinLabel("Fedr", 1, "ru")).toBe("Fedr, брат-близнец");
    expect(twinLabel("Fedr", 2, "ru")).toBe("Fedr, брат-близнец");
    expect(twinLabel("Fedr", 1, "en")).toBe("Fedr, twin");
  });

  it("heroLabels: один аккаунт — одна подпись, близнецы сначала у видимых мест", () => {
    const heroes = new Map([
      ["a", h("Fedr - Stubborn Mage")],
      ["b", h("Fedr - Stubborn Mage")],
      ["c", h("Momo - Copper Button")],
      ["d", h("Fedr - Stubborn Mage")],
    ]);
    const labels = heroLabels(
      [
        // Порядок базы: доски по алфавиту — darai раньше gold.
        { board: "darai", account_id: "d" },
        { board: "gold", account_id: "a" },
        { board: "gold", account_id: "c" },
        { board: "gold", account_id: "b" },
        { board: "steps", account_id: "b" },
        { board: "bogus", account_id: "x" },
      ],
      heroes,
      "ru",
    );
    expect(labels.get("a")).toBe("Fedr");
    expect(labels.get("b")).toBe("Fedr, брат-близнец");
    expect(labels.get("c")).toBe("Momo");
    expect(labels.get("d")).toBe("Fedr, брат-близнец");
    expect(labels.has("x")).toBe(false);
  });

  it("без героя — «Безымянный», и у них тоже близнецы", () => {
    const labels = heroLabels(
      [
        { board: "steps", account_id: "a" },
        { board: "steps", account_id: "b" },
      ],
      new Map(),
      "en",
    );
    expect([...labels.values()]).toEqual(["Nameless", "Nameless, twin"]);
  });
});
