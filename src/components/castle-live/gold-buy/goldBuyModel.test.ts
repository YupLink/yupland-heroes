// Окно «Купить золото»: карточки из ответа витрины и причина, по которой
// подтвердить нельзя (ожидание, вход, нет курса, нехватка, баланс неизвестен).
import { describe, expect, it } from "vitest";
import { goldPrices, type GoldShop } from "@/lib/goldShop";
import { blockHint, confirmBlock, goldCards, priceText } from "./goldBuyModel";

const RATE = 1_611_172.5146858376;
const shop = (over: Partial<GoldShop> = {}): GoldShop => ({
  offers: [
    { id: "gold_5k", gold: 5_000, priceUsd: 15, discountPct: 70, prices: goldPrices(15, RATE) },
    { id: "gold_100", gold: 100, priceUsd: 1, discountPct: 0, prices: goldPrices(1, RATE) },
  ],
  methods: { STARS: null, USDT: null, Darai: null },
  starOnly: false,
  ...over,
});

describe("карточки золота", () => {
  it("по возрастанию, звёзды первыми, потом USDT и DarAi", () => {
    const cards = goldCards(shop());
    expect(cards.map((c) => c.offer.gold)).toEqual([100, 5_000]);
    expect(cards[1].opts.map((o) => [o.token, o.price])).toEqual([
      ["STARS", 1_270],
      ["USDT", 15],
      ["Darai", 21_750_829],
    ]);
  });

  it("без курса DarAi на карточке нет", () => {
    const s = shop();
    s.offers = s.offers.map((o) => ({ ...o, prices: goldPrices(o.priceUsd, null) }));
    expect(goldCards(s)[0].opts.map((o) => o.token)).toEqual(["STARS", "USDT"]);
  });

  it("«только Google» (§8.127, 13.11) — все пакеты: картой в $ или за DarAi, без USDT и звёзд", () => {
    const cards = goldCards(shop(), false, true);
    expect(cards.map((c) => [c.offer.gold, c.offer.priceUsd, c.opts.map((o) => o.token)])).toEqual([
      [100, 1, ["Darai"]],
      [5_000, 15, ["Darai"]],
    ]);
    // Нет курса DarAi — пакет остаётся (его берут картой).
    const s = shop();
    s.offers = s.offers.map((o) => ({ ...o, prices: goldPrices(o.priceUsd, null) }));
    expect(goldCards(s, false, true).map((c) => c.opts.length)).toEqual([0, 0]);
  });

  it("недоступность способа приходит с сервера", () => {
    const cards = goldCards(shop({ methods: { STARS: "login", USDT: "login", Darai: "login" } }));
    expect(cards[0].opts.every((o) => o.block === "login")).toBe(true);
  });

  it("без настоящего Telegram (§8.127) — способа Stars нет, пакет только за Stars выпадает", () => {
    const s = shop();
    s.offers = [...s.offers, { id: "gold_s", gold: 50, priceUsd: 0.5, discountPct: 0, prices: { STARS: 40, USDT: null, Darai: null } }];
    const cards = goldCards(s, false);
    expect(cards.map((c) => c.offer.gold)).toEqual([100, 5_000]);
    expect(cards.flatMap((c) => c.opts.map((o) => o.token))).not.toContain("STARS");
    expect(goldCards(s).map((c) => c.offer.gold)).toEqual([50, 100, 5_000]);
  });

  it("пустая витрина — пустой каталог", () => {
    expect(goldCards(undefined)).toEqual([]);
    expect(goldCards(shop({ offers: [] }))).toEqual([]);
  });
});

describe("почему нельзя подтвердить", () => {
  const stars = { key: "k", token: "STARS" as const, price: 424, block: null };
  const usdt = { key: "u", token: "USDT" as const, price: 5, block: null };

  it("ожидание оплаты — сильнее всего: второе нажатие не пройдёт", () => {
    expect(confirmBlock(stars, 1_000, true)).toBe("pending");
  });
  it("хватает — можно; не хватает — нехватка; баланс неизвестен — ждём", () => {
    expect(confirmBlock(stars, 424, false)).toBeNull();
    expect(confirmBlock(stars, 423, false)).toBe("short");
    expect(confirmBlock(usdt, 4.99, false)).toBe("short");
    expect(confirmBlock(usdt, null, false)).toBe("unknown");
  });
  it("не вошёл — нужен вход или кошелёк", () => {
    expect(confirmBlock({ ...usdt, block: "login" }, 100, false)).toBe("login");
    expect(blockHint("login", "USDT", true, false)).toMatch(/Войди через Telegram или подключи кошелёк/);
  });
  it("звездочнику без токенов — подключить кошелёк в Казне или Stars", () => {
    expect(blockHint("short", "Darai", true, true)).toMatch(/подключённым кошельком/);
    expect(blockHint("short", "Darai", false, false)).toMatch(/Top up your Treasury/);
    expect(blockHint("short", "STARS", true, true)).toBeNull();
  });
  it("без Telegram — ни Stars, ни Telegram; «только Google» — просто «не хватает»", () => {
    const wallet = { stars: false, googleOnly: false };
    const google = { stars: false, googleOnly: true };
    for (const ru of [true, false]) {
      for (const rules of [wallet, google]) {
        for (const b of ["login", "no_rate", "short", "account"] as const) {
          for (const starOnly of [true, false]) expect(blockHint(b, "USDT", ru, starOnly, rules) ?? "").not.toMatch(/Stars|Telegram/);
        }
      }
    }
    expect(blockHint("short", "Darai", true, true, google)).toBe("Не хватает на счёте.");
    expect(blockHint("short", "USDT", false, false, google)).toBe("Not enough on your balance.");
    expect(blockHint("login", "USDT", true, false, google)).toBeNull();
    expect(blockHint("short", "Darai", true, true, wallet)).toMatch(/подключи его в Казне\.$/);
  });
  it("цена целиком в подписи", () => {
    expect(priceText({ token: "Darai", price: 7_250_277 }, false)).toBe("7,250,277 DarAi");
    expect(priceText({ token: "STARS", price: 424 }, false)).toBe("424 ★");
  });
});
