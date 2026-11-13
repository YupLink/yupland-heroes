// После удара перечитываем только то, что удар МОГ изменить (владелец, 23.10.2026).
import { describe, expect, it } from "vitest";
import { attackRefreshKeys, chipsChanged, stateChanged } from "./attackRefresh";

const flat = (k: string[][]) => k.map((x) => x[0]);

describe("что перечитать после удара", () => {
  it("подбор монет: энергия и состояние, награда в «Добычу»; фишки и снаряжение — нет", () => {
    const r = attackRefreshKeys({
      pickup: true,
      kind: "chest",
      rewards: [{ kind: "resource", amount: 5, packId: null }],
    });
    expect(flat(r.active)).toEqual(["yupland-status"]);
    expect(flat(r.all)).toEqual([
      "beta-raid-state",
      "my-energy",
      "raid-pending-rewards",
      "beta-raid-harvest",
    ]);
  });
  it("собранный сундук сразу обновляет шаг острова без «Показать»", () => {
    const taken = attackRefreshKeys({ pickup: true, kind: "chest", killed: true, rewards: [] });
    expect(flat(taken.active)).toContain("beta-raid-island");
    const stillClosed = attackRefreshKeys({ pickup: true, kind: "chest", killed: false, rewards: [] });
    expect(flat(stillClosed.active)).not.toContain("beta-raid-island");
  });
  it("подбор артефакта: предметы и снаряжение, но не фишки", () => {
    const r = attackRefreshKeys({ pickup: true, kind: "artifact", rewards: [] });
    expect(flat(r.active)).toEqual(["yupland-status", "my-game-items", "my-hero-gear"]);
  });
  it("простой удар по боссу: ни инвентаря фишек, ни состояния, ни энергии, ни топов всех целей", () => {
    const r = attackRefreshKeys({ pickup: false, kind: "boss", rewards: [], killed: false });
    expect(flat(r.all)).toEqual([]);
    expect(flat(r.active)).toEqual(["yupland-status", "my-game-items", "my-hero-gear"]);
    expect(flat(r.active)).not.toContain("my-chip-inventory");
  });
  it("разгром отряда фишки не меняет — инвентарь не тянем", () => {
    const r = attackRefreshKeys({ pickup: false, kind: "boss", rewards: [], wiped: true });
    expect(flat(r.active)).not.toContain("my-chip-inventory");
  });
  it("оглушение фишки — инвентарь (и состояние: эффект на фишке)", () => {
    const r = attackRefreshKeys({
      pickup: false,
      kind: "boss",
      rewards: [],
      chipEffects: [{ kind: "stun", minutes: 5 }],
    });
    expect(flat(r.active)).toContain("my-chip-inventory");
    expect(flat(r.all)).toContain("beta-raid-state");
  });
  it("яд — только состояние рейда, инвентарь его не показывает", () => {
    const r = attackRefreshKeys({
      pickup: false,
      kind: "boss",
      rewards: [],
      chipEffects: [{ kind: "poison", minutes: 5 }],
    });
    expect(flat(r.active)).not.toContain("my-chip-inventory");
    expect(flat(r.all)).toContain("beta-raid-state");
  });
  it("подбор с оглушением фишек — фишки перечитываем", () => {
    const r = attackRefreshKeys({
      pickup: true,
      kind: "chest",
      rewards: [],
      chipEffects: [{ kind: "stun", minutes: 5 }],
    });
    expect(flat(r.active)).toContain("my-chip-inventory");
  });
  it("награда встала в «Добычу» — перечитать её сразу; товар в рюкзак — нет", () => {
    const pack = attackRefreshKeys({
      pickup: false,
      kind: "boss",
      killed: true,
      rewards: [{ kind: "pack", amount: 1, packId: "cp_island_training" }],
    });
    expect(flat(pack.all)).toContain("beta-raid-harvest");
    expect(flat(pack.all)).toContain("raid-pending-rewards");
    const ore = attackRefreshKeys({
      pickup: false,
      kind: "boss",
      killed: true,
      rewards: [{ kind: "custom", amount: 1, packId: "cst_ore" }],
    });
    expect(flat(ore.all)).not.toContain("beta-raid-harvest");
  });
});

describe("признаки удара", () => {
  it("stateChanged — способности, выжигание, замедление, поломка, добитая цель", () => {
    expect(stateChanged({})).toBe(false);
    expect(stateChanged({ abilityLog: [] })).toBe(false);
    expect(stateChanged({ abilityLog: [{ round: 1, kind: "weak_arm" }] })).toBe(true);
    expect(stateChanged({ abilityTotals: { strip_immune: 1, burn_energy: 0 } })).toBe(true);
    // Выжигание — только энергия (её списывает окно из ответа), рассечение — внутри боя.
    expect(stateChanged({ burnedEnergy: 3, abilityLog: [{ round: 1, kind: "burn_energy" }] })).toBe(
      false,
    );
    expect(stateChanged({ abilityTotals: { cleave: 4, burn_energy: 10 } })).toBe(false);
    expect(stateChanged({ slowed: { extraCost: 1, minutes: 5 } })).toBe(true);
    expect(stateChanged({ artBroken: [{}] })).toBe(true);
    expect(stateChanged({ killed: true })).toBe(true);
  });
  it("chipsChanged — только оглушение", () => {
    expect(chipsChanged({ chipEffects: [{ kind: "poison" }] })).toBe(false);
    expect(chipsChanged({ chipEffects: [{ kind: "stun" }] })).toBe(true);
    expect(chipsChanged({})).toBe(false);
  });
});

describe("признак сервера chipsChanged", () => {
  it("сервер сказал «фишки изменились» — перечитываем, сказал «нет» — не трогаем", () => {
    const yes = attackRefreshKeys({ pickup: false, kind: "boss", rewards: [], chipsChanged: true });
    expect(flat(yes.active)).toContain("my-chip-inventory");
    const no = attackRefreshKeys({
      pickup: false,
      kind: "boss",
      rewards: [],
      chipsChanged: false,
      chipEffects: [{ kind: "poison", minutes: 3 }],
    });
    expect(flat(no.active)).not.toContain("my-chip-inventory");
  });
});
