// Поле цены дропа в админке — в золоте, в базе прежний ticket_cost в билетах.
// ticket_cost в базе — integer: в базу уходят только целые билеты ≥ 1,
// иначе Postgres округлит дробь до 0 и платный дроп станет бесплатным.
import { describe, expect, it } from "vitest";
import { DEFAULT_CLAIM_GOLD, goldFromTicketCost, snapClaimGold, ticketCostFromGold } from "./goldCost";

describe("ticketCostFromGold — поле (золото) → ticket_cost (целые билеты)", () => {
  it("кратное 500 — ровно: 500 = 1, 1000 = 2, 5000 = 10", () => {
    expect(ticketCostFromGold("500")).toBe(1);
    expect(ticketCostFromGold("1000")).toBe(2);
    expect(ticketCostFromGold(5000)).toBe(10);
  });

  it("не кратное 500 — до ближайшего целого билета, не меньше 1", () => {
    expect(ticketCostFromGold("1")).toBe(1);
    expect(ticketCostFromGold("100")).toBe(1);
    expect(ticketCostFromGold("249")).toBe(1);
    expect(ticketCostFromGold("300")).toBe(1);
    expect(ticketCostFromGold("700")).toBe(1);
    expect(ticketCostFromGold("800")).toBe(2);
    expect(ticketCostFromGold("1249,5")).toBe(2);
  });

  it("всегда целое ≥ 1 — база (integer) не обнулит цену", () => {
    for (const g of [1, 5, 99, 100, 250, 333, 499, 501, 735, 1234, 99999]) {
      const t = ticketCostFromGold(g);
      expect(Number.isInteger(t)).toBe(true);
      expect(t).toBeGreaterThanOrEqual(1);
    }
  });

  it("пустое или мусор — прежний 1 билет", () => {
    expect(ticketCostFromGold("")).toBe(1);
    expect(ticketCostFromGold("abc")).toBe(1);
    expect(ticketCostFromGold("-5")).toBe(1);
    expect(ticketCostFromGold("0")).toBe(1);
  });
});

describe("goldFromTicketCost — ticket_cost из базы → золото для поля", () => {
  it("билеты ×500; пусто — как 1 билет", () => {
    expect(goldFromTicketCost(1)).toBe(500);
    expect(goldFromTicketCost(10)).toBe(5000);
    expect(goldFromTicketCost(null)).toBe(500);
    expect(goldFromTicketCost(undefined)).toBe(500);
  });

  it("туда-обратно без потерь на кратных 500", () => {
    for (const g of [500, 1000, 1500, 5000]) expect(goldFromTicketCost(ticketCostFromGold(g))).toBe(g);
    expect(DEFAULT_CLAIM_GOLD).toBe("500");
  });
});

describe("snapClaimGold — поле после ввода показывает то, что уйдёт в базу", () => {
  it("округляет до кратного 500", () => {
    expect(snapClaimGold("100")).toBe("500");
    expect(snapClaimGold("300")).toBe("500");
    expect(snapClaimGold("800")).toBe("1000");
    expect(snapClaimGold("1500")).toBe("1500");
    expect(snapClaimGold("")).toBe("500");
  });
});
