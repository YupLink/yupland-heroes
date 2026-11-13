// Цена «Забрать охрану» (владелец, 22.10.2026): по здоровью шахты относительно
// починки — запасу службы шахты v2: больше 50 % — 100 энергии, от 20 до 50 % —
// 200, меньше 20 % — 300; у шахт без запаса службы — 100.
import { describe, expect, it } from "vitest";
import { mineLifeNow } from "./mineV2";
import { changedPriceOf, guardTakeEnergy } from "./mineGuardTake";

describe("guardTakeEnergy", () => {
  it("больше 50 % — 100", () => {
    for (const life of [1, 0.75, 0.5001]) expect(guardTakeEnergy(life)).toBe(100);
  });

  it("от 20 до 50 % включительно — 200", () => {
    for (const life of [0.5, 0.35, 0.2]) expect(guardTakeEnergy(life)).toBe(200);
  });

  it("меньше 20 % — 300", () => {
    for (const life of [0.1999, 0.05, 0]) expect(guardTakeEnergy(life)).toBe(300);
  });

  it("запаса службы нет (не v2: энергия, пыль, старого образца) — 100", () => {
    expect(guardTakeEnergy(null)).toBe(100);
    expect(guardTakeEnergy(undefined)).toBe(100);
    expect(guardTakeEnergy(Number.NaN)).toBe(100);
  });

  it("запас тает по режиму: «Бережно» 7 дней — через 4 дня 200, через 6 — 300, после починки — 100", () => {
    const at = "2026-10-22T00:00:00Z";
    const day = 86_400_000;
    const t0 = Date.parse(at);
    const life = (days: number) =>
      mineLifeNow({ mode: "base", lifeLeft: 1, lifeAt: at }, t0 + days * day);
    expect(guardTakeEnergy(life(3))).toBe(100);
    expect(guardTakeEnergy(life(4))).toBe(200);
    expect(guardTakeEnergy(life(6))).toBe(300);
    // Починка — запас снова 100 %.
    expect(guardTakeEnergy(mineLifeNow({ mode: "base", lifeLeft: 1, lifeAt: at }, t0))).toBe(100);
  });
});

describe("changedPriceOf", () => {
  it("новая цена из отказа сервера", () => {
    expect(changedPriceOf(new Error('mineguard.price_changed|{"need":200}'))).toBe(200);
  });

  it("прочие отказы и битый формат — null", () => {
    expect(changedPriceOf(new Error("mineguard.none"))).toBeNull();
    expect(changedPriceOf(new Error("mineguard.price_changed|{oops"))).toBeNull();
    expect(changedPriceOf(new Error('mineguard.price_changed|{"need":0}'))).toBeNull();
    expect(changedPriceOf(null)).toBeNull();
  });
});
