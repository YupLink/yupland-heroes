// Запись на турнир: какую кнопку показать, полки «Идут / Скоро / Прошлые»,
// отметка после записи, время по UTC.
import { describe, expect, it } from "vitest";
import { TOUR_DEFAULT_ENTRY_PRICE, type TourPlate } from "@/lib/tournament/types";
import { joinView, markJoined, shelvePlates, utcStamp } from "./tourJoin";

const GOLD5 = [{ resource: "gold" as const, amount: 5 }];

const NOW = Date.parse("2026-10-04T12:00:00Z");
const HOUR = 3_600_000;
const at = (ms: number) => new Date(NOW + ms).toISOString();

const plate = (over: Partial<TourPlate> = {}): TourPlate => ({
  id: "t1",
  name: "Турнир",
  metric: "damage",
  status: "running",
  startedAt: at(-HOUR),
  endsAt: at(24 * HOUR),
  finishedAt: null,
  players: 0,
  myPlace: null,
  myScore: null,
  bands: [],
  startAt: null,
  endAt: null,
  joined: false,
  entryPrice: GOLD5,
  ...over,
});

describe("кнопка записи", () => {
  it("идущий, не записан — «Записаться» с ценой сервера", () => {
    expect(joinView(plate(), NOW)).toEqual({ kind: "join", price: GOLD5 });
    const mixed = [
      { resource: "gold" as const, amount: 7 },
      { resource: "token" as const, token: "Darai", amount: 1000 },
    ];
    expect(joinView(plate({ entryPrice: mixed }), NOW)).toEqual({ kind: "join", price: mixed });
  });

  it("бесплатная запись — кнопка без цены", () => {
    expect(joinView(plate({ entryPrice: [] }), NOW)).toEqual({ kind: "join", price: [] });
  });

  it("цена не пришла (старый снимок кэша) — 5 золота, как велел владелец", () => {
    const old = { ...plate(), entryPrice: undefined } as unknown as TourPlate;
    expect(joinView(old, NOW)).toEqual({ kind: "join", price: TOUR_DEFAULT_ENTRY_PRICE });
    expect(TOUR_DEFAULT_ENTRY_PRICE).toEqual(GOLD5);
  });

  it("запланированный (черновик со стартом) — можно записаться заранее", () => {
    const soon = plate({ status: "draft", startedAt: null, endsAt: null, startAt: at(HOUR) });
    expect(joinView(soon, NOW)).toEqual({ kind: "join", price: GOLD5 });
  });

  it("черновик без времени, выплата, прошлый — без кнопки", () => {
    expect(joinView(plate({ status: "draft", startAt: null }), NOW)).toBeNull();
    expect(joinView(plate({ status: "paying" }), NOW)).toBeNull();
    expect(joinView(plate({ status: "done", finishedAt: at(-HOUR) }), NOW)).toBeNull();
  });

  it("время идущего вышло, итогов ещё нет — платить не за что", () => {
    expect(joinView(plate({ endsAt: at(-1) }), NOW)).toBeNull();
    expect(joinView(plate({ endsAt: at(0) }), NOW)).toBeNull();
  });

  it("записан — «Вы участвуете» у идущего, выплаты и запланированного; у прошлого — ничего", () => {
    expect(joinView(plate({ joined: true }), NOW)).toEqual({ kind: "joined" });
    expect(joinView(plate({ joined: true, status: "paying" }), NOW)).toEqual({ kind: "joined" });
    expect(joinView(plate({ joined: true, status: "draft", startAt: at(HOUR) }), NOW)).toEqual({
      kind: "joined",
    });
    expect(joinView(plate({ joined: true, status: "done" }), NOW)).toBeNull();
  });
});

describe("полки окна", () => {
  it("идущие и выплата — «Идут», черновик со стартом — «Скоро», готовые — «Прошлые»", () => {
    const s = shelvePlates({
      active: [
        plate({ id: "late", endsAt: at(48 * HOUR) }),
        plate({ id: "pay", status: "paying", endsAt: at(-HOUR) }),
        plate({ id: "d2", status: "draft", startAt: at(5 * HOUR) }),
      ],
      soon: [plate({ id: "d1", status: "draft", startAt: at(2 * HOUR) })],
      past: [
        plate({ id: "old", status: "done", finishedAt: at(-48 * HOUR) }),
        plate({ id: "new", status: "done", finishedAt: at(-HOUR) }),
      ],
    });
    expect(s.active.map((p) => p.id)).toEqual(["pay", "late"]);
    expect(s.soon.map((p) => p.id)).toEqual(["d1", "d2"]);
    expect(s.past.map((p) => p.id)).toEqual(["new", "old"]);
  });

  it("черновик без времени игроку не показываем; дубль по id — один раз", () => {
    const d = plate({ id: "d", status: "draft", startAt: at(HOUR) });
    const s = shelvePlates({
      active: [plate({ id: "x", status: "draft", startAt: null }), d],
      soon: [d],
      past: [],
    });
    expect(s.soon.map((p) => p.id)).toEqual(["d"]);
    expect(s.active).toEqual([]);
  });

  it("нет ответа — пустые полки", () => {
    expect(shelvePlates(undefined)).toEqual({ active: [], soon: [], past: [] });
  });
});

describe("после записи", () => {
  it("плашка сразу «записан», остальные не трогаются, полка «Скоро» сохраняется", () => {
    const data = {
      active: [plate({ id: "a" }), plate({ id: "b" })],
      soon: [plate({ id: "c", status: "draft", startAt: at(HOUR) })],
      past: [],
    };
    const out = markJoined(data, "c");
    expect(out?.soon?.[0].joined).toBe(true);
    expect(out?.active.every((p) => !p.joined)).toBe(true);
    expect(markJoined(data, "a")?.active.map((p) => p.joined)).toEqual([true, false]);
    expect(markJoined({ active: [], past: [] }, "a")).toEqual({ active: [], past: [] });
    expect(markJoined(undefined, "a")).toBeUndefined();
  });
});

describe("время по UTC", () => {
  it("старт 5 октября 00:00 UTC и конец воскресенья 23:52 — без сдвига пояса", () => {
    expect(utcStamp("2026-10-05T00:00:00Z", "ru")).toBe("05.10 00:00");
    expect(utcStamp("2026-10-11T23:52:00Z", "ru")).toBe("11.10 23:52");
    expect(utcStamp("2026-10-05T00:00:00Z", "en")).toBe("Oct 5, 00:00");
    expect(utcStamp("2026-10-05T03:00:00+03:00", "ru")).toBe("05.10 00:00");
  });

  it("нет даты или мусор — null", () => {
    expect(utcStamp(null, "ru")).toBeNull();
    expect(utcStamp("не дата", "en")).toBeNull();
  });
});
