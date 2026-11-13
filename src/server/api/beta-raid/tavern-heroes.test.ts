// Таверна на карте будит КОПИЮ спящего героя (heroes-wake с 22.10 принимает id
// копии): шаблон вместо копии давал «Это не твой герой» любому спящему — в том
// числе купленному на рынке (жалоба 23.10). Старый клиент шлёт шаблон — берём
// первую спящую копию этого шаблона.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({
  woke: [] as string[],
  dormant: [] as Array<{ itemId: string; templateId: string }>,
}));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("../heroes-list-dormant", () => ({ listDormantHeroes: async () => st.dormant }));
vi.mock("../heroes-wake", () => ({
  wakeHeroInstance: async (_w: string, acc: string, itemId: string) => {
    st.woke.push(`${acc}:${itemId}`);
    return `hero_of_${itemId}`;
  },
}));

const { tavernHeroInstanceId } = await import("./tavern-heroes");

beforeEach(() => {
  st.woke = [];
  st.dormant = [
    { itemId: "ugi_2", templateId: "tpl_boar_mage" },
    { itemId: "ugi_3", templateId: "tpl_boar_mage" },
  ];
});

describe("tavernHeroInstanceId", () => {
  it("герой с экземпляром — как есть, без пробуждения", async () => {
    expect(await tavernHeroInstanceId("w", "hero_1", undefined)).toBe("hero_1");
    expect(st.woke).toEqual([]);
  });

  it("спящий — будим ровно выбранную копию", async () => {
    expect(await tavernHeroInstanceId("w", undefined, "tpl_boar_mage", "ugi_3")).toBe(
      "hero_of_ugi_3",
    );
    expect(st.woke).toEqual(["acc1:ugi_3"]);
  });

  it("старый клиент (только шаблон) — первая спящая копия шаблона, а не шаблон", async () => {
    expect(await tavernHeroInstanceId("w", undefined, "tpl_boar_mage")).toBe("hero_of_ugi_2");
    expect(st.woke).toEqual(["acc1:ugi_2"]);
  });

  it("спящей копии шаблона нет — «не твой герой», ничего не будим", async () => {
    await expect(tavernHeroInstanceId("w", undefined, "tpl_other")).rejects.toThrow(
      "Это не твой герой",
    );
    await expect(tavernHeroInstanceId("w", undefined, undefined)).rejects.toThrow(
      "Не выбран герой",
    );
    expect(st.woke).toEqual([]);
  });
});
