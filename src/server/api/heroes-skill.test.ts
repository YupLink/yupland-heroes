// Очки навыков: одно очко — один CAS. Повтор с тем же from — успех без второй
// записи; чужое изменение и нехватка очков — отказ ключом, а не тихий успех.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { id: string; account_id: string; rarity: string; level: number; skills: unknown };

const s = vi.hoisted(() => ({
  sql: [] as string[],
  hero: null as Row | null,
  /** Кто-то успел между чтением и записью: CAS не находит строку. */
  race: null as ((h: Row) => void) | null,
  invalidated: 0,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    const h = s.hero;
    if (sql.startsWith("SELECT id, account_id")) return h ? [{ ...h }] : [];
    if (sql.startsWith("UPDATE yuplink.hero_instance h")) {
      if (!h) return [];
      if (s.race) {
        s.race(h);
        s.race = null;
        return [];
      }
      const key = /ARRAY\['([a-z]+)'\]/.exec(sql)?.[1] ?? "";
      const to = Number(/to_jsonb\((\d+)\)/.exec(sql)?.[1]);
      const skills = { ...(h.skills as Record<string, number>), [key]: to };
      h.skills = skills;
      return [{ skills }];
    }
    return [];
  },
}));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_me" }));
vi.mock("./heroes-shared", () => ({ requireHeroLevelUp: async () => "w_me" }));
vi.mock("./beta-raid/hero-power", () => ({
  invalidateHeroPower: () => {
    s.invalidated += 1;
  },
}));

const mod = await import("./heroes-skill");
const spend = mod.spendSkillPoint as unknown as (a: {
  data: { heroId: string; skill: string; from: number };
}) => Promise<{ ok: true; skills: Record<string, number>; free: number; earned: number }>;
const updates = () => s.sql.filter((q) => q.startsWith("UPDATE"));

beforeEach(() => {
  s.sql = [];
  s.race = null;
  s.invalidated = 0;
  // Рар 25-го: 5 повышенных + 2 за 25-й = 7 очков, вложено 3.
  s.hero = { id: "hero_1", account_id: "acc_me", rarity: "rare", level: 25, skills: { atk: 2, trade: 1 } };
});

describe("spendSkillSql", () => {
  const sql = mod.spendSkillSql({ heroId: "hero_1", account: "acc_me", skill: "trade", from: 1, earned: 7 });

  it("CAS по from и владельцу, запись from+1", () => {
    expect(sql).toContain("h.id = 'hero_1' AND h.account_id = 'acc_me'");
    expect(sql).toContain("COALESCE(h.skills->>'trade', '0')");
    expect(sql).toMatch(/END = 1\n/);
    expect(sql).toContain("jsonb_set(h.skills, ARRAY['trade'], to_jsonb(2))");
    expect(sql).toContain("RETURNING h.skills");
  });

  it("свободное очко проверяется в том же UPDATE: вложено + 1 ≤ заработано", () => {
    expect(sql).toContain("FROM jsonb_each_text(h.skills) v");
    expect(sql).toContain("'alchemy'");
    expect(sql).toMatch(/\+ 1 <= 7/);
  });
});

describe("spendSkillPoint", () => {
  it("кладёт очко: один UPDATE, свежие числа, сброс кэша силы", async () => {
    const r = await spend({ data: { heroId: "hero_1", skill: "trade", from: 1 } });
    expect(r).toEqual({ ok: true, skills: { atk: 2, trade: 2 }, free: 3, earned: 7 });
    expect(updates()).toHaveLength(1);
    expect(s.invalidated).toBe(1);
  });

  it("повтор с тем же from — ok, второй записи нет", async () => {
    await spend({ data: { heroId: "hero_1", skill: "luck", from: 0 } });
    const again = await spend({ data: { heroId: "hero_1", skill: "luck", from: 0 } });
    expect(again.skills.luck).toBe(1);
    expect(updates()).toHaveLength(1);
  });

  it("навык уже другой — hero.skill_changed", async () => {
    await expect(spend({ data: { heroId: "hero_1", skill: "atk", from: 0 } })).rejects.toThrow(
      "hero.skill_changed",
    );
    expect(updates()).toHaveLength(0);
  });

  it("очков нет — hero.skill_no_points, обычный уровень тоже", async () => {
    s.hero = { ...s.hero!, skills: { atk: 7 } };
    await expect(spend({ data: { heroId: "hero_1", skill: "hp", from: 0 } })).rejects.toThrow(
      "hero.skill_no_points",
    );
    s.hero = { ...s.hero!, level: 20, skills: {} };
    await expect(spend({ data: { heroId: "hero_1", skill: "hp", from: 0 } })).rejects.toThrow(
      "hero.skill_no_points",
    );
    expect(updates()).toHaveLength(0);
  });

  it("гонка: CAS мимо, а навык уже from+1 — это наш повтор, ok", async () => {
    s.race = (h) => {
      h.skills = { ...(h.skills as Record<string, number>), int: 1 };
    };
    const r = await spend({ data: { heroId: "hero_1", skill: "int", from: 0 } });
    expect(r.skills.int).toBe(1);
  });

  it("гонка: последнее очко ушло в другой навык — hero.skill_no_points", async () => {
    s.hero = { ...s.hero!, skills: { atk: 6 } };
    s.race = (h) => {
      h.skills = { atk: 7 };
    };
    await expect(spend({ data: { heroId: "hero_1", skill: "arm", from: 0 } })).rejects.toThrow(
      "hero.skill_no_points",
    );
  });

  it("чужой герой — отказ до записи", async () => {
    s.hero = { ...s.hero!, account_id: "acc_other" };
    await expect(spend({ data: { heroId: "hero_1", skill: "hp", from: 0 } })).rejects.toThrow(
      "hero.not_yours",
    );
    expect(updates()).toHaveLength(0);
  });
});
