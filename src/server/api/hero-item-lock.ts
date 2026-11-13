// Замок КОПИИ героя (строка user_game_item, kind='hero').
//
// Всё, что заводит экземпляр копии (пробуждение — heroes-wake, первая прокачка —
// heroes-shared.createHeroAtomic), и ломбард, который копию снимает
// (beta-raid/hero-pawn-sql), встают в одну очередь по этому ключу. Без него
// спящего будили в тот же миг, когда его сдавали: экземпляр появлялся у уже
// удалённой копии, и проданный герой оставался ходить по карте.
//
// Ключ свой ('heroitem:'), а не замок героя (hero-rest.heroLockSql, 'hero:' + id
// экземпляра): у спящего экземпляра ещё нет — запереть его не на чем.
// Отдельным оператором перед основным, как и heroLockSql: следующий оператор
// строки берёт снимок уже ПОСЛЕ замка и видит закоммиченное соседом.
import { sqlStr } from "./raid-shared";

export const heroItemLockSql = (itemId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`heroitem:${itemId}`)})) AS l;`;
