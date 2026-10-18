// Карточка фарма коллекции: накопленное без потолка (16.10.2026), как на сервере.
import { describe, expect, it } from "vitest";
import { farmView } from "./collectionFarmView";

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 13, 12);
const farm = (o: Partial<Parameters<typeof farmView>[0] & object> = {}) => ({
  ratePerDay: 1,
  accrued: 0,
  lastClaimAtMs: now - DAY,
  cooldownRemainMs: 0,
  canClaim: true,
  ...o,
});

describe("farmView", () => {
  it("сутки с прошлого сбора, 5★ — 1 билет, копилка не полна", () => {
    const v = farmView(farm(), now);
    expect(v.accruedNow).toBeCloseTo(1, 5);
    expect(v.capFull).toBe(false);
  });

  it("23 дня без сбора — 23 билета: потолка нет (владелец 16.10)", () => {
    const v = farmView(farm({ lastClaimAtMs: now - 23 * DAY }), now);
    expect(v.accruedNow).toBeCloseTo(23, 5);
    expect(v.capFull).toBe(false);
    expect(v.capDays).toBeNull();
  });

  it("3★ (0,1 в день) за 10 дней — 1 билет", () => {
    const v = farmView(farm({ ratePerDay: 0.1, lastClaimAtMs: now - 10 * DAY }), now);
    expect(v.accruedNow).toBeCloseTo(1, 5);
  });

  it("старый сервер прислал capDays — потолок по нему", () => {
    const v = farmView(farm({ capDays: 3, lastClaimAtMs: now - 23 * DAY }), now);
    expect(v.accruedNow).toBe(3);
    expect(v.capFull).toBe(true);
  });

  it("ещё ни разу не собирали — берём накопленное с сервера", () => {
    const v = farmView(farm({ lastClaimAtMs: 0, accrued: 2.5 }), now);
    expect(v.accruedNow).toBe(2.5);
  });

  it("собирали час назад — ждать ещё 5 часов, собрать нельзя", () => {
    const v = farmView(farm({ lastClaimAtMs: now - 3600_000 }), now);
    expect(v.cooldownSec).toBe(5 * 3600);
    expect(v.canClaim).toBe(false);
  });

  it("нет фарма — пусто", () => {
    expect(farmView(null, now)).toMatchObject({ accruedNow: 0, capFull: false, canClaim: false });
  });
});
