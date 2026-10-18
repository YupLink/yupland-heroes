// Выдача фишки со свободным серийником. Отдельный модуль: тут единственное
// место, где создаётся строка инвентаря из пака/гранта, и оно должно быть
// пуленепробиваемым — проверяем ФАКТ вставки, а не ответ RETURNING.
import { nanoid } from "nanoid";
import { mcpExec } from "../db/mcpClient";
import { sqlStr } from "./chips-utils";

export async function insertChipWithSerial(args: {
  wallet: string;
  collectionId: string;
  templateId: string;
  level: number;
  grantId: string;
  supply: number;
  nowIso: string;
  source?: string;
}): Promise<number | null> {
  const { wallet, collectionId, templateId, level, grantId, supply, nowIso } = args;
  const source = args.source ?? "pack_open";
  if (supply <= 0) return null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const id = `uci_${nanoid(10)}`;
    const sql = `
      INSERT INTO yuplink.user_chip_inventory
        (id, wallet, collection_id, template_id, level, source,
         source_grant_id, status, obtained_at, updated_at, serial_no)
      SELECT ${sqlStr(id)}, ${sqlStr(wallet)}, ${sqlStr(collectionId)},
             ${sqlStr(templateId)}, ${Number(level)}, ${sqlStr(source)},
             ${sqlStr(grantId)}, 'owned', ${sqlStr(nowIso)}, ${sqlStr(nowIso)},
             s.serial_no
      FROM (
        SELECT gs.n AS serial_no
        FROM generate_series(1, ${supply}) AS gs(n)
        WHERE NOT EXISTS (
          SELECT 1 FROM yuplink.user_chip_inventory u
          WHERE u.collection_id = ${sqlStr(collectionId)} AND u.serial_no = gs.n
        )
        ORDER BY random() LIMIT 1
      ) s
      ON CONFLICT (collection_id, serial_no) WHERE serial_no IS NOT NULL DO NOTHING
      RETURNING serial_no;`;
    const rows = (await mcpExec(sql, { wrapJsonCte: true })) as Array<{
      serial_no: number;
    }>;
    if (Array.isArray(rows) && rows.length > 0) {
      // RETURNING сказал «вставили» — ПРОВЕРЯЕМ, что строка реально есть.
      // Без этой проверки паки годами отдавали меньше, чем показывали:
      // за 3 дня 2940 показанных фишек против 1909 реально выданных.
      const check = (await mcpExec(
        `SELECT serial_no FROM yuplink.user_chip_inventory WHERE id = ${sqlStr(id)} LIMIT 1;`,
        { wrapJson: true },
      )) as Array<{ serial_no: number | null }>;
      if (Array.isArray(check) && check.length > 0) {
        return Number(check[0]?.serial_no ?? rows[0].serial_no);
      }
      console.warn(
        `[insertChipWithSerial] RETURNING без строки (попытка ${attempt}): ${collectionId}/${templateId}`,
      );
      continue;
    }
    // Обратный случай: вставка прошла, а ответ потерялся (обрыв SSE и ретрай
    // mcpExec). Без этой проверки следующая итерация выдала бы ВТОРУЮ фишку.
    const landed = (await mcpExec(
      `SELECT serial_no FROM yuplink.user_chip_inventory WHERE id = ${sqlStr(id)} LIMIT 1;`,
      { wrapJson: true },
    )) as Array<{ serial_no: number | null }>;
    if (Array.isArray(landed) && landed.length > 0) {
      return Number(landed[0]?.serial_no ?? 0) || null;
    }

    const free = (await mcpExec(
      `SELECT 1 FROM generate_series(1, ${supply}) AS gs(n)
        WHERE NOT EXISTS (SELECT 1 FROM yuplink.user_chip_inventory u
          WHERE u.collection_id = ${sqlStr(collectionId)} AND u.serial_no = gs.n)
        LIMIT 1;`,
      { wrapJson: true },
    )) as unknown[];
    if (!Array.isArray(free) || free.length === 0) return null;
  }
  console.warn(`[insertChipWithSerial] не удалось присвоить serial за 10 попыток: ${collectionId}`);
  return null;
}
