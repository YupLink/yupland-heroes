// Очередь плашек «Сломан: …» (§8.63 п.3): удар кладёт поломки сразу и
// перечитывает героя; видно до трёх; через 5 секунд плашка уходит и на сервере
// помечается показанной — один раз, без повторов.
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";

vi.mock("@/server/api/art-repair/art-broken", () => ({
  getArtBrokenOn: vi.fn(),
  getArtBreakNotices: vi.fn(),
  markArtBreakShown: vi.fn(async () => ({ ok: true, marked: 1 })),
}));

const { ART_BREAK_NOTICES_KEY, finishArtBreak, scheduleArtBreak, takeArtBreaks, visibleArtBreaks } =
  await import("./useArtBroken");
const { HERO_QUERY_KEYS } = await import("@/lib/query");

const note = (id: string) => ({ id, itemId: `u_${id}`, name: `Арт ${id}`, imageUrl: null });
type Queue = { items: ReturnType<typeof note>[] };

afterEach(() => vi.useRealTimers());

describe("takeArtBreaks — ответ удара", () => {
  it("поломки — в очередь сразу, без повторов; всё героево — перечитать", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    qc.setQueryData<Queue>(ART_BREAK_NOTICES_KEY, { items: [note("a")] });
    takeArtBreaks(qc, [note("a"), note("b")]);
    expect(qc.getQueryData<Queue>(ART_BREAK_NOTICES_KEY)?.items.map((n) => n.id)).toEqual([
      "a",
      "b",
    ]);
    const keys = spy.mock.calls.map((c) => (c[0] as { queryKey: string[] }).queryKey[0]);
    for (const k of ["my-hero-gear", "my-game-items", "my-heroes", "hero-card"]) {
      expect(keys).toContain(k);
    }
    expect(keys).toEqual([...HERO_QUERY_KEYS]);
  });

  it("ничего не сломалось — кэш не трогаем", () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    takeArtBreaks(qc, []);
    takeArtBreaks(qc, undefined);
    expect(qc.getQueryData(ART_BREAK_NOTICES_KEY)).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe("плашки над героем", () => {
  it("видно до трёх, по очереди", () => {
    const items = ["1", "2", "3", "4"].map(note);
    expect(visibleArtBreaks(items).map((n) => n.id)).toEqual(["1", "2", "3"]);
    expect(visibleArtBreaks(undefined)).toEqual([]);
  });

  it("таймер — 5 секунд, отмена гасит его", () => {
    vi.useFakeTimers();
    const done = vi.fn();
    scheduleArtBreak("x", done);
    vi.advanceTimersByTime(4999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledWith("x");
    const late = vi.fn();
    scheduleArtBreak("y", late)();
    vi.advanceTimersByTime(10_000);
    expect(late).not.toHaveBeenCalled();
  });

  it("ушла — из очереди сразу, на сервере «показано» один раз; следующая встаёт на место", () => {
    const qc = new QueryClient();
    qc.setQueryData<Queue>(ART_BREAK_NOTICES_KEY, { items: ["p1", "p2", "p3", "p4"].map(note) });
    const mark = vi.fn(async () => undefined);
    finishArtBreak(qc, "p1", mark);
    finishArtBreak(qc, "p1", mark);
    expect(mark).toHaveBeenCalledTimes(1);
    expect(mark).toHaveBeenCalledWith(["p1"]);
    const left = qc.getQueryData<Queue>(ART_BREAK_NOTICES_KEY)?.items ?? [];
    expect(visibleArtBreaks(left).map((n) => n.id)).toEqual(["p2", "p3", "p4"]);
    // Перечитанная очередь вернула показанную (пометка ещё в пути) — не всплывает.
    expect(visibleArtBreaks(["p1", "p2"].map(note)).map((n) => n.id)).toEqual(["p2"]);
  });

  it("сбой пометки не роняет плашку", async () => {
    const qc = new QueryClient();
    const mark = vi.fn(async () => {
      throw new Error("offline");
    });
    expect(() => finishArtBreak(qc, "q1", mark)).not.toThrow();
    await Promise.resolve();
    expect(mark).toHaveBeenCalledTimes(1);
  });
});
