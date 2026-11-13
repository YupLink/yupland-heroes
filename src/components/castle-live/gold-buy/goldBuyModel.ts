// Окно «Купить золото» (§8.66, дизайн Ангелины): карточки и способы оплаты из
// ответа витрины. Цены не придумываем — только то, что отдал сервер; почему
// подтвердить нельзя — одной причиной, по ней окно выбирает кнопку и подсказку.
import {
  GOLD_TOKEN_ORDER,
  goldShortfall,
  type GoldBlock,
  type GoldOffer,
  type GoldShop,
  type GoldToken,
} from "@/lib/goldShop";

export type GoldOpt = { key: string; token: GoldToken; price: number; block: GoldBlock };
export type GoldCard = { offer: GoldOffer; opts: GoldOpt[] };

/** Кому что можно (§8.127): звёзды — только с Telegram; «только Google» не пополняет. */
export type PayRules = { stars: boolean; googleOnly: boolean };
const TG_RULES: PayRules = { stars: true, googleOnly: false };

/**
 * Пакеты по возрастанию золота; способ без цены (DARAI без курса) не показываем.
 * stars=false — аккаунт без настоящего Telegram: способа «Stars» нет вовсе.
 * googleOnly — «только Google» (§8.127, владелец 13.11.2026): картой в $ (кнопка карты) или
 * за DarAi со счёта; USDT и звёзд нет. Пакет без цены в DarAi остаётся — его берут картой.
 */
export function goldCards(shop: GoldShop | undefined | null, stars = true, googleOnly = false): GoldCard[] {
  if (!shop) return [];
  const tokens: readonly GoldToken[] = googleOnly
    ? ["Darai"]
    : stars ? GOLD_TOKEN_ORDER : GOLD_TOKEN_ORDER.filter((t) => t !== "STARS");
  return [...shop.offers]
    .sort((a, b) => a.gold - b.gold)
    .map((offer) => ({
      offer,
      opts: tokens.flatMap((token) => {
        const price = offer.prices[token];
        return price == null || !(price > 0)
          ? []
          : [{ key: `${offer.id}:${token}`, token, price, block: shop.methods[token] ?? null }];
      }),
    }))
    .filter((c) => googleOnly || c.opts.length > 0);
}

/** Почему сейчас нельзя платить; null — можно. */
export type ConfirmBlock = Exclude<GoldBlock, null> | "pending" | "unknown" | "short";

export function confirmBlock(opt: GoldOpt, balance: number | null, pending: boolean): ConfirmBlock | null {
  if (pending) return "pending";
  if (opt.block) return opt.block;
  if (balance == null) return "unknown";
  return goldShortfall(opt.price, balance) > 0 ? "short" : null;
}

const fmt = (n: number, ru: boolean) =>
  new Intl.NumberFormat(ru ? "ru-RU" : "en-US", { maximumFractionDigits: 2 }).format(n);
export const num = fmt;

/** «+1 000 золота» / «+1,000 gold». */
export const goldTitle = (gold: number, ru: boolean) => `+${fmt(gold, ru)} ${ru ? "золота" : "gold"}`;

/** Имя способа: в макете DARAI пишется «DarAi». */
export function tokenLabel(token: GoldToken, ru: boolean): string {
  if (token === "STARS") return ru ? "Stars из Казны" : "Stars from Treasury";
  return token === "Darai" ? "DarAi" : "USDT";
}

/** Единица цены: ★, USDT, DarAi. */
export const tokenUnit = (token: GoldToken) => (token === "STARS" ? "★" : token === "Darai" ? "DarAi" : "USDT");

/** Цена целиком: «424 ★», «5 USDT», «7 250 277 DarAi». */
export const priceText = (o: Pick<GoldOpt, "token" | "price">, ru: boolean) =>
  `${fmt(o.price, ru)} ${tokenUnit(o.token)}`;

/**
 * Подсказка, когда подтвердить нельзя (кроме ожидания и нехватки звёзд — у них своя кнопка).
 * Без Telegram (§8.127) — ни «выбери Stars», ни «войди через Telegram»; «только
 * Google» не зовём ни пополнять, ни подключать кошелёк — просто «не хватает».
 */
export function blockHint(
  b: ConfirmBlock | null,
  token: GoldToken,
  ru: boolean,
  starOnly: boolean,
  rules: PayRules = TG_RULES,
): string | null {
  if (b === "login") {
    if (rules.googleOnly) return null;
    if (!rules.stars) return ru ? "Подключи кошелёк — тогда можно купить золото." : "Connect a wallet to buy gold.";
    return ru
      ? "Войди через Telegram или подключи кошелёк — тогда можно купить золото."
      : "Sign in with Telegram or connect a wallet to buy gold.";
  }
  if (b === "account") return ru ? "Счёт Казны пока недоступен." : "Treasury balance is not available yet.";
  if (b === "no_rate") {
    if (!rules.stars) return ru ? "Цена в DarAi сейчас недоступна — выбери USDT." : "DarAi price is unavailable — choose USDT.";
    return ru ? "Цена в DarAi сейчас недоступна — выбери USDT или Stars." : "DarAi price is unavailable — choose USDT or Stars.";
  }
  if (b === "short" && token !== "STARS") {
    if (rules.googleOnly) return ru ? "Не хватает на счёте." : "Not enough on your balance.";
    if (starOnly && !rules.stars) {
      return ru
        ? "Пополнять DarAi и USDT можно с подключённым кошельком — подключи его в Казне."
        : "DarAi and USDT top-ups need a connected wallet — connect one in Treasury.";
    }
    if (starOnly) {
      return ru
        ? "Пополнять DarAi и USDT можно с подключённым кошельком — подключи его в Казне или выбери Stars."
        : "DarAi and USDT top-ups need a connected wallet — connect one in Treasury or choose Stars.";
    }
    return ru ? "Пополни счёт в Казне и вернись к покупке." : "Top up your Treasury balance and come back.";
  }
  return null;
}
