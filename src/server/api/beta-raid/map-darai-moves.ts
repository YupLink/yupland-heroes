// Закладка и возврат обеспечения карты — ПАЧКОЙ.
//
// Поштучные reserveMapDarai/releaseMapDarai (darai-pools) знают про пул всё
// правильное, но стоят по два рейса к базе на объект. На боевой карте объектов
// с наградой в Darai под тысячу, и кнопка «Восстановить» на таком счёте
// думала бы минутами. Здесь те же самые движения, но одним запросом на пачку.
//
// Ключ строки собирает общий poolRef — формат ключа обязан жить в одном месте,
// иначе снятие брони не найдёт свою бронь.
import { nanoid } from "nanoid";
import { mcpExec } from "../../db/mcpClient";
import { sqlStr } from "../raid-shared";
import { poolRef } from "../darai-pools-move";

/** Сколько движений кладём в один запрос: длинная строка SQL тоже не бесплатна. */
const CHUNK = 200;

const note = (v: string) => sqlStr(v.slice(0, 500));

function chunks<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Заложить бронь под объекты карты.
 *
 * `ON CONFLICT (ref) DO NOTHING` — вся идемпотентность: транспорт к базе сам
 * повторяет оборванный запрос, и повтор не должен списать второй раз. Ref у
 * каждой закладки свой и одноразовый, поэтому «занято» тут означает ровно
 * «это наш же повтор».
 */
export async function reserveMapDaraiBulk(
  rows: Array<{ ref: string; amount: number; note: string }>,
): Promise<void> {
  const good = rows.filter((r) => Number.isFinite(r.amount) && r.amount > 0);
  for (const part of chunks(good, CHUNK)) {
    const values = part
      .map(
        (r) =>
          `(${sqlStr(`dp_${nanoid(12)}`)}, 'map', 'map_reserve', ${(-r.amount).toFixed(8)},
            ${sqlStr(poolRef("map_reserve", r.ref))}, ${note(r.note)},
            ${sqlStr(`dpm_${nanoid(12)}`)})`,
      )
      .join(",");
    await mcpExec(
      `INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
       VALUES ${values}
       ON CONFLICT (ref) DO NOTHING;`,
      { wrapJson: false },
    );
  }
}

/**
 * Снять брони: сумма берётся ИЗ САМОЙ брони, а не из аргумента — вернуть в пул
 * больше, чем оттуда брали, счёт бы не простил. Брони нет — строка не родится:
 * `INSERT ... SELECT` из пустого источника не пишет ничего.
 */
export async function releaseMapDaraiBulk(
  rows: Array<{ ref: string; note: string }>,
): Promise<void> {
  for (const part of chunks(rows, CHUNK)) {
    const values = part
      .map(
        (r) =>
          `(${sqlStr(`dp_${nanoid(12)}`)}, ${sqlStr(poolRef("map_reserve", r.ref))},
            ${sqlStr(poolRef("map_release", r.ref))}, ${note(r.note)},
            ${sqlStr(`dpm_${nanoid(12)}`)})`,
      )
      .join(",");
    await mcpExec(
      `INSERT INTO yuplink.darai_pool_move (id, pool, kind, amount, ref, note, op_id)
       SELECT v.new_id, r.pool, 'map_release', -r.amount, v.rel_ref, v.note, v.op_id
         FROM (VALUES ${values}) AS v(new_id, res_ref, rel_ref, note, op_id)
         JOIN yuplink.darai_pool_move r ON r.ref = v.res_ref AND r.kind = 'map_reserve'
       ON CONFLICT (ref) DO NOTHING;`,
      { wrapJson: false },
    );
  }
}
