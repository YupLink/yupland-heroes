// Подсветка нехватки (владелец, 13.11.2026): лопата за бревно и руду — без
// бревна строка красная и кнопка гаснет; неизвестный баланс — не нехватка.
import { afterEach, describe, expect, it } from "vitest";
import type { MarketItemView } from "@/lib/buildingEffect";
import { setStarsForDarai } from "@/lib/starsForDarai";
import { cartCost } from "./cartCost";
import { haveOf, isShort, priceKeys, shortKeys, type ShortSources } from "./marketShort";
import type { HaveFn } from "./usePlayerFunds";

const LOG = "cst_wtza7b6iq7va";
const ORE = "cst_izilsngrki5v";

const shovel = {
  id: "mkt_shovel",
  side: "buy",
  kind: "custom",
  refId: "cst_aosknovigzpu",
  name: "Каменная Лопата",
  image: null,
  giveAmount: 1,
  giveToken: null,
  priceResource: "custom",
  priceToken: LOG,
  priceAmount: 1,
  priceName: "Бревна Дуба",
  priceImage: null,
  price2Resource: "custom",
  price2Token: ORE,
  price2Amount: 1,
  price2Name: "Горная Руда",
  price2Image: null,
  stock: null,
  sold: 0,
  remaining: null,
  buyable: true,
  lockKey: null,
} as MarketItemView;

const funds =
  (bal: Partial<Record<string, number | null>>): HaveFn =>
  (res, token) => {
    const k = res === "token" ? `token:${token}` : res;
    return k in bal ? (bal[k] ?? null) : Number.POSITIVE_INFINITY;
  };
const src = (bal: Partial<Record<string, number | null>>, stacks?: ShortSources["stacks"]) => ({
  have: funds(bal),
  stacks,
});

afterEach(() => setStarsForDarai(null));

describe("сколько есть", () => {
  it("свой товар — стек рюкзака по ключу вида:шаблон; нет стека — 0", () => {
    const s = src({}, [{ stackKey: `custom:${LOG}`, count: 2 }]);
    expect(haveOf("custom", LOG, s)).toBe(2);
    expect(haveOf("custom", ORE, s)).toBe(0);
  });

  it("рюкзак не приехал, артефакт/пак/герой, предметный Infinity — не знаем", () => {
    expect(haveOf("custom", LOG, src({}))).toBeNull();
    expect(haveOf("art", "art_ring", src({}, []))).toBeNull();
    expect(haveOf("pack", "cp_1", src({}, []))).toBeNull();
    expect(haveOf("gold", null, src({ gold: null }))).toBeNull();
  });
});

describe("лопата за бревно и руду", () => {
  it("нет ни бревна, ни руды — обе строки в нехватке", () => {
    const keys = shortKeys(cartCost([{ it: shovel, qty: 1 }]), src({}, []));
    expect([...keys].sort()).toEqual([`custom:${LOG}`, `custom:${ORE}`].sort());
  });

  it("бревно есть, руды нет — красная только руда", () => {
    const s = src({}, [{ stackKey: `custom:${LOG}`, count: 1 }]);
    expect([...shortKeys(cartCost([{ it: shovel, qty: 1 }]), s)]).toEqual([`custom:${ORE}`]);
  });

  it("на одну хватает, на две — нет: считаем за всё количество", () => {
    const s = src({}, [
      { stackKey: `custom:${LOG}`, count: 1 },
      { stackKey: `custom:${ORE}`, count: 5 },
    ]);
    expect(shortKeys(cartCost([{ it: shovel, qty: 1 }]), s).size).toBe(0);
    expect([...shortKeys(cartCost([{ it: shovel, qty: 2 }]), s)]).toEqual([`custom:${LOG}`]);
  });

  it("порядок ключей плитки совпадает с порядком цен", () => {
    expect(priceKeys(shovel)).toEqual([`custom:${LOG}`, `custom:${ORE}`]);
  });
});

describe("валюты", () => {
  const gold = {
    ...shovel,
    priceResource: "gold",
    priceToken: null,
    priceAmount: 10,
    price2Resource: null,
    price2Token: null,
    price2Amount: null,
  } as MarketItemView;

  it("золота 9 при цене 10 — нехватка; 10 — хватает; баланс не приехал — молчим", () => {
    const [c] = cartCost([{ it: gold, qty: 1 }]);
    expect(isShort(c, src({ gold: 9 }))).toBe(true);
    expect(isShort(c, src({ gold: 10 }))).toBe(false);
    expect(isShort(c, src({ gold: null }))).toBe(false);
  });

  it("дробный хвост 0,1×3 не даёт ложной нехватки", () => {
    const [c] = cartCost([{ it: { ...gold, priceAmount: 0.1 } as MarketItemView, qty: 3 }]);
    expect(isShort(c, src({ gold: 0.3 }))).toBe(false);
  });

  it("DARAI звездочника сверяется со звёздами", () => {
    setStarsForDarai((d) => d / 10);
    const darai = {
      ...gold,
      priceResource: "token",
      priceToken: "Darai",
      priceAmount: 100,
    } as MarketItemView;
    const [c] = cartCost([{ it: darai, qty: 1 }]);
    expect(isShort(c, src({ "token:Darai": 0, "token:STARS": 10 }))).toBe(false);
    expect(isShort(c, src({ "token:Darai": 0, "token:STARS": 9 }))).toBe(true);
  });
});
