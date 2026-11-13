// «Отбитые» (§8.106): когда — «сегодня 14:05», «вчера …», иначе дата.
import { describe, expect, it } from "vitest";

const { lostWhen } = await import("./lostWhen");

describe("lostWhen", () => {
  it("сегодня, вчера, раньше", () => {
    const now = new Date(2026, 10, 4, 20, 0).getTime();
    expect(lostWhen(new Date(2026, 10, 4, 9, 5).getTime(), "ru", now)).toMatch(/^сегодня 09:05$/);
    expect(lostWhen(new Date(2026, 10, 3, 23, 59).getTime(), "en", now)).toMatch(/^yesterday /);
    expect(lostWhen(new Date(2026, 10, 1, 10, 0).getTime(), "ru", now)).not.toMatch(/сегодня|вчера/);
  });
});
