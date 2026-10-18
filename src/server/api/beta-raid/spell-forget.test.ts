// Забвение (владелец 27.09): «даром и откуда угодно» отменено.
//   • у столба — только если задана «Цена забвения», и за неё; нет цены —
//     spell.pillar_no_forget; деньги первыми, не ушла строка — деньги назад;
//   • из книги (без клетки) — только эффектом «Забвение» (oblivion-forget.ts):
//     вкладка прежней сборки «даром» даром больше ничего не забудет.
// Базы нет: мост подменён моделью книги, понимающей ровно наши операторы.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  sql: [] as string[],
  heroes: new Map<string, string>(),
  /** Строки книги: «герой|заклинание». */
  book: new Set<string>(),
  /** Ключи операций в raid_backpack_op. */
  marks: new Set<string>(),
  /** Мост применил удаление, но ответ потерян и повтор упал. */
  lostAfterDelete: false,
  /** Строку увёл кто-то между проверкой и удалением. */
  stolen: false,
  selected: "hero_mine" as string | null,
  ops: new Set<string>(),
  paid: [] as string[],
  refunded: [] as string[],
  forgetPrices: [{ resource: "gold", token: null, itemKey: null, itemName: null, amount: 20 }],
  byOblivion: [] as unknown[],
  /** Отдыхают после снятия с грядки издалека (hero-rest.ts). */
  resting: new Set<string>(),
}));

const pick = (sql: string, re: RegExp) => re.exec(sql)?.[1] ?? "";
const mine = (sql: string) =>
  s.heroes.get(pick(sql, /h\.id = '([^']*)'/)) === pick(sql, /h\.account_id = '([^']*)'/);

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("SELECT 1 AS hit FROM yuplink.hero_instance")) {
      return s.resting.has(pick(sql, /id = '([^']*)'/)) ? [{ hit: 1 }] : [];
    }
    if (sql.includes("DELETE FROM yuplink.hero_spellbook b USING own, prior")) {
      const hero = pick(sql, /h\.id = '([^']*)'/);
      const key = `${hero}|${pick(sql, /b\.spell_id = '([^']*)'/)}`;
      const mark = pick(sql, /op = '(sforget:[^']*)'/);
      if (s.stolen) s.book.delete(key);
      const was = s.marks.has(mark);
      const gone = !was && mine(sql) && s.book.delete(key) ? 1 : 0;
      if (gone) s.marks.add(mark);
      if (s.lostAfterDelete) throw new Error("MCP timeout");
      return [{ _row: { was, gone } }];
    }
    if (sql.includes("FROM yuplink.raid_backpack_op WHERE op =")) {
      return s.marks.has(pick(sql, /op = '([^']*)'/)) ? [{ hit: 1 }] : [];
    }
    if (sql.includes("SELECT h.rarity, t.specialization AS spec")) {
      return mine(sql) ? [{ rarity: "rare", spec: null }] : [];
    }
    if (sql.includes("INSERT INTO yuplink.hero_spellbook")) {
      const [, hero, spell] = /SELECT '([^']*)', '([^']*)', now\(\)/.exec(sql) ?? [];
      const used = [...s.book].filter((k) => k.startsWith(`${hero}|`)).length;
      const fresh = used < Number(pick(sql, /< (\d+)/)) && !s.book.has(`${hero}|${spell}`);
      if (fresh) s.book.add(`${hero}|${spell}`);
      return [{ ins: fresh ? 1 : 0, used }];
    }
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
vi.mock("./spell-book", () => ({
  spellHero: async () =>
    s.selected
      ? { heroId: s.selected, name: "Герой", spec: null, rarity: "rare", intellect: 10 }
      : null,
  learnedSpellIds: async (hero: string) =>
    [...s.book].filter((k) => k.startsWith(`${hero}|`)).map((k) => k.split("|")[1]),
}));
vi.mock("./spell-pillar", () => ({
  requirePillar: async () => ({
    cfg: {
      learnPrices: [{ resource: "gold", token: null, itemKey: null, itemName: null, amount: 50 }],
      forgetPrices: s.forgetPrices,
      spells: [],
    },
  }),
}));
vi.mock("./spell-tpl", () => ({
  loadSpellTemplates: async ({ ids }: { ids: string[] }) => ids.map((id) => ({ id, minInt: 0 })),
}));
vi.mock("./hero-boost", () => ({
  claimBoostOp: async ({ op }: { op: string }) => !s.ops.has(op) && !!s.ops.add(op),
  releaseBoostOp: async (op: string) => void s.ops.delete(op),
}));
vi.mock("./resource-pay", () => ({
  payResources: async (_w: string, _p: unknown, ref: string) => void s.paid.push(ref),
  refundResources: async (_w: string, _p: unknown, ref: string) => void s.refunded.push(ref),
}));
vi.mock("./econ/trade-hooks", () => ({ noteEnergyInPrices: async () => {} }));
vi.mock("./oblivion-forget", () => ({
  forgetByOblivion: async (_w: string, data: unknown) => {
    s.byOblivion.push(data);
    return { ok: false, reasonKey: "oblivion.need" };
  },
}));

import * as learn from "./spell-learn";
import { forgetInput } from "./spell-forget";

type Res = Awaited<ReturnType<typeof learn.learnSpell>>;
type Call = (a: { data: Record<string, unknown> }) => Promise<Res>;
const learnSpell = learn.learnSpell as unknown as Call;
const forgetSpell = learn.forgetSpell as unknown as Call;
const atPillar = (spellId: string, op = "op-000001", heroId?: string) =>
  forgetSpell({ data: { q: 1, r: 2, spellId, op, ...(heroId ? { heroId } : {}) } });
const deletes = () => s.sql.filter((q) => q.includes("DELETE FROM yuplink.hero_spellbook"));

beforeEach(() => {
  s.sql = [];
  s.heroes = new Map([
    ["hero_mine", "acc_me"],
    ["hero_other", "acc_other"],
  ]);
  s.book = new Set(["hero_mine|spell_a", "hero_mine|spell_b", "hero_other|spell_a"]);
  s.marks = new Set();
  s.lostAfterDelete = false;
  s.stolen = false;
  s.selected = "hero_mine";
  s.ops = new Set();
  s.paid = [];
  s.refunded = [];
  s.forgetPrices = [{ resource: "gold", token: null, itemKey: null, itemName: null, amount: 20 }];
  s.byOblivion = [];
  s.resting = new Set();
});

describe("столб: забыть за «Цену забвения»", () => {
  it("цена задана — платно: деньги, потом строка книги", async () => {
    const res = await atPillar("spell_a");
    expect(res).toEqual({
      ok: true,
      repeat: false,
      spellId: "spell_a",
      slots: { total: 3, used: 1 },
    });
    expect(s.paid).toEqual(["spell_forget:op-000001"]);
    expect(s.book.has("hero_mine|spell_a")).toBe(false);
    expect(s.refunded).toEqual([]);
  });

  it("цены забвения нет — отказ, ни денег, ни удаления", async () => {
    s.forgetPrices = [];
    expect(await atPillar("spell_a")).toEqual({ ok: false, reasonKey: "spell.pillar_no_forget" });
    expect(s.paid).toEqual([]);
    expect(deletes()).toEqual([]);
    expect(s.book.has("hero_mine|spell_a")).toBe(true);
  });

  it("заклинания нет в книге — отказ до денег", async () => {
    expect(await atPillar("spell_zzz")).toEqual({ ok: false, reasonKey: "spell.not_in_book" });
    expect(s.paid).toEqual([]);
  });

  it("чужой герой — отказ до денег, его книга цела", async () => {
    expect(await atPillar("spell_a", "op-000002", "hero_other")).toEqual({
      ok: false,
      reasonKey: "spell.hero_unavailable",
    });
    expect(s.paid).toEqual([]);
    expect(s.book.has("hero_other|spell_a")).toBe(true);
  });

  it("отдыхающий герой (снят с грядки издалека) не забывает — ни денег, ни удаления", async () => {
    s.resting.add("hero_mine");
    expect(await atPillar("spell_a", "op-000003", "hero_mine")).toEqual({
      ok: false,
      reasonKey: "braid.hero_resting",
    });
    expect(s.paid).toEqual([]);
    expect(deletes()).toEqual([]);
    expect(s.book.has("hero_mine|spell_a")).toBe(true);
  });

  it("повтор того же нажатия — второй раз не платит и не забывает", async () => {
    await atPillar("spell_a", "op-same-01");
    expect(await atPillar("spell_b", "op-same-01")).toMatchObject({ ok: true, repeat: true });
    expect(s.paid).toHaveLength(1);
    expect(s.book.has("hero_mine|spell_b")).toBe(true);
  });

  it("строку увели между проверкой и удалением — деньги назад, ключ нажатия занят", async () => {
    s.stolen = true;
    expect(await atPillar("spell_a", "op-stolen1")).toEqual({
      ok: false,
      reasonKey: "spell.not_in_book",
    });
    expect(s.refunded).toEqual(["spell_forget:op-stolen1"]);
    expect(s.ops.has("op-stolen1")).toBe(true);
  });

  it("ответ удаления потерялся, ключ лёг — оплачено и сделано, без возврата", async () => {
    s.lostAfterDelete = true;
    expect(await atPillar("spell_a", "op-lost-01")).toMatchObject({ ok: true, repeat: false });
    expect(s.refunded).toEqual([]);
    expect(s.book.has("hero_mine|spell_a")).toBe(false);
  });

  it("у столба без ключа нажатия запрос не проходит разбор", () => {
    expect(() => forgetInput({ q: 1, r: 2, spellId: "spell_a" })).toThrow();
    expect(forgetInput({ spellId: "spell_a", heroId: "hero_mine" })).toMatchObject({
      spellId: "spell_a",
    });
  });

  it("выучил → забыл → выучил: оба изучения платные, забвение — по своей цене", async () => {
    s.book = new Set();
    await learnSpell({ data: { q: 1, r: 2, spellId: "spell_a", op: "op-000011" } });
    await atPillar("spell_a", "op-000012");
    await learnSpell({ data: { q: 1, r: 2, spellId: "spell_a", op: "op-000013" } });
    expect(s.paid).toEqual([
      "spell_learn:op-000011",
      "spell_forget:op-000012",
      "spell_learn:op-000013",
    ]);
    expect(s.book.has("hero_mine|spell_a")).toBe(true);
    expect(s.sql.some((q) => q.includes("hero_spell_cd"))).toBe(false);
  });
});

describe("книга: без клетки — только эффектом «Забвение»", () => {
  it("вкладка прежней сборки {spellId, heroId} даром ничего не забывает", async () => {
    const res = await forgetSpell({ data: { spellId: "spell_a", heroId: "hero_mine" } });
    expect(res).toEqual({ ok: false, reasonKey: "oblivion.need" });
    expect(s.byOblivion).toEqual([{ spellId: "spell_a", heroId: "hero_mine" }]);
    expect(s.paid).toEqual([]);
    expect(deletes()).toEqual([]);
  });
});
