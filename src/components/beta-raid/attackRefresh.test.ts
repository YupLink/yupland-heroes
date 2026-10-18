// Тяжёлые списки после удара — только когда удар их менял (11.10.2026).
import { describe, expect, it } from "vitest";
import { attackRefreshKeys } from "./attackRefresh";

const flat = (k: string[][]) => k.map((x) => x[0]);

describe("что перечитать после удара", () => {
  it("подбор монет: фишки и снаряжение не трогаем", () => {
    const r = attackRefreshKeys({
      pickup: true,
      kind: "chest",
      rewards: [{ kind: "resource", amount: 5, packId: null }],
    });
    expect(flat(r.active)).toEqual([]);
    expect(flat(r.all)).toContain("beta-raid-state");
    expect(flat(r.all)).toContain("raid-pending-rewards");
  });
  it("подбор артефакта: предметы и снаряжение, но не фишки", () => {
    const r = attackRefreshKeys({ pickup: true, kind: "artifact", rewards: [] });
    expect(flat(r.active)).toEqual(["my-game-items", "my-hero-gear"]);
  });
  it("бой: фишки (оглушение, разгром) и снаряжение", () => {
    const r = attackRefreshKeys({ pickup: false, kind: "boss", rewards: [] });
    expect(flat(r.active)).toEqual(["my-chip-inventory", "my-game-items", "my-hero-gear"]);
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
      rewards: [{ kind: "pack", amount: 1, packId: "cp_island_training" }],
    });
    expect(flat(pack.all)).toContain("beta-raid-harvest");
    const ore = attackRefreshKeys({
      pickup: false,
      kind: "boss",
      rewards: [{ kind: "custom", amount: 1, packId: "cst_ore" }],
    });
    expect(flat(ore.all)).not.toContain("beta-raid-harvest");
  });
});
