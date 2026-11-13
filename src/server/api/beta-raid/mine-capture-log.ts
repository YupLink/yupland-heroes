// Отнятые шахты и грибы в списке шахт «Добычи» (владелец, 23.10.2026: «в
// самих шахтах всё должно быть — никаких новых блоков… после уходит шахта»).
//
// Строку журнала пишет база в той же транзакции, что и потерю (raid_mine_lose,
// migrations/minecap-01): захват, подъём гриба, поломка, разборка, гниль гриба,
// снос острова. Несобранное не на счёте — строка висит обычной строкой шахты
// (ресурс, клетка, сколько готово), пока игрок не нажмёт «Собрать со всех
// шахт» (mine-claim → mine-lost-claim); собрал — строки нет. Пустые (целых
// часов не было) в список не идут. Кто отнял — наружу не отдаём (владелец).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { mcpExec } from "../../db/mcpClient";
import { requireBetaRaid } from "./gate";
import { accAccountId } from "../currency/move";
import { sqlStr } from "../raid-shared";
import { mushroomKindOf } from "@/lib/mushroomKinds";
import type { MineResource } from "@/lib/buildingEffect";
import type { MineRow } from "./mine-pendings";

type Row = {
  id: string;
  map_id: string;
  map_name: string | null;
  q: number;
  r: number;
  resource: string;
  token: string | null;
  kind: string;
  amount: number | string;
  mushroom_image: string | null;
};

/** Сколько отнятых строк отдаём окну за раз (собранные уходят, следующие подтянутся). */
export const LOST_LIST_LIMIT = 100;

/** Незабранные строки игрока с несобранным (без срока). */
export function lostMinesSql(account: string): string {
  return `SELECT l.id, l.map_id, m.name AS map_name, l.q, l.r, l.resource, l.token, l.kind,
            l.amount + l.tail AS amount, sk.image AS mushroom_image
       FROM yuplink.raid_mine_capture_log l
       LEFT JOIN yuplink.raid_maps m ON m.id = l.map_id
       LEFT JOIN yuplink.raid_building_skin sk ON sk.id = CASE
         WHEN l.resource = 'token' AND lower(l.token) = 'darai' THEN 'bskin_dm_mushroom'
         WHEN l.kind IN ('take', 'expire') AND l.resource = 'gold' THEN 'bskin_dm_gold'
         WHEN l.kind IN ('take', 'expire') AND l.resource = 'diamonds' THEN 'bskin_dm_diamonds'
         ELSE NULL END
      WHERE l.old_account = ${sqlStr(account)}
        AND l.claimed_at IS NULL
        AND l.resource IS NOT NULL
        AND l.amount + l.tail > 0
      ORDER BY l.seized_at DESC
      LIMIT ${LOST_LIST_LIMIT}`;
}

/**
 * Отнятые — строками шахт: ресурс, клетка, готово (lost.amount); выхода в
 * час нет — шахта больше не копит. here — карта, где стоит игрок; floors —
 * открытые этажи (floorMaps): чужая карта подписана названием этажа или карты.
 */
export async function lostMineRows(
  account: string,
  here: string,
  floors: ReadonlyArray<{ id: string; floor: string | null }>,
): Promise<MineRow[]> {
  const raw = ((await mcpExec(lostMinesSql(account), { wrapJson: true })) ?? []) as Row[];
  const floorName = new Map(floors.map((f) => [f.id, f.floor]));
  return raw.map((x) => {
    // Вид восстанавливается по событию потери, не по нынешнему содержимому клетки.
    const mushroom = mushroomKindOf({
      resource: x.resource,
      token: x.token,
      mushroom: x.kind === "take" || x.kind === "expire" ? x.resource : null,
    });
    return {
      ...(mushroom
        ? { mushroom: { kind: mushroom, image: x.mushroom_image ?? null, diesAt: null } }
        : {}),
      mapId: String(x.map_id),
      floor: x.map_id === here ? null : (floorName.get(x.map_id) ?? x.map_name ?? "—"),
      q: Number(x.q),
      r: Number(x.r),
      resource: x.resource as MineResource,
      token: x.token ?? null,
      yield: 0,
      claimedHours: 0,
      capturedAt: 0,
      maxHours: null,
      lost: { id: String(x.id), amount: Number(x.amount) || 0, kind: x.kind },
    };
  });
}
