// Памятка сделки в op-логе (yuplink.raid_backpack_op): что именно списание
// артефактов уже унесло с прошлой попытки.
//
// ПОЧЕМУ отдельный модуль. Мост к базе повторяет запрос ВСЛЕПУЮ, и удачное
// списание на повторе выглядит как «свободных не набралось» — игрок остался бы
// и без вещей, и без денег. Памятка и есть прошлый ответ. Формат строки читают
// трое: art-stock (пишет и разбирает), market-undo-alert (диктует админу
// запрос на восстановление) и человек с psql в руках, когда возврат не прошёл.
// Разъедься эти трое — восстановить артефакт будет нечем.
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import type { ArtRef } from "./art-stock";

/** Момент времени строкой, одинаковой на обоих трактах к базе. Голый timestamptz
 *  приезжает то JS-датой, то Python-repr — в памятку и обратно годится только
 *  текст с явным часовым поясом. */
export const atText = (col: string): string =>
  `to_char(${col} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US"+00"')`;

/**
 * Разобрать памятку операции обратно в экземпляры.
 * Формат: `<префикс>id=шаблон=когда получен`; третьей части нет у строк,
 * записанных до того, как откат научился беречь место в очереди FIFO.
 */
function parseMemo(ops: string[], prefix: string): ArtRef[] {
  const out: ArtRef[] = [];
  for (const op of ops) {
    const [id, templateId, obtainedAt] = op.slice(prefix.length).split("=");
    if (id && templateId) out.push({ id, templateId, obtainedAt: obtainedAt || null });
  }
  return out;
}

/**
 * Экранировать спецсимволы LIKE: в префиксе живёт id товара вида `mkt_…`, а
 * подчёркивание в LIKE — это «любой символ». Без экранирования памятка одной
 * сделки могла бы совпасть с чужой.
 */
const likeEscape = (s: string): string => s.replace(/[\\%_]/g, "\\$&");

/**
 * Что операция уже сделала на прошлой попытке — по памятке в op-логе.
 *
 * LIKE, а не starts_with: под starts_with планировщик умеет только Seq Scan, а
 * op-лог растёт с каждой сделкой маркета. `LIKE 'префикс%'` ложится на btree с
 * text_pattern_ops (миграция migrate-backpack-op-prefix-2026-09.sql): база
 * живёт в en_US.UTF-8, и обычный индекс по op префиксный диапазон не даёт.
 */
export async function recallTaken(prefix: string): Promise<ArtRef[]> {
  const rows = (await mcpExec(
    `SELECT op FROM yuplink.raid_backpack_op
      WHERE op LIKE ${sqlStr(`${likeEscape(prefix)}%`)} ESCAPE '\\';`,
    { wrapJson: true },
  ).catch(() => [])) as Array<{ op: string }>;
  return parseMemo(
    (rows ?? []).map((r) => r.op),
    prefix,
  );
}
