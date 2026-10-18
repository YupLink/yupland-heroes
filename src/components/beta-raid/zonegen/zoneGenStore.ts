// Рецепт зоны переживает перезагрузку: живёт в localStorage по карте.
//
// ЗАЧЕМ: подобрать доли местностей, извилистость и набор построек — это
// десяток движений ползунками. Любой F5 (а в вебвью Telegram страница
// перезагружается и сама) стирал всё до «одна местность, 100 %», и админ
// собирал рецепт заново. Ключ — на карту: у каждой карты свой ландшафт.
//
// Локалка тут ВСПОМОГАТЕЛЬНАЯ: нет её (приватное окно, запрет на куки) или
// лежит мусор — панель просто открывается с рецептом по умолчанию, поэтому
// каждое чтение и запись обёрнуты в try/catch, а прочитанное проверяется
// схемой, а не принимается на веру.
import { zoneRecipeSchema, type ZoneRecipe } from "@/lib/raid/zonegen/recipe";

/** Неделю рецепт ещё про ту же задачу; дальше он только сбивает с толку. */
export const RECIPE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Минимум от Storage, который нам нужен — чтобы тест подсунул свой. */
export type MiniStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};

/** Карта не приехала — общий ключ: лучше общий рецепт, чем никакого. */
export const recipeKey = (mapId: string | undefined): string =>
  `zonegen:recipe:${mapId || "current"}`;

/** Локалка браузера, если она вообще есть и доступна. */
export function browserStore(): MiniStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // Доступ к localStorage сам по себе бросает при запрете на данные сайта.
    return null;
  }
}

/**
 * Рецепт из локалки: null, если его нет, он протух или не сходится со схемой
 * (схема сама подставит значения по умолчанию для полей, которых в старой
 * записи не было, — например, извилистость и блок поселений).
 *
 * Если со схемой не сошёлся только блок поселений — отдаём рецепт без него.
 * 22.09.2026 состав поселения переехал с «вес + потолок» на «сколько штук»:
 * записи прошлой недели этой схеме не отвечают, и строгая проверка выносила бы
 * заодно местности, масштаб и сид — всё, что админ и подбирал ползунками.
 */
export function loadRecipe(
  mapId: string | undefined,
  now: number = Date.now(),
  store: MiniStorage | null = browserStore(),
): ZoneRecipe | null {
  if (!store) return null;
  try {
    const raw = store.getItem(recipeKey(mapId));
    if (!raw) return null;
    const box = JSON.parse(raw) as { at?: number; recipe?: unknown };
    if (!box || typeof box.at !== "number" || now - box.at > RECIPE_TTL_MS) return null;
    const parsed = zoneRecipeSchema.safeParse(box.recipe);
    if (parsed.success) return parsed.data;
    return withoutSettlement(box.recipe);
  } catch {
    return null;
  }
}

/** Тот же рецепт без устаревшего блока поселений: схема вернёт его по умолчанию. */
function withoutSettlement(recipe: unknown): ZoneRecipe | null {
  if (typeof recipe !== "object" || recipe === null || !("settlement" in recipe)) return null;
  const rest = { ...(recipe as Record<string, unknown>) };
  delete rest.settlement;
  const retry = zoneRecipeSchema.safeParse(rest);
  return retry.success ? retry.data : null;
}

/** Сохранить рецепт с меткой времени; не вышло — молча живём дальше. */
export function saveRecipe(
  mapId: string | undefined,
  recipe: ZoneRecipe,
  now: number = Date.now(),
  store: MiniStorage | null = browserStore(),
): void {
  if (!store) return;
  try {
    store.setItem(recipeKey(mapId), JSON.stringify({ at: now, recipe }));
  } catch {
    // Переполненная локалка не повод ронять панель генератора.
  }
}
