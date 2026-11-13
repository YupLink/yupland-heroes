// Части броска без базы: вызов функции и разбор итога (dynamite-sql), отказы →
// ключи словаря, подсветка окна (dynamite-cells), добыча деревьев и камней как у
// рубки (dynamite-decor: «Срубить»/«Добыть», кость количества, метка «собрано»).
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", async () => (await import("./dynamite.fake")).startFn);
vi.mock("@/server/db/mcpClient", async () => (await import("./dynamite.fake")).mcp);
vi.mock(
  "@/server/api/beta-raid/loot-bag/bag-deliver-parts",
  async () => (await import("./dynamite.fake")).bagParts,
);
vi.mock(
  "@/server/api/beta-raid/decor-interact-load",
  async () => (await import("./dynamite.fake")).decorLoad,
);

const { blastErrorKey, blastOf, blastSql, summaryOfBlast } = await import("./dynamite-sql");
const { dynamiteCellsSql, dynamiteChoices } = await import("./dynamite-cells");
const { blastableDecor, blastDecor, blastDecorSql, decorItems } = await import("./dynamite-decor");
const { s, decorLoad } = await import("./dynamite.fake");

describe("dynamite-sql", () => {
  it("вызов функции: ключ, карта, клетка, аккаунт, кошелёк, герой, стопка, цена, декор", () => {
    const sql = blastSql({
      op: "dyn:a:o'p",
      mapId: "rmap_1",
      q: 3,
      r: -2,
      account: "acc",
      wallet: "w",
      heroId: "h1",
      stackKey: "custom:cst_cpsl1cy0hpd7",
      cost: 100,
      decor: [],
    });
    expect(sql.replace(/\s+/g, " ")).toBe(
      "SELECT yuplink.raid_dynamite_blast('dyn:a:o''p', 'rmap_1', 3, -2, 'acc', 'w', 'h1', " +
        "'custom:cst_cpsl1cy0hpd7', 100::numeric, '[]'::jsonb, 'red') AS res;",
    );
  });

  it("итог строкой и объектом; мусор — null", () => {
    const raw = {
      was: true,
      at: { q: 1, r: 2 },
      paid: 100,
      mines: [{ q: 1, r: 2, op: "x", resource: "gold", building: "b", skin: null, block: true }],
      hits: [
        {
          q: 1,
          r: 2,
          layer: 1,
          hp: "brh",
          gen: 2,
          obj: "boss:a",
          dealt: 10,
          after: 0,
          max: 100,
          killed: true,
        },
      ],
      guards: [{ q: 0, r: 0, dealt: 5, killed: false, chest: true }],
      decor: [{ q: 0, r: 1, d: "decoration_oak", planted: false, bag: "lb", re: 30 }],
    };
    const d = blastOf(JSON.stringify(raw));
    expect(d).toMatchObject({ was: true, paid: 100, at: { q: 1, r: 2 } });
    expect(d?.mines[0]).toEqual({
      q: 1,
      r: 2,
      op: "x",
      resource: "gold",
      building: "b",
      skin: null,
      block: true,
    });
    expect(d?.hits[0]).toMatchObject({ layer: 1, hp: "brh", gen: 2, killed: true });
    expect(d?.decor[0]).toEqual({
      q: 0,
      r: 1,
      d: "decoration_oak",
      planted: false,
      bag: "lb",
      re: 30,
    });
    expect(summaryOfBlast(d!)).toEqual({
      mines: 1,
      hits: 2,
      kills: 1,
      decor: 1,
      guardsOff: 0,
      levelsDown: 0,
      broken: 0,
      ships: 0,
      fish: 0,
    });
    expect(d?.kind).toBe("red");
    expect(d?.ships).toEqual([]);
    expect(blastOf("не json")).toBeNull();
    expect(blastOf([1])).toBeNull();
    expect(blastOf({})?.hits).toEqual([]);
  });

  it("синий (§8.75а): вид в вызове, итог по шахтам; чужое действие и гриб — «ничего»", () => {
    const d = blastOf({
      at: { q: 0, r: 0 },
      paid: 100,
      kind: "blue",
      blue: [
        { q: 1, r: 1, act: "guard", building: "b", owner: "acc_o" },
        { q: 1, r: 1, act: "level" },
        { q: 2, r: 2, act: "broken", block: true },
        { q: 3, r: 3, act: "mushroom", owner: "acc_m" },
        { q: 4, r: 4, act: "взорвать всё" },
      ],
    });
    expect(d?.kind).toBe("blue");
    expect(d?.blue[0]).toEqual({
      q: 1,
      r: 1,
      act: "guard",
      building: "b",
      skin: null,
      block: false,
      owner: "acc_o",
      pending: 0,
    });
    expect(d?.blue[4]?.act).toBe("none");
    expect(d?.blue[3]?.act).toBe("none");
    expect(summaryOfBlast(d!)).toMatchObject({ guardsOff: 1, levelsDown: 1, broken: 1 });
  });

  it("отказы базы → ключи словаря; незнакомое — «не вышло»", () => {
    expect(blastErrorKey("not_enough_energy:12:100", 100)).toBe('mineplace.no_energy|{"need":100}');
    for (const k of ["far", "no_cell", "void", "town", "no_item", "island"]) {
      expect(blastErrorKey(`ERROR: dynamite_${k}`, 100)).toBe(`dynamite.${k}`);
    }
    expect(blastErrorKey("canceling statement due to lock timeout", 100)).toBe("dynamite.busy");
  });
});

describe("dynamite-cells", () => {
  it("SQL: круг радиуса 3, город функцией базы, шахта — тем же признаком, что взрыв", () => {
    const sql = dynamiteCellsSql("rmap_1", { q: 10, r: -4 }).replace(/\s+/g, " ");
    expect(sql).toContain("c.q BETWEEN 7 AND 13 AND c.r BETWEEN -7 AND -1");
    expect(sql).toContain("abs(c.q + c.r - 6)) / 2 <= 3");
    expect(sql).toContain("yuplink.raid_dynamite_in_town(c.map_id, c.q, c.r) AS town");
    expect(sql).toContain("yuplink.raid_dynamite_mine_dead(c.map_id, c.q, c.r)) AS mine");
    expect(sql).toContain("AND NOT yuplink.raid_mine_is_island(c.building_config)");
    expect(sql).toContain("= 'mine' AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL");
    expect(sql).not.toContain("raid_mine_state");
    expect(sql).toContain("FROM yuplink.raid_mine_guard g");
    // Корабль — цель только синего (§8.75а, 26.10.2026).
    expect(sql).toContain("false AS ship");
    const blue = dynamiteCellsSql("rmap_1", { q: 0, r: 0 }, 3, "blue").replace(/\s+/g, " ");
    expect(blue).toContain(
      "EXISTS (SELECT 1 FROM yuplink.beta_raid_ship s WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r) AS ship",
    );
  });

  it("синий: клетка с кораблём — годная цель со значком корабля; город — нет", () => {
    const base = { dome: false, town: false, mine: false, mob: true, decor: null };
    const out = dynamiteChoices(
      { q: 0, r: 0 },
      [
        { q: 1, r: 0, ...base, ship: true },
        { q: 2, r: 0, ...base, ship: true, town: true },
      ],
      () => false,
    );
    const at = (dq: number) => out.find((c) => c.dq === dq && c.dr === 0);
    expect(at(1)).toEqual({ dq: 1, dr: 0, ok: true, reason: null, hit: "ship" });
    expect(at(2)).toMatchObject({ ok: false, reason: "dynamite.town", hit: null });
  });

  it("37 клеток рядами; нет на карте, купол, город — красные с причиной; значок", () => {
    const rows = [
      { q: 0, r: 0, dome: false, town: false, mine: false, mob: false, decor: null },
      { q: 1, r: 0, dome: false, town: false, mine: true, mob: false, decor: null },
      { q: -1, r: 0, dome: false, town: false, mine: false, mob: true, decor: null },
      { q: 0, r: 1, dome: false, town: false, mine: false, mob: false, decor: "decoration_oak" },
      { q: 0, r: -1, dome: true, town: false, mine: false, mob: false, decor: null },
      { q: 1, r: -1, dome: false, town: true, mine: false, mob: true, decor: null },
    ];
    const out = dynamiteChoices({ q: 0, r: 0 }, rows, (d) => d === "decoration_oak");
    expect(out).toHaveLength(37);
    const at = (dq: number, dr: number) => out.find((c) => c.dq === dq && c.dr === dr);
    expect(at(0, 0)).toEqual({ dq: 0, dr: 0, ok: true, reason: null, hit: null });
    expect(at(1, 0)?.hit).toBe("mine");
    expect(at(-1, 0)?.hit).toBe("mob");
    expect(at(0, 1)?.hit).toBe("tree");
    expect(at(0, -1)).toMatchObject({ ok: false, reason: "dynamite.void" });
    expect(at(1, -1)).toMatchObject({ ok: false, reason: "dynamite.town", hit: null });
    expect(at(3, 0)).toMatchObject({ ok: false, reason: "dynamite.no_cell" });
  });
});

describe("dynamite-decor", () => {
  it("SQL: декор семи клеток взрыва", () => {
    const sql = blastDecorSql("rmap_1", { q: 2, r: 2 });
    for (const c of ["(2, 1)", "(3, 1)", "(1, 2)", "(2, 2)", "(3, 2)", "(1, 3)", "(2, 3)"]) {
      expect(sql).toContain(c);
    }
  });

  it("рвётся «Срубить»/«Добыть» с годным числом; «Выжать» — нет", async () => {
    const list = await decorLoad.loadInteractiveDecor();
    expect(blastableDecor(list.decoration_oak as never)).toBe(true);
    expect(blastableDecor(list.decoration_palm as never)).toBe(false);
    expect(blastableDecor(undefined)).toBe(false);
  });

  it("добыча — товар шаблона, количество костью, метка «собрано», срок порции 24 ч", async () => {
    const list = await decorLoad.loadInteractiveDecor();
    const oak = list.decoration_oak as unknown as Parameters<typeof decorItems>[0];
    const items = await decorItems({ ...oak, amount: "2-5" }, () => 0.99);
    expect(items).toEqual([
      {
        k: "custom:cst_wood",
        kind: "custom",
        ref: "cst_wood",
        item: "cst_wood",
        name: "Дерево",
        image: null,
        n: 5,
        h: 24,
        mob: 0,
        mine: 0,
        field: 0,
        loot: 5,
      },
    ]);
  });

  it("вход функции: только годный декор, имя, отрастание шаблона", async () => {
    s.decorRows = [
      { q: 1, r: 0, d: "decoration_oak" },
      { q: 0, r: 1, d: "decoration_palm" },
      { q: 0, r: 0, d: "decoration_unknown" },
    ];
    const out = await blastDecor("rmap_1", { q: 0, r: 0 });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ q: 1, r: 0, d: "decoration_oak", nm: "Дуб", re: 30 });
    expect(out[0].items[0]).toMatchObject({ k: "custom:cst_wood", n: 3, loot: 3 });
  });
});
