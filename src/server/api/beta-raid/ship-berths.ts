// Причалы: что стоит на клетке и что из этого игроку видно.
//
// Вынесено из ships.ts ради лимита в 250 строк — там остались спуск судна,
// поиск воды и берега. Правила те же: занят тот, кто в судне ЗАПИСАН, а не
// тот, кто оказался на его координатах.
import { mcpExec } from "../../db/mcpClient";
import { swrCache } from "../../cache/swr";
import { subscribeRaid } from "../../raidLive";
import { sqlStr } from "../raid-shared";
import { WATER_SQL } from "./cell-sql";
import { loadVoidCells } from "./voidCells";
import { knowsMyShip, type MySeat } from "./ship-berths-fresh";

/** Одно судно клетки: вид, остаток запаса хода и кто в нём сидит. */
export type ShipBrief = {
  kind: "small" | "big";
  hp: number;
  crew: string | null;
  /** Когда подбит синим динамитом (мс, dynamite-08); null — не подбит. */
  blastedAt?: number | null;
};

/** Сколько судов на клетке, сколько из них с экипажем и кто эти капитаны. */
export type ShipCell = {
  q: number;
  r: number;
  ships: number;
  busy: number;
  crew: string[];
  /** Вода ли под судами. На суше причал не работает — сесть некуда. */
  water: boolean;
  /** Есть ли на клетке БОЛЬШОЙ корабль — карта рисует его своим артом. */
  big: boolean;
  /**
   * Состав причала. На одной клетке уживаются целое, занятое и разрушенное
   * судно — счётчик на карте показывает их тремя числами, а полоска жизней
   * рисуется по тому борту, чей арт виден.
   */
  fleet: ShipBrief[];
};

/**
 * Вода под клеткой судна: причал бывает только на воде. Админ перекрашивает
 * карту живьём, и судно иногда оказывается на суше — такой «причал» показывать
 * свободным нельзя, иначе клиент насчитает посадку, а сервер её не пустит.
 */
const WATER_UNDER_SHIP = `LEFT JOIN LATERAL (
         SELECT ${WATER_SQL} AS water
           FROM yuplink.raid_map_cells c
           JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
          WHERE c.map_id = s.map_id AND c.q = s.q AND c.r = s.r
          LIMIT 1
       ) w ON true`;

/**
 * Причалы карты: на клетке может стоять несколько судов, и занято ровно
 * столько, у скольких есть экипаж.
 *
 * Занятость раньше считалась соединением судов с игроками ПО КООРДИНАТАМ, и
 * врала сразу с трёх сторон: сестринский кошелёк того же аккаунта из счёта
 * выбрасывался (две сестры садились на один борт), игрок с теми же
 * координатами другой карты занимал здешнее судно, а обмелевшая на суше лодка
 * считалась причалом. Теперь занят тот, кто в судне ЗАПИСАН, — то же правило,
 * что и в step-facts.ts.
 */
/** Причалы по карте на 2 с: показ, не проходимость (её решает step-facts живьём). */
const shipCache = swrCache<ShipCell[]>({ ttl: 2_000, load: loadShipCells, maxStale: 10_000 });

// Событие «ships» БЕЗ клеток значит «флот изменился, перечитай причалы»: спуск
// с верфи, посадка и сход из окна корабля, починка, разбор, призыв, кисть
// админа. Кэш этого не знал и до 10 с отдавал снимок без нового судна — игрок
// спускал корабль, а его не было (а «обновление страницы = табу»). Такие
// события редкие, снимок после них выбрасываем; приходит и с соседнего воркера
// через NOTIFY. Гребки идут с клетками и кэш не трогают — соседи двигают иконку
// по дельте, а автору свежесть гарантирует сверка в visibleShipCells.
subscribeRaid((e) => {
  if (e.type === "ships" && !e.cells) shipCache.drop();
});

export async function loadShipCells(mapId: string): Promise<ShipCell[]> {
  const rows = (await mcpExec(
    `SELECT s.q, s.r, count(*)::int AS ships,
            count(s.crew_account)::int AS busy,
            COALESCE(array_agg(s.crew_account) FILTER (WHERE s.crew_account IS NOT NULL), '{}')
              AS crew,
            bool_or(COALESCE(w.water, false)) AS water,
            bool_or(s.kind = 'big') AS big,
            json_agg(json_build_object(
              'kind', COALESCE(s.kind, 'small'), 'hp', s.hp, 'crew', s.crew_account,
              'blasted', (extract(epoch FROM s.blasted_at) * 1000)::bigint)
              ORDER BY s.created_at, s.id) AS fleet
       FROM yuplink.beta_raid_ship s
       ${WATER_UNDER_SHIP}
      WHERE s.map_id = ${sqlStr(mapId)}
      GROUP BY s.q, s.r;`,
    { wrapJson: true },
  )) as Array<{
    q: number;
    r: number;
    ships: number;
    busy: number;
    crew: unknown;
    water: boolean | null;
    big: boolean | null;
    fleet: unknown;
  }>;
  return (rows ?? []).map((row) => ({
    q: Number(row.q),
    r: Number(row.r),
    ships: Number(row.ships) || 0,
    busy: Number(row.busy) || 0,
    crew: Array.isArray(row.crew) ? row.crew.map(String) : [],
    water: !!row.water,
    big: !!row.big,
    fleet: Array.isArray(row.fleet)
      ? (row.fleet as Array<Record<string, unknown>>).map((f) => ({
          kind: f.kind === "big" ? ("big" as const) : ("small" as const),
          hp: Number(f.hp) || 0,
          crew: f.crew == null ? null : String(f.crew),
          blastedAt: f.blasted == null ? null : Number(f.blasted),
        }))
      : [],
  }));
}

/**
 * Причалы, которые игроку МОЖНО показать.
 *
 * Корабль стоит только на воде, поэтому судно в зоне глухого тумана — готовая
 * разведка местности сквозь стену: игрок не видит гексов, но видит, что там
 * вода и сколько на ней народу. Прятать это на клиенте бесполезно — данные
 * уже в ответе.
 *
 * Минутный кэш loadVoidCells здесь уместен, в отличие от гейтов хода: это
 * ПОКАЗ, и протухший снимок зоны на минуту никого за стену не пускает.
 *
 * Свой причал прячем ВСЕГДА только чужой: если админ накрыл туманом воду, на
 * которой игрок уже стоит на своём судне, спрятанный причал отнимал у него
 * кнопку «сойти на берег» — и запирал посреди воды насовсем. Разведкой это не
 * является: он и так там стоит.
 *
 * «Своё» — это судно, где записан ЭТОТ игрок; ключ здесь аккаунт, поэтому
 * адрес входа роли не играет.
 *
 * `my` — живая запись экипажа игрока (ship-crew.myShip): снимок, который не
 * знает, где я сижу, протух — см. ship-berths-fresh.ts.
 */
export async function visibleShipCells(
  mapId: string,
  bypassVoid: boolean,
  account: string | null,
  my: MySeat,
): Promise<ShipCell[]> {
  // Причалы по карте — одни на всех: из кэша на 2 с; чужие изменения клиент
  // получает событиями «ships». Под нагрузкой 1000 игроков этот GROUP BY шёл
  // 22 раза в секунду по 0,9 с.
  let cells = await shipCache.get(mapId);
  // СВОИ изменения автору событиями не приходят, а его рефетч после гребка
  // приносил снимок, снятый до гребка: судно на прошлой клетке, герой «пешком»
  // на воде, дальше не плыть до F5. Снимок, не знающий о моём судне, выбрасываем
  // и перечитываем — один лишний GROUP BY только у автора сразу после хода.
  if (!knowsMyShip(cells, account, my)) {
    shipCache.drop(mapId);
    cells = await shipCache.get(mapId);
  }
  if (bypassVoid) return cells;
  const dead = await loadVoidCells(mapId);
  if (dead.size === 0) return cells;
  return cells.filter((c) => !dead.has(`${c.q},${c.r}`) || (!!account && c.crew.includes(account)));
}
