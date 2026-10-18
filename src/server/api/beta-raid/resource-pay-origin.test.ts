// Плата товаром (порталы, постройки, заклинания): откат возвращает штуки С ТЕМИ
// ЖЕ метками происхождения, что ушли в ЭТОМ платеже (ПРАВИЛА §8.18). Снимок
// хранился по виду товара на весь процесс — два игрока, платящие одной
// пшеницей, получали при откате метки друг друга.
import { beforeEach, describe, expect, it, vi } from "vitest";

const s = vi.hoisted(() => ({
  /** Что лежит у героя игрока: сколько с мобов. */
  mobOf: { hA: 0, hB: 5 } as Record<string, number>,
  back: [] as Array<{ hero: string; key: string; qty: number; snap: unknown }>,
  /** Золото игрока A ждёт этот сигнал и отвечает «в минус». */
  gate: null as null | Promise<void>,
  /** Сменённый основной герой кошелька (нет — h + имя кошелька). */
  hero: {} as Record<string, string>,
}));

vi.mock("@/server/db/pg", () => ({
  sb: {
    rpc: async (_fn: string, a: { p_account: string; p_delta: number }) => {
      if (a.p_account === "acc_wA" && a.p_delta < 0) {
        await s.gate;
        return { error: { message: "res_move: в минус" } };
      }
      return { error: null };
    },
  },
}));
vi.mock("@/server/api/currency/move", () => ({
  accAccountId: async (w: string) => `acc_${w}`,
  accMove: async () => ({}),
}));
vi.mock("@/server/api/heroes-shared", () => ({}));
vi.mock("@/server/api/tickets-ledger", () => ({}));
vi.mock("@/server/api/currency/spend", () => ({}));
vi.mock("@/server/api/raid-helpers", () => ({}));
vi.mock("@/server/api/energy-credit", () => ({}));
// «Помидоры» и «Помидор» — один товар: канон ключа стека — cst_tomato.
vi.mock("@/server/api/beta-raid/item-alias", () => ({
  canonStackKey: async (kind: string, ref: string) =>
    `${kind}:${ref === "cst_tomatoes" ? "cst_tomato" : ref}`,
}));
vi.mock("@/server/api/beta-raid/market-backpack", () => ({
  resolveBackpack: async (w: string) => ({ heroId: s.hero[w] ?? `h${w.slice(1)}` }),
  takeFromBackpackStack: async (hero: string, _key: string, qty: number) => ({
    kind: "custom",
    refId: "cst_wheat",
    name: "Пшеница",
    image: null,
    mobTaken: Math.min(qty, s.mobOf[hero] ?? 0),
    mineTaken: 0,
    fieldTaken: 0,
  }),
  returnToBackpackStack: async (hero: string, key: string, qty: number, snap: unknown) =>
    void s.back.push({ hero, key, qty, snap }),
}));

import { payResources, refundResources } from "@/server/api/beta-raid/resource-pay";

const wheat = { resource: "item" as const, itemKey: "custom:cst_wheat", amount: 5 };
const gold = { resource: "gold" as const, amount: 100 };

beforeEach(() => {
  s.back = [];
  s.gate = null;
  s.hero = {};
});

describe("откат платы товаром", () => {
  it("возвращает метки своего платежа, даже если между ними платил другой игрок", async () => {
    let release = () => {};
    s.gate = new Promise<void>((r) => (release = r));
    // A: пшеница списана (покупная), золото ждёт; тем временем B платит пшеницей с мобов.
    const a = payResources("wA", [wheat, gold], "portal:m:1,2:A").catch((e: Error) => e);
    await new Promise((r) => setTimeout(r, 0));
    await payResources("wB", [wheat], "portal:m:1,2:B");
    release();
    expect(await a).toBeInstanceOf(Error);
    expect(s.back).toHaveLength(1);
    expect(s.back[0]).toMatchObject({ hero: "hA", key: "custom:cst_wheat", qty: 5 });
    expect(s.back[0].snap).toMatchObject({ mobTaken: 0 });
  });

  it("возврат снаружи (шаг не состоялся) по тому же ref: канон стека и метки платежа", async () => {
    const tomatoes = { resource: "item" as const, itemKey: "custom:cst_tomatoes", amount: 3 };
    await payResources("wB", [tomatoes], "portal:m:1,2:C");
    await refundResources("wB", [tomatoes], "portal:m:1,2:C");
    expect(s.back).toEqual([
      {
        hero: "hB",
        key: "custom:cst_tomato",
        qty: 3,
        snap: expect.objectContaining({ mobTaken: 3 }),
      },
    ]);
  });

  it("сменил основного между платой и откатом — штуки вернутся тому, с кого списали", async () => {
    await payResources("wC", [wheat], "portal:m:1,2:D");
    s.hero.wC = "hZ";
    await refundResources("wC", [wheat], "portal:m:1,2:D");
    expect(s.back[0]).toMatchObject({ hero: "hC", key: "custom:cst_wheat", qty: 5 });
  });
});
