// Лопата для мешочка (владелец, 29.09.2026): «закопать или выкопать — только
// если есть лопата». Лопата — свой товар с галочкой is_shovel (видов может быть
// несколько) и тратит износ, как топор (ПРАВИЛА §8.19): «Износ за удар, %» у
// товара, пусто — ломается с первого раза. Удар, откат и закрытие ключа — те
// же, что у топора (decor-tool → tool-wear.ts), здесь только выбор лопаты и
// свои ключи отказа.
//
// Основной инструмент (§8.24): копает только лопата в руках героя. Основного
// нет, а лопата одна — она и копает (и становится основной); кончилась лопата
// в руках — её заменяет другая лопата героя; в руках топор или лопат несколько
// без выбора — отказ «возьми в руки».
import { mcpExec } from "@/server/db/mcpClient";
import {
  NEED_TOOL,
  TOOL_BUSY,
  hitTool,
  type ToolCharge,
} from "@/server/api/beta-raid/decor-tool";
import { shovelSql } from "@/server/api/beta-raid/loot-bag/bag-read-sql";
import { notMainError, pickMainTool } from "@/server/api/beta-raid/main-tool/main-tool";
import { wearStep } from "@/lib/raid/toolWear";

/** Отказ «нет лопаты» — ключом словаря. */
export const NEED_SHOVEL = "bag.need_shovel";
/** Этой лопатой ещё копают (второе окно, двойной запрос). */
export const SHOVEL_BUSY = "bag.shovel_busy";

export type Shovel = { itemId: string; name: string; wear: number | null };

/** Лопата героя (стопка с целой штукой) или null — окну мешочка: «есть ли вообще». */
export async function findShovel(heroId: string): Promise<Shovel | null> {
  const rows = (await mcpExec(shovelSql(heroId), { wrapJson: true })) as Array<{
    itemId: string;
    name: string;
    toolWear: number | string | null;
  }>;
  const row = rows?.[0];
  if (!row) return null;
  const wear = row.toolWear == null ? null : Number(row.toolWear);
  return { itemId: row.itemId, name: row.name, wear: Number.isFinite(wear) ? wear : null };
}

/**
 * Снять износ лопаты в руках за одно нажатие. Ключ удара — от ключа нажатия:
 * повтор моста и того же нажатия второй раз не снимет. Нет целой штуки —
 * NEED_SHOVEL, лопатой ещё копают — SHOVEL_BUSY, в руках не лопата — «возьми».
 */
export async function chargeShovel(
  _wallet: string,
  heroId: string,
  op: string,
): Promise<ToolCharge> {
  const { pick, stack } = await pickMainTool(heroId, { kind: "shovel" });
  if (!pick.ok) throw pick.why === "idle" ? notMainError(stack?.name ?? "") : new Error(NEED_SHOVEL);
  const name = stack?.name ?? "";
  try {
    return await hitTool(
      { heroId, stackKey: pick.key, op: `wear:bag:${op}` },
      { step: wearStep(stack?.toolWear), need: "shovel", name },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg === TOOL_BUSY) throw new Error(SHOVEL_BUSY);
    if (msg === NEED_TOOL) throw new Error(NEED_SHOVEL);
    throw e;
  }
}
