// Таяние энергии выше лимита — правило владельца на TS-эталоне.
//
// Настоящий расчёт в SQL (acc-45-energy-decay.sql), тестов Postgres в репо
// нет; эталон здесь — то же самое один в один, и падение любого сценария
// значит, что и SQL считает не по спеке. Сценарии из спецификации: 5000/200 →
// плавно до 200; купленная не тает; лимит работает в обе стороны; сначала
// тратится подаренное; покупка не сбивает часы таяния.
import { describe, expect, it } from "vitest";
import {
  addEnergy,
  energyState,
  energyTrend,
  settleEnergy,
  spendEnergy,
  type EnergyRow,
} from "@/lib/energySettle";

const T0 = Date.UTC(2026, 8, 20, 12, 0, 0);
const sec = (n: number): number => n * 1000;
const base = (o: Partial<EnergyRow> = {}): EnergyRow => ({
  energy: 5000,
  bought: 0,
  max: 200,
  regenPct: 0,
  lastMs: T0,
  ...o,
});

describe("settleEnergy — таяние", () => {
  it("пример владельца: 5000/200 через 100 минут — минус 10, следующий тик через 600 с", () => {
    const r = settleEnergy({ ...base(), nowMs: T0 + sec(6000) });
    expect(r).toMatchObject({ energy: 4990, decay: 10, regen: 0, nextSecs: 600, trend: "decay" });
    expect(r.updatedMs).toBe(T0 + sec(6000));
  });

  it("остаток времени не теряется: метка сдвигается ровно на использованные тики", () => {
    const r = settleEnergy({ ...base(), nowMs: T0 + sec(1500) });
    expect(r.energy).toBe(4998);
    expect(r.updatedMs).toBe(T0 + sec(1200));
    expect(r.nextSecs).toBe(300);
  });

  it("бонус героя к регену на шаг таяния не влияет", () => {
    const r = settleEnergy({ ...base({ regenPct: 130 }), nowMs: T0 + sec(1200) });
    expect(r.decay).toBe(2);
  });

  it("до пола и не ниже: 205/200 через сутки = 200, часы стоят", () => {
    const r = settleEnergy({ ...base({ energy: 205 }), nowMs: T0 + sec(86_400) });
    expect(r).toMatchObject({ energy: 200, decay: 5, nextSecs: 0, trend: "flat" });
    expect(r.updatedMs).toBe(T0 + sec(86_400));
  });

  it("купленная не тает: пол = лимит + bought", () => {
    const r = settleEnergy({ ...base({ bought: 4800 }), nowMs: T0 + sec(6000) });
    expect(r).toMatchObject({ energy: 5000, decay: 0, nextSecs: 0, trend: "flat" });
    // 4700 тиков до пола — за 40 дней их 5760, лишние в минус не уходят.
    const r2 = settleEnergy({ ...base({ bought: 100 }), nowMs: T0 + sec(86_400 * 40) });
    expect(r2.energy).toBe(300);
  });

  it("предохранитель выключен — выше лимита просто стоит", () => {
    const r = settleEnergy({ ...base(), nowMs: T0 + sec(6000), decayOn: false });
    expect(r).toMatchObject({ energy: 5000, decay: 0, nextSecs: 0, trend: "flat" });
  });
});

describe("settleEnergy — реген (как было)", () => {
  it("150/200 через 1300 с = 152, метка +1200, следующий через 500", () => {
    const r = settleEnergy({ ...base({ energy: 150 }), nowMs: T0 + sec(1300) });
    expect(r).toMatchObject({ energy: 152, regen: 2, nextSecs: 500, trend: "regen" });
    expect(r.updatedMs).toBe(T0 + sec(1200));
  });

  it("интеллект ускоряет реген: 130 % → шаг 260.87 с", () => {
    const r = settleEnergy({
      ...base({ energy: 10, max: 95, regenPct: 130 }),
      nowMs: T0 + sec(1000),
    });
    expect(r.regen).toBe(3);
    expect(r.nextSecs).toBe(44);
  });

  it("дошли до лимита — часы в «сейчас», следующего тика нет", () => {
    const r = settleEnergy({ ...base({ energy: 199 }), nowMs: T0 + sec(5000) });
    expect(r).toMatchObject({ energy: 200, nextSecs: 0, trend: "flat" });
    expect(r.updatedMs).toBe(T0 + sec(5000));
  });

  it("метка из будущего — времени не прошло", () => {
    const r = settleEnergy({ ...base({ energy: 10, max: 30 }), nowMs: T0 - sec(100) });
    expect(r).toMatchObject({ energy: 10, regen: 0, nextSecs: 600 });
  });
});

describe("energyState", () => {
  it("три состояния: ниже лимита, между лимитом и полом, выше пола", () => {
    expect(energyState(199, 200, 0)).toBe("regen");
    expect(energyState(200, 200, 0)).toBe("flat");
    expect(energyState(250, 200, 100)).toBe("flat");
    expect(energyState(301, 200, 100)).toBe("decay");
    expect(energyState(301, 200, 100, false)).toBe("flat");
  });
});

describe("spendEnergy — сначала подаренное", () => {
  it("трата из подаренного запаса bought не трогает", () => {
    const r = spendEnergy(base({ bought: 100 }), 10, T0);
    expect(r).toMatchObject({ energy: 4990, bought: 100 });
  });

  it("когда подаренное кончилось, тратится купленное", () => {
    const r = spendEnergy(base({ energy: 150, bought: 120 }), 50, T0);
    expect(r).toMatchObject({ energy: 100, bought: 100 });
  });

  it("продолжающееся таяние часы не сбрасывает", () => {
    const r = spendEnergy(base(), 10, T0 + sec(1500));
    expect(r.energy).toBe(4988);
    expect(r.lastMs).toBe(T0 + sec(1200));
  });

  it("с лимита в реген — часы с этого момента", () => {
    const r = spendEnergy(base({ energy: 200, lastMs: T0 - sec(7200) }), 1, T0);
    expect(r).toMatchObject({ energy: 199, lastMs: T0 });
  });

  it("нехватка — исключение как в SQL", () => {
    expect(() => spendEnergy(base({ energy: 5 }), 10, T0)).toThrow(/not_enough_energy/);
  });
});

describe("addEnergy — вид начисления", () => {
  it("покупка растит bought и НЕ сбивает часы таяния", () => {
    const r = addEnergy(base(), 100, "energy_add", T0 + sec(1500));
    expect(r).toMatchObject({ energy: 5098, bought: 100, lastMs: T0 + sec(1200) });
  });

  it("подарок bought не трогает, из регена в таяние — часы с этого момента", () => {
    const r = addEnergy(base({ energy: 50 }), 500, "energy_admin", T0 + sec(100));
    expect(r).toMatchObject({ energy: 550, bought: 0, lastMs: T0 + sec(100) });
  });

  it("возврат восстанавливает купленное, если подаренного не осталось", () => {
    expect(addEnergy(base({ energy: 88, bought: 88 }), 5, "energy_refund", T0).bought).toBe(93);
    expect(addEnergy(base({ energy: 90, bought: 88 }), 5, "energy_refund", T0).bought).toBe(88);
  });

  it("реген продолжается — остаток времени сохраняется", () => {
    const r = addEnergy(base({ energy: 10, max: 30 }), 5, "energy_like", T0 + sec(700));
    expect(r).toMatchObject({ energy: 16, bought: 5, lastMs: T0 + sec(600) });
  });
});

describe("energyTrend — что показывает HUD", () => {
  it("ниже лимита — реген, выше с таймером — таяние, иначе полная", () => {
    expect(energyTrend({ energy: 10, maxEnergy: 30, nextRegenSec: 600 })).toBe("regen");
    expect(energyTrend({ energy: 5000, maxEnergy: 200, nextRegenSec: 300 })).toBe("decay");
    expect(energyTrend({ energy: 5000, maxEnergy: 200, nextRegenSec: 0 })).toBe("flat");
    expect(energyTrend({ energy: 200, maxEnergy: 200, nextRegenSec: 0 })).toBe("flat");
  });
});

describe("acc-49: тает только выданное админом", () => {
  it("бокс/дроп/награда защищены, подарок админа — нет", () => {
    expect(addEnergy(base({ energy: 50 }), 100, "energy_mystic", T0).bought).toBe(100);
    expect(addEnergy(base({ energy: 50 }), 100, "energy_drop", T0).bought).toBe(100);
    expect(addEnergy(base({ energy: 50 }), 100, "energy_reward", T0).bought).toBe(100);
    expect(addEnergy(base({ energy: 50 }), 100, "energy_admin", T0).bought).toBe(0);
    expect(addEnergy(base({ energy: 50 }), 100, "admin_grant", T0).bought).toBe(0);
  });
});
