// Кто открылся под забранным объектом.
//
// Клетка показывает один объект: сверху её собственный, под ним — беглец
// (runners.ts). Пока верхний жив, беглеца не видно вовсе; забрали верхний —
// показаться должен беглец.
//
// На сервере этот выбор всегда был верным, а игрок его не видел: карта у него
// в кэше живёт пять минут, и после «забрал артефакт» клетка просто гасла.
// Гриб под артефактом с виду исчезал вместе с ним — «побеждён автоматом», хотя
// в базе он живой и целый. Отсюда эта справка: ответ на подбор и на добитый бой
// говорит, КТО открылся, и карта подменяет объект сразу.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { RUNNER_LAYER } from "./runners";
import { objectKnownSql } from "./boss-snapshot";

/** Открывшийся беглец: клетка и его объект. */
export type RunnerReveal = { cell: string; objectId: string };

/**
 * Беглец под клеткой — если он там есть, жив и его есть чем показать.
 *
 * Оборванная ссылка (шаблон удалён, снимка нет) не в счёт: тёмный кружок без
 * имени и кнопки хуже пустого места — то же правило, что и на карте
 * (map-runners).
 */
export async function revealRunnerAt(
  mapId: string,
  q: number,
  r: number,
): Promise<RunnerReveal | null> {
  const rows = (await mcpExec(
    `SELECT rn.object_id
       FROM yuplink.beta_raid_runner rn
      WHERE rn.map_id = ${sqlStr(mapId)} AND rn.q = ${Math.floor(q)} AND rn.r = ${Math.floor(r)}
        AND ${objectKnownSql("rn")}
        AND NOT EXISTS (SELECT 1 FROM yuplink.beta_raid_object_hp h
                         WHERE h.map_id = rn.map_id AND h.q = rn.q AND h.r = rn.r
                           AND h.cycle_no = ${RUNNER_LAYER}
                           AND (h.killed_at IS NOT NULL OR h.current_hp <= 0))
      LIMIT 1;`,
    { wrapJson: true },
  )) as Array<{ object_id: string }>;
  const objectId = rows?.[0]?.object_id;
  return objectId
    ? { cell: `${Math.floor(q)},${Math.floor(r)}`, objectId: String(objectId) }
    : null;
}
