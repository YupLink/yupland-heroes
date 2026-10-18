// SQL финиша турнира: захват выплаты, места, уже выданные подарки, «готово».
// Вынесено из tour-finish.ts, чтобы порядок шагов там читался целиком.
import { sqlStr } from "../raid-shared";

/**
 * Захват: идущий → выплата. Время конца — «сейчас», если остановили раньше:
 * окно очков у всех путей одно — [started_at, ends_at).
 */
export const claimSql = (id: string): string =>
  `UPDATE yuplink.tournament
      SET status = 'paying', finished_at = now(), ends_at = LEAST(ends_at, now())
    WHERE id = ${sqlStr(id)} AND status = 'running'
    RETURNING id;`;

/**
 * Место — по счёту: 1 + сколько набрали больше (владелец, 06.10.2026: «при
 * равном счёте призы делятся поровну»). Равные стоят на одном месте k и вместе
 * занимают места k..k+n−1 — следующий за ними стоит на k+n. Одно выражение на
 * финиш и таблицу у Арены, чтобы доска и выплата не разошлись.
 */
export const PLACE_RANK = "rank() OVER (ORDER BY score DESC)";

/**
 * Места — один раз и целиком: если строки мест уже есть (прошлая попытка
 * финиша), не пишем ничего, иначе поздние очки дали бы второй расклад.
 * ON CONFLICT нет намеренно: ключ таблицы — (турнир, аккаунт) (миграция
 * tour-05); два финиша наперегонки упрутся в него ошибкой, а не тихим
 * пропуском, как и равные места на старом ключе (турнир, место).
 */
export const placesSql = (id: string): string =>
  `INSERT INTO yuplink.tournament_place (tournament_id, place, account_id, score)
   SELECT tournament_id, ${PLACE_RANK}, account_id, score
     FROM yuplink.tournament_score
    WHERE tournament_id = ${sqlStr(id)} AND score > 0
      AND NOT EXISTS (SELECT 1 FROM yuplink.tournament_place p WHERE p.tournament_id = ${sqlStr(id)});`;

/** Призовые места с игроком; равные — на одном месте. */
export const prizePlacesSql = (id: string, maxPlace: number): string =>
  `SELECT place, account_id FROM yuplink.tournament_place
    WHERE tournament_id = ${sqlStr(id)} AND place <= ${Math.max(0, Math.floor(maxPlace))}
    ORDER BY place, account_id;`;

/** Ключ повтора подарка: турнир, место, номер приза в строке. */
export const giftRef = (id: string, place: number, n: number): string => `tour:${id}:${place}:${n}`;

/**
 * Ключ подарка в ничьей: место у равных одно, поэтому к ключу места — аккаунт.
 * Одинокий на месте получает прежний ключ (giftRef).
 */
export const tieGiftRef = (id: string, place: number, n: number, account: string): string =>
  `${giftRef(id, place, n)}:${account}`;

/**
 * Подарки этого турнира, которые уже лежат — и живые, и сгоревшие: зачистка
 * дописывает к ключу сгоревшего ':x:<id>' (gifts-expire), и без учёта этого
 * повторный финиш выдал бы сгоревший приз заново.
 */
export const givenSql = (id: string): string => {
  const prefix = `tour:${id}:`;
  return `SELECT source_ref FROM yuplink.player_gift
           WHERE left(source_ref, ${prefix.length}) = ${sqlStr(prefix)};`;
};

/** Ключ из строки подарка без хвоста сгоревшего. */
export const baseRef = (sourceRef: string): string => sourceRef.split(":x:")[0] ?? sourceRef;

export const doneSql = (id: string): string =>
  `UPDATE yuplink.tournament SET status = 'done'
    WHERE id = ${sqlStr(id)} AND status = 'paying' RETURNING id;`;
