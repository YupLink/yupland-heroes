// Запись на турнир (владелец, 04.10.2026): цена у каждого турнира своя (по
// умолчанию 5 золота, пусто — бесплатно); не хватает — записи нет; повтор —
// без второй платы. Фейк базы и платы — tour-entry.fake.ts (семантика
// операторов tour-entry-sql и resource-pay: ключ проводится один раз).
import { beforeEach, describe, expect, it, vi } from "vitest";
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

const T0 = Date.parse("2026-10-05T10:00:00.000Z");
const join = (id: string, acc: string) => joinAs({ id, account: acc, wallet: acc });
const gold = (acc: string) => db.bal.get(`${acc}|gold`);

beforeEach(() => {
  resetDb(T0);
  db.bal.set("rich|gold", 12);
  db.bal.set("poor|gold", 4);
});

describe("запись на турнир", () => {
  it("записался — минус цена турнира (5 золота), отметка оплаты, вид tour_fee", async () => {
    await expect(join("t1", "rich")).resolves.toEqual({
      ok: true,
      joinedAt: "2026-10-05T10:00:00.000Z",
      already: false,
      price: [{ resource: "gold", amount: 5 }],
    });
    expect(gold("rich")).toBe(7);
    expect(db.entries.get("t1|rich")).toMatchObject({ paid: true, wallet: "rich" });
    expect(db.pays[0].ref).toMatch(/^tour:t1:rich:.+/);
    expect(db.pays[0].kinds).toEqual({
      kind: "tour_fee",
      refundKind: "tour_fee_refund",
      keyed: true,
    });
  });

  it("не хватает — tour.err.no_fee, записи нет, баланс не тронут", async () => {
    await expect(join("t1", "poor")).rejects.toThrow("tour.err.no_fee");
    expect(db.entries.has("t1|poor")).toBe(false);
    expect(gold("poor")).toBe(4);
  });

  it("повтор — «уже записан», второй платы нет", async () => {
    await join("t1", "rich");
    await expect(join("t1", "rich")).resolves.toMatchObject({ ok: true, already: true });
    expect(gold("rich")).toBe(7);
    expect(db.pays).toHaveLength(1);
  });

  it("каждый турнир — своя запись и своя цена", async () => {
    db.price.set("t2", [{ resource: "gold", amount: 6 }]);
    await join("t1", "rich");
    await join("t2", "rich");
    expect(gold("rich")).toBe(1);
    await expect(join("t3", "rich")).rejects.toThrow("tour.err.no_fee");
  });

  it("бесплатная запись — сразу оплачена, платы нет", async () => {
    db.price.set("t1", []);
    await expect(join("t1", "poor")).resolves.toMatchObject({ already: false, price: [] });
    expect(db.entries.get("t1|poor")?.paid).toBe(true);
    expect(db.pays).toHaveLength(0);
  });

  it("сорвалась вторая строка цены — первая вернулась, запись снята; повтор платит честно", async () => {
    db.price.set("t1", [
      { resource: "gold", amount: 5 },
      { resource: "diamonds", amount: 1 },
    ]);
    await expect(join("t1", "rich")).rejects.toThrow("tour.err.no_fee");
    expect(gold("rich")).toBe(12);
    expect(db.entries.has("t1|rich")).toBe(false);
    // Ключ первой попытки откачен — новая строка обязана платить новым ключом,
    // иначе «уже проведён» записал бы даром.
    db.bal.set("rich|diamonds", 1);
    await join("t1", "rich");
    expect(gold("rich")).toBe(7);
    expect(db.bal.get("rich|diamonds")).toBe(0);
    expect(db.pays[1].ref).not.toBe(db.pays[0].ref);
  });

  it("закрыт для записи — tour.err.not_open; уже записанному — ок без платы", async () => {
    await join("t1", "rich");
    db.open = false;
    await expect(join("t2", "rich")).rejects.toThrow("tour.err.not_open");
    await expect(join("t1", "rich")).resolves.toMatchObject({ already: true });
    expect(gold("rich")).toBe(7);
  });

  it("гонка двух записей: второй запрос — «записан»; чужая плата ещё идёт — «оформляется»", async () => {
    await join("t1", "rich");
    db.race = true;
    await expect(join("t1", "rich")).resolves.toMatchObject({ ok: true, already: true });
    expect(gold("rich")).toBe(7);
    await expect(join("t2", "rich")).rejects.toThrow("tour.err.busy");
  });

  it("свежая неоплаченная строка (вторая вкладка платит) — busy без платы", async () => {
    const row = { paid: false, at: T0 - MIN, price: [], ref: "tour:t1:rich:x", wallet: "rich" };
    db.entries.set("t1|rich", row);
    await expect(join("t1", "rich")).rejects.toThrow("tour.err.busy");
    expect(db.pays).toHaveLength(0);
  });

  it("слепой повтор вставки — строка своя (ключ наш): платим, а не «оформляется»", async () => {
    db.retryClaim = true;
    await expect(join("t1", "rich")).resolves.toMatchObject({ ok: true, already: false });
    expect(gold("rich")).toBe(7);
    expect(db.entries.get("t1|rich")?.paid).toBe(true);
  });
});

describe("запись: отметка «оплачено» не легла", () => {
  it("ответ потерян при удачной отметке — ок, плата одна", async () => {
    db.losePaid = true;
    await expect(join("t1", "rich")).resolves.toMatchObject({ ok: true, already: false });
    expect(gold("rich")).toBe(7);
  });

  it("отметка упала дважды — плату не трогаем; зависшую строку засчитываем без второго списания", async () => {
    db.failPaid = 2;
    await expect(join("t1", "rich")).rejects.toThrow("tour.err.busy");
    expect(gold("rich")).toBe(7);
    expect(db.entries.get("t1|rich")?.paid).toBe(false);
    db.now += 3 * MIN;
    await expect(join("t1", "rich")).resolves.toMatchObject({ ok: true, already: true });
    expect(gold("rich")).toBe(7);
    expect(db.pays).toHaveLength(1);
  });

  it("черновик удалили, пока шла плата (строки нет) — плата вернулась, not_open", async () => {
    db.cascade = true;
    await expect(join("t1", "rich")).rejects.toThrow("tour.err.not_open");
    expect(gold("rich")).toBe(12);
  });

  it("нашу попытку сочли зависшей и записали другую — наша плата (и энергия) вернулась", async () => {
    db.price.set("t1", [{ resource: "energy", amount: 3 }]);
    db.bal.set("rich|energy", 10);
    const price = [{ resource: "energy" as const, amount: 3 }];
    db.takenBy = { paid: true, at: T0, price, ref: "tour:t1:rich:other", wallet: "rich" };
    await expect(join("t1", "rich")).resolves.toMatchObject({ ok: true, already: true });
    expect(db.bal.get("rich|energy")).toBe(10);
  });
});
