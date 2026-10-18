// Запас товара маркета: атомарный резерв под покупку и возврат при сбое.
//
// Модель «остаток = stock - sold»: stock — сколько всего доступно (NULL —
// безлимит), sold — сколько продано. Резерв поднимает sold ОДНИМ UPDATE с
// guard'ом (stock IS NULL OR sold+qty<=stock) — гонка двух покупателей за
// последнюю единицу решается базой: второй увидит 0 строк и получит «распродано».
// Резерв делаем ДО денег: если запаса нет — игрок ничего не потратил.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";

/**
 * Забронировать qty единиц товара. Возвращает true, если удалось; false —
 * запас исчерпан (или меньше qty). Денег НЕ касается.
 *
 * Идемпотентность: контракт моста может переслать UPDATE вслепую при обрыве
 * канала. Здесь это безопасно в «строгую» сторону — в худшем случае sold
 * поднимется на лишний qty (пара единиц «сгорит» раньше), денег и выдачи это
 * не затрагивает: резерв идёт до оплаты. Дублей товара и потери денег нет.
 */
export async function reserveStock(id: string, mapId: string, qty: number): Promise<boolean> {
  const rows = (await mcpExec(
    `UPDATE yuplink.raid_market_item
        SET sold = sold + ${qty}
      WHERE id=${sqlStr(id)} AND map_id=${sqlStr(mapId)}
        AND (stock IS NULL OR sold + ${qty} <= stock)
      RETURNING id;`,
    { wrapJsonCte: true },
  ).catch(() => [])) as Array<{ id: string }>;
  return !!rows?.[0];
}

/** Вернуть зарезервированные qty единиц (сбой оплаты/выдачи). Best-effort. */
export async function releaseStock(id: string, mapId: string, qty: number): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.raid_market_item
        SET sold = GREATEST(0, sold - ${qty})
      WHERE id=${sqlStr(id)} AND map_id=${sqlStr(mapId)};`,
  ).catch(() => {});
}
