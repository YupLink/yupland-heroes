// Призы турнира: какие виды бывают, что у каждого обязано быть заполнено, и
// строка «что дали» для подписи подарка.
//
// Приз — то, что умеет подарок (gifts-deliver): вид, сколько и на что ссылается.
import { goldForEarnedTickets } from "@/lib/ticketGold";
import type { TourPrize, TourPrizeKind } from "@/lib/tournament/types";
import { isUsdt } from "@/lib/usdtBanned";

/** Все виды приза — тот же список, что у подарка. */
export const TOUR_PRIZE_KINDS: readonly TourPrizeKind[] = [
  "token",
  "resource",
  "pack",
  "art",
  "item",
  "hero",
  "custom",
  "energy",
  "likes",
  "tickets",
];

/**
 * Артефакт по редкости (владелец: «1 место — лег, 2–3 — эпик, 4–10 — рар,
 * 11–20 — коммон»): приз art с refId 'rarity:<редкость>'; конкретный активный
 * артефакт этой редкости выбирается на финише (tour-art.ts).
 */
export const TOUR_ART_RARITIES = ["legendary", "epic", "rare", "common"] as const;
export const artRarityOf = (ref: string | null | undefined): string | null => {
  const m = /^rarity:(legendary|epic|rare|common)$/.exec(String(ref ?? ""));
  return m ? m[1] : null;
};

/** Ресурсы, которые умеет выдать подарок. */
export const TOUR_PRIZE_RESOURCES: readonly string[] = ["gold", "wood", "stone", "diamonds"];

/** Штучные виды: количество — целое. */
const COUNTABLE = new Set<TourPrizeKind>(["pack", "art", "item", "hero", "likes", "tickets"]);
/** Виды, которым нужна ссылка: символ токена, ресурс, id пака/шаблона. */
const NEEDS_REF = new Set<TourPrizeKind>([
  "token",
  "resource",
  "pack",
  "art",
  "item",
  "hero",
  "custom",
]);

/** Ошибка приза ключом перевода или null — приз годен. */
export function prizeError(p: TourPrize): string | null {
  if (!TOUR_PRIZE_KINDS.includes(p.kind)) return "tour.err.prize";
  const amount = Number(p.amount);
  if (!Number.isFinite(amount) || amount <= 0) return "tour.err.amount";
  if (COUNTABLE.has(p.kind) && !Number.isInteger(amount)) return "tour.err.amount";
  const ref = String(p.refId ?? "").trim();
  if (NEEDS_REF.has(p.kind) && !ref) return "tour.err.prize";
  // Призы турнира не сверяются со «Свободно USDT» — USDT не ставится (ПРАВИЛА §8.49а).
  if (p.kind === "token" && isUsdt(ref)) return "tour.err.usdt";
  if (p.kind === "resource" && !TOUR_PRIZE_RESOURCES.includes(ref)) return "tour.err.prize";
  if (p.kind === "custom" && !ref.startsWith("cst_")) return "tour.err.prize";
  return null;
}

const RES_RU: Record<string, string> = {
  gold: "золото",
  wood: "дерево",
  stone: "камень",
  diamonds: "алмазы",
};

const fmt = (n: number): string =>
  new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 2 }).format(n);

/** «1 000 Darai», «500 золото», «Пак „Лес“ ×2» — одна награда строкой. */
export function prizeLine(p: TourPrize): string {
  const n = fmt(Number(p.amount) || 0);
  const ref = String(p.refId ?? "");
  switch (p.kind) {
    case "token":
      return `${n} ${ref}`;
    case "resource":
      return `${n} ${RES_RU[ref] ?? ref}`;
    case "energy":
      return `${n} энергии`;
    case "likes":
      return `${n} лайков`;
    case "tickets":
      return `${fmt(goldForEarnedTickets(Number(p.amount) || 0))} золота`;
    default:
      return `${p.title || ref} ×${n}`;
  }
}

/** Подпись подарка: все награды места через точку. */
export const prizesNote = (prizes: readonly TourPrize[]): string =>
  `Награды места: ${prizes.map(prizeLine).join(" · ")}`.slice(0, 500);
