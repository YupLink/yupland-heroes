// Сводка окна пробы: квантили кадров, агрегаты вызовов, фильтр «есть что слать».
import { describe, expect, it } from "vitest";
import { emptyWindow, pct, summarize, worthSending, type Device } from "./probeSummary";

const device: Device = { mobile: true, dpr: 2.75, cores: 8, mem: 8, conn: "4g", screen: "393x873" };

describe("perf/probeSummary", () => {
  it("pct: медиана и 95-й по копии, без порчи входа", () => {
    const v = [5, 1, 3, 2, 4];
    expect(pct(v, 0.5)).toBe(3);
    expect(pct(v, 0.95)).toBe(5);
    expect(v).toEqual([5, 1, 3, 2, 4]);
    expect(pct([], 0.5)).toBe(0);
  });

  it("summarize: кадры, длинные задачи, вызовы по именам", () => {
    const w = emptyWindow(1000, 0);
    for (let i = 1; i <= 100; i++) {
      w.frameMs.push(i);
      w.frameCells.push(i * 10);
    }
    w.movingFrames = 40;
    w.long = [80, 120];
    w.heapUsed = 100.4;
    w.heapPeak = 130.6;
    w.calls.push({ name: "getBetaRaidMap", ms: 1500, bytes: 8_000_000, wire: 400_000 });
    w.calls.push({ name: "getBetaRaidMap", ms: 2500, bytes: 8_000_000, wire: 400_000 });
    w.calls.push({ name: "getBetaRaidPlayers", ms: 100, bytes: 18_000, wire: 4_000 });
    w.sse = { moved: 12, built: 1 };
    const s = summarize(w, device, 61_000);
    expect(s.v).toBe(1);
    expect(s.dur).toBe(60_000);
    expect(s.page).toBe(61);
    expect(s.mobile).toBe(true);
    expect(s.frames.n).toBe(100);
    expect(s.frames.moving).toBe(40);
    expect(s.frames.p50).toBe(51);
    expect(s.frames.p95).toBe(96);
    expect(s.frames.max).toBe(100);
    expect(s.frames.cells_max).toBe(1000);
    expect(s.long).toEqual({ n: 2, total: 200, max: 120 });
    expect(s.heap).toEqual({ used: 100, peak: 131 });
    expect(s.fn.getBetaRaidMap).toEqual({
      n: 2,
      p50: 2500,
      max: 2500,
      bytes: 16_000_000,
      bytes_max: 8_000_000,
      wire: 800_000,
    });
    expect(s.fn.getBetaRaidPlayers.n).toBe(1);
    expect(s.sse).toEqual({ moved: 12, built: 1 });
    // Самые тяжёлые по байтам идут первыми.
    expect(Object.keys(s.fn)[0]).toBe("getBetaRaidMap");
  });

  it("summarize: пустое окно даёт нули, а не NaN", () => {
    const s = summarize(emptyWindow(0, 0), device, 0);
    expect(s.frames).toEqual({
      n: 0,
      moving: 0,
      p50: 0,
      p95: 0,
      max: 0,
      cells_p50: 0,
      cells_max: 0,
    });
    expect(s.long).toEqual({ n: 0, total: 0, max: 0 });
    expect(s.heap).toBeNull();
    expect(s.dur).toBe(1);
  });

  it("worthSending: пустое окно не шлём", () => {
    const w = emptyWindow(0, 0);
    expect(worthSending(w)).toBe(false);
    w.frameMs.push(1);
    expect(worthSending(w)).toBe(true);
  });
});

describe("perf/sanitizeSample", async () => {
  const { sanitizeSample } = await import("./sanitizeSample");
  it("отвергает не-пробу", () => {
    expect(sanitizeSample(null)).toBeNull();
    expect(sanitizeSample({ v: 2 })).toBeNull();
    expect(sanitizeSample({ v: 1 })).toBeNull();
    expect(sanitizeSample([])).toBeNull();
  });
  it("приводит числа, выбрасывает мусор, режет словари", () => {
    const fn: Record<string, unknown> = {};
    for (let i = 0; i < 40; i++) fn[`f${i}`] = { n: "3", p50: -5, max: "abc", bytes: 1e20 };
    const s = sanitizeSample({
      v: 1,
      dur: "60000",
      mobile: "yes",
      frames: { n: "10", p95: "12.5", cells_max: NaN, junk: 1 },
      long: [1, 2],
      heap: { used: "100" },
      fn: { ...fn, "bad key!!": { n: 1 }, arr: [1] },
      sse: ["moved"],
      extra: "drop me",
      conn: 12345,
    });
    expect(s).not.toBeNull();
    expect(s!.dur).toBe(60000);
    expect(s!.mobile).toBe(false);
    expect(s!.frames).toEqual({
      n: 10,
      moving: 0,
      p50: 0,
      p95: 12.5,
      max: 0,
      cells_p50: 0,
      cells_max: 0,
    });
    expect(s!.long).toEqual({ n: 0, total: 0, max: 0 });
    expect(s!.heap).toEqual({ used: 100, peak: 0 });
    expect(Object.keys(s!.fn).length).toBeLessThanOrEqual(16);
    expect(s!.fn.f0).toEqual({ n: 3, p50: 0, max: 0, bytes: 1e12, bytes_max: 0, wire: 0 });
    expect(s!.fn.arr).toBeUndefined();
    expect(s!.sse).toEqual({});
    expect(s!.conn).toBeNull();
    expect((s as unknown as Record<string, unknown>).extra).toBeUndefined();
  });
});
