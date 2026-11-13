// «Обычные герои всегда обычные» (владелец, 22.10.2026): первая прокачка
// спящего героя заводит экземпляр с редкостью по ярусу шаблона — той же
// rarityOfTemplateLevel, что у спящего и у пробуждения. Раньше здесь была своя
// формула без common: обычный 1★ становился «rare» (потолок 30, восемь мест).
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  tplLevel: 1 as number | null,
  /** Экземпляр копии (null — спящий). */
  inst: null as null | { id: string; rarity: string; level: number },
}));

/** Цепочка запроса pg-шима: любые eq/order/limit, await отдаёт { data }. */
function chain(data: () => unknown[]): Record<string, unknown> {
  const c: Record<string, unknown> = {};
  for (const k of ["select", "eq", "order", "limit", "in"]) c[k] = () => c;
  c.then = (ok: (v: { data: unknown[] }) => unknown) => Promise.resolve({ data: data() }).then(ok);
  return c;
}

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("../db/pg", () => ({
  pg: {
    mysticItemTemplates: {
      findOne: async () => ({ race: "Пчела", specialization: "Маг", level: s.tplLevel }),
    },
    heroInstances: { raw: () => chain(() => (s.inst ? [s.inst] : [])) },
    userGameItems: { raw: () => chain(() => [{ id: "ugi_1" }]) },
  },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w_me" }));
vi.mock("./user-shared", () => ({ accountOf: async () => "acc_me", readOwnedById: async () => [] }));
vi.mock("./testers", () => ({ requireFeature: async () => "w_me" }));
vi.mock("../likesAccount", () => ({ likeAccountId: async () => "acc_me" }));
vi.mock("./beta-raid/hero-power", () => ({ invalidateHeroPower: () => {} }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("WITH cur AS")) return [{ new_level: 1, likes_left: 950, avail_before: 1000 }];
    return [];
  },
}));

const { levelUpHeroTemplate } = await import("./heroes-read");
type LevelUp = (a: { data: { templateId: string; itemId?: string } }) => Promise<{
  level: number;
  spentLikes: number;
  baseLevel: number;
  nextCost: number | null;
}>;
const levelUp = levelUpHeroTemplate as unknown as LevelUp;

/** Редкость, с которой вставлен экземпляр (createHeroAtomic). */
const insertedRarity = (): string | null => {
  const ins = s.sql.find((q) => q.includes("INSERT INTO yuplink.hero_instance")) ?? "";
  return /'ugi_1', '(\w+)',\s*1,/.exec(ins)?.[1] ?? null;
};

beforeEach(() => {
  s.sql = [];
  s.tplLevel = 1;
  s.inst = null;
});

describe("первая прокачка спящего — редкость по ярусу шаблона", () => {
  it.each([
    [1, "common", 10],
    [2, "common", 10],
    [3, "rare", 20],
    [4, "epic", 30],
    [5, "legendary", 40],
  ])("шаблон %s★ → %s", async (tier, rarity, base) => {
    s.tplLevel = tier;
    const r = await levelUp({ data: { templateId: "hero_tpl", itemId: "ugi_1" } });
    expect(insertedRarity()).toBe(rarity);
    expect(r.level).toBe(1);
    expect(r.spentLikes).toBe(50);
    // Обычный потолок редкости — карточка сразу рисует правильный «ур. X/10».
    expect(r.baseLevel).toBe(base);
  });

  it("обычный 1★ — не «rare»: та самая ошибка, из-за которой на проде 56 «редких» обычных", async () => {
    s.tplLevel = 1;
    await levelUp({ data: { templateId: "hero_tpl", itemId: "ugi_1" } });
    expect(insertedRarity()).not.toBe("rare");
  });
});

describe("заведённый экземпляр — его записанная редкость", () => {
  it("обычный на потолке (в т.ч. исправленный миграцией на 22-м) дальше не качается", async () => {
    s.inst = { id: "hero_1", rarity: "common", level: 10 };
    await expect(
      levelUp({ data: { templateId: "hero_tpl", itemId: "ugi_1" } }),
    ).rejects.toThrow("Достигнут максимум для common — 10 ур.");
    s.inst = { id: "hero_1", rarity: "common", level: 22 };
    await expect(
      levelUp({ data: { templateId: "hero_tpl", itemId: "ugi_1" } }),
    ).rejects.toThrow("Достигнут максимум для common — 10 ур.");
    // Ни списаний, ни вставок.
    expect(s.sql.some((q) => q.includes("WITH cur AS"))).toBe(false);
  });
});
