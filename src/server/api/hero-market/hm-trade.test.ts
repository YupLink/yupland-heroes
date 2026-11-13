// Рынок героев: покупка и снятие. База — память с семантикой функций
// hero_market_buy / hero_market_withdraw (hm-trade.fake.ts). Проверяем: продавцу
// 91 %, 9 % золотом сгорает, DARAI-комиссия — пул карты 60 % / сжигание 15 % /
// разработчикам 25 %; двойная покупка (два покупателя, двойное нажатие, покупка
// против снятия) — платят один раз, герой у одного; отказы — ключи словаря.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, fakeExec, putLot, resetDb } from "./hm-trade.fake";

const batches = vi.hoisted(() => ({ n: 0 }));
const lock = vi.hoisted(() => ({ locked: new Set<string>() }));
vi.mock("@/server/db/mcpClient", () => ({ mcpExec: (sql: string) => fakeExec(sql) }));
vi.mock("@/server/api/chips-market-lock", () => ({
  marketLockState: async (account: string) => ({ locked: lock.locked.has(account) }),
}));
vi.mock("@/server/api/energy-sub/batch", () => ({
  runDueBatches: async () => {
    batches.n += 1;
    return [];
  },
}));

// Сломанное с купленного героя — в инвентарь (§8.63 п.3): снятие зовётся после
// покупки (гейт механики и сам SQL — в art-broken.test.ts).
const strips = vi.hoisted(() => [] as Array<[string, string, string]>);
vi.mock("@/server/api/art-repair/art-broken", () => ({
  stripBrokenFromHero: async (wallet: string, heroId: string, key: string) => {
    strips.push([wallet, heroId, key]);
    return 0;
  },
}));

const { buyHeroAs, withdrawHeroAs } = await import("./hm-trade");

const buy = (
  account: string,
  lotId: string,
  currency: "gold" | "darai",
  op = `op-${account}-1`,
  expectPrice?: number,
) =>
  buyHeroAs(`${account}.near`, account, {
    op,
    lotId,
    currency,
    ...(expectPrice ? { expectPrice } : {}),
  });
const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

beforeEach(() => {
  resetDb();
  batches.n = 0;
  strips.length = 0;
  lock.locked.clear();
  db.gold.set("acc_B", 2000);
  db.gold.set("acc_C", 2000);
});

describe("покупка за золото", () => {
  it("покупатель платит цену, продавцу 91 %, 9 % сгорает; герой — покупателю", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    const r = await buy("acc_B", "L1", "gold");
    expect(r).toMatchObject({
      ok: true,
      fresh: true,
      price: 1500,
      fee: 135,
      sellerGot: 1365,
      currency: "gold",
    });
    expect(db.gold.get("acc_B")).toBe(500);
    expect(db.gold.get("acc_S")).toBe(1365);
    expect(sum(db.gold)).toBe(4000 - 135);
    expect([...db.moves.keys()].sort()).toEqual([
      "hero_market_buy|hmkt:L1",
      "hero_market_fee|hmkt:L1",
      "hero_market_sale|hmkt-sell:L1",
    ]);
    expect(db.owner.get("ugi_L1")).toBe("acc_B");
    expect(batches.n).toBe(0);
  });

  it("не хватает золота — ключ с «нужно/у тебя», ничего не двинулось", async () => {
    putLot({ id: "L1", priceGold: 2500 });
    await expect(buy("acc_B", "L1", "gold")).rejects.toThrow(
      'heromkt.gold_short|{"need":2500,"have":2000}',
    );
    expect(db.moves.size).toBe(0);
    expect(db.owner.get("ugi_L1")).toBe("_hero_market");
  });

  it("свой лот, лот без золотой цены, другая цена — отказы ключами", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    putLot({ id: "L2", priceGold: null, priceDarai: 300_000 });
    await expect(buy("acc_S", "L1", "gold")).rejects.toThrow("heromkt.own_lot");
    await expect(buy("acc_B", "L2", "gold")).rejects.toThrow("heromkt.gold_off");
    await expect(buy("acc_B", "L1", "gold", "op-x", 1400)).rejects.toThrow(
      'heromkt.price_changed|{"price":1500}',
    );
    await expect(buy("acc_B", "nope", "gold")).rejects.toThrow("heromkt.lot_none");
  });
});

describe("покупка за DARAI", () => {
  it("продавцу 91 %; комиссия: пул карты 60 %, сжигание 15 %, разработчикам 25 %; пачки корзин запущены", async () => {
    putLot({ id: "L1", priceGold: null, priceDarai: 1_021_798 });
    db.darai.set("acc_B", 1_021_798);
    const r = await buy("acc_B", "L1", "darai");
    expect(r).toMatchObject({
      price: 1_021_798,
      fee: 91961.82,
      sellerGot: 929836.18,
      currency: "darai",
    });
    expect(db.darai.get("acc_B")).toBe(0);
    expect(db.darai.get("acc_S")).toBe(929836.18);
    expect(db.buckets.get("map")).toBeCloseTo(55177.092, 6);
    expect(db.buckets.get("sub_burn")).toBeCloseTo(13794.273, 6);
    expect(db.buckets.get("sub_dev")).toBeCloseTo(22990.455, 6);
    await vi.waitFor(() => expect(batches.n).toBe(1));
  });

  it("не хватает DARAI — ключ с числами", async () => {
    putLot({ id: "L1", priceGold: 1500, priceDarai: 300_000 });
    db.darai.set("acc_B", 1000.7);
    await expect(buy("acc_B", "L1", "darai")).rejects.toThrow(
      'heromkt.darai_short|{"need":300000,"have":1000}',
    );
  });

  it("лот с обеими ценами: покупатель выбирает валюту", async () => {
    putLot({ id: "L1", priceGold: 1500, priceDarai: 300_000 });
    const r = await buy("acc_B", "L1", "gold");
    expect(r.currency).toBe("gold");
    expect(db.darai.size).toBe(0);
  });
});

describe("гонки и повторы", () => {
  it("два покупателя разом — герой у одного, второй «уже купили», деньги списаны один раз", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    const res = await Promise.allSettled([buy("acc_B", "L1", "gold"), buy("acc_C", "L1", "gold")]);
    const ok = res.filter((x) => x.status === "fulfilled");
    const bad = res.filter((x): x is PromiseRejectedResult => x.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(String(bad[0]?.reason?.message)).toBe("heromkt.lot_sold");
    expect(sum(db.gold)).toBe(4000 - 135);
    expect(db.gold.get("acc_S")).toBe(1365);
  });

  it("двойное нажатие (тот же ключ) — один платёж, второй ответ — тот же итог с fresh=false", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    const [a, b] = await Promise.all([
      buy("acc_B", "L1", "gold", "op-same"),
      buy("acc_B", "L1", "gold", "op-same"),
    ]);
    expect([a.fresh, b.fresh].sort()).toEqual([false, true]);
    expect(a.price).toBe(b.price);
    expect(db.gold.get("acc_B")).toBe(500);
  });

  it("повтор после ответа (обрыв сети) — без второго списания", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    await buy("acc_B", "L1", "gold", "op-retry");
    const again = await buy("acc_B", "L1", "gold", "op-retry");
    expect(again).toMatchObject({ fresh: false, price: 1500 });
    expect(db.gold.get("acc_B")).toBe(500);
  });

  it("покупка против снятия — кто первым взял лот; второй получает отказ, денег не тронуто зря", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    const res = await Promise.allSettled([
      withdrawHeroAs("acc_S", { op: "wd-00001", lotId: "L1" }),
      buy("acc_B", "L1", "gold"),
    ]);
    expect(res[0].status).toBe("fulfilled");
    expect(res[1].status === "rejected" && res[1].reason.message).toBe("heromkt.lot_withdrawn");
    expect(db.gold.get("acc_B")).toBe(2000);
    expect(db.owner.get("ugi_L1")).toBe("acc_S");
  });

  it("исключение базы при списании (гонка баланса, замок) — ключ, и всё откатилось", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    db.failMove = "res_move: в минус";
    await expect(buy("acc_B", "L1", "gold")).rejects.toThrow("heromkt.gold_short");
    db.failMove = "canceling statement due to lock timeout";
    await expect(buy("acc_B", "L1", "gold")).rejects.toThrow("heromkt.busy_retry");
    db.failMove = "something odd";
    await expect(buy("acc_B", "L1", "gold")).rejects.toThrow("heromkt.failed");
    expect(db.lots.get("L1")?.status).toBe("active");
    expect(db.owner.get("ugi_L1")).toBe("_hero_market");
  });
});

describe("снятие своего лота", () => {
  it("только продавец; герой назад; повтор — тот же итог; проданный не снять", async () => {
    putLot({ id: "L1" });
    putLot({ id: "L2" });
    await expect(withdrawHeroAs("acc_B", { op: "wd-00001", lotId: "L1" })).rejects.toThrow(
      "heromkt.not_seller",
    );
    const r = await withdrawHeroAs("acc_S", { op: "wd-00002", lotId: "L1" });
    expect(r).toEqual({ ok: true, fresh: true, lotId: "L1", itemId: "ugi_L1" });
    expect(db.owner.get("ugi_L1")).toBe("acc_S");
    expect((await withdrawHeroAs("acc_S", { op: "wd-00002", lotId: "L1" })).fresh).toBe(false);
    await buy("acc_B", "L2", "gold");
    await expect(withdrawHeroAs("acc_S", { op: "wd-00003", lotId: "L2" })).rejects.toThrow(
      "heromkt.lot_sold",
    );
  });
});

describe("новичок без купленного пака", () => {
  it("покупка закрыта, как на маркете фишек: отказ ключом, деньги и лот на месте", async () => {
    putLot({ id: "lot_n", priceGold: 1000 });
    lock.locked.add("acc_B");
    await expect(buy("acc_B", "lot_n", "gold")).rejects.toThrow("heromkt.market_locked");
    expect(db.gold.get("acc_B")).toBe(2000);
    expect(db.lots.get("lot_n")?.status).toBe("active");
  });
});

describe("сломанные артефакты купленного героя (§8.63 п.3)", () => {
  it("после покупки сломанное снимается с героя ключом лота (повтор ключа не задвоит)", async () => {
    putLot({ id: "L1", priceGold: 1500 });
    const r = await buy("acc_B", "L1", "gold");
    expect(r.heroId).toBeTruthy();
    expect(strips).toEqual([["acc_B.near", r.heroId, "hm_L1"]]);
  });

  it("покупка не прошла — снимать нечего", async () => {
    putLot({ id: "L1", priceGold: 2500 });
    await expect(buy("acc_B", "L1", "gold")).rejects.toThrow();
    expect(strips).toEqual([]);
  });
});
