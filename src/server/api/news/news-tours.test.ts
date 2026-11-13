// Турниры в сводке для газеты: какие берём, как подписываем, текст раздела.
import { describe, expect, it } from "vitest";
import {
  NEWS_TOURS_SQL,
  leaderNames,
  newsTourLeadersSql,
  toNewsTour,
} from "@/server/api/news/news-tours";
import { tourLine, tourSection } from "@/lib/news/newsTourText";
import type { TourDbRow } from "@/server/api/tournament/tour-rows";

const MS = (iso: string) => Date.parse(iso);

// «Король Шахт» и «Каменная Лихорадка» — как на проде 07.11.2026.
const farm: TourDbRow & { entries: number } = {
  id: "tour__CGhhCftHW",
  name: "Король Шахт",
  metric: "farm",
  days: 3,
  status: "draft",
  bands: [{ places: "1", prizes: [{ kind: "token", amount: 500, refId: "DARAI" }] }],
  fund: 500,
  created_ms: MS("2026-11-06T10:00:00Z"),
  started_ms: null,
  ends_ms: null,
  finished_ms: null,
  players: 0,
  dry: true,
  start_ms: MS("2026-11-07T18:00:00Z"),
  end_ms: MS("2026-11-10T10:00:00Z"),
  entry_price: [],
  entries: 9,
};
const stone: TourDbRow & { entries: number } = {
  ...farm,
  id: "tour_XHJaJY5OH1",
  name: "Каменная Лихорадка",
  metric: "stone",
  status: "running",
  dry: false,
  start_ms: MS("2026-11-07T13:00:00Z"),
  end_ms: MS("2026-11-10T13:00:00Z"),
  started_ms: MS("2026-11-07T13:00:00Z"),
  ends_ms: MS("2026-11-10T13:00:00Z"),
  entries: 4,
};

describe("турниры газеты: выборка", () => {
  it("идущие боевые и ближайшие запланированные", () => {
    expect(NEWS_TOURS_SQL).toContain("t.status = 'running' AND NOT t.dry");
    expect(NEWS_TOURS_SQL).toContain("min(d.start_at)");
    expect(NEWS_TOURS_SQL).toContain("d.start_at > now()");
  });

  it("лидеры: место по rank, не больше трёх строк на турнир", () => {
    const sql = newsTourLeadersSql(["a'b", "c"]);
    expect(sql).toContain("'a''b', 'c'");
    expect(sql).toContain("rank() OVER");
    expect(sql).toContain("rn <= 3");
  });
});

describe("турниры газеты: строка базы → турнир", () => {
  it("запланированный фарм: расписание, время снимка, призы, запись", () => {
    const t = toNewsTour(farm, "ru");
    expect(t).toMatchObject({
      status: "soon",
      name: "Король Шахт",
      category: "Шахты во владении",
      startAt: "2026-11-07T18:00:00.000Z",
      endAt: "2026-11-10T10:00:00.000Z",
      snapAt: "09:59",
      players: 9,
      fundDarai: 500,
      entry: "Запись бесплатная.",
    });
    expect(t?.term).toBe("С субботы 7 ноября 18:00 до вторника 10 ноября 10:00 (UTC).");
    expect(t?.prizes).toContain("500");
  });

  it("идущий: фактические сроки; не фарм — без времени снимка; по-английски — категория", () => {
    const t = toNewsTour(stone, "en");
    expect(t?.status).toBe("running");
    expect(t?.name).toBe("Stone");
    expect(t?.snapAt).toBeUndefined();
    expect(t?.endAt).toBe("2026-11-10T13:00:00.000Z");
  });

  it("готовый турнир в газету не идёт", () => {
    expect(toNewsTour({ ...stone, status: "done" }, "ru")).toBeNull();
  });

  it("лидеры героями: близнецы помечены, без героя — Безымянный", () => {
    const names = leaderNames(
      ["a", "b", "c"],
      new Map([
        ["a", "Fedr - Stubborn Mage"],
        ["b", "Fedr - Stubborn Mage"],
      ]),
      "ru",
    );
    expect([...names.values()]).toEqual(["Fedr", "Fedr, брат-близнец", "Безымянный"]);
  });
});

describe("турниры газеты: текст", () => {
  it("идущий — с лидерами, скоро — со временем снимка шахт", () => {
    const run = { ...toNewsTour(stone, "ru")!, leaders: [{ place: 1, name: "Fedr", score: 340 }] };
    const soon = toNewsTour(farm, "ru")!;
    const lines = tourSection({ active: [run], soon: [soon] }, "ru");
    expect(lines[1]).toBe("🏟 Турниры");
    expect(lines[2]).toMatch(/^• Идёт «Каменная Лихорадка» — кто добудет больше камня\./);
    expect(lines[2]).toContain("Лидеры: 1. Fedr — 340.");
    expect(lines[3]).toMatch(/^• Скоро «Король Шахт»/);
    expect(lines[3]).toContain("Шахты считаются каждый день в 09:59 UTC.");
    expect(lines[3]).toContain("Записались: 9.");
    expect(lines[3]).not.toContain("Лидеры");
  });

  it("турниров нет — раздела нет", () => {
    expect(tourSection({ active: [], soon: [] }, "ru")).toEqual([]);
    expect(tourSection(undefined, "en")).toEqual([]);
  });

  it("по-английски", () => {
    const line = tourLine(toNewsTour(farm, "en")!, "en");
    expect(line).toMatch(/^• Coming up: “Mines held”/);
    expect(line).toContain("Mines are counted daily at 09:59 UTC.");
  });
});
