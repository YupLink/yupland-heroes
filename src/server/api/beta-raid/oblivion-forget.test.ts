// Забыть из книги эффектом «Забвение» (правило 28.09): трата по порядку —
// безлимит ничего не тратит, иначе заряд со сроком, иначе вечный; истёкшее не в
// счёт; чужую книгу не тронуть; повтор моста не списывает второй заряд; два
// нажатия на последнем заряде забывают одно.
//
// Базы нет: мост подменён моделью, которая понимает ровно оператор забвения
// (oblivion-sql.ts) и применяет его к строкам книги и эффекта. Лок аккаунта в
// базе выстраивает такие операторы в очередь — модель исполняет их по одному.
// Что модель повторяет именно SQL (условия CTE и порядок выбора заряда),
// сверяет oblivion-forget-sql.test.ts. Живым Postgres оператор целиком не
// прогонялся: локальную базу по правилам не поднимаем, на проде — только SELECT.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Eff = { value: number; exp: number };

const s = vi.hoisted(() => ({
  sql: [] as string[],
  /** Герой → аккаунт. */
  heroes: new Map<string, string>(),
  /** Строки книги: «герой|заклинание». */
  book: new Set<string>(),
  /** Строки эффекта: «аккаунт|вид» → заряды и срок (мс). */
  eff: new Map<string, Eff>(),
  selected: "h_me" as string | null,
  /** Мост применил оператор, ответ потерялся — повтор ушёл ещё раз. */
  replay: false,
}));

const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";

function applyForget(sql: string) {
  const now = Date.now();
  const acc = pick(sql, /hashtext\('oblivion:([^']*)'\)/);
  const hero = pick(sql, /h\.id = '([^']*)'/);
  const spell = pick(sql, /b\.spell_id = '([^']*)'/);
  const own = s.heroes.get(hero) === acc;
  const used = own ? [...s.book].filter((k) => k.startsWith(`${hero}|`)).length : 0;
  const inbook = own && s.book.has(`${hero}|${spell}`);
  const liveRow = (kind: string, needValue: boolean) => {
    const r = s.eff.get(`${acc}|${kind}`);
    return r && r.exp > now && (!needValue || r.value > 0) ? r : null;
  };
  const timed = !!liveRow("oblivion_time", false);
  const lvt = liveRow("oblivion_lvt", true);
  const lv = liveRow("oblivion_lv", true);
  const chosen = timed ? null : lvt ? "oblivion_lvt" : lv ? "oblivion_lv" : null;
  const level = chosen ? (s.eff.get(`${acc}|${chosen}`)?.value ?? 0) : 0;
  let gone = 0;
  let spent = 0;
  if (own && inbook && (timed || chosen)) {
    s.book.delete(`${hero}|${spell}`);
    gone = 1;
    if (chosen) {
      spent = 1;
      const r = s.eff.get(`${acc}|${chosen}`)!;
      if (r.value > 1) r.value -= 1;
      else s.eff.delete(`${acc}|${chosen}`);
    }
  }
  const row = {
    own,
    rarity: own ? "rare" : null,
    spec: null,
    inbook,
    timed,
    level,
    gone,
    spent,
    used,
  };
  return [{ _row: row }];
}

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("DELETE FROM yuplink.hero_spellbook b USING own")) {
      if (s.replay) applyForget(sql);
      return applyForget(sql);
    }
    return [];
  },
}));
vi.mock("./owner", () => ({ raidOwner: async () => "acc_me" }));
vi.mock("./spell-book", () => ({
  spellHero: async () => (s.selected ? { heroId: s.selected } : null),
}));

import { forgetByOblivion } from "./oblivion-forget";

const forget = (spellId: string, heroId?: string) => forgetByOblivion("w1", { spellId, heroId });
const inBook = (hero: string) => [...s.book].filter((k) => k.startsWith(`${hero}|`));
const soon = (min = 30) => Date.now() + min * 60_000;
const FOREVER = Date.parse("9999-12-31T00:00:00Z");
const put = (kind: string, value: number, exp: number) =>
  s.eff.set(`acc_me|${kind}`, { value, exp });
const val = (kind: string) => s.eff.get(`acc_me|${kind}`)?.value;

beforeEach(() => {
  s.sql = [];
  s.heroes = new Map([
    ["h_me", "acc_me"],
    ["h_me2", "acc_me"],
    ["h_other", "acc_other"],
  ]);
  s.book = new Set(["h_me|sp_a", "h_me|sp_b", "h_me|sp_c", "h_other|sp_a"]);
  s.eff = new Map();
  s.selected = "h_me";
  s.replay = false;
});

describe("порядок траты", () => {
  it("вечные заряды: забыто одно, осталось на один меньше, место освободилось", async () => {
    put("oblivion_lv", 2, FOREVER);
    const res = await forget("sp_a");
    // rare, не маг: 2 + 1 = 3 места; было занято 3, стало 2.
    expect(res).toEqual({ ok: true, repeat: false, spellId: "sp_a", slots: { total: 3, used: 2 } });
    expect(s.book.has("h_me|sp_a")).toBe(false);
    expect(val("oblivion_lv")).toBe(1);
  });

  it("заряд со сроком тратится раньше вечного", async () => {
    put("oblivion_lvt", 2, soon());
    put("oblivion_lv", 5, FOREVER);
    expect((await forget("sp_a")).ok).toBe(true);
    expect(val("oblivion_lvt")).toBe(1);
    expect(val("oblivion_lv")).toBe(5);
    expect((await forget("sp_b")).ok).toBe(true);
    // Последний заряд со сроком — строка снята; дальше пошли вечные.
    expect(val("oblivion_lvt")).toBeUndefined();
    expect((await forget("sp_c")).ok).toBe(true);
    expect(val("oblivion_lv")).toBe(4);
  });

  it("безлимит висит — забывай сколько угодно, заряды не тратятся", async () => {
    put("oblivion_time", 1, soon());
    put("oblivion_lvt", 1, soon());
    put("oblivion_lv", 1, FOREVER);
    for (const sp of ["sp_a", "sp_b", "sp_c"]) expect((await forget(sp)).ok).toBe(true);
    expect(inBook("h_me")).toEqual([]);
    expect(val("oblivion_lvt")).toBe(1);
    expect(val("oblivion_lv")).toBe(1);
  });

  it("заряды со сроком истекли — не тратятся, идёт вечный", async () => {
    put("oblivion_lvt", 3, Date.now() - 1000);
    put("oblivion_lv", 1, FOREVER);
    expect((await forget("sp_a")).ok).toBe(true);
    expect(val("oblivion_lv")).toBeUndefined();
    expect(val("oblivion_lvt")).toBe(3);
  });

  it("истекло всё и вечных нет — отказ, книга цела", async () => {
    put("oblivion_lvt", 3, Date.now() - 1000);
    put("oblivion_time", 1, Date.now() - 1000);
    expect(await forget("sp_a")).toEqual({ ok: false, reasonKey: "oblivion.need" });
    expect(inBook("h_me")).toHaveLength(3);
  });

  it("ничего нет — отказ «нужен эффект»", async () => {
    expect(await forget("sp_a")).toEqual({ ok: false, reasonKey: "oblivion.need" });
  });
});

describe("гонки и повторы", () => {
  // Лок аккаунта выстраивает операторы в очередь; модель исполняет их по одному —
  // проверяется, что второй видит ноль и отвечает «нужен эффект», а не «забыто».
  it("два нажатия на последнем заряде со сроком (лок в очередь) — забыто одно", async () => {
    put("oblivion_lvt", 1, soon());
    const [x, y] = await Promise.all([forget("sp_a"), forget("sp_b")]);
    expect([x, y].filter((r) => r.ok && !r.repeat)).toHaveLength(1);
    expect([x, y]).toContainEqual({ ok: false, reasonKey: "oblivion.need" });
    expect(inBook("h_me")).toHaveLength(2);
    expect(val("oblivion_lvt")).toBeUndefined();
  });

  it("два нажатия на последнем вечном заряде (лок в очередь) — забыто одно", async () => {
    put("oblivion_lv", 1, FOREVER);
    const [x, y] = await Promise.all([forget("sp_a"), forget("sp_b")]);
    expect([x, y].filter((r) => r.ok && !r.repeat)).toHaveLength(1);
    expect(inBook("h_me")).toHaveLength(2);
  });

  it("повтор моста: оператор прошёл, ответ потерян — второй заряд цел", async () => {
    put("oblivion_lvt", 3, soon());
    s.replay = true;
    expect(await forget("sp_a")).toMatchObject({ ok: true, repeat: true, spellId: "sp_a" });
    expect(val("oblivion_lvt")).toBe(2);
    expect(s.book.has("h_me|sp_a")).toBe(false);
  });

  it("повтор на последнем заряде тоже «забыто», а не «нужен эффект»", async () => {
    put("oblivion_lv", 1, FOREVER);
    s.replay = true;
    expect(await forget("sp_a")).toMatchObject({ ok: true, repeat: true });
  });
});

describe("чья книга", () => {
  it("чужой герой — отказ, его книга и мои заряды целы", async () => {
    put("oblivion_lvt", 5, soon());
    expect(await forget("sp_a", "h_other")).toEqual({
      ok: false,
      reasonKey: "spell.hero_unavailable",
    });
    expect(s.book.has("h_other|sp_a")).toBe(true);
    expect(val("oblivion_lvt")).toBe(5);
  });

  it("другой свой герой — забывает у него", async () => {
    put("oblivion_lv", 1, FOREVER);
    s.book.add("h_me2|sp_a");
    expect((await forget("sp_a", "h_me2")).ok).toBe(true);
    expect(s.book.has("h_me2|sp_a")).toBe(false);
    expect(s.book.has("h_me|sp_a")).toBe(true);
  });

  it("героя нет — отказ без единого запроса", async () => {
    s.selected = null;
    expect(await forget("sp_a")).toEqual({ ok: false, reasonKey: "spell.no_hero" });
    expect(s.sql).toEqual([]);
  });
});
