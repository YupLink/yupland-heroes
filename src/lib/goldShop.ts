// Покупка золота (владелец, 22.10.2026, ПРАВИЛА §8.66) — чистые правила, общие
// для сервера и окна: пакеты, цены во всех валютах, скидка, картинка, сокращение.
//
// Якорь цены — $ (§8.41 «если $ — от $»): USDT = $, DARAI = $ × 0,9 × курс,
// звёзды = $ × 1,1 ÷ 0,013 — те же формулы, что у подписки и тарифов в $
// (lib/energySub.ts::priceIn). Серверных импортов здесь нет.
import { priceIn } from "@/lib/energySub";
import { USD_TOKENS, type UsdToken } from "@/lib/usdTariff";

/** Чем платят за золото — валюты счёта Казны (acc_ledger). */
export const GOLD_TOKENS = USD_TOKENS;
export type GoldToken = UsdToken;

/** Цена пакета в каждой валюте; Darai = null — курса нет (Ref недоступен). */
export type GoldPrices = Record<GoldToken, number | null>;

/** Пакет на витрине: золото, цена в $, метка скидки и цены по курсу. */
export type GoldOffer = {
  id: string;
  gold: number;
  priceUsd: number;
  /** Скидка к базе «100 золота за $1» — метка владельца (−50 % … −90 %). */
  discountPct: number;
  prices: GoldPrices;
};

/** Почему способ оплаты сейчас недоступен игроку; null — доступен. */
export type GoldBlock = "login" | "account" | "no_rate" | null;

/** Ответ витрины: пакеты, доступность способов и вид игрока. */
export type GoldShop = {
  offers: GoldOffer[];
  methods: Record<GoldToken, GoldBlock>;
  /** Вход только через Telegram (tg<id>) — звёзды первыми, токены не заводит. */
  starOnly: boolean;
};

/** Итог покупки — сколько золота зачислено на самом деле (из ответа базы). */
export type GoldBuyResult = {
  ok: true;
  gold: number;
  token: GoldToken;
  spent: number;
  /** false — повтор того же нажатия: покупка уже была, второй раз не проведена. */
  applied: boolean;
};

/**
 * Пакеты владельца (22.10.2026): «1 $ = 100 золото; 5 $ = 1000 (скидка 50 %);
 * 15 $ = 5000 (70 %); 45 $ = 20000 (78 %); 150 $ = 150 000 (90 %)». Тем же
 * списком их заводит миграция gold-shop-01 (проверяет goldShop.test.ts).
 */
export const GOLD_SHOP_DEFAULTS = [
  { id: "gold_100", gold: 100, priceUsd: 1, discountPct: 0 },
  { id: "gold_1k", gold: 1_000, priceUsd: 5, discountPct: 50 },
  { id: "gold_5k", gold: 5_000, priceUsd: 15, discountPct: 70 },
  { id: "gold_20k", gold: 20_000, priceUsd: 45, discountPct: 78 },
  { id: "gold_150k", gold: 150_000, priceUsd: 150, discountPct: 90 },
] as const;

/** База скидки: первый пакет — 100 золота за $1. */
export const GOLD_PER_USD = 100;

/** Скидка пакета к базе, целым процентом: 20 000 за $45 при базе $200 → 78. */
export function goldDiscount(gold: number, usd: number): number {
  if (!(gold > 0) || !(usd > 0)) return 0;
  // В центах: дробь 45/200 в двоичном виде дала бы 77,4999… вместо 77,5.
  const pct = 100 - (usd * 100 * GOLD_PER_USD) / gold;
  return pct > 0 ? Math.round(pct) : 0;
}

/** Цены пакета по курсу — как у тарифа подписки (priceIn). */
export function goldPrices(usd: number, daraiPerUsd: number | null): GoldPrices {
  const out = {} as GoldPrices;
  for (const t of GOLD_TOKENS) out[t] = priceIn(usd, t, daraiPerUsd);
  return out;
}

/** Порядок способов на карточке: звёзды первыми (владелец, 07.10.2026), потом USDT, DARAI. */
export const GOLD_TOKEN_ORDER: readonly GoldToken[] = ["STARS", "USDT", "Darai"];

/**
 * Картинка пакета (Ангелина, 20.10.2026): до 500 — один мешочек, 1 000–2 000 —
 * два, до 7 000 — сундук, от 10 000 — переполненный сундук. Промежутки — к
 * ближайшему меньшему виду.
 */
export type GoldArt = "bag-one" | "bag-two" | "chest" | "chest-overflow";
export function goldArt(gold: number): GoldArt {
  if (gold >= 10_000) return "chest-overflow";
  if (gold >= 2_100) return "chest";
  if (gold >= 1_000) return "bag-two";
  return "bag-one";
}
export const goldArtSrc = (gold: number) => `/design-assets/purchase/gold/${goldArt(gold)}.webp`;

/**
 * Золото в шапке — всегда коротко (Ангелина: «устойчивое K/M»): 999, 1.2K,
 * 12K, 125K, 1M, 1.5M. Вниз — показанное не больше настоящего.
 */
export function compactGold(value: number): string {
  const v = Math.floor(Math.max(0, Number(value) || 0) + 1e-9);
  if (v < 1_000) return String(v);
  const unit = v >= 1_000_000 ? "M" : "K";
  const scaled = v / (unit === "M" ? 1_000_000 : 1_000);
  return `${scaled < 10 ? Math.floor(scaled * 10) / 10 : Math.floor(scaled)}${unit}`;
}

/** Сколько не хватает (с точностью до цента для USDT); 0 — хватает. */
export function goldShortfall(price: number, balance: number | null): number {
  if (balance == null) return 0;
  return Math.max(0, Math.ceil((price - balance) * 100 - 1e-6) / 100);
}
