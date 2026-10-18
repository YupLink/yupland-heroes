// Строка «что это за герой» на лоте: раса · спец · способность (§8.52).
import { describe, expect, it } from "vitest";
import { prizeInfoText, type PrizeInfo } from "./auctionFormat";

const hero = (p: Partial<PrizeInfo>): PrizeInfo => ({
  rarity: "legendary",
  race: "Юпик",
  spec: "Путешественник",
  level: 5,
  slot: null,
  statType: null,
  statAmount: null,
  ...p,
});

describe("prizeInfoText — герой", () => {
  it("со способностью — она третьей, на языке игрока", () => {
    expect(prizeInfoText("hero", hero({ ability: "fisher" }), false)).toBe(
      "Юпик · Путешественник · Рыбак",
    );
    expect(prizeInfoText("hero", hero({ ability: "fisher" }), true)).toBe(
      "Юпик · Путешественник · Fisherman",
    );
  });

  it("без способности или с чужим словом — как раньше", () => {
    expect(prizeInfoText("hero", hero({}), false)).toBe("Юпик · Путешественник");
    expect(prizeInfoText("hero", hero({ ability: "god" }), false)).toBe("Юпик · Путешественник");
  });
});
