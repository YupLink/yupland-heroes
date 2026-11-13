// Рецепт лавки (владелец, 04.11.2026; ПРАВИЛА §8.104): игрок платит ценой
// позиции (одной или двумя — «алхимия»), а получает ОДИН исход из списка по
// шансам: «90 % алмазное яблоко», «50 % яблоко / 29 % пепел / 10 % ничего».
//
// Доли — как у рыбалки и находок лопатой (fishChances): сумма всегда ровно
// 100 %, поднял одному — остальные ужались пропорционально; «Ничего» — своей
// строкой. Бросок — на сервере, на каждую купленную штуку отдельно.
import { normalizeFish, pickFish, setFishPct, type FishItem } from "@/lib/raid/fishChances";
import { marketResourceIconSrc } from "@/lib/resourceIcons";

/** Что может выпасть: «ничего», ресурс на счёт, товар/босс в рюкзак, арт/герой/пак. */
export type RecipeKind = "none" | "resource" | "custom" | "boss" | "art" | "hero" | "pack";

export const RECIPE_KINDS: RecipeKind[] = [
  "none",
  "resource",
  "custom",
  "boss",
  "art",
  "hero",
  "pack",
];

/** Ресурсы счёта, которые рецепт выдаёт. Токенов нет: USDT не выдаём (§8.49а);
 *  билетов нет: в лавках их заменило золото (§8.61). */
export const RECIPE_RESOURCES = ["gold", "stone", "wood", "diamonds", "likes", "energy"] as const;

/** Строк в рецепте — не больше. */
export const RECIPE_MAX = 20;

export type RecipeOutcome = {
  /** Ключ строки — уникален в рецепте (одно и то же можно класть разным числом). */
  id: string;
  kind: RecipeKind;
  /** Ресурс или шаблон; null у «Ничего». */
  refId: string | null;
  /** Сколько выдать за один бросок. */
  amount: number;
  name: string;
  image: string | null;
  /** Шанс, % (десятые). */
  pct: number;
};

/** Что выпало игроку — ответ покупки, окно «Выпало» на клиенте. */
export type RecipePrize = {
  kind: RecipeKind;
  refId: string | null;
  name: string;
  image: string | null;
  /** Сколько всего легло (количество строки × сколько раз выпала). */
  count: number;
};

const ID_RE = /^o_[A-Za-z0-9]{1,16}$/;
const REF_RE = /^[A-Za-z0-9_-]{1,64}$/;
/** Потолок количества за бросок: защита от опечатки «1000000 алмазов». */
export const RECIPE_AMOUNT_MAX = 1_000_000;

const isKind = (v: unknown): v is RecipeKind => RECIPE_KINDS.includes(v as RecipeKind);
const isRes = (v: unknown): boolean => (RECIPE_RESOURCES as readonly unknown[]).includes(v);

/** Новый ключ строки. */
export const newOutcomeId = (): string => `o_${Math.random().toString(36).slice(2, 10)}`;

/** Одна строка из чего угодно; негодная — null. */
function parseOne(x: unknown): RecipeOutcome | null {
  const o = x && typeof x === "object" ? (x as Record<string, unknown>) : null;
  if (!o || !isKind(o.kind)) return null;
  const id = String(o.id ?? "");
  if (!ID_RE.test(id)) return null;
  const kind = o.kind;
  const refId = kind === "none" ? null : String(o.refId ?? "");
  if (kind === "resource" ? !isRes(refId) : kind !== "none" && !REF_RE.test(refId ?? "")) {
    return null;
  }
  const raw = Number(o.amount);
  // Ресурс бывает дробным (0,5 энергии), предметы — целыми штуками.
  const amount = kind === "none" ? 1 : kind === "resource" ? raw : Math.floor(raw);
  if (!Number.isFinite(amount) || amount <= 0 || amount > RECIPE_AMOUNT_MAX) return null;
  const image = typeof o.image === "string" && o.image.trim() ? o.image.slice(0, 500) : null;
  return {
    id,
    kind,
    refId,
    amount,
    name: String(o.name ?? "").slice(0, 120),
    image: kind === "none" ? null : image,
    pct: Number(o.pct) || 0,
  };
}

/** Рецепт из колонки/ввода: годные строки без повторов, доли — ровно 100 %. */
export function parseRecipe(raw: unknown): RecipeOutcome[] {
  let v: unknown = raw;
  if (typeof raw === "string") {
    try {
      v = JSON.parse(raw);
    } catch {
      v = null;
    }
  }
  const seen = new Set<string>();
  const out: RecipeOutcome[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const one = parseOne(x);
    if (!one || seen.has(one.id)) continue;
    seen.add(one.id);
    out.push(one);
    if (out.length >= RECIPE_MAX) break;
  }
  return withShares(out, normalizeFish(out));
}

/** Доли из пересчёта — обратно в строки рецепта (по ключу). */
function withShares(list: readonly RecipeOutcome[], shares: readonly FishItem[]): RecipeOutcome[] {
  const pct = new Map(shares.map((s) => [s.id, s.pct]));
  return list.filter((o) => pct.has(o.id)).map((o) => ({ ...o, pct: pct.get(o.id) ?? 0 }));
}

/** Поставить строке шанс; остальные делят остаток пропорционально. */
export const setRecipePct = (list: readonly RecipeOutcome[], id: string, pct: number) =>
  withShares(list, setFishPct(list, id, pct));

/** Добавить строку: ей равная доля, остальные ужимаются. */
export function addRecipeOutcome(
  list: readonly RecipeOutcome[],
  o: Omit<RecipeOutcome, "id" | "pct">,
): RecipeOutcome[] {
  if (list.length >= RECIPE_MAX) return [...list];
  const id = newOutcomeId();
  const next = [...list, { ...o, id, pct: 0 }];
  return next.length === 1 ? [{ ...next[0], pct: 100 }] : setRecipePct(next, id, 100 / next.length);
}

/** Убрать строку: её доля расходится остальным. */
export const removeRecipeOutcome = (list: readonly RecipeOutcome[], id: string) => {
  const rest = list.filter((o) => o.id !== id);
  return withShares(rest, normalizeFish(rest));
};

/** Поправить количество строки (доли не трогаем). */
export const setRecipeAmount = (list: readonly RecipeOutcome[], id: string, amount: number) =>
  list.map((o) => (o.id === id ? { ...o, amount } : o));

/** Что выпало при броске 0…999 (промилле), как у рыбалки. */
export function pickRecipe(list: readonly RecipeOutcome[], roll: number): RecipeOutcome | null {
  const id = pickFish(list, roll);
  return list.find((o) => o.id === id) ?? null;
}

/** В рецепте есть хоть один настоящий приз — иначе продавать нечего. */
export const recipeHasPrize = (list: readonly RecipeOutcome[]): boolean =>
  list.some((o) => o.kind !== "none");

/**
 * Картинка рецепта, когда своей админ не загрузил (владелец, 04.11.2026: «а чего
 * картинки не подтягивает?»): картинка самого вероятного приза; «Ничего» не в счёт,
 * при равных шансах — верхний в списке. Своя загрузка главнее.
 */
export function recipeCover(list: readonly RecipeOutcome[] | null | undefined): string | null {
  let best: { pct: number; image: string } | null = null;
  for (const o of list ?? []) {
    if (o.kind === "none") continue;
    const image = o.image ?? (o.kind === "resource" ? marketResourceIconSrc(o.refId) : null);
    if (image && (!best || o.pct > best.pct)) best = { pct: o.pct, image };
  }
  return best?.image ?? null;
}
