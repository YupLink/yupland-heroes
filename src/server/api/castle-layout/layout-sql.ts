// SQL расстановки замка (yuplink.castle_layout, migrations/castle-layout-01).
// Запись — одним оператором, проверка ревизии внутри него же:
//  · ревизия 0 — первая запись: INSERT … ON CONFLICT DO NOTHING; строка уже есть
//    (её записало другое устройство) — 0 строк;
//  · ревизия N — UPDATE … WHERE account_id AND revision = N → N + 1; ревизия уже
//    другая — 0 строк. Две записи с одной ревизией: вторая ждёт замок строки,
//    перепроверяет условие и не проходит.
// 0 строк = конфликт: ничего не записано. Актуальное читается отдельным запросом
// уже после — со свежим снимком, где видна чужая запись.
// Значения — строковыми литералами (sqlStr); layout после схемы — только числа,
// булевы и id по регулярке, кавычек и обратных косых в нём нет.
import { sqlStr } from "@/server/api/raid-shared";

export function readLayoutSql(account: string): string {
  return `SELECT revision, layout FROM yuplink.castle_layout WHERE account_id = ${sqlStr(account)}`;
}

/** Первая запись (ревизия клиента 0) → ревизия 1. */
export function insertLayoutSql(account: string, layoutJson: string, wallet: string): string {
  return `INSERT INTO yuplink.castle_layout (account_id, revision, layout, updated_at, updated_wallet)
VALUES (${sqlStr(account)}, 1, ${sqlStr(layoutJson)}::jsonb, now(), ${sqlStr(wallet)})
ON CONFLICT (account_id) DO NOTHING
RETURNING revision`;
}

/** Следующая запись: только поверх той ревизии, что видел клиент. */
export function updateLayoutSql(
  account: string,
  revision: number,
  layoutJson: string,
  wallet: string,
): string {
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("castle.layout_bad");
  return `UPDATE yuplink.castle_layout
   SET revision = revision + 1, layout = ${sqlStr(layoutJson)}::jsonb, updated_at = now(),
       updated_wallet = ${sqlStr(wallet)}
 WHERE account_id = ${sqlStr(account)} AND revision = ${revision}
RETURNING revision`;
}
