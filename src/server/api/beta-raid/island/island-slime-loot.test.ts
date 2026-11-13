// Шаг «Забери добычу слизня» (26.10.2026, Ангелина): сразу после слизня, до
// сытости; засчитан, когда награда за слизня ЭТОГО острова забрана из «Добычи».
// Базы нет — проверяем порядок шагов и текст запроса фактов.
import { describe, expect, it } from "vitest";
import { ISLAND_STEP_IDS, currentStep, parsePlaces, stepChapter } from "@/lib/raid/island/steps";
import { islandStepList } from "@/lib/raid/island/stepList";
import { factsSql, SLIME_TEMPLATE } from "./island-facts";

const at = { q: 1, r: 1 };
const p = parsePlaces({ spawn: at, chest: at, workshop: at, mine: at, treasure: at, portal: at });
if (!p) throw new Error("places");

/** Кусок запроса фактов про шаг. */
const part = (sql: string) => sql.slice(sql.indexOf("AS slime,"), sql.indexOf("AS slime_loot"));

describe("шаг «Забери добычу слизня»", () => {
  it("сразу после слизня, до сытости; глава «Бой», по факту, без клетки", () => {
    const i = ISLAND_STEP_IDS.indexOf("slime_loot");
    expect(ISLAND_STEP_IDS[i - 1]).toBe("slime");
    expect(ISLAND_STEP_IDS[i + 1]).toBe("x_satiety");
    expect(stepChapter("slime_loot")).toBe("battle");
    const view = islandStepList(new Set(), p).find((s) => s.id === "slime_loot");
    expect(view).toMatchObject({ kind: "fact", chapter: "battle", available: true, target: null });
  });

  it("победил слизня, добычу не забрал — текущий шаг «забери», не сытость", () => {
    const before = ISLAND_STEP_IDS.slice(0, ISLAND_STEP_IDS.indexOf("slime") + 1);
    expect(currentStep(new Set(before), p)).toBe("slime_loot");
    expect(currentStep(new Set([...before, "slime_loot"]), p)).toBe("x_satiety");
  });

  it("засчитан только забором награды за слизня с ЭТОЙ карты", () => {
    const sql = part(factsSql("acc_1", "isle_a", p));
    expect(sql).toContain("FROM yuplink.raid_reward w");
    expect(sql).toContain("w.location_id = 'isle_a' AND w.account_id = 'acc_1'");
    expect(sql).toContain(`w.boss_id = '${SLIME_TEMPLATE}' AND w.claimed_at IS NOT NULL`);
    expect(SLIME_TEMPLATE).toBe("rbt_j5-gWHAk");
  });

  it("новый остров — шаг снова открыт: прежняя карта в запросе не участвует", () => {
    const fresh = part(factsSql("acc_1", "isle_new", p));
    expect(fresh).toContain("w.location_id = 'isle_new'");
    expect(fresh).not.toContain("isle_a");
    // Засчитанное на этом острове не перепроверяем; обнулённое — проверяем снова.
    expect(factsSql("acc_1", "isle_new", p, new Set(["slime_loot"]))).toContain(
      "true AS slime_loot",
    );
  });

  it("ничего не выдаёт: факты — только чтение", () => {
    const sql = factsSql("acc_1", "isle_a", p);
    expect(sql.trimStart().startsWith("SELECT")).toBe(true);
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
  });
});
