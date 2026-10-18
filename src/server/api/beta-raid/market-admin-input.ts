// Форма товара маркета: схема ввода и отказы админу.
//
// ПОЧЕМУ отдельный модуль. Позиция, которую физически нельзя исполнить,
// узнаётся об этом только в момент покупки — когда деньги у игрока уже сняты, а
// выдача падает. Дешевле сказать «нет» админу при сохранении. Схема и эти
// отказы уехали из market-admin.ts заодно с лимитом ≤250 строк: там осталась
// сама запись и уведомление клетки.
import { z } from "zod";
import { isArtAny } from "./art-rarity";
import { isUsdt, USDT_BANNED_MSG } from "@/lib/usdtBanned";

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
  kind: z.enum(["resource", "pack", "hero", "art", "boss", "custom"]),
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
});

export type UpsertInput = z.infer<typeof upsertMarketInput>;

/**
 * Отказы ДО записи. Оба случая — про позицию, которая ломается уже после
 * списания денег, поэтому и ловим их у админа, а не у игрока.
 */
export function assertUpsertSane(data: UpsertInput): void {
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
