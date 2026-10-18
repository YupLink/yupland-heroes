// Окно наблюдений авторассылки: минимум за час, не меньше 40 минут истории.
import { describe, expect, it, vi } from "vitest";

vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => null }));
vi.mock("../raid-shared", () => ({ sqlStr: (v: string) => `'${v}'` }));

const { minOf } = await import("./observations");
const M = 60_000;

describe("окно наблюдений", () => {
  it("меньше 40 минут истории — рано", () => {
    expect(minOf([{ t: 0, v: 5 }], 39 * M)).toBeNull();
  });

  it("минимум за последний час, старше часа — не считается", () => {
    const pts = [
      { t: 0, v: 1 },
      { t: 15 * M, v: 9 },
      { t: 30 * M, v: 7 },
      { t: 55 * M, v: 8 },
    ];
    expect(minOf(pts, 50 * M)).toBe(1);
    expect(minOf(pts, 61 * M)).toBe(7);
  });

  it("нет точек — null", () => {
    expect(minOf([], 100 * M)).toBeNull();
  });
});
