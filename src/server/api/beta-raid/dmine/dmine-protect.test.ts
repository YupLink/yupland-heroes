// «Защита на час» гриба поверх фейковой базы (владелец, 22.10.2026): защищается
// только своя ручная посадка по её ключу; энергия — тем же вызовом базы, повтор
// нажатия второй раз не списывает; отказы базы — ключами словаря; ответ
// потерялся после коммита — судит отметка созревания.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MUSHROOM_PROTECT_ENERGY } from "@/lib/mushroomRipe";

type Fn = (a: { data: unknown }) => Promise<unknown>;
const HOUR = Date.parse("2026-10-22T16:00:00Z") + 365 * 86_400_000;
const s = vi.hoisted(() => ({
  sql: [] as string[],
  /** Отметки созревания у посадки по очереди чтений (null — защиты нет). */
  state: [] as Array<Record<string, unknown> | null>,
  res: null as Record<string, unknown> | null,
  err: null as string | null,
  notes: [] as number[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const wrap = (fn: Fn, v?: (d: unknown) => unknown) => async (a: { data: unknown }) =>
      fn({ data: v ? v(a.data) : a.data });
    return {
      handler: (fn: Fn) => wrap(fn),
      inputValidator: (v: (d: unknown) => unknown) => ({ handler: (fn: Fn) => wrap(fn, v) }),
    };
  },
}));
vi.mock("@/server/db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (/raid_mushroom_protect\(/.test(sql)) {
      if (s.err) throw new Error(s.err);
      return s.res ? [{ res: s.res }] : [];
    }
    const row = s.state.length > 0 ? s.state.shift() : null;
    return row ? [row] : [];
  },
}));
vi.mock("@/server/api/beta-raid/plain-chest/pchest-row", () => ({
  pchestActor: async () => ({ wallet: "w1.tg", mapId: "rmap_1", account: "acc_1" }),
}));
vi.mock("@/server/api/beta-raid/econ/energy-note", () => ({
  noteEnergySpend: async (_a: string, n: number) => void s.notes.push(n),
}));

const { protectMushroom } = await import("./dmine-protect");
const { protectDmineSql, protectErrorOf, protectResOf, protectStateSql, placeOpKey } =
  await import("./dmine-protect-sql");
const protect = protectMushroom as unknown as (a: { data: { op: string } }) => Promise<{
  ok: true;
  ripeAt: number | null;
  cost: number;
  q: number;
  r: number;
}>;
const ripeIso = new Date(HOUR).toISOString();
const placed = { ripeAt: null, q: 4, r: -2 };

beforeEach(() => {
  s.sql.length = 0;
  s.state = [];
  s.res = null;
  s.err = null;
  s.notes.length = 0;
});

describe("«Защита на час»: сервер", () => {
  it("первое нажатие: ключ своей посадки, энергия тем же вызовом, заметка о трате", async () => {
    s.state = [placed];
    s.res = { was: false, ripeAt: ripeIso, paid: 5, map: "rmap_1", q: 4, r: -2 };
    await expect(protect({ data: { op: "abcdef12" } })).resolves.toEqual({
      ok: true,
      ripeAt: HOUR,
      cost: 5,
      q: 4,
      r: -2,
    });
    const call = s.sql.find((x) => x.includes("raid_mushroom_protect("))!;
    expect(call).toContain("'dmplace:acc_1:abcdef12', 'acc_1'");
    expect(call).toContain(`'w1.tg', ${MUSHROOM_PROTECT_ENERGY}) AS res`);
    expect(s.notes).toEqual([5]);
  });

  it("повтор нажатия: защита уже стоит — тот же ответ, без вызова и без траты", async () => {
    s.state = [{ ripeAt: ripeIso, q: 4, r: -2 }];
    await expect(protect({ data: { op: "abcdef12" } })).resolves.toMatchObject({
      ripeAt: HOUR,
      cost: 0,
    });
    expect(s.sql.some((x) => x.includes("raid_mushroom_protect("))).toBe(false);
    expect(s.notes).toEqual([]);
  });

  it("мост повторил вызов вслепую (база: «повтор») — первое нажатие, трата одна", async () => {
    s.state = [placed];
    s.res = { was: true, ripeAt: ripeIso, paid: 0, q: 4, r: -2 };
    await expect(protect({ data: { op: "abcdef12" } })).resolves.toMatchObject({ cost: 5 });
    expect(s.notes).toEqual([5]);
  });

  it("отказы базы — ключами словаря, без заметки о трате", async () => {
    for (const [err, key] of [
      ["dmine_protect_late", "dmine.protect_late"],
      ["dmine_protect_gone", "dmine.gone"],
      ["not_enough_energy", `mineplace.no_energy|{"need":${MUSHROOM_PROTECT_ENERGY}}`],
    ]) {
      s.state = [placed];
      s.err = err;
      await expect(protect({ data: { op: "abcdef12" } })).rejects.toThrow(key);
    }
    expect(s.notes).toEqual([]);
  });

  it("обрыв после коммита: отметка созревания легла — успех; нет — исходная ошибка", async () => {
    s.state = [placed, { ripeAt: ripeIso, q: 4, r: -2 }];
    s.err = "socket hang up";
    await expect(protect({ data: { op: "abcdef12" } })).resolves.toMatchObject({ cost: 5 });
    expect(s.notes).toEqual([5]);
    s.state = [placed, placed];
    await expect(protect({ data: { op: "abcdef12" } })).rejects.toThrow("socket hang up");
  });

  it("ключ нажатия — как у посадки; чужое не пролезает", async () => {
    await expect(protect({ data: { op: "x'; --" } })).rejects.toThrow();
    expect(placeOpKey("acc_1", "abc123")).toBe("dmplace:acc_1:abc123");
  });
});

describe("dmine-protect-sql", () => {
  it("вызов и чтение: числа не уходят как есть; посадка — только kind 'place'", () => {
    expect(protectDmineSql({ placeOp: "p", account: "a", wallet: "w", cost: -3.5 })).toMatch(
      /raid_mushroom_protect\('p', 'a',\s+'w', 0\) AS res/,
    );
    expect(protectStateSql("p").replace(/\s+/g, " ")).toContain(
      "WHERE o.op = 'p' AND o.kind = 'place'",
    );
  });

  it("ответ — объектом и строкой; без ripeAt — null; созревание прошло — ripeAt null", () => {
    expect(
      protectResOf([{ res: JSON.stringify({ was: false, ripeAt: ripeIso, paid: 5 }) }]),
    ).toMatchObject({ was: false, ripeAt: HOUR, paid: 5 });
    expect(protectResOf([{ res: { was: true } }])).toBeNull();
    expect(protectResOf([{ res: { ripeAt: "2020-01-01T00:00:00Z" } }])).toMatchObject({
      ripeAt: null,
    });
    expect(protectResOf([])).toBeNull();
  });

  it("незнакомая ошибка — как есть (тот же объект)", () => {
    const e = new Error("что-то ещё");
    expect(protectErrorOf(e, 5)).toBe(e);
  });
});
