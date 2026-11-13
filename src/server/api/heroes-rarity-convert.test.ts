// Превращение фишки в героя: записанная редкость — по ярусу выпавшего шаблона
// (rarityOfTemplateLevel), и обычного (ярус 1–2) из фишки не выдают никогда —
// «обычные герои всегда обычные» (владелец, 22.10.2026).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Tpl = { id: string; specialization: string | null; level: number | null };

const s = vi.hoisted(() => ({
  sql: [] as string[],
  chipLevel: 3,
  pool: [] as Tpl[],
  heroes: [] as Array<Record<string, unknown>>,
  items: [] as Array<Record<string, unknown>>,
}));

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
    userChipInventory: {
      findOne: async () => ({
        id: "chip_1",
        account_id: "acc_me",
        status: "owned",
        level: s.chipLevel,
        collection_id: "cc_1",
      }),
      update: async () => ({}),
    },
    chipCollectionHero: {
      findOne: async () => ({ active: true, hero_template_ids: [], race: "Пчела", spec_weights: [] }),
    },
    mysticItemTemplates: {
      raw: () => chain(() => s.pool),
      findOne: async ({ id }: { id: string }) => ({ name: id, race: "Пчела", specialization: "Маг" }),
    },
    userGameItems: { insert: async (row: Record<string, unknown>) => void s.items.push(row) },
    heroInstances: { insert: async (row: Record<string, unknown>) => void s.heroes.push(row) },
  },
}));
vi.mock("../auth", () => ({ getCurrentWallet: () => "w_me" }));
vi.mock("./user", () => ({ accountOf: async () => "acc_me" }));
vi.mock("./heroes-shared", () => ({
  requireHeroConvert: async () => "w_me",
  spendLikes: async () => 100,
}));
vi.mock("./heroes-unique", () => ({ takenUniqueIds: async () => new Set<string>() }));
vi.mock("./chips-utils", () => ({ sqlStr: (v: string) => `'${v}'` }));
vi.mock("../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    return sql.includes("SET status = 'burned'") ? [{ id: "chip_1" }] : [];
  },
}));

const { convertChipToHero } = await import("./heroes-convert");
const convert = convertChipToHero as unknown as (a: {
  data: { chipId: string };
}) => Promise<{ rarity: string; spentLikes: number }>;

const COMMON: Tpl = { id: "hero_common", specialization: "Маг", level: 1 };
const RARE: Tpl = { id: "hero_rare", specialization: "Маг", level: 3 };
const LEG: Tpl = { id: "hero_leg", specialization: "Маг", level: 5 };

beforeEach(() => {
  s.sql = [];
  s.heroes = [];
  s.items = [];
});

describe("convertChipToHero — редкость по ярусу шаблона", () => {
  it("5★: шаблон 5-го яруса, редкость legendary — в экземпляре и в ответе", async () => {
    s.chipLevel = 5;
    s.pool = [COMMON, RARE, LEG];
    const r = await convert({ data: { chipId: "chip_1" } });
    expect(s.heroes[0]).toMatchObject({ template_id: "hero_leg", rarity: "legendary" });
    expect(r.rarity).toBe("legendary");
    expect(r.spentLikes).toBe(5000);
  });

  it("3★: из расы с обычным и редким выпадает только редкий", async () => {
    s.chipLevel = 3;
    s.pool = [COMMON, RARE];
    const r = await convert({ data: { chipId: "chip_1" } });
    expect(s.heroes[0]).toMatchObject({ template_id: "hero_rare", rarity: "rare" });
    expect(r.rarity).toBe("rare");
  });

  it("запасной выбор чужого яруса (в расе нет 4★): обычного не берёт, редкость — шаблона", async () => {
    s.chipLevel = 4;
    s.pool = [COMMON, RARE];
    const r = await convert({ data: { chipId: "chip_1" } });
    expect(s.heroes[0]).toMatchObject({ template_id: "hero_rare", rarity: "rare" });
    expect(r.rarity).toBe("rare");
  });

  it("в пуле одни обычные — отказ ДО сжигания фишки и без героя", async () => {
    s.chipLevel = 3;
    s.pool = [COMMON, { ...COMMON, id: "hero_common_2", level: 2 }];
    await expect(convert({ data: { chipId: "chip_1" } })).rejects.toThrow(
      "Шаблоны героев не найдены",
    );
    expect(s.sql.some((q) => q.includes("SET status = 'burned'"))).toBe(false);
    expect(s.heroes).toHaveLength(0);
    expect(s.items).toHaveLength(0);
  });
});
