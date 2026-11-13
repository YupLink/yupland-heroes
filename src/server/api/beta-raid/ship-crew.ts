// Кто в лодке — запись, а не координаты.
//
// Раньше «на борту» значило «на моей клетке стоит какое-то судно». Из этого
// росло всё сразу: две сестры одного аккаунта оказывались на одном корабле,
// капитаном чужого судна считался любой прохожий, а клетка суши с обмелевшим
// кораблём работала причалом. Теперь у судна есть экипаж (`crew_wallet`), и
// вопросы «я на борту?» и «чьё это судно?» имеют один ответ на всю игру.
// Экипаж записан на АККАУНТ: игрок один, каким бы адресом он ни вошёл.
//
// Правила владельца, которые держит этот модуль:
//   1. судно никогда не покидает воду — переезд только на водную клетку;
//   2. вернуться на воду можно только там, где есть СВОБОДНОЕ судно;
//   4. на одном судне один игрок — посадка это CAS `WHERE crew_wallet IS NULL`;
//   и шаг применяется целиком: позиция и судно меняются ОДНИМ оператором, то
//   есть одной транзакцией, а не двумя половинками в общем `Promise.all`.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { raidOwner } from "./owner";
import {
  stepMarkKey,
  stepSql,
  waterCell,
  type StepGuard,
  type StepMode,
} from "@/server/api/beta-raid/move-step-sql";

/** Судно, на котором игрок сидит по записи. */
export type MyShip = { id: string; q: number; r: number; kind: "small" | "big" };

/** Экипаж матчим по аккаунту: одна строка вместо перебора адресов. */
const crewAcc = async (wallet: string): Promise<string> => sqlStr(await raidOwner(wallet));

export type { StepGuard, StepMode } from "@/server/api/beta-raid/move-step-sql";

/** Судно ИМЕННО этого игрока: не «то, что под ногами», а то, где он записан. */
export async function myShip(wallet: string, mapId: string): Promise<MyShip | null> {
  const rows = (await mcpExec(
    `SELECT id, q, r, kind FROM yuplink.beta_raid_ship
      WHERE crew_account = ${await crewAcc(wallet)} AND map_id = ${sqlStr(mapId)}
      ORDER BY updated_at DESC LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ id: string; q: number; r: number; kind: string | null }>;
  const row = rows?.[0];
  return row
    ? { id: row.id, q: Number(row.q), r: Number(row.r), kind: row.kind === "big" ? "big" : "small" }
    : null;
}

/**
 * Занять свободное судно на клетке: id занятого или null — «свободных нет».
 *
 * Брони раньше не было вовсе: свободность читали, а позицию писали секундой
 * позже, и двое успевали сесть на один корабль. Теперь занимает сам UPDATE —
 * `crew_wallet IS NULL` проверяется в момент записи, проигравшему достаётся
 * ноль строк. `SKIP LOCKED` разводит двоих по РАЗНЫМ судам, когда у причала их
 * несколько: иначе оба целились бы в первое по порядку и один уходил ни с чем.
 *
 * Здесь же обе оставшиеся проверки — чтобы их нельзя было обойти мимо этой
 * функции: судно стоит на ВОДЕ (обмелевшая клетка причалом не работает) и
 * игрок не сидит уже в другой лодке.
 */
export async function seatOnShip(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
  /** Океан: сесть можно только в БОЛЬШОЕ судно — малому туда хода нет. */
  bigOnly = false,
  /** Игрок выбрал конкретный борт в окне — садимся ровно в него. */
  shipId?: string | null,
): Promise<{ id: string; big: boolean } | null> {
  const acc = await crewAcc(wallet);
  // На смешанной клетке предпочитаем БОЛЬШОЙ: он вместительнее и «главнее»
  // визуально (карта рисует его артом). Раньше выбирался просто первый по
  // created_at, и клиент видел большой (bool_or по клетке), а посадка попадала
  // в малый — расход шага считался как у малого при показанном «большом».
  // `ORDER BY (kind='big') DESC` и есть это предпочтение; при bigOnly других
  // вариантов и так нет.
  const rows = (await mcpExec(
    `UPDATE yuplink.beta_raid_ship s
        SET crew_account = ${acc}, crew_wallet = ${sqlStr(wallet)},
            -- Штамп «разбит с …» (ship-sweep) гасим самой посадкой: тик уборки
            -- раз в минуту, и борт, починенный и занятый между тиками, иначе
            -- уходил под DELETE «простоял разбитым двое суток» со старым штампом.
            hp_zero_at = NULL, updated_at = now()
      WHERE s.id = (SELECT f.id FROM yuplink.beta_raid_ship f
                     WHERE f.map_id = ${sqlStr(mapId)} AND f.q = ${q} AND f.r = ${r}
                       AND f.crew_account IS NULL
                       -- Разрушенное судно (жизни кончились) в море не выходит,
                       -- пока его не починят досками; подбитое (dynamite-08) — никогда.
                       AND f.hp > 0 AND f.blasted_at IS NULL
                       ${bigOnly ? "AND f.kind = 'big'" : ""}
                       ${shipId ? `AND f.id = ${sqlStr(shipId)}` : ""}
                     ORDER BY (f.kind = 'big') DESC, f.created_at, f.id
                     LIMIT 1 FOR UPDATE SKIP LOCKED)
        AND s.crew_account IS NULL
        AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_ship o WHERE o.crew_account = ${acc})
        AND ${waterCell(mapId, q, r)}
      RETURNING s.id, s.kind;`,
    { wrapJsonCte: true },
  )) as Array<{ id: string; kind: string | null }>;
  const row = rows?.[0];
  return row ? { id: row.id, big: row.kind === "big" } : null;
}

/** Отказ посадки: океан — «слишком мал»; маршрут дальше океаном — «нет подходящего». */
export const seatRefusal = (ocean: boolean, bigOnly: boolean): string =>
  ocean ? "braid.ship_too_small" : bigOnly ? "braid.ship_need_big" : "Все корабли здесь заняты";

/**
 * Снять с судна запас хода вне общего оператора шага: посадка и сход через
 * портал. Обычный сход списывает сам applyStep («ashore»), поэтому дважды
 * здесь не берём.
 */
export async function chargeShipHp(shipId: string, amount: number): Promise<void> {
  if (!(amount > 0)) return;
  await mcpExec(
    `UPDATE yuplink.beta_raid_ship SET hp = hp - ${Math.round(amount)}, updated_at = now()
      WHERE id = ${sqlStr(shipId)};`,
    { wrapJson: false },
  );
}

/** Сойти с борта: судно остаётся там, где стояло, и снова свободно. */
export async function releaseShip(wallet: string): Promise<void> {
  await mcpExec(
    `UPDATE yuplink.beta_raid_ship SET crew_account = NULL, crew_wallet = NULL, updated_at = now()
      WHERE crew_account = ${await crewAcc(wallet)};`,
    { wrapJson: false },
  );
}

/**
 * Применить шаг ЦЕЛИКОМ: позиция и судно — одним оператором, то есть одной
 * транзакцией. Раньше запись позиции и переезд судна стояли в общем
 * `Promise.all`, и отказ одной половины оставлял шаг применённым наполовину:
 * энергия списана, игрок на новой клетке, судно позади.
 *
 * `sail` пишет позицию, ТОЛЬКО если судно доехало (`SELECT … FROM sh`): не
 * доехало — не поплыли, и игрок не окажется на воде без лодки.
 *
 * Со сторожем (guard, шаг по карте) — CAS по клетке «откуда» и плата тем же
 * оператором, только за применённый шаг (move-step-sql). Без него — прежний
 * SQL (сход из окна корабля платит сам).
 *
 * Без `wrapJson`: обёртка спрятала бы изменяющие CTE внутрь подзапроса, а
 * такие Postgres разрешает только на верхнем уровне. Ответ — несколько чисел,
 * их разбирает и обычный парсер.
 */
export async function applyStep(
  wallet: string,
  mapId: string,
  q: number,
  r: number,
  mode: StepMode,
  guard?: StepGuard,
): Promise<{ ships: number; moved: number; energy: number | null; satiety: number | null }> {
  // Судно и позиция матчатся по аккаунту: сесть могли одним адресом, а шагать
  // другим — раньше это давало ноль строк, «Корабль туда не пошёл» с уже
  // списанной энергией и борт, застрявший занятым.
  const acc = await crewAcc(wallet);
  const rows = (await mcpExec(stepSql({ acc, mapId, q, r, mode, guard }), {
    wrapJson: false,
  })) as Array<{
    ships: number;
    moved: number;
    energy?: number | string | null;
    satiety?: number | string | null;
  }>;
  const row = rows?.[0];
  const energy = row?.energy == null ? null : Number(row.energy);
  const satiety = row?.satiety == null ? null : Number(row.satiety);
  return {
    ships: Number(row?.ships) || 0,
    moved: Number(row?.moved) || 0,
    energy: energy !== null && Number.isFinite(energy) ? energy : null,
    satiety: satiety !== null && Number.isFinite(satiety) ? satiety : null,
  };
}

/**
 * Шаг с этим ключом нажатия записан (метка оператора шага)? Нужен, когда шаг
 * промахнулся по CAS: это повтор моста после коммита — переход сделан и
 * оплачен один раз, — или другой запрос успел раньше.
 */
export async function stepOpDone(op: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT 1 AS ok FROM yuplink.rate_hits WHERE key = ${sqlStr(stepMarkKey(op))};`,
    { wrapJson: true },
  )) as Array<{ ok: number }> | null;
  return (rows?.length ?? 0) > 0;
}
