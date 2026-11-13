// Форма товара маркета: схема ввода и отказы админу.
//
// ПОЧЕМУ отдельный модуль. Позиция, которую физически нельзя исполнить,
// узнаётся об этом только в момент покупки — когда деньги у игрока уже сняты, а
// выдача падает. Дешевле сказать «нет» админу при сохранении. Схема и эти
// отказы уехали из market-admin.ts заодно с лимитом ≤250 строк: там осталась
// сама запись и уведомление клетки.
import { z } from "zod";
import { isArtAny } from "./art-rarity";
import { isHeroAny } from "./hero-any";
import { isUsdt, USDT_BANNED_MSG } from "@/lib/usdtBanned";
import { parseRecipe, recipeHasPrize } from "@/lib/marketRecipe";
import { PRICE_MORE_MAX, needsPriceToken } from "@/lib/marketPrices";

/** Чем платят/чем платит магазин — совпадает с MarketPriceResource. */
const PRICE_RESOURCES = [
  "token",
  "energy",
  "likes",
  "tickets",
  "gold",
  "stone",
  "wood",
  "diamonds",
  "pack",
  "hero",
  "art",
  "boss",
  "custom",
] as const;

export const upsertMarketInput = z.object({
  id: z.string().optional(),
  q: z.number().int(),
  r: z.number().int(),
  pos: z.number().int().default(0),
  side: z.enum(["buy", "sell"]).default("buy"),
  // tree — срубаемое дерево для посадки (lib/treePlant, проверка — tree/tree-admin).
  // rock — камень/гора для установки (то, что бьют киркой) — так же.
  // land — земля для мира строителей (lib/landPlace, проверка — land/land-admin).
  // vein — жила золота или алмазов (lib/veinPlace, проверка — vein/vein-admin).
  kind: z.enum([
    "resource",
    "pack",
    "hero",
    "art",
    "boss",
    "custom",
    "tree",
    "rock",
    "land",
    "vein",
    // recipe — рецепт: исходы с шансами (lib/marketRecipe), только покупкой.
    "recipe",
    // building — постройка под установку (lib/buildingSale), только покупкой.
    "building",
  ]),
  refId: z.string().nullable().default(null),
  giveAmount: z.number().nonnegative().default(1),
  giveToken: z.string().max(24).nullable().default(null),
  name: z.string().max(120).default(""),
  image: z.string().nullable().default(null),
  priceResource: z.enum(PRICE_RESOURCES),
  priceToken: z.string().nullable().default(null),
  priceAmount: z.number().nonnegative(),
  // Вторая цена (алхимия): необязательна. null-ресурс = второй цены нет.
  price2Resource: z.enum(PRICE_RESOURCES).nullable().default(null),
  price2Token: z.string().nullable().default(null),
  price2Amount: z.number().nonnegative().nullable().default(null),
  // Запас: null — безлимит. sold сервер-управляемое, в input не входит.
  stock: z.number().int().nonnegative().nullable().default(null),
  // Лимит на игрока (аккаунт) в день: null — без лимита. Только у витрины покупки.
  perAccountLimit: z.number().int().positive().nullable().default(null),
  buyerMode: z.enum(["all", "filter"]).default("all"),
  buyerRaces: z.array(z.string()).default([]),
  buyerSpecs: z.array(z.string()).default([]),
  // Ещё ингредиенты цены сверх первой и второй (до трёх; lib/marketPrices).
  priceMore: z
    .array(
      z.object({
        resource: z.enum(PRICE_RESOURCES),
        token: z.string().max(80).nullable().default(null),
        amount: z.number().positive(),
      }),
    )
    .max(PRICE_MORE_MAX)
    .default([]),
  // Исходы рецепта — разбирает и сводит к 100 % parseRecipe (мусор отсеется).
  outcomes: z.array(z.unknown()).max(40).nullable().default(null),
  // Постройка: шаблон постройки (presetId) либо, у товаров первого шага, облик и
  // настройка (как building_config клетки) — у вида building.
  building: z
    .object({
      skinId: z.string().max(80).nullable().default(null),
      config: z.record(z.string(), z.unknown()).nullable().default(null),
      presetId: z.string().max(64).nullable().default(null),
    })
    .nullable()
    .default(null),
});

export type UpsertInput = z.infer<typeof upsertMarketInput>;

/**
 * Отказы ДО записи. Оба случая — про позицию, которая ломается уже после
 * списания денег, поэтому и ловим их у админа, а не у игрока.
 */
export function assertUpsertSane(data: UpsertInput): void {
  assertRecipeSane(data);
  assertPriceMoreSane(data);
  // «Любой артефакт редкости X» ВТОРОЙ ценой покупки: выбор игрока (pick)
  // доезжает только до одной цены из двух, и вторая уходит на авто-подбор —
  // сервер молча забирает самый старый свободный артефакт, тот самый, что
  // игрок берёг. Первой ценой такой шаблон законен: там выбор доезжает.
  //
  // На витрине скупки то же самое безопасно: там цена — ВЫПЛАТА, магазин
  // артефакт отдаёт (pickArtTemplateByRarity), а не забирает у игрока.
  if (data.side === "buy" && data.price2Resource === "art" && isArtAny(data.price2Token)) {
    throw new Error(
      "«Любой артефакт редкости» ставится только ПЕРВОЙ ценой: во второй игрок не выбирает, чем платит, и сервер заберёт самый старый артефакт",
    );
  }
  // «Любой герой редкости» (ломбард) — только товаром СКУПКИ и по одному герою
  // за сделку: игрок выбирает, какую копию сдаёт, а ВЫДАТЬ «любого героя»
  // магазину нечем (ни товаром покупки, ни ценой/выплатой).
  if (isHeroAny(data.refId) && (data.side !== "sell" || data.kind !== "hero")) {
    throw new Error("«Любой герой редкости» ставится только в скупку: игрок сдаёт героя");
  }
  if (isHeroAny(data.refId) && data.giveAmount !== 1) {
    throw new Error("«Любой герой редкости» принимается по одному: количество — 1");
  }
  if (isHeroAny(data.priceToken) || isHeroAny(data.price2Token)) {
    throw new Error("«Любой герой редкости» не бывает ценой или выплатой — только товаром скупки");
  }
  // Дробное количество законно только у ресурса — золото делится, пак и герой
  // нет. У остальных видов дробь превращает позицию в вечное «Неверное
  // количество» на выдаче (market-deliver.wholeCount), причём уже после денег.
  // Форма админа поле количества при смене вида не сбрасывает, так что 0,5 от
  // прошлого ресурс-товара переезжает на новый вид незаметно.
  if (data.kind !== "resource" && !Number.isInteger(data.giveAmount)) {
    throw new Error(
      "Дробное количество бывает только у ресурса — у пака, героя, артефакта, босса и своего товара ставь целое",
    );
  }
  // USDT — живые деньги (ПРАВИЛА §8.49а): витрина выдаёт без сверки со свободным,
  // поэтому не выдаёт его вовсе — ни товаром покупки, ни выплатой скупки.
  // Платить USDT игрок может: деньги приходят, а не уходят.
  const out =
    data.side === "buy"
      ? [data.kind === "resource" && data.refId === "token" ? data.giveToken : null]
      : [
          data.priceResource === "token" ? data.priceToken : null,
          data.price2Resource === "token" ? data.price2Token : null,
        ];
  if (out.some(isUsdt)) throw new Error(USDT_BANNED_MSG);
}

/**
 * «Любой герой редкости» не ставится в лавку, привязанную к ратуше: там продажа
 * идёт по кривой города (town-shop-sell), и выбор копии героя (pick.heroItemId)
 * до неё не доезжает — игрок получал бы только отказ «Выбери героя». Узко: при
 * сохранении позиции; привязку уже наполненной лавки к ратуше это не держит.
 */
export async function assertHeroAnyPlace(data: UpsertInput, mapId: string): Promise<void> {
  if (!isHeroAny(data.refId)) return;
  const { shopTown } = await import("./town-binding");
  if (await shopTown(mapId, data.q, data.r)) {
    throw new Error("«Любой герой редкости» не ставится в лавку при ратуше: там герой не сдаётся");
  }
}

/** Рецепт: только витрина покупки и хоть один настоящий приз (не одно «Ничего»). */
function assertRecipeSane(data: UpsertInput): void {
  if (data.kind !== "recipe") return;
  if (data.side !== "buy") throw new Error("Рецепт ставится только в покупку");
  if (!recipeHasPrize(parseRecipe(data.outcomes))) {
    throw new Error("В рецепте нужен хоть один приз, кроме «Ничего»");
  }
}

/**
 * Ещё ингредиенты: только у покупки, у каждого — выбранный шаблон/токен. «Любой
 * артефакт / герой редкости» сюда не ставится: выбор игрока доезжает только до
 * первой цены, а здесь сервер забрал бы самый старый артефакт сам.
 */
function assertPriceMoreSane(data: UpsertInput): void {
  if (data.priceMore.length === 0) return;
  if (data.side !== "buy") throw new Error("Доп. ингредиенты — только в покупке");
  for (const l of data.priceMore) {
    if (needsPriceToken(l.resource) && !l.token) throw new Error("Выбери, что именно платят");
    if (isArtAny(l.token) || isHeroAny(l.token)) {
      throw new Error("«Любой артефакт / герой редкости» — только первой ценой");
    }
  }
}
