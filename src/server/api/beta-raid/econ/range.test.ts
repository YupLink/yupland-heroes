// Окно отчёта: сервер зажимает границы сам — клиенту не верим.
import { describe, expect, it } from "vitest";
import { normalizeRange, rangeSql, toIso } from "./range";

const NOW = Date.parse("2026-09-22T12:00:00.000Z");
const DAY = 86_400_000;

describe("normalizeRange", () => {
  it("нормальное окно проходит без изменений", () => {
    const r = normalizeRange(
      { from: "2026-09-15T00:00:00.000Z", to: "2026-09-22T00:00:00.000Z" },
      NOW,
    );
    expect(r).toEqual({ from: "2026-09-15T00:00:00.000Z", to: "2026-09-22T00:00:00.000Z" });
  });

  it("«to» из будущего прижимается к концу текущей минуты", () => {
    const r = normalizeRange(
      { from: "2026-09-20T00:00:00.000Z", to: "2030-01-01T00:00:00.000Z" },
      NOW + 1500,
    );
    expect(r.to).toBe("2026-09-22T12:01:00.000Z");
  });

  it("«to», округлённое клиентом вверх до минуты, не трогаем — ключ кэша стабилен", () => {
    const r = normalizeRange(
      { from: "2026-09-20T00:00:00.000Z", to: "2026-09-22T12:01:00.000Z" },
      NOW + 1500,
    );
    expect(r.to).toBe("2026-09-22T12:01:00.000Z");
  });

  it("перевёрнутое окно сжимается до суток перед «to»", () => {
    const r = normalizeRange(
      { from: "2026-09-21T00:00:00.000Z", to: "2026-09-20T00:00:00.000Z" },
      NOW,
    );
    expect(Date.parse(r.to) - Date.parse(r.from)).toBe(DAY);
  });

  it("окно шире 92 дней обрезается слева", () => {
    const r = normalizeRange(
      { from: "2025-01-01T00:00:00.000Z", to: "2026-09-20T00:00:00.000Z" },
      NOW,
    );
    expect(Date.parse(r.to) - Date.parse(r.from)).toBe(92 * DAY);
  });

  it("кривая дата — ошибка, а не тихий now", () => {
    expect(() => normalizeRange({ from: "вчера", to: "2026-09-20T00:00:00.000Z" }, NOW)).toThrow();
  });
});

describe("rangeSql", () => {
  it("правая граница открыта, значения экранированы", () => {
    const sql = rangeSql("l.created_at", {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-08T00:00:00.000Z",
    });
    expect(sql).toBe(
      "l.created_at >= '2026-09-01T00:00:00.000Z' AND l.created_at < '2026-09-08T00:00:00.000Z'",
    );
  });
});

describe("toIso", () => {
  it("понимает формат row_to_json и отдаёт ISO", () => {
    expect(toIso("2026-09-22T10:00:00.5+00:00")).toBe("2026-09-22T10:00:00.500Z");
    expect(toIso(null)).toBe("");
  });
});
