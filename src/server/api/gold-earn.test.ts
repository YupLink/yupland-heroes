// Золото вместо билетов-наград (§8.61): 100 за билет, ключ (вид, ref) — как был;
// магазин билетов отказывает одной фразой.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  moves: [] as Array<[string, number, string, string]>,
  resolved: "acc_W" as string | null,
}));

vi.mock("./gold-move", () => ({
  goldMove: async (account: string, delta: number, kind: string, ref: string) =>
    void s.moves.push([account, delta, kind, ref]),
}));
vi.mock("./currency/move", () => ({ accAccountId: async () => s.resolved }));

const { creditGoldForTickets } = await import("./gold-earn");
const { refuseTicketPurchase, TICKETS_GONE } = await import("./tickets-shop-closed");

beforeEach(() => {
  s.moves.length = 0;
  s.resolved = "acc_W";
});

describe("creditGoldForTickets", () => {
  it("готовый аккаунт: 1 билет = 100 золота, вид и ключ — как переданы", async () => {
    expect(
      await creditGoldForTickets({
        account: "acc_A",
        tickets: 1,
        kind: "task",
        ref: "task:acc_A:t1",
      }),
    ).toBe(100);
    expect(s.moves).toEqual([["acc_A", 100, "task", "task:acc_A:t1"]]);
  });

  it("дробные билеты — золото до 4 знаков (0.1234 → 12.34)", async () => {
    expect(
      await creditGoldForTickets({ account: "acc_A", tickets: 0.1234, kind: "museum", ref: "r" }),
    ).toBe(12.34);
    expect(s.moves[0][1]).toBe(12.34);
  });

  it("без аккаунта — по кошельку через резолвер", async () => {
    await creditGoldForTickets({ wallet: "w.near", tickets: 2.5, kind: "gift", ref: "gift:1" });
    expect(s.moves).toEqual([["acc_W", 250, "gift", "gift:1"]]);
  });

  it("ноль и минус — ничего не двигает", async () => {
    expect(
      await creditGoldForTickets({ account: "acc_A", tickets: 0, kind: "boss", ref: "r" }),
    ).toBe(0);
    expect(
      await creditGoldForTickets({ account: "acc_A", tickets: -3, kind: "boss", ref: "r" }),
    ).toBe(0);
    expect(s.moves).toEqual([]);
  });

  it("аккаунт не нашёлся — бросает, на счёт ничего", async () => {
    s.resolved = null;
    await expect(
      creditGoldForTickets({ wallet: "w.near", tickets: 1, kind: "referral", ref: "tier:w:1" }),
    ).rejects.toThrow("Не найден аккаунт");
    expect(s.moves).toEqual([]);
  });
});

describe("магазин билетов закрыт", () => {
  it("refuseTicketPurchase всегда бросает фразу, которую переводит клиент", () => {
    expect(() => refuseTicketPurchase()).toThrow(TICKETS_GONE);
    expect(TICKETS_GONE.toLowerCase().startsWith("билетов больше нет")).toBe(true);
  });
});
