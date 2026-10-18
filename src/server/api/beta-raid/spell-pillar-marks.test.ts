// «Магия столба забрана» — для выбранного героя, одним запросом на карту.
//
// Столб забран, когда всё живое, чему он учит, уже в книге героя. Проверяем
// правило (pillarTaken) и сборку значков по карте: эффект клетки важнее
// шаблона, свой список важнее списка шаблона, у другого героя — свои значки,
// забытое заклинание значок снимает.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Pillar = { q: number; r: number; config: unknown; meta: unknown; name: string };

const s = vi.hoisted(() => ({
  sql: [] as string[],
  pillars: [] as Pillar[],
  /** Выбранный герой аккаунта и его книга; null — героя нет. */
  hero: "hero_a" as string | null,
  books: {} as Record<string, string[]>,
  active: [] as string[],
  /** Админ глухой туман видит насквозь (canIgnoreVoid). */
  admin: false,
}));

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("FROM yuplink.raid_map_cells c")) return s.pillars;
    if (sql.includes("FROM yuplink.hero_instance")) {
      if (!s.hero) return [];
      const book = s.books[s.hero] ?? [];
      return book.length
        ? book.map((spell_id) => ({ hero_id: s.hero, spell_id }))
        : [{ hero_id: s.hero, spell_id: null }];
    }
    if (sql.includes("FROM yuplink.raid_spell")) return s.active.map((id) => ({ id }));
    return [];
  },
}));
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { inputValidator: () => fn, handler: (h: unknown) => h };
    return fn;
  },
}));
vi.mock("./gate", () => ({ requireBetaRaid: async () => "w1" }));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./encounter-where", () => ({
  myMapId: async () => "map1",
  playerCell: async () => null,
  requireAdjacent: () => {},
}));
// Столбу из spell-pillar.ts здесь нужен только разбор настройки; тяжёлые
// соседи (постройка, книга, туман) заменены пустышками.
vi.mock("./voidGate", () => ({ requireNotVoid: async () => {}, canIgnoreVoid: () => s.admin }));
vi.mock("./building-action", () => ({ loadCellBuilding: async () => null }));
vi.mock("./spell-book", () => ({ learnedSpellIds: async () => [], spellHero: async () => null }));

import { getSpellPillarMarks, pillarTaken, spellPillarMarksFor } from "./spell-pillar-marks";

const set = (...ids: string[]) => new Set(ids);
const book = (spells: string[]) => ({ spellbook: { spells, learnPrices: [{ amount: 1 }] } });
/** Столб, назначенный клетке в режиме бога поверх «Храма» с эффектом boost. */
const temple = (q: number, r: number, spells: string[]): Pillar => ({
  q,
  r,
  config: { effect: "spellbook", ...book(spells) },
  meta: { effect: "boost" },
  name: "Храм",
});

beforeEach(() => {
  s.sql = [];
  s.hero = "hero_a";
  s.books = { hero_a: ["sp_1", "sp_2"], hero_b: ["sp_3"] };
  s.active = ["sp_1", "sp_2", "sp_3", "sp_4"];
  s.pillars = [temple(1, 1, ["sp_1"]), temple(2, 2, ["sp_3"]), temple(3, 3, ["sp_1"])];
  s.admin = false;
});

describe("pillarTaken — забран ли столб героем", () => {
  const active = set("a", "b", "c");

  it("одно заклинание: выучено — забран, нет — не забран", () => {
    expect(pillarTaken(["a"], active, set("a"))).toBe(true);
    expect(pillarTaken(["a"], active, set("b"))).toBe(false);
  });

  it("несколько: забран, только когда взять больше нечего", () => {
    expect(pillarTaken(["a", "b"], active, set("a"))).toBe(false);
    expect(pillarTaken(["a", "b"], active, set("a", "b", "c"))).toBe(true);
  });

  it("пустой список — учит всему живому каталогу", () => {
    expect(pillarTaken([], active, set("a", "b"))).toBe(false);
    expect(pillarTaken([], active, set("a", "b", "c"))).toBe(true);
  });

  it("выключенное заклинание столб не даёт — и ждать его не надо", () => {
    expect(pillarTaken(["a", "off"], active, set("a"))).toBe(true);
  });

  it("столб, которому нечему учить, забранным не считается", () => {
    expect(pillarTaken(["off"], active, set("off"))).toBe(false);
    expect(pillarTaken([], set(), set("a"))).toBe(false);
  });
});

describe("spellPillarMarksFor — значки по карте для выбранного героя", () => {
  it("помечены столбы, чьё заклинание уже в книге, — и одноимённые тоже", async () => {
    const res = await spellPillarMarksFor("w1");
    expect(res).toEqual({ heroId: "hero_a", cells: ["1,1", "3,3"] });
  });

  it("другой выбранный герой — свои значки", async () => {
    s.hero = "hero_b";
    expect((await spellPillarMarksFor("w1")).cells).toEqual(["2,2"]);
  });

  it("забыл заклинание — значок снят", async () => {
    s.books.hero_a = ["sp_2"];
    expect((await spellPillarMarksFor("w1")).cells).toEqual([]);
  });

  it("пустая книга и нет героя — значков нет", async () => {
    s.books.hero_a = [];
    expect((await spellPillarMarksFor("w1")).cells).toEqual([]);
    s.hero = null;
    expect(await spellPillarMarksFor("w1")).toEqual({ heroId: null, cells: [] });
  });

  it("эффект клетки важнее шаблона: настройка столба при boost-клетке — не столб", async () => {
    s.pillars = [
      {
        q: 5,
        r: 5,
        config: { effect: "boost", ...book(["sp_1"]) },
        meta: { effect: "spellbook" },
        name: "Храм",
      },
      // Шаблон «Столб заклинаний» без своей настройки клетки — берёт meta.
      { q: 6, r: 6, config: null, meta: { effect: "spellbook", ...book(["sp_2"]) }, name: "Столб" },
      // Столб без настройки вовсе — не настроен, значка нет.
      { q: 7, r: 7, config: { effect: "spellbook" }, meta: {}, name: "Столб" },
    ];
    expect((await spellPillarMarksFor("w1")).cells).toEqual(["6,6"]);
  });

  it("столб «учит всему» забран, только когда выучен весь живой каталог", async () => {
    s.pillars = [temple(8, 8, [])];
    expect((await spellPillarMarksFor("w1")).cells).toEqual([]);
    s.books.hero_a = ["sp_1", "sp_2", "sp_3", "sp_4"];
    expect((await spellPillarMarksFor("w1")).cells).toEqual(["8,8"]);
  });

  it("один заход на карту — три запроса к базе, без запросов на клетку", async () => {
    s.pillars = Array.from({ length: 30 }, (_, i) => temple(i, 0, ["sp_1"]));
    await spellPillarMarksFor("w1");
    expect(s.sql).toHaveLength(3);
    expect(s.sql.find((q) => q.includes("raid_map_cells"))).toContain("c.map_id = 'map1'");
    expect(s.sql.find((q) => q.includes("hero_instance"))).toContain("account_id = 'acc_me'");
  });

  it("столб под глухим туманом игроку не отдаётся, админу — да", async () => {
    await spellPillarMarksFor("w1");
    const pillarsQ = () => s.sql.find((q) => q.includes("raid_map_cells")) ?? "";
    expect(pillarsQ()).toContain("AND NOT COALESCE(c.void_fog, false)");
    s.sql = [];
    s.admin = true;
    await spellPillarMarksFor("w1");
    expect(pillarsQ()).not.toContain("void_fog");
  });

  it("ручка отвечает для кошелька сессии", async () => {
    const call = getSpellPillarMarks as unknown as () => Promise<unknown>;
    expect(await call()).toEqual({ heroId: "hero_a", cells: ["1,1", "3,3"] });
  });
});
