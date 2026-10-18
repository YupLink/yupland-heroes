// Расписание турнира (UTC) в форме и тело сохранения; артефакт по редкости —
// «Любой» или конкретный.
import { describe, expect, it } from "vitest";
import type { TourAdminRow } from "@/lib/tournament/types";
import {
  draftError,
  draftOfRow,
  emptyTourDraft,
  prizeOfDraft,
  prizeOfUiKind,
  savePayload,
  uiKindOf,
  type TourDraft,
} from "./tourDraft";
import { isoOfUtcInput, plannedEnd, scheduleError, spanDays, utcInputOf } from "./tourSchedule";

const NOW = Date.parse("2026-10-04T12:00:00Z");
const draft = (patch: Partial<TourDraft> = {}): TourDraft => ({
  ...emptyTourDraft(),
  name: "Урон",
  bands: [{ places: "1", prizes: [{ ...prizeOfUiKind("darai"), amount: "100" }] }],
  ...patch,
});

describe("поля времени ↔ ISO UTC", () => {
  it("поле читается как UTC, без пояса браузера", () => {
    expect(isoOfUtcInput("2026-10-05T00:00")).toBe("2026-10-05T00:00:00.000Z");
    expect(isoOfUtcInput("2026-10-11T23:52:00")).toBe("2026-10-11T23:52:00.000Z");
    expect(isoOfUtcInput("  ")).toBeNull();
    expect(isoOfUtcInput("2026-02-30T00:00")).toBeUndefined();
    expect(isoOfUtcInput("завтра")).toBeUndefined();
  });

  it("ISO с сервера → поле; пусто → пусто", () => {
    expect(utcInputOf("2026-10-05T00:00:00+00:00")).toBe("2026-10-05T00:00");
    expect(utcInputOf("2026-10-05T03:00:00+03:00")).toBe("2026-10-05T00:00");
    expect(utcInputOf(null)).toBe("");
  });

  it("дни из начала и конца — вверх: 05.10 00:00 → 11.10 23:52 = 7", () => {
    expect(spanDays("2026-10-05T00:00", "2026-10-11T23:52")).toBe(7);
    expect(spanDays("2026-10-05T00:00", "2026-10-05T01:00")).toBe(1);
    expect(spanDays("2026-10-05T00:00", "")).toBeNull();
  });
});

describe("время → тело сохранения", () => {
  it("начало и конец уходят ISO UTC, дни — из них, а не из поля", () => {
    const p = savePayload(
      draft({ startAt: "2026-10-05T00:00", endAt: "2026-10-11T23:52", days: "3" }),
    );
    expect(p.startAt).toBe("2026-10-05T00:00:00.000Z");
    expect(p.endAt).toBe("2026-10-11T23:52:00.000Z");
    expect(p.days).toBe(7);
  });

  it("пустое время — null (старт кнопкой), дни из поля", () => {
    const p = savePayload(draft({ days: "5" }));
    expect(p.startAt).toBeNull();
    expect(p.endAt).toBeNull();
    expect(p.days).toBe(5);
  });

  it("только начало — конец через дни", () => {
    const p = savePayload(draft({ startAt: "2026-10-05T00:00", days: "7" }));
    expect(p).toMatchObject({ startAt: "2026-10-05T00:00:00.000Z", endAt: null, days: 7 });
  });

  it("строка сервера с расписанием → черновик → то же время", () => {
    const row = {
      ...({} as TourAdminRow),
      id: "t1",
      name: "Шаги",
      metric: "steps",
      days: 7,
      bands: [],
      startAt: "2026-10-05T00:00:00Z",
      endAt: "2026-10-11T23:52:00Z",
      entryPrice: [],
    } as TourAdminRow;
    const d = draftOfRow(row);
    expect([d.startAt, d.endAt]).toEqual(["2026-10-05T00:00", "2026-10-11T23:52"]);
    expect(savePayload(d).endAt).toBe("2026-10-11T23:52:00.000Z");
  });
});

describe("ошибки расписания", () => {
  it("конец раньше начала (и равен ему) — ошибка формы", () => {
    const d = draft({ startAt: "2026-10-11T00:00", endAt: "2026-10-05T00:00" });
    expect(draftError(d, NOW)).toBe("tour.err.end_before_start");
    expect(scheduleError("2026-10-05T00:00", "2026-10-05T00:00")).toBe("tour.err.end_before_start");
  });

  it("конец без начала, мусор, начало в прошлом, больше 90 дней", () => {
    expect(draftError(draft({ endAt: "2026-10-11T23:52" }), NOW)).toBe("tour.err.end_no_start");
    expect(draftError(draft({ startAt: "2026-02-30T00:00" }), NOW)).toBe("tour.err.time");
    expect(draftError(draft({ startAt: "2026-10-04T11:59" }), NOW)).toBe("tour.err.start_past");
    expect(scheduleError("2026-10-04T11:59", "")).toBeNull();
    expect(scheduleError("2026-10-05T00:00", "2027-01-05T00:00")).toBe("tour.err.days");
  });

  it("черновик с прошлым нетронутым началом сохраняется (автостарт не прошёл — правят призы)", () => {
    const row = {
      ...({} as TourAdminRow),
      id: "t9",
      name: "Шаги",
      metric: "steps",
      days: 7,
      bands: [{ places: "1", prizes: [{ kind: "token", amount: 100, refId: "Darai" }] }],
      startAt: "2026-10-04T00:00:00Z",
      endAt: "2026-10-10T23:52:00Z",
      entryPrice: [],
    } as TourAdminRow;
    const d = draftOfRow(row);
    expect(draftError(d, NOW)).toBeNull();
    // Перенёс на другое прошлое время — уже ошибка; новый черновик — тоже.
    expect(draftError({ ...d, startAt: "2026-10-04T01:00" }, NOW)).toBe("tour.err.start_past");
    expect(draftError({ ...d, id: null }, NOW)).toBe("tour.err.start_past");
    expect(scheduleError("2026-10-04T00:00", "", NOW, "2026-10-04T00:00")).toBeNull();
  });

  it("верное расписание — без ошибки; поле «Дней» тогда не проверяется", () => {
    const d = draft({ startAt: "2026-10-05T00:00", endAt: "2026-10-11T23:52", days: "" });
    expect(draftError(d, NOW)).toBeNull();
    expect(draftError(draft({ days: "" }), NOW)).toBe("tour.err.days");
  });

  it("конец на плашке: заданный или начало + дни", () => {
    expect(plannedEnd("2026-10-05T00:00:00Z", null, 7)).toBe("2026-10-12T00:00:00.000Z");
    expect(plannedEnd("2026-10-05T00:00:00Z", "2026-10-11T23:52:00Z", 7)).toBe(
      "2026-10-11T23:52:00Z",
    );
    expect(plannedEnd(null, null, 7)).toBeNull();
  });
});

describe("артефакт по редкости: любой или конкретный", () => {
  it("любой — refId 'rarity:<r>'", () => {
    const any = { ...prizeOfUiKind("art_rarity"), amount: "1" };
    expect(uiKindOf(any)).toBe("art_rarity");
    expect(prizeOfDraft(any)).toMatchObject({ kind: "art", refId: "rarity:legendary" });
  });

  it("конкретный — приз art с id шаблона; окно помнит, что выбирали по редкости", () => {
    const exact = {
      kind: "art" as const,
      amount: "1",
      refId: "art_sword",
      title: "Меч",
      image: "/s.webp",
      rarity: "legendary",
    };
    expect(uiKindOf(exact)).toBe("art_rarity");
    expect(prizeOfDraft(exact)).toEqual({
      kind: "art",
      amount: 1,
      refId: "art_sword",
      title: "Меч",
      image: "/s.webp",
    });
    expect(draftError(draft({ bands: [{ places: "1", prizes: [exact] }] }), NOW)).toBeNull();
  });
});
