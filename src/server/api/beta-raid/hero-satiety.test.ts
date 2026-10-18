// takeSatiety (рубка руками, §8.56): списание с условием «хватает» в том же
// UPDATE; не хватило — "short" без записи; героя нет — "none"; кэш силы
// героя видит новую шкалу сразу.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  rows: [] as Array<{ satiety: number }>,
  hero: true,
  invalidated: 0,
  info: {
    heroId: "h1",
    rarity: "common",
    spec: "Воин",
    satiety: { now: 50, max: 1000, hungry: false },
  },
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => (s.sql.push(sql), s.rows),
}));
vi.mock("./hero-power", () => ({
  loadHeroView: async () => (s.hero ? { info: s.info } : null),
  invalidateHeroPower: () => void s.invalidated++,
}));

const { takeSatiety } = await import("./hero-satiety");

beforeEach(() => {
  Object.assign(s, { sql: [], rows: [], hero: true, invalidated: 0 });
  s.info.satiety = { now: 50, max: 1000, hungry: false };
});

describe("takeSatiety", () => {
  it("хватает — списано одним UPDATE с условием, шкала в кэше свежая", async () => {
    s.rows = [{ satiety: 20 }];
    expect(await takeSatiety("w1", 30)).toBe("ok");
    expect(s.sql).toHaveLength(1);
    expect(s.sql[0]).toContain("+ (-30)");
    expect(s.sql[0]).toContain("LEAST(1000, COALESCE(h.satiety, 1000)) >= 30");
    expect(s.info.satiety).toEqual({ now: 20, max: 1000, hungry: false });
  });

  it("не хватает — база строку не вернула: short", async () => {
    expect(await takeSatiety("w1", 30)).toBe("short");
    expect(s.info.satiety.now).toBe(50);
  });

  it("героя нет — none, без запроса", async () => {
    s.hero = false;
    expect(await takeSatiety("w1", 30)).toBe("none");
    expect(s.sql).toHaveLength(0);
  });

  it("дошли до нуля — голод: кэш силы героя сброшен", async () => {
    s.rows = [{ satiety: 0 }];
    expect(await takeSatiety("w1", 30)).toBe("ok");
    expect(s.invalidated).toBe(1);
  });
});
