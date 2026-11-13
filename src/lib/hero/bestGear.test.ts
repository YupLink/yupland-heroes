import { describe, expect, it } from "vitest";
import { bestGearFor, type BestGearItem } from "./bestGear";
import type { HeroSlotDef } from "./heroSlots";

const slots: HeroSlotDef[] = [{ key: "neck", slot: "neck", index: 1 }];
const ctx = { race: null, spec: null };
const art = (itemId: string, statType: string, statAmount: number): BestGearItem => ({
  itemId,
  slot: "neck",
  statType,
  statAmount,
});

describe("bestGearFor: Торговля и Алхимия — тоже прибавка (12.11.2026)", () => {
  it("надета Торговля +16 — Скорость +8 не предлагается", () => {
    const r = bestGearFor({
      slots,
      items: [art("trade16", "trade", 16), art("spd8", "speed", 8)],
      equipped: { neck: "trade16" },
      ctx,
    });
    expect(r.changed).toBe(0);
    expect(r.gain).toBe(0);
    expect(r.equip.neck).toBe("trade16");
  });

  it("на пустое место берёт Алхимию +12, а не Скорость +8; прирост 12", () => {
    const r = bestGearFor({
      slots,
      items: [art("alch12", "alchemy", 12), art("spd8", "speed", 8)],
      equipped: {},
      ctx,
    });
    expect(r.equip.neck).toBe("alch12");
    expect(r.gain).toBe(12);
  });

  it("Скорость +20 лучше надетой Торговли +16: прирост 4", () => {
    const r = bestGearFor({
      slots,
      items: [art("trade16", "trade", 16), art("spd20", "speed", 20)],
      equipped: { neck: "trade16" },
      ctx,
    });
    expect(r.equip.neck).toBe("spd20");
    expect(r.gain).toBe(4);
    expect(r.changed).toBe(1);
  });
});
