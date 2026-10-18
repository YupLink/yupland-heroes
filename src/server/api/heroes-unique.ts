// Уникальные герои: такой выпадает ровно один раз на всю игру.
//
// Как это устроено и почему так. Отдельной таблицы и отдельного счётчика тут
// не заводится: признак живёт в `meta.unique` шаблона — ровно там же и ровно в
// том же виде, что галочка «убегает» у грибов (`meta.flees`). Админка уже умеет
// слать meta целиком, чтение уже её отдаёт, миграции не нужны.
//
// «Уже выдан» тоже считается по существующим записям, а не по новому журналу:
// герой у игрока — это либо предмет в инвентаре (user_game_item, kind='hero'),
// либо заведённый экземпляр с прокачкой (hero_instance). Первого достаточно:
// экземпляр заводится лениво, при первом входе в замок, и ждать его значило бы
// выдать «уникального» второй раз, пока первый спит в инвентаре.
//
// Побочное следствие, которое стоит помнить: если такого героя у игрока изъять
// (админ забрал предмет), шаблон снова станет доступен для выпадения. Это
// осознанно — иначе уникальный герой пропадал бы из игры навсегда из-за
// случайной выдачи в тесте.
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

/** Помечен ли шаблон как уникальный (meta.unique). */
export const UNIQUE_SQL = (t: string) =>
  `lower(COALESCE(${t}.meta->>'unique', '')) IN ('true', '1')`;

/**
 * Кто из этих шаблонов — уникальный и уже занятый.
 *
 * Отдаёт множество, а не отфильтрованный список, потому что решение «что
 * делать, если после отсева пусто» зависит от места: у превращения фишки есть
 * запасные пулы пошире (heroes-convert), и правильный ответ там — расширить
 * выбор, а не выдать уникального повторно.
 */
export async function takenUniqueIds(candidateIds: string[]): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();
  const ids = candidateIds.map((c) => sqlStr(c)).join(",");
  const taken = (await mcpExec(
    `SELECT t.id
       FROM yuplink.mystic_item_template t
      WHERE t.id IN (${ids}) AND ${UNIQUE_SQL("t")}
        AND (EXISTS (SELECT 1 FROM yuplink.user_game_item u
                      WHERE u.template_id = t.id AND u.kind = 'hero')
          OR EXISTS (SELECT 1 FROM yuplink.hero_instance h
                      WHERE h.template_id = t.id));`,
    { wrapJson: true },
  )) as Array<{ id: string }>;
  return new Set((taken ?? []).map((r) => String(r.id)));
}

/**
 * Убрать из пула уникальных героев, которые уже кому-то достались.
 *
 * Пустой ответ невозможен: если после отсева не осталось никого, вызывающий
 * получит исходный список — лучше выдать уникального дважды, чем оставить
 * игрока без героя за сожжённую фишку. Там, где есть пул пошире, сначала
 * пробуют его (heroes-convert), и до этой развилки дело не доходит.
 */
export async function dropTakenUnique<T extends { id: string }>(candidates: T[]): Promise<T[]> {
  if (candidates.length <= 1) return candidates;
  const busy = await takenUniqueIds(candidates.map((c) => c.id));
  if (busy.size === 0) return candidates;
  const left = candidates.filter((c) => !busy.has(c.id));
  return left.length ? left : candidates;
}
