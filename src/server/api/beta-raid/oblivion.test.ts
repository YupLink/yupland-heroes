// Выдача и чтение «Забвения» по трём видам (правило 28.09): заряды, заряды со
// сроком, безлимит на время. Ключ выдачи в том же операторе, что и эффект;
// зелье и заклинание выдают через общий applyBoostRoll.
//
// Базы нет: мост подменён моделью таблицы эффектов. Модель понимает ровно те
// выражения SET, что пишет oblivion-sql.ts («сложить живые заряды», «продлить
// от max(срок, сейчас)», «заменить срок»), и падает на любом другом — так тест
// ловит и не тот вид строки, и не то правило сложения. Живым Postgres этот SQL
// не прогонялся (локальную базу по правилам не поднимаем).
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = { value: number; exp: number };

const s = vi.hoisted(() => ({
  sql: [] as string[],
  now: Date.parse("2026-09-28T12:00:00Z"),
  rows: new Map<string, Row>(),
  ops: new Set<string>(),
  /** Мост сдался на выдаче: "after" — оператор прошёл, ответ потерян; "before" — не дошёл. */
  failGrant: null as "before" | "after" | null,
}));

const FOREVER = Date.parse("9999-12-31T00:00:00Z");
const CARRY =
  "value = CASE WHEN e.expires_at > now() THEN GREATEST(e.value, 0) ELSE 0 END + EXCLUDED.value";
const EXTEND = "expires_at = GREATEST(e.expires_at, now()) + (EXCLUDED.expires_at - now())";

/** Оператор выдачи на модели: ключ, вставка или правило ON CONFLICT DO UPDATE. */
function applyGrant(sql: string): unknown[] {
  const ref = /raid_backpack_op \(op\) VALUES \('([^']*)'\)/.exec(sql)?.[1] ?? "";
  const m =
    /SELECT '[^']*', '([^']*)', '(oblivion_[a-z]+)', (\d+), (now\(\) \+ interval '(\d+) minutes'|'9999-12-31 00:00:00\+00'::timestamptz),/.exec(
      sql,
    );
  const set = /DO UPDATE\s+SET ([\s\S]*?), source = COALESCE/.exec(sql)?.[1] ?? "";
  if (!m) throw new Error(`модель: не разобрала вставку\n${sql}`);
  const [, acc, kind, v, , mins] = m;
  const fresh = !s.ops.has(ref);
  if (fresh) {
    s.ops.add(ref);
    const key = `${acc}|${kind}`;
    const add = { value: Number(v), exp: mins ? s.now + Number(mins) * 60_000 : FOREVER };
    const old = s.rows.get(key);
    if (!old) s.rows.set(key, add);
    else {
      const parts = set.split(/,\s*(?=value =|expires_at =)/).map((p) => p.trim());
      const next = { ...old };
      for (const p of parts) {
        if (p === CARRY) next.value = (old.exp > s.now ? Math.max(old.value, 0) : 0) + add.value;
        else if (p === "value = 1") next.value = 1;
        else if (p === EXTEND) next.exp = Math.max(old.exp, s.now) + (add.exp - s.now);
        else if (p === "expires_at = EXCLUDED.expires_at") next.exp = add.exp;
        else throw new Error(`модель: неизвестное правило «${p}»`);
      }
      s.rows.set(key, next);
    }
  }
  return [{ _row: { fresh, put: fresh } }];
}

vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    s.sql.push(sql);
    if (sql.includes("INSERT INTO yuplink.beta_raid_player_effects AS e")) {
      if (s.failGrant === "after") applyGrant(sql);
      if (s.failGrant) throw new Error("MCP timeout");
      return applyGrant(sql);
    }
    if (sql.includes("FROM yuplink.raid_backpack_op WHERE op =")) {
      const ref = /op = '([^']*)'/.exec(sql)?.[1] ?? "";
      return s.ops.has(ref) ? [{ hit: 1 }] : [];
    }
    if (sql.includes("SELECT kind, value, expires_at FROM yuplink.beta_raid_player_effects")) {
      const acc = /account_id = '([^']*)'/.exec(sql)?.[1] ?? "";
      const kinds = /kind IN \(([^)]*)\)/.exec(sql)?.[1] ?? "";
      return [...s.rows.entries()]
        .map(([k, r]) => ({ k: k.split("|"), r }))
        .filter(({ k, r }) => k[0] === acc && kinds.includes(`'${k[1]}'`) && r.exp > s.now)
        .map(({ k, r }) => ({
          kind: k[1],
          value: r.value,
          expires_at: new Date(r.exp).toISOString(),
        }));
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

import { getMyOblivion, grantOblivion, grantOblivionTo, loadOblivion } from "./oblivion";
import { applyBoostRoll } from "./hero-buff";
import { rollBoostQty } from "@/lib/hero/boost";

const row = (kind: string) => s.rows.get(`acc_me|${kind}`);
const min = (n: number) => n * 60_000;
const grant = (amount: number, minutes: number, ref: string) =>
  grantOblivion("acc_me", { amount, minutes }, ref);

beforeEach(() => {
  s.sql = [];
  s.now = Date.parse("2026-09-28T12:00:00Z");
  s.rows = new Map();
  s.ops = new Set();
  s.failGrant = null;
});

describe("выдача: три вида, лок и ключ одним вызовом", () => {
  it("заряды без срока: строка oblivion_lv, повтор складывает", async () => {
    expect(await grant(3, 0, "k1")).toBe(true);
    expect(await grant(2, 0, "k2")).toBe(true);
    expect(row("oblivion_lv")).toEqual({ value: 5, exp: FOREVER });
    expect(
      s.sql[0].trim().startsWith("SELECT pg_advisory_xact_lock(hashtext('oblivion:acc_me'))"),
    ).toBe(true);
    expect(s.sql[0]).toContain("INSERT INTO yuplink.raid_backpack_op (op) VALUES ('k1')");
  });

  it("заряды со сроком: строка oblivion_lvt, заряды складываются, срок продлевается", async () => {
    await grant(2, 30, "k1");
    expect(row("oblivion_lvt")).toEqual({ value: 2, exp: s.now + min(30) });
    await grant(3, 10, "k2");
    expect(row("oblivion_lvt")).toEqual({ value: 5, exp: s.now + min(40) });
    // Ни вечных зарядов, ни безлимита эта выдача не трогает.
    expect(row("oblivion_lv")).toBeUndefined();
    expect(row("oblivion_time")).toBeUndefined();
  });

  it("заряды со сроком истекли — остаток сгорел, новый срок от «сейчас»", async () => {
    await grant(4, 30, "k1");
    s.now += min(31);
    await grant(1, 20, "k2");
    expect(row("oblivion_lvt")).toEqual({ value: 1, exp: s.now + min(20) });
  });

  it("безлимит: строка oblivion_time, повтор продлевает, истёкший — от «сейчас»", async () => {
    await grant(0, 30, "k1");
    expect(row("oblivion_time")).toEqual({ value: 1, exp: s.now + min(30) });
    await grant(0, 15, "k2");
    expect(row("oblivion_time")).toEqual({ value: 1, exp: s.now + min(45) });
    s.now += min(60);
    await grant(0, 10, "k3");
    expect(row("oblivion_time")).toEqual({ value: 1, exp: s.now + min(10) });
  });

  it("повтор ключа (мост) — не свежая выдача и ничего не прибавляет", async () => {
    expect(await grant(2, 30, "same")).toBe(true);
    expect(await grant(2, 30, "same")).toBe(false);
    expect(row("oblivion_lvt")).toEqual({ value: 2, exp: s.now + min(30) });
  });

  it("пустой бросок в базу не ходит", async () => {
    expect(await grant(0, 0, "k")).toBe(false);
    expect(s.sql).toEqual([]);
  });

  it("зелье/заклинание: свой ключ на каждый вызов", async () => {
    await grantOblivionTo("w1", { amount: 1, minutes: 0 });
    await grantOblivionTo("w1", { amount: 1, minutes: 0 });
    const refs = s.sql.map((q) => /VALUES \('(oblg:[^']+)'\)/.exec(q)?.[1]);
    expect(refs[0]).toBeTruthy();
    expect(refs[0]).not.toBe(refs[1]);
    expect(row("oblivion_lv")?.value).toBe(2);
  });

  it("мост сдался, а ключ выдачи лёг — выдано, зелье возвращать не за что", async () => {
    s.failGrant = "after";
    await expect(grantOblivionTo("w1", { amount: 1, minutes: 30 })).resolves.toBeUndefined();
    expect(row("oblivion_lvt")?.value).toBe(1);
    // Ключа нет — выдачи не было: ошибка наверх, зелье вернёт вызывающий.
    s.failGrant = "before";
    await expect(grantOblivionTo("w1", { amount: 1, minutes: 30 })).rejects.toThrow("MCP timeout");
    expect(row("oblivion_lvt")?.value).toBe(1);
  });
});

describe("applyBoostRoll — забвение идёт своей дорогой, не баффом", () => {
  it("три зелья «2 Lv на 30 мин» — одна выдача: 6 зарядов на 90 минут", async () => {
    const [roll] = rollBoostQty([{ stat: "oblivion", value: "2", minutes: "30" }], 3);
    await applyBoostRoll("w1", roll);
    expect(s.sql).toHaveLength(1);
    expect(row("oblivion_lvt")).toEqual({ value: 6, exp: s.now + min(90) });
    // Никакого buff_<стат>: это не прибавка к характеристике.
    expect(s.sql[0]).not.toMatch(/'buff_[a-z]+'/);
  });

  it("«0» с минутами из заклинания — безлимит, заряды без срока — вечные", async () => {
    await applyBoostRoll("w1", { stat: "oblivion", amount: 0, minutes: 20 });
    await applyBoostRoll("w1", { stat: "oblivion", amount: 3, minutes: 0 });
    expect(row("oblivion_time")).toEqual({ value: 1, exp: s.now + min(20) });
    expect(row("oblivion_lv")).toEqual({ value: 3, exp: FOREVER });
  });
});

describe("loadOblivion / getMyOblivion", () => {
  it("три вида и сроки ISO; старые строки lv/time читаются как раньше", async () => {
    await grant(4, 0, "a");
    await grant(0, 30, "b");
    await grant(2, 10, "c");
    expect(await loadOblivion("acc_me")).toEqual({
      level: 4,
      until: new Date(s.now + min(30)).toISOString(),
      timedLevel: 2,
      timedUntil: new Date(s.now + min(10)).toISOString(),
    });
    const read = s.sql.at(-1) ?? "";
    expect(read).toContain("kind IN ('oblivion_lv', 'oblivion_lvt', 'oblivion_time')");
    expect(read).toContain("expires_at > now()");
  });

  it("истёкшие заряды со сроком не видны", async () => {
    await grant(2, 10, "c");
    s.now += min(11);
    expect(await loadOblivion("acc_me")).toEqual({
      level: 0,
      until: null,
      timedLevel: 0,
      timedUntil: null,
    });
  });

  it("ничего не висит — пусто; ручка — для аккаунта сессии", async () => {
    const call = getMyOblivion as unknown as () => Promise<unknown>;
    const serverNow = expect.any(Number); // часы сервера — клиент по ним правит свои
    expect(await call()).toEqual({
      level: 0,
      until: null,
      timedLevel: 0,
      timedUntil: null,
      serverNow,
    });
    expect(s.sql[0]).toContain("account_id = 'acc_me'");
  });
});
