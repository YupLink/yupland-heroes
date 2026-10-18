// Гонки записи на турнир: живая плата против разбора зависших. Плата висит
// дольше 2 минут, разбор её засчитывает или гасит, откат молча не проходит,
// ответ вставки теряется. Итог всегда один: либо игрок записан и заплатил,
// либо не записан и всё списанное вернулось. Фейк — tour-entry.fake.ts, плата
// и мост подменяются на тест.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourEntryPrice } from "@/lib/tournament/types";
import { db, fakeExec, fakePay, MIN, resetDb } from "./tour-entry.fake";

type Kinds = { kind: string; refundKind: string; keyed?: boolean };
type PayFn = (w: string, p: TourEntryPrice[], ref: string, k: Kinds) => Promise<void>;
const hooks = vi.hoisted(
  () => ({}) as { pay?: PayFn; refund?: PayFn; exec?: (sql: string) => Promise<unknown[]> },
);

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const o = { inputValidator: () => o, handler: (fn: unknown) => fn };
    return o;
  },
}));
vi.mock("../beta-raid/gate", () => ({ requireBetaRaid: async () => "w" }));
vi.mock("../beta-raid/owner", () => ({ raidOwner: async () => "acc" }));
vi.mock("../../auth", () => ({ isAdminWallet: () => false }));
vi.mock("./tour-gate", () => ({ requireTourHere: async () => undefined }));
vi.mock("../beta-raid/resource-pay", async () => {
  const f = (await import("./tour-entry.fake")).fakePay;
  return {
    payResources: (...a: Parameters<PayFn>) => (hooks.pay ?? f.payResources)(...a),
    refundResources: (...a: Parameters<PayFn>) => (hooks.refund ?? f.refundResources)(...a),
  };
});
vi.mock("../../db/mcpClient", async () => {
  const f = (await import("./tour-entry.fake")).fakeExec;
  return { mcpExec: (sql: string) => (hooks.exec ?? f)(sql) };
});

const { joinAs } = await import("./tour-entry");
const { sweepStaleEntries } = await import("./tour-entry-settle");

const T0 = Date.parse("2026-10-05T10:00:00.000Z");
const join = () => joinAs({ id: "t1", account: "rich", wallet: "rich" });
const bal = (r: string) => db.bal.get(`rich|${r}`);
const tick = () => new Promise((r) => setTimeout(r, 0));
/** Списать строку цены «вручную» — как это сделала бы плата по ключу. */
const debit = (ref: string, i: number, p: TourEntryPrice, k: Kinds) => {
  db.bal.set(`rich|${p.resource}`, (bal(p.resource) ?? 0) - p.amount);
  db.ledger.add(`${k.kind}|${ref}:${i}:${p.resource}`);
};
const GOLD = { resource: "gold" as const, amount: 5 };

beforeEach(() => {
  resetDb(T0);
  Object.assign(hooks, { pay: undefined, refund: undefined, exec: undefined });
  db.bal.set("rich|gold", 12);
  db.bal.set("rich|diamonds", 0);
  db.bal.set("rich|energy", 10);
  db.bal.set("rich|likes", 10);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("плата висит, разбор успел раньше", () => {
  it("разбор засчитал «не проверить», а плата сорвалась — плательщик гасит строку и очки", async () => {
    db.price.set("t1", [GOLD, { resource: "likes", amount: 30 }]);
    let second: unknown;
    hooks.pay = async (w, prices, ref, k) => {
      debit(ref, 0, prices[0], k);
      db.now += 3 * MIN; // лайки висят на мосту; игрок тапнул ещё раз
      second = await join();
      db.points.set("t1|rich", 4); // часы успели начислить очки
      db.bal.set("rich|gold", (bal("gold") ?? 0) + 5); // лайков нет — откат золота
      db.ledger.add(`${k.refundKind}|${ref}:0:gold:back`);
      throw new Error("Нужно 30 лайков, у тебя 10.00");
    };
    await expect(join()).rejects.toThrow("tour.err.no_fee");
    expect(second).toMatchObject({ ok: true, already: true });
    expect(db.entries.has("t1|rich")).toBe(false);
    expect(db.points.has("t1|rich")).toBe(false);
    expect([bal("gold"), bal("likes")]).toEqual([12, 10]);
  });

  it("энергия по ключу: разбор видит её несписанной — гасит, а не засчитывает", async () => {
    db.price.set("t1", [GOLD, { resource: "energy", amount: 30 }]);
    hooks.pay = async (w, prices, ref, k) => {
      debit(ref, 0, prices[0], k);
      db.now += 3 * MIN;
      await sweepStaleEntries();
      expect(db.entries.has("t1|rich")).toBe(false);
      throw new Error("Не хватает энергии");
    };
    await expect(join()).rejects.toThrow("tour.err.no_fee");
    expect([bal("gold"), bal("energy")]).toEqual([12, 10]);
    expect(db.entries.has("t1|rich")).toBe(false);
  });

  it("разбор гасит ДО возврата: плата дошла позже — промахнулась отметкой и вернула всё сама", async () => {
    db.price.set("t1", [GOLD, { resource: "diamonds", amount: 1 }]);
    db.bal.set("rich|diamonds", 1);
    let release!: () => void;
    const stalled = new Promise<void>((r) => (release = r));
    hooks.pay = async (w, prices, ref, k) => {
      debit(ref, 0, prices[0], k);
      await stalled; // алмаз висит на мосту
      debit(ref, 1, prices[1], k);
    };
    hooks.refund = async (...a) => {
      await fakePay.refundResources(...a);
      release();
      await tick();
      await tick();
    };
    const first = join();
    await tick();
    db.now += 3 * MIN;
    await sweepStaleEntries();
    await expect(first).rejects.toThrow("tour.err.busy");
    await sweepStaleEntries();
    expect(db.entries.has("t1|rich")).toBe(false);
    expect([bal("gold"), bal("diamonds")]).toEqual([12, 1]);
  });
});

describe("откат молча не прошёл", () => {
  it("списанное по журналу не вернулось — плательщик довозвращает и только потом снимает", async () => {
    db.price.set("t1", [GOLD, { resource: "diamonds", amount: 1 }]);
    hooks.pay = async (w, prices, ref, k) => {
      debit(ref, 0, prices[0], k);
      throw new Error("Не хватает ресурсов"); // откат золота съеден шимом
    };
    await expect(join()).rejects.toThrow("tour.err.no_fee");
    expect(bal("gold")).toBe(12);
    expect(db.entries.has("t1|rich")).toBe(false);
  });

  it("возврат не проходит и повторно — строку держим, часы турниров довозвращают", async () => {
    db.price.set("t1", [GOLD, { resource: "diamonds", amount: 1 }]);
    hooks.pay = async (w, prices, ref, k) => {
      debit(ref, 0, prices[0], k);
      throw new Error("Не хватает ресурсов");
    };
    hooks.refund = async () => undefined;
    await expect(join()).rejects.toThrow("tour.err.no_fee");
    expect(db.entries.get("t1|rich")?.ref).toMatch(/:void$/);
    expect(bal("gold")).toBe(7);
    hooks.refund = undefined;
    await sweepStaleEntries();
    expect(bal("gold")).toBe(12);
    expect(db.entries.has("t1|rich")).toBe(false);
  });
});

describe("ответ вставки потерян", () => {
  it("цена — только энергия: часы видят по ключу, что не платил, и снимают строку", async () => {
    db.price.set("t1", [{ resource: "energy", amount: 3 }]);
    hooks.exec = async (sql) => {
      const r = await fakeExec(sql);
      if (sql.includes("INSERT INTO yuplink.tournament_entry")) throw new Error("SSE closed");
      return r;
    };
    await expect(join()).rejects.toThrow("SSE closed");
    hooks.exec = undefined;
    db.now += 3 * MIN;
    await sweepStaleEntries();
    expect(db.entries.has("t1|rich")).toBe(false);
    await expect(join()).resolves.toMatchObject({ ok: true, already: false });
    expect(bal("energy")).toBe(7);
  });
});
