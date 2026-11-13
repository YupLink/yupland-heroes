// SQL шага героя (ship-crew.applyStep): позиция, судно и плата — ОДНИМ оператором.
//
// Раньше позиция писалась upsert'ом без условия на прежнюю клетку, а энергия
// списывалась отдельным запросом ДО записи. Пачка одинаковых запросов из
// клетки A (скрипт, две вкладки) читала одну и ту же A, каждый проходил
// проверку соседства, платил и писал позицию — и каждый получал очко турнира
// «Шаги» за один настоящий переход (аудит турниров 06.10). Теперь со сторожем
// (StepGuard):
//   • позиция меняется по CAS — запись с условием «стоит на клетке «откуда»,
//     которую прочитал этот шаг»; плавание — то же условие на клетку судна.
//     Второй из пачки ждёт замок строки, перечитывает её и промахивается;
//   • плата — тем же оператором и ТОЛЬКО за применённый шаг (`FROM pos`):
//     проигравший гонку не платит вовсе, а не «платит и получает назад»;
//   • нехватка энергии — исключение not_enough_energy: оператор откатывается
//     целиком, позиция остаётся прежней. «Сначала деньги, потом товар» никуда
//     не делось — деньги и товар просто живут в одной транзакции (так же
//     устроен вход в сундук, open-pass/pass-sql);
//   • метка нажатия (ключ op) — тем же оператором и только за применённый шаг.
//     Мост повторяет запрос вслепую (контракт ретрая в mcpClient.ts): ответ
//     первой попытки мог пропасть ПОСЛЕ коммита, и повтор промахнётся по CAS.
//     По метке шаг узнаёт свой же записанный переход (move-step-guard) и не
//     снимает борт, не возвращает плату двери и не откатывает игрока.
// Без сторожа (сход с борта из окна корабля, ship-ride) SQL прежний.
//
// Без обёртки wrapJson: изменяющие CTE — только на верхнем уровне.
// Комментарии внутри SQL — только блочные.
import { sqlStr } from "@/server/api/raid-shared";
import { WATER_SQL, OCEAN_SQL, bridgeCellSql } from "@/server/api/beta-raid/cell-sql";
import { SHIP_ASHORE_HP, SHIP_STEP_HP_OCEAN, SHIP_STEP_HP_WATER } from "@/lib/shipHealth";
import { satietyMoveSql } from "@/server/api/beta-raid/hero-satiety-sql";
import { ladderCtes } from "@/server/api/beta-raid/move-step-ladder-sql";

type Cell = { q: number; r: number };

/**
 * Что шаг делает с судном:
 *  - `sail` — плывём, судно едет с капитаном (и только на воду);
 *  - `ashore` — сходим на берег, судно остаётся на последней водной клетке;
 *  - `walk` — идём ногами, судна под нами нет.
 */
export type StepMode = "sail" | "ashore" | "walk";

/** Сторож шага: откуда шагаем и чем платим. */
export type StepGuard = {
  /**
   * Клетка «откуда», как её прочитал шаг. Строки позиции ещё нет (первый выход
   * на карту) — клетка замка: от неё шаг и считался.
   */
  from: Cell;
  /** Чья энергия (touch_energy_atomic берёт кошелёк). */
  wallet: string;
  /** Цена шага — списывается только за применённый шаг. */
  cost: number;
  /** Ключ нажатия (у каждого запроса шага свой): метка «этот шаг записан». */
  op: string;
  /** Full durability cost of an atomic sail beneath a multi-cell bridge. */
  sailHpCost?: number;
  /**
   * Сытость выбранного героя: −1 за шаг, −2 по воде, −4 по океану. Тем же
   * оператором и только за применённый шаг. Героя нет — поля нет.
   */
  satiety?: { heroId: string; max: number; cost: number };
  /**
   * Лестница (§8.121): шаг пишется, только если в рюкзаке этого героя есть
   * лестница, и она тратится тем же оператором (ladderCtes).
   */
  ladder?: { heroId: string };
};

/**
 * Метка записанного шага — строка в rate_hits (там же метки тормоза частоты):
 * живёт 2 минуты (уборка rateGate), повторы моста укладываются с запасом.
 */
export const stepMarkKey = (op: string): string => `stepop:${op}`;

/** Клетка воды на этой карте — условие «судну там место». */
export const waterCell = (mapId: string, q: number, r: number): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
             JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
            WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
              AND ${WATER_SQL} AND NOT ${bridgeCellSql("c")})`;

/** Океан под килем — гребок туда дороже (и пускает только большое судно). */
export const oceanCell = (mapId: string, q: number, r: number): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_map_cells c
             JOIN yuplink.mystic_item_template t ON t.id = c.terrain_id
            WHERE c.map_id = ${sqlStr(mapId)} AND c.q = ${q} AND c.r = ${r}
              AND ${OCEAN_SQL})`;

/**
 * Позиция пишется вместе с картой шага: строка без карты читается как главный
 * мир (pos-map-sql), и первый шаг новичка на другом этаже иначе оставлял бы его
 * лагерь в Мире Альфа. Строка уже на ДРУГОЙ карте (портал увёл, пока шаг был в
 * пути) — шаг не применяется: он считан по прежней.
 */
const POS_ON_MAP = `(p.map_id IS NULL OR p.map_id = EXCLUDED.map_id)`;

/**
 * Запись СВОЕЙ позиции без условия на прежнюю клетку. Источник строк
 * передаётся снаружи (account_id, q, r, updated_at, map_id): у плавания это
 * `SELECT ... FROM sh` — позиция пишется, только если судно доехало (а судно —
 * по CAS своей клетки).
 */
export const upsertPos = (from: string): string =>
  `INSERT INTO yuplink.beta_raid_positions AS p (account_id, q, r, updated_at, map_id)
   ${from}
   ON CONFLICT (account_id) DO UPDATE
     SET q = EXCLUDED.q, r = EXCLUDED.r, updated_at = now(), map_id = EXCLUDED.map_id
     WHERE ${POS_ON_MAP}
   RETURNING account_id`;

/**
 * Позиция по CAS: строка переезжает, только если стоит на клетке «откуда».
 * Строки нет вовсе (первый выход на карту) — вставка. Upsert с условием, а не
 * голый UPDATE: строку замка может между чтением и записью закрепить
 * heroMapState (состояние рейда), и первый шаг не должен на этом спотыкаться.
 * Строка уже где-то ещё (шаг из пачки опередил) — ноль строк.
 */
export function casPos(
  acc: string,
  q: number,
  r: number,
  from: Cell,
  mapId: string,
  /** Доп. условие строки-источника (лестница: «есть что тратить»). */
  when = "true",
): string {
  // Обычный шаг — прежний текст (VALUES); с условием — строка-источник под WHERE.
  const row = `${acc}, ${q}, ${r}, now(), ${sqlStr(mapId)}`;
  return `INSERT INTO yuplink.beta_raid_positions AS p (account_id, q, r, updated_at, map_id)
     ${when === "true" ? `VALUES (${row})` : `SELECT ${row} WHERE ${when}`}
     ON CONFLICT (account_id) DO UPDATE
       SET q = EXCLUDED.q, r = EXCLUDED.r, updated_at = now(), map_id = EXCLUDED.map_id
       WHERE p.q = ${Math.trunc(from.q)} AND p.r = ${Math.trunc(from.r)} AND ${POS_ON_MAP}
     RETURNING p.account_id`;
}

/**
 * Плата и метка за применённый шаг: строка pos есть — списываем и метим, нет —
 * не трогаем ни энергию, ни метки.
 */
const spendCte = (g: StepGuard): string => {
  const cost = Number.isFinite(g.cost) ? Math.max(0, g.cost) : 0;
  return `,
     spend AS (
       SELECT e.energy_now FROM pos
        CROSS JOIN LATERAL yuplink.touch_energy_atomic(${sqlStr(g.wallet)}, ${cost}::numeric) e
     ),
     done AS (
       INSERT INTO yuplink.rate_hits (key, at)
       SELECT ${sqlStr(stepMarkKey(g.op))}, ARRAY[now()] FROM pos
       ON CONFLICT (key) DO NOTHING
       RETURNING 1
     )${satCte(g)}`;
};

/** Сытость героя — тем же оператором, только за применённый шаг. */
const satCte = (g: StepGuard): string =>
  g.satiety
    ? `,
     sat AS (
       ${satietyMoveSql(g.satiety.heroId, g.satiety.max, -Math.max(0, g.satiety.cost), "EXISTS (SELECT 1 FROM pos)")}
     )`
    : "";

/**
 * Шаг целиком. acc — аккаунт уже в кавычках (sqlStr). Ответ: ships (сколько
 * судов сдвинулось/освободилось), moved (записана ли позиция) и — со сторожем —
 * energy (остаток после платы; null — шаг не применился и платы не было).
 */
export function stepSql(o: {
  acc: string;
  mapId: string;
  q: number;
  r: number;
  mode: StepMode;
  guard?: StepGuard;
}): string {
  const { acc, mapId, q, r, mode, guard } = o;
  const m = sqlStr(mapId);
  const spend = guard ? spendCte(guard) : "";
  const energy = guard ? ",\n         (SELECT energy_now FROM spend)::float8 AS energy" : "";
  const sat = guard?.satiety ? ",\n         (SELECT satiety FROM sat)::float8 AS satiety" : "";
  const counts = `SELECT (SELECT count(*) FROM sh)::int AS ships,
         (SELECT count(*) FROM pos)::int AS moved${energy}${sat};`;

  if (mode === "sail") {
    // Судно едет, только если стоит там, откуда шагнули: второй гребок из пачки
    // видит его уже на новой клетке и промахивается.
    const shipFrom = guard
      ? ` AND q = ${Math.trunc(guard.from.q)} AND r = ${Math.trunc(guard.from.r)}`
      : "";
    return `WITH sh AS (
           UPDATE yuplink.beta_raid_ship ship_m
              SET q = ${q}, r = ${r}, updated_at = now(),
                  /* Гребок стоит судну запаса хода: обычная вода дешевле океана. */
                  hp = hp - ${guard?.sailHpCost ?? `(CASE WHEN ${oceanCell(mapId, q, r)}
                                  THEN ${SHIP_STEP_HP_OCEAN} ELSE ${SHIP_STEP_HP_WATER} END)`}
            WHERE crew_account = ${acc} AND map_id = ${sqlStr(mapId)}
              AND ${waterCell(mapId, q, r)}${shipFrom}
              ${guard?.sailHpCost !== undefined ? `AND NOT EXISTS (
                SELECT 1 FROM yuplink.beta_raid_ship occupied
                 WHERE occupied.map_id = ${sqlStr(mapId)} AND occupied.q = ${q} AND occupied.r = ${r}
                   AND occupied.id <> ship_m.id)` : ""}
           RETURNING id),
         pos AS (${upsertPos(`SELECT ${acc}, ${q}, ${r}, now(), ${m} FROM sh`)})${spend}
         ${counts}`;
  }

  if (mode === "ashore") {
    const release = `UPDATE yuplink.beta_raid_ship
                SET crew_account = NULL, crew_wallet = NULL, updated_at = now(),
                    hp = hp - ${SHIP_ASHORE_HP}
              WHERE crew_account = ${acc}`;
    if (!guard) {
      return `WITH sh AS (
             ${release}
             RETURNING id),
           pos AS (${upsertPos(`VALUES (${acc}, ${q}, ${r}, now(), ${m})`)})
           ${counts}`;
    }
    // Со сторожем борт отпускаем, только если сам сход записался.
    return `WITH pos AS (${casPos(acc, q, r, guard.from, mapId)}),
           sh AS (
             ${release} AND EXISTS (SELECT 1 FROM pos)
             RETURNING id)${spend}
           ${counts}`;
  }

  const lad = guard?.ladder ? ladderCtes(guard.ladder.heroId, acc, guard.op) : null;
  const pos = guard
    ? casPos(acc, q, r, guard.from, mapId, lad ? "EXISTS (SELECT 1 FROM lsrc)" : "true")
    : upsertPos(`VALUES (${acc}, ${q}, ${r}, now(), ${m})`);
  return `${lad ? `${lad.lock}
           ` : ""}WITH sh AS (SELECT 1 WHERE false),${lad ? `
           ${lad.src},` : ""}
           pos AS (${pos})${spend}${lad ? `,
           ${lad.take}` : ""}
           ${lad ? counts.replace(/;$/, ",\n         (SELECT count(*) FROM lgold)::int AS gold;") : counts}`;
}
