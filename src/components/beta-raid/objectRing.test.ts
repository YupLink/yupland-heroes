import { describe, it, expect } from "vitest";
import { buildObjectRings, bossRing, RARITY_RING, RING_DEFAULT, RING_GREEN } from "./objectRing";

describe("ободок объекта на карте", () => {
  it("артефакт красится по редкости", () => {
    const rings = buildObjectRings({
      a: { kind: "artifact", rarity: "legendary" },
      b: { kind: "artifact", rarity: "rare" },
    });
    expect(rings.get("a")).toBe(RARITY_RING.legendary);
    expect(rings.get("b")).toBe(RARITY_RING.rare);
  });

  it("без редкости — прежний цвет, ничего не «пропадает»", () => {
    const rings = buildObjectRings({ c: { kind: "item", rarity: null } });
    expect(rings.get("c")).toBe(RING_DEFAULT);
  });

  it("босс — по уровню: 1–10 серый, 11–25 зелёный, 26–50 синий, 51–80 фиолетовый, 81–100 золотой", () => {
    expect(bossRing(1)).toBe(RARITY_RING.common);
    expect(bossRing(10)).toBe(RARITY_RING.common);
    expect(bossRing(11)).toBe(RING_GREEN);
    expect(bossRing(25)).toBe(RING_GREEN);
    expect(bossRing(26)).toBe(RARITY_RING.rare);
    expect(bossRing(50)).toBe(RARITY_RING.rare);
    expect(bossRing(51)).toBe(RARITY_RING.epic);
    expect(bossRing(80)).toBe(RARITY_RING.epic);
    expect(bossRing(81)).toBe(RARITY_RING.legendary);
    expect(bossRing(100)).toBe(RARITY_RING.legendary);
  });

  it("неизвестная редкость не роняет карту", () => {
    const rings = buildObjectRings({ d: { kind: "artifact", rarity: "мифический" } });
    expect(rings.get("d")).toBe(RING_DEFAULT);
  });
});
