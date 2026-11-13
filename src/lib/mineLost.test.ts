// Уведомление «шахту отняли» — только что случилось и клетка (владелец:
// «краткость и лаконичность»), несколько — по строке; готово к сбору у строки
// «Добычи»: отнятая — сумма журнала, своя — живой счёт.
import { describe, expect, it } from "vitest";
import { dict } from "@/lib/translations";
import {
  digestOf,
  lostCore,
  lostDigest,
  lostMushroomOf,
  lostPlace,
  lostText,
  mineRowReady,
  LOST_NOTE_LINES,
} from "@/lib/mineLost";

const tr =
  (lang: "ru" | "en") =>
  (key: string, vars?: Record<string, string | number>): string =>
    (dict[key]?.[lang] ?? key).replace(/\{(\w+)\}/g, (_m, k: string) => String(vars?.[k] ?? ""));

describe("уведомление «шахту отняли»", () => {
  it("одна строка: только что и клетка, оба языка", () => {
    const d = lostDigest([{ kind: "capture", q: 12, r: -7 }]);
    expect(lostText(tr("ru"), d)).toBe("Шахту захватили (12, -7)");
    expect(lostText(tr("en"), d)).toBe("Your mine was captured (12, -7)");
    const kinds = lostDigest([
      { kind: "take", q: 1, r: 2 },
      { kind: "break", q: 3, r: 4 },
      { kind: "dismantle", q: 5, r: 6 },
      { kind: "expire", q: 7, r: 8 },
    ]);
    expect(lostText(tr("ru"), kinds)).toBe(
      "Гриб подняли (1, 2)\nШахта сломалась (3, 4)\nШахту разобрали (5, 6)\nГриб сгнил (7, 8)",
    );
    expect(lostText(tr("en"), kinds).split("\n")).toHaveLength(4);
  });

  it("гриб — с видом (подняли, сгнил), у шахт вида нет", () => {
    expect(lostMushroomOf("take", "token", "Darai")).toBe("darai");
    expect(lostMushroomOf("take", "gold", null)).toBe("gold");
    expect(lostMushroomOf("expire", "diamonds", null)).toBe("diamonds");
    expect(lostMushroomOf("capture", "gold", null)).toBeNull();
    expect(lostMushroomOf("break", "diamonds", null)).toBeNull();
    expect(lostMushroomOf("take", "wood", null)).toBeNull();
    const d = lostDigest([
      { kind: "take", q: -96, r: 74, mushroom: "darai" },
      { kind: "take", q: 1, r: 2, mushroom: "gold" },
      { kind: "expire", q: 3, r: 4, mushroom: "diamonds" },
      { kind: "expire", q: 5, r: 6 },
      { kind: "capture", q: 7, r: 8, mushroom: "gold" },
    ]);
    expect(lostText(tr("ru"), d).split("\n")).toEqual([
      "Гриб DARAI подняли (-96, 74)",
      "Золотой гриб подняли (1, 2)",
      "Алмазный гриб сгнил (3, 4)",
      "Гриб сгнил (5, 6)",
      "Шахту захватили (7, 8)",
    ]);
    expect(lostText(tr("en"), d).split("\n")).toEqual([
      "Your DARAI mushroom was picked up (-96, 74)",
      "Your gold mushroom was picked up (1, 2)",
      "Your diamond mushroom rotted (3, 4)",
      "Your mushroom rotted (5, 6)",
      "Your mine was captured (7, 8)",
    ]);
    // Вид доезжает живым каналом; чужой — отбрасывается.
    expect(digestOf(JSON.parse(JSON.stringify(d)))).toEqual(d);
    expect(digestOf({ notes: [{ kind: "take", q: 1, r: 2, mushroom: "ruby" }] })?.notes[0]).toEqual(
      { kind: "take", q: 1, r: 2 },
    );
  });

  it("длинная пачка — обрезана с «…»; из канала — только знакомые поля", () => {
    const many = lostDigest(
      Array.from({ length: LOST_NOTE_LINES + 3 }, (_, i) => ({
        kind: "capture" as const,
        q: i,
        r: 0,
      })),
    );
    const lines = lostText(tr("ru"), many).split("\n");
    expect(lines).toHaveLength(LOST_NOTE_LINES + 1);
    expect(lines.at(-1)).toBe("…");
    expect(digestOf(JSON.parse(JSON.stringify(many)))).toEqual(many);
    expect(digestOf({ notes: [] })).toBeNull();
    expect(digestOf({ notes: [{ kind: "x", q: "3", r: 4, by: "thief" }] })).toEqual({
      count: 1,
      notes: [{ kind: "capture", q: 3, r: 4 }],
    });
  });

  it("готово к сбору: отнятая — её сумма, своя — целые часы × выход", () => {
    const base = { capturedAt: 0, claimedHours: 0, yield: 0, maxHours: null };
    expect(mineRowReady({ ...base, lost: { id: "mcl_1", amount: 40 } })).toBe(40);
    const now = Date.parse("2026-10-23T12:00:00Z");
    const own = { capturedAt: now - 3.5 * 3_600_000, claimedHours: 0, yield: 10, maxHours: null };
    expect(mineRowReady(own, now)).toBe(30);
  });
});

describe("вид шахты и мир (§8.106)", () => {
  it("«Каменную шахту захватили — Асгард (1, 2)»: падежи по виду, оба языка", () => {
    const d = lostDigest([
      { kind: "capture", q: 1, r: 2, resource: "stone", world: "Асгард" },
      { kind: "break", q: 3, r: 4, resource: "wood", world: "Мир Альфа" },
      { kind: "dismantle", q: 5, r: 6, resource: "diamonds" },
      { kind: "level", q: 7, r: 8, resource: "gold", world: "Хель" },
      { kind: "capture", q: 9, r: 0, resource: "token", world: "Асгард" },
    ]);
    expect(lostText(tr("ru"), d).split("\n")).toEqual([
      "Каменную шахту захватили — Асгард (1, 2)",
      "Лесопилка сломалась — Мир Альфа (3, 4)",
      "Алмазную шахту разобрали (5, 6)",
      "Золотой шахте снизили уровень — Хель (7, 8)",
      "Шахту захватили — Асгард (9, 0)",
    ]);
    expect(lostText(tr("en"), d).split("\n")).toEqual([
      "Your stone mine was captured — Асгард (1, 2)",
      "Your sawmill broke down — Мир Альфа (3, 4)",
      "Your diamond mine was dismantled (5, 6)",
      "Your gold mine lost a level — Хель (7, 8)",
      "Your mine was captured — Асгард (9, 0)",
    ]);
  });

  it("гриб — по виду гриба, ресурс шахты не мешает; место отдельно", () => {
    expect(lostCore(tr("ru"), { kind: "take", mushroom: "gold", resource: "gold" })).toBe(
      "Золотой гриб подняли",
    );
    expect(lostPlace({ q: -1, r: 5, world: null })).toBe("(-1, 5)");
    expect(lostPlace({ q: -1, r: 5, world: "Асгард" })).toBe("Асгард (-1, 5)");
  });

  it("из канала: id, вид и мир — только строками, длинные обрезаны", () => {
    const d = digestOf({
      count: 1,
      notes: [
        { kind: "capture", q: 1, r: 2, id: "mcl_1", resource: "wood", world: "W".repeat(300) },
      ],
    });
    expect(d?.notes[0]).toEqual({
      kind: "capture",
      q: 1,
      r: 2,
      id: "mcl_1",
      resource: "wood",
      world: "W".repeat(120),
    });
    expect(digestOf({ notes: [{ kind: "capture", q: 1, r: 2, world: 5 }] })?.notes[0]).toEqual({
      kind: "capture",
      q: 1,
      r: 2,
    });
  });
});
