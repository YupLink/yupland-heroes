// Пул карты растёт на каждую оплату DARAI — и на повторе моста тоже.
//
// applied=false у acc_move значит «уже списано раньше» (первая попытка легла,
// ответ потерялся). Если на этом месте пул не писать, возврат потом вычтет
// сумму, которую пул не получал, и счётчик карты уйдёт в минус.
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  applied: true,
  poolRefs: [] as string[],
  poolThrows: false,
}));

vi.mock("./spend", () => ({
  payFromAccount: async () => ({ balance: 90_000, applied: state.applied }),
}));
vi.mock("../darai-pools-move", () => ({
  insertPoolMove: async (o: { ref: string }) => {
    if (state.poolThrows) throw new Error("pool down");
    state.poolRefs.push(o.ref);
    return { inserted: true, opId: "x" };
  },
}));
vi.mock("../../db/mcpClient", () => ({ mcpExec: async () => [] }));

import { payDaraiToMapPool } from "./pay-darai-map";

beforeEach(() => {
  state.applied = true;
  state.poolRefs = [];
  state.poolThrows = false;
});

describe("payDaraiToMapPool", () => {
  it("свежая оплата пополняет пул тем же ключом, что и списание", async () => {
    await payDaraiToMapPool({ wallet: "w", amount: 10_000, ref: "field_recall:op1" });
    expect(state.poolRefs).toEqual(["field_recall:op1"]);
  });

  it("повтор моста (applied=false) тоже пишет пул — иначе возврат уведёт его в минус", async () => {
    state.applied = false;
    const res = await payDaraiToMapPool({ wallet: "w", amount: 10_000, ref: "portal:x" });
    expect(res.applied).toBe(false);
    expect(state.poolRefs).toEqual(["portal:x"]);
  });

  it("сбой записи пула не роняет оплату — деньги уже ушли, товар выдаём", async () => {
    state.poolThrows = true;
    const res = await payDaraiToMapPool({ wallet: "w", amount: 10_000, ref: "portal:y" });
    expect(res.balance).toBe(90_000);
  });
});
