// Прочность инструмента в рюкзаке героя: удар, откат, «сколько можно унести».
//
// Правило — lib/raid/toolWear.ts (та же арифметика). Прочность живёт у стопки:
// raid_hero_backpack.wear — сколько процентов снято с текущей штуки.
//
// Удар — ОДИН оператор после лока героя `bp:<герой>` ОТДЕЛЬНЫМ оператором (как
// выдача в рюкзак и §8.17): в READ COMMITTED снимок берётся до выполнения, и
// только так вторая рубка тем же топором видит, что первая уже сняла, а повтор
// моста — ключ своей первой попытки. Ключ рубки — строка raid_tool_wear_op:
// повтор её найдёт и прочность второй раз не снимет. В ней же сколько снял
// удар — откат вернёт ровно это, даже если ответ удара потерялся.
//
// Откат ключ не удаляет, а ставит undone: опоздавшая попытка удара увидит ключ
// и ничего не снимет. Ключа нет (удар не дошёл до базы) — откат кладёт
// заглушку с той же целью. Откаченный ключ — не «удар уже был»: повтор того же
// нажатия после отказа не проходит даром (без износа), а получает отказ.
//
// Пока рубка этим инструментом «в деле» (ключ не закрыт ни settled, ни undone,
// моложе 30 с), второй удар им не бьёт — отказ «инструмент занят». Так откат —
// всегда точная обратная операция: между ударом и его откатом чужого удара по
// той же стопке не бывает (иначе доломавший соседний удар менял бы «сколько
// вернуть»). Интерфейс и так не даёт рубить двумя окнами разом.
//
// Последняя штука сломалась — строка стопки остаётся с count 0 (игроку не
// видна: чтения рюкзака берут count > 0) — откату есть что поднять. Пустые
// строки старше 10 минут и ключи старше суток убирает settleToolWear после
// удачной рубки. Изменяющие CTE — верхним уровнем (без wrapJson), JSON ответа
// собираем сами; комментарии внутри SQL — только блочные.
//
// Бьёт только основной инструмент героя (§8.24): тем же оператором под тем же
// локом — стопка удара основная (или становится ею: единственная подходящая,
// замена кончившейся лопаты), иначе удара нет и ответ main = false.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";
import { mobAfterGrowSql, mobAfterTakeSql } from "@/server/api/beta-raid/backpack-mob";
import {
  adoptSql,
  mainOkSql,
  type ToolNeedKind,
} from "@/server/api/beta-raid/main-tool/main-tool-sql";

/** Где и под каким ключом рубим: стопка инструмента героя и ключ рубки. */
export type WearAt = { heroId: string; stackKey: string; op: string };

const lockSql = (heroId: string): string =>
  `SELECT pg_advisory_xact_lock(hashtext(${sqlStr(`bp:${heroId}`)})) AS l;`;

/** Другая рубка этой стопкой ещё «в деле»: ключ не закрыт и моложе 30 с. */
const liveSql = (hero: string, key: string, op: string): string =>
  `EXISTS (SELECT 1 FROM yuplink.raid_tool_wear_op o
            WHERE o.hero_id = ${hero} AND o.stack_key = ${key} AND o.op <> ${op}
              AND NOT o.settled AND NOT o.undone AND o.at > now() - interval '30 seconds')`;

/**
 * Удар: снять `step` % с текущей штуки (дошло до 100 — штука ушла). need — что
 * нужно делу: инструмент декора (по умолчанию) или лопата (§8.24).
 */
export function hitSql(o: WearAt & { step: number; need?: ToolNeedKind }): string {
  const step = Math.min(100, Math.max(1, Math.round(o.step)));
  const [hero, key, op] = [sqlStr(o.heroId), sqlStr(o.stackKey), sqlStr(o.op)];
  const broke = `s.wear + ${step} >= 100`;
  const live = liveSql(hero, key, op);
  const main = mainOkSql(o.heroId, o.stackKey, o.need ?? "item");
  return `${lockSql(o.heroId)}
    WITH prior AS (
      SELECT EXISTS (SELECT 1 FROM yuplink.raid_tool_wear_op WHERE op = ${op} AND NOT undone) AS was,
             EXISTS (SELECT 1 FROM yuplink.raid_tool_wear_op WHERE op = ${op} AND undone) AS dead
    ),
    src AS (
      SELECT b.id, b.count, b.wear, b.mob_count
        FROM yuplink.raid_hero_backpack b
       WHERE b.hero_id = ${hero} AND b.stack_key = ${key} AND b.count >= 1
         AND NOT (SELECT was OR dead FROM prior) AND NOT ${live} AND ${main}
         FOR UPDATE
    ),
    upd AS (
      UPDATE yuplink.raid_hero_backpack b
         SET count = CASE WHEN ${broke} THEN s.count - 1 ELSE s.count END,
             wear = CASE WHEN ${broke} THEN 0 ELSE s.wear + ${step} END,
             mob_count = CASE WHEN ${broke}
                              THEN ${mobAfterTakeSql({ count: "s.count", mob: "s.mob_count" }, 1)}
                              ELSE s.mob_count END,
             updated_at = now()
        FROM src s
       WHERE b.id = s.id
      RETURNING b.count, b.wear, (${broke}) AS broke,
                LEAST(${step}, 100 - s.wear) AS taken,
                GREATEST(0, LEAST(s.mob_count, s.count) - b.mob_count) AS mob_taken
    ),
    mark AS (
      INSERT INTO yuplink.raid_tool_wear_op (op, hero_id, stack_key, taken, mob_taken)
      SELECT ${op}, ${hero}, ${key}, taken, mob_taken FROM upd
      RETURNING 1
    ),
    adopt AS (${adoptSql(o.heroId, o.stackKey, "upd")})
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT (SELECT was FROM prior) AS was, (SELECT dead FROM prior) AS dead,
             EXISTS (SELECT 1 FROM mark) AS hit,
             ${live} AS busy, ${main} AS main, EXISTS (SELECT 1 FROM adopt) AS adopted,
             EXISTS (SELECT 1 FROM yuplink.raid_hero_backpack hv
                      WHERE hv.hero_id = ${hero} AND hv.stack_key = ${key} AND hv.count >= 1) AS have,
             (SELECT count FROM upd) AS count, (SELECT wear FROM upd) AS wear,
             (SELECT broke FROM upd) AS broke
    ) _t;`;
}

/**
 * Откат удара по ключу: вернуть снятое (перешло через ноль — штука назад в
 * стопку, «с мобов» — тоже с мобов). Ключа нет — заглушка undone. Состоявшуюся
 * рубку (settled) откат не трогает.
 */
export function undoSql(o: WearAt): string {
  const [hero, key, op] = [sqlStr(o.heroId), sqlStr(o.stackKey), sqlStr(o.op)];
  const under = "b.wear < f.taken";
  const count = `CASE WHEN ${under} THEN b.count + 1 ELSE b.count END`;
  return `${lockSql(o.heroId)}
    WITH cur AS (
      SELECT op, hero_id, stack_key, taken, mob_taken, undone, settled
        FROM yuplink.raid_tool_wear_op WHERE op = ${op}
    ),
    tomb AS (
      INSERT INTO yuplink.raid_tool_wear_op (op, hero_id, stack_key, taken, undone)
      SELECT ${op}, ${hero}, ${key}, 0, true WHERE NOT EXISTS (SELECT 1 FROM cur)
      ON CONFLICT (op) DO NOTHING
      RETURNING 1
    ),
    flip AS (
      UPDATE yuplink.raid_tool_wear_op o SET undone = true
        FROM cur
       WHERE o.op = cur.op AND NOT cur.undone AND NOT cur.settled
      RETURNING cur.hero_id, cur.stack_key, cur.taken, cur.mob_taken
    ),
    back AS (
      UPDATE yuplink.raid_hero_backpack b
         SET count = ${count},
             wear = CASE WHEN ${under} THEN b.wear - f.taken + 100 ELSE b.wear - f.taken END,
             mob_count = ${mobAfterGrowSql({ count: "b.count", mob: "b.mob_count" }, "f.mob_taken", count)},
             updated_at = now()
        FROM flip f
       WHERE b.hero_id = f.hero_id AND b.stack_key = f.stack_key AND f.taken > 0
      RETURNING 1
    )
    SELECT row_to_json(_t.*) AS _row FROM (
      SELECT EXISTS (SELECT 1 FROM flip) AS flipped, EXISTS (SELECT 1 FROM back) AS back,
             EXISTS (SELECT 1 FROM tomb) AS tomb
    ) _t;`;
}

/**
 * Рубка прошла: ключ закрыт (инструмент свободен для следующей), уборка —
 * пустая строка стопки старше 10 минут, ключи рубок героя старше суток (повтор
 * моста живёт секунды).
 */
export const settleSql = (o: WearAt): string =>
  `UPDATE yuplink.raid_tool_wear_op SET settled = true WHERE op = ${sqlStr(o.op)};
   DELETE FROM yuplink.raid_hero_backpack
    WHERE hero_id = ${sqlStr(o.heroId)} AND stack_key = ${sqlStr(o.stackKey)}
      AND count <= 0 AND wear = 0 AND updated_at < now() - interval '10 minutes';
   DELETE FROM yuplink.raid_tool_wear_op
    WHERE hero_id = ${sqlStr(o.heroId)} AND at < now() - interval '1 day';`;

/** Сколько штук вида можно унести (изношенная остаётся в рюкзаке) и есть ли изношенная. */
export const movableSql = (heroId: string, stackKey: string): string =>
  `SELECT GREATEST(0, count - CASE WHEN wear > 0 THEN 1 ELSE 0 END) AS count, wear > 0 AS worn
     FROM yuplink.raid_hero_backpack
    WHERE hero_id = ${sqlStr(heroId)} AND stack_key = ${sqlStr(stackKey)} AND count > 0;`;

type HitRow = {
  was: boolean;
  /** Ключ этого удара уже откачен (или заглушка отката): повтор не бьёт даром. */
  dead?: boolean;
  hit: boolean;
  busy: boolean;
  main?: boolean;
  have?: boolean;
};

/** Исход удара: снято / инструмент занят / нечем / этот инструмент не в руках. */
export type WearHit = "ok" | "busy" | "none" | "idle";

/**
 * Снять прочность за одну рубку. "ok" — снято (этой попыткой или прошлой, чей
 * ответ потерялся: ключ уже лежит); "busy" — этим инструментом ещё идёт другая
 * рубка; "none" — целой штуки нет, рубить нечем; "idle" — в руках другой
 * инструмент (§8.24).
 */
export async function wearTool(o: WearAt & { step: number; need?: ToolNeedKind }): Promise<WearHit> {
  const row = sqlRow<HitRow>((await mcpExec(hitSql(o))) as unknown[]);
  if (row?.hit === true || row?.was === true) return "ok";
  if (row?.dead === true || row?.have === false) return "none";
  if (row?.main === false) return "idle";
  return row?.busy === true ? "busy" : "none";
}

/** Откат рубки: снятое — обратно в ту же стопку. Повтор безвреден. */
export async function undoToolWear(o: WearAt): Promise<void> {
  const row = sqlRow<{ flipped: boolean; back: boolean }>((await mcpExec(undoSql(o))) as unknown[]);
  if (row?.flipped && !row.back) {
    // Стопку выбросили целиком между ударом и откатом — возвращать некуда.
    console.warn(`[tool-wear] откат ${o.op}: стопки ${o.stackKey} у ${o.heroId} уже нет`);
  }
}

/**
 * Рубка прошла: закрыть ключ и убрать старое. Не вышло — инструмент свободен
 * через 30 с сам, строка с нулём и старые ключи безвредны.
 */
export async function settleToolWear(o: WearAt): Promise<void> {
  await mcpExec(settleSql(o)).catch(() => {});
}

/**
 * Сколько штук вида можно унести из рюкзака (0 — нечего или только изношенная)
 * и лежит ли в стопке изношенная — чтобы отказ назвал настоящую причину.
 */
export async function movableStackCount(
  heroId: string,
  stackKey: string,
): Promise<{ movable: number; worn: boolean }> {
  const rows = (await mcpExec(movableSql(heroId, stackKey), { wrapJson: true })) as Array<{
    count: number | string;
    worn: boolean | null;
  }>;
  return { movable: Math.max(0, Number(rows?.[0]?.count) || 0), worn: rows?.[0]?.worn === true };
}
