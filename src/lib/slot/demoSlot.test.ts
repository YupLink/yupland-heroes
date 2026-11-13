// Холостая игра гостя: тот же ход, что на сервере, но на игрушечные кредиты;
// скрытое (что под кучками) экрану не отдаётся; на сервер ничего не уходит.
import { describe, expect, it, vi } from "vitest";
import { HIDDEN } from "./publicView";
import { rebuildReels } from "./reelLevel";
import { serverStep } from "./serverStep";
import { seededRng, simulate } from "./simulate";
import { EMPTY_STATS, initialSlotState } from "./state";

const api = vi.hoisted(() => ({ slotLoad: vi.fn(), slotAct: vi.fn() }));
vi.mock("@/server/api/slot/slot-api", () => api);

const { demoSlot, DEMO_START, DEMO_TARGET } = await import("./demoSlot");
const { loadSlot } = await import("./loadSlot");
const d0 = () => demoSlot();

describe("demoSlot", () => {
  it("мягкая тяга на 105 %: и не удваивающий, и умный — около 105 %", () => {
    for (const style of ["never", "smart"] as const) {
      let won = 0;
      let wag = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const r = simulate(6000, style, seed, { dynamic: true, target: DEMO_TARGET });
        won += r.state.stats.won;
        wag += r.state.stats.wagered;
      }
      expect(won / wag).toBeGreaterThan(1.0);
      expect(won / wag).toBeLessThan(1.1);
    }
  }, 120_000);

  it("цель с первого спина; тянет к 105 %, а не к 90 %", () => {
    const spin = { type: "spin", lines: 9, bet: 1 } as const;
    const first = serverStep(initialSlotState(1000), spin, seededRng(1), DEMO_TARGET);
    const gold = serverStep(initialSlotState(1000), spin, seededRng(1));
    const set = (s: typeof first) => (s.reels && "set" in s.reels ? s.reels.set : -1);
    expect(set(first)).toBeGreaterThan(set(gold));
    // Отдача 105 % за 1000 спинов: золото — скупее «на 90 %», холостая — щедрее.
    const played = {
      ...initialSlotState(1000),
      stats: { ...EMPTY_STATS, spins: 1000, wagered: 9000, won: 9450 },
    };
    const r90 = rebuildReels(played).reels;
    const r105 = rebuildReels(played, DEMO_TARGET).reels;
    expect(r90 && "set" in r90 && r90.set < r90.safe).toBe(true);
    expect(r105 && "set" in r105 && r105.set > (r90 && "safe" in r90 ? r90.safe : 0)).toBe(true);
    expect(d0().view().state.reels).toBeUndefined();
  });

  it("старт — 1000 кредитов, спин списывает ставку и платит выигрыш", () => {
    const d = demoSlot();
    expect(d.view().gold).toBe(DEMO_START);
    const v = d.act({ type: "spin", lines: 9, bet: 1 });
    expect(v.gold).toBe(DEMO_START - 9 + v.state.lastWin);
    expect(v.version).toBe(1);
    expect(api.slotAct).not.toHaveBeenCalled();
  });

  it("не хватает — отказ «slot.not_enough», баланс не тронут", () => {
    const d = demoSlot(5);
    expect(() => d.act({ type: "spin", lines: 9, bet: 1 })).toThrow("slot.not_enough");
    expect(d.view().gold).toBe(5);
  });

  it("бонус: под неоткрытыми кучками экрану — заглушка", () => {
    const d = demoSlot(1_000_000);
    let v = d.view();
    for (let i = 0; i < 5000 && v.state.phase !== "bonus-won"; i++) {
      if (v.state.phase === "won") v = d.act({ type: "collect" });
      v = d.act({ type: "spin", lines: 9, bet: 1 });
    }
    if (v.state.phase !== "bonus-won") return;
    v = d.act({ type: "bonus-enter" });
    expect(v.state.bonus?.board.flat().every((x) => x === HIDDEN)).toBe(true);
  });
});

describe("loadSlot", () => {
  it("гость — холостая игра; вошёл — сервер, холостая сброшена", async () => {
    const ref = { current: null } as Parameters<typeof loadSlot>[0];
    api.slotLoad.mockRejectedValueOnce(new Error("slot.guest"));
    expect((await loadSlot(ref)).gold).toBe(DEMO_START);
    expect(ref.current).not.toBeNull();
    api.slotLoad.mockResolvedValueOnce({ state: {}, gold: 42, version: 7 });
    expect((await loadSlot(ref)).gold).toBe(42);
    expect(ref.current).toBeNull();
  });

  it("другая ошибка — не холостая, ошибка как была", async () => {
    api.slotLoad.mockRejectedValueOnce(new Error("slot.need_account"));
    await expect(loadSlot({ current: null })).rejects.toThrow("slot.need_account");
  });
});
