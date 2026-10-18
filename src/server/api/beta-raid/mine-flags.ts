// Флажки на постройках карты — что этот игрок уже сделал / чем владеет.
//
// Изначально были только у шахт (моя / чужая). Тем же слоем теперь ходят
// «использованные» постройки — сейчас это дерево уровней, которое даёт герою
// +1 один раз навсегда: игроку важно видеть, куда бегать уже не за чем.
//
// Общий модуль по двум причинам:
//   • одна выборка на все флажки — карта пикселей у клиента одна, и три отдельных
//     запроса ради разных значков стоили бы трёх походов в базу на каждый вход;
//   • одна структура на клиенте — betaCanvasDraw смотрит в один словарь.
//
// Договорённость: свободных шахт и не использованных деревьев сервер не отдаёт
// вовсе — «нет записи» и значит «нет флажка». Клиент рисует «own» зелёным.
import { createServerFn } from "@tanstack/react-start";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { requireBetaRaid } from "./gate";
import { myMapId } from "./encounter-where";
import { raidOwner } from "./owner";

/**
 * `own` — зелёный флаг, `enemy` — красный.
 *
 * Для дерева «own» значит «этот игрок уже получил тут уровень» — сам по себе
 * зелёный и есть цвет «уже сделано»; чужие использования нам показывать незачем
 * (у соседа своя история, а дерево к клетке не привязано).
 */
export type MineFlag = "own" | "enemy" | "tree";

/**
 * Шахта ли эта постройка. По названию, потому что отдельного признака у шаблона
 * нет, но `meta.effect = 'mine'` подключается автоматически — задел совместимый.
 */
const MINE_SQL = `(t.name ILIKE '%шахт%' OR t.meta->>'effect' = 'mine')`;

export const getMineFlags = createServerFn({ method: "GET" }).handler(async () => {
  const wallet = await requireBetaRaid();
  const mapId = await myMapId(wallet);
  const me = await raidOwner(wallet);

  // Три источника флагов идут одним `Promise.all` — раньше это были три
  // подряд `await`, и на проде каждый — сетевой рейс до моста (~150 мс). На
  // монтаж экрана уходило полсекунды, а картинка мигала «сначала без
  // флажков, потом с ними». Параллельно — один tick.
  // Склады тут больше не считаем: «где лежит моё» показывает бейдж с числами
  // (warehouse-badges.ts) — точка на углу дублировала его и стоила запроса.
  const [mineRows, fieldRows, treeRows] = (await Promise.all([
    mcpExec(
      // Шахты: моё / чужое читаем из raid_mine_state; свободные не отдаём.
      `SELECT c.q, c.r, (s.owner_account = ${sqlStr(me)}) AS mine
         FROM yuplink.raid_map_cells c
         JOIN yuplink.mystic_item_template t ON t.id = c.building_id
         JOIN yuplink.raid_mine_state s
           ON s.map_id = c.map_id AND s.q = c.q AND s.r = c.r
        WHERE c.map_id = ${sqlStr(mapId)} AND ${MINE_SQL};`,
      { wrapJson: true },
    ),
    // Грядки, где батрачит МОЙ герой: зелёный флажок, как у своей шахты.
    // Чужие поля не помечаем вовсе — там никто не «владеет».
    mcpExec(
      `SELECT w.q, w.r FROM yuplink.raid_field_worker w
        WHERE w.map_id = ${sqlStr(mapId)} AND w.account_id = ${sqlStr(me)}
          AND w.hero_id IS NOT NULL;`,
      { wrapJson: true },
    ).catch(() => []),
    // Использованные деревья уровней — только МОИ. Учёт живёт в общем
    // журнале beta_raid_building_use (kind='leveltree').
    mcpExec(
      `SELECT u.q, u.r FROM yuplink.beta_raid_building_use u
        WHERE u.map_id = ${sqlStr(mapId)} AND u.owner = ${sqlStr(me)}
          AND u.kind = 'leveltree';`,
      { wrapJson: true },
    ),
  ])) as [
    Array<{ q: number; r: number; mine: boolean }>,
    Array<{ q: number; r: number }>,
    Array<{ q: number; r: number }>,
  ];

  const flags: Record<string, MineFlag> = {};
  for (const row of mineRows ?? []) {
    flags[`${Number(row.q)},${Number(row.r)}`] = row.mine ? "own" : "enemy";
  }
  // Дерево может стоять на той же клетке (маловероятно, но): шахта важнее —
  // её флаг про статус захвата, дерево про личное «сделано», не спорим.
  // Значение "tree" — свой отдельный образ (green-tree), чтобы использованное
  // дерево не выглядело как захваченная шахта.
  for (const row of fieldRows ?? []) {
    flags[`${Number(row.q)},${Number(row.r)}`] = "own";
  }
  for (const row of treeRows ?? []) {
    const key = `${Number(row.q)},${Number(row.r)}`;
    if (!flags[key]) flags[key] = "tree";
  }
  return { flags };
});
