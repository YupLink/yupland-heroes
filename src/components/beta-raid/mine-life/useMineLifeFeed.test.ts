// Подача полос: ответ ложится в хранилище со сдвигом часов, перечитывание
// флажков (починка, режим, захват — свои действия поток не возвращает) тянет
// за собой полосы, минутный тик будит кадр только пока есть что таять.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const s = vi.hoisted(() => ({ calls: 0, bars: "1,1,2,1,0", gods: [] as unknown[] }));

vi.mock("@/server/api/beta-raid/mine-life-bars", () => ({
  getMineLifeBars: async (a: { data: { god: boolean } }) => {
    s.calls++;
    s.gods.push(a.data.god);
    return { bars: s.bars, serverNow: Date.now() - 600_000 };
  },
}));

import { startMineLifeFeed } from "./useMineLifeFeed";
import { getMineBars, mineBarsNow, setMineBars, subscribeMineBars } from "./mineLifeStore";

const flush = () => vi.advanceTimersByTimeAsync(10);

let qc: QueryClient;
let stop: () => void;

beforeEach(() => {
  vi.useFakeTimers({ now: NOW });
  s.calls = 0;
  s.bars = "1,1,2,1,0";
  s.gods = [];
  setMineBars(new Map(), 0);
  qc = new QueryClient();
  stop = startMineLifeFeed(qc);
});

afterEach(() => {
  stop();
  qc.clear();
  vi.useRealTimers();
});

describe("startMineLifeFeed", () => {
  it("режим бога — свой запрос с god: true и свой ключ кэша", async () => {
    await flush();
    const god = startMineLifeFeed(qc, true);
    await flush();
    god();
    expect(s.gods).toEqual([false, true]);
    expect(qc.getQueryData(["beta-raid-mine-life", false])).toBeTruthy();
    expect(qc.getQueryData(["beta-raid-mine-life", true])).toBeTruthy();
  });

  it("ответ → полосы в хранилище, часы сервера с поправкой на телефон", async () => {
    await flush();
    expect(s.calls).toBe(1);
    expect(getMineBars().get("1,1")?.left).toBe(1);
    // Телефон спешит на 10 минут: «сейчас» полос — по серверу.
    expect(Math.abs(mineBarsNow() - (Date.now() - 600_000))).toBeLessThan(50);
  });

  it("флажки погасили — полосы перечитаны (починка своей шахты)", async () => {
    await flush();
    s.bars = "1,1,0,1,0";
    qc.setQueryData(["beta-raid-mine-flags"], { flags: {} });
    await qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
    await flush();
    expect(s.calls).toBe(2);
    expect(getMineBars().get("1,1")?.span).toBe(168 * 3_600_000);
  });

  it("другие ключи полосы не трогают", async () => {
    await flush();
    qc.setQueryData(["beta-raid-harvest"], {});
    await qc.invalidateQueries({ queryKey: ["beta-raid-harvest"] });
    await flush();
    expect(s.calls).toBe(1);
  });

  it("минутный тик: будит кадр, пока полоса тает; все пустые — молчит", async () => {
    await flush();
    const fn = vi.fn();
    const off = subscribeMineBars(fn);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).toHaveBeenCalledTimes(1);
    setMineBars(new Map([["2,2", { left: 0, at: 0, span: 1 }]]), 0);
    fn.mockClear();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fn).not.toHaveBeenCalled();
    off();
  });

  it("остановка — без тиков и без подписки на кэш", async () => {
    await flush();
    stop();
    const fn = vi.fn();
    const off = subscribeMineBars(fn);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(fn).not.toHaveBeenCalled();
    await qc.invalidateQueries({ queryKey: ["beta-raid-mine-flags"] });
    await flush();
    expect(s.calls).toBe(1);
    off();
    stop = () => {};
  });
});

describe("sightMoved — перечитать полосы, отойдя от места прошлого чтения", () => {
  it("прошлого чтения нет — да; ближе SIGHT_STEP — нет; дальше — да", async () => {
    const { sightMoved, SIGHT_STEP } = await import("./useMineLifeFeed");
    expect(SIGHT_STEP).toBe(3);
    expect(sightMoved(null, { q: 0, r: 0 })).toBe(true);
    expect(sightMoved({ q: 0, r: 0 }, { q: 2, r: 0 })).toBe(false);
    expect(sightMoved({ q: 0, r: 0 }, { q: 1, r: 1 })).toBe(false);
    expect(sightMoved({ q: 0, r: 0 }, { q: 3, r: 0 })).toBe(true);
    expect(sightMoved({ q: 0, r: 0 }, { q: 2, r: 1 })).toBe(true);
  });
});
