// Журнал грабежа: добыча победителя до выбора и одноразовый её забор.
//
// Совместимость со второй редакцией (27.09.2026): победа над охраной сразу
// снимала сундук и опустошала сеть владельца — всё ложилось сюда строкой
// raid_chest_plunder с claimed_at IS NULL. Захвата больше нет (четвёртая
// редакция, 29.09); таблицу пишет журнал «Забрать сундук» (claimed_at сразу),
// а невыбранные записи прошлых редакций разбираются здесь. Победитель
// выбирает, что взять, ОДИН раз: забор помечает строку claimed_at и своим
// ключом claim_op. Повтор моста несёт ту же строку SQL с тем же ключом и
// проходит; второй забор с другим ключом строки уже не найдёт.
import { sqlStr } from "@/server/api/raid-shared";

/** Позиция добычи в журнале и в ответах. chest — сам сундук (первым). */
export type PlunderItem = {
  stackKey: string;
  kind: string;
  refId: string | null;
  name: string;
  image: string | null;
  count: number | string;
  chest?: boolean;
};

/** Строка журнала глазами победителя. */
export type PlunderRow = {
  id: string;
  owner_account: string;
  map_id: string;
  q: number | string;
  r: number | string;
  items: PlunderItem[] | string | null;
};

const ROW = `p.id, p.owner_account, p.map_id, p.q, p.r, p.items`;

/** Моя невыбранная добыча по id. */
export function pendingSql(id: string, raider: string): string {
  return `SELECT ${ROW} FROM yuplink.raid_chest_plunder p
           WHERE p.id = ${sqlStr(id)} AND p.raider_account = ${sqlStr(raider)}
             AND p.claimed_at IS NULL
           LIMIT 1`;
}

/** Все мои невыбранные добычи — свежие сверху. kinds — видов вместе с сундуком. */
export function pendingListSql(raider: string): string {
  return `SELECT p.id, p.owner_account, p.at, jsonb_array_length(p.items) AS kinds
            FROM yuplink.raid_chest_plunder p
           WHERE p.raider_account = ${sqlStr(raider)} AND p.claimed_at IS NULL
           ORDER BY p.at DESC
           LIMIT 20`;
}

/**
 * Забрать добычу: одноразово и под ключом вызова. Не моя, уже выбрана другим
 * вызовом или её нет — строк нет.
 */
export function claimSql(o: { id: string; raider: string; op: string }): string {
  const op = sqlStr(o.op);
  return `WITH c AS (
       UPDATE yuplink.raid_chest_plunder p
          SET claimed_at = COALESCE(p.claimed_at, now()), claim_op = ${op}
        WHERE p.id = ${sqlStr(o.id)} AND p.raider_account = ${sqlStr(o.raider)}
          AND (p.claimed_at IS NULL OR p.claim_op = ${op})
       RETURNING ${ROW}
     )
     SELECT row_to_json(c.*) AS _row FROM c;`;
}

/** Что уехало победителю — дописать в журнал после выдачи (best-effort). */
export function plunderTakenSql(
  id: string,
  taken: ReadonlyArray<{ stackKey: string; qty: number }>,
): string {
  return `UPDATE yuplink.raid_chest_plunder
             SET taken = ${sqlStr(JSON.stringify(taken))}::jsonb
           WHERE id = ${sqlStr(id)};`;
}

/** Разобрать items ответа: jsonb мост отдаёт то массивом, то строкой. */
export function plunderItems(raw: PlunderRow["items"]): PlunderItem[] {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PlunderItem[]) : [];
  } catch {
    return [];
  }
}
