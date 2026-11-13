// Товары в цене Архитектора — сервер (ПРАВИЛА §8.59 п. 7). Платит выбранный
// герой из рюкзака — как плата товаром у портала и стройки (resource-pay).
// Списание и возврат — в SQL вместе с ресурсами, одной транзакцией под ключом
// операции (castle_architect_pay / _upgrade / _refund, migrations/minev2-40).
// Здесь — канон ключей, предпроверка до оплаты (отказ со списком «что и
// сколько») и строки для окна: картинка и сколько есть у героя.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { canonStackKey } from "@/server/api/beta-raid/item-alias";
import type { ArchitectCost } from "@/lib/castleArchitect";
import {
  goodId,
  goodsListText,
  goodsShort,
  type ArchitectGood,
  type ArchitectGoodView,
} from "@/lib/castleArchitectGoods";

/**
 * Ключи товаров цены — к канону (цена на «Помидоры» принимает «Помидор», как
 * canonItemKey у портала). Две строки сошлись в один канон — штуки складываются.
 */
export async function canonCost(cost: ArchitectCost): Promise<ArchitectCost> {
  if (!cost.goods?.length) return cost;
  const out = new Map<string, ArchitectGood>();
  for (const g of cost.goods) {
    const key = await canonStackKey("custom", goodId(g.key), g.name);
    const prev = out.get(key);
    out.set(key, { key, name: prev?.name ?? g.name, qty: (prev?.qty ?? 0) + g.qty });
  }
  return { ...cost, goods: [...out.values()] };
}

/** Сколько штук каждого ключа в рюкзаке героя. */
export async function goodsHave(heroId: string, keys: string[]): Promise<Record<string, number>> {
  if (!keys.length) return {};
  const rows = (await mcpExec(
    `SELECT stack_key, count FROM yuplink.raid_hero_backpack
      WHERE hero_id = ${sqlStr(heroId)} AND stack_key IN (${keys.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ stack_key: string; count: number | string }>;
  return Object.fromEntries((rows ?? []).map((r) => [r.stack_key, Number(r.count) || 0]));
}

/**
 * До оплаты: товаров не хватает — отказ со списком недостающего. Гонку (штуки
 * ушли между проверкой и оплатой) ловит сама оплата: architect_no_goods.
 */
export async function assertGoods(
  heroId: string,
  goods: ArchitectGood[] | undefined,
): Promise<void> {
  if (!goods?.length) return;
  const short = goodsShort(
    goods,
    await goodsHave(
      heroId,
      goods.map((g) => g.key),
    ),
  );
  if (short.length) throw new Error(`architect.no_goods:${goodsListText(short)}`);
}

/** Аргумент героя для оплаты — только при товарах в цене (без них SQL как раньше). */
export const heroArg = (cost: ArchitectCost, heroId: string | null | undefined) =>
  cost.goods?.length ? { p_hero: heroId ?? null } : {};

type Meta = { name: string; image: string | null };

/** Имя и картинка товаров справочника — живые: админ мог переименовать. */
async function goodsMeta(keys: string[]): Promise<Record<string, Meta>> {
  const ids = keys.map(goodId);
  const rows = (await mcpExec(
    `SELECT id, name, image FROM yuplink.raid_custom_item WHERE id IN (${ids.map(sqlStr).join(", ")});`,
    { wrapJson: true },
  )) as Array<{ id: string; name: string | null; image: string | null }>;
  return Object.fromEntries(
    (rows ?? []).map((r) => [
      `custom:${r.id}`,
      { name: String(r.name ?? r.id), image: r.image ? String(r.image) : null },
    ]),
  );
}

/**
 * Строки товаров для окна — у каждой цены свой список; запросы одни на все.
 * Героя нет — «есть» ноль у всех строк.
 */
export async function goodsViews(
  costs: Array<ArchitectCost | null>,
  heroId: string | null,
): Promise<ArchitectGoodView[][]> {
  const canon = await Promise.all(costs.map((c) => (c ? canonCost(c) : null)));
  const keys = [...new Set(canon.flatMap((c) => c?.goods?.map((g) => g.key) ?? []))];
  if (!keys.length) return costs.map(() => []);
  const [have, meta] = await Promise.all([
    heroId ? goodsHave(heroId, keys) : Promise.resolve<Record<string, number>>({}),
    goodsMeta(keys),
  ]);
  return canon.map((c) =>
    (c?.goods ?? []).map((g) => ({
      ...g,
      name: meta[g.key]?.name ?? g.name,
      image: meta[g.key]?.image ?? null,
      have: have[g.key] ?? 0,
    })),
  );
}
