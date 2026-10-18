// Карта в кэше: правка не должна пересобирать индекс клеток и обходить колонки
// по 82 тыс. чисел (лаги 10–11.10.2026: индекс собирался каждые 1–2 с).
import { describe, expect, it, vi } from "vitest";
import { QueryObserver } from "@tanstack/react-query";

vi.stubGlobal("window", undefined);
const { getQueryClient } = await import("@/lib/query");
const { cellIndex } = await import("./cellIndex");
const { markCellDefeated } = await import("./markDefeated");

const N = 1000;
const col = () => Array.from({ length: N }, (_, i) => i);
const packed = () => ({
  q: col(),
  r: col().map(() => 0),
  t: col(),
  road: col(),
  obj: col(),
  dec: col(),
  bld: col(),
  defeated: [] as number[],
});

describe("карта в кэше", () => {
  it("колонки кладутся как есть — без структурного разделения", async () => {
    const qc = getQueryClient();
    const p = packed();
    const obs = new QueryObserver(qc, {
      queryKey: ["beta-raid-map"],
      queryFn: async () => ({ packed: p }),
      staleTime: Infinity,
    });
    const stop = obs.subscribe(() => {});
    await new Promise((r) => setTimeout(r, 20));
    const next = { ...p, obj: [...p.obj] };
    next.obj[3] = 99;
    qc.setQueryData(["beta-raid-map"], { packed: next });
    expect(qc.getQueryData<{ packed: object }>(["beta-raid-map"])!.packed).toBe(next);
    stop();
  });

  it("отметка «добыт» переносит индекс клеток на новые колонки", () => {
    const qc = getQueryClient();
    const p = packed();
    const at = cellIndex(p as never);
    qc.setQueryData(["beta-raid-map"], { packed: p });
    markCellDefeated(qc, 5, 0);
    const out = qc.getQueryData<{ packed: ReturnType<typeof packed> }>(["beta-raid-map"])!.packed;
    expect(out).not.toBe(p);
    expect(out.defeated).toEqual([5]);
    expect(cellIndex(out as never)).toBe(at);
  });
});
