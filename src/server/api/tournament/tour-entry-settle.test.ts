// Зависшая запись на турнир: заново тем же ключом не платим (лайки ключа не
// помнят), вслепую не возвращаем; решают журналы и ключи операций попытки и
// память процесса. Открытый турнир — строку доводим, закрытый или удаляемый —
// гасим и плату возвращаем. Фейк — tour-entry.fake.ts.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourEntryPrice } from "@/lib/tournament/types";
import { db, MIN, resetDb } from "./tour-entry.fake";

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
vi.mock("../beta-raid/resource-pay", async () => (await import("./tour-entry.fake")).fakePay);
vi.mock("../../db/mcpClient", async () => ({
  mcpExec: (await import("./tour-entry.fake")).fakeExec,
}));

const { joinAs } = await import("./tour-entry");
const { judge, sweepStaleEntries } = await import("./tour-entry-settle");
const { payOrder } = await import("./tour-entry-fee");

const T0 = Date.parse("2026-10-05T10:00:00.000Z");
const OLD = "tour:t1:rich:old";
const join = () => joinAs({ id: "t1", account: "rich", wallet: "rich" });
const bal = (r: string) => db.bal.get(`rich|${r}`);
/** Строка оборванной попытки: 3 минуты назад, не оплачена. */
const stuck = (price: TourEntryPrice[]) =>
  db.entries.set("t1|rich", { paid: false, at: T0 - 3 * MIN, price, ref: OLD, wallet: "rich" });
const GOLD_DIA: TourEntryPrice[] = [
  { resource: "gold", amount: 5 },
  { resource: "diamonds", amount: 1 },
];

beforeEach(() => {
  resetDb(T0);
  db.bal.set("rich|gold", 12);
  db.bal.set("rich|diamonds", 1);
  db.bal.set("rich|energy", 10);
  db.price.set("t1", GOLD_DIA);
});

describe("итог попытки по журналам", () => {
  it("порядок оплаты: проверяемые строки первыми (энергия и товар — по ключу), лайки — последними, нулевые — вон", () => {
    const p = payOrder([
      { resource: "likes", amount: 2 },
      { resource: "energy", amount: 3 },
      { resource: "gold", amount: 0 },
      { resource: "token", token: "USDT", amount: 1 },
      { resource: "item", itemKey: "custom:a", itemName: "A", amount: 1 },
      { resource: "tickets", amount: 2 },
    ]);
    expect(p.map((x) => x.resource)).toEqual(["energy", "token", "item", "tickets", "likes"]);
  });

  it("возврат хоть одной строки — откачено; несписанная проверяемая — откачено", () => {
    expect(judge([true, false], [true, false])).toBe("void");
    expect(judge([true, false, null], [false, false, null])).toBe("void");
    expect(judge([false, null], [false, null])).toBe("void");
  });

  it("всё списано — оплачено; за списанными проверяемыми непроверяемые — не проверить", () => {
    expect(judge([true, true], [false, false])).toBe("paid");
    expect(judge([], [])).toBe("paid");
    expect(judge([true, null], [false, null])).toBe("unknown");
    expect(judge([null], [null])).toBe("unknown");
  });
});

describe("зависшая запись у открытого турнира", () => {
  it("плата прошла, отметки нет — засчитана без второго списания", async () => {
    stuck(GOLD_DIA);
    db.ledger.add(`tour_fee|${OLD}:0:gold`).add(`tour_fee|${OLD}:1:diamonds`);
    db.bal.set("rich|gold", 7);
    db.bal.set("rich|diamonds", 0);
    await expect(join()).resolves.toMatchObject({ ok: true, already: true });
    expect([bal("gold"), bal("diamonds")]).toEqual([7, 0]);
    expect(db.pays).toHaveLength(0);
  });

  it("плата откатилась, а строку не сняли — новая попытка платит ВСЁ новым ключом", async () => {
    // Золото списано и возвращено (R:0:gold:back), на алмазах — нехватка.
    stuck(GOLD_DIA);
    db.ledger.add(`tour_fee|${OLD}:0:gold`).add(`tour_fee_refund|${OLD}:0:gold:back`);
    await join();
    expect([bal("gold"), bal("diamonds")]).toEqual([7, 0]);
    expect(db.pays[0].ref).not.toBe(OLD);
    expect(db.entries.get("t1|rich")).toMatchObject({ paid: true });
  });

  it("оборвалась между строками — списанное вернули, потом заплатил честно", async () => {
    stuck(GOLD_DIA);
    db.ledger.add(`tour_fee|${OLD}:0:gold`);
    db.bal.set("rich|gold", 7);
    await join();
    expect([bal("gold"), bal("diamonds")]).toEqual([7, 0]);
    expect(db.pays).toHaveLength(1);
  });

  it("лайки не проверить — засчитана без второго списания", async () => {
    const price: TourEntryPrice[] = [{ resource: "likes", amount: 3 }];
    stuck(price);
    db.bal.set("rich|likes", 7);
    await expect(join()).resolves.toMatchObject({ ok: true, already: true });
    expect(bal("likes")).toBe(7);
    expect(db.pays).toHaveLength(0);
  });

  it("энергия по ключу: списана — засчитана без второго списания; нет — гасим, платим заново", async () => {
    const price: TourEntryPrice[] = [{ resource: "energy", amount: 3 }];
    db.price.set("t1", price);
    stuck(price);
    db.ledger.add(`op|pay:${OLD}:0:energy`);
    db.bal.set("rich|energy", 7);
    await expect(join()).resolves.toMatchObject({ ok: true, already: true });
    expect(bal("energy")).toBe(7);
    resetDb(T0);
    db.bal.set("rich|energy", 10);
    db.price.set("t1", price);
    stuck(price);
    await expect(join()).resolves.toMatchObject({ ok: true, already: false });
    expect(bal("energy")).toBe(7);
    expect(db.pays).toHaveLength(1);
  });

  it("не хватило энергии и строку не сняли — процесс помнит «откачено»: платим заново", async () => {
    const price: TourEntryPrice[] = [{ resource: "energy", amount: 3 }];
    db.price.set("t1", price);
    db.bal.set("rich|energy", 2);
    db.failDrop = true;
    await expect(join()).rejects.toThrow("tour.err.no_fee");
    db.failDrop = false;
    db.bal.set("rich|energy", 5);
    db.now += 3 * MIN;
    await expect(join()).resolves.toMatchObject({ ok: true, already: false });
    expect(bal("energy")).toBe(2);
  });
});

describe("часы турниров и удаление черновика", () => {
  it("турнир закрылся — списанное по ключу вернулось, строка снята", async () => {
    stuck(GOLD_DIA);
    db.ledger.add(`tour_fee|${OLD}:0:gold`).add(`tour_fee|${OLD}:1:diamonds`);
    db.bal.set("rich|gold", 7);
    db.bal.set("rich|diamonds", 0);
    db.open = false;
    await expect(sweepStaleEntries()).resolves.toBe(1);
    expect([bal("gold"), bal("diamonds")]).toEqual([12, 1]);
    expect(db.entries.has("t1|rich")).toBe(false);
    // Повтор разбора второй раз не вернёт.
    await sweepStaleEntries();
    expect(bal("gold")).toBe(12);
  });

  it("турнир открыт — оплаченную доводим сами, игроку не надо приходить", async () => {
    stuck(GOLD_DIA);
    db.ledger.add(`tour_fee|${OLD}:0:gold`).add(`tour_fee|${OLD}:1:diamonds`);
    await sweepStaleEntries();
    expect(db.entries.get("t1|rich")).toMatchObject({ paid: true, at: T0 });
  });

  it("удаление черновика — разбирает и свежие строки: списанное вернулось, строки сняты", async () => {
    stuck(GOLD_DIA);
    db.ledger.add(`tour_fee|${OLD}:0:gold`);
    db.bal.set("rich|gold", 7);
    // Свежая: попытка списала 3 золота и упала до отметки.
    const POOR = "tour:t1:poor:n";
    db.entries.set("t1|poor", { paid: false, at: T0, price: GOLD_DIA, ref: POOR, wallet: "poor" });
    db.ledger.add(`tour_fee|${POOR}:0:gold`);
    db.bal.set("poor|gold", 7);
    await sweepStaleEntries("t1");
    expect(bal("gold")).toBe(12);
    expect(db.bal.get("poor|gold")).toBe(12);
    expect(db.entries.has("t1|rich")).toBe(false);
    expect(db.entries.has("t1|poor")).toBe(false);
  });

  it("часы турниров: свежую строку не трогают, погашенную — доводят сразу", async () => {
    const fresh = { paid: false, at: T0, price: GOLD_DIA, ref: "tour:t1:poor:n", wallet: "poor" };
    db.entries.set("t1|poor", fresh);
    db.entries.set("t1|rich", { ...fresh, ref: `${OLD}:void`, wallet: "rich" });
    db.ledger.add(`tour_fee|${OLD}:0:gold`);
    db.bal.set("rich|gold", 7);
    await sweepStaleEntries();
    expect(db.entries.get("t1|poor")).toBe(fresh);
    expect(db.entries.has("t1|rich")).toBe(false);
    expect(bal("gold")).toBe(12);
  });
});
