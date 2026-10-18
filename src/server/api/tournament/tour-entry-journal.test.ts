// Плата за запись на турнир — в журнал сделок (вид 'tour'), как у ворот и
// портала: товар, отданный за запись, тратит купленное первым (goldProfit), а
// энергия в цене попадает в причины трат. Бесплатная запись и повтор — без строк.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TourEntryPrice } from "@/lib/tournament/types";

const st = vi.hoisted(() => ({
  price: [] as unknown[],
  notes: [] as Array<Record<string, unknown>>,
  paid: false,
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const o = { inputValidator: () => o, handler: (fn: unknown) => fn };
    return o;
  },
}));
vi.mock("../beta-raid/gate", () => ({ requireBetaRaid: async () => "w" }));
vi.mock("../beta-raid/owner", () => ({ raidOwner: async () => "acc" }));
vi.mock("../../auth", () => ({ isAdminWallet: () => false }));
vi.mock("./tour-gate", () => ({ requireTourHere: async () => "map-1" }));
vi.mock("../beta-raid/resource-pay", () => ({
  payResources: async () => undefined,
  refundResources: async () => undefined,
}));
vi.mock("../beta-raid/econ/trade-hooks", () => ({
  notePricesPaid: async (o: Record<string, unknown>) => void st.notes.push(o),
}));
vi.mock("../../db/mcpClient", () => ({
  mcpExec: async (sql: string) => {
    const one = (r: unknown) => [{ _row: r }];
    if (sql.includes("INSERT INTO yuplink.tournament_entry")) {
      const ref = /t\.entry_price, '([^']+)', '[^']*' FROM t/.exec(sql)?.[1] ?? "";
      const free = st.price.length === 0;
      if (st.paid) return one({ open: true, mine: false, paid: true, joined_ms: 1 });
      return one({
        open: true,
        mine: true,
        paid: free,
        price: st.price,
        pay_ref: ref,
        joined_ms: 1,
      });
    }
    if (sql.includes("SET paid = true")) return one({ joined_ms: 2 });
    return [];
  },
}));

const { joinTournament } = await import("./tour-entry");
const join = joinTournament as unknown as (a: {
  data: { q: number; r: number; id: string };
}) => Promise<{ already: boolean }>;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  st.notes = [];
  st.paid = false;
  st.price = [{ resource: "gold", amount: 5 }];
});

describe("плата за запись в журнале сделок", () => {
  it("оплатил — строка вида tour на клетке Арены с ключом платы", async () => {
    const price: TourEntryPrice[] = [
      { resource: "item", amount: 2, itemKey: "custom:apple", itemName: "Яблоко" },
      { resource: "energy", amount: 3 },
    ];
    st.price = price;
    await join({ data: { q: 4, r: -2, id: "t1" } });
    await flush();
    expect(st.notes).toHaveLength(1);
    expect(st.notes[0]).toMatchObject({ source: "tour", wallet: "w", mapId: "map-1", q: 4, r: -2 });
    expect(st.notes[0].prices).toEqual(price);
    expect(String(st.notes[0].ref)).toMatch(/^tour:t1:acc:.+/);
  });

  it("бесплатно — журнал не трогаем", async () => {
    st.price = [];
    await join({ data: { q: 0, r: 0, id: "t1" } });
    await flush();
    expect(st.notes).toHaveLength(0);
  });

  it("уже записан — второй строки нет", async () => {
    st.paid = true;
    await expect(join({ data: { q: 0, r: 0, id: "t1" } })).resolves.toMatchObject({
      already: true,
    });
    await flush();
    expect(st.notes).toHaveLength(0);
  });
});
