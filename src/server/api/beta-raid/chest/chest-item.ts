// Предмет «Магический сундук»: узнать его среди товаров и пустить к покупке
// только Торговца.
//
// Правило владельца (27.09.2026): «только для специализации торговца возможна
// покупка или сама постройка», «поставить может любой из специализаций».
// Поэтому проверка стоит на ПОЛУЧЕНИИ предмета сделкой (маркет, скупка-
// переработка, ратуша), а установка на карту её не делает.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { canonRef, refFromStackKey } from "@/server/api/beta-raid/item-alias";
import { selectedHero } from "@/server/api/beta-raid/hero-current";

/** Специализация, которой можно купить сундук (ru — как в шаблоне героя). */
export const CHEST_BUYER_SPEC = "Торговец";

/**
 * Сундук ли этот id справочника своих товаров (cst_…). Ошибку базы НЕ глотаем:
 * «не узнали» — не «не сундук», иначе проверка «только Торговец» открывалась
 * бы на любом сбое моста, и сундук уходил бы Воину.
 */
export async function isMagicChestRef(ref: string | null | undefined): Promise<boolean> {
  const id = (await canonRef("custom", ref ?? null)) ?? "";
  if (!id.startsWith("cst_")) return false;
  const rows = (await mcpExec(
    `SELECT magic_chest AS chest FROM yuplink.raid_custom_item WHERE id = ${sqlStr(id)} LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ chest: boolean | null }>;
  return rows?.[0]?.chest === true;
}

/** Сундук ли стек рюкзака/сети (ключ custom:cst_…). */
export async function isMagicChestStack(stackKey: string): Promise<boolean> {
  if (!stackKey.startsWith("custom:")) return false;
  return isMagicChestRef(refFromStackKey(stackKey));
}

/** Торговец ли спека героя. Строго: «универсальный» и герой без спеки — нет. */
export const isChestBuyerSpec = (spec: string | null | undefined): boolean => {
  const s = String(spec ?? "")
    .trim()
    .toLowerCase();
  return s === CHEST_BUYER_SPEC.toLowerCase() || s === "merchant";
};

/**
 * Пустить к получению товара сделкой. Не сундук — молча пропускаем. Сундук —
 * только выбранный герой-Торговец, иначе бытовая ошибка chest.merchant_only.
 */
export async function assertChestBuyer(
  wallet: string,
  good: { kind: string; refId?: string | null },
): Promise<void> {
  if (good.kind !== "custom") return;
  if (!(await isMagicChestRef(good.refId ?? null))) return;
  const hero = await selectedHero(wallet).catch(() => null);
  if (!hero) throw new Error("market.need_hero");
  if (!isChestBuyerSpec(hero.spec)) throw new Error("chest.merchant_only");
}
