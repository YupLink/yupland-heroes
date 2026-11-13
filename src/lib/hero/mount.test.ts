// Кони героя (§8.84): темп, порог частоты, прыжок пегаса, вид из шаблона.
import { describe, expect, it } from "vitest";
import {
  BASE_STEP_MS,
  jumpOver,
  mountJumps,
  mountSpeedLabel,
  mountStepMs,
  mountTier,
  mountTierOfMeta,
  stepRateLimit,
  mountSpeed,
} from "./mount";

describe("кони", () => {
  it("темп шага: без коня медленнее прежнего, пегас и единорог — ×1,75", () => {
    expect(mountStepMs("common")).toBe(BASE_STEP_MS);
    expect(mountStepMs("none")).toBe(253);
    expect(mountStepMs("rare")).toBe(158);
    expect(mountStepMs("epic")).toBe(127);
    expect(mountStepMs("legendary")).toBe(109);
    expect(mountStepMs("unique")).toBe(109);
  });

  it("порог частоты сервера растёт с конём, обычный — не ниже прежних 20", () => {
    expect(stepRateLimit("none")).toBe(23);
    expect(stepRateLimit("common")).toBeGreaterThanOrEqual(20);
    expect(stepRateLimit("unique")).toBeGreaterThan(stepRateLimit("epic"));
  });

  it("прыгает только пегас — через одну клетку по прямой", () => {
    expect(mountJumps("unique")).toBe(true);
    expect(mountJumps("legendary")).toBe(false);
    expect(jumpOver({ q: 0, r: 0 }, { q: 2, r: 0 })).toEqual({ q: 1, r: 0 });
    expect(jumpOver({ q: 0, r: 0 }, { q: 0, r: -2 })).toEqual({ q: 0, r: -1 });
    expect(jumpOver({ q: 0, r: 0 }, { q: 1, r: 1 })).toBeNull(); // 2 клетки, но не по прямой
    expect(jumpOver({ q: 0, r: 0 }, { q: 1, r: 0 })).toBeNull();
  });

  it("вид — из meta шаблона; мусор и пусто — без коня", () => {
    expect(mountTierOfMeta({ mount: "epic" })).toBe("epic");
    expect(mountTierOfMeta({ mount: "dragon" })).toBeNull();
    expect(mountTierOfMeta(null)).toBeNull();
    expect(mountTier(undefined)).toBe("none");
    expect(mountTier("unique")).toBe("unique");
    expect(mountSpeedLabel("epic", "ru")).toBe("×1,5");
    expect(mountSpeedLabel("none", "en")).toBe("×0.75");
  });
});

describe("зачарование коня множит скорость (03.11.2026)", () => {
  it("эпический ×1,5 с +20 % — ×1,8; обычный +50 % — ×1,5; без коня — всегда ×0,75", () => {
    expect(mountSpeed("epic", 20)).toBe(1.8);
    expect(mountSpeed("common", 50)).toBe(1.5);
    expect(mountSpeed("unique", 100)).toBe(3.5);
    expect(mountSpeed("none", 50)).toBe(0.75);
    expect(mountSpeedLabel("epic", "ru", 20)).toBe("×1,8");
  });

  it("шаг короче на ту же долю; минус-зачарование не медленнее «без коня»", () => {
    expect(mountStepMs("epic", 20)).toBe(Math.round(190 / 1.8));
    expect(mountStepMs("common", -90)).toBe(mountStepMs("none"));
    expect(mountSpeed("rare", -50)).toBe(0.75);
  });
});
