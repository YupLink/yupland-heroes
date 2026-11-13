// Укладка жилы целиком (vein-place) на модели оператора (vein.fake):
//  · легла — минус штука, строка жилы своего вида с поворотом из шести, дельта
//    клетки {vein} в журнал карты (живой канал и снимок — через recordMapChange);
//  · повтор того же нажатия — вторая жила не ложится, вторая штука не уходит;
//    повтор уже исполненного ключа — «ok» без второй рассылки;
//  · ответ потерялся после коммита — судит ключ нажатия, жила одна, рассылка есть;
//  · отказы — понятным ключом по клетке, ничего не списано и не разослано.
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = async () => await import("./vein.fake");
vi.mock("@tanstack/react-start", async () => (await fake()).startFn);
vi.mock("@/server/db/mcpClient", async () => (await fake()).mcp);
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", async () => (await fake()).actor);
vi.mock("@/server/api/beta-raid/encounter-where", async () => (await fake()).where);
vi.mock("@/server/api/beta-raid/market-backpack", async () => (await fake()).backpack);
vi.mock("@/server/api/beta-raid/map-journal", async () => (await fake()).journal);

const { s, resetFake } = await import("./vein.fake");
const mod = await import("./vein-place");
const place = mod.placeVein as unknown as import("./vein.fake").PlaceFn;

const GOLD = "vein:gold";
const press = (q: number, r: number, op = "op_abcdef", stackKey = GOLD) =>
  place({ data: { stackKey, q, r, op } });
const ROTS = [0, 60, 120, 180, 240, 300];

beforeEach(() => {
  resetFake();
  for (const key of ["1,0", "0,1", "2,-1", "0,0", "3,0"]) s.cells.set(key, {});
});

describe("жила легла", () => {
  it("минус штука, жила своего вида с поворотом, дельта клетки всем", async () => {
    await expect(press(1, 0)).resolves.toEqual({ ok: true, q: 1, r: 0 });
    expect(s.stacks.get(GOLD)).toBe(2);
    const vein = s.veins.get("1,0");
    expect(vein?.kind).toBe("gold");
    expect(ROTS).toContain(vein?.rot);
    expect(s.changes).toEqual([
      { mapId: "rmap_1", change: { patches: [{ q: 1, r: 0, vein: vein && { ...vein } }] } },
    ]);
    // Клетка героя — тоже можно: жила ходьбе не мешает.
    await expect(press(0, 0, "op_second")).resolves.toEqual({ ok: true, q: 0, r: 0 });
    expect(s.stacks.get(GOLD)).toBe(1);
  });

  it("последняя штука — стопки больше нет", async () => {
    s.stacks.set(GOLD, 1);
    await press(1, 0);
    expect(s.stacks.has(GOLD)).toBe(false);
    await expect(press(0, 1, "op_next1")).rejects.toThrow("vein.no_item");
    expect(s.veins.size).toBe(1);
  });

  it("алмазная — из своей стопки, на клетку ложится алмазная", async () => {
    s.stacks.set("vein:diamonds", 2);
    await press(2, -1, "op_diamond", "vein:diamonds");
    expect(s.veins.get("2,-1")?.kind).toBe("diamonds");
    expect(s.stacks.get("vein:diamonds")).toBe(1);
    expect(s.stacks.get(GOLD)).toBe(3);
  });
});

describe("только новые миры", () => {
  it("в главном мире («Мир Альфа») купленную жилу не кладём — ничего не списано", async () => {
    s.mapId = "rmap_UthOURxc";
    await expect(press(1, 0)).rejects.toThrow("vein.main_world");
    expect(s.placeCalls).toBe(0);
    expect(s.stacks.get(GOLD)).toBe(3);
  });
});

describe("повтор нажатия", () => {
  it("тот же ключ — вторая жила не ложится, штука не уходит, второй рассылки нет", async () => {
    await press(1, 0);
    await expect(press(1, 0)).resolves.toEqual({ ok: true, q: 1, r: 0 });
    expect(s.stacks.get(GOLD)).toBe(2);
    expect(s.veins.size).toBe(1);
    expect(s.placeCalls).toBe(1);
    // Повтор старого ключа версию карты у всех не дёргает (рассылка ушла с первым нажатием).
    expect(s.changes).toHaveLength(1);
  });

  it("ответ потерялся после коммита — судит ключ: жила одна, рассылка есть", async () => {
    s.commitThenLose = true;
    await expect(press(1, 0)).resolves.toEqual({ ok: true, q: 1, r: 0 });
    expect(s.veins.size).toBe(1);
    expect(s.stacks.get(GOLD)).toBe(2);
    expect(s.changes).toHaveLength(1);
  });

  it("другое нажатие на ту же клетку — «уже есть жила», ничего не списано", async () => {
    await press(1, 0);
    await expect(press(1, 0, "op_other")).rejects.toThrow("vein.taken");
    expect(s.stacks.get(GOLD)).toBe(2);
    expect(s.changes).toHaveLength(1);
  });
});

describe("отказы", () => {
  const refused = async (why: string) => {
    expect(s.stacks.get(GOLD)).toBe(3);
    expect(s.veins.size).toBe(0);
    expect(s.changes).toEqual([]);
    expect(why).toMatch(/^vein\./);
  };

  it("правила клетки — своим ключом", async () => {
    const cases: Array<[string, string]> = [
      ["vein.water", "1,0"],
      ["vein.castle", "0,1"],
      ["vein.road", "2,-1"],
      ["vein.built", "3,0"],
      ["vein.decor", "0,0"],
    ];
    for (const [why, key] of cases) s.cells.set(key, { [why]: true });
    for (const [why, key] of cases) {
      const [q, r] = key.split(",").map(Number);
      await expect(press(q, r, `op_${why.slice(5)}x`)).rejects.toThrow(why);
      await refused(why);
    }
  });

  it("клетки нет (пустота) или под куполом", async () => {
    await expect(press(-1, 1)).rejects.toThrow("vein.no_cell");
    s.cells.set("1,0", { "vein.void": true });
    await expect(press(1, 0, "op_dome01")).rejects.toThrow("vein.void");
    await refused("vein.void");
  });

  it("дальше трёх клеток — до оператора", async () => {
    s.cells.set("4,0", {});
    await expect(press(4, 0)).rejects.toThrow("vein.far");
    expect(s.placeCalls).toBe(0);
    await refused("vein.far");
  });

  it("остров, не жила, нет героя", async () => {
    s.mapId = "isle_abc";
    await expect(press(1, 0)).rejects.toThrow("vein.island");
    s.mapId = "rmap_1";
    await expect(press(1, 0, "op_x12345", "land:terrain_x")).rejects.toThrow("vein.no_item");
    await expect(press(1, 0, "op_x12345", "vein:stone")).rejects.toThrow("vein.no_item");
    s.hero = null;
    await expect(press(1, 0)).rejects.toThrow("market.backpack_no_hero");
    expect(s.placeCalls).toBe(0);
    await refused("vein.no_item");
  });
});
