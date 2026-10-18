// Поставить предмет из рюкзака на клетку (сундук, босс-охранник): сначала
// закреп клетки, потом списание одной штуки, не вышло — снять свой закреп.
//
// takeFromBackpackStack тут не годится. Он без ключа операции: мост повторяет
// запрос вслепую, и потерянный ответ после коммита списывал ВТОРОЙ предмет. И
// он глотает ошибку базы: «списал, но ответ не дошёл» читалось как «нет в
// рюкзаке», закреп снимался — предмет пропадал вместе с клеткой.
//
// Здесь у списания свой ключ в raid_backpack_op, а закреп снимается, только
// если этот ключ заперли МЫ: тогда списания не было и уже не будет (опоздавший
// повтор увидит ключ и ничего не спишет). Ключ уже стоял — списание прошло,
// потерялся только ответ.
import { mcpExec } from "@/server/db/mcpClient";
import { sqlStr } from "@/server/api/raid-shared";
import { originCols, originSetSql, originTakeSql } from "@/server/api/beta-raid/stack-origin";
import { sqlRow } from "@/server/api/beta-raid/chest/chest-row";

/** Остаток меньше тысячной — это вся штука: пыль ячейкой не висит. */
const DUST = 0.001;

/** Строка закрепа клетки: таблица и условие «моя строка на этой клетке». */
export type CellHold = { table: string; where: string };

/** Списать одну штуку стека под ключом op. kind — стек обязан быть этого вида. */
export function takeOneSql(o: {
  heroId: string;
  stackKey: string;
  op: string;
  kind?: string;
}): string {
  const op = sqlStr(o.op);
  const kind = o.kind ? ` AND b.kind = ${sqlStr(o.kind)}` : "";
  return `WITH prior AS (
       SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${op}) AS was
     ),
     src AS (
       SELECT b.id FROM yuplink.raid_hero_backpack b
        WHERE b.hero_id = ${sqlStr(o.heroId)} AND b.stack_key = ${sqlStr(o.stackKey)}${kind}
          AND b.count >= 1
          FOR UPDATE
     ),
     claim AS (
       INSERT INTO yuplink.raid_backpack_op (op) SELECT ${op} FROM src, prior WHERE NOT prior.was
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     upd AS (
       UPDATE yuplink.raid_hero_backpack b
          SET count = b.count - 1,
              ${originSetSql(originTakeSql(originCols("b."), "b.count - 1"))},
              updated_at = now()
         FROM src, claim
        WHERE b.id = src.id AND b.count - 1 >= ${DUST}
       RETURNING 1
     ),
     del AS (
       DELETE FROM yuplink.raid_hero_backpack b USING src, claim
        WHERE b.id = src.id AND b.count - 1 < ${DUST}
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT ((SELECT was FROM prior) OR EXISTS (SELECT 1 FROM upd)
               OR EXISTS (SELECT 1 FROM del)) AS took
     ) _t;`;
}

/**
 * Запереть ключ списания и снять закреп — только если ключ заперли мы.
 * here — стоит ли закреп после оператора (читается снимком до DELETE).
 */
export function releaseSql(op: string, hold: CellHold): string {
  return `WITH blk AS (
       INSERT INTO yuplink.raid_backpack_op (op) VALUES (${sqlStr(op)})
       ON CONFLICT (op) DO NOTHING
       RETURNING 1
     ),
     del AS (
       DELETE FROM ${hold.table} WHERE ${hold.where} AND EXISTS (SELECT 1 FROM blk)
       RETURNING 1
     )
     SELECT row_to_json(_t.*) AS _row FROM (
       SELECT EXISTS (SELECT 1 FROM blk) AS blocked,
              EXISTS (SELECT 1 FROM ${hold.table} WHERE ${hold.where}) AS here
     ) _t;`;
}

/** Выполнилась ли операция с этим ключом (свежим отдельным чтением). */
export async function opDone(op: string): Promise<boolean> {
  const rows = (await mcpExec(
    `SELECT EXISTS (SELECT 1 FROM yuplink.raid_backpack_op WHERE op = ${sqlStr(op)}) AS done;`,
    { wrapJson: true },
  )) as Array<{ done: boolean }>;
  return rows?.[0]?.done === true;
}

/**
 * Списать одну штуку под закреп клетки. true — списано (в том числе прошлой
 * попыткой, чей ответ потерялся), клетка наша. false — в рюкзаке не нашлось,
 * закреп снят. Ошибка базы при неснятом закрепе летит наверх.
 */
export async function takeOneOrRelease(o: {
  heroId: string;
  stackKey: string;
  op: string;
  kind?: string;
  hold: CellHold;
}): Promise<boolean> {
  let err: unknown = null;
  try {
    const res = sqlRow<{ took: boolean }>((await mcpExec(takeOneSql(o))) as unknown[]);
    if (res?.took) return true;
  } catch (e) {
    err = e;
  }
  const rel = sqlRow<{ blocked: boolean; here: boolean }>(
    (await mcpExec(releaseSql(o.op, o.hold))) as unknown[],
  );
  // Ключ уже стоял, закреп на месте — списание прошло, потерялся только ответ.
  if (rel && !rel.blocked && rel.here) return true;
  if (err) throw err;
  return false;
}
