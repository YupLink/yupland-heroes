// Отряд удара (владелец, 24.10.2026): «если фишки не выбраны — выбирать автоматически самые
// сильные». Не выбраны или ни одной из выбранных нет в строю — 10 старших по уровню (поле +
// запас), признак auto; выбранные есть — бьются они, недостающих добирают до их числа.
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ owned: [] as Array<{ id: string; template_id: string; level: number; name: string }> }));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => st.owned }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc1" }));
vi.mock("../heroes-squad", () => ({
  heroSquadBattlesEnabled: async () => false,
  selectedHeroSquad: async () => [],
}));

const { resolveLineupInfo, AUTO_LINEUP } = await import("./encounter-lineup");

/** Инвентарь, как отдаёт база: по уровню сверху вниз. */
const inv = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${i}`, template_id: `t${i}`, level: 20 - i, name: `F${i}` }));

beforeEach(() => {
  st.owned = inv(14);
});

describe("resolveLineupInfo", () => {
  it("фишки не выбраны — 10 самых сильных, auto", async () => {
    const r = await resolveLineupInfo("w", []);
    expect(AUTO_LINEUP).toBe(10);
    expect(r.auto).toBe(true);
    expect(r.lineup.map((c) => c.level)).toEqual([20, 19, 18, 17, 16, 15, 14, 13, 12, 11]);
    expect(r.lineup.every((c) => !!c.chipId)).toBe(true);
  });

  it("ни одной из выбранных нет в строю (чужой/старый состав) — как «не выбраны»", async () => {
    const r = await resolveLineupInfo("w", [{ templateId: "gone", level: 99 }]);
    expect(r.auto).toBe(true);
    expect(r.lineup).toHaveLength(10);
  });

  it("выбранные есть — бьются они; недостающих добирают до их числа, не auto", async () => {
    const r = await resolveLineupInfo("w", [
      { templateId: "t5", level: 15 },
      { templateId: "gone", level: 1 },
    ]);
    expect(r.auto).toBe(false);
    expect(r.lineup).toHaveLength(2);
    expect(r.lineup[0]).toMatchObject({ templateId: "t5", level: 15, chipId: "c5" });
  });

  it("фишек нет вовсе — понятный отказ", async () => {
    st.owned = [];
    await expect(resolveLineupInfo("w", [])).rejects.toThrow("Нет фишек для боя");
  });
});
