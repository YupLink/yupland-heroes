// Слияние счётчиков воркеров: вёдра складываются, квантили считаются по сумме.
import { describe, expect, it } from "vitest";
import { note, perfRaw, perfReset, mergeRaw, rowsFromRaw } from "./trace";

describe("perf/trace: слияние воркеров", () => {
  it("складывает вёдра и считает квантили по слитым", () => {
    perfReset();
    for (let i = 0; i < 10; i++) note("fn:a", 4); // ведро ≤5
    const w1 = perfRaw().aggs;
    perfReset();
    for (let i = 0; i < 10; i++) note("fn:a", 90); // ведро ≤100
    note("fn:b", 2000, { error: true });
    const w2 = perfRaw().aggs;

    const merged = mergeRaw([w1, w2]);
    expect(merged["fn:a"].n).toBe(20);
    expect(merged["fn:a"].total).toBe(10 * 4 + 10 * 90);
    expect(merged["fn:a"].max).toBe(90);
    expect(merged["fn:b"].errors).toBe(1);

    const rows = rowsFromRaw(merged);
    const a = rows.find((r) => r.name === "fn:a")!;
    // Половина замеров в ведре ≤5, половина в ≤100: медиана — верх первого
    // ведра, 95-й — верх второго.
    expect(a.p50).toBe(5);
    expect(a.p95).toBe(100);
    expect(a.avg).toBe(47);
    // Самые дорогие сверху: fn:b (1×2000) дороже fn:a (20×47=940).
    expect(rows[0].name).toBe("fn:b");
  });

  it("не портит исходные снимки при слиянии", () => {
    perfReset();
    note("x", 10);
    const w = perfRaw().aggs;
    const before = JSON.stringify(w);
    mergeRaw([w, w]);
    expect(JSON.stringify(w)).toBe(before);
  });
});
