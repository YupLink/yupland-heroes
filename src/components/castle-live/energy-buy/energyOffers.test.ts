// Окно энергии (§8.61): энергопак — только золото (билетная ступень ×500),
// DARAI и звёзды. USDT-лесенка — якорь цены звёзд и база выгоды подписки, но не
// способ оплаты; прочие токены (magicdust, RF, GP) окно не кажет.
import { describe, expect, it } from "vitest";
import { packCard, subOpts, subSaving } from "./energyOffers";

type Offer = {
  key: string;
  label: string;
  kind: "tickets" | "darai" | "usd" | "token";
  symbol: string | null;
  ftContract: string | null;
  decimals: number | null;
  price: number | null;
  gold: number | null;
  usd: { USDT: number | null; Darai: number | null; STARS: number | null } | null;
  used: number;
  total: number;
};
const offer = (o: Partial<Offer> & Pick<Offer, "kind" | "price">): Offer => ({
  key: o.symbol ? `token:${o.symbol}` : o.kind,
  label: "",
  symbol: null,
  ftContract: null,
  decimals: null,
  gold: null,
  usd: null,
  used: 0,
  total: 2,
  ...o,
});
const pack = (offers: Offer[] | null, extra: Record<string, unknown> = {}) =>
  ({
    id: "p1",
    title: null,
    amount: 100,
    priceTickets: null,
    priceDarai: null,
    effectivePriceTickets: null,
    effectivePriceGold: null,
    token: null,
    dailyLimit: 0,
    dailyUsed: 0,
    offers,
    bulkDiscountTickets: 0,
    bulkDiscountDarai: 0,
    ...extra,
  }) as unknown as Parameters<typeof packCard>[0];

describe("packCard", () => {
  it("билетная ступень — золото: цена с сервера, оплата видом gold", () => {
    const c = packCard(pack([offer({ kind: "tickets", price: 5, gold: 2500 })]));
    expect(c.game).toMatchObject({ method: "gold", token: "gold", price: 2500, how: { kind: "gold", packId: "p1" } });
  });

  it("сервер не прислал золото — считаем ×500 от билетов", () => {
    const c = packCard(pack([offer({ kind: "tickets", price: 4.25 })]));
    expect(c.game?.price).toBe(2125);
  });

  it("USDT и прочие токены — не способ оплаты; звёзды от USDT-лесенки и DARAI — да", () => {
    const c = packCard(
      pack([
        offer({ kind: "darai", price: 500000 }),
        offer({ kind: "token", symbol: "magicdust", price: 1000 }),
        offer({ kind: "token", symbol: "RF", price: 100000 }),
        offer({ kind: "token", symbol: "USDT", price: 0.1, usd: { USDT: 0.1, Darai: null, STARS: 7 } }),
      ]),
    );
    expect(c.others.map((o) => o.token)).toEqual(["STARS", "Darai"]);
    expect(c.others.find((o) => o.token === "STARS")?.how).toEqual({ kind: "usd", packId: "p1", token: "STARS" });
    expect(c.usdt).toBe(0.1);
  });

  it("тариф в $ — звёзды и DARAI, без USDT", () => {
    const c = packCard(pack([offer({ kind: "usd", price: 1, usd: { USDT: 1, Darai: 900, STARS: 70 } })]));
    expect(c.others.map((o) => o.token)).toEqual(["STARS", "Darai"]);
  });

  it("без настоящего Telegram (§8.127) — звёзд среди способов нет", () => {
    const offers = [
      offer({ kind: "darai", price: 500000 }),
      offer({ kind: "token", symbol: "USDT", price: 0.1, usd: { USDT: 0.1, Darai: null, STARS: 7 } }),
      offer({ kind: "usd", price: 1, usd: { USDT: 1, Darai: 900, STARS: 70 } }),
    ];
    const c = packCard(pack(offers), false);
    expect(c.others.map((o) => o.token)).toEqual(["Darai", "Darai"]);
    expect(c.usdt).toBe(0.1);
    expect(packCard(pack(offers)).others.map((o) => o.token)).toEqual(["STARS", "STARS", "Darai", "Darai"]);
  });

  it("пак без лестницы — одиночная цена в золоте", () => {
    const c = packCard(pack(null, { effectivePriceGold: 1500, dailyUsed: 1, dailyLimit: 3 }));
    expect(c.game).toMatchObject({ method: "gold", price: 1500, used: 1, total: 3 });
  });
});

describe("subOpts", () => {
  const tier = { id: "t1", prices: { STARS: 300, USDT: 3, Darai: 2_000_000 } } as unknown as Parameters<typeof subOpts>[0];
  it("звёзды первыми; без Telegram — только USDT и DARAI", () => {
    expect(subOpts(tier).map((o) => o.token)).toEqual(["STARS", "USDT", "Darai"]);
    expect(subOpts(tier, false).map((o) => o.token)).toEqual(["USDT", "Darai"]);
  });
  it("«только Google» (13.11) — со счёта только DARAI (и картой)", () => {
    expect(subOpts(tier, false, true).map((o) => o.token)).toEqual(["Darai"]);
  });
});

describe("subSaving", () => {
  it("выгода подписки — от USDT-ступени самого большого пака, хоть USDT и не кнопка", () => {
    const cards = [packCard(pack([offer({ kind: "token", symbol: "USDT", price: 25 })], { amount: 8000 }))];
    const tier = { prices: { USDT: 20 }, energyPerDay: 1000, days: 10 } as unknown as Parameters<typeof subSaving>[0];
    expect(subSaving(tier, cards)).toBe(Math.round((1 - 20 / ((10000 * 25) / 8000)) * 100));
  });
});
