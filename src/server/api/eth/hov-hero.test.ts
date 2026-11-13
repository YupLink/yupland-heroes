// Герой за NFT: из самого NFT — имя и портрет, раса по соответствию, редкость (Лириан —
// легендарный, остальные 90/10 редкий/эпический), специализация и способность случайные.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));

const { HOV_RACE, planHovHero, rollHovRarity } = await import("./hov-hero");
const { decodeString, wordToAddress } = await import("./rpc");
const { SPECIALIZATIONS } = await import("@/components/heroMeta");
const { HERO_ABILITY_IDS } = await import("@/lib/hero/heroAbilities");

const tok = (o: Partial<Parameters<typeof planHovHero>[0]> = {}) => ({
  heroName: "Kaelith Moonfang",
  nftRace: "Beastman",
  portrait: "/uploads/hov/hov-kaelith-moonfang.webp",
  lirian: false,
  ...o,
});

describe("rollHovRarity", () => {
  it("Лириан — легендарный при любом броске", () => {
    for (const r of [0, 0.05, 0.5, 0.99]) expect(rollHovRarity(true, () => r)).toBe("legendary");
  });
  it("остальные: бросок ниже 0,1 — эпический, иначе редкий", () => {
    expect(rollHovRarity(false, () => 0.05)).toBe("epic");
    expect(rollHovRarity(false, () => 0.1)).toBe("rare");
  });
  it("на 10 000 бросках эпических около 10 %", () => {
    let epic = 0;
    for (let i = 0; i < 10_000; i++) if (rollHovRarity(false) === "epic") epic++;
    expect(epic).toBeGreaterThan(800);
    expect(epic).toBeLessThan(1200);
  });
});

describe("planHovHero", () => {
  it("расы — по соответствию владельца", () => {
    expect(HOV_RACE).toEqual({
      Orc: "Кабан", Elf: "Единорог", Human: "Юпик", Demon: "Дракон", Beastman: "ДраКошка", Undead: "Пчела",
    });
  });
  it("имя и портрет — из NFT, спец и способность — из наших списков", () => {
    for (let i = 0; i < 50; i++) {
      const p = planHovHero(tok())!;
      expect(p.name).toBe("Kaelith Moonfang");
      expect(p.image).toBe("/uploads/hov/hov-kaelith-moonfang.webp");
      expect(p.race).toBe("ДраКошка");
      expect(SPECIALIZATIONS).toContain(p.spec);
      expect(HERO_ABILITY_IDS).toContain(p.ability);
    }
  });
  it("Лириан — легендарный; раса без соответствия — героя нет", () => {
    expect(planHovHero(tok({ heroName: "Lirian", lirian: true }))!.rarity).toBe("legendary");
    expect(planHovHero(tok({ nftRace: "Robot" }))).toBeNull();
  });
});

describe("ответы узла", () => {
  it("адрес из слова и строка из ABI", () => {
    expect(wordToAddress("0x000000000000000000000000ab12cd34ef56ab12cd34ef56ab12cd34ef56ab12")).toBe(
      "0xab12cd34ef56ab12cd34ef56ab12cd34ef56ab12",
    );
    const s =
      "0x0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000010" +
      "4865726f6573206f662056616c64697200000000000000000000000000000000";
    expect(decodeString(s)).toBe("Heroes of Valdir");
  });
});
