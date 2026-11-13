import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: vi.fn(async () => []) }));

import { FROZEN_MS, nextSeen, rateAlarms, type RateFacts } from "./rate-watch";

const NOW = 1_800_000_000_000;
const ok: RateFacts = { router: 2_016_000, feed: 2_021_000, game: 2_016_000, seen: null, now: NOW };
const keys = (f: Partial<RateFacts>) => rateAlarms({ ...ok, ...f }).map((a) => a.key);

describe("сторож курса DARAI (04.11.2026)", () => {
  it("всё сходится — тишина", () => {
    expect(keys({})).toEqual([]);
  });

  it("застывший индексер 04.11: курс игры 1,71 млн против 2,02 млн на обмене — тревога", () => {
    expect(keys({ game: 1_708_420 })).toEqual(["game"]);
  });

  it("источники Ref расходятся больше 5 %", () => {
    expect(keys({ feed: 1_708_420 })).toEqual(["sources"]);
    expect(keys({ feed: 2_100_000 })).toEqual([]);
  });

  it("курс игры не менялся 6 часов — застыл", () => {
    const seen = { v: ok.game!, since: NOW - FROZEN_MS };
    expect(keys({ seen })).toEqual(["frozen"]);
    expect(keys({ seen: { ...seen, since: NOW - FROZEN_MS + 60_000 } })).toEqual([]);
    expect(keys({ seen: { ...seen, v: 1 } })).toEqual([]);
  });

  it("курса нет — цены за DARAI пропали", () => {
    expect(keys({ game: null })).toEqual(["none"]);
  });

  it("отсчёт «не менялся» начинается заново, когда курс сменился", () => {
    const prev = { v: 5, since: 1 };
    expect(nextSeen(prev, 5, NOW)).toBe(prev);
    expect(nextSeen(prev, 6, NOW)).toEqual({ v: 6, since: NOW });
    expect(nextSeen(prev, null, NOW)).toBe(prev);
    expect(nextSeen(null, 7, NOW)).toEqual({ v: 7, since: NOW });
  });
});
