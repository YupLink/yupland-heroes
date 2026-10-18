// Граница страницы по «at»: строки с общим временем не рвутся между страницами.
import { describe, expect, it } from "vitest";
import { pageByAt } from "./page-cursor";

const row = (at: string, id: number) => ({ at, id });

describe("pageByAt", () => {
  it("строк не больше лимита — без курсора", () => {
    const p = pageByAt([row("2026-09-22T10:00:00.000Z", 1)], 10);
    expect(p.rows).toHaveLength(1);
    expect(p.nextCursor).toBeNull();
  });

  it("лишняя строка задаёт границу: её время снимается целиком, курсор — последняя оставшаяся", () => {
    const p = pageByAt(
      [
        row("2026-09-22T10:00:00.000Z", 1),
        row("2026-09-22T09:00:00.000Z", 2),
        row("2026-09-22T00:00:00.000Z", 3),
        row("2026-09-22T00:00:00.000Z", 4),
      ],
      3,
    );
    expect(p.rows.map((r) => r.id)).toEqual([1, 2]);
    expect(p.nextCursor).toBe("2026-09-22T09:00:00.000Z");
  });

  it("граница не совпадает по времени — страница целая, курсор — её последняя строка", () => {
    const p = pageByAt(
      [
        row("2026-09-22T10:00:00.000Z", 1),
        row("2026-09-22T09:00:00.000Z", 2),
        row("2026-09-22T08:00:00.000Z", 3),
      ],
      2,
    );
    expect(p.rows.map((r) => r.id)).toEqual([1, 2]);
    expect(p.nextCursor).toBe("2026-09-22T09:00:00.000Z");
  });

  it("вся страница одним временем — отдаём лимит как есть", () => {
    const at = "2026-09-22T00:00:00.000Z";
    const p = pageByAt([row(at, 1), row(at, 2), row(at, 3)], 2);
    expect(p.rows.map((r) => r.id)).toEqual([1, 2]);
    expect(p.nextCursor).toBe(at);
  });
});
