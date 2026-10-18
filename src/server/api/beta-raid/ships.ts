// Корабли на воде: чтение состояния карты.
//
// Корабль строит верфь, стоит он на клетке воды и бывает свободным или
// занятым. Свободный может занять любой игрок — как костёр чужого лагеря,
// только на воде.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { getNeighbors } from "./helpers";
import { CELL_COST_JOIN, CELL_COST_SQL, WATER_SQL, OCEAN_SQL, decorBlocksSql } from "./cell-sql";
import { VOID_SQL } from "./voidCells";
import { objectKnownSql } from "./boss-snapshot";
import { DOOR_SQL } from "./gate-sql";

// Вода и цена клетки переехали в cell-sql.ts — их читает ещё и шаг по карте.
// Реэкспорт оставлен: WATER_SQL импортируют отсюда (admin-live-ship.ts).
export { WATER_SQL };
// Причалы переехали в ship-berths.ts (лимит 250 строк); зовут их отсюда же.
export { loadShipCells, visibleShipCells, type ShipCell, type ShipBrief } from "./ship-berths";

export type ShipRow = {
  id: string;
  q: number;
  r: number;
  owner: string;
  /** Кошелёк капитана — тот, кто на этом судне записан. null — свободно. */
  crew: string | null;
};

/**
 * Клетка занята тем, что мешает встать: глухой туман, декор-преграда или
 * живой объект. Туман здесь закрывает разом и спуск корабля, и сход на
 * берег — обе выборки ходят через этот предикат.
 *
 * VOID_SQL читает колонку КЛЕТКИ (`c.void_fog`), а не тип местности: в обеих
 * выборках ниже таблица клеток названа `c`, а join шаблона `t` остаётся ради
 * WATER_SQL — вода по-прежнему свойство типа.
 *
 * `bypassVoid` приходит СВЕРХУ булевым, а не спрашивается здесь: этот модуль
 * читает карту и про кошельки ничего не знает, а решает «кому туман не
 * преграда» одно место на весь рейд (voidGate.canIgnoreVoid). Для админа
 * условие вырождается в `false OR …` — стена исчезает, остальные преграды
 * остаются: декор и живой объект держат клетку и его.
 *
 * «Живой» — ещё и «существующий»: ссылка на удалённый шаблон клетку не
 * держит (objectKnownSql), иначе сойти на такой берег было бы нельзя, а
 * показать там нечего — тот же тупик, что и с шагом (step-facts).
 *
 * Декор — тем же правилом, что и у шага (decorBlocksSql): шаблон ЕСТЬ и не
 * walkable. Голый `decoration_id IS NOT NULL` запирал берег и после удаления
 * шаблона: пешком сервер уже пускал, а сойти с борта было нельзя.
 */
export const blockedSql = (bypassVoid: boolean) => `(${bypassVoid ? "false" : VOID_SQL}
   OR ${DOOR_SQL("c")}
   OR ${decorBlocksSql("c")}
   OR (c.object_id IS NOT NULL AND ${objectKnownSql("c")} AND NOT EXISTS (
         SELECT 1 FROM yuplink.beta_raid_object_hp h
          WHERE h.map_id = c.map_id AND h.q = c.q AND h.r = c.r
            AND (h.killed_at IS NOT NULL OR h.current_hp <= 0))))`;

export async function loadShips(mapId: string): Promise<ShipRow[]> {
  const rows = (await mcpExec(
    `SELECT s.id, s.q, s.r, s.owner, s.crew_account AS crew
       FROM yuplink.beta_raid_ship s
      WHERE s.map_id = ${sqlStr(mapId)};`,
    { wrapJson: true },
  )) as Array<{ id: string; q: number; r: number; owner: string; crew: string | null }>;
  return (rows ?? []).map((s) => ({
    id: s.id,
    q: Number(s.q),
    r: Number(s.r),
    owner: s.owner,
    crew: s.crew ?? null,
  }));
}

/**
 * Вода рядом с клеткой: куда поставить корабль (верфь, заклинания, портал).
 *
 * Корабль в клетке спуску НЕ мешает — ни целый, ни разбитый (владелец,
 * 27.09): у причала может стоять целый флот, посадка выбирает борт по id.
 * Пустую воду берём в первую очередь, дальше — где судов меньше, чтобы флот
 * расходился по берегу, а не копился в одной клетке. Отказ «нет воды» — только
 * когда рядом нет подходящей воды вовсе.
 */
export async function freeWaterAround(
  mapId: string,
  q: number,
  r: number,
  /** Админ спускает судно и в воду под глухим туманом — это его же зона. */
  bypassVoid = false,
  /** Вид судна: обычному кораблю океан не годится, большому — любая вода. */
  kind: "small" | "big" = "small",
): Promise<{ q: number; r: number } | null> {
  const around = getNeighbors(q, r);
  const pairs = around.map((c) => `(${c.q}, ${c.r})`).join(",");
  const rows = (await mcpExec(
    `SELECT c.q, c.r
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
      WHERE c.map_id = ${sqlStr(mapId)}
        AND (c.q, c.r) IN (${pairs})
        AND ${WATER_SQL}
        ${kind === "small" ? `AND NOT ${OCEAN_SQL}` : ""}
        AND NOT ${blockedSql(bypassVoid)}
      ORDER BY (SELECT count(*) FROM yuplink.beta_raid_ship s
                 WHERE s.map_id = c.map_id AND s.q = c.q AND s.r = c.r), c.q, c.r
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number }>;
  const cell = rows?.[0];
  return cell ? { q: Number(cell.q), r: Number(cell.r) } : null;
}

/** Клетка схода на берег вместе с ценой шага на неё. */
export type LandingCell = { q: number; r: number; cost: number };

/**
 * Берег для схода: самая ДЕШЁВАЯ суша рядом с кораблём.
 *
 * Раньше брали первую попавшуюся (ORDER BY q, r LIMIT 1), и игрок с воды
 * сходил куда придётся — рядом луг за 1, а списывалась гора за 10. Теперь
 * выбираем по цене, при равенстве — по (q, r), чтобы выбор не прыгал между
 * запросами: клиент показывает цену заранее, и она обязана совпасть.
 *
 * Цена — та же, что у обычного шага по карте (CELL_COST_SQL из cell-sql.ts,
 * им же считают шаг и цену целевой клетки), иначе подпись на кнопке и
 * списание разъедутся снова.
 * Выбор и цену делает ОДИН запрос: сортировка по цене, при равенстве — по
 * (q, r), чтобы выбор не прыгал между запросами.
 */
export async function landAround(
  mapId: string,
  q: number,
  r: number,
  /** Тот же флаг, что у спуска: сойти на берег в своей зоне админу можно. */
  bypassVoid = false,
): Promise<LandingCell | null> {
  // Кольцо соседей, а если там сплошь объекты и декор — второе кольцо.
  // Причал у берега, заставленного сундуками и боссами, оставлял игрока на
  // борту навсегда: сойти было некуда, а плыть дальше он мог не хотеть.
  // Ближайший свободный берег в двух шагах — не телепорт, а обход завала.
  const ring1 = getNeighbors(q, r);
  const ring2 = ring1
    .flatMap((c) => getNeighbors(c.q, c.r))
    .filter((c) => !(c.q === q && c.r === r) && !ring1.some((n) => n.q === c.q && n.r === c.r));
  const pairs = [...ring1, ...ring2].map((c) => `(${c.q}, ${c.r})`).join(",");
  const rows = (await mcpExec(
    `SELECT c.q, c.r, ${CELL_COST_SQL} AS cost
       FROM yuplink.raid_map_cells c
       JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
       ${CELL_COST_JOIN}
      WHERE c.map_id = ${sqlStr(mapId)}
        AND (c.q, c.r) IN (${pairs})
        AND NOT ${WATER_SQL}
        AND NOT ${blockedSql(bypassVoid)}
      -- Сначала ближнее кольцо (шаг с борта), внутри него — самое дешёвое.
      ORDER BY ((abs(c.q - ${Math.floor(q)}) + abs(c.q - ${Math.floor(q)} + c.r - ${Math.floor(r)}) + abs(c.r - ${Math.floor(r)})) / 2), cost, c.q, c.r
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ q: number; r: number; cost: number }>;
  const best = rows?.[0];
  if (!best) return null;
  return { q: Number(best.q), r: Number(best.r), cost: Number(best.cost) || 1 };
}
