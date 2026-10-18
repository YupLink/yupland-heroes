// Наборы (владелец, 04.10.2026: «По факту это и должен быть бокс»).
//
// Набор — бокс из конструктора боксов × N штук за цену в $. Платят со счёта
// USDT, DARAI или Stars — по правилам подписки (lib/energySub.ts): DARAI —
// плавающая цена по курсу, Stars — с наценкой. Тираж и лимит на аккаунт —
// необязательно. Купленные боксы приходят в «Подарки» и открываются как любые.
//
// Модуль общий для админки, витрины и сервера: серверных импортов здесь нет.
import { priceIn, SUB_TOKENS, type SubToken } from "@/lib/energySub";

/** Валюты оплаты — те же, что у подписки: символы токенов счёта (acc_ledger). */
export const KIT_TOKENS = SUB_TOKENS;
export type KitToken = SubToken;

export const isKitToken = (v: unknown): v is KitToken =>
  typeof v === "string" && (KIT_TOKENS as readonly string[]).includes(v);

/** Боксов в наборе — не больше, чем админ выдаёт подарком за раз (mystic.ts). */
export const KIT_MAX_BOXES = 500;
/** Цена в $ — не выше, чем у тарифа подписки (energy-sub/admin-tiers.ts). */
export const KIT_MAX_USD = 100_000;

/** Цена набора в каждой валюте; null — DARAI без курса. */
export type KitPrices = Record<KitToken, number | null>;

/** Поля набора, которые задаёт админ. */
export type KitFields = {
  boxId: string;
  boxCount: number;
  priceUsd: number;
  /** Тираж — сколько всего штук; null — без тиража. */
  stock: number | null;
  /** Сколько штук может купить один аккаунт; null — без лимита. */
  perAccount: number | null;
  active: boolean;
};

/** Бокс набора: имя и обложка — из конструктора боксов. */
export type KitBox = { boxName: string; boxImage: string | null };

/** Набор в админке: поля, бокс, продано (живые брони и покупки), цены сейчас. */
export type KitAdminRow = KitFields & KitBox & { id: string; sold: number; prices: KitPrices };

/** Набор на витрине игрока. */
export type KitOffer = Omit<KitFields, "active"> &
  KitBox & {
    id: string;
    prices: KitPrices;
    /** Сколько ещё осталось всем; null — без тиража. */
    left: number | null;
    /** Сколько штук уже купил я. */
    mine: number;
  };

/** Цены в валютах по курсу — как у тарифа подписки. */
export function kitPrices(priceUsd: number, daraiPerUsd: number | null): KitPrices {
  const out = {} as KitPrices;
  for (const tok of KIT_TOKENS) out[tok] = priceIn(priceUsd, tok, daraiPerUsd);
  return out;
}

export const kitLeft = (stock: number | null, sold: number): number | null =>
  stock == null ? null : Math.max(0, stock - sold);

/** Почему игроку нельзя купить: тираж кончился или лимит выбран; null — можно. */
export function kitBlock(
  o: Pick<KitOffer, "left" | "perAccount" | "mine">,
): "sold_out" | "limit" | null {
  if (o.left !== null && o.left <= 0) return "sold_out";
  if (o.perAccount !== null && o.mine >= o.perAccount) return "limit";
  return null;
}

const whole = (n: number) => Number.isInteger(n);
const cents = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;

/** Первая ошибка полей ключом kits.err_* или null — можно сохранять. */
export function kitError(f: KitFields): string | null {
  if (!f.boxId.trim()) return "kits.err_box";
  if (!(whole(f.boxCount) && f.boxCount >= 1 && f.boxCount <= KIT_MAX_BOXES)) {
    return "kits.err_count";
  }
  if (!Number.isFinite(f.priceUsd) || !(f.priceUsd > 0) || f.priceUsd > KIT_MAX_USD) {
    return "kits.err_price";
  }
  if (!cents(f.priceUsd)) return "kits.err_price";
  if (f.stock !== null && !(whole(f.stock) && f.stock >= 1)) return "kits.err_stock";
  if (f.perAccount !== null && !(whole(f.perAccount) && f.perAccount >= 1)) {
    return "kits.err_per_account";
  }
  return null;
}

/** «Dragon Pack ×3»; один бокс — просто имя. */
export const kitTitle = (k: KitBox & { boxCount: number }): string =>
  k.boxCount > 1 ? `${k.boxName} ×${k.boxCount}` : k.boxName;
