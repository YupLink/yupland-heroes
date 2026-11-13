// Показ выпавшего из промокода: имя, картинка, «+250» или «×3», чип «куда».
// И мост к старым кодам на лайки: их ответ — та же карточка, их русские
// фразы-отказы — ключи словаря (английский игрок читает свой язык).
import { isPromoPiece, type PromoGot, type PromoWhere } from "@/lib/promo/promoTypes";
import { rewardKindImage, rewardKindLabelKey } from "@/lib/rewardKinds";

type T = (key: string, params?: Record<string, string | number>) => string;

/** Итог ввода для карточки: код и список выпавшего (пустой — «ничего не выпало»). */
export type PromoOutcome = { code: string; items: PromoGot[] };

const DARAI = "Darai";
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Имя строки: из пикера админа, иначе ресурс/токен/вид по словарю. */
export function promoItemName(it: PromoGot, t: T): string {
  if (it.name) return it.name;
  if (it.kind === "resource") {
    const key = rewardKindLabelKey("resource", it.ref);
    if (key) return cap(t(key));
  }
  if (it.kind === "token" && it.ref) return it.ref === DARAI ? "DARAI" : it.ref;
  return t(`gifts.kind.${it.kind}`);
}

/** Картинка строки; null — карточка рисует значок вида. */
export function promoItemImage(it: PromoGot): string | null {
  if (it.image) return it.image;
  if (it.kind === "likes") return "/resources/likes.webp";
  if (it.kind === "energy") return "/resources/energy.webp";
  if (it.kind === "token" && it.ref === DARAI) return "/resources/darai.webp";
  return rewardKindImage(it.kind, it.ref);
}

/** «+1 250» для меры, «×3» для штучного. */
export function promoAmountText(it: PromoGot, lang: string): string {
  const n = it.amount.toLocaleString(lang === "en" ? "en-US" : "ru-RU");
  return isPromoPiece(it.kind) ? `×${n}` : `+${n}`;
}

export const WHERE_KEY: Record<PromoWhere, string> = {
  balance: "promo.where_balance",
  backpack: "promo.where_backpack",
  inventory: "promo.where_inventory",
  harvest: "promo.where_harvest",
  pending: "promo.where_pending",
};

/**
 * Какой тост после ввода: ничего не выпало; что-то не доехало (сбой —
 * доделает повторный ввод того же кода); всё на месте.
 */
export function promoToastOf(o: PromoOutcome): "nothing" | "pending" | "got" {
  if (o.items.length === 0) return "nothing";
  return o.items.some((i) => i.where === "pending") ? "pending" : "got";
}

/** Ответ старой ручки (коды на лайки) → карточка нового вида. */
export function likesOutcome(r: { likesAdded: number; code: string }): PromoOutcome {
  const n = Math.max(0, Math.floor(Number(r.likesAdded) || 0));
  return {
    code: r.code,
    items:
      n > 0
        ? [{ kind: "likes", ref: null, name: null, image: null, amount: n, where: "balance" }]
        : [],
  };
}

/** Фразы старой ручки → ключи promo.err_*; незнакомое — как было. */
const LIKES_PHRASES: Array<[RegExp, string]> = [
  [/^промокод не найден/i, "promo.err_not_found"],
  [/^промокод отключён/i, "promo.err_inactive"],
  [/уже активирован/i, "promo.err_used"],
  [/исчерпан/i, "promo.err_exhausted"],
  [/привязка telegram/i, "promo.err_need_tg"],
  [/^кошел[её]к не подключ[её]н/i, "promo.err_no_wallet"],
];

export function likesError(e: unknown): Error {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  const hit = LIKES_PHRASES.find(([re]) => re.test(msg.trim()));
  return hit ? new Error(hit[1]) : e instanceof Error ? e : new Error(msg);
}

/** Ключ нажатия «Применить»: повтор запроса несёт его же. */
export function newOpId(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
