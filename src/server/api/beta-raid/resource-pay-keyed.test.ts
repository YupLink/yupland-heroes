// Плата глазами записи на турнир: несостоявшийся возврат кричит в лог (шим
// отвечает {error}, а не бросает); «не хватает» — только на нехватку; с keyed
// энергия и товар идут по ключу операции (pay-once), без него — прежним путём.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  rpc: [] as Array<{ fn: string; args: Record<string, unknown> }>,
  answer: (_fn: string, _a: Record<string, unknown>) =>
    ({ error: null }) as { error: { message: string } | null },
  account: "acc1" as string | null,
  once: [] as string[],
}));

vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      s.rpc.push({ fn, args });
      return s.answer(fn, args);
    },
  },
}));
vi.mock("@/server/api/currency/move", () => ({
  accAccountId: async () => s.account,
  accMove: async () => ({}),
}));
vi.mock("@/server/api/heroes-shared", () => ({}));
vi.mock("@/server/api/tickets-ledger", () => ({}));
vi.mock("@/server/api/currency/spend", () => ({}));
vi.mock("@/server/api/raid-helpers", () => ({}));
vi.mock("@/server/api/energy-credit", () => ({ creditEnergy: async () => undefined }));
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) => `${kind}:${ref}`,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async () => ({ heroId: "h1" }),
  takeFromBackpackStack: async () => null,
  returnToBackpackStack: async () => undefined,
}));
vi.mock("@/server/api/beta-raid/pay-once", () => ({
  spendEnergyOnce: async (_w: string, _n: number, key: string) => void s.once.push(`energy ${key}`),
  refundEnergyOnce: async (_w: string, _n: number, key: string) =>
    void s.once.push(`energy back ${key}`),
}));
vi.mock("@/server/api/beta-raid/pay-once-item", () => ({
  takeItemOnce: async (_h: string, stack: string, _n: number, key: string) => {
    s.once.push(`item ${stack} ${key}`);
    return { kind: "custom", refId: "a", name: "A", image: null, mobTaken: 0 };
  },
  returnItemOnce: async (
    _h: string,
    stack: string,
    _n: number,
    _snap: unknown,
    _a: unknown,
    key: string,
  ) => void s.once.push(`item back ${stack} ${key}`),
}));

import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";

const TOUR = { kind: "tour_fee", refundKind: "tour_fee_refund", keyed: true };
const gold = { resource: "gold" as const, amount: 5 };
const dia = { resource: "diamonds" as const, amount: 1 };
const energy = { resource: "energy" as const, amount: 3 };
const item = { resource: "item" as const, amount: 2, itemKey: "custom:a", itemName: "A" };
let err: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  Object.assign(s, { rpc: [], once: [], account: "acc1" });
  s.answer = () => ({ error: null });
  err = vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("возврат не прошёл — в лог", () => {
  it("res_move ответил {error} на возврат — кричим, а не молчим", async () => {
    s.answer = (_fn, a) =>
      a.p_resource === "diamonds"
        ? { error: { message: "res_move: в минус" } }
        : Number(a.p_delta) > 0
          ? { error: { message: "MCP POST 502" } }
          : { error: null };
    await expect(payResources("w", [gold, dia], "tour:t:a:n", TOUR)).rejects.toThrow(
      "Не хватает ресурсов",
    );
    expect(err).toHaveBeenCalledWith(expect.stringContaining("НЕ вернули 5 gold"), "MCP POST 502");
  });

  it("нет ресурсного счёта при возврате — тоже в лог", async () => {
    s.account = null;
    await refundResources("w", [gold], "tour:t:a:n", TOUR);
    expect(s.rpc).toHaveLength(0);
    expect(err).toHaveBeenCalledWith(
      expect.stringContaining("НЕ вернули 5 gold"),
      "ресурсный счёт не найден",
    );
  });
});

describe("энергия без ключа (портал, стройка)", () => {
  it("нехватка — «Не хватает энергии», прочий сбой базы — как есть", async () => {
    s.answer = () => ({ error: { message: "not_enough_energy:2:3" } });
    await expect(payResources("w", [energy], "portal:m:1,2:n")).rejects.toThrow(
      "Не хватает энергии",
    );
    s.answer = () => ({ error: { message: "MCP timeout for id=812" } });
    await expect(payResources("w", [energy], "portal:m:1,2:n")).rejects.toThrow(
      "MCP timeout for id=812",
    );
    expect(s.once).toHaveLength(0);
  });
});

describe("keyed: энергия и товар — по ключу операции строки", () => {
  it("плата и откат идут через pay-once тем же ключом строки", async () => {
    s.answer = (_fn, a) =>
      a.p_resource === "diamonds" ? { error: { message: "res_move: в минус" } } : { error: null };
    await expect(payResources("w", [energy, item, dia], "tour:t:a:n", TOUR)).rejects.toThrow(
      "Не хватает ресурсов",
    );
    expect(s.once).toEqual([
      "energy tour:t:a:n:0:energy",
      "item custom:a tour:t:a:n:1:item",
      "energy back tour:t:a:n:0:energy",
      "item back custom:a tour:t:a:n:1:item",
    ]);
    expect(s.rpc.some((c) => c.fn === "touch_energy_atomic")).toBe(false);
  });
});
