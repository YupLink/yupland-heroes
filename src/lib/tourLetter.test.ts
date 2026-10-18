// Письмо о турнирах: эталон «9 королей» (одобрен владельцем 04.10) и все
// развилки — одинаковые/разные сроки, призы, цены, бесплатно, серия/без, ru/en.
import { describe, expect, it } from "vitest";
import type { TourBand, TourMetric } from "@/lib/tournament/types";
import { buildTourLetter, type TourLetterTour } from "./tourLetter";

const START = "2026-10-05T00:00:00.000Z";
const END = "2026-10-11T23:59:00.000Z";

const band = (places: string, darai: number, gold: number, rarity: string): TourBand => ({
  places,
  prizes: [
    { kind: "token", amount: darai, refId: "Darai", title: null },
    { kind: "resource", amount: gold, refId: "gold", title: "Золото" },
    { kind: "art", amount: 1, refId: `rarity:${rarity}`, title: "Артефакт" },
  ],
});
// Раскладка черновиков tour_draft_* на проде (04.10): «4-10» нарочно раньше «1».
const KINGS: TourBand[] = [
  band("4-10", 5_454_545, 10_000, "rare"),
  band("1", 27_272_727, 50_000, "legendary"),
  band("2-3", 13_636_364, 25_000, "epic"),
  band("11-20", 2_727_273, 5_000, "common"),
];

const tour = (name: string, metric: TourMetric, over: Partial<TourLetterTour> = {}) => ({
  name,
  metric,
  startAt: START,
  endAt: END,
  days: 7,
  fundDarai: 120_000_000,
  bands: KINGS,
  entryPrice: [{ resource: "gold" as const, amount: 5 }],
  ...over,
});

const NINE: TourLetterTour[] = [
  tour("Урон", "damage"),
  tour("Золото", "gold"),
  tour("Дерево", "wood"),
  tour("Камень", "stone"),
  tour("Рубка деревьев", "chop"),
  tour("Убийства боссов", "boss_kills"),
  tour("Шаги", "steps"),
  tour("Энергия на шаги", "step_energy"),
  tour("Фарм шахт", "farm"),
];

describe("письмо о турнирах — эталон «9 королей»", () => {
  it("ru: общее — один раз, список категорий, запись и цена", () => {
    const l = buildTourLetter({ series: "9 королей", tournaments: NINE, arenas: ["Арена"] }, "ru");
    expect(l.title).toBe("Объявлен турнир «9 королей»");
    expect(l.body).toBe(
      [
        "9 турниров одновременно.",
        "С понедельника 5 октября 00:00 до воскресенья 11 октября 23:59 (UTC).",
        [
          "• Урон — кто нанесёт больше урона монстрам и боссам",
          "• Золото — кто больше заработает на торговле",
          "• Дерево — кто добудет больше дерева",
          "• Камень — кто добудет больше камня",
          "• Рубка деревьев — кто срубит больше деревьев",
          "• Убийства боссов — кто добьёт больше монстров и боссов",
          "• Шаги — кто пройдёт больше шагов",
          "• Энергия на шаги — кто потратит больше энергии на шаги",
          "• Фарм шахт — у кого больше шахт — очко в день за каждую",
        ].join("\n"),
        "В каждом турнире фонд 120 млн DARAI. Призы: " +
          "1 место — 27,3 млн DARAI, 50 000 золота и легендарный артефакт; " +
          "2–3 места — каждому 13,6 млн DARAI, 25 000 золота и эпический артефакт; " +
          "4–10 места — каждому 5,5 млн DARAI, 10 000 золота и редкий артефакт; " +
          "11–20 места — каждому 2,7 млн DARAI, 5 000 золота и обычный артефакт.",
        "Запись — в здании «Арена». Цена записи — 5 золота за каждый турнир.\n" +
          "Очки считаются только после записи.",
      ].join("\n\n"),
    );
  });

  it("en: тот же смысл, имена турниров — категориями, арена — переводом", () => {
    const l = buildTourLetter({ series: "9 Kings", tournaments: NINE, arenas: ["Арена"] }, "en");
    expect(l.title).toBe("Tournament “9 Kings” announced");
    const p = l.body.split("\n\n");
    expect(p[0]).toBe("9 tournaments at the same time.");
    expect(p[1]).toBe("From Monday, October 5, 00:00 to Sunday, October 11, 23:59 (UTC).");
    expect(p[2].split("\n")[0]).toBe(
      "• Boss damage — who deals the most damage to monsters and bosses",
    );
    expect(p[2].split("\n")[8]).toBe(
      "• Mines held — who owns the most mines — a point a day per mine",
    );
    expect(p[3]).toBe(
      "Each tournament has a 120M DARAI prize pool. Prizes: " +
        "place 1 — 27.3M DARAI, 50,000 gold and a legendary artifact; " +
        "places 2–3 — 13.6M DARAI, 25,000 gold and an epic artifact each; " +
        "places 4–10 — 5.5M DARAI, 10,000 gold and a rare artifact each; " +
        "places 11–20 — 2.7M DARAI, 5,000 gold and a common artifact each.",
    );
    expect(p[4]).toBe(
      "Sign up at the “Arena” building. Entry fee — 5 gold per tournament.\n" +
        "Points count only after you sign up.",
    );
  });
});

describe("письмо о турнирах — развилки", () => {
  it("один турнир без серии: заголовок по имени, без «N турниров», цена без «за каждый»", () => {
    const l = buildTourLetter({ series: "  ", tournaments: [NINE[0]], arenas: [] }, "ru");
    expect(l.title).toBe("Объявлен турнир «Урон»");
    expect(l.body).not.toContain("одновременно");
    expect(l.body).toContain("Фонд 120 млн DARAI. Призы: 1 место — 27,3 млн DARAI");
    expect(l.body).toContain("Запись — в здании с турнирами. Цена записи — 5 золота.\n");
    const en = buildTourLetter({ series: null, tournaments: [NINE[0]], arenas: [] }, "en");
    expect(en.title).toBe("Tournament “Boss damage” announced");
    expect(en.body).toContain("Prize pool: 120M DARAI. Prizes: place 1");
    expect(en.body).toContain("Sign up at the tournament building. Entry fee — 5 gold.\n");
  });

  it("несколько без серии — «Объявлены турниры»; две арены — через запятую", () => {
    const input = {
      series: null,
      tournaments: NINE.slice(0, 2),
      arenas: ["Арена", "Колизей", "Арена"],
    };
    const ru = buildTourLetter(input, "ru");
    expect(ru.title).toBe("Объявлены турниры");
    expect(ru.body.startsWith("2 турнира одновременно.")).toBe(true);
    expect(ru.body).toContain("Запись — в зданиях «Арена», «Колизей».");
    expect(buildTourLetter(input, "en").title).toBe("Tournaments announced");
  });

  it("разные сроки, призы и цены — у каждого турнира в его абзаце", () => {
    const a = tour("Урон", "damage");
    const b = tour("Шаги", "steps", {
      startAt: "2026-10-07T12:00:00.000Z",
      endAt: null,
      days: 3,
      fundDarai: 0,
      bands: [{ places: "1", prizes: [{ kind: "energy", amount: 100 }] }],
      entryPrice: [],
    });
    const p = buildTourLetter(
      { series: null, tournaments: [a, b], arenas: ["Арена"] },
      "ru",
    ).body.split("\n\n");
    // Сроки разные — не «одновременно».
    expect(p[0]).toBe("2 турнира.");
    expect(p[1].split("\n")).toEqual([
      "• Урон — кто нанесёт больше урона монстрам и боссам",
      "С понедельника 5 октября 00:00 до воскресенья 11 октября 23:59 (UTC).",
      expect.stringMatching(/^Фонд 120 млн DARAI\. Призы: 1 место — 27,3 млн DARAI/),
      "Цена записи — 5 золота.",
    ]);
    expect(p[2].split("\n")).toEqual([
      "• Шаги — кто пройдёт больше шагов",
      "Со среды 7 октября 12:00 (UTC), на 3 дня.",
      "Призы: 1 место — 100 энергии.",
      "Запись бесплатная.",
    ]);
    // Общих строк нет: ни срока, ни фонда, ни цены отдельным абзацем.
    expect(p[3]).toBe("Запись — в здании «Арена».\nОчки считаются только после записи.");
    expect(p).toHaveLength(4);
  });

  it("сроки не пересекаются — без «одновременно» (ru и en)", () => {
    const a = tour("Урон", "damage");
    const b = tour("Шаги", "steps", {
      startAt: "2026-10-12T00:00:00.000Z",
      endAt: "2026-10-18T23:59:00.000Z",
    });
    const input = { series: null, tournaments: [a, b], arenas: [] };
    const ru = buildTourLetter(input, "ru").body;
    const en = buildTourLetter(input, "en").body;
    expect(ru.split("\n\n")[0]).toBe("2 турнира.");
    expect(ru).not.toContain("одновременно");
    expect(en.split("\n\n")[0]).toBe("2 tournaments.");
    expect(en).not.toContain("at the same time");
  });

  it("серия по-русски — в английском заголовке её нет, кириллицы тоже", () => {
    const many = buildTourLetter({ series: "9 королей", tournaments: NINE, arenas: [] }, "en");
    expect(many.title).toBe("Tournaments announced");
    const one = buildTourLetter({ series: "9 королей", tournaments: [NINE[0]], arenas: [] }, "en");
    expect(one.title).toBe("Tournament “Boss damage” announced");
    expect(/[а-яё]/i.test(many.title + one.title)).toBe(false);
    // В русском — серия как есть.
    expect(
      buildTourLetter({ series: "9 королей", tournaments: NINE, arenas: [] }, "ru").title,
    ).toBe("Объявлен турнир «9 королей»");
  });

  it("одинаковые сроки и призы, но разная цена — срок и призы один раз, цена у каждого", () => {
    const a = tour("Урон", "damage", { entryPrice: [{ resource: "gold", amount: 10 }] });
    const b = tour("Шаги", "steps");
    const p = buildTourLetter({ series: null, tournaments: [a, b], arenas: [] }, "ru").body.split(
      "\n\n",
    );
    expect(p[1]).toMatch(/^С понедельника/);
    expect(p[2]).toBe(
      "• Урон — кто нанесёт больше урона монстрам и боссам\nЦена записи — 10 золота.",
    );
    expect(p[3]).toBe("• Шаги — кто пройдёт больше шагов\nЦена записи — 5 золота.");
    expect(p[4]).toMatch(/^В каждом турнире фонд 120 млн DARAI/);
    expect(p[5]).toBe("Запись — в здании с турнирами.\nОчки считаются только после записи.");
  });

  it("бесплатно у всех — «Запись бесплатная.» один раз", () => {
    const free = NINE.slice(0, 3).map((t) => ({ ...t, entryPrice: [] }));
    const ru = buildTourLetter({ series: null, tournaments: free, arenas: ["Арена"] }, "ru").body;
    expect(ru).toContain("Запись — в здании «Арена». Запись бесплатная.\n");
    expect(ru).not.toContain("Цена записи");
    const en = buildTourLetter({ series: null, tournaments: free, arenas: ["Арена"] }, "en").body;
    expect(en).toContain("Sign up at the “Arena” building. Entry is free.\n");
  });
});
