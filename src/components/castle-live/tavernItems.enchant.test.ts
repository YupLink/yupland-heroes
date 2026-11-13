// Стопки артефактов (Таверна, Оружейная): зачарованный экземпляр не сливается
// с обычными того же шаблона и прочности — у него своя плитка с ✦ (§8.87).
import { describe, expect, it } from "vitest";
import { freeArtifactGroups } from "./tavernItems";

const art = (id: string, enchantPct: number | null = null) => ({
  id,
  kind: "artifact",
  templateId: "tpl_hat",
  durability: 100,
  enchantPct,
});

describe("freeArtifactGroups: зачарованный — своей плиткой", () => {
  it("три обычных — одна стопка ×3, зачарованные — каждый отдельно", () => {
    const groups = freeArtifactGroups(
      [art("a"), art("b"), art("e1", 12), art("c"), art("e2", 12)],
      [],
    );
    const plain = groups.find((g) => g.sample.enchantPct == null);
    const ench = groups.filter((g) => g.sample.enchantPct != null);
    expect(plain?.count).toBe(3);
    expect(ench.map((g) => [g.sample.id, g.count])).toEqual([
      ["e1", 1],
      ["e2", 1],
    ]);
  });

  it("надетый зачарованный в свободные стопки не попадает", () => {
    const groups = freeArtifactGroups([art("a"), art("e1", -5)], [{ equipped: { head: "e1" } }]);
    expect(groups).toHaveLength(1);
    expect(groups[0].sample.id).toBe("a");
  });
});
