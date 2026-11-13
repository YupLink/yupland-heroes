// Полосы службы шахт v2 на карте (владелец, 21.10.2026): ВСЕ шахты v2 этажа,
// чьи бы ни были, — режим, запас и когда он записан (lib/mineLifeBars).
//
// Отдельный запрос, а не четвёртая выборка во флажках: флажки — про «моё /
// чужое» у одного игрока, полосы — общие для всех и перечитываются по своему
// поводу (поток: шахту чинили или сменили режим). Флажки не трогаем вовсе.
//
// Шахта v2 — вид клетки v2 (raid_mine_v2_std не NULL: дерево/камень/золото/
// алмазы без maxHours). Строка владения без accrue_from — ещё старого образца,
// полосы нет. Строки нет — ничья: пустая рамка. Ничья сломалась, отслужив
// срок (wrecked), если последняя запись журнала потерь клетки — поломка или
// захват (до 23.10 поломка в журнал не писалась, а хозяина v2 теряет только
// она): на карте — руины. Нет записей (остров до починки, новая карта) или
// последняя — разборка/остров — ничья с рождения, обычная картинка.
//
// 04.11.2026 (владелец): чужие шахты — только во «втором обзоре» героя (круг
// 20 на разведанном, mine-life-see.ts), свои — с любого расстояния. Вдали чужой
// шахты в ответе нет вовсе: ни полосы, ни кружка, ни руин. Клиент перечитывает
// полосы, отойдя на несколько клеток (useMineLifeFeed).
// 05.11.2026 (владелец): админ видит так же, как игроки, все шахты — только в
// режиме бога. Режим живёт на телефоне, поэтому клиент шлёт god; сервер верит
// ему лишь у админа (canIgnoreVoid). Купол — как раньше: админ видит его всегда.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { MINE_SQL } from "./mine-flags";
import { canIgnoreVoid } from "./voidGate";
import { raidOwner } from "./owner";
import { inSightSql } from "./mine-life-see";
import { encodeMineLife, type MineLifeRow, type MineLifeWire } from "@/lib/mineLifeBars";

/** Сырая строка выборки полос. */
type Row = {
  q: number;
  r: number;
  owned: boolean;
  v2: boolean;
  mode: string | null;
  life_left: number | string | null;
  life_at: number | string | null;
  lvl?: number | string | null;
  /** Только у ничьей: сломалась, отслужив срок (см. шапку); NULL — нет записей. */
  wrecked?: boolean | null;
};

/** Кто смотрит: all — все шахты (админ в режиме бога), seesVoid — видит купол (админ). */
export type MineLifeViewer = { all: boolean; seesVoid: boolean; account: string };

/**
 * Шахты v2 одной карты. План на проде: частичный индекс построек карты (~1,5 тыс. клеток) + ключ строки владения.
 * Под куполом игроку не отдаём (что клиент прячет, сервер не шлёт — voidSanitize); админу — да.
 * Чужие — только в круге «второго обзора» (inSightSql), свои — все; без круга — режим бога.
 */
export function mineLifeSql(mapId: string, who: MineLifeViewer): string {
  const noVoid = who.seesVoid ? "" : `\n        AND NOT COALESCE(c.void_fog, false)`;
  const sight = who.all
    ? ""
    : `\n        AND (s.owner_account = ${sqlStr(who.account)} OR ${inSightSql("c", who.account, mapId)})`;
  return `SELECT c.q, c.r, s.map_id IS NOT NULL AS owned, s.accrue_from IS NOT NULL AS v2,
            s.mode, s.life_left, extract(epoch from s.life_at) * 1000 AS life_at,
            CASE WHEN yuplink.raid_mine_is_island(c.building_config) THEN 0
                 ELSE yuplink.raid_mine_level(c.building_config) END AS lvl,
            CASE WHEN s.map_id IS NULL THEN (
              SELECT l.kind IN ('break', 'capture') FROM yuplink.raid_mine_capture_log l
               WHERE l.map_id = c.map_id AND l.q = c.q AND l.r = c.r
               ORDER BY l.seized_at DESC LIMIT 1) END AS wrecked
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.building_id
       LEFT JOIN yuplink.raid_mine_state s ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
      WHERE c.map_id = ${sqlStr(mapId)} AND ${MINE_SQL}
        AND yuplink.raid_mine_v2_std(c.building_config) IS NOT NULL${noVoid}${sight};`;
}

/** Строки базы → строки кодировщика: старого образца выкидываем. */
export function mineLifeRows(rows: readonly Row[]): MineLifeRow[] {
  const out: MineLifeRow[] = [];
  for (const x of rows) {
    if (x.owned && !x.v2) continue;
    out.push({
      q: Number(x.q),
      r: Number(x.r),
      life: x.owned
        ? { mode: x.mode, lifeLeft: Number(x.life_left), lifeAt: Number(x.life_at) }
        : null,
      level: x.lvl == null ? 1 : Number(x.lvl),
      ...(!x.owned && x.wrecked === true ? { wrecked: true } : {}),
    });
  }
  return out;
}

/** Вход: god — у админа включён режим бога (иначе и у админа — как у игрока). */
export function mineLifeInput(d: unknown): { god: boolean } {
  return { god: !!d && typeof d === "object" && (d as { god?: unknown }).god === true };
}

export const getMineLifeBars = createServerFn({ method: "GET" })
  .inputValidator(mineLifeInput)
  .handler(async ({ data }): Promise<MineLifeWire> => {
    const wallet = await requireBetaRaid();
    const [mapId, account] = await Promise.all([myMapId(wallet), raidOwner(wallet)]);
    const admin = canIgnoreVoid(wallet);
    const who = { all: admin && data.god, seesVoid: admin, account };
    const rows = (await mcpExec(mineLifeSql(mapId, who), { wrapJson: true })) as Row[];
    // Часы сервера — после выборки: возраст записи считаем от них же.
    const serverNow = Date.now();
    return { bars: encodeMineLife(mineLifeRows(rows ?? []), serverNow), serverNow };
  });
