// Каталог иммунитетов строится из каталога способностей: новый дебафф босса
// обязан попасть в список сам, а «Все» — раскрыться на чтении.
import { describe, expect, it } from "vitest";
import { ABILITY_KINDS } from "@/server/api/beta-raid/abilities";
import {
  IMMUNE_KINDS,
  IMMUNE_TARGETS,
  expandImmune,
  immuneEffectKind,
  immuneTargetOf,
} from "./boostImmune";

describe("список иммунитетов", () => {
  it("всё из каталога способностей, кроме удара по всем", () => {
    expect(IMMUNE_KINDS).toEqual(ABILITY_KINDS.filter((k) => k !== "cleave"));
    expect(IMMUNE_KINDS).toContain("weak_int");
    expect(IMMUNE_KINDS).not.toContain("cleave");
  });

  it("«Все» стоит первым пунктом", () => {
    expect(IMMUNE_TARGETS[0]).toBe("all");
    expect(IMMUNE_TARGETS.slice(1)).toEqual(IMMUNE_KINDS);
  });
});

describe("вид строки эффекта ↔ цель", () => {
  it("туда и обратно", () => {
    expect(immuneEffectKind("poison")).toBe("immune_poison");
    expect(immuneTargetOf("immune_poison")).toBe("poison");
    expect(immuneTargetOf("immune_all")).toBe("all");
  });

  it("чужие и устаревшие виды — null", () => {
    expect(immuneTargetOf("buff_atk")).toBeNull();
    expect(immuneTargetOf("immune_cleave")).toBeNull();
    expect(immuneTargetOf("immune_gone")).toBeNull();
  });
});

describe("expandImmune", () => {
  it("«Все» раскрывается на весь список", () => {
    expect([...expandImmune(["all"])].sort()).toEqual([...IMMUNE_KINDS].sort());
  });

  it("конкретные виды — как есть, без дублей", () => {
    expect([...expandImmune(["poison", "slow", "poison"])]).toEqual(["poison", "slow"]);
  });
});
